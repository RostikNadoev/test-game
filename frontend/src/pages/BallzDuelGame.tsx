import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import {
  type BallzStageLayout,
} from '../api/arcadeRaceWs';
import {
  useBallzDuelOnline,
  type BallzPlayerProfile,
} from '../hooks/useBallzDuelOnline';

type LocalMode =
  | 'aiming'
  | 'firing'
  | 'awaiting_server'
  | 'transition'
  | 'waiting_finish';

type SimBall = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  launched: boolean;
  returned: boolean;
  lastBrickId: number | null;
  lastBrickHitAt: number;
};

type LocalBrick = {
  id: number;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  hitFlash: number;
};

type LocalPickup = {
  id: number;
  col: number;
  row: number;
  alive: boolean;
};

type BoardLayout = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cell: number;
};

type StageTheme = {
  backgroundTop: string;
  backgroundBottom: string;
  board: string;
  grid: string;
  accent: string;
  accentSoft: string;
  brickA: string;
  brickB: string;
  brickHot: string;
  pickup: string;
  cannon: string;
};

const THEMES: readonly StageTheme[] = [
  {
    backgroundTop: '#071425',
    backgroundBottom: '#07101b',
    board: '#0b1c2e',
    grid: 'rgba(86,190,255,.055)',
    accent: '#56e3ff',
    accentSoft: 'rgba(86,227,255,.17)',
    brickA: '#207bc1',
    brickB: '#2854ad',
    brickHot: '#e8a93a',
    pickup: '#64ffc3',
    cannon: '#ffd64a',
  },
  {
    backgroundTop: '#17102f',
    backgroundBottom: '#09081c',
    board: '#1a123b',
    grid: 'rgba(181,145,255,.055)',
    accent: '#b58cff',
    accentSoft: 'rgba(181,140,255,.17)',
    brickA: '#7854ef',
    brickB: '#4d60d8',
    brickHot: '#ef6e9f',
    pickup: '#67e8ff',
    cannon: '#f7d35f',
  },
] as const;

const STAGE_COUNT = 2;
const WORLD_COLS = 7;
const WORLD_ROWS = 9;
const BRICK_ROWS = 6;
const BRICK_PADDING = 0.075;
const BALL_RADIUS = 0.11;
const BALL_SPEED = 9.7;
const FIXED_STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 5;
const LAUNCH_INTERVAL = 0.052;
const SAME_BRICK_COOLDOWN = 0.034;
const CANNON_Y = 8.28;
const BALL_START_Y = 7.98;
const RETURN_Y = 8.92;

const DEFAULT_SELECTED_BALLS = 12;

const IS_MOBILE_RENDER =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth <= 640);

const DPR_CAP = IS_MOBILE_RENDER ? 1 : 1.15;
const BREAK_UI_THROTTLE_MS = IS_MOBILE_RENDER ? 150 : 100;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

const formatReward = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));

