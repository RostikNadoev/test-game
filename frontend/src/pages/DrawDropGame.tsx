import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import { DRAW_DROP_LEVELS } from '../data/drawDropLevels';
import {
  useDrawDropOnline,
  type DrawDropPlayerProfile,
} from '../hooks/useDrawDropOnline';
import { getTelegramWebApp } from '../types/telegram';

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  length: number;
};

type RectObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  tone?: 'stone' | 'glass' | 'accent';
};

type CupMount = 'floor' | 'left-wall' | 'right-wall' | 'shelf';

type CupSpec = {
  x: number;
  y: number;
  angle?: number;
  width?: number;
  height?: number;
  mount?: CupMount;
  captureHold?: number;
  captureSpeed?: number;
};

type BallSpec = {
  x: number;
  y: number;
  r?: number;
};

type LevelSpec = {
  id: number;
  name: string;
  ball: BallSpec;
  cup: CupSpec;
  obstacles: RectObstacle[];
};

type BallBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  omega: number;
};

type RigidStroke = {
  localPoints: Point[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
  mass: number;
  invMass: number;
  inertia: number;
  invInertia: number;
  radius: number;
  sleeping: number;
};

type Phase = 'draw' | 'sim' | 'success' | 'failed';

type StaticRect = RectObstacle & {
  restitution: number;
  friction: number;
};

type Collision = {
  normal: Point;
  penetration: number;
  point: Point;
};

const WORLD_W = 390;
const WORLD_H = 600;
const FIXED_DT = 1 / 120;
const GRAVITY = 860;
const BODY_RESTITUTION = 0.22;
const STROKE_RADIUS = 5;
const POINT_SPACING = 8;
const MAX_SIM_TIME = 7;
const SUCCESS_HOLD = 0.18;
const STUCK_FAIL_TIME = 0.72;
const TAU = Math.PI * 2;
const WALL_THICKNESS = 12;
const FLOOR_Y = 558;

const LEVELS: LevelSpec[] = DRAW_DROP_LEVELS;

const WORLD_BOUNDS: StaticRect[] = [
  {
    x: WALL_THICKNESS / 2,
    y: FLOOR_Y / 2,
    w: WALL_THICKNESS,
    h: FLOOR_Y + WALL_THICKNESS,
    restitution: 0.48,
    friction: 0.035,
  },
  {
    x: WORLD_W - WALL_THICKNESS / 2,
    y: FLOOR_Y / 2,
    w: WALL_THICKNESS,
    h: FLOOR_Y + WALL_THICKNESS,
    restitution: 0.48,
    friction: 0.035,
  },
  {
    x: WORLD_W / 2,
    y: FLOOR_Y + WALL_THICKNESS / 2,
    w: WORLD_W,
    h: WALL_THICKNESS,
    restitution: 0.44,
    friction: 0.045,
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const rotate = (point: Point, angle: number): Point => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
};

const worldPoint = (body: RigidStroke, local: Point): Point => {
  const rotated = rotate(local, body.angle);
  return { x: body.x + rotated.x, y: body.y + rotated.y };
};

const pointVelocity = (body: RigidStroke, world: Point): Point => {
  const rx = world.x - body.x;
  const ry = world.y - body.y;
  return {
    x: body.vx - body.omega * ry,
    y: body.vy + body.omega * rx,
  };
};

const closestPointOnSegment = (point: Point, a: Point, b: Point): Point => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom < 0.0001) return a;
  const t = clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / denom, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
};

const resamplePolyline = (points: Point[], spacing: number): Point[] => {
  if (points.length < 2) return points.slice();
  const result: Point[] = [points[0]];
  let carry = 0;
  let previous = points[0];

  for (let i = 1; i < points.length; i += 1) {
    const target = points[i];
    let segmentLength = distance(previous, target);
    if (segmentLength < 0.001) continue;

    while (carry + segmentLength >= spacing) {
      const needed = spacing - carry;
      const t = needed / segmentLength;
      const next = {
        x: previous.x + (target.x - previous.x) * t,
        y: previous.y + (target.y - previous.y) * t,
      };
      result.push(next);
      previous = next;
      segmentLength = distance(previous, target);
      carry = 0;
    }

    carry += segmentLength;
    previous = target;
  }

  const last = points[points.length - 1];
  if (distance(result[result.length - 1], last) > spacing * 0.35) {
    result.push(last);
  }

  return result;
};

const polylineLength = (points: Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
};

const createRigidStroke = (stroke: Stroke): RigidStroke | null => {
  const sampled = resamplePolyline(stroke.points, POINT_SPACING);
  if (sampled.length < 2) return null;

  const center = sampled.reduce(
    (acc, point) => ({ x: acc.x + point.x / sampled.length, y: acc.y + point.y / sampled.length }),
    { x: 0, y: 0 },
  );
  const localPoints = sampled.map((point) => ({ x: point.x - center.x, y: point.y - center.y }));
  const mass = clamp(stroke.length * 0.018, 1.1, 8.5);
  let inertia = 0;
  for (const point of localPoints) inertia += point.x * point.x + point.y * point.y;
  inertia = Math.max(180, (mass * inertia) / localPoints.length + mass * 70);

  return {
    localPoints,
    x: center.x,
    y: center.y,
    vx: 0,
    vy: 0,
    angle: 0,
    omega: 0,
    mass,
    invMass: 1 / mass,
    inertia,
    invInertia: 1 / inertia,
    radius: STROKE_RADIUS,
    sleeping: 0,
  };
};

const makeCupRects = (cup: CupSpec): StaticRect[] => {
  const width = cup.width ?? 70;
  const height = cup.height ?? 70;
  const angle = cup.angle ?? 0;
  const topHalf = width / 2;
  const bottomHalf = width * 0.34;
  const wallThickness = 8;
  const leftA = { x: -topHalf, y: -height / 2 };
  const leftB = { x: -bottomHalf, y: height / 2 };
  const rightA = { x: topHalf, y: -height / 2 };
  const rightB = { x: bottomHalf, y: height / 2 };

  const makeWall = (a: Point, b: Point): StaticRect => {
    const localMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const rotatedMid = rotate(localMid, angle);
    return {
      x: cup.x + rotatedMid.x,
      y: cup.y + rotatedMid.y,
      w: distance(a, b),
      h: wallThickness,
      angle: angle + Math.atan2(b.y - a.y, b.x - a.x),
      tone: 'glass',
      restitution: 0.28,
      friction: 0.055,
    };
  };

  const bottomLocal = rotate({ x: 0, y: height / 2 }, angle);
  return [
    makeWall(leftA, leftB),
    makeWall(rightA, rightB),
    {
      x: cup.x + bottomLocal.x,
      y: cup.y + bottomLocal.y,
      w: bottomHalf * 2 + wallThickness,
      h: wallThickness,
      angle,
      tone: 'glass',
      restitution: 0.16,
      friction: 0.08,
    },
  ];
};

