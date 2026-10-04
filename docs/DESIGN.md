# Dime: design spec

The build spec for every surface. Implementers follow it to the letter; where it is silent, follow Forth (`~/Developer/forth-frontend/DESIGN.md`, `web/src/theme.css`). Values come from the ramps in §1. If a value you need is not here, use the nearest ramp step and note it in your report rather than inventing a new one.

Standing rules, in order of precedence when they collide:

1. **One motion at a time.** Only the element doing the work moves. Sequences are sequential (A ends, B starts), never parallel, unless two properties are one idea (a liquid rising and its % rolling).
2. **Nothing reflows.** Every card has a fixed block size per kind; states swap inside it. Pages reserve space for their data before it arrives.
3. **Animate diffs, not loads.** First paint of anything (page load, reload, navigating back) shows the final state, still. Motion plays only for a change observed in this session.
4. **No ornament.** No gradients-as-decoration, glows, glass, shimmer skeletons, emoji headers, pill buttons, letter-spaced uppercase labels, hint text. Lists are dividered rows in one container.
5. **Reduced motion = finished state, still.** Forth's global `prefers-reduced-motion` rule stays. JS sequences check `reduced()` (§1.6) and skip their timers too.

---

## 1. Global

### 1.1 Tokens Dime adds

Add to `:root`, `:root[data-theme="dark"]`, and the `prefers-color-scheme: dark` block (all three, Forth's pattern). Nothing else is added globally; blackjack's card-paper palette is scoped to the card (§3.1).

```css
:root {
  /* money: positive amounts, goal liquid, YES side, "under budget" */
  --money: #1f7a4c;
  /* felt: the blackjack table */
  --felt: #22604a;
  --felt-deep: #194a39;      /* card backs, shoe */
  --felt-fg: #eef2ec;        /* text on felt */
  --felt-muted: color-mix(in srgb, var(--felt-fg) 66%, var(--felt));
  /* type steps above Forth's step-2, for hero numbers only */
  --step-3: 3.5rem;
  --step-4: 5.5rem;
  /* motion (Forth keeps --ease-out, --quick, --move) */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --spring: linear(0, 0.18 4%, 0.56 11%, 0.86 18%, 1.03 26%, 1.07 32%, 1.06 39%, 1.02 50%, 0.995 63%, 1);
  --t-press: 120ms;
  --t-spring: 400ms;
  --t-slow: 480ms;
  --t-data: 900ms;
  --card-pad: 0.85rem;       /* = bubble text inset, so card text lines up with bubble text */
}
/* dark (both blocks) */
  --money: #74c495;
  --felt: #24493b;
  --felt-deep: #1b382d;
  --felt-fg: #dfe5de;
```

Existing tokens and what Dime uses them for: `--amber` = gold (no-spend days, weather focal part), `--danger` = over budget and the NO side, `--blue` = you (your bubbles, selection, your avatar), `--green` = status dots only (Forth), `--violet`/`--cue` = friend tones.

**Fund colours** (charts, swatches) map to existing tokens; no new palette: VOO `--fg`, QQQ `--blue`, SOXX `--money`, DRAM `--amber`, Cash `--muted`.

**People tones** are fixed for the cast, not hashed, so no friend collides with a money colour: Charles `--blue`, Penny `--amber`, Maya `--violet`, Sam `--cue`. Dime is its face (`#cue`), never initials. (`people.ts` gets a `CAST` map checked before the hash.)

### 1.2 Type

Instrument Sans 400/500/600 only. Scale (rem): `--step--2` .75 · `--step--1` .875 · `--step-0` 1.0625 · `--step-1` 1.5 · `--step-2` 2.25 · `--step-3` 3.5 · `--step-4` 5.5.

| Use | Step | Weight | Tracking | Line-height |
|---|---|---|---|---|
| Meta, timestamps, captions, chart labels | −2 | 500 (meta) / 400 | 0 | 1.35 |
| Card body, row titles in cards, buttons | −1 | 400 / 600 buttons | 0 | 1.35 |
| Bubble text, page row titles | 0 | 400 / 500 | 0 | 1.35 |
| Hand totals, section figures | 1 | 500 | −0.02em | 1.1 |
| Page title, goal % | 2 | 500 | −0.03em | 1.05 |
| Today card hero, phone dashboard hero | 3 | 500 | −0.04em | 1 |
| Desktop dashboard hero | 4 | 500 | −0.045em | 1 |

Section heads (`h2`) are step-0 600. No uppercase anywhere except card ranks.

### 1.3 Spacing and radii

Ramp: `--s1` 4px · `--s2` 8px · `--s3` 16px · `--s4` 24px · `--s5` 40px · `--s6` 64px. Inside cards also `--card-pad` (.85rem, the bubble's text inset). Nothing else.

Radii: bubble 18px · pane 18px · rows container 14px (`--radius`) · inner surface inset 6px in a bubble → 12px · button inset 10px in a bubble → 8px · chips 8px · playing card 4px · calendar cell 8px · bars 3px (half their 6px height). Rule: inner = outer − gap, always.

### 1.4 Numerals and money

- Every number: `font-variant-numeric: tabular-nums`. Verify in the polish pass that Instrument Sans honours `tnum` (compare widths of "111" and "000"); the roll component (§1.5) uses fixed `1ch` columns, so hero numbers stay steady either way.
- Format with `Intl.NumberFormat("en-US")`. Today's number, goal amounts, pots, stakes: whole dollars (`$43`, `$1,099`). Ledger and fund values: cents (`$1,284.50`). Never mix within one view.
- Negatives and debits use the real minus `−` (U+2212). Deltas carry a sign: `+$12` in `--money`, `−$7` in `--muted`. Red is only for over budget and the NO side, never for an ordinary purchase.
- Arrows in copy are `→` (U+2192): `$280 → S&P 500`.
- **Hero money (step-2 and up):** `$` at 0.5em of the digits, same colour and weight, top-aligned to the digit cap height (`.cur` in §1.5), gap 0.04em. Body-size money: `$` at full size, no treatment.
- Percent in heroes: `%` at 0.5em, same top alignment as `$`.

### 1.5 The number roll (every changing balance)

One component, `web/src/num.ts`, used for: sidebar today line, today card hero, dashboard hero and figures, goal %, goal saved amount, market pots, hand totals, ledger total. Not used in text bubbles or the demo panel (instant there).

Behaviour:
- Same character count: each digit column rolls to its new digit (`--d`), `--t-slow` `--ease-out`. Columns that don't change don't move. Separators and `$` are static.
- Character count changes (`$9` → `$12`, `$1,000` → `$999`): the whole number crossfades: old out 120ms opacity, new in 200ms opacity + `translate: 0 0.12em → 0`. No width animation; the slot holding the number is sized for the longest value it will show (e.g. today hero `min-width: 4ch`) so neighbours never move.
- First render: no motion. Reduced motion: instant swap.
- Accessibility: the container carries `aria-label` with the formatted value; columns are `aria-hidden`.

```ts
// web/src/num.ts — reference implementation
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const usd = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD",
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
    .format(n).replace("-", "−");

const strip = `<span class="strip">${"0123456789".split("").map((d) => `<span>${d}</span>`).join("")}</span>`;
function build(el: HTMLElement, text: string) {
  el.innerHTML = [...text].map((c) =>
    /\d/.test(c) ? `<span class="dg" style="--d:${c}">${strip}</span>`
    : c === "$" || c === "%" ? `<span class="cur">${c}</span>` : `<span class="ch">${c}</span>`).join("");
}
/** Set el to text, rolling the digits that changed. */
export function roll(el: HTMLElement, text: string) {
  const prev = el.dataset.v;
  el.dataset.v = text;
  el.setAttribute("aria-label", text);
  if (prev === undefined || prev === text || reduced()) return void (prev !== text && build(el, text));
  if (prev.length !== text.length) {
    el.classList.add("swap-out");
    setTimeout(() => (build(el, text), el.classList.replace("swap-out", "swap-in"),
      setTimeout(() => el.classList.remove("swap-in"), 200)), 120);
    return;
  }
  [...text].forEach((c, i) => { if (/\d/.test(c)) (el.children[i] as HTMLElement).style.setProperty("--d", c); });
}
```

```css
.num {
  display: inline-flex;
  align-items: flex-start;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.num .dg { width: 1ch; height: 1.1em; overflow: hidden; }   /* no mask: Forth bans masks on moving things */
.num .strip {
  display: flex; flex-direction: column;
  transform: translateY(calc(var(--d) * -1.1em));
  transition: transform var(--roll-dur, var(--t-slow)) var(--roll-ease, var(--ease-out));
}
.num .strip > span, .num .ch { height: 1.1em; }
.num.hero .cur { font-size: 0.5em; line-height: 1; margin: 0.3em 0.08em 0 0; } /* tune top to cap height by screenshot */
.num.hero .cur:last-child { margin: 0.3em 0 0 0.04em; }                       /* trailing % */
.num.swap-out { opacity: 0; transition: opacity 120ms ease; }
.num.swap-in { animation: num-in 200ms var(--ease-out); }
@keyframes num-in { from { opacity: 0; translate: 0 0.12em; } }
```

### 1.6 Motion system

One easing family, one ladder. Export the same numbers to JS from `web/src/motion.ts` (`export const T = { press: 120, quick: 200, move: 320, spring: 400, slow: 480, data: 900 }` and `reduced()`), so sequences time themselves off the same values the CSS uses.

| Token | Value | Curve | Used for |
|---|---|---|---|
| `--t-press` | 120ms | ease-out | `:active` scale, outgoing half of a swap |
| `--quick` | 200ms | ease | hover/colour, incoming half of a swap |
| `--move` | 320ms | `--ease-out` (0.2,0.8,0.2,1) | bubble/card arrival, screen rise, row dim |
| `--t-spring` | 400ms | `--spring` (≈7% overshoot) | small things landing: tapback, avatar joining, radio dot, check badge |
| `--t-slow` | 480ms | `--ease-out` for travel in; `--ease-in-out` for on-screen morphs | card deal, hole-card flip, digit roll, split bar |
| `--t-data` | 900ms | `--ease-in-out` | goal liquid fill, chart line draw (once) |

- Entering: ease-out. Moving/morphing on screen: ease-in-out. Colour: ease. Never ease-in.
- Exits are faster than entrances (120–200ms).
- Animate only `transform`/`translate`/`scale`/`rotate`/`opacity` (plus `clip-path` on the split bar). Never `height`, `width`, `margin`, `top`. No `filter`/`backdrop-filter` on anything that moves.
- Prefer transitions for state (interruptible); keyframes only for one-shot arrivals (bubble pop, deal).
- Stagger: 140ms between dealt cards; 40ms between rows entering a list. Stagger never blocks input except where stated (blackjack, §3.1).

### 1.7 Control states (everywhere unless a card overrides)

| State | Rule |
|---|---|
| Hover | Only under `@media (hover: hover) and (pointer: fine)`. Background/colour change, `--quick`. No movement on hover inside cards. |
| Active | `scale: 0.97`, `--t-press` ease-out; release `--quick`. Icon buttons keep Forth's 0.92. |
| Focus-visible | `outline: 2px solid var(--fg)`, offset 2px inside cards and 3px on pages. On felt: `var(--felt-fg)`. |
| Disabled | `opacity: 0.4`, `cursor: default`, no hover/active. |
| Busy (request > 400ms) | Label crossfades to three 4px dots (Forth `dot` keyframe); control `aria-busy="true"`, not clickable. Under 400ms show nothing. |
| Failed action | The card's outcome slot shows `--danger` text "Didn't go through." + a `.link` "Retry". No toast. |

### 1.8 The swap slot (shared by every card)

Every in-place state change uses one pattern: all states stacked in one grid cell, so the cell is always as tall as its tallest state. Old state out, then new state in.

```css
.slot { display: grid; }
.slot > * {
  grid-area: 1 / 1;
  opacity: 0; translate: 0 4px; visibility: hidden; pointer-events: none;
  transition: opacity var(--t-press) ease, translate var(--t-press) ease, visibility 0s linear var(--t-press);
}
.slot > .on {
  opacity: 1; translate: none; visibility: visible; pointer-events: auto;
  transition: opacity var(--quick) ease var(--t-press), translate var(--quick) var(--ease-out) var(--t-press), visibility 0s;
}
```

---

## 2. Chat thread

Forth's Messages grammar unchanged (runs, tails, day lines, Delivered, Not Delivered, jumbo emoji, reply quotes, numbered choices as chips). Changes and additions only.

### 2.1 Contract for `chat.ts` (required for any card motion to work)

- **Never detach unchanged nodes.** The 1s poll must not `replaceChildren` the whole list: detaching cancels in-flight transitions and restarts keyframes (a deal mid-flight would snap). Keep keyed `li`s in place; insert new nodes at their position, remove gone ones, update classes in place.
- **Don't clear a card's `li` on version change.** The renderer owns its children and diffs against its own last state: each renderer keeps `WeakMap<HTMLElement, State>`; no previous state = draw final, still; previous state = animate the diff.
- App bubbles get no hover action bar and no tapbacks (they're objects, not text). Already excluded in `target()`; keep it.

### 2.2 Arrival

| Event | Motion |
|---|---|
| Dime's (or a friend's) bubble arrives | Thread scrolls to bottom **instantly**, then the bubble pops: `from { opacity: 0; transform: translateY(6px) scale(0.96) }`, `--move` `--ease-out`, origin bottom left. |
| Your bubble on send | Instant scroll, then `from { opacity: 0; transform: translateY(10px) scale(0.96) }`, `--move` `--ease-out`, origin bottom right. Composer clears the same frame. Sending state opacity 0.6 (Forth). |
| Typing indicator → reply | The reply takes the indicator's slot in one frame (indicator removed, bubble pops). The indicator itself pops in like a bubble; never fades out. |
| Several bubbles in one poll | Each pops in turn, 120ms apart, top to bottom. |

- Only follow (scroll) when within 80px of the bottom (Forth), or on your own send. If not following, nothing moves.
- Server paces replies so the indicator never flashes: reply delay = `clamp(700, 400 + 18 × chars, 1800)` ms. Cards: 900ms.
- Bottom padding of the thread: `--s3`, so the last bubble never touches the composer edge.

### 2.3 Tapback

- Pop: `from { opacity: 0; scale: 0.6 }`, `--t-spring` `--spring`, `transform-origin` = the corner touching the bubble (bottom right when the tapback sits on the bubble's top-left).
- Picker: Forth's (200ms `pop`, origin bottom-left/right). Buttons hover `scale: 1.15` `--quick`; press `scale: 0.92`.
- Changing your tapback: old glyph out 120ms opacity, new one pops. Removing: 120ms opacity out.

### 2.4 Mini app card bubbles (`.b.app`)

```css
.b.app {
  inline-size: min(22rem, 100%);          /* group thread: min(22rem, 100% - 2.4rem) for the avatar gutter */
  max-width: none;
  padding: 0;
  white-space: normal;
  overflow: hidden;                        /* no tail on cards */
  border-radius: 18px;
  background: var(--bg-2);
  block-size: var(--card-h);               /* fixed per kind, §3 */
  box-sizing: border-box;
}
.b.app.new { animation: card-in var(--move) var(--ease-out) both; transform-origin: bottom left; }
@keyframes card-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } }
```

- Design width is 352px (22rem); everything must also hold at 320px (phone group thread).
- Arrival is one motion; the card's own first motion (deal, fill, glyph) starts at arrival end + 80ms (`T.move + 80`).
- A text bubble from Dime usually precedes the card and carries the words; the card carries the object. Cards have no title that repeats the bubble.

### 2.5 Thread empty / error

- Empty Dime thread: never in the demo (seeded). Keep Forth's face + "Say hello to Dime".
- Poll failure: Forth's note line "Couldn't refresh messages. Retrying…" (reserved `.note` height, nothing moves).

---

## 3. Mini app cards

All cards: background `--bg-2` unless stated, text inset `--card-pad`, body step−1, meta step−2 `--muted`. Fixed `--card-h` per kind (all states fit; text clamps rather than grows).

| Kind | `--card-h` | Surface |
|---|---|---|
| blackjack | 19rem | `--felt` |
| funds | 24rem | `--bg-2` + inner `--pane` list |
| goal | 10rem (12.75rem with the order row) | `--bg-2` |
| today | 9.5rem | `--bg-2` |
| proposal | intrinsic on arrival, constant after (only its answer row swaps) | `--bg-2` (Forth `.b.ask`) |
| market | 16.5rem | `--bg-2` |

### 3.1 Blackjack

**Scoped palette** (inside `.bj` only):

```css
.bj {
  --card-paper: #fbfaf6; --card-edge: color-mix(in srgb, #000 12%, var(--card-paper));
  --suit-red: #c0413a;   --suit-black: #1a1a19;
  --cw: 3.25rem; --ch: 4.5rem; --fan: 1.875rem;   /* card 52×72, each next card 30px right */
}
/* dark: --card-paper: #e4e2db; --suit-red: #b3463f; (cards stay paper; slightly dimmed, not inverted) */
```

**Layout** (352 × 304, `background: var(--felt)`, `color: var(--felt-fg)`, `isolation: isolate`, `overflow: hidden`):

```
┌──────────────────────────────────────────┐
│ Sneakers · $280                 [shoe]▟  │  header 2.5rem, pad 0 card-pad; item step−1 600, " · $280" 500 felt-muted
│                                          │
│ [A♠][7♥][  ]                      Dime   │  dealer zone 5.5rem: grid 1fr 3.5rem
│                                     17   │  label step−2 felt-muted; total step-1 500 (.num)
│                                          │
│ [10♦][9♣]                          You   │  your zone 5.5rem
│                                     19   │
│ ┌──────────────┐ ┌──────────────┐        │  bottom slot 4.5rem: the swap slot (§1.8)
│ │     Hit      │ │    Stand     │        │  buttons 2.5rem tall, inset 10px, gap 8px, radius 8px
│ └──────────────┘ └──────────────┘        │
└──────────────────────────────────────────┘
```

- Zones: hands left-aligned at `--card-pad`; totals column right-aligned at `--card-pad`, label above number. Gap between zones 1rem. No divider line between zones.
- Dealer total shows the visible cards only until the flip. Soft hands: label reads "You · soft".
- **Shoe:** three card backs (2.5rem × 3.5rem, `--felt-deep`, 2px offsets down-left), positioned `top: -1.9rem; right: -0.5rem; rotate: -8deg`, clipped by the felt so ~1.6rem shows. Static. It is where cards come from.
- **Buttons:** "Hit", "Stand", equal weight: `background: color-mix(in srgb, var(--felt-fg) 14%, var(--felt))`, text `--felt-fg` step−1 600, hover 22%, active `scale: 0.97`, focus outline `--felt-fg`.

**Playing card face** (CSS + inline SVG, no images):

- 52×72, radius 4px, `background: var(--card-paper)`, `box-shadow: 0 0 0 1px var(--card-edge), -2px 0 4px -2px rgb(0 0 0 / 0.28)` (left-edge shadow separates fanned cards; static, never animated).
- Corner index top-left only (the fan covers the rest): rank at `top: 4px; left: 5px`, step−1 600, line-height 1, `letter-spacing: -0.02em` ("10" stays narrow); suit glyph 10px below it.
- Centre: A–10 one suit glyph 22px; J/Q/K the letter step-1 500 with a 12px suit under it. Hidden by the next card except on the last card; that's fine.
- Colour: hearts/diamonds `--suit-red`, spades/clubs `--suit-black`.
- Suits are inline SVG, `viewBox="0 0 24 24"`, `fill: currentColor; stroke: none` (override the global `svg` stroke/size rules):

```
spade   M12 2.5s-8 6.2-8 11a4 4 0 0 0 7 2.6V18l-1.5 3.5h5L13 18v-1.9a4 4 0 0 0 7-2.6c0-4.8-8-11-8-11z
heart   M12 21s-7.5-4.6-9.6-9.2C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.3 1.8-2.1 3.2-3.3 5.4-3.3 3.6 0 5.7 3.7 4.2 7.3C19.5 16.4 12 21 12 21z
diamond M12 2.5 19.5 12 12 21.5 4.5 12z
club    M12 3a4 4 0 0 0-3.1 6.5A4 4 0 1 0 11 16.4V18l-1.5 3.5h5L13 18v-1.6a4 4 0 1 0 2.1-6.9A4 4 0 0 0 12 3z
```

- **Card back:** `--felt-deep` with a 3px inset border of `--card-paper` at 85% and a fine hatch: `background: repeating-linear-gradient(45deg, var(--felt-deep) 0 3px, color-mix(in srgb, var(--felt-deep) 80%, #000) 3px 4px)`. (A real card back, not decoration.)

**Card DOM:**

```html
<div class="pc" style="--i:0; --dx:…; --dy:…; --delay:…">   <!-- position + deal travel -->
  <div class="pc-flip">                                     <!-- rotateY only -->
    <div class="face">…</div><div class="back"></div>
  </div>
</div>
```

**Deal and flip:**

```css
.bj .hand { position: relative; height: var(--ch); perspective: 700px; }
.bj .pc {
  position: absolute; left: calc(var(--i) * var(--fan)); top: 0;
  width: var(--cw); height: var(--ch);
}
.bj .pc.dealt { animation: deal var(--t-slow) var(--ease-out) var(--delay, 0ms) both; z-index: 5; }
@keyframes deal {
  from { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(-14deg) scale(0.92); }
}
/* --dx/--dy: JS sets shoe centre minus this card's slot origin, both in px relative to .bj */

.bj .pc-flip {
  position: absolute; inset: 0; transform-style: preserve-3d;
  transition: transform var(--t-slow) var(--ease-in-out);
}
.bj .pc.down .pc-flip { transform: rotateY(180deg); }
.bj .face, .bj .back { position: absolute; inset: 0; border-radius: 4px; backface-visibility: hidden; }
.bj .back { transform: rotateY(180deg); }
.bj .pc.flipping { animation: lift var(--t-slow) var(--ease-in-out); z-index: 1; }
@keyframes lift { 50% { translate: 0 -6px; scale: 1.04; } }   /* individual props: no clash with deal transform */

.bj .pc.out { animation: sweep 200ms var(--ease-out) calc(var(--i) * 30ms) forwards; }
@keyframes sweep { to { opacity: 0; transform: translateX(-1.5rem); } }
.bj .hand.lost .pc { opacity: 0.5; transition: opacity var(--move) ease; }
```

**Sequence** (all times from `T`, skipped entirely under `reduced()`):

| Moment | What moves | Timing |
|---|---|---|
| Card lands | `card-in` | 0–320ms |
| Initial deal | You, Dime (face up), you, Dime (`.down`, the hole card) | starts 400ms; 140ms stagger; each travel 480ms; done ≈1300ms |
| Totals | Each total rolls when its card lands (travel end), not at deal start | |
| Hit | One card from the shoe, then your total rolls | 480ms; input locked while in flight |
| Bust | Your total rolls to e.g. 22, label becomes "Bust"; then resolution | +360ms |
| Stand | Buttons dim to 0.4 (Dime's turn) → hole card flips (`.down` removed + `.flipping`) → dealer total rolls → each dealer hit deals 600ms apart → 400ms pause → resolution | flip 480ms |
| Resolution | Bottom slot swaps buttons → outcome (§1.8), then the losing hand dims to 0.5 | 120 + 200ms, dim +320ms |
| Push | Outcome "Push. Dealing again." holds 1200ms → all cards `.out` (30ms stagger) → 200ms → new deal, slot swaps back to buttons | |

- Input lock: while a card is in flight, Hit/Stand ignore clicks without dimming (the lock is < 500ms; dimming would flicker). Dimming is only for Dime's turn.
- The server holds the truth; the client compares previous vs new hands and animates only added cards, the flip (hole card revealed), and `round` changes (push → sweep + redeal).
- No card ever moves after it lands except the flip, the dim, and the push sweep.

**Outcome copy** (bottom slot, headline step−1 600 `--felt-fg`, sub-line step−2 `--felt-muted`):

| Result | Headline | Sub-line |
|---|---|---|
| Win | Won. Sneakers are on the house. | $280 doesn't touch today. |
| Blackjack | Blackjack. Sneakers are on the house. | $280 doesn't touch today. |
| Dime busts | Dime busts. Sneakers are on the house. | $280 doesn't touch today. |
| Lose | Lost. $280 → S&P 500 | Invested in VOO. Ledger updated. |
| Bust | Bust. $280 → S&P 500 | Invested in VOO. Ledger updated. |
| Lose, no fund yet | Lost. $280 is waiting for a fund. | Pick one below. (a `funds` card follows) |
| Push | Push. Dealing again. | — |

Item name, amount and fund come from state. The amount in the headline is tabular.

### 3.2 Funds picker

Master–detail inside the bubble: rows never change height; a fixed detail pane reads out the selected row. No accordion (accordions move the rows under them).

```
bubble --bg-2, 352 × 384
┌ inset 6px ──────────────────────────────┐
│ ┌ --pane list, radius 12 ─────────────┐ │
│ │ ◉  S&P 500  VOO          ▂▄▁▁       │ │  row 3.25rem: grid 1.125rem 1fr auto, gap s2, pad 0 card-pad
│ │    The 500 biggest US companies.    │ │
│ │─────────────────────────────────────│ │
│ │ ○  Nasdaq-100  QQQ       ▂▄▆▁       │ │
│ │ …  Semiconductors SOXX · Memory DRAM · Cash │
│ └─────────────────────────────────────┘ │
│  Good for money you won't touch for     │  detail pane 4rem, pad s2 card-pad, step−2
│  5+ years. Medium risk.                 │
├─────────────────────────────────────────┤
│        Send losses to S&P 500           │  answer row 2.75rem (Forth .answers, one button)
└─────────────────────────────────────────┘
```

- Row text: name step−1 600, ticker step−2 500 `--muted` on the same line; description step−2 `--muted`, one line, ellipsis.
- **Risk meter:** four bars 3px wide, heights 5/7/9/11px, gap 2px, radius 1px, bottom-aligned; filled count = level in `--fg`, rest `--rule`. Levels: Cash 1, VOO 2, QQQ 3, SOXX 4, DRAM 4. The meter has `aria-label="Medium risk"`; the word appears in the detail pane (a mark never travels without its word on screen).
- Rows: `role="radio"` in a `role="radiogroup"`; arrow keys move selection. VOO is preselected (the default the CFO would recommend), so the detail pane is never empty.
- Radio: 1.125rem circle, 1.5px `--muted` ring. Selected: ring and fill `--blue`, 0.4rem `#eeeeeb` centre dot that lands with `scale 0.6 → 1` `--t-spring` `--spring`.
- Selected row background `color-mix(in srgb, var(--blue) 9%, var(--pane))`, `--quick`. Hover (unselected) `color-mix(in srgb, var(--fg) 4%, var(--pane))`. First/last rows inherit radius 12px (inner = 18 − 6).
- Detail pane: content swaps with the slot pattern on selection change (out 120, in 200). Copy: "Good for …" line + "Low / Medium / High / Very high risk." + one honest fact (e.g. DRAM "New in Apr 2026. Narrow and volatile.").
- Answer button label tracks the selection ("Send losses to Nasdaq-100"), `--blue` step−1 600. Text change only; no motion.
- **Confirmed:** answer row swaps to outcome "✓ Losses go to S&P 500 (VOO)." (check icon `--money`); then unselected rows dim to 0.45 over `--move`; rows become inert.
- Fund copy (server owns it, suggested): VOO "The 500 biggest US companies." · QQQ "The 100 biggest Nasdaq companies, tech-heavy." · SOXX "US chipmakers. Big swings both ways." · DRAM "Memory chip makers. Launched Apr 2026." · Cash "High-yield savings. No swings."

### 3.3 Goals (ring + priority stack)

Goals are a priority list (`state.goals`): sweeps fill the first unfinished goal, overflow rolls to the next, so a queued goal's date counts the goals ahead of it. The visual has to work for anything (a phone, a trip, a fund), so it is not an object outline: it's **the goal ring** (`web/src/ring.ts` + `ring.css`), one component at three sizes.

```
352 × 160 card, pad card-pad, grid: 7rem | 1fr, gap s4, align center
  ╭────╮    iPhone 17 Pro                    step−1 600
 ╱ [] ╲   59%                              .num.hero step-2
│ face │   $650 of $1,099                   step−2 muted, tabular
 ╲    ╱   Saved by Oct 11                  step−1 (slot)
  ╰────╯    +$95 from Oct 3                  step−1 500 --money
```

- **Ring:** SVG, `viewBox 0 0 100 100`, two circles r=43 `pathLength=100`, stroke-width 9 (scales with `--rs`). Track `color-mix(in srgb, var(--fg) 9%, transparent)`; arc `--money`, round caps, `stroke-dashoffset: calc((1 - var(--p)) * 100)` with `transition: stroke-dashoffset var(--t-data) var(--ease-in-out)`. `.nil` hides the arc at 0% (no cap dot). Rotated −90deg so it starts at 12 o'clock.
- **Face:** the store's brand tile (`brands.ts`, `--bs: 44%` of the ring) when the goal is a thing he buys from a known brand (iPhone → Apple), else the goal's emoji at 34% of the ring.
- **Sizes:** chat card 7rem · dashboard top goal 5.5rem · queued rows 2rem · Settings rows 2.75rem (2.5rem at 390).
- **Sequence on a sweep:** card lands → "+$12 from Oct 4" pops (`--t-spring`) → 200ms → the arc sweeps from old `--p` to new while `%` and saved roll (`--roll-dur: var(--t-data)`; one idea) → date crossfades if it moved. Filling to 100% adds one settle spring on the ring (`--t-slow`).
- **Complete:** a goal with a store reads "Ready to order", note "Full", and the Order it / Not yet row (proposal answer pattern); ordering marks it done and the next goal becomes active. A goal with nothing to buy (fund, trip) reads "Done", no ask.
- **Stack (dashboard rail):** the first goal still in play large (ring 5.5rem + name / % step-2 / amounts / date), then the rest as dividered rows (no container): priority number step−2 muted | 2rem ring | name step−1 500 over "$0 of $2,400" step−2 muted | date step−2 muted right ("Ready to order" in `--money`). Ordered and done goals leave the stack. A new goal on top appears at its level, still (no fill).
- **Settings → Goals:** one container of dividered rows: up/down (arrow icons) | priority (active in `--money`) | ring with the emoji as an input in its face | name input over "$650 saved · Saving now, by Oct 11" | price input ("$1,099", right-aligned) | remove. Inputs read as text until hover/focus (`--bg-2` well). Last row adds a goal (dashed track). Saves on blur/Enter; a reserved note line under the list says "Saved" / the refusal. Polls every 2s.

### 3.4 Today (morning)

```
352 × 152, pad s3 card-pad
Sat, Oct 4                               ☀    step−2 muted · glyph 2.5rem, word under it step−2
$43                                    Sunny  .num.hero step-3, min-width 4ch
to spend today                                step−1 muted
─────────────────────────────────────────     1px --rule, margin s2 0
Comcast $89 Mon · Rent $1,400 Tue              step−2: names --fg, rest --muted; one line, ellipsis
```

- **Weather glyph** (24 grid, stroke 1.75 round, Charade style: open strokes, one solid focal part in `--amber`):
  - Sunny: core circle r=4 at (12,12) filled `--amber`, no stroke; eight rays from r=7 to r=9.5.
  - Cloudy: small sun core r=3 at (15,8) filled `--amber`, partly behind a cloud outline `M7 19h9.5a4.5 4.5 0 0 0 .6-8.96A5.5 5.5 0 0 0 6.6 11.1 4 4 0 0 0 7 19z` whose fill is `--bg-2` (it occludes the sun).
  - Storm: the same cloud shifted up 2, plus a solid bolt `M12.5 15 10 19h3l-1.5 3.5` drawn as a filled `--amber` shape.
  - Word always under the glyph: "Sunny" / "Cloudy" / "Stormy". State comes from the server (bills due in the next 3 days).
- **Glyph verb, once, after the card lands:** sunny rays draw out (`stroke-dashoffset` 100% → 0, `--t-slow` `--ease-out`); cloudy cloud slides 3px left → 0 (`--t-slow`); storm bolt opacity 0 → 1 → 0.4 → 1 (400ms). Never loops.
- Bills line when none: "No bills in the next 3 days."
- Live number: the latest today card is live; on each purchase the server bumps its version and the hero rolls (`$43` → `$36`). Earlier today cards are frozen records.

### 3.5 Proposal (CFO action)

Forth's `.b.ask` grammar, unchanged in structure: `small` title line ("Comcast went up"), summary text step−0, optional artifact on `--pane` (radius 12, inset 0.6rem), then the answer row.

- Artifact for a bill: "Comcast" left; right "$89 → $112/mo" with "$89" `--muted` and struck through, "$112" `--fg`, then "+$23" `--danger` step−2. Subscriptions: name + "Last used Aug 14".
- Answer row (2.75rem): "Approve" `--blue` 600 | "Not now" `--muted` 600, divided by 1px `--rule`. Bottom corners 18px.
- **Answered:** the answer row is a swap slot; buttons → outcome in place, same height:
  - Approving (optimistic, immediately on tap): "Approved · calling Comcast" + inline three-dot (4px) indicator.
  - Done: "✓ Saved $23/mo → iPhone" (amount `--money`).
  - Not now: "Not now. I'll check again next month." `--muted`.
  - Failed: §1.7 failed action.
- The proposal's own height never changes after arrival.

### 3.6 Market (group chat)

```
352 × 264, pad s3 card-pad
Will Penny spend $80 on DoorDash today?            step-0 600, line-clamp 2
Closes 11:59 PM · settled from Penny's card        step−2 muted
                                                    gap s3
Yes $30                                    No $15  step−1 600 (.num); "Yes"/"No" 500 muted
████████████████████████▌ ▐████████████            split bar 0.625rem, radius 5px, 2px gap
(P)(M)                                    (S)      avatar stacks 1.5rem, overlap −0.375rem, ring 2px --bg-2
                                                    gap s3
┌ bottom slot 5.75rem ───────────────────────────┐
│ [$5] [$10] [$20]                               │  chips: 2rem tall, min-width 3rem, radius 8, gap 6px
│ ───────────────────────────────────────────────│
│     Yes · $10      │      No · $10             │  Forth .answers row 2.75rem; Yes --money, No --danger
└────────────────────────────────────────────────┘
```

- **Split bar:** two full-width layers clipped to their share, so the bar retargets smoothly with no width animation:

```css
.split { position: relative; height: 0.625rem; }
.split > i { position: absolute; inset: 0; border-radius: 5px; transition: clip-path var(--t-slow) var(--ease-in-out), opacity var(--move) ease; }
.split .yes { background: var(--money);  clip-path: inset(0 calc((1 - var(--p)) * 100% + 1px) 0 0 round 5px); }
.split .no  { background: var(--danger); clip-path: inset(0 0 0 calc(var(--p) * 100% + 1px) round 5px); }
/* --p = yesPot / (yesPot + noPot); 0.5 when both are 0. The 2px gap is the two 1px insets. */
.split.resolved-yes .no, .split.resolved-no .yes { opacity: 0.25; }
```

- Chips: unselected `box-shadow: inset 0 0 0 1px var(--rule)`, `--fg`; selected `background: var(--fg); color: var(--pane)`; `$10` preselected. Selection is instant (colour `--quick`). Answer labels follow the chip ("Yes · $20").
- Avatar stacks: max 4 per side, then "+2" step−2 `--muted`. Each side's stack aligns under its pot label (Yes left, No right).
- **Someone bets** (friend or you): their avatar pops into their side's stack (`scale 0.6 → 1` + opacity, `--t-spring` `--spring`) → 200ms → the bar retargets and both pots roll (one motion, `--t-slow`).
- **Your bet placed:** slot swaps to: "You: $10 on No" step−1 600 / "Pays about $25 if you're right." step−2 `--muted` (server computes the pro-rata estimate) / "Closes 11:59 PM" step−2.
- **Resolved:** slot swaps to: headline "Yes wins. Penny spent $86 at DoorDash, 9:14 PM." step−1 600 (2 lines max), then up to three payout rows (1.375rem each, dividered by `--rule`): face 1.25rem + name step−1 | amount right, winners `+$12.50` `--money`, losers `−$10` `--muted`. Then the losing segment fades to 0.25 (`--move`). Winners' pot doesn't change.
- Winnings are free money: when Charles wins, the sidebar today line rolls up (it arrives on the next summary poll; no extra motion in the card).

---

## 4. Group chat

- Route `/group`. Contact header: the three friend faces (2rem, overlapping −0.6rem, ring 2px `--pane`) over "The Group" step−2 500. Dime is a member; it isn't in the face cluster.
- Bubbles: friends and Dime grey (`--bg-2`) left; Charles blue right. Sender name (`.who`, step−2 500 `--muted`) above the first bubble of each friend/Dime run; face (1.75rem, `.av.side`) at the last bubble of the run, in a 2.4rem gutter so every left bubble shares one edge. Dime's face is its `#cue` mark in `--fg`, no disc.
- Names are always grey, never tone-coloured. Tone lives only in faces.
- **Cadence** (server, `events.ts`): one typing indicator at a time, carrying the typer's face in the gutter. Typing time = `clamp(800, 25 × chars, 2200)` ms; gap between consecutive messages from different people 500–1100ms (seeded, so rehearsals repeat); a friend's tapback lands 600ms after the message it reacts to. Never two bubbles in the same 300ms window.
- **Unread:** when a message lands in the conversation you aren't viewing, its sidebar row shows a 0.5rem `--blue` dot right-aligned (pop `--t-spring`), cleared on open. On the phone tab bar the dot sits at the icon's top right.

---

## 5. Dashboard (`/dashboard`)

Purpose-built: a rail of today on the left, the money's work on the right. No bordered card per section; sections are separated by whitespace and one hairline at most. `main.dash { --col: 72rem }`.

**1440 desktop:**

```
October                                                              (page-head h1 step-2)

Today                │ Invested                                    $1,284.50
$36                  │                                     +$23.40 this month (--money)
of $43 this morning  │ ┌ line chart, 12rem ────────────────────────────────────┐
                     │ │ ─────────────╮____________╭──────────────●  $1,284   │
Pool left     $612   │ └───────────────────────────────────────────────────────┘
Days left       28   │ Oct 1                    Oct 15                   Oct 31
To goal       $142   │ ███████████▌███████▌████▌▐█  allocation bar 0.5rem
                     │ ┌ rows ───────────────────────────────────────────────┐
[ring]  iPhone 17 Pro│ │ ■ S&P 500  VOO                 $820.00   +2.1%       │
        64%          │ │ ■ Nasdaq-100 QQQ               $280.00   +3.4%       │
        $703 of $1,099│└─────────────────────────────────────────────────────┘
        Nov 21       │
                     │ Spending                          │ Days
                     │ Dining      ██████████   $142     │ S M T W T F S
                     │ Groceries   ██████       $96      │ ▣ ▣ ▣ ▢ ▣ …
                     │ …                                 │ ■ under ■ over ■ no-spend
```

- Grid: `grid-template-columns: 20rem minmax(0, 1fr); column-gap: var(--s5)`; rail separated by a 1px `--rule` vertical line (`border-right` on the rail, `padding-right: var(--s5)`). Right column: invested block, then `grid-template-columns: minmax(0, 1fr) 17rem; gap: var(--s5)` for spending | days.
- "Today" is the one label above the hero: step−1 500 `--muted`, sentence case.
- **Rail:** hero `.num.hero` step-4 (`$36`), sub-line step−1 `--muted`. Then key–value rows (dividered, no container border; label step−1 `--muted`, value step-0 500 tabular right). Then the goals stack (§3.3): the top goal's ring at 5.5rem with name / % (step-2) / amounts / date beside it, the queued goals as mini-ring rows under it.
- **Invested:** h2 "Invested" left, total `.num` step-2 right with the month delta under it. Line chart below, allocation bar, then fund rows inside one `.rows` container (radius 14): swatch 0.625rem square radius 3px in the fund colour, name step-0 500 + ticker step−2 `--muted`, value tabular, change % step−1 (`--money` if up, `--muted` if down, with sign).
- **Spending:** h2 "Spending"; rows (no container), top 6 categories by amount: name step−1 (6.5rem col) | bar | amount step−1 tabular right. Bar 6px tall, radius 3px, length relative to the largest; largest in `--fg`, others `color-mix(in srgb, var(--fg) 45%, transparent)`.
- **Days (calendar):** h2 "Days"; weekday initials step−2 `--muted`; 7 columns of 2.25rem cells, gap 4px, radius 8px, date step−2 tabular centred. Fills: under budget `color-mix(in srgb, var(--money) 20%, var(--pane))`; over `color-mix(in srgb, var(--danger) 18%, var(--pane))`; no-spend `color-mix(in srgb, var(--amber) 30%, var(--pane))`; future days no fill, date `--muted`; today a 1.5px `--fg` inset ring. Legend under the grid: three 0.625rem swatches, each with its word ("Under", "Over", "No spend"), step−2.

**Chart rules (all charts):**
- Line 1.75px `--fg`, round caps/joins, stepped after each ledger entry (it's a ledger, not a market price). No area fill, no gradient. End dot 6px `--fg` with the value as a direct label (step−2 500) to its left.
- Three horizontal gridlines, 1px `--rule`. No axis lines, no y labels (the end label and the total carry the value). X labels step−2 `--muted`: month start, mid, end.
- Allocation bar: 0.5rem tall, radius 3px, segments in fund colours separated by 2px of `--pane`. The fund rows are the legend.
- Hover (fine pointer): 1px `--muted` vertical hairline + tooltip (`--pane`, 1px `--rule` border, radius 10px, pad s1 s2, step−2, `box-shadow: 0 6px 20px -10px color-mix(in srgb, var(--fg) 35%, transparent)`, z 10). Tooltip opacity 120ms; it follows the pointer without easing.
- Draw-in: the line draws once per session on first view (`stroke-dashoffset` from path length to 0, `--t-data` `--ease-in-out`), after the screen's `rise` ends. Nothing else on the dashboard animates on load.
- Dark mode: same tokens; gridlines stay `--rule` (it's already a mix of `--fg`).

**Live updates:** poll `/api/summary` every 2s while mounted. Changed numbers roll; a new ledger entry extends the line (redraw the path, no animation); calendar cells change colour with `--quick`.

**Empty / loading:** layout renders immediately with `—` in `--muted` for every figure (slots sized, nothing shifts when numbers arrive). No ledger yet: chart area shows the flat baseline and the rows container holds Forth's `.rows .empty` "Nothing invested yet. Lose a hand and it lands here." Spending empty: "No spending yet this month."

**Phone (390):** one column, in this order: hero (step-3) + key–values, goal, Days, Invested, Spending. Section gap `--s5`. Chart height 9rem. The rail border disappears.

---

## 6. Accounts (`/accounts`)

Forth's accounts layout (`.split`: services left 1.65fr, a rail right 1fr). h1 "Accounts".

- **Left, one `.rows` container, two rows** (`.svc`, min-height 4.25rem): glyph 2rem | name step-0 500 over a subtitle step−1 `--muted` | action (fixed width 7.5rem, right).
  - Chase: Charade `bank` glyph in `--fg` (no logo). Subtitle disconnected: "Checking and savings". Connected: "Checking ••4821 · Savings ••0937".
  - Dime Invest: Dime `#mark` in `--fg`. Subtitle disconnected: "Paper brokerage". Connected: "Paper ledger · $1,284.50 in 2 funds".
- **Right rail:** h2 "Recent", five dividered transaction rows (merchant step−1 500, date step−2 `--muted`, amount tabular right, debits with `−`). Before Chase connects: the same five-row height reserved, holding the `.empty` line "Connect Chase to see transactions."
- **Connect flow** (in place; no modal, no navigation, nothing reflows):
  1. Tap "Connect" (Forth `.pill.sm`, rounded rectangle) → the pill crossfades (slot) to the word "Connecting" step−1 `--muted`.
  2. A 2.5rem progress ring draws around the glyph: SVG circle r=18, stroke 2px `--fg`, `stroke-dashoffset` from full to 0 in three ticks at 800ms each (each tick `--t-slow` `--ease-in-out`, holding between). The subtitle swaps per tick (slot): "Opening Chase" → "Verifying it's you" → "Reading 90 days".
  3. At 2.4s the ring colour transitions to `--green` (`--quick`), then a 0.875rem check badge pops at the glyph's bottom-right (`--t-spring`), the ring fades (200ms).
  4. Action slot → `.dot.live` + "Connected". Subtitle → the account numbers.
  5. Then the rail's rows enter: `rise` 8px + opacity, `--move`, 40ms stagger.
- Connected rows have no action button; disconnect isn't in the demo.
- Error (server refuses): action slot shows "Try again" `.link` and the subtitle `--danger` "Couldn't reach Chase."

---

## 7. `/demo` control panel

Charles's, in a second window during the pitch. Dense, plain, obviously a tool: no pane, no sidebar, no product motion.

- `body.demo`: full window, `--bg`, a 3px `--amber` bar along the top edge (the "not the product" signal). Max width none; padding `--s4`.
- Head: "Demo controls" step-1 500 left; right: the server clock "Sat Oct 4 · 8:00 AM" step-0 tabular.
- Two columns at ≥ 1024px: controls `minmax(0, 1fr)` | state `22rem`. Below 1024px, state goes on top.
- **Controls:** sections with an h2 (step−1 600) and a wrapped row of buttons. Buttons: height 2rem, pad 0 0.75rem, radius 8px, `--bg-2`, 1px `--rule` inset ring, step−1 500, `:active` scale 0.97. A keyboard hint after the label in step−2 `--muted` (e.g. "Morning M"), as a plain `kbd` with no box.
  - Clock: Morning `M`, Midnight `N`, Skip day `D`.
  - Swipe: presets Matcha $7 `1`, DoorDash $34 `2`, Trader Joe's $52 `3`; custom row: merchant, amount, category inputs (Forth inputs at 2rem height) + "Swipe".
  - CFO: Scan `C`.
  - Group: Penny DoorDash $86 `F`; custom friend swipe (who, merchant, amount).
  - Blackjack next result: Win · Lose · Push · Fair (segmented, the active one `--fg` fill / `--pane` text).
  - Reset `R`: `--danger` text; needs a second press within 1.5s ("Press again to reset").
- **Feedback:** on success the button's background flashes `color-mix(in srgb, var(--green) 18%, var(--bg-2))` for 600ms; failure flashes `--danger` 18% and the log line is `--danger`. Nothing else moves.
- **State column:** key–value rows (no container) updating every 1s, instant (no roll): today, pool, goal %, ledger total, clock offset, next blackjack result. Under them, a log of the last 12 actions: time step−2 tabular `--muted` | action step−1.
- Shortcuts are ignored while an input has focus.

---

## 8. Shell details

- Sidebar convo row "Dime": under the name, step−2 `--muted` `.num` "$36 left today" (rolls on change; polled with the summary every 2s). It's the one number visible from every screen. On the phone this line moves to the chat contact header (under "Dime"), not the tab bar.
- Screen change: Forth's `rise` on `main > *` (`--move`). Only the incoming screen animates.
- Theme: follows the system unless `data-theme` is set. Theme change transitions colours only (Forth).

---

## 9. Z-order

| z | What |
|---|---|
| auto | Thread content, cards, hands (later cards above earlier by DOM order) |
| 1 | Flipping card during its flip |
| 2 | Bubble action bar (Forth) |
| 3 | Tapback picker (Forth) |
| 5 | A dealt card in flight (within `.bj`'s `isolation: isolate`, clipped by the felt) |
| 10 | Chart tooltip |

---

## 10. Verification checklist

Screenshot each item in **light and dark**, at **1440×900** and **390×844**, unless marked. Seed state unless stated. Compare against this spec, then mark pass/fail with the failing rule.

**Global**
- [ ] Instrument Sans everywhere (no system font fallback visible); only the type steps in §1.2.
- [ ] Hero `$` is 0.5em and top-aligned to the digit caps on: today card, dashboard hero, sidebar line (body size: no treatment).
- [ ] All money tabular; negatives use `−`; no red on ordinary purchases.
- [ ] Dark mode: body text off-white `#e4e3df`, felt and money desaturated, playing cards dimmed paper (not white), no surface relies on a shadow for elevation.
- [ ] No pill-shaped buttons, gradients, glass, emoji headers, uppercase labels (ranks excepted).

**Chat (`/`)**
- [ ] Bubble runs, tails, day line, Delivered: Forth grammar intact.
- [ ] Send a message: your bubble rises from bottom right; typing indicator; reply replaces it in one frame (record at 0.25× speed: exactly one thing moving at a time).
- [ ] Poll ticks during a deal do not stutter, restart or snap any animation (record 3s around a deal).
- [ ] Tapback pops from the bubble corner with a slight overshoot.
- [ ] Each card at 1440 and 390: width 352px (≤ 100% on phone), no horizontal overflow, no text overflow.

**Cards** (one screenshot per state; each state's card height identical within a kind; measure)
- [ ] Blackjack: just dealt (hole card down) · after a hit · Dime's turn (buttons dimmed) · won · lost · bust · push mid-sweep. Suits crisp at 52px; "10" fits the index; shoe visible top-right.
- [ ] Blackjack flip recorded at 0.25×: rotates on Y with depth, lifts 6px, back never shows through (backface hidden).
- [ ] Funds: default (VOO selected, detail filled) · another row selected · confirmed (others dimmed). Arrow keys move selection; focus ring visible.
- [ ] Goal: before sweep · mid-fill (screenshot at ~450ms) · after; arc starts at 12 o'clock, no cap dot at 0%; 100% "Ready to order" (store) or "Done" (fund); stack shows queued goals numbered.
- [ ] Today: sunny, cloudy, stormy (force via seed); glyph word present; bills line one line on phone.
- [ ] Proposal: open · approving (dots) · done · not now. Height identical across states.
- [ ] Market: open · after a friend bet (bar moved) · your bet placed · resolved with payouts. Split bar 2px gap visible at 50/50 and at 90/10.

**Group (`/group`)**
- [ ] Names above friend runs, faces at run ends, single left edge for all left bubbles; Dime shows its mark.
- [ ] Unread dot appears on the other conversation's sidebar row and clears on open.

**Dashboard (`/dashboard`)**
- [ ] 1440: rail + work area, horizontal hierarchy, no bordered card per section; hero is the largest thing on screen.
- [ ] Chart: stepped line, no fill, end label, 3 gridlines, x labels; draws once on first visit only; tooltip on hover (1440 only).
- [ ] Calendar: under/over/no-spend fills legible in both themes; today ringed; legend words present.
- [ ] Empty state (after Reset with no ledger): baseline + empty row, no layout shift when data arrives.
- [ ] 390: order hero → goal → days → invested → spending.

**Accounts (`/accounts`)**
- [ ] Disconnected · connecting (ring mid-draw, subtitle step 2) · connected (check badge, Connected dot+word, rail rows in). Row height and action width unchanged throughout.

**Demo (`/demo`, 1440 light only + 390 light)**
- [ ] Amber top bar; dense two-column; every shortcut works and flashes its button; Reset needs two presses.

**Reduced motion** (toggle the OS setting; 1440 light)
- [ ] Blackjack shows dealt cards and results without travel or flip; goal shows final level; numbers swap instantly; no sequence timers delay results.
