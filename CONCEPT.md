# Dime: concept

*Name chosen by Charles 2026-10-04: Dime. Written the night before a one-day hackathon.*

## 0. Read this first (for the agent)

**Who you're working with.** Charles is building this alone at a one-day hackathon. The deliverable is a live demo, not a shipped product. He will start by talking this document through with you to agree on exactly what gets built, then build it with you.

**Where this came from.** This document is the output of a long brainstorming session between Charles and another agent (Claude) the night before. You did not see that conversation; everything you need from it is here. Three research agents surveyed finance apps, Reddit and X/builder chatter; their reports are in `research/` (`products.md`, `builders.md`, `reddit.md`).

**This project is unrelated to any other repo on this machine** (for example `~/Developer/wearable`, which is Charles's main product, Forth). Don't import its conventions here.

**How to read the status tags.** Every feature and decision carries one:

- **[Charles]**: Charles proposed or explicitly asked for it. Treat as a requirement; don't re-pitch alternatives unless something is impossible.
- **[Agreed]**: proposed by the agent, Charles responded positively. Settled unless he reopens it.
- **[Proposed]**: the agent's design, which Charles has not reviewed in detail. Walk him through these. He may cut or change them.

**How to run the alignment conversation.**

1. Don't re-explain the concept to him. He knows it. Confirm you've read it in a few lines.
2. Walk through the open questions (§17) and the [Proposed] items he hasn't seen, quickly. Lead with a recommendation each time.
3. Agree on the build tiers (§15) and the demo script (§14), then start building.
4. Build a thin, real path end to end first (text in → number computed → text out), then add features tier by tier.

**What Charles is like to work with (observed in the session).**

- He wants it to be **exciting and attractive**, not merely sensible. He called the agent's second round of ideas "really bad" because they "just didn't sound like an attractive idea" (see §2). Sensible-but-dull is the main failure mode.
- He wants **ambition** over polish: "we can be a bit ambitious because all we have to produce is a demo. It doesn't have to be a fully fleshed-out polished working thing."
- He thinks in **values first, then mechanisms**: "What are the values we want to provide? What is the mechanism for us to provide them?"
- He likes **Gen Z, funny framing** (he named "girl math").
- He wants **creative, proactive visualization** of finances, not dashboards of numbers.
- When the agent asked the same question several times (team size, language), he ignored it until it mattered. Default sensibly and say what you assumed rather than blocking on him.

**Facts you should verify, not trust.** Research claims (dates, user counts, funding) were gathered from web search on 2026-10-03/04, and the X/Twitter evidence is thin. Implementation hints (§16) were not checked against current API docs. Check any API detail before relying on it.

## 1. What Charles asked for, in his words

His messages, lightly trimmed. They are the source of truth for intent.

- **Values:** "We want to help people to gain more financial literacy and to have better control over their finances."
- **Integrations:** "A trading account where we can place trades for them. Probably their banking, so we can see what their financials actually look like."
- **Form factor:** "this agent's form factor would be best if it's through iMessage."
- **Competition:** "like you and your friends who want to cut back on spending compete on something. Whenever someone loses it takes $1 or some amount out of that person's bank account into a shared pool. At the end of the month whoever makes the fewest transgressions wins the entire pool."
- **Gambling:** "if you spend money that you weren't supposed to, you can gamble. If you win then you get the money back and you can spend this elsewhere. If you lose then this money will go into being invested instead of being spent."
- **Solo matters:** "a lot of these feature ideas work when there is a friend group. We also have to design for when there isn't a friend group. What is the value we can provide for individuals?"
- **The combination:** "the personal CFO plus these friend-group mechanics plus a gamified mechanic (by introducing gambling) can be really attractive. And also good telemetry into a person's finances. Very creative and very proactive ways for people to visualize their finances."
- **Personal CFO:** "having an agent monitor a person's expenses and help them suggest different actions for different expenses."
- **Goals and daily budget:** "have users set different goals and different budgets and have different metrics... every day they wake up and they see, 'Okay I have this much that I can spend.' Whatever is left over, make it rewarding... a user can pick out that they want a new iPhone... whatever money they don't use at the end of the day goes towards funding that new thing... 'By this rate of saving you can get this new thing in X days' and we'll call this maybe 'girl math' or something really Gen Z and funny."
- **Metrics:** he asked the agent to design the metric set ("I don't know what exactly these metrics are. You can spearhead this").

## 2. Decision log: how we got here

In order. The rejected ideas matter: don't bring them back without a new reason.

1. **Agent's first take:** narrow the idea to a "swear jar for spending": name a habit, get texted when you slip, $1 goes into an index fund. Charles agreed with adding friends but wanted more excitement (competition, gambling).
2. **Agent's second take (rejected as unattractive):** a vice tax per slip, a double-or-nothing coin flip on the penalty, a DietBet-style friend league whose pot is invested, "kept money" nudges after clean weeks, and choosing between three index funds at onboarding. Charles: "some of the ideas you come up with are really bad... it just doesn't sound like an attractive idea." He asked for research into what makes finance products pop.
3. **Research findings** (detail in `research/`):
   - "Ask questions about your bank data" is already handled. ChatGPT (May 2026) and Perplexity (April 2026) read bank data through Plaid, read-only.
   - Text-first finance agents exist. Rocket Money's Rowan (Aug 2026) negotiates bills and cancels subscriptions by text. Ari (YC W25) is a read-only iMessage finance agent with proactive recaps. A solo iMessage finance assistant is not new on its own.
   - What makes products spread: personality (Cleo's roast mode, ~7M users), screenshot-ready recaps (Monzo "nice or savage"), variable rewards (Fold's spin wheel), money at stake with friends (DietBet pots, Polymarket Squads, Poll in iMessage), agents that visibly act (Pine AI's bill-negotiation calls).
   - Reddit wishes: help *at the moment of spending*, a proactive digest instead of a chatbot, no made-up numbers. People won't share dollar amounts with friends but will share streaks and pass/fail. Evidence for competing with friends was thin on Reddit itself; it comes from industry launches.
   - Hackathon winners show something happening in the real world (a phone ringing, phones buzzing), not dashboards.
4. **Agent's third take:** a "group-chat CFO" with friend bets settled by bank data, group tapback votes on impulse buys, a live bill-negotiation phone call, a savage weekly recap, and "own your vice" stock buys. Charles liked some of these but said they depend on having friends.
5. **Fourth take [Agreed]:** three layers on one engine: a personal CFO for individuals, games that work solo, and friend mode as an add-on. Every mechanic has a solo version and a group version.
6. **Charles added the daily budget, want goals and girl math [Charles]**, and asked the agent to design the metrics. That became the core loop (§5–7).

**Rejected or dropped. Don't re-propose:**

- A generic "chat with your finances" assistant (already exists).
- Round-ups (Acorns already does them; they tax every purchase, so they teach nothing about habits).
- A per-slip vice tax as the main mechanic, and the double-or-nothing coin flip (part of the round Charles found unattractive).
- Choosing a fund as the literacy moment (dull).
- A separate dashboard app. The only screen outside iMessage is the money map (§8).
- Stock picking or portfolio advice.

**Note:** "Bet against the CFO" (§9) descends from the vice-tax/stake idea in the rejected round. It's still in as [Proposed] because it gives solo users a bet, but it's the item most likely to feel dull. Check with Charles.

## 3. One-line pitch [Agreed]

A personal CFO that lives in iMessage. Every morning it tells you what you can spend today, puts whatever you don't spend toward the thing you actually want, and texts you first when something in your money needs a decision. Add it to a group chat and it runs bets on your friends' habits.

> "ChatGPT can read your bank account. Ours texts you first, acts for you, and turns saving into a game."

## 4. Values and principles

**Values [Charles]:** financial literacy and control over your finances. **[Agreed]** addition: fun, because budgeting apps die within about a month when they're boring, and the games and the voice are what keep people coming back.

**Principles [Proposed]** (break ties when a feature is unclear):

1. **iMessage is the main surface.** The only other screen is the money map.
2. **The agent texts first.** Most value arrives unprompted; chat is the fallback.
3. **Every number is computed, never generated.** Code computes amounts, dates and projections; the model only words them.
4. **Nothing moves without a tapback.** Trades, transfers, cancellations, calls and purchases need a 👍 on the proposal message. Read-only actions need none.
5. **Game money never comes back as spending money.** Sweeps, bet winnings and stakes end up in a goal or an investment, never in the daily number.
6. **Solo first, friends multiply [Agreed].** Every mechanic works alone; friend mode changes who plays the other side.
7. **Show progress, not balances, to others.** Groups see streaks, percentages and pass/fail, never account balances.
8. **The user picks the tone.** Nice or savage, set at onboarding, changeable any time.

## 5. The core loop: today's number [Charles; mechanics Proposed]

### Behavior

- **Morning (8:00 local):** "You have **$43** today," with the money-weather image (§8). Mentions bills due in the next 3 days.
- **On every purchase:** within a minute, a short reply with the updated number and the girl-math effect (§7): "Matcha $7. $36 left today. iPhone 1 day later 💅". No reply for bills that were already set aside.
- **Midnight [Charles]:** whatever is left of today's number moves to the active goal. "$12 left. Moved to the iPhone 📱 64%, 3 days closer," with the goal fill image.
- **Overspend:** nothing moves. The overage comes out of the rest of the month, so tomorrow's number shrinks. "You went $8 over. Tomorrow: $41. iPhone moves to Mar 11." No scolding unless the user chose savage.

### How the number is computed

```
pool   = expected income this month
       - fixed bills this month (rent, utilities, subscriptions)
       - committed contributions (invest habit, if set)
       - discretionary spend so far this month
       - amounts already swept to goals this month
daily  = pool / days remaining in month (including today)
```

- Recomputed each morning; during the day it only goes down as you spend.
- Midnight sweeps leave the pool, so under-spending doesn't inflate tomorrow's number. That's what makes the leftover feel like it went somewhere.
- Overspending lowers the pool, so the correction spreads across the rest of the month by itself.
- **Counts as spend:** discretionary card and debit purchases, including pending ones. **Excluded:** recurring bills already set aside, transfers between your own accounts, investment contributions. **Refunds** add back to today.
- **Floor:** if the pool goes negative, the number is $0. The agent says so plainly and offers help ("Want me to look for subscriptions to cut?").

## 6. Goals and metrics [Charles asked; set Proposed]

The user doesn't pick from a menu. Onboarding asks *"What do you want?"* and *"What's annoying you about your money?"*, then the agent proposes two or three metrics. The user can change them by text later.

| Metric | Example | What the agent does | Game hook |
|---|---|---|---|
| **Daily number** (always on) [Charles] | $43/day | Morning text, purchase replies, midnight sweep | Under-budget days earn tickets (§9) |
| **Want goal** [Charles] | iPhone, $1,099 | Girl-math arrival date, fill-up image, offers to buy it when full | Completion is the payoff |
| **Vice cap** | ≤ 2 DoorDash/week | Warns when you're close, reacts when you go over | Bet against the CFO, friend bets |
| **No-spend days** | 3 per week | Green/red calendar grid | Tickets per no-spend day |
| **Invest habit** | $200/mo into VOO | Projects the future-you balance, places the buy after approval | Bonus ticket when hit |
| **Safety net** | 3 months of expenses | "You could last 1.4 months without a paycheck" | Milestone celebration |

The daily number and the want goal are the product. The other four add depth for users who want it.

### Goal behavior

- **Setting a goal:** the agent asks the price (or looks it up), then teaches where the money should sit. Under 2 years: cash. Over 2 years: an index fund. "Stocks can drop right when you need the cash, so the iPhone money stays in savings." This is the main literacy moment.
- **One active goal** gets the midnight sweep at a time; others wait in a queue.
- **Goal complete:** "iPhone fund full: $1,099. Want me to order it?" 👍 → the agent "buys" it (staged in the demo), then asks for the next goal.

## 7. Girl math [Charles named it; mechanics Proposed]

The meme justifies spending ("if it's under $5 it's free"). We flip it to justify saving: **every price becomes days toward your goal.**

- On a purchase: "That $7 matcha = iPhone 1 day later."
- On "should I get X?": "Skip it and the iPhone lands Mar 3 instead of Mar 9."
- On demand ("girl math"): "At your pace, iPhone in 23 days. Girl math says it's basically already yours."

```
pace (per day) = average midnight sweep over the last 7 days
                 (fallback: today's number × 0.25)
eta days       = (goal price - goal balance) / pace
delay days     = purchase amount / pace
```

Round days up. The model varies the wording; it never changes the numbers.

## 8. Telemetry: seeing your money [Charles asked; set Proposed]

Images sent in the thread, each readable in two seconds on a phone.

| Visual | When | What it shows |
|---|---|---|
| **Money weather** | Every morning | Today's number as the headline; sunny / cloudy / storm based on bills in the next 3 days |
| **Goal fill** | Every midnight sweep | The goal object's outline filling up like a glass, % and arrival date |
| **No-spend calendar** | Weekly or on request | Month grid: green under budget, red over, gold no-spend |
| **Future you** | When a vice or the invest habit comes up | "Your DoorDash habit, invested instead: $X at 40," with a curve |
| **Hours of work** | Big purchases or on request | "Those sneakers cost 14 hours of your work" (asks hourly pay once) |
| **Weekly recap** | Sunday evening | Nice or savage summary built to be screenshotted, no balances |
| **Money map** | Linked, on request | Live web page with a Sankey diagram of income flowing into bills, habits, goals and investments; the projector moment |

## 9. Gambling and games [Charles asked; designs Proposed]

All of it obeys principle 5: game money ends up in a goal or an investment. No "house" takes money from the user.

Charles's original gambling idea was to gamble a slip: win and get the money back to spend, lose and it gets invested. The agent's concern, never fully discussed: winning hands money back to the habit you were trying to cut. The impulse spin below is the agent's reframe. **Confirm it captures what Charles wanted.**

### Impulse spin (solo, free)

Triggered by "should I buy X?" for anything above today's number, or by texting "spin". A wheel image with four outcomes, weighted by how the month is going:

1. **Buy it, guilt-free.**
2. **Wait 24 hours.** The agent checks back: "Still want the sneakers?"
3. **Buy it, but match $50 into your goal.**
4. **Skip it and move the full price into your goal.**

No outcome is a loss, so nothing has to back it. It's a fun way to decide, and it puts the agent in the moment of spending, which Reddit asked for most.

### Bet against the CFO (solo; see the note in §2)

"I bet $20 I won't DoorDash this week," set against the matching vice cap. **Win:** keep the stake, plus 3 tickets and a hype message. **Lose:** the stake goes to the invest habit or goal. Settled automatically from transactions.

### Tickets and the weekly draw (solo)

1 ticket per under-budget day, 2 per no-spend day. A Sunday draw adds a bonus to the active goal. Real products (Long Game, Yotta) fund prizes from interest; in the demo the prize is simulated.

## 10. Friend mode [Charles wanted competition; Agreed as an add-on]

The user adds the agent to an existing group chat. Members who want to play link their own account by DM; others can still watch and vote.

| Mechanic | Solo | Group |
|---|---|---|
| Impulse check | Impulse spin | "Charles wants $280 sneakers." Tapback vote; majority 👎 → 24-hour wait |
| Bets | Bet against the CFO | Friend bets settled by bank data |
| Recap | Personal weekly recap | Savage recap posted to the group, no balances |
| Streaks | Calendar + draw | Leaderboard by streak and % of goal, never dollars |
| Goal | Personal want goal | Shared goal (group trip): everyone's midnight sweeps fill one jar |

### Friend bets settled by bank data

This is the main group mechanic. It evolved from Charles's monthly shared pool, where the fewest transgressions wins.

- Someone proposes: "Charles cracks and orders DoorDash before Friday." The agent restates it as a checkable rule (person, merchant category, window) and asks for sides and stakes.
- Members join a side by replying. Small fixed stakes.
- The agent settles it from the subject's transactions. Nobody can fake the outcome, which is what makes it different from a normal group bet.
- **Settlement:** losers' stakes go into the winners' active goals. "Charles ordered DoorDash at 1:14am. Maya and Sam win; Charles's stake just moved their trip fund to 71%."
- The subject has to opt in to bets about them.
- **Open:** Charles's original monthly pool (fewest slips wins it all) could run as a season-long version of this. Ask whether he wants it.

## 11. The CFO: proactive actions [Charles; table Proposed]

The agent classifies each transaction and recurring charge and texts when something needs a decision. Each message ends with an action that runs only after 👍.

| Detected | Message | After 👍 |
|---|---|---|
| A bill went up | "Comcast went up $23. Want me to call them?" | Places a negotiation call (demo moment), reports the result, offers to send the savings to the goal |
| Unused subscription | "No Hulu activity in 7 weeks. Cancel?" | Cancels (staged), reports savings in girl math |
| Vice trending up | "DoorDash is up 40% this month. Want a weekly cap?" | Creates a vice cap |
| Paycheck landed | "$2,140 in. Plan: $900 bills, $300 VOO, $940 to spend. 👍?" | Sets the month's pool, places the investment |
| Idle cash | "$4k has sat in checking 3 months. Move $2k to VOO?" | Places the order |
| Unknown merchant | "$89 from a merchant you've never used. Was this you?" | 👎 → walks through freezing the card (staged) |

At most one unprompted CFO message per day outside the morning and midnight texts. If several pile up, they go out as one "found 3 things" message.

## 12. Onboarding by text [Proposed]

1. User texts the number (QR code or link). One intro message plus a link to connect a bank.
2. "Looks like ~$3,200/mo in and ~$1,700 in bills. Sound right?"
3. "What do you want?" → want goal, with the cash vs index fund lesson.
4. "What's annoying you about your money?" → one or two more metrics.
5. "Nice or savage?"
6. "You have $43 today."

Target: under 2 minutes from first text to first number.

## 13. Questions judges will ask [Proposed answers]

- **"Isn't this gambling?"** No outcome pays a house. Every game moves the user's own money into their own goal or investment, or between friends based on their own behavior (the DietBet model, which has paid out more than $31M). The demo uses paper trading and simulated money.
- **"Is it giving investment advice?"** It only uses broad index funds and cash, never picks stocks, and frames everything as education.
- **"Is moving money safe?"** Every money movement needs an explicit 👍. In production, money would be held by a licensed partner, never by us, and moved in batches over ACH.
- **"Why not just use ChatGPT?"** ChatGPT waits to be asked and can't act. This agent texts first, acts with approval, and lives in your group chat.

## 14. Demo script, about 3.5 minutes [Proposed]

Projector mirrors the phone; the money map shows at the end.

1. **Morning.** Weather image: "You have $43 today."
2. **A purchase.** Fake swipe, $7 matcha: "$36 left. iPhone 1 day later 💅"
3. **The CFO acts.** "Found 3 things." 👍 on Comcast; the negotiation call plays on speaker. "Saved $23/mo. Moving it to the iPhone."
4. **Impulse.** "Should I get these $280 sneakers?" The spin lands on *match $50 into your goal*.
5. **Midnight.** Jump the clock: "$12 left. iPhone 64%," with the fill image.
6. **Friend mode.** Add the agent to a group chat; a friend bet settles on a fake swipe and every phone buzzes.
7. **Payoff.** Jump to goal complete: "iPhone fund full. Want me to order it?" 👍
8. **Close.** Money map on the projector, the agent's number on screen so judges can text it.

## 15. Build order for one person [Proposed]

Each tier must work end to end before the next starts.

- **Tier 1 (the demo exists):** shortened text onboarding, daily number, purchase replies with girl math, midnight sweep, goal fill image, goal complete, and the demo control panel (§16).
- **Tier 2 (the wow):** CFO "found 3 things" with tapback approval, the phone call, impulse spin.
- **Tier 3 (the extra):** friend bet in a group chat, money map, weather image, bet against the CFO.
- **Cut unless time is left:** tickets and draw, no-spend calendar, hours of work, safety net, shared goal, paycheck plan, fraud check.

## 16. Implementation hints [Proposed, unverified]

Suggestions to start from. Check APIs against current docs.

- **Source of truth:** a local transactions table (SQLite). Plaid sandbox fills it at onboarding for realism; the fake-swipe button writes to the same table. Every feature reads from the table, so the demo never waits on Plaid.
- **Demo control panel (critical when demoing alone):** a small local web page with buttons for *swipe (merchant, amount)*, *jump to midnight*, *skip N days*, *trigger morning*, *fill goal*, *bill increase*. Keep "now" as one overridable clock that every rule reads.
- **iMessage:** a Mac signed into a spare Apple ID. Options: Photon's iMessage tooling (check their "Built with Photon" program, reported to pay up to $50k for iMessage agents built at hackathons), BlueBubbles, or reading `~/Library/Messages/chat.db` (Full Disk Access) and sending with AppleScript. **Test group chats and reading tapbacks first**; they are the riskiest part.
- **Images:** render HTML/SVG to PNG (Satori + resvg, or a headless-browser screenshot) and send as attachments. One template per visual in §8.
- **Phone call:** a voice-agent platform (Vapi, Retell, or Twilio + speech models). With no teammate, a second voice agent can play the Comcast rep, so the demo is two agents negotiating on speaker. Record a backup.
- **Brokerage:** Alpaca paper trading; fractional dollar-amount orders make "$12 → VOO" one call.
- **Model:** Claude with tool use. Tools return computed numbers; the model writes messages. One tool per action (`get_today`, `get_goal`, `girl_math`, `propose_action`, `execute_action`, `create_bet`, `settle_bet`, `spin`). Enforce approval in code: `execute_action` refuses unless the proposal has a 👍.
- **Money map:** one web page with a Sankey chart, sent as a link (iMessage shows a rich preview).
- **Group members for the demo:** 2–3 extra Apple IDs on spare devices, or invite people at the venue into the group live.

## 17. Open questions for the alignment conversation

Ordered by how much they change the build. Each has a default to propose.

1. **Hackathon facts:** how long the build window is, the judging criteria, sponsor prizes or required tech, and whether code written before the start is allowed. *Ask first; these can reorder the tiers.*
2. **iMessage setup:** is there a spare Apple ID and a Mac to run it on? *Default: Charles's Mac with a second Apple ID.*
3. **Gambling:** does the impulse spin capture his "gamble your slip" idea, or does he want his original version? *Default: spin, with his version as a variant if he insists.*
4. **The phone call:** worth the build time alone, or replace it with a staged subscription cancellation? *Default: keep it in tier 2 and build it only after tier 1 works.*
5. **Friend mode in the demo:** live with real people, or a recorded clip? *Default: live if people are available at the venue, a clip as backup.*
6. **Bet against the CFO:** keep, change or cut (it descends from a rejected idea)? *Default: tier 3.*
7. **Season pool:** add his original monthly "fewest slips wins the pot" as a long-running friend bet? *Default: mention it in the pitch, don't build it.*
8. **Name [Charles]:** Dime. A dime is money, and in Gen Z slang "a dime" is a 10/10 ("your finances? a dime"). Settled. Rejected earlier: Pocket CFO, Bankroll. "Girl Math" stays a feature name.
9. **Stack:** TypeScript assumed (he never answered). *Default: TypeScript.*
