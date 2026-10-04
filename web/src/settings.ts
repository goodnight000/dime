import "./settings.css";
import { api, ApiError } from "./api.ts";
import { roll, usd } from "./num.ts";
import { swap } from "./motion.ts";
import type { Screen } from "./main.ts";

// Settings: the variables Dime runs on, one dividered row each: label, a one-line "or text Dime"
// hint, and a minimal control. Saves on change (no Save button); the hint line swaps to "Saved" or
// the server's refusal in place. Texting Dime writes the same fields (set_tone, set_goal,
// update_settings), so the page polls every 2s and rolls whatever changed elsewhere.

type Fund = "VOO" | "QQQ" | "SOXX" | "DRAM" | "CASH";
type Settings = {
  tone: "nice" | "savage";
  income: number;
  bills: number;
  invest: number;
  goal: { name: string; price: number; saved: number };
  fund: Fund | null;
  morning: string;
  hourly: number;
  blackjack: boolean;
  tips: boolean;
};
type Theme = "system" | "light" | "dark";

const FUNDS: [Fund, string, string][] = [
  ["VOO", "VOO", "S&P 500"],
  ["QQQ", "QQQ", "Nasdaq-100"],
  ["SOXX", "SOXX", "Semiconductors"],
  ["DRAM", "DRAM", "Memory"],
  ["CASH", "Cash", "High-yield savings"],
];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const seg = (k: string, opts: [string, string, string?][], label: string) =>
  `<div class="seg" role="radiogroup" aria-label="${label}" data-k="${k}" style="--n:${opts.length}"><i class="thumb" aria-hidden="true"></i>${opts
    .map(([v, t, title]) => `<button type="button" role="radio" data-v="${v}"${title ? ` title="${esc(title)}"` : ""}>${t}</button>`)
    .join("")}</div>`;
const money = (k: string, label: string, suffix = "") =>
  `<label class="field${suffix ? " has-suffix" : ""}"><span class="num" data-n="${k}">—</span><input data-k="${k}" inputmode="numeric" autocomplete="off" aria-label="${label}">${suffix ? `<span class="suffix">${suffix}</span>` : ""}</label>`;
const row = (k: string, label: string, hint: string, control: string) => `
  <li class="set" data-row="${k}">
    <div class="sl"><b>${label}</b><span class="slot hint"><small class="on">${hint}</small><small class="ok">Saved</small><small class="err"></small></span></div>
    <div class="sc">${control}</div>
  </li>`;
const say = (t: string) => `or text Dime: “${t}”`;

