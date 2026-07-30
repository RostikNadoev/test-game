import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Play, Plus, RefreshCw, Users, X } from 'lucide-react';
import { api, ApiError, type Lobby } from '../api';
import { useAuth } from '../auth/useAuth';
import { getGameByCode } from '../data/games';
import { useIntervalWhenVisible } from '../hooks/useIntervalWhenVisible';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import defaultGamePreview from '../assets/preview/dunk.webm';
import PlinkoPreview from '../assets/preview/plinko.webm';
import DescentPreview from  '../assets/preview/descent.webm';
import PaperPreview from '../assets/preview/paper.webm';
import TowerPreview from '../assets/preview/tower.webm';
import GridPreview from '../assets/preview/grid.webm';
import MatrixPreview from '../assets/preview/matrix.webm';
import BirdPreview from '../assets/preview/bird.webm';
import CoinPreview from '../assets/preview/coin.webm';
import DrawPreview from '../assets/preview/draw.webm';
import DiscPreview from '../assets/preview/disc.webm';
import JumpPreview from '../assets/preview/jump.webm';
import CrossyPreview from '../assets/preview/crossy.webm';
import FillPreview from '../assets/preview/fill.webm';
import TiltPreview from '../assets/preview/tilt.webm';
import BallsPreview from '../assets/preview/balls.webm';

const POLL_INTERVAL_MS = 3000;

const GAME_PREVIEW_BY_CODE: Partial<Record<string, string>> = {
  plinko_pvp: PlinkoPreview,
  descent_duel: DescentPreview,
  paper_io: PaperPreview,
  tower_stack: TowerPreview,
  grid_lock: GridPreview,
  neon_matrix: MatrixPreview,
  flappy_race: BirdPreview,
  coin_chase: CoinPreview,
  draw_drop: DrawPreview,
  disc_football: DiscPreview,
  doodle_jump: JumpPreview,
  crossy_pvp: CrossyPreview,
  cube_fill: FillPreview,
  tilt_maze: TiltPreview,
  ballz_duel: BallsPreview,
};

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || gameId || 'Игра';
  const userCoins = Math.floor(user?.balance_game ?? 0);
  const previewVideo = (gameId && GAME_PREVIEW_BY_CODE[gameId]) || defaultGamePreview;

  useEffect(() => {
    if (!isPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPreviewOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);

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

      <section className="minimal-game-summary minimal-game-summary-preview">
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

        <button
          type="button"
          onClick={() => setIsPreviewOpen(true)}
          className="minimal-preview-button press"
          aria-haspopup="dialog"
          aria-label={`Открыть превью игры ${gameName}`}
        >
          <Play size={13} fill="currentColor" />
          <span>Превью</span>
        </button>
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

      {isPreviewOpen && (
        <div
          className="game-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Превью игры ${gameName}`}
        >
          <button
            type="button"
            className="game-preview-backdrop"
            onClick={() => setIsPreviewOpen(false)}
            aria-label="Закрыть превью"
          />

          <div className="game-preview-shell">
            <video
              key={previewVideo}
              className="game-preview-video"
              src={previewVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            />

            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="game-preview-close press"
              aria-label="Закрыть превью"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
