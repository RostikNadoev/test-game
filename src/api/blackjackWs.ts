import { API_BASE_URL } from './client';

export type BlackjackCommandType =
  | 'state'
  | 'hit'
  | 'stand'
  | 'restart_match';

export type BlackjackClientCommand = {
  type: BlackjackCommandType;
};

export type BlackjackServerPhase =
  | 'dealing'
  | 'player_turn'
  | 'settling'
  | 'round_over'
  | 'match_over';

export type BlackjackServerCard = {
  id?: string;
  suit?: string;
  rank?: string;
  deck?: number;
  hidden?: boolean;
  [key: string]: unknown;
};

export type BlackjackServerHandInfo = {
  total?: number;
  soft?: boolean;
  blackjack?: boolean;
  black_jack?: boolean;
  bust?: boolean;
  [key: string]: unknown;
};

export type BlackjackServerPlayer = {
  id?: number;
  user_id?: number;
  tg_user?: string;
  username?: string;
  name?: string;
  photo_url?: string;
  cards?: BlackjackServerCard[];
  hand?: BlackjackServerCard[];
  player_cards?: BlackjackServerCard[];
  info?: BlackjackServerHandInfo;
  hand_info?: BlackjackServerHandInfo;
  status?: string;
  total?: number;
  soft?: boolean;
  blackjack?: boolean;
  black_jack?: boolean;
  bust?: boolean;
  [key: string]: unknown;
};

export type BlackjackScore = {
  players: Record<string, number>;
  push: number;
};

export type BlackjackRoundResult = {
  winner_user_id?: number | null;
  winner_id?: number | null;
  winner?: string | null;
  result?: string | null;
  [key: string]: unknown;
};

export type BlackjackStateMessage = {
  type: 'state';
  game: 'blackjack_duel' | string;
  lobby_id: string;
  phase: BlackjackServerPhase;
  round: number;
  target_wins: number;
  turn_seconds: number;
  active_user_id: number | null;
  turn_deadline_ms: number | null;
  server_ms: number | null;
  dealer_hidden: boolean;
  dealer_cards: BlackjackServerCard[];
  dealer_info: BlackjackServerHandInfo;
  players: Record<string, BlackjackServerPlayer>;
  player_order: number[];
  score: BlackjackScore;
  round_result?: BlackjackRoundResult;
  message?: string;
  [key: string]: unknown;
};

export type BlackjackErrorMessage = {
  type: 'error';
  error: string;
  details?: string;
};

export type BlackjackIncomingMessage = BlackjackStateMessage | BlackjackErrorMessage;

export type BlackjackSocketHandlers = {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onSocketError?: (event: Event) => void;
  onState?: (state: BlackjackStateMessage) => void;
  onServerError?: (error: BlackjackErrorMessage) => void;
  onRawMessage?: (message: unknown) => void;
};

export type BlackjackSocketClient = {
  socket: WebSocket;
  send: (command: BlackjackClientCommand) => boolean;
  requestState: () => boolean;
  hit: () => boolean;
  stand: () => boolean;
  restartMatch: () => boolean;
  close: () => void;
};

const getWsBaseUrl = () => {
  const url = new URL(API_BASE_URL);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.origin;
};

export const getBlackjackWsUrl = (lobbyId: string, token: string) => {
  const baseUrl = getWsBaseUrl();
  const encodedLobbyId = encodeURIComponent(lobbyId);
  const encodedToken = encodeURIComponent(token);

  return `${baseUrl}/ws/blackjack/${encodedLobbyId}?token=${encodedToken}`;
};

const parseSocketMessage = (event: MessageEvent): unknown => {
  if (typeof event.data !== 'string') return event.data;

  try {
    return JSON.parse(event.data) as unknown;
  } catch {
    return {
      type: 'error',
      error: 'Invalid WebSocket JSON',
    };
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const normalizeStateMessage = (raw: Record<string, unknown>): BlackjackStateMessage => {
  const scoreRaw = isObject(raw.score) ? raw.score : {};
  const playersScoreRaw = isObject(scoreRaw.players) ? scoreRaw.players : {};

  return {
    ...raw,
    type: 'state',
    game: typeof raw.game === 'string' ? raw.game : 'blackjack_duel',
    lobby_id: typeof raw.lobby_id === 'string' ? raw.lobby_id : '',
    phase: typeof raw.phase === 'string' ? (raw.phase as BlackjackServerPhase) : 'dealing',
    round: Number(raw.round || 1),
    target_wins: Number(raw.target_wins || 5),
    turn_seconds: Number(raw.turn_seconds || 10),
    active_user_id:
      raw.active_user_id === null || raw.active_user_id === undefined
        ? null
        : Number(raw.active_user_id),
    turn_deadline_ms:
      raw.turn_deadline_ms === null || raw.turn_deadline_ms === undefined
        ? null
        : Number(raw.turn_deadline_ms),
    server_ms:
      raw.server_ms === null || raw.server_ms === undefined
        ? null
        : Number(raw.server_ms),
    dealer_hidden: Boolean(raw.dealer_hidden),
    dealer_cards: Array.isArray(raw.dealer_cards)
      ? (raw.dealer_cards as BlackjackServerCard[])
      : [],
    dealer_info: isObject(raw.dealer_info)
      ? (raw.dealer_info as BlackjackServerHandInfo)
      : {},
    players: isObject(raw.players)
      ? (raw.players as Record<string, BlackjackServerPlayer>)
      : {},
    player_order: Array.isArray(raw.player_order)
      ? raw.player_order.map(Number).filter(Number.isFinite)
      : [],
    score: {
      players: Object.fromEntries(
        Object.entries(playersScoreRaw).map(([key, value]) => [key, Number(value || 0)]),
      ),
      push: Number(scoreRaw.push || 0),
    },
    round_result: isObject(raw.round_result)
      ? (raw.round_result as BlackjackRoundResult)
      : undefined,
    message: typeof raw.message === 'string' ? raw.message : undefined,
  };
};

export const blackjackWsApi = {
  connect(params: {
    lobbyId: string;
    token: string;
    handlers?: BlackjackSocketHandlers;
  }): BlackjackSocketClient {
    const { lobbyId, token, handlers } = params;
    const socket = new WebSocket(getBlackjackWsUrl(lobbyId, token));

    const send = (command: BlackjackClientCommand) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(command));
      return true;
    };

    socket.addEventListener('open', () => {
      handlers?.onOpen?.();
    });

    socket.addEventListener('close', (event) => {
      handlers?.onClose?.(event);
    });

    socket.addEventListener('error', (event) => {
      handlers?.onSocketError?.(event);
    });

    socket.addEventListener('message', (event) => {
      const rawMessage = parseSocketMessage(event);

      handlers?.onRawMessage?.(rawMessage);

      if (!isObject(rawMessage)) {
        handlers?.onServerError?.({
          type: 'error',
          error: 'Invalid WebSocket message',
        });
        return;
      }

      if (rawMessage.type === 'state') {
        handlers?.onState?.(normalizeStateMessage(rawMessage));
        return;
      }

      if (rawMessage.type === 'error') {
        handlers?.onServerError?.({
          type: 'error',
          error: typeof rawMessage.error === 'string' ? rawMessage.error : 'WebSocket error',
          details: typeof rawMessage.details === 'string' ? rawMessage.details : undefined,
        });
      }
    });

    return {
      socket,
      send,
      requestState: () => send({ type: 'state' }),
      hit: () => send({ type: 'hit' }),
      stand: () => send({ type: 'stand' }),
      restartMatch: () => send({ type: 'restart_match' }),
      close: () => {
        socket.close();
      },
    };
  },
};