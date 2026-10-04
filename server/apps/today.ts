// The `today` mini app: the morning card. Today's number, the money weather (bills due in the next
// 3 days) and those bills. The latest card is live: refresh() keeps its number current all day;
// earlier cards, and today's card once the day is over, are frozen records.
import { state, id, type App } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";

export type Weather = "sunny" | "cloudy" | "storm";
export type TodayState = {
  date: string; // the day this card is for
  amount: number; // today's number, live while this is the latest card of the current day
  weather: Weather;
  bills: { merchant: string; amount: number; at: string }[]; // due in the next 3 days
};

/** The weather as an emoji, so Dime's morning line never says ☀️ over a stormy card. */
export const SKY: Record<Weather, string> = { sunny: "☀️", cloudy: "⛅", storm: "⛈️" };

const DAY = 86_400_000;
const STORM = 100; // bills due in the window at or above this make it a storm

/** Bills due in [start of `at`'s day, +3 days), and the weather they make. */
export function weather(at: Date): { weather: Weather; bills: TodayState["bills"] } {
  const from = money.dayStart(at).getTime();
  const bills = state.upcoming
    .filter((b) => {
      const t = new Date(b.at).getTime();
      return t >= from && t < from + 3 * DAY;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const due = bills.reduce((t, b) => t + b.amount, 0);
  return { weather: due === 0 ? "sunny" : due < STORM ? "cloudy" : "storm", bills };
}

export function create(): App {
  const at = now();
  const s: TodayState = { date: at.toISOString(), amount: money.today(state, at), ...weather(at) };
  return { id: id(), kind: "today", version: 1, state: s };
}

/** Rolls the latest today card to the current number. Cheap; called on every thread snapshot. */
export function refresh() {
  const at = now();
  const card = Object.values(state.apps).filter((a) => a.kind === "today").at(-1);
  if (!card) return;
  const s = card.state as TodayState;
  if (money.dayStart(new Date(s.date)).getTime() !== money.dayStart(at).getTime()) return;
  const amount = money.today(state, at);
  if (amount === s.amount) return;
  s.amount = amount;
  card.version++;
}

export const actions: Record<string, (app: App, body: any) => void> = {};
