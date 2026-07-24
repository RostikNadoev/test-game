import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

type Vec = { r: number; c: number };
type Dir = 'up' | 'down' | 'left' | 'right';
type Phase = 'countdown' | 'playing' | 'finished';
type ActorKind = 'player' | 'rival';

type DashPlan = {
  cells: Vec[];
  destination: Vec;
  fatal: boolean;
  reachedGoal: boolean;
};

type Arena = {
  variant: number;
  walls: boolean[][];
  spikes: Set<string>;
  coins: Set<string>;
  treasures: Set<string>;
  start: Vec;
  goal: Vec;
};

type ActorMotion = {
  cell: Vec;
  from: Vec;
  to: Vec;
  moving: boolean;
  startedAt: number;
  duration: number;
  generation: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 'coin' | 'impact' | 'danger';
};

type BoardLayout = {
  cell: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const ROWS = 19;
const COLS = 15;
const ROUND_SECONDS = 45;
const DPR_CAP = 1.5;
const START: Vec = { r: 17, c: 7 };
const GOAL: Vec = { r: 1, c: 7 };

const DIRS: Record<Dir, Vec> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

const BASE_STOPPERS: Vec[] = [
  { r: 15, c: 3 },
  { r: 15, c: 11 },
  { r: 13, c: 7 },
  { r: 11, c: 4 },
  { r: 11, c: 10 },
  { r: 9, c: 7 },
  { r: 7, c: 3 },
  { r: 7, c: 11 },
  { r: 5, c: 7 },
  { r: 3, c: 4 },
  { r: 3, c: 10 },
];

const VARIANT_STOPPERS: Vec[][] = [
  [
    { r: 16, c: 5 },
    { r: 14, c: 9 },
    { r: 12, c: 2 },
    { r: 10, c: 12 },
    { r: 8, c: 5 },
    { r: 6, c: 9 },
    { r: 4, c: 12 },
  ],
  [
    { r: 16, c: 9 },
    { r: 14, c: 5 },
    { r: 12, c: 12 },
    { r: 10, c: 2 },
    { r: 8, c: 9 },
    { r: 6, c: 5 },
    { r: 4, c: 2 },
  ],
  [
    { r: 16, c: 4 },
    { r: 14, c: 10 },
    { r: 12, c: 6 },
    { r: 10, c: 3 },
    { r: 8, c: 12 },
    { r: 6, c: 6 },
    { r: 4, c: 9 },
  ],
  [
    { r: 16, c: 10 },
    { r: 14, c: 4 },
    { r: 12, c: 8 },
    { r: 10, c: 12 },
    { r: 8, c: 2 },
    { r: 6, c: 10 },
    { r: 4, c: 5 },
  ],
];

const VARIANT_SPIKES: Vec[][] = [
  [
    { r: 16, c: 12 },
    { r: 12, c: 9 },
    { r: 8, c: 2 },
    { r: 4, c: 6 },
  ],
  [
    { r: 16, c: 2 },
    { r: 12, c: 5 },
    { r: 8, c: 12 },
    { r: 4, c: 8 },
  ],
  [
    { r: 14, c: 12 },
    { r: 10, c: 5 },
    { r: 6, c: 2 },
    { r: 2, c: 11 },
  ],
  [
    { r: 14, c: 2 },
    { r: 10, c: 9 },
    { r: 6, c: 12 },
    { r: 2, c: 3 },
  ],
];

const VARIANT_TREASURE_HINTS: Vec[][] = [
  [
    { r: 16, c: 6 },
    { r: 14, c: 8 },
    { r: 12, c: 3 },
    { r: 10, c: 11 },
    { r: 8, c: 6 },
    { r: 6, c: 8 },
    { r: 4, c: 11 },
    { r: 2, c: 4 },
  ],
  [
    { r: 16, c: 8 },
    { r: 14, c: 6 },
    { r: 12, c: 11 },
    { r: 10, c: 3 },
    { r: 8, c: 8 },
    { r: 6, c: 6 },
    { r: 4, c: 3 },
    { r: 2, c: 10 },
  ],
  [
    { r: 16, c: 5 },
    { r: 14, c: 9 },
    { r: 12, c: 5 },
    { r: 10, c: 4 },
    { r: 8, c: 11 },
    { r: 6, c: 5 },
    { r: 4, c: 8 },
    { r: 2, c: 11 },
  ],
  [
    { r: 16, c: 9 },
    { r: 14, c: 5 },
    { r: 12, c: 9 },
    { r: 10, c: 11 },
    { r: 8, c: 3 },
    { r: 6, c: 9 },
    { r: 4, c: 6 },
    { r: 2, c: 3 },
  ],
];

const BASE_COIN_ROUTES: Vec[] = [
  { r: 17, c: 3 }, { r: 17, c: 5 }, { r: 17, c: 9 }, { r: 17, c: 11 },
  { r: 16, c: 3 }, { r: 16, c: 7 }, { r: 16, c: 11 },
  { r: 14, c: 2 }, { r: 14, c: 4 }, { r: 14, c: 7 }, { r: 14, c: 10 }, { r: 14, c: 12 },
  { r: 12, c: 2 }, { r: 12, c: 4 }, { r: 12, c: 7 }, { r: 12, c: 10 }, { r: 12, c: 12 },
  { r: 10, c: 2 }, { r: 10, c: 4 }, { r: 10, c: 7 }, { r: 10, c: 10 }, { r: 10, c: 12 },
  { r: 8, c: 2 }, { r: 8, c: 4 }, { r: 8, c: 7 }, { r: 8, c: 10 }, { r: 8, c: 12 },
  { r: 6, c: 2 }, { r: 6, c: 4 }, { r: 6, c: 7 }, { r: 6, c: 10 }, { r: 6, c: 12 },
  { r: 4, c: 2 }, { r: 4, c: 4 }, { r: 4, c: 7 }, { r: 4, c: 10 }, { r: 4, c: 12 },
  { r: 2, c: 3 }, { r: 2, c: 5 }, { r: 2, c: 9 }, { r: 2, c: 11 },
];

const VARIANT_EXTRA_COINS: Vec[][] = [
  [{ r: 15, c: 7 }, { r: 13, c: 3 }, { r: 11, c: 7 }, { r: 9, c: 11 }, { r: 5, c: 3 }],
  [{ r: 15, c: 7 }, { r: 13, c: 11 }, { r: 11, c: 7 }, { r: 9, c: 3 }, { r: 5, c: 11 }],
  [{ r: 15, c: 5 }, { r: 13, c: 10 }, { r: 11, c: 2 }, { r: 7, c: 7 }, { r: 3, c: 12 }],
  [{ r: 15, c: 9 }, { r: 13, c: 4 }, { r: 11, c: 12 }, { r: 7, c: 7 }, { r: 3, c: 2 }],
];

const keyOf = (cell: Vec) => `${cell.r}:${cell.c}`;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const sameCell = (a: Vec, b: Vec) => a.r === b.r && a.c === b.c;

const initials = (name?: string) => {
  const value = name?.replace(/^@/, '').trim();
  return value ? value.slice(0, 2).toUpperCase() : 'TG';
};

function makeWallGrid() {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1,
    ),
  );
}

