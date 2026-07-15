import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  airHockeyWsApi,
  type AirHockeyBody,
  type AirHockeySocketClient,
  type AirHockeyStateMessage,
} from '../api/airHockeyWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

const DEFAULT_BOARD = { width: 1, height: 1.72 };
const MAX_DPR = 1.5;
const INPUT_INTERVAL_MS = 50; // 20 сообщений в секунду.
const MAX_EXTRAPOLATION_SECONDS = 0.1;

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
  dragging: boolean;
};

type VisualState = {
  initialized: boolean;
  puck: AirHockeyBody;
  opponent: AirHockeyBody;
};

const emptyBody = (): AirHockeyBody => ({ x: 0.5, y: 0.86, vx: 0, vy: 0 });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (current: number, target: number, speed: number, dt: number) => {
  const factor = 1 - Math.exp(-speed * dt);
  return current + (target - current) * factor;
};

const transformToLocal = (
  body: AirHockeyBody,
  side: 0 | 1,
  boardWidth: number,
  boardHeight: number,
): AirHockeyBody => {
  if (side === 0) return body;

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

  const raw = window.sessionStorage.getItem('twingames_blackjack_players_info');
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

const Avatar = ({ player, fallback }: { player?: LobbyPlayerInfo; fallback: string }) => {
  const nickname = player?.tg_user || fallback;

  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-[10px] font-black text-white">
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
  const receivedAtRef = useRef(0);
  const sideRef = useRef<0 | 1>(0);
  const inputSeqRef = useRef(0);
  const inputDirtyRef = useRef(false);
  const lastGoalSeqRef = useRef(0);
  const matchHandledRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastFrameRef = useRef(0);

  const localPaddleRef = useRef<LocalPaddle>({
    x: DEFAULT_BOARD.width / 2,
    y: DEFAULT_BOARD.height - 0.16,
    dragging: false,
  });
  const visualRef = useRef<VisualState>({
    initialized: false,
    puck: emptyBody(),
    opponent: { x: 0.5, y: 0.16, vx: 0, vy: 0 },
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
        window.sessionStorage.setItem(
          'twingames_blackjack_players_info',
          JSON.stringify(playersInfo),
        );
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
            receivedAtRef.current = performance.now();
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
            }

            if (myPaddle && !localPaddleRef.current.dragging) {
              const local = transformToLocal(myPaddle, side, boardWidth, boardHeight);
              if (!visualRef.current.initialized) {
                localPaddleRef.current.x = local.x;
                localPaddleRef.current.y = local.y;
              }
            }

            if (!visualRef.current.initialized && opponentPaddle) {
              visualRef.current = {
                initialized: true,
                puck: transformToLocal(state.puck, side, boardWidth, boardHeight),
                opponent: transformToLocal(opponentPaddle, side, boardWidth, boardHeight),
              };
            }

            if (state.goal_seq > lastGoalSeqRef.current) {
              lastGoalSeqRef.current = state.goal_seq;
              const scoredByMe = state.goal_scorer_user_id === currentUserId;
              createGoalEffect(scoredByMe, scoredByMe ? '#ef4444' : '#3b82f6');
              trailRef.current = [];
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
        local.x,
        local.y,
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
      const dt = Math.min(0.033, (now - previous) / 1000);
      lastFrameRef.current = now;

      const { w, h } = sizeRef.current;
      const state = serverStateRef.current;
      const boardWidth = state?.board_width || DEFAULT_BOARD.width;
      const boardHeight = state?.board_height || DEFAULT_BOARD.height;
      const side = sideRef.current;
      const currentUserId = user?.id || state?.player_order?.[0] || 0;
      const opponentId = state?.player_order.find((id) => id !== currentUserId) || 0;
      const myServerPaddle = state?.paddles[String(currentUserId)];
      const opponentServerPaddle = state?.paddles[String(opponentId)];

      if (state && opponentServerPaddle) {
        const snapshotAge = Math.min(
          MAX_EXTRAPOLATION_SECONDS,
          Math.max(0, (now - receivedAtRef.current) / 1000),
        );
        const predictedPuck = state.phase === 'playing'
          ? {
              ...state.puck,
              x: state.puck.x + state.puck.vx * snapshotAge,
              y: state.puck.y + state.puck.vy * snapshotAge,
            }
          : state.puck;

        const targetPuck = transformToLocal(predictedPuck, side, boardWidth, boardHeight);
        const targetOpponent = transformToLocal(
          opponentServerPaddle,
          side,
          boardWidth,
          boardHeight,
        );

        if (!visualRef.current.initialized) {
          visualRef.current.initialized = true;
          visualRef.current.puck = targetPuck;
          visualRef.current.opponent = targetOpponent;
        } else {
          visualRef.current.puck.x = damp(visualRef.current.puck.x, targetPuck.x, 22, dt);
          visualRef.current.puck.y = damp(visualRef.current.puck.y, targetPuck.y, 22, dt);
          visualRef.current.puck.vx = targetPuck.vx;
          visualRef.current.puck.vy = targetPuck.vy;
          visualRef.current.opponent.x = damp(
            visualRef.current.opponent.x,
            targetOpponent.x,
            18,
            dt,
          );
          visualRef.current.opponent.y = damp(
            visualRef.current.opponent.y,
            targetOpponent.y,
            18,
            dt,
          );
        }
      }

      if (myServerPaddle && !localPaddleRef.current.dragging) {
        const targetMy = transformToLocal(myServerPaddle, side, boardWidth, boardHeight);
        localPaddleRef.current.x = damp(localPaddleRef.current.x, targetMy.x, 20, dt);
        localPaddleRef.current.y = damp(localPaddleRef.current.y, targetMy.y, 20, dt);
      }

      const puck = visualRef.current.puck;
      const opponent = visualRef.current.opponent;
      const myPaddle = localPaddleRef.current;
      const toX = (value: number) => (value / boardWidth) * w;
      const toY = (value: number) => (value / boardHeight) * h;
      const puckX = toX(puck.x);
      const puckY = toY(puck.y);
      const opponentX = toX(opponent.x);
      const opponentY = toY(opponent.y);
      const myX = toX(myPaddle.x);
      const myY = toY(myPaddle.y);
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
  }, [user?.id]);

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const state = serverStateRef.current;
    if (!rect || !state) return null;

    const boardWidth = state.board_width || DEFAULT_BOARD.width;
    const boardHeight = state.board_height || DEFAULT_BOARD.height;
    const paddleRadius = 0.07;

    const x = ((event.clientX - rect.left) / rect.width) * boardWidth;
    const y = ((event.clientY - rect.top) / rect.height) * boardHeight;

    return {
      x: clamp(x, paddleRadius, boardWidth - paddleRadius),
      y: clamp(y, boardHeight / 2 + paddleRadius, boardHeight - paddleRadius),
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
    const distance = Math.hypot(event.clientX - rect.left - paddleX, event.clientY - rect.top - paddleY);

    if (distance > paddlePx * 2.4) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    localPaddleRef.current.dragging = true;
    localPaddleRef.current.x = point.x;
    localPaddleRef.current.y = point.y;
    inputDirtyRef.current = true;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!localPaddleRef.current.dragging) return;

    const point = pointFromPointer(event);
    if (!point) return;

    localPaddleRef.current.x = point.x;
    localPaddleRef.current.y = point.y;
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
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-center px-3">
        <div className="flex w-full max-w-[420px] items-center justify-between rounded-[20px] border border-white/[0.08] bg-black/35 px-3 py-2 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar player={myPlayerInfo} fallback={user?.tg_user || 'Ты'} />
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[10px] font-black">
                {myPlayerInfo?.tg_user || user?.tg_user || 'Ты'}
              </div>
              <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-red-400/70">
                Ты
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-[22px] font-black tabular-nums tracking-[-0.08em]">
              <span className="text-red-400">{myScore}</span>
              <span className="mx-2 text-white/20">:</span>
              <span className="text-blue-400">{opponentScore}</span>
            </div>
            <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.17em] text-white/35">
              до {targetGoals} · {connectionStatus}
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[10px] font-black">
                {opponentPlayerInfo?.tg_user || 'Соперник'}
              </div>
              <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-blue-400/70">
                Враг
              </div>
            </div>
            <Avatar player={opponentPlayerInfo} fallback="VS" />
          </div>
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
