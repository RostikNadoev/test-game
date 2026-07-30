import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import {
  gridLockWsApi,
  type GridLockPosition,
  type GridLockSocketClient,
  type GridLockStateMessage,
  type GridLockWall,
} from '../api/gridLockWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { getTelegramWebApp } from '../types/telegram';

type Orientation = 'h' | 'v';
type Preview = { row: number; col: number; orientation: Orientation; valid: boolean };
type DragWall = { orientation: Orientation; x: number; y: number; overCancel: boolean };
type PlayerProfile = { id: number; name: string; photoUrl: string };
type LocationState = { lobbyId?: string; game?: string; playersInfo?: LobbyPlayerInfo[] };

const N = 9;
const STARTING_WALLS = 10;
const P = 5;
const S = 10;
const CELL_GAP = 0.72;
const WT = 2.05;
const WPAD = 0.72;
const WALL_DRAG_Y_OFFSET_PX = 34;

const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const GENERIC_PLAYERS_STORAGE_KEY = 'twingames_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';
const PLAYERS_STORAGE_KEY = 'twingames_grid_lock_players_info';

const COLORS = {
  mine: '#2f8cff',
  mineLight: '#5bb7ff',
  mineDark: '#145dcc',
  rival: '#f59e42',
  rivalLight: '#ffb45c',
  rivalDark: '#b85c12',
  danger: '#ef4444',
  gold: '#f7c85f',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const same = (a: GridLockPosition, b: GridLockPosition) => a.row === b.row && a.col === b.col;
const inBoard = (position: GridLockPosition) =>
  position.row >= 0 && position.row < N && position.col >= 0 && position.col < N;
const posKey = (position: GridLockPosition) => `${position.row},${position.col}`;
const edgeKey = (a: GridLockPosition, b: GridLockPosition) => {
  const first = posKey(a);
  const second = posKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
};
const center = (row: number, col: number) => ({ x: P + col * S + S / 2, y: P + row * S + S / 2 });

const getInitials = (name: string) =>
  name
    .replace('@', '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'TG';

const formatReward = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.max(0, value));

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
    return [] as LobbyPlayerInfo[];
  }
};

const wallRect = (wall: { row: number; col: number; orientation: Orientation }) => {
  if (wall.orientation === 'h') {
    return {
      x: P + wall.col * S + WPAD,
      y: P + (wall.row + 1) * S - WT / 2,
      width: S * 2 - WPAD * 2,
      height: WT,
    };
  }
  return {
    x: P + (wall.col + 1) * S - WT / 2,
    y: P + wall.row * S + WPAD,
    width: WT,
    height: S * 2 - WPAD * 2,
  };
};

const buildBlocked = (walls: GridLockWall[]) => {
  const blocked = new Set<string>();
  for (const wall of walls) {
    if (wall.orientation === 'h') {
      blocked.add(edgeKey({ row: wall.row, col: wall.col }, { row: wall.row + 1, col: wall.col }));
      blocked.add(edgeKey({ row: wall.row, col: wall.col + 1 }, { row: wall.row + 1, col: wall.col + 1 }));
    } else {
      blocked.add(edgeKey({ row: wall.row, col: wall.col }, { row: wall.row, col: wall.col + 1 }));
      blocked.add(edgeKey({ row: wall.row + 1, col: wall.col }, { row: wall.row + 1, col: wall.col + 1 }));
    }
  }
  return blocked;
};

const blockedEdge = (a: GridLockPosition, b: GridLockPosition, blocked: Set<string>) =>
  blocked.has(edgeKey(a, b));

