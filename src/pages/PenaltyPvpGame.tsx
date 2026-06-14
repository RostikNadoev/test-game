import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FC, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  PENALTY PvP — World Cup 2026 inspired penalty shootout mini-game   */
/*  Player vs Bot · behind-the-ball camera · hidden simultaneous picks */
/*  Tri-host (CAN · MEX · USA) flavour · self-contained · no deps      */
/* ------------------------------------------------------------------ */

type Dir = "TL" | "TR" | "C" | "BL" | "BR";
type Side = "player" | "bot";
type Outcome = "goal" | "save";
type Phase = "intro" | "choosing" | "reveal" | "result" | "final";

const DIRS: Dir[] = ["TL", "TR", "C", "BL", "BR"];

const ROUNDS = 5;
const CHOOSE_MS = 5000;
const TRAVEL_MS = 760;
const REBOUND_MS = 680;
const RESULT_MS = 1500;

/* Scene coordinate maps (percentages of the play area) ------------- */
const ZONE: Record<Dir, { x: number; y: number }> = {
  TL: { x: 34, y: 21 },
  TR: { x: 66, y: 21 },
  C: { x: 50, y: 28 },
  BL: { x: 35, y: 36 },
  BR: { x: 65, y: 36 },
};
const REST_KEEPER = { x: 50, y: 47, tilt: 0 };
const KEEPER: Record<Dir, { x: number; y: number; tilt: number }> = {
  TL: { x: 36, y: 47, tilt: -44 },
  TR: { x: 64, y: 47, tilt: 44 },
  C: { x: 50, y: 47, tilt: 0 },
  BL: { x: 38, y: 47, tilt: -66 },
  BR: { x: 62, y: 47, tilt: 66 },
};
/* arc lift per shot — % of the ball's own height; ball bows upward mid-flight */
const ARC: Record<Dir, number> = { TL: -120, TR: -120, C: -88, BL: -52, BR: -52 };
const REBOUND: Record<Dir, { x: number; y: number; scale: number; arc: number }> = {
  TL: { x: 19, y: 62, scale: 0.82, arc: -85 },
  TR: { x: 81, y: 62, scale: 0.82, arc: -85 },
  C: { x: 55, y: 69, scale: 0.92, arc: -70 },
  BL: { x: 22, y: 72, scale: 1.02, arc: -42 },
  BR: { x: 78, y: 72, scale: 1.02, arc: -42 },
};

const C = {
  gold: "#f6c453",
  goldHi: "#ffe7a0",
  teal: "#34e2b0",
  rose: "#ff5d7a",
  sky: "#7fb6ff",
  ink: "#0a0f1d",
  grass: "#178847",
  line: "rgba(255,255,255,0.12)",
  panel: "rgba(255,255,255,0.06)",
};

/* 2026's three host nations — abstract tri-colour bars, no official marks */
const HOSTS: { code: string; grad: string }[] = [
  { code: "CAN", grad: "linear-gradient(90deg,#ff4d4d 0 32%,#fff 32% 68%,#ff4d4d 68%)" },
  { code: "MEX", grad: "linear-gradient(90deg,#1f9d57 0 33%,#fff 33% 66%,#e23b4e 66%)" },
  { code: "USA", grad: "linear-gradient(90deg,#3b6bff 0 40%,#fff 40% 70%,#e23b4e 70%)" },
];
const MARQUEE = "PENALTY SHOOTOUT 2026   •   HIDDEN PICKS   •   FIVE ROUNDS   •   FAIR PLAY   •   ";

interface GameState {
  pScore: number;
  bScore: number;
  pKicks: number;
  bKicks: number;
  pRes: Outcome[];
  bRes: Outcome[];
  sudden: boolean;
}
const INIT: GameState = { pScore: 0, bScore: 0, pKicks: 0, bKicks: 0, pRes: [], bRes: [], sudden: false };

interface Anim {
  shoot: Dir;
  save: Dir;
  outcome: Outcome;
  shooter: Side;
  keeper: Side;
}

/* ---------------------------- helpers ---------------------------- */
function weighted(w: Record<Dir, number>): Dir {
  const total = DIRS.reduce((s, d) => s + w[d], 0);
  let r = Math.random() * total;
  for (const d of DIRS) {
    r -= w[d];
    if (r <= 0) return d;
  }
  return "C";
}
function mostCommon(arr: Dir[]): Dir | null {
  if (!arr.length) return null;
  const recent = arr.slice(-5);
  const count: Record<string, number> = {};
  let best: Dir | null = null;
  let bestN = 0;
  for (const d of recent) {
    count[d] = (count[d] || 0) + 1;
    if (count[d] > bestN) {
      bestN = count[d];
      best = d;
    }
  }
  return bestN >= 2 ? best : null;
}
function botShoot(playerSaves: Dir[]): Dir {
  const w: Record<Dir, number> = { TL: 1, TR: 1, C: 0.55, BL: 1, BR: 1 };
  const fav = mostCommon(playerSaves);
  if (fav) w[fav] *= 0.45;
  DIRS.forEach((d) => (w[d] *= 0.75 + Math.random() * 0.6));
  return weighted(w);
}
function botSave(playerShots: Dir[]): Dir {
  const w: Record<Dir, number> = { TL: 1, TR: 1, C: 0.8, BL: 1, BR: 1 };
  const fav = mostCommon(playerShots);
  if (fav) w[fav] *= 1.7;
  DIRS.forEach((d) => (w[d] *= 0.75 + Math.random() * 0.6));
  return weighted(w);
}
function autoPick(role: "shoot" | "save"): Dir {
  return role === "shoot"
    ? weighted({ TL: 1, TR: 1, C: 0.4, BL: 1, BR: 1 })
    : weighted({ TL: 1, TR: 1, C: 0.9, BL: 1, BR: 1 });
}

