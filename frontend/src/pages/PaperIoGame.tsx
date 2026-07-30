import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  paperIoWsApi,
  type PaperIoSocketClient,
  type PaperIoStateMessage,
} from '../api/paperIoWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { PremiumGameResultModal } from '../components/Game/PremiumGameResultModal';
import { getTelegramWebApp } from '../types/telegram';

const GRID = 64;
const N = GRID * GRID;
const TICK_MS = 78;
const VISIBLE_CELLS = 19;
const DURATION = 90_000;

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
type Dir = 0 | 1 | 2 | 3;

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';
type Phase = 'ready' | 'playing' | 'over';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

type PlayerProfile = {
  id: number;
  nickname: string;
  photoUrl: string;
  initials: string;
};

const COLORS = {
  bg: '#050610',
  grid: 'rgba(255,255,255,0.045)',
};

interface Player {
  id: 1 | 2;
  userId: number;
  fill: string;
  edge: string;
  trail: string;
  head: string;
  x: number;
  y: number;
  px: number;
  py: number;
  dir: Dir;
  nextDir: Dir;
  trailCells: number[];
  alive: boolean;
  kills: number;
}

interface Game {
  terr: Uint8Array;
  trailGrid: Uint8Array;
  players: [Player, Player];
  running: boolean;
  over: boolean;
  flash: number;
  worldDirty: boolean;
  snapshotAt: number;
  tickMs: number;
}

const PLAYERS_STORAGE_KEY = 'twingames_paper_io_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';

const idx = (x: number, y: number) => y * GRID + x;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeDir = (value: number): Dir => {
  const integer = Math.trunc(value);
  return (integer >= 0 && integer <= 3 ? integer : 0) as Dir;
};

const getInitials = (name: string) => {
  const clean = name.replace('@', '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  const result = parts.map((part) => part[0]).join('').toUpperCase();
  return result || 'TG';
};

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === 'undefined') return [];

  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => ({
        id: Number(item.id),
        tg_user: typeof item.tg_user === 'string' ? item.tg_user : '',
        photo_url: typeof item.photo_url === 'string' ? item.photo_url : '',
      }))
      .filter((item) => Number.isFinite(item.id));
  } catch {
    return [];
  }
};

const makePlayer = (
  id: 1 | 2,
  fill: string,
  edge: string,
  trail: string,
  head: string,
  x: number,
  y: number,
  dir: Dir,
): Player => ({
  id,
  userId: 0,
  fill,
  edge,
  trail,
  head,
  x,
  y,
  px: x,
  py: y,
  dir,
  nextDir: dir,
  trailCells: [],
  alive: true,
  kills: 0,
});

const createVisualGame = (): Game => ({
  terr: new Uint8Array(N),
  trailGrid: new Uint8Array(N),
  players: [
    makePlayer(
      1,
      'rgba(84,242,168,0.20)',
      '#54F2A8',
      'rgba(84,242,168,0.55)',
      '#7CFFC6',
      16,
      46,
      0,
    ),
    makePlayer(
      2,
      'rgba(255,94,138,0.20)',
      '#FF5E8A',
      'rgba(255,94,138,0.55)',
      '#FF89AC',
      48,
      18,
      2,
    ),
  ],
  running: false,
  over: false,
  flash: 0,
  worldDirty: true,
  snapshotAt: performance.now(),
  tickMs: TICK_MS,
});

const decodeBase64Bytes = (value: string | undefined, expectedLength: number) => {
  if (!value) return null;

  try {
    const raw = window.atob(value);
    if (raw.length !== expectedLength) return null;

    const result = new Uint8Array(expectedLength);
    for (let index = 0; index < raw.length; index += 1) {
      result[index] = raw.charCodeAt(index);
    }
    return result;
  } catch {
    return null;
  }
};

const rebuildTrailCells = (game: Game) => {
  const p1: number[] = [];
  const p2: number[] = [];

  for (let index = 0; index < game.trailGrid.length; index += 1) {
    const owner = game.trailGrid[index];
    if (owner === 1) p1.push(index);
    else if (owner === 2) p2.push(index);
  }

  game.players[0].trailCells = p1;
  game.players[1].trailCells = p2;
};

