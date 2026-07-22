import { useEffect, useMemo, useRef, useState } from 'react';

type IntroPhase = 'searching' | 'matched' | 'closing';

type TelegramUser = {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initDataUnsafe?: {
    user?: TelegramUser;
  };
};

type Props = {
  gameTitle: string;
  isMatched: boolean;
  onComplete: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  cancelError?: string | null;
  matchedDurationMs?: number;
  opponentName?: string;
  opponentPhotoUrl?: string;
};

const opponents = [
  {
    name: 'ShadowFox',
    avatar: '🦊',
    rank: 'DIAMOND',
    level: 47,
    color: '#76BDFF',
  },
  {
    name: 'NeonWolf',
    avatar: '🐺',
    rank: 'MASTER',
    level: 52,
    color: '#F6C86A',
  },
  {
    name: 'CyberCat',
    avatar: '🐱',
    rank: 'ELITE',
    level: 39,
    color: '#FF9A5E',
  },
  {
    name: 'GhostPanda',
    avatar: '🐼',
    rank: 'PRO',
    level: 44,
    color: '#A78BFA',
  },
  {
    name: 'RocketApe',
    avatar: '🦍',
    rank: 'LEGEND',
    level: 61,
    color: '#F6C86A',
  },
];

const OPPONENT_BADGE_CSS = opponents
  .map(
    (entry, index) => `
        .gi-opponent-${index} .gi-label i {
          background: ${entry.color};
          box-shadow: 0 0 9px ${entry.color};
        }`,
  )
  .join('\n');

const getInitials = (name: string) => {
  const initials = name
    .replace('@', '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || 'TG';
};

const getTelegramUser = () => {
  if (typeof window === 'undefined') {
    return {
      name: 'Игрок',
      photoUrl: '',
    };
  }

  const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();

  return {
    name: fullName || user?.username || 'Игрок',
    photoUrl: user?.photo_url || '',
  };
};

const getOpponentIndex = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash % opponents.length;
};

