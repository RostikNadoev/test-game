import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTiltMazeOnline, type TiltMazePlayerProfile } from '../hooks/useTiltMazeOnline';

type Direction = 'n' | 'e' | 's' | 'w';

type Cell = {
  x: number;
  y: number;
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  visited: boolean;
};

type WallRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Maze = {
  cols: number;
  rows: number;
  cellSize: number;
  wallThickness: number;
  worldWidth: number;
  worldHeight: number;
  walls: WallRect[];
  cells: Cell[];
  start: { x: number; y: number; cellX: number; cellY: number };
  exit: {
    x: number;
    y: number;
    w: number;
    h: number;
    cellX: number;
    cellY: number;
    side: Direction;
  };
};

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

type Camera = {
  x: number;
  y: number;
  zoom: number;
};

type BoardState = {
  angle: number;
  targetAngle: number;
  angularVelocity: number;
  angularAcceleration: number;
};

type PointerControl = {
  active: boolean;
  id: number | null;
  x: number;
  y: number;
  lastAngle: number;
  lastMoveAt: number;
  inputOmega: number;
  hasAngle: boolean;
};

const GAME_MS = 60_000;
const INTRO_MS = 3_000;
const CELL_SIZE = 46;
const WALL = 8;
const BALL_RADIUS = 17;
const COLS = 18;
const ROWS = 18;
const LOOP_RATIO = 0.055;
const FIXED_DT = 1 / 240;
const MAX_STEPS = 14;
const WORLD_GRAVITY = 690;
const ROLLING_RESISTANCE = 15;
const VELOCITY_DRAG = 0.045;
const MAX_BALL_SPEED = 410;
const WALL_RESTITUTION = 0.11;
const WALL_TANGENT_KEEP = 0.994;
const CAMERA_RESPONSE = 8.4;
const CAMERA_LOOK_AHEAD = 0.035;
const PLAY_VISIBLE_FRACTION = 0.70;
const MAX_CONTROL_OMEGA = 3.0;
const MAX_INPUT_OMEGA = 4.0;
const MAX_CONTROL_ALPHA = 11.5;
const BOARD_ANGLE_RESPONSE = 8.5;
const INPUT_OMEGA_SMOOTHING = 0.38;
const INPUT_OMEGA_DEADZONE = 0.08;
const RELEASE_COAST_LIMIT = 0.12;
const ROTATION_INERTIA_SCALE = 0.08;
const CONTROL_MIN_RADIUS = 52;
const CONTROL_HINT_MS = 5_200;
const POSITION_SEND_MS = 100;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const cellIndex = (x: number, y: number, cols: number) => y * cols + x;

const opposite = (dir: Direction): Direction => {
  if (dir === 'n') return 's';
  if (dir === 's') return 'n';
  if (dir === 'e') return 'w';
  return 'e';
};

const deltaFor = (dir: Direction) => {
  if (dir === 'n') return { dx: 0, dy: -1 };
  if (dir === 's') return { dx: 0, dy: 1 };
  if (dir === 'e') return { dx: 1, dy: 0 };
  return { dx: -1, dy: 0 };
};