const circleVsRect = (center: Point, radius: number, rect: StaticRect): Collision | null => {
  const angle = rect.angle ?? 0;
  const relative = rotate({ x: center.x - rect.x, y: center.y - rect.y }, -angle);
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const closest = {
    x: clamp(relative.x, -halfW, halfW),
    y: clamp(relative.y, -halfH, halfH),
  };
  const dx = relative.x - closest.x;
  const dy = relative.y - closest.y;
  let dist = Math.hypot(dx, dy);
  let localNormal: Point;
  let penetration: number;
  let localPoint = closest;

  if (dist > 0.0001) {
    if (dist >= radius) return null;
    localNormal = { x: dx / dist, y: dy / dist };
    penetration = radius - dist;
  } else {
    const gapX = halfW - Math.abs(relative.x);
    const gapY = halfH - Math.abs(relative.y);
    if (gapX < gapY) {
      localNormal = { x: relative.x >= 0 ? 1 : -1, y: 0 };
      penetration = radius + gapX;
      localPoint = { x: localNormal.x * halfW, y: relative.y };
    } else {
      localNormal = { x: 0, y: relative.y >= 0 ? 1 : -1 };
      penetration = radius + gapY;
      localPoint = { x: relative.x, y: localNormal.y * halfH };
    }
    dist = 0;
  }

  const normal = rotate(localNormal, angle);
  const rotatedPoint = rotate(localPoint, angle);
  return {
    normal,
    penetration,
    point: { x: rect.x + rotatedPoint.x, y: rect.y + rotatedPoint.y },
  };
};

const resolveBallStatic = (ball: BallBody, rect: StaticRect) => {
  const collision = circleVsRect({ x: ball.x, y: ball.y }, ball.r, rect);
  if (!collision) return false;

  ball.x += collision.normal.x * collision.penetration;
  ball.y += collision.normal.y * collision.penetration;
  const vn = ball.vx * collision.normal.x + ball.vy * collision.normal.y;
  if (vn < 0) {
    const impulse = -(1 + rect.restitution) * vn;
    ball.vx += collision.normal.x * impulse;
    ball.vy += collision.normal.y * impulse;
    const tangent = { x: -collision.normal.y, y: collision.normal.x };
    const vt = ball.vx * tangent.x + ball.vy * tangent.y;
    ball.vx -= tangent.x * vt * rect.friction;
    ball.vy -= tangent.y * vt * rect.friction;
    ball.omega += (vt / Math.max(1, ball.r)) * 0.08;
  }
  return true;
};

const resolveRigidStatic = (body: RigidStroke, rect: StaticRect) => {
  let touched = false;
  const step = body.localPoints.length > 36 ? 2 : 1;
  for (let i = 0; i < body.localPoints.length; i += step) {
    const point = worldPoint(body, body.localPoints[i]);
    const collision = circleVsRect(point, body.radius, rect);
    if (!collision) continue;
    touched = true;

    const correction = collision.penetration * 0.72;
    body.x += collision.normal.x * correction;
    body.y += collision.normal.y * correction;

    const contact = pointVelocity(body, point);
    const vn = contact.x * collision.normal.x + contact.y * collision.normal.y;
    if (vn >= 0) continue;

    const rx = point.x - body.x;
    const ry = point.y - body.y;
    const cross = rx * collision.normal.y - ry * collision.normal.x;
    const denom = body.invMass + cross * cross * body.invInertia;
    if (denom <= 0.00001) continue;
    const impulse = (-(1 + BODY_RESTITUTION) * vn) / denom;
    body.vx += collision.normal.x * impulse * body.invMass;
    body.vy += collision.normal.y * impulse * body.invMass;
    body.omega += cross * impulse * body.invInertia;

    const tangent = { x: -collision.normal.y, y: collision.normal.x };
    const tangentSpeed = contact.x * tangent.x + contact.y * tangent.y;
    body.vx -= tangent.x * tangentSpeed * 0.012;
    body.vy -= tangent.y * tangentSpeed * 0.012;
    body.omega *= 0.996;
  }
  return touched;
};

const resolveBallRigid = (ball: BallBody, body: RigidStroke) => {
  let touched = false;
  for (let i = 1; i < body.localPoints.length; i += 1) {
    const a = worldPoint(body, body.localPoints[i - 1]);
    const b = worldPoint(body, body.localPoints[i]);
    const closest = closestPointOnSegment({ x: ball.x, y: ball.y }, a, b);
    let dx = ball.x - closest.x;
    let dy = ball.y - closest.y;
    let dist = Math.hypot(dx, dy);
    const required = ball.r + body.radius;
    if (dist >= required) continue;

    if (dist < 0.001) {
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const len = Math.max(0.001, Math.hypot(sx, sy));
      dx = -sy / len;
      dy = sx / len;
      dist = 1;
    }

    const normal = { x: dx / dist, y: dy / dist };
    const penetration = required - dist;
    const totalInv = 1 + body.invMass;
    ball.x += normal.x * penetration * (1 / totalInv) * 0.72;
    ball.y += normal.y * penetration * (1 / totalInv) * 0.72;
    body.x -= normal.x * penetration * (body.invMass / totalInv) * 0.72;
    body.y -= normal.y * penetration * (body.invMass / totalInv) * 0.72;

    const bodyVel = pointVelocity(body, closest);
    const rvx = ball.vx - bodyVel.x;
    const rvy = ball.vy - bodyVel.y;
    const relNormal = rvx * normal.x + rvy * normal.y;
    if (relNormal >= 0) continue;

    const rx = closest.x - body.x;
    const ry = closest.y - body.y;
    const cross = rx * normal.y - ry * normal.x;
    const denom = 1 + body.invMass + cross * cross * body.invInertia;
    const impulse = (-(1 + 0.46) * relNormal) / Math.max(0.0001, denom);

    ball.vx += normal.x * impulse;
    ball.vy += normal.y * impulse;
    body.vx -= normal.x * impulse * body.invMass;
    body.vy -= normal.y * impulse * body.invMass;
    body.omega -= cross * impulse * body.invInertia;
    touched = true;
    break;
  }
  return touched;
};

