import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   GRIDLOCK / QUORIDOR — polished mobile-first version
   - чистый responsive UI для Telegram Mini App / mobile web
   - стены ставятся тапом: выбрал режим → выбрал ориентацию → тап по подсветке
   - магнитное попадание по слотам стены, превью, понятные ошибки
   - проверка правила: нельзя полностью закрыть путь обоим игрокам
   - кнопка отмены последнего действия
   - без тяжёлых SVG-фильтров: только transform/opacity, градиенты и простые тени
   ========================================================================= */

type PlayerId = "p1" | "p2";
type Orientation = "h" | "v";
type Mode = "move" | "wall";
type NoticeKind = "info" | "error" | "success";

type Pos = { r: number; c: number };
type Wall = { id: string; r: number; c: number; o: Orientation; by: PlayerId };
type Preview = { r: number; c: number; o: Orientation; valid: boolean };

type Snapshot = {
  p1: Pos;
  p2: Pos;
  walls: Wall[];
  turn: PlayerId;
  left: Record<PlayerId, number>;
  winner: PlayerId | null;
  mode: Mode;
  orient: Orientation;
};

const N = 9;
const WALLS = 10;

// SVG board metrics: viewBox 0..100
const P = 5;
const S = 10;
const CELL_GAP = 0.82;
const WALL_T = 1.55;
const WALL_PAD = 1.0;
const TAP_CANCEL_PX = 20;
const HISTORY_LIMIT = 50;

const START: Record<PlayerId, Pos> = {
  p1: { r: N - 1, c: 4 },
  p2: { r: 0, c: 4 },
};

const CFG = {
  p1: {
    name: "Игрок 1",
    short: "И1",
    goal: "ВВЕРХ",
    goalHint: "дойти до верхнего края",
    arrow: "↑",
    light: "#86efac",
    main: "#34d399",
    dark: "#059669",
    ink: "#042015",
    text: "#bbf7d0",
  },
  p2: {
    name: "Игрок 2",
    short: "И2",
    goal: "ВНИЗ",
    goalHint: "дойти до нижнего края",
    arrow: "↓",
    light: "#93c5fd",
    main: "#60a5fa",
    dark: "#2563eb",
    ink: "#061328",
    text: "#bfdbfe",
  },
} as const;


const opposite = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");
const clonePos = (p: Pos): Pos => ({ r: p.r, c: p.c });
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

const center = (r: number, c: number) => ({
  x: P + c * S + S / 2,
  y: P + r * S + S / 2,
});

