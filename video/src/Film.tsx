import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/InstrumentSans";
import { C, FPS, GAPS, TOTAL, VO_END, VO_SEGS, WORDS, clamp, cue, easeInOut, f, has, km, lerp, pop, prog, speaking, Box, toFilm, footage, clip } from "./lib";
import { Shot, CamKey, Seg } from "./Shot";
import { Mascot, Mood } from "./Mascot";
import { Captions } from "./Captions";
import { Callout, Chapter, End, Hook, Rule, StickerToken, Trio } from "./Graphics";
import { shake } from "./kit/camera";

loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

const tryCue = (ps: string[], nth = 0) => {
  for (const p of ps) { try { return cue(p, nth); } catch { /* next */ } }
  throw new Error("cue not found: " + ps.join(" | "));
};
const fr_ = (s: number) => f(s);

// ---------- timing (film seconds, all from the VO) ----------
const T = {
  intro: 0,
  dime: tryCue(["I'm Dime"]),
  cfoWord: tryCue(["your CFO"]),
  live: tryCue(["I live in your texts", "I live"]),
  gamble: tryCue(["gamble"]),
  girl: tryCue(["do girl math", "girl math"]),
  bet: tryCue(["bet on your friends"]),
  girlAct: tryCue(["Every price becomes"]),
  twoDays: tryCue(["two days later", "two days"]),
  bj: tryCue(["Want something"]),
  lose: tryCue(["Lose and that money"]),
  invested: tryCue(["gets invested", "invested"]),
  even: tryCue(["Even when you gamble"]),
  wealth: tryCue(["building wealth"]),
  friends: tryCue(["Add your friends"]),
  acc: tryCue(["accountability"]),
  penny: tryCue(["Bet on whether Penny", "whether Penny"]),
  settle: tryCue(["I settle it"]),
  dash: tryCue(["And every single day", "every single day"]),
  goal: tryCue(["Every dollar you don't", "Every dollar"]),
  until: tryCue(["until it's yours"]),
  end: tryCue(["Dime Get good", "Get good"]),
  dashF: tryCue(["bet on your friends"]) + 1.75,
  house: tryCue(["on the house"]),
  goalSet: tryCue(["building wealth"]) + 0.9,
  dollarEnd: tryCue(["where you stood"]) + 0.9,
};
const END_SEC = TOTAL / FPS;
const MUSIC_END = 97.6; // the track's final hit lands on the end card

// ---------- acts ----------
type Trans = "cut" | "whip" | "push";
type Act = { name: string; s: number; e: number; inT: Trans; draw: (fr: number) => React.ReactNode };

const box = (id: string, what: string, t: number, b: Box) => km(id, what, t, b);
const COMPOSER: Box = { x: 488, y: 734, w: 507, h: 61 };

