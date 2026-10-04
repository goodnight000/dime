// Every number Dime says comes from here: pure functions of the state and a moment. The voice only
// words them. Rules: ARCHITECTURE.md "Money rules".
import type { State, Txn } from "./state.ts";

const DAY = 86_400_000;
export const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
/** Entries in [from, to). */
const within = <T extends { at: string }>(xs: T[], from: Date, to: Date) =>
  xs.filter((x) => {
    const t = new Date(x.at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });

/** Discretionary spend: card purchases not won at blackjack, less refunds. */
const spent = (txns: Txn[]) =>
  sum(txns.filter((t) => t.kind === "spend" && !t.covered)) - sum(txns.filter((t) => t.kind === "refund"));
// A loss waiting for a fund (state.pendingInvest) already left today.
const lost = (s: State, from: Date, to: Date) =>
  sum(within([...s.ledger, ...(s.pendingInvest ? [s.pendingInvest] : [])], from, to).filter((l) => l.reason === "blackjack"));

export function daysLeft(at: Date): number {
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  return end - at.getDate() + 1;
}

/** What's left to spend this month as of `before` (exclusive). */
export function pool(s: State, before: Date): number {
  const from = monthStart(before);
  return (
    s.month.income -
    s.month.bills -
    s.month.invest -
    spent(within(s.txns, from, before)) -
    sum(within(s.sweeps, from, before)) -
    lost(s, from, before) +
    sum(within(s.bonus, from, before))
  );
}

/** The day's allowance before anything happened today. */
export function budget(s: State, at: Date): number {
  const start = dayStart(at);
  return Math.max(0, Math.floor(pool(s, start) / daysLeft(at)));
}

export function spentToday(s: State, at: Date): number {
  const start = dayStart(at);
  return spent(within(s.txns, start, new Date(start.getTime() + DAY)));
}

/** Today's allowance net of today's spend, losses and winnings; negative when overspent. */
function net(s: State, at: Date): number {
  const start = dayStart(at);
  const end = new Date(start.getTime() + DAY);
  return budget(s, at) - spentToday(s, at) - lost(s, start, end) + sum(within(s.bonus, start, end));
}
/** Today's number. */
export const today = (s: State, at: Date) => Math.max(0, net(s, at));
/** How far past today's number the day went (0 if not). */
export const over = (s: State, at: Date) => Math.max(0, -net(s, at));

/** Girl math pace: average sweep over the last 7 days, else a quarter of today. Never below $1. */
export function pace(s: State, at: Date): number {
  const start = dayStart(at);
  const recent = within(s.sweeps, new Date(start.getTime() - 7 * DAY), start);
  const p = recent.length ? sum(recent) / recent.length : today(s, at) * 0.25;
  return Math.max(1, p);
}

export const eta = (s: State, at: Date, saved = s.goal.saved) =>
  Math.max(0, Math.ceil((s.goal.price - saved) / pace(s, at)));
export const delay = (s: State, at: Date, amount: number) => Math.ceil(amount / pace(s, at));
export const pct = (s: State) => Math.min(100, Math.round((s.goal.saved / s.goal.price) * 100));
export const etaDate = (s: State, at: Date, days = eta(s, at)) =>
  new Date(dayStart(at).getTime() + days * DAY);
