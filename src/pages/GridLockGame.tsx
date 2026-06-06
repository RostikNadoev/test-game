import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   GRIDLOCK (Quoridor) — mobile/TG mini app optimized
   - жёсткий anti-scroll / anti-bounce на время игры
   - стены ставятся тапом, без перетаскивания
   - лёгкий SVG без фильтров и backdrop-blur
   - превью всех доступных мест под стену
   - анимации только transform/opacity
   ========================================================================= */

type PlayerId = "p1" | "p2";
type Orientation = "h" | "v"; 
type Pos = { r: number; c: number };
type Wall = { id: string; r: number; c: number; o: Orientation; by: PlayerId };
type Preview = { r: number; c: number; o: Orientation; valid: boolean };
type Mode = "move" | "wall";

const N = 9;
const WALLS = 10;
const P = 5;
const S = 10;
const WT = 1.35;
const WPAD = 1.05;
const TAP_CANCEL_PX = 18;

const START: Record<PlayerId, Pos> = {
  p1: { r: N - 1, c: 4 },
  p2: { r: 0, c: 4 },
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
const posKey = (p: Pos) => `${p.r},${p.c}`;
const wallKey = (w: { r: number; c: number; o: Orientation }) => `${w.r}:${w.c}:${w.o}`;

const edgeKey = (a: Pos, b: Pos) => {
  const x = posKey(a);
  const y = posKey(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

const center = (r: number, c: number) => ({ x: P + c * S + S / 2, y: P + r * S + S / 2 });

const wallRect = (w: { r: number; c: number; o: Orientation }) => {
  if (w.o === "h") {
    return {
      x: P + w.c * S + WPAD,
      y: P + (w.r + 1) * S - WT / 2,
      w: S * 2 - WPAD * 2,
      h: WT,
    };
  }

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
  const seen = new Set<string>([posKey(start)]);
  let qi = 0;

  while (qi < q.length) {
    const cur = q[qi++]!;
    if (cur.r === goalRow) return true;

    const nb = [
      { r: cur.r - 1, c: cur.c },
      { r: cur.r + 1, c: cur.c },
      { r: cur.r, c: cur.c - 1 },
      { r: cur.r, c: cur.c + 1 },
    ];

    for (const n of nb) {
      if (!inBoard(n) || blockedEdge(cur, n, blocked) || seen.has(posKey(n))) continue;
      seen.add(posKey(n));
      q.push(n);
    }
  }

  return false;
};

const wallConflict = (n: { r: number; c: number; o: Orientation }, walls: Wall[]) => {
  for (const w of walls) {
    if (w.r === n.r && w.c === n.c) return true;
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
  return m.filter((p) => (s.has(posKey(p)) ? false : (s.add(posKey(p)), true)));
};

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

const haptic = (kind: "light" | "medium" | "error" = "light") => {
  try {
    const tg = (window as Window & { Telegram?: { WebApp?: any } }).Telegram?.WebApp;
    if (kind === "error") {
      tg?.HapticFeedback?.notificationOccurred?.("error");
      if (!tg?.HapticFeedback?.notificationOccurred && navigator.vibrate) navigator.vibrate(30);
      return;
    }

    tg?.HapticFeedback?.impactOccurred?.(kind);
    if (!tg?.HapticFeedback?.impactOccurred && navigator.vibrate) navigator.vibrate(kind === "medium" ? 18 : 10);
  } catch {
    // no-op
  }
};

const Pawn = ({ player, pos, active }: { player: PlayerId; pos: Pos; active: boolean }) => {
  const c = CFG[player];
  const { x, y } = center(pos.r, pos.c);

  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 220ms cubic-bezier(.22,.85,.25,1)",
      }}
    >
      {active && <circle r={4.15} fill={c.main} opacity={0.16} className="gl-pulse" />}
      <ellipse cx={0} cy={2.5} rx={2.8} ry={0.9} fill="rgba(0,0,0,0.35)" />
      <circle r={3.0} fill={`url(#pawn-${player})`} stroke="rgba(255,255,255,0.5)" strokeWidth={0.3} />
      <ellipse cx={-0.8} cy={-0.9} rx={1.1} ry={0.7} fill="rgba(255,255,255,0.45)" />
    </g>
  );
};

export const GridLockGame: React.FC = () => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);

  const [p1, setP1] = useState<Pos>(START.p1);
  const [p2, setP2] = useState<Pos>(START.p2);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [turn, setTurn] = useState<PlayerId>("p1");
  const [left, setLeft] = useState<Record<PlayerId, number>>({ p1: WALLS, p2: WALLS });
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [mode, setMode] = useState<Mode>("move");
  const [orient, setOrient] = useState<Orientation>("h");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");

  const cur = turn === "p1" ? p1 : p2;
  const other = turn === "p1" ? p2 : p1;
  const cfg = CFG[turn];
  const accent = cfg.main;

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: any } }).Telegram?.WebApp;

    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      // no-op
    }

    const de = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    const prev = {
      deOverflow: de.style.overflow,
      deHeight: de.style.height,
      deOverscroll: de.style.overscrollBehavior,
      deTouchAction: de.style.touchAction,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouchAction: body.style.touchAction,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };

    de.style.overflow = "hidden";
    de.style.height = "100%";
    de.style.overscrollBehavior = "none";
    de.style.touchAction = "none";

    body.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    const prevent = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("touchmove", prevent, { passive: false });
    document.addEventListener("wheel", prevent, { passive: false });
    document.addEventListener("gesturestart", prevent, { passive: false } as AddEventListenerOptions);

    return () => {
      de.style.overflow = prev.deOverflow;
      de.style.height = prev.deHeight;
      de.style.overscrollBehavior = prev.deOverscroll;
      de.style.touchAction = prev.deTouchAction;

      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;

      document.removeEventListener("touchmove", prevent);
      document.removeEventListener("wheel", prevent);
      document.removeEventListener("gesturestart", prevent);
      window.scrollTo(0, scrollY);

      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        // no-op
      }
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 950);
    return () => window.clearTimeout(id);
  }, [notice]);

  const blocked = useMemo(() => buildBlocked(walls), [walls]);

  const moves = useMemo(
    () => (winner || mode !== "move" ? [] : legalMovesOf(cur, other, blocked)),
    [cur, other, blocked, winner, mode]
  );

  const moveKeys = useMemo(() => new Set(moves.map(posKey)), [moves]);

  const cells = useMemo(() => {
    const arr: { r: number; c: number; x: number; y: number }[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) arr.push({ r, c, x: P + c * S, y: P + r * S });
    }
    return arr;
  }, []);

  const wallHints = useMemo(() => {
    if (mode !== "wall" || winner || left[turn] <= 0) return [];

    const arr: Preview[] = [];
    for (let r = 0; r <= N - 2; r++) {
      for (let c = 0; c <= N - 2; c++) {
        const candidate = { r, c, o: orient };
        arr.push({ ...candidate, valid: wallValid(candidate, walls, p1, p2) });
      }
    }
    return arr;
  }, [mode, winner, left, turn, orient, walls, p1, p2]);

  const validHintKeys = useMemo(() => {
    const s = new Set<string>();
    for (const h of wallHints) if (h.valid) s.add(wallKey(h));
    return s;
  }, [wallHints]);

  const pointToSlot = useCallback(
    (clientX: number, clientY: number): Preview | null => {
      const el = boardRef.current;
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      if (x < P || x > P + N * S || y < P || y > P + N * S) return null;

      const r = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
      const c = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
      const candidate = { r, c, o: orient };
      return { ...candidate, valid: validHintKeys.has(wallKey(candidate)) };
    },
    [orient, validHintKeys]
  );

  const endTurn = () => {
    setTurn((t) => (t === "p1" ? "p2" : "p1"));
  };

  const tryMove = (r: number, c: number) => {
    if (winner || mode !== "move") return;

    const next = { r, c };
    if (!moveKeys.has(posKey(next))) return;

    haptic("light");

    if (turn === "p1") {
      setP1(next);
      if (next.r === 0) {
        setWinner("p1");
        return;
      }
    } else {
      setP2(next);
      if (next.r === N - 1) {
        setWinner("p2");
        return;
      }
    }

    setPreview(null);
    endTurn();
  };

  const placeWall = (slot: Preview | null) => {
    if (!slot || winner || left[turn] <= 0 || mode !== "wall") return;

    setPreview(slot);

    if (!slot.valid) {
      haptic("error");
      setNotice("Тут нельзя: стена пересекается или закрывает путь");
      return;
    }

    haptic("medium");

    setWalls((w) => [
      ...w,
      {
        id: `${turn}-${slot.r}-${slot.c}-${slot.o}-${Date.now()}`,
        r: slot.r,
        c: slot.c,
        o: slot.o,
        by: turn,
      },
    ]);
    setLeft((l) => ({ ...l, [turn]: l[turn] - 1 }));
    setPreview(null);
    setNotice("");
    setMode("move");
    endTurn();
  };

  const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || left[turn] <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    tapStart.current = { x: e.clientX, y: e.clientY };
    const slot = pointToSlot(e.clientX, e.clientY);
    if (slot) setPreview(slot);
  };

  const onBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall") return;
    e.preventDefault();
  };

  const onBoardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || left[turn] <= 0) return;
    e.preventDefault();
    e.stopPropagation();

    const start = tapStart.current;
    tapStart.current = null;

    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > TAP_CANCEL_PX) {
        setNotice("Стену ставим тапом, без перетаскивания");
        return;
      }
    }

    placeWall(pointToSlot(e.clientX, e.clientY));
  };

  const rotate = () => {
    if (winner || mode !== "wall") return;
    haptic("light");
    setOrient((o) => (o === "h" ? "v" : "h"));
    setPreview(null);
  };

  const restart = () => {
    haptic("medium");
    setP1(START.p1);
    setP2(START.p2);
    setWalls([]);
    setLeft({ p1: WALLS, p2: WALLS });
    setTurn("p1");
    setWinner(null);
    setMode("move");
    setOrient("h");
    setPreview(null);
    setNotice("");
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        background: "#0a0e17",
        touchAction: "none",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <style>{`
        @keyframes glPulse { 0%,100%{ opacity:.10; transform:scale(1);} 50%{ opacity:.24; transform:scale(1.22);} }
        @keyframes glPop { 0%{ transform:scale(.76); opacity:0;} 100%{ transform:scale(1); opacity:1;} }
        @keyframes glCard { 0%{ opacity:0; transform:translateY(10px) scale(.96);} 100%{ opacity:1; transform:none;} }
        .gl-pulse { animation: glPulse 1.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .gl-pop { animation: glPop 160ms cubic-bezier(.2,.9,.2,1.2) both; transform-box: fill-box; transform-origin: center; }
        .gl-tap { transition: transform .1s ease, opacity .1s ease, background-color .1s ease, border-color .1s ease; }
        .gl-tap:active { transform: scale(.975); }
      `}</style>

      <div
        className="z-10 mx-2 mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
      >
        <StatPill cfg={CFG.p1} count={left.p1} dim={turn !== "p1" || !!winner} side="left" />

        <div className="text-center leading-tight">
          <div className="text-[13px] font-extrabold transition-colors" style={{ color: winner ? "#fde68a" : cfg.text }}>
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <div
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={() => {
            tapStart.current = null;
            setPreview(null);
          }}
          className="relative aspect-square w-full max-w-[min(100%,calc(100vh-190px))] overflow-hidden rounded-[24px] border border-white/10"
          style={{
            background: "linear-gradient(160deg,#121a2b,#0b1120 60%,#080c16)",
            boxShadow: "0 18px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)",
            touchAction: "none",
            contain: "layout paint size",
          }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ touchAction: "none" }}>
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

            <rect x={P} y={P} width={N * S} height={S} fill={CFG.p2.main} opacity={0.07} />
            <rect x={P} y={P + S * (N - 1)} width={N * S} height={S} fill={CFG.p1.main} opacity={0.07} />

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
                  />
                  {legal && (
                    <circle
                      cx={cell.x + S / 2}
                      cy={cell.y + S / 2}
                      r={1.7}
                      fill={accent}
                      opacity={0.88}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            {mode === "wall" && !winner &&
              wallHints.map((h) => {
                const r = wallRect(h);
                return (
                  <rect
                    key={`hint-${h.r}-${h.c}-${h.o}`}
                    pointerEvents="none"
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.7}
                    fill={h.valid ? accent : "#ef4444"}
                    opacity={h.valid ? 0.18 : 0.08}
                  />
                );
              })}

            {walls.map((w) => {
              const r = wallRect(w);
              return (
                <g key={w.id} className="gl-pop" pointerEvents="none">
                  <rect x={r.x} y={r.y + 0.45} width={r.w} height={r.h} rx={0.7} fill="rgba(0,0,0,0.34)" />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.7}
                    fill={`url(#wall-${w.by})`}
                    stroke="rgba(255,255,255,0.32)"
                    strokeWidth={0.15}
                  />
                </g>
              );
            })}

            {preview && (() => {
              const r = wallRect(preview);
              return (
                <g pointerEvents="none">
                  <rect
                    x={r.x - 0.35}
                    y={r.y - 0.35}
                    width={r.w + 0.7}
                    height={r.h + 0.7}
                    rx={0.9}
                    fill="none"
                    stroke={preview.valid ? "rgba(255,255,255,0.78)" : "#fecaca"}
                    strokeWidth={0.38}
                  />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.75}
                    fill={preview.valid ? `url(#wall-${turn})` : "#ef4444"}
                    opacity={preview.valid ? 0.95 : 0.72}
                  />
                </g>
              );
            })()}

            <Pawn player="p1" pos={p1} active={turn === "p1" && !winner} />
            <Pawn player="p2" pos={p2} active={turn === "p2" && !winner} />
          </svg>

          {mode === "wall" && !winner && (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
              <div
                className="rounded-full border px-3 py-1 text-center text-[10px] font-bold"
                style={{
                  borderColor: `${accent}44`,
                  background: "rgba(0,0,0,0.48)",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Тапни по подсвеченному месту · {orient === "h" ? "горизонтальная" : "вертикальная"} стена
              </div>
            </div>
          )}

          {notice && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div className="rounded-2xl border border-red-300/25 bg-red-500/18 px-3 py-2 text-center text-[11px] font-bold text-red-100">
                {notice}
              </div>
            </div>
          )}

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

      <div
        className="z-10 mx-2 mb-2 grid grid-cols-[0.95fr_1.35fr_64px] gap-2"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <ModeBtn
          label="Ход"
          sub="по точкам"
          icon={<span className="text-lg leading-none">✛</span>}
          activeMode={mode === "move"}
          accent={accent}
          disabled={!!winner}
          onClick={() => {
            haptic("light");
            setMode("move");
            setPreview(null);
            setNotice("");
          }}
        />

        <ModeBtn
          label={`Стена · ${left[turn]}`}
          sub={orient === "h" ? "горизонтальная" : "вертикальная"}
          icon={<WallMiniIcon orient={orient} color={mode === "wall" ? accent : "rgba(255,255,255,0.55)"} />}
          activeMode={mode === "wall"}
          accent={accent}
          disabled={!!winner || left[turn] <= 0}
          onClick={() => {
            if (left[turn] <= 0) return;
            haptic("light");
            setMode("wall");
            setPreview(null);
            setNotice("");
          }}
        />

        <button
          onClick={rotate}
          disabled={!!winner || mode !== "wall"}
          className="gl-tap flex h-[54px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/75 disabled:opacity-35"
          title="Повернуть стену"
        >
          <span className="text-xl leading-none">↻</span>
          <span className="mt-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/42">поворот</span>
        </button>
      </div>
    </div>
  );
};

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
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: cfg.main, boxShadow: `0 0 8px ${cfg.main}` }} />
    <span className="text-[15px] font-black leading-none" style={{ color: cfg.text }}>
      {count}
    </span>
  </div>
);

