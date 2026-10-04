// The CFO: finds things worth fixing, proposes each as a `proposal` card, and carries out what
// Charles approves. Nothing moves before Approve. Bills come from state.txns; the bank-feed history
// the demo has no other home for (last month's Comcast price, Hulu usage, the idle checking
// balance) is the mock data below.
import { state, type App } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fund } from "./funds-data.ts";
import { say, usd, day } from "./voice.ts";
import type { Find, ProposalState } from "./apps/proposal.ts";

const DAY = 86_400_000;
const COMCAST_WAS = 47; // last month's bill, before the promo ended
const HULU = { price: 19, idleDays: 51 };
const IDLE = { balance: 4000, months: 3, move: 2000 };
const WORK_MS: Record<Find, number> = { comcast: 3200, hulu: 1600, idle: 1400, savings: 900 };

const comcastNow = () => state.txns.filter((t) => t.merchant === "Comcast" && t.kind === "bill").at(-1)?.amount;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const fundName = () => (state.user.fund ? fund(state.user.fund).name : null);

type Proposal = Omit<ProposalState, "status" | "outcome">;
const FINDS: Record<Exclude<Find, "savings">, () => Proposal | null> = {
  comcast: () => {
    const was = COMCAST_WAS;
    const is = comcastNow();
    if (!is || is <= was) return null;
    return {
      find: "comcast",
      title: "Comcast went up",
      summary: `Your promo ended. Want me to call them and get it back?`,
      artifact: { name: "Comcast", was: usd(was), now: `${usd(is)}/mo`, delta: `+${usd(is - was)}` },
      working: "Approved · calling Comcast",
      declined: "Not now. I'll check again next month.",
    };
  },
  hulu: () => {
    const last = new Date(now().getTime() - HULU.idleDays * DAY);
    return {
      find: "hulu",
      title: `No Hulu in ${Math.floor(HULU.idleDays / 7)} weeks`,
      summary: `Still paying ${usd(HULU.price)} a month for it. Cancel?`,
      artifact: { name: "Hulu", note: `Last used ${day(last)}`, now: `${usd(HULU.price)}/mo` },
      working: "Approved · cancelling Hulu",
      declined: "Not now. I'll check again next month.",
    };
  },
  idle: () => {
    const into = fundName();
    return {
      find: "idle",
      title: "Idle cash",
      summary: `${usd(IDLE.balance)} has sat in checking for ${IDLE.months} months. Move ${usd(IDLE.move)} ${into ? `to the ${into}` : "into a fund"}?`,
      artifact: { name: "Chase Checking", note: `${IDLE.months} months idle`, now: usd(IDLE.balance) },
      working: `Approved · moving ${usd(IDLE.move)}`,
      declined: "Not now. I'll check again next month.",
    };
  },
};

const proposals = () => Object.values(state.apps).filter((a) => a.kind === "proposal");

/** Demo `cfo-scan`: one "Found N things." then a card per find not already on the table. */
export function cfoScan() {
  const taken = new Set(proposals().filter((a) => a.state.status !== "failed").map((a) => a.state.find));
  const finds = (Object.keys(FINDS) as (keyof typeof FINDS)[])
    .filter((f) => !taken.has(f))
    .map((f) => FINDS[f]())
    .filter((p) => p !== null);
  if (!finds.length) return say("dime", "Checked everything. Nothing to fix. Suspicious.");
  const apps = finds.map((p) => open("proposal", p));
  return say("dime", `Found ${finds.length} thing${finds.length === 1 ? "" : "s"}.`, ...apps);
}

type Result = { outcome: ProposalState["outcome"]; lines: (string | App)[] };
const OUTCOMES: Record<Find, (s: ProposalState) => Result> = {
  comcast: () => {
    const saved = (comcastNow() ?? COMCAST_WAS) - COMCAST_WAS;
    const goal = state.goal;
    const offer = open("proposal", {
      find: "savings",
      title: "Comcast savings",
      summary: `Send the ${usd(saved)} to the ${goal.name} every month?`,
      artifact: { name: goal.name, note: `${days(money.delay(state, now(), saved))} sooner each month`, now: `${usd(saved)}/mo` },
      working: "Approved · setting it up",
      declined: `Not now. The ${usd(saved)} stays in your budget.`,
      saved,
    });
    return {
      outcome: { text: `Back to ${usd(COMCAST_WAS)}/mo. Saving ${usd(saved)}/mo.`, money: `${usd(saved)}/mo` },
      lines: [`Called Comcast. Back to ${usd(COMCAST_WAS)}/mo.`, offer],
    };
  },
  hulu: () => {
    const year = HULU.price * 12;
    return {
      outcome: { text: `Cancelled. ${usd(HULU.price)}/mo back.`, money: `${usd(HULU.price)}/mo` },
      lines: [`Hulu's gone. ${usd(year)} a year back.`, `${state.goal.name} ${days(money.delay(state, now(), year))} sooner 💅`],
    };
  },
  idle: () => {
    const at = now().toISOString();
    if (state.user.fund) {
      state.ledger.push({ fund: state.user.fund, amount: IDLE.move, at, reason: "cfo" });
      const to = `${usd(IDLE.move)} → ${fundName()}`;
      return { outcome: { text: `Moved ${to}`, money: usd(IDLE.move) }, lines: [`${to}. Your cash has a job now.`] };
    }
    // No fund yet: the funds card's pick moves it (funds.ts reads pendingInvest).
    // ponytail: one pending slot; a blackjack loss already waiting keeps it and this move is dropped.
    state.pendingInvest ??= { amount: IDLE.move, reason: "cfo", at };
    return {
      outcome: { text: `Approved. ${usd(IDLE.move)} goes where you pick.`, money: usd(IDLE.move) }, // still true after the pick
      lines: [`Where should the ${usd(IDLE.move)} live?`, open("funds")],
    };
  },
  savings: (s) => {
    const saved = s.saved ?? 0;
    state.goal.saved += saved;
    return {
      outcome: { text: `${usd(saved)}/mo → ${state.goal.name}`, money: `${usd(saved)}/mo` },
      lines: [`First ${usd(saved)} is in.`, open("goal", { delta: saved })],
    };
  },
};

/** Runs an approved proposal: a staged pause while the card says it's working, then the outcome. */
export async function carry(app: App) {
  const s = app.state as ProposalState;
  await Bun.sleep(WORK_MS[s.find]);
  if (state.apps[app.id] !== app) return; // reset while working
  let result: Result;
  try {
    result = OUTCOMES[s.find](s);
  } catch (e) {
    console.error("cfo", s.find, e);
    s.status = "failed";
    app.version++;
    return;
  }
  s.status = "done";
  s.outcome = result.outcome;
  app.version++;
  await say("dime", ...result.lines);
}
