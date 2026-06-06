import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  BadgeCheck,
  Coins,
  Flame,
  Gamepad2,
  Gem,
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
    id: 'towerstack',
    name: 'Tower Stack',
    icon: '🧱',
    description: 'Строй башню выше соперника',
    color: 'from-[#9D7CFF]/26 via-[#52FFE5]/12 to-transparent',
    meta: 'Stack',
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
    id: 'slingclash',
    name: 'Sling Clash',
    icon: '🪵',
    description: 'Рогатка через стену',
    color: 'from-[#F2C766]/22 via-white/[0.04] to-transparent',
    meta: 'Physics',
    status: 'Local',
  },
  {
    id: 'icebump',
    name: 'Ice Bump',
    icon: '🐧',
    description: 'Пингвины на льду',
    color: 'from-[#52FFE5]/20 via-white/[0.04] to-transparent',
    meta: 'Party',
    status: 'Local',
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
    id: 'pingpong',
    name: 'Golf',
    icon: '🏓',
    description: 'Мини-гольф',
    color: 'from-[#F2C766]/22 via-white/[0.04] to-transparent',
    meta: 'Classic',
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
  'towerstack',
  'crashduel',
  'virusmarket',
  'slingclash',
  'icebump',
  'diceduel',
  'neonmatrix',
]);

const featuredIds = new Set([
  'plinko',
  'paperio',
  'towerstack',
  'crashduel',
  'virusmarket',
  'neonmatrix',
]);

