import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   GRIDLOCK / QUORIDOR — app-style version
   - шахматный таймер: каждому игроку по 2 минуты на всю партию
   - ходы показываются только точками, без дополнительных квадратиков
   - стены ставятся drag-and-drop из двух нижних кнопок: вертикальная / горизонтальная
   - если отпустить стену обратно в нижнюю зону кнопок — постановка отменяется
   ========================================================================= */

type PlayerId = "p1" | "p2";
type Orientation = "h" | "v";
type Pos = { r: number; c: number };
type Wall = { id: string; r: number; c: number; o: Orientation; by: PlayerId };
type Preview = { r: number; c: number; o: Orientation; valid: boolean };
type DragWall = { o: Orientation; x: number; y: number; overCancel: boolean };

const N = 9;
const WALLS = 10;
const TOTAL_SECONDS = 120;

// SVG board metrics: viewBox 0..100
const P = 5;
const S = 10;
const CELL_GAP = 0.72;
const WT = 2.05; // стены визуально крупнее
const WPAD = 0.72;

const APP = {
  bgCard: "rgba(18, 18, 24, 0.9)",
  bgCardSoft: "rgba(255, 255, 255, 0.035)",
  border: "rgba(255, 255, 255, 0.075)",
  text: "#ffffff",
  muted: "#8f8f9c",
  danger: "#ef4444",
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
const otherPlayer = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

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
  const dragWallRef = useRef<DragWall | null>(null);

  const [p1, setP1] = useState<Pos>(START.p1);
  const [p2, setP2] = useState<Pos>(START.p2);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [turn, setTurn] = useState<PlayerId>("p1");
  const [left, setLeft] = useState<Record<PlayerId, number>>({ p1: WALLS, p2: WALLS });
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [clocks, setClocks] = useState<Record<PlayerId, number>>({ p1: TOTAL_SECONDS, p2: TOTAL_SECONDS });
  const [dragWall, setDragWallState] = useState<DragWall | null>(null);

  const cur = turn === "p1" ? p1 : p2;
  const other = turn === "p1" ? p2 : p1;
  const cfg = CFG[turn];
  const accent = cfg.main;

  const setDragWall = useCallback((next: DragWall | null) => {
    dragWallRef.current = next;
    setDragWallState(next);
  }, []);

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
    const id = window.setTimeout(() => setNotice(""), 1200);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (winner) return;

    const id = window.setInterval(() => {
      setClocks((value) => ({
        ...value,
        [turn]: Math.max(0, value[turn] - 1),
      }));
    }, 1000);

    return () => window.clearInterval(id);
  }, [turn, winner]);

  useEffect(() => {
    if (winner) return;

    if (clocks.p1 <= 0) {
      haptic("error");
      setPreview(null);
      setDragWall(null);
      setNotice("У Игрока 1 вышло время");
      setWinner("p2");
      return;
    }

    if (clocks.p2 <= 0) {
      haptic("error");
      setPreview(null);
      setDragWall(null);
      setNotice("У Игрока 2 вышло время");
      setWinner("p1");
    }
  }, [clocks, winner, setDragWall]);

  const blocked = useMemo(() => buildBlocked(walls), [walls]);

  const moves = useMemo(
    () => (winner ? [] : legalMovesOf(cur, other, blocked)),
    [cur, other, blocked, winner]
  );

  const moveKeys = useMemo(() => new Set(moves.map(posKey)), [moves]);

  const cells = useMemo(() => {
    const arr: { r: number; c: number; x: number; y: number }[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) arr.push({ r, c, x: P + c * S, y: P + r * S });
    }
    return arr;
  }, []);

  const pointToSlot = useCallback(
    (clientX: number, clientY: number, o: Orientation): Preview | null => {
      const el = boardRef.current;
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      if (x < P - 1 || x > P + N * S + 1 || y < P - 1 || y > P + N * S + 1) return null;

      let r: number;
      let c: number;

      if (o === "h") {
        r = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
        c = clamp(Math.floor((x - P) / S), 0, N - 2);
      } else {
        r = clamp(Math.floor((y - P) / S), 0, N - 2);
        c = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
      }

      const candidate = { r, c, o };
      return { ...candidate, valid: wallValid(candidate, walls, p1, p2) };
    },
    [walls, p1, p2]
  );

  const isInCancelZone = useCallback((_clientX: number, clientY: number) => {
    const board = boardRef.current;
    if (!board) return false;

    const rect = board.getBoundingClientRect();

    // Зона отмены — вообще всё, что ниже игрового поля.
    return clientY >= rect.bottom;
  }, []);

  const endTurn = useCallback(() => {
    setTurn((t) => otherPlayer(t));
  }, []);

  const tryMove = (r: number, c: number) => {
    if (winner || dragWallRef.current) return;

    const next = { r, c };
    if (!moveKeys.has(posKey(next))) {
      if (!same(next, cur)) {
        haptic("error");
        setNotice("Можно ходить только на точки");
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

  const placeWall = useCallback(
    (slot: Preview | null) => {
      if (winner || left[turn] <= 0) return;

      if (!slot) {
        haptic("error");
        setNotice("Перетащи стену на поле");
        return;
      }

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
      endTurn();
    },
    [winner, left, turn, endTurn]
  );

  const startWallDrag = (o: Orientation, e: React.PointerEvent<HTMLButtonElement>) => {
    if (winner) return;

    if (left[turn] <= 0) {
      haptic("error");
      setNotice("Стены закончились");
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // no-op
    }

    haptic("light");
    setPreview(null);

    setDragWall({
      o,
      x: e.clientX,
      y: e.clientY,
      overCancel: true,
    });
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragWallRef.current;
      if (!drag || winner) return;

      event.preventDefault();

      const overCancel = isInCancelZone(event.clientX, event.clientY);
      const next = {
        ...drag,
        x: event.clientX,
        y: event.clientY,
        overCancel,
      };

      dragWallRef.current = next;
      setDragWallState(next);
      setPreview(overCancel ? null : pointToSlot(event.clientX, event.clientY, drag.o));
    };

    const cancelDrag = () => {
      const drag = dragWallRef.current;
      if (!drag) return;
      dragWallRef.current = null;
      setDragWallState(null);
      setPreview(null);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragWallRef.current;
      if (!drag) return;

      event.preventDefault();

      const overCancel = isInCancelZone(event.clientX, event.clientY);
      const slot = overCancel ? null : pointToSlot(event.clientX, event.clientY, drag.o);

      dragWallRef.current = null;
      setDragWallState(null);
      setPreview(null);

      if (overCancel) {
        haptic("light");
        return;
      }

      placeWall(slot);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    window.addEventListener("pointercancel", cancelDrag);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", cancelDrag);
    };
  }, [winner, isInCancelZone, pointToSlot, placeWall]);

  const restart = () => {
    haptic("medium");
    setP1(START.p1);
    setP2(START.p2);
    setWalls([]);
    setLeft({ p1: WALLS, p2: WALLS });
    setTurn("p1");
    setWinner(null);
    setPreview(null);
    setNotice("");
    setClocks({ p1: TOTAL_SECONDS, p2: TOTAL_SECONDS });
    setDragWall(null);
  };

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
        <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
          <PlayerMini
            cfg={CFG.p1}
            count={left.p1}
            timeLeft={clocks.p1}
            active={turn === "p1" && !winner}
            align="left"
          />

          <TurnBadge player={turn} done={!!winner} />

          <PlayerMini
            cfg={CFG.p2}
            count={left.p2}
            timeLeft={clocks.p2}
            active={turn === "p2" && !winner}
            align="right"
          />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2">
        <div
          ref={boardRef}
          onPointerCancel={() => {
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
              const legal = moveKeys.has(`${cell.r},${cell.c}`);

              return (
                <g key={`${cell.r}-${cell.c}`} onClick={() => tryMove(cell.r, cell.c)}>
                  <rect
                    x={cell.x + CELL_GAP / 2}
                    y={cell.y + CELL_GAP / 2}
                    width={S - CELL_GAP}
                    height={S - CELL_GAP}
                    rx={1.65}
                    fill="rgba(255,255,255,0.036)"
                    stroke="rgba(255,255,255,0.065)"
                    strokeWidth={0.22}
                  />

                  {legal && !winner && !dragWall && (
                    <g pointerEvents="none">
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={1.32} fill={accent} opacity={0.96} />
                    </g>
                  )}
                </g>
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
                    fill={preview.valid ? `url(#wall-${turn})` : APP.danger}
                    opacity={preview.valid ? 0.98 : 0.78}
                  />
                </g>
              );
            })()}

            <Pawn player="p1" pos={p1} active={turn === "p1" && !winner} />
            <Pawn player="p2" pos={p2} active={turn === "p2" && !winner} />
          </svg>

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
          className="relative mx-auto grid h-[56px] w-[168px] grid-cols-2 gap-2 rounded-[22px] border p-1.5"
          style={{
            background: dragWall?.overCancel ? "rgba(239,68,68,0.16)" : "rgba(18,18,24,0.72)",
            borderColor: dragWall?.overCancel ? "rgba(239,68,68,0.55)" : APP.border,
            boxShadow: dragWall?.overCancel
              ? "0 0 0 1px rgba(239,68,68,.12), 0 12px 28px rgba(0,0,0,.22)"
              : "inset 0 1px 0 rgba(255,255,255,.055), 0 12px 28px rgba(0,0,0,.22)",
          }}
        >
          <WallDragButton
            o="v"
            accent={accent}
            disabled={!!winner || left[turn] <= 0}
            faded={!!dragWall}
            onPointerDown={(e) => startWallDrag("v", e)}
          />

          <WallDragButton
            o="h"
            accent={accent}
            disabled={!!winner || left[turn] <= 0}
            faded={!!dragWall}
            onPointerDown={(e) => startWallDrag("h", e)}
          />

          {dragWall?.overCancel && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[22px]">
              <div
                className="grid h-10 w-10 place-items-center rounded-full"
                style={{
                  background: "rgba(239,68,68,0.92)",
                  color: "#fff",
                  boxShadow: "0 10px 24px rgba(239,68,68,.24)",
                }}
              >
                <TrashIcon />
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
};

