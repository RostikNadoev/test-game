import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WORLD_W = 720;
const WORLD_H = 1180;
const BALL_R = 12;
const HOLE_R = 17;
const FRICTION = 0.985;
const MIN_SPEED = 0.05;
const MAX_POWER = 24;
const AIM_MAX = 140;

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
  done: boolean;
  name: string;
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

const walls: Rect[] = [
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
];

const waters: Water[] = [
  { x: 286, y: 196, w: 132, h: 82 },
  { x: 270, y: 756, w: 180, h: 104 },
  { x: 100, y: 514, w: 170, h: 75 },
  { x: 448, y: 545, w: 158, h: 75 },
];

const bumpers: Bumper[] = [
  { x: 364, y: 635, r: 22, color: '#fbbf24' },
  { x: 173, y: 845, r: 20, color: '#fbbf24' },
  { x: 548, y: 348, r: 20, color: '#f59e0b' },
];

const hole = { x: 168, y: 235 };
const spawn1 = { x: 548, y: 305 };
const spawn2 = { x: 190, y: 803 };

export default function MiniGolfBeautiful() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const sparksRef = useRef<Spark[]>([]);
  const ballsRef = useRef<BallState[]>([
    { x: spawn1.x, y: spawn1.y, vx: 0, vy: 0, color: '#ffd84d', trail: [], shots: 0, done: false, name: 'Jack' },
    { x: spawn2.x, y: spawn2.y, vx: 0, vy: 0, color: '#ffffff', trail: [], shots: 0, done: false, name: 'Kirsten' },
  ]);

  const scale = useMemo(() => {
    const base = 0.62;
    if (typeof window === 'undefined') return base;
    return Math.min(base, window.innerWidth / 1100, window.innerHeight / 1320);
  }, [refresh]);

  useEffect(() => {
    const onResize = () => setRefresh(v => v + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
        const a = (Math.PI * 2 * i) / amount + Math.random() * 0.6;
        const s = 1 + Math.random() * 3.5;
        sparksRef.current.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.8 + Math.random() * 0.4,
          size: 2 + Math.random() * 4,
          color,
        });
      }
    };

    const resetBall = (ball: BallState, spawn: Vec) => {
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
        ball.vx = -Math.abs(ball.vx) * 0.9;
      } else if (minOverlap === overlapX2) {
        ball.x = rect.x + rect.w + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.9;
      } else if (minOverlap === overlapY1) {
        ball.y = rect.y - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.9;
      } else {
        ball.y = rect.y + rect.h + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.9;
      }
      addSparks(ball.x, ball.y, '#ffffff', 5);
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
      ball.vx = (ball.vx - 2 * dot * nx) * 0.94;
      ball.vy = (ball.vy - 2 * dot * ny) * 0.94;
      addSparks(ball.x, ball.y, bumper.color, 8);
    };

    const resolveBallBall = (a: BallState, b: BallState) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = len(dx, dy);
      const minD = BALL_R * 2;
      if (d <= 0 || d >= minD) return;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = minD - d;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const dvx = b.vx - a.vx;
      const dvy = b.vy - a.vy;
      const impact = dvx * nx + dvy * ny;
      if (impact > 0) return;
      const impulse = -impact * 0.95;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
      addSparks((a.x + b.x) / 2, (a.y + b.y) / 2, '#fde68a', 10);
    };

    const updateBall = (ball: BallState, spawn: Vec) => {
      if (ball.done) return;
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      if (Math.abs(ball.vx) < MIN_SPEED) ball.vx = 0;
      if (Math.abs(ball.vy) < MIN_SPEED) ball.vy = 0;

      if (ball.x < 106 + BALL_R) {
        ball.x = 106 + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.9;
      }
      if (ball.x > 614 - BALL_R) {
        ball.x = 614 - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.9;
      }
      if (ball.y < 138 + BALL_R) {
        ball.y = 138 + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.9;
      }
      if (ball.y > 1072 - BALL_R) {
        ball.y = 1072 - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.9;
      }

      walls.forEach(rect => resolveWallCollision(ball, rect));
      bumpers.forEach(b => resolveBumperCollision(ball, b));

      for (const water of waters) {
        if (pointInRect(ball.x, ball.y, water)) {
          resetBall(ball, spawn);
          return;
        }
      }

      const hx = ball.x - hole.x;
      const hy = ball.y - hole.y;
      const hd = len(hx, hy);
      const speed = len(ball.vx, ball.vy);
      if (hd < HOLE_R && speed < 2.5) {
        ball.done = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.x = hole.x;
        ball.y = hole.y;
        addSparks(hole.x, hole.y, '#22c55e', 20);
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 18) ball.trail.shift();
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
      const side = '#1471bf';
      ctx.fillStyle = side;
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

    const drawCourse = () => {
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

      waters.forEach(w => {
        const waterGrad = ctx.createLinearGradient(w.x - 95, w.y - 120, w.x - 95, w.y - 120 + w.h);
        waterGrad.addColorStop(0, '#49d1ff');
        waterGrad.addColorStop(1, '#0f9fe8');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(w.x - 95, w.y - 120, w.w, w.h);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(w.x - 95, w.y - 120 + 6, w.w, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.arc(w.x - 95 + 40, w.y - 120 + w.h / 2, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w.x - 95 + w.w - 35, w.y - 120 + w.h / 2 + 8, 7, 0, Math.PI * 2);
        ctx.fill();
      });

      walls.forEach(rect => {
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

      bumpers.forEach(b => {
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
      ctx.arc(hole.x - 95 + 2, hole.y - 120 + 4, HOLE_R + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hole.x - 95, hole.y - 120, HOLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1f25';
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hole.x - 95, hole.y - 120 - 2);
      ctx.lineTo(hole.x - 95, hole.y - 120 - 65);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(hole.x - 95, hole.y - 120 - 64);
      ctx.lineTo(hole.x - 95 + 32, hole.y - 120 - 55);
      ctx.lineTo(hole.x - 95, hole.y - 120 - 46);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawTrail = (ball: BallState) => {
      if (ball.trail.length < 2) return;
      for (let i = 0; i < ball.trail.length; i++) {
        const p = ball.trail[i];
        const a = i / ball.trail.length;
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + a * 4, 0, Math.PI * 2);
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
      const ball = ballsRef.current[0];
      if (winner || ball.done) return;
      const moving = Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0;
      if (!pointerRef.current.active || moving) return;

      const dx = pointerRef.current.x - ball.x;
      const dy = pointerRef.current.y - ball.y;
      const d = Math.min(len(dx, dy), AIM_MAX);
      if (d < 8) return;
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
      ctx.arc(ball.x - nx * d, ball.y - ny * d, 14, 0, Math.PI * 2);
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
        updateBall(ballsRef.current[0], spawn1);
        updateBall(ballsRef.current[1], spawn2);
        resolveBallBall(ballsRef.current[0], ballsRef.current[1]);
        const allDone = ballsRef.current.every(b => b.done);
        if (allDone) {
          const [a, b] = ballsRef.current;
          if (a.shots < b.shots) setWinner(a.name);
          else if (b.shots < a.shots) setWinner(b.name);
          else setWinner('Draw');
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
  }, [refresh, winner]);

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
    const ball = ballsRef.current[0];
    if (winner || ball.done) return;
    if (Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0) return;
    const dx = pointerRef.current.x - ball.x;
    const dy = pointerRef.current.y - ball.y;
    const dist = Math.min(len(dx, dy), AIM_MAX);
    if (dist < 10) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const power = (dist / AIM_MAX) * MAX_POWER;
    ball.vx = -nx * power;
    ball.vy = -ny * power;
    ball.shots += 1;

    for (let i = 0; i < 14; i++) {
      sparksRef.current.push({
        x: ball.x,
        y: ball.y,
        vx: -nx * (1 + Math.random() * 4) + (Math.random() - 0.5) * 1.2,
        vy: -ny * (1 + Math.random() * 4) + (Math.random() - 0.5) * 1.2,
        life: 0.4 + Math.random() * 0.35,
        size: 2 + Math.random() * 3,
        color: '#fff8bf',
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toWorldPoint(e.clientX, e.clientY);
    pointerRef.current = { active: true, x: p.x, y: p.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toWorldPoint(e.clientX, e.clientY);
    pointerRef.current.x = p.x;
    pointerRef.current.y = p.y;
  };

  const onPointerUp = () => {
    strike();
    pointerRef.current.active = false;
  };

  const restart = () => {
    setWinner(null);
    ballsRef.current = [
      { x: spawn1.x, y: spawn1.y, vx: 0, vy: 0, color: '#ffd84d', trail: [], shots: 0, done: false, name: 'Jack' },
      { x: spawn2.x, y: spawn2.y, vx: 0, vy: 0, color: '#ffffff', trail: [], shots: 0, done: false, name: 'Kirsten' },
    ];
    sparksRef.current = [];
    setRefresh(v => v + 1);
  };

  const [p1, p2] = ballsRef.current;

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center px-4 py-8 overflow-hidden">
      <div className="relative" ref={wrapRef}>
        <div className="absolute -top-16 left-0 right-0 flex items-center justify-between text-white z-10">
          <div className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 backdrop-blur-md shadow-lg">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-500 text-black font-black">
              5
            </div>
            <div>
              <div className="text-3xl font-black leading-none">Jack</div>
              <div className="text-sm text-white/80">{p1.shots} shots</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-5 py-3 text-center backdrop-blur-md shadow-lg">
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/70">Hole</div>
            <div className="text-4xl font-black leading-none">1 <span className="text-white/60 text-2xl">of 3</span></div>
          </div>

          <div className="flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 backdrop-blur-md shadow-lg">
            <div className="text-right">
              <div className="text-3xl font-black leading-none">Kirsten</div>
              <div className="text-sm text-white/80">{p2.shots} shots</div>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-yellow-500 text-black font-black">
              6
            </div>
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
          onPointerLeave={() => (pointerRef.current.active = false)}
          className="block rounded-[34px] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.5)] touch-none select-none"
          style={{ width: WORLD_W * scale, height: WORLD_H * scale }}
        />

        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-2xl bg-orange-600 px-10 py-4 text-center text-white shadow-[0_18px_40px_rgba(194,65,12,0.45)] border border-orange-400/30">
          <div className="text-2xl md:text-4xl font-black tracking-tight">Real Time Multiplayer</div>
        </div>

        <div className="absolute left-1/2 top-full mt-16 -translate-x-1/2 text-center text-white/65 text-sm tracking-[0.24em] uppercase">
          Drag opposite from the ball to aim • Release to shoot
        </div>

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
                className="rounded-[28px] bg-white px-8 py-10 text-center shadow-2xl max-w-[320px]"
              >
                <div className="text-sm font-bold uppercase tracking-[0.28em] text-slate-400">Result</div>
                <div className="mt-3 text-4xl font-black text-slate-900">{winner === 'Draw' ? 'Draw' : `${winner} wins`}</div>
                <div className="mt-4 text-slate-600">Jack: {p1.shots} shots • Kirsten: {p2.shots} shots</div>
                <button
                  onClick={restart}
                  className="mt-8 rounded-full bg-sky-600 px-6 py-3 text-white font-bold hover:bg-sky-500 transition"
                >
                  Restart Hole
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
