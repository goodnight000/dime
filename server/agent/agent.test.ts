// The agent path end to end against a fake OpenAI-compatible gateway: a tool call, then text.
import { test, expect, afterAll } from "bun:test";
import { state, reset } from "../state.ts";
import { post, reply, usd } from "../voice.ts";
import { split } from "./index.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
const left = () => usd(money.today(state, now()));

const sse = (chunks: any[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const chunk = (delta: any, finish_reason: string | null = null) => ({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason }] });
const calls: any[] = [];
const fake = Bun.serve({
  port: 0,
  async fetch(req) {
    const body: any = await req.json();
    calls.push({ auth: req.headers.get("authorization"), body });
    const last = body.messages.at(-1);
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
  expect(out.map((m) => m.body)).toContain(`${left()} left today.`);
}, 15_000);