function isInside(r: number, c: number) {
  return r >= 0 && c >= 0 && r < ROWS && c < COLS;
}

function collectReachableStops(
  walls: boolean[][],
  spikes: Set<string>,
  start: Vec,
  goal: Vec,
) {
  const result: Vec[] = [];
  const seen = new Set<string>([keyOf(start)]);
  const queue: Vec[] = [{ ...start }];

  while (queue.length) {
    const from = queue.shift();
    if (!from) break;

    for (const dir of Object.keys(DIRS) as Dir[]) {
      const delta = DIRS[dir];
      let r = from.r;
      let c = from.c;
      let fatal = false;
      let moved = false;

      while (
        isInside(r + delta.r, c + delta.c) &&
        !walls[r + delta.r][c + delta.c]
      ) {
        r += delta.r;
        c += delta.c;
        moved = true;

        if (spikes.has(`${r}:${c}`)) {
          fatal = true;
          break;
        }

        if (r === goal.r && c === goal.c) break;
      }

      if (!moved || fatal) continue;

      const destination = { r, c };
      const key = keyOf(destination);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(destination);
      queue.push(destination);
    }
  }

  return result;
}

function buildArena(variantRaw: number): Arena {
  const variant = ((variantRaw % VARIANT_STOPPERS.length) + VARIANT_STOPPERS.length) % VARIANT_STOPPERS.length;
  const walls = makeWallGrid();

  for (const cell of BASE_STOPPERS) walls[cell.r][cell.c] = true;
  for (const cell of VARIANT_STOPPERS[variant]) walls[cell.r][cell.c] = true;

  const spikes = new Set<string>();
  for (const cell of VARIANT_SPIKES[variant]) {
    if (!walls[cell.r][cell.c]) spikes.add(keyOf(cell));
  }

  const reachableStops = collectReachableStops(walls, spikes, START, GOAL)
    .filter((cell) => !sameCell(cell, START) && !sameCell(cell, GOAL));
  const unusedStops = new Map(reachableStops.map((cell) => [keyOf(cell), cell]));
  const treasures = new Set<string>();

  for (const hint of VARIANT_TREASURE_HINTS[variant]) {
    let best: Vec | null = null;
    let bestScore = Infinity;

    for (const cell of unusedStops.values()) {
      const distance = Math.abs(cell.r - hint.r) + Math.abs(cell.c - hint.c);
      const edgePenalty = cell.c <= 1 || cell.c >= COLS - 2 ? 1.4 : 0;
      const score = distance + edgePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = cell;
      }
    }

    if (best) {
      const key = keyOf(best);
      treasures.add(key);
      unusedStops.delete(key);
    }
  }

  const coins = new Set<string>();
  for (const cell of [...BASE_COIN_ROUTES, ...VARIANT_EXTRA_COINS[variant]]) {
    const key = keyOf(cell);
    if (
      isInside(cell.r, cell.c) &&
      !walls[cell.r][cell.c] &&
      !spikes.has(key) &&
      !treasures.has(key) &&
      !sameCell(cell, START) &&
      !sameCell(cell, GOAL)
    ) {
      coins.add(key);
    }
  }

  return {
    variant,
    walls,
    spikes,
    coins,
    treasures,
    start: START,
    goal: GOAL,
  };
}

