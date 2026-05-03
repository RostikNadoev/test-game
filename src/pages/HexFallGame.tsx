import React, { useEffect, useMemo, useRef, useState } from 'react';

type TileStatus = 'alive' | 'breaking' | 'gone';
type GamePhase = 'countdown' | 'jumping' | 'breaking' | 'falling' | 'finished';

type HexTile = {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  status: TileStatus;
};

type Vec2 = {
  x: number;
  y: number;
};

type BreakEffect = {
  id: string;
  x: number;
  y: number;
  colorA: string;
  colorB: string;
};

const ROUND_SECONDS = 5;
const HEX_RADIUS = 3;
const HEX_SIZE = 47;
const PADDING_X = 96;
const PADDING_Y = 96;

const NEIGHBORS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const easeInCubic = (t: number) => t * t * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const hexPoints = (size: number) => {
  const points: string[] = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    points.push(`${Math.cos(angle) * size},${Math.sin(angle) * size}`);
  }

  return points.join(' ');
};

const generateHexLayout = (radius: number) => {
  const raw: Array<{ id: string; q: number; r: number; x: number; y: number }> = [];

  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;

      raw.push({
        id: `${q}:${r}`,
        q,
        r,
        x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
        y: HEX_SIZE * 1.5 * r,
      });
    }
  }

  const minX = Math.min(...raw.map((item) => item.x));
  const maxX = Math.max(...raw.map((item) => item.x));
  const minY = Math.min(...raw.map((item) => item.y));
  const maxY = Math.max(...raw.map((item) => item.y));

  const tiles: HexTile[] = raw.map((item) => ({
    id: item.id,
    q: item.q,
    r: item.r,
    x: item.x - minX + PADDING_X,
    y: item.y - minY + PADDING_Y,
    status: 'alive',
  }));

  return {
    tiles,
    width: maxX - minX + PADDING_X * 2,
    height: maxY - minY + PADDING_Y * 2,
  };
};

const BASE_LAYOUT = generateHexLayout(HEX_RADIUS);
const CENTER_TILE_ID = '0:0';
const CENTER_TILE = BASE_LAYOUT.tiles.find((tile) => tile.id === CENTER_TILE_ID) ?? BASE_LAYOUT.tiles[0];

const HEX_POLYGON = hexPoints(HEX_SIZE);
const HEX_TOP_POLYGON = hexPoints(HEX_SIZE - 7);
const HEX_INNER_POLYGON = hexPoints(HEX_SIZE - 17);

const randomIndex = (length: number) => {
  if (length <= 0) return 0;

  try {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0] % length;
    }
  } catch {
    return Math.floor(Math.random() * length);
  }

  return Math.floor(Math.random() * length);
};

const getRoundTone = (round: number) => {
  if (round <= 4) return 'from-cyan-300 via-sky-400 to-blue-500';
  if (round <= 8) return 'from-fuchsia-300 via-pink-400 to-violet-500';
  return 'from-orange-300 via-rose-400 to-red-500';
};

const getBreakColors = () => {
  const palettes = [
    ['#fb7185', '#f97316'],
    ['#22d3ee', '#3b82f6'],
    ['#c084fc', '#ec4899'],
    ['#facc15', '#fb923c'],
    ['#34d399', '#14b8a6'],
  ];

  const palette = palettes[randomIndex(palettes.length)];

  return {
    colorA: palette[0],
    colorB: palette[1],
  };
};