const resolveRigidPair = (a: RigidStroke, b: RigidStroke) => {
  const stepA = a.localPoints.length > 30 ? 2 : 1;
  for (let i = 0; i < a.localPoints.length; i += stepA) {
    const p = worldPoint(a, a.localPoints[i]);
    for (let j = 1; j < b.localPoints.length; j += 2) {
      const s1 = worldPoint(b, b.localPoints[j - 1]);
      const s2 = worldPoint(b, b.localPoints[j]);
      const closest = closestPointOnSegment(p, s1, s2);
      let dx = p.x - closest.x;
      let dy = p.y - closest.y;
      let dist = Math.hypot(dx, dy);
      const required = a.radius + b.radius;
      if (dist >= required) continue;
      if (dist < 0.001) {
        dx = 0;
        dy = -1;
        dist = 1;
      }
      const normal = { x: dx / dist, y: dy / dist };
      const penetration = required - dist;
      const invTotal = a.invMass + b.invMass;
      if (invTotal <= 0) return;
      a.x += normal.x * penetration * (a.invMass / invTotal) * 0.45;
      a.y += normal.y * penetration * (a.invMass / invTotal) * 0.45;
      b.x -= normal.x * penetration * (b.invMass / invTotal) * 0.45;
      b.y -= normal.y * penetration * (b.invMass / invTotal) * 0.45;

      const velA = pointVelocity(a, p);
      const velB = pointVelocity(b, closest);
      const rvx = velA.x - velB.x;
      const rvy = velA.y - velB.y;
      const vn = rvx * normal.x + rvy * normal.y;
      if (vn >= 0) return;

      const rax = p.x - a.x;
      const ray = p.y - a.y;
      const rbx = closest.x - b.x;
      const rby = closest.y - b.y;
      const crossA = rax * normal.y - ray * normal.x;
      const crossB = rbx * normal.y - rby * normal.x;
      const denom =
        a.invMass +
        b.invMass +
        crossA * crossA * a.invInertia +
        crossB * crossB * b.invInertia;
      const impulse = (-(1 + 0.12) * vn) / Math.max(0.0001, denom);
      a.vx += normal.x * impulse * a.invMass;
      a.vy += normal.y * impulse * a.invMass;
      a.omega += crossA * impulse * a.invInertia;
      b.vx -= normal.x * impulse * b.invMass;
      b.vy -= normal.y * impulse * b.invMass;
      b.omega -= crossB * impulse * b.invInertia;
      return;
    }
  }
};

const cupLocalPoint = (cup: CupSpec, point: Point) =>
  rotate({ x: point.x - cup.x, y: point.y - cup.y }, -(cup.angle ?? 0));

const pointInsideRect = (point: Point, rect: RectObstacle, padding = 0) => {
  const local = rotate({ x: point.x - rect.x, y: point.y - rect.y }, -(rect.angle ?? 0));
  return Math.abs(local.x) <= rect.w / 2 + padding && Math.abs(local.y) <= rect.h / 2 + padding;
};

const isDrawBlocked = (point: Point, level: LevelSpec) => {
  // The stroke center can approach the inner edge exactly by its own radius,
  // so visually the ink can touch the wall/floor without a fake gap.
  if (
    point.x < WALL_THICKNESS + STROKE_RADIUS ||
    point.x > WORLD_W - WALL_THICKNESS - STROKE_RADIUS
  ) {
    return true;
  }
  if (point.y > FLOOR_Y - STROKE_RADIUS) return true;

  const ballRadius = (level.ball.r ?? 16) + 16;
  if (Math.hypot(point.x - level.ball.x, point.y - level.ball.y) < ballRadius) return true;

  const cupLocal = cupLocalPoint(level.cup, point);
  const cupWidth = level.cup.width ?? 70;
  const cupHeight = level.cup.height ?? 70;
  if (
    Math.abs(cupLocal.x) < cupWidth / 2 + STROKE_RADIUS + 2 &&
    Math.abs(cupLocal.y) < cupHeight / 2 + STROKE_RADIUS + 2
  ) {
    return true;
  }

  return level.obstacles.some((rect) => pointInsideRect(point, rect, STROKE_RADIUS));
};

const roundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const drawWorldBounds = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, WALL_THICKNESS, FLOOR_Y + WALL_THICKNESS);
  ctx.fillRect(WORLD_W - WALL_THICKNESS, 0, WALL_THICKNESS, FLOOR_Y + WALL_THICKNESS);
  ctx.fillRect(0, FLOOR_Y, WORLD_W, WALL_THICKNESS);
  ctx.restore();
};

const drawObstacle = (ctx: CanvasRenderingContext2D, rect: RectObstacle) => {
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.rotate(rect.angle ?? 0);
  roundedRectPath(ctx, -rect.w / 2, -rect.h / 2, rect.w, rect.h, 2);
  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
};

const drawCupMount = (ctx: CanvasRenderingContext2D, cup: CupSpec) => {
  if (!cup.mount) return;

  const width = cup.width ?? 70;
  const height = cup.height ?? 70;
  const angle = cup.angle ?? 0;
  const bottom = rotate({ x: 0, y: height / 2 + 3 }, angle);

  ctx.save();
  ctx.translate(cup.x + bottom.x, cup.y + bottom.y);
  ctx.rotate(angle);

  if (cup.mount === 'floor' || cup.mount === 'shelf') {
    roundedRectPath(ctx, -width * 0.25, -5, width * 0.5, 10, 4);
  } else {
    roundedRectPath(ctx, -width * 0.22, -5, width * 0.44, 10, 4);
  }

  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.restore();
};

const drawCup = (ctx: CanvasRenderingContext2D, cup: CupSpec, success: boolean) => {
  const width = cup.width ?? 70;
  const height = cup.height ?? 70;
  ctx.save();
  ctx.translate(cup.x, cup.y);
  ctx.rotate(cup.angle ?? 0);

  ctx.beginPath();
  ctx.moveTo(-width / 2, -height / 2);
  ctx.lineTo(-width * 0.34, height / 2);
  ctx.lineTo(width * 0.34, height / 2);
  ctx.lineTo(width / 2, -height / 2);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = success ? 8 : 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-width / 2 + 7, -height / 2 + 1);
  ctx.lineTo(width / 2 - 7, -height / 2 + 1);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (success) {
    ctx.fillStyle = 'rgba(17,17,17,0.08)';
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 6, -height / 2 + 8);
    ctx.lineTo(-width * 0.34 + 6, height / 2 - 6);
    ctx.lineTo(width * 0.34 - 6, height / 2 - 6);
    ctx.lineTo(width / 2 - 6, -height / 2 + 8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
};

