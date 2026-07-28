import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LobbyPlayerInfo } from '../api/types';
import {
  tiltMazeWsApi,
  type TiltMazeSocketClient,
  type TiltMazeStateMessage,
} from '../api/tiltMazeWs';
import { useAuth } from '../auth/useAuth';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

export type TiltMazePlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

const readLobbyId = (state: LocationState, search: string) => {
  if (state.lobbyId) return state.lobbyId;
  const query = new URLSearchParams(search);
  const fromQuery = query.get('lobby_id') || query.get('lobbyId');
  if (fromQuery) return fromQuery;
  return window.sessionStorage.getItem('twingames_active_lobby_id') || '';
};

const readStoredPlayersInfo = () => {
  const keys = [
    'twingames_tilt_maze_players_info',
    'twingames_players_info',
    'twingames_blackjack_players_info',
  ];

  for (const key of keys) {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as LobbyPlayerInfo[];
    } catch {
      // Ignore broken legacy storage and continue with the next key.
    }
  }

  return [];
};

const profileFromLobbyPlayer = (player: LobbyPlayerInfo): TiltMazePlayerProfile => {
  const id = Number(player.id || 0);
  return {
    id,
    name: player.tg_user || `Player ${id}`,
    photoUrl: player.photo_url || '',
  };
};

export function useTiltMazeOnline() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const routeState = (location.state || {}) as LocationState;

  const lobbyId = useMemo(
    () => readLobbyId(routeState, location.search),
    [location.search, routeState],
  );

  const playersInfo = useMemo(() => {
    if (routeState.playersInfo?.length) return routeState.playersInfo;
    return readStoredPlayersInfo();
  }, [routeState.playersInfo]);

  const [serverState, setServerState] = useState<TiltMazeStateMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'open' | 'closed' | 'error'
  >('connecting');
  const [socketError, setSocketError] = useState('');
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const socketRef = useRef<TiltMazeSocketClient | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const finishedRefreshRef = useRef(false);

  const myUserId = Number(user?.id || 0);

  const profiles = useMemo(() => {
    const byId = new Map<number, TiltMazePlayerProfile>();
    for (const player of playersInfo) {
      const profile = profileFromLobbyPlayer(player);
      if (profile.id > 0) byId.set(profile.id, profile);
    }

    if (myUserId > 0) {
      byId.set(myUserId, {
        id: myUserId,
        name: user?.tg_user || byId.get(myUserId)?.name || `Player ${myUserId}`,
        photoUrl: user?.photo_url || byId.get(myUserId)?.photoUrl || '',
      });
    }

    return byId;
  }, [myUserId, playersInfo, user?.photo_url, user?.tg_user]);

  const playerOrder = serverState?.player_order || [];
  const opponentUserId =
    playerOrder.find((id) => Number(id) !== myUserId) ||
    [...profiles.keys()].find((id) => id !== myUserId) ||
    0;

  const playerProfile = profiles.get(myUserId) || {
    id: myUserId,
    name: user?.tg_user || 'Player',
    photoUrl: user?.photo_url || '',
  };

  const opponentProfile = profiles.get(opponentUserId) || {
    id: opponentUserId,
    name: opponentUserId ? `Player ${opponentUserId}` : 'Opponent',
    photoUrl: '',
  };

  const connect = useCallback(() => {
    if (!lobbyId || !token || unmountedRef.current) return;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    socketRef.current?.close();
    setConnectionStatus('connecting');
    setSocketError('');

    const client = tiltMazeWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (unmountedRef.current) return;
          setConnectionStatus('open');
          setSocketError('');
        },
        onState: (state) => {
          if (unmountedRef.current) return;
          setServerOffsetMs(Date.now() - state.server_ms);
          setServerState(state);
        },
        onError: (message) => {
          if (unmountedRef.current) return;
          setConnectionStatus('error');
          setSocketError(message);
        },
        onClose: () => {
          if (unmountedRef.current || client.isClosedByClient()) return;
          setConnectionStatus('closed');
          reconnectTimerRef.current = window.setTimeout(connect, 900);
        },
      },
    });

    socketRef.current = client;
  }, [lobbyId, token]);

  useEffect(() => {
    unmountedRef.current = false;
    if (!lobbyId) {
      setConnectionStatus('error');
      setSocketError('Lobby ID is missing');
      return undefined;
    }
    if (!token) {
      setConnectionStatus('error');
      setSocketError('Authorization token is missing');
      return undefined;
    }

    window.sessionStorage.setItem('twingames_active_lobby_id', lobbyId);
    window.sessionStorage.setItem('twingames_active_game', 'tilt_maze');
    if (playersInfo.length) {
      window.sessionStorage.setItem(
        'twingames_tilt_maze_players_info',
        JSON.stringify(playersInfo),
      );
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect, lobbyId, playersInfo, token]);

  useEffect(() => {
    if (serverState?.phase !== 'finished' || finishedRefreshRef.current) return;
    finishedRefreshRef.current = true;
    void refreshBalance();
    void refreshProfile();
  }, [refreshBalance, refreshProfile, serverState?.phase]);

  const sendPosition = useCallback((x: number, y: number) => {
    socketRef.current?.sendPosition(x, y);
  }, []);

  const sendFinish = useCallback((x: number, y: number) => {
    socketRef.current?.sendFinish(x, y);
  }, []);

  const requestState = useCallback(() => {
    socketRef.current?.requestState();
  }, []);

  const backToLobbies = useCallback(() => {
    navigate('/game/tilt_maze/lobbies', { replace: true });
  }, [navigate]);

  const myState = serverState?.players.find((player) => player.user_id === myUserId) || null;
  const opponentState =
    serverState?.players.find((player) => player.user_id === opponentUserId) || null;

  return {
    lobbyId,
    myUserId,
    opponentUserId,
    playerProfile,
    opponentProfile,
    connectionStatus,
    socketError,
    serverState,
    serverOffsetMs,
    phase: serverState?.phase || 'waiting',
    seed: serverState?.seed || 0,
    myState,
    opponentState,
    winnerUserId: Number(serverState?.winner_user_id || 0),
    draw: serverState?.draw === true,
    betCoins: Number(serverState?.bet_coins || 0),
    winnerProfit: Number(serverState?.winner_profit || 0),
    sendPosition,
    sendFinish,
    requestState,
    backToLobbies,
  };
}
