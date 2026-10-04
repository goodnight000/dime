import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { categorize, duplicateOf, suspicion, runway, streak, ingest, balance, unusual } from "./simulate.ts";
import { detect } from "./cfo.ts";

beforeEach(() => reset());

test("the seed: $311 today, ~$66 pace, 90 days of history, exactly the demo's three CFO finds", () => {
  const at = now();
  expect(money.today(state, at)).toBe(311);
  expect(Math.round(money.pace(state, at))).toBe(66);
  expect(state.balances.filter((b) => b.account === "checking").length).toBe(90);
  expect(detect().map((p) => p.key)).toEqual(["bill:Comcast", "unused:Hulu", "idle"]);
  expect(detect().find((p) => p.key === "idle")!.amount).toBe(2000);
});

test("categories come from history first, then the name", () => {
  expect(categorize("Philz Coffee")).toBe("coffee");
  expect(categorize("Trick Dog")).toBe("fun");
  expect(categorize("Ramen Nagi")).toBe("food");
  expect(categorize("Zzyzx Holdings")).toBe("other");
});

test("double charge, a charge that isn't him, an out-of-character one", () => {
  const a = ingest({ merchant: "Uber", amount: 23.4, category: "transport", kind: "spend", at: new Date(now().getTime() - 120_000).toISOString() });
  const b = ingest({ merchant: "Uber", amount: 23.4, category: "transport", kind: "spend" });
  expect(duplicateOf(b)).toBe(a);
  const night = new Date(money.dayStart(now()).getTime() + 3.25 * 3600_000).toISOString();
  expect(suspicion(ingest({ merchant: "VLTX*DIGITAL", amount: 83.17, category: "other", kind: "spend", at: night })).length).toBe(3);
  expect(suspicion(ingest({ merchant: "Blue Bottle", amount: 7, category: "coffee", kind: "spend" }))).toEqual([]);
  expect(unusual(ingest({ merchant: "Blue Bottle", amount: 46, category: "coffee", kind: "spend" }))).toContain("usually");
});

test("pay beyond the plan raises today; a big autopay makes the runway short", () => {
  ingest({ merchant: "Payroll", amount: 5425, category: "income", kind: "income" }); // planned: no change
  expect(money.today(state, now())).toBe(311);
  ingest({ merchant: "Payroll", amount: 5425, category: "income", kind: "income" }); // beyond the plan
  expect(money.today(state, now())).toBeGreaterThan(311);
  expect(runway().left).toBeGreaterThan(500);
  const pay = Math.round(balance("checking") - 300);
  ingest({ merchant: "Chase Sapphire autopay", amount: pay, category: "transfer", kind: "transfer" });
  expect(Math.round(balance("checking"))).toBe(300);
  expect(runway().left).toBeLessThan(500);
  expect(streak()).toBeGreaterThanOrEqual(3);
});
