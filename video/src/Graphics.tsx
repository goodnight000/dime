import React from "react";
import { interpolate, random } from "remotion";
import { C, FONT, clamp, f, pop, prog, lerp, easeInOut } from "./lib";
import { Face } from "./Mascot";
import { shake } from "./kit/camera";

const T: React.CSSProperties = { fontFamily: FONT, letterSpacing: "-0.03em", color: C.fg };

// ---- Hook: generic gray dashboards that assemble, then collapse on "forget" ----
const tile = (k: number) => {
  const g = "#c9c9c4", g2 = "#dadad5";
  const r = (n: number) => random(`h${k}-${n}`);
  switch (k % 5) {
    case 0: return <svg width="100%" height="100%" viewBox="0 0 300 180">{[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={20 + i * 38} y={160 - 30 - r(i) * 110} width={24} height={30 + r(i) * 110} rx={3} fill={g} />)}</svg>;
    case 1: return <svg width="100%" height="100%" viewBox="0 0 300 180"><circle cx={150} cy={90} r={60} fill="none" stroke={g2} strokeWidth={26} /><circle cx={150} cy={90} r={60} fill="none" stroke={g} strokeWidth={26} strokeDasharray={`${200 + r(1) * 100} 400`} transform="rotate(-90 150 90)" /></svg>;
    case 2: return <svg width="100%" height="100%" viewBox="0 0 300 180"><polyline fill="none" stroke={g} strokeWidth={6} strokeLinejoin="round" points={[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${20 + i * 37},${140 - r(i) * 100}`).join(" ")} /></svg>;
    case 3: return <svg width="100%" height="100%" viewBox="0 0 300 180"><rect x={24} y={40} width={150} height={16} rx={4} fill={g2} /><rect x={24} y={80} width={210} height={48} rx={6} fill={g} /></svg>;
    default: return <svg width="100%" height="100%" viewBox="0 0 300 180">{[0, 1, 2, 3].map((i) => <g key={i}><rect x={20} y={28 + i * 36} width={160} height={14} rx={4} fill={g2} /><rect x={220} y={28 + i * 36} width={60} height={14} rx={4} fill={g} /></g>)}</svg>;
  }
};
export const Hook: React.FC<{ fr: number; forget: number }> = ({ fr, forget }) => {
  const cells = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4, 360px)", gridAutoRows: 220, gap: 28, justifyContent: "center", alignContent: "center", paddingBottom: 80 }}>
      {cells.map((i) => {
        const p = pop(fr, -10 + i * 2.2, 13);
        const c = prog(fr, f(forget) + (i % 4) * 2 + Math.floor(i / 4), 14, easeInOut);
        const rot = (random(`r${i}`) - 0.5) * 30 * c;
        return (
          <div key={i} style={{
            background: C.pane, borderRadius: 14, padding: 18, border: "1px solid #e1e1dc",
            opacity: Math.min(1, p) * (1 - c), filter: `grayscale(1)`,
            transform: `translateY(${(1 - p) * 40 + c * 260}px) scale(${(0.85 + 0.15 * p) * (1 - 0.4 * c)}) rotate(${rot}deg)`,
          }}>{tile(i)}</div>
        );
      })}
    </div>
  );
};

// ---- The three hooks: gamble / girl math / bet. Reused as chapter markers. ----
export const CardToken: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <div style={{ width: 170 * s, height: 238 * s, background: "#fbfaf6", borderRadius: 12 * s, boxShadow: "0 18px 40px rgba(23,23,22,.22)", border: "1px solid #ddd", position: "relative", ...T }}>
    <div style={{ position: "absolute", left: 16 * s, top: 10 * s, fontSize: 52 * s, fontWeight: 600, lineHeight: 1 }}>A</div>
    <div style={{ position: "absolute", left: 18 * s, top: 62 * s, fontSize: 38 * s }}>♠</div>
    <div style={{ position: "absolute", right: 22 * s, bottom: 18 * s, fontSize: 96 * s, lineHeight: 1 }}>♠</div>
  </div>
);
export const StickerToken: React.FC<{ s?: number; text?: string }> = ({ s = 1, text = "+2 days" }) => (
  <div style={{ padding: `${18 * s}px ${28 * s}px`, background: C.amber, borderRadius: 16 * s, boxShadow: "0 18px 40px rgba(23,23,22,.2)", ...T, color: "#1b1405", fontSize: 64 * s, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</div>
);
export const ChipToken: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <div style={{ width: 220 * s, height: 220 * s, borderRadius: "50%", overflow: "hidden", display: "flex", boxShadow: "0 18px 40px rgba(23,23,22,.22)", border: `${8 * s}px solid #fbfaf6`, ...T, fontWeight: 600, fontSize: 44 * s }}>
    <div style={{ flex: 1, background: C.money, color: "#eef2ec", display: "flex", alignItems: "center", justifyContent: "center" }}>YES</div>
    <div style={{ flex: 1, background: C.neg, color: "#f6ece9", display: "flex", alignItems: "center", justifyContent: "center" }}>NO</div>
  </div>
);
const TOKENS = [CardToken, StickerToken, ChipToken];
const LABELS = ["gamble", "girl math", "bet on friends"];

// Slam: big spring in with overshoot + a tilt; at[i] = frame each lands.
export const Trio: React.FC<{ fr: number; at: number[]; out: number }> = ({ fr, at, out }) => {
  const o = prog(fr, out, 8);
  const sh = at.map((a) => shake(fr, a, 22, 12)).reduce((x, y) => ({ x: x.x + y.x, y: x.y + y.y, rot: x.rot + y.rot }), { x: 0, y: 0, rot: 0 });
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 120, paddingBottom: 150, opacity: 1 - o, transform: `translate(${sh.x}px,${sh.y}px) scale(${1 - o * 0.2})` }}>
      {TOKENS.map((Tok, i) => {
        const p = pop(fr, at[i] - 3, 9);
        const rot = [-9, 5, -4][i];
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: p > 0.01 ? 1 : 0, transform: `scale(${lerp(2.4, 1, Math.min(p, 1.25))}) rotate(${rot * p}deg)` }}>
            <div style={{ height: 360, display: "flex", alignItems: "center" }}><Tok s={1.3} /></div>
            <div style={{ ...T, fontSize: 72, fontWeight: 600, color: i === 2 ? C.money : C.fg }}>{LABELS[i]}</div>
          </div>
        );
      })}
    </div>
  );
};