const legalMovesOf = (from: GridLockPosition, other: GridLockPosition, blocked: Set<string>) => {
  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  const moves: GridLockPosition[] = [];

  for (const direction of directions) {
    const adjacent = { row: from.row + direction.row, col: from.col + direction.col };
    if (!inBoard(adjacent) || blockedEdge(from, adjacent, blocked)) continue;
    if (!same(adjacent, other)) {
      moves.push(adjacent);
      continue;
    }

    const beyond = { row: other.row + direction.row, col: other.col + direction.col };
    if (inBoard(beyond) && !blockedEdge(other, beyond, blocked)) {
      moves.push(beyond);
      continue;
    }

    const sides =
      direction.row !== 0
        ? [
            { row: 0, col: -1 },
            { row: 0, col: 1 },
          ]
        : [
            { row: -1, col: 0 },
            { row: 1, col: 0 },
          ];
    for (const side of sides) {
      const diagonal = { row: other.row + side.row, col: other.col + side.col };
      if (inBoard(diagonal) && !blockedEdge(other, diagonal, blocked)) moves.push(diagonal);
    }
  }

  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = posKey(move);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const hasPath = (start: GridLockPosition, goalRow: number, blocked: Set<string>) => {
  const queue = [start];
  const seen = new Set([posKey(start)]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.row === goalRow) return true;
    const neighbors = [
      { row: current.row - 1, col: current.col },
      { row: current.row + 1, col: current.col },
      { row: current.row, col: current.col - 1 },
      { row: current.row, col: current.col + 1 },
    ];
    for (const next of neighbors) {
      const key = posKey(next);
      if (!inBoard(next) || seen.has(key) || blockedEdge(current, next, blocked)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
};

const wallConflict = (candidate: Preview, walls: GridLockWall[]) =>
  walls.some((wall) => {
    if (wall.row === candidate.row && wall.col === candidate.col) return true;
    if (
      candidate.orientation === 'h' &&
      wall.orientation === 'h' &&
      wall.row === candidate.row &&
      Math.abs(wall.col - candidate.col) === 1
    ) {
      return true;
    }
    return (
      candidate.orientation === 'v' &&
      wall.orientation === 'v' &&
      wall.col === candidate.col &&
      Math.abs(wall.row - candidate.row) === 1
    );
  });

const wallValid = (
  candidate: Preview,
  walls: GridLockWall[],
  player: GridLockPosition,
  opponent: GridLockPosition,
) => {
  if (candidate.row < 0 || candidate.row > N - 2 || candidate.col < 0 || candidate.col > N - 2) {
    return false;
  }
  if (wallConflict(candidate, walls)) return false;
  const withCandidate: GridLockWall[] = [
    ...walls,
    {
      id: 'preview',
      row: candidate.row,
      col: candidate.col,
      orientation: candidate.orientation,
      user_id: 0,
    },
  ];
  const blocked = buildBlocked(withCandidate);
  return hasPath(player, 0, blocked) && hasPath(opponent, N - 1, blocked);
};

const rotatePosition = (position: GridLockPosition) => ({
  row: N - 1 - position.row,
  col: N - 1 - position.col,
});

const rotateWall = (wall: GridLockWall): GridLockWall => ({
  ...wall,
  row: N - 2 - wall.row,
  col: N - 2 - wall.col,
});

const toServerWallSlot = (preview: Preview, rotated: boolean) =>
  rotated
    ? { row: N - 2 - preview.row, col: N - 2 - preview.col, orientation: preview.orientation }
    : { row: preview.row, col: preview.col, orientation: preview.orientation };

const haptic = (kind: 'light' | 'medium' | 'success' | 'error' = 'light') => {
  try {
    const tg = getTelegramWebApp();
    if (kind === 'success' || kind === 'error') {
      tg?.HapticFeedback?.notificationOccurred?.(kind);
      return;
    }
    tg?.HapticFeedback?.impactOccurred?.(kind);
  } catch {
    // Telegram API is optional outside the Mini App.
  }
};

const PlayerAvatar = ({ profile, tone }: { profile: PlayerProfile; tone: 'mine' | 'rival' }) => (
  <div className={`gl-avatar gl-avatar-${tone}`}>
    {profile.photoUrl ? (
      <img src={profile.photoUrl} alt={profile.name} className="h-full w-full object-cover" draggable={false} />
    ) : (
      getInitials(profile.name)
    )}
  </div>
);

const Pawn = ({ position, mine, active }: { position: GridLockPosition; mine: boolean; active: boolean }) => {
  const { x, y } = center(position.row, position.col);
  return (
    <g className="gl-pawn" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {active && <circle r={4.35} fill={mine ? COLORS.mine : COLORS.rival} opacity={0.15} className="gl-pulse" />}
      <ellipse cx={0} cy={2.75} rx={2.9} ry={0.82} fill="rgba(0,0,0,0.34)" />
      <circle r={3.1} fill={`url(#pawn-${mine ? 'mine' : 'rival'})`} stroke="rgba(255,255,255,0.56)" strokeWidth={0.32} />
      <ellipse cx={-0.78} cy={-0.96} rx={1.02} ry={0.62} fill="rgba(255,255,255,0.45)" />
    </g>
  );
};

const PlayerHud = ({
  profile,
  walls,
  active,
  timeLeft,
  side,
}: {
  profile: PlayerProfile;
  walls: number;
  active: boolean;
  timeLeft: number;
  side: 'mine' | 'rival';
}) => (
  <div className={`gl-player gl-player-${side} ${active ? 'gl-player-active' : ''}`}>
    {side === 'mine' && <PlayerAvatar profile={profile} tone={side} />}
    <div className={`min-w-0 ${side === 'rival' ? 'text-right' : ''}`}>
      <div className="gl-safe truncate text-[9px] font-black text-white/90">{profile.name}</div>
      <div className={`gl-safe mt-1 text-[19px] font-black tabular-nums ${active ? 'text-white' : 'text-white/55'}`}>
        {timeLeft}
      </div>
      <div className="gl-safe mt-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/32">
        {walls} стен
      </div>
    </div>
    {side === 'rival' && <PlayerAvatar profile={profile} tone={side} />}
  </div>
);

const WallButton = ({
  orientation,
  disabled,
  active,
  onPointerDown,
}: {
  orientation: Orientation;
  disabled: boolean;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onPointerDown={onPointerDown}
    className={`gl-wall-button ${active ? 'gl-wall-button-active' : ''}`}
    aria-label={orientation === 'h' ? 'Поставить горизонтальную стену' : 'Поставить вертикальную стену'}
  >
    <span className={`gl-wall-icon gl-wall-icon-${orientation}`} />
  </button>
);

export const GridLockGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const routeState = (location.state || {}) as LocationState;

  const boardRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<GridLockSocketClient | null>(null);
  const dragWallRef = useRef<DragWall | null>(null);
  const seenActionRef = useRef<number | null>(null);
  const resultHandledRef = useRef(false);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<GridLockStateMessage | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragWall, setDragWallState] = useState<DragWall | null>(null);
  const [notice, setNotice] = useState('');
  const [actionPending, setActionPending] = useState(false);

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      (typeof window !== 'undefined' ? window.sessionStorage.getItem(ACTIVE_LOBBY_STORAGE_KEY) || '' : '')
    );
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(
    () => (routeState.playersInfo?.length ? routeState.playersInfo : readStoredPlayersInfo()),
    [routeState.playersInfo],
  );

  const myUserId = Number(user?.id || 0);
  const profileById = useMemo(() => {
    const result = new Map<number, PlayerProfile>();
    for (const player of playersInfo) {
      const id = Number(player.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      result.set(id, {
        id,
        name: player.tg_user || `Player ${id}`,
        photoUrl: player.photo_url || '',
      });
    }
    if (myUserId > 0) {
      result.set(myUserId, {
        id: myUserId,
        name: user?.tg_user || result.get(myUserId)?.name || 'Player',
        photoUrl: user?.photo_url || result.get(myUserId)?.photoUrl || '',
      });
    }
    return result;
  }, [myUserId, playersInfo, user?.photo_url, user?.tg_user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'grid_lock');
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
    const tg = getTelegramWebApp();
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      // no-op
    }

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouch = body.style.touchAction;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouch;
      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        // no-op
      }
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 1700);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!lobbyId || !token || myUserId <= 0) return;
    let alive = true;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = gridLockWsApi.connect({
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
          const message = error.details || error.error;
          setSocketError(message);
          setNotice(message);
          setActionPending(false);
          haptic('error');
        },
        onState: (state) => {
          if (!alive) return;
          setServerOffsetMs(Date.now() - state.server_ms);
          setServerState(state);
          setSocketError(null);
          setActionPending(false);

          const sequence = state.last_action?.sequence;
          if (sequence === undefined && seenActionRef.current === null) {
            seenActionRef.current = 0;
          } else if (sequence !== undefined) {
            if (seenActionRef.current === null) {
              seenActionRef.current = sequence;
            } else if (sequence > seenActionRef.current) {
              seenActionRef.current = sequence;
              if (state.last_action?.kind === 'timeout') {
                setNotice(state.last_action.user_id === myUserId ? 'Время вышло — ход пропущен' : 'Соперник пропустил ход');
              }
            }
          }
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

  useEffect(() => {
    if (serverState?.phase !== 'match_over' || resultHandledRef.current) return;
    resultHandledRef.current = true;
    haptic(serverState.winner_user_id === myUserId ? 'success' : 'error');
    const timeout = window.setTimeout(() => {
      void Promise.allSettled([refreshBalance(), refreshProfile()]);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [myUserId, refreshBalance, refreshProfile, serverState?.phase, serverState?.winner_user_id]);

  const playerOrder = serverState?.player_order || [];
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;
  const rotated = playerOrder[1] === myUserId;

  const myProfile = profileById.get(myUserId) || {
    id: myUserId,
    name: user?.tg_user || 'Player',
    photoUrl: user?.photo_url || '',
  };
  const opponentProfile = profileById.get(opponentUserId) || {
    id: opponentUserId,
    name: opponentUserId ? `Player ${opponentUserId}` : 'Opponent',
    photoUrl: '',
  };

  const rawMyPosition = serverState?.positions[String(myUserId)] || { row: N - 1, col: 4 };
  const rawOpponentPosition = serverState?.positions[String(opponentUserId)] || { row: 0, col: 4 };
  const myPosition = rotated ? rotatePosition(rawMyPosition) : rawMyPosition;
  const opponentPosition = rotated ? rotatePosition(rawOpponentPosition) : rawOpponentPosition;
  const viewWalls = useMemo(
    () => (rotated ? (serverState?.walls || []).map(rotateWall) : serverState?.walls || []),
    [rotated, serverState?.walls],
  );

  const phase = serverState?.phase || 'waiting';
  const canAct = phase === 'playing' && serverState?.turn_user_id === myUserId && !actionPending;
  const blocked = useMemo(() => buildBlocked(viewWalls), [viewWalls]);
  const legalMoves = useMemo(
    () => (canAct ? legalMovesOf(myPosition, opponentPosition, blocked) : []),
    [blocked, canAct, myPosition, opponentPosition],
  );
  const legalMoveKeys = useMemo(() => new Set(legalMoves.map(posKey)), [legalMoves]);

  const cells = useMemo(() => {
    const result: { row: number; col: number; x: number; y: number }[] = [];
    for (let row = 0; row < N; row += 1) {
      for (let col = 0; col < N; col += 1) result.push({ row, col, x: P + col * S, y: P + row * S });
    }
    return result;
  }, []);

  const countdownLeft = serverState?.countdown_ends_ms
    ? Math.max(0, Math.ceil((serverState.countdown_ends_ms + serverOffsetMs - nowMs) / 1000))
    : 3;
  const turnTimeLeft = serverState?.turn_ends_ms
    ? Math.max(0, Math.ceil((serverState.turn_ends_ms + serverOffsetMs - nowMs) / 1000))
    : 10;
  const myWalls = serverState?.walls_left[String(myUserId)] ?? STARTING_WALLS;
  const opponentWalls = serverState?.walls_left[String(opponentUserId)] ?? STARTING_WALLS;
  const myTurn = phase === 'playing' && serverState?.turn_user_id === myUserId;
  const opponentTurn = phase === 'playing' && serverState?.turn_user_id === opponentUserId;

  const setDragWall = useCallback((value: DragWall | null) => {
    dragWallRef.current = value;
    setDragWallState(value);
  }, []);

  useEffect(() => {
    if (canAct) return;
    setDragWall(null);
    setPreview(null);
  }, [canAct, setDragWall]);

  const pointToSlot = useCallback(
    (clientX: number, clientY: number, orientation: Orientation): Preview | null => {
      const board = boardRef.current;
      if (!board) return null;
      const rect = board.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      if (x < P - 1 || x > P + N * S + 1 || y < P - 1 || y > P + N * S + 1) return null;

      let row: number;
      let col: number;
      if (orientation === 'h') {
        row = clamp(Math.round((y - P) / S) - 1, 0, N - 2);
        col = clamp(Math.floor((x - P) / S), 0, N - 2);
      } else {
        row = clamp(Math.floor((y - P) / S), 0, N - 2);
        col = clamp(Math.round((x - P) / S) - 1, 0, N - 2);
      }

      const candidate = { row, col, orientation, valid: false };
      return {
        ...candidate,
        valid: wallValid(candidate, viewWalls, myPosition, opponentPosition),
      };
    },
    [myPosition, opponentPosition, viewWalls],
  );

  const isInCancelZone = useCallback((_clientX: number, clientY: number) => {
    const board = boardRef.current;
    return board ? clientY >= board.getBoundingClientRect().bottom : false;
  }, []);

  const tryMove = useCallback(
    (row: number, col: number) => {
      if (!canAct || dragWallRef.current) return;
      const viewTarget = { row, col };
      if (!legalMoveKeys.has(posKey(viewTarget))) {
        if (!same(viewTarget, myPosition)) {
          haptic('error');
          setNotice('Можно ходить только на отмеченные точки');
        }
        return;
      }
      const serverTarget = rotated ? rotatePosition(viewTarget) : viewTarget;
      if (socketRef.current?.move(serverTarget.row, serverTarget.col)) {
        setActionPending(true);
        haptic('light');
      }
    },
    [canAct, legalMoveKeys, myPosition, rotated],
  );

  const placeWall = useCallback(
    (slot: Preview | null) => {
      if (!canAct || myWalls <= 0) return;
      if (!slot) {
        haptic('error');
        setNotice('Перетащи стену на поле');
        return;
      }
      if (!slot.valid) {
        haptic('error');
        setNotice('Тут нельзя поставить стену');
        return;
      }
      const serverSlot = toServerWallSlot(slot, rotated);
      if (socketRef.current?.placeWall(serverSlot.row, serverSlot.col, serverSlot.orientation)) {
        setActionPending(true);
        setPreview(null);
        haptic('medium');
      }
    },
    [canAct, myWalls, rotated],
  );

  const startWallDrag = (orientation: Orientation, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canAct) return;
    if (myWalls <= 0) {
      haptic('error');
      setNotice('Стены закончились');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
    haptic('light');
    setPreview(null);
    setDragWall({ orientation, x: event.clientX, y: event.clientY, overCancel: true });
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragWallRef.current;
      if (!drag || !canAct) return;
      event.preventDefault();
      const overCancel = isInCancelZone(event.clientX, event.clientY);
      const next = { ...drag, x: event.clientX, y: event.clientY, overCancel };
      dragWallRef.current = next;
      setDragWallState(next);
      const slotY = event.clientY - WALL_DRAG_Y_OFFSET_PX;
      setPreview(overCancel ? null : pointToSlot(event.clientX, slotY, drag.orientation));
    };

    const cancel = () => {
      if (!dragWallRef.current) return;
      setDragWall(null);
      setPreview(null);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragWallRef.current;
      if (!drag) return;
      event.preventDefault();
      const overCancel = isInCancelZone(event.clientX, event.clientY);
      const slotY = event.clientY - WALL_DRAG_Y_OFFSET_PX;
      const slot = overCancel ? null : pointToSlot(event.clientX, slotY, drag.orientation);
      setDragWall(null);
      setPreview(null);
      if (!overCancel) placeWall(slot);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [canAct, isInCancelZone, placeWall, pointToSlot, setDragWall]);

  const backToLobbies = useCallback(
    () => navigate('/game/grid_lock/lobbies', { replace: true }),
    [navigate],
  );

  if (!lobbyId) {
    return (
      <div className="grid h-full min-h-[480px] place-items-center p-5 text-center text-white">
        <div>
          <div className="gl-safe text-[20px] font-black uppercase">Матч не найден</div>
          <button type="button" onClick={backToLobbies} className="gl-safe mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black">
            К лобби
          </button>
        </div>
      </div>
    );
  }

  if ((connectionStatus === 'error' || connectionStatus === 'closed') && !serverState) {
    return (
      <div className="grid h-full min-h-[480px] place-items-center p-5 text-center text-white">
        <div>
          <div className="gl-safe text-[20px] font-black uppercase">Нет соединения</div>
          <div className="gl-safe mt-2 text-[9px] text-white/45">{socketError || 'WebSocket закрыт'}</div>
          <button type="button" onClick={backToLobbies} className="gl-safe mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black">
            К лобби
          </button>
        </div>
      </div>
    );
  }

  const winnerId = serverState?.winner_user_id || 0;
  const didWin = winnerId === myUserId;
  const isDraw = serverState?.draw === true || winnerId === 0;
  const winnerProfile = didWin ? myProfile : opponentProfile;
  const loserProfile = didWin ? opponentProfile : myProfile;

  return (
    <div className="gl-root relative flex h-full min-h-[480px] w-full select-none flex-col overflow-hidden bg-transparent text-white">
      <style>{`
        .gl-root { font-family:'Supercell','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif; touch-action:none; overscroll-behavior:none; }
        .gl-safe { line-height:1.45; padding-top:.12em; overflow:visible; }
        .gl-board { background:rgba(18,18,24,.66); border:1px solid rgba(255,255,255,.075); box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 16px 34px rgba(0,0,0,.25); touch-action:none; contain:layout paint size; }
        .gl-player { min-width:0; flex:1; display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.075); border-radius:20px; padding:8px 9px; background:rgba(255,255,255,.035); opacity:.68; transition:.18s ease; }
        .gl-player-rival { justify-content:flex-end; }
        .gl-player-active { opacity:1; transform:translateY(-1px); }
        .gl-player-mine.gl-player-active { border-color:rgba(47,140,255,.52); background:rgba(47,140,255,.11); box-shadow:0 8px 22px rgba(47,140,255,.08); }
        .gl-player-rival.gl-player-active { border-color:rgba(245,158,66,.52); background:rgba(245,158,66,.11); box-shadow:0 8px 22px rgba(245,158,66,.08); }
        .gl-avatar { width:36px; height:36px; flex:0 0 auto; display:grid; place-items:center; overflow:hidden; border-radius:14px; font-size:10px; font-weight:900; color:#fff; }
        .gl-avatar-mine { background:${COLORS.mine}; border:1px solid rgba(91,183,255,.72); }
        .gl-avatar-rival { background:${COLORS.rival}; border:1px solid rgba(255,180,92,.72); }
        .gl-turn { width:42px; height:42px; flex:0 0 auto; display:grid; place-items:center; border-radius:15px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); }
        .gl-turn-mine { color:#dbeafe; border-color:rgba(47,140,255,.38); background:rgba(47,140,255,.10); }
        .gl-turn-rival { color:#ffedd5; border-color:rgba(245,158,66,.38); background:rgba(245,158,66,.10); }
        .gl-pawn { transition:transform 210ms cubic-bezier(.22,.85,.25,1); transform-box:view-box; }
        .gl-pulse { animation:glPulse 1.8s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
        .gl-wall-button { width:74px; height:50px; display:grid; place-items:center; border-radius:17px; border:1px solid rgba(47,140,255,.34); background:rgba(47,140,255,.11); transition:transform .12s ease,opacity .12s ease,border-color .12s ease; touch-action:none; }
        .gl-wall-button:active:not(:disabled) { transform:scale(.97); }
        .gl-wall-button:disabled { opacity:.28; }
        .gl-wall-button-active { border-color:rgba(91,183,255,.72); }
        .gl-wall-icon { display:block; border-radius:999px; background:${COLORS.mine}; box-shadow:0 0 16px rgba(47,140,255,.3),inset 0 1px 0 rgba(255,255,255,.35); }
        .gl-wall-icon-h { width:34px; height:8px; }
        .gl-wall-icon-v { width:8px; height:34px; }
        .gl-notice { animation:glToast .15s ease-out both; background:rgba(9,9,13,.9); border:1px solid rgba(255,255,255,.09); box-shadow:0 10px 24px rgba(0,0,0,.28); }
        .gl-result-card { background:rgba(13,17,25,.97); border:1px solid rgba(255,255,255,.1); box-shadow:0 30px 100px rgba(0,0,0,.72); }
        @keyframes glPulse { 0%,100%{opacity:.10;transform:scale(1)} 50%{opacity:.22;transform:scale(1.18)} }
        @keyframes glToast { from{opacity:0;transform:translateY(8px) scale(.98)} to{opacity:1;transform:none} }
      `}</style>

      <header className="z-20 px-3 pt-[max(8px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-[480px] items-center gap-2">
          <PlayerHud profile={myProfile} walls={myWalls} active={myTurn} timeLeft={myTurn ? turnTimeLeft : 10} side="mine" />
          <div className={`gl-turn ${myTurn ? 'gl-turn-mine' : opponentTurn ? 'gl-turn-rival' : ''}`}>
            <span className="gl-safe text-[15px] font-black">{phase === 'match_over' ? '✓' : myTurn ? '↑' : opponentTurn ? '↓' : '•'}</span>
          </div>
          <PlayerHud profile={opponentProfile} walls={opponentWalls} active={opponentTurn} timeLeft={opponentTurn ? turnTimeLeft : 10} side="rival" />
        </div>
        <div className="mx-auto mt-2 flex max-w-[480px] justify-center">
          <div className="gl-safe rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.15em] text-white/42 backdrop-blur-md">
            {phase === 'playing' ? (myTurn ? 'Твой ход' : 'Ход соперника') : serverState?.message || 'Подключение'}
          </div>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2">
        <div ref={boardRef} className="gl-board relative aspect-square w-full max-w-[min(100%,calc(100vh-174px))] overflow-hidden rounded-[25px]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full touch-none">
            <defs>
              <linearGradient id="pawn-mine" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={COLORS.mineLight} /><stop offset="100%" stopColor={COLORS.mineDark} /></linearGradient>
              <linearGradient id="pawn-rival" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={COLORS.rivalLight} /><stop offset="100%" stopColor={COLORS.rivalDark} /></linearGradient>
              <linearGradient id="wall-mine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.mineLight} /><stop offset="100%" stopColor={COLORS.mine} /></linearGradient>
              <linearGradient id="wall-rival" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.rivalLight} /><stop offset="100%" stopColor={COLORS.rival} /></linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill="rgba(255,255,255,.008)" />
            <rect x={P} y={P} width={N * S} height={S} fill={COLORS.mine} opacity={0.055} />
            <rect x={P} y={P + S * (N - 1)} width={N * S} height={S} fill={COLORS.rival} opacity={0.055} />

            {cells.map((cell) => {
              const legal = legalMoveKeys.has(`${cell.row},${cell.col}`);
              return (
                <g key={`${cell.row}-${cell.col}`} onClick={() => tryMove(cell.row, cell.col)}>
                  <rect x={cell.x + CELL_GAP / 2} y={cell.y + CELL_GAP / 2} width={S - CELL_GAP} height={S - CELL_GAP} rx={1.65} fill="rgba(255,255,255,.036)" stroke="rgba(255,255,255,.065)" strokeWidth={0.22} />
                  {legal && !dragWall && <circle cx={cell.x + S / 2} cy={cell.y + S / 2} r={1.32} fill={COLORS.mine} opacity={0.96} pointerEvents="none" />}
                </g>
              );
            })}

            {viewWalls.map((wall) => {
              const rect = wallRect(wall);
              const mine = wall.user_id === myUserId;
              return (
                <g key={wall.id} pointerEvents="none">
                  <rect x={rect.x} y={rect.y + 0.48} width={rect.width} height={rect.height} rx={0.9} fill="rgba(0,0,0,.28)" />
                  <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={0.9} fill={`url(#wall-${mine ? 'mine' : 'rival'})`} stroke="rgba(255,255,255,.34)" strokeWidth={0.16} />
                </g>
              );
            })}

            {preview && (() => {
              const rect = wallRect(preview);
              return (
                <g pointerEvents="none">
                  <rect x={rect.x - 0.38} y={rect.y - 0.38} width={rect.width + 0.76} height={rect.height + 0.76} rx={1.1} fill="none" stroke={preview.valid ? 'rgba(255,255,255,.82)' : '#ffb4b4'} strokeWidth={0.42} />
                  <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={0.9} fill={preview.valid ? 'url(#wall-mine)' : COLORS.danger} opacity={preview.valid ? 0.98 : 0.78} />
                </g>
              );
            })()}

            <Pawn position={myPosition} mine active={myTurn} />
            <Pawn position={opponentPosition} mine={false} active={opponentTurn} />
          </svg>

          {notice && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <div className="gl-notice gl-safe rounded-2xl px-3 py-2 text-center text-[9px] font-black text-white/78">{notice}</div>
            </div>
          )}
        </div>
      </main>

      <footer className="z-20 px-3 pb-[max(8px,env(safe-area-inset-bottom))]">
        <div className={`mx-auto flex h-[58px] w-[166px] items-center justify-center gap-2 rounded-[22px] border p-1.5 ${dragWall?.overCancel ? 'border-red-400/55 bg-red-500/15' : 'border-white/[0.075] bg-[#121218]/75'}`}>
          <WallButton orientation="v" disabled={!canAct || myWalls <= 0} active={dragWall?.orientation === 'v'} onPointerDown={(event) => startWallDrag('v', event)} />
          <WallButton orientation="h" disabled={!canAct || myWalls <= 0} active={dragWall?.orientation === 'h'} onPointerDown={(event) => startWallDrag('h', event)} />
        </div>
      </footer>

      {phase === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/35 px-5 text-center backdrop-blur-[3px]">
          <div>
            <div className="gl-safe text-[20px] font-black uppercase">Ждём соперника</div>
            <div className="gl-safe mt-2 text-[8px] font-black uppercase tracking-[0.15em] text-white/40">Игра начнётся после подключения обоих игроков</div>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/25 backdrop-blur-[2px]">
          <div className="text-center">
            <div className="gl-safe min-h-[82px] overflow-visible px-4 pt-3 text-[60px] font-black text-white drop-shadow-[0_10px_30px_rgba(47,140,255,.35)]">{countdownLeft || 'GO'}</div>
            <div className="gl-safe mt-2 text-[9px] font-black uppercase tracking-[0.22em] text-white/48">Grid Lock</div>
          </div>
        </div>
      )}

      {phase === 'match_over' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/72 px-4 backdrop-blur-[6px]">
          <div className="gl-result-card relative w-full max-w-[342px] overflow-hidden rounded-[30px] px-5 pb-5 pt-6 text-center">
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-32 opacity-45 blur-2xl ${isDraw ? 'bg-white/10' : didWin ? 'bg-[#39E58C]/20' : 'bg-[#FF5D73]/20'}`} />
            <div className="relative">
              <div className="gl-safe text-[8px] font-black uppercase tracking-[0.22em] text-white/35">Grid Lock · Match result</div>
              <h2 className={`gl-safe mt-2 py-1 text-[27px] font-black uppercase tracking-[-0.04em] ${isDraw ? 'text-white' : didWin ? 'text-[#49E99A]' : 'text-[#FF667B]'}`}>
                {isDraw ? 'Ничья' : didWin ? 'Победа' : 'Поражение'}
              </h2>

              {!isDraw && (
                <div className="mt-5 grid grid-cols-[1.2fr_auto_.9fr] items-end gap-3">
                  <div className="min-w-0">
                    <div className="relative mx-auto w-fit">
                      <div className="absolute -inset-2 rounded-full bg-[#F7C85F]/15 blur-xl" />
                      <div className="relative grid h-[92px] w-[92px] place-items-center overflow-hidden rounded-full border-2 border-[#F7C85F]/70 bg-white/[.07] text-[20px] font-black uppercase text-white">
                        {winnerProfile.photoUrl ? <img src={winnerProfile.photoUrl} alt={winnerProfile.name} className="h-full w-full object-cover" draggable={false} /> : getInitials(winnerProfile.name)}
                      </div>
                    </div>
                    <div className="gl-safe mt-2 truncate px-1 text-[9px] font-black text-[#F7C85F]">{winnerProfile.name}</div>
                    <div className="gl-safe mt-1 text-[9px] font-black uppercase tracking-[.12em] text-white/36">первым дошёл до края</div>
                  </div>
                  <div className="gl-safe pb-9 text-[8px] font-black uppercase tracking-[.18em] text-white/22">VS</div>
                  <div className="min-w-0 pb-1">
                    <div className="mx-auto grid h-[64px] w-[64px] place-items-center overflow-hidden rounded-full border border-white/12 bg-white/[.045] text-[14px] font-black uppercase text-white/70">
                      {loserProfile.photoUrl ? <img src={loserProfile.photoUrl} alt={loserProfile.name} className="h-full w-full object-cover opacity-80" draggable={false} /> : getInitials(loserProfile.name)}
                    </div>
                    <div className="gl-safe mt-2 truncate px-1 text-[8px] font-black text-white/38">{loserProfile.name}</div>
                  </div>
                </div>
              )}

              <div className="my-5 h-px bg-white/[.07]" />
              <div className={`game-result-reward mx-auto flex w-fit items-center justify-center gap-2 rounded-full border px-4 py-2.5 ${didWin ? 'border-[#49E99A]/20 bg-[#49E99A]/10 text-[#49E99A]' : 'border-white/10 bg-white/[.05] text-white/55'}`}>
                <span className="gl-safe text-[20px] font-black tabular-nums">{didWin ? `+${formatReward(serverState?.winner_profit || 0)}` : '0'}</span>
                <img src={coinIcon} alt="GAME" className="h-6 w-6 object-contain" draggable={false} />
              </div>

              <button type="button" onClick={backToLobbies} className="mt-5 grid min-h-[58px] w-full grid-cols-[42px_1fr_42px] items-center rounded-[20px] border border-white/[.11] bg-[linear-gradient(180deg,rgba(255,255,255,.10)_0%,rgba(255,255,255,.045)_100%)] px-2.5 py-2.5 text-white active:scale-[.985]">
                <span className="grid h-[38px] w-[38px] place-items-center rounded-[13px] border border-white/[.10] bg-black/20 text-white/72"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></svg></span>
                <span className="gl-safe px-2 text-[10px] font-black uppercase tracking-[.14em]">К лобби</span>
                <span className="grid h-[38px] w-[38px] place-items-center text-white/30"><svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const GridLock = GridLockGame;
export const LegoBoardGame = GridLockGame;
export default GridLockGame;
