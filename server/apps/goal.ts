// The `goal` mini app: one sweep, recorded. Opened after midnight has already added `delta` to
// goal.saved; the card fills from the old level to the new one. Frozen after that.
import { state, id, type App } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";

export type GoalState = {
  name: string;
  price: number;
  from: { saved: number; pct: number; eta: string };
  to: { saved: number; pct: number; eta: string };
  delta: number;
};

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
  return { id: id(), kind: "goal", version: 1, state: s };
}

export const actions: Record<string, (app: App, body: any) => void> = {};