const shuffle = <T,>(items: T[], rng: () => number) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function generateMaze(seed: number): Maze {
  const rng = makeRng(seed);
  const cells: Cell[] = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      cells.push({ x, y, n: true, e: true, s: true, w: true, visited: false });
    }
  }

  const corner = Math.floor(rng() * 4);
  const startCell =
    corner === 0
      ? { x: 1, y: 1 }
      : corner === 1
        ? { x: COLS - 2, y: 1 }
        : corner === 2
          ? { x: COLS - 2, y: ROWS - 2 }
          : { x: 1, y: ROWS - 2 };

  const stack: Cell[] = [];
  let current = cells[cellIndex(startCell.x, startCell.y, COLS)];
  current.visited = true;
  let visitedCount = 1;

  while (visitedCount < cells.length) {
    const candidates: { dir: Direction; cell: Cell }[] = [];

    for (const dir of shuffle<Direction>(['n', 'e', 's', 'w'], rng)) {
      const { dx, dy } = deltaFor(dir);
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const next = cells[cellIndex(nx, ny, COLS)];
      if (!next.visited) candidates.push({ dir, cell: next });
    }

    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(rng() * candidates.length)];
      current[chosen.dir] = false;
      chosen.cell[opposite(chosen.dir)] = false;
      stack.push(current);
      current = chosen.cell;
      current.visited = true;
      visitedCount += 1;
    } else {
      current = stack.pop() ?? current;
    }
  }

  const loopTarget = Math.floor(cells.length * LOOP_RATIO);
  let loops = 0;
  let attempts = 0;

  while (loops < loopTarget && attempts < loopTarget * 30) {
    attempts += 1;
    const x = 1 + Math.floor(rng() * (COLS - 2));
    const y = 1 + Math.floor(rng() * (ROWS - 2));
    const cell = cells[cellIndex(x, y, COLS)];

    for (const dir of shuffle<Direction>(['n', 'e', 's', 'w'], rng)) {
      if (!cell[dir]) continue;
      const { dx, dy } = deltaFor(dir);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;

      const neighbour = cells[cellIndex(nx, ny, COLS)];
      const openCount = (['n', 'e', 's', 'w'] as Direction[]).filter(
        (candidate) => !cell[candidate],
      ).length;
      const neighbourOpenCount = (['n', 'e', 's', 'w'] as Direction[]).filter(
        (candidate) => !neighbour[candidate],
      ).length;

      if (openCount >= 3 || neighbourOpenCount >= 3) continue;
      cell[dir] = false;
      neighbour[opposite(dir)] = false;
      loops += 1;
      break;
    }
  }

  const distance = new Array<number>(cells.length).fill(-1);
  const queue: Cell[] = [cells[cellIndex(startCell.x, startCell.y, COLS)]];
  distance[cellIndex(startCell.x, startCell.y, COLS)] = 0;

  for (let q = 0; q < queue.length; q += 1) {
    const cell = queue[q];
    for (const dir of ['n', 'e', 's', 'w'] as Direction[]) {
      if (cell[dir]) continue;
      const { dx, dy } = deltaFor(dir);
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const index = cellIndex(nx, ny, COLS);
      if (distance[index] !== -1) continue;
      distance[index] = distance[cellIndex(cell.x, cell.y, COLS)] + 1;
      queue.push(cells[index]);
    }
  }

  const boundary = cells.filter(
    (cell) =>
      cell.x === 0 ||
      cell.y === 0 ||
      cell.x === COLS - 1 ||
      cell.y === ROWS - 1,
  );

  boundary.sort(
    (a, b) =>
      distance[cellIndex(b.x, b.y, COLS)] -
      distance[cellIndex(a.x, a.y, COLS)],
  );

  const exitCell = boundary[0];
  const possibleSides: Direction[] = [];
  if (exitCell.x === 0) possibleSides.push('w');
  if (exitCell.x === COLS - 1) possibleSides.push('e');
  if (exitCell.y === 0) possibleSides.push('n');
  if (exitCell.y === ROWS - 1) possibleSides.push('s');
  const exitSide = possibleSides[Math.floor(rng() * possibleSides.length)] ?? 'e';
  exitCell[exitSide] = false;

  const worldWidth = COLS * CELL_SIZE;
  const worldHeight = ROWS * CELL_SIZE;
  const walls: WallRect[] = [];

  const addHorizontal = (x: number, y: number) => {
    walls.push({
      x: x * CELL_SIZE - WALL / 2,
      y: y * CELL_SIZE - WALL / 2,
      w: CELL_SIZE + WALL,
      h: WALL,
    });
  };

  const addVertical = (x: number, y: number) => {
    walls.push({
      x: x * CELL_SIZE - WALL / 2,
      y: y * CELL_SIZE - WALL / 2,
      w: WALL,
      h: CELL_SIZE + WALL,
    });
  };

  for (const cell of cells) {
    if (cell.n && cell.y === 0) addHorizontal(cell.x, cell.y);
    if (cell.w && cell.x === 0) addVertical(cell.x, cell.y);
    if (cell.e) addVertical(cell.x + 1, cell.y);
    if (cell.s) addHorizontal(cell.x, cell.y + 1);
  }

  const centerOf = (cell: { x: number; y: number }) => ({
    x: cell.x * CELL_SIZE + CELL_SIZE / 2,
    y: cell.y * CELL_SIZE + CELL_SIZE / 2,
  });

  const startCenter = centerOf(startCell);
  const exitCenter = centerOf(exitCell);
  const exitDepth = CELL_SIZE * 0.72;
  const exitWidth = CELL_SIZE - WALL * 1.3;

  const exit =
    exitSide === 'e'
      ? {
          x: worldWidth - exitDepth,
          y: exitCenter.y - exitWidth / 2,
          w: exitDepth + 3,
          h: exitWidth,
          cellX: exitCell.x,
          cellY: exitCell.y,
          side: exitSide,
        }
      : exitSide === 'w'
        ? {
            x: -3,
            y: exitCenter.y - exitWidth / 2,
            w: exitDepth + 3,
            h: exitWidth,
            cellX: exitCell.x,
            cellY: exitCell.y,
            side: exitSide,
          }
        : exitSide === 's'
          ? {
              x: exitCenter.x - exitWidth / 2,
              y: worldHeight - exitDepth,
              w: exitWidth,
              h: exitDepth + 3,
              cellX: exitCell.x,
              cellY: exitCell.y,
              side: exitSide,
            }
          : {
              x: exitCenter.x - exitWidth / 2,
              y: -3,
              w: exitWidth,
              h: exitDepth + 3,
              cellX: exitCell.x,
              cellY: exitCell.y,
              side: exitSide,
            };

  return {
    cols: COLS,
    rows: ROWS,
    cellSize: CELL_SIZE,
    wallThickness: WALL,
    worldWidth,
    worldHeight,
    walls,
    cells,
    start: { ...startCenter, cellX: startCell.x, cellY: startCell.y },
    exit,
  };
}

