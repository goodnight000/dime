// The dashboard's calendar: a real month with a spend heat map (All / Variable / Fixed), quiet
// markers for bills and everything else that happened, and a day detail beside it. Data from
// GET /api/calendar?month=YYYY-MM (server/calendar.ts). The detail lives in a swap slot sized to the
// calendar, so opening a day crossfades in place and nothing reflows.
import { usd } from "./num.ts";
import { brand } from "./brands.ts";
import { icon } from "./icons.ts";
import { swap } from "./motion.ts";
import "./calendar.css";

type Mode = "all" | "variable" | "fixed";
type Spend = Record<Mode, number>;
type Bill = { merchant: string; amount: number; at: string; status: "paid" | "due" };
type Ev = { kind: string; label: string; amount: number | null; at: string; merchant?: string };
type Tx = { id: string; at: string; merchant: string; amount: number; category: string; kind: string; covered: boolean; cost: "fixed" | "variable" | null };
type Day = {
  date: string; day: number; today: boolean; future: boolean; spend: Spend; budget: number | null; over: number;
  outcome: "under" | "over" | "none" | "future"; txns: Tx[]; bills: Bill[]; events: Ev[]; line: string;
};
type Cal = {
  month: string; label: string; today: string; range: { first: string; last: string }; scale: Record<Mode, number[]>;
  totals: Spend & { over_days: number; under_days: number; due: Bill[] }; days: Day[];
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const local = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymdOf = (d: Date) => `${ymOf(d)}-${String(d.getDate()).padStart(2, "0")}`;
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const long = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const money = (n: number) => usd(n, !Number.isInteger(Math.round(n * 100) / 100));
const MODE_WORD: Record<Mode, string> = { all: "spent", variable: "variable", fixed: "fixed" };

/** Event glyphs: Charade icons on the neutral tile, the same footprint as a brand tile. */
const GLYPH: Record<string, string> = {
  sweep: "target", "blackjack-win": "trophy", "blackjack-loss": "trending-up", market: "people", cfo: "check-circle",
  refund: "undo", duplicate: "copy", invest: "trending-up", goal: "gem",
};
const glyph = (e: Ev) => (e.kind === "payday" ? brand(e.merchant ?? "Payroll") : `<span class="brand plain" aria-hidden="true">${icon(GLYPH[e.kind] ?? "star")}</span>`);
/** What a cell shows, most telling first. Sweeps happen most nights, so they stay in the detail. */
function marks(d: Day): string[] {
  const loud = d.events.filter((e) => !["sweep", "payday", "invest"].includes(e.kind));
  return [
    ...loud.filter((e) => e.kind === "cfo" || e.kind === "duplicate").map(glyph),
    ...d.bills.map((b) => brand(b.merchant)),
    ...d.events.filter((e) => e.kind === "payday").map(glyph),
    ...loud.filter((e) => e.kind !== "cfo" && e.kind !== "duplicate").map(glyph),
  ];
}
const level = (v: number, cuts: number[]) => (v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);

export function mountCalendar(sec: HTMLElement) {
  sec.innerHTML = `
    <header class="cal-head">
      <div class="mnav">
        <h2 id="days-h">&nbsp;</h2>
        <button class="ib" data-step="-1" aria-label="Previous month">${icon("chevron", "back")}</button>
        <button class="ib" data-step="1" aria-label="Next month">${icon("chevron")}</button>
      </div>
      <div class="seg" role="radiogroup" aria-label="Spend shown" style="--n:3;--i:0">
        <i class="thumb" aria-hidden="true"></i>
        <button role="radio" aria-checked="true" data-mode="all">All</button>
        <button role="radio" aria-checked="false" data-mode="variable">Variable</button>
        <button role="radio" aria-checked="false" data-mode="fixed">Fixed</button>
      </div>
    </header>
    <div class="cal-body">
      <div class="cal-main">
        <div class="wk" aria-hidden="true">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal" aria-labelledby="days-h">${"<button class='c blank' tabindex='-1' disabled></button>".repeat(42)}</div>
        <div class="legend">
          <span class="ramp"><span>Less</span>${[0, 1, 2, 3, 4, 5].map((l) => `<i class="lv${l}"></i>`).join("")}<span>More</span></span>
          <span class="scale"></span>
          <span class="key-over"><i class="od"></i>Over the day's number</span>
        </div>
      </div>
      <div class="dd slot" aria-live="polite">
        <div class="pane mo on"></div>
        <div class="pane dy"></div>
        <div class="pane dy"></div>
      </div>
    </div>`;

  const $ = <E extends HTMLElement = HTMLElement>(s: string) => sec.querySelector<E>(s)!;
  const grid = $(".cal");
  const cells = [...grid.children] as HTMLButtonElement[];
  const slot = $(".dd");
  const seg = $(".seg");
  let mode: Mode = "all";
  let month: string | null = null; // null until the first load: then the server's current month
  let data: Cal | null = null;
  let raw = "";
  let open: string | null = null; // the day in the detail, or null for the month
  let focusDate: string | null = null;

  // Raw text, so an unchanged 2s poll skips the redraw.
  async function load(m = month) {
    const text = await fetch(`/api/calendar${m ? `?month=${m}` : ""}`).then((r) => (r.ok ? r.text() : Promise.reject(r.status)));
    if (m !== month || text === raw) return; // a poll for a month he has since left, or nothing new
    raw = text;
    data = JSON.parse(text) as Cal;
    month = data.month;
    draw();
  }

  function draw() {
    if (!data) return;
    const c = data;
    $("#days-h").textContent = c.label;
    const [prev, next] = sec.querySelectorAll<HTMLButtonElement>(".ib");
    prev.disabled = c.month <= c.range.first;
    next.disabled = c.month >= c.range.last;
    const lead = local(c.month).getDay();
    const cuts = c.scale[mode];
    if (open && !c.days.some((d) => d.date === open)) open = null;
    if (!focusDate || !c.days.some((d) => d.date === focusDate)) focusDate = (c.days.find((d) => d.today) ?? c.days[0]).date;
    cells.forEach((cell, i) => {
      const d = c.days[i - lead];
      if (!d) {
        // The neighbouring months' dates, quiet: the grid always reads as a real calendar.
        const [y, m] = c.month.split("-").map(Number);
        cell.className = "c blank";
        cell.innerHTML = `<span class="dn">${new Date(y, m - 1, 1 + i - lead).getDate()}</span>`;
        cell.disabled = true;
        cell.tabIndex = -1;
        cell.removeAttribute("aria-label");
        delete cell.dataset.date;
        return;
      }
      const v = d.spend[mode];
      const lv = d.future ? 0 : level(v, cuts);
      const over = d.outcome === "over" && mode !== "fixed";
      cell.disabled = false;
      cell.dataset.date = d.date;
      cell.tabIndex = d.date === focusDate ? 0 : -1;
      cell.className = `c lv${lv}${d.future ? " future" : ""}${d.today ? " now" : ""}${d.date === open ? " sel" : ""}`;
      const m = marks(d);
      cell.innerHTML = `<span class="dn">${d.day}</span>${over ? '<i class="od"></i>' : ""}<span class="marks">${m.slice(0, 2).join("")}${m.length > 2 ? `<small>+${m.length - 2}</small>` : ""}</span>`;
      const bits = [long.format(local(d.date)) + (d.today ? ", today" : "")];
      if (!d.future) bits.push(v > 0 ? `${money(v)} ${MODE_WORD[mode]}` : `nothing ${mode === "all" ? "spent" : MODE_WORD[mode]}`);
      if (over) bits.push(`${usd(d.over)} over`);
      if (d.bills.length) bits.push(`${d.bills.length} bill${d.bills.length > 1 ? "s" : ""}${d.future ? " due" : ""}: ${d.bills.map((b) => b.merchant).join(", ")}`);
      const ev = d.events.filter((e) => e.kind !== "sweep");
      if (ev.length) bits.push(ev.map((e) => e.label).join(", "));
      cell.setAttribute("aria-label", bits.join(". "));
      cell.setAttribute("aria-pressed", String(d.date === open));
    });
    $(".scale").textContent = `${usd(cuts[0])} to ${usd(cuts[3])}+ a day`;
    $(".key-over").classList.toggle("off", mode === "fixed");
    drawMonth(c);
    if (open) drawDay(c.days.find((d) => d.date === open)!, false);
  }

  function drawMonth(c: Cal) {
    const t = c.totals;
    const cur = c.days.some((d) => d.today);
    const ahead = c.days.every((d) => d.future);
    const dueSum = t.due.reduce((n, b) => n + b.amount, 0);
    const due = t.due.slice(0, 5);
    const rows = due.map((b) => `<li>${brand(b.merchant)}<span class="tt"><b>${esc(b.merchant)}</b><small>${short.format(new Date(b.at))}</small></span><span class="v">${money(b.amount)}</span></li>`).join("");
    $(".mo").innerHTML = ahead
      ? `<p class="ey">${esc(c.label.split(" ")[0])} ahead</p>
        <p class="big">${usd(dueSum)}</p>
        <p class="meta">${t.due.length} bill${t.due.length === 1 ? "" : "s"} scheduled, all fixed</p>
        <h3>First up</h3><ul class="lst">${rows}</ul>`
      : `<p class="ey">${esc(c.label.split(" ")[0])}${cur ? " so far" : ""}</p>
        <p class="big">${usd(t.all)}</p>
        <p class="meta">${usd(t.variable)} variable · ${usd(t.fixed)} fixed</p>
        <p class="meta">${t.under_days} day${t.under_days === 1 ? "" : "s"} under, ${t.over_days} over${cur && t.due.length ? ` · ${usd(dueSum)} still due` : ""}</p>
        ${cur && due.length ? `<h3>Coming up</h3><ul class="lst">${rows}</ul>` : biggest(c)}`;
  }

  /** A finished month: its heaviest days in the current mode, each one a way into that day. */
  function biggest(c: Cal) {
    const top = c.days.filter((d) => !d.future && d.spend[mode] > 0).sort((a, b) => b.spend[mode] - a.spend[mode]).slice(0, 5);
    if (!top.length) return `<h3>Biggest days</h3><p class="empty">Nothing ${MODE_WORD[mode]} this month.</p>`;
    const lead = (d: Day) => d.txns.filter((t) => (mode === "all" ? t.cost : t.cost === mode)).sort((a, b) => b.amount - a.amount)[0];
    return `<h3>Biggest days${mode === "all" ? "" : `, ${mode}`}</h3><ul class="lst">${top
      .map((d) => {
        const t = lead(d);
        return `<li><button class="go" data-go="${d.date}">${t ? brand(t.merchant) : "<span></span>"}<span class="tt"><b>${long.format(local(d.date))}</b><small>${t ? `Mostly ${esc(t.merchant)}` : ""}</small></span><span class="v">${money(d.spend[mode])}</span></button></li>`;
      })
      .join("")}</ul>`;
  }

  /** Renders `d` into the hidden day pane and swaps to it (one crossfade), or redraws in place. */
  function drawDay(d: Day, show = true) {
    const panes = [...slot.querySelectorAll<HTMLElement>(".dy")];
    const shown = panes.find((p) => p.classList.contains("on"));
    const target = show || !shown ? panes.find((p) => p !== shown)! : shown;
    const spent = d.spend.all;
    const verdict = d.future
      ? ""
      : d.outcome === "over"
        ? `<span class="tag over">${usd(d.over)} over</span>`
        : d.today
          ? `<span class="tag">Today</span>`
          : d.outcome === "none"
            ? `<span class="tag">No spend</span>`
            : `<span class="tag under">Under</span>`;
    const txns = d.txns;
    const row = (tile: string, name: string, meta: string, amount: string, cls = "") =>
      `<li${cls ? ` class="${cls}"` : ""}>${tile}<span class="tt"><b>${esc(name)}</b><small>${meta}</small></span><span class="v">${amount}</span></li>`;
    const sign = (t: Tx) => (t.kind === "income" || t.kind === "refund" ? "+" : "−") + money(t.amount);
    const costWord = (t: Tx) => (t.covered ? "Won at blackjack" : t.cost === "fixed" ? "Fixed" : t.cost === "variable" ? "Variable" : t.kind === "income" ? "Income" : "Transfer");
    const bills = d.bills.filter((b) => b.status === "due");
    const events = d.events;
    target.innerHTML = `
      <div class="dh">
        <p class="ey">${long.format(local(d.date))}</p>
        <button class="ib x" aria-label="Close day">${icon("x")}</button>
      </div>
      <div class="fig">
        <p class="big">${d.future ? (bills.length ? money(bills.reduce((t, b) => t + b.amount, 0)) : "—") : usd(spent)}</p>
        ${verdict}
      </div>
      <p class="meta">${
        d.future
          ? bills.length ? "scheduled" : "nothing scheduled"
          : `${usd(d.spend.variable)} variable · ${usd(d.spend.fixed)} fixed`
      }</p>
      <p class="line">${icon("cue", "cue")}<span>${esc(d.line)}</span></p>
      <div class="scroll">
        ${txns.length ? `<h3>Transactions</h3><ul class="lst">${txns.map((t) => row(brand(t.merchant), t.merchant, `${clock.format(new Date(t.at))} · ${esc(t.category[0].toUpperCase() + t.category.slice(1))} · ${costWord(t)}`, sign(t), t.kind === "income" || t.kind === "refund" ? "credit" : "")).join("")}</ul>` : ""}
        ${bills.length ? `<h3>Due</h3><ul class="lst">${bills.map((b) => row(brand(b.merchant), b.merchant, "Scheduled · Fixed", money(b.amount))).join("")}</ul>` : ""}
        ${events.length ? `<h3>Also</h3><ul class="lst">${events.map((e) => row(glyph(e), e.label, clock.format(new Date(e.at)), e.amount === null ? "" : money(Math.abs(e.amount)))).join("")}</ul>` : ""}
        ${!txns.length && !bills.length && !events.length ? `<p class="empty">${d.future ? "Nothing on this day yet." : d.today ? "Nothing yet today." : "Nothing happened this day."}</p>` : ""}
        ${d.today && data?.totals.due.length ? `<h3>Next up</h3><ul class="lst">${data.totals.due.slice(0, 3).map((b) => row(brand(b.merchant), b.merchant, short.format(new Date(b.at)), money(b.amount))).join("")}</ul>` : ""}
      </div>`;
    if (show) swap(slot, target);
  }

  function select(date: string | null) {
    open = date;
    if (date) focusDate = date;
    for (const c of cells) {
      c.classList.toggle("sel", !!date && c.dataset.date === date);
      if (c.dataset.date) c.setAttribute("aria-pressed", String(c.dataset.date === date));
    }
    if (!data) return;
    if (date) drawDay(data.days.find((d) => d.date === date)!);
    else swap(slot, $(".mo"));
  }

  async function go(step: number, focus?: (c: Cal) => string) {
    if (!data) return;
    const d = local(data.month);
    const m = ymOf(new Date(d.getFullYear(), d.getMonth() + step, 1));
    if (m < data.range.first || m > data.range.last) return;
    month = m;
    open = null;
    swap(slot, $(".mo"));
    await load(m).catch(() => {});
    if (focus && data) {
      focusDate = focus(data);
      draw();
      cells.find((c) => c.dataset.date === focusDate)?.focus();
    }
  }

  grid.addEventListener("click", (e) => {
    const cell = (e.target as Element).closest<HTMLButtonElement>(".c[data-date]");
    if (!cell) return;
    select(open === cell.dataset.date ? null : cell.dataset.date!);
  });
  grid.addEventListener("keydown", (e) => {
    const cell = (e.target as Element).closest<HTMLButtonElement>(".c[data-date]");
    if (!cell || !data) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const d = local(cell.dataset.date!);
    const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
    const key = ymdOf(to);
    const target = cells.find((c) => c.dataset.date === key);
    if (target) {
      cell.tabIndex = -1;
      target.tabIndex = 0;
      focusDate = key;
      target.focus();
    } else void go(delta > 0 ? 1 : -1, () => key);
  });
  sec.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open) return;
    const date = open;
    select(null);
    cells.find((c) => c.dataset.date === date)?.focus();
  });
  slot.addEventListener("click", (e) => {
    const go = (e.target as Element).closest<HTMLElement>("[data-go]");
    if (go) return select(go.dataset.go!);
    if (!(e.target as Element).closest(".x")) return;
    const date = open;
    select(null);
    cells.find((c) => c.dataset.date === date)?.focus();
  });
  for (const b of sec.querySelectorAll<HTMLButtonElement>(".ib[data-step]")) b.addEventListener("click", () => void go(Number(b.dataset.step)));
  seg.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-mode]");
    if (!b) return;
    mode = b.dataset.mode as Mode;
    const btns = [...seg.querySelectorAll("button")];
    btns.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    seg.style.setProperty("--i", String(btns.indexOf(b)));
    draw();
  });
  seg.addEventListener("keydown", (e) => {
    const btns = [...seg.querySelectorAll<HTMLButtonElement>("button")];
    const i = btns.indexOf(e.target as HTMLButtonElement);
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (i < 0 || !d) return;
    e.preventDefault();
    const n = btns[(i + d + btns.length) % btns.length];
    n.focus();
    n.click();
  });

  return { tick: () => load().catch(() => {}) };
}
