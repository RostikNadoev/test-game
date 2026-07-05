import { useEffect, useRef, useState, useCallback } from "react";
import { getTelegramWebApp } from "../types/telegram";
import { useLobbyMatchFinish } from "../hooks/useLobbyMatchFinish";

/* =========================================================================
   PAPER IO — mobile / Telegram mini app
   - canvas движок, фиксированный тик + интерполяция
   - территория / след / захват области (flood fill)
   - столкновения (свой след, чужой след, стена)
   - бот-противник с простым ИИ (выходит, захватывает, возвращается)
   - камера следует за игроком, динамический джойстик
   ========================================================================= */

const GRID = 64; // размер мира в клетках
const N = GRID * GRID;
const TICK_MS = 78; // как часто двигаемся на 1 клетку (меньше = быстрее)
const VISIBLE_CELLS = 19; // сколько клеток видно по меньшей стороне (зум, больше = дальше камера)
const DURATION = 90_000; // длительность матча, мс
const RESPAWN_MS = 900; // пауза перед возрождением

// направления: 0=вверх 1=вправо 2=вниз 3=влево
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
type Dir = 0 | 1 | 2 | 3;

const COLORS = {
  bg: "#050610",
  grid: "rgba(255,255,255,0.045)",
};

interface Player {
  id: number;
  name: string;
  fill: string; // заливка территории (с альфой)
  edge: string; // обводка территории
  trail: string; // цвет следа
  head: string; // цвет головы
  x: number;
  y: number;
  px: number; // предыдущая клетка (для интерполяции)
  py: number;
  dir: Dir;
  nextDir: Dir;
  trailCells: number[];
  alive: boolean;
  isBot: boolean;
  exitX: number;
  exitY: number;
  targetOut: number;
  respawnAt: number;
  kills: number;
}

interface Game {
  terr: Uint8Array; // владелец клетки (0 = ничья)
  trailGrid: Uint8Array; // владелец следа на клетке (0 = нет)
  players: Player[];
  running: boolean;
  over: boolean;
  win: boolean;
  lastScore: number;
  acc: number;
  last: number;
  flash: number; // вспышка при убийстве
  startedAt: number; // когда стартовал матч (performance.now)
  worldDirty: boolean; // нужно пересобрать офскрин-буфер поля
}

const idx = (x: number, y: number) => y * GRID + x;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;
const opp = (d: Dir): Dir => ((d + 2) % 4) as Dir;

function makePlayer(
  id: number,
  name: string,
  fill: string,
  edge: string,
  trail: string,
  head: string,
  cx: number,
  cy: number,
  dir: Dir,
  isBot: boolean
): Player {
  return {
    id,
    name,
    fill,
    edge,
    trail,
    head,
    x: cx,
    y: cy,
    px: cx,
    py: cy,
    dir,
    nextDir: dir,
    trailCells: [],
    alive: true,
    isBot,
    exitX: cx,
    exitY: cy,
    targetOut: 8,
    respawnAt: 0,
    kills: 0,
  };
}

function seedTerritory(g: Game, p: Player, cx: number, cy: number, r = 1) {
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++)
      if (inBounds(xx, yy)) g.terr[idx(xx, yy)] = p.id;
  g.worldDirty = true;
}

function createGame(): Game {
  const terr = new Uint8Array(N);
  const trailGrid = new Uint8Array(N);

  const p1 = makePlayer(
    1,
    "You",
    "rgba(84,242,168,0.20)",
    "#54F2A8",
    "rgba(84,242,168,0.55)",
    "#7CFFC6",
    16,
    46,
    0,
    false
  );
  const p2 = makePlayer(
    2,
    "Bot",
    "rgba(255,94,138,0.20)",
    "#FF5E8A",
    "rgba(255,94,138,0.55)",
    "#FF89AC",
    48,
    18,
    2,
    true
  );

  const g: Game = {
    terr,
    trailGrid,
    players: [p1, p2],
    running: false,
    over: false,
    win: false,
    lastScore: 0,
    acc: 0,
    last: 0,
    flash: 0,
    startedAt: 0,
    worldDirty: true,
  };
  seedTerritory(g, p1, p1.x, p1.y, 1);
  seedTerritory(g, p2, p2.x, p2.y, 1);
  return g;
}

function byId(g: Game, id: number) {
  return g.players.find((p) => p.id === id)!;
}

