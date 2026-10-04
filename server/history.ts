// Charles's bank feed before the demo month: Jul 6 → Sep 30 of card spend, bills, paychecks and
// transfers, plus the subscriptions and daily balances a bank + app-usage connection would give.
// Mock ingestion only: everything downstream (today's number, the CFO's detectors, the events) is
// real logic over whatever lands here. Deterministic (seeded), dated relative to the real today the
// way state.ts dates the October seed, so it reads as "the last 90 days" on any run day.
import type { Txn, Subscription, Balance } from "./state.ts";

const uid = () => crypto.randomUUID();
const DAY = 86_400_000;
const at = (daysAgo: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
};

// mulberry32: same history every seed and reset.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pick = [merchant: string, category: string, lo: number, hi: number];
const COFFEE: Pick[] = [["Blue Bottle", "coffee", 5.75, 7.5], ["Philz Coffee", "coffee", 6.25, 7.25], ["Sightglass", "coffee", 5.5, 6.75]];
const LUNCH: Pick[] = [
  ["Sweetgreen", "food", 15.45, 18.95], ["Tartine", "food", 16.5, 22], ["Souvla", "food", 17.25, 19.8],
  ["Mixt", "food", 15.75, 17.5], ["Chipotle", "food", 12.95, 15.4], ["Proper Food", "food", 11.5, 14],
];
const DINNER: Pick[] = [
  ["Nopa", "food", 58, 96], ["Zuni Café", "food", 64, 118], ["Burma Superstar", "food", 34, 52], ["Kin Khao", "food", 44, 71],
  ["Delfina", "food", 56, 88], ["Tacolicious", "food", 28, 46], ["Nopalito", "food", 31, 49], ["Pizzeria Delfina", "food", 26, 41],
];
const LATE: Pick[] = [["DoorDash", "food", 23.5, 47.8], ["Uber Eats", "food", 21.9, 44.6]];
const RIDE: Pick[] = [["Uber", "transport", 13.8, 38.6], ["Lyft", "transport", 12.4, 31.9]];
const BAR: Pick[] = [["Trick Dog", "fun", 34, 72], ["Zeitgeist", "fun", 18, 44], ["The Interval", "fun", 28, 56], ["Bar Agricole", "fun", 38, 81], ["Smuggler's Cove", "fun", 31, 63]];
const SHOP: Pick[] = [["Amazon", "shopping", 14.99, 89.5], ["Target", "shopping", 27.4, 96.2], ["Walgreens", "shopping", 8.49, 31.2]];

// Paydays: every other Friday, the latest on Oct 2 (2 days before the demo's Oct 4).
export const PAYCHECK = 5425;
export const isPayday = (daysAgo: number) => daysAgo >= 2 && (daysAgo - 2) % 14 === 0;
export const SAVINGS_SWEEP = 3000; // auto-transfer to savings each payday

/** Bills by day of month: [day, merchant, amount by month index (Jul=6, Aug=7, Sep=8)]. Hulu & co
 *  are the subscriptions below, billed monthly as bills like a bank feed shows them. */
const BILLS: [number, string, (month: number) => number][] = [
  [1, "Rent", () => 1450],
  [1, "Comcast", () => 47], // promo price; October's bill (state.ts) is $70: the promo ended
  [2, "Spotify", () => 11.99],
  [6, "Verizon", () => 45],
  [9, "Car insurance", () => 112],
  [12, "Netflix", () => 17.99],
  [14, "iCloud+", () => 2.99],
  [15, "Gym", () => 11],
  [19, "Claude Pro", () => 20],
  [20, "PG&E", (m) => ({ 6: 58.4, 7: 64.12, 8: 61.87 })[m] ?? 60],
  [22, "Hulu", () => 19],
  [25, "NYT", () => 17],
];

export const SUBSCRIPTIONS = (): Subscription[] => [
  { merchant: "Spotify", price: 11.99, cadence: "monthly", lastUsed: at(0, 8, 41).toISOString() },
  { merchant: "Netflix", price: 17.99, cadence: "monthly", lastUsed: at(3, 22, 10).toISOString() },
  { merchant: "Hulu", price: 19, cadence: "monthly", lastUsed: at(51, 21, 30).toISOString() }, // 7 weeks idle: the CFO's find
  { merchant: "iCloud+", price: 2.99, cadence: "monthly", lastUsed: at(0, 7, 55).toISOString() },
  { merchant: "Claude Pro", price: 20, cadence: "monthly", lastUsed: at(1, 16, 2).toISOString() },
  { merchant: "NYT", price: 17, cadence: "monthly", lastUsed: at(2, 7, 30).toISOString() },
  // Signed up Sep 29 for the 14-day trial, opened it that night, never again (simulate.ts trial event).
  { merchant: "Calm", price: 14.99, cadence: "monthly", lastUsed: at(5, 22, 15).toISOString(), trialEnds: at(-9, 0, 0).toISOString() },
];

