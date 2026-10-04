// Dime demo video autopilot: plays the docs/VIDEO.md sequence in a clean 1440x900 Chrome app
// window at cinematic pace, with a visible cursor dot. Demo events go through the API, never the panel.
//
//   cd /tmp/blackjack && node ~/Developer/dime/scripts/autopilot.mjs [--beat N] [--pause] [--record] [--dark] [--no-reset]
//
//   --beat N    start at beat N (no reset unless --reset; each beat walks to its own screen first)
//   --pause     wait for Enter before each beat (voice over live, or re-take a beat)
//   --record    also save a Playwright video to /tmp/dime-video/reference.webm
//   --only N    play just beat N (a re-take), no reset
//   --reset     reset the demo even when starting past beat 1
//   --no-reset  don't reset at beat 1
//   --dark      dark theme (default light)
//   --hold      leave the window open at the end until Enter
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

// Playwright lives in /tmp/blackjack/node_modules (run from there, or NODE_PATH).
const require = createRequire(path.join(process.cwd(), "noop.js"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/tmp/blackjack/noop.js")("playwright"));
}

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const ONLY = flag("--only") ? Number(argv[argv.indexOf("--only") + 1]) : 0;
const START = ONLY || (flag("--beat") && Number(argv[argv.indexOf("--beat") + 1])) || 1;
const PAUSE = flag("--pause");
const RECORD = flag("--record");
const BASE = process.env.DIME_URL ?? "http://localhost:5174";
const W = 1440, H = 900;

const T0 = Date.now();
const log = (s) => console.log(`${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s  ${s}`);
const api = (action, body = {}) =>
  fetch(`${BASE}/api/demo/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error(`demo/${action} ${r.status}`);
  });

// ---------- browser: a chrome-less app window, fresh profile every run ----------
const VID = "/tmp/dime-video";
if (RECORD) fs.mkdirSync(VID, { recursive: true });
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "dime-ap-")), {
  headless: false,
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  colorScheme: flag("--dark") ? "dark" : "light",
  ignoreDefaultArgs: ["--enable-automation"],
  args: [`--app=${BASE}/`, `--window-size=${W},${H + 28}`, "--window-position=36,40", "--disable-infobars"],
  ...(RECORD ? { recordVideo: { dir: VID, size: { width: W, height: H } } } : {}),
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => log(`!! pageerror ${e.message}`));
page.on("response", (r) => r.status() >= 400 && log(`!! ${r.status()} ${r.url()}`));

// Cursor dot: follows real mouse events, so hover states are real too.
await page.addInitScript(() => {
  const mount = () => {
    if (document.getElementById("__cur")) return;
    const s = document.createElement("style");
    s.textContent = `#__cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(20,20,20,.28);border:2px solid rgba(255,255,255,.95);box-shadow:0 1px 6px rgba(0,0,0,.25);
      pointer-events:none;z-index:2147483647;transition:scale .12s ease-out,background .12s;opacity:0}
      #__cur.on{opacity:1}#__cur.down{scale:.72;background:rgba(20,20,20,.5)}`;
    document.head.append(s);
    const c = Object.assign(document.createElement("div"), { id: "__cur" });
    document.documentElement.append(c);
    addEventListener("mousemove", (e) => { c.style.translate = `${e.clientX}px ${e.clientY}px`; c.classList.add("on"); }, true);
    addEventListener("mousedown", () => c.classList.add("down"), true);
    addEventListener("mouseup", () => setTimeout(() => c.classList.remove("down"), 90), true);
  };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", mount) : mount();
  // Eased scroll of any scroller: await window.__scroll(selector, top, ms)
  window.__scroll = (sel, top, ms) =>
    new Promise((done) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) return done();
      const from = el.scrollTop, to = top === "end" ? el.scrollHeight - el.clientHeight : top, t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        el.scrollTop = from + (to - from) * ease(t);
        t < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
});

