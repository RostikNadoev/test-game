import { motion } from 'framer-motion';
import {
  Award,
  Coins,
  Crown,
  Flame,
  Gamepad2,
  Gem,
  ShieldCheck,
  Star,
  Swords,
  TrendingUp,
  Trophy,
  UserRound,
} from 'lucide-react';
import { useStore } from '../store/useStore';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);

export const Profile = () => {
  const user = useStore((state) => state.user);

  const wins = 42;
  const loses = 18;
  const totalGames = wins + loses;
  const rating = 1250;
  const level = 12;
  const winRate = Math.round((wins / totalGames) * 100);

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-4 pb-32 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 premium-grid opacity-[0.2]" />
      <div className="pointer-events-none absolute -left-28 top-8 h-72 w-72 rounded-full bg-[#F2C766]/12 blur-[95px]" />
      <div className="pointer-events-none absolute -right-28 top-52 h-80 w-80 rounded-full bg-[#52FFE5]/10 blur-[110px]" />

      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C]/84 p-5 shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(242,199,102,0.18),transparent_34%),radial-gradient(circle_at_95%_25%,rgba(82,255,229,0.13),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.09),transparent_46%)]" />
        <div className="pointer-events-none absolute -right-10 top-8 h-40 w-40 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 top-24 h-20 w-20 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="relative">
            <div className="grid h-[112px] w-[112px] place-items-center rounded-[38px] border border-white/[0.12] bg-white/[0.07] shadow-[0_24px_65px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="grid h-[86px] w-[86px] place-items-center rounded-[30px] bg-gradient-to-br from-[#F2C766]/30 via-[#52FFE5]/18 to-[#9D7CFF]/20 text-5xl">
                🎮
              </div>
            </div>

            <div className="absolute -bottom-2 -right-2 grid h-11 w-11 place-items-center rounded-[18px] border border-white/[0.12] bg-[#08080C] shadow-[0_16px_34px_rgba(0,0,0,0.38)]">
              <Crown size={20} className="fill-[#F2C766] text-[#F2C766]" />
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-white/50">
              <Gem size={12} className="text-[#52FFE5]" />
              Pro
            </div>

            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.24em] text-white/34">
              Level
            </p>
            <p className="text-[34px] font-black leading-none tracking-[-0.08em] text-white">
              {level}
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#F2C766]/68">
            <UserRound size={13} />
            TwinGames member
          </div>

          <h1 className="mt-1 text-[38px] font-black leading-none tracking-[-0.085em] text-white">
            Игрок
          </h1>

          <p className="mt-2 text-sm font-medium text-white/48">
            ID: TG-1234 · Arena Member · Закрытый игровой клуб
          </p>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Рейтинг', value: rating, icon: Trophy },
            { label: 'Winrate', value: `${winRate}%`, icon: Flame },
            { label: 'Матчи', value: totalGames, icon: Swords },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[24px] border border-white/[0.08] bg-black/22 p-3.5"
            >
              <item.icon size={17} className="mb-3 text-[#F2C766]" />
              <p className="text-[20px] font-black leading-none tracking-[-0.06em] text-white">
                {item.value}
              </p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/34">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </motion.section>

      <section className="relative mt-3 grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-[32px] border border-[#F2C766]/18 bg-[#F2C766]/[0.11] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#F2C766]/18 blur-2xl" />

          <div className="relative mb-5 grid h-13 w-13 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.08]">
            <Star size={25} className="fill-[#F2C766] text-[#F2C766]" />
          </div>

          <p className="relative text-[34px] font-black leading-none tracking-[-0.08em] text-white">
            {formatNumber(user.stars)}
          </p>
          <p className="relative mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#FFE0A3]/58">
            Stars
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-[32px] border border-white/[0.09] bg-white/[0.055] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#52FFE5]/12 blur-2xl" />

          <div className="relative mb-5 grid h-13 w-13 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.08]">
            <Coins size={25} className="text-[#52FFE5]" />
          </div>

          <p className="relative text-[34px] font-black leading-none tracking-[-0.08em] text-white">
            {formatNumber(user.coins)}
          </p>
          <p className="relative mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/42">
            Coins
          </p>
        </motion.div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-[36px] border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(82,255,229,0.11),transparent_34%)]" />

        <div className="relative mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#52FFE5]/58">
              <TrendingUp size={13} />
              Performance
            </div>
            <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-white">
              Статистика
            </h2>
          </div>

          <div className="grid h-12 w-12 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.06]">
            <Award size={22} className="text-[#F2C766]" />
          </div>
        </div>

        <div className="relative space-y-2">
          {[
            { label: 'Победы', value: wins, icon: Trophy, accent: 'text-[#F2C766]' },
            { label: 'Поражения', value: loses, icon: ShieldCheck, accent: 'text-white/62' },
            { label: 'Рейтинг', value: rating, icon: TrendingUp, accent: 'text-[#52FFE5]' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-[24px] border border-white/[0.08] bg-black/20 px-3.5 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-[17px] bg-white/[0.065]">
                  <item.icon size={18} className={item.accent} />
                </div>

                <span className="text-sm font-bold text-white/58">
                  {item.label}
                </span>
              </div>

              <span className={`text-base font-black ${item.accent}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-[36px] border border-white/[0.09] bg-[#08080C]/82 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.13),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(157,124,255,0.12),transparent_36%)]" />

        <div className="relative mb-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.07]">
            <Gamepad2 size={22} className="text-[#52FFE5]" />
          </div>

          <div>
            <h2 className="text-[20px] font-black tracking-[-0.06em] text-white">
              Любимый режим
            </h2>
            <p className="text-xs font-medium text-white/40">
              По активности последних матчей
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.055] p-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#52FFE5]/16 via-[#9D7CFF]/12 to-transparent" />

          <div className="relative flex items-end justify-between gap-4">
            <div>
              <div className="text-5xl">🔢</div>

              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-[#F2C766]/60">
                Top arena
              </p>

              <h3 className="mt-1 text-[28px] font-black leading-none tracking-[-0.08em] text-white">
                Neon Matrix
              </h3>

              <p className="mt-2 max-w-[230px] text-sm font-medium leading-relaxed text-white/45">
                Самая активная арена игрока за последнее время.
              </p>
            </div>

            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#08080C]">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};