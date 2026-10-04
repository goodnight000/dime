import { test, expect, beforeEach } from "bun:test";
import { state, reset, id } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { midnight } from "./events.ts";

beforeEach(reset);
const swipe = (amount: number) =>
  state.txns.push({ id: id(), at: now().toISOString(), merchant: "Blue Bottle", amount, category: "coffee", kind: "spend" });

test("seed: today's number is about $311", () => {
  expect(money.today(state, now())).toBeGreaterThanOrEqual(300);
  expect(money.today(state, now())).toBeLessThanOrEqual(320);
});

test("a $7 swipe drops today by 7, and a covered one does not", () => {
  const before = money.today(state, now());
  swipe(7);
  expect(money.today(state, now())).toBe(before - 7);
  state.txns.push({ id: id(), at: now().toISOString(), merchant: "Nike", amount: 20, category: "shopping", kind: "spend", covered: true });
  expect(money.today(state, now())).toBe(before - 7);
});

test("midnight sweeps the leftover to the goal without inflating tomorrow", () => {
  const left = money.today(state, now());
  const saved = state.goal.saved;
  const days = money.daysLeft(now());
  const poolBefore = money.pool(state, money.dayStart(now()));
  midnight();
  expect(state.goal.saved).toBe(saved + left);
  // Tomorrow is the old pool minus today's allowance (spent or swept), spread over one fewer day.
  expect(money.budget(state, now())).toBe(Math.floor((poolBefore - left) / (days - 1)));
});

test("overspending shrinks tomorrow and sweeps nothing", () => {
  const budget = money.budget(state, now());
  const saved = state.goal.saved;
  swipe(budget + 30);
  expect(money.today(state, now())).toBe(0);
  expect(money.over(state, now())).toBe(30);
  midnight();
  expect(state.goal.saved).toBe(saved);
  expect(money.budget(state, now())).toBeLessThan(budget);
});

test("a blackjack loss leaves today, pending a fund or in the ledger", () => {
  const before = money.today(state, now());
  state.pendingInvest = { amount: 10, reason: "blackjack", at: now().toISOString() };
  expect(money.today(state, now())).toBe(before - 10);
  state.ledger.push({ fund: "VOO", ...state.pendingInvest });
  state.pendingInvest = null;
  expect(money.today(state, now())).toBe(before - 10);
});

test("girl math words: under a day of pace is hours, else rounded days", () => {
  const p = money.pace(state, now());
  expect(money.lag(state, now(), p / 8)).toBe("~3 hours");
  expect(money.lag(state, now(), p * 1.4)).toBe("1 day");
  expect(money.lag(state, now(), p * 2.6)).toBe("3 days");
});

test("faithful: '$5k' counts as 5000", async () => {
  const { faithful } = await import("./voice.ts");
  expect(faithful("can't blackjack a $5k car", "a car for $5,000")).toBe(true);
  expect(faithful("a $6k car", "a car for $5,000")).toBe(false);
});
