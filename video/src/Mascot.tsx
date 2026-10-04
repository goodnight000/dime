import React from "react";
import { C, FPS, voLevel } from "./lib";

export type Mood = "idle" | "wince" | "cheeky" | "mischief" | "happy";
// Dime's face, the app's #cue mark: coin outline, two eye strokes, no mouth, 6° tilt.
// size = diameter in px. look = eye offset -1..1 (x,y). level = VO loudness 0..1.
export const Face: React.FC<{ size: number; fr: number; look?: [number, number]; mood?: Mood; level?: number; color?: string; sw?: number }> = ({
  size, fr, look = [0, 0], mood = "idle", level = 0, color = C.fg, sw = 9,
}) => {
  // blink every ~3.3s (seeded by frame), 4 frames
  const ph = fr % 100;
  const blink = ph >= 96 || (fr % 237 >= 233) ? 0.12 : 1;
  const talk = 1 + level * 0.22; // eyes stretch on loud syllables
  const ex = look[0] * 5, ey = look[1] * 4;
  let eyes: React.ReactNode;
  if (mood === "wince") {
    eyes = <path d="M35 42l9 5-9 5M65 42l-9 5 9 5" />;
  } else if (mood === "happy" || mood === "cheeky") {
    eyes = <path d={`M33 ${50 + ey}q6-8 12 0M55 ${50 + ey}q6-8 12 0`} />;
  } else if (mood === "mischief") {
    // one eye squints: a narrowed left stroke, a tall right one
    eyes = <path d={`M${36 + ex} ${46 + ey}h7M${61 + ex} ${42 + ey}v${10 * blink}`} />;
  } else {
    const h = 10 * blink * talk;
    eyes = <path d={`M${39 + ex} ${47 + ey - h / 2}v${h}M${61 + ex} ${47 + ey - h / 2}v${h}`} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible", transform: "rotate(-6deg)" }}>
      <g fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="50" cy="50" r="38" />
        {eyes}
      </g>
    </svg>
  );
};

// Persistent narrator: position/size/mood come from Film's per-act table.
export const Mascot: React.FC<{ fr: number; x: number; y: number; size: number; mood?: Mood; look?: [number, number]; bounce?: number; disc?: boolean }> = ({
  fr, x, y, size, mood, look, bounce = 0, disc = true,
}) => {
  const lv = voLevel(fr);
  const sq = 1 + lv * 0.06; // squash with the voice
  const bob = Math.sin((fr / FPS) * 2.2) * 3;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2 + bob - bounce, width: size, height: size, transform: `scale(${1 / Math.sqrt(sq)}, ${sq})`, transformOrigin: "50% 100%" }}>
      {disc && <div style={{ position: "absolute", inset: size * 0.1, borderRadius: "50%", background: C.pane, boxShadow: "0 10px 30px rgba(23,23,22,.14)" }} />}
      <div style={{ position: "absolute", inset: 0 }}>
        <Face size={size} fr={fr} mood={mood} look={look} level={lv} />
      </div>
    </div>
  );
};
