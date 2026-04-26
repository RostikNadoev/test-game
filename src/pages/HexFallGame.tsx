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
};

const ROUND_SECONDS = 5;
const HEX_RADIUS = 3;
const HEX_SIZE = 48;
const PADDING_X = 92;
const PADDING_Y = 90;

const NEIGHBORS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const hexPoints = (size: number) => {
  const points: string[] = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    points.push(`${x},${y}`);
  }

  return points.join(' ');
};

const generateHexLayout = (radius: number) => {
  const raw: Array<{ id: string; q: number; r: number; x: number; y: number }> = [];

  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;

      const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
      const y = HEX_SIZE * 1.5 * r;

      raw.push({
        id: `${q}:${r}`,
        q,
        r,
        x,
        y,
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
const CENTER_TILE = BASE_LAYOUT.tiles.find((tile) => tile.id === CENTER_TILE_ID)!;

const HEX_POLYGON = hexPoints(HEX_SIZE);
const HEX_INNER_POLYGON = hexPoints(HEX_SIZE - 8);
const HEX_GLOW_POLYGON = hexPoints(HEX_SIZE - 16);

const toneForRound = (round: number) => {
  if (round < 4) return 'text-cyan-300';
  if (round < 8) return 'text-fuchsia-300';
  return 'text-orange-300';
};

const randomIndex = (length: number) => {
  if (length <= 0) return 0;

  try {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.getRandomValues) {
      const values = new Uint32Array(1);
      cryptoObj.getRandomValues(values);
      return values[0] % length;
    }
  } catch {
    // fallback ниже
  }

  return Math.floor(Math.random() * length);
};

export const HexFallGame: React.FC = () => {
  const roundTimerRef = useRef<number | null>(null);
  const actionTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const tilesRef = useRef<HexTile[]>(BASE_LAYOUT.tiles);
  const phaseRef = useRef<GamePhase>('countdown');
  const playerTileIdRef = useRef(CENTER_TILE_ID);
  const selectedTileIdRef = useRef(CENTER_TILE_ID);
  const renderPosRef = useRef<Vec2>({ x: CENTER_TILE.x, y: CENTER_TILE.y });

  const [tiles, setTiles] = useState<HexTile[]>(BASE_LAYOUT.tiles);
  const [breakEffects, setBreakEffects] = useState<BreakEffect[]>([]);
  const [phase, setPhase] = useState<GamePhase>('countdown');
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [survivedRounds, setSurvivedRounds] = useState(0);
  const [aliveTiles, setAliveTiles] = useState(BASE_LAYOUT.tiles.length);
  const [playerTileId, setPlayerTileId] = useState(CENTER_TILE_ID);
  const [selectedTileId, setSelectedTileId] = useState(CENTER_TILE_ID);
  const [statusTitle, setStatusTitle] = useState('Choose your hex');
  const [statusText, setStatusText] = useState('Тапни по соседней плитке или останься на месте');
  const [showEndCard, setShowEndCard] = useState(false);

  const [renderPos, setRenderPos] = useState<Vec2>({ x: CENTER_TILE.x, y: CENTER_TILE.y });
  const [jumpLift, setJumpLift] = useState(0);
  const [playerOpacity, setPlayerOpacity] = useState(1);
  const [playerScale, setPlayerScale] = useState(1);

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
    if (!tile) return [tileId];

    const allowed = [tileId];

    for (const delta of NEIGHBORS) {
      const neighbor = source.find(
        (item) => item.q === tile.q + delta.q && item.r === tile.r + delta.r,
      );

      if (neighbor && neighbor.status === 'alive') {
        allowed.push(neighbor.id);
      }
    }

    return allowed;
  };

  const playableTileIds = useMemo(() => getAliveNeighborIds(playerTileId, tiles), [playerTileId, tiles]);
  const playableSet = useMemo(() => new Set(playableTileIds), [playableTileIds]);

  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.id === selectedTileId) ?? null,
    [tiles, selectedTileId],
  );

  const playerTile = useMemo(
    () => tiles.find((tile) => tile.id === playerTileId) ?? null,
    [tiles, playerTileId],
  );

  const addBreakEffect = (tile: HexTile) => {
    const effectId = `${tile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setBreakEffects((prev) => [
      ...prev,
      {
        id: effectId,
        x: tile.x,
        y: tile.y,
      },
    ]);

    window.setTimeout(() => {
      setBreakEffects((prev) => prev.filter((effect) => effect.id !== effectId));
    }, 900);
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
    setStatusTitle('Jump');
    setStatusText('Персонаж плавно перепрыгивает на выбранный гекс');

    const start = performance.now();
    const duration = 620;

    const step = (now: number) => {
      const rawT = Math.min(1, (now - start) / duration);
      const moveT = easeInOutCubic(rawT);
      const x = lerp(fromTile.x, toTile.x, moveT);
      const y = lerp(fromTile.y, toTile.y, moveT);

      const lift = Math.sin(rawT * Math.PI) * 28;
      const squash =
        rawT < 0.18
          ? 0.98
          : rawT > 0.82
          ? 1.03
          : 1 + Math.sin(rawT * Math.PI) * 0.04;

      setRenderPosition({ x, y });
      setJumpLift(lift);
      setPlayerScale(squash);

      if (rawT < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      setRenderPosition({ x: toTile.x, y: toTile.y });
      setJumpLift(0);
      setPlayerScale(1);
      animationFrameRef.current = null;
      onDone();
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  const animateFall = (onDone: () => void) => {
    cancelAnimation();
    setPhaseState('falling');
    setStatusTitle('Tile gone');
    setStatusText('Ты провалился вместе с плиткой');

    const startPos = renderPosRef.current;
    const start = performance.now();
    const duration = 640;

    const step = (now: number) => {
      const rawT = Math.min(1, (now - start) / duration);
      const t = easeInCubic(rawT);

      setRenderPosition({ x: startPos.x, y: startPos.y + t * 118 });
      setPlayerOpacity(1 - rawT);
      setPlayerScale(1 - rawT * 0.16);

      if (rawT < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
        return;
      }

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
    }, 420);
  };

  const beginRound = (nextRound: number, currentTileId: string) => {
    clearAllTimers();
    setPhaseState('countdown');
    setRound(nextRound);
    setTimeLeft(ROUND_SECONDS);
    setSelectedTileState(currentTileId);
    setStatusTitle('Choose your hex');
    setStatusText('Доступны только соседние живые плитки');

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

      if (alive.length === 0) {
        finishGame();
        return;
      }

      const breakingTile = alive[randomIndex(alive.length)];

      setPhaseState('breaking');
      setStatusTitle('Breaking');
      setStatusText('Одна из плиток внезапно ломается');

      addBreakEffect(breakingTile);

      setTilesState(
        tilesRef.current.map((tile) =>
          tile.id === breakingTile.id ? { ...tile, status: 'breaking' } : tile,
        ),
      );

      actionTimeoutRef.current = window.setTimeout(() => {
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
        }, 420);
      }, 760);
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
    setStatusTitle('Choose your hex');
    setStatusText('Тапни по соседней плитке или останься на месте');
    setShowEndCard(false);
    setPlayerOpacity(1);
    setPlayerScale(1);
    setJumpLift(0);
    setRenderPosition({ x: CENTER_TILE.x, y: CENTER_TILE.y });

    beginRound(1, CENTER_TILE_ID);
  };

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

    beginRound(1, CENTER_TILE_ID);

    return () => {
      clearAllTimers();
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.touchAction = prevBodyTouch;
    };
  }, []);

  const onTileClick = (tileId: string) => {
    if (phase !== 'countdown') return;
    if (!playableSet.has(tileId)) return;

    setSelectedTileState(tileId);
    setStatusTitle('Choice locked');
    setStatusText('Можно поменять выбор до конца таймера');
  };

  const timeProgress = (timeLeft / ROUND_SECONDS) * 100;

  return (
    <>
      <style>{`
        @keyframes hfPulseUrgent {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: .92; }
        }

        @keyframes hfBreakFlash {
          0% { opacity: 0; transform: scale(.65); }
          18% { opacity: .95; transform: scale(1.08); }
          100% { opacity: 0; transform: scale(1.35); }
        }

        @keyframes hfShardA {
          0% { opacity: 0; transform: translate(0px,0px) rotate(0deg) scale(.7); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(-18px,-16px) rotate(-22deg) scale(1); }
        }

        @keyframes hfShardB {
          0% { opacity: 0; transform: translate(0px,0px) rotate(0deg) scale(.7); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(20px,-12px) rotate(18deg) scale(1); }
        }

        @keyframes hfShardC {
          0% { opacity: 0; transform: translate(0px,0px) rotate(0deg) scale(.7); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(-14px,18px) rotate(-16deg) scale(1); }
        }

        @keyframes hfShardD {
          0% { opacity: 0; transform: translate(0px,0px) rotate(0deg) scale(.7); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(16px,16px) rotate(20deg) scale(1); }
        }

        @keyframes hfCrackPulse {
          0%,100% { opacity: .56; }
          50% { opacity: 1; }
        }

        @keyframes hfGlowPulse {
          0%,100% { opacity: .72; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }

        @keyframes hfEndIn {
          0% { opacity: 0; transform: translateY(18px) scale(.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="w-full h-full overflow-hidden touch-none select-none bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_22%),linear-gradient(180deg,#09121f,#0d1627_46%,#0a1120)]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="h-full flex flex-col px-2 pt-2 pb-1">
          <div className="shrink-0 rounded-[28px] border border-white/10 bg-black/28 backdrop-blur-xl px-3 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="rounded-2xl border border-cyan-400/12 bg-cyan-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                  Survived
                </div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-[28px] font-black text-cyan-300 leading-none">{survivedRounds}</div>
                  <div className="text-xs text-white/35 font-bold pb-0.5">rounds</div>
                </div>
              </div>

              <div className="text-center min-w-[120px]">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold">
                  Hex Fall
                </div>
                <div className="text-lg font-black text-white leading-none mt-1">
                  Round {round}
                </div>
                <div className={`mt-1 text-[10px] uppercase tracking-[0.18em] font-bold ${toneForRound(round)}`}>
                  Solo survival
                </div>
              </div>

              <div className="rounded-2xl border border-fuchsia-400/12 bg-fuchsia-500/10 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                  Alive
                </div>
                <div className="mt-1 flex items-end justify-end gap-2">
                  <div className="text-xs text-white/35 font-bold pb-0.5">tiles</div>
                  <div className="text-[28px] font-black text-fuchsia-300 leading-none">{aliveTiles}</div>
                </div>
              </div>
            </div>

            <div className="mt-2">
              <div className="h-2 rounded-full bg-white/8 overflow-hidden border border-white/8">
                <div
                  className={`h-full transition-[width] duration-500 ${
                    timeLeft <= 2
                      ? 'bg-gradient-to-r from-rose-500 to-orange-500'
                      : 'bg-gradient-to-r from-cyan-400 via-sky-500 to-violet-500'
                  }`}
                  style={{ width: `${timeProgress}%` }}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                  Status
                </div>
                <div className="text-sm font-black text-white mt-1 truncate">{statusTitle}</div>
                <div className="text-[11px] text-white/55 font-semibold mt-1 truncate">{statusText}</div>
              </div>

              <div
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${
                  timeLeft <= 2
                    ? 'bg-rose-500/18 border border-rose-400/18 text-rose-200'
                    : 'bg-white/10 border border-white/10 text-white'
                }`}
                style={timeLeft <= 2 && phase === 'countdown' ? { animation: 'hfPulseUrgent .9s ease-in-out infinite' } : undefined}
              >
                {timeLeft}s
              </div>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 pt-2 pb-1">
            <div className="absolute inset-0 rounded-[34px] border border-white/10 bg-black/18 backdrop-blur-sm overflow-hidden">
              <div className="absolute -left-10 top-8 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="absolute right-0 top-1/3 h-44 w-44 rounded-full bg-violet-400/10 blur-3xl" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />
            </div>

            <div className="relative h-full">
              <div className="absolute inset-0 flex items-center justify-center p-2">
                <div className="relative w-full h-full">
                  <svg
                    viewBox={`0 0 ${BASE_LAYOUT.width} ${BASE_LAYOUT.height}`}
                    className="w-full h-full block"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <linearGradient id="hfBoardGlow" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                      </linearGradient>

                      <radialGradient id="hfShadow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="rgba(0,0,0,0.22)" />
                        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                      </radialGradient>

                      <linearGradient id="hfDefaultGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#2b3b51" />
                        <stop offset="55%" stopColor="#172233" />
                        <stop offset="100%" stopColor="#0f1827" />
                      </linearGradient>

                      <linearGradient id="hfPlayableGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>

                      <linearGradient id="hfSelectedGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#a7f3d0" />
                        <stop offset="45%" stopColor="#67e8f9" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>

                      <linearGradient id="hfBreakingGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fb923c" />
                        <stop offset="52%" stopColor="#f43f5e" />
                        <stop offset="100%" stopColor="#b91c1c" />
                      </linearGradient>

                      <linearGradient id="hfCharBody" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dff7ff" />
                        <stop offset="36%" stopColor="#7be0ff" />
                        <stop offset="100%" stopColor="#335cff" />
                      </linearGradient>
                    </defs>

                    {tiles.map((tile) => {
                      if (tile.status === 'gone') return null;

                      const isPlayable =
                        phase === 'countdown' &&
                        tile.status === 'alive' &&
                        playableSet.has(tile.id);

                      const isSelected = tile.status === 'alive' && selectedTileId === tile.id;
                      const isCurrent = tile.status !== 'gone' && playerTileId === tile.id;

                      const outerFill =
                        tile.status === 'breaking'
                          ? 'url(#hfBreakingGrad)'
                          : isSelected
                          ? 'url(#hfSelectedGrad)'
                          : isPlayable
                          ? 'url(#hfPlayableGrad)'
                          : 'url(#hfDefaultGrad)';

                      return (
                        <g
                          key={tile.id}
                          transform={`translate(${tile.x} ${tile.y})`}
                          onClick={() => onTileClick(tile.id)}
                          style={{ cursor: isPlayable ? 'pointer' : 'default' }}
                        >
                          <ellipse cx="0" cy="13" rx={HEX_SIZE - 9} ry={HEX_SIZE - 18} fill="url(#hfShadow)" />

                          <polygon
                            points={HEX_POLYGON}
                            fill={outerFill}
                            stroke={isSelected ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.10)'}
                            strokeWidth={isSelected ? 3 : 2}
                            style={{
                              filter: isSelected
                                ? 'drop-shadow(0 0 18px rgba(167,243,208,0.42))'
                                : isPlayable
                                ? 'drop-shadow(0 0 14px rgba(34,211,238,0.22))'
                                : 'drop-shadow(0 10px 18px rgba(0,0,0,0.18))',
                            }}
                          />

                          <polygon
                            points={HEX_INNER_POLYGON}
                            fill="rgba(255,255,255,0.10)"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={1}
                          />

                          <polygon
                            points={HEX_GLOW_POLYGON}
                            fill="url(#hfBoardGlow)"
                            opacity={tile.status === 'breaking' ? 0.18 : 0.13}
                          />

                          {tile.status === 'breaking' && (
                            <g style={{ animation: 'hfCrackPulse .44s ease-in-out infinite' }}>
                              <path
                                d="M -14 -14 L -2 -2 L -16 14"
                                stroke="rgba(255,255,255,0.72)"
                                strokeWidth={2.2}
                                strokeLinecap="round"
                                fill="none"
                              />
                              <path
                                d="M 11 -17 L 3 -2 L 16 9"
                                stroke="rgba(255,255,255,0.64)"
                                strokeWidth={1.9}
                                strokeLinecap="round"
                                fill="none"
                              />
                              <path
                                d="M -22 2 L -5 6 L 8 18"
                                stroke="rgba(255,255,255,0.56)"
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                fill="none"
                              />
                              <path
                                d="M -4 -20 L 0 -7 L 4 4"
                                stroke="rgba(255,255,255,0.58)"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                fill="none"
                              />
                            </g>
                          )}

                          {(isPlayable || isCurrent) && tile.status === 'alive' && (
                            <circle
                              cx="0"
                              cy="0"
                              r={HEX_SIZE - 24}
                              fill={isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}
                              stroke={isSelected ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.16)'}
                              strokeWidth={1.4}
                            />
                          )}
                        </g>
                      );
                    })}

                    {breakEffects.map((effect) => (
                      <g
                        key={effect.id}
                        transform={`translate(${effect.x} ${effect.y})`}
                        style={{ pointerEvents: 'none' }}
                      >
                        <circle
                          cx="0"
                          cy="0"
                          r="14"
                          fill="rgba(255,255,255,0.22)"
                          style={{
                            animation: 'hfBreakFlash .7s ease-out forwards',
                            transformBox: 'fill-box',
                            transformOrigin: 'center',
                          }}
                        />

                        <polygon
                          points="-6,-5 4,-9 7,-1 -3,3"
                          fill="rgba(255,255,255,0.85)"
                          style={{
                            animation: 'hfShardA .72s ease-out forwards',
                            transformBox: 'fill-box',
                            transformOrigin: 'center',
                          }}
                        />

                        <polygon
                          points="-4,-2 6,-4 10,3 1,5"
                          fill="rgba(255,255,255,0.78)"
                          style={{
                            animation: 'hfShardB .72s ease-out forwards',
                            transformBox: 'fill-box',
                            transformOrigin: 'center',
                          }}
                        />

                        <polygon
                          points="-8,1 -1,-2 3,7 -5,9"
                          fill="rgba(255,255,255,0.76)"
                          style={{
                            animation: 'hfShardC .72s ease-out forwards',
                            transformBox: 'fill-box',
                            transformOrigin: 'center',
                          }}
                        />

                        <polygon
                          points="2,1 8,-1 12,7 5,9"
                          fill="rgba(255,255,255,0.72)"
                          style={{
                            animation: 'hfShardD .72s ease-out forwards',
                            transformBox: 'fill-box',
                            transformOrigin: 'center',
                          }}
                        />
                      </g>
                    ))}

                    <g
                      transform={`translate(${renderPos.x} ${renderPos.y - jumpLift}) scale(${playerScale})`}
                      opacity={playerOpacity}
                      style={{ pointerEvents: 'none' }}
                    >
                      <ellipse
                        cx="0"
                        cy="18"
                        rx="17"
                        ry="6"
                        fill="rgba(0,0,0,0.28)"
                        style={{ animation: 'hfGlowPulse 1.5s ease-in-out infinite' }}
                      />

                      <g>
                        <path
                          d="M -11 14 C -15 0 -11 -18 0 -22 C 11 -18 15 0 11 14 C 9 22 -9 22 -11 14 Z"
                          fill="url(#hfCharBody)"
                          stroke="rgba(255,255,255,0.18)"
                          strokeWidth="1.8"
                        />

                        <ellipse cx="0" cy="-3" rx="9" ry="8" fill="rgba(255,255,255,0.94)" />

                        <circle cx="-3.2" cy="-4.4" r="1.3" fill="#111827" />
                        <circle cx="3.2" cy="-4.4" r="1.3" fill="#111827" />

                        <path
                          d="M -3 -0.6 Q 0 1.8 3 -0.6"
                          stroke="#111827"
                          strokeWidth="1.4"
                          fill="none"
                          strokeLinecap="round"
                        />

                        <path
                          d="M -12 2 Q -18 8 -12 11"
                          stroke="#7dd3fc"
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          fill="none"
                        />

                        <path
                          d="M 12 2 Q 18 8 12 11"
                          stroke="#7dd3fc"
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          fill="none"
                        />

                        <path
                          d="M -5 17 Q -7 22 -4 25"
                          stroke="#304ffe"
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          fill="none"
                        />

                        <path
                          d="M 5 17 Q 7 22 4 25"
                          stroke="#304ffe"
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          fill="none"
                        />

                        <ellipse cx="0" cy="-15.5" rx="4.4" ry="2.2" fill="rgba(255,255,255,0.30)" />
                      </g>
                    </g>
                  </svg>
                </div>
              </div>

              {showEndCard && (
                <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-md flex items-center justify-center p-5">
                  <div
                    className="w-full max-w-[350px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,18,31,0.96),rgba(20,15,36,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.35)] overflow-hidden"
                    style={{ animation: 'hfEndIn .34s ease-out both' }}
                  >
                    <div className="px-6 pt-6 pb-5 text-center">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40 font-bold">
                        Session ended
                      </div>

                      <div className="mt-3 text-4xl font-black text-white">HEX DOWN</div>

                      <div className="mt-2 text-sm text-white/55">
                        Ты прожил {survivedRounds}{' '}
                        {survivedRounds === 1 ? 'раунд' : survivedRounds < 5 ? 'раунда' : 'раундов'}
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-cyan-500/8 border border-cyan-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            Survived
                          </div>
                          <div className="text-3xl font-black text-cyan-300 mt-2 leading-none">
                            {survivedRounds}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">rounds</div>
                        </div>

                        <div className="rounded-2xl bg-fuchsia-500/8 border border-fuchsia-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            Alive left
                          </div>
                          <div className="text-3xl font-black text-fuchsia-300 mt-2 leading-none">
                            {aliveTiles}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">tiles</div>
                        </div>
                      </div>

                      <button
                        onClick={restart}
                        className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-500 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(34,211,238,0.22)]"
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
      </div>
    </>
  );
};

export default HexFallGame;