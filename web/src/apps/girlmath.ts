// The `girlmath` card (CONCEPT.md §7): a price as days toward the goal. Two timelines from today
// to the goal: skip it, and buy it, whose extra stretch is the price in --neg. Arriving live it plays
// one idea: the extra stretch grows out of the skip date while the buy date rolls from the skip
// date to its own. Loaded from history (or reduced motion): the final state, still.
import "./girlmath.css";
import type { Renderer } from "./index.ts";
import { T, later, arrival, hold } from "../motion.ts";
import { roll, usd } from "../num.ts";
import { ring } from "../ring.ts";

type Side = { days: number; date: string };
type State = {
  item: string;
  amount: number;
  goal: { name: string; emoji: string; store?: string; pct: number };
  skip: Side;
  buy: Side;
  later: string;
  hours: number | null;
};

const drawn = new WeakSet<HTMLElement>();
// A no-break space: roll() draws each character as its own column, and a plain space collapses.
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }).replace(" ", "\u00a0");
const ROLL = `style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)"`;

const girlmath: Renderer = (el, app) => {
  if (drawn.has(el)) return; // a frozen record: nothing changes after it's drawn
  drawn.add(el);
  const s = app.state as State;
  // Both bars share one scale: today → the buy date. Skip ends at its share of that.
  const a = s.buy.days > 0 ? s.skip.days / s.buy.days : 1;
  el.innerHTML = `<div class="gm" style="--a:${a}">
    <p class="gm-what"><b class="gm-item"></b> <span class="gm-price"></span></p>
    <p class="gm-later"><span class="neg"></span></p>
    <p class="gm-work"></p>
    <p class="gm-goal"></p>
    <div class="gm-bars">
      ${ring(s.goal, s.goal.pct / 100)}
      <span class="gm-lbl">Skip it</span><span class="gm-track"><i class="gm-base"></i></span><span class="gm-date"></span>
      <span class="gm-lbl">Buy it</span><span class="gm-track"><i class="gm-base"></i><i class="gm-extra"></i></span><span class="num gm-date gm-buy" ${ROLL}></span>
    </div>
  </div>`;
  const q = <E extends HTMLElement>(sel: string) => el.querySelector<E>(sel)!;
  q(".gm-item").textContent = s.item;
  q(".gm-price").textContent = usd(s.amount);
  q(".gm-later .neg").textContent = `+${s.later}`;
  q(".gm-work").textContent = s.hours === null ? "" : `= ${s.hours} hour${s.hours === 1 ? "" : "s"} of work`;
  q(".gm-goal").textContent = `${s.goal.name} later`;
  q(".gm-date").textContent = date(s.skip.date);
  const buy = q(".gm-buy");
  const extra = q(".gm-extra");
  const wait = arrival(el);
  if (!wait || s.buy.date === s.skip.date) return roll(buy, date(s.buy.date));
  // Start where skipping lands, then move once: the stretch grows as the date rolls.
  roll(buy, date(s.skip.date));
  extra.classList.add("pre");
  void hold((async () => {
    await later(wait + 80);
    extra.classList.remove("pre");
    roll(buy, date(s.buy.date));
    await later(T.data);
  })());
};

export default girlmath;
