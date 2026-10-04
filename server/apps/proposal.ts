// The `proposal` mini app: one CFO find with Approve / Not now inside the card (cfo.ts makes them).
// Approve flips it to "working" at once; cfo.carry() finishes it after a staged pause.
import { id, type App } from "../state.ts";
import { carry } from "../cfo.ts";

export type Find = "comcast" | "hulu" | "idle" | "savings";
export type ProposalState = {
  find: Find;
  title: string; // the small line: "Comcast went up"
  summary: string; // the ask, one sentence
  // The thing itself, drawn on the inset: name left; right "was → now delta" and/or a note.
  artifact: { name: string; was?: string; now?: string; delta?: string; note?: string } | null;
  working: string; // the answer row while it runs: "Approved · calling Comcast"
  declined: string; // the answer row after Not now
  status: "open" | "working" | "done" | "declined" | "failed";
  outcome: { text: string; money?: string } | null; // `money` is the part of `text` shown in --money
  saved?: number; // savings: the monthly amount going to the goal
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
