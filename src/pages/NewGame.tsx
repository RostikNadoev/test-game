import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const BOARD_SIZE = 500;
const START_SCORE = 301;
const DARTS_PER_TURN = 3;

// Реальное расстояние от центра дротика до кончика иглы
const DART_TIP_LENGTH = 46 * 0.6;

const COLORS = {
  black: '#1a1a2e',
  white: '#eeeeee',
  red: '#e74c3c',
  green: '#27ae60',
  gold: '#f1c40f',
  bgTop: '#07111f',
  bgBottom: '#12243f',
};

export interface HitDetails {
  label: string;
  points: number;
  sector: number;
  multiplier: 'single' | 'double' | 'triple' | 'bull';
}

type DartOnBoard = {
  x: number;
  y: number;
  hit?: HitDetails;
  angle?: number;
};

type FlyingDart = {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  power: number;
  travelAngle: number;
  curveX: number;
  launchTilt: number;
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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const DartGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [players, setPlayers] = useState([START_SCORE, START_SCORE]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dartsThrownThisTurn, setDartsThrownThisTurn] = useState(0);
  const [lastHit, setLastHit] = useState<HitDetails | null>(null);
  const [lastHitText, setLastHitText] = useState('');
  const [hitEffect, setHitEffect] = useState<{ x: number; y: number; type: string } | null>(null);
  const [dartsOnBoard, setDartsOnBoard] = useState<DartOnBoard[]>([]);
  const [turnLocked, setTurnLocked] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const turnTimeoutRef = useRef<number | null>(null);

  const game = useRef({
    ctx: null as CanvasRenderingContext2D | null,
    width: 0,
    height: 0,
    scale: 1,
    centerX: 0,
    centerY: 0,
    boardOffsetY: 0,
    shake: 0,
    flyingDart: null as FlyingDart | null,
    animationId: null as number | null,
  });

  const getHitDetails = useCallback((x: number, y: number): HitDetails => {
    const g = game.current;
    const dx = x - g.centerX;
    const dy = y - g.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    const normAngle = angle % 360;

    const r = dist / g.scale;

    if (r > 192) return { label: 'MISS', points: 0, sector: 0, multiplier: 'single' };
    if (r < 9) return { label: 'BULLSEYE!', points: 50, sector: 0, multiplier: 'bull' };
    if (r < 19) return { label: '25', points: 25, sector: 0, multiplier: 'bull' };

    const sectorIdx = Math.floor(normAngle / 18);
    const base = SECTORS[sectorIdx];

    if (r > 170 && r < 192) {
      return { label: `D${base}`, points: base * 2, sector: base, multiplier: 'double' };
    }
    if (r > 98 && r < 115) {
      return { label: `T${base}`, points: base * 3, sector: base, multiplier: 'triple' };
    }

    return { label: base.toString(), points: base, sector: base, multiplier: 'single' };
  }, []);

  const spawnImpactParticles = (x: number, y: number, hit: HitDetails) => {
    const palette =
      hit.multiplier === 'bull'
        ? ['#f1c40f', '#fde68a', '#ffffff']
        : hit.points > 0
        ? ['#f59e0b', '#fde68a', '#ffffff']
        : ['#ef4444', '#fca5a5', '#ffffff'];

    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const s = 1 + Math.random() * 3.8;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.35,
        size: 2 + Math.random() * 3,
        color: palette[i % palette.length],
      });
    }
  };

  const drawDart = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    scaleFactor: number = 1
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scaleFactor * 0.6, scaleFactor * 0.6);

    const grad = ctx.createLinearGradient(-15, -35, 15, -35);
    grad.addColorStop(0, '#e74c3c');
    grad.addColorStop(1, '#c0392b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-14, -42);
    ctx.lineTo(0, -48);
    ctx.lineTo(14, -42);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-3, -12, 6, 38);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(0, 46);
    ctx.stroke();

    ctx.restore();
  };

  // Кончик именно с той стороны, которая ВТЫКАЕТСЯ
  const getDartTipPosition = (
    x: number,
    y: number,
    angle: number,
    scaleFactor: number
  ) => {
    const tipLen = DART_TIP_LENGTH * scaleFactor;

    return {
      x: x - Math.sin(angle) * tipLen,
      y: y + Math.cos(angle) * tipLen,
    };
  };

  const drawBoard = useCallback(
    (ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, shake: number) => {
      const s = (Math.random() - 0.5) * shake;
      const boardY = cy + game.current.boardOffsetY;

      ctx.fillStyle = '#2c1810';
      ctx.beginPath();
      ctx.arc(cx + s, boardY + s, 215 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.arc(cx + s, boardY + s, 205 * scale, 0, Math.PI * 2);
      ctx.fill();

      const ringGlow = ctx.createRadialGradient(cx, boardY, 60 * scale, cx, boardY, 210 * scale);
      ringGlow.addColorStop(0, 'rgba(255,255,255,0.02)');
      ringGlow.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = ringGlow;
      ctx.beginPath();
      ctx.arc(cx, boardY, 205 * scale, 0, Math.PI * 2);
      ctx.fill();

      SECTORS.forEach((val, i) => {
        const ang = ((i * 18 - 90) * Math.PI) / 180;
        const nextAng = (((i + 1) * 18 - 90) * Math.PI) / 180;

        ctx.fillStyle = i % 2 === 0 ? COLORS.black : COLORS.white;
        ctx.beginPath();
        ctx.moveTo(cx, boardY);
        ctx.arc(cx, boardY, 170 * scale, ang, nextAng);
        ctx.fill();

        ctx.fillStyle = i % 2 === 0 ? COLORS.red : COLORS.green;
        ctx.beginPath();
        ctx.arc(cx, boardY, 175 * scale, ang, nextAng);
        ctx.arc(cx, boardY, 165 * scale, nextAng, ang, true);
        ctx.fill();

        ctx.fillStyle = i % 2 === 0 ? COLORS.red : COLORS.green;
        ctx.beginPath();
        ctx.arc(cx, boardY, 115 * scale, ang, nextAng);
        ctx.arc(cx, boardY, 105 * scale, nextAng, ang, true);
        ctx.fill();

        ctx.save();
        ctx.translate(cx, boardY);
        ctx.rotate(ang + (9 * Math.PI) / 180);
        ctx.translate(194 * scale, 0);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${18 * scale}px Inter, system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000';
        ctx.fillText(val.toString(), 0, 0);
        ctx.restore();
      });

      ctx.fillStyle = COLORS.green;
      ctx.beginPath();
      ctx.arc(cx, boardY, 19 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.arc(cx, boardY, 9 * scale, 0, Math.PI * 2);
      ctx.fill();
    },
    []
  );

  const swipeData = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    isSwiping: false,
    velocity: 0,
    sideDrift: 0,
    totalDx: 0,
    totalDy: 0,
  });

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (turnLocked || winner !== null || game.current.flyingDart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    if (y > game.current.height * 0.58) {
      swipeData.current = {
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        isSwiping: true,
        velocity: 0,
        sideDrift: 0,
        totalDx: 0,
        totalDy: 0,
      };
    }
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!swipeData.current.isSwiping) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    const dy = swipeData.current.lastY - y;
    swipeData.current.velocity = Math.max(swipeData.current.velocity, dy);
    swipeData.current.sideDrift = x - swipeData.current.startX;
    swipeData.current.totalDx = x - swipeData.current.startX;
    swipeData.current.totalDy = swipeData.current.startY - y;
    swipeData.current.lastX = x;
    swipeData.current.lastY = y;
  };

  const finishThrow = useCallback(() => {
    const { velocity, sideDrift, totalDx, totalDy } = swipeData.current;
    if (velocity <= 5 || turnLocked || winner !== null) {
      swipeData.current.isSwiping = false;
      return;
    }

    const g = game.current;

    // Намного чувствительнее к длине свайпа
    const power = clamp(totalDy * 0.78 + velocity * 1.1, 0, 100);

    // Намного чувствительнее к углу/горизонтали
    const horizontalIntent = clamp(totalDx / 85, -1.8, 1.8);

    // Слабый свайп = летит ниже, сильный = выше
    const verticalPower = clamp(totalDy / 260, 0, 1.35);

    // Слабый свайп ещё и менее точный
    const precision = clamp(power / 100, 0.08, 1);
    const spread = (1 - precision) * 110;

    const randomX = (Math.random() - 0.5) * spread;
    const randomY = (Math.random() - 0.5) * spread;

    const baseTargetX =
      g.centerX +
      horizontalIntent * 165 +
      sideDrift * 0.12;

    // Вот тут слабый свайп реально целит ниже, сильный — выше
    const baseTargetY =
      g.centerY + 135 - verticalPower * 250;

    const targetX = baseTargetX + randomX;
    const targetY = baseTargetY + randomY;

    const rawTravelAngle =
      -Math.atan2(targetY - (g.height - 72), targetX - g.width / 2) + Math.PI / 2;

    g.flyingDart = {
      startX: g.width / 2,
      startY: g.height - 72,
      targetX,
      targetY,
      progress: 0,
      power,
      travelAngle: rawTravelAngle,
      curveX: clamp(horizontalIntent * 60, -80, 80),
      launchTilt: rawTravelAngle + clamp(horizontalIntent * 0.22, -0.3, 0.3),
    };

    g.boardOffsetY = -24;
    setTurnLocked(true);
    swipeData.current.isSwiping = false;
  }, [turnLocked, winner]);

  const handleEnd = () => {
    finishThrow();
  };

  const draw = useCallback(() => {
    const g = game.current;
    const ctx = g.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, g.width, g.height);

    const bg = ctx.createLinearGradient(0, 0, 0, g.height);
    bg.addColorStop(0, COLORS.bgTop);
    bg.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, g.width, g.height);

    const vignette = ctx.createRadialGradient(
      g.width / 2,
      g.height * 0.38,
      60,
      g.width / 2,
      g.height * 0.38,
      g.width * 0.9
    );
    vignette.addColorStop(0, 'rgba(255,255,255,0.05)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, g.width, g.height);

    const boardCenterY = g.height * 0.43 + g.boardOffsetY;
    drawBoard(ctx, g.width / 2, boardCenterY, g.scale, g.shake);

    dartsOnBoard.forEach(d => {
      drawDart(ctx, d.x, d.y + g.boardOffsetY, d.angle ?? 0, g.scale * 0.9);
      if (d.hit) {
        ctx.fillStyle = '#f8d66d';
        ctx.font = `${13 * g.scale}px Inter, system-ui`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#000';
        ctx.fillText(d.hit.label, d.x - 18, d.y - 28 + g.boardOffsetY);
      }
    });

    if (g.flyingDart) {
      const d = g.flyingDart;

      d.progress += 0.012 + (d.power / 100) * 0.01;
      const t = Math.min(d.progress, 1);

      const ease = t * t * (3 - 2 * t);

      const curX =
        d.startX +
        (d.targetX - d.startX) * ease +
        Math.sin(t * Math.PI) * d.curveX * (1 - 0.1 * t);

      const parabola = Math.sin(t * Math.PI) * (128 * (0.55 + d.power / 100));
      const curY = d.startY + (d.targetY - d.startY) * ease - parabola;

      const currentAngle = d.launchTilt + (d.travelAngle - d.launchTilt) * ease;
      const currentScale = g.scale * (0.64 + ease * 0.84);

      if (t >= 1) {
        const stuckScale = g.scale * 0.9;
        const tip = getDartTipPosition(
          d.targetX,
          d.targetY + g.boardOffsetY,
          d.travelAngle,
          stuckScale
        );

        const hit = getHitDetails(tip.x, tip.y);

        setHitEffect({
          x: tip.x,
          y: tip.y,
          type: hit.points > 0 ? 'hit' : 'miss',
        });
        setLastHit(hit);
        setLastHitText(`${hit.label} = ${hit.points} pts`);
        spawnImpactParticles(tip.x, tip.y, hit);

        setPlayers(prev => {
          const next = [...prev];
          const current = next[currentPlayerIndex];
          next[currentPlayerIndex] = Math.max(0, current - hit.points);
          return next;
        });

        setDartsOnBoard(prev => [
          ...prev,
          {
            x: d.targetX,
            y: d.targetY + g.boardOffsetY,
            hit,
            angle: d.travelAngle,
          },
        ]);

        g.flyingDart = null;
        g.shake = hit.points > 0 ? 10 : 5;
        window.setTimeout(() => setHitEffect(null), 550);

        const nextDarts = dartsThrownThisTurn + 1;
        setDartsThrownThisTurn(nextDarts);

        const nextScore = Math.max(0, players[currentPlayerIndex] - hit.points);
        if (nextScore === 0) {
          window.setTimeout(() => {
            setWinner(currentPlayerIndex);
            setTurnLocked(false);
          }, 500);
        } else if (nextDarts >= DARTS_PER_TURN) {
          if (turnTimeoutRef.current) window.clearTimeout(turnTimeoutRef.current);
          turnTimeoutRef.current = window.setTimeout(() => {
            setCurrentPlayerIndex(prev => 1 - prev);
            setDartsThrownThisTurn(0);
            setDartsOnBoard([]);
            setTurnLocked(false);
          }, 900);
        } else {
          window.setTimeout(() => setTurnLocked(false), 420);
        }
      } else {
        drawDart(ctx, curX, curY, currentAngle, currentScale);
      }
    }

    particlesRef.current.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (hitEffect) {
      ctx.beginPath();
      ctx.arc(hitEffect.x, hitEffect.y, 18 * g.scale, 0, Math.PI * 2);
      ctx.fillStyle = hitEffect.type === 'hit' ? 'rgba(241,196,15,0.28)' : 'rgba(231,76,60,0.22)';
      ctx.fill();
    }

    if (g.shake > 0) g.shake *= 0.9;
    if (Math.abs(g.boardOffsetY) > 0.5) g.boardOffsetY *= 0.9;
    else g.boardOffsetY = 0;

    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= 0.025;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    g.animationId = requestAnimationFrame(draw);
  }, [
    dartsOnBoard,
    drawBoard,
    dartsThrownThisTurn,
    getHitDetails,
    hitEffect,
    players,
    currentPlayerIndex,
  ]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && rootRef.current?.contains(target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  useEffect(() => {
    return () => {
      if (turnTimeoutRef.current) window.clearTimeout(turnTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;

      const g = game.current;
      g.width = width;
      g.height = height;
      g.ctx = canvas.getContext('2d', { alpha: true })!;
      g.centerX = width / 2;
      g.centerY = height * 0.43;
      g.scale = Math.min((width / BOARD_SIZE) * 0.8, (height * 0.62) / BOARD_SIZE);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (game.current.animationId) cancelAnimationFrame(game.current.animationId);
    };
  }, [draw]);

  const restart = () => {
    setPlayers([START_SCORE, START_SCORE]);
    setCurrentPlayerIndex(0);
    setDartsThrownThisTurn(0);
    setLastHit(null);
    setLastHitText('');
    setHitEffect(null);
    setDartsOnBoard([]);
    setTurnLocked(false);
    setWinner(null);
    particlesRef.current = [];
    game.current.flyingDart = null;
  };

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-[calc(100vh-180px)] bg-[#09101d] text-white overflow-hidden font-sans select-none rounded-[28px]"
    >
      <header className="shrink-0 px-3 pt-3 pb-2 z-20">
        <div className="rounded-[26px] bg-black/35 backdrop-blur-md border border-white/10 px-3 py-3 shadow-2xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-center">
              <div className="text-[10px] tracking-[0.22em] text-white/55 uppercase">Player 1</div>
              <div
                className={`leading-none font-black ${
                  currentPlayerIndex === 0 ? 'text-emerald-400' : 'text-white/60'
                }`}
                style={{ fontSize: '34px' }}
              >
                {players[0]}
              </div>
            </div>

            <div className="rounded-2xl bg-white/8 px-3 py-2 text-center min-w-[112px]">
              <div className="text-[11px] font-bold tracking-[0.18em] text-amber-300 uppercase">
                P{currentPlayerIndex + 1} turn
              </div>
              <div className="text-xs text-white/55 mt-1">
                {DARTS_PER_TURN - dartsThrownThisTurn} darts left
              </div>
            </div>

            <div className="min-w-0 text-center">
              <div className="text-[10px] tracking-[0.22em] text-white/55 uppercase">Player 2</div>
              <div
                className={`leading-none font-black ${
                  currentPlayerIndex === 1 ? 'text-emerald-400' : 'text-white/60'
                }`}
                style={{ fontSize: '34px' }}
              >
                {players[1]}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main ref={containerRef} className="flex-1 relative min-h-0 touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ touchAction: 'none' }}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
        />

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/8 border border-white/10 px-4 py-2 text-white/55 text-[11px] tracking-[0.18em] uppercase pointer-events-none backdrop-blur-md">
          Swipe up to throw
        </div>
      </main>

      <AnimatePresence>
        {lastHit && winner === null && (
          <motion.div
            key={`${lastHit.label}-${lastHit.points}-${dartsThrownThisTurn}`}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 22 }}
            className="pointer-events-none absolute left-1/2 bottom-20 -translate-x-1/2 bg-black/75 px-6 py-3 rounded-3xl border border-amber-300/25 shadow-2xl"
          >
            <span className="text-2xl font-black text-amber-300">{lastHitText}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {winner !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/72 backdrop-blur-md flex items-center justify-center z-30"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-[28px] bg-white px-8 py-9 text-center shadow-2xl max-w-[320px]"
            >
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">
                Game Over
              </div>
              <div className="mt-3 text-4xl font-black text-slate-900">
                Player {winner + 1} wins
              </div>
              <div className="mt-3 text-slate-600">Final score: {players[winner]}</div>
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
  );
};

export default DartGame;