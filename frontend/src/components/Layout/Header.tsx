import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { WalletModal } from '../Wallet/WalletModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';
import { useLanguage } from '../../i18n/LanguageContext';

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
};

const isSoloPath = (pathname: string) =>
  pathname === '/solo' || pathname.startsWith('/solo/');

export const Header = ({
  showLanguageSwitcher = false,
}: {
  showLanguageSwitcher?: boolean;
}) => {
  const location = useLocation();
  const { user, isLoading, error } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const isSoloSection = isSoloPath(location.pathname);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

  return (
    <>
      <header className="relative z-50 shrink-0 px-[var(--app-gutter)] pt-[var(--app-header-gap)] pb-1">
        {showLanguageSwitcher && <LanguageSwitcher />}
        <div className={`app-panel header-panel rounded-[23px] px-3 py-2 ${isSoloSection ? 'solo-header-panel' : ''}`}>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className={`avatar-box ${isSoloSection ? 'solo-avatar-box' : ''}`}>
                    <Loader2 size={14} className="animate-spin text-slate-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-safe text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
                      {tr('Loading', 'Загрузка')}
                    </p>
                    <p className="text-safe text-[9px] font-bold text-slate-500">
                      {tr('Profile', 'Профиль')}
                    </p>
                  </div>
                </div>
              ) : user ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`avatar-box overflow-hidden ${isSoloSection ? 'solo-avatar-box' : ''}`}>
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
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="text-safe truncate text-[12px] font-bold text-white">
                        {user.tg_user || tr('Player', 'Игрок')}
                      </p>

                      {isSoloSection && (
                        <span className="solo-header-badge">
                          Solo
                        </span>
                      )}
                    </div>

                    <p className="text-safe truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      ID {user.telegram_id}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`avatar-box border-red-400/15 bg-red-400/10 ${isSoloSection ? 'solo-avatar-box' : ''}`}>
                    <UserRound size={15} className="text-red-300" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-safe text-[12px] font-bold text-slate-300">
                      {tr('Not authorized', 'Нет авторизации')}
                    </p>
                    <p className="text-safe truncate text-[9px] font-bold uppercase tracking-[0.12em] text-red-300">
                      {error
                        ? localize(error)
                        : tr('Open via Telegram', 'Откройте через Telegram')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className={`balance-pill balance-game header-game-balance ${isSoloSection ? 'solo-balance-game' : ''}`}>
                <img
                  src={coinIcon}
                  alt=""
                  className="game-coin-icon h-[22px] w-[22px] shrink-0 object-contain"
                  draggable={false}
                  decoding="async"
                />
                <span className="text-safe text-[11px] font-bold tabular-nums text-white">
                  {formatNumber(user?.balance_game ?? 0)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsWalletOpen(true)}
                aria-label={tr('Open wallet', 'Открыть кошелёк')}
                className={`pressable wallet-button ${isSoloSection ? 'solo-wallet-button' : ''}`}
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
