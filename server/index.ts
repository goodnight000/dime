// The HTTP contract (ARCHITECTURE.md). Vite proxies /api here in dev.
import { state, reset, type Thread, type Message } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { run } from "./apps/index.ts";
import { post, reply } from "./voice.ts";
import { morning, purchase, midnight } from "./events.ts";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const bad = (error: string, status = 400) => json({ error }, status);
const thread = (v: unknown): Thread => (v === "group" ? "group" : "dime");
const body = (req: Request) => req.json().catch(() => ({})) as Promise<any>;

function summary() {
  const at = now();
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1);
  const month = state.txns.filter((t) => new Date(t.at) >= monthStart && new Date(t.at) <= at);
  const byCategory: Record<string, number> = {};
  for (const t of month) if (t.kind === "spend" && !t.covered) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  const byFund: Record<string, number> = {};
  for (const l of state.ledger) byFund[l.fund] = (byFund[l.fund] ?? 0) + l.amount;
  // One cell per day this month so far: the allowance, what went out, what was swept.
  const calendar = [];
  for (let d = 1; d <= at.getDate(); d++) {
    const day = new Date(at.getFullYear(), at.getMonth(), d, 12);
    const key = day.toDateString();
    calendar.push({
      date: day.toISOString().slice(0, 10),
      budget: money.budget(state, day),
      spent: money.spentToday(state, day),
      swept: state.sweeps.filter((s) => new Date(s.at).toDateString() === key).reduce((t, s) => t + s.amount, 0),
    });
  }
  return {
    now: at.toISOString(),
    today: money.today(state, at),
    budget: money.budget(state, at),
    pool: money.pool(state, at),
    days_left: money.daysLeft(at),
    goal: { ...state.goal, pct: money.pct(state), pace: money.pace(state, at), eta: money.eta(state, at) },
    ledger: byFund,
    spend_by_category: byCategory,
    calendar,
    txns: month,
    user: state.user,
  };
}

const demo: Record<string, (b: any) => unknown> = {
  swipe: (b) => {
    const amount = Number(b.amount);
    if (!b.merchant || !(amount > 0)) throw new Error("merchant and a positive amount");
    purchase({ merchant: String(b.merchant), amount, category: String(b.category || "other") });
  },
  morning: () => morning(),
  midnight: () => midnight(),
  "skip-day": async () => {
    await midnight();
    await morning();
  },
  reset: () => reset(),
  // Stubs for wave 1 owners.
  "cfo-scan": () => {},
  "friend-swipe": () => {},
  "force-blackjack": () => {},
};

const server = Bun.serve({
  port: 8787,
  routes: {
    "/api/session": () =>
      json({ owner: { display_name: state.user.name, onboarded: true }, agent: { name: "Dime" } }),

    "/api/messages": {
      GET: (req) => {
        const t = thread(new URL(req.url).searchParams.get("thread"));
        const messages = state.messages.filter((m) => m.thread === t);
        const apps = Object.fromEntries(messages.filter((m) => m.app).map((m) => [m.app, state.apps[m.app!]]));
        return json({ messages, apps, pending: state.typing[t] > 0, now: now().toISOString() });
      },
      POST: async (req) => {
        const b = await body(req);
        const text = typeof b.text === "string" ? b.text.trim() : "";
        if (!text) return bad("empty");
        const t = thread(b.thread);
        const quoted = b.reply_to && state.messages.find((m) => m.id === b.reply_to);
        const msg = post({
          thread: t,
          direction: "in",
          body: text,
          reply_to: quoted ? { id: quoted.id, direction: quoted.direction, body: quoted.body } : null,
        });
        void reply(t, text).catch((e) => console.error("reply failed", e));
        return json({ id: msg.id, pending: true });
      },
    },

    "/api/messages/:id/tapback": {
      POST: async (req) => {
        const m = state.messages.find((x) => x.id === req.params.id);
        if (!m) return bad("not_found", 404);
        m.tapback = ((await body(req)).tapback ?? null) as Message["tapback"];
        return json({ ok: true });
      },
    },

    "/api/apps/:id/:action": {
      POST: async (req) => {
        const app = await run(req.params.id, req.params.action, await body(req));
        return app ? json({ app }) : bad("not_found", 404);
      },
    },

    "/api/summary": () => json(summary()),

    "/api/accounts": () => json({ accounts: state.accounts }),
    "/api/accounts/:id/connect": {
      POST: (req) => {
        const a = state.accounts.find((x) => x.id === req.params.id);
        if (!a) return bad("not_found", 404);
        a.connected = true;
        return json({ account: a });
      },
    },

    "/api/demo/:action": {
      POST: async (req) => {
        const action = demo[req.params.action];
        if (!action) return bad("not_found", 404);
        try {
          // Events resolve after Dime finishes typing; the panel only needs the state change.
          void Promise.resolve(action(await body(req))).catch((e) => console.error(req.params.action, e));
        } catch (e) {
          return bad((e as Error).message);
        }
        return json({ ok: true, now: now().toISOString(), today: money.today(state, now()) });
      },
    },

    "/api/*": () => bad("not_found", 404),
  },
});

console.log(`dime server on http://localhost:${server.port}`);
