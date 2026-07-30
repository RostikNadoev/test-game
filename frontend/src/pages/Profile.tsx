import {
  CalendarDays,
  Gamepad2,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import { useLanguage } from '../i18n/LanguageContext';

const getInitials = (name?: string) => {
  if (!name) return 'TG';
  return name.replace('@', '').slice(0, 2).toUpperCase();
};

const getLeague = (rating: number) => {
  if (rating >= 2500) return 'Legend';
  if (rating >= 1800) return 'Elite';
  if (rating >= 1300) return 'Gold';
  if (rating >= 900) return 'Silver';
  return 'Rookie';
};

export const Profile = () => {
  const { user, isLoading, error, refreshProfile } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const formatNumber = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
  const formatDate = (value?: string) => {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  if (isLoading) {
    return (
      <main className="app-scroll elite-profile-page profile-luxe-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
        <section className="elite-state-card elite-panel elite-enter">
          <div className="elite-state-icon">
            <RefreshCw size={20} className="animate-spin" />
          </div>
          <p>{tr('Loading profile', 'Загружаю профиль')}</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-scroll elite-profile-page profile-luxe-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
        <section className="elite-state-card elite-panel elite-enter is-error">
          <div className="elite-state-icon">
            <UserRound size={20} />
          </div>
          <h1>{tr('Profile unavailable', 'Профиль недоступен')}</h1>
          <p>{error
            ? localize(error)
            : tr('Open the mini app inside Telegram.', 'Открой мини-приложение внутри Telegram.')}</p>
        </section>
      </main>
    );
  }

  const stats = user.stats;
  const favoriteMode =
    stats.favorite_mode && stats.favorite_mode !== 'none'
      ? stats.favorite_mode
      : tr('Not determined yet', 'Пока не определён');
  const league = getLeague(stats.rating);
  const winrate = Math.max(0, Math.min(100, stats.winrate));

  const statItems = [
    {
      label: tr('Wins', 'Победы'),
      value: stats.wins,
      icon: Trophy,
      tone: 'gold',
    },
    {
      label: tr('Losses', 'Поражения'),
      value: stats.losses,
      icon: ShieldCheck,
      tone: 'muted',
    },
    {
      label: tr('Matches', 'Матчи'),
      value: stats.total_games,
      icon: Swords,
      tone: 'blue',
    },
    {
      label: tr('Rating', 'Рейтинг'),
      value: stats.rating,
      icon: TrendingUp,
      tone: 'violet',
    },
  ];

  return (
    <main className="app-scroll elite-profile-page profile-luxe-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
      <section className="profile-luxe-hero elite-enter">
        <div className="profile-luxe-top">
          <div className="profile-luxe-identity">
            <div className="profile-luxe-avatar">
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.tg_user}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <span>{getInitials(user.tg_user)}</span>
              )}
              <i aria-hidden="true">
                <ShieldCheck size={11} />
              </i>
            </div>

            <div className="min-w-0">
              <p className="profile-luxe-kicker">
                <UserRound size={10} />
                {tr('Telegram account', 'Аккаунт Telegram')}
              </p>
              <h1>{user.tg_user || tr('Player', 'Игрок')}</h1>
              <span>ID {user.id} · TG {user.telegram_id}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="pressable profile-luxe-refresh"
            aria-label={tr('Refresh profile', 'Обновить профиль')}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="profile-luxe-overview">
          <article>
            <span>{tr('League', 'Лига')}</span>
            <strong><Medal size={13} /> {league}</strong>
          </article>
          <article>
            <span>{tr('Rating', 'Рейтинг')}</span>
            <strong>{formatNumber(stats.rating, 0)} <small>RP</small></strong>
          </article>
          <article>
            <span>{tr('Balance', 'Баланс')}</span>
            <strong>
              <img src={coinIcon} alt="" draggable={false} />
              {formatNumber(user.balance_game)}
            </strong>
          </article>
        </div>

        <div className="profile-luxe-winrate">
          <div>
            <span>Winrate</span>
            <strong>{formatNumber(winrate, 1)}%</strong>
          </div>
          <div className="profile-luxe-track" aria-hidden="true">
            <span style={{ width: `${winrate}%` }} />
          </div>
        </div>
      </section>

      <section className="profile-luxe-stats elite-panel elite-enter elite-delay-1">
        <div className="profile-luxe-section-head">
          <div>
            <span>{tr('Performance', 'Результаты')}</span>
            <h2>{tr('Match statistics', 'Статистика матчей')}</h2>
          </div>
          <Swords size={16} />
        </div>

        <div className="profile-luxe-stat-grid">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={`profile-luxe-stat is-${item.tone}`}>
              <Icon size={14} />
              <div>
                <strong>{formatNumber(Number(item.value), 0)}</strong>
                <span>{item.label}</span>
              </div>
            </article>
          );
        })}
        </div>
      </section>

      <section className="profile-luxe-details elite-panel elite-enter elite-delay-2">
        <div className="profile-luxe-section-head">
          <div>
            <span>{tr('Profile details', 'Детали профиля')}</span>
            <h2>{tr('About player', 'Об игроке')}</h2>
          </div>
          <UserRound size={16} />
        </div>

        <div className="profile-luxe-detail-list">
          <article>
            <div className="profile-luxe-detail-icon">
              <Gamepad2 size={18} />
            </div>
            <div className="min-w-0">
              <span>{tr('Favorite mode', 'Любимый режим')}</span>
              <strong>{favoriteMode}</strong>
            </div>
          </article>

          <article>
            <div className="profile-luxe-detail-icon is-blue">
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0">
              <span>{tr('Member since', 'В клубе с')}</span>
              <strong>{formatDate(user.created_at)}</strong>
            </div>
          </article>
        </div>

        <div className="profile-luxe-note">
          <Sparkles size={14} />
          <span>{tr('Rating updates after completed PvP matches.', 'Рейтинг обновляется после завершения PvP-матчей.')}</span>
        </div>
      </section>
    </main>
  );
};
