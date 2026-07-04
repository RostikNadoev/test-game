import {
  Award,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  Gem,
  RefreshCw,
  ShieldCheck,
  Swords,
  TrendingUp,
  Trophy,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value);

const formatDate = (value?: string) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
};

export const Profile = () => {
  const { user, isLoading, error, refreshProfile } = useAuth();

  if (isLoading) {
    return (
      <main className="app-scroll page-shell profile-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
        <section className="minimal-status-card page-reveal">
          <div className="minimal-loader">
            <RefreshCw size={20} className="animate-spin" />
          </div>
          <p className="text-safe mt-3 text-[11px] font-bold text-white/62">Загружаю профиль</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-scroll page-shell profile-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
        <section className="minimal-status-card is-error page-reveal">
          <div className="minimal-error-icon"><UserRound size={20} /></div>
          <h1 className="text-safe mt-3 text-[16px] font-bold text-white">Профиль недоступен</h1>
          <p className="text-safe mt-2 max-w-[280px] text-center text-[10.5px] font-bold leading-relaxed text-white/46">
            {error || 'Нет пользователя. Открой мини-приложение внутри Telegram.'}
          </p>
        </section>
      </main>
    );
  }

  const stats = user.stats;
  const favoriteMode = stats.favorite_mode && stats.favorite_mode !== 'none' ? stats.favorite_mode : 'Пока нет';

  return (
    <main className="app-scroll page-shell profile-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
      <section className="profile-head minimal-panel page-reveal">
        <div className="profile-head-glow" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">
                {user.photo_url ? (
                  <img src={user.photo_url} alt={user.tg_user} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="profile-avatar-fallback">{getInitials(user.tg_user)}</div>
                )}
              </div>
              <div className="profile-crown"><Crown size={14} className="fill-current" /></div>
            </div>
            <div className="min-w-0">
              <div className="profile-kicker"><UserRound size={11} />Telegram</div>
              <h1 className="profile-name">{user.tg_user || 'Игрок'}</h1>
              <p className="profile-id-line">ID {user.id} · TG {user.telegram_id}</p>
            </div>
          </div>
          <button type="button" onClick={() => void refreshProfile()} className="pressable profile-refresh-button">
            <RefreshCw size={11} />
          </button>
        </div>

        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Rating', value: stats.rating, icon: Trophy, tone: 'gold' },
            { label: 'Winrate', value: `${stats.winrate}%`, icon: Flame, tone: 'blue' },
            { label: 'Games', value: stats.total_games, icon: Swords, tone: 'muted' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`profile-mini-stat is-${item.tone}`}>
                <Icon size={14} />
                <p>{item.value}</p>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="profile-wallet-grid page-reveal" style={{ animationDelay: '60ms' }}>
        <div className="profile-wallet-card is-ton">
          <div className="profile-wallet-icon"><Gem size={19} /></div>
          <div className="min-w-0"><p className="profile-wallet-value">{formatNumber(user.balance_ton)}</p><p className="profile-wallet-label">TON</p></div>
        </div>
        <div className="profile-wallet-card is-game">
          <div className="profile-wallet-icon"><Coins size={19} /></div>
          <div className="min-w-0"><p className="profile-wallet-value">{formatNumber(user.balance_game)}</p><p className="profile-wallet-label">GAME</p></div>
        </div>
      </section>

      <section className="profile-stat-panel minimal-panel page-reveal" style={{ animationDelay: '110ms' }}>
        <div className="minimal-section-head">
          <div><p className="minimal-kicker">Backend stats</p><h2>Статистика</h2></div>
          <div className="minimal-head-icon"><Award size={15} /></div>
        </div>
        <div className="profile-stat-list">
          {[
            { label: 'Победы', value: stats.wins, icon: Trophy, tone: 'gold' },
            { label: 'Поражения', value: stats.losses, icon: ShieldCheck, tone: 'muted' },
            { label: 'Всего игр', value: stats.total_games, icon: Swords, tone: 'blue' },
            { label: 'Рейтинг', value: stats.rating, icon: TrendingUp, tone: 'blue' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`profile-stat-row is-${item.tone}`}>
                <div className="profile-stat-left"><div className="profile-stat-icon"><Icon size={15} /></div><span>{item.label}</span></div>
                <strong>{item.value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="favorite-mode-card minimal-panel page-reveal" style={{ animationDelay: '160ms' }}>
        <div className="minimal-section-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="minimal-head-icon"><Gamepad2 size={16} /></div>
            <div className="min-w-0"><h2>Любимый режим</h2><p className="favorite-subtitle">c {formatDate(user.created_at)}</p></div>
          </div>
          <div className="favorite-trend"><TrendingUp size={16} /></div>
        </div>
        <div className="favorite-mode-inner">
          <div className="favorite-mode-emoji">🎮</div>
          <div className="min-w-0 flex-1">
            <p className="favorite-mode-kicker">Top arena</p>
            <h3 className="favorite-mode-title">{favoriteMode}</h3>
            <p className="favorite-mode-text">Любимый режим появится после накопления активности в играх.</p>
          </div>
        </div>
      </section>
    </main>
  );
};
