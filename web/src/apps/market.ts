// The `market` card (DESIGN.md §3.6): a yes/no claim, both pots, a split bar, who's on each side,
// and one bottom slot that swaps: chips + Yes/No → your bet → the result with payouts.
// Diffs against its own last state: a new bettor's face lands, then the bar retargets and the pots
// roll (one motion); a result swaps the slot, then the losing side fades.
import "./market.css";
import type { Renderer } from "./index.ts";
import { T, arrival, hold, later, reduced, swap } from "../motion.ts";
import { roll, usd, signed } from "../num.ts";
import { face } from "../people.ts";

type Side = "yes" | "no";
type Bet = { who: string; side: Side; amount: number };
type Payout = Bet & { net: number };
type Market = {
  question: string; subject: string; merchant: string; threshold: number; from: string; to: string;
  optedIn: boolean; bets: Bet[]; status: "open" | Side; spent: number;
  settledAt?: string; payouts?: Payout[]; estimate?: number;
};

const STAKES = [5, 10, 20];
const MAX_FACES = 4;
const seen = new WeakMap<HTMLElement, Market>();
// One sequence at a time per card: a version that lands mid-sequence waits its turn.
const queue = new WeakMap<HTMLElement, Promise<void>>();
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const cap = (s: Side) => (s === "yes" ? "Yes" : "No");
const DOTS = `<span class="busy-dots"><i></i><i></i><i></i></span>`;

const market: Renderer = (el, app, act) => {
  const s = app.state as Market;
  const prev = seen.get(el);
  seen.set(el, structuredClone(s));
  if (!prev && s.status !== "open" && el.classList.contains("new") && !reduced()) {
    // The settled card re-posted at the bottom: it lands as it last stood open, then settles in
    // view (slot swap → losing side fades), like a dealt blackjack card plays on arrival.
    const open: Market = { ...structuredClone(s), status: "open", payouts: undefined, settledAt: undefined };
    draw(el, open, act);
    const run = async () => (await later(arrival(el) + 80), await diff(el, open, s));
    return void queue.set(el, hold(run()));
  }
  if (!prev) return draw(el, s, act);
  const run = () => diff(el, prev, s);
  queue.set(el, hold((queue.get(el) ?? Promise.resolve()).then(run, run)));
};
export default market;

