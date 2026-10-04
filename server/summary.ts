// Dashboard numbers (GET /api/summary) and the lived-in history behind them. Every figure is a
// function of the state and the demo clock: money.ts for the day's math, fund prices from a seeded
// walk over the catalog's illustrative returns (FUNDS), so a reload or a rehearsal shows the same.
import * as money from "./money.ts"; // first: seedHistory runs while state.ts is still evaluating
import { state, id, type State, type Txn, type FundId } from "./state.ts";
import { FUNDS } from "./funds-data.ts";
import { now } from "./clock.ts";

const DAY = 86_400_000;
const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
const cents = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayNum = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const endOfDay = (d: Date) => new Date(money.dayStart(d).getTime() + DAY - 1);

// ---- Fund prices ---------------------------------------------------------------------------
// Daily closes: drift from the catalog's illustrative 1y return, noise by risk level, hashed per
// fund and day. Cash never dips. ponytail: O(days) product per call; memoize if the window grows.
const VOL = { 1: 0, 2: 0.008, 3: 0.012, 4: 0.02 } as const;
const BASE = dayNum(new Date(2026, 5, 1)); // prices are 1.0 on Jun 1 2026
function noise(n: number, f: number): number {
  let h = (n * 374761393 + (f + 28) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1; // −1..1
}
const prices = new Map<string, number>();
function price(fund: FundId, n: number): number {
  const key = `${fund}:${n}`;
  const hit = prices.get(key);
  if (hit !== undefined) return hit;
  const i = FUNDS.findIndex((f) => f.id === fund);
  const f = FUNDS[i];
  const drift = f ? Math.log(1 + f.ret.pct / 100) / 365 : 0;
  const vol = f ? VOL[f.risk] * (fund === "DRAM" ? 1.3 : 1) : 0;
  let p = 1;
  for (let d = BASE + 1; d <= n; d++) p *= 1 + drift + (fund === "CASH" ? 0 : vol * noise(d, i + 1));
  prices.set(key, p);
  return p;
}

type Entry = State["ledger"][number];
/** What one ledger entry is worth at the close of `day` (0 before it was made). */
const worth = (e: Entry, day: Date) =>
  new Date(e.at) > endOfDay(day) ? 0 : e.amount * (price(e.fund, dayNum(day)) / price(e.fund, dayNum(new Date(e.at))));

function invested(s: State, at: Date) {
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1);
  const lastMonth = new Date(monthStart.getTime() - 1);
  const byFund = new Map<FundId, { value: number; cost: number }>();
  for (const e of s.ledger) {
    const f = byFund.get(e.fund) ?? { value: 0, cost: 0 };
    f.value += worth(e, at);
    f.cost += e.amount;
    byFund.set(e.fund, f);
  }
  const total = [...byFund.values()].reduce((t, f) => t + f.value, 0);
  // Growth this month: today's value less last month's close less new money put in this month.
  const added = sum(s.ledger.filter((e) => new Date(e.at) >= monthStart && new Date(e.at) <= at));
  const before = s.ledger.reduce((t, e) => t + worth(e, lastMonth), 0);
  // The trailing 31 days (so the middle label sits on a point), one close per day, today last.
  const series = Array.from({ length: 31 }, (_, i) => {
    const day = new Date(money.dayStart(at).getTime() - (30 - i) * DAY + DAY / 2);
    return { date: ymd(day), value: cents(s.ledger.reduce((t, e) => t + worth(e, day), 0)) };
  });
  const funds = [...byFund]
    .filter(([, f]) => f.value > 0)
    .map(([fid, f]) => {
      const meta = FUNDS.find((x) => x.id === fid);
      return {
        id: fid,
        name: meta?.name ?? fid,
        ticker: meta && meta.ticker !== meta.name ? meta.ticker : "",
        value: cents(f.value),
        change_pct: Math.round(((f.value - f.cost) / f.cost) * 1000) / 10,
      };
    })
    .sort((a, b) => b.value - a.value);
  return {
    total: cents(total),
    month_delta: cents(total - before - added),
    series,
    funds,
    waiting: s.pendingInvest?.amount ?? 0,
  };
}

// ---- Days ----------------------------------------------------------------------------------
export type DayState = "under" | "over" | "none" | "future" | "today";
/** Five weeks, Sunday first, ending this Saturday: four weeks of outcomes and this one. */
function days(s: State, at: Date) {
  const start = money.dayStart(at);
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay() - 28, 12);
  return Array.from({ length: 35 }, (_, i) => {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12);
    const went = money.spentToday(s, day) + lostOn(s, day);
    let kind: DayState;
    if (day > at && money.dayStart(day).getTime() > start.getTime()) kind = "future";
    else if (money.dayStart(day).getTime() === start.getTime()) kind = "today";
    else if (money.over(s, day) > 0) kind = "over";
    else kind = went > 0 ? "under" : "none";
    return {
      date: ymd(day),
      day: day.getDate(),
      kind,
      // Today keeps its ring; its fill says how it's going so far.
      so_far: kind === "today" ? (money.over(s, day) > 0 ? "over" : went > 0 ? "under" : null) : null,
    };
  });
}
const lostOn = (s: State, day: Date) => {
  const from = money.dayStart(day).getTime();
  // A loss waiting for a fund already left the day (money.ts counts it too).
  const losses = [...s.ledger, ...(s.pendingInvest ? [s.pendingInvest] : [])];
  return sum(losses.filter((l) => l.reason === "blackjack" && new Date(l.at).getTime() >= from && new Date(l.at).getTime() < from + DAY));
};

