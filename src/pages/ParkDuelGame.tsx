import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';

type Phase = 'driving' | 'levelComplete' | 'finished';
type ObstacleType = 'car' | 'curb' | 'cone' | 'planter' | 'barrier';

type Result = {
  rawMs: number;
  penaltyMs: number;
  totalMs: number;
  hits: number;
};

type Vec = {
  x: number;
  y: number;
};

type CarState = {
  x: number;
  y: number;
  angle: number;
  speed: number;
};

type RectObstacle = {
  id: string;
  type: ObstacleType;
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
  color?: string;
};

type ParkingZone = {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
};

type Level = {
  id: number;
  title: string;
  subtitle: string;
  start: CarState;
  zone: ParkingZone;
  obstacles: RectObstacle[];
  botBaseMs: number;
  botPenaltyMs: number;
  instruction: string;
};

type Controls = {
  steer: number;
  throttle: number;
  brake: number;
};

type FloatingPenalty = {
  id: string;
  x: number;
  y: number;
  text: string;
};

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

const MAP_W = 420;
const MAP_H = 740;

const ROAD = {
  x: 34,
  y: 16,
  w: 352,
  h: 708,
};

const CAR_W = 34;
const CAR_H = 64;

const MAX_FORWARD_SPEED = 108;
const MAX_REVERSE_SPEED = -48;
const ENGINE_ACCEL = 68;
const BRAKE_ACCEL = 88;
const DRAG = 0.986;
const ROLLING_DRAG = 14;
const STEER_POWER = 2.15;

const PARK_HOLD_MS = 950;
const ANGLE_OK = 0.28;
const CENTER_OK = 19;
const SPEED_OK = 7.5;

const formatTime = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const deg = (value: number) => (value * Math.PI) / 180;
const radToDeg = (value: number) => (value * 180) / Math.PI;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeAngle = (angle: number) => {
  let next = angle;

  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;

  return next;
};

const rotatePoint = (point: Vec, angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: point.x * c - point.y * s,
    y: point.x * s + point.y * c,
  };
};

const getBoxPoints = (x: number, y: number, w: number, h: number, angle = 0): Vec[] => {
  const hw = w / 2;
  const hh = h / 2;

  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((point) => {
    const rotated = rotatePoint(point, angle);
    return {
      x: rotated.x + x,
      y: rotated.y + y,
    };
  });
};

const project = (points: Vec[], axis: Vec) => {
  let min = points[0].x * axis.x + points[0].y * axis.y;
  let max = min;

  for (const point of points.slice(1)) {
    const dot = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, dot);
    max = Math.max(max, dot);
  }

  return { min, max };
};

const overlaps = (a: { min: number; max: number }, b: { min: number; max: number }) =>
  a.max >= b.min && b.max >= a.min;

const getAxes = (points: Vec[]) => {
  const axes: Vec[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const edge = {
      x: p2.x - p1.x,
      y: p2.y - p1.y,
    };
    const normal = {
      x: -edge.y,
      y: edge.x,
    };
    const len = Math.hypot(normal.x, normal.y) || 1;

    axes.push({
      x: normal.x / len,
      y: normal.y / len,
    });
  }

  return axes;
};

const polygonsCollide = (a: Vec[], b: Vec[]) => {
  const axes = [...getAxes(a), ...getAxes(b)];

  for (const axis of axes) {
    if (!overlaps(project(a, axis), project(b, axis))) {
      return false;
    }
  }

  return true;
};

const carPolygon = (car: CarState) => getBoxPoints(car.x, car.y, CAR_W, CAR_H, car.angle);

const obstaclePolygon = (obstacle: RectObstacle) =>
  getBoxPoints(obstacle.x, obstacle.y, obstacle.w, obstacle.h, obstacle.angle ?? 0);

const carInsideRoad = (car: CarState) => {
  const points = carPolygon(car);

  return points.every(
    (point) =>
      point.x >= ROAD.x &&
      point.x <= ROAD.x + ROAD.w &&
      point.y >= ROAD.y &&
      point.y <= ROAD.y + ROAD.h,
  );
};

const collidingObstacle = (car: CarState, obstacles: RectObstacle[]) => {
  const poly = carPolygon(car);

  for (const obstacle of obstacles) {
    if (polygonsCollide(poly, obstaclePolygon(obstacle))) {
      return obstacle;
    }
  }

  return null;
};

const isParked = (car: CarState, zone: ParkingZone) => {
  const local = rotatePoint(
    {
      x: car.x - zone.x,
      y: car.y - zone.y,
    },
    -zone.angle,
  );

  const centerOk = Math.abs(local.x) <= CENTER_OK && Math.abs(local.y) <= CENTER_OK;
  const angleOk = Math.abs(normalizeAngle(car.angle - zone.angle)) <= ANGLE_OK;
  const speedOk = Math.abs(car.speed) <= SPEED_OK;

  return centerOk && angleOk && speedOk;
};

