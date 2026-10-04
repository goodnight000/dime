// Accounts (GET /api/accounts, POST /api/accounts/:id/connect): a mock bank, the paper brokerage,
// and two services that are not connected yet. Connection state lives in state.accounts.
import { state, type Account } from "./state.ts";
import { now } from "./clock.ts";
import { summary } from "./summary.ts";

type Meta = { name: string; kind: Account["kind"]; glyph: "bank" | "mark" | "card" | "chart"; blurb: string; numbers: string; connected: boolean };
// In display order. `numbers` is the connected subtitle; Dime Invest's is computed from the ledger.
const CATALOG: Record<string, Meta> = {
  chase: { name: "Chase", kind: "bank", glyph: "bank", blurb: "Checking and savings", numbers: "Checking ••4821 · Savings ••0937", connected: true },
  dime: { name: "Dime Invest", kind: "brokerage", glyph: "mark", blurb: "Paper brokerage", numbers: "", connected: true },
  amex: { name: "Amex Gold", kind: "bank", glyph: "card", blurb: "Credit card", numbers: "Gold card ••3007", connected: false },
  venmo: { name: "Venmo", kind: "bank", glyph: "card", blurb: "Pays out friend bets", numbers: "@charles-z ••2290", connected: false },
  robinhood: { name: "Robinhood", kind: "brokerage", glyph: "chart", blurb: "Stocks and crypto", numbers: "Individual ••5512", connected: false },
};

/** state.accounts with every catalog entry present (the seed predates some of them). */
function rows(): Account[] {
  for (const [id, m] of Object.entries(CATALOG))
    if (!state.accounts.some((a) => a.id === id)) state.accounts.push({ id, name: m.name, kind: m.kind, connected: m.connected });
  return Object.keys(CATALOG).map((id) => state.accounts.find((a) => a.id === id)!);
}

export function accounts() {
  const s = summary();
  const inv = s.invested;
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const list = rows().map((a) => {
    const m = CATALOG[a.id];
    const numbers =
      a.id === "dime"
        ? `Paper ledger · ${usd.format(inv.total)} in ${inv.funds.length} fund${inv.funds.length === 1 ? "" : "s"}`
        : m.numbers;
    return { id: a.id, name: m.name, kind: a.kind, glyph: m.glyph, connected: a.connected, subtitle: a.connected ? numbers : m.blurb };
  });
  const chase = state.accounts.find((a) => a.id === "chase");
  // Five most recent Chase transactions up to the demo clock, newest first.
  const at = now();
  const recent = chase?.connected
    ? state.txns
        .filter((t) => new Date(t.at) <= at)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 5)
        .map((t) => ({ id: t.id, at: t.at, merchant: t.merchant, kind: t.kind, amount: t.kind === "income" || t.kind === "refund" ? t.amount : -t.amount }))
    : [];
  return { accounts: list, recent };
}

/** Connects a mock account. Unknown ids are refused (the client shows its error state). */
export function connect(id: string) {
  rows();
  const a = state.accounts.find((x) => x.id === id && CATALOG[x.id]);
  if (!a) return null;
  a.connected = true;
  return a;
}

/** Demo only: puts an account back to not connected, so the connect flow can be shown again. */
export function disconnect(id: string) {
  rows();
  const a = state.accounts.find((x) => x.id === id);
  if (a) a.connected = false;
  return a ?? null;
}