function kill(g: Game, p: Player) {
  if (!p.alive) return;
  p.alive = false;
  for (const ci of p.trailCells) if (g.trailGrid[ci] === p.id) g.trailGrid[ci] = 0;
  p.trailCells = [];
  for (let i = 0; i < N; i++) if (g.terr[i] === p.id) g.terr[i] = 0;
  g.flash = 1;
  g.worldDirty = true;
  // никто не «проигрывает» — все возрождаются с нуля в пустом месте
  p.respawnAt = performance.now() + RESPAWN_MS;
}

function respawn(g: Game, p: Player) {
  const other = g.players.find((o) => o.id !== p.id && o.alive);
  let bx = 32,
    by = 32,
    best = -Infinity;
  for (let t = 0; t < 40; t++) {
    const x = 5 + ((Math.random() * (GRID - 10)) | 0);
    const y = 5 + ((Math.random() * (GRID - 10)) | 0);
    // штраф за занятые клетки вокруг
    let occ = 0;
    for (let yy = y - 2; yy <= y + 2; yy++)
      for (let xx = x - 2; xx <= x + 2; xx++)
        if (inBounds(xx, yy) && (g.terr[idx(xx, yy)] !== 0 || g.trailGrid[idx(xx, yy)] !== 0)) occ++;
    const farFromOther = other ? Math.abs(x - other.x) + Math.abs(y - other.y) : 60;
    const score = farFromOther - occ * 6;
    if (score > best) {
      best = score;
      bx = x;
      by = y;
    }
  }
  p.x = p.px = bx;
  p.y = p.py = by;
  p.dir = p.nextDir = (((Math.random() * 4) | 0) as Dir);
  p.exitX = bx;
  p.exitY = by;
  p.trailCells = [];
  p.alive = true;
  seedTerritory(g, p, bx, by, 1);
}

// Захват области: след -> территория, затем заливка всего, что окружено
function capture(g: Game, p: Player) {
  for (const ci of p.trailCells) {
    g.terr[ci] = p.id;
    g.trailGrid[ci] = 0;
  }
  p.trailCells = [];

  const visited = new Uint8Array(N);
  const stack: number[] = [];
  const pushFree = (x: number, y: number) => {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    if (!visited[i] && g.terr[i] !== p.id) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < GRID; x++) {
    pushFree(x, 0);
    pushFree(x, GRID - 1);
  }
  for (let y = 0; y < GRID; y++) {
    pushFree(0, y);
    pushFree(GRID - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % GRID;
    const cy = (i / GRID) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (!visited[ni] && g.terr[ni] !== p.id) {
        visited[ni] = 1;
        stack.push(ni);
      }
    }
  }
  // всё, что не достижимо снаружи и не наше — окружено -> захват
  for (let i = 0; i < N; i++) {
    if (g.terr[i] !== p.id && !visited[i]) {
      // если внутри был чужой след — гасим
      if (g.trailGrid[i] !== 0 && g.trailGrid[i] !== p.id) g.trailGrid[i] = 0;
      g.terr[i] = p.id;
    }
  }
  g.worldDirty = true;
}

function move(g: Game, p: Player) {
  // повернуть, если не разворот на 180
  if (p.nextDir !== opp(p.dir)) p.dir = p.nextDir;

  const nx = p.x + DX[p.dir];
  const ny = p.y + DY[p.dir];
  p.px = p.x;
  p.py = p.y;

  // стена: не умираем, просто стоим на месте до поворота
  if (!inBounds(nx, ny)) {
    return;
  }
  const ni = idx(nx, ny);

  // столкновение со следом (любым) -> владелец следа умирает
  const tOwner = g.trailGrid[ni];
  if (tOwner !== 0) {
    const victim = byId(g, tOwner);
    if (victim.id !== p.id) p.kills++;
    kill(g, victim);
    if (victim.id === p.id) return; // врезался в свой след — всё
  }

  p.x = nx;
  p.y = ny;

  const owner = g.terr[ni];
  if (owner === p.id) {
    if (p.trailCells.length > 0) capture(g, p);
  } else {
    // если вышли из своей территории — запомним точку выхода
    const prevOwn = g.terr[idx(p.px, p.py)] === p.id;
    if (prevOwn) {
      p.exitX = p.px;
      p.exitY = p.py;
      if (p.isBot) p.targetOut = 6 + ((Math.random() * 11) | 0);
    }
    g.trailGrid[ni] = p.id;
    p.trailCells.push(ni);
  }
}

