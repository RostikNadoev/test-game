import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCcw, Volume2, VolumeX } from 'lucide-react';

type PlayerId = 1 | 2;
type GroupKind = 'solid' | 'stripe';
type BallKind = 'cue' | 'solid' | 'stripe' | 'eight';

type Point = {
  x: number;
  y: number;
};

type Ball = {
  id: string;
  number: number;
  kind: BallKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pocketed: boolean;
  active: boolean;
};

type Layout = {
  logicalWidth: number;
  logicalHeight: number;
  rotated: boolean;
  hudHeight: number;
  tableX: number;
  tableY: number;
  tableWidth: number;
  tableHeight: number;
  tableScale: number;
  playerPanelWidth: number;
  playerPanelHeight: number;
  centerPillWidth: number;
};

type ShotMeta = {
  inProgress: boolean;
  firstContact: number | null;
  pocketed: number[];
  cuePocketed: boolean;
};

type InteractionMode = 'idle' | 'aim' | 'place';

type InteractionState = {
  mode: InteractionMode;
  pointerId: number | null;
  start: Point | null;
  current: Point | null;
};

type GameState = {
  currentPlayer: PlayerId;
  winner: PlayerId | null;
  groups: Record<PlayerId, GroupKind | null>;
  ballInHandFor: PlayerId | null;
  moving: boolean;
  status: 'break' | 'turn' | 'ball-in-hand' | 'foul' | 'win';
};

const TABLE_WIDTH = 1000;
const TABLE_HEIGHT = 560;
const BALL_RADIUS = 15;
const MAX_DRAG = 190;

const FRICTION_PER_STEP = 0.9925;
const BALL_RESTITUTION = 0.985;
const RAIL_RESTITUTION = 0.92;
const STOP_EPS = 0.028;

const PLAY_INSET = 20;
const CORNER_MOUTH_SIZE = 58;
const SIDE_MOUTH_HALF = 48;

const PLAYER_LABEL: Record<PlayerId, string> = {
  1: 'P1',
  2: 'P2',
};



const BALL_COLORS: Record<number, string> = {
  0: '#F8FAFC',
  1: '#F6C546',
  2: '#2563EB',
  3: '#EF4444',
  4: '#7C3AED',
  5: '#F97316',
  6: '#16A34A',
  7: '#7F1D1D',
  8: '#111827',
  9: '#F6C546',
  10: '#2563EB',
  11: '#EF4444',
  12: '#7C3AED',
  13: '#F97316',
  14: '#16A34A',
  15: '#7F1D1D',
};

const POCKETS: Point[] = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const kindFromNumber = (n: number): BallKind => {
  if (n === 0) return 'cue';
  if (n === 8) return 'eight';
  return n < 8 ? 'solid' : 'stripe';
};

const emptyShot = (): ShotMeta => ({
  inProgress: false,
  firstContact: null,
  pocketed: [],
  cuePocketed: false,
});

const emptyInteraction = (): InteractionState => ({
  mode: 'idle',
  pointerId: null,
  start: null,
  current: null,
});

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const projectPoint = (p: Point, layout: Layout) => ({
  x: layout.tableX + p.x * layout.tableScale,
  y: layout.tableY + p.y * layout.tableScale,
});

const projectRadius = (r: number, layout: Layout) => r * layout.tableScale;

const buildRack = (): Ball[] => {
  const balls: Ball[] = [
    {
      id: 'cue',
      number: 0,
      kind: 'cue',
      x: TABLE_WIDTH * 0.24,
      y: TABLE_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      color: BALL_COLORS[0],
      pocketed: false,
      active: true,
    },
  ];

  const rackOrder = [1, 10, 2, 9, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const startX = TABLE_WIDTH * 0.72;
  const startY = TABLE_HEIGHT / 2;
  const dx = BALL_RADIUS * 1.97;
  const dy = BALL_RADIUS * 2.06;

  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      const number = rackOrder[index++];
      balls.push({
        id: `ball-${number}`,
        number,
        kind: kindFromNumber(number),
        x: startX + row * dx,
        y: startY - (row * dy) / 2 + col * dy,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        color: BALL_COLORS[number],
        pocketed: false,
        active: true,
      });
    }
  }

  return balls;
};

const computeLayout = (width: number, height: number): Layout => {
  const rotated = height > width;
  const logicalWidth = rotated ? height : width;
  const logicalHeight = rotated ? width : height;

  const hudHeight = clamp(logicalHeight * 0.125, 72, 88);
  const padX = clamp(logicalWidth * 0.022, 14, 22);
  const padBottom = clamp(logicalHeight * 0.02, 10, 18);

  const ratio = TABLE_WIDTH / TABLE_HEIGHT;

  const tableMaxWidth = (logicalWidth - padX * 2) * 0.8;
  const tableMaxHeight = (logicalHeight - hudHeight - padBottom - 10) * 0.8;

  let tableWidth = tableMaxWidth;
  let tableHeight = tableWidth / ratio;

  if (tableHeight > tableMaxHeight) {
    tableHeight = tableMaxHeight;
    tableWidth = tableHeight * ratio;
  }

  const freeHeight = logicalHeight - hudHeight;
  const tableX = (logicalWidth - tableWidth) / 2;
  const tableY = hudHeight + (freeHeight - tableHeight) / 2;

  return {
    logicalWidth,
    logicalHeight,
    rotated,
    hudHeight,
    tableX,
    tableY,
    tableWidth,
    tableHeight,
    tableScale: tableWidth / TABLE_WIDTH,
    playerPanelWidth: clamp(logicalWidth * 0.105, 96, 122),
    playerPanelHeight: clamp(hudHeight - 24, 42, 50),
    centerPillWidth: clamp(logicalWidth * 0.135, 122, 156),
  };
};

