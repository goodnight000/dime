// The `today` card (DESIGN.md §3.4): today's number, the money weather, the bills behind it. The
// latest card is live: each purchase bumps its version and the hero rolls. The glyph acts out its
// weather once, after the card lands; loaded from history, everything is still.
import "./today.css";
import type { Renderer } from "./index.ts";
import { later, arrival } from "../motion.ts";
import { roll, usd } from "../num.ts";

type Weather = "sunny" | "cloudy" | "storm";
type State = { date: string; amount: number; weather: Weather; bills: { merchant: string; amount: number; at: string }[] };

const CLOUD = "M7 19h9.5a4.5 4.5 0 0 0 .6-8.96A5.5 5.5 0 0 0 6.6 11.1 4 4 0 0 0 7 19z";
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const p = (r: number) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  return `<path class="ray" pathLength="1" d="M${p(7)} L${p(9.5)}"/>`;
}).join("");
const GLYPH: Record<Weather, string> = {
  sunny: `<circle class="core" cx="12" cy="12" r="4"/>${RAYS}`,
  cloudy: `<circle class="core" cx="16.5" cy="6.5" r="3.5"/><path class="cloud" d="${CLOUD}"/>`,
  // The spec's bolt path is open; this is the same bolt, closed, so it can be solid.
  storm: `<path class="cloud" transform="translate(0 -2)" d="${CLOUD}"/><path class="bolt" d="M13.5 12.5 9.5 18.5h3l-1.5 4.5 5-7h-3l1.5-3.5z"/>`,
};
const WORD: Record<Weather, string> = { sunny: "Sunny", cloudy: "Cloudy", storm: "Stormy" };

const drawn = new WeakSet<HTMLElement>();
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short" });

const today: Renderer = (el, app) => {
  const s = app.state as State;
  if (drawn.has(el)) return roll(el.querySelector<HTMLElement>(".td-hero")!, usd(s.amount)); // live number
  drawn.add(el);
  el.innerHTML = `<div class="td">
    <span class="td-date"></span>
    <span class="num hero td-hero"></span>
    <span class="td-cap">to spend today</span>
    <figure class="td-wx ${s.weather}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[s.weather]}</svg><figcaption>${WORD[s.weather]}</figcaption></figure>
    <p class="td-bills"></p>
  </div>`;
  el.querySelector(".td-date")!.textContent = new Date(s.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  roll(el.querySelector<HTMLElement>(".td-hero")!, usd(s.amount));
  const bills = el.querySelector<HTMLElement>(".td-bills")!;
  if (!s.bills.length) bills.textContent = "No bills in the next 3 days.";
  s.bills.forEach((b, i) => {
    if (i) bills.append(" · ");
    const name = document.createElement("b");
    name.textContent = b.merchant;
    bills.append(name, ` ${usd(b.amount)} ${weekday(b.at)}`);
  });
  const wait = arrival(el);
  if (!wait) return;
  const wx = el.querySelector<HTMLElement>(".td-wx")!;
  wx.classList.add("pre");
  void later(wait + 80).then(() => wx.classList.replace("pre", "act"));
};

export default today;