function thinkBot(g: Game, p: Player) {
  const o = opp(p.dir);
  const returning = p.trailCells.length >= p.targetOut;
  let best: Dir = p.dir;
  let bestScore = -Infinity;

  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (d === o) continue;
    const nx = p.x + DX[d];
    const ny = p.y + DY[d];
    if (!inBounds(nx, ny)) continue; // не врезаться в стену
    const ni = idx(nx, ny);
    if (g.trailGrid[ni] === p.id) continue; // не врезаться в свой след

    let score = d === p.dir ? 1.5 : 0; // меньше дёргаться
    const distExit = Math.abs(nx - p.exitX) + Math.abs(ny - p.exitY);

    if (returning) {
      score += 60 - distExit;
      if (g.terr[ni] === p.id) score += 80; // домой -> захват
    } else {
      score += distExit * 0.7;
      const edge = Math.min(nx, ny, GRID - 1 - nx, GRID - 1 - ny);
      if (edge < 3) score -= (3 - edge) * 4;
      // не липнуть к своему следу (чтобы не запереть себя)
      let adj = 0;
      for (let k = 0; k < 4; k++) {
        const ax = nx + DX[k];
        const ay = ny + DY[k];
        if (inBounds(ax, ay) && g.trailGrid[idx(ax, ay)] === p.id) adj++;
      }
      score -= adj * 5;
      score += Math.random() * 1.4;
    }
    // агрессия: наступить на чужой след = убить
    if (g.trailGrid[ni] !== 0 && g.trailGrid[ni] !== p.id) score += 12;

    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  p.nextDir = best;
}

function tick(g: Game) {
  const now = performance.now();
  for (const p of g.players) if (!p.alive && now >= p.respawnAt) respawn(g, p);
  for (const p of g.players) if (p.alive && p.isBot) thinkBot(g, p);
  for (const p of g.players) if (p.alive) move(g, p);

  // лоб в лоб: если две головы в одной клетке или прошли друг сквозь друга — обе гибнут
  const [a, b] = g.players;
  if (a.alive && b.alive) {
    const sameCell = a.x === b.x && a.y === b.y;
    const swapped = a.x === b.px && a.y === b.py && b.x === a.px && b.y === a.py;
    if (sameCell || swapped) {
      kill(g, a);
      kill(g, b);
    }
  }
}

/* ---------- офскрин-буфер поля: пересобирается только при изменении ---------- */
function buildWorld(g: Game, store: { canvas: HTMLCanvasElement | null; cs: number }, cs: number) {
  let wc = store.canvas;
  if (!wc) {
    wc = document.createElement("canvas");
    store.canvas = wc;
  }
  const size = GRID * cs;
  if (wc.width !== size) {
    wc.width = size;
    wc.height = size;
  }
  const c = wc.getContext("2d")!;
  c.clearRect(0, 0, size, size);

  // сетка
  c.strokeStyle = COLORS.grid;
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= GRID; i++) {
    const v = Math.round(i * cs) + 0.5;
    c.moveTo(v, 0);
    c.lineTo(v, size);
    c.moveTo(0, v);
    c.lineTo(size, v);
  }
  c.stroke();

  // заливка территорий
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const o = g.terr[idx(x, y)];
      if (!o) continue;
      c.fillStyle = g.players[o - 1].fill;
      c.fillRect(x * cs, y * cs, cs + 1, cs + 1);
    }
  }

  // обводка территорий со свечением
  c.lineWidth = Math.max(2, cs * 0.1);
  c.lineCap = "round";
  for (const p of g.players) {
    c.strokeStyle = p.edge;
    c.shadowColor = p.edge;
    c.shadowBlur = cs * 0.45;
    c.beginPath();
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (g.terr[idx(x, y)] !== p.id) continue;
        const X = x * cs;
        const Y = y * cs;
        if (y === 0 || g.terr[idx(x, y - 1)] !== p.id) {
          c.moveTo(X, Y);
          c.lineTo(X + cs, Y);
        }
        if (y === GRID - 1 || g.terr[idx(x, y + 1)] !== p.id) {
          c.moveTo(X, Y + cs);
          c.lineTo(X + cs, Y + cs);
        }
        if (x === 0 || g.terr[idx(x - 1, y)] !== p.id) {
          c.moveTo(X, Y);
          c.lineTo(X, Y + cs);
        }
        if (x === GRID - 1 || g.terr[idx(x + 1, y)] !== p.id) {
          c.moveTo(X + cs, Y);
          c.lineTo(X + cs, Y + cs);
        }
      }
    }
    c.stroke();
  }
  c.shadowBlur = 0;

  // стены мира
  c.strokeStyle = "rgba(255,255,255,0.22)";
  c.lineWidth = Math.max(3, cs * 0.16);
  c.shadowColor = "rgba(120,180,255,0.4)";
  c.shadowBlur = cs * 0.6;
  c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, size - c.lineWidth, size - c.lineWidth);
  c.shadowBlur = 0;

  store.cs = cs;
  g.worldDirty = false;
}

