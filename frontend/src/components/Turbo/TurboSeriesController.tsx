import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type LobbyPlayerInfo, type TurboStatus } from '../../api';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';
import { useAuth } from '../../auth/useAuth';
import { getGameByCode } from '../../data/games';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ACTIVE_LOBBY_KEY,
  enterTurboRound,
  TURBO_SERIES_KEY,
} from './turboNavigation';

const ROUND_TRANSITION_NAVIGATE_MS = 2100;
const ROUND_TRANSITION_TOTAL_MS = 3600;
const ROUND_RESULT_HOLD_MS = 5000;
const FINAL_DETAILS_REVEAL_MS = 2100;

type TransitionTheme = {
  background: string;
  glow: string;
  accent: string;
  ink: string;
};

type ResultHold =
  | { kind: 'round'; round: number }
  | { kind: 'final' };

const DEFAULT_TRANSITION_THEME: TransitionTheme = {
  background: '#0b0c13',
  glow: '#9d7cff',
  accent: '#52ffe5',
  ink: '#ffffff',
};

const FINAL_TRANSITION_THEME: TransitionTheme = {
  background: '#0d0f16',
  glow: '#5bb7ff',
  accent: '#ffb45c',
  ink: '#ffffff',
};

const TRANSITION_THEMES: Record<string, TransitionTheme> = {
  plinko_pvp: { background: '#070b16', glow: '#5bb7ff', accent: '#ffb45c', ink: '#ffffff' },
  descent_duel: { background: '#09090b', glow: '#d8d9dd', accent: '#7c7f86', ink: '#ffffff' },
  paper_io: { background: '#071710', glow: '#54f2a8', accent: '#52ffe5', ink: '#f4fff9' },
  tower_stack: { background: '#0d0919', glow: '#9d7cff', accent: '#52ffe5', ink: '#ffffff' },
  grid_lock: { background: '#090d13', glow: '#9d7cff', accent: '#ff5d73', ink: '#ffffff' },
  neon_matrix: { background: '#05070c', glow: '#52ffe5', accent: '#9d7cff', ink: '#ffffff' },
  dunk_shot: { background: '#17100a', glow: '#f2a65a', accent: '#52ffe5', ink: '#fff8ed' },
  flappy_race: { background: '#071523', glow: '#4da3ff', accent: '#52ffe5', ink: '#ffffff' },
  disc_football: { background: '#07130f', glow: '#52ffe5', accent: '#ff7a90', ink: '#ffffff' },
  doodle_jump: { background: '#0d0a19', glow: '#9d7cff', accent: '#52ffe5', ink: '#ffffff' },
  crossy_pvp: { background: '#10160b', glow: '#f7c85f', accent: '#54f2a8', ink: '#ffffff' },
  coin_chase: { background: '#170a12', glow: '#ffd64a', accent: '#9b7cff', ink: '#ffffff' },
  cube_fill: { background: '#0d0921', glow: '#7653ee', accent: '#f5c94f', ink: '#ffffff' },
  ballz_duel: { background: '#07131a', glow: '#56e3ff', accent: '#ffd64a', ink: '#ffffff' },
  draw_drop: { background: '#ffffff', glow: '#111111', accent: '#111111', ink: '#111111' },
  tilt_maze: { background: '#ddd8cd', glow: '#8f9a82', accent: '#b99567', ink: '#292925' },
};

const displayName = (player: LobbyPlayerInfo | undefined, fallback: string) =>
  player?.tg_user?.trim() || fallback;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';

