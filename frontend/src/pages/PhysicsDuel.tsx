import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import upback from '../assets/upback.png';
import { useAuth } from '../auth/useAuth';
import {
  physicsDuelWsApi,
  type PhysicsDuelSocketClient,
  type PhysicsDuelStateMessage,
  type PhysicsDuelStep,
  type PhysicsDuelTrajectory,
} from '../api/physicsDuelWs';
import type { LobbyPlayerInfo } from '../api/types';
import { PremiumGameResultModal } from '../components/Game/PremiumGameResultModal';
import { getTelegramWebApp } from '../types/telegram';
import { calculateMatchWinnerProfit } from '../utils/matchEconomy';

/* ========================================================================== */
/* Physics Duel — online lockstep/replay version                              */
/*                                                                            */
/* The backend owns:                                                          */
/* - shared terrain                                                           */
/* - 3 second countdown                                                       */
/* - 5 second hidden move window                                              */
/* - authoritative physics simulation                                         */
/* - winner + lobby settlement                                                */
/*                                                                            */
/* The client owns only smooth rendering. During reveal it interpolates a     */
/* precomputed server trajectory on requestAnimationFrame, so ping cannot     */
/* make either cube stutter or desync.                                        */
/* ========================================================================== */

const TOTAL_TURNS = 10;
const PREP_TIME = 5;
const GRAVITY = 2100;

const DRAG_SCALE = 5.25;
const MIN_LAUNCH = 255;
const MAX_LAUNCH = 1120;
const MIN_PULL = 12;
const LAUNCH_ANGLE_MIN = (22 * Math.PI) / 180;
const LAUNCH_ANGLE_MAX = (76 * Math.PI) / 180;
const DEFAULT_ANGLE = (52 * Math.PI) / 180;
const DEFAULT_SPEED = 500;

const CUBE = 26;
const PX_PER_M = 42;
const DPR_CAP = 1.5;
const CAM_LERP = 6.5;
const PARALLAX = 0.1;

const clampN = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface LaunchMove {
  vx: number;
  vy: number;
  power: number;
}

interface VisualCube {
  x: number;
  y: number;
  angle: number;
}

type ViewPhase = 'waiting' | 'countdown' | 'select' | 'reveal' | 'result';
type Outcome = 'VICTORY' | 'DEFEAT' | 'DRAW' | null;
type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

const readLobbyId = (state: LocationState, search: string) => {
  if (state.lobbyId) return state.lobbyId;
  const query = new URLSearchParams(search);
  return (
    query.get('lobby_id') ||
    query.get('lobbyId') ||
    window.sessionStorage.getItem('twingames_active_lobby_id') ||
    ''
  );
};

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === 'undefined') return [];
  const raw =
    window.sessionStorage.getItem('twingames_players_info') ||
    window.sessionStorage.getItem('twingames_blackjack_players_info');
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is LobbyPlayerInfo => {
        if (!item || typeof item !== 'object') return false;
        const candidate = item as Partial<LobbyPlayerInfo>;
        return Number.isFinite(Number(candidate.id));
      })
      .map((item) => ({
        id: Number(item.id),
        tg_user: String(item.tg_user || `Player #${item.id}`),
        photo_url: String(item.photo_url || ''),
      }));
  } catch {
    return [];
  }
};

const initials = (name: string) => {
  const cleaned = name.replace(/^@/, '').trim();
  if (!cleaned) return 'TG';
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'TG';
};

const displayName = (value?: string) => value?.replace(/^@/, '').trim() || 'Player';

const defaultMove = (): LaunchMove => {
  const speed = DEFAULT_SPEED;
  return {
    vx: Math.cos(DEFAULT_ANGLE) * speed,
    vy: -Math.sin(DEFAULT_ANGLE) * speed,
    power: Math.round(((speed - MIN_LAUNCH) / (MAX_LAUNCH - MIN_LAUNCH)) * 100),
  };
};

const clampLaunch = (vxRaw: number, vyUpRaw: number): LaunchMove => {
  const direction = vxRaw < 0 ? -1 : 1;
  const vxAbs = Math.abs(vxRaw);
  const vyUp = Math.max(0, vyUpRaw);
  const speedRaw = Math.hypot(vxAbs, vyUp);
  if (speedRaw < 1) return defaultMove();

  const angle = clampN(
    Math.atan2(vyUp, Math.max(1, vxAbs)),
    LAUNCH_ANGLE_MIN,
    LAUNCH_ANGLE_MAX,
  );
  const speed = clampN(speedRaw, MIN_LAUNCH, MAX_LAUNCH);
  const power = Math.round(
    clampN((speed - MIN_LAUNCH) / (MAX_LAUNCH - MIN_LAUNCH), 0, 1) * 100,
  );

  return {
    vx: direction * Math.cos(angle) * speed,
    vy: -Math.sin(angle) * speed,
    power,
  };
};

const surfaceYAt = (step: PhysicsDuelStep, px: number) => {
  const clamped = Math.max(step.x0, Math.min(step.x1, px));
  return step.top_y + step.slope * (clamped - step.mid);
};

const stepIndexAt = (steps: PhysicsDuelStep[], px: number) => {
  if (!steps.length) return 0;
  if (px <= steps[0].x0) return 0;
  if (px >= steps[steps.length - 1].x1) return steps.length - 1;

  let lo = 0;
  let hi = steps.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const step = steps[mid];
    if (px < step.x0) hi = mid - 1;
    else if (px >= step.x1) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(steps.length - 1, lo));
};

const frameCube = (
  frame: number[],
  orderIndex: 0 | 1,
): VisualCube => {
  const offset = orderIndex === 0 ? 1 : 4;
  return {
    x: frame[offset] ?? 0,
    y: frame[offset + 1] ?? 0,
    angle: frame[offset + 2] ?? 0,
  };
};

