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
// A loss waiting for a fund (state.pendingInvest) already left today, as did money he moved from
// today into a fund himself (reason "today", cfo.ts move).
const lost = (s: State, from: Date, to: Date) =>
  sum(within([...s.ledger, ...(s.pendingInvest ? [s.pendingInvest] : [])], from, to).filter((l) => l.reason === "blackjack" || l.reason === "today"));

export function daysLeft(at: Date): number {
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  return end - at.getDate() + 1;
}

/** What's left to spend this month as of `before` (exclusive). */
export function pool(s: State, before: Date): number {
  const from = monthStart(before);
  // Pay is planned (month.income); pay that lands beyond the plan (a third biweekly check, a bonus)
  // is new money for the rest of the month.
  const landed = sum(within(s.txns, from, before).filter((t) => t.kind === "income"));
  return (
    Math.max(s.month.income, landed) -
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

/** Pay landed today beyond the month's plan, spread over the days left (tomorrow's pool has it). */
function extraPay(s: State, start: Date, end: Date): number {
  const landed = (to: Date) => sum(within(s.txns, monthStart(start), to).filter((t) => t.kind === "income"));
  return Math.floor((Math.max(s.month.income, landed(end)) - Math.max(s.month.income, landed(start))) / daysLeft(start));
}

/** Today's allowance net of today's spend, losses and winnings; negative when overspent. */
function net(s: State, at: Date): number {
  const start = dayStart(at);
  const end = new Date(start.getTime() + DAY);
  return budget(s, at) + extraPay(s, start, end) - spentToday(s, at) - lost(s, start, end) + sum(within(s.bonus, start, end));
}
/** Today's number, in whole dollars (card charges have cents; the number doesn't). */
export const today = (s: State, at: Date) => Math.max(0, Math.floor(net(s, at)));
/** How far past today's number the day went (0 if not), in whole dollars. */
export const over = (s: State, at: Date) => Math.max(0, Math.ceil(-net(s, at)));

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
/** Girl math in words: "~3 hours" when it's under a day of pace (a $7 matcha isn't a day), else
 *  rounded days. ceil stays for ETA dates (delay, eta). */
export function lag(s: State, at: Date, amount: number): string {
  const d = amount / pace(s, at);
  if (d < 1) {
    const h = Math.max(1, Math.round(24 * d));
    return `~${h} hour${h === 1 ? "" : "s"}`;
  }
  const n = Math.round(d);
  return `${n} day${n === 1 ? "" : "s"}`;
}
export const pct = (s: State) => Math.min(100, Math.round((s.goal.saved / s.goal.price) * 100));
export const etaDate = (s: State, at: Date, days = eta(s, at)) =>
  new Date(dayStart(at).getTime() + days * DAY);