const drawBall = (ctx: CanvasRenderingContext2D, ball: BallBody, frozen: boolean) => {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-ball.r * 0.32, -ball.r * 0.34, ball.r * 0.16, 0, TAU);
  ctx.fillStyle = frozen ? '#ffffff' : 'rgba(255,255,255,0.78)';
  ctx.fill();
  ctx.restore();
};

const drawStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
  glow = 0,
) => {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
};

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const formatReward = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
    Math.max(0, value),
  );

const initials = (name: string) =>
  name.replace('@', '').trim().slice(0, 2).toUpperCase() || 'TG';

function PlayerAvatar({
  profile,
  size = 36,
}: {
  profile: DrawDropPlayerProfile;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#111111] bg-white text-[8px] font-black uppercase leading-[1.4] text-[#111111]"
      style={{ width: size, height: size }}
    >
      {profile.photoUrl ? (
        <img
          src={profile.photoUrl}
          alt={profile.name}
          className="h-full w-full object-cover grayscale"
          draggable={false}
        />
      ) : (
        initials(profile.name)
      )}
    </div>
  );
}

function ResultCountUp({
  target,
  active,
  duration = 760,
  decimals = 0,
  suffix = '',
}: {
  target: number;
  active: boolean;
  duration?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, duration, target]);

  const shown = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  return <>{shown}{suffix}</>;
}

