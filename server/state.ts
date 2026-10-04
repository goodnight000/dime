// The one in-memory state object and its seed. Neon swaps in later behind the same exports; until
// then a restart (or POST /api/demo/reset) puts the demo back at the start of Oct 4.
import { seedHistory } from "./summary.ts"; // dashboard history: earlier weeks, sweeps, ledger
import { history, balances, SUBSCRIPTIONS, PAYCHECK, SAVINGS_SWEEP } from "./history.ts"; // Jul 6 → Sep 30 bank feed
import HISTORY from "./history.json"; // three weeks of texts written by the live agent (server/agent/make-history.ts)

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
  reaction?: Tapback | null; // Dime's tapback on Charles's message (an "ok" needs no words)
  reply_to?: { id: string; direction: "in" | "out"; body: string } | null;
  link?: { url: string; title: string }; // a news URL in the body whose headline we know (news.ts)
};
export type AppKind = "blackjack" | "funds" | "goal" | "proposal" | "market" | "today" | "girlmath";
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
  user: {
    name: "Charles"; tone: "savage" | "nice"; fund: FundId | null; hourly: number;
    morning: string; // "08:00", when the morning text goes out (Settings)
    blackjack: boolean; // impulse buys can be played for (Settings)
    tips: boolean; // CFO finds and money facts (Settings)
  };
  month: { income: number; bills: number; invest: number };
  txns: Txn[];
  /** Savings goals in priority order: sweeps fill the first unfinished one, overflow rolls to the next (money.ts). */
  goals: Goal[];
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
  /** Recurring subscriptions as the bank feed + app usage sees them (CFO detectors read these). */
  subscriptions: Subscription[];
  /** End-of-day account balances, one point per account per day, oldest first. */
  balances: Balance[];
};
/** `store` = where it's ordered from (a thing he buys); absent for trips and funds, which are just Done when full.
 *  `done` = ordered (a store goal, paid from what it saved). */
export type Goal = { id: string; name: string; price: number; saved: number; emoji: string; store?: string; createdAt: string; done?: { at: string } };
export type Subscription = { merchant: string; price: number; cadence: "monthly" | "yearly"; lastUsed: string; trialEnds?: string };
export type Balance = { account: "checking" | "savings"; at: string; balance: number };

export const id = () => crypto.randomUUID();

// Seed dates are relative to the real today (offset 0 at seed time), at fixed local hours.
function at(daysAgo: number, h: number, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** The chat history's shape (times are ms from the demo day's midnight). */
const CHAT = HISTORY as unknown as {
  messages: (Omit<Message, "id" | "created_at"> & { at: number })[];
  apps: Record<string, App>;
  fund: FundId | null;
  ledger: { fund: FundId; amount: number; at: number; reason: string }[];
  txns: (Omit<Txn, "at"> & { at: number })[];
};

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
    ...history(),
    ...CHAT.txns.map((t) => ({ ...t, at: since(t.at) })), // the record he won at blackjack
    bill(3, "Rent", 1450),
    bill(3, "Comcast", 70), // the $47 promo ended: history has Aug and Sep at $47
    { id: id(), at: at(2, 5), merchant: "Payroll", amount: PAYCHECK, category: "income", kind: "income" },
    { id: id(), at: at(2, 9), merchant: "Transfer to Savings", amount: SAVINGS_SWEEP, category: "transfer", kind: "transfer" },
    bill(2, "Spotify", 11.99),
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
    user: { name: "Charles", tone: "savage", fund: CHAT.fund ?? null, hourly: 32, morning: "08:00", blackjack: true, tips: true },
    month: { income: 10850, bills: 1700, invest: 0 },
    txns,
    goals: [
      { id: "iphone", name: "iPhone 17 Pro", price: 1099, saved: 650, emoji: "📱", store: "Apple", createdAt: at(40, 12) },
      { id: "tokyo", name: "Tokyo trip", price: 2400, saved: 0, emoji: "🗼", createdAt: at(12, 21) },
      { id: "emergency", name: "Emergency fund", price: 5000, saved: 1800, emoji: "🛟", createdAt: at(80, 9) },
    ],
    ledger: CHAT.ledger.map((l) => ({ ...l, at: since(l.at) })), // the blackjack loss in the chat history
    sweeps,
    bonus: [],
    messages: [
      ...[...CHAT.messages].sort((a, b) => a.at - b.at).map(({ at: ms, ...m }) => ({ ...m, id: id(), created_at: since(ms) })),
      friend("Penny", at(1, 20), "who's down for thai tonight"),
      friend("Maya", at(1, 20, 2), "me but cheap thai"),
      friend("Sam", at(1, 20, 5), "I'm on a no-spend streak don't tempt me"),
      friend("Penny", at(1, 22, 40), "update: thai was $19 and then I doordashed dessert"),
      friend("Maya", at(1, 22, 41), "of course you did"),
      friend("Penny", at(0, 9, 12), "new day new me. no doordash today"),
      friend("Sam", at(0, 9, 15), "screenshotting this"),
    ],
    apps: structuredClone(CHAT.apps),
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
    // The demo day starts at 9:30 AM whatever the real time, so the morning beat reads as morning and
    // the day's beats (group, midnight) stay in order. Can be negative; jump() only moves forward.
    clockOffsetMs: new Date(at(0, 9, 30)).getTime() - Date.now(),
    typing: { dime: 0, group: 0 },
    pendingInvest: null,
    forceBlackjack: null,
    // October's bills still to come. ponytail: month.bills is the $1,700 plan; the real month runs ~$1,836
    // (subscriptions); raising it moves the demo's $311, so the plan stays.
    upcoming: [
      { merchant: "Verizon", amount: 45, at: at(-2, 6) },
      { merchant: "Car insurance", amount: 112, at: at(-5, 6) },
      { merchant: "Gym", amount: 11, at: at(-11, 6) },
      { merchant: "Netflix", amount: 17.99, at: at(-8, 6) },
      { merchant: "iCloud+", amount: 2.99, at: at(-10, 6) },
      { merchant: "Claude Pro", amount: 20, at: at(-15, 6) },
      { merchant: "PG&E", amount: 59.3, at: at(-16, 6) },
      { merchant: "Hulu", amount: 19, at: at(-18, 6) },
      { merchant: "NYT", amount: 17, at: at(-21, 6) },
    ],
    subscriptions: SUBSCRIPTIONS(),
    // Opening balance picked so checking's low over the last 60 days is about $5,000: cash that
    // never gets used (what the CFO's idle-cash find reads).
    balances: openAt(txns, 5000),
  };
}

/** Daily balances with checking opened so its 60-day low lands on `low`; savings opens at $16,400. */
function openAt(txns: Txn[], low: number) {
  const today = new Date(at(0, 0));
  const past = txns.filter((t) => new Date(t.at) < today);
  const lowFrom0 = Math.min(...balances(past, 0, 0).filter((b) => b.account === "checking").slice(-60).map((b) => b.balance));
  return balances(past, Math.round(low - lowFrom0), 16400);
}

/** history.json times are ms from the demo day's midnight. */
const since = (ms: number) => new Date(new Date(at(0, 0)).getTime() + ms).toISOString();
function friend(sender: Friend, created_at: string, body: string): Message {
  return { id: id(), thread: "group", direction: "out", sender, body, created_at };
}

export const state: State = seedHistory(seed());

export function reset() {
  Object.assign(state, seedHistory(seed()));
}