const makePenaltyId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const levels: Level[] = [
  {
    id: 1,
    title: 'LEVEL 1',
    subtitle: 'Parallel Start',
    instruction: 'Припаркуйся параллельно между двумя машинами.',
    start: {
      x: 214,
      y: 650,
      angle: deg(-4),
      speed: 0,
    },
    zone: {
      x: 306,
      y: 258,
      w: 50,
      h: 108,
      angle: 0,
    },
    botBaseMs: 31500,
    botPenaltyMs: 1400,
    obstacles: [
      { id: 'l1-front-car', type: 'car', x: 306, y: 162, w: 36, h: 76, angle: 0, color: '#1685ff' },
      { id: 'l1-back-car', type: 'car', x: 306, y: 356, w: 36, h: 76, angle: 0, color: '#34c759' },
      { id: 'l1-left-parked-1', type: 'car', x: 118, y: 178, w: 36, h: 78, angle: 0, color: '#f6b51c' },
      { id: 'l1-left-parked-2', type: 'car', x: 118, y: 304, w: 36, h: 78, angle: 0, color: '#8b3ff2' },
      { id: 'l1-planter-left', type: 'planter', x: 88, y: 505, w: 34, h: 86 },
      { id: 'l1-planter-right', type: 'planter', x: 344, y: 512, w: 34, h: 82 },
      { id: 'l1-cone-a', type: 'cone', x: 248, y: 250, w: 18, h: 18 },
      { id: 'l1-cone-b', type: 'cone', x: 250, y: 318, w: 18, h: 18 },
      { id: 'l1-curb-guide', type: 'barrier', x: 360, y: 258, w: 12, h: 220 },
    ],
  },
  {
    id: 2,
    title: 'LEVEL 2',
    subtitle: 'Reverse Bay',
    instruction: 'Заедь задом в перпендикулярный слот справа.',
    start: {
      x: 206,
      y: 652,
      angle: deg(0),
      speed: 0,
    },
    zone: {
      x: 316,
      y: 212,
      w: 58,
      h: 92,
      angle: 0,
    },
    botBaseMs: 40500,
    botPenaltyMs: 2300,
    obstacles: [
      { id: 'l2-slot-front', type: 'car', x: 316, y: 111, w: 36, h: 76, angle: 0, color: '#f6b51c' },
      { id: 'l2-slot-back', type: 'car', x: 316, y: 324, w: 36, h: 76, angle: 0, color: '#ef2020' },
      { id: 'l2-left-blue', type: 'car', x: 116, y: 138, w: 36, h: 78, angle: deg(90), color: '#1685ff' },
      { id: 'l2-left-green', type: 'car', x: 116, y: 214, w: 36, h: 78, angle: deg(90), color: '#65c934' },
      { id: 'l2-left-orange', type: 'car', x: 116, y: 410, w: 36, h: 82, angle: 0, color: '#fb6a18' },
      { id: 'l2-left-purple', type: 'car', x: 116, y: 535, w: 36, h: 82, angle: 0, color: '#8b3ff2' },
      { id: 'l2-center-island', type: 'planter', x: 174, y: 408, w: 36, h: 176 },
      { id: 'l2-small-planter', type: 'planter', x: 352, y: 506, w: 32, h: 70 },
      { id: 'l2-cone-approach-1', type: 'cone', x: 264, y: 174, w: 18, h: 18 },
      { id: 'l2-cone-approach-2', type: 'cone', x: 258, y: 248, w: 18, h: 18 },
      { id: 'l2-right-curb', type: 'barrier', x: 365, y: 218, w: 12, h: 270 },
    ],
  },
  {
    id: 3,
    title: 'LEVEL 3',
    subtitle: 'Final Tight Spot',
    instruction: 'Аккуратно пройди S-проезд и встань в верхний слот.',
    start: {
      x: 214,
      y: 662,
      angle: deg(0),
      speed: 0,
    },
    zone: {
      x: 126,
      y: 148,
      w: 56,
      h: 102,
      angle: 0,
    },
    botBaseMs: 53500,
    botPenaltyMs: 3400,
    obstacles: [
      { id: 'l3-top-green', type: 'car', x: 210, y: 148, w: 36, h: 78, angle: 0, color: '#5dbb2f' },
      { id: 'l3-top-blue', type: 'car', x: 286, y: 148, w: 36, h: 78, angle: 0, color: '#1685ff' },
      { id: 'l3-left-orange-block', type: 'car', x: 142, y: 270, w: 36, h: 104, angle: deg(90), color: '#fb6a18' },
      { id: 'l3-right-yellow', type: 'car', x: 292, y: 323, w: 36, h: 92, angle: 0, color: '#f6b51c' },
      { id: 'l3-left-purple', type: 'car', x: 116, y: 446, w: 36, h: 92, angle: 0, color: '#8b3ff2' },
      { id: 'l3-mid-pink-block', type: 'car', x: 250, y: 474, w: 36, h: 116, angle: deg(90), color: '#f037a6' },
      { id: 'l3-mid-planter', type: 'planter', x: 184, y: 354, w: 34, h: 74 },
      { id: 'l3-right-planter', type: 'planter', x: 326, y: 535, w: 34, h: 68 },
      { id: 'l3-left-low-planter', type: 'planter', x: 86, y: 584, w: 34, h: 72 },
      { id: 'l3-right-low-planter', type: 'planter', x: 354, y: 594, w: 34, h: 72 },
      { id: 'l3-left-curb-guide', type: 'barrier', x: 57, y: 232, w: 12, h: 250 },
      { id: 'l3-right-curb-guide', type: 'barrier', x: 363, y: 342, w: 12, h: 210 },
    ],
  },
];

