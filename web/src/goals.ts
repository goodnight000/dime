import "./goals.css";
import { api, ApiError } from "./api.ts";
import { usd } from "./num.ts";
import { icon } from "./icons.ts";
import { ring, level } from "./ring.ts";
import { mountGoals } from "./settings.ts";

// Settings → Goals: the priority list, one dividered row per goal. Priority number, up/down, the
// mini ring with its emoji editable in the middle, name and price inline-editable, what it saved and
// when it lands, remove. An add row at the end. Every edit saves at once (/api/goals, server/goals.ts)
// and the list polls every 2s, so a goal Dime adds by text shows up here.

type Goal = {
  id: string; name: string; emoji: string; store?: string; price: number; saved: number; pct: number;
  status: "active" | "queued" | "ready" | "ordered" | "done"; eta_date: string;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const local = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// Saved and status as two spans: one line with a " · " on desktop, two lines on a phone (goals.css).
const meta = (g: Goal) =>
  `<span>${usd(g.saved)} saved</span><span class="gr-st">${
    { active: `Saving now, by ${short.format(local(g.eta_date))}`, queued: `In line, by ${short.format(local(g.eta_date))}`, ready: "Ready to order", ordered: "Ordered", done: "Done" }[g.status]
  }</span>`;

/** A field's text as the row shows it: the price as money. */
const shown = (g: Goal, f: "name" | "emoji" | "price") => (f === "price" ? usd(g.price) : g[f]);

function row(g: Goal, i: number, n: number) {
  const fixed = g.status === "ordered";
  return `<li class="gr${g.status === "active" ? " on" : ""}${fixed ? " past" : ""}" data-id="${g.id}">
    <span class="gr-move">
      <button type="button" class="ib" data-do="up" aria-label="Move ${esc(g.name)} up"${i === 0 ? " disabled" : ""}>${icon("arrow-up")}</button>
      <button type="button" class="ib" data-do="down" aria-label="Move ${esc(g.name)} down"${i === n - 1 ? " disabled" : ""}>${icon("arrow-down")}</button>
    </span>
    <span class="gr-n">${i + 1}</span>
    ${ring(g, g.saved <= 0 ? 0 : g.pct / 100, `<input class="gr-emo" data-f="emoji" value="${esc(g.emoji)}" maxlength="4" aria-label="${esc(g.name)} emoji"${fixed ? " disabled" : ""}>`)}
    <span class="gr-main">
      <input class="gr-name" data-f="name" value="${esc(g.name)}" maxlength="40" autocomplete="off" aria-label="Goal name"${fixed ? " disabled" : ""}>
      <small class="gr-meta">${meta(g)}</small>
    </span>
    <label class="gr-price"><input data-f="price" value="${usd(g.price)}" inputmode="numeric" autocomplete="off" aria-label="${esc(g.name)} price"${fixed ? " disabled" : ""}></label>
    <button type="button" class="ib" data-do="remove" aria-label="Remove ${esc(g.name)}">${icon("trash")}</button>
  </li>`;
}

const ADD = `<li class="gr add">
    <span class="gr-move"></span>
    <span class="gr-n">${icon("plus")}</span>
    ${ring(null, 0, `<input class="gr-emo" data-new="emoji" placeholder="🎯" maxlength="4" aria-label="New goal emoji">`)}
    <span class="gr-main"><input class="gr-name" data-new="name" placeholder="Add a goal" maxlength="40" autocomplete="off" aria-label="New goal name"></span>
    <label class="gr-price"><input data-new="price" placeholder="$ Price" inputmode="numeric" autocomplete="off" aria-label="New goal price"></label>
    <button type="button" class="ib add-go" data-do="add" aria-label="Add goal">${icon("check")}</button>
  </li>`;

mountGoals((section, alive) => {
  section.insertAdjacentHTML("beforeend", `<ul class="rows goal-list"></ul><p class="g-note" aria-live="polite"></p>`);
  const list = section.querySelector<HTMLElement>(".goal-list")!;
  const note = section.querySelector<HTMLElement>(".g-note")!;
  let goals: Goal[] = [];
  let key = "";
  let busy = false;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  const say = (text: string, err = false) => {
    clearTimeout(noteTimer);
    note.textContent = text;
    note.classList.toggle("err", err);
    if (!err) noteTimer = setTimeout(() => (note.textContent = ""), 1600);
  };

  /** Redraws from the server's list unless the user is mid-edit in a row. Rows keep their DOM when
   *  only numbers moved, so a ring's arc animates instead of the row being rebuilt. */
  function draw(next: Goal[], force = false) {
    goals = next;
    if (!force && list.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === "INPUT") return;
    const shape = JSON.stringify(next.map((g) => [g.id, g.status === "ordered"]));
    if (shape !== key || force) {
      key = shape;
      list.innerHTML = next.map((g, i) => row(g, i, next.length)).join("") + ADD;
      return;
    }
    next.forEach((g) => {
      const li = list.querySelector<HTMLElement>(`[data-id="${g.id}"]`)!;
      level(li.querySelector(".ring")!, g.saved <= 0 ? 0 : g.pct / 100);
      li.classList.toggle("on", g.status === "active");
      li.querySelector(".gr-meta")!.innerHTML = meta(g);
      for (const f of ["name", "emoji", "price"] as const) li.querySelector<HTMLInputElement>(`[data-f="${f}"]`)!.value = shown(g, f);
    });
  }

  async function send(method: string, path: string, body?: unknown, ok = "Saved") {
    busy = true;
    try {
      const r = await api<{ goals: Goal[] }>(method, path, body);
      if (!alive()) return;
      draw(r.goals, true);
      say(ok);
      return true;
    } catch (e) {
      if (!alive()) return;
      say(e instanceof ApiError && e.status === 400 ? e.code.replace(/\.?$/, ".") : "Didn't save. Try again.", true);
      draw(goals, true); // put the row back to what the server has
      return false;
    } finally {
      busy = false;
    }
  }

  list.addEventListener("click", async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-do]");
    if (!b || busy) return;
    const id = b.closest<HTMLElement>("[data-id]")?.dataset.id;
    const i = goals.findIndex((g) => g.id === id);
    if (b.dataset.do === "remove") return void send("DELETE", `/goals/${id}`, undefined, "Removed");
    if (b.dataset.do === "up" || b.dataset.do === "down") {
      const order = goals.map((g) => g.id);
      const j = i + (b.dataset.do === "up" ? -1 : 1);
      [order[i], order[j]] = [order[j], order[i]];
      await send("PUT", "/goals", { order }, "Reordered");
      list.querySelector<HTMLButtonElement>(`[data-id="${id}"] [data-do="${b.dataset.do}"]:not(:disabled)`)?.focus();
      return;
    }
    if (b.dataset.do === "add") void add();
  });

  async function add() {
    const v = (f: string) => list.querySelector<HTMLInputElement>(`[data-new="${f}"]`)!.value.trim();
    const name = v("name");
    if (!name) return list.querySelector<HTMLInputElement>('[data-new="name"]')!.focus();
    const price = Number(v("price").replace(/[$,\s]/g, ""));
    if (await send("POST", "/goals", { name, price, emoji: v("emoji") || "🎯" }, "Added")) list.querySelector<HTMLInputElement>('[data-new="name"]')?.focus();
  }

  // Inline fields commit on blur or Enter; Escape puts the saved value back.
  list.addEventListener("keydown", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.tagName !== "INPUT") return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.dataset.new) return void add();
      input.blur();
    }
    if (e.key === "Escape" && input.dataset.f) {
      const g = goals.find((x) => x.id === input.closest<HTMLElement>("[data-id]")!.dataset.id);
      if (g) input.value = shown(g, input.dataset.f as "name");
      input.blur();
    }
  });
  list.addEventListener("focusout", (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.dataset.f;
    if (!f) return;
    const id = input.closest<HTMLElement>("[data-id]")!.dataset.id!;
    const g = goals.find((x) => x.id === id);
    const v = input.value.trim();
    if (!g || v === shown(g, f as "name")) return;
    void send("PATCH", `/goals/${id}`, { [f]: f === "price" ? Number(v.replace(/[$,\s]/g, "")) : v });
  });

  const tick = async () => {
    if (!alive()) return;
    try {
      if (!busy) draw((await api<{ goals: Goal[] }>("GET", "/goals")).goals);
    } catch {
      // the server restarts under bun --watch; the next tick catches up
    }
    if (alive()) setTimeout(tick, 2000);
  };
  void tick();
});