/* --------------------------- styles ------------------------------ */
const STYLES = `
.pk-root,.pk-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pk-root{position:relative;width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;
  user-select:none;touch-action:manipulation;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#eef2ff;background:radial-gradient(120% 80% at 50% -10%,#16203c 0%,#0a0f1d 55%,#070a14 100%)}
@keyframes pk-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes pk-spin{from{transform:rotate(0)}to{transform:rotate(720deg)}}
@keyframes pk-rot{to{transform:rotate(360deg)}}
@keyframes pk-arc{0%{transform:translateY(0)}54%{transform:translateY(var(--arc,0))}100%{transform:translateY(0)}}
@keyframes pk-dive{0%{transform:scaleY(.98) scaleX(1.01)}24%{transform:scaleY(1.06) scaleX(.94)}62%{transform:scaleX(1.18) scaleY(.88)}100%{transform:scale(1)}}
@keyframes pk-flash{0%{opacity:.95}100%{opacity:0}}
@keyframes pk-ripple{0%{transform:translate(-50%,-50%) scale(.25);opacity:.85}100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}
@keyframes pk-bulge{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}40%{opacity:.9}100%{transform:translate(-50%,-50%) scale(1.15);opacity:0}}
@keyframes pk-shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-3px,2px)}40%{transform:translate(3px,-2px)}60%{transform:translate(-2px,-1px)}80%{transform:translate(2px,1px)}}
@keyframes pk-pop{0%{transform:scale(1)}40%{transform:scale(1.4)}100%{transform:scale(1)}}
@keyframes pk-lock{0%{transform:translate(-50%,-50%) scale(1)}45%{transform:translate(-50%,-50%) scale(1.16)}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes pk-rise{0%{opacity:0;transform:translate(-50%,12px)}100%{opacity:1;transform:translate(-50%,0)}}
@keyframes pk-resultIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.14)}70%{transform:translate(-50%,-50%) scale(.98)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes pk-confetti{0%{transform:translateY(-12%) rotate(0);opacity:1}100%{transform:translateY(560%) rotate(620deg);opacity:0}}
@keyframes pk-glow{0%,100%{opacity:.4}50%{opacity:.95}}
@keyframes pk-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes pk-sweep{0%{transform:translateX(-140%)}100%{transform:translateX(140%)}}
@keyframes pk-marquee{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}
@keyframes pk-twinkle{0%,100%{opacity:.15}50%{opacity:.9}}
@keyframes pk-flood{0%,100%{opacity:.5}50%{opacity:.85}}
@keyframes pk-netPulse{0%{opacity:.18;transform:scale(.96)}55%{opacity:.55;transform:scale(1.06)}100%{opacity:0;transform:scale(1.18)}}
@keyframes pk-saveSpark{0%{opacity:0;transform:translate(-50%,-50%) scale(.45)}25%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}
.pk-shakefx{animation:pk-shake .34s ease both}
.pk-spinfx{animation:pk-spin .72s cubic-bezier(.22,.05,.45,.95)}
.pk-zone{transition:transform .15s ease,box-shadow .2s ease,background .2s ease}
.pk-zone:active{filter:brightness(1.15)}
.pk-btn{transition:transform .12s ease,box-shadow .2s ease,filter .2s ease}
.pk-btn:active{transform:scale(.96)}
@media (prefers-reduced-motion:reduce){.pk-root *{animation-duration:.001s!important;transition-duration:.05s!important}}
`;

