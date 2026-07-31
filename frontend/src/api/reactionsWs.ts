import { API_BASE_URL } from './client';

export const QUICK_REACTION_EMOJI = ['🔥', '😂', '👏'] as const;

export type QuickReactionEmoji = (typeof QUICK_REACTION_EMOJI)[number];

export type QuickReactionMessage = {
  type: 'reaction';
  sequence: number;
  user_id: number;
  emoji: QuickReactionEmoji;
  sent_at_ms: number;
  client_id?: string;
};

export type GamePresenceMessage = {
  type: 'presence';
  status: 'active' | 'waiting' | 'resolved';
  disconnected_user_id?: number;
  deadline_ms?: number;
  winner_user_id?: number;
  draw?: boolean;
};

type ReactionHandlers = {
  onOpen?: () => void;
  onReaction?: (message: QuickReactionMessage) => void;
  onPresence?: (message: GamePresenceMessage) => void;
  onClose?: () => void;
};

export type ReactionsSocketClient = {
  send: (emoji: QuickReactionEmoji, clientId?: string) => boolean;
  close: () => void;
};

const getWsBaseUrl = () => {
  if (API_BASE_URL) {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.origin;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

const isReactionMessage = (value: unknown): value is QuickReactionMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;

  return (
    message.type === 'reaction' &&
    typeof message.sequence === 'number' &&
    typeof message.user_id === 'number' &&
    typeof message.sent_at_ms === 'number' &&
    (message.client_id === undefined || typeof message.client_id === 'string') &&
    QUICK_REACTION_EMOJI.includes(message.emoji as QuickReactionEmoji)
  );
};

const isPresenceMessage = (value: unknown): value is GamePresenceMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === 'presence' &&
    (message.status === 'active' ||
      message.status === 'waiting' ||
      message.status === 'resolved')
  );
};

export const connectReactionsSocket = ({
  lobbyId,
  token,
  handlers,
}: {
  lobbyId: string;
  token: string;
  handlers?: ReactionHandlers;
}): ReactionsSocketClient => {
  const socket = new WebSocket(
    `${getWsBaseUrl()}/ws/reactions/${encodeURIComponent(lobbyId)}?token=${encodeURIComponent(token)}`,
  );
  const queuedReactions: Array<{
    emoji: QuickReactionEmoji;
    clientId?: string;
  }> = [];

  socket.addEventListener('open', () => {
    const pending = queuedReactions.splice(0);
    pending.forEach(({ emoji, clientId }) => {
      socket.send(JSON.stringify({ type: 'reaction', emoji, client_id: clientId }));
    });
    handlers?.onOpen?.();
  });

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;

    try {
      const message = JSON.parse(event.data) as unknown;
      if (isReactionMessage(message)) handlers?.onReaction?.(message);
      else if (isPresenceMessage(message)) handlers?.onPresence?.(message);
    } catch {
      // A malformed optional reaction must never interrupt the game.
    }
  });
  socket.addEventListener('close', () => handlers?.onClose?.());

  return {
    send: (emoji, clientId) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'reaction', emoji, client_id: clientId }));
        return true;
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        queuedReactions.push({ emoji, clientId });
        return true;
      }
      return false;
    },
    close: () => socket.close(),
  };
};
