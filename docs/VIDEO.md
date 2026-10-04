# Dime: demo video

Target is about 2:20 after editing. The story: budgeting apps are dashboards nobody opens. Dime is a CFO who texts you like a friend. It answers with real numbers, turns a bad purchase into a game you can lose *into your investments*, finds money for you, runs bets in your group chat, and gets you the thing you're saving for.

Raw autopilot run: 3:38 of screen time (measured 3:21pm, Oct 4). Editing takes out the model waits (Luna, about 1.5 to 4s per reply) and the typing.

## Setup (5 minutes)

1. **Theme: light.** Cards, the felt and the heat map read best on a light screen, and judges watch on bright laptops. The autopilot defaults to light.
2. **Mac:** Do Not Disturb on (Control Center → Focus). Hide the dock (`Cmd+Option+D`): it covers the bottom of the 1440×900 window on this 14" screen. Quit Messages, Slack and anything else that can pop up over the window.
3. **Server up:** `curl -s localhost:8787/api/demo/state | head -c 80` prints JSON. If not: `cd ~/Developer/dime && nohup bun run dev > /tmp/dime-dev.log 2>&1 &`.
4. **Recording:** `Cmd+Shift+5` → **Record Selected Portion** → drag exactly over the autopilot window's page (1440×900 points, below its "Dime" title bar) → Options: no microphone if you voice over in editing, built-in mic if you voice over live with `--pause`. Click Record, then start the autopilot.
5. The autopilot resets the demo itself (`POST /api/demo/reset`) when it starts at beat 1. By hand: `curl -XPOST localhost:8787/api/demo/reset`.

## Commands

```bash
cd /tmp/blackjack     # Playwright lives here
node ~/Developer/dime/scripts/autopilot.mjs                # whole video, resets first
node ~/Developer/dime/scripts/autopilot.mjs --pause        # Enter before each beat (live voice over)
node ~/Developer/dime/scripts/autopilot.mjs --beat 6       # from beat 6 on, no reset
node ~/Developer/dime/scripts/autopilot.mjs --only 4       # one beat (re-take), no reset
node ~/Developer/dime/scripts/autopilot.mjs --record       # also writes /tmp/dime-video/reference.webm
```

Other flags: `--reset` (reset even when starting later), `--no-reset`, `--dark`, `--hold` (keep the window open at the end). It opens its own chrome-less Chrome app window (1440×900 viewport, deviceScaleFactor 2, fresh profile), drives everything with a visible cursor dot, and fires demo events through the API, so no panel is on screen. Each beat walks to its own screen first, so `--beat`/`--only` work from any state; numbers depend on what ran before.

**Re-takes:** blackjack, the market and the goal finale are one-shot per reset (the market refuses a second identical claim; the goal is gone after Order it). To redo one of them cleanly: `node ... --beat 1 --pause` and press Enter quickly through the earlier beats, or reset and run from 1. Beats 1–3, 7, 8 are safe to repeat.

## Shot list

Durations are the edited cut. "Raw" is what the autopilot takes.

