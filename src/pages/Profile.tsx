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
      <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
        <section className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-6 text-center">
          <RefreshCw size={22} className="mx-auto animate-spin text-[#52FFE5]" />
          <p className="mt-3 text-[14px] font-black text-white/70">Загружаю профиль...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
        <section className="relative overflow-hidden rounded-[26px] border border-[#FF7A90]/20 bg-[#FF7A90]/[0.07] p-5">
          <h1 className="text-[22px] font-black tracking-[-0.05em]">Профиль недоступен</h1>
          <p className="mt-2 text-[12px] font-medium leading-snug text-white/52">
            {error || 'Нет пользователя. Открой мини-приложение внутри Telegram.'}
          </p>
        </section>
      </main>
    );
  }

  const stats = user.stats;

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_40%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.11),transparent_42%)]" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="relative">
            <div className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-[28px] border border-white/[0.1] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.tg_user} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-[66px] w-[66px] place-items-center rounded-[22px] bg-gradient-to-br from-[#F2C766]/30 via-[#52FFE5]/18 to-[#9D7CFF]/20 text-[22px] font-black">
                  {getInitials(user.tg_user)}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-[14px] border border-white/[0.12] bg-[#08080C]">
              <Crown size={17} className="fill-[#F2C766] text-[#F2C766]" />
            </div>
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="press inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.07] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/50 active:bg-white/[0.1]"
            >
              <RefreshCw size={11} className="text-[#52FFE5]" />
              Refresh
            </button>
            <p className="mt-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/34">
              Rating
            </p>
            <p className="text-[28px] font-black leading-none tracking-[-0.07em] tabular-nums">
              {stats.rating}
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/68">
            <UserRound size={12} />
            Telegram player
          </div>
          <h1 className="mt-0.5 truncate text-[30px] font-black leading-none tracking-[-0.07em]">
            {user.tg_user || 'Игрок'}
          </h1>
          <p className="mt-1.5 text-[12px] font-medium text-white/45">
            ID: {user.id} · TG: {user.telegram_id} · c {formatDate(user.created_at)}
          </p>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Рейтинг', value: stats.rating, icon: Trophy },
            { label: 'Winrate', value: `${stats.winrate}%`, icon: Flame },
            { label: 'Матчи', value: stats.total_games, icon: Swords },
          ].map((item) => (
            <div key={item.label} className="rounded-[18px] border border-white/[0.08] bg-black/25 p-3">
              <item.icon size={15} className="mb-2.5 text-[#F2C766]" />
              <p className="text-[18px] font-black leading-none tracking-[-0.05em] tabular-nums">
                {item.value}
              </p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/34">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal relative mt-2.5 grid grid-cols-2 gap-2" style={{ animationDelay: '50ms' }}>
        <div className="relative overflow-hidden rounded-[22px] border border-[#F2C766]/18 bg-[#F2C766]/[0.1] p-3.5">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.08]">
            <Gem size={22} className="text-[#F2C766]" />
          </div>
          <p className="text-[28px] font-black leading-none tracking-[-0.07em] tabular-nums">
            {formatNumber(user.balance_ton)}
          </p>
          <p className="mt-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE0A3]/60">
            TON
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.05] p-3.5">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.08]">
            <Coins size={22} className="text-[#52FFE5]" />
          </div>
          <p className="text-[28px] font-black leading-none tracking-[-0.07em] tabular-nums">
            {formatNumber(user.balance_game)}
          </p>
          <p className="mt-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white/42">
            GAME
          </p>
        </div>
      </section>

      <section className="relative mt-3 overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-3.5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#52FFE5]/58">
              <TrendingUp size={12} />
              Backend stats
            </div>
            <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
              Статистика
            </h2>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.06]">
            <Award size={19} className="text-[#F2C766]" />
          </div>
        </div>

        <div className="space-y-1.5">
          {[
            { label: 'Победы', value: stats.wins, icon: Trophy, accent: 'text-[#F2C766]' },
            { label: 'Поражения', value: stats.losses, icon: ShieldCheck, accent: 'text-white/62' },
            { label: 'Всего игр', value: stats.total_games, icon: Swords, accent: 'text-[#52FFE5]' },
            { label: 'Рейтинг', value: stats.rating, icon: TrendingUp, accent: 'text-[#52FFE5]' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-[16px] border border-white/[0.07] bg-black/20 px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-white/[0.06]">
                  <item.icon size={16} className={item.accent} />
                </div>
                <span className="text-[13px] font-bold text-white/58">{item.label}</span>
              </div>
              <span className={`text-[15px] font-black tabular-nums ${item.accent}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-3 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0a0a11]/80 p-3.5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(242,199,102,0.12),transparent_38%),radial-gradient(circle_at_100%_100%,rgba(157,124,255,0.12),transparent_40%)]" />

        <div className="relative mb-3 flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/[0.08] bg-white/[0.07]">
            <Gamepad2 size={19} className="text-[#52FFE5]" />
          </div>
          <div>
            <h2 className="text-[17px] font-black tracking-[-0.05em]">Любимый режим</h2>
            <p className="text-[11px] font-medium text-white/40">Поле favorite_mode из backend</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.05] p-3.5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#52FFE5]/16 via-[#9D7CFF]/12 to-transparent" />
          <div className="relative flex items-end justify-between gap-3">
            <div>
              <div className="text-4xl">🎮</div>
              <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/60">
                Top arena
              </p>
              <h3 className="mt-0.5 text-[24px] font-black leading-none tracking-[-0.07em]">
                {stats.favorite_mode && stats.favorite_mode !== 'none' ? stats.favorite_mode : 'Пока нет'}
              </h3>
              <p className="mt-1.5 max-w-[240px] text-[12px] font-medium leading-snug text-white/45">
                Когда backend начнёт отдавать активность, тут появится любимый режим игрока.
              </p>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#08080C]">
              <TrendingUp size={18} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