const applyServerState = (game: Game, state: PaperIoStateMessage) => {
  let territoryChanged = false;

  if (state.full) {
    const territory = decodeBase64Bytes(state.territory_b64, N);
    const trail = decodeBase64Bytes(state.trail_b64, N);

    if (territory) {
      game.terr = territory;
      territoryChanged = true;
    }
    if (trail) game.trailGrid = trail;
  }

  for (const patch of state.territory_patch) {
    if (patch.i >= 0 && patch.i < N) {
      game.terr[patch.i] = patch.v;
      territoryChanged = true;
    }
  }

  for (const patch of state.trail_patch) {
    if (patch.i >= 0 && patch.i < N) {
      game.trailGrid[patch.i] = patch.v;
    }
  }

  const updatePlayer = (slot: '1' | '2', target: Player) => {
    const source = state.players[slot];
    if (!source) return;

    const wasAlive = target.alive;
    target.userId = source.user_id;
    target.px = source.px;
    target.py = source.py;
    target.x = source.x;
    target.y = source.y;
    target.dir = normalizeDir(source.dir);
    target.nextDir = normalizeDir(source.next_dir);
    target.alive = source.alive;
    target.kills = source.kills;

    if (wasAlive && !target.alive) {
      game.flash = 1;
    }
  };

  updatePlayer('1', game.players[0]);
  updatePlayer('2', game.players[1]);
  rebuildTrailCells(game);

  game.running = state.phase === 'playing';
  game.over = state.phase === 'match_over';
  game.tickMs = Math.max(1, state.tick_ms || TICK_MS);
  game.snapshotAt = performance.now();

  if (territoryChanged) game.worldDirty = true;
};

function buildWorld(
  game: Game,
  store: { canvas: HTMLCanvasElement | null; cs: number },
  cs: number,
) {
  let worldCanvas = store.canvas;
  if (!worldCanvas) {
    worldCanvas = document.createElement('canvas');
    store.canvas = worldCanvas;
  }

  const size = GRID * cs;
  if (worldCanvas.width !== size || worldCanvas.height !== size) {
    worldCanvas.width = size;
    worldCanvas.height = size;
  }

  const context = worldCanvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.strokeStyle = COLORS.grid;
  context.lineWidth = 1;
  context.beginPath();

  for (let index = 0; index <= GRID; index += 1) {
    const value = Math.round(index * cs) + 0.5;
    context.moveTo(value, 0);
    context.lineTo(value, size);
    context.moveTo(0, value);
    context.lineTo(size, value);
  }
  context.stroke();

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const owner = game.terr[idx(x, y)];
      if (!owner) continue;
      context.fillStyle = game.players[owner - 1].fill;
      context.fillRect(x * cs, y * cs, cs + 1, cs + 1);
    }
  }

  context.lineWidth = Math.max(2, cs * 0.1);
  context.lineCap = 'round';

  for (const player of game.players) {
    context.strokeStyle = player.edge;
    context.shadowColor = player.edge;
    context.shadowBlur = cs * 0.45;
    context.beginPath();

    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        if (game.terr[idx(x, y)] !== player.id) continue;

        const left = x * cs;
        const top = y * cs;

        if (y === 0 || game.terr[idx(x, y - 1)] !== player.id) {
          context.moveTo(left, top);
          context.lineTo(left + cs, top);
        }
        if (y === GRID - 1 || game.terr[idx(x, y + 1)] !== player.id) {
          context.moveTo(left, top + cs);
          context.lineTo(left + cs, top + cs);
        }
        if (x === 0 || game.terr[idx(x - 1, y)] !== player.id) {
          context.moveTo(left, top);
          context.lineTo(left, top + cs);
        }
        if (x === GRID - 1 || game.terr[idx(x + 1, y)] !== player.id) {
          context.moveTo(left + cs, top);
          context.lineTo(left + cs, top + cs);
        }
      }
    }

    context.stroke();
  }

  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,0.22)';
  context.lineWidth = Math.max(3, cs * 0.16);
  context.shadowColor = 'rgba(120,180,255,0.4)';
  context.shadowBlur = cs * 0.6;
  context.strokeRect(
    context.lineWidth / 2,
    context.lineWidth / 2,
    size - context.lineWidth,
    size - context.lineWidth,
  );
  context.shadowBlur = 0;

  store.cs = cs;
  game.worldDirty = false;
}

