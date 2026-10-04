// The `goal` card (DESIGN.md §3.3): a phone glass filling with money. Arriving in this session it
// plays the sweep: "+$12 tonight" lands → 200ms → liquid rises while % and saved roll (one idea)
// → the date crossfades if it moved. Loaded from history, it shows the final level, still.
//
// A card that fills the goal is the payoff: "$1,099 saved" and an Order it / Not yet row inside the
// card (the proposal's answer pattern: a fixed 2.75rem swap slot, outcome in place). Live, the %
// rolls with the liquid all the way to 100% (the third column opens as it rolls), then the full
// glass settles with one spring; only then does the ask appear.
import "./goal.css";
import type { Renderer, Act } from "./index.ts";
import { T, EASE, later, arrival, swap, reduced } from "../motion.ts";
import { roll, usd, signed } from "../num.ts";

type Side = { saved: number; pct: number; eta: string };
type Status = "open" | "ordering" | "ordered" | "declined";
type State = {
  name: string;
  price: number;
  from: Side;
  to: Side;
  delta: number;
  order?: { status: Status; outcome: string | null };
};
type Shown = Status | "failed" | "wait";

const WAVE = `<svg class="wave" viewBox="0 0 120 6" preserveAspectRatio="none" aria-hidden="true"><path d="M0 3 Q15 0 30 3 T60 3 T90 3 T120 3 V6 H0Z"/></svg>`;
const CHECK = `<svg class="ok" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// The answer row borrows the proposal card's classes (apps/proposal.css): one pattern, one look.
const ASK = `<div class="pr-answer slot gl-ask" aria-live="polite" tabindex="-1">
    <div class="pr-buttons" data-s="open"><button type="button" class="approve">Order it</button><button type="button" class="decline">Not yet</button></div>
    <p class="pr-out" data-s="ordering"><span class="t">Ordering from Apple</span><span class="busy-dots"><i></i><i></i><i></i></span></p>
    <p class="pr-out" data-s="ordered">${CHECK}<span class="t"></span></p>
    <p class="pr-out muted" data-s="declined"><span class="t">Not yet. It'll be here when you're ready.</span></p>
    <p class="pr-out" data-s="failed"><span class="danger">Didn't go through.</span><button type="button" class="link">Retry</button></p>
  </div>`;

type Local = { shown: Shown; pending: "order" | "decline" | null; ready: boolean };
const seen = new WeakMap<HTMLElement, Local>();
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const arrives = (side: Side) => (side.pct >= 100 ? "Ready to order" : `Arrives ${date(side.eta)}`);

const goal: Renderer = (el, app, act) => {
  const s = app.state as State;
  const local = seen.get(el);
  if (local) return void (s.order && local.ready && answer(el, s));
  seen.set(el, { shown: "wait", pending: null, ready: false });
  const full = Boolean(s.order);
  el.innerHTML = `<div class="gl">
    <div class="glass" aria-hidden="true"><div class="well"><div class="liquid">${WAVE}</div></div></div>
    <div class="gl-text">
      <b class="gl-name"></b>
      <span class="num hero gl-pct" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)"></span>
      <span class="gl-amt"><span class="num gl-saved" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)"></span> ${full ? "saved" : `of <span class="gl-price"></span>`}</span>
      <span class="slot gl-eta"><span class="on"></span><span></span></span>
      <span class="gl-delta"></span>
    </div>
  </div>${full ? ASK : ""}`;
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const glass = q(".glass");
  const pct = q(".gl-pct");
  const saved = q(".gl-saved");
  const eta = q(".gl-eta");
  const delta = q(".gl-delta");
  q(".gl-name").textContent = s.name;
  if (!full) q(".gl-price").textContent = usd(s.price);
  if (full) wire(el, s, act);
  const done = s.to.pct >= 100;
  // The sweep that fills the goal "tops it off" (it isn't tonight's any more once the glass is full).
  delta.textContent = s.delta > 0 ? `${signed(s.delta)} ${done ? "tops it off" : "tonight"}` : done ? "Full" : "Nothing tonight";
  delta.classList.toggle("none", !done && s.delta <= 0);

  // A full card shows the price as saved; any surplus rides along to the next goal unannounced.
  const set = (side: Side) => {
    glass.style.setProperty("--p", String(side.pct / 100));
    glass.classList.toggle("empty", side.saved <= 0); // no crest on an empty glass
    roll(pct, `${side.pct}%`);
    roll(saved, usd(full ? Math.min(side.saved, s.price) : side.saved));
  };
  const finish = () => {
    seen.get(el)!.ready = true;
    if (full) answer(el, s);
  };
  const wait = arrival(el);
  if (!wait || s.delta <= 0) {
    // First paint (or nothing swept): the final state, still.
    set(s.to);
    eta.firstElementChild!.textContent = arrives(s.to);
    return finish();
  }
  set(s.from);
  eta.firstElementChild!.textContent = arrives(s.from);
  delta.classList.add("pre");
  void (async () => {
    await later(wait + 80);
    delta.classList.replace("pre", "landing");
    await later(T.spring + 200);
    glass.classList.add("filling");
    // One idea: the liquid rises and the % and saved roll with it, to 100% when this fills the goal.
    const landing = full && s.from.pct < 100;
    set(s.to);
    await later(T.data);
    glass.classList.remove("filling");
    if (landing && !reduced()) {
      // Then the full glass settles with a single spring.
      glass.animate(
        [{ scale: 1 }, { scale: 1.04, offset: 0.3 }, { scale: 0.993, offset: 0.68 }, { scale: 1 }],
        { duration: T.slow, easing: EASE.out },
      );
      await later(T.slow);
    }
    const next = arrives(s.to);
    if (next !== eta.firstElementChild!.textContent) {
      eta.lastElementChild!.textContent = next;
      swap(eta, eta.lastElementChild!);
      if (full) await later(T.press + T.quick); // the date settles before the ask enters: one motion at a time
    }
    finish();
  })();
};

/** Wires the answer row's buttons: taps are optimistic (the row says "Ordering" at once). */
function wire(el: HTMLElement, s: State, act: Act) {
  const slot = el.querySelector<HTMLElement>(".gl-ask")!;
  const send = (action: "order" | "decline") => {
    const l = seen.get(el)!;
    if (l.pending) return;
    l.pending = action;
    show(el, action === "order" ? "ordering" : "declined");
    act(action).then(
      () => (l.pending = null),
      () => {
        l.pending = null;
        slot.dataset.retry = action;
        show(el, "failed");
      },
    );
  };
  slot.querySelector<HTMLButtonElement>(".approve")!.onclick = () => send("order");
  slot.querySelector<HTMLButtonElement>(".decline")!.onclick = () => send("decline");
  slot.querySelector<HTMLButtonElement>(".link")!.onclick = () => send((slot.dataset.retry as "order" | "decline") ?? "order");
  slot.querySelector<HTMLElement>('[data-s="ordered"] .t')!.textContent = s.order?.outcome ?? "";
}

/** Brings the answer row in line with the server's order status (a tap in flight wins). */
function answer(el: HTMLElement, s: State) {
  const o = s.order!;
  const local = seen.get(el)!;
  el.querySelector<HTMLElement>('[data-s="ordered"] .t')!.textContent = o.outcome ?? "";
  show(el, local.pending && o.status === "open" ? local.shown : o.status);
}

function show(el: HTMLElement, status: Shown) {
  const local = seen.get(el)!;
  const slot = el.querySelector<HTMLElement>(".gl-ask")!;
  const target = slot.querySelector<HTMLElement>(`[data-s="${status}"]`)!;
  if (local.shown === status && target.classList.contains("on")) return;
  // Live (after the first paint) the outcome's check lands; a reload just shows it.
  slot.classList.toggle("live", local.shown !== "wait" || el.classList.contains("new"));
  local.shown = status;
  slot.setAttribute("aria-busy", String(status === "ordering"));
  const focused = slot.contains(document.activeElement);
  for (const b of slot.querySelectorAll<HTMLButtonElement>(".pr-buttons button")) b.disabled = status !== "open";
  swap(slot, target);
  if (focused) (target.querySelector("button") ?? slot).focus({ preventScroll: true });
}

export default goal;
