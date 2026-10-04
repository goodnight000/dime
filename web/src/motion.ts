// Motion: one ladder for CSS and JS (DESIGN.md §1.6). The CSS tokens in theme.css carry the same
// numbers; time JS sequences off T so they line up with the transitions they wait for.
//
//   import { T, EASE, reduced, later, arrival } from "../motion.ts";
//   await later(arrival(li) + 80);      // a card's first motion: after its bubble lands (§2.4)
//   el.classList.add("dealt");          // CSS animates; JS only sequences
//   await later(T.slow);                // wait for that travel; 0ms under reduced motion
//   if (reduced()) drawFinal();         // or skip the sequence outright
//
// Shared CSS (motion.css, loaded with this module):
//   .slot           one grid cell holding every state; the child with .on shows (§1.8):
//                   <div class="slot"><div class="on">buttons</div><div>outcome</div></div>
//                   swap(slot, outcomeEl) moves .on: old out 120ms, then new in 200ms.
//   .busy-dots      three 4px dots for a request over 400ms (§1.7): <span class="busy-dots"><i></i><i></i><i></i></span>
//   @keyframes land a small thing landing with --spring: animation: land var(--t-spring) var(--spring) both
import "./motion.css";

/** Durations in ms, the same ladder as the --t-* CSS tokens. */
export const T = { press: 120, quick: 200, move: 320, spring: 400, slow: 480, data: 900 } as const;

/** The curves as CSS strings, for element.animate() or inline styles. */
export const EASE = {
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  spring:
    "linear(0, 0.18 4%, 0.56 11%, 0.86 18%, 1.03 26%, 1.07 32%, 1.06 39%, 1.02 50%, 0.995 63%, 1)",
} as const;

const query = matchMedia("(prefers-reduced-motion: reduce)");
/** True when the user asked for less motion: show the finished state, still, and skip timers. */
export const reduced = () => query.matches;

/** Resolves after `ms`, or at once under reduced motion, so a sequence never delays a result. */
export const later = (ms: number) =>
  new Promise<void>((r) => (reduced() || ms <= 0 ? r() : setTimeout(r, ms)));

/** Ms until a thread li's arrival (pop or card-in, plus its stagger) ends; 0 if it is not arriving. */
export function arrival(li: HTMLElement): number {
  if (reduced() || !li.classList.contains("new")) return 0;
  return (parseFloat(li.style.animationDelay) || 0) + T.move;
}

/** Shows `next` in its .slot: the shown state leaves (120ms), then `next` enters (200ms). */
export function swap(slot: HTMLElement, next: Element) {
  for (const c of slot.children) c.classList.toggle("on", c === next);
}

// Card sequences in flight. The sidebar's today line waits for them (main.ts), so a card resolves
// first and the number rolls after: one motion at a time (§ rule 1).
const playing = new Set<Promise<unknown>>();
/** Registers a card sequence; returns it unchanged. */
export function hold<P extends Promise<unknown>>(p: P): P {
  playing.add(p);
  void p.finally(() => playing.delete(p)).catch(() => {});
  return p;
}
/** Resolves once no card sequence is playing (capped at 8s, so a stuck one can't freeze the sidebar). */
export function quiet(): Promise<void> {
  const cap = new Promise<void>((r) => setTimeout(r, 8000));
  const drain = (async () => {
    while (playing.size) await Promise.allSettled([...playing]);
  })();
  return Promise.race([drain, cap]);
}
