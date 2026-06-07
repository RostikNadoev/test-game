import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
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
    <main className="app-scroll relative min-h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      <button
        onClick={() => navigate(-1)}
        className="press relative mb-3 inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[11px] font-black text-white/58"
      >
        <ChevronLeft size={16} />
        Назад
      </button>

      {/* hero */}
      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_40%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.11),transparent_42%)]" />

        <div className="relative grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles size={11} className="text-[#F2C766]" />
              Room setup
            </div>

            <h1 className="mt-3 text-[28px] font-black leading-[0.9] tracking-[-0.07em]">
              Создать
              <span className="block text-white/40">лобби</span>
            </h1>

            <p className="mt-2 max-w-[250px] text-[12px] font-medium leading-snug text-white/48">
              Настрой стол для {gameName}, выбери ставку и запускай дуэль.
            </p>
          </div>

          <div className="grid h-[64px] w-[64px] place-items-center rounded-[22px] border border-white/[0.1] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Sword size={28} className="text-[#F2C766]" />
          </div>
        </div>
      </section>

      <section className="relative mt-3 space-y-3">
        {/* name */}
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-3.5">
          <label className="mb-2.5 block text-[9px] font-black uppercase tracking-[0.2em] text-white/36">
            Название лобби
          </label>
          <input
            type="text"
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
            placeholder="Например: VIP Duel"
            className="w-full rounded-[16px] border border-white/[0.08] bg-black/25 px-3.5 py-3 text-[15px] font-black tracking-[-0.03em] text-white outline-none placeholder:text-white/22 focus:border-[#F2C766]/60"
          />
        </div>

        {/* bet */}
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-3.5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/36">
                Ставка
              </label>
              <div className="mt-1.5 flex items-end gap-1.5">
                <Coins size={20} className="mb-1 text-[#F2C766]" />
                <span className="text-[34px] font-black leading-none tracking-[-0.08em] tabular-nums">
                  {bet}
                </span>
              </div>
            </div>

            <div className="rounded-[16px] border border-white/[0.08] bg-black/25 px-3 py-2.5 text-right">
              <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/32">
                <Wallet size={12} />
                Баланс
              </div>
              <p className="mt-1 text-[15px] font-black tabular-nums text-[#52FFE5]">
                {userCoins}
              </p>
            </div>
          </div>

          <div className="relative py-3">
            <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/35" />
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#F2C766] via-[#52FFE5] to-[#9D7CFF]"
              style={{ width: `${betPercent}%` }}
            />
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              className="relative z-10 h-7 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="mt-0.5 flex justify-between text-[11px] font-black tabular-nums text-white/28">
            <span>10</span>
            <span>1000</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {presetBets.map((value) => (
              <button
                key={value}
                onClick={() => setBet(value)}
                className={[
                  'press rounded-[14px] border px-2 py-2.5 text-[12px] font-black tabular-nums',
                  bet === value
                    ? 'border-white bg-white text-[#08080C]'
                    : 'border-white/[0.08] bg-white/[0.05] text-white/48',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          className={[
            'press flex w-full items-center justify-center gap-2 rounded-[20px] py-3.5 text-[13px] font-black uppercase tracking-[0.14em] transition-colors',
            canCreate ? 'bg-white text-[#08080C]' : 'bg-white/[0.1] text-white/38',
          ].join(' ')}
        >
          Создать лобби
          <ArrowUpRight size={16} />
        </button>
      </section>
    </main>
  );
};