/** Jul 6 → the last day before this month, oldest first. */
export function history(): Txn[] {
  const r = rng(20261004);
  const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 100) / 100;
  const pick = (xs: Pick[]) => xs[Math.floor(r() * xs.length)];
  const txns: Txn[] = [];
  const add = (daysAgo: number, h: number, m: number, merchant: string, amount: number, category: string, kind: Txn["kind"] = "spend") =>
    txns.push({ id: uid(), at: at(daysAgo, h, m).toISOString(), merchant, amount: Math.round(amount * 100) / 100, category, kind });
  const buy = (daysAgo: number, h: number, p: Pick) => add(daysAgo, h, Math.floor(r() * 60), p[0], between(p[2], p[3]), p[1]);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  for (let daysAgo = 90; ; daysAgo--) {
    const d = at(daysAgo, 12);
    if (d >= monthStart) break;
    const dow = d.getDay(); // 0 Sun … 6 Sat
    const weekday = dow >= 1 && dow <= 5;
    const away = daysAgo >= 49 && daysAgo <= 52; // NYC, Aug 13–16 (Thu–Sun)
    for (const [dom, merchant, amount] of BILLS) if (d.getDate() === dom) add(daysAgo, 6, 0, merchant, amount(d.getMonth()), "bills", "bill");
    if (isPayday(daysAgo)) {
      add(daysAgo, 5, 0, "Payroll", PAYCHECK, "income", "income");
      add(daysAgo, 9, 0, "Transfer to Savings", SAVINGS_SWEEP, "transfer", "transfer");
    }
    if (away) continue; // trip spend is listed below
    if (daysAgo === 20) continue; // Sep 14: a no-spend Monday
    if (weekday && r() < 0.78) buy(daysAgo, 8, pick(COFFEE));
    if (!weekday && r() < 0.45) buy(daysAgo, 10, pick(COFFEE));
    if (weekday && r() < 0.62) buy(daysAgo, 12, pick(LUNCH));
    if (dow === 0) buy(daysAgo, 11, ["Trader Joe's", "groceries", 46, 92]);
    if (dow === 3 && r() < 0.55) buy(daysAgo, 18, ["Whole Foods", "groceries", 24, 63]);
    if (dow === 5 || dow === 6 ? r() < 0.55 : r() < 0.22) buy(daysAgo, 19, pick(DINNER));
    if (dow >= 4 && r() < 0.6) buy(daysAgo, 21, pick(BAR));
    if (dow >= 4 || dow === 0 ? r() < 0.7 : r() < 0.25) buy(daysAgo, dow >= 4 ? 23 : 18, pick(RIDE));
    if (dow === 5 || dow === 6 ? r() < 0.6 : r() < 0.14) buy(daysAgo, 23, pick(LATE));
    if (r() < 0.18) buy(daysAgo, 14, pick(SHOP));
    if (d.getDate() === 3 || d.getDate() === 17) add(daysAgo, 7, 50, "Clipper", 40, "transport");
    if (d.getDate() % 13 === 4) buy(daysAgo, 17, ["Shell", "transport", 52, 68]);
  }

  // The one-offs that make it someone's summer. [daysAgo, h, m, merchant, amount, category, kind?]
  const ONE_OFF: [number, number, number, string, number, string, Txn["kind"]?][] = [
    [87, 13, 10, "Uniqlo", 89.6, "shopping"],
    [84, 20, 5, "AMC Metreon", 19.5, "fun"],
    [80, 14, 40, "Fellow Barber", 55, "personal"],
    [74, 21, 48, "Alaska Airlines", 412.2, "travel"], // SFO→JFK for Aug 13
    [73, 22, 3, "Airbnb", 684.35, "travel"],
    [70, 19, 20, "Venmo · Maya", 34, "food"], // her birthday dinner split
    [63, 11, 15, "Chase ATM", 60, "cash"],
    [59, 15, 30, "Venmo · Sam", 22, "fun", "refund"], // Sam paid back the Giants tickets
    [56, 9, 12, "Amazon", 129.99, "shopping"], // carry-on
    [52, 7, 5, "SFO Hudson News", 14.28, "shopping"],
    [52, 16, 40, "Joe Coffee", 6.5, "coffee"],
    [52, 20, 15, "Katz's Delicatessen", 38.75, "food"],
    [51, 10, 2, "OMNY", 2.9, "transport"],
    [51, 13, 30, "Los Tacos No. 1", 17.6, "food"],
    [51, 22, 40, "Uber", 24.1, "transport"],
    [50, 12, 5, "MoMA", 30, "fun"],
    [50, 19, 45, "Via Carota", 112.4, "food"],
    [50, 23, 50, "Death & Co", 64, "fun"],
    [49, 11, 0, "Russ & Daughters", 28.4, "food"],
    [49, 17, 30, "Uber", 71.3, "transport"], // to JFK
    [45, 20, 0, "The Fillmore", 65, "fun"],
    [42, 14, 20, "Amazon", 42.99, "shopping"],
    [39, 10, 30, "Amazon", 42.99, "shopping", "refund"], // returned the HDMI hub
    [37, 15, 10, "Fellow Barber", 55, "personal"],
    [35, 19, 30, "Venmo · Penny", 48, "food"], // Thai + drinks
    [30, 18, 20, "REI", 186.4, "shopping"], // Labor Day camping at Tahoe
    [29, 9, 40, "Safeway Truckee", 71.85, "groceries"],
    [28, 12, 10, "Chevron", 58.2, "transport"],
    [28, 19, 30, "Sunnyside", 148.6, "food"], // dinner for four, his card
    [28, 13, 0, "Tahoe State Park", 35, "fun"],
    [24, 13, 0, "Zola", 175, "gifts"], // Ellie & Mark's wedding registry
    [22, 12, 30, "Chase Center", 186, "fun"], // Sep 12 game
    [22, 19, 10, "Chase Center", 62, "food"], // beers and garlic fries
    [22, 17, 55, "Uber", 24.8, "transport"],
    [22, 23, 40, "Lyft", 29.3, "transport"],
    [21, 18, 40, "Uniqlo", 64.7, "shopping"],
    [19, 9, 0, "Hertz", 148.6, "travel"], // drove up for the Sonoma wedding
    [18, 17, 45, "Healdsburg Shed", 46.2, "food"],
    [17, 11, 20, "Chevron", 61.4, "transport"],
    [15, 20, 10, "Venmo · Maya", 26, "food"],
    [12, 14, 10, "Fellow Barber", 55, "personal"],
    [9, 19, 0, "Venmo · Sam", 30, "food", "refund"],
  ];
  for (const [daysAgo, h, m, merchant, amount, category, kind] of ONE_OFF)
    add(daysAgo, h, m, merchant, amount, category, kind ?? "spend");
  // Money moved to the paper ledger before Dime picked a fund (summary.ts seedHistory: same days).
  for (const [daysAgo, amount] of [[40, 500], [31, 250], [18, 300], [12, 200]])
    add(daysAgo, 10, 0, "Robinhood", amount, "transfer", "transfer");
  return txns.sort((a, b) => a.at.localeCompare(b.at));
}

