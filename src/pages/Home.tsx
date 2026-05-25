import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Gamepad2, Shield, Sparkles, Trophy, Zap } from 'lucide-react';
import { GameCard } from '../components/GameCard';

const games = [
  {
    id: 'crashduel',
    name: 'Crash Duel',
    icon: '🚀',
    description: 'Забери множитель до краша',
    color: 'from-cyan-300 via-blue-500 to-fuchsia-700',
    meta: 'Crash',
    status: 'New',
  },
  {
    id: 'virusmarket',
    name: 'Virus Market',
    icon: '🦠',
    description: 'Мем-коины, памп и выход',
    color: 'from-emerald-400 via-cyan-500 to-violet-700',
    meta: 'Market',
    status: 'Hot',
  },
  {
    id: 'hexfall',
    name: 'Hex Fall',
    icon: '⬢',
    description: 'Выживи на ломких гексах',
    color: 'from-cyan-500 to-indigo-700',
    meta: 'Survival',
    status: 'Hot',
  },
  {
    id: 'rps',
    name: 'RPS Duel',
    icon: '✊',
    description: 'Камень ножницы бумага',
    color: 'from-rose-500 to-orange-500',
    meta: 'Mind Game',
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe Duel',
    icon: '❌',
    description: 'Крестики-нолики bo7',
    color: 'from-cyan-400 to-violet-600',
    meta: 'Classic',
  },
  {
    id: 'gridlock',
    name: 'Grid Lock',
    icon: '🧱',
    description: 'Дойди до края и блокируй',
    color: 'from-violet-500 to-fuchsia-700',
    meta: 'Strategy',
  },
  {
    id: 'blackjack',
    name: 'Blackjack Duel',
    icon: '🂡',
    description: '21 на 1v1',
    color: 'from-emerald-500 to-teal-700',
    meta: 'Cards',
  },
  {
    id: 'diceduel',
    name: 'Dice Duel',
    icon: '🎲',
    description: '3 кубика и риск-переброс',
    color: 'from-yellow-400 via-orange-500 to-red-600',
    meta: 'Risk',
    status: 'Local',
  },
  {
    id: 'neonmatrix',
    name: 'Neon Matrix',
    icon: '🔢',
    description: 'Выбери число ближе к финалу',
    color: 'from-cyan-400 via-fuchsia-500 to-violet-700',
    meta: 'Neon',
    status: 'Top',
  },
  {
    id: 'slingclash',
    name: 'Sling Clash',
    icon: '🪵',
    description: 'Рогатка через стену',
    color: 'from-amber-700 to-yellow-500',
    meta: 'Physics',
    status: 'Local',
  },
  {
    id: 'icebump',
    name: 'Ice Bump',
    icon: '🐧',
    description: 'Пингвины на льду',
    color: 'from-sky-400 to-cyan-600',
    meta: 'Party',
    status: 'Local',
  },
  {
    id: 'archer',
    name: 'Neon Duel',
    icon: '🏹',
    description: 'Битва на копьях',
    color: 'from-orange-500 to-red-600',
    meta: 'Aim',
  },
  {
    id: 'race',
    name: 'Street Race',
    icon: '🏎️',
    description: 'Гонки на скорость',
    color: 'from-blue-500 to-cyan-500',
    meta: 'Race',
  },
  {
    id: 'airhockey',
    name: 'Air Hockey',
    icon: '🏒',
    description: 'Аэрохоккей',
    color: 'from-indigo-500 to-purple-500',
    meta: 'Arcade',
  },
  {
    id: 'pingpong',
    name: 'Golf',
    icon: '🏓',
    description: 'Мини-гольф',
    color: 'from-yellow-500 to-amber-500',
    meta: 'Classic',
  },
  {
    id: 'darts',
    name: 'Darts',
    icon: '🎯',
    description: 'Дартс на точность',
    color: 'from-pink-500 to-rose-500',
    meta: 'Aim',
  },
];

const LOCAL_PLAY_IDS = new Set([
  'crashduel',
  'virusmarket',
  'slingclash',
  'icebump',
  'diceduel',
  'neonmatrix',
]);

const featuredIds = new Set(['crashduel', 'virusmarket', 'neonmatrix']);

export const Home = () => {
  const navigate = useNavigate();

  const featuredGames = games.filter((game) => featuredIds.has(game.id));

  const openGame = (gameId: string) => {
    if (LOCAL_PLAY_IDS.has(gameId)) {
      navigate(`/game/${gameId}/play`);
      return;
    }

    navigate(`/game/${gameId}/lobbies`);
  };

  return (
    <div className="relative min-h-full overflow-hidden px-4 pb-32 pt-2 text-white">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/20 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-300/10 blur-[100px]" />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/16 via-violet-500/10 to-fuchsia-500/16" />
        <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/75">
            <Sparkles size={13} />
            Premium mobile arcade
          </div>

          <h1 className="max-w-[330px] text-[34px] font-black leading-[0.92] tracking-[-0.05em] text-white">
            TwinGames
            <span className="block bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              Battle Hub
            </span>
          </h1>

          <p className="mt-3 max-w-[330px] text-sm font-medium leading-relaxed text-slate-300/78">
            Выбирай дуэль, заходи в арену и забирай победу. Быстрые 1v1-игры в неоновом стиле.
          </p>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => document.getElementById('games-grid')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition active:scale-95"
            >
              <Gamepad2 size={18} />
              Играть
            </button>

            <button
              onClick={() => navigate('/rating')}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition active:scale-95"
            >
              <Trophy size={18} />
              Рейтинг
            </button>
          </div>
        </div>
      </motion.section>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        {[
          { icon: Gamepad2, value: `${games.length}+`, label: 'Игр' },
          { icon: Zap, value: LOCAL_PLAY_IDS.size, label: 'Local' },
          { icon: Shield, value: '1v1', label: 'Формат' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3 backdrop-blur-xl"
          >
            <stat.icon size={17} className="mb-2 text-cyan-200" />
            <div className="text-lg font-black text-white">{stat.value}</div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <section className="relative mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200/65">
              <Flame size={13} />
              Featured
            </div>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">
              Горячие арены
            </h2>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {featuredGames.map((game) => (
            <button
              key={game.id}
              onClick={() => openGame(game.id)}
              className="relative min-w-[245px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0B0E1B] p-4 text-left shadow-xl active:scale-[0.98]"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-30`} />
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl" />

              <div className="relative">
                <div className="mb-7 flex items-center justify-between">
                  <div className="text-5xl">{game.icon}</div>
                  <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                    {game.status}
                  </span>
                </div>

                <h3 className="text-xl font-black text-white">{game.name}</h3>
                <p className="mt-1 text-xs font-medium text-slate-300/75">
                  {game.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section id="games-grid" className="relative mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/55">
              All games
            </div>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">
              Выбери битву
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onClick={() => openGame(game.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
};