// Simulated events: each one lands data the way a bank feed, a brokerage or Venmo would (a txn, a
// balance, a price move), then real logic reads the whole state to decide what it means, and Dime
// reacts once through the usual event path (facts in, the model's words out, template fallback,
// every number checked). Cards are proposals; nothing moves money before Approve.
import { state, id, type FundId, type Txn } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fund } from "./funds-data.ts";
import { speak, post, usd, day } from "./voice.ts";
import { detect, checking, trends, EVENT_OUTCOMES, type Proposal } from "./cfo.ts";
import { summary } from "./summary.ts";
import type { ProposalState } from "./apps/proposal.ts";

const DAY = 86_400_000;
const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
const cents = (n: number) => Math.round(n * 100) / 100;
const today = () => money.today(state, now());
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const weekday = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" });
const clockTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fundOf = () => state.user.fund ?? "VOO";

// ---- ingestion ------------------------------------------------------------------------------

/** Moves today's balance point for `account` by `delta` (adds one if the last is an earlier day). */
export function bank(account: "checking" | "savings", delta: number) {
  const hist = state.balances.filter((b) => b.account === account);
  const last = hist.at(-1);
  if (!last) return;
  const day = now().toISOString().slice(0, 10); // same key cfo.ts's debitChecking uses
  if (last.at === day) last.balance = cents(last.balance + delta);
  else state.balances.push({ account, at: day, balance: cents(last.balance + delta) });
}
export const balance = (account: "checking" | "savings") =>
  state.balances.filter((b) => b.account === account).at(-1)?.balance ?? 0;

/** A txn as the bank feed delivers it: stored, and checking moves with it. */
export function ingest(t: Omit<Txn, "id" | "at"> & { at?: string }): Txn {
  const txn: Txn = { id: id(), at: now().toISOString(), ...t };
  state.txns.push(txn);
  bank("checking", txn.kind === "income" || txn.kind === "refund" ? txn.amount : -txn.amount);
  return txn;
}

// ---- reading the data -----------------------------------------------------------------------

