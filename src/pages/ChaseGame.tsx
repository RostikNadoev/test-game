import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Team = 'player' | 'rival';
type Role = 'chaser' | 'runner';

type RectObstacle = {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

type CircleObstacle = {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
};

type Obstacle = RectObstacle | CircleObstacle;

type MapConfig = {
  name: string;
  subtitle: string;
  theme: 'neon' | 'temple';
  bgTop: string;
  bgBottom: string;
  floorA: string;
  floorB: string;
  line: string;
  border: string;
  chaserSpawn: { x: number; y: number };
  runnerSpawn: { x: number; y: number };
  obstacles: Obstacle[];
};

type Runner = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  anim: number;
  radius: number;
};

type RoundInfo = {
  mapIndex: number;
  chaser: Team;
  evader: Team;
};

type RoundResult = {
  mapName: string;
  evaderLabel: string;
  chaserLabel: string;
  time: number;
};

type StickUi = {
  active: boolean;
  visualX: number;
  visualY: number;
};

type KeysState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

type InputVector = { x: number; y: number };

const WORLD_W = 760;
const WORLD_H = 1160;
const WORLD_MARGIN = 42;
const CATCH_DISTANCE_PAD = 2;

const MAPS: MapConfig[] = [
  {
    name: 'Neon District',
    subtitle: 'крыши, тоннели света и узкие обходы',
    theme: 'neon',
    bgTop: '#030712',
    bgBottom: '#071226',
    floorA: '#101827',
    floorB: '#0c1422',
    line: 'rgba(103,232,249,0.12)',
    border: 'rgba(255,255,255,0.08)',
    chaserSpawn: { x: 112, y: 1038 },
    runnerSpawn: { x: 648, y: 124 },
    obstacles: [
      { kind: 'rect', x: 72, y: 118, w: 226, h: 86, r: 26 },
      { kind: 'rect', x: 454, y: 142, w: 216, h: 98, r: 26 },
      { kind: 'rect', x: 310, y: 256, w: 142, h: 128, r: 26 },
      { kind: 'circle', x: 170, y: 330, r: 48 },
      { kind: 'rect', x: 486, y: 332, w: 154, h: 76, r: 22 },
      { kind: 'rect', x: 136, y: 456, w: 190, h: 74, r: 22 },
      { kind: 'rect', x: 392, y: 470, w: 238, h: 92, r: 24 },
      { kind: 'circle', x: 380, y: 672, r: 78 },
      { kind: 'rect', x: 86, y: 620, w: 154, h: 92, r: 24 },
      { kind: 'rect', x: 534, y: 624, w: 126, h: 180, r: 24 },
      { kind: 'rect', x: 126, y: 814, w: 170, h: 172, r: 28 },
      { kind: 'rect', x: 370, y: 868, w: 228, h: 78, r: 24 },
      { kind: 'circle', x: 612, y: 1000, r: 46 },
    ],
  },
  {
    name: 'Sun Temple',
    subtitle: 'песок, колонны и кривые проходы',
    theme: 'temple',
    bgTop: '#24180d',
    bgBottom: '#372513',
    floorA: '#715332',
    floorB: '#88643b',
    line: 'rgba(255,244,200,0.12)',
    border: 'rgba(255,255,255,0.08)',
    chaserSpawn: { x: 120, y: 130 },
    runnerSpawn: { x: 638, y: 1034 },
    obstacles: [
      { kind: 'rect', x: 164, y: 154, w: 438, h: 70, r: 24 },
      { kind: 'circle', x: 380, y: 314, r: 58 },
      { kind: 'rect', x: 92, y: 332, w: 106, h: 230, r: 22 },
      { kind: 'rect', x: 562, y: 332, w: 106, h: 230, r: 22 },
      { kind: 'rect', x: 254, y: 444, w: 252, h: 66, r: 20 },
      { kind: 'circle', x: 198, y: 682, r: 52 },
      { kind: 'circle', x: 564, y: 682, r: 52 },
      { kind: 'rect', x: 310, y: 592, w: 140, h: 202, r: 26 },
      { kind: 'rect', x: 120, y: 826, w: 210, h: 72, r: 22 },
      { kind: 'rect', x: 430, y: 826, w: 208, h: 72, r: 22 },
      { kind: 'rect', x: 248, y: 962, w: 266, h: 82, r: 24 },
    ],
  },
];

const ROUND_SEQUENCE: RoundInfo[] = [
  { mapIndex: 0, chaser: 'player', evader: 'rival' },
  { mapIndex: 0, chaser: 'rival', evader: 'player' },
  { mapIndex: 1, chaser: 'player', evader: 'rival' },
  { mapIndex: 1, chaser: 'rival', evader: 'player' },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const distance = (x1: number, y1: number, x2: number, y2: number) =>
  Math.hypot(x2 - x1, y2 - y1);

const normalize = (x: number, y: number) => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};

