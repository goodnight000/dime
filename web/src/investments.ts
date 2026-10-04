import "./investments.css";
import { api } from "./api.ts";
import { roll, usd, signed } from "./num.ts";
import { brand } from "./brands.ts";

// The Investments view (mounted by the dashboard behind Overview | Investments). One focal point,
// the total; the chart, the split and the funds under it; where the money came from beside it.
// Every figure is from GET /api/investments (server/investments.ts).

type Inv = {
  now: string;
  total: number;
  month_delta: number;
  month_name: string;
  cost: number;
  gain: number;
  gain_pct: number;
  waiting: number;
  series: { date: string; value: number; cost: number }[];
  funds: { id: string; name: string; ticker: string; issuer: string; value: number; cost: number; return_pct: number; risk: string; share: number; blurb: string }[];
  contributions: { date: string; amount: number; fund: string | null; fund_name: string; source: string; waiting: boolean }[];
};

const RANGES = [
  { id: "1M", days: 31 },
  { id: "3M", days: 92 },
  { id: "All", days: Infinity },
];
const local = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const pct = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1) + "%";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (el: Element, n: number) => (el.classList.toggle("pos", n > 0), el.classList.toggle("neg", n < 0));
const fine = matchMedia("(hover: hover) and (pointer: fine)");

