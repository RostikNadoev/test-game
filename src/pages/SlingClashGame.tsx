import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Phase = 'PREPARE' | 'RESOLVE' | 'FINISHED';
type Player = 'human' | 'bot';
type Winner = Player | 'draw' | null;

type Chip = {
  id: string;
  owner: Player;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
};

type PreparedMove = {
  player: Player;
  chipId: string;
  directionX: number;
  directionY: number;
  power: number;
};

type PointerState = {
  pointerId: number | null;
  dragging: boolean;
  selectedChipId: string | null;
  worldX: number;
  worldY: number;
  power: number;
  directionX: number;
  directionY: number;
};

type RenderTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  cssWidth: number;
  cssHeight: number;
};

type UiState = {
  phase: Phase;
  round: number;
  timeLeft: number;
  lowerCount: number;
  upperCount: number;
  prepared: boolean;
  winner: Winner;
  status: string;
};

const WORLD_W = 420;
const WORLD_H = 720;

const BOUNDS = {
  left: 30,
  right: WORLD_W - 30,
  top: 34,
  bottom: WORLD_H - 34,
};

const WALL_Y = WORLD_H / 2;
const WALL_H = 30;

/**
 * Дырка примерно под 1.5 шарика.
 */
const HOLE_W = 56;
const HOLE_LEFT = WORLD_W / 2 - HOLE_W / 2;
const HOLE_RIGHT = WORLD_W / 2 + HOLE_W / 2;

const CHIP_R = 18;
const PREPARE_MS = 5000;
const MAX_RESOLVE_MS = 3600;
const MIN_RESOLVE_MS = 650;
const MAX_DRAG = 118;
const MIN_POWER = 0.08;
const MAX_SHOT_SPEED = 980;
const MIN_SHOT_SPEED = 120;
const FRICTION_PER_60FPS = 0.988;
const RESTITUTION = 0.88;
const WALL_RESTITUTION = 0.82;
const STOP_SPEED = 8;
const MAX_SPEED = 1280;

/**
 * Важные внутренние поля, чтобы доска не упиралась в верхнее/нижнее UI.
 */
const SAFE_TOP_PAD = 118;
const SAFE_BOTTOM_PAD = 118;
const SAFE_SIDE_PAD = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const length = (x: number, y: number) => Math.hypot(x, y);

const normalize = (x: number, y: number) => {
  const len = Math.hypot(x, y);

  if (len < 0.0001) {
    return { x: 0, y: 0 };
  }

  return { x: x / len, y: y / len };
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const makeInitialChips = (): Chip[] => {
  const bottomPositions = [
    { x: 130, y: 565 },
    { x: 210, y: 565 },
    { x: 290, y: 565 },
    { x: 170, y: 625 },
    { x: 250, y: 625 },
  ];

  const topPositions = [
    { x: 130, y: 155 },
    { x: 210, y: 155 },
    { x: 290, y: 155 },
    { x: 170, y: 95 },
    { x: 250, y: 95 },
  ];

  return [
    ...bottomPositions.map((p, index) => ({
      id: `human-${index}`,
      owner: 'human' as const,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      r: CHIP_R,
      spin: 0,
    })),
    ...topPositions.map((p, index) => ({
      id: `bot-${index}`,
      owner: 'bot' as const,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      r: CHIP_R,
      spin: 0,
    })),
  ];
};

const countHalves = (chips: Chip[]) => {
  let lowerCount = 0;
  let upperCount = 0;

  for (const chip of chips) {
    if (chip.y >= WALL_Y) {
      lowerCount += 1;
    } else {
      upperCount += 1;
    }
  }

  return { lowerCount, upperCount };
};

const findWinner = (chips: Chip[]): Winner => {
  const { lowerCount, upperCount } = countHalves(chips);

  if (lowerCount === 0 && upperCount === 0) return 'draw';
  if (lowerCount === 0) return 'human';
  if (upperCount === 0) return 'bot';

  return null;
};

const getPowerColor = (power: number) => {
  const p = clamp(power, 0, 1);

  if (p < 0.5) {
    const t = p / 0.5;
    const r = Math.round(mix(185, 245, t));
    const g = Math.round(mix(185, 182, t));
    const b = Math.round(mix(185, 72, t));

    return `rgb(${r}, ${g}, ${b})`;
  }

  const t = (p - 0.5) / 0.5;
  const r = Math.round(mix(245, 238, t));
  const g = Math.round(mix(182, 58, t));
  const b = Math.round(mix(72, 45, t));

  return `rgb(${r}, ${g}, ${b})`;
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawWoodGrain = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.18,
) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;

  for (let i = 0; i < 34; i += 1) {
    const yy = y + 14 + (i * (h - 28)) / 34;
    const wave = Math.sin(i * 1.73) * 10;
    const hue = i % 2 === 0 ? 'rgba(255, 224, 150, 0.5)' : 'rgba(76, 35, 12, 0.42)';

    ctx.strokeStyle = hue;
    ctx.beginPath();
    ctx.moveTo(x + 12, yy);

    for (let px = 0; px <= w - 24; px += 24) {
      const py = yy + Math.sin(px * 0.035 + i * 0.8) * 4 + wave * 0.08;
      ctx.lineTo(x + 12 + px, py);
    }

    ctx.stroke();
  }

  for (let i = 0; i < 10; i += 1) {
    const cx = x + 60 + ((i * 73) % Math.max(1, w - 120));
    const cy = y + 70 + ((i * 101) % Math.max(1, h - 140));
    const rx = 18 + (i % 3) * 6;
    const ry = 7 + (i % 2) * 4;

    ctx.strokeStyle = 'rgba(87, 37, 12, 0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.sin(i) * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 222, 148, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - 1, rx * 0.55, ry * 0.55, Math.sin(i) * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
};

const drawBackdrop = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#110904');
  bg.addColorStop(0.42, '#211008');
  bg.addColorStop(1, '#070403');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.55;

  for (let i = 0; i < 28; i += 1) {
    const y = (i / 28) * h;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 213, 139, 0.05)' : 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(i) * 7);
    ctx.lineTo(w, y + Math.cos(i * 1.7) * 7);
    ctx.stroke();
  }

  ctx.restore();
};

