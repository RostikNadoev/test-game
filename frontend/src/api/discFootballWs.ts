export type DiscFootballPhase =
  | 'waiting'
  | 'planning'
  | 'reveal'
  | 'resolving'
  | 'goal'
  | 'match_over';

export type DiscFootballBodyKind =
  | 'disc'
  | 'ball';

export type DiscFootballBody = {
  id: string;
  kind: DiscFootballBodyKind;
  owner_user_id?: number;
  disc_index?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
};

export type DiscFootballPlan = {
  disc_index: number;
  dx: number;
  dy: number;
  power: number;
};

export type DiscFootballStateMessage = {
  type: 'state';
  game: 'disc_football';
  lobby_id: string;
  phase: DiscFootballPhase;
  ready: boolean;
  server_ms: number;
  tick: number;
  round: number;
  target_goals: number;
  board_width: number;
  board_height: number;
  goal_width: number;
  goal_depth: number;
  player_order: number[];
  bodies: DiscFootballBody[];
  score: Record<string, number>;
  submitted: Record<string, boolean>;
  plans?: Record<
    string,
    DiscFootballPlan[]
  >;
  planning_deadline_ms?: number;
  reveal_deadline_ms?: number;
  goal_seq: number;
  goal_scorer_user_id?: number;
  winner_user_id?: number;
  message?: string;
};

export type DiscFootballServerError = {
  type: 'error';
  error: string;
  details?: string;
};

export type DiscFootballSocketClient = {
  socket: WebSocket;
  requestState: () => void;
  submitPlans: (
    plans: DiscFootballPlan[],
  ) => void;
  ping: () => void;
  close: () => void;
};

type ConnectHandlers = {
  onOpen?: () => void;
  onClose?: (
    event: CloseEvent,
  ) => void;
  onSocketError?: (
    event: Event,
  ) => void;
  onServerError?: (
    error: DiscFootballServerError,
  ) => void;
  onState?: (
    state: DiscFootballStateMessage,
  ) => void;
};

type ConnectOptions = {
  lobbyId: string;
  token: string;
  handlers?: ConnectHandlers;
};

const isObject = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value);

const finiteNumber = (
  value: unknown,
  fallback = 0,
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const integer = (
  value: unknown,
  fallback = 0,
) =>
  Math.trunc(
    finiteNumber(
      value,
      fallback,
    ),
  );

const stringValue = (
  value: unknown,
  fallback = '',
) =>
  typeof value === 'string'
    ? value
    : fallback;

const booleanValue = (
  value: unknown,
) => value === true;

const normalizeNumberMap = (
  value: unknown,
): Record<string, number> => {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(
      ([key, item]) => [
        key,
        finiteNumber(item),
      ],
    ),
  );
};

const normalizeBooleanMap = (
  value: unknown,
): Record<string, boolean> => {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(
      ([key, item]) => [
        key,
        booleanValue(item),
      ],
    ),
  );
};

const normalizeBody = (
  value: unknown,
): DiscFootballBody | null => {
  if (!isObject(value)) {
    return null;
  }

  const kind =
    value.kind === 'disc' ||
    value.kind === 'ball'
      ? value.kind
      : null;

  if (!kind) {
    return null;
  }

  const body: DiscFootballBody = {
    id: stringValue(value.id),
    kind,
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    vx: finiteNumber(value.vx),
    vy: finiteNumber(value.vy),
    radius: Math.max(
      0.001,
      finiteNumber(
        value.radius,
        0.03,
      ),
    ),
    rotation: finiteNumber(
      value.rotation,
    ),
  };

  const ownerUserId = integer(
    value.owner_user_id,
  );

  const discIndex = integer(
    value.disc_index,
    -1,
  );

  if (ownerUserId > 0) {
    body.owner_user_id =
      ownerUserId;
  }

  if (discIndex >= 0) {
    body.disc_index =
      discIndex;
  }

  return body;
};

const normalizePlan = (
  value: unknown,
): DiscFootballPlan | null => {
  if (!isObject(value)) {
    return null;
  }

  const discIndex = integer(
    value.disc_index,
    -1,
  );

  if (
    discIndex < 0 ||
    discIndex > 2
  ) {
    return null;
  }

  return {
    disc_index: discIndex,
    dx: finiteNumber(value.dx),
    dy: finiteNumber(value.dy),
    power: Math.max(
      0,
      Math.min(
        1,
        finiteNumber(
          value.power,
        ),
      ),
    ),
  };
};

const normalizePlans = (
  value: unknown,
):
  | Record<
      string,
      DiscFootballPlan[]
    >
  | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  const result: Record<
    string,
    DiscFootballPlan[]
  > = {};

  for (
    const [key, items]
    of Object.entries(value)
  ) {
    if (!Array.isArray(items)) {
      continue;
    }

    result[key] = items
      .map(normalizePlan)
      .filter(
        (
          item,
        ): item is DiscFootballPlan =>
          item !== null,
      );
  }

  return result;
};