// ---------- primitives ----------
const wait = (ms) => page.waitForTimeout(ms);
let cx = W / 2, cy = H / 2;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
async function glideTo(x, y, ms = 650) {
  const n = Math.max(12, Math.round(ms / 16)), x0 = cx, y0 = cy;
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await wait(16);
  }
  cx = x; cy = y;
}
async function glide(target, ms) {
  const loc = typeof target === "string" ? page.locator(target).last() : target;
  await loc.waitFor({ state: "visible", timeout: 30000 });
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await glideTo(b.x + b.width / 2, b.y + b.height / 2, ms);
  return loc;
}
async function click(target, after = 450) {
  await glide(target);
  await wait(180);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up(); // a real click at the dot's position
  await wait(after);
}
const threadCount = () => page.evaluate(() => document.querySelectorAll("main .thread > li.b:not(.typing)").length);
// Until nothing is typing and no new rows land for `ms`.
async function settle(ms = 1800, max = 45000) {
  const end = Date.now() + max;
  let last = -1, still = 0;
  while (Date.now() < end) {
    const [n, typing] = await page.evaluate(() => [document.querySelectorAll("main .thread > li.b").length, !!document.querySelector("main .thread .typing")]);
    if (n === last && !typing) { if ((still += 250) >= ms) return; } else still = 0;
    last = n;
    await wait(250);
  }
  log("!! settle timeout");
}
async function waitMore(before, extra = 1, max = 30000) {
  await page.waitForFunction(([b, x]) => document.querySelectorAll("main .thread > li.b:not(.typing)").length >= b + x, [before, extra], { timeout: max }).catch(() => log("!! no reply"));
}
// Human typing: uneven key gaps, a beat after words, a look before Enter.
async function say(text, { hold = 1600, settleMs = 1800 } = {}) {
  await click("main textarea", 250);
  for (const ch of text) {
    await page.keyboard.type(ch);
    await wait(ch === " " ? 70 + Math.random() * 90 : 38 + Math.random() * 55);
  }
  await wait(450);
  const before = await threadCount();
  await page.keyboard.press("Enter");
  await waitMore(before, 2); // his bubble + the first thing back
  await settle(settleMs);
  await wait(hold);
}
const scrollThreadEnd = (ms = 700) => page.evaluate((ms) => window.__scroll("main .thread", "end", ms), ms);
async function nav(href) {
  const sel = href === "/" ? '.side a.convo[href="/"]' : `.side a[href="${href}"]`;
  const here = await page.evaluate(() => location.pathname);
  if (here !== href) await click(sel, 900);
}

