// The `blackjack` mini app: "should I buy X for $N" against the CFO, who deals. One real shuffled
// deck per round; dealer stands on all 17s; no split/double/insurance; a natural ends the round at
// once; a push sweeps the cards and deals again. Win: the item is bought as a covered purchase (not
// against today). Lose: the stake leaves today for the investment ledger (or waits for a fund).
//
// The deck and the hole card never leave the server: app.state is what the client sees, and the
// hole card shows up in it only at resolution. A demo rig (state.forceBlackjack) steers which card
// comes off the deck next so the next resolution goes its way; totals are always the real cards'.
import { state, id, type App } from "../state.ts";
import { now } from "../clock.ts";
import { fund } from "../funds-data.ts";
import { say, usd } from "../voice.ts";
import { create as fundsCard } from "./funds.ts";

type Suit = "S" | "H" | "D" | "C";
export type Card = { r: string; s: Suit };
export type Result = "win" | "blackjack" | "dime-bust" | "lose" | "bust";
export type Force = "win" | "lose" | "push";
export type BlackjackState = {
  item: string;
  amount: number;
  round: number; // +1 on every push redeal
  player: Card[];
  dealer: (Card | null)[]; // [up, hole]; the hole is null until resolution
  result: Result | null;
  fund: { id: string; name: string } | null; // where a loss went; null while it waits for a fund
  prev: { player: Card[]; dealer: Card[] } | null; // the pushed round this one replaced, for the sweep
};

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["S", "H", "D", "C"];
const value = (r: string) => (r === "A" ? 11 : Number(r) || 10);

export function total(cards: Card[]): number {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += value(c.r);
    if (c.r === "A") aces++;
  }
  while (t > 21 && aces--) t -= 10;
  return t;
}
const natural = (h: Card[]) => h.length === 2 && total(h) === 21;

