import { Crown, Flame, Trophy } from 'lucide-react';

type Player = {
  name: string;
  rating: number;
  wins: number;
};

const players: Player[] = [
  { name: 'AlexPro', rating: 2450, wins: 120 },
  { name: 'TankMaster', rating: 2380, wins: 115 },
  { name: 'Shadow', rating: 2310, wins: 108 },
  { name: 'NeonKing', rating: 2190, wins: 97 },
  { name: 'Vortex', rating: 2040, wins: 89 },
  { name: 'Blaze', rating: 1980, wins: 84 },
  { name: 'Ghost', rating: 1875, wins: 78 },
  { name: 'Riptide', rating: 1790, wins: 71 },
];

const podiumAccent = ['#F2C766', '#9FB4C8', '#E08B57'];
const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);

export const Rating = () => {
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      {/* hero */}
      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.18),transparent_42%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.11),transparent_42%)]" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Trophy size={11} className="text-[#F2C766]" />
              Leaderboard
            </div>
            <h1 className="mt-3 text-[28px] font-black leading-[0.9] tracking-[-0.07em]">
              Рейтинг
              <span className="block text-white/40">игроков</span>
            </h1>
            <p className="mt-2 max-w-[210px] text-[12px] font-medium leading-snug text-white/48">
              Лучшие дуэлянты клуба по очкам рейтинга.
            </p>
          </div>

          <div className="grid h-[64px] w-[64px] place-items-center rounded-[22px] border border-white/[0.1] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Crown size={28} className="fill-[#F2C766] text-[#F2C766]" />
          </div>
        </div>
      </section>

      {/* podium */}
      <section
        className="reveal relative mt-3 grid grid-cols-3 items-end gap-2"
        style={{ animationDelay: '50ms' }}
      >
        {podiumOrder.map((idx) => {
          const player = top3[idx];
          const accent = podiumAccent[idx];
          const isFirst = idx === 0;

          return (
            <div
              key={player.name}
              className={[
                'relative overflow-hidden rounded-[20px] border bg-white/[0.04] px-2 pb-3 text-center',
                isFirst
                  ? 'border-[#F2C766]/25 pt-5'
                  : 'border-white/[0.08] pt-4',
              ].join(' ')}
              style={
                isFirst
                  ? { background: 'rgba(242,199,102,0.08)' }
                  : undefined
              }
            >
              {isFirst && (
                <Crown
                  size={16}
                  className="absolute left-1/2 top-1.5 -translate-x-1/2 fill-[#F2C766] text-[#F2C766]"
                />
              )}

              <div className="relative mx-auto grid place-items-center">
                <div
                  className="grid place-items-center rounded-[16px] border border-white/[0.1] bg-black/25 font-black"
                  style={{
                    height: isFirst ? 56 : 46,
                    width: isFirst ? 56 : 46,
                    fontSize: isFirst ? 22 : 18,
                    color: accent,
                  }}
                >
                  {player.name.charAt(0)}
                </div>
              </div>

              <p
                className="mx-auto mt-2 grid h-5 w-5 place-items-center rounded-full text-[10px] font-black tabular-nums text-[#08080C]"
                style={{ background: accent }}
              >
                {idx + 1}
              </p>

              <p className="mt-1.5 truncate text-[12px] font-black tracking-[-0.03em]">
                {player.name}
              </p>
              <p
                className="mt-0.5 text-[14px] font-black tabular-nums"
                style={{ color: accent }}
              >
                {formatNumber(player.rating)}
              </p>
            </div>
          );
        })}
      </section>

      {/* list */}
      <section className="relative mt-3 space-y-1.5">
        <div className="mb-1">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/32">
            <Flame size={12} />
            Standings
          </div>
          <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
            Таблица
          </h2>
        </div>

        {rest.map((player, index) => {
          const rank = index + 4;
          return (
            <div
              key={player.name}
              className="reveal flex items-center gap-2.5 rounded-[18px] border border-white/[0.07] bg-white/[0.04] px-3 py-2.5"
              style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/[0.07] bg-black/25 text-[13px] font-black tabular-nums text-white/45">
                {rank}
              </div>

              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white/[0.06] text-[15px] font-black text-white/70">
                {player.name.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black tracking-[-0.03em]">
                  {player.name}
                </p>
                <p className="text-[10px] font-bold tabular-nums text-white/40">
                  {player.wins} побед
                </p>
              </div>

              <div className="text-right">
                <p className="text-[15px] font-black tabular-nums text-[#52FFE5]">
                  {formatNumber(player.rating)}
                </p>
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/34">
                  Рейтинг
                </p>
              </div>
            </div>
          );
        })}

        {/* fun footer: user position */}
        <div className="mt-2 flex items-center gap-2.5 rounded-[18px] border border-[#F2C766]/20 bg-[#F2C766]/[0.08] px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/[0.08] bg-black/25 text-[13px] font-black tabular-nums text-[#F2C766]">
            14
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[#F2C766]/30 to-[#52FFE5]/18 text-xl">
            🎮
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-black tracking-[-0.03em]">
              Вы · Игрок
            </p>
            <p className="text-[10px] font-bold tabular-nums text-white/45">
              42 победы
            </p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-black tabular-nums text-[#F2C766]">
              1 250
            </p>
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/40">
              Рейтинг
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};
