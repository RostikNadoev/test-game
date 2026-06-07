import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Coins,
  Flame,
  Gamepad2,
  Joystick,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store/useStore';

type Game = {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  meta: string;
  status?: string;
};

type Stat = {
  icon: LucideIcon;
  value: string | number;
  label: string;
};

const games: Game[] = [
  {
    id: 'plinko',
    name: 'Plinko PvP',
    icon: '🔵',
    description: 'Шарик, пины и дуэль на удачу',
    color: 'from-[#52FFE5]/24 via-[#9D7CFF]/12 to-transparent',
    meta: 'Plinko',
    status: 'New',
  },
  {
    id: 'paperio',
    name: 'Paper IO',
    icon: '🟩',
    description: 'Захватывай территорию и режь след соперника',
    color: 'from-[#54F2A8]/24 via-[#52FFE5]/12 to-transparent',
    meta: 'Territory',
    status: 'New',
  },
  {
    id: 'crashduel',
    name: 'Crash Duel',
    icon: '🚀',
    description: 'Забери множитель до краша',
    color: 'from-[#F2C766]/25 via-[#52FFE5]/12 to-transparent',
    meta: 'Crash',
    status: 'New',
  },
  {
    id: 'virusmarket',
    name: 'Virus Market',
    icon: '🦠',
    description: 'Мем-коины, памп и выход',
    color: 'from-[#52FFE5]/22 via-[#F2C766]/10 to-transparent',
    meta: 'Market',
    status: 'Hot',
  },
  {
    id: 'hexfall',
    name: 'Hex Fall',
    icon: '⬢',
    description: 'Выживи на ломких гексах',
    color: 'from-[#9D7CFF]/24 via-[#52FFE5]/10 to-transparent',
    meta: 'Survival',
    status: 'Hot',
  },
  {
    id: 'rps',
    name: 'RPS Duel',
    icon: '✊',
    description: 'Камень ножницы бумага',
    color: 'from-[#FF7A90]/22 via-[#F2C766]/10 to-transparent',
    meta: 'Mind Game',
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe Duel',
    icon: '❌',
    description: 'Крестики-нолики bo7',
    color: 'from-[#52FFE5]/18 via-[#9D7CFF]/12 to-transparent',
    meta: 'Classic',
  },
  {
    id: 'gridlock',
    name: 'Grid Lock',
    icon: '🧱',
    description: 'Дойди до края и блокируй',
    color: 'from-[#9D7CFF]/24 via-[#FF7A90]/10 to-transparent',
    meta: 'Strategy',
  },
  {
    id: 'blackjack',
    name: 'Blackjack Duel',
    icon: '🂡',
    description: '21 на 1v1',
    color: 'from-[#54F2A8]/22 via-[#52FFE5]/10 to-transparent',
    meta: 'Cards',
  },
  {
    id: 'diceduel',
    name: 'Dice Duel',
    icon: '🎲',
    description: '3 кубика и риск-переброс',
    color: 'from-[#F2C766]/26 via-[#FF7A90]/10 to-transparent',
    meta: 'Risk',
    status: 'Local',
  },
  {
    id: 'neonmatrix',
    name: 'Neon Matrix',
    icon: '🔢',
    description: 'Выбери число ближе к финалу',
    color: 'from-[#52FFE5]/20 via-[#9D7CFF]/16 to-transparent',
    meta: 'Neon',
    status: 'Top',
  },
  {
    id: 'archer',
    name: 'Neon Duel',
    icon: '🏹',
    description: 'Битва на копьях',
    color: 'from-[#FF7A90]/20 via-[#F2C766]/8 to-transparent',
    meta: 'Aim',
  },
  {
    id: 'race',
    name: 'Street Race',
    icon: '🏎️',
    description: 'Гонки на скорость',
    color: 'from-[#52FFE5]/18 via-[#9D7CFF]/10 to-transparent',
    meta: 'Race',
  },
  {
    id: 'airhockey',
    name: 'Air Hockey',
    icon: '🏒',
    description: 'Аэрохоккей',
    color: 'from-[#9D7CFF]/22 via-[#52FFE5]/8 to-transparent',
    meta: 'Arcade',
  },
  {
    id: 'darts',
    name: 'Darts',
    icon: '🎯',
    description: 'Дартс на точность',
    color: 'from-[#FF7A90]/22 via-white/[0.04] to-transparent',
    meta: 'Aim',
  },
];

const LOCAL_PLAY_IDS = new Set([
  'paperio',
  'crashduel',
  'virusmarket',
  'diceduel',
  'neonmatrix',
]);

const featuredIds = new Set([
  'plinko',
  'paperio',
  'crashduel',
  'virusmarket',
  'neonmatrix',
]);