const normalizeState = (
  value: unknown,
): DiscFootballStateMessage | null => {
  if (
    !isObject(value) ||
    value.type !== 'state'
  ) {
    return null;
  }

  const rawPhase =
    stringValue(value.phase);

  const phase: DiscFootballPhase =
    rawPhase === 'waiting' ||
    rawPhase === 'planning' ||
    rawPhase === 'reveal' ||
    rawPhase === 'resolving' ||
    rawPhase === 'goal' ||
    rawPhase === 'match_over'
      ? rawPhase
      : 'waiting';

  const bodies = Array.isArray(
    value.bodies,
  )
    ? value.bodies
        .map(normalizeBody)
        .filter(
          (
            item,
          ): item is DiscFootballBody =>
            item !== null,
        )
    : [];

  const playerOrder =
    Array.isArray(
      value.player_order,
    )
      ? value.player_order
          .map((item) =>
            integer(item),
          )
          .filter(
            (item) =>
              item > 0,
          )
      : [];

  return {
    type: 'state',
    game: 'disc_football',
    lobby_id: stringValue(
      value.lobby_id,
    ),
    phase,
    ready: booleanValue(
      value.ready,
    ),
    server_ms: finiteNumber(
      value.server_ms,
      Date.now(),
    ),
    tick: integer(value.tick),
    round: Math.max(
      1,
      integer(
        value.round,
        1,
      ),
    ),
    target_goals: Math.max(
      1,
      integer(
        value.target_goals,
        2,
      ),
    ),
    board_width: Math.max(
      0.1,
      finiteNumber(
        value.board_width,
        1,
      ),
    ),
    board_height: Math.max(
      0.1,
      finiteNumber(
        value.board_height,
        1.68,
      ),
    ),
    goal_width: Math.max(
      0.1,
      finiteNumber(
        value.goal_width,
        0.057 * 6,
      ),
    ),
    goal_depth: Math.max(
      0.02,
      finiteNumber(
        value.goal_depth,
        0.057 * 2,
      ),
    ),
    player_order: playerOrder,
    bodies,
    score: normalizeNumberMap(
      value.score,
    ),
    submitted:
      normalizeBooleanMap(
        value.submitted,
      ),
    plans: normalizePlans(
      value.plans,
    ),
    planning_deadline_ms:
      finiteNumber(
        value.planning_deadline_ms,
      ) || undefined,
    reveal_deadline_ms:
      finiteNumber(
        value.reveal_deadline_ms,
      ) || undefined,
    goal_seq: integer(
      value.goal_seq,
    ),
    goal_scorer_user_id:
      integer(
        value.goal_scorer_user_id,
      ) || undefined,
    winner_user_id:
      integer(
        value.winner_user_id,
      ) || undefined,
    message:
      stringValue(
        value.message,
      ) || undefined,
  };
};

const makeWsUrl = (
  lobbyId: string,
  token: string,
) => {
  const configuredBase = String(
    import.meta.env
      .VITE_API_BASE_URL || '',
  ).trim();

  if (configuredBase) {
    const url = new URL(
      configuredBase,
      window.location.origin,
    );

    url.protocol =
      url.protocol === 'https:'
        ? 'wss:'
        : 'ws:';

    url.pathname =
      `/ws/disc-football/${encodeURIComponent(
        lobbyId,
      )}`;

    url.search = '';

    url.searchParams.set(
      'token',
      token,
    );

    return url.toString();
  }

  const protocol =
    window.location.protocol ===
    'https:'
      ? 'wss:'
      : 'ws:';

  const url = new URL(
    `${protocol}//${window.location.host}/ws/disc-football/${encodeURIComponent(
      lobbyId,
    )}`,
  );

  url.searchParams.set(
    'token',
    token,
  );

  return url.toString();
};

const sendJson = (
  socket: WebSocket,
  payload: unknown,
) => {
  if (
    socket.readyState !==
    WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify(payload),
  );
};

export const discFootballWsApi = {
  connect({
    lobbyId,
    token,
    handlers = {},
  }: ConnectOptions): DiscFootballSocketClient {
    const socket = new WebSocket(
      makeWsUrl(
        lobbyId,
        token,
      ),
    );

    socket.addEventListener(
      'open',
      () => handlers.onOpen?.(),
    );

    socket.addEventListener(
      'close',
      (event) =>
        handlers.onClose?.(event),
    );

    socket.addEventListener(
      'error',
      (event) =>
        handlers.onSocketError?.(
          event,
        ),
    );

    socket.addEventListener(
      'message',
      (event) => {
        let payload: unknown;

        try {
          payload = JSON.parse(
            String(event.data),
          );
        } catch {
          handlers.onServerError?.({
            type: 'error',
            error:
              'invalid websocket payload',
          });

          return;
        }

        const state =
          normalizeState(payload);

        if (state) {
          handlers.onState?.(
            state,
          );

          return;
        }

        if (
          isObject(payload) &&
          payload.type === 'error'
        ) {
          handlers.onServerError?.({
            type: 'error',
            error: stringValue(
              payload.error,
              'WebSocket error',
            ),
            details:
              stringValue(
                payload.details,
              ) || undefined,
          });
        }
      },
    );

    return {
      socket,

      requestState: () =>
        sendJson(
          socket,
          {
            type: 'state',
          },
        ),

      submitPlans: (plans) =>
        sendJson(
          socket,
          {
            type: 'plan',
            plans,
          },
        ),

      ping: () =>
        sendJson(
          socket,
          {
            type: 'ping',
          },
        ),

      close: () =>
        socket.close(
          1000,
          'component unmounted',
        ),
    };
  },
};