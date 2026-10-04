// Dime's wording. Templates for now; Pi replaces the body of reply() behind the same signature.
// Numbers always come from money.ts, never from here. One thought per message, 1-3 messages.
import { state, id, type App, type Message, type Thread } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";

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

export async function reply(thread: Thread, text: string): Promise<void> {
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
    return say(thread, `Beat the CFO and the ${item} is on the house.`, `Lose and ${usd(amount)} goes into your fund. Deal?`, app);
  }
  if (/girl math|iphone|goal|when/i.test(text)) {
    const days = money.eta(state, at);
    return say(thread, `At your pace, ${g.name} in ${days} days ${g.emoji}`, `${day(money.etaDate(state, at, days))}. Girl math says it's basically yours.`);
  }
  if (thread === "group") return say(thread, `${usd(left)} left today for Charles 👀`);
  return say(thread, `${usd(left)} left today.`, `Ask me "should I buy X for $N" and we'll see 🃏`);
}
