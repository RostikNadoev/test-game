import { useState } from 'react';
import { Coins, Gem, Loader2, ShieldCheck, UserRound, Wallet } from 'lucide-react';
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
      <header className="relative z-50 shrink-0 px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(77,124,255,0.22),transparent_58%)]" />

        <div className="card relative overflow-hidden rounded-[26px] px-3 py-2.5">
          <div className="pointer-events-none absolute -left-10 -top-10 h-24 w-24 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 h-24 w-24 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.08)_45%,transparent_62%)] opacity-20" />

          <div className="relative flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10">
                    <Loader2 size={15} className="animate-spin text-blue-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">
                      Loading
                    </p>
                    <p className="mt-0.5 text-[9px] font-bold text-slate-500">
                      Syncing profile
                    </p>
                  </div>
                </div>
              ) : user ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-1 rounded-[18px] bg-gradient-to-br from-blue-500/45 to-purple-500/35 blur-md" />
                    <div className="relative h-10 w-10 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04]">
                      {user.photo_url ? (
                        <img
                          src={user.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                          <span className="text-[11px] font-black text-blue-200">
                            {getInitials(user.tg_user)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#0a0a0f] bg-emerald-400">
                      <ShieldCheck size={10} className="text-[#06130d]" strokeWidth={3} />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-black leading-tight text-white">
                        {user.tg_user || 'Player'}
                      </p>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300">
                        Online
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      ID {user.telegram_id}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-red-400/20 bg-red-500/10">
                    <UserRound size={16} className="text-red-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[13px] font-black leading-tight text-slate-300">
                      Not Authorized
                    </p>
                    <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-red-300">
                      {error || 'Open via Telegram'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="rounded-[16px] border border-yellow-400/15 bg-yellow-400/10 px-2 py-1.5 shadow-[0_0_22px_rgba(240,185,11,0.08)]">
                <div className="flex items-center gap-1">
                  <Gem size={10} className="text-yellow-300" />
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-yellow-300/80">
                    TON
                  </span>
                </div>
                <p className="mt-0.5 text-right text-[11px] font-black tabular-nums text-white">
                  {formatNumber(user?.balance_ton ?? 0)}
                </p>
              </div>

              <div className="rounded-[16px] border border-blue-400/15 bg-blue-500/10 px-2 py-1.5 shadow-[0_0_22px_rgba(77,124,255,0.08)]">
                <div className="flex items-center gap-1">
                  <Coins size={10} className="text-blue-300" />
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-blue-300/80">
                    Coin
                  </span>
                </div>
                <p className="mt-0.5 text-right text-[11px] font-black tabular-nums text-white">
                  {formatNumber(user?.balance_game ?? 0)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsWalletOpen(true)}
                aria-label="Open wallet"
                className="btn-press group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.05]"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 opacity-0 transition-opacity duration-200 group-active:opacity-100" />
                <Wallet size={16} className="relative text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <WalletModal isOpen={isWalletOpen} onClose={() => setIsWalletOpen(false)} />
    </>
  );
};