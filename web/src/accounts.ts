import "./accounts.css";
import { api } from "./api.ts";
import { icon } from "./icons.ts";
import { brand } from "./brands.ts";
import { flow } from "./num.ts";
import { T, reduced, later, swap } from "./motion.ts";
import type { Screen } from "./main.ts";

// Accounts (DESIGN.md §6): services left (one .rows container), Recent on the right. Connecting is
// in place: the pill becomes "Connecting", a ring draws round the glyph in three ticks while the
// subtitle narrates, the ring turns green, a check lands, the row reads Connected. Then Chase's
// transactions enter the rail. State is the server's (server/accounts.ts); polled every 2s.

type Account = { id: string; name: string; kind: string; glyph: string; connected: boolean; subtitle: string };
type Txn = { id: string; at: string; merchant: string; amount: number; kind?: string };
type Data = { accounts: Account[]; recent: Txn[] };

const C = 2 * Math.PI * 18; // the ring's circumference (r = 18 in a 40-unit box)
const TICK = 800;
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
/** "Checking ••4821 · Savings ••0937" wraps only before a "·", which travels with what follows. */
const keep = (t: string) => t.split(" · ").map((x) => x.replace(/ /g, "\u00a0")).join(" ·\u00a0");
const RING = `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" /></svg>`;
const BADGE = `<span class="badge" aria-hidden="true">${icon("check")}</span>`;

/** Swaps a two-line .slot to `text`: writes it into the hidden line, then shows that line. */
function say(slot: HTMLElement, text: string, danger = false) {
  const on = slot.querySelector(".on");
  if (on?.textContent === text && on.classList.contains("danger") === danger) return;
  const next = [...slot.children].find((c) => c !== on)!;
  next.textContent = text;
  next.classList.toggle("danger", danger);
  swap(slot, next);
}

