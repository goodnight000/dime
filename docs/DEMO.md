# Dime: pitch demo script

Two windows. The audience sees the **app** (`http://localhost:5174/`, 1440×900). You drive from the **panel** (`http://localhost:5174/demo`) in a second window, by button or key. Keys are ignored while an input has focus.

Rehearsed end to end at 3pm on 2026-10-04 (light, then dark): about 1:55 of system time, so about 3:30 with talking. Every Dime line is written live by the model; if the model is slow or wrong, the scripted line goes out instead (after at most 6s). Numbers always come from the server.

Dime only texts first when it helps: going over (or nearly over) today, a big or unusual swipe, a habit running hot, goal milestones (25/50/75/90/100%), streak milestones, and the simulated bank events. The morning, the midnight sweep and ordinary swipes are silent; today's number lives in the sidebar and dashboard. Say this out loud at beat 2: it's the point.

## Before you start

1. Check the server is up: the panel's clock line shows a time, not "server down". If it's down: `cd ~/Developer/dime && nohup bun run dev > /tmp/dime-dev.log 2>&1 &`.
2. Panel: **Reset** (`R`, then `R` again within 1.5s). The demo day restarts at **9:30 AM, Oct 4**, $311 today, goal 59%.
3. Reload the app window. It opens on the Dime chat: three weeks of real texting you can scroll back through (the 25% and halfway milestones, a blackjack win and loss, the DoorDash vent, the Tokyo goal), ending last night with "movie was mid". Losses already go to the S&P 500: he picked it after losing the Fred Again tickets on Sep 24 (scroll up to show it).
4. Panel: set **Blackjack next hand** to **Lose** (`L`). The rig has to be set *before* the hand is dealt.

## Beats

| # | You do | The audience sees | Wait |
|---|---|---|---|
| 1 | Type in the app: `how much can I spend today?` | Dime answers like a friend with $311 (worded live from its tools). Sidebar: "$311 left today". | ~4s |
| 2 | Panel **Blue Bottle matcha $7** (`1`) | Nothing in the chat, on purpose: a $7 matcha isn't news. The sidebar rolls $311 → $304. ("It doesn't text you about coffee. It texts you when it matters.") | ~2s |
| 3 | Type in the app: `should I buy these sneakers for $280?` (or panel **Sneakers $280**, `S`) | Dime: "$280 fits today, but it pushes the iPhone 17 Pro 4 days later… beat me and they're on the house", then the blackjack card deals. | card ~4s |
| 3b | In the card: **Stand** (or Hit first) | Hole card flips, Dime draws; "Lost. $280 → S&P 500" (his fund since Sep 24). Dime: "house wins 😌 but that $280 just became S&P 500 money…". Sidebar drops to $24. | Dime's line ~4s after Stand; wait for it before 3c |
| 3c | Optional. Type: `where do my losses go? show me the options` | Dime: "right now they land in the S&P 500…" + the fund picker with each fund's description and risk. Leave it, or tap a fund to switch. (Code opens the card for this phrasing every time.) | ~2s |
| 4 | Panel **Scan** (`C`) | Dime: "found 3 things…" + three CFO cards (Comcast, Hulu, idle cash). | cards land by ~4s |
| 4b | On the Comcast card: **Call Comcast** | "Approved · calling Comcast" with dots, 3.2s, then "✓ Back to $47/mo. Saving $23/mo." Dime: "Comcast is back to $47/mo…" + a follow-up card offering the $23/mo to the iPhone (leave it, or **Send $23/mo** for an extra goal fill). | ~7s |
| 5 | Click **The Group** in the sidebar. Type `Will Penny spend $80 on DoorDash today?` (or panel **Post Penny claim**, `P`) | Dime restates the rule + market card; Penny opts in on No, Maya bets Yes, Sam No; the split bar and pots roll after each. | card ~3.5s, all bets ~8s |
| 5b | In the market card: **$10**, then **Yes · $10** | "You: $10 on Yes · Pays about $16". Penny: "charles really bet against me. noted". | ~3s |
| 5c | Panel **Penny DoorDash $38** (`4`) | Dime: "Penny just hit DoorDash for $38. $42 to go 👀", Maya: "LMAOOO". | ~3s |
| 5d | Panel **Penny DoorDash $52** (`5`) | Dime calls it ("YES wins… Maya +$9, Charles +$6. Penny and Sam, pay up"), then the sidebar number rolls $24 → $30 (a blue dot lands on Dime), then the market card again at the bottom, which settles in view: payout rows for all four, the losing side fades; Penny and Maya react. | ~10s |
| 6 | Click **Dime** in the sidebar | DM: "your Penny bet hit 💸 +$6 free money…" | instant |
| 7 | Panel **Midnight** (`N`) | Nothing in the chat: the $30 left moves to the iPhone silently (59% → 62% crosses no milestone); it's now Monday, Oct 5 and the sidebar resets to $311. Scroll up to the 25% and halfway texts if you want to show what a milestone looks like. | instant |
| 8 | Click **Dashboard** | The silent sweep shows here: goal 62%, today, pool, invested total with the step line, VOO row (includes the $280), spending, calendar. | instant |
| 9 | Panel **Disconnect** (`X`), then click **Accounts**, then **Connect** on Chase | Ring draws in three ticks, "Opening Chase → Verifying it's you → Reading 90 days", check badge, recent transactions slide in. | ~3s |
| 10 | Click **Dime**. Panel **Fill goal** (`G`) | The 100% milestone: Dime: "the $311 you didn't spend today just finished it off 😭", "want me to order it?" + the goal card rising to 100% with one spring, then **Order it / Not yet**. | ~8s to the buttons |
| 10b | In the card: **Order it** | "Ordering from Apple" with dots, then "✓ Ordered. iPhone 17 Pro arrives Thursday." Dime: "…the goal fund covered the $1,099, today's $311 stays untouched", then "Tokyo trip is next" (the goal he queued on Sep 22). End here. | ~5s |

