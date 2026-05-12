import React, { useEffect, useMemo, useRef, useState } from 'react';

type PlayerId = 'p1' | 'p2';
type Orientation = 'h' | 'v';

type Pos = { r: number; c: number };

type Wall = {
  id: string;
  r: number;
  c: number;
  o: Orientation;
  by: PlayerId;
};

type PreviewWall = {
  r: number;
  c: number;
  o: Orientation;
  valid: boolean;
};

type DragState = {
  active: boolean;
  clientX: number;
  clientY: number;
};

type LastAction = {
  id: number;
  player: PlayerId;
  kind: 'step' | 'jump' | 'wall';
  from?: Pos;
  to?: Pos;
};

const BOARD_SIZE = 9;
const WALLS_PER_PLAYER = 10;
const PAD = 5;
const GRID = 90;
const CELL = GRID / BOARD_SIZE;
const WALL_THICK = 2.45;
const WALL_PAD = 0.72;

const playerStart: Record<PlayerId, Pos> = {
  p1: { r: BOARD_SIZE - 1, c: 4 },
  p2: { r: 0, c: 4 },
};

const playerConfig = {
  p1: {
    name: 'Player 1',
    short: 'P1',
    target: 'TOP',
    text: 'text-emerald-200',
    pieceA: '#34d399',
    pieceB: '#059669',
    pieceC: '#bbf7d0',
    glow: 'rgba(52,211,153,0.58)',
    soft: 'rgba(52,211,153,0.13)',
    wallA: '#34d399',
    wallB: '#0f766e',
    ring: 'rgba(52,211,153,0.35)',
  },
  p2: {
    name: 'Player 2',
    short: 'P2',
    target: 'BOTTOM',
    text: 'text-sky-200',
    pieceA: '#60a5fa',
    pieceB: '#2563eb',
    pieceC: '#dbeafe',
    glow: 'rgba(96,165,250,0.62)',
    soft: 'rgba(96,165,250,0.13)',
    wallA: '#60a5fa',
    wallB: '#4f46e5',
    ring: 'rgba(96,165,250,0.34)',
  },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const inBoard = (p: Pos) => p.r >= 0 && p.r < BOARD_SIZE && p.c >= 0 && p.c < BOARD_SIZE;
const keyOf = (p: Pos) => `${p.r},${p.c}`;
const posKey = (a: Pos, b: Pos) => {
  const one = keyOf(a);
  const two = keyOf(b);
  return one < two ? `${one}|${two}` : `${two}|${one}`;
};

const cellCenter = (r: number, c: number) => ({
  x: PAD + c * CELL + CELL / 2,
  y: PAD + r * CELL + CELL / 2,
});

const wallRect = (wall: { r: number; c: number; o: Orientation }) => {
  if (wall.o === 'h') {
    return {
      x: PAD + wall.c * CELL + WALL_PAD,
      y: PAD + (wall.r + 1) * CELL - WALL_THICK / 2,
      width: CELL * 2 - WALL_PAD * 2,
      height: WALL_THICK,
      rx: 0.95,
    };
  }

  return {
    x: PAD + (wall.c + 1) * CELL - WALL_THICK / 2,
    y: PAD + wall.r * CELL + WALL_PAD,
    width: WALL_THICK,
    height: CELL * 2 - WALL_PAD * 2,
    rx: 0.95,
  };
};

const buildBlockedEdges = (walls: Wall[]) => {
  const blocked = new Set<string>();

  for (const wall of walls) {
    if (wall.o === 'h') {
      blocked.add(posKey({ r: wall.r, c: wall.c }, { r: wall.r + 1, c: wall.c }));
      blocked.add(posKey({ r: wall.r, c: wall.c + 1 }, { r: wall.r + 1, c: wall.c + 1 }));
    } else {
      blocked.add(posKey({ r: wall.r, c: wall.c }, { r: wall.r, c: wall.c + 1 }));
      blocked.add(posKey({ r: wall.r + 1, c: wall.c }, { r: wall.r + 1, c: wall.c + 1 }));
    }
  }

  return blocked;
};

const edgeBlocked = (from: Pos, to: Pos, blocked: Set<string>) => blocked.has(posKey(from, to));

const hasPathToGoal = (start: Pos, targetRow: number, walls: Wall[]) => {
  const blocked = buildBlockedEdges(walls);
  const q: Pos[] = [start];
  const seen = new Set<string>([keyOf(start)]);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.r === targetRow) return true;

    const nexts: Pos[] = [
      { r: cur.r - 1, c: cur.c },
      { r: cur.r + 1, c: cur.c },
      { r: cur.r, c: cur.c - 1 },
      { r: cur.r, c: cur.c + 1 },
    ];

    for (const next of nexts) {
      if (!inBoard(next)) continue;
      if (edgeBlocked(cur, next, blocked)) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      q.push(next);
    }
  }

  return false;
};

