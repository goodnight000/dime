// Mini app renderers by kind. A renderer draws `app` into `el`, the card's li in the thread. It is
// called again with the same li each time the app's version changes, and owns the li's children:
// chat.ts never clears them, so a renderer can diff against its own last state (keep a
// WeakMap<li, prev>) and animate the change. First call with no prev: draw the final state, still.
// The thread only toggles its own classes on the li (b, out, app, first, last, new).
// `act` POSTs /api/apps/:id/:action and pulls the thread at once.
import type { App, AppKind } from "../api.ts";
import blackjack from "./blackjack.ts";
import funds from "./funds.ts";
import goal from "./goal.ts";
import proposal from "./proposal.ts";
import market from "./market.ts";
import today from "./today.ts";

export type Act = (action: string, body?: object) => Promise<void>;
export type Renderer = (el: HTMLElement, app: App, act: Act) => void;

export const renderers: Record<AppKind, Renderer> = { blackjack, funds, goal, proposal, market, today };

/** The wave 0 placeholder every kind starts from: its name, its state, and a ping to prove `act`. */
export function placeholder(el: HTMLElement, app: App, act: Act) {
  el.innerHTML = `<div class="stub"><b></b><pre></pre><button type="button" class="link">ping</button></div>`;
  el.querySelector("b")!.textContent = app.kind;
  el.querySelector("pre")!.textContent = JSON.stringify(app.state, null, 1);
  el.querySelector("button")!.onclick = () => void act("ping");
}
