import { api } from "./api.ts";
import type { Screen } from "./main.ts";

type Summary = { now: string; today: number; goal: { name: string; saved: number; price: number; pct: number } };

// Charles's control panel, opened in a second window: it fires the events the demo needs (a swipe,
// morning, midnight) and shows the demo clock and today's number. Not part of the app.
const PRESETS: [string, number, string][] = [
  ["Blue Bottle", 7, "coffee"],
  ["DoorDash", 24, "food"],
  ["Sneakers", 280, "shopping"],
];
const clock = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const demo: Screen = (main, _session, current) => {
  main.className = "demo";
  main.innerHTML = `
    <header class="page-head"><h1>Demo</h1><p class="readout"><span class="clock"></span><b class="today"></b></p></header>
    <section>
      <h2>Swipe</h2>
      <div class="presets"></div>
      <form class="swipe">
        <input name="merchant" placeholder="Merchant" required />
        <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required />
        <input name="category" placeholder="Category" />
        <button class="pill" type="submit">Swipe</button>
      </form>
    </section>
    <section>
      <h2>Time</h2>
      <div class="actions">
        <button class="pill" data-action="morning">Morning</button>
        <button class="pill" data-action="midnight">Midnight</button>
        <button class="pill" data-action="skip-day">Skip day</button>
        <button class="pill" data-action="reset">Reset</button>
      </div>
    </section>
    <section>
      <h2>Wave 1</h2>
      <div class="actions">
        <button class="pill" data-action="cfo-scan">CFO scan</button>
        <button class="pill" data-action="force-blackjack" data-body='{"result":"win"}'>Force blackjack win</button>
        <button class="pill" data-action="force-blackjack" data-body='{"result":"lose"}'>Force blackjack lose</button>
        <button class="pill" data-action="force-blackjack" data-body='{"result":"push"}'>Force blackjack push</button>
        <button class="pill" data-action="force-blackjack" data-body='{"result":"fair"}'>Blackjack fair</button>
        <button class="pill" data-action="disconnect" data-body='{"id":"chase"}'>Disconnect Chase</button>
      </div>
    </section>
    <section>
      <h2>Group</h2>
      <div class="actions">
        <button class="pill" data-action="friend-swipe" data-body='{"who":"Penny","merchant":"DoorDash","amount":38}'>Penny · DoorDash · $38</button>
        <button class="pill" data-action="friend-swipe" data-body='{"who":"Penny","merchant":"DoorDash","amount":52}'>Penny · DoorDash · $52</button>
      </div>
      <form class="swipe friend-swipe">
        <select name="who" aria-label="Who"><option>Penny</option><option>Maya</option><option>Sam</option></select>
        <input name="merchant" placeholder="Merchant" required />
        <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required />
        <button class="pill" type="submit">Friend swipe</button>
      </form>
    </section>
    <p class="note" aria-live="polite"></p>`;
  const note = main.querySelector<HTMLElement>(".note")!;
  const fire = async (action: string, body: object = {}) => {
    note.textContent = "";
    try {
      await api("POST", `/demo/${action}`, body);
      note.textContent = `${action} ✓`;
      void refresh();
    } catch (e) {
      note.textContent = `${action} failed: ${(e as Error).message}`;
    }
  };
  const presets = main.querySelector(".presets")!;
  for (const [merchant, amount, category] of PRESETS) {
    const b = document.createElement("button");
    b.className = "pill";
    b.type = "button";
    b.textContent = `${merchant} $${amount}`;
    b.onclick = () => void fire("swipe", { merchant, amount, category });
    presets.append(b);
  }
  const form = main.querySelector<HTMLFormElement>(".swipe")!;
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    void fire("swipe", { merchant: f.get("merchant"), amount: Number(f.get("amount")), category: f.get("category") });
  };
  const friendForm = main.querySelector<HTMLFormElement>(".friend-swipe")!;
  friendForm.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(friendForm);
    void fire("friend-swipe", { who: f.get("who"), merchant: f.get("merchant"), amount: Number(f.get("amount")) });
  };
  for (const b of main.querySelectorAll<HTMLButtonElement>("[data-action]"))
    b.onclick = () => void fire(b.dataset.action!, b.dataset.body ? JSON.parse(b.dataset.body) : {});

  const refresh = async () => {
    const s = await api<Summary>("GET", "/summary");
    main.querySelector(".clock")!.textContent = clock.format(new Date(s.now));
    main.querySelector(".today")!.textContent = `$${s.today} today`;
  };
  const tick = async () => {
    while (current() && main.isConnected) {
      await refresh().catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  void tick();
};
export default demo;
