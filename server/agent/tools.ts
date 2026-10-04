// Dime's tools. Read-only ones wrap money.ts; action ones open mini app cards. Every number the
// model says comes out of here. Cards opened during a turn are collected in `apps` and posted
// after the turn's text.
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { state, type App, type Thread, type Txn } from "../state.ts";
import { now } from "../clock.ts";
import * as money from "../money.ts";
import { open } from "../apps/index.ts";
import { billHistory, findSavings, type Proposal } from "../cfo.ts";
import { exaSearch } from "../news.ts";
import { FUNDS, RISK, fund } from "../funds-data.ts";
import { accounts } from "../accounts.ts";
import { summary } from "../summary.ts";
import { usd } from "../voice.ts";
import { update as updateSettings } from "../settings.ts";
import { list as goalList, add as addGoal, update as updateGoal, reorder as reorderGoals, remove as removeGoal, find as findGoal } from "../goals.ts";

const DAY = 86_400_000;
const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const cents = (n: number) => Math.round(n * 100) / 100;
const PERIODS = ["today", "yesterday", "this_week", "last_7_days", "this_month", "last_month", "last_30_days", "last_90_days"] as const;
/** [from, to) for a named period. */
function range(p: (typeof PERIODS)[number], at: Date): [Date, Date] {
  const d0 = money.dayStart(at);
  const back = (n: number) => new Date(d0.getTime() - n * DAY);
  const end = new Date(d0.getTime() + DAY);
  switch (p) {
    case "today": return [d0, end];
    case "yesterday": return [back(1), d0];
    case "this_week": return [back((d0.getDay() + 6) % 7), end];
    case "last_7_days": return [back(6), end];
    case "this_month": return [new Date(at.getFullYear(), at.getMonth(), 1), end];
    case "last_month": return [new Date(at.getFullYear(), at.getMonth() - 1, 1), new Date(at.getFullYear(), at.getMonth(), 1)];
    case "last_90_days": return [back(89), end];
    default: return [back(29), end];
  }
}
const addMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours());
const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], details: data });

function tool<P extends ReturnType<typeof Type.Object>>(
  name: string,
  description: string,
  parameters: P,
  run: (p: any) => unknown,
): AgentTool<P> {
  return { name, label: name, description, parameters, execute: async (_id, p) => ok(await run(p)) };
}

const none = Type.Object({});
/** Money sitting in goals not yet spent (ordered goals were paid out). */
const goalFund = () => state.goals.reduce((t, g) => t + (g.done ? 0 : g.saved), 0);
/** One goal as the agent sees it after a change: where it sits in line and when it lands. */
function goalState(gid: string) {
  const all = goalList();
  const i = all.findIndex((g) => g.id === gid);
  const g = all[i];
  return { priority: i + 1, of: all.length, name: g.name, emoji: g.emoji, price: g.price, saved: g.saved, pct: g.pct, status: g.status,
    ahead: all.slice(0, i).filter((x) => x.status === "active" || x.status === "queued").map((x) => x.name),
    pace_per_day: Math.round(money.pace(state, now())), eta_days: g.eta_days, eta_date: date(money.etaDate(state, now(), g.eta_days)) };
}
/** Bumping the goal he's saving for now needs his yes. `top`: the goal that would be first (a key,
 *  null for a new one), undefined = no change at the top. */
