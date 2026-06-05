import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ============================================================================
   PLINKO PvP  —  Telegram mini-app, mobile only
   ----------------------------------------------------------------------------
   Поток игры (хот-сит, потом легко вынести в онлайн):
     1) intro
     2) Каждый игрок задаёт угол наклона для 3 своих шариков (по очереди).
     3) Каждый игрок за 10 сек делает 2 действия (по очереди, не видя чужих):
          • ×2 множителя в лунке   • ÷2 множителя в лунке   • стенка между пегами
        Стенку можно ставить только НИЖЕ 3-го ряда сверху.
     4) Вскрытие: складываем модификаторы обоих, расставляем все стенки,
        запускаем шарики по очереди (П1-1, П2-1, П1-2, ...). Каждый шарик
        приносит игроку значение лунки. Кто набрал больше — победил.
   Между ходами — экран «передай телефон», чтобы соперник не подсмотрел.
   Физика детерминированная (фикс. шаг) => одинаковый угол = одинаковый путь.
   ========================================================================== */

/* ----------------------------- КОНФИГ / ФИЗИКА ---------------------------- */

const CFG = {
  VW: 360,
  VH: 480,
  ROWS: 8,
  TOP_Y: 70,
  SY: 32,
  SX: 30,
  TOP_PEGS: 3,
  pegR: 4.5,
  ballR: 6,
  WALL_L: 45,
  WALL_R: 315,
  SLOT_TOP: 300,
  FLOOR: 460,
  N_SLOTS: 9,
  g: 1300,
  eRest: 0.5,
  wRest: 0.45,
  air: 0.996,
  DT: 1 / 240,
  MAX_STEPS: 5200,
  // базовые очки лунок (удобно делятся на 2 / умножаются)
  VALUES: [40, 16, 8, 4, 2, 4, 8, 16, 40] as number[],
  // ставить стенку можно начиная с этого ряда (индекс с 0) — «ниже 3-го ряда»
  WALL_MIN_ROW: 3,
  ACTIONS_PER_TURN: 2,
  TURN_SECONDS: 10,
  BALLS_PER_PLAYER: 3,
  ANGLE_MAX_DEG: 16,
};

type Peg = { x: number; y: number; row: number; col: number };
type Seg = { ax: number; ay: number; bx: number; by: number };
type Gap = { row: number; idx: number } & Seg & { mx: number; my: number };
type Board = { pegs: Peg[]; dividers: number[]; gaps: Gap[] };
type SimResult = { path: number[][]; slot: number };

function buildBoard(): Board {
  const pegs: Peg[] = [];
  for (let r = 0; r < CFG.ROWS; r++) {
    const n = CFG.TOP_PEGS + r;
    const w = (n - 1) * CFG.SX;
    const left = CFG.VW / 2 - w / 2;
    for (let c = 0; c < n; c++)
      pegs.push({ x: left + c * CFG.SX, y: CFG.TOP_Y + r * CFG.SY, row: r, col: c });
  }
  const bottom = pegs.filter((p) => p.row === CFG.ROWS - 1).sort((a, b) => a.x - b.x);
  const dividers = bottom.map((p) => p.x);

  const gaps: Gap[] = [];
  for (let r = CFG.WALL_MIN_ROW; r < CFG.ROWS; r++) {
    const row = pegs.filter((p) => p.row === r).sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      gaps.push({
        row: r,
        idx: i,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      });
    }
  }
  return { pegs, dividers, gaps };
}

function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return [ax, ay] as const;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * dx, ay + t * dy] as const;
}

