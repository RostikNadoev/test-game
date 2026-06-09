import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

/* ============================================================================
 * RaceGame.tsx — TwinGames arcade drift racer
 * ----------------------------------------------------------------------------
 * Physics now follows the reference feel:
 * - joystick points where the car wants to go;
 * - car compares joystick angle with current heading;
 * - sharp direction changes reduce speed;
 * - actual velocity lags behind heading via driftFactor;
 * - result: constant smooth arcade drift, easy and pleasant.
 *
 * Public API preserved for future online mode:
 * - NetSnapshot
 * - DriftRaceHandle
 * - onSnapshot
 * - pushRemoteSnapshot
 * - reset
 * ========================================================================== */

type Vec = { x: number; y: number };

type Surface = 'road' | 'curb' | 'off';

type CenterPt = Vec & {
  tx: number;
  ty: number;
  dist: number;
};

type TrackHit = {
  d: number;
  nx: number;
  ny: number;
  progress: number;
  surface: Surface;
};

type DecorType =
  | 'tree'
  | 'bush'
  | 'stand'
  | 'light'
  | 'tent'
  | 'ads'
  | 'bench'
  | 'yacht'
  | 'tires'
  | 'cone'
  | 'gate';

type Decor = {
  x: number;
  y: number;
  type: DecorType;
  size: number;
  angle: number;
  detail: number;
};

type ParticleKind = 'smoke' | 'spark' | 'dust' | 'glow';

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
  width: number;
};

type Trail = {
  x: number;
  y: number;
  angle: number;
  life: number;
  drift: number;
};

type Popup = {
  x: number;
  y: number;
  life: number;
  text: string;
  big: boolean;
};

type CarState = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  vx: number;
  vy: number;
  driftPower: number;
  progress: number;
  lap: number;
  armed: boolean;
};

type InputState = {
  active: boolean;
  aimX: number;
  aimY: number;
  brake: number;
  drift: boolean;
};

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

const COLORS = {
  bg: '#050610',
  road: '#121521',
  road2: '#191f31',
  road3: '#20283c',
  cyan: '#52FFE5',
  cyanSoft: 'rgba(82,255,229,0.14)',
  cyanDim: 'rgba(82,255,229,0.55)',
  gold: '#F2C766',
  purple: '#9D7CFF',
  red: '#FF6B8A',
  grass: '#08130e',
  grass2: '#0d2118',
  water: '#061a2b',
} as const;

const STEP = 1 / 60;
const TOTAL_LAPS = 5;

const ROAD_WIDTH = 155;
const ROAD_HALF = ROAD_WIDTH / 2;
const CURB_WIDTH = 16;
const RUNOFF = 70;
const WALL = ROAD_HALF + CURB_WIDTH + RUNOFF;

const PHYSICS = {
  maxSpeed: 540,
  accel: 820,
  idleAccel: 300,
  friction: 0.985,
  driftFactor: 0.958,
  driftFactorHard: 0.972,
  turnSpeed: 0.085,
  wallFriction: 0.45,
  turnResistance: 0.95,
  brakePower: 760,
  offroadDrag: 0.72,
  curbDrag: 0.9,
};

const VISUAL = {
  curbLen: 28,
  joystickRadius: 54,
  joystickZone: 154,
};

const TRACK_NODES: Vec[] = [
  { x: 400, y: 800 },
  { x: 1800, y: 800 },
  { x: 2400, y: 1400 },
  { x: 3400, y: 1400 },
  { x: 3800, y: 1900 },
  { x: 3200, y: 2400 },
  { x: 4200, y: 2800 },
  { x: 5500, y: 2200 },
  { x: 6000, y: 800 },
  { x: 6200, y: 0 },
  { x: 5500, y: -600 },
  { x: 6500, y: -1000 },
  { x: 5000, y: -2000 },
  { x: 3500, y: -1800 },
  { x: 2500, y: -2500 },
  { x: 1000, y: -2000 },
  { x: 200, y: -1000 },
  { x: -800, y: -1500 },
  { x: -1500, y: -500 },
  { x: -800, y: 800 },
  { x: 0, y: 800 },
];

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

function chaikin(nodes: Vec[], passes = 3): Vec[] {
  let pts = [...nodes];

  for (let pass = 0; pass < passes; pass += 1) {
    const next: Vec[] = [];

    for (let i = 0; i < pts.length; i += 1) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];

      next.push(
        {
          x: p1.x * 0.75 + p2.x * 0.25,
          y: p1.y * 0.75 + p2.y * 0.25,
        },
        {
          x: p1.x * 0.25 + p2.x * 0.75,
          y: p1.y * 0.25 + p2.y * 0.75,
        },
      );
    }

    pts = next;
  }

  return pts;
}

function buildTrack(): { center: CenterPt[]; total: number } {
  const raw = chaikin(TRACK_NODES, 3);
  const center: CenterPt[] = [];
  let total = 0;

  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;

    center.push({
      x: a.x,
      y: a.y,
      tx: dx / len,
      ty: dy / len,
      dist: total,
    });

    total += len;
  }

  return { center, total };
}