const getLogicalPointFromCanvasPoint = (
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  rotated: boolean,
): Point => {
  if (!rotated) return { x: canvasX, y: canvasY };
  return {
    x: canvasY,
    y: canvasWidth - canvasX,
  };
};

const PoolGame = () => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [soundEnabled, setSoundEnabled] = useState(true);

  const ballsRef = useRef<Ball[]>(buildRack());
  const shotRef = useRef<ShotMeta>(emptyShot());
  const interactionRef = useRef<InteractionState>(emptyInteraction());

  const stateRef = useRef<GameState>({
    currentPlayer: 1,
    winner: null,
    groups: { 1: null, 2: null },
    ballInHandFor: null,
    moving: false,
    status: 'break',
  });

  const layoutRef = useRef<Layout | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef(0);

  const layout = useMemo(
    () => computeLayout(canvasSize.width || 1, canvasSize.height || 1),
    [canvasSize.height, canvasSize.width],
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateSize = () => {
      setCanvasSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(stage);
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouch = document.body.style.touchAction;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';

    const stage = stageRef.current;
    const prevent = (e: Event) => e.preventDefault();

    if (stage) {
      stage.addEventListener('touchmove', prevent, { passive: false });
      stage.addEventListener('wheel', prevent, { passive: false });
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouch;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;

      if (stage) {
        stage.removeEventListener('touchmove', prevent);
        stage.removeEventListener('wheel', prevent);
      }
    };
  }, []);

  const ensureAudio = useCallback(() => {
    if (!soundEnabled) return null;

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => undefined);
    }

    return audioCtxRef.current;
  }, [soundEnabled]);

  const playImpactSound = useCallback(
    (power: number, type: 'ball' | 'rail' | 'pocket') => {
      const ctx = ensureAudio();
      if (!ctx) return;

      const nowMs = performance.now();
      if (type !== 'pocket' && nowMs - lastSoundTimeRef.current < 18) return;
      lastSoundTimeRef.current = nowMs;

      const now = ctx.currentTime;
      const volume = clamp(power, 0.04, 1);

      if (type === 'pocket') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(82, now + 0.18);

        filter.type = 'lowpass';
        filter.frequency.value = 380;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18 * volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.24);
        return;
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = type === 'rail' ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(type === 'rail' ? 520 : 740, now);
      osc.frequency.exponentialRampToValueAtTime(type === 'rail' ? 240 : 320, now + 0.06);

      filter.type = 'bandpass';
      filter.frequency.value = type === 'rail' ? 950 : 1200;
      filter.Q.value = 2.5;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.13 * volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    },
    [ensureAudio],
  );

  const countRemaining = useCallback((group: GroupKind) => {
    return ballsRef.current.filter((b) => !b.pocketed && b.kind === group).length;
  }, []);

  const getCueBall = useCallback(() => {
    return ballsRef.current.find((b) => b.number === 0) ?? null;
  }, []);

  const syncState = useCallback((patch: Partial<GameState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
  }, []);

  const isCuePlacementValid = useCallback((x: number, y: number) => {
    const leftWall = PLAY_INSET + BALL_RADIUS;
    const rightWall = TABLE_WIDTH - PLAY_INSET - BALL_RADIUS;
    const topWall = PLAY_INSET + BALL_RADIUS;
    const bottomWall = TABLE_HEIGHT - PLAY_INSET - BALL_RADIUS;

    if (x < leftWall || x > rightWall || y < topWall || y > bottomWall) {
      return false;
    }

    for (const ball of ballsRef.current) {
      if (ball.pocketed || ball.number === 0) continue;
      if (dist({ x, y }, { x: ball.x, y: ball.y }) < BALL_RADIUS * 2 + 1.2) {
        return false;
      }
    }

    return true;
  }, []);

  const respotCueBall = useCallback(() => {
    const cue = getCueBall();
    if (!cue) return;

    const baseX = TABLE_WIDTH * 0.24;
    const baseY = TABLE_HEIGHT / 2;
    let found = false;

    for (let dx = 0; dx <= 260 && !found; dx += 14) {
      const yOffsets = [0, 16, -16, 32, -32, 48, -48, 64, -64, 80, -80];
      for (const oy of yOffsets) {
        const x = clamp(baseX + dx, PLAY_INSET + BALL_RADIUS, TABLE_WIDTH - PLAY_INSET - BALL_RADIUS);
        const y = clamp(baseY + oy, PLAY_INSET + BALL_RADIUS, TABLE_HEIGHT - PLAY_INSET - BALL_RADIUS);

        if (isCuePlacementValid(x, y)) {
          cue.x = x;
          cue.y = y;
          cue.vx = 0;
          cue.vy = 0;
          cue.pocketed = false;
          cue.active = true;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      cue.x = baseX;
      cue.y = baseY;
      cue.vx = 0;
      cue.vy = 0;
      cue.pocketed = false;
      cue.active = true;
    }
  }, [getCueBall, isCuePlacementValid]);

  const resetGame = useCallback(() => {
    ballsRef.current = buildRack();
    shotRef.current = emptyShot();
    interactionRef.current = emptyInteraction();
    stateRef.current = {
      currentPlayer: 1,
      winner: null,
      groups: { 1: null, 2: null },
      ballInHandFor: null,
      moving: false,
      status: 'break',
    };
  }, []);

  const pocketBall = useCallback(
    (ball: Ball, speedForSound: number) => {
      if (ball.pocketed) return;

      ball.vx = 0;
      ball.vy = 0;
      ball.pocketed = true;
      ball.active = false;

      if (shotRef.current.inProgress) {
        if (ball.number === 0) {
          shotRef.current.cuePocketed = true;
        } else {
          shotRef.current.pocketed.push(ball.number);
        }
      }

      playImpactSound(speedForSound, 'pocket');
    },
    [playImpactSound],
  );

  const maybePocketBall = useCallback(
    (ball: Ball) => {
      const speed = Math.hypot(ball.vx, ball.vy);

      for (const pocket of POCKETS) {
        const d = dist(ball, pocket);
        const capture = pocket.x === TABLE_WIDTH / 2 ? 27 : 31;

        if (d < capture) {
          pocketBall(ball, speed / 16);
          return true;
        }
      }

      const nearCornerLeft = ball.x < CORNER_MOUTH_SIZE;
      const nearCornerRight = ball.x > TABLE_WIDTH - CORNER_MOUTH_SIZE;
      const nearMid = Math.abs(ball.x - TABLE_WIDTH / 2) < SIDE_MOUTH_HALF;
      const nearTop = ball.y < CORNER_MOUTH_SIZE;
      const nearBottom = ball.y > TABLE_HEIGHT - CORNER_MOUTH_SIZE;

      if ((nearCornerLeft || nearCornerRight || nearMid) && (nearTop || nearBottom)) {
        pocketBall(ball, speed / 16);
        return true;
      }

      return false;
    },
    [pocketBall],
  );

  const resolveShot = useCallback(() => {
    const meta = shotRef.current;
    shotRef.current = emptyShot();

    const current = stateRef.current.currentPlayer;
    const opponent: PlayerId = current === 1 ? 2 : 1;

    const groups = { ...stateRef.current.groups };
    const ownGroup = groups[current];
    const firstKind = meta.firstContact !== null ? kindFromNumber(meta.firstContact) : null;
    const pocketKinds = meta.pocketed.map(kindFromNumber);
    const pocketedGroups = pocketKinds.filter((k): k is GroupKind => k === 'solid' || k === 'stripe');

    let foul = false;

    if (meta.cuePocketed) {
      foul = true;
    } else if (meta.firstContact === null) {
      foul = true;
    } else if (!ownGroup) {
      if (firstKind === 'eight') {
        foul = true;
      }
    } else {
      const target: GroupKind | 'eight' = countRemaining(ownGroup) > 0 ? ownGroup : 'eight';
      if (firstKind !== target) {
        foul = true;
      }
    }

    if (!groups[current] && !foul && pocketedGroups.length > 0) {
      const assigned = pocketedGroups[0];
      groups[current] = assigned;
      groups[opponent] = assigned === 'solid' ? 'stripe' : 'solid';
    }

    const effectiveOwnGroup = groups[current];
    const pottedEight = meta.pocketed.includes(8);

    if (pottedEight) {
      const legalWin =
        effectiveOwnGroup !== null &&
        !foul &&
        firstKind === 'eight' &&
        countRemaining(effectiveOwnGroup) === 0;

      syncState({
        winner: legalWin ? current : opponent,
        groups,
        ballInHandFor: null,
        moving: false,
        status: 'win',
      });

      return;
    }

    if (foul) {
      syncState({
        currentPlayer: opponent,
        groups,
        ballInHandFor: opponent,
        moving: false,
        status: 'ball-in-hand',
      });
      respotCueBall();
      return;
    }

    const pocketedOwn = effectiveOwnGroup
      ? pocketedGroups.includes(effectiveOwnGroup)
      : pocketedGroups.length > 0;

    if (pocketedOwn) {
      syncState({
        groups,
        ballInHandFor: null,
        moving: false,
        status: 'turn',
      });
      return;
    }

    syncState({
      currentPlayer: opponent,
      groups,
      ballInHandFor: null,
      moving: false,
      status: 'turn',
    });
  }, [countRemaining, respotCueBall, syncState]);

  const stepPhysics = useCallback(
    (dt: number) => {
      const balls = ballsRef.current;
      const substeps = 4;

      const leftWall = PLAY_INSET + BALL_RADIUS;
      const rightWall = TABLE_WIDTH - PLAY_INSET - BALL_RADIUS;
      const topWall = PLAY_INSET + BALL_RADIUS;
      const bottomWall = TABLE_HEIGHT - PLAY_INSET - BALL_RADIUS;

      for (let step = 0; step < substeps; step += 1) {
        for (const ball of balls) {
          if (ball.pocketed || !ball.active) continue;

          ball.x += (ball.vx * dt) / substeps;
          ball.y += (ball.vy * dt) / substeps;

          if (maybePocketBall(ball)) continue;

          const openLeftRail = ball.y < CORNER_MOUTH_SIZE || ball.y > TABLE_HEIGHT - CORNER_MOUTH_SIZE;
          const openRightRail = ball.y < CORNER_MOUTH_SIZE || ball.y > TABLE_HEIGHT - CORNER_MOUTH_SIZE;

          const openTopRail =
            ball.x < CORNER_MOUTH_SIZE ||
            Math.abs(ball.x - TABLE_WIDTH / 2) < SIDE_MOUTH_HALF ||
            ball.x > TABLE_WIDTH - CORNER_MOUTH_SIZE;

          const openBottomRail =
            ball.x < CORNER_MOUTH_SIZE ||
            Math.abs(ball.x - TABLE_WIDTH / 2) < SIDE_MOUTH_HALF ||
            ball.x > TABLE_WIDTH - CORNER_MOUTH_SIZE;

          if (ball.x < leftWall && !openLeftRail) {
            ball.x = leftWall;
            ball.vx = Math.abs(ball.vx) * RAIL_RESTITUTION;
            playImpactSound(Math.abs(ball.vx) / 16, 'rail');
          } else if (ball.x > rightWall && !openRightRail) {
            ball.x = rightWall;
            ball.vx = -Math.abs(ball.vx) * RAIL_RESTITUTION;
            playImpactSound(Math.abs(ball.vx) / 16, 'rail');
          }

          if (ball.y < topWall && !openTopRail) {
            ball.y = topWall;
            ball.vy = Math.abs(ball.vy) * RAIL_RESTITUTION;
            playImpactSound(Math.abs(ball.vy) / 16, 'rail');
          } else if (ball.y > bottomWall && !openBottomRail) {
            ball.y = bottomWall;
            ball.vy = -Math.abs(ball.vy) * RAIL_RESTITUTION;
            playImpactSound(Math.abs(ball.vy) / 16, 'rail');
          }

          ball.vx *= FRICTION_PER_STEP;
          ball.vy *= FRICTION_PER_STEP;

          if (Math.hypot(ball.vx, ball.vy) < STOP_EPS) {
            ball.vx = 0;
            ball.vy = 0;
          }
        }

        for (let i = 0; i < balls.length; i += 1) {
          const a = balls[i];
          if (a.pocketed || !a.active) continue;

          for (let j = i + 1; j < balls.length; j += 1) {
            const b = balls[j];
            if (b.pocketed || !b.active) continue;

            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            const minD = a.radius + b.radius;

            if (d === 0) {
              dx = 0.001;
              dy = 0;
              d = 0.001;
            }

            if (d >= minD) continue;

            if (shotRef.current.inProgress && shotRef.current.firstContact === null) {
              if (a.number === 0 && b.number !== 0) {
                shotRef.current.firstContact = b.number;
              } else if (b.number === 0 && a.number !== 0) {
                shotRef.current.firstContact = a.number;
              }
            }

            const nx = dx / d;
            const ny = dy / d;
            const overlap = minD - d;

            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;

            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const velAlongNormal = rvx * nx + rvy * ny;

            if (velAlongNormal > 0) continue;

            const impulse = (-(1 + BALL_RESTITUTION) * velAlongNormal) / 2;

            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;

            const tangentX = -ny;
            const tangentY = nx;
            const relTan = rvx * tangentX + rvy * tangentY;
            const frictionImpulse = relTan * 0.013;

            a.vx += frictionImpulse * tangentX;
            a.vy += frictionImpulse * tangentY;
            b.vx -= frictionImpulse * tangentX;
            b.vy -= frictionImpulse * tangentY;

            playImpactSound(Math.min(1, Math.abs(velAlongNormal) / 12), 'ball');
          }
        }
      }

      const moving = balls.some((b) => !b.pocketed && (Math.abs(b.vx) > STOP_EPS || Math.abs(b.vy) > STOP_EPS));

      if (moving !== stateRef.current.moving) {
        syncState({
          moving,
          status: moving ? stateRef.current.status : stateRef.current.status,
        });
      }

      if (!moving && shotRef.current.inProgress) {
        resolveShot();
      }
    },
    [maybePocketBall, playImpactSound, resolveShot, syncState],
  );

  const getAimPreview = useCallback(() => {
    const cue = getCueBall();
    const interaction = interactionRef.current;

    if (!cue || cue.pocketed || stateRef.current.moving || stateRef.current.winner) return null;
    if (interaction.mode !== 'aim' || !interaction.current) return null;

    const dx = cue.x - interaction.current.x;
    const dy = cue.y - interaction.current.y;
    const drag = Math.min(Math.hypot(dx, dy), MAX_DRAG);
    if (drag < 6) return null;

    const dirX = dx / drag;
    const dirY = dy / drag;

    let bestT = Infinity;
    let hitBall: Ball | null = null;

    for (const ball of ballsRef.current) {
      if (ball.pocketed || ball.number === 0) continue;

      const ox = cue.x - ball.x;
      const oy = cue.y - ball.y;
      const radius = BALL_RADIUS * 2;

      const a = dirX * dirX + dirY * dirY;
      const b = 2 * (ox * dirX + oy * dirY);
      const c = ox * ox + oy * oy - radius * radius;
      const disc = b * b - 4 * a * c;

      if (disc < 0) continue;

      const sqrt = Math.sqrt(disc);
      const t1 = (-b - sqrt) / (2 * a);

      if (t1 > 0.001 && t1 < bestT) {
        bestT = t1;
        hitBall = ball;
      }
    }

    const railTs = [
      dirX > 0 ? (TABLE_WIDTH - PLAY_INSET - BALL_RADIUS - cue.x) / dirX : Infinity,
      dirX < 0 ? (PLAY_INSET + BALL_RADIUS - cue.x) / dirX : Infinity,
      dirY > 0 ? (TABLE_HEIGHT - PLAY_INSET - BALL_RADIUS - cue.y) / dirY : Infinity,
      dirY < 0 ? (PLAY_INSET + BALL_RADIUS - cue.y) / dirY : Infinity,
    ].filter((v) => v > 0);

    const railT = railTs.length ? Math.min(...railTs) : Infinity;
    const rayT = Math.min(bestT, railT, 330);

    const contactPoint = {
      x: cue.x + dirX * rayT,
      y: cue.y + dirY * rayT,
    };

    if (!hitBall || bestT > railT) {
      return {
        cue,
        dir: { x: dirX, y: dirY },
        drag,
        lineEnd: contactPoint,
        targetBall: null,
        ghostBallDir: null as Point | null,
        cueDeflectDir: null as Point | null,
      };
    }

    const nx = (hitBall.x - contactPoint.x) / (BALL_RADIUS * 2);
    const ny = (hitBall.y - contactPoint.y) / (BALL_RADIUS * 2);

    const dot = dirX * nx + dirY * ny;
    const cueDeflectX = dirX - dot * nx;
    const cueDeflectY = dirY - dot * ny;

    const cueDeflectLen = Math.hypot(cueDeflectX, cueDeflectY);
    const normCueDeflect =
      cueDeflectLen > 0.001
        ? { x: cueDeflectX / cueDeflectLen, y: cueDeflectY / cueDeflectLen }
        : null;

    return {
      cue,
      dir: { x: dirX, y: dirY },
      drag,
      lineEnd: contactPoint,
      targetBall: hitBall,
      ghostBallDir: { x: nx, y: ny },
      cueDeflectDir: normCueDeflect,
    };
  }, [getCueBall]);

  const drawMiniBall = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    number: number,
    stripe: boolean,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (stripe) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = BALL_COLORS[number];
      ctx.fillRect(x - r, y - r * 0.48, r * 2, r * 0.96);
      ctx.restore();
    } else {
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.18, x, y, r);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.18, BALL_COLORS[number]);
      grad.addColorStop(1, BALL_COLORS[number]);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.font = `${Math.max(8, r * 0.78)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + 0.4);

    ctx.restore();
  };

  const drawHud = useCallback(
    (ctx: CanvasRenderingContext2D, l: Layout) => {
      const gs = stateRef.current;

      const topY = 14;
      const cardW = l.playerPanelWidth;
      const cardH = l.playerPanelHeight;
      const centerW = l.centerPillWidth;
      const gap = 10;
      const groupW = cardW + gap + centerW + gap + cardW;
      const startX = (l.logicalWidth - groupW) / 2;

      const leftX = startX;
      const centerX = leftX + cardW + gap;
      const rightX = centerX + centerW + gap;

      const drawPlayerCard = (player: PlayerId, x: number) => {
        const active = gs.currentPlayer === player && !gs.winner;
        const winner = gs.winner === player;
        const group = gs.groups[player];
        const remaining = group ? countRemaining(group) : 7;

        ctx.save();
        ctx.shadowColor = active ? 'rgba(34,211,238,0.18)' : 'rgba(0,0,0,0.16)';
        ctx.shadowBlur = active ? 16 : 10;
        ctx.shadowOffsetY = 4;

        drawRoundedRect(ctx, x, topY, cardW, cardH, 16);
        const grad = ctx.createLinearGradient(x, topY, x, topY + cardH);
        grad.addColorStop(0, active ? 'rgba(16,29,42,0.97)' : 'rgba(12,15,22,0.94)');
        grad.addColorStop(1, active ? 'rgba(11,20,31,0.97)' : 'rgba(8,11,16,0.94)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 1.15;
        ctx.strokeStyle = winner
          ? 'rgba(250,204,21,0.6)'
          : active
            ? 'rgba(34,211,238,0.42)'
            : 'rgba(255,255,255,0.08)';
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 15px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(PLAYER_LABEL[player], x + 12, topY + 16);

        ctx.fillStyle = winner ? '#FACC15' : active ? '#67E8F9' : '#A1A1AA';
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        ctx.fillText(winner ? 'WIN' : active ? 'TURN' : 'READY', x + 12, topY + 32);

        if (group) {
          drawMiniBall(
            ctx,
            x + cardW - 38,
            topY + cardH / 2,
            9.5,
            group === 'solid' ? 1 : 9,
            group === 'stripe',
          );
          ctx.fillStyle = '#E5E7EB';
          ctx.font = '800 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`${remaining}`, x + cardW - 14, topY + cardH / 2 + 0.5);
        } else {
          ctx.fillStyle = '#64748B';
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('OPEN', x + cardW - 12, topY + cardH / 2 + 0.5);
        }

        ctx.restore();
      };

      drawPlayerCard(1, leftX);
      drawPlayerCard(2, rightX);

      ctx.save();
      drawRoundedRect(ctx, centerX, topY + 3, centerW, cardH - 6, 999);
      const centerGrad = ctx.createLinearGradient(centerX, topY + 3, centerX + centerW, topY + cardH - 3);
      centerGrad.addColorStop(0, 'rgba(10,12,18,0.96)');
      centerGrad.addColorStop(1, 'rgba(18,24,36,0.97)');
      ctx.fillStyle = centerGrad;
      ctx.fill();

      ctx.lineWidth = 1.1;
      ctx.strokeStyle = gs.ballInHandFor
        ? 'rgba(250,204,21,0.45)'
        : gs.winner
          ? 'rgba(250,204,21,0.34)'
          : 'rgba(255,255,255,0.09)';
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let centerText = `${PLAYER_LABEL[gs.currentPlayer]} TO PLAY`;
      if (gs.ballInHandFor) centerText = `${PLAYER_LABEL[gs.ballInHandFor]} BALL IN HAND`;
      if (gs.winner) centerText = `${PLAYER_LABEL[gs.winner]} WINS`;

      ctx.fillText(centerText, centerX + centerW / 2, topY + cardH / 2);

      ctx.restore();
    },
    [countRemaining],
  );

  const drawCornerPocket = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dirX: 1 | -1,
    dirY: 1 | -1,
    scale: number,
  ) => {
    const outerR = 28 * scale;
    const innerR = 20 * scale;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.fillStyle = '#2A140C';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#040404';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + dirX * outerR * 1.55, y + dirY * outerR * 0.2);
    ctx.lineTo(x + dirX * outerR * 0.45, y + dirY * outerR * 0.45);
    ctx.lineTo(x + dirX * outerR * 0.2, y + dirY * outerR * 1.55);
    ctx.closePath();
    ctx.fillStyle = '#1B100B';
    ctx.fill();

    ctx.restore();
  };

  const drawMiddlePocket = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dirY: 1 | -1,
    scale: number,
  ) => {
    const mouthW = 58 * scale;
    const mouthH = 22 * scale;

    ctx.save();

    ctx.beginPath();
    ctx.ellipse(x, y, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2A140C';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x, y, (mouthW - 14 * scale) / 2, (mouthH - 7 * scale) / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#050505';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - mouthW * 0.58, y + dirY * mouthH * 0.15);
    ctx.lineTo(x - mouthW * 0.28, y + dirY * mouthH * 0.55);
    ctx.lineTo(x + mouthW * 0.28, y + dirY * mouthH * 0.55);
    ctx.lineTo(x + mouthW * 0.58, y + dirY * mouthH * 0.15);
    ctx.closePath();
    ctx.fillStyle = '#1B100B';
    ctx.fill();

    ctx.restore();
  };

  const drawTable = useCallback((ctx: CanvasRenderingContext2D, l: Layout) => {
    const outerX = l.tableX - 28;
    const outerY = l.tableY - 24;
    const outerW = l.tableWidth + 56;
    const outerH = l.tableHeight + 48;

    const playX = l.tableX + PLAY_INSET * l.tableScale;
    const playY = l.tableY + PLAY_INSET * l.tableScale;
    const playW = l.tableWidth - PLAY_INSET * 2 * l.tableScale;
    const playH = l.tableHeight - PLAY_INSET * 2 * l.tableScale;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.58)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    drawRoundedRect(ctx, outerX, outerY, outerW, outerH, 34);
    ctx.fillStyle = '#1A0E08';
    ctx.fill();
    ctx.restore();

    const wood = ctx.createLinearGradient(outerX, outerY, outerX + outerW, outerY + outerH);
    wood.addColorStop(0, '#6A3B20');
    wood.addColorStop(0.2, '#3B2213');
    wood.addColorStop(0.5, '#7A4927');
    wood.addColorStop(0.8, '#2F180D');
    wood.addColorStop(1, '#744626');

    drawRoundedRect(ctx, outerX, outerY, outerW, outerH, 34);
    ctx.fillStyle = wood;
    ctx.fill();

    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();

    const cushion = ctx.createLinearGradient(l.tableX, l.tableY, l.tableX, l.tableY + l.tableHeight);
    cushion.addColorStop(0, '#0A694D');
    cushion.addColorStop(0.5, '#085B45');
    cushion.addColorStop(1, '#064839');

    drawRoundedRect(ctx, l.tableX, l.tableY, l.tableWidth, l.tableHeight, 22);
    ctx.fillStyle = cushion;
    ctx.fill();

    const playFelt = ctx.createLinearGradient(playX, playY, playX, playY + playH);
    playFelt.addColorStop(0, '#0C9268');
    playFelt.addColorStop(0.45, '#0A7A5A');
    playFelt.addColorStop(1, '#075A46');

    drawRoundedRect(ctx, playX, playY, playW, playH, 14);
    ctx.fillStyle = playFelt;
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#B7FFD7';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, playX + 6, playY + 6, playW - 12, playH - 12, 12);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, playX, playY, playW, playH, 14);
    ctx.stroke();
    ctx.restore();

    const railDots = [
      { x: TABLE_WIDTH * 0.16, y: -24 },
      { x: TABLE_WIDTH * 0.33, y: -24 },
      { x: TABLE_WIDTH * 0.66, y: -24 },
      { x: TABLE_WIDTH * 0.84, y: -24 },
      { x: TABLE_WIDTH * 0.16, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.33, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.66, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.84, y: TABLE_HEIGHT + 24 },
      { x: -24, y: TABLE_HEIGHT * 0.25 },
      { x: -24, y: TABLE_HEIGHT * 0.75 },
      { x: TABLE_WIDTH + 24, y: TABLE_HEIGHT * 0.25 },
      { x: TABLE_WIDTH + 24, y: TABLE_HEIGHT * 0.75 },
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    railDots.forEach((p) => {
      const pos = projectPoint(p, l);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    });

    const tl = projectPoint({ x: 0, y: 0 }, l);
    const tm = projectPoint({ x: TABLE_WIDTH / 2, y: 0 }, l);
    const tr = projectPoint({ x: TABLE_WIDTH, y: 0 }, l);
    const bl = projectPoint({ x: 0, y: TABLE_HEIGHT }, l);
    const bm = projectPoint({ x: TABLE_WIDTH / 2, y: TABLE_HEIGHT }, l);
    const br = projectPoint({ x: TABLE_WIDTH, y: TABLE_HEIGHT }, l);

    drawCornerPocket(ctx, tl.x, tl.y, 1, 1, l.tableScale);
    drawMiddlePocket(ctx, tm.x, tm.y, 1, l.tableScale);
    drawCornerPocket(ctx, tr.x, tr.y, -1, 1, l.tableScale);
    drawCornerPocket(ctx, bl.x, bl.y, 1, -1, l.tableScale);
    drawMiddlePocket(ctx, bm.x, bm.y, -1, l.tableScale);
    drawCornerPocket(ctx, br.x, br.y, -1, -1, l.tableScale);

    const cueLineX = projectPoint({ x: TABLE_WIDTH * 0.25, y: 0 }, l).x;
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cueLineX, playY + 10);
    ctx.lineTo(cueLineX, playY + playH - 10);
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawBalls = useCallback((ctx: CanvasRenderingContext2D, l: Layout) => {
    for (const ball of ballsRef.current) {
      if (ball.pocketed || !ball.active) continue;

      const pos = projectPoint({ x: ball.x, y: ball.y }, l);
      const r = projectRadius(ball.radius, l);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.32)';
      ctx.shadowBlur = r * 0.9;
      ctx.shadowOffsetY = r * 0.22;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);

      if (ball.kind === 'cue') {
        const cueGrad = ctx.createRadialGradient(
          pos.x - r * 0.35,
          pos.y - r * 0.35,
          r * 0.22,
          pos.x,
          pos.y,
          r,
        );
        cueGrad.addColorStop(0, '#FFFFFF');
        cueGrad.addColorStop(1, '#DDE5ED');
        ctx.fillStyle = cueGrad;
        ctx.fill();
      } else if (ball.kind === 'stripe') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = ball.color;
        ctx.fillRect(pos.x - r, pos.y - r * 0.52, r * 2, r * 1.04);
        ctx.restore();
      } else {
        const grad = ctx.createRadialGradient(
          pos.x - r * 0.35,
          pos.y - r * 0.35,
          r * 0.22,
          pos.x,
          pos.y,
          r,
        );
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.18, ball.color);
        grad.addColorStop(1, ball.color);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.lineWidth = Math.max(1.2, r * 0.08);
      ctx.strokeStyle = ball.kind === 'cue' ? '#D6D9DE' : 'rgba(255,255,255,0.16)';
      ctx.stroke();

      if (ball.number !== 0) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.fillStyle = '#0F172A';
        ctx.font = `${Math.max(10, r * 0.78)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ball.number), pos.x, pos.y + 0.4);
      }

      ctx.restore();
    }
  }, []);

  const drawAimPreview = useCallback(
    (ctx: CanvasRenderingContext2D, l: Layout) => {
      const preview = getAimPreview();
      if (!preview) return;

      const cuePos = projectPoint({ x: preview.cue.x, y: preview.cue.y }, l);
      const lineEnd = projectPoint(preview.lineEnd, l);

      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.52)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cuePos.x, cuePos.y);
      ctx.lineTo(lineEnd.x, lineEnd.y);
      ctx.stroke();
      ctx.restore();

      if (preview.targetBall && preview.ghostBallDir) {
        const objStart = projectPoint({ x: preview.targetBall.x, y: preview.targetBall.y }, l);
        const objEnd = projectPoint(
          {
            x: preview.targetBall.x + preview.ghostBallDir.x * 120,
            y: preview.targetBall.y + preview.ghostBallDir.y * 120,
          },
          l,
        );

        ctx.save();
        ctx.strokeStyle = 'rgba(34,211,238,0.78)';
        ctx.lineWidth = 2.25;
        ctx.beginPath();
        ctx.moveTo(objStart.x, objStart.y);
        ctx.lineTo(objEnd.x, objEnd.y);
        ctx.stroke();
        ctx.restore();
      }

      if (preview.cueDeflectDir) {
        const deflectStart = lineEnd;
        const deflectEnd = projectPoint(
          {
            x: preview.lineEnd.x + preview.cueDeflectDir.x * 76,
            y: preview.lineEnd.y + preview.cueDeflectDir.y * 76,
          },
          l,
        );

        ctx.save();
        ctx.strokeStyle = 'rgba(251,191,36,0.72)';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(deflectStart.x, deflectStart.y);
        ctx.lineTo(deflectEnd.x, deflectEnd.y);
        ctx.stroke();
        ctx.restore();
      }

      const cueBack = projectPoint(
        {
          x: preview.cue.x - preview.dir.x * (72 + (preview.drag / MAX_DRAG) * 92),
          y: preview.cue.y - preview.dir.y * (72 + (preview.drag / MAX_DRAG) * 92),
        },
        l,
      );

      ctx.save();
      ctx.lineWidth = Math.max(6, 12 * l.tableScale);
      ctx.lineCap = 'round';

      const cueGrad = ctx.createLinearGradient(cueBack.x, cueBack.y, cuePos.x, cuePos.y);
      cueGrad.addColorStop(0, '#E8C08C');
      cueGrad.addColorStop(0.45, '#C98F57');
      cueGrad.addColorStop(0.78, '#6B3F1E');
      cueGrad.addColorStop(1, '#FDE68A');

      ctx.strokeStyle = cueGrad;
      ctx.beginPath();
      ctx.moveTo(cueBack.x, cueBack.y);
      ctx.lineTo(
        cuePos.x - preview.dir.x * projectRadius(BALL_RADIUS + 7, l),
        cuePos.y - preview.dir.y * projectRadius(BALL_RADIUS + 7, l),
      );
      ctx.stroke();
      ctx.restore();

      const meterW = 132;
      const meterH = 8;
      const meterX = l.logicalWidth - meterW - 18;
      const meterY = l.logicalHeight - 18;

      drawRoundedRect(ctx, meterX, meterY, meterW, meterH, 999);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();

      const fillW = (preview.drag / MAX_DRAG) * meterW;
      drawRoundedRect(ctx, meterX, meterY, fillW, meterH, 999);
      const meterGrad = ctx.createLinearGradient(meterX, meterY, meterX + meterW, meterY);
      meterGrad.addColorStop(0, '#22C55E');
      meterGrad.addColorStop(0.5, '#EAB308');
      meterGrad.addColorStop(1, '#EF4444');
      ctx.fillStyle = meterGrad;
      ctx.fill();
    },
    [getAimPreview],
  );

  const drawWinnerOverlay = useCallback((ctx: CanvasRenderingContext2D, l: Layout) => {
    const gs = stateRef.current;
    if (!gs.winner) return;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 12, 0.68)';
    ctx.fillRect(0, 0, l.logicalWidth, l.logicalHeight);

    const w = clamp(l.logicalWidth * 0.34, 240, 360);
    const h = 120;
    const x = (l.logicalWidth - w) / 2;
    const y = (l.logicalHeight - h) / 2;

    drawRoundedRect(ctx, x, y, w, h, 28);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(14,18,26,0.96)');
    grad.addColorStop(1, 'rgba(18,24,36,0.96)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(250,204,21,0.32)';
    ctx.stroke();

    ctx.fillStyle = '#FACC15';
    ctx.font = '800 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WINNER', x + w / 2, y + 34);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 30px Inter, system-ui, sans-serif';
    ctx.fillText(PLAYER_LABEL[gs.winner], x + w / 2, y + 70);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillText('tap restart', x + w / 2, y + 98);

    ctx.restore();
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(canvasSize.width * dpr);
    const targetHeight = Math.floor(canvasSize.height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const l = layoutRef.current ?? computeLayout(canvasSize.width, canvasSize.height);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = ctx.createLinearGradient(0, 0, 0, canvasSize.height);
    bg.addColorStop(0, '#05070B');
    bg.addColorStop(1, '#020307');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    ctx.save();
    if (l.rotated) {
      ctx.translate(canvasSize.width, 0);
      ctx.rotate(Math.PI / 2);
    }

    drawHud(ctx, l);
    drawTable(ctx, l);
    drawAimPreview(ctx, l);
    drawBalls(ctx, l);
    drawWinnerOverlay(ctx, l);

    ctx.restore();
  }, [canvasSize.height, canvasSize.width, drawAimPreview, drawBalls, drawHud, drawTable, drawWinnerOverlay]);

  useEffect(() => {
    if (!canvasSize.width || !canvasSize.height) return;

    let mounted = true;

    const loop = (time: number) => {
      if (!mounted) return;

      const prev = lastFrameRef.current || time;
      const dt = clamp((time - prev) / 16.6667, 0.45, 1.5);
      lastFrameRef.current = time;

      if (!stateRef.current.winner) {
        stepPhysics(dt);
      }

      render();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize.height, canvasSize.width, render, stepPhysics]);

  const getTablePointFromClient = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const l = layoutRef.current;
    if (!canvas || !l) return null;

    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const logical = getLogicalPointFromCanvasPoint(localX, localY, rect.width, l.rotated);

    return {
      logical,
      table: {
        x: (logical.x - l.tableX) / l.tableScale,
        y: (logical.y - l.tableY) / l.tableScale,
      },
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    ensureAudio();

    if (stateRef.current.winner || stateRef.current.moving) return;

    const mapped = getTablePointFromClient(e.clientX, e.clientY);
    const l = layoutRef.current;
    const cue = getCueBall();

    if (!mapped || !l || !cue) return;

    const { logical, table } = mapped;

    if (
      logical.x < l.tableX ||
      logical.x > l.tableX + l.tableWidth ||
      logical.y < l.tableY ||
      logical.y > l.tableY + l.tableHeight
    ) {
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (stateRef.current.ballInHandFor === stateRef.current.currentPlayer) {
      if (isCuePlacementValid(table.x, table.y)) {
        cue.x = table.x;
        cue.y = table.y;
      }

      interactionRef.current = {
        mode: 'place',
        pointerId: e.pointerId,
        start: table,
        current: table,
      };
      return;
    }

    if (dist(table, cue) <= cue.radius * 1.8) {
      interactionRef.current = {
        mode: 'aim',
        pointerId: e.pointerId,
        start: table,
        current: table,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.mode === 'idle' || interaction.pointerId !== e.pointerId) return;

    e.preventDefault();

    const mapped = getTablePointFromClient(e.clientX, e.clientY);
    const cue = getCueBall();
    if (!mapped || !cue) return;

    if (interaction.mode === 'place') {
      if (isCuePlacementValid(mapped.table.x, mapped.table.y)) {
        cue.x = mapped.table.x;
        cue.y = mapped.table.y;
      }
      interactionRef.current.current = mapped.table;
      return;
    }

    interactionRef.current.current = mapped.table;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.mode === 'idle' || interaction.pointerId !== e.pointerId) return;

    e.preventDefault();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }

    const cue = getCueBall();

    if (!cue) {
      interactionRef.current = emptyInteraction();
      return;
    }

    if (interaction.mode === 'place') {
      syncState({
        ballInHandFor: null,
        status: 'turn',
      });
      interactionRef.current = emptyInteraction();
      return;
    }

    const current = interaction.current;
    if (!current) {
      interactionRef.current = emptyInteraction();
      return;
    }

    const dx = cue.x - current.x;
    const dy = cue.y - current.y;
    const drag = Math.min(Math.hypot(dx, dy), MAX_DRAG);

    if (drag > 6) {
      const dirX = dx / drag;
      const dirY = dy / drag;
      const power = 7.2 + (drag / MAX_DRAG) * 16.8;

      cue.vx = dirX * power;
      cue.vy = dirY * power;

      shotRef.current = {
        inProgress: true,
        firstContact: null,
        pocketed: [],
        cuePocketed: false,
      };

      syncState({
        moving: true,
        status: 'turn',
      });

      playImpactSound(clamp(power / 18, 0.15, 1), 'ball');
    }

    interactionRef.current = emptyInteraction();
  };

  const handlePointerCancel = () => {
    interactionRef.current = emptyInteraction();
  };

  return (
    <div className="h-full w-full overflow-hidden bg-[#05070B] select-none">
      <div ref={stageRef} className="relative h-full w-full overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-black/18 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-black/18 to-transparent" />

        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2">
          <button
            onClick={resetGame}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-white backdrop-blur-md active:scale-95 transition"
          >
            <RefreshCcw size={15} />
          </button>

          <button
            onClick={() => {
              setSoundEnabled((v) => {
                const next = !v;
                if (next) {
                  setTimeout(() => {
                    ensureAudio();
                  }, 0);
                }
                return next;
              });
            }}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-white backdrop-blur-md active:scale-95 transition"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoolGame;