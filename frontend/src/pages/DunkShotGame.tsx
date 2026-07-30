import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  dunkShotWsApi,
  type DunkShotGrade,
  type DunkShotMatchPhase,
  type DunkShotSocketClient,
  type DunkShotStateMessage,
} from '../api/dunkShotWs';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { PremiumGameResultModal } from '../components/Game/PremiumGameResultModal';

type Phase = 'ready' | 'flying' | 'scoring' | 'settling';

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

type PlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
};

type Vec2 = {
  x: number;
  y: number;
};

type Ball = Vec2 & {
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
};

type Hoop = Vec2 & {
  id: number;
  width: number;
  angle: number;
  netDepth: number;
  bottomWidth: number;
  accentHue: number;
  netPulse: number;
  netPulseVelocity: number;
};

type Particle = Vec2 & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  gravity: number;
};

type TrailPoint = Vec2 & {
  life: number;
  size: number;
};

type FloatingLabel = Vec2 & {
  text: string;
  life: number;
  hue: number;
  scale: number;
};

type AimState = {
  active: boolean;
  pointerId: number | null;
  x: number;
  y: number;
  power: number;
};

const GAME = {
  gravity: 1680,
  airDrag: 0.99935,

  ballRadius: 19,
  rimRadius: 4.4,

  maxPull: 126,
  launchPower: 8.95,
  maxLaunchSpeed: 1490,

  hoopMinWidth: 78,
  hoopMaxWidth: 86,
  hoopMinGap: 174,
  hoopMaxGap: 206,

  screenMargin: 20,
  workingHoopRatio: 0.71,

  scoringDurationMs: 210,
  settlingDurationMs: 150,
  returnDurationMs: 190,
  shotTimeoutMs: 5400,

  fireCombo: 4,
  maxMultiplier: 5,

  maxDevicePixelRatio: 1.7,
};

const clamp = (
  value: number,
  minimum: number,
  maximum: number,
) => Math.max(minimum, Math.min(maximum, value));

const lerp = (
  start: number,
  end: number,
  progress: number,
) => start + (end - start) * progress;

const easeOutCubic = (value: number) =>
  1 - Math.pow(1 - value, 3);

const getInitials = (value: string) =>
  value
    .replace('@', '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG';

const triggerHaptic = (
  type:
    | 'light'
    | 'medium'
    | 'heavy'
    | 'success'
    | 'error',
) => {
  const telegram = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (
              style: 'light' | 'medium' | 'heavy',
            ) => void;
            notificationOccurred?: (
              type: 'success' | 'error',
            ) => void;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  if (type === 'success' || type === 'error') {
    telegram?.HapticFeedback?.notificationOccurred?.(
      type,
    );
    return;
  }

  telegram?.HapticFeedback?.impactOccurred?.(type);
};

const localToWorld = (
  x: number,
  y: number,
  angle: number,
): Vec2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  };
};

const worldToLocal = (
  x: number,
  y: number,
  angle: number,
): Vec2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return {
    x: x * cosine + y * sine,
    y: -x * sine + y * cosine,
  };
};

const createRandom = (initialSeed: number) => {
  let seed = Math.abs(Math.trunc(initialSeed)) % 2_147_483_647;

  if (seed <= 0) {
    seed = 1;
  }

  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
};

