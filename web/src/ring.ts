// The goal visual (DESIGN.md §3.3): a thick ring that fills with money around the goal's face, its
// emoji, or the store's mark when it's a thing he buys from a known brand. One component at three
// sizes (--rs): the chat card and the dashboard's active goal large, queued goals as mini rings.
// The level is --p (0–1); the arc transitions over --t-data, so callers only set it.
import "./ring.css";
import { brand, hasBrand } from "./brands.ts";

export type GoalFace = { name: string; emoji: string; store?: string };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The face: the store's tile for a known brand (Apple), else the emoji. */
export const face = (g: GoalFace) =>
  g.store && hasBrand(g.store) ? brand(g.store) : `<span class="emo" aria-hidden="true">${esc(g.emoji || "🎯")}</span>`;

/** Ring markup. `inner` replaces the face (Settings puts the emoji input there). */
export const ring = (g: GoalFace | null, p = 0, inner?: string) =>
  `<span class="ring${p <= 0 ? " nil" : ""}${p >= 1 ? " whole" : ""}" style="--p:${p}" aria-hidden="${inner ? "false" : "true"}"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="43" pathLength="100"/><circle class="arc" cx="50" cy="50" r="43" pathLength="100"/></svg><span class="face">${inner ?? (g ? face(g) : "")}</span></span>`;

/** Moves a ring to `p`: the arc animates (CSS), the nil/whole classes follow (not .empty: Forth styles .rows .empty). */
export function level(el: Element, p: number) {
  const r = el as HTMLElement;
  r.style.setProperty("--p", String(Math.max(0, Math.min(1, p))));
  r.classList.toggle("nil", p <= 0);
  r.classList.toggle("whole", p >= 1);
}
