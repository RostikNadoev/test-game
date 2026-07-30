import {
  Clock,
  Crown,
  Flame,
  Loader2,
  Medal,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { LeaderboardEntry } from '../api/types';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/LanguageContext';

const podiumOrder = [1, 0, 2];
const podiumTone = ['gold', 'blue', 'orange'];

const prizeCountdown = [
  { value: '12', label: ['days', 'дней'] },
  { value: '08', label: ['hours', 'часов'] },
  { value: '34', label: ['minutes', 'минут'] },
] as const;

const displayName = (player: LeaderboardEntry) =>
  player.tg_user?.replace(/^@/, '') || `Player #${player.id}`;

const avatarLabel = (player: LeaderboardEntry) =>
  displayName(player).charAt(0).toUpperCase();

export const Rating = () => {
  const { user } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale).format(value);
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
      setError(
        requestError instanceof Error
          ? requestError.message
          : tr('Failed to load rating', 'Не удалось загрузить рейтинг'),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tr]);

  useEffect(() => {
    void loadLeaderboard(false);
  }, [loadLeaderboard]);

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);
  const yourName = user?.tg_user || tr('Player', 'Игрок');
  const yourRating = user?.stats?.rating ?? 0;
  const yourWins = user?.stats?.wins ?? 0;
  const yourRank = useMemo(() => {
    if (!user?.id) return null;
    const index = players.findIndex((player) => player.id === user.id);
    return index >= 0 ? index + 1 : null;
  }, [players, user?.id]);

  return (
    <main className="app-scroll elite-rating-page rating-luxe-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
      <section className="rating-luxe-banner elite-enter">
        <div className="rating-luxe-accent" />

        <div className="rating-luxe-head">
          <div className="rating-luxe-identity">
            <div className="rating-luxe-mark" aria-hidden="true">
              <Trophy size={20} />
            </div>
            <div>
              <p>{tr('Season leaderboard', 'Сезонный рейтинг')}</p>
              <h1>{tr('Rating', 'Рейтинг')}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadLeaderboard(true)}
            disabled={refreshing}
            className="pressable rating-luxe-refresh"
            aria-label={tr('Refresh rating', 'Обновить рейтинг')}
          >
            <RefreshCw
              size={14}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>

        <p className="rating-luxe-copy">
          {tr(
            'Every match moves you through the season standings.',
            'Каждый матч двигает тебя вверх по сезонной таблице.',
          )}
        </p>

        <div className="rating-luxe-season">
          <div className="rating-luxe-season-copy">
            <span>Season 01</span>
            <strong>{tr('Top 10 receive rewards', 'Награды получат топ-10')}</strong>
          </div>

          <div className="rating-luxe-countdown" aria-label={tr('Until season end', 'До конца сезона')}>
            <Clock size={13} />
            {prizeCountdown.map((item) => (
              <div key={item.label[0]}>
                <strong>{item.value}</strong>
                <span>{tr(item.label[0], item.label[1])}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rating-luxe-reward">
          <div>
            <img src={coinIcon} alt="" draggable={false} />
            <span>{tr('Season reward pool', 'Призовой фонд сезона')}</span>
          </div>
          <strong>{tr('Revealed soon', 'Скоро откроется')}</strong>
        </div>
      </section>

      <section className="elite-your-rank rating-luxe-your-rank elite-panel elite-enter elite-delay-1">
        <div className="elite-rank-number is-you">{yourRank ?? '—'}</div>
        <div className="elite-list-avatar is-you">
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Sparkles size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="elite-list-name">{tr('Your position', 'Твоя позиция')}</p>
          <p className="elite-list-meta">
            {yourName} · {formatNumber(yourWins)} {tr('wins', 'побед')}
          </p>
        </div>
        <div className="elite-list-score is-you">
          <strong>{formatNumber(yourRating)}</strong>
          <span>rating</span>
        </div>
      </section>

      {loading ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1">
          <div className="elite-state-icon">
            <Loader2 size={20} className="animate-spin" />
          </div>
          <p>{tr('Loading rating', 'Загружаю рейтинг')}</p>
        </section>
      ) : error ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1 is-error">
          <div className="elite-state-icon">
            <RefreshCw size={20} />
          </div>
          <h2>{tr('Failed to load rating', 'Не удалось загрузить рейтинг')}</h2>
          <p>{localize(error)}</p>
          <button
            type="button"
            onClick={() => void loadLeaderboard(false)}
            className="pressable elite-retry-button"
          >
            {tr('Try again', 'Повторить')}
          </button>
        </section>
      ) : players.length === 0 ? (
        <section className="elite-state-card elite-panel elite-enter elite-delay-1">
          <div className="elite-state-icon">
            <Trophy size={20} />
          </div>
          <h2>{tr('The standings are empty', 'Таблица пока пустая')}</h2>
          <p>{tr('Play your first match and enter the standings.', 'Сыграй первый матч и займи место в рейтинге.')}</p>
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
                      <img
                        src={player.photo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      avatarLabel(player)
                    )}
                  </div>

                  <div className="elite-podium-place">{place}</div>
                  <p className="elite-podium-name">{displayName(player)}</p>
                  <strong className="elite-podium-score">
                    {formatNumber(player.rating)}
                  </strong>
                  <span className="elite-podium-wins">
                    {formatNumber(player.wins)} {tr('wins', 'побед')}
                  </span>
                  {isYou && <div className="elite-you-chip">{tr('You', 'Вы')}</div>}
                </article>
              );
            })}
          </section>

          <section className="elite-leaderboard elite-enter elite-delay-2">
            <div className="elite-section-heading">
              <div>
                <p className="elite-section-kicker">{tr('Standings', 'Рейтинг')}</p>
                <h2>{tr('Leaderboard', 'Таблица')}</h2>
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
                    style={{
                      animationDelay: `${Math.min(index, 8) * 30}ms`,
                    }}
                  >
                    <div className="elite-rank-number">{rank}</div>
                    <div className="elite-list-avatar">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        avatarLabel(player)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="elite-list-name">{displayName(player)}</p>
                      <p className="elite-list-meta">
                        <Flame size={10} />
                        {formatNumber(player.wins)} {tr('wins', 'побед')}
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

    </main>
  );
};
