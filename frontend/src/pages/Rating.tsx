import { Crown, Flame, Medal, Sparkles, Trophy, UsersRound } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
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

const podiumAccentClass = ['podium-accent-gold', 'podium-accent-blue', 'podium-accent-orange'];
const podiumOrder = [1, 0, 2];
const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);

export const Rating = () => {
  const { user } = useAuth();
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);
  const yourName = user?.tg_user || 'Игрок';
  const yourRating = user?.stats?.rating ?? 0;
  const yourWins = user?.stats?.wins ?? 0;

  return (
    <main className="app-scroll page-shell rating-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-3 text-white">
      <section className="rating-head minimal-panel page-reveal">
        <div className="rating-head-glow" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="profile-kicker"><Trophy size={11} />Leaderboard</div>
            <h1 className="rating-title">Рейтинг игроков</h1>
            <p className="rating-subtitle">Минималистичная таблица лучших дуэлянтов клуба.</p>
          </div>
          <div className="rating-crown-orb"><Crown size={26} className="fill-current" /></div>
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
          <div className="hero-micro-card"><p>{players.length}</p><span>Players</span></div>
          <div className="hero-micro-card is-blue"><p>{formatNumber(players[0]?.rating ?? 0)}</p><span>Top rating</span></div>
          <div className="hero-micro-card is-orange"><p>{players[0]?.wins ?? 0}</p><span>Top wins</span></div>
        </div>
      </section>

      <section className="rating-podium-grid page-reveal">
        {podiumOrder.map((idx, placeIndex) => {
          const player = top3[idx];
          const isFirst = idx === 0;
          return (
            <div
              key={player.name}
              className={`podium-card ${podiumAccentClass[idx]} podium-delay-${placeIndex} ${isFirst ? 'is-first' : ''}`}
            >              {isFirst && <div className="podium-crown"><Crown size={14} className="fill-current" /></div>}
              <div className="podium-avatar">{player.name.charAt(0)}</div>
              <div className="podium-rank-badge">{idx + 1}</div>
              <p className="podium-name">{player.name}</p>
              <p className="podium-rating">{formatNumber(player.rating)}</p>
              <p className="podium-wins">{player.wins} wins</p>
            </div>
          );
        })}
      </section>

      <section className="leaderboard-section page-reveal">        <div className="minimal-section-head">
          <div><p className="minimal-kicker">Standings</p><h2>Таблица</h2></div>
          <div className="minimal-head-icon"><Medal size={15} /></div>
        </div>
        <p className="mb-3 text-[11px] font-medium leading-snug text-white/42">
          Топ — демо, ваши stats — из профиля.
        </p>
        <div className="leaderboard-card minimal-panel">
          {rest.map((player, index) => {
            const rank = index + 4;
            return (
              <div key={player.name} className="leaderboard-row">                <div className="rank-chip">{rank}</div>
                <div className="player-avatar">{player.name.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <p className="player-name">{player.name}</p>
                  <p className="player-meta"><Flame size={10} />{player.wins} побед</p>
                </div>
                <div className="leaderboard-score"><p>{formatNumber(player.rating)}</p><span>rating</span></div>
              </div>
            );
          })}
        </div>
        <div className="your-rank-card minimal-panel">
          <div className="rank-chip is-you">—</div>
          <div className="you-avatar"><Sparkles size={17} /></div>
          <div className="min-w-0 flex-1">
            <p className="player-name">Вы · {yourName}</p>
            <p className="player-meta"><UsersRound size={10} />{formatNumber(yourWins)} побед</p>
          </div>
          <div className="leaderboard-score is-you"><p>{formatNumber(yourRating)}</p><span>rating</span></div>
        </div>
      </section>
    </main>
  );
};
