import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TrackPoint = { x: number; y: number };
type Surface = 'asphalt' | 'curb' | 'grass' | 'sand' | 'rough';
type DecorKind = 'tree' | 'pine' | 'bush' | 'rock' | 'stand' | 'light' | 'banner' | 'tent' | 'house' | 'palm' | 'boat' | 'flag';
type ParticleKind = 'dust' | 'smoke' | 'grass' | 'spark' | 'sand';

type Decor = { x: number; y: number; kind: DecorKind; size: number; angle: number; seed: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; kind: ParticleKind; angle: number };
type TireMark = { x1: number; y1: number; x2: number; y2: number; life: number; width: number };

type Car = {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  wheel: number;
  throttleGlow: number;
  brakeGlow: number;
  slip: number;
  shake: number;
  lapArmed: boolean;
  passedFinish: boolean;
};

type Controls = { throttle: boolean; brake: boolean; left: boolean; right: boolean; handbrake: boolean };
type Stick = { active: boolean; pointerId: number; sx: number; sy: number; vx: number; vy: number; ix: number; iy: number; power: number };

type TrackInfo = {
  d: number;
  signed: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  segment: number;
  surface: Surface;
};

const TOTAL_LAPS = 5;
const PLACE_TOTAL = 2;

const SETTINGS = {
  trackWidth: 156,
  curbWidth: 14,
  barrierWidth: 8,
  minimap: 132,
  physics: {
    maxSpeed: 15.8,
    engine: 0.54,
    brake: 0.74,
    drag: 0.0017,
    rolling: 0.017,
    maxWheel: 0.82,
    steerSpeed: 0.14,
    steerReturn: 0.2,
    yaw: 0.104,
    lateralGrip: 0.145,
    driftLoss: 0.78,
    wallBounce: 1.35,
  },
} as const;

const TRACK_NODES: TrackPoint[] = [
  { x: 400, y: 800 }, { x: 1800, y: 800 },
  { x: 2400, y: 1400 }, { x: 3400, y: 1400 },
  { x: 3800, y: 1900 }, { x: 3200, y: 2400 }, { x: 4200, y: 2800 },
  { x: 5500, y: 2200 }, { x: 6000, y: 800 },
  { x: 6200, y: 0 }, { x: 5500, y: -600 }, { x: 6500, y: -1000 },
  { x: 5000, y: -2000 }, { x: 3500, y: -1800 },
  { x: 2500, y: -2500 }, { x: 1000, y: -2000 },
  { x: 200, y: -1000 }, { x: -800, y: -1500 }, { x: -1500, y: -500 },
  { x: -800, y: 800 }, { x: 0, y: 800 },
];

const SURFACE: Record<Surface, { grip: number; roll: number; color: string }> = {
  asphalt: { grip: 1, roll: 1, color: '#facc15' },
  curb: { grip: 0.82, roll: 0.94, color: '#fb7185' },
  grass: { grip: 0.5, roll: 0.62, color: '#86efac' },
  sand: { grip: 0.36, roll: 0.43, color: '#fde68a' },
  rough: { grip: 0.28, roll: 0.35, color: '#c084fc' },
};

const HALF_ROAD = SETTINGS.trackWidth / 2;
const BARRIER_LIMIT = HALF_ROAD + SETTINGS.curbWidth + SETTINGS.barrierWidth + 2;
const START_X = 400;
const START_Y = 800;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const angleDelta = (target: number, current: number) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const worldRand = seeded(884422);
function noise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function initialCar(): Car {
  return {
    x: START_X,
    y: START_Y,
    angle: 0,
    vx: 0,
    vy: 0,
    wheel: 0,
    throttleGlow: 0,
    brakeGlow: 0,
    slip: 0,
    shake: 0,
    lapArmed: false,
    passedFinish: false,
  };
}

function initialStick(): Stick {
  return { active: false, pointerId: -1, sx: 0, sy: 0, vx: 0, vy: 0, ix: 0, iy: 0, power: 0 };
}

function segmentProjection(px: number, py: number, a: TrackPoint, b: TrackPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1);
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  const ox = px - cx;
  const oy = py - cy;
  const len = Math.sqrt(len2) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  return { d: Math.hypot(ox, oy), signed: ox * nx + oy * ny, nx: ox, ny: oy, tx, ty, cx, cy, t };
}

function buildTrack() {
  let pts = [...TRACK_NODES];
  for (let pass = 0; pass < 4; pass += 1) {
    const next: TrackPoint[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push({ x: a.x * 0.78 + b.x * 0.22, y: a.y * 0.78 + b.y * 0.22 });
      next.push({ x: a.x * 0.22 + b.x * 0.78, y: a.y * 0.22 + b.y * 0.78 });
    }
    pts = next;
  }
  return pts;
}

