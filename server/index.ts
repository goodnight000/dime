// The HTTP contract (ARCHITECTURE.md). Vite proxies /api here in dev.
import { state, reset, type Thread, type Message } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { summary } from "./summary.ts";
import * as accounts from "./accounts.ts";
import { run } from "./apps/index.ts";
import { refresh as refreshToday } from "./apps/today.ts";
import { post, reply } from "./voice.ts";
import { morning, purchase, midnight } from "./events.ts";
import { cfoScan } from "./cfo.ts";
import { friendSwipe, typing as groupTyper } from "./friends.ts";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const bad = (error: string, status = 400) => json({ error }, status);
const thread = (v: unknown): Thread => (v === "group" ? "group" : "dime");
const body = (req: Request) => req.json().catch(() => ({})) as Promise<any>;

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
  disconnect: (b) => accounts.disconnect(String(b.id || "chase")), // replay the connect flow
  // Stubs for wave 1 owners.
  "cfo-scan": () => cfoScan(),
  "friend-swipe": (b) => {
    const amount = Number(b.amount);
    if (!["Penny", "Maya", "Sam"].includes(b.who) || !b.merchant || !(amount > 0)) throw new Error("who, merchant and a positive amount");
    friendSwipe({ who: b.who, merchant: String(b.merchant), amount });
  },
  // Rigs the next blackjack resolution: win | lose | push; anything else ("fair") clears it.
  "force-blackjack": (b) => {
    state.forceBlackjack = ["win", "lose", "push"].includes(b.result) ? b.result : null;
  },
};

const server = Bun.serve({
  port: 8787,
  routes: {
    "/api/session": () =>
      json({ owner: { display_name: state.user.name, onboarded: true }, agent: { name: "Dime" } }),

    "/api/messages": {
      GET: (req) => {
        refreshToday(); // the latest today card rolls with every purchase, loss or win
        const t = thread(new URL(req.url).searchParams.get("thread"));
        const messages = state.messages.filter((m) => m.thread === t);
        const apps = Object.fromEntries(messages.filter((m) => m.app).map((m) => [m.app, state.apps[m.app!]]));
        return json({ messages, apps, pending: state.typing[t] > 0, typer: t === "group" ? groupTyper() : null, now: now().toISOString() });
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

    "/api/accounts": () => json(accounts.accounts()),
    "/api/accounts/:id/connect": {
      POST: (req) => {
        const a = accounts.connect(req.params.id);
        return a ? json({ account: a }) : bad("not_found", 404);
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
