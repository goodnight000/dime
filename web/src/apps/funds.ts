// The `funds` card (DESIGN.md §3.2): master–detail. Five fixed rows (a radiogroup), a detail pane
// that reads out the selected row, and one answer button. Selection is local and instant; the pick
// goes to the server, and the confirmed card is a record: rows dim, the answer becomes the outcome.
import "./funds.css";
import type { Renderer } from "./index.ts";
import { T, swap, later } from "../motion.ts";
import { usd } from "../num.ts";

type Fund = {
  id: string; ticker: string; name: string; risk: 1 | 2 | 3 | 4;
  blurb: string; goodFor: string; fact: string; ret: { pct: number; period: string };
};
type State = {
  funds: Fund[];
  risk: Record<number, string>;
  selected: string;
  picked: string | null;
  moving?: { amount: number; reason: string }; // idle cash ("Move $2,000 to …") or a loss ("Send $280 to …")
};

const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;
const seen = new WeakMap<HTMLElement, { picked: string | null; selected: string }>();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const label = (f: Fund) => (f.ticker === f.name ? f.name : `${f.name} (${f.ticker})`);
const retLine = (f: Fund) =>
  `${f.ret.pct > 0 ? "+" : ""}${f.ret.pct}% ${f.ret.period === "APY" ? "APY" : f.ret.period === "1y" ? "last year" : f.ret.period}, illustrative`;

const funds: Renderer = (el, app, act) => {
  const s = app.state as State;
  const prev = seen.get(el);
  seen.set(el, { picked: s.picked, selected: prev?.selected ?? s.selected });
  if (prev) {
    if (!prev.picked && s.picked) void confirm(el, s);
    return;
  }

  // First paint: the final state, still.
  const risk = (f: Fund) => s.risk[f.risk];
  el.innerHTML = `<div class="fp">
    <div class="fp-list" role="radiogroup" aria-label="${s.moving?.reason === "cfo" ? "Where the cash goes" : "Where losses go"}">${s.funds
      .map(
        (f) => `<div class="fp-row" role="radio" data-id="${f.id}" aria-checked="false" tabindex="-1">
          <span class="fp-radio" aria-hidden="true"><i></i></span>
          <span class="fp-text"><span class="fp-name"><b>${esc(f.name)}</b>${
            f.ticker === f.name ? "" : ` <small>${esc(f.ticker)}</small>`
          }</span><span class="fp-blurb">${esc(f.blurb)}</span></span>
          <span class="fp-risk" role="img" aria-label="${risk(f)} risk">${[1, 2, 3, 4]
            .map((n) => `<i${n <= f.risk ? ` class="on"` : ""}></i>`)
            .join("")}</span>
        </div>`,
      )
      .join("")}</div>
    <div class="fp-detail slot" aria-live="polite"><div class="on"></div><div></div></div>
    <div class="fp-answer slot">
      <button type="button" class="on"><span class="slot"><span class="on"></span><span><span class="busy-dots"><i></i><i></i><i></i></span></span></span></button>
      <div class="fp-done">${CHECK}<span></span></div>
      <div class="fp-fail"><span>Didn't go through.</span> <button type="button" class="link">Retry</button></div>
    </div>
  </div>`;

  const rows = [...el.querySelectorAll<HTMLElement>(".fp-row")];
  const detail = el.querySelector<HTMLElement>(".fp-detail")!;
  const answer = el.querySelector<HTMLElement>(".fp-answer")!;
  const btn = answer.querySelector<HTMLButtonElement>(":scope > button")!;
  const btnLabel = btn.querySelector<HTMLElement>(".slot")!;
  const fail = answer.querySelector<HTMLElement>(".fp-fail")!;
  const byId = (fid: string) => s.funds.find((f) => f.id === fid)!;

  const fill = (pane: Element, f: Fund) => {
    pane.innerHTML = `<p></p><p></p><p></p>`;
    const [a, b, c] = pane.children;
    a.textContent = f.goodFor;
    b.textContent = `${risk(f)} risk · ${retLine(f)}`;
    c.textContent = f.fact;
  };

  /** Moves the selection; `animate` is false for the first paint. */
  const select = (fid: string, animate: boolean) => {
    const f = byId(fid);
    for (const r of rows) {
      const on = r.dataset.id === fid;
      r.setAttribute("aria-checked", String(on));
      r.tabIndex = on ? 0 : -1;
      r.classList.toggle("landing", on && animate);
    }
    btnLabel.firstElementChild!.textContent = s.moving
      ? `${s.moving.reason === "cfo" ? "Move" : "Send"} ${usd(s.moving.amount)} to ${f.name}`
      : `Send losses to ${f.name}`;
    if (!animate) return fill(detail.firstElementChild!, f);
    const next = [...detail.children].find((c) => !c.classList.contains("on"))!;
    fill(next, f);
    swap(detail, next);
    seen.get(el)!.selected = fid;
  };
  select(s.picked ?? s.selected, false);

  if (s.picked) {
    done(el, s);
    return;
  }

  const current = () => rows.find((r) => r.getAttribute("aria-checked") === "true")!.dataset.id!;
  // Selection holds still while a pick is in flight, so the outcome names the row that is lit.
  const decided = () => el.querySelector(".fp")!.classList.contains("decided") || btn.ariaBusy === "true";
  for (const [i, r] of rows.entries()) {
    r.onclick = () => !decided() && current() !== r.dataset.id && select(r.dataset.id!, true);
    r.onkeydown = (e) => {
      if (decided()) return;
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (current() !== r.dataset.id) select(r.dataset.id!, true);
        return;
      }
      if (!step) return;
      e.preventDefault();
      const to = rows[(i + step + rows.length) % rows.length];
      select(to.dataset.id!, true);
      to.focus();
    };
  }

  const pick = async () => {
    if (btn.ariaBusy === "true") return;
    btn.ariaBusy = "true";
    if (!btn.classList.contains("on")) swap(answer, btn);
    const busy = setTimeout(() => swap(btnLabel, btnLabel.lastElementChild!), 400);
    try {
      await act("pick", { fund: current() });
    } catch {
      swap(answer, fail);
    } finally {
      clearTimeout(busy);
      btn.ariaBusy = null;
      swap(btnLabel, btnLabel.firstElementChild!);
    }
  };
  btn.onclick = pick;
  fail.querySelector("button")!.onclick = pick;
};

function done(el: HTMLElement, s: State) {
  const f = s.funds.find((x) => x.id === s.picked)!;
  const answer = el.querySelector<HTMLElement>(".fp-answer")!;
  const out = answer.querySelector<HTMLElement>(".fp-done")!;
  out.lastElementChild!.textContent = `Losses go to ${label(f)}.`;
  swap(answer, out);
  const fp = el.querySelector<HTMLElement>(".fp")!;
  fp.classList.add("decided");
  for (const r of el.querySelectorAll<HTMLElement>(".fp-row")) {
    r.setAttribute("aria-checked", String(r.dataset.id === f.id)); // the record shows what the server took
    r.tabIndex = -1;
    r.setAttribute("aria-disabled", "true");
  }
}

/** The pick landed: answer → outcome (120 + 200ms), then the other rows dim. */
async function confirm(el: HTMLElement, s: State) {
  const fp = el.querySelector<HTMLElement>(".fp")!;
  fp.classList.add("holding"); // keep rows bright until the outcome has swapped in
  done(el, s);
  await later(T.press + T.quick);
  fp.classList.remove("holding");
}

export default funds;