/* ============================== COMPONENT ============================== */

export const PaperIoGame = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createGame());
  const rafRef = useRef<number>(0);

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [p1pct, setP1pct] = useState(0);
  const [p2pct, setP2pct] = useState(0);
  const [kills, setKills] = useState(0);
  const [didWin, setDidWin] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const finishLobbyMatch = useLobbyMatchFinish("paper_io");

  useEffect(() => {
    if (phase !== "over") return;
    void finishLobbyMatch(didWin ? "win" : p1pct === p2pct ? "draw" : "loss");
  }, [phase, didWin, p1pct, p2pct, finishLobbyMatch]);

  // блокируем скролл/свайпы (в т.ч. закрытие TG mini app вертикальным свайпом)
  useEffect(() => {
    const tg = getTelegramWebApp();
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      /* ignore telegram init errors */
    }

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOver: html.style.overflow,
      bodyOver: body.style.overflow,
      over: body.style.overscrollBehavior,
      touch: body.style.touchAction,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";

    const stop = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });

    return () => {
      document.removeEventListener("touchmove", stop);
      html.style.overflow = prev.htmlOver;
      body.style.overflow = prev.bodyOver;
      body.style.overscrollBehavior = prev.over;
      body.style.touchAction = prev.touch;
      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        /* ignore telegram cleanup errors */
      }
    };
  }, []);

  // размеры canvas под контейнер + DPR
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, cell: 24 });
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      const cv = canvasRef.current;
      if (!el || !cv) return;
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = r.width + "px";
      cv.style.height = r.height + "px";
      const minSide = Math.min(r.width, r.height);
      sizeRef.current = {
        w: r.width,
        h: r.height,
        dpr,
        cell: minSide / VISIBLE_CELLS,
      };
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  /* ----------------------------- RENDER ----------------------------- */
  const worldRef = useRef<{ canvas: HTMLCanvasElement | null; cs: number }>({ canvas: null, cs: 0 });
  const vignetteRef = useRef<{ grad: CanvasGradient | null; w: number; h: number }>({
    grad: null,
    w: 0,
    h: 0,
  });

  const render = useCallback((progress: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const g = gameRef.current;
    const { dpr, cell } = sizeRef.current;
    const W = cv.width;
    const H = cv.height;
    const cs = Math.round(cell * dpr); // device px на клетку (целое — чётче и стабильнее)
    const time = performance.now();
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const t = g.running ? progress : 1;

    // фон
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // камера по игроку (device-пространство)
    const me = g.players[0];
    const ix = lerp(me.px, me.x, t);
    const iy = lerp(me.py, me.y, t);
    const offX = W / 2 - ix * cs;
    const offY = H / 2 - iy * cs;
    const SX = (c: number) => c * cs + offX;
    const SY = (c: number) => c * cs + offY;

    // поле из офскрина (пересборка только если изменилось/сменился масштаб)
    if (g.worldDirty || worldRef.current.cs !== cs || !worldRef.current.canvas) {
      buildWorld(g, worldRef.current, cs);
    }
    const wc = worldRef.current.canvas!;
    ctx.drawImage(wc, offX, offY);

    // следы (плоские, без тяжёлого blur). Пропускаем клетку под головой — иначе
    // квадрат «выскакивает» вперёд, пока голова до неё доезжает.
    const pad = Math.max(1, cs * 0.16);
    for (const p of g.players) {
      if (p.trailCells.length === 0) continue;
      const headCell = idx(p.x, p.y);
      ctx.fillStyle = p.trail;
      for (const ci of p.trailCells) {
        if (ci === headCell) continue;
        const x = ci % GRID;
        const y = (ci / GRID) | 0;
        ctx.fillRect(SX(x) + pad, SY(y) + pad, cs - pad * 2, cs - pad * 2);
      }
    }

    // головы — радиальный градиент + свечение + глазки
    for (const p of g.players) {
      if (!p.alive) continue;
      const hx = lerp(p.px, p.x, t);
      const hy = lerp(p.py, p.y, t);
      const X = SX(hx);
      const Y = SY(hy);
      const pulse = 1 + Math.sin(time / 260) * 0.04;
      const size = cs * 0.9 * pulse;
      const off = (cs - size) / 2;
      const cxp = X + cs / 2;
      const cyp = Y + cs / 2;

      ctx.shadowColor = p.head;
      ctx.shadowBlur = cs * 0.7;
      const grad = ctx.createRadialGradient(
        cxp - size * 0.18,
        cyp - size * 0.22,
        size * 0.1,
        cxp,
        cyp,
        size * 0.7
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, p.head);
      grad.addColorStop(1, p.edge);
      ctx.fillStyle = grad;
      roundRect(ctx, X + off, Y + off, size, size, size * 0.34);
      ctx.fill();
      ctx.shadowBlur = 0;

      // тонкое кольцо
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(1, cs * 0.04);
      roundRect(ctx, X + off, Y + off, size, size, size * 0.34);
      ctx.stroke();

      // глазки в сторону движения
      ctx.fillStyle = "rgba(5,6,16,0.92)";
      const ex = DX[p.dir] * size * 0.16;
      const ey = DY[p.dir] * size * 0.16;
      const eo = size * 0.2;
      const er = size * 0.1;
      const perpX = DY[p.dir];
      const perpY = -DX[p.dir];
      dot(ctx, cxp + ex + perpX * eo, cyp + ey + perpY * eo, er);
      dot(ctx, cxp + ex - perpX * eo, cyp + ey - perpY * eo, er);
    }

    // виньетка (кэшируем градиент по размеру)
    const vg = vignetteRef.current;
    if (!vg.grad || vg.w !== W || vg.h !== H) {
      const r = Math.hypot(W, H) / 2;
      const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.55, W / 2, H / 2, r);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.45)");
      vg.grad = grad;
      vg.w = W;
      vg.h = H;
    }
    ctx.fillStyle = vg.grad!;
    ctx.fillRect(0, 0, W, H);

    // вспышка при убийстве
    if (g.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.16})`;
      ctx.fillRect(0, 0, W, H);
      g.flash *= 0.85;
    }
  }, []);

  /* ----------------------------- LOOP ----------------------------- */
  useEffect(() => {
    const loop = (now: number) => {
      const g = gameRef.current;
      if (!g.last) g.last = now;
      let dt = now - g.last;
      g.last = now;
      if (dt > 250) dt = 250;

      if (g.running) {
        g.acc += dt;
        while (g.acc >= TICK_MS) {
          tick(g);
          g.acc -= TICK_MS;
          if (!g.running) break;
        }
        // обновляем счёт + таймер нечасто
        if (now - g.lastScore > 200) {
          g.lastScore = now;
          let c1 = 0,
            c2 = 0;
          for (let i = 0; i < N; i++) {
            const v = g.terr[i];
            if (v === 1) c1++;
            else if (v === 2) c2++;
          }
          const pct1 = Math.round((c1 / N) * 1000) / 10;
          const pct2 = Math.round((c2 / N) * 1000) / 10;
          setP1pct(pct1);
          setP2pct(pct2);
          setKills(g.players[0].kills);

          const remaining = Math.max(0, DURATION - (now - g.startedAt));
          setTimeLeft(remaining);

          if (remaining <= 0) {
            g.over = true;
            g.running = false;
            g.win = c1 > c2; // победа по проценту территории
            setDidWin(c1 > c2);
            setPhase("over");
          }
        }
      }
      render(g.running ? g.acc / TICK_MS : 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  /* ----------------------- INPUT: динамический джойстик ----------------------- */
  const joyRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const joyState = useRef({ active: false, bx: 0, by: 0, id: -1 });

  const setDirFromVec = (dx: number, dy: number) => {
    const g = gameRef.current;
    const me = g.players[0];
    if (!me.alive) return;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) return; // мёртвая зона
    let dir: Dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 1 : 3;
    else dir = dy > 0 ? 2 : 0;
    me.nextDir = dir;
  };

  const placeJoy = (x: number, y: number) => {
    const base = joyRef.current;
    if (!base) return;
    base.style.left = x + "px";
    base.style.top = y + "px";
    base.style.opacity = "1";
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate(-50%,-50%)`;
    }
  };
  const moveThumb = (dx: number, dy: number) => {
    const R = 46;
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    }
  };
  const hideJoy = () => {
    if (joyRef.current) joyRef.current.style.opacity = "0";
    joyState.current.active = false;
    joyState.current.id = -1;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== "playing") return;
    const wrap = wrapRef.current!;
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    joyState.current = { active: true, bx: x, by: y, id: e.pointerId };
    placeJoy(x, y);
    moveThumb(0, 0);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const j = joyState.current;
    if (!j.active || e.pointerId !== j.id) return;
    const wrap = wrapRef.current!;
    const r = wrap.getBoundingClientRect();
    const dx = e.clientX - r.left - j.bx;
    const dy = e.clientY - r.top - j.by;
    moveThumb(dx, dy);
    setDirFromVec(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerId === joyState.current.id) hideJoy(); // курс сохраняется
  };

  // клавиатура (для теста на десктопе)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const me = gameRef.current.players[0];
      if (!me.alive) return;
      const m: Record<string, Dir> = {
        ArrowUp: 0,
        ArrowRight: 1,
        ArrowDown: 2,
        ArrowLeft: 3,
        w: 0,
        d: 1,
        s: 2,
        a: 3,
      };
      const d = m[e.key];
      if (d !== undefined) {
        me.nextDir = d;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = () => {
    const g = createGame();
    gameRef.current = g;
    g.running = true;
    g.last = 0;
    g.startedAt = performance.now();
    setP1pct(0);
    setP2pct(0);
    setKills(0);
    setDidWin(false);
    setTimeLeft(DURATION);
    setPhase("playing");
  };

  /* ----------------------------- UI ----------------------------- */
  return (
    <div className="paperio-root">
      <style>{`
        .paperio-root {
          position: relative;
          height: 100%;
          min-height: 100%;
          width: 100%;
          overflow: hidden;
          background: #050610;
          color: #fff;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          overscroll-behavior: none;
          font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .pio-hud {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 8px 10px;
          padding-top: max(8px, env(safe-area-inset-top));
          pointer-events: none;
        }

        .pio-hud-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pio-kills {
          font-size: 10px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.45);
          letter-spacing: 0.04em;
        }

        .pio-stage {
          position: absolute;
          inset: 0;
          touch-action: none;
        }

        .pio-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        .pio-joy {
          position: absolute;
          width: 112px;
          height: 112px;
          margin-left: -56px;
          margin-top: -56px;
          border-radius: 9999px;
          border: 1.5px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
          opacity: 0;
          transition: opacity 0.12s;
          pointer-events: none;
          z-index: 15;
        }

        .pio-joy-thumb {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 52px;
          height: 52px;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: radial-gradient(circle at 35% 30%, #7cffc6, #54f2a8);
          box-shadow: 0 6px 20px rgba(84, 242, 168, 0.45);
        }

        .pio-modal-backdrop {
          position: absolute;
          inset: 0;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(5, 6, 16, 0.55);
          backdrop-filter: blur(6px);
        }

        .pio-modal-card {
          width: 100%;
          max-width: 340px;
          text-align: center;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(255, 255, 255, 0.045);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(16px);
          padding: 26px;
          animation: pio-pop 0.25s ease both;
        }

        .pio-modal-icon {
          margin: 0 auto;
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          font-size: 40px;
          animation: pio-float 3s ease-in-out infinite;
        }

        .pio-modal-kicker {
          margin-top: 18px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(84, 242, 168, 0.7);
        }

        .pio-modal-title {
          margin-top: 6px;
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .pio-modal-copy {
          margin: 12px auto 0;
          max-width: 280px;
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.5);
        }

        .pio-modal-btn {
          margin-top: 20px;
          width: 100%;
          padding: 15px 20px;
          border-radius: 18px;
          border: none;
          cursor: pointer;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: #04130c;
          background: linear-gradient(180deg, #7cffc6, #54f2a8);
          box-shadow: 0 12px 30px rgba(84, 242, 168, 0.4);
        }

        .pio-timer {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
          transition: all 0.2s;
        }

        .pio-timer-low {
          border-color: rgba(255, 94, 138, 0.5);
          background: rgba(255, 94, 138, 0.12);
        }

        .pio-timer-value {
          font-size: 13px;
          font-weight: 900;
          color: #fff;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }

        .pio-timer-value-low {
          color: #ff5e8a;
        }

        .pio-score {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
        }

        .pio-score-active-you {
          border-color: #54f2a855;
        }

        .pio-score-active-bot {
          border-color: #ff5e8a55;
        }

        .pio-score-dot-you {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: #54f2a8;
          box-shadow: 0 0 8px #54f2a8;
        }

        .pio-score-dot-bot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: #ff5e8a;
          box-shadow: 0 0 8px #ff5e8a;
        }

        .pio-score-label {
          font-size: 11px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.7);
          letter-spacing: 0.02em;
        }

        .pio-score-value-you {
          font-size: 11px;
          font-weight: 900;
          color: #54f2a8;
          font-variant-numeric: tabular-nums;
        }

        .pio-score-value-bot {
          font-size: 11px;
          font-weight: 900;
          color: #ff5e8a;
          font-variant-numeric: tabular-nums;
        }

        @keyframes pio-pop { 0%{transform:scale(.92);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes pio-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .pio-glow1{position:absolute;left:-90px;top:60px;width:280px;height:280px;border-radius:9999px;background:rgba(84,242,168,0.14);filter:blur(95px);pointer-events:none}
        .pio-glow2{position:absolute;right:-90px;bottom:60px;width:280px;height:280px;border-radius:9999px;background:rgba(255,94,138,0.12);filter:blur(95px);pointer-events:none}
      `}</style>

      <div className="pio-glow1" />
      <div className="pio-glow2" />

      <div className="pio-hud">
        <div className="pio-hud-left">
          <ScorePill tone="you" label="You" pct={p1pct} active />
          {kills > 0 && <span className="pio-kills">⚔ {kills}</span>}
        </div>

        <TimerPill ms={timeLeft} />

        <ScorePill tone="bot" label="Bot" pct={p2pct} />
      </div>

      <div
        ref={wrapRef}
        className="pio-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="pio-canvas" />
      </div>

      <div ref={joyRef} className="pio-joy">
        <div ref={thumbRef} className="pio-joy-thumb" />
      </div>

      {phase !== "playing" && (
        <div className="pio-modal-backdrop">
          <div className="pio-modal-card">
            <div className="pio-modal-icon">
              {phase === "over" ? (didWin ? "🏆" : p1pct === p2pct ? "🤝" : "😵") : "🟩"}
            </div>

            <p className="pio-modal-kicker">Territory Duel</p>
            <h1 className="pio-modal-title">
              {phase === "over" ? (didWin ? "Победа!" : p1pct === p2pct ? "Ничья" : "Поражение") : "Paper IO"}
            </h1>
            <p className="pio-modal-copy">
              {phase === "over"
                ? `Время вышло. Ты: ${p1pct}%  ·  Бот: ${p2pct}%`
                : "Захватывай территорию, замыкая петли. 90 секунд — кто захватит больше, тот и победил. Наступи на след бота, чтобы скинуть его в ноль."}
            </p>

            <button onClick={start} className="pio-modal-btn" type="button">
              {phase === "over" ? "Играть снова" : "Начать игру"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ----------------------------- helpers ----------------------------- */
function TimerPill({ ms }: { ms: number }) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const low = total <= 10;

  return (
    <div className={`pio-timer ${low ? "pio-timer-low" : ""}`}>
      <span className={`pio-timer-value ${low ? "pio-timer-value-low" : ""}`}>
        {m}:{s.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function ScorePill({
  tone,
  label,
  pct,
  active,
}: {
  tone: "you" | "bot";
  label: string;
  pct: number;
  active?: boolean;
}) {
  return (
    <div
      className={`pio-score ${active ? (tone === "you" ? "pio-score-active-you" : "pio-score-active-bot") : ""}`}
    >
      <span className={tone === "you" ? "pio-score-dot-you" : "pio-score-dot-bot"} />
      <span className="pio-score-label">{label}</span>
      <span className={tone === "you" ? "pio-score-value-you" : "pio-score-value-bot"}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export default PaperIoGame;