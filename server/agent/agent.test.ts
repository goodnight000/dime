// The agent path end to end against a fake OpenAI-compatible gateway: a tool call, then text.
import { test, expect, afterAll } from "bun:test";
import { state, reset } from "../state.ts";
import { post, reply, usd, faithful } from "../voice.ts";
import { purchase } from "../events.ts";
import { split } from "./index.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
const left = () => usd(money.today(state, now()));

const sse = (chunks: any[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const chunk = (delta: any, finish_reason: string | null = null) => ({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason }] });
const calls: any[] = [];
let eventWords = ""; // what the fake model says to an event turn
const fake = Bun.serve({
  port: 0,
  async fetch(req) {
    const body: any = await req.json();
    calls.push({ auth: req.headers.get("authorization"), body });
    const last = body.messages.at(-1);
    if (JSON.stringify(last.content).includes("[event")) return sse([chunk({ role: "assistant", content: eventWords }), chunk({}, "stop")]);
    if (last.role !== "tool")
      return sse([
        chunk({ role: "assistant", tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "start_blackjack", arguments: '{"item":"sneakers","price":30}' } }] }),
        chunk({}, "tool_calls"),
      ]);
    const r = JSON.parse(last.content);
    return sse([chunk({ role: "assistant", content: `${r.item}? $${r.today_left} left today.\n\nbeat the CFO and they're free` }), chunk({}, "stop")]);
  },
});
afterAll(() => fake.stop(true));

async function ask(text: string) {
  const n = state.messages.length;
  post({ thread: "dime", direction: "in", body: text });
  await reply("dime", text);
  return state.messages.slice(n + 1);
}

test("split: blank lines, at most 3 bubbles", () => {
  expect(split("a\n\nb")).toEqual(["a", "b"]);
  expect(split("a\n\n\nb\n \nc\n\nd")).toEqual(["a", "b", "c\nd"]);
  expect(split("**59%** there, *barely*\n\n- Oct 11. `ok`\n\n## hi")).toEqual(["59% there, barely", "Oct 11. ok", "hi"]);
  expect(split("pick one\n1) VOO\n2) cash")).toEqual(["pick one\n1) VOO\n2) cash"]);
  expect(split("$5 * 3 = $15")).toEqual(["$5 * 3 = $15"]);
  expect(split("  ")).toEqual([]);
});

test("with creds: the model's words, the tools' numbers, and a blackjack card", async () => {
  reset();
  process.env.NEON_AI_GATEWAY_URL = `http://localhost:${fake.port}`;
  process.env.NEON_AI_GATEWAY_KEY = "nt_test";
  try {
    const out = await ask("can i get sneakers");
    expect(calls[0].auth).toBe("Bearer nt_test");
    expect(JSON.stringify(calls[0].body.messages.at(-1).content)).toContain("can i get sneakers");
    // Other test files' fire-and-forget events can interleave in the shared state, so match by content.
    const bodies = out.map((m) => m.body);
    expect(bodies).toContain(`sneakers? ${left()} left today.`);
    expect(bodies).toContain("beat the CFO and they're free");
    const card = out.map((m) => state.apps[m.app!]).find((a) => a?.state.item === "sneakers");
    expect(card).toMatchObject({ kind: "blackjack", state: { amount: 30 } });
  } finally {
    delete process.env.NEON_AI_GATEWAY_URL;
    delete process.env.NEON_AI_GATEWAY_KEY;
  }
}, 15_000);

test("without creds: templates, no gateway call", async () => {
  // .env (Bun loads it for tests too) may hold real gateway creds under either name.
  for (const k of ["NEON_AI_GATEWAY_URL", "NEON_AI_GATEWAY_BASE_URL", "NEON_AI_GATEWAY_KEY", "NEON_AI_GATEWAY_TOKEN"]) delete process.env[k];
  reset();
  calls.length = 0;
  const out = await ask("hi");
  expect(calls.length).toBe(0);
  expect(out.map((m) => m.body)).toContain(`${left()} left today`);
}, 15_000);

test("faithful: every number in the words is in the facts", () => {
  const facts = "Charles just swiped Blue Bottle $7 (coffee). Left today: $1,304. Girl math: iPhone 17 Pro 1 day later.";
  expect(faithful("matcha $7?? $1,304 left. iPhone 17 Pro 1 day later 💅", facts)).toBe(true);
  expect(faithful("$7.00 gone, $1304 left", facts)).toBe(true);
  expect(faithful("$7 gone, $1,300 left", facts)).toBe(false);
  expect(faithful("iPhone 2 days later", facts)).toBe(false);
});

// A swipe's reply: the model's words when they keep the numbers, else the template, same order.
async function swipe(words: string) {
  eventWords = words;
  const n = state.messages.length;
  await purchase({ merchant: "Blue Bottle", amount: 7, category: "coffee" });
  return state.messages.slice(n).filter((m) => m.thread === "dime").map((m) => m.body);
}

test("events: model words with the facts' numbers, template when a number is off or creds are gone", async () => {
  reset();
  process.env.NEON_AI_GATEWAY_URL = `http://localhost:${fake.port}`;
  process.env.NEON_AI_GATEWAY_KEY = "nt_test";
  try {
    const ok = await swipe(`matcha again? ${left().replace(/\d+/, (d) => String(Number(d) - 7))} left today`);
    expect(ok[0]).toBe(`matcha again? ${left()} left today`);
    const off = await swipe("matcha again? $41 left today");
    expect(off[0]).toBe(`Blue Bottle $7. ${left()} left today`);
  } finally {
    delete process.env.NEON_AI_GATEWAY_URL;
    delete process.env.NEON_AI_GATEWAY_KEY;
  }
  const out = await swipe("never asked");
  expect(out[0]).toBe(`Blue Bottle $7. ${left()} left today`);
}, 20_000);
