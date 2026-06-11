import { useState } from 'react';
import { Coins, Gem, Loader2, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { WalletModal } from '../Wallet/WalletModal';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
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
                <Gem size={12} className="shrink-0 text-white" />
                <span className="text-safe text-[10px] font-bold tabular-nums text-white">
                  {formatNumber(user?.balance_ton ?? 0)}
                </span>
              </div>

              <div className="balance-pill balance-game">
                <Coins size={12} className="shrink-0 text-orange-100" />
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