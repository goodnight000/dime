/** Returns a guard that stays true only until the next operation begins. */
export function latestOnly() {
  let latest = 0;
  return () => {
    const id = ++latest;
    return () => id === latest;
  };
}

/** Wraps a screen side effect so a response from an abandoned navigation cannot run it. */
export function currentOnly<T extends unknown[]>(
  current: () => boolean,
  action: (...args: T) => void,
) {
  return (...args: T) => {
    if (current()) action(...args);
  };
}

/** A route-owned flow is live only while both its navigation and its rendered host survive. */
export function currentWhileConnected(
  current: () => boolean,
  host: Pick<Node, "isConnected">,
): () => boolean {
  return () => current() && host.isConnected;
}
