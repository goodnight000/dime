import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { summary } from "./summary.ts";

beforeEach(reset);

test("history never changes today's number, and the dashboard agrees with money.ts", () => {
  const s = summary();
  expect(s.today).toBe(money.today(state, now()));
  expect(s.days).toHaveLength(35);
  expect(s.days.filter((d) => d.kind === "today")).toHaveLength(1);
  expect(s.days.some((d) => d.kind === "over") && s.days.some((d) => d.kind === "none")).toBe(true);
});

test("invested: total is the sum of the fund rows, and a new entry lands at face value", () => {
  const before = summary().invested;
  expect(before.total).toBeCloseTo(before.funds.reduce((t, f) => t + f.value, 0), 1);
  state.ledger.push({ fund: "SOXX", amount: 280, at: now().toISOString(), reason: "blackjack" });
  const after = summary().invested;
  expect(after.total).toBeCloseTo(before.total + 280, 1);
  expect(after.series.at(-1)!.value).toBeCloseTo(after.total, 1);
});

test("a loss waiting for a fund marks today as spent and shows as waiting, not invested", () => {
  state.txns = state.txns.filter((t) => money.dayStart(new Date(t.at)).getTime() !== money.dayStart(now()).getTime());
  const total = summary().invested.total;
  state.pendingInvest = { amount: 12, reason: "blackjack", at: now().toISOString() };
  const s = summary();
  expect(s.days.find((d) => d.kind === "today")!.so_far).toBe("under");
  expect(s.invested.waiting).toBe(12);
  expect(s.invested.total).toBe(total);
});