// ---- The summary ---------------------------------------------------------------------------
const label = (c: string) => c[0].toUpperCase() + c.slice(1);

export function summary() {
  const at = now();
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1);
  const month = state.txns.filter((t) => new Date(t.at) >= monthStart && new Date(t.at) <= at);
  const byCategory: Record<string, number> = {};
  for (const t of month) if (t.kind === "spend" && !t.covered) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  const byFund: Record<string, number> = {};
  for (const l of state.ledger) byFund[l.fund] = (byFund[l.fund] ?? 0) + l.amount;
  // One cell per day this month so far (wave 0 shape, kept for other readers).
  const calendar = [];
  for (let d = 1; d <= at.getDate(); d++) {
    const day = new Date(at.getFullYear(), at.getMonth(), d, 12);
    const key = day.toDateString();
    calendar.push({
      date: ymd(day),
      budget: money.budget(state, day),
      spent: money.spentToday(state, day),
      swept: sum(state.sweeps.filter((s) => new Date(s.at).toDateString() === key)),
    });
  }
  const g = state.goal;
  return {
    now: at.toISOString(),
    month_name: at.toLocaleString("en-US", { month: "long" }),
    today: money.today(state, at),
    over: money.over(state, at),
    budget: money.budget(state, at),
    pool: money.pool(state, at),
    days_left: money.daysLeft(at),
    to_goal: Math.max(0, g.price - g.saved),
    goal: { ...g, pct: money.pct(state), pace: money.pace(state, at), eta: money.eta(state, at), eta_date: ymd(money.etaDate(state, at)) },
    invested: invested(state, at),
    spending: Object.entries(byCategory)
      .map(([category, amount]) => ({ category, label: label(category), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    days: days(state, at),
    ledger: byFund,
    spend_by_category: byCategory,
    calendar,
    txns: month,
    user: state.user,
  };
}
export type Summary = ReturnType<typeof summary>;

// ---- History -------------------------------------------------------------------------------
/**
 * Fills the weeks before the seed with real outcomes: card spend per day sized against that day's
 * budget (money.budget), the leftover swept at 23:59 like midnight() does, and a few deposits into
 * the ledger. Only touches days before this month, so today's number and the pace are unchanged.
 * Called from state.ts on seed and reset. Uses nothing from this module's top level (it runs
 * while the import cycle with state.ts is still evaluating).
 */
export function seedHistory(s: State): State {
  const at = (daysAgo: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // What each day of last month left over, swept to the goal at 23:59: a few dollars most days,
  // more late in the month; negative = that much over budget (no sweep, red), null = a no-spend day
  // (the whole budget swept, gold). Days the seed already swept keep the seed's sweep. Tuned so
  // last month's sweeps add up to about goal.saved.
  const LEFT: (number | null)[] = [3, 0, 8, -40, 5, 0, 10, 6, 0, -65, 4, 9, null, 6, 0, 7, -90, 4, 12, 8, 0, -30, 14, 10, 16, 12, 10, 12, 14, 12];
  // A day: coffee most mornings, lunch, then the evening's big one (dinner out, Uber, shopping).
  const LUNCH: [string, string][] = [["Sweetgreen", "food"], ["Chipotle", "food"], ["Tartine", "food"], ["Trader Joe's", "groceries"], ["Whole Foods", "groceries"]];
  const NIGHT: [string, string][] = [
    ["Nopa", "food"], ["Uber", "transport"], ["Uniqlo", "shopping"], ["DoorDash", "food"], ["AMC", "fun"],
    ["Zuni Café", "food"], ["Target", "shopping"], ["Lyft", "transport"], ["Sephora", "shopping"], ["Spin Bar", "fun"],
  ];
  const txns: Txn[] = [];
  const sweepsByDay = new Map(s.sweeps.map((w) => [new Date(w.at).toDateString(), w]));
  for (let daysAgo = 33, i = 0; daysAgo >= 1; daysAgo--, i++) {
    const day = at(daysAgo, 12);
    if (day >= monthStart) break;
    const budget = money.budget({ ...s, txns: [...s.txns, ...txns] }, day);
    const swept = sweepsByDay.get(day.toDateString());
    const left = swept ? swept.amount : LEFT[i % LEFT.length];
    const spend = left === null ? 0 : Math.max(0, budget - left);
    if (spend > 0) {
      const coffee = i % 4 === 3 ? 0 : 7;
      const lunch = Math.round((spend - coffee) * 0.3);
      const add = (h: number, [merchant, category]: [string, string], amount: number) =>
        amount > 0 && txns.push({ id: id(), at: at(daysAgo, h, 20).toISOString(), merchant, amount, category, kind: "spend" });
      add(8, ["Blue Bottle", "coffee"], coffee);
      add(12, LUNCH[i % LUNCH.length], lunch);
      add(19, NIGHT[i % NIGHT.length], spend - coffee - lunch);
    }
    if (!swept && budget - spend > 0) s.sweeps.push({ at: at(daysAgo, 23, 59).toISOString(), amount: budget - spend });
  }
  s.txns.unshift(...txns);
  s.sweeps.sort((a, b) => a.at.localeCompare(b.at));
  // Money moved in before Dime picked a fund for losses: two funds, four deposits.
  s.ledger.unshift(
    ...([[40, "VOO", 500], [31, "QQQ", 250], [18, "VOO", 300], [12, "QQQ", 200]] as const).map(([daysAgo, fund, amount]) => ({
      fund: fund as FundId, amount, at: at(daysAgo, 10).toISOString(), reason: "deposit",
    })),
  );
  return s;
}
