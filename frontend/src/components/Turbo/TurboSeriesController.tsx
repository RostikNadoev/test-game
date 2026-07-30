import { Crown, Loader2, Trophy } from 'lucide-react';
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
  const seriesID = window.sessionStorage.getItem(TURBO_SERIES_KEY) || '';

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
    if (status?.status !== 'playing' || !status.current_lobby || !status.current_game) {
      return;
    }
    const expectedPath = getGameByCode(status.current_game)?.playPath;
    const isCurrentRound =
      status.current_lobby.id === window.sessionStorage.getItem(ACTIVE_LOBBY_KEY) &&
      location.pathname === expectedPath;
    if (isCurrentRound || transitionLobbyRef.current === status.current_lobby.id) return;

    transitionLobbyRef.current = status.current_lobby.id;
    setTransitioning(true);
    const timer = window.setTimeout(() => {
      enterTurboRound(status, navigate);
      setTransitioning(false);
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [location.pathname, navigate, status]);

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
        <div className="turbo-series-transition">
          <Loader2 size={22} className="animate-spin" />
          <span>{tr('Next arena', 'Следующая арена')}</span>
          <strong>{currentTitle}</strong>
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
