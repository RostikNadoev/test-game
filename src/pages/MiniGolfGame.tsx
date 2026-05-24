import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const WORLD_W = 720;
const WORLD_H = 1180;

const PLAY_LEFT = 24;
const PLAY_TOP = 24;
const PLAY_RIGHT = WORLD_W - 24;
const PLAY_BOTTOM = WORLD_H - 24;
const PLAY_W = PLAY_RIGHT - PLAY_LEFT;
const PLAY_H = PLAY_BOTTOM - PLAY_TOP;

const BALL_R = 12;
const HOLE_R = 18;
const MAX_POWER = 21.5;
const AIM_MAX = 178;
const TOTAL_HOLES = 2;
const MAX_DPR = 1.6;
const STOP_SPEED = 0.07;

type Vec = {
  x: number;
  y: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Circle = {
  x: number;
  y: number;
  r: number;
};

type PlayerIndex = 0 | 1;
type TurnPhase = 'aim' | 'moving' | 'transition';
type Theme = 'lagoon' | 'crystal';

type Deco =
  | { kind: 'lamp'; x: number; y: number }
  | { kind: 'bush'; x: number; y: number; s?: number }
  | { kind: 'crystal'; x: number; y: number; s?: number }
  | { kind: 'stone'; x: number; y: number; s?: number }
  | { kind: 'sign'; x: number; y: number; text: string };

type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  name: string;
  short: string;
  shots: number;
  totalShots: number;
  done: boolean;
  trail: Vec[];
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type HoleConfig = {
  name: string;
  subtitle: string;
  theme: Theme;
  spawn: Vec;
  hole: Vec;
  guide: Vec[];
  walls: Rect[];
  waters: Rect[];
  sands: Rect[];
  bridges?: Rect[];
  bumpers: Array<Circle & { color: string }>;
  deco: Deco[];
};

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const len = (x: number, y: number) => Math.hypot(x, y);

const pointInRect = (x: number, y: number, rect: Rect) =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

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

const holeConfigs: HoleConfig[] = [
  {
    name: 'Moonlit Lagoon',
    subtitle: 'широкий S-маршрут через ночные ворота',
    theme: 'lagoon',
    spawn: { x: 360, y: 1080 },
    hole: { x: 360, y: 98 },
    guide: [
      { x: 360, y: 1080 },
      { x: 560, y: 930 },
      { x: 180, y: 760 },
      { x: 540, y: 590 },
      { x: 220, y: 405 },
      { x: 360, y: 120 },
    ],
    walls: [
      { x: 76, y: 930, w: 396, h: 18 },
      { x: 548, y: 930, w: 96, h: 18 },

      { x: 76, y: 770, w: 118, h: 18 },
      { x: 282, y: 770, w: 362, h: 18 },

      { x: 76, y: 600, w: 392, h: 18 },
      { x: 548, y: 600, w: 96, h: 18 },

      { x: 76, y: 430, w: 118, h: 18 },
      { x: 282, y: 430, w: 362, h: 18 },

      { x: 248, y: 248, w: 224, h: 18 },

      { x: 110, y: 846, w: 18, h: 82 },
      { x: 592, y: 846, w: 18, h: 82 },

      { x: 110, y: 514, w: 18, h: 82 },
      { x: 592, y: 514, w: 18, h: 82 },

      { x: 246, y: 176, w: 18, h: 74 },
      { x: 456, y: 176, w: 18, h: 74 },
    ],
    waters: [
      { x: 84, y: 820, w: 142, h: 78 },
      { x: 494, y: 820, w: 142, h: 78 },

      { x: 270, y: 662, w: 180, h: 78 },

      { x: 84, y: 486, w: 142, h: 78 },
      { x: 494, y: 486, w: 142, h: 78 },

      { x: 284, y: 292, w: 152, h: 74 },
    ],
    sands: [
      { x: 306, y: 868, w: 108, h: 58 },
      { x: 118, y: 664, w: 124, h: 60 },
      { x: 478, y: 664, w: 124, h: 60 },
      { x: 306, y: 496, w: 108, h: 58 },
      { x: 146, y: 292, w: 108, h: 58 },
      { x: 466, y: 292, w: 108, h: 58 },
    ],
    bumpers: [
      { x: 360, y: 864, r: 18, color: '#fde047' },
      { x: 204, y: 696, r: 17, color: '#facc15' },
      { x: 516, y: 696, r: 17, color: '#facc15' },
      { x: 360, y: 526, r: 19, color: '#f59e0b' },
      { x: 260, y: 338, r: 16, color: '#fde047' },
      { x: 460, y: 338, r: 16, color: '#fde047' },
    ],
    deco: [
      { kind: 'sign', x: 360, y: 1030, text: 'START' },
      { kind: 'lamp', x: 104, y: 116 },
      { kind: 'lamp', x: 616, y: 116 },
      { kind: 'bush', x: 92, y: 954, s: 0.95 },
      { kind: 'bush', x: 628, y: 954, s: 0.95 },
      { kind: 'bush', x: 96, y: 394, s: 0.85 },
      { kind: 'bush', x: 624, y: 394, s: 0.85 },
      { kind: 'stone', x: 276, y: 1010, s: 0.78 },
      { kind: 'stone', x: 444, y: 1010, s: 0.78 },
    ],
  },
  {
    name: 'Crystal Switchback',
    subtitle: 'две ледяные террасы, мосты и честные рикошеты',
    theme: 'crystal',
    spawn: { x: 112, y: 1080 },
    hole: { x: 608, y: 104 },
    guide: [
      { x: 112, y: 1080 },
      { x: 590, y: 930 },
      { x: 185, y: 775 },
      { x: 570, y: 610 },
      { x: 160, y: 425 },
      { x: 608, y: 120 },
    ],
    walls: [
      { x: 210, y: 948, w: 434, h: 18 },
      { x: 76, y: 788, w: 426, h: 18 },
      { x: 270, y: 628, w: 374, h: 18 },
      { x: 76, y: 468, w: 428, h: 18 },
      { x: 258, y: 304, w: 386, h: 18 },

      { x: 86, y: 918, w: 18, h: 110 },
      { x: 616, y: 820, w: 18, h: 116 },
      { x: 86, y: 602, w: 18, h: 116 },
      { x: 616, y: 500, w: 18, h: 116 },
      { x: 486, y: 190, w: 18, h: 98 },
      { x: 574, y: 190, w: 18, h: 98 },
    ],
    waters: [
      { x: 94, y: 912, w: 132, h: 82 },
      { x: 502, y: 842, w: 132, h: 84 },
      { x: 268, y: 700, w: 142, h: 78 },
      { x: 496, y: 542, w: 132, h: 78 },
      { x: 98, y: 354, w: 142, h: 78 },
      { x: 328, y: 196, w: 116, h: 74 },
    ],
    sands: [
      { x: 320, y: 874, w: 132, h: 60 },
      { x: 122, y: 710, w: 112, h: 58 },
      { x: 472, y: 704, w: 112, h: 58 },
      { x: 280, y: 536, w: 128, h: 58 },
      { x: 522, y: 366, w: 96, h: 56 },
      { x: 206, y: 230, w: 108, h: 56 },
    ],
    bridges: [
      { x: 126, y: 908, w: 46, h: 94 },
      { x: 546, y: 836, w: 46, h: 94 },
      { x: 312, y: 692, w: 46, h: 94 },
    ],
    bumpers: [
      { x: 558, y: 886, r: 18, color: '#38bdf8' },
      { x: 178, y: 742, r: 18, color: '#93c5fd' },
      { x: 558, y: 582, r: 18, color: '#60a5fa' },
      { x: 176, y: 394, r: 18, color: '#38bdf8' },
      { x: 438, y: 238, r: 17, color: '#bfdbfe' },
    ],
    deco: [
      { kind: 'sign', x: 112, y: 1030, text: 'TEE' },
      { kind: 'crystal', x: 104, y: 142, s: 1.05 },
      { kind: 'crystal', x: 628, y: 302, s: 0.9 },
      { kind: 'crystal', x: 96, y: 552, s: 0.88 },
      { kind: 'crystal', x: 626, y: 754, s: 1 },
      { kind: 'stone', x: 348, y: 398, s: 0.82 },
      { kind: 'lamp', x: 608, y: 118 },
    ],
  },
];

function createBall(name: string, short: string, color: string, spawn: Vec): BallState {
  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    color,
    name,
    short,
    shots: 0,
    totalShots: 0,
    done: false,
    trail: [],
  };
}

