// Generates server/history.json: three weeks of texting between Charles and Dime, written by
// actually talking to the live agent. A time machine steps the demo clock back scene by scene and
// trims the state to what existed at that moment (txns, sweeps, goal progress), then Charles's
// lines go through voice.reply and events go through speak, exactly like the app.
//   bun server/agent/make-history.ts        (needs the gateway creds in .env)
// Output times are offsets from the demo day's midnight, so the seed stays relative to "today".
import { state, reset, type Message, type Txn } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { post, reply, speak, usd } from "../voice.ts";
import { open, run } from "../apps/index.ts";
import { notable } from "../events.ts";
import { friendSwipe } from "../friends.ts";
import * as agent from "./index.ts";

if (!agent.enabled()) throw new Error("no gateway creds: history must come from the live model");

reset();
// Start from the seed minus what an earlier history.json added (its fund pick, loss and win).
state.user.fund = null;
state.ledger = state.ledger.filter((l) => l.reason !== "blackjack");
state.txns = state.txns.filter((t) => !t.covered);
const DAY = 86_400_000;
const midnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const ALL = { txns: [...state.txns], sweeps: [...state.sweeps], goals: structuredClone(state.goals), ledger: [...state.ledger] };
const extra: Txn[] = []; // txns the story itself makes (a blackjack win)
const keepGroup = state.messages.filter((m) => m.thread === "group"); // hand-written friend seed stays in state.ts
state.messages = [];
state.apps = {};

const at = (daysAgo: number, h: number, m = 0) => midnight - daysAgo * DAY + (h * 60 + m) * 60_000;

/** Moves the clock to the moment and trims the state to what existed then. */
function goTo(t: number) {
  for (const x of state.txns) if (!ALL.txns.includes(x) && !extra.includes(x)) extra.push(x);
  state.clockOffsetMs = t - Date.now();
  state.txns = [...ALL.txns, ...extra].filter((x) => +new Date(x.at) <= t);
  state.sweeps = ALL.sweeps.filter((x) => +new Date(x.at) <= t);
  const later = ALL.sweeps.filter((x) => +new Date(x.at) > t).reduce((s, x) => s + x.amount, 0);
  state.goals = structuredClone(ALL.goals).filter((g) => !g.createdAt || +new Date(g.createdAt) <= t);
  state.goals[0].saved = Math.max(0, state.goals[0].saved - later);
}

async function quiet() {
  let n = state.messages.length, still = 0;
  while (still < 6) {
    await Bun.sleep(500);
    const busy = state.typing.dime + state.typing.group > 0;
    if (busy || state.messages.length !== n) (n = state.messages.length), (still = 0);
    else still++;
  }
}

async function say(t: number, text: string, thread: "dime" | "group" = "dime") {
  goTo(t);
  post({ thread, direction: "in", body: text });
  console.log(`\n[${new Date(t).toLocaleString()}] Charles: ${text}`);
  await reply(thread, text);
  await quiet();
  show();
}

async function event(t: number, facts: string, lines: string[], card?: () => any) {
  goTo(t);
  console.log(`\n[${new Date(t).toLocaleString()}] event: ${facts.slice(0, 100)}`);
  await speak("dime", facts, card ? [...lines, card()] : lines);
  await quiet();
  show();
}

/** A real seeded swipe, worded only if notable() says it's worth a text. */
async function swipe(t: number, merchant: string) {
  goTo(t);
  const txn = state.txns.filter((x) => x.merchant === merchant && x.kind === "spend").at(-1)!;
  state.txns = state.txns.filter((x) => x !== txn);
  const leftBefore = money.today(state, now());
  state.txns.push(txn);
  const said = notable(txn, leftBefore);
  console.log(`\n[${new Date(t).toLocaleString()}] swipe ${merchant} ${txn.amount}: ${said ? "texts" : "silent"}`);
  if (!said) return;
  await speak("dime", said.facts, said.lines);
  await quiet();
  show();
}