const lerpAngle = (from: number, to: number, t: number) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
};

const labelForTeam = (team: Team) => (team === 'player' ? 'YOU' : 'RIVAL');

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const vectorFromKeys = (keys: KeysState) => {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (!x && !y) return { x: 0, y: 0 };
  return normalize(x, y);
};

const combineInputs = (a: InputVector, b: InputVector) => {
  const x = a.x + b.x;
  const y = a.y + b.y;
  const mag = Math.hypot(x, y);
  if (mag <= 1) return { x, y };
  return { x: x / mag, y: y / mag };
};

const getMovementProfile = (role: Role) => {
  if (role === 'chaser') {
    return {
      maxSpeed: 202,
      accel: 12.8,
      brake: 16.5,
      drag: 1.55,
      turnLerp: 0.22,
    };
  }

  return {
    maxSpeed: 176,
    accel: 11.2,
    brake: 15.4,
    drag: 1.8,
    turnLerp: 0.18,
  };
};

const absorbVelocityAgainstNormal = (runner: Runner, nx: number, ny: number) => {
  const alongNormal = runner.vx * nx + runner.vy * ny;
  if (alongNormal < 0) {
    runner.vx -= alongNormal * nx;
    runner.vy -= alongNormal * ny;
  }
};

const applyBounds = (runner: Runner) => {
  const minX = WORLD_MARGIN + runner.radius;
  const maxX = WORLD_W - WORLD_MARGIN - runner.radius;
  const minY = WORLD_MARGIN + runner.radius;
  const maxY = WORLD_H - WORLD_MARGIN - runner.radius;

  if (runner.x < minX) {
    runner.x = minX;
    runner.vx = Math.max(0, runner.vx);
  }
  if (runner.x > maxX) {
    runner.x = maxX;
    runner.vx = Math.min(0, runner.vx);
  }
  if (runner.y < minY) {
    runner.y = minY;
    runner.vy = Math.max(0, runner.vy);
  }
  if (runner.y > maxY) {
    runner.y = maxY;
    runner.vy = Math.min(0, runner.vy);
  }
};

const separateFromCircle = (runner: Runner, obstacle: CircleObstacle) => {
  const dx = runner.x - obstacle.x;
  const dy = runner.y - obstacle.y;
  const dist = Math.hypot(dx, dy);
  const minDist = runner.radius + obstacle.r;

  if (dist >= minDist) return;

  if (dist > 0.0001) {
    const nx = dx / dist;
    const ny = dy / dist;
    const push = minDist - dist;
    runner.x += nx * push;
    runner.y += ny * push;
    absorbVelocityAgainstNormal(runner, nx, ny);
    return;
  }

  runner.x += minDist;
  runner.vx = Math.max(0, runner.vx);
};

const separateFromRect = (runner: Runner, obstacle: RectObstacle) => {
  const nearestX = clamp(runner.x, obstacle.x, obstacle.x + obstacle.w);
  const nearestY = clamp(runner.y, obstacle.y, obstacle.y + obstacle.h);
  const dx = runner.x - nearestX;
  const dy = runner.y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < runner.radius * runner.radius && distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const push = runner.radius - dist;
    runner.x += nx * push;
    runner.y += ny * push;
    absorbVelocityAgainstNormal(runner, nx, ny);
    return;
  }

  const insideX = runner.x >= obstacle.x && runner.x <= obstacle.x + obstacle.w;
  const insideY = runner.y >= obstacle.y && runner.y <= obstacle.y + obstacle.h;

  if (!insideX || !insideY) return;

  const left = Math.abs(runner.x - obstacle.x);
  const right = Math.abs(obstacle.x + obstacle.w - runner.x);
  const top = Math.abs(runner.y - obstacle.y);
  const bottom = Math.abs(obstacle.y + obstacle.h - runner.y);
  const min = Math.min(left, right, top, bottom);

  if (min === left) {
    runner.x = obstacle.x - runner.radius;
    absorbVelocityAgainstNormal(runner, -1, 0);
  } else if (min === right) {
    runner.x = obstacle.x + obstacle.w + runner.radius;
    absorbVelocityAgainstNormal(runner, 1, 0);
  } else if (min === top) {
    runner.y = obstacle.y - runner.radius;
    absorbVelocityAgainstNormal(runner, 0, -1);
  } else {
    runner.y = obstacle.y + obstacle.h + runner.radius;
    absorbVelocityAgainstNormal(runner, 0, 1);
  }
};

