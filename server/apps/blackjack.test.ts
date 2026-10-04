import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { create, actions, total, type BlackjackState } from "./blackjack.ts";

beforeEach(reset);

const play = (force: "win" | "lose" | "push" | null, move: "hit" | "stand") => {
  state.forceBlackjack = force;
  const app = create({ item: "sneakers", amount: 20 });
  const s = app.state as BlackjackState;
  if (!s.result) expect(s.dealer[1]).toBeNull(); // the hole card stays on the server
  if (!s.result) actions[move](app, {});
  if (!s.result) actions.stand(app, {});
  return s;
};

test("rigged rounds resolve the forced way with real totals, then the rig clears", () => {
  for (let i = 0; i < 200; i++) {
    for (const move of ["hit", "stand"] as const) {
      const w = play("win", move);
      expect(["win", "blackjack", "dime-bust"]).toContain(w.result!);
      expect(total(w.player)).toBeLessThanOrEqual(21);
      expect(state.forceBlackjack).toBeNull();
      const l = play("lose", move);
      expect(["lose", "bust"]).toContain(l.result!);
      const p = play("push", move);
      expect(p.round).toBeGreaterThanOrEqual(2); // pushed, dealt again
      expect(total(p.prev!.player)).toBe(total(p.prev!.dealer));
    }
  }
});

test("a win is a covered purchase; a loss with no fund waits and still leaves today", () => {
  state.user.fund = null; // the seed's history already picked one
  const before = money.today(state, now());
  play("win", "stand");
  expect(state.txns.at(-1)).toMatchObject({ merchant: "Sneakers", amount: 20, covered: true });
  expect(money.today(state, now())).toBe(before);
  play("lose", "stand");
  expect(state.pendingInvest).toMatchObject({ amount: 20, reason: "blackjack" });
  expect(money.today(state, now())).toBe(before - 20);
});