function guardTop(top: string | null | undefined, confirmed?: boolean, newName?: string) {
  if (top === undefined || confirmed) return;
  const cur = money.activeGoal(state);
  if (cur.done || cur.saved >= cur.price) return;
  if (top !== null && findGoal(top)?.id === cur.id) return;
  const at = now();
  throw new Error(`${cur.name} is ${money.pctOf(cur)}% saved and lands in ${money.etaOf(state, at, cur.id)} days. Ask him first: put ${newName ?? top} ahead of it (${cur.name} keeps its $${cur.saved} and waits), or after it? Don't call this again this turn.`);
}

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
    tool("get_goal", "His savings goals in priority order: each one's price, saved, percent, status (active = saving now, queued = waits its turn, ready = full and can be ordered, ordered, done), and when it lands. Sweeps fill the active goal first, then roll to the next, so a queued goal's date counts the ones ahead of it. Also the daily pace.", none, () => {
      const at = now();
      return {
        pace_per_day: cents(money.pace(state, at)),
        goals: goalList().map((g, i) => ({
          priority: i + 1, id: g.id, name: g.name, emoji: g.emoji, price: g.price, saved: g.saved, left_to_save: cents(Math.max(0, g.price - g.saved)),
          pct: g.pct, status: g.status, ...(g.store ? { buy_from: g.store } : {}), eta_days: g.eta_days, eta_date: date(money.etaDate(state, at, g.eta_days)),
        })),
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
          amount, goal: money.activeGoal(state).name, goal_days_later: later,
          goal_date_if_skipped: date(money.etaDate(state, at, eta)), goal_date_if_bought: date(money.etaDate(state, at, eta + later)),
          hours_of_work: Math.round((amount / state.user.hourly) * 10) / 10,
          today_left: money.today(state, at), fits_today: amount <= money.today(state, at),
        };
      },
    ),
    tool(
      "show_girl_math",
      "Send the girl math card: the item and price, skip it → when the goal lands vs buy it → how much later, and the hours of work. Use it when he asks for girl math (\"girl math\", \"girl math this $90 dinner\") or what a price does to his goal, and when a price is over today's number. The card carries the numbers: write one short line before it, don't repeat its dates. Bare \"girl math\" with no price: omit amount and it uses his latest purchase.",
      Type.Object({
        item: Type.Optional(Type.String({ description: "Short name, e.g. 'dinner', 'top'" })),
        amount: Type.Optional(Type.Number({ description: "Price in dollars" })),
      }),
      ({ item, amount }) => {
        const app = open("girlmath", { item, amount });
        apps.push(app);
        const s = app.state;
        return { sent: true, item: s.item, amount: s.amount, goal: s.goal.name, goal_later: s.later, goal_date_if_skipped: date(new Date(s.skip.date)), goal_date_if_bought: date(new Date(s.buy.date)), hours_of_work: s.hours, today_left: money.today(state, now()) };
      },
    ),
    tool(
      "search_transactions",
      "His transactions, filtered. Use for any spending question: a merchant (\"Blue Bottle\"), a category (coffee, food, groceries, shopping, transport, fun, bills), a period, a minimum amount. Returns the total, count, top categories and merchants, the biggest, and the latest purchases.",
      Type.Object({
        merchant: Type.Optional(Type.String({ description: "Merchant name or part of it, any case" })),
        category: Type.Optional(Type.String()),
        period: Type.Optional(Type.Union(PERIODS.map((p) => Type.Literal(p)), { description: "Default last_30_days. this_week starts Monday." })),
        min_amount: Type.Optional(Type.Number()),
        kind: Type.Optional(Type.Union([Type.Literal("spend"), Type.Literal("bill"), Type.Literal("income"), Type.Literal("all")], { description: "Default spend (card purchases). all = everything going out: purchases and bills" })),
      }),
      ({ merchant, category, period = "last_30_days", min_amount = 0, kind = "spend" }) => {
        const at = now();
        const [from, to] = range(period, at);
        const m = merchant?.toLowerCase();
        const txns = state.txns
          .filter((t) => (kind === "all" ? t.kind === "spend" || t.kind === "bill" : t.kind === kind) && +new Date(t.at) >= +from && +new Date(t.at) < +to && +new Date(t.at) <= +at)
          .filter((t) => (!m || t.merchant.toLowerCase().includes(m)) && (!category || t.category === category.toLowerCase()) && t.amount >= min_amount)
          .sort((a, b) => b.at.localeCompare(a.at));
        const top = (key: "category" | "merchant") => {
          const by: Record<string, number> = {};
          for (const t of counted) by[t[key]] = cents((by[t[key]] ?? 0) + t.amount);
          return Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6));
        };
        // Covered buys (a blackjack win, the goal order paid from the goal fund) never touched today: listed, not totaled.
        const counted = txns.filter((t) => !t.covered);
        const big = counted.reduce<Txn | null>((b, t) => (!b || t.amount > b.amount ? t : b), null);
        const row = (t: Txn) => ({ date: date(new Date(t.at)), merchant: t.merchant, amount: t.amount, category: t.category, ...(t.covered ? { free: "won at blackjack or paid from the goal fund; not counted against today" } : {}) });
        return {
          period, from: date(from), to: date(new Date(Math.min(+to, +at))), filters: { merchant, category, min_amount, kind },
          total: cents(counted.reduce((s, t) => s + t.amount, 0)), count: counted.length,
          by_category: top("category"), by_merchant: top("merchant"), biggest: big && row(big), latest: txns.slice(0, 8).map(row),
        };
      },
    ),
    tool("get_bills", "His recurring bills and subscriptions: what each costs, when it's next due, the monthly total, and what's due in the next N days (default 7).",
      Type.Object({ days: Type.Optional(Type.Number()) }),
      ({ days = 7 }) => {
        const at = now();
        const done = Object.values(state.apps).filter((a) => a.kind === "proposal" && a.state.status === "done");
        const cancelled = new Set(done.filter((a) => a.state.find === "unused").map((a) => a.state.merchant));
        const lowered = new Map<string, number>(done.filter((a) => a.state.find === "bill").map((a) => [a.state.merchant, a.state.was])); // negotiated back down
        const subs = new Map(state.subscriptions.map((s) => [s.merchant, s]));
        const bills = [...billHistory(at)]
          .filter(([merchant, xs]) => !cancelled.has(merchant) && (+at - +new Date(xs.at(-1)!.at)) / DAY < 40) // still billing
          .map(([merchant, xs]) => {
            const last = xs.at(-1)!;
            const up = state.upcoming.find((u) => u.merchant === merchant && new Date(u.at) > at);
            const next = up ? new Date(up.at) : addMonth(new Date(last.at));
            return { merchant, amount: lowered.get(merchant) ?? up?.amount ?? last.amount, ...(lowered.has(merchant) ? { negotiated_down_from: last.amount } : {}), previous_charge: xs.at(-2)?.amount ?? null, last_charged: date(new Date(last.at)),
              next_due: date(next), next_ms: +next, subscription: subs.has(merchant), ...(subs.get(merchant)?.cadence === "yearly" ? { yearly: true } : {}) };
          });
        for (const u of state.upcoming) // first-time bills with no history yet
          if (new Date(u.at) > at && !bills.some((b) => b.merchant === u.merchant))
            bills.push({ merchant: u.merchant, amount: u.amount, previous_charge: null, last_charged: "never", next_due: date(new Date(u.at)), next_ms: +new Date(u.at), subscription: subs.has(u.merchant) });
        bills.sort((a, b) => a.next_ms - b.next_ms);
        const soon = bills.filter((b) => b.next_ms - +at <= days * DAY);
        const clean = (b: (typeof bills)[number]) => { const { next_ms, ...rest } = b; return rest; };
        return {
          monthly_total: cents(bills.filter((b) => !("yearly" in b)).reduce((s, b) => s + b.amount, 0)),
          already_set_aside_in_today_number: true,
          due_next: { days, total: cents(soon.reduce((s, b) => s + b.amount, 0)), bills: soon.map(clean) },
          all: bills.map(clean),
        };
      }),
    tool("get_accounts", "His account balances: checking, savings, and Dime Invest (the fund ledger), plus which accounts are connected.", none, () => {
      const at = now();
      const latest = (account: "checking" | "savings") => state.balances.filter((b) => b.account === account && new Date(b.at) <= at).sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.balance ?? null;
      const { accounts: list } = accounts();
      const [checking, savings, invested] = [latest("checking"), latest("savings"), summary().invested.total];
      return {
        checking, savings, invested, goal_fund: goalFund(),
        total: cents((checking ?? 0) + (savings ?? 0) + invested + goalFund()), no_debts_tracked: true,
        connected: list.filter((a) => a.connected).map((a) => a.name), not_connected: list.filter((a) => !a.connected).map((a) => a.name),
      };
    }),
    tool("get_portfolio", "His investments (paper ledger): total value, gain, this month's change, and each fund's value, cost, gain and share of the total.", none, () => {
      const inv = summary().invested;
      const cost: Record<string, number> = {};
      for (const l of state.ledger) cost[l.fund] = (cost[l.fund] ?? 0) + l.amount;
      const put_in = Object.values(cost).reduce((s, n) => s + n, 0);
      return {
        total_value: inv.total, put_in: cents(put_in), gain: cents(inv.total - put_in), gain_pct: put_in ? Math.round(((inv.total - put_in) / put_in) * 1000) / 10 : 0,
        change_this_month: inv.month_delta, waiting_for_a_fund: inv.waiting, losses_go_to: state.user.fund,
        funds: inv.funds.map((f) => ({ id: f.id, name: f.name, value: f.value, put_in: cost[f.id], gain_pct: f.change_pct, share_pct: inv.total ? Math.round((f.value / inv.total) * 100) : 0, risk: RISK[fund(f.id).risk] })),
        returns_are_illustrative: true,
      };
    }),
    tool("get_fund_info", "What a fund in his menu is (S&P 500 VOO, Nasdaq-100 QQQ, Semiconductors SOXX, Memory DRAM, Cash): what it holds, risk, who it's good for. Omit fund for the whole menu.",
      Type.Object({ fund: Type.Optional(Type.Union(FUNDS.map((f) => Type.Literal(f.id)))) }),
      ({ fund: id }) => {
        const info = (f: (typeof FUNDS)[number]) => ({ id: f.id, name: f.name, ticker: f.ticker, risk: RISK[f.risk], what: f.blurb, good_for: f.goodFor, detail: f.more,
          illustrative_return: `${f.ret.pct}% (${f.ret.period}), illustrative, not a real return` });
        return id ? info(fund(id)) : { funds: FUNDS.map(info), his_fund_for_losses: state.user.fund };
      }),
    tool("find_savings", "Scan his bills, subscriptions and cash for money to save (bills that went up, subscriptions he doesn't use or trials about to charge, idle cash) and send an approve card for each new find. Also returns spending categories running hot vs last month.",
      Type.Object({ only: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("cancel")], { description: "cancel = he asked what to cancel, or about bills/subscriptions: only bill and subscription finds. all (default) = how to save in general, includes idle cash." })) }),
      ({ only = "all" }) => {
      const r = findSavings(only);
      apps.push(...r.apps);
      const brief = (p: Proposal) => ({ find: p.title, merchant: p.merchant, amount: p.amount, ...(p.was ? { was: p.was } : {}) });
      return { new_cards_sent: r.fresh.map(brief), already_proposed_earlier: r.already.map(brief), spending_running_hot: r.trends };
    }),
    tool("propose_move",
      "Send an approve card to move money: from today's number into a fund (spending it on his future instead), or from checking into a fund or the goal. Nothing moves until he taps Approve. Use when he says put/move/invest $X somewhere.",
      Type.Object({
        amount: Type.Number(),
        to: Type.Union([...FUNDS.map((f) => Type.Literal(f.id)), Type.Literal("goal")], { description: "A fund id, or goal" }),
        from: Type.Union([Type.Literal("today"), Type.Literal("checking")], { description: "today = out of today's number; checking = out of his checking balance" }),
      }),
      ({ amount, to, from }) => {
        const at = now();
        if (!(amount > 0)) throw new Error("amount must be positive");
        const left = money.today(state, at);
        if (from === "today" && to === "goal") throw new Error("Today's leftover already moves to the goal at midnight on its own; tell him that. Use from checking to add more now.");
        if (from === "today" && amount > left) throw new Error(`Only $${left} left today. Offer from checking instead, or a smaller amount.`);
        const bal = state.balances.filter((b) => b.account === "checking").sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.balance ?? 0;
        if (from === "checking" && amount > bal) throw new Error(`Checking only has $${bal}.`);
        const name = to === "goal" ? money.activeGoal(state).name : fund(to).name;
        const source = from === "today" ? "today's number" : "checking";
        apps.push(open("proposal", {
          find: "move", key: `move:${crypto.randomUUID()}`, amount, from, to,
          title: `Move to ${name}`,
          summary: `Move ${usd(amount)} from ${source} into the ${name}?`,
          artifact: { name, note: `From ${source}`, now: usd(amount) },
          verb: `Move ${usd(amount)}`, working: `Approved · moving ${usd(amount)}`, declined: "Not now. Nothing moved.",
        }));
        return { card_sent: true, amount, from, to: name, today_left: left, ...(to !== "goal" ? { risk: RISK[fund(to).risk] } : {}) };
      }),
    tool("search_news", "Recent news headlines (last 2 weeks, real newsrooms) for a market, economy or money question only, e.g. \"semiconductor stocks\" or \"S&P 500 this week\". Answer in a line or two and put the best link on its own line.",
      Type.Object({ query: Type.String() }),
      async ({ query }) => {
        const hits = await exaSearch(query).catch(() => []);
        if (!hits.length) return { results: [], note: "No news came back. Say you couldn't pull headlines right now; don't make any up." };
        return { results: hits.slice(0, 3).map((h) => ({ title: h.title, source: new URL(h.url).hostname.replace(/^www\./, ""), url: h.url, published: h.published, snippet: h.snippet?.slice(0, 200) })) };
      }),
    tool(
      "start_blackjack",
      "Send the blackjack card for a purchase. Only when the price fits in today's number. Win: the item is free. Lose: the price goes into his fund.",
      Type.Object({ item: Type.String({ description: "What he wants, short, e.g. 'sneakers'" }), price: Type.Number() }),
      ({ item, price }) => {
        const left = money.today(state, now());
        if (!(price > 0)) throw new Error("price must be positive");
        if (price > left) throw new Error(`Can't bet $${price}: only $${left} left today. Tell him in one line and send show_girl_math.`);
        if (!state.user.blackjack) throw new Error("Impulse blackjack is off in his Settings. No card: just tell him whether it fits.");
        apps.push(open("blackjack", { item, amount: price }));
        return { sent: true, item, price, today_left: left };
      },
    ),
    tool("open_funds", "Send the fund picker card (broad index funds, sector ETFs SOXX and DRAM, and cash) so he can choose where invested money goes.", none, () => {
      apps.push(open("funds", {}));
      return { sent: true, current_fund: state.user.fund };
    }),
    tool(
      "add_goal",
      "Add a savings goal to his list. Call it as soon as he asks to add or save for something (saying you'll add it doesn't add it). Goals fill in priority order: the first unfinished one gets every sweep, overflow rolls to the next. Default position is last (it starts once the ones ahead fill); \"after the iPhone\" = the iPhone's priority + 1. position 1 jumps it ahead of the goal he's saving for now: only once he has said yes to that (ask: first, or after the current one?). Price in dollars.",
      Type.Object({
        name: Type.String({ description: "Short name, e.g. 'Tokyo trip'" }),
        price: Type.Number(),
        emoji: Type.String({ description: "One emoji for it" }),
        store: Type.Optional(Type.String({ description: "Only for a thing he'd buy: where to order it (Apple, Nike). Omit for trips, funds, experiences." })),
        position: Type.Optional(Type.Number({ description: "1-based priority. Omit = last." })),
        confirmed: Type.Optional(Type.Boolean({ description: "true once he said yes to putting it ahead of an unfinished goal" })),
      }),
      (p) => {
        guardTop(p.position === 1 ? null : undefined, p.confirmed, p.name);
        const g = addGoal(p);
        apps.push(open("goal", { id: g.id, delta: 0 }));
        return goalState(g.id);
      },
    ),
    tool(
      "update_goal",
      "Change a goal's name, price, emoji or store. Find it by id or name. What it saved stays (any surplus over a lower price rolls to the next goal).",
      Type.Object({
        goal: Type.String({ description: "Its id or name" }),
        name: Type.Optional(Type.String()),
        price: Type.Optional(Type.Number()),
        emoji: Type.Optional(Type.String()),
        store: Type.Optional(Type.String()),
      }),
      ({ goal, ...fields }) => goalState(updateGoal(goal, fields).id),
    ),
    tool(
      "reorder_goals",
      "Reprioritize his goals: list them (ids or names) first to last; any left out keep their order after. Each goal keeps what it saved; new sweeps go to the new first one. If that bumps an unfinished goal he's saving for now, ask first and pass confirmed only after he says yes.",
      Type.Object({
        order: Type.Array(Type.String()),
        confirmed: Type.Optional(Type.Boolean({ description: "true once he said yes to bumping the goal he's saving for now" })),
      }),
      ({ order, confirmed }: { order: string[]; confirmed?: boolean }) => {
        for (const k of order) if (!findGoal(k)) throw new Error(`No goal called ${k}. get_goal lists them.`);
        guardTop(order[0] ?? null, confirmed);
        reorderGoals(order);
        apps.push(open("goal", { delta: 0 }));
        return { goals: goalList().map((g, i) => ({ priority: i + 1, name: g.name, pct: g.pct, status: g.status, eta_date: date(money.etaDate(state, now(), g.eta_days)) })) };
      },
    ),
    tool(
      "remove_goal",
      "Remove a goal he no longer wants (by id or name). What it had saved rolls to the next goals. He must keep at least one unfinished goal.",
      Type.Object({ goal: Type.String({ description: "Its id or name" }) }),
      ({ goal }) => {
        const g = removeGoal(goal);
        return { removed: g.name, goals: goalList().map((x, i) => ({ priority: i + 1, name: x.name, saved: x.saved, pct: x.pct, status: x.status })) };
      },
    ),
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
    tool(
      "update_settings",
      "Change his settings when he asks (the same ones as the Settings page): monthly take-home pay, monthly invest habit (set aside before today's number), hourly pay (for hours-of-work math), where blackjack losses go (fund), impulse blackjack on/off, CFO tips on/off. Only the fields he changed. Tone and goal have their own tools.",
      Type.Object({
        income: Type.Optional(Type.Number()),
        invest: Type.Optional(Type.Number()),
        hourly: Type.Optional(Type.Number()),
        fund: Type.Optional(Type.Union(FUNDS.map((f) => Type.Literal(f.id)))),
        blackjack: Type.Optional(Type.Boolean()),
        tips: Type.Optional(Type.Boolean()),
      }),
      (args) => {
        const s = updateSettings(args as Record<string, unknown>);
        return { ...s, today: money.today(state, now()) };
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
