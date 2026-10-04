// People are faces in type: initials on a tint of one of six palette tones, picked from the name.
const TONES = ["--blue", "--green", "--amber", "--cue", "--danger", "--violet"];

// The cast has fixed tones so no friend collides with a money colour (DESIGN.md §1.1).
const CAST: Record<string, string> = { Charles: "--blue", Penny: "--amber", Maya: "--violet", Sam: "--cue" };

export function tone(name: string): string {
  if (CAST[name]) return `var(${CAST[name]})`;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(${TONES[h % TONES.length]})`;
}

/** A face as markup: `<span class="av">` with the initial(s) on the name's tint. */
export function face(name: string, cls = ""): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `<span class="av ${cls}" style="--tone:${tone(name)}" title="${name}">${initials}</span>`;
}
