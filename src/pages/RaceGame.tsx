/* ============================================================================
 *  RaceGame.tsx — arcade neon drift racer for Telegram Mini App
 *  ---------------------------------------------------------------------------
 *  • Physics rewritten: always-drifting arcade feel, auto-throttle, easy turns,
 *    soft speed loss in drift, no annoying spin-outs.
 *  • Fits Mini App viewport: parent-sized canvas, no scroll, safe-area controls.
 *  • Visuals: dark app palette, neon track, arrows, side beacons, speed trail.
 *  • Network-ready public API preserved: NetSnapshot, onSnapshot, ghost buffer,
 *    pushRemoteSnapshot(), reset().
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
type ParticleKind = 'smoke' | 'spark' | 'dust' | 'glow';

type CarState = {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  steer: number;
  driftPower: number;
  progress: number;
  lap: number;
  armed: boolean;
};

type InputState = {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: ParticleKind;
};

type Skid = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  w: number;
};

type Popup = {
  x: number;
  y: number;
  life: number;
  text: string;
  big: boolean;
};

type SideBeacon = {
  x: number;
  y: number;
  hue: 'cyan' | 'purple' | 'gold';
  phase: number;
};

type Trail = {
  x: number;
  y: number;
  angle: number;
  life: number;
  drift: number;
};

/** Tiny snapshot for future 1v1 WebSocket mode. */
export type NetSnapshot = {
  t: number;
  x: number;
  y: number;
  angle: number;
  drift: number;
  lap: number;
};

export interface DriftRaceHandle {
  pushRemoteSnapshot: (snap: NetSnapshot) => void;
  reset: () => void;
}

interface DriftRaceProps {
  onSnapshot?: (snap: NetSnapshot) => void;
  selfGhost?: boolean;
  topOffset?: number;
}

/* =============================== PALETTE ================================= */

const C = {
  bg: '#050610',
  panel: 'rgba(5,6,16,0.68)',
  asphalt: '#111522',
  asphaltCore: '#171d2d',
  asphaltHot: '#20263a',
  neon: '#52FFE5',
  neonDim: 'rgba(82,255,229,0.55)',
  neonSoft: 'rgba(82,255,229,0.12)',
  gold: '#F2C766',
  purple: '#9D7CFF',
  red: '#FF6B8A',
} as const;

/* =============================== TUNING ================================== */

const STEP = 1 / 60;
const TOTAL_LAPS = 5;

const ROAD_HALF = 84;
const EDGE = 9;
const RUNOFF = 62;
const WALL = ROAD_HALF + EDGE + RUNOFF;

/**
 * Arcade drift model:
 * - velocity direction follows car nose with lag;
 * - steering rotates the nose fast, velocity follows slower => constant drift;
 * - high steer / handbrake increases lag and bleeds speed;
 * - release stick => nose smoothly aligns to motion.
 */
const TUNE = {
  maxSpeed: 455,
  minCruiseSpeed: 185,
  startBoost: 1350,
  accel: 720,
  brakePower: 1180,

  turnRate: 3.45,
  turnAtLowSpeed: 0.42,
  steerLerp: 15.5,

  baseVelFollow: 4.2,
  driftVelFollow: 1.35,
  releaseAlign: 4.6,

  alwaysDrift: 0.22,
  steerDrift: 0.68,
  handbrakeDrift: 0.42,

  driftSpeedLoss: 0.34,
  hardDriftSpeedLoss: 0.28,

  wallBounce: 1.18,
  wallSpeedLoss: 0.68,
} as const;

