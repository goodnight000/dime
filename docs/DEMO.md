# Dime: pitch demo script

Two windows. The audience sees the **app** (`http://localhost:5174/`, 1440×900). You drive from the **panel** (`http://localhost:5174/demo`) in a second window, by button or key. Keys are ignored while an input has focus.

Rehearsed end to end on 2026-10-04 in light and dark: about 2:15 of system time, so about 3:30 with talking. Every Dime line is written live by the model; if the model is slow or wrong, the scripted line goes out instead (after at most 6s). Numbers always come from the server.

## Before you start

1. Check the server is up: the panel's clock line shows a time, not "server down". If it's down: `cd ~/Developer/dime && nohup bun run dev > /tmp/dime-dev.log 2>&1 &`.
2. Panel: **Reset** (`R`, then `R` again within 1.5s). The demo day restarts at **9:30 AM, Oct 4**, $311 today, goal 59%.
3. Reload the app window. It should open on the Dime chat, ending with last night's "$95 left. moved to the iPhone 📱 59%".
4. Panel: set **Blackjack next hand** to **Lose** (`L`). The rig has to be set *before* the hand is dealt.

## Beats

| # | You do | The audience sees | Wait |
|---|---|---|---|
| 1 | Panel **Morning** (`M`) | Dime: "morning ⛅ $311 today…" then the today card: $311, Cloudy, Verizon $45 Tue. Sidebar: "$311 left today". | ~2s to the first bubble |
| 2 | Panel **Blue Bottle matcha $7** (`1`) | Today card rolls $311 → $304; Dime: "Blue Bottle $7. $304 left today." + girl math ("iPhone 17 Pro 1 day later"); then one news line with a short `site ↗` link (Exa, real newsrooms only). | ~2s, news ~3s later |
| 3 | Type in the app: `should I buy these sneakers for $280?` (or panel **Sneakers $280**, `S`) | Dime: "$280 fits in your $304 today… beat me and it's on the house" then the blackjack card deals. | card ~3s |
| 3b | In the card: **Stand** (or Hit first) | Hole card flips, Dime draws; "Lost. $280 is waiting for a fund." Dime: "house wins… pick a fund 👇" + fund picker. Sidebar drops to $24. | ~2s after the outcome |
| 3c | In the fund card: **Send $280 to S&P 500** | "✓ Losses go to S&P 500 (VOO)." The blackjack card's line changes to "Lost. $280 → S&P 500". Dime: "$280 into the S&P 500…" | ~2s |
| 4 | Panel **Scan** (`C`) | Dime: "found 3 things…" + three CFO cards (Comcast, Hulu, idle cash). | ~1.5s, cards over ~3s |
| 4b | On the Comcast card: **Call Comcast** | "Approved · calling Comcast" with dots, 3.2s, then "✓ Back to $47/mo. Saving $23/mo." Dime: "Comcast is back to $47/mo…" + a follow-up card offering the $23/mo to the iPhone (leave it, or **Send $23/mo** for an extra goal fill). | ~5s |
| 5 | Click **The Group** in the sidebar. Type `Will Penny spend $80 on DoorDash today?` (or panel **Post Penny claim**, `P`) | Dime restates the rule + market card; Penny opts in on No, Maya bets Yes, Sam No; the split bar and pots roll after each. | card ~3s, all bets ~15s |
| 5b | In the market card: **$10**, then **Yes · $10** | "You: $10 on Yes · Pays about $16". Penny: "charles really bet against me. noted". | ~3s |
| 5c | Panel **Penny DoorDash $38** (`4`) | Dime: "Penny just hit DoorDash for $38. $42 to go 👀", Maya: "LMAOOO". | ~3s |
| 5d | Panel **Penny DoorDash $52** (`5`) | Dime calls it ("YES wins… Maya +$9, Charles +$6. Penny and Sam, pay up"), then the sidebar number rolls $24 → $30 (a blue dot lands on Dime), then the market card again at the bottom, which settles in view: payout rows for all four, the losing side fades; Penny and Maya react. | ~6s |
| 6 | Click **Dime** in the sidebar | DM: "your Penny bet hit 💸 +$6", "$30 left today". | instant |
| 7 | Panel **Midnight** (`N`) | Dime: "$30… moved to the iPhone 17 Pro", "62% saved, 1 day closer" + the goal card filling 59% → 62%. | ~2s, fill ~1s |
| 8 | Click **Dashboard** | Today, pool, goal 62%, invested total with the step line, VOO row (includes the $280), spending, calendar. | instant |
| 9 | Panel **Disconnect** (`X`), then click **Accounts**, then **Connect** on Chase | Ring draws in three ticks, "Opening Chase → Verifying it's you → Reading 90 days", check badge, recent transactions slide in. | ~3s |
| 10 | Click **Dime**. Panel **Fill goal** (`G`) | Dime: "$311… fund is full at $1,099", "want me to order it now?" + the goal card rising to 100% with one spring, then **Order it / Not yet**. | ~2s, fill ~1.5s |
| 10b | In the card: **Order it** | "Ordering from Apple" with dots, then "✓ Ordered. iPhone 17 Pro arrives Thursday." Dime: "…$1,099 came from the goal fund, so today didn't move", "what are we saving for next?" End here. | ~3s |

Dashboard and Accounts come before the goal finale on purpose: after **Order it** the goal resets to $0 (there's no next goal yet), so the dashboard would show 0%.

## If something goes wrong live

| Problem | Do this |
|---|---|
| Dime is slow (model lag) | Keep talking. The scripted line goes out after at most 6s, numbers identical. Replies to typed messages that aren't the sneakers question can take up to 20s before the template answers. |
| Model gateway is down | Nothing to do: every beat falls back to the scripted lines instantly. They're plainer but correct. |
| Blackjack went the wrong way | The rig only applies when set before asking. Set **Lose**/**Win** in the panel and ask again with `S`. A win is fine too: "Dime busts. Sneakers are on the house." Then skip 3c; the CFO idle-cash card will ask for a fund instead. |
| No blackjack card after the sneakers question | Press `S` in the panel (posts the same line for you). |
| A card looks stuck mid-animation | Reload the app window. Cards redraw from the server's state, settled. |
| A CFO card says "Didn't go through." | Tap **Retry**. |
| No market after the Penny claim | Press `P` in the panel. A second claim on the same thing gets "There's already a market…" rather than a duplicate. |
| Short on time in the group | Skip 5c. Use the panel's custom friend swipe: Penny, DoorDash, 90 → settles at once. |
| Fill goal shows the wrong state | `G` works from any state: it tops the goal up to one sweep short and runs midnight. |
| Total mess | `R` twice, reload the app, set **Lose**, start over (beats 1 to 3 take under 30s). |

## Notes

- Tone: panel **Nice/Savage** (`T` flips). Typing "be nicer to me pls" in the chat does the same through Dime.
- The demo clock only moves forward (midnight, fill goal). Reset is the only way back to 9:30 AM.
- The server is in-memory: saving a server file restarts it under `bun --watch` and resets the demo. Don't edit code during the pitch.
