import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ============================================================================
   PLINKO PvP — Telegram mini-app (mobile only)
   ----------------------------------------------------------------------------
   Правки:
   1) верхний/нижний UI разнесены с полем и safe-area;
   2) счёт снова считается как честное умножение от 1: 1 → x5 → 5 → x5 → 25,
      плюс есть защита от двойной обработки одного приземления;
   3) верхний UI: слева игрок, центр — счётчики шариков, справа соперник;
   4) общий фон игры убран, декоративный фон оставлен только у поля;
   5) в нижних кнопках используются ASCII x2 и /2, без символа деления;
   6) доска стала ниже, стаканы ближе к последнему ряду, снизу оставлен зазор;
   7) палитра приведена к главной теме приложения: blue/orange glass.
   ========================================================================== */

const CFG = {
  VW: 360, VH: 520,
  ROWS: 9, TOP_PEGS: 3,
  TOP_Y: 64, SY: 43, SX: 30,
  pegR: 5, ballR: 6.5,
  WALL_L: 10, WALL_R: 350,
  FLOOR: 494,
  SLOT_TOP: 448,
  N_SLOTS: 10,
  g: 760,
  eRest: 0.48,
  wRest: 0.4,
  air: 0.999,
  DT: 1 / 240,
  MAX_STEPS: 9000,
  DROP_Y: 48,
  DROP_OFFSET: 0.6,
  LAUNCH_VX: 120,
  LAUNCH_VY: 20,
  pegFric: 0.06,
  SUBSTEPS_PER_FRAME: 4,
  REVEAL_SPEED: 1.12,
  MAX_DPR: 1.45,
  TRAIL_MAX: 8,
  MAX_PARTICLES: 90,
  MAX_POPS: 18,
  VALUES: [9, 6, 3.5, 2, 1.2, 1.1, 1.8, 3.2, 5.5, 8.5] as number[],
  WIND_MAX: 0.16,
  WALL_MIN_ROW: 3,
  ACTIONS_PER_TURN: 2,
  TURN_SECONDS: 10,
  BALLS_PER_PLAYER: 5,
  ANGLE_MAX_DEG: 18,
};

type Peg = { x: number; y: number; row: number; col: number };
type Seg = { ax: number; ay: number; bx: number; by: number };
type Gap = { row: number; idx: number } & Seg & { mx: number; my: number };
type Board = {
  pegs: Peg[];
  dividers: number[];
  posts: number[];
  gaps: Gap[];
};
type SimResult = { path: number[][]; slot: number };

type TelegramWebApp = {
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
    selectionChanged?: () => void;
  };
};

function getTelegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

function hapticImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred?.(style);

  if (!tg?.HapticFeedback?.impactOccurred && navigator.vibrate) {
    navigator.vibrate(style === "heavy" ? 55 : style === "medium" ? 32 : 18);
  }
}

function hapticSelection() {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.selectionChanged?.();

  if (!tg?.HapticFeedback?.selectionChanged && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function hapticNotify(type: "error" | "success" | "warning") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.notificationOccurred?.(type);

  if (!tg?.HapticFeedback?.notificationOccurred && navigator.vibrate) {
    navigator.vibrate(type === "success" ? [25, 35, 25] : 35);
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeMatchValues() {
  return shuffleArray(CFG.VALUES);
}

function makeMatchWind() {
  return Math.round((Math.random() * 2 - 1) * CFG.WIND_MAX * 1000) / 1000;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isStuckPathResting(path: number[][], idx: number) {
  if (idx < 120 || path.length < 2) return false;

  const cur = path[idx];
  const last = path[path.length - 1];
  if (!cur || !last) return false;

  const nearFinal = Math.hypot(cur[0] - last[0], cur[1] - last[1]) < 3.2;
  if (!nearFinal) return false;

  const lookAhead = Math.min(path.length - 1, idx + 72);
  let maxDrift = 0;
  for (let i = idx; i <= lookAhead; i += 6) {
    const pt = path[i];
    if (!pt) continue;
    maxDrift = Math.max(maxDrift, Math.hypot(pt[0] - cur[0], pt[1] - cur[1]));
  }

  return maxDrift < 2.4;
}

function buildBoard(): Board {
  const c = CFG;
  const pegs: Peg[] = [];
  for (let r = 0; r < c.ROWS; r++) {
    const n = c.TOP_PEGS + r;
    const w = (n - 1) * c.SX;
    const left = c.VW / 2 - w / 2;
    for (let col = 0; col < n; col++) {
      pegs.push({ x: left + col * c.SX, y: c.TOP_Y + r * c.SY, row: r, col });
    }
  }

  const dividers: number[] = [];
  for (let i = 0; i <= c.N_SLOTS; i++) {
    dividers.push(c.WALL_L + ((c.WALL_R - c.WALL_L) * i) / c.N_SLOTS);
  }
  const posts = dividers.slice(1, -1);

  const gaps: Gap[] = [];
  for (let r = c.WALL_MIN_ROW; r < c.ROWS; r++) {
    const row = pegs.filter((p) => p.row === r).sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i], b = row[i + 1];
      gaps.push({
        row: r, idx: i,
        ax: a.x, ay: a.y, bx: b.x, by: b.y,
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      });
    }
  }

  return { pegs, dividers, posts, gaps };
}

function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return [ax, ay] as const;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * dx, ay + t * dy] as const;
}

