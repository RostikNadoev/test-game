import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  airHockeyWsApi,
  type AirHockeyBody,
  type AirHockeyPhase,
  type AirHockeySocketClient,
  type AirHockeyStateMessage,
} from '../api/airHockeyWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

const DEFAULT_BOARD = { width: 1, height: 1.72 };
const MAX_DPR = 1.5;
const INPUT_INTERVAL_MS = 33;
const INTERPOLATION_DELAY_MS = 72;
const MAX_EXTRAPOLATION_SECONDS = 0.045;
const SNAPSHOT_BUFFER_SIZE = 12;
const LOCAL_PADDLE_MAX_SPEED = 4.8;
const PADDLE_RADIUS = 0.07;
const PUCK_RADIUS = 0.035;
const VISUAL_COLLISION_SKIN = 0.003;
const VISUAL_PUCK_MAX_SPEED = 2.05;
const VISUAL_OVERRIDE_MS = 115;

const PLAYERS_STORAGE_KEY = 'twingames_air_hockey_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type TrailPoint = {
  x: number;
  y: number;
  life: number;
};

type LocalPaddle = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  dragging: boolean;
  initialized: boolean;
};

type NetworkSnapshot = {
  tick: number;
  receivedAt: number;
  phase: AirHockeyPhase;
  goalSeq: number;
  puck: AirHockeyBody;
  opponent: AirHockeyBody;
};

type NetworkVisual = {
  initialized: boolean;
  puck: AirHockeyBody;
  opponent: AirHockeyBody;
};

type VisualPuckOverride = {
  active: boolean;
  until: number;
  body: AirHockeyBody;
};

const emptyBody = (): AirHockeyBody => ({ x: 0.5, y: 0.86, vx: 0, vy: 0 });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const lerpBody = (from: AirHockeyBody, to: AirHockeyBody, amount: number): AirHockeyBody => ({
  x: lerp(from.x, to.x, amount),
  y: lerp(from.y, to.y, amount),
  vx: lerp(from.vx, to.vx, amount),
  vy: lerp(from.vy, to.vy, amount),
});

const extrapolateBody = (body: AirHockeyBody, seconds: number): AirHockeyBody => ({
  ...body,
  x: body.x + body.vx * seconds,
  y: body.y + body.vy * seconds,
});

const clampBodySpeed = (body: AirHockeyBody, maxSpeed: number): AirHockeyBody => {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed <= maxSpeed || speed === 0) return body;

  return {
    ...body,
    vx: (body.vx / speed) * maxSpeed,
    vy: (body.vy / speed) * maxSpeed,
  };
};

const transformToLocal = (
  body: AirHockeyBody,
  side: 0 | 1,
  boardWidth: number,
  boardHeight: number,
): AirHockeyBody => {
  if (side === 0) return { ...body };

  return {
    x: boardWidth - body.x,
    y: boardHeight - body.y,
    vx: -body.vx,
    vy: -body.vy,
  };
};

const transformToServer = (
  x: number,
  y: number,
  side: 0 | 1,
  boardWidth: number,
  boardHeight: number,
) => {
  if (side === 0) return { x, y };
  return { x: boardWidth - x, y: boardHeight - y };
};

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === 'undefined') return [];

  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LobbyPlayerInfo[]) : [];
  } catch {
    return [];
  }
};

const getInitials = (name: string) => {
  const clean = name.replace('@', '').trim();
  return clean.slice(0, 2).toUpperCase() || 'TG';
};