const drawBoard = (ctx: CanvasRenderingContext2D) => {
  ctx.save();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;

  const outer = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
  outer.addColorStop(0, '#5f2f13');
  outer.addColorStop(0.28, '#9a5a22');
  outer.addColorStop(0.54, '#3e1d0b');
  outer.addColorStop(1, '#8a4b1c');

  roundedRect(ctx, 7, 8, WORLD_W - 14, WORLD_H - 16, 34);
  ctx.fillStyle = outer;
  ctx.fill();

  ctx.restore();

  ctx.save();
  roundedRect(ctx, 7, 8, WORLD_W - 14, WORLD_H - 16, 34);
  ctx.clip();
  drawWoodGrain(ctx, 8, 8, WORLD_W - 16, WORLD_H - 16, 0.32);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 222, 153, 0.34)';
  roundedRect(ctx, 17, 18, WORLD_W - 34, WORLD_H - 36, 27);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(30, 9, 2, 0.72)';
  roundedRect(
    ctx,
    BOUNDS.left - 8,
    BOUNDS.top - 8,
    BOUNDS.right - BOUNDS.left + 16,
    BOUNDS.bottom - BOUNDS.top + 16,
    23,
  );
  ctx.stroke();
  ctx.restore();

  const surface = ctx.createLinearGradient(0, BOUNDS.top, 0, BOUNDS.bottom);
  surface.addColorStop(0, '#b47a38');
  surface.addColorStop(0.47, '#d29a4f');
  surface.addColorStop(0.53, '#bd813c');
  surface.addColorStop(1, '#8b4c1c');

  ctx.save();
  roundedRect(
    ctx,
    BOUNDS.left - 1,
    BOUNDS.top - 1,
    BOUNDS.right - BOUNDS.left + 2,
    BOUNDS.bottom - BOUNDS.top + 2,
    18,
  );
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.clip();
  drawWoodGrain(
    ctx,
    BOUNDS.left,
    BOUNDS.top,
    BOUNDS.right - BOUNDS.left,
    BOUNDS.bottom - BOUNDS.top,
    0.22,
  );
  ctx.restore();

  /**
   * Тонкая линия разделения по центру доски.
   */
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#fff2bd';
  ctx.fillRect(BOUNDS.left + 6, WALL_Y, BOUNDS.right - BOUNDS.left - 12, 1);
  ctx.restore();

  /**
   * Центральная стенка слева и справа от дырки.
   */
  ctx.save();
  const wallGrad = ctx.createLinearGradient(0, WALL_Y - WALL_H / 2, 0, WALL_Y + WALL_H / 2);
  wallGrad.addColorStop(0, '#8b4a1b');
  wallGrad.addColorStop(0.5, '#4b2109');
  wallGrad.addColorStop(1, '#b06a28');

  const leftWallW = HOLE_LEFT - BOUNDS.left;
  const rightWallW = BOUNDS.right - HOLE_RIGHT;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  roundedRect(ctx, BOUNDS.left, WALL_Y - WALL_H / 2, leftWallW, WALL_H, 13);
  ctx.fillStyle = wallGrad;
  ctx.fill();

  roundedRect(ctx, HOLE_RIGHT, WALL_Y - WALL_H / 2, rightWallW, WALL_H, 13);
  ctx.fillStyle = wallGrad;
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 221, 137, 0.42)';
  roundedRect(ctx, BOUNDS.left + 3, WALL_Y - WALL_H / 2 + 3, leftWallW - 6, WALL_H - 6, 10);
  ctx.stroke();

  roundedRect(ctx, HOLE_RIGHT + 3, WALL_Y - WALL_H / 2 + 3, rightWallW - 6, WALL_H - 6, 10);
  ctx.stroke();
  ctx.restore();

  /**
   * ВАЖНО:
   * В середине больше НЕ рисуем серый прямоугольник.
   * Проем остается просто пустым местом между стенками.
   */

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#fff1bb';
  ctx.setLineDash([8, 10]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(BOUNDS.left + 18, WALL_Y);
  ctx.lineTo(HOLE_LEFT - 12, WALL_Y);
  ctx.moveTo(HOLE_RIGHT + 12, WALL_Y);
  ctx.lineTo(BOUNDS.right - 18, WALL_Y);
  ctx.stroke();
  ctx.restore();
};