const RULES: [RegExp, string][] = [
  [/coffee|café|cafe|espresso|blue bottle|philz|sightglass|starbucks|peet|ritual|matcha|boba|tea\b/i, "coffee"],
  [/trader joe|whole foods|safeway|grocery|market|costco|instacart|sprouts|rainbow|berkeley bowl/i, "groceries"],
  [/doordash|uber eats|grubhub|caviar|postmates|pizza|taco|burger|sushi|ramen|thai|kitchen|grill|bistro|restaurant|deli|sweetgreen|chipotle|tartine/i, "food"],
  [/uber|lyft|clipper|muni|bart|caltrain|shell|chevron|parking|spothero|waymo|hertz|airline|united|delta|alaska/i, "transport"],
  [/airbnb|hotel|marriott|hilton|expedia|booking/i, "travel"],
  [/amc|cinema|theater|theatre|ticket|fillmore|concert|bar\b|pub|brewery|club|stubhub|museum/i, "fun"],
  [/amazon|target|uniqlo|zara|h&m|nike|apple|best buy|walgreens|cvs|sephora|ikea|rei|etsy|shop|store/i, "shopping"],
  [/netflix|hulu|spotify|disney|max\b|youtube|icloud|patreon|subscription|\.com\/bill/i, "subscriptions"],
  [/barber|salon|spa|nails|gym|fitness|yoga|climb/i, "personal"],
];
/** A merchant's category: how Charles's own history files it, else its name, else "other". */
export function categorize(merchant: string): string {
  const m = merchant.toLowerCase();
  const seen = state.txns.filter((t) => t.kind === "spend" && (t.merchant.toLowerCase() === m || m.startsWith(t.merchant.toLowerCase())));
  if (seen.length) {
    const n: Record<string, number> = {};
    for (const t of seen) n[t.category] = (n[t.category] ?? 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
  }
  return RULES.find(([re]) => re.test(merchant))?.[1] ?? "other";
}

/** What Charles usually pays here (median of past charges at the merchant, else its category), or
 *  null with too little history. Used to notice a purchase that's out of character. */
export function usual(txn: Pick<Txn, "id" | "merchant" | "category">): { amount: number; at: "merchant" | "category" } | null {
  const past = state.txns.filter((t) => t.kind === "spend" && t.id !== txn.id);
  const here = past.filter((t) => t.merchant.toLowerCase() === txn.merchant.toLowerCase()).map((t) => t.amount);
  if (here.length >= 3) return { amount: cents(median(here)), at: "merchant" };
  const cat = past.filter((t) => t.category === txn.category).map((t) => t.amount);
  return cat.length >= 5 ? { amount: cents(median(cat)), at: "category" } : null;
}
/** A purchase at least 3x (and $30 over) the usual, in words for the facts; "" when it's normal. */
export function unusual(txn: Txn): string {
  const u = usual(txn);
  if (!u || txn.amount < u.amount * 3 || txn.amount - u.amount < 30) return "";
  const x = Math.round(txn.amount / u.amount);
  return `That's unusual: about ${x}x what he usually spends ${u.at === "merchant" ? `at ${txn.merchant}` : `on ${txn.category}`} (usually ${usd(u.amount)}).`;
}

/** An earlier charge with the same merchant and amount within 10 minutes: a likely double charge.
 *  Under $15 it's usually a second coffee, not a glitch, so small repeats pass. */
export const duplicateOf = (txn: Txn) =>
  txn.amount >= 15 &&
  state.txns.find((t) => t !== txn && t.kind === "spend" && t.merchant === txn.merchant && t.amount === txn.amount &&
    Math.abs(new Date(t.at).getTime() - new Date(txn.at).getTime()) <= 10 * 60_000);

/** Why a charge looks like it isn't Charles's: a merchant he's never used, an hour he's never
 *  swiped at, an amount with odd cents above $50. Two or more reasons = ask him. */
export function suspicion(txn: Txn): string[] {
  const past = state.txns.filter((t) => t !== txn && t.kind === "spend");
  const why: string[] = [];
  if (!past.some((t) => t.merchant.toLowerCase() === txn.merchant.toLowerCase())) why.push(`he has never paid ${txn.merchant} before (90 days of history)`);
  const h = new Date(txn.at).getHours();
  const atHour = past.filter((t) => new Date(t.at).getHours() === h).length;
  if (atHour === 0) why.push(`it posted at ${clockTime(new Date(txn.at))}, an hour he has never made a purchase at`);
  if (txn.amount >= 50 && !Number.isInteger(txn.amount)) why.push(`odd amount (${usd(txn.amount)})`);
  return why;
}

/** Next payday from the paycheck rhythm in the feed (last two Payroll deposits), else null. */
export function nextPayday(at = now()): Date | null {
  const pay = state.txns.filter((t) => t.kind === "income" && t.merchant === "Payroll" && new Date(t.at) <= at).map((t) => new Date(t.at).getTime()).sort();
  if (pay.length < 2) return null;
  // The rhythm: the gap between the last deposit and the one before it at least a week earlier.
  const prev = [...pay].reverse().find((t) => pay.at(-1)! - t >= 7 * DAY);
  const every = prev ? pay.at(-1)! - prev : 14 * DAY;
  let next = pay.at(-1)! + every;
  while (next <= at.getTime()) next += every;
  return new Date(next);
}

/** Checking's runway to the next payday: balance less bills due before it less his usual card
 *  spend per day (last 30 days) until then. */
export function runway(at = now()) {
  const pay = nextPayday(at) ?? new Date(at.getTime() + 14 * DAY);
  const days = Math.ceil((pay.getTime() - at.getTime()) / DAY);
  const bills = state.upcoming.filter((b) => new Date(b.at) > at && new Date(b.at) < pay);
  const spend30 = sum(state.txns.filter((t) => t.kind === "spend" && !t.covered && at.getTime() - new Date(t.at).getTime() < 30 * DAY && new Date(t.at) <= at));
  const perDay = Math.round(spend30 / 30);
  const left = Math.round(balance("checking") - sum(bills) - perDay * days);
  return { pay, days, bills, billsTotal: cents(sum(bills)), perDay, left };
}
const CUSHION = 500;

/** Under the day's number N days running, counting back from yesterday (a no-spend day counts). */
export function streak(at = now()) {
  let n = 0;
  for (let d = 1; d < 120; d++) {
    const day = new Date(money.dayStart(at).getTime() - d * DAY + DAY / 2);
    if (money.over(state, day) > 0 || day < new Date(state.txns[0]?.at ?? at)) break;
    n++;
  }
  return n;
}

// ---- the events -----------------------------------------------------------------------------

const card = (p: Omit<ProposalState, "status" | "outcome" | "artifact"> & { artifact?: ProposalState["artifact"] }) => open("proposal", p);
const findFor = (key: string): Proposal | undefined => detect().find((p) => p.key === key);

/** Paycheck lands. The plan: bills still to come are already set aside, a slice invested (a card),
 *  the rest is the daily number. Pay beyond the month's plan raises today's number at once. */
export function paycheck(b: { amount?: number } = {}) {
  const amount = Number(b.amount) || 5425;
  const before = today();
  ingest({ merchant: "Payroll", amount, category: "income", kind: "income" });
  const after = today();
  const at = now();
  const month = state.upcoming.filter((u) => new Date(u.at) > at && new Date(u.at).getMonth() === at.getMonth());
  const invest = Math.floor((amount * 0.15) / 50) * 50;
  state.month.invest += invest; // what today would be after investing it (undone below)
  const ifInvested = today();
  state.month.invest -= invest;
  const f = fundOf();
  const app = card({
    find: "invest", key: `invest:${at.toISOString()}`, amount: invest, to: f,
    title: "Paycheck plan",
    summary: `Put ${usd(invest)} of it in the ${fund(f).name}? The rest stays in your daily number.`,
    artifact: { name: fund(f).name, note: `15% of ${usd(amount)}`, now: usd(invest) },
    verb: `Invest ${usd(invest)}`, working: `Approved · investing ${usd(invest)}`, declined: "Not this time. It all stays in your daily number.",
  });
  const plan = after > before
    ? `It's beyond the ${usd(state.month.income)} of pay the month planned on, so it's new money: today's number goes from ${usd(before)} to ${usd(after)}.`
    : `The month's plan already counted it (${usd(state.month.income)} of pay), so today's number stays ${usd(after)}.`;
  return speak("dime",
    `Payday: ${usd(amount)} from Payroll just landed in Chase Checking (now ${usd(balance("checking"))}). ${plan} Bills still to come this month, already set aside: ${usd(cents(sum(month)))} (${month.map((u) => u.merchant).join(", ")}). You propose investing ${usd(invest)} (15%) in the ${fund(f).name}; if he approves, today's number becomes ${usd(ifInvested)}. The rest is his to spend. A proposal card with the invest ask follows your words; don't ask it yourself.`,
    [`payday 🎉 ${usd(amount)} just landed`, after > before ? `bonus check energy: today went from ${usd(before)} to ${usd(after)}` : `bills are already covered, so it's all good. want a slice invested?`, app]);
}

/** A refund posts against an earlier purchase (the latest shopping one by default): today goes up. */
export function refund(b: { merchant?: string } = {}) {
  const from = [...state.txns].reverse().find((t) => t.kind === "spend" && !t.covered && (b.merchant ? t.merchant === b.merchant : t.category === "shopping"));
  if (!from) throw new Error("nothing to refund");
  const before = today();
  ingest({ merchant: from.merchant, amount: from.amount, category: from.category, kind: "refund" });
  const after = today();
  return speak("dime",
    `${from.merchant} refunded ${usd(from.amount)} for his ${day(new Date(from.at))} purchase. Refunds count back into today: today's number goes from ${usd(before)} to ${usd(after)}.`,
    [`the ${from.merchant} refund came through ✨ ${usd(from.amount)} back`, `so you've got ${usd(after)} today now. don't spend it all in one place lol`]);
}

/** The same charge twice within minutes: flag it, offer to dispute. */
export function duplicate(b: { merchant?: string; amount?: number } = {}) {
  const merchant = b.merchant || "Uber";
  const amount = Number(b.amount) || 23.4;
  const category = categorize(merchant);
  ingest({ merchant, amount, category, kind: "spend", at: new Date(now().getTime() - 2 * 60_000).toISOString() });
  return flag(ingest({ merchant, amount, category, kind: "spend" }));
}

/** A charge that doesn't look like Charles: never-seen merchant, odd hour, odd amount. */
export function suspicious(b: { merchant?: string; amount?: number } = {}) {
  const merchant = b.merchant || "VLTX*DIGITAL SVCS 8442";
  const amount = Number(b.amount) || 83.17;
  const t = new Date(money.dayStart(now()).getTime() + (3 * 60 + 14) * 60_000); // posted 3:14 AM
  return flag(ingest({ merchant, amount, category: categorize(merchant), kind: "spend", at: t.toISOString() }));
}

/** Every new card charge passes through here (events.purchase too): a double charge or one that
 *  doesn't look like Charles gets Dime's question and a card instead of the usual swipe line. */
export function flag(txn: Txn) {
  const first = duplicateOf(txn);
  if (first) {
    const { merchant, amount } = txn;
    const mins = Math.max(1, Math.round(Math.abs(new Date(txn.at).getTime() - new Date(first.at).getTime()) / 60_000));
    const app = card({
      find: "dispute", key: `dispute:${txn.id}`, merchant, amount,
      title: `${merchant} charged twice`,
      summary: `Same ${usd(amount)}, ${mins} minute${mins === 1 ? "" : "s"} apart. Dispute the second one?`,
      artifact: { name: merchant, note: `${clockTime(new Date(first.at))} and ${clockTime(new Date(txn.at))}`, now: `2 × ${usd(amount)}` },
      verb: "Dispute it", no: "Leave it", working: `Approved · disputing with ${merchant}`, declined: "Left it. Both charges stand.",
    });
    return speak("dime",
      `Two identical ${merchant} charges just posted, ${usd(amount)} each, ${mins} minute${mins === 1 ? "" : "s"} apart: the second is almost certainly a double charge. Both count against today right now: ${usd(today())} left. A card follows your words asking whether to dispute the second one; don't ask it yourself.`,
      [`umm ${merchant} charged you ${usd(amount)} twice, ${mins} minute${mins === 1 ? "" : "s"} apart 🤨 pretty sure one's a glitch`, app]);
  }
  const why = suspicion(txn);
  if (why.length < 2) return null;
  const { merchant, amount } = txn;
  const t = new Date(txn.at);
  const app = card({
    find: "freeze", key: `freeze:${txn.id}`, merchant, amount,
    title: "Was this you?",
    summary: `${usd(amount)} at ${merchant}, ${clockTime(t)}. Freeze the card and dispute it?`,
    artifact: { name: merchant, note: `New merchant · ${clockTime(t)}`, now: usd(amount) },
    verb: "Freeze card", no: "It was me", working: "Approved · freezing your card", declined: "Got it, it was you. Nothing changed.",
  });
  return speak("dime",
    `A charge just posted that doesn't look like Charles: ${usd(amount)} at ${merchant}. Why it's odd: ${why.join("; ")}. It's already counted against today (${usd(today())} left); freezing and disputing gets it back. A card follows your words asking "was this you?" with Freeze card / It was me; keep it short and calm, don't ask it yourself.`,
    [`hey, quick one: ${usd(amount)} at ${merchant} at ${clockTime(t)}. that you? doesn't look like you 👀`, app]);
}

/** A free trial is about to convert (the trial-end notice lands): the CFO's trial find, as a card. */
export function trial(b: { merchant?: string } = {}) {
  const sub = state.subscriptions.find((s) => s.trialEnds && (!b.merchant || s.merchant === b.merchant));
  if (!sub) throw new Error("no free trial running");
  const ends = new Date(money.dayStart(now()).getTime() + 2 * DAY);
  sub.trialEnds = ends.toISOString();
  const p = findFor(`unused:${sub.merchant}`);
  if (!p) return;
  const app = open("proposal", p);
  const opened = Math.floor((now().getTime() - new Date(sub.lastUsed).getTime()) / DAY);
  return speak("dime",
    `${sub.merchant}'s free trial converts ${weekday(ends)} (${day(ends)}) to ${usd(sub.price)}/mo. He last opened it ${day(new Date(sub.lastUsed))} (${opened} days ago), the night he signed up, never since. A card follows your words offering to cancel before it charges; don't ask it yourself.`,
    [`your ${sub.merchant} trial starts charging ${usd(sub.price)}/mo on ${weekday(ends)}`, `and you opened it like once 💀 kill it?`, app]);
}

/** A bill posts higher than its history (Verizon's autopay discount ended): the CFO's bill find. */
export function billHike(b: { merchant?: string; amount?: number } = {}) {
  const merchant = b.merchant || "Verizon";
  const amount = Number(b.amount) || 65;
  ingest({ merchant, amount, category: "bills", kind: "bill" });
  state.upcoming = state.upcoming.filter((u) => u.merchant !== merchant); // it posted
  const sub = state.subscriptions.find((s) => s.merchant === merchant);
  if (sub) sub.price = amount;
  const p = findFor(`bill:${merchant}`);
  if (!p) return; // in line with its history: nothing worth a text
  const app = open("proposal", p);
  const months = state.txns.filter((t) => t.kind === "bill" && t.merchant === merchant).length - 1;
  return speak("dime",
    `${merchant}'s bill just posted at ${usd(amount)}. The last ${months} were ${usd(p.was!)}: ${usd(p.amount!)} more, nothing else changed on his plan. A card follows your words offering to call and get it back down; don't ask it yourself.`,
    [`${merchant} quietly bumped you from ${usd(p.was!)} to ${usd(amount)} 😑 that's ${usd(p.amount!)} more for nothing`, app]);
}

/** A big payment leaves checking (the Sapphire autopay): if the runway to payday goes under the
 *  cushion, a heads-up with a move-from-savings card. */
export function lowBalance(b: { amount?: number } = {}) {
  // The statement (Japan flights, on the travel card for points), sized to leave ~$1,480 in checking.
  const amount = Number(b.amount) || Math.max(1000, Math.round(balance("checking") - 1480));
  ingest({ merchant: "Chase Sapphire autopay", amount, category: "transfer", kind: "transfer" });
  const r = runway();
  if (r.left >= CUSHION) return; // plenty until payday: nothing worth a text
  const move = Math.ceil((CUSHION - r.left) / 500) * 500;
  const app = card({
    find: "topup", key: `topup:${now().toISOString()}`, amount: move,
    title: "Checking runs low",
    summary: `Move ${usd(move)} from savings so nothing bounces before payday?`,
    artifact: { name: "Chase Checking", note: `Payday ${day(r.pay)}`, now: usd(balance("checking")) },
    verb: `Move ${usd(move)}`, working: `Approved · moving ${usd(move)}`, declined: "Not now. I'll watch it.",
  });
  return speak("dime",
    `Heads-up: the Chase Sapphire autopay just took ${usd(amount)}, leaving ${usd(balance("checking"))} in checking. Before payday (${day(r.pay)}, ${r.days} days) he has ${usd(r.billsTotal)} of bills due (${r.bills.map((x) => x.merchant).join(", ")}) and usually spends about ${usd(r.perDay)} a day, which would leave him ${r.left < 0 ? `about ${usd(-r.left)} short` : `only about ${usd(r.left)}`}: too close. Savings has ${usd(balance("savings"))}. A card follows your words offering to move ${usd(move)} from savings; don't ask it yourself. Calm, not alarming.`,
    [`ok heads up, the Sapphire autopay took ${usd(amount)} and checking's down to ${usd(balance("checking"))} 🫣`, `that's cutting it close till payday ${day(r.pay)}. I've got an idea 👇`, app]);
}

/** A fund Charles holds moves X% today. Calm, long-term, education not advice. */
export function market(b: { fund?: FundId; pct?: number } = {}) {
  const held = summary().invested.funds;
  const pick = held.find((f) => f.id === b.fund) ?? held.find((f) => f.id === "QQQ") ?? held[0];
  if (!pick) throw new Error("no funds held");
  const pct = Number(b.pct) || -4.2;
  const moved = cents((pick.value * Math.abs(pct)) / 100);
  const name = fund(pick.id as FundId).name;
  const down = pct < 0;
  return speak("dime",
    `Market move: the ${name} (${pick.ticker || pick.id}) ${down ? "fell" : "rose"} ${Math.abs(pct)}% today. Charles holds ${usd(pick.value)} in it, so it's about ${usd(moved)} ${down ? "lighter" : "heavier"} on paper. He's investing for years, not days; one-day moves like this are normal for a fund like it. Explain calmly in one or two short lines: no panic, no hype, no prediction, nothing he should do. Education, not advice.`,
    down
      ? [`${name} had a rough day, down ${Math.abs(pct)}%. you're about ${usd(moved)} lighter on paper`, `totally normal for it tho. you're in for years, not days 🧘`]
      : [`${name} popped ${pct}% today, you're up ${usd(moved)} on paper 📈`, `fun, but don't get attached. years are what count`]);
}

const MILESTONES = [50, 75, 90];
/** September's round-ups land in the goal; crossing 50/75/90% gets a hype line. */
export function milestone() {
  const g = money.activeGoal(state);
  const was = money.pct(state);
  const next = MILESTONES.find((m) => m > was);
  if (!next) throw new Error("goal is past 90%");
  const amount = Math.ceil((g.price * next) / 100) - g.saved;
  g.saved += amount; // below 90%: stays on the active goal
  const app = open("goal", { id: g.id, delta: amount, source: "round-ups" });
  return speak("dime",
    `Round-ups from his card (spare change to the dollar) just added ${usd(amount)} to the ${g.name} ${g.emoji}. That crosses ${next}%: ${usd(g.saved)} of ${usd(g.price)}. Hype it in one short line. The goal card follows your words.`,
    [`your round-ups just pushed the ${g.name} past ${next}% 🎉 spare change is doing numbers`, app]);
}

/** Under-budget streak lengths worth a text (events.ts midnight, the demo's streak button). */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30];

