// funds / goal / today server logic: the money weather window, the pick moving a pending loss, the sweep record.
import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "../state.ts";
import { now } from "../clock.ts";
import { open, run } from "./index.ts";
import { weather } from "./today.ts";

const DAY = 86_400_000;
beforeEach(() => reset());

test("weather: sunny with nothing due, cloudy under $100, storm at $100+", () => {
  const at = new Date(now().getTime());
  state.upcoming = [];
  expect(weather(at).weather).toBe("sunny");
  state.upcoming = [{ merchant: "Verizon", amount: 45, at: new Date(at.getTime() + 2 * DAY).toISOString() }];
  expect(weather(at)).toMatchObject({ weather: "cloudy", bills: [{ merchant: "Verizon" }] });
  state.upcoming.push({ merchant: "Car insurance", amount: 112, at: new Date(at.getTime() + DAY).toISOString() });
  expect(weather(at).weather).toBe("storm");
  expect(weather(at).bills[0].merchant).toBe("Car insurance"); // soonest first
  state.upcoming = [{ merchant: "Gym", amount: 11, at: new Date(at.getTime() + 4 * DAY).toISOString() }];
  expect(weather(at).weather).toBe("sunny"); // outside the 3 days
});

test("pick sets the fund and moves a pending loss into the ledger once", async () => {
  state.pendingInvest = { amount: 30, reason: "blackjack", at: now().toISOString() };
  const hand = { id: "h", kind: "blackjack" as const, version: 1, state: { result: "lose", fund: null as { id: string; name: string } | null } };
  state.apps.h = hand;
  const before = state.ledger.length;
  const app = open("funds");
  await run(app.id, "pick", { fund: "QQQ" });
  await run(app.id, "pick", { fund: "DRAM" }); // a second tap changes nothing
  expect(state.user.fund).toBe("QQQ");
  expect(state.pendingInvest).toBeNull();
  expect(hand.state.fund).toEqual({ id: "QQQ", name: "Nasdaq-100" }); // the lost hand now names its fund
  expect(state.ledger.slice(before)).toEqual([expect.objectContaining({ fund: "QQQ", amount: 30, reason: "blackjack" })]);
  await expect(run(open("funds").id, "pick", { fund: "NOPE" })).rejects.toThrow();
});

test("goal records the sweep from the old level to the new", () => {
  state.goals[0].saved += 12;
  const s = open("goal", { delta: 12 }).state;
  expect(s.to.saved - s.from.saved).toBe(12);
  expect(s.to.pct).toBeGreaterThanOrEqual(s.from.pct);
  expect(new Date(s.to.eta).getTime()).toBeLessThanOrEqual(new Date(s.from.eta).getTime());
});
