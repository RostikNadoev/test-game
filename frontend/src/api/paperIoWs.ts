import { API_BASE_URL } from './client';

export type PaperIoPhase = 'waiting' | 'countdown' | 'playing' | 'match_over';

export type PaperIoCellPatch = {
  i: number;
  v: number;
};

export type PaperIoPlayer = {
  slot: 1 | 2;
  user_id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  dir: number;
  next_dir: number;
  alive: boolean;
  respawn_at_ms?: number;
  kills: number;
};

export type PaperIoStateMessage = {
  type: 'state';
  game: string;
  lobby_id: string;
  phase: PaperIoPhase;
  ready: boolean;
  your_user_id: number;
  server_ms: number;
  start_at_ms: number;
  deadline_ms: number;
  duration_ms: number;
  tick_ms: number;
  tick: number;
  grid_size: number;
  player_order: number[];
  players: Record<string, PaperIoPlayer>;
  percent: Record<string, number>;
  full: boolean;
  territory_b64?: string;
  trail_b64?: string;
  territory_patch: PaperIoCellPatch[];
  trail_patch: PaperIoCellPatch[];
  winner_user_id?: number;
  message?: string;
};

export type PaperIoErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type PaperIoSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  direction: (dir: number) => boolean;
  close: () => void;
};

export type PaperIoSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: PaperIoStateMessage) => void;
  onServerError?: (error: PaperIoErrorMessage) => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePlayer = (value: unknown): PaperIoPlayer => {
  const raw = isObject(value) ? value : {};
  const slot = numberValue(raw.slot, 1) === 2 ? 2 : 1;
  return {
    slot,
    user_id: numberValue(raw.user_id),
    x: numberValue(raw.x),
    y: numberValue(raw.y),
    px: numberValue(raw.px),
    py: numberValue(raw.py),
    dir: numberValue(raw.dir),
    next_dir: numberValue(raw.next_dir),
    alive: Boolean(raw.alive),
    respawn_at_ms:
      raw.respawn_at_ms === undefined ? undefined : numberValue(raw.respawn_at_ms),
    kills: numberValue(raw.kills),
  };
};

const normalizePatch = (value: unknown): PaperIoCellPatch | null => {
  if (!isObject(value)) return null;
  const i = numberValue(value.i, -1);
  const v = numberValue(value.v, 0);
  if (i < 0) return null;
  return { i, v };
};

const normalizeState = (raw: Record<string, unknown>): PaperIoStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: PaperIoPhase =
    phaseRaw === 'countdown' || phaseRaw === 'playing' || phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';
  const playersRaw = isObject(raw.players) ? raw.players : {};
  const percentRaw = isObject(raw.percent) ? raw.percent : {};
  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'paper_io',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    ready: Boolean(raw.ready),
    your_user_id: numberValue(raw.your_user_id),
    server_ms: numberValue(raw.server_ms),
    start_at_ms: numberValue(raw.start_at_ms),
    deadline_ms: numberValue(raw.deadline_ms),
    duration_ms: Math.max(1, numberValue(raw.duration_ms, 90_000)),
    tick_ms: Math.max(1, numberValue(raw.tick_ms, 78)),
    tick: numberValue(raw.tick),
    grid_size: Math.max(1, numberValue(raw.grid_size, 64)),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    players: Object.fromEntries(
      Object.entries(playersRaw).map(([key, value]) => [key, normalizePlayer(value)]),
    ),
    percent: Object.fromEntries(
      Object.entries(percentRaw).map(([key, value]) => [key, numberValue(value)]),
    ),
    full: Boolean(raw.full),
    territory_b64:
      typeof raw.territory_b64 === 'string' ? raw.territory_b64 : undefined,
    trail_b64: typeof raw.trail_b64 === 'string' ? raw.trail_b64 : undefined,
    territory_patch: Array.isArray(raw.territory_patch)
      ? raw.territory_patch.map(normalizePatch).filter((v): v is PaperIoCellPatch => Boolean(v))
      : [],
    trail_patch: Array.isArray(raw.trail_patch)
      ? raw.trail_patch.map(normalizePatch).filter((v): v is PaperIoCellPatch => Boolean(v))
      : [],
    winner_user_id:
      raw.winner_user_id === undefined ? undefined : numberValue(raw.winner_user_id),
    message: typeof raw.message === 'string' ? raw.message : undefined,
  };
};

const getWsBaseUrl = () => {
  if (API_BASE_URL) {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.origin;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost';
};

export const getPaperIoWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/paper-io/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const paperIoWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: PaperIoSocketHandlers;
  }): PaperIoSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getPaperIoWsUrl(lobbyId, token));
    const send = (payload: unknown) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(payload));
      return true;
    };

    socket.addEventListener('open', () => handlers?.onOpen?.());
    socket.addEventListener('close', (event) => handlers?.onClose?.(event));
    socket.addEventListener('error', (event) => handlers?.onSocketError?.(event));
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data) as unknown;
      } catch {
        handlers?.onServerError?.({ type: 'error', error: 'Invalid WebSocket JSON' });
        return;
      }
      if (!isObject(raw)) return;
      if (raw.type === 'state') {
        handlers?.onState?.(normalizeState(raw));
      } else if (raw.type === 'error') {
        handlers?.onServerError?.({
          type: 'error',
          error: typeof raw.error === 'string' ? raw.error : 'WebSocket error',
          details: typeof raw.details === 'string' ? raw.details : undefined,
        });
      }
    });

    return {
      socket,
      requestState: () => send({ type: 'state' }),
      direction: (dir) => send({ type: 'direction', dir }),
      close: () => socket.close(),
    };
  },
};
