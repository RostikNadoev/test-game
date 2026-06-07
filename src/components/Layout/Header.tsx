import { ArrowRightLeft, Coins, Plus, Star } from 'lucide-react';
import { useStore } from '../../store/useStore';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);

export const Header = () => {
  const { user, addStars, convertStarsToCoins } = useStore();

  const handleAddStars = () => addStars(100);

  const handleConvert = () => {
    if (user.stars >= 10) {
      convertStarsToCoins(10);
    } else {
      alert('Недостаточно звезд!');
    }
  };

  return (
    <header className="relative z-40 shrink-0 px-3 pb-1.5 pt-2">
      <div className="relative flex items-center gap-2 overflow-hidden rounded-[18px] border border-white/[0.07] bg-[#0a0a11]/85 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        {/* brand */}
        <div className="flex min-w-0 items-center gap-2 pr-1">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[#F2C766]/30 to-[#52FFE5]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <span className="text-sm font-black tracking-[-0.06em] text-white">T</span>
          </div>
          <div className="hidden min-[360px]:block">
            <p className="text-[7px] font-black uppercase tracking-[0.22em] text-white/34">
              TwinGames
            </p>
            <p className="-mt-0.5 text-[12px] font-black tracking-[-0.04em] text-white">
              Arena
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* stars */}
          <div className="flex items-center gap-1.5 rounded-[13px] border border-[#F2C766]/18 bg-[#F2C766]/[0.08] py-1 pl-1.5 pr-1">
            <Star size={13} className="fill-[#F2C766] text-[#F2C766]" />
            <span className="text-[13px] font-black tracking-[-0.03em] text-white tabular-nums">
              {formatNumber(user.stars)}
            </span>
            <button
              onClick={handleAddStars}
              aria-label="Добавить звезды"
              className="press grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 active:bg-white/20"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* coins */}
          <div className="flex items-center gap-1.5 rounded-[13px] border border-white/[0.07] bg-white/[0.05] px-2 py-1.5">
            <Coins size={13} className="text-[#52FFE5]" />
            <span className="text-[13px] font-black tracking-[-0.03em] text-white tabular-nums">
              {formatNumber(user.coins)}
            </span>
          </div>

          {/* convert */}
          <button
            onClick={handleConvert}
            aria-label="Обмен звёзд на монеты"
            className="press grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[12px] border border-white/[0.07] bg-white/[0.05] text-white/70 active:bg-white/[0.09]"
          >
            <ArrowRightLeft size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
