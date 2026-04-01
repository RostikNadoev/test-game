import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const BOARD_SIZE = 500;

const COLORS = {
  black: '#1a1a2e',
  white: '#eeeeee',
  red: '#e74c3c',
  green: '#27ae60',
  gold: '#f1c40f',
};

export interface HitDetails {
  label: string;
  points: number;
  sector: number;
  multiplier: 'single' | 'double' | 'triple' | 'bull';
}

const DartGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [players, setPlayers] = useState([301, 301]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dartsThrownThisTurn, setDartsThrownThisTurn] = useState(0);
  const [lastHit, setLastHit] = useState<HitDetails | null>(null);
  const [hitEffect, setHitEffect] = useState<{ x: number; y: number; type: string } | null>(null);

  const [dartsOnBoard, setDartsOnBoard] = useState<Array<{ x: number; y: number; hit?: HitDetails }>>([]);

  const game = useRef({
    ctx: null as CanvasRenderingContext2D | null,
    width: 0,
    height: 0,
    scale: 1,
    centerX: 0,
    centerY: 0,
    boardOffsetY: 0,
    shake: 0,
    flyingDart: null as any,
    animationId: null as number | null,
  });

  // ==================== ПОПАДАНИЕ ====================
  const getHitDetails = (x: number, y: number): HitDetails => {
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

    if (r > 170 && r < 192) return { label: `D${base}`, points: base * 2, sector: base, multiplier: 'double' };
    if (r > 98 && r < 115) return { label: `T${base}`, points: base * 3, sector: base, multiplier: 'triple' };

    return { label: base.toString(), points: base, sector: base, multiplier: 'single' };
  };

  // ==================== ОТРИСОВКА ====================
  const drawDart = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scaleFactor: number = 1, stuck = true) => {
    ctx.save();
    ctx.translate(x, y);
    if (!stuck) ctx.rotate(angle);
    ctx.scale(scaleFactor * 0.6, scaleFactor * 0.6);

    // оперение
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

    // тело
    ctx.fillStyle = '#bdc3c7';
    ctx.fillRect(-3, -12, 6, 38);

    // наконечник
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 26);
    ctx.lineTo(0, 46);
    ctx.stroke();

    ctx.restore();
  };

  const drawBoard = useCallback((ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, shake: number) => {
    const s = (Math.random() - 0.5) * shake;
    const boardY = cy + game.current.boardOffsetY;

    // внешний бордюр
    ctx.fillStyle = '#2c1810';
    ctx.beginPath();
    ctx.arc(cx + s, boardY + s, 215 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(cx + s, boardY + s, 205 * scale, 0, Math.PI * 2);
    ctx.fill();

    SECTORS.forEach((val, i) => {
      const ang = ((i * 18 - 90) * Math.PI) / 180;
      const nextAng = (((i + 1) * 18 - 90) * Math.PI) / 180;

      ctx.fillStyle = i % 2 === 0 ? COLORS.black : COLORS.white;
      ctx.beginPath();
      ctx.moveTo(cx, boardY);
      ctx.arc(cx, boardY, 170 * scale, ang, nextAng);
      ctx.fill();

      // double
      ctx.fillStyle = i % 2 === 0 ? '#e74c3c' : '#27ae60';
      ctx.beginPath();
      ctx.arc(cx, boardY, 175 * scale, ang, nextAng);
      ctx.arc(cx, boardY, 165 * scale, nextAng, ang, true);
      ctx.fill();

      // triple
      ctx.fillStyle = i % 2 === 0 ? '#e74c3c' : '#27ae60';
      ctx.beginPath();
      ctx.arc(cx, boardY, 115 * scale, ang, nextAng);
      ctx.arc(cx, boardY, 105 * scale, nextAng, ang, true);
      ctx.fill();

      // цифры
      ctx.save();
      ctx.translate(cx, boardY);
      ctx.rotate(ang + 9 * Math.PI / 180);
      ctx.translate(195 * scale, 0);
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

    // центр
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(cx, boardY, 19 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(cx, boardY, 9 * scale, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // ==================== СВАЙП ====================
  const swipeData = useRef({ startX: 0, startY: 0, isSwiping: false, lastY: 0, velocity: 0 });

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    const y = (clientY - rect.top) * (canvasRef.current!.height / rect.height);

    // Свайп только из нижней трети экрана
    if (y > game.current.height * 0.65) {
      swipeData.current = {
        startX: (clientX - rect.left) * (canvasRef.current!.width / rect.width),
        startY: y,
        isSwiping: true,
        lastY: y,
        velocity: 0,
      };
    }
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!swipeData.current.isSwiping) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const y = (clientY - rect.top) * (canvasRef.current!.height / rect.height);

    const dy = swipeData.current.lastY - y; // вверх = положительное
    swipeData.current.velocity = Math.max(swipeData.current.velocity, dy);
    swipeData.current.lastY = y;
  };

  const handleEnd = () => {
    if (!swipeData.current.isSwiping) return;
    const { startX, startY, velocity } = swipeData.current;

    if (velocity > 8) { // минимальная сила
      const power = Math.min(velocity * 1.8, 100); // 0..100

      const dx = (startX - game.current.width / 2) * 0.6; // небольшое отклонение
      const targetX = game.current.centerX + dx * (power / 60);
      const targetY = game.current.centerY - 40; // чуть выше центра

      game.current.flyingDart = {
        startX: game.current.width / 2,
        startY: game.current.height - 80,
        targetX,
        targetY,
        progress: 0,
        power,
      };

      game.current.boardOffsetY = -55; // доска "приближается"
    }

    swipeData.current.isSwiping = false;
  };

  // ==================== АНИМАЦИЯ ====================
  const draw = useCallback(() => {
    const g = game.current;
    const ctx = g.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, g.width, g.height);

    // Фон
    const bg = ctx.createLinearGradient(0, 0, 0, g.height);
    bg.addColorStop(0, '#0a0a1a');
    bg.addColorStop(1, '#16213e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, g.width, g.height);

    const boardCenterY = g.height * 0.45 + g.boardOffsetY;

    drawBoard(ctx, g.width / 2, boardCenterY, g.scale, g.shake);

    // Дротики на доске
    dartsOnBoard.forEach(d => {
      drawDart(ctx, d.x, d.y + g.boardOffsetY, 0, g.scale * 0.9, true);
      if (d.hit) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = `${14 * g.scale}px monospace`;
        ctx.shadowBlur = 6;
        ctx.fillText(d.hit.label, d.x - 25, d.y - 35 + g.boardOffsetY);
      }
    });

    // Летящий дротик
    if (g.flyingDart) {
      const d = g.flyingDart;
      d.progress += 0.022 * (d.power / 50 + 0.6);

      if (d.progress >= 1) {
        const hit = getHitDetails(d.targetX, d.targetY + g.boardOffsetY);
        setHitEffect({ x: d.targetX, y: d.targetY + g.boardOffsetY, type: hit.points > 0 ? 'hit' : 'miss' });
        setLastHit(hit);

        const newScore = Math.max(0, players[currentPlayerIndex] - hit.points);
        setPlayers(prev => {
          const newP = [...prev];
          newP[currentPlayerIndex] = newScore;
          return newP;
        });

        setDartsOnBoard(prev => [...prev, { x: d.targetX, y: d.targetY + g.boardOffsetY, hit }]);

        g.flyingDart = null;
        g.shake = hit.points > 0 ? 18 : 8;

        setTimeout(() => setHitEffect(null), 700);

        const nextDarts = dartsThrownThisTurn + 1;
        setDartsThrownThisTurn(nextDarts);

        if (nextDarts >= 3) {
          setTimeout(() => {
            setCurrentPlayerIndex(1 - currentPlayerIndex);
            setDartsThrownThisTurn(0);
            setDartsOnBoard([]);
          }, 900);
        }
      } else {
        const t = d.progress;
        const ease = 1 - Math.pow(1 - t, 3);
        const curX = d.startX + (d.targetX - d.startX) * ease;
        const parabola = Math.sin(t * Math.PI) * (120 * (d.power / 80));
        const curY = d.startY + (d.targetY - d.startY) * ease - parabola;

        const angle = -Math.atan2(d.targetY - d.startY, d.targetX - d.startX) + Math.PI / 2;

        drawDart(ctx, curX, curY, angle, g.scale * (0.7 + t * 0.9), false);
      }
    }

    // Эффект попадания
    if (hitEffect) {
      ctx.save();
      ctx.translate(0, g.boardOffsetY);
      ctx.beginPath();
      ctx.arc(hitEffect.x, hitEffect.y, 32 * g.scale, 0, Math.PI * 2);
      ctx.fillStyle = hitEffect.type === 'hit' ? 'rgba(241,196,15,0.4)' : 'rgba(231,76,60,0.4)';
      ctx.fill();
      ctx.restore();
    }

    if (g.shake > 0) g.shake *= 0.85;
    if (Math.abs(g.boardOffsetY) > 0.5) g.boardOffsetY *= 0.9;

    g.animationId = requestAnimationFrame(draw);
  }, [dartsOnBoard, players, currentPlayerIndex, dartsThrownThisTurn, drawBoard]);

  // ==================== RESIZE ====================
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
      g.centerY = height * 0.45;
      g.scale = Math.min(width / BOARD_SIZE * 0.9, (height * 0.75) / BOARD_SIZE);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (game.current.animationId) cancelAnimationFrame(game.current.animationId);
    };
  }, [draw]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a1a] text-white overflow-hidden font-sans select-none">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md border-b border-white/10 z-20">
        <div className="text-center">
          <div className="text-xs text-white/50">PLAYER 1</div>
          <div className={`text-5xl font-black tracking-tighter ${currentPlayerIndex === 0 ? 'text-emerald-400' : 'text-white/60'}`}>
            {players[0]}
          </div>
        </div>

        <div className="text-center">
          <div className="text-amber-400 text-xl font-bold">PLAYER {currentPlayerIndex + 1}</div>
          <div className="text-xs text-white/40">{3 - dartsThrownThisTurn} darts left</div>
        </div>

        <div className="text-center">
          <div className="text-xs text-white/50">PLAYER 2</div>
          <div className={`text-5xl font-black tracking-tighter ${currentPlayerIndex === 1 ? 'text-emerald-400' : 'text-white/60'}`}>
            {players[1]}
          </div>
        </div>
      </header>

      {/* Игра */}
      <main ref={containerRef} className="flex-1 relative touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
        />

        {/* Подсказка */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 text-sm tracking-widest pointer-events-none">
          SWIPE UP TO THROW
        </div>
      </main>

      <AnimatePresence>
        {lastHit && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 px-8 py-3 rounded-3xl border border-amber-400/30 shadow-2xl"
          >
            <span className="text-3xl font-black text-amber-400">
              {lastHit.label} <span className="text-xl">+{lastHit.points}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DartGame;