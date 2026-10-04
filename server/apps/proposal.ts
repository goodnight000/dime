// The `proposal` mini app: one CFO find with Approve / Not now inside the card (cfo.ts makes them).
// Approve flips it to "working" at once; cfo.carry() finishes it after a staged pause.
import { id, type App, type FundId } from "../state.ts";
import { carry } from "../cfo.ts";

// bill: a recurring bill went up · unused: a subscription to cancel · idle: cash to move · savings: a
// fixed bill's saving to the goal · move: Charles's own "put $X into Y" (Dime's propose_move).
export type Find = "bill" | "unused" | "idle" | "savings" | "move" | EventFind;
// Raised by simulated events (simulate.ts): dispute a duplicate charge, freeze the card over a
// charge Charles doesn't know, top checking up from savings, invest part of a paycheck, pay a
// friend's Venmo request.
export type EventFind = "dispute" | "freeze" | "topup" | "invest" | "pay";
export type ProposalState = {
  find: Find;
  title: string; // the small line: "Comcast went up"
  summary: string; // the ask, one sentence
  // The thing itself, drawn on the inset: name left; right "was → now delta" and/or a note.
  artifact: { name: string; was?: string; now?: string; delta?: string; note?: string } | null;
  verb?: string; // the yes button, answering the card's question: "Call Comcast" (default "Approve")
  working: string; // the answer row while it runs: "Approved · calling Comcast"
  declined: string; // the answer row after Not now
  no?: string; // the no button when "Not now" doesn't answer the question ("It was me")
  status: "open" | "working" | "done" | "declined" | "failed";
  outcome: { text: string; money?: string } | null; // `money` is the part of `text` shown in --money
  saved?: number; // savings: the monthly amount going to the goal
  key?: string; // what the find is about ("bill:Comcast"), so a rescan doesn't propose it twice
  merchant?: string; // bill / unused / savings: whose bill or subscription
  amount?: number; // the dollars in play: the bill's rise, the subscription's price, the move
  was?: number; // bill: the charge before the rise
  from?: "checking" | "today"; // move / idle: where the money comes from
  to?: FundId | "goal"; // move: where it goes
};

export function create(input: Omit<ProposalState, "status" | "outcome">): App {
  const s: ProposalState = { ...input, artifact: input.artifact ?? null, status: "open", outcome: null };
  return { id: id(), kind: "proposal", version: 1, state: s };
}

export const actions: Record<string, (app: App, body: any) => void> = {
  approve: (app) => {
    const s = app.state as ProposalState;
    if (s.status !== "open" && s.status !== "failed") return; // already answered
    s.status = "working";
    void carry(app);
  },
  decline: (app) => {
    const s = app.state as ProposalState;
    if (s.status === "open" || s.status === "failed") s.status = "declined";
  },
};
