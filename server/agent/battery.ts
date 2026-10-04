// Live-model battery: real user questions against the seeded state, in process (no HTTP server).
// Run: bun server/agent/battery.ts [filter]   (needs the gateway creds in .env; not part of bun test)
// Each question starts from a fresh reset unless it's marked `then` (continues the previous one).
// Prints Dime's bubbles, the cards it sent and the tools it called, for grading by eye.
process.env.DIME_TRACE = "1";
import { state, reset, id } from "../state.ts";
import { reply } from "../voice.ts";
import { now } from "../clock.ts";
import { enabled } from "./index.ts";

const QUESTIONS: { q: string; then?: boolean }[] = [
  { q: "what did I spend on food this week?" },
  { q: "how much do I have invested?" },
  { q: "what's my biggest expense this month?" },
  { q: "any subscriptions I should cancel?" },
  { q: "find me ways to save" },
  { q: "anything I should cancel?", then: true },
  { q: "what bills are coming up?" },
  { q: "explain the DRAM ETF like I'm 12" },
  { q: "should I put money in QQQ or VOO?" },
  { q: "is a $90 dinner tonight ok?" },
  { q: "thinking about $280 sneakers" },
  { q: "should I buy a $500 jacket" },
  { q: "put $100 into the S&P" },
  { q: "how's the market doing for chip stocks?" },
  { q: "when do I get my iPhone?" },
  { q: "how much is in checking?" },
  { q: "I want to save for a Tokyo trip $2400" },
  { q: "yeah switch it", then: true },
  { q: "roast my spending" },
  { q: "be nicer" },
  { q: "what's girl math" },
  { q: "how much did I spend at Blue Bottle this month?" },
  { q: "can I afford a $1,200 trip next month?" },
  { q: "how much can I spend today?" },
  { q: "how much do I spend on Uber vs Lyft?" },
  { q: "what's my net worth roughly" },
  { q: "who won the world series" },
  { q: "write me a poem about bitcoin" },
  { q: "lol ok" , then: true },
];

if (!enabled()) throw new Error("no gateway creds in .env");
const only = process.argv[2]?.toLowerCase();
const log = console.log;
for (const { q, then } of QUESTIONS.filter((x) => !only || x.q.toLowerCase().includes(only))) {
  if (!then) reset();
  const n = state.messages.length;
  const tools: string[] = [];
  console.log = (...a: unknown[]) => (String(a[0]).startsWith("[tool]") ? tools.push(String(a[0]).slice(7)) : log(...a));
  const t0 = Date.now();
  state.messages.push({ id: id(), thread: "dime", direction: "in", body: q, created_at: now().toISOString() });
  await reply("dime", q);
  while (state.typing.dime) await Bun.sleep(100);
  console.log = log;
  const ms = Date.now() - t0;
  const out = state.messages.slice(n + 1).filter((m) => m.thread === "dime");
  const mine = state.messages[n];
  log(`\n### ${q}   (${(ms / 1000).toFixed(1)}s)${mine.reaction ? ` [tapback ${mine.reaction}]` : ""}`);
  for (const t of tools) log(`  tool: ${t.slice(0, 220)}`);
  for (const m of out) {
    if (!m.app) log(`  dime: ${m.body.replace(/\n/g, " / ")}`);
    else {
      const a = state.apps[m.app];
      log(`  card: ${a.kind}${a.state.summary ? ` "${a.state.title}: ${a.state.summary}"` : a.state.item ? ` ${a.state.item} $${a.state.amount}` : ""}`);
    }
  }
}
process.exit(0);
