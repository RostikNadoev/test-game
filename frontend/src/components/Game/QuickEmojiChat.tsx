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
import { getGameByCode } from '../../data/games';
import {
  readActiveGameCode,
  readStoredPlayersInfo,
} from '../../hooks/useLobbyMatchFinish';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  PremiumGameResultModal,
  type ResultTheme,
} from './PremiumGameResultModal';
import { setGamePresencePaused } from './gamePresencePause';

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_BET_STORAGE_KEY = 'twingames_active_bet';

const DEFAULT_PRESENCE_THEME: ResultTheme = {
  background: '#090b13',
  accent: '#9d7cff',
  rival: '#ff7a90',
};

const PRESENCE_THEMES: Record<string, ResultTheme> = {
  plinko_pvp: { background: '#070b16', accent: '#5bb7ff', rival: '#ffb45c' },
  descent_duel: { background: '#09090b', accent: '#d8d9dd', rival: '#858991' },
  paper_io: { background: '#071710', accent: '#54f2a8', rival: '#ff7a90' },
  tower_stack: { background: '#0d0919', accent: '#9d7cff', rival: '#ff9f61' },
  grid_lock: { background: '#090d13', accent: '#39e58c', rival: '#ff5d73' },
  neon_matrix: { background: '#05070c', accent: '#52ffe5', rival: '#ff6d82' },
  dunk_shot: { background: '#17100a', accent: '#f2a65a', rival: '#52ffe5' },
  flappy_race: { background: '#071523', accent: '#4da3ff', rival: '#ff7a90' },
  disc_football: { background: '#07130f', accent: '#52ffe5', rival: '#ff7a90' },
  doodle_jump: { background: '#0d0a19', accent: '#9d7cff', rival: '#52ffe5' },
  crossy_pvp: { background: '#10160b', accent: '#f7c85f', rival: '#ff667b' },
  coin_chase: { background: '#170a12', accent: '#ffd64a', rival: '#9b7cff' },
  cube_fill: { background: '#0d0921', accent: '#f5c94f', rival: '#7653ee' },
  ballz_duel: { background: '#07131a', accent: '#56e3ff', rival: '#ffd64a' },
  draw_drop: { background: '#f4f7fb', accent: '#111111', rival: '#ff5878', ink: '#111111' },
  tilt_maze: { background: '#ddd8cd', accent: '#242321', rival: '#9a7654', ink: '#242321' },
};

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
  const pendingReactionRef = useRef<QuickReactionEmoji | null>(null);
  const localReactionSequenceRef = useRef(0);
  const removalTimersRef = useRef<number[]>([]);
  const routeState = (location.state || {}) as LocationState;
  const gameCode = readActiveGameCode();
  const gameTitle = getGameByCode(gameCode)?.displayName || gameCode || 'PvP';
  const gameTheme = PRESENCE_THEMES[gameCode] || DEFAULT_PRESENCE_THEME;
  const presenceStyle = {
    '--game-presence-bg': gameTheme.background,
    '--game-presence-accent': gameTheme.accent,
  } as CSSProperties;
  const storedPlayers = readStoredPlayersInfo();

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
          onOpen: () => {
            const pending = pendingReactionRef.current;
            if (!pending) return;
            pendingReactionRef.current = null;
            socketRef.current?.send(pending);
          },
          onReaction: (message) => {
            if (message.user_id === Number(user.id)) return;
            showReaction({
              id: `${message.sequence}-${message.sent_at_ms}`,
              emoji: message.emoji,
              side: 'opponent',
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

  useEffect(() => {
    const shouldPause = presence?.status === 'waiting';
    setGamePresencePaused(shouldPause);
    return () => {
      if (shouldPause) setGamePresencePaused(false);
    };
  }, [presence?.status]);

  useEffect(
    () => () => {
      removalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const sendReaction = (emoji: QuickReactionEmoji) => {
    localReactionSequenceRef.current += 1;
    showReaction({
      id: `local-${localReactionSequenceRef.current}-${emoji}`,
      emoji,
      side: 'own',
    });
    const didSend = socketRef.current?.send(emoji) === true;
    pendingReactionRef.current = didSend ? null : emoji;
    setIsOpen(false);
  };

  const leaveResolvedMatch = async () => {
    await Promise.allSettled([refreshBalance(), refreshProfile()]);
    window.sessionStorage.removeItem(ACTIVE_LOBBY_STORAGE_KEY);
    window.sessionStorage.removeItem('twingames_active_game');
    window.sessionStorage.removeItem(ACTIVE_BET_STORAGE_KEY);
    navigate('/', { replace: true });
  };

  const didWin =
    presence?.status === 'resolved' &&
    Boolean(presence.winner_user_id) &&
    presence.winner_user_id === Number(user?.id);
  const isTurboSeries = Boolean(
    window.sessionStorage.getItem('twingames_turbo_series_id'),
  );
  const ownPlayer =
    storedPlayers.find((player) => player.id === Number(user?.id)) ||
    storedPlayers[0];
  const opponentPlayer =
    storedPlayers.find((player) => player.id !== Number(user?.id)) ||
    storedPlayers[1];
  const betCoins = Number(window.sessionStorage.getItem(ACTIVE_BET_STORAGE_KEY)) || 0;
  const technicalNet = presence?.draw
    ? 0
    : didWin
      ? Math.round(betCoins * 0.9 * 100) / 100
      : -betCoins;

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
        <div className="game-presence-overlay" role="status" style={presenceStyle}>
          <div className="game-presence-card">
            <div className="game-presence-orbit" aria-hidden="true" />
            <span className="game-presence-kicker">
              {gameTitle} · {tr('Paused', 'Пауза')}
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
        <PremiumGameResultModal
          gameTitle={gameTitle}
          resultTitle={
            presence.draw
              ? tr('Draw', 'Ничья')
              : didWin
                ? tr('Victory', 'Победа')
                : tr('Defeat', 'Поражение')
          }
          reason={
            presence.draw
              ? tr(
                  'Technical result · both players left the match.',
                  'Технический результат · оба игрока вышли из матча.',
                )
              : tr(
                  'Technical result · the opponent left and did not return.',
                  'Технический результат · соперник вышел и не вернулся.',
                )
          }
          players={[
            {
              id: ownPlayer?.id || Number(user?.id),
              name: ownPlayer?.tg_user || user?.tg_user || tr('You', 'Вы'),
              photoUrl: ownPlayer?.photo_url || user?.photo_url,
            },
            {
              id: opponentPlayer?.id,
              name: opponentPlayer?.tg_user || tr('Opponent', 'Соперник'),
              photoUrl: opponentPlayer?.photo_url,
            },
          ]}
          winnerUserID={presence.winner_user_id}
          draw={presence.draw}
          netResult={technicalNet}
          netLabel={tr('Net result', 'Чистый результат')}
          continueLabel={tr('Continue', 'Продолжить')}
          onContinue={() => void leaveResolvedMatch()}
          theme={gameTheme}
        />
      )}
    </>
  );
};
