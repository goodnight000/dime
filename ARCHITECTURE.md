# Dime: how it's built

The build contract for the hackathon (ends 4:30pm 2026-10-04). `CONCEPT.md` is the *what*; this is the *how*. Where they disagree, this file wins: it records Charles's decisions from the alignment session.

## Decisions from the alignment session (override CONCEPT.md)

- **Web app, not iMessage.** A Messages-styled web chat, reused from Forth's app (`~/Developer/forth-frontend/apps/app`, current working tree). Runs locally. No deploy.
- **Demo-grade.** Mock data everywhere, in-memory state is fine. Build only what the demo shows. No auth.
- **Three screens:** Chat (home), Dashboard (stats), Accounts (fake connect bank + brokerage). Plus a separate `/demo` control panel for Charles, opened in a second window.
- **Mini apps.** Everything non-chat happens in interactive cards the agent sends inside the thread: blackjack, fund picker, goal, CFO proposal, prediction market.
- **Blackjack replaces the impulse spin and "bet against the CFO".** The dealer is the CFO. You may only stake up to what's left of today's number. Standard rules: dealer stands on all 17s, blackjack pays the purchase (no 3:2 math, it's win/lose), no split/double/insurance, push = redeal. **Win:** you buy the item and it does not count against today. **Lose:** no item; the stake moves from today into your investment fund.
- **Prediction market (friend mode).** In a group chat with mock friends Penny, Maya, Sam. A yes/no claim ("Will Penny spend $80 on DoorDash today?"). People bet on both sides. Winners get their stake back plus the losing side's pot split pro rata by stake. **Winnings are free money** (added to the winner's today number), unlike CONCEPT.md principle 5.
- **CFO also drops finance news/facts** (Exa search when the key arrives; a curated list until then).
- **Investing is a fake ledger.** Funds: S&P 500 (VOO), Nasdaq-100 (QQQ), Semiconductors (SOXX), Memory (DRAM, Roundhill, launched Apr 2026), Cash (high-yield savings). Each has a short description, a risk level, a "good for" line.
- **Cut:** phone call, group votes on impulse buys, season pool, Plaid, full onboarding (the demo starts onboarded), deploy.
- **Agent:** Pi (`@mariozechner/pi-agent-core` / `pi-ai`). **Model + DB:** Neon (AI Gateway for the model, Postgres for data) once Charles sends credentials. Until then: in-memory store and template replies, so nothing blocks on credentials.
- **UI is a judged track.** Buttery, premium, every micro-detail and motion considered. See `docs/DESIGN.md`.

## Stack

- **Bun** server (`server/`), TypeScript, `Bun.serve` routes on port **8787**. No framework.
- **Vite** frontend (`web/`), plain TypeScript, no framework, copied from Forth's app. Vite proxies `/api/*` to `:8787`.
- `bun run dev` starts both (server with `--watch`, Vite with HMR). Open `http://localhost:5173`.
- No new dependency unless it clearly earns its place.

## Layout

```
server/
  index.ts        Bun.serve routes (the HTTP contract below)
  state.ts        the single in-memory state object + seed (Neon later swaps in behind the same functions)
  clock.ts        now() = real time + offset; demo panel moves the offset
  money.ts        pure math: today's number, sweep, girl math, fund growth. Every number comes from here.
  events.ts       morning, purchase, midnight, CFO scan: deterministic triggers that post messages
  voice.ts        wording: template replies now, Pi agent later; never invents numbers
  agent/          Pi agent, system prompt (prompt.md), tools that call money.ts
  apps/<kind>.ts  one file per mini app: create(), action handlers, state shape
web/
  index.html, vite.config.ts
  src/main.ts     router + sidebar shell (Forth's)
  src/api.ts      fetch helpers + shared types
  src/chat.ts     the thread (Forth's agent.ts), renders text + mini apps; takes a thread id
  src/apps/<kind>.ts   one renderer per mini app kind; index.ts maps kind → renderer
  src/dashboard.ts, src/accounts.ts, src/demo.ts
  src/theme.css (+ per-screen css)
```

**Ownership rule for parallel agents:** each mini app owns exactly `server/apps/<kind>.ts` + `web/src/apps/<kind>.ts` (+ its css). Shared files (`server/index.ts`, `state.ts`, `money.ts`, `web/src/chat.ts`, `api.ts`, `theme.css`, `main.ts`) have one owner per wave; others ask the orchestrator instead of editing them.

