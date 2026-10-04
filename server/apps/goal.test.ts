// Goal complete: a card that fills the goal asks to order; ordering is a covered purchase paid from
// goal.saved, so today's number doesn't move.
import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { open, run } from "./index.ts";

beforeEach(() => reset());

test("a card short of the price has no ask; a full one orders without touching today", async () => {
  expect(open("goal", { delta: 10 }).state.order).toBeUndefined();
  // The money line is dated, never "tonight"; a new goal has none.
  expect(open("goal", { delta: 30, source: "Oct 4" }).state.note).toBe("+$30 from Oct 4");
  expect(open("goal", { delta: 0 }).state.note).toBe("");
  const g = state.goals[0];
  g.saved = g.price;
  const app = open("goal", { id: g.id, delta: 100 });
  expect(app.state.order).toEqual({ status: "open", outcome: null });
  expect(app.state.to.pct).toBe(100);
  expect(app.state.note).toBe("+$100 from today"); // money only; the order row is the status
  const today = money.today(state, now());
  await run(app.id, "order", {});
  expect(app.state.order.status).toBe("ordering");
  await Bun.sleep(1300);
  expect(app.state.order.status).toBe("ordered");
  expect(app.state.order.outcome).toMatch(/^Ordered\. iPhone 17 Pro arrives (next )?Thursday\.$/);
  expect(g.done).toBeTruthy(); // ordered: off the stack, the next goal is active
  expect(money.activeGoal(state).id).toBe("tokyo");
  expect(state.txns.at(-1)).toMatchObject({ merchant: "Apple", amount: g.price, covered: true });
  expect(money.today(state, now())).toBe(today);
});

test("a goal with nothing to buy is Done when full: no order ask", () => {
  const fund = state.goals.find((g) => g.id === "emergency")!;
  fund.saved = fund.price;
  const s = open("goal", { id: fund.id, delta: 50 }).state;
  expect(s.order).toBeUndefined();
  expect(s.note).toBe("+$50 from today");
});

test("goals API: add after, move first, remove rolls savings on, keeps one", async () => {
  const goals = await import("../goals.ts");
  goals.add({ name: "AirPods", price: 249, emoji: "🎧", store: "Apple", position: 2 });
  expect(state.goals.map((g) => g.name)).toEqual(["iPhone 17 Pro", "AirPods", "Tokyo trip", "Emergency fund"]);
  goals.reorder(["Tokyo"]);
  expect(state.goals[0].name).toBe("Tokyo trip");
  expect(goals.list()[0].status).toBe("active");
  goals.remove("iPhone 17 Pro"); // its $650 rolls to Tokyo, first in line
  expect(state.goals[0].saved).toBe(650);
  for (const g of [...state.goals].slice(1)) goals.remove(g.id);
  expect(() => goals.remove("Tokyo trip")).toThrow(/at least one/);
  expect(() => goals.update("Tokyo trip", { price: 0 })).toThrow();
});