Dashboard and Accounts come before the goal finale on purpose: after **Order it** the iPhone is gone and Tokyo becomes the goal at a few percent, so the dashboard would lose its 62% ring.

## If something goes wrong live

| Problem | Do this |
|---|---|
| Dime is slow (model lag) | Keep talking. The scripted line goes out after at most 6s, numbers identical. Replies to typed messages that aren't the sneakers question can take up to 20s before the template answers. |
| Model gateway is down | Nothing to do: every beat falls back to the scripted lines instantly. They're plainer but correct. |
| Blackjack went the wrong way | The rig only applies when set before asking. Set **Lose**/**Win** in the panel and ask again with `S`. A win is fine too: "Dime busts. Sneakers are on the house." |
| No blackjack card after the sneakers question | Press `S` in the panel (posts the same line for you). |
| A card looks stuck mid-animation | Reload the app window. Cards redraw from the server's state, settled. |
| A CFO card says "Didn't go through." | Tap **Retry**. |
| No market after the Penny claim | Press `P` in the panel. A second claim on the same thing gets "There's already a market…" rather than a duplicate. |
| Short on time in the group | Skip 5c. Open **More controls** in the panel, friend swipe: Penny, DoorDash, 90 → settles at once. |
| Fill goal shows the wrong state | `G` works from any state: it tops the goal up to one sweep short and runs midnight. |
| Total mess | `R` twice, reload the app, set **Lose**, start over (beats 1 to 3 take under 30s). |

## Notes

- The panel shows only the on-stage beats; **More controls** holds the rest (Morning, other swipes, simulated events, Skip day, Reconnect). Their keys work while it is closed. Reset is top right.
- Panel **Morning** (`M`) only moves the clock to 8:00 now; there's no morning text. **Swipe** buttons stay silent unless the swipe is big, unusual, or takes him over (or under 20% of) today.
- Tone: panel **Nice/Savage** (`T` flips). Typing "be nicer to me pls" in the chat does the same through Dime.
- The demo clock only moves forward (midnight, fill goal). Reset is the only way back to 9:30 AM.
- The server is in-memory: saving a server file restarts it under `bun --watch` and resets the demo. Don't edit code during the pitch.