const isWallPlacementValid = (
  nextWall: { r: number; c: number; o: Orientation },
  walls: Wall[],
  p1: Pos,
  p2: Pos,
) => {
  if (nextWall.r < 0 || nextWall.r > 7 || nextWall.c < 0 || nextWall.c > 7) return false;

  for (const wall of walls) {
    // Не даём стенам накладываться или пересекаться в одной щели.
    if (wall.r === nextWall.r && wall.c === nextWall.c) return false;
  }

  const tempWalls: Wall[] = [
    ...walls,
    {
      id: `${nextWall.o}-${nextWall.r}-${nextWall.c}`,
      r: nextWall.r,
      c: nextWall.c,
      o: nextWall.o,
      by: 'p1',
    },
  ];

  return hasPathToGoal(p1, 0, tempWalls) && hasPathToGoal(p2, BOARD_SIZE - 1, tempWalls);
};

const uniqueMoves = (moves: Pos[]) => {
  const seen = new Set<string>();
  return moves.filter((m) => {
    const key = keyOf(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getLegalMoves = (from: Pos, other: Pos, walls: Wall[]) => {
  const blocked = buildBlockedEdges(walls);
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  const moves: Pos[] = [];

  for (const dir of dirs) {
    const adjacent = { r: from.r + dir.dr, c: from.c + dir.dc };
    if (!inBoard(adjacent)) continue;
    if (edgeBlocked(from, adjacent, blocked)) continue;

    if (!samePos(adjacent, other)) {
      moves.push(adjacent);
      continue;
    }

    // Главное исправление: если фишки стоят рядом, активная фишка может
    // перепрыгнуть через соседнюю на следующую клетку, если за ней нет стены.
    const landing = { r: other.r + dir.dr, c: other.c + dir.dc };
    if (inBoard(landing) && !edgeBlocked(other, landing, blocked)) {
      moves.push(landing);
      continue;
    }

    // На случай стены/края за соперником добавляем боковые обходы вокруг фишки.
    // Это не ломает стартовые линии: по своей стартовой линии можно ходить влево/вправо.
    const sideDirs = dir.dr !== 0
      ? [
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ]
      : [
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
        ];

    for (const side of sideDirs) {
      const diagonal = { r: other.r + side.dr, c: other.c + side.dc };
      if (inBoard(diagonal) && !edgeBlocked(other, diagonal, blocked)) moves.push(diagonal);
    }
  }

  return uniqueMoves(moves);
};

const isJumpMove = (from: Pos, to: Pos) => Math.abs(from.r - to.r) + Math.abs(from.c - to.c) > 1;

const describeTurn = (currentPlayer: PlayerId, winner: PlayerId | null) => {
  if (winner) return `${playerConfig[winner].name} победил`;
  return `${playerConfig[currentPlayer].name} ходит`;
};

const LegoStud = ({ cx, cy, color, opacity = 1 }: { cx: number; cy: number; color: string; opacity?: number }) => (
  <g opacity={opacity}>
    <circle cx={cx} cy={cy + 0.2} r="1.5" fill="rgba(0,0,0,0.22)" />
    <circle cx={cx} cy={cy} r="1.45" fill={color} stroke="rgba(255,255,255,0.22)" strokeWidth="0.18" />
    <ellipse cx={cx - 0.35} cy={cy - 0.45} rx="0.55" ry="0.28" fill="rgba(255,255,255,0.35)" />
  </g>
);

const Pawn = ({
  player,
  pos,
  active,
  lastAction,
}: {
  player: PlayerId;
  pos: Pos;
  active: boolean;
  lastAction: LastAction | null;
}) => {
  const cfg = playerConfig[player];
  const center = cellCenter(pos.r, pos.c);
  const jumping = lastAction?.player === player && lastAction.kind === 'jump';
  const stepping = lastAction?.player === player && lastAction.kind === 'step';

  return (
    <g
      className={`${jumping ? 'gl-pawn-jump' : stepping ? 'gl-pawn-step' : ''}`}
      style={{
        transform: `translate(${center.x}px, ${center.y}px)`,
        transformOrigin: 'center',
        transition: 'transform 310ms cubic-bezier(.18,.9,.2,1.05)',
      }}
    >
      <circle r="7.2" fill={cfg.glow} opacity={active ? 0.72 : 0.38} />
      <ellipse cx="0.9" cy="2.8" rx="4.4" ry="1.7" fill="rgba(0,0,0,0.28)" />

      <g>
        <ellipse cx="0" cy="2.35" rx="3.35" ry="1.3" fill="rgba(0,0,0,0.26)" />
        <path
          d="M -3.35 1.9 C -3.15 5.2 3.15 5.2 3.35 1.9 L 2.55 -2.2 L -2.55 -2.2 Z"
          fill={`url(#pawnBody-${player})`}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.25"
        />
        <ellipse cx="0" cy="-2.25" rx="3.15" ry="1.55" fill={cfg.pieceA} stroke="rgba(255,255,255,0.45)" strokeWidth="0.25" />
        <ellipse cx="-0.7" cy="-2.9" rx="1" ry="0.32" fill="rgba(255,255,255,0.5)" />
        <circle cx="-0.8" cy="-2.2" r="0.22" fill="#08111f" opacity="0.72" />
        <circle cx="0.8" cy="-2.2" r="0.22" fill="#08111f" opacity="0.72" />
        <path d="M -0.7 -1.55 Q 0 -1.25 0.7 -1.55" fill="none" stroke="#08111f" strokeWidth="0.18" opacity="0.55" />
        <circle cx="0" cy="-4.02" r="1.32" fill={cfg.pieceC} stroke="rgba(0,0,0,0.18)" strokeWidth="0.18" />
        <ellipse cx="-0.32" cy="-4.5" rx="0.42" ry="0.18" fill="rgba(255,255,255,0.55)" />
      </g>
    </g>
  );
};

const WallBrick = ({ wall }: { wall: Wall }) => {
  const cfg = playerConfig[wall.by];
  const rect = wallRect(wall);
  const horizontal = wall.o === 'h';
  const studOne = horizontal
    ? { x: rect.x + rect.width * 0.33, y: rect.y + rect.height / 2 }
    : { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.33 };
  const studTwo = horizontal
    ? { x: rect.x + rect.width * 0.67, y: rect.y + rect.height / 2 }
    : { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.67 };

  return (
    <g className="gl-wall-pop" pointerEvents="none">
      <rect
        x={rect.x - 0.34}
        y={rect.y + 0.44}
        width={rect.width + 0.68}
        height={rect.height + 0.54}
        rx={rect.rx}
        fill="rgba(0,0,0,0.32)"
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={rect.rx}
        fill={`url(#wallGrad-${wall.by}-${wall.o})`}
        stroke="rgba(255,255,255,0.38)"
        strokeWidth="0.2"
      />
      <rect
        x={rect.x + 0.18}
        y={rect.y + 0.18}
        width={Math.max(0, rect.width - 0.36)}
        height={Math.max(0, rect.height * 0.35)}
        rx="0.65"
        fill="rgba(255,255,255,0.25)"
      />
      <LegoStud cx={studOne.x} cy={studOne.y} color={cfg.wallA} opacity={0.92} />
      <LegoStud cx={studTwo.x} cy={studTwo.y} color={cfg.wallA} opacity={0.92} />
    </g>
  );
};

export const GridLockGame: React.FC = () => {
  const boardRef = useRef<HTMLDivElement | null>(null);

  const [p1, setP1] = useState<Pos>(playerStart.p1);
  const [p2, setP2] = useState<Pos>(playerStart.p2);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>('p1');
  const [wallsLeft, setWallsLeft] = useState<Record<PlayerId, number>>({
    p1: WALLS_PER_PLAYER,
    p2: WALLS_PER_PLAYER,
  });
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [drag, setDrag] = useState<DragState>({ active: false, clientX: 0, clientY: 0 });
  const [wallOrientation, setWallOrientation] = useState<Orientation>('h');
  const [preview, setPreview] = useState<PreviewWall | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [, setMessage] = useState('');

  const currentPos = currentPlayer === 'p1' ? p1 : p2;
  const otherPos = currentPlayer === 'p1' ? p2 : p1;
  const currentCfg = playerConfig[currentPlayer];

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyTouch = document.body.style.touchAction;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.touchAction = prevBodyTouch;
    };
  }, []);

  const boardCells = useMemo(() => {
    const cells: { r: number; c: number; x: number; y: number }[] = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        cells.push({ r, c, x: PAD + c * CELL, y: PAD + r * CELL });
      }
    }
    return cells;
  }, []);

  const wallSlots = useMemo(() => {
    const slots: { r: number; c: number; o: Orientation }[] = [];
    for (let r = 0; r < BOARD_SIZE - 1; r += 1) {
      for (let c = 0; c < BOARD_SIZE - 1; c += 1) {
        slots.push({ r, c, o: 'h' }, { r, c, o: 'v' });
      }
    }
    return slots;
  }, []);

  const legalMoves = useMemo(() => {
    if (winner) return [] as Pos[];
    return getLegalMoves(currentPos, otherPos, walls);
  }, [currentPos, otherPos, walls, winner]);

  const legalKeys = useMemo(() => new Set(legalMoves.map(keyOf)), [legalMoves]);

  const getBoardPoint = (clientX: number, clientY: number) => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    return { x, y };
  };

  const computePreviewFromPointer = (clientX: number, clientY: number, orientation: Orientation): PreviewWall | null => {
    const point = getBoardPoint(clientX, clientY);
    if (!point) return null;
    if (point.x < PAD || point.x > PAD + GRID || point.y < PAD || point.y > PAD + GRID) return null;

    const slotR = clamp(Math.round((point.y - PAD) / CELL) - 1, 0, BOARD_SIZE - 2);
    const slotC = clamp(Math.round((point.x - PAD) / CELL) - 1, 0, BOARD_SIZE - 2);
    const valid = isWallPlacementValid({ r: slotR, c: slotC, o: orientation }, walls, p1, p2);

    return { r: slotR, c: slotC, o: orientation, valid };
  };

  useEffect(() => {
    if (!drag.active) return;

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      setDrag((prev) => ({ ...prev, clientX: e.clientX, clientY: e.clientY }));
      setPreview(computePreviewFromPointer(e.clientX, e.clientY, wallOrientation));
    };

    const handleUp = (e: PointerEvent) => {
      e.preventDefault();
      const nextPreview = computePreviewFromPointer(e.clientX, e.clientY, wallOrientation);

      if (nextPreview && nextPreview.valid && !winner && wallsLeft[currentPlayer] > 0) {
        const newWall: Wall = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          r: nextPreview.r,
          c: nextPreview.c,
          o: nextPreview.o,
          by: currentPlayer,
        };

        setWalls((prev) => [...prev, newWall]);
        setWallsLeft((prev) => ({ ...prev, [currentPlayer]: prev[currentPlayer] - 1 }));
        setLastAction({ id: Date.now(), player: currentPlayer, kind: 'wall' });
        setMessage(`${playerConfig[currentPlayer].name} поставил стенку`);
        setCurrentPlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
      } else if (nextPreview && !nextPreview.valid) {
        setMessage('Так ставить нельзя: путь должен остаться у обоих игроков');
      }

      setDrag({ active: false, clientX: 0, clientY: 0 });
      setPreview(null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('pointercancel', handleUp, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drag.active, wallOrientation, walls, p1, p2, currentPlayer, wallsLeft, winner]);

  const onCellClick = (r: number, c: number) => {
    if (winner || drag.active) return;
    const next = { r, c };
    const from = currentPlayer === 'p1' ? p1 : p2;
    const other = currentPlayer === 'p1' ? p2 : p1;
    const allowed = getLegalMoves(from, other, walls).some((m) => samePos(m, next));

    if (!allowed) {
      setMessage('Выбери подсвеченную клетку');
      return;
    }

    const jump = isJumpMove(from, next);
    if (currentPlayer === 'p1') {
      setP1(next);
      if (next.r === 0) {
        setWinner('p1');
        setLastAction({ id: Date.now(), player: 'p1', kind: jump ? 'jump' : 'step', from, to: next });
        setMessage('Player 1 дошёл до финиша');
        return;
      }
    } else {
      setP2(next);
      if (next.r === BOARD_SIZE - 1) {
        setWinner('p2');
        setLastAction({ id: Date.now(), player: 'p2', kind: jump ? 'jump' : 'step', from, to: next });
        setMessage('Player 2 дошёл до финиша');
        return;
      }
    }

    setLastAction({ id: Date.now(), player: currentPlayer, kind: jump ? 'jump' : 'step', from, to: next });
    setMessage(jump ? 'Прыжок через фишку!' : 'Ход сделан');
    setCurrentPlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
  };

  const startWallDrag = (e: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (winner || wallsLeft[currentPlayer] <= 0) return;
    e.preventDefault();
    setDrag({ active: true, clientX: e.clientX, clientY: e.clientY });
    setPreview(computePreviewFromPointer(e.clientX, e.clientY, wallOrientation));
    setMessage('Перетащи стенку на щель между клетками');
  };

  const onRotate = () => {
    const next = wallOrientation === 'h' ? 'v' : 'h';
    setWallOrientation(next);
    if (drag.active) setPreview(computePreviewFromPointer(drag.clientX, drag.clientY, next));
  };

  const onRestart = () => {
    setP1(playerStart.p1);
    setP2(playerStart.p2);
    setWalls([]);
    setWallsLeft({ p1: WALLS_PER_PLAYER, p2: WALLS_PER_PLAYER });
    setCurrentPlayer('p1');
    setWinner(null);
    setDrag({ active: false, clientX: 0, clientY: 0 });
    setPreview(null);
    setWallOrientation('h');
    setLastAction(null);
    setMessage('Двигай фишку или ставь стенку');
  };

  return (
    <>
      <style>{`
        @keyframes glPawnJump {
          0% { transform: translate(var(--x,0), var(--y,0)) scale(1); }
          40% { filter: drop-shadow(0 18px 10px rgba(0,0,0,.25)); }
          52% { transform: translate(var(--x,0), var(--y,0)) scale(1.2); }
          100% { transform: translate(var(--x,0), var(--y,0)) scale(1); }
        }
        @keyframes glPawnStep {
          0% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
          45% { filter: drop-shadow(0 0 7px rgba(255,255,255,.35)); }
          100% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
        }
        @keyframes glWallPop {
          0% { transform: scale(.82); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glWinnerCard {
          0% { opacity: 0; transform: translateY(14px) scale(.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .gl-pawn-jump { animation: glPawnStep 430ms ease-out; transform-origin: center; }
        .gl-pawn-step { animation: glPawnStep 360ms ease-out; transform-origin: center; }
        .gl-wall-pop { animation: glWallPop 300ms cubic-bezier(.2,.9,.2,1.2) both; transform-origin: center; }
        .gl-stud-hit { transition: transform 150ms ease, filter 150ms ease; }
        .gl-stud-hit:hover { transform: translateY(-1.5px) scale(1.03); filter: brightness(1.15); }
      `}</style>

      <div
        className="relative h-full min-h-[620px] w-full overflow-hidden touch-none select-none bg-[#20140d] text-white"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,235,190,0.18),transparent_30%),radial-gradient(circle_at_12%_82%,rgba(120,53,15,0.4),transparent_28%),radial-gradient(circle_at_88%_72%,rgba(41,26,16,0.55),transparent_32%),linear-gradient(135deg,#4a2b18,#21140c_48%,#130d08)]" />
        <div className="absolute inset-0 opacity-[0.2] bg-[linear-gradient(90deg,rgba(255,255,255,.04)_0_1px,transparent_1px_72px),linear-gradient(0deg,rgba(0,0,0,.22)_0_2px,transparent_2px_96px)]" />

        <div className="relative z-10 flex h-full flex-col gap-2 px-2 py-2 sm:px-3 sm:py-3">
          <div className="shrink-0 rounded-[22px] border border-white/15 bg-black/28 px-3 py-2 shadow-[0_14px_40px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <button
                onClick={() => window.history.back()}
                className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition active:scale-95"
              >
                Back
              </button>

              <div className="text-center leading-none">
                <div className={`text-sm font-black ${winner ? 'text-yellow-200' : currentCfg.text}`}>{describeTurn(currentPlayer, winner)}</div>
              </div>

              <button
                onClick={onRestart}
                className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition active:scale-95"
              >
                Reset
              </button>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">P1 walls</div>
                <div className="mt-0.5 text-xl font-black leading-none text-emerald-200">{wallsLeft.p1}</div>
              </div>

              <div className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-center shadow-inner">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Goal</div>
                <div className="mt-0.5 text-[11px] font-black text-white/75">{currentCfg.target}</div>
              </div>

              <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-right">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">P2 walls</div>
                <div className="mt-0.5 text-xl font-black leading-none text-sky-200">{wallsLeft.p2}</div>
              </div>
            </div>
          </div>

          <div className="relative flex flex-1 min-h-0 items-center justify-center px-0 py-1 sm:py-2">
            <div className="absolute inset-x-6 bottom-0 top-5 rounded-[42px] bg-black/30 blur-2xl" />

            <div
              ref={boardRef}
              className="relative aspect-square h-full max-h-[min(100%,calc(100vw-16px))] w-full max-w-[min(100%,760px)] overflow-hidden rounded-[38px] border border-amber-100/25 bg-[#3a2212] shadow-[0_34px_100px_rgba(0,0,0,.55),inset_0_2px_0_rgba(255,255,255,.18),inset_0_-8px_22px_rgba(0,0,0,.35)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,.14),transparent_22%),linear-gradient(135deg,#87552c,#4f2d17_48%,#28160c)]" />
              <div className="absolute inset-[4.4%] rounded-[30px] border border-emerald-100/15 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.12),transparent_27%),linear-gradient(180deg,#247a45,#17633a_52%,#0f3f28)] shadow-[inset_0_10px_20px_rgba(255,255,255,.08),inset_0_-24px_36px_rgba(0,0,0,.32),0_8px_0_rgba(0,0,0,.2)]" />

              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                <defs>
                  <linearGradient id="cellPlate" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                    <stop offset="55%" stopColor="rgba(230,255,236,0.08)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
                  </linearGradient>
                  <linearGradient id="cellRim" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
                  </linearGradient>
                  <linearGradient id="wallGrad-p1-h" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6ee7b7" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="wallGrad-p1-v" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#6ee7b7" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="wallGrad-p2-h" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                  <linearGradient id="wallGrad-p2-v" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                  <linearGradient id="pawnBody-p1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#bbf7d0" />
                    <stop offset="45%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <linearGradient id="pawnBody-p2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#dbeafe" />
                    <stop offset="45%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#3730a3" />
                  </linearGradient>
                </defs>

                <rect x="2.8" y="2.8" width="94.4" height="94.4" rx="6.2" fill="rgba(0,0,0,0.15)" />
                <rect x="4" y="4" width="92" height="92" rx="5.2" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.35" />

                <rect x={PAD} y={PAD} width={GRID} height={CELL} fill="rgba(96,165,250,0.1)" />
                <rect x={PAD} y={PAD + CELL * 8} width={GRID} height={CELL} fill="rgba(52,211,153,0.1)" />

                {boardCells.map((cell) => {
                  const legal = legalKeys.has(`${cell.r},${cell.c}`);
                  const occupied = samePos({ r: cell.r, c: cell.c }, p1) || samePos({ r: cell.r, c: cell.c }, p2);
                  const isHomeLine = cell.r === playerStart[currentPlayer].r;
                  return (
                    <g
                      key={`${cell.r}-${cell.c}`}
                      className="gl-stud-hit"
                      onClick={() => onCellClick(cell.r, cell.c)}
                      style={{ cursor: winner ? 'default' : 'pointer' }}
                    >
                      <rect
                        x={cell.x + 0.26}
                        y={cell.y + 0.26}
                        width={CELL - 0.52}
                        height={CELL - 0.52}
                        rx="1.55"
                        fill="url(#cellPlate)"
                        stroke="url(#cellRim)"
                        strokeWidth="0.28"
                      />
                      <circle
                        cx={cell.x + CELL / 2}
                        cy={cell.y + CELL / 2}
                        r="2.12"
                        fill={isHomeLine ? currentCfg.soft : 'rgba(255,255,255,0.055)'}
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="0.18"
                      />
                      <ellipse
                        cx={cell.x + CELL / 2 - 0.35}
                        cy={cell.y + CELL / 2 - 0.65}
                        rx="0.8"
                        ry="0.34"
                        fill="rgba(255,255,255,0.16)"
                      />
                      {legal && !occupied && !drag.active && (
                        <g pointerEvents="none">
                          <circle
                            cx={cell.x + CELL / 2}
                            cy={cell.y + CELL / 2}
                            r="3.05"
                            fill="rgba(255,255,255,0.08)"
                            stroke={currentPlayer === 'p1' ? '#86efac' : '#93c5fd'}
                            strokeWidth="0.38"
                          />
                          <circle
                            cx={cell.x + CELL / 2}
                            cy={cell.y + CELL / 2}
                            r="0.95"
                            fill={currentPlayer === 'p1' ? '#86efac' : '#93c5fd'}
                          />
                        </g>
                      )}
                      <rect
                        x={cell.x + 0.05}
                        y={cell.y + 0.05}
                        width={CELL - 0.1}
                        height={CELL - 0.1}
                        rx="1.7"
                        fill="transparent"
                      />
                    </g>
                  );
                })}

                {wallSlots.map((slot) => {
                  const rect = wallRect(slot);
                  const visible = slot.o === wallOrientation;
                  return (
                    <rect
                      key={`${slot.o}-${slot.r}-${slot.c}`}
                      pointerEvents="none"
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      rx={rect.rx}
                      fill={visible ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)'}
                      opacity={visible ? 0.72 : 0.35}
                    />
                  );
                })}

                {walls.map((wall) => <WallBrick key={wall.id} wall={wall} />)}

                {preview && drag.active && (() => {
                  const rect = wallRect(preview);
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={rect.x - 0.42}
                        y={rect.y - 0.42}
                        width={rect.width + 0.84}
                        height={rect.height + 0.84}
                        rx={rect.rx + 0.3}
                        fill={preview.valid ? currentCfg.glow : 'rgba(239,68,68,0.32)'}
                        opacity="0.55"
                      />
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        rx={rect.rx}
                        fill={preview.valid ? `url(#wallGrad-${currentPlayer}-${preview.o})` : 'rgba(239,68,68,0.82)'}
                        stroke="rgba(255,255,255,0.55)"
                        strokeWidth="0.26"
                      />
                    </g>
                  );
                })()}

                <Pawn player="p1" pos={p1} active={currentPlayer === 'p1' && !winner} lastAction={lastAction} />
                <Pawn player="p2" pos={p2} active={currentPlayer === 'p2' && !winner} lastAction={lastAction} />

                {lastAction?.kind === 'jump' && lastAction.to && (() => {
                  const to = cellCenter(lastAction.to.r, lastAction.to.c);
                  return (
                    <g pointerEvents="none">
                      <path d={`M ${to.x - 3.8} ${to.y} L ${to.x + 3.8} ${to.y} M ${to.x} ${to.y - 3.8} L ${to.x} ${to.y + 3.8}`} stroke="rgba(250,204,21,0.72)" strokeWidth="0.42" strokeLinecap="round" />
                    </g>
                  );
                })()}
              </svg>

              {winner && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/58 p-6 backdrop-blur-md">
                  <div className="relative w-full max-w-[340px] overflow-hidden rounded-[34px] border border-white/15 bg-[linear-gradient(180deg,rgba(37,25,16,.95),rgba(12,9,7,.98))] px-6 py-7 text-center shadow-[0_30px_100px_rgba(0,0,0,.58)]" style={{ animation: 'glWinnerCard 300ms ease-out both' }}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,.18),transparent_32%)]" />
                    <div className="relative">
                      <div className="text-[10px] font-black uppercase tracking-[0.28em] text-yellow-100/45">Finished</div>
                      <div className={`mt-3 text-4xl font-black ${playerConfig[winner].text}`}>{playerConfig[winner].name}</div>
                      <div className="mt-2 text-sm font-semibold text-white/52">добрался до противоположного края</div>
                      <button
                        onClick={onRestart}
                        className="mt-6 w-full rounded-2xl border border-white/15 bg-yellow-300 px-5 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_14px_30px_rgba(250,204,21,.2)] transition active:scale-[.98]"
                      >
                        Play again
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mb-[70px] shrink-0 rounded-[24px] border border-white/12 bg-black/28 p-2.5 shadow-[0_16px_45px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                onPointerDown={startWallDrag}
                disabled={winner !== null || wallsLeft[currentPlayer] <= 0}
                className={`group relative h-[66px] overflow-hidden rounded-[22px] border text-left transition active:scale-[.985] ${
                  winner || wallsLeft[currentPlayer] <= 0
                    ? 'border-white/8 bg-white/5 text-white/30'
                    : 'border-white/12 bg-white/9 text-white hover:bg-white/12'
                }`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,.16),transparent_34%)]" />
                <div className="relative flex h-full items-center justify-between px-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">Drag wall</div>
                    <div className={`mt-1 text-sm font-black ${currentCfg.text}`}>{currentCfg.name} • {wallsLeft[currentPlayer]} left</div>
                  </div>
                  <div className="flex h-12 w-24 items-center justify-center">
                    <div
                      className={wallOrientation === 'h' ? 'h-4 w-20 rounded-lg' : 'h-14 w-4 rounded-lg'}
                      style={{
                        background: `linear-gradient(${wallOrientation === 'h' ? '90deg' : '180deg'}, ${currentCfg.wallA}, ${currentCfg.wallB})`,
                        boxShadow: `0 0 24px ${currentCfg.glow}`,
                        border: '1px solid rgba(255,255,255,.32)',
                      }}
                    >
                      <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-white/35" />
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={onRotate}
                disabled={winner !== null}
                className="h-[66px] w-[74px] rounded-[22px] border border-white/12 bg-white/9 text-3xl font-black text-white/80 transition active:scale-[.96] disabled:text-white/25"
                title="Rotate wall"
              >
                ↻
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