const wallRect = (w: { r: number; c: number; o: Orientation }) => {
  if (w.o === "h") {
    return {
      x: P + w.c * S + WALL_PAD,
      y: P + (w.r + 1) * S - WALL_T / 2,
      w: S * 2 - WALL_PAD * 2,
      h: WALL_T,
    };
  }

  return {
    x: P + (w.c + 1) * S - WALL_T / 2,
    y: P + w.r * S + WALL_PAD,
    w: WALL_T,
    h: S * 2 - WALL_PAD * 2,
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

const wallConflict = (candidate: { r: number; c: number; o: Orientation }, walls: Wall[]) => {
  for (const w of walls) {
    // same top-left slot means overlap / crossing
    if (w.r === candidate.r && w.c === candidate.c) return true;

    // same orientation in neighbour slot shares one blocked edge, so it overlaps
    if (candidate.o === "h" && w.o === "h" && w.r === candidate.r && Math.abs(w.c - candidate.c) === 1) {
      return true;
    }

    if (candidate.o === "v" && w.o === "v" && w.c === candidate.c && Math.abs(w.r - candidate.r) === 1) {
      return true;
    }
  }

  return false;
};

const wallValid = (
  candidate: { r: number; c: number; o: Orientation },
  walls: Wall[],
  p1: Pos,
  p2: Pos
) => {
  if (candidate.r < 0 || candidate.r > N - 2 || candidate.c < 0 || candidate.c > N - 2) return false;
  if (wallConflict(candidate, walls)) return false;

  const blocked = buildBlocked([...walls, { ...candidate, id: "tmp", by: "p1" }]);
  return hasPath(p1, 0, blocked) && hasPath(p2, N - 1, blocked);
};

const uniquePositions = (moves: Pos[]) => {
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

    const diagonals =
      d.dr !== 0
        ? [
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
          ]
        : [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
          ];

    for (const side of diagonals) {
      const diag = { r: other.r + side.dr, c: other.c + side.dc };
      if (inBoard(diag) && !blockedEdge(other, diag, blocked)) moves.push(diag);
    }
  }

  return uniquePositions(moves);
};

const haptic = (kind: "light" | "medium" | "error" | "success" = "light") => {
  try {
    const tg = (window as Window & { Telegram?: { WebApp?: any } }).Telegram?.WebApp;

    if (kind === "error" || kind === "success") {
      tg?.HapticFeedback?.notificationOccurred?.(kind);
      if (!tg?.HapticFeedback?.notificationOccurred && navigator.vibrate) navigator.vibrate(kind === "error" ? 32 : 18);
      return;
    }

    tg?.HapticFeedback?.impactOccurred?.(kind);
    if (!tg?.HapticFeedback?.impactOccurred && navigator.vibrate) navigator.vibrate(kind === "medium" ? 18 : 9);
  } catch {
    // no-op
  }
};

const targetGoalRow = (player: PlayerId) => (player === "p1" ? 0 : N - 1);

const niceMoveHint = (mode: Mode, winner: PlayerId | null, turn: PlayerId, left: number, orient: Orientation) => {
  if (winner) return "Партия закончена — можно начать заново";
  if (mode === "move") return `Выбери подсвеченную клетку. Цель: ${CFG[turn].goalHint}.`;
  if (left <= 0) return "У этого игрока больше нет стен.";
  return `Тапни по подсветке, чтобы поставить ${orient === "h" ? "горизонтальную" : "вертикальную"} стену.`;
};

const Pawn = ({ player, pos, active }: { player: PlayerId; pos: Pos; active: boolean }) => {
  const cfg = CFG[player];
  const { x, y } = center(pos.r, pos.c);

  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 230ms cubic-bezier(.2,.9,.2,1)",
      }}
    >
      {active && <circle r={4.55} fill={cfg.main} opacity={0.18} className="gl-pulse" />}
      <ellipse cx={0} cy={3.15} rx={3.2} ry={0.95} fill="rgba(0,0,0,0.42)" />
      <circle r={3.2} fill={`url(#pawn-${player})`} stroke="rgba(255,255,255,0.64)" strokeWidth={0.34} />
      <circle r={2.05} fill="rgba(255,255,255,0.08)" />
      <ellipse cx={-0.9} cy={-1.05} rx={1.05} ry={0.68} fill="rgba(255,255,255,0.48)" />
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
  const [notice, setNotice] = useState<{ text: string; kind: NoticeKind } | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const cur = turn === "p1" ? p1 : p2;
  const other = turn === "p1" ? p2 : p1;
  const cfg = CFG[turn];
  const accent = cfg.main;
  const turnWallsLeft = left[turn];

  const snapshot = useCallback(
    (): Snapshot => ({
      p1: clonePos(p1),
      p2: clonePos(p2),
      walls: walls.map((w) => ({ ...w })),
      turn,
      left: { ...left },
      winner,
      mode,
      orient,
    }),
    [p1, p2, walls, turn, left, winner, mode, orient]
  );

  const pushHistory = useCallback(() => {
    const snap = snapshot();
    setHistory((h) => [...h.slice(Math.max(0, h.length - HISTORY_LIMIT + 1)), snap]);
  }, [snapshot]);

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
    const timeout = window.setTimeout(() => setNotice(null), notice.kind === "error" ? 1450 : 1150);
    return () => window.clearTimeout(timeout);
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
    if (mode !== "wall" || winner || turnWallsLeft <= 0) return [];

    const arr: Preview[] = [];
    for (let r = 0; r <= N - 2; r++) {
      for (let c = 0; c <= N - 2; c++) {
        const candidate = { r, c, o: orient };
        arr.push({ ...candidate, valid: wallValid(candidate, walls, p1, p2) });
      }
    }
    return arr;
  }, [mode, winner, turnWallsLeft, orient, walls, p1, p2]);

  const validHintKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const hint of wallHints) if (hint.valid) keys.add(wallKey(hint));
    return keys;
  }, [wallHints]);

  const pointToSlot = useCallback(
    (clientX: number, clientY: number): Preview | null => {
      const el = boardRef.current;
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      const min = P - 1;
      const max = P + N * S + 1;
      if (x < min || x > max || y < min || y > max) return null;

      let r: number;
      let c: number;

      if (orient === "h") {
        // horizontal wall sits on a horizontal seam, spans two neighbour columns
        r = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
        c = clamp(Math.floor((x - P) / S), 0, N - 2);
      } else {
        // vertical wall sits on a vertical seam, spans two neighbour rows
        r = clamp(Math.floor((y - P) / S), 0, N - 2);
        c = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
      }

      const candidate = { r, c, o: orient };
      return { ...candidate, valid: validHintKeys.has(wallKey(candidate)) };
    },
    [orient, validHintKeys]
  );

  const setMessage = (text: string, kind: NoticeKind = "info") => setNotice({ text, kind });

  const endTurn = () => {
    setTurn((t) => opposite(t));
  };

  const tryMove = (r: number, c: number) => {
    if (winner || mode !== "move") return;

    const next = { r, c };
    if (!moveKeys.has(posKey(next))) {
      if (!same(next, cur)) {
        haptic("error");
        setMessage("Ходить можно только на подсвеченные клетки", "error");
      }
      return;
    }

    pushHistory();
    haptic("light");

    const goalRow = targetGoalRow(turn);
    const won = next.r === goalRow;

    if (turn === "p1") setP1(next);
    else setP2(next);

    setPreview(null);
    setMode("move");

    if (won) {
      setWinner(turn);
      haptic("success");
      setMessage(`${CFG[turn].name} победил!`, "success");
      return;
    }

    endTurn();
  };

  const placeWall = (slot: Preview | null) => {
    if (!slot || winner || mode !== "wall") return;

    setPreview(slot);

    if (turnWallsLeft <= 0) {
      haptic("error");
      setMessage("Стены закончились — нужно ходить фишкой", "error");
      return;
    }

    if (!slot.valid) {
      haptic("error");
      setMessage("Тут нельзя: стена пересекается или закрывает путь", "error");
      return;
    }

    pushHistory();
    haptic("medium");

    setWalls((list) => [
      ...list,
      {
        id: `${turn}-${slot.r}-${slot.c}-${slot.o}-${Date.now()}`,
        r: slot.r,
        c: slot.c,
        o: slot.o,
        by: turn,
      },
    ]);
    setLeft((current) => ({ ...current, [turn]: current[turn] - 1 }));
    setPreview(null);
    setMode("move");
    setMessage("Стена поставлена", "success");
    endTurn();
  };

  const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || turnWallsLeft <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    tapStart.current = { x: e.clientX, y: e.clientY };
    const slot = pointToSlot(e.clientX, e.clientY);
    if (slot) setPreview(slot);
  };

  const onBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || turnWallsLeft <= 0) return;
    e.preventDefault();
    const slot = pointToSlot(e.clientX, e.clientY);
    if (slot) setPreview(slot);
  };

  const onBoardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "wall" || winner || turnWallsLeft <= 0) return;
    e.preventDefault();
    e.stopPropagation();

    const start = tapStart.current;
    tapStart.current = null;

    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > TAP_CANCEL_PX) {
        setPreview(null);
        haptic("light");
        setMessage("Стену ставим коротким тапом. Проведи пальцем только для прицеливания.", "info");
        return;
      }
    }

    placeWall(pointToSlot(e.clientX, e.clientY));
  };

  const selectMode = (next: Mode) => {
    if (winner) return;
    if (next === "wall" && turnWallsLeft <= 0) {
      haptic("error");
      setMessage("У игрока закончились стены", "error");
      return;
    }

    haptic("light");
    setMode(next);
    setPreview(null);
    setNotice(null);
  };

  const rotate = () => {
    if (winner || mode !== "wall") return;
    haptic("light");
    setOrient((o) => (o === "h" ? "v" : "h"));
    setPreview(null);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) {
      haptic("error");
      setMessage("Отменять пока нечего", "error");
      return;
    }

    haptic("medium");
    setP1(last.p1);
    setP2(last.p2);
    setWalls(last.walls);
    setTurn(last.turn);
    setLeft(last.left);
    setWinner(last.winner);
    setMode(last.mode);
    setOrient(last.orient);
    setPreview(null);
    setNotice(null);
    setHistory((h) => h.slice(0, -1));
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
    setNotice(null);
    setHistory([]);
  };

  const helperText = niceMoveHint(mode, winner, turn, turnWallsLeft, orient);

  return (
    <div
      className="gl-root relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      onContextMenu={(e) => e.preventDefault()}
      style={
        {
          "--gl-accent": accent,
          "--gl-accent-soft": `${accent}33`,
          background: "radial-gradient(circle at 50% -8%, rgba(96,165,250,.22), transparent 42%), #080c15",
          touchAction: "none",
          overscrollBehavior: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTapHighlightColor: "transparent",
        } as React.CSSProperties
      }
    >
      <style>{`
        @keyframes glPulse {
          0%, 100% { opacity: .10; transform: scale(1); }
          50% { opacity: .28; transform: scale(1.22); }
        }
        @keyframes glPop {
          0% { transform: scale(.72); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glFloatIn {
          0% { opacity: 0; transform: translateY(10px) scale(.97); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes glShine {
          0% { transform: translateX(-120%) rotate(14deg); }
          100% { transform: translateX(160%) rotate(14deg); }
        }
        .gl-root * { -webkit-tap-highlight-color: transparent; }
        .gl-pulse { animation: glPulse 1.75s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .gl-pop { animation: glPop 170ms cubic-bezier(.2,.9,.2,1.18) both; transform-box: fill-box; transform-origin: center; }
        .gl-card-in { animation: glFloatIn 230ms ease-out both; }
        .gl-tap { transition: transform .11s ease, opacity .12s ease, background-color .12s ease, border-color .12s ease, box-shadow .12s ease; }
        .gl-tap:active:not(:disabled) { transform: scale(.972); }
        .gl-no-scrollbar { scrollbar-width: none; }
        .gl-no-scrollbar::-webkit-scrollbar { display: none; }
        .gl-shine::after {
          content: "";
          position: absolute;
          inset: -40% -60%;
          width: 42%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
          animation: glShine 4.6s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[-18%] top-[-12%] h-[38vh] w-[38vh] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-[-16%] right-[-18%] h-[42vh] w-[42vh] rounded-full bg-blue-500/12 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
          }}
        />
      </div>

      <header
        className="relative z-10 px-2 pt-2"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PlayerCard player="p1" count={left.p1} active={turn === "p1" && !winner} pos="left" />

          <div className="gl-shine relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.055] px-3 py-2 text-center shadow-[0_14px_40px_rgba(0,0,0,.28)]">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/36">GridLock</div>
            <div className="mt-0.5 text-[13px] font-black leading-none" style={{ color: winner ? "#fde68a" : cfg.text }}>
              {winner ? `${CFG[winner].name} победил` : `${cfg.name} ходит`}
            </div>
          </div>

          <PlayerCard player="p2" count={left.p2} active={turn === "p2" && !winner} pos="right" />
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,.18)]">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-base font-black"
            style={{ background: `${accent}24`, color: cfg.text, border: `1px solid ${accent}44` }}
          >
            {winner ? "★" : cfg.arrow}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-extrabold text-white/82">{helperText}</div>
            <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
              стены: {left.p1 + left.p2} на поле · ходов назад: {history.length}
            </div>
          </div>
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="gl-tap rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/62 disabled:opacity-35"
            type="button"
          >
            Отмена
          </button>
        </div>
      </header>

      <main className="relative z-0 flex min-h-0 flex-1 items-center justify-center px-2 py-2">
        <div
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={() => {
            tapStart.current = null;
            setPreview(null);
          }}
          className="relative aspect-square w-full max-w-[min(100%,calc(100vh-218px))] overflow-hidden rounded-[28px] border border-white/10 bg-[#101827] shadow-[0_26px_80px_rgba(0,0,0,.54),inset_0_1px_0_rgba(255,255,255,.08)]"
          style={{ touchAction: "none", contain: "layout paint size" }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ touchAction: "none" }}>
            <defs>
              <linearGradient id="board-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#18243a" />
                <stop offset="55%" stopColor="#0d1524" />
                <stop offset="100%" stopColor="#080c15" />
              </linearGradient>

              <radialGradient id="cell-glow" cx="50%" cy="35%" r="70%">
                <stop offset="0%" stopColor="rgba(255,255,255,.11)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.035)" />
              </radialGradient>

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

            <rect x="0" y="0" width="100" height="100" fill="url(#board-bg)" />
            <rect x={P} y={P} width={N * S} height={S} fill={CFG.p2.main} opacity={0.09} />
            <rect x={P} y={P + S * (N - 1)} width={N * S} height={S} fill={CFG.p1.main} opacity={0.09} />

            <text x="50" y="3.15" textAnchor="middle" fontSize="2.2" fontWeight="900" fill={CFG.p1.text} opacity="0.55">
              ЦЕЛЬ ИГРОКА 1 ↑
            </text>
            <text x="50" y="98.05" textAnchor="middle" fontSize="2.2" fontWeight="900" fill={CFG.p2.text} opacity="0.55">
              ↓ ЦЕЛЬ ИГРОКА 2
            </text>

            {cells.map((cell) => {
              const key = `${cell.r},${cell.c}`;
              const legal = mode === "move" && moveKeys.has(key);
              const occupiedP1 = same(p1, { r: cell.r, c: cell.c });
              const occupiedP2 = same(p2, { r: cell.r, c: cell.c });
              const goalTint = cell.r === 0 ? CFG.p1.main : cell.r === N - 1 ? CFG.p2.main : "transparent";

              return (
                <g key={key} onClick={() => tryMove(cell.r, cell.c)} className="gl-tap" style={{ cursor: legal ? "pointer" : "default" }}>
                  <rect
                    x={cell.x + CELL_GAP / 2}
                    y={cell.y + CELL_GAP / 2}
                    width={S - CELL_GAP}
                    height={S - CELL_GAP}
                    rx={1.9}
                    fill="url(#cell-glow)"
                    stroke={legal ? accent : "rgba(255,255,255,0.075)"}
                    strokeWidth={legal ? 0.46 : 0.24}
                    opacity={occupiedP1 || occupiedP2 ? 0.86 : 1}
                  />

                  {goalTint !== "transparent" && (
                    <rect
                      x={cell.x + CELL_GAP / 2}
                      y={cell.y + CELL_GAP / 2}
                      width={S - CELL_GAP}
                      height={S - CELL_GAP}
                      rx={1.9}
                      fill={goalTint}
                      opacity={0.045}
                      pointerEvents="none"
                    />
                  )}

                  {legal && (
                    <g pointerEvents="none" className="gl-pop">
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={2.85} fill={accent} opacity={0.13} />
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={1.46} fill={accent} opacity={0.95} />
                      <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={0.6} fill="white" opacity={0.72} />
                    </g>
                  )}
                </g>
              );
            })}

            {mode === "wall" && !winner &&
              wallHints.map((hint) => {
                const rect = wallRect(hint);
                return (
                  <rect
                    key={`hint-${hint.r}-${hint.c}-${hint.o}`}
                    pointerEvents="none"
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx={0.8}
                    fill={hint.valid ? accent : "#ef4444"}
                    opacity={hint.valid ? 0.18 : 0.055}
                  />
                );
              })}

            {walls.map((w) => {
              const rect = wallRect(w);
              return (
                <g key={w.id} className="gl-pop" pointerEvents="none">
                  <rect
                    x={rect.x}
                    y={rect.y + 0.52}
                    width={rect.w}
                    height={rect.h}
                    rx={0.82}
                    fill="rgba(0,0,0,0.42)"
                  />
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx={0.82}
                    fill={`url(#wall-${w.by})`}
                    stroke="rgba(255,255,255,0.36)"
                    strokeWidth={0.17}
                  />
                  <rect
                    x={rect.x + 0.35}
                    y={rect.y + 0.25}
                    width={Math.max(0, rect.w - 0.7)}
                    height={Math.max(0, rect.h * 0.33)}
                    rx={0.5}
                    fill="rgba(255,255,255,0.24)"
                  />
                </g>
              );
            })}

            {preview && (() => {
              const rect = wallRect(preview);
              return (
                <g pointerEvents="none">
                  <rect
                    x={rect.x - 0.62}
                    y={rect.y - 0.62}
                    width={rect.w + 1.24}
                    height={rect.h + 1.24}
                    rx={1.08}
                    fill={preview.valid ? accent : "#ef4444"}
                    opacity={0.16}
                  />
                  <rect
                    x={rect.x - 0.26}
                    y={rect.y - 0.26}
                    width={rect.w + 0.52}
                    height={rect.h + 0.52}
                    rx={0.96}
                    fill="none"
                    stroke={preview.valid ? "rgba(255,255,255,0.86)" : "#fecaca"}
                    strokeWidth={0.42}
                  />
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx={0.86}
                    fill={preview.valid ? `url(#wall-${turn})` : "#ef4444"}
                    opacity={preview.valid ? 0.98 : 0.76}
                  />
                </g>
              );
            })()}

            <Pawn player="p1" pos={p1} active={turn === "p1" && !winner} />
            <Pawn player="p2" pos={p2} active={turn === "p2" && !winner} />
          </svg>

          {mode === "wall" && !winner && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
              <div
                className="rounded-full border px-3 py-1.5 text-center text-[10px] font-black text-white/78 shadow-[0_10px_28px_rgba(0,0,0,.35)]"
                style={{ borderColor: `${accent}48`, background: "rgba(2,6,23,0.72)" }}
              >
                {orient === "h" ? "Горизонтальная" : "Вертикальная"} стена · тап по подсветке
              </div>
            </div>
          )}

          {notice && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div
                className="gl-card-in max-w-full rounded-2xl border px-3 py-2 text-center text-[11px] font-black shadow-[0_12px_36px_rgba(0,0,0,.38)]"
                style={{
                  borderColor:
                    notice.kind === "error"
                      ? "rgba(252,165,165,.32)"
                      : notice.kind === "success"
                        ? "rgba(134,239,172,.32)"
                        : "rgba(255,255,255,.12)",
                  background:
                    notice.kind === "error"
                      ? "rgba(239,68,68,.22)"
                      : notice.kind === "success"
                        ? "rgba(34,197,94,.18)"
                        : "rgba(2,6,23,.72)",
                  color: notice.kind === "error" ? "#fee2e2" : notice.kind === "success" ? "#dcfce7" : "rgba(255,255,255,.82)",
                }}
              >
                {notice.text}
              </div>
            </div>
          )}

          {winner && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/58 p-6">
              <div className="gl-card-in w-full max-w-[330px] overflow-hidden rounded-[30px] border border-white/12 bg-[#0e1625] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,.62)]">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl text-4xl" style={{ background: `${CFG[winner].main}24` }}>
                  🏆
                </div>
                <div className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-white/38">Игра окончена</div>
                <div className="mt-2 text-3xl font-black leading-tight" style={{ color: CFG[winner].text }}>
                  {CFG[winner].name}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/52">добрался до края поля</div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={undo}
                    className="gl-tap rounded-2xl border border-white/10 bg-white/[0.055] py-3 text-xs font-black uppercase tracking-[0.12em] text-white/68"
                    type="button"
                  >
                    Назад
                  </button>
                  <button
                    onClick={restart}
                    className="gl-tap rounded-2xl py-3 text-xs font-black uppercase tracking-[0.12em]"
                    style={{ background: `linear-gradient(180deg, ${CFG[winner].light}, ${CFG[winner].main})`, color: CFG[winner].ink }}
                    type="button"
                  >
                    Снова
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer
        className="relative z-10 px-2 pb-2"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <div className="grid grid-cols-[1fr_1fr_64px] gap-2">
          <ModeButton
            label="Ход"
            sub="по точкам"
            icon={<span className="text-lg leading-none">✦</span>}
            active={mode === "move"}
            accent={accent}
            disabled={!!winner}
            onClick={() => selectMode("move")}
          />

          <ModeButton
            label={`Стена · ${turnWallsLeft}`}
            sub={orient === "h" ? "горизонтальная" : "вертикальная"}
            icon={<WallMiniIcon orient={orient} color={mode === "wall" ? accent : "rgba(255,255,255,.56)"} />}
            active={mode === "wall"}
            accent={accent}
            disabled={!!winner || turnWallsLeft <= 0}
            onClick={() => selectMode("wall")}
          />

          <button
            onClick={rotate}
            disabled={!!winner || mode !== "wall"}
            className="gl-tap flex h-[58px] flex-col items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.055] text-white/75 shadow-[0_10px_30px_rgba(0,0,0,.16)] disabled:opacity-35"
            title="Повернуть стену"
            type="button"
          >
            <span className="text-xl leading-none">↻</span>
            <span className="mt-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/42">поворот</span>
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <OrientationButton
            orient="h"
            current={orient}
            disabled={!!winner || mode !== "wall"}
            accent={accent}
            onClick={() => {
              if (mode !== "wall" || winner) return;
              haptic("light");
              setOrient("h");
              setPreview(null);
            }}
          />
          <OrientationButton
            orient="v"
            current={orient}
            disabled={!!winner || mode !== "wall"}
            accent={accent}
            onClick={() => {
              if (mode !== "wall" || winner) return;
              haptic("light");
              setOrient("v");
              setPreview(null);
            }}
          />
        </div>
      </footer>
    </div>
  );
};

