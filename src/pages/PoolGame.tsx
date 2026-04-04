import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCcw, Smartphone, Trophy } from 'lucide-react';

type PlayerId = 1 | 2;
type BallKind = 'cue' | 'solid' | 'stripe' | 'eight';
type GroupKind = 'solid' | 'stripe';

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

type RenderMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

const TABLE_WIDTH = 1000;
const TABLE_HEIGHT = 560;
const BALL_RADIUS = 15;
const POCKET_RADIUS = 29;
const MAX_DRAG = 185;
const FRICTION = 0.989;
const MIN_SPEED = 0.03;

const PLAYER_NAMES: Record<PlayerId, string> = {
  1: 'Игрок 1',
  2: 'Игрок 2',
};

const GROUP_LABELS: Record<GroupKind, string> = {
  solid: 'Сплошные',
  stripe: 'Полосатые',
};

const BALL_COLORS: Record<number, string> = {
  0: '#F8FAFC',
  1: '#F7C843',
  2: '#3B82F6',
  3: '#EF4444',
  4: '#7C3AED',
  5: '#F97316',
  6: '#16A34A',
  7: '#7F1D1D',
  8: '#111827',
  9: '#F7C843',
  10: '#3B82F6',
  11: '#EF4444',
  12: '#7C3AED',
  13: '#F97316',
  14: '#16A34A',
  15: '#7F1D1D',
};

const POCKETS: Point[] = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: -2 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + 2 },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const numberToKind = (number: number): BallKind => {
  if (number === 0) return 'cue';
  if (number === 8) return 'eight';
  return number < 8 ? 'solid' : 'stripe';
};

const roundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

