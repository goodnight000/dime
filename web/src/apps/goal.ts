// The `goal` card (DESIGN.md §3.3): a phone glass filling with money. Arriving in this session it
// plays the sweep: "+$12 tonight" lands → 200ms → liquid rises while % and saved roll (one idea)
// → the date crossfades if it moved. Loaded from history, it shows the final level, still.
import "./goal.css";
import type { Renderer } from "./index.ts";
import { T, later, arrival, swap } from "../motion.ts";
import { roll, usd, signed } from "../num.ts";

type Side = { saved: number; pct: number; eta: string };
type State = { name: string; price: number; from: Side; to: Side; delta: number };

const WAVE = `<svg class="wave" viewBox="0 0 120 6" preserveAspectRatio="none" aria-hidden="true"><path d="M0 3 Q15 0 30 3 T60 3 T90 3 T120 3 V6 H0Z"/></svg>`;
const drawn = new WeakSet<HTMLElement>();
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const arrives = (side: Side) => (side.pct >= 100 ? "Ready to order" : `Arrives ${date(side.eta)}`);

const goal: Renderer = (el, app) => {
  if (drawn.has(el)) return; // a sweep is a record; nothing about it changes later
  drawn.add(el);
  const s = app.state as State;
  el.innerHTML = `<div class="gl">
    <div class="glass" aria-hidden="true"><div class="well"><div class="liquid">${WAVE}</div></div></div>
    <div class="gl-text">
      <b class="gl-name"></b>
      <span class="num hero gl-pct" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)"></span>
      <span class="gl-amt"><span class="num gl-saved" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)"></span> of <span class="gl-price"></span></span>
      <span class="slot gl-eta"><span class="on"></span><span></span></span>
      <span class="gl-delta"></span>
    </div>
  </div>`;
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const glass = q(".glass");
  const pct = q(".gl-pct");
  const saved = q(".gl-saved");
  const eta = q(".gl-eta");
  const delta = q(".gl-delta");
  q(".gl-name").textContent = s.name;
  q(".gl-price").textContent = usd(s.price);
  const full = s.to.pct >= 100;
  delta.textContent = full ? "Full" : s.delta > 0 ? `${signed(s.delta)} tonight` : "Nothing tonight";
  delta.classList.toggle("none", !full && s.delta <= 0);

  const set = (side: Side) => {
    glass.style.setProperty("--p", String(side.pct / 100));
    glass.classList.toggle("empty", side.saved <= 0); // no crest on an empty glass
    roll(pct, `${side.pct}%`);
    roll(saved, usd(side.saved));
  };
  const wait = arrival(el);
  if (!wait || s.delta <= 0) {
    // First paint (or nothing swept): the final state, still.
    set(s.to);
    eta.firstElementChild!.textContent = arrives(s.to);
    return;
  }
  set(s.from);
  eta.firstElementChild!.textContent = arrives(s.from);
  delta.classList.add("pre");
  void (async () => {
    await later(wait + 80);
    delta.classList.replace("pre", "landing");
    await later(T.spring + 200);
    glass.classList.add("filling");
    set(s.to);
    await later(T.data);
    glass.classList.remove("filling");
    const next = arrives(s.to);
    if (next !== eta.firstElementChild!.textContent) {
      eta.lastElementChild!.textContent = next;
      swap(eta, eta.lastElementChild!);
    }
  })();
};

export default goal;
