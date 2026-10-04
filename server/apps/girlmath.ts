// The `girlmath` mini app (CONCEPT.md §7): a price as days toward the goal, at a glance. Two
// outcomes for the goal he's saving for now: skip it → the goal lands on its date; buy it → that
// date moves by the price at today's pace. Every number is computed here (money.ts); the card only
// draws it and the model only words it. A frozen record: no actions.
import { state, id, type App, type State } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";

export type GirlMathState = {
  item: string;
  amount: number;
  goal: { name: string; emoji: string; store?: string; pct: number };
  skip: { days: number; date: string }; // goal ETA if he skips it (ISO date)
  buy: { days: number; date: string }; // goal ETA if he buys it
  /** How much later the goal lands: "5 days", or "~3 hours" when it's under a day of pace. */
  later: string;
  /** The price in hours of his pay (Settings hourly); null when unset. */
  hours: number | null;
};

/** The card's numbers. Buying spends money that would have reached the goal, so the buy ETA is the
 *  goal's ETA with `amount` less saved. */
export function girlMath(s: State, at: Date, item: string, amount: number): GirlMathState {
  const g = money.activeGoal(s);
  const skip = money.eta(s, at);
  const buy = Math.max(skip, money.eta(s, at, g.saved - amount));
  const gap = buy - skip;
  const hourly = s.user.hourly;
  const h = hourly > 0 ? amount / hourly : null;
  return {
    item,
    amount,
    goal: { name: g.name, emoji: g.emoji, ...(g.store ? { store: g.store } : {}), pct: money.pctOf(g) },
    skip: { days: skip, date: money.etaDate(s, at, skip).toISOString() },
    buy: { days: buy, date: money.etaDate(s, at, buy).toISOString() },
    later: gap >= 1 ? `${gap} day${gap === 1 ? "" : "s"}` : money.lag(s, at, amount),
    hours: h === null ? null : h >= 10 ? Math.round(h) : Math.round(h * 10) / 10,
  };
}

/** `amount` omitted ("girl math" on its own): his latest card purchase. */
export function create(input: { item?: string; amount?: number } = {}): App {
  let { item, amount } = input;
  if (!(amount && amount > 0)) {
    const last = state.txns.findLast((t) => t.kind === "spend" && !t.covered);
    item = last?.merchant ?? item ?? "that";
    amount = last?.amount ?? 0;
  }
  return { id: id(), kind: "girlmath", version: 1, state: girlMath(state, now(), (item ?? "it").trim() || "it", amount) };
}

export const actions: Record<string, (app: App, body: any) => void> = {};
