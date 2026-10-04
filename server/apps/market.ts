// The `market` mini app: a yes/no claim about a friend's spend, bet pari-mutuel. Winners get their
// stake back plus the losing side's pot split pro rata by stake. Settles YES from the subject's
// mock card the moment their spend in the window reaches the line, NO at midnight (friends.ts).
import { id, state, type App, type Friend } from "../state.ts";
import { now } from "../clock.ts";
import { dayStart } from "../money.ts";
import { react } from "../friends.ts";

export type Side = "yes" | "no";
export type Who = "Charles" | Friend;
export type Bet = { who: Who; side: Side; amount: number };
export type Payout = { who: Who; side: Side; amount: number; net: number };
export type Market = {
  question: string;
  subject: Friend;
  merchant: string;
  threshold: number;
  from: string; // the window: today, [from, to)
  to: string;
  optedIn: boolean; // the subject said yes; bets open then
  bets: Bet[];
  status: "open" | Side;
  spent: number; // the subject's spend at the merchant in the window, at settlement
  settledAt?: string;
  payouts?: Payout[];
  estimate?: number; // what Charles's bet pays back if he's right (stake included)
};

export const STAKES = [5, 10, 20];

export function pots(bets: Bet[]) {
  const p = { yes: 0, no: 0 };
  for (const b of bets) p[b.side] += b.amount;
  return p;
}

/** Each bettor's result. Winners: +share of the losers' pot (floored to whole dollars). Losers: −stake.
 * Nobody on the winning side: everyone gets their stake back. */
export function payouts(bets: Bet[], winner: Side): Payout[] {
  const p = pots(bets);
  const loser: Side = winner === "yes" ? "no" : "yes";
  return bets.map((b) => {
    if (!p[winner]) return { ...b, net: 0 };
    const net = b.side === winner ? Math.floor((p[loser] * b.amount) / p[winner]) : -b.amount;
    return { ...b, net };
  });
}

/** What `bet` pays back if its side wins, at the current pots (stake included). */
export function estimate(bets: Bet[], bet: Bet): number {
  const p = pots(bets);
  const other = p[bet.side === "yes" ? "no" : "yes"];
  return bet.amount + Math.floor((other * bet.amount) / p[bet.side]);
}

export function create(input: Pick<Market, "subject" | "merchant" | "threshold">): App {
  const at = now();
  const from = dayStart(at);
  const s: Market = {
    question: `Will ${input.subject} spend $${input.threshold} on ${input.merchant} today?`,
    ...input,
    from: from.toISOString(),
    to: new Date(from.getTime() + 86_400_000).toISOString(),
    optedIn: false,
    bets: [],
    status: "open",
    spent: 0,
  };
  return { id: id(), kind: "market", version: 1, state: s };
}

/** Records a bet and refreshes Charles's estimate. Caller bumps the version. */
export function place(app: App, bet: Bet) {
  const m: Market = app.state;
  m.bets.push(bet);
  const mine = m.bets.find((b) => b.who === "Charles");
  if (mine) m.estimate = estimate(m.bets, mine);
}

/** Decides the market (status, payouts) without showing it: returns `credit`, which lands Charles's
 *  result in today (bonus; a loss is a negative bonus) and bumps the card. The group settles in
 *  that order: Dime calls it, then the money moves and the card turns over. */
export function decide(app: App, winner: Side, spent: number) {
  const m: Market = app.state;
  m.status = winner;
  m.spent = spent;
  m.settledAt = now().toISOString();
  m.payouts = payouts(m.bets, winner);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const mine = m.payouts!.find((p) => p.who === "Charles");
    if (mine?.net) state.bonus.push({ at: m.settledAt!, amount: mine.net });
    app.version++;
  };
}

/** Settles at once: decided and credited. */
export const settle = (app: App, winner: Side, spent: number) => decide(app, winner, spent)();

export const actions: Record<string, (app: App, body: any) => void> = {
  bet: (app, body) => {
    const m: Market = app.state;
    const side = body.side as Side;
    const amount = Number(body.amount);
    if (m.status !== "open" || !m.optedIn) throw new Error("closed");
    if (side !== "yes" && side !== "no") throw new Error("side");
    if (!STAKES.includes(amount)) throw new Error("amount");
    if (m.bets.some((b) => b.who === "Charles")) throw new Error("already");
    place(app, { who: "Charles", side, amount });
    react(app, side);
  },
};