const sampleSnapshots = (
  snapshots: NetworkSnapshot[],
  now: number,
): { puck: AirHockeyBody; opponent: AirHockeyBody } | null => {
  if (snapshots.length === 0) return null;

  const renderAt = now - INTERPOLATION_DELAY_MS;

  while (snapshots.length > 2 && snapshots[1].receivedAt <= renderAt) {
    snapshots.shift();
  }

  const first = snapshots[0];
  const second = snapshots[1];

  if (second && first.receivedAt <= renderAt && renderAt <= second.receivedAt) {
    const span = Math.max(1, second.receivedAt - first.receivedAt);
    const amount = clamp((renderAt - first.receivedAt) / span, 0, 1);

    return {
      puck: lerpBody(first.puck, second.puck, amount),
      opponent: lerpBody(first.opponent, second.opponent, amount),
    };
  }

  const latest = snapshots[snapshots.length - 1];
  if (renderAt > latest.receivedAt && latest.phase === 'playing') {
    const seconds = clamp(
      (renderAt - latest.receivedAt) / 1000,
      0,
      MAX_EXTRAPOLATION_SECONDS,
    );

    return {
      puck: extrapolateBody(latest.puck, seconds),
      opponent: extrapolateBody(latest.opponent, seconds),
    };
  }

  return {
    puck: { ...first.puck },
    opponent: { ...first.opponent },
  };
};

const makeVisualPaddleCollision = (
  puck: AirHockeyBody,
  paddle: LocalPaddle,
): AirHockeyBody | null => {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const minDistance = PUCK_RADIUS + PADDLE_RADIUS;
  const distance = Math.hypot(dx, dy);

  if (distance >= minDistance) return null;

  let nx = 0;
  let ny = -1;
  if (distance > 0.000001) {
    nx = dx / distance;
    ny = dy / distance;
  } else {
    const relativeSpeed = Math.hypot(puck.vx - paddle.vx, puck.vy - paddle.vy);
    if (relativeSpeed > 0.000001) {
      nx = -(puck.vx - paddle.vx) / relativeSpeed;
      ny = -(puck.vy - paddle.vy) / relativeSpeed;
    }
  }

  const relativeVX = puck.vx - paddle.vx;
  const relativeVY = puck.vy - paddle.vy;
  const approach = relativeVX * nx + relativeVY * ny;

  let vx = puck.vx;
  let vy = puck.vy;

  if (approach < 0) {
    const reflectedVX = relativeVX - 1.96 * approach * nx;
    const reflectedVY = relativeVY - 1.96 * approach * ny;
    vx = reflectedVX + paddle.vx * 0.78;
    vy = reflectedVY + paddle.vy * 0.78;
  }

  return clampBodySpeed(
    {
      x: paddle.x + nx * (minDistance + VISUAL_COLLISION_SKIN),
      y: paddle.y + ny * (minDistance + VISUAL_COLLISION_SKIN),
      vx,
      vy,
    },
    VISUAL_PUCK_MAX_SPEED,
  );
};