| # | On screen | Action (autopilot) | Voiceover | Cut |
|---|---|---|---|---|
| 0 | Title on black or over a blurred dashboard: "Budgeting apps are dashboards you open twice." | (editing only) | "Every budgeting app is a dashboard you open twice and forget. What if your CFO just texted you, like a friend?" | 0:00–0:07 |
| 1 | The Dime chat. Three weeks of real texting scroll by: milestones, a blackjack win, the DoorDash vent, the Tokyo goal. Sidebar: "$311 left today". | Scrolls the thread to the top and back down. Raw ~11s. | "This is Dime. It lives in your texts. It's been watching my money for three weeks." | 0:07–0:15 |
| 2 | Charles types `how much did I spend on food this week?` Dime: "$215.84 on food this week. Nopa alone was $94.25…" | Types, waits for the reply. Raw ~12s. | "Ask it anything. Real answer, real numbers from my bank, and a little attitude." | 0:15–0:24 |
| 3 | `girl math this $90 dinner` → one-line reaction + the girl math card: Skip it vs Buy it bars, the iPhone date sliding, hours of work. | Types, waits, rests the cursor on the card. Raw ~13s. | "Every price is girl math: that dinner is my iPhone two days later." | 0:24–0:33 |
| 4 | `should I buy these sneakers for $280?` → "it fits, but… beat me and they're on the house", the blackjack card deals. Cursor taps **Stand**; the hole card flips; Dime draws; "Lost. $280 → S&P 500". Dime: "house wins 😌 but that $280 just became S&P 500 money". Sidebar rolls down. | Rigs a loss (`force-blackjack lose`), types, reads the hand 2s, Stand, waits for Dime's line. Raw ~25s. | "Want sneakers? Play the CFO for them. Win, they're free. Lose…" (beat) "…and the $280 goes straight into the S&P 500. Either way I win." | 0:33–0:55 |
| 5 | Dime texts first: "found 3 things" + three CFO cards (Comcast, Hulu, idle cash). Cursor taps **Call Comcast**: "Approved · calling Comcast…" → "✓ Back to $47/mo. Saving $23/mo." + a follow-up card. | `cfo-scan` via API, read 2.6s, tap. Raw ~17s. | "It texts me first when it finds money. One tap, it calls Comcast. Twenty-three bucks a month, back." | 0:55–1:09 |
| 6 | **The Group.** Charles types `Will Penny spend $80 on DoorDash today?` Dime opens a market; Penny bets No, Maya Yes, Sam No; the split bar rolls. Charles taps **$10**, **Yes**. Penny swipes DoorDash $38 ("$42 to go 👀"), then $52: YES wins, payouts for all four, losers fade, the sidebar's today number goes up. | Types, waits for all bets, taps, then `friend-swipe` 38 and 52 via API. Raw ~45s. | "Add it to the group chat and it runs bets on your friends. Penny swears she's done with DoorDash. Dime makes a market. Her bank settles it." (on settle) "Penny swiped. I'm up six bucks, and it goes in my budget." | 1:09–1:38 |
| 7 | **Dashboard.** Left today, goal ring, spending, "In, last 7 days +$5,425 / Out −$2,090 / Net". Cursor taps today on the heat map: "$37 left", "Lost at blackjack → VOO $280", "Comcast back to $47/mo", "Won the group bet $6". Then ‹ to September: a full green/red month. Taps Sep 12: "$141 over, of $305 budget" and every transaction that did it. | Navigates, rests on the week strip, taps today, pages back, taps the worst day. Raw ~22s. | "When I do want the big picture: everything today did, in one place. And every day against its budget. Red's where I blew it. Sep 12, $141 over. Tap it, see exactly why." | 1:38–1:55 |
| 8 | **Investments** tab: total invested, the line chart (cursor scrubs it), funds, and "where it came from": every lost hand and leftover. | Clicks Investments, scrubs the chart, rests on the sources. Raw ~9s. | "And every loss, every leftover dollar, it's all invested. My bad habits are building a portfolio." | 1:53–2:02 |
| 9 | Back to Dime. The 100% milestone: "the $311 you didn't spend today just finished it off 😭", the goal ring springs to 100%, **Order it**. Cursor taps it: "Ordering from Apple…" → "✓ Ordered. iPhone 17 Pro arrives Thursday." → "Tokyo trip is next." | `fill-goal` via API, waits for the button, taps. Raw ~20s. | "And the whole point: every dollar I didn't spend went to the iPhone. It just texted me: it's paid off. One tap. Arrives Thursday." | 2:02–2:17 |
| 10 | End card: Dime logo + "ChatGPT can read your bank account. Dime texts you first, acts for you, and turns saving into a game." | (editing only; the autopilot holds the last frame 4s) | "ChatGPT can read your bank account. Dime texts you first, acts for you, and makes saving a game." | 2:17–2:25 |

Skipped on purpose: Accounts/Settings (fine but not a wow; add a 3s cut of the Chase connect ring only if you're under 2:15), the Blue Bottle beat and midnight (they show restraint, which needs explaining; no time).

## Editing plan

- **Cut every wait.** Speed-ramp typing to 2–3× (keep the first few letters real speed). Cut the typing dots to under 0.5s; keep them visible once in beat 2 so it reads as a live model.
- **Keep real speed** for: the blackjack flip and Dime's draw, the Comcast "calling" dots → check, the market settle (payout rows + fade), the goal ring spring and "Ordered".
- **Zooms (3), 1.4–1.6× ease-in, hold, ease-out:** the blackjack card from deal to "Lost. $280 → S&P 500"; the market card as it settles (payout rows); the heat-map calendar when the day opens. Optional 4th: the sidebar number rolling up after the market.
- **Captions** (lower third, big, one at a time) for key numbers: "$215.84 on food, real bank data", "Lose = $280 invested", "+$23/mo, one tap", "Bank data settles the bet", "Every loss → S&P 500", "iPhone paid off".
- Music: low, upbeat, ducked under the voice. No transitions besides hard cuts and the zooms.
- Export 1440×900 or crop to 16:9 (1440×810, crop the bottom 90px of empty input area only on chat beats; leave the dashboard uncropped and letterbox) at 60 fps if the recording was 60.

## Model latency

Luna replies in about 1.5–4s; the market's friend bets roll over about 8s; the goal finale takes about 8s to its button. The autopilot waits until nothing is typing and no new message lands for 1.8–3.5s, then holds a beat, so it never cuts a reply short. If the model is down, every beat falls back to scripted lines after at most 6s with the same numbers (typed questions other than the sneakers can wait up to 20s).
