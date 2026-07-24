import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  arcadeRaceWsApi,
  type ArcadeRaceSocketClient,
  type ArcadeRaceStateMessage,
} from '../api/arcadeRaceWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

export type CoinChasePlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const GENERIC_PLAYERS_STORAGE_KEY = 'twingames_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';
const PLAYERS_STORAGE_KEY = 'twingames_coin_chase_players_info';

const readStoredPlayersInfo = () => {
  if (typeof window === 'undefined') return [] as LobbyPlayerInfo[];

  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(GENERIC_PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY);

  if (!raw) return [] as LobbyPlayerInfo[];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LobbyPlayerInfo[]) : [];
  } catch {
    return [];
  }
};

export const useCoinChaseOnline = () => {
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
    const map = new Map<number, CoinChasePlayerProfile>();

    for (const player of playersInfo) {
      const id = Number(player.id);
      if (!Number.isFinite(id) || id <= 0) continue;

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
  const phaseRef = useRef<'waiting' | 'countdown' | 'playing' | 'match_over'>(
    'waiting',
  );
  const eventIdRef = useRef(0);

  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'open' | 'closed' | 'error'
  >('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<ArcadeRaceStateMessage | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matchInstanceKey, setMatchInstanceKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'coin_chase');
    }

    if (playersInfo.length) {
      const encoded = JSON.stringify(playersInfo);
      window.sessionStorage.setItem(PLAYERS_STORAGE_KEY, encoded);
      window.sessionStorage.setItem(GENERIC_PLAYERS_STORAGE_KEY, encoded);
    }
  }, [lobbyId, playersInfo]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lobbyId || !token || myUserId <= 0) return;

    let alive = true;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = arcadeRaceWsApi.connect({
      gameCode: 'coin_chase',
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (!alive) return;
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => {
          if (!alive) return;
          setConnectionStatus('closed');
        },
        onSocketError: () => {
          if (!alive) return;
          setConnectionStatus('error');
          setSocketError('Не удалось подключиться к матчу');
        },
        onServerError: (error) => {
          if (!alive) return;
          setSocketError(error.details || error.error);
        },
        onState: (state) => {
          if (!alive || state.game !== 'coin_chase') return;

          const previousPhase = phaseRef.current;
          phaseRef.current = state.phase;
          setServerOffsetMs(Date.now() - state.server_ms);

          if (eventIdRef.current === 0) {
            eventIdRef.current = Math.trunc(Date.now() * 1_000);
          }

          if (state.phase === 'countdown' && previousPhase !== 'countdown') {
            eventIdRef.current = Math.trunc(Date.now() * 1_000);
            setMatchInstanceKey((value) => value + 1);
          }

          setServerState(state);
          setSocketError(null);
        },
      },
    });

    socketRef.current = client;

    return () => {
      alive = false;
      socketRef.current = null;
      client.close();
    };
  }, [lobbyId, myUserId, token]);

  const sendEvent = useCallback(
    (event: {
      kind: string;
      objectId?: number;
      value?: number;
      grade?: string;
      perfect?: boolean;
    }) => {
      if (phaseRef.current !== 'playing') return;

      eventIdRef.current += 1;
      socketRef.current?.sendEvent({
        eventId: eventIdRef.current,
        kind: event.kind,
        objectId: event.objectId,
        value: event.value,
        grade: event.grade,
        perfect: event.perfect,
      });
    },
    [],
  );

  const playerOrder = serverState?.player_order || [];
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;

  const playerProfile: CoinChasePlayerProfile = profileById.get(myUserId) || {
    id: myUserId,
    name: user?.tg_user || 'Player',
    photoUrl: user?.photo_url || '',
  };

  const opponentProfile: CoinChasePlayerProfile =
    profileById.get(opponentUserId) || {
      id: opponentUserId,
      name: opponentUserId ? `Player ${opponentUserId}` : 'Opponent',
      photoUrl: '',
    };

  const countdownEndsClient = serverState?.countdown_ends_ms
    ? serverState.countdown_ends_ms + serverOffsetMs
    : 0;
  const matchEndsClient = serverState?.match_ends_ms
    ? serverState.match_ends_ms + serverOffsetMs
    : 0;

  const countdownLeft = countdownEndsClient
    ? Math.max(0, Math.ceil((countdownEndsClient - nowMs) / 1000))
    : 3;
  const matchTimeLeft = matchEndsClient
    ? Math.max(0, Math.ceil((matchEndsClient - nowMs) / 1000))
    : 60;

  const phase = serverState?.phase || 'waiting';
  const myScore = serverState?.scores[String(myUserId)] || 0;
  const opponentScore = serverState?.scores[String(opponentUserId)] || 0;

  const backToLobbies = useCallback(
    () => navigate('/game/coin_chase/lobbies', { replace: true }),
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
    seed: serverState?.seed || 1,
    matchInstanceKey,
    countdownLeft,
    matchTimeLeft,
    myScore,
    opponentScore,
    winnerUserId: serverState?.winner_user_id || 0,
    draw: serverState?.draw === true,
    ready: serverState?.ready === true,
    sendEvent,
    backToLobbies,
  };
};
