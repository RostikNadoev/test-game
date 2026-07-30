import {
  Award,
  CalendarDays,
  Crown,
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
      <main className="app-scroll elite-profile-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
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
      <main className="app-scroll elite-profile-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
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
    <main className="app-scroll elite-profile-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
      <section className="elite-profile-hero elite-panel elite-enter">
        <div className="elite-profile-hero-glow" />

        <div className="elite-profile-top">
          <div className="elite-profile-identity">
            <div className="elite-profile-avatar-wrap">
              <div className="elite-profile-avatar">
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
              </div>
              <div className="elite-profile-crown">
                <Crown size={13} className="fill-current" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="elite-eyebrow">
                <UserRound size={11} />
                Telegram player
              </div>
              <h1 className="elite-profile-name">{user.tg_user || tr('Player', 'Игрок')}</h1>
              <p className="elite-profile-id">ID {user.id} · TG {user.telegram_id}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="pressable elite-icon-button"
            aria-label={tr('Refresh profile', 'Обновить профиль')}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="elite-profile-rating-card">
          <div className="elite-profile-rating-main">
            <div className="elite-profile-rating-icon">
              <Medal size={18} />
            </div>
            <div>
              <p className="elite-profile-rating-label">{tr('Current league', 'Текущая лига')}</p>
              <div className="elite-profile-rating-line">
                <strong>{league}</strong>
                <span>{formatNumber(stats.rating, 0)} RP</span>
              </div>
            </div>
          </div>

          <div className="elite-winrate-block">
            <div className="elite-winrate-head">
              <span>Winrate</span>
              <strong>{formatNumber(winrate, 1)}%</strong>
            </div>
            <div className="elite-winrate-track" aria-hidden="true">
              <span style={{ width: `${winrate}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="elite-balance-card elite-panel elite-enter elite-delay-1">
        <div className="elite-balance-icon-wrap">
          <img src={coinIcon} alt="" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="elite-balance-label">{tr('Game balance', 'Игровой баланс')}</p>
          <p className="elite-balance-value">{formatNumber(user.balance_game)}</p>
        </div>
        <div className="elite-balance-badge">GAME</div>
      </section>

      <section className="elite-profile-stats elite-enter elite-delay-2">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={`elite-stat-card is-${item.tone}`}>
              <div className="elite-stat-icon">
                <Icon size={16} />
              </div>
              <div>
                <strong>{formatNumber(Number(item.value), 0)}</strong>
                <span>{item.label}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="elite-profile-summary elite-panel elite-enter elite-delay-3">
        <div className="elite-section-heading">
          <div>
            <p className="elite-section-kicker">{tr('Player overview', 'Обзор игрока')}</p>
            <h2>{tr('Player profile', 'Профиль игрока')}</h2>
          </div>
          <div className="elite-section-icon">
            <Award size={16} />
          </div>
        </div>

        <div className="elite-profile-summary-grid">
          <article className="elite-summary-card is-favorite">
            <div className="elite-summary-icon">
              <Gamepad2 size={18} />
            </div>
            <div className="min-w-0">
              <span>{tr('Favorite mode', 'Любимый режим')}</span>
              <strong>{favoriteMode}</strong>
              <p>{tr('Based on your match activity.', 'Определяется по твоей активности в матчах.')}</p>
            </div>
          </article>

          <article className="elite-summary-card">
            <div className="elite-summary-icon is-blue">
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0">
              <span>{tr('Member since', 'В клубе с')}</span>
              <strong>{formatDate(user.created_at)}</strong>
              <p>{tr('Account registration date.', 'Дата регистрации аккаунта.')}</p>
            </div>
          </article>
        </div>

        <div className="elite-profile-footer-note">
          <Sparkles size={14} />
          <span>{tr('Rating updates after completed PvP matches.', 'Рейтинг обновляется после завершения PvP-матчей.')}</span>
        </div>
      </section>
    </main>
  );
};
