import React from "react";
import { Freeze, Img, OffthreadVideo, interpolate, staticFile } from "remotion";
import { Box, C, FPS, clamp, easeInOut, footage, has } from "./lib";

// A camera key: from film sec `t`, glide (over `dur` s) to frame `box` (CSS px of the 1440x900 app).
// zoom: optional override of the screen scale per CSS px.
export type CamKey = { t: number; box?: Box | "full"; zoom?: number; dur?: number };
// Clip time map: from film sec `t`, the clip plays from `src` sec at `rate`.
export type Seg = { t: number; src: number; rate?: number };

const FULL: Box = { x: 0, y: 0, w: 1440, h: 900 };
const zoomFor = (b: Box) => Math.max(0.9, Math.min(2.5, (1920 * 0.6) / b.w, (1080 * 0.52) / b.h));

export const camState = (t: number, keys: CamKey[]) => {
  const st = (k: CamKey) => {
    const b = !k.box || k.box === "full" ? FULL : k.box;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, z: k.zoom ?? (k.box === "full" || !k.box ? 0.86 : zoomFor(b)) };
  };
  let cur = st(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k.t) break;
    const nxt = st(k);
    const p = interpolate(t, [k.t, k.t + (k.dur ?? 0.75)], [0, 1], { ...clamp, easing: easeInOut });
    cur = { x: cur.x + (nxt.x - cur.x) * p, y: cur.y + (nxt.y - cur.y) * p, z: Math.exp(Math.log(cur.z) + (Math.log(nxt.z) - Math.log(cur.z)) * p) };
  }
  return cur;
};

export const clipTime = (t: number, segs: Seg[], dur: number) => {
  let s = segs[0];
  for (const x of segs) if (t >= x.t) s = x;
  return Math.max(0, Math.min(dur - 0.07, s.src + (t - s.t) * (s.rate ?? 1)));
};

// The app window (device-less, soft shadow) under a virtual camera.
export const Shot: React.FC<{ fr: number; id: string; keys: CamKey[]; segs: Seg[]; children?: React.ReactNode; cy?: number; still?: string }> = ({ fr, id, keys, segs, children, cy = 520, still }) => {
  const t = fr / FPS;
  const cam = camState(t, keys);
  const c = still ? undefined : footage(id);
  const ph = still ?? `stills/ph-${id.slice(0, 2)}.png`;
  // placeholder stills get a slow drift so they never sit dead
  const drift = c || still ? 0 : Math.sin(t * 0.4) * 6;
  const media = c ? (
    <Freeze frame={Math.round(clipTime(t, segs, c.durationSec) * FPS)}>
      <OffthreadVideo src={staticFile("footage/" + c.file)} muted style={{ width: 1440, height: 900, display: "block" }} />
    </Freeze>
  ) : (
    <Img src={staticFile(has(ph) ? ph : "stills/ph-01.png")} style={{ width: 1440, height: 900, display: "block" }} />
  );
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: 1440, height: 900, transformOrigin: "0 0",
          transform: `translate(${960 - cam.x * cam.z + drift}px, ${cy - cam.y * cam.z}px) scale(${cam.z})`,
          borderRadius: 14, overflow: "hidden", background: C.bg,
          boxShadow: "0 2px 6px rgba(23,23,22,.06), 0 30px 80px rgba(23,23,22,.16)",
        }}
      >
        {media}
        {children /* overlays in app CSS px, move with the camera */}
      </div>
    </div>
  );
};
