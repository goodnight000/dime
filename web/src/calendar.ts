// The dashboard calendar: a real month whose heat map diverges around each day's budget (green the
// more was left, red the further over), small marks for bills, paydays and events at the foot of each
// cell, and one column beside it: the last 7 days' money in and out, or the day you picked. Data from
// GET /api/calendar?month=YYYY-MM (server/calendar.ts). The column is a swap slot sized to the
// calendar, so opening a day crossfades in place and nothing reflows.
import { usd, flow } from "./num.ts";
import { brand } from "./brands.ts";
import { icon } from "./icons.ts";
import { swap } from "./motion.ts";
import "./calendar.css";

type Bill = { merchant: string; amount: number; at: string; status: "paid" | "due" };
type Ev = { kind: string; label: string; amount: number | null; at: string; merchant?: string };
type Tx = { id: string; at: string; merchant: string; amount: number; category: string; kind: string; covered: boolean; cost: "fixed" | "variable" | null };
type Day = {
  date: string; day: number; today: boolean; future: boolean; budget: number | null; over: number; net: number | null; heat: number;
  outcome: "under" | "over" | "none" | "future"; txns: Tx[]; bills: Bill[]; events: Ev[];
};
type Cal = {
  month: string; label: string; today: string; range: { first: string; last: string };
  totals: { due: Bill[] }; days: Day[];
  recent: { from: string; in: number; out: number; txns: (Tx & { date: string })[] };
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
const wkday = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const money = (n: number) => usd(n, !Number.isInteger(Math.round(n * 100) / 100));
const whole = (n: number) => usd(Math.abs(Math.round(n)));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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
/** A heat step as a class: hn3..hn1 over, h0 on budget or no data, hp1..hp3 under. */
const heatCls = (h: number) => (h > 0 ? `hp${h}` : h < 0 ? `hn${-h}` : "h0");
/** A day before the history began: the server leaves it neutral with nothing in it. */
const noData = (d: Day) => !d.future && !d.today && d.heat === 0 && !d.txns.length && Math.abs(d.net ?? 0) >= 1;

export function mountCalendar(sec: HTMLElement) {
  sec.innerHTML = `
    <header class="cal-head">
      <div class="mnav">
        <h2 id="days-h">&nbsp;</h2>
        <button class="ib" data-step="-1" aria-label="Previous month">${icon("chevron", "back")}</button>
        <button class="ib" data-step="1" aria-label="Next month">${icon("chevron")}</button>
      </div>
    </header>
    <div class="cal-body">
      <div class="cal-main">
        <div class="wk" aria-hidden="true">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal" aria-labelledby="days-h">${"<button class='c blank' tabindex='-1' disabled></button>".repeat(42)}</div>
        <div class="legend" aria-label="Color shows each day against its budget: red over, green under">
          <span>Over</span>${["hn3", "hn2", "hn1", "h0", "hp1", "hp2", "hp3"].map((l) => `<i class="${l}"></i>`).join("")}<span>Under</span>
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
  let month: string | null = null; // null until the first load: then the server's current month
  let data: Cal | null = null;
  let raw = "";
  let open: string | null = null; // the day in the detail, or null for recent activity
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
    if (open && !c.days.some((d) => d.date === open)) open = null;
    if (!focusDate || !c.days.some((d) => d.date === focusDate)) focusDate = (c.days.find((d) => d.today) ?? c.days[0]).date;
    const rows = Math.ceil((lead + c.days.length) / 7); // 5 or 6 weeks: no empty trailing week
    cells.forEach((cell, i) => {
      cell.hidden = i >= rows * 7;
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
      cell.disabled = false;
      cell.dataset.date = d.date;
      cell.tabIndex = d.date === focusDate ? 0 : -1;
      cell.className = `c ${heatCls(d.heat)}${d.future ? " future" : ""}${d.today ? " now" : ""}${d.date === open ? " sel" : ""}`;
      const m = marks(d);
      cell.innerHTML = `<span class="dn">${d.day}</span><span class="marks">${m.slice(0, 2).join("")}${m.length > 2 ? `<small>+${m.length - 2}</small>` : ""}</span>`;
      const bits = [long.format(local(d.date)) + (d.today ? ", today" : "")];
      if (d.today && d.net !== null) bits.push(d.net < 0 ? `${whole(d.net)} over so far` : `${whole(d.net)} left`);
      else if (!d.future && d.net !== null && !noData(d)) bits.push(Math.abs(d.net) < 1 ? "on budget" : `${whole(d.net)} ${d.net < 0 ? "over" : "under"} budget`);
      if (d.bills.length) bits.push(`${d.bills.length} bill${d.bills.length > 1 ? "s" : ""}${d.future ? " due" : ""}: ${d.bills.map((b) => b.merchant).join(", ")}`);
      const ev = d.events.filter((e) => e.kind !== "sweep");
      if (ev.length) bits.push(ev.map((e) => e.label).join(", "));
      cell.setAttribute("aria-label", bits.join(". "));
      cell.setAttribute("aria-pressed", String(d.date === open));
    });
    drawRecent(c);
    if (open) drawDay(c.days.find((d) => d.date === open)!, false);
  }

  const row = (tile: string, name: string, meta: string, amount: string) =>
    `<li>${tile}<span class="tt"><b>${esc(name)}</b><small>${meta}</small></span><span class="v">${amount}</span></li>`;
  // Colour carries the direction (num.ts flow): out in --neg without a minus, in in --pos with "+".
  const amt = (f: { text: string; cls: string; label: string }) => `<span class="${f.cls}" aria-label="${f.label}">${f.text}</span>`;
  const tx = (t: Tx) => amt(flow(t.kind === "income" || t.kind === "refund" ? t.amount : -t.amount, t.covered ? "transfer" : t.kind, !Number.isInteger(t.amount)));

  /** No day picked: the last 7 days, money in against money out, then the transactions by day. */
  function drawRecent(c: Cal) {
    const r = c.recent;
    const y = local(c.today);
    const yest = ymdOf(new Date(y.getFullYear(), y.getMonth(), y.getDate() - 1));
    const dayWord = (d: string) => (d === c.today ? "Today" : d === yest ? "Yesterday" : wkday.format(local(d)));
    const groups = new Map<string, typeof r.txns>();
    for (const t of r.txns) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
    const total = r.in + r.out || 1;
    $(".mo").innerHTML = `
      <p class="ey">Last 7 days</p>
      <div class="io">
        <p><small>In</small><span class="io-n pos">+${whole(r.in)}</span></p>
        <p><small>Out</small><span class="io-n neg">${whole(r.out)}</span></p>
      </div>
      <div class="split" aria-hidden="true"><i class="s-in" style="flex-grow:${r.in / total}"></i><i class="s-out" style="flex-grow:${r.out / total}"></i></div>
      <div class="scroll">
        ${
          r.txns.length
            ? [...groups]
                .map(([d, ts]) => `<h3><button class="go-day" data-go="${d}">${dayWord(d)}</button></h3><ul class="lst">${ts
                  .map((t) => row(brand(t.merchant), t.merchant, `${esc(cap(t.category))}${t.covered ? " · Won at blackjack" : ""}`, tx(t)))
                  .join("")}</ul>`)
                .join("")
            : `<p class="empty">Nothing in or out this week.</p>`
        }
      </div>`;
  }

  /** Renders `d` into the hidden day pane and swaps to it (one crossfade), or redraws in place. */
  function drawDay(d: Day, show = true) {
    const panes = [...slot.querySelectorAll<HTMLElement>(".dy")];
    const shown = panes.find((p) => p.classList.contains("on"));
    const target = show || !shown ? panes.find((p) => p !== shown)! : shown;
    const bills = d.bills.filter((b) => b.status === "due");
    const net = d.net ?? 0;
    // One statement for the day: over or under its budget (today: what's left), colour as meaning.
    const [lead, cls, sub] = d.future
      ? [bills.length ? money(bills.reduce((t, b) => t + b.amount, 0)) : "Nothing scheduled", "", bills.length ? `${bills.length === 1 ? "bill" : "bills"} due, already set aside` : ""]
      : noData(d)
        ? ["No data", "", "before your history starts"]
        : d.today
          ? net < 0 ? [`${whole(net)} over`, "neg", `of today's ${whole(d.budget ?? 0)} budget`] : [`${whole(net)} left`, "", `of today's ${whole(d.budget ?? 0)} budget`]
          : Math.abs(net) < 1
            ? ["On budget", "", `${whole(d.budget ?? 0)} budget`]
            : [`${whole(net)} ${net < 0 ? "over" : "under"}`, net < 0 ? "neg" : "pos", `of ${whole(d.budget ?? 0)} budget`];
    const IN = ["payday", "refund", "blackjack-win"]; // money arriving; sweeps and investing move it between his own pots
    const ev = (e: Ev) => (e.amount === null ? "" : IN.includes(e.kind) ? amt(flow(Math.abs(e.amount))) : money(Math.abs(e.amount)));
    const events = d.events;
    target.innerHTML = `
      <div class="dh">
        <p class="ey">${long.format(local(d.date))}${d.today ? ", today" : ""}</p>
        <button class="ib x" aria-label="Close day">${icon("x")}</button>
      </div>
      <p class="big ${cls}">${lead}</p>
      <p class="meta">${sub}</p>
      <div class="scroll">
        ${d.txns.length ? `<h3>Transactions</h3><ul class="lst">${d.txns.map((t) => row(brand(t.merchant), t.merchant, `${clock.format(new Date(t.at))} · ${esc(cap(t.category))}${t.covered ? " · Won at blackjack" : ""}`, tx(t))).join("")}</ul>` : ""}
        ${bills.length ? `<h3>Bills due</h3><ul class="lst">${bills.map((b) => row(brand(b.merchant), b.merchant, "Scheduled", money(b.amount))).join("")}</ul>` : ""}
        ${events.length ? `<h3>Also</h3><ul class="lst">${events.map((e) => row(glyph(e), e.label, clock.format(new Date(e.at)), ev(e))).join("")}</ul>` : ""}
        ${!d.txns.length && !bills.length && !events.length ? `<p class="empty">${d.future ? "Nothing on this day yet." : d.today ? "Nothing yet today." : "Nothing happened this day."}</p>` : ""}
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
  slot.addEventListener("click", async (e) => {
    const to = (e.target as Element).closest<HTMLElement>("[data-go]")?.dataset.go;
    if (to && data) {
      // A day in the recent list may sit in the month before the one open.
      if (!data.days.some((d) => d.date === to)) {
        const a = local(data.month);
        const b = local(to);
        await go((b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(), () => to);
      }
      return select(to);
    }
    if (!(e.target as Element).closest(".x")) return;
    const date = open;
    select(null);
    cells.find((c) => c.dataset.date === date)?.focus();
  });
  for (const b of sec.querySelectorAll<HTMLButtonElement>(".ib[data-step]")) b.addEventListener("click", () => void go(Number(b.dataset.step)));

  return { tick: () => load().catch(() => {}) };
}
