import { API_BASE_URL } from './client';

export type GridLockPhase = 'waiting' | 'countdown' | 'playing' | 'match_over';

export type GridLockPosition = {
  row: number;
  col: number;
};

export type GridLockWall = {
  id: string;
  row: number;
  col: number;
  orientation: 'h' | 'v';
  user_id: number;
};

export type GridLockLastAction = {
  sequence: number;
  kind: 'move' | 'wall' | 'timeout';
  user_id: number;
  row?: number;
  col?: number;
  orientation?: 'h' | 'v';
};

export type GridLockStateMessage = {
  type: 'state';
  game: 'grid_lock';
  lobby_id: string;
  phase: GridLockPhase;
  ready: boolean;
  server_ms: number;
  player_order: number[];
  positions: Record<string, GridLockPosition>;
  walls: GridLockWall[];
  walls_left: Record<string, number>;
  turn_user_id?: number;
  turn_number: number;
  countdown_ends_ms?: number;
  turn_ends_ms?: number;
  winner_user_id?: number;
  draw: boolean;
  bet_coins: number;
  winner_profit: number;
  last_action?: GridLockLastAction;
  message?: string;
};

export type GridLockErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type GridLockSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: GridLockStateMessage) => void;
  onServerError?: (error: GridLockErrorMessage) => void;
};

export type GridLockSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  move: (row: number, col: number) => boolean;
  placeWall: (row: number, col: number, orientation: 'h' | 'v') => boolean;
  close: () => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePosition = (value: unknown): GridLockPosition | null => {
  if (!isObject(value)) return null;
  const row = Math.trunc(numberValue(value.row, -1));
  const col = Math.trunc(numberValue(value.col, -1));
  if (row < 0 || col < 0) return null;
  return { row, col };
};

const normalizePositions = (value: unknown): Record<string, GridLockPosition> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key, normalizePosition(raw)] as const)
      .filter((entry): entry is readonly [string, GridLockPosition] => entry[1] !== null),
  );
};

const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [key, Math.max(0, Math.trunc(numberValue(raw)))]),
  );
};

const normalizeWall = (value: unknown): GridLockWall | null => {
  if (!isObject(value)) return null;
  const orientation = value.orientation === 'v' ? 'v' : value.orientation === 'h' ? 'h' : null;
  if (!orientation) return null;

  return {
    id: typeof value.id === 'string' ? value.id : '',
    row: Math.trunc(numberValue(value.row, -1)),
    col: Math.trunc(numberValue(value.col, -1)),
    orientation,
    user_id: Math.trunc(numberValue(value.user_id)),
  };
};

const normalizeLastAction = (value: unknown): GridLockLastAction | undefined => {
  if (!isObject(value)) return undefined;
  const kind = value.kind === 'move' || value.kind === 'wall' || value.kind === 'timeout' ? value.kind : null;
  if (!kind) return undefined;

  const orientation = value.orientation === 'h' || value.orientation === 'v' ? value.orientation : undefined;
  return {
    sequence: Math.max(0, Math.trunc(numberValue(value.sequence))),
    kind,
    user_id: Math.trunc(numberValue(value.user_id)),
    row: value.row === undefined ? undefined : Math.trunc(numberValue(value.row)),
    col: value.col === undefined ? undefined : Math.trunc(numberValue(value.col)),
    orientation,
  };
};

const normalizeState = (raw: Record<string, unknown>): GridLockStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: GridLockPhase =
    phaseRaw === 'countdown' || phaseRaw === 'playing' || phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';

  return {
    type: 'state',
    game: 'grid_lock',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    ready: raw.ready === true,
    server_ms: numberValue(raw.server_ms, Date.now()),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map((value) => Math.trunc(numberValue(value))).filter((value) => value > 0)
      : [],
    positions: normalizePositions(raw.positions),
    walls: Array.isArray(raw.walls)
      ? raw.walls.map(normalizeWall).filter((wall): wall is GridLockWall => wall !== null)
      : [],
    walls_left: normalizeNumberMap(raw.walls_left),
    turn_user_id: raw.turn_user_id === undefined ? undefined : Math.trunc(numberValue(raw.turn_user_id)),
    turn_number: Math.max(0, Math.trunc(numberValue(raw.turn_number))),
    countdown_ends_ms:
      raw.countdown_ends_ms === undefined ? undefined : numberValue(raw.countdown_ends_ms),
    turn_ends_ms: raw.turn_ends_ms === undefined ? undefined : numberValue(raw.turn_ends_ms),
    winner_user_id:
      raw.winner_user_id === undefined ? undefined : Math.trunc(numberValue(raw.winner_user_id)),
    draw: raw.draw === true,
    bet_coins: Math.max(0, numberValue(raw.bet_coins)),
    winner_profit: Math.max(0, numberValue(raw.winner_profit)),
    last_action: normalizeLastAction(raw.last_action),
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

export const getGridLockWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/grid-lock/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const gridLockWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: GridLockSocketHandlers;
  }): GridLockSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getGridLockWsUrl(lobbyId, token));

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
      move: (row, col) => send({ type: 'move', row, col }),
      placeWall: (row, col, orientation) => send({ type: 'wall', row, col, orientation }),
      close: () => socket.close(),
    };
  },
};
