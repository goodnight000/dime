// Pull whatever inputs exist into src/*.json so the film re-times itself. Run before snap/render.
// words: public/audio/words.json if present, else a stand-in paced from script.txt.
import fs from "node:fs";
const P = (p) => new URL("../" + p, import.meta.url).pathname;
const has = (p) => fs.existsSync(P(p));
const read = (p) => JSON.parse(fs.readFileSync(P(p), "utf8"));
const FPS = 30;

let words, real = false;
if (has("public/audio/words.json")) {
  let raw = read("public/audio/words.json");
  if (!Array.isArray(raw)) raw = raw.words ?? raw.segments?.flatMap((s) => s.words) ?? [];
  words = raw.map((x) => ({ w: String(x.w ?? x.word ?? x.text).trim(), s: +(x.s ?? x.start), e: +(x.e ?? x.end) })).filter((x) => x.w);
  real = true;
} else {
  // stand-in: 2.75 words/s, pauses at punctuation
  const txt = fs.readFileSync(P("script.txt"), "utf8").trim().split(/\s+/);
  let t = 0.3; words = [];
  for (const w of txt) {
    const d = 0.18 + w.length * 0.035;
    words.push({ w, s: +t.toFixed(3), e: +(t + d).toFixed(3) });
    t += d + 0.04 + (/[.?]$/.test(w) ? 0.45 : /,$/.test(w) ? 0.18 : 0);
  }
}
fs.writeFileSync(P("src/words.json"), JSON.stringify(words));

let env = [];
if (has("public/audio/envelope.json")) {
  let raw = read("public/audio/envelope.json");
  let fps = FPS;
  if (!Array.isArray(raw)) { fps = raw.fps ?? FPS; raw = raw.values ?? raw.envelope ?? raw.frames ?? raw.rms ?? []; }
  raw = raw.map((v) => (typeof v === "number" ? v : v.v ?? v.level ?? v.rms ?? 0));
  const max = Math.max(1e-6, ...raw);
  const n = Math.ceil((raw.length / fps) * FPS);
  for (let i = 0; i < n; i++) env.push(+(raw[Math.min(raw.length - 1, Math.floor((i / FPS) * fps))] / max).toFixed(3));
} else {
  const end = words[words.length - 1].e;
  for (let i = 0; i < end * FPS + 60; i++) {
    const t = i / FPS, w = words.find((x) => t >= x.s && t <= x.e);
    env.push(w ? +(0.55 + 0.45 * Math.abs(Math.sin((t - w.s) * 9))).toFixed(3) : 0);
  }
}
fs.writeFileSync(P("src/vo_env.json"), JSON.stringify(env));

const files = ["audio", "footage", "stills"].flatMap((d) => (has("public/" + d) ? fs.readdirSync(P("public/" + d)).map((f) => d + "/" + f) : []));
const manifest = has("public/footage/manifest.json") ? read("public/footage/manifest.json") : { clips: [] };
fs.writeFileSync(P("src/have.json"), JSON.stringify({ files, manifest, realWords: real }));
console.log(`words: ${real ? "REAL" : "stand-in"} (${words.length}, ends ${words[words.length - 1].e}s) env:${env.length} files:${files.length} clips:${manifest.clips.length}`);
