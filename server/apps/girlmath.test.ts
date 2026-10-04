// Girl math card: skip vs buy dates from money.ts, the gap words, hours of work.
import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { girlMath } from "./girlmath.ts";
import { open } from "./index.ts";

beforeEach(() => reset());

test("buying moves the goal by the price at today's pace", () => {
  const at = now();
  const g = money.activeGoal(state);
  const p = money.pace(state, at);
  const amount = Math.round(p * 5); // ~5 days of pace
  const s = girlMath(state, at, "sneakers", amount);
  expect(s.goal.name).toBe(g.name);
  expect(s.skip.days).toBe(money.eta(state, at));
  expect(s.buy.days).toBe(Math.ceil((g.price - g.saved + amount) / p));
  const gap = s.buy.days - s.skip.days;
  expect(gap).toBeGreaterThanOrEqual(4);
  expect(s.later).toBe(`${gap} days`);
  expect(Math.abs(s.hours! - amount / state.user.hourly)).toBeLessThanOrEqual(0.5);
  expect(new Date(s.buy.date).getTime()).toBeGreaterThan(new Date(s.skip.date).getTime());
});

test("a small price is hours, not days; no amount uses the latest purchase", () => {
  const s = girlMath(state, now(), "gum", 1);
  expect(s.later).toMatch(s.buy.days > s.skip.days ? /^1 day$/ : /^~\d+ hours?$/); // a dollar can tip a day boundary
  const last = state.txns.findLast((t) => t.kind === "spend" && !t.covered)!;
  expect(open("girlmath", {}).state).toMatchObject({ item: last.merchant, amount: last.amount });
});
