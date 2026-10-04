// The `proposal` card: one CFO find in Forth's ask grammar (DESIGN.md §3.5). Title line, the ask,
// the thing itself on an inset, then the answer row. The answer row is a swap slot: Approve / Not
// now give way to the outcome in place, so the card's height never changes after it arrives.
// Taps are optimistic: the row says "Approved · calling Comcast" the moment you tap.
import "./proposal.css";
import type { Renderer } from "./index.ts";
import { swap } from "../motion.ts";

type Status = "open" | "working" | "done" | "declined" | "failed";
type State = {
  title: string;
  summary: string;
  artifact: { name: string; was?: string; now?: string; delta?: string; note?: string } | null;
  verb?: string; // the yes button: "Call Comcast"
  working: string;
  declined: string;
  status: Status;
  outcome: { text: string; money?: string } | null;
};

const CHECK = `<svg class="ok" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const TEMPLATE = `
  <small class="pr-title"></small>
  <p class="pr-summary"></p>
  <div class="pr-art" hidden>
    <span class="pr-name"><b></b><span class="pr-note"></span></span>
    <span class="pr-fig"><s></s><span class="pr-arrow"> → </span><span class="pr-now"></span><em></em></span>
  </div>
  <div class="pr-answer slot" aria-live="polite" tabindex="-1">
    <div class="pr-buttons" data-s="open"><button type="button" class="approve">Approve</button><button type="button" class="decline">Not now</button></div>
    <p class="pr-out" data-s="working"><span class="t"></span><span class="busy-dots"><i></i><i></i><i></i></span></p>
    <p class="pr-out" data-s="done">${CHECK}<span class="t"></span></p>
    <p class="pr-out muted" data-s="declined"><span class="t"></span></p>
    <p class="pr-out" data-s="failed"><span class="danger">Didn't go through.</span><button type="button" class="link">Retry</button></p>
  </div>`;

type Local = { shown: Status; pending: "approve" | "decline" | null };
const seen = new WeakMap<HTMLElement, Local>();

const text = (root: Element, sel: string, value = "") => {
  const el = root.querySelector<HTMLElement>(sel)!;
  el.textContent = value;
  el.hidden = !value;
};

/** `text` with its `money` part wrapped, so only the amount takes the money colour. */
function outcome(el: HTMLElement, o: State["outcome"]) {
  el.textContent = "";
  if (!o) return;
  const at = o.money ? o.text.indexOf(o.money) : -1;
  if (at < 0) return void (el.textContent = o.text);
  const m = document.createElement("span");
  m.className = "money";
  m.textContent = o.money!;
  el.append(o.text.slice(0, at), m, o.text.slice(at + o.money!.length));
}

const proposal: Renderer = (el, app, act) => {
  const s = app.state as State;
  let local = seen.get(el);
  const first = !local;
  if (!local) {
    el.innerHTML = `<div class="pr">${TEMPLATE}</div>`;
    const card = el.firstElementChild!;
    text(card, ".pr-title", s.title);
    text(card, ".pr-summary", s.summary);
    const a = s.artifact;
    if (a) {
      card.querySelector<HTMLElement>(".pr-art")!.hidden = false;
      text(card, ".pr-name b", a.name);
      text(card, ".pr-note", a.note);
      text(card, ".pr-fig s", a.was);
      card.querySelector<HTMLElement>(".pr-arrow")!.hidden = !(a.was && a.now);
      text(card, ".pr-now", a.now);
      text(card, ".pr-fig em", a.delta);
    }
    if (s.verb) card.querySelector(".approve")!.textContent = s.verb;
    text(card, '[data-s="working"] .t', s.working);
    text(card, '[data-s="declined"] .t', s.declined);
    local = { shown: "open", pending: null };
    seen.set(el, local);

    const slot = card.querySelector<HTMLElement>(".slot")!;
    const send = (action: "approve" | "decline") => {
      const l = seen.get(el)!;
      if (l.pending) return;
      l.pending = action;
      show(el, action === "approve" ? "working" : "declined", true);
      act(action).then(
        () => (l.pending = null),
        () => {
          l.pending = null;
          slot.dataset.retry = action;
          show(el, "failed", true);
        },
      );
    };
    card.querySelector<HTMLButtonElement>(".approve")!.onclick = () => send("approve");
    card.querySelector<HTMLButtonElement>(".decline")!.onclick = () => send("decline");
    card.querySelector<HTMLButtonElement>(".link")!.onclick = () =>
      send((slot.dataset.retry as "approve" | "decline") ?? "approve");
  }

  outcome(el.querySelector<HTMLElement>('[data-s="done"] .t')!, s.outcome);
  // A tap in flight wins over a snapshot that hasn't caught up with it yet.
  const next = local.pending && (s.status === "open" || s.status === "failed") ? local.shown : s.status;
  show(el, next, !first);
};

/** Shows the answer row's `status` state; `live` lets it swap (out, then in), else it's just there. */
function show(el: HTMLElement, status: Status, live: boolean) {
  const local = seen.get(el)!;
  const slot = el.querySelector<HTMLElement>(".slot")!;
  const target = slot.querySelector<HTMLElement>(`[data-s="${status}"]`)!;
  if (local.shown === status && target.classList.contains("on")) return;
  local.shown = status;
  slot.classList.toggle("live", live);
  slot.setAttribute("aria-busy", String(status === "working"));
  const focused = slot.contains(document.activeElement);
  for (const b of slot.querySelectorAll<HTMLButtonElement>(".pr-buttons button")) b.disabled = status !== "open";
  swap(slot, target);
  // The tapped button just hid itself; keep keyboard focus in the row (on Retry when there is one).
  if (focused) (target.querySelector("button") ?? slot).focus({ preventScroll: true });
}

export default proposal;
