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
    color: '#22d3ee',
  },
  {
    name: 'NeonWolf',
    avatar: '🐺',
    rank: 'MASTER',
    level: 52,
    color: '#a78bfa',
  },
  {
    name: 'CyberCat',
    avatar: '🐱',
    rank: 'ELITE',
    level: 39,
    color: '#f472b6',
  },
  {
    name: 'GhostPanda',
    avatar: '🐼',
    rank: 'PRO',
    level: 44,
    color: '#34d399',
  },
  {
    name: 'RocketApe',
    avatar: '🦍',
    rank: 'LEGEND',
    level: 61,
    color: '#facc15',
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
          position: absolute;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 18px;
          color: white;
          background:
            radial-gradient(circle at 50% 12%, rgba(255,255,255,.09), transparent 28%),
            radial-gradient(circle at 20% 30%, rgba(34,211,238,.16), transparent 32%),
            radial-gradient(circle at 82% 34%, rgba(168,85,247,.15), transparent 34%),
            linear-gradient(180deg, #02040c 0%, #050610 46%, #02030a 100%);
          isolation: isolate;
          animation: giOverlayIn .16s ease both;
        }

        .gi-closing {
          pointer-events: none;
          animation: giOverlayOut .64s cubic-bezier(.2,.8,.2,1) both;
        }

        .gi-overlay::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -2;
          opacity: .42;
          background:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 50% 44%, black 0%, transparent 72%);
        }

        .gi-overlay::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 36%, rgba(0,0,0,.58) 100%),
            linear-gradient(180deg, rgba(255,255,255,.035), transparent 30%, rgba(0,0,0,.35));
        }

        .gi-shell {
          position: relative;
          z-index: 3;
          width: min(100%, 420px);
          animation: giShellIn .36s cubic-bezier(.16,1,.3,1) both;
        }

        .gi-shell-border {
          position: absolute;
          inset: -1px;
          border-radius: 34px;
          background:
            linear-gradient(
              135deg,
              rgba(255,255,255,.24),
              rgba(34,211,238,.28),
              rgba(168,85,247,.26),
              rgba(255,255,255,.12)
            );
          pointer-events: none;
        }

        .gi-card {
          position: relative;
          overflow: hidden;
          border-radius: 34px;
          border: 1px solid rgba(255,255,255,.10);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.105), transparent 42%),
            linear-gradient(180deg, rgba(255,255,255,.078), rgba(255,255,255,.035)),
            rgba(3,7,18,.84);
          box-shadow:
            0 34px 105px rgba(0,0,0,.62),
            inset 0 1px 0 rgba(255,255,255,.13);
          backdrop-filter: blur(26px);
          padding: 18px;
        }

        .gi-card::before {
          content: "";
          position: absolute;
          left: 24px;
          right: 24px;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.54), transparent);
        }

        .gi-top {
          position: relative;
          z-index: 2;
          display: grid;
          justify-items: center;
          text-align: center;
          margin-bottom: 18px;
        }

        .gi-kicker {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 26px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.54);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .2em;
          text-transform: uppercase;
          backdrop-filter: blur(14px);
        }

        .gi-kicker-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: ${isMatched ? '#22c55e' : '#22d3ee'};
          box-shadow: 0 0 16px ${isMatched ? 'rgba(34,197,94,.82)' : 'rgba(34,211,238,.82)'};
        }

        .gi-title {
          max-width: 340px;
          margin-top: 11px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: clamp(34px, 8vw, 44px);
          line-height: .84;
          font-weight: 1000;
          letter-spacing: -.085em;
          background: linear-gradient(90deg, #bae6fd 0%, #ffffff 48%, #ddd6fe 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .gi-subtitle {
          margin-top: 9px;
          color: rgba(255,255,255,.56);
          font-size: 12px;
          line-height: 1.3;
          font-weight: 800;
        }

        .gi-match {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr 58px 1fr;
          align-items: center;
          gap: 8px;
        }

        .gi-player {
          min-width: 0;
          display: grid;
          gap: 9px;
          justify-items: center;
        }

        .gi-avatar-box {
          position: relative;
          width: 122px;
          height: 122px;
          display: grid;
          place-items: center;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.10);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.11), transparent 46%),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.028));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.12),
            0 22px 54px rgba(0,0,0,.30);
        }

        .gi-avatar-box::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(34,211,238,.38), rgba(255,255,255,.08), rgba(168,85,247,.28));
          opacity: .72;
          z-index: -1;
        }

        .gi-opponent .gi-avatar-box::before {
          background: linear-gradient(135deg, var(--opponent-color), rgba(255,255,255,.08), rgba(168,85,247,.32));
          opacity: ${isMatched ? '.72' : '.32'};
        }

        .gi-avatar {
          position: relative;
          width: 86px;
          height: 86px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 24px;
          background:
            radial-gradient(circle at 30% 18%, rgba(255,255,255,.28), transparent 38%),
            linear-gradient(135deg, #111827, #020617);
          color: white;
          font-size: 24px;
          font-weight: 1000;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.14),
            0 18px 32px rgba(0,0,0,.32);
        }

        .gi-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .gi-opponent .gi-avatar {
          font-size: 38px;
        }

        .gi-loader-center {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
        }

        .gi-spinner {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 3px solid rgba(255,255,255,.12);
          border-top-color: var(--opponent-color);
          border-right-color: rgba(255,255,255,.36);
          box-shadow: 0 0 24px rgba(34,211,238,.18);
          animation: giSpin .72s linear infinite;
        }

        .gi-opponent-ready {
          animation: giOpponentIn .44s cubic-bezier(.16,1.12,.28,1) both;
        }

        .gi-name {
          max-width: 126px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          text-align: center;
          font-size: 14px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.04em;
        }

        .gi-badge {
          min-height: 22px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 0 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(0,0,0,.24);
          color: rgba(255,255,255,.50);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .gi-badge i {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--badge-color);
          box-shadow: 0 0 12px var(--badge-color);
        }

        .gi-vs-wrap {
          position: relative;
          display: grid;
          place-items: center;
          height: 122px;
        }

        .gi-vs-line {
          position: absolute;
          top: 6px;
          bottom: 6px;
          width: 1px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,.20), transparent);
        }

        .gi-vs {
          position: relative;
          z-index: 2;
          width: 56px;
          height: 56px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.12);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.18), transparent 38%),
            rgba(255,255,255,.065);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.15),
            0 18px 42px rgba(0,0,0,.32);
          color: white;
          font-size: 18px;
          font-weight: 1000;
          letter-spacing: -.08em;
        }

        .gi-vs::before {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.07);
        }

        .gi-bottom {
          position: relative;
          z-index: 2;
          margin-top: 18px;
          display: grid;
          justify-items: center;
          gap: 10px;
        }

        .gi-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          padding: 0 13px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(0,0,0,.24);
          color: rgba(255,255,255,.68);
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .gi-status i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: ${isMatched ? '#22c55e' : '#22d3ee'};
          box-shadow: 0 0 16px ${isMatched ? 'rgba(34,197,94,.82)' : 'rgba(34,211,238,.82)'};
        }

        .gi-progress {
          width: min(100%, 250px);
          height: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          box-shadow: inset 0 1px 2px rgba(0,0,0,.28);
        }

        .gi-progress i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22d3ee, #a78bfa);
          box-shadow: 0 0 18px rgba(34,211,238,.26);
        }

        .gi-searching .gi-progress i {
          width: 42%;
          animation: giProgressSearch 1.08s ease-in-out infinite;
        }

        .gi-matched .gi-progress i,
        .gi-closing .gi-progress i {
          width: 100%;
          animation: giProgressComplete .34s ease both;
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
            transform: scale(1.025);
            filter: blur(8px);
          }
        }

        @keyframes giShellIn {
          from {
            opacity: 0;
            transform: translateY(14px) scale(.975);
            filter: blur(10px);
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
            transform: scale(.9);
            filter: blur(10px);
          }

          to {
            opacity: 1;
            transform: scale(1);
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
            transform: translateX(260%);
          }
        }

        @keyframes giProgressComplete {
          from {
            width: 70%;
          }

          to {
            width: 100%;
          }
        }

        @media (max-width: 390px) {
          .gi-card {
            border-radius: 30px;
            padding: 16px;
          }

          .gi-shell-border {
            border-radius: 30px;
          }

          .gi-title {
            font-size: 32px;
          }

          .gi-match {
            grid-template-columns: 1fr 50px 1fr;
            gap: 6px;
          }

          .gi-avatar-box {
            width: 104px;
            height: 104px;
            border-radius: 26px;
          }

          .gi-avatar {
            width: 72px;
            height: 72px;
            border-radius: 21px;
          }

          .gi-vs-wrap {
            height: 104px;
          }

          .gi-vs {
            width: 48px;
            height: 48px;
            border-radius: 18px;
            font-size: 16px;
          }

          .gi-name {
            max-width: 104px;
            font-size: 12px;
          }

          .gi-badge {
            font-size: 7px;
            padding: 0 7px;
          }
        }
      `}</style>

      <div className="gi-shell">
        <div className="gi-shell-border" />

        <div className="gi-card">
          <div className="gi-top">
            <div className="gi-kicker">
              <span className="gi-kicker-dot" />
              Matchmaking
            </div>

            <div className="gi-title">{gameTitle}</div>

            <div className="gi-subtitle">
              {isMatched ? 'Противник найден. Арена готовится...' : 'Ожидание противника'}
            </div>
          </div>

          <div className="gi-match">
            <div className="gi-player gi-you">
              <div className="gi-avatar-box">
                <div className="gi-avatar">
                  {user.photoUrl ? <img src={user.photoUrl} alt={user.name} /> : getInitials(user.name)}
                </div>
              </div>

              <div className="gi-name">{user.name}</div>

              <div className="gi-badge" style={cssVars({ '--badge-color': '#22d3ee' })}>
                <i />
                You
              </div>
            </div>

            <div className="gi-vs-wrap">
              <div className="gi-vs-line" />
              <div className="gi-vs">VS</div>
            </div>

            <div
              className={`gi-player gi-opponent ${isMatched ? 'gi-opponent-ready' : ''}`}
              style={cssVars({
                '--opponent-color': opponent.color,
                '--badge-color': opponent.color,
              })}
            >
              <div className="gi-avatar-box">
                {isMatched ? (
                  <div className="gi-avatar">{opponent.avatar}</div>
                ) : (
                  <div className="gi-loader-center">
                    <div className="gi-spinner" />
                  </div>
                )}
              </div>

              <div className="gi-name">{isMatched ? opponent.name : 'Searching'}</div>

              <div className="gi-badge">
                <i />
                {isMatched ? opponent.rank : 'Waiting'}
              </div>
            </div>
          </div>

          <div className="gi-bottom">
            <div className="gi-status">
              <i />
              {isMatched ? 'Opponent connected' : 'Finding opponent'}
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