export type DunkShotMatchPhase =
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'match_over';

export type DunkShotGrade = 'bucket' | 'swish' | 'perfect';

export type DunkShotStateMessage = {
  type: 'state';
  game: 'dunk_shot';
  lobby_id: string;
  phase: DunkShotMatchPhase;
  ready: boolean;
  server_ms: number;
  seed: number;
  player_order: number[];
  scores: Record<string, number>;
  combos: Record<string, number>;
  countdown_ends_ms?: number;
  match_ends_ms?: number;
  winner_user_id?: number;
  draw?: boolean;
  last_event_user_id?: number;
  last_event_grade?: string;
  last_event_points?: number;
  last_event_id?: number;
  message?: string;
};

export type DunkShotServerError = {
  type: 'error';
  error: string;
  details?: string;
};

export type DunkShotSocketClient = {
  socket: WebSocket;
  requestState: () => void;
  sendScore: (eventId: number, grade: DunkShotGrade) => void;
  sendMiss: (eventId: number) => void;
  ping: () => void;
  close: () => void;
};

type ConnectOptions = {
  lobbyId: string;
  token: string;
  handlers?: {
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onSocketError?: (event: Event) => void;
    onServerError?: (error: DunkShotServerError) => void;
    onState?: (state: DunkShotStateMessage) => void;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value: unknown, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const toStringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toNumber(item)]),
  );
};

const normalizeState = (value: unknown): DunkShotStateMessage | null => {
  if (!isObject(value) || value.type !== 'state') return null;

  const rawPhase = toStringValue(value.phase);
  const phase: DunkShotMatchPhase =
    rawPhase === 'waiting' ||
    rawPhase === 'countdown' ||
    rawPhase === 'playing' ||
    rawPhase === 'match_over'
      ? rawPhase
      : 'waiting';

  return {
    type: 'state',
    game: 'dunk_shot',
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
    countdown_ends_ms: toNumber(value.countdown_ends_ms) || undefined,
    match_ends_ms: toNumber(value.match_ends_ms) || undefined,
    winner_user_id: Math.trunc(toNumber(value.winner_user_id)) || undefined,
    draw: value.draw === true,
    last_event_user_id:
      Math.trunc(toNumber(value.last_event_user_id)) || undefined,
    last_event_grade: toStringValue(value.last_event_grade) || undefined,
    last_event_points: Math.trunc(toNumber(value.last_event_points)) || undefined,
    last_event_id: Math.trunc(toNumber(value.last_event_id)) || undefined,
    message: toStringValue(value.message) || undefined,
  };
};

const makeWsUrl = (lobbyId: string, token: string) => {
  const configuredBase = String(
    import.meta.env.VITE_API_BASE_URL || '',
  ).trim();

  if (configuredBase) {
    const url = new URL(configuredBase, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `/ws/dunk-shot/${encodeURIComponent(lobbyId)}`;
    url.search = '';
    url.searchParams.set('token', token);
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(
    `${protocol}//${window.location.host}/ws/dunk-shot/${encodeURIComponent(
      lobbyId,
    )}`,
  );
  url.searchParams.set('token', token);
  return url.toString();
};

const sendJson = (socket: WebSocket, payload: unknown) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

export const dunkShotWsApi = {
  connect({
    lobbyId,
    token,
    handlers = {},
  }: ConnectOptions): DunkShotSocketClient {
    const socket = new WebSocket(makeWsUrl(lobbyId, token));

    socket.addEventListener('open', () => handlers.onOpen?.());
    socket.addEventListener('close', (event) => handlers.onClose?.(event));
    socket.addEventListener('error', (event) => handlers.onSocketError?.(event));
    socket.addEventListener('message', (event) => {
      let payload: unknown;

      try {
        payload = JSON.parse(String(event.data));
      } catch {
        handlers.onServerError?.({
          type: 'error',
          error: 'invalid websocket payload',
        });
        return;
      }

      const state = normalizeState(payload);
      if (state) {
        handlers.onState?.(state);
        return;
      }

      if (isObject(payload) && payload.type === 'error') {
        handlers.onServerError?.({
          type: 'error',
          error: toStringValue(payload.error, 'WebSocket error'),
          details: toStringValue(payload.details) || undefined,
        });
      }
    });

    return {
      socket,
      requestState: () => sendJson(socket, { type: 'state' }),
      sendScore: (eventId, grade) =>
        sendJson(socket, {
          type: 'score',
          event_id: eventId,
          grade,
        }),
      sendMiss: (eventId) =>
        sendJson(socket, {
          type: 'miss',
          event_id: eventId,
        }),
      ping: () => sendJson(socket, { type: 'ping' }),
      close: () => socket.close(1000, 'component unmounted'),
    };
  },
};
