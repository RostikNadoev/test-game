import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';

type Dir = 'up' | 'down' | 'left' | 'right';
type Cell = { r: number; c: number };
type Phase = 'playing' | 'level_complete' | 'all_complete';

type Level = {
  name: string;
  subtitle: string;
  map: readonly string[];
  start: Cell;
  optimal: number;
};

type Layout = {
  cell: number;
  gap: number;
  originX: number;
  originY: number;
  boardW: number;
  boardH: number;
};

type Motion = {
  from: Cell;
  to: Cell;
  path: Cell[];
  startedAt: number;
  duration: number;
  paintedUntil: number;
  dir: Dir;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
};

const LEVELS: readonly Level[] = [
  {
    name: 'Quartz Court',
    subtitle: 'Разогрев',
    map: [
      '..#....',
      '.......',
      '.......',
      '.......',
      '.......',
      '...#...',
      'S..#..#',
    ],
    start: { r: 6, c: 0 },
    optimal: 15,
  },
  {
    name: 'Crystal Split',
    subtitle: 'Найди правильный порядок',
    map: [
      '......#',
      '.#.....',
      '.....##',
      '.......',
      '#....#.',
      '.......',
      'S.#....',
    ],
    start: { r: 6, c: 0 },
    optimal: 18,
  },
  {
    name: 'White Vault',
    subtitle: 'Финальная карта',
    map: [
      '.......',
      '#.#....',
      '#.....#',
      '.......',
      '.......',
      '.......',
      'S..#...',
    ],
    start: { r: 6, c: 0 },
    optimal: 20,
  },
] as const;

const DIRS: Record<Dir, Cell> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

const DPR_CAP = 1.65;
const SWIPE_THRESHOLD = 5;
const TILE_FILL_MS = 120;

const keyOf = (cell: Cell) => `${cell.r}:${cell.c}`;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const easeOutQuart = (t: number) => {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 4);
};

const easePop = (t: number) => {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
};

function isBlocked(level: Level, r: number, c: number) {
  return (
    r < 0 ||
    c < 0 ||
    r >= level.map.length ||
    c >= level.map[0].length ||
    level.map[r][c] === '#'
  );
}

function floorCells(level: Level) {
  const cells: Cell[] = [];
  for (let r = 0; r < level.map.length; r += 1) {
    for (let c = 0; c < level.map[r].length; c += 1) {
      if (level.map[r][c] !== '#') {
        cells.push({ r, c });
      }
    }
  }
  return cells;
}

function getSlidePath(level: Level, from: Cell, dir: Dir) {
  const delta = DIRS[dir];
  const result: Cell[] = [];
  let r = from.r;
  let c = from.c;

  while (!isBlocked(level, r + delta.r, c + delta.c)) {
    r += delta.r;
    c += delta.c;
    result.push({ r, c });
  }

  return result;
}

function motionDuration(cellCount: number) {
  return clamp(95 + cellCount * 44, 140, 405);
}

function formatPercent(current: number, total: number) {
  if (!total) return 0;
  return Math.round((current / total) * 100);
}