const createInitialBalls = (): Ball[] => {
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
  const rackX = TABLE_WIDTH * 0.72;
  const rackY = TABLE_HEIGHT / 2;
  const xStep = BALL_RADIUS * 1.95;
  const yStep = BALL_RADIUS * 2.05;

  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      const number = rackOrder[index++];

      balls.push({
        id: `ball-${number}`,
        number,
        kind: numberToKind(number),
        x: rackX + row * xStep,
        y: rackY - (row * yStep) / 2 + col * yStep,
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

const calculateRenderMetrics = (width: number, height: number): RenderMetrics => {
  const padding = Math.max(18, Math.min(width, height) * 0.055);
  const ratio = TABLE_WIDTH / TABLE_HEIGHT;

  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  let tableWidth = availableWidth;
  let tableHeight = tableWidth / ratio;

  if (tableHeight > availableHeight) {
    tableHeight = availableHeight;
    tableWidth = tableHeight * ratio;
  }

  return {
    x: (width - tableWidth) / 2,
    y: (height - tableHeight) / 2,
    width: tableWidth,
    height: tableHeight,
    scale: tableWidth / TABLE_WIDTH,
  };
};

const projectPoint = (point: Point, metrics: RenderMetrics) => ({
  x: metrics.x + point.x * metrics.scale,
  y: metrics.y + point.y * metrics.scale,
});

const projectRadius = (radius: number, metrics: RenderMetrics) => radius * metrics.scale;

const PoolGame = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const renderMetricsRef = useRef<RenderMetrics>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    scale: 1,
  });

  const ballsRef = useRef<Ball[]>(createInitialBalls());
  const shotRef = useRef<ShotMeta>(emptyShot());
  const interactionRef = useRef<InteractionState>(emptyInteraction());
  const movingRef = useRef(false);

  const currentPlayerRef = useRef<PlayerId>(1);
  const winnerRef = useRef<PlayerId | null>(null);
  const groupsRef = useRef<Record<PlayerId, GroupKind | null>>({ 1: null, 2: null });
  const ballInHandRef = useRef<PlayerId | null>(null);

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>(1);
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [playerGroups, setPlayerGroups] = useState<Record<PlayerId, GroupKind | null>>({
    1: null,
    2: null,
  });
  const [ballInHandFor, setBallInHandFor] = useState<PlayerId | null>(null);
  const [ballsMoving, setBallsMoving] = useState(false);
  const [statusText, setStatusText] = useState('Разбей пирамиду и забери стол');
  const [showRotateIntro, setShowRotateIntro] = useState(true);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false,
  );

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);

  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  useEffect(() => {
    groupsRef.current = playerGroups;
  }, [playerGroups]);

  useEffect(() => {
    ballInHandRef.current = ballInHandFor;
  }, [ballInHandFor]);

  useEffect(() => {
    const htmlOverflow = document.documentElement.style.overflow;
    const htmlOverscroll = document.documentElement.style.overscrollBehavior;
    const bodyOverflow = document.body.style.overflow;
    const bodyTouchAction = document.body.style.touchAction;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.documentElement.style.overscrollBehavior = htmlOverscroll;
      document.body.style.overflow = bodyOverflow;
      document.body.style.touchAction = bodyTouchAction;
    };
  }, []);

  useEffect(() => {
    const orientation = (screen as any)?.orientation;
    if (typeof orientation?.lock === 'function') {
      orientation.lock('landscape').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowRotateIntro(false);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const updateSize = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const countRemaining = useCallback((kind: GroupKind) => {
    return ballsRef.current.filter((ball) => ball.kind === kind && !ball.pocketed).length;
  }, []);

  const findCueBall = useCallback(() => {
    return ballsRef.current.find((ball) => ball.number === 0) ?? null;
  }, []);

  const isCuePlacementValid = useCallback((x: number, y: number) => {
    if (
      x < BALL_RADIUS ||
      x > TABLE_WIDTH - BALL_RADIUS ||
      y < BALL_RADIUS ||
      y > TABLE_HEIGHT - BALL_RADIUS
    ) {
      return false;
    }

    for (const ball of ballsRef.current) {
      if (ball.number === 0 || ball.pocketed) continue;
      if (distance({ x, y }, { x: ball.x, y: ball.y }) < BALL_RADIUS * 2 + 1.5) {
        return false;
      }
    }

    return true;
  }, []);

  const respotCueBall = useCallback(() => {
    const cue = findCueBall();
    if (!cue) return;

    const baseX = TABLE_WIDTH * 0.24;
    const baseY = TABLE_HEIGHT / 2;

    let placed = false;

    for (let dx = 0; dx <= 260 && !placed; dx += 18) {
      const offsets = [0, 18, -18, 36, -36, 54, -54, 72, -72, 90, -90, 108, -108];

      for (const dy of offsets) {
        const testX = clamp(baseX + dx, BALL_RADIUS, TABLE_WIDTH - BALL_RADIUS);
        const testY = clamp(baseY + dy, BALL_RADIUS, TABLE_HEIGHT - BALL_RADIUS);

        if (isCuePlacementValid(testX, testY)) {
          cue.x = testX;
          cue.y = testY;
          cue.vx = 0;
          cue.vy = 0;
          cue.pocketed = false;
          cue.active = true;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      cue.x = baseX;
      cue.y = baseY;
      cue.vx = 0;
      cue.vy = 0;
      cue.pocketed = false;
      cue.active = true;
    }
  }, [findCueBall, isCuePlacementValid]);

  const resetGame = useCallback(() => {
    ballsRef.current = createInitialBalls();
    shotRef.current = emptyShot();
    interactionRef.current = emptyInteraction();
    movingRef.current = false;

    currentPlayerRef.current = 1;
    winnerRef.current = null;
    groupsRef.current = { 1: null, 2: null };
    ballInHandRef.current = null;

    setCurrentPlayer(1);
    setWinner(null);
    setPlayerGroups({ 1: null, 2: null });
    setBallInHandFor(null);
    setBallsMoving(false);
    setStatusText('Разбей пирамиду и забери стол');
  }, []);

  const resolveShot = useCallback((meta: ShotMeta) => {
    shotRef.current = emptyShot();

    const current = currentPlayerRef.current;
    const opponent: PlayerId = current === 1 ? 2 : 1;

    const nextGroups: Record<PlayerId, GroupKind | null> = {
      1: groupsRef.current[1],
      2: groupsRef.current[2],
    };

    const ownGroup = nextGroups[current];
    const firstKind = meta.firstContact !== null ? numberToKind(meta.firstContact) : null;
    const pocketKinds = meta.pocketed.map(numberToKind);
    const pottedGroups = pocketKinds.filter(
      (kind): kind is GroupKind => kind === 'solid' || kind === 'stripe',
    );

    let foul = false;
    let foulReason = '';

    if (meta.cuePocketed) {
      foul = true;
      foulReason = 'биток упал в лузу';
    } else if (meta.firstContact === null) {
      foul = true;
      foulReason = 'нет касания';
    } else if (!ownGroup) {
      if (firstKind === 'eight') {
        foul = true;
        foulReason = 'по восьмёрке нельзя бить первой';
      }
    } else {
      const target: GroupKind | 'eight' = countRemaining(ownGroup) > 0 ? ownGroup : 'eight';

      if (firstKind !== target) {
        foul = true;
        foulReason =
          target === 'eight'
            ? 'нужно было играть по восьмёрке'
            : `нужно было попасть по группе "${GROUP_LABELS[target]}"`;
      }
    }

    if (!nextGroups[current] && !foul && pottedGroups.length > 0) {
      const assigned = pottedGroups[0];
      nextGroups[current] = assigned;
      nextGroups[opponent] = assigned === 'solid' ? 'stripe' : 'solid';

      groupsRef.current = nextGroups;
      setPlayerGroups(nextGroups);
    }

    const effectiveOwnGroup = nextGroups[current];
    const pottedEight = meta.pocketed.includes(8);

    if (pottedEight) {
      const canWin =
        effectiveOwnGroup !== null &&
        !foul &&
        firstKind === 'eight' &&
        countRemaining(effectiveOwnGroup) === 0;

      const winningPlayer: PlayerId = canWin ? current : opponent;

      winnerRef.current = winningPlayer;
      setWinner(winningPlayer);

      ballInHandRef.current = null;
      setBallInHandFor(null);

      setStatusText(
        canWin
          ? `${PLAYER_NAMES[current]} забивает восьмёрку и побеждает`
          : `${PLAYER_NAMES[current]} ошибается на восьмёрке. Победа у ${PLAYER_NAMES[opponent]}`,
      );

      return;
    }

    if (foul) {
      currentPlayerRef.current = opponent;
      ballInHandRef.current = opponent;

      setCurrentPlayer(opponent);
      setBallInHandFor(opponent);

      respotCueBall();

      setStatusText(`Фол: ${foulReason}. ${PLAYER_NAMES[opponent]}, шар в руке.`);
      return;
    }

    ballInHandRef.current = null;
    setBallInHandFor(null);

    const pocketedOwn = effectiveOwnGroup
      ? pottedGroups.includes(effectiveOwnGroup)
      : pottedGroups.length > 0;

    if (pocketedOwn) {
      setStatusText(
        effectiveOwnGroup
          ? `${PLAYER_NAMES[current]} продолжает серию`
          : `${PLAYER_NAMES[current]} выбирает группу: ${GROUP_LABELS[nextGroups[current]!]}`,
      );
      return;
    }

    currentPlayerRef.current = opponent;
    setCurrentPlayer(opponent);
    setStatusText(`${PLAYER_NAMES[opponent]}, твой ход`);
  }, [countRemaining, respotCueBall]);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;

    const dpr = window.devicePixelRatio || 1;
    const physicalWidth = Math.floor(canvasSize.width * dpr);
    const physicalHeight = Math.floor(canvasSize.height * dpr);

    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const metrics = calculateRenderMetrics(canvasSize.width, canvasSize.height);
    renderMetricsRef.current = metrics;

    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const frameX = metrics.x - 34;
    const frameY = metrics.y - 30;
    const frameW = metrics.width + 68;
    const frameH = metrics.height + 60;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 20;
    roundedRectPath(ctx, frameX, frameY, frameW, frameH, 34);
    ctx.fillStyle = '#26170E';
    ctx.fill();
    ctx.restore();

    const railGradient = ctx.createLinearGradient(frameX, frameY, frameX + frameW, frameY + frameH);
    railGradient.addColorStop(0, '#4C2D1A');
    railGradient.addColorStop(0.5, '#2B160B');
    railGradient.addColorStop(1, '#5C341D');

    roundedRectPath(ctx, frameX, frameY, frameW, frameH, 34);
    ctx.fillStyle = railGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.4;
    roundedRectPath(ctx, frameX, frameY, frameW, frameH, 34);
    ctx.stroke();

    const feltGradient = ctx.createLinearGradient(metrics.x, metrics.y, metrics.x, metrics.y + metrics.height);
    feltGradient.addColorStop(0, '#0D845D');
    feltGradient.addColorStop(0.5, '#0B6E50');
    feltGradient.addColorStop(1, '#085741');

    roundedRectPath(ctx, metrics.x, metrics.y, metrics.width, metrics.height, 24);
    ctx.fillStyle = feltGradient;
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#86EFAC';
    ctx.lineWidth = 1;
    roundedRectPath(ctx, metrics.x + 8, metrics.y + 8, metrics.width - 16, metrics.height - 16, 20);
    ctx.stroke();
    ctx.restore();

    const diamondPositions = [
      { x: TABLE_WIDTH * 0.166, y: -24 },
      { x: TABLE_WIDTH * 0.333, y: -24 },
      { x: TABLE_WIDTH * 0.666, y: -24 },
      { x: TABLE_WIDTH * 0.833, y: -24 },
      { x: TABLE_WIDTH * 0.166, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.333, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.666, y: TABLE_HEIGHT + 24 },
      { x: TABLE_WIDTH * 0.833, y: TABLE_HEIGHT + 24 },
      { x: -24, y: TABLE_HEIGHT * 0.25 },
      { x: -24, y: TABLE_HEIGHT * 0.5 },
      { x: -24, y: TABLE_HEIGHT * 0.75 },
      { x: TABLE_WIDTH + 24, y: TABLE_HEIGHT * 0.25 },
      { x: TABLE_WIDTH + 24, y: TABLE_HEIGHT * 0.5 },
      { x: TABLE_WIDTH + 24, y: TABLE_HEIGHT * 0.75 },
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    diamondPositions.forEach((pos) => {
      const p = projectPoint(pos, metrics);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    POCKETS.forEach((pocket) => {
      const pos = projectPoint(pocket, metrics);
      const r = projectRadius(POCKET_RADIUS, metrics);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#050505';
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 0.64, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
    });

    for (const ball of ballsRef.current) {
      if (ball.pocketed || !ball.active) continue;

      const pos = projectPoint({ x: ball.x, y: ball.y }, metrics);
      const r = projectRadius(ball.radius, metrics);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = r * 0.9;
      ctx.shadowOffsetY = r * 0.25;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);

      if (ball.kind === 'cue') {
        const cueGradient = ctx.createRadialGradient(
          pos.x - r * 0.35,
          pos.y - r * 0.35,
          r * 0.2,
          pos.x,
          pos.y,
          r,
        );
        cueGradient.addColorStop(0, '#FFFFFF');
        cueGradient.addColorStop(1, '#DDE5ED');
        ctx.fillStyle = cueGradient;
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
        const gradient = ctx.createRadialGradient(
          pos.x - r * 0.35,
          pos.y - r * 0.35,
          r * 0.25,
          pos.x,
          pos.y,
          r,
        );
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.18, ball.color);
        gradient.addColorStop(1, ball.color);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.lineWidth = Math.max(1.4, r * 0.08);
      ctx.strokeStyle = ball.kind === 'cue' ? '#D1D5DB' : 'rgba(255,255,255,0.18)';
      ctx.stroke();

      if (ball.number !== 0) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.fillStyle = '#0F172A';
        ctx.font = `${Math.max(10, r * 0.72)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ball.number), pos.x, pos.y + 0.4);
      }

      ctx.restore();
    }

    const cue = findCueBall();
    const interaction = interactionRef.current;

    if (
      cue &&
      !cue.pocketed &&
      !movingRef.current &&
      !winnerRef.current &&
      interaction.mode === 'aim' &&
      interaction.current
    ) {
      const dx = cue.x - interaction.current.x;
      const dy = cue.y - interaction.current.y;
      const drag = Math.min(Math.hypot(dx, dy), MAX_DRAG);

      if (drag > 4) {
        const ux = dx / drag;
        const uy = dy / drag;

        const aimStart = projectPoint({ x: cue.x + ux * BALL_RADIUS, y: cue.y + uy * BALL_RADIUS }, metrics);
        const aimEnd = projectPoint(
          {
            x: cue.x + ux * 320,
            y: cue.y + uy * 320,
          },
          metrics,
        );

        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(aimStart.x, aimStart.y);
        ctx.lineTo(aimEnd.x, aimEnd.y);
        ctx.stroke();
        ctx.restore();

        const cueTip = projectPoint(
          {
            x: cue.x - ux * (BALL_RADIUS + 16 + drag * 0.22),
            y: cue.y - uy * (BALL_RADIUS + 16 + drag * 0.22),
          },
          metrics,
        );

        const cueButt = projectPoint(
          {
            x: cue.x - ux * (290 + drag * 0.22),
            y: cue.y - uy * (290 + drag * 0.22),
          },
          metrics,
        );

        ctx.save();
        ctx.lineWidth = Math.max(6, 14 * metrics.scale);
        ctx.lineCap = 'round';

        const cueGradient = ctx.createLinearGradient(cueButt.x, cueButt.y, cueTip.x, cueTip.y);
        cueGradient.addColorStop(0, '#E8C08C');
        cueGradient.addColorStop(0.45, '#C98F57');
        cueGradient.addColorStop(0.78, '#6B3F1E');
        cueGradient.addColorStop(1, '#FDE68A');

        ctx.strokeStyle = cueGradient;
        ctx.beginPath();
        ctx.moveTo(cueButt.x, cueButt.y);
        ctx.lineTo(cueTip.x, cueTip.y);
        ctx.stroke();

        ctx.restore();

        const meterWidth = 160;
        const meterHeight = 10;
        const meterX = canvasSize.width - meterWidth - 18;
        const meterY = canvasSize.height - 22;

        roundedRectPath(ctx, meterX, meterY, meterWidth, meterHeight, 999);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();

        roundedRectPath(ctx, meterX, meterY, (drag / MAX_DRAG) * meterWidth, meterHeight, 999);
        const powerGradient = ctx.createLinearGradient(meterX, meterY, meterX + meterWidth, meterY);
        powerGradient.addColorStop(0, '#22C55E');
        powerGradient.addColorStop(0.5, '#EAB308');
        powerGradient.addColorStop(1, '#EF4444');
        ctx.fillStyle = powerGradient;
        ctx.fill();
      }
    }

    if (
      cue &&
      !cue.pocketed &&
      !movingRef.current &&
      !winnerRef.current &&
      ballInHandRef.current === currentPlayerRef.current
    ) {
      const cuePos = projectPoint({ x: cue.x, y: cue.y }, metrics);
      const cueRadius = projectRadius(cue.radius, metrics);

      ctx.save();
      ctx.strokeStyle = 'rgba(34,211,238,0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cuePos.x, cuePos.y, cueRadius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [canvasSize.height, canvasSize.width, findCueBall]);

  const stepPhysics = useCallback((dt: number) => {
    const balls = ballsRef.current;

    for (const ball of balls) {
      if (!ball.active || ball.pocketed) continue;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      ball.vx *= Math.pow(FRICTION, dt);
      ball.vy *= Math.pow(FRICTION, dt);

      if (Math.hypot(ball.vx, ball.vy) < MIN_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
      }

      for (const pocket of POCKETS) {
        if (distance(ball, pocket) < POCKET_RADIUS - 1.5) {
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

          break;
        }
      }

      if (ball.pocketed) continue;

      if (ball.x <= BALL_RADIUS) {
        ball.x = BALL_RADIUS;
        ball.vx = Math.abs(ball.vx) * 0.98;
      } else if (ball.x >= TABLE_WIDTH - BALL_RADIUS) {
        ball.x = TABLE_WIDTH - BALL_RADIUS;
        ball.vx = -Math.abs(ball.vx) * 0.98;
      }

      if (ball.y <= BALL_RADIUS) {
        ball.y = BALL_RADIUS;
        ball.vy = Math.abs(ball.vy) * 0.98;
      } else if (ball.y >= TABLE_HEIGHT - BALL_RADIUS) {
        ball.y = TABLE_HEIGHT - BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy) * 0.98;
      }
    }

    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (!a.active || a.pocketed) continue;

      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (!b.active || b.pocketed) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist === 0) {
          dist = 0.0001;
          dx = 0.0001;
          dy = 0;
        }

        if (dist < minDist) {
          if (shotRef.current.inProgress && shotRef.current.firstContact === null) {
            if (a.number === 0 && b.number !== 0) {
              shotRef.current.firstContact = b.number;
            } else if (b.number === 0 && a.number !== 0) {
              shotRef.current.firstContact = a.number;
            }
          }

          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;

          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const impact = dvx * nx + dvy * ny;

          if (impact < 0) {
            const impulse = impact;

            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    const currentlyMoving = balls.some(
      (ball) => ball.active && !ball.pocketed && Math.hypot(ball.vx, ball.vy) > MIN_SPEED,
    );

    if (currentlyMoving !== movingRef.current) {
      movingRef.current = currentlyMoving;
      setBallsMoving(currentlyMoving);
    }

    if (!currentlyMoving && shotRef.current.inProgress) {
      resolveShot(shotRef.current);
    }
  }, [resolveShot]);

  useEffect(() => {
    if (!canvasSize.width || !canvasSize.height) return;

    let isMounted = true;

    const frame = (time: number) => {
      if (!isMounted) return;

      const last = lastFrameRef.current || time;
      const dt = Math.min(1.75, (time - last) / 16.6667 || 1);

      lastFrameRef.current = time;

      stepPhysics(dt);
      drawScene();

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      isMounted = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [canvasSize.height, canvasSize.width, drawScene, stepPhysics]);

  const eventToTablePoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    const metrics = renderMetricsRef.current;

    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    return {
      x: clamp((localX - metrics.x) / metrics.scale, 0, TABLE_WIDTH),
      y: clamp((localY - metrics.y) / metrics.scale, 0, TABLE_HEIGHT),
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (winnerRef.current || movingRef.current) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const point = eventToTablePoint(event.clientX, event.clientY);
    const cue = findCueBall();

    if (!cue) return;

    if (ballInHandRef.current === currentPlayerRef.current) {
      if (isCuePlacementValid(point.x, point.y)) {
        cue.x = point.x;
        cue.y = point.y;
      }

      interactionRef.current = {
        mode: 'place',
        pointerId: event.pointerId,
        start: point,
        current: point,
      };

      return;
    }

    if (distance(point, cue) <= cue.radius * 1.8) {
      interactionRef.current = {
        mode: 'aim',
        pointerId: event.pointerId,
        start: point,
        current: point,
      };
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;

    if (interaction.mode === 'idle' || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();

    const point = eventToTablePoint(event.clientX, event.clientY);

    if (interaction.mode === 'place') {
      const cue = findCueBall();
      if (!cue) return;

      if (isCuePlacementValid(point.x, point.y)) {
        cue.x = point.x;
        cue.y = point.y;
      }

      interactionRef.current.current = point;
      return;
    }

    interactionRef.current.current = point;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;

    if (interaction.mode === 'idle' || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);

    const cue = findCueBall();

    if (!cue) {
      interactionRef.current = emptyInteraction();
      return;
    }

    if (interaction.mode === 'place') {
      ballInHandRef.current = null;
      setBallInHandFor(null);
      setStatusText(`${PLAYER_NAMES[currentPlayerRef.current]}, прицеливайся`);
      interactionRef.current = emptyInteraction();
      return;
    }

    if (!interaction.current) {
      interactionRef.current = emptyInteraction();
      return;
    }

    const dx = cue.x - interaction.current.x;
    const dy = cue.y - interaction.current.y;
    const drag = Math.min(Math.hypot(dx, dy), MAX_DRAG);

    if (drag > 7) {
      cue.vx = dx * 0.16;
      cue.vy = dy * 0.16;

      shotRef.current = {
        inProgress: true,
        firstContact: null,
        pocketed: [],
        cuePocketed: false,
      };

      movingRef.current = true;
      setBallsMoving(true);
      setStatusText('Шары в движении...');
    }

    interactionRef.current = emptyInteraction();
  };

  const handlePointerCancel = () => {
    interactionRef.current = emptyInteraction();
  };

  const playerBadge = (player: PlayerId) => {
    const isActive = currentPlayer === player && !winner;
    const group = playerGroups[player];
    const remaining = group ? countRemaining(group) : null;

    return (
      <motion.div
        animate={{
          scale: isActive ? 1.02 : 1,
          opacity: winner && winner !== player ? 0.72 : 1,
        }}
        className={`rounded-2xl border px-3 py-2 ${
          isActive
            ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]'
            : 'border-white/10 bg-white/5'
        }`}
      >
        <div className="text-white font-bold text-sm">{PLAYER_NAMES[player]}</div>

        <div className="mt-1 text-[11px] text-gray-300">
          {group ? GROUP_LABELS[group] : 'Группа не выбрана'}
        </div>

        <div className="mt-1 text-[11px] text-gray-400">
          {group ? `Осталось: ${remaining}` : 'Ждёт первый удачный шар'}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full overflow-hidden bg-[#05070B] px-3 pb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3">
        {playerBadge(1)}

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={resetGame}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white active:scale-95 transition"
          >
            <RefreshCcw size={14} />
            Рестарт
          </button>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-gray-300 whitespace-nowrap">
            {winner ? `Победил ${PLAYER_NAMES[winner]}` : statusText}
          </div>
        </div>

        {playerBadge(2)}
      </div>

      {!isLandscape && (
        <div className="mb-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
          Для лучшего контроля держи устройство горизонтально
        </div>
      )}

      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-[#020406] shadow-[0_35px_100px_rgba(0,0,0,0.55)]"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />

        <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-200 backdrop-blur-md">
          {ballInHandFor === currentPlayer
            ? 'Шар в руке — поставь биток куда удобно'
            : ballsMoving
              ? 'Ожидаем остановки всех шаров'
              : 'Тяни биток назад, чтобы задать силу удара'}
        </div>

        <AnimatePresence>
          {showRotateIntro && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-[#03050A]/92 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.92, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                className="mx-4 flex max-w-[520px] flex-col items-center rounded-[32px] border border-white/10 bg-white/5 px-8 py-8 text-center"
              >
                <motion.div
                  animate={{ rotate: [0, 90, 90, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="mb-5 rounded-[28px] border border-cyan-400/30 bg-cyan-400/10 p-5"
                >
                  <Smartphone className="h-14 w-14 text-cyan-300" />
                </motion.div>

                <div className="text-2xl font-black text-white">Поверни экран</div>

                <div className="mt-2 text-sm leading-6 text-gray-300">
                  Pool раскрывается в горизонтали — так удобнее целиться, контролировать силу
                  удара и держать стол под полным обзором.
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-[#020406]/78 backdrop-blur-sm"
            >
              <div className="mx-4 w-full max-w-md rounded-[32px] border border-white/10 bg-[#0B1017]/95 p-6 text-center shadow-[0_35px_120px_rgba(0,0,0,0.6)]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/15">
                  <Trophy className="h-8 w-8 text-amber-300" />
                </div>

                <div className="text-3xl font-black text-white">{PLAYER_NAMES[winner]}</div>
                <div className="mt-2 text-sm text-gray-300">{statusText}</div>

                <button
                  onClick={resetGame}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-bold text-white active:scale-95 transition"
                >
                  <RefreshCcw size={16} />
                  Новая партия
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-gray-300">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
          Ходят по очереди
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
          После фола — шар в руке
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
          8-ball после своей группы
        </div>
      </div>
    </div>
  );
};

export default PoolGame;