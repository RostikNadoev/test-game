import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  discFootballWsApi,
  type DiscFootballBody,
  type DiscFootballPhase,
  type DiscFootballPlan,
  type DiscFootballSocketClient,
  type DiscFootballStateMessage,
} from '../api/discFootballWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { PremiumGameResultModal } from '../components/Game/PremiumGameResultModal';

type Team = 'home' | 'away';
type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

type FieldGeometry = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  goalWidth: number;
  goalLeft: number;
  goalRight: number;
  goalDepth: number;
};

type Snapshot = {
  tick: number;
  receivedAt: number;
  phase: DiscFootballPhase;
  bodies: DiscFootballBody[];
};

type DragState = {
  active: boolean;
  pointerId: number | null;
  discIndex: number | null;
  pointerX: number;
  pointerY: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
};

type PlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

const DEFAULT_BOARD = {
  width: 1,
  height: 1.68,
};

const MAX_DPR = 1.7;
const INTERPOLATION_DELAY_MS = 70;
const MAX_EXTRAPOLATION_SECONDS = 0.045;
const SNAPSHOT_BUFFER_SIZE = 14;
const MAX_AIM_WORLD = 0.35;
const MIN_AIM_WORLD = 0.032;

const PLAYERS_STORAGE_KEY = 'twingames_disc_football_players_info';
const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const vectorLength = (x: number, y: number) => Math.hypot(x, y);

const getInitials = (value: string) =>
  value
    .replace('@', '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG';

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

const triggerHaptic = (
  type: 'light' | 'medium' | 'heavy' | 'success' | 'error',
) => {
  const webApp = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
            notificationOccurred?: (kind: 'success' | 'error') => void;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  if (type === 'success' || type === 'error') {
    webApp?.HapticFeedback?.notificationOccurred?.(type);
    return;
  }

  webApp?.HapticFeedback?.impactOccurred?.(type);
};

const transformBodyToLocal = (
  body: DiscFootballBody,
  side: 0 | 1,
  boardWidth: number,
  boardHeight: number,
): DiscFootballBody => {
  if (side === 0) return { ...body };

  return {
    ...body,
    x: boardWidth - body.x,
    y: boardHeight - body.y,
    vx: -body.vx,
    vy: -body.vy,
    rotation: body.rotation + Math.PI,
  };
};

const transformPlanToLocal = (
  plan: DiscFootballPlan,
  side: 0 | 1,
): DiscFootballPlan => {
  if (side === 0) return { ...plan };

  return {
    ...plan,
    dx: -plan.dx,
    dy: -plan.dy,
  };
};

const transformPlanToServer = (
  plan: DiscFootballPlan,
  side: 0 | 1,
): DiscFootballPlan => {
  if (side === 0) return { ...plan };

  return {
    ...plan,
    dx: -plan.dx,
    dy: -plan.dy,
  };
};

const interpolateBodies = (
  from: DiscFootballBody[],
  to: DiscFootballBody[],
  amount: number,
) => {
  const fromById = new Map(from.map((body) => [body.id, body]));

  return to.map((body) => {
    const previous = fromById.get(body.id);
    if (!previous) return { ...body };

    return {
      ...body,
      x: lerp(previous.x, body.x, amount),
      y: lerp(previous.y, body.y, amount),
      vx: lerp(previous.vx, body.vx, amount),
      vy: lerp(previous.vy, body.vy, amount),
      rotation: lerp(previous.rotation, body.rotation, amount),
    };
  });
};

const extrapolateBodies = (bodies: DiscFootballBody[], seconds: number) =>
  bodies.map((body) => ({
    ...body,
    x: body.x + body.vx * seconds,
    y: body.y + body.vy * seconds,
    rotation:
      body.rotation +
      (body.vx / Math.max(body.radius, 0.001)) * seconds * 0.3 +
      (body.vy / Math.max(body.radius, 0.001)) * seconds * 0.11,
  }));

const sampleSnapshots = (snapshots: Snapshot[], now: number) => {
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
    return interpolateBodies(first.bodies, second.bodies, amount);
  }

  const latest = snapshots[snapshots.length - 1];

  if (renderAt > latest.receivedAt && latest.phase === 'resolving') {
    const seconds = clamp(
      (renderAt - latest.receivedAt) / 1000,
      0,
      MAX_EXTRAPOLATION_SECONDS,
    );

    return extrapolateBodies(latest.bodies, seconds);
  }

  return first.bodies.map((body) => ({ ...body }));
};