/** Детерминированная симуляция падения. angleNorm ∈ [-1, 1]. */
function simulate(angleNorm: number, board: Board, userWalls: Seg[]): SimResult {
  const c = CFG;
  let x = c.VW / 2;
  let y = 28;
  let vx = angleNorm * 95;
  let vy = 25;
  const path: number[][] = [];
  let lowEnergy = 0;
  let settle = 0;

  for (let step = 0; step < c.MAX_STEPS; step++) {
    vy += c.g * c.DT;
    vx *= c.air;
    vy *= c.air;
    x += vx * c.DT;
    y += vy * c.DT;

    // пеги
    for (const p of board.pegs) {
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      const md = c.ballR + c.pegR;
      if (d2 < md * md && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const ov = md - d;
        x += nx * ov;
        y += ny * ov;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          vx -= (1 + c.eRest) * vn * nx;
          vy -= (1 + c.eRest) * vn * ny;
        }
      }
    }
    // стенки игроков
    for (const w of userWalls) {
      const [px, py] = closestOnSeg(x, y, w.ax, w.ay, w.bx, w.by);
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      const md = c.ballR + 3.5;
      if (d2 < md * md && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const ov = md - d;
        x += nx * ov;
        y += ny * ov;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          vx -= (1 + c.eRest) * vn * nx;
          vy -= (1 + c.eRest) * vn * ny;
        }
      }
    }
    // боковые стены
    if (x - c.ballR < c.WALL_L) {
      x = c.WALL_L + c.ballR;
      if (vx < 0) vx = -vx * c.wRest;
    }
    if (x + c.ballR > c.WALL_R) {
      x = c.WALL_R - c.ballR;
      if (vx > 0) vx = -vx * c.wRest;
    }
    // разделители лунок
    if (y + c.ballR > c.SLOT_TOP) {
      for (const dx0 of board.dividers) {
        const ddx = x - dx0;
        const ddy = y - c.SLOT_TOP;
        const d2 = ddx * ddx + ddy * ddy;
        const md = c.ballR + 2.5;
        if (d2 < md * md && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const nx = ddx / d;
          const ny = ddy / d;
          const ov = md - d;
          x += nx * ov;
          y += ny * ov;
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            vx -= (1 + c.eRest) * vn * nx;
            vy -= (1 + c.eRest) * vn * ny;
          }
        }
        if (Math.abs(x - dx0) < c.ballR && y > c.SLOT_TOP) {
          if (x < dx0) {
            x = dx0 - c.ballR;
            if (vx > 0) vx = -vx * c.wRest;
          } else {
            x = dx0 + c.ballR;
            if (vx < 0) vx = -vx * c.wRest;
          }
        }
      }
    }
    // пол
    if (y + c.ballR > c.FLOOR) {
      y = c.FLOOR - c.ballR;
      if (vy > 0) vy = -vy * 0.12;
      vx *= 0.78;
    }
    if (y > c.SLOT_TOP) vx *= 0.92;

    // анти-залипание (детерминированное) только над лунками
    const sp = Math.abs(vx) + Math.abs(vy);
    if (sp < 2.2 && y < c.SLOT_TOP) {
      if (++lowEnergy > 8) {
        const dir = (Math.floor(x * 7) + Math.floor(y * 13)) & 1 ? 1 : -1;
        vx += dir * 22;
        vy += 10;
        lowEnergy = 0;
      }
    } else lowEnergy = 0;

    if (step % 2 === 0) path.push([x, y]);

    if (y > c.SLOT_TOP + 18 && Math.abs(vx) < 4 && Math.abs(vy) < 7) {
      if (++settle > 36) break;
    } else settle = 0;
  }

  const d = board.dividers;
  let slot = x < d[0] ? 0 : x >= d[d.length - 1] ? c.N_SLOTS - 1 : 0;
  for (let i = 0; i < d.length - 1; i++)
    if (x >= d[i] && x < d[i + 1]) {
      slot = i;
      break;
    }
  slot = Math.max(0, Math.min(c.N_SLOTS - 1, slot));
  return { path, slot };
}

/* ------------------------------- ТИПЫ ИГРЫ -------------------------------- */

type Phase =
  | "intro"
  | "handoff"
  | "angles"
  | "actions"
  | "reveal"
  | "result";

type ActionMode = "x2" | "half" | "wall" | null;
type WallKey = string; // `${row}:${idx}`