const accounts: Screen = (main, _session, current) => {
  main.classList.add("accounts", "wide");
  main.innerHTML = `
    <header class="page-head"><h1>Accounts</h1></header>
    <div class="acct-split">
      <section aria-labelledby="svc-h"><h2 id="svc-h">Connections</h2><ul class="rows svcs"></ul></section>
      <aside class="recent" aria-labelledby="recent-h">
        <h2 id="recent-h">Recent</h2>
        <ul class="rows txns" aria-live="polite"></ul>
      </aside>
    </div>`;
  const svcs = main.querySelector<HTMLElement>(".svcs")!;
  const txns = main.querySelector<HTMLElement>(".txns")!;
  const alive = () => current() && main.isConnected;
  const busy = new Set<string>(); // rows mid-connect: the poll leaves them alone
  const rows = new Map<string, HTMLElement>();
  let shown: string[] | null = null; // txn ids in the rail, null before the first draw
  let reveal = false; // the next rail draw is Chase arriving: rows enter in turn

  function row(a: Account): HTMLElement {
    const li = document.createElement("li");
    li.innerHTML = `<div class="row svc">
      <span class="svc-gl">${brand(a.name)}${RING}${BADGE}</span>
      <span class="t"><b></b><span class="slot sub"><small></small><small></small></span></span>
      <span class="slot act">
        <span class="go"><button class="pill sm" type="button">Connect</button></span>
        <span class="word busyw">Connecting</span>
        <span class="word ok"><i class="dot live"></i>Connected</span>
        <span class="word err"><button class="link" type="button">Try again</button></span>
      </span>
    </div>`;
    li.dataset.id = a.id; // Chase keeps the one solid Connect: it's the demo's
    li.querySelector("b")!.textContent = a.name;
    for (const b of li.querySelectorAll("button")) b.onclick = () => void connect(a, li);
    li.querySelector<HTMLButtonElement>(".pill")!.ariaLabel = `Connect ${a.name}`;
    return li;
  }

  /** Draws a row's resting state, still (first paint, or a change made elsewhere). */
  function rest(li: HTMLElement, a: Account) {
    const svc = li.querySelector<HTMLElement>(".svc")!;
    svc.classList.add("instant");
    svc.classList.toggle("connected", a.connected);
    svc.classList.remove("drawing", "green", "err");
    const sub = li.querySelector<HTMLElement>(".sub")!;
    const lines = sub.children;
    lines[0].textContent = keep(a.subtitle);
    lines[0].classList.remove("danger");
    swap(sub, lines[0]);
    const act = li.querySelector<HTMLElement>(".act")!;
    swap(act, act.querySelector(a.connected ? ".ok" : ".go")!);
    void svc.offsetWidth;
    svc.classList.remove("instant");
    li.dataset.v = JSON.stringify(a);
  }

  async function connect(a: Account, li: HTMLElement) {
    if (busy.has(a.id)) return;
    busy.add(a.id);
    const svc = li.querySelector<HTMLElement>(".svc")!;
    const sub = li.querySelector<HTMLElement>(".sub")!;
    const act = li.querySelector<HTMLElement>(".act")!;
    const ring = li.querySelector<SVGCircleElement>(".ring circle")!;
    const reply = api<{ account: Account }>("POST", `/accounts/${encodeURIComponent(a.id)}/connect`).then(
      () => true,
      () => false,
    );
    const brand = a.name.split(" ")[0];
    swap(act, act.querySelector(".busyw")!);
    act.setAttribute("aria-busy", "true");
    svc.classList.remove("err");
    if (!reduced()) {
      // The ring: full gap → a third drawn → two thirds → closed, one tick every 800ms.
      svc.classList.add("instant");
      ring.style.strokeDashoffset = String(C);
      svc.classList.add("drawing");
      void svc.offsetWidth;
      svc.classList.remove("instant");
      const steps = [`Opening ${brand}`, "Verifying it's you", "Reading 90 days"];
      for (let i = 0; i < 3; i++) {
        say(sub, steps[i]);
        ring.style.strokeDashoffset = String(C * (1 - (i + 1) / 3));
        await later(TICK);
        if (!alive()) return;
      }
    }
    const ok = await reply;
    act.removeAttribute("aria-busy");
    if (!alive()) return void busy.delete(a.id);
    if (!ok) {
      busy.delete(a.id);
      svc.classList.remove("drawing");
      svc.classList.add("err");
      say(sub, `Couldn't reach ${brand}.`, true);
      swap(act, act.querySelector(".err")!);
      return;
    }
    // The row stays busy until the sequence ends, so a poll landing mid-way can't snap it to rest.
    const data = await load();
    const fresh = data?.accounts.find((x) => x.id === a.id) ?? { ...a, connected: true };
    li.dataset.v = JSON.stringify(fresh);
    // Ring turns green, then the check lands, then the ring fades, then the row reads Connected.
    svc.classList.add("green");
    await later(T.quick);
    svc.classList.add("connected");
    await later(T.spring);
    svc.classList.remove("drawing");
    await later(T.quick);
    svc.classList.remove("green");
    ring.style.strokeDashoffset = "";
    say(sub, keep(fresh.subtitle));
    swap(act, act.querySelector(".ok")!);
    busy.delete(a.id);
    if (a.id === "chase" && data) {
      await later(T.quick + T.press);
      if (!alive()) return;
      reveal = true;
      drawRecent(data);
    }
  }

  function drawRecent(d: Data) {
    const chase = d.accounts.find((a) => a.id === "chase");
    if (busy.has("chase")) return; // its rows enter when the connect finishes
    const ids = d.recent.map((t) => t.id);
    if (shown && ids.join() === shown.join() && txns.querySelector(".empty") === null === Boolean(chase?.connected)) return;
    const before = new Set(shown ?? []);
    const animate = shown !== null && !reduced();
    shown = ids;
    if (!chase?.connected || !d.recent.length) {
      txns.innerHTML = `<li class="empty">Connect Chase to see transactions.</li>`;
      return;
    }
    const cents = d.recent.some((t) => !Number.isInteger(t.amount));
    txns.replaceChildren(
      ...d.recent.map((t, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<div class="row tx">${brand(t.merchant)}<span class="t"><b></b><small></small></span><span class="v"></span></div>`;
        li.querySelector("b")!.textContent = t.merchant;
        li.querySelector("small")!.textContent = short.format(new Date(t.at));
        const v = li.querySelector<HTMLElement>(".v")!;
        const f = flow(t.amount, t.kind, cents);
        v.textContent = f.text;
        v.setAttribute("aria-label", f.label);
        if (f.cls) v.classList.add(f.cls);
        if (animate && (reveal || !before.has(t.id))) {
          li.classList.add("in");
          li.style.animationDelay = `${reveal ? i * 40 : 0}ms`;
        }
        return li;
      }),
    );
    reveal = false;
  }

  async function load(): Promise<Data | null> {
    try {
      const d = await api<Data>("GET", "/accounts");
      if (!alive()) return null;
      for (const a of d.accounts) {
        let li = rows.get(a.id);
        if (!li) {
          li = row(a);
          rows.set(a.id, li);
          svcs.append(li);
          rest(li, a);
        } else if (!busy.has(a.id) && li.dataset.v !== JSON.stringify(a)) {
          const was = JSON.parse(li.dataset.v!) as Account;
          // Only the subtitle changed (the ledger total moved): swap the words, nothing else.
          if (was.connected === a.connected) {
            say(li.querySelector<HTMLElement>(".sub")!, keep(a.subtitle));
            li.dataset.v = JSON.stringify(a);
          } else rest(li, a);
        }
      }
      drawRecent(d);
      return d;
    } catch {
      return null;
    }
  }

  const tick = async () => {
    if (!alive()) return;
    await load();
    if (alive()) setTimeout(tick, 2000);
  };
  void tick();
};
export default accounts;
