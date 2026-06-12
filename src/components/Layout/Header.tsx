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
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gameCoinBody" x1="7" y1="5" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE6A3" />
          <stop offset="0.42" stopColor="#FFB84D" />
          <stop offset="1" stopColor="#C96A12" />
        </linearGradient>

        <linearGradient id="gameCoinInner" x1="10" y1="8" x2="22" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF2BD" />
          <stop offset="0.48" stopColor="#F9A93D" />
          <stop offset="1" stopColor="#B8550C" />
        </linearGradient>

        <linearGradient id="gameCoinGem" x1="11" y1="10" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF7D1" />
          <stop offset="0.45" stopColor="#FFD166" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>

        <filter id="gameCoinShadow" x="2" y="2" width="28" height="28" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#7C2D12" floodOpacity="0.42" />
        </filter>
      </defs>

      <g filter="url(#gameCoinShadow)">
        <circle cx="16" cy="16" r="12.5" fill="url(#gameCoinBody)" />
        <circle cx="16" cy="16" r="9.2" fill="url(#gameCoinInner)" stroke="rgba(255,255,255,0.42)" strokeWidth="1" />

        <path
          d="M16 8.6L18.15 13.65L23.45 14.1L19.45 17.62L20.65 22.85L16 20.12L11.35 22.85L12.55 17.62L8.55 14.1L13.85 13.65L16 8.6Z"
          fill="url(#gameCoinGem)"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        <path
          d="M10.2 10.7C11.55 8.95 13.66 7.85 16.02 7.85"
          stroke="white"
          strokeOpacity="0.42"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        <path
          d="M22.4 20.3C21.05 22.12 18.86 23.3 16.4 23.3"
          stroke="#7C2D12"
          strokeOpacity="0.32"
          strokeWidth="1.2"
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
        <div className="app-panel header-panel rounded-[22px] px-3 py-2">
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
                <GameCoinIcon className="h-[16px] w-[16px] shrink-0" />
                <span className="text-safe text-[10px] font-bold tabular-nums text-white">
                  {formatNumber(user?.balance_game ?? 0)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsWalletOpen(true)}
                aria-label="Open wallet"
                className="pressable flex h-9 w-9 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]"
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