/* --------------------------- artwork ----------------------------- */
const Ball: FC = memo(() => (
  <svg viewBox="0 0 72 72" width="100%" height="100%" style={{ display: "block", filter: "drop-shadow(0 6px 9px rgba(0,0,0,.42))" }}>
    <defs>
      <radialGradient id="pkball" cx="36%" cy="28%" r="78%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#f7fbff" />
        <stop offset="78%" stopColor="#dce5f4" />
        <stop offset="100%" stopColor="#aab7ca" />
      </radialGradient>
      <linearGradient id="pkballGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff0b7" />
        <stop offset="100%" stopColor="#f6c453" />
      </linearGradient>
      <linearGradient id="pkballTeal" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9cffdf" />
        <stop offset="100%" stopColor="#34e2b0" />
      </linearGradient>
    </defs>
    <circle cx="36" cy="36" r="31" fill="url(#pkball)" stroke="#ecf3ff" strokeWidth="1.2" />
    <path d="M36 15 L50 25 L45 42 L27 42 L22 25 Z" fill="#121a2d" />
    <path d="M36 15 L50 25 L45 42 L27 42 L22 25 Z" fill="none" stroke="#f6c453" strokeWidth="1.2" opacity=".75" />
    <path d="M22 25 C14 27 10 34 10 42" fill="none" stroke="url(#pkballTeal)" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M50 25 C59 28 63 34 62 43" fill="none" stroke="url(#pkballGold)" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M27 42 C26 51 30 58 36 64" fill="none" stroke="#121a2d" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M45 42 C48 51 44 59 36 64" fill="none" stroke="#121a2d" strokeWidth="3.4" strokeLinecap="round" />
    <g stroke="#121a2d" strokeWidth="2.2" strokeLinecap="round" opacity=".9">
      <line x1="36" y1="15" x2="36" y2="5" />
      <line x1="22" y1="25" x2="12" y2="19" />
      <line x1="50" y1="25" x2="60" y2="19" />
    </g>
    <ellipse cx="27" cy="21" rx="8" ry="4.6" fill="#ffffff" opacity=".68" transform="rotate(-24 27 21)" />
    <path d="M16 52 C25 63 45 68 57 52" fill="none" stroke="#7d8da6" strokeWidth="1.1" opacity=".38" />
  </svg>
));

const Keeper: FC<{ accent: string }> = memo(({ accent }) => (
  <svg viewBox="0 0 72 100" width="100%" height="100%" style={{ display: "block", filter: "drop-shadow(0 7px 9px rgba(0,0,0,.5))" }}>
    <defs>
      <linearGradient id="pkkit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity=".28" />
        <stop offset="22%" stopColor={accent} />
        <stop offset="100%" stopColor={accent} />
      </linearGradient>
    </defs>
    {/* legs */}
    <path d="M30 62 L24 90" stroke="#1f2a48" strokeWidth="9" strokeLinecap="round" />
    <path d="M42 62 L48 90" stroke="#1f2a48" strokeWidth="9" strokeLinecap="round" />
    {/* socks */}
    <path d="M25 82 L24 90" stroke={accent} strokeWidth="9" strokeLinecap="round" />
    <path d="M47 82 L48 90" stroke={accent} strokeWidth="9" strokeLinecap="round" />
    {/* boots */}
    <path d="M20 92 q-4 0 -4 3 q0 3 6 3 l5 -1 q2 -4 -1 -6 Z" fill="#0e1426" />
    <path d="M52 92 q4 0 4 3 q0 3 -6 3 l-5 -1 q-2 -4 1 -6 Z" fill="#0e1426" />
    {/* shorts */}
    <path d="M26 56 H46 L44 70 H38 L36 60 L34 70 H28 Z" fill="#141d36" />
    {/* torso */}
    <path d="M24 30 Q36 26 48 30 L46 58 Q36 62 26 58 Z" fill="url(#pkkit)" stroke="rgba(0,0,0,.15)" strokeWidth="1" />
    {/* number */}
    <text x="36" y="48" textAnchor="middle" fontSize="13" fontWeight="900" fill="rgba(255,255,255,.85)" fontFamily="ui-sans-serif,system-ui">1</text>
    {/* arms out (ready / star) */}
    <path d="M26 33 L8 18" stroke={accent} strokeWidth="9" strokeLinecap="round" />
    <path d="M46 33 L64 18" stroke={accent} strokeWidth="9" strokeLinecap="round" />
    {/* gloves */}
    <g>
      <circle cx="6" cy="16" r="8" fill="#f0ff8a" stroke="#0c2a1c" strokeWidth="1.5" />
      <circle cx="66" cy="16" r="8" fill="#f0ff8a" stroke="#0c2a1c" strokeWidth="1.5" />
      <path d="M2 16 h8 M62 16 h8" stroke="#0c2a1c" strokeWidth="1" opacity=".6" />
    </g>
    {/* head */}
    <circle cx="36" cy="22" r="9.5" fill="#f3c9a3" />
    <path d="M26.5 20 a9.5 9.5 0 0 1 19 0 Z" fill="#23304f" />
    <ellipse cx="36" cy="13.5" rx="9.5" ry="2.5" fill="#23304f" />
  </svg>
));

/* aiming reticle — the signature UI element */
const Zone: FC<{
  dir: Dir;
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  active: boolean;
  selected: boolean;
  hidden: boolean;
  onPick: () => void;
}> = ({ dir, x, y, w, h, accent, active, selected, hidden, onPick }) => {
  const col = selected ? accent : active ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.32)";
  const corner = (v: "t" | "b", hSide: "l" | "r"): CSSProperties =>
    ({
      position: "absolute",
      width: 11,
      height: 11,
      [v === "t" ? "top" : "bottom"]: 5,
      [hSide === "l" ? "left" : "right"]: 5,
      [`border${v === "t" ? "Top" : "Bottom"}`]: `2px solid ${col}`,
      [`border${hSide === "l" ? "Left" : "Right"}`]: `2px solid ${col}`,
      borderRadius:
        v === "t" ? (hSide === "l" ? "5px 0 0 0" : "0 5px 0 0") : hSide === "l" ? "0 0 0 5px" : "0 0 5px 0",
      transition: "border-color .2s ease",
      pointerEvents: "none",
    }) as CSSProperties;
  return (
    <button
      onClick={onPick}
      disabled={!active}
      className="pk-zone"
      aria-label={`Aim ${dir}`}
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        transform: "translate(-50%,-50%)",
        borderRadius: 13,
        border: "none",
        background: selected ? `${accent}22` : active ? "rgba(255,255,255,.04)" : "transparent",
        boxShadow: selected
          ? `0 0 24px ${accent},inset 0 0 18px ${accent}55`
          : active
            ? "inset 0 0 0 1px rgba(255,255,255,.10)"
            : "none",
        opacity: hidden ? 0 : 1,
        cursor: active ? "pointer" : "default",
        padding: 0,
        zIndex: 9,
        transition: "opacity .3s ease,box-shadow .2s ease,background .2s ease",
        animation: selected ? "pk-lock .4s ease" : undefined,
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            inset: "-22%",
            borderRadius: "50%",
            background: `radial-gradient(closest-side,${accent}26,transparent)`,
            animation: "pk-glow 1.8s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      )}
      <span style={corner("t", "l")} />
      <span style={corner("t", "r")} />
      <span style={corner("b", "l")} />
      <span style={corner("b", "r")} />
      <span style={{ position: "absolute", left: "50%", top: "50%", width: 16, height: 16, transform: "translate(-50%,-50%)" }}>
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1.5px ${selected ? "solid" : "dashed"} ${selected || active ? accent : "rgba(255,255,255,.45)"}`,
            animation: active && !selected ? "pk-rot 6s linear infinite" : undefined,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 4,
            height: 4,
            borderRadius: "50%",
            transform: "translate(-50%,-50%)",
            background: selected || active ? accent : "rgba(255,255,255,.7)",
            boxShadow: selected ? `0 0 8px ${accent}` : "none",
          }}
        />
      </span>
    </button>
  );
};

/* ball that flies along an arc (used for the live ball + ghost trail) */
const FlyBall: FC<{
  x: number;
  y: number;
  scale: number;
  arc: number;
  delay: number;
  opacity: number;
  reveal: boolean;
  spin: boolean;
  duration?: number;
  saved?: boolean;
}> = memo(
  ({ x, y, scale, arc, delay, opacity, reveal, spin, duration = TRAVEL_MS, saved = false }) => (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: "8.8%",
        aspectRatio: "1 / 1",
        transform: "translate(-50%,-50%)",
        opacity,
        zIndex: opacity === 1 ? 8 : 7,
        pointerEvents: "none",
        transition: `left ${duration}ms cubic-bezier(.24,.82,.22,1) ${delay}ms,top ${duration}ms cubic-bezier(.24,.82,.22,1) ${delay}ms`,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "88%",
          width: "88%",
          height: "18%",
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          background: "radial-gradient(closest-side,rgba(0,0,0,.42),transparent)",
          opacity: saved ? 0.55 : 0.35,
          filter: "blur(1px)",
        }}
      />
      <div
        style={
          {
            width: "100%",
            height: "100%",
            "--arc": `${arc}%`,
            animation: reveal ? `pk-arc ${duration}ms cubic-bezier(.35,.9,.45,1) ${delay}ms forwards` : undefined,
          } as CSSProperties
        }
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${scale})`,
            transition: `transform ${duration}ms cubic-bezier(.24,.82,.22,1) ${delay}ms`,
          }}
        >
          <div
            className={spin ? "pk-spinfx" : undefined}
            style={{
              width: "100%",
              height: "100%",
              filter: saved ? "drop-shadow(0 0 10px rgba(127,182,255,.35))" : undefined,
            }}
          >
            <Ball />
          </div>
        </div>
      </div>
    </div>
  ),
);

