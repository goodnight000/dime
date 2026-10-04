// The deterministic triggers: they change the state, then Dime speaks only when it helps.
// Policy (Charles, 2:20pm): no routine texts. The morning, the midnight sweep and ordinary swipes
// are silent; today's number lives in the UI. Dime texts for goal milestones, under-budget streak
// milestones, going over (or nearly over) today, a purchase that's big or unusual for him, a
// category running past its normal week, and the simulated events (simulate.ts).
import { state, id, type Txn } from "./state.ts";
import { now, jump } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fullLine } from "./apps/goal.ts";
import { speak, usd, day } from "./voice.ts";
import { dropFact, topicOf } from "./news.ts";
import { settleAtMidnight } from "./friends.ts";
import { trends } from "./cfo.ts";
import { bank, flag, unusual, streak, STREAK_MILESTONES } from "./simulate.ts";

const DAY = 86_400_000;
/** Goal percentages worth a text when a sweep crosses them (100 is the order-it payoff). */
export const GOAL_MILESTONES = [25, 50, 75, 90, 100];

/** 8:00 local. Silent: the clock moves, the sidebar and dashboard show the new day's number. */
export function morning() {
  const at = now();
  if (at.getHours() < 8) jump(new Date(at.getFullYear(), at.getMonth(), at.getDate(), 8));
}

/** A category's spend over the 7 days ending at `at`. */
const week = (category: string, at: Date, skip?: Txn) =>
  state.txns
    .filter((t) => t !== skip && t.kind === "spend" && !t.covered && t.category === category && +new Date(t.at) > +at - 7 * DAY && +new Date(t.at) <= +at)
    .reduce((s, t) => s + t.amount, 0);

/** What a swipe is worth saying, as facts + a template; null = say nothing. Crossings only, so
 *  each line fires once: the swipe that goes over, the one that drops today under 20%, the one
 *  that pushes a running-hot category past its normal week. */
export function notable(txn: Txn, leftBefore: number, at = now()): { facts: string; lines: string[] } | null {
  const left = money.today(state, at);
  const over = money.over(state, at);
  const budget = money.budget(state, at);
  const g = money.activeGoal(state);
  const days = money.lag(state, at, txn.amount);
  const swiped = `Charles just swiped ${txn.merchant} ${usd(txn.amount)} (${txn.category}).`;
  const odd = unusual(txn);
  if (over > 0 && leftBefore > 0)
    return { facts: `${swiped} That puts him ${usd(over)} over today's number, so tomorrow's number shrinks to cover it. Girl math: ${g.name} ${days} later. Be a friend about it: no lecture, one useful nudge.`,
      lines: [`oop, ${txn.merchant} tipped you ${usd(over)} over today 😬`, `no biggie, tomorrow just runs a little smaller. maybe a cheap night?`] };
  if (over > 0) // already over: only a big one is worth piling on
    return odd || txn.amount >= Math.max(50, budget / 2)
      ? { facts: `${swiped} He was already over today's number; now ${usd(over)} over, and tomorrow's number shrinks to cover it.`, lines: [`${txn.merchant} ${usd(txn.amount)} on an over day?? that's ${usd(over)} over now`, `tomorrow's gonna feel it 🫠`] }
      : null;
  if (odd)
    return { facts: `${swiped} ${odd} Left today: ${usd(left)}. Notice it like a friend would; no judgment if it was planned.`,
      lines: [`whoa, ${usd(txn.amount)} at ${txn.merchant}? that's not your usual`, `all good? you've still got ${usd(left)} today`] };
  if (txn.amount >= Math.max(100, budget / 2))
    return { facts: `${swiped} That's a big one for one day: today's number started at ${usd(budget)}, ${usd(left)} left. Girl math: ${g.name} ${days} later.`,
      lines: [`ok big swipe 👀 ${usd(left)} left for the rest of today`, `that's the ${g.name} ${days} later, just so you know`] };
  if (left < budget * 0.2 && leftBefore >= budget * 0.2)
    return { facts: `${swiped} Only ${usd(left)} left of today's number (it started at ${usd(budget)}). A friendly heads-up, not a scolding.`,
      lines: [`heads up, that leaves ${usd(left)} for the rest of today`, `easy night? 🛋️`] };
  const hot = trends(at).find((c) => c.category === txn.category);
  if (hot) {
    const cap = hot.suggested_weekly_cap;
    const w = Math.round(week(txn.category, at));
    if (w > cap && week(txn.category, at, txn) <= cap)
      return { facts: `${swiped} That pushes ${txn.category} to ${usd(w)} in the last 7 days; his normal week is about ${usd(cap)}. Call out the habit like a friend, one nudge.`,
        lines: [`that's ${usd(w)} on ${txn.category} this week btw. your normal week is like ${usd(cap)}`, `not mad, just saying 👀`] };
  }
  return null;
}