// ---------- beats ----------
const BEATS = [
  ["Hook: three weeks of texting", async () => {
    await nav("/");
    await page.waitForSelector("main .thread li.b");
    await glideTo(W * 0.62, H * 0.55, 500);
    await wait(1800);
    await page.evaluate(() => window.__scroll("main .thread", 0, 3200));
    await wait(1200);
    await scrollThreadEnd(2600);
    await wait(1200);
  }],
  ["Ask: real numbers", async () => {
    await nav("/");
    await say("how much did I spend on food this week?", { hold: 2600 });
  }],
  ["Girl math", async () => {
    await nav("/");
    await say("girl math this $90 dinner", { hold: 1500 });
    await page.waitForSelector('main .thread li[data-kind="girlmath"]', { timeout: 15000 }).catch(() => log("!! no girl math card"));
    await scrollThreadEnd();
    await glide('main .thread li[data-kind="girlmath"]');
    await wait(3200);
  }],
  ["Sneakers: blackjack against the CFO", async () => {
    await nav("/");
    await api("force-blackjack", { result: "lose" }); // the rig must be set before the hand is dealt
    await say("should I buy these sneakers for $280?", { hold: 600 });
    const stand = page.locator('main .thread li[data-kind="blackjack"] .bj-acts.on button[data-a="stand"]').last();
    await stand.waitFor({ timeout: 30000 });
    await scrollThreadEnd();
    await glide('main .thread li[data-kind="blackjack"] .bj-hand, main .thread li[data-kind="blackjack"]', 700);
    await wait(2200); // read the hand
    const before = await threadCount();
    await click(stand, 300);
    await waitMore(before, 1, 20000); // Dime's "house wins" line
    await settle(2000);
    await scrollThreadEnd();
    await wait(3200);
  }],
  ["CFO: found 3 things", async () => {
    await nav("/");
    const n0 = await page.locator('main .thread li[data-kind="proposal"]').count();
    await api("cfo-scan");
    await page.waitForFunction((n) => document.querySelectorAll('main .thread li[data-kind="proposal"]').length >= n + 3, n0, { timeout: 30000 }).catch(() => log("!! cards"));
    await settle(1800);
    await scrollThreadEnd();
    await wait(2600); // read the three cards
    await click(page.getByRole("button", { name: "Call Comcast" }).last(), 300);
    await page.waitForFunction((n) => document.querySelectorAll('main .thread li[data-kind="proposal"]').length >= n + 4, n0, { timeout: 30000 }).catch(() => log("!! follow-up"));
    await settle(1800);
    await scrollThreadEnd();
    await wait(2800);
  }],
  ["The Group: prediction market", async () => {
    await nav("/group");
    await page.waitForSelector("main .thread.group");
    await wait(900);
    const m0 = await page.locator('main .thread li[data-kind="market"]').count();
    await say("Will Penny spend $80 on DoorDash today?", { hold: 0, settleMs: 3000 });
    await page.waitForFunction((n) => document.querySelectorAll('main .thread li[data-kind="market"]').length > n, m0, { timeout: 30000 }).catch(() => log("!! market"));
    await settle(3000);
    const mk = page.locator('main .thread li[data-kind="market"]').last();
    await scrollThreadEnd();
    await wait(1600);
    await click(mk.locator('button[data-amt="10"]'), 350);
    await click(mk.locator('button[data-side="yes"]'), 300);
    await settle(2500);
    await wait(1200);
    await api("friend-swipe", { who: "Penny", merchant: "DoorDash", amount: 38 });
    await settle(2500);
    await scrollThreadEnd();
    await wait(1600);
    await api("friend-swipe", { who: "Penny", merchant: "DoorDash", amount: 52 });
    await settle(3500, 50000);
    await scrollThreadEnd(900);
    await glide(page.locator('main .thread li[data-kind="market"]').last(), 800);
    await wait(2000);
    await glide(".side .left", 800); // today's number just went up
    await wait(2400);
  }],
  ["Dashboard: heat map, day, last 7 days", async () => {
    await nav("/dashboard");
    await page.waitForSelector(".cal .c[data-date]");
    await wait(2800);
    await glide(".days .week", 900);
    await wait(2400);
    // an over-budget day from the heat map, then today
    const hot = page.locator(".cal .c.hn3[data-date], .cal .c.hn2[data-date]").first();
    if (await hot.count()) {
      await glide(".cal", 700);
      await wait(600);
      await click(hot, 2800);
    }
    await click(".cal .c.now[data-date]", 3400);
  }],
  ["Investments", async () => {
    await nav("/dashboard");
    await click('.seg.view button[data-view="investments"]', 1800);
    const chart = page.locator(".inv-chart");
    if (await chart.count()) {
      const b = await chart.boundingBox();
      await glideTo(b.x + b.width * 0.15, b.y + b.height * 0.5, 700);
      await glideTo(b.x + b.width * 0.97, b.y + b.height * 0.5, 2600); // scrub the line
      await wait(1000);
    }
    await glide(".inv-from", 900);
    await wait(2600);
  }],
  ["Goal: the iPhone lands", async () => {
    await nav("/");
    await wait(600);
    await api("fill-goal");
    const order = page.locator('main .thread li[data-kind="goal"] .pr-buttons button.approve').last();
    await order.waitFor({ state: "visible", timeout: 40000 }).catch(() => log("!! no Order it"));
    await settle(1800);
    await scrollThreadEnd();
    await wait(2600);
    const before = await threadCount();
    await click(order, 300);
    await waitMore(before, 1, 25000);
    await settle(2500);
    await scrollThreadEnd();
    await glideTo(W - 60, H - 60, 900); // cursor out of the way for the closing frame
    await wait(4000);
  }],
];

// ---------- run ----------
const rl = PAUSE ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const enter = (q) => new Promise((r) => rl.question(q, r));

if ((START === 1 && !ONLY && !flag("--no-reset")) || flag("--reset")) {
  await api("reset");
  log("demo reset");
}
await page.goto(`${BASE}/`);
await page.waitForSelector("main .thread li.b");
await page.evaluate(() => window.__scroll("main .thread", "end", 1));
await wait(1200);

for (let i = START - 1; i < (ONLY || BEATS.length); i++) {
  const [name, run] = BEATS[i];
  if (PAUSE) await enter(`\n[beat ${i + 1}/${BEATS.length}] ${name}: Enter to play `);
  const s = Date.now();
  log(`==== ${i + 1} ${name}`);
  await run();
  log(`     ${((Date.now() - s) / 1000).toFixed(1)}s`);
}
log("done");
if (flag("--hold") || PAUSE) await enter("Enter to close ");
const video = page.video();
await ctx.close();
if (RECORD && video) {
  const out = `${VID}/reference.webm`;
  fs.renameSync(await video.path(), out);
  log(`video: ${out}`);
}
rl?.close();