## Data model (server/state.ts)

```ts
type Thread = "dime" | "group";
type Message = {
  id: string; thread: Thread;
  direction: "in" | "out";         // in = the user (Charles), out = Dime or a friend
  sender?: "Penny" | "Maya" | "Sam"; // group thread only; absent = Dime (out) or user (in)
  body: string;                     // text; may be "" when app is set
  app?: string;                     // mini app id; the card renders under/instead of the body
  created_at: string;               // ISO, from clock.now()
  tapback?: Tapback | null; reply_to?: {...} | null;
};
type App = { id: string; kind: AppKind; version: number; state: any }; // version++ on every change
type AppKind = "blackjack" | "funds" | "goal" | "proposal" | "market" | "today";
type Txn = { id; at; merchant; amount; category; kind: "spend"|"bill"|"income"|"refund"|"transfer"; covered?: boolean };
State = { user: { name: "Charles", tone: "savage"|"nice", fund: FundId|null, hourly: 32 },
          month: { income: 3200, bills: 1700, invest: 0 },
          txns: Txn[], goal: { name, price, saved, emoji }, ledger: { fund, amount, at, reason }[],
          sweeps: { at, amount }[], bonus: { at, amount }[],   // bonus = market winnings, adds to today
          messages: Message[], apps: Record<string, App>, friends: [...], clockOffsetMs: number }
```

Seed: today is shown as "Oct 4", ~$300 discretionary already spent this month, pool sized so today's number is about **$43**. Goal: iPhone 17 Pro, $1,099, ~$650 saved. A few realistic transactions (Blue Bottle, Trader Joe's, DoorDash, Uber, Spotify, Comcast, rent).

## Money rules (server/money.ts, pure functions)

```
pool   = income − bills − invest − discretionary spend this month (non-covered) − sweeps this month − blackjack losses this month + bonuses this month
today  = max(0, floor(poolAtStartOfDay / daysLeftIncludingToday) − spentToday − lostToday + bonusToday)
pace   = avg sweep over last 7 days (fallback today × 0.25); eta = ceil((price − saved)/pace); delay = ceil(amount/pace)
```
Midnight: leftover today → goal (`sweeps`, goal.saved += leftover). Overspend → tomorrow shrinks by itself.
Blackjack loss → ledger entry in user's fund (asks for a fund via the `funds` app if none set yet).

## HTTP contract (server/index.ts)

```
GET  /api/session                     → { owner:{display_name:"Charles", onboarded:true}, agent:{name:"Dime"} }
GET  /api/messages?thread=dime|group  → { messages: Message[], apps: Record<id, App> }   (full snapshot; chat polls every 1s)
POST /api/messages {thread,text,reply_to?} → { id, pending:true }   (reply arrives via poll)
POST /api/messages/:id/tapback {tapback}
POST /api/apps/:id/:action {…}        → { app }   (e.g. blackjack hit/stand, funds pick, proposal approve, market bet)
GET  /api/summary                     → numbers for the dashboard (today, goal, ledger by fund, spend by category, calendar)
GET  /api/accounts, POST /api/accounts/:id/connect
POST /api/demo/:action {…}            → swipe {merchant,amount,category} | morning | midnight | skip-day | cfo-scan | friend-swipe {who,merchant,amount} | force-blackjack {result} | reset
```

## Message flow

User text → stored → `voice.reply(thread, text)` decides: plain reply, or create a mini app (e.g. "should I buy $280 sneakers?" → blackjack if ≤ today, else explain why not; "is Penny going to spend $80 on DoorDash today?" in group → market). Events (`events.ts`) post messages proactively; the 1s poll shows them. A typing indicator shows while a reply is pending (`pending` flag on the snapshot).

## Build waves

0. **Foundation** (one agent): copy Forth UI, strip auth/memory/vault/settings, Dime branding, Bun server with the contract above, seed, template voice, morning + purchase + midnight events, stub files for every mini app, `/demo` page with swipe/morning/midnight. Thin but real end to end.
1. **In parallel, by file ownership:** blackjack · funds + goal + today cards · CFO proposals + news · group chat + market · dashboard + accounts · Pi agent + prompt (when Neon creds land).
2. **Polish + verify:** motion pass, screenshot every surface light and dark against `docs/DESIGN.md`, demo rehearsal script.
