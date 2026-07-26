export type ArcadeRaceGameCode =
  | 'flappy_race'
  | 'doodle_jump'
  | 'crossy_pvp'
  | 'coin_chase'
  | 'cube_fill'
  | 'draw_drop'
  | 'ballz_duel';

export type ArcadeRaceMatchPhase =
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'match_over';

export type BallzBrickLayout = {
  id: number;
  col: number;
  row: number;
  hp: number;
};

export type BallzPickupLayout = {
  id: number;
  col: number;
  row: number;
};

export type BallzStageLayout = {
  bricks: BallzBrickLayout[];
  pickups: BallzPickupLayout[];
};

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
  cube_level_indices: number[];
  cube_levels: Record<string, number>;
  cube_level_progress: Record<string, number>;
  cube_progress_bp: Record<string, number>;
  cube_moves: Record<string, number>;
  cube_efficiency: Record<string, number>;
  cube_finished: Record<string, boolean>;
  draw_level_indices: number[];
  draw_completed: Record<string, boolean[]>;
  draw_ink: Record<string, number[]>;
  draw_completed_count: Record<string, number>;
  draw_total_ink: Record<string, number>;
  draw_ink_ratio_bp: Record<string, number>;
  draw_efficiency_bp: Record<string, number>;
  draw_finished: Record<string, boolean>;
  ballz_stages: BallzStageLayout[];
  ballz_stage: Record<string, number>;
  ballz_brick_hp: Record<string, number[]>;
  ballz_pickup_alive: Record<string, boolean[]>;
  ballz_available_balls: Record<string, number>;
  ballz_balls_used: Record<string, number>;
  ballz_shots: Record<string, number>;
  ballz_progress_bp: Record<string, number>;
  ballz_efficiency_bp: Record<string, number>;
  ballz_finished: Record<string, boolean>;
  ballz_launch_x_bp: Record<string, number>;
  last_event_ids: Record<string, number>;
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
  angle?: number;
  balls?: number;
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

const normalizeBooleanMap = (value: unknown): Record<string, boolean> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === true]),
  );
};

const normalizeNumberArrayMap = (
  value: unknown,
): Record<string, number[]> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      Array.isArray(item)
        ? item.map((entry) => Math.max(0, Math.trunc(toNumber(entry))))
        : [],
    ]),
  );
};

const normalizeBooleanArrayMap = (
  value: unknown,
): Record<string, boolean[]> => {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      Array.isArray(item) ? item.map((entry) => entry === true) : [],
    ]),
  );
};

const normalizeBallzStages = (value: unknown): BallzStageLayout[] => {
  if (!Array.isArray(value)) return [];

  return value.map((stage) => {
    if (!isObject(stage)) {
      return { bricks: [], pickups: [] };
    }

    const bricks = Array.isArray(stage.bricks)
      ? stage.bricks
          .map((brick) => {
            if (!isObject(brick)) return null;
            return {
              id: Math.trunc(toNumber(brick.id)),
              col: Math.trunc(toNumber(brick.col)),
              row: Math.trunc(toNumber(brick.row)),
              hp: Math.max(0, Math.trunc(toNumber(brick.hp))),
            };
          })
          .filter((brick): brick is BallzBrickLayout => brick !== null)
      : [];

    const pickups = Array.isArray(stage.pickups)
      ? stage.pickups
          .map((pickup) => {
            if (!isObject(pickup)) return null;
            return {
              id: Math.trunc(toNumber(pickup.id)),
              col: Math.trunc(toNumber(pickup.col)),
              row: Math.trunc(toNumber(pickup.row)),
            };
          })
          .filter((pickup): pickup is BallzPickupLayout => pickup !== null)
      : [];

    return { bricks, pickups };
  });
};

const normalizeState = (value: unknown): ArcadeRaceStateMessage | null => {
  if (!isObject(value) || value.type !== 'state') return null;

  const rawGame = toStringValue(value.game);
  if (
    rawGame !== 'flappy_race' &&
    rawGame !== 'doodle_jump' &&
    rawGame !== 'crossy_pvp' &&
    rawGame !== 'coin_chase' &&
    rawGame !== 'cube_fill' &&
    rawGame !== 'draw_drop' &&
    rawGame !== 'ballz_duel'
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
    cube_level_indices: Array.isArray(value.cube_level_indices)
      ? value.cube_level_indices
          .map((item) => Math.trunc(toNumber(item)))
          .filter((item) => item >= 0)
      : [],
    cube_levels: normalizeNumberMap(value.cube_levels),
    cube_level_progress: normalizeNumberMap(value.cube_level_progress),
    cube_progress_bp: normalizeNumberMap(value.cube_progress_bp),
    cube_moves: normalizeNumberMap(value.cube_moves),
    cube_efficiency: normalizeNumberMap(value.cube_efficiency),
    cube_finished: normalizeBooleanMap(value.cube_finished),
    draw_level_indices: Array.isArray(value.draw_level_indices)
      ? value.draw_level_indices
          .map((item) => Math.trunc(toNumber(item)))
          .filter((item) => item >= 0)
      : [],
    draw_completed: normalizeBooleanArrayMap(value.draw_completed),
    draw_ink: normalizeNumberArrayMap(value.draw_ink),
    draw_completed_count: normalizeNumberMap(value.draw_completed_count),
    draw_total_ink: normalizeNumberMap(value.draw_total_ink),
    draw_ink_ratio_bp: normalizeNumberMap(value.draw_ink_ratio_bp),
    draw_efficiency_bp: normalizeNumberMap(value.draw_efficiency_bp),
    draw_finished: normalizeBooleanMap(value.draw_finished),
    ballz_stages: normalizeBallzStages(value.ballz_stages),
    ballz_stage: normalizeNumberMap(value.ballz_stage),
    ballz_brick_hp: normalizeNumberArrayMap(value.ballz_brick_hp),
    ballz_pickup_alive: normalizeBooleanArrayMap(value.ballz_pickup_alive),
    ballz_available_balls: normalizeNumberMap(value.ballz_available_balls),
    ballz_balls_used: normalizeNumberMap(value.ballz_balls_used),
    ballz_shots: normalizeNumberMap(value.ballz_shots),
    ballz_progress_bp: normalizeNumberMap(value.ballz_progress_bp),
    ballz_efficiency_bp: normalizeNumberMap(value.ballz_efficiency_bp),
    ballz_finished: normalizeBooleanMap(value.ballz_finished),
    ballz_launch_x_bp: normalizeNumberMap(value.ballz_launch_x_bp),
    last_event_ids: normalizeNumberMap(value.last_event_ids),
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
    case 'coin_chase':
      return '/ws/coin-chase/';
    case 'cube_fill':
      return '/ws/cube-fill/';
    case 'draw_drop':
      return '/ws/draw-drop/';
    case 'ballz_duel':
      return '/ws/ballz-duel/';
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
      sendEvent: ({
        eventId,
        kind,
        grade,
        objectId,
        value,
        perfect,
        angle,
        balls,
      }) =>
        sendJson(socket, {
          type: 'event',
          event_id: eventId,
          kind,
          grade,
          object_id: objectId,
          value,
          perfect,
          angle,
          balls,
        }),
      ping: () => sendJson(socket, { type: 'ping' }),
      close: () => socket.close(),
    };
  },
};
