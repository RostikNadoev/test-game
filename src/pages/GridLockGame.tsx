import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   GRIDLOCK / QUORIDOR — minimal app-style version
   - без отдельного фонового декора: компонент прозрачный и ложится на фон приложения
   - палитра под приложение: blue/orange + тёмные panels
   - крупнее и заметнее стены
   - нижнее меню максимально короткое: Ход / Стена / Поворот
   - стены ставятся тапом, с мягким магнитом по слотам
   ========================================================================= */

type PlayerId = "p1" | "p2";
type Orientation = "h" | "v";
type Mode = "move" | "wall";
type Pos = { r: number; c: number };
type Wall = { id: string; r: number; c: number; o: Orientation; by: PlayerId };
type Preview = { r: number; c: number; o: Orientation; valid: boolean };

const N = 9;
const WALLS = 10;
const TURN_SECONDS = 10;

// SVG board metrics: viewBox 0..100
const P = 5;
const S = 10;
const CELL_GAP = 0.72;
const WT = 2.05; // стены визуально крупнее
const WPAD = 0.72;
const TAP_CANCEL_PX = 20;

const APP = {
  bgCard: "rgba(18, 18, 24, 0.9)",
  bgCardSoft: "rgba(255, 255, 255, 0.035)",
  border: "rgba(255, 255, 255, 0.075)",
  text: "#ffffff",
  muted: "#8f8f9c",
  blue: "#2f8cff",
  blueSoft: "#5bb7ff",
  orange: "#f59e42",
  orangeSoft: "#ffb45c",
  gold: "#ffc96a",
};

const START: Record<PlayerId, Pos> = {
  p1: { r: N - 1, c: 4 },
  p2: { r: 0, c: 4 },
};

const CFG = {
  p1: {
    name: "Игрок 1",
    short: "1",
    goal: "вверх",
    arrow: "↑",
    main: APP.blue,
    light: APP.blueSoft,
    dark: "#145dcc",
    text: "#dbeafe",
  },
  p2: {
    name: "Игрок 2",
    short: "2",
    goal: "вниз",
    arrow: "↓",
    main: APP.orange,
    light: APP.orangeSoft,
    dark: "#b85c12",
    text: "#ffedd5",
  },
} as const;

type PlayerCfg = (typeof CFG)[PlayerId];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const same = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const inBoard = (p: Pos) => p.r >= 0 && p.r < N && p.c >= 0 && p.c < N;
const posKey = (p: Pos) => `${p.r},${p.c}`;
const wallKey = (w: { r: number; c: number; o: Orientation }) => `${w.r}:${w.c}:${w.o}`;
const otherPlayer = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

