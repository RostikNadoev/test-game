export type ArcadeRaceGameCode = 'flappy_race' | 'doodle_jump' | 'crossy_pvp';

export type ArcadeRaceMatchPhase =
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'match_over';

export type ArcadeRaceStateMessage = {
  type: 'state';
  game: ArcadeRaceGameCode;
  lobby_id: string;
  phase: ArcadeRaceMatchPhase;
  ready: boolean;
  server_ms: number;
  seed: number;
  player_order: number[];
  scores: Record<string, number>;
  combos: Record<string, number>;
  best_combos: Record<string, number>;
  height_scores: Record<string, number>;
  bet_coins: number;
  winner_profit: number;
  countdown_ends_ms?: number;
  match_ends_ms?: number;
  winner_user_id?: number;
  draw: boolean;
  last_event_user_id?: number;
  last_event_kind?: string;
  last_event_grade?: string;
  last_event_points?: number;
  last_event_id?: number;
  message?: string;
};

export type ArcadeRaceServerError = {
  type: 'error';
  error: string;
  details?: string;
};

export type ArcadeRaceEvent = {
  eventId: number;
  kind: string;
  grade?: string;
  objectId?: number;
  value?: number;
  perfect?: boolean;
};

export type ArcadeRaceSocketClient = {
  socket: WebSocket;
  requestState: () => void;
  sendEvent: (event: ArcadeRaceEvent) => void;
  ping: () => void;
  close: () => void;
};

type ConnectHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: ArcadeRaceStateMessage) => void;
  onServerError?: (error: ArcadeRaceServerError) => void;
};

type ConnectOptions = {
  gameCode: ArcadeRaceGameCode;
  lobbyId: string;
  token: string;
  handlers?: ConnectHandlers;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toNumber(item)]),
  );
};

const normalizeState = (value: unknown): ArcadeRaceStateMessage | null => {
  if (!isObject(value) || value.type !== 'state') return null;

  const rawGame = toStringValue(value.game);
  if (
    rawGame !== 'flappy_race' &&
    rawGame !== 'doodle_jump' &&
    rawGame !== 'crossy_pvp'
  ) {
    return null;
  }

  const rawPhase = toStringValue(value.phase);
  const phase: ArcadeRaceMatchPhase =
    rawPhase === 'waiting' ||
    rawPhase === 'countdown' ||
    rawPhase === 'playing' ||
    rawPhase === 'match_over'
      ? rawPhase
      : 'waiting';

  return {
    type: 'state',
    game: rawGame,
    lobby_id: toStringValue(value.lobby_id),
    phase,
    ready: value.ready === true,
    server_ms: toNumber(value.server_ms, Date.now()),
    seed: toNumber(value.seed, 1),
    player_order: Array.isArray(value.player_order)
      ? value.player_order
          .map((item) => Math.trunc(toNumber(item)))
          .filter((item) => item > 0)
      : [],
    scores: normalizeNumberMap(value.scores),
    combos: normalizeNumberMap(value.combos),
    best_combos: normalizeNumberMap(value.best_combos),
    height_scores: normalizeNumberMap(value.height_scores),
    bet_coins: Math.max(0, toNumber(value.bet_coins)),
    winner_profit: Math.max(0, toNumber(value.winner_profit)),
    countdown_ends_ms: toNumber(value.countdown_ends_ms) || undefined,
    match_ends_ms: toNumber(value.match_ends_ms) || undefined,
    winner_user_id: Math.trunc(toNumber(value.winner_user_id)) || undefined,
    draw: value.draw === true,
    last_event_user_id:
      Math.trunc(toNumber(value.last_event_user_id)) || undefined,
    last_event_kind: toStringValue(value.last_event_kind) || undefined,
    last_event_grade: toStringValue(value.last_event_grade) || undefined,
    last_event_points:
      Math.trunc(toNumber(value.last_event_points)) || undefined,
    last_event_id: Math.trunc(toNumber(value.last_event_id)) || undefined,
    message: toStringValue(value.message) || undefined,
  };
};

const normalizeServerError = (value: unknown): ArcadeRaceServerError | null => {
  if (!isObject(value) || value.type !== 'error') return null;

  return {
    type: 'error',
    error: toStringValue(value.error, 'Unknown websocket error'),
    details: toStringValue(value.details) || undefined,
  };
};

const pathForGame = (gameCode: ArcadeRaceGameCode) => {
  switch (gameCode) {
    case 'flappy_race':
      return '/ws/flappy-race/';
    case 'doodle_jump':
      return '/ws/doodle-jump/';
    case 'crossy_pvp':
      return '/ws/crossy-road/';
  }
};

const makeWsUrl = (
  gameCode: ArcadeRaceGameCode,
  lobbyId: string,
  token: string,
) => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const path = `${pathForGame(gameCode)}${encodeURIComponent(lobbyId)}`;

  if (configuredBase) {
    const url = new URL(configuredBase, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    url.search = '';
    url.searchParams.set('token', token);
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}${path}`);
  url.searchParams.set('token', token);
  return url.toString();
};

const sendJson = (socket: WebSocket, payload: unknown) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

export const arcadeRaceWsApi = {
  connect({
    gameCode,
    lobbyId,
    token,
    handlers = {},
  }: ConnectOptions): ArcadeRaceSocketClient {
    const socket = new WebSocket(makeWsUrl(gameCode, lobbyId, token));

    socket.addEventListener('open', () => handlers.onOpen?.());
    socket.addEventListener('close', (event) => handlers.onClose?.(event));
    socket.addEventListener('error', (event) => handlers.onSocketError?.(event));
    socket.addEventListener('message', (event) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const state = normalizeState(parsed);
      if (state) {
        handlers.onState?.(state);
        return;
      }

      const serverError = normalizeServerError(parsed);
      if (serverError) handlers.onServerError?.(serverError);
    });

    return {
      socket,
      requestState: () => sendJson(socket, { type: 'state' }),
      sendEvent: ({ eventId, kind, grade, objectId, value, perfect }) =>
        sendJson(socket, {
          type: 'event',
          event_id: eventId,
          kind,
          grade,
          object_id: objectId,
          value,
          perfect,
        }),
      ping: () => sendJson(socket, { type: 'ping' }),
      close: () => socket.close(),
    };
  },
};
