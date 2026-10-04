// The `goal` mini app: one sweep, recorded, for one goal of the priority list (state.goals). Opened
// after midnight (or CFO savings, or the demo's fill-goal) has already added `delta` to that goal's saved; the card fills from the old level to the new
// one. When that fills a store goal, the card is the payoff: Order it / Not yet inside the card; a fund
// or trip that fills is just Done (no ask) and the next goal takes the sweeps.
// Ordering is staged: working ~1.2s, then a covered purchase (today's number doesn't move) paid from
// the goal's saved, the goal is marked done, and Dime names the next one.
import { state, id, type App, type Goal } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { speak, usd } from "../voice.ts";

export type GoalState = {
  id: string;
  name: string;
  emoji: string;
  store?: string; // set = a thing he buys (Order it); absent = Done when full
  price: number;
  from: { saved: number; pct: number; eta: string };
  to: { saved: number; pct: number; eta: string };
  delta: number;
  /** The small money line: "+$30 from Oct 4", "+$23 from Comcast", "Full", or "" (new goal). */
  note: string;
  /** Only on a card that filled the goal: the in-card ask and its outcome. */
  order?: { status: "open" | "ordering" | "ordered" | "declined"; outcome: string | null };
};

const ORDER_MS = 1200;
const pctOf = (saved: number, price: number) => Math.min(100, Math.round((saved / price) * 100));

const goalOf = (gid?: string) => (gid && state.goals.find((g) => g.id === gid)) || money.activeGoal(state);

/** `id` = the goal (default: the active one); `delta` = what just landed on it; `source` names where
 *  it came from: the swept day ("Oct 4") or a saving ("Comcast"). */
export function create(input: { id?: string; delta?: number; source?: string } = {}): App {
  const g = goalOf(input.id);
  const at = now();
  const delta = Math.max(0, input.delta ?? 0);
  const before = g.saved - delta;
  const s: GoalState = {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    ...(g.store ? { store: g.store } : {}),
    price: g.price,
    from: { saved: before, pct: pctOf(before, g.price), eta: money.etaDate(state, at, money.etaOf(state, at, g.id, before)).toISOString() },
    to: { saved: g.saved, pct: money.pctOf(g), eta: money.etaDate(state, at, money.etaOf(state, at, g.id)).toISOString() },
    delta,
    note: "",
  };
  s.note = s.to.pct >= 100 ? (g.store ? "Full" : "Done") : delta > 0 ? `+${usd(delta)} from ${input.source ?? "today"}` : input.source ? `Nothing left ${input.source}` : "";
  if (g.store && !g.done && g.saved >= g.price) s.order = { status: "open", outcome: null };
  return { id: id(), kind: "goal", version: 1, state: s };
}

/** The words that go with a card that just filled the goal (events.ts midnight, demo fill-goal). */
export const fullLine = (g: Goal = money.activeGoal(state)) => `${usd(g.price)} saved. the ${g.name} is fully funded 🎉 want me to order it?`;

/** Delivery day: the first Thursday at least two days out. */
const arrives = () => ([3, 4].includes(now().getDay()) ? "next Thursday" : "Thursday");

async function order(app: App) {
  const s = app.state as GoalState;
  await Bun.sleep(ORDER_MS);
  if (state.apps[app.id] !== app) return; // reset while working
  const g = goalOf(s.id);
  if (g.id !== s.id || g.done) return;
  const outcome = `Ordered. ${s.name} arrives ${arrives()}.`;
  // Won, not spent: covered, so it never touches today. The goal's savings pay for it.
  state.txns.push({ id: id(), at: now().toISOString(), merchant: g.store ?? s.name, amount: g.price, category: "shopping", kind: "spend", covered: true });
  g.done = { at: now().toISOString() };
  // Every other full card for this goal is answered by this one.
  for (const a of Object.values(state.apps))
    if (a.kind === "goal" && a.state.id === g.id && a.state.order && a.state.order.status !== "ordered") {
      a.state.order = { status: "ordered", outcome };
      a.version++;
    }
  const left = money.today(state, now());
  const next = money.activeGoal(state);
  const queued = !next.done && next.saved < next.price;
  await speak("dime", `${outcome} It cost ${usd(s.price)}, paid from what the goal saved as a covered purchase, so today's number didn't move. Left today: ${usd(left)}. ${queued ? `Next in his goals: ${next.name} ${next.emoji}, ${money.pctOf(next)}% saved; the sweeps go there now. Say so.` : "No goals left: ask what he wants to save for next."}`,
    [`ordered 📦 the ${usd(s.price)} came out of the goal fund, so your ${usd(left)} today didn't budge`, queued ? `next up: ${next.name} ${next.emoji} ${money.pctOf(next)}%` : `ok what are we saving for next? 👀`]);
}

export const actions: Record<string, (app: App, body: any) => void> = {
  order: (app) => {
    const o = (app.state as GoalState).order;
    const g = goalOf((app.state as GoalState).id);
    if (!o || (o.status !== "open" && o.status !== "declined") || g.done || g.saved < g.price) return;
    o.status = "ordering";
    void order(app).catch((e) => console.error("goal order", e));
  },
  decline: (app) => {
    const o = (app.state as GoalState).order;
    if (o?.status === "open") o.status = "declined";
  },
};
