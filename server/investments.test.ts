import { test, expect } from "bun:test";
import { investments } from "./investments.ts";
import { summary } from "./summary.ts";

test("investments agree with the dashboard and with themselves", () => {
  const inv = investments();
  const s = summary();
  expect(inv.total).toBe(s.invested.total);
  expect(inv.month_delta).toBe(s.invested.month_delta);
  expect(inv.series.at(-1)!.value).toBe(inv.total);
  expect(inv.gain).toBeCloseTo(inv.total - inv.cost, 2);
  expect(inv.funds.reduce((t, f) => t + f.share, 0)).toBeCloseTo(1, 2);
  const dates = inv.contributions.map((c) => c.date);
  expect([...dates].sort().reverse()).toEqual(dates);
  expect(inv.contributions.some((c) => c.source === "You moved it in")).toBe(true);
});