const edgeKey = (a: Pos, b: Pos) => {
  const x = posKey(a);
  const y = posKey(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

const center = (r: number, c: number) => ({
  x: P + c * S + S / 2,
  y: P + r * S + S / 2,
});

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
  const blocked = new Set<string>();

  for (const w of walls) {
    if (w.o === "h") {
      blocked.add(edgeKey({ r: w.r, c: w.c }, { r: w.r + 1, c: w.c }));
      blocked.add(edgeKey({ r: w.r, c: w.c + 1 }, { r: w.r + 1, c: w.c + 1 }));
    } else {
      blocked.add(edgeKey({ r: w.r, c: w.c }, { r: w.r, c: w.c + 1 }));
      blocked.add(edgeKey({ r: w.r + 1, c: w.c }, { r: w.r + 1, c: w.c + 1 }));
    }
  }

  return blocked;
};

const blockedEdge = (a: Pos, b: Pos, blocked: Set<string>) => blocked.has(edgeKey(a, b));

const hasPath = (start: Pos, goalRow: number, blocked: Set<string>) => {
  const q: Pos[] = [start];
  const seen = new Set<string>([posKey(start)]);
  let qi = 0;

  while (qi < q.length) {
    const cur = q[qi++]!;
    if (cur.r === goalRow) return true;

    const next = [
      { r: cur.r - 1, c: cur.c },
      { r: cur.r + 1, c: cur.c },
      { r: cur.r, c: cur.c - 1 },
      { r: cur.r, c: cur.c + 1 },
    ];

    for (const n of next) {
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

const uniq = (moves: Pos[]) => {
  const seen = new Set<string>();
  return moves.filter((p) => {
    const key = posKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        transition: "transform 210ms cubic-bezier(.22,.85,.25,1)",
      }}
    >
      {active && <circle r={4.28} fill={c.main} opacity={0.14} className="gl-pulse" />}
      <ellipse cx={0} cy={2.75} rx={2.9} ry={0.82} fill="rgba(0,0,0,0.34)" />
      <circle r={3.1} fill={`url(#pawn-${player})`} stroke="rgba(255,255,255,0.56)" strokeWidth={0.32} />
      <ellipse cx={-0.78} cy={-0.96} rx={1.02} ry={0.62} fill="rgba(255,255,255,0.45)" />
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
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);

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

    const prevent = (event: Event) => event.preventDefault();
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
    const id = window.setTimeout(() => setNotice(""), 1100);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (winner) return;
    setTimeLeft(TURN_SECONDS);
  }, [turn, winner]);

  useEffect(() => {
    if (winner) return;

    const id = window.setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [turn, winner]);

  useEffect(() => {
    if (winner || timeLeft > 0) return;

    haptic("error");
    setPreview(null);
    setMode("move");
    setNotice("Время вышло");
    setTurn((t) => otherPlayer(t));
  }, [timeLeft, winner]);

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
        const valid = wallValid(candidate, walls, p1, p2);
        if (valid) arr.push({ ...candidate, valid });
      }
    }
    return arr;
  }, [mode, winner, left, turn, orient, walls, p1, p2]);

  const validHintKeys = useMemo(() => new Set(wallHints.map(wallKey)), [wallHints]);

  const pointToSlot = useCallback(
    (clientX: number, clientY: number): Preview | null => {
      const el = boardRef.current;
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      if (x < P - 1 || x > P + N * S + 1 || y < P - 1 || y > P + N * S + 1) return null;

      let r: number;
      let c: number;

      if (orient === "h") {
        r = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
        c = clamp(Math.floor((x - P) / S), 0, N - 2);
      } else {
        r = clamp(Math.floor((y - P) / S), 0, N - 2);
        c = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
      }

      const candidate = { r, c, o: orient };
      return { ...candidate, valid: validHintKeys.has(wallKey(candidate)) };
    },
    [orient, validHintKeys]
  );

  const endTurn = () => {
    setTurn((t) => otherPlayer(t));
  };

  const tryMove = (r: number, c: number) => {
    if (winner || mode !== "move") return;

    const next = { r, c };
    if (!moveKeys.has(posKey(next))) {
      if (!same(next, cur)) {
        haptic("error");
        setNotice("Можно ходить только на подсвеченные клетки");
      }
      return;
    }

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
      setNotice("Тут нельзя поставить стену");
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
    if (mode !== "wall" || winner || left[turn] <= 0) return;
    e.preventDefault();
    const slot = pointToSlot(e.clientX, e.clientY);
    if (slot) setPreview(slot);
  };

  const onBoardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || left[turn] <= 0) return;
    e.preventDefault();
    e.stopPropagation();

    const start = tapStart.current;
    tapStart.current = null;

    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > TAP_CANCEL_PX) return;
    }

    placeWall(pointToSlot(e.clientX, e.clientY));
  };

  const setGameMode = (next: Mode) => {
    if (winner) return;

    if (next === "wall" && left[turn] <= 0) {
      haptic("error");
      setNotice("Стены закончились");
      return;
    }

    haptic("light");
    setMode(next);
    setPreview(null);
    setNotice("");
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
    setTimeLeft(TURN_SECONDS);
  };

  const timerProgress = timeLeft / TURN_SECONDS;

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        background: "transparent",
        touchAction: "none",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <style>{`
        @keyframes glPulse { 0%,100%{ opacity:.10; transform:scale(1);} 50%{ opacity:.22; transform:scale(1.18);} }
        @keyframes glPop { 0%{ transform:scale(.82); opacity:0;} 100%{ transform:scale(1); opacity:1;} }
        @keyframes glToast { 0%{ opacity:0; transform:translateY(8px) scale(.98);} 100%{ opacity:1; transform:none;} }
        .gl-pulse { animation: glPulse 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .gl-pop { animation: glPop 150ms cubic-bezier(.2,.9,.2,1.15) both; transform-box: fill-box; transform-origin: center; }
        .gl-tap { transition: transform .1s ease, opacity .1s ease, background-color .1s ease, border-color .1s ease; }
        .gl-tap:active:not(:disabled) { transform: scale(.976); opacity:.92; }
      `}</style>

      <header
        className="z-10 px-3 pt-2"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PlayerMini cfg={CFG.p1} count={left.p1} active={turn === "p1" && !winner} align="left" />

          <TimerBadge seconds={timeLeft} progress={timerProgress} accent={winner ? APP.gold : accent} done={!!winner} />

          <PlayerMini cfg={CFG.p2} count={left.p2} active={turn === "p2" && !winner} align="right" />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2">
        <div
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={() => {
            tapStart.current = null;
            setPreview(null);
          }}
          className="relative aspect-square w-full max-w-[min(100%,calc(100vh-168px))] overflow-hidden rounded-[25px] border"
          style={{
            background: "rgba(18,18,24,0.64)",
            borderColor: APP.border,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.055), 0 16px 34px rgba(0,0,0,.25)",
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
                <stop offset="100%" stopColor={CFG.p1.main} />
              </linearGradient>
              <linearGradient id="wall-p2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CFG.p2.light} />
                <stop offset="100%" stopColor={CFG.p2.main} />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="100" height="100" fill="rgba(255,255,255,0.008)" />
            <rect x={P} y={P} width={N * S} height={S} fill={CFG.p1.main} opacity={0.055} />
            <rect x={P} y={P + S * (N - 1)} width={N * S} height={S} fill={CFG.p2.main} opacity={0.055} />

            {cells.map((cell) => {
              const legal = mode === "move" && moveKeys.has(`${cell.r},${cell.c}`);

              return (
                <g key={`${cell.r}-${cell.c}`} onClick={() => tryMove(cell.r, cell.c)}>
                  <rect
                    x={cell.x + CELL_GAP / 2}
                    y={cell.y + CELL_GAP / 2}
                    width={S - CELL_GAP}
                    height={S - CELL_GAP}
                    rx={1.65}
                    fill="rgba(255,255,255,0.036)"
                    stroke={legal ? accent : "rgba(255,255,255,0.065)"}
                    strokeWidth={legal ? 0.42 : 0.22}
                  />

                  {legal && (
                    <g pointerEvents="none">
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={2.1} fill={accent} opacity={0.15} />
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={1.08} fill={accent} opacity={0.96} />
                    </g>
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
                    rx={0.9}
                    fill={accent}
                    opacity={0.11}
                  />
                );
              })}

            {walls.map((w) => {
              const r = wallRect(w);
              return (
                <g key={w.id} className="gl-pop" pointerEvents="none">
                  <rect x={r.x} y={r.y + 0.48} width={r.w} height={r.h} rx={0.9} fill="rgba(0,0,0,0.28)" />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.9}
                    fill={`url(#wall-${w.by})`}
                    stroke="rgba(255,255,255,0.34)"
                    strokeWidth={0.16}
                  />
                </g>
              );
            })}

            {preview && (() => {
              const r = wallRect(preview);
              return (
                <g pointerEvents="none">
                  <rect
                    x={r.x - 0.38}
                    y={r.y - 0.38}
                    width={r.w + 0.76}
                    height={r.h + 0.76}
                    rx={1.1}
                    fill="none"
                    stroke={preview.valid ? "rgba(255,255,255,0.82)" : "#ffb4b4"}
                    strokeWidth={0.42}
                  />
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={0.9}
                    fill={preview.valid ? `url(#wall-${turn})` : "#ef4444"}
                    opacity={preview.valid ? 0.98 : 0.78}
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
                className="rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
                style={{
                  background: "rgba(9,9,13,0.72)",
                  borderColor: `${accent}55`,
                  color: "rgba(255,255,255,0.74)",
                }}
              >
                тап по подсветке · {orient === "h" ? "━" : "┃"}
              </div>
            </div>
          )}

          {notice && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div
                className="rounded-2xl px-3 py-2 text-center text-[10px] font-black"
                style={{
                  animation: "glToast 150ms ease-out both",
                  background: "rgba(9,9,13,0.86)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.78)",
                  boxShadow: "0 10px 24px rgba(0,0,0,.28)",
                }}
              >
                {notice}
              </div>
            </div>
          )}

          {winner && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-6">
              <div
                className="w-full max-w-[300px] rounded-[26px] border px-5 py-6 text-center"
                style={{
                  background: APP.bgCard,
                  borderColor: APP.border,
                  boxShadow: "0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)",
                }}
              >
                <div className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: APP.muted }}>
                  победа
                </div>
                <div className="mt-2 text-2xl font-black" style={{ color: CFG[winner].text }}>
                  {CFG[winner].name}
                </div>
                <button
                  onClick={restart}
                  className="gl-tap mt-5 h-11 w-full rounded-2xl text-[11px] font-black uppercase tracking-[0.14em]"
                  style={{
                    background: winner === "p1" ? APP.blue : APP.orange,
                    color: "#fff",
                  }}
                  type="button"
                >
                  снова
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer
        className="z-10 px-3 pb-2"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <div
          className="grid h-[48px] grid-cols-[1fr_1fr_54px] gap-1.5 rounded-[22px] border p-1.5"
          style={{
            background: "rgba(18,18,24,0.72)",
            borderColor: APP.border,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.055), 0 12px 28px rgba(0,0,0,.22)",
          }}
        >
          <ControlButton active={mode === "move"} accent={accent} onClick={() => setGameMode("move")} disabled={!!winner}>
            Ход
          </ControlButton>

          <ControlButton active={mode === "wall"} accent={accent} onClick={() => setGameMode("wall")} disabled={!!winner || left[turn] <= 0}>
            Стена <span style={{ opacity: 0.58 }}>{left[turn]}</span>
          </ControlButton>

          <button
            onClick={rotate}
            disabled={!!winner || mode !== "wall"}
            className="gl-tap rounded-[17px] text-[17px] font-black disabled:opacity-35"
            style={{
              background: mode === "wall" ? `${accent}22` : "rgba(255,255,255,0.035)",
              color: mode === "wall" ? "#fff" : "rgba(255,255,255,0.45)",
            }}
            type="button"
            aria-label="Повернуть стену"
          >
            {orient === "h" ? "━" : "┃"}
          </button>
        </div>
      </footer>
    </div>
  );
};


