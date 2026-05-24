import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import { ChevronLeft, Coins, Sparkles, Sword, Wallet } from 'lucide-react';

export const CreateLobby = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const createLobby = useStore((state) => state.createLobby);
  const userCoins = useStore((state) => state.user.coins);

  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);

  const handleCreate = () => {
    if (!lobbyName.trim()) {
      alert('Введите название лобби');
      return;
    }

    if (bet > userCoins) {
      alert('Недостаточно монет!');
      return;
    }

    createLobby({
      gameId: gameId!,
      gameName: 'Game',
      name: lobbyName,
      betAmount: bet,
    });

    navigate(`/game/${gameId}/lobbies`);
  };

  const betPercent = ((bet - 10) / (1000 - 10)) * 100;

  return (
    <div className="relative min-h-full w-full min-w-0 overflow-x-hidden pb-32 text-white">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/16 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-fuchsia-500/16 blur-[90px]" />

      <div className="relative w-full px-4 pt-2">
        <button
          onClick={() => navigate(-1)}
          className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300 backdrop-blur-xl transition active:scale-95"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-5 w-full overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/14 via-violet-500/10 to-fuchsia-500/14" />
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

          <div className="relative">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-[22px] border border-white/10 bg-white/[0.08]">
              <Sword size={27} className="text-cyan-200" />
            </div>

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/55">
              <Sparkles size={13} />
              Online lobby
            </div>

            <h1 className="mt-2 text-[32px] font-black leading-none tracking-[-0.05em] text-white">
              Создать лобби
            </h1>

            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300/75">
              Настрой комнату, выбери ставку и жди соперника.
            </p>
          </div>
        </motion.section>

        <div className="w-full space-y-4">
          <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Название лобби
            </label>

            <input
              type="text"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder="Моя битва"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-base font-bold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60"
            />
          </div>

          <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Ставка
                </label>

                <div className="mt-1 flex items-center gap-2">
                  <Coins size={21} className="text-cyan-200" />
                  <span className="text-3xl font-black leading-none text-white">
                    {bet}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-right">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <Wallet size={13} />
                  Баланс
                </div>
                <p className="mt-1 text-sm font-black text-cyan-100">
                  {userCoins}
                </p>
              </div>
            </div>

            <div className="relative py-3">
              <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-black/30" />
              <div
                className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-300 via-blue-500 to-fuchsia-500"
                style={{ width: `${betPercent}%` }}
              />

              <input
                type="range"
                min={10}
                max={1000}
                step={10}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
                className="relative z-10 w-full cursor-pointer opacity-0"
              />
            </div>

            <div className="mt-1 flex justify-between text-xs font-black text-slate-500">
              <span>10</span>
              <span>1000</span>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCreate}
            className="w-full rounded-[24px] bg-gradient-to-r from-cyan-300 via-blue-500 to-fuchsia-500 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-[0_22px_55px_rgba(34,211,238,0.22)]"
          >
            Создать лобби
          </motion.button>
        </div>
      </div>
    </div>
  );
};