// Charles's control panel (DESIGN.md §7), opened in a second window during the pitch: one button per
// demo beat, in demo order, each with a key. Dense, plain, obviously a tool: an amber bar on top, no
// product motion. The right column is the server's live state, polled every second, instant.
import "./demo.css";
import { api } from "./api.ts";
import type { Screen } from "./main.ts";

type DemoState = {
  now: string;
  today: number;
  goal: { name: string; saved: number; price: number; pct: number };
  fund: string | null;
  tone: "nice" | "savage";
  force: "win" | "lose" | "push" | null;
  chase: boolean;
  typing: { dime: number; group: number };
  pendingInvest: number | null;
  log: { at: string; text: string; error?: boolean }[];
};
// [label, key, action, body]; key "" = no shortcut.
type Btn = [string, string, string, object?];
type Section = { title: string; buttons: Btn[]; seg?: "force" | "tone"; form?: "swipe" | "friend"; more?: true };

// The beats Charles presses on stage, in DEMO.md order (Hick/Fitts: only these are in view, big).
// Everything else sits under "More controls"; its keys still work while it's closed.
const SECTIONS: Section[] = [
  {
    title: "Blackjack next hand",
    seg: "force",
    buttons: [
      ["Win", "W", "force-blackjack", { result: "win" }],
      ["Lose", "L", "force-blackjack", { result: "lose" }],
      ["Push", "", "force-blackjack", { result: "push" }],
      ["Fair", "F", "force-blackjack", { result: "fair" }],
    ],
  },
  { title: "Swipe", buttons: [["Blue Bottle matcha $7", "1", "swipe", { merchant: "Blue Bottle", amount: 7, category: "coffee" }]] },
  { title: "Should I buy", buttons: [["Sneakers $280", "S", "say", { thread: "dime", text: "should I buy these sneakers for $280?" }]] },
  { title: "CFO", buttons: [["Scan", "C", "cfo-scan"]] },
  {
    title: "Group",
    buttons: [
      ["Post Penny claim", "P", "say", { thread: "group", text: "Will Penny spend $80 on DoorDash today?" }],
      ["Penny DoorDash $38", "4", "friend-swipe", { who: "Penny", merchant: "DoorDash", amount: 38 }],
      ["Penny DoorDash $52", "5", "friend-swipe", { who: "Penny", merchant: "DoorDash", amount: 52 }],
    ],
  },
  { title: "Clock", buttons: [["Midnight", "N", "midnight"]] },
  { title: "Chase", buttons: [["Disconnect", "X", "disconnect", { id: "chase" }]] },
  { title: "Goal", buttons: [["Fill goal", "G", "fill-goal"]] },
  { title: "Tone", seg: "tone", buttons: [["Nice", "", "tone", { tone: "nice" }], ["Savage", "", "tone", { tone: "savage" }]] },
  {
    title: "Swipe",
    more: true,
    buttons: [
      ["DoorDash $24", "2", "swipe", { merchant: "DoorDash", amount: 24, category: "food" }],
      ["Nobu $64", "3", "swipe", { merchant: "Nobu", amount: 64, category: "food" }],
    ],
    form: "swipe",
  },
  { title: "Friend swipe", more: true, buttons: [], form: "friend" },
  {
    // Simulated bank / brokerage / Venmo data landing (server/simulate.ts); Dime reacts to each.
    title: "Events",
    more: true,
    buttons: [
      ["Paycheck $5,425", "", "paycheck"],
      ["Refund", "", "refund"],
      ["Double charge", "", "duplicate"],
      ["Was this you?", "", "suspicious"],
      ["Trial converting", "", "trial"],
      ["Verizon went up", "", "bill-hike"],
      ["Low balance", "", "low-balance"],
      ["QQQ −4.2%", "", "market", { fund: "QQQ", pct: -4.2 }],
      ["VOO +2.1%", "", "market", { fund: "VOO", pct: 2.1 }],
      ["Goal milestone", "", "milestone"],
      ["Under streak", "", "streak"],
      ["Sam paid you $32", "", "venmo-paid"],
      ["Maya requests $26", "", "venmo-request"],
      ["Weekly recap", "", "weekly-recap"],
    ],
  },
  { title: "Clock", more: true, buttons: [["Morning", "M", "morning"], ["Skip day", "D", "skip-day"]] },
  { title: "Chase", more: true, buttons: [["Reconnect", "K", "connect", { id: "chase" }]] },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const button = ([label, key, action, body]: Btn) =>
  `<button type="button" data-action="${action}" data-body="${esc(JSON.stringify(body ?? {}))}"${key ? ` data-key="${key}"` : ""}>${esc(label)}${key ? ` <kbd>${key}</kbd>` : ""}</button>`;
const FORMS = {
  swipe: `<form class="dp-form" data-action="swipe">
      <input name="merchant" placeholder="Merchant" required aria-label="Merchant" />
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required aria-label="Amount" />
      <input name="category" placeholder="Category" aria-label="Category" />
      <button type="submit">Swipe</button>
    </form>`,
  friend: `<form class="dp-form" data-action="friend-swipe">
      <select name="who" aria-label="Who"><option>Penny</option><option>Maya</option><option>Sam</option></select>
      <input name="merchant" placeholder="Merchant" required aria-label="Merchant" />
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required aria-label="Amount" />
      <button type="submit">Friend swipe</button>
    </form>`,
};

const section = (s: Section) => `<section${s.seg ? ` class="seg" data-seg="${s.seg}"` : ""}><h2>${s.title}</h2>
            ${s.buttons.length ? `<div class="dp-row">${s.buttons.map(button).join("")}</div>` : ""}
            ${s.form ? FORMS[s.form] : ""}<p class="dp-err" aria-live="polite"></p></section>`;

const clock = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const hms = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const demo: Screen = (main, _session, current) => {
  main.className = "dp";
  main.innerHTML = `
    <header class="dp-head"><h1>Demo controls</h1><p class="dp-clock">—</p>
      <section class="dp-reset"><button type="button" class="danger" data-action="reset" data-key="R">Reset <kbd>R</kbd></button><p class="dp-err" aria-live="polite"></p></section></header>
    <div class="dp-cols">
      <div class="dp-controls">
        ${SECTIONS.filter((s) => !s.more).map(section).join("")}
        <details class="dp-more"><summary>More controls</summary>${SECTIONS.filter((s) => s.more).map(section).join("")}</details>
      </div>
      <aside class="dp-state">
        <dl class="dp-kv"></dl>
        <h2>Log</h2>
        <ol class="dp-log"></ol>
      </aside>
    </div>`;

  const flash = (b: HTMLElement, ok: boolean) => {
    b.classList.remove("ok", "err");
    void b.offsetWidth; // restart the flash on a repeat press
    b.classList.add(ok ? "ok" : "err");
    setTimeout(() => b.classList.remove("ok", "err"), 600);
  };
  const fire = async (b: HTMLElement, action: string, body: object) => {
    const err = b.closest("section")!.querySelector<HTMLElement>(".dp-err")!;
    try {
      await api("POST", `/demo/${action}`, body);
      err.textContent = "";
      flash(b, true);
    } catch (e) {
      err.textContent = `${action}: ${(e as Error).message === "unknown" ? "server didn't answer" : (e as Error).message}`;
      flash(b, false);
    }
    void refresh();
  };

  // Reset needs a second press within 1.5s.
  let armed = 0;
  const press = (b: HTMLButtonElement) => {
    if (b.dataset.action === "reset") {
      if (Date.now() - armed > 1500) {
        armed = Date.now();
        b.firstChild!.textContent = "Press again to reset ";
        setTimeout(() => Date.now() - armed >= 1500 && (b.firstChild!.textContent = "Reset "), 1500);
        return;
      }
      armed = 0;
      b.firstChild!.textContent = "Reset ";
    }
    void fire(b, b.dataset.action!, JSON.parse(b.dataset.body ?? "{}"));
  };
  for (const b of main.querySelectorAll<HTMLButtonElement>("button[data-action]")) b.onclick = () => press(b);
  for (const f of main.querySelectorAll<HTMLFormElement>(".dp-form"))
    f.onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      void fire(f.querySelector("button")!, f.dataset.action!, { ...body, amount: Number(body.amount) });
    };

  const keys = new Map([...main.querySelectorAll<HTMLButtonElement>("button[data-key]")].map((b) => [b.dataset.key!.toLowerCase(), b]));
  const onKey = (e: KeyboardEvent) => {
    if (!main.isConnected) return removeEventListener("keydown", onKey);
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    const b = k === "t" ? main.querySelector<HTMLButtonElement>('[data-seg="tone"] button:not(.on)') : keys.get(k);
    if (!b) return;
    e.preventDefault();
    press(b);
  };
  addEventListener("keydown", onKey);
  // T flips the tone; show it on the tone row.
  main.querySelector('[data-seg="tone"] h2')!.insertAdjacentHTML("beforeend", " <kbd>T</kbd>");

  const kv = main.querySelector<HTMLElement>(".dp-kv")!;
  const log = main.querySelector<HTMLElement>(".dp-log")!;
  const refresh = async () => {
    const s = await api<DemoState>("GET", "/demo/state");
    main.querySelector(".dp-clock")!.textContent = clock.format(new Date(s.now)).replace(/,(?= \d+:)/, " ·");
    const pending = [
      s.typing.dime && "Dime typing",
      s.typing.group && "Group typing",
      s.pendingInvest && `${usd(s.pendingInvest)} waiting for a fund`,
    ].filter(Boolean);
    const rows: [string, string][] = [
      ["Today", usd(s.today)],
      ["Goal", `${s.goal.pct}% · ${usd(s.goal.saved)} of ${usd(s.goal.price)}`],
      ["Fund", s.fund ?? "Not picked"],
      ["Blackjack next", s.force ?? "fair"],
      ["Tone", s.tone],
      ["Chase", s.chase ? "Connected" : "Disconnected"],
      ["Pending", pending.join(", ") || "Nothing"],
    ];
    kv.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    log.innerHTML = s.log
      .slice()
      .reverse()
      .map((l) => `<li${l.error ? ' class="err"' : ""}><time>${hms.format(new Date(l.at))}</time><span>${esc(l.text)}</span></li>`)
      .join("");
    for (const b of main.querySelectorAll<HTMLButtonElement>('[data-seg="force"] button'))
      b.classList.toggle("on", JSON.parse(b.dataset.body!).result === (s.force ?? "fair"));
    for (const b of main.querySelectorAll<HTMLButtonElement>('[data-seg="tone"] button'))
      b.classList.toggle("on", JSON.parse(b.dataset.body!).tone === s.tone);
    main.classList.remove("down");
  };
  const tick = async () => {
    while (current() && main.isConnected) {
      await refresh().catch(() => main.classList.add("down"));
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  void tick();
};
export default demo;