export const HexFallGame: React.FC = () => {
  const roundTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const actionTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const tilesRef = useRef<HexTile[]>(BASE_LAYOUT.tiles.map((tile) => ({ ...tile })));
  const phaseRef = useRef<GamePhase>('countdown');
  const playerTileIdRef = useRef(CENTER_TILE_ID);
  const selectedTileIdRef = useRef(CENTER_TILE_ID);
  const renderPosRef = useRef<Vec2>({ x: CENTER_TILE.x, y: CENTER_TILE.y });

  const [tiles, setTiles] = useState<HexTile[]>(() => BASE_LAYOUT.tiles.map((tile) => ({ ...tile })));
  const [breakEffects, setBreakEffects] = useState<BreakEffect[]>([]);
  const [phase, setPhase] = useState<GamePhase>('countdown');
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [survivedRounds, setSurvivedRounds] = useState(0);
  const [aliveTiles, setAliveTiles] = useState(BASE_LAYOUT.tiles.length);
  const [playerTileId, setPlayerTileId] = useState(CENTER_TILE_ID);
  const [selectedTileId, setSelectedTileId] = useState(CENTER_TILE_ID);
  const [statusTitle, setStatusTitle] = useState('Choose');
  const [statusText, setStatusText] = useState('Выбери соседний гекс или останься');
  const [showEndCard, setShowEndCard] = useState(false);

  const [renderPos, setRenderPos] = useState<Vec2>({ x: CENTER_TILE.x, y: CENTER_TILE.y });
  const [jumpLift, setJumpLift] = useState(0);
  const [playerOpacity, setPlayerOpacity] = useState(1);
  const [playerScaleX, setPlayerScaleX] = useState(1);
  const [playerScaleY, setPlayerScaleY] = useState(1);
  const [playerRotate, setPlayerRotate] = useState(0);
  const [arenaShake, setArenaShake] = useState(0);

  const setTilesState = (next: HexTile[]) => {
    tilesRef.current = next;
    setTiles(next);
    setAliveTiles(next.filter((tile) => tile.status !== 'gone').length);
  };

  const setPhaseState = (next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const setPlayerTileState = (next: string) => {
    playerTileIdRef.current = next;
    setPlayerTileId(next);
  };

  const setSelectedTileState = (next: string) => {
    selectedTileIdRef.current = next;
    setSelectedTileId(next);
  };

  const setRenderPosition = (next: Vec2) => {
    renderPosRef.current = next;
    setRenderPos(next);
  };

  const cancelAnimation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const clearAllTimers = () => {
    if (roundTimerRef.current !== null) {
      window.clearInterval(roundTimerRef.current);
      roundTimerRef.current = null;
    }

    if (actionTimeoutRef.current !== null) {
      window.clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }

    cancelAnimation();
  };

  const getTileById = (tileId: string, source: HexTile[] = tilesRef.current) =>
    source.find((tile) => tile.id === tileId) ?? null;

  const getAliveNeighborIds = (tileId: string, source: HexTile[] = tilesRef.current) => {
    const tile = getTileById(tileId, source);
    if (!tile || tile.status !== 'alive') return [tileId];

    const allowed = [tileId];

    for (const delta of NEIGHBORS) {
      const neighbor = source.find(
        (item) => item.q === tile.q + delta.q && item.r === tile.r + delta.r,
      );

      if (neighbor?.status === 'alive') {
        allowed.push(neighbor.id);
      }
    }

    return allowed;
  };

  const playableTileIds = useMemo(() => getAliveNeighborIds(playerTileId, tiles), [playerTileId, tiles]);
  const playableSet = useMemo(() => new Set(playableTileIds), [playableTileIds]);

  const addBreakEffect = (tile: HexTile) => {
    const colors = getBreakColors();
    const effectId = `${tile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setBreakEffects((prev) => [
      ...prev,
      {
        id: effectId,
        x: tile.x,
        y: tile.y,
        colorA: colors.colorA,
        colorB: colors.colorB,
      },
    ]);

    window.setTimeout(() => {
      setBreakEffects((prev) => prev.filter((effect) => effect.id !== effectId));
    }, 1050);
  };

  const animateJump = (fromTileId: string, toTileId: string, onDone: () => void) => {
    const fromTile = getTileById(fromTileId);
    const toTile = getTileById(toTileId);

    if (!fromTile || !toTile) {
      onDone();
      return;
    }

    cancelAnimation();
    setPhaseState('jumping');
    setStatusTitle('Jump!');
    setStatusText('Прыжок на выбранную плитку');

    const start = performance.now();
    const duration = fromTileId === toTileId ? 430 : 690;
    const dx = toTile.x - fromTile.x;

    const step = (now: number) => {
      const rawT = clamp((now - start) / duration, 0, 1);

      const moveT = easeInOutCubic(rawT);
      const x = lerp(fromTile.x, toTile.x, moveT);
      const y = lerp(fromTile.y, toTile.y, moveT);

      const liftBase = fromTileId === toTileId ? 18 : 42;
      const lift = Math.sin(rawT * Math.PI) * liftBase;

      const anticipation = rawT < 0.16 ? rawT / 0.16 : 0;
      const landing = rawT > 0.82 ? (rawT - 0.82) / 0.18 : 0;
      const air = Math.sin(rawT * Math.PI);

      const squashX = 1 + anticipation * 0.12 - air * 0.04 + landing * 0.13;
      const squashY = 1 - anticipation * 0.12 + air * 0.08 - landing * 0.1;
      const rotate = clamp(dx / 160, -1, 1) * Math.sin(rawT * Math.PI) * 9;

      setRenderPosition({ x, y });
      setJumpLift(lift);
      setPlayerScaleX(squashX);
      setPlayerScaleY(squashY);
      setPlayerRotate(rotate);

      if (rawT < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      setRenderPosition({ x: toTile.x, y: toTile.y });
      setJumpLift(0);
      setPlayerScaleX(1);
      setPlayerScaleY(1);
      setPlayerRotate(0);
      animationFrameRef.current = null;
      onDone();
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  const animateFall = (onDone: () => void) => {
    cancelAnimation();
    setPhaseState('falling');
    setStatusTitle('Oops!');
    setStatusText('Плитка ушла вниз');

    const startPos = renderPosRef.current;
    const start = performance.now();
    const duration = 820;

    const step = (now: number) => {
      const rawT = clamp((now - start) / duration, 0, 1);
      const fallT = easeInCubic(rawT);
      const wobble = Math.sin(rawT * Math.PI * 8) * (1 - rawT);

      setRenderPosition({
        x: startPos.x + wobble * 8,
        y: startPos.y + fallT * 168,
      });
      setPlayerOpacity(1 - rawT * 0.95);
      setPlayerScaleX(1 - rawT * 0.18);
      setPlayerScaleY(1 - rawT * 0.08);
      setPlayerRotate(wobble * 12 + rawT * 120);
      setArenaShake((1 - rawT) * 8);

      if (rawT < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      setArenaShake(0);
      animationFrameRef.current = null;
      onDone();
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  const finishGame = () => {
    clearAllTimers();
    setPhaseState('finished');
    setStatusTitle('Run over');
    setStatusText('Ты сорвался вниз');

    actionTimeoutRef.current = window.setTimeout(() => {
      setShowEndCard(true);
    }, 360);
  };

  const beginRound = (nextRound: number, currentTileId: string) => {
    clearAllTimers();

    setPhaseState('countdown');
    setRound(nextRound);
    setTimeLeft(ROUND_SECONDS);
    setSelectedTileState(currentTileId);
    setStatusTitle('Choose');
    setStatusText('Тапни соседний гекс или останься');

    roundTimerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => {
            resolveRound();
          }, 0);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  };

  const resolveRound = () => {
    if (phaseRef.current !== 'countdown') return;

    clearAllTimers();

    const currentId = playerTileIdRef.current;
    const allowed = getAliveNeighborIds(currentId);
    const chosenId = selectedTileIdRef.current;
    const destinationId = allowed.includes(chosenId) ? chosenId : currentId;

    animateJump(currentId, destinationId, () => {
      setPlayerTileState(destinationId);
      setSelectedTileState(destinationId);

      const alive = tilesRef.current.filter((tile) => tile.status === 'alive');

      if (alive.length <= 0) {
        finishGame();
        return;
      }

      const breakingTile = alive[randomIndex(alive.length)];

      setPhaseState('breaking');
      setStatusTitle('Break!');
      setStatusText('Случайная плитка ломается');

      addBreakEffect(breakingTile);
      setArenaShake(7);

      setTilesState(
        tilesRef.current.map((tile) =>
          tile.id === breakingTile.id ? { ...tile, status: 'breaking' } : tile,
        ),
      );

      actionTimeoutRef.current = window.setTimeout(() => {
        setArenaShake(0);

        setTilesState(
          tilesRef.current.map((tile) =>
            tile.id === breakingTile.id ? { ...tile, status: 'gone' } : tile,
          ),
        );

        if (breakingTile.id === destinationId) {
          animateFall(() => {
            finishGame();
          });
          return;
        }

        setSurvivedRounds((prev) => prev + 1);

        actionTimeoutRef.current = window.setTimeout(() => {
          beginRound(round + 1, destinationId);
        }, 380);
      }, 820);
    });
  };

  const restart = () => {
    clearAllTimers();

    const freshTiles = BASE_LAYOUT.tiles.map((tile) => ({
      ...tile,
      status: 'alive' as TileStatus,
    }));

    setTilesState(freshTiles);
    setBreakEffects([]);
    setPhaseState('countdown');
    setRound(1);
    setTimeLeft(ROUND_SECONDS);
    setSurvivedRounds(0);
    setAliveTiles(freshTiles.length);
    setPlayerTileState(CENTER_TILE_ID);
    setSelectedTileState(CENTER_TILE_ID);
    setStatusTitle('Choose');
    setStatusText('Выбери соседний гекс или останься');
    setShowEndCard(false);
    setPlayerOpacity(1);
    setPlayerScaleX(1);
    setPlayerScaleY(1);
    setPlayerRotate(0);
    setJumpLift(0);
    setArenaShake(0);
    setRenderPosition({ x: CENTER_TILE.x, y: CENTER_TILE.y });

    beginRound(1, CENTER_TILE_ID);
  };

  useEffect(() => {
    const tg = (window as { Telegram?: { WebApp?: { expand?: () => void; disableVerticalSwipes?: () => void } } })
      .Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyTouch = document.body.style.touchAction;
    const prevBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';

    const preventTouch = (event: TouchEvent) => {
      event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    beginRound(1, CENTER_TILE_ID);

    return () => {
      clearAllTimers();

      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.touchAction = prevBodyTouch;
      document.body.style.userSelect = prevBodyUserSelect;

      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  const onTileClick = (tileId: string) => {
    if (phase !== 'countdown') return;
    if (!playableSet.has(tileId)) return;

    setSelectedTileState(tileId);
    setStatusTitle(tileId === playerTileId ? 'Stay' : 'Locked');
    setStatusText(tileId === playerTileId ? 'Остаёшься на месте' : 'Выбор можно сменить до таймера');
  };

  const timeProgress = clamp((timeLeft / ROUND_SECONDS) * 100, 0, 100);
  const roundTone = getRoundTone(round);
  const dangerMode = timeLeft <= 2 && phase === 'countdown';

  return (
    <>
      <style>{`
        @keyframes hfFloatBlob {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(12px,-16px,0) scale(1.08); }
        }

        @keyframes hfUrgent {
          0%,100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.045); filter: brightness(1.2); }
        }

        @keyframes hfTileIdle {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }

        @keyframes hfTileSelected {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.055); }
        }

        @keyframes hfTileBreak {
          0% { transform: scale(1) rotate(0deg); opacity: 1; }
          25% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          50% { transform: scale(.97) rotate(-2deg); opacity: .95; }
          100% { transform: scale(.86) rotate(4deg); opacity: .68; }
        }

        @keyframes hfBoom {
          0% { opacity: 0; transform: scale(.3); }
          18% { opacity: .95; transform: scale(1.12); }
          100% { opacity: 0; transform: scale(1.7); }
        }

        @keyframes hfShard1 {
          0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(.65); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(-38px,-30px) rotate(-42deg) scale(1.08); }
        }

        @keyframes hfShard2 {
          0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(.65); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(42px,-26px) rotate(38deg) scale(1.05); }
        }

        @keyframes hfShard3 {
          0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(.65); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(-30px,34px) rotate(-28deg) scale(1); }
        }

        @keyframes hfShard4 {
          0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(.65); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate(34px,36px) rotate(35deg) scale(1); }
        }

        @keyframes hfCrack {
          0%,100% { opacity: .55; stroke-width: 2; }
          50% { opacity: 1; stroke-width: 3; }
        }

        @keyframes hfEndIn {
          0% { opacity: 0; transform: translateY(22px) scale(.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes hfPlayerGlow {
          0%,100% { opacity: .52; transform: scale(1); }
          50% { opacity: .9; transform: scale(1.12); }
        }

        @keyframes hfStripeMove {
          0% { background-position: 0 0; }
          100% { background-position: 80px 0; }
        }
      `}</style>

      <div
        className="relative h-full w-full overflow-hidden touch-none select-none bg-[#090b28]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(34,211,238,0.28),transparent_24%),radial-gradient(circle_at_92%_22%,rgba(236,72,153,0.24),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(250,204,21,0.16),transparent_26%),linear-gradient(180deg,#111649_0%,#17103d_48%,#090b28_100%)]" />

        <div className="absolute -left-16 top-12 h-40 w-40 rounded-full bg-cyan-300/24 blur-3xl" style={{ animation: 'hfFloatBlob 5.8s ease-in-out infinite' }} />
        <div className="absolute -right-16 top-48 h-48 w-48 rounded-full bg-pink-400/20 blur-3xl" style={{ animation: 'hfFloatBlob 6.5s ease-in-out infinite reverse' }} />
        <div className="absolute bottom-8 left-1/3 h-44 w-44 rounded-full bg-yellow-300/12 blur-3xl" style={{ animation: 'hfFloatBlob 7s ease-in-out infinite' }} />

        <div className="relative z-10 flex h-full flex-col px-3 py-2">
          <div className="shrink-0 overflow-hidden rounded-[30px] border border-white/14 bg-white/[0.075] shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div
              className="h-2 opacity-80"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,rgba(34,211,238,.9) 0 20%,rgba(236,72,153,.9) 20% 40%,rgba(250,204,21,.95) 40% 60%,rgba(59,130,246,.9) 60% 80%,rgba(34,197,94,.9) 80% 100%)',
                backgroundSize: '80px 100%',
                animation: 'hfStripeMove 1.8s linear infinite',
              }}
            />

            <div className="px-3 py-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-3 py-2">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/60">
                    survived
                  </div>
                  <div className="mt-1 flex items-end gap-1.5">
                    <div className="text-3xl font-black leading-none text-cyan-200">{survivedRounds}</div>
                    <div className="pb-0.5 text-[10px] font-bold text-white/42">rnd</div>
                  </div>
                </div>

                <div className="min-w-[116px] text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">
                    Hex Fall
                  </div>
                  <div className={`mt-1 bg-gradient-to-r ${roundTone} bg-clip-text text-2xl font-black leading-none text-transparent`}>
                    R{round}
                  </div>
                  <div className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/42">
                    lucky floor
                  </div>
                </div>

                <div className="rounded-2xl border border-fuchsia-300/18 bg-fuchsia-300/10 px-3 py-2 text-right">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-fuchsia-100/60">
                    alive
                  </div>
                  <div className="mt-1 flex items-end justify-end gap-1.5">
                    <div className="pb-0.5 text-[10px] font-bold text-white/42">tiles</div>
                    <div className="text-3xl font-black leading-none text-fuchsia-200">{aliveTiles}</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-full border border-white/10 bg-black/24">
                <div
                  className={`h-3 rounded-full bg-gradient-to-r ${
                    dangerMode
                      ? 'from-rose-400 via-orange-400 to-yellow-300'
                      : 'from-cyan-300 via-blue-400 to-fuchsia-400'
                  } transition-[width] duration-500`}
                  style={{
                    width: `${timeProgress}%`,
                    boxShadow: dangerMode
                      ? '0 0 22px rgba(251,113,133,.55)'
                      : '0 0 18px rgba(34,211,238,.34)',
                    animation: dangerMode ? 'hfUrgent .72s ease-in-out infinite' : undefined,
                  }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/38">
                    {statusTitle}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-bold text-white/72">{statusText}</div>
                </div>

                <div
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-black ${
                    dangerMode
                      ? 'border-rose-300/30 bg-rose-400/18 text-rose-100'
                      : 'border-white/12 bg-white/10 text-white'
                  }`}
                  style={{ animation: dangerMode ? 'hfUrgent .72s ease-in-out infinite' : undefined }}
                >
                  {phase === 'countdown' ? `${timeLeft}s` : phase === 'jumping' ? 'GO' : phase === 'breaking' ? '!' : '×'}
                </div>
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 pt-2 pb-2">
            <div
              className="absolute inset-0 overflow-hidden rounded-[36px] border border-white/12 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_24px_70px_rgba(0,0,0,.22)] backdrop-blur-sm"
              style={{
                transform: `translate(${Math.sin(arenaShake) * arenaShake}px, ${Math.cos(arenaShake) * arenaShake * 0.6}px)`,
              }}
            >
              <div className="absolute inset-x-8 top-6 h-20 rounded-full bg-cyan-200/12 blur-2xl" />
              <div className="absolute -bottom-12 left-8 right-8 h-36 rounded-[100%] bg-black/24 blur-xl" />
              <div
                className="absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg,#fff 25%,transparent 25%,transparent 50%,#fff 50%,#fff 75%,transparent 75%,transparent)',
                  backgroundSize: '38px 38px',
                }}
              />
            </div>

            <div className="relative flex h-full items-center justify-center p-2">
              <svg
                viewBox={`0 0 ${BASE_LAYOUT.width} ${BASE_LAYOUT.height}`}
                className="block h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <filter id="hfSoftShadow" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.28" />
                  </filter>

                  <filter id="hfGlow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feColorMatrix
                      in="blur"
                      type="matrix"
                      values="1 0 0 0 0  0 1 0 0 0.55  0 0 1 0 1  0 0 0 .65 0"
                    />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <linearGradient id="hfTileDefault" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#293a68" />
                    <stop offset="48%" stopColor="#18234d" />
                    <stop offset="100%" stopColor="#0c1432" />
                  </linearGradient>

                  <linearGradient id="hfTilePlayable" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#48f6ff" />
                    <stop offset="45%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>

                  <linearGradient id="hfTileSelected" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="42%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#f472b6" />
                  </linearGradient>

                  <linearGradient id="hfTileBreaking" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="45%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#be123c" />
                  </linearGradient>

                  <linearGradient id="hfPlayerBody" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="32%" stopColor="#82f3ff" />
                    <stop offset="66%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#312e81" />
                  </linearGradient>

                  <linearGradient id="hfPlayerFace" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#dbeafe" />
                  </linearGradient>
                </defs>

                {tiles.map((tile) => {
                  if (tile.status === 'gone') return null;

                  const isPlayable = phase === 'countdown' && tile.status === 'alive' && playableSet.has(tile.id);
                  const isSelected = tile.status === 'alive' && selectedTileId === tile.id;
                  const isCurrent = playerTileId === tile.id;

                  const fill =
                    tile.status === 'breaking'
                      ? 'url(#hfTileBreaking)'
                      : isSelected
                        ? 'url(#hfTileSelected)'
                        : isPlayable
                          ? 'url(#hfTilePlayable)'
                          : 'url(#hfTileDefault)';

                  const opacity = tile.status === 'breaking' ? 0.98 : 1;

                  const tileAnimation =
                    tile.status === 'breaking'
                      ? 'hfTileBreak .78s ease-in-out forwards'
                      : isSelected
                        ? 'hfTileSelected .85s ease-in-out infinite'
                        : isPlayable
                          ? 'hfTileIdle 1.8s ease-in-out infinite'
                          : undefined;

                  return (
                    <g
                      key={tile.id}
                      transform={`translate(${tile.x} ${tile.y})`}
                      onClick={() => onTileClick(tile.id)}
                      opacity={opacity}
                      style={{
                        cursor: isPlayable ? 'pointer' : 'default',
                      }}
                    >
                      <g
                        style={{
                          transformBox: 'fill-box',
                          transformOrigin: 'center',
                          animation: tileAnimation,
                        }}
                      >
                        <ellipse cx="0" cy="18" rx={HEX_SIZE - 6} ry="14" fill="rgba(0,0,0,0.30)" />

                        <polygon
                          points={HEX_POLYGON}
                          fill="rgba(0,0,0,0.28)"
                          transform="translate(0 8)"
                        />

                        <polygon
                          points={HEX_POLYGON}
                          fill={fill}
                          stroke={isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.14)'}
                          strokeWidth={isSelected ? 3.5 : 2}
                          filter={isSelected || isPlayable ? 'url(#hfGlow)' : 'url(#hfSoftShadow)'}
                        />

                        <polygon
                          points={HEX_TOP_POLYGON}
                          fill="rgba(255,255,255,0.15)"
                          stroke="rgba(255,255,255,0.10)"
                          strokeWidth="1"
                        />

                        <polygon points={HEX_INNER_POLYGON} fill="rgba(255,255,255,0.08)" />

                        <path
                          d="M -24 -8 L -6 -18 L 21 -5"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          fill="none"
                        />

                        {isCurrent && tile.status === 'alive' && (
                          <circle
                            cx="0"
                            cy="0"
                            r={HEX_SIZE - 22}
                            fill="none"
                            stroke="rgba(255,255,255,0.5)"
                            strokeWidth="2"
                            strokeDasharray="5 6"
                          />
                        )}

                        {tile.status === 'breaking' && (
                          <g style={{ animation: 'hfCrack .22s ease-in-out infinite' }}>
                            <path d="M -18 -18 L -6 -5 L -20 13" stroke="white" strokeLinecap="round" fill="none" />
                            <path d="M 10 -20 L 2 -3 L 18 9" stroke="white" strokeLinecap="round" fill="none" />
                            <path d="M -26 2 L -8 7 L 6 22" stroke="white" strokeLinecap="round" fill="none" />
                            <path d="M -2 -24 L 1 -9 L 7 1" stroke="white" strokeLinecap="round" fill="none" />
                          </g>
                        )}
                      </g>
                    </g>
                  );
                })}

                {breakEffects.map((effect) => (
                  <g key={effect.id} transform={`translate(${effect.x} ${effect.y})`} style={{ pointerEvents: 'none' }}>
                    <circle
                      cx="0"
                      cy="0"
                      r="19"
                      fill={effect.colorA}
                      opacity="0.35"
                      style={{
                        animation: 'hfBoom .8s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="9"
                      fill="#ffffff"
                      opacity="0.85"
                      style={{
                        animation: 'hfBoom .62s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />

                    <polygon
                      points="-9,-7 5,-13 12,-2 -4,6"
                      fill={effect.colorA}
                      style={{
                        animation: 'hfShard1 .95s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />
                    <polygon
                      points="-6,-3 10,-8 17,4 2,10"
                      fill={effect.colorB}
                      style={{
                        animation: 'hfShard2 .95s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />
                    <polygon
                      points="-13,1 -2,-6 8,11 -7,16"
                      fill="#ffffff"
                      opacity="0.88"
                      style={{
                        animation: 'hfShard3 .95s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />
                    <polygon
                      points="2,2 14,-2 20,12 6,16"
                      fill={effect.colorA}
                      style={{
                        animation: 'hfShard4 .95s ease-out forwards',
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      }}
                    />
                  </g>
                ))}

                <g
                  transform={`translate(${renderPos.x} ${renderPos.y - jumpLift}) rotate(${playerRotate}) scale(${playerScaleX} ${playerScaleY})`}
                  opacity={playerOpacity}
                  style={{
                    pointerEvents: 'none',
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }}
                >
                  <ellipse
                    cx="0"
                    cy="25"
                    rx="22"
                    ry="7"
                    fill="rgba(0,0,0,0.30)"
                    style={{
                      animation: 'hfPlayerGlow 1.5s ease-in-out infinite',
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                    }}
                  />

                  <path
                    d="M -15 15 C -20 0 -14 -24 0 -29 C 14 -24 20 0 15 15 C 13 27 -13 27 -15 15 Z"
                    fill="url(#hfPlayerBody)"
                    stroke="rgba(255,255,255,0.36)"
                    strokeWidth="2"
                    filter="url(#hfSoftShadow)"
                  />

                  <ellipse cx="0" cy="-4" rx="11.5" ry="10" fill="url(#hfPlayerFace)" />
                  <circle cx="-4" cy="-5.5" r="1.7" fill="#111827" />
                  <circle cx="4" cy="-5.5" r="1.7" fill="#111827" />
                  <path d="M -4 -0.6 Q 0 2.6 4 -0.6" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" fill="none" />

                  <path d="M -15 0 Q -25 7 -16 14" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round" fill="none" />
                  <path d="M 15 0 Q 25 7 16 14" stroke="#f472b6" strokeWidth="5" strokeLinecap="round" fill="none" />

                  <path d="M -6 18 Q -11 27 -5 31" stroke="#312e81" strokeWidth="5" strokeLinecap="round" fill="none" />
                  <path d="M 6 18 Q 11 27 5 31" stroke="#312e81" strokeWidth="5" strokeLinecap="round" fill="none" />

                  <ellipse cx="-4" cy="-21" rx="5" ry="2.4" fill="rgba(255,255,255,0.38)" transform="rotate(-12)" />
                  <circle cx="11" cy="-20" r="3.5" fill="#facc15" stroke="rgba(255,255,255,.4)" strokeWidth="1" />
                </g>
              </svg>
            </div>

            {showEndCard && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-5 backdrop-blur-md">
                <div
                  className="w-full max-w-[360px] overflow-hidden rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(29,20,76,0.98),rgba(10,12,41,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
                  style={{ animation: 'hfEndIn .34s ease-out both' }}
                >
                  <div
                    className="h-3"
                    style={{
                      backgroundImage:
                        'linear-gradient(90deg,#22d3ee 0 18%,#ec4899 18% 36%,#facc15 36% 54%,#8b5cf6 54% 72%,#34d399 72% 100%)',
                    }}
                  />

                  <div className="px-6 py-6 text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/42">
                      eliminated
                    </div>

                    <div className="mt-2 text-5xl font-black tracking-tight text-white">
                      HEX DOWN
                    </div>

                    <div className="mt-2 text-sm font-semibold text-white/56">
                      Ты прожил {survivedRounds}{' '}
                      {survivedRounds === 1 ? 'раунд' : survivedRounds > 1 && survivedRounds < 5 ? 'раунда' : 'раундов'}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="rounded-3xl border border-cyan-300/14 bg-cyan-300/10 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                          survived
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-cyan-200">
                          {survivedRounds}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-fuchsia-300/14 bg-fuchsia-300/10 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                          left
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-fuchsia-200">
                          {aliveTiles}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={restart}
                      className="mt-7 w-full rounded-3xl bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_34px_rgba(34,211,238,0.24)] transition active:scale-[0.98]"
                    >
                      Play Again
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default HexFallGame;