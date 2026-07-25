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
 * Arcade feel:
 * - joystick points where the car wants to go;
 * - heading rotates smoothly toward the stick;
 * - the car slides through almost every turn and grips only when driving straight;
 * - walls are SOFT: only the into-wall velocity is removed, the slide is kept;
 * - curbs barely slow you, offroad slows smoothly and recovers fast.
 *
 * Public API preserved for online mode:
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

type TrackGate = Vec & {
  progress: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
};

type TrackData = {
  center: CenterPt[];
  total: number;
  gates: TrackGate[];
  finish: TrackGate;
};

type TrackHit = {
  d: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
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


type CarState = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  vx: number;
  vy: number;
  driftPower: number;
  slide: number;
  progress: number;
  lap: number;
  checkpoint: number;
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
const TOTAL_LAPS = 3;

const ROAD_WIDTH = 154;
const ROAD_HALF = ROAD_WIDTH / 2;
const CURB_WIDTH = 15;
const RUNOFF = 22;
const WALL = ROAD_HALF + CURB_WIDTH + RUNOFF;

const PERF_DPR_CAP = 1.25;
const MAX_PARTICLE_POOL = 68;
const MAX_SKIDS = 86;
const MAX_TRAILS = 6;

// Invisible anti-cut gates. A lap counts only after these checkpoints
// are crossed in order, even if the player manages to drive near the finish.
const CHECKPOINTS = [0.1, 0.22, 0.34, 0.47, 0.6, 0.73, 0.86] as const;

const TUNNEL_FROM = 0.18;
const TUNNEL_TO = 0.26;
const TUNNEL2_FROM = 0.70;
const TUNNEL2_TO = 0.765;

/* ----------------------------------------------------------------------------
 * Physics constants.
 * The sim runs on a FIXED step (STEP = 1/60), so every multiplier below is a
 * straight per-step value — no frame-rate scaling math needed.
 * -------------------------------------------------------------------------- */
const PHYSICS = {
  maxSpeed: 565,
  driftMaxSpeed: 530,
  accel: 2280,
  idleSpeed: 285,
  idleEase: 0.065,
  brakePower: 1480,

  friction: 0.997,

  steerLowSpeed: 42,
  minTurnRate: 6.25,
  maxTurnRate: 8.75,

  // The car slides under almost any meaningful steering input. Only a nearly
  // centered stick restores full grip and locks the velocity to the nose.
  slideTurnStart: 0.012,
  slideTurnFull: 0.16,
  slideSpeedStart: 34,
  slideSpeedFull: 155,
  slideAttack: 0.38,
  slideRelease: 0.13,
  straightGripAngle: 0.018,

  moveFollowStraight: 15.5,
  moveFollowSlide: 0.95,
  maxSlipAngle: 0.82,

  turnSpeedLoss: 0.00125,
  slideSpeedLoss: 0.028,

  curbDrag: 0.996,
  offroadDrag: 0.976,
  offroadCap: 365,

  wallTangentKeep: 0.92,
  wallBounce: 0.04,
  wallDrag: 0.987,
  wallPush: 1.12,
  hardHitNormal: 225,
} as const;

const VISUAL = {
  curbLen: 44,
  joystickRadius: 54,
  joystickZone: 154,
};

function makeTrackSeed() {
  const time = Date.now() >>> 0;
  const perf =
    typeof performance !== 'undefined'
      ? Math.floor(performance.now() * 1000) >>> 0
      : 0;
  const secure =
    typeof globalThis.crypto !== 'undefined'
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0
      : Math.floor(Math.random() * 0xffffffff) >>> 0;
  const random = Math.floor(Math.random() * 0xffffffff) >>> 0;

  return (time ^ perf ^ secure ^ random ^ 0x9e3779b9) >>> 0;
}

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

const TRACK_TEMPLATES: readonly (readonly Vec[])[] = [
  [
    { x: -1.52, y: 0.04 },
    { x: -1.34, y: 0.62 },
    { x: -0.98, y: 1.02 },
    { x: -0.48, y: 1.18 },
    { x: -0.06, y: 0.94 },
    { x: 0.28, y: 1.13 },
    { x: 0.72, y: 0.96 },
    { x: 1.16, y: 1.08 },
    { x: 1.52, y: 0.7 },
    { x: 1.62, y: 0.18 },
    { x: 1.38, y: -0.18 },
    { x: 0.98, y: -0.28 },
    { x: 0.62, y: -0.04 },
    { x: 0.32, y: -0.24 },
    { x: 0.46, y: -0.62 },
    { x: 0.9, y: -0.88 },
    { x: 0.66, y: -1.18 },
    { x: 0.18, y: -1.3 },
    { x: -0.2, y: -1.08 },
    { x: -0.62, y: -1.24 },
    { x: -1.08, y: -0.98 },
    { x: -1.4, y: -0.56 },
    { x: -1.22, y: -0.2 },
  ],
  [
    { x: -1.64, y: 0.26 },
    { x: -1.38, y: 0.78 },
    { x: -0.92, y: 1.12 },
    { x: -0.38, y: 1.0 },
    { x: 0.02, y: 0.62 },
    { x: 0.34, y: 1.02 },
    { x: 0.82, y: 1.2 },
    { x: 1.3, y: 0.96 },
    { x: 1.62, y: 0.48 },
    { x: 1.54, y: -0.06 },
    { x: 1.14, y: -0.5 },
    { x: 0.66, y: -0.42 },
    { x: 0.32, y: -0.1 },
    { x: 0.02, y: -0.38 },
    { x: 0.18, y: -0.8 },
    { x: 0.62, y: -1.14 },
    { x: 0.16, y: -1.34 },
    { x: -0.36, y: -1.16 },
    { x: -0.76, y: -0.8 },
    { x: -1.18, y: -0.92 },
    { x: -1.52, y: -0.54 },
    { x: -1.7, y: -0.12 },
  ],
  [
    { x: -1.62, y: 0.0 },
    { x: -1.46, y: 0.56 },
    { x: -1.08, y: 0.98 },
    { x: -0.62, y: 1.22 },
    { x: -0.22, y: 0.88 },
    { x: 0.1, y: 1.08 },
    { x: 0.44, y: 0.8 },
    { x: 0.78, y: 1.1 },
    { x: 1.26, y: 1.0 },
    { x: 1.6, y: 0.62 },
    { x: 1.7, y: 0.14 },
    { x: 1.4, y: -0.2 },
    { x: 1.0, y: -0.08 },
    { x: 0.72, y: -0.42 },
    { x: 1.0, y: -0.78 },
    { x: 0.72, y: -1.12 },
    { x: 0.22, y: -1.28 },
    { x: -0.16, y: -0.96 },
    { x: -0.5, y: -1.28 },
    { x: -0.98, y: -1.12 },
    { x: -1.34, y: -0.76 },
    { x: -1.62, y: -0.42 },
  ],
  [
    { x: -1.66, y: 0.18 },
    { x: -1.42, y: 0.74 },
    { x: -1.0, y: 1.1 },
    { x: -0.5, y: 1.28 },
    { x: -0.08, y: 0.98 },
    { x: 0.24, y: 1.18 },
    { x: 0.62, y: 0.86 },
    { x: 1.0, y: 1.08 },
    { x: 1.42, y: 0.78 },
    { x: 1.68, y: 0.3 },
    { x: 1.58, y: -0.2 },
    { x: 1.2, y: -0.56 },
    { x: 0.76, y: -0.42 },
    { x: 0.42, y: -0.06 },
    { x: 0.08, y: -0.32 },
    { x: 0.24, y: -0.72 },
    { x: 0.68, y: -1.02 },
    { x: 0.3, y: -1.3 },
    { x: -0.22, y: -1.2 },
    { x: -0.58, y: -0.84 },
    { x: -1.02, y: -1.08 },
    { x: -1.42, y: -0.74 },
    { x: -1.7, y: -0.28 },
  ],
];

function catmullRomClosed(nodes: Vec[], samplesPerSegment = 16): Vec[] {
  const points: Vec[] = [];
  const count = nodes.length;

  for (let i = 0; i < count; i += 1) {
    const p0 = nodes[(i - 1 + count) % count];
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % count];
    const p3 = nodes[(i + 2) % count];

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      points.push({
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

  return points;
}

function resampleClosedLoop(points: Vec[], targetSpacing = 38): Vec[] {
  const cumulative = [0];
  let total = 0;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cumulative.push(total);
  }

  const sampleCount = Math.max(180, Math.round(total / targetSpacing));
  const result: Vec[] = [];
  let segment = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const target = (i / sampleCount) * total;

    while (segment < points.length - 1 && cumulative[segment + 1] < target) {
      segment += 1;
    }

    const a = points[segment];
    const b = points[(segment + 1) % points.length];
    const from = cumulative[segment];
    const to = cumulative[segment + 1];
    const t = clamp((target - from) / Math.max(0.0001, to - from), 0, 1);

    result.push({
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
    });
  }

  return result;
}

function prepareFinishStraight(points: Vec[]): Vec[] {
  const count = points.length;
  const probe = 8;
  let bestIndex = 0;
  let bestScore = Infinity;

  for (let i = 0; i < count; i += 1) {
    const prev = points[(i - probe + count) % count];
    const current = points[i];
    const next = points[(i + probe) % count];
    const angleIn = Math.atan2(current.y - prev.y, current.x - prev.x);
    const angleOut = Math.atan2(next.y - current.y, next.x - current.x);
    const bend = Math.abs(angleDiff(angleOut, angleIn));

    if (bend < bestScore) {
      bestScore = bend;
      bestIndex = i;
    }
  }

  const prev = points[(bestIndex - probe + count) % count];
  const next = points[(bestIndex + probe) % count];
  const length = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
  const tx = (next.x - prev.x) / length;
  const ty = (next.y - prev.y) / length;
  const origin = points[bestIndex];
  const averageSpacing = length / (probe * 2);
  const straightHalf = 8;
  const blendHalf = 15;
  const adjusted = points.map((point) => ({ ...point }));

  for (let offset = -blendHalf; offset <= blendHalf; offset += 1) {
    const index = (bestIndex + offset + count) % count;
    const absOffset = Math.abs(offset);
    const linePoint = {
      x: origin.x + tx * averageSpacing * offset,
      y: origin.y + ty * averageSpacing * offset,
    };
    const weight =
      absOffset <= straightHalf
        ? 1
        : 1 - smooth(straightHalf, blendHalf, absOffset);

    adjusted[index] = {
      x: lerp(pointAt(points, index).x, linePoint.x, weight),
      y: lerp(pointAt(points, index).y, linePoint.y, weight),
    };
  }

  return [
    ...adjusted.slice(bestIndex),
    ...adjusted.slice(0, bestIndex),
  ];
}

function pointAt(points: Vec[], index: number): Vec {
  return points[(index + points.length) % points.length];
}

function generateTrackNodes(seed: number): Vec[] {
  const rnd = seeded(seed);
  const template = TRACK_TEMPLATES[Math.floor(rnd() * TRACK_TEMPLATES.length)];
  const scaleX = 3060 + rnd() * 620;
  const scaleY = 2180 + rnd() * 470;
  const rotation = (rnd() - 0.5) * 0.52;
  const phaseA = rnd() * Math.PI * 2;
  const phaseB = rnd() * Math.PI * 2;
  const phaseC = rnd() * Math.PI * 2;
  const phaseD = rnd() * Math.PI * 2;
  const featureShift = Math.floor(rnd() * 7);
  const chicaneShift = Math.floor(rnd() * 2);

  const warped = template.map((point, index) => {
    const progress = index / template.length;
    const radialWarp =
      1 +
      Math.sin(progress * Math.PI * 4 + phaseA) * (0.035 + rnd() * 0.012) +
      Math.sin(progress * Math.PI * 8 + phaseB) * (0.018 + rnd() * 0.01);
    const localWobbleX = Math.sin(progress * Math.PI * 10 + phaseC) * (0.012 + rnd() * 0.016);
    const localWobbleY = Math.cos(progress * Math.PI * 12 + phaseD) * (0.012 + rnd() * 0.016);

    return {
      x: point.x * radialWarp + localWobbleX,
      y: point.y * radialWarp + localWobbleY,
    };
  });

  const nodes: Vec[] = [];
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  const pushScaled = (point: Vec) => {
    const localX = point.x * scaleX;
    const localY = point.y * scaleY;

    nodes.push({
      x: localX * cosRotation - localY * sinRotation,
      y: localX * sinRotation + localY * cosRotation,
    });
  };

  for (let i = 0; i < warped.length; i += 1) {
    const a = warped[i];
    const b = warped[(i + 1) % warped.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy) || 1;
    const nx = -dy / segmentLength;
    const ny = dx / segmentLength;
    const alternating = (i + chicaneShift) % 2 === 0 ? 1 : -1;

    pushScaled(a);

    const isFeatureTurn = (i + featureShift) % 7 === 0;

    if (isFeatureTurn) {
      const strength = clamp(segmentLength * (0.11 + rnd() * 0.035), 0.045, 0.09);
      const direction = alternating * (rnd() > 0.22 ? 1 : -1);

      pushScaled({
        x: lerp(a.x, b.x, 0.3) + nx * strength * direction,
        y: lerp(a.y, b.y, 0.3) + ny * strength * direction,
      });
      pushScaled({
        x: lerp(a.x, b.x, 0.56) + nx * strength * 1.28 * direction,
        y: lerp(a.y, b.y, 0.56) + ny * strength * 1.28 * direction,
      });
      pushScaled({
        x: lerp(a.x, b.x, 0.8) - nx * strength * 0.32 * direction,
        y: lerp(a.y, b.y, 0.8) - ny * strength * 0.32 * direction,
      });
      continue;
    }

    const shouldBuildChicane = (i + chicaneShift) % 2 === 0 || rnd() > 0.72;

    if (shouldBuildChicane) {
      const strength = clamp(segmentLength * (0.075 + rnd() * 0.04), 0.028, 0.065);
      const first = alternating * (rnd() > 0.12 ? 1 : -1);
      const secondStrength = 0.78 + rnd() * 0.16;

      pushScaled({
        x: lerp(a.x, b.x, 0.35) + nx * strength * first,
        y: lerp(a.y, b.y, 0.35) + ny * strength * first,
      });
      pushScaled({
        x: lerp(a.x, b.x, 0.69) - nx * strength * secondStrength * first,
        y: lerp(a.y, b.y, 0.69) - ny * strength * secondStrength * first,
      });
    } else {
      const strength = clamp(segmentLength * (0.035 + rnd() * 0.025), 0.018, 0.04);

      pushScaled({
        x: lerp(a.x, b.x, 0.52) + nx * strength * alternating,
        y: lerp(a.y, b.y, 0.52) + ny * strength * alternating,
      });
    }
  }

  return nodes;
}

function sampleTrackPoint(center: CenterPt[], total: number, progress: number): Vec & { angle: number } {
  const target = ((progress % 1) + 1) % 1 * total;

  for (let i = 0; i < center.length; i += 1) {
    const a = center[i];
    const b = center[(i + 1) % center.length];
    const endDist = i === center.length - 1 ? total : b.dist;

    if (target >= a.dist && target <= endDist) {
      const span = Math.max(1, endDist - a.dist);
      const t = clamp((target - a.dist) / span, 0, 1);
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      return { x, y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }

  const p = center[0];
  return { x: p.x, y: p.y, angle: Math.atan2(p.ty, p.tx) };
}

function makeGate(center: CenterPt[], total: number, progress: number): TrackGate {
  const point = sampleTrackPoint(center, total, progress);
  const tx = Math.cos(point.angle);
  const ty = Math.sin(point.angle);

  return {
    x: point.x,
    y: point.y,
    progress,
    tx,
    ty,
    nx: -ty,
    ny: tx,
  };
}

function hasTrackClearance(points: Vec[]): boolean {
  const minimumClearance = WALL * 2 + 6;
  const minimumClearanceSq = minimumClearance * minimumClearance;
  const localSkip = 16;
  const stride = 4;

  for (let i = 0; i < points.length; i += stride) {
    const a = points[i];

    for (let j = i + stride; j < points.length; j += stride) {
      const directGap = j - i;
      const circularGap = Math.min(directGap, points.length - directGap);

      if (circularGap <= localSkip) continue;

      const b = points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;

      if (dx * dx + dy * dy < minimumClearanceSq) {
        return false;
      }
    }
  }

  return true;
}

function buildTrack(seed: number): TrackData {
  let raw: Vec[] = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const attemptSeed =
      attempt === 0
        ? seed
        : (seed ^ Math.imul(0x9e3779b9, attempt + 1)) >>> 0;
    const control = generateTrackNodes(attemptSeed);
    const spline = catmullRomClosed(control, 16);
    const evenlySpaced = resampleClosedLoop(spline, 42);
    const candidate = prepareFinishStraight(evenlySpaced);

    raw = candidate;

    if (hasTrackClearance(candidate)) break;
  }

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

  return {
    center,
    total,
    gates: CHECKPOINTS.map((progress) => makeGate(center, total, progress)),
    finish: makeGate(center, total, 0),
  };
}

function queryTrack(center: CenterPt[], total: number, x: number, y: number): TrackHit {
  let best: TrackHit = {
    d: Infinity,
    nx: 1,
    ny: 0,
    tx: 1,
    ty: 0,
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
        tx: dx / Math.sqrt(len2),
        ty: dy / Math.sqrt(len2),
        progress: (a.dist + Math.hypot(dx, dy) * t) / total,
        surface: 'off',
      };
    }
  }

  if (best.d < ROAD_HALF) best.surface = 'road';
  else if (best.d < ROAD_HALF + CURB_WIDTH) best.surface = 'curb';

  return best;
}

