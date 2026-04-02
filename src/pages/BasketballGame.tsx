import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type RingState = {
  x: number;
  y: number;
  scale: number;
  tilt: number;
};

type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  flying: boolean;
  scored: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type ShotState = 'aim' | 'flying' | 'switching' | 'finished';

const WORLD_W = 1280;
const WORLD_H = 720;
const FLOOR_Y = 650;

// Мяч чуть меньше визуально относительно кольца, ближе к реальному ощущению
const BALL_R = 14;

// Физика быстрее и бодрее
const GRAVITY = 0.42;
const AIR = 0.999;
const WIN_SCORE = 10;
const SHOTS_PER_TURN = 2;

// Верхний HUD занимает место — кольцо туда не пускаем
const HUD_SAFE_TOP = 150;

// Безопасные положения кольца
const ringPresets: RingState[] = [
  { x: 1040, y: 250, scale: 1.0, tilt: -0.03 },
  { x: 1090, y: 225, scale: 0.95, tilt: 0.04 },
  { x: 1000, y: 315, scale: 1.04, tilt: -0.02 },
  { x: 1120, y: 285, scale: 0.92, tilt: 0.06 },
  { x: 980, y: 220, scale: 1.08, tilt: -0.05 },
  { x: 1085, y: 350, scale: 0.98, tilt: 0.02 },
  { x: 1010, y: 275, scale: 1.02, tilt: -0.01 },
  { x: 1110, y: 245, scale: 0.94, tilt: 0.05 },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

const createBall = (): BallState => ({
  x: 224,
  y: 538,
  vx: 0,
  vy: 0,
  r: BALL_R,
  flying: false,
  scored: false,
});

const getNextRing = (prev?: RingState): RingState => {
  const pool = ringPresets.filter(
    (r) =>
      !prev ||
      Math.abs(r.x - prev.x) > 28 ||
      Math.abs(r.y - prev.y) > 18 ||
      Math.abs(r.tilt - prev.tilt) > 0.01
  );

  const pick = pool[Math.floor(Math.random() * pool.length)] ?? ringPresets[0];
  return {
    ...pick,
    y: clamp(pick.y, HUD_SAFE_TOP + 30, 370),
  };
};

const BasketballGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  const particlesRef = useRef<Particle[]>([]);
  const ballRef = useRef<BallState>(createBall());
  const ringRef = useRef<RingState>(getNextRing());
  const shotTimerRef = useRef(0);

  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [currentPlayer, setCurrentPlayer] = useState<0 | 1>(0);
  const [shotsLeft, setShotsLeft] = useState(SHOTS_PER_TURN);
  const [shotState, setShotState] = useState<ShotState>('aim');
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [showRotateHint, setShowRotateHint] = useState(true);
  const [flashText, setFlashText] = useState('');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const scoresRef = useRef<[number, number]>([0, 0]);
  const currentPlayerRef = useRef<0 | 1>(0);
  const shotsLeftRef = useRef(SHOTS_PER_TURN);
  const shotStateRef = useRef<ShotState>('aim');
  const winnerRef = useRef<0 | 1 | null>(null);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);

  useEffect(() => {
    shotsLeftRef.current = shotsLeft;
  }, [shotsLeft]);

  useEffect(() => {
    shotStateRef.current = shotState;
  }, [shotState]);

  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowRotateHint(false), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && arenaRef.current?.contains(target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const resize = useCallback(() => {
    const el = arenaRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const rect = el.getBoundingClientRect();
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    setViewport({ width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const isPortrait = viewport.height > viewport.width;

 

  const contentStyle = useMemo(() => {
    if (!viewport.width || !viewport.height) return {};

    if (!isPortrait) {
      return {
        width: viewport.width,
        height: viewport.height,
      };
    }

    return {
      width: viewport.height,
      height: viewport.width,
      transform: 'rotate(90deg)',
      transformOrigin: 'center center',
    };
  }, [viewport, isPortrait]);

  const toWorldPoint = (clientX: number, clientY: number) => {
    const wrapper = canvasRef.current?.parentElement;
    if (!wrapper) return { x: 0, y: 0 };

    const rect = wrapper.getBoundingClientRect();

    if (!isPortrait) {
      return {
        x: ((clientX - rect.left) / rect.width) * WORLD_W,
        y: ((clientY - rect.top) / rect.height) * WORLD_H,
      };
    }

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const nx = localX / rect.width;
    const ny = localY / rect.height;

    return {
      x: ny * WORLD_W,
      y: (1 - nx) * WORLD_H,
    };
  };

  const spawnParticles = (x: number, y: number, colors: string[], count = 18) => {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const s = 1 + Math.random() * 4.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55 + Math.random() * 0.35,
        size: 2 + Math.random() * 4,
        color: colors[i % colors.length],
      });
    }
  };

  const moveRing = () => {
    ringRef.current = getNextRing(ringRef.current);
  };

  const resetBall = () => {
    ballRef.current = createBall();
    shotTimerRef.current = 0;
  };

  const finishTurnStep = (scored: boolean) => {
    const player = currentPlayerRef.current;
    const newScores = [...scoresRef.current] as [number, number];

    if (scored) {
      newScores[player] += 2;
      scoresRef.current = newScores;
      setScores(newScores);
      setFlashText('SWISH! +2');
      window.setTimeout(() => setFlashText(''), 850);

      if (newScores[player] >= WIN_SCORE) {
        setWinner(player);
        setShotState('finished');
        return;
      }
    }

    const nextShots = shotsLeftRef.current - 1;

    if (nextShots > 0) {
      shotsLeftRef.current = nextShots;
      setShotsLeft(nextShots);
      moveRing();
      resetBall();
      setShotState('aim');
      return;
    }

    setShotState('switching');

    window.setTimeout(() => {
      const nextPlayer: 0 | 1 = currentPlayerRef.current === 0 ? 1 : 0;
      currentPlayerRef.current = nextPlayer;
      shotsLeftRef.current = SHOTS_PER_TURN;

      setCurrentPlayer(nextPlayer);
      setShotsLeft(SHOTS_PER_TURN);
      moveRing();
      resetBall();
      setShotState('aim');
    }, 700);
  };

  const drawBackground = (ctx: CanvasRenderingContext2D) => {
    const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    bg.addColorStop(0, '#0C0F2B');
    bg.addColorStop(0.26, '#2D1F63');
    bg.addColorStop(0.62, '#9A3B6A');
    bg.addColorStop(1, '#FFB85A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const sunGlow = ctx.createRadialGradient(250, 470, 20, 250, 470, 560);
    sunGlow.addColorStop(0, 'rgba(255,193,94,0.28)');
    sunGlow.addColorStop(1, 'rgba(255,193,94,0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (let i = 0; i < 110; i++) {
      ctx.fillStyle = i % 7 === 0 ? 'rgba(255,236,176,0.95)' : 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.arc(30 + ((i * 131) % WORLD_W), 14 + ((i * 79) % 250), 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 14; i++) {
      const x = i * 98;
      const h = 110 + ((i * 47) % 185);
      ctx.fillRect(x, WORLD_H - 260 - h, 72, h);
    }

    ctx.fillStyle = 'rgba(11, 17, 38, 0.45)';
    ctx.fillRect(0, FLOOR_Y, WORLD_W, WORLD_H - FLOOR_Y);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(48, FLOOR_Y + 28);
    ctx.quadraticCurveTo(WORLD_W * 0.44, FLOOR_Y - 22, WORLD_W * 0.8, FLOOR_Y + 8);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,185,86,0.14)';
    ctx.fillRect(0, FLOOR_Y - 10, WORLD_W, 12);
  };

  const drawPlayer = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    active: boolean,
    primary: string,
    secondary: string,
    holdBall: boolean,
    time: number
  ) => {
    ctx.save();
    ctx.translate(x, y);

    const bob = active && shotStateRef.current === 'aim' ? Math.sin(time * 0.009) * 4 : 0;
    const lean = active && shotStateRef.current === 'flying' ? -0.12 : 0;
    ctx.translate(0, bob);
    ctx.rotate(lean);

    const targetX = pointerRef.current.x || x + 120;
    const targetY = pointerRef.current.y || y - 140;
    const armAngle =
      active && pointerRef.current.active
        ? clamp(Math.atan2(targetY - (y - 26), targetX - (x + 16)), -1.45, 0.15)
        : -0.55;

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 96, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // ноги
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 84);
    ctx.lineTo(-20, 132);
    ctx.moveTo(16, 84);
    ctx.lineTo(20, 132);
    ctx.stroke();

    // обувь
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-32, 126, 24, 10, 5);
    ctx.roundRect(9, 126, 24, 10, 5);
    ctx.fill();

    // тело
    const jersey = ctx.createLinearGradient(-34, 10, 34, 92);
    jersey.addColorStop(0, primary);
    jersey.addColorStop(1, secondary);
    ctx.fillStyle = jersey;
    ctx.beginPath();
    ctx.roundRect(-30, 10, 62, 78, 20);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.18;
    ctx.fillRect(-20, 18, 10, 60);
    ctx.globalAlpha = 1;

    // шея
    ctx.fillStyle = '#f2c9a0';
    ctx.fillRect(-7, -1, 14, 16);

    // голова
    ctx.beginPath();
    ctx.arc(0, -18, 29, 0, Math.PI * 2);
    ctx.fill();

    // волосы/шапка
    if (primary === '#ff5b2e') {
      ctx.fillStyle = '#d62828';
      ctx.beginPath();
      ctx.arc(-5, -29, 31, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-22, -43, 42, 15, 8);
      ctx.fill();
      ctx.fillRect(10, -36, 24, 6);
    } else {
      ctx.fillStyle = '#162447';
      ctx.beginPath();
      ctx.arc(0, -30, 31, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(23, -28, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // лицо
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-8, -18, 2.5, 0, Math.PI * 2);
    ctx.arc(7, -18, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // левая рука
    ctx.strokeStyle = '#f2c9a0';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-10, 26);
    ctx.lineTo(-32, 50);
    ctx.stroke();

    // правая рука
    ctx.save();
    ctx.translate(12, 24);
    ctx.rotate(armAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(42, -18);
    ctx.stroke();
    if (holdBall) {
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(45, -20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.26)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 38, 66, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  };

  const drawBall = (ctx: CanvasRenderingContext2D, ball: BallState) => {
    ctx.save();

    ctx.shadowColor = '#ff9f1c';
    ctx.shadowBlur = 16;

    const grad = ctx.createRadialGradient(ball.x - 4, ball.y - 4, 2, ball.x, ball.y, ball.r);
    grad.addColorStop(0, '#ffd08a');
    grad.addColorStop(0.42, '#ff9922');
    grad.addColorStop(1, '#d66d00');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(98,48,6,0.88)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r - 1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ball.x - ball.r + 2, ball.y);
    ctx.quadraticCurveTo(ball.x, ball.y - 5, ball.x + ball.r - 2, ball.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y - ball.r + 2);
    ctx.quadraticCurveTo(ball.x - 6, ball.y, ball.x, ball.y + ball.r - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y - ball.r + 2);
    ctx.quadraticCurveTo(ball.x + 7, ball.y, ball.x, ball.y + ball.r - 2);
    ctx.stroke();

    ctx.restore();
  };

  const drawRing = (ctx: CanvasRenderingContext2D, ring: RingState) => {
    ctx.save();
    ctx.translate(ring.x, ring.y);
    ctx.rotate(ring.tilt);

    const boardW = 160 * ring.scale;
    const boardH = 106 * ring.scale;

    // стойка
    ctx.fillStyle = 'rgba(20, 24, 44, 0.45)';
    ctx.fillRect(62 * ring.scale, 34 * ring.scale, 18 * ring.scale, 228 * ring.scale);

    // прозрачный щит
    const glass = ctx.createLinearGradient(-boardW / 2, -boardH / 2, boardW / 2, boardH / 2);
    glass.addColorStop(0, 'rgba(255,255,255,0.24)');
    glass.addColorStop(1, 'rgba(170,220,255,0.10)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-boardW / 2, -boardH / 2, boardW, boardH, 16 * ring.scale);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,220,245,0.9)';
    ctx.lineWidth = 5 * ring.scale;
    ctx.beginPath();
    ctx.roundRect(
      -boardW / 2 + 6 * ring.scale,
      -boardH / 2 + 6 * ring.scale,
      boardW - 12 * ring.scale,
      boardH - 12 * ring.scale,
      14 * ring.scale
    );
    ctx.stroke();

    // квадрат на щите
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 4 * ring.scale;
    ctx.beginPath();
    ctx.roundRect(
      -22 * ring.scale,
      -16 * ring.scale,
      48 * ring.scale,
      34 * ring.scale,
      4 * ring.scale
    );
    ctx.stroke();

    // настоящий обод
    const rimY = boardH / 2 - 12 * ring.scale;
    const rimW = 92 * ring.scale;

    ctx.shadowColor = '#ff6a2d';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ff5b2e';
    ctx.lineWidth = 8 * ring.scale;
    ctx.beginPath();
    ctx.moveTo(-rimW / 2, rimY);
    ctx.lineTo(rimW / 2, rimY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // аккуратная сетка
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.8 * ring.scale;
    const netTop = rimY + 2 * ring.scale;
    const netBottom = rimY + 42 * ring.scale;
    const cols = 7;

    for (let i = 0; i < cols; i++) {
      const t = i / (cols - 1);
      const xTop = -rimW / 2 + t * rimW;
      const xBottom = -24 * ring.scale + t * 48 * ring.scale;

      ctx.beginPath();
      ctx.moveTo(xTop, netTop);
      ctx.lineTo(xBottom, netBottom);
      ctx.stroke();
    }

    for (let i = 0; i < cols - 1; i++) {
      const t = i / (cols - 2);
      const xTop = -rimW / 2 + t * rimW;
      const xBottom = 24 * ring.scale - t * 48 * ring.scale;

      ctx.beginPath();
      ctx.moveTo(xTop, netTop);
      ctx.lineTo(xBottom, netBottom);
      ctx.stroke();
    }

    // нижняя линия сетки
    ctx.beginPath();
    ctx.moveTo(-24 * ring.scale, netBottom);
    ctx.lineTo(24 * ring.scale, netBottom);
    ctx.stroke();

    ctx.restore();
  };

  const drawAimPreview = (ctx: CanvasRenderingContext2D) => {
    if (!pointerRef.current.active || shotStateRef.current !== 'aim') return;

    const ball = ballRef.current;
    const dx = ball.x - pointerRef.current.x;
    const dy = ball.y - pointerRef.current.y;
    const dist = Math.min(len(dx, dy), 190);

    if (dist < 10) return;

    const power = clamp(dist / 7.5, 7, 29);
    const vx = clamp((dx / dist) * power * 1.45, -2, 28);
    const vy = clamp((dy / dist) * power * 1.2, -24, 1);

    let px = ball.x;
    let py = ball.y;
    let pvx = vx;
    let pvy = vy;

    ctx.save();
    for (let i = 0; i < 12; i++) {
      px += pvx;
      py += pvy;
      pvy += GRAVITY;
      pvx *= AIR;

      ctx.globalAlpha = 1 - i / 12;
      ctx.beginPath();
      ctx.arc(px, py, 5 - i * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,228,255,0.92)';
      ctx.fill();

      if (py > FLOOR_Y) break;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const checkScore = (prevY: number, ball: BallState, ring: RingState) => {
    const rimY = ring.y + 41 * ring.scale;
    const rimX1 = ring.x - (92 * ring.scale) / 2;
    const rimX2 = ring.x + (92 * ring.scale) / 2;

    return (
      prevY < rimY &&
      ball.y >= rimY &&
      ball.x > rimX1 + 12 * ring.scale &&
      ball.x < rimX2 - 12 * ring.scale &&
      ball.vy > 0
    );
  };

  const updatePhysics = () => {
    if (shotStateRef.current !== 'flying') return;

    const ball = ballRef.current;
    const ring = ringRef.current;
    const prevY = ball.y;

    shotTimerRef.current += 1;

    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vy += GRAVITY;
    ball.vx *= AIR;
    ball.vy *= AIR;

    const rimY = ring.y + 41 * ring.scale;
    const rimX1 = ring.x - (92 * ring.scale) / 2;
    const rimX2 = ring.x + (92 * ring.scale) / 2;

    // столкновение только с ободом
    const d1 = len(ball.x - rimX1, ball.y - rimY);
    const d2 = len(ball.x - rimX2, ball.y - rimY);

    if (d1 < ball.r + 6 * ring.scale) {
      const nx = (ball.x - rimX1) / Math.max(d1, 1);
      const ny = (ball.y - rimY) / Math.max(d1, 1);
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx = (ball.vx - 2 * dot * nx) * 0.9;
      ball.vy = (ball.vy - 2 * dot * ny) * 0.9;
      spawnParticles(ball.x, ball.y, ['#ffffff', '#ffd28b', '#ff7b54'], 8);
    }

    if (d2 < ball.r + 6 * ring.scale) {
      const nx = (ball.x - rimX2) / Math.max(d2, 1);
      const ny = (ball.y - rimY) / Math.max(d2, 1);
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx = (ball.vx - 2 * dot * nx) * 0.9;
      ball.vy = (ball.vy - 2 * dot * ny) * 0.9;
      spawnParticles(ball.x, ball.y, ['#ffffff', '#ffd28b', '#ff7b54'], 8);
    }

    if (!ball.scored && checkScore(prevY, ball, ring)) {
      ball.scored = true;
      spawnParticles(ball.x, ball.y, ['#fff7ae', '#ffb13d', '#ffffff'], 26);
    }

    if (ball.y + ball.r >= FLOOR_Y) {
      ball.y = FLOOR_Y - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.56;
      ball.vx *= 0.84;

      if (Math.abs(ball.vy) < 1.1) {
        ball.vy = 0;
      }
    }

    const shouldEnd =
      ball.x > WORLD_W + 140 ||
      ball.x < -140 ||
      ball.y > WORLD_H + 140 ||
      (ball.y >= FLOOR_Y - ball.r && Math.abs(ball.vx) < 0.4 && Math.abs(ball.vy) < 0.4) ||
      shotTimerRef.current > 340;

    if (shouldEnd) {
      finishTurnStep(ball.scored);
    }
  };

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const time = performance.now();

    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    drawBackground(ctx);

    drawPlayer(
      ctx,
      170,
      454,
      currentPlayerRef.current === 0,
      '#ff5b2e',
      '#ff914d',
      shotStateRef.current === 'aim' && currentPlayerRef.current === 0,
      time
    );

    drawPlayer(
      ctx,
      290,
      474,
      currentPlayerRef.current === 1,
      '#3b82f6',
      '#6aa6ff',
      false,
      time
    );

    drawRing(ctx, ringRef.current);
    drawAimPreview(ctx);
    drawBall(ctx, ballRef.current);

    particlesRef.current.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    const loop = () => {
      updatePhysics();

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

      drawScene();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawScene]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (shotStateRef.current !== 'aim' || winnerRef.current !== null) return;
    e.preventDefault();
    const p = toWorldPoint(e.clientX, e.clientY);
    pointerRef.current = { active: true, x: p.x, y: p.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerRef.current.active) return;
    e.preventDefault();
    const p = toWorldPoint(e.clientX, e.clientY);
    pointerRef.current.x = p.x;
    pointerRef.current.y = p.y;
  };

  const launchShot = () => {
    const ball = ballRef.current;
    const dx = ball.x - pointerRef.current.x;
    const dy = ball.y - pointerRef.current.y;
    const dist = Math.min(len(dx, dy), 190);

    if (dist < 10) {
      pointerRef.current.active = false;
      return;
    }

    // сильнее и быстрее
    const power = clamp(dist / 7.5, 7, 29);
    ball.vx = clamp((dx / dist) * power * 1.45, -2, 28);
    ball.vy = clamp((dy / dist) * power * 1.2, -24, 1);
    ball.flying = true;
    ball.scored = false;
    pointerRef.current.active = false;
    shotTimerRef.current = 0;
    setShotState('flying');
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (shotStateRef.current !== 'aim' || winnerRef.current !== null) return;
    launchShot();
  };

  const restart = () => {
    const base: [number, number] = [0, 0];
    scoresRef.current = base;
    currentPlayerRef.current = 0;
    shotsLeftRef.current = SHOTS_PER_TURN;
    winnerRef.current = null;
    shotStateRef.current = 'aim';

    setScores(base);
    setCurrentPlayer(0);
    setShotsLeft(SHOTS_PER_TURN);
    setWinner(null);
    setShotState('aim');
    setFlashText('');
    particlesRef.current = [];
    ringRef.current = getNextRing();
    resetBall();
  };

  return (
    <div className="h-[calc(100vh-180px)] w-full overflow-hidden bg-[#0A0A0F] relative">
      <div ref={arenaRef} className="absolute inset-0 overflow-hidden">
        <AnimatePresence>
          {showRotateHint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center text-white px-6"
              >
                <motion.div
                  animate={{ rotate: [0, 90, 90, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="mx-auto mb-5 h-16 w-10 rounded-[14px] border-2 border-white/70"
                />
                <div className="text-2xl font-black">Поверни телефон</div>
                <div className="text-white/70 mt-2">Игра лучше в горизонтальном формате</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center"
          style={{
            ...contentStyle,
            transform:
              (contentStyle as any).transform
                ? `translate(-50%, -50%) ${(contentStyle as any).transform}`
                : 'translate(-50%, -50%)',
            transformOrigin: 'center center',
          }}
        >
          <canvas
            ref={canvasRef}
            width={WORLD_W}
            height={WORLD_H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (pointerRef.current.active = false)}
            onPointerLeave={() => (pointerRef.current.active = false)}
            className="touch-none"
            style={{
              width: '100%',
              height: '100%',
              touchAction: 'none',
              display: 'block',
            }}
          />

          <div className="absolute left-0 right-0 top-0 z-20 px-4 pt-3">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div
                className={`rounded-[22px] px-4 py-3 backdrop-blur-md border ${
                  currentPlayer === 0 ? 'bg-orange-500/20 border-orange-300/40' : 'bg-white/8 border-white/10'
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">Player 1</div>
                <div className="text-3xl font-black text-white leading-none mt-1">{scores[0]}</div>
              </div>

              <div className="rounded-[22px] bg-white/10 border border-white/10 px-4 py-3 text-center min-w-[180px]">
                <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300">
                  {winner !== null ? 'Result' : `P${currentPlayer + 1} turn`}
                </div>
                <div className="text-white font-black text-xl mt-1">
                  {winner !== null ? `Player ${winner + 1} wins` : `${shotsLeft} shots left`}
                </div>
                <div className="text-white/55 text-xs mt-1">First to {WIN_SCORE}</div>
              </div>

              <div
                className={`rounded-[22px] px-4 py-3 backdrop-blur-md border text-right ${
                  currentPlayer === 1 ? 'bg-sky-500/20 border-sky-300/40' : 'bg-white/8 border-white/10'
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/60">Player 2</div>
                <div className="text-3xl font-black text-white leading-none mt-1">{scores[1]}</div>
              </div>
            </div>
          </div>

          <div className="absolute left-6 bottom-5 z-20">
            <div className="rounded-full bg-black/35 border border-white/10 px-4 py-2 text-white/65 text-xs uppercase tracking-[0.18em] backdrop-blur-md">
              Pull to aim • release to shoot
            </div>
          </div>

          <AnimatePresence>
            {flashText && (
              <motion.div
                key={flashText}
                initial={{ opacity: 0, scale: 0.8, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -10 }}
                className="absolute right-[23%] top-[36%] z-30 pointer-events-none"
              >
                <div className="text-[54px] font-black text-yellow-300 drop-shadow-[0_6px_18px_rgba(255,180,40,0.68)]">
                  {flashText}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {winner !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center"
              >
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-[28px] bg-white px-8 py-9 text-center shadow-2xl max-w-[340px]"
                >
                  <div className="text-sm font-bold uppercase tracking-[0.28em] text-slate-400">
                    Game Over
                  </div>
                  <div className="mt-3 text-4xl font-black text-slate-900">
                    Player {winner + 1} wins
                  </div>
                  <div className="mt-4 text-slate-600">
                    {scores[0]} : {scores[1]}
                  </div>
                  <button
                    onClick={restart}
                    className="mt-8 rounded-full bg-sky-600 px-6 py-3 text-white font-bold hover:bg-sky-500 transition"
                  >
                    Restart Match
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default BasketballGame;