export const Home = () => {
  const navigate = useNavigate();

  const allLobbies = useStore((state) => state.lobbies);
  const [refreshKey, setRefreshKey] = useState(0);

  const gameById = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [],
  );

  const activeLobbies = useMemo(() => {
    return allLobbies
      .filter((lobby) => lobby.status === 'waiting' && lobby.players.length < 2)
      .map((lobby) => ({ ...lobby, game: gameById.get(lobby.gameId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLobbies, gameById, refreshKey]);

  const featuredGames = games.filter((game) => featuredIds.has(game.id));
  const primaryGame = featuredGames[0];
  const sideGames = featuredGames.slice(1, 3);

  const stats: Stat[] = [
    { icon: Joystick, value: `${games.length}+`, label: 'Арен' },
    { icon: Users, value: activeLobbies.length, label: 'Лобби' },
    { icon: Shield, value: '1v1', label: 'Duel' },
  ];

  const openGame = (gameId: string) => {
    if (LOCAL_PLAY_IDS.has(gameId)) {
      navigate(`/game/${gameId}/play`);
      return;
    }
    navigate(`/game/${gameId}/lobbies`);
  };

  const scrollToGames = () =>
    document
      .getElementById('games-grid')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const scrollToLobbies = () =>
    document
      .getElementById('active-lobbies')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const refreshLobbies = () => setRefreshKey((v) => v + 1);

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      {/* HERO */}
      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_38%),radial-gradient(circle_at_100%_30%,rgba(82,255,229,0.12),transparent_40%)]" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles size={11} className="text-[#F2C766]" />
              Season 01
            </div>

            <h1 className="text-[30px] font-black leading-[0.9] tracking-[-0.07em]">
              Battle
              <span className="block text-white/40">Club</span>
            </h1>

            <p className="mt-2.5 max-w-[200px] text-[12px] font-medium leading-snug text-white/48">
              Быстрые дуэли, живые лобби и атмосфера закрытого клуба.
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
            onClick={scrollToLobbies}
            className="press flex items-center justify-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-[13px] font-black tracking-[-0.02em] text-white/78"
          >
            <Users size={16} className="text-[#F2C766]" />
            Лобби
          </button>
        </div>
      </section>

      {/* STATS */}
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

      {/* ACTIVE LOBBIES */}
      <section id="active-lobbies" className="relative mt-6 scroll-mt-3">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#52FFE5]/60">
              <Users size={12} />
              Live rooms
            </div>
            <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
              Активные лобби
            </h2>
          </div>

          <button
            onClick={refreshLobbies}
            className="press group flex h-9 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/52"
          >
            <RefreshCw
              size={13}
              className="text-[#F2C766] transition-transform duration-300 group-active:rotate-180"
            />
            Обновить
          </button>
        </div>

        <div key={refreshKey} className="space-y-2">
          {activeLobbies.length === 0 ? (
            <div className="reveal relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.035] px-5 py-9 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] border border-white/[0.07] bg-white/[0.05]">
                <Users size={26} className="text-[#52FFE5]/70" />
              </div>
              <p className="text-[15px] font-black tracking-[-0.03em]">
                Сейчас нет открытых лобби
              </p>
              <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] font-medium leading-snug text-white/42">
                Тут появляются комнаты со всех игр, к которым можно присоединиться.
              </p>
            </div>
          ) : (
            activeLobbies.map((lobby, index) => {
              const game = lobby.game;
              return (
                <div
                  key={`${refreshKey}-${lobby.id}`}
                  className="reveal group relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-2.5"
                  style={{ animationDelay: `${Math.min(index * 35, 200)}ms` }}
                >
                  <div
                    className={[
                      'pointer-events-none absolute inset-0 bg-gradient-to-r opacity-70',
                      game?.color ??
                        'from-[#52FFE5]/14 via-transparent to-[#F2C766]/10',
                    ].join(' ')}
                  />
                  <div className="relative flex items-center gap-2.5">
                    <div className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[18px] border border-white/[0.08] bg-black/25 text-[28px]">
                      {game?.icon ?? '🎮'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/65">
                          {game?.name ?? 'Игра'}
                        </span>
                        <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[8px] font-black tabular-nums text-white/45">
                          {lobby.players.length}/2
                        </span>
                      </div>

                      <h3 className="truncate text-[15px] font-black tracking-[-0.04em]">
                        {lobby.name}
                      </h3>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-black text-white/60">
                          <Coins size={12} className="text-[#F2C766]" />
                          <span className="tabular-nums">{lobby.betAmount}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => undefined}
                      className="press shrink-0 rounded-[14px] bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#08080C]"
                    >
                      Войти
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* HOT ARENA */}
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
            onClick={() => openGame(primaryGame.id)}
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
                <span className="rounded-full border border-white/[0.1] bg-white/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/62">
                  {primaryGame.status}
                </span>
              </div>

              <div className="mt-auto">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/65">
                  {primaryGame.meta}
                </p>
                <div className="mt-1.5 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-[26px] font-black leading-none tracking-[-0.07em]">
                      {primaryGame.name}
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
              key={game.id}
              onClick={() => openGame(game.id)}
              className="press relative min-h-[128px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-3 text-left"
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${game.color}`}
              />
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
                    {game.meta}
                  </p>
                  <h3 className="mt-0.5 text-[15px] font-black leading-tight tracking-[-0.04em]">
                    {game.name}
                  </h3>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ALL GAMES */}
      <section id="games-grid" className="relative mt-6 scroll-mt-3">
        <div className="mb-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/32">
            <Joystick size={12} />
            Arcade list
          </div>
          <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
            Все игры
          </h2>
        </div>

        <div className="space-y-2">
          {games.map((game, index) => (
            <button
              key={game.id}
              onClick={() => openGame(game.id)}
              className="reveal press group relative flex min-h-[76px] w-full items-center gap-2.5 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-2.5 text-left"
              style={{ animationDelay: `${Math.min(index * 22, 260)}ms` }}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-r opacity-70 ${game.color}`}
              />
              <div className="relative grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[17px] border border-white/[0.08] bg-black/25 text-[26px]">
                {game.icon}
              </div>

              <div className="relative min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/58">
                    {game.meta}
                  </span>
                  {game.status && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/44">
                      {game.status}
                    </span>
                  )}
                </div>
                <h3 className="truncate text-[15px] font-black tracking-[-0.04em]">
                  {game.name}
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