const resolveRunnerCollisions = (runner: Runner, map: MapConfig) => {
  applyBounds(runner);

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < map.obstacles.length; i += 1) {
      const obstacle = map.obstacles[i];
      if (obstacle.kind === 'circle') separateFromCircle(runner, obstacle);
      else separateFromRect(runner, obstacle);
    }
    applyBounds(runner);
  }
};

const moveRunner = (
  runner: Runner,
  input: InputVector,
  role: Role,
  map: MapConfig,
  dt: number,
) => {
  const profile = getMovementProfile(role);
  const mag = clamp(Math.hypot(input.x, input.y), 0, 1);
  const nx = mag > 0.001 ? input.x / mag : 0;
  const ny = mag > 0.001 ? input.y / mag : 0;

  const desiredVx = nx * profile.maxSpeed * mag;
  const desiredVy = ny * profile.maxSpeed * mag;
  const response = mag > 0.001 ? profile.accel : profile.brake;
  const blend = 1 - Math.exp(-response * dt);

  runner.vx += (desiredVx - runner.vx) * blend;
  runner.vy += (desiredVy - runner.vy) * blend;

  const dragFactor = Math.exp(-profile.drag * dt);
  runner.vx *= dragFactor;
  runner.vy *= dragFactor;

  const moveX = runner.vx * dt;
  const moveY = runner.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveY) / 8));

  for (let i = 0; i < steps; i += 1) {
    runner.x += moveX / steps;
    runner.y += moveY / steps;
    resolveRunnerCollisions(runner, map);
  }

  const speed = Math.hypot(runner.vx, runner.vy);
  if (speed > 1) {
    runner.angle = lerpAngle(runner.angle, Math.atan2(runner.vy, runner.vx), profile.turnLerp);
    runner.anim += speed * dt * 0.08;
  }
};

