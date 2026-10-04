// The HTTP contract (ARCHITECTURE.md). Vite proxies /api here in dev.
import { state, reset, type Thread, type Message } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { summary } from "./summary.ts";
import * as accounts from "./accounts.ts";
import { settings, update as updateSettings } from "./settings.ts";
import { run } from "./apps/index.ts";
import { refresh as refreshToday } from "./apps/today.ts";
import { post, reply } from "./voice.ts";
import { morning, purchase, midnight } from "./events.ts";
import { cfoScan } from "./cfo.ts";
import { friendSwipe, typing as groupTyper } from "./friends.ts";
import { EVENTS, categorize } from "./simulate.ts";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const bad = (error: string, status = 400) => json({ error }, status);
const thread = (v: unknown): Thread => (v === "group" ? "group" : "dime");
const body = (req: Request) => req.json().catch(() => ({})) as Promise<any>;

const demo: Record<string, (b: any) => unknown> = {
  swipe: (b) => {
    const amount = Number(b.amount);
    if (!b.merchant || !(amount > 0)) throw new Error("merchant and a positive amount");
    purchase({ merchant: String(b.merchant), amount, category: String(b.category || categorize(String(b.merchant))) });
  },
  ...EVENTS, // simulated bank / brokerage / Venmo events (simulate.ts)
  morning: () => morning(),
  midnight: () => midnight(),
  "skip-day": async () => {
    await midnight();
    await morning();
  },
  reset: () => (reset(), (demoLog.length = 0)),
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
  connect: (b) => {
    if (!accounts.connect(String(b.id || "chase"))) throw new Error("no such account");
  },
  tone: (b) => {
    if (b.tone !== "nice" && b.tone !== "savage") throw new Error("tone is nice or savage");
    state.user.tone = b.tone;
  },
  // Charles's line, posted for him so he doesn't type on stage; Dime (or the group) answers as usual.
  say: (b) => {
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) throw new Error("text");
    const t = thread(b.thread);
    post({ thread: t, direction: "in", body: text });
    return reply(t, text);
  },
  // Payoff: top the goal up to one sweep short of the price, then midnight sweeps the rest in.
  "fill-goal": () => {
    const g = state.goal;
    g.saved = Math.max(g.saved, g.price - money.today(state, now()));
    return midnight();
  },
};

// The panel's log: demo actions (and async failures) interleaved with the thread, newest last.
const demoLog: { at: string; text: string; error?: boolean }[] = [];
const logDemo = (text: string, error = false) => {
  demoLog.push({ at: now().toISOString(), text, error });
  demoLog.splice(0, demoLog.length - 20);
};
function demoState() {
  const at = now();
  const g = state.goal;
  const said = state.messages.slice(-10).map((m) => {
    const who = m.direction === "in" ? "Charles" : (m.sender ?? "Dime");
    const what = m.app ? `[${state.apps[m.app]?.kind ?? "card"}]` : m.body;
    return { at: m.created_at, text: `${m.thread === "group" ? "group · " : ""}${who}: ${what}` };
  });
  return {
    now: at.toISOString(),
    today: money.today(state, at),
    goal: { name: g.name, saved: g.saved, price: g.price, pct: money.pct(state) },
    fund: state.user.fund,
    tone: state.user.tone,
    force: state.forceBlackjack,
    chase: state.accounts.find((a) => a.id === "chase")?.connected ?? false,
    typing: state.typing,
    pendingInvest: state.pendingInvest?.amount ?? null,
    log: [...demoLog, ...said].sort((a, b) => a.at.localeCompare(b.at)).slice(-10),
  };
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 8787,
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

    "/api/settings": {
      GET: () => json(settings()),
      POST: async (req) => {
        try {
          return json(updateSettings(await body(req)));
        } catch (e) {
          return bad((e as Error).message);
        }
      },
    },

    "/api/accounts": () => json(accounts.accounts()),
    "/api/accounts/:id/connect": {
      POST: (req) => {
        const a = accounts.connect(req.params.id);
        return a ? json({ account: a }) : bad("not_found", 404);
      },
    },

    "/api/demo/state": () => json(demoState()),
    "/api/demo/:action": {
      POST: async (req) => {
        const action = demo[req.params.action];
        if (!action) return bad("not_found", 404);
        const b = await body(req);
        const name = [req.params.action, ...Object.values(b ?? {})].join(" ");
        try {
          // Events resolve after Dime finishes typing; the panel only needs the state change.
          void Promise.resolve(action(b)).catch((e) => (console.error(name, e), logDemo(`${name} failed: ${(e as Error).message}`, true)));
        } catch (e) {
          logDemo(`${name} failed: ${(e as Error).message}`, true);
          return bad((e as Error).message);
        }
        logDemo(name);
        return json({ ok: true, now: now().toISOString(), today: money.today(state, now()) });
      },
    },

    "/api/*": () => bad("not_found", 404),
  },
});

console.log(`dime server on http://localhost:${server.port}`);