function isWall(arena: Arena, r: number, c: number) {
  return !isInside(r, c) || arena.walls[r][c];
}

function buildDashPlan(arena: Arena, from: Vec, dir: Dir): DashPlan | null {
  const delta = DIRS[dir];
  let r = from.r;
  let c = from.c;
  const cells: Vec[] = [];
  let fatal = false;
  let reachedGoal = false;

  while (!isWall(arena, r + delta.r, c + delta.c)) {
    r += delta.r;
    c += delta.c;
    const cell = { r, c };
    cells.push(cell);

    if (arena.spikes.has(keyOf(cell))) {
      fatal = true;
      break;
    }

    if (sameCell(cell, arena.goal)) {
      reachedGoal = true;
      break;
    }
  }

  if (!cells.length) return null;

  return {
    cells,
    destination: cells[cells.length - 1],
    fatal,
    reachedGoal,
  };
}

function dashDuration(cellCount: number) {
  return clamp(105 + cellCount * 22, 135, 330);
}

function createActor(cell: Vec): ActorMotion {
  return {
    cell: { ...cell },
    from: { ...cell },
    to: { ...cell },
    moving: false,
    startedAt: 0,
    duration: 1,
    generation: 0,
  };
}

function easeDash(t: number) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3.2);
}

function actorPosition(actor: ActorMotion, now: number) {
  if (!actor.moving) return actor.cell;
  const t = easeDash((now - actor.startedAt) / Math.max(1, actor.duration));
  return {
    r: actor.from.r + (actor.to.r - actor.from.r) * t,
    c: actor.from.c + (actor.to.c - actor.from.c) * t,
  };
}

function scoreDirection(
  arena: Arena,
  actor: ActorMotion,
  dir: Dir,
  collectedCoins: Set<string>,
  collectedTreasures: Set<string>,
  goalClaimed: boolean,
) {
  const plan = buildDashPlan(arena, actor.cell, dir);
  if (!plan) return -Infinity;

  let score = 0;
  for (const cell of plan.cells) {
    const key = keyOf(cell);
    if (arena.coins.has(key) && !collectedCoins.has(key)) score += 1.5;
  }

  const destinationKey = keyOf(plan.destination);
  if (arena.treasures.has(destinationKey) && !collectedTreasures.has(destinationKey)) score += 11;
  if (plan.reachedGoal && !goalClaimed) score += 20;
  if (plan.fatal) score -= 30;

  score += (actor.cell.r - plan.destination.r) * 0.35;
  score += plan.cells.length * 0.06;
  score += (Math.random() - 0.5) * 2.1;
  return score;
}

