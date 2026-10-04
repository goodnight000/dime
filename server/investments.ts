// The Investments view (GET /api/investments): the dashboard's Invested block with more telemetry.
// Same math as summary.ts (worth, invested) over the ledger and the demo clock, so the totals agree.
import { state, type State } from "./state.ts";
import { FUNDS, RISK } from "./funds-data.ts";
import { now } from "./clock.ts";
import { dayStart } from "./money.ts";
import { invested, worth } from "./summary.ts";

const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SOURCE: Record<string, string> = {
  blackjack: "Lost a hand at blackjack",
  cfo: "Idle cash moved",
  paycheck: "From your paycheck",
  deposit: "You moved it in",
  today: "Left over from today",
};
const source = (reason: string) => SOURCE[reason] ?? (reason ? reason[0].toUpperCase() + reason.slice(1) : "Added");

export function investments(s: State = state, at = now()) {
  const inv = invested(s, at);
  const ledger = s.ledger; // as invested() counts it
  const cost = ledger.reduce((t, e) => t + e.amount, 0);

  // One close per day from the first entry's day to today; today's point is the total.
  const first = ledger.reduce((m, e) => Math.min(m, dayStart(new Date(e.at)).getTime()), dayStart(at).getTime());
  const series: { date: string; value: number; cost: number }[] = [];
  for (let t = first; t < dayStart(at).getTime() + DAY / 2; t += DAY) {
    const day = new Date(dayStart(new Date(t + DAY / 2)).getTime() + DAY / 2); // DST-safe noon
    const end = dayStart(day).getTime() + DAY;
    series.push({
      date: ymd(day),
      value: cents(ledger.reduce((v, e) => v + worth(e, day), 0)),
      cost: cents(ledger.reduce((v, e) => v + (new Date(e.at).getTime() < end ? e.amount : 0), 0)), // put in by that night
    });
  }
  if (series.length) series[series.length - 1].value = inv.total;

  const funds = inv.funds.map((f) => {
    const meta = FUNDS.find((x) => x.id === f.id);
    const fcost = ledger.filter((e) => e.fund === f.id).reduce((t, e) => t + e.amount, 0);
    return {
      id: f.id,
      name: f.name,
      ticker: meta?.ticker ?? f.id,
      issuer: ({ VOO: "Vanguard", QQQ: "Invesco", SOXX: "iShares", DRAM: "Roundhill", CASH: "Cash" } as Record<string, string>)[f.id] ?? f.name,
      value: f.value,
      cost: cents(fcost),
      return_pct: f.change_pct,
      risk: meta ? RISK[meta.risk] : "",
      share: inv.total ? Math.round((f.value / inv.total) * 1000) / 1000 : 0,
      blurb: meta?.blurb ?? meta?.fact ?? "",
    };
  });

  const contributions = [
    ...(s.pendingInvest ? [{ date: s.pendingInvest.at, amount: s.pendingInvest.amount, fund: null as string | null, fund_name: "Waiting for a fund", source: source(s.pendingInvest.reason), waiting: true }] : []),
    ...ledger.map((e) => ({ date: e.at, amount: e.amount, fund: e.fund as string | null, fund_name: FUNDS.find((x) => x.id === e.fund)?.name ?? e.fund, source: source(e.reason), waiting: false })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    now: at.toISOString(),
    total: inv.total,
    month_delta: inv.month_delta,
    month_name: at.toLocaleString("en-US", { month: "long" }),
    cost: cents(cost),
    gain: cents(inv.total - cost),
    gain_pct: cost ? Math.round(((inv.total - cost) / cost) * 1000) / 10 : 0,
    waiting: inv.waiting,
    series,
    funds,
    contributions,
  };
}
export type Investments = ReturnType<typeof investments>;
