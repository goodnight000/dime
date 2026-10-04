import { Easing, interpolate, spring } from "remotion";
import words from "./words.json";
import env from "./vo_env.json";
import have from "./have.json";

export const FPS = 30;
export const W = 1920, H = 1080;
export type Word = { w: string; s: number; e: number };
const VOW = words as Word[];
const ENV = env as number[];
export const HAVE = have as { files: string[]; manifest: { clips: Clip[] }; realWords: boolean };
export const has = (p: string) => HAVE.files.includes(p);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
// VO-time start of the nth occurrence of phrase
const voCue = (phrase: string, nth = 0): number => {
  const p = phrase.split(/\s+/).map(norm);
  let hit = 0;
  for (let i = 0; i + p.length <= VOW.length; i++) {
    if (p.every((x, j) => norm(VOW[i + j].w) === x) && hit++ === nth) return VOW[i].s;
  }
  throw new Error(`cue not found: ${phrase}`);
};

// The cut: VO slices in film order; `pre` = film seconds before the slice (music only).
const SLICE_SPEC: { from: string; to: string; pre: number }[] = [
  { from: "I'm Dime", to: "bet on your friends", pre: 0.1 },
  { from: "Want something", to: "on the house", pre: 4.7 },
  { from: "Lose and that money", to: "building wealth", pre: 0.9 },
  { from: "Every price becomes", to: "two days later", pre: 2.8 },
  { from: "Every dollar you don't", to: "until it's yours", pre: 0.3 },
  { from: "And every single day", to: "where you stood", pre: 0.4 },
  { from: "Add your friends", to: "her actual card", pre: 2.0 },
  { from: "Dime Get good", to: "playing with it", pre: 0.6 },
];
const voEnd = (p: string) => { const s = voCue(p); const i = VOW.findIndex((w) => w.s === s); return VOW[i + p.split(/\s+/).length - 1].e; };
export const SLICES = (() => {
  let t = 0;
  return SLICE_SPEC.map((x) => {
    const v0 = voCue(x.from) - 0.04, v1 = voEnd(x.to) + 0.12;
    t += x.pre;
    const film = t;
    t += v1 - v0;
    return { v0, v1, film };
  });
})();
export const LEAD = 0;
export const toFilm = (v: number) => { const s = SLICES.find((x) => v >= x.v0 - 0.001 && v <= x.v1 + 0.001); if (!s) throw new Error("not in cut: " + v); return s.film + v - s.v0; };
export const toVo = (t: number): number | null => { const s = SLICES.find((x) => t >= x.film && t < x.film + x.v1 - x.v0); return s ? s.v0 + t - s.film : null; };
export const WORDS: Word[] = VOW.filter((w) => SLICES.some((x) => w.s >= x.v0 && w.e <= x.v1 + 0.01)).map((w) => ({ w: w.w, s: toFilm(w.s), e: toFilm(w.e) })).sort((a, b) => a.s - b.s);
export const cue = (phrase: string, nth = 0) => toFilm(voCue(phrase, nth));
export const cueEnd = (phrase: string) => toFilm(voEnd(phrase));
export const VO_SEGS = SLICES.map((x) => [x.v0, x.v1, x.film] as const);
export const GAPS: { at: number; g: number }[] = [];

export const f = (sec: number) => Math.round(sec * FPS);
export const VO_END = WORDS[WORDS.length - 1].e;
export const TOTAL = f(VO_END + 3.6);
export const voLevel = (fr: number) => {
  const v = toVo(fr / FPS);
  return v == null ? 0 : ENV[Math.round(v * FPS)] ?? 0;
};
// 1 while someone speaks (phrase-merged), ramps 0.2s
export const speaking = (t: number) => {
  let best = 0;
  for (const w of WORDS) {
    const d = t < w.s ? w.s - t : t > w.e ? t - w.e : 0;
    if (d < 0.45) best = Math.max(best, d < 0.25 ? 1 : 1 - (d - 0.25) / 0.2);
  }
  return best;
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const prog = (fr: number, at: number, dur = 12, e = ease) =>
  interpolate(fr, [at, at + dur], [0, 1], { ...clamp, easing: e });
export const pop = (fr: number, at: number, damping = 12) =>
  spring({ frame: fr - at, fps: FPS, config: { damping, stiffness: 200, mass: 0.6 } });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Footage manifest
export type Box = { x: number; y: number; w: number; h: number };
export type Clip = { file: string; durationSec: number; keyMoments: { t: number; what: string; box?: Box | null }[] };
export const clip = (id: string) => HAVE.manifest.clips.find((c) => c.file.startsWith(id));
export const footage = (id: string) => { const c = clip(id); return c && has("footage/" + c.file) ? c : undefined; };
// key moment by substring of `what`; fallback time/box when the clip or moment is missing
export const km = (id: string, what: string, t: number, box?: Box) => {
  const m = clip(id)?.keyMoments.find((k) => k.what.toLowerCase().includes(what.toLowerCase()));
  return { t: m?.t ?? t, box: (m?.box ?? box) as Box | undefined };
};

export const C = {
  bg: "#eeeeeb", pane: "#f7f7f4", bg2: "#e3e3df", fg: "#171716", muted: "#5e5e59",
  money: "#1f7a4c", neg: "#a5493f", felt: "#22604a", feltDeep: "#194a39", feltFg: "#eef2ec",
  blue: "#2a5bbf", amber: "#c98a2e",
};
export const FONT = "Instrument Sans";
