/* ============================================================================
 *  RaceGame.tsx — top-down neon drift racer (Telegram Mini App edition)
 *  ---------------------------------------------------------------------------
 *  • Light arcade physics: auto-throttle, joystick steers, sharp turns slide
 *    into a controlled drift, releasing the stick stabilizes the car.
 *  • Fits the visible Mini App viewport: 100dvh - topOffset, ResizeObserver,
 *    safe-area insets, no internal scrolling, touchAction: none.
 *  • Visuals match the app shell: #050610 background, glass HUD cards,
 *    neon #52FFE5 / gold #F2C766 / purple #9D7CFF accents.
 *  • Network-ready (1v1 ghost): NetSnapshot, onSnapshot (~20 Hz),
 *    pushRemoteSnapshot + interpolation buffer, reset(). Same public API.
 * ========================================================================== */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

/* ================================ TYPES ================================== */

type Vec = { x: number; y: number };
type Surface = 'asphalt' | 'edge' | 'off';
type ParticleKind = 'smoke' | 'spark' | 'dust';

type CarState = {
  x: number;
  y: number;
  angle: number;      // heading, rad
  vx: number;         // world velocity, px/s
  vy: number;
  steer: number;      // smoothed steering -1..1
  driftPower: number; // 0..1, for FX + net snapshot
  progress: number;   // 0..1 along the lap
  lap: number;
  armed: boolean;     // anti-cheat half-lap flag for lap counting
};

type InputState = {
  throttle: number; // 0..1
  brake: number;    // 0..1
  steer: number;    // -1..1
  drift: boolean;   // handbrake
};

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; kind: ParticleKind;
};
type Skid = { x1: number; y1: number; x2: number; y2: number; life: number };
type Popup = { x: number; y: number; life: number; text: string; big: boolean };
type SidePost = { x: number; y: number; hue: 'cyan' | 'purple' };

/* Snapshot that travels over the WebSocket — keep it tiny. */
export type NetSnapshot = {
  t: number;     // sender clock, ms
  x: number;
  y: number;
  angle: number;
  drift: number; // 0..1 so the remote ghost smokes too
  lap: number;
};

export interface DriftRaceHandle {
  /** Feed an opponent snapshot received from the network. */
  pushRemoteSnapshot: (snap: NetSnapshot) => void;
  /** Restart the race. */
  reset: () => void;
}

interface DriftRaceProps {
  /** Called ~20×/s with the local snapshot — pipe it into WebSocket.send(). */
  onSnapshot?: (snap: NetSnapshot) => void;
  /** Replay your own best lap as a ghost when no opponent is connected. */
  selfGhost?: boolean;
  /** Pixels occupied above the game (app header). Height = 100dvh - this. */
  topOffset?: number;
}

/* =============================== PALETTE ================================= */

const C = {
  bg: '#050610',
  asphalt: '#12141f',
  asphaltCore: '#161a28',
  neon: '#52FFE5',
  neonDim: 'rgba(82,255,229,0.55)',
  neonGlow: 'rgba(82,255,229,0.07)',
  gold: '#F2C766',
  purple: '#9D7CFF',
} as const;

/* =============================== TUNING ================================== */

const STEP = 1 / 60;
const TOTAL_LAPS = 5;

const ROAD_HALF = 82;                 // half asphalt width
const EDGE = 8;                       // neon rim band
const RUNOFF = 64;                    // dark runoff, slow + slippery
const WALL = ROAD_HALF + EDGE + RUNOFF;

const TUNE = {
  enginePower: 1500,   // px/s² — quick to top speed
  maxSpeed: 430,
  brakePower: 1500,
  rollResist: 1.0,
  airDrag: 0.0011,

  turnRate: 2.9,       // rad/s base steering
  steerLerp: 14,       // stick → wheel responsiveness
  driftYaw: 1.7,       // extra rotation while sliding

  // Lateral velocity retained per 1/60 frame:
  //   low = grippy & precise, high = slidey.
  gripBase: 0.72,      // normal driving — car goes where you point it
  gripDrift: 0.905,    // sliding — long, readable drift
  gripSpeedLoosen: 0.05,

  driftSpeedDrop: 0.5, // fraction/s of forward speed bled while drifting
  alignRate: 3.2,      // how fast the nose re-aligns to velocity on release
  driftEnterSteer: 0.6,  // |steer| above this at speed → light drift
  driftEnterSpeed: 0.5,  // fraction of maxSpeed
} as const;

const SURFACE: Record<Surface, { roll: number; topMul: number; gripAdd: number }> = {
  asphalt: { roll: 1.0, topMul: 1.0, gripAdd: 0 },
  edge:    { roll: 1.3, topMul: 0.95, gripAdd: 0.04 },
  off:     { roll: 3.4, topMul: 0.55, gripAdd: 0.08 },
};

/* ================================ MATH =================================== */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
}

/* ================================ TRACK ================================== */
/* Closed loop of control nodes → Catmull-Rom → dense centerline polyline.
   Collision / surface / progress = distance to nearest segment.            */