const VehicleShape = ({
  x,
  y,
  w,
  h,
  angle,
  color,
  opacity = 1,
  isPlayer = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  color: string;
  opacity?: number;
  isPlayer?: boolean;
}) => {
  const rx = Math.min(13, w / 2);
  const hoodY = -h / 2 + 8;
  const backY = h / 2 - 15;

  return (
    <g transform={`translate(${x} ${y}) rotate(${radToDeg(angle)})`} opacity={opacity}>
      <ellipse cx="0" cy={h / 2 + 4} rx={w * 0.66} ry="8" fill="rgba(0,0,0,.36)" />

      <rect
        x={-w / 2 - 2}
        y={-h / 2 - 2}
        width={w + 4}
        height={h + 4}
        rx={rx + 2}
        fill="rgba(0,0,0,.32)"
      />

      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={rx}
        fill={color}
        stroke={isPlayer ? 'rgba(255,255,255,.68)' : 'rgba(255,255,255,.42)'}
        strokeWidth={isPlayer ? 2 : 1.4}
        filter={isPlayer ? 'url(#playerCarGlow)' : undefined}
      />

      <rect
        x={-w / 2 + 6}
        y={-h / 2 + 13}
        width={w - 12}
        height={h * 0.24}
        rx="5"
        fill="rgba(5,8,14,.84)"
      />

      <rect
        x={-w / 2 + 6}
        y={h * 0.12}
        width={w - 12}
        height={h * 0.24}
        rx="5"
        fill="rgba(5,8,14,.80)"
      />

      <path
        d={`M ${-w / 2 + 6} ${hoodY} Q 0 ${-h / 2 - 6} ${w / 2 - 6} ${hoodY}`}
        fill="none"
        stroke="rgba(255,255,255,.48)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path
        d={`M ${-w / 2 + 5} ${backY} Q 0 ${h / 2 + 1} ${w / 2 - 5} ${backY}`}
        fill="none"
        stroke="rgba(0,0,0,.34)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <rect x={-w / 2 - 3} y={-h * 0.1} width="5" height={h * 0.25} rx="2" fill={color} />
      <rect x={w / 2 - 2} y={-h * 0.1} width="5" height={h * 0.25} rx="2" fill={color} />

      <rect x={-w / 2 + 6} y={h / 2 - 5} width="8" height="3" rx="1.5" fill="#ef4444" />
      <rect x={w / 2 - 14} y={h / 2 - 5} width="8" height="3" rx="1.5" fill="#ef4444" />

      {isPlayer && (
        <path
          d={`M 0 ${-h / 2 - 10} L -7 ${-h / 2 + 4} L 7 ${-h / 2 + 4} Z`}
          fill="#fde047"
          stroke="rgba(255,255,255,.7)"
          strokeWidth="1"
        />
      )}
    </g>
  );
};

const Planter = ({ obstacle }: { obstacle: RectObstacle }) => (
  <g transform={`translate(${obstacle.x} ${obstacle.y})`}>
    <rect x={-obstacle.w / 2} y={-obstacle.h / 2} width={obstacle.w} height={obstacle.h} rx="8" fill="#d7d0bd" />
    <rect x={-obstacle.w / 2 + 4} y={-obstacle.h / 2 + 4} width={obstacle.w - 8} height={obstacle.h - 8} rx="6" fill="#245b22" />
    <circle cx="-6" cy={-obstacle.h * 0.24} r="8" fill="#3a8f2f" />
    <circle cx="7" cy="-5" r="9" fill="#4caf38" />
    <circle cx="-5" cy={obstacle.h * 0.18} r="8" fill="#367e2e" />
    <circle cx="6" cy={obstacle.h * 0.34} r="7" fill="#58b848" />
    <circle cx="2" cy={-obstacle.h * 0.25} r="2" fill="#f7e06b" />
    <circle cx="-9" cy="8" r="2" fill="#fff3a3" />
    <circle cx="8" cy={obstacle.h * 0.24} r="2" fill="#f7e06b" />
  </g>
);