/** Настоящая детерминированная симуляция. angleNorm ∈ [-1, 1]. */
function simulate(angleNorm: number, board: Board, userWalls: Seg[]): SimResult {
  const c = CFG;
  let x = c.VW / 2 + c.DROP_OFFSET;
  let y = c.DROP_Y;
  let vx = angleNorm * c.LAUNCH_VX;
  let vy = c.LAUNCH_VY;
  const path: number[][] = [];
  let settle = 0;

  const posts = board.posts;

  for (let step = 0; step < c.MAX_STEPS; step++) {
    vy += c.g * c.DT;
    vx *= c.air; vy *= c.air;
    x += vx * c.DT;
    y += vy * c.DT;

    // пеги — импульсное столкновение круг-круг + трение по касательной
    for (const p of board.pegs) {
      const dx = x - p.x, dy = y - p.y;
      const md = c.ballR + c.pegR;
      const d2 = dx * dx + dy * dy;
      if (d2 < md * md && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        x += nx * (md - d); y += ny * (md - d);
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny;
          const tx = -ny, ty = nx;
          const vt = vx * tx + vy * ty;
          vx -= c.pegFric * vt * tx; vy -= c.pegFric * vt * ty;
        }
      }
    }

    // стенки игроков (отрезок-круг)
    for (const w of userWalls) {
      const [cx, cy] = closestOnSeg(x, y, w.ax, w.ay, w.bx, w.by);
      const dx = x - cx, dy = y - cy;
      const md = c.ballR + 3.5;
      const d2 = dx * dx + dy * dy;
      if (d2 < md * md && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        x += nx * (md - d); y += ny * (md - d);
        const vn = vx * nx + vy * ny;
        if (vn < 0) { vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny; }
      }
    }

    // боковые стены
    if (x - c.ballR < c.WALL_L) { x = c.WALL_L + c.ballR; if (vx < 0) vx = -vx * c.wRest; }
    if (x + c.ballR > c.WALL_R) { x = c.WALL_R - c.ballR; if (vx > 0) vx = -vx * c.wRest; }

    // столбики между лунками (короткие, образуют мелкие стаканы)
    if (y + c.ballR > c.SLOT_TOP - 12) {
      for (const dvx of posts) {
        const tdx = x - dvx, tdy = y - c.SLOT_TOP;
        const md = c.ballR + 2.5;
        const td2 = tdx * tdx + tdy * tdy;
        if (tdy < 0 && td2 < md * md && td2 > 1e-12) {
          const d = Math.sqrt(td2);
          const nx = tdx / d, ny = tdy / d;
          x += nx * (md - d); y += ny * (md - d);
          const vn = vx * nx + vy * ny;
          if (vn < 0) { vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny; }
        }
        if (y >= c.SLOT_TOP && Math.abs(x - dvx) < c.ballR + 2.5) {
          if (x < dvx) { x = dvx - (c.ballR + 2.5); if (vx > 0) vx = -vx * c.wRest; }
          else { x = dvx + (c.ballR + 2.5); if (vx < 0) vx = -vx * c.wRest; }
        }
      }
    }

    // пол
    if (y + c.ballR > c.FLOOR) {
      y = c.FLOOR - c.ballR;
      if (vy > 0) vy = -vy * 0.18;
      vx *= 0.7;
    }

    path.push([x, y]);

    if (y > c.SLOT_TOP + 6 && Math.abs(vx) < 5 && Math.abs(vy) < 8) {
      if (++settle > 40) break;
    } else settle = 0;
  }

  const d = board.dividers;
  let slot = c.N_SLOTS - 1;
  for (let i = 0; i < d.length - 1; i++) if (x >= d[i] && x < d[i + 1]) { slot = i; break; }
  if (x < d[0]) slot = 0;
  slot = Math.max(0, Math.min(c.N_SLOTS - 1, slot));
  return { path, slot };
}

/* ------------------------------- ТИПЫ ИГРЫ -------------------------------- */

type Phase = "intro" | "handoff" | "angles" | "actions" | "reveal" | "result";
type ActionMode = "x2" | "half" | "wall" | null;
type WallKey = string;

const PLAYERS = [
  { name: "Игрок 1", color: "#5BB7FF", soft: "rgba(47,140,255,0.12)", emoji: "I" },
  { name: "Игрок 2", color: "#FFB45C", soft: "rgba(255,143,45,0.12)", emoji: "II" },
];

// цвет по «ценности» лунки
function tierColor(v: number): string {
  if (v >= 8) return "#FFB45C";
  if (v >= 5) return "#FF8F2D";
  if (v >= 3) return "#B48CFF";
  if (v >= 1.8) return "#5BB7FF";
  return "#EAF4FF";
}

const fmt = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number };
type Pop = { x: number; y: number; life: number; max: number; color: string; radius: number; width: number };

/* =============================== КОМПОНЕНТ ================================= */