/** The midnight sweep's milestone text, as events.ts sends it. */
async function milestone(daysAgo: number, hit: number) {
  const t = at(daysAgo - 1, 0, 0) + 30_000;
  goTo(t);
  const g = state.goals[0];
  const left = state.sweeps.at(-1)!.amount;
  const eta = money.eta(state, now());
  const spent = Math.round(money.spentToday(state, new Date(t - DAY)));
  await event(t,
    `Midnight sweep: he only spent ${usd(spent)} today, and the ${usd(left)} he didn't spend moved to the ${g.name} ${g.emoji}. That crossed ${hit}% (${usd(g.saved)} of ${usd(g.price)}). At his pace it lands in ${eta} days. Celebrate the milestone like a friend, short. The goal card follows your words.`,
    [hit === 50 ? `ok we're officially halfway to the ${g.name} ${g.emoji}` : `a quarter of the way to the ${g.name} ${g.emoji} it's real now`],
    () => open("goal", { delta: left, source: new Date(t - DAY).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
}

function show() {
  for (const m of state.messages.slice(-6)) if (!(m as any).shown) {
    (m as any).shown = true;
    console.log(`  ${m.direction === "in" ? "C" : m.sender ?? "D"}: ${m.app ? `[${state.apps[m.app]?.kind}]` : m.body} ${m.reaction ? `(${m.reaction})` : ""}`);
  }
}

async function blackjack(t: number, text: string, force: "win" | "lose") {
  state.forceBlackjack = force;
  await say(t, text);
  const app = Object.values(state.apps).filter((a) => a.kind === "blackjack").at(-1);
  if (!app) return console.warn("no blackjack card");
  goTo(t + 70_000);
  await run(app.id, "stand", {});
  await quiet();
  show();
}

// ---- the story: Sep 13 → Oct 3 ---------------------------------------------------------------

await say(at(21, 11, 42), "ok be honest how bad was last night");
await say(at(21, 11, 46), "the warriors game was worth it. the bar after was not");
await event(at(19, 9, 6),
  "Charles just swiped Hertz $148.60 (travel), a car rental. He has never paid Hertz before, so it's unusual for him. Notice it like a friend would, curious not judgy; no other numbers.",
  ["ooh $148.60 at Hertz? are we going somewhere 👀"]);
await say(at(19, 9, 11), "it's for the healdsburg trip, planned it. relax");
await say(at(18, 23, 9), "why do I keep doordashing at 11pm 😭 second night in a row");
await say(at(18, 23, 14), "ok what do I do about it");
await event(at(16, 8, 4),
  "Paycheck landed: $5,425 from Payroll. Rent and his other bills are already set aside in his plan. His automatic $3,000 transfer to savings goes out at 9am like every payday, nothing for him to do. Celebrate payday like a friend and mention the savings transfer is handled; one or two bubbles, no card, nothing to approve.",
  ["payday 🎉 bills are already covered", "and your $3,000 to savings goes out at 9 like always. nothing to do"]);
await say(at(16, 8, 31), "love that. remind me I'm not rich");
await blackjack(at(15, 15, 20), "should I buy this record for $42?", "win");
await say(at(15, 15, 23), "LMAOO free vinyl. you're a terrible dealer");
await say(at(14, 13, 5), "do you ever sleep");
await say(at(12, 8, 47), "wait why did hulu just charge me $19. I haven't opened it in forever");
await say(at(12, 8, 52), "ugh remind me after the finale lol");
await say(at(12, 20, 55), "ok after the iphone I want to save for tokyo in march. like $2400");
await blackjack(at(10, 19, 12), "should I buy tickets to the Fred Again show for $40?", "lose");
const funds = Object.values(state.apps).filter((a) => a.kind === "funds").at(-1);
if (funds) {
  goTo(at(10, 19, 17));
  await run(funds.id, "pick", { fund: "VOO" });
  await quiet();
  show();
  await say(at(10, 19, 21), "rip fred again. at least it's in the S&P now");
}
await event(at(9, 19, 6),
  "Sam just paid Charles back $30 on Venmo for the Uber home last Friday. It counts back into today. One short bubble.",
  ["Sam paid you back $30 for the Uber 🙏 back in today"]);
await milestone(7, 25);
await say(at(6, 8, 22), "wait a QUARTER?? lets gooo");
await swipe(at(5, 19, 40), "Nopa");
await say(at(5, 21, 58), "nopa was worth every dollar don't @ me");
await say(at(3, 8, 51), "rent just came out 😭 am I broke");
await say(at(2, 17, 46), "what can I spend today? thinking dinner out with maya");
await milestone(2, 50);
await say(at(1, 8, 14), "halfway to the iphone is actually insane. thank you dime fr");
await say(at(1, 22, 37), "movie was mid. $21 for that should be illegal");

// ---- the group: last weekend's market ---------------------------------------------------------
goTo(at(8, 20, 4));
const friendLine = (who: "Penny" | "Maya" | "Sam", t: number, body: string) =>
  state.messages.push({ id: crypto.randomUUID(), thread: "group", direction: "out", sender: who, body, created_at: new Date(t).toISOString() });
friendLine("Penny", at(8, 20, 4), "bar agricole at 9?? who's in");
friendLine("Maya", at(8, 20, 6), "in");
friendLine("Sam", at(8, 20, 9), "in if someone else orders the first round");
friendLine("Penny", at(8, 20, 12), "and I'm NOT ordering doordash after. new era");
await say(at(8, 20, 15), "will Penny spend $40 on DoorDash tonight?", "group");
const market = Object.values(state.apps).filter((a) => a.kind === "market").at(-1);
if (market) {
  await quiet();
  goTo(at(8, 23, 48));
  friendSwipe({ who: "Penny", merchant: "DoorDash", amount: 46 });
  await quiet();
  await Bun.sleep(4000);
  await quiet();
  show();
}
friendLine("Maya", at(7, 10, 2), "penny's doordash is a public utility at this point");
friendLine("Penny", at(7, 10, 5), "the dumplings were worth it and I'd do it again");

// ---- serialize ------------------------------------------------------------------------------
goTo(Date.now());
// Proposal cards stay out: the demo's CFO scan has to find Hulu fresh.
const drop = new Set(Object.values(state.apps).filter((a) => a.kind === "proposal").map((a) => a.id));
const msgs = state.messages.filter((m) => !(m.app && drop.has(m.app)));
const rel = (m: Message) => {
  const { id, shown, created_at, ...rest } = m as any;
  return { ...rest, at: +new Date(created_at) - midnight };
};
const used = new Set(msgs.flatMap((m) => (m.app ? [m.app] : [])));
const apps = Object.fromEntries(Object.entries(state.apps).filter(([id]) => used.has(id)));
const out = {
  generated: new Date().toISOString(),
  messages: msgs.map(rel),
  apps,
  fund: state.user.fund,
  ledger: state.ledger.filter((l) => !ALL.ledger.includes(l)).map((l) => ({ ...l, at: +new Date(l.at) - midnight })),
  txns: extra.map((x) => ({ ...x, at: +new Date(x.at) - midnight })),
};
await Bun.write(new URL("../history.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`\nwrote server/history.json: ${out.messages.length} messages, ${Object.keys(apps).length} cards; group seed kept ${keepGroup.length}`);
process.exit(0);
