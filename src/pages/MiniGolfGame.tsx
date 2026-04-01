import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WORLD_W = 720;
const WORLD_H = 1180;
const BALL_R = 12;
const HOLE_R = 17;
const FRICTION = 0.985;
const MIN_SPEED = 0.05;
const MAX_POWER = 17;
const AIM_MAX = 170;
const TOTAL_HOLES = 3;

type Vec = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Water = Rect;
type Bumper = { x: number; y: number; r: number; color: string };
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  trail: Vec[];
  shots: number;
  totalShots: number;
  done: boolean;
  name: string;
};

type HoleConfig = {
  hole: Vec;
  spawn: Vec;
  walls: Rect[];
  waters: Water[];
  bumpers: Bumper[];
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function len(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function pointInRect(px: number, py: number, rect: Rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

const holeConfigs: HoleConfig[] = [
  {
    hole: { x: 168, y: 235 },
    spawn: { x: 548, y: 305 },
    walls: [
      { x: 110, y: 130, w: 500, h: 18 },
      { x: 98, y: 130, w: 18, h: 370 },
      { x: 604, y: 130, w: 18, h: 370 },
      { x: 270, y: 210, w: 18, h: 230 },
      { x: 438, y: 400, w: 18, h: 220 },
      { x: 110, y: 700, w: 18, h: 280 },
      { x: 604, y: 700, w: 18, h: 280 },
      { x: 270, y: 820, w: 18, h: 170 },
      { x: 438, y: 820, w: 18, h: 170 },
      { x: 280, y: 990, w: 160, h: 14 },
    ],
    waters: [
      { x: 286, y: 196, w: 132, h: 82 },
      { x: 270, y: 756, w: 180, h: 104 },
      { x: 100, y: 514, w: 170, h: 75 },
      { x: 448, y: 545, w: 158, h: 75 },
    ],
    bumpers: [
      { x: 364, y: 635, r: 22, color: '#fbbf24' },
      { x: 173, y: 845, r: 20, color: '#fbbf24' },
      { x: 548, y: 348, r: 20, color: '#f59e0b' },
    ],
  },
  {
    hole: { x: 530, y: 240 },
    spawn: { x: 190, y: 920 },
    walls: [
      { x: 110, y: 130, w: 500, h: 18 },
      { x: 98, y: 130, w: 18, h: 850 },
      { x: 604, y: 130, w: 18, h: 850 },
      { x: 188, y: 320, w: 250, h: 18 },
      { x: 438, y: 320, w: 18, h: 170 },
      { x: 280, y: 520, w: 260, h: 18 },
      { x: 188, y: 690, w: 18, h: 180 },
      { x: 188, y: 870, w: 260, h: 18 },
      { x: 520, y: 690, w: 18, h: 180 },
    ],
    waters: [
      { x: 110, y: 206, w: 110, h: 86 },
      { x: 470, y: 560, w: 134, h: 95 },
      { x: 222, y: 734, w: 190, h: 94 },
    ],
    bumpers: [
      { x: 250, y: 420, r: 21, color: '#fbbf24' },
      { x: 515, y: 440, r: 21, color: '#f59e0b' },
      { x: 360, y: 618, r: 22, color: '#fbbf24' },
    ],
  },
  {
    hole: { x: 356, y: 212 },
    spawn: { x: 356, y: 930 },
    walls: [
      { x: 110, y: 130, w: 500, h: 18 },
      { x: 98, y: 130, w: 18, h: 850 },
      { x: 604, y: 130, w: 18, h: 850 },
      { x: 180, y: 292, w: 18, h: 200 },
      { x: 522, y: 292, w: 18, h: 200 },
      { x: 180, y: 492, w: 130, h: 18 },
      { x: 410, y: 492, w: 130, h: 18 },
      { x: 280, y: 650, w: 18, h: 210 },
      { x: 424, y: 650, w: 18, h: 210 },
      { x: 220, y: 860, w: 280, h: 18 },
    ],
    waters: [
      { x: 258, y: 285, w: 205, h: 92 },
      { x: 110, y: 582, w: 120, h: 104 },
      { x: 490, y: 582, w: 120, h: 104 },
    ],
    bumpers: [
      { x: 355, y: 560, r: 24, color: '#fbbf24' },
      { x: 220, y: 760, r: 20, color: '#f59e0b' },
      { x: 490, y: 760, r: 20, color: '#f59e0b' },
    ],
  },
];

function createBall(name: string, color: string, spawn: Vec): BallState {
  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    color,
    trail: [],
    shots: 0,
    totalShots: 0,
    done: false,
    name,
  };
}

export function MiniGolfBeautiful() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const [winner, setWinner] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [holeIndex, setHoleIndex] = useState(0);
  const [activePlayer, setActivePlayer] = useState(0);
  const [turnPhase, setTurnPhase] = useState<'aim' | 'ballMoving' | 'holeTransition'>('aim');
  
  const sparksRef = useRef<Spark[]>([]);
  const ballsRef = useRef<BallState[]>([
    createBall('Jack', '#ffd84d', holeConfigs[0].spawn),
    createBall('Kirsten', '#ffffff', holeConfigs[0].spawn),
  ]);

  const scale = useMemo(() => {
    if (typeof window === 'undefined') return 0.68;
    const availableHeight = window.innerHeight - 150;
    return Math.min(0.82, window.innerWidth / 840, availableHeight / 1180);
  }, [refresh]);

  useEffect(() => {
    const onResize = () => setRefresh(v => v + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevTouch = body.style.touchAction;
    const prevOverscroll = (body.style as any).overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    (body.style as any).overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevTouch;
      (body.style as any).overscrollBehavior = prevOverscroll;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const addSparks = (x: number, y: number, color: string, amount = 10) => {
      for (let i = 0; i < amount; i++) {
        const a = (Math.PI * 2 * i) / amount + Math.random() * 0.8;
        const s = 0.7 + Math.random() * 3.1;
        sparksRef.current.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.7 + Math.random() * 0.35,
          size: 2 + Math.random() * 3.5,
          color,
        });
      }
    };

    const currentHole = () => holeConfigs[holeIndex];

    const resetBallToSpawn = (ball: BallState) => {
      const spawn = currentHole().spawn;
      ball.x = spawn.x;
      ball.y = spawn.y;
      ball.vx = 0;
      ball.vy = 0;
      ball.trail = [];
      addSparks(ball.x, ball.y, '#7dd3fc', 12);
    };

    const resolveWallCollision = (ball: BallState, rect: Rect) => {
      const nearestX = clamp(ball.x, rect.x, rect.x + rect.w);
      const nearestY = clamp(ball.y, rect.y, rect.y + rect.h);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= BALL_R * BALL_R) return;

      const overlapX1 = Math.abs(ball.x + BALL_R - rect.x);
      const overlapX2 = Math.abs(rect.x + rect.w - (ball.x - BALL_R));
      const overlapY1 = Math.abs(ball.y + BALL_R - rect.y);
      const overlapY2 = Math.abs(rect.y + rect.h - (ball.y - BALL_R));
      const minOverlap = Math.min(overlapX1, overlapX2, overlapY1, overlapY2);

      if (minOverlap === overlapX1) {
        ball.x = rect.x - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.88;
      } else if (minOverlap === overlapX2) {
        ball.x = rect.x + rect.w + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.88;
      } else if (minOverlap === overlapY1) {
        ball.y = rect.y - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.88;
      } else {
        ball.y = rect.y + rect.h + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.88;
      }
      addSparks(ball.x, ball.y, '#ffffff', 4);
    };

    const resolveBumperCollision = (ball: BallState, bumper: Bumper) => {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const d = len(dx, dy);
      const minD = BALL_R + bumper.r;
      if (d <= 0 || d >= minD) return;
      const nx = dx / d;
      const ny = dy / d;
      ball.x = bumper.x + nx * minD;
      ball.y = bumper.y + ny * minD;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx = (ball.vx - 2 * dot * nx) * 0.92;
      ball.vy = (ball.vy - 2 * dot * ny) * 0.92;
      addSparks(ball.x, ball.y, bumper.color, 7);
    };

    const updateBall = (ball: BallState) => {
      const config = currentHole();
      if (ball.done) return;

      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      if (Math.abs(ball.vx) < MIN_SPEED) ball.vx = 0;
      if (Math.abs(ball.vy) < MIN_SPEED) ball.vy = 0;

      if (ball.x < 106 + BALL_R) {
        ball.x = 106 + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.88;
      }
      if (ball.x > 614 - BALL_R) {
        ball.x = 614 - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.88;
      }
      if (ball.y < 138 + BALL_R) {
        ball.y = 138 + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.88;
      }
      if (ball.y > 1072 - BALL_R) {
        ball.y = 1072 - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.88;
      }

      config.walls.forEach(rect => resolveWallCollision(ball, rect));
      config.bumpers.forEach(b => resolveBumperCollision(ball, b));

      for (const water of config.waters) {
        if (pointInRect(ball.x, ball.y, water)) {
          resetBallToSpawn(ball);
          return;
        }
      }

      const hx = ball.x - config.hole.x;
      const hy = ball.y - config.hole.y;
      const hd = len(hx, hy);
      const speed = len(ball.vx, ball.vy);
      if (hd < HOLE_R && speed < 2.2) {
        ball.done = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.x = config.hole.x;
        ball.y = config.hole.y;
        addSparks(config.hole.x, config.hole.y, '#22c55e', 18);
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 15) ball.trail.shift();
    };

    const drawBackground = () => {
      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      bg.addColorStop(0, '#0d7fd9');
      bg.addColorStop(1, '#167ed7');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(30 + ((i * 71) % WORLD_W), 60 + ((i * 127) % WORLD_H), (i % 3) + 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(60, 120);
      ctx.fillStyle = '#1471bf';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(24, 0);
      ctx.lineTo(24, 900);
      ctx.lineTo(0, 960);
      ctx.closePath();
      ctx.fill();
      ctx.translate(576, 0);
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, 900);
      ctx.lineTo(24, 960);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawWater = (w: Water) => {
      const x = w.x - 95;
      const y = w.y - 120;
      const g = ctx.createLinearGradient(x, y, x, y + w.h);
      g.addColorStop(0, '#85ebff');
      g.addColorStop(0.4, '#2bc9ff');
      g.addColorStop(1, '#0d97de');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w.w, w.h, 8);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x + 6, y + 8, w.w - 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(x + 35 + i * ((w.w - 70) / 2), y + w.h / 2 + (i % 2 ? 8 : -2), 18, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawCourse = () => {
      const config = currentHole();
      ctx.save();
      ctx.translate(95, 120);

      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 18;
      roundRect(ctx, 0, 0, 530, 960, 22);
      ctx.fillStyle = '#ebedf0';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      roundRect(ctx, 8, 8, 514, 944, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      roundRect(ctx, 14, 14, 502, 932, 14);
      ctx.clip();

      const grass = ctx.createLinearGradient(0, 0, 0, 932);
      grass.addColorStop(0, '#8cdf3f');
      grass.addColorStop(0.25, '#6fcd38');
      grass.addColorStop(1, '#86dd42');
      ctx.fillStyle = grass;
      ctx.fillRect(14, 14, 502, 932);

      for (let y = 14; y < 946; y += 38) {
        for (let x = 14; x < 516; x += 38) {
          ctx.fillStyle = ((x + y) / 38) % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)';
          ctx.fillRect(x, y, 38, 38);
        }
      }

      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(14, 14, 502, 46);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let x = 42; x < 480; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 38);
        ctx.lineTo(x + 7, 31);
        ctx.lineTo(x + 14, 38);
        ctx.lineTo(x + 7, 45);
        ctx.closePath();
        ctx.fill();
      }

      config.waters.forEach(drawWater);

      config.walls.forEach(rect => {
        const x = rect.x - 95;
        const y = rect.y - 120;
        const wallGrad = ctx.createLinearGradient(x, y, x, y + rect.h);
        wallGrad.addColorStop(0, '#ffffff');
        wallGrad.addColorStop(1, '#dfe5ea');
        roundRect(ctx, x, y, rect.w, rect.h, 9);
        ctx.fillStyle = wallGrad;
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(x + rect.w - 4, y + 2, 4, rect.h - 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      config.bumpers.forEach(b => {
        const x = b.x - 95;
        const y = b.y - 120;
        const g = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, b.r);
        g.addColorStop(0, '#fff7c2');
        g.addColorStop(1, b.color);
        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.beginPath();
      ctx.arc(config.hole.x - 95 + 2, config.hole.y - 120 + 4, HOLE_R + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(config.hole.x - 95, config.hole.y - 120, HOLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1f25';
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(config.hole.x - 95, config.hole.y - 120 - 2);
      ctx.lineTo(config.hole.x - 95, config.hole.y - 120 - 65);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(config.hole.x - 95, config.hole.y - 120 - 64);
      ctx.lineTo(config.hole.x - 95 + 32, config.hole.y - 120 - 55);
      ctx.lineTo(config.hole.x - 95, config.hole.y - 120 - 46);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawTrail = (ball: BallState) => {
      if (ball.trail.length < 2) return;
      for (let i = 0; i < ball.trail.length; i++) {
        const p = ball.trail[i];
        const a = i / ball.trail.length;
        ctx.globalAlpha = a * 0.28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + a * 4, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawBall = (ball: BallState) => {
      drawTrail(ball);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(ball.x + 2, ball.y + 10, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = ball.color;
      ctx.shadowBlur = 18;
      const grad = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 2, ball.x, ball.y, BALL_R);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, ball.color);
      grad.addColorStop(1, ball.color === '#ffffff' ? '#e8edf2' : '#d6a600');
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(ball.x - 4, ball.y - 5, 3.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawAim = () => {
      const ball = ballsRef.current[activePlayer];
      if (winner || ball.done) return;
      const moving = Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0;
      if (!pointerRef.current.active || moving) return;

      const dx = pointerRef.current.x - ball.x;
      const dy = pointerRef.current.y - ball.y;
      const d = Math.min(len(dx, dy), AIM_MAX);
      if (d < 4) return;
      const nx = dx / Math.max(d, 1);
      const ny = dy / Math.max(d, 1);

      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - nx * d, ball.y - ny * d);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(ball.x - nx * d, ball.y - ny * d, 12 + (d / AIM_MAX) * 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
    };

    const drawSparks = () => {
      sparksRef.current.forEach(s => {
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      drawBackground();
      drawCourse();
      drawAim();
      ballsRef.current.forEach(drawBall);
      drawSparks();
    };

    const step = () => {
      if (!winner) {
        ballsRef.current.forEach(updateBall);

        const active = ballsRef.current[activePlayer];
        const activeMoving = Math.abs(active.vx) > 0 || Math.abs(active.vy) > 0;
        const other = activePlayer === 0 ? 1 : 0;
        const otherBall = ballsRef.current[other];

        if (turnPhase === 'ballMoving' && !activeMoving) {
          if (!active.done && !otherBall.done) {
            setActivePlayer(other);
            setTurnPhase('aim');
          } else if (!active.done && otherBall.done) {
            setTurnPhase('aim');
          } else if (active.done && !otherBall.done) {
            setActivePlayer(other);
            setTurnPhase('aim');
          }
        }

        if (ballsRef.current.every(b => b.done) && turnPhase !== 'holeTransition') {
          setTurnPhase('holeTransition');
          if (holeIndex < TOTAL_HOLES - 1) {
            window.setTimeout(() => {
              const nextHole = holeIndex + 1;
              const nextConfig = holeConfigs[nextHole];
              ballsRef.current = [
                {
                  ...ballsRef.current[0],
                  x: nextConfig.spawn.x,
                  y: nextConfig.spawn.y,
                  vx: 0,
                  vy: 0,
                  trail: [],
                  shots: 0,
                  done: false,
                },
                {
                  ...ballsRef.current[1],
                  x: nextConfig.spawn.x,
                  y: nextConfig.spawn.y,
                  vx: 0,
                  vy: 0,
                  trail: [],
                  shots: 0,
                  done: false,
                },
              ];
              pointerRef.current.active = false;
              setActivePlayer(0);
              setHoleIndex(nextHole);
              setTurnPhase('aim');
            }, 700);
          } else {
            const [a, b] = ballsRef.current;
            if (a.totalShots < b.totalShots) setWinner(a.name);
            else if (b.totalShots < a.totalShots) setWinner(b.name);
            else setWinner('Draw');
          }
        }
      }

      sparksRef.current.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.985;
        s.vy *= 0.985;
        s.life -= 0.02;
      });
      sparksRef.current = sparksRef.current.filter(s => s.life > 0);

      draw();
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [refresh, winner, holeIndex, activePlayer, turnPhase]);

  const toWorldPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WORLD_W,
      y: ((clientY - rect.top) / rect.height) * WORLD_H,
    };
  };

  const strike = () => {
    const ball = ballsRef.current[activePlayer];
    if (winner || turnPhase !== 'aim' || ball.done) return;
    if (Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0) return;

    const dx = pointerRef.current.x - ball.x;
    const dy = pointerRef.current.y - ball.y;
    const dist = Math.min(len(dx, dy), AIM_MAX);
    if (dist < 4) return;
    const nx = dx / Math.max(dist, 1);
    const ny = dy / Math.max(dist, 1);
    const strength = dist / AIM_MAX;
    const power = Math.pow(strength, 1.9) * MAX_POWER;

    ball.vx = -nx * power;
    ball.vy = -ny * power;
    ball.shots += 1;
    ball.totalShots += 1;
    setTurnPhase('ballMoving');

    for (let i = 0; i < 12; i++) {
      sparksRef.current.push({
        x: ball.x,
        y: ball.y,
        vx: -nx * (0.4 + Math.random() * 2.6) + (Math.random() - 0.5),
        vy: -ny * (0.4 + Math.random() * 2.6) + (Math.random() - 0.5),
        life: 0.35 + Math.random() * 0.28,
        size: 2 + Math.random() * 2.4,
        color: '#fff8bf',
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (turnPhase !== 'aim') return;
    const ball = ballsRef.current[activePlayer];
    if (winner || ball.done) return;
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

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    strike();
    pointerRef.current.active = false;
  };

  const restart = () => {
    const spawn = holeConfigs[0].spawn;
    setWinner(null);
    setHoleIndex(0);
    setActivePlayer(0);
    setTurnPhase('aim');
    ballsRef.current = [
      createBall('Jack', '#ffd84d', spawn),
      createBall('Kirsten', '#ffffff', spawn),
    ];
    sparksRef.current = [];
    pointerRef.current.active = false;
    setRefresh(v => v + 1);
  };

  const p1 = ballsRef.current[0];
  const p2 = ballsRef.current[1];
  const totalP1 = p1.totalShots;
  const totalP2 = p2.totalShots;

  return (
    <div className="h-[calc(100vh-110px)] w-screen overflow-hidden bg-black flex items-start justify-center px-2 pt-[10px] pb-2 select-none">
      <div className="relative mt-0">
        <div className="absolute -top-14 left-0 right-0 flex items-center justify-between gap-2 text-white z-10">
          <div className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-2 backdrop-blur-md shadow-lg ${activePlayer === 0 ? 'bg-white/16 ring-2 ring-white/30' : 'bg-white/10'}`}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-500 text-black text-sm font-black">5</div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black leading-none">Jack</div>
              <div className="text-[11px] text-white/80">{p1.shots} this hole • {totalP1} total</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-4 py-2 text-center backdrop-blur-md shadow-lg shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">Hole</div>
            <div className="text-2xl font-black leading-none">{holeIndex + 1} <span className="text-white/60 text-base">of {TOTAL_HOLES}</span></div>
          </div>

          <div className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-2 backdrop-blur-md shadow-lg ${activePlayer === 1 ? 'bg-white/16 ring-2 ring-white/30' : 'bg-white/10'}`}>
            <div className="min-w-0 text-right">
              <div className="truncate text-lg font-black leading-none">Kirsten</div>
              <div className="text-[11px] text-white/80">{p2.shots} this hole • {totalP2} total</div>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-yellow-500 text-black text-sm font-black">6</div>
          </div>
        </div>

        <motion.canvas
          layout
          ref={canvasRef}
          width={WORLD_W}
          height={WORLD_H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointerRef.current.active = false)}
          onPointerLeave={() => (pointerRef.current.active = false)}
          className="block rounded-[34px] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] touch-none"
          style={{ width: WORLD_W * scale, height: WORLD_H * scale, touchAction: 'none' }}
        />

        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-[34px] bg-black/70 backdrop-blur-md flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-[28px] bg-white px-8 py-10 text-center shadow-2xl max-w-[340px]"
              >
                <div className="text-sm font-bold uppercase tracking-[0.28em] text-slate-400">Result</div>
                <div className="mt-3 text-4xl font-black text-slate-900">{winner === 'Draw' ? 'Draw' : `${winner} wins`}</div>
                <div className="mt-4 text-slate-600">Jack: {p1.totalShots} shots • Kirsten: {p2.totalShots} shots</div>
                <button
                  onClick={restart}
                  className="mt-8 rounded-full bg-sky-600 px-6 py-3 text-white font-bold hover:bg-sky-500 transition"
                >
                  Restart 3 Holes
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MiniGolfBeautiful;