const NODES: Vec[] = [
  { x: -1300, y: -240 },
  { x: -1040, y: -900 },
  { x: -280, y: -1150 },
  { x: 500, y: -1060 },
  { x: 1190, y: -1220 },
  { x: 1690, y: -580 },
  { x: 1470, y: 200 },
  { x: 1780, y: 780 },
  { x: 1220, y: 1240 },
  { x: 380, y: 1120 },
  { x: -200, y: 1350 },
  { x: -860, y: 1120 },
  { x: -1400, y: 650 },
];

type CenterPt = Vec & { tx: number; ty: number; dist: number };

function buildCenterline(): { pts: CenterPt[]; length: number } {
  const raw: Vec[] = [];
  const N = NODES.length;
  const SEG = 22;
  for (let i = 0; i < N; i += 1) {
    const p0 = NODES[(i - 1 + N) % N];
    const p1 = NODES[i];
    const p2 = NODES[(i + 1) % N];
    const p3 = NODES[(i + 2) % N];
    for (let j = 0; j < SEG; j += 1) {
      const t = j / SEG;
      const t2 = t * t;
      const t3 = t2 * t;
      raw.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  const pts: CenterPt[] = [];
  let length = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    pts.push({ x: a.x, y: a.y, tx: dx / len, ty: dy / len, dist: length });
    length += len;
  }
  return { pts, length };
}

type Hit = { d: number; nx: number; ny: number; progress: number; surface: Surface };

function queryTrack(center: CenterPt[], total: number, x: number, y: number): Hit {
  let best: Hit = { d: Infinity, nx: 1, ny: 0, progress: 0, surface: 'off' };
  for (let i = 0; i < center.length; i += 1) {
    const a = center[i];
    const b = center[(i + 1) % center.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = Math.hypot(x - cx, y - cy);
    if (d < best.d) {
      const inv = d || 1;
      best = {
        d,
        nx: (x - cx) / inv,
        ny: (y - cy) / inv,
        progress: (a.dist + Math.hypot(dx, dy) * t) / total,
        surface: 'off',
      };
    }
  }
  if (best.d <= ROAD_HALF) best.surface = 'asphalt';
  else if (best.d <= ROAD_HALF + EDGE) best.surface = 'edge';
  return best;
}

/* Tiny ambient decor: a few neon side posts. Nothing else — the night is the décor. */
function buildPosts(center: CenterPt[]): SidePost[] {
  const posts: SidePost[] = [];
  const rnd = seeded(42);
  for (let i = 0; i < center.length; i += 14) {
    const p = center[i];
    const side = (i / 14) % 2 === 0 ? 1 : -1;
    const off = ROAD_HALF + EDGE + 22;
    posts.push({
      x: p.x - p.ty * off * side,
      y: p.y + p.tx * off * side,
      hue: rnd() > 0.6 ? 'purple' : 'cyan',
    });
  }
  return posts;
}

/* ================================ PHYSICS ================================ */
/* Fixed 1/60 step. Arcade rules:
   1. Auto-throttle: once started, the car drives itself; the stick steers.
   2. Sharp steering at speed → light drift (grip loosens, slight speed bleed).
   3. Handbrake (stick pulled down / Space) → big drift.
   4. Stick released → nose re-aligns to velocity, grip snaps back, car settles.
   5. Lateral velocity is hard-capped → no soap, no spin-outs.               */

type StepResult = { speed: number; slip: number; surface: Surface; crossedFinish: boolean; hardHit: boolean };

function stepCar(car: CarState, input: InputState, center: CenterPt[], total: number): StepResult {
  // 1) smooth the wheel toward the stick
  car.steer = lerp(car.steer, clamp(input.steer, -1, 1), clamp(TUNE.steerLerp * STEP, 0, 1));

  // 2) split velocity into forward / lateral
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;

  const here = queryTrack(center, total, car.x, car.y);
  const surf = SURFACE[here.surface];
  const speedPre = Math.hypot(car.vx, car.vy);
  const speed01 = clamp(speedPre / TUNE.maxSpeed, 0, 1);

  // 3) throttle / brake (no reverse)
  forward += input.throttle * TUNE.enginePower * STEP;
  if (input.brake > 0) forward -= input.brake * TUNE.brakePower * STEP;
  forward = clamp(forward, 0, TUNE.maxSpeed * surf.topMul);

  // 4) friction
  forward -= forward * TUNE.rollResist * surf.roll * STEP;
  forward -= forward * Math.abs(forward) * TUNE.airDrag * STEP;

  // 5) drifting? (handbrake, or hard steering at speed)
  const hardTurn = Math.abs(car.steer) > TUNE.driftEnterSteer && speed01 > TUNE.driftEnterSpeed;
  const drifting = (input.drift && forward > 80) || hardTurn;

  // 6) turn the nose — better authority at speed
  const authority = 0.3 + 0.7 * clamp(forward / 180, 0, 1);
  let dAngle = car.steer * TUNE.turnRate * authority * STEP;
  if (drifting) dAngle += car.steer * TUNE.driftYaw * speed01 * STEP;
  car.angle += dAngle;

  // 7) auto-stabilize: stick released → nose drifts back to the velocity vector
  if (Math.abs(input.steer) < 0.12 && !input.drift && forward > 40) {
    const moveA = Math.atan2(car.vy, car.vx);
    car.angle += angleDiff(moveA, car.angle) * clamp(TUNE.alignRate * STEP, 0, 1);
  }

  // 8) GRIP — the heart of the feel: how much lateral velocity survives
  let retain: number = drifting ? TUNE.gripDrift : TUNE.gripBase;
  retain += speed01 * TUNE.gripSpeedLoosen + surf.gripAdd;
  retain = clamp(retain, 0, 0.97);
  lateral *= Math.pow(retain, STEP * 60);

  // anti-spin clamp: the side can never overpower the forward motion
  const latCap = Math.max(50, forward * 0.85);
  lateral = clamp(lateral, -latCap, latCap);

  // drifting bleeds a bit of speed — feels right, rewards clean lines
  if (drifting) forward -= forward * TUNE.driftSpeedDrop * STEP;

  // 9) recompose + integrate
  const c2 = Math.cos(car.angle);
  const s2 = Math.sin(car.angle);
  car.vx = c2 * forward - s2 * lateral;
  car.vy = s2 * forward + c2 * lateral;

  let nx = car.x + car.vx * STEP;
  let ny = car.y + car.vy * STEP;

  // 10) wall: push back, kill the normal component, soft bounce
  let hardHit = false;
  const next = queryTrack(center, total, nx, ny);
  if (next.d > WALL) {
    const pen = next.d - WALL;
    nx -= next.nx * pen;
    ny -= next.ny * pen;
    const vn = car.vx * next.nx + car.vy * next.ny;
    if (vn > 0) {
      car.vx -= next.nx * vn * 1.25;
      car.vy -= next.ny * vn * 1.25;
    }
    car.vx *= 0.78;
    car.vy *= 0.78;
    if (speedPre > 170) hardHit = true;
  }
  car.x = nx;
  car.y = ny;

  // 11) slip for FX/score
  const speed = Math.hypot(car.vx, car.vy);
  const moveAngle = Math.atan2(car.vy, car.vx);
  const slip = forward > 60 ? Math.abs(angleDiff(moveAngle, car.angle)) : 0;
  car.driftPower = lerp(car.driftPower, clamp(slip / 0.6, 0, 1) * smooth(70, 180, speed), 0.2);

  // 12) lap counting: arm mid-track, count on start-line crossing
  let crossedFinish = false;
  if (car.progress > 0.45 && car.progress < 0.75) car.armed = true;
  const prev = car.progress;
  car.progress = here.progress;
  if (car.armed && prev > 0.9 && car.progress < 0.1) {
    car.armed = false;
    car.lap = Math.min(car.lap + 1, TOTAL_LAPS);
    crossedFinish = true;
  }

  return { speed, slip, surface: here.surface, crossedFinish, hardHit };
}

/* =============================== PARTICLES =============================== */

function spawn(list: Particle[], x: number, y: number, kind: ParticleKind, n: number, angle: number, power: number) {
  if (list.length > 140) list.splice(0, list.length - 120); // hard cap — phones
  for (let i = 0; i < n; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.6;
    const sp = (18 + Math.random() * 90) * power;
    const max = kind === 'spark' ? 0.2 + Math.random() * 0.15 : 0.45 + Math.random() * 0.5;
    list.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      size: 2 + Math.random() * (kind === 'smoke' ? 7 : 3),
      kind,
    });
  }
}

