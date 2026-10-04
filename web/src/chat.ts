import {
  appAction,
  listMessages,
  sendMessage,
  setTapback,
  type App,
  type Snapshot,
  type Tapback,
  type Thread,
  type ThreadMessage,
} from "./api.ts";
import type { Screen } from "./main.ts";
import { renderers } from "./apps/index.ts";
import { icon } from "./icons.ts";
import { face } from "./people.ts";
import { T, reduced } from "./motion.ts";
import { roll } from "./num.ts";

const POLL_MS = 1000;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
// Messages drops the bubble for a message of one to three emoji and sets them large.
// An ask that ends in numbered choices ("1) Tuesday 2) Wednesday") gets them as tappable replies.
const OPTION_RE = /^\s*(\d)[.)]\s+(.+)$/gm;
const JUMBO_RE =
  /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u;
const GAP_MS = 20 * 60_000;
// The six tapbacks Messages offers, in its order.
const TAPBACKS: [Tapback, string, string][] = [
  ["love", "❤️", "Love"],
  ["like", "👍", "Like"],
  ["dislike", "👎", "Dislike"],
  ["laugh", "😂", "Ha ha"],
  ["emphasize", "‼️", "Emphasize"],
  ["question", "❓", "Question"],
];
const FRIENDS = ["Penny", "Maya", "Sam"];
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const full = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
// Several bubbles in one pull land in turn, this far apart (DESIGN.md §2.2).
const STAGGER_MS = 120;

/** Pops `li` in (its CSS keyframes, after `delay`); `.new` comes off once it lands, so a later move
 * of the node can't replay it. Card renderers read the timing through motion.ts arrival(). */
function arrive(li: HTMLElement, delay = 0) {
  li.classList.add("new");
  if (delay) li.style.animationDelay = `${delay}ms`;
  const done = (e: AnimationEvent) => {
    if (e.target !== li) return;
    li.classList.remove("new");
    li.style.animationDelay = "";
    li.removeEventListener("animationend", done);
  };
  li.addEventListener("animationend", done);
}

/** Your tapback glyph. `pop` lands it with the spring; `after` waits for an old glyph to leave. */
function tapback([, glyph, name]: [Tapback, string, string], pop: boolean, after = false) {
  const tap = document.createElement("span");
  tap.className = "tapback mine";
  tap.title = `You reacted: ${name}`;
  tap.textContent = glyph;
  if (pop) tap.classList.add("new");
  if (pop && after) tap.style.animationDelay = `${T.press}ms`;
  return tap;
}
/** Fades a tapback out (120ms) and drops it. */
function retire(tap: HTMLElement) {
  tap.classList.add("gone");
  setTimeout(() => tap.remove(), reduced() ? 0 : T.press);
}

/** The day label the way Messages writes it: Today, Yesterday, then the date. `now` is the demo clock. */
function dayLabel(d: Date, now: Date): string {
  const days = Math.round((dayOf(now) - dayOf(d)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : date.format(d);
}

const linkLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") + " ↗";
  } catch {
    return url;
  }
};

/** Body text with bare URLs made into links; everything else stays text. A URL on its own line
 *  becomes a one-line link preview under the text: the headline (when the server knows it) and the
 *  site, quiet. Inside a sentence it stays an inline link to the site. */
function linkify(body: string, link?: { url: string; title: string }): (string | HTMLAnchorElement)[] {
  const out: (string | HTMLAnchorElement)[] = [];
  let at = 0;
  for (const m of body.matchAll(URL_RE)) {
    const own = (m.index === 0 || body[m.index - 1] === "\n") && /^\s*$/.test(body.slice(m.index + m[0].length).split("\n")[0]);
    out.push(body.slice(at, own ? Math.max(at, m.index - 1) : m.index)); // the line break goes; the preview is a block
    const a = document.createElement("a");
    a.href = m[0];
    a.title = m[0]; // the full URL on hover
    a.target = "_blank";
    a.rel = "noopener";
    if (own) {
      a.className = "lp";
      const title = link?.url === m[0] ? link.title : "";
      a.innerHTML = `${title ? `<span class="lp-t"></span>` : ""}<span class="lp-d"></span>`;
      if (title) a.querySelector(".lp-t")!.textContent = title;
      a.querySelector(".lp-d")!.textContent = linkLabel(m[0]);
    } else a.textContent = linkLabel(m[0]); // the site, as Messages shows a link
    out.push(a);
    at = m.index + m[0].length;
  }
  out.push(body.slice(at));
  return out;
}