const Trophy: FC<{ size: number }> = memo(({ size }) => (
  <svg viewBox="0 0 64 80" width={size} height={(size * 80) / 64} style={{ display: "block", filter: "drop-shadow(0 8px 18px rgba(246,196,83,.35))" }}>
    <defs>
      <linearGradient id="pkgold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe7a0" />
        <stop offset="45%" stopColor="#f6c453" />
        <stop offset="100%" stopColor="#b9831f" />
      </linearGradient>
    </defs>
    <path d="M14 8 H50 V20 Q50 40 32 46 Q14 40 14 20 Z" fill="url(#pkgold)" stroke="#8a5e16" strokeWidth="1" />
    <path d="M14 12 Q3 12 4 22 Q5 30 16 30" fill="none" stroke="url(#pkgold)" strokeWidth="3.4" />
    <path d="M50 12 Q61 12 60 22 Q59 30 48 30" fill="none" stroke="url(#pkgold)" strokeWidth="3.4" />
    <rect x="29" y="46" width="6" height="11" fill="url(#pkgold)" />
    <path d="M21 57 H43 L47 67 H17 Z" fill="url(#pkgold)" stroke="#8a5e16" strokeWidth="1" />
    <rect x="15" y="67" width="34" height="7" rx="2" fill="#b9831f" />
    <path d="M24 12 Q26 28 32 38" stroke="#fff" strokeWidth="2" opacity=".5" fill="none" strokeLinecap="round" />
  </svg>
));

const Twinkles: FC = memo(() => {
  const dots = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        l: 6 + Math.random() * 88,
        t: 4 + Math.random() * 12,
        d: Math.random() * 3,
        s: 1.6 + Math.random() * 1.4,
      })),
    [],
  );
  return (
    <>
      {dots.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.l}%`,
            top: `${p.t}%`,
            width: 2.5,
            height: 2.5,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 0 5px 1px rgba(255,255,255,.8)",
            animation: `pk-twinkle ${p.s}s ease-in-out ${p.d}s infinite`,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
});

const Confetti: FC<{ n: number }> = memo(({ n }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: n }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.4 + Math.random() * 1.1,
        col: [C.gold, C.teal, C.rose, C.sky, "#ffffff"][Math.floor(Math.random() * 5)],
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 8,
      })),
    [n],
  );
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "-6%",
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.col,
            borderRadius: 2,
            opacity: 0.95,
            animation: `pk-confetti ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
});

/* --------------------------- timer ring -------------------------- */
const TimerRing: FC<{ active: boolean; runKey: number; onExpire: () => void }> = ({ active, runKey, onExpire }) => {
  const [left, setLeft] = useState(CHOOSE_MS / 1000);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    setLeft(CHOOSE_MS / 1000);
    if (!active) return;
    const start = performance.now();
    let raf = 0;
    let fired = false;
    const tick = (now: number) => {
      const rem = Math.max(0, CHOOSE_MS / 1000 - (now - start) / 1000);
      setLeft(rem);
      if (rem <= 0) {
        if (!fired) {
          fired = true;
          expire.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, runKey]);

  const r = 13;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / (CHOOSE_MS / 1000)));
  const danger = left <= 2;
  const stroke = danger ? C.rose : C.gold;
  return (
    <div style={{ position: "relative", width: 34, height: 34 }}>
      <svg viewBox="0 0 34 34" width="34" height="34" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: "stroke .2s linear", filter: `drop-shadow(0 0 4px ${stroke})` }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
          color: danger ? C.rose : "#fff",
        }}
      >
        {Math.ceil(left)}
      </span>
    </div>
  );
};

/* small score chip */
const Chip: FC<{ label: string; score: number; accent: string; flag: [string, string]; pulse: boolean; right?: boolean }> = ({
  label,
  score,
  accent,
  flag,
  pulse,
  right,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexDirection: right ? "row-reverse" : "row",
      padding: "5px 10px",
      borderRadius: 12,
      background: C.panel,
      border: `1px solid ${C.line}`,
      boxShadow: `inset 0 0 0 1px rgba(255,255,255,.02)`,
    }}
  >
    <span
      style={{
        width: 20,
        height: 14,
        borderRadius: 3,
        background: `linear-gradient(90deg,${flag[0]} 0 50%,${flag[1]} 50% 100%)`,
        boxShadow: "0 0 0 1px rgba(0,0,0,.3)",
        flexShrink: 0,
      }}
    />
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.65)" }}>{label}</span>
    <span
      key={score}
      style={{
        fontSize: 22,
        fontWeight: 900,
        lineHeight: 1,
        color: accent,
        minWidth: 16,
        textAlign: "center",
        animation: pulse ? "pk-pop .4s ease" : undefined,
        textShadow: `0 0 12px ${accent}66`,
      }}
    >
      {score}
    </span>
  </div>
);

/* tracker dots */
const Track: FC<{ res: Outcome[]; accent: string; align: "left" | "right" }> = ({ res, accent, align }) => {
  const slots = Math.max(ROUNDS, res.length);
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {Array.from({ length: slots }, (_, i) => {
        const o = res[i];
        const bg = o === "goal" ? accent : o === "save" ? "rgba(255,93,122,.85)" : "transparent";
        return (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: 99,
              background: bg,
              border: o ? "none" : "1.5px solid rgba(255,255,255,.22)",
              boxShadow: o === "goal" ? `0 0 6px ${accent}` : "none",
              transition: "background .25s ease",
            }}
          />
        );
      })}
    </div>
  );
};