const initials = (name: string) =>
  name.replace('@', '').trim().slice(0, 2).toUpperCase() || 'TG';

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function PlayerAvatar({
  profile,
  size = 36,
}: {
  profile: BallzPlayerProfile;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-[13px] border border-white/[0.1] bg-white/[0.06] text-[8px] font-black uppercase leading-[1.65] text-[#56e3ff]"
      style={{ width: size, height: size }}
    >
      {profile.photoUrl ? (
        <img
          src={profile.photoUrl}
          alt={profile.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        initials(profile.name)
      )}
    </div>
  );
}

function CountUp({
  target,
  active,
  duration = 650,
  decimals = 0,
  suffix = '',
}: {
  target: number;
  active: boolean;
  duration?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setValue(target * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [active, duration, target]);

  if (!active) {
    return <span>—</span>;
  }

  return (
    <span>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function BallzDuelGame() {
  const match = useBallzDuelOnline();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const boardRef = useRef<BoardLayout>({
    left: 8,
    right: 352,
    top: 8,
    bottom: 540,
    cell: 49,
  });

  const bricksRef = useRef<LocalBrick[]>([]);
  const pickupsRef = useRef<LocalPickup[]>([]);
  const ballsRef = useRef<SimBall[]>([]);
  const brickCandidatesRef = useRef<Array<Array<LocalBrick[]>>>(
    Array.from({ length: BRICK_ROWS }, () =>
      Array.from({ length: WORLD_COLS }, () => [] as LocalBrick[]),
    ),
  );
  const pickupCandidatesRef = useRef<Array<Array<LocalPickup[]>>>(
    Array.from({ length: BRICK_ROWS }, () =>
      Array.from({ length: WORLD_COLS }, () => [] as LocalPickup[]),
    ),
  );
  const renderDprRef = useRef(1);
  const lastCanvasSizeRef = useRef({
    width: 0,
    height: 0,
    dpr: 0,
  });
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticCacheKeyRef = useRef('');
  const brickSpriteCacheRef = useRef<{
    key: string;
    normal: HTMLCanvasElement;
    hot: HTMLCanvasElement;
    pickup: HTMLCanvasElement;
  } | null>(null);
  const lastBreakUiAtRef = useRef(0);

  const localModeRef = useRef<LocalMode>('aiming');
  const localStageIndexRef = useRef(0);
  const launchXRef = useRef(0.5);
  const aimAngleRef = useRef(-Math.PI / 2);
  const lastAutomaticSyncKeyRef = useRef('');
  const aimReadyRef = useRef(false);
  const pointerActiveRef = useRef(false);

  const lastFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const shotElapsedRef = useRef(0);
  const nextLaunchAtRef = useRef(0);
  const launchIndexRef = useRef(0);
  const launchCountRef = useRef(0);
  const activeBallCountRef = useRef(0);
  const firstReturnXRef = useRef<number | null>(null);

  const eventTimerRef = useRef<number | null>(null);
  const stageTimerRef = useRef<number | null>(null);

  const [localMode, setLocalMode] = useState<LocalMode>('aiming');
  const [localStageIndex, setLocalStageIndex] = useState(0);
  const [selectedBalls, setSelectedBalls] = useState(
    DEFAULT_SELECTED_BALLS,
  );
  const [aimReady, setAimReady] = useState(false);
  const [lastEvent, setLastEvent] = useState('SET DIRECTION');
  const [pendingEventId, setPendingEventId] = useState(0);
  const [localVolleyDone, setLocalVolleyDone] = useState(false);
  const [transitionStage, setTransitionStage] = useState<number | null>(
    null,
  );
  const [resultStage, setResultStage] = useState(0);

  const theme = THEMES[localStageIndex] || THEMES[0];

  const setMode = useCallback((mode: LocalMode) => {
    localModeRef.current = mode;
    setLocalMode(mode);
  }, []);

  const setTemporaryEvent = useCallback(
    (text: string, duration = 500) => {
      const now = performance.now();

      if (
        text === 'BREAK' &&
        now - lastBreakUiAtRef.current < BREAK_UI_THROTTLE_MS
      ) {
        return;
      }

      if (text === 'BREAK') {
        lastBreakUiAtRef.current = now;
      }

      setLastEvent(text);

      if (eventTimerRef.current !== null) {
        window.clearTimeout(eventTimerRef.current);
      }

      eventTimerRef.current = window.setTimeout(() => {
        if (
          match.phaseRef.current === 'playing' &&
          localModeRef.current === 'aiming'
        ) {
          setLastEvent(
            aimReadyRef.current ? 'READY · TAP FIRE' : 'SET DIRECTION',
          );
        } else {
          setLastEvent('');
        }

        eventTimerRef.current = null;
      }, duration);
    },
    [match.phaseRef],
  );

  const rebuildLocalBoard = useCallback(
    (
      stageNumber: number,
      layout: BallzStageLayout,
      hp: number[],
      pickupAlive: boolean[],
      launchX: number,
    ) => {
      const stageIndex = clamp(stageNumber - 1, 0, STAGE_COUNT - 1);

      localStageIndexRef.current = stageIndex;
      setLocalStageIndex(stageIndex);

      bricksRef.current = layout.bricks.map((brick, index) => {
        const currentHP = Math.max(
          0,
          Math.trunc(hp[index] ?? brick.hp),
        );

        return {
          id: brick.id,
          col: brick.col,
          row: brick.row,
          hp: currentHP,
          maxHp: brick.hp,
          alive: currentHP > 0,
          hitFlash: 0,
        };
      });

      pickupsRef.current = layout.pickups.map((pickup, index) => ({
        id: pickup.id,
        col: pickup.col,
        row: pickup.row,
        alive: pickupAlive[index] ?? true,
      }));

      brickCandidatesRef.current = Array.from(
        { length: BRICK_ROWS },
        (_, row) =>
          Array.from({ length: WORLD_COLS }, (_, col) =>
            bricksRef.current.filter(
              (brick) =>
                Math.abs(brick.row - row) <= 1 &&
                Math.abs(brick.col - col) <= 1,
            ),
          ),
      );

      pickupCandidatesRef.current = Array.from(
        { length: BRICK_ROWS },
        (_, row) =>
          Array.from({ length: WORLD_COLS }, (_, col) =>
            pickupsRef.current.filter(
              (pickup) =>
                Math.abs(pickup.row - row) <= 1 &&
                Math.abs(pickup.col - col) <= 1,
            ),
          ),
      );

      ballsRef.current = [];
      launchXRef.current = clamp(launchX, 0.035, 0.965);
      aimAngleRef.current = -Math.PI / 2;
      aimReadyRef.current = false;
      setAimReady(false);
      pointerActiveRef.current = false;
      accumulatorRef.current = 0;
      shotElapsedRef.current = 0;
      firstReturnXRef.current = null;

      setSelectedBalls((value) =>
        clamp(
          value || DEFAULT_SELECTED_BALLS,
          1,
          Math.max(1, match.myAvailableBalls),
        ),
      );
    },
    [match.myAvailableBalls],
  );

  const syncFromServer = useCallback(() => {
    const stageIndex = clamp(match.myStage - 1, 0, STAGE_COUNT - 1);
    const layout = match.stages[stageIndex];

    if (!layout) {
      return false;
    }

    rebuildLocalBoard(
      match.myStage,
      layout,
      match.myBrickHP,
      match.myPickupAlive,
      match.myLaunchX,
    );

    if (match.myFinished) {
      setMode('waiting_finish');
      setLastEvent('DONE');
    } else {
      setMode('aiming');
      setLastEvent('SET DIRECTION');
    }

    return true;
  }, [
    match.myBrickHP,
    match.myFinished,
    match.myLaunchX,
    match.myPickupAlive,
    match.myStage,
    match.stages,
    rebuildLocalBoard,
    setMode,
  ]);

  const ownSnapshotKey = useMemo(
    () =>
      [
        match.matchInstanceKey,
        match.myStage,
        match.myLaunchX.toFixed(4),
        match.myBrickHP.join(','),
        match.myPickupAlive.map((value: boolean) => (value ? '1' : '0')).join(''),
      ].join('|'),
    [
      match.matchInstanceKey,
      match.myBrickHP,
      match.myLaunchX,
      match.myPickupAlive,
      match.myStage,
    ],
  );

  useEffect(() => {
    if (!match.stages.length) {
      return;
    }

    if (
      localModeRef.current === 'firing' ||
      localModeRef.current === 'awaiting_server' ||
      pendingEventId > 0
    ) {
      return;
    }

    if (lastAutomaticSyncKeyRef.current === ownSnapshotKey) {
      return;
    }

    if (syncFromServer()) {
      lastAutomaticSyncKeyRef.current = ownSnapshotKey;
    }
  }, [match.stages.length, ownSnapshotKey, pendingEventId, syncFromServer]);

  useEffect(() => {
    setSelectedBalls((value) =>
      clamp(value, 1, Math.max(1, match.myAvailableBalls)),
    );
  }, [match.myAvailableBalls]);

  useEffect(() => {
    if (
      !localVolleyDone ||
      pendingEventId <= 0 ||
      match.myLastEventId < pendingEventId
    ) {
      return;
    }

    const previousStage = localStageIndexRef.current + 1;

    setLocalVolleyDone(false);
    setPendingEventId(0);

    if (match.myFinished) {
      syncFromServer();
      setMode('waiting_finish');
      setLastEvent('DONE');
      return;
    }

    if (match.myStage !== previousStage) {
      setMode('transition');
      setTransitionStage(match.myStage);

      if (stageTimerRef.current !== null) {
        window.clearTimeout(stageTimerRef.current);
      }

      stageTimerRef.current = window.setTimeout(() => {
        syncFromServer();
        setTransitionStage(null);
        setMode('aiming');
        setLastEvent('SET DIRECTION');
        stageTimerRef.current = null;
      }, 600);

      return;
    }

    syncFromServer();
    setMode('aiming');
    setLastEvent('SET DIRECTION');
  }, [
    localVolleyDone,
    match.myFinished,
    match.myLastEventId,
    match.myStage,
    pendingEventId,
    setMode,
    syncFromServer,
  ]);

  useEffect(() => {
    if (
      localMode === 'awaiting_server' &&
      match.socketError &&
      pendingEventId > 0
    ) {
      setPendingEventId(0);
      setLocalVolleyDone(false);
      syncFromServer();
    }
  }, [
    localMode,
    match.socketError,
    pendingEventId,
    syncFromServer,
  ]);

  useEffect(() => {
    if (match.phase !== 'match_over') {
      return;
    }

    ballsRef.current = [];
    activeBallCountRef.current = 0;
    setLocalVolleyDone(false);
    setPendingEventId(0);
    setMode('waiting_finish');
    setResultStage(0);

    const timers = [
      window.setTimeout(() => setResultStage(1), 350),
      window.setTimeout(() => setResultStage(2), 1_150),
      window.setTimeout(() => setResultStage(3), 1_950),
      window.setTimeout(() => setResultStage(4), 2_850),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [match.phase, setMode]);

  useEffect(() => {
    return () => {
      if (eventTimerRef.current !== null) {
        window.clearTimeout(eventTimerRef.current);
      }
      if (stageTimerRef.current !== null) {
        window.clearTimeout(stageTimerRef.current);
      }
    };
  }, []);

  const changeSelectedBalls = useCallback(
    (value: number) => {
      if (
        match.phaseRef.current !== 'playing' ||
        localModeRef.current !== 'aiming'
      ) {
        return;
      }

      setSelectedBalls(
        clamp(
          Math.round(value),
          1,
          Math.max(1, match.myAvailableBalls),
        ),
      );
    },
    [match.myAvailableBalls, match.phaseRef],
  );

  const updateAimFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (
        match.phaseRef.current !== 'playing' ||
        localModeRef.current !== 'aiming' ||
        match.myFinished
      ) {
        return;
      }

      const wrap = wrapRef.current;
      if (!wrap) {
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const board = boardRef.current;

      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      const launchScreenX =
        board.left + launchXRef.current * (board.right - board.left);
      const launchScreenY = board.top + CANNON_Y * board.cell;

      const worldDX = (screenX - launchScreenX) / board.cell;
      const worldDY = (screenY - launchScreenY) / board.cell;

      let angle = Math.atan2(worldDY, worldDX);
      angle = clamp(angle, -Math.PI + 0.16, -0.16);

      aimAngleRef.current = angle;

      if (!aimReadyRef.current) {
        aimReadyRef.current = true;
        setAimReady(true);
      }
    },
    [match.myFinished, match.phaseRef],
  );

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      match.phaseRef.current !== 'playing' ||
      localModeRef.current !== 'aiming' ||
      match.myFinished
    ) {
      return;
    }

    pointerActiveRef.current = true;
    updateAimFromPointer(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!pointerActiveRef.current) {
      return;
    }

    updateAimFromPointer(event.clientX, event.clientY);
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!pointerActiveRef.current) {
      return;
    }

    pointerActiveRef.current = false;
    updateAimFromPointer(event.clientX, event.clientY);

    aimReadyRef.current = true;
    setAimReady(true);
    setLastEvent('READY · TAP FIRE');
  };

  const fireVolley = useCallback(() => {
    if (
      match.phaseRef.current !== 'playing' ||
      localModeRef.current !== 'aiming' ||
      !aimReadyRef.current ||
      match.myFinished
    ) {
      return;
    }

    const count = clamp(
      Math.round(selectedBalls),
      1,
      match.myAvailableBalls,
    );

    const eventId = match.sendShot(
      aimAngleRef.current,
      count,
      localStageIndexRef.current + 1,
    );

    if (!eventId) {
      return;
    }

    ballsRef.current = Array.from(
      { length: count },
      (_, index): SimBall => ({
        id: index + 1,
        x: launchXRef.current * WORLD_COLS,
        y: BALL_START_Y,
        vx: 0,
        vy: 0,
        active: false,
        launched: false,
        returned: false,
        lastBrickId: null,
        lastBrickHitAt: 0,
      }),
    );

    launchIndexRef.current = 0;
    launchCountRef.current = count;
    activeBallCountRef.current = 0;
    firstReturnXRef.current = null;
    nextLaunchAtRef.current = 0;
    shotElapsedRef.current = 0;
    accumulatorRef.current = 0;

    aimReadyRef.current = false;
    setAimReady(false);
    setPendingEventId(eventId);
    setLocalVolleyDone(false);
    setMode('firing');
    setLastEvent(`${count} BALLS`);
  }, [
    match.myAvailableBalls,
    match.myFinished,
    match.phaseRef,
    match.sendShot,
    selectedBalls,
    setMode,
  ]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;

    if (!wrap || !canvas) {
      return;
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));

      const previous = lastCanvasSizeRef.current;
      if (
        previous.width === pixelWidth &&
        previous.height === pixelHeight &&
        previous.dpr === dpr
      ) {
        return;
      }

      lastCanvasSizeRef.current = {
        width: pixelWidth,
        height: pixelHeight,
        dpr,
      };
      renderDprRef.current = dpr;

      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      staticCacheKeyRef.current = '';
      brickSpriteCacheRef.current = null;

      const horizontalMargin = Math.max(6, rect.width * 0.018);
      const controlsReserve = 70;
      const top = 6;
      const maxWidth = rect.width - horizontalMargin * 2;
      const maxHeight = Math.max(120, rect.height - controlsReserve - top - 3);
      const cell = Math.min(
        maxWidth / WORLD_COLS,
        maxHeight / WORLD_ROWS,
      );

      const boardWidth = cell * WORLD_COLS;
      const boardHeight = cell * WORLD_ROWS;
      const left = (rect.width - boardWidth) / 2;
      const boardTop =
        top + Math.max(0, (maxHeight - boardHeight) * 0.08);

      boardRef.current = {
        left,
        right: left + boardWidth,
        top: boardTop,
        bottom: boardTop + boardHeight,
        cell,
      };
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    window.addEventListener('resize', resize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      return;
    }

    const getBrickWorldRect = (brick: LocalBrick) => ({
      x: brick.col + BRICK_PADDING,
      y: brick.row + BRICK_PADDING,
      w: 1 - BRICK_PADDING * 2,
      h: 1 - BRICK_PADDING * 2,
    });

    const collideBallWithBrick = (
      ball: SimBall,
      brick: LocalBrick,
      elapsed: number,
      now: number,
    ) => {
      if (!brick.alive) {
        return false;
      }

      if (
        ball.lastBrickId === brick.id &&
        elapsed - ball.lastBrickHitAt < SAME_BRICK_COOLDOWN
      ) {
        return false;
      }

      const rect = getBrickWorldRect(brick);
      const closestX = clamp(ball.x, rect.x, rect.x + rect.w);
      const closestY = clamp(ball.y, rect.y, rect.y + rect.h);
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;

      if (dx * dx + dy * dy > BALL_RADIUS * BALL_RADIUS) {
        return false;
      }

      const overlapLeft = Math.abs(ball.x + BALL_RADIUS - rect.x);
      const overlapRight = Math.abs(
        rect.x + rect.w - (ball.x - BALL_RADIUS),
      );
      const overlapTop = Math.abs(ball.y + BALL_RADIUS - rect.y);
      const overlapBottom = Math.abs(
        rect.y + rect.h - (ball.y - BALL_RADIUS),
      );

      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom,
      );

      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.vx *= -1;
        ball.x += ball.vx > 0 ? 0.022 : -0.022;
      } else {
        ball.vy *= -1;
        ball.y += ball.vy > 0 ? 0.022 : -0.022;
      }

      ball.lastBrickId = brick.id;
      ball.lastBrickHitAt = elapsed;

      brick.hp = Math.max(0, brick.hp - 1);
      brick.alive = brick.hp > 0;
      brick.hitFlash = now + 66;

      if (!brick.alive) {
        setTemporaryEvent('BREAK', 300);
      }

      return true;
    };

    const collideBallWithPickup = (
      ball: SimBall,
      pickup: LocalPickup,
    ) => {
      if (!pickup.alive) {
        return;
      }

      const cx = pickup.col + 0.5;
      const cy = pickup.row + 0.5;
      const radius = 0.19;
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      const totalRadius = BALL_RADIUS + radius;

      if (dx * dx + dy * dy > totalRadius * totalRadius) {
        return;
      }

      pickup.alive = false;
      setTemporaryEvent('+1 BALL', 380);
    };

    const finishLocalVolley = () => {
      if (localModeRef.current !== 'firing') {
        return;
      }

      if (firstReturnXRef.current !== null) {
        launchXRef.current = clamp(
          firstReturnXRef.current / WORLD_COLS,
          0.035,
          0.965,
        );
      }

      ballsRef.current = [];
      setMode('awaiting_server');
      setLocalVolleyDone(true);
      setLastEvent('SYNCING...');
    };

    const simulateStep = (now: number) => {
      if (localModeRef.current !== 'firing') {
        return;
      }

      const elapsed = shotElapsedRef.current;

      while (
        launchIndexRef.current < launchCountRef.current &&
        elapsed + 1e-9 >= nextLaunchAtRef.current
      ) {
        const ball = ballsRef.current[launchIndexRef.current];

        if (ball && !ball.launched) {
          ball.launched = true;
          ball.active = true;
          ball.vx = Math.cos(aimAngleRef.current) * BALL_SPEED;
          ball.vy = Math.sin(aimAngleRef.current) * BALL_SPEED;
          activeBallCountRef.current += 1;
        }

        launchIndexRef.current += 1;
        nextLaunchAtRef.current += LAUNCH_INTERVAL;
      }

      for (const ball of ballsRef.current) {
        if (!ball.active) {
          continue;
        }

        ball.x += ball.vx * FIXED_STEP;
        ball.y += ball.vy * FIXED_STEP;

        if (ball.x - BALL_RADIUS <= 0) {
          ball.x = BALL_RADIUS;
          ball.vx = Math.abs(ball.vx);
          ball.lastBrickId = null;
        } else if (ball.x + BALL_RADIUS >= WORLD_COLS) {
          ball.x = WORLD_COLS - BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx);
          ball.lastBrickId = null;
        }

        if (ball.y - BALL_RADIUS <= 0) {
          ball.y = BALL_RADIUS;
          ball.vy = Math.abs(ball.vy);
          ball.lastBrickId = null;
        }

        let collided = false;
        const candidateCol = clamp(
          Math.floor(ball.x),
          0,
          WORLD_COLS - 1,
        );
        const candidateRow = clamp(
          Math.floor(ball.y),
          0,
          BRICK_ROWS - 1,
        );

        const brickCandidates =
          brickCandidatesRef.current[candidateRow]?.[candidateCol] || [];

        for (const brick of brickCandidates) {
          if (collideBallWithBrick(ball, brick, elapsed, now)) {
            collided = true;
            break;
          }
        }

        if (!collided) {
          ball.lastBrickId = null;
        }

        const pickupCandidates =
          pickupCandidatesRef.current[candidateRow]?.[candidateCol] || [];

        for (const pickup of pickupCandidates) {
          if (pickup.alive) {
            collideBallWithPickup(ball, pickup);
          }
        }

        if (ball.y + BALL_RADIUS >= RETURN_Y && ball.vy > 0) {
          ball.active = false;
          ball.returned = true;
          activeBallCountRef.current = Math.max(
            0,
            activeBallCountRef.current - 1,
          );

          if (firstReturnXRef.current === null) {
            firstReturnXRef.current = clamp(
              ball.x,
              BALL_RADIUS * 2,
              WORLD_COLS - BALL_RADIUS * 2,
            );
          }
        }
      }

      const allLaunched =
        launchIndexRef.current >= launchCountRef.current;
      const allReturned =
        allLaunched &&
        activeBallCountRef.current === 0 &&
        ballsRef.current.every(
          (ball) => !ball.launched || ball.returned,
        );

      shotElapsedRef.current += FIXED_STEP;

      if (allReturned) {
        finishLocalVolley();
      }
    };

    const rayTouchesBrick = (x: number, y: number) => {
      for (const brick of bricksRef.current) {
        if (!brick.alive) {
          continue;
        }

        const rect = getBrickWorldRect(brick);

        if (
          x >= rect.x - BALL_RADIUS &&
          x <= rect.x + rect.w + BALL_RADIUS &&
          y >= rect.y - BALL_RADIUS &&
          y <= rect.y + rect.h + BALL_RADIUS
        ) {
          return true;
        }
      }

      return false;
    };

    const render = (now: number) => {
      const dpr = renderDprRef.current;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      const currentTheme =
        THEMES[localStageIndexRef.current] || THEMES[0];
      const board = boardRef.current;
      const staticKey = [
        canvas.width,
        canvas.height,
        dpr,
        localStageIndexRef.current,
        board.left.toFixed(2),
        board.top.toFixed(2),
        board.right.toFixed(2),
        board.bottom.toFixed(2),
        board.cell.toFixed(2),
      ].join(':');

      let staticCanvas = staticCanvasRef.current;

      if (!staticCanvas) {
        staticCanvas = document.createElement('canvas');
        staticCanvasRef.current = staticCanvas;
      }

      if (staticCacheKeyRef.current !== staticKey) {
        staticCanvas.width = canvas.width;
        staticCanvas.height = canvas.height;

        const staticCtx = staticCanvas.getContext('2d', {
          alpha: false,
        });

        if (staticCtx) {
          staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const background = staticCtx.createLinearGradient(
            0,
            0,
            0,
            height,
          );

          background.addColorStop(0, currentTheme.backgroundTop);
          background.addColorStop(1, currentTheme.backgroundBottom);

          staticCtx.fillStyle = background;
          staticCtx.fillRect(0, 0, width, height);

          roundedRectPath(
            staticCtx,
            board.left - 4,
            board.top - 4,
            board.right - board.left + 8,
            board.bottom - board.top + 8,
            18,
          );

          staticCtx.fillStyle = currentTheme.board;
          staticCtx.fill();

          staticCtx.save();
          staticCtx.strokeStyle = 'rgba(255,255,255,.075)';
          staticCtx.lineWidth = 1.2;
          staticCtx.stroke();
          staticCtx.restore();

          staticCtx.strokeStyle = currentTheme.grid;
          staticCtx.lineWidth = 1;

          for (let col = 1; col < WORLD_COLS; col += 1) {
            const x = board.left + col * board.cell;

            staticCtx.beginPath();
            staticCtx.moveTo(x, board.top);
            staticCtx.lineTo(x, board.bottom);
            staticCtx.stroke();
          }

          for (let row = 1; row < WORLD_ROWS; row += 1) {
            const y = board.top + row * board.cell;

            staticCtx.beginPath();
            staticCtx.moveTo(board.left, y);
            staticCtx.lineTo(board.right, y);
            staticCtx.stroke();
          }
        }

        staticCacheKeyRef.current = staticKey;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(staticCanvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const previous = lastFrameRef.current || now;
      const frameDt = Math.min(
        0.034,
        Math.max(0, (now - previous) / 1000),
      );

      lastFrameRef.current = now;
      accumulatorRef.current += frameDt;

      let steps = 0;

      while (
        accumulatorRef.current >= FIXED_STEP &&
        steps < MAX_STEPS_PER_FRAME
      ) {
        simulateStep(now);
        accumulatorRef.current -= FIXED_STEP;
        steps += 1;
      }

      if (steps >= MAX_STEPS_PER_FRAME) {
        accumulatorRef.current = 0;
      }

      const brickPadding = board.cell * BRICK_PADDING;
      const brickSize = board.cell - brickPadding * 2;
      const spriteKey = [
        localStageIndexRef.current,
        brickSize.toFixed(2),
        dpr,
      ].join(':');

      let spriteCache = brickSpriteCacheRef.current;

      if (!spriteCache || spriteCache.key !== spriteKey) {
        const createBrickSprite = (
          topColor: string,
          bottomColor: string,
        ) => {
          const sprite = document.createElement('canvas');
          sprite.width = Math.max(1, Math.ceil(brickSize * dpr));
          sprite.height = Math.max(1, Math.ceil(brickSize * dpr));

          const spriteCtx = sprite.getContext('2d');
          if (!spriteCtx) {
            return sprite;
          }

          spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

          roundedRectPath(
            spriteCtx,
            0,
            0,
            brickSize,
            brickSize,
            Math.max(6, brickSize * 0.17),
          );

          const gradient = spriteCtx.createLinearGradient(
            0,
            0,
            0,
            brickSize,
          );
          gradient.addColorStop(0, topColor);
          gradient.addColorStop(1, bottomColor);

          spriteCtx.fillStyle = gradient;
          spriteCtx.fill();

          spriteCtx.save();
          spriteCtx.globalAlpha = 0.16;
          spriteCtx.fillStyle = '#ffffff';

          roundedRectPath(
            spriteCtx,
            brickSize * 0.1,
            brickSize * 0.09,
            brickSize * 0.8,
            brickSize * 0.11,
            brickSize * 0.05,
          );

          spriteCtx.fill();
          spriteCtx.restore();

          return sprite;
        };

        const pickupSize = board.cell * 0.62;
        const pickupSprite = document.createElement('canvas');
        pickupSprite.width = Math.max(1, Math.ceil(pickupSize * dpr));
        pickupSprite.height = Math.max(1, Math.ceil(pickupSize * dpr));

        const pickupCtx = pickupSprite.getContext('2d');
        if (pickupCtx) {
          pickupCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const center = pickupSize / 2;
          const radius = board.cell * 0.18;

          pickupCtx.globalAlpha = 0.13;
          pickupCtx.fillStyle = currentTheme.pickup;
          pickupCtx.beginPath();
          pickupCtx.arc(center, center, radius * 1.7, 0, Math.PI * 2);
          pickupCtx.fill();

          pickupCtx.globalAlpha = 1;
          pickupCtx.fillStyle = currentTheme.pickup;
          pickupCtx.beginPath();
          pickupCtx.arc(center, center, radius, 0, Math.PI * 2);
          pickupCtx.fill();

          pickupCtx.fillStyle = '#071516';
          pickupCtx.font = `900 ${Math.max(
            8,
            radius * 0.86,
          )}px Inter, sans-serif`;
          pickupCtx.textAlign = 'center';
          pickupCtx.textBaseline = 'middle';
          pickupCtx.fillText('+1', center, center + 0.5);
        }

        spriteCache = {
          key: spriteKey,
          normal: createBrickSprite(
            currentTheme.brickA,
            currentTheme.brickB,
          ),
          hot: createBrickSprite(
            currentTheme.brickHot,
            currentTheme.brickA,
          ),
          pickup: pickupSprite,
        };

        brickSpriteCacheRef.current = spriteCache;
      }

      ctx.font = `900 ${Math.max(
        11,
        brickSize * 0.3,
      )}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const brick of bricksRef.current) {
        if (!brick.alive) {
          continue;
        }

        const x =
          board.left + brick.col * board.cell + brickPadding;
        const y =
          board.top + brick.row * board.cell + brickPadding;

        const isHot =
          brick.hp >=
          (localStageIndexRef.current === 0 ? 17 : 25);

        ctx.drawImage(
          isHot ? spriteCache.hot : spriteCache.normal,
          x,
          y,
          brickSize,
          brickSize,
        );

        if (now < brick.hitFlash) {
          ctx.save();
          ctx.globalAlpha = 0.78;
          ctx.fillStyle = '#ffffff';

          roundedRectPath(
            ctx,
            x,
            y,
            brickSize,
            brickSize,
            Math.max(6, brickSize * 0.17),
          );

          ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillText(
          String(brick.hp),
          x + brickSize / 2,
          y + brickSize / 2 + 1,
        );
      }

      for (const pickup of pickupsRef.current) {
        if (!pickup.alive) {
          continue;
        }

        const pickupSize = board.cell * 0.62;
        const x =
          board.left +
          (pickup.col + 0.5) * board.cell -
          pickupSize / 2;
        const y =
          board.top +
          (pickup.row + 0.5) * board.cell -
          pickupSize / 2;

        ctx.drawImage(
          spriteCache.pickup,
          x,
          y,
          pickupSize,
          pickupSize,
        );
      }

      for (const ball of ballsRef.current) {
        if (!ball.active) {
          continue;
        }

        const x = board.left + ball.x * board.cell;
        const y = board.top + ball.y * board.cell;
        const radius = BALL_RADIUS * board.cell;

        ctx.fillStyle = currentTheme.accent;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';

        ctx.beginPath();
        ctx.arc(
          x - radius * 0.32,
          y - radius * 0.34,
          radius * 0.23,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        ctx.globalAlpha = 1;
      }

      if (
        match.phaseRef.current === 'playing' &&
        localModeRef.current === 'aiming' &&
        !match.myFinished
      ) {
        let x = launchXRef.current * WORLD_COLS;
        let y = BALL_START_Y;
        let vx = Math.cos(aimAngleRef.current);
        let vy = Math.sin(aimAngleRef.current);

        ctx.save();
        ctx.fillStyle = currentTheme.accent;
        ctx.globalAlpha = aimReadyRef.current ? 0.62 : 0.3;

        for (let step = 0; step < 68; step += 1) {
          x += vx * 0.19;
          y += vy * 0.19;

          if (x <= BALL_RADIUS) {
            x = BALL_RADIUS;
            vx = Math.abs(vx);
          } else if (x >= WORLD_COLS - BALL_RADIUS) {
            x = WORLD_COLS - BALL_RADIUS;
            vx = -Math.abs(vx);
          }

          if (y <= BALL_RADIUS) {
            y = BALL_RADIUS;
            vy = Math.abs(vy);
          }

          if (y >= RETURN_Y - 0.08) {
            break;
          }

          if (step % 2 === 0) {
            ctx.beginPath();
            ctx.arc(
              board.left + x * board.cell,
              board.top + y * board.cell,
              step === 0 ? 2.5 : 1.65,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }

          if (step > 2 && rayTouchesBrick(x, y)) {
            break;
          }
        }

        ctx.restore();
      }

      const cannonX =
        board.left + launchXRef.current * (board.right - board.left);
      const cannonY = board.top + CANNON_Y * board.cell;

      ctx.fillStyle = currentTheme.accentSoft;

      ctx.beginPath();
      ctx.arc(cannonX, cannonY, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cannonX, cannonY);

      ctx.rotate(
        localModeRef.current === 'aiming'
          ? aimAngleRef.current + Math.PI / 2
          : 0,
      );

      ctx.fillStyle = currentTheme.cannon;

      roundedRectPath(ctx, -7, -24, 14, 31, 6);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = currentTheme.cannon;

      ctx.beginPath();
      ctx.arc(cannonX, cannonY, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#251904';
      ctx.font = '900 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(
        String(match.myAvailableBalls),
        cannonX,
        cannonY + 0.5,
      );

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    match.myAvailableBalls,
    match.myFinished,
    match.phaseRef,
    setMode,
    setTemporaryEvent,
  ]);

  const myWon =
    !match.draw &&
    match.winnerUserId > 0 &&
    match.winnerUserId === match.myUserId;

  const resultTitle =
    resultStage < 4
      ? 'ПОДСЧЁТ...'
      : match.draw
        ? 'НИЧЬЯ'
        : myWon
          ? 'ПОБЕДА'
          : 'ПОРАЖЕНИЕ';

  const ownDisplayStage = match.myFinished
    ? STAGE_COUNT
    : localStageIndex + 1;

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden text-white"
      style={{
        fontFamily:
          "'Supercell','Supercell-Magic','SupercellMagic',Inter,system-ui,sans-serif",
        lineHeight: 1.65,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${theme.backgroundTop} 0%, ${theme.backgroundBottom} 100%)`,
        }}
      />

      <header
        className="relative z-20 flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.05] px-2.5"
        style={{ background: `${theme.board}E8` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PlayerAvatar profile={match.playerProfile} />
          <div className="min-w-0">
            <p className="max-w-[82px] truncate py-[2px] text-[6px] font-black uppercase tracking-[.08em] text-white/70">
              {match.playerProfile.name}
            </p>
            <p className="mt-1 text-[5px] font-black uppercase tracking-[.09em] text-white/27">
              USED {match.myBallsUsed}
            </p>
          </div>
        </div>

        <div className="shrink-0 px-2 text-center">
          <p
            className="text-[7px] font-black uppercase tracking-[.1em]"
            style={{ color: theme.accent }}
          >
            STAGE {ownDisplayStage}/{STAGE_COUNT}
          </p>
          <strong className="mt-1 block text-[17px] font-black leading-[1.65] tabular-nums text-white">
            {formatTime(match.matchTimeLeft)}
          </strong>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <p className="max-w-[82px] truncate py-[2px] text-[6px] font-black uppercase tracking-[.08em] text-white/70">
              {match.opponentProfile.name}
            </p>
            <p className="mt-1 text-[5px] font-black uppercase tracking-[.09em] text-white/27">
              {match.opponentFinished
                ? 'DONE'
                : `STAGE ${match.opponentStage}/${STAGE_COUNT}`}
            </p>
          </div>
          <PlayerAvatar profile={match.opponentProfile} />
        </div>
      </header>

      <div
        ref={wrapRef}
        className="relative mx-auto min-h-0 w-full max-w-[460px] flex-1 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointerActiveRef.current = false;
          }}
        />

        {lastEvent && match.phase === 'playing' && !match.myFinished && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 text-center">
            <span
              className="rounded-full border border-white/[0.07] px-3 py-2 text-[5.5px] font-black uppercase tracking-[.12em] text-white/52"
              style={{ background: `${theme.board}E6` }}
            >
              {lastEvent}
            </span>
          </div>
        )}

        <div
          className="absolute bottom-[18px] left-1/2 z-30 w-[min(360px,94%)] -translate-x-1/2 rounded-[14px] border border-white/[0.075] px-2.5 py-2"
          style={{ background: `${theme.board}F3` }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={
                match.phase !== 'playing' ||
                localMode !== 'aiming' ||
                match.myFinished
              }
              onClick={() => changeSelectedBalls(selectedBalls - 1)}
              className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-[9px] bg-white/[0.055] text-[13px] font-black text-white/62 transition active:scale-[.95] disabled:opacity-30"
            >
              −
            </button>

            <div className="min-w-0 flex-1 text-center">
              <p className="text-[4.5px] font-black uppercase tracking-[.12em] text-white/25">
                BALLS THIS SHOT
              </p>
              <strong
                className="mt-[1px] block text-[14px] font-black leading-[1.65]"
                style={{ color: theme.accent }}
              >
                {selectedBalls}
              </strong>
            </div>

            <button
              type="button"
              disabled={
                match.phase !== 'playing' ||
                localMode !== 'aiming' ||
                match.myFinished
              }
              onClick={() => changeSelectedBalls(selectedBalls + 1)}
              className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-[9px] bg-white/[0.055] text-[13px] font-black text-white/62 transition active:scale-[.95] disabled:opacity-30"
            >
              +
            </button>

            <button
              type="button"
              disabled={
                match.phase !== 'playing' ||
                localMode !== 'aiming' ||
                match.myFinished
              }
              onClick={() => changeSelectedBalls(match.myAvailableBalls)}
              className="h-[32px] shrink-0 rounded-[9px] px-2.5 text-[5.5px] font-black uppercase tracking-[.09em] text-[#071018] transition active:scale-[.96] disabled:opacity-30"
              style={{ background: theme.accent }}
            >
              MAX
            </button>

            <button
              type="button"
              disabled={
                match.phase !== 'playing' ||
                localMode !== 'aiming' ||
                !aimReady ||
                match.myFinished
              }
              onClick={fireVolley}
              className={[
                'h-[32px] min-w-[76px] shrink-0 rounded-[9px] px-2 text-[5.5px] font-black uppercase tracking-[.075em] transition',
                match.phase === 'playing' &&
                localMode === 'aiming' &&
                aimReady &&
                !match.myFinished
                  ? 'text-[#071018] active:scale-[.96]'
                  : 'bg-white/[0.045] text-white/24 opacity-50',
              ].join(' ')}
              style={
                match.phase === 'playing' &&
                localMode === 'aiming' &&
                aimReady &&
                !match.myFinished
                  ? { background: theme.accent }
                  : undefined
              }
            >
              FIRE · {selectedBalls}
            </button>
          </div>

          <input
            type="range"
            min={1}
            max={Math.max(1, match.myAvailableBalls)}
            step={1}
            value={selectedBalls}
            disabled={
              match.phase !== 'playing' ||
              localMode !== 'aiming' ||
              match.myFinished
            }
            onChange={(event) =>
              changeSelectedBalls(Number(event.target.value))
            }
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            className="ballz-balls-range block w-full cursor-pointer disabled:opacity-30"
            style={{ color: theme.accent }}
            aria-label="Количество шаров в залпе"
          />
        </div>

        {transitionStage !== null && (
          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/38">
            <div className="text-center">
              <p className="text-[6px] font-black uppercase tracking-[.15em] text-white/34">
                CLEARED
              </p>
              <p
                className="mt-1 text-[24px] font-black uppercase leading-[1.65]"
                style={{ color: theme.accent }}
              >
                STAGE {transitionStage - 1}
              </p>
            </div>
          </div>
        )}

        {match.phase === 'playing' && match.myFinished && (
          <div className="absolute inset-0 z-[45] grid place-items-center bg-black/50 px-4">
            <div className="rounded-[20px] border border-white/[0.08] bg-black/35 px-5 py-4 text-center">
              <p
                className="text-[17px] font-black uppercase"
                style={{ color: theme.accent }}
              >
                ГОТОВО
              </p>
              <p className="mt-2 text-[6px] font-black uppercase tracking-[.11em] text-white/42">
                ЖДЁМ СОПЕРНИКА · {formatTime(match.matchTimeLeft)}
              </p>
            </div>
          </div>
        )}
      </div>

      {(match.phase === 'waiting' ||
        match.connectionStatus === 'connecting') && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-[#06101c]/82 px-5">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#56e3ff]" />
            <p className="mt-4 text-[8px] font-black uppercase tracking-[.14em] text-white/62">
              WAITING OPPONENT
            </p>
            {match.socketError && (
              <p className="mt-2 max-w-[260px] text-[6px] font-black leading-[1.6] text-[#ff8290]">
                {match.socketError}
              </p>
            )}
          </div>
        </div>
      )}

      {match.phase === 'countdown' && (
        <div
          className="absolute inset-0 z-[90] grid place-items-center"
          style={{ background: `${theme.backgroundBottom}E6` }}
        >
          <div className="text-center">
            <p className="text-[7px] font-black uppercase tracking-[.18em] text-white/34">
              2 RANDOM STAGES · 90 SEC
            </p>
            <div
              className="mt-2 text-[64px] font-black leading-[1.55]"
              style={{ color: theme.accent }}
            >
              {Math.max(1, match.countdownLeft)}
            </div>
          </div>
        </div>
      )}

      {match.phase === 'match_over' && (
        <div
          className="absolute inset-0 z-[120] grid place-items-center px-4"
          style={{ background: `${theme.backgroundBottom}F2` }}
        >
          <div
            className="w-full max-w-[330px] rounded-[24px] border border-white/[0.09] px-4 pb-4 pt-5 shadow-[0_28px_80px_rgba(0,0,0,.62)]"
            style={{ background: theme.board }}
          >
            <div className="text-center">
              <p className="text-[6px] font-black uppercase tracking-[.17em] text-white/28">
                BALLZ DUEL
              </p>
              <h2
                className="mt-1 text-[20px] font-black uppercase leading-[1.65]"
                style={{
                  color:
                    resultStage < 4
                      ? theme.accent
                      : match.draw
                        ? '#ffffff'
                        : myWon
                          ? '#70ffc2'
                          : '#ff8290',
                }}
              >
                {resultTitle}
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-[1fr_58px_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <PlayerAvatar
                  profile={match.playerProfile}
                  size={42}
                />
                <p className="mx-auto mt-2 max-w-[92px] truncate py-[2px] text-[6px] font-black uppercase text-white/65">
                  {match.playerProfile.name}
                </p>
              </div>

              <div className="text-center text-[6px] font-black uppercase tracking-[.12em] text-white/22">
                VS
              </div>

              <div className="min-w-0 text-center">
                <div className="flex justify-center">
                  <PlayerAvatar
                    profile={match.opponentProfile}
                    size={42}
                  />
                </div>
                <p className="mx-auto mt-2 max-w-[92px] truncate py-[2px] text-[6px] font-black uppercase text-white/65">
                  {match.opponentProfile.name}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[16px] border border-white/[0.065]">
              <div className="grid grid-cols-[1fr_70px_1fr] items-center border-b border-white/[0.055] bg-white/[0.025] px-3 py-3 text-center">
                <strong
                  className="text-[15px] font-black"
                  style={{ color: theme.accent }}
                >
                  <CountUp
                    target={match.myProgress}
                    active={resultStage >= 1}
                    decimals={1}
                    suffix="%"
                  />
                </strong>
                <span className="text-[5px] font-black uppercase tracking-[.1em] text-white/25">
                  PROGRESS
                </span>
                <strong
                  className="text-[15px] font-black"
                  style={{ color: theme.accent }}
                >
                  <CountUp
                    target={match.opponentProgress}
                    active={resultStage >= 1}
                    decimals={1}
                    suffix="%"
                  />
                </strong>
              </div>

              <div className="grid grid-cols-[1fr_70px_1fr] items-center border-b border-white/[0.055] px-3 py-3 text-center">
                <strong className="text-[15px] font-black text-[#f7d35f]">
                  <CountUp
                    target={match.myBallsUsed}
                    active={resultStage >= 2}
                  />
                </strong>
                <span className="text-[5px] font-black uppercase tracking-[.1em] text-white/25">
                  USED
                </span>
                <strong className="text-[15px] font-black text-[#f7d35f]">
                  <CountUp
                    target={match.opponentBallsUsed}
                    active={resultStage >= 2}
                  />
                </strong>
              </div>

              <div className="grid grid-cols-[1fr_70px_1fr] items-center px-3 py-3 text-center">
                <strong className="text-[17px] font-black text-white">
                  <CountUp
                    target={match.myScore}
                    active={resultStage >= 3}
                  />
                </strong>
                <span className="text-[5px] font-black uppercase tracking-[.1em] text-white/25">
                  SCORE
                </span>
                <strong className="text-[17px] font-black text-white">
                  <CountUp
                    target={match.opponentScore}
                    active={resultStage >= 3}
                  />
                </strong>
              </div>
            </div>

            {resultStage >= 4 && (
              <div className="game-result-reward mt-3 rounded-[15px] border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-center">
                <p className="text-[5px] font-black uppercase tracking-[.12em] text-white/24">
                  ЧИСТЫЙ ВЫИГРЫШ
                </p>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <img
                    src={coinIcon}
                    alt=""
                    className="h-[18px] w-[18px] object-contain"
                    draggable={false}
                  />
                  <strong
                    className="text-[16px] font-black"
                    style={{ color: myWon ? '#70ffc2' : '#ffffff' }}
                  >
                    {myWon
                      ? `+${formatReward(match.winnerProfit)}`
                      : '0'}
                  </strong>
                  <span className="text-[6px] font-black uppercase text-white/30">
                    GAME
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={match.backToLobbies}
              className="game-result-exit mt-3 w-full rounded-[14px] px-4 py-3 text-[7px] font-black uppercase tracking-[.1em] text-[#071018] transition active:scale-[.985]"
              style={{ background: theme.accent }}
            >
              В ЛОББИ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