export const Home = () => {
  const navigate = useNavigate();

  const allLobbies = useStore((state) => state.lobbies);
  const [refreshKey, setRefreshKey] = useState(0);

  const gameById = useMemo(() => {
    return new Map(games.map((game) => [game.id, game]));
  }, []);

  const activeLobbies = useMemo(() => {
    return allLobbies
      .filter((lobby) => lobby.status === 'waiting' && lobby.players.length < 2)
      .map((lobby) => ({
        ...lobby,
        game: gameById.get(lobby.gameId),
      }));
  }, [allLobbies, gameById, refreshKey]);

  const featuredGames = games.filter((game) => featuredIds.has(game.id));
  const primaryGame = featuredGames[0];
  const sideGames = featuredGames.slice(1);

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

  const scrollToGames = () => {
    document.getElementById('games-grid')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const scrollToLobbies = () => {
    document.getElementById('active-lobbies')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const refreshLobbies = () => {
    setRefreshKey((value) => value + 1);
  };

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-4 pb-32 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 premium-grid opacity-[0.22]" />
      <div className="pointer-events-none absolute -left-28 top-10 h-72 w-72 rounded-full bg-[#F2C766]/12 blur-[90px]" />
      <div className="pointer-events-none absolute -right-28 top-52 h-80 w-80 rounded-full bg-[#52FFE5]/10 blur-[105px]" />

      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C]/82 p-5 shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(242,199,102,0.18),transparent_32%),radial-gradient(circle_at_95%_28%,rgba(82,255,229,0.14),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.09),transparent_45%)]" />
        <div className="pointer-events-none absolute -right-12 top-8 h-36 w-36 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 top-20 h-20 w-20 rounded-full border border-white/10" />

        <div className="relative grid grid-cols-[1.15fr_0.85fr] gap-3">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-white/48">
              <Sparkles size={12} className="text-[#F2C766]" />
              Season 01
            </div>

            <h1 className="text-[38px] font-black leading-[0.88] tracking-[-0.09em] text-white">
              Battle
              <span className="block text-white/44">Club</span>
            </h1>

            <p className="mt-4 max-w-[210px] text-[13px] font-medium leading-relaxed text-white/50">
              Быстрые дуэли, активные лобби и ощущение закрытого игрового клуба.
            </p>
          </div>

          <div className="relative min-h-[190px]">
            <div className="absolute right-0 top-0 h-[150px] w-[116px] rotate-6 rounded-[32px] border border-white/[0.1] bg-white/[0.08] shadow-[0_20px_55px_rgba(0,0,0,0.35)]" />
            <div className="absolute bottom-0 left-0 h-[150px] w-[116px] -rotate-6 rounded-[32px] border border-white/[0.1] bg-[#F2C766]/12 shadow-[0_20px_55px_rgba(0,0,0,0.35)]" />

            <div className="absolute right-3 top-8 grid h-[132px] w-[108px] place-items-center rounded-[30px] border border-white/[0.12] bg-[#09090E]/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="text-center">
                <div className="text-5xl">🎮</div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
                  Arena
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={scrollToGames}
            className="flex items-center justify-center gap-2 rounded-[22px] bg-white px-4 py-3.5 text-sm font-black tracking-[-0.02em] text-[#08080C] shadow-[0_18px_38px_rgba(255,255,255,0.16)] transition active:scale-[0.97]"
          >
            <Gamepad2 size={18} />
            Выбрать игру
          </button>

          <button
            onClick={scrollToLobbies}
            className="flex items-center justify-center gap-2 rounded-[22px] border border-white/[0.09] bg-white/[0.07] px-4 py-3.5 text-sm font-black tracking-[-0.02em] text-white/78 transition active:scale-[0.97]"
          >
            <Users size={18} className="text-[#F2C766]" />
            Лобби
          </button>
        </div>
      </motion.section>

      <section className="relative mt-3 grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-[25px] border border-white/[0.08] bg-white/[0.045] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl"
          >
            <stat.icon size={17} className="mb-3 text-[#52FFE5]" />
            <p className="text-[20px] font-black leading-none tracking-[-0.06em] text-white">
              {stat.value}
            </p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/34">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      <section id="active-lobbies" className="relative mt-7 scroll-mt-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#52FFE5]/62">
              <Users size={13} />
              Live rooms
            </div>

            <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-white">
              Активные лобби
            </h2>
          </div>

          <button
            onClick={refreshLobbies}
            className="group flex h-11 items-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.055] px-3.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/52 backdrop-blur-xl transition hover:bg-white/[0.08] active:scale-95"
          >
            <RefreshCw
              size={15}
              className="text-[#F2C766] transition duration-300 group-active:rotate-180"
            />
            Обновить
          </button>
        </div>

        <div key={refreshKey} className="space-y-3">
          {activeLobbies.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-[36px] border border-white/[0.09] bg-white/[0.045] px-5 py-11 text-center shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(82,255,229,0.11),transparent_34%)]" />

              <div className="relative mx-auto mb-5 grid h-[74px] w-[74px] place-items-center rounded-[28px] border border-white/[0.08] bg-white/[0.06]">
                <Users size={32} className="text-[#52FFE5]/72" />
              </div>

              <p className="relative text-lg font-black tracking-[-0.04em] text-white">
                Сейчас нет открытых лобби
              </p>

              <p className="relative mx-auto mt-2 max-w-[280px] text-sm font-medium leading-relaxed text-white/42">
                Тут будут появляться комнаты со всех игр, к которым можно присоединиться.
              </p>
            </motion.div>
          ) : (
            activeLobbies.map((lobby, index) => {
              const game = lobby.game;

              return (
                <motion.div
                  key={`${refreshKey}-${lobby.id}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.32,
                    delay: Math.min(index * 0.035, 0.22),
                    ease: 'easeOut',
                  }}
                  className="group relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.045] p-3 shadow-[0_16px_45px_rgba(0,0,0,0.24)] backdrop-blur-xl"
                >
                  <div
                    className={[
                      'pointer-events-none absolute inset-0 bg-gradient-to-r',
                      game?.color ?? 'from-[#52FFE5]/14 via-transparent to-[#F2C766]/10',
                    ].join(' ')}
                  />

                  <div className="relative flex items-center gap-3">
                    <div className="grid h-[70px] w-[70px] shrink-0 place-items-center rounded-[25px] border border-white/[0.09] bg-black/22 text-[34px]">
                      {game?.icon ?? '🎮'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex min-w-0 items-center gap-2">
                        <span className="truncate text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/62">
                          {game?.name ?? 'Игра'}
                        </span>

                        <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/44">
                          {lobby.players.length}/2
                        </span>
                      </div>

                      <h3 className="truncate text-[17px] font-black tracking-[-0.045em] text-white">
                        {lobby.name}
                      </h3>

                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/22 px-2.5 py-1 text-xs font-black text-white/58">
                          <Coins size={13} className="text-[#F2C766]" />
                          {lobby.betAmount}
                        </span>

                        <span className="rounded-full bg-black/18 px-2.5 py-1 text-xs font-black text-white/35">
                          Можно войти
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => undefined}
                      className="shrink-0 rounded-[20px] bg-white px-3.5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#08080C] shadow-[0_16px_34px_rgba(255,255,255,0.12)] transition active:scale-95"
                    >
                      Войти
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </section>

      <section className="relative mt-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#F2C766]/70">
              <Flame size={13} />
              Hot table
            </div>
            <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-white">
              Главная арена
            </h2>
          </div>

          <BadgeCheck size={19} className="text-[#52FFE5]/70" />
        </div>

        {primaryGame && (
          <button
            onClick={() => openGame(primaryGame.id)}
            className="group relative min-h-[235px] w-full overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C] p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.42)] transition active:scale-[0.985]"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${primaryGame.color}`} />
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

            <div className="relative flex h-full min-h-[195px] flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-20 w-20 place-items-center rounded-[30px] border border-white/[0.1] bg-black/20 text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {primaryGame.icon}
                </div>

                <span className="rounded-full border border-white/[0.1] bg-white/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/62">
                  {primaryGame.status}
                </span>
              </div>

              <div className="mt-auto">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F2C766]/65">
                  {primaryGame.meta}
                </p>

                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-[32px] font-black leading-none tracking-[-0.08em] text-white">
                      {primaryGame.name}
                    </h3>
                    <p className="mt-2 text-sm font-medium text-white/48">
                      {primaryGame.description}
                    </p>
                  </div>

                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#08080C] transition group-hover:rotate-12">
                    <ArrowUpRight size={20} />
                  </div>
                </div>
              </div>
            </div>
          </button>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          {sideGames.map((game) => (
            <button
              key={game.id}
              onClick={() => openGame(game.id)}
              className="relative min-h-[154px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.045] p-4 text-left backdrop-blur-xl transition active:scale-[0.985]"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${game.color}`} />

              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <div className="text-4xl">{game.icon}</div>
                  <span className="rounded-full bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/45">
                    {game.status}
                  </span>
                </div>

                <div className="mt-auto">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F2C766]/60">
                    {game.meta}
                  </p>
                  <h3 className="mt-1 text-[17px] font-black leading-tight tracking-[-0.05em] text-white">
                    {game.name}
                  </h3>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="games-grid" className="relative mt-7 scroll-mt-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/32">
              <Gem size={13} />
              Arcade list
            </div>
            <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-white">
              Все игры
            </h2>
          </div>
        </div>

        <div className="space-y-3">
          {games.map((game, index) => (
            <motion.button
              key={game.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: Math.min(index * 0.025, 0.24),
                ease: 'easeOut',
              }}
              onClick={() => openGame(game.id)}
              className="group relative flex min-h-[96px] w-full items-center gap-3 overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.045] p-3 text-left shadow-[0_16px_45px_rgba(0,0,0,0.24)] backdrop-blur-xl transition active:scale-[0.985]"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${game.color}`} />

              <div className="relative grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[24px] border border-white/[0.09] bg-black/22 text-[34px]">
                {game.icon}
              </div>

              <div className="relative min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/58">
                    {game.meta}
                  </span>

                  {game.status && (
                    <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/44">
                      {game.status}
                    </span>
                  )}
                </div>

                <h3 className="truncate text-[17px] font-black tracking-[-0.045em] text-white">
                  {game.name}
                </h3>

                <p className="mt-1 truncate text-[12px] font-medium text-white/42">
                  {game.description}
                </p>
              </div>

              <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/52 transition group-hover:bg-white group-hover:text-[#08080C]">
                <ArrowUpRight size={16} />
              </div>
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
};