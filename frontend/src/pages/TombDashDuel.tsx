import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

type Dir = 'up' | 'down' | 'left' | 'right';
type Phase = 'countdown' | 'playing' | 'finished';
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
const PLAYER_SPEED = 5.15;
const MONSTER_SPEED = 3.75;
const START_COUNTDOWN = 3;
const DEATH_PENALTY_SECONDS = 7;
const RESPAWN_INVULNERABLE_MS = 1250;
const RESPAWN_MIN_MONSTER_DISTANCE = 6;
const HUD_SYNC_MS = 80;
const MAX_MATCH_SECONDS = 240;

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

const MONSTER_COLORS = ['#ff607f', '#69d9ff', '#f3a84a'];

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
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export default function TombDashDuel() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
  const lastHudSyncRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const seedRef = useRef(Math.floor(Math.random() * 2_000_000_000));
  const randomRef = useRef(mulberry32(seedRef.current ^ 0x514f2a));
  const mazeRef = useRef<Maze>(generateMaze(seedRef.current));
  const playerRef = useRef<Mover>(
    createMover(mazeRef.current.start, PLAYER_SPEED),
  );
  const monstersRef = useRef<Monster[]>(createMonsters(mazeRef.current));
  const coinsRef = useRef<Set<string>>(new Set(mazeRef.current.coins));
  const particlesRef = useRef<Particle[]>([]);
  const phaseRef = useRef<Phase>('countdown');
  const startedAtRef = useRef(0);
  const penaltySecondsRef = useRef(0);
  const finishedTimeRef = useRef(0);
  const deathsRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const hitFlashUntilRef = useRef(0);
  const respawnLabelUntilRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(START_COUNTDOWN);
  const [elapsed, setElapsed] = useState(0);
  const [coinsLeft, setCoinsLeft] = useState(mazeRef.current.totalCoins);
  const [deaths, setDeaths] = useState(0);
  const [penaltySeconds, setPenaltySeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [mazeSeedLabel, setMazeSeedLabel] = useState(
    String(seedRef.current % 10000).padStart(4, '0'),
  );

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

      setCoinsLeft(coinsRef.current.size);
      spawnParticles(cell.c + 0.5, cell.r + 0.5, '#ffd64a', 3);

      if (coinsRef.current.size === 0 && phaseRef.current === 'playing') {
        const now = performance.now();
        const baseSeconds = (now - startedAtRef.current) / 1000;
        finishedTimeRef.current = baseSeconds + penaltySecondsRef.current;
        phaseRef.current = 'finished';
        setPhase('finished');
        setElapsed(finishedTimeRef.current);
        window.setTimeout(() => setShowResult(true), 260);
      }
    },
    [spawnParticles],
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
      penaltySecondsRef.current += DEATH_PENALTY_SECONDS;
      setDeaths(deathsRef.current);
      setPenaltySeconds(penaltySecondsRef.current);

      spawnParticles(
        playerRef.current.x,
        playerRef.current.y,
        '#ff607f',
        14,
      );

      const respawn = pickSafeRespawn(
        mazeRef.current,
        monstersRef.current,
        randomRef.current,
      );
      resetPlayerTo(respawn);
      collectCoin(respawn);

      invulnerableUntilRef.current = now + RESPAWN_INVULNERABLE_MS;
      hitFlashUntilRef.current = now + 360;
      respawnLabelUntilRef.current = now + 1150;
    },
    [collectCoin, resetPlayerTo, spawnParticles],
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

  const resetGame = useCallback(
    (newMap: boolean) => {
      if (newMap) {
        seedRef.current = Math.floor(Math.random() * 2_000_000_000);
        randomRef.current = mulberry32(seedRef.current ^ 0x514f2a);
        mazeRef.current = generateMaze(seedRef.current);
        setMazeSeedLabel(String(seedRef.current % 10000).padStart(4, '0'));
      }

      playerRef.current = createMover(
        mazeRef.current.start,
        PLAYER_SPEED,
      );
      monstersRef.current = createMonsters(mazeRef.current);
      coinsRef.current = new Set(mazeRef.current.coins);
      particlesRef.current = [];
      deathsRef.current = 0;
      penaltySecondsRef.current = 0;
      finishedTimeRef.current = 0;
      invulnerableUntilRef.current = 0;
      hitFlashUntilRef.current = 0;
      respawnLabelUntilRef.current = 0;

      setElapsed(0);
      setCoinsLeft(mazeRef.current.totalCoins);
      setDeaths(0);
      setPenaltySeconds(0);
      setShowResult(false);
      setCountdown(START_COUNTDOWN);
      phaseRef.current = 'countdown';
      setPhase('countdown');

      window.requestAnimationFrame(rebuildStaticCanvas);
    },
    [rebuildStaticCanvas],
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
          startedAtRef.current = performance.now();
          phaseRef.current = 'playing';
          setPhase('playing');
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase]);

  const setDirection = useCallback((dir: Dir) => {
    if (phaseRef.current !== 'playing') return;
    playerRef.current.desiredDir = dir;
  }, []);

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

        const baseSeconds = (now - startedAtRef.current) / 1000;
        const displaySeconds = baseSeconds + penaltySecondsRef.current;

        if (
          now - lastHudSyncRef.current >= HUD_SYNC_MS ||
          displaySeconds >= MAX_MATCH_SECONDS
        ) {
          lastHudSyncRef.current = now;
          setElapsed(displaySeconds);

          if (displaySeconds >= MAX_MATCH_SECONDS) {
            finishedTimeRef.current = displaySeconds;
            phaseRef.current = 'finished';
            setPhase('finished');
            setShowResult(true);
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
  }, [collectCoin, handleMonsterHit]);

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerRef.current;
    pointerRef.current = null;

    if (!start || phaseRef.current !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < 14) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? 'right' : 'left');
    } else {
      setDirection(dy > 0 ? 'down' : 'up');
    }
  };

  const currentTime =
    phase === 'finished' && finishedTimeRef.current > 0
      ? finishedTimeRef.current
      : elapsed;

  const totalCoins = mazeRef.current.totalCoins;
  const collectedCoins = totalCoins - coinsLeft;
  const progress =
    totalCoins > 0 ? clamp((collectedCoins / totalCoins) * 100, 0, 100) : 0;

  return (
    <div className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#0b050a] text-white">
      <style>{`
        @keyframes tc-count {
          0% { opacity: 0; transform: scale(.55); }
          38% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes tc-penalty {
          0% { opacity: 0; transform: translate(-50%, 8px) scale(.9); }
          30% { opacity: 1; transform: translate(-50%, 0) scale(1.04); }
          100% { opacity: 0; transform: translate(-50%, -16px) scale(1); }
        }
      `}</style>

      <header className="relative z-30 flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#0b050a] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[9px] border-2 border-[#ffd64a]/35 bg-[#291020] text-[10px] font-black text-[#ffd64a]">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              initials(user?.tg_user)
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[92px] truncate text-[9px] font-black uppercase tracking-[.06em] text-white/90">
              {user?.tg_user || 'YOU'}
            </p>
            <p className="mt-1 text-[9px] font-black leading-none text-[#ffd64a]">
              {collectedCoins}
              <span className="ml-1 text-[6px] text-white/30">
                / {totalCoins}
              </span>
            </p>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-[6px] font-black uppercase tracking-[.2em] text-white/28">
            Tomb Chase
          </p>
          <div className="mt-1 min-w-[64px] border-x-2 border-[#5b183b] bg-[#180913] px-2 py-1 text-[13px] font-black text-[#fff0a1]">
            {formatTime(currentTime)}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0">
            <p className="max-w-[88px] truncate text-[9px] font-black uppercase tracking-[.06em] text-white/42">
              RIVAL
            </p>
            <p className="mt-1 text-[8px] font-black leading-none text-[#ff607f]/70">
              --:--
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border-2 border-[#ff607f]/20 bg-[#291020] text-[8px] font-black text-[#ff607f]/55">
            R
          </div>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto min-h-0 w-full max-w-[430px] flex-1 touch-none overflow-hidden bg-[#080509]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-2">
          <div className="h-[3px] overflow-hidden bg-white/[0.055]">
            <div
              className="h-full bg-[#ffd64a] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[6px] font-black uppercase tracking-[.12em] text-white/28">
            <span>
              Coins{' '}
              <b className="text-[#ffd64a]">
                {collectedCoins}/{totalCoins}
              </b>
            </span>
            <span>
              Map <b className="text-white/55">#{mazeSeedLabel}</b>
            </span>
          </div>
        </div>

        {phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 border-l-2 border-[#ff607f]/45 bg-black/35 px-2 py-1 text-[6px] font-black uppercase tracking-[.12em] text-white/38">
            Deaths{' '}
            <strong className="text-[#ff8098]">{deaths}</strong>
            {penaltySeconds > 0 && (
              <span className="ml-2 text-[#ff8098]">
                +{penaltySeconds}s
              </span>
            )}
          </div>
        )}

        {phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-30 text-right text-[6px] font-black uppercase tracking-[.12em] text-white/24">
            Swipe to turn
          </div>
        )}

        {phase === 'playing' &&
          performance.now() < respawnLabelUntilRef.current && (
            <div
              key={`${deaths}-${penaltySeconds}`}
              className="pointer-events-none absolute left-1/2 top-[18%] z-40 border-x-2 border-[#ff607f] bg-[#250b19]/90 px-3 py-2 text-[9px] font-black uppercase tracking-[.13em] text-[#ff8ca3]"
              style={{
                animation: 'tc-penalty 1.05s ease-out both',
              }}
            >
              CAUGHT +{DEATH_PENALTY_SECONDS}s
            </div>
          )}

        {phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#080509]/92">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center border-2 border-[#ffd64a] bg-[#551533]">
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-[#ffd64a]">
                  <div
                    className="absolute right-[-2px] top-1/2 h-5 w-5 -translate-y-1/2 rotate-45 bg-[#551533]"
                  />
                </div>
              </div>

              <p className="mt-4 text-[7px] font-black uppercase tracking-[.24em] text-white/35">
                Collect everything
              </p>

              <strong
                key={countdown}
                className="mt-1 block text-[52px] font-black leading-[1.1] text-[#ffd64a]"
                style={{
                  animation: 'tc-count .38s ease-out both',
                }}
              >
                {countdown}
              </strong>

              <p className="mt-2 text-[7px] font-black uppercase tracking-[.12em] text-white/28">
                Swipe · Turn · Survive
              </p>
            </div>
          </div>
        )}
      </div>

      {showResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/78 px-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[324px] border-2 border-[#5b183b] bg-[#130811] p-5 text-center shadow-[0_28px_80px_rgba(0,0,0,.62)]">
            <div className="mx-auto grid h-14 w-14 place-items-center border-2 border-[#ffd64a] bg-[#5b183b]">
              <span className="text-[19px] font-black text-[#ffd64a]">
                ✓
              </span>
            </div>

            <p className="mt-4 text-[7px] font-black uppercase tracking-[.22em] text-white/28">
              Tomb Chase
            </p>
            <h2 className="mt-1 text-[23px] font-black text-white">
              ЛАБИРИНТ ПРОЙДЕН
            </h2>

            <div className="mt-4 border-y border-white/[0.06] py-4">
              <span className="text-[6px] font-black uppercase tracking-[.15em] text-white/28">
                Final time
              </span>
              <strong className="mt-1 block text-[31px] font-black text-[#ffd64a]">
                {formatTime(currentTime)}
              </strong>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="border border-white/[0.06] bg-white/[0.025] p-2.5">
                <span className="text-[6px] font-black uppercase text-white/25">
                  Coins
                </span>
                <strong className="mt-1 block text-[14px] font-black text-white/80">
                  {collectedCoins}
                </strong>
              </div>
              <div className="border border-[#ff607f]/12 bg-[#ff607f]/[0.035] p-2.5">
                <span className="text-[6px] font-black uppercase text-white/25">
                  Caught
                </span>
                <strong className="mt-1 block text-[14px] font-black text-[#ff8098]">
                  {deaths}
                </strong>
              </div>
              <div className="border border-[#ff607f]/12 bg-[#ff607f]/[0.035] p-2.5">
                <span className="text-[6px] font-black uppercase text-white/25">
                  Penalty
                </span>
                <strong className="mt-1 block text-[14px] font-black text-[#ff8098]">
                  +{penaltySeconds}s
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => resetGame(true)}
              className="mt-4 w-full bg-[#ffd64a] px-4 py-3 text-[9px] font-black uppercase tracking-[.1em] text-[#210d19] active:scale-[.985]"
            >
              НОВАЯ КАРТА
            </button>

            <button
              type="button"
              onClick={() => resetGame(false)}
              className="mt-2 w-full border border-[#ffd64a]/15 bg-[#ffd64a]/[.045] px-4 py-3 text-[8px] font-black uppercase tracking-[.1em] text-[#ffe58a] active:scale-[.985]"
            >
              ЕЩЁ РАЗ
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 w-full border border-white/10 bg-white/[.03] px-4 py-3 text-[8px] font-black uppercase tracking-[.1em] text-white/45 active:scale-[.985]"
            >
              НА ГЛАВНУЮ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}