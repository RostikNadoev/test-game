import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Flame,
  Gamepad2,
  Joystick,
  Shield,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { FEATURED_GAME_CODES, GAME_CATALOG } from '../data/games';

type Stat = {
  icon: LucideIcon;
  value: string | number;
  label: string;
};

export const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const featuredGames = useMemo(
    () => GAME_CATALOG.filter((game) => FEATURED_GAME_CODES.includes(game.code)),
    [],
  );

  const primaryGame = featuredGames[0];
  const sideGames = featuredGames.slice(1, 3);

  const stats: Stat[] = [
    { icon: Joystick, value: GAME_CATALOG.length, label: 'Арен' },
    { icon: Shield, value: '1v1', label: 'Duel' },
    { icon: Trophy, value: user?.stats.rating ?? 1000, label: 'Рейтинг' },
  ];

  const openGame = (playPath: string) => {
    navigate(playPath);
  };

  const scrollToGames = () =>
    document
      .getElementById('games-grid')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_38%),radial-gradient(circle_at_100%_30%,rgba(82,255,229,0.12),transparent_40%)]" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles size={11} className="text-[#F2C766]" />
              Backend sync
            </div>

            <h1 className="text-[30px] font-black leading-[0.9] tracking-[-0.07em]">
              Battle
              <span className="block text-white/40">Club</span>
            </h1>

            <p className="mt-2.5 max-w-[220px] text-[12px] font-medium leading-snug text-white/48">
              Авторизация через Telegram, backend-баланс и ровно 13 арен из инструкции.
            </p>
          </div>

          <div className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[22px] border border-white/[0.1] bg-white/[0.05] text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            🎮
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={scrollToGames}
            className="press flex items-center justify-center gap-2 rounded-[16px] bg-white px-3 py-2.5 text-[13px] font-black tracking-[-0.02em] text-[#08080C]"
          >
            <Gamepad2 size={16} />
            Играть
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="press flex items-center justify-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-[13px] font-black tracking-[-0.02em] text-white/78"
          >
            <Trophy size={16} className="text-[#F2C766]" />
            Профиль
          </button>
        </div>
      </section>

      <section className="reveal relative mt-2 grid grid-cols-3 gap-2" style={{ animationDelay: '40ms' }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[18px] border border-white/[0.07] bg-white/[0.04] px-3 py-2.5"
          >
            <stat.icon size={15} className="mb-2 text-[#52FFE5]" />
            <p className="text-[18px] font-black leading-none tracking-[-0.05em] tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-[8px] font-black uppercase tracking-[0.16em] text-white/34">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      <section className="relative mt-6">
        <div className="mb-2.5 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/70">
              <Flame size={12} />
              Hot table
            </div>
            <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
              Главная арена
            </h2>
          </div>
        </div>

        {primaryGame && (
          <button
            onClick={() => openGame(primaryGame.playPath)}
            className="press group relative min-h-[170px] w-full overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11] p-4 text-left"
          >
            <div
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${primaryGame.color}`}
            />
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

            <div className="relative flex h-full min-h-[140px] flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.1] bg-black/25 text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {primaryGame.icon}
                </div>
                {primaryGame.status && (
                  <span className="rounded-full border border-white/[0.1] bg-white/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/62">
                    {primaryGame.status}
                  </span>
                )}
              </div>

              <div className="mt-auto">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/65">
                  {primaryGame.code}
                </p>
                <div className="mt-1.5 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-[26px] font-black leading-none tracking-[-0.07em]">
                      {primaryGame.displayName}
                    </h3>
                    <p className="mt-1.5 text-[12px] font-medium text-white/48">
                      {primaryGame.description}
                    </p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#08080C]">
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </div>
            </div>
          </button>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          {sideGames.map((game) => (
            <button
              key={game.code}
              onClick={() => openGame(game.playPath)}
              className="press relative min-h-[128px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-3 text-left"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${game.color}`} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <div className="text-3xl">{game.icon}</div>
                  {game.status && (
                    <span className="rounded-full bg-black/25 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/45">
                      {game.status}
                    </span>
                  )}
                </div>
                <div className="mt-auto">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/60">
                    {game.code}
                  </p>
                  <h3 className="mt-0.5 text-[15px] font-black leading-tight tracking-[-0.04em]">
                    {game.displayName}
                  </h3>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="games-grid" className="relative mt-6 scroll-mt-3">
        <div className="mb-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/32">
            <Joystick size={12} />
            Backend codes
          </div>
          <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
            Все игры
          </h2>
        </div>

        <div className="space-y-2">
          {GAME_CATALOG.map((game, index) => (
            <button
              key={game.code}
              onClick={() => openGame(game.playPath)}
              className="reveal press group relative flex min-h-[76px] w-full items-center gap-2.5 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-2.5 text-left"
              style={{ animationDelay: `${Math.min(index * 22, 260)}ms` }}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r opacity-70 ${game.color}`} />
              <div className="relative grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[17px] border border-white/[0.08] bg-black/25 text-[26px]">
                {game.icon}
              </div>

              <div className="relative min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/58">
                    {game.code}
                  </span>
                  {game.status && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/44">
                      {game.status}
                    </span>
                  )}
                </div>
                <h3 className="truncate text-[15px] font-black tracking-[-0.04em]">
                  {game.displayName}
                </h3>
                <p className="mt-0.5 truncate text-[11px] font-medium text-white/42">
                  {game.description}
                </p>
              </div>

              <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/52">
                <ArrowUpRight size={15} />
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};
