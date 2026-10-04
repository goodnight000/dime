import { expect, test } from "bun:test";
import { payouts, estimate, pots, type Bet } from "./market.ts";
import { parseClaim } from "../friends.ts";

const bets: Bet[] = [
  { who: "Penny", side: "no", amount: 10 },
  { who: "Maya", side: "yes", amount: 15 },
  { who: "Sam", side: "no", amount: 5 },
  { who: "Charles", side: "yes", amount: 10 },
];

test("pari-mutuel: winners split the losers' pot by stake, losers lose their stake", () => {
  expect(pots(bets)).toEqual({ yes: 25, no: 15 });
  const yes = Object.fromEntries(payouts(bets, "yes").map((p) => [p.who, p.net]));
  expect(yes).toEqual({ Penny: -10, Maya: 9, Sam: -5, Charles: 6 });
  const no = Object.fromEntries(payouts(bets, "no").map((p) => [p.who, p.net]));
  expect(no).toEqual({ Penny: 16, Maya: -15, Sam: 8, Charles: -10 });
});

test("nobody on the winning side: everyone keeps their stake", () => {
  expect(payouts(bets.filter((b) => b.side === "no"), "yes").every((p) => p.net === 0)).toBe(true);
});

test("estimate is stake plus the pro-rata share", () => {
  expect(estimate(bets, bets[3])).toBe(16);
});

test("claims parse into a checkable rule", () => {
  expect(parseClaim("Will Penny spend $80 on DoorDash today?")).toMatchObject({ subject: "Penny", threshold: 80, merchant: "DoorDash" });
  expect(parseClaim("is maya gonna spend over $40 at trader joe's tonight")).toMatchObject({ subject: "Maya", threshold: 40, merchant: "Trader Joe's" });
  expect(parseClaim("will Kevin spend $5 on coffee?")).toMatchObject({ subject: null, name: "Kevin" });
  expect(parseClaim("lol")).toBeNull();
});

test("Charles's winnings land in today's number", async () => {
  const { state } = await import("../state.ts");
  const { now } = await import("../clock.ts");
  const money = await import("../money.ts");
  const { create, place, settle } = await import("./market.ts");
  const app = create({ subject: "Penny", merchant: "DoorDash", threshold: 80 });
  for (const b of bets) place(app, b);
  const before = money.today(state, now());
  settle(app, "yes", 90);
  expect(money.today(state, now())).toBe(before + 6);
});
