// Dime's wording. The Pi agent words replies and events; templates are the instant fallback.
// Numbers always come from money.ts, never from here. One thought per message, 1-3 messages.
import { state, id, type App, type Message, type Thread } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import * as agent from "./agent/index.ts";
import { groupReply } from "./friends.ts";
import { fund } from "./funds-data.ts";

export const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
export const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Headlines by URL, filled by news.ts as results come in: a posted URL we know gets a link preview. */
export const linkTitles = new Map<string, string>();

export function post(m: Omit<Message, "id" | "created_at">): Message {
  const url = m.body.match(/https?:\/\/[^\s<>"')\]]+/)?.[0];
  const title = url && linkTitles.get(url);
  const msg: Message = { id: id(), created_at: now().toISOString(), ...m, ...(title ? { link: { url, title } } : {}) };
  state.messages.push(msg);
  return msg;
}

/** Dime sends each line after a short typing pause; the snapshot shows `pending` meanwhile. */
export async function say(thread: Thread, ...lines: (string | App)[]) {
  state.typing[thread]++;
  try {
    for (const line of lines) {
      await Bun.sleep(600 + Math.random() * 600);
      if (typeof line === "string") post({ thread, direction: "out", body: line });
      else post({ thread, direction: "out", body: "", app: line.id });
    }
  } finally {
    state.typing[thread] = Math.max(0, state.typing[thread] - 1);
  }
}

/** Every number in `words` (dollars, days, percents) appears in `facts`. The model only words. */
export function faithful(words: string, facts: string): boolean {
  // "$5k" is 5000: the model may abbreviate a number it was given.
  const nums = (s: string) =>
    new Set((s.match(/\d[\d,]*(?:\.\d+)?k?/gi) ?? []).map((n) => String(Number(n.replace(/[,k]/gi, "")) * (/k$/i.test(n) ? 1000 : 1))));
  const known = nums(facts);
  return [...nums(words)].every((n) => known.has(n));
}

/** The model's wording of an event, or null: no creds, error, 6s timeout, silence, or a number
 * the facts don't have. `template` is the default wording; its numbers are part of the facts.
 * `numbers`, when given, is all the words may quote instead (an intro whose cards carry the amounts). */
export async function word(thread: Thread, facts: string, template: string[], numbers?: string): Promise<string[] | null> {
  if (!agent.enabled()) return null;
  const event = `${facts}\nDefault wording (say it your way, same numbers): ${template.join(" / ")}`;
  try {
    const { lines } = await agent.runTurn(thread, { event });
    if (lines.length && faithful(lines.join("\n"), numbers ?? event)) return lines;
    console.warn("event words rejected, using the template:", lines);
  } catch (e) {
    console.warn("event turn failed, using the template:", (e as Error).message);
  }
  return null;
}

/**
 * An event in Dime's voice: the model words `facts`, the template's strings are the fallback, and
 * the template's cards follow the text exactly as before. The model starts now; Dime starts typing
 * after `delay` (a card finishing its own motion first), and the first line lands the moment the
 * words are ready (at least 400ms of typing).
 */
export async function speak(thread: Thread, facts: string, template: (string | App)[], delay = 0, numbers?: string) {
  const texts = template.filter((l): l is string => typeof l === "string");
  const cards = template.filter((l): l is App => typeof l !== "string");
  const words = word(thread, facts, texts, numbers);
  if (delay) await Bun.sleep(delay);
  state.typing[thread]++;
  let lines: string[];
  try {
    // A short typing beat even when the words are instant (templates), so the bubble doesn't pop.
    const [w] = await Promise.all([words, Bun.sleep(400)]);
    lines = w ?? texts;
  } finally {
    state.typing[thread] = Math.max(0, state.typing[thread] - 1);
  }
  const [first, ...rest] = [...lines, ...cards];
  if (typeof first === "string") post({ thread, direction: "out", body: first });
  else if (first) post({ thread, direction: "out", body: "", app: first.id });
  await say(thread, ...rest);
}

const BUY_RE = /should i (?:buy|get|cop)\s+(?:an?\s+|the\s+|some\s+|these\s+|this\s+|those\s+|that\s+)?(.+?)(?:\s+for)?\s+\$\s?(\d+(?:\.\d+)?)/i;

/** "Should I buy X for $N": code decides (blackjack if it fits today, else no), the model only words
 * it. One round trip instead of a tool-calling turn, so the card lands in ~2s, not ~6s. */
function buy(thread: Thread, item: string, amount: number) {
  const at = now();
  const left = money.today(state, at);
  const g = money.activeGoal(state);
  const days = money.lag(state, at, amount);
  const asked = `Charles asked if he should buy ${item} for ${usd(amount)}. Left today: ${usd(left)}. Girl math: ${g.name} ${days} later if he buys it.`;
  if (amount > left)
    return speak(thread, `${asked} It's more than today's number: the answer is no. Say no, kindly or savagely per tone. Don't mention blackjack or betting.`,
      [`${usd(amount)} on ${item}? not today, you've only got ${usd(left)} 🙅`, `it'd push the ${g.name} back ${days} too. sleep on it?`]);
  if (!state.user.blackjack) // Settings: impulse blackjack off
    return speak(thread, `${asked} It fits in today's number. Impulse blackjack is off in his settings, so no game: tell him it fits and what it costs the goal.`,
      [`${item} fits, you'd still have ${usd(left - amount)} today after`, `just know it's the ${g.name} ${days} later. your call`]);
  const app = open("blackjack", { item, amount });
  return speak(thread, `${asked} It fits, so you offer him blackjack against you (call yourself "me", never "the CFO" or "the dealer"): win and the ${item} is on the house and doesn't count against today; lose and the ${usd(amount)} gets invested instead. The blackjack card follows your words.`,
    [`ok here's the deal: beat me and the ${item} is on the house 🃏`, `lose and the ${usd(amount)} gets invested instead. deal?`, app]);
}

const FUNDS_RE = /where (?:do|does|did) (?:my )?(?:blackjack )?loss(?:es)? go|\b(?:show|see)\b.*\b(?:funds?|loss(?:es)?)\b|\b(?:change|switch|pick|choose)\b.*\bfund\b|\bwhich fund\b/i;

/** "Where do my losses go?": the fund menu, worded by the model, opened by code. */
function funds(thread: Thread) {
  const f = state.user.fund ? fund(state.user.fund) : null;
  const app = open("funds");
  return speak(thread, f
    ? `Charles asked where his blackjack losses go. Right now: the ${f.name}. He can switch any time. The fund picker card follows your words (each fund has a short description and risk level); lead into it, don't describe it.`
    : `Charles asked where his blackjack losses go. He hasn't picked a fund yet. The fund picker card follows your words; lead into it.`,
    f ? [`right now they land in the ${f.name} 📈`, `here's the whole menu if you wanna switch 👇`, app] : [`wherever you pick 👇`, app]);
}

/** The Pi agent's turn, when gateway creds are set (see server/agent/index.ts). False → use the templates. */
async function brain(thread: Thread, text: string): Promise<boolean> {
  if (!agent.enabled()) return false;
  // Typing shows once words start streaming, or after 1.2s of thinking; a tapback-only or silent
  // turn usually never shows it.
  let shownAt = 0;
  const show = () => {
    if (shownAt) return;
    shownAt = Date.now();
    state.typing[thread]++;
  };
  const hide = () => {
    if (shownAt) state.typing[thread] = Math.max(0, state.typing[thread] - 1);
    shownAt = 0;
  };
  let wrote = false;
  const timer = setTimeout(show, 1200);
  // A tapback before any words: likely the whole reply, so drop the thinking indicator.
  const reacted = () => (clearTimeout(timer), wrote || hide());
  let turn;
  try {
    turn = await agent.runTurn(thread, text, { text: () => ((wrote = true), show()), react: reacted });
    // Words came fast: a short typing beat so the bubble doesn't pop in cold.
    if (turn.lines.length || turn.apps.length) show();
    if (shownAt) await Bun.sleep(Math.max(0, 700 - (Date.now() - shownAt)));
  } catch (e) {
    console.error("agent turn failed, using templates:", e);
    return false;
  } finally {
    clearTimeout(timer);
    hide();
  }
  // The model's think time was the typing pause: the first line lands now, the rest at say()'s pace.
  const [first, ...rest] = [...turn.lines, ...turn.apps];
  if (typeof first === "string") post({ thread, direction: "out", body: first });
  else if (first) post({ thread, direction: "out", body: "", app: first.id });
  await say(thread, ...rest);
  return true;
}

export async function reply(thread: Thread, text: string): Promise<void> {
  if (thread === "group") return groupReply(text); // friend mode: markets + banter (friends.ts)
  const ask = text.match(BUY_RE);
  if (ask) return buy(thread, ask[1].trim(), Number(ask[2]));
  if (thread === "dime" && FUNDS_RE.test(text)) return funds(thread); // the menu, every time (demo beat 3c)
  if (await brain(thread, text)) return;
  const at = now();
  const left = money.today(state, at);
  const g = money.activeGoal(state);
  if (thread === "dime" && /\b(change|switch|pick|choose|set)\b.*\bfund\b|\bwhich fund\b/i.test(text))
    return say(thread, state.user.fund ? `where should losses go now?` : `pick where losses go 👇`, open("funds"));
  if (/girl math|iphone|goal|when/i.test(text)) {
    const days = money.eta(state, at);
    return say(thread, `the way you're going, ${g.name} in about ${days} days ${g.emoji}`, `so ${day(money.etaDate(state, at, days))}. girl math says it's basically yours`);
  }
  // "ok" / "lol thanks" with nothing new to say: silence, like the model (prompt.md).
  if (text.length <= 20 && /^(ok|okay|k|kk|lol|lmao|haha|thanks|thank you|thx|ty|cool|nice|bet|got it)\b/i.test(text)) return;
  return say(thread, `you've got ${usd(left)} to play with today`, `eyeing something? ask me "should I buy X for $N" 🃏`);
}
