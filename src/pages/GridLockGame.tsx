import React, { useEffect, useMemo, useRef, useState } from 'react';

type PlayerId = 'p1' | 'p2';
type Orientation = 'h' | 'v';

type Pos = {
  r: number;
  c: number;
};

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

const BOARD_SIZE = 9;
const WALLS_PER_PLAYER = 10;

const PAD = 4;
const GRID = 92;
const CELL = GRID / BOARD_SIZE;
const WALL_THICK = 1.9;
const WALL_PAD = 0.75;

const playerStart = {
  p1: { r: BOARD_SIZE - 1, c: 4 },
  p2: { r: 0, c: 4 },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const posKey = (a: Pos, b: Pos) => {
  const one = `${a.r},${a.c}`;
  const two = `${b.r},${b.c}`;
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
      rx: 0.7,
    };
  }

  return {
    x: PAD + (wall.c + 1) * CELL - WALL_THICK / 2,
    y: PAD + wall.r * CELL + WALL_PAD,
    width: WALL_THICK,
    height: CELL * 2 - WALL_PAD * 2,
    rx: 0.7,
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

const hasPathToGoal = (
  start: Pos,
  targetRow: number,
  walls: Wall[],
  occupied: Pos[],
) => {
  const blocked = buildBlockedEdges(walls);
  const q: Pos[] = [start];
  const seen = new Set<string>([`${start.r},${start.c}`]);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.r === targetRow) return true;

    const nexts = [
      { r: cur.r - 1, c: cur.c },
      { r: cur.r + 1, c: cur.c },
      { r: cur.r, c: cur.c - 1 },
      { r: cur.r, c: cur.c + 1 },
    ];

    for (const next of nexts) {
      if (next.r < 0 || next.r >= BOARD_SIZE || next.c < 0 || next.c >= BOARD_SIZE) continue;
      if (blocked.has(posKey(cur, next))) continue;

      const key = `${next.r},${next.c}`;
      if (seen.has(key)) continue;

      const occ = occupied.find((p) => p.r === next.r && p.c === next.c);
      if (occ && !(next.r === start.r && next.c === start.c)) {
        // reserved for future jump logic
      }

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
    if (wall.r === nextWall.r && wall.c === nextWall.c) return false;
  }

  const tempWalls: Wall[] = [
    ...walls,
    { id: `${nextWall.o}-${nextWall.r}-${nextWall.c}`, r: nextWall.r, c: nextWall.c, o: nextWall.o, by: 'p1' },
  ];

  const p1Path = hasPathToGoal(p1, 0, tempWalls, [p2]);
  const p2Path = hasPathToGoal(p2, BOARD_SIZE - 1, tempWalls, [p1]);

  return p1Path && p2Path;
};

const canMove = (from: Pos, to: Pos, walls: Wall[], other: Pos) => {
  const manhattan = Math.abs(from.r - to.r) + Math.abs(from.c - to.c);
  if (manhattan !== 1) return false;
  if (to.r < 0 || to.r >= BOARD_SIZE || to.c < 0 || to.c >= BOARD_SIZE) return false;
  if (to.r === other.r && to.c === other.c) return false;

  const blocked = buildBlockedEdges(walls);
  if (blocked.has(posKey(from, to))) return false;

  return true;
};

const playerColors = {
  p1: {
    piece: '#34d399',
    glow: 'rgba(52,211,153,0.48)',
    panel: 'text-emerald-300',
    soft: 'rgba(52,211,153,0.12)',
    wallA: '#34d399',
    wallB: '#14b8a6',
    wallShadow: 'rgba(16,185,129,0.3)',
    ring: 'rgba(52,211,153,0.22)',
  },
  p2: {
    piece: '#60a5fa',
    glow: 'rgba(96,165,250,0.5)',
    panel: 'text-sky-300',
    soft: 'rgba(96,165,250,0.12)',
    wallA: '#60a5fa',
    wallB: '#6366f1',
    wallShadow: 'rgba(96,165,250,0.28)',
    ring: 'rgba(96,165,250,0.22)',
  },
};

