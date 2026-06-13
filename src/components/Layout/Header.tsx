import { useState } from 'react';
import { Loader2, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { WalletModal } from '../Wallet/WalletModal';
import tonIcon from '../../assets/header/ton.svg';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
};

const GameCoinIcon = ({ className = '' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 36 36"
      className={`game-coin-icon ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="headerCoinGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13 10) rotate(48) scale(24)">
          <stop stopColor="#FFFFFF" stopOpacity="0.96" />
          <stop offset="0.34" stopColor="#FFE08A" />
          <stop offset="0.72" stopColor="#FF9F2D" />
          <stop offset="1" stopColor="#9A4D10" />
        </radialGradient>

        <linearGradient id="headerCoinEdge" x1="8" y1="5" x2="29" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF4C7" />
          <stop offset="0.42" stopColor="#FFB950" />
          <stop offset="1" stopColor="#803B0C" />
        </linearGradient>

        <linearGradient id="headerCoinStar" x1="11" y1="9" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#FFE27A" />
          <stop offset="1" stopColor="#FF7A1A" />
        </linearGradient>

        <filter id="headerCoinShadow" x="1" y="1" width="34" height="34" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.42" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#FFB950" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#headerCoinShadow)">
        <circle cx="18" cy="18" r="14" fill="url(#headerCoinEdge)" />
        <circle cx="18" cy="18" r="11.2" fill="url(#headerCoinGlow)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />

        <path
          d="M18 9.2L20.35 14.22L25.82 14.88L21.76 18.62L22.84 24.08L18 21.38L13.16 24.08L14.24 18.62L10.18 14.88L15.65 14.22L18 9.2Z"
          fill="url(#headerCoinStar)"
          stroke="rgba(255,255,255,0.68)"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />

        <path
          d="M10.9 12.2C12.4 9.95 14.92 8.48 17.8 8.48"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        <path
          d="M25.1 22.9C23.55 25.1 21.02 26.52 18.18 26.52"
          stroke="#74370C"
          strokeOpacity="0.34"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
};

export const Header = () => {
  const { user, isLoading, error } = useAuth();
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  return (
    <>
      <header className="relative z-50 shrink-0 px-4 pt-[calc(var(--telegram-top-offset)+12px)] pb-1">
        <div className="app-panel header-panel rounded-[23px] px-3 py-2">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="avatar-box">
                    <Loader2 size={14} className="animate-spin text-slate-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-safe text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
                      Loading
                    </p>
                    <p className="text-safe text-[9px] font-bold text-slate-500">
                      Profile
                    </p>
                  </div>
                </div>
              ) : user ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="avatar-box overflow-hidden">
                    {user.photo_url ? (
                      <img
                        src={user.photo_url}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-safe text-[10px] font-bold text-white">
                          {getInitials(user.tg_user)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-safe truncate text-[12px] font-bold text-white">
                      {user.tg_user || 'Player'}
                    </p>
                    <p className="text-safe truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      ID {user.telegram_id}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="avatar-box border-red-400/15 bg-red-400/10">
                    <UserRound size={15} className="text-red-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-safe text-[12px] font-bold text-slate-300">
                      Not Authorized
                    </p>
                    <p className="text-safe truncate text-[9px] font-bold uppercase tracking-[0.12em] text-red-300">
                      {error || 'Open via Telegram'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="balance-pill balance-ton">
                <img
                  src={tonIcon}
                  alt=""
                  className="h-[15px] w-[15px] shrink-0 object-contain"
                  draggable={false}
                />
                <span className="text-safe text-[10px] font-bold tabular-nums text-white">
                  {formatNumber(user?.balance_ton ?? 0)}
                </span>
              </div>

              <div className="balance-pill balance-game">
                <GameCoinIcon className="h-[17px] w-[17px] shrink-0" />
                <span className="text-safe text-[10px] font-bold tabular-nums text-white">
                  {formatNumber(user?.balance_game ?? 0)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsWalletOpen(true)}
                aria-label="Open wallet"
                className="pressable wallet-button"
              >
                <Wallet size={15} className="text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <WalletModal isOpen={isWalletOpen} onClose={() => setIsWalletOpen(false)} />
    </>
  );
};