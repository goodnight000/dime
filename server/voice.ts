// Dime's wording. The Pi agent words replies and events; templates are the instant fallback.
// Numbers always come from money.ts, never from here. One thought per message, 1-3 messages.
import { state, id, type App, type Message, type Thread } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import * as agent from "./agent/index.ts";
import { groupReply } from "./friends.ts";

export const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
export const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function post(m: Omit<Message, "id" | "created_at">): Message {
  const msg: Message = { id: id(), created_at: now().toISOString(), ...m };
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
 * the facts don't have. `template` is the default wording; its numbers are part of the facts. */
export async function word(thread: Thread, facts: string, template: string[]): Promise<string[] | null> {
  if (!agent.enabled()) return null;
  const event = `${facts}\nDefault wording (say it your way, same numbers): ${template.join(" / ")}`;
  try {
    const { lines } = await agent.runTurn(thread, { event });
    if (lines.length && faithful(lines.join("\n"), event)) return lines;
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
export async function speak(thread: Thread, facts: string, template: (string | App)[], delay = 0) {
  const texts = template.filter((l): l is string => typeof l === "string");
  const cards = template.filter((l): l is App => typeof l !== "string");
  const words = word(thread, facts, texts);
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
  const g = state.goal;
  const days = money.lag(state, at, amount);
  const asked = `Charles asked if he should buy ${item} for ${usd(amount)}. Left today: ${usd(left)}. Girl math: ${g.name} ${days} later if he buys it.`;
  if (amount > left)
    return speak(thread, `${asked} It's more than today's number: the answer is no. Say no, kindly or savagely per tone. Don't mention blackjack or betting.`,
      [`${item} is ${usd(amount)}, today is ${usd(left)}. that's a no 🙅`, `${item} = ${g.name} ${days} later fyi`]);
  const app = open("blackjack", { item, amount });
  return speak(thread, `${asked} It fits, so you offer him blackjack against you (call yourself "me", never "the CFO" or "the dealer"): win and the ${item} is on the house and doesn't count against today; lose and the ${usd(amount)} gets invested instead. The blackjack card follows your words.`,
    [`beat me and it's on the house 🃏`, `lose and the ${usd(amount)} gets invested. deal?`, app]);
}

/** The Pi agent's turn, when gateway creds are set (see server/agent/index.ts). False → use the templates. */
async function brain(thread: Thread, text: string): Promise<boolean> {
  if (!agent.enabled()) return false;
  state.typing[thread]++;
  let turn;
  try {
    turn = await agent.runTurn(thread, text);
  } catch (e) {
    console.error("agent turn failed, using templates:", e);
    return false;
  } finally {
    state.typing[thread] = Math.max(0, state.typing[thread] - 1);
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
  if (await brain(thread, text)) return;
  const at = now();
  const left = money.today(state, at);
  const g = state.goal;
  if (thread === "dime" && /\b(change|switch|pick|choose|set)\b.*\bfund\b|\bwhich fund\b/i.test(text))
    return say(thread, state.user.fund ? `where should losses go now?` : `pick where losses go 👇`, open("funds"));
  if (/girl math|iphone|goal|when/i.test(text)) {
    const days = money.eta(state, at);
    return say(thread, `at your pace, ${g.name} in ${days} days ${g.emoji}`, `${day(money.etaDate(state, at, days))}. girl math says it's basically yours`);
  }
  return say(thread, `${usd(left)} left today`, `ask me "should I buy X for $N" and we'll see 🃏`);
}
