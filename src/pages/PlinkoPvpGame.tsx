import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ============================================================================
   PLINKO PvP — Telegram mini-app (mobile only)
   ----------------------------------------------------------------------------
   ФИЗИКА: настоящая импульсная, детерминированная (фикс. шаг dt=1/240).
   Никаких скриптовых "толчков". Шарик падает реально по заданному углу;
   один и тот же угол всегда даёт один и тот же путь (честный PvP).
   От залипания на вершинах пегов спасают реальные средства: микросмещение
   точки сброса (реальный бросок не идеально по центру) + трение о поверхность
   пега + чистый "жёлоб" вдоль боковых стен (крайние пеги отодвинуты).

   ПОТОК (хот-сит): intro → каждый задаёт углы 5 шариков → каждый делает
   2 действия за 10с (×2 / ÷2 лунки, стенка между пегами ниже 3-го ряда),
   не видя чужих → вскрытие: модификаторы и стенки обоих складываются на
   общей доске, шарики падают по очереди (П1·1, П2·1, П1·2 …). Между ходами —
   экран «передай телефон».
   ========================================================================== */

const CFG = {
  VW: 360, VH: 450,
  ROWS: 9, TOP_PEGS: 3,
  TOP_Y: 52, SY: 36, SX: 30,
  pegR: 5, ballR: 6.5,
  WALL_L: 10, WALL_R: 350,
  FLOOR: 412,
  SLOT_TOP: 370,
  N_SLOTS: 10,
  g: 760,
  eRest: 0.48,
  wRest: 0.4,
  air: 0.999,
  DT: 1 / 240,
  MAX_STEPS: 9000,
  DROP_Y: 40,
  DROP_OFFSET: 0.6,
  LAUNCH_VX: 120,
  LAUNCH_VY: 20,
  pegFric: 0.06,
  SUBSTEPS_PER_FRAME: 4,
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

function buildBoard(): Board {
  const c = CFG;
  const pegs: Peg[] = [];
  for (let r = 0; r < c.ROWS; r++) {
    const n = c.TOP_PEGS + r;
    const w = (n - 1) * c.SX;
    const left = c.VW / 2 - w / 2;
    for (let col = 0; col < n; col++)
      pegs.push({ x: left + col * c.SX, y: c.TOP_Y + r * c.SY, row: r, col });
  }
  const dividers: number[] = [];
  for (let i = 0; i <= c.N_SLOTS; i++)
    dividers.push(c.WALL_L + ((c.WALL_R - c.WALL_L) * i) / c.N_SLOTS);
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
  { name: "Игрок 1", color: "#22e0ff", soft: "rgba(34,224,255,0.16)", emoji: "🔵" },
  { name: "Игрок 2", color: "#ff45d8", soft: "rgba(255,69,216,0.16)", emoji: "🟣" },
];

// цвет по «ценности» лунки
function tierColor(v: number): string {
  if (v >= 8) return "#ffd23f";
  if (v >= 5) return "#ff9f1c";
  if (v >= 3) return "#a78bfa";
  if (v >= 1.8) return "#5ad1ff";
  return "#7dffc0";
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
      const g = board.gaps.find((gg) => `${gg.row}:${gg.idx}` === k);
      if (g) segs.push({ ax: g.ax, ay: g.ay, bx: g.bx, by: g.by });
    });
    return segs;
  }, [walls, board.gaps]);

  const revealOrder = useMemo(() => {
    const order: { player: number; ball: number }[] = [];
    for (let b = 0; b < CFG.BALLS_PER_PLAYER; b++) {
      order.push({ player: 0, ball: b });
      order.push({ player: 1, ball: b });
    }
    return order;
  }, []);

  const revealData = useRef<{ player: number; path: number[][]; slot: number; value: number; stuck: boolean }[]>([]);

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
  const particles = useRef<Particle[]>([]);
  const pops = useRef<Pop[]>([]);
  const screenShake = useRef(0);

  const playback = useRef<{
    path: number[][];
    i: number;
    color: string;
    player: number;
    landed: { x: number; y: number; color: string }[];
    pausing: number;
    done: boolean;
    trail: number[][];
  }>({ path: [], i: 0, color: "#fff", player: 0, landed: [], pausing: 0, done: false, trail: [] });

  const view = useRef({ phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoffNext: handoff.next });
  useEffect(() => {
    view.current = { phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoffNext: handoff.next };
  }, [phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues, handoff.next]);

  const resize = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    let scale = cv.width / CFG.VW;
    if (CFG.VH * scale > cv.height) scale = cv.height / CFG.VH;
    tf.current = {
      scale,
      offX: (cv.width - CFG.VW * scale) / 2,
      offY: (cv.height - CFG.VH * scale) / 2,
      dpr,
    };
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    const id = window.setTimeout(resize, 60);
    return () => { window.removeEventListener("resize", resize); window.clearTimeout(id); };
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

    const drawCup = (i: number, val: number, viewer: number, isReveal: boolean, showValues: boolean) => {
      const d = board.dividers;
      const x0 = d[i], x1 = d[i + 1];
      const cx = (x0 + x1) / 2;
      const col = showValues ? tierColor(val) : "#6b7280";
      const r = S(7);
      const top = Y(CFG.SLOT_TOP), bot = Y(CFG.FLOOR);

      ctx.beginPath();
      const lx = X(x0) + S(2), rx = X(x1) - S(2);
      ctx.moveTo(lx, top);
      ctx.lineTo(lx, bot - r);
      ctx.quadraticCurveTo(lx, bot, lx + r, bot);
      ctx.lineTo(rx - r, bot);
      ctx.quadraticCurveTo(rx, bot, rx, bot - r);
      ctx.lineTo(rx, top);
      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, "rgba(255,255,255,0.04)");
      grad.addColorStop(1, col + "88");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = S(1.5);
      ctx.strokeStyle = col + "ee";
      ctx.stroke();

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = S(4);
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${S(12.5)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(showValues ? `×${fmt(val)}` : "?", X(cx), (top + bot) / 2 + S(1));
      ctx.restore();

      if (showValues && !isReveal && factorOf(viewer, i) !== 1) {
        ctx.save();
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = S(4);
        ctx.font = `900 ${S(7.5)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(factorOf(viewer, i) > 1 ? "буст" : "сброс", X(cx), top - S(5));
        ctx.restore();
      }
    };

    const factorOf = (viewer: number, i: number) => view.current.factors[viewer][i];

    const loop = () => {
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
        screenShake.current = Math.max(0, screenShake.current * 0.86 - 0.05);
      }

      // рамка поля
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = S(2);
      ctx.strokeRect(X(CFG.WALL_L), Y(8), S(CFG.WALL_R - CFG.WALL_L), S(CFG.FLOOR - 8));

      // боковые стены
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(X(CFG.WALL_L) - S(3), Y(8), S(3), S(CFG.FLOOR - 8));
      ctx.fillRect(X(CFG.WALL_R), Y(8), S(3), S(CFG.FLOOR - 8));

      // стаканы
      for (let i = 0; i < CFG.N_SLOTS; i++) drawCup(i, display[i], viewer, isReveal, showValues);

      // пеги
      for (const p of board.pegs) {
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(220,235,255,0.9)";
        ctx.shadowColor = "rgba(150,200,255,0.6)";
        ctx.shadowBlur = S(4);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // стенки: свои во время хода, все при вскрытии
      const wallKeys = isReveal
        ? new Set<string>([...v.walls[0], ...v.walls[1]])
        : new Set<string>(v.walls[viewer]);
      wallKeys.forEach((k) => {
        const g = board.gaps.find((gg) => `${gg.row}:${gg.idx}` === k);
        if (!g) return;
        ctx.beginPath();
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
        ctx.lineCap = "round";
        ctx.lineWidth = S(6);
        ctx.strokeStyle = isReveal ? "#ffe16b" : PLAYERS[viewer].color;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.shadowBlur = S(8);
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
          pb.pausing--;
        } else if (!pb.done && pb.path.length) {
          const activeData = revealData.current[v.revealIdx];

          // Если шарик завис на пользовательской стенке/пеге и не дошёл до стакана,
          // не заставляем игрока ждать весь длинный хвост симуляции.
          // Показываем пару секунд движения, затем считаем бросок завершённым как ×1.
          if (activeData?.stuck && pb.i > 600) {
            pb.i = pb.path.length - 1;
          } else {
            pb.i = Math.min(pb.i + CFG.SUBSTEPS_PER_FRAME, pb.path.length - 1);
          }

          if (pb.i >= pb.path.length - 1) {
            const [lx, ly] = pb.path[pb.path.length - 1];
            const mult = activeData?.value ?? 1;
            const stuck = activeData?.stuck ?? false;
            pb.landed.push({ x: lx, y: ly, color: pb.color });
            spawnLanding(lx, ly, pb.color, mult, stuck);
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
        if (pb.trail.length > 12) pb.trail.shift();
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
        p.life--;
        p.vy += 0.25;
        p.x += p.vx; p.y += p.vy;
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
        o.life--;
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

    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

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

      return;
    }

    const slot = (() => {
      const d = board.dividers;
      for (let i = 0; i < d.length - 1; i++) if (x >= d[i] && x < d[i + 1]) return i;
      return x < d[0] ? 0 : CFG.N_SLOTS - 1;
    })();

    const tcol = tierColor(value);
    const power = Math.max(1, Math.min(10, value));
    const n = Math.round(14 + power * 8);

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
    particles.current = []; pops.current = [];
    screenShake.current = 0;
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

    // ×2 / ÷2 — по лунке
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
    particles.current = []; pops.current = [];
    screenShake.current = 0;
    playback.current = { path: [], i: 0, color: "#fff", player: 0, landed: [], pausing: 0, done: false, trail: [] };
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
      landed: playback.current.landed,
      pausing: 12, done: false, trail: [],
    };
  };

  const onBallLanded = () => {
    setRevealIdx((idx) => {
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
      if (nextIdx >= revealData.current.length) {
        window.setTimeout(() => {
          hapticNotify("success");
          setPhase("result");
        }, 1100);
        return idx;
      }
      window.setTimeout(() => { setLastGain(null); loadBall(nextIdx); }, 850);
      return nextIdx;
    });
  };

  /* ------------------------------- ПРОИЗВОДНОЕ ---------------------------- */
  const angleDeg = Math.round(liveAngle * CFG.ANGLE_MAX_DEG);
  const winner = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;

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

  return (
    <div
      className="relative flex h-full max-h-full w-full flex-col overflow-hidden overscroll-none select-none"
      style={{
        background: "radial-gradient(120% 80% at 50% -10%, #10193a 0%, #070a18 55%, #04060f 100%)",
        color: "#eaf2ff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        touchAction: "none",
      }}
    >
      {/* ВЕРХ: аватарки + счёт */}
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-2 px-2.5 pt-1.5 pb-1">
        {PLAYERS.map((p, i) => {
          const active = (phase === "angles" || phase === "actions") && turn === i;
          return (
            <div
              key={i}
              className="flex flex-1 items-center gap-1.5 rounded-xl px-2 py-1 transition-all"
              style={{
                background: active ? p.soft : "rgba(255,255,255,0.04)",
                boxShadow: active ? `0 0 0 1.5px ${p.color}` : "none",
                flexDirection: i === 1 ? "row-reverse" : "row",
              }}
            >
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                style={{ background: p.color, boxShadow: active ? `0 0 10px ${p.color}` : "none", color: "#05070f" }}
              >
                {p.emoji}
              </div>
              <div className="flex flex-col leading-none" style={{ textAlign: i === 1 ? "right" : "left" }}>
                <span className="text-[8px] font-semibold uppercase tracking-wide opacity-60">{p.name}</span>
                <span className="text-sm font-black" style={{ color: p.color }}>×{fmt(scores[i])}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* статус */}
      <div className="relative z-30 shrink-0 px-3 pb-0.5 text-center text-[10px] font-medium opacity-70" style={{ minHeight: 13 }}>
        {phase === "angles" && `${PLAYERS[turn].name}: угол шарика ${curBall + 1} из ${CFG.BALLS_PER_PLAYER}`}
        {phase === "actions" && `${PLAYERS[turn].name}: действий ${actionsLeft} · ${timeLeft}с`}
        {phase === "reveal" && `Шарик ${Math.min(revealIdx + 1, revealOrder.length)} из ${revealOrder.length}`}
        {phase === "result" && "Игра окончена"}
        {phase === "intro" && `PvP · ${CFG.BALLS_PER_PLAYER} шариков · скрытые множители`}
      </div>

      {/* ПОЛЕ */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          onPointerMove={(e) => { if (phase === "angles" && e.buttons === 1) onCanvasPointer(e); }}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
        />
        {lastGain && (
          <div
            className="pointer-events-none absolute left-1/2 top-1.5 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-black"
            style={{ background: PLAYERS[lastGain.p].color, color: "#05070f", boxShadow: `0 0 18px ${PLAYERS[lastGain.p].color}` }}
          >
            {PLAYERS[lastGain.p].emoji} {lastGain.stuck ? "застрял · ×1" : `×${fmt(lastGain.v)} → ×${fmt(lastGain.score)}`}
          </div>
        )}
      </div>

      {/* НИЗ: управление */}
      <div
        className="relative z-30 shrink-0 border-t border-white/5 px-3 pb-4 pt-1.5"
        style={{
          background: "linear-gradient(180deg, rgba(5,6,16,0.84), rgba(5,6,16,0.98))",
          backdropFilter: "blur(8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        }}
      >
        {phase === "angles" && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] opacity-70">
              <span>◀ влево</span>
              <span className="text-xs font-bold" style={{ color: PLAYERS[turn].color }}>
                {angleDeg > 0 ? "+" : ""}{angleDeg}°
              </span>
              <span>вправо ▶</span>
            </div>

            <div
              ref={sliderRef}
              onPointerDown={sliderDown}
              onPointerMove={sliderMove}
              className="relative h-6 w-full cursor-pointer"
              style={{ touchAction: "none" }}
            >
              <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              <div className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2" style={{ background: "rgba(255,255,255,0.3)" }} />
              <div
                className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${((liveAngle + 1) / 2) * 100}%`,
                  background: PLAYERS[turn].color,
                  boxShadow: `0 0 12px ${PLAYERS[turn].color}`,
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { hapticSelection(); setLiveAngle((a) => Math.max(-1, Math.round((a - 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000)); }}
                className="h-8 w-11 shrink-0 rounded-xl text-base font-bold active:scale-95"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >−</button>
              <button
                onClick={confirmAngle}
                className="h-8 flex-1 rounded-xl text-xs font-bold active:scale-[0.98]"
                style={{ background: PLAYERS[turn].color, color: "#05070f" }}
              >
                Готово · {curBall + 1}/{CFG.BALLS_PER_PLAYER}
              </button>
              <button
                onClick={() => { hapticSelection(); setLiveAngle((a) => Math.min(1, Math.round((a + 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000)); }}
                className="h-8 w-11 shrink-0 rounded-xl text-base font-bold active:scale-95"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >+</button>
            </div>
          </div>
        )}

        {phase === "actions" && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-3 gap-2">
              {([
                { m: "x2" as ActionMode, label: "×2", hint: "усилить" },
                { m: "half" as ActionMode, label: "÷2", hint: "срезать" },
                { m: "wall" as ActionMode, label: "Стенка", hint: "пег" },
              ]).map((b) => {
                const on = actionMode === b.m;
                return (
                  <button
                    key={b.m}
                    disabled={actionsLeft <= 0}
                    onClick={() => {
                      hapticSelection();
                      setActionMode(on ? null : b.m);
                    }}
                    className="flex h-10 flex-col items-center justify-center rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40"
                    style={{
                      background: on ? PLAYERS[turn].color : "rgba(255,255,255,0.06)",
                      color: on ? "#05070f" : "#dbe6ff",
                      boxShadow: on ? `0 0 12px ${PLAYERS[turn].color}` : "none",
                    }}
                  >
                    <span className="leading-none">{b.label}</span>
                    <span className="mt-0.5 text-[8px] font-medium opacity-70 leading-none">{b.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-center text-[9px] font-medium opacity-60" style={{ minHeight: 11 }}>
              {actionMode === "wall"
                ? "Жмите точку между пегами"
                : actionMode
                ? "Жмите по лунке"
                : "Выберите действие"}
            </div>
            <button
              onClick={finishActionTurn}
              className="h-7 w-full rounded-xl text-[11px] font-semibold opacity-80 active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              Завершить ход
            </button>
          </div>
        )}

        {phase === "intro" && (
          <button
            onClick={startGame}
            className="h-11 w-full rounded-2xl text-base font-black active:scale-[0.98]"
            style={{ background: "linear-gradient(90deg,#22e0ff,#ff45d8)", color: "#05070f" }}
          >
            Начать игру
          </button>
        )}

        {phase === "result" && (
          <button
            onClick={startGame}
            className="h-11 w-full rounded-2xl text-base font-black active:scale-[0.98]"
            style={{ background: "linear-gradient(90deg,#22e0ff,#ff45d8)", color: "#05070f" }}
          >
            Играть снова
          </button>
        )}

        {(phase === "reveal" || phase === "handoff") && (
          <div className="h-11 w-full" />
        )}
      </div>

      {/* ОВЕРЛЕЙ: ПЕРЕДАЧА ТЕЛЕФОНА */}
      {phase === "handoff" && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-8 text-center"
          style={{ background: "rgba(4,6,15,0.95)", backdropFilter: "blur(6px)" }}
        >
          <div className="text-5xl">{PLAYERS[handoff.to].emoji}</div>
          <div>
            <div className="text-xl font-black" style={{ color: PLAYERS[handoff.to].color }}>
              Передайте телефон: {PLAYERS[handoff.to].name}
            </div>
            <div className="mt-2 text-sm opacity-70">{handoff.label}</div>
          </div>
          <button
            onClick={proceedHandoff}
            className="rounded-2xl px-8 py-3.5 text-base font-bold active:scale-[0.98]"
            style={{ background: PLAYERS[handoff.to].color, color: "#05070f" }}
          >
            Я {PLAYERS[handoff.to].name}, продолжить
          </button>
        </div>
      )}

      {/* ОВЕРЛЕЙ: INTRO */}
      {phase === "intro" && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 px-8 text-center"
          style={{ background: "rgba(4,6,15,0.6)" }}
        >
          <div className="text-3xl font-black tracking-tight" style={{ background: "linear-gradient(90deg,#22e0ff,#ff45d8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            PLINKO · PvP
          </div>
          <div className="max-w-[300px] text-sm leading-relaxed opacity-75">
            Двое на одном телефоне. Счёт каждого начинается с ×1.
            Множители и ветер меняются каждую игру. Сначала оба выбирают углы,
            потом открываются стаканы и начинаются скрытые действия.
          </div>
        </div>
      )}

      {/* ОВЕРЛЕЙ: РЕЗУЛЬТАТ */}
      {phase === "result" && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 px-8 text-center"
          style={{ background: "rgba(4,6,15,0.78)", backdropFilter: "blur(4px)" }}
        >
          {winner === -1 ? (
            <div className="text-2xl font-black">Ничья!</div>
          ) : (
            <>
              <div className="text-5xl">{PLAYERS[winner].emoji}</div>
              <div className="text-2xl font-black" style={{ color: PLAYERS[winner].color }}>
                Победил {PLAYERS[winner].name}
              </div>
            </>
          )}
          <div className="flex items-center gap-6 text-lg font-bold">
            <span style={{ color: PLAYERS[0].color }}>×{fmt(scores[0])}</span>
            <span className="opacity-40">:</span>
            <span style={{ color: PLAYERS[1].color }}>×{fmt(scores[1])}</span>
          </div>
        </div>
      )}
    </div>
  );
}