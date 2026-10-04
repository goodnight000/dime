// The deterministic triggers: they change the state, then Dime says what happened.
import { state, id, type Txn } from "./state.ts";
import { now, jump } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { SKY, type Weather } from "./apps/today.ts";
import { say, usd, day } from "./voice.ts";
import { dropFact, topicOf, morningTopic } from "./news.ts";
import { settleAtMidnight } from "./friends.ts";

/** 8:00 local: today's number, as a line and a `today` card. */
export function morning() {
  const at = now();
  if (at.getHours() < 8) jump(new Date(at.getFullYear(), at.getMonth(), at.getDate(), 8));
  const t = now();
  const left = money.today(state, t);
  const app = open("today"); // reads its number, weather and bills from the state (apps/today.ts)
  return dropFact(morningTopic(), say("dime", `Morning ${SKY[app.state.weather as Weather]} ${usd(left)} today.`, app));
}

/** A card swipe. Bills already set aside get no reply. */
export function purchase(input: Pick<Txn, "merchant" | "amount" | "category"> & Partial<Txn>) {
  const txn: Txn = { id: id(), at: now().toISOString(), kind: "spend", ...input };
  state.txns.push(txn);
  if (txn.kind !== "spend" || txn.covered) return;
  const at = now();
  const left = money.today(state, at);
  const over = money.over(state, at);
  const g = state.goal;
  const delay = money.delay(state, at, txn.amount);
  if (over > 0)
    return dropFact(topicOf(txn.merchant, txn.category), say("dime", `${txn.merchant} ${usd(txn.amount)}. That's ${usd(over)} over today.`, `Tomorrow gets a little smaller. ${g.name} ${delay} days later.`));
  return dropFact(topicOf(txn.merchant, txn.category), say("dime", `${txn.merchant} ${usd(txn.amount)}. ${usd(left)} left today.`, `${g.name} ${delay} day${delay === 1 ? "" : "s"} later 💅`));
}

/** Midnight: the leftover moves to the goal, the clock rolls to the next day, Dime reports. */
export function midnight() {
  settleAtMidnight(); // open markets close NO; Charles's result lands in today before the sweep
  const at = now();
  const start = money.dayStart(at);
  const left = money.today(state, at);
  const over = money.over(state, at);
  const g = state.goal;
  const before = money.eta(state, at);
  if (left > 0) {
    state.sweeps.push({ at: new Date(start.getTime() + 86_400_000 - 1).toISOString(), amount: left });
    g.saved += left;
  }
  const closer = Math.max(1, before - money.eta(state, at));
  jump(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 30));
  const t = now();
  const app = open("goal", { delta: left }); // fills from saved − left to saved (apps/goal.ts)
  if (left > 0) {
    return say("dime", `${usd(left)} left. Moved to the ${g.name} ${g.emoji} ${money.pct(state)}%, ${closer} day${closer === 1 ? "" : "s"} closer.`, app);
  }
  if (over > 0)
    return say("dime", `You went ${usd(over)} over. Tomorrow: ${usd(money.budget(state, t))}.`, `${g.name} moves to ${day(money.etaDate(state, t))}.`, app);
  return say("dime", `Spent it all, exactly. Respect.`, app);
}
