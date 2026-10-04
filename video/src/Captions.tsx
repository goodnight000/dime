import React from "react";
import { C, FONT, FPS, WORDS, Word, f, pop, prog } from "./lib";

// 2–5 word chunks, broken after punctuation; never leave a 1-word tail.
const CHUNKS: Word[][] = (() => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const punct = /[.,?!…;:]$/.test(w.w);
    const next = WORDS[i + 1];
    const gap = next ? next.s - w.e : 9;
    if ((punct && cur.length >= 2) || cur.length >= 4 || gap > 0.5 || !next) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  // never a 1-word chunk: fold it into a neighbour
  for (let k = 0; k < out.length; k++) {
    if (out[k].length > 1 || out.length < 2) continue;
    if (k + 1 < out.length && out[k + 1].length < 5) { out[k + 1] = [...out[k], ...out[k + 1]]; out.splice(k, 1); k--; }
    else if (k > 0) { out[k - 1] = [...out[k - 1], ...out[k]]; out.splice(k, 1); k--; }
  }
  return out;
})();

const KEY = /^(\$|\d)|^(fifty|thirty|twenty|ninety|gamble|girl|math|bet|friends|invested|wealth|accountability|needs|wants|future|blackjack|cfo|dime|playing|game|seconds|handled|yours)$/i;

export const Captions: React.FC<{ fr: number; hide?: boolean }> = ({ fr, hide }) => {
  const t = fr / FPS;
  const i = CHUNKS.findIndex((c, k) => {
    const next = CHUNKS[k + 1];
    return t >= c[0].s - 0.05 && t < Math.min(next ? next[0].s - 0.05 : 1e9, c[c.length - 1].e + 0.6);
  });
  if (i < 0 || hide) return null;
  const ch = CHUNKS[i];
  const end = Math.min(CHUNKS[i + 1]?.[0].s ?? 1e9, ch[ch.length - 1].e + 0.6);
  const out = prog(fr, f(end) - 4, 4);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 260, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 54,
      background: "linear-gradient(to top, rgba(238,238,235,.92), rgba(238,238,235,.6) 45%, rgba(238,238,235,0))" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "baseline", opacity: 1 - out, transform: `translateY(${out * 10}px)`, fontFamily: FONT, letterSpacing: "-0.03em" }}>
        {ch.map((w, k) => {
          const p = pop(fr, f(ch[0].s) - 3 + k * 2, 11);
          const hit = pop(fr, f(w.s) - 1, 9);
          const active = t >= w.s - 0.03 && t < (ch[k + 1]?.s ?? w.e + 0.6);
          const key = KEY.test(w.w.replace(/[^\w$]/g, ""));
          const size = key ? 76 : 62;
          return (
            <span key={k} style={{
              fontSize: size, fontWeight: 600, lineHeight: 1,
              color: active ? C.money : t < w.s ? "rgba(23,23,22,.36)" : C.fg,
              transform: `translateY(${(1 - p) * 26 - (active ? 6 * Math.min(1, hit) : 0)}px) scale(${(0.7 + 0.3 * p) * (active ? 1 + 0.06 * Math.min(1, hit) : 1)})`, display: "inline-block", opacity: Math.min(1, p * 2),
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};