/** A card swipe. Bills already set aside, wins and ordinary swipes get no reply. */
export function purchase(input: Pick<Txn, "merchant" | "amount" | "category"> & Partial<Txn>) {
  const leftBefore = money.today(state, now());
  const txn: Txn = { id: id(), at: now().toISOString(), kind: "spend", ...input };
  state.txns.push(txn);
  bank("checking", txn.kind === "income" || txn.kind === "refund" ? txn.amount : -txn.amount);
  if (txn.kind !== "spend" || txn.covered) return;
  const flagged = flag(txn); // a double charge or a charge that isn't him: Dime asks instead
  if (flagged) return flagged;
  const said = notable(txn, leftBefore);
  if (!said) return;
  return dropFact(topicOf(txn.merchant, txn.category), speak("dime", said.facts, said.lines));
}

/** The goal milestone a sweep from `was` to `is` percent crossed (the highest), or null. */
export const crossed = (was: number, is: number) => GOAL_MILESTONES.filter((m) => was < m && is >= m).at(-1) ?? null;

/** Midnight: the leftover moves to the goal silently and the clock rolls to the next day. Dime
 *  texts only when the sweep crosses a goal milestone or the under-budget streak hits one. */
export function midnight() {
  settleAtMidnight(); // open markets close NO; Charles's result lands in today before the sweep
  const at = now();
  const start = money.dayStart(at);
  const left = money.today(state, at);
  const g = money.activeGoal(state);
  const was = money.pctOf(g);
  const before = g.saved;
  if (left > 0) {
    state.sweeps.push({ at: new Date(start.getTime() + DAY - 1).toISOString(), amount: left });
    money.save(state, left); // fills the active goal; anything past its price rolls to the next (money.ts)
  }
  const card = () => open("goal", { id: g.id, delta: g.saved - before, source: day(start) });
  jump(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 30));
  const t = now();
  const is = money.pctOf(g);
  const hit = left > 0 ? crossed(was, is) : null;
  if (!g.store && (hit === 100 || g.saved >= g.price)) { // a fund or trip filled: Done, the next goal takes over
    const app = card();
    const next = money.activeGoal(state);
    const then = next !== g && next.saved < next.price ? ` Next up in his goals: ${next.name} ${next.emoji}, ${money.pctOf(next)}% saved; tonight's sweeps go there from now on.` : "";
    return speak("dime", `Midnight sweep. ${left > 0 ? `${usd(left)} he didn't spend today moved to the ${g.name}. ` : ""}That fills it: ${usd(g.price)} saved, 100%, done.${then} Celebrate like his friend would. The goal card follows your words.`,
      [`${g.name} ${g.emoji} is done. ${usd(g.price)} saved 😭`, ...(then ? [`next up: ${next.name} ${next.emoji}`] : []), app]);
  }
  if (hit === 100 || g.saved >= g.price) { // the sweep filled the goal: the card asks to order it (apps/goal.ts)
    const app = card();
    return speak("dime", `Midnight sweep. ${left > 0 ? `${usd(left)} he didn't spend today moved to the ${g.name}. ` : ""}That fills it: ${usd(g.price)} saved, 100%. Celebrate like his friend would, then ask if he wants you to order it now. The goal card follows your words.`,
      [...(left > 0 ? [`the ${usd(left)} you didn't spend today just finished it off 😭`] : []), fullLine(g), app]);
  }
  if (hit) {
    const app = card();
    const eta = money.etaOf(state, t, g.id);
    const lines: Record<number, string> = {
      25: `a quarter of the way to the ${g.name} ${g.emoji} it's real now`,
      50: `ok we're officially halfway to the ${g.name} ${g.emoji} ${usd(g.saved)} of ${usd(g.price)}`,
      75: `75% of the ${g.name}!! the end is in sight`,
      90: `90%. like ${eta} more days and the ${g.name} is yours ${g.emoji}`,
    };
    return speak("dime", `Midnight sweep: the ${usd(left)} he didn't spend today moved to the ${g.name} ${g.emoji}, and that crossed ${hit}% (${usd(g.saved)} of ${usd(g.price)}). At his pace it lands in ${eta} days. Celebrate the milestone like a friend, short. The goal card follows your words.`,
      [lines[hit], app]);
  }
  const n = streak(t);
  if (STREAK_MILESTONES.includes(n))
    return speak("dime", `He came in under his daily number ${n} days in a row (that's a streak milestone). One short hype line, no lecture, no other numbers.`,
      [n >= 14 ? `${n} days under your number. who even are you 🔥` : `${n} days in a row under your number 🔥 keep it going`]);
}
