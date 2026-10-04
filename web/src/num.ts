// The number roll (DESIGN.md §1.5): every changing balance goes through roll().
//
//   import { roll, usd, signed } from "../num.ts";
//   const el = card.querySelector<HTMLElement>(".hero")!;   // <span class="num hero"></span>
//   roll(el, usd(43));           // first call: draws "$43", still
//   roll(el, usd(36));           // same length: only the changed digit columns roll (--t-slow)
//   roll(el, usd(1036));         // more digits: new columns open on the left and roll in ("$788" → "$1,036")
//   roll(el, "−$7");             // anything else that changes shape (a sign appears) crossfades
//   roll(pct, "64%");            // any text works; digits roll, everything else is static
//
// Classes: .num (required) · .hero adds the 0.5em top-aligned $ and % for step-2 and up.
// Slower roll for one-idea motions (goal fill): style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)".
// Size the slot for its longest value (e.g. min-width: 4ch) so neighbours never move.
// Reduced motion, the first call on an element, or from "": instant. Not for text bubbles or the demo panel.
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

/** A ledger amount as colour, not a minus (DESIGN.md §1.4). `amount` is signed from the account's
 *  side (in > 0, out < 0). Out: "$21" in .neg, read as "spent $21". In: "+$2,400" in .pos. An
 *  own-account transfer (kind "transfer") isn't money gone: "$3,000" in the text colour, "moved". */
export function flow(amount: number, kind?: string, cents = false) {
  const text = usd(Math.abs(amount), cents);
  if (kind === "transfer") return { text, cls: "", label: `moved ${text}` };
  return amount > 0 ? { text: "+" + text, cls: "pos", label: `received ${text}` } : { text, cls: "neg", label: `spent ${text}` };
}

// Index 0 is an empty row: a column that isn't there yet (or any more) rolls from or to it.
const STRIP = `<span class="strip"><span></span>${[..."0123456789"].map((d) => `<span>${d}</span>`).join("")}</span>`;
const isDigit = (c: string) => c >= "0" && c <= "9";
// A digit roll needs the same characters in the same places apart from the digits themselves.
const shape = (text: string) => text.replace(/\d/g, "0");
const B = "\0"; // an empty column in an aligned pair

/** One column that shows `c` (a digit column holds the whole strip). */
function cell(c: string) {
  const s = document.createElement("span");
  s.ariaHidden = "true";
  if (isDigit(c)) {
    s.className = "dg";
    s.innerHTML = STRIP; // constant markup
  } else {
    s.className = c === "$" || c === "%" ? "cur" : "ch";
    s.textContent = c;
  }
  return s;
}

/** Points a column at `c`, or at nothing (B): an empty column collapses to no width. */
function show(s: Element, c: string) {
  s.classList.toggle("gone", c === B);
  if (s.classList.contains("dg")) (s as HTMLElement).style.setProperty("--d", c === B ? "0" : String(+c + 1));
}

function build(el: HTMLElement, text: string) {
  el.replaceChildren(...[...text].map(cell));
  [...text].forEach((c, i) => show(el.children[i], c));
}

const parts = (t: string) => {
  const m = /^(\D*)(\d(?:[\d,.]*\d)?)?([^]*)$/.exec(t)!;
  return [m[1], m[2] ?? "", m[3]] as const;
};
/** "99%" and "100%", "$788" and "$1,099": the same text around the digits, so the shorter one is
 *  left-padded with empty columns and the change rolls column by column. Null when it can't. */
function align(a: string, b: string): [string, string] | null {
  const [pa, ba, sa] = parts(a);
  const [pb, bb, sb] = parts(b);
  if (pa !== pb || sa !== sb) return null;
  const n = Math.max(ba.length, bb.length);
  const x = ba.padStart(n, B);
  const y = bb.padStart(n, B);
  for (let i = 0; i < n; i++)
    if (!(x[i] === y[i] || x[i] === B || y[i] === B || (isDigit(x[i]) && isDigit(y[i])))) return null;
  return [pa + x + sa, pb + y + sb];
}

const swapping = new WeakSet<HTMLElement>();
const tidy = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Sets `el` to `text`, rolling the digits that changed. Safe to call every poll. */
export function roll(el: HTMLElement, text: string) {
  const prev = el.dataset.v;
  if (prev === text) return;
  el.dataset.v = text;
  el.setAttribute("aria-label", text);
  el.setAttribute("role", "img"); // so the label, not the hidden columns, is what is read
  if (swapping.has(el)) return; // the crossfade in flight draws the latest value when it swaps
  if (!prev || reduced()) return build(el, text); // first paint (or from nothing): still
  if (shape(prev) === shape(text) && el.children.length === text.length) {
    [...text].forEach((c, i) => c !== prev[i] && show(el.children[i], c));
    return;
  }
  const pair = align(prev, text);
  if (pair) {
    // Draw `from` with the new columns empty, then move every column to `to` in one roll.
    const [from, to] = pair;
    el.replaceChildren(...[...from].map((c, i) => cell(c === B ? to[i] : c)));
    [...from].forEach((c, i) => show(el.children[i], c));
    void el.offsetWidth; // commit `from` so the strips transition
    [...to].forEach((c, i) => show(el.children[i], c));
    clearTimeout(tidy.get(el));
    // Columns that rolled away are dropped once collapsed (no visible change).
    if (to.includes(B)) tidy.set(el, setTimeout(() => el.dataset.v === text && !swapping.has(el) && build(el, text), T.data + 60));
    return;
  }
  swapping.add(el);
  el.classList.remove("swap-in");
  el.classList.add("swap-out");
  setTimeout(() => {
    swapping.delete(el);
    build(el, el.dataset.v!);
    el.classList.replace("swap-out", "swap-in");
    setTimeout(() => el.classList.remove("swap-in"), T.quick);
  }, T.press);
}
