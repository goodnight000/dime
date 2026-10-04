// The `blackjack` card (DESIGN.md §3.1): Charles vs the CFO for the item. The server holds the deck
// and the hole card; this draws what it sends and animates only the diff against what is on the
// felt: dealt cards (from the shoe), the hole-card flip, Dime's draws, the outcome, and on a push the
// sweep and the new deal. Loaded from history (or under reduced motion) it draws the final state, still.
import "./blackjack.css";
import type { Act, Renderer } from "./index.ts";
import { T, later, arrival, hold, reduced, swap } from "../motion.ts";
import { roll, usd } from "../num.ts";

type Card = { r: string; s: "S" | "H" | "D" | "C" };
type Result = "win" | "blackjack" | "dime-bust" | "lose" | "bust";
type S = {
  item: string;
  amount: number;
  round: number;
  player: Card[];
  dealer: (Card | null)[];
  result: Result | null;
  fund: { id: string; name: string } | null;
  prev: { player: Card[]; dealer: Card[] } | null;
};
type Hand = { player: Card[]; dealer: (Card | null)[] };
type View = {
  root: HTMLElement;
  shoe: HTMLElement;
  hand: { player: HTMLElement; dealer: HTMLElement };
  total: { player: HTMLElement; dealer: HTMLElement };
  label: { player: HTMLElement; dealer: HTMLElement };
  slot: HTMLElement;
  acts: HTMLElement;
  out: HTMLElement;
  fail: HTMLElement;
  shown: Hand & { round: number; result: Result | null }; // what is on the felt right now
  queue: Promise<void>; // sequences run one after another
  running: number; // sequences queued or playing: Hit/Stand ignore clicks meanwhile
  inflight: boolean; // an action's request
  act: Act;
};

const SUIT: Record<Card["s"], string> = {
  S: "M12 2.5s-8 6.2-8 11a4 4 0 0 0 7 2.6V18l-1.5 3.5h5L13 18v-1.9a4 4 0 0 0 7-2.6c0-4.8-8-11-8-11z",
  H: "M12 21s-7.5-4.6-9.6-9.2C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.3 1.8-2.1 3.2-3.3 5.4-3.3 3.6 0 5.7 3.7 4.2 7.3C19.5 16.4 12 21 12 21z",
  D: "M12 2.5 19.5 12 12 21.5 4.5 12z",
  C: "M12 3a4 4 0 0 0-3.1 6.5A4 4 0 1 0 11 16.4V18l-1.5 3.5h5L13 18v-1.6a4 4 0 1 0 2.1-6.9A4 4 0 0 0 12 3z",
};
const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME: Record<string, string> = { A: "ace", J: "jack", Q: "queen", K: "king" };
const DEAL_GAP = 140; // between dealt cards (§1.6)
const DIME_GAP = 600; // between Dime's draws, start to start

const views = new WeakMap<HTMLElement, View>();
const svg = (s: Card["s"]) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT[s]}"/></svg>`;

/** The hand's value with aces as 11 where they fit; soft when an ace still counts 11. */
function value(cards: (Card | null)[]) {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    if (!c) continue;
    t += c.r === "A" ? 11 : Number(c.r) || 10;
    if (c.r === "A") aces++;
  }
  while (t > 21 && aces) (t -= 10), aces--;
  return { t, soft: aces > 0 };
}

function fillFace(face: HTMLElement, c: Card) {
  const court = "JQK".includes(c.r);
  face.className = `face ${c.s === "H" || c.s === "D" ? "red" : "black"}`;
  face.innerHTML = `<span class="idx"><b>${c.r}</b>${svg(c.s)}</span><span class="pip${court ? " court" : ""}">${court ? `<b>${c.r}</b>` : ""}${svg(c.s)}</span>`;
}

function cardEl(c: Card | null, i: number): HTMLElement {
  const pc = document.createElement("div");
  pc.className = c ? "pc" : "pc down";
  pc.style.setProperty("--i", String(i));
  pc.innerHTML = `<div class="pc-flip"><div class="face"></div><div class="back"></div></div>`;
  if (c) fillFace(pc.querySelector(".face")!, c);
  return pc;
}

const name = (c: Card | null) => (c ? `${RANK_NAME[c.r] ?? c.r} of ${SUIT_NAME[c.s]}` : "face-down card");

