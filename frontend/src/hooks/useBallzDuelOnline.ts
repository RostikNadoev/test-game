import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  arcadeRaceWsApi,
  type ArcadeRaceSocketClient,
  type ArcadeRaceStateMessage,
  type BallzStageLayout,
} from '../api/arcadeRaceWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

export type BallzPlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const GENERIC_PLAYERS_STORAGE_KEY = 'twingames_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';
const PLAYERS_STORAGE_KEY = 'twingames_ballz_duel_players_info';

const IS_MOBILE_CLIENT =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 640);

const CLOCK_TICK_MS = IS_MOBILE_CLIENT ? 300 : 180;
const STATE_COMMIT_MS = IS_MOBILE_CLIENT ? 180 : 110;

const readStoredPlayersInfo = () => {
  if (typeof window === 'undefined') {
    return [] as LobbyPlayerInfo[];
  }

  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(GENERIC_PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY);

  if (!raw) {
    return [] as LobbyPlayerInfo[];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LobbyPlayerInfo[]) : [];
  } catch {
    return [];
  }
};

export const useBallzDuelOnline = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const routeState = (location.state || {}) as LocationState;

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);

    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      (typeof window !== 'undefined'
        ? window.sessionStorage.getItem(ACTIVE_LOBBY_STORAGE_KEY) || ''
        : '')
    );
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(
    () =>
      routeState.playersInfo?.length
        ? routeState.playersInfo
        : readStoredPlayersInfo(),
    [routeState.playersInfo],
  );

  const myUserId = Number(user?.id || 0);

  const profileById = useMemo(() => {
    const map = new Map<number, BallzPlayerProfile>();

    for (const player of playersInfo) {
      const id = Number(player.id);

      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }

      map.set(id, {
        id,
        name: player.tg_user || `Player ${id}`,
        photoUrl: player.photo_url || '',
      });
    }

    if (myUserId > 0) {
      map.set(myUserId, {
        id: myUserId,
        name: user?.tg_user || map.get(myUserId)?.name || 'Player',
        photoUrl: user?.photo_url || map.get(myUserId)?.photoUrl || '',
      });
    }

    return map;
  }, [myUserId, playersInfo, user?.photo_url, user?.tg_user]);

  const socketRef = useRef<ArcadeRaceSocketClient | null>(null);
  const phaseRef = useRef<
    'waiting' | 'countdown' | 'playing' | 'match_over'
  >('waiting');
  const eventIdRef = useRef(0);
  const serverOffsetRef = useRef(0);
  const latestStateRef = useRef<ArcadeRaceStateMessage | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const lastCommitRef = useRef(0);

  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'open' | 'closed' | 'error'
  >('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<ArcadeRaceStateMessage | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matchInstanceKey, setMatchInstanceKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'ballz_duel');
    }

    if (playersInfo.length) {
      const encoded = JSON.stringify(playersInfo);
      window.sessionStorage.setItem(PLAYERS_STORAGE_KEY, encoded);
      window.sessionStorage.setItem(GENERIC_PLAYERS_STORAGE_KEY, encoded);
    }
  }, [lobbyId, playersInfo]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lobbyId || !token || myUserId <= 0) {
      return;
    }

    let alive = true;

    setConnectionStatus('connecting');
    setSocketError(null);

    const commitState = (
      state: ArcadeRaceStateMessage,
      immediate: boolean,
    ) => {
      latestStateRef.current = state;

      const run = () => {
        if (!alive || !latestStateRef.current) {
          return;
        }

        lastCommitRef.current = performance.now();
        setServerState(latestStateRef.current);
        latestStateRef.current = null;

        if (commitTimerRef.current !== null) {
          window.clearTimeout(commitTimerRef.current);
          commitTimerRef.current = null;
        }
      };

      const elapsed = performance.now() - lastCommitRef.current;

      if (immediate || elapsed >= STATE_COMMIT_MS) {
        run();
        return;
      }

      if (commitTimerRef.current === null) {
        commitTimerRef.current = window.setTimeout(
          run,
          Math.max(0, STATE_COMMIT_MS - elapsed),
        );
      }
    };

    const client = arcadeRaceWsApi.connect({
      gameCode: 'ballz_duel',
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (!alive) {
            return;
          }

          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => {
          if (!alive) {
            return;
          }

          setConnectionStatus('closed');
        },
        onSocketError: () => {
          if (!alive) {
            return;
          }

          setConnectionStatus('error');
          setSocketError('Не удалось подключиться к матчу');
        },
        onServerError: (error) => {
          if (!alive) {
            return;
          }

          setSocketError(error.details || error.error);
        },
        onState: (state) => {
          if (!alive || state.game !== 'ballz_duel') {
            return;
          }

          const previousPhase = phaseRef.current;
          phaseRef.current = state.phase;
          serverOffsetRef.current = Date.now() - state.server_ms;

          if (eventIdRef.current === 0) {
            eventIdRef.current = Math.trunc(Date.now() * 1_000);
          }

          if (
            state.phase === 'countdown' &&
            previousPhase !== 'countdown'
          ) {
            eventIdRef.current = Math.trunc(Date.now() * 1_000);
            setMatchInstanceKey((value) => value + 1);
          }

          const immediate =
            state.phase !== previousPhase ||
            state.phase === 'match_over' ||
            state.phase === 'countdown';

          commitState(state, immediate);
          setSocketError(null);
        },
      },
    });

    socketRef.current = client;

    return () => {
      alive = false;
      socketRef.current = null;

      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }

      client.close();
    };
  }, [lobbyId, myUserId, token]);

  const sendShot = useCallback(
    (angle: number, balls: number, stageNumber: number) => {
      if (phaseRef.current !== 'playing') {
        return 0;
      }

      eventIdRef.current += 1;
      const eventId = eventIdRef.current;

      socketRef.current?.sendEvent({
        eventId,
        kind: 'shot',
        value: stageNumber,
        angle,
        balls,
      });

      return eventId;
    },
    [],
  );

  const requestState = useCallback(() => {
    socketRef.current?.requestState();
  }, []);

  const playerOrder = serverState?.player_order || [];
  const opponentUserId =
    playerOrder.find((id) => id !== myUserId) || 0;

  const playerProfile: BallzPlayerProfile =
    profileById.get(myUserId) || {
      id: myUserId,
      name: user?.tg_user || 'Player',
      photoUrl: user?.photo_url || '',
    };

  const opponentProfile: BallzPlayerProfile =
    profileById.get(opponentUserId) || {
      id: opponentUserId,
      name: opponentUserId
        ? `Player ${opponentUserId}`
        : 'Opponent',
      photoUrl: '',
    };

  const countdownEndsClient = serverState?.countdown_ends_ms
    ? serverState.countdown_ends_ms + serverOffsetRef.current
    : 0;

  const matchEndsClient = serverState?.match_ends_ms
    ? serverState.match_ends_ms + serverOffsetRef.current
    : 0;

  const countdownLeft = countdownEndsClient
    ? Math.max(
        0,
        Math.ceil((countdownEndsClient - nowMs) / 1000),
      )
    : 3;

  const matchTimeLeft = matchEndsClient
    ? Math.max(0, Math.ceil((matchEndsClient - nowMs) / 1000))
    : 90;

  const phase = serverState?.phase || 'waiting';
  const myKey = String(myUserId);
  const opponentKey = String(opponentUserId);

  const stages: BallzStageLayout[] = serverState?.ballz_stages || [];

  const myStage = Math.max(
    1,
    Math.min(2, serverState?.ballz_stage[myKey] || 1),
  );
  const opponentStage = Math.max(
    1,
    Math.min(2, serverState?.ballz_stage[opponentKey] || 1),
  );

  const myBrickHP = serverState?.ballz_brick_hp[myKey] || [];
  const opponentBrickHP =
    serverState?.ballz_brick_hp[opponentKey] || [];

  const myPickupAlive =
    serverState?.ballz_pickup_alive[myKey] || [];
  const opponentPickupAlive =
    serverState?.ballz_pickup_alive[opponentKey] || [];

  const myAvailableBalls = Math.max(
    1,
    serverState?.ballz_available_balls[myKey] || 25,
  );
  const opponentAvailableBalls = Math.max(
    1,
    serverState?.ballz_available_balls[opponentKey] || 25,
  );

  const myBallsUsed = Math.max(
    0,
    serverState?.ballz_balls_used[myKey] || 0,
  );
  const opponentBallsUsed = Math.max(
    0,
    serverState?.ballz_balls_used[opponentKey] || 0,
  );

  const myShots = Math.max(0, serverState?.ballz_shots[myKey] || 0);
  const opponentShots = Math.max(
    0,
    serverState?.ballz_shots[opponentKey] || 0,
  );

  const myProgress =
    Math.max(0, serverState?.ballz_progress_bp[myKey] || 0) / 100;
  const opponentProgress =
    Math.max(0, serverState?.ballz_progress_bp[opponentKey] || 0) / 100;

  const myEfficiency =
    Math.max(0, serverState?.ballz_efficiency_bp[myKey] || 0) / 100;
  const opponentEfficiency =
    Math.max(0, serverState?.ballz_efficiency_bp[opponentKey] || 0) / 100;

  const myFinished = serverState?.ballz_finished[myKey] === true;
  const opponentFinished =
    serverState?.ballz_finished[opponentKey] === true;

  const myLaunchX = Math.max(
    0.035,
    Math.min(
      0.965,
      (serverState?.ballz_launch_x_bp[myKey] || 5_000) / 10_000,
    ),
  );

  const myScore = Math.max(0, serverState?.scores[myKey] || 0);
  const opponentScore = Math.max(
    0,
    serverState?.scores[opponentKey] || 0,
  );

  const myLastEventId = Math.max(
    0,
    serverState?.last_event_ids[myKey] || 0,
  );

  const winnerUserId = serverState?.winner_user_id || 0;

  const backToLobbies = useCallback(
    () =>
      navigate('/game/ballz_duel/lobbies', {
        replace: true,
      }),
    [navigate],
  );

  return {
    lobbyId,
    myUserId,
    opponentUserId,
    playerProfile,
    opponentProfile,
    connectionStatus,
    socketError,
    serverState,
    phase,
    phaseRef,
    seed: serverState?.seed || 1,
    matchInstanceKey,
    countdownLeft,
    matchTimeLeft,
    stages,
    myStage,
    opponentStage,
    myBrickHP,
    opponentBrickHP,
    myPickupAlive,
    opponentPickupAlive,
    myAvailableBalls,
    opponentAvailableBalls,
    myBallsUsed,
    opponentBallsUsed,
    myShots,
    opponentShots,
    myProgress,
    opponentProgress,
    myEfficiency,
    opponentEfficiency,
    myFinished,
    opponentFinished,
    myLaunchX,
    myScore,
    opponentScore,
    myLastEventId,
    winnerUserId,
    draw: serverState?.draw === true,
    ready: serverState?.ready === true,
    winnerProfit: serverState?.winner_profit || 0,
    sendShot,
    requestState,
    backToLobbies,
  };
};
