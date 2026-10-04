// The one in-memory state object and its seed. Neon swaps in later behind the same exports; until
// then a restart (or POST /api/demo/reset) puts the demo back at the start of Oct 4.
import { seedHistory } from "./summary.ts"; // dashboard history: earlier weeks, sweeps, ledger

export type Thread = "dime" | "group";
export type Friend = "Penny" | "Maya" | "Sam";
export type Tapback = "love" | "like" | "dislike" | "laugh" | "emphasize" | "question";
export type Message = {
  id: string;
  thread: Thread;
  direction: "in" | "out"; // in = Charles, out = Dime or a friend
  sender?: Friend; // group thread only; absent = Dime (out) or Charles (in)
  body: string; // may be "" when app is set
  app?: string; // mini app id; the card renders instead of the body
  created_at: string;
  tapback?: Tapback | null;
  reply_to?: { id: string; direction: "in" | "out"; body: string } | null;
};
export type AppKind = "blackjack" | "funds" | "goal" | "proposal" | "market" | "today";
export type App = { id: string; kind: AppKind; version: number; state: any }; // version++ on every change
export type Txn = {
  id: string;
  at: string;
  merchant: string;
  amount: number;
  category: string;
  kind: "spend" | "bill" | "income" | "refund" | "transfer";
  covered?: boolean; // won at blackjack: bought, but not counted against today
};
export type FriendTxn = { id: string; at: string; who: Friend; merchant: string; amount: number }; // mock: settles markets
export type FundId = "VOO" | "QQQ" | "SOXX" | "DRAM" | "CASH";
export type Account = { id: string; name: string; kind: "bank" | "brokerage"; connected: boolean };
export type State = {
  user: { name: "Charles"; tone: "savage" | "nice"; fund: FundId | null; hourly: number };
  month: { income: number; bills: number; invest: number };
  txns: Txn[];
  goal: { name: string; price: number; saved: number; emoji: string };
  ledger: { fund: FundId; amount: number; at: string; reason: string }[];
  sweeps: { at: string; amount: number }[];
  bonus: { at: string; amount: number }[]; // market winnings, added to today
  messages: Message[];
  apps: Record<string, App>;
  friends: { name: Friend; streak: number }[];
  friendTxns: FriendTxn[];
  accounts: Account[];
  clockOffsetMs: number;
  typing: Record<Thread, number>; // replies being composed; the snapshot's `pending`
  /** A loss waiting for a fund (no fund picked yet); the funds card's pick moves it to the ledger. */
  pendingInvest: { amount: number; reason: string; at: string } | null;
  /** Demo rig: the next blackjack resolution goes this way (the deck is stacked, totals stay real). */
  forceBlackjack: "win" | "lose" | "push" | null;
  /** Bills still to come this month (what month.bills set aside); the today card's weather. */
  upcoming: { merchant: string; amount: number; at: string }[];
};

export const id = () => crypto.randomUUID();

