import "./dashboard.css";
import { api } from "./api.ts";
import { roll, usd, signed } from "./num.ts";
import { T, reduced, later } from "./motion.ts";
import type { Screen } from "./main.ts";

// The dashboard (DESIGN.md §5): today's rail on the left, the money's work on the right. Every
// figure is from GET /api/summary (server/summary.ts), polled every 2s; changed numbers roll.

type Day = { date: string; day: number; kind: "under" | "over" | "none" | "future" | "today"; so_far: "under" | "over" | null };
type Summary = {
  month_name: string;
  today: number;
  over: number;
  budget: number;
  pool: number;
  days_left: number;
  to_goal: number;
  goal: { name: string; price: number; saved: number; pct: number; eta_date: string };
  invested: {
    total: number;
    month_delta: number;
    series: { date: string; value: number }[];
    funds: { id: string; name: string; ticker: string; value: number; change_pct: number }[];
    waiting: number;
  };
  spending: { category: string; label: string; amount: number }[];
  days: Day[];
};

const FUND_COLOR: Record<string, string> = { VOO: "var(--fg)", QQQ: "var(--blue)", SOXX: "var(--money)", DRAM: "var(--amber)", CASH: "var(--muted)" };
const KIND_WORD = { under: "under budget", over: "over budget", none: "no spend", future: "", today: "today" };
const local = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const pct = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1) + "%";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const fine = matchMedia("(hover: hover) and (pointer: fine)");

/** The line draws in once per session (§5 chart rules), not on every visit. */
let drawnIn = false;

const WAVE = `<svg class="wave" viewBox="0 0 120 6" preserveAspectRatio="none" aria-hidden="true"><path d="M0 3 Q15 0 30 3 T60 3 T90 3 T120 3 V6 H0Z"/></svg>`;

