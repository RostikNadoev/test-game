import { MessageCircleMore, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  connectReactionsSocket,
  QUICK_REACTION_EMOJI,
  type QuickReactionEmoji,
  type GamePresenceMessage,
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
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const { tr } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [visibleReactions, setVisibleReactions] = useState<VisibleReaction[]>([]);
  const [presence, setPresence] = useState<GamePresenceMessage | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(10);
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
          onPresence: (message) => {
            setPresence(message.status === 'active' ? null : message);
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

  useEffect(() => {
    if (presence?.status !== 'waiting' || !presence.deadline_ms) return;

    const update = () => {
      setSecondsLeft(
        Math.max(0, Math.ceil((presence.deadline_ms! - Date.now()) / 1000)),
      );
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [presence]);

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

  const leaveResolvedMatch = async () => {
    await Promise.allSettled([refreshBalance(), refreshProfile()]);
    window.sessionStorage.removeItem(ACTIVE_LOBBY_STORAGE_KEY);
    window.sessionStorage.removeItem('twingames_active_game');
    navigate('/', { replace: true });
  };

  const didWin =
    presence?.status === 'resolved' &&
    Boolean(presence.winner_user_id) &&
    presence.winner_user_id === Number(user?.id);
  const isTurboSeries = Boolean(
    window.sessionStorage.getItem('twingames_turbo_series_id'),
  );

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

      {presence?.status === 'waiting' && (
        <div className="game-presence-overlay" role="status">
          <div className="game-presence-card">
            <div className="game-presence-orbit" aria-hidden="true" />
            <span className="game-presence-kicker">
              {tr('Connection paused', 'Соединение приостановлено')}
            </span>
            <strong>{secondsLeft}</strong>
            <h2>{tr('Waiting for opponent', 'Ожидаем соперника')}</h2>
            <p>
              {tr(
                'The match will continue automatically if they return.',
                'Матч продолжится автоматически, если игрок вернётся.',
              )}
            </p>
          </div>
        </div>
      )}

      {presence?.status === 'resolved' && !isTurboSeries && (
        <div className="game-presence-overlay is-result" role="dialog" aria-modal="true">
          <div className="game-presence-card">
            <span className="game-presence-kicker">
              {tr('Match complete', 'Матч завершён')}
            </span>
            <strong className="game-presence-result-icon">
              {presence.draw ? '–' : didWin ? '✓' : '×'}
            </strong>
            <h2>
              {presence.draw
                ? tr('Draw', 'Ничья')
                : didWin
                  ? tr('Technical victory', 'Техническая победа')
                  : tr('Defeat', 'Поражение')}
            </h2>
            <p>
              {presence.draw
                ? tr('Both players left. The bet has been returned.', 'Оба игрока вышли. Ставка возвращена.')
                : didWin
                  ? tr('The opponent did not return. Your prize has been credited.', 'Соперник не вернулся. Приз зачислен.')
                  : tr('The reconnect timer expired.', 'Время на возвращение истекло.')}
            </p>
            <button type="button" onClick={() => void leaveResolvedMatch()}>
              {tr('Continue', 'Продолжить')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