/* ================================ RENDER ================================= */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function strokeLoop(ctx: CanvasRenderingContext2D, center: CenterPt[], width: number, color: string, dash?: number[]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  center.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

/* Background: flat app color + a faint blueprint grid. The night IS the design. */
function drawGround(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, zoom: number) {
  const halfW = w / zoom / 2 + 200;
  const halfH = h / zoom / 2 + 200;
  ctx.fillStyle = C.bg;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const step = 180;
  ctx.strokeStyle = 'rgba(157,124,255,0.045)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let x = Math.floor((cx - halfW) / step) * step; x < cx + halfW; x += step) {
    ctx.moveTo(x, cy - halfH);
    ctx.lineTo(x, cy + halfH);
  }
  for (let y = Math.floor((cy - halfH) / step) * step; y < cy + halfH; y += step) {
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx + halfW, y);
  }
  ctx.stroke();
}

/* Track: dark asphalt, neon rims. Trick: stroke a slightly wider neon band,
   then overdraw asphalt → crisp 4px glowing edge on both sides, cheap. */
function drawTrack(ctx: CanvasRenderingContext2D, center: CenterPt[]) {
  strokeLoop(ctx, center, (ROAD_HALF + EDGE) * 2 + 44, C.neonGlow);          // soft outer glow
  strokeLoop(ctx, center, ROAD_HALF * 2 + EDGE * 2, C.neonDim);             // neon rim band
  strokeLoop(ctx, center, ROAD_HALF * 2, C.asphalt);                        // asphalt
  strokeLoop(ctx, center, ROAD_HALF * 2 - 26, C.asphaltCore);               // subtle core tint
  strokeLoop(ctx, center, 3, 'rgba(255,255,255,0.07)', [36, 52]);           // center dashes
}