const sampleTrajectory = (
  trajectory: PhysicsDuelTrajectory,
  serverNow: number,
  myOrderIndex: 0 | 1,
): { me: VisualCube; rival: VisualCube } | null => {
  const frames = trajectory.frames;
  if (!frames.length) return null;

  const t = clampN(serverNow - trajectory.start_at_ms, 0, trajectory.duration_ms);
  if (t <= frames[0][0]) {
    return {
      me: frameCube(frames[0], myOrderIndex),
      rival: frameCube(frames[0], myOrderIndex === 0 ? 1 : 0),
    };
  }

  const last = frames[frames.length - 1];
  if (t >= last[0]) {
    return {
      me: frameCube(last, myOrderIndex),
      rival: frameCube(last, myOrderIndex === 0 ? 1 : 0),
    };
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid][0] <= t) lo = mid;
    else hi = mid;
  }

  const left = frames[lo];
  const right = frames[hi];
  const span = Math.max(1, right[0] - left[0]);
  const alpha = clampN((t - left[0]) / span, 0, 1);
  const meA = frameCube(left, myOrderIndex);
  const meB = frameCube(right, myOrderIndex);
  const rivalA = frameCube(left, myOrderIndex === 0 ? 1 : 0);
  const rivalB = frameCube(right, myOrderIndex === 0 ? 1 : 0);

  return {
    me: {
      x: lerp(meA.x, meB.x, alpha),
      y: lerp(meA.y, meB.y, alpha),
      angle: lerp(meA.angle, meB.angle, alpha),
    },
    rival: {
      x: lerp(rivalA.x, rivalB.x, alpha),
      y: lerp(rivalA.y, rivalB.y, alpha),
      angle: lerp(rivalA.angle, rivalB.angle, alpha),
    },
  };
};

export interface PhysicsDuelProps {
  onExit?: () => void;
}

