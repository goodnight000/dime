// The `goal` mini app: one sweep, recorded. Opened after midnight (or CFO savings, or the demo's
// fill-goal) has already added `delta` to goal.saved; the card fills from the old level to the new
// one. When that fills the goal, the card is the payoff: Order it / Not yet inside the card.
// Ordering is staged: working ~1.2s, then a covered purchase (today's number doesn't move) paid from
// goal.saved, and Dime asks what's next.
import { state, id, type App } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { speak, usd } from "../voice.ts";

export type GoalState = {
  name: string;
  price: number;
  from: { saved: number; pct: number; eta: string };
  to: { saved: number; pct: number; eta: string };
  delta: number;
  /** Only on a card that filled the goal: the in-card ask and its outcome. */
  order?: { status: "open" | "ordering" | "ordered" | "declined"; outcome: string | null };
};

const ORDER_MS = 1200;
const pctOf = (saved: number, price: number) => Math.min(100, Math.round((saved / price) * 100));

export function create(input: { delta?: number } = {}): App {
  const g = state.goal;
  const at = now();
  const delta = Math.max(0, input.delta ?? 0);
  const before = g.saved - delta;
  const s: GoalState = {
    name: g.name,
    price: g.price,
    from: { saved: before, pct: pctOf(before, g.price), eta: money.etaDate(state, at, money.eta(state, at, before)).toISOString() },
    to: { saved: g.saved, pct: money.pct(state), eta: money.etaDate(state, at).toISOString() },
    delta,
  };
  if (g.saved >= g.price) s.order = { status: "open", outcome: null };
  return { id: id(), kind: "goal", version: 1, state: s };
}

/** The words that go with a card that just filled the goal (events.ts midnight, demo fill-goal). */
export const fullLine = () => `${state.goal.name} fund full: ${usd(state.goal.price)}. want me to order it?`;

/** Delivery day: the first Thursday at least two days out. */
const arrives = () => ([3, 4].includes(now().getDay()) ? "next Thursday" : "Thursday");

async function order(app: App) {
  const s = app.state as GoalState;
  await Bun.sleep(ORDER_MS);
  if (state.apps[app.id] !== app) return; // reset while working
  const g = state.goal;
  const outcome = `Ordered. ${s.name} arrives ${arrives()}.`;
  // Won, not spent: covered, so it never touches today. The fund pays for it.
  state.txns.push({ id: id(), at: now().toISOString(), merchant: "Apple", amount: s.price, category: "shopping", kind: "spend", covered: true });
  g.saved = Math.max(0, g.saved - s.price);
  // Every other full card for this goal is answered by this one.
  for (const a of Object.values(state.apps))
    if (a.kind === "goal" && a.state.order && a.state.order.status !== "ordered") {
      a.state.order = { status: "ordered", outcome };
      a.version++;
    }
  const left = money.today(state, now());
  await speak("dime", `${outcome} It cost ${usd(s.price)}, paid from the goal fund as a covered purchase, so today's number didn't move. Left today: ${usd(left)}. Now ask what he wants to save for next.`,
    [`paid from the fund 📱 today didn't move`, `what are we saving for next?`]);
}

export const actions: Record<string, (app: App, body: any) => void> = {
  order: (app) => {
    const o = (app.state as GoalState).order;
    if (!o || (o.status !== "open" && o.status !== "declined") || state.goal.saved < state.goal.price) return;
    o.status = "ordering";
    void order(app).catch((e) => console.error("goal order", e));
  },
  decline: (app) => {
    const o = (app.state as GoalState).order;
    if (o?.status === "open") o.status = "declined";
  },
};
