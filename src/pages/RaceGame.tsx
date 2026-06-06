/* ============================================================================
 *  DriftRace.tsx — аркадный дрифт-рейсер (top-down)
 *  ---------------------------------------------------------------------------
 *  Цель: «приятная физика из детства» — машина легко срывается в занос,
 *  зад скользит, на отпускании газа/руля сцепление возвращается и машину
 *  плавно подхватывает. Всё аркадно и прощающе.
 *
 *  Архитектура заточена под сетевую игру 1-на-1 «тень/призрак»:
 *    • симуляция идёт ФИКСИРОВАННЫМ шагом (1/60) через аккумулятор —
 *      это даёт детерминизм и стабильность независимо от FPS;
 *    • состояние машины (NetSnapshot) маленькое и сериализуемое —
 *      его можно слать по WebSocket as-is;
 *    • есть готовый рендер «призрака» + буфер интерполяции соперника.
 *  Где подключать сокет — смотри секцию «=== NETWORK ===» ниже.
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

/* ============================== ТИПЫ ===================================== */

type Vec = { x: number; y: number };
type Surface = 'asphalt' | 'curb' | 'grass';
type DecorKind = 'tree' | 'pine' | 'rock' | 'cone' | 'stand' | 'tires' | 'flag';
type ParticleKind = 'smoke' | 'dirt' | 'spark';

type CarState = {
  x: number;
  y: number;
  angle: number;   // куда смотрит нос, рад
  vx: number;      // скорость в мировых координатах, px/сек
  vy: number;
  steer: number;   // сглаженный руль -1..1
  driftPower: number; // 0..1 насколько активно скользим (для эффектов)
  // прогресс/круги
  progress: number;
  lap: number;
  armed: boolean;
};

type InputState = {
  throttle: number; // 0..1
  brake: number;    // 0..1
  steer: number;    // -1..1 (цель руля)
  drift: boolean;   // ручник
};

type Decor = { x: number; y: number; kind: DecorKind; size: number; angle: number; seed: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; kind: ParticleKind; rot: number };
type Skid = { x1: number; y1: number; x2: number; y2: number; life: number; w: number };
type Popup = { x: number; y: number; life: number; text: string; big: boolean };

/* Снимок состояния для сети — ровно это летит по WebSocket. */
export type NetSnapshot = {
  t: number;     // время на стороне отправителя, мс
  x: number;
  y: number;
  angle: number;
  drift: number; // 0..1, чтобы у призрака тоже дымил занос
  lap: number;
};

export interface DriftRaceHandle {
  /** Скормить снимок соперника, пришедший по сети. */
  pushRemoteSnapshot: (snap: NetSnapshot) => void;
  /** Сброс гонки. */
  reset: () => void;
}

interface DriftRaceProps {
  /** Зовётся ~20 раз/сек с локальным снимком — отсюда шлём в сокет. */
  onSnapshot?: (snap: NetSnapshot) => void;
  /** Показывать ли призрак собственного лучшего круга, когда соперника нет. */
  selfGhost?: boolean;
}

/* ============================ НАСТРОЙКИ ================================= */
/* Это «ручки ощущения». Их и крутим, чтобы поймать кайф заноса.          */

const STEP = 1 / 60;          // фиксированный шаг физики, сек
const TOTAL_LAPS = 5;

const ROAD_HALF = 86;         // половина ширины асфальта, px
const CURB = 16;              // ширина поребрика
const RUNOFF = 78;            // трава за поребриком (по ней можно ехать, но скользко и медленно)
const WALL = ROAD_HALF + CURB + RUNOFF; // дальше — отбойник

const TUNE = {
  enginePower: 1050,     // ускорение от газа, px/с²
  maxSpeed: 500,         // макс. скорость на асфальте, px/с
  reverseMax: 130,       // макс. скорость заднего хода
  brakePower: 1500,      // торможение, px/с²
  rollResist: 1.15,      // линейное трение качения
  airDrag: 0.0011,       // квадратичное сопротивление воздуха

  turnRate: 3.1,         // базовая скорость поворота, рад/с
  driftYaw: 2.4,         // доп. вращение в заносе (зад вылетает наружу)
  steerLerp: 11,         // насколько быстро руль доходит до цели

  // Сцепление = сколько боковой скорости ОСТАЁТСЯ за шаг.
  //   меньше -> цепко (занос гасится мгновенно)
  //   больше -> скользко (машину несёт)
  gripGrab: 0.82,        // обычная езда: бок гаснет быстро -> точный руль
  gripDrift: 0.975,      // ручник: бок живёт долго -> длинный красивый занос
  gripSpeedLoosen: 0.06, // на скорости сцепление чуть слабее (естественный снос)
} as const;

const SURFACE: Record<Surface, { roll: number; topMul: number; gripAdd: number }> = {
  // roll — множитель трения, topMul — потолок скорости, gripAdd — добавка к «скользко»
  asphalt: { roll: 1, topMul: 1, gripAdd: 0 },
  curb:    { roll: 1.4, topMul: 0.94, gripAdd: 0.05 },
  grass:   { roll: 4.2, topMul: 0.5, gripAdd: 0.1 },
};

