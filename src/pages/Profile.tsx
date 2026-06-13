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
      <main className="app-scroll page-shell relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
        <div className="page-ambient" />

        <section className="page-status-card">
          <div className="page-loader-orb">
            <RefreshCw size={22} className="animate-spin" />
          </div>

          <p className="mt-4 text-safe text-[12px] font-bold text-white/72">
            Загружаю профиль
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-scroll page-shell relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
        <div className="page-ambient" />

        <section className="page-status-card is-error">
          <div className="page-error-icon">
            <UserRound size={22} />
          </div>

          <h1 className="mt-4 text-safe text-[18px] font-bold text-white">
            Профиль недоступен
          </h1>

          <p className="mt-2 max-w-[280px] text-safe text-center text-[11px] font-bold leading-relaxed text-white/48">
            {error || 'Нет пользователя. Открой мини-приложение внутри Telegram.'}
          </p>
        </section>
      </main>
    );
  }

  const stats = user.stats;

  const favoriteMode =
    stats.favorite_mode && stats.favorite_mode !== 'none'
      ? stats.favorite_mode
      : 'Пока нет';

  return (
    <main className="app-scroll page-shell profile-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
      <div className="page-ambient" />

      <section className="profile-hero page-reveal">
        <div className="profile-hero-bg" />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.tg_user}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="profile-avatar-fallback">
                  {getInitials(user.tg_user)}
                </div>
              )}
            </div>

            <div className="profile-crown">
              <Crown size={16} className="fill-current" />
            </div>
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="pressable profile-refresh-button"
            >
              <RefreshCw size={11} />
              Refresh
            </button>

            <p className="profile-rating-label">
              Rating
            </p>

            <p className="profile-rating-value">
              {stats.rating}
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-4">
          <div className="profile-player-kicker">
            <UserRound size={12} />
            Telegram player
          </div>

          <h1 className="profile-player-name">
            {user.tg_user || 'Игрок'}
          </h1>

          <p className="profile-player-id">
            ID {user.id} · TG {user.telegram_id} · c {formatDate(user.created_at)}
          </p>
        </div>

        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Рейтинг', value: stats.rating, icon: Trophy, tone: 'orange' },
            { label: 'Winrate', value: `${stats.winrate}%`, icon: Flame, tone: 'blue' },
            { label: 'Матчи', value: stats.total_games, icon: Swords, tone: 'violet' },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className={`profile-mini-stat is-${item.tone}`}>
                <Icon size={15} />
                <p>{item.value}</p>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="profile-wallet-grid page-reveal"
        style={{ animationDelay: '60ms' }}
      >
        <div className="profile-wallet-card is-ton">
          <div className="profile-wallet-icon">
            <Gem size={21} />
          </div>

          <p className="profile-wallet-value">
            {formatNumber(user.balance_ton)}
          </p>

          <p className="profile-wallet-label">
            TON
          </p>
        </div>

        <div className="profile-wallet-card is-game">
          <div className="profile-wallet-icon">
            <Coins size={21} />
          </div>

          <p className="profile-wallet-value">
            {formatNumber(user.balance_game)}
          </p>

          <p className="profile-wallet-label">
            GAME
          </p>
        </div>
      </section>

      <section
        className="profile-stat-panel page-reveal"
        style={{ animationDelay: '110ms' }}
      >
        <div className="section-heading mb-3">
          <div>
            <p className="section-kicker section-kicker-blue">
              Backend Stats
            </p>

            <h2 className="section-title">
              Статистика
            </h2>
          </div>

          <div className="section-icon-pill">
            <Award size={15} />
          </div>
        </div>

        <div className="profile-stat-list">
          {[
            { label: 'Победы', value: stats.wins, icon: Trophy, tone: 'orange' },
            { label: 'Поражения', value: stats.losses, icon: ShieldCheck, tone: 'muted' },
            { label: 'Всего игр', value: stats.total_games, icon: Swords, tone: 'blue' },
            { label: 'Рейтинг', value: stats.rating, icon: TrendingUp, tone: 'blue' },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className={`profile-stat-row is-${item.tone}`}>
                <div className="profile-stat-left">
                  <div className="profile-stat-icon">
                    <Icon size={15} />
                  </div>

                  <span>{item.label}</span>
                </div>

                <strong>{item.value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="favorite-mode-card page-reveal"
        style={{ animationDelay: '160ms' }}
      >
        <div className="favorite-mode-bg" />

        <div className="relative z-10 mb-3 flex items-center gap-2.5">
          <div className="favorite-mode-icon">
            <Gamepad2 size={19} />
          </div>

          <div>
            <h2 className="text-safe text-[16px] font-bold tracking-[-0.035em] text-white">
              Любимый режим
            </h2>

            <p className="text-safe text-[10px] font-bold text-white/42">
              Favorite mode from backend
            </p>
          </div>
        </div>

        <div className="relative z-10 favorite-mode-inner">
          <div>
            <div className="favorite-mode-emoji">
              🎮
            </div>

            <p className="favorite-mode-kicker">
              Top arena
            </p>

            <h3 className="favorite-mode-title">
              {favoriteMode}
            </h3>

            <p className="favorite-mode-text">
              Когда backend начнёт отдавать больше активности, тут появится самый частый режим игрока.
            </p>
          </div>

          <div className="favorite-mode-arrow">
            <TrendingUp size={18} />
          </div>
        </div>
      </section>
    </main>
  );
};