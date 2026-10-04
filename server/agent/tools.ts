// Dime's tools. Read-only ones wrap money.ts; action ones open mini app cards. Every number the
// model says comes out of here. Cards opened during a turn are collected in `apps` and posted
// after the turn's text.
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { state, type App, type Thread } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { open } from "../apps/index.ts";

const DAY = 86_400_000;
const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const cents = (n: number) => Math.round(n * 100) / 100;
const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], details: data });

function tool<P extends ReturnType<typeof Type.Object>>(
  name: string,
  description: string,
  parameters: P,
  run: (p: any) => unknown,
): AgentTool<P> {
  return { name, label: name, description, parameters, execute: async (_id, p) => ok(run(p)) };
}

const none = Type.Object({});

export function tools(thread: Thread, apps: App[]): AgentTool<any>[] {
  const list: AgentTool<any>[] = [
    tool("get_today", "Today's number: what Charles can still spend today, plus how the day stands.", none, () => {
      const at = now();
      return {
        date: date(at),
        time: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        today_left: money.today(state, at),
        started_with: money.budget(state, at),
        spent_today: money.spentToday(state, at),
        over_by: money.over(state, at),
        days_left_in_month: money.daysLeft(at),
      };
    }),
    tool("get_goal", "The savings goal: price, saved, percent, daily pace, and when it lands.", none, () => {
      const at = now();
      const g = state.goal;
      const eta = money.eta(state, at);
      return {
        name: g.name, emoji: g.emoji, price: g.price, saved: g.saved, left_to_save: cents(g.price - g.saved),
        pct: money.pct(state), pace_per_day: cents(money.pace(state, at)), eta_days: eta, eta_date: date(money.etaDate(state, at, eta)),
      };
    }),
    tool(
      "girl_math",
      "What a price means: days it pushes the goal back, hours of work, and whether it fits today.",
      Type.Object({ amount: Type.Number({ description: "Price in dollars" }) }),
      ({ amount }) => {
        const at = now();
        const eta = money.eta(state, at);
        const later = money.delay(state, at, amount);
        return {
          amount, goal: state.goal.name, goal_days_later: later,
          goal_date_if_skipped: date(money.etaDate(state, at, eta)), goal_date_if_bought: date(money.etaDate(state, at, eta + later)),
          hours_of_work: Math.round((amount / state.user.hourly) * 10) / 10,
          today_left: money.today(state, at), fits_today: amount <= money.today(state, at),
        };
      },
    ),
    tool(
      "recent_spending",
      "Card spending over the last N days (default 7), optionally one category (coffee, food, groceries, shopping, transport, fun, ...).",
      Type.Object({ category: Type.Optional(Type.String()), days: Type.Optional(Type.Number()) }),
      ({ category, days = 7 }) => {
        const at = now();
        const from = money.dayStart(at).getTime() - (days - 1) * DAY;
        const txns = state.txns.filter(
          (t) => t.kind === "spend" && +new Date(t.at) >= from && +new Date(t.at) <= +at && (!category || t.category === category),
        );
        const by_category: Record<string, number> = {};
        for (const t of txns) by_category[t.category] = cents((by_category[t.category] ?? 0) + t.amount);
        return {
          days, category: category ?? "all", total: cents(txns.reduce((s, t) => s + t.amount, 0)), count: txns.length, by_category,
          purchases: txns.map((t) => ({ date: date(new Date(t.at)), merchant: t.merchant, amount: t.amount, category: t.category, won_at_blackjack: !!t.covered })),
        };
      },
    ),
    tool(
      "start_blackjack",
      "Send the blackjack card for a purchase. Only when the price fits in today's number. Win: the item is free. Lose: the price goes into his fund.",
      Type.Object({ item: Type.String({ description: "What he wants, short, e.g. 'sneakers'" }), price: Type.Number() }),
      ({ item, price }) => {
        const left = money.today(state, now());
        if (!(price > 0)) throw new Error("price must be positive");
        if (price > left) throw new Error(`Can't bet $${price}: only $${left} left today. Tell him, with girl_math.`);
        apps.push(open("blackjack", { item, amount: price }));
        return { sent: true, item, price, today_left: left };
      },
    ),
    tool("open_funds", "Send the fund picker card (broad index funds, sector ETFs SOXX and DRAM, and cash) so he can choose where invested money goes.", none, () => {
      apps.push(open("funds", {}));
      return { sent: true, current_fund: state.user.fund };
    }),
    tool(
      "react",
      "Tapback his latest message, like tapping a reaction in iMessage. Only when a reaction says it better than words; most messages get none. Calling it twice replaces the first.",
      Type.Object({
        tapback: Type.Union(
          ["love", "like", "dislike", "laugh", "emphasize", "question"].map((t) => Type.Literal(t)),
          { description: "love ❤️, like 👍, dislike 👎, laugh 😂, emphasize ‼️, question ❓" },
        ),
      }),
      ({ tapback }) => {
        const m = state.messages.findLast((x) => x.thread === thread && x.direction === "in");
        if (m) m.reaction = tapback;
        return { reacted: !!m };
      },
    ),
    tool(
      "set_tone",
      "Switch how you talk to him when he asks you to be nicer or meaner. Takes effect from your next message.",
      Type.Object({ tone: Type.Union([Type.Literal("nice"), Type.Literal("savage")]) }),
      ({ tone }) => {
        state.user.tone = tone;
        return { tone };
      },
    ),
  ];
  if (thread === "group")
    list.push(
      tool(
        "create_market",
        "Group chat only. Send a yes/no prediction market on a friend's spending today, e.g. will Penny spend $80 on DoorDash today. Friends bet both sides; winners split the losers' pot.",
        Type.Object({
          subject: Type.Union([Type.Literal("Penny"), Type.Literal("Maya"), Type.Literal("Sam")]),
          merchant: Type.String(),
          threshold: Type.Number({ description: "Dollar amount the claim is about" }),
        }),
        ({ subject, merchant, threshold }) => {
          const app = open("market", { subject, merchant, threshold });
          apps.push(app);
          return { sent: true, question: app.state.question };
        },
      ),
    );
  return list;
}