function buildDecor(center: CenterPt[], total: number, seed: number): Decor[] {
  const rnd = seeded(seed ^ 0xa511e9b3);
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
    if (i % 4 !== 0) return;

    const side: 1 | -1 = (Math.floor(i / 4) + (seed & 1)) % 2 === 0 ? 1 : -1;
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

    for (let j = 0; j < 1; j += 1) {
      const dist = 190 + rnd() * 340;
      const s = rnd() > 0.5 ? 1 : -1;
      const ox = p.x + nx * dist * s + (rnd() - 0.5) * 80;
      const oy = p.y + ny * dist * s + (rnd() - 0.5) * 80;
      const type: DecorType = rnd() > 0.42 ? 'tree' : 'bush';

      addDecor(ox, oy, type, 24 + rnd() * 40, rnd() * Math.PI * 2, 55, ROAD_HALF + 95);
    }
  });



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
  const halfW = width / zoom / 2 + 360;
  const halfH = height / zoom / 2 + 360;

  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const grassGlow = ctx.createRadialGradient(cx - 500, cy - 400, 0, cx - 500, cy - 400, 1400);
  grassGlow.addColorStop(0, 'rgba(82,255,229,0.035)');
  grassGlow.addColorStop(1, 'rgba(82,255,229,0)');
  ctx.fillStyle = grassGlow;
  ctx.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);

  const gridStep = 440;
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

  const patch = 360;
  ctx.fillStyle = 'rgba(255,255,255,0.012)';
  for (let x = Math.floor((cx - halfW) / patch) * patch; x < cx + halfW; x += patch) {
    for (let y = Math.floor((cy - halfH) / patch) * patch; y < cy + halfH; y += patch) {
      const pulse = Math.sin(x * 0.002 + y * 0.0017 + now * 0.00035);
      if (pulse > 0.3) ctx.fillRect(x + 34, y + 28, 110, 2);
    }
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

  for (let i = 0; i < center.length; i += 2) {
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

function drawTunnel(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const approxTotal = center[center.length - 1].dist || 1;

  const drawOneTunnel = (from: number, to: number, small = false) => {
    const drawRangeStroke = (width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;

      center.forEach((p) => {
        const progress = p.dist / approxTotal;
        if (progress < from || progress > to) return;

        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });

      if (started) ctx.stroke();
    };

    drawRangeStroke(ROAD_WIDTH + (small ? 58 : 82), small ? 'rgba(0,0,0,0.46)' : 'rgba(0,0,0,0.52)');
    drawRangeStroke(ROAD_WIDTH + (small ? 32 : 46), small ? 'rgba(13,16,28,0.84)' : 'rgba(20,24,40,0.88)');
    drawRangeStroke(ROAD_WIDTH + 8, small ? 'rgba(157,124,255,0.12)' : 'rgba(82,255,229,0.10)');

    const step = small ? 0.022 : 0.018;
    for (let t = from; t <= to; t += step) {
      const p = sampleTrackPoint(center, approxTotal, t);
      const pulse = 0.35 + Math.sin(now * 0.006 + t * 80) * 0.18;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.strokeStyle = small ? `rgba(157,124,255,${pulse})` : `rgba(242,199,102,${pulse})`;
      ctx.lineWidth = small ? 2.4 : 3;
      ctx.beginPath();
      ctx.moveTo(-ROAD_HALF - 22, 0);
      ctx.lineTo(-ROAD_HALF - 8, 0);
      ctx.moveTo(ROAD_HALF + 8, 0);
      ctx.lineTo(ROAD_HALF + 22, 0);
      ctx.stroke();
      ctx.restore();
    }
  };

  drawOneTunnel(TUNNEL_FROM, TUNNEL_TO, false);
  drawOneTunnel(TUNNEL2_FROM, TUNNEL2_TO, true);

  ctx.restore();
}

function drawTrack(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + RUNOFF * 2 + 18, 'rgba(0,0,0,0.54)');
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + RUNOFF * 2 + 8, '#171c27');
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + RUNOFF * 2, 'rgba(255,255,255,0.09)');
  strokeLoop(ctx, center, ROAD_WIDTH + CURB_WIDTH * 2 + 8, 'rgba(82,255,229,0.045)');

  drawCurbs(ctx, center, 1, now);
  drawCurbs(ctx, center, -1, now);

  strokeLoop(ctx, center, ROAD_WIDTH + 4, '#070910');
  strokeLoop(ctx, center, ROAD_WIDTH, COLORS.road);
  strokeLoop(ctx, center, ROAD_WIDTH - 26, COLORS.road2);
  strokeLoop(ctx, center, ROAD_WIDTH - 54, COLORS.road3);

  strokeLoop(ctx, center, 4, 'rgba(255,255,255,0.08)', [40, 54]);
  strokeLoop(ctx, center, 2, 'rgba(82,255,229,0.20)', [16, 90]);

  drawTunnel(ctx, center, now);
}