/** End-of-day check: a run of days under the number gets a short hype line. */
export function underStreak() {
  const n = streak();
  if (!STREAK_MILESTONES.includes(n)) return; // only milestone lengths are worth a text
  return speak("dime", `He has come in under his daily number ${n} days in a row. One short hype line, no lecture.`, [n >= 14 ? `${n} days under your number. who even are you 🔥` : `${n} days in a row under your number 🔥 keep it going`]);
}

/** Sam pays Charles back on Venmo (he fronted the Uber): counts like a refund, today goes up. */
export function venmoPaid(b: { who?: "Penny" | "Maya" | "Sam"; amount?: number; for?: string } = {}) {
  const who = b.who || "Sam";
  const amount = Number(b.amount) || 32;
  const what = b.for || "the Uber home Friday";
  const before = today();
  ingest({ merchant: `Venmo · ${who}`, amount, category: "transport", kind: "refund" });
  post({ thread: "group", direction: "out", sender: who, body: `sent you $${amount} for ${what} 🫡` });
  return speak("dime", `${who} just paid Charles back ${usd(amount)} on Venmo for ${what}. It counts back into today: ${usd(before)} → ${usd(today())}.`,
    [`${who} finally paid you back ${usd(amount)} 🤝 it's back in today`]);
}

/** Maya requests money on Venmo: Dime shows what it does to today; paying it is a card. */
export function venmoRequest(b: { who?: "Penny" | "Maya" | "Sam"; amount?: number; for?: string } = {}) {
  const who = b.who || "Maya";
  const amount = Number(b.amount) || 26;
  const what = b.for || "brunch at Zazie";
  const left = today();
  const app = card({
    find: "pay", key: `pay:${who}:${now().toISOString()}`, merchant: `Venmo · ${who}`, amount,
    title: `${who} requested ${usd(amount)}`,
    summary: `For ${what}. Pay it from today's number?`,
    artifact: { name: `Venmo · ${who}`, note: what, now: usd(amount) },
    verb: `Pay ${who}`, working: `Approved · paying ${who}`, declined: "Not yet. It stays in your requests.",
  });
  return speak("dime", `${who} requested ${usd(amount)} on Venmo for ${what}. Paying it comes out of today: ${usd(left)} → ${usd(Math.max(0, left - amount))}. A card follows your words offering to pay; don't ask it yourself.`,
    [`${who}'s asking for ${usd(amount)} for ${what} 👀 want me to send it?`, app]);
}

