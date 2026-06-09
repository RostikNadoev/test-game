import { useState } from 'react';
import { Coins, Loader2, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { WalletModal } from '../Wallet/WalletModal';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value);

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
};

export const Header = () => {
  const { user, isLoading, error } = useAuth();
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  return (
    <>
      <header className="relative z-40 shrink-0 px-3 pb-1.5 pt-2">
        <div className="relative flex items-center gap-2 overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#0a0a11]/85 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/45">
                <Loader2 size={13} className="animate-spin text-[#52FFE5]" />
                Авторизация...
              </div>
            ) : user ? (
              <div className="flex min-w-0 items-center gap-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-white/[0.08] bg-white/[0.06]">
                  {user.photo_url ? (
                    <img
                      src={user.photo_url}
                      alt={user.tg_user || 'Avatar'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[11px] font-black text-white/72">
                      {getInitials(user.tg_user)}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black tracking-[-0.04em] text-white">
                    {user.tg_user || 'Игрок'}
                  </p>
                  <p className="truncate text-[9px] font-bold text-white/34">
                    ID {user.telegram_id}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] border border-white/[0.08] bg-white/[0.06]">
                  <UserRound size={16} className="text-white/50" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black text-white/70">
                    Нет авторизации
                  </p>
                  <p className="truncate text-[9px] font-bold text-[#FFB5C1]/70">
                    {error || 'Открой через Telegram'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-[13px] border border-[#F2C766]/18 bg-[#F2C766]/[0.08] px-2 py-1.5">
              <span className="text-[9px] font-black text-[#FFE0A3]/60">TON</span>
              <span className="text-[12px] font-black tracking-[-0.03em] text-white tabular-nums">
                {formatNumber(user?.balance_ton ?? 0)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-[13px] border border-white/[0.07] bg-white/[0.05] px-2 py-1.5">
              <Coins size={13} className="text-[#52FFE5]" />
              <span className="text-[12px] font-black tracking-[-0.03em] text-white tabular-nums">
                {formatNumber(user?.balance_game ?? 0)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsWalletOpen(true)}
              aria-label="Открыть кошелек"
              className="press grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[12px] border border-white/[0.07] bg-white/[0.05] text-white/70 active:bg-white/[0.09]"
            >
              <Wallet size={14} />
            </button>
          </div>
        </div>
      </header>

      <WalletModal isOpen={isWalletOpen} onClose={() => setIsWalletOpen(false)} />
    </>
  );
};