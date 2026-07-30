import { Crown, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type TurboStatus } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { getGameByCode } from '../../data/games';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ACTIVE_LOBBY_KEY,
  enterTurboRound,
  TURBO_SERIES_KEY,
} from './turboNavigation';

export const TurboSeriesController = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshBalance, refreshProfile } = useAuth();
  const { tr } = useLanguage();
  const [status, setStatus] = useState<TurboStatus | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const transitionLobbyRef = useRef('');
  const latestStatusRef = useRef<TurboStatus | null>(null);
  const seriesID = window.sessionStorage.getItem(TURBO_SERIES_KEY) || '';
  const transitionLobbyID =
    status?.status === 'playing' ? status.current_lobby?.id || '' : '';
  const transitionGameCode =
    status?.status === 'playing' ? status.current_game || '' : '';
  const transitionPath = transitionGameCode
    ? getGameByCode(transitionGameCode)?.playPath
    : undefined;
  const transitionRound = status?.status === 'playing' ? status.round : 0;

  useEffect(() => {
    latestStatusRef.current = status;
  }, [status]);

  const poll = useCallback(async () => {
    if (!seriesID) return;
    try {
      setStatus(await api.turbo.status());
    } catch {
      // Keep the current round playable and retry on the next tick.
    }
  }, [seriesID]);

  useEffect(() => {
    if (!seriesID) {
      setStatus(null);
      return;
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 700);
    return () => window.clearInterval(timer);
  }, [poll, seriesID]);

  useEffect(() => {
    const nextStatus = latestStatusRef.current;
    if (
      nextStatus?.status !== 'playing' ||
      !nextStatus.current_lobby ||
      !transitionLobbyID ||
      !transitionGameCode
    ) {
      return;
    }
    const isCurrentRound =
      transitionLobbyID === window.sessionStorage.getItem(ACTIVE_LOBBY_KEY) &&
      location.pathname === transitionPath;
    if (isCurrentRound || transitionLobbyRef.current === transitionLobbyID) return;

    transitionLobbyRef.current = transitionLobbyID;
    setTransitioning(true);
    const timer = window.setTimeout(() => {
      enterTurboRound(nextStatus, navigate);
      setTransitioning(false);
    }, 920);
    return () => window.clearTimeout(timer);
  }, [
    location.pathname,
    navigate,
    transitionGameCode,
    transitionLobbyID,
    transitionPath,
  ]);

  const wins = useMemo(() => {
    if (!user?.id || !status?.wins || !status.player_ids) return [0, 0];
    const opponent = status.player_ids.find((id) => id !== user.id);
    return [
      status.wins[String(user.id)] || 0,
      opponent ? status.wins[String(opponent)] || 0 : 0,
    ];
  }, [status?.player_ids, status?.wins, user?.id]);

  const finish = async () => {
    await Promise.allSettled([refreshBalance(), refreshProfile()]);
    window.sessionStorage.removeItem(TURBO_SERIES_KEY);
    window.sessionStorage.removeItem(ACTIVE_LOBBY_KEY);
    window.sessionStorage.removeItem('twingames_active_game');
    setStatus(null);
    navigate('/', { replace: true });
  };

  if (!seriesID || !status || status.status === 'idle' || status.status === 'searching') {
    return null;
  }

  const didWin =
    status.status === 'finished' &&
    Boolean(status.winner_user_id) &&
    status.winner_user_id === Number(user?.id);
  const currentTitle = status.current_game
    ? getGameByCode(status.current_game)?.displayName || status.current_game
    : '';

  return (
    <>
      {status.status === 'playing' && (
        <div className="turbo-series-hud" aria-label="Turbo series score">
          <span>Turbo · {tr('Round', 'Раунд')} {status.round}/3</span>
          <strong>{wins[0]} : {wins[1]}</strong>
        </div>
      )}

      {transitioning && (
        <div className="turbo-series-transition" role="status">
          <div className="turbo-transition-old-page" aria-hidden="true" />
          <div className="turbo-transition-new-page">
            <span>{tr('Next arena', 'Следующая арена')}</span>
            <strong>{currentTitle}</strong>
            <small>
              {tr('Round', 'Раунд')} {transitionRound}/3 · {wins[0]} : {wins[1]}
            </small>
          </div>
          <div className="turbo-transition-edge" aria-hidden="true" />
        </div>
      )}

      {status.status === 'finished' && (
        <div className="turbo-final-overlay" role="dialog" aria-modal="true">
          <div className="turbo-final-card">
            <div className={`turbo-final-icon ${didWin ? 'is-win' : ''}`}>
              {didWin ? <Crown size={30} /> : <Trophy size={28} />}
            </div>
            <span>Turbo · Best of 3</span>
            <h2>
              {status.draw
                ? tr('Series draw', 'Ничья в серии')
                : didWin
                  ? tr('Turbo victory', 'Победа в Turbo')
                  : tr('Series complete', 'Серия завершена')}
            </h2>
            <div className="turbo-final-score">{wins[0]} : {wins[1]}</div>
            <p>
              {status.draw
                ? tr('The stake has been returned.', 'Ставка возвращена.')
                : didWin
                  ? tr('The series prize has been credited to your balance.', 'Приз за серию зачислен на баланс.')
                  : tr('Return to the arena and try another series.', 'Возвращайся на арену и попробуй ещё одну серию.')}
            </p>
            <button type="button" onClick={() => void finish()}>
              {tr('Continue', 'Продолжить')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
