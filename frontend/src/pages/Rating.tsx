import {
  Clock,
  Crown,
  Flame,
  Gift,
  Loader2,
  Lock,
  Medal,
  RefreshCw,
  Sparkles,
  Trophy,
  UsersRound,
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

const prizeTiers = [
  {
    place: '1',
    placeLabel: ['place', 'место'],
    tone: 'gold',
    Icon: Crown,
  },
  {
    place: '2',
    placeLabel: ['place', 'место'],
    tone: 'silver',
    Icon: Medal,
  },
  {
    place: '3',
    placeLabel: ['place', 'место'],
    tone: 'bronze',
    Icon: Medal,
  },
  {
    place: '4–10',
    placeLabel: ['places', 'места'],
    tone: 'violet',
    Icon: Trophy,
  },
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
    <main className="app-scroll elite-rating-page relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-3 text-white">
      <section className="elite-prize-banner elite-panel elite-enter">
        <div className="elite-prize-banner-glow" />
        <div className="elite-prize-orbit elite-prize-orbit-one" />
        <div className="elite-prize-orbit elite-prize-orbit-two" />

        <div className="elite-prize-head">
          <div className="min-w-0">
            <div className="elite-eyebrow elite-prize-eyebrow">
              <Gift size={11} />
              {tr('Season rewards', 'Сезонные награды')}
            </div>

            <h1 className="elite-prize-title">{tr('Rating prizes', 'Призы за рейтинг')}</h1>
            <p className="elite-prize-subtitle">
              {tr(
                'Climb the standings and claim rewards in game coins.',
                'Поднимайся в таблице и забирай награду в игровых монетах.',
              )}
            </p>
          </div>

          <div className="elite-prize-actions">
            <button
              type="button"
              onClick={() => void loadLeaderboard(true)}
              disabled={refreshing}
              className="pressable elite-icon-button"
              aria-label={tr('Refresh rating', 'Обновить рейтинг')}
            >
              <RefreshCw
                size={14}
                className={refreshing ? 'animate-spin' : ''}
              />
            </button>

            <div className="elite-prize-main-icon" aria-hidden="true">
              <Trophy size={24} />
              <Sparkles size={11} className="elite-prize-spark" />
            </div>
          </div>
        </div>

        <div className="elite-prize-countdown">
          <div className="elite-prize-countdown-copy">
            <div className="elite-prize-clock">
              <Clock size={15} />
            </div>
            <div>
              <span>{tr('Until rewards', 'До выдачи наград')}</span>
              <strong>{tr('Season finale', 'Финал сезона')}</strong>
            </div>
          </div>

          <div className="elite-prize-time" aria-label={tr('Until season end', 'До конца сезона')}>
            {prizeCountdown.map((item, index) => (
              <div className="elite-prize-time-item" key={item.label[0]}>
                <strong>{item.value}</strong>
                <span>{tr(item.label[0], item.label[1])}</span>
                {index < prizeCountdown.length - 1 && (
                  <i aria-hidden="true">:</i>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="elite-prize-grid">
          {prizeTiers.map(({ place, placeLabel, tone, Icon }) => (
            <article
              key={place}
              className={`elite-prize-tier is-${tone}`}
            >
              <div className="elite-prize-tier-shine" />

              <div className="elite-prize-tier-icon">
                <Icon
                  size={place === '1' ? 15 : 14}
                  className={place === '1' ? 'fill-current' : ''}
                />
              </div>

              <div className="elite-prize-place">
                <strong>{place}</strong>
                <span>{tr(placeLabel[0], placeLabel[1])}</span>
              </div>

              <div className="elite-prize-reward">
                <img
                  src={coinIcon}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
                <strong>???</strong>
              </div>

              <span className="elite-prize-currency">{tr('game coins', 'игровых монет')}</span>
            </article>
          ))}
        </div>

        <div className="elite-prize-note">
          <Lock size={11} />
          <span>{tr(
            'Reward amounts will be revealed closer to the season finale',
            'Размер наград откроется ближе к финалу сезона',
          )}</span>
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

      <section className="elite-your-rank elite-panel elite-enter elite-delay-3">
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
          <p className="elite-list-name">{tr('You', 'Вы')} · {yourName}</p>
          <p className="elite-list-meta">
            <UsersRound size={10} />
            {formatNumber(yourWins)} {tr('wins', 'побед')}
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
