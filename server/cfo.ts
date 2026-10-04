// The CFO: detectors over the data find things worth fixing, each proposed as a `proposal` card,
// and it carries out what Charles approves. Nothing moves before Approve. The detectors read only
// the state: bill history (txns of kind "bill"), state.subscriptions (price, last used, trial end),
// state.balances (daily checking history) and card spend. Different data, different finds.
import { state, type App } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fund } from "./funds-data.ts";
import { say, speak, usd, day } from "./voice.ts";
import type { Find, ProposalState } from "./apps/proposal.ts";

const DAY = 86_400_000;
const WORK_MS: Partial<Record<Find, number>> = { bill: 3200, unused: 1600, idle: 1400, savings: 900, move: 1400 };
// Thresholds. A bill "went up" when its latest charge beats the one before by both; a subscription
// is unused past UNUSED_DAYS, or about to convert when its trial ends within TRIAL_DAYS; checking
// keeps a cushion of IDLE.cushion × a month of bills and the rest of its IDLE.window-day low is
// idle, moved in IDLE.step dollars; a spend category is hot when this month's daily pace beats last
// month's by TREND.pct (and is at least TREND.min so far).
const HIKE = { dollars: 5, pct: 0.1 };
const UNUSED_DAYS = 30;
const TRIAL_DAYS = 7;
const IDLE = { window: 60, cushion: 1.5, step: 500 };
const TREND = { pct: 0.3, min: 50 };
const NOT_NOW = "Not now. I'll check again next month.";

const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
const fundName = (f = state.user.fund) => (f ? fund(f).name : null);
const ago = (iso: string, at = now()) => Math.floor((at.getTime() - new Date(iso).getTime()) / DAY);
const span = (d: number) => (d >= 14 ? `${Math.floor(d / 7)} weeks` : `${d} days`);

export type Proposal = Omit<ProposalState, "status" | "outcome">;

/** Each recurring bill's charges up to `at`, oldest first. */
export function billHistory(at = now()) {
  const by = new Map<string, { at: string; amount: number }[]>();
  for (const t of state.txns)
    if (t.kind === "bill" && new Date(t.at) <= at) {
      if (!by.has(t.merchant)) by.set(t.merchant, []);
      by.get(t.merchant)!.push({ at: t.at, amount: t.amount });
    }
  for (const xs of by.values()) xs.sort((a, b) => a.at.localeCompare(b.at));
  return by;
}

/** Bills whose latest charge jumped over the one before. */
function billHikes(): Proposal[] {
  const out: Proposal[] = [];
  for (const [merchant, xs] of billHistory()) {
    if (xs.length < 2) continue;
    const was = xs.at(-2)!.amount;
    const is = xs.at(-1)!.amount;
    if (is - was < HIKE.dollars || is < was * (1 + HIKE.pct)) continue;
    out.push({
      find: "bill", key: `bill:${merchant}`, merchant, was, amount: is - was,
      title: `${merchant} went up`,
      summary: `Same bill, ${usd(is - was)} more than last time. Want me to call and get it back down?`,
      artifact: { name: merchant, was: usd(was), now: `${usd(is)}/mo`, delta: `+${usd(is - was)}` },
      verb: `Call ${merchant}`,
      working: `Approved · calling ${merchant}`,
      declined: NOT_NOW,
    });
  }
  return out;
}

