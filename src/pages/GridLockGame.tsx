import React, { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   GRIDLOCK (Quoridor) — переписано под мобилку / TG mini app
   Цели: красиво, просто, без лагов.
   - лёгкий SVG: одна клетка = один прямоугольник, без SVG-фильтров
   - ноль backdrop-blur (главный источник тормозов на телефоне)
   - анимации только на transform/opacity
   - управление: режим «Ход» / «Стена», стену тащишь пальцем по полю
   ========================================================================= */

type PlayerId = "p1" | "p2";
type Orientation = "h" | "v";
type Pos = { r: number; c: number };
type Wall = { id: string; r: number; c: number; o: Orientation; by: PlayerId };
type Preview = { r: number; c: number; o: Orientation; valid: boolean };
type Mode = "move" | "wall";

const N = 9; // размер доски
const WALLS = 10; // стен на игрока
const P = 5; // отступ внутри viewBox
const S = 10; // сторона клетки (viewBox 0..100)
const WT = 1.8; // толщина стены
const WPAD = 0.7; // отступ стены от краёв

const START: Record<PlayerId, Pos> = {
  p1: { r: N - 1, c: 4 }, // снизу, цель — верх (r=0)
  p2: { r: 0, c: 4 }, // сверху, цель — низ (r=8)
};

const CFG = {
  p1: {
    name: "Игрок 1",
    goal: "ВВЕРХ",
    light: "#6ee7b7",
    main: "#34d399",
    dark: "#059669",
    text: "#a7f3d0",
  },
  p2: {
    name: "Игрок 2",
    goal: "ВНИЗ",
    light: "#93c5fd",
    main: "#60a5fa",
    dark: "#2563eb",
    text: "#bfdbfe",
  },
} as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const same = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const inBoard = (p: Pos) => p.r >= 0 && p.r < N && p.c >= 0 && p.c < N;
const key = (p: Pos) => `${p.r},${p.c}`;
const edgeKey = (a: Pos, b: Pos) => {
  const x = key(a);
  const y = key(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

const center = (r: number, c: number) => ({ x: P + c * S + S / 2, y: P + r * S + S / 2 });

const wallRect = (w: { r: number; c: number; o: Orientation }) => {
  if (w.o === "h")
    return {
      x: P + w.c * S + WPAD,
      y: P + (w.r + 1) * S - WT / 2,
      w: S * 2 - WPAD * 2,
      h: WT,
    };
  return {
    x: P + (w.c + 1) * S - WT / 2,
    y: P + w.r * S + WPAD,
    w: WT,
    h: S * 2 - WPAD * 2,
  };
};

const buildBlocked = (walls: Wall[]) => {
  const b = new Set<string>();
  for (const w of walls) {
    if (w.o === "h") {
      b.add(edgeKey({ r: w.r, c: w.c }, { r: w.r + 1, c: w.c }));
      b.add(edgeKey({ r: w.r, c: w.c + 1 }, { r: w.r + 1, c: w.c + 1 }));
    } else {
      b.add(edgeKey({ r: w.r, c: w.c }, { r: w.r, c: w.c + 1 }));
      b.add(edgeKey({ r: w.r + 1, c: w.c }, { r: w.r + 1, c: w.c + 1 }));
    }
  }
  return b;
};

const blockedEdge = (a: Pos, b: Pos, set: Set<string>) => set.has(edgeKey(a, b));

const hasPath = (start: Pos, goalRow: number, blocked: Set<string>) => {
  const q: Pos[] = [start];
  const seen = new Set<string>([key(start)]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur.r === goalRow) return true;
    const nb = [
      { r: cur.r - 1, c: cur.c },
      { r: cur.r + 1, c: cur.c },
      { r: cur.r, c: cur.c - 1 },
      { r: cur.r, c: cur.c + 1 },
    ];
    for (const n of nb) {
      if (!inBoard(n) || blockedEdge(cur, n, blocked) || seen.has(key(n))) continue;
      seen.add(key(n));
      q.push(n);
    }
  }
  return false;
};

// Корректные правила конфликтов стен в Quoridor:
// — нельзя в один и тот же «столб» (пересечение) — это же блокирует крест;
// — нельзя наложить две одинаковые стены внахлёст (соседний слот по длине).
const wallConflict = (n: { r: number; c: number; o: Orientation }, walls: Wall[]) => {
  for (const w of walls) {
    if (w.r === n.r && w.c === n.c) return true; // тот же столб / крест
    if (n.o === "h" && w.o === "h" && w.r === n.r && Math.abs(w.c - n.c) === 1) return true;
    if (n.o === "v" && w.o === "v" && w.c === n.c && Math.abs(w.r - n.r) === 1) return true;
  }
  return false;
};

const wallValid = (
  n: { r: number; c: number; o: Orientation },
  walls: Wall[],
  p1: Pos,
  p2: Pos
) => {
  if (n.r < 0 || n.r > N - 2 || n.c < 0 || n.c > N - 2) return false;
  if (wallConflict(n, walls)) return false;
  const blocked = buildBlocked([...walls, { ...n, id: "tmp", by: "p1" }]);
  return hasPath(p1, 0, blocked) && hasPath(p2, N - 1, blocked);
};

const uniq = (m: Pos[]) => {
  const s = new Set<string>();
  return m.filter((p) => (s.has(key(p)) ? false : (s.add(key(p)), true)));
};

// Ходы с прыжком через соперника и диагональными обходами (правила Quoridor).
const legalMovesOf = (from: Pos, other: Pos, blocked: Set<string>) => {
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  const moves: Pos[] = [];
  for (const d of dirs) {
    const adj = { r: from.r + d.dr, c: from.c + d.dc };
    if (!inBoard(adj) || blockedEdge(from, adj, blocked)) continue;
    if (!same(adj, other)) {
      moves.push(adj);
      continue;
    }
    const beyond = { r: other.r + d.dr, c: other.c + d.dc };
    if (inBoard(beyond) && !blockedEdge(other, beyond, blocked)) {
      moves.push(beyond);
      continue;
    }
    const sides =
      d.dr !== 0
        ? [
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
          ]
        : [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
          ];
    for (const s of sides) {
      const diag = { r: other.r + s.dr, c: other.c + s.dc };
      if (inBoard(diag) && !blockedEdge(other, diag, blocked)) moves.push(diag);
    }
  }
  return uniq(moves);
};

/* ----------------------------- pawn ----------------------------- */
const Pawn = ({ player, pos, active }: { player: PlayerId; pos: Pos; active: boolean }) => {
  const c = CFG[player];
  const { x, y } = center(pos.r, pos.c);
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 240ms cubic-bezier(.22,.85,.25,1)",
      }}
    >
      {active && <circle r={4.4} fill={c.main} opacity={0.18} className="gl-pulse" />}
      <ellipse cx={0} cy={2.5} rx={2.9} ry={1.0} fill="rgba(0,0,0,0.35)" />
      <circle r={3.0} fill={`url(#pawn-${player})`} stroke="rgba(255,255,255,0.5)" strokeWidth={0.3} />
      <ellipse cx={-0.8} cy={-0.9} rx={1.1} ry={0.7} fill="rgba(255,255,255,0.45)" />
    </g>
  );
};

