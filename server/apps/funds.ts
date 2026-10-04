// The `funds` mini app: pick where losses go. Picking sets state.user.fund and, if a loss is waiting
// for a fund (state.pendingInvest), moves it into the ledger in that fund and Dime confirms.
import { state, id, type App, type FundId } from "../state.ts";
import { FUNDS, RISK, fund, isFund } from "../funds-data.ts";
import { say, usd } from "../voice.ts";

const WON = ["win", "blackjack", "dime-bust"];

export type FundsState = {
  funds: (typeof FUNDS)[number][];
  risk: typeof RISK;
  selected: FundId; // preselected row: the current fund, else the CFO's default
  picked: FundId | null; // set once confirmed; the card is a record after that
};

export function create(): App {
  const s: FundsState = { funds: FUNDS, risk: RISK, selected: state.user.fund ?? "VOO", picked: null };
  return { id: id(), kind: "funds", version: 1, state: s };
}

export const actions: Record<string, (app: App, body: any) => void> = {
  pick: (app, body) => {
    const s = app.state as FundsState;
    if (s.picked) return; // already answered; a second tap changes nothing
    if (!isFund(body.fund)) throw new Error("unknown fund");
    s.picked = s.selected = body.fund;
    state.user.fund = body.fund;
    const f = fund(body.fund);
    const into = f.id === "CASH" ? "Cash" : `the ${f.name}`;
    const owed = state.pendingInvest;
    if (owed) {
      state.ledger.push({ fund: f.id, amount: owed.amount, at: owed.at, reason: owed.reason });
      state.pendingInvest = null;
      // The hand that lost it still reads "waiting for a fund": point it at the fund it went to.
      for (const a of Object.values(state.apps))
        if (a.kind === "blackjack" && a.state.result && !a.state.fund && !WON.includes(a.state.result)) {
          a.state.fund = { id: f.id, name: f.name };
          a.version++;
        }
      void say("dime", `${usd(owed.amount)} into ${into}. Future you says thanks.`);
    } else void say("dime", `Locked in. Lose a hand and it lands in ${into}.`);
  },
};