const ACTS: Act[] = [
  {
    name: "intro", s: T.intro, e: T.dashF, inT: "cut",
    draw: (fr) => {
      const t = fr / FPS;
      const back = box("01", "back at latest", 12.72, COMPOSER);
      const rate = Math.max(0.8, Math.min(2.2, (back.t - 7.0) / (T.dashF - T.live)));
      const keys: CamKey[] = [{ t: 0, box: "full" }, { t: T.dashF - 0.6, box: back.box ?? COMPOSER, zoom: 1.9, dur: 0.75 }];
      const slide = pop(fr, f(T.live) - 2, 15);
      const trioOut = f(T.dashF) - 14;
      const dim = interpolate(fr, [f(T.gamble) - 4, f(T.gamble), trioOut, trioOut + 8], [0, 0.94, 0.94, 0], clamp);
      return (
        <>
          {t >= T.live - 0.2 && (
            <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - slide) * 900}px)` }}>
              <Shot fr={fr} id="01" keys={keys} segs={[{ t: T.live, src: 7.0, rate }]} />
            </div>
          )}
          <AbsoluteFill style={{ background: C.bg, opacity: dim }} />
          <Trio fr={fr} at={[f(T.gamble), f(T.girl), f(T.bet)]} out={trioOut} />
          <CfoTag fr={fr} />
        </>
      );
    },
  },  {
    name: "dashF", s: T.dashF, e: T.bj, inT: "whip",
    draw: (fr) => {
      const a = T.dashF;
      const keys: CamKey[] = [{ t: 0, box: { x: 262, y: 118, w: 340, h: 150 }, zoom: 1.7 }, { t: a + 1.0, box: { x: 632, y: 126, w: 450, h: 61 }, zoom: 1.9, dur: 0.9 }, { t: a + 2.4, box: { x: 632, y: 250, w: 420, h: 400 }, zoom: 1.4, dur: 1.0 }];
      return <Shot fr={fr} id="07" keys={keys} segs={[{ t: a, src: 7.0 }]} />;
    },
  },
  {
    name: "bj", s: T.bj, e: T.goalSet, inT: "whip",
    draw: (fr) => {
      const a = T.bj, L = T.lose;
      const deal = box("04", "table deals", 9.98, { x: 488, y: 509, w: 341, h: 295 });
      const flip = box("04", "click Stand", 15.26, { x: 670, y: 746, w: 158, h: 39 });
      const result = box("04", "result", 16.46, { x: 488, y: 492, w: 352, h: 304 });
      const slowAt = L - 1.9;
      const r1 = Math.max(0.7, Math.min(2.5, (flip.t - (deal.t - 0.5)) / (slowAt - a)));
      const segs: Seg[] = [{ t: a, src: deal.t - 0.5, rate: r1 }, { t: slowAt, src: flip.t, rate: (result.t - flip.t) / 2.0 }, { t: L + 0.1, src: result.t }];
      const keys: CamKey[] = [
        { t: 0, box: "full" }, { t: a + 0.7, box: result.box, zoom: 1.85, dur: 0.7 },
        { t: slowAt, box: result.box, zoom: 2.35, dur: 1.8 }, { t: L + 0.1, box: result.box, zoom: 1.9, dur: 0.35 },
      ];
      const hit = f(L + 0.1);
      const sh = shake(fr, hit, 26, 16);
      const flash = interpolate(fr, [hit, hit + 7], [0.7, 0], clamp);
      return (
        <>
          <div style={{ position: "absolute", inset: 0, transform: `translate(${sh.x}px,${sh.y}px) rotate(${sh.rot}deg)` }}>
            <Shot fr={fr} id="04" keys={keys} segs={segs} />
          </div>
          <AbsoluteFill style={{ background: "#fff", opacity: fr >= hit ? flash : 0 }} />
          <Callout fr={fr} at={f(T.invested) - 2} x={1530} y={290} big="$280 → S&P 500" small="lost the hand" color={C.money} until={f(T.goalSet) - 6} rot={-2} />
          <Chapter fr={fr} at={f(a)} i={0} label="blackjack" />
        </>
      );
    },
  },  {
    name: "setgoal", s: T.goalSet, e: T.girlAct, inT: "whip",
    draw: (fr) => {
      const a = T.goalSet;
      const has10 = !!footage("10");
      const p = pop(fr, f(a) + 2, 11);
      return (
        <>
          {has10
            ? <Shot fr={fr} id="10" keys={[{ t: 0, box: "full" }, { t: a + 1.0, box: { x: 400, y: 450, w: 700, h: 380 }, zoom: 1.6, dur: 1.2 }]} segs={[{ t: a, src: Math.max(0, (clip("10")?.durationSec ?? 6) - (T.girlAct - a) * 2.2), rate: 2.2 }]} />
            : <Shot fr={fr} id="07" still="stills/ph-07.png" keys={[{ t: 0, box: { x: 262, y: 280, w: 340, h: 240 }, zoom: 1.6 }, { t: a + 0.2, box: { x: 262, y: 280, w: 340, h: 240 }, zoom: 2.2, dur: 2.4 }]} segs={[{ t: 0, src: 0 }]} />}
          <div style={{ position: "absolute", left: 0, right: 0, top: 90, textAlign: "center", fontFamily: "Instrument Sans", fontWeight: 600, fontSize: 96, letterSpacing: "-0.045em", color: C.fg, opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 40}px) scale(${0.8 + 0.2 * Math.min(1, p)})` }}>
            <span style={{ background: C.pane, padding: "10px 34px", borderRadius: 20, boxShadow: "0 20px 50px rgba(23,23,22,.15)" }}>Set a goal <span style={{ color: C.money }}>by text</span></span>
          </div>
        </>
      );
    },
  },
  {
    name: "girl", s: T.girlAct, e: T.goal, inT: "cut",
    draw: (fr) => {
      const a = T.girlAct;
      const card = box("03", "card arrives", 11.11, { x: 488, y: 652, w: 352, h: 144 });
      const settled = box("03", "settled", 14.24, card.box!);
      const keys: CamKey[] = [{ t: 0, box: { x: 300, y: 400, w: 900, h: 420 }, zoom: 1.3 }, { t: a + 1.0, box: settled.box, zoom: 2.2, dur: 0.8 }];
      const p = pop(fr, f(T.twoDays) - 2, 9);
      return (
        <>
          <Shot fr={fr} id="03" keys={keys} segs={[{ t: a, src: card.t - 1.1 }]} />
          {fr >= f(T.twoDays) - 2 && (
            <div style={{ position: "absolute", left: 1560, top: 330, transform: `translate(-50%,-50%) scale(${lerp(2.2, 1, Math.min(1.15, p))}) rotate(${6 * p}deg)` }}><StickerToken /></div>
          )}
          <Chapter fr={fr} at={f(a)} i={1} label="girl math" />
        </>
      );
    },
  },  {
    name: "goal", s: T.goal, e: T.dash, inT: "cut",
    draw: (fr) => {
      const a = T.goal;
      const ring = box("09", "ring 100", 13.1, { x: 488, y: 592, w: 352, h: 204 });
      const order = box("09", "Order it", 16.97, { x: 490, y: 752, w: 171, h: 43 });
      const tO = T.dash - 0.85;
      const segs: Seg[] = [{ t: a, src: ring.t - (T.until + 0.3 - a) }, { t: tO, src: order.t - 0.35 }];
      const keys: CamKey[] = [{ t: 0, box: ring.box, zoom: 1.6 }, { t: a + 0.3, box: ring.box, zoom: 2.2, dur: 1.6 }, { t: tO, box: order.box, zoom: 2.4, dur: 0.35 }];
      return <Shot fr={fr} id="09" keys={keys} segs={segs} />;
    },
  },  {
    name: "dash", s: T.dash, e: T.friends, inT: "whip",
    draw: (fr) => {
      const a = T.dash;
      const sep = box("07", "September", 12.26, { x: 632, y: 277, w: 416, h: 356 });
      const click = box("07", "click Sep 12", 16.15, { x: 992, y: 349, w: 56, h: 68 });
      const inv = 1e9;
      if (fr / FPS >= inv) {
        const scrub = box("08", "scrub start", 5.08, { x: 272, y: 304, w: 752, h: 208 });
        return <Shot fr={fr} id="08" keys={[{ t: 0, box: "full", zoom: 1.0 }, { t: inv, box: scrub.box, zoom: 1.45, dur: 0.6 }]} segs={[{ t: inv, src: scrub.t - 0.3, rate: 3 }]} />;
      }
      const segs: Seg[] = [{ t: a, src: sep.t - 0.6 }, { t: a + 2.6, src: click.t - 0.3 }];
      const keys: CamKey[] = [
        { t: 0, box: sep.box, zoom: 1.2 }, { t: a + 0.3, box: sep.box, zoom: 1.5, dur: 0.8 },
        { t: a + 2.7, box: { x: 632, y: 250, w: 790, h: 420 }, zoom: 1.5, dur: 0.6 },
      ];
      const leg = (k: number, txt: string, col: string) => { const q = pop(fr, f(a + 1.4 + k * 0.35), 10); return <div style={{ opacity: Math.min(1, q), transform: `scale(${0.6 + 0.4 * Math.min(1.1, q)})`, background: C.pane, borderRadius: 16, padding: "14px 26px", boxShadow: "0 18px 40px rgba(23,23,22,.16)", display: "flex", alignItems: "center", gap: 16, fontFamily: "Instrument Sans", fontWeight: 600, fontSize: 46, letterSpacing: "-0.03em" }}><span style={{ width: 34, height: 34, borderRadius: 8, background: col }} />{txt}</div>; };
      return (<><Shot fr={fr} id="07" keys={keys} segs={segs} /><div style={{ position: "absolute", left: 70, top: 120, display: "flex", flexDirection: "column", gap: 18 }}>{leg(0, "green = under budget", C.money)}{leg(1, "red = over budget", C.neg)}</div></>);
    },
  },  {
    name: "group", s: T.friends, e: T.end, inT: "cut",
    draw: (fr) => {
      const a = T.friends;
      const mk = box("06", "market card", 19.27, { x: 526, y: 324, w: 352, h: 264 });
      const fb = box("06", "friends bet", 23.01, mk.box!);
      const you = box("06", "you bet", 27.62, mk.box!);
      const s38 = box("06", "swipes $38", 33.94, { x: 526, y: 758, w: 301, h: 38 });
      const s52 = box("06", "swipes $52", 43.13, { x: 526, y: 758, w: 105, h: 38 });
      const settle = box("06", "settles", 59, { x: 526, y: 393, w: 352, h: 264 });
      const side = box("06", "(after)", 62.1, { x: 73, y: 100, w: 150, h: 16 });
      const tS = T.settle + 0.6, tSide = Math.min(T.end - 0.9, tS + 1.5);
      const segs: Seg[] = [
        { t: a, src: mk.t - 0.6 }, { t: T.acc - 0.1, src: fb.t - 0.3 }, { t: T.penny + 0.2, src: you.t - 0.6 },
        { t: T.penny + 1.5, src: s38.t - 0.3 }, { t: T.settle - 0.4, src: s52.t - 0.3 }, { t: tS, src: settle.t - 0.2 }, { t: tSide, src: side.t - 0.4 },
      ];
      const keys: CamKey[] = [
        { t: 0, box: mk.box, zoom: 1.7 }, { t: a + 0.9, box: mk.box, zoom: 1.9, dur: 0.5 },
        { t: T.penny + 1.5, box: { ...s38.box!, x: s38.box!.x - 40, w: 480 }, zoom: 2.0, dur: 0.35 },
        { t: tS, box: settle.box, zoom: 1.9, dur: 0.35 },
        { t: tSide, box: { x: 20, y: 60, w: 300, h: 80 }, zoom: 2.6, dur: 0.45 },
      ];
      const pp = pop(fr, f(tS), 8);
      const punch = fr >= f(tS) ? 1 + 0.06 * Math.sin(Math.min(1, (fr - f(tS)) / 10) * Math.PI) : 1;
      return (
        <>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${punch})` }}>
            <Shot fr={fr} id="06" keys={keys} segs={segs} />
          </div>
          <Callout fr={fr} at={f(T.acc) - 1} x={1480} y={250} big="accountability" small="with friends" until={f(T.penny) + 6} rot={-3} />
          <Callout fr={fr} at={f(tSide) + 6} x={1300} y={330} big="+$6" small="today's number" until={f(T.end) - 4} />
          <Chapter fr={fr} at={f(a)} i={2} label="bet on friends" />
          {pp && null}
        </>
      );
    },
  },  {
    name: "end", s: T.end, e: END_SEC, inT: "push",
    draw: (fr) => {
      const line = WORDS.filter((w) => w.s >= T.end + 0.05);
      return <End fr={fr} at={f(T.end)} line={line} />;
    },
  },];

const CfoTag: React.FC<{ fr: number }> = ({ fr }) => {
  const p = pop(fr, f(T.cfoWord), 11);
  const o = prog(fr, f(T.live) - 2, 10);
  if (fr < f(T.cfoWord) - 2 || o >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 700, textAlign: "center", fontFamily: "Instrument Sans", fontWeight: 600, fontSize: 88, letterSpacing: "-0.04em", color: C.fg, opacity: Math.min(1, p) * (1 - o), transform: `translateY(${(1 - p) * 30}px)` }}>
      your <span style={{ color: C.money }}>CFO</span>
    </div>
  );
};

// ---------- mascot direction per act ----------
const mascotState = (fr: number) => {
  const t = fr / FPS;
  const corner = { x: 118, y: 948, size: 150 };
  let mood: Mood = "idle", look: [number, number] = [0.6, -0.5], bounce = 0;
  // entrance: big center, then to corner as the app slides in
  const ent = pop(fr, -4, 11);
  const toCorner = prog(fr, f(T.live) - 4, 16, easeInOut);
  let x = lerp(960, corner.x, toCorner), y = lerp(470, corner.y, toCorner), size = lerp(380 * Math.min(ent, 1.3), corner.size, toCorner);
  if (t >= T.gamble - 0.1 && t < T.dashF) { mood = "mischief"; look = [1, -0.3]; }
  if (t >= T.lose + 0.1 && t < T.even) mood = "wince";
  if (t >= T.wealth - 0.1 && t < T.goalSet) { mood = "cheeky"; bounce = 40 * Math.max(0, Math.sin(Math.min(1, (t - T.wealth + 0.1) / 0.5) * Math.PI)); }
  if (t >= tS() && t < T.end) { mood = "happy"; }
  if (t >= T.until && t < T.dash) { mood = "happy"; bounce = 26 * Math.max(0, Math.sin(Math.min(1, (t - T.until) / 0.45) * Math.PI)); }
  // pop out of the corner at the peaks (2x, spring), react, return
  const peaks: [number, number][] = [[T.gamble, T.dashF - 0.4], [T.lose + 0.1, T.wealth + 0.9], [tS(), tS() + 1.4], [T.until - 0.1, T.dash - 0.6]];
  let po = 0;
  for (const [a, b] of peaks) po = Math.max(po, Math.min(pop(fr, f(a) - 2, 10), 1 - prog(fr, f(b), 10, easeInOut)));
  if (t >= T.live) { size *= 1 + po; x += po * 70; y -= po * 110; }
  // to the end card: shrink away while the end card's face takes over
  const gone = prog(fr, f(T.end) - 2, 10, easeInOut);
  size *= 1 - gone;
  return { x, y, size, mood, look, bounce };
};
const tS = () => T.settle + 0.6;

// ---------- sound ----------
type Sfx = { at: number; src: string; vol?: number; dur?: number };
const whipAt = ACTS.filter((a) => a.inT === "whip" || a.inT === "push").map((a) => a.s);
const SFX: Sfx[] = [
  ...[T.gamble, T.girl, T.bet].map((t) => ({ at: t - 0.05, src: "punch-impact", vol: 0.55 })),
  ...whipAt.map((t) => ({ at: t - 0.12, src: "swish-whoosh", vol: 0.45 })),
  ...[T.girlAct, T.bj, T.friends].map((t) => ({ at: t - 0.03, src: "pop-accent", vol: 0.6 })),
  { at: T.lose - 1.9, src: "drum-roll", vol: 0.45, dur: 1.95 },
  { at: T.lose + 0.07, src: "punch-impact", vol: 0.8 },
  { at: tS() - 0.03, src: "cash-register-coins", vol: 0.6 },
  { at: T.dash - 0.85, src: "click-accent", vol: 0.6 },
  { at: T.end - 0.1, src: "swish-whoosh", vol: 0.45 },
];

const musicVol = (fr: number) => {
  const t = fr / FPS;
  const duck = speaking(t);
  const tail = interpolate(t, [END_SEC - 1.6, END_SEC - 0.1], [1, 0], clamp);
  const head = interpolate(t, [0, 0.25], [0, 1], clamp);
  return (0.5 * (1 - duck) + 0.085 * duck) * tail * head;
};

const transform = (fr: number, act: Act, next?: Act) => {
  // incoming
  const sIn = f(act.s), q = (fr - sIn) / 7;
  let tf = "", blur = 0;
  if (act.inT === "whip" && q < 1) { const k = easeInOut(Math.max(0, q)); tf += `translateX(${(1 - k) * 700}px)`; blur = (1 - k) * 26; }
  if (act.inT === "push" && q < 1) { const k = easeInOut(Math.max(0, q)); tf += `scale(${0.82 + 0.18 * k})`; blur = (1 - k) * 14; }
  // outgoing
  if (next && next.inT !== "cut") {
    const p = (fr - (f(next.s) - 7)) / 7;
    if (p > 0) {
      const k = easeInOut(Math.min(1, p));
      if (next.inT === "whip") { tf += ` translateX(${-k * 700}px)`; blur = k * 26; }
      else { tf += ` scale(${1 + k * 0.5})`; blur = k * 14; }
    }
  }
  return { transform: tf || undefined, filter: blur > 0.3 ? `blur(${blur}px)` : undefined };
};

export const Film: React.FC<{ frame: number }> = ({ frame: fr }) => {
  const i = ACTS.findIndex((a) => fr < f(a.e));
  const idx = i < 0 ? ACTS.length - 1 : i;
  const act = ACTS[idx], next = ACTS[idx + 1];
  const m = mascotState(fr);
  // during an incoming whip/push, keep drawing the previous act under it for the first frames
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: "Instrument Sans", overflow: "hidden" }}>
      <AbsoluteFill style={transform(fr, act, next)}>{act.draw(fr)}</AbsoluteFill>
      <Captions fr={fr} hide={fr >= f(T.end) - 2} />
      {m.size > 2 && <Mascot fr={fr} x={m.x} y={m.y} size={m.size} mood={m.mood} look={m.look} bounce={m.bounce} />}
      {/* audio */}
      {has("audio/vo.wav") && VO_SEGS.map(([v0, v1], k) => (
        <Sequence key={k} from={f(toFilm(v0))} durationInFrames={Math.max(1, f(v1 - v0))}>
          <Audio src={staticFile("audio/vo.wav")} startFrom={f(v0)} />
        </Sequence>
      ))}
      {has("audio/music.wav") && <Audio src={staticFile("audio/music.wav")} volume={musicVol} startFrom={Math.max(0, f(MUSIC_END - END_SEC))} />}
      {SFX.map((s, k) => (
        <Sequence key={"s" + k} from={Math.max(0, f(s.at))} durationInFrames={s.dur ? f(s.dur) : 60}>
          <Audio src={staticFile(`sfx/${s.src}.wav`)} volume={(x) => (s.vol ?? 0.6) * (s.dur ? interpolate(x, [f(s.dur) - 8, f(s.dur)], [1, 0], clamp) : 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
export const FILM_TOTAL = TOTAL;
export { T, VO_END };