/** First paint: the final state, still. */
function draw(el: HTMLElement, s: Market, act: (a: string, b?: object) => Promise<void>) {
  el.innerHTML = `<div class="mk">
    <div class="mk-top">
      <p class="mk-q"></p>
      <p class="mk-meta slot"><span></span><span></span><span></span></p>
      <div class="mk-pots">
        <span class="mk-pot"><span class="mk-l">Yes</span><span class="num"></span></span>
        <span class="mk-pot no"><span class="mk-l">No</span><span class="num"></span></span>
      </div>
      <div class="split" role="img"><i class="yes"></i><i class="no"></i></div>
      <div class="mk-stacks"><span class="mk-stack" data-side="yes"></span><span class="mk-stack" data-side="no"></span></div>
    </div>
    <div class="mk-bottom slot">
      <div class="mk-bet">
        <div class="mk-chips" role="radiogroup" aria-label="Stake">${STAKES.map(
          (n) => `<button type="button" role="radio" data-amt="${n}" aria-checked="${n === 10}">${usd(n)}</button>`,
        ).join("")}</div>
        <div class="answers">${(["yes", "no"] as Side[]).map(
          (side) => `<button type="button" class="${side}" data-side="${side}"><span class="slot"><span class="on"></span><span>${DOTS}</span></span></button>`,
        ).join("")}</div>
      </div>
      <div class="mk-placed"><div class="mk-pl"><b></b><span></span></div><div class="answers mk-chosen" aria-hidden="true"><span class="yes"></span><span class="no"></span></div></div>
      <div class="mk-done"><b></b><ol></ol></div>
      <div class="mk-fail"><span>Didn't go through.</span> <button type="button" class="link">Retry</button></div>
    </div>
  </div>`;
  el.querySelector(".mk-q")!.textContent = s.question;
  const [waiting, closes] = el.querySelectorAll(".mk-meta > span"); // the third, settled, fills in meta()
  waiting.textContent = `Waiting on ${s.subject} to opt in`;
  closes.textContent = `Closes ${clock.format(new Date(new Date(s.to).getTime() - 60_000))} · settled from ${s.subject}'s card`;

  const chips = [...el.querySelectorAll<HTMLButtonElement>(".mk-chips button")];
  const answers = [...el.querySelectorAll<HTMLButtonElement>(".answers button")];
  let stake = 10;
  const label = () => answers.forEach((b) => (b.querySelector(".slot > span")!.textContent = `${cap(b.dataset.side as Side)} · ${usd(stake)}`));
  label();
  for (const c of chips)
    c.onclick = () => {
      stake = Number(c.dataset.amt);
      chips.forEach((x) => x.setAttribute("aria-checked", String(x === c)));
      label();
    };

  const bottom = el.querySelector<HTMLElement>(".mk-bottom")!;
  const bet = bottom.querySelector<HTMLElement>(".mk-bet")!;
  const fail = bottom.querySelector<HTMLElement>(".mk-fail")!;
  let last: { side: Side; amount: number } | null = null;
  const place = async (side: Side, amount: number, btn: HTMLButtonElement) => {
    if (bet.ariaBusy === "true") return;
    last = { side, amount };
    bet.ariaBusy = "true";
    const inner = btn.querySelector<HTMLElement>(".slot")!;
    const busy = setTimeout(() => swap(inner, inner.lastElementChild!), 400);
    try {
      await act("bet", { side, amount });
    } catch {
      swap(bottom, fail);
    } finally {
      clearTimeout(busy);
      bet.ariaBusy = null;
      swap(inner, inner.firstElementChild!);
    }
  };
  for (const b of answers) b.onclick = () => void place(b.dataset.side as Side, stake, b);
  fail.querySelector("button")!.onclick = () => {
    swap(bottom, bet);
    if (last) void place(last.side, last.amount, answers.find((b) => b.dataset.side === last!.side)!);
  };

  setOdds(el, pots(s.bets));
  for (const b of s.bets) stack(el, b, false);
  meta(el, s);
  outcome(el, s);
  if (s.status !== "open") el.querySelector(".split")!.classList.add(`resolved-${s.status}`);
}

/** A change seen in this session, in sequence: slot → faces land → bar + pots → losing side fades. */
async function diff(el: HTMLElement, prev: Market, s: Market) {
  // A friend's bet arrives with their bubble in the same poll: let the bubble land, then the card moves.
  await new Promise(requestAnimationFrame); // bubbles after the card are inserted after this call
  const landing = [...(el.parentElement?.querySelectorAll<HTMLElement>(":scope > li.new") ?? [])].filter((li) => li !== el);
  if (landing.length) await later(Math.max(...landing.map(arrival)));
  if (prev.optedIn !== s.optedIn) {
    meta(el, s);
    await later(T.press + T.quick); // the meta line swaps before the opt-in bet lands
  }
  const fresh = s.bets.slice(prev.bets.length);
  const mine = fresh.find((b) => b.who === "Charles");
  const settled = prev.status === "open" && s.status !== "open";
  if (mine || settled) {
    if (settled) meta(el, s); // "Closes" becomes "Settled", with the slot below: one idea
    outcome(el, s);
    await later(T.press + T.quick); // the slot swap lands first
  }
  if (fresh.length) {
    for (const b of fresh) stack(el, b, true);
    await later(T.spring + 200);
    setOdds(el, pots(s.bets));
  }
  if (!mine && !settled && s.estimate !== prev.estimate) outcome(el, s); // "Pays about" follows the pots
  if (settled) {
    if (fresh.length) await later(T.slow);
    el.querySelector(".split")!.classList.add(`resolved-${s.status}`);
  }
}

function pots(bets: Bet[]) {
  const p = { yes: 0, no: 0 };
  for (const b of bets) p[b.side] += b.amount;
  return p;
}

