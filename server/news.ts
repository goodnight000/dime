// Finance news and facts Dime drops after a purchase or in the morning, at most one a day.
// With EXA_API_KEY: a recent headline tied to what just happened (Exa news search, cached, 2.5s cap).
// Without it, or when Exa is slow or empty: a curated fact. Curated facts are true as phrased and
// carry their source; they are written so no number in them goes stale with a price change.
import { state } from "./state.ts";
import { now } from "./clock.ts";
import { say, word, usd, linkTitles } from "./voice.ts";
import * as money from "./money.ts";

export type Fact = { text: string; source?: string; url?: string };
export type Topic = "delivery" | "rideshare" | "coffee" | "subscriptions" | "shopping" | "credit" | "investing" | "saving";

const FACTS: Record<Topic, Fact[]> = {
  delivery: [
    { text: "restaurants pay DoorDash 15 to 30% on delivery orders. One reason the app menu often costs more than the counter.", source: "DoorDash merchant pricing" },
    { text: "DoorDash's service fee scales with your subtotal, on top of the delivery fee. Bigger order, bigger fee.", source: "DoorDash fees help page" },
  ],
  rideshare: [
    { text: "surge pricing means the same ride costs more when demand spikes. Waiting a few minutes can bring it back down.", source: "Uber surge pricing help page" },
  ],
  coffee: [
    { text: "the \"latte factor\" is David Bach's idea: small daily buys add up. $7 a day is $2,555 a year.", source: "David Bach, The Automatic Millionaire" },
  ],
  subscriptions: [
    { text: "in a C+R Research survey people guessed they spent $86 a month on subscriptions. The real number was $219.", source: "C+R Research, 2022" },
  ],
  shopping: [
    { text: "prices end in .99 because of the left-digit effect: your brain reads $29.99 as twenty-something, not thirty.", source: "Thomas & Morwitz, Journal of Consumer Research, 2005" },
  ],
  credit: [
    { text: "in Fed data, card rates on balances that carry interest topped 20% in 2023 and 2024. Paying in full skips all of it.", source: "Federal Reserve G.19" },
    { text: "payment history is 35% of a FICO score, the biggest single piece. One autopay saves a lot of pain.", source: "myFICO" },
  ],
  investing: [
    { text: "rule of 72: divide 72 by your yearly return to get the years it takes money to double. At 8%, about 9 years.", source: "Rule of 72" },
    { text: "S&P's SPIVA scorecards keep finding nearly 9 in 10 US large-cap fund managers trail the S&P 500 over 15 years.", source: "S&P Dow Jones Indices, SPIVA" },
    { text: "VOO charges 0.03% a year. That's $3 on every $10,000.", source: "Vanguard" },
    { text: "over 20 years, missing just the 10 best days in the market cut the ending value by more than half. Time in beats timing.", source: "J.P. Morgan Guide to Retirement" },
    { text: "Einstein never called compound interest the eighth wonder of the world. There's no record of him saying it. Still true though.", source: "Quote Investigator" },
    { text: "the S&P 500 has averaged around 10% a year since 1926, before inflation, with some ugly years in between.", source: "S&P Dow Jones Indices" },
  ],
  saving: [
    { text: "FDIC insurance covers $250,000 per depositor, per bank, per ownership category.", source: "FDIC" },
    { text: "in the Fed's yearly survey, more than a third of US adults wouldn't cover a surprise $400 expense with cash.", source: "Federal Reserve SHED" },
    { text: "the FDIC's national average savings rate is a fraction of what online high-yield accounts pay. Check yours.", source: "FDIC national rates" },
    { text: "at 3% inflation, prices double in about 24 years. Cash under the mattress loses.", source: "Rule of 72" },
  ],
};

const QUERY: Record<Topic, string> = {
  delivery: "DoorDash Uber Eats delivery fees prices",
  rideshare: "Uber Lyft fares prices riders",
  coffee: "coffee prices Starbucks cost",
  subscriptions: "streaming subscription price increase",
  shopping: "consumer prices shopping tariffs retail",
  credit: "credit card interest rates consumers",
  investing: "S&P 500 stocks index funds investors",
  saving: "high-yield savings account rates",
};

