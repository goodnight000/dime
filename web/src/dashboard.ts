import "./dashboard.css";
import { api } from "./api.ts";
import { roll, usd } from "./num.ts";
import { T, later } from "./motion.ts";
import type { Screen } from "./main.ts";
import { categoryIcon } from "./brands.ts";
import { ring, face, level } from "./ring.ts";
import { mountCalendar } from "./calendar.ts";

// The dashboard (DESIGN.md §5): today's rail on the left, the money's work on the right. Every
// figure is from GET /api/summary (server/summary.ts), polled every 2s; changed numbers roll.

type Summary = {
  now: string;
  month_name: string;
  today: number;
  over: number;
  budget: number;
  pool: number;
  days_left: number;
  to_goal: number;
  goal: { name: string; price: number; saved: number; pct: number; eta_date: string };
  goals: Goal[];
  spending: { category: string; label: string; amount: number }[];
};

const local = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** The latest summary seen anywhere (main.ts's sidebar poll fetches the same one), so arriving
 *  here paints real figures in the first frame instead of "—" that snap to numbers mid-rise. */
let cached: Summary | null = null;
export const prime = (s: unknown) => void (cached = s as Summary);

type Goal = { id: string; name: string; emoji: string; store?: string; price: number; saved: number; pct: number; status: "active" | "queued" | "ready" | "ordered" | "done"; eta_date: string };
/** What a goal's date line says. */
const when = (g: Goal) => (g.status === "ready" ? "Ready to order" : g.status === "done" ? "Done" : `Saved by ${short.format(local(g.eta_date))}`);

const dashboard: Screen = (main, _session, current) => {
  main.classList.add("dash");
  main.innerHTML = `
    <header class="page-head">
      <h1 class="date">&nbsp;</h1>
      <div class="seg view" role="radiogroup" aria-label="View" style="--n:2;--i:0">
        <i class="thumb" aria-hidden="true"></i>
        <button role="radio" aria-checked="true" data-view="overview">Overview</button>
        <button role="radio" aria-checked="false" data-view="investments">Investments</button>
      </div>
    </header>
    <div class="board still">
      <aside class="rail">
        <section class="today" aria-label="Today">
          <p class="lbl">Left today</p>
          <span class="num hero big" data-k="today">—</span>
          <div class="slot sub">
            <p class="on">of <span class="num" data-k="budget">—</span> this morning</p>
            <p class="overline"><span class="num" data-k="over">—</span> over today</p>
          </div>
        </section>
        <section class="goal" aria-label="Goals">
          ${ring(null, 0)}
          <div class="gt">
            <b class="gname">&nbsp;</b>
            <span class="num hero gpct" data-k="gpct" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)">—</span>
            <small><span class="num" data-k="saved" style="--roll-dur: var(--t-data); --roll-ease: var(--ease-in-out)">—</span> of <span class="num" data-k="price">—</span></small>
            <span class="eta">&nbsp;</span>
          </div>
          <ol class="gq" aria-label="Up next"></ol>
        </section>
        <section class="spending" aria-labelledby="sp-h">
          <h2 id="sp-h">Spending <small class="range"></small></h2>
          <ul class="bars"></ul>
        </section>
      </aside>
      <div class="work">
        <section class="days" aria-labelledby="days-h"></section>
      </div>
    </div>
    <div class="inv" hidden></div>`;

  const $ = <E extends Element = HTMLElement>(s: string) => main.querySelector<E & HTMLElement>(s)!;
  const k = (key: string) => $(`[data-k="${key}"]`);
  const set = (key: string, text: string) => roll(k(key), text);

  const hero = $(".goal > .ring");
  let heroId = "";
  let queueKey = "";
  const board = $(".board");
  const cal = mountCalendar($(".days"));

  let last: Summary | null = null;


  function drawSpending(s: Summary) {
    const list = $(".bars");
    const top5 = s.spending.slice(0, 5);
    const key = top5.map((c) => c.category).join();
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = top5.length
        ? top5
            .map((c) => `<li data-c="${esc(c.category)}"><span class="cat">${categoryIcon(c.category)}<span>${esc(c.label)}</span></span><span class="bar"><i></i></span><span class="num amt"></span></li>`)
            .join("")
        : `<li class="empty">No spending yet this month.</li>`;
    }
    const top = Math.max(1, ...top5.map((c) => c.amount));
    top5.forEach((c, i) => {
      const li = list.children[i] as HTMLElement;
      li.querySelector<HTMLElement>(".bar i")!.style.setProperty("--r", String(c.amount / top));
      li.classList.toggle("top", i === 0);
      roll(li.querySelector<HTMLElement>(".amt")!, usd(c.amount));
    });
  }


  function draw(s: Summary) {
    const first = !last;
    const prevPct = last ? (last.goals.find((g) => g.id === heroId)?.pct ?? -1) : -1;
    last = s;
    // The page is today: the rail is today's money, the chart and calendar roll back from it, and
    // Spending (the only month-to-date figure) carries its own range.
    const at = new Date(s.now);
    $(".date").textContent = day.format(at);
    $(".range").textContent = at.getDate() === 1 ? short.format(at) : `${short.format(new Date(at.getFullYear(), at.getMonth(), 1))}–${at.getDate()}`;
    const railMoved = k("today").dataset.v !== usd(s.today);
    set("today", usd(s.today));
    k("today").classList.toggle("neg", s.over > 0); // a balance, so neutral; red only once over
    set("budget", usd(s.budget));
    if (s.over > 0) set("over", usd(s.over));
    const sub = $(".sub");
    const want = sub.children[s.over > 0 ? 1 : 0];
    if (!want.classList.contains("on")) {
      for (const c of sub.children) c.classList.toggle("on", c === want);
    }
    // The stack: the first goal still in play large (the one saving now, or a full one waiting to be
    // ordered), the rest as mini rings in priority order. Ordered and finished goals leave it.
    const live = s.goals.filter((g) => g.status !== "ordered" && g.status !== "done");
    const top = live[0] ?? s.goals.at(-1)!;
    const goal = () => {
      const same = top.id === heroId;
      $(".gname").textContent = top.name;
      set("gpct", `${top.pct}%`);
      set("saved", usd(top.saved));
      set("price", usd(top.price));
      $(".eta").textContent = when(top);
      if (!same) hero.querySelector(".face")!.innerHTML = face(top);
      // A new goal on top is a new subject, not a fill: it appears at its level, still.
      const arc = hero.querySelector<SVGElement>(".arc")!;
      if (!same) arc.style.transition = "none";
      level(hero, top.saved <= 0 ? 0 : top.pct / 100);
      if (!same) void hero.getBoundingClientRect(), (arc.style.transition = "");
      heroId = top.id;
      const rest = live.slice(1);
      const key = JSON.stringify(rest.map((g) => [g.id, g.name, g.emoji, g.pct, g.saved, g.price, g.status, g.eta_date]));
      if (key !== queueKey) {
        queueKey = key;
        $(".gq").innerHTML = rest
          .map((g, i) => `<li>${ring(g, g.saved <= 0 ? 0 : g.pct / 100)}<span class="gqt"><b>${esc(g.name)}</b><small>${usd(g.saved)} of ${usd(g.price)}</small></span><small class="gd${g.status === "ready" ? " ready" : ""}">${when(g).replace("Saved by ", "")}</small></li>`)
          .join("");
      }
    };
    if (!first && railMoved && prevPct !== top.pct && top.id === heroId) void later(T.slow).then(goal);
    else goal();
    drawSpending(s);
  }


  let timer: ReturnType<typeof setTimeout> | undefined;
  const alive = () => current() && main.isConnected;
  const tick = async () => {
    if (!alive()) return;
    try {
      const s = await api<Summary>("GET", "/summary");
      if (!alive()) return;
      cached = s;
      draw(s);
      if (view === "investments") void inv?.tick();
      else void cal.tick();
      // First paint is still (§ rule 3): transitions stay off until the first data is laid out.
      if (board.classList.contains("still")) void board.offsetWidth, board.classList.remove("still");
      board.classList.remove("stale");
    } catch {
      board.classList.add("stale");
    }
    clearTimeout(timer);
    timer = setTimeout(tick, 2000);
  };
  // Overview | Investments: one page, two views, deep-linkable as /dashboard?view=investments.
  type View = "overview" | "investments";
  const seg = $(".seg.view");
  const invHost = $(".inv");
  let view: View = new URLSearchParams(location.search).get("view") === "investments" ? "investments" : "overview";
  let inv: { tick: () => Promise<void> } | null = null;
  async function show(v: View, push = false) {
    view = v;
    const btns = [...seg.querySelectorAll<HTMLButtonElement>("button")];
    btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.view === v)));
    seg.style.setProperty("--i", String(btns.findIndex((b) => b.dataset.view === v)));
    board.hidden = v !== "overview";
    invHost.hidden = v !== "investments";
    if (push) history.replaceState(null, "", v === "investments" ? "/dashboard?view=investments" : "/dashboard");
    if (v === "investments") {
      inv ??= (await import("./investments.ts")).mountInvestments(invHost);
      void inv.tick();
    } else void cal.tick();
  }
  seg.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-view]");
    if (b && b.dataset.view !== view) void show(b.dataset.view as View, true);
  });
  seg.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const btns = [...seg.querySelectorAll<HTMLButtonElement>("button")];
    const n = btns[(btns.findIndex((b) => b.dataset.view === view) + d + btns.length) % btns.length];
    n.focus();
    n.click();
  });
  void show(view);

  if (cached) draw(cached); // still: the board keeps .still until the first fetched draw
  void tick();
};
export default dashboard;
