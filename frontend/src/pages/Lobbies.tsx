import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import { api, ApiError, type Lobby } from '../api';
import { useAuth } from '../auth/useAuth';
import { getGameByCode } from '../data/games';
import { useIntervalWhenVisible } from '../hooks/useIntervalWhenVisible';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';

const POLL_INTERVAL_MS = 3000;

const toErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
};

export const Lobbies = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || gameId || 'Игра';
  const userCoins = Math.floor(user?.balance_game ?? 0);

  const loadLobbies = useCallback(
    async (withSpinner = false) => {
      if (!gameId) {
        setError('Не найден код игры');
        setIsLoading(false);
        return;
      }

      if (withSpinner) setIsRefreshing(true);

      try {
        const response = await api.lobbies.activeByGame(gameId);
        setLobbies(response.lobbies);
        setError(null);
      } catch (requestError) {
        setError(toErrorMessage(requestError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [gameId],
  );

  useIntervalWhenVisible(() => {
    void loadLobbies(false);
  }, POLL_INTERVAL_MS);

  const handleOpenOrJoin = async (lobby: Lobby) => {
    if (joiningLobbyId) return;

    const isUserInLobby = Boolean(user && lobby.players.includes(user.id));
    if (isUserInLobby) {
      navigate(`/game/${lobby.game}/lobby/${lobby.id}`);
      return;
    }

    const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;
    if (!canJoin) return;

    if (lobby.bet_coins > userCoins) {
      setError('Недостаточно монет для этой ставки');
      return;
    }

    setJoiningLobbyId(lobby.id);
    setError(null);

    try {
      const response = await api.lobbies.join(lobby.id);
      navigate(`/game/${response.lobby.game}/lobby/${response.lobby.id}`);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
      await loadLobbies(false);
    } finally {
      setJoiningLobbyId(null);
    }
  };

  return (
    <main className="minimal-page app-scroll app-page">
      <div className="minimal-toolbar">
        <button type="button" onClick={() => navigate(-1)} className="minimal-icon-button press" aria-label="Назад">
          <ChevronLeft size={18} />
        </button>

        <div className="minimal-toolbar-title">
          <span>Лобби</span>
          <strong>{gameName}</strong>
        </div>

        <div className="minimal-toolbar-actions">
          <button
            type="button"
            onClick={() => void loadLobbies(true)}
            disabled={isRefreshing}
            className="minimal-icon-button press"
            aria-label="Обновить"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => gameId && navigate(`/game/${gameId}/create`)}
            disabled={!gameId}
            className="minimal-icon-button minimal-icon-button-primary press"
            aria-label="Создать лобби"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <section className="minimal-game-summary">
        <div className="minimal-game-cover">
          {game?.coverUrl ? (
            <img src={game.coverUrl} alt="" draggable={false} />
          ) : (
            <Users size={22} />
          )}
        </div>

        <div className="minimal-game-copy">
          <h1>{gameName}</h1>
          <p>Выбери свободную комнату или создай свою.</p>
        </div>

      </section>

      <section className="minimal-section">
        <div className="minimal-section-head">
          <div>
            <span className="minimal-section-label">Доступные комнаты</span>
            <h2>Комнаты</h2>
          </div>
          <span className="minimal-counter">{lobbies.length}</span>
        </div>

        {error && <div className="minimal-alert">{error}</div>}

        {isLoading ? (
          <div className="minimal-state">
            <Loader2 size={26} className="animate-spin" />
            <span>Загружаем комнаты</span>
          </div>
        ) : lobbies.length === 0 ? (
          <div className="minimal-empty-state">
            <div className="minimal-empty-icon">
              <Users size={23} />
            </div>
            <h3>Комнат пока нет</h3>
            <p>Создай первую и дождись соперника.</p>
            <button
              type="button"
              onClick={() => gameId && navigate(`/game/${gameId}/create`)}
              className="minimal-primary-button press"
            >
              <Plus size={16} />
              Создать лобби
            </button>
          </div>
        ) : (
          <div className="minimal-room-list">
            {lobbies.map((lobby) => {
              const isUserInLobby = Boolean(user && lobby.players.includes(user.id));
              const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;
              const isJoining = joiningLobbyId === lobby.id;
              const isAffordable = lobby.bet_coins <= userCoins;
              const isDisabled = isJoining || (!isUserInLobby && !canJoin);

              const buttonLabel = isJoining
                ? 'Входим'
                : isUserInLobby
                  ? 'Открыть'
                  : canJoin
                    ? 'Войти'
                    : 'Занято';

              return (
                <article key={lobby.id} className="minimal-room-card">
                  <div className="minimal-room-main">
                    <div className={`minimal-room-status ${canJoin || isUserInLobby ? 'is-online' : ''}`} />
                    <div className="minimal-room-copy">
                      <h3>{lobby.name}</h3>
                      <div className="minimal-room-meta">
                        <span className="minimal-room-bet">
                          <img src={coinIcon} alt="" draggable={false} />
                          {lobby.bet_coins}
                        </span>
                        <span>
                          <Users size={12} />
                          {lobby.player_count}/{lobby.max_players}
                        </span>
                        <span>{lobby.status === 'waiting' ? 'Ожидание' : 'В игре'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleOpenOrJoin(lobby)}
                    disabled={isDisabled}
                    className={`minimal-room-action press ${isUserInLobby ? 'is-open' : ''}`}
                  >
                    {isJoining && <Loader2 size={13} className="animate-spin" />}
                    {buttonLabel}
                  </button>

                  {!isAffordable && !isUserInLobby && canJoin && (
                    <span className="minimal-room-warning">Не хватает монет</span>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