const TimerBadge = ({
  seconds,
  progress,
  accent,
  done,
}: {
  seconds: number;
  progress: number;
  accent: string;
  done: boolean;
}) => {
  const degrees = clamp(progress, 0, 1) * 360;

  return (
    <div
      className="grid h-[54px] w-[72px] place-items-center rounded-[20px] border"
      style={{
        background: APP.bgCardSoft,
        borderColor: APP.border,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.055)",
      }}
      aria-label="Таймер хода"
    >
      <div
        className="grid h-[40px] w-[40px] place-items-center rounded-full"
        style={{
          background: `conic-gradient(${accent} ${degrees}deg, rgba(255,255,255,0.075) ${degrees}deg 360deg)`,
          boxShadow: `0 0 14px ${accent}22`,
        }}
      >
        <div
          className="grid h-[32px] w-[32px] place-items-center rounded-full text-[14px] font-black leading-none"
          style={{
            background: "rgba(9,9,13,0.88)",
            color: done ? APP.gold : APP.text,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
          }}
        >
          {done ? "✓" : seconds}
        </div>
      </div>
    </div>
  );
};

const PlayerMini = ({
  cfg,
  count,
  active,
  align,
}: {
  cfg: PlayerCfg;
  count: number;
  active: boolean;
  align: "left" | "right";
}) => (
  <div
    className="flex min-h-[54px] min-w-0 items-center gap-2 rounded-[20px] border px-2.5 py-2.5"
    style={{
      flexDirection: align === "right" ? "row-reverse" : "row",
      background: active ? `${cfg.main}18` : APP.bgCardSoft,
      borderColor: active ? `${cfg.main}66` : APP.border,
      opacity: active ? 1 : 0.62,
      boxShadow: active ? `0 8px 22px ${cfg.main}13, inset 0 1px 0 rgba(255,255,255,.055)` : "inset 0 1px 0 rgba(255,255,255,.045)",
    }}
  >
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[14px] text-[11px] font-black"
      style={{ background: cfg.main, color: "#fff" }}
    >
      {cfg.short}
    </span>
    <span className="min-w-0 leading-[1.24]" style={{ textAlign: align === "right" ? "right" : "left" }}>
      <span className="block truncate text-[10.5px] font-black" style={{ color: cfg.text }}>
        {cfg.name}
      </span>
      <span className="mt-1.5 block truncate text-[8.5px] font-black uppercase tracking-[0.12em] leading-[1.35]" style={{ color: APP.muted }}>
        {count} стен
      </span>
    </span>
  </div>
);

const ControlButton = ({
  active,
  accent,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="gl-tap rounded-[17px] text-[11px] font-black uppercase tracking-[0.12em] disabled:opacity-35"
    style={{
      background: active ? `${accent}24` : "transparent",
      color: active ? "#fff" : "rgba(255,255,255,0.48)",
      border: active ? `1px solid ${accent}55` : "1px solid transparent",
    }}
    type="button"
  >
    {children}
  </button>
);

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