const dashboard: Screen = (main, _session, current) => {
  main.classList.add("dash");
  main.innerHTML = `
    <header class="page-head"><h1 class="month">&nbsp;</h1></header>
    <div class="board still">
      <aside class="rail">
        <section class="today" aria-label="Today">
          <p class="lbl">Today</p>
          <span class="num hero big" data-k="today">—</span>
          <div class="slot sub">
            <p class="on">of <span class="num" data-k="budget">—</span> this morning</p>
            <p class="overline"><span class="num" data-k="over">—</span> over today</p>
          </div>
          <dl class="kv">
            <div><dt>Pool left</dt><dd><span class="num" data-k="pool">—</span></dd></div>
            <div><dt>Days left</dt><dd><span class="num" data-k="days">—</span></dd></div>
            <div><dt>To goal</dt><dd><span class="num" data-k="togo">—</span></dd></div>
          </dl>
        </section>
        <section class="goal" aria-label="Goal">
          <div class="glass" style="--p:0"><div class="well"><div class="liquid">${WAVE}</div></div></div>
          <div class="gt">
            <b class="gname">&nbsp;</b>
            <span class="num hero gpct" data-k="gpct" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)">—</span>
            <small><span class="num" data-k="saved" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)">—</span> of <span class="num" data-k="price">—</span></small>
            <span class="eta">&nbsp;</span>
          </div>
        </section>
      </aside>
      <div class="work">
        <section class="invested" aria-labelledby="inv-h">
          <header>
            <div class="ih">
              <h2 id="inv-h">Invested</h2>
              <small class="waiting"><span class="num" data-k="waiting"></span> waiting for a fund</small>
            </div>
            <div class="tot">
              <span class="num hero" data-k="total">—</span>
              <small class="delta"><span class="num" data-k="delta">—</span> this month</small>
            </div>
          </header>
          <div class="chart">
            <svg aria-hidden="true"><g class="grid"><line/><line/><line/></g><path class="line"/></svg>
            <i class="end-dot" hidden></i>
            <span class="end-label num" hidden></span>
            <i class="hair"></i>
            <i class="hover-dot"></i>
            <div class="tip" role="tooltip"></div>
          </div>
          <div class="xl"><span></span><span></span><span></span></div>
          <div class="alloc" aria-hidden="true"></div>
          <ul class="rows funds"></ul>
        </section>
        <div class="pair">
          <section class="spending" aria-labelledby="sp-h">
            <h2 id="sp-h">Spending</h2>
            <ul class="bars"></ul>
          </section>
          <section class="days" aria-labelledby="days-h">
            <h2 id="days-h">Days</h2>
            <div class="wk" aria-hidden="true">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
            <div class="cal">${"<span class='c future'></span>".repeat(35)}</div>
            <ul class="legend">
              <li><i class="under"></i>Under</li><li><i class="over"></i>Over</li><li><i class="none"></i>No spend</li>
            </ul>
          </section>
        </div>
      </div>
    </div>`;

  const $ = <E extends Element = HTMLElement>(s: string) => main.querySelector<E & HTMLElement>(s)!;
  const k = (key: string) => $(`[data-k="${key}"]`);
  const set = (key: string, text: string) => roll(k(key), text);

  const chart = $(".chart");
  const svg = $<SVGSVGElement>(".chart svg");
  const path = $<SVGPathElement>(".chart .line");
  const endDot = $(".end-dot");
  const endLabel = $(".end-label");
  const hair = $(".hair");
  const hoverDot = $(".hover-dot");
  const tip = $(".tip");
  const glass = $(".glass");
  const board = $(".board");

  let last: Summary | null = null;
  let pts: { x: number; y: number }[] = [];

  /** Lays the line out in pixels for the chart's current size. Called on data and on resize. */
  function drawChart(s: Summary) {
    const w = chart.clientWidth;
    const h = chart.clientHeight;
    if (!w || !h) return;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const pad = 12;
    const gy = [pad, h / 2, h - pad];
    svg.querySelectorAll("line").forEach((l, i) => {
      l.setAttribute("x1", "0");
      l.setAttribute("x2", String(w));
      l.setAttribute("y1", String(Math.round(gy[i]) + 0.5));
      l.setAttribute("y2", String(Math.round(gy[i]) + 0.5));
    });
    const vals = s.invested.series.map((p) => p.value);
    const empty = vals.every((v) => v === 0);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const span = Math.max(hi - lo, hi * 0.02, 1);
    lo -= span * 0.12;
    hi += span * 0.12;
    const right = w - 4; // the end dot's radius stays inside
    pts = vals.map((v, i) => ({
      x: (i / (vals.length - 1)) * right,
      y: empty ? h - pad : pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad),
    }));
    // Stepped: hold each close until the next day, then step. It's a ledger, not a ticker.
    path.setAttribute("d", pts.map((p, i) => (i ? `H${p.x.toFixed(1)}V${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(""));
    const end = pts[pts.length - 1];
    endDot.hidden = endLabel.hidden = empty;
    endDot.style.translate = `${end.x}px ${end.y}px`;
    endLabel.style.translate = `${end.x}px ${end.y}px`;
    roll(endLabel, usd(s.invested.total, true));
  }

  function drawIn() {
    if (drawnIn || reduced() || last?.invested.series.every((p) => p.value === 0)) return;
    drawnIn = true;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    chart.classList.add("drawing");
    void later(T.move).then(() => {
      path.style.transition = `stroke-dashoffset var(--t-data) var(--ease-in-out)`;
      path.style.strokeDashoffset = "0";
      setTimeout(() => ((path.style.cssText = ""), chart.classList.remove("drawing")), T.data);
    });
  }

  function hover(e: PointerEvent) {
    if (!fine.matches || !last || !pts.length || last.invested.series.every((p) => p.value === 0)) return;
    const r = chart.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((x / pts[pts.length - 1].x) * (pts.length - 1))));
    const p = last.invested.series[i];
    hair.style.translate = `${pts[i].x}px 0`;
    hoverDot.style.translate = `${pts[i].x}px ${pts[i].y}px`;
    tip.textContent = `${short.format(local(p.date))} · ${usd(p.value, true)}`;
    const tw = tip.offsetWidth;
    tip.style.translate = `${Math.max(0, Math.min(r.width - tw, x - tw / 2))}px 0`;
    chart.classList.add("hovering");
  }
  chart.addEventListener("pointermove", hover);
  chart.addEventListener("pointerleave", () => chart.classList.remove("hovering"));

  function drawFunds(s: Summary) {
    const list = $(".funds");
    const funds = s.invested.funds;
    const key = funds.map((f) => f.id).join();
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = funds.length
        ? funds
            .map(
              (f) => `<li><div class="row fund" data-id="${f.id}">
                <i class="sw" style="background:${FUND_COLOR[f.id] ?? "var(--muted)"}"></i>
                <span class="nm"><b>${esc(f.name)}</b>${f.ticker ? ` <small>${esc(f.ticker)}</small>` : ""}</span>
                <span class="num val"></span>
                <span class="num chg"></span>
              </div></li>`,
            )
            .join("")
        : `<li class="empty">Nothing invested yet. Lose a hand and it lands here.</li>`;
      $(".alloc").innerHTML = funds.map((f) => `<i data-id="${f.id}" style="background:${FUND_COLOR[f.id] ?? "var(--muted)"}"></i>`).join("");
    }
    for (const f of funds) {
      const row = list.querySelector<HTMLElement>(`[data-id="${f.id}"]`)!;
      roll(row.querySelector<HTMLElement>(".val")!, usd(f.value, true));
      const chg = row.querySelector<HTMLElement>(".chg")!;
      roll(chg, pct(f.change_pct));
      chg.classList.toggle("up", f.change_pct > 0);
      $(`.alloc [data-id="${f.id}"]`).style.flexGrow = String(f.value);
    }
  }

  function drawSpending(s: Summary) {
    const list = $(".bars");
    const key = s.spending.map((c) => c.category).join();
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = s.spending.length
        ? s.spending
            .map((c) => `<li data-c="${esc(c.category)}"><span class="cat">${esc(c.label)}</span><span class="bar"><i></i></span><span class="num amt"></span></li>`)
            .join("")
        : `<li class="empty">No spending yet this month.</li>`;
    }
    const top = Math.max(1, ...s.spending.map((c) => c.amount));
    s.spending.forEach((c, i) => {
      const li = list.children[i] as HTMLElement;
      li.querySelector<HTMLElement>(".bar i")!.style.setProperty("--r", String(c.amount / top));
      li.classList.toggle("top", i === 0);
      roll(li.querySelector<HTMLElement>(".amt")!, usd(c.amount));
    });
  }

  function drawDays(s: Summary) {
    const cells = $(".cal").children;
    const month = s.days.find((d) => d.kind === "today")?.date.slice(0, 7);
    s.days.forEach((d, i) => {
      const c = cells[i] as HTMLElement;
      const fill = d.kind === "today" ? (d.so_far ?? "") : d.kind;
      c.className = `c ${fill}${d.kind === "today" ? " now" : ""}${month && d.date.slice(0, 7) < month ? " prev" : ""}`;
      c.textContent = String(d.day);
      const words = d.kind === "today" ? (d.so_far ? `today, ${KIND_WORD[d.so_far]} so far` : "today") : KIND_WORD[d.kind];
      c.setAttribute("aria-label", `${short.format(local(d.date))}${words ? `, ${words}` : ""}`);
      c.title = c.getAttribute("aria-label")!;
    });
  }

  function draw(s: Summary) {
    const first = !last;
    const prevPct = last?.goal.pct;
    last = s;
    $(".month").textContent = s.month_name;
    set("today", usd(s.today));
    set("budget", usd(s.budget));
    if (s.over > 0) set("over", usd(s.over));
    const sub = $(".sub");
    const want = sub.children[s.over > 0 ? 1 : 0];
    if (!want.classList.contains("on")) {
      for (const c of sub.children) c.classList.toggle("on", c === want);
    }
    const railMoved = k("pool").dataset.v !== usd(s.pool) || k("days").dataset.v !== String(s.days_left);
    set("pool", usd(s.pool));
    set("days", String(s.days_left));
    set("togo", usd(s.to_goal));
    const goal = () => {
      $(".gname").textContent = s.goal.name;
      set("gpct", `${s.goal.pct}%`);
      set("saved", usd(s.goal.saved));
      set("price", usd(s.goal.price));
      $(".eta").textContent = s.goal.pct >= 100 ? "Ready to order" : `Arrives ${short.format(local(s.goal.eta_date))}`;
      glass.style.setProperty("--p", String(s.goal.pct / 100));
      if (!first && prevPct !== s.goal.pct && !reduced()) {
        glass.classList.remove("filling");
        void glass.offsetWidth;
        glass.classList.add("filling");
      }
    };
    if (!first && railMoved && prevPct !== s.goal.pct) void later(T.slow).then(goal);
    else goal();
    set("total", usd(s.invested.total, true));
    // A blackjack loss before a fund is picked: shown, never counted in the total.
    const waiting = $(".waiting");
    if (s.invested.waiting > 0) set("waiting", usd(s.invested.waiting));
    waiting.classList.toggle("on", s.invested.waiting > 0);
    const delta = k("delta");
    roll(delta, signed(s.invested.month_delta, true));
    delta.parentElement!.classList.toggle("up", s.invested.month_delta > 0);
    const series = s.invested.series;
    const xl = $(".xl").children;
    [0, Math.floor(series.length / 2), series.length - 1].forEach((i, j) => (xl[j].textContent = short.format(local(series[i].date))));
    drawChart(s);
    drawFunds(s);
    drawSpending(s);
    drawDays(s);
    if (first) drawIn();
  }


  const ro = new ResizeObserver(() => last && drawChart(last));
  ro.observe(chart);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const alive = () => current() && main.isConnected;
  const tick = async () => {
    if (!alive()) return ro.disconnect();
    try {
      const s = await api<Summary>("GET", "/summary");
      if (!alive()) return ro.disconnect();
      draw(s);
      // First paint is still (§ rule 3): transitions stay off until the first data is laid out.
      if (board.classList.contains("still")) void board.offsetWidth, board.classList.remove("still");
      board.classList.remove("stale");
    } catch {
      board.classList.add("stale");
    }
    clearTimeout(timer);
    timer = setTimeout(tick, 2000);
  };
  void tick();
};
export default dashboard;