/* ============================ МАТЕМАТИКА =============================== */

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
const rnd = seeded(20260607);
function noise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/* ============================ ТРАССА =================================== */
/* Контрольные точки замкнутой петли -> сглаживаем Catmull-Rom -> густая
   ломаная по центру. Коллизия = расстояние до ближайшего сегмента.        */

const NODES: Vec[] = [
  { x: -1450, y: -260 },
  { x: -1150, y: -1000 },
  { x: -300, y: -1280 },
  { x: 560, y: -1180 },
  { x: 1320, y: -1360 },
  { x: 1880, y: -640 },
  { x: 1640, y: 220 },
  { x: 1980, y: 860 },
  { x: 1360, y: 1380 },
  { x: 420, y: 1240 },
  { x: -220, y: 1500 },
  { x: -960, y: 1240 },
  { x: -1560, y: 720 },
];

type CenterPt = Vec & { tx: number; ty: number; dist: number };

function buildCenterline(): { pts: CenterPt[]; length: number } {
  const raw: Vec[] = [];
  const N = NODES.length;
  const SEG = 26; // точек на участок между узлами
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

type Hit = { d: number; cx: number; cy: number; nx: number; ny: number; seg: number; progress: number; surface: Surface };

function queryTrack(center: CenterPt[], total: number, x: number, y: number): Hit {
  let best: Hit = { d: Infinity, cx: x, cy: y, nx: 1, ny: 0, seg: 0, progress: 0, surface: 'grass' };
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
        cx,
        cy,
        nx: (x - cx) / inv,
        ny: (y - cy) / inv,
        seg: i,
        progress: (a.dist + Math.hypot(dx, dy) * t) / total,
        surface: 'asphalt',
      };
    }
  }
  if (best.d <= ROAD_HALF) best.surface = 'asphalt';
  else if (best.d <= ROAD_HALF + CURB) best.surface = 'curb';
  else best.surface = 'grass';
  return best;
}

/* ============================ МИР / ДЕКОР ============================== */

function buildWorld(center: CenterPt[], total: number): Decor[] {
  const decor: Decor[] = [];
  const wr = seeded(1337);
  const farEnough = (x: number, y: number, m: number) => queryTrack(center, total, x, y).d > m;

  // Конусы вдоль кромки трассы — сразу читается «гоночность».
  for (let i = 0; i < center.length; i += 6) {
    const p = center[i];
    const off = ROAD_HALF + CURB + 12;
    decor.push({ x: p.x - p.ty * off, y: p.y + p.tx * off, kind: 'cone', size: 12, angle: 0, seed: wr() });
    decor.push({ x: p.x + p.ty * off, y: p.y - p.tx * off, kind: 'cone', size: 12, angle: 0, seed: wr() });
  }

  // Трибуны, стопки шин и флаги — пореже, для атмосферы.
  for (let i = 0; i < center.length; i += 1) {
    const p = center[i];
    const side = i % 2 === 0 ? 1 : -1;
    if (i % 40 === 0) {
      const x = p.x + p.ty * side * 175;
      const y = p.y - p.tx * side * 175;
      if (farEnough(x, y, WALL + 60)) decor.push({ x, y, kind: 'stand', size: 120, angle: Math.atan2(p.ty, p.tx), seed: wr() });
    }
    if (i % 22 === 0) {
      const x = p.x + p.ty * side * 130;
      const y = p.y - p.tx * side * 130;
      if (farEnough(x, y, WALL + 18)) decor.push({ x, y, kind: 'tires', size: 26, angle: 0, seed: wr() });
    }
    if (i % 18 === 9) {
      const x = p.x - p.ty * side * 120;
      const y = p.y + p.tx * side * 120;
      if (farEnough(x, y, WALL + 10)) decor.push({ x, y, kind: 'flag', size: 34, angle: 0, seed: wr() });
    }
  }

  // Зелёнка вокруг — деревья и камни.
  for (let i = 0; i < 260; i += 1) {
    const x = -2600 + wr() * 5200;
    const y = -2500 + wr() * 4600;
    if (!farEnough(x, y, WALL + 90)) continue;
    const r = wr();
    const kind: DecorKind = r > 0.78 ? 'rock' : r > 0.5 ? 'pine' : 'tree';
    decor.push({ x, y, kind, size: 26 + wr() * 48, angle: wr() * Math.PI * 2, seed: wr() });
  }
  return decor;
}

/* ============================ ФИЗИКА ================================== */
/* Чистый фиксированный шаг. Тут живёт всё «ощущение».                    */

type StepResult = { speed: number; slip: number; surface: Surface; crossedFinish: boolean; hardHit: boolean };

