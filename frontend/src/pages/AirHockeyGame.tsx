import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyMatchFinish } from '../hooks/useLobbyMatchFinish';
import { MatchFinishStatus } from '../components/Match/MatchFinishStatus';

const SETTINGS = {
  puckSize: 16,
  paddleSize: 30,
  friction: 0.992,
  wallBounciness: 0.8,
  maxPuckSpeed: 18,
  goalCooldownMs: 450,
  aiTrackSpeed: 0.08,
  aiReturnSpeed: 0.03,
  maxDpr: 1.5,
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

export const AirHockeyGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastGoalAtRef = useRef(0);
  const scoreRef = useRef({ p1: 0, p2: 0 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const { finishMatch: finishLobbyMatch, pending: matchFinishPending, finishError: matchFinishError, clearPending: clearMatchFinish } = useLobbyMatchFinish('air_hockey');

  useEffect(() => {
    if (score.p1 < 5 && score.p2 < 5) return;
    void finishLobbyMatch(score.p1 >= 5 ? 'win' : score.p2 >= 5 ? 'loss' : 'draw');
  }, [score.p1, score.p2, finishLobbyMatch]);

  const puck = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const p1 = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, isDragging: false });
  const p2 = useRef({ x: 0, y: 0 });
  const particles = useRef<Particle[]>([]);
  const trail = useRef<TrailPoint[]>([]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, SETTINGS.maxDpr);
    const w = container.clientWidth;
    const h = container.clientHeight;

    sizeRef.current = { w, h, dpr };

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (p1.current.x === 0 && p1.current.y === 0) {
      spawnPuck(w, h, 'p1');
      p1.current = {
        x: w / 2,
        y: h - 100,
        lastX: w / 2,
        lastY: h - 100,
        isDragging: false,
      };
      p2.current = { x: w / 2, y: 100 };
    } else {
      p1.current.x = Math.max(SETTINGS.paddleSize, Math.min(w - SETTINGS.paddleSize, p1.current.x));
      p1.current.y = Math.max(h / 2 + SETTINGS.paddleSize, Math.min(h - SETTINGS.paddleSize, p1.current.y));
      p2.current.x = Math.max(SETTINGS.paddleSize, Math.min(w - SETTINGS.paddleSize, p2.current.x));
    }
  };

  const spawnPuck = (w: number, h: number, targetPlayer: 'p1' | 'p2') => {
    puck.current = {
      x: w / 2,
      y: targetPlayer === 'p1' ? h * 0.75 : h * 0.25,
      vx: 0,
      vy: 0,
    };
    trail.current = [];

    if (targetPlayer === 'p2') {
      window.setTimeout(() => {
        puck.current.vx = (Math.random() - 0.5) * 5;
        puck.current.vy = 8;
      }, 320);
    }
  };

  const updateAI = (w: number, h: number, dt60: number) => {
    const targetX = puck.current.x;

    if (puck.current.y < h / 2) {
      const dx = targetX - p2.current.x;
      p2.current.x += dx * SETTINGS.aiTrackSpeed * dt60;
    } else {
      const dx = w / 2 - p2.current.x;
      p2.current.x += dx * SETTINGS.aiReturnSpeed * dt60;
    }

    if (p2.current.x < SETTINGS.paddleSize) p2.current.x = SETTINGS.paddleSize;
    if (p2.current.x > w - SETTINGS.paddleSize) p2.current.x = w - SETTINGS.paddleSize;
  };

  const createGoalEffect = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i += 1) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1,
        color,
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const prevent = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    container.addEventListener('touchstart', prevent, { passive: false });
    container.addEventListener('touchmove', prevent, { passive: false });

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = (now: number) => {
      const { w, h } = sizeRef.current;
      const p = puck.current;

      const prev = lastFrameRef.current || now;
      const dtMs = Math.min(now - prev, 32);
      const dt60 = dtMs / 16.6667;
      lastFrameRef.current = now;

      updateAI(w, h, dt60);

      p.x += p.vx * dt60;
      p.y += p.vy * dt60;

      p.vx *= Math.pow(SETTINGS.friction, dt60);
      p.vy *= Math.pow(SETTINGS.friction, dt60);

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > SETTINGS.maxPuckSpeed) {
        p.vx = (p.vx / speed) * SETTINGS.maxPuckSpeed;
        p.vy = (p.vy / speed) * SETTINGS.maxPuckSpeed;
      }

      if (p.x < SETTINGS.puckSize) {
        p.x = SETTINGS.puckSize;
        p.vx *= -SETTINGS.wallBounciness;
      } else if (p.x > w - SETTINGS.puckSize) {
        p.x = w - SETTINGS.puckSize;
        p.vx *= -SETTINGS.wallBounciness;
      }

      const canScore = now - lastGoalAtRef.current > SETTINGS.goalCooldownMs;

      if (p.y < SETTINGS.puckSize || p.y > h - SETTINGS.puckSize) {
        const insideGoal = p.x > w * 0.3 && p.x < w * 0.7;

        if (insideGoal && canScore) {
          const isTopGoal = p.y < h / 2;
          lastGoalAtRef.current = now;

          createGoalEffect(p.x, p.y, isTopGoal ? '#3b82f6' : '#ef4444');

          if (isTopGoal) {
            scoreRef.current = { ...scoreRef.current, p1: scoreRef.current.p1 + 1 };
            setScore(scoreRef.current);
            spawnPuck(w, h, 'p2');
          } else {
            scoreRef.current = { ...scoreRef.current, p2: scoreRef.current.p2 + 1 };
            setScore(scoreRef.current);
            spawnPuck(w, h, 'p1');
          }
        } else if (!insideGoal) {
          p.y = p.y < SETTINGS.puckSize ? SETTINGS.puckSize : h - SETTINGS.puckSize;
          p.vy *= -SETTINGS.wallBounciness;
        }
      }

      const handlePaddleCollision = (
        paddleX: number,
        paddleY: number,
        isPlayer: boolean,
      ) => {
        const dx = p.x - paddleX;
        const dy = p.y - paddleY;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = SETTINGS.puckSize + SETTINGS.paddleSize;

        if (dist < minDist) {
          const angle = Math.atan2(dy, dx);

          p.x = paddleX + Math.cos(angle) * minDist;
          p.y = paddleY + Math.sin(angle) * minDist;

          const currentSpeed = Math.hypot(p.vx, p.vy);

          if (isPlayer) {
            const vx = (p1.current.x - p1.current.lastX) * 0.8;
            const vy = (p1.current.y - p1.current.lastY) * 0.8;
            p.vx = vx + Math.cos(angle) * (currentSpeed + 2);
            p.vy = vy + Math.sin(angle) * (currentSpeed + 2);
          } else {
            p.vx = Math.cos(angle) * (currentSpeed + 1.5);
            p.vy = Math.sin(angle) * (currentSpeed + 1.5);
          }
        }
      };

      handlePaddleCollision(p1.current.x, p1.current.y, true);
      handlePaddleCollision(p2.current.x, p2.current.y, false);

      p1.current.lastX = p1.current.x;
      p1.current.lastY = p1.current.y;

      trail.current.push({ x: p.x, y: p.y, life: 1 });
      if (trail.current.length > 10) trail.current.shift();

      ctx.fillStyle = '#0A0A0F';
      ctx.fillRect(0, 0, w, h);

      const bgGlow = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, h * 0.7);
      bgGlow.addColorStop(0, 'rgba(255,255,255,0.025)');
      bgGlow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3b82f6';
      ctx.strokeRect(w * 0.3, 0, w * 0.4, 5);
      ctx.strokeStyle = '#ef4444';
      ctx.strokeRect(w * 0.3, h - 5, w * 0.4, 5);

      for (let i = 0; i < trail.current.length; i += 1) {
        const t = trail.current[i];
        const alpha = (i + 1) / trail.current.length * 0.2;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4 + i * 0.35, 0, Math.PI * 2);
        ctx.fill();
        t.life -= 0.08 * dt60;
      }
      trail.current = trail.current.filter(t => t.life > 0);

      const nextParticles: Particle[] = [];
      for (let i = 0; i < particles.current.length; i += 1) {
        const part = particles.current[i];
        ctx.fillStyle = part.color;
        ctx.globalAlpha = part.life;
        ctx.beginPath();
        ctx.arc(part.x, part.y, 2, 0, Math.PI * 2);
        ctx.fill();

        part.x += part.vx * dt60;
        part.y += part.vy * dt60;
        part.life -= 0.03 * dt60;

        if (part.life > 0) nextParticles.push(part);
      }
      particles.current = nextParticles;
      ctx.globalAlpha = 1;

      const puckGlow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, SETTINGS.puckSize + 10);
      puckGlow.addColorStop(0, 'rgba(255,255,255,1)');
      puckGlow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puckGlow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, SETTINGS.puckSize + 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, SETTINGS.puckSize, 0, Math.PI * 2);
      ctx.fill();

      const drawPaddle = (x: number, y: number, fill: string) => {
        const glow = ctx.createRadialGradient(x, y, 5, x, y, SETTINGS.paddleSize + 14);
        glow.addColorStop(0, fill);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, SETTINGS.paddleSize + 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, SETTINGS.paddleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(x - 8, y - 8, 8, 0, Math.PI * 2);
        ctx.fill();
      };

      drawPaddle(p1.current.x, p1.current.y, '#ef4444');
      drawPaddle(p2.current.x, p2.current.y, '#3b82f6');

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      container.removeEventListener('touchstart', prevent);
      container.removeEventListener('touchmove', prevent);
      window.removeEventListener('resize', resizeCanvas);
    };
    // resizeCanvas is stable enough for mount-only setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type PointerLike = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>;

  const getPoint = (e: PointerLike) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const clientX =
      'touches' in e && e.touches.length > 0
        ? e.touches[0].clientX
        : 'clientX' in e
          ? e.clientX
          : null;
    const clientY =
      'touches' in e && e.touches.length > 0
        ? e.touches[0].clientY
        : 'clientY' in e
          ? e.clientY
          : null;

    if (clientX === null || clientY === null) return null;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  };

  const handleStart = (e: PointerLike) => {
    const point = getPoint(e);
    if (!point) return;

    const dist = Math.hypot(point.x - p1.current.x, point.y - p1.current.y);
    if (dist < SETTINGS.paddleSize * 2.5) {
      p1.current.isDragging = true;
    }
  };

  const handleMove = (e: PointerLike) => {
    if (!p1.current.isDragging) return;
    const point = getPoint(e);
    if (!point) return;

    let nextX = point.x;
    let nextY = point.y;

    nextX = Math.max(SETTINGS.paddleSize, Math.min(point.w - SETTINGS.paddleSize, nextX));
    nextY = Math.max(point.h / 2 + SETTINGS.paddleSize, Math.min(point.h - SETTINGS.paddleSize, nextY));

    p1.current.x = nextX;
    p1.current.y = nextY;
  };

  const handleEnd = () => {
    p1.current.isDragging = false;
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overscroll-none select-none overflow-hidden bg-[#0A0A0F]"
    >
      <MatchFinishStatus pending={matchFinishPending} error={matchFinishError} onDismiss={clearMatchFinish} />
      <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col items-center gap-4 z-10 pointer-events-none opacity-25">
        <div className="text-6xl font-black text-blue-500">{score.p2}</div>
        <div className="w-12 h-1 bg-white/20" />
        <div className="text-6xl font-black text-red-500">{score.p1}</div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="absolute top-6 right-6 z-20 text-white/25 text-[10px] border border-white/10 px-3 py-1 rounded tracking-widest uppercase bg-white/5"
      >
        Exit
      </button>

      <canvas
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        className="w-full h-full"
      />
    </div>
  );
};