const PlayerCard = ({
  player,
  count,
  active,
  pos,
}: {
  player: PlayerId;
  count: number;
  active: boolean;
  pos: "left" | "right";
}) => {
  const cfg = CFG[player];

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-[20px] border px-2.5 py-2 shadow-[0_12px_32px_rgba(0,0,0,.18)] transition-opacity"
      style={{
        flexDirection: pos === "right" ? "row-reverse" : "row",
        background: active ? `${cfg.main}1f` : "rgba(255,255,255,.045)",
        borderColor: active ? `${cfg.main}66` : "rgba(255,255,255,.09)",
        opacity: active ? 1 : 0.64,
      }}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl text-[11px] font-black"
        style={{ background: `linear-gradient(180deg, ${cfg.light}, ${cfg.main})`, color: cfg.ink }}
      >
        {cfg.short}
      </div>
      <div className="min-w-0" style={{ textAlign: pos === "right" ? "right" : "left" }}>
        <div className="truncate text-[12px] font-black leading-none" style={{ color: cfg.text }}>
          {cfg.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/38" style={{ justifyContent: pos === "right" ? "flex-end" : "flex-start" }}>
          <span>{cfg.arrow}</span>
          <span>{count} стен</span>
        </div>
      </div>
    </div>
  );
};

const WallMiniIcon = ({ orient, color }: { orient: Orientation; color: string }) => (
  <span className="relative grid h-7 w-8 place-items-center" aria-hidden="true">
    <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-[4px] bg-white/10" />
    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-[4px] bg-white/10" />
    <span className="absolute bottom-1 left-1 h-2.5 w-2.5 rounded-[4px] bg-white/10" />
    <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-[4px] bg-white/10" />
    <span
      className="absolute rounded-full"
      style={
        orient === "h"
          ? { width: 27, height: 3.4, background: color, boxShadow: `0 0 10px ${color}` }
          : { width: 3.4, height: 27, background: color, boxShadow: `0 0 10px ${color}` }
      }
    />
  </span>
);