const WallMiniIcon = ({ orient, color }: { orient: Orientation; color: string }) => (
  <span className="relative grid h-6 w-8 place-items-center" aria-hidden="true">
    <span className="absolute left-1 top-1 h-2 w-2 rounded-[3px] bg-white/10" />
    <span className="absolute right-1 top-1 h-2 w-2 rounded-[3px] bg-white/10" />
    <span className="absolute bottom-1 left-1 h-2 w-2 rounded-[3px] bg-white/10" />
    <span className="absolute bottom-1 right-1 h-2 w-2 rounded-[3px] bg-white/10" />
    <span
      className="absolute rounded-full"
      style={
        orient === "h"
          ? { width: 25, height: 3, background: color, boxShadow: `0 0 8px ${color}` }
          : { width: 3, height: 25, background: color, boxShadow: `0 0 8px ${color}` }
      }
    />
  </span>
);

const ModeBtn = ({
  label,
  sub,
  icon,
  activeMode,
  accent,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  activeMode: boolean;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="gl-tap flex h-[54px] items-center justify-center gap-2 rounded-2xl border px-2 text-left transition-colors disabled:opacity-35"
    style={{
      borderColor: activeMode ? accent : "rgba(255,255,255,0.1)",
      background: activeMode ? `${accent}22` : "rgba(255,255,255,0.05)",
      color: activeMode ? "#fff" : "rgba(255,255,255,0.66)",
    }}
  >
    <span className="shrink-0" style={{ color: activeMode ? accent : "inherit" }}>
      {icon}
    </span>
    <span className="min-w-0 leading-none">
      <span className="block truncate text-[13px] font-black">{label}</span>
      <span className="mt-1 block truncate text-[8px] font-black uppercase tracking-[0.12em] text-white/38">{sub}</span>
    </span>
  </button>
);

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