// Seed dates are relative to the real today (offset 0 at seed time), at fixed local hours.
function at(daysAgo: number, h: number, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function seed(): State {
  const spend = (daysAgo: number, h: number, merchant: string, amount: number, category: string): Txn => ({
    id: id(), at: at(daysAgo, h), merchant, amount, category, kind: "spend",
  });
  const bill = (daysAgo: number, merchant: string, amount: number): Txn => ({
    id: id(), at: at(daysAgo, 6), merchant, amount, category: "bills", kind: "bill",
  });
  // Oct 1 was a big day ($204, nothing swept); Oct 2 and 3 came in under and swept the rest. That
  // leaves a pool of $8,710: $311 a day for the 28 days left.
  const txns: Txn[] = [
    { id: id(), at: at(3, 5), merchant: "Payroll", amount: 10850, category: "income", kind: "income" },
    bill(3, "Rent", 1450),
    bill(3, "Comcast", 70),
    bill(2, "Spotify", 12),
    spend(3, 9, "Blue Bottle", 7, "coffee"),
    spend(3, 12, "Sweetgreen", 16, "food"),
    spend(3, 14, "Trader Joe's", 64, "groceries"),
    spend(3, 17, "Target", 48, "shopping"),
    spend(3, 20, "DoorDash", 31, "food"),
    spend(3, 23, "Uber", 38, "transport"),
    spend(2, 8, "Blue Bottle", 7, "coffee"),
    spend(2, 18, "Uber", 23, "transport"),
    spend(1, 8, "Blue Bottle", 7, "coffee"),
    spend(1, 19, "AMC", 21, "fun"),
  ];
  // Four September nights, then Oct 2 and 3. Pace is their average: about $66 a day.
  const sweeps = [
    [7, 62], [6, 48], [5, 71], [4, 39], [2, 83], [1, 95],
  ].map(([daysAgo, amount]) => ({ at: at(daysAgo, 23, 59), amount }));
  return {
    user: { name: "Charles", tone: "savage", fund: null, hourly: 32 },
    month: { income: 10850, bills: 1700, invest: 0 },
    txns,
    goal: { name: "iPhone 17 Pro", price: 1099, saved: 650, emoji: "📱" },
    ledger: [],
    sweeps,
    bonus: [],
    messages: [
      dime(at(1, 8), "Morning ☀️ $311 today."),
      dime(at(1, 23, 59), "$95 left. Moved to the iPhone 📱 59%"),
      dime(at(0, 8), "Morning ☀️ $311 today."),
      dime(at(0, 8), "Verizon autopays Tuesday, already set aside."),
      friend("Penny", at(1, 20), "who's down for thai tonight"),
      friend("Maya", at(1, 20, 2), "me but cheap thai"),
      friend("Sam", at(1, 20, 5), "I'm on a no-spend streak don't tempt me"),
      friend("Penny", at(1, 22, 40), "update: thai was $19 and then I doordashed dessert"),
      friend("Maya", at(1, 22, 41), "of course you did"),
      friend("Penny", at(0, 9, 12), "new day new me. no doordash today"),
      friend("Sam", at(0, 9, 15), "screenshotting this"),
    ],
    apps: {},
    friends: [
      { name: "Penny", streak: 1 },
      { name: "Maya", streak: 4 },
      { name: "Sam", streak: 6 },
    ],
    // Penny's DoorDash habit (Dime quotes her average when asked to make a market).
    friendTxns: ([
      [4, "Penny", "DoorDash", 44], [3, "Penny", "DoorDash", 36], [2, "Penny", "DoorDash", 51], [1, "Penny", "DoorDash", 33],
      [2, "Maya", "Trader Joe's", 28], [1, "Sam", "Blue Bottle", 6],
    ] as const).map(([daysAgo, who, merchant, amount]) => ({ id: id(), at: at(daysAgo, 21), who, merchant, amount })),
    accounts: [
      { id: "chase", name: "Chase Checking", kind: "bank", connected: true },
      { id: "robinhood", name: "Robinhood", kind: "brokerage", connected: false },
    ],
    clockOffsetMs: 0,
    typing: { dime: 0, group: 0 },
    pendingInvest: null,
    forceBlackjack: null,
    // The rest of month.bills ($1,700 less the $1,532 already billed).
    upcoming: [
      { merchant: "Verizon", amount: 45, at: at(-2, 6) },
      { merchant: "Car insurance", amount: 112, at: at(-5, 6) },
      { merchant: "Gym", amount: 11, at: at(-11, 6) },
    ],
  };
}

function dime(created_at: string, body: string): Message {
  return { id: id(), thread: "dime", direction: "out", body, created_at };
}
function friend(sender: Friend, created_at: string, body: string): Message {
  return { id: id(), thread: "group", direction: "out", sender, body, created_at };
}

export const state: State = seedHistory(seed());

export function reset() {
  Object.assign(state, seedHistory(seed()));
}