function MiniGolfBeautiful() {
  const navigate = useNavigate();

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const holeTimeoutRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const layoutRef = useRef({
    width: 0,
    height: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  });

  const pointerRef = useRef({
    active: false,
    x: 0,
    y: 0,
  });

  const holeIndexRef = useRef(0);
  const activePlayerRef = useRef<PlayerIndex>(0);
  const turnPhaseRef = useRef<TurnPhase>('aim');
  const winnerRef = useRef<string | null>(null);

  const ballsRef = useRef<BallState[]>([
    createBall('Player 1', 'P1', '#facc15', holeConfigs[0].spawn),
    createBall('Player 2', 'P2', '#f8fafc', holeConfigs[0].spawn),
  ]);

  const sparksRef = useRef<Spark[]>([]);

  const [holeIndex, setHoleIndex] = useState(0);
  const [activePlayer, setActivePlayer] = useState<PlayerIndex>(0);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('aim');
  const [winner, setWinner] = useState<string | null>(null);
  const [, setUiTick] = useState(0);

  const currentHole = () => holeConfigs[holeIndexRef.current];

  const setPhaseState = (next: TurnPhase) => {
    turnPhaseRef.current = next;
    setTurnPhase(next);
  };

  const setActiveState = (next: PlayerIndex) => {
    activePlayerRef.current = next;
    setActivePlayer(next);
  };

  const setHoleState = (next: number) => {
    holeIndexRef.current = next;
    setHoleIndex(next);
  };

  const setWinnerState = (next: string | null) => {
    winnerRef.current = next;
    setWinner(next);
  };

  const bumpUi = () => setUiTick((prev) => prev + 1);

  const bothPlayersDone = () => ballsRef.current.every((ball) => ball.done);

  const resetHoleBalls = (nextHoleIndex: number) => {
    const spawn = holeConfigs[nextHoleIndex].spawn;
    const old = ballsRef.current;

    ballsRef.current = [
      {
        ...createBall(old[0].name, old[0].short, old[0].color, spawn),
        totalShots: old[0].totalShots,
      },
      {
        ...createBall(old[1].name, old[1].short, old[1].color, spawn),
        totalShots: old[1].totalShots,
      },
    ];

    pointerRef.current.active = false;
    sparksRef.current = [];
    setActiveState(0);
    setPhaseState('aim');
    bumpUi();
  };

  const restart = () => {
    if (holeTimeoutRef.current) {
      window.clearTimeout(holeTimeoutRef.current);
      holeTimeoutRef.current = null;
    }

    const spawn = holeConfigs[0].spawn;

    ballsRef.current = [
      createBall('Player 1', 'P1', '#facc15', spawn),
      createBall('Player 2', 'P2', '#f8fafc', spawn),
    ];

    sparksRef.current = [];
    pointerRef.current.active = false;

    setWinnerState(null);
    setHoleState(0);
    setActiveState(0);
    setPhaseState('aim');
    bumpUi();
  };

  const addSparks = (x: number, y: number, color: string, amount = 8) => {
    for (let i = 0; i < amount; i += 1) {
      const a = (Math.PI * 2 * i) / amount + Math.random() * 0.45;
      const s = 0.7 + Math.random() * 2.6;

      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55 + Math.random() * 0.28,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  };

  const toWorldPoint = (clientX: number, clientY: number): Vec => {
    const canvas = canvasRef.current;

    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = layoutRef.current;

    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  };

  const isBallStopped = (ball: BallState) =>
    Math.abs(ball.vx) < STOP_SPEED && Math.abs(ball.vy) < STOP_SPEED;

  const activeBall = () => ballsRef.current[activePlayerRef.current];

  const canAim = () => {
    const ball = activeBall();

    return !winnerRef.current && turnPhaseRef.current === 'aim' && !ball.done && isBallStopped(ball);
  };

  const strike = () => {
    if (!canAim()) return;

    const ball = activeBall();
    const dx = ball.x - pointerRef.current.x;
    const dy = ball.y - pointerRef.current.y;
    const dragDistance = Math.min(len(dx, dy), AIM_MAX);

    if (dragDistance < 8) {
      pointerRef.current.active = false;
      return;
    }

    const nx = dx / Math.max(dragDistance, 1);
    const ny = dy / Math.max(dragDistance, 1);
    const strength = dragDistance / AIM_MAX;
    const power = Math.pow(strength, 1.68) * MAX_POWER;

    ball.vx = nx * power;
    ball.vy = ny * power;
    ball.shots += 1;
    ball.totalShots += 1;
    ball.trail = [];

    pointerRef.current.active = false;
    setPhaseState('moving');
    bumpUi();
  };

  const nextTurnOrHole = () => {
    const balls = ballsRef.current;

    if (bothPlayersDone()) {
      setPhaseState('transition');

      holeTimeoutRef.current = window.setTimeout(() => {
        const nextHole = holeIndexRef.current + 1;

        if (nextHole >= TOTAL_HOLES) {
          const a = ballsRef.current[0];
          const b = ballsRef.current[1];

          if (a.totalShots < b.totalShots) {
            setWinnerState(a.name);
          } else if (b.totalShots < a.totalShots) {
            setWinnerState(b.name);
          } else {
            setWinnerState('Draw');
          }

          setPhaseState('aim');
          return;
        }

        setHoleState(nextHole);
        resetHoleBalls(nextHole);
      }, 700);

      return;
    }

    const current = activePlayerRef.current;
    const other = (current === 0 ? 1 : 0) as PlayerIndex;

    if (!balls[other].done) {
      setActiveState(other);
    } else {
      setActiveState(current);
    }

    setPhaseState('aim');
    bumpUi();
  };

  const resetBallToSpawn = (ball: BallState) => {
    const spawn = currentHole().spawn;

    addSparks(ball.x, ball.y, '#7dd3fc', 14);

    ball.x = spawn.x;
    ball.y = spawn.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
  };

  const resolveRectCollision = (ball: BallState, rect: Rect, bounce = 0.88) => {
    const nearestX = clamp(ball.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(ball.y, rect.y, rect.y + rect.h);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    const distSq = dx * dx + dy * dy;

    if (distSq > BALL_R * BALL_R) return false;

    const inside =
      ball.x > rect.x &&
      ball.x < rect.x + rect.w &&
      ball.y > rect.y &&
      ball.y < rect.y + rect.h;

    if (!inside && distSq > 0.0001) {
      const d = Math.sqrt(distSq);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = BALL_R - d;

      ball.x += nx * overlap;
      ball.y += ny * overlap;

      const dot = ball.vx * nx + ball.vy * ny;

      if (dot < 0) {
        ball.vx = (ball.vx - 2 * dot * nx) * bounce;
        ball.vy = (ball.vy - 2 * dot * ny) * bounce;
      }

      return true;
    }

    const leftOverlap = Math.abs(ball.x + BALL_R - rect.x);
    const rightOverlap = Math.abs(rect.x + rect.w - (ball.x - BALL_R));
    const topOverlap = Math.abs(ball.y + BALL_R - rect.y);
    const bottomOverlap = Math.abs(rect.y + rect.h - (ball.y - BALL_R));
    const minOverlap = Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap);

    if (minOverlap === leftOverlap) {
      ball.x = rect.x - BALL_R;
      ball.vx = -Math.abs(ball.vx) * bounce;
    } else if (minOverlap === rightOverlap) {
      ball.x = rect.x + rect.w + BALL_R;
      ball.vx = Math.abs(ball.vx) * bounce;
    } else if (minOverlap === topOverlap) {
      ball.y = rect.y - BALL_R;
      ball.vy = -Math.abs(ball.vy) * bounce;
    } else {
      ball.y = rect.y + rect.h + BALL_R;
      ball.vy = Math.abs(ball.vy) * bounce;
    }

    return true;
  };

  const resolveBumperCollision = (ball: BallState, bumper: Circle & { color: string }) => {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const d = len(dx, dy);
    const minD = BALL_R + bumper.r;

    if (d <= 0 || d >= minD) return;

    const nx = dx / d;
    const ny = dy / d;

    ball.x = bumper.x + nx * minD;
    ball.y = bumper.y + ny * minD;

    const dot = ball.vx * nx + ball.vy * ny;

    ball.vx = (ball.vx - 2 * dot * nx) * 1.04;
    ball.vy = (ball.vy - 2 * dot * ny) * 1.04;

    const speed = len(ball.vx, ball.vy);

    if (speed < 5.5) {
      ball.vx += nx * 2.4;
      ball.vy += ny * 2.4;
    }

    addSparks(ball.x, ball.y, bumper.color, 8);
  };

  const isOnBridge = (x: number, y: number, bridges: Rect[] = []) => {
    for (let i = 0; i < bridges.length; i += 1) {
      if (pointInRect(x, y, bridges[i])) return true;
    }

    return false;
  };

  const updateBall = (ball: BallState, dt60: number) => {
    const config = currentHole();

    if (ball.done) return;

    const inSand = config.sands.some((sand) => pointInRect(ball.x, ball.y, sand));
    const friction = inSand ? 0.942 : config.theme === 'crystal' ? 0.986 : 0.981;

    ball.x += ball.vx * dt60;
    ball.y += ball.vy * dt60;

    ball.vx *= Math.pow(friction, dt60);
    ball.vy *= Math.pow(friction, dt60);

    if (Math.abs(ball.vx) < STOP_SPEED) ball.vx = 0;
    if (Math.abs(ball.vy) < STOP_SPEED) ball.vy = 0;

    if (ball.x < PLAY_LEFT + BALL_R) {
      ball.x = PLAY_LEFT + BALL_R;
      ball.vx = Math.abs(ball.vx) * 0.88;
      addSparks(ball.x, ball.y, '#e2e8f0', 4);
    }

    if (ball.x > PLAY_RIGHT - BALL_R) {
      ball.x = PLAY_RIGHT - BALL_R;
      ball.vx = -Math.abs(ball.vx) * 0.88;
      addSparks(ball.x, ball.y, '#e2e8f0', 4);
    }

    if (ball.y < PLAY_TOP + BALL_R) {
      ball.y = PLAY_TOP + BALL_R;
      ball.vy = Math.abs(ball.vy) * 0.88;
      addSparks(ball.x, ball.y, '#e2e8f0', 4);
    }

    if (ball.y > PLAY_BOTTOM - BALL_R) {
      ball.y = PLAY_BOTTOM - BALL_R;
      ball.vy = -Math.abs(ball.vy) * 0.88;
      addSparks(ball.x, ball.y, '#e2e8f0', 4);
    }

    for (let i = 0; i < config.walls.length; i += 1) {
      const hit = resolveRectCollision(ball, config.walls[i]);

      if (hit) addSparks(ball.x, ball.y, '#f8fafc', 4);
    }

    for (let i = 0; i < config.bumpers.length; i += 1) {
      resolveBumperCollision(ball, config.bumpers[i]);
    }

    for (let i = 0; i < config.waters.length; i += 1) {
      const water = config.waters[i];

      if (!isOnBridge(ball.x, ball.y, config.bridges) && pointInRect(ball.x, ball.y, water)) {
        resetBallToSpawn(ball);
        return;
      }
    }

    const holeDx = config.hole.x - ball.x;
    const holeDy = config.hole.y - ball.y;
    const holeDistance = len(holeDx, holeDy);
    const speed = len(ball.vx, ball.vy);

    if (holeDistance < HOLE_R + 18 && speed < 6.4) {
      const pull = clamp((HOLE_R + 18 - holeDistance) / (HOLE_R + 18), 0, 1);

      ball.vx += (holeDx / Math.max(holeDistance, 1)) * pull * 0.2 * dt60;
      ball.vy += (holeDy / Math.max(holeDistance, 1)) * pull * 0.2 * dt60;
    }

    if (holeDistance < HOLE_R && speed < 3.7) {
      ball.done = true;
      ball.vx = 0;
      ball.vy = 0;
      ball.x = config.hole.x;
      ball.y = config.hole.y;
      ball.trail = [];
      addSparks(config.hole.x, config.hole.y, '#22c55e', 18);
    }

    ball.trail.push({ x: ball.x, y: ball.y });

    if (ball.trail.length > 14) ball.trail.shift();
  };

  const drawThemeBackground = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);

    if (config.theme === 'lagoon') {
      bg.addColorStop(0, '#071b12');
      bg.addColorStop(0.48, '#0a2418');
      bg.addColorStop(1, '#030a07');
    } else {
      bg.addColorStop(0, '#07162a');
      bg.addColorStop(0.48, '#06101f');
      bg.addColorStop(1, '#020711');
    }

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const glowA = ctx.createRadialGradient(
      WORLD_W * 0.16,
      WORLD_H * 0.18,
      20,
      WORLD_W * 0.16,
      WORLD_H * 0.18,
      360,
    );

    glowA.addColorStop(0, config.theme === 'lagoon' ? 'rgba(74,222,128,0.24)' : 'rgba(56,189,248,0.26)');
    glowA.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const glowB = ctx.createRadialGradient(
      WORLD_W * 0.86,
      WORLD_H * 0.18,
      20,
      WORLD_W * 0.86,
      WORLD_H * 0.18,
      390,
    );

    glowB.addColorStop(0, config.theme === 'lagoon' ? 'rgba(250,204,21,0.14)' : 'rgba(168,85,247,0.22)');
    glowB.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const vignette = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 180, WORLD_W / 2, WORLD_H / 2, 760);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  };

  const drawCourseBase = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    ctx.save();

    roundRect(ctx, PLAY_LEFT - 10, PLAY_TOP - 10, PLAY_W + 20, PLAY_H + 20, 38);
    ctx.fillStyle = config.theme === 'lagoon' ? '#17371f' : '#344763';
    ctx.fill();

    ctx.shadowColor = 'rgba(0,0,0,0.34)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 12;

    roundRect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_W, PLAY_H, 30);

    const field = ctx.createLinearGradient(PLAY_LEFT, PLAY_TOP, PLAY_LEFT, PLAY_BOTTOM);

    if (config.theme === 'lagoon') {
      field.addColorStop(0, '#78d85d');
      field.addColorStop(0.5, '#42a933');
      field.addColorStop(1, '#2f7929');
    } else {
      field.addColorStop(0, '#e0f2fe');
      field.addColorStop(0.5, '#a9cde8');
      field.addColorStop(1, '#769cbd');
    }

    ctx.fillStyle = field;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    ctx.save();
    roundRect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_W, PLAY_H, 30);
    ctx.clip();

    for (let y = PLAY_TOP; y < PLAY_BOTTOM; y += 34) {
      for (let x = PLAY_LEFT; x < PLAY_RIGHT; x += 34) {
        const even = Math.floor((x + y) / 34) % 2 === 0;

        ctx.fillStyle = even ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';
        ctx.fillRect(x, y, 34, 34);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_W, 30);

    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, PLAY_LEFT + 4, PLAY_TOP + 4, PLAY_W - 8, PLAY_H - 8, 26);
    ctx.stroke();

    ctx.restore();
  };

  const drawGuidePath = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    if (config.guide.length < 2) return;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(config.guide[0].x, config.guide[0].y);

    for (let i = 1; i < config.guide.length - 1; i += 1) {
      const current = config.guide[i];
      const next = config.guide[i + 1];

      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }

    const last = config.guide[config.guide.length - 1];
    ctx.lineTo(last.x, last.y);

    ctx.lineWidth = 58;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = config.theme === 'lagoon' ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.105)';
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.setLineDash([16, 18]);
    ctx.strokeStyle = config.theme === 'lagoon' ? 'rgba(187,247,208,0.32)' : 'rgba(191,219,254,0.34)';
    ctx.stroke();

    ctx.restore();
  };

  const drawSand = (ctx: CanvasRenderingContext2D, rect: Rect, config: HoleConfig) => {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 24);

    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);

    if (config.theme === 'crystal') {
      g.addColorStop(0, '#eef6ff');
      g.addColorStop(1, '#adc5df');
    } else {
      g.addColorStop(0, '#f6df96');
      g.addColorStop(1, '#d6a14b');
    }

    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 24);
    ctx.clip();

    ctx.fillStyle = 'rgba(0,0,0,0.08)';

    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.ellipse(rect.x + 18 + i * 19, rect.y + rect.h * 0.56 + Math.sin(i) * 7, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const drawWater = (ctx: CanvasRenderingContext2D, rect: Rect, config: HoleConfig) => {
    roundRect(ctx, rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 24);
    ctx.fillStyle = config.theme === 'crystal' ? '#7892ae' : '#2f6b3b';
    ctx.fill();

    const x = rect.x + 8;
    const y = rect.y + 8;
    const w = rect.w - 16;
    const h = rect.h - 16;

    roundRect(ctx, x, y, w, h, 18);

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#dff9ff');
    g.addColorStop(0.4, '#38d5ff');
    g.addColorStop(1, config.theme === 'crystal' ? '#2563eb' : '#0284c7');

    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    roundRect(ctx, x, y, w, h, 18);
    ctx.clip();

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 10, y + 12, w - 20, 5);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';

    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(x + 26 + i * ((w - 52) / 3), y + h * 0.62 + (i % 2 ? 6 : -4), 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawBridge = (ctx: CanvasRenderingContext2D, bridge: Rect) => {
    roundRect(ctx, bridge.x, bridge.y, bridge.w, bridge.h, 10);

    const g = ctx.createLinearGradient(bridge.x, bridge.y, bridge.x, bridge.y + bridge.h);
    g.addColorStop(0, '#d69a5e');
    g.addColorStop(1, '#815333');

    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.24)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.14)';

    for (let yy = bridge.y + 8; yy < bridge.y + bridge.h - 6; yy += 14) {
      ctx.fillRect(bridge.x + 4, yy, bridge.w - 8, 2);
    }
  };

  const drawWalls = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    for (let i = 0; i < config.walls.length; i += 1) {
      const rect = config.walls[i];

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.24)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;

      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 9);

      const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);

      if (config.theme === 'crystal') {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#94a3b8');
      } else {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#cbd5e1');
      }

      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(rect.x + 2, rect.y + 2, Math.max(2, rect.w - 4), Math.min(4, rect.h - 4));
    }
  };

  const drawBumpers = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    for (let i = 0; i < config.bumpers.length; i += 1) {
      const b = config.bumpers[i];

      const shadow = ctx.createRadialGradient(b.x, b.y + 4, 4, b.x, b.y + 4, b.r + 9);
      shadow.addColorStop(0, 'rgba(0,0,0,0.18)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(b.x, b.y + 7, b.r + 9, 0, Math.PI * 2);
      ctx.fill();

      const g = ctx.createRadialGradient(b.x - 5, b.y - 7, 2, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.42, b.color);
      g.addColorStop(1, config.theme === 'crystal' ? '#1d4ed8' : '#92400e');

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawDeco = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    for (let i = 0; i < config.deco.length; i += 1) {
      const d = config.deco[i];
      const s = 's' in d && d.s ? d.s : 1;

      if (d.kind === 'bush') {
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 17 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(d.x - 5 * s, d.y - 6 * s, 9 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.arc(d.x + 7 * s, d.y + 5 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'stone') {
        ctx.fillStyle = config.theme === 'crystal' ? '#dbeafe' : '#a1a1aa';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 18 * s, 12 * s, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        ctx.beginPath();
        ctx.ellipse(d.x - 5 * s, d.y - 4 * s, 6 * s, 3 * s, -0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'lamp') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y + 26, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.fillRect(d.x - 3, d.y, 6, 28);

        const glow = ctx.createRadialGradient(d.x, d.y - 4, 2, d.x, d.y - 4, 28);
        glow.addColorStop(0, 'rgba(254,240,138,0.85)');
        glow.addColorStop(1, 'rgba(254,240,138,0)');

        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(d.x, d.y - 4, 28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(d.x, d.y - 4, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'crystal') {
        const g = ctx.createLinearGradient(d.x, d.y - 22 * s, d.x, d.y + 22 * s);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, '#93c5fd');
        g.addColorStop(1, '#2563eb');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - 22 * s);
        ctx.lineTo(d.x + 14 * s, d.y);
        ctx.lineTo(d.x, d.y + 22 * s);
        ctx.lineTo(d.x - 14 * s, d.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (d.kind === 'sign') {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y + 17, 34, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#78350f';
        ctx.fillRect(d.x - 3, d.y - 3, 6, 27);

        roundRect(ctx, d.x - 38, d.y - 25, 76, 26, 8);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = '900 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.text, d.x, d.y - 8);
      }
    }
  };

  const drawHole = (ctx: CanvasRenderingContext2D, config: HoleConfig) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(config.hole.x + 2, config.hole.y + 5, HOLE_R + 4, 0, Math.PI * 2);
    ctx.fill();

    const holeGrad = ctx.createRadialGradient(
      config.hole.x - 4,
      config.hole.y - 5,
      2,
      config.hole.x,
      config.hole.y,
      HOLE_R + 2,
    );

    holeGrad.addColorStop(0, '#334155');
    holeGrad.addColorStop(1, '#020617');

    ctx.fillStyle = holeGrad;
    ctx.beginPath();
    ctx.arc(config.hole.x, config.hole.y, HOLE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(config.hole.x, config.hole.y - 2);
    ctx.lineTo(config.hole.x, config.hole.y - 64);
    ctx.stroke();

    ctx.fillStyle = config.theme === 'crystal' ? '#38bdf8' : '#ef4444';
    ctx.beginPath();
    ctx.moveTo(config.hole.x, config.hole.y - 64);
    ctx.lineTo(config.hole.x + 42, config.hole.y - 51);
    ctx.lineTo(config.hole.x, config.hole.y - 38);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const drawBall = (ctx: CanvasRenderingContext2D, ball: BallState, isActive: boolean) => {
    for (let i = 0; i < ball.trail.length; i += 1) {
      const p = ball.trail[i];
      const a = i / Math.max(ball.trail.length - 1, 1);

      ctx.fillStyle = `rgba(255,255,255,${0.04 + a * 0.1})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_R * (0.35 + a * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 14, BALL_R + 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isActive && turnPhaseRef.current === 'aim' && !ball.done) {
      ctx.strokeStyle = 'rgba(250,204,21,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const g = ctx.createRadialGradient(ball.x - 5, ball.y - 6, 2, ball.x, ball.y, BALL_R + 1);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.38, ball.color);
    g.addColorStop(1, ball.color === '#f8fafc' ? '#94a3b8' : '#b45309');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(ball.x - 4, ball.y - 5, 3.4, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawAim = (ctx: CanvasRenderingContext2D) => {
    if (!pointerRef.current.active || !canAim()) return;

    const ball = activeBall();
    const dx = ball.x - pointerRef.current.x;
    const dy = ball.y - pointerRef.current.y;
    const dragDistance = Math.min(len(dx, dy), AIM_MAX);

    if (dragDistance < 8) return;

    const nx = dx / Math.max(dragDistance, 1);
    const ny = dy / Math.max(dragDistance, 1);
    const strength = dragDistance / AIM_MAX;
    const endX = ball.x + nx * (64 + strength * 132);
    const endY = ball.y + ny * (64 + strength * 132);

    ctx.save();

    ctx.strokeStyle =
      strength > 0.78
        ? 'rgba(248,113,113,0.96)'
        : strength > 0.48
          ? 'rgba(250,204,21,0.96)'
          : 'rgba(125,211,252,0.96)';

    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(ny, nx);

    ctx.translate(endX, endY);
    ctx.rotate(angle);

    ctx.fillStyle = strength > 0.78 ? '#f87171' : strength > 0.48 ? '#facc15' : '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -9);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    const barW = 170;
    const barH = 11;
    const barX = ball.x - barW / 2;
    const barY = ball.y + 34;

    roundRect(ctx, barX, barY, barW, barH, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    roundRect(ctx, barX, barY, barW * strength, barH, 8);
    ctx.fillStyle = strength > 0.78 ? '#f87171' : strength > 0.48 ? '#facc15' : '#7dd3fc';
    ctx.fill();
  };

  const drawParticles = (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < sparksRef.current.length; i += 1) {
      const s = sparksRef.current[i];

      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  const drawHudMarkers = (ctx: CanvasRenderingContext2D) => {
    const ball = activeBall();

    if (turnPhaseRef.current !== 'aim' || ball.done) return;

    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, ball.x - 57, ball.y - 50, 114, 26, 13);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '900 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${ball.short} • shot ${ball.shots + 1}`, ball.x, ball.y - 33);

    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { width, height, scale, offsetX, offsetY } = layoutRef.current;
    const config = currentHole();

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    drawThemeBackground(ctx, config);
    drawCourseBase(ctx, config);
    drawGuidePath(ctx, config);

    for (let i = 0; i < config.sands.length; i += 1) drawSand(ctx, config.sands[i], config);
    for (let i = 0; i < config.waters.length; i += 1) drawWater(ctx, config.waters[i], config);

    const bridges = config.bridges ?? [];

    for (let i = 0; i < bridges.length; i += 1) drawBridge(ctx, bridges[i]);

    drawWalls(ctx, config);
    drawBumpers(ctx, config);
    drawDeco(ctx, config);
    drawHole(ctx, config);
    drawParticles(ctx);

    const balls = ballsRef.current;

    drawBall(ctx, balls[0], activePlayerRef.current === 0);
    drawBall(ctx, balls[1], activePlayerRef.current === 1);

    drawAim(ctx);
    drawHudMarkers(ctx);

    ctx.restore();
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
      if (event.cancelable) event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    return () => {
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
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;

    if (!canvas || !wrap) return undefined;

    const ctx = canvas.getContext('2d');

    if (!ctx) return undefined;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      const scale = Math.min(width / WORLD_W, height / WORLD_H);
      const offsetX = (width - WORLD_W * scale) / 2;
      const offsetY = Math.max(0, (height - WORLD_H * scale) / 2);

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

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    lastFrameRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min(2, (now - lastFrameRef.current) / 16.666);
      lastFrameRef.current = now;

      if (turnPhaseRef.current === 'moving') {
        const ball = activeBall();

        updateBall(ball, dt);

        if (ball.done || isBallStopped(ball)) {
          ball.vx = 0;
          ball.vy = 0;

          nextTurnOrHole();
        }

        bumpUi();
      }

      const nextSparks: Spark[] = [];

      for (let i = 0; i < sparksRef.current.length; i += 1) {
        const s = sparksRef.current[i];

        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.pow(0.975, dt);
        s.vy *= Math.pow(0.975, dt);
        s.life -= 0.028 * dt;

        if (s.life > 0) nextSparks.push(s);
      }

      sparksRef.current = nextSparks;

      draw(ctx);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      ro.disconnect();

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (holeTimeoutRef.current !== null) window.clearTimeout(holeTimeoutRef.current);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canAim()) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    const point = toWorldPoint(event.clientX, event.clientY);
    const ball = activeBall();

    pointerRef.current = {
      active: true,
      x: point.x,
      y: point.y,
    };

    if (len(point.x - ball.x, point.y - ball.y) > 240) {
      pointerRef.current.x = ball.x;
      pointerRef.current.y = ball.y + 90;
    }

    bumpUi();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointerRef.current.active || !canAim()) return;

    const point = toWorldPoint(event.clientX, event.clientY);

    pointerRef.current.x = point.x;
    pointerRef.current.y = point.y;

    bumpUi();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    strike();
  };

  const p1 = ballsRef.current[0];
  const p2 = ballsRef.current[1];
  const config = holeConfigs[holeIndex];

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#050610] text-white touch-none select-none"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(34,197,94,.16),transparent_26%),radial-gradient(circle_at_86%_16%,rgba(56,189,248,.14),transparent_26%),linear-gradient(180deg,#07111f_0%,#050610_100%)]" />

      <div className="relative z-10 shrink-0 px-1.5 pt-1">
        <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/30 shadow-[0_10px_28px_rgba(0,0,0,.24)] backdrop-blur-xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 px-2 py-1.5">
            <div
              className={`rounded-2xl border px-2 py-1 ${
                activePlayer === 0
                  ? 'border-yellow-300/30 bg-yellow-300/14'
                  : 'border-white/8 bg-white/6'
              }`}
            >
              <div className="text-[7px] font-black uppercase tracking-[0.18em] text-white/36">
                P1
              </div>
              <div className="mt-0.5 text-[15px] font-black leading-none text-yellow-200">
                {p1.totalShots}
              </div>
            </div>

            <div className="min-w-[122px] text-center">
              <div className="text-[7px] font-black uppercase tracking-[0.22em] text-white/35">
                Map {holeIndex + 1}/{TOTAL_HOLES}
              </div>

              <div className="mt-0.5 truncate bg-gradient-to-r from-lime-200 via-white to-sky-200 bg-clip-text text-[15px] font-black leading-none text-transparent">
                {config.name}
              </div>

              <div className="mt-0.5 truncate text-[8px] font-bold text-white/38">
                {turnPhase === 'aim'
                  ? activePlayer === 0
                    ? 'ход P1'
                    : 'ход P2'
                  : turnPhase === 'moving'
                    ? 'шар катится'
                    : 'следующая карта'}
              </div>
            </div>

            <div
              className={`rounded-2xl border px-2 py-1 text-right ${
                activePlayer === 1
                  ? 'border-sky-200/30 bg-sky-200/14'
                  : 'border-white/8 bg-white/6'
              }`}
            >
              <div className="text-[7px] font-black uppercase tracking-[0.18em] text-white/36">
                P2
              </div>
              <div className="mt-0.5 text-[15px] font-black leading-none text-sky-100">
                {p2.totalShots}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-1.5 px-2 pb-1.5">
            <div className="truncate rounded-xl bg-white/6 px-2.5 py-1 text-[9px] font-bold text-white/48">
              {winner
                ? 'Матч завершён'
                : turnPhase === 'aim'
                  ? 'Тяни от шара назад и отпускай'
                  : turnPhase === 'moving'
                    ? 'Шар катится...'
                    : 'Переход...'}
            </div>

            <button
              onClick={restart}
              className="pointer-events-auto rounded-xl border border-white/10 bg-white/8 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/72 active:scale-95"
            >
              reset
            </button>
          </div>
        </div>
      </div>

      <div ref={canvasWrapRef} className="relative z-10 min-h-0 flex-1 overflow-hidden px-0.5 pb-0 pt-0.5">
        <div className="relative h-full overflow-hidden rounded-[24px] border border-white/10 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_18px_60px_rgba(0,0,0,.3)]">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }

              pointerRef.current.active = false;
            }}
            onPointerLeave={() => {
              pointerRef.current.active = false;
            }}
            className="block h-full w-full touch-none"
            style={{ touchAction: 'none' }}
          />

          {winner && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/68 p-5 backdrop-blur-md">
              <div className="w-full max-w-[350px] overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] text-center shadow-[0_30px_90px_rgba(0,0,0,0.56)]">
                <div className="h-2.5 bg-gradient-to-r from-lime-400 via-sky-400 to-yellow-300" />

                <div className="px-5 py-6">
                  <div className="text-[9px] font-black uppercase tracking-[0.28em] text-white/38">
                    result
                  </div>

                  <div className="mt-2 bg-gradient-to-r from-lime-200 via-white to-sky-200 bg-clip-text text-5xl font-black tracking-tight text-transparent">
                    {winner === 'Draw' ? 'DRAW' : `${winner} WINS`}
                  </div>

                  <div className="mt-3 text-sm font-semibold text-white/52">
                    Player 1: {p1.totalShots} • Player 2: {p2.totalShots}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-3xl border border-yellow-300/12 bg-yellow-300/8 px-4 py-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">
                        Player 1
                      </div>
                      <div className="mt-2 text-4xl font-black leading-none text-yellow-200">
                        {p1.totalShots}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-sky-300/12 bg-sky-300/8 px-4 py-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">
                        Player 2
                      </div>
                      <div className="mt-2 text-4xl font-black leading-none text-sky-100">
                        {p2.totalShots}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={restart}
                    className="mt-7 w-full rounded-3xl bg-gradient-to-r from-lime-500 to-emerald-600 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_34px_rgba(34,197,94,0.18)] transition active:scale-[0.98]"
                  >
                    Play Again
                  </button>

                  <button
                    onClick={() => navigate(-1)}
                    className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/75 transition active:scale-[0.98]"
                  >
                    Назад
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MiniGolfBeautiful;