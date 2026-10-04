// The dashboard calendar (GET /api/calendar?month=YYYY-MM): one entry per day of a month with what
// was spent (all / variable / fixed), that day's number and how the day went, the bills that posted
// or are due, and everything else that happened to Charles that day (paydays, sweeps, blackjack,
// group bets, CFO actions, refunds, double charges). Pure: a function of the state and a moment.
import * as money from "./money.ts";
import type { State, Txn } from "./state.ts";

const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ym = (d: Date) => ymd(d).slice(0, 7);
const usd = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

export type Cost = "fixed" | "variable";
/** Fixed = bills, rent, subscriptions; variable = discretionary card spend (a refund nets it down).
 *  Income and transfers are neither. A purchase won at blackjack never counted, so neither. */
export function costOf(t: Txn, subs: Set<string>): Cost | null {
  if (t.kind === "bill") return "fixed";
  if (t.kind === "spend") return t.category === "bills" || t.category === "subscriptions" || subs.has(t.merchant) ? "fixed" : "variable";
  if (t.kind === "refund") return "variable";
  return null;
}
const signedSpend = (t: Txn, cost: Cost | null) => (cost === null || t.covered ? 0 : t.kind === "refund" ? -t.amount : t.amount);

export type Bill = { merchant: string; amount: number; at: string; status: "paid" | "due" };
export type CalEvent = {
  kind: "payday" | "sweep" | "blackjack-win" | "blackjack-loss" | "market" | "cfo" | "refund" | "duplicate" | "invest" | "goal";
  label: string;
  amount: number | null;
  at: string;
  merchant?: string;
};

/** Proposals Dime carried out, dated by the message that showed the card. */
function cfoActions(s: State) {
  const shown = new Map(s.messages.filter((m) => m.app).map((m) => [m.app!, m.created_at]));
  return Object.values(s.apps)
    .filter((a) => a.kind === "proposal" && a.state.status === "done" && shown.has(a.id))
    .map((a) => ({ at: shown.get(a.id)!, st: a.state as { find: string; merchant?: string; title: string; outcome: { text: string } | null; amount?: number; was?: number } }));
}

/** Bills due after `at`: this month's from state.upcoming (and trials about to convert); later months
 *  repeat this month's recurring bills on the same day of month, less anything Dime cancelled. */
function projected(s: State, at: Date, month: string): Bill[] {
  const cancelled = new Set(cfoActions(s).filter((c) => c.st.find === "unused" && c.st.merchant).map((c) => c.st.merchant!));
  // A bill Dime negotiated back down bills at the old price from now on.
  const lowered = new Map(cfoActions(s).filter((c) => c.st.find === "bill" && c.st.merchant).map((c) => [c.st.merchant!, c.st.was!]));
  const cur = ym(at);
  const thisMonth = [
    ...s.upcoming.map((u) => ({ merchant: u.merchant, amount: u.amount, at: u.at })),
    ...s.subscriptions
      .filter((x) => x.trialEnds && ym(new Date(x.trialEnds)) === cur && new Date(x.trialEnds) > at && !s.upcoming.some((u) => u.merchant === x.merchant))
      .map((x) => ({ merchant: x.merchant, amount: x.price, at: x.trialEnds! })),
  ].filter((b) => !cancelled.has(b.merchant));
  if (month === cur) return thisMonth.filter((b) => new Date(b.at) > at).map((b) => ({ ...b, status: "due" as const }));
  if (month < cur) return [];
  // Later months: everything that billed this month or is still due, by merchant (the latest wins).
  const base = new Map<string, { merchant: string; amount: number; at: string }>();
  const mStart = new Date(at.getFullYear(), at.getMonth(), 1);
  for (const t of s.txns) if (t.kind === "bill" && new Date(t.at) >= mStart && new Date(t.at) <= at) base.set(t.merchant, t);
  for (const b of thisMonth) base.set(b.merchant, b);
  for (const x of s.subscriptions) if (x.trialEnds && new Date(x.trialEnds) > mStart && !base.has(x.merchant)) base.set(x.merchant, { merchant: x.merchant, amount: x.price, at: x.trialEnds });
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [...base.values()]
    .filter((b) => !cancelled.has(b.merchant))
    .map((b) => {
      const d = new Date(b.at);
      return { merchant: b.merchant, amount: lowered.get(b.merchant) ?? b.amount, at: new Date(y, m - 1, Math.min(d.getDate(), last), 6).toISOString(), status: "due" as const };
    });
}