function pickBotDirection(
  arena: Arena,
  actor: ActorMotion,
  collectedCoins: Set<string>,
  collectedTreasures: Set<string>,
  goalClaimed: boolean,
) {
  const options = (Object.keys(DIRS) as Dir[])
    .map((dir) => ({
      dir,
      score: scoreDirection(
        arena,
        actor,
        dir,
        collectedCoins,
        collectedTreasures,
        goalClaimed,
      ),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  if (!options.length) return 'up' as Dir;
  if (options.length > 1 && Math.random() < 0.16) return options[1].dir;
  return options[0].dir;
}

export default function TombDashDuel() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<BoardLayout>({ cell: 24, x: 0, y: 0, width: 360, height: 456 });
  const rafRef = useRef<number | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const phaseRef = useRef<Phase>('countdown');
  const generationRef = useRef(1);
  const variantRef = useRef(Math.floor(Math.random() * VARIANT_STOPPERS.length));
  const arenaRef = useRef<Arena>(buildArena(variantRef.current));
  const playerActorRef = useRef<ActorMotion>(createActor(START));
  const rivalActorRef = useRef<ActorMotion>(createActor(START));
  const particlesRef = useRef<Particle[]>([]);
  const botTimerRef = useRef<number | null>(null);
  const finishTimersRef = useRef<number[]>([]);

  const playerCoinsRef = useRef<Set<string>>(new Set());
  const rivalCoinsRef = useRef<Set<string>>(new Set());
  const playerTreasuresRef = useRef<Set<string>>(new Set());
  const rivalTreasuresRef = useRef<Set<string>>(new Set());
  const playerGoalRef = useRef(false);
  const rivalGoalRef = useRef(false);
  const playerScoreRef = useRef(0);
  const rivalScoreRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [playerTreasureCount, setPlayerTreasureCount] = useState(0);
  const [playerCoinCount, setPlayerCoinCount] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [message, setMessage] = useState('SWIPE TO DASH');
  const [showResult, setShowResult] = useState(false);
  const [arenaNumber, setArenaNumber] = useState(arenaRef.current.variant + 1);

  const clearFinishTimers = useCallback(() => {
    for (const timer of finishTimersRef.current) window.clearTimeout(timer);
    finishTimersRef.current = [];
  }, []);

  const spawnParticles = useCallback((cell: Vec, kind: Particle['kind'], amount: number) => {
    const particles = particlesRef.current;
    for (let i = 0; i < amount && particles.length < 42; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.55 + Math.random() * 1.15;
      particles.push({
        x: cell.c + 0.5,
        y: cell.r + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.22 + Math.random() * 0.18,
        size: 0.045 + Math.random() * 0.04,
        kind,
      });
    }
  }, []);

  const updateScore = useCallback((kind: ActorKind, delta: number) => {
    if (kind === 'player') {
      playerScoreRef.current = Math.max(0, playerScoreRef.current + delta);
      setPlayerScore(playerScoreRef.current);
    } else {
      rivalScoreRef.current = Math.max(0, rivalScoreRef.current + delta);
      setRivalScore(rivalScoreRef.current);
    }
  }, []);

  const rebuildTerrainCache = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    if (!viewW || !viewH) return;

    const cell = Math.floor(Math.min(viewW / COLS, viewH / ROWS) * 10) / 10;
    const width = cell * COLS;
    const height = cell * ROWS;
    const x = (viewW - width) / 2;
    const y = (viewH - height) / 2;
    layoutRef.current = { cell, x, y, width, height };

    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor(viewW));
    cache.height = Math.max(1, Math.floor(viewH));
    const ctx = cache.getContext('2d');
    if (!ctx) return;

    const arena = arenaRef.current;
    ctx.fillStyle = '#09050a';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = '#11070f';
    ctx.fillRect(x, y, width, height);

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const px = x + c * cell;
        const py = y + r * cell;
        const key = `${r}:${c}`;

        if (arena.walls[r][c]) {
          const boundary = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
          ctx.fillStyle = boundary ? '#47132f' : '#5a1739';
          ctx.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
          ctx.fillStyle = boundary ? '#7a2450' : '#91305e';
          ctx.fillRect(px + 1, py + 1, cell - 2, Math.max(1, cell * 0.12));
          ctx.fillStyle = 'rgba(0,0,0,.24)';
          ctx.fillRect(px + cell * 0.72, py + cell * 0.22, Math.max(1, cell * 0.08), cell * 0.55);
        } else {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#10070f' : '#0e060d';
          ctx.fillRect(px, py, cell, cell);

          if ((r * 5 + c * 3 + arena.variant) % 11 === 0) {
            ctx.fillStyle = 'rgba(255,214,74,.045)';
            ctx.fillRect(px + cell * 0.24, py + cell * 0.28, cell * 0.12, cell * 0.08);
          }
        }

        if (arena.spikes.has(key)) {
          ctx.fillStyle = '#ff5578';
          const baseY = py + cell * 0.78;
          for (let i = 0; i < 3; i += 1) {
            const left = px + cell * (0.18 + i * 0.22);
            ctx.beginPath();
            ctx.moveTo(left, baseY);
            ctx.lineTo(left + cell * 0.11, py + cell * (i === 1 ? 0.18 : 0.30));
            ctx.lineTo(left + cell * 0.22, baseY);
            ctx.closePath();
            ctx.fill();
          }
        }

        if (sameCell({ r, c }, arena.goal)) {
          ctx.strokeStyle = '#ffd64a';
          ctx.lineWidth = Math.max(1, cell * 0.065);
          ctx.strokeRect(px + cell * 0.18, py + cell * 0.18, cell * 0.64, cell * 0.64);
          ctx.fillStyle = 'rgba(255,214,74,.12)';
          ctx.fillRect(px + cell * 0.20, py + cell * 0.20, cell * 0.60, cell * 0.60);
          ctx.fillStyle = '#ffd64a';
          ctx.beginPath();
          ctx.moveTo(px + cell * 0.50, py + cell * 0.27);
          ctx.lineTo(px + cell * 0.70, py + cell * 0.62);
          ctx.lineTo(px + cell * 0.30, py + cell * 0.62);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,214,74,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    cacheRef.current = cache;
  }, []);

  const finishDash = useCallback(
    (kind: ActorKind, plan: DashPlan, generation: number) => {
      if (generation !== generationRef.current || phaseRef.current !== 'playing') return;

      const arena = arenaRef.current;
      const actor = kind === 'player' ? playerActorRef.current : rivalActorRef.current;
      actor.moving = false;
      actor.cell = { ...plan.destination };
      actor.from = { ...plan.destination };
      actor.to = { ...plan.destination };

      if (kind === 'player') setIsMoving(false);

      const coins = kind === 'player' ? playerCoinsRef.current : rivalCoinsRef.current;
      const treasures = kind === 'player' ? playerTreasuresRef.current : rivalTreasuresRef.current;
      let coinGain = 0;

      const safeCells = plan.fatal ? plan.cells.slice(0, -1) : plan.cells;
      for (const cell of safeCells) {
        const key = keyOf(cell);
        if (arena.coins.has(key) && !coins.has(key)) {
          coins.add(key);
          coinGain += 1;
        }
      }

      if (coinGain > 0) {
        updateScore(kind, coinGain);
        if (kind === 'player') {
          setPlayerCoinCount(coins.size);
          spawnParticles(plan.destination, 'coin', Math.min(8, 2 + coinGain));
        }
      }

      if (!plan.fatal) {
        const destinationKey = keyOf(plan.destination);
        if (arena.treasures.has(destinationKey) && !treasures.has(destinationKey)) {
          treasures.add(destinationKey);
          updateScore(kind, 8);
          if (kind === 'player') {
            setPlayerTreasureCount(treasures.size);
            setMessage('PERFECT STOP +8');
            spawnParticles(plan.destination, 'coin', 10);
          }
        }
      }

      if (plan.fatal) {
        updateScore(kind, -4);
        spawnParticles(plan.destination, 'danger', 10);
        if (kind === 'player') setMessage('SPIKES -4');

        const respawnTimer = window.setTimeout(() => {
          if (generation !== generationRef.current || phaseRef.current !== 'playing') return;
          actor.cell = { ...arena.start };
          actor.from = { ...arena.start };
          actor.to = { ...arena.start };
          actor.moving = false;
          if (kind === 'player') setMessage('SWIPE TO DASH');
        }, 160);
        finishTimersRef.current.push(respawnTimer);
        return;
      }

      if (plan.reachedGoal) {
        const goalRef = kind === 'player' ? playerGoalRef : rivalGoalRef;
        if (!goalRef.current) {
          goalRef.current = true;
          updateScore(kind, 20);
          spawnParticles(plan.destination, 'impact', 14);
          if (kind === 'player') setMessage('EXIT +20');
        }
      } else if (kind === 'player' && coinGain >= 4) {
        setMessage(`COINS +${coinGain}`);
      } else if (kind === 'player' && !arena.treasures.has(keyOf(plan.destination))) {
        setMessage('FIND THE GOLD');
      }

      spawnParticles(plan.destination, 'impact', 4);
    },
    [spawnParticles, updateScore],
  );

  const startDash = useCallback(
    (kind: ActorKind, dir: Dir) => {
      if (phaseRef.current !== 'playing') return false;

      const actor = kind === 'player' ? playerActorRef.current : rivalActorRef.current;
      if (actor.moving) return false;

      const plan = buildDashPlan(arenaRef.current, actor.cell, dir);
      if (!plan) return false;

      const generation = generationRef.current;
      const duration = dashDuration(plan.cells.length);
      actor.from = { ...actor.cell };
      actor.to = { ...plan.destination };
      actor.moving = true;
      actor.startedAt = performance.now();
      actor.duration = duration;
      actor.generation = generation;

      if (kind === 'player') {
        setIsMoving(true);
        setMessage('DASH');
      }

      const timer = window.setTimeout(() => finishDash(kind, plan, generation), duration);
      finishTimersRef.current.push(timer);
      return true;
    },
    [finishDash],
  );

  const dash = useCallback(
    (dir: Dir) => {
      startDash('player', dir);
    },
    [startDash],
  );

  const scheduleBot = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    const delay = 350 + Math.random() * 330;
    botTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'playing') return;

      const direction = pickBotDirection(
        arenaRef.current,
        rivalActorRef.current,
        rivalCoinsRef.current,
        rivalTreasuresRef.current,
        rivalGoalRef.current,
      );

      const started = startDash('rival', direction);
      const nextDelay = started ? 420 : 160;
      botTimerRef.current = window.setTimeout(scheduleBot, nextDelay + Math.random() * 180);
    }, delay);
  }, [startDash]);

  const resetRound = useCallback(
    (newArena: boolean) => {
      generationRef.current += 1;
      clearFinishTimers();
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);

      if (newArena) {
        const previous = variantRef.current;
        const shift = 1 + Math.floor(Math.random() * (VARIANT_STOPPERS.length - 1));
        variantRef.current = (previous + shift) % VARIANT_STOPPERS.length;
        arenaRef.current = buildArena(variantRef.current);
        setArenaNumber(arenaRef.current.variant + 1);
      }

      playerActorRef.current = createActor(arenaRef.current.start);
      rivalActorRef.current = createActor(arenaRef.current.start);
      playerCoinsRef.current = new Set();
      rivalCoinsRef.current = new Set();
      playerTreasuresRef.current = new Set();
      rivalTreasuresRef.current = new Set();
      playerGoalRef.current = false;
      rivalGoalRef.current = false;
      playerScoreRef.current = 0;
      rivalScoreRef.current = 0;
      particlesRef.current = [];

      setPlayerScore(0);
      setRivalScore(0);
      setPlayerTreasureCount(0);
      setPlayerCoinCount(0);
      setIsMoving(false);
      setMessage('SWIPE TO DASH');
      setTimeLeft(ROUND_SECONDS);
      setCountdown(3);
      setShowResult(false);
      phaseRef.current = 'countdown';
      setPhase('countdown');

      window.requestAnimationFrame(rebuildTerrainCache);
    },
    [clearFinishTimers, rebuildTerrainCache],
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'countdown') return;

    const interval = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          phaseRef.current = 'playing';
          setPhase('playing');
          setMessage('GO!');
          window.setTimeout(() => {
            if (phaseRef.current === 'playing') setMessage('SWIPE TO DASH');
          }, 520);
          window.setTimeout(scheduleBot, 420);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase, scheduleBot]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const interval = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          phaseRef.current = 'finished';
          setPhase('finished');
          if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
          window.setTimeout(() => setShowResult(true), 220);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const map: Partial<Record<string, Dir>> = {
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
      };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      dash(direction);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dash]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      rebuildTerrainCache();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [rebuildTerrainCache]);

  useEffect(() => {
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;
      const layout = layoutRef.current;
      const arena = arenaRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      if (cacheRef.current) ctx.drawImage(cacheRef.current, 0, 0, viewW, viewH);

      const cellCenter = (cell: Vec) => ({
        x: layout.x + (cell.c + 0.5) * layout.cell,
        y: layout.y + (cell.r + 0.5) * layout.cell,
      });

      for (const key of arena.coins) {
        if (playerCoinsRef.current.has(key)) continue;
        const [r, c] = key.split(':').map(Number);
        const pos = cellCenter({ r, c });
        ctx.fillStyle = '#ffe063';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(1.6, layout.cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
      }

      const treasurePulse = 0.92 + Math.sin(now * 0.006) * 0.06;
      for (const key of arena.treasures) {
        if (playerTreasuresRef.current.has(key)) continue;
        const [r, c] = key.split(':').map(Number);
        const pos = cellCenter({ r, c });
        const radius = layout.cell * 0.24 * treasurePulse;
        ctx.fillStyle = '#f6a93b';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff0a2';
        ctx.lineWidth = Math.max(1, layout.cell * 0.055);
        ctx.stroke();
        ctx.fillStyle = '#9b4b20';
        ctx.fillRect(pos.x - radius * 0.13, pos.y - radius * 0.52, radius * 0.26, radius * 1.04);
      }

      const drawActor = (actor: ActorMotion, rival: boolean) => {
        const posCell = actorPosition(actor, now);
        const pos = cellCenter(posCell);
        const size = layout.cell * (rival ? 0.58 : 0.64);

        if (actor.moving) {
          const start = cellCenter(actor.from);
          ctx.strokeStyle = rival ? 'rgba(255,96,127,.18)' : 'rgba(255,214,74,.20)';
          ctx.lineWidth = Math.max(2, layout.cell * 0.12);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = rival ? 0.38 : 1;
        ctx.fillStyle = rival ? '#ff607f' : '#ffd64a';
        ctx.strokeStyle = rival ? '#ffd0da' : '#fff2ad';
        ctx.lineWidth = Math.max(1.2, layout.cell * 0.065);
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.56);
        ctx.lineTo(size * 0.42, -size * 0.34);
        ctx.lineTo(size * 0.55, size * 0.12);
        ctx.lineTo(size * 0.32, size * 0.55);
        ctx.lineTo(-size * 0.32, size * 0.55);
        ctx.lineTo(-size * 0.55, size * 0.12);
        ctx.lineTo(-size * 0.42, -size * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (!rival) {
          ctx.fillStyle = '#2a1020';
          const eye = size * 0.11;
          ctx.fillRect(-size * 0.28, -size * 0.14, eye, eye);
          ctx.fillRect(size * 0.17, -size * 0.14, eye, eye);
          ctx.fillStyle = '#a55320';
          ctx.fillRect(-size * 0.13, size * 0.24, size * 0.26, size * 0.07);
        }
        ctx.restore();
      };

      drawActor(rivalActorRef.current, true);
      drawActor(playerActorRef.current, false);

      const particles = particlesRef.current;
      const dt = 1 / 60;
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life += dt;
        if (particle.life >= particle.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        particle.x += particle.vx * dt * 6;
        particle.y += particle.vy * dt * 6;
        particle.vx *= 0.94;
        particle.vy *= 0.94;

        const alpha = 1 - particle.life / particle.maxLife;
        const px = layout.x + particle.x * layout.cell;
        const py = layout.y + particle.y * layout.cell;
        ctx.globalAlpha = alpha;
        ctx.fillStyle =
          particle.kind === 'coin'
            ? '#ffd64a'
            : particle.kind === 'danger'
              ? '#ff5578'
              : '#e2d5bd';
        ctx.fillRect(px, py, Math.max(1, particle.size * layout.cell), Math.max(1, particle.size * layout.cell));
      }
      ctx.globalAlpha = 1;

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      clearFinishTimers();
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, [clearFinishTimers]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    touchRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || phaseRef.current !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) dash(dx > 0 ? 'right' : 'left');
    else dash(dy > 0 ? 'down' : 'up');
  };

  const youWon = playerScore > rivalScore;
  const draw = playerScore === rivalScore;
  const totalCoins = arenaRef.current.coins.size;
  const totalTreasures = arenaRef.current.treasures.size;

  return (
    <div className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#0c050b] text-white">
      <style>{`
        @keyframes td-count {
          0% { opacity: 0; transform: scale(.55); }
          38% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <header className="relative z-30 flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#0c050b] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[9px] border-2 border-[#ffd64a]/35 bg-[#291020] text-[10px] font-black text-[#ffd64a]">
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              initials(user?.tg_user)
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[92px] truncate text-[9px] font-black uppercase tracking-[.06em] text-white/90">
              {user?.tg_user || 'YOU'}
            </p>
            <p className="mt-1 text-[10px] font-black leading-none text-[#ffd64a]">
              {playerScore} <span className="text-[6px] text-white/30">PTS</span>
            </p>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-[6px] font-black uppercase tracking-[.22em] text-white/28">Tomb Dash</p>
          <div className="mt-1 min-w-[54px] border-x-2 border-[#5b183b] bg-[#180913] px-2 py-1 text-[14px] font-black text-[#fff0a1]">
            0:{String(timeLeft).padStart(2, '0')}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0">
            <p className="max-w-[92px] truncate text-[9px] font-black uppercase tracking-[.06em] text-white/90">
              RIVAL
            </p>
            <p className="mt-1 text-[10px] font-black leading-none text-[#ff607f]">
              {rivalScore} <span className="text-[6px] text-white/30">PTS</span>
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border-2 border-[#ff607f]/30 bg-[#291020] text-[9px] font-black text-[#ff607f]">
            R
          </div>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto min-h-0 w-full max-w-[430px] flex-1 touch-none overflow-hidden bg-[#09050a]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          touchRef.current = null;
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2">
          <div className="border-l-2 border-[#ffd64a]/35 bg-black/28 px-2 py-1 text-[6px] font-black uppercase tracking-[.12em] text-white/42">
            Coins <span className="text-[#ffd64a]">{playerCoinCount}/{totalCoins}</span>
          </div>
          <div className="border-r-2 border-[#f6a93b]/40 bg-black/28 px-2 py-1 text-right text-[6px] font-black uppercase tracking-[.12em] text-white/42">
            Gold <span className="text-[#f6a93b]">{playerTreasureCount}/{totalTreasures}</span>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
          <div
            className={[
              'border-x-2 px-3 py-1.5 text-center text-[7px] font-black uppercase tracking-[.14em]',
              isMoving
                ? 'border-[#ffd64a] bg-[#ffd64a]/10 text-[#ffe98d]'
                : 'border-white/10 bg-black/50 text-white/52',
            ].join(' ')}
          >
            {isMoving ? 'DASHING' : message}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-3 z-30 text-[6px] font-black uppercase tracking-[.12em] text-white/22">
          Arena {arenaNumber}
        </div>

        {phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#09050a]/90">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center border-2 border-[#ffd64a] bg-[#551533]">
                <span className="text-[17px] font-black text-[#ffd64a]">T</span>
              </div>
              <p className="mt-4 text-[7px] font-black uppercase tracking-[.24em] text-white/35">
                Read the room
              </p>
              <strong
                key={countdown}
                className="mt-1 block text-[52px] font-black leading-[1.1] text-[#ffd64a]"
                style={{ animation: 'td-count .38s ease-out both' }}
              >
                {countdown}
              </strong>
              <p className="mt-2 text-[7px] font-black uppercase tracking-[.12em] text-white/28">
                Swipe · Stop · Collect
              </p>
            </div>
          </div>
        )}
      </div>

      {showResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/76 px-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[324px] border-2 border-[#5b183b] bg-[#130811] p-5 text-center shadow-[0_28px_80px_rgba(0,0,0,.62)]">
            <div
              className={[
                'mx-auto grid h-14 w-14 place-items-center border-2',
                draw
                  ? 'border-white/35 bg-white/10 text-white'
                  : youWon
                    ? 'border-[#ffd64a] bg-[#5b183b] text-[#ffd64a]'
                    : 'border-[#ff607f] bg-[#4b122a] text-[#ff8ca3]',
              ].join(' ')}
            >
              <span className="text-[17px] font-black">{draw ? '=' : youWon ? 'W' : 'L'}</span>
            </div>

            <p className="mt-4 text-[7px] font-black uppercase tracking-[.22em] text-white/28">Tomb Dash Duel</p>
            <h2 className="mt-1 text-[23px] font-black text-white">
              {draw ? 'НИЧЬЯ' : youWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border border-[#ffd64a]/15 bg-[#ffd64a]/[.055] p-3">
                <span className="text-[6px] font-black uppercase tracking-[.14em] text-white/28">You</span>
                <strong className="mt-1 block text-[19px] font-black text-[#ffd64a]">{playerScore}</strong>
              </div>
              <div className="border border-[#ff607f]/15 bg-[#ff607f]/[.055] p-3">
                <span className="text-[6px] font-black uppercase tracking-[.14em] text-white/28">Rival</span>
                <strong className="mt-1 block text-[19px] font-black text-[#ff607f]">{rivalScore}</strong>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-y border-white/[0.06] py-2 text-[6px] font-black uppercase tracking-[.12em] text-white/28">
              <span>Gold stops</span>
              <strong className="text-[8px] text-[#f6a93b]">{playerTreasureCount}/{totalTreasures}</strong>
            </div>

            <button
              type="button"
              onClick={() => resetRound(true)}
              className="mt-4 w-full bg-[#ffd64a] px-4 py-3 text-[9px] font-black uppercase tracking-[.1em] text-[#210d19] active:scale-[.985]"
            >
              НОВАЯ КАРТА
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 w-full border border-white/10 bg-white/[.035] px-4 py-3 text-[8px] font-black uppercase tracking-[.1em] text-white/50 active:scale-[.985]"
            >
              НА ГЛАВНУЮ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