/** Who sent an outbound row: a friend in the group, otherwise Dime. Runs break where this changes. */
const who = (m: ThreadMessage) => (m.direction === "in" ? "me" : (m.sender ?? "Dime"));

// A thread: Dime one to one, or the group chat with Penny, Maya and Sam. Rows come from a full GET
// /messages snapshot on a short poll while this screen is mounted; a send draws its bubble at once
// and the next pull replaces it with the stored row. A row with `app` is a mini app card, drawn by
// its kind's renderer and redrawn only when the app's version changes.
// ponytail: polling every 1s; move to SSE if the thread ever needs to feel instant.
export default function chat(thread: Thread): Screen {
  return (main, { agent }, current = () => true) => {
    const group = thread === "group";
    const title = group ? "The Group" : agent.name;
    main.className = `chat ${thread}`;
    main.innerHTML = `
    <header class="contact">${
      group
        ? `<span class="faces">${FRIENDS.map((n) => face(n)).join("")}</span>`
        : icon("cue", "cue-face")
    }<b></b>${group ? "" : `<span class="left"><span class="num"></span> left today</span>`}</header>
    <ol class="thread" aria-label="Conversation"></ol>
    <form class="compose">
      <div class="replying" hidden>
        <span class="rq"></span>
        <button class="icon" type="button" aria-label="Cancel reply">${icon("x")}</button>
      </div>
      <div class="field">
        <textarea rows="1" required aria-label="Message"></textarea>
        <button class="send" type="submit" aria-label="Send" disabled>${icon("arrow-up")}</button>
      </div>
      <p class="note" aria-live="polite"></p>
    </form>`;
    main.querySelector(".contact b")!.textContent = title;
    // On a phone the sidebar's "$X left today" lives here (DESIGN.md §8); main.ts's poll rolls both.
    const left = document.querySelector<HTMLElement>(".side .left .num")?.dataset.v;
    const here = main.querySelector<HTMLElement>(".contact .left .num");
    if (here && left) roll(here, left);
    const list = main.querySelector<HTMLOListElement>(".thread")!;
    list.classList.toggle("group", group);
    const form = main.querySelector("form")!;
    const box = form.querySelector("textarea")!;
    const send = form.querySelector<HTMLButtonElement>(".send")!;
    const fail = form.querySelector(".note")!;
    box.placeholder = group ? "Message The Group" : `Message ${agent.name}`;
    let rendered = false;
    let pullSequence = 0;
    let bubbles = new Map<string, HTMLLIElement>();
    let typing: HTMLLIElement | undefined;
    let connectionError = false;
    // Sends the server has not stored yet: drawn at once, replaced by the stored row on the next pull.
    const outbox: HTMLLIElement[] = [];
    // Aborted when the screen goes away (the poll notices), for listeners outside the screen.
    const gone = new AbortController();
    // The message the next send answers (an inline reply), and the strip above the composer saying so.
    let replyTo: { id: string; body: string } | null = null;
    const strip = form.querySelector<HTMLElement>(".replying")!;
    const quoted = strip.querySelector<HTMLElement>(".rq")!;

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // Following the thread is an instant scroll, so the only thing that moves is the new bubble.
    const settle = () => list.scrollTo({ top: list.scrollHeight, behavior: "instant" });

    // The indicator follows the server's `pending`: on while Dime composes, off when it is done.
    // reconcile() places it under the last bubble.
    const stopTyping = () => {
      typing?.remove();
      typing = undefined;
    };
    // The indicator pops in like a bubble (after any bubbles landing in the same pull); it never
    // fades out: the reply takes its place in one frame.
    const startTyping = (delay: number) => {
      if (typing) return;
      typing = document.createElement("li");
      typing.className = "b out typing first last";
      typing.setAttribute("aria-label", `${agent.name} is typing`);
      typing.innerHTML = `<i></i><i></i><i></i>`;
      if (rendered) arrive(typing, delay);
    };
    // The group's indicator carries the typer's face in the gutter (DESIGN.md §4).
    const typingFace = (typer: string | null | undefined) => {
      if (!group || !typing || typing.dataset.typer === (typer ?? "")) return;
      typing.dataset.typer = typer ?? "";
      typing.setAttribute("aria-label", `${typer ?? agent.name} is typing`);
      typing.querySelector(".av.gutter")?.remove();
      typing.insertAdjacentHTML("beforeend", typer ? face(typer, "gutter") : icon("cue", "av gutter cue-face"));
    };

    // A card's action: POST it, then pull at once so the new version draws without waiting a tick.
    const act = (app: App) => async (action: string, body?: object) => {
      await appAction(app.id, action, body);
      if (current()) await pull();
    };

    // Bubbles group into runs: the first of a run gets breathing room, the last gets the tail
    // corner. In the group, a friend's run opens with their name and closes on their face. A day
    // line opens each day, a time line each long gap. "Delivered" sits under your latest bubble.
    // History is unpaginated, so each pull is the canonical full snapshot. Every node is keyed and
    // reused, and the list is patched in place: an unchanged node is never detached, so no entrance
    // animation replays and a card's in-flight transition is never cut (DESIGN.md §2.1).
    let marks = new Map<string, HTMLLIElement>();
    const reconcile = ({ messages: rows, apps, pending, typer, now }: Snapshot) => {
      const prior = bubbles;
      const priorMarks = marks;
      const live = rendered;
      const clock = new Date(now);
      const arrived = rows.filter((m) => m.direction === "in" && !prior.has(m.id)).length;
      const newInbound = arrived > 0;
      const follow = !live || nearBottom() || newInbound;
      const next = new Map<string, HTMLLIElement>();
      const nextMarks = new Map<string, HTMLLIElement>();
      const nodes: HTMLElement[] = [];
      // A non-bubble row (day line, name, quote, chips): redrawn only when its content changes.
      const mark = (key: string, cls: string, sig: string, fill: (el: HTMLLIElement) => void) => {
        const el = priorMarks.get(key) ?? document.createElement("li");
        if (el.dataset.sig !== sig) {
          el.className = cls;
          el.dataset.sig = sig;
          el.replaceChildren();
          fill(el);
        }
        nextMarks.set(key, el);
        nodes.push(el);
      };
      let lastAt: Date | undefined;
      let latestInbound = -1;
      let landing = 0; // bubbles arriving in this pull, for the stagger
      let moved = false; // a card on screen changed in this pull
      for (const [index, m] of rows.entries()) {
        const at = new Date(m.created_at);
        if (!lastAt || dayOf(at) !== dayOf(lastAt)) {
          const label = dayLabel(at, clock);
          mark(`day:${m.id}`, "day", label, (el) => {
            el.innerHTML = `<b></b> `;
            el.firstChild!.textContent = label;
            el.append(time.format(at));
          });
        } else if (at.getTime() - lastAt.getTime() > GAP_MS) {
          mark(`when:${m.id}`, "when", "", (el) => (el.textContent = time.format(at)));
        }
        lastAt = at;
        const previous = rows[index - 1];
        const following = rows[index + 1];
        const first = !previous || who(previous) !== who(m);
        const last = !following || who(following) !== who(m);
        if (group && m.direction === "out" && first)
          mark(`who:${m.id}`, "who", "", (el) => (el.textContent = who(m)));
        // An inline reply carries the message it answers, drawn small and faded just above it; the
        // quote is a way back to the original.
        if (m.reply_to) {
          const r = m.reply_to;
          mark(`quote:${m.id}`, `quote ${m.direction}`, "", (el) => {
            el.dataset.target = r.id;
            el.title = "Show the original";
            el.textContent = r.body;
          });
        }
        const reused = prior.get(m.id);
        const li = reused ?? document.createElement("li");
        const app = m.app ? apps[m.app] : undefined;
        if (!reused) {
          li.dataset.id = m.id;
          li.className = `b ${m.direction}`;
          li.title = full.format(at);
          // Your own rows already popped in as drafts; only the other side's arrivals animate.
          if (live && m.direction === "out") arrive(li, STAGGER_MS * landing++);
        }
        // Toggled, never reassigned, so classes a card renderer puts on its li survive.
        li.classList.toggle("app", !!app);
        li.classList.toggle("first", first);
        li.classList.toggle("last", last);
        if (app) {
          // The card owns its li's children; its renderer runs again only when the version changes,
          // and diffs against its own last state.
          li.dataset.kind = app.kind; // sizes the card: --card-h per kind (theme.css)
          if (li.dataset.v !== String(app.version)) {
            if (li.dataset.v && rendered) moved = true; // a card already on screen plays a change now
            li.dataset.v = String(app.version);
            renderers[app.kind]?.(li, app, act(app));
          }
        } else if (li.dataset.sig !== `${m.body}\u0000${m.tapback ?? ""}\u0000${m.reaction ?? ""}`) {
          li.dataset.sig = `${m.body}\u0000${m.tapback ?? ""}\u0000${m.reaction ?? ""}`;
          // Only the text is redrawn: the tapback, an open picker or action bar stay attached, since
          // detaching a node restarts its animation.
          for (const c of [...li.childNodes])
            if (c.nodeType === Node.TEXT_NODE || (c as Element).tagName === "A") c.remove();
          li.prepend(...linkify(m.body, m.link));
          li.classList.toggle("jumbo", JUMBO_RE.test(m.body.trim()));
          const had = li.querySelector<HTMLElement>(":scope > .tapback.mine:not(.gone)");
          const mine = TAPBACKS.find(([t]) => t === m.tapback);
          // The glyph already showing (your optimistic tap) stays put, so it doesn't pop twice.
          if (had?.textContent !== mine?.[1]) {
            if (had) retire(had);
            if (mine) li.append(tapback(mine, live, !!had));
          }
          // Dime's reaction on your bubble: grey, on the corner facing the thread, landing once.
          const theirs = TAPBACKS.find(([t]) => t === m.reaction);
          const shown = li.querySelector<HTMLElement>(":scope > .tapback.theirs:not(.gone)");
          if (shown?.textContent !== theirs?.[1]) {
            if (shown) retire(shown);
            if (theirs) {
              const tap = tapback(theirs, live, !!shown);
              tap.className = tap.className.replace("mine", "theirs");
              tap.title = `${agent.name} reacted: ${theirs[2]}`;
              li.append(tap);
            }
          }
        }
        const faced = li.querySelector(":scope > .av.gutter");
        const wantsFace = group && m.direction === "out" && last;
        if (faced && !wantsFace) faced.remove();
        if (!faced && wantsFace)
          li.insertAdjacentHTML(
            "beforeend",
            m.sender ? face(m.sender, "gutter") : icon("cue", "av gutter cue-face"),
          );
        next.set(m.id, li);
        nodes.push(li);
        if (m.direction === "in") latestInbound = nodes.length;
      }
      if (latestInbound >= 0) {
        const at = nodes.length;
        mark("delivered", "delivered", "", (el) => (el.textContent = "Delivered"));
        nodes.splice(latestInbound, 0, ...nodes.splice(at, 1));
      }
      // Replies offered by Dime's latest message, while it is still the latest word.
      const lastRow = rows.at(-1);
      const options = lastRow?.direction === "out" ? [...lastRow.body.matchAll(OPTION_RE)] : [];
      if (lastRow && options.length >= 2)
        mark(`chips:${lastRow.id}`, "chips", "", (el) => {
          for (const [, n, label] of options) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.onclick = () => void deliver(n, draft(n));
            el.append(b);
          }
        });
      if (!rows.length && !outbox.length)
        mark("empty", "empty", "", (el) => {
          el.innerHTML = `${icon("cue", "cue-face")}<span></span>`;
          el.lastElementChild!.textContent = `Say hello to ${title}`;
        });
      bubbles = next;
      marks = nextMarks;
      // Each stored row of yours retires the oldest draft still in flight (it already popped in, so
      // the stored row does not animate again); a failed send stays until it is retried.
      for (let n = arrived; n > 0; n--) {
        const i = outbox.findIndex((b) => !b.classList.contains("failed"));
        if (i < 0) break;
        outbox.splice(i, 1)[0].remove();
      }
      // One motion at a time: the indicator waits out a card's change (a roll, a slot swap).
      if (pending) startTyping(Math.max(STAGGER_MS * landing, moved ? T.slow + 80 : 0));
      if (pending) typingFace(typer);
      else stopTyping();
      patch([...nodes, ...outbox, ...(typing ? [typing] : [])]);
      if (follow) settle();
      rendered = true;
    };

    /** Makes the list's children exactly `want`, inserting only what is new or out of place.
     * Moving a node restarts its animations, so when a placed bubble and a line (Delivered, a
     * day line) are out of order, the line moves, never the bubble. */
    const patch = (want: HTMLElement[]) => {
      const keep = new Set<Element>(want);
      for (const c of [...list.children]) if (!keep.has(c)) c.remove();
      want.forEach((n, i) => {
        let c = list.children[i];
        while (c && c !== n && n.isConnected && !c.classList.contains("b")) {
          list.append(c); // later iterations put it back where it belongs
          c = list.children[i];
        }
        if (c !== n) list.insertBefore(n, c ?? null);
      });
    };

    const pull = async () => {
      const sequence = ++pullSequence;
      const snapshot = await listMessages(thread);
      if (sequence === pullSequence && current()) reconcile(snapshot);
    };

    // `main.contains(list)` after every await is how this notices `main.replaceChildren()` tore the
    // screen down on navigation, since screens are plain functions with no separate teardown hook.
    const poll = async () => {
      while (main.contains(list)) {
        try {
          await pull();
          if (!current()) return;
          if (connectionError) {
            fail.textContent = "";
            connectionError = false;
          }
        } catch {
          if (!current()) return;
          fail.textContent = "Couldn't refresh messages. Retrying…";
          connectionError = true;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      stopTyping();
    };

    // The bubble goes up the moment you send, as in Messages; a failure marks it Not Delivered, and
    // tapping it tries again.
    const draft = (text: string) => {
      const li = document.createElement("li");
      li.className = "b in first last sending";
      li.textContent = text;
      li.classList.toggle("jumbo", JUMBO_RE.test(text));
      outbox.push(li);
      list.insertBefore(li, typing?.isConnected ? typing : null);
      settle(); // instant, then the bubble rises: the only thing moving
      arrive(li);
      return li;
    };
    const deliver = async (text: string, li: HTMLLIElement, reply?: string) => {
      li.classList.remove("failed");
      li.classList.add("sending");
      fail.textContent = "";
      try {
        await sendMessage(thread, text, reply);
        if (!current()) return;
        li.classList.remove("sending");
        await pull();
      } catch {
        if (!current()) return;
        li.classList.replace("sending", "failed");
        li.title = "Not Delivered. Click to try again.";
        li.onclick = () => void deliver(text, li, reply);
      }
    };
    box.oninput = () => (send.disabled = !box.value.trim());
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = box.value.trim();
      if (!text) return;
      box.value = "";
      send.disabled = true;
      box.focus();
      const reply = replyTo?.id;
      replying(null);
      void deliver(text, draft(text), reply);
    };

    // Reacting and replying, as in Messages: hovering (or tapping) a bubble offers both beside it;
    // double-clicking goes straight to the tapbacks. One small bar and one picker serve every bubble.
    const replying = (to: { id: string; body: string } | null) => {
      replyTo = to;
      strip.hidden = !to;
      quoted.textContent = to?.body ?? "";
      if (to) box.focus();
    };
    strip.querySelector<HTMLButtonElement>("button")!.onclick = () => replying(null);
    const bar = document.createElement("div");
    bar.className = "bubble-actions";
    bar.innerHTML = `<button type="button" class="react" aria-label="React">${icon("heart")}</button>
    <button type="button" class="reply" aria-label="Reply">${icon("reply")}</button>`;
    const picker = document.createElement("div");
    picker.className = "tapback-picker";
    picker.setAttribute("role", "menu");
    for (const [t, glyph, name] of TAPBACKS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.tapback = t;
      b.setAttribute("role", "menuitemradio");
      b.ariaLabel = name;
      b.textContent = glyph;
      picker.append(b);
    }
    // Cards are not text: they take no tapback or reply.
    const target = (el: EventTarget | null) =>
      (el as Element | null)?.closest?.<HTMLLIElement>("li.b[data-id]:not(.failed):not(.app)") ??
      null;
    const pick = (li: HTMLLIElement) => {
      const chosen = li.querySelector(".tapback.mine")?.textContent;
      for (const b of picker.querySelectorAll<HTMLButtonElement>("button"))
        b.ariaPressed = String(TAPBACKS.find(([t]) => t === b.dataset.tapback)?.[1] === chosen);
      li.append(picker);
    };
    const react = async (li: HTMLLIElement, t: Tapback) => {
      picker.remove();
      const had = li.querySelector<HTMLElement>(":scope > .tapback.mine:not(.gone)");
      const glyph = TAPBACKS.find(([x]) => x === t)!;
      const off = had?.textContent === glyph[1];
      // Changing: the old glyph fades (120ms), then the new one lands. Removing: it fades.
      if (had) retire(had);
      if (!off) li.append(tapback(glyph, true, !!had));
      await setTapback(li.dataset.id!, off ? null : t).catch(() => {});
      if (current()) void pull().catch(() => {}); // the stored state wins, whatever happened
    };
    list.addEventListener("mouseover", (e) => {
      const li = target(e.target);
      // Only move the bar when it changes bubble: re-inserting it under the pointer eats the click.
      if (li && bar.parentElement !== li && !li.contains(picker)) li.append(bar);
    });
    list.addEventListener("mouseleave", () => bar.remove());
    list.addEventListener("click", (e) => {
      const el = e.target as Element;
      const quote = el.closest?.<HTMLElement>("li.quote");
      if (quote) {
        const original = bubbles.get(quote.dataset.target!);
        original?.scrollIntoView({ block: "center", behavior: "smooth" });
        original?.classList.remove("flash");
        void original?.offsetWidth;
        original?.classList.add("flash");
        return;
      }
      const li = target(el);
      if (!li) return;
      const tap = el.closest?.<HTMLButtonElement>(".tapback-picker button");
      if (tap) return void react(li, tap.dataset.tapback as Tapback);
      if (el.closest?.(".bubble-actions .react")) return pick(li);
      if (el.closest?.(".bubble-actions .reply")) {
        bar.remove();
        const body = [...li.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE || (n as Element).tagName === "A")
          .map((n) => n.textContent)
          .join("");
        return replying({ id: li.dataset.id!, body });
      }
      if (!el.closest?.("a") && bar.parentElement !== li) li.append(bar); // a tap, where there is no hover
    });
    // A double-click reacts, as a double-tap does in Messages, so it must not also select a word.
    list.addEventListener("mousedown", (e) => {
      if (e.detail > 1 && target(e.target)) e.preventDefault();
    });
    list.addEventListener("dblclick", (e) => {
      const li = target(e.target);
      if (li) (e.preventDefault(), pick(li));
    });
    main.addEventListener("keydown", (e) => {
      if (e.key === "Escape") (picker.remove(), replyTo && replying(null));
    });
    // A press anywhere else closes the picker; the listener lives only as long as this screen.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!picker.contains(e.target as Node) && !bar.contains(e.target as Node)) picker.remove();
      },
      { signal: gone.signal },
    );
    box.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), form.requestSubmit());
    };
    box.focus();
    void poll().finally(() => gone.abort());
  };
}