const ModeButton = ({
  label,
  sub,
  icon,
  active,
  accent,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  active: boolean;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="gl-tap flex h-[58px] items-center justify-center gap-2 rounded-[22px] border px-2 text-left shadow-[0_10px_30px_rgba(0,0,0,.16)] disabled:opacity-35"
    style={{
      borderColor: active ? `${accent}aa` : "rgba(255,255,255,.1)",
      background: active ? `${accent}24` : "rgba(255,255,255,.055)",
      boxShadow: active ? `0 14px 36px ${accent}1f` : "0 10px 30px rgba(0,0,0,.16)",
      color: active ? "#fff" : "rgba(255,255,255,.68)",
    }}
    type="button"
  >
    <span className="shrink-0" style={{ color: active ? accent : "inherit" }}>
      {icon}
    </span>
    <span className="min-w-0 leading-none">
      <span className="block truncate text-[13px] font-black">{label}</span>
      <span className="mt-1 block truncate text-[8px] font-black uppercase tracking-[0.12em] text-white/38">{sub}</span>
    </span>
  </button>
);

const OrientationButton = ({
  orient,
  current,
  disabled,
  accent,
  onClick,
}: {
  orient: Orientation;
  current: Orientation;
  disabled?: boolean;
  accent: string;
  onClick: () => void;
}) => {
  const active = orient === current;
  const label = orient === "h" ? "Горизонтальная" : "Вертикальная";
  const sub = orient === "h" ? "перекрывает движение вверх/вниз" : "перекрывает движение влево/вправо";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="gl-tap flex h-[42px] items-center justify-center gap-2 rounded-2xl border px-2 disabled:opacity-35"
      style={{
        borderColor: active ? `${accent}88` : "rgba(255,255,255,.08)",
        background: active ? `${accent}1c` : "rgba(255,255,255,.04)",
        color: active ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.48)",
      }}
      type="button"
    >
      <WallMiniIcon orient={orient} color={active ? accent : "rgba(255,255,255,.38)"} />
      <span className="min-w-0 text-left leading-none">
        <span className="block truncate text-[11px] font-black">{label}</span>
        <span className="mt-1 block truncate text-[8px] font-bold text-white/32">{sub}</span>
      </span>
    </button>
  );
};

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
