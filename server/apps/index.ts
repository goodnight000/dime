// Mini app registry: open() stores a new app; run() applies an action and bumps its version so
// the chat re-renders only that card.
import { state, type App, type AppKind } from "../state.ts";
import * as blackjack from "./blackjack.ts";
import * as funds from "./funds.ts";
import * as goal from "./goal.ts";
import * as proposal from "./proposal.ts";
import * as market from "./market.ts";
import * as today from "./today.ts";

type Kind = {
  create: (input?: any) => App;
  actions: Record<string, (app: App, body: any) => void | Promise<void>>;
};
export const kinds: Record<AppKind, Kind> = { blackjack, funds, goal, proposal, market, today };

export function open(kind: AppKind, input?: any): App {
  const app = kinds[kind].create(input);
  state.apps[app.id] = app;
  return app;
}

/** Applies `action`; null when the app or action does not exist. */
export async function run(appId: string, action: string, body: any): Promise<App | null> {
  const app = state.apps[appId];
  const handler = app && kinds[app.kind].actions[action];
  if (!handler) return null;
  await handler(app, body ?? {});
  app.version++;
  return app;
}
