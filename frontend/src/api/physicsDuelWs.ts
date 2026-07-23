import { API_BASE_URL } from './client';

export type PhysicsDuelPhase = 'waiting' | 'countdown' | 'select' | 'reveal' | 'match_over';

export type PhysicsDuelStep = {
  x0: number;
  x1: number;
  mid: number;
  top_y: number;
  slope: number;
  nx: number;
  ny: number;
  left_exposed: boolean;
  right_exposed: boolean;
  noise: number[];
};

export type PhysicsDuelPlayerState = {
  user_id: number;
  x: number;
  y: number;
  angle: number;
  move_ready: boolean;
};

export type PhysicsDuelTrajectory = {
  start_at_ms: number;
  duration_ms: number;
  frames: number[][];
};

export type PhysicsDuelStateMessage = {
  type: 'state';
  game: string;
  lobby_id: string;
  revision: number;
  phase: PhysicsDuelPhase;
  server_ms: number;
  turn: number;
  total_turns: number;
  countdown_start_ms: number;
  start_at_ms: number;
  select_deadline_ms: number;
  reveal_end_ms: number;
  player_order: number[];
  players: Record<string, PhysicsDuelPlayerState>;
  terrain?: PhysicsDuelStep[];
  trajectory?: PhysicsDuelTrajectory;
  winner_user_id?: number;
  message?: string;
};

export type PhysicsDuelSyncMessage = {
  type: 'sync';
  nonce: string;
  server_ms: number;
  rtt_ms: number;
};

export type PhysicsDuelErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type PhysicsDuelSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  sendMove: (turn: number, vx: number, vy: number) => boolean;
  syncAck: (nonce: string) => boolean;
  close: () => void;
};

export type PhysicsDuelSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: PhysicsDuelStateMessage) => void;
  onSync?: (sync: PhysicsDuelSyncMessage) => void;
  onServerError?: (error: PhysicsDuelErrorMessage) => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolValue = (value: unknown) => Boolean(value);

const normalizeStep = (value: unknown): PhysicsDuelStep => {
  const raw = isObject(value) ? value : {};
  return {
    x0: numberValue(raw.x0),
    x1: numberValue(raw.x1),
    mid: numberValue(raw.mid),
    top_y: numberValue(raw.top_y),
    slope: numberValue(raw.slope),
    nx: numberValue(raw.nx),
    ny: numberValue(raw.ny, -1),
    left_exposed: boolValue(raw.left_exposed),
    right_exposed: boolValue(raw.right_exposed),
    noise: Array.isArray(raw.noise) ? raw.noise.map((item) => numberValue(item)) : [],
  };
};

const normalizePlayer = (value: unknown): PhysicsDuelPlayerState => {
  const raw = isObject(value) ? value : {};
  return {
    user_id: numberValue(raw.user_id),
    x: numberValue(raw.x),
    y: numberValue(raw.y),
    angle: numberValue(raw.angle),
    move_ready: boolValue(raw.move_ready),
  };
};

const normalizeTrajectory = (value: unknown): PhysicsDuelTrajectory | undefined => {
  if (!isObject(value)) return undefined;
  const frames = Array.isArray(value.frames)
    ? value.frames
        .filter(Array.isArray)
        .map((frame) => frame.map((entry) => numberValue(entry)))
        .filter((frame) => frame.length >= 7)
    : [];

  return {
    start_at_ms: numberValue(value.start_at_ms),
    duration_ms: Math.max(1, numberValue(value.duration_ms, 1)),
    frames,
  };
};

const normalizeState = (raw: Record<string, unknown>): PhysicsDuelStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: PhysicsDuelPhase =
    phaseRaw === 'countdown' ||
    phaseRaw === 'select' ||
    phaseRaw === 'reveal' ||
    phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';

  const playersRaw = isObject(raw.players) ? raw.players : {};

  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'descent_duel',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    revision: numberValue(raw.revision),
    phase,
    server_ms: numberValue(raw.server_ms),
    turn: Math.max(1, numberValue(raw.turn, 1)),
    total_turns: Math.max(1, numberValue(raw.total_turns, 15)),
    countdown_start_ms: numberValue(raw.countdown_start_ms),
    start_at_ms: numberValue(raw.start_at_ms),
    select_deadline_ms: numberValue(raw.select_deadline_ms),
    reveal_end_ms: numberValue(raw.reveal_end_ms),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    players: Object.fromEntries(
      Object.entries(playersRaw).map(([key, value]) => [key, normalizePlayer(value)]),
    ),
    terrain: Array.isArray(raw.terrain) ? raw.terrain.map(normalizeStep) : undefined,
    trajectory: normalizeTrajectory(raw.trajectory),
    winner_user_id:
      raw.winner_user_id === undefined || raw.winner_user_id === null
        ? undefined
        : numberValue(raw.winner_user_id),
    message: typeof raw.message === 'string' ? raw.message : undefined,
  };
};

const normalizeSync = (raw: Record<string, unknown>): PhysicsDuelSyncMessage => ({
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

export const getPhysicsDuelWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/descent-duel/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const physicsDuelWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: PhysicsDuelSocketHandlers;
  }): PhysicsDuelSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getPhysicsDuelWsUrl(lobbyId, token));

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
      sendMove: (turn, vx, vy) => send({ type: 'move', turn, vx, vy }),
      syncAck: (nonce) => send({ type: 'sync_ack', nonce }),
      close: () => socket.close(),
    };
  },
};
