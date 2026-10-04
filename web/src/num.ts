// The number roll (DESIGN.md §1.5): every changing balance goes through roll().
//
//   import { roll, usd, signed } from "../num.ts";
//   const el = card.querySelector<HTMLElement>(".hero")!;   // <span class="num hero"></span>
//   roll(el, usd(43));           // first call: draws "$43", still
//   roll(el, usd(36));           // same length: only the changed digit columns roll (--t-slow)
//   roll(el, usd(1284.5, true)); // length or separators change: the number crossfades
//   roll(pct, "64%");            // any text works; digits roll, everything else is static
//
// Classes: .num (required) · .hero adds the 0.5em top-aligned $ and % for step-2 and up.
// Slower roll for one-idea motions (goal fill): style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)".
// Size the slot for its longest value (e.g. min-width: 4ch) so neighbours never move.
// Reduced motion, or the first call on an element: instant. Not for text bubbles or the demo panel.
import "./num.css";
import { T, reduced } from "./motion.ts";

const fmt = (cents: boolean) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
const whole = fmt(false);
const exact = fmt(true);

/** "$1,099" or with cents "$1,284.50"; negatives get the real minus: "−$7". */
export const usd = (n: number, cents = false) => (cents ? exact : whole).format(n).replace("-", "−");

/** A delta with its sign: "+$12", "−$7", "$0". */
export const signed = (n: number, cents = false) => (n > 0 ? "+" : "") + usd(n, cents);

const STRIP = `<span class="strip">${[..."0123456789"].map((d) => `<span>${d}</span>`).join("")}</span>`;
const isDigit = (c: string) => c >= "0" && c <= "9";
// A digit roll needs the same characters in the same places apart from the digits themselves.
const shape = (text: string) => text.replace(/\d/g, "0");

function build(el: HTMLElement, text: string) {
  el.replaceChildren(
    ...[...text].map((c) => {
      const s = document.createElement("span");
      s.ariaHidden = "true";
      if (isDigit(c)) {
        s.className = "dg";
        s.style.setProperty("--d", c);
        s.innerHTML = STRIP; // constant markup
      } else {
        s.className = c === "$" || c === "%" ? "cur" : "ch";
        s.textContent = c;
      }
      return s;
    }),
  );
}

const swapping = new WeakSet<HTMLElement>();

/** Sets `el` to `text`, rolling the digits that changed. Safe to call every poll. */
export function roll(el: HTMLElement, text: string) {
  const prev = el.dataset.v;
  if (prev === text) return;
  el.dataset.v = text;
  el.setAttribute("aria-label", text);
  el.setAttribute("role", "img"); // so the label, not the hidden columns, is what is read
  if (swapping.has(el)) return; // the crossfade in flight draws the latest value when it swaps
  if (prev === undefined || reduced()) return build(el, text);
  if (shape(prev) !== shape(text)) {
    swapping.add(el);
    el.classList.remove("swap-in");
    el.classList.add("swap-out");
    setTimeout(() => {
      swapping.delete(el);
      build(el, el.dataset.v!);
      el.classList.replace("swap-out", "swap-in");
      setTimeout(() => el.classList.remove("swap-in"), T.quick);
    }, T.press);
    return;
  }
  [...text].forEach((c, i) => {
    if (isDigit(c) && c !== prev[i]) (el.children[i] as HTMLElement).style.setProperty("--d", c);
  });
}