function resolveBallAgainstRect(ball: Ball, rect: WallRect) {
  const nearestX = clamp(ball.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(ball.y, rect.y, rect.y + rect.h);
  let dx = ball.x - nearestX;
  let dy = ball.y - nearestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= ball.r * ball.r) return false;

  let nx = 0;
  let ny = 0;
  let penetration = 0;

  if (distanceSq > 0.000001) {
    const distance = Math.sqrt(distanceSq);
    nx = dx / distance;
    ny = dy / distance;
    penetration = ball.r - distance;
  } else {
    const left = Math.abs(ball.x - rect.x);
    const right = Math.abs(rect.x + rect.w - ball.x);
    const top = Math.abs(ball.y - rect.y);
    const bottom = Math.abs(rect.y + rect.h - ball.y);
    const smallest = Math.min(left, right, top, bottom);

    if (smallest === left) {
      nx = -1;
      penetration = ball.r + left;
    } else if (smallest === right) {
      nx = 1;
      penetration = ball.r + right;
    } else if (smallest === top) {
      ny = -1;
      penetration = ball.r + top;
    } else {
      ny = 1;
      penetration = ball.r + bottom;
    }
  }

  ball.x += nx * penetration;
  ball.y += ny * penetration;

  const normalVelocity = ball.vx * nx + ball.vy * ny;
  if (normalVelocity < 0) {
    const tangentX = ball.vx - normalVelocity * nx;
    const tangentY = ball.vy - normalVelocity * ny;
    const bouncedNormal = -normalVelocity * WALL_RESTITUTION;
    ball.vx = tangentX * WALL_TANGENT_KEEP + bouncedNormal * nx;
    ball.vy = tangentY * WALL_TANGENT_KEEP + bouncedNormal * ny;
  }

  return true;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const formatElapsed = (milliseconds: number) => {
  const safe = clamp(milliseconds, 0, GAME_MS);
  const totalTenths = Math.floor(safe / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
};

const formatFinish = (milliseconds: number) => {
  const safe = Math.max(0, milliseconds);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const hundredths = Math.floor((safe % 1_000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
};

const initials = (name: string) => name.replace('@', '').trim().slice(0, 2).toUpperCase() || 'P';

function Avatar({ profile, large = false }: { profile: TiltMazePlayerProfile; large?: boolean }) {
  const size = large ? 'h-14 w-14' : 'h-8 w-8';
  return profile.photoUrl ? (
    <img
      src={profile.photoUrl}
      alt=""
      className={`${size} shrink-0 rounded-full border border-black/10 object-cover`}
    />
  ) : (
    <div
      className={`${size} grid shrink-0 place-items-center rounded-full bg-[#242321] pt-[2px] font-[Supercell] text-[10px] leading-[1.35] text-white`}
    >
      {initials(profile.name)}
    </div>
  );
}

export default function TiltMazeGame() {
  const match = useTiltMazeOnline();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mazeRef = useRef<Maze | null>(null);
  const ballRef = useRef<Ball>({ x: 0, y: 0, vx: 0, vy: 0, r: BALL_RADIUS });
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const boardRef = useRef<BoardState>({
    angle: 0,
    targetAngle: 0,
    angularVelocity: 0,
    angularAcceleration: 0,
  });
  const pointerRef = useRef<PointerControl>({
    active: false,
    id: null,
    x: 0,
    y: 0,
    lastAngle: 0,
    lastMoveAt: 0,
    inputOmega: 0,
    hasAngle: false,
  });
  const sizeRef = useRef({ width: 390, height: 620, dpr: 1 });
  const firstControlAtRef = useRef(0);
  const lastPositionSentAtRef = useRef(0);
  const localFinishedRef = useRef(false);
  const finishSentRef = useRef(false);
  const currentSeedRef = useRef(0);
  const serverPhaseRef = useRef<'waiting' | 'countdown' | 'playing' | 'finished'>('waiting');
  const countdownStartsClientRef = useRef(0);
  const matchStartsClientRef = useRef(0);
  const matchEndsClientRef = useRef(0);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [resultStage, setResultStage] = useState(0);
  const [metricReveal, setMetricReveal] = useState(0);

  const serverState = match.serverState;
  const seed = match.seed;
  const sendPosition = match.sendPosition;
  const sendFinish = match.sendFinish;

  const matchStartsClientMs = useMemo(() => {
    if (!serverState?.match_starts_ms) return 0;
    return serverState.match_starts_ms + match.serverOffsetMs;
  }, [match.serverOffsetMs, serverState?.match_starts_ms]);

  const matchEndsClientMs = useMemo(() => {
    if (!serverState?.match_ends_ms) return 0;
    return serverState.match_ends_ms + match.serverOffsetMs;
  }, [match.serverOffsetMs, serverState?.match_ends_ms]);

  const countdownStartsClientMs = matchStartsClientMs ? matchStartsClientMs - INTRO_MS : 0;

  useEffect(() => {
    serverPhaseRef.current = serverState?.phase || 'waiting';
    countdownStartsClientRef.current = countdownStartsClientMs;
    matchStartsClientRef.current = matchStartsClientMs;
    matchEndsClientRef.current = matchEndsClientMs;
  }, [countdownStartsClientMs, matchEndsClientMs, matchStartsClientMs, serverState?.phase]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    if (!seed || currentSeedRef.current === seed) return;
    currentSeedRef.current = seed;
    const maze = generateMaze(seed);
    mazeRef.current = maze;
    ballRef.current = {
      x: maze.start.x,
      y: maze.start.y,
      vx: 0,
      vy: 0,
      r: BALL_RADIUS,
    };
    cameraRef.current = {
      x: maze.worldWidth / 2,
      y: maze.worldHeight / 2,
      zoom: 0.5,
    };
    boardRef.current = {
      angle: -0.14,
      targetAngle: -0.14,
      angularVelocity: 0,
      angularAcceleration: 0,
    };
    pointerRef.current = {
      active: false,
      id: null,
      x: 0,
      y: 0,
      lastAngle: 0,
      lastMoveAt: 0,
      inputOmega: 0,
      hasAngle: false,
    };
    firstControlAtRef.current = 0;
    lastPositionSentAtRef.current = 0;
    localFinishedRef.current = false;
    finishSentRef.current = false;
  }, [seed]);

  useEffect(() => {
    if (match.myState?.finished) {
      localFinishedRef.current = true;
      finishSentRef.current = true;
    }
  }, [match.myState?.finished]);

  useEffect(() => {
    if (serverState?.phase !== 'finished') {
      setResultStage(0);
      setMetricReveal(0);
      return;
    }

    setResultStage(0);
    setMetricReveal(0);

    const stageOne = window.setTimeout(() => setResultStage(1), 450);
    const stageTwo = window.setTimeout(() => setResultStage(2), 1_350);
    const stageThree = window.setTimeout(() => setResultStage(3), 3_650);

    return () => {
      window.clearTimeout(stageOne);
      window.clearTimeout(stageTwo);
      window.clearTimeout(stageThree);
    };
  }, [serverState?.phase]);

  useEffect(() => {
    if (resultStage < 2) {
      setMetricReveal(0);
      return;
    }

    let raf = 0;
    const started = performance.now();
    const duration = 1_650;

    const tick = (now: number) => {
      const progress = clamp((now - started) / duration, 0, 1);
      setMetricReveal(easeOutQuint(progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resultStage]);

  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;

    const tick = (now: number) => {
      if (now - lastUpdate >= 45) {
        lastUpdate = now;
        if (matchStartsClientMs > 0) {
          const current = clamp(Date.now() - matchStartsClientMs, 0, GAME_MS);
          setElapsedMs(current);
        } else {
          setElapsedMs(0);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [matchStartsClientMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !seed) return;

    let raf = 0;
    let previous = performance.now();
    let accumulator = 0;

    const getZooms = (maze: Maze) => {
      const { width, height } = sizeRef.current;
      const allMapZoom = Math.min(
        (width - 24) / maze.worldWidth,
        (height - 88) / maze.worldHeight,
      );
      const playZoom = Math.max(0.58, allMapZoom / PLAY_VISIBLE_FRACTION);
      return { allMapZoom, playZoom };
    };

    const updateCamera = (frameDt: number, playZoom: number) => {
      const ball = ballRef.current;
      const camera = cameraRef.current;
      const targetX = ball.x + ball.vx * CAMERA_LOOK_AHEAD;
      const targetY = ball.y + ball.vy * CAMERA_LOOK_AHEAD;
      const alpha = 1 - Math.exp(-CAMERA_RESPONSE * frameDt);
      camera.x = lerp(camera.x, targetX, alpha);
      camera.y = lerp(camera.y, targetY, alpha);
      camera.zoom = lerp(camera.zoom, playZoom, alpha);
    };

    const drawBoard = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      now: number,
      maze: Maze,
    ) => {
      const ball = ballRef.current;
      const camera = cameraRef.current;
      const board = boardRef.current;

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(board.angle);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      const shadowOffsetX = Math.sin(board.angle) * 5;
      const shadowOffsetY = 7 + Math.cos(board.angle) * 2;
      ctx.fillStyle = 'rgba(25, 25, 23, 0.16)';
      roundedRect(
        ctx,
        shadowOffsetX,
        shadowOffsetY,
        maze.worldWidth,
        maze.worldHeight,
        15,
      );
      ctx.fill();

      ctx.fillStyle = '#d7d1c5';
      roundedRect(ctx, 0, 0, maze.worldWidth, maze.worldHeight, 15);
      ctx.fill();

      ctx.save();
      roundedRect(ctx, 0, 0, maze.worldWidth, maze.worldHeight, 15);
      ctx.clip();
      ctx.strokeStyle = 'rgba(35, 33, 29, 0.035)';
      ctx.lineWidth = 1;
      for (let y = 18; y < maze.worldHeight; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(maze.worldWidth, y + Math.sin(y * 0.031) * 4);
        ctx.stroke();
      }
      ctx.restore();

      const exit = maze.exit;
      ctx.fillStyle = '#95a57f';
      roundedRect(ctx, exit.x, exit.y, exit.w, exit.h, 8);
      ctx.fill();

      ctx.save();
      ctx.fillStyle = 'rgba(26, 31, 23, 0.80)';
      ctx.font = '700 10px Supercell, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(exit.x + exit.w / 2, exit.y + exit.h / 2);
      if (exit.side === 'e' || exit.side === 'w') ctx.rotate(Math.PI / 2);
      ctx.fillText('EXIT', 0, 1);
      ctx.restore();

      ctx.fillStyle = 'rgba(56, 66, 48, 0.11)';
      ctx.beginPath();
      ctx.arc(maze.start.x, maze.start.y, BALL_RADIUS + 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(20, 20, 18, 0.17)';
      for (const wall of maze.walls) {
        roundedRect(ctx, wall.x + 2.2, wall.y + 3.2, wall.w, wall.h, 3.4);
        ctx.fill();
      }

      ctx.fillStyle = '#242321';
      for (const wall of maze.walls) {
        roundedRect(ctx, wall.x, wall.y, wall.w, wall.h, 3.4);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(13, 13, 12, 0.22)';
      ctx.beginPath();
      ctx.ellipse(
        ball.x + 2.7,
        ball.y + 4.2,
        ball.r * 0.95,
        ball.r * 0.72,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const gradient = ctx.createRadialGradient(
        ball.x - ball.r * 0.42,
        ball.y - ball.r * 0.48,
        ball.r * 0.12,
        ball.x,
        ball.y,
        ball.r * 1.05,
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.22, '#d7d8d6');
      gradient.addColorStop(0.55, '#8d908e');
      gradient.addColorStop(1, '#444644');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(28, 30, 28, 0.52)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      const pointer = pointerRef.current;
      const controlAge =
        firstControlAtRef.current > 0 ? now - firstControlAtRef.current : 0;
      const showControlGuide =
        serverPhaseRef.current === 'playing' &&
        !localFinishedRef.current &&
        (pointer.active || firstControlAtRef.current === 0 || controlAge < CONTROL_HINT_MS);

      if (showControlGuide) {
        const guideRadius = Math.min(width, height) * 0.31;
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.strokeStyle = pointer.active
          ? 'rgba(35, 34, 31, 0.16)'
          : 'rgba(35, 34, 31, 0.08)';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, guideRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };

    const simulate = (dt: number, maze: Maze) => {
      if (serverPhaseRef.current !== 'playing' || localFinishedRef.current) return;
      if (matchEndsClientRef.current && Date.now() >= matchEndsClientRef.current) return;

      const ball = ballRef.current;
      const board = boardRef.current;
      const centerX = maze.worldWidth / 2;
      const centerY = maze.worldHeight / 2;

      const previousOmega = board.angularVelocity;
      const angleError = board.targetAngle - board.angle;
      const desiredOmega = clamp(
        angleError * BOARD_ANGLE_RESPONSE,
        -MAX_CONTROL_OMEGA,
        MAX_CONTROL_OMEGA,
      );
      const maxOmegaChange = MAX_CONTROL_ALPHA * dt;
      board.angularVelocity += clamp(
        desiredOmega - board.angularVelocity,
        -maxOmegaChange,
        maxOmegaChange,
      );
      board.angle += board.angularVelocity * dt;
      board.angularAcceleration = clamp(
        (board.angularVelocity - previousOmega) / dt,
        -MAX_CONTROL_ALPHA,
        MAX_CONTROL_ALPHA,
      );

      const sin = Math.sin(board.angle);
      const cos = Math.cos(board.angle);
      let ax = WORLD_GRAVITY * sin;
      let ay = WORLD_GRAVITY * cos;

      const omega = clamp(board.angularVelocity, -MAX_CONTROL_OMEGA, MAX_CONTROL_OMEGA);
      const alpha = clamp(
        board.angularAcceleration,
        -MAX_CONTROL_ALPHA,
        MAX_CONTROL_ALPHA,
      );
      const rx = ball.x - centerX;
      const ry = ball.y - centerY;

      ax +=
        (2 * omega * ball.vy + omega * omega * rx + alpha * ry) *
        ROTATION_INERTIA_SCALE;
      ay +=
        (-2 * omega * ball.vx + omega * omega * ry - alpha * rx) *
        ROTATION_INERTIA_SCALE;

      ball.vx += ax * dt;
      ball.vy += ay * dt;

      const speedBeforeResistance = Math.hypot(ball.vx, ball.vy);
      if (speedBeforeResistance > 0.001) {
        const decel = Math.min(speedBeforeResistance, ROLLING_RESISTANCE * dt);
        const keep = (speedBeforeResistance - decel) / speedBeforeResistance;
        ball.vx *= keep;
        ball.vy *= keep;
      }

      const drag = Math.exp(-VELOCITY_DRAG * dt);
      ball.vx *= drag;
      ball.vy *= drag;

      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > MAX_BALL_SPEED) {
        const factor = MAX_BALL_SPEED / speed;
        ball.vx *= factor;
        ball.vy *= factor;
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      for (let pass = 0; pass < 3; pass += 1) {
        for (const wall of maze.walls) {
          if (
            ball.x + ball.r < wall.x - 1 ||
            ball.x - ball.r > wall.x + wall.w + 1 ||
            ball.y + ball.r < wall.y - 1 ||
            ball.y - ball.r > wall.y + wall.h + 1
          ) {
            continue;
          }
          resolveBallAgainstRect(ball, wall);
        }
      }

      const margin = ball.r * 0.7;
      ball.x = clamp(ball.x, -margin, maze.worldWidth + margin);
      ball.y = clamp(ball.y, -margin, maze.worldHeight + margin);

      const now = performance.now();
      if (now - lastPositionSentAtRef.current >= POSITION_SEND_MS) {
        lastPositionSentAtRef.current = now;
        sendPosition(ball.x, ball.y);
      }

      const exit = maze.exit;
      const insideExit =
        ball.x > exit.x - ball.r * 0.25 &&
        ball.x < exit.x + exit.w + ball.r * 0.25 &&
        ball.y > exit.y - ball.r * 0.25 &&
        ball.y < exit.y + exit.h + ball.r * 0.25;

      if (insideExit && !finishSentRef.current) {
        finishSentRef.current = true;
        localFinishedRef.current = true;
        ball.vx = 0;
        ball.vy = 0;
        sendFinish(ball.x, ball.y);
      }

      if (
        Math.abs(board.targetAngle - board.angle) < 0.0005 &&
        Math.abs(board.angularVelocity) < 0.002
      ) {
        board.angle = board.targetAngle;
        board.angularVelocity = 0;
        board.angularAcceleration = 0;
      }
    };

    const draw = (now: number, frameDt: number) => {
      const ctx = canvas.getContext('2d');
      const maze = mazeRef.current;
      if (!ctx || !maze) return;

      const { width, height, dpr } = sizeRef.current;
      const camera = cameraRef.current;
      const board = boardRef.current;
      const ball = ballRef.current;
      const { allMapZoom, playZoom } = getZooms(maze);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#e7e3da';
      ctx.fillRect(0, 0, width, height);

      if (serverPhaseRef.current === 'waiting') {
        camera.x = maze.worldWidth / 2;
        camera.y = maze.worldHeight / 2;
        camera.zoom = allMapZoom;
        board.angle = -0.08;
        board.targetAngle = board.angle;
      } else if (serverPhaseRef.current === 'countdown' && countdownStartsClientRef.current) {
        const introProgress = clamp(
          (Date.now() - countdownStartsClientRef.current) / INTRO_MS,
          0,
          1,
        );
        const flightT = clamp((introProgress - 0.08) / 0.92, 0, 1);
        const eased = easeInOutCubic(flightT);
        const zoomEase = easeOutQuint(flightT);
        camera.x = lerp(maze.worldWidth / 2, ball.x, eased);
        camera.y = lerp(maze.worldHeight / 2, ball.y, eased);
        camera.zoom = lerp(allMapZoom, playZoom, zoomEase);
        board.angle = lerp(-0.14, 0, easeInOutCubic(introProgress));
        board.targetAngle = board.angle;
      } else {
        updateCamera(frameDt, playZoom);
      }

      drawBoard(ctx, width, height, now, maze);

      if (serverPhaseRef.current === 'countdown' && matchStartsClientRef.current) {
        const left = clamp(matchStartsClientRef.current - Date.now(), 0, INTRO_MS);
        const number = left > 2_000 ? 3 : left > 1_000 ? 2 : 1;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#171715';
        ctx.font = '700 50px Supercell, system-ui, sans-serif';
        ctx.fillText(String(number), width / 2, height * 0.50 + 3);
        ctx.font = '700 9px Supercell, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(23, 23, 21, 0.58)';
        ctx.fillText('MEMORIZE THE MAZE', width / 2, height * 0.50 + 53);
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      const frameDt = Math.min(0.05, Math.max(0, (now - previous) / 1_000));
      previous = now;
      accumulator += frameDt;

      const maze = mazeRef.current;
      if (maze) {
        let steps = 0;
        while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
          simulate(FIXED_DT, maze);
          accumulator -= FIXED_DT;
          steps += 1;
        }
        if (steps === MAX_STEPS) accumulator = 0;
      }

      draw(now, frameDt);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [seed, sendFinish, sendPosition]);

  const pointerToCanvas = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const pointerAngleAroundCenter = useCallback((x: number, y: number) => {
    const { width, height } = sizeRef.current;
    return Math.atan2(y - height / 2, x - width / 2);
  }, []);

  const normalizeAngleDelta = useCallback((delta: number) => {
    let value = delta;
    while (value > Math.PI) value -= Math.PI * 2;
    while (value < -Math.PI) value += Math.PI * 2;
    return value;
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (serverPhaseRef.current !== 'playing' || localFinishedRef.current) return;
      const point = pointerToCanvas(event);
      const { width, height } = sizeRef.current;
      const radius = Math.hypot(point.x - width / 2, point.y - height / 2);
      const pointer = pointerRef.current;
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.lastMoveAt = performance.now();
      pointer.inputOmega = 0;
      pointer.hasAngle = radius >= CONTROL_MIN_RADIUS;
      pointer.lastAngle = pointerAngleAroundCenter(point.x, point.y);
      if (firstControlAtRef.current === 0) firstControlAtRef.current = performance.now();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pointerAngleAroundCenter, pointerToCanvas],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pointer = pointerRef.current;
      if (!pointer.active || pointer.id !== event.pointerId || localFinishedRef.current) return;

      const point = pointerToCanvas(event);
      const { width, height } = sizeRef.current;
      const radius = Math.hypot(point.x - width / 2, point.y - height / 2);
      const now = performance.now();
      const currentAngle = pointerAngleAroundCenter(point.x, point.y);

      pointer.x = point.x;
      pointer.y = point.y;

      if (!pointer.hasAngle) {
        if (radius >= CONTROL_MIN_RADIUS) {
          pointer.hasAngle = true;
          pointer.lastAngle = currentAngle;
          pointer.lastMoveAt = now;
          pointer.inputOmega = 0;
        }
        return;
      }

      if (radius < CONTROL_MIN_RADIUS) {
        pointer.hasAngle = false;
        pointer.lastMoveAt = now;
        pointer.inputOmega = 0;
        return;
      }

      const delta = normalizeAngleDelta(currentAngle - pointer.lastAngle);
      const dt = Math.max(1 / 120, Math.min(0.05, (now - pointer.lastMoveAt) / 1_000));
      const board = boardRef.current;
      const measuredOmega = clamp(delta / dt, -MAX_INPUT_OMEGA, MAX_INPUT_OMEGA);
      pointer.inputOmega = lerp(
        pointer.inputOmega,
        measuredOmega,
        INPUT_OMEGA_SMOOTHING,
      );
      const inputOmega =
        Math.abs(pointer.inputOmega) < INPUT_OMEGA_DEADZONE ? 0 : pointer.inputOmega;
      board.targetAngle += inputOmega * dt;

      pointer.lastAngle = currentAngle;
      pointer.lastMoveAt = now;
    },
    [normalizeAngleDelta, pointerAngleAroundCenter, pointerToCanvas],
  );

  const releasePointer = useCallback((event?: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (event && pointer.id !== event.pointerId) return;
    pointer.active = false;
    pointer.id = null;
    pointer.hasAngle = false;
    pointer.inputOmega = 0;

    const board = boardRef.current;
    const stoppingDistance = clamp(
      (board.angularVelocity * Math.abs(board.angularVelocity)) / (2 * MAX_CONTROL_ALPHA),
      -RELEASE_COAST_LIMIT,
      RELEASE_COAST_LIMIT,
    );
    board.targetAngle = board.angle + stoppingDistance;

    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const bothFailed =
    serverState?.phase === 'finished' &&
    match.myState?.finished === false &&
    match.opponentState?.finished === false;

  const revealedMyFinish = Math.round((match.myState?.finish_ms || 0) * metricReveal);
  const revealedOpponentFinish = Math.round(
    (match.opponentState?.finish_ms || 0) * metricReveal,
  );
  const revealedMyRemaining = (match.myState?.remaining || 0) * metricReveal;
  const revealedOpponentRemaining = (match.opponentState?.remaining || 0) * metricReveal;

  const localWon = !match.draw && match.winnerUserId === match.myUserId;
  const opponentWon = !match.draw && match.winnerUserId === match.opponentUserId;

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-[#e7e3da] text-[#171715]">
      <div className="pointer-events-none absolute inset-x-0 top-2 z-20 px-3">
        <div className="mx-auto grid min-h-[48px] max-w-[440px] grid-cols-[1fr_auto_1fr] items-center rounded-[14px] border border-black/[0.07] bg-[#f1eee7]/94 px-3 py-1.5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar profile={match.playerProfile} />
            <div className="min-w-0 truncate pt-[3px] pb-[2px] font-[Supercell] text-[9px] leading-[1.35] uppercase">
              {match.playerProfile.name}
            </div>
          </div>

          <div className="min-w-[94px] px-2 text-center pt-[3px] pb-[2px] font-[Supercell] text-[13px] leading-[1.35] tabular-nums">
            {formatElapsed(elapsedMs)}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <div className="min-w-0 truncate pt-[3px] pb-[2px] text-right font-[Supercell] text-[9px] leading-[1.35] uppercase">
              {match.opponentProfile.name}
            </div>
            <Avatar profile={match.opponentProfile} />
          </div>
        </div>
      </div>

      <div ref={hostRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="block h-full w-full select-none"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
          onLostPointerCapture={() => releasePointer()}
          aria-label="Tilt Maze rotating board"
        />
      </div>

      {match.connectionStatus !== 'open' && serverState?.phase !== 'finished' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-5">
          <div className="rounded-full border border-black/[0.07] bg-[#f1eee7]/92 px-4 py-2 pt-[10px] font-[Supercell] text-[9px] leading-[1.35] text-black/45 backdrop-blur-md">
            {match.connectionStatus === 'error' ? 'CONNECTION ERROR' : 'CONNECTING'}
          </div>
        </div>
      )}

      {match.connectionStatus === 'open' && serverState?.phase === 'waiting' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-5">
          <div className="rounded-full border border-black/[0.07] bg-[#f1eee7]/92 px-4 py-2 pt-[10px] font-[Supercell] text-[9px] leading-[1.35] text-black/45 backdrop-blur-md">
            WAITING FOR RIVAL
          </div>
        </div>
      )}

      {serverState?.phase === 'playing' && match.myState?.finished && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-5">
          <div className="rounded-full border border-[#738260]/20 bg-[#eef0e9]/95 px-4 py-2 pt-[10px] font-[Supercell] text-[9px] leading-[1.35] text-[#59664b] backdrop-blur-md">
            FINISHED · WAIT FOR 01:00.0
          </div>
        </div>
      )}

      {serverState?.phase === 'finished' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#d9d4c9]/78 px-4 backdrop-blur-[8px]">
          <div className="w-full max-w-[360px] overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#f4f1ea] shadow-[0_24px_90px_rgba(29,27,23,0.18)]">
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="pt-[4px] pb-[3px] font-[Supercell] text-[10px] leading-[1.45] tracking-[0.08em] text-black/38">
                TILT MAZE · RESULT
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 px-4">
              {[
                {
                  profile: match.playerProfile,
                  state: match.myState,
                  finish: revealedMyFinish,
                  remaining: revealedMyRemaining,
                  winner: localWon,
                },
                {
                  profile: match.opponentProfile,
                  state: match.opponentState,
                  finish: revealedOpponentFinish,
                  remaining: revealedOpponentRemaining,
                  winner: opponentWon,
                },
              ].map((entry) => (
                <div
                  key={entry.profile.id || entry.profile.name}
                  className={`min-w-0 rounded-[20px] border px-3 py-4 text-center transition-all duration-500 ${
                    resultStage >= 3 && entry.winner
                      ? 'border-[#7f8f6d]/30 bg-[#e9ede3]'
                      : 'border-black/[0.06] bg-[#ece8df]'
                  }`}
                >
                  <div className="mx-auto flex justify-center">
                    <Avatar profile={entry.profile} large />
                  </div>
                  <div className="mt-2 truncate px-1 pt-[4px] pb-[2px] font-[Supercell] text-[9px] leading-[1.4]">
                    {entry.profile.name}
                  </div>

                  <div
                    className={`mt-4 min-h-[28px] transition-all duration-500 ${
                      resultStage >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    }`}
                  >
                    <div
                      className={`pt-[4px] pb-[2px] font-[Supercell] text-[11px] leading-[1.4] ${
                        entry.state?.finished ? 'text-[#60704f]' : 'text-black/46'
                      }`}
                    >
                      {entry.state?.finished ? 'FINISHED' : 'NOT FINISHED'}
                    </div>
                  </div>

                  <div
                    className={`mt-2 min-h-[48px] transition-all duration-500 ${
                      resultStage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    }`}
                  >
                    {bothFailed ? (
                      <>
                        <div className="pt-[3px] pb-[1px] text-[9px] font-semibold leading-[1.4] text-black/34">
                          REMAINING
                        </div>
                        <div className="pt-[4px] pb-[2px] font-[Supercell] text-[17px] leading-[1.35] tabular-nums">
                          {entry.remaining.toFixed(2)}
                        </div>
                      </>
                    ) : entry.state?.finished ? (
                      <>
                        <div className="pt-[3px] pb-[1px] text-[9px] font-semibold leading-[1.4] text-black/34">
                          TIME
                        </div>
                        <div className="pt-[4px] pb-[2px] font-[Supercell] text-[15px] leading-[1.4] tabular-nums">
                          {formatFinish(entry.finish)}
                        </div>
                      </>
                    ) : (
                      <div className="pt-[14px] pb-[2px] font-[Supercell] text-[14px] leading-[1.4] text-black/24">
                        —
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`px-5 pt-5 transition-all duration-700 ${
                resultStage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
              }`}
            >
              <div className="rounded-[20px] border border-black/[0.06] bg-[#242321] px-4 py-4 text-center text-white">
                <div className="pt-[5px] pb-[3px] font-[Supercell] text-[20px] leading-[1.4]">
                  {match.draw ? 'DRAW' : localWon ? 'YOU WIN' : 'RIVAL WINS'}
                </div>
                {localWon && match.winnerProfit > 0 && (
                  <div className="game-result-reward mt-1 pt-[3px] pb-[2px] text-[11px] font-semibold leading-[1.4] text-white/64">
                    NET WIN +{match.winnerProfit.toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 pt-3">
              <button
                type="button"
                onClick={match.backToLobbies}
                className="h-12 w-full rounded-[16px] border border-black/[0.07] bg-[#e8e4db] px-5 pt-[3px] font-[Supercell] text-[11px] leading-[1.4] text-[#242321] active:scale-[0.985]"
              >
                BACK TO LOBBIES
              </button>
            </div>
          </div>
        </div>
      )}

      {match.socketError && match.connectionStatus === 'error' && (
        <div className="pointer-events-none absolute inset-x-4 top-[64px] z-30 mx-auto max-w-[420px] rounded-[14px] border border-black/[0.08] bg-[#f1eee7]/95 px-3 py-2 text-center text-[10px] font-semibold leading-[1.4] text-black/50">
          {match.socketError}
        </div>
      )}
    </section>
  );
}