const TurnBadge = ({ currentPlayer }: { currentPlayer: PlayerId }) => {
  const isP1 = currentPlayer === 'p1';

  return (
    <div
      className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-black border ${
        isP1
          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20'
          : 'bg-sky-500/10 text-sky-300 border-sky-400/20'
      }`}
    >
      {isP1 ? 'Player 1 turn' : 'Player 2 turn'}
    </div>
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

  const [drag, setDrag] = useState<DragState>({
    active: false,
    clientX: 0,
    clientY: 0,
  });
  const [wallOrientation, setWallOrientation] = useState<Orientation>('h');
  const [preview, setPreview] = useState<PreviewWall | null>(null);

  const currentPos = currentPlayer === 'p1' ? p1 : p2;
  const otherPos = currentPlayer === 'p1' ? p2 : p1;

  const currentColor = playerColors[currentPlayer];

  const disableAppGestures = () => {
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
  };

  useEffect(() => {
    return disableAppGestures();
  }, []);

  const getBoardPoint = (clientX: number, clientY: number) => {
    if (!boardRef.current) return null;

    const rect = boardRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    return { x, y };
  };

  const computePreviewFromPointer = (
    clientX: number,
    clientY: number,
    orientation: Orientation,
  ): PreviewWall | null => {
    const point = getBoardPoint(clientX, clientY);
    if (!point) return null;

    if (point.x < PAD || point.x > PAD + GRID || point.y < PAD || point.y > PAD + GRID) {
      return null;
    }

    const slotR = clamp(Math.round((point.y - PAD) / CELL) - 1, 0, 7);
    const slotC = clamp(Math.round((point.x - PAD) / CELL) - 1, 0, 7);

    const valid = isWallPlacementValid(
      { r: slotR, c: slotC, o: orientation },
      walls,
      p1,
      p2,
    );

    return {
      r: slotR,
      c: slotC,
      o: orientation,
      valid,
    };
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

      if (
        nextPreview &&
        nextPreview.valid &&
        !winner &&
        wallsLeft[currentPlayer] > 0
      ) {
        const newWall: Wall = {
          id: `${Date.now()}-${Math.random()}`,
          r: nextPreview.r,
          c: nextPreview.c,
          o: nextPreview.o,
          by: currentPlayer,
        };

        setWalls((prev) => [...prev, newWall]);
        setWallsLeft((prev) => ({
          ...prev,
          [currentPlayer]: prev[currentPlayer] - 1,
        }));
        setCurrentPlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
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

    if (!canMove(from, next, walls, other)) return;

    if (currentPlayer === 'p1') {
      setP1(next);
      if (next.r === 0) {
        setWinner('p1');
        return;
      }
    } else {
      setP2(next);
      if (next.r === BOARD_SIZE - 1) {
        setWinner('p2');
        return;
      }
    }

    setCurrentPlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
  };

  const startWallDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (winner) return;
    if (wallsLeft[currentPlayer] <= 0) return;

    e.preventDefault();

    setDrag({
      active: true,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    setPreview(computePreviewFromPointer(e.clientX, e.clientY, wallOrientation));
  };

  const onRotate = () => {
    const next = wallOrientation === 'h' ? 'v' : 'h';
    setWallOrientation(next);
    if (drag.active) {
      setPreview(computePreviewFromPointer(drag.clientX, drag.clientY, next));
    }
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
  };

  const p1Piece = cellCenter(p1.r, p1.c);
  const p2Piece = cellCenter(p2.r, p2.c);

  const boardCells = useMemo(() => {
    const cells: { r: number; c: number; x: number; y: number }[] = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        cells.push({
          r,
          c,
          x: PAD + c * CELL,
          y: PAD + r * CELL,
        });
      }
    }
    return cells;
  }, []);

  const legalMoves = useMemo(() => {
    if (winner) return [] as Pos[];
    const candidates = [
      { r: currentPos.r - 1, c: currentPos.c },
      { r: currentPos.r + 1, c: currentPos.c },
      { r: currentPos.r, c: currentPos.c - 1 },
      { r: currentPos.r, c: currentPos.c + 1 },
    ];
    return candidates.filter((pos) => canMove(currentPos, pos, walls, otherPos));
  }, [currentPos, otherPos, walls, winner]);

  return (
    <>
      <style>{`
        @keyframes glFadeRise {
          0% { transform: translateY(10px) scale(.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="w-full h-full bg-[#0A0A0F] overflow-hidden touch-none select-none"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="h-full flex flex-col px-2 pt-2 pb-2">
          <div className="shrink-0 rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 shadow-2xl">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <button
                onClick={() => window.history.back()}
                className="px-3 py-1.5 rounded-xl bg-white/8 border border-white/10 text-[10px] uppercase tracking-[0.14em] font-bold text-white/75 active:scale-95 transition"
              >
                Back
              </button>

              <div className="text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold">
                  Grid Lock
                </div>
                <div className={`text-sm font-black mt-1 leading-none ${winner ? 'text-white' : currentColor.panel}`}>
                  {winner
                    ? winner === 'p1'
                      ? 'Player 1 Wins'
                      : 'Player 2 Wins'
                    : currentPlayer === 'p1'
                    ? 'Player 1 Turn'
                    : 'Player 2 Turn'}
                </div>
              </div>

              <button
                onClick={onRestart}
                className="px-3 py-1.5 rounded-xl bg-white/8 border border-white/10 text-[10px] uppercase tracking-[0.14em] font-bold text-white/75 active:scale-95 transition"
              >
                Restart
              </button>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/8 px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">Player 1</div>
                <div className="text-lg font-black text-emerald-300 mt-1 leading-none">
                  {wallsLeft.p1} walls
                </div>
              </div>

              {!winner ? <TurnBadge currentPlayer={currentPlayer} /> : (
                <div className="rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-black border bg-white/10 text-white border-white/10">
                  Match finished
                </div>
              )}

              <div className="rounded-2xl border border-sky-400/15 bg-sky-500/8 px-3 py-2 text-right">
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">Player 2</div>
                <div className="text-lg font-black text-sky-300 mt-1 leading-none">
                  {wallsLeft.p2} walls
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 pt-2 pb-2">
            <div
              ref={boardRef}
              className="relative h-full w-full rounded-[30px] overflow-hidden border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.4)] bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,#1a1730,#121122_50%,#0d0d19)]"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                <defs>
                  <radialGradient id="gl-bg" cx="50%" cy="15%" r="80%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                  </radialGradient>

                  <linearGradient id="cellFill" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.015)" />
                  </linearGradient>

                  <linearGradient id="slotH" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                  </linearGradient>

                  <linearGradient id="slotV" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                  </linearGradient>

                  <radialGradient id="p1glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(52,211,153,0.6)" />
                    <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                  </radialGradient>

                  <radialGradient id="p2glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(96,165,250,0.62)" />
                    <stop offset="100%" stopColor="rgba(96,165,250,0)" />
                  </radialGradient>
                </defs>

                <rect x="0" y="0" width="100" height="100" fill="url(#gl-bg)" />
                <rect x="2.2" y="2.2" width="95.6" height="95.6" rx="6.5" fill="rgba(255,255,255,0.02)" />
                <rect
                  x={PAD}
                  y={PAD}
                  width={GRID}
                  height={GRID}
                  rx="4.2"
                  fill="rgba(12,15,28,0.9)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="0.4"
                />

                <rect x={PAD} y={PAD} width={GRID} height={CELL} fill="rgba(96,165,250,0.07)" />
                <rect x={PAD} y={PAD + CELL * 8} width={GRID} height={CELL} fill="rgba(52,211,153,0.07)" />

                {Array.from({ length: 8 }).map((_, i) => (
                  <g key={`slots-h-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => {
                      const rect = wallRect({ r: i, c: j, o: 'h' });
                      return (
                        <rect
                          key={`h-${i}-${j}`}
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          rx={rect.rx}
                          fill="url(#slotH)"
                          opacity="0.55"
                        />
                      );
                    })}
                  </g>
                ))}

                {Array.from({ length: 8 }).map((_, i) => (
                  <g key={`slots-v-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => {
                      const rect = wallRect({ r: i, c: j, o: 'v' });
                      return (
                        <rect
                          key={`v-${i}-${j}`}
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          rx={rect.rx}
                          fill="url(#slotV)"
                          opacity="0.55"
                        />
                      );
                    })}
                  </g>
                ))}

                {boardCells.map((cell) => {
                  const isLegal = legalMoves.some((m) => m.r === cell.r && m.c === cell.c);

                  return (
                    <g key={`${cell.r}-${cell.c}`}>
                      <rect
                        x={cell.x + 0.2}
                        y={cell.y + 0.2}
                        width={CELL - 0.4}
                        height={CELL - 0.4}
                        rx="1.2"
                        fill="url(#cellFill)"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="0.22"
                        onClick={() => onCellClick(cell.r, cell.c)}
                        style={{ cursor: winner ? 'default' : 'pointer' }}
                      />
                      {isLegal && !drag.active && (
                        <circle
                          cx={cell.x + CELL / 2}
                          cy={cell.y + CELL / 2}
                          r="0.82"
                          fill={currentPlayer === 'p1' ? 'rgba(52,211,153,0.55)' : 'rgba(96,165,250,0.58)'}
                        />
                      )}
                    </g>
                  );
                })}

                {walls.map((wall) => {
                  const rect = wallRect(wall);
                  const color = playerColors[wall.by];

                  return (
                    <g key={wall.id}>
                      <rect
                        x={rect.x - 0.18}
                        y={rect.y - 0.18}
                        width={rect.width + 0.36}
                        height={rect.height + 0.36}
                        rx={rect.rx}
                        fill={color.wallShadow}
                      />
                      <defs>
                        <linearGradient id={`wall-${wall.id}`} x1="0%" y1="0%" x2={wall.o === 'h' ? '100%' : '0%'} y2={wall.o === 'h' ? '0%' : '100%'}>
                          <stop offset="0%" stopColor={color.wallA} />
                          <stop offset="100%" stopColor={color.wallB} />
                        </linearGradient>
                      </defs>
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        rx={rect.rx}
                        fill={`url(#wall-${wall.id})`}
                      />
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        rx={rect.rx}
                        fill="none"
                        stroke="rgba(255,255,255,0.28)"
                        strokeWidth="0.22"
                      />
                    </g>
                  );
                })}

                {preview && drag.active && (() => {
                  const rect = wallRect(preview);
                  const stroke = preview.valid ? 'rgba(255,255,255,0.46)' : 'rgba(255,255,255,0.18)';
                  const fill = preview.valid
                    ? currentPlayer === 'p1'
                      ? 'rgba(52,211,153,0.72)'
                      : 'rgba(96,165,250,0.72)'
                    : 'rgba(239,68,68,0.72)';

                  return (
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      rx={rect.rx}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth="0.24"
                    />
                  );
                })()}

                <g
                  style={{
                    transform: `translate(${p1Piece.x}px, ${p1Piece.y}px)`,
                    transition: 'transform 240ms cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  <circle r="6.4" fill="url(#p1glow)" />
                  <circle r="2.3" fill="#34d399" stroke="rgba(255,255,255,0.4)" strokeWidth="0.28" />
                  <circle cx="-0.72" cy="-0.82" r="0.55" fill="rgba(255,255,255,0.76)" />
                </g>

                <g
                  style={{
                    transform: `translate(${p2Piece.x}px, ${p2Piece.y}px)`,
                    transition: 'transform 240ms cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  <circle r="6.4" fill="url(#p2glow)" />
                  <circle r="2.3" fill="#60a5fa" stroke="rgba(255,255,255,0.4)" strokeWidth="0.28" />
                  <circle cx="-0.72" cy="-0.82" r="0.55" fill="rgba(255,255,255,0.76)" />
                </g>

                {!winner && (
                  <rect
                    x={currentPlayer === 'p1' ? PAD : PAD}
                    y={currentPlayer === 'p1' ? PAD + CELL * 8 : PAD}
                    width={GRID}
                    height={CELL}
                    fill={currentPlayer === 'p1' ? 'rgba(52,211,153,0.04)' : 'rgba(96,165,250,0.04)'}
                  />
                )}
              </svg>

              {winner && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-5">
                  <div
                    className="relative w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,36,0.98),rgba(10,10,23,0.98))] text-center px-6 py-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
                    style={{ animation: 'glFadeRise 320ms ease-out both' }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%)] pointer-events-none" />
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35 font-bold">
                      Match Finished
                    </div>
                    <div className="mt-3 text-4xl font-black text-white">
                      {winner === 'p1' ? 'PLAYER 1' : 'PLAYER 2'}
                    </div>
                    <div className="mt-2 text-sm text-white/55">дошёл до противоположной стороны</div>

                    <button
                      onClick={onRestart}
                      className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(168,85,247,0.22)]"
                    >
                      Play Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 rounded-[24px] bg-black/34 border border-white/10 backdrop-blur-xl p-3 shadow-2xl">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
              <button
                onPointerDown={startWallDrag}
                disabled={winner !== null || wallsLeft[currentPlayer] <= 0}
                className={`relative h-[72px] rounded-[22px] border overflow-hidden ${
                  winner !== null || wallsLeft[currentPlayer] <= 0
                    ? 'bg-white/6 border-white/8 text-white/30'
                    : 'bg-white/8 border-white/12 text-white active:scale-[0.98]'
                }`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%)]" />
                <div className="relative h-full px-4 flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                      Drag Wall
                    </div>
                    <div className={`text-sm font-black mt-1 ${currentColor.panel}`}>
                      {currentPlayer === 'p1' ? 'Player 1' : 'Player 2'} • {wallsLeft[currentPlayer]} left
                    </div>
                  </div>

                  <div className="relative w-[88px] h-[40px] flex items-center justify-center">
                    {wallOrientation === 'h' ? (
                      <div
                        className="w-[70px] h-[10px] rounded-full border border-white/20"
                        style={{
                          background: `linear-gradient(90deg, ${currentColor.wallA}, ${currentColor.wallB})`,
                          boxShadow: `0 0 20px ${currentColor.wallShadow}`,
                        }}
                      />
                    ) : (
                      <div
                        className="w-[10px] h-[70px] rounded-full border border-white/20"
                        style={{
                          background: `linear-gradient(180deg, ${currentColor.wallA}, ${currentColor.wallB})`,
                          boxShadow: `0 0 20px ${currentColor.wallShadow}`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </button>

              <button
                onClick={onRotate}
                disabled={winner !== null}
                className="h-[72px] w-[72px] rounded-[22px] bg-white/8 border border-white/10 text-white font-black text-xl active:scale-[0.98] transition"
                title="Rotate wall"
              >
                ↻
              </button>
            </div>

            <div className="mt-3 text-center text-[11px] text-white/45 font-semibold">
              Тапни по подсвеченной клетке, чтобы сходить. Перетащи стенку на слот поля. Кнопка справа поворачивает стену.
            </div>
          </div>
        </div>
      </div>
    </>
  );
};