/** Sunday: the week in one bundle. Numbers in the DM; only pass/fail and streaks in the group. */
export function weeklyRecap() {
  const at = now();
  const end = money.dayStart(at);
  const start = new Date(end.getTime() - 7 * DAY);
  const week = state.txns.filter((t) => t.kind === "spend" && !t.covered && new Date(t.at) >= start && new Date(t.at) < end);
  const total = Math.round(sum(week));
  const by: Record<string, number> = {};
  for (const t of week) by[t.category] = (by[t.category] ?? 0) + t.amount;
  const [top, topAmt] = Object.entries(by).sort((a, b) => b[1] - a[1])[0] ?? ["nothing", 0];
  let under = 0;
  for (let d = 1; d <= 7; d++) if (money.over(state, new Date(end.getTime() - d * DAY + DAY / 2)) === 0) under++;
  const swept = Math.round(sum(state.sweeps.filter((s) => new Date(s.at) >= start && new Date(s.at) < end)));
  const hot = trends(at)[0];
  const n = streak(at);
  const dm = speak("dime",
    `Weekly recap (${day(start)} to ${day(new Date(end.getTime() - 1))}): card spend ${usd(total)}, biggest category ${top} (${usd(Math.round(topAmt))}); under his number ${under} of 7 days; ${usd(swept)} swept to the ${money.activeGoal(state).name}, now ${money.pct(state)}%.${hot ? ` Running hot this month: ${hot.category}, ${usd(hot.per_day_now)}/day vs ${usd(hot.per_day_last_month)}/day last month.` : ""} Two or three short lines, the one thing to notice last.`,
    [`ok your week: ${under} of 7 days under your number, honestly solid`, `${usd(swept)} went to the ${money.activeGoal(state).name}, you're at ${money.pct(state)}% ${money.activeGoal(state).emoji}`, `${top} was the big one at ${usd(Math.round(topAmt))}. we can work on that`]);
  const sam = state.friends.find((f) => f.name === "Sam")?.streak ?? 0;
  const group = speak("group",
    `Weekly scoreboard for the group. Charles: ${under} of 7 days under budget, a ${n}-day streak. Sam: ${sam}-day no-spend streak. No dollar amounts or balances in the group. One or two playful lines, address everyone.`,
    [`weekly scoreboard 🏆 Charles ${under}/7 days under, ${n}-day streak`, `Sam's on a ${sam}-day no-spend run. Penny… we'll talk`], 0, `${under} 7 ${n} ${sam}`);
  return Promise.all([dm, group]);
}

