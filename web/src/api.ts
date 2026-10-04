// The only path to the server: /api/<path> on this origin, proxied to Bun by Vite.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export type Session = {
  owner: { display_name: string; onboarded: boolean };
  agent: { name: string };
};

export type Thread = "dime" | "group";
export type Tapback = "love" | "like" | "dislike" | "laugh" | "emphasize" | "question";
// "in" = Charles, "out" = Dime or (in the group) a friend named by `sender`. A row with `app` is a
// mini app card; its state is in the snapshot's `apps`.
export type ThreadMessage = {
  id: string;
  thread: Thread;
  direction: "in" | "out";
  sender?: string;
  body: string;
  app?: string;
  created_at: string;
  reply_to?: { id: string; direction: "in" | "out"; body: string } | null;
  tapback?: Tapback | null;
  // Dime's own tapback on one of your messages: how it answers an "ok".
  reaction?: Tapback | null;
  link?: { url: string; title: string }; // a news URL's headline, for the link preview
};
export type AppKind = "blackjack" | "funds" | "goal" | "proposal" | "market" | "today" | "girlmath";
export type App = { id: string; kind: AppKind; version: number; state: any };
export type Snapshot = {
  messages: ThreadMessage[];
  apps: Record<string, App>;
  pending: boolean; // Dime is composing a reply
  typer?: string | null; // group: the friend typing (null = Dime)
  now: string; // demo clock
};

/** React to a message in the thread; `null` takes the reaction back. */
export function setTapback(id: string, tapback: Tapback | null): Promise<{ ok: true }> {
  return api("POST", `/messages/${encodeURIComponent(id)}/tapback`, { tapback });
}

export function listMessages(thread: Thread): Promise<Snapshot> {
  return api("GET", `/messages?thread=${thread}`);
}

export function sendMessage(
  thread: Thread,
  text: string,
  replyTo?: string,
): Promise<{ id: string; pending: boolean }> {
  return api("POST", "/messages", { thread, text, ...(replyTo ? { reply_to: replyTo } : {}) });
}

export function appAction(id: string, action: string, body: object = {}): Promise<{ app: App }> {
  return api("POST", `/apps/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, body);
}

export async function api<T = { ok: true }>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: { error?: string } = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown");
  return data as T;
}