export const GameIntroOverlay = ({
  gameTitle,
  isMatched,
  onComplete,
  onCancel,
  isCancelling = false,
  cancelError,
  matchedDurationMs = 2400,
  opponentName,
  opponentPhotoUrl,
}: Props) => {
  const [phase, setPhase] = useState<IntroPhase>(isMatched ? 'matched' : 'searching');
  const onCompleteRef = useRef(onComplete);
  const completeStartedRef = useRef(false);

  const user = useMemo(() => getTelegramUser(), []);

  const opponentIndex = useMemo(() => getOpponentIndex(gameTitle), [gameTitle]);

  const opponent = useMemo(() => opponents[opponentIndex], [opponentIndex]);

  const realOpponentName = opponentName?.trim() || opponent.name;
  const realOpponentPhotoUrl = opponentPhotoUrl?.trim() || '';

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isMatched) {
      completeStartedRef.current = false;
      const frameId = window.requestAnimationFrame(() => {
        setPhase('searching');
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    if (completeStartedRef.current) return;

    completeStartedRef.current = true;

    const matchedFrameId = window.requestAnimationFrame(() => {
      setPhase('matched');
    });

    const closingTimer = window.setTimeout(() => {
      setPhase('closing');
    }, matchedDurationMs);

    const completeTimer = window.setTimeout(() => {
      onCompleteRef.current();
    }, matchedDurationMs + 520);

    return () => {
      window.cancelAnimationFrame(matchedFrameId);
      window.clearTimeout(closingTimer);
      window.clearTimeout(completeTimer);
    };
  }, [isMatched, matchedDurationMs]);

  const showMatchedState = phase === 'matched' || phase === 'closing';

  return (
    <div className={`gi-overlay gi-${phase}`}>
      <style>{`
        .gi-overlay {
          --gold: #F6C86A;
          --blue: #76BDFF;
          --orange: #FF9A5E;
          --panel: rgba(14, 14, 21, .88);

          position: absolute;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 18px;
          color: white;
          isolation: isolate;
          background:
            radial-gradient(circle at 50% -8%, rgba(255,255,255,.045), transparent 34%),
            linear-gradient(180deg, rgba(9,9,13,.98) 0%, rgba(9,9,13,.985) 100%);
          animation: giOverlayIn .18s ease both;
        }

        .gi-closing {
          pointer-events: none;
          animation: giOverlayOut .48s cubic-bezier(.22,1,.36,1) both;
        }

        .gi-overlay::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -2;
          background:
            radial-gradient(circle at 15% 8%, rgba(47,140,255,.10), transparent 30%),
            radial-gradient(circle at 88% 12%, rgba(255,154,66,.09), transparent 30%),
            radial-gradient(circle at 50% 100%, rgba(246,200,106,.055), transparent 36%);
          opacity: .95;
        }

        .gi-overlay::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(circle at 50% 48%, transparent 0 38%, rgba(0,0,0,.42) 100%);
          pointer-events: none;
        }

        .gi-shell {
          width: min(100%, 372px);
          animation: giShellIn .34s cubic-bezier(.22,1,.36,1) both;
        }

        .gi-card {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.045);
          background:
            linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.022)),
            var(--panel);
          box-shadow:
            0 26px 80px rgba(0,0,0,.54),
            inset 0 1px 0 rgba(255,255,255,.065);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          padding: 15px;
        }

        .gi-card::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255,255,255,.065), transparent 32%),
            radial-gradient(circle at 88% 0%, rgba(255,255,255,.035), transparent 28%);
          opacity: .72;
        }

        .gi-head {
          position: relative;
          z-index: 2;
          text-align: center;
          padding: 2px 6px 14px;
        }

        .gi-kicker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 23px;
          padding: 0 10px;
          border-radius: 999px;
          background:
            linear-gradient(135deg, rgba(47,140,255,.10), rgba(255,154,66,.08)),
            rgba(255,255,255,.035);
          color: rgba(255,255,255,.52);
          font-size: 7.5px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .gi-kicker i {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: ${showMatchedState ? '#22c55e' : '#F6C86A'};
          box-shadow: 0 0 12px ${showMatchedState ? 'rgba(34,197,94,.55)' : 'rgba(246,200,106,.45)'};
        }

        .gi-title {
          margin-top: 10px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          font-size: clamp(18px, 5.2vw, 23px);
          line-height: 1.18;
          font-weight: 900;
          letter-spacing: -.045em;
        }

        .gi-subtitle {
          margin: 6px auto 0;
          max-width: 260px;
          color: rgba(255,255,255,.42);
          font-size: 10px;
          line-height: 1.55;
          font-weight: 700;
        }

        .gi-match {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 9px;
          padding: 5px 0 2px;
        }

        .gi-player {
          min-width: 0;
          display: grid;
          justify-items: center;
          gap: 8px;
        }

        .gi-avatar-wrap {
          position: relative;
          width: 78px;
          height: 78px;
          display: grid;
          place-items: center;
          border-radius: 25px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 46%),
            rgba(255,255,255,.04);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.065),
            0 15px 34px rgba(0,0,0,.22);
        }

        .gi-avatar {
          width: 55px;
          height: 55px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 19px;
          background:
            linear-gradient(135deg, rgba(47,140,255,.12), rgba(255,154,66,.10)),
            rgba(255,255,255,.04);
          color: white;
          font-size: 17px;
          font-weight: 900;
          letter-spacing: -.035em;
        }

        .gi-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gi-opponent .gi-avatar {
          font-size: 17px;
        }

        .gi-loader {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 2px solid rgba(255,255,255,.08);
          border-top-color: var(--gold);
          animation: giSpin .78s linear infinite;
        }

        .gi-name {
          max-width: 100px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          text-align: center;
          font-size: 10.5px;
          line-height: 1.25;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .gi-label {
          min-height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(0,0,0,.16);
          color: rgba(255,255,255,.38);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .gi-label i {
          width: 4px;
          height: 4px;
          border-radius: 999px;
        }

        .gi-you .gi-label i {
          background: #F6C86A;
          box-shadow: 0 0 9px #F6C86A;
        }

        ${OPPONENT_BADGE_CSS}

        .gi-vs {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background:
            linear-gradient(135deg, rgba(47,140,255,.10), rgba(255,154,66,.10)),
            rgba(255,255,255,.045);
          color: rgba(255,255,255,.75);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: -.025em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.065);
        }

        .gi-opponent-ready {
          animation: giOpponentIn .32s cubic-bezier(.22,1,.36,1) both;
        }

        .gi-footer {
          position: relative;
          z-index: 2;
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .gi-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 38px;
          border-radius: 19px;
          background: rgba(255,255,255,.035);
          padding: 0 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
        }

        .gi-status-text {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          color: rgba(255,255,255,.55);
          font-size: 8.5px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .gi-status-text i {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: ${showMatchedState ? '#22c55e' : '#F6C86A'};
          box-shadow: 0 0 12px ${showMatchedState ? 'rgba(34,197,94,.55)' : 'rgba(246,200,106,.45)'};
        }

        .gi-status-code {
          color: rgba(255,255,255,.28);
          font-size: 7.5px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .gi-cancel-button {
          width: 100%;
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid rgba(255, 122, 144, .17);
          border-radius: 17px;
          background:
            linear-gradient(180deg, rgba(255, 122, 144, .085), rgba(255, 122, 144, .045)),
            rgba(255,255,255,.018);
          color: rgba(255, 190, 201, .88);
          font: inherit;
          font-size: 8.5px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .14em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.045),
            0 10px 24px rgba(0,0,0,.14);
          transition:
            transform .16s ease,
            border-color .16s ease,
            background .16s ease,
            color .16s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .gi-cancel-button:hover {
          border-color: rgba(255, 122, 144, .28);
          background:
            linear-gradient(180deg, rgba(255, 122, 144, .12), rgba(255, 122, 144, .06)),
            rgba(255,255,255,.024);
          color: #FFD4DB;
        }

        .gi-cancel-button:active {
          transform: scale(.985);
        }

        .gi-cancel-button:disabled {
          cursor: default;
          opacity: .62;
          transform: none;
        }

        .gi-cancel-icon {
          position: relative;
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }

        .gi-cancel-icon::before,
        .gi-cancel-icon::after {
          content: "";
          position: absolute;
          top: 6px;
          left: 1px;
          width: 12px;
          height: 1.5px;
          border-radius: 999px;
          background: currentColor;
        }

        .gi-cancel-icon::before {
          transform: rotate(45deg);
        }

        .gi-cancel-icon::after {
          transform: rotate(-45deg);
        }

        .gi-cancel-spinner {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
          border-radius: 999px;
          border: 1.5px solid rgba(255,255,255,.16);
          border-top-color: currentColor;
          animation: giSpin .72s linear infinite;
        }

        .gi-cancel-error {
          border: 1px solid rgba(255, 122, 144, .18);
          border-radius: 14px;
          background: rgba(255, 122, 144, .075);
          padding: 9px 11px;
          color: rgba(255, 190, 201, .9);
          text-align: center;
          font-size: 9px;
          line-height: 1.4;
          font-weight: 800;
        }

        .gi-progress {
          position: relative;
          height: 4px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.065);
        }

        .gi-progress i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--blue), rgba(255,255,255,.9), var(--orange));
          box-shadow: 0 0 14px rgba(118,189,255,.18);
        }

        .gi-searching .gi-progress i {
          width: 36%;
          animation: giProgressSearch 1.08s ease-in-out infinite;
        }

        .gi-matched .gi-progress i,
        .gi-closing .gi-progress i {
          width: 100%;
          animation: giProgressComplete .3s ease both;
        }

        @keyframes giOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes giOverlayOut {
          from {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }

          to {
            opacity: 0;
            transform: scale(1.012);
            filter: blur(5px);
          }
        }

        @keyframes giShellIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(.985);
            filter: blur(7px);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes giOpponentIn {
          from {
            opacity: 0;
            transform: translateY(5px) scale(.97);
            filter: blur(6px);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes giSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes giProgressSearch {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(285%); }
        }

        @keyframes giProgressComplete {
          from { width: 68%; }
          to { width: 100%; }
        }

        @media (max-width: 390px) {
          .gi-overlay {
            padding: 14px;
          }

          .gi-card {
            border-radius: 26px;
            padding: 14px;
          }

          .gi-match {
            gap: 7px;
          }

          .gi-avatar-wrap {
            width: 72px;
            height: 72px;
            border-radius: 23px;
          }

          .gi-avatar {
            width: 50px;
            height: 50px;
            border-radius: 18px;
            font-size: 15px;
          }

          .gi-opponent .gi-avatar {
            font-size: 15px;
          }

          .gi-name {
            max-width: 86px;
            font-size: 10px;
          }

          .gi-vs {
            width: 34px;
            height: 34px;
            border-radius: 14px;
            font-size: 10px;
          }

          .gi-status {
            min-height: 36px;
          }

          .gi-status-text {
            font-size: 8px;
          }

          .gi-status-code {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gi-overlay,
          .gi-closing,
          .gi-shell,
          .gi-opponent-ready,
          .gi-progress i,
          .gi-loader {
            animation: none;
          }
        }
      `}</style>

      <div className="gi-shell">
        <div className="gi-card">
          <div className="gi-head">
            <div className="gi-kicker">
              <i />
              Matchmaking
            </div>

            <div className="gi-title">{gameTitle}</div>

            <div className="gi-subtitle">
              {showMatchedState
                ? 'Противник найден. Готовим арену.'
                : 'Ждем второго игрока для дуэли.'}
            </div>
          </div>

          <div className="gi-match">
            <div className="gi-player gi-you">
              <div className="gi-avatar-wrap">
                <div className="gi-avatar">
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt={user.name} />
                  ) : (
                    getInitials(user.name)
                  )}
                </div>
              </div>

              <div className="gi-name">{user.name}</div>

              <div className="gi-label">
                <i />
                You
              </div>
            </div>

            <div className="gi-vs">VS</div>

            <div
              className={`gi-player gi-opponent gi-opponent-${opponentIndex} ${showMatchedState ? 'gi-opponent-ready' : ''}`}
            >
              <div className="gi-avatar-wrap">
                {showMatchedState ? (
                  <div className="gi-avatar">
                    {realOpponentPhotoUrl ? (
                      <img src={realOpponentPhotoUrl} alt={realOpponentName} />
                    ) : (
                      getInitials(realOpponentName)
                    )}
                  </div>
                ) : (
                  <div className="gi-loader" />
                )}
              </div>

              <div className="gi-name">
                {showMatchedState ? realOpponentName : 'Поиск'}
              </div>

              <div className="gi-label">
                <i />
                {showMatchedState ? 'Opponent' : 'Wait'}
              </div>
            </div>
          </div>

          <div className="gi-footer">
            <div className="gi-status">
              <div className="gi-status-text">
                <i />
                {showMatchedState ? 'Connected' : 'Searching'}
              </div>

              <div className="gi-status-code">
                TwinGames
              </div>
            </div>

            <div className="gi-progress">
              <i />
            </div>

            {!showMatchedState && onCancel && (
              <button
                type="button"
                className="gi-cancel-button"
                onClick={onCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <span className="gi-cancel-spinner" aria-hidden="true" />
                ) : (
                  <span className="gi-cancel-icon" aria-hidden="true" />
                )}
                {isCancelling ? 'Отменяем поиск' : 'Отменить поиск'}
              </button>
            )}

            {!showMatchedState && cancelError && (
              <div className="gi-cancel-error" role="alert">
                {cancelError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};