const Avatar = ({
  player,
  fallback,
  className = '',
}: {
  player?: LobbyPlayerInfo;
  fallback: string;
  className?: string;
}) => {
  const nickname = player?.tg_user || fallback;

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.07] text-[9px] font-black text-white shadow-[0_0_18px_rgba(0,0,0,0.35)] ${className}`}
    >
      {player?.photo_url ? (
        <img
          src={player.photo_url}
          alt={nickname}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        getInitials(nickname)
      )}
    </div>
  );
};

export const AirHockeyGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const socketRef = useRef<AirHockeySocketClient | null>(null);
  const serverStateRef = useRef<AirHockeyStateMessage | null>(null);
  const sideRef = useRef<0 | 1>(0);
  const inputSeqRef = useRef(0);
  const inputDirtyRef = useRef(false);
  const lastGoalSeqRef = useRef(0);
  const matchHandledRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastFrameRef = useRef(0);
  const snapshotBufferRef = useRef<NetworkSnapshot[]>([]);
  const lastSnapshotPhaseRef = useRef<AirHockeyPhase | null>(null);

  const localPaddleRef = useRef<LocalPaddle>({
    x: DEFAULT_BOARD.width / 2,
    y: DEFAULT_BOARD.height - 0.16,
    targetX: DEFAULT_BOARD.width / 2,
    targetY: DEFAULT_BOARD.height - 0.16,
    vx: 0,
    vy: 0,
    dragging: false,
    initialized: false,
  });
  const networkVisualRef = useRef<NetworkVisual>({
    initialized: false,
    puck: emptyBody(),
    opponent: { x: 0.5, y: 0.16, vx: 0, vy: 0 },
  });
  const visualPuckOverrideRef = useRef<VisualPuckOverride>({
    active: false,
    until: 0,
    body: emptyBody(),
  });
  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<AirHockeyStateMessage | null>(null);

  const routeState = (location.state || {}) as LocationState;

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      window.sessionStorage.getItem('twingames_active_lobby_id') ||
      ''
    );
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(
    () => (routeState.playersInfo?.length ? routeState.playersInfo : readStoredPlayersInfo()),
    [routeState.playersInfo],
  );

  const playerOrder = serverState?.player_order || [];
  const myUserId = user?.id || playerOrder[0] || 0;
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;
  const myPlayerInfo = playersInfo.find((player) => player.id === myUserId);
  const opponentPlayerInfo = playersInfo.find((player) => player.id === opponentUserId);

  const myScore = myUserId ? serverState?.score?.[String(myUserId)] || 0 : 0;
  const opponentScore = opponentUserId
    ? serverState?.score?.[String(opponentUserId)] || 0
    : 0;
  const targetGoals = serverState?.target_goals || 3;
  const winnerUserId = serverState?.winner_user_id || 0;
  const isWinner = Boolean(winnerUserId && winnerUserId === myUserId);

  const createGoalEffect = useCallback((atTop: boolean, color: string) => {
    const { w, h } = sizeRef.current;
    const x = w / 2;
    const y = atTop ? 12 : h - 12;

    for (let index = 0; index < 28; index += 1) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        life: 1,
        color,
      });
    }
  }, []);

  useEffect(() => {
    if (!lobbyId || !token) return;

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('twingames_active_lobby_id', lobbyId);
      window.sessionStorage.setItem('twingames_active_game', 'air_hockey');
      if (playersInfo.length) {
        window.sessionStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(playersInfo));
      }
    }

    let alive = true;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const connect = () => {
      if (!alive) return;

      setConnectionStatus('connecting');
      setSocketError(null);

      const client = airHockeyWsApi.connect({
        lobbyId,
        token,
        handlers: {
          onOpen: () => {
            if (!alive) return;
            reconnectAttempt = 0;
            localPaddleRef.current.initialized = false;
            snapshotBufferRef.current = [];
            networkVisualRef.current.initialized = false;
            visualPuckOverrideRef.current.active = false;
            setConnectionStatus('open');
            client.requestState();
          },
          onClose: () => {
            if (!alive) return;
            setConnectionStatus('closed');

            if (serverStateRef.current?.phase === 'match_over') return;

            const delay = Math.min(4000, 500 * 2 ** reconnectAttempt);
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(connect, delay);
          },
          onSocketError: () => {
            if (!alive) return;
            setConnectionStatus('error');
            setSocketError('Ошибка подключения к игре');
          },
          onServerError: (error) => {
            if (!alive) return;
            setSocketError(error.details || error.error);
          },
          onState: (state) => {
            if (!alive) return;

            serverStateRef.current = state;
            setServerState(state);
            setSocketError(null);

            const currentUserId = user?.id || state.player_order[0] || 0;
            const side: 0 | 1 = state.player_order[1] === currentUserId ? 1 : 0;
            sideRef.current = side;

            const boardWidth = state.board_width || DEFAULT_BOARD.width;
            const boardHeight = state.board_height || DEFAULT_BOARD.height;
            const myPaddle = state.paddles[String(currentUserId)];
            const opponentId = state.player_order.find((id) => id !== currentUserId) || 0;
            const opponentPaddle = state.paddles[String(opponentId)];

            if (myPaddle) {
              inputSeqRef.current = Math.max(inputSeqRef.current, myPaddle.input_seq);
              const local = transformToLocal(myPaddle, side, boardWidth, boardHeight);

              if (!localPaddleRef.current.initialized) {
                localPaddleRef.current = {
                  x: local.x,
                  y: local.y,
                  targetX: local.x,
                  targetY: local.y,
                  vx: 0,
                  vy: 0,
                  dragging: false,
                  initialized: true,
                };
              }
            }

            if (opponentPaddle) {
              const receivedAt = performance.now();
              const snapshot: NetworkSnapshot = {
                tick: state.tick,
                receivedAt,
                phase: state.phase,
                goalSeq: state.goal_seq,
                puck: transformToLocal(state.puck, side, boardWidth, boardHeight),
                opponent: transformToLocal(opponentPaddle, side, boardWidth, boardHeight),
              };

              const phaseChanged = lastSnapshotPhaseRef.current !== state.phase;
              if (phaseChanged || state.phase !== 'playing') {
                snapshotBufferRef.current = [snapshot];
                networkVisualRef.current = {
                  initialized: true,
                  puck: { ...snapshot.puck },
                  opponent: { ...snapshot.opponent },
                };
                visualPuckOverrideRef.current.active = false;
              } else {
                const last = snapshotBufferRef.current.at(-1);
                if (!last || state.tick > last.tick || state.goal_seq !== last.goalSeq) {
                  snapshotBufferRef.current.push(snapshot);
                  if (snapshotBufferRef.current.length > SNAPSHOT_BUFFER_SIZE) {
                    snapshotBufferRef.current.shift();
                  }
                }
              }
              lastSnapshotPhaseRef.current = state.phase;
            }

            if (state.goal_seq > lastGoalSeqRef.current) {
              lastGoalSeqRef.current = state.goal_seq;
              const scoredByMe = state.goal_scorer_user_id === currentUserId;
              createGoalEffect(scoredByMe, scoredByMe ? '#ef4444' : '#3b82f6');
              trailRef.current = [];
              visualPuckOverrideRef.current.active = false;
            }
          },
        },
      });

      socketRef.current = client;
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [createGoalEffect, lobbyId, playersInfo, token, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!inputDirtyRef.current) return;

      const state = serverStateRef.current;
      const client = socketRef.current;
      if (!state || !client || state.phase !== 'playing') return;

      const boardWidth = state.board_width || DEFAULT_BOARD.width;
      const boardHeight = state.board_height || DEFAULT_BOARD.height;
      const local = localPaddleRef.current;
      const serverPoint = transformToServer(
        local.targetX,
        local.targetY,
        sideRef.current,
        boardWidth,
        boardHeight,
      );

      inputSeqRef.current += 1;
      if (client.sendInput(serverPoint.x, serverPoint.y, inputSeqRef.current)) {
        inputDirtyRef.current = false;
      }
    }, INPUT_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (serverState?.phase !== 'match_over' || matchHandledRef.current) return;

    matchHandledRef.current = true;
    const refreshTimer = window.setTimeout(() => {
      void refreshBalance();
      void refreshProfile();
    }, 600);
    const navigationTimer = window.setTimeout(() => {
      navigate('/game/air_hockey/lobbies', { replace: true });
    }, 3400);

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(navigationTimer);
    };
  }, [navigate, refreshBalance, refreshProfile, serverState?.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = container.clientWidth;
      const h = container.clientHeight;
      sizeRef.current = { w, h, dpr };

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawPaddle = (x: number, y: number, radius: number, fill: string) => {
      const glow = ctx.createRadialGradient(x, y, 5, x, y, radius + 16);
      glow.addColorStop(0, fill);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius + 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(x - radius * 0.28, y - radius * 0.28, radius * 0.27, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = (now: number) => {
      const previous = lastFrameRef.current || now;
      const dt = Math.min(0.033, Math.max(0.001, (now - previous) / 1000));
      lastFrameRef.current = now;

      const { w, h } = sizeRef.current;
      const state = serverStateRef.current;
      const boardWidth = state?.board_width || DEFAULT_BOARD.width;
      const boardHeight = state?.board_height || DEFAULT_BOARD.height;
      const localPaddle = localPaddleRef.current;

      const oldLocalX = localPaddle.x;
      const oldLocalY = localPaddle.y;
      const dx = localPaddle.targetX - localPaddle.x;
      const dy = localPaddle.targetY - localPaddle.y;
      const distance = Math.hypot(dx, dy);
      const maxMove = LOCAL_PADDLE_MAX_SPEED * dt;

      if (distance <= maxMove || distance === 0) {
        localPaddle.x = localPaddle.targetX;
        localPaddle.y = localPaddle.targetY;
      } else {
        localPaddle.x += (dx / distance) * maxMove;
        localPaddle.y += (dy / distance) * maxMove;
      }

      localPaddle.x = clamp(localPaddle.x, PADDLE_RADIUS, boardWidth - PADDLE_RADIUS);
      localPaddle.y = clamp(
        localPaddle.y,
        boardHeight / 2 + PADDLE_RADIUS,
        boardHeight - PADDLE_RADIUS,
      );
      localPaddle.vx = (localPaddle.x - oldLocalX) / dt;
      localPaddle.vy = (localPaddle.y - oldLocalY) / dt;

      const sampled = sampleSnapshots(snapshotBufferRef.current, now);
      if (sampled) {
        networkVisualRef.current = {
          initialized: true,
          puck: sampled.puck,
          opponent: sampled.opponent,
        };
      }

      let visualPuck = networkVisualRef.current.puck;
      const override = visualPuckOverrideRef.current;

      if (override.active) {
        override.body.x += override.body.vx * dt;
        override.body.y += override.body.vy * dt;
        const friction = Math.pow(0.994, dt * 60);
        override.body.vx *= friction;
        override.body.vy *= friction;

        const authoritativeDistance = Math.hypot(
          networkVisualRef.current.puck.x - localPaddle.x,
          networkVisualRef.current.puck.y - localPaddle.y,
        );
        const authoritativeMovingAway =
          (networkVisualRef.current.puck.x - localPaddle.x) *
              (networkVisualRef.current.puck.vx - localPaddle.vx) +
            (networkVisualRef.current.puck.y - localPaddle.y) *
              (networkVisualRef.current.puck.vy - localPaddle.vy) >
          0;

        if (
          now >= override.until ||
          (authoritativeDistance > (PUCK_RADIUS + PADDLE_RADIUS) * 1.18 &&
            authoritativeMovingAway)
        ) {
          override.active = false;
          visualPuck = networkVisualRef.current.puck;
        } else {
          visualPuck = override.body;
        }
      }

      if (!override.active && state?.phase === 'playing') {
        const collisionBody = makeVisualPaddleCollision(visualPuck, localPaddle);
        if (collisionBody) {
          override.active = true;
          override.until = now + VISUAL_OVERRIDE_MS;
          override.body = collisionBody;
          visualPuck = collisionBody;
        }
      }

      const opponent = networkVisualRef.current.opponent;
      const toX = (value: number) => (value / boardWidth) * w;
      const toY = (value: number) => (value / boardHeight) * h;
      const puckX = toX(visualPuck.x);
      const puckY = toY(visualPuck.y);
      const opponentX = toX(opponent.x);
      const opponentY = toY(opponent.y);
      const myX = toX(localPaddle.x);
      const myY = toY(localPaddle.y);
      const paddleRadius = clamp(w * 0.075, 24, 34);
      const puckRadius = clamp(w * 0.035, 12, 18);

      ctx.fillStyle = '#0A0A0F';
      ctx.fillRect(0, 0, w, h);

      const bgGlow = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, h * 0.72);
      bgGlow.addColorStop(0, 'rgba(255,255,255,0.03)');
      bgGlow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(44, w * 0.12), 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, 2.5);
      ctx.lineTo(w * 0.7, 2.5);
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h - 2.5);
      ctx.lineTo(w * 0.7, h - 2.5);
      ctx.stroke();

      if (state?.phase === 'playing') {
        trailRef.current.push({ x: puckX, y: puckY, life: 1 });
        if (trailRef.current.length > 12) trailRef.current.shift();
      }

      for (let index = 0; index < trailRef.current.length; index += 1) {
        const point = trailRef.current[index];
        const alpha = ((index + 1) / trailRef.current.length) * 0.22 * point.life;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 + index * 0.35, 0, Math.PI * 2);
        ctx.fill();
        point.life -= 0.08;
      }
      trailRef.current = trailRef.current.filter((point) => point.life > 0);

      const nextParticles: Particle[] = [];
      for (const particle of particlesRef.current) {
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 2.3, 0, Math.PI * 2);
        ctx.fill();

        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.97;
        particle.vy *= 0.97;
        particle.life -= 0.035;
        if (particle.life > 0) nextParticles.push(particle);
      }
      particlesRef.current = nextParticles;
      ctx.globalAlpha = 1;

      const puckGlow = ctx.createRadialGradient(
        puckX,
        puckY,
        2,
        puckX,
        puckY,
        puckRadius + 12,
      );
      puckGlow.addColorStop(0, 'rgba(255,255,255,1)');
      puckGlow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puckGlow;
      ctx.beginPath();
      ctx.arc(puckX, puckY, puckRadius + 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(puckX, puckY, puckRadius, 0, Math.PI * 2);
      ctx.fill();

      drawPaddle(opponentX, opponentY, paddleRadius, '#3b82f6');
      drawPaddle(myX, myY, paddleRadius, '#ef4444');

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const state = serverStateRef.current;
    if (!rect || !state) return null;

    const boardWidth = state.board_width || DEFAULT_BOARD.width;
    const boardHeight = state.board_height || DEFAULT_BOARD.height;
    const x = ((event.clientX - rect.left) / rect.width) * boardWidth;
    const y = ((event.clientY - rect.top) / rect.height) * boardHeight;

    return {
      x: clamp(x, PADDLE_RADIUS, boardWidth - PADDLE_RADIUS),
      y: clamp(y, boardHeight / 2 + PADDLE_RADIUS, boardHeight - PADDLE_RADIUS),
      boardWidth,
      boardHeight,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (serverStateRef.current?.phase !== 'playing') return;

    const point = pointFromPointer(event);
    if (!point) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const paddlePx = clamp(rect.width * 0.075, 24, 34);
    const paddleX = (localPaddleRef.current.x / point.boardWidth) * rect.width;
    const paddleY = (localPaddleRef.current.y / point.boardHeight) * rect.height;
    const distance = Math.hypot(
      event.clientX - rect.left - paddleX,
      event.clientY - rect.top - paddleY,
    );

    if (distance > paddlePx * 2.4) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    localPaddleRef.current.dragging = true;
    localPaddleRef.current.targetX = point.x;
    localPaddleRef.current.targetY = point.y;
    inputDirtyRef.current = true;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!localPaddleRef.current.dragging) return;

    const point = pointFromPointer(event);
    if (!point) return;

    localPaddleRef.current.targetX = point.x;
    localPaddleRef.current.targetY = point.y;
    inputDirtyRef.current = true;
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    localPaddleRef.current.dragging = false;
    inputDirtyRef.current = true;
  };

  if (!lobbyId) {
    return (
      <div className="grid h-full min-h-[440px] place-items-center bg-[#0A0A0F] p-6 text-center text-white">
        <div>
          <div className="text-2xl font-black">Нет lobby id</div>
          <div className="mt-2 text-sm text-white/40">Открывай аэрохоккей через комнату лобби.</div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="grid h-full min-h-[440px] place-items-center bg-[#0A0A0F] p-6 text-center text-white">
        <div>
          <div className="text-2xl font-black">Нет токена</div>
          <div className="mt-2 text-sm text-white/40">Для WebSocket нужна Telegram-авторизация.</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[440px] w-full touch-none select-none overflow-hidden bg-[#0A0A0F] text-white"
    >
      <div className="pointer-events-none absolute left-2 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center opacity-75 drop-shadow-[0_3px_14px_rgba(0,0,0,0.75)]">
        <Avatar
          player={opponentPlayerInfo}
          fallback="VS"
          className="h-8 w-8 border-blue-300/20"
        />
        <div className="mt-1 max-w-[56px] truncate text-[7px] font-black uppercase tracking-[0.11em] text-blue-200/55">
          {opponentPlayerInfo?.tg_user || 'Враг'}
        </div>
        <div className="mt-1 text-[29px] font-black leading-none tabular-nums text-blue-400/80">
          {opponentScore}
        </div>

        <div className="my-2 flex flex-col items-center gap-1">
          {Array.from({ length: Math.max(1, targetGoals) }).map((_, index) => (
            <span
              key={index}
              className={`h-1 w-1 rounded-full ${
                index < Math.max(myScore, opponentScore) ? 'bg-white/30' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="text-[29px] font-black leading-none tabular-nums text-red-400/85">
          {myScore}
        </div>
        <div className="mt-1 max-w-[56px] truncate text-[7px] font-black uppercase tracking-[0.11em] text-red-200/55">
          {myPlayerInfo?.tg_user || user?.tg_user || 'Ты'}
        </div>
        <Avatar
          player={myPlayerInfo}
          fallback={user?.tg_user || 'Ты'}
          className="mt-1 h-8 w-8 border-red-300/20"
        />

        <div className="mt-2 flex items-center gap-1 text-[6px] font-black uppercase tracking-[0.12em] text-white/25">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connectionStatus === 'open'
                ? 'bg-emerald-400/70'
                : connectionStatus === 'error'
                  ? 'bg-red-400/70'
                  : 'bg-white/25'
            }`}
          />
          до {targetGoals}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/game/air_hockey/lobbies')}
        className="absolute bottom-4 right-4 z-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[8px] font-black uppercase tracking-[0.16em] text-white/35 backdrop-blur"
      >
        Exit
      </button>

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="h-full w-full touch-none"
      />

      {(serverState?.phase === 'waiting' || connectionStatus !== 'open' || socketError) && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/35 p-5 backdrop-blur-[2px]">
          <div className="rounded-[24px] border border-white/10 bg-[#111118]/95 px-6 py-5 text-center shadow-2xl">
            <div className="text-lg font-black">
              {socketError
                ? 'Ошибка подключения'
                : connectionStatus !== 'open'
                  ? 'Подключение'
                  : 'Ждём соперника'}
            </div>
            <div className="mt-2 max-w-[260px] text-[11px] font-bold text-white/40">
              {socketError || serverState?.message || 'Игра начнётся, когда оба игрока подключатся.'}
            </div>
          </div>
        </div>
      )}

      {serverState?.phase === 'goal' && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <div className="animate-pulse text-[54px] font-black uppercase tracking-[-0.08em] text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.65)]">
            Гол
          </div>
        </div>
      )}

      {serverState?.phase === 'match_over' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/72 p-5 backdrop-blur-md">
          <div className="relative w-full max-w-[340px] overflow-hidden rounded-[30px] border border-white/10 bg-[#111118] p-6 text-center shadow-2xl">
            <div
              className={`pointer-events-none absolute inset-0 ${
                isWinner
                  ? 'bg-[radial-gradient(circle_at_50%_0%,rgba(239,68,68,0.28),transparent_62%)]'
                  : 'bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.25),transparent_62%)]'
              }`}
            />

            <div className="relative z-10">
              <div className="mx-auto w-fit rounded-full border border-white/10 p-1">
                <Avatar
                  player={isWinner ? myPlayerInfo : opponentPlayerInfo}
                  fallback={isWinner ? user?.tg_user || 'WIN' : 'VS'}
                  className="h-11 w-11"
                />
              </div>
              <div className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-white/35">
                Air Hockey
              </div>
              <div className="mt-2 text-[34px] font-black uppercase leading-none tracking-[-0.07em]">
                {isWinner ? 'Победа' : 'Поражение'}
              </div>
              <div className="mt-4 text-[24px] font-black tabular-nums">
                <span className="text-red-400">{myScore}</span>
                <span className="mx-3 text-white/20">:</span>
                <span className="text-blue-400">{opponentScore}</span>
              </div>
              <div className="mt-4 text-[11px] font-bold text-white/40">
                Лобби закрывается, баланс обновляется…
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};