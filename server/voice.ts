// Dime's wording. Templates for now; Pi replaces the body of reply() behind the same signature.
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

const BUY_RE = /should i (?:buy|get|cop)\s+(?:an?\s+|the\s+|some\s+)?(.+?)(?:\s+for)?\s+\$\s?(\d+(?:\.\d+)?)/i;

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
  if (await brain(thread, text)) return;
  const at = now();
  const left = money.today(state, at);
  const g = state.goal;
  const buy = text.match(BUY_RE);
  if (buy) {
    const item = buy[1].trim();
    const amount = Number(buy[2]);
    if (amount > left)
      return say(thread, `${usd(left)} left today. You can only bet what's left 🤷`, `${item} = ${g.name} ${money.delay(state, at, amount)} days later fyi`);
    const app = open("blackjack", { item, amount });
    return say(thread, `Beat the CFO and it's on the house.`, `Lose and ${usd(amount)} goes into your fund. Deal?`, app);
  }
  if (thread === "dime" && /\b(change|switch|pick|choose|set)\b.*\bfund\b|\bwhich fund\b/i.test(text))
    return say(thread, state.user.fund ? `Where should losses go now?` : `Pick where losses go.`, open("funds"));
  if (/girl math|iphone|goal|when/i.test(text)) {
    const days = money.eta(state, at);
    return say(thread, `At your pace, ${g.name} in ${days} days ${g.emoji}`, `${day(money.etaDate(state, at, days))}. Girl math says it's basically yours.`);
  }
  return say(thread, `${usd(left)} left today.`, `Ask me "should I buy X for $N" and we'll see 🃏`);
}
