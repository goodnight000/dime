// Dime's brain: Pi agent-core over the Neon AI Gateway's OpenAI-compatible endpoint.
//
// To enable: put the gateway credentials in /.env (Bun loads it automatically), then restart the
// server (`bun --watch` does not reload on .env changes):
//   NEON_AI_GATEWAY_URL=https://br-xxx-api.ai.c-2.us-east-2.aws.neon.tech   (also: NEON_AI_GATEWAY_BASE_URL)
//   NEON_AI_GATEWAY_KEY=nt_live_...                                          (also: NEON_AI_GATEWAY_TOKEN)
//   DIME_MODEL=gpt-5-6-luna   (default; also read as NEON_AI_GATEWAY_MODEL). To switch, change it and
//                             restart. claude-* models go through Neon's Anthropic endpoint (Opus 5.5's
//                             reasoning replies break the OpenAI shape); everything else through /v1.
// Without them, enabled() is false and voice.ts uses its templates. Any error or a 20s timeout
// also falls back to the templates.
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { state, type App, type Thread } from "../state.ts";
import { tools } from "./tools.ts";

const PROMPT = await Bun.file(new URL("./prompt.md", import.meta.url)).text();
const TIMEOUT_MS = 20_000;
const EVENT_TIMEOUT_MS = 6_000; // events have a template ready; past this the template is the reply
const HISTORY = 24; // recent UI messages replayed as context

const env = () => ({
  base: (process.env.NEON_AI_GATEWAY_URL ?? process.env.NEON_AI_GATEWAY_BASE_URL ?? "").replace(/\/+$/, "").replace(/\/v1$/, ""),
  key: process.env.NEON_AI_GATEWAY_KEY ?? process.env.NEON_AI_GATEWAY_TOKEN ?? "",
  model: process.env.DIME_MODEL ?? process.env.NEON_AI_GATEWAY_MODEL ?? "gpt-5-6-luna",
});

export const enabled = () => {
  const e = env();
  return Boolean(e.base && e.key);
};

function connect() {
  const { base, key, model: id } = env();
  const models = createModels();
  const common = { id, name: `${id} (Neon)`, reasoning: false, input: ["text" as const], contextWindow: 200_000, maxTokens: 1024,
    cost: { input: 2, output: 10, cacheRead: 0, cacheWrite: 0 } };
  if (id.startsWith("claude-")) {
    // Neon wants Bearer, not x-api-key: the token rides in the model headers with a key-less resolver.
    const model: Model<"anthropic-messages"> = { ...common, api: "anthropic-messages", provider: "neon-anthropic",
      baseUrl: `${base}/anthropic`, headers: { Authorization: `Bearer ${key}` } };
    models.setProvider(createProvider({ id: "neon-anthropic", name: "Neon (Anthropic)", baseUrl: `${base}/anthropic`,
      auth: { apiKey: { name: "Neon", resolve: async () => ({ auth: {} }) } }, models: [model], api: anthropicMessagesApi() }));
    return { model: model as Model<any>, models };
  }
  const model: Model<"openai-completions"> = { ...common, api: "openai-completions", provider: "neon", baseUrl: `${base}/v1`,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, supportsStore: false, maxTokensField: "max_tokens", supportsUsageInStreaming: false },
  };
  models.setProvider(createProvider({
    id: "neon", name: "Neon AI Gateway", baseUrl: `${base}/v1`,
    auth: { apiKey: { name: "Neon", resolve: async () => ({ auth: { apiKey: key } }) } },
    models: [model], api: openAICompletionsApi(),
  }));
  return { model: model as Model<any>, models };
}

/** GPT-5.6 on the gateway refuses function tools unless reasoning is explicitly off. */
const onPayload = (params: unknown, model: Model<any>) =>
  model.id.startsWith("gpt-5-6") ? { ...(params as object), reasoning_effort: "none" } : params;

/** The thread's recent messages as Pi history, same-role runs merged. Friends are labeled. */
function history(thread: Thread, model: Model<any>, current?: string): AgentMessage[] {
  let msgs = state.messages.filter((m) => m.thread === thread && m.body);
  const last = msgs.at(-1);
  if (current && last?.direction === "in" && last.body === current) msgs = msgs.slice(0, -1); // the turn's own input
  const turns: { role: "user" | "assistant"; text: string; at: number }[] = [];
  for (const m of msgs.slice(-HISTORY)) {
    const role = m.direction === "out" && !m.sender ? "assistant" : "user";
    const text = thread === "group" && role === "user" ? `${m.sender ?? state.user.name}: ${m.body}` : m.body;
    const prev = turns.at(-1);
    if (prev?.role === role) prev.text += "\n\n" + text;
    else turns.push({ role, text, at: +new Date(m.created_at) });
  }
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", text: "(earlier)", at: turns[0].at });
  return turns.map((t) =>
    t.role === "user"
      ? { role: "user", content: t.text, timestamp: t.at }
      : {
          role: "assistant", content: [{ type: "text", text: t.text }], api: model.api, provider: model.provider, model: model.id,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop", timestamp: t.at,
        },
  );
}

