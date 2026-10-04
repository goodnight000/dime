# Stack notes: Pi + Neon AI Gateway + Neon Postgres + Exa

Checked 2026-10-04 against npm, package source, and live docs. Pi snippets were type-checked (`tsc --strict`) and run under Bun 1.3.11 against a fake OpenAI-compatible endpoint in `/tmp/pi-probe` (outside the repo). The fake returned a tool call, then text. Nothing here has been run against the real Neon gateway yet, because we have no credentials.

## TL;DR

- **Pi was renamed.** `@mariozechner/pi-agent-core` / `pi-ai` stop at 0.73.1 (May 2026) and npm marks them deprecated ("please use @earendil-works/pi-ai instead"). Use **`@earendil-works/pi-agent-core@1.0.2` + `@earendil-works/pi-ai@1.0.2`**, published 2026-10-04. The API differs from the old README: there is no global `getModel`. You build a `Models` collection, and `Agent` requires a `streamFn`.
- **Neon gateway:** base URL = your branch host (`https://br-<name>-api.ai.<cell>.<region>.aws.neon.tech`). Auth = `Authorization: Bearer $NEON_AI_GATEWAY_TOKEN`. Claude works on the OpenAI-compatible `POST /v1/chat/completions` (Neon's recommended endpoint) and on the native `POST /anthropic/v1/messages`.
- **Blockers:** the gateway needs a **paid Neon plan (Launch/Scale) plus prepaid credits ($5 minimum)**, and the project must be in us-east-1, us-east-2, eu-central-1, or ap-southeast-1. Tool calling **is not documented** on Neon's chat-completions page (see §2).
- **Agent-core works fine for request/response.** Create one `Agent` per turn, seed it with history, `await agent.prompt(text)`, then read the last assistant message. You don't need a hand-rolled loop, though one is included below in 15 lines.

---

## 1. Pi (pi-mono)

Source: https://github.com/badlogic/pi-mono (`packages/ai`, `packages/agent`; package names are `@earendil-works/*`). READMEs: https://www.npmjs.com/package/@earendil-works/pi-ai, https://www.npmjs.com/package/@earendil-works/pi-agent-core. Deprecation notice: `npm view @mariozechner/pi-ai deprecated`.

```bash
bun add @earendil-works/pi-agent-core @earendil-works/pi-ai
```

Key facts:
- **Tool schema:** TypeBox (`Type` is re-exported from pi-ai). `AgentTool` = `{ name, label, description, parameters, execute(toolCallId, params, signal, onUpdate) }`. `execute` returns `{ content: [{type:"text", text}], details }`. If you **throw**, the error goes back to the model as `isError: true`. Returning `terminate: true` skips the follow-up LLM call, but only when every tool in the batch sets it.
- **Tool results on the wire** (seen on the fake endpoint): `{"role":"tool","tool_call_id":"call_1","content":"<your text>"}`, the standard OpenAI format.
- **Custom endpoint:** `createProvider({ id, baseUrl, auth, models, api: openAICompletionsApi() })` with a hand-written `Model<"openai-completions">`. pi-ai has no built-in Neon provider.
- **History:** `agent.state.messages` is an `AgentMessage[]` (system, user, assistant, toolResult, ...). It is plain JSON. Store it per thread and pass it back as `initialState.messages` next turn. If the stored array already starts with the system message, Pi doesn't add another one (verified).
- **Request body with the compat flags below:** `{ model, messages, stream: true, max_tokens, tools }`. That's it: no `store`, `developer` role, `reasoning_effort`, or `stream_options`. This is the most conservative shape for an unknown OpenAI-compatible proxy.

### Agent-core, one turn per request (verified)

```ts
// server/agent/index.ts
import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, Type, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const BASE = process.env.NEON_AI_GATEWAY_BASE_URL!;   // https://br-...-api.ai.c-2.us-east-2.aws.neon.tech (no /v1)
const TOKEN = process.env.NEON_AI_GATEWAY_TOKEN!;     // nt_live_...

const model: Model<"openai-completions"> = {
  id: "claude-sonnet-5", name: "Claude Sonnet 5 (Neon)", api: "openai-completions", provider: "neon",
  baseUrl: `${BASE}/v1`, reasoning: false, input: ["text"],
  cost: { input: 2, output: 10, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 4096,
  compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, supportsStore: false,
            maxTokensField: "max_tokens", supportsUsageInStreaming: false },
};

const models = createModels();
models.setProvider(createProvider({
  id: "neon", name: "Neon AI Gateway", baseUrl: `${BASE}/v1`,
  auth: { apiKey: { name: "Neon", resolve: async () => ({ auth: { apiKey: TOKEN } }) } }, // -> Authorization: Bearer
  models: [model], api: openAICompletionsApi(),
}));

const todayParams = Type.Object({ day: Type.String({ description: "YYYY-MM-DD" }) });
const todayNumber: AgentTool<typeof todayParams> = {
  name: "today_number", label: "Today", description: "Today's spendable number in dollars",
  parameters: todayParams,
  execute: async (_id, { day }) => ({
    content: [{ type: "text", text: JSON.stringify({ day, today: 43 /* money.today(state) */ }) }],
    details: {},
  }),
};

export async function runTurn(history: AgentMessage[], text: string) {
  const agent = new Agent({
    initialState: { systemPrompt: PROMPT, model, tools: [todayNumber], messages: history },
    streamFn: models.streamSimple.bind(models),
  });
  await agent.prompt(text);                         // runs model → tools → model … until no tool calls
  const last = agent.state.messages.at(-1) as any;  // final assistant message
  if (last?.stopReason === "error") throw new Error(last.errorMessage);
  const reply = last.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return { reply, history: agent.state.messages };  // persist history for the next turn
}
const PROMPT = "You are Dime. Never invent numbers; call tools.";
```

Probe output: `FINAL: You've got $43 today.` with roles `system,user,assistant,toolResult,assistant`. The second turn, run with the returned history, also worked.

### pi-ai only loop (alternative; verified)

```ts
import { Type, type Context, type Tool } from "@earendil-works/pi-ai";
// models + model exactly as above
const tools: Tool[] = [{ name: "today_number", description: "Today's spendable number", parameters: Type.Object({ day: Type.String() }) }];
const run: Record<string, (a: any) => unknown> = { today_number: (a) => ({ day: a.day, today: 43 }) };

let reply = "";
const ctx: Context = { systemPrompt: PROMPT, tools, messages: [{ role: "user", content: text, timestamp: Date.now() }] };
for (let i = 0; i < 5; i++) {                       // ponytail: 5-step cap, enough for 1–3 tool calls
  const msg = await models.complete(model, ctx);
  ctx.messages.push(msg);
  if (msg.stopReason === "error") throw new Error(msg.errorMessage);
  const calls = msg.content.filter((b) => b.type === "toolCall");
  if (!calls.length) { reply = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""); break; }
  for (const c of calls) ctx.messages.push({ role: "toolResult", toolCallId: c.id, toolName: c.name,
    content: [{ type: "text", text: JSON.stringify(run[c.name]!(c.arguments)) }], isError: false, timestamp: Date.now() });
}
```

### Fallback: Claude via Neon's native Anthropic endpoint (header verified)

Use this if `/v1/chat/completions` mangles tool calls. pi-ai's Anthropic client sends `x-api-key` for normal keys, but Neon wants Bearer. Put the Bearer token in `model.headers` and use a key-less auth resolver. Verified on the fake server: it hits `/anthropic/v1/messages` with `authorization: Bearer nt_live_…` and no `x-api-key`.

```ts
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
const claude: Model<"anthropic-messages"> = {
  id: "claude-sonnet-5", name: "Claude Sonnet 5", api: "anthropic-messages", provider: "neon-anthropic",
  baseUrl: `${BASE}/anthropic`, reasoning: false, input: ["text"],
  cost: { input: 2, output: 10, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 4096,
  headers: { Authorization: `Bearer ${TOKEN}` },
};
models.setProvider(createProvider({ id: "neon-anthropic", name: "Neon (Anthropic)", baseUrl: `${BASE}/anthropic`,
  auth: { apiKey: { name: "Neon", resolve: async () => ({ auth: {} }) } }, models: [claude], api: anthropicMessagesApi() }));
```

---

## 2. Neon AI Gateway

Docs: https://neon.com/docs/ai-gateway/overview · https://neon.com/docs/ai-gateway/get-started · https://neon.com/docs/ai-gateway/models · https://neon.com/docs/ai-gateway/anthropic-messages · https://neon.com/docs/ai-gateway/authentication · https://neon.com/docs/ai-gateway/troubleshooting

| Thing | Value |
|---|---|
| Base URL | Branch host from Console → **Connect** → **AI Gateway** tab, format `https://br-<name>-api.ai.<cell>.<region>.aws.neon.tech` (e.g. `https://br-winter-pond-aptw82ef-api.ai.c-2.us-east-2.aws.neon.tech`). Not the DB connection string. Don't construct it by hand. |
| Auth | `Authorization: Bearer $NEON_AI_GATEWAY_TOKEN` (`nt_live_...`, scope `ai_gateway:invoke`). The Anthropic SDK uses `authToken:` (Bearer), not `apiKey:`. |
| OpenAI-compatible | `POST {BASE}/v1/chat/completions` (SDK `baseURL: ${BASE}/v1`). Neon recommends this endpoint for Claude. `GET {BASE}/v1/models` lists the catalog. |
| Anthropic-compatible | `POST {BASE}/anthropic/v1/messages` (SDK `baseURL: ${BASE}/anthropic`). Needed only for extended thinking and prompt caching. |
| Long-form paths | `/ai-gateway/mlflow/v1/chat/completions`, `/ai-gateway/anthropic/v1/messages`. Same behavior as the short paths. |
| Streaming | Yes on both endpoints (`stream: true`; SSE forwarded). |
| Rate limit | 200k TPM per account (input + output), upstream ~20k output tokens/min, plus an unpublished daily spend cap (`429 REQUEST_LIMIT_EXCEEDED`). |
| Upstream | Databricks Foundation Model APIs. Errors come back as `{"error_code","message"}`. |

**Claude model ids** (models page, Anthropic table; all list endpoints `chat/completions · anthropic/messages`; price is $/M tokens, input/output):
- `claude-opus-5-5`: latest Opus (Sep 2026), $4/$20
- `claude-fable-5-1`: $10/$50
- `claude-sonnet-5`: latest Sonnet (Jun 2026), $2/$10. **Recommended for Dime.**
- `claude-haiku-4-5`: latest Haiku, $1/$5. Fastest and cheapest.
- Also listed: `claude-opus-5`, `claude-fable-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-opus-4-1`

**Gotchas**
- **Avoid `claude-opus-5-5` on chat/completions.** When it reasons, `message.content` comes back as an *array* (`{type:'reasoning'}`, `{type:'text'}`) instead of a string. That breaks OpenAI-shaped parsers like pi-ai's openai-completions path; untested in streaming. `claude-opus-5-5`, `claude-fable-5`, and `claude-fable-5-1` also reject `thinking.type:"disabled"` on the Anthropic endpoint.
- **Tool calling:** the chat-completions and Anthropic pages don't mention `tools` at all. Indirect evidence that it works:
  - Neon's own agent skill shows AI SDK `generateText({ tools, stopWhen })` against the gateway. Its `@neon/ai-sdk-provider` routes Anthropic models to `/anthropic/v1/messages`. Source: https://github.com/neondatabase/agent-skills/blob/main/skills/neon-ai-gateway/SKILL.md
  - Databricks FMAPI supports OpenAI-format function calling.

  Expect OpenAI `tools`/`tool_calls` on `/v1`, and Anthropic `tools`/`tool_use` on `/anthropic`. **Verify on the first live call**; the Anthropic fallback above is ready if `/v1` fails.

**Getting the credential**
- Console: **Connect** (top of sidebar) → **AI Gateway** tab → **Copy snippet** gives both `NEON_AI_GATEWAY_TOKEN` and `NEON_AI_GATEWAY_BASE_URL`.
- CLI: `neon credentials create --scope ai_gateway:invoke --name dime`. The token prints once. Run it in a linked dir, or pass `--project-id` and `--branch`.
- CLI: `neon env pull --file .env` writes both gateway vars plus the DB URL.
- API: `POST https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/credentials` with body `{"scopes":["ai_gateway:invoke"],"principal_type":"user"}`. The response has `api_token`.

**Limits**
- Paid plan only (Launch or Scale, no difference between them) and prepaid credits: 1 credit = $1, $5 minimum, bought in Console → Billing.
- Regions: `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, `aws-ap-southeast-1`.
- Anthropic's supported-countries policy applies.
- Credentials are branch-scoped; a credential made on main also works on child branches.

---

## 3. Neon Postgres from Bun

Docs: https://neon.com/docs/guides/bun · https://bun.com/docs/runtime/sql

Use Bun's built-in client, which needs no dependency. Neon's Bun guide shows both `Bun.sql` and `@neondatabase/serverless`. `@neondatabase/serverless` is only worth it on edge/HTTP-only runtimes. Bun reads `POSTGRES_URL` (or `DATABASE_URL`) by default.

Verified: Bun 1.3.11 parses `sslmode=require&channel_binding=require`, completes TLS to a `*.neon.tech` host, and gets a real Postgres auth error with fake credentials.

```ts
import { SQL } from "bun";
// POSTGRES_URL='postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const sql = new SQL(process.env.POSTGRES_URL!);   // or: import { sql } from "bun" (uses POSTGRES_URL/DATABASE_URL)
const [row] = await sql`select ${"Charles"}::text as name, now() as at`;
await sql`insert into messages ${sql({ id: "m1", thread: "dime", body: "hi" })}`;
```

---

## 4. Exa search

Docs: https://exa.ai/docs/reference/search.md · https://exa.ai/docs/search/data/news.md · OpenAPI spec: https://exa.ai/docs/exa-spec.yaml

- Endpoint: `POST https://api.exa.ai/search`
- Auth: `x-api-key: $EXA_API_KEY` or `Authorization: Bearer $EXA_API_KEY`. Keys at https://dashboard.exa.ai/api-keys.
- SDK: `exa-js@2.25.0` (`bun add exa-js`). Use `exa.search(query, { ...filters, contents })`; `contents` replaces the old `searchAndContents`. The SDK reads `EXA_API_KEY` from the environment.
- `category: "news"` and `startPublishedDate` (ISO) give recent news.
- Result fields: `title`, `url`, `publishedDate`, `highlights: string[]`, `summary: string`.
- Search `type`: `instant | fast | auto | deep-lite | deep | deep-reasoning`. Use `fast` for chat.

The SDK call below type-checks against exa-js 2.25.0. A live call with a fake key returned Exa's "Invalid API key" error, which confirms the endpoint and auth path.

```ts
import Exa from "exa-js";
const exa = new Exa(process.env.EXA_API_KEY);

export async function financeNews(query: string) {           // e.g. "DoorDash delivery fees news"
  const res = await exa.search(query, {
    type: "fast", category: "news", numResults: 5,
    startPublishedDate: new Date(Date.now() - 14 * 864e5).toISOString(),
    contents: {
      highlights: { maxCharacters: 300 },
      summary: { query: "One sentence: what happened and why it matters for a consumer's wallet" },
    },
  });
  return res.results.map((r) => ({ title: r.title, url: r.url, publishedDate: r.publishedDate,
                                   summary: r.summary, highlight: r.highlights?.[0] }));
}
```

The same request as raw fetch:

```ts
const r = await fetch("https://api.exa.ai/search", {
  method: "POST",
  headers: { "x-api-key": process.env.EXA_API_KEY!, "content-type": "application/json" },
  body: JSON.stringify({ query, type: "fast", category: "news", numResults: 5,
    startPublishedDate: new Date(Date.now() - 14 * 864e5).toISOString(),
    contents: { highlights: { maxCharacters: 300 } } }),
}).then((r) => r.json());
```

Drop `summary` for the lowest latency: it's an extra LLM pass per result. Highlights alone are enough for one news line.

---

## 5. Recommendation: fewest moving parts for Dime

1. **One function, `voice.reply(thread, input)`, built on `runTurn` from §1.** Both kinds of input go through the same function:
   - User text: pass it as is.
   - Events: send a short line in the user role, e.g. `"[event] purchase DoorDash $24.18"`.
2. **Model:** `claude-sonnet-5` via `${BASE}/v1` with the `openai-completions` model above, so there's one provider and one code path. Switch to `claude-haiku-4-5` if latency matters more than voice. Switch to the Anthropic-endpoint model only if tool calls fail on `/v1`.
3. **Tools are thin wrappers over `money.ts` and `apps/*.create()`:**
   - Read-only tools such as `today_number`, `goal_status`, `can_afford(amount)`, and `news(query)` return JSON.
   - One write tool, `create_app({ kind, params })`, calls `apps/<kind>.create()` and stores the app id. The server attaches it to the outgoing message.
   - The model never does arithmetic; the prompt says "every number comes from a tool".
4. **Output:** take the final assistant text and split it on blank lines into at most 3 bubbles, with the app card under the last one. No `send_message` tool and no streaming to the client; the 1s poll already shows the typing state.
5. **State:** one `AgentMessage[]` per thread in memory (`state.agent[thread]`), passed as `initialState.messages` each turn. A fresh `Agent` per turn means no long-lived agent objects, no queues, and no steering. Pi's full message shape (tool calls and results) is why this is stored separately from the UI `Message[]`; rebuilding Pi messages from the UI thread costs more code. Trim it to the last N messages if it grows.
6. **Fallback stays:** if `NEON_AI_GATEWAY_TOKEN` is unset or the call throws, `voice.ts` uses template replies, so the demo never depends on the network.

Skipped: streaming to the browser, prompt caching, and the Anthropic endpoint. Add streaming if the 1s poll feels slow, and add the Anthropic endpoint only if `/v1` tool calls misbehave.