export function mountInvestments(el: HTMLElement): { tick: () => Promise<void> } {
  el.classList.add("inv");
  el.innerHTML = `
    <div class="inv-main">
      <div class="inv-head">
        <div class="inv-tot">
          <p class="lbl">Total invested</p>
          <span class="num hero big" data-k="total">—</span>
          <p class="inv-sub"><span><span class="num" data-k="delta">—</span> in <span data-k="month"></span></span><span><span class="num" data-k="gain">—</span> <span class="num" data-k="gpct"></span> since you started</span></p>
        </div>
        <div class="seg" role="radiogroup" aria-label="Range"></div>
      </div>
      <div class="inv-chart">
        <svg aria-hidden="true"><g class="grid"><line/><line/><line/></g><path class="put"/><path class="line"/></svg>
        <i class="end-dot"></i>
        <i class="hair"></i>
        <i class="hover-dot"></i>
        <div class="tip" role="tooltip"></div>
      </div>
      <div class="inv-xl"><span></span><span></span><span></span></div>
      <p class="inv-key"><span class="k-val">Value</span><span class="k-put">Put in</span></p>
      <section class="inv-funds" aria-labelledby="inv-funds-h">
        <h2 id="inv-funds-h">Funds</h2>
        <div class="alloc-l"></div>
        <div class="alloc"></div>
        <ul class="frows"></ul>
      </section>
    </div>
    <section class="inv-from" aria-labelledby="inv-from-h">
      <h2 id="inv-from-h">Where it came from</h2>
      <p class="put-in"><span class="num" data-k="cost">—</span> put in<span data-k="moves"></span></p>
      <ol class="crows"></ol>
    </section>`;

  const $ = <E extends Element = HTMLElement>(s: string) => el.querySelector<E & HTMLElement>(s)!;
  const k = (key: string) => $(`[data-k="${key}"]`);
  const chart = $(".inv-chart");
  const svg = $<SVGSVGElement>(".inv-chart svg");
  const line = $<SVGPathElement>(".line");
  const put = $<SVGPathElement>(".put");
  const grid = [...el.querySelectorAll<SVGLineElement>(".grid line")];
  const endDot = $(".end-dot");
  const hair = $(".hair");
  const hoverDot = $(".hover-dot");
  const tip = $(".tip");
  const seg = $(".seg");

  let raw = "";
  let data: Inv | null = null;
  let range = "All";
  let view: Inv["series"] = [];
  let pts: { x: number; y: number }[] = [];

  /** The ranges that show something different: 3M only once there are more than 31 days, etc. */
  function drawSeg(n: number) {
    const avail = RANGES.filter((r, i) => i === RANGES.length - 1 || (n > r.days && (i === 0 || n > RANGES[i - 1].days)));
    // "All" equal to 1M is no choice at all: no control.
    const list = avail.length > 1 ? avail : [];
    if (!list.some((r) => r.id === range)) range = list[0]?.id ?? "All";
    const key = list.map((r) => r.id).join();
    if (seg.dataset.key !== key) {
      seg.dataset.key = key;
      seg.innerHTML = list.map((r) => `<button role="radio" data-r="${r.id}">${r.id}</button>`).join("") + (list.length ? `<i class="thumb"></i>` : "");
      seg.style.setProperty("--n", String(list.length));
    }
    const i = list.findIndex((r) => r.id === range);
    seg.style.setProperty("--i", String(Math.max(0, i)));
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.r === range));
  }
  seg.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-r]");
    if (!b || !data || b.dataset.r === range) return;
    range = b.dataset.r!;
    drawSeg(data.series.length);
    drawChart();
  });

  function drawChart() {
    if (!data) return;
    const days = RANGES.find((r) => r.id === range)!.days;
    view = data.series.slice(-Math.min(days, data.series.length));
    const xl = $(".inv-xl").children;
    if (view.length) [0, Math.floor((view.length - 1) / 2), view.length - 1].forEach((i, j) => (xl[j].textContent = short.format(local(view[i].date))));
    const w = chart.clientWidth;
    const h = chart.clientHeight;
    if (!w || !h || !view.length) return;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const pad = 6;
    const vals = view.flatMap((p) => [p.value, p.cost]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const span = Math.max(hi - lo, hi * 0.02, 1);
    lo -= span * 0.08;
    hi += span * 0.08;
    const right = w - 4;
    const X = (i: number) => (view.length === 1 ? right : (i / (view.length - 1)) * right);
    const Y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
    pts = view.map((p, i) => ({ x: X(i), y: Y(p.value) }));
    // Stepped: hold each close until the next day. A ledger, not a ticker.
    const step = (ps: { x: number; y: number }[]) => ps.map((p, i) => (i ? `H${p.x.toFixed(1)}V${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join("");
    line.setAttribute("d", step(pts));
    put.setAttribute("d", step(view.map((p, i) => ({ x: X(i), y: Y(p.cost) }))));
    grid.forEach((g, i) => {
      const y = (pad + (i * (h - 2 * pad)) / 2).toFixed(1);
      g.setAttribute("x1", "0");
      g.setAttribute("x2", String(w));
      g.setAttribute("y1", y);
      g.setAttribute("y2", y);
    });
    const end = pts[pts.length - 1];
    endDot.style.translate = `${end.x}px ${end.y}px`;
  }

  chart.addEventListener("pointermove", (e) => {
    if (!fine.matches || !pts.length) return;
    const r = chart.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((x / pts[pts.length - 1].x) * (pts.length - 1))));
    const p = view[i];
    hair.style.translate = `${pts[i].x}px 0`;
    hoverDot.style.translate = `${pts[i].x}px ${pts[i].y}px`;
    tip.innerHTML = `${short.format(local(p.date))} · <b>${usd(p.value, true)}</b> · put in ${usd(p.cost, true)}`;
    const tw = tip.offsetWidth;
    tip.style.translate = `${Math.max(0, Math.min(r.width - tw, x - tw / 2))}px 0`;
    chart.classList.add("hovering");
  });
  chart.addEventListener("pointerleave", () => chart.classList.remove("hovering"));

  function drawFunds(d: Inv) {
    const key = JSON.stringify(d.funds.map((f) => [f.id, f.name, f.blurb, f.risk]));
    const rows = $(".frows");
    if (rows.dataset.key !== key) {
      rows.dataset.key = key;
      rows.innerHTML = d.funds.length
        ? d.funds
            .map(
              (f) => `<li data-id="${f.id}">${brand(f.issuer)}<span class="fn"><b>${esc(f.name)}${f.ticker && f.ticker !== f.name ? ` <small>${esc(f.ticker)}</small>` : ""}</b><small>${esc(f.blurb)}</small></span><span class="risk">${esc(f.risk)} risk</span><span class="fv"><span class="num val"></span><small><span class="num ret"></span> since bought</small></span></li>`,
            )
            .join("")
        : `<li class="empty">Nothing invested yet. Lose a hand and it lands here.</li>`;
      $(".alloc").innerHTML = d.funds.map((_, i) => `<i style="--t:${i}"></i>`).join("");
      $(".alloc-l").innerHTML = d.funds.map((f) => `<span><b></b> ${esc(f.name)}</span>`).join("");
    }
    const segs = $(".alloc").children;
    const labels = $(".alloc-l").children;
    d.funds.forEach((f, i) => {
      (segs[i] as HTMLElement).style.flexGrow = String(f.share);
      (labels[i] as HTMLElement).style.flexGrow = String(f.share);
      labels[i].querySelector("b")!.textContent = `${Math.round(f.share * 100)}%`;
      const row = rows.querySelector<HTMLElement>(`[data-id="${f.id}"]`)!;
      roll(row.querySelector<HTMLElement>(".val")!, usd(f.value, true));
      const ret = row.querySelector<HTMLElement>(".ret")!;
      roll(ret, pct(f.return_pct));
      tone(ret, f.return_pct);
    });
  }

  function drawFrom(d: Inv) {
    const day = (iso: string) => short.format(new Date(iso));
    $(".crows").innerHTML = d.contributions.length
      ? d.contributions
          .map(
            (c) => `<li${c.waiting ? ` class="waiting"` : ""}><time datetime="${esc(c.date)}">${day(c.date)}</time><span class="cs"><b>${esc(c.source)}</b><small>${c.waiting ? "Waiting for a fund" : `→ ${esc(c.fund_name)}`}</small></span><span class="num ca">${usd(c.amount, true)}</span></li>`,
          )
          .join("")
      : `<li class="empty">Nothing yet. Losses, leftovers and idle cash land here.</li>`;
  }

  function draw(d: Inv) {
    data = d;
    roll(k("total"), usd(d.total, true));
    roll(k("delta"), signed(d.month_delta, true));
    tone(k("delta"), d.month_delta);
    k("month").textContent = d.month_name;
    roll(k("cost"), usd(d.cost, true));
    const n = d.contributions.filter((c) => !c.waiting).length;
    k("moves").textContent = n ? `, ${n} ${n === 1 ? "time" : "times"}` : "";
    roll(k("gain"), signed(d.gain, true));
    roll(k("gpct"), `(${pct(d.gain_pct)})`);
    tone(k("gain"), d.gain);
    tone(k("gpct"), d.gain);
    drawSeg(d.series.length);
    drawChart();
    drawFunds(d);
    drawFrom(d);
  }

  new ResizeObserver(() => drawChart()).observe(chart);

  const tick = async () => {
    try {
      const text = await api<Inv>("GET", "/investments").then((d) => JSON.stringify(d));
      el.classList.remove("stale");
      if (text === raw) return;
      raw = text;
      draw(JSON.parse(text));
    } catch {
      el.classList.add("stale");
    }
  };
  void tick();
  return { tick };
}
