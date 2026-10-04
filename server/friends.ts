// Friend mode: Penny, Maya and Sam in The Group. Their personalities, their scripted chatter, their
// mock cards (state.friendTxns) and their bets on markets. Every number they say comes from state.
import { state, id, type App, type Friend } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { place, settle, type Market, type Side } from "./apps/market.ts";
import { say, usd } from "./voice.ts";

type Speaker = Friend | "Dime";
// `then` changes a card when the line lands; `wait` holds the line back first (ms).
type Line = { who: Speaker; body?: string; app?: App; then?: () => void; wait?: number };
// How long a card takes to play a change (bubble lands, face pops, bar + pots roll): the next
// typing indicator waits it out, so one thing moves at a time (DESIGN.md rule 1).
const CARD_BEAT = 2000;

// ---- cadence (DESIGN.md §4): one typer at a time, typing time from length, seeded gaps ----------

let chain = Promise.resolve();
let typer: Speaker | null = null;
/** Who the group's typing indicator belongs to (null = nobody, or Dime typing through voice.say). */
export const typing = () => typer;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clamp = (lo: number, n: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Posts lines in the group one after another, each behind its speaker's typing indicator.
 * Calls queue, so two conversations never interleave. A reset mid-script drops the rest. */
export function chat(lines: Line[]): Promise<void> {
  const run = async () => {
    const messages = state.messages;
    let last: Speaker | null = null;
    let moved = false; // the previous line changed a card
    for (const l of lines) {
      if (state.messages !== messages) return;
      const text = l.body ?? "";
      const gap = last && last !== l.who ? 500 + (hash(text) % 600) : 0;
      const pause = Math.max(gap, moved ? CARD_BEAT : 0, l.wait ?? 0);
      if (pause) await Bun.sleep(pause);
      if (state.messages !== messages) return;
      typer = l.who;
      state.typing.group++;
      try {
        await Bun.sleep(l.app ? 900 : clamp(800, 25 * text.length, 2200));
        if (state.messages !== messages) return;
        const sender = l.who === "Dime" ? {} : { sender: l.who };
        state.messages.push({
          id: id(), thread: "group", direction: "out", ...sender,
          body: text, ...(l.app ? { app: l.app.id } : {}), created_at: now().toISOString(),
        });
        l.then?.();
        moved = !!l.then;
      } finally {
        state.typing.group = Math.max(0, state.typing.group - 1);
        typer = null;
      }
      last = l.who;
    }
  };
  chain = chain.then(run, run);
  return chain;
}

// ---- who they are ---------------------------------------------------------------------------------

const FRIENDS: Friend[] = ["Penny", "Maya", "Sam"];
type Ctx = { subject: Friend; merchant: string; stake: string };
// How each one bets when the claim is about someone else, and what they say. The subject always
// takes No (they're "locked in"). Maya is the cynic, Sam the believer, Penny chaos.
const CAST: Record<
  Friend,
  {
    side: Side;
    stake: number;
    optIn: (c: Ctx) => string;
    bet: (c: Ctx) => string;
    win: string;
    lose: string;
    rival: string; // Charles just bet against them
    banter: string[];
  }
> = {
  Penny: {
    side: "yes",
    stake: 10,
    optIn: (c) => `bet. I'm locked in. ${c.stake} on no`,
    bet: (c) => `${c.stake} on yes. ${c.subject} is cooked`,
    win: "pay up 💅",
    lose: "doordash is a lifestyle and I won't apologize",
    rival: "charles really bet against me. noted",
    banter: ["lmao", "ok but who's buying", "I'm not reading all that", "this is why I don't text first"],
  },
  Maya: {
    side: "yes",
    stake: 15,
    optIn: (c) => `fine. ${c.stake} on no. watch me`,
    bet: (c) => `${c.stake} on yes. ${c.subject} and ${c.merchant} are in a relationship`,
    win: "easiest money of my life",
    lose: "rigged",
    rival: "charles fading me? bold",
    banter: ["no", "that's a want not a need", "who's paying for this", "adding it to the spreadsheet"],
  },
  Sam: {
    side: "no",
    stake: 5,
    optIn: (c) => `my streak is ${state.friends.find((f) => f.name === "Sam")?.streak ?? 0} days. ${c.stake} on no`,
    bet: (c) => `${c.stake} on no. believing in you ${c.subject.toLowerCase()} 🙏`,
    win: "faith pays",
    lose: "I believed in you",
    rival: "charles on the other side. respectfully, no",
    banter: ["lol", "I'll pass, streak", "we love growth", "proud of us honestly"],
  },
};

// ---- claims ---------------------------------------------------------------------------------------

const CLAIM_RE =
  /\b(?:will|is|does|can|would)\s+([a-z]+)\s+(?:going to\s+|gonna\s+)?(?:spend|drop|blow)\s+(?:over\s+|more than\s+|at least\s+)?\$\s?(\d+)\s+(?:on|at)\s+(.+?)(?:\s+(?:today|tonight|by midnight))?\s*[?.!]*$/i;

/** "Will Penny spend $80 on DoorDash today?" → the checkable rule; `subject` null for a non-friend. */
export function parseClaim(text: string): { subject: Friend | null; name: string; threshold: number; merchant: string } | null {
  const m = text.trim().match(CLAIM_RE);
  if (!m) return null;
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const subject = FRIENDS.includes(name as Friend) ? (name as Friend) : null;
  const raw = m[3].trim();
  // Known merchants keep their real spelling ("doordash" → "DoorDash").
  const known = [...state.friendTxns, ...state.txns].find((t) => t.merchant.toLowerCase() === raw.toLowerCase());
  const merchant = known?.merchant ?? raw.replace(/\b\w/g, (c) => c.toUpperCase());
  return { subject, name, threshold: Number(m[2]), merchant };
}

/** The subject's spend at the merchant inside the market's window. */
function spentIn(m: Market): number {
  const from = new Date(m.from).getTime();
  const to = new Date(m.to).getTime();
  return state.friendTxns
    .filter((t) => t.who === m.subject && t.merchant.toLowerCase() === m.merchant.toLowerCase())
    .filter((t) => new Date(t.at).getTime() >= from && new Date(t.at).getTime() < to)
    .reduce((s, t) => s + t.amount, 0);
}

const openMarkets = () =>
  Object.values(state.apps).filter((a) => a.kind === "market" && (a.state as Market).status === "open");

/** Restate the claim as a rule, post the card, then the subject opts in and the others bet. */
function launch(rule: { subject: Friend; merchant: string; threshold: number }, intro: string[] = []) {
  const app = open("market", rule);
  const m = app.state as Market;
  const ctx = (stake: number): Ctx => ({ subject: rule.subject, merchant: rule.merchant, stake: usd(stake) });
  const others = FRIENDS.filter((f) => f !== rule.subject);
  const her = rule.subject === "Penny" || rule.subject === "Maya" ? "her" : "his";
  const subjectStake = 10;
  return chat([
    ...intro.map((body) => ({ who: "Dime" as const, body })),
    { who: "Dime", body: `${rule.subject}, ${rule.merchant}, ${usd(rule.threshold)} or more by 11:59 PM. I settle it off ${her} card.` },
    { who: "Dime", app },
    {
      who: rule.subject,
      body: CAST[rule.subject].optIn(ctx(subjectStake)),
      then: () => {
        if (m.status !== "open") return;
        m.optedIn = true;
        place(app, { who: rule.subject, side: "no", amount: subjectStake });
        app.version++;
      },
    },
    ...others.map((f) => ({
      who: f,
      body: CAST[f].bet(ctx(CAST[f].stake)),
      then: () => {
        if (m.status !== "open") return;
        place(app, { who: f, side: CAST[f].side, amount: CAST[f].stake });
        app.version++;
      },
    })),
  ]);
}

/** Dime picks the juiciest line from the friends' history: their most frequent habit, doubled. */
function propose() {
  const counts = new Map<string, { who: Friend; merchant: string; amounts: number[] }>();
  for (const t of state.friendTxns) {
    const k = `${t.who}|${t.merchant}`;
    const e = counts.get(k) ?? { who: t.who, merchant: t.merchant, amounts: [] };
    e.amounts.push(t.amount);
    counts.set(k, e);
  }
  const top = [...counts.values()].sort((a, b) => b.amounts.length - a.amounts.length)[0];
  const avg = Math.round(top.amounts.reduce((s, a) => s + a, 0) / top.amounts.length);
  const threshold = Math.max(10, Math.round((avg * 2) / 10) * 10);
  return launch(
    { subject: top.who, merchant: top.merchant, threshold },
    [`${top.who} averages ${usd(avg)} a night on ${top.merchant}. Line's at double.`],
  );
}

/** Everything Charles says in The Group. */
export function groupReply(text: string): Promise<void> {
  const claim = parseClaim(text);
  if (claim && !claim.subject) return chat([{ who: "Dime", body: `I can only see Penny, Maya and Sam's cards. ${claim.name} isn't in here.` }]);
  if (claim?.subject) {
    const rule = { subject: claim.subject, merchant: claim.merchant, threshold: claim.threshold };
    const dup = openMarkets().find((a) => {
      const m = a.state as Market;
      return m.subject === rule.subject && m.merchant === rule.merchant;
    });
    if (dup) return chat([{ who: "Dime", body: `There's already a market on ${rule.subject} and ${rule.merchant} today 👆` }]);
    return launch(rule);
  }
  if (/\b(market|bet|odds|wager|line)\b/i.test(text)) return propose();
  const named = FRIENDS.find((f) => new RegExp(`\\b${f}\\b`, "i").test(text));
  if (!named && /\bdime\b/i.test(text)) return chat([{ who: "Dime", body: "I just run the bets in here. Give me a claim 👀" }]);
  const who = named ?? FRIENDS[hash(text) % 3];
  const lines = CAST[who].banter;
  return chat([{ who, body: lines[hash(text + who) % lines.length] }]);
}

/** Charles bet from the card: someone on the other side has thoughts. */
export function react(app: App, side: Side) {
  const m = app.state as Market;
  const rival = m.bets.find((b) => b.who !== "Charles" && b.side !== side);
  if (rival) void chat([{ who: rival.who as Friend, body: CAST[rival.who as Friend].rival, wait: CARD_BEAT }]);
}

// ---- settlement -------------------------------------------------------------------------------------

const names = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Dime calls it in the group, the room reacts, and Charles hears what it did to today. */
function announce(app: App, dm = true) {
  const m = app.state as Market;
  const winners = m.payouts!.filter((p) => p.net > 0);
  const losers = m.payouts!.filter((p) => p.net < 0);
  const head =
    m.status === "yes"
      ? `Yes wins. ${m.subject} hit ${usd(m.spent)} at ${m.merchant}.`
      : `No wins. ${m.subject} held at ${usd(m.spent)} on ${m.merchant}.`;
  const pay = winners.length
    ? `${winners.map((p) => `${p.who} +${usd(p.net)}`).join(", ")}.${losers.length ? ` ${names(losers.map((p) => p.who))}, pay up.` : ""}`
    : "Nobody on the other side. Everyone gets their money back.";
  const subjectWon = m.payouts!.find((p) => p.who === m.subject)!.net >= 0;
  const winner = winners.find((p) => p.who !== "Charles" && p.who !== m.subject);
  void chat([
    { who: "Dime", body: head, wait: CARD_BEAT }, // the card shows the result first
    { who: "Dime", body: pay },
    { who: m.subject, body: subjectWon ? CAST[m.subject].win : CAST[m.subject].lose },
    ...(winner ? [{ who: winner.who as Friend, body: CAST[winner.who as Friend].win }] : []),
  ]);
  const mine = m.payouts!.find((p) => p.who === "Charles");
  if (dm && mine?.net) {
    const left = money.today(state, now());
    void say("dime", mine.net > 0 ? `Won ${usd(mine.net)} off ${m.subject}. Free money: ${usd(left)} left today 💸` : `Lost ${usd(-mine.net)} on ${m.subject}. ${usd(left)} left today.`);
  }
}

/** A friend's card swipe (demo). Settles YES the moment the subject reaches the line. */
export function friendSwipe(input: { who: Friend; merchant: string; amount: number }) {
  state.friendTxns.push({ id: id(), at: now().toISOString(), ...input });
  for (const app of openMarkets()) {
    const m = app.state as Market;
    if (m.subject !== input.who || m.merchant.toLowerCase() !== input.merchant.toLowerCase()) continue;
    const spent = spentIn(m);
    if (spent >= m.threshold) {
      settle(app, "yes", spent);
      announce(app);
    } else {
      const heckler = FRIENDS.find((f) => f !== m.subject && m.bets.some((b) => b.who === f && b.side === "yes")) ?? "Maya";
      void chat([
        { who: "Dime", body: `${m.subject} just hit ${m.merchant} for ${usd(input.amount)}. ${usd(m.threshold - spent)} to go 👀` },
        { who: heckler, body: "LMAOOO" },
      ]);
    }
  }
}

/** Midnight: every open market's window closed without reaching the line. NO wins. */
export function settleAtMidnight() {
  for (const app of openMarkets()) {
    settle(app, "no", spentIn(app.state as Market));
    announce(app, false); // the midnight sweep message already covers today
  }
}
