import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import {
  CUBE_FILL_LEVELS,
  type CubeFillLevel,
} from '../data/cubeFillLevels';
import {
  useCubeFillOnline,
  type CubeFillDirection,
  type CubeFillPlayerProfile,
} from '../hooks/useCubeFillOnline';

type Dir = CubeFillDirection;
type Cell = { r: number; c: number };

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

const IS_MOBILE_RENDER =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 640);

const DPR_CAP = IS_MOBILE_RENDER ? 1 : 1.15;
const SWIPE_THRESHOLD = 5;
const HUD_SYNC_MS = IS_MOBILE_RENDER ? 180 : 120;
const MAX_SPARKS = IS_MOBILE_RENDER ? 0 : 4;
const ROUND_LEVELS = 4;

const keyOf = (cell: Cell) => `${cell.r}:${cell.c}`;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const easeOutQuart = (t: number) => {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 4);
};

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const formatReward = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));

const initials = (name: string) =>
  name.replace('@', '').trim().slice(0, 2).toUpperCase() || 'TG';

function isBlocked(level: CubeFillLevel, r: number, c: number) {
  return (
    r < 0 ||
    c < 0 ||
    r >= level.map.length ||
    c >= level.map[0].length ||
    level.map[r][c] === '#'
  );
}

function floorCount(level: CubeFillLevel) {
  let result = 0;

  for (const row of level.map) {
    for (const cell of row) {
      if (cell !== '#') {
        result += 1;
      }
    }
  }

  return result;
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
  return clamp(88 + cellCount * 38, 126, 345);
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

function PlayerAvatar({
  profile,
  size = 36,
}: {
  profile: CubeFillPlayerProfile;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-[13px] border border-white/[0.11] bg-white/[0.07] text-[8px] font-black uppercase leading-[1.4] text-[#f5c94f]"
      style={{ width: size, height: size }}
    >
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
  );
}

function CountUp({
  target,
  active,
  duration = 650,
  decimals = 0,
  suffix = '',
}: {
  target: number;
  active: boolean;
  duration?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const t = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);

      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, duration, target]);

  if (!active) {
    return <span>—</span>;
  }

  return (
    <span>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function CubeFillGame() {
  const match = useCubeFillOnline();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const renderDprRef = useRef(1);
  const lastCanvasSizeRef = useRef({ width: 0, height: 0, dpr: 0 });
  const rafRef = useRef<number | null>(null);

  const layoutRef = useRef<Layout>({
    cell: 46,
    gap: 3,
    originX: 20,
    originY: 80,
    boardW: 340,
    boardH: 340,
  });

  const [levelSlot, setLevelSlot] = useState(0);
  const [paintedCount, setPaintedCount] = useState(1);
  const [hintVisible, setHintVisible] = useState(true);
  const [localFinished, setLocalFinished] = useState(false);
  const [transitionLevel, setTransitionLevel] = useState<number | null>(null);
  const [resultStage, setResultStage] = useState(0);

  const selectedIndices = useMemo(() => {
    if (match.levelIndices.length >= ROUND_LEVELS) {
      return match.levelIndices
        .slice(0, ROUND_LEVELS)
        .map((value) =>
          clamp(
            Math.trunc(value),
            0,
            CUBE_FILL_LEVELS.length - 1,
          ),
        );
    }

    return [0, 1, 2, 3];
  }, [match.levelIndices]);

  const selectionKey = selectedIndices.join(':');
  const selectedIndicesRef = useRef(selectedIndices);
  const levelIndex = selectedIndices[levelSlot] ?? selectedIndices[0] ?? 0;
  const level = CUBE_FILL_LEVELS[levelIndex];

  const levelRef = useRef<CubeFillLevel>(level);
  const playerRef = useRef<Cell>({ ...level.start });
  const motionRef = useRef<Motion | null>(null);
  const queuedDirRef = useRef<Dir | null>(null);
  const paintedRef = useRef<Set<string>>(
    new Set([keyOf(level.start)]),
  );
  const pointerRef = useRef<{
    x: number;
    y: number;
    fired: boolean;
  } | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const blockedPulseRef = useRef(0);
  const completionTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const lastHudSyncRef = useRef(0);
  const localFinishedRef = useRef(false);
  const levelSlotRef = useRef(0);

  const totalPaintable = useMemo(() => floorCount(level), [level]);
  const localProgress = totalPaintable
    ? Math.round((paintedCount / totalPaintable) * 100)
    : 0;

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
      const ctx = paintContextRef.current;
      if (!ctx) {
        return;
      }

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
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      roundedRectPath(
        ctx,
        rect.x + rect.size * 0.12,
        rect.y + rect.size * 0.1,
        rect.size * 0.7,
        rect.size * 0.12,
        rect.size * 0.06,
      );
      ctx.fill();
      ctx.restore();
    },
    [getCellRect],
  );

  const rebuildCaches = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
      return;
    }

    const currentLevel = levelRef.current;
    const rows = currentLevel.map.length;
    const cols = currentLevel.map[0].length;

    const maxBoardW = Math.min(width - 22, 404);
    const maxBoardH = Math.min(height - 76, 448);
    const cell = Math.max(
      31,
      Math.min(
        56,
        Math.min(maxBoardW / cols, maxBoardH / rows),
      ),
    );
    const gap = Math.max(2.1, cell * 0.05);
    const boardW = cols * cell;
    const boardH = rows * cell;
    const originX = (width - boardW) / 2;
    const originY = Math.max(30, (height - boardH) / 2);

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

    const staticCtx = staticCanvas.getContext('2d', {
      alpha: false,
    });

    if (!staticCtx) {
      return;
    }

    const background = staticCtx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#20164a');
    background.addColorStop(0.48, '#151033');
    background.addColorStop(1, '#0c0a20');

    staticCtx.fillStyle = background;
    staticCtx.fillRect(0, 0, width, height);

    roundedRectPath(
      staticCtx,
      originX - 9,
      originY - 9,
      boardW + 18,
      boardH + 18,
      25,
    );
    staticCtx.fillStyle = '#0f0b29';
    staticCtx.fill();

    staticCtx.save();
    staticCtx.strokeStyle = 'rgba(177,155,255,.2)';
    staticCtx.lineWidth = 1.2;
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
          wall.addColorStop(0, '#39316a');
          wall.addColorStop(1, '#25204e');
          staticCtx.fillStyle = wall;
          staticCtx.fill();

          staticCtx.save();
          staticCtx.strokeStyle = 'rgba(220,208,255,.36)';
          staticCtx.lineWidth = Math.max(1.2, cell * 0.032);
          staticCtx.stroke();
          staticCtx.restore();

          staticCtx.save();
          staticCtx.globalAlpha = 0.18;
          staticCtx.strokeStyle = '#d4caff';
          staticCtx.lineWidth = Math.max(1, cell * 0.024);
          staticCtx.beginPath();
          staticCtx.moveTo(
            rect.x + rect.size * 0.29,
            rect.y + rect.size * 0.29,
          );
          staticCtx.lineTo(
            rect.x + rect.size * 0.71,
            rect.y + rect.size * 0.71,
          );
          staticCtx.moveTo(
            rect.x + rect.size * 0.71,
            rect.y + rect.size * 0.29,
          );
          staticCtx.lineTo(
            rect.x + rect.size * 0.29,
            rect.y + rect.size * 0.71,
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
        staticCtx.strokeStyle = 'rgba(83,71,126,.13)';
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
    paintContextRef.current = paintCanvas.getContext('2d');

    for (const key of paintedRef.current) {
      const [r, c] = key.split(':').map(Number);
      drawPaintedCellToCache({ r, c });
    }
  }, [drawPaintedCellToCache]);

  const resetBoard = useCallback(
    (slot: number) => {
      const sourceIndex =
        selectedIndicesRef.current[slot] ??
        selectedIndicesRef.current[0] ??
        0;
      const nextLevel =
        CUBE_FILL_LEVELS[
          clamp(sourceIndex, 0, CUBE_FILL_LEVELS.length - 1)
        ];

      levelSlotRef.current = slot;
      levelRef.current = nextLevel;
      playerRef.current = { ...nextLevel.start };
      motionRef.current = null;
      queuedDirRef.current = null;
      paintedRef.current = new Set([keyOf(nextLevel.start)]);
      sparksRef.current = [];
      blockedPulseRef.current = 0;
      lastHudSyncRef.current = 0;

      setLevelSlot(slot);
      setPaintedCount(1);
      setHintVisible(slot === 0);

      window.requestAnimationFrame(rebuildCaches);
    },
    [rebuildCaches],
  );

  useEffect(() => {
    selectedIndicesRef.current = selectedIndices;
  }, [selectedIndices]);

  useEffect(() => {
    if (match.matchInstanceKey <= 0) {
      return;
    }

    localFinishedRef.current = false;
    setLocalFinished(false);
    setTransitionLevel(null);
    resetBoard(0);
  }, [match.matchInstanceKey, resetBoard, selectionKey]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  const spawnSpark = useCallback((cell: Cell) => {
    if (MAX_SPARKS <= 0 || sparksRef.current.length >= MAX_SPARKS) {
      return;
    }

    const angle = Math.random() * Math.PI * 2;

    sparksRef.current.push({
      x: cell.c + 0.5,
      y: cell.r + 0.5,
      vx: Math.cos(angle) * 0.25,
      vy: Math.sin(angle) * 0.25,
      life: 0,
      maxLife: 0.18,
      size: 0.04,
    });
  }, []);

  const markPainted = useCallback(
    (cell: Cell, now: number) => {
      const key = keyOf(cell);

      if (paintedRef.current.has(key)) {
        return;
      }

      paintedRef.current.add(key);
      drawPaintedCellToCache(cell);
      spawnSpark(cell);

      if (
        now - lastHudSyncRef.current >= HUD_SYNC_MS ||
        paintedRef.current.size >= floorCount(levelRef.current)
      ) {
        lastHudSyncRef.current = now;
        setPaintedCount(paintedRef.current.size);
      }
    },
    [drawPaintedCellToCache, spawnSpark],
  );

  const finishLocalLevelIfNeeded = useCallback(() => {
    const total = floorCount(levelRef.current);

    if (paintedRef.current.size < total) {
      return false;
    }

    setPaintedCount(total);
    queuedDirRef.current = null;

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = window.setTimeout(() => {
      const currentSlot = levelSlotRef.current;

      if (currentSlot >= ROUND_LEVELS - 1) {
        localFinishedRef.current = true;
        setLocalFinished(true);
        setTransitionLevel(null);
      } else {
        const nextSlot = currentSlot + 1;
        setTransitionLevel(nextSlot + 1);
        resetBoard(nextSlot);

        if (transitionTimerRef.current !== null) {
          window.clearTimeout(transitionTimerRef.current);
        }

        transitionTimerRef.current = window.setTimeout(() => {
          setTransitionLevel(null);
          transitionTimerRef.current = null;
        }, 520);
      }

      completionTimerRef.current = null;
    }, 170);

    return true;
  }, [resetBoard]);

  const startMove = useCallback(
    (dir: Dir) => {
      if (
        match.phaseRef.current !== 'playing' ||
        localFinishedRef.current
      ) {
        return false;
      }

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
      setHintVisible(false);

      match.sendSwipe(dir, levelSlotRef.current + 1);
      return true;
    },
    [match.phaseRef, match.sendSwipe],
  );

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

      if (!dir) {
        return;
      }

      event.preventDefault();
      startMove(dir);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [startMove]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;

    if (!wrap || !canvas) {
      return;
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr));
      const previous = lastCanvasSizeRef.current;

      renderDprRef.current = dpr;

      if (
        previous.width === nextWidth &&
        previous.height === nextHeight &&
        previous.dpr === dpr
      ) {
        return;
      }

      lastCanvasSizeRef.current = {
        width: nextWidth,
        height: nextHeight,
        dpr,
      };

      canvas.width = nextWidth;
      canvas.height = nextHeight;
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
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      return;
    }

    const render = (now: number) => {
      const dpr = renderDprRef.current;
      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;
      const motion = motionRef.current;

      let cubeR = playerRef.current.r;
      let cubeC = playerRef.current.c;
      let easedProgress = 1;

      if (
        motion &&
        match.phaseRef.current === 'playing' &&
        !localFinishedRef.current
      ) {
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

          const completed = finishLocalLevelIfNeeded();

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

        spark.x += spark.vx * 0.05;
        spark.y += spark.vy * 0.05;

        const center = getCellCenter(
          spark.y - 0.5,
          spark.x - 0.5,
        );
        const alpha = 1 - spark.life / spark.maxLife;

        ctx.globalAlpha = alpha * 0.45;
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
        blockedAge >= 0 && blockedAge < 125
          ? Math.sin((blockedAge / 125) * Math.PI * 3) *
            layout.cell *
            0.027
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
          ? Math.sin(easedProgress * Math.PI) * 0.04
          : 0;

      const baseSize = layout.cell * 0.7;
      const cubeW = baseSize * (1 + squash);
      const cubeH = baseSize * (1 - squash * 0.5);
      const cubeX = cubeCenter.x - cubeW / 2 + kickX;
      const cubeY = cubeCenter.y - cubeH / 2 + kickY;

      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#000000';
      roundedRectPath(
        ctx,
        cubeX + layout.cell * 0.025,
        cubeY + layout.cell * 0.07,
        cubeW,
        cubeH,
        baseSize * 0.29,
      );
      ctx.fill();

      ctx.globalAlpha = 1;
      roundedRectPath(
        ctx,
        cubeX,
        cubeY,
        cubeW,
        cubeH,
        baseSize * 0.29,
      );
      ctx.fillStyle = '#f5c94f';
      ctx.fill();

      ctx.strokeStyle = 'rgba(93,61,5,.38)';
      ctx.lineWidth = Math.max(1.1, layout.cell * 0.028);
      ctx.stroke();

      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#fff8dc';
      roundedRectPath(
        ctx,
        cubeX + cubeW * 0.14,
        cubeY + cubeH * 0.11,
        cubeW * 0.7,
        cubeH * 0.14,
        cubeH * 0.07,
      );
      ctx.fill();

      ctx.globalAlpha = 1;

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    finishLocalLevelIfNeeded,
    getCellCenter,
    markPainted,
    match.phaseRef,
    startMove,
  ]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (match.phase !== 'match_over') {
      setResultStage(0);
      return;
    }

    setResultStage(0);

    const timers = [
      window.setTimeout(() => setResultStage(1), 280),
      window.setTimeout(() => setResultStage(2), 1150),
      window.setTimeout(() => setResultStage(3), 2050),
      window.setTimeout(() => setResultStage(4), 3050),
      window.setTimeout(() => setResultStage(5), 4300),
    ];

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [match.phase, match.matchInstanceKey]);

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

    if (
      !start ||
      start.fired ||
      match.phaseRef.current !== 'playing' ||
      localFinishedRef.current
    ) {
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

    if (
      !start ||
      start.fired ||
      match.phaseRef.current !== 'playing' ||
      localFinishedRef.current
    ) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) {
      return;
    }

    startMove(directionFromDelta(dx, dy));
  };

  const didWin =
    !match.draw &&
    match.winnerUserId > 0 &&
    match.winnerUserId === match.myUserId;

  const didLose =
    !match.draw &&
    match.winnerUserId > 0 &&
    match.winnerUserId !== match.myUserId;

  const opponentStatus = match.opponentFinished
    ? 'ГОТОВО'
    : `LEVEL ${match.opponentLevel}/4`;

  const profit = didWin ? match.winnerProfit : 0;

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
        @keyframes cf-online-pop {
          from { opacity: 0; transform: translateY(8px) scale(.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes cf-online-pulse {
          0%, 100% { opacity: .42; transform: scale(.96); }
          50% { opacity: 1; transform: scale(1); }
        }

        @keyframes cf-online-level {
          0% { opacity: 0; transform: scale(.86); }
          22% { opacity: 1; transform: scale(1); }
          76% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
      `}</style>

      <header className="relative z-30 flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#171137]/72 px-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PlayerAvatar profile={match.playerProfile} />

          <div className="min-w-0">
            <p className="max-w-[84px] truncate py-[1px] text-[7px] font-black leading-[1.5] text-white/88">
              {match.playerProfile.name}
            </p>
            <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.5] tracking-[.12em] text-[#f5c94f]/72">
              YOU
            </p>
          </div>
        </div>

        <div className="shrink-0 px-2 text-center">
          <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.5] tracking-[.18em] text-white/27">
            Level {levelSlot + 1}/4
          </p>

          <p className="py-[1px] text-[18px] font-black leading-[1.35] tabular-nums text-white">
            {formatTime(match.matchTimeLeft)}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 text-right">
          <PlayerAvatar profile={match.opponentProfile} />

          <div className="min-w-0">
            <p className="ml-auto max-w-[84px] truncate py-[1px] text-[7px] font-black leading-[1.5] text-white/88">
              {match.opponentProfile.name}
            </p>
            <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.5] tracking-[.08em] text-[#b6a1ff]/70">
              {opponentStatus}
            </p>
          </div>
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
              style={{ width: `${localProgress}%` }}
            />
          </div>
        </div>

        {hintVisible &&
          match.phase === 'playing' &&
          !localFinished && (
            <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 text-center">
              <div className="mx-auto w-fit rounded-full border border-white/[0.08] bg-[#140f36]/90 px-3 py-2">
                <p className="py-[1px] text-[6px] font-black uppercase leading-[1.45] tracking-[.13em] text-white/42">
                  Swipe · Fill every cell
                </p>
              </div>
            </div>
          )}

        {transitionLevel !== null &&
          match.phase === 'playing' && (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#0d0923]/16">
              <div
                className="rounded-[18px] border border-[#f5c94f]/22 bg-[#120d30]/90 px-5 py-3 text-center"
                style={{
                  animation:
                    'cf-online-level .52s ease-out both',
                }}
              >
                <p className="text-[6px] font-black uppercase leading-[1.5] tracking-[.17em] text-white/35">
                  NEXT
                </p>
                <p className="mt-1 py-[1px] text-[18px] font-black uppercase leading-[1.4] text-[#f5c94f]">
                  LEVEL {transitionLevel}/4
                </p>
              </div>
            </div>
          )}

        {localFinished && match.phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#0c0920]/48 px-6 backdrop-blur-[2px]">
            <div className="rounded-[22px] border border-[#f5c94f]/22 bg-[#120d30]/94 px-5 py-4 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-[13px] bg-[#f5c94f]/10 text-[16px] font-black text-[#f5c94f]">
                ✓
              </div>

              <p className="mt-2 py-[1px] text-[16px] font-black uppercase leading-[1.4] text-white">
                ГОТОВО
              </p>

              <p className="mt-1 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.13em] text-white/34">
                Ждём соперника · {formatTime(match.matchTimeLeft)}
              </p>
            </div>
          </div>
        )}

        {match.phase === 'waiting' && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-[#0d0924]/72 px-5">
            <div className="text-center">
              <div
                className="mx-auto h-8 w-8 rounded-[10px] border-2 border-[#f5c94f]/20 border-t-[#f5c94f]"
                style={{
                  animation:
                    'spin .75s linear infinite',
                }}
              />
              <p className="mt-3 py-[1px] text-[8px] font-black uppercase leading-[1.5] tracking-[.16em] text-white/52">
                {match.connectionStatus === 'open'
                  ? 'ЖДЁМ СОПЕРНИКА'
                  : 'ПОДКЛЮЧАЕМСЯ'}
              </p>
            </div>
          </div>
        )}

        {match.phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#0d0924]/68">
            <div className="text-center">
              <p className="py-[1px] text-[7px] font-black uppercase leading-[1.5] tracking-[.18em] text-white/36">
                4 RANDOM LEVELS · 60 SEC
              </p>

              <div
                key={match.countdownLeft}
                className="mt-1 py-[4px] text-[68px] font-black leading-[1.25] text-[#f5c94f]"
                style={{
                  animation:
                    'cf-online-pop .22s ease-out both',
                }}
              >
                {Math.max(1, match.countdownLeft)}
              </div>
            </div>
          </div>
        )}

        {match.socketError && match.phase !== 'match_over' && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-50 rounded-[14px] border border-[#ff6f8d]/22 bg-[#351326]/90 px-3 py-2 text-center text-[7px] font-black leading-[1.5] text-[#ffb3c2]">
            {match.socketError}
          </div>
        )}
      </div>

      {match.phase === 'match_over' && (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-[#070515]/90 px-4">
          <div
            className="relative w-full max-w-[326px] overflow-hidden rounded-[26px] border border-[#8e79d3]/30 bg-[#110d2b]/[.99] px-4 pb-4 pt-4 shadow-[0_34px_110px_rgba(0,0,0,.68)]"
            style={{
              animation:
                'cf-online-pop .28s ease-out both',
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,rgba(245,201,79,.11),transparent_70%)]" />

            <div className="relative">
              <div className="text-center">
                <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.5] tracking-[.18em] text-white/28">
                  CUBE FILL · RESULTS
                </p>

                <h2
                  className={[
                    'mt-1 py-[2px] text-[20px] font-black uppercase leading-[1.4]',
                    resultStage < 5
                      ? 'text-white'
                      : match.draw
                        ? 'text-white'
                        : didWin
                          ? 'text-[#f5c94f]'
                          : 'text-[#ff6f8d]',
                  ].join(' ')}
                >
                  {resultStage < 5
                    ? 'ПОДСЧЁТ...'
                    : match.draw
                      ? 'НИЧЬЯ'
                      : didWin
                        ? 'ПОБЕДА'
                        : 'ПОРАЖЕНИЕ'}
                </h2>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  {
                    profile: match.playerProfile,
                    progress: match.myProgress,
                    moves: match.myMoves,
                    efficiency: match.myEfficiency,
                    score: match.myScore,
                    winner: didWin,
                  },
                  {
                    profile: match.opponentProfile,
                    progress: match.opponentProgress,
                    moves: match.opponentMoves,
                    efficiency: match.opponentEfficiency,
                    score: match.opponentScore,
                    winner: didLose,
                  },
                ].map((item, index) => {
                  const progressActive =
                    index === 0
                      ? resultStage >= 1
                      : resultStage >= 2;

                  const finalWinner =
                    resultStage >= 5 &&
                    !match.draw &&
                    item.winner;

                  return (
                    <div
                      key={item.profile.id || index}
                      className={[
                        'rounded-[18px] border px-2.5 pb-3 pt-2.5 text-center transition duration-300',
                        finalWinner
                          ? 'border-[#f5c94f]/45 bg-[#f5c94f]/[.07]'
                          : 'border-white/[0.065] bg-white/[0.025]',
                      ].join(' ')}
                    >
                      <div className="mx-auto w-fit">
                        <PlayerAvatar
                          profile={item.profile}
                          size={46}
                        />
                      </div>

                      <p className="mt-1.5 truncate py-[1px] text-[6px] font-black leading-[1.5] text-white/58">
                        {item.profile.name}
                      </p>

                      <div className="mt-2 border-t border-white/[0.055] pt-2">
                        <p className="text-[5px] font-black uppercase leading-[1.5] tracking-[.1em] text-white/24">
                          Заполнение
                        </p>
                        <p className="mt-[2px] py-[1px] text-[15px] font-black leading-[1.35] tabular-nums text-[#b9a4ff]">
                          <CountUp
                            target={item.progress}
                            active={progressActive}
                            decimals={1}
                            suffix="%"
                          />
                        </p>
                      </div>

                      <div
                        className={[
                          'mt-2 transition duration-300',
                          resultStage >= 3
                            ? 'opacity-100'
                            : 'opacity-20',
                        ].join(' ')}
                      >
                        <p className="text-[5px] font-black uppercase leading-[1.5] tracking-[.1em] text-white/24">
                          Ходы
                        </p>
                        <p className="mt-[2px] py-[1px] text-[14px] font-black leading-[1.35] tabular-nums text-white/82">
                          <CountUp
                            target={item.moves}
                            active={resultStage >= 3}
                            duration={520}
                          />
                        </p>
                        <p className="mt-[1px] py-[1px] text-[5px] font-black uppercase leading-[1.5] tracking-[.06em] text-[#f5c94f]/48">
                          BONUS +
                          <CountUp
                            target={item.efficiency}
                            active={resultStage >= 3}
                            duration={620}
                          />
                        </p>
                      </div>

                      <div
                        className={[
                          'mt-2 rounded-[12px] border border-white/[0.055] bg-black/15 px-2 py-2 transition duration-300',
                          resultStage >= 4
                            ? 'opacity-100'
                            : 'opacity-20',
                        ].join(' ')}
                      >
                        <p className="text-[5px] font-black uppercase leading-[1.5] tracking-[.11em] text-white/24">
                          SCORE
                        </p>
                        <p className="mt-[2px] py-[1px] text-[17px] font-black leading-[1.35] tabular-nums text-white">
                          <CountUp
                            target={item.score}
                            active={resultStage >= 4}
                            duration={820}
                          />
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className={[
                  'game-result-reward mt-2.5 flex items-center justify-center rounded-[15px] border border-white/[0.065] bg-black/15 px-3 py-2.5 text-center transition duration-500',
                  resultStage >= 5
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-1 opacity-0',
                ].join(' ')}
              >
                <div>
                  <p className="py-[1px] text-[5px] font-black uppercase leading-[1.5] tracking-[.12em] text-white/25">
                    Чистый выигрыш
                  </p>

                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    <span
                      className={[
                        'py-[1px] text-[18px] font-black leading-[1.35] tabular-nums',
                        didWin
                          ? 'text-[#f5c94f]'
                          : 'text-white/42',
                      ].join(' ')}
                    >
                      {didWin
                        ? `+${formatReward(profit)}`
                        : '0'}
                    </span>

                    <img
                      src={coinIcon}
                      alt="GAME"
                      className="h-[19px] w-[19px] object-contain"
                      draggable={false}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={match.backToLobbies}
                disabled={resultStage < 5}
                className="game-result-exit mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,#f7d15f,#dfad2b)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.11em] text-[#241a05] transition active:scale-[.985] disabled:cursor-default disabled:opacity-25"
              >
                К ЛОББИ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