const DrawDropGame = () => {
  const navigate = useNavigate();
  const match = useDrawDropOnline();
  const sendLevelComplete = match.sendLevelComplete;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  const bodiesRef = useRef<RigidStroke[]>([]);
  const ballRef = useRef<BallBody>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 15,
    angle: 0,
    omega: 0,
  });
  const phaseRef = useRef<Phase>('draw');
  const levelSlotRef = useRef(0);
  const levelRef = useRef<LevelSpec>(LEVELS[0]);
  const simTimeRef = useRef(0);
  const cupHoldRef = useRef(0);
  const stuckTimeRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const accumulatorRef = useRef(0);
  const matchPhaseRef = useRef(match.phase);
  const completedRef = useRef<boolean[]>([false, false, false, false, false]);
  const failureTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const [levelSlot, setLevelSlot] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('draw');
  const [inkUsed, setInkUsed] = useState(0);
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [optimisticInk, setOptimisticInk] = useState<number[]>([0, 0, 0, 0, 0]);
  const [resultStage, setResultStage] = useState(-1);

  matchPhaseRef.current = match.phase;

  const levelSelectionKey =
    match.levelIndices.length >= 5
      ? match.levelIndices.slice(0, 5).join(',')
      : '0,1,2,3,4';

  const selectedLevelIndices = useMemo(
    () =>
      levelSelectionKey.split(',').map((raw) =>
        Math.max(0, Math.min(LEVELS.length - 1, Number(raw) || 0)),
      ),
    [levelSelectionKey],
  );

  const selectedLevels = useMemo(
    () => selectedLevelIndices.map((index) => LEVELS[index] || LEVELS[0]),
    [selectedLevelIndices],
  );

  const mergedCompleted = useMemo(
    () =>
      Array.from({ length: 5 }, (_, slot) =>
        Boolean(match.myCompleted[slot] || optimisticCompleted[slot]),
      ),
    [match.myCompleted, optimisticCompleted],
  );

  const mergedInk = useMemo(
    () =>
      Array.from({ length: 5 }, (_, slot) =>
        match.myInk[slot] || optimisticInk[slot] || 0,
      ),
    [match.myInk, optimisticInk],
  );

  completedRef.current = mergedCompleted;

  const completedCount = mergedCompleted.filter(Boolean).length;
  const successfulInkTotal = mergedInk.reduce((sum, value, slot) =>
    mergedCompleted[slot] ? sum + value : sum,
  0);

  const currentLevel = selectedLevels[levelSlot] || LEVELS[0];
  levelRef.current = currentLevel;
  levelSlotRef.current = levelSlot;
  const currentCompleted = mergedCompleted[levelSlot] === true;

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const haptic = useCallback(
    (strength: 'light' | 'medium' | 'heavy' = 'light') => {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(strength);
    },
    [],
  );

  const clearAttemptTimers = useCallback(() => {
    if (failureTimerRef.current !== null) {
      window.clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const resetBall = useCallback((spec: LevelSpec) => {
    ballRef.current = {
      x: spec.ball.x,
      y: spec.ball.y,
      vx: 0,
      vy: 0,
      r: spec.ball.r ?? 15,
      angle: 0,
      omega: 0,
    };
  }, []);

  const resetAttempt = useCallback(
    (spec = levelRef.current) => {
      clearAttemptTimers();
      strokesRef.current = [];
      currentStrokeRef.current = [];
      bodiesRef.current = [];
      simTimeRef.current = 0;
      cupHoldRef.current = 0;
      stuckTimeRef.current = 0;
      accumulatorRef.current = 0;
      lastTimestampRef.current = 0;
      resetBall(spec);
      setInkUsed(0);
      setPhase('draw');
    },
    [clearAttemptTimers, resetBall, setPhase],
  );

  const switchLevel = useCallback(
    (nextSlot: number) => {
      if (phaseRef.current === 'sim') return;
      const normalized = Math.max(0, Math.min(4, nextSlot));
      if (normalized === levelSlotRef.current) return;
      const spec = selectedLevels[normalized] || LEVELS[0];
      levelSlotRef.current = normalized;
      levelRef.current = spec;
      setLevelSlot(normalized);
      resetAttempt(spec);
      haptic('light');
    },
    [haptic, resetAttempt, selectedLevels],
  );

  const findNextUnsolved = useCallback((from: number, completed: boolean[]) => {
    for (let offset = 1; offset <= 5; offset += 1) {
      const slot = (from + offset) % 5;
      if (!completed[slot]) return slot;
    }
    return -1;
  }, []);

  useEffect(() => {
    if (match.matchInstanceKey <= 0) return;
    setOptimisticCompleted([false, false, false, false, false]);
    setOptimisticInk([0, 0, 0, 0, 0]);
    levelSlotRef.current = 0;
    levelRef.current = selectedLevels[0] || LEVELS[0];
    setLevelSlot(0);
    resetAttempt(selectedLevels[0] || LEVELS[0]);
  }, [match.matchInstanceKey, resetAttempt, selectedLevels]);

  useEffect(() => {
    levelRef.current = currentLevel;
    if (phaseRef.current !== 'sim') {
      resetBall(currentLevel);
    }
  }, [currentLevel, resetBall]);

  useEffect(() => {
    if (match.phase !== 'match_over') {
      setResultStage(-1);
      return;
    }

    setResultStage(-1);
    const sequence = [
      { delay: 70, stage: 0 },
      { delay: 430, stage: 1 },
      { delay: 1500, stage: 2 },
      { delay: 2820, stage: 3 },
      { delay: 4240, stage: 4 },
    ];
    const timers = sequence.map(({ delay, stage }) =>
      window.setTimeout(() => setResultStage(stage), delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [match.phase, match.matchInstanceKey]);

  useEffect(
    () => () => {
      clearAttemptTimers();
    },
    [clearAttemptTimers],
  );

  const startSimulation = useCallback(() => {
    if (
      matchPhaseRef.current !== 'playing' ||
      phaseRef.current !== 'draw' ||
      completedRef.current[levelSlotRef.current]
    ) {
      return;
    }

    const spec = levelRef.current;
    bodiesRef.current = strokesRef.current
      .map(createRigidStroke)
      .filter((body): body is RigidStroke => body !== null);
    simTimeRef.current = 0;
    cupHoldRef.current = 0;
    stuckTimeRef.current = 0;
    accumulatorRef.current = 0;
    lastTimestampRef.current = 0;
    resetBall(spec);
    setPhase('sim');
    haptic('medium');
  }, [haptic, resetBall, setPhase]);

  const clearDrawing = useCallback(() => {
    if (phaseRef.current !== 'draw') return;
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setInkUsed(0);
    haptic('light');
  }, [haptic]);

  const undoStroke = useCallback(() => {
    if (phaseRef.current !== 'draw') return;
    const next = strokesRef.current.slice(0, -1);
    strokesRef.current = next;
    setInkUsed(next.reduce((sum, stroke) => sum + stroke.length, 0));
    haptic('light');
  }, [haptic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;

    let cssWidth = 0;
    let cssHeight = 0;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let frameId = 0;

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      scale = Math.min(cssWidth / WORLD_W, cssHeight / WORLD_H);
      offsetX = (cssWidth - WORLD_W * scale) / 2;
      offsetY = (cssHeight - WORLD_H * scale) / 2;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    resize();

    const screenToWorld = (clientX: number, clientY: number): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - offsetX) / scale,
        y: (clientY - rect.top - offsetY) / scale,
      };
    };

    const getStaticRects = (spec: LevelSpec): StaticRect[] => [
      ...WORLD_BOUNDS,
      ...spec.obstacles.map((rect) => ({
        ...rect,
        restitution: 0.46,
        friction: 0.04,
      })),
      ...makeCupRects(spec.cup),
    ];

    const failAttempt = () => {
      if (phaseRef.current !== 'sim') return;
      setPhase('failed');
      getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.('error');
      failureTimerRef.current = window.setTimeout(() => {
        if (matchPhaseRef.current === 'playing') resetAttempt(levelRef.current);
      }, 430);
    };

    const physicsStep = (dt: number) => {
      if (phaseRef.current !== 'sim' || matchPhaseRef.current !== 'playing') return;
      const spec = levelRef.current;
      const ball = ballRef.current;
      const bodies = bodiesRef.current;
      const statics = getStaticRects(spec);

      simTimeRef.current += dt;
      ball.vy += GRAVITY * dt;
      ball.vx *= 0.99996;
      ball.vy *= 0.99998;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.angle += ball.omega * dt;
      ball.omega *= 0.9995;

      for (const body of bodies) {
        body.vy += GRAVITY * dt;
        body.vx *= 0.9994;
        body.vy *= 0.99955;
        body.omega *= 0.999;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angle += body.omega * dt;
      }

      for (let iteration = 0; iteration < 3; iteration += 1) {
        for (const rect of statics) resolveBallStatic(ball, rect);
        for (const body of bodies) {
          let grounded = false;
          for (const rect of statics) {
            if (resolveRigidStatic(body, rect)) grounded = true;
          }
          resolveBallRigid(ball, body);
          if (grounded && Math.hypot(body.vx, body.vy) < 7 && Math.abs(body.omega) < 0.06) {
            body.sleeping += dt;
            if (body.sleeping > 0.6) {
              body.vx *= 0.91;
              body.vy *= 0.91;
              body.omega *= 0.9;
            }
          } else {
            body.sleeping = 0;
          }
        }
        for (let a = 0; a < bodies.length; a += 1) {
          for (let b = a + 1; b < bodies.length; b += 1) {
            resolveRigidPair(bodies[a], bodies[b]);
          }
        }
      }

      const local = cupLocalPoint(spec.cup, { x: ball.x, y: ball.y });
      const cupW = spec.cup.width ?? 70;
      const cupH = spec.cup.height ?? 70;
      const captureSpeed = spec.cup.captureSpeed ?? 300;
      const captureHold = spec.cup.captureHold ?? SUCCESS_HOLD;
      const inside =
        Math.abs(local.x) < cupW * 0.39 - ball.r * 0.1 &&
        local.y > -cupH * 0.36 &&
        local.y < cupH * 0.5 &&
        Math.hypot(ball.vx, ball.vy) < captureSpeed;

      if (inside) {
        cupHoldRef.current += dt;
      } else {
        cupHoldRef.current = Math.max(0, cupHoldRef.current - dt * 1.7);
      }

      if (cupHoldRef.current >= captureHold) {
        const slot = levelSlotRef.current;
        const solvedInk = Math.max(
          0,
          Math.round(strokesRef.current.reduce((sum, stroke) => sum + stroke.length, 0)),
        );

        completedRef.current = completedRef.current.map((value, index) =>
          index === slot ? true : value,
        );
        setOptimisticCompleted((previous) =>
          previous.map((value, index) => (index === slot ? true : value)),
        );
        setOptimisticInk((previous) =>
          previous.map((value, index) => (index === slot ? solvedInk : value)),
        );
        sendLevelComplete(slot, solvedInk);
        setPhase('success');
        getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.('success');

        successTimerRef.current = window.setTimeout(() => {
          const next = findNextUnsolved(slot, completedRef.current);
          if (next >= 0) {
            const nextSpec = selectedLevels[next] || LEVELS[0];
            levelSlotRef.current = next;
            levelRef.current = nextSpec;
            setLevelSlot(next);
            resetAttempt(nextSpec);
          } else {
            resetAttempt(levelRef.current);
          }
        }, 420);
        return;
      }

      const bodyActive = bodies.some(
        (body) => Math.hypot(body.vx, body.vy) > 8 || Math.abs(body.omega) > 0.08,
      );
      const ballActive = Math.hypot(ball.vx, ball.vy) > 8 || Math.abs(ball.omega) > 0.08;
      if (!inside && simTimeRef.current > 0.45 && !ballActive && !bodyActive) {
        stuckTimeRef.current += dt;
      } else {
        stuckTimeRef.current = 0;
      }

      const escaped = ball.y > WORLD_H + 55 || ball.x < -55 || ball.x > WORLD_W + 55;
      if (
        escaped ||
        simTimeRef.current >= MAX_SIM_TIME ||
        stuckTimeRef.current >= STUCK_FAIL_TIME
      ) {
        failAttempt();
      }
    };

    const render = (timestamp: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const spec = levelRef.current;
      const currentPhase = phaseRef.current;

      ctx.strokeStyle = 'rgba(17,17,17,0.035)';
      ctx.lineWidth = 1;
      for (let y = 96; y < WORLD_H; y += 48) {
        ctx.beginPath();
        ctx.moveTo(18, y);
        ctx.lineTo(WORLD_W - 18, y);
        ctx.stroke();
      }

      drawWorldBounds(ctx);
      for (const obstacle of spec.obstacles) drawObstacle(ctx, obstacle);
      drawCupMount(ctx, spec.cup);
      drawCup(ctx, spec.cup, currentPhase === 'success');

      if (currentPhase === 'draw' || currentPhase === 'failed' || currentPhase === 'success') {
        for (const stroke of strokesRef.current) {
          drawStroke(ctx, stroke.points, '#111111', 10, 0);
        }
        const current = currentStrokeRef.current;
        if (current.length > 1) drawStroke(ctx, current, '#111111', 10, 0);
      } else {
        for (const body of bodiesRef.current) {
          const points = body.localPoints.map((point) => worldPoint(body, point));
          drawStroke(ctx, points, '#111111', 10, 0);
          drawStroke(ctx, points, 'rgba(255,255,255,0.55)', 1.2, 0);
        }
      }

      drawBall(ctx, ballRef.current, currentPhase !== 'sim');
      ctx.restore();

      if (lastTimestampRef.current === 0) lastTimestampRef.current = timestamp;
      const frameDt = Math.min(0.034, (timestamp - lastTimestampRef.current) / 1000);
      lastTimestampRef.current = timestamp;

      accumulatorRef.current += frameDt;
      let steps = 0;
      while (accumulatorRef.current >= FIXED_DT && steps < 6) {
        physicsStep(FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
        steps += 1;
      }

      frameId = window.requestAnimationFrame(render);
    };

    const canDraw = () =>
      matchPhaseRef.current === 'playing' &&
      phaseRef.current === 'draw' &&
      !completedRef.current[levelSlotRef.current];

    const onPointerDown = (event: PointerEvent) => {
      if (!canDraw()) return;
      const spec = levelRef.current;
      const point = screenToWorld(event.clientX, event.clientY);
      if (point.x < 0 || point.x > WORLD_W || point.y < 0 || point.y > WORLD_H) return;
      if (isDrawBlocked(point, spec)) {
        haptic('light');
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      currentStrokeRef.current = [point];
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!canDraw() || currentStrokeRef.current.length === 0) return;
      const spec = levelRef.current;
      const point = screenToWorld(event.clientX, event.clientY);
      const previous = currentStrokeRef.current[currentStrokeRef.current.length - 1];
      const rawDistance = distance(previous, point);
      if (rawDistance < 2.2) return;
      if (isDrawBlocked(point, spec)) return;

      const completedLength = strokesRef.current.reduce((sum, stroke) => sum + stroke.length, 0);
      currentStrokeRef.current = [...currentStrokeRef.current, point];
      setInkUsed(completedLength + polylineLength(currentStrokeRef.current));
    };

    const finishStroke = (event: PointerEvent) => {
      if (currentStrokeRef.current.length < 2) {
        currentStrokeRef.current = [];
        return;
      }
      const sampled = resamplePolyline(currentStrokeRef.current, 3.5);
      const length = polylineLength(sampled);
      if (length >= 5) {
        strokesRef.current = [...strokesRef.current, { points: sampled, length }];
      }
      currentStrokeRef.current = [];
      setInkUsed(strokesRef.current.reduce((sum, stroke) => sum + stroke.length, 0));
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    frameId = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishStroke);
      canvas.removeEventListener('pointercancel', finishStroke);
    };
  }, [
    findNextUnsolved,
    haptic,
    sendLevelComplete,
    resetAttempt,
    resetBall,
    selectedLevels,
    setPhase,
  ]);

  const didWin =
    !match.draw && match.winnerUserId > 0 && match.winnerUserId === match.myUserId;
  const didLose =
    !match.draw && match.winnerUserId > 0 && match.winnerUserId !== match.myUserId;
  const profit = didWin ? match.winnerProfit : 0;

  const myRatio = match.myInkRatioBP > 0 ? match.myInkRatioBP / 10000 : 0;
  const opponentRatio =
    match.opponentInkRatioBP > 0 ? match.opponentInkRatioBP / 10000 : 0;

  return (
    <section
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-white text-[#111111]"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
      }}
    >
      <header className="relative z-30 flex h-[70px] shrink-0 items-center justify-between border-b-2 border-[#111111] bg-white px-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PlayerAvatar profile={match.playerProfile} />
          <div className="min-w-0">
            <p className="max-w-[88px] truncate py-[1px] text-[7px] font-black leading-[1.5]">
              {match.playerProfile.name}
            </p>
            <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.1em] text-black/45">
              YOU · {completedCount}/5
            </p>
          </div>
        </div>

        <div className="shrink-0 px-2 text-center">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.15em] text-black/35">
            LEVEL {levelSlot + 1}/5
          </p>
          <p className="py-[1px] text-[19px] font-black leading-[1.25] tabular-nums">
            {formatTime(match.matchTimeLeft)}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 text-right">
          <PlayerAvatar profile={match.opponentProfile} />
          <div className="min-w-0">
            <p className="ml-auto max-w-[88px] truncate py-[1px] text-[7px] font-black leading-[1.5]">
              {match.opponentProfile.name}
            </p>
            <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.1em] text-black/45">
              {match.opponentCompletedCount}/5 DONE
            </p>
          </div>
        </div>
      </header>

      <div ref={shellRef} className="relative min-h-0 w-full flex-1 touch-none overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" />

        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
          <div className="border-2 border-[#111111] bg-white px-3 py-1 text-center">
            <p className="text-[7px] font-black uppercase leading-[1.45] tracking-[.12em]">
              {currentLevel.name}
            </p>
            <p className="text-[6px] font-bold uppercase leading-[1.4] tracking-[.1em] text-black/40">
              MAP {selectedLevelIndices[levelSlot] + 1}/100
            </p>
          </div>
        </div>

        {phase === 'failed' && match.phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-white/35">
            <div className="border-[3px] border-[#111111] bg-white px-5 py-2 text-[15px] font-black uppercase tracking-[.14em]">
              MISS
            </div>
          </div>
        )}

        {phase === 'success' && match.phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-white/35">
            <div className="border-[3px] border-[#111111] bg-[#111111] px-5 py-3 text-center text-white">
              <p className="text-[8px] font-black uppercase tracking-[.14em]">COMPLETE</p>
              <p className="mt-1 text-[24px] font-black leading-none">{Math.round(inkUsed)}</p>
              <p className="mt-1 text-[6px] font-black uppercase tracking-[.12em] text-white/65">INK</p>
            </div>
          </div>
        )}

        {currentCompleted && match.phase === 'playing' && phase === 'draw' && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-white/42">
            <div className="border-[3px] border-[#111111] bg-white px-5 py-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-[.15em]">DONE</p>
              <p className="mt-1 text-[22px] font-black">{mergedInk[levelSlot] || 0}</p>
              <p className="text-[6px] font-black uppercase tracking-[.12em] text-black/45">SUCCESSFUL INK</p>
            </div>
          </div>
        )}

        {completedCount >= 5 && match.phase === 'playing' && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-white/88 px-6">
            <div className="w-full max-w-[300px] border-[3px] border-[#111111] bg-white p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[.16em]">ALL 5 COMPLETE</p>
              <p className="mt-2 text-[26px] font-black">{successfulInkTotal}</p>
              <p className="text-[7px] font-black uppercase tracking-[.12em] text-black/45">TOTAL INK</p>
              <p className="mt-3 text-[7px] font-black uppercase tracking-[.12em] text-black/45">
                ЖДЁМ СОПЕРНИКА · {formatTime(match.matchTimeLeft)}
              </p>
            </div>
          </div>
        )}

        {match.phase === 'waiting' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-white/94 px-5">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[#111111]/15 border-t-[#111111]" />
              <p className="mt-3 text-[8px] font-black uppercase tracking-[.16em]">
                {match.connectionStatus === 'open' ? 'ЖДЁМ СОПЕРНИКА' : 'ПОДКЛЮЧАЕМСЯ'}
              </p>
            </div>
          </div>
        )}

        {match.phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-white/94">
            <div className="text-center">
              <p className="text-[7px] font-black uppercase tracking-[.16em] text-black/45">
                5 RANDOM MAPS · 100 SEC
              </p>
              <div className="mt-1 text-[72px] font-black leading-none">
                {Math.max(1, match.countdownLeft)}
              </div>
            </div>
          </div>
        )}

        {match.socketError && match.phase !== 'match_over' && (
          <div className="pointer-events-none absolute inset-x-4 bottom-3 z-50 border-2 border-[#111111] bg-white px-3 py-2 text-center text-[7px] font-black leading-[1.5]">
            {match.socketError}
          </div>
        )}
      </div>

      <div className="relative z-30 shrink-0 border-t-2 border-[#111111] bg-white px-2 pb-2 pt-2">
        <div className="mx-auto max-w-[430px]">
          <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2">
            <button
              type="button"
              onClick={() => switchLevel(levelSlot - 1)}
              disabled={levelSlot <= 0 || phase === 'sim'}
              className="grid h-9 place-items-center border-2 border-[#111111] bg-white disabled:opacity-20"
              aria-label="Previous level"
            >
              <ChevronLeft size={18} strokeWidth={2.7} />
            </button>

            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }, (_, slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => switchLevel(slot)}
                  disabled={phase === 'sim'}
                  className={[
                    'h-9 border-2 border-[#111111] text-[9px] font-black tabular-nums',
                    slot === levelSlot
                      ? 'bg-[#111111] text-white'
                      : mergedCompleted[slot]
                        ? 'bg-black/10 text-[#111111]'
                        : 'bg-white text-[#111111]',
                  ].join(' ')}
                >
                  {mergedCompleted[slot] ? '✓' : slot + 1}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => switchLevel(levelSlot + 1)}
              disabled={levelSlot >= 4 || phase === 'sim'}
              className="grid h-9 place-items-center border-2 border-[#111111] bg-white disabled:opacity-20"
              aria-label="Next level"
            >
              <ChevronRight size={18} strokeWidth={2.7} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-[46px_46px_1fr] gap-2">
            {phase === 'sim' ? (
              <>
                <div className="col-span-2 flex h-10 items-center justify-center border-2 border-[#111111] bg-white text-[8px] font-black uppercase tracking-[.12em]">
                  PHYSICS
                </div>
                <button
                  type="button"
                  onClick={() => resetAttempt(currentLevel)}
                  className="flex h-10 items-center justify-center gap-2 border-2 border-[#111111] bg-[#111111] text-[10px] font-black uppercase tracking-[.1em] text-white"
                >
                  <RotateCcw size={15} /> RESET
                </button>
              </>
            ) : currentCompleted ? (
              <div className="col-span-3 flex h-10 items-center justify-between border-2 border-[#111111] bg-white px-3">
                <span className="text-[8px] font-black uppercase tracking-[.12em]">COMPLETED</span>
                <span className="text-[14px] font-black tabular-nums">{mergedInk[levelSlot] || 0} INK</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={undoStroke}
                  disabled={strokesRef.current.length === 0 || match.phase !== 'playing'}
                  className="flex h-10 items-center justify-center border-2 border-[#111111] bg-white disabled:opacity-20"
                  aria-label="Undo last stroke"
                >
                  <Undo2 size={17} strokeWidth={2.6} />
                </button>
                <button
                  type="button"
                  onClick={clearDrawing}
                  disabled={
                    (strokesRef.current.length === 0 && currentStrokeRef.current.length === 0) ||
                    match.phase !== 'playing'
                  }
                  className="flex h-10 items-center justify-center border-2 border-[#111111] bg-white disabled:opacity-20"
                  aria-label="Clear drawing"
                >
                  <Trash2 size={17} strokeWidth={2.6} />
                </button>
                <button
                  type="button"
                  onClick={startSimulation}
                  disabled={match.phase !== 'playing'}
                  className="flex h-10 items-center justify-between border-2 border-[#111111] bg-[#111111] px-3 text-white disabled:opacity-30"
                >
                  <span className="text-[10px] font-black uppercase tracking-[.1em]">DROP</span>
                  <span className="text-[12px] font-black tabular-nums">{Math.round(inkUsed)} INK</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {match.phase === 'match_over' && (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-white/95 px-4">
          <div
            className={[
              'relative w-full max-w-[336px] border-[3px] border-[#111111] bg-white p-4 transition-all duration-500 ease-out',
              resultStage >= 0
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-2 scale-[.97] opacity-0',
            ].join(' ')}
          >
            <div className="text-center">
              <p className="text-[7px] font-black uppercase tracking-[.16em] text-black/40">
                DRAW & DROP · RESULTS
              </p>
              <div className="relative mt-1 min-h-[35px] overflow-hidden">
                <h2
                  className={[
                    'absolute inset-x-0 text-[24px] font-black uppercase leading-[1.25] transition-all duration-500 ease-out',
                    resultStage < 4
                      ? 'translate-y-0 opacity-100'
                      : '-translate-y-3 opacity-0',
                  ].join(' ')}
                >
                  ПОДСЧЁТ...
                </h2>
                <h2
                  className={[
                    'text-[24px] font-black uppercase leading-[1.25] transition-all duration-500 ease-out',
                    resultStage >= 4
                      ? 'translate-y-0 opacity-100'
                      : 'translate-y-3 opacity-0',
                  ].join(' ')}
                >
                  {match.draw ? 'НИЧЬЯ' : didWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
                </h2>
              </div>
              <div
                className={[
                  'game-result-reward mx-auto mt-2 flex w-fit items-center gap-1.5 border-2 border-[#111111] bg-[#111111] px-3 py-1.5 text-white transition-all duration-500 ease-out',
                  resultStage >= 4 && didWin && profit > 0
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none -translate-y-1 opacity-0',
                ].join(' ')}
              >
                <img src={coinIcon} alt="" className="h-4 w-4 grayscale invert" draggable={false} />
                <span className="text-[10px] font-black">+{formatReward(profit)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                {
                  profile: match.playerProfile,
                  completed: match.myCompletedCount,
                  totalInk: match.myTotalInk,
                  ratio: myRatio,
                  winner: didWin,
                },
                {
                  profile: match.opponentProfile,
                  completed: match.opponentCompletedCount,
                  totalInk: match.opponentTotalInk,
                  ratio: opponentRatio,
                  winner: didLose,
                },
              ].map((item, index) => {
                const finalWinner = resultStage >= 4 && !match.draw && item.winner;
                return (
                  <div
                    key={item.profile.id || index}
                    className={[
                      'border-[2px] border-[#111111] p-2.5 text-center transition-all duration-500 ease-out',
                      finalWinner
                        ? 'scale-[1.015] bg-[#111111] text-white'
                        : 'scale-100 bg-white text-[#111111]',
                    ].join(' ')}
                  >
                    <div className="mx-auto w-fit">
                      <PlayerAvatar profile={item.profile} size={44} />
                    </div>
                    <p className="mt-1.5 truncate text-[7px] font-black">{item.profile.name}</p>

                    <div
                      className={[
                        'mt-2 border-t-2 border-current pt-2 transition-all duration-500 ease-out',
                        resultStage >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-25',
                      ].join(' ')}
                    >
                      <p className="text-[6px] font-black uppercase tracking-[.1em] opacity-50">LEVELS</p>
                      <p className="mt-1 text-[20px] font-black tabular-nums">
                        <ResultCountUp
                          target={item.completed}
                          active={resultStage >= 1}
                          duration={720}
                        />
                        /5
                      </p>
                    </div>

                    <div
                      className={[
                        'mt-2 transition-all duration-500 ease-out',
                        resultStage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-20',
                      ].join(' ')}
                    >
                      <p className="text-[6px] font-black uppercase tracking-[.1em] opacity-50">INK INDEX</p>
                      <p className="mt-1 text-[14px] font-black tabular-nums">
                        {item.completed > 0 ? (
                          <ResultCountUp
                            target={item.ratio}
                            active={resultStage >= 2}
                            duration={920}
                            decimals={2}
                            suffix="x"
                          />
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>

                    <div
                      className={[
                        'mt-2 transition-all duration-500 ease-out',
                        resultStage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-20',
                      ].join(' ')}
                    >
                      <p className="text-[6px] font-black uppercase tracking-[.1em] opacity-50">USED</p>
                      <p className="mt-1 text-[14px] font-black tabular-nums">
                        <ResultCountUp
                          target={item.totalInk}
                          active={resultStage >= 3}
                          duration={980}
                        />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-center text-[6px] font-black uppercase leading-[1.55] tracking-[.1em] text-black/45">
              MORE LEVELS WINS · THEN LOWER INK INDEX
            </p>

            <div
              className={[
                'mt-4 grid grid-cols-2 gap-2 transition-all duration-500 ease-out',
                resultStage >= 4
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-2 opacity-0',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={match.backToLobbies}
                className="h-11 border-2 border-[#111111] bg-[#111111] text-[9px] font-black uppercase tracking-[.1em] text-white"
              >
                PLAY AGAIN
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="h-11 border-2 border-[#111111] bg-white text-[9px] font-black uppercase tracking-[.1em]"
              >
                НА ГЛАВНУЮ
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DrawDropGame;
