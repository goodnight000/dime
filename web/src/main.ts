import "./theme.css";
import { api, type Session } from "./api.ts";
import chat from "./chat.ts";
import dashboard, { prime } from "./dashboard.ts";
import accounts from "./accounts.ts";
import settings from "./settings.ts";
import demo from "./demo.ts";
import { hydrateIcons } from "./icons.ts";
import { face } from "./people.ts";
import { latestOnly } from "./latest.ts";
import { listMessages, type Thread } from "./api.ts";
import { roll, usd } from "./num.ts";
import { quiet } from "./motion.ts";

export type Screen = (
  main: HTMLElement,
  session: Session,
  current: () => boolean,
) => void | Promise<void>;
const screens: Record<string, Screen> = {
  "/": chat("dime"),
  "/group": chat("group"),
  "/dashboard": dashboard,
  "/accounts": accounts,
  "/settings": settings,
  "/demo": demo,
};
let main = document.querySelector("main")!;
const side = document.querySelector<HTMLElement>(".side")!;
const links = [...side.querySelectorAll("nav a")];
const beginNavigation = latestOnly();
hydrateIcons(side);
side.querySelector(".faces")!.innerHTML = ["Penny", "Maya", "Sam"].map((n) => face(n)).join("");

export function go(path: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", path);
  void render();
}

/** The demo control panel has the whole window: it is Charles's, not part of the app. */
const bare = (path: string) => path === "/demo";

let session: Promise<Session> | undefined;
async function render() {
  const current = beginNavigation();
  const path = location.pathname;
  if (!screens[path]) return go("/", true);
  document.body.classList.toggle("out", bare(path));
  for (const a of links) a.toggleAttribute("aria-current", a.getAttribute("href") === path);
  side.querySelector<HTMLElement>(`a[href="${path}"] .unread`)?.toggleAttribute("hidden", true); // opened: read
  // Clear the old host before replacing it so its polling loops see their nodes disappear.
  main.replaceChildren();
  const host = document.createElement("main");
  main.replaceWith(host);
  main = host;
  try {
    // Fetched once: the session never changes in the demo, so later screens render with no
    // round trip and no "Loading…" between them. A failure clears it so Retry asks again.
    session ??= api<Session>("GET", "/session").catch((e) => ((session = undefined), Promise.reject(e)));
    const s = await session;
    if (!current()) return;
    host.replaceChildren();
    side.querySelector(".agent-name")!.textContent = s.agent.name;
    await screens[path](host, s, current);
  } catch {
    if (!current()) return;
    host.innerHTML = `<p class="note" role="status">Something went wrong.</p><button class="link" type="button">Retry</button>`;
    host.querySelector("button")!.onclick = () => void render();
  }
}

side.addEventListener("click", (e) => {
  const a = (e.target as Element).closest("a");
  if (a) (e.preventDefault(), go(a.getAttribute("href")!));
});
addEventListener("popstate", render);
void render();

// The sidebar's live bits (DESIGN.md §8, §4): today's number under Dime, the one number visible from
// every screen (rolls on change), and a dot on a conversation that got a message while you were away.
const leftNum = side.querySelector<HTMLElement>(".left .num")!;
const seen: Partial<Record<Thread, string>> = {};
async function sidebar() {
  for (;;) {
    try {
      if (document.body.classList.contains("out")) throw 0; // the demo panel has no sidebar
      const s = await api<{ today: number }>("GET", "/summary");
      prime(s);
      const text = usd(s.today);
      if (leftNum.dataset.v !== undefined && leftNum.dataset.v !== text) {
        // The card that moved the money resolves first, then the number rolls (one motion at a time):
        // wait out a chat poll so the card has its new version, then for its sequence to finish.
        await new Promise((r) => setTimeout(r, 1200));
        await quiet();
      }
      roll(leftNum, text);
      const phone = document.querySelector<HTMLElement>("main .contact .left .num"); // the phone's copy
      if (phone) roll(phone, text);
      for (const t of ["dime", "group"] as Thread[]) {
        const snap = await listMessages(t);
        const last = snap.messages.at(-1);
        const dot = side.querySelector<HTMLElement>(`a[data-thread="${t}"] .unread`)!;
        const here = location.pathname === (t === "dime" ? "/" : "/group");
        // Only a fresh message counts (a reset's seeded history is old), and only while you're elsewhere.
        const fresh = last && last.direction === "out" && +new Date(snap.now) - +new Date(last.created_at) < 120_000;
        if (here || !fresh) seen[t] = last?.id;
        dot.hidden = here || !fresh || seen[t] === last?.id;
      }
    } catch {
      // the server restarts under bun --watch; try again next tick
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
void sidebar();