const delta = (t: Txn) => (t.kind === "income" || t.kind === "refund" ? t.amount : -t.amount);

/** Daily closing balances from 90 days ago through yesterday. Checking is the running sum of `txns`
 *  from an opening balance; savings gets each payday's transfer plus a little interest. */
export function balances(txns: Txn[], checkingOpen: number, savingsOpen: number): Balance[] {
  const out: Balance[] = [];
  let checking = checkingOpen;
  let savings = savingsOpen;
  const sorted = [...txns].sort((a, b) => a.at.localeCompare(b.at));
  let i = 0;
  for (let daysAgo = 90; daysAgo >= 1; daysAgo--) {
    const close = at(daysAgo, 23, 59);
    while (i < sorted.length && new Date(sorted[i].at) <= close) {
      const t = sorted[i++];
      checking += delta(t);
      if (t.merchant === "Transfer to Savings") savings += t.amount;
    }
    if (new Date(close.getTime() + DAY).getDate() === 1) savings = Math.round(savings * (1 + 0.043 / 12) * 100) / 100; // 4.3% APY
    // The ISO day, as the bank reports a close (cfo.ts's debitChecking adds today's the same way).
    const day = `${close.getFullYear()}-${String(close.getMonth() + 1).padStart(2, "0")}-${String(close.getDate()).padStart(2, "0")}`;
    out.push({ account: "checking", at: day, balance: Math.round(checking * 100) / 100 });
    out.push({ account: "savings", at: day, balance: savings });
  }
  return out;
}
