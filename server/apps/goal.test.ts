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
  state.goal.saved = state.goal.price + 20;
  const app = open("goal", { delta: 100 });
  expect(app.state.order).toEqual({ status: "open", outcome: null });
  expect(app.state.to.pct).toBe(100);
  const today = money.today(state, now());
  await run(app.id, "order", {});
  expect(app.state.order.status).toBe("ordering");
  await Bun.sleep(1300);
  expect(app.state.order.status).toBe("ordered");
  expect(app.state.order.outcome).toMatch(/^Ordered\. iPhone 17 Pro arrives (next )?Thursday\.$/);
  expect(state.goal.saved).toBe(20); // the surplus carries to the next goal
  expect(state.txns.at(-1)).toMatchObject({ amount: state.goal.price, covered: true });
  expect(money.today(state, now())).toBe(today);
});