export default function PlinkoPvpGame() {
  const board = useMemo(() => buildBoard(), []);

  const gapByKey = useMemo(() => {
    const map = new Map<string, Gap>();
    for (const g of board.gaps) map.set(`${g.row}:${g.idx}`, g);
    return map;
  }, [board.gaps]);

  const [matchValues, setMatchValues] = useState<number[]>(() => makeMatchValues());
  const [matchWind, setMatchWind] = useState(0);

  const [phase, setPhase] = useState<Phase>("intro");
  const [turn, setTurn] = useState(0);

  const [angles, setAngles] = useState<number[][]>([[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
  const [curBall, setCurBall] = useState(0);
  const [liveAngle, setLiveAngle] = useState(0);

  const [factors, setFactors] = useState<number[][]>([
    Array(CFG.N_SLOTS).fill(1),
    Array(CFG.N_SLOTS).fill(1),
  ]);
  const [walls, setWalls] = useState<WallKey[][]>([[], []]);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionsLeft, setActionsLeft] = useState(CFG.ACTIONS_PER_TURN);
  const [timeLeft, setTimeLeft] = useState(CFG.TURN_SECONDS);

  // Счёт — множитель от 1. Например: старт 1 → x5 = 5 → x5 = 25.
  const [scores, setScores] = useState<[number, number]>([1, 1]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [lastGain, setLastGain] = useState<{ p: number; v: number; score: number; stuck: boolean } | null>(null);

  const [handoff, setHandoff] = useState<{ to: number; label: string; next: Phase }>(
    { to: 0, label: "", next: "angles" }
  );

  const combinedValues = useMemo(
    () => matchValues.map((v, i) => Math.round(v * factors[0][i] * factors[1][i] * 100) / 100),
    [matchValues, factors]
  );

  const allWallSegs = useMemo<Seg[]>(() => {
    const keys = new Set<string>([...walls[0], ...walls[1]]);
    const segs: Seg[] = [];

    keys.forEach((k) => {
      const g = gapByKey.get(k);
      if (g) segs.push({ ax: g.ax, ay: g.ay, bx: g.bx, by: g.by });
    });

    return segs;
  }, [walls, gapByKey]);

  const revealOrder = useMemo(() => {
    const order: { player: number; ball: number }[] = [];
    for (let b = 0; b < CFG.BALLS_PER_PLAYER; b++) {
      order.push({ player: 0, ball: b });
      order.push({ player: 1, ball: b });
    }
    return order;
  }, []);

  const revealData = useRef<{ player: number; path: number[][]; slot: number; value: number; stuck: boolean }[]>([]);
  const processedLandings = useRef<Set<number>>(new Set());

  /* --------------------------- ЗАПРЕТ СКРОЛЛА ------------------------------ */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";

    const preventMove = (e: TouchEvent) => {
      if (e.touches.length === 1) e.preventDefault();
    };

    document.addEventListener("touchmove", preventMove, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
      document.removeEventListener("touchmove", preventMove);
    };
  }, []);

  /* --------------------------- CANVAS / АНИМАЦИЯ --------------------------- */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tf = useRef({ scale: 1, offX: 0, offY: 0, dpr: 1 });
  const raf = useRef(0);
  const lastFrameTs = useRef(0);
  const particles = useRef<Particle[]>([]);
  const pops = useRef<Pop[]>([]);
  const screenShake = useRef(0);

  const playback = useRef<{
    path: number[][];
    i: number;
    color: string;
    player: number;
    ballIdx: number;
    landed: { x: number; y: number; color: string }[];
    pausing: number;
    done: boolean;
    trail: number[][];
  }>({ path: [], i: 0, color: "#fff", player: 0, ballIdx: -1, landed: [], pausing: 0, done: false, trail: [] });

  const view = useRef({ phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoffNext: handoff.next });
  useEffect(() => {
    view.current = { phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoffNext: handoff.next };
  }, [phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoff.next]);

  const resize = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    const viewportH = window.visualViewport?.height ?? window.innerHeight ?? wrap.clientHeight;
    const w = wrap.clientWidth;
    const h = Math.max(320, Math.min(wrap.clientHeight || viewportH, viewportH));
    const nextW = Math.round(w * dpr);
    const nextH = Math.round(h * dpr);

    if (cv.width !== nextW) cv.width = nextW;
    if (cv.height !== nextH) cv.height = nextH;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    // Доска специально чуть меньше по высоте и не доходит до нижней панели.
    const reservedTop = 62 * dpr;
    const reservedBottom = 156 * dpr;
    const usableH = Math.max(240 * dpr, cv.height - reservedTop - reservedBottom);
    const scale = Math.min(cv.width / CFG.VW, usableH / CFG.VH) * 0.93;
    const boardW = CFG.VW * scale;
    const boardH = CFG.VH * scale;
    const freeY = cv.height - reservedTop - reservedBottom - boardH;

    tf.current = {
      scale,
      offX: (cv.width - boardW) / 2,
      offY: reservedTop + Math.max(0, freeY * 0.08),
      dpr,
    };
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    const id = window.setTimeout(resize, 60);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      window.clearTimeout(id);
    };
  }, [resize]);

  /* ------------------------------ ЦИКЛ ОТРИСОВКИ -------------------------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = (v: number) => v * tf.current.scale;
    const X = (v: number) => tf.current.offX + v * tf.current.scale;
    const Y = (v: number) => tf.current.offY + v * tf.current.scale;

    const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
    };

    const factorOf = (viewer: number, i: number) => view.current.factors[viewer][i];

    const drawCup = (i: number, val: number, viewer: number, isReveal: boolean, showValues: boolean) => {
      const d = board.dividers;
      const x0 = d[i], x1 = d[i + 1];
      const cx = (x0 + x1) / 2;
      const col = showValues ? tierColor(val) : "rgba(255,255,255,0.34)";
      const r = S(9);
      const top = Y(CFG.SLOT_TOP), bot = Y(CFG.FLOOR);
      const lx = X(x0) + S(2.4), rx = X(x1) - S(2.4);
      const width = rx - lx;
      const hot = showValues && val >= 5;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx, top + S(2));
      ctx.lineTo(lx + S(1.8), bot - r);
      ctx.quadraticCurveTo(lx + S(1.8), bot, lx + r, bot);
      ctx.lineTo(rx - r, bot);
      ctx.quadraticCurveTo(rx - S(1.8), bot, rx - S(1.8), bot - r);
      ctx.lineTo(rx, top + S(2));
      ctx.quadraticCurveTo(rx, top, rx - S(4), top);
      ctx.lineTo(lx + S(4), top);
      ctx.quadraticCurveTo(lx, top, lx, top + S(2));

      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, showValues ? col + "42" : "rgba(255,255,255,0.05)");
      grad.addColorStop(0.42, "rgba(255,255,255,0.035)");
      grad.addColorStop(1, showValues ? col + "1c" : "rgba(255,255,255,0.025)");
      ctx.fillStyle = grad;
      ctx.shadowColor = hot ? col : "rgba(0,0,0,0)";
      ctx.shadowBlur = hot ? S(11) : 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.lineWidth = S(hot ? 1.9 : 1.15);
      ctx.strokeStyle = showValues ? col + (hot ? "ee" : "bb") : "rgba(255,255,255,0.14)";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lx + S(5), top + S(4));
      ctx.lineTo(rx - S(5), top + S(4));
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = S(0.8);
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(lx + width * 0.16, bot - S(3), width * 0.68, S(1.3));

      ctx.shadowColor = showValues ? col : "rgba(255,255,255,0.3)";
      ctx.shadowBlur = showValues ? S(7) : S(2);
      ctx.fillStyle = showValues ? "#fff" : "rgba(255,255,255,0.5)";
      ctx.font = `900 ${S(showValues && val >= 8 ? 13.8 : 12.2)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(showValues ? `x${fmt(val)}` : "?", X(cx), (top + bot) / 2 + S(1));
      ctx.shadowBlur = 0;

      if (showValues && !isReveal && factorOf(viewer, i) !== 1) {
        const label = factorOf(viewer, i) > 1 ? "BOOST" : "CUT";
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.shadowColor = PLAYERS[viewer].color;
        ctx.shadowBlur = S(6);
        ctx.font = `900 ${S(6.8)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, X(cx), top - S(6));
      }
      ctx.restore();
    };

    const loop = (ts: number) => {
      const deltaMs = lastFrameTs.current ? Math.min(50, ts - lastFrameTs.current) : 16.67;
      lastFrameTs.current = ts;
      const frameScale = deltaMs / 16.67;

      const v = view.current;
      const isReveal = v.phase === "reveal" || v.phase === "result";
      const viewer = v.turn;
      const showValues =
        v.phase === "actions" ||
        v.phase === "reveal" ||
        v.phase === "result" ||
        (v.phase === "handoff" && v.handoffNext !== "angles");
      const display = isReveal
        ? v.combinedValues
        : v.matchValues.map((val, i) => Math.round(val * v.factors[viewer][i] * 100) / 100);

      ctx.clearRect(0, 0, cv.width, cv.height);

      ctx.save();

      if (screenShake.current > 0) {
        const sh = S(screenShake.current);
        ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        screenShake.current = Math.max(0, screenShake.current * Math.pow(0.86, frameScale) - 0.05 * frameScale);
      }

      // Декоративная подложка только у игрового поля, общего фона больше нет.
      const bx = X(CFG.WALL_L - 15);
      const by = Y(0);
      const bw = S(CFG.WALL_R - CFG.WALL_L + 30);
      const bh = S(CFG.FLOOR + 12);
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, by, 0, by + bh);
      bodyGrad.addColorStop(0, "rgba(255,255,255,0.055)");
      bodyGrad.addColorStop(0.42, "rgba(12,14,22,0.78)");
      bodyGrad.addColorStop(1, "rgba(0,0,0,0.34)");
      ctx.beginPath();
      roundedRect(bx, by, bw, bh, S(24));
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = "rgba(0,0,0,0.42)";
      ctx.shadowBlur = S(20);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = S(1.25);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.stroke();

      ctx.beginPath();
      roundedRect(X(CFG.WALL_L - 7), Y(10), S(CFG.WALL_R - CFG.WALL_L + 14), S(CFG.FLOOR - 4), S(17));
      ctx.strokeStyle = "rgba(47,140,255,0.12)";
      ctx.lineWidth = S(1.2);
      ctx.stroke();
      ctx.restore();

      // боковые направляющие
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.shadowColor = "rgba(47,140,255,0.16)";
      ctx.shadowBlur = S(8);
      ctx.fillRect(X(CFG.WALL_L) - S(4), Y(10), S(4), S(CFG.FLOOR - 10));
      ctx.shadowColor = "rgba(255,143,45,0.14)";
      ctx.fillRect(X(CFG.WALL_R), Y(10), S(4), S(CFG.FLOOR - 10));
      ctx.restore();

      // стаканы
      for (let i = 0; i < CFG.N_SLOTS; i++) drawCup(i, display[i], viewer, isReveal, showValues);

      // пеги
      for (const p of board.pegs) {
        const pegCol = p.row % 2 === 0 ? "#5BB7FF" : "#FFB45C";
        ctx.save();
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR + 1.45), 0, Math.PI * 2);
        ctx.fillStyle = pegCol + "22";
        ctx.shadowColor = pegCol;
        ctx.shadowBlur = S(8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(X(p.x - 1.3), Y(p.y - 1.45), S(1.45), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        ctx.lineWidth = S(1.15);
        ctx.strokeStyle = pegCol + "88";
        ctx.stroke();
        ctx.restore();
      }

      // стенки: свои во время хода, все при вскрытии
      const wallKeys = isReveal
        ? new Set<string>([...v.walls[0], ...v.walls[1]])
        : new Set<string>(v.walls[viewer]);
      wallKeys.forEach((k) => {
        const g = gapByKey.get(k);
        if (!g) return;
        ctx.beginPath();
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
        ctx.lineCap = "round";
        ctx.lineWidth = S(8);
        ctx.strokeStyle = isReveal ? "#FFB45C" : PLAYERS[viewer].color;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.shadowBlur = S(13);
        ctx.stroke();
        ctx.lineWidth = S(3.2);
        ctx.strokeStyle = "rgba(255,255,255,0.62)";
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // подсказки кликабельных целей во время действий
      if (v.phase === "actions") {
        const t = (Date.now() % 1000) / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        if (v.actionMode === "x2" || v.actionMode === "half") {
          for (let i = 0; i < CFG.N_SLOTS; i++) {
            const d = board.dividers;
            ctx.beginPath();
            ctx.rect(X(d[i]) + S(2), Y(CFG.SLOT_TOP), S(d[i + 1] - d[i]) - S(4), S(CFG.FLOOR - CFG.SLOT_TOP));
            ctx.strokeStyle = PLAYERS[viewer].color + (pulse > 0.5 ? "ff" : "70");
            ctx.lineWidth = S(2);
            ctx.stroke();
          }
        } else if (v.actionMode === "wall") {
          for (const g of board.gaps) {
            ctx.beginPath();
            ctx.arc(X(g.mx), Y(g.my), S(4 + pulse * 2), 0, Math.PI * 2);
            ctx.fillStyle = PLAYERS[viewer].color + "cc";
            ctx.fill();
          }
        }
      }

      // фаза углов: точка сброса + стрелка прицела
      if (v.phase === "angles") {
        const dropX = CFG.VW / 2, dropY = CFG.DROP_Y;
        const a = v.liveAngle;
        const len = 46;
        const dirx = a, diry = 1;
        const nlen = Math.hypot(dirx, diry) || 1;
        const ex = dropX + (dirx / nlen) * len;
        const ey = dropY + (diry / nlen) * len;
        ctx.beginPath();
        ctx.moveTo(X(dropX), Y(dropY));
        ctx.lineTo(X(ex), Y(ey));
        ctx.strokeStyle = PLAYERS[viewer].color;
        ctx.lineWidth = S(3);
        ctx.setLineDash([S(5), S(4)]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(X(ex), Y(ey), S(4), 0, Math.PI * 2);
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(X(dropX), Y(dropY), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.shadowColor = PLAYERS[viewer].color;
        ctx.shadowBlur = S(10);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // вскрытие: проигрывание
      const pb = playback.current;
      if (v.phase === "reveal") {
        if (pb.pausing > 0) {
          pb.pausing = Math.max(0, pb.pausing - frameScale);
        } else if (!pb.done && pb.path.length) {
          const activeData = revealData.current[pb.ballIdx];
          const advance = Math.max(
            1,
            Math.round(CFG.SUBSTEPS_PER_FRAME * frameScale * CFG.REVEAL_SPEED)
          );
          pb.i = Math.min(pb.i + advance, pb.path.length - 1);

          const stuckRested = Boolean(activeData?.stuck && isStuckPathResting(pb.path, pb.i));
          const reachedEnd = pb.i >= pb.path.length - 1;

          if (stuckRested || reachedEnd) {
            const finishIdx = stuckRested ? pb.i : pb.path.length - 1;
            const [lx, ly] = pb.path[finishIdx];
            const value = activeData?.value ?? 0;
            const stuck = activeData?.stuck ?? false;
            pb.landed.push({ x: lx, y: ly, color: pb.color });
            spawnLanding(lx, ly, pb.color, value, stuck);
            pb.done = true;
            onBallLanded();
          }
        }
      }

      // уже упавшие шарики
      for (const b of pb.landed) {
        ctx.beginPath();
        ctx.arc(X(b.x), Y(b.y), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // активный шарик + след
      if (v.phase === "reveal" && !pb.done && pb.path.length && pb.pausing <= 0) {
        const [bx, by] = pb.path[pb.i];
        pb.trail.push([bx, by]);
        if (pb.trail.length > CFG.TRAIL_MAX) pb.trail.shift();
        for (let i = 0; i < pb.trail.length; i++) {
          const [tx, ty] = pb.trail[i];
          ctx.beginPath();
          ctx.arc(X(tx), Y(ty), S(CFG.ballR * (0.3 + 0.6 * (i / pb.trail.length))), 0, Math.PI * 2);
          ctx.fillStyle = pb.color;
          ctx.globalAlpha = (i / pb.trail.length) * 0.35;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(X(bx), Y(by), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = pb.color;
        ctx.shadowColor = pb.color;
        ctx.shadowBlur = S(12);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // частицы
      const ps = particles.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= frameScale;
        p.vy += 0.25 * frameScale;
        p.x += p.vx * frameScale;
        p.y += p.vy * frameScale;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(p.r), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // кольца-вспышки
      const pp = pops.current;
      for (let i = pp.length - 1; i >= 0; i--) {
        const o = pp[i];
        o.life -= frameScale;
        if (o.life <= 0) { pp.splice(i, 1); continue; }
        const k = 1 - o.life / o.max;
        ctx.beginPath();
        ctx.arc(X(o.x), Y(o.y), S(6 + k * o.radius), 0, Math.PI * 2);
        ctx.strokeStyle = o.color;
        ctx.globalAlpha = Math.max(0, o.life / o.max);
        ctx.lineWidth = S(o.width * (1 - k) + 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      raf.current = requestAnimationFrame(loop);
    };

    lastFrameTs.current = 0;
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, gapByKey]);

  const trimFx = () => {
    if (particles.current.length > CFG.MAX_PARTICLES) {
      particles.current.splice(0, particles.current.length - CFG.MAX_PARTICLES);
    }

    if (pops.current.length > CFG.MAX_POPS) {
      pops.current.splice(0, pops.current.length - CFG.MAX_POPS);
    }
  };

  const spawnLanding = (x: number, y: number, color: string, value: number, stuck: boolean) => {
    if (stuck) {
      hapticImpact("light");

      particles.current.push({
        x,
        y,
        vx: 0,
        vy: -1.5,
        life: 22,
        max: 22,
        color: "rgba(255,255,255,0.65)",
        r: 2,
      });

      pops.current.push({
        x,
        y,
        life: 18,
        max: 18,
        color: "rgba(255,255,255,0.45)",
        radius: 18,
        width: 2,
      });

      trimFx();
      return;
    }

    const slot = (() => {
      const d = board.dividers;
      for (let i = 0; i < d.length - 1; i++) if (x >= d[i] && x < d[i + 1]) return i;
      return x < d[0] ? 0 : CFG.N_SLOTS - 1;
    })();

    const tcol = tierColor(value);
    const power = Math.max(1, Math.min(10, value));
    const n = Math.round(8 + power * 4);

    if (value >= 5) hapticImpact("heavy");
    else if (value >= 2) hapticImpact("medium");
    else hapticImpact("light");

    screenShake.current = Math.max(screenShake.current, Math.min(7, 1 + power * 0.65));

    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 1.2 + Math.random() * (1.2 + power * 0.45);
      particles.current.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.4 - power * 0.05,
        life: 22 + Math.round(Math.random() * 14 + power * 2.5),
        max: 42 + power * 3,
        color: Math.random() < 0.55 ? tcol : color,
        r: 1.2 + Math.random() * (1.4 + power * 0.12),
      });
    }

    const rings = value >= 5 ? 3 : value >= 2 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      pops.current.push({
        x,
        y,
        life: 18 + i * 6 + Math.round(power),
        max: 18 + i * 6 + Math.round(power),
        color: i % 2 === 0 ? tcol : color,
        radius: 22 + power * 4 + i * 16,
        width: 2.5 + power * 0.22,
      });
    }

    if (value >= 5) {
      const d = board.dividers;
      const cx = (d[slot] + d[slot + 1]) / 2;
      for (let i = 0; i < 10; i++) {
        particles.current.push({
          x: cx + (Math.random() - 0.5) * 24,
          y: CFG.SLOT_TOP + 6,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -2.5 - Math.random() * 2.5,
          life: 28 + Math.round(Math.random() * 18),
          max: 46,
          color: tcol,
          r: 1.8 + Math.random() * 1.8,
        });
      }
    }

    trimFx();
  };

  /* ----------------------------- ТАЙМЕР ХОДА ------------------------------ */
  useEffect(() => {
    if (phase !== "actions") return;
    setTimeLeft(CFG.TURN_SECONDS);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const left = CFG.TURN_SECONDS - Math.floor((Date.now() - t0) / 1000);
      setTimeLeft(left);
      if (left <= 0) { window.clearInterval(id); finishActionTurn(); }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn]);

  /* ------------------------------- ХЕНДЛЕРЫ ------------------------------- */
  const toHandoff = (to: number, label: string, next: Phase) => {
    setHandoff({ to, label, next });
    setPhase("handoff");
  };

  const startGame = () => {
    hapticNotify("success");
    setMatchValues(makeMatchValues());
    setMatchWind(makeMatchWind());
    setScores([1, 1]);
    setFactors([Array(CFG.N_SLOTS).fill(1), Array(CFG.N_SLOTS).fill(1)]);
    setWalls([[], []]);
    setAngles([
      Array(CFG.BALLS_PER_PLAYER).fill(0),
      Array(CFG.BALLS_PER_PLAYER).fill(0),
    ]);
    setTurn(0); setCurBall(0); setLiveAngle(0);
    setRevealIdx(0);
    setLastGain(null);
    processedLandings.current.clear();
    particles.current = []; pops.current = [];
    screenShake.current = 0;
    playback.current = { path: [], i: 0, color: "#fff", player: 0, ballIdx: -1, landed: [], pausing: 0, done: false, trail: [] };
    setPhase("angles");
  };

  useEffect(() => {
    if (phase !== "intro") return;

    const id = window.setTimeout(() => {
      startGame();
    }, 4000);

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const confirmAngle = () => {
    hapticSelection();

    setAngles((prev) => {
      const next = prev.map((a) => [...a]);
      next[turn][curBall] = liveAngle;
      return next;
    });
    if (curBall < CFG.BALLS_PER_PLAYER - 1) {
      setCurBall((b) => b + 1);
      setLiveAngle(0);
    } else {
      if (turn === 0) {
        setCurBall(0); setLiveAngle(0);
        toHandoff(1, `Задайте углы своих ${CFG.BALLS_PER_PLAYER} шариков`, "angles");
      } else {
        setCurBall(0);
        toHandoff(0, "Множители открыты · ваши 2 действия", "actions");
      }
    }
  };

  const worldFromEvent = (e: { clientX: number; clientY: number }) => {
    const cv = canvasRef.current;
    if (!cv) return { wx: 0, wy: 0 };
    const rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) * tf.current.dpr;
    const py = (e.clientY - rect.top) * tf.current.dpr;
    return {
      wx: (px - tf.current.offX) / tf.current.scale,
      wy: (py - tf.current.offY) / tf.current.scale,
    };
  };

  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { wx, wy } = worldFromEvent(e);

    // прицеливание перетаскиванием в фазе углов
    if (phase === "angles") {
      const a = (wx - CFG.VW / 2) / ((CFG.WALL_R - CFG.WALL_L) / 2);
      setLiveAngle(Math.max(-1, Math.min(1, a)));
      return;
    }

    if (phase !== "actions" || actionsLeft <= 0 || !actionMode) return;

    if (actionMode === "wall") {
      let best: Gap | null = null, bestD = 22;
      for (const g of board.gaps) {
        const d = Math.hypot(wx - g.mx, wy - g.my);
        if (d < bestD) { bestD = d; best = g; }
      }
      if (best) {
        const key = `${best.row}:${best.idx}`;
        setWalls((prev) => {
          const mine = prev[turn];
          if (mine.includes(key)) return prev;
          const next = prev.map((w) => [...w]) as WallKey[][];
          next[turn].push(key);
          return next;
        });
        consumeAction();
      }
      return;
    }

    // x2 / /2 — по лунке
    const d = board.dividers;
    let slot = -1;
    for (let i = 0; i < d.length - 1; i++) if (wx >= d[i] && wx < d[i + 1]) { slot = i; break; }
    if (slot >= 0 && wy > CFG.SLOT_TOP - 40) {
      setFactors((prev) => {
        const n = prev.map((f) => [...f]);
        n[turn][slot] *= actionMode === "x2" ? 2 : 0.5;
        n[turn][slot] = Math.round(n[turn][slot] * 100) / 100;
        return n;
      });
      consumeAction();
    }
  };

  const consumeAction = () => {
    hapticImpact("medium");

    setActionMode(null);
    setActionsLeft((a) => {
      const left = a - 1;
      if (left <= 0) window.setTimeout(finishActionTurn, 250);
      return left;
    });
  };

  const finishActionTurn = () => {
    hapticSelection();

    setActionMode(null);
    setActionsLeft(CFG.ACTIONS_PER_TURN);
    setPhase((ph) => {
      if (ph !== "actions") return ph;
      if (turn === 0) toHandoff(1, "Ваши 2 действия · 10 секунд", "actions");
      else toHandoff(0, "Вскрытие — запуск шариков", "reveal");
      return "handoff";
    });
  };

  const proceedHandoff = () => {
    hapticSelection();

    setTurn(handoff.to);
    if (handoff.next === "actions") { setActionsLeft(CFG.ACTIONS_PER_TURN); setActionMode(null); }
    if (handoff.next === "reveal") { startReveal(); return; }
    setPhase(handoff.next);
  };

  /* ------------------------------ ВСКРЫТИЕ -------------------------------- */
  const startReveal = () => {
    revealData.current = revealOrder.map(({ player, ball }) => {
      const r = simulate(clamp(angles[player][ball] + matchWind, -1, 1), board, allWallSegs);
      const last = r.path[r.path.length - 1];
      const stuck = !last || last[1] < CFG.SLOT_TOP + 6;
      return {
        player,
        path: r.path,
        slot: r.slot,
        value: stuck ? 1 : combinedValues[r.slot],
        stuck,
      };
    });
    processedLandings.current.clear();
    particles.current = []; pops.current = [];
    screenShake.current = 0;
    playback.current = { path: [], i: 0, color: "#fff", player: 0, ballIdx: -1, landed: [], pausing: 0, done: false, trail: [] };
    setScores([1, 1]); setRevealIdx(0); setLastGain(null);
    setPhase("reveal");
    loadBall(0);
  };

  const loadBall = (idx: number) => {
    const d = revealData.current[idx];
    if (!d) return;
    playback.current = {
      path: d.path, i: 0,
      color: PLAYERS[d.player].color,
      player: d.player,
      ballIdx: idx,
      landed: playback.current.landed,
      pausing: 12, done: false, trail: [],
    };
  };

  const onBallLanded = () => {
    const idx = playback.current.ballIdx;
    if (idx < 0 || processedLandings.current.has(idx)) return;
    processedLandings.current.add(idx);

    const d = revealData.current[idx];
    if (d) {
      setScores((s) => {
        const ns: [number, number] = [s[0], s[1]];
        ns[d.player] = Math.round(ns[d.player] * d.value * 100) / 100;
        setLastGain({ p: d.player, v: d.value, score: ns[d.player], stuck: d.stuck });
        return ns;
      });
    }

    const nextIdx = idx + 1;
    setRevealIdx(nextIdx);

    if (nextIdx >= revealData.current.length) {
      window.setTimeout(() => {
        hapticNotify("success");
        setPhase("result");
      }, 1100);
      return;
    }

    window.setTimeout(() => {
      setLastGain(null);
      loadBall(nextIdx);
    }, 850);
  };

  /* ------------------------------- ПРОИЗВОДНОЕ ---------------------------- */
  const angleDeg = Math.round(liveAngle * CFG.ANGLE_MAX_DEG);
  const winner = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;

  const ballCounters = useMemo<[number, number]>(() => {
    if (phase === "intro") return [0, 0];

    if (phase === "angles") {
      if (turn === 0) return [curBall, 0];
      return [CFG.BALLS_PER_PLAYER, curBall];
    }

    if (phase === "handoff" && handoff.next === "angles") {
      return handoff.to === 1 ? [CFG.BALLS_PER_PLAYER, 0] : [0, 0];
    }

    if (phase === "reveal") {
      const done = clamp(revealIdx, 0, revealOrder.length);
      const counts: [number, number] = [0, 0];
      for (let i = 0; i < done; i++) counts[revealOrder[i].player]++;
      return counts;
    }

    return [CFG.BALLS_PER_PLAYER, CFG.BALLS_PER_PLAYER];
  }, [phase, turn, curBall, handoff.next, handoff.to, revealIdx, revealOrder]);

  // кастомный ползунок (надёжный для webview): pointer-события
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const setAngleFromClientX = (clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setLiveAngle(Math.max(-1, Math.min(1, ratio * 2 - 1)));
  };
  const sliderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    hapticSelection();
    setAngleFromClientX(e.clientX);
  };
  const sliderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.pressure === 0) return;
    setAngleFromClientX(e.clientX);
  };

  const activeColor = PLAYERS[turn]?.color ?? "#5BB7FF";

  return (
    <div
      className="relative z-0 flex w-full flex-col overflow-hidden overscroll-none select-none bg-transparent text-white"
      style={{
        height: "var(--tg-viewport-stable-height, var(--tg-viewport-height, 100svh))",
        maxHeight: "var(--tg-viewport-stable-height, var(--tg-viewport-height, 100svh))",
        minHeight: 0,
        fontFamily:
          "'Supercell', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        touchAction: "none",
      }}
    >
      <div ref={wrapRef} className="absolute inset-0 z-10">
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          onPointerMove={(e) => {
            if (phase === "angles" && e.buttons === 1) onCanvasPointer(e);
          }}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none", transform: "translateZ(0)" }}
        />
      </div>

      <div className="pointer-events-none absolute left-3 right-3 top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
        <div className="flex min-w-0 justify-start">
          <PlayerScoreCard player={PLAYERS[0]} score={scores[0]} active={(phase === "angles" || phase === "actions") && turn === 0} />
        </div>

        <div className="flex h-12 items-center gap-2 rounded-[18px] border border-white/[0.08] bg-[#09090d]/78 px-3 shadow-[0_12px_28px_rgba(0,0,0,.28)] backdrop-blur-xl">
          <BallCounter color={PLAYERS[0].color} value={ballCounters[0]} />
          <div className="h-5 w-px bg-white/12" />
          <BallCounter color={PLAYERS[1].color} value={ballCounters[1]} reverse />
        </div>

        <div className="flex min-w-0 justify-end">
          <PlayerScoreCard player={PLAYERS[1]} score={scores[1]} active={(phase === "angles" || phase === "actions") && turn === 1} reverse />
        </div>
      </div>

      {lastGain && (
        <div
          className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/[0.10] bg-[#09090d]/90 px-4 py-2 text-[12px] font-black tracking-[-0.02em] shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 66px)",
            color: PLAYERS[lastGain.p].color,
          }}
        >
          {lastGain.stuck ? "x1" : `x${fmt(lastGain.v)} → ${fmt(lastGain.score)}`}
        </div>
      )}

      {phase === "angles" && (
        <div className="fixed inset-x-0 z-30 px-3"
          style={{ bottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}>
          <div className="mx-auto max-w-[460px] rounded-[22px] border border-white/[0.09] bg-[#09090d]/90 p-2.5 shadow-[0_22px_52px_rgba(0,0,0,0.50)] backdrop-blur-xl">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/32">
                Прицел
              </span>
              <span
                className="text-[12px] font-black tracking-[-0.04em] tabular-nums"
                style={{ color: activeColor }}
              >
                {angleDeg > 0 ? "+" : ""}
                {angleDeg}°
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setLiveAngle((a) =>
                    Math.max(-1, Math.round((a - 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000),
                  );
                }}
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-[15px] border border-white/[0.08] bg-white/[0.06] text-lg font-black text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] active:bg-white/[0.10]"
              >
                −
              </button>

              <div
                ref={sliderRef}
                onPointerDown={sliderDown}
                onPointerMove={sliderMove}
                className="relative h-8 min-w-0 flex-1 cursor-pointer"
                style={{ touchAction: "none" }}
              >
                <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" />
                <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
                <div
                  className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
                  style={{
                    left: `${((liveAngle + 1) / 2) * 100}%`,
                    background: activeColor,
                    boxShadow: `0 0 14px ${activeColor}55`,
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setLiveAngle((a) =>
                    Math.min(1, Math.round((a + 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000),
                  );
                }}
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-[15px] border border-white/[0.08] bg-white/[0.06] text-lg font-black text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] active:bg-white/[0.10]"
              >
                +
              </button>

              <button
                type="button"
                onClick={confirmAngle}
                className="press h-9 shrink-0 rounded-[14px] px-4 text-[12px] font-black tracking-[-0.02em] text-[#050507] shadow-[0_10px_22px_rgba(0,0,0,.28)] active:scale-[0.98]"
                style={{ background: activeColor }}
              >
                OK {curBall + 1}/{CFG.BALLS_PER_PLAYER}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "actions" && (
        <div className="fixed inset-x-0 z-30 px-3"
          style={{ bottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}>
          <div className="mx-auto max-w-[460px] rounded-[22px] border border-white/[0.09] bg-[#09090d]/90 p-2.5 shadow-[0_22px_52px_rgba(0,0,0,0.50)] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
              {([
                { m: "x2" as ActionMode, label: "x2" },
                { m: "half" as ActionMode, label: "/2" },
                { m: "wall" as ActionMode, label: "Wall" },
              ]).map((b) => {
                const on = actionMode === b.m;
                return (
                  <button
                    key={b.m}
                    type="button"
                    disabled={actionsLeft <= 0}
                    onClick={() => {
                      hapticSelection();
                      setActionMode(on ? null : b.m);
                    }}
                    className="press h-9 min-w-0 rounded-[14px] border px-2 text-[12px] font-black tracking-[-0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] disabled:opacity-35"
                    style={{
                      borderColor: on ? activeColor + "90" : "rgba(255,255,255,0.07)",
                      background: on ? activeColor : "rgba(255,255,255,0.05)",
                      color: on ? "#050507" : "rgba(255,255,255,0.72)",
                    }}
                  >
                    {b.label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={finishActionTurn}
                className="press h-9 rounded-[14px] border border-white/[0.08] bg-white/[0.06] px-3 text-[11px] font-black text-white/60"
              >
                Skip
              </button>
            </div>

            <div className="mt-1 flex items-center justify-center gap-2 text-[9px] font-bold text-white/36">
              <span>{actionsLeft}/{CFG.ACTIONS_PER_TURN}</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>{timeLeft}s</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>
                {actionMode === "wall"
                  ? "между пегами"
                  : actionMode
                  ? "по лунке"
                  : "действие"}
              </span>
            </div>
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7 text-center">
          <div className="w-full max-w-[340px] rounded-[30px] border border-white/[0.09] bg-[#09090d]/90 px-5 py-6 shadow-[0_26px_80px_rgba(0,0,0,0.62)] backdrop-blur-xl">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#FFB45C]/70">
              Battle Club
            </div>
            <div className="mt-2 bg-gradient-to-b from-white to-white/58 bg-clip-text text-[34px] font-black leading-none tracking-[-0.08em] text-transparent">
              Plinko PvP
            </div>
            <p className="mx-auto mt-3 max-w-[250px] text-[12px] font-medium leading-snug text-white/48">
              Два игрока, скрытые углы, два действия и честное вскрытие на общем поле.
            </p>
            <button
              type="button"
              onClick={startGame}
              className="press mt-5 h-12 w-full rounded-[18px] bg-gradient-to-br from-[#2F8CFF] to-[#FF8F2D] text-[13px] font-black tracking-[-0.02em] text-[#050507] shadow-[0_16px_34px_rgba(47,140,255,.18)] active:scale-[0.98]"
            >
              Начать
            </button>
          </div>
        </div>
      )}

      {phase === "handoff" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7 text-center">
          <div className="w-full max-w-[340px] rounded-[30px] border border-white/[0.09] bg-[#09090d]/90 px-5 py-6 shadow-[0_26px_80px_rgba(0,0,0,0.64)] backdrop-blur-xl">
            <div
              className="mx-auto grid h-12 w-12 place-items-center rounded-[16px] text-[14px] font-black text-[#050507]"
              style={{ background: PLAYERS[handoff.to].color }}
            >
              {PLAYERS[handoff.to].emoji}
            </div>
            <div className="mt-4 text-[20px] font-black tracking-[-0.06em]">
              Передай телефон
            </div>
            <div className="mt-1 text-[12px] font-bold text-white/46">
              {PLAYERS[handoff.to].name} · {handoff.label}
            </div>
            <button
              type="button"
              onClick={proceedHandoff}
              className="press mt-5 h-11 w-full rounded-[16px] text-[13px] font-black tracking-[-0.02em] text-[#050507] active:scale-[0.98]"
              style={{ background: PLAYERS[handoff.to].color }}
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-7 text-center">
          <div className="w-full max-w-[340px] rounded-[30px] border border-white/[0.09] bg-[#09090d]/90 px-5 py-6 shadow-[0_26px_80px_rgba(0,0,0,0.64)] backdrop-blur-xl">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/34">
              Match result
            </div>
            {winner === -1 ? (
              <div className="mt-2 text-[30px] font-black tracking-[-0.08em]">Ничья</div>
            ) : (
              <div
                className="mt-2 text-[30px] font-black tracking-[-0.08em]"
                style={{ color: PLAYERS[winner].color }}
              >
                {PLAYERS[winner].name} победил
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-5 text-[22px] font-black tracking-[-0.06em] tabular-nums">
              <span style={{ color: PLAYERS[0].color }}>{fmt(scores[0])}</span>
              <span className="text-white/24">:</span>
              <span style={{ color: PLAYERS[1].color }}>{fmt(scores[1])}</span>
            </div>
            <button
              type="button"
              onClick={startGame}
              className="press mt-5 h-12 w-full rounded-[18px] bg-gradient-to-br from-[#2F8CFF] to-[#FF8F2D] text-[13px] font-black tracking-[-0.02em] text-[#050507] shadow-[0_16px_34px_rgba(47,140,255,.18)] active:scale-[0.98]"
            >
              Играть снова
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type PlayerScoreCardProps = {
  player: typeof PLAYERS[number];
  score: number;
  active: boolean;
  reverse?: boolean;
};

function PlayerScoreCard({ player, score, active, reverse = false }: PlayerScoreCardProps) {
  return (
    <div
      className={`flex h-12 max-w-[130px] min-w-[92px] items-center gap-1.5 overflow-hidden rounded-[18px] border px-2 backdrop-blur-xl ${reverse ? "flex-row-reverse" : ""}`}
      style={{
        borderColor: active ? player.color + "80" : "rgba(255,255,255,0.07)",
        background: active ? `linear-gradient(135deg, ${player.color}24, rgba(255,255,255,0.045))` : "rgba(12,13,20,0.72)",
        boxShadow: active ? `0 10px 28px ${player.color}14, inset 0 1px 0 rgba(255,255,255,.08)` : "inset 0 1px 0 rgba(255,255,255,.055)",
      }}
    >
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[11px] border text-[9px] font-black text-[#050507]"
        style={{
          background: player.color,
          borderColor: "rgba(255,255,255,0.22)",
          boxShadow: `0 0 16px ${player.color}33`,
        }}
      >
        {player.emoji}
      </div>
      <div
        className={`min-w-0 flex-1 truncate font-black tracking-[-0.025em] tabular-nums ${reverse ? "text-right" : "text-left"}`}
        style={{ color: player.color, fontSize: "clamp(12px, 3.7vw, 15px)", lineHeight: 1.22 }}
      >
        {fmt(score)}
      </div>
    </div>
  );
}

type BallCounterProps = {
  color: string;
  value: number;
  reverse?: boolean;
};

function BallCounter({ color, value, reverse = false }: BallCounterProps) {
  return (
    <div className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}>
      <span
        className="h-2 w-2 rounded-full"
        style={{
          background: color,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
      <span className="text-[12px] font-black leading-none tracking-[-0.04em] text-white/82 tabular-nums">
        {value}/{CFG.BALLS_PER_PLAYER}
      </span>
    </div>
  );
}