function stepCar(car: CarState, input: InputState, center: CenterPt[], total: number): StepResult {
  // 1) сглаживаем руль к цели
  car.steer = lerp(car.steer, clamp(input.steer, -1, 1), clamp(TUNE.steerLerp * STEP, 0, 1));

  // 2) раскладываем скорость на «вдоль носа» и «вбок»
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let forward = car.vx * cos + car.vy * sin;
  let lateral = -car.vx * sin + car.vy * cos;

  const here = queryTrack(center, total, car.x, car.y);
  const surf = SURFACE[here.surface];
  const speedPre = Math.hypot(car.vx, car.vy);
  const speed01 = clamp(speedPre / TUNE.maxSpeed, 0, 1);

  // 3) газ / тормоз (тормоз ниже нуля = медленный задний ход)
  forward += input.throttle * TUNE.enginePower * STEP;
  if (input.brake > 0) {
    if (forward > 0) forward -= input.brake * TUNE.brakePower * STEP;
    else forward -= input.brake * TUNE.brakePower * 0.35 * STEP; // назад слабее
  }
  forward = clamp(forward, -TUNE.reverseMax, TUNE.maxSpeed * surf.topMul);

  // 4) трение
  forward -= forward * TUNE.rollResist * surf.roll * STEP;
  forward -= forward * Math.abs(forward) * TUNE.airDrag * STEP;

  // 5) поворот носа. На скорости рулится лучше; задний ход инвертирует руль.
  const steerAuthority = 0.25 + 0.75 * clamp(Math.abs(forward) / 200, 0, 1);
  const reverseSign = forward < 0 ? -1 : 1;
  let dAngle = car.steer * TUNE.turnRate * steerAuthority * reverseSign * STEP;
  if (input.drift && Math.abs(forward) > 60) {
    // ручник: зад срывается, нос доворачивается сильнее в сторону руля
    dAngle += car.steer * TUNE.driftYaw * clamp(Math.abs(forward) / 240, 0, 1) * STEP;
  }
  car.angle += dAngle;

  // 6) СЦЕПЛЕНИЕ — сердце дрифта. Сколько боковой скорости останется.
  let retain: number = input.drift ? TUNE.gripDrift : TUNE.gripGrab;
  retain += speed01 * TUNE.gripSpeedLoosen + surf.gripAdd;
  retain = clamp(retain, 0, 0.995);
  lateral *= Math.pow(retain, STEP * 60); // нормируем под фикс. шаг

  // 7) собираем скорость обратно
  const c2 = Math.cos(car.angle);
  const s2 = Math.sin(car.angle);
  car.vx = c2 * forward - s2 * lateral;
  car.vy = s2 * forward + c2 * lateral;

  // 8) интеграция позиции
  let nx = car.x + car.vx * STEP;
  let ny = car.y + car.vy * STEP;

  // 9) столкновение с отбойником: выталкиваем и гасим нормальную составляющую
  let hardHit = false;
  const next = queryTrack(center, total, nx, ny);
  if (next.d > WALL) {
    const pen = next.d - WALL;
    nx -= next.nx * pen;
    ny -= next.ny * pen;
    const vn = car.vx * next.nx + car.vy * next.ny;
    if (vn > 0) {
      car.vx -= next.nx * vn * 1.3; // лёгкий отскок
      car.vy -= next.ny * vn * 1.3;
    }
    car.vx *= 0.75;
    car.vy *= 0.75;
    if (speedPre > 160) hardHit = true;
  }
  car.x = nx;
  car.y = ny;

  // 10) занос для эффектов/очков: угол между движением и носом
  const speed = Math.hypot(car.vx, car.vy);
  const moveAngle = Math.atan2(car.vy, car.vx);
  const slip = forward > 60 ? Math.abs(angleDiff(moveAngle, car.angle)) : 0;
  car.driftPower = lerp(car.driftPower, clamp(slip / 0.7, 0, 1) * smooth(80, 200, speed), 0.2);

  // 11) круги: «вооружаемся» на середине трассы, считаем при пересечении старта
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

/* ============================ ЧАСТИЦЫ ================================= */

function spawn(list: Particle[], x: number, y: number, kind: ParticleKind, n: number, angle: number, power: number) {
  if (list.length > 320) list.splice(0, list.length - 260);
  for (let i = 0; i < n; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.7;
    const sp = (20 + Math.random() * 130) * power;
    const max = kind === 'spark' ? 0.22 + Math.random() * 0.2 : 0.5 + Math.random() * 0.7;
    list.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      size: 2 + Math.random() * (kind === 'smoke' ? 9 : 4),
      kind,
      rot: Math.random() * Math.PI * 2,
    });
  }
}

/* ============================ РЕНДЕР =================================== */

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

