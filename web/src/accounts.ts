import "./accounts.css";
import type { Screen } from "./main.ts";

// Placeholder: the accounts agent builds fake bank + brokerage connect on GET /api/accounts.
// Forth's original screen (and the styles kept in accounts.css) is at
// ~/Developer/forth-frontend/apps/app/src/accounts.ts for reference.
const accounts: Screen = (main) => {
  main.innerHTML = `<header class="page-head"><h1>Accounts</h1></header><p class="muted">Coming.</p>`;
};
export default accounts;