export const PhysicsDuel: React.FC<PhysicsDuelProps> = ({ onExit }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const routeState = (location.state || {}) as LocationState;
  const lobbyId = readLobbyId(routeState, location.search);
  const lobbiesPath = '/game/descent_duel/lobbies';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<PhysicsDuelSocketClient | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const uiAccumRef = useRef(0);
  const viewRef = useRef({ w: 360, h: 640, dpr: 1 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const vignetteRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<PhysicsDuelStep[]>([]);
  const serverStateRef = useRef<PhysicsDuelStateMessage | null>(null);
  const trajectoryRef = useRef<PhysicsDuelTrajectory | null>(null);
  const baseMeRef = useRef<VisualCube>({ x: 90, y: 520, angle: 0 });
  const baseRivalRef = useRef<VisualCube>({ x: 90, y: 520, angle: 0 });
  const visualMeRef = useRef<VisualCube>({ x: 90, y: 520, angle: 0 });
  const visualRivalRef = useRef<VisualCube>({ x: 90, y: 520, angle: 0 });
  const cameraRef = useRef({ x: 0, y: 0, initialized: false });
  const serverOffsetRef = useRef(0);
  const hasPreciseSyncRef = useRef(false);
  const lastRevisionRef = useRef(0);
  const lastSelectTurnRef = useRef(0);
  const finishHandledRef = useRef(false);

  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    curX: 0,
    curY: 0,
    move: null as LaunchMove | null,
  });

  const [phase, setPhase] = useState<ViewPhase>('waiting');
  const [turn, setTurn] = useState(1);
  const [totalTurns, setTotalTurns] = useState(TOTAL_TURNS);
  const [timeLeft, setTimeLeft] = useState(PREP_TIME);
  const [countdown, setCountdown] = useState(3);
  const [power, setPower] = useState(0);
  const [moveReady, setMoveReady] = useState(false);
  const [rivalMoveReady, setRivalMoveReady] = useState(false);
  const [playerM, setPlayerM] = useState(0);
  const [rivalM, setRivalM] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [playerOrder, setPlayerOrder] = useState<number[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const myUserId = user?.id || 0;

  const playersInfo = useMemo(() => {
    const routePlayers = routeState.playersInfo?.length ? routeState.playersInfo : readStoredPlayersInfo();
    const map = new Map<number, LobbyPlayerInfo>();
    for (const info of routePlayers) map.set(info.id, info);
    if (user?.id) {
      map.set(user.id, {
        id: user.id,
        tg_user: user.tg_user || `Player #${user.id}`,
        photo_url: user.photo_url || '',
      });
    }
    return map;
  }, [routeState.playersInfo, user]);

  const myMeta = playersInfo.get(myUserId) || {
    id: myUserId,
    tg_user: user?.tg_user || 'YOU',
    photo_url: user?.photo_url || '',
  };

  const rivalId = useMemo(
    () => playerOrder.find((id) => id !== myUserId) || 0,
    [myUserId, playerOrder],
  );

  const rivalMeta = playersInfo.get(rivalId) || {
    id: rivalId,
    tg_user: rivalId ? `Player #${rivalId}` : 'RIVAL',
    photo_url: '',
  };

  const estimatedServerNow = useCallback(
    () => Date.now() - serverOffsetRef.current,
    [],
  );

  const resetAim = useCallback(() => {
    const d = dragRef.current;
    d.active = false;
    d.move = null;
    setPower(0);
    setMoveReady(false);
  }, []);

  const computeDragMove = useCallback((): LaunchMove | null => {
    const d = dragRef.current;
    const pullX = d.startX - d.curX;
    const pullY = d.startY - d.curY;
    if (Math.hypot(pullX, pullY) < MIN_PULL) return null;
    return clampLaunch(pullX * DRAG_SCALE, -pullY * DRAG_SCALE);
  }, []);

  const applyPlayerPositions = useCallback(
    (state: PhysicsDuelStateMessage) => {
      if (!myUserId) return;
      const mine = state.players[String(myUserId)];
      const nextRivalId = state.player_order.find((id) => id !== myUserId) || 0;
      const rival = nextRivalId ? state.players[String(nextRivalId)] : undefined;

      if (mine) {
        baseMeRef.current = { x: mine.x, y: mine.y, angle: mine.angle };
        if (state.phase !== 'reveal') visualMeRef.current = { ...baseMeRef.current };
        setMoveReady(mine.move_ready);
      }
      if (rival) {
        baseRivalRef.current = { x: rival.x, y: rival.y, angle: rival.angle };
        if (state.phase !== 'reveal') visualRivalRef.current = { ...baseRivalRef.current };
        setRivalMoveReady(rival.move_ready);
      }
    },
    [myUserId],
  );

  useEffect(() => {
    if (!lobbyId || !token || !myUserId) return;

    setConnectionStatus('connecting');
    setSocketError(null);

    const client = physicsDuelWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => setConnectionStatus('closed'),
        onSocketError: () => {
          setConnectionStatus('error');
          setSocketError('Не удалось подключиться к матчу');
        },
        onServerError: (error) => {
          setSocketError(error.details || error.error);
          client.requestState();
        },
        onSync: (sync) => {
          const receivedAt = Date.now();
          const sampleOffset = receivedAt - sync.server_ms - sync.rtt_ms / 2;
          serverOffsetRef.current = hasPreciseSyncRef.current
            ? serverOffsetRef.current * 0.72 + sampleOffset * 0.28
            : sampleOffset;
          hasPreciseSyncRef.current = true;
          client.syncAck(sync.nonce);
        },
        onState: (state) => {
          if (state.revision <= lastRevisionRef.current) return;
          lastRevisionRef.current = state.revision;
          serverStateRef.current = state;
          setSocketError(null);

          if (!hasPreciseSyncRef.current && state.server_ms > 0) {
            serverOffsetRef.current = Date.now() - state.server_ms;
          }

          if (state.terrain?.length) terrainRef.current = state.terrain;
          if (state.trajectory?.frames.length) trajectoryRef.current = state.trajectory;
          else if (state.phase !== 'reveal') trajectoryRef.current = null;

          setPlayerOrder(state.player_order);
          setTurn(state.turn);
          setTotalTurns(state.total_turns || TOTAL_TURNS);
          applyPlayerPositions(state);

          if (state.phase === 'countdown') {
            setPhase('countdown');
          } else if (state.phase === 'select') {
            setPhase('select');
            if (lastSelectTurnRef.current !== state.turn) {
              lastSelectTurnRef.current = state.turn;
              resetAim();
              const mine = state.players[String(myUserId)];
              if (mine?.move_ready) setMoveReady(true);
            }
          } else if (state.phase === 'reveal') {
            setPhase('reveal');
            const trajectory = state.trajectory;
            if (trajectory?.frames.length) {
              const myIndex = state.player_order[0] === myUserId ? 0 : 1;
              const first = trajectory.frames[0];
              visualMeRef.current = frameCube(first, myIndex as 0 | 1);
              visualRivalRef.current = frameCube(first, (myIndex === 0 ? 1 : 0) as 0 | 1);
            }
          } else if (state.phase === 'match_over') {
            setPhase('result');
            if (!finishHandledRef.current) {
              finishHandledRef.current = true;
              const nextOutcome: Outcome =
                state.winner_user_id === undefined
                  ? 'DRAW'
                  : state.winner_user_id === myUserId
                    ? 'VICTORY'
                    : 'DEFEAT';
              setOutcome(nextOutcome);
              getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(
                nextOutcome === 'VICTORY'
                  ? 'success'
                  : nextOutcome === 'DEFEAT'
                    ? 'error'
                    : 'warning',
              );
              void refreshBalance();
              void refreshProfile();
            }
          } else {
            setPhase('waiting');
          }
        },
      },
    });

    socketRef.current = client;
    return () => {
      socketRef.current = null;
      client.close();
    };
  }, [
    applyPlayerPositions,
    lobbyId,
    myUserId,
    refreshBalance,
    refreshProfile,
    resetAim,
    token,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = serverStateRef.current;
      if (!state) return;
      const now = estimatedServerNow();

      if (state.phase === 'countdown') {
        const left = state.start_at_ms - now;
        if (left > 0) {
          setCountdown(Math.max(1, Math.ceil(left / 1000)));
          setPhase('countdown');
        } else {
          setPhase('select');
          setTimeLeft(Math.max(0, Math.ceil((state.select_deadline_ms - now) / 1000)));
        }
      } else if (state.phase === 'select') {
        setTimeLeft(Math.max(0, Math.ceil((state.select_deadline_ms - now) / 1000)));
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [estimatedServerNow]);

  const buildTextures = useCallback(() => {
    const view = viewRef.current;

    const grain = document.createElement('canvas');
    grain.width = 128;
    grain.height = 128;
    const grainCtx = grain.getContext('2d');
    if (grainCtx) {
      const image = grainCtx.createImageData(128, 128);
      for (let i = 0; i < image.data.length; i += 4) {
        const value = (Math.random() * 255) | 0;
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
      grainCtx.putImageData(image, 0, 0);
    }
    grainRef.current = grain;

    const vignette = document.createElement('canvas');
    vignette.width = Math.max(2, Math.floor(view.w));
    vignette.height = Math.max(2, Math.floor(view.h));
    const ctx = vignette.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(
        view.w / 2,
        view.h * 0.46,
        Math.min(view.w, view.h) * 0.2,
        view.w / 2,
        view.h * 0.5,
        Math.max(view.w, view.h) * 0.8,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.72, 'rgba(0,0,0,.24)');
      gradient.addColorStop(1, 'rgba(0,0,0,.68)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    vignetteRef.current = vignette;
  }, []);

  const renderStep = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      step: PhysicsDuelStep,
      camX: number,
      camY: number,
      viewH: number,
    ) => {
      const sx0 = step.x0 - camX;
      const sx1 = step.x1 - camX;
      const topL = step.top_y + step.slope * (step.x0 - step.mid) - camY;
      const topR = step.top_y + step.slope * (step.x1 - step.mid) - camY;
      const bottom = viewH + 60;
      const depthX = 9;
      const depthY = 7;

      ctx.fillStyle = '#1b1c1e';
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.lineTo(sx1, bottom);
      ctx.lineTo(sx0, bottom);
      ctx.closePath();
      ctx.fill();

      const front = ctx.createLinearGradient(0, Math.min(topL, topR), 0, bottom);
      front.addColorStop(0, 'rgba(70,72,76,.34)');
      front.addColorStop(0.25, 'rgba(0,0,0,0)');
      front.addColorStop(1, 'rgba(0,0,0,.44)');
      ctx.fillStyle = front;
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.lineTo(sx1, bottom);
      ctx.lineTo(sx0, bottom);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3a3d41';
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx0 + depthX, topL - depthY);
      ctx.lineTo(sx1 + depthX, topR - depthY);
      ctx.lineTo(sx1, topR);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#101113';
      ctx.beginPath();
      ctx.moveTo(sx1, topR);
      ctx.lineTo(sx1 + depthX, topR - depthY);
      ctx.lineTo(sx1 + depthX, bottom - depthY);
      ctx.lineTo(sx1, bottom);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(214,216,220,.72)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(150,153,158,.44)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx0 + depthX, topL - depthY);
      ctx.lineTo(sx1 + depthX, topR - depthY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,.22)';
      const width = sx1 - sx0;
      for (let i = 0; i < step.noise.length; i += 1) {
        const nx = sx0 + step.noise[i] * width;
        const ny = Math.min(topL, topR) + 10 + step.noise[i] * 46;
        ctx.fillRect(nx, ny, 2, 2);
      }
    },
    [],
  );

  const renderCube = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      cube: VisualCube,
      camX: number,
      camY: number,
      rival = false,
    ) => {
      const sx = cube.x - camX;
      const sy = cube.y - camY;
      const half = CUBE / 2;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(cube.angle);
      ctx.globalAlpha = rival ? 0.34 : 1;

      ctx.fillStyle = rival ? '#d8dbe1' : '#050506';
      ctx.fillRect(-half, -half, CUBE, CUBE);

      ctx.strokeStyle = rival ? 'rgba(255,255,255,.95)' : 'rgba(236,238,242,.9)';
      ctx.lineWidth = rival ? 1.1 : 1.4;
      ctx.strokeRect(-half, -half, CUBE, CUBE);

      ctx.strokeStyle = rival ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.48)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-half + 2, -half + 2);
      ctx.lineTo(half - 4, -half + 2);
      ctx.stroke();
      ctx.restore();
    },
    [],
  );

  const renderRivalArrow = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      rival: VisualCube,
      camX: number,
      camY: number,
      viewW: number,
      viewH: number,
    ) => {
      const sx = rival.x - camX;
      const sy = rival.y - camY;
      const edge = 34;
      const left = sx < edge;
      const right = sx > viewW - edge;
      if (!left && !right) return;

      const offBy = left ? edge - sx : sx - (viewW - edge);
      const t = clampN(offBy / (viewW * 0.95), 0, 1);
      const size = 28 - 14 * t;
      const alpha = 0.78 - 0.42 * t;
      const x = left ? edge : viewW - edge;
      const y = clampN(sy, 78, viewH - 92);
      const dir = left ? -1 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(235,237,241,.86)';
      ctx.beginPath();
      ctx.moveTo(x + dir * size * 0.65, y);
      ctx.lineTo(x - dir * size * 0.48, y - size * 0.55);
      ctx.lineTo(x - dir * size * 0.15, y);
      ctx.lineTo(x - dir * size * 0.48, y + size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    [],
  );

  const updateVisuals = useCallback(
    (dt: number) => {
      const state = serverStateRef.current;
      const terrain = terrainRef.current;
      if (!state || !terrain.length) return;

      const myIndex: 0 | 1 = state.player_order[0] === myUserId ? 0 : 1;
      if (state.phase === 'reveal' && trajectoryRef.current) {
        const sampled = sampleTrajectory(
          trajectoryRef.current,
          estimatedServerNow(),
          myIndex,
        );
        if (sampled) {
          visualMeRef.current = sampled.me;
          visualRivalRef.current = sampled.rival;
        }
      } else {
        visualMeRef.current = { ...baseMeRef.current };
        visualRivalRef.current = { ...baseRivalRef.current };
      }

      const view = viewRef.current;
      const me = visualMeRef.current;
      const rival = visualRivalRef.current;
      const camera = cameraRef.current;
      const separation = Math.abs(me.x - rival.x);
      const midX = (me.x + rival.x) / 2;

      let targetX = separation < view.w * 0.62
        ? midX - view.w / 2
        : me.x - view.w * 0.42;
      targetX = Math.max(-view.w * 0.2, targetX);

      const under = terrain[stepIndexAt(terrain, me.x)];
      const groundY = under ? surfaceYAt(under, me.x) : me.y + CUBE / 2;
      let targetY = groundY - CUBE / 2 - view.h * 0.67;
      const playerScreenY = me.y - targetY;
      if (playerScreenY < view.h * 0.1) targetY = me.y - view.h * 0.1;

      if (!camera.initialized) {
        camera.x = targetX;
        camera.y = targetY;
        camera.initialized = true;
      } else {
        const k = 1 - Math.exp(-CAM_LERP * Math.max(0, dt));
        camera.x += (targetX - camera.x) * k;
        camera.y += (targetY - camera.y) * k;
      }
    },
    [estimatedServerNow, myUserId],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const view = viewRef.current;
    const terrain = terrainRef.current;
    const me = visualMeRef.current;
    const rival = visualRivalRef.current;
    const cam = cameraRef.current;
    const { w, h, dpr } = view;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#0c0d0f');
    base.addColorStop(1, '#070708');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const image = imgRef.current;
    if (image && image.complete && image.naturalWidth > 0) {
      const aspect = image.naturalWidth / image.naturalHeight;
      const drawH = h * 1.06;
      const drawW = drawH * aspect;
      let startX = (-cam.x * PARALLAX) % drawW;
      if (startX > 0) startX -= drawW;
      ctx.globalAlpha = 0.85;
      for (let x = startX; x < w; x += drawW) {
        ctx.drawImage(image, x, -h * 0.03, drawW, drawH);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,8,10,.45)';
      ctx.fillRect(0, 0, w, h);
    }

    if (terrain.length) {
      const left = cam.x - 60;
      const right = cam.x + w + 60;
      let index = stepIndexAt(terrain, left);
      while (index > 0 && terrain[index].x1 > left) index -= 1;
      for (let i = index; i < terrain.length; i += 1) {
        const step = terrain[i];
        if (step.x0 > right) break;
        if (step.x1 < left) continue;
        renderStep(ctx, step, cam.x, cam.y, h);
      }
    }

    const fog = ctx.createLinearGradient(0, h * 0.55, 0, h);
    fog.addColorStop(0, 'rgba(120,124,130,0)');
    fog.addColorStop(0.7, 'rgba(96,100,107,.08)');
    fog.addColorStop(1, 'rgba(70,73,79,.2)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // Local cube first, translucent online rival second. At the shared spawn point
    // the rival is still visible as a soft ghost over the local cube.
    renderCube(ctx, me, cam.x, cam.y, false);
    renderCube(ctx, rival, cam.x, cam.y, true);

    const markerX = me.x - cam.x;
    const markerY = me.y - cam.y - CUBE - 6;
    ctx.fillStyle = 'rgba(236,238,242,.84)';
    ctx.beginPath();
    ctx.moveTo(markerX, markerY + 6);
    ctx.lineTo(markerX - 5, markerY);
    ctx.lineTo(markerX + 5, markerY);
    ctx.closePath();
    ctx.fill();

    if (phase === 'select') {
      const move = dragRef.current.move ?? defaultMove();
      const dim = !dragRef.current.move;
      const startY = me.y - CUBE / 2;
      ctx.fillStyle = 'rgba(236,238,242,.58)';
      for (let i = 1; i <= 10; i += 1) {
        const t = i * 0.045;
        const worldX = me.x + move.vx * t;
        const worldY = startY + move.vy * t + 0.5 * GRAVITY * t * t;
        if (i % 2 === 0) {
          ctx.globalAlpha = Math.max(0, (dim ? 0.28 : 0.62) - i * 0.022);
          ctx.beginPath();
          ctx.arc(worldX - cam.x, worldY - cam.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      const d = dragRef.current;
      if (d.active) {
        const cubeSX = me.x - cam.x;
        const cubeSY = me.y - cam.y;
        const hx = cubeSX + (d.curX - d.startX);
        const hy = cubeSY + (d.curY - d.startY);
        ctx.strokeStyle = 'rgba(236,238,242,.42)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cubeSX, cubeSY);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(236,238,242,.78)';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderRivalArrow(ctx, rival, cam.x, cam.y, w, h);

    const grain = grainRef.current;
    if (grain) {
      const pattern = ctx.createPattern(grain, 'repeat');
      if (pattern) {
        ctx.save();
        ctx.globalAlpha = 0.032;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    const vignette = vignetteRef.current;
    if (vignette) ctx.drawImage(vignette, 0, 0, w, h);
  }, [phase, renderCube, renderRivalArrow, renderStep]);

  const frameRef = useRef<(now: number) => void>(() => {});
  const frame = useCallback(
    (now: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      updateVisuals(dt);
      render();

      uiAccumRef.current += dt;
      if (uiAccumRef.current >= 0.1) {
        uiAccumRef.current = 0;
        const nextPlayer = Math.max(0, Math.round(visualMeRef.current.x / PX_PER_M));
        const nextRival = Math.max(0, Math.round(visualRivalRef.current.x / PX_PER_M));
        setPlayerM((value) => (value === nextPlayer ? value : nextPlayer));
        setRivalM((value) => (value === nextRival ? value : nextRival));
      }

      rafRef.current = requestAnimationFrame((time) => frameRef.current(time));
    },
    [render, updateVisuals],
  );

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    const image = new Image();
    image.src = upback;
    imgRef.current = image;

    const tg = getTelegramWebApp();
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      // ignore Telegram wrapper differences
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || window.innerWidth;
      let height = rect.height;
      if (!height || height < 60) {
        height = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      viewRef.current = { w: width, h: height, dpr };
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      cameraRef.current.initialized = false;
      buildTextures();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    const blockTouch = (event: TouchEvent) => event.preventDefault();
    container.addEventListener('touchmove', blockTouch, { passive: false });

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      container.removeEventListener('touchmove', blockTouch);
      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        // ignore
      }
    };
  }, [buildTextures, frame]);

  const localXY = useCallback((event: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }, []);

  const onAreaDown = useCallback(
    (event: React.PointerEvent) => {
      if (phase !== 'select' || connectionStatus !== 'open') return;
      const point = localXY(event);
      const d = dragRef.current;
      d.active = true;
      d.startX = point.x;
      d.startY = point.y;
      d.curX = point.x;
      d.curY = point.y;
      d.move = null;
      setPower(0);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [connectionStatus, localXY, phase],
  );

  const onAreaMove = useCallback(
    (event: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || phase !== 'select') return;
      const point = localXY(event);
      d.curX = point.x;
      d.curY = point.y;
      d.move = computeDragMove();
      setPower(d.move?.power ?? 0);
    },
    [computeDragMove, localXY, phase],
  );

  const onAreaUp = useCallback(
    (event: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || phase !== 'select') return;
      const point = localXY(event);
      d.curX = point.x;
      d.curY = point.y;
      const move = computeDragMove();
      d.active = false;

      if (!move) {
        d.move = null;
        setPower(0);
        return;
      }

      d.move = move;
      setPower(move.power);
      if (!socketRef.current?.sendMove(turn, move.vx, move.vy)) {
        setSocketError('Нет подключения к матчу');
        return;
      }

      setMoveReady(true);
      setSocketError(null);
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.('light');
    },
    [computeDragMove, localXY, phase, turn],
  );

  const leave = useCallback(() => {
    if (onExit) onExit();
    else navigate(lobbiesPath, { replace: true });
  }, [lobbiesPath, navigate, onExit]);

  const selectionProgress = clampN(timeLeft / PREP_TIME, 0, 1);

  if (!lobbyId || !token) {
    return (
      <div className="pd-root">
        <style>{STYLES}</style>
        <div className="pd-overlay">
          <div className="pd-modal-card">
            <div className="pd-modal-kicker">PHYSICS DUEL</div>
            <div className="pd-modal-title">Нет матча</div>
            <div className="pd-modal-copy">Открывай игру через активное лобби.</div>
            <button type="button" className="pd-modal-button" onClick={leave}>К ЛОББИ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="pd-root"
      onPointerDown={onAreaDown}
      onPointerMove={onAreaMove}
      onPointerUp={onAreaUp}
      onPointerCancel={onAreaUp}
    >
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="pd-canvas" />

      <div className="pd-hud-top">
        <PlayerHUD
          info={myMeta}
          distance={`${playerM}m`}
          side="left"
          online={connectionStatus === 'open'}
        />

        <div className="pd-turn-wrap">
          <div className="pd-turn-label">TURN</div>
          <div className="pd-turn-value">
            {String(turn).padStart(2, '0')} / {String(totalTurns).padStart(2, '0')}
          </div>
          {phase === 'select' && <div className="pd-turn-mini">{timeLeft}s</div>}
          {phase === 'reveal' && <div className="pd-turn-mini">IN MOTION</div>}
        </div>

        <PlayerHUD
          info={rivalMeta}
          distance={`${rivalM}m`}
          side="right"
          online={playerOrder.length === 2}
          ghost
        />
      </div>

      {phase === 'select' && (
        <div className="pd-prep">
          <div className="pd-prep-label">
            {moveReady ? 'ХОД ВЫБРАН' : 'ВЫБЕРИ БРОСОК'}
          </div>
          <div className="pd-prep-time">{timeLeft}</div>
          <div className="pd-prep-progress">
            <div
              className="pd-prep-progress-fill"
              style={{ width: `${selectionProgress * 100}%` }}
            />
          </div>
          <div className="pd-ready-row">
            <span className={moveReady ? 'is-ready' : ''}>YOU</span>
            <i />
            <span className={rivalMoveReady ? 'is-ready' : ''}>RIVAL</span>
          </div>
        </div>
      )}

      {(phase === 'select' || phase === 'reveal') && (
        <div className={`pd-launch-panel ${phase === 'reveal' ? 'pd-launch-panel-dim' : ''}`}>
          <div className="pd-launch-meta">
            <span>
              {phase === 'reveal'
                ? 'СИНХРОННЫЙ ПОЛЁТ'
                : moveReady
                  ? 'МОЖНО ИЗМЕНИТЬ ХОД'
                  : power > 0
                    ? 'POWER'
                    : 'PULL BACK TO AIM'}
            </span>
            <span>{phase === 'select' ? (power > 0 ? power : 'RELEASE TO LOCK') : ''}</span>
          </div>
          <div className="pd-power-track">
            <div className="pd-power-fill" style={{ width: `${power}%` }} />
          </div>
        </div>
      )}

      {phase === 'waiting' && (
        <div className="pd-overlay pd-overlay-soft">
          <div className="pd-wait-ring"><span /></div>
          <div className="pd-wait-title">СИНХРОНИЗАЦИЯ</div>
          <div className="pd-wait-copy">
            {connectionStatus === 'open' ? 'Ждём подключение соперника' : 'Подключаемся к матчу'}
          </div>
          {socketError && <div className="pd-error">{socketError}</div>}
        </div>
      )}

      {phase === 'countdown' && (
        <div className="pd-countdown-overlay">
          <div className="pd-countdown-kicker">PHYSICS DUEL</div>
          <div key={countdown} className="pd-countdown-number">{countdown}</div>
          <div className="pd-countdown-copy">ОБА СТАРТУЮТ ОДНОВРЕМЕННО</div>
        </div>
      )}

      {socketError && phase !== 'waiting' && phase !== 'result' && (
        <div className="pd-socket-toast">{socketError}</div>
      )}

      {phase === 'result' && outcome && (
        <PremiumGameResultModal
          gameTitle="Physics Duel"
          resultTitle={
            outcome === 'VICTORY'
              ? 'Победа'
              : outcome === 'DEFEAT'
                ? 'Поражение'
                : 'Ничья'
          }
          players={[
            {
              id: myMeta.id,
              name: displayName(myMeta.tg_user),
              photoUrl: myMeta.photo_url,
              score: `${playerM}m`,
            },
            {
              id: rivalMeta.id,
              name: displayName(rivalMeta.tg_user),
              photoUrl: rivalMeta.photo_url,
              score: `${rivalM}m`,
            },
          ]}
          winnerUserID={
            outcome === 'DRAW'
              ? undefined
              : outcome === 'VICTORY'
                ? myMeta.id
                : rivalMeta.id
          }
          draw={outcome === 'DRAW'}
          netResult={
            outcome === 'DRAW'
              ? 0
              : outcome === 'VICTORY'
                ? calculateMatchWinnerProfit(Number(window.sessionStorage.getItem('twingames_active_bet')) || 0)
                : -(Number(window.sessionStorage.getItem('twingames_active_bet')) || 0)
          }
          netLabel="Чистый результат"
          continueLabel="К лобби"
          onContinue={leave}
          theme={{ background: '#09090b', accent: '#d8d9dd', rival: '#858991' }}
        />
      )}
    </div>
  );
};

const PlayerHUD = ({
  info,
  distance,
  side,
  online,
  ghost = false,
}: {
  info: LobbyPlayerInfo;
  distance: string;
  side: 'left' | 'right';
  online: boolean;
  ghost?: boolean;
}) => {
  const name = displayName(info.tg_user);
  return (
    <div className={`pd-player-hud is-${side}`}>
      {side === 'right' && (
        <div className="pd-player-copy">
          <div className="pd-player-name">{name}</div>
          <div className="pd-player-distance">{distance}</div>
        </div>
      )}
      <div className={`pd-avatar ${ghost ? 'is-ghost' : ''}`}>
        {info.photo_url ? <img src={info.photo_url} alt="" /> : <span>{initials(name)}</span>}
        <i className={online ? 'is-online' : ''} />
      </div>
      {side === 'left' && (
        <div className="pd-player-copy">
          <div className="pd-player-name">{name}</div>
          <div className="pd-player-distance">{distance}</div>
        </div>
      )}
    </div>
  );
};

const STYLES = `
  .pd-root {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #070708;
    touch-action: none;
    overscroll-behavior: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    color: #e9ebef;
    font-family: ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace;
  }

  .pd-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .pd-hud-top {
    position: absolute;
    z-index: 10;
    top: 0;
    left: 0;
    right: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    padding: 10px 11px 22px;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(6,6,8,.76) 0%, rgba(6,6,8,0) 100%);
  }

  .pd-player-hud {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
  }

  .pd-player-hud.is-right {
    justify-content: flex-end;
    text-align: right;
  }

  .pd-avatar {
    position: relative;
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    place-items: center;
    overflow: visible;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 10px;
    background: rgba(255,255,255,.07);
    color: rgba(255,255,255,.86);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .06em;
  }

  .pd-avatar.is-ghost { opacity: .72; }

  .pd-avatar img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  .pd-avatar > i {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 7px;
    height: 7px;
    border: 2px solid #09090d;
    border-radius: 50%;
    background: #55585d;
  }

  .pd-avatar > i.is-online { background: #8fe0a4; }

  .pd-player-copy { min-width: 0; }

  .pd-player-name {
    max-width: 92px;
    overflow: hidden;
    color: rgba(255,255,255,.68);
    font-size: 9px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: .04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pd-player-distance {
    margin-top: 2px;
    color: #f0f1f4;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }

  .pd-turn-wrap {
    min-width: 72px;
    text-align: center;
  }

  .pd-turn-label {
    color: rgba(255,255,255,.4);
    font-size: 7px;
    font-weight: 800;
    line-height: 1.3;
    letter-spacing: .24em;
  }

  .pd-turn-value {
    margin-top: 1px;
    color: rgba(255,255,255,.9);
    font-size: 13px;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: .08em;
    font-variant-numeric: tabular-nums;
  }

  .pd-turn-mini {
    margin-top: 2px;
    color: rgba(255,255,255,.34);
    font-size: 6px;
    font-weight: 800;
    line-height: 1.3;
    letter-spacing: .16em;
  }

  .pd-prep {
    position: absolute;
    z-index: 10;
    top: 64px;
    left: 50%;
    width: 150px;
    transform: translateX(-50%);
    text-align: center;
    pointer-events: none;
  }

  .pd-prep-label {
    color: rgba(255,255,255,.45);
    font-size: 7px;
    font-weight: 800;
    line-height: 1.45;
    letter-spacing: .23em;
  }

  .pd-prep-time {
    margin-top: 1px;
    color: #f2f3f5;
    font-size: 30px;
    font-weight: 900;
    line-height: 1.18;
    font-variant-numeric: tabular-nums;
  }

  .pd-prep-progress {
    height: 3px;
    margin: 4px auto 0;
    overflow: hidden;
    border-radius: 99px;
    background: rgba(255,255,255,.1);
  }

  .pd-prep-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: rgba(236,238,242,.82);
    transition: width .08s linear;
  }

  .pd-ready-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 6px;
    color: rgba(255,255,255,.25);
    font-size: 6px;
    font-weight: 900;
    letter-spacing: .13em;
  }

  .pd-ready-row i {
    width: 12px;
    height: 1px;
    background: rgba(255,255,255,.12);
  }

  .pd-ready-row .is-ready { color: rgba(255,255,255,.74); }

  .pd-launch-panel {
    position: absolute;
    z-index: 9;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 12px 16px calc(18px + env(safe-area-inset-bottom));
    pointer-events: none;
    background: linear-gradient(0deg, rgba(6,6,8,.84) 0%, rgba(6,6,8,0) 100%);
    transition: opacity .2s ease;
  }

  .pd-launch-panel-dim { opacity: .42; }

  .pd-launch-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    color: rgba(255,255,255,.48);
    font-size: 8px;
    font-weight: 800;
    line-height: 1.35;
    letter-spacing: .17em;
  }

  .pd-power-track {
    height: 7px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 99px;
    background: rgba(255,255,255,.06);
  }

  .pd-power-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(120,123,128,.5), rgba(236,238,242,.78));
    transition: width .04s linear;
  }

  .pd-overlay,
  .pd-countdown-overlay,
  .pd-result-overlay {
    position: absolute;
    z-index: 30;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    background: radial-gradient(110% 100% at 50% 42%, rgba(10,10,12,.55), rgba(6,6,8,.9));
    backdrop-filter: blur(2px);
  }

  .pd-overlay-soft { background: rgba(7,7,8,.58); }

  .pd-wait-ring {
    position: relative;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 50%;
  }

  .pd-wait-ring span {
    position: absolute;
    inset: -1px;
    border: 1px solid transparent;
    border-top-color: rgba(255,255,255,.72);
    border-radius: 50%;
    animation: pdSpin .9s linear infinite;
  }

  .pd-wait-title {
    margin-top: 14px;
    color: rgba(255,255,255,.86);
    font-size: 11px;
    font-weight: 900;
    line-height: 1.35;
    letter-spacing: .22em;
  }

  .pd-wait-copy {
    margin-top: 6px;
    color: rgba(255,255,255,.36);
    font-size: 8px;
    font-weight: 700;
    line-height: 1.5;
    letter-spacing: .08em;
  }

  .pd-error,
  .pd-socket-toast {
    border: 1px solid rgba(255,122,144,.18);
    background: rgba(255,122,144,.08);
    color: rgba(255,187,198,.9);
  }

  .pd-error {
    margin-top: 12px;
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 8px;
  }

  .pd-socket-toast {
    position: absolute;
    z-index: 24;
    top: 118px;
    left: 50%;
    max-width: calc(100% - 32px);
    transform: translateX(-50%);
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 8px;
    text-align: center;
  }

  .pd-countdown-overlay {
    background: radial-gradient(circle at 50% 50%, rgba(25,26,29,.48), rgba(7,7,8,.83));
  }

  .pd-countdown-kicker {
    color: rgba(255,255,255,.36);
    font-size: 8px;
    font-weight: 900;
    line-height: 1.4;
    letter-spacing: .28em;
  }

  .pd-countdown-number {
    margin-top: 7px;
    color: #eef0f3;
    font-size: clamp(74px, 25vw, 104px);
    font-weight: 900;
    line-height: 1.04;
    letter-spacing: -.08em;
    animation: pdCount .42s cubic-bezier(.22,1,.36,1) both;
  }

  .pd-countdown-copy {
    margin-top: 8px;
    color: rgba(255,255,255,.34);
    font-size: 7px;
    font-weight: 800;
    line-height: 1.5;
    letter-spacing: .2em;
  }

  .pd-result-overlay {
    position: fixed;
    z-index: 9999;
    background: rgba(5,5,7,.72);
    backdrop-filter: blur(6px);
  }

  .pd-result-card,
  .pd-modal-card {
    width: min(100%, 316px);
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 22px;
    padding: 18px;
    background: linear-gradient(180deg, rgba(31,32,36,.96), rgba(13,13,16,.98));
    box-shadow: 0 22px 60px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07);
  }

  .pd-result-kicker,
  .pd-modal-kicker {
    color: rgba(255,255,255,.34);
    font-size: 7px;
    font-weight: 900;
    line-height: 1.5;
    letter-spacing: .22em;
  }

  .pd-result-title,
  .pd-modal-title {
    margin-top: 7px;
    color: #eff0f2;
    font-size: 26px;
    font-weight: 900;
    line-height: 1.24;
    letter-spacing: -.04em;
  }

  .pd-result-title.is-loss { color: #9b9da2; }
  .pd-result-title.is-draw { color: #c8cace; }

  .pd-modal-copy {
    margin: 7px auto 0;
    max-width: 230px;
    color: rgba(255,255,255,.38);
    font-size: 9px;
    line-height: 1.55;
  }

  .pd-result-players {
    margin-top: 16px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 15px;
    background: rgba(0,0,0,.18);
  }

  .pd-result-player {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 9px 10px;
    text-align: left;
  }

  .pd-result-player.is-muted { opacity: .5; }

  .pd-result-avatar {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 10px;
    background: rgba(255,255,255,.06);
    font-size: 9px;
    font-weight: 900;
  }

  .pd-result-player.is-winner .pd-result-avatar {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-color: rgba(255,255,255,.28);
  }

  .pd-result-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pd-result-player-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .pd-result-player-copy strong {
    overflow: hidden;
    color: rgba(255,255,255,.8);
    font-size: 10px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pd-result-player-copy span {
    color: rgba(255,255,255,.88);
    font-size: 14px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .pd-result-line {
    height: 1px;
    margin: 0 10px;
    background: rgba(255,255,255,.06);
  }

  .pd-modal-button {
    width: 100%;
    min-height: 42px;
    margin-top: 14px;
    border: 0;
    border-radius: 12px;
    background: #eceef2;
    color: #0a0a0b;
    font: inherit;
    font-size: 9px;
    font-weight: 900;
    line-height: 1.35;
    letter-spacing: .14em;
    cursor: pointer;
  }

  @keyframes pdSpin { to { transform: rotate(360deg); } }
  @keyframes pdCount {
    0% { opacity: 0; transform: scale(.72); }
    100% { opacity: 1; transform: scale(1); }
  }

  @media (max-width: 370px) {
    .pd-hud-top { padding-inline: 8px; }
    .pd-avatar { width: 29px; height: 29px; flex-basis: 29px; }
    .pd-player-name { max-width: 72px; font-size: 8px; }
    .pd-player-distance { font-size: 14px; }
    .pd-turn-wrap { min-width: 64px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pd-countdown-number,
    .pd-wait-ring span { animation: none; }
  }
`;

export default PhysicsDuel;
