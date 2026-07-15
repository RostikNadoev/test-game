import { API_BASE_URL } from './client';

export type AirHockeyPhase = 'waiting' | 'playing' | 'goal' | 'match_over';

export type AirHockeyBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type AirHockeyPaddle = AirHockeyBody & {
  input_seq: number;
};

export type AirHockeyStateMessage = {
  type: 'state';
  game: 'air_hockey' | string;
  lobby_id: string;
  phase: AirHockeyPhase;
  ready: boolean;
  server_ms: number;
  tick: number;
  target_goals: number;
  board_width: number;
  board_height: number;
  player_order: number[];
  puck: AirHockeyBody;
  paddles: Record<string, AirHockeyPaddle>;
  score: Record<string, number>;
  goal_seq: number;
  goal_scorer_user_id?: number;
  winner_user_id?: number;
  message?: string;
};

export type AirHockeyErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type AirHockeySocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: AirHockeyStateMessage) => void;
  onServerError?: (error: AirHockeyErrorMessage) => void;
};

export type AirHockeySocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  sendInput: (x: number, y: number, seq: number) => boolean;
  close: () => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeBody = (value: unknown): AirHockeyBody => {
  const raw = isObject(value) ? value : {};

  return {
    x: toFiniteNumber(raw.x, 0.5),
    y: toFiniteNumber(raw.y, 0.5),
    vx: toFiniteNumber(raw.vx),
    vy: toFiniteNumber(raw.vy),
  };
};

const normalizeState = (raw: Record<string, unknown>): AirHockeyStateMessage => {
  const paddlesRaw = isObject(raw.paddles) ? raw.paddles : {};
  const scoreRaw = isObject(raw.score) ? raw.score : {};

  const paddles = Object.fromEntries(
    Object.entries(paddlesRaw).map(([key, value]) => {
        const paddleRaw = isObject(value) ? value : {};
        const body = normalizeBody(paddleRaw);
        return [
          key,
          {
            ...body,
            input_seq: toFiniteNumber(paddleRaw.input_seq),
          } satisfies AirHockeyPaddle,
        ];
      }),
  );

  const score = Object.fromEntries(
    Object.entries(scoreRaw).map(([key, value]) => [key, toFiniteNumber(value)]),
  );

  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: AirHockeyPhase =
    phaseRaw === 'playing' || phaseRaw === 'goal' || phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';

  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'air_hockey',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    ready: Boolean(raw.ready),
    server_ms: toFiniteNumber(raw.server_ms),
    tick: toFiniteNumber(raw.tick),
    target_goals: Math.max(1, toFiniteNumber(raw.target_goals, 3)),
    board_width: Math.max(0.1, toFiniteNumber(raw.board_width, 1)),
    board_height: Math.max(0.1, toFiniteNumber(raw.board_height, 1.72)),
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    puck: normalizeBody(raw.puck),
    paddles,
    score,
    goal_seq: toFiniteNumber(raw.goal_seq),
    goal_scorer_user_id:
      raw.goal_scorer_user_id === undefined
        ? undefined
        : toFiniteNumber(raw.goal_scorer_user_id),
    winner_user_id:
      raw.winner_user_id === undefined ? undefined : toFiniteNumber(raw.winner_user_id),
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

export const getAirHockeyWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/air-hockey/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const airHockeyWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: AirHockeySocketHandlers;
  }): AirHockeySocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getAirHockeyWsUrl(lobbyId, token));

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
      sendInput: (x, y, seq) => send({ type: 'input', x, y, seq }),
      close: () => socket.close(),
    };
  },
};