/* ----------------------------- game ------------------------------ */
export const PenaltyPvpGame: FC = () => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [kickIndex, setKickIndex] = useState(0);
  const [g, setG] = useState<GameState>(INIT);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [selected, setSelected] = useState<Dir | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [timerKey, setTimerKey] = useState(0);
  const [fx, setFx] = useState(0);

  /* refs for async/stable callbacks */
  const phaseRef = useRef<Phase>("intro");
  const kickRef = useRef(0);
  const gRef = useRef(INIT);
  const botPick = useRef<Dir>("C");
  const selectedRef = useRef<Dir | null>(null);
  const locked = useRef(false);
  const pending = useRef<{ next: GameState; over: boolean; win: Side | null; nextIndex: number } | null>(null);
  const pShots = useRef<Dir[]>([]);
  const pSaves = useRef<Dir[]>([]);
  const timers = useRef<number[]>([]);

  const goPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const commitG = (n: GameState) => {
    gRef.current = n;
    setG(n);
  };
  const after = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const shooterAt = (idx: number): Side => (idx % 2 === 0 ? "player" : "bot");
  const playerIsShooter = shooterAt(kickIndex) === "player";
  const roundNo = Math.floor(kickIndex / 2) + 1;

  const evalEnd = (n: GameState): { over: boolean; win: Side | null; sudden: boolean } => {
    let sudden = n.sudden;
    const pRem = Math.max(0, ROUNDS - n.pKicks);
    const bRem = Math.max(0, ROUNDS - n.bKicks);
    if (!sudden) {
      if (n.pScore > n.bScore + bRem) return { over: true, win: "player", sudden };
      if (n.bScore > n.pScore + pRem) return { over: true, win: "bot", sudden };
      if (n.pKicks >= ROUNDS && n.bKicks >= ROUNDS) {
        if (n.pScore !== n.bScore) return { over: true, win: n.pScore > n.bScore ? "player" : "bot", sudden };
        return { over: false, win: null, sudden: true };
      }
      return { over: false, win: null, sudden: false };
    }
    if (n.pKicks === n.bKicks && n.pKicks > ROUNDS && n.pScore !== n.bScore)
      return { over: true, win: n.pScore > n.bScore ? "player" : "bot", sudden: true };
    return { over: false, win: null, sudden: true };
  };

  const startKick = useCallback((idx: number) => {
    clearTimers();
    locked.current = false;
    kickRef.current = idx;
    const shooter = shooterAt(idx);
    botPick.current = shooter === "player" ? botSave(pShots.current) : botShoot(pSaves.current);
    setKickIndex(idx);
    selectedRef.current = null;
    setSelected(null);
    setAnim(null);
    goPhase("choosing");
    setTimerKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterResult = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    commitG(p.next);
    setFx((f) => f + 1);
    goPhase("result");
    after(RESULT_MS, () => {
      if (p.over) {
        setWinner(p.win);
        goPhase("final");
      } else {
        startKick(p.nextIndex);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKick]);

  const lock = useCallback(
    (playerDir: Dir) => {
      if (phaseRef.current !== "choosing" || locked.current) return;
      locked.current = true;
      clearTimers();
      const idx = kickRef.current;
      const shooter = shooterAt(idx);
      const keeper: Side = shooter === "player" ? "bot" : "player";
      const bot = botPick.current;
      const shoot = shooter === "player" ? playerDir : bot;
      const save = keeper === "player" ? playerDir : bot;
      const outcome: Outcome = shoot === save ? "save" : "goal";

      if (shooter === "player") pShots.current.push(playerDir);
      else pSaves.current.push(playerDir);

      const cur = gRef.current;
      const next: GameState = { ...cur, pRes: [...cur.pRes], bRes: [...cur.bRes] };
      if (outcome === "goal") shooter === "player" ? next.pScore++ : next.bScore++;
      if (shooter === "player") {
        next.pKicks++;
        next.pRes.push(outcome);
      } else {
        next.bKicks++;
        next.bRes.push(outcome);
      }
      const end = evalEnd(next);
      next.sudden = end.sudden;
      pending.current = { next, over: end.over, win: end.win, nextIndex: idx + 1 };

      selectedRef.current = playerDir;
      setSelected(playerDir);
      setAnim({ shoot, save, outcome, shooter, keeper });
      goPhase("reveal");
      after(TRAVEL_MS, enterResult);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [enterResult],
  );

  const lockRef = useRef(lock);
  lockRef.current = lock;
  const onExpire = useCallback(() => {
    const role = shooterAt(kickRef.current) === "player" ? "shoot" : "save";
    lockRef.current(selectedRef.current ?? autoPick(role));
  }, []);

  const startGame = () => {
    clearTimers();
    pShots.current = [];
    pSaves.current = [];
    setWinner(null);
    commitG(INIT);
    startKick(0);
  };

  const onZone = (d: Dir) => {
    if (phaseRef.current !== "choosing" || locked.current) return;
    selectedRef.current = d;
    setSelected(d);
  };

  /* ----- derived render positions ----- */
  const revealing = phase === "reveal" || phase === "result";
  const rebound = phase === "result" && anim?.outcome === "save" ? REBOUND[anim.shoot] : null;
  const ballPos = revealing && anim ? rebound ?? ZONE[anim.shoot] : { x: 50, y: 82 };
  const ballScale = revealing && anim ? rebound?.scale ?? 0.38 : 1;
  const ballArc = revealing && anim ? rebound?.arc ?? ARC[anim.shoot] : 0;
  const ballDuration = rebound ? REBOUND_MS : TRAVEL_MS;
  const keeperPos = revealing && anim ? KEEPER[anim.save] : REST_KEEPER;

  const resultLabel = anim?.outcome === "goal" ? "GOAL!" : "SAVED!";
  const resultColor = anim?.outcome === "goal" ? C.gold : C.sky;
  const resultSub =
    anim == null
      ? ""
      : anim.shooter === "player"
        ? anim.outcome === "goal"
          ? "Clean finish"
          : "Deflected away"
        : anim.outcome === "save"
          ? "Strong hands"
          : "Out of reach";

  const celebrate = phase === "result" && anim?.outcome === "goal" && anim.shooter === "player";

  return (
    <div className="pk-root">
      <style>{STYLES}</style>

      {/* ===================== TOP BAR ===================== */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "10px 12px 6px",
          gap: 8,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <Chip label="YOU" score={g.pScore} accent={C.teal} flag={["#34e2b0", "#1f8f6c"]} pulse={fx > 0 && anim?.shooter === "player"} />
          <Track res={g.pRes} accent={C.teal} align="left" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 70, paddingTop: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: g.sudden ? C.rose : "rgba(255,255,255,.6)" }}>
            {g.sudden ? "SUDDEN DEATH" : `ROUND ${Math.min(roundNo, ROUNDS)}/${ROUNDS}`}
          </span>
          {phase === "choosing" ? (
            <TimerRing active runKey={timerKey} onExpire={onExpire} />
          ) : (
            <div style={{ display: "flex", gap: 3, height: 34, alignItems: "center" }}>
              {HOSTS.map((h) => (
                <span
                  key={h.code}
                  title={h.code}
                  style={{ width: 16, height: 11, borderRadius: 2, background: h.grad, boxShadow: "0 0 0 1px rgba(0,0,0,.35)" }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <Chip label="CPU" score={g.bScore} accent={C.rose} flag={["#ff5d7a", "#a72f48"]} pulse={fx > 0 && anim?.shooter === "bot"} right />
          <Track res={g.bRes} accent={C.rose} align="right" />
        </div>
      </div>

      {/* ===================== PLAY AREA ===================== */}
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}>
        <div className={fx > 0 && revealing ? "pk-shakefx" : undefined} style={{ position: "absolute", inset: 0 }}>
          {/* upper stand wash + floodlight glows */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(46% 30% at 14% 2%,rgba(190,210,255,.20),transparent 60%)," +
                "radial-gradient(46% 30% at 86% 2%,rgba(190,210,255,.20),transparent 60%)," +
                "radial-gradient(120% 55% at 50% 4%,rgba(120,160,255,.12),transparent 70%)",
            }}
          />
          {/* floodlight banks */}
          {[12, 88].map((lx) => (
            <div key={lx} style={{ position: "absolute", left: `${lx}%`, top: "1%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "#fffbe6",
                    boxShadow: "0 0 6px 2px rgba(255,250,210,.7)",
                    animation: `pk-flood ${2.4 + i * 0.2}s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
            </div>
          ))}

          {/* crowd band (two tiers) */}
          <div
            style={{
              position: "absolute",
              top: "3%",
              left: 0,
              right: 0,
              height: "18%",
              background:
                "repeating-radial-gradient(circle at center,rgba(255,255,255,.06) 0 1px,transparent 1px 5px)," +
                "linear-gradient(180deg,#12203f,#0c1730)",
              opacity: 0.6,
              maskImage: "linear-gradient(to bottom,black 60%,transparent)",
              WebkitMaskImage: "linear-gradient(to bottom,black 60%,transparent)",
            }}
          />
          {/* camera-flash twinkles in the crowd */}
          <Twinkles />

          {/* tri-host bunting */}
          <div style={{ position: "absolute", top: "1.6%", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 0 }}>
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: `13px solid ${["#ff4d4d", "#1f9d57", "#3b6bff", "#fff"][i % 4]}`,
                  opacity: 0.85,
                  filter: "drop-shadow(0 2px 2px rgba(0,0,0,.3))",
                }}
              />
            ))}
          </div>

          {/* LED perimeter board — scrolling World Cup ’26 ticker */}
          <div
            style={{
              position: "absolute",
              left: "14%",
              right: "14%",
              top: "8.2%",
              height: "3.4%",
              borderRadius: 3,
              overflow: "hidden",
              background: "linear-gradient(180deg,#0a1018,#05080e)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08),0 2px 6px rgba(0,0,0,.5)",
            }}
          >
            <div style={{ display: "flex", width: "300%", height: "100%", animation: "pk-marquee 24s linear infinite" }}>
              {[0, 1, 2].map((k) => (
                <div
                  key={k}
                  style={{
                    width: "33.333%",
                    display: "flex",
                    alignItems: "center",
                    whiteSpace: "nowrap",
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: 2,
                    color: C.gold,
                    textShadow: `0 0 6px ${C.gold}88`,
                  }}
                >
                  {MARQUEE.repeat(2)}
                </div>
              ))}
            </div>
          </div>

          {/* pitch base */}
          <div style={{ position: "absolute", top: "42%", left: 0, right: 0, bottom: 0, background: "linear-gradient(180deg,#1fa65a 0%,#15743d 54%,#0f5d32 100%)" }} />
          {/* perspective mowed stripes */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {Array.from({ length: 8 }, (_, i) => {
              const tx0 = 26 + (48 * i) / 8;
              const tx1 = 26 + (48 * (i + 1)) / 8;
              const bx0 = -6 + (112 * i) / 8;
              const bx1 = -6 + (112 * (i + 1)) / 8;
              return (
                <polygon
                  key={i}
                  points={`${tx0},42 ${tx1},42 ${bx1},100 ${bx0},100`}
                  fill={i % 2 === 0 ? "#0e5a31" : "#1b8147"}
                />
              );
            })}
            {/* top-down key light + far shading */}
            <rect x="0" y="42" width="100" height="58" fill="url(#pklight)" />
          </svg>
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <linearGradient id="pklight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,0,0,.45)" />
                <stop offset="30%" stopColor="rgba(255,255,255,.10)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.04)" />
              </linearGradient>
            </defs>
          </svg>

          {/* pitch markings (perspective) */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <g fill="none" stroke="rgba(255,255,255,.38)" strokeWidth="1.15" vectorEffect="non-scaling-stroke">
              <line x1="8" y1="42" x2="92" y2="42" />
              <path d="M38 42 L30 60 L70 60 L62 42" />
              <path d="M30 42 L10 90 L90 90 L70 42" />
              <path d="M40 60 Q50 67 60 60" />
              <path d="M42 82 Q50 74 58 82" />
              <line x1="50" y1="42" x2="50" y2="100" opacity=".14" />
            </g>
            <circle cx="50" cy="75" r="1.25" fill="rgba(255,255,255,.9)" stroke="none" />
          </svg>

          {/* GOAL frame */}
          <div style={{ position: "absolute", left: "14%", top: "10%", width: "72%", height: "34%" }}>
            {/* goal-mouth depth */}
            <div style={{ position: "absolute", inset: "6% 4.5% 0 4.5%", background: "linear-gradient(180deg,rgba(3,7,15,.92),rgba(8,15,28,.64) 76%,rgba(8,15,28,.28))", borderRadius: "5px 5px 0 0" }} />
            {/* net mesh */}
            <div
              style={{
                position: "absolute",
                inset: "6% 4.5% 0 4.5%",
                background:
                  "repeating-linear-gradient(38deg,rgba(255,255,255,.23) 0 1px,transparent 1px 9px)," +
                  "repeating-linear-gradient(-38deg,rgba(255,255,255,.23) 0 1px,transparent 1px 9px)",
                borderRadius: "3px 3px 0 0",
                maskImage: "linear-gradient(180deg,black 70%,transparent)",
                WebkitMaskImage: "linear-gradient(180deg,black 70%,transparent)",
              }}
            />
            {/* side netting hint */}
            <div style={{ position: "absolute", left: "4.5%", top: "6%", width: "6%", height: "94%", background: "repeating-linear-gradient(75deg,rgba(255,255,255,.14) 0 1px,transparent 1px 7px)" }} />
            <div style={{ position: "absolute", right: "4.5%", top: "6%", width: "6%", height: "94%", background: "repeating-linear-gradient(-75deg,rgba(255,255,255,.14) 0 1px,transparent 1px 7px)" }} />
            {/* posts + crossbar (glossy) */}
            <div style={{ position: "absolute", left: "4.5%", top: "6%", width: "3.2%", height: "94%", background: "linear-gradient(90deg,#e9eefc,#fff,#aab4cc)", borderRadius: 2, boxShadow: "0 0 7px rgba(255,255,255,.5)" }} />
            <div style={{ position: "absolute", right: "4.5%", top: "6%", width: "3.2%", height: "94%", background: "linear-gradient(90deg,#aab4cc,#fff,#e9eefc)", borderRadius: 2, boxShadow: "0 0 7px rgba(255,255,255,.5)" }} />
            <div style={{ position: "absolute", left: "4.5%", right: "4.5%", top: "6%", height: "7.5%", background: "linear-gradient(180deg,#fff,#c2cadd)", borderRadius: 2, boxShadow: "0 0 7px rgba(255,255,255,.5)" }} />
          </div>

          {/* goal-line shadow on grass */}
          <div style={{ position: "absolute", left: "50%", top: "44%", width: "74%", height: "3.4%", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side,rgba(0,0,0,.48),transparent)" }} />

          {/* net bulge on a goal */}
          {revealing && anim && anim.outcome === "goal" && (
            <span
              key={`bulge-${fx}`}
              style={{
                position: "absolute",
                left: `${ZONE[anim.shoot].x}%`,
                top: `${ZONE[anim.shoot].y}%`,
                width: "20%",
                height: "20%",
                borderRadius: "50%",
                background: `radial-gradient(closest-side,${C.gold}66,transparent 70%)`,
                transform: "translate(-50%,-50%)",
                animation: phase === "result" ? "pk-bulge .6s ease-out forwards" : undefined,
                opacity: 0,
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
          )}

          {/* impact ripple */}
          {revealing && anim && (
            <span
              key={`rip-${fx}`}
              style={{
                position: "absolute",
                left: `${ZONE[anim.shoot].x}%`,
                top: `${ZONE[anim.shoot].y}%`,
                width: "16%",
                height: "16%",
                borderRadius: "50%",
                border: `3px solid ${anim.outcome === "goal" ? C.gold : "#fff"}`,
                transform: "translate(-50%,-50%)",
                animation: phase === "result" ? "pk-ripple .55s ease-out forwards" : undefined,
                opacity: phase === "result" ? 1 : 0,
                pointerEvents: "none",
              }}
            />
          )}

          {phase === "result" && anim && anim.outcome === "save" && (
            <span
              key={`spark-${fx}`}
              style={{
                position: "absolute",
                left: `${ZONE[anim.shoot].x}%`,
                top: `${ZONE[anim.shoot].y}%`,
                width: "13%",
                height: "13%",
                borderRadius: "50%",
                background: `radial-gradient(closest-side,#ffffff,${C.sky}88,transparent 72%)`,
                transform: "translate(-50%,-50%)",
                animation: "pk-saveSpark .46s ease-out forwards",
                pointerEvents: "none",
                zIndex: 11,
              }}
            />
          )}

          {/* ball + keeper group (remounts per kick for clean reset) */}
          <div key={`kick-${kickIndex}`} style={{ position: "absolute", inset: 0 }}>
            {/* keeper shadow */}
            <div
              style={{
                position: "absolute",
                left: `${keeperPos.x}%`,
                top: `${keeperPos.y + 1.2}%`,
                width: "16%",
                height: "2.7%",
                transform: "translate(-50%,-50%)",
                background: "radial-gradient(closest-side,rgba(0,0,0,.5),transparent)",
                transition: `left ${TRAVEL_MS - 160}ms cubic-bezier(.2,.7,.2,1),top ${TRAVEL_MS - 160}ms cubic-bezier(.2,.7,.2,1)`,
              }}
            />
            {/* keeper */}
            <div
              style={{
                position: "absolute",
                left: `${keeperPos.x}%`,
                top: `${keeperPos.y}%`,
                width: "15%",
                transform: "translate(-50%,-100%)",
                transition: `left ${TRAVEL_MS - 160}ms cubic-bezier(.2,.7,.2,1),top ${TRAVEL_MS - 160}ms cubic-bezier(.2,.7,.2,1)`,
                zIndex: 6,
              }}
            >
              {/* rotate layer */}
              <div
                style={{
                  transform: `rotate(${keeperPos.tilt}deg)`,
                  transformOrigin: "50% 74%",
                  transition: `transform ${TRAVEL_MS - 160}ms cubic-bezier(.2,.7,.2,1)`,
                }}
              >
                {/* dive / breathe layer */}
                <div
                  style={{
                    transformOrigin: "50% 80%",
                    animation: revealing ? `pk-dive ${TRAVEL_MS - 120}ms ease-out` : "pk-breathe 2.6s ease-in-out infinite",
                  }}
                >
                  <Keeper accent={anim?.keeper === "player" || (!anim && !playerIsShooter) ? C.teal : "#2bd4a0"} />
                </div>
              </div>
              {!revealing && !playerIsShooter && (
                <span
                  style={{
                    position: "absolute",
                    top: -16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: 1,
                    color: C.teal,
                    textShadow: `0 0 8px ${C.teal}`,
                  }}
                >
                  YOU
                </span>
              )}
            </div>

            {/* ghost trail (follows the arc, staggered) */}
            {revealing && anim && (
              <>
                <FlyBall x={ballPos.x} y={ballPos.y} scale={ballScale} arc={ballArc} delay={130} opacity={0.1} reveal spin={false} duration={ballDuration} saved={anim.outcome === "save"} />
                <FlyBall x={ballPos.x} y={ballPos.y} scale={ballScale} arc={ballArc} delay={70} opacity={0.18} reveal spin={false} duration={ballDuration} saved={anim.outcome === "save"} />
              </>
            )}
            {/* live ball */}
            <FlyBall x={ballPos.x} y={ballPos.y} scale={ballScale} arc={ballArc} delay={0} opacity={1} reveal={revealing} spin={phase === "reveal" || anim?.outcome === "save"} duration={ballDuration} saved={anim?.outcome === "save"} />
          </div>

          {/* selectable target reticles */}
          {DIRS.map((d) => {
            const z = ZONE[d];
            return (
              <Zone
                key={d}
                dir={d}
                x={z.x}
                y={z.y}
                w={d === "C" ? 13 : 15}
                h={d === "C" ? 8.5 : 9}
                accent={playerIsShooter ? C.teal : C.gold}
                active={phase === "choosing"}
                selected={selected === d}
                hidden={revealing}
                onPick={() => onZone(d)}
              />
            );
          })}

          {/* role banner */}
          {(phase === "choosing" || phase === "reveal") && (
            <div
              key={`role-${kickIndex}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "47%",
                transform: "translateX(-50%)",
                animation: "pk-rise .35s ease",
                pointerEvents: "none",
                textAlign: "center",
                zIndex: 12,
              }}
            >
              <div
                style={{
                  padding: "5px 16px",
                  borderRadius: 999,
                  background: "rgba(8,12,24,.55)",
                  backdropFilter: "blur(4px)",
                  border: `1px solid ${playerIsShooter ? C.teal + "66" : C.gold + "66"}`,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: 2,
                  color: playerIsShooter ? C.teal : C.gold,
                  textShadow: `0 0 12px ${playerIsShooter ? C.teal : C.gold}66`,
                }}
              >
                {selected ? "PICKED • WAIT" : playerIsShooter ? "YOU SHOOT" : "YOU DEFEND"}
              </div>
            </div>
          )}

          {/* result flash + text */}
          {phase === "result" && anim && (
            <>
              <div
                key={`flash-${fx}`}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(60% 50% at 50% 28%,${resultColor}55,transparent 70%)`,
                  animation: "pk-flash .7s ease forwards",
                  pointerEvents: "none",
                  zIndex: 13,
                }}
              />
              <div
                key={`res-${fx}`}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "55%",
                  transform: "translate(-50%,-50%)",
                  animation: "pk-resultIn .5s cubic-bezier(.2,.9,.3,1.2) forwards",
                  textAlign: "center",
                  pointerEvents: "none",
                  zIndex: 14,
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(30px,9vw,52px)",
                    fontWeight: 900,
                    letterSpacing: 1,
                    color: resultColor,
                    textShadow: `0 0 24px ${resultColor},0 2px 6px rgba(0,0,0,.5)`,
                    lineHeight: 1,
                  }}
                >
                  {resultLabel}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,.8)" }}>
                  {resultSub}
                </div>
              </div>
            </>
          )}

          {celebrate && <Confetti n={20} />}

          {/* vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              boxShadow: "inset 0 0 90px 20px rgba(0,0,0,.45)",
            }}
          />
        </div>

        {/* ===================== INTRO OVERLAY ===================== */}
        {phase === "intro" && (
          <Overlay>
            <div style={{ animation: "pk-float 3s ease-in-out infinite" }}>
              <Trophy size={86} />
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 4,
                color: C.gold,
                textShadow: `0 0 14px ${C.gold}66`,
              }}
            >
              WORLD CUP ’26
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              {HOSTS.map((h) => (
                <span key={h.code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 26, height: 17, borderRadius: 3, background: h.grad, boxShadow: "0 0 0 1px rgba(0,0,0,.35)" }} />
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: "rgba(255,255,255,.55)" }}>{h.code}</span>
                </span>
              ))}
            </div>
            <h1
              style={{
                margin: "10px 0 2px",
                fontSize: "clamp(26px,8vw,40px)",
                fontWeight: 900,
                letterSpacing: 1,
                lineHeight: 1,
                background: `linear-gradient(180deg,#fff,#c9d4ea)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 4px 16px rgba(0,0,0,.4)",
              }}
            >
              PENALTY SHOOTOUT
            </h1>
            <p style={{ margin: "8px 0 20px", fontSize: 12, color: "rgba(255,255,255,.6)", letterSpacing: 1 }}>
              48 nations · 3 hosts · best of {ROUNDS}
            </p>
            <PrimaryButton onClick={startGame}>KICK OFF</PrimaryButton>
          </Overlay>
        )}

        {/* ===================== FINAL OVERLAY ===================== */}
        {phase === "final" && (
          <Overlay>
            {winner === "player" && <Confetti n={28} />}
            <div style={{ animation: "pk-float 3s ease-in-out infinite", opacity: winner === "player" ? 1 : 0.4 }}>
              <Trophy size={92} />
            </div>
            <div style={{ marginTop: 12, fontSize: 10, fontWeight: 800, letterSpacing: 4, color: "rgba(255,255,255,.5)" }}>
              WORLD CUP ’26 FINAL
            </div>
            <h1
              style={{
                margin: "6px 0 2px",
                fontSize: "clamp(30px,10vw,52px)",
                fontWeight: 900,
                letterSpacing: 2,
                color: winner === "player" ? C.gold : C.rose,
                textShadow: `0 0 28px ${winner === "player" ? C.gold : C.rose}66`,
                lineHeight: 1,
              }}
            >
              {winner === "player" ? "VICTORY" : "DEFEAT"}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "10px 0 4px" }}>
              <span style={{ fontSize: 40, fontWeight: 900, color: C.teal, textShadow: `0 0 14px ${C.teal}55` }}>{g.pScore}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,.4)" }}>–</span>
              <span style={{ fontSize: 40, fontWeight: 900, color: C.rose, textShadow: `0 0 14px ${C.rose}55` }}>{g.bScore}</span>
            </div>
            <p style={{ margin: "2px 0 20px", fontSize: 12, color: "rgba(255,255,255,.55)", letterSpacing: 1 }}>
              {winner === "player" ? "You lifted the cup" : "So close — go again"}
            </p>
            <PrimaryButton onClick={startGame}>PLAY AGAIN</PrimaryButton>
          </Overlay>
        )}
      </div>

    </div>
  );
};

/* shared overlay shell */
const Overlay: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 40,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: 20,
      background: "radial-gradient(120% 90% at 50% 40%,rgba(6,10,20,.78),rgba(6,10,20,.92))",
      backdropFilter: "blur(3px)",
    }}
  >
    {children}
  </div>
);

const PrimaryButton: FC<{ onClick: () => void; children: ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="pk-btn"
    style={{
      position: "relative",
      overflow: "hidden",
      padding: "13px 34px",
      borderRadius: 999,
      border: "none",
      fontSize: 15,
      fontWeight: 900,
      letterSpacing: 2,
      color: "#1a1300",
      background: `linear-gradient(180deg,${C.goldHi},${C.gold})`,
      boxShadow: `0 8px 24px ${C.gold}55,0 0 0 1px rgba(255,255,255,.3) inset`,
      cursor: "pointer",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "40%",
        background: "linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)",
        animation: "pk-sweep 2.4s ease-in-out infinite",
      }}
    />
    <span style={{ position: "relative" }}>{children}</span>
  </button>
);

export default PenaltyPvpGame;