function getTrackInfo(track: TrackPoint[], x: number, y: number): TrackInfo {
  let best: TrackInfo = {
    d: Infinity,
    signed: 0,
    nx: 1,
    ny: 0,
    tx: 1,
    ty: 0,
    cx: 0,
    cy: 0,
    segment: 0,
    surface: 'rough',
  };

  for (let i = 0; i < track.length; i += 1) {
    const a = track[i];
    const b = track[(i + 1) % track.length];
    const p = segmentProjection(x, y, a, b);
    if (p.d < best.d) {
      let surface: Surface = 'rough';
      if (p.d <= HALF_ROAD - 4) surface = 'asphalt';
      else if (p.d <= HALF_ROAD + SETTINGS.curbWidth) surface = 'curb';
      else if (p.signed > 0 && p.d <= BARRIER_LIMIT + 72) surface = 'sand';
      else if (p.d <= BARRIER_LIMIT + 130) surface = 'grass';
      best = { d: p.d, signed: p.signed, nx: p.nx, ny: p.ny, tx: p.tx, ty: p.ty, cx: p.cx, cy: p.cy, segment: i, surface };
    }
  }

  return best;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPath(ctx: CanvasRenderingContext2D, track: TrackPoint[], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  track.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
}

function drawSidePath(ctx: CanvasRenderingContext2D, track: TrackPoint[], offset: number, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  track.forEach((p, i) => {
    const prev = track[(i - 1 + track.length) % track.length];
    const next = track[(i + 1) % track.length];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const x = p.x + (-dy / len) * offset;
    const y = p.y + (dx / len) * offset;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
}

function generateWorld(track: TrackPoint[]) {
  const decor: Decor[] = [];
  const safe = BARRIER_LIMIT + 55;

  const tooClose = (x: number, y: number, extra = 0) => {
    for (let i = 0; i < track.length; i += 1) {
      if (segmentProjection(x, y, track[i], track[(i + 1) % track.length]).d < safe + extra) return true;
    }
    return false;
  };

  const add = (x: number, y: number, kind: DecorKind, size: number, angle = 0, spacing = 50, extra = 0) => {
    if (tooClose(x, y, extra)) return;
    for (const d of decor) if (Math.hypot(d.x - x, d.y - y) < spacing) return;
    decor.push({ x, y, kind, size, angle, seed: worldRand() });
  };

  track.forEach((p, i) => {
    const n = track[(i + 1) % track.length];
    const a = Math.atan2(n.y - p.y, n.x - p.x);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);

    if (i % 4 === 0) {
      const side = i % 2 === 0 ? 1 : -1;
      add(p.x + nx * side * 126, p.y + ny * side * 126, 'light', 18, a, 95, -30);
    }
    if (i % 8 === 0) {
      const side = i % 4 < 2 ? 1 : -1;
      add(p.x + nx * side * 158, p.y + ny * side * 158, 'banner', 78, a + Math.PI / 2, 130, -20);
    }
    if (i % 13 === 0) {
      const side = i % 2 === 0 ? 1 : -1;
      add(p.x + nx * side * 230, p.y + ny * side * 230, 'stand', 110, a, 180);
    }
    if (i % 17 === 0) {
      const side = i % 3 === 0 ? 1 : -1;
      add(p.x + nx * side * 205, p.y + ny * side * 205, worldRand() > 0.45 ? 'tent' : 'house', 66, a, 145);
    }
    if (i % 10 === 0) {
      const side = i % 2 === 0 ? 1 : -1;
      add(p.x + nx * side * 170, p.y + ny * side * 170, 'flag', 38, a, 90);
    }

    if (i % 2 === 0) {
      for (let j = 0; j < 2; j += 1) {
        const side = worldRand() > 0.5 ? 1 : -1;
        const dist = 250 + worldRand() * 680;
        const roll = worldRand();
        const kind: DecorKind = roll > 0.82 ? 'rock' : roll > 0.66 ? 'pine' : roll > 0.48 ? 'bush' : 'tree';
        add(p.x + nx * side * dist + (worldRand() - 0.5) * 260, p.y + ny * side * dist + (worldRand() - 0.5) * 260, kind, 22 + worldRand() * 46, worldRand() * Math.PI * 2, 54);
      }
    }
  });

  for (let i = 0; i < 18; i += 1) add(2660 + worldRand() * 410, -2800 + i * 345 + worldRand() * 120, 'boat', 64 + worldRand() * 34, -0.1 + worldRand() * 0.25, 150);
  for (let i = 0; i < 18; i += 1) add(3800 + worldRand() * 1900, -2950 + worldRand() * 760, worldRand() > 0.35 ? 'palm' : 'rock', 28 + worldRand() * 46, worldRand() * Math.PI * 2, 72);
  for (let i = 0; i < 12; i += 1) add(-1900 + worldRand() * 820, -1200 + worldRand() * 2300, 'house', 60 + worldRand() * 44, worldRand() * 0.3, 150);
  return decor;
}

function addParticle(list: Particle[], x: number, y: number, kind: ParticleKind, amount: number, angle: number, power = 1) {
  if (list.length > 300) list.splice(0, list.length - 250);
  for (let i = 0; i < amount; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.8;
    const sp = (0.35 + Math.random() * 2.9) * power;
    const maxLife = kind === 'spark' ? 0.25 + Math.random() * 0.2 : 0.55 + Math.random() * 0.75;
    list.push({
      x: x + (Math.random() - 0.5) * 22,
      y: y + (Math.random() - 0.5) * 16,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: maxLife,
      maxLife,
      size: 1.5 + Math.random() * (kind === 'smoke' ? 10 : 5),
      kind,
      angle: Math.random() * Math.PI * 2,
    });
  }
}

function updatePhysics(params: {
  car: Car;
  controls: Controls;
  stick: Stick;
  track: TrackPoint[];
  particles: Particle[];
  marks: TireMark[];
  now: number;
  dt: number;
  lapStart: React.MutableRefObject<number>;
  bestLap: React.MutableRefObject<number | null>;
  onLap: (lapTime: number) => void;
}) {
  const { car, controls, stick, track, particles, marks, now, dt, lapStart, bestLap, onLap } = params;

  let throttle = controls.throttle ? 1 : 0;
  let brake = controls.brake ? 1 : 0;
  let steer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  let drift = controls.handbrake ? 1 : 0;

  if (stick.active && stick.power > 0.1) {
    const stickAngle = Math.atan2(stick.iy, stick.ix);
    const diff = angleDelta(stickAngle, car.angle);
    const forwardAim = Math.cos(diff);
    const back = clamp((-forwardAim - 0.05) / 0.95, 0, 1);
    steer = clamp(diff / 0.9, -1, 1) * clamp(stick.power * 1.35, 0, 1);

    if (back > 0.05) {
      // No reverse gear: pulling the stick back brakes and throws the car into a drift turn.
      throttle = 0;
      brake = clamp(0.42 + back * stick.power * 0.72, 0, 1);
      drift = Math.max(drift, back * stick.power);
      if (Math.abs(steer) < 0.22) steer = Math.sign(diff || 1) * back;
    } else {
      throttle = clamp(stick.power * (0.22 + Math.max(0, forwardAim) * 0.9), 0, 1);
      brake = 0;
    }
  }

  car.throttleGlow = lerp(car.throttleGlow, throttle, 0.12 * dt);
  car.brakeGlow = lerp(car.brakeGlow, brake, 0.18 * dt);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -Math.sin(car.angle);
  const ry = Math.cos(car.angle);
  const speed = Math.hypot(car.vx, car.vy);
  let forward = car.vx * fx + car.vy * fy;
  let side = car.vx * rx + car.vy * ry;

  const info = getTrackInfo(track, car.x, car.y);
  const surface = SURFACE[info.surface];
  const speed01 = clamp(speed / SETTINGS.physics.maxSpeed, 0, 1);
  const turnSlip = Math.abs(steer) * speed01;

  const targetWheel = steer * SETTINGS.physics.maxWheel * (1 - speed01 * 0.34) * (1 + drift * 0.22);
  car.wheel = lerp(car.wheel, targetWheel, (Math.abs(steer) > 0.01 ? SETTINGS.physics.steerSpeed : SETTINGS.physics.steerReturn) * dt);

  forward += throttle * SETTINGS.physics.engine * surface.roll * dt;
  if (brake > 0) forward -= brake * SETTINGS.physics.brake * dt;

  // Important: the car is not allowed to drive backwards.
  forward = clamp(forward, 0, SETTINGS.physics.maxSpeed * surface.roll);

  const steerGrip = surface.grip * (1 - drift * 0.62);
  const yawPower = clamp(forward / 7, 0.22, 1.28);
  car.angle += car.wheel * SETTINGS.physics.yaw * yawPower * steerGrip * dt;

  const driftAmount = clamp(drift * 0.86 + turnSlip * 0.62 + (1 - surface.grip) * speed01 * 0.25, 0, 1);
  const lateralGrip = SETTINGS.physics.lateralGrip * surface.grip * (1 - driftAmount * SETTINGS.physics.driftLoss) * (1 - speed01 * 0.22);
  side *= Math.pow(clamp(1 - lateralGrip, 0.026, 0.995), dt);

  if (drift > 0.08 && speed > 0.8) {
    const sign = Math.sign(car.wheel || steer || 1);
    car.angle += sign * (0.038 + speed01 * 0.075) * drift * dt;
    side += sign * speed * (0.034 + speed01 * 0.024) * drift * dt;
  }

  forward -= Math.sign(forward) * SETTINGS.physics.drag * speed * speed * dt;
  forward *= Math.pow(1 - SETTINGS.physics.rolling * (2 - surface.roll), dt);
  forward = clamp(forward, 0, SETTINGS.physics.maxSpeed * surface.roll);

  car.vx = Math.cos(car.angle) * forward + -Math.sin(car.angle) * side;
  car.vy = Math.sin(car.angle) * forward + Math.cos(car.angle) * side;

  let nx = car.x + car.vx * dt;
  let ny = car.y + car.vy * dt;
  const nextInfo = getTrackInfo(track, nx, ny);

  if (nextInfo.d > BARRIER_LIMIT) {
    const len = nextInfo.d || 1;
    const normalX = nextInfo.nx / len;
    const normalY = nextInfo.ny / len;
    const penetration = nextInfo.d - BARRIER_LIMIT;
    nx -= normalX * penetration;
    ny -= normalY * penetration;

    const normalSpeed = car.vx * normalX + car.vy * normalY;
    if (normalSpeed > 0) {
      car.vx -= normalX * normalSpeed * SETTINGS.physics.wallBounce;
      car.vy -= normalY * normalSpeed * SETTINGS.physics.wallBounce;
    }
    car.vx *= Math.pow(0.72, dt);
    car.vy *= Math.pow(0.72, dt);
    car.shake = Math.max(car.shake, 0.48);
    if (speed > 3.8) addParticle(particles, nx, ny, 'spark', 1, car.angle, 1.2);
  }

  car.x = nx;
  car.y = ny;
  car.slip = lerp(car.slip, driftAmount + Math.abs(side) / 6.2, 0.13 * dt);
  car.shake = Math.max(0, car.shake - 0.026 * dt);

  if (car.slip > 0.13 && speed > 2.2) {
    const backX = car.x - Math.cos(car.angle) * 25;
    const backY = car.y - Math.sin(car.angle) * 25;
    const rxx = -Math.sin(car.angle);
    const ryy = Math.cos(car.angle);
    marks.push(
      { x1: backX - rxx * 12, y1: backY - ryy * 12, x2: backX - rxx * 12 - car.vx * 2, y2: backY - ryy * 12 - car.vy * 2, life: clamp(car.slip, 0.2, 1), width: 3 + car.slip * 5 },
      { x1: backX + rxx * 12, y1: backY + ryy * 12, x2: backX + rxx * 12 - car.vx * 2, y2: backY + ryy * 12 - car.vy * 2, life: clamp(car.slip, 0.2, 1), width: 3 + car.slip * 5 },
    );
    if (info.surface === 'asphalt') addParticle(particles, backX, backY, 'smoke', car.slip > 0.5 ? 2 : 1, car.angle, 0.7 + car.slip);
  }

  if ((info.surface === 'grass' || info.surface === 'sand' || info.surface === 'rough') && speed > 2) {
    const kind: ParticleKind = info.surface === 'sand' ? 'sand' : info.surface === 'grass' ? 'grass' : 'dust';
    addParticle(particles, car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24, kind, speed > 8 ? 3 : 1, car.angle, 0.7 + speed01);
  }

  if (info.surface === 'curb' && speed > 7 && Math.random() > 0.62) {
    addParticle(particles, car.x - Math.cos(car.angle) * 19, car.y - Math.sin(car.angle) * 19, 'spark', 1, car.angle, 1.35);
    car.shake = Math.max(car.shake, 0.18);
  }

  if (info.segment > track.length * 0.62) car.lapArmed = true;

  const finish = segmentProjection(car.x, car.y, { x: START_X, y: START_Y - 102 }, { x: START_X, y: START_Y + 102 });
  const lapTime = (now - lapStart.current) / 1000;
  if (finish.d < 48 && car.lapArmed && !car.passedFinish && lapTime > 8) {
    car.passedFinish = true;
    car.lapArmed = false;
    onLap(lapTime);
    if (bestLap.current === null || lapTime < bestLap.current) bestLap.current = lapTime;
    lapStart.current = now;
    window.setTimeout(() => {
      car.passedFinish = false;
    }, 1300);
  }

  return { speed: Math.hypot(car.vx, car.vy), surface: info.surface };
}

function drawGround(ctx: CanvasRenderingContext2D, camX: number, camY: number, now: number) {
  const size = 9000;
  const g = ctx.createLinearGradient(camX - 1200, camY - 1200, camX + 1700, camY + 1400);
  g.addColorStop(0, '#102f16');
  g.addColorStop(0.5, '#1f5c22');
  g.addColorStop(1, '#0b2413');
  ctx.fillStyle = g;
  ctx.fillRect(camX - size / 2, camY - size / 2, size, size);

  ctx.save();
  ctx.globalAlpha = 0.13;
  for (let x = Math.floor((camX - 2600) / 150) * 150; x < camX + 2600; x += 150) {
    for (let y = Math.floor((camY - 1800) / 150) * 150; y < camY + 1800; y += 150) {
      const h = noise(x, y);
      if (h > 0.54) {
        ctx.fillStyle = h > 0.78 ? '#86efac' : '#064e3b';
        ctx.beginPath();
        ctx.ellipse(x + h * 95, y + noise(y, x) * 95, 10 + h * 18, 3 + h * 6, h * 6.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  const water = ctx.createLinearGradient(2520, -3100, 3180, 3100);
  water.addColorStop(0, '#0f3a6d');
  water.addColorStop(0.5, '#0ea5e9');
  water.addColorStop(1, '#08335f');
  ctx.fillStyle = water;
  roundedRect(ctx, 2520, -3300, 660, 6650, 80);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = '#bfdbfe';
  ctx.lineWidth = 2;
  for (let y = -3250; y < 3350; y += 92) {
    ctx.beginPath();
    for (let x = 2560; x <= 3135; x += 32) {
      const yy = y + Math.sin(x * 0.017 + now * 0.0015 + y * 0.02) * 10;
      if (x === 2560) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  const beach = ctx.createLinearGradient(3240, -3020, 4400, -2100);
  beach.addColorStop(0, '#d7b56d');
  beach.addColorStop(1, '#8f6a37');
  ctx.fillStyle = beach;
  ctx.beginPath();
  ctx.moveTo(3160, -3260);
  ctx.bezierCurveTo(3600, -3000, 3900, -3180, 4430, -2750);
  ctx.bezierCurveTo(4700, -2480, 4250, -2080, 3520, -2130);
  ctx.bezierCurveTo(3140, -2160, 3060, -2600, 3160, -3260);
  ctx.fill();

  ctx.fillStyle = '#263241';
  roundedRect(ctx, 2210, 1250, 1040, 305, 28);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  for (let x = 2260; x < 3200; x += 76) {
    ctx.beginPath();
    ctx.moveTo(x, 1280);
    ctx.lineTo(x - 20, 1526);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCurbs(ctx: CanvasRenderingContext2D, track: TrackPoint[], side: number) {
  const offset = (HALF_ROAD + SETTINGS.curbWidth / 2) * side;
  let dash = 0;
  for (let i = 0; i < track.length; i += 1) {
    const a = track[i];
    const b = track[(i + 1) % track.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;
    for (let t = 0; t < len; t += 27) {
      const t2 = Math.min(t + 24, len);
      ctx.strokeStyle = dash % 2 === 0 ? '#fff7ed' : '#dc2626';
      ctx.lineWidth = SETTINGS.curbWidth;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(a.x + (dx * t) / len + nx, a.y + (dy * t) / len + ny);
      ctx.lineTo(a.x + (dx * t2) / len + nx, a.y + (dy * t2) / len + ny);
      ctx.stroke();
      dash += 1;
    }
  }
}

function drawFinish(ctx: CanvasRenderingContext2D, now: number) {
  ctx.save();
  ctx.translate(START_X, START_Y);
  // The start/finish line is vertical here, therefore it is perpendicular to the first horizontal straight.
  ctx.shadowColor = 'rgba(250,204,21,0.45)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = 'rgba(250,204,21,0.15)';
  roundedRect(ctx, -24, -112, 48, 224, 10);
  ctx.fill();
  ctx.shadowBlur = 0;

  const cell = 16;
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -7; y < 7; y += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#020617';
      ctx.fillRect(x * cell - cell / 2, y * cell, cell, cell);
    }
  }
  ctx.fillStyle = `rgba(250,204,21,${0.45 + Math.sin(now * 0.006) * 0.16})`;
  ctx.font = '900 22px ui-monospace, monospace';
  ctx.fillText('START', -42, -130);
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, d: Decor, now: number, car: Car) {
  if (Math.hypot(d.x - car.x, d.y - car.y) > 1500) return;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.angle);

  const shadow = (w: number, h: number, a = 0.18) => {
    ctx.save();
    ctx.rotate(-d.angle + 0.55);
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(w * 0.25, h * 0.22, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  if (d.kind === 'tree' || d.kind === 'pine' || d.kind === 'palm') {
    shadow(d.size * 0.7, d.size * 0.32);
    ctx.fillStyle = '#4a2d16';
    roundedRect(ctx, -d.size * 0.08, -d.size * 0.08, d.size * 0.16, d.size * 0.56, 4);
    ctx.fill();
    if (d.kind === 'pine') {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = i === 0 ? '#064e3b' : i === 1 ? '#047857' : '#065f46';
        ctx.beginPath();
        ctx.moveTo(0, -d.size * (0.75 - i * 0.22));
        ctx.lineTo(-d.size * (0.42 + i * 0.06), d.size * (0.05 + i * 0.12));
        ctx.lineTo(d.size * (0.42 + i * 0.06), d.size * (0.05 + i * 0.12));
        ctx.closePath();
        ctx.fill();
      }
    } else if (d.kind === 'palm') {
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = d.size * 0.16;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + Math.sin(now * 0.001 + d.seed * 7) * 0.08;
        ctx.beginPath();
        ctx.moveTo(0, -d.size * 0.36);
        ctx.quadraticCurveTo(Math.cos(a) * d.size * 0.45, Math.sin(a) * d.size * 0.16 - d.size * 0.2, Math.cos(a) * d.size * 0.78, Math.sin(a) * d.size * 0.34 - d.size * 0.2);
        ctx.stroke();
      }
    } else {
      const g = ctx.createRadialGradient(-d.size * 0.25, -d.size * 0.35, 3, 0, 0, d.size);
      g.addColorStop(0, '#7ddf64');
      g.addColorStop(0.45, '#168f3a');
      g.addColorStop(1, '#0f4d25');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -d.size * 0.28, d.size * 0.58, 0, Math.PI * 2);
      ctx.arc(-d.size * 0.32, -d.size * 0.04, d.size * 0.42, 0, Math.PI * 2);
      ctx.arc(d.size * 0.3, -d.size * 0.02, d.size * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'bush' || d.kind === 'rock') {
    shadow(d.size * 0.42, d.size * 0.18, 0.14);
    ctx.fillStyle = d.kind === 'rock' ? '#64748b' : '#14532d';
    ctx.beginPath();
    ctx.ellipse(0, 0, d.size * 0.5, d.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'stand') {
    shadow(d.size * 0.9, d.size * 0.32, 0.25);
    const w = d.size * 1.45;
    const h = d.size * 0.62;
    ctx.fillStyle = '#172033';
    roundedRect(ctx, -w / 2, -h / 2, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.24);
    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < 13; i += 1) {
        const hue = (i * 37 + r * 50 + Math.floor(now / 90)) % 360;
        ctx.fillStyle = `hsl(${hue}, 70%, ${50 + Math.sin(now * 0.006 + i) * 12}%)`;
        ctx.fillRect(-w * 0.4 + i * w * 0.065, -h * 0.1 + r * h * 0.18, 5, 5);
      }
    }
  } else if (d.kind === 'light') {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -d.size * 2.2);
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = 'rgba(250,204,21,0.55)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, -d.size * 2.2, d.size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (d.kind === 'banner') {
    shadow(d.size * 0.7, d.size * 0.14, 0.2);
    const w = d.size * 1.7;
    const h = d.size * 0.38;
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#ef4444');
    g.addColorStop(0.55, '#facc15');
    g.addColorStop(1, '#22c55e');
    ctx.fillStyle = g;
    roundedRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fill();
    ctx.fillStyle = '#020617';
    ctx.font = `900 ${Math.max(10, d.size * 0.17)}px ui-monospace, monospace`;
    ctx.fillText(d.seed > 0.5 ? 'TWIN Games' : 'DRIFT CLUB', -w * 0.38, 4);
  } else if (d.kind === 'tent') {
    shadow(d.size * 0.54, d.size * 0.28, 0.16);
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(-d.size * 0.56, d.size * 0.42);
    ctx.lineTo(0, -d.size * 0.58);
    ctx.lineTo(d.size * 0.58, d.size * 0.42);
    ctx.closePath();
    ctx.fill();
  } else if (d.kind === 'house') {
    shadow(d.size * 0.6, d.size * 0.34, 0.2);
    ctx.fillStyle = '#92400e';
    roundedRect(ctx, -d.size * 0.54, -d.size * 0.36, d.size * 1.08, d.size * 0.72, 8);
    ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(-d.size * 0.66, -d.size * 0.36);
    ctx.lineTo(0, -d.size * 0.82);
    ctx.lineTo(d.size * 0.66, -d.size * 0.36);
    ctx.closePath();
    ctx.fill();
  } else if (d.kind === 'boat') {
    shadow(d.size * 0.55, d.size * 0.22, 0.18);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-d.size * 0.72, 0);
    ctx.lineTo(d.size * 0.62, -d.size * 0.28);
    ctx.lineTo(d.size * 0.82, 0);
    ctx.lineTo(d.size * 0.62, d.size * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    roundedRect(ctx, d.size * 0.08, -d.size * 0.14, d.size * 0.38, d.size * 0.28, 5);
    ctx.fill();
  } else if (d.kind === 'flag') {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, d.size * 0.5);
    ctx.lineTo(0, -d.size * 0.7);
    ctx.stroke();
    ctx.fillStyle = d.seed > 0.5 ? '#f43f5e' : '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -d.size * 0.7);
    ctx.quadraticCurveTo(d.size * 0.52, -d.size * 0.65 + Math.sin(now * 0.006 + d.seed) * 4, d.size * 0.7, -d.size * 0.42);
    ctx.quadraticCurveTo(d.size * 0.38, -d.size * 0.28, 0, -d.size * 0.34);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const k = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(226,232,240,${0.16 * k})`;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (1.7 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(253,186,116,${0.85 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-p.vx * 3.5, -p.vy * 3.5);
      ctx.stroke();
    } else if (p.kind === 'grass') {
      ctx.fillStyle = `rgba(134,239,172,${0.42 * k})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.kind === 'sand' ? `rgba(234,179,8,${0.25 * k})` : `rgba(148,163,184,${0.26 * k})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.3, p.size * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.965, dt);
    p.vy *= Math.pow(0.965, dt);
    p.angle += 0.04 * dt;
    p.life -= 0.025 * dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

function drawTireMarks(ctx: CanvasRenderingContext2D, marks: TireMark[], dt: number) {
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const m = marks[i];
    ctx.strokeStyle = `rgba(0,0,0,${0.24 * m.life})`;
    ctx.lineWidth = m.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
    m.life -= 0.0028 * dt;
    if (m.life <= 0) marks.splice(i, 1);
  }
  if (marks.length > 350) marks.splice(0, marks.length - 350);
}

function drawCar(ctx: CanvasRenderingContext2D, car: Car, now: number) {
  const speed = Math.hypot(car.vx, car.vy);
  const glow = smoothstep(2, 10, speed);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  ctx.save();
  ctx.rotate(-car.angle + 0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(7, 11, 36 + speed * 0.5, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (glow > 0.15) {
    const g = ctx.createLinearGradient(18, 0, 180, 0);
    g.addColorStop(0, `rgba(254,240,138,${0.16 * glow})`);
    g.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(18, -9);
    ctx.lineTo(180, -36);
    ctx.lineTo(180, 36);
    ctx.lineTo(18, 9);
    ctx.closePath();
    ctx.fill();
  }

  const wheel = (x: number, y: number, front: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    if (front) ctx.rotate(car.wheel * 0.45);
    ctx.fillStyle = '#020617';
    roundedRect(ctx, -9, -7, 18, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#475569';
    roundedRect(ctx, -7, -5, 14, 10, 4);
    ctx.fill();
    ctx.restore();
  };
  wheel(-18, -15, false);
  wheel(-18, 15, false);
  wheel(20, -15, true);
  wheel(20, 15, true);

  const body = ctx.createLinearGradient(-29, -15, 34, 18);
  body.addColorStop(0, '#92400e');
  body.addColorStop(0.45, '#facc15');
  body.addColorStop(1, '#f97316');
  ctx.fillStyle = body;
  roundedRect(ctx, -31, -15, 66, 30, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 2;
  roundedRect(ctx, -28, -12, 60, 24, 10);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  roundedRect(ctx, 0, -11, 19, 22, 7);
  ctx.fill();
  const glass = ctx.createLinearGradient(2, -10, 16, 10);
  glass.addColorStop(0, '#bae6fd');
  glass.addColorStop(1, '#0369a1');
  ctx.fillStyle = glass;
  roundedRect(ctx, 3, -9, 14, 18, 5);
  ctx.fill();

  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(28, -10, 5, 7);
  ctx.fillRect(28, 3, 5, 7);
  ctx.fillStyle = car.brakeGlow > 0.08 ? '#ef4444' : 'rgba(239,68,68,0.5)';
  ctx.shadowColor = car.brakeGlow > 0.08 ? '#ef4444' : 'transparent';
  ctx.shadowBlur = car.brakeGlow > 0.08 ? 15 : 0;
  ctx.fillRect(-32, -10, 4, 7);
  ctx.fillRect(-32, 3, 4, 7);
  ctx.shadowBlur = 0;

  if (car.throttleGlow > 0.1 && speed > 1.5) {
    ctx.fillStyle = `rgba(255,255,255,${(0.16 + Math.sin(now * 0.04) * 0.04) * car.throttleGlow})`;
    ctx.beginPath();
    ctx.ellipse(-39, 0, 10 + car.throttleGlow * 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMiniMap(ctx: CanvasRenderingContext2D, track: TrackPoint[], car: Car, height: number) {
  const size = SETTINGS.minimap;
  const x = 18;
  const y = height - size - 70;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  track.forEach(p => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  const pad = 15;
  const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxY - minY));
  const ox = x + size / 2 - ((minX + maxX) / 2) * scale;
  const oy = y + size / 2 - ((minY + maxY) / 2) * scale;
  const mx = (wx: number) => ox + wx * scale;
  const my = (wy: number) => oy + wy * scale;

  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(3, 7, 18, 0.32)';
  roundedRect(ctx, x, y, size, size, 20);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundedRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, 20);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  track.forEach((p, i) => (i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y))));
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(250,204,21,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.translate(mx(car.x), my(car.y));
  ctx.rotate(car.angle);
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawWorld(ctx: CanvasRenderingContext2D, track: TrackPoint[], decor: Decor[], car: Car, particles: Particle[], marks: TireMark[], dt: number, now: number) {
  drawGround(ctx, car.x, car.y, now);

  drawPath(ctx, track, SETTINGS.trackWidth + SETTINGS.curbWidth * 2 + 46, 'rgba(0,0,0,0.23)');
  drawPath(ctx, track, SETTINGS.trackWidth + SETTINGS.curbWidth * 2 + 26, '#6b4423');
  drawPath(ctx, track, SETTINGS.trackWidth + SETTINGS.curbWidth * 2 + 10, '#8b5a2b');
  drawCurbs(ctx, track, 1);
  drawCurbs(ctx, track, -1);

  drawPath(ctx, track, SETTINGS.trackWidth + 8, '#0b0f14');
  drawPath(ctx, track, SETTINGS.trackWidth, '#20242b');
  drawPath(ctx, track, SETTINGS.trackWidth - 18, '#262b33');

  ctx.save();
  ctx.setLineDash([38, 52]);
  drawPath(ctx, track, 3, 'rgba(255,255,255,0.14)');
  ctx.setLineDash([]);
  ctx.restore();

  // Low guard rails. They are narrow visually but hard in physics, so corners cannot be cut.
  drawSidePath(ctx, track, BARRIER_LIMIT, 9, 'rgba(2,6,23,0.82)');
  drawSidePath(ctx, track, -BARRIER_LIMIT, 9, 'rgba(2,6,23,0.82)');
  drawSidePath(ctx, track, BARRIER_LIMIT, 2, 'rgba(248,250,252,0.38)');
  drawSidePath(ctx, track, -BARRIER_LIMIT, 2, 'rgba(248,250,252,0.38)');

  drawTireMarks(ctx, marks, dt);
  drawFinish(ctx, now);
  decor.forEach(d => drawDecor(ctx, d, now, car));
  drawParticles(ctx, particles, dt);
  drawCar(ctx, car, now);
}

export const RaceGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  const track = useMemo(() => buildTrack(), []);
  const decor = useMemo(() => generateWorld(track), [track]);

  const car = useRef<Car>(initialCar());
  const controls = useRef<Controls>({ throttle: false, brake: false, left: false, right: false, handbrake: false });
  const stick = useRef<Stick>(initialStick());
  const particles = useRef<Particle[]>([]);
  const marks = useRef<TireMark[]>([]);
  const camera = useRef({ x: START_X, y: START_Y, zoom: 1, sx: 0, sy: 0 });
  const viewport = useRef({ width: 0, height: 0, dpr: 1 });
  const lapStart = useRef(performance.now());
  const bestLap = useRef<number | null>(null);
  const timing = useRef({ last: 0, hud: 0 });

  const [lap, setLap] = useState(1);
  const [stickUi, setStickUi] = useState({ active: false, x: 0, y: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = containerRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    viewport.current = { width, height, dpr };
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const reset = useCallback(() => {
    car.current = initialCar();
    particles.current = [];
    marks.current = [];
    camera.current = { x: START_X, y: START_Y, zoom: 1, sx: 0, sy: 0 };
    lapStart.current = performance.now();
    bestLap.current = null;
    setLap(1);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r'].includes(k)) e.preventDefault();
      if (k === 'arrowup' || k === 'w') controls.current.throttle = true;
      if (k === 'arrowdown' || k === 's') controls.current.brake = true;
      if (k === 'arrowleft' || k === 'a') controls.current.left = true;
      if (k === 'arrowright' || k === 'd') controls.current.right = true;
      if (k === ' ') controls.current.handbrake = true;
      if (k === 'r') reset();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') controls.current.throttle = false;
      if (k === 'arrowdown' || k === 's') controls.current.brake = false;
      if (k === 'arrowleft' || k === 'a') controls.current.left = false;
      if (k === 'arrowright' || k === 'd') controls.current.right = false;
      if (k === ' ') controls.current.handbrake = false;
    };
    const prevent = (e: TouchEvent) => e.cancelable && e.preventDefault();
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('touchmove', prevent);
    };
  }, [reset]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const loop = (now: number) => {
      const vp = viewport.current;
      const t = timing.current;
      const dtMs = t.last === 0 ? 16.67 : Math.min(now - t.last, 33.34);
      const dt = dtMs / 16.67;
      t.last = now;

      updatePhysics({
        car: car.current,
        controls: controls.current,
        stick: stick.current,
        track,
        particles: particles.current,
        marks: marks.current,
        now,
        dt,
        lapStart,
        bestLap,
        onLap: () => setLap(v => Math.min(v + 1, TOTAL_LAPS)),
      });

      const c = car.current;
      const speed = Math.hypot(c.vx, c.vy);
      const cam = camera.current;
      const look = clamp(speed * 22, 70, 340);
      cam.x = lerp(cam.x, c.x + Math.cos(c.angle) * look + c.vx * 9, 0.058 * dt);
      cam.y = lerp(cam.y, c.y + Math.sin(c.angle) * look + c.vy * 9, 0.058 * dt);
      cam.zoom = lerp(cam.zoom, 1.08 - clamp(speed / 18, 0, 1) * 0.18, 0.04 * dt);
      cam.sx = (Math.random() - 0.5) * c.shake * 18;
      cam.sy = (Math.random() - 0.5) * c.shake * 18;

      ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, vp.width, vp.height);

      ctx.save();
      ctx.translate(vp.width / 2 + cam.sx, vp.height / 2 + cam.sy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      drawWorld(ctx, track, decor, c, particles.current, marks.current, dt, now);
      ctx.restore();

      const vignette = ctx.createRadialGradient(vp.width / 2, vp.height / 2, Math.min(vp.width, vp.height) * 0.22, vp.width / 2, vp.height / 2, Math.max(vp.width, vp.height) * 0.72);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, vp.width, vp.height);

      drawMiniMap(ctx, track, c, vp.height);
      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [decor, track]);

  const pointerStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { active: true, pointerId: e.pointerId, sx: e.clientX - r.left, sy: e.clientY - r.top, vx: 0, vy: 0, ix: 0, iy: 0, power: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setStickUi({ active: true, x: 0, y: 0 });
  };

  const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s.active || s.pointerId !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - r.left - s.sx;
    const dy = e.clientY - r.top - s.sy;
    const d = Math.max(1, Math.hypot(dx, dy));
    const limit = 54;
    const m = Math.min(d, limit);
    s.vx = (dx / d) * m;
    s.vy = (dy / d) * m;
    s.ix = s.vx / limit;
    s.iy = s.vy / limit;
    s.power = clamp(d / limit, 0, 1);
    setStickUi({ active: true, x: s.vx, y: s.vy });
  };

  const pointerEnd = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && stick.current.pointerId !== e.pointerId) return;
    stick.current = initialStick();
    setStickUi({ active: false, x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-164px)] min-h-[520px] overflow-hidden bg-[#030712] font-mono text-white select-none touch-none overscroll-none"
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 shadow-2xl backdrop-blur-md">
          <div className="min-w-[82px] rounded-xl bg-white/8 px-3 py-2 text-center">
            <div className="text-[8px] font-black uppercase tracking-[0.28em] text-white/45">Lap</div>
            <div className="text-2xl font-black leading-none text-yellow-200 tabular-nums">{lap}/{TOTAL_LAPS}</div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="min-w-[82px] rounded-xl bg-white/8 px-3 py-2 text-center">
            <div className="text-[8px] font-black uppercase tracking-[0.28em] text-white/45">Pos</div>
            <div className="text-2xl font-black leading-none text-white tabular-nums">1/{PLACE_TOTAL}</div>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-20 right-10 z-50 flex h-40 w-40 touch-none items-center justify-center rounded-full border border-white/15 bg-black/35 shadow-[0_0_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
        onPointerDown={pointerStart}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onPointerLeave={pointerEnd}
      >
        <div className="absolute inset-4 rounded-full border border-white/10" />
        <div className="absolute h-24 w-[1px] bg-white/10" />
        <div className="absolute h-[1px] w-24 bg-white/10" />
        <div
          className="pointer-events-none h-[66px] w-[66px] rounded-full border-2 border-black/25 bg-gradient-to-br from-white via-gray-200 to-gray-500 shadow-2xl transition-transform"
          style={{
            transform: `translate(${stickUi.x}px, ${stickUi.y}px) scale(${stickUi.active ? 1.04 : 1})`,
            transitionDuration: stickUi.active ? '0ms' : '150ms',
          }}
        />
      </div>
    </div>
  );
};

export default RaceGame;