/** Subscriptions still charging but not used in UNUSED_DAYS, or a free trial about to convert. */
function unusedSubs(at = now()): Proposal[] {
  const out: Proposal[] = [];
  for (const s of state.subscriptions ?? []) {
    const per = s.cadence === "yearly" ? "yr" : "mo";
    const base = { find: "unused" as const, key: `unused:${s.merchant}`, merchant: s.merchant, amount: s.price,
      verb: `Cancel ${s.merchant}`, working: `Approved · cancelling ${s.merchant}`, declined: NOT_NOW };
    const trial = s.trialEnds ? -ago(s.trialEnds, at) : -1; // days until the trial ends
    if (trial >= 0 && trial <= TRIAL_DAYS)
      out.push({ ...base, title: `${s.merchant} trial ends ${day(new Date(s.trialEnds!))}`,
        summary: `Then it's ${usd(s.price)} a ${per === "yr" ? "year" : "month"}. Cancel before it charges?`,
        artifact: { name: s.merchant, note: `Free until ${day(new Date(s.trialEnds!))}`, now: `${usd(s.price)}/${per}` } });
    else if (ago(s.lastUsed, at) > UNUSED_DAYS)
      out.push({ ...base, title: `No ${s.merchant} in ${span(ago(s.lastUsed, at))}`,
        summary: `Still paying ${usd(s.price)} a ${per === "yr" ? "year" : "month"} for it. Cancel?`,
        artifact: { name: s.merchant, note: `Last used ${day(new Date(s.lastUsed))}`, now: `${usd(s.price)}/${per}` } });
  }
  return out;
}

/** Daily checking balances up to `at`, oldest first. */
export const checking = (at = now()) =>
  (state.balances ?? []).filter((b) => b.account === "checking" && new Date(b.at) <= at).sort((a, b) => a.at.localeCompare(b.at));
/** A month of bills: what kind "bill" txns charged in the last 30 days. */
export const monthlyBills = (at = now()) =>
  sum(state.txns.filter((t) => t.kind === "bill" && new Date(t.at) <= at && ago(t.at, at) < 30));

/** Cash that never left checking: its IDLE.window-day low above a cushion of bills. */
function idleCash(at = now()): Proposal[] {
  const hist = checking(at);
  if (!hist.length || ago(hist[0].at, at) < IDLE.window) return [];
  const low = Math.floor(Math.min(...hist.filter((b) => ago(b.at, at) <= IDLE.window).map((b) => b.balance)));
  const floor = Math.round(IDLE.cushion * monthlyBills(at));
  const move = Math.floor((low - floor) / IDLE.step) * IDLE.step;
  if (move < IDLE.step) return [];
  // How long it has sat: back from today while checking stayed above cushion + move.
  let i = hist.length - 1;
  while (i > 0 && hist[i - 1].balance >= floor + move) i--;
  const months = Math.floor(ago(hist[i].at, at) / 30);
  const into = fundName();
  return [{
    find: "idle", key: "idle", amount: move, from: "checking",
    title: "Idle cash",
    summary: `${usd(move)} has sat in checking for ${months} months. Move it ${into ? `to the ${into}` : "into a fund"}?`,
    artifact: { name: "Chase Checking", note: `Lowest ${usd(low)} in ${IDLE.window} days`, now: usd(hist.at(-1)!.balance) },
    verb: `Move ${usd(move)}`,
    working: `Approved · moving ${usd(move)}`,
    declined: NOT_NOW,
  }];
}

/** Spend categories running hot this month against last month's daily pace. Text only, no card. */
export function trends(at = now()) {
  const start = new Date(at.getFullYear(), at.getMonth(), 1);
  const last = new Date(at.getFullYear(), at.getMonth() - 1, 1);
  const lastDays = Math.round((start.getTime() - last.getTime()) / DAY);
  const by = (from: Date, to: Date) => {
    const m: Record<string, number> = {};
    for (const t of state.txns)
      if (t.kind === "spend" && new Date(t.at) >= from && new Date(t.at) < to) m[t.category] = (m[t.category] ?? 0) + t.amount;
    return m;
  };
  const now_ = by(start, at);
  const before = by(last, start);
  return Object.entries(now_)
    .map(([category, so_far]) => {
      const pace = so_far / at.getDate();
      const was = (before[category] ?? 0) / lastDays;
      return { category, this_month: Math.round(so_far), last_month: Math.round(before[category] ?? 0),
        per_day_now: Math.round(pace), per_day_last_month: Math.round(was),
        up_pct: was ? Math.round((pace / was - 1) * 100) : null, suggested_weekly_cap: Math.round(was * 7) };
    })
    .filter((c) => c.this_month >= TREND.min && (c.per_day_last_month === 0 || c.per_day_now > c.per_day_last_month * (1 + TREND.pct)))
    .filter((c) => c.suggested_weekly_cap > 0);
}