const drawChip = (
  ctx: CanvasRenderingContext2D,
  chip: Chip,
  selected: boolean,
  playable: boolean,
) => {
  ctx.save();

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(chip.x + 3, chip.y + 7, chip.r * 0.95, chip.r * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (playable) {
    ctx.save();
    ctx.globalAlpha = selected ? 0.5 : 0.18;
    ctx.strokeStyle = selected ? '#fff0b6' : '#ffe5a1';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.beginPath();
    ctx.arc(chip.x, chip.y, chip.r + (selected ? 8 : 4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();

  const body = ctx.createRadialGradient(
    chip.x - chip.r * 0.35,
    chip.y - chip.r * 0.45,
    chip.r * 0.1,
    chip.x,
    chip.y,
    chip.r * 1.15,
  );

  if (chip.owner === 'human') {
    body.addColorStop(0, '#fff8d5');
    body.addColorStop(0.42, '#e8c47c');
    body.addColorStop(0.74, '#9a5b24');
    body.addColorStop(1, '#4b210a');
  } else {
    body.addColorStop(0, '#ffe0ca');
    body.addColorStop(0.42, '#cd8753');
    body.addColorStop(0.74, '#7a2f1d');
    body.addColorStop(1, '#35100a');
  }

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(chip.x, chip.y, chip.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2.4;
  ctx.strokeStyle = chip.owner === 'human' ? 'rgba(67, 180, 255, 0.85)' : 'rgba(255, 91, 91, 0.82)';
  ctx.beginPath();
  ctx.arc(chip.x, chip.y, chip.r - 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 239, 196, 0.55)';
  ctx.beginPath();
  ctx.arc(chip.x, chip.y, chip.r - 7, 0.1 + chip.spin, Math.PI * 1.45 + chip.spin);
  ctx.stroke();

  const gem = ctx.createRadialGradient(
    chip.x - 2,
    chip.y - 3,
    1,
    chip.x,
    chip.y,
    chip.r * 0.42,
  );

  if (chip.owner === 'human') {
    gem.addColorStop(0, '#ddfbff');
    gem.addColorStop(0.45, '#49c7ff');
    gem.addColorStop(1, '#075279');
  } else {
    gem.addColorStop(0, '#ffe6dc');
    gem.addColorStop(0.45, '#ff7565');
    gem.addColorStop(1, '#7d1712');
  }

  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.arc(chip.x, chip.y, chip.r * 0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.52;
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.ellipse(
    chip.x - chip.r * 0.28,
    chip.y - chip.r * 0.38,
    chip.r * 0.22,
    chip.r * 0.1,
    -0.55,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.restore();
};

const drawMoveArrow = (
  ctx: CanvasRenderingContext2D,
  chip: Chip,
  directionX: number,
  directionY: number,
  power: number,
  draggingPoint?: { x: number; y: number },
) => {
  const p = clamp(power, 0, 1);
  if (p < MIN_POWER) return;

  const arrowLen = 38 + p * 104;
  const endX = chip.x + directionX * arrowLen;
  const endY = chip.y + directionY * arrowLen;
  const color = getPowerColor(p);
  const lineWidth = 5 + p * 5;

  if (draggingPoint) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = '#fff3c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chip.x, chip.y);
    ctx.lineTo(draggingPoint.x, draggingPoint.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();

  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(chip.x, chip.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const angle = Math.atan2(directionY, directionX);
  const headLen = 16 + p * 12;
  const sideA = angle + Math.PI * 0.78;
  const sideB = angle - Math.PI * 0.78;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX + Math.cos(sideA) * headLen, endY + Math.sin(sideA) * headLen);
  ctx.lineTo(endX + Math.cos(sideB) * headLen, endY + Math.sin(sideB) * headLen);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = '#fff8dc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chip.x + directionX * 12, chip.y + directionY * 12);
  ctx.lineTo(endX - directionX * 14, endY - directionY * 14);
  ctx.stroke();

  ctx.restore();
};

const circleRectCollision = (
  chip: Chip,
  rect: { x: number; y: number; w: number; h: number },
) => {
  const closestX = clamp(chip.x, rect.x, rect.x + rect.w);
  const closestY = clamp(chip.y, rect.y, rect.y + rect.h);
  const dx = chip.x - closestX;
  const dy = chip.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= chip.r * chip.r) return;

  let nx = dx;
  let ny = dy;
  let dist = Math.sqrt(distSq);

  if (dist < 0.0001) {
    const left = Math.abs(chip.x - rect.x);
    const right = Math.abs(chip.x - (rect.x + rect.w));
    const top = Math.abs(chip.y - rect.y);
    const bottom = Math.abs(chip.y - (rect.y + rect.h));
    const minSide = Math.min(left, right, top, bottom);

    if (minSide === left) {
      nx = -1;
      ny = 0;
    } else if (minSide === right) {
      nx = 1;
      ny = 0;
    } else if (minSide === top) {
      nx = 0;
      ny = -1;
    } else {
      nx = 0;
      ny = 1;
    }

    dist = 1;
  } else {
    nx /= dist;
    ny /= dist;
  }

  const overlap = chip.r - dist;
  chip.x += nx * (overlap + 0.2);
  chip.y += ny * (overlap + 0.2);

  const vn = chip.vx * nx + chip.vy * ny;

  if (vn < 0) {
    chip.vx -= (1 + WALL_RESTITUTION) * vn * nx;
    chip.vy -= (1 + WALL_RESTITUTION) * vn * ny;
  }
};

const resolvePhysics = (chips: Chip[], dt: number) => {
  const safeDt = clamp(dt, 0, 1 / 30);
  const friction = Math.pow(FRICTION_PER_60FPS, safeDt * 60);

  for (const chip of chips) {
    chip.x += chip.vx * safeDt;
    chip.y += chip.vy * safeDt;
    chip.vx *= friction;
    chip.vy *= friction;
    chip.spin += (chip.vx * 0.0012 + chip.vy * 0.0008) * safeDt * 60;

    const speed = length(chip.vx, chip.vy);
    if (speed > MAX_SPEED) {
      chip.vx = (chip.vx / speed) * MAX_SPEED;
      chip.vy = (chip.vy / speed) * MAX_SPEED;
    }

    if (chip.x - chip.r < BOUNDS.left) {
      chip.x = BOUNDS.left + chip.r;
      chip.vx = Math.abs(chip.vx) * WALL_RESTITUTION;
    }

    if (chip.x + chip.r > BOUNDS.right) {
      chip.x = BOUNDS.right - chip.r;
      chip.vx = -Math.abs(chip.vx) * WALL_RESTITUTION;
    }

    if (chip.y - chip.r < BOUNDS.top) {
      chip.y = BOUNDS.top + chip.r;
      chip.vy = Math.abs(chip.vy) * WALL_RESTITUTION;
    }

    if (chip.y + chip.r > BOUNDS.bottom) {
      chip.y = BOUNDS.bottom - chip.r;
      chip.vy = -Math.abs(chip.vy) * WALL_RESTITUTION;
    }

    const wallTop = WALL_Y - WALL_H / 2;
    const leftWall = {
      x: BOUNDS.left,
      y: wallTop,
      w: HOLE_LEFT - BOUNDS.left,
      h: WALL_H,
    };
    const rightWall = {
      x: HOLE_RIGHT,
      y: wallTop,
      w: BOUNDS.right - HOLE_RIGHT,
      h: WALL_H,
    };

    circleRectCollision(chip, leftWall);
    circleRectCollision(chip, rightWall);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i];
        const b = chips[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;

        if (dist >= minDist) continue;

        if (dist < 0.001) {
          dist = minDist;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal > 0) continue;

        const impulse = (-(1 + RESTITUTION) * velAlongNormal) / 2;

        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  for (const chip of chips) {
    if (Math.hypot(chip.vx, chip.vy) < STOP_SPEED) {
      chip.vx = 0;
      chip.vy = 0;
    }
  }
};

const allStopped = (chips: Chip[]) =>
  chips.every((chip) => Math.hypot(chip.vx, chip.vy) < STOP_SPEED + 1);

export const SlingClashGame = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipsRef = useRef<Chip[]>(makeInitialChips());
  const phaseRef = useRef<Phase>('PREPARE');
  const roundRef = useRef(1);
  const prepareEndsAtRef = useRef(performance.now() + PREPARE_MS);
  const resolveStartedAtRef = useRef(0);
  const winnerRef = useRef<Winner>(null);
  const preparedMoveRef = useRef<PreparedMove | null>(null);
  const botMoveRef = useRef<PreparedMove | null>(null);
  const lastFrameRef = useRef(performance.now());
  const transformRef = useRef<RenderTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cssWidth: 0,
    cssHeight: 0,
  });
  const pointerRef = useRef<PointerState>({
    pointerId: null,
    dragging: false,
    selectedChipId: null,
    worldX: 0,
    worldY: 0,
    power: 0,
    directionX: 0,
    directionY: -1,
  });

  const [ui, setUi] = useState<UiState>(() => {
    const counts = countHalves(chipsRef.current);

    return {
      phase: 'PREPARE',
      round: 1,
      timeLeft: 5,
      lowerCount: counts.lowerCount,
      upperCount: counts.upperCount,
      prepared: false,
      winner: null,
      status: 'Выбери фишку и задай удар',
    };
  });

  const updateUi = () => {
    const phase = phaseRef.current;
    const counts = countHalves(chipsRef.current);
    const now = performance.now();
    const timeLeft =
      phase === 'PREPARE'
        ? Math.max(0, Math.ceil((prepareEndsAtRef.current - now) / 1000))
        : 0;

    let status = 'Выбери фишку и задай удар';

    if (phase === 'PREPARE' && preparedMoveRef.current) {
      status = 'Ход готов';
    }

    if (phase === 'RESOLVE') {
      status = 'Ходы выполняются';
    }

    if (phase === 'FINISHED') {
      if (winnerRef.current === 'human') status = 'Победа';
      if (winnerRef.current === 'bot') status = 'Бот победил';
      if (winnerRef.current === 'draw') status = 'Ничья';
    }

    setUi({
      phase,
      round: roundRef.current,
      timeLeft,
      lowerCount: counts.lowerCount,
      upperCount: counts.upperCount,
      prepared: Boolean(preparedMoveRef.current),
      winner: winnerRef.current,
      status,
    });
  };

  const resetGame = () => {
    chipsRef.current = makeInitialChips();
    phaseRef.current = 'PREPARE';
    roundRef.current = 1;
    winnerRef.current = null;
    preparedMoveRef.current = null;
    botMoveRef.current = makeBotMove(chipsRef.current);
    pointerRef.current = {
      pointerId: null,
      dragging: false,
      selectedChipId: null,
      worldX: 0,
      worldY: 0,
      power: 0,
      directionX: 0,
      directionY: -1,
    };
    prepareEndsAtRef.current = performance.now() + PREPARE_MS;
    resolveStartedAtRef.current = 0;
    updateUi();
  };

  const beginNextRound = (now: number) => {
    for (const chip of chipsRef.current) {
      chip.vx = 0;
      chip.vy = 0;
    }

    phaseRef.current = 'PREPARE';
    roundRef.current += 1;
    preparedMoveRef.current = null;
    botMoveRef.current = makeBotMove(chipsRef.current);
    pointerRef.current.dragging = false;
    pointerRef.current.selectedChipId = null;
    pointerRef.current.power = 0;
    prepareEndsAtRef.current = now + PREPARE_MS;
    updateUi();
  };

  const applyMove = (move: PreparedMove | null) => {
    if (!move || move.power < MIN_POWER) return;

    const chip = chipsRef.current.find((item) => item.id === move.chipId);
    if (!chip) return;

    const isAllowedSide = move.player === 'human' ? chip.y >= WALL_Y : chip.y < WALL_Y;
    if (!isAllowedSide) return;

    const dir = normalize(move.directionX, move.directionY);
    if (!dir.x && !dir.y) return;

    const speed = MIN_SHOT_SPEED + move.power * MAX_SHOT_SPEED;

    chip.vx = dir.x * speed;
    chip.vy = dir.y * speed;
  };

  const startResolve = (now: number) => {
    phaseRef.current = 'RESOLVE';
    resolveStartedAtRef.current = now;
    pointerRef.current.dragging = false;
    pointerRef.current.selectedChipId = null;

    applyMove(preparedMoveRef.current);
    applyMove(botMoveRef.current);

    updateUi();
  };

  const finishResolveIfNeeded = (now: number) => {
    const elapsed = now - resolveStartedAtRef.current;
    const shouldFinish =
      elapsed >= MAX_RESOLVE_MS ||
      (elapsed >= MIN_RESOLVE_MS && allStopped(chipsRef.current));

    if (!shouldFinish) return;

    for (const chip of chipsRef.current) {
      chip.vx = 0;
      chip.vy = 0;
    }

    const winner = findWinner(chipsRef.current);

    if (winner) {
      winnerRef.current = winner;
      phaseRef.current = 'FINISHED';
      updateUi();
      return;
    }

    beginNextRound(now);
  };

  const syncCanvas = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
    const nextHeight = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cssWidth = rect.width;
    const cssHeight = rect.height;

    const availableWidth = Math.max(1, cssWidth - SAFE_SIDE_PAD * 2);
    const availableHeight = Math.max(1, cssHeight - SAFE_TOP_PAD - SAFE_BOTTOM_PAD);

    const scale = Math.min(availableWidth / WORLD_W, availableHeight / WORLD_H);

    const offsetX = (cssWidth - WORLD_W * scale) / 2;
    const offsetY = SAFE_TOP_PAD + (availableHeight - WORLD_H * scale) / 2;

    transformRef.current = {
      scale,
      offsetX,
      offsetY,
      cssWidth,
      cssHeight,
    };
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const transform = transformRef.current;

    drawBackdrop(ctx, transform.cssWidth, transform.cssHeight);

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    drawBoard(ctx);

    const pointer = pointerRef.current;
    const prepared = preparedMoveRef.current;
    const selectedChipId = pointer.selectedChipId || prepared?.chipId || null;

    for (const chip of chipsRef.current) {
      const playable = phaseRef.current === 'PREPARE' && chip.y >= WALL_Y;
      drawChip(ctx, chip, chip.id === selectedChipId, playable);
    }

    if (phaseRef.current === 'PREPARE') {
      if (pointer.dragging && pointer.selectedChipId) {
        const chip = chipsRef.current.find((item) => item.id === pointer.selectedChipId);
        if (chip) {
          drawMoveArrow(
            ctx,
            chip,
            pointer.directionX,
            pointer.directionY,
            pointer.power,
            {
              x: pointer.worldX,
              y: pointer.worldY,
            },
          );
        }
      } else if (prepared) {
        const chip = chipsRef.current.find((item) => item.id === prepared.chipId);
        if (chip) {
          drawMoveArrow(
            ctx,
            chip,
            prepared.directionX,
            prepared.directionY,
            prepared.power,
          );
        }
      }
    }

    ctx.restore();
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const transform = transformRef.current;

    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: (clientX - rect.left - transform.offsetX) / transform.scale,
      y: (clientY - rect.top - transform.offsetY) / transform.scale,
    };
  };

  const findHumanPlayableChip = (x: number, y: number) => {
    let best: Chip | null = null;
    let bestDistance = Infinity;

    for (const chip of chipsRef.current) {
      if (chip.y < WALL_Y) continue;
      if (Math.hypot(chip.vx, chip.vy) > STOP_SPEED) continue;

      const d = Math.hypot(chip.x - x, chip.y - y);

      if (d < chip.r + 16 && d < bestDistance) {
        best = chip;
        bestDistance = d;
      }
    }

    return best;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'PREPARE') return;

    event.preventDefault();

    const point = clientToWorld(event.clientX, event.clientY);
    const chip = findHumanPlayableChip(point.x, point.y);

    if (!chip) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    pointerRef.current = {
      pointerId: event.pointerId,
      dragging: true,
      selectedChipId: chip.id,
      worldX: point.x,
      worldY: point.y,
      power: 0,
      directionX: 0,
      directionY: -1,
    };

    updateUi();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;

    if (!pointer.dragging || pointer.pointerId !== event.pointerId) return;

    event.preventDefault();

    const chip = chipsRef.current.find((item) => item.id === pointer.selectedChipId);
    if (!chip) return;

    const point = clientToWorld(event.clientX, event.clientY);
    const dragX = chip.x - point.x;
    const dragY = chip.y - point.y;
    const dragDistance = Math.min(MAX_DRAG, Math.hypot(dragX, dragY));
    const dir = normalize(dragX, dragY);
    const power = clamp(dragDistance / MAX_DRAG, 0, 1);

    pointer.worldX = point.x;
    pointer.worldY = point.y;
    pointer.power = power;
    pointer.directionX = dir.x;
    pointer.directionY = dir.y;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;

    if (!pointer.dragging || pointer.pointerId !== event.pointerId) return;

    event.preventDefault();

    if (pointer.selectedChipId && pointer.power >= MIN_POWER) {
      preparedMoveRef.current = {
        player: 'human',
        chipId: pointer.selectedChipId,
        directionX: pointer.directionX,
        directionY: pointer.directionY,
        power: pointer.power,
      };
    } else {
      preparedMoveRef.current = null;
    }

    pointer.dragging = false;
    pointer.pointerId = null;
    pointer.power = 0;

    updateUi();
  };

  const handlePointerCancel = () => {
    pointerRef.current.dragging = false;
    pointerRef.current.pointerId = null;
    updateUi();
  };

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const html = document.documentElement;
    const body = document.body;

    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlTouchAction: html.style.touchAction,
      bodyTouchAction: body.style.touchAction,
      bodyUserSelect: body.style.userSelect,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.touchAction = 'none';
    body.style.touchAction = 'none';
    body.style.userSelect = 'none';
    body.style.overscrollBehavior = 'none';

    const prevent = (event: TouchEvent) => {
      event.preventDefault();
    };

    const preventGesture = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener(
      'gesturestart',
      preventGesture,
      { passive: false } as AddEventListenerOptions,
    );
    document.addEventListener('contextmenu', preventGesture);

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.touchAction = previous.htmlTouchAction;
      body.style.touchAction = previous.bodyTouchAction;
      body.style.userSelect = previous.bodyUserSelect;
      body.style.overscrollBehavior = previous.bodyOverscroll;

      document.removeEventListener('touchmove', prevent);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('contextmenu', preventGesture);
    };
  }, []);

  useEffect(() => {
    botMoveRef.current = makeBotMove(chipsRef.current);

    let animationId = 0;
    let lastUiUpdate = 0;

    const frame = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (!canvas || !ctx) {
        animationId = requestAnimationFrame(frame);
        return;
      }

      syncCanvas(ctx);

      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      if (phaseRef.current === 'PREPARE' && now >= prepareEndsAtRef.current) {
        if (!botMoveRef.current) {
          botMoveRef.current = makeBotMove(chipsRef.current);
        }

        startResolve(now);
      }

      if (phaseRef.current === 'RESOLVE') {
        const subSteps = 3;
        const stepDt = dt / subSteps;

        for (let i = 0; i < subSteps; i += 1) {
          resolvePhysics(chipsRef.current, stepDt);
        }

        finishResolveIfNeeded(now);
      }

      draw(ctx);

      if (now - lastUiUpdate > 120) {
        lastUiUpdate = now;
        updateUi();
      }

      animationId = requestAnimationFrame(frame);
    };

    animationId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden bg-[#090502]"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
        <div className="mx-auto flex max-w-[460px] items-center justify-between gap-2 rounded-3xl border border-amber-200/10 bg-black/12 px-3 py-2 shadow-xl backdrop-blur-[6px]">
          <button
            onClick={() => navigate(-1)}
            className="pointer-events-auto rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white active:scale-95"
          >
            ←
          </button>

          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/70">
              Sling Clash
            </div>
            <div className="truncate text-sm font-bold text-white">
              R{ui.round} · {ui.phase === 'PREPARE' ? ui.timeLeft : '•'}
            </div>
          </div>

          <button
            onClick={resetGame}
            className="pointer-events-auto rounded-2xl border border-amber-200/15 bg-amber-400/10 px-3 py-2 text-sm font-black text-amber-100 active:scale-95"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[68px] w-[min(92vw,430px)] -translate-x-1/2">
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="rounded-2xl border border-red-200/10 bg-black/14 px-3 py-2 text-center backdrop-blur-[5px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-100/55">
              Бот
            </div>
            <div className="text-lg font-black text-red-100">{ui.upperCount}</div>
          </div>

          <div className="rounded-3xl border border-amber-200/15 bg-black/10 px-2 py-2 text-center shadow-xl backdrop-blur-[5px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-100/70">
              Фаза
            </div>
            <div className="text-sm font-black leading-none text-white drop-shadow">
              {ui.phase === 'PREPARE' ? 'Ход' : ui.phase === 'RESOLVE' ? 'Пуск' : 'Финиш'}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-200/10 bg-black/14 px-3 py-2 text-center backdrop-blur-[5px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-100/55">
              Ты
            </div>
            <div className="text-lg font-black text-sky-100">{ui.lowerCount}</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3">
        <div className="mx-auto max-w-[460px] rounded-3xl border border-amber-200/12 bg-black/28 p-3 text-center shadow-2xl backdrop-blur-[8px]">
          <div className="text-sm font-bold text-white">{ui.status}</div>

          {ui.phase === 'FINISHED' && (
            <button
              onClick={resetGame}
              className="pointer-events-auto mt-3 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 py-3 font-black text-stone-950 shadow-xl active:scale-95"
            >
              Сыграть ещё
            </button>
          )}

          {ui.phase === 'PREPARE' && (
            <div className="mt-2 flex justify-center gap-2">
              <span
                className={`h-2 w-8 rounded-full ${
                  ui.prepared ? 'bg-emerald-400' : 'bg-white/18'
                }`}
              />
              <span className="h-2 w-8 rounded-full bg-red-400/70" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const makeBotMove = (chips: Chip[]): PreparedMove | null => {
  const playable = chips.filter(
    (chip) => chip.y < WALL_Y && Math.hypot(chip.vx, chip.vy) < STOP_SPEED,
  );

  if (playable.length === 0) return null;

  const sorted = [...playable].sort((a, b) => {
    const aScore = Math.abs(a.x - WORLD_W / 2) + Math.abs(a.y - WALL_Y) * 0.35;
    const bScore = Math.abs(b.x - WORLD_W / 2) + Math.abs(b.y - WALL_Y) * 0.35;

    return aScore - bScore;
  });

  const chip =
    Math.random() < 0.72 ? sorted[0] : sorted[Math.floor(Math.random() * sorted.length)];

  const targetX = WORLD_W / 2 + (Math.random() - 0.5) * 48;
  const targetY = WALL_Y + 86 + Math.random() * 78;

  const rawDir = normalize(targetX - chip.x, targetY - chip.y);

  const missAngle = (Math.random() - 0.5) * 0.34;
  const cos = Math.cos(missAngle);
  const sin = Math.sin(missAngle);

  const directionX = rawDir.x * cos - rawDir.y * sin;
  const directionY = rawDir.x * sin + rawDir.y * cos;

  const distanceToHole = Math.hypot(WORLD_W / 2 - chip.x, WALL_Y - chip.y);
  const basePower = clamp(distanceToHole / 310 + 0.22, 0.34, 0.82);
  const power = clamp(basePower + (Math.random() - 0.5) * 0.16, 0.28, 0.86);

  return {
    player: 'bot',
    chipId: chip.id,
    directionX,
    directionY,
    power,
  };
};

export default SlingClashGame;