// ---- approved cards -------------------------------------------------------------------------

/** Gives back a disputed charge: a provisional credit, so today goes back up. */
function credit(s: ProposalState, label: string) {
  ingest({ merchant: `${s.merchant} (${label})`, amount: s.amount!, category: categorize(s.merchant!), kind: "refund" });
}
const NEW_CARD_DAYS = 4;
Object.assign(EVENT_OUTCOMES, {
  dispute: (s) => {
    credit(s, "disputed");
    return { outcome: { text: `Disputed. ${usd(s.amount!)} credited back.`, money: usd(s.amount!) },
      lines: [`done, the double charge is disputed and your ${usd(s.amount!)} is back ✅`] };
  },
  freeze: (s) => {
    credit(s, "disputed");
    const arrives = new Date(money.dayStart(now()).getTime() + NEW_CARD_DAYS * DAY);
    return { outcome: { text: `Card frozen. ${usd(s.amount!)} disputed.`, money: usd(s.amount!) },
      lines: [`card's frozen 🧊 ${usd(s.amount!)} credited back while they look into it`, `new card ${weekday(arrives)}. Apple Pay works till then`] };
  },
  topup: (s) => {
    bank("savings", -s.amount!);
    bank("checking", s.amount!);
    return { outcome: { text: `Moved ${usd(s.amount!)} from savings.`, money: usd(s.amount!) },
      lines: [`done, checking's back to ${usd(balance("checking"))}. you're good till payday 🫡`] };
  },
  invest: (s) => {
    const f = s.to as FundId;
    state.month.invest += s.amount!;
    bank("checking", -s.amount!);
    state.ledger.push({ fund: f, amount: s.amount!, at: now().toISOString(), reason: "paycheck" });
    return { outcome: { text: `${usd(s.amount!)} → ${fund(f).name}`, money: usd(s.amount!) },
      lines: [`${usd(s.amount!)} is in the ${fund(f).name} now 📈 future you says thanks`] };
  },
  pay: (s) => {
    ingest({ merchant: s.merchant!, amount: s.amount!, category: "food", kind: "spend" });
    return { outcome: { text: `Paid ${usd(s.amount!)}.`, money: usd(s.amount!) }, lines: [`paid ✅ you've got ${usd(today())} left for today`] };
  },
} satisfies typeof EVENT_OUTCOMES);

/** Demo panel actions (POST /api/demo/<name>). */
export const EVENTS: Record<string, (b: any) => unknown> = {
  paycheck, refund, duplicate, suspicious, trial, "bill-hike": billHike, "low-balance": lowBalance, market,
  milestone, streak: underStreak, "venmo-paid": venmoPaid, "venmo-request": venmoRequest, "weekly-recap": weeklyRecap,
};
