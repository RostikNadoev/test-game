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
  tileW: number;
  tileH: number;
  shear: number;
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
const SWIPE_THRESHOLD = 7;
const TILE_FILL_MS = 165;

const keyOf = (cell: Cell) => `${cell.r}:${cell.c}`;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeOutBack = (t: number) => {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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
      if (level.map[r][c] !== '#') cells.push({ r, c });
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
  return clamp(118 + cellCount * 49, 165, 455);
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
  const lastFrameRef = useRef(0);
  const layoutRef = useRef<Layout>({
    tileW: 48,
    tileH: 33,
    shear: 9,
    originX: 20,
    originY: 80,
    boardW: 360,
    boardH: 280,
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
  const paintTimeRef = useRef<Map<string, number>>(new Map([[keyOf(level.start), 0]]));
  const pointerRef = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const blockedPulseRef = useRef(0);
  const completionTimerRef = useRef<number | null>(null);

  const levelFloors = useMemo(() => floorCells(level), [level]);
  const totalPaintable = levelFloors.length;
  const progress = formatPercent(paintedCount, totalPaintable);

  const resetLevel = useCallback(
    (index: number) => {
      const nextLevel = LEVELS[index];
      levelRef.current = nextLevel;
      playerRef.current = { ...nextLevel.start };
      motionRef.current = null;
      queuedDirRef.current = null;
      paintedRef.current = new Set([keyOf(nextLevel.start)]);
      paintTimeRef.current = new Map([[keyOf(nextLevel.start), performance.now()]]);
      sparksRef.current = [];
      blockedPulseRef.current = 0;
      setLevelIndex(index);
      setMoves(0);
      setPaintedCount(1);
      setPhase('playing');
      setHintVisible(true);
    },
    [],
  );

  const spawnSparks = useCallback((cell: Cell, amount = 5) => {
    const list = sparksRef.current;
    for (let i = 0; i < amount && list.length < 34; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.32 + Math.random() * 0.65;
      list.push({
        x: cell.c + 0.5,
        y: cell.r + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.18 + Math.random() * 0.18,
        size: 0.035 + Math.random() * 0.04,
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
      spawnSparks(cell, 4);
    },
    [spawnSparks],
  );

  const finishLevelIfNeeded = useCallback(() => {
    const currentLevel = levelRef.current;
    const total = floorCells(currentLevel).length;
    if (paintedRef.current.size < total) return false;

    queuedDirRef.current = null;
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
    }, 360);

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
    const shearRatio = 0.20;
    const rowHeightRatio = 0.67;

    const tileByWidth = width / (cols + rows * shearRatio + 1.05);
    const tileByHeight = height / (rows * rowHeightRatio + 3.0);
    const tileW = Math.max(29, Math.min(58, Math.min(tileByWidth, tileByHeight)));
    const tileH = tileW * rowHeightRatio;
    const shear = tileW * shearRatio;
    const boardW = cols * tileW + rows * shear;
    const boardH = rows * tileH;

    const originX = (width - boardW) / 2 + tileW * 0.04;
    const originY = Math.max(38, (height - boardH) / 2 + tileW * 0.24);

    layoutRef.current = {
      tileW,
      tileH,
      shear,
      originX,
      originY,
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);

      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = Math.min(0.032, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;

      const currentLevel = levelRef.current;
      const layout = layoutRef.current;
      const rows = currentLevel.map.length;
      const cols = currentLevel.map[0].length;

      const projectTopLeft = (r: number, c: number) => ({
        x: layout.originX + c * layout.tileW + r * layout.shear,
        y: layout.originY + r * layout.tileH,
      });

      const projectCenter = (r: number, c: number) => {
        const p = projectTopLeft(r, c);
        return {
          x: p.x + layout.tileW * 0.5 + layout.shear * 0.5,
          y: p.y + layout.tileH * 0.5,
        };
      };

      const drawPoly = (
        points: { x: number; y: number }[],
        fill: string | CanvasGradient | CanvasPattern,
        stroke?: string,
      ) => {
        if (!points.length) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = Math.max(0.8, layout.tileW * 0.015);
          ctx.stroke();
        }
      };

      // Soft shadow under the whole quartz board.
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.filter = `blur(${Math.max(7, layout.tileW * 0.2)}px)`;
      ctx.fillStyle = '#02030a';
      ctx.beginPath();
      ctx.ellipse(
        viewW * 0.52,
        layout.originY + layout.boardH + layout.tileW * 0.48,
        Math.max(110, layout.boardW * 0.48),
        Math.max(22, layout.tileW * 0.42),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      // Update current slide before drawing.
      const motion = motionRef.current;
      let cubeR = playerRef.current.r;
      let cubeC = playerRef.current.c;

      if (motion && phase === 'playing') {
        const raw = clamp((now - motion.startedAt) / motion.duration, 0, 1);
        const eased = easeOutCubic(raw);
        cubeR = motion.from.r + (motion.to.r - motion.from.r) * eased;
        cubeC = motion.from.c + (motion.to.c - motion.from.c) * eased;

        const reached = Math.min(
          motion.path.length - 1,
          Math.floor(eased * motion.path.length + 0.00001),
        );
        for (let i = motion.paintedUntil + 1; i <= reached; i += 1) {
          if (i >= 0 && i < motion.path.length) {
            markPainted(motion.path[i], now);
            motion.paintedUntil = i;
          }
        }

        if (raw >= 1) {
          for (let i = motion.paintedUntil + 1; i < motion.path.length; i += 1) {
            markPainted(motion.path[i], now);
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
              window.setTimeout(() => startMove(queued), 12);
            }
          }
        }
      }

      // Floor tiles, back to front.
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const p = projectTopLeft(r, c);
          const key = `${r}:${c}`;
          const blocked = currentLevel.map[r][c] === '#';
          const inset = Math.max(1.1, layout.tileW * 0.027);
          const depth = Math.max(3.2, layout.tileW * 0.085);

          const a = { x: p.x + inset, y: p.y + inset * 0.45 };
          const b = {
            x: p.x + layout.tileW - inset,
            y: p.y + inset * 0.45,
          };
          const cc = {
            x: p.x + layout.tileW + layout.shear - inset,
            y: p.y + layout.tileH - inset * 0.45,
          };
          const d = {
            x: p.x + layout.shear + inset,
            y: p.y + layout.tileH - inset * 0.45,
          };

          if (!blocked) {
            // Thin quartz slab extrusion.
            drawPoly(
              [
                d,
                cc,
                { x: cc.x, y: cc.y + depth },
                { x: d.x, y: d.y + depth },
              ],
              '#c7cfdf',
            );
            drawPoly(
              [
                b,
                cc,
                { x: cc.x, y: cc.y + depth },
                { x: b.x, y: b.y + depth },
              ],
              '#d8dfeb',
            );

            const painted = paintedRef.current.has(key);
            const paintedAt = paintTimeRef.current.get(key) ?? -10_000;
            const fillT = painted
              ? easeOutBack(clamp((now - paintedAt) / TILE_FILL_MS, 0, 1))
              : 0;

            drawPoly(
              [a, b, cc, d],
              '#f5f7fb',
              'rgba(180,190,208,.55)',
            );

            // Very subtle quartz veins.
            if ((r * 7 + c * 11 + levelIndex * 3) % 5 === 0) {
              ctx.save();
              ctx.globalAlpha = 0.18;
              ctx.strokeStyle = '#aab6ca';
              ctx.lineWidth = Math.max(0.55, layout.tileW * 0.011);
              ctx.beginPath();
              ctx.moveTo(a.x + layout.tileW * 0.18, a.y + layout.tileH * 0.32);
              ctx.lineTo(
                a.x + layout.tileW * 0.43,
                a.y + layout.tileH * 0.56,
              );
              ctx.lineTo(
                a.x + layout.tileW * 0.71,
                a.y + layout.tileH * 0.39,
              );
              ctx.stroke();
              ctx.restore();
            }

            if (painted) {
              const center = projectCenter(r, c);
              ctx.save();
              ctx.globalAlpha = clamp(fillT, 0, 1);
              const scale = 0.58 + clamp(fillT, 0, 1) * 0.42;
              ctx.translate(center.x, center.y);
              ctx.scale(scale, scale);
              ctx.translate(-center.x, -center.y);
              drawPoly(
                [a, b, cc, d],
                '#57dfff',
                'rgba(210,250,255,.68)',
              );

              const grad = ctx.createLinearGradient(a.x, a.y, cc.x, cc.y);
              grad.addColorStop(0, 'rgba(255,255,255,.42)');
              grad.addColorStop(0.42, 'rgba(255,255,255,.04)');
              grad.addColorStop(1, 'rgba(20,126,214,.18)');
              drawPoly([a, b, cc, d], grad);
              ctx.restore();
            }
          } else {
            // Raised quartz stopper block.
            const wallH = layout.tileW * 0.48;
            const ta = { x: a.x, y: a.y - wallH };
            const tb = { x: b.x, y: b.y - wallH };
            const tc = { x: cc.x, y: cc.y - wallH };
            const td = { x: d.x, y: d.y - wallH };

            drawPoly([d, cc, tc, td], '#aab4c7');
            drawPoly([b, cc, tc, tb], '#c7cfdd');
            drawPoly([ta, tb, tc, td], '#fbfcff', '#cdd5e2');

            ctx.save();
            ctx.globalAlpha = 0.26;
            const shine = ctx.createLinearGradient(ta.x, ta.y, tc.x, tc.y);
            shine.addColorStop(0, '#ffffff');
            shine.addColorStop(0.6, 'rgba(255,255,255,0)');
            shine.addColorStop(1, '#b6c4d7');
            drawPoly([ta, tb, tc, td], shine);
            ctx.restore();
          }
        }
      }

      // Sparks from fresh paint.
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life += dt;
        if (spark.life >= spark.maxLife) {
          sparks.splice(i, 1);
          continue;
        }

        spark.x += spark.vx * dt * 2.6;
        spark.y += spark.vy * dt * 2.6;
        spark.vx *= Math.pow(0.15, dt);
        spark.vy *= Math.pow(0.15, dt);

        const pos = projectCenter(spark.y - 0.5, spark.x - 0.5);
        const alpha = 1 - spark.life / spark.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#baf5ff';
        ctx.beginPath();
        ctx.arc(
          pos.x,
          pos.y - layout.tileW * 0.14,
          Math.max(1, spark.size * layout.tileW),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Cube, pseudo-3D and always rendered above the floor.
      const cubeCenter = projectCenter(cubeR, cubeC);
      const motionNow = motionRef.current;
      const pulseAge = now - blockedPulseRef.current;
      const blockedNudge =
        pulseAge >= 0 && pulseAge < 170
          ? Math.sin((pulseAge / 170) * Math.PI * 3) * layout.tileW * 0.025
          : 0;
      const moveAngle = motionNow?.dir === 'left' || motionNow?.dir === 'right'
        ? blockedNudge
        : 0;

      const cubeSize = layout.tileW * 0.55;
      const cubeHeight = layout.tileW * 0.50;
      const halfW = cubeSize * 0.5;
      const halfH = layout.tileH * 0.28;
      const cx = cubeCenter.x + moveAngle;
      const cy = cubeCenter.y - layout.tileW * 0.07;

      ctx.save();
      ctx.shadowColor = 'rgba(28,175,255,.34)';
      ctx.shadowBlur = layout.tileW * 0.22;
      ctx.shadowOffsetY = layout.tileW * 0.10;
      drawPoly(
        [
          { x: cx - halfW + layout.shear * 0.16, y: cy - halfH },
          { x: cx + halfW, y: cy - halfH },
          { x: cx + halfW + layout.shear * 0.23, y: cy + halfH },
          { x: cx - halfW + layout.shear * 0.38, y: cy + halfH },
        ],
        'rgba(10,30,60,.24)',
      );
      ctx.restore();

      const topA = { x: cx - halfW * 0.74, y: cy - cubeHeight };
      const topB = { x: cx + halfW * 0.68, y: cy - cubeHeight };
      const topC = {
        x: cx + halfW,
        y: cy - cubeHeight + layout.tileH * 0.36,
      };
      const topD = {
        x: cx - halfW * 0.44,
        y: cy - cubeHeight + layout.tileH * 0.36,
      };
      const bottomC = { x: topC.x, y: cy + halfH * 0.62 };
      const bottomD = { x: topD.x, y: cy + halfH * 0.62 };
      const bottomB = { x: topB.x, y: cy + halfH * 0.28 };

      drawPoly([topD, topC, bottomC, bottomD], '#1599da');
      drawPoly([topB, topC, bottomC, bottomB], '#0879bf');
      drawPoly([topA, topB, topC, topD], '#68e8ff', '#c4f8ff');

      const cubeGrad = ctx.createLinearGradient(topA.x, topA.y, topC.x, topC.y);
      cubeGrad.addColorStop(0, 'rgba(255,255,255,.55)');
      cubeGrad.addColorStop(0.42, 'rgba(255,255,255,.06)');
      cubeGrad.addColorStop(1, 'rgba(14,107,190,.10)');
      drawPoly([topA, topB, topC, topD], cubeGrad);

      // Tiny specular highlight.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#e9fdff';
      ctx.lineWidth = Math.max(1, layout.tileW * 0.028);
      ctx.beginPath();
      ctx.moveTo(topA.x + cubeSize * 0.18, topA.y + layout.tileH * 0.08);
      ctx.lineTo(topB.x - cubeSize * 0.20, topB.y + layout.tileH * 0.08);
      ctx.stroke();
      ctx.restore();

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [finishLevelIfNeeded, levelIndex, markPainted, phase, startMove]);

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      fired: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.fired || phase !== 'playing') return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;

    start.fired = true;
    startMove(directionFromDelta(dx, dy));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
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
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#07101c] text-white"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
      }}
    >
      <style>{`
        @keyframes cf-pop {
          from { opacity: 0; transform: translateY(10px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cf-hint {
          0%, 100% { transform: translateX(-5px); opacity: .35; }
          50% { transform: translateX(5px); opacity: .8; }
        }
      `}</style>

      <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.05] bg-[#07101c]/96 px-3">
        <div className="min-w-[92px]">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.14em] text-white/30">
            Filled
          </p>
          <div className="mt-[2px] flex items-baseline gap-1">
            <strong className="py-[1px] text-[18px] font-black leading-[1.35] tabular-nums text-[#69e8ff]">
              {progress}%
            </strong>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 min-w-[130px] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.20em] text-white/28">
            Cube Fill
          </p>
          <p className="mt-[2px] truncate py-[1px] text-[10px] font-black leading-[1.45] text-white/92">
            {level.name}
          </p>
          <p className="py-[1px] text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/24">
            Level {levelIndex + 1}/{LEVELS.length}
          </p>
        </div>

        <div className="min-w-[92px] text-right">
          <p className="py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.14em] text-white/30">
            Moves
          </p>
          <strong className="mt-[2px] block py-[1px] text-[18px] font-black leading-[1.35] tabular-nums text-white/88">
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
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        <div className="pointer-events-none absolute inset-x-4 top-3 z-20">
          <div className="h-[4px] overflow-hidden rounded-full bg-white/[0.065] shadow-[inset_0_1px_2px_rgba(0,0,0,.25)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#26c9ff,#84efff)] transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {hintVisible && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 text-center">
            <div className="mx-auto w-fit rounded-full border border-white/[0.08] bg-[#06111e]/72 px-3 py-2 backdrop-blur-sm">
              <div
                className="mx-auto mb-1 h-[2px] w-8 rounded-full bg-[#69e8ff]"
                style={{ animation: 'cf-hint 1.1s ease-in-out infinite' }}
              />
              <p className="py-[1px] text-[6px] font-black uppercase leading-[1.45] tracking-[.14em] text-white/40">
                Swipe · Cube slides to the wall
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={restartCurrent}
          className="absolute bottom-4 right-4 z-30 rounded-[12px] border border-white/[0.08] bg-[#07101c]/78 px-2.5 py-2 text-[6px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/35 backdrop-blur-md transition active:scale-[.97]"
        >
          Restart
        </button>
      </div>

      {phase === 'level_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#020814]/72 px-4 backdrop-blur-[6px]">
          <div
            className="relative w-full max-w-[300px] overflow-hidden rounded-[26px] border border-[#77eaff]/22 bg-[#081522]/[.98] px-4 pb-4 pt-5 text-center shadow-[0_30px_100px_rgba(0,0,0,.62)]"
            style={{ animation: 'cf-pop .28s ease-out both' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,rgba(90,226,255,.18),transparent_68%)]" />

            <div className="relative">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-[15px] border border-[#92efff]/35 bg-[#57dfff]/10 shadow-[0_0_30px_rgba(87,223,255,.10)]">
                <span className="pt-[2px] text-[18px] font-black leading-[1.35] text-[#7deaff]">✓</span>
              </div>

              <p className="mt-3 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.18em] text-white/30">
                Level complete
              </p>
              <h2 className="mt-1 py-[2px] text-[19px] font-black leading-[1.4] text-white">
                {level.name}
              </h2>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/25">
                    Moves
                  </span>
                  <strong className="mt-1 block py-[1px] text-[17px] font-black leading-[1.4] text-[#70e8ff]">
                    {moves}
                  </strong>
                </div>
                <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                  <span className="text-[5.5px] font-black uppercase leading-[1.45] tracking-[.10em] text-white/25">
                    Par
                  </span>
                  <strong className="mt-1 block py-[1px] text-[17px] font-black leading-[1.4] text-white/72">
                    {level.optimal}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={nextLevel}
                className="mt-3 w-full rounded-[15px] bg-[linear-gradient(180deg,#69e8ff,#2dbddd)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.11em] text-[#04131d] shadow-[0_10px_30px_rgba(63,213,242,.18)] transition active:translate-y-[1px] active:scale-[.985]"
              >
                NEXT LEVEL
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'all_complete' && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#020814]/78 px-4 backdrop-blur-[7px]">
          <div
            className="relative w-full max-w-[306px] overflow-hidden rounded-[28px] border border-[#77eaff]/24 bg-[#081522]/[.99] px-4 pb-4 pt-5 text-center shadow-[0_34px_110px_rgba(0,0,0,.68)]"
            style={{ animation: 'cf-pop .28s ease-out both' }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(90,226,255,.22),transparent_68%)]" />

            <div className="relative">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-[17px] border border-[#9bf2ff]/40 bg-[#57dfff]/12">
                <div className="h-7 w-7 rotate-45 rounded-[4px] bg-[#68e8ff] shadow-[0_0_22px_rgba(104,232,255,.38)]" />
              </div>

              <p className="mt-3 py-[1px] text-[6px] font-black uppercase leading-[1.5] tracking-[.18em] text-white/30">
                Cube Fill
              </p>
              <h2 className="mt-1 py-[2px] text-[20px] font-black uppercase leading-[1.4] text-[#79eaff]">
                ВСЕ КАРТЫ ПРОЙДЕНЫ
              </h2>

              <div className="mt-3 rounded-[15px] border border-white/[0.065] bg-white/[0.025] px-3 py-3">
                <p className="text-[5.5px] font-black uppercase leading-[1.5] tracking-[.11em] text-white/25">
                  Total moves
                </p>
                <strong className="mt-1 block py-[1px] text-[21px] font-black leading-[1.4] text-white">
                  {totalMoves + moves}
                </strong>
              </div>

              <button
                type="button"
                onClick={restartAll}
                className="mt-3 w-full rounded-[15px] bg-[linear-gradient(180deg,#69e8ff,#2dbddd)] px-4 py-3 text-[8px] font-black uppercase leading-[1.5] tracking-[.11em] text-[#04131d] transition active:scale-[.985]"
              >
                PLAY AGAIN
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 w-full rounded-[15px] border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[7px] font-black uppercase leading-[1.5] tracking-[.11em] text-white/45 transition active:scale-[.985]"
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