function shuffled(): Card[] {
  const deck = SUITS.flatMap((s) => RANKS.map((r) => ({ r, s })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** The top card, or under the rig the first card (in shuffled order) that passes the first test it can. */
function draw(deck: Card[], prefer: ((c: Card) => boolean)[] = []): Card {
  for (const ok of prefer) {
    const i = deck.findIndex(ok);
    if (i >= 0) return deck.splice(i, 1)[0];
  }
  return deck.pop()!;
}

// What a rigged initial deal looks like: no naturals, and a hand the rest of the round can steer.
const between = (t: number, lo: number, hi: number) => t >= lo && t <= hi;
const DEAL_RIG: Record<Force, (p: number, d: number) => boolean> = {
  win: (p, d) => between(p, 18, 20) && between(d, 12, 16), // Dime has to draw; the draws bust it
  push: (p, d) => between(p, 17, 20) && between(d, 12, 16), // Dime draws to your total
  lose: (p, d) => between(p, 12, 16) && between(d, 18, 20), // you're stiff, Dime already stands
};

// Server-only: the deck and hole card per game. ponytail: lost on a server restart; the next action redeals.
const secrets = new Map<string, { deck: Card[]; hole: Card }>();

function deal(app: App) {
  const s = app.state as BlackjackState;
  const force = state.forceBlackjack;
  let deck: Card[], p: Card[], d: Card[];
  for (let tries = 0; ; tries++) {
    deck = shuffled();
    p = [deck.pop()!];
    d = [deck.pop()!];
    p.push(deck.pop()!);
    d.push(deck.pop()!);
    if (!force || tries > 2000) break;
    if (!natural(p) && !natural(d) && DEAL_RIG[force](total(p), total(d))) break;
  }
  secrets.set(app.id, { deck, hole: d[1] });
  s.player = p;
  s.dealer = [d[0], null];
  s.result = null;
  if (natural(p) || natural(d)) end(app, natural(p) && natural(d) ? "push" : natural(p) ? "blackjack" : "lose");
}

/** Ends the round: reveals the hole, settles money, or on a push deals again. */
function end(app: App, result: Result | "push", reveal = true) {
  const s = app.state as BlackjackState;
  const sec = secrets.get(app.id)!;
  const dealer = [s.dealer[0]!, sec.hole, ...s.dealer.slice(2)] as Card[];
  if (state.forceBlackjack && (result !== "push" || state.forceBlackjack === "push")) state.forceBlackjack = null;
  if (result === "push") {
    s.prev = { player: s.player, dealer };
    s.round++;
    return deal(app);
  }
  if (reveal) s.dealer = dealer;
  s.result = result;
  settle(app, dealer.length - 2, reveal);
}

const WON: Result[] = ["win", "blackjack", "dime-bust"];
const title = (item: string) => item.charAt(0).toUpperCase() + item.slice(1);

function settle(app: App, draws: number, revealed: boolean) {
  const s = app.state as BlackjackState;
  const at = now().toISOString();
  // Dime speaks once the card has played its ending (flip, Dime's draws 600ms apart, outcome).
  const pause = 1500 + (revealed ? 700 + 600 * draws : 0);
  const later = (...lines: (string | App)[]) => void Bun.sleep(pause).then(() => say("dime", ...lines));
  if (WON.includes(s.result!)) {
    state.txns.push({ id: id(), at, merchant: title(s.item), amount: s.amount, category: "shopping", kind: "spend", covered: true });
    return later(s.result === "blackjack" ? `Blackjack on the first deal?? The CFO is shook 🃏` : `GG. The CFO is buying your ${s.item} 💅`);
  }
  const f = state.user.fund;
  if (f) {
    state.ledger.push({ fund: f, amount: s.amount, at, reason: "blackjack" });
    s.fund = { id: f, name: fund(f).name };
    return later(`House wins. ${usd(s.amount)} is in the ${fund(f).name} now, future you says thanks 📈`);
  }
  state.pendingInvest = { amount: s.amount, at, reason: "blackjack" };
  const picker = fundsCard();
  state.apps[picker.id] = picker;
  later(`House wins. ${usd(s.amount)} has to go somewhere. Pick a fund 👇`, picker);
}

export function create(input: any = {}): App {
  const s: BlackjackState = {
    item: String(input.item ?? "it"),
    amount: Number(input.amount) || 0,
    round: 1,
    player: [],
    dealer: [],
    result: null,
    fund: null,
    prev: null,
  };
  const app: App = { id: id(), kind: "blackjack", version: 1, state: s };
  deal(app);
  // Nobody saw a pushed opening deal: start clean at round 1.
  s.round = 1;
  s.prev = null;
  return app;
}

/** The game can act: still open, and its deck survived (a server restart drops it; redeal then). */
function live(app: App): boolean {
  const s = app.state as BlackjackState;
  if (s.result) return false;
  if (secrets.has(app.id)) return true;
  s.round++;
  s.prev = null;
  deal(app);
  return false;
}

export const actions: Record<string, (app: App, body: any) => void> = {
  hit: (app) => {
    if (!live(app)) return;
    const s = app.state as BlackjackState;
    const { deck } = secrets.get(app.id)!;
    const force = state.forceBlackjack;
    const after = (c: Card) => total([...s.player, c]);
    const prefer =
      force === "lose" ? [(c: Card) => after(c) > 21, (c: Card) => after(c) < 17] // bust, or stay under Dime
      : force ? [(c: Card) => between(after(c), 18, 21), (c: Card) => after(c) <= 21]
      : [];
    s.player.push(draw(deck, prefer));
    if (total(s.player) > 21) end(app, "bust", false);
  },
  stand: (app) => {
    if (!live(app)) return;
    const s = app.state as BlackjackState;
    const sec = secrets.get(app.id)!;
    const hand = [s.dealer[0]!, sec.hole];
    const p = total(s.player);
    while (total(hand) < 17) {
      const force = state.forceBlackjack;
      const after = (c: Card) => total([...hand, c]);
      const prefer =
        force === "win" ? [(c: Card) => after(c) > 21, (c: Card) => between(after(c), 12, 16), (c: Card) => after(c) < 17, (c: Card) => between(after(c), 17, p - 1)]
        : force === "lose" ? [(c: Card) => between(after(c), Math.max(17, p + 1), 21), (c: Card) => after(c) < 17]
        : force === "push" ? [(c: Card) => after(c) === p && p >= 17, (c: Card) => after(c) < 17]
        : [];
      hand.push(draw(sec.deck, prefer));
    }
    s.dealer = [s.dealer[0], null, ...hand.slice(2)];
    const d = total(hand);
    end(app, d > 21 ? "dime-bust" : p > d ? "win" : p < d ? "lose" : "push");
  },
};