function queryTrack(center: CenterPt[], total: number, x: number, y: number): TrackHit {
  let best: TrackHit = {
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

  if (best.d < ROAD_HALF) best.surface = 'road';
  else if (best.d < ROAD_HALF + CURB_WIDTH) best.surface = 'curb';

  return best;
}

function buildDecor(center: CenterPt[], total: number): Decor[] {
  const rnd = seeded(202607);
  const items: Decor[] = [];

  const isTooCloseToTrack = (x: number, y: number, safe: number) => {
    return queryTrack(center, total, x, y).d < safe;
  };

  const isColliding = (x: number, y: number, minSpace: number) => {
    return items.some((item) => Math.hypot(item.x - x, item.y - y) < minSpace);
  };

  const addDecor = (
    x: number,
    y: number,
    type: DecorType,
    size: number,
    angle = 0,
    minSpace = 55,
    safe = ROAD_HALF + 28,
  ) => {
    if (!isTooCloseToTrack(x, y, safe) && !isColliding(x, y, minSpace)) {
      items.push({
        x,
        y,
        type,
        size,
        angle,
        detail: rnd(),
      });
    }
  };

  center.forEach((p, i) => {
    if (i % 2 !== 0) return;

    const side = i % 4 === 0 ? 1 : -1;
    const nx = -p.ty;
    const ny = p.tx;

    if (i % 4 === 0) {
      addDecor(
        p.x + nx * side * (ROAD_HALF + 20),
        p.y + ny * side * (ROAD_HALF + 20),
        'cone',
        11,
        0,
        34,
        ROAD_HALF + 8,
      );
    }

    if (i % 8 === 0) {
      addDecor(
        p.x + nx * side * 105,
        p.y + ny * side * 105,
        'light',
        12,
        0,
        80,
        ROAD_HALF + 22,
      );
    }

    if (i % 10 === 0) {
      addDecor(
        p.x + nx * side * 118,
        p.y + ny * side * 118,
        'ads',
        70,
        Math.atan2(p.ty, p.tx) + Math.PI / 2,
        105,
      );
    }

    if (i % 14 === 0) {
      addDecor(
        p.x - nx * side * 132,
        p.y - ny * side * 132,
        'bench',
        28,
        Math.atan2(p.ty, p.tx) + Math.PI / 2,
        64,
      );
    }

    if (i % 18 === 0) {
      addDecor(
        p.x + nx * side * 165,
        p.y + ny * side * 165,
        'tent',
        44,
        Math.atan2(p.ty, p.tx),
        130,
      );
    }

    if (i % 22 === 0) {
      addDecor(
        p.x - nx * side * 150,
        p.y - ny * side * 150,
        'stand',
        100,
        Math.atan2(p.ty, p.tx) + (side > 0 ? 0 : Math.PI),
        170,
      );
    }

    if (i % 16 === 0) {
      addDecor(
        p.x + nx * side * 118,
        p.y + ny * side * 118,
        'tires',
        32,
        Math.atan2(p.ty, p.tx),
        72,
      );
    }

    if (i % 26 === 0) {
      addDecor(
        p.x + nx * side * (ROAD_HALF + 18),
        p.y + ny * side * (ROAD_HALF + 18),
        'gate',
        70,
        Math.atan2(p.ty, p.tx),
        180,
        ROAD_HALF + 12,
      );
    }

    for (let j = 0; j < 3; j += 1) {
      const dist = 190 + rnd() * 340;
      const s = rnd() > 0.5 ? 1 : -1;
      const ox = p.x + nx * dist * s + (rnd() - 0.5) * 80;
      const oy = p.y + ny * dist * s + (rnd() - 0.5) * 80;
      const type: DecorType = rnd() > 0.42 ? 'tree' : 'bush';

      addDecor(ox, oy, type, 24 + rnd() * 40, rnd() * Math.PI * 2, 55, ROAD_HALF + 95);
    }
  });

  for (let k = 0; k < 13; k += 1) {
    addDecor(
      2780 + rnd() * 420,
      1500 + k * 210,
      'yacht',
      64 + rnd() * 18,
      -0.15 + rnd() * 0.35,
      150,
      0,
    );
  }

  return items;
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  zoom: number,
  now: number,
) {
  const halfW = width / zoom / 2 + 500;
  const halfH = height / zoom / 2 + 500;

  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const grassGlow = ctx.createRadialGradient(cx - 500, cy - 400, 0, cx - 500, cy - 400, 1400);
  grassGlow.addColorStop(0, 'rgba(82,255,229,0.035)');
  grassGlow.addColorStop(1, 'rgba(82,255,229,0)');
  ctx.fillStyle = grassGlow;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const gridStep = 260;
  ctx.strokeStyle = `rgba(157,124,255,${0.028 + Math.sin(now * 0.0016) * 0.01})`;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();

  for (let x = Math.floor((cx - halfW) / gridStep) * gridStep; x < cx + halfW; x += gridStep) {
    ctx.moveTo(x, cy - halfH);
    ctx.lineTo(x, cy + halfH);
  }

  for (let y = Math.floor((cy - halfH) / gridStep) * gridStep; y < cy + halfH; y += gridStep) {
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx + halfW, y);
  }

  ctx.stroke();

  ctx.fillStyle = '#16120b';
  ctx.fillRect(2450, -3100, 760, 8500);

  const waterGrad = ctx.createLinearGradient(2550, -3000, 3150, 3000);
  waterGrad.addColorStop(0, '#061222');
  waterGrad.addColorStop(0.5, COLORS.water);
  waterGrad.addColorStop(1, '#082437');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(2550, -3100, 620, 8500);

  ctx.strokeStyle = 'rgba(82,255,229,0.10)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(2550, -3100);
  ctx.lineTo(2550, 5400);
  ctx.stroke();

  ctx.fillStyle = '#182130';
  ctx.fillRect(2280, 1300, 920, 190);

  ctx.fillStyle = 'rgba(242,199,102,0.07)';
  for (let i = 0; i < 20; i += 1) {
    const y = -2600 + i * 360 + Math.sin(now * 0.001 + i) * 12;
    ctx.fillRect(2600, y, 420, 2);
  }
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

function drawCurbs(ctx: CanvasRenderingContext2D, center: CenterPt[], side: 1 | -1, now: number) {
  let dash = 0;

  for (let i = 0; i < center.length; i += 1) {
    const p1 = center[i];
    const p2 = center[(i + 1) % center.length];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;

    const nx = (-dy / len) * side * (ROAD_HALF + CURB_WIDTH / 2);
    const ny = (dx / len) * side * (ROAD_HALF + CURB_WIDTH / 2);

    ctx.lineWidth = CURB_WIDTH;
    ctx.lineCap = 'butt';

    for (let l = 0; l < len; l += VISUAL.curbLen) {
      const k1 = l / len;
      const k2 = Math.min(l + VISUAL.curbLen, len) / len;

      const odd = dash % 2 === 0;
      const pulse = 0.42 + Math.sin(now * 0.004 + dash * 0.2) * 0.08;

      ctx.strokeStyle = odd ? `rgba(82,255,229,${pulse})` : `rgba(157,124,255,${pulse})`;

      ctx.beginPath();
      ctx.moveTo(p1.x + dx * k1 + nx, p1.y + dy * k1 + ny);
      ctx.lineTo(p1.x + dx * k2 + nx, p1.y + dy * k2 + ny);
      ctx.stroke();

      dash += 1;
    }
  }
}

function drawTrack(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + 52, 'rgba(82,255,229,0.045)');
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + 30, 'rgba(157,124,255,0.035)');

  drawCurbs(ctx, center, 1, now);
  drawCurbs(ctx, center, -1, now);

  strokeLoop(ctx, center, ROAD_WIDTH + 4, '#070910');
  strokeLoop(ctx, center, ROAD_WIDTH, COLORS.road);
  strokeLoop(ctx, center, ROAD_WIDTH - 26, COLORS.road2);
  strokeLoop(ctx, center, ROAD_WIDTH - 54, COLORS.road3);

  strokeLoop(ctx, center, 4, 'rgba(255,255,255,0.08)', [40, 54]);
  strokeLoop(ctx, center, 2, 'rgba(82,255,229,0.20)', [16, 90]);
}

