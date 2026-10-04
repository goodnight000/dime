import type { Screen } from "./main.ts";

// Placeholder: the dashboard agent builds this from GET /api/summary.
const dashboard: Screen = (main) => {
  main.innerHTML = `<header class="page-head"><h1>Dashboard</h1></header><p class="muted">Coming.</p>`;
};
export default dashboard;
