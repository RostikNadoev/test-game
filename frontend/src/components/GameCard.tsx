import { motion } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';

interface Game {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  meta?: string;
  status?: string;
}

interface Props {
  game: Game;
  onClick: () => void;
}

export const GameCard = ({ game, onClick }: Props) => {
  return (
    <motion.button
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="group relative min-h-[178px] overflow-hidden rounded-[30px] border border-white/10 bg-[#0B0E1B] p-0 text-left shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-25 transition-opacity duration-300 group-hover:opacity-40`} />
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl transition duration-300 group-hover:bg-white/20" />
      <div className="absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

      <div className="relative z-10 flex h-full min-h-[178px] flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-[24px] border border-white/15 bg-white/10 text-4xl shadow-inner backdrop-blur-md">
            {game.icon}
          </div>

          <div className="flex flex-col items-end gap-2">
            {game.status && (
              <span className="rounded-full border border-white/10 bg-white/12 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/80">
                {game.status}
              </span>
            )}

            <span className="grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white/70 transition group-hover:translate-x-1 group-hover:text-white">
              <ChevronRight size={18} />
            </span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">
            <Sparkles size={12} />
            {game.meta || 'Duel Arena'}
          </div>

          <h3 className="text-[19px] font-black leading-none text-white">
            {game.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-300/72">
            {game.description}
          </p>
        </div>
      </div>
    </motion.button>
  );
};