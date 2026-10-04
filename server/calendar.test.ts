import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "./state.ts";
import { now } from "./clock.ts";
import { calendar, costOf, flat } from "./calendar.ts";

beforeEach(reset);
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

test("fixed vs variable: bills and subscriptions are fixed, card spend is variable, transfers are neither", () => {
  const subs = new Set(["Netflix"]);
  const t = (kind: any, merchant = "X", category = "food") => ({ id: "1", at: "", merchant, amount: 10, category, kind });
  expect(costOf(t("bill", "Rent", "bills"), subs)).toBe("fixed");
  expect(costOf(t("spend", "Netflix"), subs)).toBe("fixed");
  expect(costOf(t("spend", "Nopa"), subs)).toBe("variable");
  expect(costOf(t("refund"), subs)).toBe("variable");
  expect(costOf(t("transfer"), subs)).toBe(null);
  expect(costOf(t("income"), subs)).toBe(null);
});

test("this month: one entry per day, today marked, all = fixed + variable, rent day is fixed-heavy", () => {
  const at = now();
  const c = calendar(state, at);
  expect(c.days).toHaveLength(new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate());
  expect(c.days.filter((d) => d.today)).toHaveLength(1);
  for (const d of c.days) expect(d.spend.all).toBeCloseTo(Math.max(0, d.spend.variable + d.spend.fixed), 1);
  const rent = c.days.find((d) => d.bills.some((b) => b.merchant === "Rent"))!;
  expect(rent.spend.fixed).toBeGreaterThanOrEqual(1450);
  expect(c.days.filter((d) => d.future).every((d) => d.txns.length === 0 && d.budget === null)).toBe(true);
  // Upcoming bills land on their future days.
  for (const u of state.upcoming) expect(c.days.some((d) => d.bills.some((b) => b.merchant === u.merchant && b.status === "due"))).toBe(true);
});

test("past days use the month's flat number and paydays show as events", () => {
  const at = now();
  const prev = new Date(at.getFullYear(), at.getMonth() - 1, 15);
  const c = calendar(state, at, ym(prev));
  expect(c.days.every((d) => d.budget === flat(state, prev))).toBe(true);
  expect(c.days.some((d) => d.events.some((e) => e.kind === "payday"))).toBe(true);
  expect(c.days.some((d) => d.outcome === "over") && c.days.some((d) => d.outcome === "under")).toBe(true);
});

test("next month repeats recurring bills, minus a cancelled subscription", () => {
  const at = now();
  const next = ym(new Date(at.getFullYear(), at.getMonth() + 1, 1));
  const names = () => calendar(state, at, next).days.flatMap((d) => d.bills.map((b) => b.merchant));
  expect(names()).toContain("Rent");
  expect(names()).toContain("Hulu");
  state.apps.p = { id: "p", kind: "proposal", version: 1, state: { find: "unused", merchant: "Hulu", status: "done", title: "", outcome: { text: "Cancelled." } } };
  state.messages.push({ id: "m", thread: "dime", direction: "out", body: "", app: "p", created_at: at.toISOString() });
  state.upcoming = state.upcoming.filter((u) => u.merchant !== "Hulu");
  expect(names()).not.toContain("Hulu");
  const today = calendar(state, at).days.find((d) => d.today)!;
  expect(today.events.some((e) => e.kind === "cfo")).toBe(true);
});

test("a bill Dime called down bills at the lower price from next month on", () => {
  const at = now();
  const next = ym(new Date(at.getFullYear(), at.getMonth() + 1, 1));
  const comcast = () => calendar(state, at, next).days.flatMap((d) => d.bills).find((b) => b.merchant === "Comcast")!.amount;
  expect(comcast()).toBe(70);
  state.apps.p = { id: "p", kind: "proposal", version: 1, state: { find: "bill", merchant: "Comcast", was: 47, amount: 23, status: "done", title: "", outcome: { text: "Back to $47/mo." } } };
  state.messages.push({ id: "m", thread: "dime", direction: "out", body: "", app: "p", created_at: at.toISOString() });
  expect(comcast()).toBe(47);
});

test("today's events: double charge, refund, blackjack win and loss, group bet", () => {
  const at = now();
  const iso = (minAgo: number) => new Date(at.getTime() - minAgo * 60_000).toISOString();
  state.txns.push(
    { id: "u1", at: iso(3), merchant: "Uber", amount: 24.5, category: "transport", kind: "spend" },
    { id: "u2", at: iso(1), merchant: "Uber", amount: 24.5, category: "transport", kind: "spend" },
    { id: "r1", at: iso(2), merchant: "Target", amount: 48, category: "shopping", kind: "refund" },
    { id: "w1", at: iso(2), merchant: "Sneakers", amount: 80, category: "shopping", kind: "spend", covered: true },
  );
  state.ledger.push({ fund: "VOO", amount: 40, at: iso(2), reason: "blackjack" });
  state.bonus.push({ at: iso(2), amount: 12 });
  const today = calendar(state, at).days.find((d) => d.today)!;
  const kinds = today.events.map((e) => e.kind);
  for (const k of ["duplicate", "refund", "blackjack-win", "blackjack-loss", "market"] as const) expect(kinds).toContain(k);
  expect(kinds.filter((k) => k === "duplicate")).toHaveLength(1);
  expect(today.spend.variable).toBeCloseTo(24.5 * 2 - 48, 2); // the covered win doesn't count; the refund nets
});