const PLAYERS = [
  { name: "Игрок 1", color: "#22e0ff", soft: "rgba(34,224,255,0.18)", emoji: "🔵" },
  { name: "Игрок 2", color: "#ff45d8", soft: "rgba(255,69,216,0.18)", emoji: "🟣" },
];

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/* =============================== КОМПОНЕНТ ================================= */

export const PlinkoPvpGame: React.FC = () => {
  const board = useMemo(() => buildBoard(), []);

  const [phase, setPhase] = useState<Phase>("intro");
  const [turn, setTurn] = useState(0); // активный игрок 0/1

  // углы: angles[player][ball]
  const [angles, setAngles] = useState<number[][]>([
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const [curBall, setCurBall] = useState(0);
  const [liveAngle, setLiveAngle] = useState(0);

  // модификаторы множителей и стенки — отдельно по игрокам
  const [factors, setFactors] = useState<number[][]>([
    Array(CFG.N_SLOTS).fill(1),
    Array(CFG.N_SLOTS).fill(1),
  ]);
  const [walls, setWalls] = useState<WallKey[][]>([[], []]);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionsLeft, setActionsLeft] = useState(CFG.ACTIONS_PER_TURN);
  const [timeLeft, setTimeLeft] = useState(CFG.TURN_SECONDS);

  // вскрытие
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [lastGain, setLastGain] = useState<{ p: number; v: number } | null>(null);

  // экран передачи телефона
  const [handoff, setHandoff] = useState<{ to: number; label: string; next: Phase }>(
    { to: 0, label: "", next: "angles" }
  );

  /* ---- комбинированная доска для вскрытия ---- */
  const combinedValues = useMemo(() => {
    return CFG.VALUES.map((v, i) =>
      Math.round(v * factors[0][i] * factors[1][i] * 10) / 10
    );
  }, [factors]);

  const allWallSegs = useMemo<Seg[]>(() => {
    const keys = new Set([...walls[0], ...walls[1]]);
    const segs: Seg[] = [];
    keys.forEach((k) => {
      const g = board.gaps.find((g) => `${g.row}:${g.idx}` === k);
      if (g) segs.push({ ax: g.ax, ay: g.ay, bx: g.bx, by: g.by });
    });
    return segs;
  }, [walls, board.gaps]);

  /* ---- порядок запуска шариков при вскрытии (чередуем) ---- */
  const revealOrder = useMemo(() => {
    const order: { player: number; ball: number }[] = [];
    for (let b = 0; b < CFG.BALLS_PER_PLAYER; b++) {
      order.push({ player: 0, ball: b });
      order.push({ player: 1, ball: b });
    }
    return order;
  }, []);

  // предрасчёт путей всех шариков на момент вскрытия
  const revealData = useRef<{ player: number; path: number[][]; slot: number; value: number }[]>(
    []
  );

  /* --------------------------- АНИМАЦИЯ / CANVAS --------------------------- */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tf = useRef({ scale: 1, offX: 0, offY: 0 });
  const raf = useRef<number>(0);

  // состояние проигрывания вскрытия
  const playback = useRef<{
    path: number[][];
    i: number;
    step: number;
    color: string;
    player: number;
    landed: { x: number; y: number; color: string }[];
    pausing: number;
    done: boolean;
  }>({
    path: [],
    i: 0,
    step: 1,
    color: "#fff",
    player: 0,
    landed: [],
    pausing: 0,
    done: false,
  });

  // ссылки на изменяемое состояние для цикла рисования
  const view = useRef({
    phase,
    turn,
    liveAngle,
    factors,
    walls,
    actionMode,
    combinedValues,
  });
  useEffect(() => {
    view.current = { phase, turn, liveAngle, factors, walls, actionMode, combinedValues };
  }, [phase, turn, liveAngle, factors, walls, actionMode, combinedValues]);

  const resize = useCallback(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const scale = Math.min((w * dpr) / CFG.VW, (h * dpr) / CFG.VH);
    tf.current = {
      scale,
      offX: (w * dpr - CFG.VW * scale) / 2,
      offY: (h * dpr - CFG.VH * scale) / 2,
    };
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // главный цикл отрисовки
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const S = (v: number) => v * tf.current.scale;
    const X = (v: number) => tf.current.offX + v * tf.current.scale;
    const Y = (v: number) => tf.current.offY + v * tf.current.scale;

    const loop = () => {
      const { phase, turn, liveAngle, factors, walls, actionMode, combinedValues } =
        view.current;
      ctx.clearRect(0, 0, cv.width, cv.height);

      const isReveal = phase === "reveal" || phase === "result";
      const pColor = PLAYERS[turn].color;

      // значения и стенки, видимые сейчас
      const displayValues = isReveal
        ? combinedValues
        : CFG.VALUES.map((v, i) => Math.round(v * factors[turn][i] * 10) / 10);
      const visibleWallKeys = isReveal
        ? new Set([...walls[0], ...walls[1]])
        : new Set(walls[turn]);

      // фон-рамка поля
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = S(1);
      ctx.strokeRect(X(CFG.WALL_L), Y(CFG.TOP_Y - 24), S(CFG.WALL_R - CFG.WALL_L), S(CFG.FLOOR - CFG.TOP_Y + 24));
      ctx.restore();

      // боковые стены
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = S(2);
      ctx.beginPath();
      ctx.moveTo(X(CFG.WALL_L), Y(CFG.TOP_Y - 24));
      ctx.lineTo(X(CFG.WALL_L), Y(CFG.FLOOR));
      ctx.moveTo(X(CFG.WALL_R), Y(CFG.TOP_Y - 24));
      ctx.lineTo(X(CFG.WALL_R), Y(CFG.FLOOR));
      ctx.stroke();

      // доступные щели для стенки (режим wall)
      if (phase === "actions" && actionMode === "wall") {
        for (const g of board.gaps) {
          const key = `${g.row}:${g.idx}`;
          if (visibleWallKeys.has(key)) continue;
          ctx.beginPath();
          ctx.arc(X(g.mx), Y(g.my), S(4), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fill();
          ctx.strokeStyle = pColor;
          ctx.lineWidth = S(1);
          ctx.stroke();
        }
      }

      // пеги
      for (const p of board.pegs) {
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR), 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(120,200,255,0.5)";
        ctx.shadowBlur = S(4);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // стенки игроков
      visibleWallKeys.forEach((key) => {
        const g = board.gaps.find((g) => `${g.row}:${g.idx}` === key);
        if (!g) return;
        // если вскрытие — цвет того, кто поставил; иначе цвет хода
        let col = pColor;
        if (isReveal) col = walls[0].includes(key) ? PLAYERS[0].color : PLAYERS[1].color;
        ctx.beginPath();
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
        ctx.strokeStyle = col;
        ctx.lineWidth = S(5);
        ctx.lineCap = "round";
        ctx.shadowColor = col;
        ctx.shadowBlur = S(8);
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // разделители лунок
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = S(2);
      for (const dx of board.dividers) {
        ctx.beginPath();
        ctx.moveTo(X(dx), Y(CFG.SLOT_TOP));
        ctx.lineTo(X(dx), Y(CFG.FLOOR));
        ctx.stroke();
      }

      // лунки + значения
      for (let i = 0; i < CFG.N_SLOTS; i++) {
        const x0 = board.dividers[i];
        const x1 = board.dividers[i + 1];
        const cx = (x0 + x1) / 2;
        const base = CFG.VALUES[i];
        const val = displayValues[i];
        const hot = val >= 20;
        const grad = ctx.createLinearGradient(0, Y(CFG.SLOT_TOP), 0, Y(CFG.FLOOR));
        const baseCol = hot ? "255,196,64" : "120,160,255";
        grad.addColorStop(0, `rgba(${baseCol},0.05)`);
        grad.addColorStop(1, `rgba(${baseCol},0.28)`);
        ctx.fillStyle = grad;
        ctx.fillRect(X(x0) + S(1), Y(CFG.SLOT_TOP), S(x1 - x0) - S(2), S(CFG.FLOOR - CFG.SLOT_TOP));

        ctx.fillStyle = hot ? "#ffd23f" : "#cfe0ff";
        ctx.font = `700 ${S(13)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${fmt(val)}`, X(cx), Y((CFG.SLOT_TOP + CFG.FLOOR) / 2));
        // бейдж изменения
        if (!isReveal && val !== base) {
          ctx.fillStyle = val > base ? "#5dff9b" : "#ff6b6b";
          ctx.font = `700 ${S(8)}px ui-sans-serif`;
          ctx.fillText(val > base ? "×2" : "÷2", X(cx), Y(CFG.FLOOR - 8));
        }
      }

      // прицельная линия (фаза углов)
      if (phase === "angles") {
        const a = liveAngle;
        const sx = CFG.VW / 2;
        const sy = 28;
        ctx.beginPath();
        ctx.moveTo(X(sx), Y(sy));
        ctx.lineTo(X(sx + a * 70), Y(sy + 90));
        ctx.strokeStyle = pColor;
        ctx.lineWidth = S(2);
        ctx.setLineDash([S(5), S(5)]);
        ctx.stroke();
        ctx.setLineDash([]);
        // шарик на старте
        ctx.beginPath();
        ctx.arc(X(sx), Y(sy), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.shadowColor = pColor;
        ctx.shadowBlur = S(10);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // вскрытие: осевшие + летящий
      if (isReveal) {
        const pb = playback.current;
        for (const b of pb.landed) {
          ctx.beginPath();
          ctx.arc(X(b.x), Y(b.y), S(CFG.ballR), 0, Math.PI * 2);
          ctx.fillStyle = b.color;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (phase === "reveal" && !pb.done && pb.path.length) {
          // продвижение
          if (pb.pausing > 0) {
            pb.pausing--;
          } else {
            pb.i += pb.step;
            if (pb.i >= pb.path.length - 1) {
              pb.i = pb.path.length - 1;
              if (!pb.done) {
                pb.done = true;
                const last = pb.path[pb.i];
                pb.landed.push({
                  x: last[0],
                  y: Math.min(last[1], CFG.FLOOR - CFG.ballR),
                  color: pb.color,
                });
                // сигнал наверх, что шарик долетел
                window.setTimeout(() => onBallLanded(), 450);
              }
            }
          }
          const pt = pb.path[Math.min(pb.i, pb.path.length - 1)];
          ctx.beginPath();
          ctx.arc(X(pt[0]), Y(pt[1]), S(CFG.ballR), 0, Math.PI * 2);
          ctx.fillStyle = pb.color;
          ctx.shadowColor = pb.color;
          ctx.shadowBlur = S(12);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      raf.current = requestAnimationFrame(loop);
    };

    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  /* ----------------------------- ТАЙМЕР ХОДА ------------------------------ */
  useEffect(() => {
    if (phase !== "actions") return;
    setTimeLeft(CFG.TURN_SECONDS);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const left = CFG.TURN_SECONDS - Math.floor((Date.now() - t0) / 1000);
      setTimeLeft(left);
      if (left <= 0) {
        window.clearInterval(id);
        finishActionTurn();
      }
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
    setScores([0, 0]);
    setFactors([Array(CFG.N_SLOTS).fill(1), Array(CFG.N_SLOTS).fill(1)]);
    setWalls([[], []]);
    setAngles([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    setTurn(0);
    setCurBall(0);
    setLiveAngle(0);
    setPhase("angles");
  };

  // подтвердить угол текущего шарика
  const confirmAngle = () => {
    setAngles((prev) => {
      const next = prev.map((a) => [...a]);
      next[turn][curBall] = liveAngle;
      return next;
    });
    if (curBall < CFG.BALLS_PER_PLAYER - 1) {
      setCurBall((b) => b + 1);
      setLiveAngle(0);
    } else {
      // углы этого игрока готовы
      if (turn === 0) {
        setCurBall(0);
        setLiveAngle(0);
        toHandoff(1, "Задайте углы своих шариков", "angles");
      } else {
        // оба задали углы -> переходим к действиям первого
        setCurBall(0);
        toHandoff(0, "Ваши 2 действия (10 сек)", "actions");
      }
    }
  };

  // нажатие по канвасу (лунки / щели)
  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "actions" || actionsLeft <= 0 || !actionMode) return;
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / rect.width;
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const vx = (px - tf.current.offX) / tf.current.scale;
    const vy = (py - tf.current.offY) / tf.current.scale;

    if (actionMode === "wall") {
      // ближайшая свободная щель
      let best: Gap | null = null;
      let bd = 22 * 22;
      for (const g of board.gaps) {
        const key = `${g.row}:${g.idx}`;
        if (walls[turn].includes(key)) continue;
        const d = (g.mx - vx) ** 2 + (g.my - vy) ** 2;
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      if (best) {
        const key = `${best.row}:${best.idx}`;
        setWalls((prev) => {
          const n = prev.map((w) => [...w]);
          n[turn].push(key);
          return n;
        });
        consumeAction();
      }
      return;
    }

    // ×2 / ÷2: выбрать лунку
    if (vy >= CFG.SLOT_TOP && vy <= CFG.FLOOR) {
      let slot = -1;
      for (let i = 0; i < CFG.N_SLOTS; i++)
        if (vx >= board.dividers[i] && vx < board.dividers[i + 1]) {
          slot = i;
          break;
        }
      if (slot >= 0) {
        setFactors((prev) => {
          const n = prev.map((f) => [...f]);
          n[turn][slot] *= actionMode === "x2" ? 2 : 0.5;
          return n;
        });
        consumeAction();
      }
    }
  };

  const consumeAction = () => {
    setActionsLeft((a) => {
      const left = a - 1;
      if (left <= 0) window.setTimeout(finishActionTurn, 250);
      return left;
    });
    setActionMode(null);
  };

  const finishActionTurn = () => {
    setActionMode(null);
    setActionsLeft(CFG.ACTIONS_PER_TURN);
    if (turn === 0) {
      toHandoff(1, "Ваши 2 действия (10 сек)", "actions");
    } else {
      // оба отыграли -> вскрытие
      toHandoff(0, "Вскрытие! Запуск шариков", "reveal");
    }
  };

  // экран передачи телефона -> продолжить
  const proceedHandoff = () => {
    setTurn(handoff.to);
    if (handoff.next === "actions") {
      setActionsLeft(CFG.ACTIONS_PER_TURN);
      setActionMode(null);
    }
    if (handoff.next === "reveal") {
      startReveal();
      return;
    }
    setPhase(handoff.next);
  };

  /* ------------------------------ ВСКРЫТИЕ -------------------------------- */
  const startReveal = () => {
    // предрасчёт всех путей по комбинированной доске
    revealData.current = revealOrder.map(({ player, ball }) => {
      const r = simulate(angles[player][ball], board, allWallSegs);
      return { player, path: r.path, slot: r.slot, value: combinedValues[r.slot] };
    });
    playback.current.landed = [];
    setScores([0, 0]);
    setRevealIdx(0);
    setLastGain(null);
    setPhase("reveal");
    loadBall(0);
  };

  const loadBall = (idx: number) => {
    const d = revealData.current[idx];
    if (!d) return;
    const step = Math.max(1, Math.round(d.path.length / 110));
    playback.current = {
      ...playback.current,
      path: d.path,
      i: 0,
      step,
      color: PLAYERS[d.player].color,
      player: d.player,
      pausing: 10,
      done: false,
    };
  };

  // вызывается из цикла, когда шарик долетел
  const onBallLanded = () => {
    setRevealIdx((idx) => {
      const d = revealData.current[idx];
      if (d) {
        setScores((s) => {
          const ns: [number, number] = [s[0], s[1]];
          ns[d.player] += d.value;
          return ns;
        });
        setLastGain({ p: d.player, v: d.value });
      }
      const nextIdx = idx + 1;
      if (nextIdx >= revealData.current.length) {
        window.setTimeout(() => setPhase("result"), 900);
        return idx;
      }
      window.setTimeout(() => {
        setLastGain(null);
        loadBall(nextIdx);
      }, 700);
      return nextIdx;
    });
  };

  /* ------------------------------- РЕНДЕР --------------------------------- */
  const angleDeg = Math.round(liveAngle * CFG.ANGLE_MAX_DEG);
  const winner =
    scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;

  return (
    <div
      className="relative flex h-full min-h-full w-full flex-col overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #10193a 0%, #070a18 55%, #04060f 100%)",
        color: "#eaf2ff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ВЕРХНЯЯ ПАНЕЛЬ — аватарки и счёт */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        {PLAYERS.map((p, i) => {
          const active =
            (phase === "angles" || phase === "actions") && turn === i;
          return (
            <div
              key={i}
              className="flex flex-1 items-center gap-2 rounded-2xl px-2.5 py-1.5 transition-all"
              style={{
                background: active ? p.soft : "rgba(255,255,255,0.04)",
                boxShadow: active ? `0 0 0 1.5px ${p.color}` : "none",
                flexDirection: i === 1 ? "row-reverse" : "row",
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                style={{
                  background: p.color,
                  boxShadow: active ? `0 0 12px ${p.color}` : "none",
                  color: "#05070f",
                }}
              >
                {p.emoji}
              </div>
              <div
                className="flex flex-col leading-tight"
                style={{ textAlign: i === 1 ? "right" : "left" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  {p.name}
                </span>
                <span className="text-lg font-black" style={{ color: p.color }}>
                  {fmt(scores[i])}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* статус-строка */}
      <div className="px-3 pb-1 text-center text-[11px] font-medium opacity-70">
        {phase === "angles" &&
          `${PLAYERS[turn].name}: угол шарика ${curBall + 1} из ${CFG.BALLS_PER_PLAYER}`}
        {phase === "actions" &&
          `${PLAYERS[turn].name}: осталось действий ${actionsLeft} · ${timeLeft} сек`}
        {phase === "reveal" &&
          `Шарик ${Math.min(revealIdx + 1, revealOrder.length)} из ${revealOrder.length}`}
        {phase === "result" && "Игра окончена"}
        {phase === "intro" && "PvP · 3 шарика · 2 действия · 10 секунд"}
      </div>

      {/* ПОЛЕ */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
        />

        {/* плашка прироста очков */}
        {lastGain && (
          <div
            className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-black"
            style={{
              background: PLAYERS[lastGain.p].color,
              color: "#05070f",
              boxShadow: `0 0 20px ${PLAYERS[lastGain.p].color}`,
            }}
          >
            {PLAYERS[lastGain.p].emoji} +{fmt(lastGain.v)}
          </div>
        )}
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ УПРАВЛЕНИЯ */}
      <div className="px-3 pb-4 pt-2">
        {phase === "angles" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>◀ влево</span>
              <span className="text-base font-bold" style={{ color: PLAYERS[turn].color }}>
                {angleDeg > 0 ? "+" : ""}
                {angleDeg}°
              </span>
              <span>вправо ▶</span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              value={Math.round(liveAngle * 100)}
              onChange={(e) => setLiveAngle(Number(e.target.value) / 100)}
              className="w-full"
              style={{ accentColor: PLAYERS[turn].color }}
            />
            <button
              onClick={confirmAngle}
              className="w-full rounded-2xl py-3.5 text-base font-bold active:scale-[0.98]"
              style={{ background: PLAYERS[turn].color, color: "#05070f" }}
            >
              Задать угол шарика {curBall + 1} →
            </button>
          </div>
        )}

        {phase === "actions" && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2">
              {([
                { m: "x2" as ActionMode, label: "×2 лунку", hint: "удвоить" },
                { m: "half" as ActionMode, label: "÷2 лунку", hint: "вдвое" },
                { m: "wall" as ActionMode, label: "Стенка", hint: "перекрыть" },
              ]).map((b) => {
                const on = actionMode === b.m;
                return (
                  <button
                    key={b.m}
                    disabled={actionsLeft <= 0}
                    onClick={() => setActionMode(on ? null : b.m)}
                    className="flex flex-col items-center rounded-2xl py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
                    style={{
                      background: on ? PLAYERS[turn].color : "rgba(255,255,255,0.06)",
                      color: on ? "#05070f" : "#dbe6ff",
                      boxShadow: on ? `0 0 14px ${PLAYERS[turn].color}` : "none",
                    }}
                  >
                    <span>{b.label}</span>
                    <span className="text-[9px] font-medium opacity-70">{b.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-center text-[11px] font-medium opacity-60">
              {actionMode === "wall"
                ? "Нажмите на точку между пегами (ниже 3-го ряда)"
                : actionMode
                ? "Нажмите на лунку внизу"
                : "Выберите действие. Можно повторять одно и то же."}
            </div>
            <button
              onClick={finishActionTurn}
              className="w-full rounded-2xl py-2.5 text-sm font-semibold opacity-80 active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              Завершить ход досрочно
            </button>
          </div>
        )}

        {phase === "intro" && (
          <button
            onClick={startGame}
            className="w-full rounded-2xl py-4 text-lg font-black active:scale-[0.98]"
            style={{
              background: "linear-gradient(90deg,#22e0ff,#ff45d8)",
              color: "#05070f",
            }}
          >
            Начать игру
          </button>
        )}

        {phase === "result" && (
          <button
            onClick={startGame}
            className="w-full rounded-2xl py-4 text-lg font-black active:scale-[0.98]"
            style={{ background: "linear-gradient(90deg,#22e0ff,#ff45d8)", color: "#05070f" }}
          >
            Играть снова
          </button>
        )}
      </div>

      {/* ОВЕРЛЕЙ: ПЕРЕДАЧА ТЕЛЕФОНА */}
      {phase === "handoff" && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-8 text-center"
          style={{ background: "rgba(4,6,15,0.94)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
            style={{
              background: PLAYERS[handoff.to].color,
              boxShadow: `0 0 30px ${PLAYERS[handoff.to].color}`,
            }}
          >
            {PLAYERS[handoff.to].emoji}
          </div>
          <div>
            <div className="text-sm uppercase tracking-widest opacity-60">
              Передайте телефон
            </div>
            <div
              className="mt-1 text-2xl font-black"
              style={{ color: PLAYERS[handoff.to].color }}
            >
              {PLAYERS[handoff.to].name}
            </div>
            <div className="mt-3 text-sm opacity-75">{handoff.label}</div>
          </div>
          <button
            onClick={proceedHandoff}
            className="rounded-2xl px-10 py-3.5 text-base font-bold active:scale-95"
            style={{ background: PLAYERS[handoff.to].color, color: "#05070f" }}
          >
            Я готов
          </button>
        </div>
      )}

      {/* ОВЕРЛЕЙ: ИНТРО */}
      {phase === "intro" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-8 text-center">
          <div
            className="text-4xl font-black tracking-tight"
            style={{ textShadow: "0 0 24px rgba(34,224,255,0.5)" }}
          >
            PLINKO
          </div>
          <div
            className="text-5xl font-black tracking-tight"
            style={{
              background: "linear-gradient(90deg,#22e0ff,#ff45d8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            PvP
          </div>
        </div>
      )}

      {/* ОВЕРЛЕЙ: РЕЗУЛЬТАТ */}
      {phase === "result" && (
        <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-8 text-center">
          {winner === -1 ? (
            <div className="text-3xl font-black opacity-90">Ничья!</div>
          ) : (
            <>
              <div className="text-sm uppercase tracking-widest opacity-60">Победитель</div>
              <div
                className="mt-1 text-4xl font-black"
                style={{
                  color: PLAYERS[winner].color,
                  textShadow: `0 0 26px ${PLAYERS[winner].color}`,
                }}
              >
                {PLAYERS[winner].emoji} {PLAYERS[winner].name}
              </div>
              <div className="mt-2 text-lg font-bold opacity-80">
                {fmt(scores[winner])} : {fmt(scores[1 - winner])}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PlinkoPvpGame;