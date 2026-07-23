import { API_BASE_URL } from './client';

export type PlinkoPhase =
  | 'waiting'
  | 'countdown'
  | 'angles'
  | 'actions'
  | 'reveal'
  | 'match_over';

export type PlinkoActionMode = 'x2' | 'half' | 'wall';

export type PlinkoPlayerState = {
  user_id: number;
  angles?: number[];
  angles_count: number;
  angles_submitted: boolean;
  factors?: number[];
  walls?: string[];
  actions_used: number;
  actions_submitted: boolean;
  reveal_done?: boolean;
  score: number;
};

export type PlinkoRevealBall = {
  index: number;
  user_id: number;
  ball_index: number;
  angle: number;
  slot: number;
  value: number;
  stuck: boolean;
  score_after: number;
};

export type PlinkoStateMessage = {
  type: 'state';
  game: string;
  lobby_id: string;
  phase: PlinkoPhase;
  ready: boolean;
  server_ms: number;
  revision: number;
  start_at_ms: number;
  deadline_ms: number;
  countdown_seconds: number;
  angle_seconds: number;
  action_seconds: number;
  balls_per_player: number;
  actions_per_player: number;
  player_order: number[];
  players: Record<string, PlinkoPlayerState>;
  values: number[];
  wind?: number;
  combined_values: number[];
  all_walls: string[];
  reveal: PlinkoRevealBall[];
  winner_user_id?: number;
  message?: string;
};

export type PlinkoErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type PlinkoSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: PlinkoStateMessage) => void;
  onServerError?: (error: PlinkoErrorMessage) => void;
};

export type PlinkoSocketClient = {
  socket: WebSocket;
  requestState: () => boolean;
  ready: () => boolean;
  setAngle: (ballIndex: number, angle: number) => boolean;
  submitAngles: () => boolean;
  action: (payload: {
    mode: PlinkoActionMode;
    slotIndex?: number;
    wallKey?: string;
  }) => boolean;
  submitActions: () => boolean;
  revealDone: () => boolean;
  close: () => void;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (value: unknown) => Boolean(value);

const numberArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => numberValue(item)).filter(Number.isFinite)
    : [];

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const normalizePlayer = (value: unknown): PlinkoPlayerState => {
  const raw = isObject(value) ? value : {};
  const angles = Array.isArray(raw.angles) ? numberArray(raw.angles) : undefined;
  const factors = Array.isArray(raw.factors) ? numberArray(raw.factors) : undefined;
  const walls = Array.isArray(raw.walls) ? stringArray(raw.walls) : undefined;

  return {
    user_id: numberValue(raw.user_id),
    angles,
    angles_count: Math.max(0, numberValue(raw.angles_count)),
    angles_submitted: booleanValue(raw.angles_submitted),
    factors,
    walls,
    actions_used: Math.max(0, numberValue(raw.actions_used)),
    actions_submitted: booleanValue(raw.actions_submitted),
    reveal_done: raw.reveal_done === undefined ? undefined : booleanValue(raw.reveal_done),
    score: numberValue(raw.score, 1),
  };
};

const normalizeReveal = (value: unknown): PlinkoRevealBall | null => {
  if (!isObject(value)) return null;
  return {
    index: numberValue(value.index),
    user_id: numberValue(value.user_id),
    ball_index: numberValue(value.ball_index),
    angle: numberValue(value.angle),
    slot: numberValue(value.slot),
    value: numberValue(value.value, 1),
    stuck: booleanValue(value.stuck),
    score_after: numberValue(value.score_after, 1),
  };
};

const normalizeState = (raw: Record<string, unknown>): PlinkoStateMessage => {
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'waiting';
  const phase: PlinkoPhase =
    phaseRaw === 'countdown' ||
    phaseRaw === 'angles' ||
    phaseRaw === 'actions' ||
    phaseRaw === 'reveal' ||
    phaseRaw === 'match_over'
      ? phaseRaw
      : 'waiting';

  const playersRaw = isObject(raw.players) ? raw.players : {};
  const revealRaw = Array.isArray(raw.reveal) ? raw.reveal : [];

  return {
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'plinko_pvp',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase,
    ready: booleanValue(raw.ready),
    server_ms: numberValue(raw.server_ms),
    revision: Math.max(0, numberValue(raw.revision)),
    start_at_ms: numberValue(raw.start_at_ms),
    deadline_ms: numberValue(raw.deadline_ms),
    countdown_seconds: Math.max(1, numberValue(raw.countdown_seconds, 3)),
    angle_seconds: Math.max(1, numberValue(raw.angle_seconds, 15)),
    action_seconds: Math.max(1, numberValue(raw.action_seconds, 15)),
    balls_per_player: Math.max(1, numberValue(raw.balls_per_player, 5)),
    actions_per_player: Math.max(1, numberValue(raw.actions_per_player, 2)),
    player_order: numberArray(raw.player_order),
    players: Object.fromEntries(
      Object.entries(playersRaw).map(([key, value]) => [key, normalizePlayer(value)]),
    ),
    values: numberArray(raw.values),
    wind: raw.wind === undefined || raw.wind === null ? undefined : numberValue(raw.wind),
    combined_values: numberArray(raw.combined_values),
    all_walls: stringArray(raw.all_walls),
    reveal: revealRaw.map(normalizeReveal).filter((item): item is PlinkoRevealBall => item !== null),
    winner_user_id:
      raw.winner_user_id === undefined || raw.winner_user_id === null
        ? undefined
        : numberValue(raw.winner_user_id),
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

export const getPlinkoWsUrl = (lobbyId: string, token: string) =>
  `${getWsBaseUrl()}/ws/plinko/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;

export const plinkoWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: PlinkoSocketHandlers;
  }): PlinkoSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getPlinkoWsUrl(lobbyId, token));

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
      ready: () => send({ type: 'ready' }),
      setAngle: (ballIndex, angle) =>
        send({ type: 'angle', ball_index: ballIndex, angle }),
      submitAngles: () => send({ type: 'submit_angles' }),
      action: ({ mode, slotIndex, wallKey }) =>
        send({
          type: 'action',
          mode,
          ...(slotIndex === undefined ? {} : { slot_index: slotIndex }),
          ...(wallKey === undefined ? {} : { wall_key: wallKey }),
        }),
      submitActions: () => send({ type: 'submit_actions' }),
      revealDone: () => send({ type: 'reveal_done' }),
      close: () => socket.close(),
    };
  },
};