const TurnBadge = ({ player, done }: { player: PlayerId; done: boolean }) => {
  const cfg = CFG[player];

  return (
    <div
      className="grid h-10 w-10 place-items-center rounded-[16px] border text-[15px] font-black"
      style={{
        background: done ? `${APP.gold}18` : `${cfg.main}18`,
        borderColor: done ? `${APP.gold}55` : `${cfg.main}55`,
        color: done ? APP.gold : cfg.text,
        boxShadow: done ? "none" : `0 8px 22px ${cfg.main}12, inset 0 1px 0 rgba(255,255,255,.055)`,
      }}
      aria-label="Текущий ход"
    >
      {done ? "✓" : cfg.arrow}
    </div>
  );
};

const PlayerMini = ({
  cfg,
  count,
  timeLeft,
  active,
  align,
}: {
  cfg: PlayerCfg;
  count: number;
  timeLeft: number;
  active: boolean;
  align: "left" | "right";
}) => {
  const lowTime = timeLeft <= 15;

  return (
    <div
      className="flex min-h-[64px] min-w-0 items-center gap-2 rounded-[20px] border px-2.5 py-2.5"
      style={{
        flexDirection: align === "right" ? "row-reverse" : "row",
        background: active ? `${cfg.main}18` : APP.bgCardSoft,
        borderColor: active ? `${cfg.main}66` : APP.border,
        opacity: active ? 1 : 0.62,
        boxShadow: active
          ? `0 8px 22px ${cfg.main}13, inset 0 1px 0 rgba(255,255,255,.055)`
          : "inset 0 1px 0 rgba(255,255,255,.045)",
      }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[14px] text-[11px] font-black"
        style={{ background: cfg.main, color: "#fff" }}
      >
        {cfg.short}
      </span>
      <span className="min-w-0 leading-[1.16]" style={{ textAlign: align === "right" ? "right" : "left" }}>
        <span className="block truncate text-[10.5px] font-black" style={{ color: cfg.text }}>
          {cfg.name}
        </span>
        <span
          className="mt-1 block truncate text-[12px] font-black tabular-nums tracking-[0.05em]"
          style={{ color: lowTime ? "#fecaca" : active ? APP.text : "rgba(255,255,255,0.72)" }}
        >
          {formatClock(timeLeft)}
        </span>
        <span
          className="mt-1 block truncate text-[8px] font-black uppercase tracking-[0.12em] leading-[1.25]"
          style={{ color: APP.muted }}
        >
          {count} стен
        </span>
      </span>
    </div>
  );
};

const WallDragButton = ({
  o,
  accent,
  disabled,
  faded,
  onPointerDown,
}: {
  o: Orientation;
  accent: string;
  disabled?: boolean;
  faded?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) => (
  <button
    onPointerDown={onPointerDown}
    disabled={disabled}
    className="gl-tap grid place-items-center rounded-[17px] disabled:opacity-35"
    style={{
      background: `${accent}1f`,
      border: `1px solid ${accent}55`,
      opacity: faded ? 0.28 : 1,
      touchAction: "none",
    }}
    type="button"
    aria-label={o === "h" ? "Поставить горизонтальную стену" : "Поставить вертикальную стену"}
  >
    <span
      style={{
        display: "block",
        width: o === "h" ? 34 : 8,
        height: o === "h" ? 8 : 34,
        borderRadius: 999,
        background: accent,
        boxShadow: `0 0 16px ${accent}44, inset 0 1px 0 rgba(255,255,255,.35)`,
      }}
    />
  </button>
);

const TrashIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M9 4.75h6M10 4.75l.55-1.15A1 1 0 0 1 11.45 3h1.1a1 1 0 0 1 .9.6L14 4.75M5.75 7h12.5M8 7.75l.7 11.1A2 2 0 0 0 10.7 20.75h2.6a2 2 0 0 0 2-1.9l.7-11.1M10.25 10.25v7M13.75 10.25v7"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