const settings: Screen = (main, _session, current) => {
  main.classList.add("settings", "wide");
  main.innerHTML = `
    <header class="page-head"><h1>Settings</h1></header>
    <div class="set-layout still">
      <p class="lead">What Dime runs on. Change anything here, or just text Dime and it changes here too.</p>
      <div class="groups">
        <section aria-labelledby="g-money">
          <h2 id="g-money">Money</h2>
          <ul class="rows">
            ${row("income", "Monthly take-home", say("I make $6,500 a month now"), money("income", "Monthly take-home"))}
            ${row("bills", "Monthly bills", "From your bills, so it isn't set here", `<span class="field ro"><span class="num" data-n="bills">—</span></span>`)}
            ${row("invest", "Invest habit", say("invest $200 a month"), money("invest", "Invest habit", "/mo"))}
            ${row("hourly", "Hourly pay", say("I make $40 an hour"), money("hourly", "Hourly pay", "/hr"))}
          </ul>
        </section>
        <section aria-labelledby="g-goal">
          <h2 id="g-goal">Saving</h2>
          <ul class="rows">
            ${row("goal", "Goal", say("save for a Tokyo trip, $2,400"), `<div class="goal-ed"><label class="field text"><input data-k="goal-name" maxlength="40" autocomplete="off" aria-label="Goal name"></label>${money("goal-price", "Goal price")}</div>`)}
            ${row("fund", "Where losses go", say("send losses to the S&P"), seg("fund", FUNDS.map(([v, t, title]) => [v, t, title]), "Where losses go"))}
          </ul>
        </section>
        <section aria-labelledby="g-dime">
          <h2 id="g-dime">Dime</h2>
          <ul class="rows">
            ${row("tone", "Tone", say("be nicer"), seg("tone", [["nice", "Nice"], ["savage", "Savage"]], "Tone"))}
            ${row("morning", "Morning text", say("text me at 7:30"), `<label class="field time"><input type="time" data-k="morning" step="900" aria-label="Morning text time"></label>`)}
            ${row("blackjack", "Impulse blackjack", say("no more blackjack"), seg("blackjack", [["on", "On"], ["off", "Off"]], "Impulse blackjack"))}
            ${row("tips", "CFO tips", say("stop the tips"), seg("tips", [["on", "On"], ["off", "Off"]], "CFO tips"))}
          </ul>
        </section>
        <section aria-labelledby="g-look">
          <h2 id="g-look">Appearance</h2>
          <ul class="rows">
            ${row("theme", "Theme", "This browser only", seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]], "Theme"))}
          </ul>
        </section>
      </div>
    </div>`;

  const $ = <E extends HTMLElement = HTMLElement>(s: string) => main.querySelector<E>(s)!;
  const layout = $(".set-layout");
  const alive = () => current() && main.isConnected;
  let last: Settings | null = null;
  const saving = new Set<string>(); // rows with a write in flight: the poll leaves them alone
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** The row's hint line: back to the hint, "Saved" for a moment, or the refusal until the next edit. */
  function status(k: string, state: "hint" | "ok" | "err", text = "") {
    const slot = main.querySelector<HTMLElement>(`[data-row="${k}"] .hint`)!;
    clearTimeout(timers.get(k));
    if (state === "err") slot.querySelector(".err")!.textContent = text;
    swap(slot, slot.children[state === "hint" ? 0 : state === "ok" ? 1 : 2]);
    if (state === "ok") timers.set(k, setTimeout(() => status(k, "hint"), 1600));
  }

  async function save(k: string, body: Partial<Settings>) {
    saving.add(k);
    try {
      const s = await api<Settings>("POST", "/settings", body);
      if (!alive()) return;
      saving.delete(k);
      draw(s);
      status(k, "ok");
    } catch (e) {
      saving.delete(k);
      if (!alive()) return;
      status(k, "err", e instanceof ApiError ? errorText(e) : "Didn't save. Try again.");
      if (last) draw(last, true); // put the control back to what the server has
    }
  }
  const errorText = (e: ApiError) => (e.status === 400 && e.code !== "unknown" ? e.code.replace(/\.?$/, ".") : "Didn't save. Try again.");

  // ---- Segmented controls: the thumb slides to the chosen segment (one motion). ----
  function pick(k: string, v: string | null) {
    const el = $(`.seg[data-k="${k}"]`);
    const i = [...el.querySelectorAll("button")].findIndex((b) => b.dataset.v === v);
    el.style.setProperty("--i", String(Math.max(0, i)));
    el.classList.toggle("none", i < 0);
    for (const b of el.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.v === v));
  }
  for (const el of main.querySelectorAll<HTMLElement>(".seg")) {
    el.addEventListener("click", (e) => {
      const b = (e.target as Element).closest("button");
      if (!b || b.getAttribute("aria-checked") === "true") return;
      const k = el.dataset.k!;
      const v = b.dataset.v!;
      pick(k, v);
      if (k === "theme") return setTheme(v as Theme);
      void save(k, k === "blackjack" || k === "tips" ? { [k]: v === "on" } : { [k]: v });
    });
    // Arrow keys move the choice, as a radio group does.
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const bs = [...el.querySelectorAll("button")];
      const at = bs.indexOf(document.activeElement as HTMLButtonElement);
      const next = bs[(at + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length];
      e.preventDefault();
      next.focus();
      next.click();
    });
  }

  // ---- Appearance: this browser's choice, the same key index.html reads before first paint. ----
  function setTheme(t: Theme) {
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    status("theme", "ok");
  }
  pick("theme", (document.documentElement.dataset.theme as Theme | undefined) ?? "system");

  // ---- Inline fields: the rolled value at rest; the input shows while focused. ----
  const raw: Record<string, (s: Settings) => string> = {
    income: (s) => String(s.income),
    invest: (s) => String(s.invest),
    hourly: (s) => String(s.hourly),
    "goal-name": (s) => s.goal.name,
    "goal-price": (s) => String(s.goal.price),
    morning: (s) => s.morning,
  };
  const rowOf = (k: string) => (k.startsWith("goal") ? "goal" : k);
  for (const input of main.querySelectorAll<HTMLInputElement>("input[data-k]")) {
    const k = input.dataset.k!;
    input.addEventListener("focus", () => {
      if (last) input.value = raw[k](last);
      if (input.type !== "time") input.select();
    });
    const commit = () => {
      if (!last) return;
      const v = input.value.trim();
      if (v === raw[k](last)) return;
      const n = Number(v.replace(/[$,\s]/g, ""));
      if (k === "goal-name" || k === "goal-price") {
        const name = k === "goal-name" ? v : last.goal.name;
        const price = k === "goal-price" ? n : last.goal.price;
        return void save("goal", { goal: { name, price, saved: last.goal.saved } });
      }
      void save(rowOf(k), { [k]: k === "morning" ? v : n } as Partial<Settings>);
    };
    if (input.type === "time") input.addEventListener("change", commit);
    else {
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          if (last) input.value = raw[k](last);
          input.blur();
        }
      });
    }
  }

  /** Lays every control out from `s`. Focused fields and rows mid-save keep what's being typed. */
  function draw(s: Settings, force = false) {
    last = s;
    const busy = (k: string) => !force && saving.has(k);
    const focused = (k: string) => document.activeElement === main.querySelector(`input[data-k="${k}"]`);
    roll($('[data-n="income"]'), usd(s.income));
    roll($('[data-n="bills"]'), usd(s.bills));
    roll($('[data-n="invest"]'), usd(s.invest));
    roll($('[data-n="hourly"]'), usd(s.hourly));
    roll($('[data-n="goal-price"]'), usd(s.goal.price));
    if (!focused("goal-name")) $<HTMLInputElement>('input[data-k="goal-name"]').value = s.goal.name;
    if (!focused("morning")) $<HTMLInputElement>('input[data-k="morning"]').value = s.morning;
    if (!busy("tone")) pick("tone", s.tone);
    if (!busy("fund")) pick("fund", s.fund);
    if (!busy("blackjack")) pick("blackjack", s.blackjack ? "on" : "off");
    if (!busy("tips")) pick("tips", s.tips ? "on" : "off");
  }

  const tick = async () => {
    if (!alive()) return;
    try {
      const s = await api<Settings>("GET", "/settings");
      if (!alive()) return;
      draw(s);
      // First paint is still: transitions come on once the first data is laid out.
      if (layout.classList.contains("still")) void layout.offsetWidth, layout.classList.remove("still");
    } catch {
      // the server restarts under bun --watch; the next tick catches up
    }
    if (alive()) setTimeout(tick, 2000);
  };
  void tick();
};
export default settings;
