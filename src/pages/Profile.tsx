import { motion } from 'framer-motion';
import {
  Award,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Trophy
} from 'lucide-react';
import { useStore } from '../store/useStore';

export const Profile = () => {
  const user = useStore((state) => state.user);

  const wins = 42;
  const loses = 18;
  const totalGames = wins + loses;
  const winRate = Math.round((wins / totalGames) * 100);

  return (
    <div className="relative min-h-full overflow-hidden px-4 pb-32 text-white">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/16 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-fuchsia-500/16 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-300/10 blur-[100px]" />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/14 via-violet-500/10 to-fuchsia-500/14" />
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center rounded-[32px] border border-white/15 bg-gradient-to-br from-cyan-300 via-violet-500 to-fuchsia-500 text-5xl shadow-[0_20px_55px_rgba(34,211,238,0.2)]">
                🎮
              </div>

              <div className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-2xl border border-white/15 bg-[#090B17] shadow-xl">
                <Crown size={18} className="fill-amber-300 text-amber-300" />
              </div>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/70">
              Pro Player
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/55">
              <Sparkles size={13} />
              TwinGames profile
            </div>

            <h1 className="mt-1 text-[32px] font-black leading-none tracking-[-0.05em] text-white">
              Игрок
            </h1>

            <p className="mt-2 text-sm font-medium text-slate-300/75">
              ID: TG-1234 · Уровень 12 · Arena Member
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-3">
              <Trophy size={18} className="mb-2 text-amber-300" />
              <p className="text-lg font-black text-white">1250</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Рейтинг
              </p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/20 p-3">
              <Flame size={18} className="mb-2 text-orange-300" />
              <p className="text-lg font-black text-white">{winRate}%</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Winrate
              </p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/20 p-3">
              <Swords size={18} className="mb-2 text-cyan-200" />
              <p className="text-lg font-black text-white">{totalGames}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Игр
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="relative mt-4 grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="overflow-hidden rounded-[28px] border border-amber-300/15 bg-amber-300/10 p-4 shadow-xl backdrop-blur-xl"
        >
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-300/15">
            <Star size={24} className="fill-amber-300 text-amber-300" />
          </div>

          <p className="text-3xl font-black leading-none text-white">{user.stars}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/55">
            Звезд
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-cyan-300/10 p-4 shadow-xl backdrop-blur-xl"
        >
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/15">
            <Coins size={24} className="text-cyan-200" />
          </div>

          <p className="text-3xl font-black leading-none text-white">{user.coins}</p>
          <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">
            Монет
          </p>
        </motion.div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl">
        <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100/55">
              <TrendingUp size={13} />
              Statistics
            </div>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">
              Статистика
            </h2>
          </div>

          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.08]">
            <Award size={21} className="text-cyan-200" />
          </div>
        </div>

        <div className="relative space-y-2">
          {[
            { label: 'Побед', value: wins, icon: Trophy, color: 'text-amber-300' },
            { label: 'Поражений', value: loses, icon: ShieldCheck, color: 'text-slate-300' },
            { label: 'Рейтинг', value: 1250, icon: TrendingUp, color: 'text-cyan-200' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.08]">
                  <item.icon size={18} className={item.color} />
                </div>
                <span className="text-sm font-bold text-slate-300">{item.label}</span>
              </div>

              <span className={`text-base font-black ${item.color}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.08]">
            <Gamepad2 size={21} className="text-fuchsia-200" />
          </div>

          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-white">
              Любимый режим
            </h2>
            <p className="text-xs font-medium text-slate-400">
              На основе последних матчей
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-cyan-400/15 via-violet-500/10 to-fuchsia-500/15 p-4">
          <div className="text-4xl">🔢</div>
          <h3 className="mt-3 text-xl font-black text-white">Neon Matrix</h3>
          <p className="mt-1 text-sm font-medium text-slate-300/75">
            Самая активная арена игрока за последнее время.
          </p>
        </div>
      </section>
    </div>
  );
};