export const TurboSeriesController = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshBalance, refreshProfile } = useAuth();
  const { tr } = useLanguage();
  const [status, setStatus] = useState<TurboStatus | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [finalTransitioning, setFinalTransitioning] = useState(false);
  const [resultHold, setResultHold] = useState<ResultHold | null>(null);
  const [finalDetailsVisible, setFinalDetailsVisible] = useState(false);
  const transitionLobbyRef = useRef('');
  const transitionStartTimerRef = useRef<number | null>(null);
  const transitionNavigateTimerRef = useRef<number | null>(null);
  const transitionFinishTimerRef = useRef<number | null>(null);
  const finalTimerRef = useRef<number | null>(null);
  const finalTransitionTimerRef = useRef<number | null>(null);
  const latestStatusRef = useRef<TurboStatus | null>(null);
  const seriesID = window.sessionStorage.getItem(TURBO_SERIES_KEY) || '';
  const transitionLobbyID =
    status?.status === 'playing' ? status.current_lobby?.id || '' : '';
  const transitionGameCode =
    status?.status === 'playing' ? status.current_game || '' : '';
  const transitionPath = transitionGameCode
    ? getGameByCode(transitionGameCode)?.playPath
    : undefined;
  const transitionRound =
    status?.status === 'playing' ? status.round || 0 : 0;

  useEffect(() => {
    latestStatusRef.current = status;
  }, [status]);

  useEffect(
    () => () => {
      if (transitionStartTimerRef.current !== null) {
        window.clearTimeout(transitionStartTimerRef.current);
      }
      if (transitionNavigateTimerRef.current !== null) {
        window.clearTimeout(transitionNavigateTimerRef.current);
      }
      if (transitionFinishTimerRef.current !== null) {
        window.clearTimeout(transitionFinishTimerRef.current);
      }
      if (finalTimerRef.current !== null) {
        window.clearTimeout(finalTimerRef.current);
      }
      if (finalTransitionTimerRef.current !== null) {
        window.clearTimeout(finalTransitionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    document.documentElement.classList.toggle('turbo-series-active', Boolean(seriesID));
    return () => document.documentElement.classList.remove('turbo-series-active');
  }, [seriesID]);

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

    if (transitionNavigateTimerRef.current !== null) {
      window.clearTimeout(transitionNavigateTimerRef.current);
    }
    if (transitionFinishTimerRef.current !== null) {
      window.clearTimeout(transitionFinishTimerRef.current);
    }
    transitionLobbyRef.current = transitionLobbyID;
    const resultHold = transitionRound > 1 ? ROUND_RESULT_HOLD_MS : 0;
    if (resultHold > 0) {
      setResultHold({ kind: 'round', round: transitionRound });
    }

    transitionStartTimerRef.current = window.setTimeout(() => {
      transitionStartTimerRef.current = null;
      setResultHold(null);
      setTransitioning(true);
      transitionNavigateTimerRef.current = window.setTimeout(() => {
        const didEnter = enterTurboRound(nextStatus, navigate);
        transitionNavigateTimerRef.current = null;

        if (!didEnter) {
          if (transitionFinishTimerRef.current !== null) {
            window.clearTimeout(transitionFinishTimerRef.current);
            transitionFinishTimerRef.current = null;
          }
          transitionLobbyRef.current = '';
          setResultHold(null);
          setTransitioning(false);
        }
      }, ROUND_TRANSITION_NAVIGATE_MS);
      transitionFinishTimerRef.current = window.setTimeout(() => {
        transitionFinishTimerRef.current = null;
        setTransitioning(false);
      }, ROUND_TRANSITION_TOTAL_MS);
    }, resultHold);
  }, [
    location.pathname,
    navigate,
    transitionGameCode,
    transitionLobbyID,
    transitionPath,
    transitionRound,
  ]);

  useEffect(() => {
    if (finalTimerRef.current !== null) {
      window.clearTimeout(finalTimerRef.current);
      finalTimerRef.current = null;
    }
    if (finalTransitionTimerRef.current !== null) {
      window.clearTimeout(finalTransitionTimerRef.current);
      finalTransitionTimerRef.current = null;
    }
    if (status?.status !== 'finished') {
      setFinalTransitioning(false);
      setFinalDetailsVisible(false);
      return;
    }

    const activeLobbyID = window.sessionStorage.getItem(ACTIVE_LOBBY_KEY);
    const finalGamePath = status.current_game
      ? getGameByCode(status.current_game)?.playPath
      : undefined;
    const shouldHoldGameResult =
      status.finish_reason !== 'disconnect' &&
      Boolean(activeLobbyID) &&
      Boolean(finalGamePath) &&
      location.pathname === finalGamePath;

    setFinalTransitioning(false);
    setFinalDetailsVisible(false);
    setResultHold(shouldHoldGameResult ? { kind: 'final' } : null);
    finalTimerRef.current = window.setTimeout(() => {
      finalTimerRef.current = null;
      setResultHold(null);
      setFinalTransitioning(true);
      finalTransitionTimerRef.current = window.setTimeout(() => {
        finalTransitionTimerRef.current = null;
        setFinalDetailsVisible(true);
      }, FINAL_DETAILS_REVEAL_MS);
    }, shouldHoldGameResult ? ROUND_RESULT_HOLD_MS : 0);

    return () => {
      if (finalTimerRef.current !== null) {
        window.clearTimeout(finalTimerRef.current);
        finalTimerRef.current = null;
      }
      if (finalTransitionTimerRef.current !== null) {
        window.clearTimeout(finalTransitionTimerRef.current);
        finalTransitionTimerRef.current = null;
      }
    };
  }, [location.pathname, status?.current_game, status?.finish_reason, status?.status]);

  const wins = useMemo(() => {
    if (!user?.id || !status?.wins || !status.player_ids) return [0, 0];
    const opponent = status.player_ids.find((id) => id !== user.id);
    return [
      status.wins[String(user.id)] || 0,
      opponent ? status.wins[String(opponent)] || 0 : 0,
    ];
  }, [status?.player_ids, status?.wins, user?.id]);

  const finish = () => {
    window.sessionStorage.removeItem(TURBO_SERIES_KEY);
    window.sessionStorage.removeItem(ACTIVE_LOBBY_KEY);
    window.sessionStorage.removeItem('twingames_active_game');
    navigate('/', { replace: true });
    void Promise.allSettled([refreshBalance(), refreshProfile()]);
  };

  if (!seriesID || !status || status.status === 'idle' || status.status === 'searching') {
    return null;
  }

  const didWin =
    status.status === 'finished' &&
    Boolean(status.winner_user_id) &&
    status.winner_user_id === Number(user?.id);
  const isTechnicalFinish = status.finish_reason === 'disconnect';
  const currentTitle = status.current_game
    ? getGameByCode(status.current_game)?.displayName || status.current_game
    : '';
  const transitionTheme =
    TRANSITION_THEMES[transitionGameCode] || DEFAULT_TRANSITION_THEME;
  const transitionStyle = {
    '--turbo-transition-bg': transitionTheme.background,
    '--turbo-transition-glow': transitionTheme.glow,
    '--turbo-transition-accent': transitionTheme.accent,
    '--turbo-transition-ink': transitionTheme.ink,
  } as CSSProperties;
  const finalTransitionStyle = {
    '--turbo-transition-bg': FINAL_TRANSITION_THEME.background,
    '--turbo-transition-glow': FINAL_TRANSITION_THEME.glow,
    '--turbo-transition-accent': FINAL_TRANSITION_THEME.accent,
    '--turbo-transition-ink': FINAL_TRANSITION_THEME.ink,
  } as CSSProperties;
  const playerCards = [...(status.current_lobby?.players_info || [])].sort(
    (left, right) => {
      if (left.id === Number(user?.id)) return -1;
      if (right.id === Number(user?.id)) return 1;
      return 0;
    },
  );
  const normalizedPlayers: LobbyPlayerInfo[] = status.player_ids?.map(
    (id, index) =>
      playerCards.find((player) => player.id === id) || {
        id,
        tg_user: index === 0 ? tr('Player one', 'Игрок один') : tr('Player two', 'Игрок два'),
        photo_url: '',
      },
  ) || playerCards;
  const ownPlayer =
    normalizedPlayers.find((player) => player.id === Number(user?.id)) ||
    normalizedPlayers[0];
  const opponentPlayer =
    normalizedPlayers.find((player) => player.id !== Number(user?.id)) ||
    normalizedPlayers[1];
  const ownName = displayName(ownPlayer, tr('You', 'Вы'));
  const opponentName = displayName(opponentPlayer, tr('Opponent', 'Соперник'));
  const ownIsWinner = status.winner_user_id === ownPlayer?.id;
  const opponentIsWinner = status.winner_user_id === opponentPlayer?.id;
  const netResult = status.draw
    ? 0
    : didWin
      ? Math.round(status.bet_coins * 0.9)
      : -status.bet_coins;
  const finalOutcomeTitle = isTechnicalFinish
    ? status.draw
      ? tr('Lobby closed', 'Лобби закрыто')
      : didWin
        ? tr('Technical victory', 'Техническая победа')
        : tr('Technical defeat', 'Техническое поражение')
    : status.draw
      ? tr('Series draw', 'Ничья в серии')
      : didWin
        ? tr('Turbo victory', 'Победа в Turbo')
        : '';

  return (
    <>
      {status.status === 'playing' && (
        <div className="turbo-series-hud" aria-label="Turbo series score">
          <span>Turbo · {tr('Round', 'Раунд')} {status.round}/3</span>
          <div className="turbo-series-score">
            <strong>{wins[0]}</strong>
            <i>:</i>
            <strong>{wins[1]}</strong>
          </div>
        </div>
      )}

      {resultHold && (
        <div className={`turbo-result-hold is-${resultHold.kind}`} role="status" aria-live="polite">
          <div className="turbo-result-hold-arrow" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div>
            <strong>
              {resultHold.kind === 'round'
                ? tr(`Round ${resultHold.round} is next`, `Дальше раунд ${resultHold.round}`)
                : tr('Series complete', 'Серия завершена')}
            </strong>
            <span>
              {resultHold.kind === 'round'
                ? tr(
                    'Stay here — the next arena will open automatically',
                    'Не выходите — следующая арена откроется автоматически',
                  )
                : tr(
                    'Stay here — preparing the final result',
                    'Не выходите — готовим итог серии',
                  )}
            </span>
          </div>
        </div>
      )}

      {transitioning && (
        <div className="turbo-series-transition" role="status" style={transitionStyle}>
          <div className="turbo-transition-old-page" aria-hidden="true" />
          <div className="turbo-transition-new-page">
            <span>{tr('Next arena', 'Следующая арена')}</span>
            <strong>{currentTitle}</strong>
            <small>{tr('Round', 'Раунд')} {transitionRound}/3</small>
            <div className="turbo-transition-matchup">
              <div className="turbo-transition-competitor is-own">
                <div className="turbo-transition-avatar">
                  {ownPlayer?.photo_url ? (
                    <img src={ownPlayer.photo_url} alt="" draggable={false} />
                  ) : (
                    initials(displayName(ownPlayer, tr('You', 'Вы')))
                  )}
                </div>
                <b>{wins[0]}</b>
              </div>
              <i>:</i>
              <div className="turbo-transition-competitor is-opponent">
                <b>{wins[1]}</b>
                <div className="turbo-transition-avatar">
                  {opponentPlayer?.photo_url ? (
                    <img src={opponentPlayer.photo_url} alt="" draggable={false} />
                  ) : (
                    initials(displayName(opponentPlayer, tr('Opponent', 'Соперник')))
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="turbo-transition-edge" aria-hidden="true" />
        </div>
      )}

      {finalTransitioning && (
        <div
          className="turbo-series-transition turbo-final-transition"
          role="dialog"
          aria-modal="true"
          style={finalTransitionStyle}
        >
          <div className="turbo-transition-old-page" aria-hidden="true" />
          <div className="turbo-transition-new-page is-final">
            <div className="turbo-final-page-heading">
              <span>Turbo · {isTechnicalFinish ? tr('Technical result', 'Технический результат') : 'Best of 3'}</span>
              <strong>{tr('Final result', 'Итог серии')}</strong>
              <small>{tr('Series complete', 'Серия завершена')}</small>
            </div>
            <div className="turbo-transition-matchup turbo-final-matchup">
              <div className={`turbo-transition-competitor is-own ${ownIsWinner ? 'is-winner' : ''}`}>
                <div className="turbo-transition-avatar">
                  {ownPlayer?.photo_url ? (
                    <img src={ownPlayer.photo_url} alt="" draggable={false} />
                  ) : (
                    initials(ownName)
                  )}
                </div>
                <div className="turbo-final-matchup-player">
                  <span>{ownName}</span>
                  <b>{wins[0]}</b>
                </div>
              </div>
              <i>:</i>
              <div className={`turbo-transition-competitor is-opponent ${opponentIsWinner ? 'is-winner' : ''}`}>
                <div className="turbo-final-matchup-player">
                  <span>{opponentName}</span>
                  <b>{wins[1]}</b>
                </div>
                <div className="turbo-transition-avatar">
                  {opponentPlayer?.photo_url ? (
                    <img src={opponentPlayer.photo_url} alt="" draggable={false} />
                  ) : (
                    initials(opponentName)
                  )}
                </div>
              </div>
            </div>
            <div
              className={`turbo-final-inline-result ${
                finalDetailsVisible ? 'is-visible' : ''
              } ${didWin ? 'is-win' : status.draw ? 'is-draw' : 'is-loss'}`}
              aria-live="polite"
            >
              <span>{status.draw ? tr('Draw', 'Ничья') : didWin ? tr('Victory', 'Победа') : tr('Defeat', 'Поражение')}</span>
              {finalOutcomeTitle && <h2>{finalOutcomeTitle}</h2>}
              <div className={`turbo-final-inline-net ${netResult > 0 ? 'is-positive' : netResult < 0 ? 'is-negative' : ''}`}>
                <small>{tr('Net result', 'Чистый результат')}</small>
                <div>
                  <strong>{netResult > 0 ? '+' : ''}{netResult}</strong>
                  <img src={coinIcon} alt="" draggable={false} />
                </div>
              </div>
              <button type="button" onClick={finish}>
                {tr('Home', 'На главную')}
              </button>
            </div>
          </div>
          <div className="turbo-transition-edge" aria-hidden="true" />
        </div>
      )}
    </>
  );
};
