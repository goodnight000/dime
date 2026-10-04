// Settings (GET/POST /api/settings): the handful of variables behind Dime's numbers and manners.
// The same fields the agent writes when he texts (set_tone, set_goal), so the page and the thread
// never disagree. Every change applies at once: today's number is computed from these on read.
import { state, type FundId } from "./state.ts";
import { FUNDS } from "./funds-data.ts";

export function settings() {
  const { user: u, month: m, goal: g } = state;
  return {
    tone: u.tone,
    income: m.income,
    bills: m.bills,
    invest: m.invest,
    goal: { name: g.name, price: g.price, saved: g.saved },
    fund: u.fund,
    morning: u.morning,
    hourly: u.hourly,
    blackjack: u.blackjack,
    tips: u.tips,
  };
}

const num = (v: unknown, lo: number, hi: number, what: string) => {
  const n = Number(v);
  if (typeof v === "boolean" || v === "" || v === null || !Number.isFinite(n) || n < lo || n > hi)
    throw new RangeError(`${what} must be between ${lo.toLocaleString("en-US")} and ${hi.toLocaleString("en-US")}`);
  return Math.round(n);
};
const bool = (v: unknown, what: string) => {
  if (typeof v !== "boolean") throw new RangeError(`${what} is on or off`);
  return v;
};

/** Applies the fields present in `b` (all validated first, so a bad field changes nothing). */
export function update(b: Record<string, unknown>) {
  const next: (() => void)[] = [];
  if ("tone" in b) {
    if (b.tone !== "nice" && b.tone !== "savage") throw new RangeError("tone is nice or savage");
    const tone = b.tone;
    next.push(() => (state.user.tone = tone));
  }
  if ("income" in b) {
    const n = num(b.income, 0, 100_000, "Take-home");
    next.push(() => (state.month.income = n));
  }
  if ("invest" in b) {
    const n = num(b.invest, 0, 20_000, "Invest habit");
    next.push(() => (state.month.invest = n));
  }
  if ("hourly" in b) {
    const n = num(b.hourly, 1, 1_000, "Hourly pay");
    next.push(() => (state.user.hourly = n));
  }
  if ("morning" in b) {
    const t = String(b.morning);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new RangeError("Morning text time is HH:MM");
    next.push(() => (state.user.morning = t));
  }
  if ("fund" in b) {
    const f = b.fund === null ? null : FUNDS.find((x) => x.id === b.fund)?.id;
    if (f === undefined) throw new RangeError("fund is one of " + FUNDS.map((x) => x.id).join(", "));
    next.push(() => (state.user.fund = f as FundId | null));
  }
  if ("blackjack" in b) {
    const v = bool(b.blackjack, "Impulse blackjack");
    next.push(() => (state.user.blackjack = v));
  }
  if ("tips" in b) {
    const v = bool(b.tips, "CFO tips");
    next.push(() => (state.user.tips = v));
  }
  if ("goal" in b) {
    const g = (b.goal ?? {}) as Record<string, unknown>;
    const name = typeof g.name === "string" ? g.name.trim().slice(0, 40) : "";
    if (!name) throw new RangeError("The goal needs a name");
    const price = num(g.price, 1, 100_000, "Goal price");
    next.push(() => {
      const was = state.goal;
      // What's saved carries over (set_goal's rule); a new name drops the old emoji for a plain target.
      state.goal = { name, price, saved: Math.min(was.saved, price), emoji: name === was.name ? was.emoji : "🎯" };
    });
  }
  const income = "income" in b ? Number(b.income) : state.month.income;
  if (("income" in b || "invest" in b) && ("invest" in b ? Number(b.invest) : state.month.invest) > income)
    throw new RangeError("Invest habit can't be more than take-home");
  for (const f of next) f();
  return settings();
}