const PlayerAvatar = ({
  photoUrl,
  name,
  side,
}: {
  photoUrl?: string;
  name: string;
  side: 'player' | 'opponent';
}) => (
  <div
    className={[
      'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)]',
      side === 'player'
        ? 'border-[#52FFE5]/35 bg-[#52FFE5]/10'
        : 'border-[#F2A65A]/35 bg-[#F2A65A]/10',
    ].join(' ')}
  >
    {photoUrl ? (
      <img
        src={photoUrl}
        alt={name}
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : (
      getInitials(name)
    )}
  </div>
);

const PLAYERS_STORAGE_KEY = 'twingames_dunk_shot_players_info';
const ACTIVE_LOBBY_STORAGE_KEY = 'twingames_active_lobby_id';
const ACTIVE_GAME_STORAGE_KEY = 'twingames_active_game';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';

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

const ConnectionNotice = ({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) => (
  <div className="relative grid h-full min-h-[440px] w-full place-items-center overflow-hidden bg-transparent p-5 text-center text-white">
    <div className="w-full max-w-[340px] rounded-[28px] border border-white/[0.09] bg-[#11100e]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F2A65A]/55">
        Dunk Shot
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

export const DunkShotGame = () => {
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const socketRef = useRef<DunkShotSocketClient | null>(null);
  const matchPhaseRef = useRef<DunkShotMatchPhase>('waiting');
  const eventIdRef = useRef(0);
  const serverOffsetRef = useRef(0);
  const sendScoreEventRef = useRef<(grade: DunkShotGrade) => void>(() => {});
  const sendMissEventRef = useRef<() => void>(() => {});

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [statusText, setStatusText] = useState('READY');
  const [showHint, setShowHint] = useState(true);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<DunkShotStateMessage | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matchSeed, setMatchSeed] = useState(1);

  const lobbiesPath = '/game/dunk_shot/lobbies';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (lobbyId) {
      window.sessionStorage.setItem(ACTIVE_LOBBY_STORAGE_KEY, lobbyId);
      window.sessionStorage.setItem(ACTIVE_GAME_STORAGE_KEY, 'dunk_shot');
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
    sendScoreEventRef.current = (grade) => {
      if (matchPhaseRef.current !== 'playing') return;
      eventIdRef.current += 1;
      socketRef.current?.sendScore(eventIdRef.current, grade);
    };

    sendMissEventRef.current = () => {
      if (matchPhaseRef.current !== 'playing') return;
      eventIdRef.current += 1;
      socketRef.current?.sendMiss(eventIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lobbyId || !token || myUserId <= 0) return;

    let alive = true;

    setConnectionStatus('connecting');
    setSocketError(null);

    const client = dunkShotWsApi.connect({
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

          const previousPhase = matchPhaseRef.current;
          matchPhaseRef.current = state.phase;
          serverOffsetRef.current = Date.now() - state.server_ms;

          if (state.seed > 0) {
            setMatchSeed(state.seed);
          }

          const serverScore = state.scores[String(myUserId)] || 0;
          const serverCombo = state.combos[String(myUserId)] || 0;
          setScore(serverScore);
          setCombo(serverCombo);

          if (state.phase === 'countdown' && previousPhase !== 'countdown') {
            eventIdRef.current = 0;
            setShowHint(true);
          }

          if (state.phase === 'playing' && previousPhase !== 'playing') {
            triggerHaptic('medium');
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

  const playerOrder = serverState?.player_order || [];
  const opponentUserId = playerOrder.find((id) => id !== myUserId) || 0;

  const playerProfile: PlayerProfile =
    profileById.get(myUserId) || {
      id: myUserId,
      name: user?.tg_user || 'Player',
      photoUrl: user?.photo_url || '',
    };

  const opponentProfile: PlayerProfile =
    profileById.get(opponentUserId) || {
      id: opponentUserId,
      name: opponentUserId ? `Player ${opponentUserId}` : 'Opponent',
      photoUrl: '',
    };

  const myScore = serverState?.scores[String(myUserId)] ?? score;
  const opponentScore = serverState?.scores[String(opponentUserId)] || 0;
  const myCombo = serverState?.combos[String(myUserId)] ?? combo;
  const opponentCombo = serverState?.combos[String(opponentUserId)] || 0;
  const winnerUserId = serverState?.winner_user_id || 0;

  const countdownEndsClient = serverState?.countdown_ends_ms
    ? serverState.countdown_ends_ms + serverOffsetRef.current
    : 0;

  const matchEndsClient = serverState?.match_ends_ms
    ? serverState.match_ends_ms + serverOffsetRef.current
    : 0;

  const countdownLeft = countdownEndsClient
    ? Math.max(0, Math.ceil((countdownEndsClient - nowMs) / 1000))
    : 0;

  const matchTimeLeft = matchEndsClient
    ? Math.max(0, Math.ceil((matchEndsClient - nowMs) / 1000))
    : 45;

  const multiplier = Math.min(
    GAME.maxMultiplier,
    1 + Math.floor(Math.max(0, myCombo - 1) / 3),
  );

  const fireballActive = myCombo >= GAME.fireCombo;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const levelRandom = createRandom(matchSeed);
    const effectRandom = createRandom(matchSeed ^ 0x5f3759df);

    const viewport = {
      width: 0,
      height: 0,
      dpr: 1,
    };

    const camera = {
      y: 0,
      targetY: 0,
      shake: 0,
    };

    const ball: Ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: GAME.ballRadius,
      rotation: 0,
    };

    const aim: AimState = {
      active: false,
      pointerId: null,
      x: 0,
      y: 0,
      power: 0,
    };

    const hoops: Hoop[] = [];
    const particles: Particle[] = [];
    const trails: TrailPoint[] = [];
    const labels: FloatingLabel[] = [];

    let initialized = false;
    let currentHoopIndex = 0;
    let currentPhase: Phase = 'ready';

    let internalScore = 0;
    let internalCombo = 0;

    let rimTouched = false;
    let leftCurrentHoop = false;

    let shotStartedAt = 0;
    let phaseStartedAt = 0;
    let phaseUntil = 0;

    let previousFrameTime =
      performance.now();

    let missFlash = 0;

    let scoreEntryFrom: Vec2 = {
      x: 0,
      y: 0,
    };

    let scoreEntryTo: Vec2 = {
      x: 0,
      y: 0,
    };

    let scoreEntryRotation = 0;

    const changePhase = (
      nextPhase: Phase,
    ) => {
      currentPhase = nextPhase;
      setPhase(nextPhase);
    };

    const getHoopWorldPoint = (
      hoop: Hoop,
      localX: number,
      localY: number,
    ): Vec2 => {
      const offset = localToWorld(
        localX,
        localY,
        hoop.angle,
      );

      return {
        x: hoop.x + offset.x,
        y: hoop.y + offset.y,
      };
    };

    const getBallRestPosition = (
      hoop: Hoop,
    ) =>
      getHoopWorldPoint(
        hoop,
        0,
        24,
      );

    const addFloatingLabel = (
      text: string,
      x: number,
      y: number,
      hue: number,
      scale = 1,
    ) => {
      labels.push({
        text,
        x,
        y,
        hue,
        scale,
        life: 1,
      });

      setStatusText(text);
    };

    const addParticleBurst = (
      x: number,
      y: number,
      hue: number,
      amount: number,
      strength = 1,
    ) => {
      for (
        let index = 0;
        index < amount;
        index += 1
      ) {
        const angle =
          effectRandom() * Math.PI * 2;

        const speed =
          (105 + effectRandom() * 350) *
          strength;

        const life =
          0.52 + effectRandom() * 0.42;

        particles.push({
          x,
          y,
          vx:
            Math.cos(angle) * speed,
          vy:
            Math.sin(angle) * speed -
            65,
          life,
          maxLife: life,
          size:
            1.8 + effectRandom() * 4,
          hue:
            hue +
            (effectRandom() - 0.5) * 25,
          gravity:
            350 + effectRandom() * 450,
        });
      }
    };

    const createHoop = (
      index: number,
    ) => {
      const previousHoop =
        hoops[index - 1];

      const width = lerp(
        GAME.hoopMinWidth,
        GAME.hoopMaxWidth,
        levelRandom(),
      );

      if (!previousHoop) {
        hoops.push({
          id: index,
          x: viewport.width * 0.5,
          y:
            viewport.height *
            GAME.workingHoopRatio,
          width,
          angle: 0,
          netDepth: 46,
          bottomWidth: 31,
          accentHue: 24,
          netPulse: 0.18,
          netPulseVelocity: 0,
        });

        return;
      }

      const verticalGap = lerp(
        GAME.hoopMinGap,
        GAME.hoopMaxGap,
        levelRandom(),
      );

      const horizontalPadding =
        GAME.screenMargin +
        width / 2;

      const minimumX =
        horizontalPadding;

      const maximumX = Math.max(
        minimumX,
        viewport.width -
          horizontalPadding,
      );

      const previousOnLeft =
        previousHoop.x <
        viewport.width * 0.5;

      const shouldAlternate =
        levelRandom() < 0.95;

      const placeOnRight =
        shouldAlternate
          ? previousOnLeft
          : levelRandom() > 0.5;

      let targetX = placeOnRight
        ? lerp(
            viewport.width * 0.66,
            viewport.width * 0.84,
            levelRandom(),
          )
        : lerp(
            viewport.width * 0.16,
            viewport.width * 0.34,
            levelRandom(),
          );

      targetX = clamp(
        targetX,
        minimumX,
        maximumX,
      );

      const minimumHorizontalDistance =
        Math.min(
          92,
          viewport.width * 0.24,
        );

      if (
        Math.abs(
          targetX - previousHoop.x,
        ) < minimumHorizontalDistance
      ) {
        const direction =
          targetX >= previousHoop.x
            ? 1
            : -1;

        targetX = clamp(
          previousHoop.x +
            direction *
              minimumHorizontalDistance,
          minimumX,
          maximumX,
        );
      }

      const travelDirection =
        targetX > previousHoop.x
          ? 1
          : -1;

      let angleDegrees =
        travelDirection > 0
          ? -2.1
          : 2.1;

      angleDegrees +=
        (levelRandom() - 0.5) * 4.4;

      if (index % 5 === 0) {
        angleDegrees *= -0.55;
      }

      angleDegrees = clamp(
        angleDegrees,
        -5.2,
        5.2,
      );

      hoops.push({
        id: index,
        x: targetX,
        y:
          previousHoop.y -
          verticalGap,
        width,
        angle:
          (angleDegrees *
            Math.PI) /
          180,
        netDepth:
          44 + levelRandom() * 4,
        bottomWidth:
          30 + levelRandom() * 4,
        accentHue:
          index % 5 === 0
            ? 42
            : index % 3 === 0
              ? 184
              : 22,
        netPulse: 0,
        netPulseVelocity: 0,
      });
    };

    const ensureEnoughHoops = () => {
      while (
        hoops.length <
        currentHoopIndex + 9
      ) {
        createHoop(hoops.length);
      }
    };

    const placeBallInCurrentHoop =
      () => {
        const currentHoop =
          hoops[currentHoopIndex];

        const restPosition =
          getBallRestPosition(
            currentHoop,
          );

        currentHoop.netPulse = 0.18;
        currentHoop.netPulseVelocity = 0;

        ball.x = restPosition.x;
        ball.y = restPosition.y;
        ball.vx = 0;
        ball.vy = 0;

        ball.rotation =
          currentHoop.angle * 0.45;

        rimTouched = false;
        leftCurrentHoop = false;

        changePhase('ready');
      };

    const initializeGame = () => {
      hoops.length = 0;
      currentHoopIndex = 0;

      createHoop(0);
      ensureEnoughHoops();

      camera.y = 0;
      camera.targetY = 0;

      placeBallInCurrentHoop();

      initialized = true;
    };

    const resizeCanvas = () => {
      const bounds =
        container.getBoundingClientRect();

      viewport.width = Math.max(
        1,
        bounds.width,
      );

      viewport.height = Math.max(
        440,
        bounds.height,
      );

      viewport.dpr = Math.min(
        window.devicePixelRatio || 1,
        GAME.maxDevicePixelRatio,
      );

      canvas.width = Math.round(
        viewport.width *
          viewport.dpr,
      );

      canvas.height = Math.round(
        viewport.height *
          viewport.dpr,
      );

      canvas.style.width =
        `${viewport.width}px`;

      canvas.style.height =
        `${viewport.height}px`;

      context.setTransform(
        viewport.dpr,
        0,
        0,
        viewport.dpr,
        0,
        0,
      );

      if (!initialized) {
        initializeGame();
        return;
      }

      for (const hoop of hoops) {
        const padding =
          GAME.screenMargin +
          hoop.width / 2;

        hoop.x = clamp(
          hoop.x,
          padding,
          viewport.width - padding,
        );
      }

      camera.targetY =
        hoops[currentHoopIndex].y -
        viewport.height *
          GAME.workingHoopRatio;

      ball.x = clamp(
        ball.x,
        ball.radius,
        viewport.width -
          ball.radius,
      );
    };

    const pointerToWorld = (
      clientX: number,
      clientY: number,
    ): Vec2 => {
      const bounds =
        canvas.getBoundingClientRect();

      return {
        x: clientX - bounds.left,
        y:
          clientY -
          bounds.top +
          camera.y,
      };
    };

    const startSettling = (
      now: number,
      duration: number,
    ) => {
      phaseStartedAt = now;
      phaseUntil = now + duration;

      changePhase('settling');
    };

    const returnToCurrentHoop = (
      now: number,
    ) => {
      internalCombo = 0;
      setCombo(0);
      sendMissEventRef.current();

      trails.length = 0;

      addFloatingLabel(
        'TRY AGAIN',
        hoops[currentHoopIndex].x,
        hoops[currentHoopIndex].y -
          48,
        28,
        0.94,
      );

      triggerHaptic('light');

      ball.vx = 0;
      ball.vy = 0;

      startSettling(
        now,
        GAME.returnDurationMs,
      );
    };

    const handleMiss = () => {
      internalCombo = 0;
      setCombo(0);
      sendMissEventRef.current();

      trails.length = 0;

      missFlash = 1;
      camera.shake = 5;

      addFloatingLabel(
        'MISS',
        ball.x,
        camera.y +
          viewport.height * 0.46,
        350,
        1.04,
      );

      triggerHaptic('error');

      placeBallInCurrentHoop();
    };

    const beginScoredDrop = (
      targetHoopIndex: number,
      crossingX: number,
      verticalVelocity: number,
      now: number,
    ) => {
      if (
        currentPhase !== 'flying' ||
        targetHoopIndex !==
          currentHoopIndex + 1
      ) {
        return;
      }

      const targetHoop =
        hoops[targetHoopIndex];

      const centered =
        Math.abs(crossingX) <=
        targetHoop.width * 0.075;

      const clean = !rimTouched;

      const perfect =
        centered &&
        clean &&
        verticalVelocity > 235;

      internalCombo += 1;

      const currentMultiplier =
        Math.min(
          GAME.maxMultiplier,
          1 +
            Math.floor(
              Math.max(
                0,
                internalCombo - 1,
              ) / 3,
            ),
        );

      const baseScore = perfect
        ? 35
        : clean
          ? 24
          : 14;

      const gainedScore =
        baseScore *
        currentMultiplier;

      internalScore += gainedScore;

      setScore(internalScore);
      setCombo(internalCombo);

      const labelText = perfect
        ? 'PERFECT SWISH'
        : clean
          ? 'SWISH'
          : 'BUCKET';

      const scoreGrade: DunkShotGrade = perfect
        ? 'perfect'
        : clean
          ? 'swish'
          : 'bucket';

      sendScoreEventRef.current(scoreGrade);

      const effectHue =
        internalCombo >=
        GAME.fireCombo
          ? 22
          : perfect
            ? 46
            : 180;

      addFloatingLabel(
        `${labelText}  +${gainedScore}`,
        targetHoop.x,
        targetHoop.y - 48,
        effectHue,
        perfect ? 1.1 : 1,
      );

      addParticleBurst(
        targetHoop.x,
        targetHoop.y + 8,
        effectHue,
        perfect ? 30 : 21,
        perfect ? 1.15 : 1,
      );

      if (
        internalCombo ===
        GAME.fireCombo
      ) {
        addFloatingLabel(
          'FIREBALL',
          targetHoop.x,
          targetHoop.y - 82,
          18,
          1.14,
        );

        addParticleBurst(
          targetHoop.x,
          targetHoop.y,
          18,
          34,
          1.22,
        );
      }

      camera.shake =
        perfect ? 5.5 : 2.8;

      triggerHaptic(
        perfect
          ? 'heavy'
          : 'success',
      );

      currentHoopIndex =
        targetHoopIndex;

      ensureEnoughHoops();

      camera.targetY =
        targetHoop.y -
        viewport.height *
          GAME.workingHoopRatio;

      scoreEntryFrom = {
        x: ball.x,
        y: ball.y,
      };

      scoreEntryTo =
        getBallRestPosition(
          targetHoop,
        );

      scoreEntryRotation =
        ball.rotation;

      targetHoop.netPulseVelocity +=
        1.8;

      ball.vx = 0;
      ball.vy = 0;

      rimTouched = false;
      leftCurrentHoop = false;

      phaseStartedAt = now;

      phaseUntil =
        now +
        GAME.scoringDurationMs;

      changePhase('scoring');
    };

    const detectTargetHoopScore = (
      previousPosition: Vec2,
      currentPosition: Vec2,
      now: number,
    ) => {
      const targetHoopIndex =
        currentHoopIndex + 1;

      const targetHoop =
        hoops[targetHoopIndex];

      if (!targetHoop) {
        return false;
      }

      const previousLocal =
        worldToLocal(
          previousPosition.x -
            targetHoop.x,
          previousPosition.y -
            targetHoop.y,
          targetHoop.angle,
        );

      const currentLocal =
        worldToLocal(
          currentPosition.x -
            targetHoop.x,
          currentPosition.y -
            targetHoop.y,
          targetHoop.angle,
        );

      const localVelocity =
        worldToLocal(
          ball.vx,
          ball.vy,
          targetHoop.angle,
        );

      const crossedOpening =
        previousLocal.y < 0 &&
        currentLocal.y >= 0 &&
        localVelocity.y > 45;

      if (!crossedOpening) {
        return false;
      }

      const verticalDifference =
        currentLocal.y -
        previousLocal.y;

      const crossingProgress =
        Math.abs(
          verticalDifference,
        ) < 0.0001
          ? 1
          : clamp(
              -previousLocal.y /
                verticalDifference,
              0,
              1,
            );

      const crossingX =
        previousLocal.x +
        (currentLocal.x -
          previousLocal.x) *
          crossingProgress;

      const clearHalfWidth =
        Math.max(
          12,
          targetHoop.width / 2 -
            ball.radius -
            GAME.rimRadius +
            3,
        );

      if (
        Math.abs(crossingX) >
        clearHalfWidth
      ) {
        return false;
      }

      beginScoredDrop(
        targetHoopIndex,
        crossingX,
        localVelocity.y,
        now,
      );

      return true;
    };

    const detectReturnToOldHoop = (
      previousPosition: Vec2,
      currentPosition: Vec2,
      now: number,
    ) => {
      if (
        !leftCurrentHoop ||
        currentPhase !== 'flying'
      ) {
        return false;
      }

      const currentHoop =
        hoops[currentHoopIndex];

      const previousLocal =
        worldToLocal(
          previousPosition.x -
            currentHoop.x,
          previousPosition.y -
            currentHoop.y,
          currentHoop.angle,
        );

      const currentLocal =
        worldToLocal(
          currentPosition.x -
            currentHoop.x,
          currentPosition.y -
            currentHoop.y,
          currentHoop.angle,
        );

      const localVelocity =
        worldToLocal(
          ball.vx,
          ball.vy,
          currentHoop.angle,
        );

      const returnedToHoop =
        previousLocal.y < 0 &&
        currentLocal.y >= 0 &&
        localVelocity.y > 30 &&
        Math.abs(currentLocal.x) <=
          currentHoop.width / 2;

      if (!returnedToHoop) {
        return false;
      }

      returnToCurrentHoop(now);

      return true;
    };

    const resolveTargetRimCollision = (
      hoop: Hoop,
    ) => {
      const leftRim =
        getHoopWorldPoint(
          hoop,
          -hoop.width / 2,
          0,
        );

      const rightRim =
        getHoopWorldPoint(
          hoop,
          hoop.width / 2,
          0,
        );

      const resolvePoint = (
        point: Vec2,
      ) => {
        const differenceX =
          ball.x - point.x;

        const differenceY =
          ball.y - point.y;

        const distance = Math.hypot(
          differenceX,
          differenceY,
        );

        const minimumDistance =
          ball.radius +
          GAME.rimRadius;

        if (
          distance >=
          minimumDistance
        ) {
          return false;
        }

        const normalX =
          distance > 0.0001
            ? differenceX / distance
            : 0;

        const normalY =
          distance > 0.0001
            ? differenceY / distance
            : -1;

        const penetration =
          minimumDistance -
          distance;

        ball.x +=
          normalX * penetration;

        ball.y +=
          normalY * penetration;

        const normalVelocity =
          ball.vx * normalX +
          ball.vy * normalY;

        if (normalVelocity < 0) {
          ball.vx -=
            1.76 *
            normalVelocity *
            normalX;

          ball.vy -=
            1.76 *
            normalVelocity *
            normalY;
        }

        return true;
      };

      const hit =
        resolvePoint(leftRim) ||
        resolvePoint(rightRim);

      if (!hit) {
        return;
      }

      if (!rimTouched) {
        triggerHaptic('light');
      }

      rimTouched = true;

      addParticleBurst(
        ball.x,
        ball.y,
        hoop.accentHue,
        3,
        0.35,
      );
    };

    const updateNetPhysics = (
      deltaTime: number,
    ) => {
      for (
        let index = 0;
        index < hoops.length;
        index += 1
      ) {
        const hoop = hoops[index];

        let targetPulse = 0;

        if (
          index === currentHoopIndex &&
          currentPhase === 'ready'
        ) {
          targetPulse = 0.18;
        }

        if (
          index === currentHoopIndex &&
          (currentPhase === 'scoring' ||
            currentPhase ===
              'settling')
        ) {
          targetPulse = 0.42;
        }

        const springStrength = 22;
        const damping = 12;

        hoop.netPulseVelocity +=
          (targetPulse -
            hoop.netPulse) *
          springStrength *
          deltaTime;

        hoop.netPulseVelocity *=
          Math.exp(
            -damping * deltaTime,
          );

        hoop.netPulse +=
          hoop.netPulseVelocity *
          deltaTime;

        hoop.netPulse = clamp(
          hoop.netPulse,
          0,
          0.58,
        );
      }
    };

    const updateFlyingBall = (
      deltaTime: number,
      now: number,
    ) => {
      const expectedDistance =
        Math.hypot(
          ball.vx,
          ball.vy,
        ) * deltaTime;

      const physicsSteps = clamp(
        Math.ceil(
          expectedDistance /
            Math.max(
              3.4,
              ball.radius * 0.25,
            ),
        ),
        1,
        18,
      );

      const physicsStep =
        deltaTime / physicsSteps;

      for (
        let step = 0;
        step < physicsSteps;
        step += 1
      ) {
        const previousPosition = {
          x: ball.x,
          y: ball.y,
        };

        ball.vy +=
          GAME.gravity *
          physicsStep;

        ball.vx *= Math.pow(
          GAME.airDrag,
          physicsStep * 60,
        );

        ball.vy *= Math.pow(
          GAME.airDrag,
          physicsStep * 60,
        );

        ball.x +=
          ball.vx * physicsStep;

        ball.y +=
          ball.vy * physicsStep;

        ball.rotation +=
          ball.vx *
          physicsStep *
          0.024;

        if (
          ball.x < ball.radius
        ) {
          ball.x = ball.radius;

          ball.vx =
            Math.abs(ball.vx) *
            0.7;

          rimTouched = true;
        } else if (
          ball.x >
          viewport.width -
            ball.radius
        ) {
          ball.x =
            viewport.width -
            ball.radius;

          ball.vx =
            -Math.abs(ball.vx) *
            0.7;

          rimTouched = true;
        }

        const currentHoop =
          hoops[currentHoopIndex];

        const localPosition =
          worldToLocal(
            ball.x -
              currentHoop.x,
            ball.y -
              currentHoop.y,
            currentHoop.angle,
          );

        if (
          !leftCurrentHoop &&
          (localPosition.y <
            -ball.radius * 1.12 ||
            Math.abs(
              localPosition.x,
            ) >
              currentHoop.width / 2 +
                ball.radius * 1.2)
        ) {
          leftCurrentHoop = true;
        }

        if (
          detectTargetHoopScore(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }

        if (
          detectReturnToOldHoop(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }

        const targetHoop =
          hoops[
            currentHoopIndex + 1
          ];

        if (targetHoop) {
          resolveTargetRimCollision(
            targetHoop,
          );
        }

        if (
          detectTargetHoopScore(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }
      }
    };

    const updateScoringBall = (
      now: number,
    ) => {
      const progress = clamp(
        (now - phaseStartedAt) /
          GAME.scoringDurationMs,
        0,
        1,
      );

      const eased =
        easeOutCubic(progress);

      const tinyDip =
        Math.sin(
          progress * Math.PI,
        ) * 1.8;

      ball.x = lerp(
        scoreEntryFrom.x,
        scoreEntryTo.x,
        eased,
      );

      ball.y =
        lerp(
          scoreEntryFrom.y,
          scoreEntryTo.y,
          eased,
        ) + tinyDip;

      ball.rotation = lerp(
        scoreEntryRotation,
        hoops[currentHoopIndex]
          .angle * 0.45,
        eased,
      );

      if (now >= phaseUntil) {
        startSettling(
          now,
          GAME.settlingDurationMs,
        );
      }
    };

    const updateSettlingBall = (
      deltaTime: number,
      now: number,
    ) => {
      const restPosition =
        getBallRestPosition(
          hoops[currentHoopIndex],
        );

      ball.x +=
        (restPosition.x -
          ball.x) *
        Math.min(
          1,
          deltaTime * 18,
        );

      ball.y +=
        (restPosition.y -
          ball.y) *
        Math.min(
          1,
          deltaTime * 18,
        );

      ball.rotation +=
        (hoops[currentHoopIndex]
          .angle *
          0.45 -
          ball.rotation) *
        Math.min(
          1,
          deltaTime * 12,
        );

      ball.vx = 0;
      ball.vy = 0;

      if (now >= phaseUntil) {
        placeBallInCurrentHoop();
      }
    };

    const updateBall = (
      deltaTime: number,
      now: number,
    ) => {
      if (
        currentPhase === 'ready'
      ) {
        const restPosition =
          getBallRestPosition(
            hoops[currentHoopIndex],
          );

        ball.x +=
          (restPosition.x -
            ball.x) *
          Math.min(
            1,
            deltaTime * 18,
          );

        ball.y +=
          (restPosition.y -
            ball.y) *
          Math.min(
            1,
            deltaTime * 18,
          );

        ball.vx = 0;
        ball.vy = 0;

        return;
      }

      if (
        currentPhase === 'flying'
      ) {
        updateFlyingBall(
          deltaTime,
          now,
        );
      } else if (
        currentPhase === 'scoring'
      ) {
        updateScoringBall(now);
      } else {
        updateSettlingBall(
          deltaTime,
          now,
        );

        return;
      }

      const speed = Math.hypot(
        ball.vx,
        ball.vy,
      );

      if (
        internalCombo >=
        GAME.fireCombo
      ) {
        trails.push({
          x: ball.x,
          y: ball.y,
          life: 1,
          size:
            ball.radius *
            (0.58 +
              effectRandom() * 0.2),
        });

        if (
          trails.length > 18
        ) {
          trails.shift();
        }
      } else if (speed > 350) {
        trails.push({
          x: ball.x,
          y: ball.y,
          life: 0.4,
          size:
            ball.radius * 0.42,
        });

        if (
          trails.length > 8
        ) {
          trails.shift();
        }
      }

      if (
        currentPhase === 'flying' &&
        (ball.y - camera.y >
          viewport.height + 84 ||
          ball.y - camera.y <
            -viewport.height *
              0.75 ||
          now - shotStartedAt >
            GAME.shotTimeoutMs)
      ) {
        handleMiss();
      }
    };

    const updateEffects = (
      deltaTime: number,
    ) => {
      camera.y +=
        (camera.targetY -
          camera.y) *
        Math.min(
          1,
          deltaTime * 6,
        );

      camera.shake *= Math.pow(
        0.06,
        deltaTime,
      );

      missFlash *= Math.pow(
        0.02,
        deltaTime,
      );

      for (
        const particle of particles
      ) {
        particle.vy +=
          particle.gravity *
          deltaTime;

        particle.x +=
          particle.vx *
          deltaTime;

        particle.y +=
          particle.vy *
          deltaTime;

        particle.vx *= Math.pow(
          0.982,
          deltaTime * 60,
        );

        particle.life -=
          deltaTime;
      }

      for (const trail of trails) {
        trail.life -=
          deltaTime *
          (internalCombo >=
          GAME.fireCombo
            ? 1.7
            : 2.8);
      }

      for (const label of labels) {
        label.y -=
          34 * deltaTime;

        label.life -=
          deltaTime * 0.82;
      }

      for (
        let index =
          particles.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          particles[index].life <= 0
        ) {
          particles.splice(
            index,
            1,
          );
        }
      }

      for (
        let index =
          trails.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          trails[index].life <= 0
        ) {
          trails.splice(index, 1);
        }
      }

      for (
        let index =
          labels.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          labels[index].life <= 0
        ) {
          labels.splice(index, 1);
        }
      }
    };

    const drawHoop = (
      hoop: Hoop,
      target: boolean,
      current: boolean,
    ) => {
      const screenY =
        hoop.y - camera.y;

      if (
        screenY < -130 ||
        screenY >
          viewport.height + 140
      ) {
        return;
      }

      const pulse = clamp(
        hoop.netPulse,
        0,
        0.58,
      );

      const netDepth =
        hoop.netDepth +
        pulse * 3.2;

      const topHalfWidth =
        hoop.width / 2;

      const bottomHalfWidth =
        hoop.bottomWidth / 2 -
        pulse * 0.8;

      const netSway = clamp(
        hoop.netPulseVelocity * 0.45,
        -0.45,
        0.45,
      );

      context.save();

      context.translate(
        hoop.x,
        screenY,
      );

      context.rotate(hoop.angle);

      if (target) {
        const targetPulse =
          0.75 +
          Math.sin(
            performance.now() *
              0.005,
          ) *
            0.1;

        const glow =
          context.createRadialGradient(
            0,
            12,
            2,
            0,
            12,
            hoop.width * 1.08,
          );

        glow.addColorStop(
          0,
          `hsla(${hoop.accentHue},100%,62%,${0.13 * targetPulse})`,
        );

        glow.addColorStop(
          1,
          `hsla(${hoop.accentHue},100%,55%,0)`,
        );

        context.fillStyle = glow;

        context.fillRect(
          -hoop.width * 1.25,
          -hoop.width,
          hoop.width * 2.5,
          hoop.width * 2.2,
        );
      }

      const netGradient =
        context.createLinearGradient(
          0,
          3,
          0,
          netDepth,
        );

      netGradient.addColorStop(
        0,
        'rgba(255,255,255,0.012)',
      );

      netGradient.addColorStop(
        1,
        'rgba(255,255,255,0.075)',
      );

      context.fillStyle =
        netGradient;

      context.beginPath();

      context.moveTo(
        -topHalfWidth + 3,
        3,
      );

      context.bezierCurveTo(
        -topHalfWidth * 0.84,
        netDepth * 0.32,
        -bottomHalfWidth +
          netSway * 0.08,
        netDepth * 0.78,
        -bottomHalfWidth +
          netSway * 0.06,
        netDepth,
      );

      context.quadraticCurveTo(
        netSway * 0.08,
        netDepth + 5 + pulse,
        bottomHalfWidth +
          netSway * 0.06,
        netDepth,
      );

      context.bezierCurveTo(
        bottomHalfWidth +
          netSway * 0.08,
        netDepth * 0.78,
        topHalfWidth * 0.84,
        netDepth * 0.32,
        topHalfWidth - 3,
        3,
      );

      context.closePath();
      context.fill();

      context.lineWidth = 1.05;

      context.strokeStyle = current
        ? 'rgba(255,255,255,0.43)'
        : target
          ? 'rgba(255,255,255,0.52)'
          : 'rgba(255,255,255,0.22)';

      for (
        let index = 0;
        index <= 7;
        index += 1
      ) {
        const progress =
          index / 7;

        const topX =
          -topHalfWidth +
          hoop.width * progress;

        const bottomX =
          -bottomHalfWidth +
          bottomHalfWidth *
            2 *
            progress;

        context.beginPath();

        context.moveTo(topX, 4);

        context.bezierCurveTo(
          topX * 0.73,
          netDepth * 0.33,
          bottomX +
            netSway * 0.04,
          netDepth * 0.75,
          bottomX +
            netSway * 0.06,
          netDepth,
        );

        context.stroke();
      }

      for (
        let row = 1;
        row <= 4;
        row += 1
      ) {
        const progress = row / 5;

        const rowHalfWidth =
          lerp(
            topHalfWidth,
            bottomHalfWidth,
            progress,
          );

        const rowY =
          4 + netDepth * progress;

        const rowSway =
          netSway *
          progress *
          0.06;

        context.beginPath();

        context.moveTo(
          -rowHalfWidth + rowSway,
          rowY,
        );

        context.quadraticCurveTo(
          rowSway,
          rowY +
            2.2 +
            pulse * 0.35,
          rowHalfWidth + rowSway,
          rowY,
        );

        context.stroke();
      }

      context.lineWidth = 1.7;

      context.strokeStyle =
        'rgba(255,255,255,0.48)';

      context.beginPath();

      context.moveTo(
        -bottomHalfWidth +
          netSway * 0.06,
        netDepth,
      );

      context.quadraticCurveTo(
        netSway * 0.08,
        netDepth + 5 + pulse,
        bottomHalfWidth +
          netSway * 0.06,
        netDepth,
      );

      context.stroke();

      const rimHue = target
        ? hoop.accentHue
        : 23;

      context.lineCap = 'round';

      context.shadowBlur =
        target ? 18 : 8;

      context.shadowColor =
        `hsla(${rimHue},100%,55%,${target ? 0.76 : 0.38})`;

      context.strokeStyle = current
        ? '#f8b15b'
        : `hsl(${rimHue},94%,60%)`;

      context.lineWidth =
        target ? 6.1 : 5.4;

      context.beginPath();

      context.ellipse(
        0,
        0,
        topHalfWidth,
        5.5,
        0,
        0,
        Math.PI * 2,
      );

      context.stroke();

      context.shadowBlur = 0;

      context.strokeStyle =
        'rgba(255,255,255,0.5)';

      context.lineWidth = 1;

      context.beginPath();

      context.ellipse(
        0,
        -1.4,
        topHalfWidth - 2,
        3.8,
        0,
        0,
        Math.PI * 2,
      );

      context.stroke();

      context.restore();
    };

    const drawTrails = () => {
      const fire =
        internalCombo >=
        GAME.fireCombo;

      for (
        let index = 0;
        index < trails.length;
        index += 1
      ) {
        const trail =
          trails[index];

        const alpha =
          clamp(
            trail.life,
            0,
            1,
          ) *
          ((index + 1) /
            Math.max(
              1,
              trails.length,
            ));

        const screenY =
          trail.y - camera.y;

        const hue = fire
          ? 16 + index * 0.8
          : 185;

        const radiusMultiplier =
          fire ? 1.72 : 2.05;

        const glow =
          context.createRadialGradient(
            trail.x,
            screenY,
            0,
            trail.x,
            screenY,
            trail.size *
              radiusMultiplier,
          );

        glow.addColorStop(
          0,
          `hsla(${hue},100%,64%,${alpha * (fire ? 0.42 : 0.46)})`,
        );

        glow.addColorStop(
          1,
          `hsla(${hue},100%,50%,0)`,
        );

        context.fillStyle =
          glow;

        context.beginPath();

        context.arc(
          trail.x,
          screenY,
          trail.size *
            radiusMultiplier,
          0,
          Math.PI * 2,
        );

        context.fill();
      }
    };

    const drawBall = () => {
      const screenY =
        ball.y - camera.y;

      const fire =
        internalCombo >=
        GAME.fireCombo;

      drawTrails();

      context.save();

      context.translate(
        ball.x,
        screenY,
      );

      context.rotate(
        ball.rotation,
      );

      const glowRadius =
        ball.radius *
        (fire ? 2.55 : 2.05);

      const outerGlow =
        context.createRadialGradient(
          0,
          0,
          ball.radius * 0.28,
          0,
          0,
          glowRadius,
        );

      outerGlow.addColorStop(
        0,
        fire
          ? 'rgba(255,230,128,0.74)'
          : 'rgba(247,165,75,0.32)',
      );

      outerGlow.addColorStop(
        0.38,
        fire
          ? 'rgba(255,98,24,0.36)'
          : 'rgba(247,165,75,0.12)',
      );

      outerGlow.addColorStop(
        1,
        'rgba(255,55,10,0)',
      );

      context.fillStyle =
        outerGlow;

      context.beginPath();

      context.arc(
        0,
        0,
        glowRadius,
        0,
        Math.PI * 2,
      );

      context.fill();

      const ballGradient =
        context.createRadialGradient(
          -6,
          -7,
          2,
          1,
          2,
          ball.radius * 1.32,
        );

      ballGradient.addColorStop(
        0,
        fire
          ? '#fff1a6'
          : '#ffd27c',
      );

      ballGradient.addColorStop(
        0.38,
        fire
          ? '#ff8e26'
          : '#ef8f36',
      );

      ballGradient.addColorStop(
        1,
        fire
          ? '#d92d00'
          : '#9d3b20',
      );

      context.fillStyle =
        ballGradient;

      context.shadowBlur =
        fire ? 14 : 9;

      context.shadowColor = fire
        ? 'rgba(255,84,23,0.72)'
        : 'rgba(241,132,45,0.58)';

      context.beginPath();

      context.arc(
        0,
        0,
        ball.radius,
        0,
        Math.PI * 2,
      );

      context.fill();

      context.shadowBlur = 0;

      context.strokeStyle =
        'rgba(61,20,12,0.8)';

      context.lineWidth = 2;

      context.beginPath();

      context.arc(
        0,
        0,
        ball.radius * 0.94,
        -0.66,
        0.66,
      );

      context.stroke();

      context.beginPath();

      context.arc(
        0,
        0,
        ball.radius * 0.94,
        Math.PI - 0.66,
        Math.PI + 0.66,
      );

      context.stroke();

      context.beginPath();

      context.moveTo(
        -ball.radius,
        0,
      );

      context.quadraticCurveTo(
        0,
        -4,
        ball.radius,
        0,
      );

      context.stroke();

      context.beginPath();

      context.moveTo(
        0,
        -ball.radius,
      );

      context.quadraticCurveTo(
        -4,
        0,
        0,
        ball.radius,
      );

      context.stroke();

      context.restore();
    };

    const drawAimTrajectory = () => {
      if (
        !aim.active ||
        currentPhase !== 'ready'
      ) {
        return;
      }

      const pullX =
        ball.x - aim.x;

      const pullY =
        ball.y - aim.y;

      const pullDistance =
        Math.hypot(
          pullX,
          pullY,
        ) || 1;

      const limitedDistance =
        Math.min(
          GAME.maxPull,
          pullDistance,
        );

      const initialVelocityX =
        (pullX / pullDistance) *
        limitedDistance *
        GAME.launchPower;

      const initialVelocityY =
        (pullY / pullDistance) *
        limitedDistance *
        GAME.launchPower;

      context.save();

      context.lineCap = 'round';

      context.setLineDash([
        2.5,
        6,
      ]);

      context.lineWidth = 1.4;

      context.strokeStyle =
        `rgba(255,255,255,${0.13 + aim.power * 0.25})`;

      context.beginPath();

      context.moveTo(
        ball.x,
        ball.y - camera.y,
      );

      context.lineTo(
        lerp(
          ball.x,
          aim.x,
          0.61,
        ),
        lerp(
          ball.y,
          aim.y,
          0.61,
        ) - camera.y,
      );

      context.stroke();

      context.setLineDash([]);

      let previewX = ball.x;
      let previewY = ball.y;

      let previewVelocityX =
        initialVelocityX;

      let previewVelocityY =
        initialVelocityY;

      const previewStep = 0.054;

      for (
        let index = 1;
        index <= 8;
        index += 1
      ) {
        previewVelocityY +=
          GAME.gravity *
          previewStep;

        previewX +=
          previewVelocityX *
          previewStep;

        previewY +=
          previewVelocityY *
          previewStep;

        const alpha =
          1 - index / 9;

        context.fillStyle =
          internalCombo >=
          GAME.fireCombo
            ? `rgba(255,116,36,${alpha * 0.76})`
            : `rgba(255,255,255,${alpha * 0.48})`;

        context.beginPath();

        context.arc(
          previewX,
          previewY - camera.y,
          2 + alpha * 1.6,
          0,
          Math.PI * 2,
        );

        context.fill();
      }

      context.restore();
    };

    const drawEffects = () => {
      for (
        const particle of particles
      ) {
        const alpha = clamp(
          particle.life /
            particle.maxLife,
          0,
          1,
        );

        context.globalAlpha =
          alpha;

        context.fillStyle =
          `hsl(${particle.hue},100%,66%)`;

        context.shadowBlur = 9;

        context.shadowColor =
          `hsla(${particle.hue},100%,55%,0.78)`;

        context.beginPath();

        context.arc(
          particle.x,
          particle.y - camera.y,
          particle.size * alpha,
          0,
          Math.PI * 2,
        );

        context.fill();
      }

      context.globalAlpha = 1;
      context.shadowBlur = 0;

      for (const label of labels) {
        const alpha = clamp(
          label.life,
          0,
          1,
        );

        const scale =
          label.scale *
          (0.94 +
            (1 - alpha) * 0.18);

        context.save();

        context.translate(
          label.x,
          label.y - camera.y,
        );

        context.scale(
          scale,
          scale,
        );

        context.globalAlpha =
          alpha;

        context.textAlign =
          'center';

        context.textBaseline =
          'middle';

        context.font =
          '900 12px Supercell, system-ui, sans-serif';

        context.shadowBlur = 15;

        context.shadowColor =
          `hsla(${label.hue},100%,55%,0.88)`;

        context.fillStyle =
          `hsl(${label.hue},100%,70%)`;

        context.fillText(
          label.text,
          0,
          0,
        );

        context.restore();
      }

      if (missFlash > 0.01) {
        context.fillStyle =
          `rgba(255,38,77,${missFlash * 0.07})`;

        context.fillRect(
          0,
          0,
          viewport.width,
          viewport.height,
        );
      }
    };

    const render = () => {
      context.clearRect(
        0,
        0,
        viewport.width,
        viewport.height,
      );

      const shakeX =
        camera.shake > 0.1
          ? (effectRandom() - 0.5) *
            camera.shake
          : 0;

      const shakeY =
        camera.shake > 0.1
          ? (effectRandom() - 0.5) *
            camera.shake
          : 0;

      context.save();

      context.translate(
        shakeX,
        shakeY,
      );

      for (
        let index = 0;
        index < hoops.length;
        index += 1
      ) {
        drawHoop(
          hoops[index],
          index ===
            currentHoopIndex + 1,
          index ===
            currentHoopIndex,
        );
      }

      drawAimTrajectory();
      drawBall();
      drawEffects();

      context.restore();
    };

    const animationLoop = (
      currentTime: number,
    ) => {
      const deltaTime = Math.max(
        0,
        Math.min(
          34,
          currentTime -
            previousFrameTime,
        ) / 1000,
      );

      previousFrameTime =
        currentTime;

      updateNetPhysics(deltaTime);

      updateBall(
        deltaTime,
        currentTime,
      );

      updateEffects(deltaTime);

      render();

      animationFrameRef.current =
        window.requestAnimationFrame(
          animationLoop,
        );
    };

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      if (
        currentPhase !== 'ready' ||
        matchPhaseRef.current !== 'playing'
      ) {
        return;
      }

      const pointer =
        pointerToWorld(
          event.clientX,
          event.clientY,
        );

      const distanceToBall =
        Math.hypot(
          pointer.x - ball.x,
          pointer.y - ball.y,
        );

      if (distanceToBall > 82) {
        return;
      }

      event.preventDefault();

      canvas.setPointerCapture(
        event.pointerId,
      );

      aim.active = true;

      aim.pointerId =
        event.pointerId;

      aim.x = pointer.x;
      aim.y = pointer.y;
      aim.power = 0;

      setShowHint(false);

      triggerHaptic('light');
    };

    const handlePointerMove = (
      event: PointerEvent,
    ) => {
      if (
        !aim.active ||
        aim.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const pointer =
        pointerToWorld(
          event.clientX,
          event.clientY,
        );

      const differenceX =
        pointer.x - ball.x;

      const differenceY =
        pointer.y - ball.y;

      const distance =
        Math.hypot(
          differenceX,
          differenceY,
        ) || 1;

      const pullDistance =
        Math.min(
          GAME.maxPull,
          distance,
        );

      aim.x =
        ball.x +
        (differenceX / distance) *
          pullDistance;

      aim.y =
        ball.y +
        (differenceY / distance) *
          pullDistance;

      aim.power =
        pullDistance /
        GAME.maxPull;
    };

    const releaseShot = (
      event: PointerEvent,
    ) => {
      if (
        !aim.active ||
        aim.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const pullX =
        ball.x - aim.x;

      const pullY =
        ball.y - aim.y;

      const pullDistance =
        Math.hypot(
          pullX,
          pullY,
        );

      const power = aim.power;

      aim.active = false;
      aim.pointerId = null;

      if (pullDistance < 18) {
        return;
      }

      const launchSpeed =
        Math.min(
          GAME.maxLaunchSpeed,
          pullDistance *
            GAME.launchPower,
        );

      ball.vx =
        (pullX / pullDistance) *
        launchSpeed;

      ball.vy =
        (pullY / pullDistance) *
        launchSpeed;

      shotStartedAt =
        performance.now();

      rimTouched = false;
      leftCurrentHoop = false;

      changePhase('flying');

      triggerHaptic(
        power > 0.76
          ? 'medium'
          : 'light',
      );
    };

    const preventTouchScrolling = (
      event: TouchEvent,
    ) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    resizeCanvas();

    window.addEventListener(
      'resize',
      resizeCanvas,
    );

    canvas.addEventListener(
      'pointerdown',
      handlePointerDown,
    );

    canvas.addEventListener(
      'pointermove',
      handlePointerMove,
    );

    canvas.addEventListener(
      'pointerup',
      releaseShot,
    );

    canvas.addEventListener(
      'pointercancel',
      releaseShot,
    );

    container.addEventListener(
      'touchstart',
      preventTouchScrolling,
      {
        passive: false,
      },
    );

    container.addEventListener(
      'touchmove',
      preventTouchScrolling,
      {
        passive: false,
      },
    );

    animationFrameRef.current =
      window.requestAnimationFrame(
        animationLoop,
      );

    return () => {
      if (
        animationFrameRef.current !==
        null
      ) {
        window.cancelAnimationFrame(
          animationFrameRef.current,
        );
      }

      window.removeEventListener(
        'resize',
        resizeCanvas,
      );

      canvas.removeEventListener(
        'pointerdown',
        handlePointerDown,
      );

      canvas.removeEventListener(
        'pointermove',
        handlePointerMove,
      );

      canvas.removeEventListener(
        'pointerup',
        releaseShot,
      );

      canvas.removeEventListener(
        'pointercancel',
        releaseShot,
      );

      container.removeEventListener(
        'touchstart',
        preventTouchScrolling,
      );

      container.removeEventListener(
        'touchmove',
        preventTouchScrolling,
      );
    };
  }, [matchSeed]);

  if (!lobbyId) {
    return (
      <ConnectionNotice
        title="Лобби не найдено"
        subtitle="Открой Dunk Shot через игровую комнату, чтобы получить идентификатор матча."
        onBack={() => navigate(lobbiesPath, { replace: true })}
      />
    );
  }

  if (!token) {
    return (
      <ConnectionNotice
        title="Нет авторизации"
        subtitle="Перезапусти приложение через Telegram и снова открой лобби."
        onBack={() => navigate(lobbiesPath, { replace: true })}
      />
    );
  }

  if (!serverState && connectionStatus !== 'open') {
    return (
      <ConnectionNotice
        title={connectionStatus === 'error' ? 'Ошибка соединения' : 'Подключение'}
        subtitle={
          socketError ||
          (connectionStatus === 'closed'
            ? 'Соединение с матчем закрыто.'
            : 'Подключаемся к общему игровому серверу.')
        }
        onBack={() => navigate(lobbiesPath, { replace: true })}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="dunk-shot-game relative h-full min-h-[440px] w-full select-none overflow-hidden bg-transparent text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <header className="dunk-shot-hud pointer-events-none absolute inset-x-0 top-[4px] z-30 px-3 pt-3">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PlayerAvatar
              photoUrl={playerProfile.photoUrl}
              name={playerProfile.name}
              side="player"
            />

            <div className="min-w-0">
              <div className="max-w-[90px] truncate text-[9px] font-black leading-none text-white/90">
                {playerProfile.name}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[20px] font-black leading-none tabular-nums text-[#52FFE5]">
                  {myScore}
                </span>
                <span
                  className={[
                    'text-[7px] font-black uppercase tracking-[0.12em]',
                    fireballActive ? 'text-[#ff9d55]' : 'text-white/34',
                  ].join(' ')}
                >
                  x{Math.max(1, multiplier)} · c{myCombo}
                </span>
              </div>
            </div>
          </div>

          <div className="w-[72px] shrink-0 text-center">
            <div
              className={[
                'font-black leading-none tabular-nums',
                serverState?.phase === 'countdown'
                  ? 'text-[28px] text-[#F2A65A]'
                  : 'text-[23px] text-white',
              ].join(' ')}
            >
              {serverState?.phase === 'countdown'
                ? Math.max(1, countdownLeft)
                : serverState?.phase === 'playing'
                  ? matchTimeLeft
                  : serverState?.phase === 'match_over'
                    ? '0'
                    : '--'}
            </div>
            <div className="mt-1 text-[6px] font-black uppercase tracking-[0.16em] text-white/28">
              {serverState?.phase === 'countdown'
                ? 'start'
                : serverState?.phase === 'playing'
                  ? 'seconds'
                  : statusText}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[90px] truncate text-[9px] font-black leading-none text-white/90">
                {opponentProfile.name}
              </div>

              <div className="mt-1.5 flex items-baseline justify-end gap-1.5">
                <span className="text-[7px] font-black uppercase tracking-[0.12em] text-white/34">
                  c{opponentCombo}
                </span>
                <span className="text-[20px] font-black leading-none tabular-nums text-[#F2A65A]">
                  {opponentScore}
                </span>
              </div>
            </div>

            <PlayerAvatar
              photoUrl={opponentProfile.photoUrl}
              name={opponentProfile.name}
              side="opponent"
            />
          </div>
        </div>

        {(socketError || connectionStatus !== 'open') && (
          <div className="mx-auto mt-2 max-w-[280px] rounded-full border border-[#FF7A90]/20 bg-black/35 px-3 py-1.5 text-center text-[7px] font-black uppercase tracking-[0.13em] text-[#FF9BB0] backdrop-blur-md">
            {socketError || 'Переподключение'}
          </div>
        )}
      </header>

      {showHint && serverState?.phase === 'playing' && phase === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="animate-pulse text-[9px] font-black uppercase tracking-[0.17em] text-white/42">
            Потяни мяч и отпусти
          </div>
        </div>
      )}

      {serverState?.phase === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/30 px-5 backdrop-blur-[2px]">
          <div className="rounded-[24px] border border-white/10 bg-[#11100e]/92 px-5 py-4 text-center shadow-[0_22px_70px_rgba(0,0,0,0.4)]">
            <div className="text-[16px] font-black uppercase text-white">
              Ждём соперника
            </div>
            <div className="mt-2 text-[8px] font-black uppercase tracking-[0.15em] text-white/35">
              Игра начнётся, когда подключатся оба игрока
            </div>
          </div>
        </div>
      )}

      {serverState?.phase === 'countdown' && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/28 backdrop-blur-[1px]">
          <div
            key={countdownLeft}
            className="animate-pulse text-[72px] font-black leading-none text-[#F2A65A] drop-shadow-[0_0_30px_rgba(242,166,90,0.45)]"
          >
            {Math.max(1, countdownLeft)}
          </div>
        </div>
      )}

      {serverState?.phase === 'match_over' && (
        <PremiumGameResultModal
          gameTitle="Dunk Shot"
          resultTitle={
            serverState.draw
              ? 'Ничья'
              : winnerUserId === myUserId
                ? 'Победа'
                : 'Поражение'
          }
          players={[
            { ...playerProfile, score: myScore },
            { ...opponentProfile, score: opponentScore },
          ]}
          winnerUserID={winnerUserId}
          draw={serverState.draw}
          netResult={
            serverState.draw
              ? 0
              : winnerUserId === myUserId
                ? Math.round((Number(window.sessionStorage.getItem('twingames_active_bet')) || 0) * 90) / 100
                : -(Number(window.sessionStorage.getItem('twingames_active_bet')) || 0)
          }
          netLabel="Чистый результат"
          continueLabel="К списку лобби"
          onContinue={() => navigate(lobbiesPath, { replace: true })}
          theme={{ background: '#17100a', accent: '#f2a65a', rival: '#52ffe5' }}
        />
      )}
    </div>
  );
};

export default DunkShotGame;
