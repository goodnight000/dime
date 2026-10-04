import { test, expect, beforeEach } from "bun:test";
import { state, reset } from "./state.ts";
import { cfoScan, findSavings } from "./cfo.ts";
import { run } from "./apps/index.ts";
import { dropFact, getFact, topicOf } from "./news.ts";

beforeEach(() => {
  reset();
  delete process.env.EXA_API_KEY;
});

const cards = () => Object.values(state.apps).filter((a) => a.kind === "proposal");
const byFind = (f: string) => cards().find((a) => a.state.find === f)!;
const bodies = () => state.messages.filter((m) => m.thread === "dime").map((m) => m.body);

test("scan proposes three finds, nothing moves before Approve, a rescan doesn't duplicate", async () => {
  const ledger = state.ledger.length;
  await cfoScan();
  expect(cards().map((a) => a.state.key)).toEqual(["bill:Comcast", "unused:Hulu", "idle"]);
  expect(bodies()).toContain("found 3 things 👀");
  expect(state.ledger.length).toBe(ledger);
  await cfoScan();
  expect(cards().length).toBe(3);
}, 15000);

test("what to cancel: bill and subscription finds only, no idle cash", () => {
  expect(findSavings("cancel").fresh.map((p) => p.key)).toEqual(["bill:Comcast", "unused:Hulu"]);
});

test("Not now answers in place; idle with a fund lands $2,000 in the ledger", async () => {
  state.user.fund = "VOO";
  await cfoScan();
  await run(byFind("unused").id, "decline", {});
  expect(byFind("unused").state.status).toBe("declined");
  await run(byFind("idle").id, "approve", {});
  expect(byFind("idle").state.status).toBe("working");
  await Bun.sleep(1600);
  expect(byFind("idle").state.status).toBe("done");
  expect(state.ledger.at(-1)).toEqual(expect.objectContaining({ fund: "VOO", amount: 2000, reason: "cfo" }));
  while (state.typing.dime) await Bun.sleep(100); // let Dime finish, so nothing leaks into the next test
}, 15000);

test("facts: topic mapping, curated fallback, at most one a day", async () => {
  expect(topicOf("DoorDash", "food")).toBe("delivery");
  expect(topicOf("Rent", "bills")).toBeNull();
  expect((await getFact("delivery")).text).toContain("DoorDash");
  const before = state.messages.length;
  await dropFact("coffee");
  await dropFact("delivery");
  expect(state.messages.length).toBe(before + 1);
}, 15000);
