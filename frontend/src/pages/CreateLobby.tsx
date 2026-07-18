import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { getGameByCode } from '../data/games';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';

const MIN_BET = 10;
const MAX_BET = 1000;
const presetBets = [50, 100, 250, 500];

const toErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
};

export const CreateLobby = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || 'Игра';
  const userCoins = Math.floor(user?.balance_game ?? 0);
  const betProgress = ((bet - MIN_BET) / (MAX_BET - MIN_BET)) * 100;

  const canCreate =
    Boolean(gameId) &&
    lobbyName.trim().length > 0 &&
    bet >= MIN_BET &&
    bet <= MAX_BET &&
    bet <= userCoins &&
    !isSubmitting;

  const handleCreate = async () => {
    const name = lobbyName.trim();

    if (!gameId) {
      setError('Не найден код игры');
      return;
    }

    if (!name) {
      setError('Введите название лобби');
      return;
    }

    if (bet > userCoins) {
      setError('Недостаточно монет');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.lobbies.create({
        name,
        game: gameId,
        bet_coins: Math.floor(bet),
      });

      navigate(`/game/${response.lobby.game}/lobby/${response.lobby.id}`, {
        replace: true,
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="minimal-page app-scroll app-page">
      <div className="minimal-toolbar">
        <button type="button" onClick={() => navigate(-1)} className="minimal-icon-button press" aria-label="Назад">
          <ChevronLeft size={18} />
        </button>

        <div className="minimal-toolbar-title">
          <span>Новая комната</span>
          <strong>Создать лобби</strong>
        </div>

        <div className="minimal-toolbar-spacer" />
      </div>

      <section className="minimal-game-summary minimal-create-summary">
        <div className="minimal-game-cover">
          {game?.coverUrl ? (
            <img src={game.coverUrl} alt="" draggable={false} />
          ) : (
            <Users size={22} />
          )}
        </div>
        <div className="minimal-game-copy">
          <span>Игра</span>
          <h1>{gameName}</h1>
        </div>
      </section>

      <section className="minimal-form-card">
        <label className="minimal-field">
          <span>Название лобби</span>
          <input
            type="text"
            value={lobbyName}
            onChange={(event) => setLobbyName(event.target.value)}
            placeholder="Например: Быстрая дуэль"
            maxLength={32}
          />
        </label>

        <div className="minimal-form-divider" />

        <div className="minimal-bet-head">
          <div>
            <span className="minimal-field-label">Ставка</span>
            <div className="minimal-bet-value">
              <img src={coinIcon} alt="" draggable={false} />
              <strong>{bet}</strong>
            </div>
          </div>
        </div>

        <div className="minimal-range-wrap">
          <div className="minimal-range-track" aria-hidden="true">
            <span style={{ width: `${betProgress}%` }} />
          </div>
          <input
            id="create-lobby-bet-range"
            type="range"
            min={MIN_BET}
            max={MAX_BET}
            step={10}
            value={bet}
            onChange={(event) => setBet(Number(event.target.value))}
            aria-label="Ставка"
            className="minimal-bet-range"
          />
        </div>

        <div className="minimal-range-values">
          <span>{MIN_BET}</span>
          <span>{MAX_BET}</span>
        </div>

        <div className="minimal-preset-grid">
          {presetBets.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBet(value)}
              className={`minimal-preset-button press ${bet === value ? 'is-active' : ''}`}
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="minimal-alert">{error}</div>}

      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!canCreate}
        className="minimal-primary-button minimal-primary-button-large press"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Создаём
          </>
        ) : (
          'Создать лобби'
        )}
      </button>
    </main>
  );
};