/** What a purchase is about, or null when nothing worth a fact. */
export function topicOf(merchant: string, category = ""): Topic | null {
  const s = `${merchant} ${category}`.toLowerCase();
  if (/doordash|uber ?eats|grubhub|postmates|instacart|seamless/.test(s)) return "delivery";
  if (/\buber\b|lyft|transport/.test(s)) return "rideshare";
  if (/coffee|matcha|starbucks|blue bottle|latte/.test(s)) return "coffee";
  if (/netflix|hulu|spotify|disney|max\b|subscription/.test(s)) return "subscriptions";
  if (/amazon|target|shopping|sneaker|nike|shein|sephora/.test(s)) return "shopping";
  return null;
}

type Hit = { title: string; url: string; snippet?: string; published?: string };
const NEWS_SITES = ["reuters.com", "apnews.com", "cnbc.com", "bloomberg.com", "wsj.com", "nytimes.com", "marketwatch.com",
  "axios.com", "businessinsider.com", "fortune.com", "theverge.com", "techcrunch.com", "npr.org", "bbc.com", "cnn.com",
  "washingtonpost.com", "theguardian.com", "barrons.com", "finance.yahoo.com"];
const cache = new Map<string, { at: number; hits: Hit[] }>(); // ponytail: no eviction; fine for a demo session
const used = new Set<string>(); // facts and URLs already said, so Dime doesn't repeat itself

const exa = (topic: Topic) => exaSearch(QUERY[topic]);

/** Recent news for any query (Dime's search_news tool, and the topic facts above). */
export async function exaSearch(query: string): Promise<Hit[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.hits;
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      query,
      type: "fast",
      category: "news",
      numResults: 6,
      includeDomains: NEWS_SITES, // real newsrooms only: open search returns SEO menu pages for "coffee prices"
      startPublishedDate: new Date(Date.now() - 14 * 86_400_000).toISOString(),
      contents: { highlights: { maxCharacters: 200 } },
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`exa ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; highlights?: string[]; publishedDate?: string }[] };
  const hits = (data.results ?? [])
    .filter((r) => r.url && r.title && r.title.length > 20)
    .map((r) => ({ title: r.title!.trim().replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, ""), url: r.url!, // drop " | Site"
      snippet: r.highlights?.[0]?.trim(), published: r.publishedDate?.slice(0, 10) }));
  cache.set(query, { at: Date.now(), hits });
  for (const h of hits) linkTitles.set(h.url, h.title);
  return hits;
}

const clip = (s: string, n = 110) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)) + "…");

/** A fact for `topic`: a fresh headline when Exa answers in time, else the next curated one. */
export async function getFact(topic: Topic): Promise<Fact> {
  try {
    const hit = (await exa(topic)).find((h) => !used.has(h.url));
    if (hit) {
      used.add(hit.url);
      return { text: clip(hit.title), source: new URL(hit.url).hostname.replace(/^www\./, ""), url: hit.url };
    }
  } catch (e) {
    console.warn("exa:", (e as Error).message);
  }
  const pool = [...FACTS[topic], ...FACTS.investing, ...FACTS.saving];
  const fact = pool.find((f) => !used.has(f.text)) ?? pool[0];
  used.add(fact.text);
  return fact;
}

const said = new Set<string>(); // ids of fact messages; a reset drops the messages, so the quota frees
let inflight = false;
const factToday = () => {
  const day = now().toDateString();
  return state.messages.some((m) => said.has(m.id) && new Date(m.created_at).toDateString() === day);
};

/** The morning's topic: none on the demo's first day (purchases get it), later mornings a money fact. */
export const morningTopic = (): Topic | null => (state.clockOffsetMs >= 12 * 3_600_000 ? "investing" : null);

/** After `after` (Dime's reply) lands, posts one fact on `topic` unless one went out today. */
export async function dropFact(topic: Topic | null, after: Promise<unknown> = Promise.resolve()) {
  if (!topic || inflight || factToday()) return after;
  inflight = true;
  try {
    const fact = getFact(topic); // fetch (and word a headline) while Dime is still typing the reply
    const take = fact.then((f) => f.url
      ? word("dime", `A news headline tied to what Charles just did: "${f.text}" (${f.source}). Left today: ${usd(money.today(state, now()))}. Share it in one short bubble, in your voice: what it means for him. No numbers except the headline's and today's; never mention yesterday's numbers. Its link follows your words.`, [f.text]).then((w) => w?.[0] ?? `saw this 👀 "${f.text}"`)
      : f.text);
    await after;
    const f = await fact;
    const body = f.url ? `${await take}\n${f.url}` : f.text;
    await say("dime", body);
    const m = state.messages.filter((x) => x.thread === "dime" && x.body === body).at(-1);
    if (m) said.add(m.id);
  } finally {
    inflight = false;
  }
}