/* ----------------------------- game ----------------------------- */
export const GridLockGame: React.FC = () => {
  const boardRef = useRef<HTMLDivElement | null>(null);

  const [p1, setP1] = useState<Pos>(START.p1);
  const [p2, setP2] = useState<Pos>(START.p2);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [turn, setTurn] = useState<PlayerId>("p1");
  const [left, setLeft] = useState<Record<PlayerId, number>>({ p1: WALLS, p2: WALLS });
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [mode, setMode] = useState<Mode>("move");
  const [orient, setOrient] = useState<Orientation>("h");
  const [preview, setPreview] = useState<Preview | null>(null);

  const cur = turn === "p1" ? p1 : p2;
  const other = turn === "p1" ? p2 : p1;
  const cfg = CFG[turn];

  // блокируем скролл страницы и вертикальные свайпы TG mini app
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {}
    const de = document.documentElement;
    const b = document.body;
    const prev = [de.style.overflow, b.style.overflow, b.style.overscrollBehavior, b.style.touchAction];
    de.style.overflow = "hidden";
    b.style.overflow = "hidden";
    b.style.overscrollBehavior = "none";
    b.style.touchAction = "none";
    return () => {
      de.style.overflow = prev[0];
      b.style.overflow = prev[1];
      b.style.overscrollBehavior = prev[2];
      b.style.touchAction = prev[3];
      try {
        tg?.enableVerticalSwipes?.();
      } catch {}
    };
  }, []);

  const blocked = useMemo(() => buildBlocked(walls), [walls]);
  const moves = useMemo(
    () => (winner || mode !== "move" ? [] : legalMovesOf(cur, other, blocked)),
    [cur, other, blocked, winner, mode]
  );
  const moveKeys = useMemo(() => new Set(moves.map(key)), [moves]);

  const cells = useMemo(() => {
    const arr: { r: number; c: number; x: number; y: number }[] = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) arr.push({ r, c, x: P + c * S, y: P + r * S });
    return arr;
  }, []);

  /* --- ходы --- */
  const tryMove = (r: number, c: number) => {
    if (winner || mode !== "move") return;
    const next = { r, c };
    if (!moveKeys.has(key(next))) return;
    if (turn === "p1") {
      setP1(next);
      if (next.r === 0) return setWinner("p1");
    } else {
      setP2(next);
      if (next.r === N - 1) return setWinner("p2");
    }
    setTurn((t) => (t === "p1" ? "p2" : "p1"));
  };

  /* --- стены: тащим пальцем по полю --- */
  const pointToSlot = (clientX: number, clientY: number): Preview | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    if (x < P || x > P + N * S || y < P || y > P + N * S) return null;
    const r = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
    const c = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
    return { r, c, o: orient, valid: wallValid({ r, c, o: orient }, walls, p1, p2) };
  };

  const onBoardDown = (e: React.PointerEvent) => {
    if (mode !== "wall" || winner || left[turn] <= 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setPreview(pointToSlot(e.clientX, e.clientY));
  };
  const onBoardMove = (e: React.PointerEvent) => {
    if (mode !== "wall" || !preview) return;
    const ns = pointToSlot(e.clientX, e.clientY);
    // обновляем только при смене слота — меньше ререндеров
    if (ns && (ns.r !== preview.r || ns.c !== preview.c || ns.o !== preview.o || ns.valid !== preview.valid))
      setPreview(ns);
  };
  const onBoardUp = (e: React.PointerEvent) => {
    if (mode !== "wall") return;
    const ns = pointToSlot(e.clientX, e.clientY) ?? preview;
    setPreview(null);
    if (!ns || !ns.valid || winner || left[turn] <= 0) return;
    setWalls((w) => [...w, { id: `${turn}-${ns.r}-${ns.c}-${ns.o}-${Date.now()}`, r: ns.r, c: ns.c, o: ns.o, by: turn }]);
    setLeft((l) => ({ ...l, [turn]: l[turn] - 1 }));
    setMode("move");
    setTurn((t) => (t === "p1" ? "p2" : "p1"));
  };

  const rotate = () => setOrient((o) => (o === "h" ? "v" : "h"));

  const restart = () => {
    setP1(START.p1);
    setP2(START.p2);
    setWalls([]);
    setLeft({ p1: WALLS, p2: WALLS });
    setTurn("p1");
    setWinner(null);
    setMode("move");
    setOrient("h");
    setPreview(null);
  };

  const accent = cfg.main;

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      style={{ background: "#0a0e17", touchAction: "none", overscrollBehavior: "none" }}
    >
      <style>{`
        @keyframes glPulse { 0%,100%{ opacity:.10; transform:scale(1);} 50%{ opacity:.26; transform:scale(1.25);} }
        @keyframes glPop { 0%{ transform:scale(.7); opacity:0;} 100%{ transform:scale(1); opacity:1;} }
        @keyframes glCard { 0%{ opacity:0; transform:translateY(10px) scale(.96);} 100%{ opacity:1; transform:none;} }
        .gl-pulse { animation: glPulse 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .gl-pop { animation: glPop 200ms cubic-bezier(.2,.9,.2,1.3) both; transform-box: fill-box; transform-origin: center; }
        .gl-tap { transition: transform .12s ease; }
        .gl-tap:active { transform: scale(.97); }
      `}</style>

      {/* ВЕРХНИЙ БАР — минимальный */}
      <div
        className="z-10 mx-2 mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
      >
        <StatPill cfg={CFG.p1} count={left.p1} dim={turn !== "p1" || !!winner} side="left" />
        <div className="text-center leading-tight">
          <div
            className="text-[13px] font-extrabold transition-colors"
            style={{ color: winner ? "#fde68a" : cfg.text }}
          >
            {winner ? `${CFG[winner].name} победил` : `${cfg.name} ходит`}
          </div>
          {!winner && (
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
              цель: {cfg.goal}
            </div>
          )}
        </div>
        <StatPill cfg={CFG.p2} count={left.p2} dim={turn !== "p2" || !!winner} side="right" />
      </div>

      {/* ДОСКА */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <div
          ref={boardRef}
          onPointerDown={onBoardDown}
          onPointerMove={onBoardMove}
          onPointerUp={onBoardUp}
          onPointerCancel={onBoardUp}
          className="relative aspect-square w-full max-w-[min(100%,calc(100vh-190px))] overflow-hidden rounded-[24px] border border-white/10"
          style={{
            background: "linear-gradient(160deg,#121a2b,#0b1120 60%,#080c16)",
            boxShadow: "0 18px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)",
            touchAction: "none",
          }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="pawn-p1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={CFG.p1.light} />
                <stop offset="100%" stopColor={CFG.p1.dark} />
              </linearGradient>
              <linearGradient id="pawn-p2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={CFG.p2.light} />
                <stop offset="100%" stopColor={CFG.p2.dark} />
              </linearGradient>
              <linearGradient id="wall-p1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CFG.p1.light} />
                <stop offset="100%" stopColor={CFG.p1.dark} />
              </linearGradient>
              <linearGradient id="wall-p2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CFG.p2.light} />
                <stop offset="100%" stopColor={CFG.p2.dark} />
              </linearGradient>
            </defs>

            {/* подсветка домашних рядов */}
            <rect x={P} y={P} width={N * S} height={S} fill={CFG.p2.main} opacity={0.07} />
            <rect x={P} y={P + S * (N - 1)} width={N * S} height={S} fill={CFG.p1.main} opacity={0.07} />

            {/* клетки — по одному прямоугольнику */}
            {cells.map((cell) => {
              const legal = mode === "move" && moveKeys.has(`${cell.r},${cell.c}`);
              return (
                <g key={`${cell.r}-${cell.c}`} onClick={() => tryMove(cell.r, cell.c)}>
                  <rect
                    x={cell.x + 0.5}
                    y={cell.y + 0.5}
                    width={S - 1}
                    height={S - 1}
                    rx={1.6}
                    fill="rgba(255,255,255,0.045)"
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth={0.25}
                    style={{ cursor: winner || mode !== "move" ? "default" : "pointer" }}
                  />
                  {legal && (
                    <circle
                      cx={cell.x + S / 2}
                      cy={cell.y + S / 2}
                      r={1.7}
                      fill={accent}
                      opacity={0.85}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            {/* поставленные стены */}
            {walls.map((w) => {
              const r = wallRect(w);
              return (
                <g key={w.id} className="gl-pop" pointerEvents="none">
                  <rect x={r.x} y={r.y + 0.5} width={r.w} height={r.h} rx={0.9} fill="rgba(0,0,0,0.35)" />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.9}
                    fill={`url(#wall-${w.by})`}
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={0.18}
                  />
                </g>
              );
            })}

            {/* превью стены */}
            {preview && (() => {
              const r = wallRect(preview);
              return (
                <rect
                  pointerEvents="none"
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx={0.9}
                  fill={preview.valid ? `url(#wall-${turn})` : "#ef4444"}
                  opacity={preview.valid ? 0.85 : 0.6}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={0.22}
                />
              );
            })()}

            <Pawn player="p1" pos={p1} active={turn === "p1" && !winner} />
            <Pawn player="p2" pos={p2} active={turn === "p2" && !winner} />
          </svg>

          {/* подсказка в режиме стены */}
          {mode === "wall" && !winner && (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
              <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-bold text-white/70">
                Проведи пальцем по полю и отпусти, чтобы поставить стену
              </div>
            </div>
          )}

          {/* экран победы */}
          {winner && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-6">
              <div
                className="w-full max-w-[320px] rounded-3xl border border-white/12 bg-[#0e1422] px-6 py-7 text-center"
                style={{ animation: "glCard 260ms ease-out both", boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}
              >
                <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-white/40">
                  Игра окончена
                </div>
                <div className="mt-3 text-3xl font-black" style={{ color: CFG[winner].text }}>
                  {CFG[winner].name}
                </div>
                <div className="mt-1.5 text-sm text-white/50">добрался до края</div>
                <button
                  onClick={restart}
                  className="gl-tap mt-6 w-full rounded-2xl py-3.5 text-sm font-black uppercase tracking-[0.12em] text-[#06140d]"
                  style={{ background: `linear-gradient(180deg, ${CFG[winner].light}, ${CFG[winner].main})` }}
                >
                  Играть снова
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ — управление */}
      <div
        className="z-10 mx-2 mb-2 grid grid-cols-[1fr_1fr_auto] gap-2"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <ModeBtn
          label="Ход"
          icon="✛"
          activeMode={mode === "move"}
          accent={accent}
          disabled={!!winner}
          onClick={() => {
            setMode("move");
            setPreview(null);
          }}
        />
        <ModeBtn
          label={`Стена · ${left[turn]}`}
          icon={orient === "h" ? "▬" : "▮"}
          activeMode={mode === "wall"}
          accent={accent}
          disabled={!!winner || left[turn] <= 0}
          onClick={() => {
            if (left[turn] <= 0) return;
            setMode("wall");
          }}
        />
        <button
          onClick={rotate}
          disabled={!!winner || mode !== "wall"}
          className="gl-tap grid h-full w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-2xl text-white/75 disabled:opacity-35"
          title="Повернуть стену"
        >
          ↻
        </button>
      </div>
    </div>
  );
};

/* ----------------------------- ui bits ----------------------------- */
const StatPill = ({
  cfg,
  count,
  dim,
  side,
}: {
  cfg: (typeof CFG)[PlayerId];
  count: number;
  dim: boolean;
  side: "left" | "right";
}) => (
  <div
    className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-opacity"
    style={{
      flexDirection: side === "right" ? "row-reverse" : "row",
      background: dim ? "rgba(255,255,255,0.04)" : `${cfg.main}1f`,
      border: `1px solid ${dim ? "rgba(255,255,255,0.08)" : cfg.main + "55"}`,
      opacity: dim ? 0.6 : 1,
    }}
  >
    <span
      className="h-2.5 w-2.5 rounded-full"
      style={{ background: cfg.main, boxShadow: `0 0 8px ${cfg.main}` }}
    />
    <span className="text-[15px] font-black leading-none" style={{ color: cfg.text }}>
      {count}
    </span>
  </div>
);

const ModeBtn = ({
  label,
  icon,
  activeMode,
  accent,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  activeMode: boolean;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="gl-tap flex h-[52px] items-center justify-center gap-2 rounded-2xl border text-sm font-black transition-colors disabled:opacity-35"
    style={{
      borderColor: activeMode ? accent : "rgba(255,255,255,0.1)",
      background: activeMode ? `${accent}22` : "rgba(255,255,255,0.05)",
      color: activeMode ? "#fff" : "rgba(255,255,255,0.6)",
    }}
  >
    <span className="text-lg leading-none" style={{ color: activeMode ? accent : "inherit" }}>
      {icon}
    </span>
    {label}
  </button>
);

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;