const Cone = ({ obstacle }: { obstacle: RectObstacle }) => (
  <g transform={`translate(${obstacle.x} ${obstacle.y})`}>
    <ellipse cx="0" cy="10" rx="10" ry="4" fill="rgba(0,0,0,.35)" />
    <path d="M 0 -13 L -10 11 L 10 11 Z" fill="#ef3b22" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
    <path d="M -5 -1 L 5 -1 L 7 5 L -7 5 Z" fill="#fff" opacity=".92" />
    <rect x="-11" y="9" width="22" height="5" rx="2" fill="#9b1c16" />
  </g>
);

const Barrier = ({ obstacle }: { obstacle: RectObstacle }) => (
  <g transform={`translate(${obstacle.x} ${obstacle.y}) rotate(${radToDeg(obstacle.angle ?? 0)})`}>
    <rect
      x={-obstacle.w / 2}
      y={-obstacle.h / 2}
      width={obstacle.w}
      height={obstacle.h}
      rx="5"
      fill="#d6d0c2"
      stroke="rgba(0,0,0,.22)"
    />
    {Array.from({ length: Math.max(2, Math.floor(obstacle.h / 28)) }).map((_, index) => (
      <line
        key={index}
        x1={-obstacle.w / 2}
        x2={obstacle.w / 2}
        y1={-obstacle.h / 2 + index * 28 + 8}
        y2={-obstacle.h / 2 + index * 28 + 8}
        stroke="rgba(0,0,0,.16)"
        strokeWidth="2"
      />
    ))}
  </g>
);

const ParkingZoneShape = ({ zone, active }: { zone: ParkingZone; active: boolean }) => (
  <g transform={`translate(${zone.x} ${zone.y}) rotate(${radToDeg(zone.angle)})`}>
    <rect
      x={-zone.w / 2}
      y={-zone.h / 2}
      width={zone.w}
      height={zone.h}
      rx="12"
      fill="rgba(255,245,80,.07)"
      stroke={active ? '#5efc8d' : '#facc15'}
      strokeWidth="4"
      strokeDasharray={active ? undefined : '9 7'}
      filter="url(#parkingGlow)"
    />
    <text
      x="0"
      y="10"
      textAnchor="middle"
      className="fill-yellow-300 text-[38px] font-black"
      filter="url(#parkingGlow)"
    >
      P
    </text>
  </g>
);

