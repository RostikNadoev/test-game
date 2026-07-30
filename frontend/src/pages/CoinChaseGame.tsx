import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useCoinChaseOnline } from '../hooks/useCoinChaseOnline';
import { useAuth } from '../auth/useAuth';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';

type Dir = 'up' | 'down' | 'left' | 'right';
type Phase = 'waiting' | 'countdown' | 'playing' | 'finished';
type Cell = { r: number; c: number };

type Maze = {
  seed: number;
  rows: number;
  cols: number;
  walls: boolean[][];
  start: Cell;
  monsterStarts: Cell[];
  coins: Set<string>;
  totalCoins: number;
};

type Mover = {
  cell: Cell;
  next: Cell;
  x: number;
  y: number;
  progress: number;
  dir: Dir | null;
  desiredDir: Dir | null;
  speed: number;
};

type Monster = Mover & {
  id: number;
  kind: 'hunter' | 'ambusher' | 'wanderer';
  color: string;
  lastCell: Cell;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type BoardLayout = {
  cell: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const ROWS = 21;
const COLS = 17;
const DPR_CAP = 1.5;
const PLAYER_SPEED = 5.45;
const MONSTER_SPEED = 3.75;
const START_COUNTDOWN = 3;
const MATCH_SECONDS = 60;
const MONSTER_HIT_COIN_PENALTY = 6;
const RESPAWN_INVULNERABLE_MS = 1250;
const RESPAWN_MIN_MONSTER_DISTANCE = 6;

const DIRS: Record<Dir, Cell> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const MONSTER_COLORS = ['#ff4f7b', '#55d8ff', '#9b7cff'];

const keyOf = (cell: Cell) => `${cell.r}:${cell.c}`;
const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const initials = (name?: string) => {
  const value = name?.replace(/^@/, '').trim();
  return value ? value.slice(0, 2).toUpperCase() : 'TG';
};

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function inside(rows: number, cols: number, r: number, c: number) {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

function isWall(maze: Maze, r: number, c: number) {
  return !inside(maze.rows, maze.cols, r, c) || maze.walls[r][c];
}

function canMove(maze: Maze, cell: Cell, dir: Dir) {
  const delta = DIRS[dir];
  return !isWall(maze, cell.r + delta.r, cell.c + delta.c);
}

function nextCell(cell: Cell, dir: Dir): Cell {
  const delta = DIRS[dir];
  return { r: cell.r + delta.r, c: cell.c + delta.c };
}

function floorCells(maze: Maze) {
  const result: Cell[] = [];
  for (let r = 1; r < maze.rows - 1; r += 1) {
    for (let c = 1; c < maze.cols - 1; c += 1) {
      if (!maze.walls[r][c]) result.push({ r, c });
    }
  }
  return result;
}

function manhattan(a: Cell, b: Cell) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function generateMaze(seed: number): Maze {
  const random = mulberry32(seed);
  const walls = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => true),
  );

  const startNode: Cell = { r: ROWS - 2, c: 1 };
  walls[startNode.r][startNode.c] = false;

  const stack: Cell[] = [startNode];
  const carveDirections: Cell[] = [
    { r: -2, c: 0 },
    { r: 2, c: 0 },
    { r: 0, c: -2 },
    { r: 0, c: 2 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const options = shuffle(carveDirections, random).filter((delta) => {
      const nr = current.r + delta.r;
      const nc = current.c + delta.c;
      return (
        nr > 0 &&
        nc > 0 &&
        nr < ROWS - 1 &&
        nc < COLS - 1 &&
        walls[nr][nc]
      );
    });

    if (!options.length) {
      stack.pop();
      continue;
    }

    const delta = options[0];
    const next = { r: current.r + delta.r, c: current.c + delta.c };
    walls[current.r + delta.r / 2][current.c + delta.c / 2] = false;
    walls[next.r][next.c] = false;
    stack.push(next);
  }

  // Open extra passages so the board feels like an arcade maze instead of a tight labyrinth.
  const candidates: Cell[] = [];
  for (let r = 1; r < ROWS - 1; r += 1) {
    for (let c = 1; c < COLS - 1; c += 1) {
      if (!walls[r][c]) continue;

      const horizontal =
        !walls[r][c - 1] &&
        !walls[r][c + 1] &&
        walls[r - 1][c] &&
        walls[r + 1][c];
      const vertical =
        !walls[r - 1][c] &&
        !walls[r + 1][c] &&
        walls[r][c - 1] &&
        walls[r][c + 1];

      if (horizontal || vertical) candidates.push({ r, c });
    }
  }

  const extraOpenings = Math.min(
    candidates.length,
    17 + Math.floor(random() * 9),
  );
  for (const cell of shuffle(candidates, random).slice(0, extraOpenings)) {
    walls[cell.r][cell.c] = false;
  }

  // Small open rooms make route choice more interesting and reduce repetitive corridors.
  const roomAnchors = shuffle(
    [
      { r: 3, c: 3 },
      { r: 3, c: COLS - 5 },
      { r: 9, c: 3 },
      { r: 9, c: COLS - 5 },
      { r: ROWS - 6, c: 3 },
      { r: ROWS - 6, c: COLS - 5 },
      { r: 9, c: 7 },
    ],
    random,
  ).slice(0, 3);

  for (const anchor of roomAnchors) {
    for (let rr = anchor.r; rr <= anchor.r + 2; rr += 1) {
      for (let cc = anchor.c; cc <= anchor.c + 2; cc += 1) {
        if (rr > 0 && cc > 0 && rr < ROWS - 1 && cc < COLS - 1) {
          walls[rr][cc] = false;
        }
      }
    }
  }

  // Keep the outer frame fully closed.
  for (let r = 0; r < ROWS; r += 1) {
    walls[r][0] = true;
    walls[r][COLS - 1] = true;
  }
  for (let c = 0; c < COLS; c += 1) {
    walls[0][c] = true;
    walls[ROWS - 1][c] = true;
  }

  const start = { r: ROWS - 2, c: 1 };
  walls[start.r][start.c] = false;
  walls[start.r][start.c + 1] = false;
  walls[start.r - 1][start.c] = false;

  const open: Cell[] = [];
  for (let r = 1; r < ROWS - 1; r += 1) {
    for (let c = 1; c < COLS - 1; c += 1) {
      if (!walls[r][c]) open.push({ r, c });
    }
  }

  const farCells = [...open]
    .filter((cell) => manhattan(cell, start) >= 13)
    .sort((a, b) => manhattan(b, start) - manhattan(a, start));

  const monsterStarts: Cell[] = [];
  for (const candidate of farCells) {
    if (
      monsterStarts.every((spawn) => manhattan(spawn, candidate) >= 7) &&
      monsterStarts.length < 3
    ) {
      monsterStarts.push(candidate);
    }
  }

  while (monsterStarts.length < 3) {
    const fallback =
      farCells[monsterStarts.length] ??
      open[Math.max(0, open.length - 1 - monsterStarts.length)] ??
      start;
    monsterStarts.push({ ...fallback });
  }

  const coins = new Set<string>();
  for (const cell of open) {
    if (sameCell(cell, start)) continue;
    if (monsterStarts.some((monsterStart) => sameCell(monsterStart, cell))) continue;
    coins.add(keyOf(cell));
  }

  return {
    seed,
    rows: ROWS,
    cols: COLS,
    walls,
    start,
    monsterStarts,
    coins,
    totalCoins: coins.size,
  };
}

function createMover(cell: Cell, speed: number): Mover {
  return {
    cell: { ...cell },
    next: { ...cell },
    x: cell.c + 0.5,
    y: cell.r + 0.5,
    progress: 0,
    dir: null,
    desiredDir: null,
    speed,
  };
}

function createMonsters(maze: Maze): Monster[] {
  return maze.monsterStarts.map((cell, index) => ({
    ...createMover(cell, MONSTER_SPEED + index * 0.08),
    id: index,
    kind: index === 0 ? 'hunter' : index === 1 ? 'ambusher' : 'wanderer',
    color: MONSTER_COLORS[index % MONSTER_COLORS.length],
    lastCell: { ...cell },
  }));
}

function availableDirections(
  maze: Maze,
  cell: Cell,
  currentDir: Dir | null,
): Dir[] {
  const directions = (Object.keys(DIRS) as Dir[]).filter((dir) =>
    canMove(maze, cell, dir),
  );
  if (!currentDir || directions.length <= 1) return directions;

  const reverse = OPPOSITE[currentDir];
  const withoutReverse = directions.filter((dir) => dir !== reverse);
  return withoutReverse.length ? withoutReverse : directions;
}

function projectedPlayerCell(player: Mover, tilesAhead: number) {
  if (!player.dir) return player.cell;
  const delta = DIRS[player.dir];
  return {
    r: player.cell.r + delta.r * tilesAhead,
    c: player.cell.c + delta.c * tilesAhead,
  };
}

function chooseMonsterDirection(
  maze: Maze,
  monster: Monster,
  player: Mover,
  random: () => number,
): Dir | null {
  const options = availableDirections(maze, monster.cell, monster.dir);
  if (!options.length) return null;

  if (monster.kind === 'wanderer' && random() < 0.72) {
    return options[Math.floor(random() * options.length)];
  }

  const target =
    monster.kind === 'ambusher'
      ? projectedPlayerCell(player, 3)
      : player.cell;

  let bestDir = options[0];
  let bestScore = Infinity;

  for (const dir of options) {
    const candidate = nextCell(monster.cell, dir);
    let score = manhattan(candidate, target);

    if (monster.kind === 'wanderer') score += random() * 4;
    if (monster.kind === 'ambusher') score += random() * 0.65;
    if (monster.kind === 'hunter') score += random() * 0.18;

    if (score < bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestDir;
}

function beginSegment(mover: Mover, maze: Maze, dir: Dir | null) {
  if (!dir || !canMove(maze, mover.cell, dir)) {
    mover.dir = null;
    mover.next = { ...mover.cell };
    mover.progress = 0;
    mover.x = mover.cell.c + 0.5;
    mover.y = mover.cell.r + 0.5;
    return false;
  }

  mover.dir = dir;
  mover.next = nextCell(mover.cell, dir);
  mover.progress = 0;
  return true;
}

function updateMover(
  mover: Mover,
  maze: Maze,
  dt: number,
  chooseDirection: () => Dir | null,
  onCellReached?: (cell: Cell) => void,
) {
  let remaining = mover.speed * dt;
  let guard = 0;

  while (remaining > 0.0001 && guard < 8) {
    guard += 1;

    if (sameCell(mover.cell, mover.next) || mover.progress >= 0.99999) {
      mover.cell = { ...mover.next };
      mover.progress = 0;
      mover.x = mover.cell.c + 0.5;
      mover.y = mover.cell.r + 0.5;
      onCellReached?.(mover.cell);

      const wanted = chooseDirection();
      if (!beginSegment(mover, maze, wanted)) break;
    }

    const distanceLeft = 1 - mover.progress;
    const step = Math.min(distanceLeft, remaining);
    mover.progress += step;
    remaining -= step;

    mover.x =
      mover.cell.c +
      0.5 +
      (mover.next.c - mover.cell.c) * mover.progress;
    mover.y =
      mover.cell.r +
      0.5 +
      (mover.next.r - mover.cell.r) * mover.progress;

    if (mover.progress >= 0.99999) {
      mover.cell = { ...mover.next };
      mover.progress = 1;
    }
  }
}

function pickSafeRespawn(
  maze: Maze,
  monsters: Monster[],
  random: () => number,
): Cell {
  const cells = floorCells(maze);
  let bestCells: Cell[] = [];
  let bestDistance = -Infinity;

  for (const cell of cells) {
    const edgeDistance = Math.min(
      cell.r,
      cell.c,
      maze.rows - 1 - cell.r,
      maze.cols - 1 - cell.c,
    );
    if (edgeDistance < 1) continue;

    let nearestMonster = Infinity;
    for (const monster of monsters) {
      const monsterCell = {
        r: Math.round(monster.y - 0.5),
        c: Math.round(monster.x - 0.5),
      };
      nearestMonster = Math.min(
        nearestMonster,
        manhattan(cell, monsterCell),
      );
    }

    if (nearestMonster > bestDistance) {
      bestDistance = nearestMonster;
      bestCells = [cell];
    } else if (nearestMonster === bestDistance) {
      bestCells.push(cell);
    }
  }

  const safe = bestCells.filter((cell) =>
    monsters.every((monster) => {
      const monsterCell = {
        r: Math.round(monster.y - 0.5),
        c: Math.round(monster.x - 0.5),
      };
      return manhattan(cell, monsterCell) >= RESPAWN_MIN_MONSTER_DISTANCE;
    }),
  );

  const pool = safe.length ? safe : bestCells.length ? bestCells : [maze.start];
  return { ...pool[Math.floor(random() * pool.length)] };
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function CoinChaseGame() {
  const match = useCoinChaseOnline();
  const { refreshBalance } = useAuth();
  const sendEvent = match.sendEvent;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<BoardLayout>({
    cell: 20,
    x: 0,
    y: 0,
    width: 340,
    height: 420,
  });
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number; fired: boolean } | null>(null);

  const [initialMaze] = useState(() => generateMaze(1));
  const seedRef = useRef(1);
  const randomRef = useRef(mulberry32(1 ^ 0x514f2a));
  const mazeRef = useRef<Maze>(initialMaze);
  const playerRef = useRef<Mover>(
    createMover(initialMaze.start, PLAYER_SPEED),
  );
  const monstersRef = useRef<Monster[]>(createMonsters(initialMaze));
  const coinsRef = useRef<Set<string>>(new Set(initialMaze.coins));
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef<'waiting' | 'countdown' | 'playing' | 'match_over'>(
    'waiting',
  );
  const scoreRef = useRef(0);
  const lostCoinsRef = useRef(0);
  const wavesRef = useRef(1);
  const deathsRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const hitFlashUntilRef = useRef(0);
  const penaltyTimerRef = useRef<number | null>(null);

  const [totalCoins, setTotalCoins] = useState(initialMaze.totalCoins);
  const [coinsLeft, setCoinsLeft] = useState(initialMaze.totalCoins);
  const [deaths, setDeaths] = useState(0);
  const [lostCoins, setLostCoins] = useState(0);
  const [lastLoss, setLastLoss] = useState(0);
  const [showPenalty, setShowPenalty] = useState(false);
  const [wave, setWave] = useState(1);
  const [mazeSeedLabel, setMazeSeedLabel] = useState('0001');

  const phase: Phase =
    match.phase === 'match_over'
      ? 'finished'
      : match.phase === 'playing'
        ? 'playing'
        : match.phase === 'waiting'
          ? 'waiting'
          : 'countdown';
  const countdown = Math.max(1, match.countdownLeft || START_COUNTDOWN);
  const timeLeft = Math.max(0, match.matchTimeLeft);
  const score = match.myScore;
  const opponentScore = match.opponentScore;
  const showResult = match.phase === 'match_over';

  const spawnParticles = useCallback(
    (x: number, y: number, color: string, count: number) => {
      const particles = particlesRef.current;
      for (let i = 0; i < count && particles.length < 48; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.55 + Math.random() * 1.35;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 0.22 + Math.random() * 0.24,
          size: 0.045 + Math.random() * 0.055,
          color,
        });
      }
    },
    [],
  );

  const collectCoin = useCallback(
    (cell: Cell) => {
      const key = keyOf(cell);
      if (!coinsRef.current.delete(key)) return;

      scoreRef.current += 1;
      setCoinsLeft(coinsRef.current.size);
      spawnParticles(cell.c + 0.5, cell.r + 0.5, '#ffd64a', 3);

      const objectId =
        wavesRef.current * 100_000 + cell.r * COLS + cell.c + 1;
      sendEvent({
        kind: 'coin',
        objectId,
      });

      // A very fast player should never run out of things to collect during
      // the fixed 60-second round. Refill the same map after a full clear.
      if (coinsRef.current.size === 0 && phaseRef.current === 'playing') {
        wavesRef.current += 1;
        setWave(wavesRef.current);
        coinsRef.current = new Set(mazeRef.current.coins);
        coinsRef.current.delete(key);
        setCoinsLeft(coinsRef.current.size);
      }
    },
    [phaseRef, sendEvent, spawnParticles],
  );

  const resetPlayerTo = useCallback((cell: Cell) => {
    const player = playerRef.current;
    player.cell = { ...cell };
    player.next = { ...cell };
    player.x = cell.c + 0.5;
    player.y = cell.r + 0.5;
    player.progress = 0;
    player.dir = null;
    player.desiredDir = null;
  }, []);

  const handleMonsterHit = useCallback(
    (now: number) => {
      if (
        phaseRef.current !== 'playing' ||
        now < invulnerableUntilRef.current
      ) {
        return;
      }

      deathsRef.current += 1;
      const lost = Math.min(MONSTER_HIT_COIN_PENALTY, scoreRef.current);
      scoreRef.current -= lost;
      lostCoinsRef.current += lost;

      setDeaths(deathsRef.current);
      setLostCoins(lostCoinsRef.current);
      setLastLoss(lost);

      sendEvent({ kind: 'caught' });

      spawnParticles(
        playerRef.current.x,
        playerRef.current.y,
        '#ff4f7b',
        14,
      );

      const respawn = pickSafeRespawn(
        mazeRef.current,
        monstersRef.current,
        randomRef.current,
      );
      resetPlayerTo(respawn);

      invulnerableUntilRef.current = now + RESPAWN_INVULNERABLE_MS;
      hitFlashUntilRef.current = now + 360;
      setShowPenalty(true);
      if (penaltyTimerRef.current !== null) {
        window.clearTimeout(penaltyTimerRef.current);
      }
      penaltyTimerRef.current = window.setTimeout(() => {
        setShowPenalty(false);
        penaltyTimerRef.current = null;
      }, 1050);
    },
    [phaseRef, resetPlayerTo, sendEvent, spawnParticles],
  );

  const rebuildStaticCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    if (!viewW || !viewH) return;

    const maze = mazeRef.current;
    const cell = Math.floor(
      Math.min(viewW / maze.cols, viewH / maze.rows) * 10,
    ) / 10;
    const width = cell * maze.cols;
    const height = cell * maze.rows;
    const x = (viewW - width) / 2;
    const y = (viewH - height) / 2;
    layoutRef.current = { cell, x, y, width, height };

    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.floor(viewW));
    cache.height = Math.max(1, Math.floor(viewH));
    const ctx = cache.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#080509';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = '#0d0710';
    ctx.fillRect(x, y, width, height);

    for (let r = 0; r < maze.rows; r += 1) {
      for (let c = 0; c < maze.cols; c += 1) {
        const px = x + c * cell;
        const py = y + r * cell;

        if (maze.walls[r][c]) {
          const boundary =
            r === 0 ||
            c === 0 ||
            r === maze.rows - 1 ||
            c === maze.cols - 1;

          ctx.fillStyle = boundary ? '#351025' : '#48132f';
          ctx.fillRect(px, py, cell, cell);

          ctx.fillStyle = boundary ? '#6d2049' : '#7e2553';
          ctx.fillRect(
            px + cell * 0.07,
            py + cell * 0.07,
            cell * 0.86,
            Math.max(1, cell * 0.105),
          );

          ctx.fillStyle = 'rgba(0,0,0,.23)';
          ctx.fillRect(
            px + cell * 0.78,
            py + cell * 0.18,
            Math.max(1, cell * 0.07),
            cell * 0.63,
          );

          if ((r * 7 + c * 5 + maze.seed) % 13 === 0) {
            ctx.fillStyle = 'rgba(255,214,74,.055)';
            ctx.fillRect(
              px + cell * 0.23,
              py + cell * 0.5,
              cell * 0.28,
              Math.max(1, cell * 0.055),
            );
          }
        } else {
          ctx.fillStyle =
            (r + c) % 2 === 0 ? '#0f0710' : '#0d060e';
          ctx.fillRect(px, py, cell, cell);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,214,74,.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    staticCanvasRef.current = cache;
  }, []);

  const resetFromSeed = useCallback(
    (seed: number) => {
      seedRef.current = Math.max(1, Math.floor(seed || 1));
      randomRef.current = mulberry32(seedRef.current ^ 0x514f2a);
      mazeRef.current = generateMaze(seedRef.current);
      setMazeSeedLabel(String(seedRef.current % 10000).padStart(4, '0'));

      playerRef.current = createMover(mazeRef.current.start, PLAYER_SPEED);
      monstersRef.current = createMonsters(mazeRef.current);
      coinsRef.current = new Set(mazeRef.current.coins);
      particlesRef.current = [];
      deathsRef.current = 0;
      scoreRef.current = 0;
      lostCoinsRef.current = 0;
      wavesRef.current = 1;
      invulnerableUntilRef.current = 0;
      hitFlashUntilRef.current = 0;

      setTotalCoins(mazeRef.current.totalCoins);
      setCoinsLeft(mazeRef.current.totalCoins);
      setDeaths(0);
      setLostCoins(0);
      setLastLoss(0);
      setShowPenalty(false);
      if (penaltyTimerRef.current !== null) {
        window.clearTimeout(penaltyTimerRef.current);
        penaltyTimerRef.current = null;
      }
      setWave(1);

      window.requestAnimationFrame(rebuildStaticCanvas);
    },
    [rebuildStaticCanvas],
  );

  useEffect(() => {
    phaseRef.current = match.phase;
  }, [match.phase]);

  useEffect(() => {
    if (match.phase !== 'countdown') return;
    resetFromSeed(match.seed);
  }, [match.matchInstanceKey, match.phase, match.seed, resetFromSeed]);

  useEffect(() => {
    scoreRef.current = match.myScore;
  }, [match.myScore]);

  useEffect(() => {
    if (match.phase !== 'match_over') return;

    const first = window.setTimeout(() => void refreshBalance(), 450);
    const second = window.setTimeout(() => void refreshBalance(), 1300);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [match.phase, refreshBalance]);

  const setDirection = useCallback((dir: Dir) => {
    if (phaseRef.current !== 'playing') return;

    const player = playerRef.current;
    player.desiredDir = dir;

    // Reversing direction should feel instant instead of waiting for the
    // next tile centre.
    if (
      player.dir &&
      OPPOSITE[player.dir] === dir &&
      !sameCell(player.cell, player.next)
    ) {
      const oldCell = { ...player.cell };
      player.cell = { ...player.next };
      player.next = oldCell;
      player.progress = 1 - player.progress;
      player.dir = dir;
      return;
    }

    // If standing still, start moving on the same input frame.
    if (!player.dir && canMove(mazeRef.current, player.cell, dir)) {
      beginSegment(player, mazeRef.current, dir);
    }
  }, [phaseRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const map: Partial<Record<string, Dir>> = {
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
      };

      const dir = map[event.key];
      if (!dir) return;
      event.preventDefault();
      setDirection(dir);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setDirection]);

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
      rebuildStaticCanvas();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [rebuildStaticCanvas]);

  useEffect(() => {
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }

      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = Math.min(0.033, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;

      const maze = mazeRef.current;
      const player = playerRef.current;
      const monsters = monstersRef.current;

      if (phaseRef.current === 'playing') {
        updateMover(
          player,
          maze,
          dt,
          () => {
            const desired = player.desiredDir;
            if (desired && canMove(maze, player.cell, desired)) {
              return desired;
            }
            if (player.dir && canMove(maze, player.cell, player.dir)) {
              return player.dir;
            }
            return null;
          },
          collectCoin,
        );

        for (const monster of monsters) {
          updateMover(
            monster,
            maze,
            dt,
            () =>
              chooseMonsterDirection(
                maze,
                monster,
                player,
                randomRef.current,
              ),
            (cell) => {
              monster.lastCell = { ...cell };
            },
          );
        }

        if (now >= invulnerableUntilRef.current) {
          for (const monster of monsters) {
            const distance = Math.hypot(
              player.x - monster.x,
              player.y - monster.y,
            );
            if (distance < 0.52) {
              handleMonsterHit(now);
              break;
            }
          }
        }

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

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      if (staticCanvasRef.current) {
        ctx.drawImage(staticCanvasRef.current, 0, 0, viewW, viewH);
      }

      const cellCenter = (r: number, c: number) => ({
        x: layout.x + (c + 0.5) * layout.cell,
        y: layout.y + (r + 0.5) * layout.cell,
      });

      // Coins.
      ctx.fillStyle = '#ffd64a';
      for (const key of coinsRef.current) {
        const [r, c] = key.split(':').map(Number);
        const pos = cellCenter(r, c);
        ctx.beginPath();
        ctx.arc(
          pos.x,
          pos.y,
          Math.max(1.4, layout.cell * 0.075),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      // Monsters.
      for (const monster of monsters) {
        const x = layout.x + monster.x * layout.cell;
        const y = layout.y + monster.y * layout.cell;
        const size = layout.cell * 0.67;

        ctx.save();
        ctx.translate(x, y);

        ctx.fillStyle = monster.color;
        ctx.beginPath();
        ctx.arc(0, -size * 0.07, size * 0.45, Math.PI, 0);
        ctx.lineTo(size * 0.45, size * 0.33);
        ctx.lineTo(size * 0.22, size * 0.18);
        ctx.lineTo(0, size * 0.35);
        ctx.lineTo(-size * 0.22, size * 0.18);
        ctx.lineTo(-size * 0.45, size * 0.33);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff6df';
        ctx.beginPath();
        ctx.arc(-size * 0.17, -size * 0.1, size * 0.11, 0, Math.PI * 2);
        ctx.arc(size * 0.17, -size * 0.1, size * 0.11, 0, Math.PI * 2);
        ctx.fill();

        const look = monster.dir ? DIRS[monster.dir] : { r: 0, c: 0 };
        ctx.fillStyle = '#28101d';
        ctx.beginPath();
        ctx.arc(
          -size * 0.17 + look.c * size * 0.035,
          -size * 0.1 + look.r * size * 0.035,
          size * 0.045,
          0,
          Math.PI * 2,
        );
        ctx.arc(
          size * 0.17 + look.c * size * 0.035,
          -size * 0.1 + look.r * size * 0.035,
          size * 0.045,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        ctx.restore();
      }

      // Player.
      {
        const x = layout.x + player.x * layout.cell;
        const y = layout.y + player.y * layout.cell;
        const radius = layout.cell * 0.33;
        const blink =
          now < invulnerableUntilRef.current &&
          Math.floor(now / 90) % 2 === 0;

        if (!blink) {
          const direction = player.dir ?? player.desiredDir ?? 'right';
          const angle =
            direction === 'right'
              ? 0
              : direction === 'down'
                ? Math.PI / 2
                : direction === 'left'
                  ? Math.PI
                  : -Math.PI / 2;
          const mouth =
            0.22 +
            Math.abs(Math.sin(now * 0.014)) * 0.18;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.fillStyle = '#ffd64a';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(
            0,
            0,
            radius,
            mouth * Math.PI,
            (2 - mouth) * Math.PI,
          );
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#2a1020';
          ctx.beginPath();
          ctx.arc(
            radius * 0.08,
            -radius * 0.52,
            Math.max(1, radius * 0.09),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.restore();
        }
      }

      // Particles.
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life += dt;

        if (particle.life >= particle.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        particle.x += particle.vx * dt * 3.5;
        particle.y += particle.vy * dt * 3.5;
        particle.vx *= Math.pow(0.12, dt);
        particle.vy *= Math.pow(0.12, dt);

        const alpha = 1 - particle.life / particle.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          layout.x + particle.x * layout.cell,
          layout.y + particle.y * layout.cell,
          Math.max(1, particle.size * layout.cell),
          Math.max(1, particle.size * layout.cell),
        );
      }
      ctx.globalAlpha = 1;

      if (now < hitFlashUntilRef.current) {
        const alpha =
          0.16 * (1 - (hitFlashUntilRef.current - now) / 360);
        ctx.fillStyle = `rgba(255,96,127,${Math.max(0.03, alpha)})`;
        ctx.fillRect(0, 0, viewW, viewH);
      }

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [collectCoin, handleMonsterHit, phaseRef]);

  const directionFromDelta = (dx: number, dy: number): Dir =>
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'down'
        : 'up';

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      fired: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerRef.current;
    if (!start || start.fired || phaseRef.current !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    // Recognize the swipe as soon as the finger clearly commits to a
    // direction. This removes the old "wait until finger-up" feeling.
    if (Math.hypot(dx, dy) < 5) return;

    start.fired = true;
    setDirection(directionFromDelta(dx, dy));
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerRef.current;
    pointerRef.current = null;

    if (!start || start.fired || phaseRef.current !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 5) return;

    setDirection(directionFromDelta(dx, dy));
  };

  useEffect(() => {
    return () => {
      if (penaltyTimerRef.current !== null) {
        window.clearTimeout(penaltyTimerRef.current);
      }
    };
  }, []);

  const boardCollected = totalCoins - coinsLeft;
  const progress =
    totalCoins > 0 ? clamp((boardCollected / totalCoins) * 100, 0, 100) : 0;

  const isDraw = match.draw;
  const didWin = !isDraw && match.winnerUserId === match.myUserId;
  const winnerProfile = didWin ? match.playerProfile : match.opponentProfile;
  const loserProfile = didWin ? match.opponentProfile : match.playerProfile;
  const winnerScore = didWin ? score : opponentScore;
  const loserScore = didWin ? opponentScore : score;
  const displayedReward = didWin
    ? Math.max(0, match.serverState?.winner_profit ?? 0)
    : 0;
  const formatReward = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#0b050a] text-white"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
      }}
    >
      <style>{`
        @keyframes cc-count {
          0% { opacity: 0; transform: scale(.58); }
          42% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes cc-penalty {
          0% { opacity: 0; transform: translate(-50%, 8px) scale(.92); }
          28% { opacity: 1; transform: translate(-50%, 0) scale(1.035); }
          100% { opacity: 0; transform: translate(-50%, -14px) scale(1); }
        }
        @keyframes cc-result {
          from { opacity: 0; transform: translateY(12px) scale(.965); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <header className="relative z-30 flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#0b050a] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border-2 border-[#ffd64a]/38 bg-[#291020] text-[10px] font-black uppercase leading-[1.35] text-[#ffd64a]">
            {match.playerProfile.photoUrl ? (
              <img
                src={match.playerProfile.photoUrl}
                alt={match.playerProfile.name}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              initials(match.playerProfile.name)
            )}
          </div>
          <div className="min-w-0 pt-[2px]">
            <p className="max-w-[92px] truncate py-[1px] text-[9px] font-black uppercase leading-[1.45] tracking-[.055em] text-white/90">
              {match.playerProfile.name || 'YOU'}
            </p>
            <p className="mt-[1px] py-[1px] text-[10px] font-black leading-[1.4] text-[#ffd64a]">
              {score}
              <span className="ml-1 text-[6px] text-white/30">PTS</span>
            </p>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 min-w-[88px] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.45] tracking-[.19em] text-white/28">
            Coin Chase
          </p>
          <div className="mt-[2px] border-x-2 border-[#5b183b] bg-[#180913] px-2 py-[5px] text-[14px] font-black leading-[1.25] tabular-nums text-[#fff0a1]">
            {formatTime(timeLeft)}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0 pt-[2px]">
            <p className="max-w-[92px] truncate py-[1px] text-[9px] font-black uppercase leading-[1.45] tracking-[.055em] text-white/78">
              {match.opponentProfile.name || 'RIVAL'}
            </p>
            <p className="mt-[1px] py-[1px] text-[10px] font-black leading-[1.4] text-[#9b7cff]">
              {opponentScore}
              <span className="ml-1 text-[6px] text-white/30">PTS</span>
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border-2 border-[#9b7cff]/35 bg-[#291020] text-[9px] font-black uppercase leading-[1.35] text-[#b7a5ff]">
            {match.opponentProfile.photoUrl ? (
              <img
                src={match.opponentProfile.photoUrl}
                alt={match.opponentProfile.name}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              initials(match.opponentProfile.name)
            )}
          </div>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto min-h-0 w-full max-w-[430px] flex-1 touch-none overflow-hidden bg-[#080509]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-2">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.055]">
            <div
              className="h-full rounded-full bg-[#ffd64a] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between py-[1px] text-[6px] font-black uppercase leading-[1.4] tracking-[.11em] text-white/28">
            <span>
              Board{' '}
              <b className="text-[#ffd64a]">
                {boardCollected}/{totalCoins}
              </b>
            </span>
            <span>
              Wave <b className="text-white/55">{wave}</b> · Map{' '}
              <b className="text-white/55">#{mazeSeedLabel}</b>
            </span>
          </div>
        </div>

        {phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 border-l-2 border-[#ff607f]/45 bg-black/35 px-2 py-[6px] text-[6px] font-black uppercase leading-[1.4] tracking-[.11em] text-white/38">
            Caught <strong className="text-[#ff8098]">{deaths}</strong>
            {lostCoins > 0 && (
              <span className="ml-2 text-[#ff8098]">-{lostCoins} pts</span>
            )}
          </div>
        )}

        {phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-30 py-[2px] text-right text-[6px] font-black uppercase leading-[1.4] tracking-[.11em] text-white/24">
            Swipe to turn
          </div>
        )}

        {phase === 'playing' && showPenalty && (
            <div
              key={`${deaths}-${lastLoss}`}
              className="pointer-events-none absolute left-1/2 top-[18%] z-40 border-x-2 border-[#ff607f] bg-[#250b19]/92 px-3 py-[9px] text-[9px] font-black uppercase leading-[1.4] tracking-[.12em] text-[#ff8ca3]"
              style={{ animation: 'cc-penalty 1.05s ease-out both' }}
            >
              CAUGHT -{lastLoss} PTS
            </div>
          )}

        {phase === 'waiting' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#080509]/92 px-6 text-center">
            <div>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/12 border-t-[#ffd64a]" />
              <p className="mt-4 py-1 text-[13px] font-black uppercase leading-[1.45] text-white">
                Ждём соперника
              </p>
              <p className="mt-1 py-1 text-[7px] font-black uppercase leading-[1.5] tracking-[.15em] text-white/30">
                Матч начнётся после подключения обоих игроков
              </p>
            </div>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#080509]/94">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center border-2 border-[#ffd64a] bg-[#551533]">
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-[#ffd64a]">
                  <div className="absolute right-[-2px] top-1/2 h-5 w-5 -translate-y-1/2 rotate-45 bg-[#551533]" />
                </div>
              </div>

              <p className="mt-4 py-[2px] text-[7px] font-black uppercase leading-[1.5] tracking-[.22em] text-white/35">
                Collect more in {MATCH_SECONDS} seconds
              </p>

              <strong
                key={countdown}
                className="mt-1 block min-h-[70px] overflow-visible px-3 pt-[5px] text-[52px] font-black leading-[1.28] text-[#ffd64a]"
                style={{ animation: 'cc-count .38s ease-out both' }}
              >
                {countdown}
              </strong>

              <p className="mt-1 py-[2px] text-[7px] font-black uppercase leading-[1.5] tracking-[.12em] text-white/28">
                Swipe · Collect · Survive
              </p>
            </div>
          </div>
        )}

        {match.socketError && phase !== 'finished' && (
          <div className="pointer-events-none absolute inset-x-4 bottom-12 z-[70] border border-[#ff607f]/20 bg-[#2a0b1c]/92 px-3 py-2 text-center text-[7px] font-black leading-[1.45] text-[#ff9bae]">
            {match.socketError}
          </div>
        )}
      </div>

      {showResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/76 px-4 backdrop-blur-[5px]">
          <div
            className="relative w-full max-w-[292px] overflow-hidden rounded-[22px] border-2 border-[#5b183b] bg-[#12070f]/[.99] px-3.5 pb-3.5 pt-4 text-center shadow-[0_24px_76px_rgba(0,0,0,.70),inset_0_1px_0_rgba(255,214,74,.05)]"
            style={{ animation: 'cc-result .28s ease-out both' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[74px] bg-[linear-gradient(180deg,rgba(126,37,83,.20),rgba(72,19,47,.05),transparent)]" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[64%] -translate-x-1/2 bg-[#ffd64a]/35" />
            <div className="pointer-events-none absolute -left-8 top-16 h-20 w-20 rounded-full bg-[#7e2553]/10 blur-2xl" />
            <div className="pointer-events-none absolute -right-8 top-10 h-16 w-16 rounded-full bg-[#ffd64a]/[.055] blur-2xl" />

            <div className="relative">
              <div className="mx-auto mb-1.5 flex w-fit items-center gap-1.5 rounded-full border border-[#7e2553]/45 bg-[#2a0c1d]/80 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ffd64a] shadow-[0_0_8px_rgba(255,214,74,.55)]" />
                <span className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.16em] text-white/38">
                  Coin Chase
                </span>
              </div>

              <h2
                className={[
                  'py-[3px] text-[20px] font-black uppercase leading-[1.38] tracking-[.015em]',
                  isDraw
                    ? 'text-white'
                    : didWin
                      ? 'text-[#ffd64a]'
                      : 'text-[#ff6686]',
                ].join(' ')}
              >
                {isDraw ? 'НИЧЬЯ' : didWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
              </h2>

              {isDraw ? (
                <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  {[
                    { profile: match.playerProfile, value: score },
                    { profile: match.opponentProfile, value: opponentScore },
                  ].map(({ profile, value }, index) => (
                    <div key={profile.id || index} className="min-w-0">
                      <div className="mx-auto grid h-[48px] w-[48px] place-items-center overflow-hidden rounded-[14px] border-2 border-[#5b183b] bg-[#28101d] text-[10px] font-black uppercase leading-[1.4] text-[#ffd64a]">
                        {profile.photoUrl ? (
                          <img
                            src={profile.photoUrl}
                            alt={profile.name}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          initials(profile.name)
                        )}
                      </div>
                      <div className="mt-1.5 truncate px-1 py-[1px] text-[6px] font-black leading-[1.5] text-white/48">
                        {profile.name}
                      </div>
                      <div className="mt-[1px] py-[1px] text-[16px] font-black leading-[1.4] tabular-nums text-[#ffd64a]">
                        {value}
                      </div>
                    </div>
                  ))}

                  <div className="pb-2 text-[6px] font-black uppercase leading-[1.4] tracking-[.13em] text-[#7e2553]">
                    VS
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 grid grid-cols-[1.08fr_auto_.9fr] items-end gap-2">
                  <div className="min-w-0">
                    <div className="relative mx-auto w-fit">
                      <div className="absolute -inset-1.5 rounded-[18px] bg-[#ffd64a]/10 blur-md" />
                      <div className="relative grid h-[62px] w-[62px] place-items-center overflow-hidden rounded-[18px] border-2 border-[#ffd64a]/70 bg-[#28101d] text-[12px] font-black uppercase leading-[1.4] text-[#ffd64a] shadow-[0_8px_24px_rgba(255,214,74,.09)]">
                        {winnerProfile.photoUrl ? (
                          <img
                            src={winnerProfile.photoUrl}
                            alt={winnerProfile.name}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          initials(winnerProfile.name)
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 truncate px-1 py-[1px] text-[6.5px] font-black leading-[1.5] text-[#ffd64a]">
                      {winnerProfile.name}
                    </div>
                    <div className="mt-[1px] py-[1px] text-[19px] font-black leading-[1.38] tabular-nums text-white">
                      {winnerScore}
                    </div>
                  </div>

                  <div className="pb-7 text-[6px] font-black uppercase leading-[1.4] tracking-[.13em] text-[#7e2553]">
                    VS
                  </div>

                  <div className="min-w-0 pb-[2px]">
                    <div className="mx-auto grid h-[46px] w-[46px] place-items-center overflow-hidden rounded-[14px] border border-[#7e2553]/55 bg-[#28101d] text-[9px] font-black uppercase leading-[1.4] text-white/48">
                      {loserProfile.photoUrl ? (
                        <img
                          src={loserProfile.photoUrl}
                          alt={loserProfile.name}
                          className="h-full w-full object-cover opacity-75"
                          draggable={false}
                        />
                      ) : (
                        initials(loserProfile.name)
                      )}
                    </div>

                    <div className="mt-1.5 truncate px-1 py-[1px] text-[5.5px] font-black leading-[1.5] text-white/34">
                      {loserProfile.name}
                    </div>
                    <div className="mt-[1px] py-[1px] text-[15px] font-black leading-[1.4] tabular-nums text-white/46">
                      {loserScore}
                    </div>
                  </div>
                </div>
              )}

              <div className="my-2.5 h-px bg-[#5b183b]/60" />

              <div className="flex items-center justify-between gap-2">
                <div className="game-result-reward min-w-0 flex-1 text-left">
                  <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.12em] text-white/26">
                    Чистый выигрыш
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={[
                        'py-[1px] text-[17px] font-black leading-[1.4] tabular-nums',
                        didWin ? 'text-[#ffd64a]' : 'text-white/38',
                      ].join(' ')}
                    >
                      {didWin ? `+${formatReward(displayedReward)}` : '0'}
                    </span>
                    <img
                      src={coinIcon}
                      alt="GAME"
                      className="h-[18px] w-[18px] object-contain"
                      draggable={false}
                    />
                  </div>
                </div>

                <div className="h-8 w-px bg-[#5b183b]/65" />

                <div className="shrink-0 text-right">
                  <div className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.09em] text-white/24">
                    Caught <span className="text-[#ff6686]/80">{deaths}</span>
                  </div>
                  <div className="mt-[2px] py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.09em] text-white/24">
                    Lost <span className="text-[#ff6686]/80">{lostCoins}</span>
                  </div>
                  <div className="mt-[2px] py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.09em] text-white/24">
                    Wave <span className="text-[#ffd64a]/75">{wave}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={match.backToLobbies}
                className="mt-3 flex min-h-[43px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#7e2553]/65 bg-[linear-gradient(180deg,#5b183b_0%,#3d102b_100%)] px-3 py-2 text-[#ffd64a] shadow-[inset_0_1px_0_rgba(255,214,74,.08),0_8px_20px_rgba(0,0,0,.28)] transition duration-150 active:translate-y-[1px] active:scale-[0.985]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[14px] w-[14px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 12H5" />
                  <path d="m11 18-6-6 6-6" />
                </svg>

                <span className="pt-[1px] text-[7px] font-black uppercase leading-[1.5] tracking-[.12em]">
                  К ЛОББИ
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
