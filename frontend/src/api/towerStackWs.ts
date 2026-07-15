import { API_BASE_URL } from './client';

export type TowerStackPhase = 'waiting' | 'countdown' | 'playing' | 'match_over';
export type TowerStackQuality = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export type TowerStackBlock = {
  left: number;
  width: number;
  level: number;
  perfect: boolean;
};

export type TowerStackPlaceResult = {
  seq: number;
  claimed_server_ms: number;
  accepted_server_ms: number;
  timing_corrected: boolean;
  quality: TowerStackQuality;
  score_delta: number;
  combo: number;
  combo_bonus: number;
  placed: boolean;
  left: number;
  width: number;
  active_x: number;
  active_width: number;
  level: number;
  server_ms: number;
};

export type TowerStackPlayerState = {
  user_id: number;
  score: number;
  combo: number;
  blocks: TowerStackBlock[];
  active_width: number;
  active_start_ms: number;
  active_from_left: boolean;
  active_speed: number;
  last_seq: number;
  last_result?: TowerStackPlaceResult;
};

export type TowerStackStateMessage = {
  type: 'state';
  game: string;
  lobby_id: string;
  phase: TowerStackPhase;
  ready: boolean;
  server_ms: number;
  start_at_ms: number;
  deadline_ms: number;
  round_seconds: number;
  world_width: number;
  base_width: number;
  player_order: number[];
  players: Record<string, TowerStackPlayerState>;
  winner_user_id?: number;
  message?: string;
};

export type TowerStackSyncMessage = {
  type: 'sync';
  nonce: string;
  server_ms: number;
  rtt_ms: number;
};

export type TowerStackErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type TowerStackSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  ready: () => boolean;
  drop: (seq: number, estimatedServerMs: number) => boolean;
  syncAck: (nonce: string) => boolean;
  close: () => void;
};

export type TowerStackSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: TowerStackStateMessage) => void;
  onSync?: (sync: TowerStackSyncMessage) => void;
  onServerError?: (error: TowerStackErrorMessage) => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBlock = (value: unknown): TowerStackBlock => {
  const raw = isObject(value) ? value : {};
  return {
    left: numberValue(raw.left),
    width: numberValue(raw.width),
    level: numberValue(raw.level),
    perfect: Boolean(raw.perfect),
  };
};

const normalizeResult = (value: unknown): TowerStackPlaceResult | undefined => {
  if (!isObject(value)) return undefined;

  const qualityRaw = typeof value.quality === 'string' ? value.quality : 'GOOD';
  const quality: TowerStackQuality =
    qualityRaw === 'PERFECT' || qualityRaw === 'GREAT' || qualityRaw === 'MISS'
      ? qualityRaw
      : 'GOOD';

  return {
    seq: numberValue(value.seq),
    claimed_server_ms: numberValue(value.claimed_server_ms),
    accepted_server_ms: numberValue(value.accepted_server_ms),
    timing_corrected: Boolean(value.timing_corrected),
    quality,
    score_delta: numberValue(value.score_delta),
    combo: numberValue(value.combo),
    combo_bonus: numberValue(value.combo_bonus),
    placed: Boolean(value.placed),
    left: numberValue(value.left),
    width: numberValue(value.width),
    active_x: numberValue(value.active_x),
    active_width: numberValue(value.active_width),
    level: numberValue(value.level),
    server_ms: numberValue(value.server_ms),
  };
};

const normalizePlayer = (value: unknown): TowerStackPlayerState => {
  const raw = isObject(value) ? value : {};

  return {
    user_id: numberValue(raw.user_id),
    score: numberValue(raw.score),
    combo: numberValue(raw.combo),
    blocks: Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock) : [],
    active_width: numberValue(raw.active_width, 151.2),
    active_start_ms: numberValue(raw.active_start_ms),
    active_from_left: Boolean(raw.active_from_left),
    active_speed: numberValue(raw.active_speed, 150),
    last_seq: numberValue(raw.last_seq),
    last_result: normalizeResult(raw.last_result),
  };
};

const normalizeState = (raw: Record<string, unknown>): TowerStackStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: TowerStackPhase =
    phaseRaw === 'countdown' || phaseRaw === 'playing' || phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';
  const playersRaw = isObject(raw.players) ? raw.players : {};

  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'tower_stack',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    ready: Boolean(raw.ready),
    server_ms: numberValue(raw.server_ms),
    start_at_ms: numberValue(raw.start_at_ms),
    deadline_ms: numberValue(raw.deadline_ms),
    round_seconds: Math.max(1, numberValue(raw.round_seconds, 30)),
    world_width: Math.max(1, numberValue(raw.world_width, 360)),
    base_width: Math.max(1, numberValue(raw.base_width, 151.2)),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    players: Object.fromEntries(
      Object.entries(playersRaw).map(([key, value]) => [key, normalizePlayer(value)]),
    ),
    winner_user_id:
      raw.winner_user_id === undefined ? undefined : numberValue(raw.winner_user_id),
    message: typeof raw.message === 'string' ? raw.message : undefined,
  };
};

const normalizeSync = (raw: Record<string, unknown>): TowerStackSyncMessage => ({
  type: 'sync',
  nonce: typeof raw.nonce === 'string' ? raw.nonce : '',
  server_ms: numberValue(raw.server_ms),
  rtt_ms: Math.max(0, numberValue(raw.rtt_ms, 140)),
});

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

export const getTowerStackWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/tower-stack/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const towerStackWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: TowerStackSocketHandlers;
  }): TowerStackSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getTowerStackWsUrl(lobbyId, token));

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
        return;
      }

      if (raw.type === 'sync') {
        handlers?.onSync?.(normalizeSync(raw));
        return;
      }

      if (raw.type === 'error') {
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
      ready: () => send({ type: 'ready' }),
      drop: (seq, estimatedServerMs) =>
        send({
          type: 'drop',
          seq,
          estimated_server_ms: Math.round(estimatedServerMs),
        }),
      syncAck: (nonce) => send({ type: 'sync_ack', nonce }),
      close: () => socket.close(),
    };
  },
};