/** Markdown the model slips in anyway (bold, italics, code, headings, bullets, quotes) as plain text.
 * Numbered lines stay: chat.ts turns "1) x" choices into tappable replies. */
const plain = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|[-*•][ \t]+|>[ \t]?)/gm, "")
    .replace(/\s*—\s*/g, ", "); // em dashes, which the prompt bans and the model writes anyway

const CAP = 160; // a texted bubble, not a paragraph
/** A bubble over CAP cut at its last sentence end within CAP (an emoji after the stop stays with it), or null. */
function cut(s: string): [string, string] | null {
  if (s.length <= CAP) return null;
  const end = [...s.slice(0, CAP + 1).matchAll(/[.!?…]+["”’)]*(?:[ \t]*\p{Extended_Pictographic}\uFE0F?)*\s+/gu)].at(-1);
  if (!end || end.index! < 40) return null;
  const i = end.index! + end[0].length;
  return [s.slice(0, i).trim(), s.slice(i).trim()];
}

/** Up to 3 bubbles from the reply text, split on blank lines; extras become lines of the last one.
 *  While there's room for another bubble, one over CAP splits at a sentence end into the next. */
export function split(text: string): string[] {
  // Chat turns have no template to fall back to: drop any word in a non-Latin script (garbled output).
  text = text.replace(/\S*[^\s\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Extended_Pictographic}\p{Emoji_Component}]\S*/gu, (w) =>
    /\p{Extended_Pictographic}/u.test(w) && !/[\p{L}]/u.test(w.replace(/\p{Script=Latin}/gu, "")) ? w : "").replace(/ {2,}/g, " ");
  const parts = plain(text).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const out = parts.length > 3 ? [...parts.slice(0, 2), parts.slice(2).join("\n")] : parts;
  for (let i = 0; i < out.length && out.length < 3; ) {
    const c = cut(out[i]);
    if (c) out.splice(i, 1, ...c);
    else i++;
  }
  return out;
}

/**
 * One turn: the user's text, or an event (`{ event: "purchase DoorDash $24" }`) Dime should react to.
 * Event turns only word facts code already computed: no tools (one round trip) and a 6s cap.
 * Returns the messages to send and the cards the tools opened; throws on error or timeout.
 */
export async function runTurn(
  thread: Thread,
  input: string | { event: string },
  on: { text?: () => void; react?: () => void } = {},
): Promise<{ lines: string[]; apps: App[] }> {
  const { model, models } = connect();
  const apps: App[] = [];
  const event = typeof input !== "string";
  const limit = event ? EVENT_TIMEOUT_MS : TIMEOUT_MS;
  const text =
    typeof input !== "string" ? `[event, not from ${state.user.name}] ${input.event}` : thread === "group" ? `${state.user.name}: ${input}` : input;
  const context = `\n\n## Context\n\nThread: ${thread === "group" ? "group chat with Penny, Maya and Sam" : `1:1 with ${state.user.name}`}. Tone: ${state.user.tone}.`;
  const agent = new Agent({
    initialState: {
      systemPrompt: PROMPT + context, model, tools: event ? [] : tools(thread, apps),
      messages: history(thread, model, typeof input === "string" ? input : undefined),
    },
    streamFn: models.streamSimple.bind(models),
    onPayload,
  });
  // Tells the caller when words start streaming (show typing) or a tapback went out (maybe no words).
  agent.subscribe((e) => {
    if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta" && e.assistantMessageEvent.delta.trim()) on.text?.();
    if (e.type === "tool_execution_start" && e.toolName === "react") on.react?.();
    // DIME_TRACE=1 logs each tool call and its result (server/agent/battery.ts reads these).
    if (process.env.DIME_TRACE && e.type === "tool_execution_end")
      console.log(`[tool] ${e.toolName}${e.isError ? " ERROR" : ""} ${JSON.stringify(e.result?.content?.[0]?.text ?? e.result).slice(0, 400)}`);
  });
  let timer: Timer | undefined;
  try {
    await Promise.race([
      agent.prompt(text),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          agent.abort();
          reject(new Error(`agent timed out after ${limit / 1000}s`));
        }, limit);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const last = agent.state.messages.at(-1);
  if (last?.role !== "assistant") throw new Error(`agent ended on ${last?.role}`);
  if (last.stopReason === "error" || last.stopReason === "aborted") throw new Error(last.errorMessage ?? last.stopReason);
  const reply = last.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { lines: split(reply), apps };
}