export default function CubeFillGame() {
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const layoutRef = useRef<Layout>({
    cell: 46,
    gap: 4,
    originX: 20,
    originY: 90,
    boardW: 340,
    boardH: 340,
  });

  const [levelIndex, setLevelIndex] = useState(0);
  const [moves, setMoves] = useState(0);
  const [paintedCount, setPaintedCount] = useState(1);
  const [phase, setPhase] = useState<Phase>('playing');
  const [totalMoves, setTotalMoves] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const level = LEVELS[levelIndex];
  const levelRef = useRef<Level>(level);
  const playerRef = useRef<Cell>({ ...level.start });
  const motionRef = useRef<Motion | null>(null);
  const queuedDirRef = useRef<Dir | null>(null);
  const paintedRef = useRef<Set<string>>(new Set([keyOf(level.start)]));
  const paintTimeRef = useRef<Map<string, number>>(
    new Map([[keyOf(level.start), 0]]),
  );
  const pointerRef = useRef<{
    x: number;
    y: number;
    fired: boolean;
  } | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const blockedPulseRef = useRef(0);
  const completionTimerRef = useRef<number | null>(null);
  const completeFlashRef = useRef(0);

  const levelFloors = useMemo(() => floorCells(level), [level]);
  const totalPaintable = levelFloors.length;
  const progress = formatPercent(paintedCount, totalPaintable);

  const resetLevel = useCallback((index: number) => {
    const nextLevel = LEVELS[index];

    levelRef.current = nextLevel;
    playerRef.current = { ...nextLevel.start };
    motionRef.current = null;
    queuedDirRef.current = null;
    paintedRef.current = new Set([keyOf(nextLevel.start)]);
    paintTimeRef.current = new Map([
      [keyOf(nextLevel.start), performance.now()],
    ]);
    sparksRef.current = [];
    blockedPulseRef.current = 0;
    completeFlashRef.current = 0;

    setLevelIndex(index);
    setMoves(0);
    setPaintedCount(1);
    setPhase('playing');
    setHintVisible(true);
  }, []);

  const spawnSparks = useCallback((cell: Cell, amount = 4) => {
    const list = sparksRef.current;

    for (let index = 0; index < amount && list.length < 32; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.55;

      list.push({
        x: cell.c + 0.5,
        y: cell.r + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.16 + Math.random() * 0.18,
        size: 0.035 + Math.random() * 0.045,
        alpha: 0.5 + Math.random() * 0.5,
      });
    }
  }, []);

  const markPainted = useCallback(
    (cell: Cell, now: number) => {
      const key = keyOf(cell);
      if (paintedRef.current.has(key)) return;

      paintedRef.current.add(key);
      paintTimeRef.current.set(key, now);
      setPaintedCount(paintedRef.current.size);
      spawnSparks(cell);
    },
    [spawnSparks],
  );

  const finishLevelIfNeeded = useCallback(() => {
    const currentLevel = levelRef.current;
    const total = floorCells(currentLevel).length;

    if (paintedRef.current.size < total) return false;

    queuedDirRef.current = null;
    completeFlashRef.current = performance.now();

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = window.setTimeout(() => {
      if (levelIndex >= LEVELS.length - 1) {
        setPhase('all_complete');
      } else {
        setPhase('level_complete');
      }
      completionTimerRef.current = null;
    }, 470);

    return true;
  }, [levelIndex]);

  const startMove = useCallback(
    (dir: Dir) => {
      if (phase !== 'playing') return false;

      if (motionRef.current) {
        queuedDirRef.current = dir;
        setHintVisible(false);
        return true;
      }

      const currentLevel = levelRef.current;
      const from = playerRef.current;
      const path = getSlidePath(currentLevel, from, dir);

      if (!path.length) {
        blockedPulseRef.current = performance.now();
        return false;
      }

      const now = performance.now();
      const destination = path[path.length - 1];

      motionRef.current = {
        from: { ...from },
        to: { ...destination },
        path,
        startedAt: now,
        duration: motionDuration(path.length),
        paintedUntil: -1,
        dir,
      };

      queuedDirRef.current = null;
      setMoves((value) => value + 1);
      setHintVisible(false);
      return true;
    },
    [phase],
  );

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

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
      startMove(dir);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startMove]);

  const rebuildLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const currentLevel = levelRef.current;
    const rows = currentLevel.map.length;
    const cols = currentLevel.map[0].length;

    const maxBoardW = Math.min(width - 30, 392);
    const maxBoardH = Math.min(height - 118, 430);
    const cell = Math.max(
      31,
      Math.min(
        54,
        Math.min(maxBoardW / cols, maxBoardH / rows),
      ),
    );
    const gap = Math.max(3, cell * 0.075);
    const boardW = cols * cell;
    const boardH = rows * cell;

    layoutRef.current = {
      cell,
      gap,
      originX: (width - boardW) / 2,
      originY: Math.max(46, (height - boardH) / 2 - 3),
      boardW,
      boardH,
    };
  }, []);

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
      rebuildLayout();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [rebuildLayout]);

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
      const currentLevel = levelRef.current;
      const layout = layoutRef.current;
      const rows = currentLevel.map.length;
      const cols = currentLevel.map[0].length;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      const cellRect = (r: number, c: number) => ({
        x: layout.originX + c * layout.cell + layout.gap * 0.5,
        y: layout.originY + r * layout.cell + layout.gap * 0.5,
        size: layout.cell - layout.gap,
      });

      const cellCenter = (r: number, c: number) => ({
        x: layout.originX + (c + 0.5) * layout.cell,
        y: layout.originY + (r + 0.5) * layout.cell,
      });

      const roundedRect = (
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
      ) => {
        const r = Math.min(radius, width / 2, height / 2);

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
      };

      // Soft game background.
      const bg = ctx.createRadialGradient(
        viewW * 0.5,
        viewH * 0.38,
        20,
        viewW * 0.5,
        viewH * 0.42,
        Math.max(viewW, viewH) * 0.68,
      );
      bg.addColorStop(0, '#231652');
      bg.addColorStop(0.58, '#151031');
      bg.addColorStop(1, '#0b091b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, viewW, viewH);

      // Subtle board halo.
      ctx.save();
      ctx.shadowColor = 'rgba(31,22,69,.40)';
      ctx.shadowBlur = 34;
      roundedRect(
        layout.originX - 10,
        layout.originY - 10,
        layout.boardW + 20,
        layout.boardH + 20,
        28,
      );
      ctx.fillStyle = 'rgba(16,12,42,.88)';
      ctx.fill();
      ctx.restore();

      roundedRect(
        layout.originX - 8,
        layout.originY - 8,
        layout.boardW + 16,
        layout.boardH + 16,
        25,
      );
      ctx.fillStyle = '#130f32';
      ctx.fill();

      // Update motion before drawing.
      const motion = motionRef.current;
      let cubeR = playerRef.current.r;
      let cubeC = playerRef.current.c;
      let easedProgress = 1;

      if (motion && phase === 'playing') {
        const raw = clamp(
          (now - motion.startedAt) / motion.duration,
          0,
          1,
        );
        easedProgress = easeOutQuart(raw);

        cubeR =
          motion.from.r +
          (motion.to.r - motion.from.r) * easedProgress;
        cubeC =
          motion.from.c +
          (motion.to.c - motion.from.c) * easedProgress;

        const reached = Math.min(
          motion.path.length - 1,
          Math.floor(easedProgress * motion.path.length + 0.00001),
        );

        for (
          let index = motion.paintedUntil + 1;
          index <= reached;
          index += 1
        ) {
          if (index >= 0 && index < motion.path.length) {
            markPainted(motion.path[index], now);
            motion.paintedUntil = index;
          }
        }

        if (raw >= 1) {
          for (
            let index = motion.paintedUntil + 1;
            index < motion.path.length;
            index += 1
          ) {
            markPainted(motion.path[index], now);
          }

          playerRef.current = { ...motion.to };
          cubeR = motion.to.r;
          cubeC = motion.to.c;
          motionRef.current = null;

          const completed = finishLevelIfNeeded();

          if (!completed) {
            const queued = queuedDirRef.current;
            queuedDirRef.current = null;

            if (queued) {
              window.setTimeout(() => startMove(queued), 4);
            }
          }
        }
      }

      // Maze floor and blockers.
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const rect = cellRect(r, c);
          const key = `${r}:${c}`;
          const blocked = currentLevel.map[r][c] === '#';
          const radius = Math.max(7, layout.cell * 0.18);

          roundedRect(
            rect.x,
            rect.y,
            rect.size,
            rect.size,
            radius,
          );

          if (blocked) {
            const wallGradient = ctx.createLinearGradient(
              rect.x,
              rect.y,
              rect.x,
              rect.y + rect.size,
            );
            wallGradient.addColorStop(0, '#2f275f');
            wallGradient.addColorStop(1, '#201946');
            ctx.fillStyle = wallGradient;
            ctx.fill();

            ctx.save();
            ctx.strokeStyle = 'rgba(203,188,255,.28)';
            ctx.lineWidth = Math.max(1.2, layout.cell * 0.035);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = '#cabaff';
            ctx.lineWidth = Math.max(1, layout.cell * 0.03);
            ctx.beginPath();
            ctx.moveTo(rect.x + rect.size * 0.26, rect.y + rect.size * 0.26);
            ctx.lineTo(rect.x + rect.size * 0.74, rect.y + rect.size * 0.74);
            ctx.moveTo(rect.x + rect.size * 0.74, rect.y + rect.size * 0.26);
            ctx.lineTo(rect.x + rect.size * 0.26, rect.y + rect.size * 0.74);
            ctx.stroke();
            ctx.restore();
            continue;
          }

          const painted = paintedRef.current.has(key);
          const paintedAt = paintTimeRef.current.get(key) ?? -10000;
          const fillT = painted
            ? easePop(clamp((now - paintedAt) / TILE_FILL_MS, 0, 1))
            : 0;

          const floorGradient = ctx.createLinearGradient(
            rect.x,
            rect.y,
            rect.x,
            rect.y + rect.size,
          );
          floorGradient.addColorStop(0, '#fcfbff');
          floorGradient.addColorStop(1, '#efedf8');
          ctx.fillStyle = floorGradient;
          ctx.fill();

          ctx.save();
          ctx.strokeStyle = 'rgba(111,98,154,.16)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          if (painted) {
            const inset = (1 - clamp(fillT, 0, 1)) * layout.cell * 0.16;
            roundedRect(
              rect.x + inset,
              rect.y + inset,
              rect.size - inset * 2,
              rect.size - inset * 2,
              Math.max(6, layout.cell * 0.17),
            );

            const paintGradient = ctx.createLinearGradient(
              rect.x,
              rect.y,
              rect.x + rect.size,
              rect.y + rect.size,
            );
            paintGradient.addColorStop(0, '#7b57f4');
            paintGradient.addColorStop(0.55, '#6849eb');
            paintGradient.addColorStop(1, '#573bdb');
            ctx.fillStyle = paintGradient;
            ctx.fill();

            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#ffffff';
            roundedRect(
              rect.x + rect.size * 0.13,
              rect.y + rect.size * 0.10,
              rect.size * 0.70,
              rect.size * 0.14,
              rect.size * 0.08,
            );
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Moving paint glow.
      if (motion && phase === 'playing') {
        const current = cellCenter(cubeR, cubeC);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#9f86ff';
        ctx.beginPath();
        ctx.arc(
          current.x,
          current.y,
          Math.max(14, layout.cell * 0.42),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Sparks.
      const sparks = sparksRef.current;
      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index];
        spark.life += 1 / 60;

        if (spark.life >= spark.maxLife) {
          sparks.splice(index, 1);
          continue;
        }

        spark.x += spark.vx * (1 / 60) * 4;
        spark.y += spark.vy * (1 / 60) * 4;
        spark.vx *= 0.94;
        spark.vy *= 0.94;

        const center = cellCenter(
          spark.y - 0.5,
          spark.x - 0.5,
        );
        const alpha =
          (1 - spark.life / spark.maxLife) * spark.alpha;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#dcd4ff';
        ctx.beginPath();
        ctx.arc(
          center.x,
          center.y,
          Math.max(1, spark.size * layout.cell),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Player cube — flat, soft and tactile.
      const cubeCenter = cellCenter(cubeR, cubeC);
      const blockedAge = now - blockedPulseRef.current;
      const blockedKick =
        blockedAge >= 0 && blockedAge < 150
          ? Math.sin((blockedAge / 150) * Math.PI * 3) *
            layout.cell *
            0.035
          : 0;

      const motionNow = motionRef.current;
      const kickX =
        motionNow?.dir === 'up' || motionNow?.dir === 'down'
          ? blockedKick
          : 0;
      const kickY =
        motionNow?.dir === 'left' || motionNow?.dir === 'right'
          ? blockedKick
          : 0;

      const cubeSize = layout.cell * 0.67;
      const cubeX = cubeCenter.x - cubeSize / 2 + kickX;
      const cubeY = cubeCenter.y - cubeSize / 2 + kickY;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = layout.cell * 0.22;
      ctx.shadowOffsetY = layout.cell * 0.10;

      roundedRect(
        cubeX,
        cubeY,
        cubeSize,
        cubeSize,
        cubeSize * 0.29,
      );

      const cubeGradient = ctx.createLinearGradient(
        cubeX,
        cubeY,
        cubeX + cubeSize,
        cubeY + cubeSize,
      );
      cubeGradient.addColorStop(0, '#ffe07e');
      cubeGradient.addColorStop(0.5, '#f6c84e');
      cubeGradient.addColorStop(1, '#e1ad25');
      ctx.fillStyle = cubeGradient;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(95,65,5,.32)';
      ctx.lineWidth = Math.max(1.1, layout.cell * 0.03);
      roundedRect(
        cubeX,
        cubeY,
        cubeSize,
        cubeSize,
        cubeSize * 0.29,
      );
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.fillStyle = '#fff7d8';
      roundedRect(
        cubeX + cubeSize * 0.13,
        cubeY + cubeSize * 0.11,
        cubeSize * 0.72,
        cubeSize * 0.16,
        cubeSize * 0.09,
      );
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#8a5f10';
      roundedRect(
        cubeX + cubeSize * 0.22,
        cubeY + cubeSize * 0.58,
        cubeSize * 0.56,
        cubeSize * 0.13,
        cubeSize * 0.08,
      );
      ctx.fill();
      ctx.restore();

      // Tiny movement compression gives the cube a soft mobile-game feel.
      if (motionNow) {
        const pulse =
          Math.sin(easedProgress * Math.PI) * layout.cell * 0.025;
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#d9d1ff';
        ctx.beginPath();
        ctx.ellipse(
          cubeCenter.x,
          cubeCenter.y + cubeSize * 0.46,
          cubeSize * 0.32 + pulse,
          cubeSize * 0.09,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Completion flash.
      const flashAge = now - completeFlashRef.current;
      if (completeFlashRef.current > 0 && flashAge < 420) {
        const alpha =
          Math.sin(clamp(flashAge / 420, 0, 1) * Math.PI) * 0.22;
        ctx.fillStyle = `rgba(178,155,255,${alpha})`;
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
  }, [finishLevelIfNeeded, markPainted, phase, startMove]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

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
    if (!start || start.fired || phase !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;

    start.fired = true;
    startMove(directionFromDelta(dx, dy));
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerRef.current;
    pointerRef.current = null;

    if (!start || start.fired || phase !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;

    startMove(directionFromDelta(dx, dy));
  };

  const nextLevel = () => {
    setTotalMoves((value) => value + moves);
    resetLevel(Math.min(LEVELS.length - 1, levelIndex + 1));
  };

  const restartCurrent = () => resetLevel(levelIndex);

  const restartAll = () => {
    setTotalMoves(0);
    resetLevel(0);
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#0c0a20] text-white"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(98,74,200,.42),transparent_34%),radial-gradient(circle_at_12%_100%,rgba(75,45,182,.26),transparent_28%),linear-gradient(180deg,#21164b_0%,#130d31_38%,#0c0a20_100%)]" />

      <style>{`
        @keyframes cf-pop {
          from { opacity: 0; transform: translateY(8px) scale(.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes cf-hint {
          0%, 100% { transform: translateX(-6px); opacity: .28; }
          50% { transform: translateX(6px); opacity: .82; }
        }
      `}</style>

      <header className="relative z-30 flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#110d2b]/58 backdrop-blur-md px-3">
        <div className="min-w-[92px]">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.14em] text-white/30">
            Filled
          </p>
          <strong className="mt-[1px] block py-[1px] text-[18px] font-black leading-[1.38] tabular-nums text-[#f5c94f]">
            {progress}%
          </strong>
        </div>

        <div className="absolute left-1/2 top-1/2 min-w-[132px] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.19em] text-white/28">
            Cube Fill
          </p>
          <p className="mt-[1px] truncate py-[1px] text-[10px] font-black leading-[1.45] text-white/92">
            {level.name}
          </p>
          <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/23">
            Level {levelIndex + 1}/{LEVELS.length}
          </p>
        </div>

        <div className="min-w-[92px] text-right">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.14em] text-white/30">
            Moves
          </p>
          <strong className="mt-[1px] block py-[1px] text-[18px] font-black leading-[1.38] tabular-nums text-white/88">
            {moves}
          </strong>
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto min-h-0 w-full max-w-[460px] flex-1 touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />

        <div className="pointer-events-none absolute inset-x-5 top-4 z-20">
          <div className="h-[4px] overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#f5c94f,#ffde7e)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {hintVisible && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 text-center">
            <div className="mx-auto w-fit rounded-full border border-white/[0.09] bg-[#140f36]/80 px-3 py-2 backdrop-blur-sm">
              <div
                className="mx-auto mb-1 h-[2px] w-8 rounded-full bg-[#f5c94f]"
                style={{
                  animation: 'cf-hint 1.05s ease-in-out infinite',
                }}
              />
              <p className="py-[1px] text-[6px] font-black uppercase leading-[1.45] tracking-[.13em] text-white/42">
                Swipe · Fill every cell
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={restartCurrent}
          className="absolute bottom-4 right-4 z-30 rounded-[12px] border border-white/[0.09] bg-[#110c31]/82 px-2.5 py-2 text-[6px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/38 backdrop-blur-md transition active:scale-[.97]"
        >
          Restart
        </button>
      </div>

      {phase === 'level_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#080619]/76 px-4 backdrop-blur-[6px]">
          <div
            className="relative w-full max-w-[286px] overflow-hidden rounded-[24px] border border-[#7d69c2]/34 bg-[#120d30]/[.99] px-4 pb-4 pt-5 text-center shadow-[0_28px_90px_rgba(0,0,0,.62)]"
            style={{ animation: 'cf-pop .25s ease-out both' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_50%_0%,rgba(157,124,255,.20),transparent_70%)]" />

            <div className="relative">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-[14px] border border-[#f5c94f]/38 bg-[#f5c94f]/12">
                <span className="pt-[2px] text-[17px] font-black leading-[1.35] text-[#f5c94f]">
                  ✓
                </span>
              </div>

              <p className="mt-3 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.17em] text-white/28">
                Level complete
              </p>
              <h2 className="mt-1 py-[2px] text-[18px] font-black leading-[1.4] text-white">
                {level.name}
              </h2>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/25">
                    Moves
                  </span>
                  <strong className="mt-1 block py-[1px] text-[16px] font-black leading-[1.4] text-[#f5c94f]">
                    {moves}
                  </strong>
                </div>

                <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/25">
                    Par
                  </span>
                  <strong className="mt-1 block py-[1px] text-[16px] font-black leading-[1.4] text-white/70">
                    {level.optimal}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={nextLevel}
                className="mt-3 w-full rounded-[14px] bg-[linear-gradient(180deg,#f5c94f,#e1ad25)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.10em] text-white shadow-[0_10px_26px_rgba(118,83,238,.22)] transition active:translate-y-[1px] active:scale-[.985]"
              >
                NEXT LEVEL
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'all_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#080619]/80 px-4 backdrop-blur-[7px]">
          <div
            className="relative w-full max-w-[292px] overflow-hidden rounded-[25px] border border-[#7d69c2]/34 bg-[#120d30]/[.99] px-4 pb-4 pt-5 text-center shadow-[0_30px_100px_rgba(0,0,0,.66)]"
            style={{ animation: 'cf-pop .25s ease-out both' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,rgba(157,124,255,.22),transparent_70%)]" />

            <div className="relative">
              <div className="mx-auto grid h-13 w-13 place-items-center rounded-[16px] border border-[#b49cff]/38 bg-[#f5c94f]/14">
                <div className="h-6 w-6 rounded-[7px] bg-[linear-gradient(135deg,#ab8cff,#7552ed)] shadow-[0_0_20px_rgba(157,124,255,.32)]" />
              </div>

              <p className="mt-3 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.17em] text-white/28">
                Cube Fill
              </p>
              <h2 className="mt-1 py-[2px] text-[19px] font-black uppercase leading-[1.4] text-[#f5c94f]">
                ВСЕ КАРТЫ ПРОЙДЕНЫ
              </h2>

              <div className="mt-3 rounded-[14px] border border-white/[0.065] bg-white/[0.025] px-3 py-3">
                <p className="text-[5.5px] font-black uppercase leading-[1.5] tracking-[.11em] text-white/25">
                  Total moves
                </p>
                <strong className="mt-1 block py-[1px] text-[20px] font-black leading-[1.4] text-white">
                  {totalMoves + moves}
                </strong>
              </div>

              <button
                type="button"
                onClick={restartAll}
                className="mt-3 w-full rounded-[14px] bg-[linear-gradient(180deg,#f5c94f,#e1ad25)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.10em] text-white transition active:scale-[.985]"
              >
                PLAY AGAIN
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[7px] font-black uppercase leading-[1.5] tracking-[.10em] text-white/42 transition active:scale-[.985]"
              >
                НА ГЛАВНУЮ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}