function strokeCenterline(ctx: CanvasRenderingContext2D, center: CenterPt[], width: number, color: string, dash?: number[]) {
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

function drawCurbs(ctx: CanvasRenderingContext2D, center: CenterPt[], side: number) {
  const off = (ROAD_HALF + CURB / 2) * side;
  for (let i = 0; i < center.length; i += 1) {
    const p = center[i];
    const q = center[(i + 1) % center.length];
    ctx.strokeStyle = i % 2 === 0 ? '#fef2f2' : '#dc2626';
    ctx.lineWidth = CURB;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(p.x - p.ty * off, p.y + p.tx * off);
    ctx.lineTo(q.x - q.ty * off, q.y + q.tx * off);
    ctx.stroke();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const size = 9000;
  const g = ctx.createLinearGradient(cx - 1400, cy - 1400, cx + 1400, cy + 1400);
  g.addColorStop(0, '#1d4d2b');
  g.addColorStop(0.5, '#2f7d3f');
  g.addColorStop(1, '#173d22');
  ctx.fillStyle = g;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);

  ctx.save();
  ctx.globalAlpha = 0.1;
  const step = 170;
  for (let x = Math.floor((cx - 1600) / step) * step; x < cx + 1600; x += step) {
    for (let y = Math.floor((cy - 1100) / step) * step; y < cy + 1100; y += step) {
      const h = noise(x, y);
      if (h > 0.5) {
        ctx.fillStyle = h > 0.78 ? '#86efac' : '#14532d';
        ctx.beginPath();
        ctx.ellipse(x + h * 80, y + noise(y, x) * 80, 14 + h * 16, 5 + h * 6, h * 6.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawTrack(ctx: CanvasRenderingContext2D, center: CenterPt[]) {
  strokeCenterline(ctx, center, (ROAD_HALF + CURB) * 2 + 30, 'rgba(0,0,0,0.22)');
  drawCurbs(ctx, center, 1);
  drawCurbs(ctx, center, -1);
  strokeCenterline(ctx, center, ROAD_HALF * 2 + 6, '#0c1016');
  strokeCenterline(ctx, center, ROAD_HALF * 2, '#23272f');
  strokeCenterline(ctx, center, ROAD_HALF * 2 - 22, '#282d36');
  strokeCenterline(ctx, center, 4, 'rgba(255,255,255,0.16)', [44, 56]);
}

function drawFinish(ctx: CanvasRenderingContext2D, center: CenterPt[], now: number) {
  const p = center[0];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.ty, p.tx));
  const cell = 15;
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -Math.floor(ROAD_HALF / cell); j < Math.floor(ROAD_HALF / cell); j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#f8fafc' : '#0b1220';
      ctx.fillRect(i * cell - cell / 2, j * cell, cell, cell);
    }
  }
  ctx.fillStyle = `rgba(250,204,21,${0.5 + Math.sin(now * 0.005) * 0.2})`;
  ctx.fillRect(-ROAD_HALF, -42, 6, 84);
  ctx.fillRect(ROAD_HALF - 6, -42, 6, 84);
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, d: Decor, now: number, car: CarState) {
  if (Math.hypot(d.x - car.x, d.y - car.y) > 1600) return;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.angle);

  const shadow = (w: number, h: number, a = 0.18) => {
    ctx.save();
    ctx.rotate(-d.angle + 0.6);
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(w * 0.25, h * 0.25, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  if (d.kind === 'tree' || d.kind === 'pine') {
    shadow(d.size * 0.7, d.size * 0.3);
    ctx.fillStyle = '#4a2d16';
    rr(ctx, -d.size * 0.08, -d.size * 0.05, d.size * 0.16, d.size * 0.5, 4);
    ctx.fill();
    if (d.kind === 'pine') {
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = ['#065f46', '#047857', '#059669'][i];
        ctx.beginPath();
        ctx.moveTo(0, -d.size * (0.75 - i * 0.22));
        ctx.lineTo(-d.size * (0.42 + i * 0.06), d.size * (0.05 + i * 0.12));
        ctx.lineTo(d.size * (0.42 + i * 0.06), d.size * (0.05 + i * 0.12));
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const g = ctx.createRadialGradient(-d.size * 0.2, -d.size * 0.3, 3, 0, -d.size * 0.2, d.size);
      g.addColorStop(0, '#7ddf64');
      g.addColorStop(0.5, '#16a34a');
      g.addColorStop(1, '#14532d');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -d.size * 0.28, d.size * 0.56, 0, Math.PI * 2);
      ctx.arc(-d.size * 0.3, -d.size * 0.02, d.size * 0.4, 0, Math.PI * 2);
      ctx.arc(d.size * 0.3, 0, d.size * 0.44, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'rock') {
    shadow(d.size * 0.45, d.size * 0.2, 0.14);
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.ellipse(0, 0, d.size * 0.5, d.size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-d.size * 0.12, -d.size * 0.1, d.size * 0.22, d.size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'cone') {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, d.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, 0, d.size * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else if (d.kind === 'tires') {
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#1e293b';
      ctx.beginPath();
      ctx.arc((i - 1.5) * d.size * 0.5, 0, d.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (d.kind === 'stand') {
    shadow(d.size * 0.9, d.size * 0.3, 0.25);
    const w = d.size * 1.5;
    const h = d.size * 0.6;
    ctx.fillStyle = '#1e293b';
    rr(ctx, -w / 2, -h / 2, w, h, 10);
    ctx.fill();
    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < 12; i += 1) {
        ctx.fillStyle = `hsl(${(i * 33 + r * 60 + Math.floor(now / 120)) % 360}, 65%, 58%)`;
        ctx.fillRect(-w * 0.42 + i * w * 0.07, -h * 0.18 + r * h * 0.2, 5, 5);
      }
    }
  } else if (d.kind === 'flag') {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, d.size * 0.5);
    ctx.lineTo(0, -d.size * 0.7);
    ctx.stroke();
    ctx.fillStyle = d.seed > 0.5 ? '#f43f5e' : '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -d.size * 0.7);
    ctx.quadraticCurveTo(d.size * 0.5, -d.size * 0.62 + Math.sin(now * 0.006 + d.seed * 6) * 4, d.size * 0.66, -d.size * 0.4);
    ctx.quadraticCurveTo(d.size * 0.36, -d.size * 0.3, 0, -d.size * 0.36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    const k = clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
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
      ctx.lineTo(-p.vx * 0.05, -p.vy * 0.05);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(120,90,50,${0.3 * k})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
    p.rot += 2 * dt;
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

function drawSkids(ctx: CanvasRenderingContext2D, list: Skid[], dt: number) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    ctx.strokeStyle = `rgba(15,15,18,${0.3 * m.life})`;
    ctx.lineWidth = m.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
    m.life -= 0.12 * dt;
    if (m.life <= 0) list.splice(i, 1);
  }
  if (list.length > 400) list.splice(0, list.length - 400);
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, opt: { ghost?: boolean; steer?: number; brake?: number; throttle?: number; speed?: number; now?: number }) {
  const ghost = !!opt.ghost;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (ghost) ctx.globalAlpha = 0.45;

  // тень
  if (!ghost) {
    ctx.save();
    ctx.rotate(-angle + 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(6, 10, 32, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // колёса
  const wheel = (wx: number, wy: number, front: boolean) => {
    ctx.save();
    ctx.translate(wx, wy);
    if (front && opt.steer) ctx.rotate(opt.steer * 0.4);
    ctx.fillStyle = '#0b1120';
    rr(ctx, -8, -6, 16, 12, 4);
    ctx.fill();
    ctx.restore();
  };
  wheel(-15, -13, false);
  wheel(-15, 13, false);
  wheel(17, -13, true);
  wheel(17, 13, true);

  // корпус
  const body = ctx.createLinearGradient(-26, -13, 30, 16);
  if (ghost) {
    body.addColorStop(0, '#1e40af');
    body.addColorStop(1, '#60a5fa');
  } else {
    body.addColorStop(0, '#b45309');
    body.addColorStop(0.45, '#f59e0b');
    body.addColorStop(1, '#f97316');
  }
  ctx.fillStyle = body;
  rr(ctx, -28, -14, 58, 28, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  rr(ctx, -25, -11, 52, 22, 9);
  ctx.stroke();

  // кабина
  ctx.fillStyle = '#0f172a';
  rr(ctx, -2, -10, 18, 20, 6);
  ctx.fill();
  const glass = ctx.createLinearGradient(0, -9, 14, 9);
  glass.addColorStop(0, ghost ? '#dbeafe' : '#bae6fd');
  glass.addColorStop(1, '#0369a1');
  ctx.fillStyle = glass;
  rr(ctx, 0, -8, 13, 16, 4);
  ctx.fill();

  // фары / стопы
  if (!ghost) {
    ctx.fillStyle = '#fff7ed';
    ctx.fillRect(26, -9, 4, 6);
    ctx.fillRect(26, 3, 4, 6);
    const braking = (opt.brake || 0) > 0.05;
    ctx.fillStyle = braking ? '#ef4444' : 'rgba(220,38,38,0.5)';
    ctx.shadowColor = braking ? '#ef4444' : 'transparent';
    ctx.shadowBlur = braking ? 14 : 0;
    ctx.fillRect(-30, -9, 4, 6);
    ctx.fillRect(-30, 3, 4, 6);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ===================== ИНТЕРПОЛЯТОР ПРИЗРАКА (СЕТЬ) ===================== */
/* Соперник приходит снимками. Рендерим его с задержкой ~100мс и плавной
   интерполяцией между снимками — классика для онлайна без дёрганья.       */

class GhostBuffer {
  private buf: NetSnapshot[] = [];
  private offset = 0; // оценка сдвига часов peer -> local
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

/* =============================== UI ===================================== */

function fmtTime(ms: number) {
  if (ms <= 0 || !isFinite(ms)) return '--:--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export const DriftRace = forwardRef<DriftRaceHandle, DriftRaceProps>(({ onSnapshot, selfGhost = true }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  const { center, total } = useMemo(() => {
    const t = buildCenterline();
    return { center: t.pts, total: t.length };
  }, []);
  const decor = useMemo(() => buildWorld(center, total), [center, total]);

  const startPose = useMemo(() => {
    const p = center[0];
    return { x: p.x, y: p.y, angle: Math.atan2(p.ty, p.tx) };
  }, [center]);

  const makeCar = useCallback((): CarState => ({
    x: startPose.x, y: startPose.y, angle: startPose.angle,
    vx: 0, vy: 0, steer: 0, driftPower: 0, progress: 0, lap: 1, armed: false,
  }), [startPose]);

  const car = useRef<CarState>(makeCar());
  const input = useRef<InputState>({ throttle: 1, brake: 0, steer: 0, drift: false });
  const keys = useRef({ up: false, down: false, left: false, right: false, drift: false });
  const touch = useRef({ left: false, right: false, drift: false, brake: false });
  const particles = useRef<Particle[]>([]);
  const skids = useRef<Skid[]>([]);
  const popups = useRef<Popup[]>([]);
  const cam = useRef({ x: startPose.x, y: startPose.y, zoom: 1, sx: 0, sy: 0, shake: 0 });
  const vp = useRef({ w: 0, h: 0, dpr: 1 });
  const acc = useRef(0);
  const lastT = useRef(0);
  const netT = useRef(0);

  // тайминг кругов
  const raceStart = useRef(performance.now());
  const lapStart = useRef(performance.now());
  const bestLap = useRef<number>(Infinity);

  // комбо-очки заноса
  const combo = useRef({ score: 0, ms: 0, idle: 0, banked: 0 });

  // призраки
  const ghostBuf = useRef(new GhostBuffer());          // сетевой соперник
  const selfRec = useRef<{ t: number; x: number; y: number; angle: number; drift: number }[]>([]);
  const bestRec = useRef<typeof selfRec.current | null>(null);

  const [hud, setHud] = useState({ speed: 0, lap: 1, drift: 0, combo: 0, banked: 0, lapTime: 0, best: Infinity });
  const [stickActive, setStickActive] = useState(false);

  const doReset = useCallback(() => {
    car.current = makeCar();
    particles.current = [];
    skids.current = [];
    popups.current = [];
    cam.current = { x: startPose.x, y: startPose.y, zoom: 1, sx: 0, sy: 0, shake: 0 };
    combo.current = { score: 0, ms: 0, idle: 0, banked: 0 };
    selfRec.current = [];
    raceStart.current = performance.now();
    lapStart.current = performance.now();
  }, [makeCar, startPose]);

  useImperativeHandle(ref, () => ({
    pushRemoteSnapshot: (s: NetSnapshot) => ghostBuf.current.push(s),
    reset: () => doReset(),
  }));

  /* ----- размеры/DPR ----- */
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    const wr = wrapRef.current;
    if (!cv || !wr) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wr.clientWidth;
    const h = wr.clientHeight;
    vp.current = { w, h, dpr };
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  /* ----- клавиатура ----- */
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

  /* ----- главный цикл ----- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;

    const loop = (now: number) => {
      const v = vp.current;
      const frameMs = lastT.current === 0 ? 16.7 : Math.min(now - lastT.current, 50);
      lastT.current = now;

      /* собираем ввод: газ автоматический (как в мобильных гонках),
         плюс газ с клавиш; руль и ручник с клавиш или тач-кнопок */
      const i = input.current;
      i.throttle = keys.current.up || (!touch.current.brake && !keys.current.down) ? 1 : 0;
      i.brake = keys.current.down || touch.current.brake ? 1 : 0;
      i.steer = (keys.current.right || touch.current.right ? 1 : 0) - (keys.current.left || touch.current.left ? 1 : 0);
      i.drift = keys.current.drift || touch.current.drift;

      /* ФИКСИРОВАННЫЙ ШАГ ФИЗИКИ */
      acc.current += frameMs / 1000;
      let guard = 0;
      let lastStep: StepResult | null = null;
      while (acc.current >= STEP && guard < 5) {
        lastStep = stepCar(car.current, i, center, total);
        acc.current -= STEP;
        guard += 1;

        const c = car.current;
        // скид-марки и дым в заносе
        if (lastStep.slip > 0.18 && lastStep.speed > 90) {
          const rx = -Math.sin(c.angle);
          const ry = Math.cos(c.angle);
          const bx = c.x - Math.cos(c.angle) * 22;
          const by = c.y - Math.sin(c.angle) * 22;
          skids.current.push(
            { x1: bx - rx * 11, y1: by - ry * 11, x2: bx - rx * 11 - c.vx * 0.03, y2: by - ry * 11 - c.vy * 0.03, life: 1, w: 5 },
            { x1: bx + rx * 11, y1: by + ry * 11, x2: bx + rx * 11 - c.vx * 0.03, y2: by + ry * 11 - c.vy * 0.03, life: 1, w: 5 },
          );
          if (Math.random() > 0.4) spawn(particles.current, bx, by, 'smoke', 1, c.angle, 0.6 + c.driftPower);
        }
        // грязь/искры по поверхности
        if (lastStep.surface === 'grass' && lastStep.speed > 70 && Math.random() > 0.5)
          spawn(particles.current, c.x - Math.cos(c.angle) * 20, c.y - Math.sin(c.angle) * 20, 'dirt', 1, c.angle, 0.8);
        if (lastStep.surface === 'curb' && lastStep.speed > 200 && Math.random() > 0.7)
          spawn(particles.current, c.x - Math.cos(c.angle) * 18, c.y - Math.sin(c.angle) * 18, 'spark', 1, c.angle, 1.2);

        if (lastStep.hardHit) {
          cam.current.shake = Math.max(cam.current.shake, 0.9);
          spawn(particles.current, c.x, c.y, 'spark', 4, c.angle, 1.4);
          combo.current.score = 0; // удар обнуляет комбо
        }

        // комбо заноса
        const cm = combo.current;
        if (lastStep.slip > 0.22 && lastStep.speed > 110) {
          cm.ms += STEP * 1000;
          cm.score += lastStep.speed * lastStep.slip * STEP * 0.6;
          cm.idle = 0;
        } else {
          cm.idle += STEP * 1000;
          if (cm.idle > 450 && cm.score > 30) {
            const mult = 1 + Math.floor(cm.ms / 1500);
            const gained = Math.round(cm.score * mult);
            cm.banked += gained;
            popups.current.push({ x: c.x, y: c.y - 30, life: 1.2, text: `+${gained}${mult > 1 ? ` x${mult}` : ''}`, big: mult > 1 });
            cm.score = 0;
            cm.ms = 0;
          }
        }

        // запись своего заезда для self-ghost
        const recT = now - lapStart.current;
        const rec = selfRec.current;
        if (rec.length === 0 || recT - rec[rec.length - 1].t > 30) {
          rec.push({ t: recT, x: c.x, y: c.y, angle: c.angle, drift: c.driftPower });
        }

        // пересекли финиш -> зафиксировать круг
        if (lastStep.crossedFinish) {
          const lapMs = now - lapStart.current;
          if (lapMs < bestLap.current) {
            bestLap.current = lapMs;
            bestRec.current = selfRec.current.slice();
          }
          lapStart.current = now;
          selfRec.current = [];
        }
      }

      /* === NETWORK: отправка локального снимка ~20Гц ===
         Здесь дёргаем onSnapshot — наружу это уходит в WebSocket.send(). */
      if (onSnapshot && now - netT.current > 50) {
        netT.current = now;
        const c = car.current;
        onSnapshot({ t: now, x: c.x, y: c.y, angle: c.angle, drift: c.driftPower, lap: c.lap });
      }

      /* камера */
      const c = car.current;
      const speed = Math.hypot(c.vx, c.vy);
      const cm = cam.current;
      const look = clamp(speed * 0.55, 60, 280);
      const dtCam = clamp(frameMs / 16.7, 0, 3);
      cm.x = lerp(cm.x, c.x + Math.cos(c.angle) * look + c.vx * 0.18, 1 - Math.pow(0.88, dtCam));
      cm.y = lerp(cm.y, c.y + Math.sin(c.angle) * look + c.vy * 0.18, 1 - Math.pow(0.88, dtCam));
      cm.zoom = lerp(cm.zoom, 1.06 - clamp(speed / TUNE.maxSpeed, 0, 1) * 0.16, 0.05 * dtCam);
      cm.shake = Math.max(0, cm.shake - 0.05 * dtCam);
      cm.sx = (Math.random() - 0.5) * cm.shake * 16;
      cm.sy = (Math.random() - 0.5) * cm.shake * 16;

      /* отрисовка */
      const dt = frameMs / 1000;
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, v.w, v.h);

      ctx.save();
      ctx.translate(v.w / 2 + cm.sx, v.h / 2 + cm.sy);
      ctx.scale(cm.zoom, cm.zoom);
      ctx.translate(-cm.x, -cm.y);

      drawGround(ctx, c.x, c.y);
      drawTrack(ctx, center);
      drawSkids(ctx, skids.current, dt);
      drawFinish(ctx, center, now);
      decor.forEach((d) => drawDecor(ctx, d, now, c));
      drawParticles(ctx, particles.current, dt);

      // призрак: приоритет — сетевой соперник, иначе свой лучший круг
      if (ghostBuf.current.active) {
        const g = ghostBuf.current.sample(now);
        if (g) {
          drawCar(ctx, g.x, g.y, g.angle, { ghost: true });
          if (g.drift > 0.3 && Math.random() > 0.6) spawn(particles.current, g.x, g.y, 'smoke', 1, g.angle, 0.5);
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

      // главная машина
      drawCar(ctx, c.x, c.y, c.angle, {
        steer: c.steer,
        brake: input.current.brake,
        throttle: input.current.throttle,
        speed,
        now,
      });

      // всплывающие очки заноса
      for (let p = popups.current.length - 1; p >= 0; p -= 1) {
        const pop = popups.current[p];
        ctx.save();
        ctx.globalAlpha = clamp(pop.life, 0, 1);
        ctx.fillStyle = pop.big ? '#fde047' : '#fb923c';
        ctx.font = `900 ${pop.big ? 30 : 22}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(pop.text, pop.x, pop.y);
        ctx.restore();
        pop.y -= 40 * dt;
        pop.life -= dt;
        if (pop.life <= 0) popups.current.splice(p, 1);
      }

      ctx.restore();

      // виньетка
      const vg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.25, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, v.w, v.h);

      // мини-карта
      drawMini(ctx, center, c, v.h, ghostBuf.current);

      // HUD-стейт ~раз в кадр (троттлим setState частотой через mod)
      setHud({
        speed: Math.round(speed * 0.45),
        lap: c.lap,
        drift: c.driftPower,
        combo: Math.round(combo.current.score * (1 + Math.floor(combo.current.ms / 1500))),
        banked: combo.current.banked,
        lapTime: now - lapStart.current,
        best: bestLap.current,
      });

      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [center, total, decor, onSnapshot, selfGhost]);

  /* тач-кнопки */
  const bind = (key: keyof typeof touch.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      touch.current[key] = true;
      setStickActive(true);
    },
    onPointerUp: () => {
      touch.current[key] = false;
    },
    onPointerLeave: () => {
      touch.current[key] = false;
    },
    onPointerCancel: () => {
      touch.current[key] = false;
    },
  });

  return (
    <div
      ref={wrapRef}
      className="relative h-[calc(100vh-120px)] min-h-[480px] w-full select-none overflow-hidden bg-[#05070d] font-mono text-white"
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* верхний HUD */}
      <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-stretch gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center backdrop-blur-md">
          <div className="text-[8px] font-black uppercase tracking-[0.3em] text-white/45">Круг</div>
          <div className="text-2xl font-black leading-none text-amber-300 tabular-nums">{hud.lap}/{TOTAL_LAPS}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center backdrop-blur-md">
          <div className="text-[8px] font-black uppercase tracking-[0.3em] text-white/45">Время</div>
          <div className="text-2xl font-black leading-none tabular-nums">{fmtTime(hud.lapTime)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-center backdrop-blur-md">
          <div className="text-[8px] font-black uppercase tracking-[0.3em] text-white/45">Лучший</div>
          <div className="text-xl font-black leading-none text-emerald-300 tabular-nums">{fmtTime(hud.best)}</div>
        </div>
      </div>

      {/* спидометр */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md">
        <div className="flex items-end gap-1">
          <div className="text-4xl font-black tabular-nums text-white">{hud.speed}</div>
          <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/45">км/ч</div>
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-300/80">Дрифт-очки: {hud.banked}</div>
      </div>

      {/* комбо-заноса */}
      {hud.combo > 30 && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 text-center">
          <div
            className="text-3xl font-black uppercase tracking-tight text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.6)]"
            style={{ transform: `scale(${1 + Math.min(hud.drift, 1) * 0.25})` }}
          >
            ЗАНОС {hud.combo}
          </div>
        </div>
      )}

      {/* мобильные кнопки */}
      <div className="absolute bottom-6 left-4 flex gap-3">
        <button {...bind('left')} className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-3xl font-black text-white/90 backdrop-blur-md active:bg-white/20">◄</button>
        <button {...bind('right')} className="flex h-20 w-20 touch-none select-none items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-3xl font-black text-white/90 backdrop-blur-md active:bg-white/20">►</button>
      </div>
      <div className="absolute bottom-6 right-4 flex items-end gap-3">
        <button {...bind('brake')} className="flex h-16 w-16 touch-none select-none items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-[11px] font-black uppercase text-white/80 backdrop-blur-md active:bg-white/20">Тормоз</button>
        <button {...bind('drift')} className="flex h-24 w-24 touch-none select-none items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/20 text-sm font-black uppercase text-amber-200 backdrop-blur-md active:bg-amber-400/40">Дрифт</button>
      </div>

      {/* подсказка */}
      {!stickActive && (
        <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-center text-[11px] text-white/60 backdrop-blur-md">
          Газ авто · руль ◄ ► или A/D · <span className="text-amber-300">Пробел = дрифт</span> · R = рестарт
        </div>
      )}
    </div>
  );
});

DriftRace.displayName = 'DriftRace';

/* мини-карта */
function drawMini(ctx: CanvasRenderingContext2D, center: CenterPt[], car: CarState, height: number, ghost: GhostBuffer) {
  const size = 128;
  const x = 16;
  const y = height - size - 16;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  center.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  const pad = 14;
  const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxY - minY));
  const ox = x + size / 2 - ((minX + maxX) / 2) * scale;
  const oy = y + size / 2 - ((minY + maxY) / 2) * scale;
  const mx = (wx: number) => ox + wx * scale;
  const my = (wy: number) => oy + wy * scale;

  ctx.save();
  ctx.fillStyle = 'rgba(5,7,13,0.55)';
  rr(ctx, x, y, size, size, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  center.forEach((p, i) => (i === 0 ? ctx.moveTo(mx(p.x), my(p.y)) : ctx.lineTo(mx(p.x), my(p.y))));
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(251,191,36,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (ghost.active) {
    const g = ghost.sample(performance.now());
    if (g) {
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(mx(g.x), my(g.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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

export default DriftRace;