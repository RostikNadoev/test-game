import { useEffect, useRef, useState, useCallback } from "react";

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

  // блокируем скролл/свайпы (в т.ч. закрытие TG mini app вертикальным свайпом)
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {}

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
    (body.style as any).touchAction = "none";

    const stop = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });

    return () => {
      document.removeEventListener("touchmove", stop);
      html.style.overflow = prev.htmlOver;
      body.style.overflow = prev.bodyOver;
      body.style.overscrollBehavior = prev.over;
      (body.style as any).touchAction = prev.touch;
      try {
        tg?.enableVerticalSwipes?.();
      } catch {}
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
  const render = useCallback((progress: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const g = gameRef.current;
    const { dpr, cell } = sizeRef.current;
    const W = cv.width;
    const H = cv.height;
    const cs = cell * dpr; // размер клетки в device px
    const time = performance.now();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // камера следует за игроком (интерполировано)
    const me = g.players[0];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const t = g.running ? progress : 1;
    const ix = lerp(me.px, me.x, t);
    const iy = lerp(me.py, me.y, t);
    const camX = ix - W / dpr / 2 / cell;
    const camY = iy - H / dpr / 2 / cell;

    const sx = (cx: number) => (cx - camX) * cs;
    const sy = (cy: number) => (cy - camY) * cs;

    // видимый диапазон клеток
    const x0 = Math.max(0, Math.floor(camX) - 1);
    const y0 = Math.max(0, Math.floor(camY) - 1);
    const x1 = Math.min(GRID - 1, Math.ceil(camX + W / cs) + 1);
    const y1 = Math.min(GRID - 1, Math.ceil(camY + H / cs) + 1);

    // фон вне поля
    ctx.fillStyle = "rgba(255,255,255,0.015)";
    // сетка
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      const X = Math.round(sx(x)) + 0.5;
      ctx.moveTo(X, sy(y0));
      ctx.lineTo(X, sy(y1 + 1));
    }
    for (let y = y0; y <= y1 + 1; y++) {
      const Y = Math.round(sy(y)) + 0.5;
      ctx.moveTo(sx(x0), Y);
      ctx.lineTo(sx(x1 + 1), Y);
    }
    ctx.stroke();

    // территории (заливка)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = g.terr[idx(x, y)];
        if (!o) continue;
        const p = g.players[o - 1];
        ctx.fillStyle = p.fill;
        ctx.fillRect(sx(x), sy(y), cs + 1, cs + 1);
      }
    }
    // обводка границ территории
    ctx.lineWidth = Math.max(2, cs * 0.09);
    for (const p of g.players) {
      ctx.strokeStyle = p.edge;
      ctx.beginPath();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (g.terr[idx(x, y)] !== p.id) continue;
          const X = sx(x);
          const Y = sy(y);
          if (y === 0 || g.terr[idx(x, y - 1)] !== p.id) {
            ctx.moveTo(X, Y);
            ctx.lineTo(X + cs, Y);
          }
          if (y === GRID - 1 || g.terr[idx(x, y + 1)] !== p.id) {
            ctx.moveTo(X, Y + cs);
            ctx.lineTo(X + cs, Y + cs);
          }
          if (x === 0 || g.terr[idx(x - 1, y)] !== p.id) {
            ctx.moveTo(X, Y);
            ctx.lineTo(X, Y + cs);
          }
          if (x === GRID - 1 || g.terr[idx(x + 1, y)] !== p.id) {
            ctx.moveTo(X + cs, Y);
            ctx.lineTo(X + cs, Y + cs);
          }
        }
      }
      ctx.stroke();
    }

    // следы (с лёгким свечением)
    for (const p of g.players) {
      if (p.trailCells.length === 0) continue;
      ctx.fillStyle = p.trail;
      ctx.shadowColor = p.edge;
      ctx.shadowBlur = cs * 0.5;
      const pad = cs * 0.16;
      for (const ci of p.trailCells) {
        const x = ci % GRID;
        const y = (ci / GRID) | 0;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        ctx.fillRect(sx(x) + pad, sy(y) + pad, cs - pad * 2, cs - pad * 2);
      }
      ctx.shadowBlur = 0;
    }

    // границы мира (стены)
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(3, cs * 0.14);
    ctx.strokeRect(sx(0), sy(0), GRID * cs, GRID * cs);

    // головы
    for (const p of g.players) {
      if (!p.alive) continue;
      const hx = lerp(p.px, p.x, t);
      const hy = lerp(p.py, p.y, t);
      const X = sx(hx);
      const Y = sy(hy);
      const pulse = 1 + Math.sin(time / 220) * 0.06;
      const size = cs * 0.92 * pulse;
      const off = (cs - size) / 2;
      ctx.shadowColor = p.head;
      ctx.shadowBlur = cs * 0.8;
      ctx.fillStyle = p.head;
      const rr = size * 0.32;
      roundRect(ctx, X + off, Y + off, size, size, rr);
      ctx.fill();
      ctx.shadowBlur = 0;
      // глазки в сторону движения
      ctx.fillStyle = "rgba(5,6,16,0.9)";
      const ex = DX[p.dir] * size * 0.16;
      const ey = DY[p.dir] * size * 0.16;
      const eo = size * 0.2;
      const er = size * 0.1;
      const perpX = DY[p.dir];
      const perpY = -DX[p.dir];
      const cxp = X + cs / 2 + ex;
      const cyp = Y + cs / 2 + ey;
      dot(ctx, cxp + perpX * eo, cyp + perpY * eo, er);
      dot(ctx, cxp - perpX * eo, cyp - perpY * eo, er);
    }

    // лёгкая виньетка
    if (g.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
      g.flash *= 0.86;
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
    <div
      className="paperio-root"
      style={{
        position: "relative",
        height: "100%",
        minHeight: "100%",
        width: "100%",
        overflow: "hidden",
        background: COLORS.bg,
        color: "#fff",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        overscrollBehavior: "none",
        fontFamily:
          "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}
    >
      <style>{`
        @keyframes pio-pop { 0%{transform:scale(.92);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes pio-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .pio-glow1{position:absolute;left:-90px;top:60px;width:280px;height:280px;border-radius:9999px;background:rgba(84,242,168,0.14);filter:blur(95px);pointer-events:none}
        .pio-glow2{position:absolute;right:-90px;bottom:60px;width:280px;height:280px;border-radius:9999px;background:rgba(255,94,138,0.12);filter:blur(95px);pointer-events:none}
      `}</style>

      <div className="pio-glow1" />
      <div className="pio-glow2" />

      {/* верхний бар — минимальный */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "8px 10px",
          paddingTop: "max(8px, env(safe-area-inset-top))",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ScorePill color="#54F2A8" label="You" pct={p1pct} active />
          {kills > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.04em",
              }}
            >
              ⚔ {kills}
            </span>
          )}
        </div>

        <TimerPill ms={timeLeft} />

        <ScorePill color="#FF5E8A" label="Bot" pct={p2pct} />
      </div>

      {/* игровое поле + ввод */}
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      {/* джойстик (появляется под пальцем) */}
      <div
        ref={joyRef}
        style={{
          position: "absolute",
          width: 112,
          height: 112,
          marginLeft: -56,
          marginTop: -56,
          borderRadius: "9999px",
          border: "1.5px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(8px)",
          opacity: 0,
          transition: "opacity .12s",
          pointerEvents: "none",
          zIndex: 15,
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 52,
            height: 52,
            transform: "translate(-50%,-50%)",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at 35% 30%, #7CFFC6, #54F2A8)",
            boxShadow: "0 6px 20px rgba(84,242,168,0.45)",
          }}
        />
      </div>

      {/* стартовый / финальный экран */}
      {phase !== "playing" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(5,6,16,0.55)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              textAlign: "center",
              borderRadius: 32,
              border: "1px solid rgba(255,255,255,0.09)",
              background: "rgba(255,255,255,0.045)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
              backdropFilter: "blur(16px)",
              padding: 26,
              animation: "pio-pop .25s ease both",
            }}
          >
            <div
              style={{
                margin: "0 auto",
                width: 72,
                height: 72,
                display: "grid",
                placeItems: "center",
                borderRadius: 24,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.25)",
                fontSize: 40,
                animation: "pio-float 3s ease-in-out infinite",
              }}
            >
              {phase === "over" ? (didWin ? "🏆" : p1pct === p2pct ? "🤝" : "😵") : "🟩"}
            </div>

            <p
              style={{
                marginTop: 18,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "rgba(84,242,168,0.7)",
              }}
            >
              Territory Duel
            </p>
            <h1
              style={{
                marginTop: 6,
                fontSize: 34,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {phase === "over" ? (didWin ? "Победа!" : p1pct === p2pct ? "Ничья" : "Поражение") : "Paper IO"}
            </h1>
            <p
              style={{
                margin: "12px auto 0",
                maxWidth: 280,
                fontSize: 14,
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {phase === "over"
                ? `Время вышло. Ты: ${p1pct}%  ·  Бот: ${p2pct}%`
                : "Захватывай территорию, замыкая петли. 90 секунд — кто захватит больше, тот и победил. Наступи на след бота, чтобы скинуть его в ноль."}
            </p>

            <button
              onClick={start}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "15px 20px",
                borderRadius: 18,
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "0.02em",
                color: "#04130C",
                background: "linear-gradient(180deg,#7CFFC6,#54F2A8)",
                boxShadow: "0 12px 30px rgba(84,242,168,0.4)",
              }}
            >
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
  const color = low ? "#FF5E8A" : "#fff";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 12px",
        borderRadius: 9999,
        border: `1px solid ${low ? "rgba(255,94,138,0.5)" : "rgba(255,255,255,0.1)"}`,
        background: low ? "rgba(255,94,138,0.12)" : "rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
        transition: "all .2s",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 900,
          color,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.02em",
        }}
      >
        {m}:{s.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function ScorePill({
  color,
  label,
  pct,
  active,
}: {
  color: string;
  label: string;
  pct: number;
  active?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 9999,
        border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.08)"}`,
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "rgba(255,255,255,0.7)",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 11, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
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
