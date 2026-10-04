// The CFO: finds things worth fixing, proposes each as a `proposal` card, and carries out what
// Charles approves. Nothing moves before Approve. Bills come from state.txns; the bank-feed history
// the demo has no other home for (last month's Comcast price, Hulu usage, the idle checking
// balance) is the mock data below.
import { state, type App } from "./state.ts";
import { now } from "./clock.ts";
import * as money from "./money.ts";
import { open } from "./apps/index.ts";
import { fund } from "./funds-data.ts";
import { say, speak, usd, day } from "./voice.ts";
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
      verb: "Call Comcast",
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
      verb: "Cancel Hulu",
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
      verb: `Move ${usd(IDLE.move)}`,
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
  if (!finds.length) return say("dime", "checked everything. nothing to fix. suspicious 🤨");
  const apps = finds.map((p) => open("proposal", p));
  const list = finds.map((p) => `${p.title}: ${p.summary}`).join(" | ");
  return speak("dime", `You (the CFO) just scanned Charles's accounts and found ${finds.length} thing${finds.length === 1 ? "" : "s"} worth fixing, each as an approve/decline card that follows your words: ${list}. Intro only, one bubble, don't list them.`,
    [`found ${finds.length} thing${finds.length === 1 ? "" : "s"} 👀 cards below`, ...apps]);
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
      artifact: { name: goal.name, note: `${money.lag(state, now(), saved)} sooner each month`, now: `${usd(saved)}/mo` },
      verb: `Send ${usd(saved)}/mo`,
      working: "Approved · setting it up",
      declined: `Not now. The ${usd(saved)} stays in your budget.`,
      saved,
    });
    return {
      outcome: { text: `Back to ${usd(COMCAST_WAS)}/mo. Saving ${usd(saved)}/mo.`, money: `${usd(saved)}/mo` },
      lines: [`called Comcast 📞 back to ${usd(COMCAST_WAS)}/mo`, offer],
    };
  },
  hulu: () => ({
    outcome: { text: `Cancelled. ${usd(HULU.price)}/mo back.`, money: `${usd(HULU.price)}/mo` },
    // Same unit as the Comcast card: what one month's saving buys, every month.
    lines: [`Hulu's gone. ${usd(HULU.price)}/mo back 💅`, `${state.goal.name} ${money.lag(state, now(), HULU.price)} sooner each month`],
  }),
  idle: () => {
    const at = now().toISOString();
    if (state.user.fund) {
      state.ledger.push({ fund: state.user.fund, amount: IDLE.move, at, reason: "cfo" });
      const to = `${usd(IDLE.move)} → ${fundName()}`;
      return { outcome: { text: `Moved ${to}`, money: usd(IDLE.move) }, lines: [`${to}. your cash has a job now 💼`] };
    }
    // No fund yet: the funds card's pick moves it (funds.ts reads pendingInvest).
    // ponytail: one pending slot; a blackjack loss already waiting keeps it and this move is dropped.
    state.pendingInvest ??= { amount: IDLE.move, reason: "cfo", at };
    return {
      outcome: { text: `Approved. ${usd(IDLE.move)} goes where you pick.`, money: usd(IDLE.move) }, // still true after the pick
      lines: [`where should the ${usd(IDLE.move)} live? 👇`, open("funds")],
    };
  },
  savings: (s) => {
    const saved = s.saved ?? 0;
    state.goal.saved += saved;
    return {
      outcome: { text: `${usd(saved)}/mo → ${state.goal.name}`, money: `${usd(saved)}/mo` },
      lines: [`first ${usd(saved)} is in 📱`, open("goal", { delta: saved })],
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
  const said = result.lines.filter((l) => typeof l === "string").join(" ");
  const cards = result.lines.filter((l) => typeof l !== "string").map((l) => { const a = l as App; return a.kind === "proposal" ? `proposal (it asks "${a.state.summary}" itself, so don't ask it, and don't say it is happening: nothing moves until he approves that card)` : a.kind; });
  await speak("dime", `Charles approved "${s.title}" and you just did it. Result: ${result.outcome?.text} ${said}${cards.length ? ` A ${cards.join(" and ")} card follows your words.` : ""}`, result.lines);
}
