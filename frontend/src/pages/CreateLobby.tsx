import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Loader2, Minus, Plus, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { getGameByCode } from '../data/games';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import { useLanguage } from '../i18n/LanguageContext';

const FALLBACK_MIN_BET = 2;
const FALLBACK_MAX_BET = 500;
const BET_STEP = 1;
const presetBets = [2, 10, 50, 100, 250, 500];

const clampBet = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
};

export const CreateLobby = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, refreshBalance } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);
  const [minBet, setMinBet] = useState(FALLBACK_MIN_BET);
  const [maxBet, setMaxBet] = useState(FALLBACK_MAX_BET);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameErrorPulse, setNameErrorPulse] = useState(0);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || tr('Game', 'Игра');
  const userCoins = Math.floor(user?.balance_game ?? 0);
  const betProgress = maxBet === minBet
    ? 100
    : ((bet - minBet) / (maxBet - minBet)) * 100;
  const availablePresets = presetBets.filter(
    (value) => value >= minBet && value <= maxBet,
  );
  const minBetTon = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(minBet / 10);

  useEffect(() => {
    let cancelled = false;

    void api.lobbies.games()
      .then((response) => {
        if (cancelled) return;

        const settings = response.games.find((item) => item.code === gameId);
        if (!settings) return;

        const nextMin = Math.max(
          FALLBACK_MIN_BET,
          Math.ceil(settings.min_bet ?? FALLBACK_MIN_BET),
        );
        const nextMax = Math.max(
          nextMin,
          Math.floor(settings.max_bet ?? FALLBACK_MAX_BET),
        );

        setMinBet(nextMin);
        setMaxBet(nextMax);
        setBet((current) => clampBet(current, nextMin, nextMax));
      })
      .catch(() => {
        // The server remains authoritative; safe defaults keep the form usable.
      });

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const canAttemptCreate =
    Boolean(gameId) &&
    bet >= minBet &&
    bet <= maxBet &&
    bet <= userCoins &&
    !isSubmitting;

  const showNameValidation = () => {
    setNameError(tr('Enter a lobby name', 'Заполните название лобби'));
    setNameErrorPulse((current) => current + 1);
    setError(null);

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const handleCreate = async () => {
    const name = lobbyName.trim();

    if (!gameId) {
      setError(tr('Game code not found', 'Не найден код игры'));
      return;
    }

    if (!name) {
      showNameValidation();
      return;
    }

    if (bet > userCoins) {
      setError(tr('Not enough coins', 'Недостаточно монет'));
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
      await refreshBalance();

      navigate(`/game/${response.lobby.game}/lobby/${response.lobby.id}`, {
        replace: true,
      });
    } catch (requestError) {
      setError(toErrorMessage(requestError, tr('Unknown error', 'Неизвестная ошибка')));
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
          aria-label={tr('Back', 'Назад')}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="minimal-toolbar-title">
          <span>{tr('New room', 'Новая комната')}</span>
          <strong>{tr('Create lobby', 'Создать лобби')}</strong>
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
          <span>{tr('Game', 'Игра')}</span>
          <h1>{gameName}</h1>
        </div>
      </section>

      <section className="minimal-form-card">
        <label className="minimal-field">
          <span>{tr('Lobby name', 'Название лобби')}</span>

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
              placeholder={tr('For example: Quick duel', 'Например: Быстрая дуэль')}
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
          <div className="minimal-bet-copy">
            <span className="minimal-field-label">{tr('Bet', 'Ставка')}</span>
            <small>
              {tr('Minimum', 'Минимум')}: {minBet} GAME = {minBetTon} TON
            </small>
          </div>

          <div className="minimal-bet-adjuster">
            <button
              type="button"
              onClick={() => setBet((current) => clampBet(current - BET_STEP, minBet, maxBet))}
              disabled={bet <= minBet}
              className="minimal-bet-step press"
              aria-label={tr('Decrease bet', 'Уменьшить ставку')}
            >
              <Minus size={15} />
            </button>
            <div className="minimal-bet-value">
              <img src={coinIcon} alt="" draggable={false} />
              <strong>{bet}</strong>
            </div>
            <button
              type="button"
              onClick={() => setBet((current) => clampBet(current + BET_STEP, minBet, maxBet))}
              disabled={bet >= maxBet}
              className="minimal-bet-step press"
              aria-label={tr('Increase bet', 'Увеличить ставку')}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        <div className="minimal-range-wrap">
          <div className="minimal-range-track" aria-hidden="true">
            <span style={{ width: `${betProgress}%` }} />
          </div>
          <input
            id="create-lobby-bet-range"
            type="range"
            min={minBet}
            max={maxBet}
            step={BET_STEP}
            value={bet}
            onChange={(event) => setBet(clampBet(Number(event.target.value), minBet, maxBet))}
            aria-label={tr('Bet', 'Ставка')}
            aria-valuetext={`${bet} GAME`}
            className="minimal-bet-range"
          />
        </div>

        <div className="minimal-range-values">
          <span>{minBet} GAME</span>
          <span>{maxBet} GAME</span>
        </div>

        <div className="minimal-preset-grid">
          {availablePresets.map((value) => (
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

      {error && <div className="minimal-alert">{localize(error)}</div>}

      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!canAttemptCreate}
        className="minimal-primary-button minimal-primary-button-large press"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {tr('Creating', 'Создаём')}
          </>
        ) : (
          tr('Create lobby', 'Создать лобби')
        )}
      </button>
    </main>
  );
};
