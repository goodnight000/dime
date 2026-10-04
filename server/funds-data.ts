// The fund catalog for the fake ledger: the only place fund copy and risk live. The funds card,
// the dashboard and Dime's lines all read from here. Returns are illustrative flavor, never advice.
import type { FundId } from "./state.ts";

export type Fund = {
  id: FundId;
  ticker: string; // shown next to the name; "Cash" has none worth showing
  name: string;
  risk: 1 | 2 | 3 | 4;
  blurb: string; // one line, the row's description
  goodFor: string; // "Good for …"
  fact: string; // one honest fact for the detail pane
  more: string; // 2-3 sentences, for a read-more surface
  ret: { pct: number; period: string }; // illustrative, label it as such wherever it shows
};

export const RISK = { 1: "Low", 2: "Medium", 3: "High", 4: "Very high" } as const;
export const ILLUSTRATIVE = "Illustrative, not a real return.";

/** In picker order: the default first, then up the risk ladder, cash last. */
export const FUNDS: Fund[] = [
  {
    id: "VOO",
    ticker: "VOO",
    name: "S&P 500",
    risk: 2,
    blurb: "The 500 biggest US companies.",
    goodFor: "Good for money you won't touch for 5+ years.",
    fact: "The boring default. Boring is the point.",
    more: "One fund that owns a slice of the 500 largest US companies. It has dipped hard in bad years and recovered every time so far. The fee is tiny.",
    ret: { pct: 14.2, period: "1y" },
  },
  {
    id: "QQQ",
    ticker: "QQQ",
    name: "Nasdaq-100",
    risk: 3,
    blurb: "The 100 biggest Nasdaq names, tech-heavy.",
    goodFor: "Good for 7+ years and a stomach for dips.",
    fact: "Mostly big tech. Up more, down more.",
    more: "The 100 largest non-financial companies on the Nasdaq, so mostly Apple, Microsoft, Nvidia and friends. It beats the S&P in tech booms and falls harder when tech falls.",
    ret: { pct: 19.8, period: "1y" },
  },
  {
    id: "SOXX",
    ticker: "SOXX",
    name: "Semiconductors",
    risk: 4,
    blurb: "US chipmakers. Big swings both ways.",
    goodFor: "Good for a small bet you can leave for 10 years.",
    fact: "About 30 companies. One bad quarter hits them all.",
    more: "Around 30 US-listed chip companies: designers, fabs and equipment makers. Chips power everything from phones to AI, but the industry runs in booms and busts, and this fund feels both.",
    ret: { pct: 27.5, period: "1y" },
  },
  {
    id: "DRAM",
    ticker: "DRAM",
    name: "Memory",
    risk: 4,
    blurb: "Memory chip makers. Launched Apr 2026.",
    goodFor: "Good for money you are fine watching drop 40%.",
    fact: "New in Apr 2026. Narrow and volatile.",
    more: "Roundhill's Memory ETF, launched April 2026. About 75% of it is three companies: Micron, Samsung and SK Hynix. Memory prices swing hard, so this is the riskiest fund here by a mile.",
    ret: { pct: 41.3, period: "since Apr 2026" },
  },
  {
    id: "CASH",
    ticker: "Cash",
    name: "Cash",
    risk: 1,
    blurb: "High-yield savings. No swings.",
    goodFor: "Good for goals under 2 years.",
    fact: "It won't grow much. It won't shrink either.",
    more: "A high-yield savings account. The balance never goes down, and it earns a little interest. Right for money you need soon, wrong for money you want to grow.",
    ret: { pct: 4.1, period: "APY" },
  },
];

export const fund = (id: FundId) => FUNDS.find((f) => f.id === id)!;
export const isFund = (v: unknown): v is FundId => FUNDS.some((f) => f.id === v);