/** Everything the detectors find right now, in card order. */
export const detect = (): Proposal[] => [...billHikes(), ...unusedSubs(), ...idleCash()];

const proposals = () => Object.values(state.apps).filter((a) => a.kind === "proposal");

/** Opens a card per find not already on the table (answered cards count; failed ones don't).
 *  `cancel`: only what can be cancelled or called down (bills, subscriptions), no idle cash. */
export function findSavings(only: "all" | "cancel" = "all") {
  const taken = new Set(proposals().filter((a) => a.state.status !== "failed").map((a) => a.state.key ?? a.state.find));
  const all = detect().filter((p) => only === "all" || p.find === "bill" || p.find === "unused");
  const fresh = all.filter((p) => !taken.has(p.key));
  return { fresh, apps: fresh.map((p) => open("proposal", p)), already: all.filter((p) => taken.has(p.key)), trends: trends() };
}

/** Demo `cfo-scan`: one "Found N things." then a card per find not already on the table. */
export function cfoScan() {
  if (!state.user.tips) return say("dime", "CFO tips are off in settings. say \"tips on\" and I'll start looking again");
  const { fresh: finds, apps } = findSavings();
  if (!finds.length) return say("dime", "checked everything. nothing to fix. suspicious 🤨");
  const n = `${finds.length} thing${finds.length === 1 ? "" : "s"}`;
  const list = finds.map((p) => `${p.title}: ${p.summary}`).join(" | ");
  // The cards carry every amount; the intro is a hook with no number but the count, so it can't
  // disagree with them (it once said "$2,000 is napping" over a card about $4,000).
  return speak("dime", `You (the CFO) just scanned Charles's accounts and found ${n} worth fixing. The cards that follow your words say, exactly: ${list}. Your intro is one short hook bubble, like "found ${n} 👀": no dollar amounts or other numbers, don't list or describe the finds. The cards carry the detail.`,
    [`found ${n} 👀`, ...apps], 0, `${finds.length}`);
}

export type Result = { outcome: ProposalState["outcome"]; lines: (string | App)[] };
/** Outcomes for the finds simulated events raise (dispute, freeze, top-up, invest): simulate.ts. */
export const EVENT_OUTCOMES: Partial<Record<Find, (s: ProposalState) => Result>> = {};

/** Takes `amount` out of checking: today's balance point drops (added if there isn't one). */
function debitChecking(amount: number) {
  const hist = checking();
  if (!hist.length) return;
  const today = now().toISOString().slice(0, 10);
  const last = hist.at(-1)!;
  if (last.at.slice(0, 10) === today) last.balance -= amount;
  else state.balances.push({ account: "checking", at: today, balance: last.balance - amount });
}