const PlayerAvatar = ({
  profile,
  side,
}: {
  profile: PlayerProfile;
  side: Team;
}) => (
  <div
    className={[
      'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]',
      side === 'home'
        ? 'border-[#52FFE5]/45 bg-[#52FFE5]/10'
        : 'border-[#FF7A90]/45 bg-[#FF7A90]/10',
    ].join(' ')}
  >
    {profile.photoUrl ? (
      <img
        src={profile.photoUrl}
        alt={profile.name}
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : (
      getInitials(profile.name)
    )}
  </div>
);

const ConnectionNotice = ({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) => (
  <div className="relative grid h-full min-h-[520px] w-full place-items-center overflow-hidden bg-transparent p-5 text-center text-white">
    <div className="w-full max-w-[340px] rounded-[28px] border border-white/[0.09] bg-[#0b1110]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#52FFE5]/50">
        Disc Football
      </div>

      <div className="mt-3 text-[22px] font-black uppercase leading-none text-white">
        {title}
      </div>

      <div className="mt-3 text-[11px] font-bold leading-relaxed text-white/42">
        {subtitle}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-[9px] font-black uppercase tracking-[0.14em] text-black active:scale-[0.98]"
      >
        К лобби
      </button>
    </div>
  </div>
);

export const DiscFootballGame = () => {
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
    const map = new Map<number, PlayerProfile>();

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const socketRef = useRef<DiscFootballSocketClient | null>(null);
  const stateRef = useRef<DiscFootballStateMessage | null>(null);
  const sideRef = useRef<0 | 1>(0);
  const snapshotsRef = useRef<Snapshot[]>([]);
  const renderBodiesRef = useRef<DiscFootballBody[]>([]);
  const localPlansRef = useRef<Map<number, DiscFootballPlan>>(new Map());
  const avatarImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const goalSignalRef = useRef(0);
  const lastGoalSeqRef = useRef(0);
  const previousRoundRef = useRef(0);
  const previousPhaseRef = useRef<DiscFootballPhase | null>(null);
  const serverOffsetRef = useRef(0);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<DiscFootballStateMessage | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showIntroHint, setShowIntroHint] = useState(true);

  const lobbiesPath = '/game/disc_football/lobbies';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'disc_football');
    }

    if (playersInfo.length) {
      window.sessionStorage.setItem(
        PLAYERS_STORAGE_KEY,
        JSON.stringify(playersInfo),
      );
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

    const client = discFootballWsApi.connect({
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
          if (!alive) return;

          const playerIndex = state.player_order.indexOf(myUserId);
          const side: 0 | 1 = playerIndex === 1 ? 1 : 0;

          sideRef.current = side;
          serverOffsetRef.current = Date.now() - state.server_ms;

          const transformedBodies = state.bodies.map((body) =>
            transformBodyToLocal(
              body,
              side,
              state.board_width,
              state.board_height,
            ),
          );

          if (state.phase === 'resolving') {
            const snapshots = snapshotsRef.current;
            const previous = snapshots[snapshots.length - 1];

            if (!previous || previous.tick !== state.tick) {
              snapshots.push({
                tick: state.tick,
                receivedAt: performance.now(),
                phase: state.phase,
                bodies: transformedBodies,
              });

              if (snapshots.length > SNAPSHOT_BUFFER_SIZE) {
                snapshots.splice(0, snapshots.length - SNAPSHOT_BUFFER_SIZE);
              }
            }
          } else {
            snapshotsRef.current = [];
            renderBodiesRef.current = transformedBodies;
          }

          if (
            state.phase === 'planning' &&
            (previousRoundRef.current !== state.round ||
              previousPhaseRef.current !== 'planning')
          ) {
            localPlansRef.current.clear();
          }

          if (state.goal_seq > lastGoalSeqRef.current) {
            lastGoalSeqRef.current = state.goal_seq;
            goalSignalRef.current = state.goal_seq;

            triggerHaptic(
              state.goal_scorer_user_id === myUserId ? 'success' : 'error',
            );
          }

          if (
            state.phase === 'reveal' &&
            previousPhaseRef.current !== 'reveal'
          ) {
            triggerHaptic('medium');
          }

          previousRoundRef.current = state.round;
          previousPhaseRef.current = state.phase;
          stateRef.current = state;

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

  const playerOrder = serverState?.player_order || [];
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;

  const homeProfile: PlayerProfile =
    profileById.get(myUserId) || {
      id: myUserId,
      name: user?.tg_user || 'Player',
      photoUrl: user?.photo_url || '',
    };

  const awayProfile: PlayerProfile =
    profileById.get(opponentUserId) || {
      id: opponentUserId,
      name: opponentUserId ? `Player ${opponentUserId}` : 'Opponent',
      photoUrl: '',
    };

  useEffect(() => {
    const images = new Map<number, HTMLImageElement>();
    const profiles = [homeProfile, awayProfile];

    avatarImagesRef.current = images;

    for (const profile of profiles) {
      if (!profile.id || !profile.photoUrl || images.has(profile.id)) continue;

      const image = new Image();

      image.decoding = 'async';
      image.src = profile.photoUrl;

      images.set(profile.id, image);
    }

    return () => {
      for (const image of images.values()) {
        image.onload = null;
        image.onerror = null;
      }

      if (avatarImagesRef.current === images) {
        avatarImagesRef.current = new Map();
      }
    };
  }, [
    awayProfile.id,
    awayProfile.photoUrl,
    homeProfile.id,
    homeProfile.photoUrl,
  ]);

  const homeScore = serverState?.score[String(myUserId)] || 0;
  const awayScore = serverState?.score[String(opponentUserId)] || 0;
  const winnerUserId = serverState?.winner_user_id || 0;

  const planningDeadlineClient = serverState?.planning_deadline_ms
    ? serverState.planning_deadline_ms + serverOffsetRef.current
    : 0;

  const revealDeadlineClient = serverState?.reveal_deadline_ms
    ? serverState.reveal_deadline_ms + serverOffsetRef.current
    : 0;

  const timeLeft = planningDeadlineClient
    ? Math.max(0, Math.ceil((planningDeadlineClient - nowMs) / 1000))
    : 0;

  const revealLeft = revealDeadlineClient
    ? Math.max(0, Math.ceil((revealDeadlineClient - nowMs) / 1000))
    : 0;

  const centerStatus = (() => {
    if (!serverState) return 'CONNECTING';

    switch (serverState.phase) {
      case 'waiting':
        return 'WAITING';

      case 'planning':
        return String(timeLeft);

      case 'reveal':
        return revealLeft > 0 ? 'REVEAL' : 'READY';

      case 'resolving':
        return 'PLAY';

      case 'goal':
        return serverState.goal_scorer_user_id === myUserId
          ? 'YOUR GOAL'
          : 'RIVAL GOAL';

      case 'match_over':
        return winnerUserId === myUserId ? 'VICTORY' : 'DEFEAT';

      default:
        return '';
    }
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    const context = canvas.getContext('2d');

    if (!context) return;

    const viewport = {
      width: 1,
      height: 520,
      dpr: 1,
    };

    const field: FieldGeometry = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
      goalWidth: 0,
      goalLeft: 0,
      goalRight: 0,
      goalDepth: 0,
    };

    const drag: DragState = {
      active: false,
      pointerId: null,
      discIndex: null,
      pointerX: 0,
      pointerY: 0,
    };

    const sparks: Spark[] = [];

    let lastFrameAt = performance.now();
    let lastRenderedGoalSeq = 0;

    const boardSize = () => ({
      width: stateRef.current?.board_width || DEFAULT_BOARD.width,
      height: stateRef.current?.board_height || DEFAULT_BOARD.height,
    });

    const buildField = () => {
      const board = boardSize();
      const sidePadding = clamp(viewport.width * 0.035, 10, 18);
      const topPadding = clamp(viewport.height * 0.145, 84, 102);
      const estimatedFieldWidth = Math.max(1, viewport.width - sidePadding * 2);
      const estimatedGoalDepthWorld = stateRef.current?.goal_depth || 0.057 * 2;
      const goalDepthPixels = estimatedFieldWidth * (estimatedGoalDepthWorld / board.width);
      const bottomPadding = clamp(goalDepthPixels + 13, 46, 62);

      field.left = sidePadding;
      field.right = viewport.width - sidePadding;
      field.top = topPadding;
      field.bottom = viewport.height - bottomPadding;
      field.width = field.right - field.left;
      field.height = field.bottom - field.top;
      field.centerX = (field.left + field.right) / 2;
      field.centerY = (field.top + field.bottom) / 2;
      const goalWidthWorld = stateRef.current?.goal_width || 0.057 * 6;
      const goalDepthWorld = stateRef.current?.goal_depth || 0.057 * 2;

      field.goalWidth = field.width * (goalWidthWorld / board.width);
      field.goalLeft = field.centerX - field.goalWidth / 2;
      field.goalRight = field.centerX + field.goalWidth / 2;
      field.goalDepth = field.width * (goalDepthWorld / board.width);
    };

    const worldToCanvas = (x: number, y: number) => {
      const board = boardSize();

      return {
        x: field.left + (x / board.width) * field.width,
        y: field.top + (y / board.height) * field.height,
      };
    };

    const canvasToWorld = (x: number, y: number) => {
      const board = boardSize();

      return {
        x: ((x - field.left) / field.width) * board.width,
        y: ((y - field.top) / field.height) * board.height,
      };
    };

    const worldRadiusToPixels = (radius: number) => {
      const board = boardSize();

      return radius * (field.width / board.width);
    };

    const roundedRect = (
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ) => {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
    };

    const drawGoal = (team: Team) => {
      const isOwnGoal = team === 'home';
      const topGoal = !isOwnGoal;
      const accent = isOwnGoal ? '#4DA3FF' : '#FF4F68';
      const glow = isOwnGoal
        ? 'rgba(77,163,255,0.62)'
        : 'rgba(255,79,104,0.62)';

      const frontY = topGoal ? field.top : field.bottom;
      const backY = topGoal
        ? frontY - field.goalDepth
        : frontY + field.goalDepth;

      const netTop = Math.min(frontY, backY);
      const netHeight = Math.abs(backY - frontY);

      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';

      const netFill = context.createLinearGradient(
        field.centerX,
        frontY,
        field.centerX,
        backY,
      );

      netFill.addColorStop(0, 'rgba(255,255,255,0.035)');
      netFill.addColorStop(1, 'rgba(0,0,0,0.32)');

      context.fillStyle = netFill;

      context.fillRect(
        field.goalLeft,
        netTop,
        field.goalWidth,
        netHeight,
      );

      context.strokeStyle = 'rgba(255,255,255,0.2)';
      context.lineWidth = 0.9;

      for (let column = 0; column <= 8; column += 1) {
        const x = lerp(field.goalLeft, field.goalRight, column / 8);

        context.beginPath();
        context.moveTo(x, frontY);
        context.lineTo(x, backY);
        context.stroke();
      }

      for (let row = 1; row <= 4; row += 1) {
        const y = lerp(frontY, backY, row / 4);

        context.beginPath();
        context.moveTo(field.goalLeft, y);
        context.lineTo(field.goalRight, y);
        context.stroke();
      }

      context.shadowBlur = 15;
      context.shadowColor = glow;
      context.strokeStyle = accent;
      context.lineWidth = 4.2;

      context.beginPath();
      context.moveTo(field.goalLeft, frontY);
      context.lineTo(field.goalLeft, backY);
      context.lineTo(field.goalRight, backY);
      context.lineTo(field.goalRight, frontY);
      context.stroke();

      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,0.78)';
      context.lineWidth = 1;

      context.beginPath();
      context.moveTo(field.goalLeft, frontY);
      context.lineTo(field.goalLeft, backY);
      context.lineTo(field.goalRight, backY);
      context.lineTo(field.goalRight, frontY);
      context.stroke();

      context.fillStyle = '#ffffff';
      context.shadowBlur = 9;
      context.shadowColor = glow;

      for (const x of [field.goalLeft, field.goalRight]) {
        context.beginPath();
        context.arc(x, frontY, 4.6, 0, Math.PI * 2);
        context.fill();
      }

      context.shadowBlur = 0;
      context.restore();
    };

    const drawField = () => {
      context.save();
      context.shadowBlur = 26;
      context.shadowColor = 'rgba(0,0,0,0.5)';

      const fieldGradient = context.createLinearGradient(
        field.left,
        field.top,
        field.right,
        field.bottom,
      );

      fieldGradient.addColorStop(0, '#15483f');
      fieldGradient.addColorStop(0.48, '#0d352f');
      fieldGradient.addColorStop(1, '#08251f');

      context.fillStyle = fieldGradient;

      roundedRect(field.left, field.top, field.width, field.height, 24);
      context.fill();

      context.shadowBlur = 0;

      context.save();

      roundedRect(field.left, field.top, field.width, field.height, 24);
      context.clip();

      for (let stripe = 0; stripe < 10; stripe += 1) {
        context.fillStyle =
          stripe % 2 === 0
            ? 'rgba(135,255,205,0.026)'
            : 'rgba(0,0,0,0.036)';

        context.fillRect(
          field.left + (field.width * stripe) / 10,
          field.top,
          field.width / 10,
          field.height,
        );
      }

      const centerLight = context.createRadialGradient(
        field.centerX,
        field.centerY,
        field.width * 0.05,
        field.centerX,
        field.centerY,
        field.height * 0.64,
      );

      centerLight.addColorStop(0, 'rgba(114,255,205,0.075)');
      centerLight.addColorStop(0.58, 'rgba(37,136,103,0.026)');
      centerLight.addColorStop(1, 'rgba(0,0,0,0.24)');

      context.fillStyle = centerLight;

      context.fillRect(
        field.left,
        field.top,
        field.width,
        field.height,
      );

      context.globalAlpha = 0.052;
      context.fillStyle = '#d7fff3';

      for (let index = 0; index < 90; index += 1) {
        const seedX = Math.sin(index * 91.771) * 43758.5453;
        const seedY = Math.sin(index * 47.113) * 24634.6345;

        context.fillRect(
          field.left + (seedX - Math.floor(seedX)) * field.width,
          field.top + (seedY - Math.floor(seedY)) * field.height,
          0.8,
          0.8,
        );
      }

      context.globalAlpha = 1;
      context.restore();

      const borderGradient = context.createLinearGradient(
        field.left,
        field.top,
        field.right,
        field.bottom,
      );

      borderGradient.addColorStop(0, 'rgba(82,255,229,0.48)');
      borderGradient.addColorStop(0.5, 'rgba(255,255,255,0.34)');
      borderGradient.addColorStop(1, 'rgba(255,122,144,0.48)');

      context.strokeStyle = borderGradient;
      context.lineWidth = 1.6;

      roundedRect(field.left, field.top, field.width, field.height, 24);
      context.stroke();

      context.strokeStyle = 'rgba(255,255,255,0.34)';
      context.lineWidth = 1.2;

      context.beginPath();
      context.moveTo(field.left, field.centerY);
      context.lineTo(field.right, field.centerY);
      context.stroke();

      const centerRadius = clamp(field.width * 0.13, 42, 55);

      context.beginPath();
      context.arc(
        field.centerX,
        field.centerY,
        centerRadius,
        0,
        Math.PI * 2,
      );
      context.stroke();

      context.fillStyle = 'rgba(255,255,255,0.72)';

      context.beginPath();
      context.arc(
        field.centerX,
        field.centerY,
        2.5,
        0,
        Math.PI * 2,
      );
      context.fill();

      const penaltyWidth = field.goalWidth * 1.72;
      const penaltyHeight = clamp(field.height * 0.12, 54, 72);
      const goalBoxWidth = field.goalWidth * 1.22;
      const goalBoxHeight = penaltyHeight * 0.48;

      context.strokeStyle = 'rgba(255,255,255,0.3)';

      context.strokeRect(
        field.centerX - penaltyWidth / 2,
        field.top,
        penaltyWidth,
        penaltyHeight,
      );

      context.strokeRect(
        field.centerX - penaltyWidth / 2,
        field.bottom - penaltyHeight,
        penaltyWidth,
        penaltyHeight,
      );

      context.strokeRect(
        field.centerX - goalBoxWidth / 2,
        field.top,
        goalBoxWidth,
        goalBoxHeight,
      );

      context.strokeRect(
        field.centerX - goalBoxWidth / 2,
        field.bottom - goalBoxHeight,
        goalBoxWidth,
        goalBoxHeight,
      );

      context.fillStyle = 'rgba(255,255,255,0.62)';

      context.beginPath();
      context.arc(
        field.centerX,
        field.top + penaltyHeight * 0.72,
        2.1,
        0,
        Math.PI * 2,
      );
      context.fill();

      context.beginPath();
      context.arc(
        field.centerX,
        field.bottom - penaltyHeight * 0.72,
        2.1,
        0,
        Math.PI * 2,
      );
      context.fill();

      drawGoal('home');
      drawGoal('away');

      context.restore();
    };

    const profileFor = (userId: number) => {
      if (userId === myUserId) return homeProfile;
      if (userId === opponentUserId) return awayProfile;

      return (
        profileById.get(userId) || {
          id: userId,
          name: `Player ${userId}`,
          photoUrl: '',
        }
      );
    };

    const drawDisc = (body: DiscFootballBody) => {
      const point = worldToCanvas(body.x, body.y);
      const radius = worldRadiusToPixels(body.radius);
      const isMine = body.owner_user_id === myUserId;
      const hue = isMine ? 177 : 350;

      const selected =
        isMine &&
        body.disc_index !== undefined &&
        (localPlansRef.current.has(body.disc_index) ||
          drag.discIndex === body.disc_index);

      context.save();

      context.shadowBlur = selected ? 22 : 12;
      context.shadowColor = `hsla(${hue},100%,55%,${
        selected ? 0.75 : 0.38
      })`;

      const shell = context.createRadialGradient(
        point.x - radius * 0.36,
        point.y - radius * 0.42,
        2,
        point.x,
        point.y,
        radius * 1.15,
      );

      shell.addColorStop(0, isMine ? '#bffff5' : '#ffd2dc');
      shell.addColorStop(0.34, isMine ? '#33d5c2' : '#f05e7d');
      shell.addColorStop(1, isMine ? '#096c65' : '#8a1f39');

      context.fillStyle = shell;

      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();

      context.shadowBlur = 0;

      context.strokeStyle = selected
        ? 'rgba(255,255,255,0.95)'
        : 'rgba(255,255,255,0.4)';

      context.lineWidth = selected ? 2.6 : 1.5;
      context.stroke();

      const ownerId = body.owner_user_id || 0;
      const profile = profileFor(ownerId);
      const image = avatarImagesRef.current.get(ownerId);

      context.save();

      context.beginPath();
      context.arc(
        point.x,
        point.y,
        radius - 5.3,
        0,
        Math.PI * 2,
      );
      context.clip();

      if (image?.complete && image.naturalWidth > 0) {
        context.drawImage(
          image,
          point.x - radius,
          point.y - radius,
          radius * 2,
          radius * 2,
        );
      } else {
        const avatarGradient = context.createRadialGradient(
          point.x - radius * 0.32,
          point.y - radius * 0.35,
          1,
          point.x,
          point.y,
          radius,
        );

        avatarGradient.addColorStop(0, isMine ? '#d7fffa' : '#ffe6eb');
        avatarGradient.addColorStop(0.48, isMine ? '#53d7c6' : '#f27891');
        avatarGradient.addColorStop(1, isMine ? '#166d67' : '#8e2940');

        context.fillStyle = avatarGradient;

        context.fillRect(
          point.x - radius,
          point.y - radius,
          radius * 2,
          radius * 2,
        );

        context.fillStyle = 'rgba(255,255,255,0.92)';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `900 ${Math.round(
          radius * 0.72,
        )}px Supercell, system-ui, sans-serif`;

        context.fillText(
          getInitials(profile.name),
          point.x,
          point.y + 1,
        );
      }

      context.restore();

      context.strokeStyle = `hsla(${hue},100%,72%,0.88)`;
      context.lineWidth = 2.1;

      context.beginPath();
      context.arc(
        point.x,
        point.y,
        radius - 4,
        0,
        Math.PI * 2,
      );
      context.stroke();

      context.fillStyle = 'rgba(255,255,255,0.7)';

      context.beginPath();
      context.arc(
        point.x - radius * 0.38,
        point.y - radius * 0.4,
        radius * 0.12,
        0,
        Math.PI * 2,
      );
      context.fill();

      context.restore();
    };

    const drawBall = (body: DiscFootballBody) => {
      const point = worldToCanvas(body.x, body.y);
      const radius = worldRadiusToPixels(body.radius);

      context.save();
      context.translate(point.x, point.y);
      context.rotate(body.rotation);

      context.shadowBlur = 13;
      context.shadowColor = 'rgba(242,199,102,0.48)';

      const gradient = context.createRadialGradient(
        -radius * 0.35,
        -radius * 0.42,
        1,
        0,
        0,
        radius * 1.15,
      );

      gradient.addColorStop(0, '#fff8dc');
      gradient.addColorStop(0.42, '#f5ddb0');
      gradient.addColorStop(1, '#b7904d');

      context.fillStyle = gradient;

      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();

      context.shadowBlur = 0;

      context.strokeStyle = 'rgba(60,46,28,0.68)';
      context.lineWidth = 1.2;

      context.beginPath();
      context.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
      context.stroke();

      for (let index = 0; index < 5; index += 1) {
        const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;

        context.beginPath();

        context.moveTo(
          Math.cos(angle) * radius * 0.18,
          Math.sin(angle) * radius * 0.18,
        );

        context.lineTo(
          Math.cos(angle) * radius * 0.72,
          Math.sin(angle) * radius * 0.72,
        );

        context.stroke();
      }

      context.fillStyle = 'rgba(50,39,24,0.74)';

      context.beginPath();
      context.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
      context.fill();

      context.restore();
    };

    const drawArrow = (
      body: DiscFootballBody,
      plan: DiscFootballPlan,
      hue: number,
      alpha: number,
    ) => {
      if (plan.power <= 0.01) return;

      const start = worldToCanvas(body.x, body.y);
      const radius = worldRadiusToPixels(body.radius);
      const directionLength = Math.max(
        0.0001,
        vectorLength(plan.dx, plan.dy),
      );

      const directionX = plan.dx / directionLength;
      const directionY = plan.dy / directionLength;
      const arrowLength = 38 + plan.power * 76;

      const startX = start.x + directionX * (radius + 7);
      const startY = start.y + directionY * (radius + 7);
      const endX = start.x + directionX * arrowLength;
      const endY = start.y + directionY * arrowLength;

      context.save();

      context.globalAlpha = alpha;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = `hsl(${hue},100%,67%)`;
      context.fillStyle = `hsl(${hue},100%,67%)`;
      context.shadowBlur = 14;
      context.shadowColor = `hsla(${hue},100%,55%,0.72)`;
      context.lineWidth = 4;

      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();

      const angle = Math.atan2(directionY, directionX);
      const headLength = 12;
      const headAngle = 0.52;

      context.beginPath();
      context.moveTo(endX, endY);

      context.lineTo(
        endX - Math.cos(angle - headAngle) * headLength,
        endY - Math.sin(angle - headAngle) * headLength,
      );

      context.lineTo(
        endX - Math.cos(angle + headAngle) * headLength,
        endY - Math.sin(angle + headAngle) * headLength,
      );

      context.closePath();
      context.fill();

      context.restore();
    };

    const bodyForDisc = (
      bodies: DiscFootballBody[],
      ownerUserId: number,
      discIndex: number,
    ) =>
      bodies.find(
        (body) =>
          body.kind === 'disc' &&
          body.owner_user_id === ownerUserId &&
          body.disc_index === discIndex,
      );

    const drawArrows = (bodies: DiscFootballBody[]) => {
      const state = stateRef.current;

      if (!state) return;

      if (state.phase === 'planning') {
        for (const plan of localPlansRef.current.values()) {
          const body = bodyForDisc(
            bodies,
            myUserId,
            plan.disc_index,
          );

          if (body) {
            drawArrow(body, plan, 177, 0.92);
          }
        }

        if (drag.active && drag.discIndex !== null) {
          const body = bodyForDisc(
            bodies,
            myUserId,
            drag.discIndex,
          );

          if (body) {
            const point = canvasToWorld(
              drag.pointerX,
              drag.pointerY,
            );

            const dx = point.x - body.x;
            const dy = point.y - body.y;
            const distance = vectorLength(dx, dy);

            if (distance >= MIN_AIM_WORLD) {
              drawArrow(
                body,
                {
                  disc_index: drag.discIndex,
                  dx: dx / distance,
                  dy: dy / distance,
                  power: clamp(distance / MAX_AIM_WORLD, 0, 1),
                },
                177,
                1,
              );
            }
          }
        }
      }

      if (state.phase === 'reveal' && state.plans) {
        for (const [userIdKey, serverPlans] of Object.entries(state.plans)) {
          const userId = Number(userIdKey);
          const hue = userId === myUserId ? 177 : 350;

          for (const serverPlan of serverPlans) {
            const plan = transformPlanToLocal(
              serverPlan,
              sideRef.current,
            );

            const body = bodyForDisc(
              bodies,
              userId,
              plan.disc_index,
            );

            if (body) {
              drawArrow(body, plan, hue, 0.94);
            }
          }
        }
      }
    };

    const spawnGoalSparks = (bodies: DiscFootballBody[]) => {
      const ball = bodies.find((body) => body.kind === 'ball');

      if (!ball) return;

      const point = worldToCanvas(ball.x, ball.y);
      const scorerIsMine =
        stateRef.current?.goal_scorer_user_id === myUserId;
      const hue = scorerIsMine ? 177 : 350;

      for (let index = 0; index < 34; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 270;
        const life = 0.45 + Math.random() * 0.5;

        sparks.push({
          x: point.x,
          y: point.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 1.5 + Math.random() * 4,
          hue: hue + (Math.random() - 0.5) * 22,
        });
      }
    };

    const updateSparks = (deltaTime: number) => {
      for (const spark of sparks) {
        spark.x += spark.vx * deltaTime;
        spark.y += spark.vy * deltaTime;
        spark.vx *= Math.pow(0.12, deltaTime);
        spark.vy *= Math.pow(0.12, deltaTime);
        spark.life -= deltaTime;
      }

      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        if (sparks[index].life <= 0) {
          sparks.splice(index, 1);
        }
      }
    };

    const drawSparks = () => {
      context.save();

      context.globalCompositeOperation = 'lighter';

      for (const spark of sparks) {
        const alpha = clamp(
          spark.life / spark.maxLife,
          0,
          1,
        );

        context.globalAlpha = alpha;
        context.fillStyle = `hsl(${spark.hue},100%,68%)`;
        context.shadowBlur = 8;
        context.shadowColor = `hsla(${spark.hue},100%,58%,0.8)`;

        context.beginPath();
        context.arc(
          spark.x,
          spark.y,
          spark.size * alpha,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      context.restore();

      context.globalAlpha = 1;
      context.shadowBlur = 0;
      context.globalCompositeOperation = 'source-over';
    };

    const getRenderBodies = (now: number) => {
      const state = stateRef.current;

      if (!state) return renderBodiesRef.current;

      if (state.phase === 'resolving') {
        const sampled = sampleSnapshots(
          snapshotsRef.current,
          now,
        );

        if (sampled) {
          renderBodiesRef.current = sampled;
        }
      }

      return renderBodiesRef.current;
    };

    const render = (now: number, deltaTime: number) => {
      context.clearRect(
        0,
        0,
        viewport.width,
        viewport.height,
      );

      drawField();

      const bodies = getRenderBodies(now);

      if (
        goalSignalRef.current > lastRenderedGoalSeq &&
        goalSignalRef.current > 0
      ) {
        lastRenderedGoalSeq = goalSignalRef.current;
        spawnGoalSparks(bodies);
      }

      drawArrows(bodies);

      for (const body of bodies) {
        if (body.kind === 'disc') {
          drawDisc(body);
        } else {
          drawBall(body);
        }
      }

      updateSparks(deltaTime);
      drawSparks();

      const currentPhase = stateRef.current?.phase;

      if (currentPhase === 'goal') {
        context.save();

        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '900 22px Supercell, system-ui, sans-serif';

        context.fillStyle =
          stateRef.current?.goal_scorer_user_id === myUserId
            ? '#52FFE5'
            : '#FF7A90';

        context.shadowBlur = 22;

        context.shadowColor =
          stateRef.current?.goal_scorer_user_id === myUserId
            ? 'rgba(82,255,229,0.72)'
            : 'rgba(255,122,144,0.72)';

        context.fillText(
          'GOAL!',
          field.centerX,
          field.centerY,
        );

        context.restore();
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();

      viewport.width = Math.max(1, bounds.width);
      viewport.height = Math.max(520, bounds.height);
      viewport.dpr = Math.min(
        window.devicePixelRatio || 1,
        MAX_DPR,
      );

      canvas.width = Math.round(
        viewport.width * viewport.dpr,
      );

      canvas.height = Math.round(
        viewport.height * viewport.dpr,
      );

      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.setTransform(
        viewport.dpr,
        0,
        0,
        viewport.dpr,
        0,
        0,
      );

      buildField();
    };

    const pointerPosition = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();

      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const sendCurrentPlans = () => {
      const plans = [...localPlansRef.current.values()]
        .sort(
          (first, second) =>
            first.disc_index - second.disc_index,
        )
        .map((plan) =>
          transformPlanToServer(
            plan,
            sideRef.current,
          ),
        );

      socketRef.current?.submitPlans(plans);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const state = stateRef.current;

      if (!state || state.phase !== 'planning' || !state.ready) {
        return;
      }

      const pointer = pointerPosition(event);
      const bodies = renderBodiesRef.current;

      const selected = bodies
        .filter(
          (body) =>
            body.kind === 'disc' &&
            body.owner_user_id === myUserId,
        )
        .map((body) => {
          const point = worldToCanvas(body.x, body.y);

          return {
            body,
            distance: vectorLength(
              pointer.x - point.x,
              pointer.y - point.y,
            ),
            radius: worldRadiusToPixels(body.radius),
          };
        })
        .filter(
          (item) =>
            item.distance <= item.radius + 18,
        )
        .sort(
          (first, second) =>
            first.distance - second.distance,
        )[0]?.body;

      if (!selected || selected.disc_index === undefined) {
        return;
      }

      event.preventDefault();

      setShowIntroHint(false);

      canvas.setPointerCapture(event.pointerId);

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.discIndex = selected.disc_index;
      drag.pointerX = pointer.x;
      drag.pointerY = pointer.y;

      triggerHaptic('light');
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (
        !drag.active ||
        drag.pointerId !== event.pointerId ||
        stateRef.current?.phase !== 'planning'
      ) {
        return;
      }

      event.preventDefault();

      const pointer = pointerPosition(event);

      const body = renderBodiesRef.current.find(
        (item) =>
          item.kind === 'disc' &&
          item.owner_user_id === myUserId &&
          item.disc_index === drag.discIndex,
      );

      if (!body) return;

      const bodyPoint = worldToCanvas(body.x, body.y);
      const dx = pointer.x - bodyPoint.x;
      const dy = pointer.y - bodyPoint.y;
      const distance = vectorLength(dx, dy);
      const maxPixels =
        MAX_AIM_WORLD *
        (field.width / boardSize().width);

      const limited = Math.min(maxPixels, distance);

      if (distance > 0.0001) {
        drag.pointerX =
          bodyPoint.x +
          (dx / distance) * limited;

        drag.pointerY =
          bodyPoint.y +
          (dy / distance) * limited;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();

      const body = renderBodiesRef.current.find(
        (item) =>
          item.kind === 'disc' &&
          item.owner_user_id === myUserId &&
          item.disc_index === drag.discIndex,
      );

      if (body && drag.discIndex !== null) {
        const pointer = canvasToWorld(
          drag.pointerX,
          drag.pointerY,
        );

        const dx = pointer.x - body.x;
        const dy = pointer.y - body.y;
        const distance = vectorLength(dx, dy);

        if (distance < MIN_AIM_WORLD) {
          localPlansRef.current.delete(drag.discIndex);
        } else {
          const power = clamp(
            distance / MAX_AIM_WORLD,
            0,
            1,
          );

          localPlansRef.current.set(drag.discIndex, {
            disc_index: drag.discIndex,
            dx: dx / distance,
            dy: dy / distance,
            power,
          });

          triggerHaptic(
            power > 0.72 ? 'medium' : 'light',
          );
        }

        sendCurrentPlans();
      }

      drag.active = false;
      drag.pointerId = null;
      drag.discIndex = null;
    };

    const preventTouch = (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    resize();

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    container.addEventListener(
      'touchstart',
      preventTouch,
      {
        passive: false,
      },
    );

    container.addEventListener(
      'touchmove',
      preventTouch,
      {
        passive: false,
      },
    );

    const frame = (now: number) => {
      const deltaTime =
        Math.max(
          0,
          Math.min(
            34,
            now - lastFrameAt,
          ) / 1000,
        );

      lastFrameAt = now;

      render(now, deltaTime);

      animationRef.current =
        window.requestAnimationFrame(frame);
    };

    animationRef.current =
      window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(
          animationRef.current,
        );
      }

      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      container.removeEventListener('touchstart', preventTouch);
      container.removeEventListener('touchmove', preventTouch);
    };
  }, [
    awayProfile.name,
    homeProfile.name,
    myUserId,
    opponentUserId,
    profileById,
  ]);

  if (!lobbyId) {
    return (
      <ConnectionNotice
        title="Лобби не найдено"
        subtitle="Открой игру через комнату Disc Football, чтобы получить идентификатор матча."
        onBack={() =>
          navigate(
            lobbiesPath,
            {
              replace: true,
            },
          )
        }
      />
    );
  }

  if (!token) {
    return (
      <ConnectionNotice
        title="Нет авторизации"
        subtitle="Перезапусти приложение через Telegram и снова открой лобби."
        onBack={() =>
          navigate(
            lobbiesPath,
            {
              replace: true,
            },
          )
        }
      />
    );
  }

  if (!serverState && connectionStatus !== 'open') {
    return (
      <ConnectionNotice
        title={
          connectionStatus === 'error'
            ? 'Ошибка соединения'
            : 'Подключение'
        }
        subtitle={
          socketError ||
          (connectionStatus === 'closed'
            ? 'Соединение с матчем закрыто.'
            : 'Подключаемся к общему игровому серверу.')
        }
        onBack={() =>
          navigate(
            lobbiesPath,
            {
              replace: true,
            },
          )
        }
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[520px] w-full select-none overflow-hidden bg-transparent text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PlayerAvatar
              profile={homeProfile}
              side="home"
            />

            <div className="min-w-0">
              <div className="max-w-[96px] truncate text-[9px] font-black leading-none text-white/90">
                {homeProfile.name}
              </div>

              <div className="mt-1.5 text-[21px] font-black leading-none tabular-nums text-[#52FFE5]">
                {homeScore}
              </div>
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div
              className={[
                'font-black tabular-nums',
                serverState?.phase === 'planning'
                  ? 'text-[24px] leading-none text-white'
                  : 'text-[9px] uppercase tracking-[0.15em] text-white/72',
              ].join(' ')}
            >
              {centerStatus}
            </div>

            <div className="mt-1.5 text-[6px] font-black uppercase tracking-[0.16em] text-white/28">
              round {serverState?.round || 1} · first to{' '}
              {serverState?.target_goals || 2}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[96px] truncate text-[9px] font-black leading-none text-white/90">
                {awayProfile.name}
              </div>

              <div className="mt-1.5 text-[21px] font-black leading-none tabular-nums text-[#FF7A90]">
                {awayScore}
              </div>
            </div>

            <PlayerAvatar
              profile={awayProfile}
              side="away"
            />
          </div>
        </div>

        {(socketError || connectionStatus !== 'open') && (
          <div className="mx-auto mt-2 max-w-[280px] rounded-full border border-[#FF7A90]/20 bg-black/35 px-3 py-1.5 text-center text-[7px] font-black uppercase tracking-[0.13em] text-[#FF9BB0] backdrop-blur-md">
            {socketError || 'Переподключение'}
          </div>
        )}
      </header>

      {showIntroHint && serverState?.phase === 'planning' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
          <div className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-center text-[8px] font-black uppercase tracking-[0.14em] text-white/48 backdrop-blur-md">
            Веди от фишки в сторону удара · можно выбрать 0–3 фишки
          </div>
        </div>
      )}

      {serverState?.phase === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/20 px-5 backdrop-blur-[1px]">
          <div className="rounded-[24px] border border-white/10 bg-[#0b1110]/90 px-5 py-4 text-center shadow-[0_22px_70px_rgba(0,0,0,0.38)]">
            <div className="text-[16px] font-black uppercase text-white">
              Ждём соперника
            </div>

            <div className="mt-2 text-[8px] font-black uppercase tracking-[0.15em] text-white/35">
              Матч продолжится после подключения обоих игроков
            </div>
          </div>
        </div>
      )}

      {serverState?.phase === 'match_over' && winnerUserId > 0 && (
        <PremiumGameResultModal
          gameTitle="Disc Football"
          resultTitle={winnerUserId === myUserId ? 'Победа' : 'Поражение'}
          players={[
            { ...homeProfile, score: homeScore },
            { ...awayProfile, score: awayScore },
          ]}
          winnerUserID={winnerUserId}
          netResult={
            winnerUserId === myUserId
              ? Math.round((Number(window.sessionStorage.getItem('twingames_active_bet')) || 0) * 90) / 100
              : -(Number(window.sessionStorage.getItem('twingames_active_bet')) || 0)
          }
          netLabel="Чистый результат"
          continueLabel="К списку лобби"
          onContinue={() => navigate(lobbiesPath, { replace: true })}
          theme={{ background: '#07130f', accent: '#52ffe5', rival: '#ff7a90' }}
        />
      )}
    </div>
  );
};

export default DiscFootballGame;
