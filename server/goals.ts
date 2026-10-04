// Goals (GET/POST/PUT /api/goals, PATCH/DELETE /api/goals/:id): the priority list Settings edits and
// the agent's add_goal / update_goal / reorder_goals / remove_goal call. One set of rules, so texting
// Dime and the page never disagree. Money math (what fills first, ETAs) is in money.ts.
import { state, type Goal } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";

export type GoalStatus = "active" | "queued" | "ready" | "ordered" | "done";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Where a goal stands: saving now, waiting its turn, full and ready to order, ordered, or done (full, nothing to buy). */
export function status(g: Goal): GoalStatus {
  if (g.done) return "ordered";
  if (g.saved >= g.price) return g.store ? "ready" : "done";
  return money.activeGoal(state).id === g.id ? "active" : "queued";
}

/** Every goal in priority order with its percent, status and queue-aware date. */
export function list() {
  const at = now();
  return state.goals.map((g) => {
    const days = money.etaOf(state, at, g.id);
    return { ...g, pct: money.pctOf(g), status: status(g), eta_days: days, eta_date: ymd(money.etaDate(state, at, days)) };
  });
}

export const find = (key: string) => {
  const k = key.trim().toLowerCase();
  return state.goals.find((g) => g.id === key) ?? state.goals.find((g) => g.name.toLowerCase() === k) ?? state.goals.find((g) => g.name.toLowerCase().includes(k));
};
const must = (key: string) => {
  const g = find(key);
  if (!g) throw new RangeError(`No goal called ${key}`);
  return g;
};

const name = (v: unknown) => {
  const n = String(v ?? "").trim().slice(0, 40);
  if (!n) throw new RangeError("The goal needs a name");
  return n;
};
const price = (v: unknown) => {
  const n = Number(v);
  if (typeof v === "boolean" || v === "" || v === null || !Number.isFinite(n) || n < 1 || n > 1_000_000) throw new RangeError("Price must be between $1 and $1,000,000");
  return Math.round(n);
};
const emoji = (v: unknown) => [...String(v ?? "").trim()].slice(0, 4).join("") || "🎯";
const store = (v: unknown) => String(v ?? "").trim().slice(0, 30) || undefined;

/** Money on a goal that no longer needs it (price cut below saved, or removed) rolls on in priority order. */
function spill(g: Goal, amount: number) {
  if (amount <= 0) return;
  const rest = state.goals.filter((x) => x !== g);
  const parts = money.pour(rest, amount);
  rest.forEach((x, i) => (x.saved += parts[i]));
}

/** `position` is 1-based priority; default last. */
export function add(b: Record<string, unknown>): Goal {
  const g: Goal = { id: crypto.randomUUID().slice(0, 8), name: name(b.name), price: price(b.price), saved: 0, emoji: emoji(b.emoji), createdAt: now().toISOString() };
  const s = store(b.store);
  if (s) g.store = s;
  const pos = b.position == null ? state.goals.length : Math.max(0, Math.min(state.goals.length, Math.round(Number(b.position) - 1) || 0));
  state.goals.splice(pos, 0, g);
  return g;
}

export function update(key: string, b: Record<string, unknown>): Goal {
  const g = must(key);
  const next = {
    name: "name" in b ? name(b.name) : g.name,
    price: "price" in b ? price(b.price) : g.price,
    emoji: "emoji" in b ? emoji(b.emoji) : g.emoji,
    store: "store" in b ? store(b.store) : g.store,
  };
  Object.assign(g, next);
  if (!next.store) delete g.store;
  if (!g.done && g.saved > g.price) {
    const extra = g.saved - g.price;
    g.saved = g.price;
    spill(g, extra);
  }
  return g;
}

/** `order` lists goals (ids or names) from first to last; any left out keep their order after them. */
export function reorder(order: unknown): Goal[] {
  if (!Array.isArray(order)) throw new RangeError("order is a list of goals");
  const picked = order.map((k) => must(String(k)));
  state.goals = [...new Set([...picked, ...state.goals])];
  return state.goals;
}

/** One goal not yet ordered stays: something has to catch tonight's sweep. Half-saved money rolls to the next goals. */
export function remove(key: string): Goal {
  const g = must(key);
  if (!state.goals.some((x) => x !== g && !x.done)) throw new RangeError("Keep at least one goal to save toward");
  state.goals = state.goals.filter((x) => x !== g);
  if (!g.done && g.saved < g.price) spill(g, g.saved); // a finished fund keeps its money; a half-saved goal's moves on
  return g;
}
