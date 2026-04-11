import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Team = 'player' | 'ai';
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

type SafePoint = { x: number; y: number };

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
  chaserSpawn: SafePoint;
  evaderSpawn: SafePoint;
  safePoints: SafePoint[];
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
};

type RoundResult = {
  mapName: string;
  chaserLabel: string;
  time: number;
};

type DragLikeStick = {
  active: boolean;
  visualX: number;
  visualY: number;
};

const WORLD_W = 760;
const WORLD_H = 1160;
const WORLD_MARGIN = 34;

const ROUND_SEQUENCE: RoundInfo[] = [
  { mapIndex: 0, chaser: 'player' },
  { mapIndex: 0, chaser: 'ai' },
  { mapIndex: 1, chaser: 'player' },
  { mapIndex: 1, chaser: 'ai' },
];

const MAPS: MapConfig[] = [
  {
    name: 'Neon District',
    subtitle: 'влажные крыши и световые блоки',
    theme: 'neon',
    bgTop: '#050813',
    bgBottom: '#081323',
    floorA: '#111827',
    floorB: '#0f172a',
    line: 'rgba(125,211,252,0.14)',
    border: 'rgba(255,255,255,0.08)',
    chaserSpawn: { x: 104, y: 1038 },
    evaderSpawn: { x: 656, y: 118 },
    safePoints: [
      { x: 110, y: 110 },
      { x: 650, y: 120 },
      { x: 110, y: 1030 },
      { x: 650, y: 1030 },
      { x: 380, y: 180 },
      { x: 380, y: 980 },
      { x: 190, y: 610 },
      { x: 580, y: 610 },
    ],
    obstacles: [
      { kind: 'rect', x: 88, y: 176, w: 176, h: 86, r: 22 },
      { kind: 'rect', x: 490, y: 148, w: 182, h: 96, r: 22 },
      { kind: 'rect', x: 316, y: 298, w: 126, h: 198, r: 24 },
      { kind: 'rect', x: 84, y: 492, w: 184, h: 88, r: 22 },
      { kind: 'rect', x: 474, y: 566, w: 196, h: 84, r: 22 },
      { kind: 'rect', x: 136, y: 814, w: 190, h: 94, r: 22 },
      { kind: 'rect', x: 432, y: 874, w: 192, h: 92, r: 22 },
      { kind: 'circle', x: 214, y: 694, r: 46 },
      { kind: 'circle', x: 566, y: 370, r: 46 },
      { kind: 'circle', x: 610, y: 730, r: 38 },
    ],
  },
  {
    name: 'Sun Temple',
    subtitle: 'руины, колонны и песочные коридоры',
    theme: 'temple',
    bgTop: '#1f160b',
    bgBottom: '#2c1f10',
    floorA: '#6b4f2f',
    floorB: '#7a5a34',
    line: 'rgba(255,244,200,0.12)',
    border: 'rgba(255,255,255,0.08)',
    chaserSpawn: { x: 126, y: 122 },
    evaderSpawn: { x: 634, y: 1034 },
    safePoints: [
      { x: 106, y: 112 },
      { x: 650, y: 120 },
      { x: 108, y: 1040 },
      { x: 650, y: 1038 },
      { x: 376, y: 168 },
      { x: 376, y: 1000 },
      { x: 188, y: 590 },
      { x: 574, y: 590 },
    ],
    obstacles: [
      { kind: 'rect', x: 222, y: 204, w: 312, h: 68, r: 20 },
      { kind: 'rect', x: 104, y: 352, w: 92, h: 238, r: 18 },
      { kind: 'rect', x: 564, y: 352, w: 92, h: 238, r: 18 },
      { kind: 'rect', x: 176, y: 792, w: 206, h: 72, r: 20 },
      { kind: 'rect', x: 382, y: 874, w: 196, h: 72, r: 20 },
      { kind: 'circle', x: 380, y: 554, r: 70 },
      { kind: 'circle', x: 248, y: 692, r: 44 },
      { kind: 'circle', x: 520, y: 692, r: 44 },
      { kind: 'circle', x: 382, y: 352, r: 38 },
    ],
  },
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

      <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 text-center shadow-2xl min-w-[122px]">
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

  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joystickAreaRef = useRef<HTMLDivElement>(null);

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

  const aiRef = useRef<Runner>({
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
  const playerCatchTotalRef = useRef(0);
  const aiCatchTotalRef = useRef(0);
  const winnerRef = useRef<string | null>(null);

  const joystickInputRef = useRef({
    active: false,
    centerX: 0,
    centerY: 0,
    inputX: 0,
    inputY: 0,
  });

  const [joystickUi, setJoystickUi] = useState<DragLikeStick>({
    active: false,
    visualX: 0,
    visualY: 0,
  });

  const [roundTimer, setRoundTimer] = useState('0.0s');
  const [roundTitle, setRoundTitle] = useState('Map 1 • Round 1/4');
  const [mapTitle, setMapTitle] = useState(MAPS[0].name);
  const [playerRole, setPlayerRole] = useState('CHASER');
  const [aiRole, setAiRole] = useState('RUNNER');
  const [banner, setBanner] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [totals, setTotals] = useState({ player: 0, ai: 0 });

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
      const s = 0.8 + Math.random() * 4.5;
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

  const isInsideRectObstacle = (runner: Runner, obstacle: RectObstacle) => {
    const nearestX = clamp(runner.x, obstacle.x, obstacle.x + obstacle.w);
    const nearestY = clamp(runner.y, obstacle.y, obstacle.y + obstacle.h);
    const dx = runner.x - nearestX;
    const dy = runner.y - nearestY;
    return dx * dx + dy * dy < runner.radius * runner.radius;
  };

  const resolveRunnerCollisions = (runner: Runner, map: MapConfig) => {
    runner.x = clamp(runner.x, WORLD_MARGIN + runner.radius, WORLD_W - WORLD_MARGIN - runner.radius);
    runner.y = clamp(runner.y, WORLD_MARGIN + runner.radius, WORLD_H - WORLD_MARGIN - runner.radius);

    for (let i = 0; i < map.obstacles.length; i += 1) {
      const obstacle = map.obstacles[i];

      if (obstacle.kind === 'circle') {
        const dx = runner.x - obstacle.x;
        const dy = runner.y - obstacle.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const minD = runner.radius + obstacle.r;

        if (d < minD) {
          const nx = dx / d;
          const ny = dy / d;
          runner.x = obstacle.x + nx * minD;
          runner.y = obstacle.y + ny * minD;
          runner.vx *= 0.72;
          runner.vy *= 0.72;
        }
      } else {
        if (!isInsideRectObstacle(runner, obstacle)) continue;

        const nearestX = clamp(runner.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(runner.y, obstacle.y, obstacle.y + obstacle.h);
        const dx = runner.x - nearestX;
        const dy = runner.y - nearestY;
        const lenSq = dx * dx + dy * dy;

        if (lenSq > 0.0001) {
          const len = Math.sqrt(lenSq);
          const nx = dx / len;
          const ny = dy / len;
          const push = runner.radius - len;
          runner.x += nx * push;
          runner.y += ny * push;
          runner.vx *= 0.7;
          runner.vy *= 0.7;
        } else {
          const left = Math.abs(runner.x - obstacle.x);
          const right = Math.abs(obstacle.x + obstacle.w - runner.x);
          const top = Math.abs(runner.y - obstacle.y);
          const bottom = Math.abs(obstacle.y + obstacle.h - runner.y);
          const min = Math.min(left, right, top, bottom);

          if (min === left) runner.x = obstacle.x - runner.radius;
          else if (min === right) runner.x = obstacle.x + obstacle.w + runner.radius;
          else if (min === top) runner.y = obstacle.y - runner.radius;
          else runner.y = obstacle.y + obstacle.h + runner.radius;

          runner.vx *= 0.66;
          runner.vy *= 0.66;
        }
      }
    }

    runner.x = clamp(runner.x, WORLD_MARGIN + runner.radius, WORLD_W - WORLD_MARGIN - runner.radius);
    runner.y = clamp(runner.y, WORLD_MARGIN + runner.radius, WORLD_H - WORLD_MARGIN - runner.radius);
  };

  const moveRunner = (
    runner: Runner,
    inputX: number,
    inputY: number,
    role: Role,
    map: MapConfig,
    dt60: number,
  ) => {
    const maxSpeed = role === 'chaser' ? 4.15 : 3.72;
    const accel = role === 'chaser' ? 0.34 : 0.31;
    const damping = role === 'chaser' ? 0.915 : 0.922;

    const rawMag = Math.hypot(inputX, inputY);
    const nx = rawMag > 0 ? inputX / rawMag : 0;
    const ny = rawMag > 0 ? inputY / rawMag : 0;

    if (rawMag > 0.02) {
      runner.vx += nx * accel * dt60;
      runner.vy += ny * accel * dt60;
    } else {
      runner.vx *= Math.pow(damping, dt60);
      runner.vy *= Math.pow(damping, dt60);
    }

    const speed = Math.hypot(runner.vx, runner.vy);
    if (speed > maxSpeed) {
      runner.vx = (runner.vx / speed) * maxSpeed;
      runner.vy = (runner.vy / speed) * maxSpeed;
    }

    runner.x += runner.vx * dt60 * 1.9;
    resolveRunnerCollisions(runner, map);

    runner.y += runner.vy * dt60 * 1.9;
    resolveRunnerCollisions(runner, map);

    const nextSpeed = Math.hypot(runner.vx, runner.vy);
    if (nextSpeed > 0.06) {
      runner.angle = lerpAngle(runner.angle, Math.atan2(runner.vy, runner.vx), 0.22 * dt60);
      runner.anim += nextSpeed * 0.32 * dt60;
    }
  };

  const obstacleAvoidance = (map: MapConfig, x: number, y: number) => {
    let ax = 0;
    let ay = 0;

    for (let i = 0; i < map.obstacles.length; i += 1) {
      const obstacle = map.obstacles[i];

      if (obstacle.kind === 'circle') {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        const d = Math.hypot(dx, dy) || 1;
        const safe = obstacle.r + 104;
        if (d < safe) {
          const force = (safe - d) / safe;
          ax += (dx / d) * force * 1.6;
          ay += (dy / d) * force * 1.6;
        }
      } else {
        const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.h);
        const dx = x - nearestX;
        const dy = y - nearestY;
        const d = Math.hypot(dx, dy) || 1;
        const safe = 104;
        if (d < safe) {
          const force = (safe - d) / safe;
          ax += (dx / d) * force * 1.9;
          ay += (dy / d) * force * 1.9;
        }
      }
    }

    const wallSafe = 116;
    if (x < wallSafe) ax += ((wallSafe - x) / wallSafe) * 1.8;
    if (x > WORLD_W - wallSafe) ax -= ((x - (WORLD_W - wallSafe)) / wallSafe) * 1.8;
    if (y < wallSafe) ay += ((wallSafe - y) / wallSafe) * 1.8;
    if (y > WORLD_H - wallSafe) ay -= ((y - (WORLD_H - wallSafe)) / wallSafe) * 1.8;

    return { x: ax, y: ay };
  };

  const computeAIMove = (
    map: MapConfig,
    aiRunner: Runner,
    playerRunner: Runner,
    aiRole: Role,
  ) => {
    let mx = 0;
    let my = 0;

    if (aiRole === 'chaser') {
      const targetX = playerRunner.x + playerRunner.vx * 16;
      const targetY = playerRunner.y + playerRunner.vy * 16;
      mx += targetX - aiRunner.x;
      my += targetY - aiRunner.y;
    } else {
      const awayX = aiRunner.x - playerRunner.x;
      const awayY = aiRunner.y - playerRunner.y;
      const d = Math.max(1, Math.hypot(awayX, awayY));
      const danger = clamp(440 / d, 0.55, 2.4);

      mx += (awayX / d) * danger * 2.2;
      my += (awayY / d) * danger * 2.2;

      let bestPoint = map.safePoints[0];
      let bestScore = -Infinity;

      for (let i = 0; i < map.safePoints.length; i += 1) {
        const p = map.safePoints[i];
        const score =
          distance(p.x, p.y, playerRunner.x, playerRunner.y) * 1.15 -
          distance(p.x, p.y, aiRunner.x, aiRunner.y) * 0.34;

        if (score > bestScore) {
          bestScore = score;
          bestPoint = p;
        }
      }

      mx += (bestPoint.x - aiRunner.x) * 0.012;
      my += (bestPoint.y - aiRunner.y) * 0.012;
    }

    const avoid = obstacleAvoidance(map, aiRunner.x + mx * 0.02, aiRunner.y + my * 0.02);
    mx += avoid.x * 120;
    my += avoid.y * 120;

    const n = normalize(mx, my);
    return n;
  };

  const startBanner = (text: string) => {
    setBanner(text);
    if (bannerTimeoutRef.current) window.clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = window.setTimeout(() => {
      setBanner(null);
    }, 1250);
  };

  const finishMatch = () => {
    const playerTotal = playerCatchTotalRef.current;
    const aiTotal = aiCatchTotalRef.current;

    setTotals({ player: playerTotal, ai: aiTotal });

    if (playerTotal < aiTotal) {
      setWinnerBoth('YOU WIN');
    } else if (aiTotal < playerTotal) {
      setWinnerBoth('RIVAL WINS');
    } else {
      setWinnerBoth('DRAW');
    }
  };

  const startRound = (index: number) => {
    clearTimeouts();

    const round = ROUND_SEQUENCE[index];
    const map = MAPS[round.mapIndex];

    roundIndexRef.current = index;
    currentRoundRef.current = round;
    currentMapRef.current = map;
    roundStartAtRef.current = performance.now();

    const playerIsChaser = round.chaser === 'player';

    playerRef.current = {
      x: playerIsChaser ? map.chaserSpawn.x : map.evaderSpawn.x,
      y: playerIsChaser ? map.chaserSpawn.y : map.evaderSpawn.y,
      vx: 0,
      vy: 0,
      angle: playerIsChaser ? -0.9 : 2.3,
      anim: 0,
      radius: 20,
    };

    aiRef.current = {
      x: playerIsChaser ? map.evaderSpawn.x : map.chaserSpawn.x,
      y: playerIsChaser ? map.evaderSpawn.y : map.chaserSpawn.y,
      vx: 0,
      vy: 0,
      angle: playerIsChaser ? 2.2 : -0.8,
      anim: 0,
      radius: 20,
    };

    setMapTitle(map.name);
    setRoundTitle(`Map ${round.mapIndex + 1} • Round ${index + 1}/4`);
    setPlayerRole(playerIsChaser ? 'CHASER' : 'RUNNER');
    setAiRole(playerIsChaser ? 'RUNNER' : 'CHASER');
    setRoundTimer('0.0s');

    startBanner(
      `${map.name} • ${playerIsChaser ? 'YOU CHASE' : 'RIVAL CHASES'}`,
    );
  };

  const resetGame = () => {
    clearTimeouts();
    playerCatchTotalRef.current = 0;
    aiCatchTotalRef.current = 0;
    particlesRef.current = [];
    winnerRef.current = null;
    setWinner(null);
    setResults([]);
    setTotals({ player: 0, ai: 0 });
    startRound(0);
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

    wrap.addEventListener('touchstart', preventTouch, { passive: false });
    wrap.addEventListener('touchmove', preventTouch, { passive: false });

    resize();
    window.addEventListener('resize', resize);

    const roundRect = (
      ctx2: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx2.beginPath();
      ctx2.moveTo(x + rr, y);
      ctx2.arcTo(x + w, y, x + w, y + h, rr);
      ctx2.arcTo(x + w, y + h, x, y + h, rr);
      ctx2.arcTo(x, y + h, x, y, rr);
      ctx2.arcTo(x, y, x + w, y, rr);
      ctx2.closePath();
    };

    const drawMap = (map: MapConfig, now: number) => {
      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      bg.addColorStop(0, map.bgTop);
      bg.addColorStop(1, map.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      if (map.theme === 'neon') {
        const glow1 = ctx.createRadialGradient(130, 200, 10, 130, 200, 200);
        glow1.addColorStop(0, 'rgba(34,211,238,0.16)');
        glow1.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = glow1;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);

        const glow2 = ctx.createRadialGradient(620, 940, 10, 620, 940, 220);
        glow2.addColorStop(0, 'rgba(217,70,239,0.15)');
        glow2.addColorStop(1, 'rgba(217,70,239,0)');
        ctx.fillStyle = glow2;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      } else {
        const sun = ctx.createRadialGradient(612, 132, 10, 612, 132, 180);
        sun.addColorStop(0, 'rgba(255,244,200,0.28)');
        sun.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);

        const dune = ctx.createLinearGradient(0, 0, 0, WORLD_H);
        dune.addColorStop(0, 'rgba(255,255,255,0.02)');
        dune.addColorStop(1, 'rgba(0,0,0,0.06)');
        ctx.fillStyle = dune;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      }

      roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 38);
      const field = ctx.createLinearGradient(0, 24, 0, WORLD_H - 24);
      field.addColorStop(0, map.floorA);
      field.addColorStop(1, map.floorB);
      ctx.fillStyle = field;
      ctx.fill();

      ctx.save();
      roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 38);
      ctx.clip();

      for (let i = 0; i < 12; i += 1) {
        ctx.fillStyle =
          i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.015)';
        ctx.fillRect(24, 24 + ((WORLD_H - 48) / 12) * i, WORLD_W - 48, (WORLD_H - 48) / 12);
      }

      ctx.strokeStyle = map.line;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(WORLD_W / 2, 48);
      ctx.lineTo(WORLD_W / 2, WORLD_H - 48);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(WORLD_W / 2, WORLD_H / 2, 84, 0, Math.PI * 2);
      ctx.stroke();

      if (map.theme === 'neon') {
        for (let y = 80; y < WORLD_H - 80; y += 120) {
          ctx.fillStyle = 'rgba(34,211,238,0.06)';
          ctx.fillRect(54, y, 14, 44);
          ctx.fillStyle = 'rgba(217,70,239,0.05)';
          ctx.fillRect(WORLD_W - 68, y + 18, 14, 44);
        }
      } else {
        for (let i = 0; i < 10; i += 1) {
          const x = 70 + (i * 63) % 620;
          const y = 88 + (i * 97) % 920;
          ctx.fillStyle = 'rgba(255,255,255,0.045)';
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let i = 0; i < map.obstacles.length; i += 1) {
        const obstacle = map.obstacles[i];

        if (obstacle.kind === 'rect') {
          const x = obstacle.x;
          const y = obstacle.y;
          const w = obstacle.w;
          const h = obstacle.h;
          const r = obstacle.r ?? 18;

          if (map.theme === 'neon') {
            const fill = ctx.createLinearGradient(x, y, x, y + h);
            fill.addColorStop(0, '#162033');
            fill.addColorStop(1, '#0b1220');
            ctx.fillStyle = fill;
            roundRect(ctx, x, y, w, h, r);
            ctx.fill();

            ctx.strokeStyle = 'rgba(103,232,249,0.38)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            roundRect(ctx, x + 8, y + 8, w - 16, 12, 6);
            ctx.fill();
          } else {
            const fill = ctx.createLinearGradient(x, y, x, y + h);
            fill.addColorStop(0, '#b68a52');
            fill.addColorStop(1, '#8a6538');
            ctx.fillStyle = fill;
            roundRect(ctx, x, y, w, h, r);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,244,200,0.20)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            for (let yy = y + 12; yy < y + h - 8; yy += 18) {
              ctx.fillRect(x + 10, yy, w - 20, 2);
            }
          }
        } else {
          if (map.theme === 'neon') {
            const grad = ctx.createRadialGradient(
              obstacle.x - 8,
              obstacle.y - 10,
              3,
              obstacle.x,
              obstacle.y,
              obstacle.r,
            );
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, '#334155');
            grad.addColorStop(1, '#0f172a');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(34,211,238,0.28)';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            const grad = ctx.createRadialGradient(
              obstacle.x - 8,
              obstacle.y - 10,
              4,
              obstacle.x,
              obstacle.y,
              obstacle.r,
            );
            grad.addColorStop(0, '#f6deb0');
            grad.addColorStop(0.3, '#9f7542');
            grad.addColorStop(1, '#7c5a32');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,244,200,0.18)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      ctx.restore();

      ctx.strokeStyle = map.border;
      ctx.lineWidth = 2;
      roundRect(ctx, 24, 24, WORLD_W - 48, WORLD_H - 48, 38);
      ctx.stroke();

      const spawnGlowTop = ctx.createRadialGradient(
        map.evaderSpawn.x,
        map.evaderSpawn.y,
        10,
        map.evaderSpawn.x,
        map.evaderSpawn.y,
        70,
      );
      spawnGlowTop.addColorStop(0, 'rgba(45,212,191,0.14)');
      spawnGlowTop.addColorStop(1, 'rgba(45,212,191,0)');
      ctx.fillStyle = spawnGlowTop;
      ctx.beginPath();
      ctx.arc(map.evaderSpawn.x, map.evaderSpawn.y, 70, 0, Math.PI * 2);
      ctx.fill();

      const spawnGlowBottom = ctx.createRadialGradient(
        map.chaserSpawn.x,
        map.chaserSpawn.y,
        10,
        map.chaserSpawn.x,
        map.chaserSpawn.y,
        70,
      );
      spawnGlowBottom.addColorStop(0, 'rgba(248,113,113,0.12)');
      spawnGlowBottom.addColorStop(1, 'rgba(248,113,113,0)');
      ctx.fillStyle = spawnGlowBottom;
      ctx.beginPath();
      ctx.arc(map.chaserSpawn.x, map.chaserSpawn.y, 70, 0, Math.PI * 2);
      ctx.fill();

      if (map.theme === 'neon') {
        for (let i = 0; i < 4; i += 1) {
          const pulseY = 190 + i * 230 + Math.sin(now * 0.002 + i) * 6;
          ctx.strokeStyle = 'rgba(34,211,238,0.10)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(58, pulseY);
          ctx.lineTo(WORLD_W - 58, pulseY);
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 8; i += 1) {
          const x = 90 + i * 78;
          const y = 140 + Math.sin(now * 0.0018 + i) * 3;
          ctx.fillStyle = 'rgba(255,244,200,0.06)';
          ctx.beginPath();
          ctx.ellipse(x, y, 20, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawRunner = (runner: Runner, team: Team, role: Role) => {
      const playerPalette = {
        hood: '#f59e0b',
        body: '#1f2937',
        accent: '#fde68a',
        trim: '#fb923c',
      };

      const aiPalette = {
        hood: '#60a5fa',
        body: '#172554',
        accent: '#dbeafe',
        trim: '#38bdf8',
      };

      const palette = team === 'player' ? playerPalette : aiPalette;
      const roleGlow =
        role === 'chaser' ? 'rgba(248,113,113,0.38)' : 'rgba(45,212,191,0.34)';

      const speed = Math.hypot(runner.vx, runner.vy);
      const stride = Math.sin(runner.anim * 1.9) * Math.min(4.5, speed * 1.8);

      ctx.save();
      ctx.translate(runner.x, runner.y);
      ctx.rotate(runner.angle + Math.PI / 2);

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 18, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      const aura = ctx.createRadialGradient(0, 2, 4, 0, 2, 34);
      aura.addColorStop(0, roleGlow);
      aura.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 2, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = palette.body;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(-5, 15);
      ctx.lineTo(-7 + stride, 27);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(5, 15);
      ctx.lineTo(7 - stride, 27);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-15 + stride * 0.45, 12);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(15 - stride * 0.45, 12);
      ctx.stroke();

      ctx.fillStyle = palette.body;
      roundRect(ctx, -13, -3, 26, 28, 11);
      ctx.fill();

      ctx.fillStyle = palette.trim;
      roundRect(ctx, -13, -3, 26, 9, 8);
      ctx.fill();

      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(0, -12, 11.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.hood;
      ctx.beginPath();
      ctx.arc(0, -14, 13.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(0, -11, 9.5, 0, Math.PI * 2);
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

    const updateParticles = (dt60: number) => {
      const nextParticles: typeof particlesRef.current = [];

      for (let i = 0; i < particlesRef.current.length; i += 1) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt60;
        p.y += p.vy * dt60;
        p.vx *= Math.pow(0.98, dt60);
        p.vy *= Math.pow(0.98, dt60);
        p.life -= 0.03 * dt60;
        if (p.life > 0) nextParticles.push(p);
      }

      particlesRef.current = nextParticles;
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
      const dtMs = Math.min(now - prev, 32);
      const dt60 = dtMs / 16.6667;
      lastFrameRef.current = now;

      const map = currentMapRef.current;
      const round = currentRoundRef.current;
      const playerRoleNow: Role = round.chaser === 'player' ? 'chaser' : 'runner';
      const aiRoleNow: Role = round.chaser === 'ai' ? 'chaser' : 'runner';

      if (!winnerRef.current) {
        const joy = joystickInputRef.current;
        moveRunner(
          playerRef.current,
          joy.inputX,
          joy.inputY,
          playerRoleNow,
          map,
          dt60,
        );

        const aiInput = computeAIMove(map, aiRef.current, playerRef.current, aiRoleNow);
        moveRunner(aiRef.current, aiInput.x, aiInput.y, aiRoleNow, map, dt60);

        const elapsed = (now - roundStartAtRef.current) / 1000;

        if (now - lastUiSyncRef.current > 80) {
          setRoundTimer(`${elapsed.toFixed(1)}s`);
          lastUiSyncRef.current = now;
        }

        const chaserRunner = round.chaser === 'player' ? playerRef.current : aiRef.current;
        const evaderRunner = round.chaser === 'player' ? aiRef.current : playerRef.current;

        if (
          distance(chaserRunner.x, chaserRunner.y, evaderRunner.x, evaderRunner.y) <=
          chaserRunner.radius + evaderRunner.radius
        ) {
          const roundTime = Number(elapsed.toFixed(2));
          const chaserLabel = round.chaser === 'player' ? 'YOU' : 'RIVAL';

          createBurst(
            (chaserRunner.x + evaderRunner.x) / 2,
            (chaserRunner.y + evaderRunner.y) / 2,
            round.chaser === 'player'
              ? ['#f59e0b', '#fde68a', '#ffffff']
              : ['#60a5fa', '#dbeafe', '#ffffff'],
            28,
          );

          if (round.chaser === 'player') {
            playerCatchTotalRef.current += roundTime;
          } else {
            aiCatchTotalRef.current += roundTime;
          }

          setResults((prevResults) => [
            ...prevResults,
            {
              mapName: map.name,
              chaserLabel,
              time: roundTime,
            },
          ]);

          setTotals({
            player: playerCatchTotalRef.current,
            ai: aiCatchTotalRef.current,
          });

          if (roundIndexRef.current >= ROUND_SEQUENCE.length - 1) {
            nextRoundTimeoutRef.current = window.setTimeout(() => {
              finishMatch();
            }, 850);
          } else {
            startBanner(`${chaserLabel} caught in ${roundTime.toFixed(2)}s`);
            nextRoundTimeoutRef.current = window.setTimeout(() => {
              startRound(roundIndexRef.current + 1);
            }, 1000);
          }
        }
      }

      updateParticles(dt60);

      const { width, height, scale, offsetX, offsetY } = layoutRef.current;
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      drawMap(map, now);
      drawRunner(playerRef.current, 'player', playerRoleNow);
      drawRunner(aiRef.current, 'ai', aiRoleNow);
      drawParticles();

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

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
    const lim = 46;

    const visualX = (dx / d) * Math.min(d, lim);
    const visualY = (dy / d) * Math.min(d, lim);

    joy.inputX = visualX / lim;
    joy.inputY = visualY / lim;

    setJoystickUi({
      active: true,
      visualX,
      visualY,
    });
  };

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    joystickInputRef.current.active = true;
    joystickInputRef.current.centerX = centerX;
    joystickInputRef.current.centerY = centerY;

    updateJoystickFromPointer(e.clientX, e.clientY);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
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
      ref={rootRef}
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
            rightRole={aiRole}
          />

          <div className="mt-2 flex justify-end">
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

          <div className="absolute left-3 bottom-3 z-20 pointer-events-none">
            <div className="rounded-full bg-black/35 border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-bold text-white/60 backdrop-blur-xl">
              Smaller total catch time wins
            </div>
          </div>

          <div
            ref={joystickAreaRef}
            className="absolute right-4 bottom-4 z-20 w-32 h-32 rounded-full bg-black/40 border-4 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.45)] flex items-center justify-center touch-none"
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
              <div className="w-full max-w-[360px] rounded-[28px] bg-white px-7 py-8 text-center shadow-2xl">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                  Final Result
                </div>

                <div className="mt-3 text-4xl font-black text-slate-900">{winner}</div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/60 font-bold">
                      You
                    </div>
                    <div className="text-2xl font-black text-emerald-600 mt-1">
                      {totals.player.toFixed(2)}s
                    </div>
                  </div>

                  <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-sky-700/60 font-bold">
                      Rival
                    </div>
                    <div className="text-2xl font-black text-sky-600 mt-1">
                      {totals.ai.toFixed(2)}s
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-left max-h-[180px] overflow-auto">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold mb-2">
                    Round Times
                  </div>

                  <div className="space-y-2">
                    {results.map((item, index) => (
                      <div
                        key={`${item.mapName}-${item.chaserLabel}-${index}`}
                        className="flex items-center justify-between text-sm text-slate-700 font-semibold"
                      >
                        <span>
                          {index + 1}. {item.mapName} • {item.chaserLabel}
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