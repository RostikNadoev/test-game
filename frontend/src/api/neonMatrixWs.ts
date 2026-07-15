import { API_BASE_URL } from './client';

export type NeonMatrixPhase = 'picking' | 'spinning' | 'landing' | 'impact' | 'result' | 'match_over';

export type NeonMatrixRoundOutcome = {
  target: number;
  player1_user_id: number;
  player2_user_id: number;
  player1_pick: number;
  player2_pick: number;
  player1_distance: number;
  player2_distance: number;
  damage: number;
  attacker_user_id?: number;
  defender_user_id?: number;
  winner_user_id?: number;
  is_draw: boolean;
};

export type NeonMatrixStateMessage = {
  type: 'state';
  game: string;
  lobby_id: string;
  phase: NeonMatrixPhase;
  round: number;
  server_ms: number;
  player_order: number[];
  health: Record<string, number>;
  picked: Record<string, boolean>;
  picks: Record<string, number | null>;
  ready: Record<string, boolean>;
  commitment?: string;
  reveal_at_ms?: number;
  stop_at_ms?: number;
  target?: number;
  reveal_nonce?: string;
  outcome?: NeonMatrixRoundOutcome;
  winner_user_id?: number;
  message?: string;
};

export type NeonMatrixErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type NeonMatrixSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: NeonMatrixStateMessage) => void;
  onServerError?: (error: NeonMatrixErrorMessage) => void;
};

export type NeonMatrixSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  pick: (value: number) => boolean;
  ready: () => boolean;
  close: () => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [key, numberValue(raw)]),
  );
};

const normalizeBooleanMap = (value: unknown): Record<string, boolean> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [key, Boolean(raw)]),
  );
};

const normalizePickMap = (value: unknown): Record<string, number | null> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [
      key,
      raw === null || raw === undefined ? null : numberValue(raw),
    ]),
  );
};

const normalizeOutcome = (value: unknown): NeonMatrixRoundOutcome | undefined => {
  if (!isObject(value)) return undefined;

  return {
    target: numberValue(value.target),
    player1_user_id: numberValue(value.player1_user_id),
    player2_user_id: numberValue(value.player2_user_id),
    player1_pick: numberValue(value.player1_pick),
    player2_pick: numberValue(value.player2_pick),
    player1_distance: numberValue(value.player1_distance),
    player2_distance: numberValue(value.player2_distance),
    damage: numberValue(value.damage),
    attacker_user_id:
      value.attacker_user_id === undefined ? undefined : numberValue(value.attacker_user_id),
    defender_user_id:
      value.defender_user_id === undefined ? undefined : numberValue(value.defender_user_id),
    winner_user_id:
      value.winner_user_id === undefined ? undefined : numberValue(value.winner_user_id),
    is_draw: Boolean(value.is_draw),
  };
};

const normalizeState = (raw: Record<string, unknown>): NeonMatrixStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'picking';
  const phase: NeonMatrixPhase =
    phaseRaw === 'spinning' ||
    phaseRaw === 'landing' ||
    phaseRaw === 'impact' ||
    phaseRaw === 'result' ||
    phaseRaw === 'match_over'
      ? phaseRaw
      : 'picking';

  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'neon_matrix',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    round: Math.max(1, numberValue(raw.round, 1)),
    server_ms: numberValue(raw.server_ms),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    health: normalizeNumberMap(raw.health),
    picked: normalizeBooleanMap(raw.picked),
    picks: normalizePickMap(raw.picks),
    ready: normalizeBooleanMap(raw.ready),
    commitment: typeof raw.commitment === 'string' ? raw.commitment : undefined,
    reveal_at_ms:
      raw.reveal_at_ms === undefined ? undefined : numberValue(raw.reveal_at_ms),
    stop_at_ms:
      raw.stop_at_ms === undefined ? undefined : numberValue(raw.stop_at_ms),
    target: raw.target === undefined ? undefined : numberValue(raw.target),
    reveal_nonce:
      typeof raw.reveal_nonce === 'string' ? raw.reveal_nonce : undefined,
    outcome: normalizeOutcome(raw.outcome),
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

export const getNeonMatrixWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/neon-matrix/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const neonMatrixWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: NeonMatrixSocketHandlers;
  }): NeonMatrixSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getNeonMatrixWsUrl(lobbyId, token));

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
        handlers?.onServerError?.({
          type: 'error',
          error: 'Invalid WebSocket JSON',
        });
        return;
      }

      if (!isObject(raw)) return;

      if (raw.type === 'state') {
        handlers?.onState?.(normalizeState(raw));
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
      pick: (value) => send({ type: 'pick', value }),
      ready: () => send({ type: 'ready' }),
      close: () => socket.close(),
    };
  },
};