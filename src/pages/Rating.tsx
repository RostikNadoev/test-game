import { type CSSProperties } from 'react';
import { Crown, Flame, Medal, Sparkles, Trophy, UsersRound } from 'lucide-react';

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

const podiumAccent = ['#FFC96A', '#7BC7FF', '#FF955C'];
const podiumOrder = [1, 0, 2];

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);

export const Rating = () => {
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <main className="app-scroll page-shell rating-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
      <div className="page-ambient" />

      <section className="premium-hero rating-hero page-reveal">
        <div className="premium-hero-bg" />

        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="hero-eyebrow">
              <Trophy size={12} />
              Leaderboard
            </div>

            <h1 className="hero-title mt-3">
              Рейтинг
              <span>игроков</span>
            </h1>

            <p className="hero-muted mt-2 max-w-[220px]">
              Лучшие игроки клуба по рейтингу, победам и стабильности.
            </p>
          </div>

          <div className="hero-icon-orb rating-orb">
            <Crown size={28} className="fill-[#FFC96A] text-[#FFC96A]" />
          </div>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
          <div className="hero-micro-card">
            <p>{players.length}</p>
            <span>Players</span>
          </div>

          <div className="hero-micro-card is-blue">
            <p>{formatNumber(players[0]?.rating ?? 0)}</p>
            <span>Top rating</span>
          </div>

          <div className="hero-micro-card is-orange">
            <p>{players[0]?.wins ?? 0}</p>
            <span>Top wins</span>
          </div>
        </div>
      </section>

      <section
        className="rating-podium-grid page-reveal"
        style={{ animationDelay: '60ms' }}
      >
        {podiumOrder.map((idx, placeIndex) => {
          const player = top3[idx];
          const accent = podiumAccent[idx];
          const isFirst = idx === 0;

          return (
            <div
              key={player.name}
              className={`podium-card ${isFirst ? 'is-first' : ''}`}
              style={
                {
                  '--accent': accent,
                  '--podium-delay': `${placeIndex * 70}ms`,
                } as CSSProperties
              }
            >
              <div className="podium-glow" />

              {isFirst && (
                <div className="podium-crown">
                  <Crown size={15} className="fill-current" />
                </div>
              )}

              <div className="podium-avatar">
                {player.name.charAt(0)}
              </div>

              <div className="podium-rank-badge">
                {idx + 1}
              </div>

              <p className="podium-name">
                {player.name}
              </p>

              <p className="podium-rating">
                {formatNumber(player.rating)}
              </p>

              <p className="podium-wins">
                {player.wins} wins
              </p>
            </div>
          );
        })}
      </section>

      <section
        className="leaderboard-section page-reveal"
        style={{ animationDelay: '120ms' }}
      >
        <div className="section-heading mb-2.5">
          <div>
            <p className="section-kicker section-kicker-blue">
              Standings
            </p>
            <h2 className="section-title">
              Таблица
            </h2>
          </div>

          <div className="section-icon-pill">
            <Medal size={15} />
          </div>
        </div>

        <div className="leaderboard-card">
          {rest.map((player, index) => {
            const rank = index + 4;

            return (
              <div
                key={player.name}
                className="leaderboard-row"
                style={
                  {
                    '--row-delay': `${Math.min(index * 35, 220)}ms`,
                  } as CSSProperties
                }
              >
                <div className="rank-chip">
                  {rank}
                </div>

                <div className="player-avatar">
                  {player.name.charAt(0)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="player-name">
                    {player.name}
                  </p>

                  <p className="player-meta">
                    <Flame size={10} />
                    {player.wins} побед
                  </p>
                </div>

                <div className="leaderboard-score">
                  <p>{formatNumber(player.rating)}</p>
                  <span>rating</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="your-rank-card">
          <div className="rank-chip is-you">
            14
          </div>

          <div className="you-avatar">
            <Sparkles size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="player-name">
              Вы · Игрок
            </p>

            <p className="player-meta">
              <UsersRound size={10} />
              42 победы
            </p>
          </div>

          <div className="leaderboard-score is-you">
            <p>1 250</p>
            <span>rating</span>
          </div>
        </div>
      </section>
    </main>
  );
};