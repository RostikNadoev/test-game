import {
  Crown,
  Flame,
  Loader2,
  Medal,
  RefreshCw,
  Sparkles,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { LeaderboardEntry } from '../api/types';
import { useAuth } from '../auth/useAuth';

const podiumOrder = [1, 0, 2];
const podiumTone = ['gold', 'blue', 'orange'];

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU').format(value);

const displayName = (player: LeaderboardEntry) =>
  player.tg_user?.replace(/^@/, '') || `Player #${player.id}`;

const avatarLabel = (player: LeaderboardEntry) =>
  displayName(player).charAt(0).toUpperCase();

export const Rating = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.leaderboard.list(50);
      setPlayers(response.players ?? []);
      setError(null);
    } catch (requestError) {
      setPlayers([]);
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить рейтинг');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard(false);
  }, [loadLeaderboard]);

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);
  const yourName = user?.tg_user || 'Игрок';
  const yourRating = user?.stats?.rating ?? 0;
  const yourWins = user?.stats?.wins ?? 0;
  const yourRank = useMemo(() => {
    if (!user?.id) return null;
    const index = players.findIndex((player) => player.id === user.id);
    return index >= 0 ? index + 1 : null;
  }, [players, user?.id]);

  return (
    <main className="app-scroll elite-rating-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
      <section className="elite-rating-hero elite-panel elite-enter">
        <div className="elite-rating-hero-glow" />

        <div className="elite-rating-top">
          <div className="min-w-0">
            <div className="elite-eyebrow">
              <Trophy size={11} />
              Global leaderboard
            </div>
            <h1 className="elite-rating-title">Рейтинг игроков</h1>
            <p className="elite-rating-subtitle">
              Лучшие дуэлянты по рейтингу и победам.
            </p>
          </div>

          <div className="elite-rating-actions">
            <button
              type="button"
              onClick={() => void loadLeaderboard(true)}
              disabled={refreshing}
              className="pressable elite-icon-button"
              aria-label="Обновить рейтинг"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <div className="elite-rating-crown">
              <Crown size={25} className="fill-current" />
            </div>
          </div>
        </div>

        <div className="elite-rating-metrics">
          <article>
            <UsersRound size={14} />
            <strong>{formatNumber(players.length)}</strong>
            <span>Игроков</span>
          </article>
          <article className="is-blue">
            <Medal size={14} />
            <strong>{formatNumber(players[0]?.rating ?? 0)}</strong>
            <span>Топ рейтинг</span>
          </article>
          <article className="is-orange">
            <Flame size={14} />
            <strong>{formatNumber(players[0]?.wins ?? 0)}</strong>
            <span>Топ побед</span>
          </article>
        </div>
      </section>

      {loading ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1">
          <div className="elite-state-icon">
            <Loader2 size={20} className="animate-spin" />
          </div>
          <p>Загружаю рейтинг</p>
        </section>
      ) : error ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1 is-error">
          <div className="elite-state-icon">
            <RefreshCw size={20} />
          </div>
          <h2>Не удалось загрузить рейтинг</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadLeaderboard(false)} className="pressable elite-retry-button">
            Повторить
          </button>
        </section>
      ) : players.length === 0 ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1">
          <div className="elite-state-icon">
            <Trophy size={20} />
          </div>
          <h2>Таблица пока пустая</h2>
          <p>Сыграй первый матч и займи место в рейтинге.</p>
        </section>
      ) : (
        <>
          <section className="elite-podium elite-enter elite-delay-1">
            {podiumOrder.map((playerIndex, visualIndex) => {
              const player = top3[playerIndex];
              if (!player) return null;

              const place = playerIndex + 1;
              const isFirst = place === 1;
              const isYou = player.id === user?.id;

              return (
                <article
                  key={player.id}
                  className={`elite-podium-card is-${podiumTone[playerIndex]} ${isFirst ? 'is-first' : ''} ${isYou ? 'is-you' : ''}`}
                  style={{ animationDelay: `${visualIndex * 55}ms` }}
                >
                  <div className="elite-podium-light" />
                  {isFirst && (
                    <div className="elite-podium-crown">
                      <Crown size={15} className="fill-current" />
                    </div>
                  )}

                  <div className="elite-podium-avatar">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      avatarLabel(player)
                    )}
                  </div>

                  <div className="elite-podium-place">{place}</div>
                  <p className="elite-podium-name">{displayName(player)}</p>
                  <strong className="elite-podium-score">{formatNumber(player.rating)}</strong>
                  <span className="elite-podium-wins">{formatNumber(player.wins)} побед</span>
                  {isYou && <div className="elite-you-chip">Вы</div>}
                </article>
              );
            })}
          </section>

          <section className="elite-leaderboard elite-enter elite-delay-2">
            <div className="elite-section-heading">
              <div>
                <p className="elite-section-kicker">Standings</p>
                <h2>Таблица</h2>
              </div>
              <div className="elite-section-icon">
                <Medal size={16} />
              </div>
            </div>

            <div className="elite-leaderboard-list elite-panel">
              {rest.map((player, index) => {
                const rank = index + 4;
                const isYou = player.id === user?.id;

                return (
                  <article
                    key={player.id}
                    className={`elite-leaderboard-row ${isYou ? 'is-you' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <div className="elite-rank-number">{rank}</div>
                    <div className="elite-list-avatar">
                      {player.photo_url ? (
                        <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        avatarLabel(player)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="elite-list-name">{displayName(player)}</p>
                      <p className="elite-list-meta">
                        <Flame size={10} />
                        {formatNumber(player.wins)} побед
                      </p>
                    </div>
                    <div className="elite-list-score">
                      <strong>{formatNumber(player.rating)}</strong>
                      <span>rating</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="elite-your-rank elite-panel elite-enter elite-delay-3">
        <div className="elite-rank-number is-you">{yourRank ?? '—'}</div>
        <div className="elite-list-avatar is-you">
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Sparkles size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="elite-list-name">Вы · {yourName}</p>
          <p className="elite-list-meta">
            <UsersRound size={10} />
            {formatNumber(yourWins)} побед
          </p>
        </div>
        <div className="elite-list-score is-you">
          <strong>{formatNumber(yourRating)}</strong>
          <span>rating</span>
        </div>
      </section>
    </main>
  );
};