const SURFACE: Record<Surface, { topMul: number; accelMul: number; driftAdd: number; roll: number }> = {
  asphalt: { topMul: 1, accelMul: 1, driftAdd: 0, roll: 1 },
  edge: { topMul: 0.92, accelMul: 0.9, driftAdd: 0.08, roll: 1.25 },
  off: { topMul: 0.52, accelMul: 0.42, driftAdd: 0.18, roll: 2.6 },
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

const NODES: Vec[] = [
  { x: -1280, y: -220 },
  { x: -1020, y: -860 },
  { x: -280, y: -1110 },
  { x: 480, y: -1020 },
  { x: 1180, y: -1190 },
  { x: 1670, y: -560 },
  { x: 1460, y: 180 },
  { x: 1760, y: 760 },
  { x: 1210, y: 1220 },
  { x: 380, y: 1100 },
  { x: -190, y: 1320 },
  { x: -850, y: 1100 },
  { x: -1380, y: 620 },
];

type CenterPt = Vec & {
  tx: number;
  ty: number;
  dist: number;
};

function buildCenterline(): { pts: CenterPt[]; length: number } {
  const raw: Vec[] = [];
  const n = NODES.length;
  const seg = 24;

  for (let i = 0; i < n; i += 1) {
    const p0 = NODES[(i - 1 + n) % n];
    const p1 = NODES[i];
    const p2 = NODES[(i + 1) % n];
    const p3 = NODES[(i + 2) % n];

    for (let j = 0; j < seg; j += 1) {
      const t = j / seg;
      const t2 = t * t;
      const t3 = t2 * t;

      raw.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
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

    pts.push({
      x: a.x,
      y: a.y,
      tx: dx / len,
      ty: dy / len,
      dist: length,
    });

    length += len;
  }

  return { pts, length };
}

type Hit = {
  d: number;
  nx: number;
  ny: number;
  progress: number;
  surface: Surface;
};

function queryTrack(center: CenterPt[], total: number, x: number, y: number): Hit {
  let best: Hit = {
    d: Infinity,
    nx: 1,
    ny: 0,
    progress: 0,
    surface: 'off',
  };

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

function buildBeacons(center: CenterPt[]): SideBeacon[] {
  const rnd = seeded(777);
  const beacons: SideBeacon[] = [];

  for (let i = 0; i < center.length; i += 12) {
    const p = center[i];
    const side = (i / 12) % 2 === 0 ? 1 : -1;
    const off = ROAD_HALF + EDGE + 24;
    const roll = rnd();

    beacons.push({
      x: p.x - p.ty * off * side,
      y: p.y + p.tx * off * side,
      hue: roll > 0.78 ? 'gold' : roll > 0.48 ? 'purple' : 'cyan',
      phase: rnd() * Math.PI * 2,
    });
  }

  return beacons;
}

/* ================================ PHYSICS ================================ */

type StepResult = {
  speed: number;
  slip: number;
  surface: Surface;
  crossedFinish: boolean;
  hardHit: boolean;
};

function stepCar(car: CarState, input: InputState, center: CenterPt[], total: number): StepResult {
  const here = queryTrack(center, total, car.x, car.y);
  const surf = SURFACE[here.surface];

  const speedBefore = Math.hypot(car.vx, car.vy);
  const speed01 = clamp(speedBefore / TUNE.maxSpeed, 0, 1);

  car.steer = lerp(car.steer, clamp(input.steer, -1, 1), clamp(TUNE.steerLerp * STEP, 0, 1));

  let moveAngle = speedBefore > 8 ? Math.atan2(car.vy, car.vx) : car.angle;
  let speed = speedBefore;

  const steerAbs = Math.abs(car.steer);
  const handbrake = input.drift ? 1 : 0;

  const driftTarget = clamp(
    TUNE.alwaysDrift +
      steerAbs * TUNE.steerDrift * smooth(0.16, 0.92, speed01) +
      handbrake * TUNE.handbrakeDrift +
      surf.driftAdd,
    0,
    1,
  );

  const turnAuthority = TUNE.turnAtLowSpeed + (1 - TUNE.turnAtLowSpeed) * smooth(55, 215, speed);
  const turnBoost = 1 + driftTarget * 0.28;

  car.angle += car.steer * TUNE.turnRate * turnAuthority * turnBoost * STEP;

  const followRate = lerp(TUNE.baseVelFollow, TUNE.driftVelFollow, driftTarget);
  moveAngle += angleDiff(car.angle, moveAngle) * clamp(followRate * STEP, 0, 1);

  if (steerAbs < 0.08 && !input.drift && speed > 40) {
    car.angle += angleDiff(moveAngle, car.angle) * clamp(TUNE.releaseAlign * STEP, 0, 1);
  }

  const targetSpeed =
    (TUNE.minCruiseSpeed + (TUNE.maxSpeed - TUNE.minCruiseSpeed) * input.throttle) *
    surf.topMul *
    (1 - steerAbs * 0.08 - driftTarget * 0.16);

  const accelRate = speed < targetSpeed ? TUNE.startBoost : TUNE.accel;
  speed += clamp(targetSpeed - speed, -accelRate * STEP, accelRate * surf.accelMul * STEP);

  if (input.brake > 0) {
    speed -= input.brake * TUNE.brakePower * STEP;
  }

  speed -= speed * (0.12 * surf.roll) * STEP;
  speed -= speed * driftTarget * TUNE.driftSpeedLoss * STEP;

  if (input.drift) {
    speed -= speed * TUNE.hardDriftSpeedLoss * STEP;
  }

  speed = clamp(speed, 0, TUNE.maxSpeed * surf.topMul);

  car.vx = Math.cos(moveAngle) * speed;
  car.vy = Math.sin(moveAngle) * speed;

  let nx = car.x + car.vx * STEP;
  let ny = car.y + car.vy * STEP;

  let hardHit = false;
  const next = queryTrack(center, total, nx, ny);

  if (next.d > WALL) {
    const pen = next.d - WALL;

    nx -= next.nx * pen;
    ny -= next.ny * pen;

    const vn = car.vx * next.nx + car.vy * next.ny;

    if (vn > 0) {
      car.vx -= next.nx * vn * TUNE.wallBounce;
      car.vy -= next.ny * vn * TUNE.wallBounce;
    }

    car.vx *= TUNE.wallSpeedLoss;
    car.vy *= TUNE.wallSpeedLoss;

    car.angle += angleDiff(Math.atan2(car.vy, car.vx), car.angle) * 0.12;

    if (speedBefore > 165) hardHit = true;
  }

  car.x = nx;
  car.y = ny;

  const speedAfter = Math.hypot(car.vx, car.vy);
  const actualMoveAngle = speedAfter > 8 ? Math.atan2(car.vy, car.vx) : car.angle;
  const slip = speedAfter > 50 ? Math.abs(angleDiff(actualMoveAngle, car.angle)) : 0;

  const visualDrift = clamp(driftTarget * 0.72 + clamp(slip / 0.75, 0, 1) * 0.48, 0, 1);
  car.driftPower = lerp(car.driftPower, visualDrift * smooth(50, 190, speedAfter), 0.22);

  let crossedFinish = false;

  if (car.progress > 0.45 && car.progress < 0.75) car.armed = true;

  const prevProgress = car.progress;
  car.progress = here.progress;

  if (car.armed && prevProgress > 0.9 && car.progress < 0.1) {
    car.armed = false;
    car.lap = Math.min(car.lap + 1, TOTAL_LAPS);
    crossedFinish = true;
  }

  return {
    speed: speedAfter,
    slip,
    surface: here.surface,
    crossedFinish,
    hardHit,
  };
}

/* =============================== PARTICLES =============================== */

function spawn(
  list: Particle[],
  x: number,
  y: number,
  kind: ParticleKind,
  n: number,
  angle: number,
  power: number,
) {
  if (list.length > 170) list.splice(0, list.length - 140);

  for (let i = 0; i < n; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.6;
    const sp = (16 + Math.random() * 95) * power;
    const max =
      kind === 'spark'
        ? 0.18 + Math.random() * 0.16
        : kind === 'glow'
          ? 0.28 + Math.random() * 0.28
          : 0.42 + Math.random() * 0.55;

    list.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      size: 2 + Math.random() * (kind === 'smoke' ? 8 : kind === 'glow' ? 6 : 3),
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

function strokeLoop(
  ctx: CanvasRenderingContext2D,
  center: CenterPt[],
  width: number,
  color: string,
  dash?: number[],
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (dash) ctx.setLineDash(dash);

  ctx.beginPath();

  center.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });

  ctx.closePath();
  ctx.stroke();

  if (dash) ctx.setLineDash([]);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  zoom: number,
  now: number,
) {
  const halfW = w / zoom / 2 + 260;
  const halfH = h / zoom / 2 + 260;

  ctx.fillStyle = C.bg;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const pulse = 0.04 + Math.sin(now * 0.0015) * 0.015;

  ctx.strokeStyle = `rgba(157,124,255,${pulse})`;
  ctx.lineWidth = 1 / zoom;

  const step = 180;
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

  const g1 = ctx.createRadialGradient(cx - 450, cy - 320, 0, cx - 450, cy - 320, 820);
  g1.addColorStop(0, 'rgba(82,255,229,0.055)');
  g1.addColorStop(1, 'rgba(82,255,229,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const g2 = ctx.createRadialGradient(cx + 500, cy + 280, 0, cx + 500, cy + 280, 900);
  g2.addColorStop(0, 'rgba(157,124,255,0.06)');
  g2.addColorStop(1, 'rgba(157,124,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
}

function drawTrack(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  strokeLoop(ctx, center, (ROAD_HALF + EDGE) * 2 + 54, 'rgba(82,255,229,0.055)');
  strokeLoop(ctx, center, (ROAD_HALF + EDGE) * 2 + 24, 'rgba(157,124,255,0.035)');
  strokeLoop(ctx, center, ROAD_HALF * 2 + EDGE * 2, C.neonDim);
  strokeLoop(ctx, center, ROAD_HALF * 2 + 2, C.asphalt);
  strokeLoop(ctx, center, ROAD_HALF * 2 - 28, C.asphaltCore);
  strokeLoop(ctx, center, 3, 'rgba(255,255,255,0.07)', [36, 54]);

  const glow = 0.2 + Math.sin(now * 0.002) * 0.06;
  strokeLoop(ctx, center, 1.5, `rgba(82,255,229,${glow})`, [18, 72]);
}

function drawDirectionArrows(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  ctx.save();

  for (let i = 10; i < center.length; i += 20) {
    const p = center[i];
    const a = Math.atan2(p.ty, p.tx);
    const pulse = 0.32 + Math.sin(now * 0.004 + i * 0.2) * 0.12;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);

    ctx.strokeStyle = `rgba(82,255,229,${pulse})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-18, -18);
    ctx.lineTo(8, 0);
    ctx.lineTo(-18, 18);
    ctx.stroke();

    ctx.strokeStyle = `rgba(242,199,102,${pulse * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-34, -16);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-34, 16);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

function drawFinish(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  const p = center[0];

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.ty, p.tx));

  const cell = 14;

  for (let i = -1; i <= 0; i += 1) {
    for (let j = -Math.floor(ROAD_HALF / cell); j < Math.floor(ROAD_HALF / cell); j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? 'rgba(248,250,252,0.86)' : 'rgba(5,6,16,0.92)';
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }

  const pulse = 0.5 + Math.sin(now * 0.005) * 0.24;

  ctx.fillStyle = `rgba(242,199,102,${pulse})`;
  ctx.fillRect(-ROAD_HALF - EDGE, -4, EDGE + 6, 8);
  ctx.fillRect(ROAD_HALF - 4, -4, EDGE + 6, 8);

  ctx.restore();
}

function drawBeacon(ctx: CanvasRenderingContext2D, b: SideBeacon, now: number) {
  const base =
    b.hue === 'cyan' ? C.neon : b.hue === 'purple' ? C.purple : C.gold;

  const alpha = 0.14 + Math.sin(now * 0.004 + b.phase) * 0.055;

  ctx.fillStyle =
    b.hue === 'cyan'
      ? `rgba(82,255,229,${alpha})`
      : b.hue === 'purple'
        ? `rgba(157,124,255,${alpha})`
        : `rgba(242,199,102,${alpha})`;

  ctx.beginPath();
  ctx.arc(b.x, b.y, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle =
    b.hue === 'cyan'
      ? 'rgba(82,255,229,0.22)'
      : b.hue === 'purple'
        ? 'rgba(157,124,255,0.2)'
        : 'rgba(242,199,102,0.2)';

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 22 + Math.sin(now * 0.004 + b.phase) * 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const k = clamp(p.life / p.max, 0, 1);

    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(130,160,175,${0.09 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.7 - k * 0.45), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(242,199,102,${0.78 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      ctx.stroke();
    } else if (p.kind === 'glow') {
      ctx.fillStyle = `rgba(82,255,229,${0.12 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.3 + (1 - k) * 1.2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(90,96,130,${0.16 * k})`;
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

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];

    ctx.strokeStyle = `rgba(0,0,0,${0.27 * m.life})`;
    ctx.lineWidth = m.w;

    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();

    m.life -= 0.16 * dt;

    if (m.life <= 0) list.splice(i, 1);
  }

  if (list.length > 250) list.splice(0, list.length - 250);
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: Trail[], dt: number) {
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const t = trail[i];

    ctx.save();
    ctx.globalAlpha = t.life * (0.18 + t.drift * 0.24);
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);

    ctx.fillStyle = t.drift > 0.55 ? 'rgba(82,255,229,0.22)' : 'rgba(157,124,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(-9, 0, 34, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    t.life -= dt * 2.2;
    if (t.life <= 0) trail.splice(i, 1);
  }

  if (trail.length > 18) trail.splice(0, trail.length - 18);
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  opt: {
    ghost?: boolean;
    steer?: number;
    brake?: number;
    drift?: number;
    speed?: number;
  },
) {
  const ghost = !!opt.ghost;
  const drift = opt.drift || 0;
  const accent = ghost ? C.purple : C.neon;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (ghost) ctx.globalAlpha = 0.4;

  const underGlow = ghost ? 0.12 : 0.12 + drift * 0.3;
  ctx.fillStyle = ghost ? `rgba(157,124,255,${underGlow})` : `rgba(82,255,229,${underGlow})`;
  ctx.beginPath();
  ctx.ellipse(-3, 0, 40 + drift * 8, 22 + drift * 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const wheel = (wx: number, wy: number, front: boolean) => {
    ctx.save();
    ctx.translate(wx, wy);
    if (front && opt.steer) ctx.rotate(opt.steer * 0.42);
    ctx.fillStyle = '#050811';
    rr(ctx, -7, -5.5, 14, 11, 3.5);
    ctx.fill();
    ctx.restore();
  };

  wheel(-15, -12.5, false);
  wheel(-15, 12.5, false);
  wheel(17, -12.5, true);
  wheel(17, 12.5, true);

  ctx.fillStyle = ghost ? '#17112e' : '#090d1a';
  rr(ctx, -27, -13.5, 56, 27, 10);
  ctx.fill();

  const sideGlow = ctx.createLinearGradient(-25, -13, 28, 13);
  sideGlow.addColorStop(0, ghost ? 'rgba(157,124,255,0.18)' : 'rgba(82,255,229,0.18)');
  sideGlow.addColorStop(0.5, 'rgba(255,255,255,0.035)');
  sideGlow.addColorStop(1, ghost ? 'rgba(157,124,255,0.38)' : 'rgba(82,255,229,0.36)');
  ctx.fillStyle = sideGlow;
  rr(ctx, -25, -11.5, 52, 23, 8.5);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  rr(ctx, -27, -13.5, 56, 27, 10);
  ctx.stroke();

  ctx.fillStyle = ghost ? 'rgba(157,124,255,0.35)' : 'rgba(82,255,229,0.28)';
  rr(ctx, -4, -8, 16, 16, 5);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.fillRect(20, -10, 3.5, 20);

  if (!ghost) {
    ctx.fillStyle = '#eafffb';
    ctx.fillRect(27, -9, 3.5, 5);
    ctx.fillRect(27, 4, 3.5, 5);

    const braking = (opt.brake || 0) > 0.05;
    ctx.fillStyle = braking ? C.red : 'rgba(242,199,102,0.56)';
    ctx.fillRect(-29, -9, 3.5, 5);
    ctx.fillRect(-29, 4, 3.5, 5);

    if (drift > 0.5) {
      ctx.strokeStyle = `rgba(82,255,229,${0.18 + drift * 0.18})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-31, -12);
      ctx.lineTo(-44 - drift * 12, -17);
      ctx.moveTo(-31, 12);
      ctx.lineTo(-44 - drift * 12, 17);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/* ====================== GHOST INTERPOLATION ============================== */

class GhostBuffer {
  private buf: NetSnapshot[] = [];
  private offset = 0;
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

  get active() {
    return this.buf.length > 0;
  }

  clear() {
    this.buf = [];
  }
}

/* ================================== UI =================================== */

function fmtTime(ms: number) {
  if (ms <= 0 || !isFinite(ms)) return '--:--';

  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);

  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const STICK_R = 54;
const STICK_ZONE = 154;

export const RaceGame = forwardRef<DriftRaceHandle, DriftRaceProps>(
  ({ onSnapshot, selfGhost = true, topOffset = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const raf = useRef<number | null>(null);

    const track = useMemo(() => buildCenterline(), []);
    const center = track.pts;
    const total = track.length;

    const beacons = useMemo(() => buildBeacons(center), [center]);

    const startPose = useMemo(() => {
      const p = center[0];
      return {
        x: p.x,
        y: p.y,
        angle: Math.atan2(p.ty, p.tx),
      };
    }, [center]);

    const makeCar = useCallback(
      (): CarState => ({
        x: startPose.x,
        y: startPose.y,
        angle: startPose.angle,
        vx: 0,
        vy: 0,
        steer: 0,
        driftPower: 0,
        progress: 0,
        lap: 1,
        armed: false,
      }),
      [startPose],
    );

    const car = useRef<CarState>(makeCar());
    const input = useRef<InputState>({
      throttle: 0,
      brake: 0,
      steer: 0,
      drift: false,
    });

    const keys = useRef({
      up: false,
      down: false,
      left: false,
      right: false,
      drift: false,
    });

    const stick = useRef({
      active: false,
      id: -1,
      ix: 0,
      iy: 0,
      power: 0,
    });

    const startedRef = useRef(false);

    const particles = useRef<Particle[]>([]);
    const skids = useRef<Skid[]>([]);
    const popups = useRef<Popup[]>([]);
    const trail = useRef<Trail[]>([]);

    const cam = useRef({
      x: startPose.x,
      y: startPose.y,
      zoom: 1,
      sx: 0,
      sy: 0,
      shake: 0,
    });

    const vp = useRef({
      w: 0,
      h: 0,
      dpr: 1,
    });

    const acc = useRef(0);
    const lastT = useRef(0);
    const netT = useRef(0);
    const hudT = useRef(0);
    const trailT = useRef(0);

    const lapStart = useRef(performance.now());
    const bestLap = useRef<number>(Infinity);

    const combo = useRef({
      score: 0,
      ms: 0,
      idle: 0,
      banked: 0,
    });

    const ghostBuf = useRef(new GhostBuffer());

    const selfRec = useRef<
      {
        t: number;
        x: number;
        y: number;
        angle: number;
        drift: number;
      }[]
    >([]);

    const bestRec = useRef<typeof selfRec.current | null>(null);

    const [hud, setHud] = useState({
      speed: 0,
      lap: 1,
      drift: 0,
      combo: 0,
      banked: 0,
      lapTime: 0,
      best: Infinity,
    });

    const [started, setStarted] = useState(false);
    const [stickActive, setStickActive] = useState(false);

    const doReset = useCallback(() => {
      car.current = makeCar();
      particles.current = [];
      skids.current = [];
      popups.current = [];
      trail.current = [];

      cam.current = {
        x: startPose.x,
        y: startPose.y,
        zoom: 1,
        sx: 0,
        sy: 0,
        shake: 0,
      };

      combo.current = {
        score: 0,
        ms: 0,
        idle: 0,
        banked: 0,
      };

      selfRec.current = [];
      lapStart.current = performance.now();
      startedRef.current = false;
      setStarted(false);
      setStickActive(false);

      stick.current = {
        active: false,
        id: -1,
        ix: 0,
        iy: 0,
        power: 0,
      };

      if (knobRef.current) {
        knobRef.current.style.transform = 'translate(0px, 0px)';
      }
    }, [makeCar, startPose]);

    useImperativeHandle(ref, () => ({
      pushRemoteSnapshot: (s: NetSnapshot) => ghostBuf.current.push(s),
      reset: () => doReset(),
    }));

    useEffect(() => {
      const cv = canvasRef.current;
      const wr = wrapRef.current;

      if (!cv || !wr) return;

      const apply = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, wr.clientWidth);
        const h = Math.max(1, wr.clientHeight);

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

    useEffect(() => {
      try {
        const tg = (
          window as unknown as {
            Telegram?: {
              WebApp?: {
                expand?: () => void;
                disableVerticalSwipes?: () => void;
              };
            };
          }
        ).Telegram?.WebApp;

        tg?.expand?.();
        tg?.disableVerticalSwipes?.();
      } catch {
        /* outside Telegram */
      }
    }, []);

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

    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r'].includes(k)) {
          e.preventDefault();
        }

        if (k === 'arrowup' || k === 'w') keys.current.up = true;
        if (k === 'arrowdown' || k === 's') keys.current.down = true;
        if (k === 'arrowleft' || k === 'a') keys.current.left = true;
        if (k === 'arrowright' || k === 'd') keys.current.right = true;
        if (k === ' ') keys.current.drift = true;
        if (k === 'r') doReset();

        if (
          !startedRef.current &&
          (k === 'arrowup' ||
            k === 'w' ||
            k === 'arrowleft' ||
            k === 'arrowright' ||
            k === 'a' ||
            k === 'd')
        ) {
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

    useEffect(() => {
      const cv = canvasRef.current;

      if (!cv) return;

      const ctx = cv.getContext('2d', { alpha: false });

      if (!ctx) return;

      const loop = (now: number) => {
        const v = vp.current;
        const frameMs = lastT.current === 0 ? 16.7 : Math.min(now - lastT.current, 50);

        lastT.current = now;

        const i = input.current;
        const st = stick.current;
        const k = keys.current;

        const anyKey = k.up || k.down || k.left || k.right || k.drift;

        if (anyKey) {
          if (!startedRef.current) {
            startedRef.current = true;
            setStarted(true);
          }

          i.throttle = k.up || (!k.down && startedRef.current) ? 1 : 0;
          i.steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
          i.brake = k.down ? 0.65 : 0;
          i.drift = k.drift || k.down;
        } else if (st.active && st.power > 0.05) {
          i.steer = clamp(st.ix * 1.35, -1, 1);

          const pullDown = clamp((st.iy - 0.35) / 0.65, 0, 1);

          i.throttle = 1;
          i.brake = pullDown * 0.55;
          i.drift = pullDown > 0.18;
        } else {
          i.throttle = startedRef.current ? 1 : 0;
          i.steer = 0;
          i.brake = 0;
          i.drift = false;
        }

        acc.current += frameMs / 1000;

        let guard = 0;

        while (acc.current >= STEP && guard < 5) {
          const res = stepCar(car.current, i, center, total);

          acc.current -= STEP;
          guard += 1;

          const c = car.current;

          if (res.speed > 70 && c.driftPower > 0.18) {
            const rx = -Math.sin(c.angle);
            const ry = Math.cos(c.angle);
            const bx = c.x - Math.cos(c.angle) * 22;
            const by = c.y - Math.sin(c.angle) * 22;

            if (c.driftPower > 0.28) {
              skids.current.push(
                {
                  x1: bx - rx * 10,
                  y1: by - ry * 10,
                  x2: bx - rx * 10 - c.vx * 0.028,
                  y2: by - ry * 10 - c.vy * 0.028,
                  life: 0.95,
                  w: 4.5 + c.driftPower * 1.8,
                },
                {
                  x1: bx + rx * 10,
                  y1: by + ry * 10,
                  x2: bx + rx * 10 - c.vx * 0.028,
                  y2: by + ry * 10 - c.vy * 0.028,
                  life: 0.95,
                  w: 4.5 + c.driftPower * 1.8,
                },
              );
            }

            if (Math.random() > 0.58) {
              spawn(particles.current, bx, by, 'smoke', 1, c.angle, 0.45 + c.driftPower * 0.7);
            }

            if (Math.random() > 0.82) {
              spawn(particles.current, bx, by, 'glow', 1, c.angle, 0.5);
            }
          }

          if (res.surface === 'off' && res.speed > 70 && Math.random() > 0.62) {
            spawn(
              particles.current,
              c.x - Math.cos(c.angle) * 18,
              c.y - Math.sin(c.angle) * 18,
              'dust',
              1,
              c.angle,
              0.75,
            );
          }

          if (res.hardHit) {
            cam.current.shake = Math.max(cam.current.shake, 0.72);
            spawn(particles.current, c.x, c.y, 'spark', 4, c.angle, 1.15);
            combo.current.score = 0;
          }

          const cm = combo.current;

          if (c.driftPower > 0.34 && res.speed > 105) {
            cm.ms += STEP * 1000;
            cm.score += res.speed * c.driftPower * STEP * 0.65;
            cm.idle = 0;
          } else {
            cm.idle += STEP * 1000;

            if (cm.idle > 430 && cm.score > 28) {
              const mult = 1 + Math.floor(cm.ms / 1600);
              const gained = Math.round(cm.score * mult);

              cm.banked += gained;

              popups.current.push({
                x: c.x,
                y: c.y - 32,
                life: 1.08,
                text: `+${gained}${mult > 1 ? ` ×${mult}` : ''}`,
                big: mult > 1,
              });

              cm.score = 0;
              cm.ms = 0;
            }
          }

          const recT = now - lapStart.current;
          const rec = selfRec.current;

          if (rec.length === 0 || recT - rec[rec.length - 1].t > 40) {
            rec.push({
              t: recT,
              x: c.x,
              y: c.y,
              angle: c.angle,
              drift: c.driftPower,
            });
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

        if (onSnapshot && now - netT.current > 50) {
          netT.current = now;

          const c = car.current;

          onSnapshot({
            t: now,
            x: c.x,
            y: c.y,
            angle: c.angle,
            drift: c.driftPower,
            lap: c.lap,
          });
        }

        const c = car.current;
        const speed = Math.hypot(c.vx, c.vy);
        const cmr = cam.current;
        const dtSec = Math.min(frameMs / 1000, 0.05);

        const kPos = 1 - Math.exp(-dtSec / 0.16);

        cmr.x = lerp(cmr.x, c.x + c.vx * 0.24, kPos);
        cmr.y = lerp(cmr.y, c.y + c.vy * 0.24, kPos);

        const targetZoom = 1.05 - clamp(speed / TUNE.maxSpeed, 0, 1) * 0.13;
        cmr.zoom = lerp(cmr.zoom, targetZoom, 1 - Math.exp(-dtSec / 0.44));

        cmr.shake = Math.max(0, cmr.shake - dtSec * 3);
        cmr.sx = (Math.random() - 0.5) * cmr.shake * 10;
        cmr.sy = (Math.random() - 0.5) * cmr.shake * 10;

        if (now - trailT.current > 42 && speed > 75) {
          trailT.current = now;

          trail.current.push({
            x: c.x,
            y: c.y,
            angle: c.angle,
            life: 1,
            drift: c.driftPower,
          });
        }

        const dt = frameMs / 1000;

        ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, v.w, v.h);

        ctx.save();

        ctx.translate(v.w / 2 + cmr.sx, v.h / 2 + cmr.sy);
        ctx.scale(cmr.zoom, cmr.zoom);
        ctx.translate(-cmr.x, -cmr.y);

        drawGround(ctx, cmr.x, cmr.y, v.w, v.h, cmr.zoom, now);
        drawTrack(ctx, center, now);
        drawSkids(ctx, skids.current, dt);
        drawDirectionArrows(ctx, center, now);
        drawFinish(ctx, center, now);

        for (const b of beacons) {
          if (Math.abs(b.x - cmr.x) < 850 && Math.abs(b.y - cmr.y) < 850) {
            drawBeacon(ctx, b, now);
          }
        }

        drawTrail(ctx, trail.current, dt);
        drawParticles(ctx, particles.current, dt);

        if (ghostBuf.current.active) {
          const g = ghostBuf.current.sample(now);

          if (g) {
            drawCar(ctx, g.x, g.y, g.angle, {
              ghost: true,
              drift: g.drift,
            });

            if (g.drift > 0.38 && Math.random() > 0.76) {
              spawn(particles.current, g.x, g.y, 'smoke', 1, g.angle, 0.4);
            }
          }
        } else if (selfGhost && bestRec.current && bestRec.current.length > 1) {
          const rec = bestRec.current;
          const tt = now - lapStart.current;

          if (tt <= rec[rec.length - 1].t) {
            let lo = 0;
            let hi = rec.length - 1;

            while (lo < hi - 1) {
              const mid = (lo + hi) >> 1;
              if (rec[mid].t < tt) lo = mid;
              else hi = mid;
            }

            const a = rec[lo];
            const b = rec[hi];
            const kRec = (tt - a.t) / (b.t - a.t || 1);

            drawCar(ctx, lerp(a.x, b.x, kRec), lerp(a.y, b.y, kRec), a.angle + angleDiff(b.angle, a.angle) * kRec, {
              ghost: true,
              drift: lerp(a.drift, b.drift, kRec),
            });
          }
        }

        drawCar(ctx, c.x, c.y, c.angle, {
          steer: c.steer,
          brake: i.brake,
          drift: c.driftPower,
          speed,
        });

        for (let p = popups.current.length - 1; p >= 0; p -= 1) {
          const pop = popups.current[p];

          ctx.save();
          ctx.globalAlpha = clamp(pop.life, 0, 1);
          ctx.fillStyle = pop.big ? C.gold : 'rgba(242,199,102,0.86)';
          ctx.font = `800 ${pop.big ? 26 : 19}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(pop.text, pop.x, pop.y);
          ctx.restore();

          pop.y -= 36 * dt;
          pop.life -= dt;

          if (pop.life <= 0) popups.current.splice(p, 1);
        }

        ctx.restore();

        const vg = ctx.createRadialGradient(
          v.w / 2,
          v.h / 2,
          Math.min(v.w, v.h) * 0.28,
          v.w / 2,
          v.h / 2,
          Math.max(v.w, v.h) * 0.76,
        );

        vg.addColorStop(0, 'rgba(5,6,16,0)');
        vg.addColorStop(1, 'rgba(5,6,16,0.5)');

        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, v.w, v.h);

        drawMini(ctx, center, c, v.w, ghostBuf.current);

        if (now - hudT.current > 95) {
          hudT.current = now;

          setHud({
            speed: Math.round(speed * 0.45),
            lap: c.lap,
            drift: c.driftPower,
            combo: Math.round(combo.current.score * (1 + Math.floor(combo.current.ms / 1600))),
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
    }, [beacons, center, onSnapshot, selfGhost, total]);

    const setKnob = (kx: number, ky: number) => {
      if (knobRef.current) {
        knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
      }
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
        /* best effort */
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

      stick.current = {
        active: false,
        id: -1,
        ix: 0,
        iy: 0,
        power: 0,
      };

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
        className="relative h-full min-h-0 w-full select-none overflow-hidden overscroll-none bg-[#050610] font-mono text-white"
        style={{
          height: `min(100%, calc(100dvh - ${topOffset}px))`,
          maxHeight: `calc(100dvh - ${topOffset}px)`,
          minHeight: 320,
          touchAction: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none' }} />

        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <div className="flex items-center divide-x divide-white/[0.07] overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#050610]/65 shadow-[0_14px_40px_rgba(0,0,0,0.4)] backdrop-blur-md">
            <div className="px-3 py-1.5 text-center">
              <div className="text-lg font-extrabold leading-none tabular-nums text-white">
                {hud.speed}
                <span className="ml-0.5 align-top text-[8px] font-semibold text-white/40">км/ч</span>
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">круг</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-[#52FFE5]">
                {hud.lap}/{TOTAL_LAPS}
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">время</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-white">
                {fmtTime(hud.lapTime)}
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">очки</div>
              <div className="text-sm font-extrabold leading-none tabular-nums text-[#F2C766]">
                {hud.banked}
              </div>
            </div>
          </div>
        </div>

        {isFinite(hud.best) && (
          <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full border border-white/[0.07] bg-[#050610]/55 px-3 py-0.5 text-[10px] tabular-nums text-[#9D7CFF] backdrop-blur-md">
            лучший {fmtTime(hud.best)}
          </div>
        )}

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
                stickActive ? 'border-[#52FFE5]/45 shadow-[0_0_28px_rgba(82,255,229,0.12)]' : 'border-white/[0.10]'
              }`}
              style={{ width: STICK_R * 2 + 18, height: STICK_R * 2 + 18 }}
            >
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-white/25">
                занос ↓
              </div>

              <div
                ref={knobRef}
                className={`absolute left-1/2 top-1/2 rounded-full border shadow-xl transition-colors ${
                  stickActive
                    ? 'border-[#52FFE5]/60 bg-gradient-to-br from-[#52FFE5]/90 to-[#167a70]'
                    : 'border-white/20 bg-gradient-to-br from-white/80 to-white/40'
                }`}
                style={{
                  width: 48,
                  height: 48,
                  margin: -24,
                  willChange: 'transform',
                }}
              />
            </div>
          </div>
        </div>

        {!started && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="mx-6 rounded-[22px] border border-white/[0.07] bg-[#050610]/72 px-5 py-4 text-center shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="text-sm font-bold text-white">Коснись стика — поехали</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/50">
                Газ автоматический. Машина всегда слегка дрифтит.{' '}
                <span className="text-[#52FFE5]">Рули дугой</span>,{' '}
                <span className="text-[#F2C766]">тяни вниз — ручник</span>.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

RaceGame.displayName = 'RaceGame';

/* =============================== MINIMAP ================================= */

function drawMini(ctx: CanvasRenderingContext2D, center: CenterPt[], car: CarState, width: number, ghost: GhostBuffer) {
  const size = 78;
  const x = width - size - 12;
  const y = 64;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

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

  ctx.fillStyle = 'rgba(5,6,16,0.58)';
  rr(ctx, x, y, size, size, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(82,255,229,0.5)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';

  ctx.beginPath();

  center.forEach((p, i) => {
    if (i === 0) ctx.moveTo(mx(p.x), my(p.y));
    else ctx.lineTo(mx(p.x), my(p.y));
  });

  ctx.closePath();
  ctx.stroke();

  if (ghost.active) {
    const g = ghost.sample(performance.now());

    if (g) {
      ctx.fillStyle = C.purple;
      ctx.beginPath();
      ctx.arc(mx(g.x), my(g.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(mx(car.x), my(car.y), 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default RaceGame;