function drawDirectionArrows(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  for (let i = 8; i < center.length; i += 26) {
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

function drawFinish(ctx: CanvasRenderingContext2D, finish: TrackGate, now: number) {
  ctx.save();
  ctx.translate(finish.x, finish.y);
  ctx.rotate(Math.atan2(finish.ty, finish.tx));

  const lineDepth = 28;
  const halfWidth = WALL - 2;
  const cell = 14;
  const columns = Math.ceil((halfWidth * 2) / cell);
  const actualCell = (halfWidth * 2) / columns;

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      ctx.fillStyle =
        (row + column) % 2 === 0
          ? 'rgba(255,255,255,0.92)'
          : 'rgba(5,6,16,0.98)';
      ctx.fillRect(
        -lineDepth / 2 + row * (lineDepth / 2),
        -halfWidth + column * actualCell,
        lineDepth / 2 + 0.5,
        actualCell + 0.5,
      );
    }
  }

  const pulse = 0.5 + Math.sin(now * 0.005) * 0.18;
  ctx.fillStyle = `rgba(242,199,102,${pulse})`;
  ctx.fillRect(-lineDepth / 2 - 4, -halfWidth - 4, lineDepth + 8, 4);
  ctx.fillRect(-lineDepth / 2 - 4, halfWidth, lineDepth + 8, 4);

  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, decor: Decor, car: CarState, now: number) {
  if (Math.hypot(car.x - decor.x, car.y - decor.y) > 720) return;

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
  if (list.length > MAX_PARTICLE_POOL) list.splice(0, list.length - Math.floor(MAX_PARTICLE_POOL * 0.78));

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

  if (list.length > MAX_SKIDS) list.splice(0, list.length - MAX_SKIDS);
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

  if (list.length > MAX_TRAILS) list.splice(0, list.length - MAX_TRAILS);
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

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (ghost) ctx.globalAlpha = 0.5;

  // Shadow under the car, not a glowing circle.
  ctx.fillStyle = ghost ? 'rgba(47,31,86,0.34)' : 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(-2, 7, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  const wheel = (wx: number, wy: number, steer = 0) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(steer);
    ctx.fillStyle = '#03050b';
    rr(ctx, -8, -5, 16, 10, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(-5, -3, 10, 2);
    ctx.restore();
  };

  const steerVis = clamp(drift, 0, 1) * 0.16;
  wheel(-17, -14, 0);
  wheel(-17, 14, 0);
  wheel(18, -14, steerVis);
  wheel(18, 14, steerVis);

  // Main body.
  const body = ctx.createLinearGradient(-31, -17, 32, 17);
  body.addColorStop(0, ghost ? '#211546' : '#07101e');
  body.addColorStop(0.44, ghost ? '#3a236e' : '#13243a');
  body.addColorStop(1, ghost ? '#6849c9' : '#0b756f');

  ctx.fillStyle = body;
  rr(ctx, -31, -16, 64, 32, 11);
  ctx.fill();

  ctx.strokeStyle = ghost ? 'rgba(157,124,255,0.72)' : 'rgba(82,255,229,0.78)';
  ctx.lineWidth = 1.6;
  rr(ctx, -31, -16, 64, 32, 11);
  ctx.stroke();

  // Hood and roof.
  ctx.fillStyle = ghost ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.08)';
  rr(ctx, 5, -11, 18, 22, 6);
  ctx.fill();

  ctx.fillStyle = ghost ? 'rgba(157,124,255,0.22)' : 'rgba(82,255,229,0.18)';
  rr(ctx, -12, -10, 18, 20, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(24, -10, 5, 7);
  ctx.fillRect(24, 3, 5, 7);

  const braking = (opt.brake || 0) > 0.05;
  ctx.fillStyle = braking ? COLORS.red : 'rgba(242,199,102,0.62)';
  ctx.fillRect(-32, -10, 5, 7);
  ctx.fillRect(-32, 3, 5, 7);

  if (!ghost && drift > 0.45) {
    ctx.strokeStyle = `rgba(82,255,229,${0.10 + drift * 0.18})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-31, -12);
    ctx.lineTo(-43 - drift * 10, -16);
    ctx.moveTo(-31, 12);
    ctx.lineTo(-43 - drift * 10, 16);
    ctx.stroke();
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

  sample(localNow: number): { x: number; y: number; angle: number; drift: number; lap: number } | null {
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
          lap: t < 0.5 ? a.lap : b.lap,
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

/* ----------------------------------------------------------------------------
 * Core simulation step. Fixed timestep, arcade handling.
 * -------------------------------------------------------------------------- */
function gateSignedDistance(gate: TrackGate, x: number, y: number) {
  return (x - gate.x) * gate.tx + (y - gate.y) * gate.ty;
}

function crossedGateForward(
  gate: TrackGate,
  oldX: number,
  oldY: number,
  newX: number,
  newY: number,
  vx: number,
  vy: number,
) {
  const before = gateSignedDistance(gate, oldX, oldY);
  const after = gateSignedDistance(gate, newX, newY);
  const forwardSpeed = vx * gate.tx + vy * gate.ty;

  if (before > 0 || after < 0 || forwardSpeed < 24) return false;

  const span = after - before;
  const t = Math.abs(span) < 0.0001 ? 1 : clamp(-before / span, 0, 1);
  const crossX = lerp(oldX, newX, t);
  const crossY = lerp(oldY, newY, t);
  const lateral = (crossX - gate.x) * gate.nx + (crossY - gate.y) * gate.ny;

  return Math.abs(lateral) <= WALL - 2;
}

/* ----------------------------------------------------------------------------
 * Fixed-step arcade simulation.
 * The car automatically starts sliding under steering load; a smooth racing
 * line keeps more speed than a late, sharp turn.
 * -------------------------------------------------------------------------- */
function stepCar(
  car: CarState,
  input: InputState,
  center: CenterPt[],
  total: number,
  gates: TrackGate[],
  finish: TrackGate,
): {
  speed: number;
  drift: number;
  surface: Surface;
  hardHit: boolean;
  crossedFinish: boolean;
  finishedRace: boolean;
} {
  const oldX = car.x;
  const oldY = car.y;
  const before = queryTrack(center, total, oldX, oldY);
  const surface = before.surface;

  let targetAngle = car.angle;
  let throttle = 0;

  if (input.active) {
    const magnitude = Math.hypot(input.aimX, input.aimY);

    if (magnitude > 0.08) {
      targetAngle = Math.atan2(input.aimY, input.aimX);
      throttle = clamp(magnitude, 0.4, 1);
    } else {
      throttle = 0.4;
    }
  }

  const diff = angleDiff(targetAngle, car.angle);
  const absDiff = Math.abs(diff);
  const speedNorm = clamp(car.speed / PHYSICS.maxSpeed, 0, 1);
  const steeringDemand = smooth(PHYSICS.slideTurnStart, PHYSICS.slideTurnFull, absDiff);
  const speedDemand = smooth(PHYSICS.slideSpeedStart, PHYSICS.slideSpeedFull, car.speed);
  const manualSlide = input.drift ? 0.36 : 0;
  const desiredSlide =
    absDiff <= PHYSICS.straightGripAngle && !input.drift
      ? 0
      : clamp((0.52 + steeringDemand * 0.48) * speedDemand + manualSlide, 0, 1);
  const slideEase = desiredSlide > car.slide ? PHYSICS.slideAttack : PHYSICS.slideRelease;
  car.slide = lerp(car.slide, desiredSlide, slideEase);

  const turnRate = lerp(PHYSICS.maxTurnRate, PHYSICS.minTurnRate, speedNorm);
  const maxTurnStep = turnRate * STEP * (1 + car.slide * 0.22);
  const turnStep = clamp(diff, -maxTurnStep, maxTurnStep);
  car.angle += turnStep;

  const turnLoad = clamp(
    Math.abs(turnStep) / Math.max(0.0001, turnRate * STEP),
    0,
    1,
  );

  if (input.active) {
    const accelerationEfficiency = clamp(1 - turnLoad * 0.035 - car.slide * 0.02, 0.9, 1);
    car.speed += PHYSICS.accel * throttle * accelerationEfficiency * STEP;
  } else {
    car.speed += (PHYSICS.idleSpeed - car.speed) * PHYSICS.idleEase;
  }

  if (input.brake > 0) {
    car.speed -= input.brake * PHYSICS.brakePower * STEP;
  }

  const steeringLoss = Math.pow(turnLoad, 1.25) * PHYSICS.turnSpeedLoss;
  const activeDrift = smooth(0.12, 0.88, car.slide);
  const slidingLoss =
    activeDrift *
    (0.34 + Math.pow(turnLoad, 0.82) * 0.66) *
    PHYSICS.slideSpeedLoss;
  car.speed *= Math.max(0.955, 1 - steeringLoss - slidingLoss);

  if (surface === 'curb') {
    car.speed *= PHYSICS.curbDrag;
  } else if (surface === 'off') {
    car.speed *= PHYSICS.offroadDrag;
    if (car.speed > PHYSICS.offroadCap) {
      car.speed = lerp(car.speed, PHYSICS.offroadCap, 0.15);
    }
  }

  car.speed *= PHYSICS.friction;

  const driftIntensity = activeDrift * (0.28 + Math.pow(turnLoad, 0.8) * 0.72);
  const driftSpeedCap = lerp(PHYSICS.maxSpeed, PHYSICS.driftMaxSpeed, driftIntensity);
  car.speed = clamp(car.speed, 0, driftSpeedCap);

  const previousMoveSpeed = Math.hypot(car.vx, car.vy);
  let moveAngle = previousMoveSpeed > 14 ? Math.atan2(car.vy, car.vx) : car.angle;
  const followRate =
    PHYSICS.moveFollowSlide +
    (PHYSICS.moveFollowStraight - PHYSICS.moveFollowSlide) * Math.pow(1 - car.slide, 2.4);
  const movementTurn = clamp(
    angleDiff(car.angle, moveAngle),
    -followRate * STEP,
    followRate * STEP,
  );
  moveAngle += movementTurn;

  const bodyToMovement = angleDiff(car.angle, moveAngle);
  const allowedSlip = lerp(0.035, PHYSICS.maxSlipAngle, car.slide);

  if (Math.abs(bodyToMovement) > allowedSlip) {
    moveAngle = car.angle - Math.sign(bodyToMovement) * allowedSlip;
  }

  // When the stick is almost straight, snap the velocity back into line quickly.
  // In every real turn the body rotates ahead of the velocity, producing a light,
  // predictable arcade drift without a separate drift button.
  if (absDiff < PHYSICS.straightGripAngle && car.slide < 0.12) {
    moveAngle += angleDiff(car.angle, moveAngle) * 0.42;
  }

  car.vx = Math.cos(moveAngle) * car.speed;
  car.vy = Math.sin(moveAngle) * car.speed;

  let nextX = car.x + car.vx * STEP;
  let nextY = car.y + car.vy * STEP;
  let hardHit = false;
  const wallHit = queryTrack(center, total, nextX, nextY);

  if (wallHit.d > WALL) {
    const penetration = wallHit.d - WALL;
    nextX -= wallHit.nx * penetration * PHYSICS.wallPush;
    nextY -= wallHit.ny * penetration * PHYSICS.wallPush;

    const normalVelocity = car.vx * wallHit.nx + car.vy * wallHit.ny;

    if (normalVelocity > 0) {
      const tangentX = car.vx - normalVelocity * wallHit.nx;
      const tangentY = car.vy - normalVelocity * wallHit.ny;

      car.vx =
        (tangentX * PHYSICS.wallTangentKeep - wallHit.nx * normalVelocity * PHYSICS.wallBounce) *
        PHYSICS.wallDrag;
      car.vy =
        (tangentY * PHYSICS.wallTangentKeep - wallHit.ny * normalVelocity * PHYSICS.wallBounce) *
        PHYSICS.wallDrag;
      car.speed = Math.hypot(car.vx, car.vy);
      hardHit = normalVelocity > PHYSICS.hardHitNormal;
    }
  }

  car.x = nextX;
  car.y = nextY;

  const finalSpeed = Math.hypot(car.vx, car.vy);
  const finalMoveAngle = finalSpeed > 8 ? Math.atan2(car.vy, car.vx) : car.angle;
  const slip = finalSpeed > 30 ? Math.abs(angleDiff(finalMoveAngle, car.angle)) : 0;
  const driftVisual = clamp(slip / 0.58 + car.slide * 0.44, 0, 1);
  car.driftPower = lerp(car.driftPower, driftVisual * smooth(25, 135, finalSpeed), 0.32);

  const after = queryTrack(center, total, car.x, car.y);
  car.progress = after.progress;

  const nextGate = gates[car.checkpoint];
  if (nextGate && crossedGateForward(nextGate, oldX, oldY, car.x, car.y, car.vx, car.vy)) {
    car.checkpoint += 1;
  }

  let crossedFinish = false;
  let finishedRace = false;

  if (
    car.checkpoint >= gates.length &&
    crossedGateForward(finish, oldX, oldY, car.x, car.y, car.vx, car.vy)
  ) {
    crossedFinish = true;
    car.checkpoint = 0;

    if (car.lap >= TOTAL_LAPS) {
      finishedRace = true;
    } else {
      car.lap += 1;
    }
  }

  return {
    speed: finalSpeed,
    drift: car.driftPower,
    surface: after.surface,
    hardHit,
    crossedFinish,
    finishedRace,
  };
}

function drawMini(
  ctx: CanvasRenderingContext2D,
  center: CenterPt[],
  car: CarState,
  width: number,
  rival: { x: number; y: number } | null,
) {
  const size = 82;
  const x = width - size - 12;
  const y = 58;

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

  ctx.fillStyle = 'rgba(5,6,16,0.62)';
  rr(ctx, x, y, size, size, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(82,255,229,0.50)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  center.forEach((p, i) => {
    if (i === 0) ctx.moveTo(mx(p.x), my(p.y));
    else ctx.lineTo(mx(p.x), my(p.y));
  });

  ctx.closePath();
  ctx.stroke();

  if (rival) {
    ctx.fillStyle = COLORS.purple;
    ctx.beginPath();
    ctx.arc(mx(rival.x), my(rival.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(mx(car.x), my(car.y), 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const RaceGame = forwardRef<DriftRaceHandle, DriftRaceProps>(
  ({ onSnapshot, topOffset = 120 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const raf = useRef<number | null>(null);

    const [trackSeed, setTrackSeed] = useState(makeTrackSeed);
    const { center, total, gates, finish } = useMemo(() => buildTrack(trackSeed), [trackSeed]);
    const decor = useMemo(() => buildDecor(center, total, trackSeed), [center, total, trackSeed]);

    const startPose = useMemo(() => {
      const point = sampleTrackPoint(center, total, 0.008);
      return {
        x: point.x,
        y: point.y,
        angle: point.angle,
      };
    }, [center, total]);

    const makeCar = useCallback(
      (): CarState => ({
        x: startPose.x,
        y: startPose.y,
        angle: startPose.angle,
        speed: 0,
        vx: 0,
        vy: 0,
        driftPower: 0,
        slide: 0,
        progress: 0.008,
        lap: 1,
        checkpoint: 0,
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
    const ghost = useRef(new GhostBuffer());
    const rivalRace = useRef(0.04);

    const camera = useRef({
      x: startPose.x,
      y: startPose.y,
      zoom: 0.94,
      shake: 0,
      sx: 0,
      sy: 0,
    });

    const viewport = useRef({
      w: 1,
      h: 1,
      dpr: 1,
    });

    const timing = useRef({ lapStart: 0 });
    const lastT = useRef(0);
    const acc = useRef(0);
    const hudT = useRef(0);
    const netT = useRef(0);
    const trailT = useRef(0);
    const startedRef = useRef(false);
    const raceFinishedRef = useRef(false);
    const pendingRaceFinishRef = useRef(false);

    const [raceOutcome, setRaceOutcome] = useState<'win' | 'loss' | null>(null);
    const [started, setStarted] = useState(false);
    const [stickActive, setStickActive] = useState(false);
    const [hud, setHud] = useState({
      position: 1,
      lap: 1,
      lapTime: 0,
      speed: 0,
    });

    const resetRaceState = useCallback(() => {
      car.current = makeCar();
      particles.current = [];
      skids.current = [];
      trail.current = [];
      ghost.current.clear();
      rivalRace.current = 0.04;
      timing.current = { lapStart: performance.now() };
      camera.current = {
        x: startPose.x,
        y: startPose.y,
        zoom: 0.94,
        shake: 0,
        sx: 0,
        sy: 0,
      };

      lastT.current = 0;
      acc.current = 0;
      hudT.current = 0;
      netT.current = 0;
      trailT.current = 0;
      startedRef.current = false;
      raceFinishedRef.current = false;
      pendingRaceFinishRef.current = false;
      setRaceOutcome(null);
      setStarted(false);
      setStickActive(false);
      setHud({ position: 1, lap: 1, lapTime: 0, speed: 0 });

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
        aimX: Math.cos(startPose.angle),
        aimY: Math.sin(startPose.angle),
        brake: 0,
        drift: false,
      };

      if (knobRef.current) {
        knobRef.current.style.transform = 'translate(0px, 0px)';
      }
    }, [makeCar, startPose]);

    useEffect(() => {
      resetRaceState();
    }, [resetRaceState]);

    const doReset = useCallback(() => {
      setTrackSeed((previous) => {
        const next = makeTrackSeed();
        return next === previous ? (next + 0x9e3779b9) >>> 0 : next;
      });
    }, []);

    useImperativeHandle(ref, () => ({
      pushRemoteSnapshot: (snap: NetSnapshot) => ghost.current.push(snap),
      reset: doReset,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;

      if (!canvas || !wrap) return;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, PERF_DPR_CAP);
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
        const frameMs = lastT.current === 0 ? 16.7 : Math.min(now - lastT.current, 34);
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
          inp.brake = 0;
          inp.drift = false;
        } else {
          inp.active = false;
          inp.aimX = Math.cos(car.current.angle);
          inp.aimY = Math.sin(car.current.angle);
          inp.brake = 0;
          inp.drift = false;
        }

        if (raceFinishedRef.current) {
          inp.active = false;
          inp.brake = 0.18;
          inp.drift = false;
        }

        acc.current = Math.min(acc.current + frameMs / 1000, STEP * 3);

        let guard = 0;

        while (acc.current >= STEP && guard < 3) {
          const result = stepCar(car.current, inp, center, total, gates, finish);
          const c = car.current;

          acc.current -= STEP;
          guard += 1;

          if (result.speed > 115 && c.driftPower > 0.22) {
            const rx = -Math.sin(c.angle);
            const ry = Math.cos(c.angle);

            const backX = c.x - Math.cos(c.angle) * 21;
            const backY = c.y - Math.sin(c.angle) * 21;

            if (c.driftPower > 0.38) {
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

            if (Math.random() > 0.86) {
              spawnParticle(particles.current, backX, backY, 'smoke', 1, c.angle, 0.32 + c.driftPower * 0.55);
            }
          }

          if (result.surface === 'off' && result.speed > 90 && Math.random() > 0.84) {
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
            camera.current.shake = Math.max(camera.current.shake, 0.5);
            spawnParticle(particles.current, c.x, c.y, 'spark', 3, c.angle, 1.0);
          }

          if (result.crossedFinish) {
            timing.current.lapStart = now;
          }

          if (result.finishedRace) {
            pendingRaceFinishRef.current = true;
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

        rivalRace.current = Math.min(TOTAL_LAPS, rivalRace.current + dtSec * (385 / total));
        const fallbackProgress = rivalRace.current % 1;
        const fallbackRival = sampleTrackPoint(center, total, fallbackProgress);
        const remoteRival = ghost.current.sample(now);
        const rival = remoteRival ?? { ...fallbackRival, drift: 0 };
        const rivalTrack = queryTrack(center, total, rival.x, rival.y);
        const playerRace = (c.lap - 1) + c.progress;
        const rivalRaceScore = remoteRival ? (remoteRival.lap - 1) + rivalTrack.progress : rivalRace.current;
        const position = playerRace >= rivalRaceScore ? 1 : 2;

        if (pendingRaceFinishRef.current && !raceFinishedRef.current) {
          raceFinishedRef.current = true;
          pendingRaceFinishRef.current = false;
          setRaceOutcome(position === 1 ? 'win' : 'loss');
        } else if (!remoteRival && rivalRace.current >= TOTAL_LAPS && !raceFinishedRef.current) {
          raceFinishedRef.current = true;
          setRaceOutcome('loss');
        }

        // The player's car is screen-locked. The world moves underneath it,
        // so camera interpolation can never make the car feel delayed or jittery.
        cam.x = c.x;
        cam.y = c.y;
        cam.zoom = 0.94;

        cam.shake = Math.max(0, cam.shake - dtSec * 4.5);
        cam.sx = (Math.random() - 0.5) * cam.shake * 7;
        cam.sy = (Math.random() - 0.5) * cam.shake * 7;

        if (now - trailT.current > 58 && speed > 90) {
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
        drawFinish(ctx, finish, now);

        for (const item of decor) {
          drawDecor(ctx, item, c, now);
        }

        drawTrail(ctx, trail.current, dt);
        drawParticles(ctx, particles.current, dt);

        drawCar(ctx, rival.x, rival.y, rival.angle, {
          ghost: true,
          drift: rival.drift,
        });

        ctx.restore();

        // Draw the local car after restoring the world transform. It stays at the
        // exact same screen coordinates while only the road moves around it.
        drawCar(ctx, v.w / 2, v.h / 2, c.angle, {
          drift: c.driftPower,
          brake: input.current.brake,
        });

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

        drawMini(ctx, center, c, v.w, rival);

        if (now - hudT.current > 90) {
          hudT.current = now;

          setHud({
            position,
            lap: c.lap,
            lapTime: now - timing.current.lapStart,
            speed: Math.round(speed * 0.72),
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
    }, [center, decor, finish, gates, onSnapshot, total]);

    useEffect(() => {
      wrapRef.current?.style.setProperty('--race-top-offset', `${topOffset}px`);
    }, [topOffset]);

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
        className="race-wrap relative h-full min-h-0 w-full select-none overflow-hidden overscroll-none bg-[#050610] text-white"
      >
        <style>{`
          .race-wrap {
            height: min(100%, calc(100dvh - var(--race-top-offset, 120px)));
            max-height: calc(100dvh - var(--race-top-offset, 120px));
            min-height: 320px;
            touch-action: none;
            -webkit-user-select: none;
            font-family: 'Supercell', 'Supercell-Magic', Inter, system-ui, sans-serif;
            line-height: 1.4;
          }

          .race-safe-text {
            line-height: 1.55;
            padding-top: 0.12em;
            padding-bottom: 0.18em;
          }

          .race-reset-btn {
            left: 16px;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
          }

          .race-joy-zone {
            right: 14px;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
            width: ${VISUAL.joystickZone}px;
            height: ${VISUAL.joystickZone}px;
            touch-action: none;
          }

          .race-joy-ring {
            width: ${VISUAL.joystickRadius * 2 + 18}px;
            height: ${VISUAL.joystickRadius * 2 + 18}px;
          }

          .race-joy-knob {
            width: 50px;
            height: 50px;
            margin: -25px;
            will-change: transform;
          }
        `}</style>

        <canvas ref={canvasRef} className="block h-full w-full touch-none" />

        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <div className="flex items-center divide-x divide-white/[0.07] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#050610]/72 shadow-[0_14px_40px_rgba(0,0,0,0.42)] backdrop-blur-md">
            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">позиция</div>
              <div className="race-safe-text text-sm font-extrabold tabular-nums text-[#F2C766]">
                {hud.position}/2
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">круг</div>
              <div className="race-safe-text text-sm font-extrabold tabular-nums text-[#52FFE5]">
                {hud.lap}/{TOTAL_LAPS}
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">время</div>
              <div className="race-safe-text text-sm font-extrabold tabular-nums text-white">
                {fmtTime(hud.lapTime)}
              </div>
            </div>

            <div className="px-3 py-1.5 text-center">
              <div className="text-[7px] font-semibold uppercase tracking-[0.22em] text-white/35">скорость</div>
              <div className="race-safe-text text-sm font-extrabold tabular-nums text-white">
                {hud.speed}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={doReset}
          onPointerDown={(event) => event.stopPropagation()}
          className="race-reset-btn absolute z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.07] bg-[#050610]/60 text-lg text-white/70 backdrop-blur-md active:scale-95 active:text-[#52FFE5]"
          aria-label="Новая трасса"
        >
          ↻
        </button>

        <div
          className="race-joy-zone absolute z-10"
          onPointerDown={stickDown}
          onPointerMove={stickMove}
          onPointerUp={stickUp}
          onPointerCancel={stickUp}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`race-joy-ring relative rounded-full border bg-white/[0.04] backdrop-blur-sm transition-colors ${
                stickActive ? 'border-[#52FFE5]/45 shadow-[0_0_28px_rgba(82,255,229,0.14)]' : 'border-white/[0.10]'
              }`}
            >
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-white/25">
                направление
              </div>

              <div
                ref={knobRef}
                className={`race-joy-knob absolute left-1/2 top-1/2 rounded-full border shadow-xl transition-colors ${
                  stickActive
                    ? 'border-[#52FFE5]/60 bg-gradient-to-br from-[#52FFE5]/90 to-[#167a70]'
                    : 'border-white/20 bg-gradient-to-br from-white/80 to-white/40'
                }`}
              />
            </div>
          </div>
        </div>

        {!started && !raceOutcome && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="mx-6 rounded-[22px] border border-white/[0.07] bg-[#050610]/72 px-5 py-4 text-center shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="text-sm font-bold leading-[1.45] text-white">Веди машину стиком</div>
              <div className="mt-1 text-[11px] leading-[1.65] text-white/50">
                На быстрых поворотах машина сама уходит в{' '}
                <span className="text-[#52FFE5]">мягкий дрифт</span>. Плавная траектория сохраняет скорость.
              </div>
            </div>
          </div>
        )}

        {raceOutcome && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050610]/38 backdrop-blur-[2px]">
            <div className="mx-6 w-full max-w-[300px] rounded-[24px] border border-white/[0.08] bg-[#050610]/90 px-6 py-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <div className={`race-safe-text text-xl font-extrabold ${raceOutcome === 'win' ? 'text-[#52FFE5]' : 'text-[#FF6B8A]'}`}>
                {raceOutcome === 'win' ? 'Победа!' : 'Поражение'}
              </div>
              <div className="mt-1 text-[11px] leading-[1.65] text-white/50">
                {raceOutcome === 'win' ? 'Идеальная гонка. Ты финишировал первым.' : 'Соперник оказался быстрее на этой трассе.'}
              </div>
              <button
                type="button"
                onClick={doReset}
                className="race-safe-text mt-4 w-full rounded-2xl border border-[#52FFE5]/30 bg-[#52FFE5]/14 px-4 py-3 text-sm font-extrabold text-[#52FFE5] active:scale-[0.98]"
              >
                Новая трасса
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

RaceGame.displayName = 'RaceGame';

export default RaceGame;