import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  Gift,
  Link2,
  Loader2,
  Medal,
  RefreshCw,
  Sparkles,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { LeaderboardEntry, ReferralStatus } from '../api/types';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/LanguageContext';
import { getTelegramWebApp } from '../types/telegram';

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

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

export const Rating = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale).format(value);
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus | null>(null);
  const [isReferralLoading, setIsReferralLoading] = useState(false);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState<'success' | 'missing' | null>(null);
  const [copyToastKey, setCopyToastKey] = useState(0);
  const copyToastTimerRef = useRef<number | null>(null);

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

  useEffect(() => () => {
    if (copyToastTimerRef.current !== null) {
      window.clearTimeout(copyToastTimerRef.current);
    }
  }, []);

  const loadReferralStatus = useCallback(async () => {
    setIsReferralLoading(true);
    setReferralError(null);
    try {
      const response = await api.referrals.status();
      setReferralStatus(response);
    } catch (requestError) {
      setReferralError(
        requestError instanceof Error
          ? requestError.message
          : tr('Failed to load referral program', 'Не удалось загрузить реферальную программу'),
      );
    } finally {
      setIsReferralLoading(false);
    }
  }, [tr]);

  const openReferral = useCallback(() => {
    setIsReferralOpen(true);
    setSubscriptionMessage(null);
    void loadReferralStatus();
  }, [loadReferralStatus]);

  useEffect(() => {
    if (isAuthLoading || !user) return;
    if (window.sessionStorage.getItem('twingames_open_referral_modal') !== '1') return;
    window.sessionStorage.removeItem('twingames_open_referral_modal');
    openReferral();
  }, [isAuthLoading, openReferral, user]);

  const showCopiedToast = () => {
    if (copyToastTimerRef.current !== null) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    setCopyToastKey((current) => current + 1);
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToastKey(0);
      copyToastTimerRef.current = null;
    }, 1000);
  };

  const copyReferralLink = async () => {
    if (!referralStatus?.invite_url) return;
    try {
      await copyText(referralStatus.invite_url);
      getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.('success');
      showCopiedToast();
    } catch {
      setReferralError(tr('Failed to copy link', 'Не удалось скопировать ссылку'));
    }
  };

  const openChannel = () => {
    const url = referralStatus?.channel_url || 'https://t.me/tw1ngames';
    const telegram = getTelegramWebApp();
    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const checkSubscription = async () => {
    setIsCheckingSubscription(true);
    setReferralError(null);
    setSubscriptionMessage(null);
    try {
      const response = await api.referrals.check();
      setReferralStatus(response);
      setSubscriptionMessage(response.subscribed ? 'success' : 'missing');
      getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(
        response.subscribed ? 'success' : 'error',
      );
    } catch (requestError) {
      setReferralError(
        requestError instanceof Error
          ? requestError.message
          : tr('Failed to verify subscription', 'Не удалось проверить подписку'),
      );
    } finally {
      setIsCheckingSubscription(false);
    }
  };

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
    <>
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

        <button
          type="button"
          className="rating-referral-cta pressable"
          onClick={openReferral}
        >
          <span className="rating-referral-cta-icon" aria-hidden="true">
            <Gift size={18} />
          </span>
          <span className="rating-referral-cta-copy">
            <small>{tr('Referral program', 'Реферальная программа')}</small>
            <strong>{tr('+20 rating for every friend', '+20 рейтинга за каждого друга')}</strong>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>

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

        <div className="rating-luxe-prizes">
          <span>{tr('Prize places', 'Призовые места')}</span>
          <div aria-label={tr('Places with season prizes', 'Места с сезонными призами')}>
            {['1', '2', '3', '4–10'].map((place) => (
              <strong key={place}>{place}</strong>
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
    {isReferralOpen && createPortal(
      <div className="rating-referral-modal-root">
        <button
          type="button"
          className="rating-referral-backdrop"
          onClick={() => setIsReferralOpen(false)}
          aria-label={tr('Close referral program', 'Закрыть реферальную программу')}
        />
        <section
          className="rating-referral-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rating-referral-title"
        >
          <header className="rating-referral-modal-head">
            <div className="rating-referral-modal-mark" aria-hidden="true">
              <Gift size={21} />
            </div>
            <div>
              <span>{tr('Invite friends', 'Приглашай друзей')}</span>
              <h2 id="rating-referral-title">
                {tr('Earn rating together', 'Получай рейтинг вместе')}
              </h2>
            </div>
            <button
              type="button"
              className="rating-referral-close pressable"
              onClick={() => setIsReferralOpen(false)}
              aria-label={tr('Close', 'Закрыть')}
            >
              <X size={17} />
            </button>
          </header>

          {isReferralLoading && !referralStatus ? (
            <div className="rating-referral-loading">
              <Loader2 size={23} className="animate-spin" />
            </div>
          ) : referralStatus ? (
            <>
              <div className="rating-referral-reward-card">
                <div>
                  <span>{tr('Reward', 'Награда')}</span>
                  <strong>+{formatNumber(referralStatus.reward_rating)}</strong>
                  <small>{tr('rating for each friend', 'рейтинга за каждого друга')}</small>
                </div>
                <UsersRound size={42} aria-hidden="true" />
              </div>

              <div className="rating-referral-stats">
                <article>
                  <span>{tr('Invited', 'Приглашено')}</span>
                  <strong>{formatNumber(referralStatus.invited_count)}</strong>
                </article>
                <article>
                  <span>{tr('Rating earned', 'Получено рейтинга')}</span>
                  <strong>+{formatNumber(referralStatus.earned_rating)}</strong>
                </article>
              </div>

              <div className="rating-referral-steps">
                <article>
                  <span>1</span>
                  <div>
                    <strong>{tr('Friend opens your link', 'Друг открывает твою ссылку')}</strong>
                    <small>{tr('The invitation is saved on first launch', 'Приглашение закрепляется при первом запуске')}</small>
                  </div>
                </article>
                <article>
                  <span>2</span>
                  <div>
                    <strong>{tr('Subscribes to @tw1ngames', 'Подписывается на @tw1ngames')}</strong>
                    <small>{tr('The server verifies the subscription', 'Сервер проверяет подписку')}</small>
                  </div>
                </article>
              </div>

              <div className="rating-referral-link-box">
                <Link2 size={15} aria-hidden="true" />
                <span>{referralStatus.invite_url}</span>
              </div>

              <button
                type="button"
                className="rating-referral-copy pressable"
                onClick={() => void copyReferralLink()}
              >
                <Copy size={16} />
                {tr('Copy referral link', 'Скопировать реферальную ссылку')}
              </button>

              <button
                type="button"
                className="rating-referral-channel pressable"
                onClick={openChannel}
              >
                <ExternalLink size={15} />
                {tr('Open @tw1ngames channel', 'Открыть канал @tw1ngames')}
              </button>

              {referralStatus.incoming_pending && (
                <div className="rating-referral-activation">
                  <div>
                    <strong>{tr('Activate your invitation', 'Активируй своё приглашение')}</strong>
                    <span>{tr('Subscribe to the channel, then run the check.', 'Подпишись на канал, затем запусти проверку.')}</span>
                  </div>
                  <button
                    type="button"
                    className="pressable"
                    disabled={isCheckingSubscription}
                    onClick={() => void checkSubscription()}
                  >
                    {isCheckingSubscription ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {tr('Check subscription', 'Проверить подписку')}
                  </button>
                </div>
              )}

              {referralStatus.incoming_rewarded && (
                <div className="rating-referral-result is-success">
                  <CheckCircle2 size={16} />
                  {tr('Your invitation is already activated.', 'Твоё приглашение уже активировано.')}
                </div>
              )}

              {subscriptionMessage === 'success' && (
                <div className="rating-referral-result is-success">
                  <CheckCircle2 size={16} />
                  {tr('Subscription confirmed. The rating has been awarded.', 'Подписка подтверждена. Рейтинг начислен.')}
                </div>
              )}
              {subscriptionMessage === 'missing' && (
                <div className="rating-referral-result is-missing">
                  {tr('Subscription not found yet. Subscribe and try again.', 'Подписка пока не найдена. Подпишись и повтори проверку.')}
                </div>
              )}
            </>
          ) : null}

          {referralError && (
            <div className="rating-referral-error">{localize(referralError)}</div>
          )}
        </section>
      </div>,
      document.body,
    )}

    {copyToastKey > 0 && createPortal(
      <div key={copyToastKey} className="rating-referral-copy-toast" role="status">
        <CheckCircle2 size={17} />
        {tr('Link copied', 'Ссылка скопирована')}
      </div>,
      document.body,
    )}
    </>
  );
};