/** Pots roll and the bar retargets: one idea, one motion (--t-slow). */
function setOdds(el: HTMLElement, p: { yes: number; no: number }) {
  const total = p.yes + p.no;
  const split = el.querySelector<HTMLElement>(".split")!;
  split.style.setProperty("--p", String(total ? p.yes / total : 0.5));
  split.classList.toggle("mk-empty", !total); // not "empty": the thread styles .empty
  const [yes, no] = el.querySelectorAll<HTMLElement>(".mk-pot .num");
  roll(yes, usd(p.yes));
  roll(no, usd(p.no));
  split.setAttribute("aria-label", `Yes ${usd(p.yes)}, No ${usd(p.no)}`);
}

/** A bettor's face joins their side (max four, then "+n"). */
function stack(el: HTMLElement, b: Bet, pop: boolean) {
  const side = el.querySelector<HTMLElement>(`.mk-stack[data-side="${b.side}"]`)!;
  const faces = side.querySelectorAll(".av").length;
  if (faces >= MAX_FACES) {
    const more = side.querySelector(".mk-more") ?? side.appendChild(Object.assign(document.createElement("span"), { className: "mk-more" }));
    more.textContent = `+${Number(more.textContent?.slice(1) || 0) + 1}`;
    return;
  }
  side.insertAdjacentHTML("beforeend", face(b.who, pop && !reduced() ? "landing" : ""));
  side.lastElementChild!.setAttribute("title", `${b.who === "Charles" ? "You" : b.who}: ${usd(b.amount)} on ${cap(b.side)}`);
}

function meta(el: HTMLElement, s: Market) {
  const m = el.querySelector<HTMLElement>(".mk-meta")!;
  if (s.status !== "open") m.children[2].textContent = `Settled ${clock.format(new Date(s.settledAt!))} from ${s.subject}'s card`;
  swap(m, m.children[s.status !== "open" ? 2 : s.optedIn ? 1 : 0]);
  const open = s.optedIn && s.status === "open";
  for (const b of el.querySelectorAll<HTMLButtonElement>(".mk-bet button")) b.disabled = !open;
}

/** Which bottom state shows, and its words. */
function outcome(el: HTMLElement, s: Market) {
  const bottom = el.querySelector<HTMLElement>(".mk-bottom")!;
  const mine = s.bets.find((b) => b.who === "Charles");
  if (s.status !== "open") {
    const done = bottom.querySelector<HTMLElement>(".mk-done")!;
    // One line: the merchant is in the question and the time in the meta line; three payout rows need the room.
    done.querySelector("b")!.textContent =
      s.status === "yes" ? `Yes wins. ${s.subject} spent ${usd(s.spent)}.` : `No wins. ${s.subject} only spent ${usd(s.spent)}.`;
    // You first, then the biggest results; everyone shows (two to a row), so the rows add up.
    const rows = [...(s.payouts ?? [])].sort((a, b) => Number(b.who === "Charles") - Number(a.who === "Charles") || Math.abs(b.net) - Math.abs(a.net)).slice(0, 4);
    done.querySelector("ol")!.innerHTML = rows
      .map((r) => `<li>${face(r.who)}<span class="mk-name"></span><b class="${r.net > 0 ? "won" : ""}">${signed(r.net)}</b></li>`)
      .join("");
    done.querySelectorAll("ol .mk-name").forEach((n, i) => (n.textContent = rows[i].who === "Charles" ? "You" : rows[i].who));
    return swap(bottom, done);
  }
  if (mine) {
    const placed = bottom.querySelector<HTMLElement>(".mk-placed")!;
    const [head, pays] = placed.querySelector(".mk-pl")!.children;
    head.textContent = `You: ${usd(mine.amount)} on ${cap(mine.side)}`;
    pays.textContent = `Pays about ${usd(s.estimate ?? mine.amount)} if you're right.`;
    // The answer row stays where it was, your side lit and the other dimmed: the pick, locked in.
    for (const side of ["yes", "no"] as Side[]) {
      const half = placed.querySelector<HTMLElement>(`.mk-chosen .${side}`)!;
      half.textContent = side === mine.side ? `${cap(side)} · ${usd(mine.amount)}` : cap(side);
      half.classList.toggle("off", side !== mine.side);
    }
    return swap(bottom, placed);
  }
  if (!bottom.querySelector(":scope > .on")) swap(bottom, bottom.querySelector(".mk-bet")!);
}
