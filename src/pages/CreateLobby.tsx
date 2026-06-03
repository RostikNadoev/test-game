import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronLeft,
  Coins,
  Sparkles,
  Sword,
  Wallet,
} from 'lucide-react';

const gameNames: Record<string, string> = {
  virusmarket: 'Virus Market',
  hexfall: 'Hex Fall',
  rps: 'RPS Duel',
  tictactoe: 'Tic Tac Toe Duel',
  gridlock: 'Grid Lock',
  blackjack: 'Blackjack Duel',
  diceduel: 'Dice Duel',
  neonmatrix: 'Neon Matrix',
  slingclash: 'Sling Clash',
  icebump: 'Ice Bump',
  archer: 'Neon Duel',
  race: 'Street Race',
  airhockey: 'Air Hockey',
  pingpong: 'Golf',
  darts: 'Darts',
};

const presetBets = [50, 100, 250, 500];

export const CreateLobby = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const createLobby = useStore((state) => state.createLobby);
  const userCoins = useStore((state) => state.user.coins);

  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);

  const gameName = gameNames[gameId || ''] || 'Game';
  const betPercent = ((bet - 10) / (1000 - 10)) * 100;
  const canCreate = lobbyName.trim().length > 0 && bet <= userCoins;

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
      gameName,
      name: lobbyName,
      betAmount: bet,
    });

    navigate(`/game/${gameId}/lobbies`);
  };

  return (
    <main className="app-scroll relative min-h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-32 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 premium-grid opacity-[0.22]" />
      <div className="pointer-events-none absolute -left-28 top-8 h-72 w-72 rounded-full bg-[#F2C766]/12 blur-[95px]" />
      <div className="pointer-events-none absolute -right-28 top-44 h-80 w-80 rounded-full bg-[#52FFE5]/10 blur-[110px]" />

      <button
        onClick={() => navigate(-1)}
        className="relative mb-4 inline-flex h-12 items-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.055] px-3.5 text-xs font-black text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition hover:bg-white/[0.08] active:scale-95"
      >
        <ChevronLeft size={17} />
        Назад
      </button>

      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C]/84 p-5 shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(242,199,102,0.18),transparent_34%),radial-gradient(circle_at_95%_24%,rgba(82,255,229,0.13),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.09),transparent_46%)]" />
        <div className="pointer-events-none absolute -right-10 top-8 h-40 w-40 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 top-24 h-20 w-20 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className="relative grid grid-cols-[1fr_auto] items-start gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/24 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-white/48">
              <Sparkles size={12} className="text-[#F2C766]" />
              Room setup
            </div>

            <h1 className="mt-4 text-[38px] font-black leading-[0.88] tracking-[-0.09em] text-white">
              Создать
              <span className="block text-white/44">лобби</span>
            </h1>

            <p className="mt-3 max-w-[270px] text-[13px] font-medium leading-relaxed text-white/48">
              Настрой приватный стол для {gameName}, выбери ставку и запускай дуэль.
            </p>
          </div>

          <div className="relative grid h-[92px] w-[76px] place-items-center rounded-[28px] border border-white/[0.1] bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="absolute -right-3 -top-3 h-9 w-9 rounded-full border border-white/10" />
            <Sword size={34} className="text-[#F2C766]" />
          </div>
        </div>
      </motion.section>

      <section className="relative mt-4 space-y-4">
        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(242,199,102,0.1),transparent_34%)]" />

          <label className="relative mb-3 block text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
            Название лобби
          </label>

          <input
            type="text"
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
            placeholder="Например: VIP Duel"
            className="relative w-full rounded-[24px] border border-white/[0.08] bg-black/24 px-4 py-4 text-base font-black tracking-[-0.03em] text-white outline-none placeholder:text-white/22 focus:border-[#F2C766]/60"
          />
        </div>

        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(82,255,229,0.11),transparent_34%)]" />

          <div className="relative mb-5 flex items-start justify-between gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.24em] text-white/36">
                Ставка
              </label>

              <div className="mt-2 flex items-end gap-2">
                <Coins size={24} className="mb-1 text-[#F2C766]" />
                <span className="text-[42px] font-black leading-none tracking-[-0.09em] text-white">
                  {bet}
                </span>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.08] bg-black/22 px-3.5 py-3 text-right">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white/32">
                <Wallet size={13} />
                Баланс
              </div>
              <p className="mt-1 text-base font-black text-[#52FFE5]">
                {userCoins}
              </p>
            </div>
          </div>

          <div className="relative py-4">
            <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-black/30" />
            <div
              className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#F2C766] via-[#52FFE5] to-[#9D7CFF] shadow-[0_0_24px_rgba(82,255,229,0.2)]"
              style={{ width: `${betPercent}%` }}
            />

            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              className="relative z-10 h-8 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="mt-1 flex justify-between text-xs font-black text-white/28">
            <span>10</span>
            <span>1000</span>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {presetBets.map((value) => (
              <button
                key={value}
                onClick={() => setBet(value)}
                className={[
                  'rounded-[18px] border px-2 py-3 text-xs font-black transition active:scale-95',
                  bet === value
                    ? 'border-white bg-white text-[#08080C]'
                    : 'border-white/[0.08] bg-white/[0.055] text-white/48 hover:bg-white/[0.08]',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleCreate}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-[28px] py-4 text-sm font-black uppercase tracking-[0.16em] shadow-[0_22px_55px_rgba(255,255,255,0.12)] transition',
            canCreate
              ? 'bg-white text-[#08080C]'
              : 'bg-white/[0.12] text-white/38',
          ].join(' ')}
        >
          Создать лобби
          <ArrowUpRight size={18} />
        </motion.button>
      </section>
    </main>
  );
};