const drawMap = (ctx: CanvasRenderingContext2D, map: MapConfig, now: number) => {
  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, map.bgTop);
  bg.addColorStop(1, map.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const vignette = ctx.createRadialGradient(
    WORLD_W / 2,
    WORLD_H / 2,
    180,
    WORLD_W / 2,
    WORLD_H / 2,
    780,
  );
  vignette.addColorStop(0, 'rgba(255,255,255,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.26)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 40);
  const field = ctx.createLinearGradient(0, 24, 0, WORLD_H - 24);
  field.addColorStop(0, map.floorA);
  field.addColorStop(1, map.floorB);
  ctx.fillStyle = field;
  ctx.fill();

  ctx.save();
  roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 40);
  ctx.clip();

  for (let i = 0; i < 13; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.012)';
    ctx.fillRect(24, 24 + ((WORLD_H - 48) / 13) * i, WORLD_W - 48, (WORLD_H - 48) / 13);
  }

  if (map.theme === 'neon') {
    const glow1 = ctx.createRadialGradient(132, 194, 20, 132, 194, 220);
    glow1.addColorStop(0, 'rgba(34,211,238,0.16)');
    glow1.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const glow2 = ctx.createRadialGradient(610, 940, 20, 610, 940, 250);
    glow2.addColorStop(0, 'rgba(192,132,252,0.18)');
    glow2.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.strokeStyle = 'rgba(103,232,249,0.10)';
    ctx.lineWidth = 1;
    for (let x = 70; x < WORLD_W - 60; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, WORLD_H - 40);
      ctx.stroke();
    }

    for (let y = 80; y < WORLD_H - 80; y += 120) {
      const pulse = Math.sin(now * 0.0018 + y * 0.01) * 10;
      ctx.strokeStyle = 'rgba(34,211,238,0.08)';
      ctx.beginPath();
      ctx.moveTo(52, y + pulse);
      ctx.lineTo(WORLD_W - 52, y - pulse * 0.4);
      ctx.stroke();
    }
  } else {
    const sun = ctx.createRadialGradient(612, 132, 20, 612, 132, 210);
    sun.addColorStop(0, 'rgba(255,244,200,0.26)');
    sun.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (let y = 78; y < WORLD_H - 60; y += 104) {
      ctx.fillStyle = 'rgba(255,244,200,0.03)';
      ctx.fillRect(44, y, WORLD_W - 88, 18);
    }

    for (let i = 0; i < 18; i += 1) {
      const x = 60 + (i * 41) % 640;
      const y = 90 + (i * 83) % 940;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.ellipse(x, y, 16, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = map.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(WORLD_W / 2, 44);
  ctx.lineTo(WORLD_W / 2, WORLD_H - 44);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(WORLD_W / 2, WORLD_H / 2, 94, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < map.obstacles.length; i += 1) {
    const obstacle = map.obstacles[i];

    if (obstacle.kind === 'rect') {
      const { x, y, w, h } = obstacle;
      const r = obstacle.r ?? 20;

      if (map.theme === 'neon') {
        const fill = ctx.createLinearGradient(x, y, x, y + h);
        fill.addColorStop(0, '#162133');
        fill.addColorStop(1, '#0b1220');
        ctx.fillStyle = fill;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();

        ctx.strokeStyle = 'rgba(103,232,249,0.26)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRect(ctx, x + 10, y + 10, w - 20, 12, 8);
        ctx.fill();
      } else {
        const fill = ctx.createLinearGradient(x, y, x, y + h);
        fill.addColorStop(0, '#c89b63');
        fill.addColorStop(1, '#8b653c');
        ctx.fillStyle = fill;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,244,200,0.18)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let yy = y + 14; yy < y + h - 8; yy += 20) {
          ctx.fillRect(x + 12, yy, w - 24, 2);
        }
      }
    } else {
      if (map.theme === 'neon') {
        const orb = ctx.createRadialGradient(
          obstacle.x - 8,
          obstacle.y - 8,
          4,
          obstacle.x,
          obstacle.y,
          obstacle.r,
        );
        orb.addColorStop(0, '#f8fafc');
        orb.addColorStop(0.3, '#334155');
        orb.addColorStop(1, '#0f172a');
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(34,211,238,0.24)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const stone = ctx.createRadialGradient(
          obstacle.x - 8,
          obstacle.y - 10,
          4,
          obstacle.x,
          obstacle.y,
          obstacle.r,
        );
        stone.addColorStop(0, '#f4deb1');
        stone.addColorStop(0.28, '#aa7c46');
        stone.addColorStop(1, '#7b5b35');
        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,244,200,0.16)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  ctx.restore();

  const spawnRunnerGlow = ctx.createRadialGradient(
    map.runnerSpawn.x,
    map.runnerSpawn.y,
    10,
    map.runnerSpawn.x,
    map.runnerSpawn.y,
    78,
  );
  spawnRunnerGlow.addColorStop(0, 'rgba(45,212,191,0.18)');
  spawnRunnerGlow.addColorStop(1, 'rgba(45,212,191,0)');
  ctx.fillStyle = spawnRunnerGlow;
  ctx.beginPath();
  ctx.arc(map.runnerSpawn.x, map.runnerSpawn.y, 78, 0, Math.PI * 2);
  ctx.fill();

  const spawnChaserGlow = ctx.createRadialGradient(
    map.chaserSpawn.x,
    map.chaserSpawn.y,
    10,
    map.chaserSpawn.x,
    map.chaserSpawn.y,
    78,
  );
  spawnChaserGlow.addColorStop(0, 'rgba(248,113,113,0.16)');
  spawnChaserGlow.addColorStop(1, 'rgba(248,113,113,0)');
  ctx.fillStyle = spawnChaserGlow;
  ctx.beginPath();
  ctx.arc(map.chaserSpawn.x, map.chaserSpawn.y, 78, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = map.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 40);
  ctx.stroke();
};

const drawRunner = (
  ctx: CanvasRenderingContext2D,
  runner: Runner,
  team: Team,
  role: Role,
) => {
  const playerPalette = {
    hood: '#f59e0b',
    body: '#1f2937',
    accent: '#fde68a',
    trim: '#fb923c',
  };

  const rivalPalette = {
    hood: '#60a5fa',
    body: '#172554',
    accent: '#dbeafe',
    trim: '#38bdf8',
  };

  const palette = team === 'player' ? playerPalette : rivalPalette;
  const roleGlow = role === 'chaser' ? 'rgba(248,113,113,0.34)' : 'rgba(45,212,191,0.3)';
  const speed = Math.hypot(runner.vx, runner.vy);
  const stride = Math.sin(runner.anim * 6.2) * Math.min(4, speed * 0.03);

  ctx.save();
  ctx.translate(runner.x, runner.y);
  ctx.rotate(runner.angle + Math.PI / 2);

  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 19, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const aura = ctx.createRadialGradient(0, 2, 6, 0, 2, 36);
  aura.addColorStop(0, roleGlow);
  aura.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 2, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.body;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-5, 14);
  ctx.lineTo(-7 + stride, 28);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(5, 14);
  ctx.lineTo(7 - stride, 28);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-16 + stride * 0.5, 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(16 - stride * 0.5, 12);
  ctx.stroke();

  ctx.fillStyle = palette.body;
  roundRect(ctx, -13, -3, 26, 28, 11);
  ctx.fill();

  ctx.fillStyle = palette.trim;
  roundRect(ctx, -13, -3, 26, 9, 8);
  ctx.fill();

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(0, -12, 11.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.hood;
  ctx.beginPath();
  ctx.arc(0, -14, 13.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.arc(0, -11, 9.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-3.2, -12, 1.7, 0, Math.PI * 2);
  ctx.arc(3.2, -12, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.lineTo(6, -3);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(-4.5, -17, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const ChaseHUDMini = ({
  leftName,
  leftRole,
  centerTop,
  centerBottom,
  rightName,
  rightRole,
}: {
  leftName: string;
  leftRole: string;
  centerTop: string;
  centerBottom: string;
  rightName: string;
  rightRole: string;
}) => {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
      <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 shadow-2xl">
        <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">
          {leftName}
        </div>
        <div className="text-sm font-black text-white mt-0.5 leading-none">{leftRole}</div>
      </div>

      <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 text-center shadow-2xl min-w-[138px]">
        <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">
          {centerTop}
        </div>
        <div className="text-sm font-black text-white mt-0.5 leading-none">{centerBottom}</div>
      </div>

      <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 text-right shadow-2xl">
        <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">
          {rightName}
        </div>
        <div className="text-sm font-black text-white mt-0.5 leading-none">{rightRole}</div>
      </div>
    </div>
  );
};

export const ChaseGame: React.FC = () => {
  const navigate = useNavigate();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rafRef = useRef<number | null>(null);
  const nextRoundTimeoutRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastUiSyncRef = useRef(0);

  const layoutRef = useRef({
    width: 0,
    height: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  });

  const playerRef = useRef<Runner>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    anim: 0,
    radius: 20,
  });

  const rivalRef = useRef<Runner>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: Math.PI / 2,
    anim: 0,
    radius: 20,
  });

  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }[]
  >([]);

  const roundIndexRef = useRef(0);
  const roundStartAtRef = useRef(0);
  const currentMapRef = useRef<MapConfig>(MAPS[0]);
  const currentRoundRef = useRef<RoundInfo>(ROUND_SEQUENCE[0]);
  const winnerRef = useRef<string | null>(null);
  const survivalTotalsRef = useRef({ player: 0, rival: 0 });

  const joystickInputRef = useRef({
    active: false,
    centerX: 0,
    centerY: 0,
    inputX: 0,
    inputY: 0,
  });

  const playerKeysRef = useRef<KeysState>({ up: false, down: false, left: false, right: false });
  const rivalKeysRef = useRef<KeysState>({ up: false, down: false, left: false, right: false });

  /**
   * TODO online:
   * when socket input arrives, just write to this ref and set connected=true.
   * Then you can remove the IJKL debug fallback below.
   */
  const remoteRivalInputRef = useRef({ x: 0, y: 0, connected: false });

  const [joystickUi, setJoystickUi] = useState<StickUi>({
    active: false,
    visualX: 0,
    visualY: 0,
  });

  const [roundTimer, setRoundTimer] = useState('0.0s');
  const [roundTitle, setRoundTitle] = useState('Map 1/2 • Turn 1/2');
  const [mapTitle, setMapTitle] = useState(MAPS[0].name);
  const [playerRole, setPlayerRole] = useState('CHASER');
  const [rivalRole, setRivalRole] = useState('RUNNER');
  const [banner, setBanner] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [totals, setTotals] = useState({ player: 0, rival: 0 });

  const clearTimeouts = () => {
    if (nextRoundTimeoutRef.current) {
      window.clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
    if (bannerTimeoutRef.current) {
      window.clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
  };

  const setWinnerBoth = (value: string | null) => {
    winnerRef.current = value;
    setWinner(value);
  };

  const createBurst = (x: number, y: number, palette: string[], amount = 18) => {
    for (let i = 0; i < amount; i += 1) {
      const a = (Math.PI * 2 * i) / amount + Math.random() * 0.35;
      const s = 36 + Math.random() * 90;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.7 + Math.random() * 0.45,
        size: 2 + Math.random() * 3.2,
        color: palette[i % palette.length],
      });
    }
  };

  const startBanner = (text: string) => {
    setBanner(text);
    if (bannerTimeoutRef.current) window.clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = window.setTimeout(() => {
      setBanner(null);
    }, 1200);
  };

  const finishMatch = () => {
    const playerTotal = survivalTotalsRef.current.player;
    const rivalTotal = survivalTotalsRef.current.rival;

    setTotals({ player: playerTotal, rival: rivalTotal });

    if (playerTotal > rivalTotal) {
      setWinnerBoth('YOU WIN');
    } else if (rivalTotal > playerTotal) {
      setWinnerBoth('RIVAL WINS');
    } else {
      setWinnerBoth('DRAW');
    }
  };

  const startRound = (index: number) => {
    clearTimeouts();

    const round = ROUND_SEQUENCE[index];
    const map = MAPS[round.mapIndex];
    const playerIsChaser = round.chaser === 'player';
    const turnInMap = index % 2 === 0 ? 1 : 2;

    roundIndexRef.current = index;
    currentRoundRef.current = round;
    currentMapRef.current = map;
    roundStartAtRef.current = performance.now();
    lastUiSyncRef.current = 0;

    playerRef.current = {
      x: playerIsChaser ? map.chaserSpawn.x : map.runnerSpawn.x,
      y: playerIsChaser ? map.chaserSpawn.y : map.runnerSpawn.y,
      vx: 0,
      vy: 0,
      angle: playerIsChaser ? -0.85 : 2.3,
      anim: 0,
      radius: 20,
    };

    rivalRef.current = {
      x: playerIsChaser ? map.runnerSpawn.x : map.chaserSpawn.x,
      y: playerIsChaser ? map.runnerSpawn.y : map.chaserSpawn.y,
      vx: 0,
      vy: 0,
      angle: playerIsChaser ? 2.25 : -0.85,
      anim: 0,
      radius: 20,
    };

    setMapTitle(map.name);
    setRoundTitle(`Map ${round.mapIndex + 1}/2 • Turn ${turnInMap}/2`);
    setPlayerRole(playerIsChaser ? 'CHASER' : 'RUNNER');
    setRivalRole(playerIsChaser ? 'RUNNER' : 'CHASER');
    setRoundTimer('0.0s');

    startBanner(`${map.name} • ${playerIsChaser ? 'YOU CHASE' : 'YOU ESCAPE'}`);
  };

  const resetGame = () => {
    clearTimeouts();
    particlesRef.current = [];
    survivalTotalsRef.current = { player: 0, rival: 0 };
    setTotals({ player: 0, rival: 0 });
    setResults([]);
    setWinnerBoth(null);
    setBanner(null);
    startRound(0);
  };

  const finishRound = (elapsed: number) => {
    const round = currentRoundRef.current;
    const map = currentMapRef.current;
    const evader = round.evader;
    const chaser = round.chaser;

    if (evader === 'player') survivalTotalsRef.current.player += elapsed;
    else survivalTotalsRef.current.rival += elapsed;

    setTotals({
      player: survivalTotalsRef.current.player,
      rival: survivalTotalsRef.current.rival,
    });

    setResults((prev) => [
      ...prev,
      {
        mapName: map.name,
        evaderLabel: labelForTeam(evader),
        chaserLabel: labelForTeam(chaser),
        time: elapsed,
      },
    ]);

    const nextIndex = roundIndexRef.current + 1;
    if (nextIndex >= ROUND_SEQUENCE.length) {
      nextRoundTimeoutRef.current = window.setTimeout(() => {
        finishMatch();
      }, 800);
      return;
    }

    const nextRound = ROUND_SEQUENCE[nextIndex];
    const sameMap = nextRound.mapIndex === round.mapIndex;
    startBanner(
      sameMap
        ? `Swap roles • ${map.name}`
        : `Next map • ${MAPS[nextRound.mapIndex].name}`,
    );

    nextRoundTimeoutRef.current = window.setTimeout(() => {
      startRound(nextIndex);
    }, 950);
  };

  const getPlayerInput = () => {
    const stick = {
      x: joystickInputRef.current.inputX,
      y: joystickInputRef.current.inputY,
    };
    const keys = vectorFromKeys(playerKeysRef.current);
    return combineInputs(stick, keys);
  };

  const getRivalInput = () => {
    if (remoteRivalInputRef.current.connected) {
      const remote = remoteRivalInputRef.current;
      const mag = Math.hypot(remote.x, remote.y);
      if (mag <= 1) return { x: remote.x, y: remote.y };
      return { x: remote.x / mag, y: remote.y / mag };
    }

    return vectorFromKeys(rivalKeysRef.current);
  };

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyTouch = document.body.style.touchAction;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.touchAction = prevBodyTouch;
    };
  }, []);

  useEffect(() => {
    const onKey = (pressed: boolean) => (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'i', 'j', 'k', 'l'].includes(
          key,
        )
      ) {
        e.preventDefault();
      }

      switch (key) {
        case 'w':
        case 'arrowup':
          playerKeysRef.current.up = pressed;
          break;
        case 's':
        case 'arrowdown':
          playerKeysRef.current.down = pressed;
          break;
        case 'a':
        case 'arrowleft':
          playerKeysRef.current.left = pressed;
          break;
        case 'd':
        case 'arrowright':
          playerKeysRef.current.right = pressed;
          break;
        case 'i':
          rivalKeysRef.current.up = pressed;
          break;
        case 'k':
          rivalKeysRef.current.down = pressed;
          break;
        case 'j':
          rivalKeysRef.current.left = pressed;
          break;
        case 'l':
          rivalKeysRef.current.right = pressed;
          break;
        default:
          break;
      }
    };

    const handleDown = onKey(true);
    const handleUp = onKey(false);

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);

    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = rect.width;
      const height = rect.height;
      const scale = Math.min(width / WORLD_W, height / WORLD_H);
      const offsetX = (width - WORLD_W * scale) / 2;
      const offsetY = (height - WORLD_H * scale) / 2;

      layoutRef.current = {
        width,
        height,
        scale,
        offsetX,
        offsetY,
        dpr,
      };

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const preventTouch = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    const updateParticles = (dt: number) => {
      const next: typeof particlesRef.current = [];
      for (let i = 0; i < particlesRef.current.length; i += 1) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-2.2 * dt);
        p.vy *= Math.exp(-2.2 * dt);
        p.life -= dt * 1.45;
        if (p.life > 0) next.push(p);
      }
      particlesRef.current = next;
    };

    const drawParticles = () => {
      for (let i = 0; i < particlesRef.current.length; i += 1) {
        const p = particlesRef.current[i];
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      const prev = lastFrameRef.current || now;
      const dt = Math.min((now - prev) / 1000, 0.033);
      lastFrameRef.current = now;

      const map = currentMapRef.current;
      const round = currentRoundRef.current;
      const playerRoleNow: Role = round.chaser === 'player' ? 'chaser' : 'runner';
      const rivalRoleNow: Role = round.chaser === 'rival' ? 'chaser' : 'runner';

      if (!winnerRef.current) {
        moveRunner(playerRef.current, getPlayerInput(), playerRoleNow, map, dt);
        moveRunner(rivalRef.current, getRivalInput(), rivalRoleNow, map, dt);

        const elapsed = (now - roundStartAtRef.current) / 1000;

        if (now - lastUiSyncRef.current > 60) {
          setRoundTimer(`${elapsed.toFixed(1)}s`);
          lastUiSyncRef.current = now;
        }

        const chaserRunner = round.chaser === 'player' ? playerRef.current : rivalRef.current;
        const evaderRunner = round.evader === 'player' ? playerRef.current : rivalRef.current;

        if (
          distance(chaserRunner.x, chaserRunner.y, evaderRunner.x, evaderRunner.y) <=
          chaserRunner.radius + evaderRunner.radius - CATCH_DISTANCE_PAD
        ) {
          const roundTime = Number(elapsed.toFixed(2));
          const evaderLabel = labelForTeam(round.evader);

          createBurst(
            (chaserRunner.x + evaderRunner.x) / 2,
            (chaserRunner.y + evaderRunner.y) / 2,
            round.chaser === 'player'
              ? ['#f59e0b', '#fde68a', '#ffffff']
              : ['#60a5fa', '#dbeafe', '#ffffff'],
            28,
          );

          startBanner(`${evaderLabel} survived ${roundTime.toFixed(2)}s`);
          finishRound(roundTime);
        }
      }

      updateParticles(dt);

      const { width, height, scale, offsetX, offsetY } = layoutRef.current;
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      drawMap(ctx, map, now);
      drawRunner(ctx, playerRef.current, 'player', playerRoleNow);
      drawRunner(ctx, rivalRef.current, 'rival', rivalRoleNow);
      drawParticles();
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    wrap.addEventListener('touchstart', preventTouch, { passive: false });
    wrap.addEventListener('touchmove', preventTouch, { passive: false });

    resize();
    window.addEventListener('resize', resize);

    resetGame();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      clearTimeouts();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      wrap.removeEventListener('touchstart', preventTouch);
      wrap.removeEventListener('touchmove', preventTouch);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const updateJoystickFromPointer = (clientX: number, clientY: number) => {
    const joy = joystickInputRef.current;
    const dx = clientX - joy.centerX;
    const dy = clientY - joy.centerY;
    const d = Math.max(1, Math.hypot(dx, dy));
    const limit = 46;
    const visualX = (dx / d) * Math.min(d, limit);
    const visualY = (dy / d) * Math.min(d, limit);

    joy.inputX = visualX / limit;
    joy.inputY = visualY / limit;

    setJoystickUi({
      active: true,
      visualX,
      visualY,
    });
  };

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    joystickInputRef.current.active = true;
    joystickInputRef.current.centerX = rect.left + rect.width / 2;
    joystickInputRef.current.centerY = rect.top + rect.height / 2;
    updateJoystickFromPointer(e.clientX, e.clientY);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture failures
    }
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickInputRef.current.active) return;
    updateJoystickFromPointer(e.clientX, e.clientY);
  };

  const handleJoystickEnd = () => {
    joystickInputRef.current.active = false;
    joystickInputRef.current.inputX = 0;
    joystickInputRef.current.inputY = 0;

    setJoystickUi({
      active: false,
      visualX: 0,
      visualY: 0,
    });
  };

  const restart = () => {
    resetGame();
  };

  return (
    <div
      className="relative w-full h-full bg-[#05070d] overflow-hidden touch-none select-none"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <div className="absolute inset-0">
        <div className="absolute left-2 right-2 top-2 z-20 pointer-events-none">
          <ChaseHUDMini
            leftName="YOU"
            leftRole={playerRole}
            centerTop={roundTitle}
            centerBottom={`${mapTitle} • ${roundTimer}`}
            rightName="RIVAL"
            rightRole={rivalRole}
          />

          <div className="mt-2 flex justify-between items-center gap-2">
            <div className="rounded-full bg-black/35 border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-white/60 backdrop-blur-xl">
              Longer total escape time wins
            </div>

            <button
              onClick={() => navigate('/')}
              className="pointer-events-auto px-3 py-1.5 rounded-full bg-white/8 border border-white/10 text-[10px] uppercase tracking-[0.18em] font-bold text-white/75 active:scale-95 transition"
            >
              Exit
            </button>
          </div>
        </div>

        <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block w-full h-full touch-none"
            style={{ touchAction: 'none' }}
          />

          <div className="absolute left-3 bottom-5 z-20 pointer-events-none max-w-[250px]">
            <div className="rounded-2xl bg-black/35 border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.16em] font-bold text-white/55 backdrop-blur-xl leading-relaxed">
              Rival AI removed. For now rival uses IJKL in debug, later feed online input into
              remoteRivalInputRef.
            </div>
          </div>

          <div
            className="absolute right-4 bottom-8 z-20 w-32 h-32 rounded-full bg-black/40 border-4 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.45)] flex items-center justify-center touch-none"
            onPointerDown={handleJoystickStart}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickEnd}
            onPointerCancel={handleJoystickEnd}
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-3 rounded-full border border-white/10" />
            <div
              className="w-14 h-14 rounded-full border-2 border-white/20 shadow-2xl"
              style={{
                transform: `translate(${joystickUi.visualX}px, ${joystickUi.visualY}px)`,
                transition: joystickUi.active ? 'none' : 'transform 0.16s',
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(203,213,225,0.92))',
              }}
            />
          </div>

          {banner && (
            <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-6">
              <div className="rounded-[26px] bg-black/58 border border-white/12 backdrop-blur-xl px-6 py-4 shadow-2xl">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-white text-center">
                  {banner}
                </div>
              </div>
            </div>
          )}

          {winner && (
            <div className="absolute inset-0 z-40 bg-[#020617]/90 backdrop-blur-md flex items-center justify-center p-6">
              <div className="w-full max-w-[380px] rounded-[28px] bg-white px-7 py-8 text-center shadow-2xl">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                  Final Result
                </div>

                <div className="mt-3 text-4xl font-black text-slate-900">{winner}</div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/60 font-bold">
                      You escaped
                    </div>
                    <div className="text-2xl font-black text-emerald-600 mt-1">
                      {totals.player.toFixed(2)}s
                    </div>
                  </div>

                  <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-sky-700/60 font-bold">
                      Rival escaped
                    </div>
                    <div className="text-2xl font-black text-sky-600 mt-1">
                      {totals.rival.toFixed(2)}s
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-left max-h-[196px] overflow-auto">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold mb-2">
                    Escape Times By Round
                  </div>

                  <div className="space-y-2">
                    {results.map((item, index) => (
                      <div
                        key={`${item.mapName}-${item.evaderLabel}-${index}`}
                        className="flex items-center justify-between text-sm text-slate-700 font-semibold gap-3"
                      >
                        <span>
                          {index + 1}. {item.mapName} • {item.evaderLabel} escaped from {item.chaserLabel}
                        </span>
                        <span>{item.time.toFixed(2)}s</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={restart}
                  className="mt-8 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-black py-3 active:scale-95 transition"
                >
                  REMATCH
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
