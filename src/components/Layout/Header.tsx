import { ArrowRightLeft, Coins, Plus, Sparkles, Star } from 'lucide-react';
import { useStore } from '../../store/useStore';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);

export const Header = () => {
  const { user, addStars, convertStarsToCoins } = useStore();

  const handleAddStars = () => {
    addStars(100);
  };

  const handleConvert = () => {
    if (user.stars >= 10) {
      convertStarsToCoins(10);
    } else {
      alert('Недостаточно звезд!');
    }
  };

  return (
    <header className="relative z-40 shrink-0 px-4 pb-3 pt-3">
      <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#080910]/88 px-4 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%,rgba(218,185,112,0.07))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Sparkles size={18} className="text-[#D8B76A]" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/36">
                TwinGames
              </p>
              <h2 className="-mt-0.5 truncate text-[15px] font-semibold tracking-[-0.03em] text-white">
                Arcade Arena
              </h2>
            </div>
          </div>

          <button
            onClick={handleConvert}
            className="group flex shrink-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.055] px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition hover:bg-white/[0.08] active:scale-[0.97]"
          >
            <ArrowRightLeft
              size={14}
              className="text-white/55 transition group-hover:text-[#D8B76A]"
            />
            Обмен
          </button>
        </div>

        <div className="relative mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[22px] border border-[#D8B76A]/15 bg-[#D8B76A]/[0.07] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#D8B76A]/10">
                  <Star size={17} className="fill-[#D8B76A] text-[#D8B76A]" />
                </div>

                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#EED898]/45">
                    Stars
                  </p>
                  <p className="truncate text-[15px] font-semibold tracking-[-0.03em] text-white">
                    {formatNumber(user.stars)}
                  </p>
                </div>
              </div>

              <button
                onClick={handleAddStars}
                aria-label="Добавить звезды"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.055] text-white/80 transition hover:bg-white/[0.09] active:scale-90"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/[0.055]">
                <Coins size={17} className="text-white/72" />
              </div>

              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/34">
                  Coins
                </p>
                <p className="truncate text-[15px] font-semibold tracking-[-0.03em] text-white">
                  {formatNumber(user.coins)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};