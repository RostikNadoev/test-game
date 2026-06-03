import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

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
  onComplete: () => void;
};

const opponents = [
  {
    name: 'ShadowFox',
    avatar: '🦊',
    rank: 'DIAMOND',
    level: 47,
    color: '#52FFE5',
  },
  {
    name: 'NeonWolf',
    avatar: '🐺',
    rank: 'MASTER',
    level: 52,
    color: '#9D7CFF',
  },
  {
    name: 'CyberCat',
    avatar: '🐱',
    rank: 'ELITE',
    level: 39,
    color: '#FF7A90',
  },
  {
    name: 'GhostPanda',
    avatar: '🐼',
    rank: 'PRO',
    level: 44,
    color: '#54F2A8',
  },
  {
    name: 'RocketApe',
    avatar: '🦍',
    rank: 'LEGEND',
    level: 61,
    color: '#F2C766',
  },
];

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

const getInitials = (name: string) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || 'TG';
};

const getTelegramUser = () => {
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

export const GameIntroOverlay = ({ gameTitle, onComplete }: Props) => {
  const [phase, setPhase] = useState<IntroPhase>('searching');
  const onCompleteRef = useRef(onComplete);

  const user = useMemo(() => getTelegramUser(), []);

  const opponent = useMemo(() => {
    return opponents[getOpponentIndex(gameTitle)];
  }, [gameTitle]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setPhase('searching');

    const matchedTimer = window.setTimeout(() => {
      setPhase('matched');
    }, 1500);

    const closingTimer = window.setTimeout(() => {
      setPhase('closing');
    }, 3550);

    const completeTimer = window.setTimeout(() => {
      onCompleteRef.current();
    }, 4200);

    return () => {
      window.clearTimeout(matchedTimer);
      window.clearTimeout(closingTimer);
      window.clearTimeout(completeTimer);
    };
  }, [gameTitle]);

  const isMatched = phase === 'matched' || phase === 'closing';

  return (
    <div className={`gi-overlay gi-${phase}`}>
      <style>{`
        .gi-overlay {
          --gold: #F2C766;
          --mint: #52FFE5;
          --dark: #050507;

          position: absolute;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 22px;
          color: white;
          isolation: isolate;
          background:
            radial-gradient(circle at 50% 0%, rgba(242, 199, 102, .10), transparent 34%),
            radial-gradient(circle at 100% 20%, rgba(82, 255, 229, .075), transparent 30%),
            linear-gradient(180deg, rgba(3, 3, 5, .98) 0%, rgba(8, 8, 12, .98) 50%, rgba(3, 3, 5, .98) 100%);
          animation: giOverlayIn .18s ease both;
        }

        .gi-closing {
          pointer-events: none;
          animation: giOverlayOut .54s cubic-bezier(.2,.8,.2,1) both;
        }

        .gi-overlay::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -2;
          opacity: .18;
          background:
            linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: linear-gradient(to bottom, black 0%, transparent 76%);
        }

        .gi-overlay::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 36%, rgba(0,0,0,.48) 100%);
          pointer-events: none;
        }

        .gi-shell {
          width: min(100%, 390px);
          animation: giShellIn .34s cubic-bezier(.16,1,.3,1) both;
        }

        .gi-card {
          position: relative;
          overflow: hidden;
          border-radius: 34px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035)),
            rgba(8,8,12,.9);
          box-shadow:
            0 28px 90px rgba(0,0,0,.56),
            inset 0 1px 0 rgba(255,255,255,.10);
          backdrop-filter: blur(26px);
          padding: 18px;
        }

        .gi-card::before {
          content: "";
          position: absolute;
          left: 38px;
          right: 38px;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
        }

        .gi-head {
          position: relative;
          z-index: 2;
          text-align: center;
          padding: 4px 8px 18px;
        }

        .gi-kicker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 27px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.045);
          color: rgba(255,255,255,.46);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .22em;
          text-transform: uppercase;
        }

        .gi-kicker i {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: ${isMatched ? '#22c55e' : '#F2C766'};
          box-shadow: 0 0 14px ${isMatched ? 'rgba(34,197,94,.72)' : 'rgba(242,199,102,.62)'};
        }

        .gi-title {
          margin-top: 13px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          font-size: clamp(25px, 7vw, 34px);
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.075em;
        }

        .gi-subtitle {
          margin: 8px auto 0;
          max-width: 270px;
          color: rgba(255,255,255,.43);
          font-size: 12px;
          line-height: 1.45;
          font-weight: 800;
        }

        .gi-match {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          padding: 8px 0 4px;
        }

        .gi-player {
          min-width: 0;
          display: grid;
          justify-items: center;
          gap: 10px;
        }

        .gi-avatar-wrap {
          position: relative;
          width: 92px;
          height: 92px;
          display: grid;
          place-items: center;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 46%),
            rgba(255,255,255,.045);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            0 18px 42px rgba(0,0,0,.26);
        }

        .gi-avatar-wrap::after {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.05);
          pointer-events: none;
        }

        .gi-avatar {
          width: 66px;
          height: 66px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 23px;
          background:
            linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02)),
            #0D0D13;
          color: white;
          font-size: 22px;
          font-weight: 1000;
          letter-spacing: -.04em;
        }

        .gi-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gi-opponent .gi-avatar {
          font-size: 33px;
        }

        .gi-loader {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 2px solid rgba(255,255,255,.10);
          border-top-color: var(--gold);
          animation: giSpin .78s linear infinite;
        }

        .gi-name {
          max-width: 112px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          text-align: center;
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.035em;
        }

        .gi-label {
          min-height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 9px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.07);
          background: rgba(0,0,0,.18);
          color: rgba(255,255,255,.40);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .gi-label i {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: var(--badge-color);
          box-shadow: 0 0 10px var(--badge-color);
        }

        .gi-vs {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.07);
          color: rgba(255,255,255,.82);
          font-size: 13px;
          font-weight: 1000;
          letter-spacing: -.05em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }

        .gi-opponent-ready {
          animation: giOpponentIn .34s cubic-bezier(.16,1,.3,1) both;
        }

        .gi-footer {
          position: relative;
          z-index: 2;
          margin-top: 18px;
          display: grid;
          gap: 12px;
        }

        .gi-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 42px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.045);
          padding: 0 13px;
        }

        .gi-status-text {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .gi-status-text i {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: ${isMatched ? '#22c55e' : '#F2C766'};
          box-shadow: 0 0 14px ${isMatched ? 'rgba(34,197,94,.72)' : 'rgba(242,199,102,.62)'};
        }

        .gi-status-code {
          color: rgba(255,255,255,.30);
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .gi-progress {
          position: relative;
          height: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.075);
        }

        .gi-progress i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--gold), var(--mint));
          box-shadow: 0 0 18px rgba(82,255,229,.20);
        }

        .gi-searching .gi-progress i {
          width: 38%;
          animation: giProgressSearch 1.08s ease-in-out infinite;
        }

        .gi-matched .gi-progress i,
        .gi-closing .gi-progress i {
          width: 100%;
          animation: giProgressComplete .32s ease both;
        }

        @keyframes giOverlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes giOverlayOut {
          from {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }

          to {
            opacity: 0;
            transform: scale(1.015);
            filter: blur(6px);
          }
        }

        @keyframes giShellIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(.98);
            filter: blur(8px);
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
            transform: translateY(6px) scale(.96);
            filter: blur(7px);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes giSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes giProgressSearch {
          0% {
            transform: translateX(-120%);
          }

          100% {
            transform: translateX(280%);
          }
        }

        @keyframes giProgressComplete {
          from {
            width: 68%;
          }

          to {
            width: 100%;
          }
        }

        @media (max-width: 390px) {
          .gi-overlay {
            padding: 16px;
          }

          .gi-card {
            border-radius: 30px;
            padding: 16px;
          }

          .gi-match {
            gap: 7px;
          }

          .gi-avatar-wrap {
            width: 82px;
            height: 82px;
            border-radius: 27px;
          }

          .gi-avatar {
            width: 58px;
            height: 58px;
            border-radius: 20px;
            font-size: 20px;
          }

          .gi-opponent .gi-avatar {
            font-size: 30px;
          }

          .gi-name {
            max-width: 96px;
            font-size: 12px;
          }

          .gi-vs {
            width: 40px;
            height: 40px;
            border-radius: 16px;
            font-size: 12px;
          }

          .gi-status {
            min-height: 40px;
          }

          .gi-status-text {
            font-size: 9px;
          }

          .gi-status-code {
            display: none;
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
              {isMatched
                ? 'Противник найден. Подготавливаем арену.'
                : 'Ищем свободного соперника для дуэли.'}
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

              <div
                className="gi-label"
                style={cssVars({ '--badge-color': '#F2C766' })}
              >
                <i />
                You
              </div>
            </div>

            <div className="gi-vs">VS</div>

            <div
              className={`gi-player gi-opponent ${isMatched ? 'gi-opponent-ready' : ''}`}
              style={cssVars({
                '--badge-color': opponent.color,
              })}
            >
              <div className="gi-avatar-wrap">
                {isMatched ? (
                  <div className="gi-avatar">{opponent.avatar}</div>
                ) : (
                  <div className="gi-loader" />
                )}
              </div>

              <div className="gi-name">
                {isMatched ? opponent.name : 'Поиск'}
              </div>

              <div className="gi-label">
                <i />
                {isMatched ? opponent.rank : 'Wait'}
              </div>
            </div>
          </div>

          <div className="gi-footer">
            <div className="gi-status">
              <div className="gi-status-text">
                <i />
                {isMatched ? 'Connected' : 'Searching'}
              </div>

              <div className="gi-status-code">
                TwinGames
              </div>
            </div>

            <div className="gi-progress">
              <i />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};