// Chapter marker: one token slams in center, then flies to top-left as a section badge.
export const Chapter: React.FC<{ fr: number; at: number; i: number; label: string }> = ({ fr, at, i, label }) => {
  const Tok = TOKENS[i];
  const p = pop(fr, at, 10);
  const fly = prog(fr, at + 16, 12, easeInOut);
  if (fr < at) return null;
  const x = lerp(960, 150, fly), y = lerp(500, 120, fly), sc = lerp(1.25, 0.42, fly) * lerp(2, 1, Math.min(1, p));
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: C.bg, opacity: (1 - fly) * 0.85 }} />
      <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${sc}) rotate(${[-9, 5, -4][i]}deg)` }}><Tok /></div>
      <div style={{ position: "absolute", left: x + lerp(0, 60, fly), top: y + lerp(200, 0, fly), transform: `translate(${lerp(-50, 0, fly)}%,-50%)`, ...T, fontSize: lerp(64, 34, fly), fontWeight: 600, opacity: Math.min(1, p) }}>{label}</div>
    </>
  );
};

// ---- Callout: a number that pops next to what it explains (screen px) ----
export const Callout: React.FC<{ fr: number; at: number; x: number; y: number; big: string; small?: string; color?: string; until?: number; rot?: number }> = ({ fr, at, x, y, big, small, color = C.money, until = 1e9, rot = -3 }) => {
  if (fr < at - 2 || fr > until + 8) return null;
  const p = pop(fr, at, 10);
  const o = prog(fr, until, 8);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${(0.4 + 0.6 * p) * (1 - o * 0.3)}) rotate(${rot}deg)`, opacity: Math.min(1, p * 1.5) * (1 - o),
      background: C.pane, borderRadius: 18, padding: "18px 30px", boxShadow: "0 24px 60px rgba(23,23,22,.2)", ...T }}>
      {small && <div style={{ fontSize: 30, fontWeight: 500, color: C.muted, marginBottom: 4 }}>{small}</div>}
      <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1, color, whiteSpace: "nowrap" }}>{big}</div>
    </div>
  );
};