/** Everything else that happened that day, from the ledger, sweeps, bonuses, txns and proposals. */
function eventsOf(s: State, txns: Txn[], from: number, to: number): CalEvent[] {
  const inDay = (x: { at: string }) => {
    const t = new Date(x.at).getTime();
    return t >= from && t < to;
  };
  const out: CalEvent[] = [];
  for (const t of txns) {
    if (t.kind === "income") out.push({ kind: "payday", label: `Payday · ${t.merchant}`, amount: t.amount, at: t.at, merchant: t.merchant });
    if (t.kind === "refund") out.push({ kind: "refund", label: `Refund · ${t.merchant}`, amount: t.amount, at: t.at, merchant: t.merchant });
    if (t.covered) {
      // A covered purchase is a blackjack win, unless it's a goal being ordered (listed below).
      const goal = (s.goals ?? []).some((g) => g.done && g.store === t.merchant && g.price === t.amount);
      if (!goal) out.push({ kind: "blackjack-win", label: `Won ${t.merchant} at blackjack`, amount: t.amount, at: t.at, merchant: t.merchant });
    }
    if (t.kind === "spend") {
      // A second identical charge within 10 minutes of an earlier one (simulate.ts's duplicate).
      const i = s.txns.indexOf(t);
      const twice = s.txns.some((o, j) => j < i && o.kind === "spend" && o.merchant === t.merchant && o.amount === t.amount &&
        Math.abs(new Date(t.at).getTime() - new Date(o.at).getTime()) <= 10 * 60_000);
      if (twice) out.push({ kind: "duplicate", label: `${t.merchant} charged twice`, amount: t.amount, at: t.at, merchant: t.merchant });
    }
  }
  for (const w of s.sweeps.filter(inDay)) out.push({ kind: "sweep", label: "Left over, swept to goals", amount: w.amount, at: w.at });
  for (const g of s.goals ?? []) {
    if (inDay({ at: g.createdAt })) out.push({ kind: "goal", label: `New goal: ${g.name}`, amount: g.price, at: g.createdAt });
    if (g.done && inDay(g.done)) out.push({ kind: "goal", label: g.store ? `Ordered the ${g.name}` : `${g.name} done`, amount: g.price, at: g.done.at, merchant: g.store });
  }
  const losses = [...s.ledger, ...(s.pendingInvest ? [{ ...s.pendingInvest, fund: null }] : [])];
  for (const l of losses.filter(inDay)) {
    if (l.reason === "blackjack") out.push({ kind: "blackjack-loss", label: l.fund ? `Lost at blackjack → ${l.fund}` : "Lost at blackjack", amount: l.amount, at: l.at });
    if (l.reason === "deposit") out.push({ kind: "invest", label: `Invested → ${l.fund}`, amount: l.amount, at: l.at });
  }
  for (const b of s.bonus.filter(inDay)) out.push({ kind: "market", label: b.amount >= 0 ? "Won the group bet" : "Lost the group bet", amount: b.amount, at: b.at });
  for (const c of cfoActions(s).filter(inDay)) {
    const what = c.st.outcome?.text ?? c.st.title;
    out.push({ kind: "cfo", label: c.st.merchant && !what.includes(c.st.merchant) ? `${c.st.merchant}: ${what}` : what, amount: c.st.amount ?? null, at: c.at, merchant: c.st.merchant });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Quartile-ish cut points (20/40/60/80th percentile of days that spent anything): level 0 is no
 *  spend, 1–5 climb the ramp. One scale for the whole history, so months compare. */
function cuts(xs: number[]): number[] {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [1, 2, 3, 4];
  return [0.2, 0.4, 0.6, 0.8].map((q) => cents(v[Math.min(v.length - 1, Math.floor(q * v.length))]));
}

/** A month's flat daily number: what the plan leaves to spend, spread evenly over its days. */
export const flat = (s: State, day: Date) =>
  Math.floor((s.month.income - s.month.bills - s.month.invest) / new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate());
/** Money that left the day without a purchase: blackjack losses and moves out of today, less group-bet winnings. */
const lostOn = (s: State, from: number, to: number) => {
  const inDay = (x: { at: string }) => new Date(x.at).getTime() >= from && new Date(x.at).getTime() < to;
  const out = [...s.ledger, ...(s.pendingInvest ? [s.pendingInvest] : [])].filter((l) => inDay(l) && (l.reason === "blackjack" || l.reason === "today"));
  return out.reduce((t, l) => t + l.amount, 0) - s.bonus.filter(inDay).reduce((t, b) => t + b.amount, 0);
};

/** The diverging heat step: +1..+3 by the share of the day's number left (under), −1..−3 by how far
 *  over it went, 0 exactly on it. A day before the history began stays 0 (no data). */
export function heatOf(net: number, budget: number): number {
  if (!budget || Math.abs(net) < 1) return 0;
  const r = net / budget;
  if (r > 0) return r >= 0.75 ? 3 : r >= 0.35 ? 2 : 1;
  return -r >= 0.75 ? -3 : -r >= 0.25 ? -2 : -1;
}

export function calendar(s: State, at: Date, month = ym(at)) {
  const subs = new Set(s.subscriptions.map((x) => x.merchant));
  const today = money.dayStart(at).getTime();
  // Per-day spend over the whole history (for the scale and the month's figures).
  const byDay = new Map<string, { all: number; variable: number; fixed: number }>();
  for (const t of s.txns) {
    if (new Date(t.at) > at) continue;
    const c = costOf(t, subs);
    const v = signedSpend(t, c);
    if (!c || !v) continue;
    const k = ymd(new Date(t.at));
    const d = byDay.get(k) ?? { all: 0, variable: 0, fixed: 0 };
    d[c] += v;
    d.all += v;
    byDay.set(k, d);
  }
  const vals = [...byDay.values()];
  const scale = { all: cuts(vals.map((d) => d.all)), variable: cuts(vals.map((d) => d.variable)), fixed: cuts(vals.map((d) => d.fixed)) };

  const [y, m] = month.split("-").map(Number);
  const length = new Date(y, m, 0).getDate();
  const due = projected(s, at, month);
  const historyStart = money.dayStart(new Date(s.txns.reduce((a, t) => (t.at < a ? t.at : a), at.toISOString()))).getTime();
  const days = Array.from({ length }, (_, i) => {
    const day = new Date(y, m - 1, i + 1, 12);
    const from = money.dayStart(day).getTime();
    const to = from + DAY;
    const future = from > today;
    const isToday = from === today;
    const txns = future ? [] : s.txns.filter((t) => {
      const ts = new Date(t.at).getTime();
      return ts >= from && ts < to && ts <= at.getTime();
    });
    const sp = byDay.get(ymd(day)) ?? { all: 0, variable: 0, fixed: 0 };
    const spend = { all: cents(Math.max(0, sp.all)), variable: cents(Math.max(0, sp.variable)), fixed: cents(Math.max(0, sp.fixed)) };
    // Past days use the month's flat daily number (the rolling budget drifts on seeded history);
    // today is the live one.
    const went = money.spentToday(s, day);
    const budget = future ? null : isToday ? money.budget(s, at) : flat(s, day);
    const over = future ? 0 : isToday ? money.over(s, at) : Math.max(0, Math.ceil(went + lostOn(s, from, to) - budget!));
    const outcome = future ? "future" : over > 0 ? "over" : went > 0 ? "under" : "none";
    // Under (+) or over (−) the day's number; today it's the live "left today".
    const net = future ? null : isToday ? money.today(s, at) : cents(budget! - went - lostOn(s, from, to));
    const heat = future || isToday || to <= historyStart ? 0 : heatOf(net!, budget!);
    const bills: Bill[] = future
      ? due.filter((b) => ymd(new Date(b.at)) === ymd(day))
      : [
          ...txns.filter((t) => costOf(t, subs) === "fixed").map((t) => ({ merchant: t.merchant, amount: t.amount, at: t.at, status: "paid" as const })),
          ...(isToday ? due.filter((b) => ymd(new Date(b.at)) === ymd(day)) : []),
        ];
    const events = future ? [] : eventsOf(s, txns, from, to);
    return {
      date: ymd(day),
      day: i + 1,
      today: isToday,
      future,
      spend,
      budget,
      over,
      net,
      heat,
      outcome,
      txns: txns
        .map((t) => ({ id: t.id, at: t.at, merchant: t.merchant, amount: t.amount, category: t.category, kind: t.kind, covered: !!t.covered, cost: costOf(t, subs) }))
        .sort((a, b) => a.at.localeCompare(b.at)),
      bills,
      events,
      line: line({ future, isToday, spend, budget, over, bills, txns, subs, left: isToday ? money.today(s, at) : 0 }),
    };
  });
  const past = days.filter((d) => !d.future);
  const first = s.txns.reduce((a, t) => (t.at < a ? t.at : a), at.toISOString());
  return {
    month,
    label: new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    today: ymd(at),
    range: { first: ym(new Date(first)), last: ym(new Date(at.getFullYear(), at.getMonth() + 1, 1)) },
    scale,
    totals: {
      all: cents(past.reduce((t, d) => t + d.spend.all, 0)),
      variable: cents(past.reduce((t, d) => t + d.spend.variable, 0)),
      fixed: cents(past.reduce((t, d) => t + d.spend.fixed, 0)),
      over_days: past.filter((d) => d.outcome === "over" && !d.today).length,
      under_days: past.filter((d) => d.outcome !== "over" && !d.today).length,
      due: due.filter((b) => new Date(b.at) > at).sort((a, b) => a.at.localeCompare(b.at)),
    },
    days,
    recent: recent(s, at, subs),
  };
}

/** The last 7 days, whatever month is open: money in (pay, refunds) vs out (card spend, bills; a
 *  purchase won at blackjack never left), and the transactions newest first. Transfers are neither. */
function recent(s: State, at: Date, subs: Set<string>) {
  const from = money.dayStart(at).getTime() - 6 * DAY;
  const txns = s.txns
    .filter((t) => new Date(t.at).getTime() >= from && new Date(t.at) <= at)
    .sort((a, b) => b.at.localeCompare(a.at));
  const inn = txns.filter((t) => t.kind === "income" || t.kind === "refund").reduce((n, t) => n + t.amount, 0);
  const out = txns.filter((t) => (t.kind === "spend" || t.kind === "bill") && !t.covered).reduce((n, t) => n + t.amount, 0);
  return {
    from: ymd(new Date(from)),
    in: cents(inn),
    out: cents(out),
    txns: txns.slice(0, 40).map((t) => ({ id: t.id, at: t.at, date: ymd(new Date(t.at)), merchant: t.merchant, amount: t.amount, category: t.category, kind: t.kind, covered: !!t.covered, cost: costOf(t, subs) })),
  };
}
export type Calendar = ReturnType<typeof calendar>;

/** Dime's one line for the day: computed, not a model call. */
function line(d: {
  future: boolean; isToday: boolean; spend: { all: number; variable: number; fixed: number }; budget: number | null; over: number;
  bills: Bill[]; txns: Txn[]; subs: Set<string>; left: number;
}): string {
  const dueSum = d.bills.filter((b) => b.status === "due").reduce((t, b) => t + b.amount, 0);
  if (d.future) return d.bills.length ? `${d.bills.length === 1 ? d.bills[0].merchant : `${d.bills.length} bills`} due, ${usd(dueSum)}. Already set aside.` : "Nothing scheduled.";
  const top = d.txns.filter((t) => costOf(t, d.subs) === "variable" && t.kind === "spend" && !t.covered).sort((a, b) => b.amount - a.amount)[0];
  const most = top && d.spend.variable > 0 && top.amount / d.spend.variable >= 0.4 ? ` Mostly ${top.merchant} (${usd(top.amount)}).` : "";
  const fixed = d.spend.fixed >= 100 ? ` Bills (${usd(d.spend.fixed)}) sit outside it.` : "";
  if (d.isToday) return d.over > 0 ? `${usd(d.over)} over today's ${usd(d.budget ?? 0)} so far.${most}` : `${usd(d.left)} left of today's ${usd(d.budget ?? 0)}.${most}`;
  if (d.over > 0) return `${usd(d.over)} over the day's ${usd(d.budget ?? 0)}.${most}${fixed}`;
  if (d.spend.variable <= 0) return `No spending. The whole ${usd(d.budget ?? 0)} carried forward.${fixed}`;
  return `${usd((d.budget ?? 0) - d.spend.variable)} under the day's ${usd(d.budget ?? 0)}.${most}${fixed}`;
}
