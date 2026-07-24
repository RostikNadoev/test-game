import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CUBE_FILL_LEVELS,
  type CubeFillLevel,
} from '../data/cubeFillLevels';

type Dir = 'up' | 'down' | 'left' | 'right';
type Cell = { r: number; c: number };
type Phase = 'playing' | 'level_complete' | 'all_complete';


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
};


const DIRS: Record<Dir, Cell> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

const DPR_CAP = 1.3;
const SWIPE_THRESHOLD = 5;
const HUD_SYNC_MS = 85;
const MAX_SPARKS = 14;

const keyOf = (cell: Cell) => `${cell.r}:${cell.c}`;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const easeOutQuart = (t: number) => {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 4);
};

function isBlocked(level: CubeFillLevel, r: number, c: number) {
  return (
    r < 0 ||
    c < 0 ||
    r >= level.map.length ||
    c >= level.map[0].length ||
    level.map[r][c] === '#'
  );
}

function floorCells(level: CubeFillLevel) {
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

function getSlidePath(level: CubeFillLevel, from: Cell, dir: Dir) {
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
  return clamp(92 + cellCount * 40, 132, 365);
}

function formatPercent(current: number, total: number) {
  if (!total) return 0;
  return Math.round((current / total) * 100);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export default function CubeFillGame() {
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const layoutRef = useRef<Layout>({
    cell: 46,
    gap: 3,
    originX: 20,
    originY: 80,
    boardW: 340,
    boardH: 340,
  });

  const [levelIndex, setLevelIndex] = useState(0);
  const [moves, setMoves] = useState(0);
  const [paintedCount, setPaintedCount] = useState(1);
  const [phase, setPhase] = useState<Phase>('playing');
  const [totalMoves, setTotalMoves] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const level = CUBE_FILL_LEVELS[levelIndex];
  const levelRef = useRef<CubeFillLevel>(level);
  const playerRef = useRef<Cell>({ ...level.start });
  const motionRef = useRef<Motion | null>(null);
  const queuedDirRef = useRef<Dir | null>(null);
  const paintedRef = useRef<Set<string>>(new Set([keyOf(level.start)]));
  const pointerRef = useRef<{
    x: number;
    y: number;
    fired: boolean;
  } | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const blockedPulseRef = useRef(0);
  const completionTimerRef = useRef<number | null>(null);
  const completeFlashRef = useRef(0);
  const lastHudSyncRef = useRef(0);

  const levelFloors = useMemo(() => floorCells(level), [level]);
  const totalPaintable = levelFloors.length;
  const progress = formatPercent(paintedCount, totalPaintable);

  const getCellRect = useCallback((r: number, c: number) => {
    const layout = layoutRef.current;

    return {
      x: layout.originX + c * layout.cell + layout.gap * 0.5,
      y: layout.originY + r * layout.cell + layout.gap * 0.5,
      size: layout.cell - layout.gap,
    };
  }, []);

  const getCellCenter = useCallback((r: number, c: number) => {
    const layout = layoutRef.current;

    return {
      x: layout.originX + (c + 0.5) * layout.cell,
      y: layout.originY + (r + 0.5) * layout.cell,
    };
  }, []);

  const drawPaintedCellToCache = useCallback(
    (cell: Cell) => {
      const cache = paintCanvasRef.current;
      if (!cache) return;

      const ctx = cache.getContext('2d');
      if (!ctx) return;

      const rect = getCellRect(cell.r, cell.c);
      const radius = Math.max(6, layoutRef.current.cell * 0.17);

      roundedRectPath(
        ctx,
        rect.x,
        rect.y,
        rect.size,
        rect.size,
        radius,
      );

      ctx.fillStyle = '#6c4bea';
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#ffffff';
      roundedRectPath(
        ctx,
        rect.x + rect.size * 0.12,
        rect.y + rect.size * 0.1,
        rect.size * 0.7,
        rect.size * 0.13,
        rect.size * 0.065,
      );
      ctx.fill();
      ctx.restore();
    },
    [getCellRect],
  );

  const rebuildCaches = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const currentLevel = levelRef.current;
    const rows = currentLevel.map.length;
    const cols = currentLevel.map[0].length;

    const maxBoardW = Math.min(width - 24, 400);
    const maxBoardH = Math.min(height - 92, 440);
    const cell = Math.max(
      31,
      Math.min(
        55,
        Math.min(maxBoardW / cols, maxBoardH / rows),
      ),
    );
    const gap = Math.max(2.2, cell * 0.052);
    const boardW = cols * cell;
    const boardH = rows * cell;
    const originX = (width - boardW) / 2;
    const originY = Math.max(34, (height - boardH) / 2 - 2);

    layoutRef.current = {
      cell,
      gap,
      originX,
      originY,
      boardW,
      boardH,
    };

    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = Math.max(1, Math.floor(width));
    staticCanvas.height = Math.max(1, Math.floor(height));

    const staticCtx = staticCanvas.getContext('2d', { alpha: false });
    if (!staticCtx) return;

    const bg = staticCtx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#20164a');
    bg.addColorStop(0.48, '#151033');
    bg.addColorStop(1, '#0c0a20');
    staticCtx.fillStyle = bg;
    staticCtx.fillRect(0, 0, width, height);

    const boardX = originX - 9;
    const boardY = originY - 9;
    const boardOuterW = boardW + 18;
    const boardOuterH = boardH + 18;

    roundedRectPath(
      staticCtx,
      boardX,
      boardY,
      boardOuterW,
      boardOuterH,
      25,
    );
    staticCtx.fillStyle = '#0f0b29';
    staticCtx.fill();

    staticCtx.save();
    staticCtx.strokeStyle = 'rgba(177,155,255,.22)';
    staticCtx.lineWidth = 1.4;
    staticCtx.stroke();
    staticCtx.restore();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const rect = {
          x: originX + c * cell + gap * 0.5,
          y: originY + r * cell + gap * 0.5,
          size: cell - gap,
        };
        const radius = Math.max(7, cell * 0.18);
        const blocked = currentLevel.map[r][c] === '#';

        roundedRectPath(
          staticCtx,
          rect.x,
          rect.y,
          rect.size,
          rect.size,
          radius,
        );

        if (blocked) {
          const wall = staticCtx.createLinearGradient(
            rect.x,
            rect.y,
            rect.x,
            rect.y + rect.size,
          );
          wall.addColorStop(0, '#383068');
          wall.addColorStop(1, '#25204e');
          staticCtx.fillStyle = wall;
          staticCtx.fill();

          staticCtx.save();
          staticCtx.strokeStyle = 'rgba(214,202,255,.36)';
          staticCtx.lineWidth = Math.max(1.3, cell * 0.034);
          staticCtx.stroke();
          staticCtx.restore();

          staticCtx.save();
          staticCtx.globalAlpha = 0.2;
          staticCtx.strokeStyle = '#d1c6ff';
          staticCtx.lineWidth = Math.max(1, cell * 0.025);
          staticCtx.beginPath();
          staticCtx.moveTo(
            rect.x + rect.size * 0.28,
            rect.y + rect.size * 0.28,
          );
          staticCtx.lineTo(
            rect.x + rect.size * 0.72,
            rect.y + rect.size * 0.72,
          );
          staticCtx.moveTo(
            rect.x + rect.size * 0.72,
            rect.y + rect.size * 0.28,
          );
          staticCtx.lineTo(
            rect.x + rect.size * 0.28,
            rect.y + rect.size * 0.72,
          );
          staticCtx.stroke();
          staticCtx.restore();

          continue;
        }

        const tile = staticCtx.createLinearGradient(
          rect.x,
          rect.y,
          rect.x,
          rect.y + rect.size,
        );
        tile.addColorStop(0, '#fffefe');
        tile.addColorStop(1, '#efedf8');
        staticCtx.fillStyle = tile;
        staticCtx.fill();

        staticCtx.save();
        staticCtx.strokeStyle = 'rgba(83,71,126,.14)';
        staticCtx.lineWidth = 1;
        staticCtx.stroke();
        staticCtx.restore();
      }
    }

    staticCanvasRef.current = staticCanvas;

    const paintCanvas = document.createElement('canvas');
    paintCanvas.width = Math.max(1, Math.floor(width));
    paintCanvas.height = Math.max(1, Math.floor(height));
    paintCanvasRef.current = paintCanvas;

    for (const key of paintedRef.current) {
      const [r, c] = key.split(':').map(Number);
      drawPaintedCellToCache({ r, c });
    }
  }, [drawPaintedCellToCache]);

  const spawnSparks = useCallback((cell: Cell) => {
    const list = sparksRef.current;

    for (
      let index = 0;
      index < 2 && list.length < MAX_SPARKS;
      index += 1
    ) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.18 + Math.random() * 0.35;

      list.push({
        x: cell.c + 0.5,
        y: cell.r + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.14 + Math.random() * 0.12,
        size: 0.035 + Math.random() * 0.035,
      });
    }
  }, []);

  const markPainted = useCallback(
    (cell: Cell, now: number) => {
      const key = keyOf(cell);
      if (paintedRef.current.has(key)) return;

      paintedRef.current.add(key);
      drawPaintedCellToCache(cell);
      spawnSparks(cell);

      if (
        now - lastHudSyncRef.current >= HUD_SYNC_MS ||
        paintedRef.current.size >= floorCells(levelRef.current).length
      ) {
        lastHudSyncRef.current = now;
        setPaintedCount(paintedRef.current.size);
      }
    },
    [drawPaintedCellToCache, spawnSparks],
  );

  const finishLevelIfNeeded = useCallback(() => {
    const total = floorCells(levelRef.current).length;

    if (paintedRef.current.size < total) return false;

    setPaintedCount(total);
    queuedDirRef.current = null;
    completeFlashRef.current = performance.now();

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = window.setTimeout(() => {
      if (levelIndex >= CUBE_FILL_LEVELS.length - 1) {
        setPhase('all_complete');
      } else {
        setPhase('level_complete');
      }

      completionTimerRef.current = null;
    }, 420);

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

      const destination = path[path.length - 1];

      motionRef.current = {
        from: { ...from },
        to: { ...destination },
        path,
        startedAt: performance.now(),
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

  const resetLevel = useCallback(
    (index: number) => {
      const nextLevel = CUBE_FILL_LEVELS[index];

      levelRef.current = nextLevel;
      playerRef.current = { ...nextLevel.start };
      motionRef.current = null;
      queuedDirRef.current = null;
      paintedRef.current = new Set([keyOf(nextLevel.start)]);
      sparksRef.current = [];
      blockedPulseRef.current = 0;
      completeFlashRef.current = 0;
      lastHudSyncRef.current = 0;

      setLevelIndex(index);
      setMoves(0);
      setPaintedCount(1);
      setPhase('playing');
      setHintVisible(true);

      window.requestAnimationFrame(rebuildCaches);
    },
    [rebuildCaches],
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

      rebuildCaches();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [rebuildCaches]);

  useEffect(() => {
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      if (!ctx) {
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;
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
              window.setTimeout(() => startMove(queued), 0);
            }
          }
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (staticCanvasRef.current) {
        ctx.drawImage(
          staticCanvasRef.current,
          0,
          0,
          viewW,
          viewH,
        );
      } else {
        ctx.fillStyle = '#120d2d';
        ctx.fillRect(0, 0, viewW, viewH);
      }

      if (paintCanvasRef.current) {
        ctx.drawImage(
          paintCanvasRef.current,
          0,
          0,
          viewW,
          viewH,
        );
      }

      const layout = layoutRef.current;

      for (
        let index = sparksRef.current.length - 1;
        index >= 0;
        index -= 1
      ) {
        const spark = sparksRef.current[index];
        spark.life += 0.016;

        if (spark.life >= spark.maxLife) {
          sparksRef.current.splice(index, 1);
          continue;
        }

        spark.x += spark.vx * 0.055;
        spark.y += spark.vy * 0.055;
        spark.vx *= 0.92;
        spark.vy *= 0.92;

        const center = getCellCenter(
          spark.y - 0.5,
          spark.x - 0.5,
        );
        const alpha = 1 - spark.life / spark.maxLife;

        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = '#eee9ff';
        ctx.beginPath();
        ctx.arc(
          center.x,
          center.y,
          Math.max(1, spark.size * layout.cell),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      const cubeCenter = getCellCenter(cubeR, cubeC);
      const blockedAge = now - blockedPulseRef.current;
      const blockedKick =
        blockedAge >= 0 && blockedAge < 130
          ? Math.sin((blockedAge / 130) * Math.PI * 3) *
            layout.cell *
            0.028
          : 0;

      const currentMotion = motionRef.current;
      const kickX =
        currentMotion?.dir === 'up' ||
        currentMotion?.dir === 'down'
          ? blockedKick
          : 0;
      const kickY =
        currentMotion?.dir === 'left' ||
        currentMotion?.dir === 'right'
          ? blockedKick
          : 0;

      const squash =
        currentMotion !== null
          ? Math.sin(easedProgress * Math.PI) * 0.045
          : 0;

      const baseSize = layout.cell * 0.7;
      const cubeW = baseSize * (1 + squash);
      const cubeH = baseSize * (1 - squash * 0.55);
      const cubeX = cubeCenter.x - cubeW / 2 + kickX;
      const cubeY = cubeCenter.y - cubeH / 2 + kickY;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = layout.cell * 0.14;
      ctx.shadowOffsetY = layout.cell * 0.08;

      roundedRectPath(
        ctx,
        cubeX,
        cubeY,
        cubeW,
        cubeH,
        baseSize * 0.29,
      );

      const cubeGradient = ctx.createLinearGradient(
        cubeX,
        cubeY,
        cubeX,
        cubeY + cubeH,
      );
      cubeGradient.addColorStop(0, '#ffe788');
      cubeGradient.addColorStop(0.48, '#f6ca50');
      cubeGradient.addColorStop(1, '#dfa925');
      ctx.fillStyle = cubeGradient;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(95,63,5,.42)';
      ctx.lineWidth = Math.max(1.2, layout.cell * 0.03);
      roundedRectPath(
        ctx,
        cubeX,
        cubeY,
        cubeW,
        cubeH,
        baseSize * 0.29,
      );
      ctx.stroke();

      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#fff8db';
      roundedRectPath(
        ctx,
        cubeX + cubeW * 0.14,
        cubeY + cubeH * 0.11,
        cubeW * 0.7,
        cubeH * 0.15,
        cubeH * 0.07,
      );
      ctx.fill();
      ctx.restore();

      const flashAge = now - completeFlashRef.current;

      if (
        completeFlashRef.current > 0 &&
        flashAge >= 0 &&
        flashAge < 360
      ) {
        const alpha =
          Math.sin(clamp(flashAge / 360, 0, 1) * Math.PI) * 0.16;

        ctx.fillStyle = `rgba(255,226,120,${alpha})`;
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
  }, [
    finishLevelIfNeeded,
    getCellCenter,
    markPainted,
    phase,
    startMove,
  ]);

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

    if (!start || start.fired || phase !== 'playing') {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) {
      return;
    }

    start.fired = true;
    startMove(directionFromDelta(dx, dy));
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const start = pointerRef.current;
    pointerRef.current = null;

    if (!start || start.fired || phase !== 'playing') {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) {
      return;
    }

    startMove(directionFromDelta(dx, dy));
  };

  const nextLevel = () => {
    setTotalMoves((value) => value + moves);
    resetLevel(Math.min(CUBE_FILL_LEVELS.length - 1, levelIndex + 1));
  };

  const restartCurrent = () => resetLevel(levelIndex);

  const restartAll = () => {
    setTotalMoves(0);
    resetLevel(0);
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#20164a_0%,#151033_48%,#0c0a20_100%)]" />

      <style>{`
        @keyframes cf-pop {
          from { opacity: 0; transform: translateY(7px) scale(.975); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes cf-hint {
          0%, 100% { transform: translateX(-5px); opacity: .26; }
          50% { transform: translateX(5px); opacity: .78; }
        }
      `}</style>

      <header className="relative z-30 flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#171137]/72 px-3">
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

          <p className="mt-[1px] py-[1px] text-[10px] font-black uppercase leading-[1.45] text-white/92">
            Level {levelIndex + 1}
          </p>

          <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.1em] text-white/23">
            {levelIndex + 1} / {CUBE_FILL_LEVELS.length}
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

        <div className="pointer-events-none absolute inset-x-5 top-3 z-20">
          <div className="h-[4px] overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#e5b735,#ffe47f)] transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {hintVisible && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 text-center">
            <div className="mx-auto w-fit rounded-full border border-white/[0.08] bg-[#140f36]/88 px-3 py-2">
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
          className="absolute bottom-4 right-4 z-30 rounded-[11px] border border-white/[0.08] bg-[#140f36]/92 px-2.5 py-2 text-[6px] font-black uppercase leading-[1.45] tracking-[.1em] text-white/42 transition active:scale-[.97]"
        >
          Restart
        </button>
      </div>

      {phase === 'level_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#080619]/80 px-4 backdrop-blur-[4px]">
          <div
            className="relative w-full max-w-[282px] overflow-hidden rounded-[23px] border border-[#8b78ce]/32 bg-[#120d30]/[.99] px-4 pb-4 pt-5 text-center shadow-[0_26px_80px_rgba(0,0,0,.6)]"
            style={{ animation: 'cf-pop .24s ease-out both' }}
          >
            <div className="relative">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-[14px] border border-[#f5c94f]/38 bg-[#f5c94f]/10">
                <span className="pt-[2px] text-[17px] font-black leading-[1.35] text-[#f5c94f]">
                  ✓
                </span>
              </div>

              <p className="mt-3 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.17em] text-white/28">
                Level complete
              </p>

              <h2 className="mt-1 py-[2px] text-[18px] font-black uppercase leading-[1.4] text-white">
                LEVEL {levelIndex + 1} COMPLETE
              </h2>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.1em] text-white/25">
                    Moves
                  </span>

                  <strong className="mt-1 block py-[1px] text-[16px] font-black leading-[1.4] text-[#f5c94f]">
                    {moves}
                  </strong>
                </div>

                <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.1em] text-white/25">
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
                className="mt-3 w-full rounded-[14px] bg-[linear-gradient(180deg,#f7d15f,#dfad2b)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.1em] text-[#241a05] transition active:scale-[.985]"
              >
                NEXT LEVEL
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'all_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#080619]/82 px-4 backdrop-blur-[4px]">
          <div
            className="relative w-full max-w-[288px] overflow-hidden rounded-[24px] border border-[#8b78ce]/32 bg-[#120d30]/[.99] px-4 pb-4 pt-5 text-center shadow-[0_28px_90px_rgba(0,0,0,.64)]"
            style={{ animation: 'cf-pop .24s ease-out both' }}
          >
            <div className="relative">
              <div className="mx-auto grid h-13 w-13 place-items-center rounded-[16px] border border-[#f5c94f]/38 bg-[#f5c94f]/10">
                <div className="h-6 w-6 rounded-[7px] bg-[linear-gradient(180deg,#ffe47f,#e0ad2a)]" />
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
                className="mt-3 w-full rounded-[14px] bg-[linear-gradient(180deg,#f7d15f,#dfad2b)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.1em] text-[#241a05] transition active:scale-[.985]"
              >
                PLAY AGAIN
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[7px] font-black uppercase leading-[1.5] tracking-[.1em] text-white/42 transition active:scale-[.985]"
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
