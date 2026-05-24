import { ArrowRightLeft, Coins, Plus, Sparkles, Star } from 'lucide-react';
import { useStore } from '../../store/useStore';

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
    <header className="relative z-40 shrink-0 px-4 pb-3">
      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#090B17]/90 px-4 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 -top-20 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/[0.08] shadow-inner">
              <Sparkles size={18} className="text-cyan-200" />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/60">
                TwinGames
              </p>
              <h2 className="-mt-0.5 text-sm font-black text-white">
                Arcade Arena
              </h2>
            </div>
          </div>

          <button
            onClick={handleConvert}
            className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.1] px-3 py-2 text-[11px] font-black text-white shadow-lg transition active:scale-95"
          >
            <ArrowRightLeft size={15} />
            Обмен
          </button>
        </div>

        <div className="relative mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between rounded-2xl border border-amber-300/15 bg-amber-300/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <Star size={18} className="fill-amber-300 text-amber-300" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/50">
                  Stars
                </p>
                <p className="text-sm font-black text-white">{user.stars}</p>
              </div>
            </div>

            <button
              onClick={handleAddStars}
              aria-label="Добавить звезды"
              className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.12] text-white transition hover:bg-white/[0.18] active:scale-90"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-3 py-2">
            <Coins size={18} className="text-cyan-200" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/50">
                Coins
              </p>
              <p className="text-sm font-black text-white">{user.coins}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};