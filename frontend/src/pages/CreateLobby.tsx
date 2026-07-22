import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Loader2, Users } from 'lucide-react';
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
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameErrorPulse, setNameErrorPulse] = useState(0);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || 'Игра';
  const userCoins = Math.floor(user?.balance_game ?? 0);
  const betProgress = ((bet - MIN_BET) / (MAX_BET - MIN_BET)) * 100;

  const canAttemptCreate =
    Boolean(gameId) &&
    bet >= MIN_BET &&
    bet <= MAX_BET &&
    bet <= userCoins &&
    !isSubmitting;

  const showNameValidation = () => {
    setNameError('Заполните название лобби');
    setNameErrorPulse((current) => current + 1);
    setError(null);

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const handleCreate = async () => {
    const name = lobbyName.trim();

    if (!gameId) {
      setError('Не найден код игры');
      return;
    }

    if (!name) {
      showNameValidation();
      return;
    }

    if (bet > userCoins) {
      setError('Недостаточно монет');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNameError(null);

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
      <style>{`
        .create-lobby-name-wrap {
          position: relative;
          border-radius: 16px;
          transition:
            border-color .18s ease,
            background .18s ease,
            box-shadow .18s ease;
        }

        .create-lobby-name-wrap.is-invalid {
          background: rgba(255, 122, 144, .055);
          box-shadow:
            0 0 0 1px rgba(255, 122, 144, .28),
            0 10px 28px rgba(255, 82, 112, .07);
        }

        .create-lobby-name-wrap.is-invalid input {
          border-color: rgba(255, 122, 144, .42);
          color: #fff;
        }

        .create-lobby-name-wrap.is-invalid input::placeholder {
          color: rgba(255, 179, 190, .5);
        }

        .create-lobby-name-wrap.shake-even {
          animation: createLobbyFieldShakeEven .34s ease;
        }

        .create-lobby-name-wrap.shake-odd {
          animation: createLobbyFieldShakeOdd .34s ease;
        }

        .minimal-field > .create-lobby-name-error {
          margin-top: 8px;
          margin-bottom: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          color: #FFB3BE;
          font-size: 10px;
          line-height: 1.35;
          font-weight: 800;
          letter-spacing: normal;
          text-transform: none;
          animation: createLobbyErrorIn .2s ease both;
        }

        .minimal-field > .create-lobby-name-error svg {
          flex: 0 0 auto;
          color: #FF7A90;
        }

        @keyframes createLobbyFieldShakeEven {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          50% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
        }

        @keyframes createLobbyFieldShakeOdd {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(4px); }
          50% { transform: translateX(-4px); }
          75% { transform: translateX(2px); }
        }

        @keyframes createLobbyErrorIn {
          from {
            opacity: 0;
            transform: translateY(-3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .create-lobby-name-wrap.shake-even,
          .create-lobby-name-wrap.shake-odd,
          .create-lobby-name-error {
            animation: none;
          }
        }
      `}</style>

      <div className="minimal-toolbar">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="minimal-icon-button press"
          aria-label="Назад"
        >
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

          <div
            className={`create-lobby-name-wrap ${
              nameError
                ? `is-invalid ${nameErrorPulse % 2 === 0 ? 'shake-even' : 'shake-odd'}`
                : ''
            }`}
          >
            <input
              ref={nameInputRef}
              type="text"
              value={lobbyName}
              onChange={(event) => {
                const nextValue = event.target.value;
                setLobbyName(nextValue);

                if (nextValue.trim()) {
                  setNameError(null);
                }
              }}
              placeholder="Например: Быстрая дуэль"
              maxLength={32}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'create-lobby-name-error' : undefined}
            />
          </div>

          {nameError && (
            <span
              id="create-lobby-name-error"
              className="create-lobby-name-error"
              role="alert"
            >
              <AlertCircle size={14} />
              {nameError}
            </span>
          )}
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
        disabled={!canAttemptCreate}
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