/** Totals and labels from the cards on the felt (Dime's: visible cards only). */
function totals(v: View) {
  for (const who of ["player", "dealer"] as const) {
    const cards = v.shown[who];
    const { t, soft } = value(cards);
    roll(v.total[who], cards.some(Boolean) ? String(t) : "");
    v.label[who].textContent = who === "dealer" ? "Dime" : t > 21 ? "Bust" : soft && t < 21 ? "You · soft" : "You";
    v.hand[who].setAttribute("aria-label", `${who === "dealer" ? "Dime" : "You"}: ${cards.map(name).join(", ") || "no cards"}`);
  }
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function outcome(v: View, s: S, result: Result | "push") {
  const item = title(s.item);
  const are = /[^s]s$/i.test(s.item) ? "are" : "is"; // sneakers are, a dress is
  const amt = usd(s.amount);
  const won = { win: "Won.", blackjack: "Blackjack.", "dime-bust": "Dime busts." } as Record<string, string>;
  const head = v.out.querySelector("b")!;
  const sub = v.out.querySelector(":scope > span")!; // not the amount inside the headline
  const money = (pre: string, post: string) => {
    const n = document.createElement("span");
    n.className = "tab";
    n.textContent = amt;
    head.replaceChildren(pre, n, post);
  };
  if (result === "push") {
    head.textContent = "Push. Dealing again.";
    sub.textContent = "";
  } else if (won[result]) {
    head.textContent = `${won[result]} ${item} ${are} on the house.`;
    sub.textContent = `${amt} doesn't touch today.`;
  } else if (s.fund) {
    money(`${result === "bust" ? "Bust" : "Lost"}. `, ` → ${s.fund.name}`);
    sub.textContent = s.fund.id === "CASH" ? "Saved in Cash." : `Invested in ${s.fund.id}.`;
  } else {
    money(`${result === "bust" ? "Bust" : "Lost"}. `, " is waiting for a fund.");
    sub.textContent = "Pick one below.";
  }
}

/** The final state, still: first paint, a reload, reduced motion. */
function still(v: View, s: S) {
  v.shown = { round: s.round, player: [...s.player], dealer: [...s.dealer], result: s.result };
  v.hand.player.replaceChildren(...s.player.map(cardEl));
  v.hand.dealer.replaceChildren(...s.dealer.map(cardEl));
  totals(v);
  v.acts.classList.remove("wait");
  if (s.result) outcome(v, s, s.result);
  swap(v.slot, s.result ? v.out : v.acts);
  lose(v, s.result);
}

const WON: (Result | null)[] = ["win", "blackjack", "dime-bust"];
function lose(v: View, result: Result | null) {
  v.hand.dealer.classList.toggle("lost", WON.includes(result));
  v.hand.player.classList.toggle("lost", !!result && !WON.includes(result));
}

/** One card from the shoe into its slot; resolves when it lands, with the total updated (unless
 *  `tally` is false: the opening deal shows its totals once, after all four cards land). */
async function deal(v: View, who: "player" | "dealer", c: Card | null, i: number, delay = 0, tally = true) {
  const pc = cardEl(c, i);
  v.hand[who].append(pc);
  // Travel starts at the shoe's centre: the offset from this card's own resting centre.
  const shoe = v.shoe.getBoundingClientRect();
  const at = pc.getBoundingClientRect();
  pc.style.setProperty("--dx", `${shoe.left + shoe.width / 2 - (at.left + at.width / 2)}px`);
  pc.style.setProperty("--dy", `${shoe.top + shoe.height / 2 - (at.top + at.height / 2)}px`);
  pc.style.setProperty("--delay", `${delay}ms`);
  pc.classList.add("dealt");
  await later(delay + T.slow);
  pc.classList.remove("dealt"); // landed: nothing about it moves again but the flip, dim, sweep
  v.shown[who][i] = c;
  if (tally) totals(v);
}

/** Animates the felt from what it shows to `to` (a hand of this round). */
async function play(v: View, to: Hand) {
  const m = v.shown;
  if (!m.player.length && to.player.length) {
    // The opening deal: you, Dime face up, you, Dime's hole card face down.
    const order = [["player", 0], ["dealer", 0], ["player", 1], ["dealer", 1]] as const;
    await Promise.all(order.map(([who, i], k) => deal(v, who, who === "dealer" && i === 1 ? null : to[who][i], i, k * DEAL_GAP, false)));
    totals(v);
  }
  for (let i = m.player.length; i < to.player.length; i++) await deal(v, "player", to.player[i], i);
  if (value(to.player).t > 21) await later(360);
  const hole = to.dealer[1];
  if (m.dealer[1] === null && hole) {
    // Dime's turn: buttons dim, the hole card turns over, then Dime draws.
    v.acts.classList.add("wait");
    await later(T.move); // the dim finishes before the flip starts
    const pc = v.hand.dealer.children[1] as HTMLElement;
    fillFace(pc.querySelector(".face")!, hole);
    pc.classList.remove("down");
    pc.classList.add("flipping");
    await later(T.slow);
    pc.classList.remove("flipping");
    m.dealer[1] = hole;
    totals(v);
    for (let i = 2; i < to.dealer.length; i++) {
      await later(i === 2 ? T.slow : DIME_GAP - T.slow); // the first waits out the flip's total roll
      await deal(v, "dealer", to.dealer[i], i);
    }
  }
}

async function resolve(v: View, s: S, result: Result | "push", pause = 400) {
  await later(pause);
  outcome(v, s, result);
  swap(v.slot, v.out);
  if (result === "push") return;
  v.shown.result = result;
  await later(T.press + T.quick);
  lose(v, result);
}

/** Every card leaves to the left (30ms apart), then the felt is empty. */
async function sweep(v: View) {
  const cards = [...v.root.querySelectorAll<HTMLElement>(".pc")];
  for (const pc of cards) pc.classList.add("out");
  await later(200 + 30 * cards.length + 200);
  v.hand.player.replaceChildren();
  v.hand.dealer.replaceChildren();
  v.hand.player.classList.remove("lost");
  v.hand.dealer.classList.remove("lost");
  v.shown = { round: v.shown.round, player: [], dealer: [], result: null };
  totals(v);
}

async function advance(v: View, s: S) {
  if (s.round !== v.shown.round) {
    // A push: finish the pushed round as it played out, hold, sweep, deal the new round.
    if (s.prev && s.round === v.shown.round + 1 && v.shown.player.length) {
      await play(v, s.prev);
      await resolve(v, s, "push");
      await later(1200);
    }
    await sweep(v);
    v.shown.round = s.round;
    v.acts.classList.remove("wait");
    swap(v.slot, v.acts);
    await later(T.press + T.quick);
  }
  await play(v, s);
  if (s.result && !v.shown.result) await resolve(v, s, s.result, s.result === "bust" ? 0 : 400); // bust already held 360ms
  else if (s.result && v.shown.result) outcome(v, s, s.result); // settled since: "waiting for a fund" → the fund it went to
}

function mount(el: HTMLElement, s: S): View {
  el.innerHTML = `<div class="bj">
    <div class="shoe" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="bj-head"><b></b><span></span></header>
    <div class="bj-zone dealer"><div class="hand" role="img"></div><div class="tot"><span class="lbl"></span><span class="num"></span></div></div>
    <div class="bj-zone player"><div class="hand" role="img"></div><div class="tot"><span class="lbl"></span><span class="num"></span></div></div>
    <div class="slot bj-foot">
      <div class="bj-acts on"><button type="button" data-a="hit">Hit</button><button type="button" data-a="stand">Stand</button></div>
      <div class="bj-out" role="status"><b></b><span></span></div>
      <div class="bj-out bj-fail" role="alert"><b>Didn't go through.</b><button type="button" class="link">Retry</button></div>
    </div>
  </div>`;
  const q = <E extends HTMLElement>(sel: string) => el.querySelector<E>(sel)!;
  q(".bj-head b").textContent = title(s.item);
  q(".bj-head span").textContent = ` · ${usd(s.amount)}`;
  return {
    root: q(".bj"),
    shoe: q(".shoe"),
    hand: { player: q(".player .hand"), dealer: q(".dealer .hand") },
    total: { player: q(".player .num"), dealer: q(".dealer .num") },
    label: { player: q(".player .lbl"), dealer: q(".dealer .lbl") },
    slot: q(".bj-foot"),
    acts: q(".bj-acts"),
    out: q(".bj-out"),
    fail: q(".bj-fail"),
    shown: { round: s.round, player: [], dealer: [], result: null },
    queue: Promise.resolve(),
    running: 0,
    inflight: false,
    act: async () => {},
  };
}

/** Queues a sequence; under reduced motion every change is drawn still. */
function queue(v: View, run: () => Promise<void> | void, s: S) {
  v.running++;
  v.queue = hold(
    v.queue
      .then(() => (reduced() ? still(v, s) : run()))
      .catch(() => still(v, s))
      .finally(() => v.running--),
  );
}

async function press(v: View, action: string) {
  if (v.running || v.inflight || v.shown.result) return; // a card in flight: ignore, don't dim (§3.1)
  v.inflight = true;
  const btn = v.acts.querySelector<HTMLButtonElement>(`[data-a="${action}"]`)!;
  const busy = setTimeout(() => {
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<span class="busy-dots"><i></i><i></i><i></i></span>`;
  }, 400);
  try {
    await v.act(action);
  } catch {
    v.fail.querySelector("button")!.onclick = () => {
      swap(v.slot, v.acts);
      void press(v, action);
    };
    swap(v.slot, v.fail);
  } finally {
    clearTimeout(busy);
    btn.removeAttribute("aria-busy");
    btn.textContent = action === "hit" ? "Hit" : "Stand";
    v.inflight = false;
  }
}

const blackjack: Renderer = (el, app, act) => {
  const s = app.state as S;
  let v = views.get(el);
  if (!v) {
    v = mount(el, s);
    views.set(el, v);
    totals(v); // "Dime" and "You" sit on the felt before the first card lands
    const view = v;
    for (const b of v.acts.querySelectorAll<HTMLButtonElement>("button")) b.onclick = () => void press(view, b.dataset.a!);
    // A card arriving now deals itself once it lands; one from history is drawn as it stands.
    if (el.classList.contains("new") && !reduced()) {
      const wait = arrival(el) + 80;
      queue(v, async () => (await later(wait), await advance(view, s)), s);
    } else still(v, s);
  } else {
    const view = v;
    queue(v, () => advance(view, s), s);
  }
  v.act = act;
};
export default blackjack;
