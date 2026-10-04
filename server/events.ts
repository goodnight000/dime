// The deterministic triggers: they change the state, then Dime says what happened.
import { state, id, type Txn } from "./state.ts";
import { now, jump } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fullLine } from "./apps/goal.ts";
import { SKY, type Weather } from "./apps/today.ts";
import { speak, usd, day } from "./voice.ts";
import { dropFact, topicOf, morningTopic } from "./news.ts";
import { settleAtMidnight } from "./friends.ts";
import { bank, flag, unusual } from "./simulate.ts";

/** 8:00 local: today's number, as a line and a `today` card. */
export function morning() {
  const at = now();
  if (at.getHours() < 8) jump(new Date(at.getFullYear(), at.getMonth(), at.getDate(), 8));
  const t = now();
  const left = money.today(state, t);
  const app = open("today"); // reads its number, weather and bills from the state (apps/today.ts)
  const bills = (app.state.bills as { merchant: string; amount: number; at: string }[]).map((b) => `${b.merchant} ${usd(b.amount)} on ${day(new Date(b.at))} (already set aside)`);
  const facts = `Morning, ${day(t)}. Today's number: ${usd(left)}. Money weather: ${app.state.weather} ${SKY[app.state.weather as Weather]}. Bills due in the next 3 days: ${bills.join(", ") || "none"}. The today card follows your words.`;
  return dropFact(morningTopic(), speak("dime", facts, [`morning ${SKY[app.state.weather as Weather]} ${usd(left)} today`, app]));
}

/** A card swipe. Bills already set aside get no reply. */
export function purchase(input: Pick<Txn, "merchant" | "amount" | "category"> & Partial<Txn>) {
  const txn: Txn = { id: id(), at: now().toISOString(), kind: "spend", ...input };
  state.txns.push(txn);
  bank("checking", txn.kind === "income" || txn.kind === "refund" ? txn.amount : -txn.amount);
  if (txn.kind !== "spend" || txn.covered) return;
  const flagged = flag(txn); // a double charge or a charge that isn't him: Dime asks instead
  if (flagged) return flagged;
  const odd = unusual(txn);
  const at = now();
  const left = money.today(state, at);
  const over = money.over(state, at);
  const g = state.goal;
  const days = money.lag(state, at, txn.amount);
  const swiped = `Charles just swiped ${txn.merchant} ${usd(txn.amount)} (${txn.category}).${odd ? ` ${odd} Notice it in a few words.` : ""}`;
  if (over > 0)
    return dropFact(topicOf(txn.merchant, txn.category), speak("dime",
      `${swiped} That puts him ${usd(over)} over today's number, so tomorrow's number shrinks. Girl math: ${g.name} ${days} later.`,
      [`${txn.merchant} ${usd(txn.amount)}. that's ${usd(over)} over today 😬`, `tomorrow shrinks to cover it. ${g.name} ${days} later`]));
  return dropFact(topicOf(txn.merchant, txn.category), speak("dime",
    `${swiped} Left today: ${usd(left)}. Girl math: ${g.name} ${days} later.`,
    [`${txn.merchant} ${usd(txn.amount)}. ${usd(left)} left today`, `that's the ${g.name} ${days} later 💅`]));
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
  const app = open("goal", { delta: left, source: day(start) }); // fills from saved − left to saved (apps/goal.ts)
  const sweep = "Midnight sweep, end of the day. The goal card follows your words.";
  if (app.state.order) // the sweep filled the goal: the card asks to order it (apps/goal.ts)
    return speak("dime", `${sweep} ${left > 0 ? `${usd(left)} was left unspent and moved to the ${g.name}. ` : ""}That fills it: ${usd(g.price)} saved, 100%. Ask if he wants you to order it now.`,
      [...(left > 0 ? [`${usd(left)} tops it off 📱`] : []), fullLine(), app]);
  if (left > 0) {
    const closerDays = `${closer} day${closer === 1 ? "" : "s"}`;
    return speak("dime", `${sweep} ${usd(left)} was left unspent and moved to the ${g.name} ${g.emoji}. Goal now ${money.pct(state)}% saved, ${closerDays} closer.`,
      [`${usd(left)} left. moved to the ${g.name} ${g.emoji} ${money.pct(state)}%, ${closerDays} closer`, app]);
  }
  if (over > 0)
    return speak("dime", `${sweep} He went ${usd(over)} over today, nothing to sweep. Tomorrow's number: ${usd(money.budget(state, t))}. ${g.name} now lands ${day(money.etaDate(state, t))}.`,
      [`you went ${usd(over)} over 😬 tomorrow's ${usd(money.budget(state, t))}`, `${g.name} slides to ${day(money.etaDate(state, t))}`, app]);
  return speak("dime", `${sweep} He spent today's number exactly, nothing left, nothing over.`, [`spent it all, exactly. respect 🫡`, app]);
}
