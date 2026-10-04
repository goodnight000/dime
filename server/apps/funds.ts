// The `funds` mini app. Stub from wave 0: the owning agent replaces the state shape and actions.
import { id, type App } from "../state.ts";

export function create(input: any = {}): App {
  return { id: id(), kind: "funds", version: 1, state: { ...input } };
}

export const actions: Record<string, (app: App, body: any) => void> = {
  ping: (app) => {
    app.state.pings = (app.state.pings ?? 0) + 1;
  },
};
