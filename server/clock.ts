// Demo time: the real clock plus an offset the demo panel moves (midnight, skip-day).
import { state } from "./state.ts";

export const now = () => new Date(Date.now() + state.clockOffsetMs);

/** Moves the clock forward to `to` (never back). */
export function jump(to: Date) {
  const ms = to.getTime() - now().getTime();
  if (ms > 0) state.clockOffsetMs += ms;
}
