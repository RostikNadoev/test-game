import { MessageCircleMore, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  connectReactionsSocket,
  QUICK_REACTION_EMOJI,
  type QuickReactionEmoji,
  type ReactionsSocketClient,
} from '../../api/reactionsWs';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/LanguageContext';

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';

type LocationState = {
  lobbyId?: string;
};

type VisibleReaction = {
  id: string;
  emoji: QuickReactionEmoji;
  side: 'own' | 'opponent';
};

export const QuickEmojiChat = () => {
  const location = useLocation();
  const { token, user } = useAuth();
  const { tr } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [visibleReactions, setVisibleReactions] = useState<VisibleReaction[]>([]);
  const socketRef = useRef<ReactionsSocketClient | null>(null);
  const removalTimersRef = useRef<number[]>([]);
  const routeState = (location.state || {}) as LocationState;

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);

    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      window.sessionStorage.getItem(ACTIVE_LOBBY_STORAGE_KEY) ||
      ''
    );
  }, [location.search, routeState.lobbyId]);

  const showReaction = useCallback(
    (reaction: VisibleReaction) => {
      setVisibleReactions((current) => [...current.slice(-2), reaction]);

      const timer = window.setTimeout(() => {
        setVisibleReactions((current) =>
          current.filter((item) => item.id !== reaction.id),
        );
      }, 2300);
      removalTimersRef.current.push(timer);
    },
    [],
  );

  useEffect(() => {
    if (!lobbyId || !token || !user?.id) return;

    let disposed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      socketRef.current = connectReactionsSocket({
        lobbyId,
        token,
        handlers: {
          onReaction: (message) => {
            showReaction({
              id: `${message.sequence}-${message.sent_at_ms}`,
              emoji: message.emoji,
              side: message.user_id === Number(user.id) ? 'own' : 'opponent',
            });
          },
          onClose: () => {
            socketRef.current = null;
            if (!disposed) {
              reconnectTimer = window.setTimeout(connect, 1200);
            }
          },
        },
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [lobbyId, showReaction, token, user?.id]);

  useEffect(
    () => () => {
      removalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const sendReaction = (emoji: QuickReactionEmoji) => {
    if (socketRef.current?.send(emoji)) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <div className={`quick-emoji-chat ${isOpen ? 'is-open' : ''}`}>
        <button
          type="button"
          className="quick-emoji-trigger"
          onClick={() => setIsOpen((current) => !current)}
          aria-label={tr(
            isOpen ? 'Close quick reactions' : 'Open quick reactions',
            isOpen ? 'Закрыть быстрые реакции' : 'Открыть быстрые реакции',
          )}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={16} /> : <MessageCircleMore size={17} />}
        </button>

        {isOpen && (
          <div className="quick-emoji-menu">
            {QUICK_REACTION_EMOJI.map((emoji, index) => (
              <button
                key={emoji}
                type="button"
                style={{ '--emoji-index': index } as CSSProperties}
                onClick={() => sendReaction(emoji)}
                aria-label={tr(`Send ${emoji} reaction`, `Отправить реакцию ${emoji}`)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="quick-reaction-stage" aria-live="polite">
        {visibleReactions.map((reaction) => (
          <span
            key={reaction.id}
            className={`quick-reaction-burst is-${reaction.side}`}
          >
            {reaction.emoji}
          </span>
        ))}
      </div>
    </>
  );
};