export const PaperIoGame = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createVisualGame());
  const rafRef = useRef(0);
  const socketRef = useRef<PaperIoSocketClient | null>(null);
  const serverOffsetRef = useRef(0);
  const stateRef = useRef<PaperIoStateMessage | null>(null);
  const resultHandledRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('ready');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<PaperIoStateMessage | null>(null);
  const [p1pct, setP1pct] = useState(0);
  const [p2pct, setP2pct] = useState(0);
  const [kills, setKills] = useState(0);
  const [didWin, setDidWin] = useState(false);
  const [isDraw, setIsDraw] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [readySent, setReadySent] = useState(false);

  const routeState = (location.state || {}) as LocationState;
  const gameId = routeState.game || 'paper_io';
  const lobbiesPath = `/game/${gameId}/lobbies`;

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      window.sessionStorage.getItem('twingames_paper_io_lobby_id') ||
      ''
    );
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(() => {
    if (routeState.playersInfo?.length) return routeState.playersInfo;
    return readStoredPlayersInfo();
  }, [routeState.playersInfo]);

  const getProfile = useCallback(
    (id: number, fallback: string): PlayerProfile => {
      const lobbyPlayer = playersInfo.find((player) => player.id === id);
      const nickname =
        lobbyPlayer?.tg_user ||
        (id === user?.id ? user?.tg_user : '') ||
        fallback;
      const photoUrl =
        lobbyPlayer?.photo_url ||
        (id === user?.id ? user?.photo_url : '') ||
        '';

      return {
        id,
        nickname,
        photoUrl,
        initials: getInitials(nickname),
      };
    },
    [playersInfo, user?.id, user?.photo_url, user?.tg_user],
  );

  const myUserId = serverState?.players?.['1']?.user_id || user?.id || 0;
  const opponentUserId = serverState?.players?.['2']?.user_id || 0;
  const myProfile = useMemo(
    () => getProfile(myUserId, user?.tg_user || 'Ты'),
    [getProfile, myUserId, user?.tg_user],
  );
  const opponentProfile = useMemo(
    () => getProfile(opponentUserId, 'Соперник'),
    [getProfile, opponentUserId],
  );

  useEffect(() => {
    const telegram = getTelegramWebApp();
    try {
      telegram?.ready?.();
      telegram?.expand?.();
      telegram?.disableVerticalSwipes?.();
    } catch {
      // Telegram API is optional in a normal browser.
    }

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: body.style.overscrollBehavior,
      touchAction: body.style.touchAction,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';

    const preventTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventTouchMove);
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.overscroll;
      body.style.touchAction = previous.touchAction;
      try {
        telegram?.enableVerticalSwipes?.();
      } catch {
        // Telegram API is optional in a normal browser.
      }
    };
  }, []);

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, cell: 24 });
  useEffect(() => {
    const fit = () => {
      const element = wrapRef.current;
      const canvas = canvasRef.current;
      if (!element || !canvas) return;

      const rect = element.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const minSide = Math.min(rect.width, rect.height);
      sizeRef.current = {
        w: rect.width,
        h: rect.height,
        dpr,
        cell: minSide / VISIBLE_CELLS,
      };
    };

    fit();
    const observer = new ResizeObserver(fit);
    if (wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener('resize', fit);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  useEffect(() => {
    if (!lobbyId || !token) return;

    window.sessionStorage.setItem('twingames_paper_io_lobby_id', lobbyId);
    window.sessionStorage.setItem('twingames_active_game', gameId);
    if (playersInfo.length) {
      window.sessionStorage.setItem(
        PLAYERS_STORAGE_KEY,
        JSON.stringify(playersInfo),
      );
    }

    let alive = true;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = paperIoWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (!alive) return;
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => {
          if (!alive) return;
          setConnectionStatus('closed');
        },
        onSocketError: () => {
          if (!alive) return;
          setConnectionStatus('error');
          setSocketError('Ошибка подключения к игре');
        },
        onServerError: (error) => {
          if (!alive) return;
          setSocketError(error.details || error.error);
        },
        onState: (state) => {
          if (!alive) return;

          stateRef.current = state;
          setServerState(state);
          setSocketError(null);
          applyServerState(gameRef.current, state);

          if (state.server_ms) {
            serverOffsetRef.current = Date.now() - state.server_ms;
          }

          setP1pct(Number(state.percent['1'] || 0));
          setP2pct(Number(state.percent['2'] || 0));
          setKills(Number(state.players['1']?.kills || 0));

          if (state.phase === 'playing') {
            setPhase('playing');
          } else if (state.phase === 'match_over') {
            const draw = state.winner_user_id === undefined || state.winner_user_id === 0;
            setIsDraw(draw);
            setDidWin(!draw && state.winner_user_id === state.your_user_id);
            setPhase('over');
          } else {
            setPhase('ready');
          }
        },
      },
    });

    socketRef.current = client;

    return () => {
      alive = false;
      socketRef.current = null;
      client.close();
    };
  }, [gameId, lobbyId, playersInfo, token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = stateRef.current;
      if (!state) return;

      if (state.phase === 'playing' && state.deadline_ms) {
        const estimatedServerNow = Date.now() - serverOffsetRef.current;
        setTimeLeft(Math.max(0, state.deadline_ms - estimatedServerNow));
        return;
      }

      if (state.phase === 'countdown' && state.start_at_ms) {
        const estimatedServerNow = Date.now() - serverOffsetRef.current;
        setTimeLeft(Math.max(0, state.start_at_ms - estimatedServerNow));
        return;
      }

      if (state.phase === 'match_over') setTimeLeft(0);
      else setTimeLeft(state.duration_ms || DURATION);
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase !== 'over' || resultHandledRef.current) return;
    resultHandledRef.current = true;

    void refreshBalance().catch(() => undefined);
    void refreshProfile().catch(() => undefined);

    const timer = window.setTimeout(() => {
      navigate(lobbiesPath, { replace: true });
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [lobbiesPath, navigate, phase, refreshBalance, refreshProfile]);

  const worldRef = useRef<{ canvas: HTMLCanvasElement | null; cs: number }>({
    canvas: null,
    cs: 0,
  });
  const vignetteRef = useRef<{
    gradient: CanvasGradient | null;
    w: number;
    h: number;
  }>({ gradient: null, w: 0, h: 0 });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const game = gameRef.current;
    const { dpr, cell } = sizeRef.current;
    const width = canvas.width;
    const height = canvas.height;
    const cellSize = Math.round(cell * dpr);
    const now = performance.now();
    const progress = game.running
      ? clamp((now - game.snapshotAt) / Math.max(1, game.tickMs), 0, 1)
      : 1;
    const lerp = (from: number, to: number, amount: number) =>
      from + (to - from) * amount;

    context.fillStyle = COLORS.bg;
    context.fillRect(0, 0, width, height);

    const me = game.players[0];
    const interpolatedX = lerp(me.px, me.x, progress);
    const interpolatedY = lerp(me.py, me.y, progress);
    const offsetX = width / 2 - interpolatedX * cellSize;
    const offsetY = height / 2 - interpolatedY * cellSize;
    const screenX = (cellCoordinate: number) => cellCoordinate * cellSize + offsetX;
    const screenY = (cellCoordinate: number) => cellCoordinate * cellSize + offsetY;

    if (
      game.worldDirty ||
      worldRef.current.cs !== cellSize ||
      !worldRef.current.canvas
    ) {
      buildWorld(game, worldRef.current, cellSize);
    }

    if (worldRef.current.canvas) {
      context.drawImage(worldRef.current.canvas, offsetX, offsetY);
    }

    const padding = Math.max(1, cellSize * 0.16);
    for (const player of game.players) {
      if (!player.trailCells.length) continue;

      const headCell = idx(player.x, player.y);
      context.fillStyle = player.trail;

      for (const cellIndex of player.trailCells) {
        if (cellIndex === headCell) continue;
        const x = cellIndex % GRID;
        const y = Math.floor(cellIndex / GRID);
        context.fillRect(
          screenX(x) + padding,
          screenY(y) + padding,
          cellSize - padding * 2,
          cellSize - padding * 2,
        );
      }
    }

    for (const player of game.players) {
      if (!player.alive) continue;

      const headX = lerp(player.px, player.x, progress);
      const headY = lerp(player.py, player.y, progress);
      const x = screenX(headX);
      const y = screenY(headY);
      const pulse = 1 + Math.sin(now / 260) * 0.04;
      const size = cellSize * 0.9 * pulse;
      const inset = (cellSize - size) / 2;
      const centerX = x + cellSize / 2;
      const centerY = y + cellSize / 2;

      context.shadowColor = player.head;
      context.shadowBlur = cellSize * 0.7;
      const gradient = context.createRadialGradient(
        centerX - size * 0.18,
        centerY - size * 0.22,
        size * 0.1,
        centerX,
        centerY,
        size * 0.7,
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.35, player.head);
      gradient.addColorStop(1, player.edge);
      context.fillStyle = gradient;
      roundRect(context, x + inset, y + inset, size, size, size * 0.34);
      context.fill();
      context.shadowBlur = 0;

      context.strokeStyle = 'rgba(255,255,255,0.35)';
      context.lineWidth = Math.max(1, cellSize * 0.04);
      roundRect(context, x + inset, y + inset, size, size, size * 0.34);
      context.stroke();

      context.fillStyle = 'rgba(5,6,16,0.92)';
      const eyeForwardX = DX[player.dir] * size * 0.16;
      const eyeForwardY = DY[player.dir] * size * 0.16;
      const eyeSpacing = size * 0.2;
      const eyeRadius = size * 0.1;
      const perpendicularX = DY[player.dir];
      const perpendicularY = -DX[player.dir];
      dot(
        context,
        centerX + eyeForwardX + perpendicularX * eyeSpacing,
        centerY + eyeForwardY + perpendicularY * eyeSpacing,
        eyeRadius,
      );
      dot(
        context,
        centerX + eyeForwardX - perpendicularX * eyeSpacing,
        centerY + eyeForwardY - perpendicularY * eyeSpacing,
        eyeRadius,
      );
    }

    const vignette = vignetteRef.current;
    if (
      !vignette.gradient ||
      vignette.w !== width ||
      vignette.h !== height
    ) {
      const radius = Math.hypot(width, height) / 2;
      const gradient = context.createRadialGradient(
        width / 2,
        height / 2,
        radius * 0.55,
        width / 2,
        height / 2,
        radius,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
      vignette.gradient = gradient;
      vignette.w = width;
      vignette.h = height;
    }

    context.fillStyle = vignette.gradient || 'rgba(0,0,0,0)';
    context.fillRect(0, 0, width, height);

    if (game.flash > 0.01) {
      context.fillStyle = `rgba(255,255,255,${game.flash * 0.16})`;
      context.fillRect(0, 0, width, height);
      game.flash *= 0.85;
    }
  }, []);

  useEffect(() => {
    const loop = () => {
      render();
      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [render]);

  const joyRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const joyState = useRef({ active: false, bx: 0, by: 0, id: -1 });
  const lastSentDirectionRef = useRef<Dir | null>(null);

  const sendDirection = useCallback((direction: Dir) => {
    const me = gameRef.current.players[0];
    me.nextDir = direction;

    if (lastSentDirectionRef.current === direction) return;
    const sent = socketRef.current?.direction(direction);
    if (sent) {
      lastSentDirectionRef.current = direction;
      setSocketError(null);
    }
  }, []);

  const setDirectionFromVector = useCallback(
    (deltaX: number, deltaY: number) => {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 10) return;

      let direction: Dir;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        direction = deltaX > 0 ? 1 : 3;
      } else {
        direction = deltaY > 0 ? 2 : 0;
      }
      sendDirection(direction);
    },
    [sendDirection],
  );

  const placeJoystick = (x: number, y: number) => {
    const base = joyRef.current;
    if (!base) return;
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.style.opacity = '1';
    if (thumbRef.current) {
      thumbRef.current.style.transform = 'translate(-50%,-50%)';
    }
  };

  const moveJoystickThumb = (deltaX: number, deltaY: number) => {
    const radius = 46;
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > radius ? radius / distance : 1;
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate(calc(-50% + ${deltaX * scale}px), calc(-50% + ${deltaY * scale}px))`;
    }
  };

  const hideJoystick = () => {
    if (joyRef.current) joyRef.current.style.opacity = '0';
    joyState.current.active = false;
    joyState.current.id = -1;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing') return;
    const wrapper = wrapRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    joyState.current = { active: true, bx: x, by: y, id: event.pointerId };
    placeJoystick(x, y);
    moveJoystickThumb(0, 0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const joystick = joyState.current;
    if (!joystick.active || event.pointerId !== joystick.id) return;
    const wrapper = wrapRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const deltaX = event.clientX - rect.left - joystick.bx;
    const deltaY = event.clientY - rect.top - joystick.by;
    moveJoystickThumb(deltaX, deltaY);
    setDirectionFromVector(deltaX, deltaY);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId === joyState.current.id) hideJoystick();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, Dir> = {
        ArrowUp: 0,
        ArrowRight: 1,
        ArrowDown: 2,
        ArrowLeft: 3,
        w: 0,
        d: 1,
        s: 2,
        a: 3,
      };
      const direction = directions[event.key];
      if (direction === undefined || phase !== 'playing') return;
      event.preventDefault();
      sendDirection(direction);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, sendDirection]);

  const start = () => {
    if (connectionStatus !== 'open') {
      setSocketError('Нет подключения к серверу');
      return;
    }
    if (socketRef.current?.ready()) {
      resultHandledRef.current = false;
      setReadySent(true);
      setSocketError(null);
    }
  };

  const countdownSeconds = useMemo(() => {
    if (serverState?.phase !== 'countdown' || !serverState.start_at_ms) return 0;
    const estimatedServerNow = Date.now() - serverOffsetRef.current;
    return Math.max(1, Math.ceil((serverState.start_at_ms - estimatedServerNow) / 1000));
  }, [serverState, timeLeft]);

  if (!lobbyId) {
    return (
      <ConnectionNotice
        title="Нет lobby id"
        subtitle="Открой Paper IO из комнаты лобби."
      />
    );
  }

  if (!token) {
    return (
      <ConnectionNotice
        title="Нет токена"
        subtitle="Telegram-авторизация ещё не завершена."
      />
    );
  }

  return (
    <div className="paperio-root">
      <style>{STYLES}</style>

      <div className="pio-glow1" />
      <div className="pio-glow2" />

      <div className="pio-hud">
        <div className="pio-hud-left">
          <ScorePill tone="you" profile={myProfile} pct={p1pct} active />
          {kills > 0 && <span className="pio-kills">⚔ {kills}</span>}
        </div>

        <TimerPill ms={serverState?.phase === 'countdown' ? DURATION : timeLeft} />

        <ScorePill tone="rival" profile={opponentProfile} pct={p2pct} />
      </div>

      <div
        ref={wrapRef}
        className="pio-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="pio-canvas" />
      </div>

      <div ref={joyRef} className="pio-joy">
        <div ref={thumbRef} className="pio-joy-thumb" />
      </div>

      {phase !== 'playing' && phase !== 'over' && (
        <div className="pio-modal-backdrop">
          <div className="pio-modal-card">
            <div className="pio-modal-icon">
              {serverState?.phase === 'countdown' ? countdownSeconds : '🟩'}
            </div>

            <p className="pio-modal-kicker">Territory Duel</p>
            <h1 className="pio-modal-title">
              {serverState?.phase === 'countdown' ? 'Приготовься' : 'Paper IO'}
            </h1>

            <p className="pio-modal-copy">
              {socketError
                ? socketError
                : serverState?.phase === 'countdown'
                  ? 'Оба игрока готовы. Матч начинается одновременно.'
                  : readySent
                    ? `Ждём, пока ${opponentProfile.nickname} будет готов.`
                    : 'Захватывай территорию, замыкая петли. 90 секунд — кто захватит больше, тот победил. Наступи на след соперника, чтобы сбросить его территорию.'}
            </p>

            {serverState?.phase !== 'countdown' ? (
              <button
                onClick={start}
                className="pio-modal-btn"
                type="button"
                disabled={readySent || connectionStatus !== 'open'}
              >
                {connectionStatus !== 'open'
                  ? 'Подключение...'
                  : readySent
                    ? 'Ждём соперника...'
                    : 'Готов'}
              </button>
            ) : null}

            <div className={`pio-connection pio-connection-${connectionStatus}`}>
              {connectionStatus}
            </div>
          </div>
        </div>
      )}

      {phase === 'over' && (
        <PremiumGameResultModal
          gameTitle="Paper IO"
          resultTitle={isDraw ? 'Ничья' : didWin ? 'Победа' : 'Поражение'}
          players={[
            {
              id: myProfile.id,
              name: myProfile.nickname,
              photoUrl: myProfile.photoUrl,
              score: `${p1pct.toFixed(1)}%`,
            },
            {
              id: opponentProfile.id,
              name: opponentProfile.nickname,
              photoUrl: opponentProfile.photoUrl,
              score: `${p2pct.toFixed(1)}%`,
            },
          ]}
          winnerUserID={
            isDraw ? undefined : didWin ? myProfile.id : opponentProfile.id
          }
          draw={isDraw}
          netResult={
            isDraw
              ? 0
              : didWin
                ? Math.round((Number(window.sessionStorage.getItem('twingames_active_bet')) || 0) * 90) / 100
                : -(Number(window.sessionStorage.getItem('twingames_active_bet')) || 0)
          }
          netLabel="Чистый результат"
          continueLabel="В лобби"
          onContinue={() => navigate(lobbiesPath, { replace: true })}
          theme={{ background: '#071710', accent: '#54f2a8', rival: '#ff7a90' }}
        />
      )}
    </div>
  );
};

function ConnectionNotice({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="paperio-root grid place-items-center p-5 text-center">
      <div className="pio-modal-card">
        <p className="pio-modal-kicker">Paper IO</p>
        <h1 className="pio-modal-title">{title}</h1>
        <p className="pio-modal-copy">{subtitle}</p>
      </div>
    </div>
  );
}

function TimerPill({ ms }: { ms: number }) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const low = total <= 10;

  return (
    <div className={`pio-timer ${low ? 'pio-timer-low' : ''}`}>
      <span className={`pio-timer-value ${low ? 'pio-timer-value-low' : ''}`}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

function ScorePill({
  tone,
  profile,
  pct,
  active,
}: {
  tone: 'you' | 'rival';
  profile: PlayerProfile;
  pct: number;
  active?: boolean;
}) {
  return (
    <div
      className={`pio-score ${active ? `pio-score-active-${tone}` : ''}`}
    >
      <span className={`pio-score-avatar pio-score-avatar-${tone}`}>
        {profile.photoUrl ? (
          <img src={profile.photoUrl} alt="" draggable={false} />
        ) : (
          profile.initials
        )}
      </span>
      <span className="pio-score-copy">
        <span className="pio-score-label">{profile.nickname}</span>
        <span className={`pio-score-value-${tone}`}>{pct.toFixed(1)}%</span>
      </span>
    </div>
  );
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

const STYLES = `
.paperio-root {
  position: relative;
  height: 100%;
  min-height: 100%;
  width: 100%;
  overflow: hidden;
  background: #050610;
  color: #fff;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  overscroll-behavior: none;
  font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.pio-hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  padding-top: max(8px, env(safe-area-inset-top));
  pointer-events: none;
}

.pio-hud-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.pio-kills {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.04em;
}

.pio-stage {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.pio-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.pio-joy {
  position: absolute;
  width: 112px;
  height: 112px;
  margin-left: -56px;
  margin-top: -56px;
  border-radius: 9999px;
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
  z-index: 15;
}

.pio-joy-thumb {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52px;
  height: 52px;
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 30%, #7cffc6, #54f2a8);
  box-shadow: 0 6px 20px rgba(84, 242, 168, 0.45);
}

.pio-modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(5, 6, 16, 0.55);
  backdrop-filter: blur(6px);
}

.pio-modal-card {
  width: 100%;
  max-width: 340px;
  text-align: center;
  border-radius: 32px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  padding: 26px;
  animation: pio-pop 0.25s ease both;
}

.pio-modal-icon {
  margin: 0 auto;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  font-size: 40px;
  font-weight: 950;
  animation: pio-float 3s ease-in-out infinite;
}

.pio-modal-kicker {
  margin-top: 18px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(84, 242, 168, 0.7);
}

.pio-modal-title {
  margin-top: 6px;
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.04em;
}

.pio-modal-copy {
  margin: 12px auto 0;
  max-width: 280px;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

.pio-modal-btn {
  margin-top: 20px;
  width: 100%;
  padding: 15px 20px;
  border-radius: 18px;
  border: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #04130c;
  background: linear-gradient(180deg, #7cffc6, #54f2a8);
  box-shadow: 0 12px 30px rgba(84, 242, 168, 0.4);
}

.pio-modal-btn:disabled {
  cursor: default;
  opacity: 0.5;
  box-shadow: none;
}

.pio-connection {
  margin-top: 12px;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255,255,255,.28);
}

.pio-connection-open { color: rgba(84,242,168,.62); }
.pio-connection-error { color: rgba(255,94,138,.7); }

.pio-timer {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  transition: all 0.2s;
}

.pio-timer-low {
  border-color: rgba(255, 94, 138, 0.5);
  background: rgba(255, 94, 138, 0.12);
}

.pio-timer-value {
  font-size: 13px;
  font-weight: 900;
  color: #fff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.pio-timer-value-low { color: #ff5e8a; }

.pio-score {
  display: flex;
  min-width: 0;
  max-width: 132px;
  align-items: center;
  gap: 7px;
  padding: 4px 8px 4px 4px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
}

.pio-score-active-you { border-color: #54f2a855; }
.pio-score-active-rival { border-color: #ff5e8a55; }

.pio-score-avatar {
  display: grid;
  width: 25px;
  height: 25px;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 9999px;
  border: 1px solid rgba(255,255,255,.2);
  font-size: 8px;
  font-weight: 900;
  color: #07100d;
}

.pio-score-avatar-you { background: #54f2a8; }
.pio-score-avatar-rival { background: #ff5e8a; }
.pio-score-avatar img { width: 100%; height: 100%; object-fit: cover; }

.pio-score-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
}

.pio-score-label {
  display: block;
  max-width: 78px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 8px;
  font-weight: 850;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.01em;
}

.pio-score-value-you,
.pio-score-value-rival {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.pio-score-value-you { color: #54f2a8; }
.pio-score-value-rival { color: #ff5e8a; }

@keyframes pio-pop {
  0% { transform: scale(.92); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes pio-float {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.pio-glow1 {
  position: absolute;
  left: -90px;
  top: 60px;
  width: 280px;
  height: 280px;
  border-radius: 9999px;
  background: rgba(84,242,168,0.14);
  filter: blur(95px);
  pointer-events: none;
}

.pio-glow2 {
  position: absolute;
  right: -90px;
  bottom: 60px;
  width: 280px;
  height: 280px;
  border-radius: 9999px;
  background: rgba(255,94,138,0.12);
  filter: blur(95px);
  pointer-events: none;
}
`;

export default PaperIoGame;