// ---- 50/30/20: Dime's framework, drawn ----
const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const IC = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  fork: "M7 2v8a2 2 0 0 0 4 0V2M9 10v12M17 2c-2 2-2 6 0 8v12",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
};
export const Rule: React.FC<{ fr: number; at: [number, number, number, number]; wantsFocus: number }> = ({ fr, at, wantsFocus }) => {
  const segs = [
    { n: 50, label: "Needs", sub: "rent, bills", color: "#7d7d76", icons: [IC.home, IC.bolt] },
    { n: 30, label: "Wants", sub: "your daily number", color: C.money, icons: [IC.bag, IC.fork] },
    { n: 20, label: "Future you", sub: "goals, investing", color: C.blue, icons: [IC.target, IC.trend] },
  ];
  const intro = pop(fr, at[0], 14);
  const wf = prog(fr, wantsFocus, 14, easeInOut);
  return (
    <div style={{ position: "absolute", inset: 0, ...T }}>
      <div style={{ position: "absolute", left: 160, top: 110, fontSize: 110, fontWeight: 600, letterSpacing: "-0.045em", opacity: Math.min(1, intro) * (1 - wf), transform: `translateY(${(1 - intro) * 40}px)` }}>
        The <span style={{ color: C.money }}>50/30/20</span> rule
      </div>
      <div style={{ position: "absolute", left: 160, top: 310, width: 1600, height: 300, borderRadius: 24, background: C.bg2, opacity: Math.min(1, intro) * (1 - wf * 0.9) }} />
      <div style={{ position: "absolute", left: 160, top: 310, width: 1600, height: 300, display: "flex", gap: 12 }}>
        {segs.map((s, i) => {
          const p = interpolate(fr, [at[i + 1] - 4, at[i + 1] + 9], [0, 1], { ...clamp, easing: easeInOut });
          const dim = (i === 1 ? 1 : 1 - wf * 0.8) * Math.min(1, p * 5);
          return (
            <div key={i} style={{ flex: `${s.n * p + 0.001} 1 0`, overflow: "visible", opacity: dim, minWidth: 0 }}>
              <div style={{ height: 300, background: s.color, borderRadius: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "26px 34px", color: "#f4f4f0", overflow: "hidden",
                transform: i === 1 ? `scale(${1 + wf * 0.08})` : undefined }}>
                <div style={{ display: "flex", gap: 14, opacity: prog(fr, at[i + 1] + 6, 8) }}>{s.icons.map((d, k) => <Icon key={k} d={d} />)}</div>
                <div style={{ fontSize: 170, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.85, whiteSpace: "nowrap" }}>{s.n}</div>
              </div>
              <div style={{ marginTop: 26, whiteSpace: "nowrap", opacity: prog(fr, at[i + 1] + 3, 10), transform: `translateY(${(1 - prog(fr, at[i + 1] + 3, 10)) * 20}px)` }}>
                <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: "-0.04em", color: i === 1 ? C.money : C.fg }}>{s.label}</div>
                <div style={{ fontSize: 40, color: C.muted, marginTop: 6 }}>{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- End card ----
export const End: React.FC<{ fr: number; at: number; line: { w: string; s: number }[] }> = ({ fr, at, line }) => {
  const p = pop(fr, at, 12);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, paddingBottom: 90, ...T }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34, transform: `scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, p * 2) }}>
        <Face size={190} fr={fr} mood={fr > at + 60 ? "happy" : "idle"} sw={9} />
        <div style={{ fontSize: 190, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1 }}>Dime</div>
      </div>
      <div style={{ display: "flex", gap: 20, fontSize: 64, fontWeight: 600, marginTop: 30, height: 80 }}>
        {line.map((w, i) => {
          const q = pop(fr, f(w.s) - 2, 11);
          const hot = /money|playing/i.test(w.w);
          return <span key={i} style={{ opacity: Math.min(1, q * 2), transform: `translateY(${(1 - q) * 30}px)`, display: "inline-block", color: hot ? C.money : C.fg }}>{w.w}</span>;
        })}
      </div>
      <div style={{ position: "absolute", bottom: 60, fontSize: 28, color: C.muted, opacity: prog(fr, at + 50, 15) }}>github.com/goodnight000/dime</div>
    </div>
  );
};
