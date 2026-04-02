import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WORLD_W = 720;
const WORLD_H = 1040;

const PLAY_LEFT = 36;
const PLAY_TOP = 42;
const PLAY_RIGHT = WORLD_W - 36;
const PLAY_BOTTOM = WORLD_H - 42;
const PLAY_W = PLAY_RIGHT - PLAY_LEFT;
const PLAY_H = PLAY_BOTTOM - PLAY_TOP;

const BALL_R = 12;
const HOLE_R = 17;
const FRICTION = 0.982;
const STOP_SPEED = 0.11;
const MAX_POWER = 17;
const AIM_MAX = 170;
const TOTAL_HOLES = 3;
const MAX_DPR = 1.5;

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

type Deco =
  | { kind: 'palm'; x: number; y: number }
  | { kind: 'rock'; x: number; y: number }
  | { kind: 'snow'; x: number; y: number }
  | { kind: 'crystal'; x: number; y: number }
  | { kind: 'bush'; x: number; y: number };

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
  name: string;
  subtitle: string;
  theme: 'classic' | 'desert' | 'snow';
  hole: Vec;
  spawn: Vec;
  walls: Rect[];
  waters: Water[];
  bumpers: Bumper[];
  bridges?: Rect[];
  deco?: Deco[];
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function len(x: number, y: number) {
  return Math.hypot(x, y);
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
    name: 'Harbor Run',
    subtitle: 'каналы и мостики',
    theme: 'classic',
    hole: { x: 118, y: 112 },
    spawn: { x: 610, y: 915 },
    walls: [
      { x: 228, y: 150, w: 18, h: 170 },
      { x: 455, y: 130, w: 18, h: 190 },
      { x: 245, y: 320, w: 228, h: 18 },

      { x: 148, y: 455, w: 18, h: 200 },
      { x: 555, y: 435, w: 18, h: 220 },

      { x: 250, y: 695, w: 18, h: 118 },
      { x: 458, y: 665, w: 18, h: 145 },

      { x: 300, y: 886, w: 126, h: 16 },
    ],
    waters: [
      { x: 275, y: 172, w: 155, h: 92 },
      { x: 260, y: 500, w: 186, h: 128 },
      { x: 92, y: 790, w: 118, h: 96 },
      { x: 516, y: 772, w: 110, h: 102 },
    ],
    bridges: [
      { x: 331, y: 490, w: 44, h: 150 },
    ],
    bumpers: [
      { x: 350, y: 395, r: 19, color: '#fbbf24' },
      { x: 168, y: 700, r: 17, color: '#f59e0b' },
      { x: 560, y: 654, r: 17, color: '#fde047' },
      { x: 515, y: 245, r: 16, color: '#fbbf24' },
    ],
    deco: [
      { kind: 'bush', x: 214, y: 410 },
      { kind: 'bush', x: 520, y: 405 },
      { kind: 'bush', x: 245, y: 855 },
    ],
  },
  {
    name: 'Oasis Zigzag',
    subtitle: 'зигзаг и песок',
    theme: 'desert',
    hole: { x: 575, y: 112 },
    spawn: { x: 110, y: 935 },
    walls: [
      { x: 188, y: 170, w: 230, h: 18 },
      { x: 418, y: 170, w: 18, h: 155 },

      { x: 250, y: 366, w: 200, h: 18 },
      { x: 190, y: 515, w: 18, h: 165 },

      { x: 190, y: 680, w: 248, h: 18 },
      { x: 530, y: 480, w: 18, h: 205 },

      { x: 350, y: 780, w: 18, h: 122 },
      { x: 460, y: 860, w: 122, h: 16 },
    ],
    waters: [
      { x: 290, y: 82, w: 125, h: 92 },
      { x: 265, y: 405, w: 205, h: 136 },
      { x: 510, y: 690, w: 120, h: 116 },
    ],
    bridges: [
      { x: 346, y: 394, w: 42, h: 160 },
    ],
    bumpers: [
      { x: 226, y: 302, r: 17, color: '#ef4444' },
      { x: 505, y: 420, r: 18, color: '#fb7185' },
      { x: 305, y: 598, r: 19, color: '#f59e0b' },
      { x: 568, y: 865, r: 18, color: '#fbbf24' },
    ],
    deco: [
      { kind: 'palm', x: 138, y: 510 },
      { kind: 'palm', x: 570, y: 620 },
      { kind: 'rock', x: 260, y: 842 },
      { kind: 'rock', x: 520, y: 325 },
    ],
  },
  {
    name: 'Frost Split',
    subtitle: 'ледяные окна',
    theme: 'snow',
    hole: { x: 360, y: 106 },
    spawn: { x: 360, y: 938 },
    walls: [
      { x: 165, y: 150, w: 18, h: 175 },
      { x: 537, y: 150, w: 18, h: 175 },

      { x: 230, y: 350, w: 110, h: 18 },
      { x: 380, y: 350, w: 110, h: 18 },

      { x: 265, y: 505, w: 18, h: 135 },
      { x: 438, y: 505, w: 18, h: 135 },

      { x: 218, y: 705, w: 112, h: 18 },
      { x: 390, y: 705, w: 112, h: 18 },

      { x: 310, y: 812, w: 100, h: 16 },
    ],
    waters: [
      { x: 248, y: 120, w: 224, h: 112 },
      { x: 92, y: 462, w: 118, h: 98 },
      { x: 510, y: 462, w: 118, h: 98 },
      { x: 305, y: 590, w: 110, h: 84 },
    ],
    bridges: [
      { x: 338, y: 112, w: 44, h: 135 },
    ],
    bumpers: [
      { x: 360, y: 428, r: 19, color: '#93c5fd' },
      { x: 235, y: 600, r: 16, color: '#dbeafe' },
      { x: 485, y: 600, r: 16, color: '#dbeafe' },
      { x: 360, y: 860, r: 17, color: '#bfdbfe' },
    ],
    deco: [
      { kind: 'snow', x: 142, y: 590 },
      { kind: 'snow', x: 578, y: 590 },
      { kind: 'snow', x: 360, y: 840 },
      { kind: 'crystal', x: 215, y: 640 },
      { kind: 'crystal', x: 505, y: 640 },
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const holeTimeoutRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const pointerRef = useRef({ active: false, x: 0, y: 0 });
  const layoutRef = useRef({ width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 });

  const holeIndexRef = useRef(0);
  const activePlayerRef = useRef(0);
  const turnPhaseRef = useRef<'aim' | 'ballMoving' | 'holeTransition'>('aim');
  const winnerRef = useRef<string | null>(null);

  const [winner, setWinner] = useState<string | null>(null);
  const [holeIndex, setHoleIndex] = useState(0);
  const [activePlayer, setActivePlayer] = useState(0);
  const [turnPhase, setTurnPhase] = useState<'aim' | 'ballMoving' | 'holeTransition'>('aim');
  const [, setUiTick] = useState(0);

  const sparksRef = useRef<Spark[]>([]);
  const waterSplashesRef = useRef<Spark[]>([]);
  const bgDotsRef = useRef<Vec[]>([]);
  const ballsRef = useRef<BallState[]>([
    createBall('Jack', '#ffd84d', holeConfigs[0].spawn),
    createBall('Kirsten', '#ffffff', holeConfigs[0].spawn),
  ]);

  useEffect(() => {
    bgDotsRef.current = Array.from({ length: 36 }, (_, i) => ({
      x: 30 + ((i * 83) % WORLD_W),
      y: 60 + ((i * 131) % WORLD_H),
    }));
  }, []);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && rootRef.current?.contains(target) && e.cancelable) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      const width = rect.width;
      const height = rect.height;
      const scale = Math.min(width / WORLD_W, height / WORLD_H);
      const offsetX = (width - WORLD_W * scale) / 2;
      const offsetY = (height - WORLD_H * scale) / 2;

      layoutRef.current = { width, height, scale, offsetX, offsetY, dpr };

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);

    const currentHole = () => holeConfigs[holeIndexRef.current];

    const setPhase = (next: 'aim' | 'ballMoving' | 'holeTransition') => {
      turnPhaseRef.current = next;
      setTurnPhase(next);
    };

    const setActive = (next: number) => {
      activePlayerRef.current = next;
      setActivePlayer(next);
    };

    const setHole = (next: number) => {
      holeIndexRef.current = next;
      setHoleIndex(next);
    };

    const setWinnerBoth = (value: string | null) => {
      winnerRef.current = value;
      setWinner(value);
    };

    const bumpUi = () => setUiTick(v => v + 1);

    const addSparks = (x: number, y: number, color: string, amount = 10) => {
      for (let i = 0; i < amount; i += 1) {
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

    const resetBallToSpawn = (ball: BallState) => {
      for (let i = 0; i < 18; i += 1) {
        const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.35;
        const s = 0.8 + Math.random() * 2.6;
        waterSplashesRef.current.push({
          x: ball.x,
          y: ball.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.6,
          life: 0.7 + Math.random() * 0.25,
          size: 2 + Math.random() * 3.5,
          color: '#dff8ff',
        });
      }

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

    const updateBall = (ball: BallState, dt60: number) => {
      const config = currentHole();
      if (ball.done) return;

      ball.x += ball.vx * dt60;
      ball.y += ball.vy * dt60;
      ball.vx *= Math.pow(FRICTION, dt60);
      ball.vy *= Math.pow(FRICTION, dt60);

      if (Math.abs(ball.vx) < STOP_SPEED) ball.vx = 0;
      if (Math.abs(ball.vy) < STOP_SPEED) ball.vy = 0;

      if (ball.x < PLAY_LEFT + BALL_R) {
        ball.x = PLAY_LEFT + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.88;
      }
      if (ball.x > PLAY_RIGHT - BALL_R) {
        ball.x = PLAY_RIGHT - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.88;
      }
      if (ball.y < PLAY_TOP + BALL_R) {
        ball.y = PLAY_TOP + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.88;
      }
      if (ball.y > PLAY_BOTTOM - BALL_R) {
        ball.y = PLAY_BOTTOM - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.88;
      }

      for (let i = 0; i < config.walls.length; i += 1) {
        resolveWallCollision(ball, config.walls[i]);
      }

      for (let i = 0; i < config.bumpers.length; i += 1) {
        resolveBumperCollision(ball, config.bumpers[i]);
      }

      for (let i = 0; i < config.waters.length; i += 1) {
        const water = config.waters[i];
        let onBridge = false;

        const bridges = config.bridges ?? [];
        for (let j = 0; j < bridges.length; j += 1) {
          if (pointInRect(ball.x, ball.y, bridges[j])) {
            onBridge = true;
            break;
          }
        }

        if (!onBridge && pointInRect(ball.x, ball.y, water)) {
          resetBallToSpawn(ball);
          return;
        }
      }

      const hx = ball.x - config.hole.x;
      const hy = ball.y - config.hole.y;
      const hd = len(hx, hy);
      const speed = len(ball.vx, ball.vy);

      if (hd < HOLE_R && speed < 2.05) {
        ball.done = true;
        ball.vx = 0;
        ball.vy = 0;
        ball.x = config.hole.x;
        ball.y = config.hole.y;
        addSparks(config.hole.x, config.hole.y, '#22c55e', 18);
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 12) ball.trail.shift();
    };

    const drawThemeBackground = (theme: HoleConfig['theme']) => {
      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);

      if (theme === 'classic') {
        bg.addColorStop(0, '#0d7fd9');
        bg.addColorStop(1, '#166ec0');
      } else if (theme === 'desert') {
        bg.addColorStop(0, '#ffcd79');
        bg.addColorStop(0.55, '#f59e0b');
        bg.addColorStop(1, '#d97706');
      } else {
        bg.addColorStop(0, '#102445');
        bg.addColorStop(0.45, '#1d4f91');
        bg.addColorStop(1, '#0b1731');
      }

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      if (theme === 'classic') {
        for (let i = 0; i < bgDotsRef.current.length; i += 1) {
          const p = bgDotsRef.current[i];
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5 + (i % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (theme === 'desert') {
        const sun = ctx.createRadialGradient(585, 115, 10, 585, 115, 120);
        sun.addColorStop(0, 'rgba(255,244,200,0.9)');
        sun.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(585, 115, 120, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const aurora = ctx.createLinearGradient(80, 40, 620, 240);
        aurora.addColorStop(0, 'rgba(96,165,250,0)');
        aurora.addColorStop(0.35, 'rgba(96,165,250,0.18)');
        aurora.addColorStop(0.7, 'rgba(167,243,208,0.14)');
        aurora.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = aurora;
        ctx.fillRect(0, 0, WORLD_W, 320);
      }

      const vignette = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 180, WORLD_W / 2, WORLD_H / 2, 900);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    };

    const drawWater = (w: Water, theme: HoleConfig['theme']) => {
      const lip = 18;

      ctx.fillStyle = theme === 'desert' ? '#7b5e34' : theme === 'snow' ? '#8fa5bc' : '#557d4a';
      roundRect(ctx, w.x - 4, w.y - 3, w.w + 8, w.h + 8, lip);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      roundRect(ctx, w.x, w.y + 3, w.w, w.h + 5, lip - 2);
      ctx.fill();

      const innerX = w.x + 9;
      const innerY = w.y + 13;
      const innerW = w.w - 18;
      const innerH = w.h - 22;

      const g = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
      if (theme === 'snow') {
        g.addColorStop(0, '#e8f7ff');
        g.addColorStop(0.35, '#9dd6ff');
        g.addColorStop(1, '#5b9ede');
      } else {
        g.addColorStop(0, '#98efff');
        g.addColorStop(0.45, '#2fcfff');
        g.addColorStop(1, '#0e8ec2');
      }

      roundRect(ctx, innerX, innerY, innerW, innerH, lip - 6);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.save();
      roundRect(ctx, innerX, innerY, innerW, innerH, lip - 6);
      ctx.clip();

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(innerX, innerY, innerW, 12);

      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(innerX + 8, innerY + 10, innerW - 16, 6);

      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.ellipse(
          innerX + 32 + i * ((innerW - 64) / 2),
          innerY + innerH * 0.58 + (i % 2 ? 8 : -2),
          20,
          8,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 2;
      roundRect(ctx, innerX, innerY, innerW, innerH, lip - 6);
      ctx.stroke();
    };

    const drawBridge = (bridge: Rect) => {
      const wood = ctx.createLinearGradient(bridge.x, bridge.y, bridge.x, bridge.y + bridge.h);
      wood.addColorStop(0, '#c78c56');
      wood.addColorStop(1, '#8b5a3c');

      roundRect(ctx, bridge.x, bridge.y, bridge.w, bridge.h, 8);
      ctx.fillStyle = wood;
      ctx.fill();

      ctx.strokeStyle = 'rgba(90,50,20,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let yy = bridge.y + 6; yy < bridge.y + bridge.h - 4; yy += 12) {
        ctx.fillRect(bridge.x + 4, yy, bridge.w - 8, 2);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(bridge.x + 3, bridge.y + bridge.h - 5, bridge.w - 6, 3);
    };

    const drawDeco = (config: HoleConfig) => {
      if (!config.deco) return;

      for (let i = 0; i < config.deco.length; i += 1) {
        const d = config.deco[i];

        if (d.kind === 'palm') {
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(d.x - 5, d.y, 10, 36);
          ctx.fillStyle = '#16a34a';
          for (let k = 0; k < 5; k += 1) {
            const a = -1.2 + k * 0.6;
            ctx.beginPath();
            ctx.ellipse(d.x + Math.cos(a) * 10, d.y - 6 + Math.sin(a) * 8, 20, 7, a, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (d.kind === 'rock') {
          ctx.fillStyle = '#d6a35d';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, 18, 12, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.kind === 'snow') {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(d.x, d.y, 18, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(191,219,254,0.8)';
          ctx.beginPath();
          ctx.arc(d.x + 6, d.y + 4, 8, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.kind === 'crystal') {
          ctx.fillStyle = '#e0f2fe';
          ctx.beginPath();
          ctx.moveTo(d.x, d.y - 20);
          ctx.lineTo(d.x + 14, d.y);
          ctx.lineTo(d.x, d.y + 20);
          ctx.lineTo(d.x - 14, d.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (d.kind === 'bush') {
          ctx.fillStyle = '#2f7a39';
          ctx.beginPath();
          ctx.arc(d.x, d.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4da856';
          ctx.beginPath();
          ctx.arc(d.x - 5, d.y - 5, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawCourse = () => {
      const config = currentHole();

      roundRect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_W, PLAY_H, 28);
      const grass = ctx.createLinearGradient(PLAY_LEFT, PLAY_TOP, PLAY_LEFT, PLAY_BOTTOM);

      if (config.theme === 'classic') {
        grass.addColorStop(0, '#90e648');
        grass.addColorStop(0.35, '#76cf3a');
        grass.addColorStop(1, '#63b530');
      } else if (config.theme === 'desert') {
        grass.addColorStop(0, '#e6c56a');
        grass.addColorStop(0.4, '#d3ad4e');
        grass.addColorStop(1, '#bd9039');
      } else {
        grass.addColorStop(0, '#f5fbff');
        grass.addColorStop(0.45, '#d9ebfb');
        grass.addColorStop(1, '#bdd4ee');
      }

      ctx.fillStyle = grass;
      ctx.fill();

      ctx.save();
      roundRect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_W, PLAY_H, 28);
      ctx.clip();

      for (let y = PLAY_TOP; y < PLAY_BOTTOM; y += 36) {
        for (let x = PLAY_LEFT; x < PLAY_RIGHT; x += 36) {
          ctx.fillStyle = ((x + y) / 36) % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
          ctx.fillRect(x, y, 36, 36);
        }
      }

      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(PLAY_LEFT, PLAY_TOP, PLAY_W, 38);

      for (let i = 0; i < config.waters.length; i += 1) {
        drawWater(config.waters[i], config.theme);
      }

      const bridges = config.bridges ?? [];
      for (let i = 0; i < bridges.length; i += 1) {
        drawBridge(bridges[i]);
      }

      for (let i = 0; i < config.walls.length; i += 1) {
        const rect = config.walls[i];
        const wallGrad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
        wallGrad.addColorStop(0, '#ffffff');
        wallGrad.addColorStop(1, '#dfe5ea');
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 9);
        ctx.fillStyle = wallGrad;
        ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(rect.x + rect.w - 4, rect.y + 2, 4, rect.h - 4);

        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (let i = 0; i < config.bumpers.length; i += 1) {
        const b = config.bumpers[i];
        const g = ctx.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, b.r);
        g.addColorStop(0, '#fff7c2');
        g.addColorStop(1, b.color);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      drawDeco(config);

      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.beginPath();
      ctx.arc(config.hole.x + 2, config.hole.y + 4, HOLE_R + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(config.hole.x, config.hole.y, HOLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1f25';
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(config.hole.x, config.hole.y - 2);
      ctx.lineTo(config.hole.x, config.hole.y - 65);
      ctx.stroke();

      ctx.fillStyle = config.theme === 'classic' ? '#ef4444' : config.theme === 'desert' ? '#f97316' : '#60a5fa';
      ctx.beginPath();
      ctx.moveTo(config.hole.x, config.hole.y - 64);
      ctx.lineTo(config.hole.x + 32, config.hole.y - 55);
      ctx.lineTo(config.hole.x, config.hole.y - 46);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawTrail = (ball: BallState) => {
      if (ball.trail.length < 2) return;

      for (let i = 0; i < ball.trail.length; i += 1) {
        const p = ball.trail[i];
        const a = i / ball.trail.length;
        ctx.globalAlpha = a * 0.22;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + a * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    const drawBall = (ball: BallState) => {
      drawTrail(ball);

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(ball.x + 2, ball.y + 9, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = ball.color;
      ctx.shadowBlur = 14;

      const grad = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 2, ball.x, ball.y, BALL_R);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.42, ball.color);
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
      const ball = ballsRef.current[activePlayerRef.current];
      if (winnerRef.current || ball.done || turnPhaseRef.current !== 'aim') return;

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
      for (let i = 0; i < sparksRef.current.length; i += 1) {
        const s = sparksRef.current[i];
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < waterSplashesRef.current.length; i += 1) {
        const s = waterSplashesRef.current[i];
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.size, s.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    const draw = () => {
      const { width, height, scale, offsetX, offsetY } = layoutRef.current;
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      drawThemeBackground(currentHole().theme);
      drawCourse();
      drawAim();

      for (let i = 0; i < ballsRef.current.length; i += 1) {
        drawBall(ballsRef.current[i]);
      }

      drawSparks();

      ctx.restore();
    };

    const step = (now: number) => {
      const prev = lastFrameRef.current || now;
      const dtMs = Math.min(now - prev, 32);
      const dt60 = dtMs / 16.6667;
      lastFrameRef.current = now;

      if (!winnerRef.current) {
        for (let i = 0; i < ballsRef.current.length; i += 1) {
          updateBall(ballsRef.current[i], dt60);
        }

        const active = ballsRef.current[activePlayerRef.current];
        const activeMoving = Math.abs(active.vx) > 0 || Math.abs(active.vy) > 0;
        const other = activePlayerRef.current === 0 ? 1 : 0;
        const otherBall = ballsRef.current[other];

        if (turnPhaseRef.current === 'ballMoving' && !activeMoving) {
          if (!active.done && !otherBall.done) {
            setActive(other);
            setPhase('aim');
          } else if (!active.done && otherBall.done) {
            setPhase('aim');
          } else if (active.done && !otherBall.done) {
            setActive(other);
            setPhase('aim');
          }
          bumpUi();
        }

        if (ballsRef.current.every(b => b.done) && turnPhaseRef.current !== 'holeTransition') {
          setPhase('holeTransition');

          if (holeIndexRef.current < TOTAL_HOLES - 1) {
            holeTimeoutRef.current = window.setTimeout(() => {
              const nextHole = holeIndexRef.current + 1;
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
              setActive(0);
              setHole(nextHole);
              setPhase('aim');
              bumpUi();
            }, 650);
          } else {
            const [a, b] = ballsRef.current;
            if (a.totalShots < b.totalShots) setWinnerBoth(a.name);
            else if (b.totalShots < a.totalShots) setWinnerBoth(b.name);
            else setWinnerBoth('Draw');
          }
        }
      }

      const nextSparks: Spark[] = [];
      for (let i = 0; i < sparksRef.current.length; i += 1) {
        const s = sparksRef.current[i];
        s.x += s.vx * dt60;
        s.y += s.vy * dt60;
        s.vx *= Math.pow(0.985, dt60);
        s.vy *= Math.pow(0.985, dt60);
        s.life -= 0.02 * dt60;
        if (s.life > 0) nextSparks.push(s);
      }
      sparksRef.current = nextSparks;

      const nextWater: Spark[] = [];
      for (let i = 0; i < waterSplashesRef.current.length; i += 1) {
        const s = waterSplashesRef.current[i];
        s.x += s.vx * dt60;
        s.y += s.vy * dt60;
        s.vx *= Math.pow(0.96, dt60);
        s.vy *= Math.pow(0.96, dt60);
        s.life -= 0.03 * dt60;
        if (s.life > 0) nextWater.push(s);
      }
      waterSplashesRef.current = nextWater;

      draw();
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (holeTimeoutRef.current) window.clearTimeout(holeTimeoutRef.current);
      ro.disconnect();
    };
  }, []);

  const toWorldPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = layoutRef.current;

    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  };

  const strike = () => {
    const ball = ballsRef.current[activePlayerRef.current];
    if (winnerRef.current || turnPhaseRef.current !== 'aim' || ball.done) return;
    if (Math.abs(ball.vx) > 0 || Math.abs(ball.vy) > 0) return;

    const dx = pointerRef.current.x - ball.x;
    const dy = pointerRef.current.y - ball.y;
    const dist = Math.min(len(dx, dy), AIM_MAX);
    if (dist < 4) return;

    const nx = dx / Math.max(dist, 1);
    const ny = dy / Math.max(dist, 1);
    const strength = dist / AIM_MAX;
    const power = Math.pow(strength, 1.85) * MAX_POWER;

    ball.vx = -nx * power;
    ball.vy = -ny * power;
    ball.shots += 1;
    ball.totalShots += 1;

    turnPhaseRef.current = 'ballMoving';
    setTurnPhase('ballMoving');

    for (let i = 0; i < 10; i += 1) {
      sparksRef.current.push({
        x: ball.x,
        y: ball.y,
        vx: -nx * (0.4 + Math.random() * 2.4) + (Math.random() - 0.5),
        vy: -ny * (0.4 + Math.random() * 2.4) + (Math.random() - 0.5),
        life: 0.34 + Math.random() * 0.24,
        size: 2 + Math.random() * 2.2,
        color: '#fff8bf',
      });
    }

    setUiTick(v => v + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (turnPhaseRef.current !== 'aim') return;
    const ball = ballsRef.current[activePlayerRef.current];
    if (winnerRef.current || ball.done) return;

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

    winnerRef.current = null;
    holeIndexRef.current = 0;
    activePlayerRef.current = 0;
    turnPhaseRef.current = 'aim';

    setWinner(null);
    setHoleIndex(0);
    setActivePlayer(0);
    setTurnPhase('aim');

    ballsRef.current = [
      createBall('Jack', '#ffd84d', spawn),
      createBall('Kirsten', '#ffffff', spawn),
    ];

    sparksRef.current = [];
    waterSplashesRef.current = [];
    pointerRef.current.active = false;
    setUiTick(v => v + 1);
  };

  const p1 = ballsRef.current[0];
  const p2 = ballsRef.current[1];
  const currentHole = holeConfigs[holeIndex];

  return (
    <div ref={rootRef} className="w-full h-full bg-black overflow-hidden touch-none select-none flex flex-col">
      <div className="shrink-0 px-2 pt-2 pb-2 bg-black/45 backdrop-blur-sm z-20">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-white">
          <div
            className={`min-w-0 rounded-2xl px-2 py-2 border ${
              activePlayer === 0 ? 'bg-emerald-500/12 border-emerald-300/30' : 'bg-white/8 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-500 text-black text-xs font-black">
                5
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black leading-none">Jack</div>
                <div className="text-[11px] text-white/70">{p1.totalShots} shots</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl px-3 py-2 bg-white/8 border border-white/10 text-center min-w-[116px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
              {holeIndex + 1}/{TOTAL_HOLES}
            </div>
            <div className="text-sm font-black leading-none mt-1">{currentHole.name}</div>
          </div>

          <div
            className={`min-w-0 rounded-2xl px-2 py-2 border ${
              activePlayer === 1 ? 'bg-amber-500/12 border-amber-300/30' : 'bg-white/8 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 justify-end">
              <div className="min-w-0 text-right">
                <div className="truncate text-sm font-black leading-none">Kirsten</div>
                <div className="text-[11px] text-white/70">{p2.totalShots} shots</div>
              </div>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-yellow-500 text-black text-xs font-black">
                6
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={canvasWrapRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointerRef.current.active = false;
          }}
          onPointerLeave={() => {
            pointerRef.current.active = false;
          }}
          className="block w-full h-full touch-none"
          style={{ touchAction: 'none' }}
        />

        <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/65 bg-black/25 px-3 py-2 rounded-full backdrop-blur-sm">
            {turnPhase === 'aim'
              ? `Aim • ${activePlayer === 0 ? 'Jack' : 'Kirsten'}`
              : turnPhase === 'ballMoving'
              ? 'Ball moving'
              : 'Loading next hole'}
          </div>

          <button
            onClick={restart}
            className="pointer-events-auto rounded-full bg-black/30 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] border border-white/10 text-white/90 hover:bg-black/40 transition"
          >
            Restart
          </button>
        </div>

        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-30"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-[28px] bg-white px-8 py-10 text-center shadow-2xl max-w-[340px]"
              >
                <div className="text-sm font-bold uppercase tracking-[0.28em] text-slate-400">Result</div>
                <div className="mt-3 text-4xl font-black text-slate-900">
                  {winner === 'Draw' ? 'Draw' : `${winner} wins`}
                </div>
                <div className="mt-4 text-slate-600">
                  Jack: {p1.totalShots} shots • Kirsten: {p2.totalShots} shots
                </div>
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