function drawDirectionArrows(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  for (let i = 8; i < center.length; i += 18) {
    const p = center[i];
    const a = Math.atan2(p.ty, p.tx);
    const alpha = 0.27 + Math.sin(now * 0.004 + i * 0.2) * 0.1;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);

    ctx.strokeStyle = `rgba(82,255,229,${alpha})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-18, -18);
    ctx.lineTo(10, 0);
    ctx.lineTo(-18, 18);
    ctx.stroke();

    ctx.strokeStyle = `rgba(242,199,102,${alpha * 0.42})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-36, -15);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-36, 15);
    ctx.stroke();

    ctx.restore();
  }
}

function drawFinish(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  const p = center[0];

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.ty, p.tx));

  const cell = 15;

  for (let r = 0; r < 2; r += 1) {
    for (let col = -5; col < 6; col += 1) {
      ctx.fillStyle = (r + col) % 2 === 0 ? 'rgba(255,255,255,0.86)' : 'rgba(5,6,16,0.95)';
      ctx.fillRect(r * cell - cell, col * cell, cell, cell);
    }
  }

  const pulse = 0.45 + Math.sin(now * 0.005) * 0.18;
  ctx.fillStyle = `rgba(242,199,102,${pulse})`;
  ctx.fillRect(-ROAD_HALF - CURB_WIDTH, -4, 22, 8);
  ctx.fillRect(ROAD_HALF - 6, -4, 22, 8);

  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, decor: Decor, car: CarState, now: number) {
  if (Math.hypot(car.x - decor.x, car.y - decor.y) > 1450) return;

  ctx.save();
  ctx.translate(decor.x, decor.y);
  ctx.rotate(decor.angle);

  if (decor.type === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(8, 10, decor.size * 0.72, decor.size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a2414';
    rr(ctx, -decor.size * 0.08, -decor.size * 0.04, decor.size * 0.16, decor.size * 0.42, 4);
    ctx.fill();

    const g = ctx.createRadialGradient(-decor.size * 0.15, -decor.size * 0.28, 2, 0, -decor.size * 0.18, decor.size);
    g.addColorStop(0, '#276b3b');
    g.addColorStop(0.55, '#144d2d');
    g.addColorStop(1, '#0a2418');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -decor.size * 0.24, decor.size * 0.56, 0, Math.PI * 2);
    ctx.arc(-decor.size * 0.3, -decor.size * 0.02, decor.size * 0.36, 0, Math.PI * 2);
    ctx.arc(decor.size * 0.28, 0, decor.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (decor.type === 'bush') {
    ctx.fillStyle = 'rgba(82,255,229,0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, decor.size * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#123822';
    ctx.beginPath();
    ctx.arc(0, 0, decor.size * 0.48, 0, Math.PI * 2);
    ctx.arc(-decor.size * 0.24, decor.size * 0.1, decor.size * 0.34, 0, Math.PI * 2);
    ctx.arc(decor.size * 0.25, decor.size * 0.1, decor.size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  if (decor.type === 'stand') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, -70, -31, 140, 62, 12);
    ctx.fill();

    ctx.fillStyle = '#172033';
    rr(ctx, -64, -28, 128, 56, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(82,255,229,0.22)';
    ctx.lineWidth = 2;
    rr(ctx, -64, -28, 128, 56, 10);
    ctx.stroke();

    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < 12; i += 1) {
        const hue = (i * 35 + r * 80 + now * 0.02) % 360;
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.75)`;
        ctx.fillRect(-52 + i * 9, -17 + r * 13 + Math.sin(now / 150 + i) * 2, 5, 5);
      }
    }
  }

  if (decor.type === 'light') {
    const col = decor.detail > 0.45 ? COLORS.cyan : COLORS.gold;

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 78);
    g.addColorStop(0, decor.detail > 0.45 ? 'rgba(82,255,229,0.20)' : 'rgba(242,199,102,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 78, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -44);
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -46, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (decor.type === 'ads') {
    ctx.fillStyle = '#090d18';
    rr(ctx, -48, -12, 96, 24, 6);
    ctx.fill();

    ctx.strokeStyle = decor.detail > 0.5 ? COLORS.cyan : COLORS.purple;
    ctx.lineWidth = 2;
    rr(ctx, -48, -12, 96, 24, 6);
    ctx.stroke();

    ctx.fillStyle = decor.detail > 0.5 ? COLORS.cyan : COLORS.gold;
    ctx.font = '900 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(decor.detail > 0.5 ? 'TWIN RACE' : 'NEON CUP', 0, 4);
  }

  if (decor.type === 'tent') {
    const col = decor.detail > 0.5 ? COLORS.purple : COLORS.gold;

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(3, 14, 34, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = decor.detail > 0.5 ? '#261b42' : '#3b2a12';
    ctx.beginPath();
    ctx.moveTo(-28, 22);
    ctx.lineTo(0, -24);
    ctx.lineTo(28, 22);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (decor.type === 'bench') {
    ctx.fillStyle = '#273244';
    rr(ctx, -18, -7, 36, 14, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
  }

  if (decor.type === 'yacht') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 14, decor.size * 0.85, decor.size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.moveTo(-decor.size, 0);
    ctx.lineTo(decor.size * 0.78, -decor.size * 0.32);
    ctx.lineTo(decor.size, 0);
    ctx.lineTo(decor.size * 0.78, decor.size * 0.32);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1d8fd0';
    rr(ctx, decor.size * 0.12, -decor.size * 0.14, decor.size * 0.42, decor.size * 0.28, 5);
    ctx.fill();

    ctx.strokeStyle = 'rgba(82,255,229,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-decor.size * 0.8, decor.size * 0.45);
    ctx.lineTo(decor.size * 0.9, decor.size * 0.45);
    ctx.stroke();
  }

  if (decor.type === 'tires') {
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#070a12' : '#141a26';
      ctx.beginPath();
      ctx.arc((i - 1.5) * decor.size * 0.36, 0, decor.size * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (decor.type === 'cone') {
    ctx.fillStyle = 'rgba(242,199,102,0.10)';
    ctx.beginPath();
    ctx.arc(0, 0, decor.size * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(0, 0, decor.size * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.arc(0, 0, decor.size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (decor.type === 'gate') {
    ctx.strokeStyle = decor.detail > 0.5 ? 'rgba(82,255,229,0.45)' : 'rgba(157,124,255,0.42)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-decor.size * 0.55, -28);
    ctx.lineTo(-decor.size * 0.55, 28);
    ctx.moveTo(decor.size * 0.55, -28);
    ctx.lineTo(decor.size * 0.55, 28);
    ctx.stroke();

    ctx.fillStyle = decor.detail > 0.5 ? COLORS.cyan : COLORS.purple;
    ctx.beginPath();
    ctx.arc(-decor.size * 0.55, -30, 5, 0, Math.PI * 2);
    ctx.arc(decor.size * 0.55, -30, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const k = clamp(p.life / p.max, 0, 1);

    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(170,190,205,${0.12 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.7 - k * 0.42), 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(242,199,102,${0.85 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      ctx.stroke();
    }

    if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(90,100,130,${0.18 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.kind === 'glow') {
      ctx.fillStyle = `rgba(82,255,229,${0.12 * k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.2 + (1 - k)), 0, Math.PI * 2);
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

function spawnParticle(
  list: Particle[],
  x: number,
  y: number,
  kind: ParticleKind,
  count: number,
  angle: number,
  power: number,
) {
  if (list.length > 180) list.splice(0, list.length - 150);

  for (let i = 0; i < count; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.8;
    const sp = (20 + Math.random() * 90) * power;
    const max =
      kind === 'spark'
        ? 0.18 + Math.random() * 0.16
        : kind === 'glow'
          ? 0.25 + Math.random() * 0.25
          : 0.44 + Math.random() * 0.5;

    list.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      size: 2 + Math.random() * (kind === 'smoke' ? 8 : 4),
      kind,
    });
  }
}

function drawSkids(ctx: CanvasRenderingContext2D, list: Skid[], dt: number) {
  ctx.lineCap = 'round';

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const skid = list[i];

    ctx.strokeStyle = `rgba(0,0,0,${0.28 * skid.life})`;
    ctx.lineWidth = skid.width;

    ctx.beginPath();
    ctx.moveTo(skid.x1, skid.y1);
    ctx.lineTo(skid.x2, skid.y2);
    ctx.stroke();

    skid.life -= dt * 0.18;

    if (skid.life <= 0) list.splice(i, 1);
  }

  if (list.length > 280) list.splice(0, list.length - 280);
}

function drawTrail(ctx: CanvasRenderingContext2D, list: Trail[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const tr = list[i];

    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.angle);

    ctx.globalAlpha = tr.life * (0.14 + tr.drift * 0.22);
    ctx.fillStyle = tr.drift > 0.55 ? 'rgba(82,255,229,0.24)' : 'rgba(157,124,255,0.16)';

    ctx.beginPath();
    ctx.ellipse(-10, 0, 36, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    tr.life -= dt * 2.25;

    if (tr.life <= 0) list.splice(i, 1);
  }

  if (list.length > 20) list.splice(0, list.length - 20);
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  opt: {
    ghost?: boolean;
    drift?: number;
    brake?: number;
  },
) {
  const ghost = Boolean(opt.ghost);
  const drift = opt.drift || 0;
  const accent = ghost ? COLORS.purple : COLORS.cyan;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (ghost) ctx.globalAlpha = 0.42;

  ctx.fillStyle = ghost
    ? `rgba(157,124,255,${0.1 + drift * 0.18})`
    : `rgba(82,255,229,${0.12 + drift * 0.28})`;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 42 + drift * 8, 22 + drift * 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const wheel = (wx: number, wy: number) => {
    ctx.fillStyle = '#050811';
    rr(ctx, wx - 7, wy - 5, 14, 10, 3);
    ctx.fill();
  };

  wheel(-15, -13);
  wheel(-15, 13);
  wheel(17, -13);
  wheel(17, 13);

  ctx.fillStyle = ghost ? '#17112e' : '#090d1a';
  rr(ctx, -28, -14, 58, 28, 10);
  ctx.fill();

  const body = ctx.createLinearGradient(-28, -14, 30, 14);
  body.addColorStop(0, ghost ? 'rgba(157,124,255,0.20)' : 'rgba(82,255,229,0.20)');
  body.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  body.addColorStop(1, ghost ? 'rgba(157,124,255,0.42)' : 'rgba(82,255,229,0.40)');

  ctx.fillStyle = body;
  rr(ctx, -25, -12, 53, 24, 9);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.7;
  rr(ctx, -28, -14, 58, 28, 10);
  ctx.stroke();

  ctx.fillStyle = ghost ? 'rgba(157,124,255,0.35)' : 'rgba(82,255,229,0.30)';
  rr(ctx, -3, -8, 16, 16, 5);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.fillRect(21, -10, 3.5, 20);

  if (!ghost) {
    ctx.fillStyle = '#eafffb';
    ctx.fillRect(27, -9, 4, 5);
    ctx.fillRect(27, 4, 4, 5);

    const braking = (opt.brake || 0) > 0.05;
    ctx.fillStyle = braking ? COLORS.red : 'rgba(242,199,102,0.56)';
    ctx.fillRect(-30, -9, 4, 5);
    ctx.fillRect(-30, 4, 4, 5);

    if (drift > 0.5) {
      ctx.strokeStyle = `rgba(82,255,229,${0.14 + drift * 0.22})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-31, -12);
      ctx.lineTo(-45 - drift * 14, -17);
      ctx.moveTo(-31, 12);
      ctx.lineTo(-45 - drift * 14, 17);
      ctx.stroke();
    }
  }

  ctx.restore();
}

class GhostBuffer {
  private buf: NetSnapshot[] = [];
  private offset = 0;
  private delay = 100;

  push(snapshot: NetSnapshot) {
    const localNow = performance.now();

    if (this.buf.length === 0) {
      this.offset = localNow - snapshot.t;
    }

    this.buf.push(snapshot);

    if (this.buf.length > 40) {
      this.buf.shift();
    }
  }

  sample(localNow: number): { x: number; y: number; angle: number; drift: number } | null {
    if (this.buf.length < 2) {
      return this.buf[0] ? { ...this.buf[0] } : null;
    }

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

function fmtTime(ms: number) {
  if (ms <= 0 || !Number.isFinite(ms)) return '--:--';

  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);

  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function stepCar(
  car: CarState,
  input: InputState,
  center: CenterPt[],
  total: number,
): {
  speed: number;
  drift: number;
  surface: Surface;
  hardHit: boolean;
  crossedFinish: boolean;
} {
  const beforeHit = queryTrack(center, total, car.x, car.y);
  const surface = beforeHit.surface;

  const prevProgress = car.progress;

  if (input.active) {
    const stickAngle = Math.atan2(input.aimY, input.aimX);
    const diff = angleDiff(stickAngle, car.angle);
    const absDiff = Math.abs(diff);

    const turnPenalty = clamp(1 - absDiff * (1 - PHYSICS.turnResistance), 0.76, 1);
    car.speed *= Math.pow(turnPenalty, STEP * 60);

    if (absDiff < Math.PI / 1.45) {
      const push = PHYSICS.accel * (1 - absDiff * 0.18);
      car.speed += push * STEP;
    } else {
      car.speed *= Math.pow(0.945, STEP * 60);
    }

    if (input.drift) {
      car.speed *= Math.pow(0.965, STEP * 60);
    }

    car.speed -= input.brake * PHYSICS.brakePower * STEP;

    const speedAuthority = Math.min(Math.abs(car.speed) / 155, 1);
    const turnBoost = input.drift ? 1.22 : 1;

    car.angle += diff * PHYSICS.turnSpeed * speedAuthority * turnBoost * STEP * 60;
  } else {
    car.speed += PHYSICS.idleAccel * STEP * 0.3;
  }

  if (surface === 'curb') {
    car.speed *= Math.pow(PHYSICS.curbDrag, STEP * 60);
  }

  if (surface === 'off') {
    car.speed *= Math.pow(PHYSICS.offroadDrag, STEP * 60);
  }

  car.speed *= Math.pow(PHYSICS.friction, STEP * 60);
  car.speed = clamp(car.speed, 0, PHYSICS.maxSpeed);

  const targetVX = Math.cos(car.angle) * car.speed;
  const targetVY = Math.sin(car.angle) * car.speed;

  const turnLoad = input.active ? Math.abs(angleDiff(Math.atan2(input.aimY, input.aimX), car.angle)) : 0;
  const driftFactor = input.drift || turnLoad > 0.55 ? PHYSICS.driftFactorHard : PHYSICS.driftFactor;
  const factor = Math.pow(driftFactor, STEP * 60);

  car.vx = car.vx * factor + targetVX * (1 - factor);
  car.vy = car.vy * factor + targetVY * (1 - factor);

  let nx = car.x + car.vx * STEP;
  let ny = car.y + car.vy * STEP;

  let hardHit = false;
  const nextHit = queryTrack(center, total, nx, ny);

  if (nextHit.d > WALL) {
    const pen = nextHit.d - WALL;

    nx -= nextHit.nx * pen;
    ny -= nextHit.ny * pen;

    car.vx *= PHYSICS.wallFriction;
    car.vy *= PHYSICS.wallFriction;
    car.speed *= PHYSICS.wallFriction;

    if (Math.hypot(car.vx, car.vy) > 120) {
      hardHit = true;
    }
  }

  car.x = nx;
  car.y = ny;

  const speed = Math.hypot(car.vx, car.vy);
  const moveAngle = speed > 8 ? Math.atan2(car.vy, car.vx) : car.angle;
  const slip = speed > 35 ? Math.abs(angleDiff(moveAngle, car.angle)) : 0;

  const driftVisual = clamp(slip / 0.65 + (input.drift ? 0.22 : 0), 0, 1);
  car.driftPower = lerp(car.driftPower, driftVisual * smooth(60, 230, speed), 0.18);

  const afterHit = queryTrack(center, total, car.x, car.y);
  car.progress = afterHit.progress;

  let crossedFinish = false;

  if (car.progress > 0.45 && car.progress < 0.75) {
    car.armed = true;
  }

  if (car.armed && prevProgress > 0.9 && car.progress < 0.1) {
    car.armed = false;
    car.lap = Math.min(car.lap + 1, TOTAL_LAPS);
    crossedFinish = true;
  }

  return {
    speed,
    drift: car.driftPower,
    surface,
    hardHit,
    crossedFinish,
  };
}

function drawMini(ctx: CanvasRenderingContext2D, center: CenterPt[], car: CarState, width: number, ghost: GhostBuffer) {
  const size = 78;
  const x = width - size - 12;
  const y = 64;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of center) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
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

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(82,255,229,0.52)';
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
      ctx.fillStyle = COLORS.purple;
      ctx.beginPath();
      ctx.arc(mx(g.x), my(g.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(mx(car.x), my(car.y), 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const RaceGame = forwardRef<DriftRaceHandle, DriftRaceProps>(
  ({ onSnapshot, selfGhost = true, topOffset = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);

    const raf = useRef<number | null>(null);

    const { center, total } = useMemo(() => buildTrack(), []);
    const decor = useMemo(() => buildDecor(center, total), [center, total]);

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
        speed: 0,
        vx: 0,
        vy: 0,
        driftPower: 0,
        progress: 0,
        lap: 1,
        armed: false,
      }),
      [startPose],
    );

    const car = useRef<CarState>(makeCar());

    const input = useRef<InputState>({
      active: false,
      aimX: 1,
      aimY: 0,
      brake: 0,
      drift: false,
    });

    const joystick = useRef({
      active: false,
      id: -1,
      inputX: 0,
      inputY: 0,
      visualX: 0,
      visualY: 0,
    });

    const keys = useRef({
      up: false,
      down: false,
      left: false,
      right: false,
      drift: false,
    });

    const particles = useRef<Particle[]>([]);
    const skids = useRef<Skid[]>([]);
    const trail = useRef<Trail[]>([]);
    const popups = useRef<Popup[]>([]);

    const ghost = useRef(new GhostBuffer());

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

    const camera = useRef({
      x: startPose.x,
      y: startPose.y,
      zoom: 1,
      shake: 0,
      sx: 0,
      sy: 0,
    });

    const viewport = useRef({
      w: 1,
      h: 1,
      dpr: 1,
    });

    const timing = useRef({
      lapStart: performance.now(),
      best: Infinity,
    });

    const combo = useRef({
      score: 0,
      ms: 0,
      idle: 0,
      banked: 0,
    });

    const lastT = useRef(0);
    const acc = useRef(0);
    const hudT = useRef(0);
    const netT = useRef(0);
    const trailT = useRef(0);
    const startedRef = useRef(false);

    const [started, setStarted] = useState(false);
    const [stickActive, setStickActive] = useState(false);
    const [hud, setHud] = useState({
      speed: 0,
      lap: 1,
      drift: 0,
      combo: 0,
      banked: 0,
      lapTime: 0,
      best: Infinity,
    });

    const doReset = useCallback(() => {
      car.current = makeCar();

      particles.current = [];
      skids.current = [];
      trail.current = [];
      popups.current = [];
      selfRec.current = [];

      timing.current = {
        lapStart: performance.now(),
        best: timing.current.best,
      };

      combo.current = {
        score: 0,
        ms: 0,
        idle: 0,
        banked: 0,
      };

      camera.current = {
        x: startPose.x,
        y: startPose.y,
        zoom: 1,
        shake: 0,
        sx: 0,
        sy: 0,
      };

      startedRef.current = false;
      setStarted(false);
      setStickActive(false);

      joystick.current = {
        active: false,
        id: -1,
        inputX: 0,
        inputY: 0,
        visualX: 0,
        visualY: 0,
      };

      input.current = {
        active: false,
        aimX: 1,
        aimY: 0,
        brake: 0,
        drift: false,
      };

      if (knobRef.current) {
        knobRef.current.style.transform = 'translate(0px, 0px)';
      }
    }, [makeCar, startPose]);

    useImperativeHandle(ref, () => ({
      pushRemoteSnapshot: (snap: NetSnapshot) => ghost.current.push(snap),
      reset: () => doReset(),
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;

      if (!canvas || !wrap) return;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, wrap.clientWidth);
        const h = Math.max(1, wrap.clientHeight);

        viewport.current = { w, h, dpr };

        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      };

      resize();

      const ro = new ResizeObserver(resize);
      ro.observe(wrap);

      window.addEventListener('resize', resize);

      return () => {
        ro.disconnect();
        window.removeEventListener('resize', resize);
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

      const block = (event: TouchEvent) => {
        if (event.cancelable) event.preventDefault();
      };

      wrap?.addEventListener('touchmove', block, { passive: false });

      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
        wrap?.removeEventListener('touchmove', block);
      };
    }, []);

    useEffect(() => {
      const down = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r'].includes(key)) {
          event.preventDefault();
        }

        if (key === 'arrowup' || key === 'w') keys.current.up = true;
        if (key === 'arrowdown' || key === 's') keys.current.down = true;
        if (key === 'arrowleft' || key === 'a') keys.current.left = true;
        if (key === 'arrowright' || key === 'd') keys.current.right = true;
        if (key === ' ') keys.current.drift = true;
        if (key === 'r') doReset();

        if (
          !startedRef.current &&
          (key === 'arrowup' ||
            key === 'w' ||
            key === 'arrowleft' ||
            key === 'arrowright' ||
            key === 'a' ||
            key === 'd')
        ) {
          startedRef.current = true;
          setStarted(true);
        }
      };

      const up = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();

        if (key === 'arrowup' || key === 'w') keys.current.up = false;
        if (key === 'arrowdown' || key === 's') keys.current.down = false;
        if (key === 'arrowleft' || key === 'a') keys.current.left = false;
        if (key === 'arrowright' || key === 'd') keys.current.right = false;
        if (key === ' ') keys.current.drift = false;
      };

      window.addEventListener('keydown', down, { passive: false });
      window.addEventListener('keyup', up);

      return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
      };
    }, [doReset]);

    useEffect(() => {
      const canvas = canvasRef.current;

      if (!canvas) return;

      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) return;

      const loop = (now: number) => {
        const v = viewport.current;
        const frameMs = lastT.current === 0 ? 16.7 : Math.min(now - lastT.current, 50);
        lastT.current = now;

        const joy = joystick.current;
        const k = keys.current;
        const inp = input.current;

        const hasKeyboard = k.up || k.down || k.left || k.right || k.drift;

        if (hasKeyboard) {
          if (!startedRef.current) {
            startedRef.current = true;
            setStarted(true);
          }

          const baseAngle = car.current.angle;
          const steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
          const forward = k.up || (!k.down && startedRef.current);
          const back = k.down;

          inp.active = forward || Math.abs(steer) > 0 || back;
          inp.aimX = Math.cos(baseAngle + steer * 1.25 + (back ? Math.PI : 0));
          inp.aimY = Math.sin(baseAngle + steer * 1.25 + (back ? Math.PI : 0));
          inp.brake = back ? 0.8 : 0;
          inp.drift = k.drift || back;
        } else if (joy.active) {
          inp.active = true;
          inp.aimX = joy.inputX;
          inp.aimY = joy.inputY;
          inp.brake = joy.inputY > 0.55 ? clamp((joy.inputY - 0.55) / 0.45, 0, 1) * 0.6 : 0;
          inp.drift = joy.inputY > 0.42;
        } else {
          inp.active = false;
          inp.aimX = Math.cos(car.current.angle);
          inp.aimY = Math.sin(car.current.angle);
          inp.brake = 0;
          inp.drift = false;
        }

        acc.current += frameMs / 1000;

        let guard = 0;

        while (acc.current >= STEP && guard < 5) {
          const result = stepCar(car.current, inp, center, total);
          const c = car.current;

          acc.current -= STEP;
          guard += 1;

          if (result.speed > 70 && c.driftPower > 0.16) {
            const rx = -Math.sin(c.angle);
            const ry = Math.cos(c.angle);

            const backX = c.x - Math.cos(c.angle) * 21;
            const backY = c.y - Math.sin(c.angle) * 21;

            if (c.driftPower > 0.22) {
              skids.current.push(
                {
                  x1: backX - rx * 10,
                  y1: backY - ry * 10,
                  x2: backX - rx * 10 - c.vx * 0.028,
                  y2: backY - ry * 10 - c.vy * 0.028,
                  life: 0.98,
                  width: 4 + c.driftPower * 2,
                },
                {
                  x1: backX + rx * 10,
                  y1: backY + ry * 10,
                  x2: backX + rx * 10 - c.vx * 0.028,
                  y2: backY + ry * 10 - c.vy * 0.028,
                  life: 0.98,
                  width: 4 + c.driftPower * 2,
                },
              );
            }

            if (Math.random() > 0.52) {
              spawnParticle(particles.current, backX, backY, 'smoke', 1, c.angle, 0.45 + c.driftPower * 0.85);
            }

            if (Math.random() > 0.84) {
              spawnParticle(particles.current, backX, backY, 'glow', 1, c.angle, 0.5);
            }
          }

          if (result.surface === 'off' && result.speed > 80 && Math.random() > 0.64) {
            spawnParticle(
              particles.current,
              c.x - Math.cos(c.angle) * 18,
              c.y - Math.sin(c.angle) * 18,
              'dust',
              1,
              c.angle,
              0.75,
            );
          }

          if (result.hardHit) {
            camera.current.shake = Math.max(camera.current.shake, 0.78);
            spawnParticle(particles.current, c.x, c.y, 'spark', 5, c.angle, 1.2);
            combo.current.score = 0;
          }

          const cm = combo.current;

          if (c.driftPower > 0.32 && result.speed > 115) {
            cm.ms += STEP * 1000;
            cm.score += result.speed * c.driftPower * STEP * 0.68;
            cm.idle = 0;
          } else {
            cm.idle += STEP * 1000;

            if (cm.idle > 430 && cm.score > 28) {
              const mult = 1 + Math.floor(cm.ms / 1600);
              const gained = Math.round(cm.score * mult);

              cm.banked += gained;

              popups.current.push({
                x: c.x,
                y: c.y - 34,
                life: 1.1,
                text: `+${gained}${mult > 1 ? ` ×${mult}` : ''}`,
                big: mult > 1,
              });

              cm.score = 0;
              cm.ms = 0;
            }
          }

          const recT = now - timing.current.lapStart;
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

          if (result.crossedFinish) {
            const lapMs = now - timing.current.lapStart;

            if (lapMs < timing.current.best) {
              timing.current.best = lapMs;
              bestRec.current = selfRec.current.slice();
            }

            timing.current.lapStart = now;
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
        const cam = camera.current;
        const dtSec = Math.min(frameMs / 1000, 0.05);

        const camK = 1 - Math.exp(-dtSec / 0.16);

        cam.x = lerp(cam.x, c.x + c.vx * 0.26, camK);
        cam.y = lerp(cam.y, c.y + c.vy * 0.26, camK);

        const targetZoom = 1.03 - clamp(speed / PHYSICS.maxSpeed, 0, 1) * 0.12;
        cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-dtSec / 0.45));

        cam.shake = Math.max(0, cam.shake - dtSec * 3);
        cam.sx = (Math.random() - 0.5) * cam.shake * 10;
        cam.sy = (Math.random() - 0.5) * cam.shake * 10;

        if (now - trailT.current > 42 && speed > 80) {
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
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, v.w, v.h);

        ctx.save();
        ctx.translate(v.w / 2 + cam.sx, v.h / 2 + cam.sy);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-cam.x, -cam.y);

        drawGround(ctx, cam.x, cam.y, v.w, v.h, cam.zoom, now);
        drawTrack(ctx, center, now);
        drawSkids(ctx, skids.current, dt);
        drawDirectionArrows(ctx, center, now);
        drawFinish(ctx, center, now);

        for (const item of decor) {
          drawDecor(ctx, item, c, now);
        }

        drawTrail(ctx, trail.current, dt);
        drawParticles(ctx, particles.current, dt);

        if (ghost.current.active) {
          const g = ghost.current.sample(now);

          if (g) {
            drawCar(ctx, g.x, g.y, g.angle, {
              ghost: true,
              drift: g.drift,
            });

            if (g.drift > 0.4 && Math.random() > 0.75) {
              spawnParticle(particles.current, g.x, g.y, 'smoke', 1, g.angle, 0.4);
            }
          }
        } else if (selfGhost && bestRec.current && bestRec.current.length > 1) {
          const rec = bestRec.current;
          const tt = now - timing.current.lapStart;

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
          drift: c.driftPower,
          brake: input.current.brake,
        });

        for (let i = popups.current.length - 1; i >= 0; i -= 1) {
          const pop = popups.current[i];

          ctx.save();
          ctx.globalAlpha = clamp(pop.life, 0, 1);
          ctx.fillStyle = pop.big ? COLORS.gold : 'rgba(242,199,102,0.86)';
          ctx.font = `800 ${pop.big ? 26 : 19}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(pop.text, pop.x, pop.y);
          ctx.restore();

          pop.y -= 36 * dt;
          pop.life -= dt;

          if (pop.life <= 0) popups.current.splice(i, 1);
        }

        ctx.restore();

        const vignette = ctx.createRadialGradient(
          v.w / 2,
          v.h / 2,
          Math.min(v.w, v.h) * 0.3,
          v.w / 2,
          v.h / 2,
          Math.max(v.w, v.h) * 0.78,
        );

        vignette.addColorStop(0, 'rgba(5,6,16,0)');
        vignette.addColorStop(1, 'rgba(5,6,16,0.52)');

        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, v.w, v.h);

        drawMini(ctx, center, c, v.w, ghost.current);

        if (now - hudT.current > 90) {
          hudT.current = now;

          setHud({
            speed: Math.round(speed * 0.42),
            lap: c.lap,
            drift: c.driftPower,
            combo: Math.round(combo.current.score * (1 + Math.floor(combo.current.ms / 1600))),
            banked: combo.current.banked,
            lapTime: now - timing.current.lapStart,
            best: timing.current.best,
          });
        }

        raf.current = requestAnimationFrame(loop);
      };

      raf.current = requestAnimationFrame(loop);

      return () => {
        if (raf.current) {
          cancelAnimationFrame(raf.current);
        }
      };
    }, [center, decor, onSnapshot, selfGhost, total]);

    const setKnob = (x: number, y: number) => {
      if (knobRef.current) {
        knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
    };

    const updateJoystick = (event: React.PointerEvent<HTMLDivElement>, zone: HTMLDivElement) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(d, VISUAL.joystickRadius);

      const visualX = (dx / d) * m;
      const visualY = (dy / d) * m;

      joystick.current.visualX = visualX;
      joystick.current.visualY = visualY;
      joystick.current.inputX = visualX / VISUAL.joystickRadius;
      joystick.current.inputY = visualY / VISUAL.joystickRadius;

      setKnob(visualX, visualY);
    };

    const stickDown = (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const zone = event.currentTarget;

      joystick.current.active = true;
      joystick.current.id = event.pointerId;

      try {
        zone.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (!startedRef.current) {
        startedRef.current = true;
        setStarted(true);
      }

      setStickActive(true);
      updateJoystick(event, zone);
    };

    const stickMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!joystick.current.active || joystick.current.id !== event.pointerId) return;

      event.preventDefault();
      updateJoystick(event, event.currentTarget);
    };

    const stickUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (joystick.current.id !== event.pointerId) return;

      joystick.current = {
        active: false,
        id: -1,
        inputX: 0,
        inputY: 0,
        visualX: 0,
        visualY: 0,
      };

      input.current.active = false;

      setKnob(0, 0);
      setStickActive(false);

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
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

        {Number.isFinite(hud.best) && (
          <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2 rounded-full border border-white/[0.07] bg-[#050610]/55 px-3 py-0.5 text-[10px] tabular-nums text-[#9D7CFF] backdrop-blur-md">
            лучший {fmtTime(hud.best)}
          </div>
        )}

        {hud.combo > 30 && (
          <div className="pointer-events-none absolute left-1/2 top-[84px] -translate-x-1/2 text-center">
            <div
              className="text-xl font-extrabold uppercase tracking-tight text-[#F2C766] drop-shadow-[0_0_14px_rgba(242,199,102,0.55)]"
              style={{
                transform: `scale(${1 + Math.min(hud.drift, 1) * 0.18})`,
              }}
            >
              занос {hud.combo}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={doReset}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.07] bg-[#050610]/60 text-lg text-white/70 backdrop-blur-md active:scale-95 active:text-[#52FFE5]"
          style={{
            left: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          }}
          aria-label="Заново"
        >
          ↻
        </button>

        <div
          className="absolute z-10"
          style={{
            right: 14,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
            width: VISUAL.joystickZone,
            height: VISUAL.joystickZone,
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
                stickActive ? 'border-[#52FFE5]/45 shadow-[0_0_28px_rgba(82,255,229,0.14)]' : 'border-white/[0.10]'
              }`}
              style={{
                width: VISUAL.joystickRadius * 2 + 18,
                height: VISUAL.joystickRadius * 2 + 18,
              }}
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
                  width: 50,
                  height: 50,
                  margin: -25,
                  willChange: 'transform',
                }}
              />
            </div>
          </div>
        </div>

        {!started && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="mx-6 rounded-[22px] border border-white/[0.07] bg-[#050610]/72 px-5 py-4 text-center shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="text-sm font-bold text-white">Тяни стик — машина поедет туда</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/50">
                Управление как в аркаде: стик задаёт направление, машина сама уходит в{' '}
                <span className="text-[#52FFE5]">мягкий дрифт</span>, вниз —{' '}
                <span className="text-[#F2C766]">ручник</span>.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

RaceGame.displayName = 'RaceGame';

export default RaceGame;