export const ParkDuelGame = () => {
  const navigate = useNavigate();

  const controlsRef = useRef<Controls>({ steer: 0, throttle: 0, brake: 0 });
  const carRef = useRef<CarState>({ ...levels[0].start });
  const lastTimeRef = useRef<number>(performance.now());
  const phaseRef = useRef<Phase>('driving');
  const levelIndexRef = useRef(0);
  const levelStartedAtRef = useRef(performance.now());
  const rawMsRef = useRef(0);
  const penaltyMsRef = useRef(0);
  const hitsRef = useRef(0);
  const collisionCooldownRef = useRef(0);
  const parkedHoldRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  const [levelIndex, setLevelIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('driving');
  const [car, setCar] = useState<CarState>({ ...levels[0].start });
  const [rawMs, setRawMs] = useState(0);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [hits, setHits] = useState(0);
  const [parkProgress, setParkProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [botResults, setBotResults] = useState<Result[]>([]);
  const [floatingPenalties, setFloatingPenalties] = useState<FloatingPenalty[]>([]);
  const [steerDisplay, setSteerDisplay] = useState(0);
  const [status, setStatus] = useState('Аккуратно припаркуйся в подсвеченную зону');

  const level = levels[levelIndex];

  const playerTotal = useMemo(() => results.reduce((sum, item) => sum + item.totalMs, 0), [results]);
  const botTotal = useMemo(() => botResults.reduce((sum, item) => sum + item.totalMs, 0), [botResults]);

  const addFloatingPenalty = (x: number, y: number, value: number) => {
    const id = makePenaltyId();

    setFloatingPenalties((prev) => [
      ...prev,
      {
        id,
        x,
        y,
        text: `+${(value / 1000).toFixed(1)}s`,
      },
    ]);

    window.setTimeout(() => {
      setFloatingPenalties((prev) => prev.filter((item) => item.id !== id));
    }, 850);
  };

  const setPhaseSafe = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const resetLevel = (index: number) => {
    const nextLevel = levels[index];
    const start = { ...nextLevel.start };

    levelIndexRef.current = index;
    carRef.current = start;
    controlsRef.current = { steer: 0, throttle: 0, brake: 0 };
    rawMsRef.current = 0;
    penaltyMsRef.current = 0;
    hitsRef.current = 0;
    parkedHoldRef.current = 0;
    collisionCooldownRef.current = 0;
    levelStartedAtRef.current = performance.now();
    lastTimeRef.current = performance.now();

    setLevelIndex(index);
    setCar(start);
    setRawMs(0);
    setPenaltyMs(0);
    setHits(0);
    setParkProgress(0);
    setSteerDisplay(0);
    setStatus(nextLevel.instruction);
    setPhaseSafe('driving');
  };

  const completeLevel = () => {
    if (phaseRef.current !== 'driving') return;

    const currentLevel = levels[levelIndexRef.current];

    const playerResult: Result = {
      rawMs: rawMsRef.current,
      penaltyMs: penaltyMsRef.current,
      totalMs: rawMsRef.current + penaltyMsRef.current,
      hits: hitsRef.current,
    };

    const botRandom = Math.floor(Math.random() * 4300) - 1500;
    const botHits = Math.max(0, Math.round(currentLevel.botPenaltyMs / 1000 + Math.random() * 2 - 1));
    const botPenalty = Math.max(0, currentLevel.botPenaltyMs + botHits * 250 + Math.floor(Math.random() * 900));
    const botRaw = Math.max(13000, currentLevel.botBaseMs + botRandom);

    const botResult: Result = {
      rawMs: botRaw,
      penaltyMs: botPenalty,
      totalMs: botRaw + botPenalty,
      hits: botHits,
    };

    setResults((prev) => [...prev, playerResult]);
    setBotResults((prev) => [...prev, botResult]);
    setStatus('Уровень завершён');
    setPhaseSafe('levelComplete');

    window.setTimeout(() => {
      const nextIndex = levelIndexRef.current + 1;

      if (nextIndex >= levels.length) {
        setPhaseSafe('finished');
        setStatus('Матч завершён');
        return;
      }

      resetLevel(nextIndex);
    }, 1450);
  };

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlTouch = document.documentElement.style.touchAction;
    const prevBodyTouch = document.body.style.touchAction;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.userSelect = 'none';

    const preventTouch = (event: TouchEvent) => {
      event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.touchAction = prevHtmlTouch;
      document.body.style.touchAction = prevBodyTouch;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.userSelect = prevBodyUserSelect;

      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  useEffect(() => {
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (phaseRef.current === 'driving') {
        const currentLevel = levels[levelIndexRef.current];
        const previous = { ...carRef.current };
        const controls = controlsRef.current;
        const next = { ...carRef.current };

        rawMsRef.current = now - levelStartedAtRef.current;

        const throttleForce = controls.throttle * ENGINE_ACCEL;
        const brakeForce = controls.brake * BRAKE_ACCEL;
        const movingForward = next.speed >= 0;

        if (controls.throttle > 0) {
          next.speed += throttleForce * dt;
        }

        if (controls.brake > 0) {
          next.speed -= (movingForward ? brakeForce : ENGINE_ACCEL * 0.72) * dt;
        }

        if (controls.throttle === 0 && controls.brake === 0) {
          if (next.speed > 0) next.speed = Math.max(0, next.speed - ROLLING_DRAG * dt);
          if (next.speed < 0) next.speed = Math.min(0, next.speed + ROLLING_DRAG * dt);
        }

        next.speed *= Math.pow(DRAG, dt * 60);
        next.speed = clamp(next.speed, MAX_REVERSE_SPEED, MAX_FORWARD_SPEED);

        const speedRatio = clamp(Math.abs(next.speed) / MAX_FORWARD_SPEED, 0, 1);
        const steerEffect = controls.steer * STEER_POWER * (0.23 + speedRatio * 0.96);
        const reverseSign = next.speed >= 0 ? 1 : -1;

        next.angle += steerEffect * reverseSign * dt;
        next.x += Math.sin(next.angle) * next.speed * dt;
        next.y -= Math.cos(next.angle) * next.speed * dt;

        const roadOk = carInsideRoad(next);
        const obstacle = collidingObstacle(next, currentLevel.obstacles);
        const collision = !roadOk || obstacle;

        if (collision) {
          carRef.current = {
            ...previous,
            speed: -previous.speed * 0.16,
          };

          if (now - collisionCooldownRef.current > 420) {
            const base = obstacle?.type === 'car' ? 1000 : obstacle?.type === 'cone' ? 400 : 650;
            const strong = Math.abs(previous.speed) > 52 ? 850 : 0;
            const penalty = base + strong;

            penaltyMsRef.current += penalty;
            hitsRef.current += 1;
            collisionCooldownRef.current = now;

            addFloatingPenalty(previous.x, previous.y - 30, penalty);

            if (obstacle?.type === 'car') {
              setStatus('Касание машины: штраф');
            } else if (obstacle?.type === 'cone') {
              setStatus('Сбит конус: штраф');
            } else {
              setStatus('Касание бордюра: штраф');
            }
          }
        } else {
          carRef.current = next;
        }

        const parked = isParked(carRef.current, currentLevel.zone);

        if (parked) {
          parkedHoldRef.current += dt * 1000;
          setStatus('Удерживай машину на месте...');
        } else {
          parkedHoldRef.current = Math.max(0, parkedHoldRef.current - dt * 850);

          if (Math.abs(carRef.current.speed) > 10) {
            setStatus(currentLevel.instruction);
          }
        }

        if (parkedHoldRef.current >= PARK_HOLD_MS) {
          completeLevel();
        }

        setCar(carRef.current);
        setRawMs(rawMsRef.current);
        setPenaltyMs(penaltyMsRef.current);
        setHits(hitsRef.current);
        setParkProgress(clamp(parkedHoldRef.current / PARK_HOLD_MS, 0, 1));
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const restart = () => {
    setResults([]);
    setBotResults([]);
    resetLevel(0);
  };

  const onSteerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = event.currentTarget.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const value = clamp((event.clientX - center) / (rect.width * 0.35), -1, 1);

    controlsRef.current.steer = value;
    setSteerDisplay(value);
  };

  const onSteerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const value = clamp((event.clientX - center) / (rect.width * 0.35), -1, 1);

    controlsRef.current.steer = value;
    setSteerDisplay(value);
  };

  const onSteerPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    controlsRef.current.steer = 0;
    setSteerDisplay(0);
  };

  const holdControl = (key: 'throttle' | 'brake', value: number) => {
    controlsRef.current[key] = value;
  };

  const playerCurrentTotal = rawMs + penaltyMs;
  const lastResult = results[results.length - 1];
  const lastBotResult = botResults[botResults.length - 1];

  return (
    <>
      <style>{`
        @keyframes parkGlow {
          0%,100% { opacity: .72; filter: brightness(1); }
          50% { opacity: 1; filter: brightness(1.35); }
        }

        @keyframes parkPenalty {
          0% { transform: translateY(0) scale(.85); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: translateY(-42px) scale(1.08); opacity: 0; }
        }

        @keyframes parkStripe {
          0% { background-position: 0 0; }
          100% { background-position: 90px 0; }
        }

        @keyframes parkPedalGlow {
          0%, 100% { box-shadow: inset 0 2px 0 rgba(255,255,255,.18), 0 10px 24px rgba(0,0,0,.35); }
          50% { box-shadow: inset 0 2px 0 rgba(255,255,255,.28), 0 10px 34px rgba(250,204,21,.22); }
        }
      `}</style>

      <div
        className="relative h-full w-full overflow-hidden bg-[#07120a] text-white touch-none select-none"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_7%,rgba(74,222,128,.22),transparent_24%),radial-gradient(circle_at_90%_24%,rgba(250,204,21,.16),transparent_24%),linear-gradient(180deg,#102417_0%,#08110c_100%)]" />

        <div className="relative z-10 flex h-full flex-col gap-1.5 px-2.5 py-1.5">
          <div className="shrink-0 overflow-hidden rounded-[24px] border border-white/12 bg-black/36 shadow-xl backdrop-blur-xl">
            <div
              className="h-1.5"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#facc15 0 20%,#fb923c 20% 40%,#22c55e 40% 60%,#38bdf8 60% 80%,#facc15 80% 100%)',
                backgroundSize: '90px 100%',
                animation: 'parkStripe 1.8s linear infinite',
              }}
            />

            <div className="px-3 py-2">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-2xl border border-yellow-300/14 bg-yellow-300/9 px-2.5 py-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-yellow-100/50">
                    total
                  </div>
                  <div className="text-base font-black text-yellow-100 leading-none">
                    {formatTime(results.reduce((sum, item) => sum + item.totalMs, playerCurrentTotal))}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                    {level.title}
                  </div>
                  <div className="bg-gradient-to-r from-yellow-200 to-orange-400 bg-clip-text text-base font-black leading-none text-transparent">
                    {level.subtitle}
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-300/14 bg-rose-300/9 px-2.5 py-1.5 text-right">
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-rose-100/50">
                    penalty
                  </div>
                  <div className="text-base font-black text-rose-100 leading-none">
                    {formatTime(penaltyMs)}
                  </div>
                </div>
              </div>

              <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                <div className="rounded-xl bg-white/8 py-1">
                  Time <span className="text-white/90">{formatTime(rawMs)}</span>
                </div>
                <div className="rounded-xl bg-white/8 py-1">
                  Hit <span className="text-white/90">{hits}</span>
                </div>
                <div className="rounded-xl bg-white/8 py-1">
                  Park <span className="text-white/90">{Math.round(parkProgress * 100)}%</span>
                </div>
                <div className="rounded-xl bg-white/8 py-1">
                  Lvl <span className="text-white/90">{levelIndex + 1}/3</span>
                </div>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-300 to-emerald-400 transition-[width]"
                  style={{ width: `${parkProgress * 100}%` }}
                />
              </div>

              <div className="mt-1 truncate text-center text-[10px] font-bold text-white/55">{status}</div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[30px] border border-white/12 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_20px_52px_rgba(0,0,0,.28)]">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="parkingGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                <filter id="playerCarGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#facc15" floodOpacity="0.45" />
                </filter>

                <pattern id="asphalt" width="32" height="32" patternUnits="userSpaceOnUse">
                  <rect width="32" height="32" fill="#202225" />
                  <circle cx="4" cy="8" r="1" fill="#34373b" opacity=".48" />
                  <circle cx="22" cy="12" r=".8" fill="#111" opacity=".35" />
                  <circle cx="13" cy="23" r="1.1" fill="#3a3d40" opacity=".42" />
                  <path d="M 0 31 L 32 31" stroke="#111" strokeOpacity=".12" />
                </pattern>
              </defs>

              <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#1f5f20" />
              <circle cx="36" cy="40" r="38" fill="#2d8a2f" />
              <circle cx="386" cy="54" r="42" fill="#2d8a2f" />
              <circle cx="32" cy="700" r="42" fill="#2d8a2f" />
              <circle cx="388" cy="698" r="40" fill="#2d8a2f" />
              <circle cx="24" cy="360" r="36" fill="#256f26" />
              <circle cx="396" cy="380" r="34" fill="#256f26" />

              <rect x={ROAD.x - 18} y={ROAD.y - 18} width={ROAD.w + 36} height={ROAD.h + 36} rx="30" fill="#c9c2b0" />
              <rect x={ROAD.x - 8} y={ROAD.y - 8} width={ROAD.w + 16} height={ROAD.h + 16} rx="24" fill="#757166" />
              <rect x={ROAD.x} y={ROAD.y} width={ROAD.w} height={ROAD.h} rx="20" fill="url(#asphalt)" />

              <path d="M 64 126 L 356 126" stroke="rgba(255,255,255,.34)" strokeWidth="3" />
              <path d="M 64 615 L 356 615" stroke="rgba(255,255,255,.22)" strokeWidth="3" />

              <path d={`M ${MAP_W / 2} 580 L ${MAP_W / 2} 486`} stroke="rgba(255,255,255,.72)" strokeWidth="5" strokeDasharray="24 22" strokeLinecap="round" />
              <path d={`M ${MAP_W / 2} 454 L ${MAP_W / 2 - 17} 490 L ${MAP_W / 2 + 17} 490 Z`} fill="rgba(255,255,255,.82)" />

              <rect x="80" y="48" width="260" height="48" rx="12" fill="#111827" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
              <text x="210" y="76" textAnchor="middle" className="fill-white text-[22px] font-black">
                {level.title}
              </text>
              <text x="210" y="94" textAnchor="middle" className="fill-yellow-400 text-[14px] font-black">
                {level.subtitle}
              </text>

              <ParkingZoneShape zone={level.zone} active={parkProgress > 0.2} />

              {level.obstacles.map((obstacle) => {
                if (obstacle.type === 'car') {
                  return (
                    <VehicleShape
                      key={obstacle.id}
                      x={obstacle.x}
                      y={obstacle.y}
                      w={obstacle.w}
                      h={obstacle.h}
                      angle={obstacle.angle ?? 0}
                      color={obstacle.color ?? '#38bdf8'}
                      opacity={0.98}
                    />
                  );
                }

                if (obstacle.type === 'planter') {
                  return <Planter key={obstacle.id} obstacle={obstacle} />;
                }

                if (obstacle.type === 'cone') {
                  return <Cone key={obstacle.id} obstacle={obstacle} />;
                }

                return <Barrier key={obstacle.id} obstacle={obstacle} />;
              })}

              <VehicleShape
                x={car.x}
                y={car.y}
                w={CAR_W}
                h={CAR_H}
                angle={car.angle}
                color="#ef2020"
                isPlayer
              />

              {floatingPenalties.map((penalty) => (
                <text
                  key={penalty.id}
                  x={penalty.x}
                  y={penalty.y}
                  textAnchor="middle"
                  className="fill-rose-300 text-[20px] font-black"
                  style={{ animation: 'parkPenalty .85s ease-out forwards' }}
                >
                  {penalty.text}
                </text>
              ))}
            </svg>

            {phase === 'levelComplete' && lastResult && lastBotResult && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                <div className="w-full max-w-[340px] rounded-[30px] border border-white/14 bg-slate-950/95 p-5 text-center shadow-2xl">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                    Level Complete
                  </div>
                  <div className="mt-2 text-3xl font-black text-white">{formatTime(lastResult.totalMs)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
                    <div className="rounded-2xl bg-white/8 p-3">
                      Ты
                      <div className="text-yellow-300">{formatTime(lastResult.totalMs)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/8 p-3">
                      Бот
                      <div className="text-cyan-300">{formatTime(lastBotResult.totalMs)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === 'finished' && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
                <div className="w-full max-w-[360px] overflow-hidden rounded-[34px] border border-white/14 bg-slate-950/95 text-center shadow-2xl">
                  <div className="h-3 bg-gradient-to-r from-yellow-300 via-orange-400 to-emerald-400" />

                  <div className="p-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/42">
                      {playerTotal <= botTotal ? 'victory' : 'defeat'}
                    </div>

                    <div className="mt-2 text-5xl font-black tracking-tight text-white">
                      {playerTotal <= botTotal ? 'PARK WIN' : 'PARK DOWN'}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-3xl border border-yellow-300/14 bg-yellow-300/10 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                          your total
                        </div>
                        <div className="mt-2 text-3xl font-black leading-none text-yellow-200">
                          {formatTime(playerTotal)}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-cyan-300/14 bg-cyan-300/10 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                          bot total
                        </div>
                        <div className="mt-2 text-3xl font-black leading-none text-cyan-200">
                          {formatTime(botTotal)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={restart}
                      className="mt-7 w-full rounded-3xl bg-gradient-to-r from-yellow-400 to-orange-500 py-4 text-sm font-black uppercase tracking-[0.18em] text-stone-950 shadow-xl transition active:scale-[0.98]"
                    >
                      Play Again
                    </button>

                    <button
                      onClick={() => navigate(-1)}
                      className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/80 transition active:scale-[0.98]"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 grid h-[104px] grid-cols-[122px_1fr] gap-2 pb-1">
            <div
              className="relative rounded-[28px] border border-white/12 bg-black/38 shadow-xl backdrop-blur-xl touch-none overflow-hidden"
              onPointerDown={onSteerPointerDown}
              onPointerMove={onSteerPointerMove}
              onPointerUp={onSteerPointerUp}
              onPointerCancel={onSteerPointerUp}
            >
              <div className="absolute left-1/2 top-1/2 h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#20232b_0%,#0b0d12_62%,#030406_100%)] shadow-[inset_0_5px_12px_rgba(255,255,255,.08),inset_0_-8px_14px_rgba(0,0,0,.8),0_8px_22px_rgba(0,0,0,.45)]" />

              <div
                className="absolute left-1/2 top-1/2 h-[78px] w-[78px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[7px] border-neutral-800 bg-transparent shadow-[inset_0_0_0_2px_rgba(255,255,255,.08),0_0_0_1px_rgba(255,255,255,.12)]"
                style={{
                  transform: `translate(-50%, -50%) rotate(${steerDisplay * 92}deg)`,
                }}
              >
                <div className="absolute left-1/2 top-1/2 h-[8px] w-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-700 shadow-[inset_0_1px_1px_rgba(255,255,255,.2)]" />
                <div className="absolute left-1/2 top-[10px] h-[44px] w-[7px] -translate-x-1/2 rounded-full bg-neutral-700 shadow-[inset_0_1px_1px_rgba(255,255,255,.2)]" />
                <div className="absolute left-1/2 top-1/2 h-[28px] w-[28px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-neutral-500 to-neutral-950 shadow-[inset_0_2px_2px_rgba(255,255,255,.22)]" />
                <div className="absolute left-1/2 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300" />
              </div>

              <div className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] font-black uppercase tracking-[0.2em] text-white/30">
                steer
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onPointerDown={() => holdControl('brake', 1)}
                onPointerUp={() => holdControl('brake', 0)}
                onPointerCancel={() => holdControl('brake', 0)}
                onPointerLeave={() => holdControl('brake', 0)}
                className="relative overflow-hidden rounded-[28px] border border-rose-200/20 bg-gradient-to-br from-neutral-900 to-black shadow-xl active:scale-95"
              >
                <div className="absolute inset-x-5 top-3 bottom-3 rounded-[18px] bg-gradient-to-b from-rose-500 to-red-800 shadow-[inset_0_3px_0_rgba(255,255,255,.25),inset_0_-6px_8px_rgba(0,0,0,.35)]" />
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="absolute left-8 right-8 h-[3px] rounded-full bg-white/28"
                    style={{ top: 25 + index * 11 }}
                  />
                ))}
                <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-black tracking-[0.2em] text-white">
                  BRAKE
                </div>
              </button>

              <button
                onPointerDown={() => holdControl('throttle', 1)}
                onPointerUp={() => holdControl('throttle', 0)}
                onPointerCancel={() => holdControl('throttle', 0)}
                onPointerLeave={() => holdControl('throttle', 0)}
                className="relative overflow-hidden rounded-[28px] border border-emerald-200/20 bg-gradient-to-br from-neutral-900 to-black shadow-xl active:scale-95"
                style={{ animation: 'parkPedalGlow 1.4s ease-in-out infinite' }}
              >
                <div className="absolute inset-x-5 top-3 bottom-3 rounded-[18px] bg-gradient-to-b from-emerald-400 to-green-800 shadow-[inset_0_3px_0_rgba(255,255,255,.25),inset_0_-6px_8px_rgba(0,0,0,.35)]" />
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="absolute left-8 right-8 h-[3px] rounded-full bg-white/28"
                    style={{ top: 25 + index * 11 }}
                  />
                ))}
                <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-black tracking-[0.2em] text-white">
                  GAS
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ParkDuelGame;