const OUTCOMES: Record<"bill" | "unused" | "idle" | "savings" | "move", (s: ProposalState) => Result> = {
  bill: (s) => {
    const name = s.merchant!;
    const was = s.was!;
    const saved = s.amount!;
    const goal = money.activeGoal(state);
    const offer = open("proposal", {
      find: "savings",
      key: `savings:${name}`,
      merchant: name,
      title: `${name} savings`,
      summary: `Send the ${usd(saved)} to the ${goal.name} every month?`,
      artifact: { name: goal.name, note: `${money.lag(state, now(), saved)} sooner each month`, now: `${usd(saved)}/mo` },
      verb: `Send ${usd(saved)}/mo`,
      working: "Approved · setting it up",
      declined: `Not now. The ${usd(saved)} stays in your budget.`,
      saved,
    });
    return {
      outcome: { text: `Back to ${usd(was)}/mo. Saving ${usd(saved)}/mo.`, money: `${usd(saved)}/mo` },
      lines: [`just got off the phone with ${name} 📞 you're back to ${usd(was)}/mo`, offer],
    };
  },
  unused: (s) => {
    const name = s.merchant!;
    const price = s.amount!;
    state.subscriptions = (state.subscriptions ?? []).filter((x) => x.merchant !== name);
    state.upcoming = state.upcoming.filter((x) => x.merchant !== name);
    return {
      outcome: { text: `Cancelled. ${usd(price)}/mo back.`, money: `${usd(price)}/mo` },
      // Same unit as the bill card: what one month's saving buys, every month.
      lines: [`bye ${name} 👋 that's ${usd(price)}/mo back in your pocket`, `that's the ${money.activeGoal(state).name} ${money.lag(state, now(), price)} sooner every month`],
    };
  },
  idle: (s) => {
    const amount = s.amount!;
    const at = now().toISOString();
    debitChecking(amount);
    if (state.user.fund) {
      state.ledger.push({ fund: state.user.fund, amount, at, reason: "cfo" });
      const to = `${usd(amount)} → ${fundName()}`;
      return { outcome: { text: `Moved ${to}`, money: usd(amount) }, lines: [`${to}. your cash has a job now 💼`] };
    }
    // No fund yet: the funds card's pick moves it (funds.ts reads pendingInvest).
    // ponytail: one pending slot; a blackjack loss already waiting keeps it and this move is dropped.
    state.pendingInvest ??= { amount, reason: "cfo", at };
    return {
      outcome: { text: `Approved. ${usd(amount)} goes where you pick.`, money: usd(amount) }, // still true after the pick
      lines: [`where should the ${usd(amount)} live? 👇`, open("funds")],
    };
  },
  savings: (s) => {
    const saved = s.saved ?? 0;
    const goal = money.activeGoal(state);
    const got = money.save(state, saved);
    return {
      outcome: { text: `${usd(saved)}/mo → ${goal.name}`, money: `${usd(saved)}/mo` },
      lines: [`done. first ${usd(saved)} is already in ${goal.emoji}`, open("goal", { ...got, source: s.merchant ?? "savings" })],
    };
  },
  // propose_move: Charles's own "put $X into Y". From today only into a fund (it leaves today like a
  // blackjack loss); from checking into a fund or the goal.
  move: (s) => {
    const amount = s.amount!;
    const at = now();
    if (s.from === "today" && amount > money.today(state, at)) throw new Error("more than today's number now");
    if (s.from === "checking") debitChecking(amount);
    if (s.to === "goal") {
      const goal = money.activeGoal(state);
      const got = money.save(state, amount);
      return { outcome: { text: `Moved ${usd(amount)} → ${goal.name}`, money: usd(amount) },
        lines: [`${usd(amount)} is in the ${goal.name} ${goal.emoji}`, open("goal", { ...got, source: "checking" })] };
    }
    const f = s.to!;
    state.ledger.push({ fund: f, amount, at: at.toISOString(), reason: s.from === "today" ? "today" : "cfo" });
    const to = `${usd(amount)} → ${fundName(f)}`;
    return { outcome: { text: `Moved ${to}`, money: usd(amount) }, lines: [`${to} 📈`] };
  },
};

/** Runs an approved proposal: a staged pause while the card says it's working, then the outcome. */
export async function carry(app: App) {
  const s = app.state as ProposalState;
  await Bun.sleep(WORK_MS[s.find as keyof typeof WORK_MS] ?? 1400);
  if (state.apps[app.id] !== app) return; // reset while working
  let result: Result;
  try {
    result = (EVENT_OUTCOMES[s.find] ?? OUTCOMES[s.find as keyof typeof OUTCOMES])(s);
  } catch (e) {
    console.error("cfo", s.find, e);
    s.status = "failed";
    app.version++;
    return;
  }
  s.status = "done";
  s.outcome = result.outcome;
  app.version++;
  const said = result.lines.filter((l) => typeof l === "string").join(" ");
  const cards = result.lines.filter((l) => typeof l !== "string").map((l) => { const a = l as App; return a.kind === "proposal" ? `proposal (it asks "${a.state.summary}" itself, so don't ask it, and don't say it is happening: nothing moves until he approves that card)` : a.kind; });
  await speak("dime", `Charles approved "${s.title}" and you just did it. Result: ${result.outcome?.text} ${said}${cards.length ? ` A ${cards.join(" and ")} card follows your words.` : ""}`, result.lines);
}