function drawFinish(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  const p = center[0];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.ty, p.tx));
  const cell = 14;
  for (let i = -1; i <= 0; i += 1) {
    for (let j = -Math.floor(ROAD_HALF / cell); j < Math.floor(ROAD_HALF / cell); j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? 'rgba(248,250,252,0.85)' : 'rgba(5,6,16,0.9)';
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  const pulse = 0.55 + Math.sin(now * 0.004) * 0.25;
  ctx.fillStyle = `rgba(242,199,102,${pulse})`;
  ctx.fillRect(-ROAD_HALF - EDGE, -3, EDGE + 4, 6);
  ctx.fillRect(ROAD_HALF - 4, -3, EDGE + 4, 6);
  ctx.restore();
}

function drawPost(ctx: CanvasRenderingContext2D, p: SidePost) {
  const col = p.hue === 'cyan' ? C.neon : C.purple;
  ctx.fillStyle = p.hue === 'cyan' ? 'rgba(82,255,229,0.10)' : 'rgba(157,124,255,0.10)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const k = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(140,170,180,${0.10 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(242,199,102,${0.8 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(60,70,100,${0.18 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

function drawSkids(ctx: CanvasRenderingContext2D, list: Skid[], dt: number) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    ctx.strokeStyle = `rgba(0,0,0,${0.35 * m.life})`;
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
    m.life -= 0.14 * dt;
    if (m.life <= 0) list.splice(i, 1);
  }
  if (list.length > 240) list.splice(0, list.length - 240);
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  opt: { ghost?: boolean; steer?: number; brake?: number; drift?: number },
) {
  const ghost = !!opt.ghost;
  const accent = ghost ? C.purple : C.neon;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (ghost) ctx.globalAlpha = 0.42;

  // underglow — stronger while drifting
  const glow = ghost ? 0.10 : 0.10 + (opt.drift || 0) * 0.22;
  ctx.fillStyle = ghost ? `rgba(157,124,255,${glow})` : `rgba(82,255,229,${glow})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // wheels
  const wheel = (wx: number, wy: number, front: boolean) => {
    ctx.save();
    ctx.translate(wx, wy);
    if (front && opt.steer) ctx.rotate(opt.steer * 0.38);
    ctx.fillStyle = '#070a14';
    rr(ctx, -7, -5, 14, 10, 3);
    ctx.fill();
    ctx.restore();
  };
  wheel(-14, -12, false);
  wheel(-14, 12, false);
  wheel(16, -12, true);
  wheel(16, 12, true);

  // body — dark with a neon trim, readable silhouette
  ctx.fillStyle = ghost ? '#171231' : '#0b0e1a';
  rr(ctx, -26, -13, 54, 26, 10);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  rr(ctx, -26, -13, 54, 26, 10);
  ctx.stroke();

  // cabin
  ctx.fillStyle = ghost ? 'rgba(157,124,255,0.35)' : 'rgba(82,255,229,0.28)';
  rr(ctx, -3, -8, 15, 16, 5);
  ctx.fill();

  // light bar across the hood
  ctx.fillStyle = accent;
  ctx.fillRect(20, -10, 3, 20);

  if (!ghost) {
    // headlights
    ctx.fillStyle = '#eafffb';
    ctx.fillRect(26, -9, 3, 5);
    ctx.fillRect(26, 4, 3, 5);
    // taillights — gold, brighter under braking
    const braking = (opt.brake || 0) > 0.05;
    ctx.fillStyle = braking ? C.gold : 'rgba(242,199,102,0.45)';
    ctx.fillRect(-28, -9, 3, 5);
    ctx.fillRect(-28, 4, 3, 5);
  }
  ctx.restore();
}

/* ====================== GHOST INTERPOLATION (NETWORK) ==================== */
/* Remote opponent arrives as snapshots. Render ~100 ms in the past with
   linear interpolation between snapshots — the standard jitter-free trick. */

class GhostBuffer {
  private buf: NetSnapshot[] = [];
  private offset = 0; // peer-clock → local-clock estimate
  private delay = 100;

  push(s: NetSnapshot) {
    const localNow = performance.now();
    if (this.buf.length === 0) this.offset = localNow - s.t;
    this.buf.push(s);
    if (this.buf.length > 40) this.buf.shift();
  }

  sample(localNow: number): { x: number; y: number; angle: number; drift: number } | null {
    if (this.buf.length < 2) return this.buf[0] ? { ...this.buf[0] } : null;
    const renderT = localNow - this.offset - this.delay;
    for (let i = 0; i < this.buf.length - 1; i += 1) {
      const a = this.buf[i];
      const b = this.buf[i + 1];
      if (renderT >= a.t && renderT <= b.t) {
        const t = (renderT - a.t) / (b.t - a.t || 1);
        return {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          angle: a.angle + angleDiff(b.angle, a.angle) * t,
          drift: lerp(a.drift, b.drift, t),
        };
      }
    }
    const last = this.buf[this.buf.length - 1];
    return { ...last };
  }

  get active() { return this.buf.length > 0; }
  clear() { this.buf = []; }
}

/* ================================== UI =================================== */

function fmtTime(ms: number) {
  if (ms <= 0 || !isFinite(ms)) return '--:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const STICK_R = 52;   // travel radius
const STICK_ZONE = 148; // hit area square

export const RaceGame = forwardRef<DriftRaceHandle, DriftRaceProps>(
  ({ onSnapshot, selfGhost = true, topOffset = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const raf = useRef<number | null>(null);

    const { center, total } = useMemo(() => {
      const t = buildCenterline();
      return { center: t.pts, length: t.length, total: t.length };
    }, []);
    const posts = useMemo(() => buildPosts(center), [center]);

    const startPose = useMemo(() => {
      const p = center[0];
      return { x: p.x, y: p.y, angle: Math.atan2(p.ty, p.tx) };
    }, [center]);

    const makeCar = useCallback((): CarState => ({
      x: startPose.x, y: startPose.y, angle: startPose.angle,
      vx: 0, vy: 0, steer: 0, driftPower: 0, progress: 0, lap: 1, armed: false,
    }), [startPose]);

    const car = useRef<CarState>(makeCar());
    const input = useRef<InputState>({ throttle: 0, brake: 0, steer: 0, drift: false });
    const keys = useRef({ up: false, down: false, left: false, right: false, drift: false });
    const stick = useRef({ active: false, id: -1, ix: 0, iy: 0, power: 0 });
    const startedRef = useRef(false);

    const particles = useRef<Particle[]>([]);
    const skids = useRef<Skid[]>([]);
    const popups = useRef<Popup[]>([]);
    const cam = useRef({ x: startPose.x, y: startPose.y, zoom: 1, sx: 0, sy: 0, shake: 0 });
    const vp = useRef({ w: 0, h: 0, dpr: 1 });
    const acc = useRef(0);
    const lastT = useRef(0);
    const netT = useRef(0);
    const hudT = useRef(0);

    const lapStart = useRef(performance.now());
    const bestLap = useRef<number>(Infinity);
    const combo = useRef({ score: 0, ms: 0, idle: 0, banked: 0 });

    const ghostBuf = useRef(new GhostBuffer());
    const selfRec = useRef<{ t: number; x: number; y: number; angle: number }[]>([]);
    const bestRec = useRef<typeof selfRec.current | null>(null);

    const [hud, setHud] = useState({ speed: 0, lap: 1, drift: 0, combo: 0, banked: 0, lapTime: 0, best: Infinity });
    const [started, setStarted] = useState(false);
    const [stickActive, setStickActive] = useState(false);

    const doReset = useCallback(() => {
      car.current = makeCar();
      particles.current = [];
      skids.current = [];
      popups.current = [];
      cam.current = { x: startPose.x, y: startPose.y, zoom: 1, sx: 0, sy: 0, shake: 0 };
      combo.current = { score: 0, ms: 0, idle: 0, banked: 0 };
      selfRec.current = [];
      lapStart.current = performance.now();
      startedRef.current = false;
      setStarted(false);
    }, [makeCar, startPose]);

    useImperativeHandle(ref, () => ({
      pushRemoteSnapshot: (s: NetSnapshot) => ghostBuf.current.push(s),
      reset: () => doReset(),
    }));

    /* ----- viewport: ResizeObserver drives the canvas, never the page ----- */
    useEffect(() => {
      const cv = canvasRef.current;
      const wr = wrapRef.current;
      if (!cv || !wr) return;
      const apply = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = wr.clientWidth;
        const h = wr.clientHeight;
        vp.current = { w, h, dpr };
        cv.width = Math.floor(w * dpr);
        cv.height = Math.floor(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      };
      apply();
      const ro = new ResizeObserver(apply);
      ro.observe(wr);
      window.addEventListener('resize', apply);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', apply);
      };
    }, []);

    /* ----- Telegram Mini App: expand + kill the vertical swipe-to-close ----- */
    useEffect(() => {
      try {
        const tg = (window as unknown as { Telegram?: { WebApp?: { expand?: () => void; disableVerticalSwipes?: () => void } } })
          .Telegram?.WebApp;
        tg?.expand?.();
        tg?.disableVerticalSwipes?.();
      } catch {
        /* not inside Telegram — fine */
      }
    }, []);

    /* ----- hard scroll lock while the game is mounted ----- */
    useEffect(() => {
      const wrap = wrapRef.current;
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      const block = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
      };
      wrap?.addEventListener('touchmove', block, { passive: false });
      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
        wrap?.removeEventListener('touchmove', block);
      };
    }, []);

    /* ----- keyboard (desktop testing) ----- */
    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r'].includes(k)) e.preventDefault();
        if (k === 'arrowup' || k === 'w') keys.current.up = true;
        if (k === 'arrowdown' || k === 's') keys.current.down = true;
        if (k === 'arrowleft' || k === 'a') keys.current.left = true;
        if (k === 'arrowright' || k === 'd') keys.current.right = true;
        if (k === ' ') keys.current.drift = true;
        if (k === 'r') doReset();
        if (!startedRef.current && (k === 'arrowup' || k === 'w' || k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd')) {
          startedRef.current = true;
          setStarted(true);
        }
      };
      const up = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (k === 'arrowup' || k === 'w') keys.current.up = false;
        if (k === 'arrowdown' || k === 's') keys.current.down = false;
        if (k === 'arrowleft' || k === 'a') keys.current.left = false;
        if (k === 'arrowright' || k === 'd') keys.current.right = false;
        if (k === ' ') keys.current.drift = false;
      };
      window.addEventListener('keydown', down, { passive: false });
      window.addEventListener('keyup', up);
      return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
      };
    }, [doReset]);

    /* ----- main loop ----- */
    useEffect(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d', { alpha: false });
      if (!ctx) return;

      const loop = (now: number) => {
        const v = vp.current;
        const frameMs = lastT.current === 0 ? 16.7 : Math.min(now - lastT.current, 50);
        lastT.current = now;

        /* INPUT.
           Touch: auto-throttle once started. Stick X = steering.
           Stick pulled DOWN = handbrake → manual big drift + brake.
           Keyboard overrides everything when pressed. */
        const i = input.current;
        const st = stick.current;
        const anyKey = keys.current.up || keys.current.down || keys.current.left || keys.current.right || keys.current.drift;

        if (anyKey) {
          i.throttle = keys.current.up || (!keys.current.down && startedRef.current) ? 1 : 0;
          i.steer = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
          i.brake = keys.current.down ? 1 : 0;
          i.drift = keys.current.drift;
        } else if (st.active && st.power > 0.06) {
          i.steer = clamp(st.ix * 1.25, -1, 1);
          const pullDown = clamp((st.iy - 0.45) / 0.55, 0, 1); // stick pulled toward you
          if (pullDown > 0) {
            i.brake = pullDown * 0.9;
            i.drift = pullDown > 0.25;
            i.throttle = 1 - pullDown;
          } else {
            i.brake = 0;
            i.drift = false;
            i.throttle = 1; // auto-throttle: just steer
          }
        } else {
          // released: coast with auto-throttle, wheels straighten, car settles
          i.steer = 0;
          i.brake = 0;
          i.drift = false;
          i.throttle = startedRef.current ? 1 : 0;
        }

        /* FIXED-STEP PHYSICS */
        acc.current += frameMs / 1000;
        let guard = 0;
        while (acc.current >= STEP && guard < 5) {
          const res = stepCar(car.current, i, center, total);
          acc.current -= STEP;
          guard += 1;

          const c = car.current;
          // skids + light smoke while sliding
          if (res.slip > 0.2 && res.speed > 90) {
            const rx = -Math.sin(c.angle);
            const ry = Math.cos(c.angle);
            const bx = c.x - Math.cos(c.angle) * 20;
            const by = c.y - Math.sin(c.angle) * 20;
            skids.current.push(
              { x1: bx - rx * 10, y1: by - ry * 10, x2: bx - rx * 10 - c.vx * 0.03, y2: by - ry * 10 - c.vy * 0.03, life: 1 },
              { x1: bx + rx * 10, y1: by + ry * 10, x2: bx + rx * 10 - c.vx * 0.03, y2: by + ry * 10 - c.vy * 0.03, life: 1 },
            );
            if (Math.random() > 0.55) spawn(particles.current, bx, by, 'smoke', 1, c.angle, 0.5 + c.driftPower * 0.6);
          }
          if (res.surface === 'off' && res.speed > 70 && Math.random() > 0.6)
            spawn(particles.current, c.x - Math.cos(c.angle) * 18, c.y - Math.sin(c.angle) * 18, 'dust', 1, c.angle, 0.7);

          if (res.hardHit) {
            cam.current.shake = Math.max(cam.current.shake, 0.7);
            spawn(particles.current, c.x, c.y, 'spark', 3, c.angle, 1.2);
            combo.current.score = 0; // a hit resets the combo
          }

          // drift combo → banked points
          const cm = combo.current;
          if (res.slip > 0.22 && res.speed > 110) {
            cm.ms += STEP * 1000;
            cm.score += res.speed * res.slip * STEP * 0.6;
            cm.idle = 0;
          } else {
            cm.idle += STEP * 1000;
            if (cm.idle > 450 && cm.score > 30) {
              const mult = 1 + Math.floor(cm.ms / 1500);
              const gained = Math.round(cm.score * mult);
              cm.banked += gained;
              popups.current.push({ x: c.x, y: c.y - 30, life: 1.1, text: `+${gained}${mult > 1 ? ` ×${mult}` : ''}`, big: mult > 1 });
              cm.score = 0;
              cm.ms = 0;
            }
          }

          // record this lap for the self-ghost
          const recT = now - lapStart.current;
          const rec = selfRec.current;
          if (rec.length === 0 || recT - rec[rec.length - 1].t > 40) {
            rec.push({ t: recT, x: c.x, y: c.y, angle: c.angle });
          }

          if (res.crossedFinish) {
            const lapMs = now - lapStart.current;
            if (lapMs < bestLap.current) {
              bestLap.current = lapMs;
              bestRec.current = selfRec.current.slice();
            }
            lapStart.current = now;
            selfRec.current = [];
          }
        }

        /* === NETWORK: emit local snapshot ~20 Hz — wire to WebSocket.send() === */
        if (onSnapshot && now - netT.current > 50) {
          netT.current = now;
          const c = car.current;
          onSnapshot({ t: now, x: c.x, y: c.y, angle: c.angle, drift: c.driftPower, lap: c.lap });
        }

        /* CAMERA — exp smoothing keyed to the VELOCITY vector, not the nose:
           the nose whips around in a drift, velocity changes continuously. */
        const c = car.current;
        const speed = Math.hypot(c.vx, c.vy);
        const cmr = cam.current;
        const dtSec = Math.min(frameMs / 1000, 0.05);

        const kPos = 1 - Math.exp(-dtSec / 0.16);
        cmr.x = lerp(cmr.x, c.x + c.vx * 0.25, kPos);
        cmr.y = lerp(cmr.y, c.y + c.vy * 0.25, kPos);

        const targetZoom = 1.04 - clamp(speed / TUNE.maxSpeed, 0, 1) * 0.12; // subtle
        cmr.zoom = lerp(cmr.zoom, targetZoom, 1 - Math.exp(-dtSec / 0.45));

        cmr.shake = Math.max(0, cmr.shake - dtSec * 3);
        cmr.sx = (Math.random() - 0.5) * cmr.shake * 10;
        cmr.sy = (Math.random() - 0.5) * cmr.shake * 10;

        /* DRAW */
        const dt = frameMs / 1000;
        ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, v.w, v.h);

        ctx.save();
        ctx.translate(v.w / 2 + cmr.sx, v.h / 2 + cmr.sy);
        ctx.scale(cmr.zoom, cmr.zoom);
        ctx.translate(-cmr.x, -cmr.y);

        drawGround(ctx, cmr.x, cmr.y, v.w, v.h, cmr.zoom);
        drawTrack(ctx, center);
        drawSkids(ctx, skids.current, dt);
        drawFinish(ctx, center, now);
        for (const p of posts) {
          if (Math.abs(p.x - cmr.x) < 800 && Math.abs(p.y - cmr.y) < 800) drawPost(ctx, p);
        }
        drawParticles(ctx, particles.current, dt);

        // ghost: network opponent first, otherwise own best lap
        if (ghostBuf.current.active) {
          const g = ghostBuf.current.sample(now);
          if (g) {
            drawCar(ctx, g.x, g.y, g.angle, { ghost: true });
            if (g.drift > 0.35 && Math.random() > 0.7) spawn(particles.current, g.x, g.y, 'smoke', 1, g.angle, 0.4);
          }
        } else if (selfGhost && bestRec.current && bestRec.current.length > 1) {
          const rec = bestRec.current;
          const tt = now - lapStart.current;
          if (tt <= rec[rec.length - 1].t) {
            let lo = 0;
            let hi = rec.length - 1;
            while (lo < hi - 1) {
              const mid = (lo + hi) >> 1;
              if (rec[mid].t < tt) lo = mid; else hi = mid;
            }
            const a = rec[lo];
            const b = rec[hi];
            const k = (tt - a.t) / (b.t - a.t || 1);
            drawCar(ctx, lerp(a.x, b.x, k), lerp(a.y, b.y, k), a.angle + angleDiff(b.angle, a.angle) * k, { ghost: true });
          }
        }

        // player
        drawCar(ctx, c.x, c.y, c.angle, { steer: c.steer, brake: i.brake, drift: c.driftPower });

        // drift score popups
        for (let p = popups.current.length - 1; p >= 0; p -= 1) {
          const pop = popups.current[p];
          ctx.save();
          ctx.globalAlpha = clamp(pop.life, 0, 1);
          ctx.fillStyle = pop.big ? C.gold : 'rgba(242,199,102,0.85)';
          ctx.font = `800 ${pop.big ? 26 : 19}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(pop.text, pop.x, pop.y);
          ctx.restore();
          pop.y -= 36 * dt;
          pop.life -= dt;
          if (pop.life <= 0) popups.current.splice(p, 1);
        }

        ctx.restore();

        // soft vignette to blend into the app shell
        const vg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
        vg.addColorStop(0, 'rgba(5,6,16,0)');
        vg.addColorStop(1, 'rgba(5,6,16,0.45)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, v.w, v.h);

        drawMini(ctx, center, c, v.w, ghostBuf.current);

        /* HUD state — throttled to ~10 Hz, never every frame */
        if (now - hudT.current > 100) {
          hudT.current = now;
          setHud({
            speed: Math.round(speed * 0.45),
            lap: c.lap,
            drift: c.driftPower,
            combo: Math.round(combo.current.score * (1 + Math.floor(combo.current.ms / 1500))),
            banked: combo.current.banked,
            lapTime: now - lapStart.current,
            best: bestLap.current,
          });
        }

        raf.current = requestAnimationFrame(loop);
      };

      raf.current = requestAnimationFrame(loop);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
      };
    }, [center, total, posts, onSnapshot, selfGhost]);

    /* ----- fixed joystick, bottom-left. Pointer events + capture. -----
       Knob position is written straight to the DOM (no setState per move). */
    const setKnob = (kx: number, ky: number) => {
      if (knobRef.current) knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    };

    const updateStickFromPointer = (e: React.PointerEvent, zone: HTMLDivElement) => {
      const r = zone.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(d, STICK_R);
      const kx = (dx / d) * m;
      const ky = (dy / d) * m;
      stick.current.ix = kx / STICK_R;
      stick.current.iy = ky / STICK_R;
      stick.current.power = clamp(d / STICK_R, 0, 1);
      setKnob(kx, ky);
    };

    const stickDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const zone = e.currentTarget;
      stick.current.active = true;
      stick.current.id = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* some webviews throw — capture is best-effort */
      }
      if (!startedRef.current) {
        startedRef.current = true;
        setStarted(true);
      }
      setStickActive(true);
      updateStickFromPointer(e, zone);
    };
    const stickMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stick.current.active || stick.current.id !== e.pointerId) return;
      e.preventDefault();
      updateStickFromPointer(e, e.currentTarget);
    };
    const stickUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (stick.current.id !== e.pointerId) return;
      stick.current = { active: false, id: -1, ix: 0, iy: 0, power: 0 };
      setKnob(0, 0);
      setStickActive(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    return (
      <div
        ref={wrapRef}
        className="relative w-full select-none overflow-hidden overscroll-none bg-[#050610] font-mono text-white"
        style={{
          height: `calc(100dvh - ${topOffset}px)`,
          maxHeight: '100dvh',
          minHeight: 320,
          touchAction: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none' }} />

        {/* HUD — one compact glass strip: speed · lap · time · points */}
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <div className="flex items-center divide-x divide-white/[0.07] overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#050610]/60 shadow-lg backdrop-blur-md">
            <div className="px-3 py-1.5 text-center">
              <div className="text-lg font-extrabold leading-none tabular-nums text-white">
                {hud.speed}
                <span className="ml-0.5 align-top text-[8px] font-semibold text-white/40">км/ч</span>
              </div>
            </div>
            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">круг</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-[#52FFE5]">{hud.lap}/{TOTAL_LAPS}</div>
            </div>
            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">время</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-white">{fmtTime(hud.lapTime)}</div>
            </div>
            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">очки</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-[#F2C766]">{hud.banked}</div>
            </div>
          </div>
        </div>

        {/* best lap chip */}
        {isFinite(hud.best) && (
          <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full border border-white/[0.07] bg-[#050610]/55 px-3 py-0.5 text-[10px] tabular-nums text-[#9D7CFF] backdrop-blur-md">
            лучший {fmtTime(hud.best)}
          </div>
        )}

        {/* live drift combo */}
        {hud.combo > 30 && (
          <div className="pointer-events-none absolute left-1/2 top-[84px] -translate-x-1/2 text-center">
            <div
              className="text-xl font-extrabold uppercase tracking-tight text-[#F2C766] drop-shadow-[0_0_14px_rgba(242,199,102,0.55)]"
              style={{ transform: `scale(${1 + Math.min(hud.drift, 1) * 0.18})` }}
            >
              занос {hud.combo}
            </div>
          </div>
        )}

        {/* reset — small glass button, bottom-right, above the safe area */}
        <button
          type="button"
          onClick={doReset}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.07] bg-[#050610]/60 text-lg text-white/70 backdrop-blur-md active:scale-95 active:text-[#52FFE5]"
          style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          aria-label="Заново"
        >
          ↻
        </button>

        {/* joystick — fixed bottom-left, steering only (down = handbrake) */}
        <div
          className="absolute z-10"
          style={{
            left: 14,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            width: STICK_ZONE,
            height: STICK_ZONE,
            touchAction: 'none',
          }}
          onPointerDown={stickDown}
          onPointerMove={stickMove}
          onPointerUp={stickUp}
          onPointerCancel={stickUp}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`relative rounded-full border bg-white/[0.04] backdrop-blur-sm transition-colors ${
                stickActive ? 'border-[#52FFE5]/40' : 'border-white/[0.10]'
              }`}
              style={{ width: STICK_R * 2 + 16, height: STICK_R * 2 + 16 }}
            >
              {/* drift hint at the bottom of the base */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-white/25">
                занос ↓
              </div>
              <div
                ref={knobRef}
                className={`absolute left-1/2 top-1/2 rounded-full border shadow-xl transition-colors ${
                  stickActive
                    ? 'border-[#52FFE5]/60 bg-gradient-to-br from-[#52FFE5]/90 to-[#1f8f80]'
                    : 'border-white/20 bg-gradient-to-br from-white/80 to-white/40'
                }`}
                style={{ width: 48, height: 48, margin: -24, willChange: 'transform' }}
              />
            </div>
          </div>
        </div>

        {/* one-time hint before the first touch */}
        {!started && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="mx-6 rounded-[22px] border border-white/[0.07] bg-[#050610]/70 px-5 py-4 text-center backdrop-blur-md">
              <div className="text-sm font-bold text-white">Коснись стика — поехали</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/50">
                Газ автоматический. Стик влево-вправо — руль,{' '}
                <span className="text-[#52FFE5]">резкий поворот — занос</span>,{' '}
                <span className="text-[#F2C766]">вниз — ручник</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

RaceGame.displayName = 'RaceGame';

/* compact glass minimap — top-right so it never meets the joystick or HUD */
function drawMini(ctx: CanvasRenderingContext2D, center: CenterPt[], car: CarState, width: number, ghost: GhostBuffer) {
  const size = 78;
  const x = width - size - 12;
  const y = 64;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of center) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = 12;
  const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxY - minY));
  const ox = x + size / 2 - ((minX + maxX) / 2) * scale;
  const oy = y + size / 2 - ((minY + maxY) / 2) * scale;
  const mx = (wx: number) => ox + wx * scale;
  const my = (wy: number) => oy + wy * scale;

  ctx.save();
  ctx.fillStyle = 'rgba(5,6,16,0.55)';
  rr(ctx, x, y, size, size, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(82,255,229,0.5)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  center.forEach((p, i) => (i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y))));
  ctx.closePath();
  ctx.stroke();

  if (ghost.active) {
    const g = ghost.sample(performance.now());
    if (g) {
      ctx.fillStyle = '#9D7CFF';
      ctx.beginPath();
      ctx.arc(mx(g.x), my(g.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#F2C766';
  ctx.beginPath();
  ctx.arc(mx(car.x), my(car.y), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default RaceGame;