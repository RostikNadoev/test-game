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
} from '../api/arcadeRaceWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

export type DrawDropPlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const GENERIC_PLAYERS_STORAGE_KEY = 'twingames_players_info';
const PLAYERS_STORAGE_KEY = 'twingames_draw_drop_players_info';

const CLOCK_TICK_MS = 200;

const readStoredPlayersInfo = () => {
  if (typeof window === 'undefined') return [] as LobbyPlayerInfo[];
  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(GENERIC_PLAYERS_STORAGE_KEY);
  if (!raw) return [] as LobbyPlayerInfo[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LobbyPlayerInfo[]) : [];
  } catch {
    return [] as LobbyPlayerInfo[];
  }
};

export const useDrawDropOnline = () => {
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
    const map = new Map<number, DrawDropPlayerProfile>();
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
  const phaseRef = useRef<'waiting' | 'countdown' | 'playing' | 'match_over'>('waiting');
  const eventIdRef = useRef(0);

  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'open' | 'closed' | 'error'
  >('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [serverState, setServerState] = useState<ArcadeRaceStateMessage | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matchInstanceKey, setMatchInstanceKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'draw_drop');
    }
    if (playersInfo.length) {
      const encoded = JSON.stringify(playersInfo);
      window.sessionStorage.setItem(PLAYERS_STORAGE_KEY, encoded);
      window.sessionStorage.setItem(GENERIC_PLAYERS_STORAGE_KEY, encoded);
    }
  }, [lobbyId, playersInfo]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lobbyId || !token || myUserId <= 0) return;
    let alive = true;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = arcadeRaceWsApi.connect({
      gameCode: 'draw_drop',
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
          if (!alive || state.game !== 'draw_drop') return;
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

  const sendLevelComplete = useCallback((slot: number, inkUsed: number) => {
    if (phaseRef.current !== 'playing') return;
    eventIdRef.current += 1;
    socketRef.current?.sendEvent({
      eventId: eventIdRef.current,
      kind: 'complete',
      value: slot + 1,
      objectId: Math.max(0, Math.round(inkUsed)),
    });
  }, []);

  const playerOrder = serverState?.player_order || [];
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;
  const myKey = String(myUserId);
  const opponentKey = String(opponentUserId);

  const playerProfile: DrawDropPlayerProfile = profileById.get(myUserId) || {
    id: myUserId,
    name: user?.tg_user || 'Player',
    photoUrl: user?.photo_url || '',
  };
  const opponentProfile: DrawDropPlayerProfile = profileById.get(opponentUserId) || {
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
    : 100;

  const phase = serverState?.phase || 'waiting';
  const levelIndices = serverState?.draw_level_indices || [];
  const myCompleted = serverState?.draw_completed[myKey] || [];
  const opponentCompleted = serverState?.draw_completed[opponentKey] || [];
  const myInk = serverState?.draw_ink[myKey] || [];
  const opponentInk = serverState?.draw_ink[opponentKey] || [];
  const myCompletedCount = serverState?.draw_completed_count[myKey] || 0;
  const opponentCompletedCount = serverState?.draw_completed_count[opponentKey] || 0;
  const myTotalInk = serverState?.draw_total_ink[myKey] || 0;
  const opponentTotalInk = serverState?.draw_total_ink[opponentKey] || 0;
  const myInkRatioBP = serverState?.draw_ink_ratio_bp[myKey] || 0;
  const opponentInkRatioBP = serverState?.draw_ink_ratio_bp[opponentKey] || 0;
  const myEfficiencyBP = serverState?.draw_efficiency_bp[myKey] || 0;
  const opponentEfficiencyBP = serverState?.draw_efficiency_bp[opponentKey] || 0;
  const myFinished = serverState?.draw_finished[myKey] === true;
  const opponentFinished = serverState?.draw_finished[opponentKey] === true;

  const backToLobbies = useCallback(
    () => navigate('/game/draw_drop/lobbies', { replace: true }),
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
    matchInstanceKey,
    countdownLeft,
    matchTimeLeft,
    levelIndices,
    myCompleted,
    opponentCompleted,
    myInk,
    opponentInk,
    myCompletedCount,
    opponentCompletedCount,
    myTotalInk,
    opponentTotalInk,
    myInkRatioBP,
    opponentInkRatioBP,
    myEfficiencyBP,
    opponentEfficiencyBP,
    myFinished,
    opponentFinished,
    winnerUserId: serverState?.winner_user_id || 0,
    draw: serverState?.draw === true,
    winnerProfit: serverState?.winner_profit || 0,
    ready: serverState?.ready === true,
    sendLevelComplete,
    backToLobbies,
  };
};
