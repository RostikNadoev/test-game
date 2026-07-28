export type TiltMazeServerPhase = 'waiting' | 'countdown' | 'playing' | 'finished';

export type TiltMazePlayerState = {
  user_id: number;
  finished: boolean;
  finish_ms: number;
  remaining: number;
  x: number;
  y: number;
};

export type TiltMazeStateMessage = {
  type: 'state';
  game: 'tilt_maze';
  lobby_id: string;
  phase: TiltMazeServerPhase;
  ready: boolean;
  server_ms: number;
  seed: number;
  player_order: number[];
  players: TiltMazePlayerState[];
  bet_coins: number;
  winner_profit: number;
  countdown_ends_ms?: number;
  match_starts_ms?: number;
  match_ends_ms?: number;
  winner_user_id?: number;
  draw?: boolean;
  message?: string;
};

export type TiltMazeSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (message: string) => void;
  onState?: (state: TiltMazeStateMessage) => void;
};

type ConnectOptions = {
  lobbyId: string;
  token: string;
  handlers?: TiltMazeSocketHandlers;
};

const getWsBase = () => {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (configured) {
    const url = new URL(configured, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const buildWsUrl = (lobbyId: string, token: string) => {
  const base = getWsBase();
  return `${base}/ws/tilt-maze/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`;
};

export class TiltMazeSocketClient {
  private socket: WebSocket | null = null;
  private readonly lobbyId: string;
  private readonly token: string;
  private readonly handlers: TiltMazeSocketHandlers;
  private closedByClient = false;

  constructor(options: ConnectOptions) {
    this.lobbyId = options.lobbyId;
    this.token = options.token;
    this.handlers = options.handlers || {};
  }

  connect() {
    this.closedByClient = false;
    const socket = new WebSocket(buildWsUrl(this.lobbyId, this.token));
    this.socket = socket;

    socket.onopen = () => {
      this.handlers.onOpen?.();
      this.requestState();
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as TiltMazeStateMessage | { error?: string };
        if ('error' in payload && payload.error) {
          this.handlers.onError?.(payload.error);
          return;
        }
        if ('type' in payload && payload.type === 'state' && payload.game === 'tilt_maze') {
          this.handlers.onState?.(payload);
        }
      } catch {
        this.handlers.onError?.('Invalid Tilt Maze websocket payload');
      }
    };

    socket.onerror = () => {
      this.handlers.onError?.('Tilt Maze websocket error');
    };

    socket.onclose = () => {
      this.socket = null;
      this.handlers.onClose?.();
    };
  }

  isClosedByClient() {
    return this.closedByClient;
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  requestState() {
    return this.send({ type: 'state' });
  }

  sendPosition(x: number, y: number) {
    return this.send({ type: 'position', x, y });
  }

  sendFinish(x: number, y: number) {
    return this.send({ type: 'finish', x, y });
  }

  ping() {
    return this.send({ type: 'ping' });
  }

  close() {
    this.closedByClient = true;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }
}

export const tiltMazeWsApi = {
  connect(options: ConnectOptions) {
    const client = new TiltMazeSocketClient(options);
    client.connect();
    return client;
  },
};
