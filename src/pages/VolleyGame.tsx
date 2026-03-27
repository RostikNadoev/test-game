import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SETTINGS = {
  gravity: 0.35,
  jumpForce: -11,
  speed: 7,
  slimeRadius: 42,
  ballRadius: 16,
  netHeight: 110,
  terminalVelocity: 14
};

export const VolleyGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameState, setGameState] = useState<'loading' | 'playing'>('loading');
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  
  const p1 = useRef({ x: 150, y: 0, vY: 0, scaleX: 1, scaleY: 1, color: '#00F2FF', wobble: 0 });
  const p2 = useRef({ x: 650, y: 0, vY: 0, scaleX: 1, scaleY: 1, color: '#FF007A', wobble: 0 });
  const ball = useRef({ 
    x: 400, y: 150, vX: 4, vY: 0, rotation: 0,
    trail: [] as {x: number, y: number, a: number}[] 
  });

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => setGameState('playing'), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const update = () => {
      const cw = canvas.width;
      const ch = canvas.height;
      const floorY = ch - 140; // Подняли пол выше кнопок

      // --- Физика игроков ---
      [p1.current, p2.current].forEach((p, i) => {
        if (i === 0) {
          if (keys.current['KeyA']) { p.x -= SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.15) * 0.08; }
          if (keys.current['KeyD']) { p.x += SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.15) * 0.08; }
          if (keys.current['KeyW'] && p.y === 0) p.vY = SETTINGS.jumpForce;
        }

        p.vY += SETTINGS.gravity;
        p.y += p.vY;

        if (p.y > 0) {
          if (p.vY > 2) { p.scaleY = 0.5; p.scaleX = 1.4; }
          p.y = 0; p.vY = 0;
        }

        p.scaleX += (1 - p.scaleX) * 0.2;
        p.scaleY += (1 - p.scaleY) * 0.2;
        if (p.y < 0) { p.scaleY = 1 + Math.abs(p.vY) * 0.04; p.scaleX = 1 - Math.abs(p.vY) * 0.03; }

        const margin = SETTINGS.slimeRadius;
        if (i === 0) p.x = Math.max(margin, Math.min(cw/2 - margin - 15, p.x));
        else p.x = Math.max(cw/2 + margin + 15, Math.min(cw - margin, p.x));
      });

      // --- Физика волейбольного мяча ---
      const b = ball.current;
      b.vY = Math.min(b.vY + SETTINGS.gravity * 0.6, SETTINGS.terminalVelocity);
      b.x += b.vX; b.y += b.vY;
      b.rotation += b.vX * 0.05;

      b.trail.push({ x: b.x, y: b.y, a: 1 });
      if (b.trail.length > 12) b.trail.shift();
      b.trail.forEach(t => t.a *= 0.8);

      if (b.x < SETTINGS.ballRadius || b.x > cw - SETTINGS.ballRadius) {
        b.vX *= -0.7;
        b.x = b.x < SETTINGS.ballRadius ? SETTINGS.ballRadius : cw - SETTINGS.ballRadius;
      }

      if (b.y > floorY - SETTINGS.netHeight && Math.abs(b.x - cw/2) < SETTINGS.ballRadius + 8) {
        b.vX *= -0.9;
        b.x = b.x < cw/2 ? cw/2 - 20 : cw/2 + 20;
      }

      [p1.current, p2.current].forEach(p => {
        const dx = b.x - p.x;
        const dy = b.y - (floorY - p.y - 15);
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < SETTINGS.slimeRadius + SETTINGS.ballRadius) {
          const angle = Math.atan2(dy, dx);
          const speed = Math.sqrt(b.vX**2 + b.vY**2);
          const force = Math.max(speed + 1.5, 10);
          b.vX = Math.cos(angle) * force;
          b.vY = Math.sin(angle) * force;
          p.scaleY = 0.7; p.scaleX = 1.3;
        }
      });

      if (b.y > floorY) {
        if (b.x < cw/2) setScore(s => ({ ...s, p2: s.p2 + 1 }));
        else setScore(s => ({ ...s, p1: s.p1 + 1 }));
        b.x = b.x < cw/2 ? cw * 0.75 : cw * 0.25;
        b.y = 100; b.vX = 0; b.vY = 0;
      }

      // --- Отрисовка ---
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, cw, ch);
      
      // Сетка (Лазерная)
      ctx.shadowBlur = 15; ctx.shadowColor = '#FF3D00';
      ctx.strokeStyle = '#FF3D00'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cw/2, floorY); ctx.lineTo(cw/2, floorY - SETTINGS.netHeight);
      ctx.stroke();

      // Пол
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#111116';
      ctx.fillRect(0, floorY, cw, ch - floorY);
      ctx.strokeStyle = '#333344'; ctx.lineWidth = 2;
      ctx.strokeRect(0, floorY, cw, 2);

      // Отрисовка слаймов
      [p1.current, p2.current].forEach(p => {
        ctx.save();
        ctx.translate(p.x, floorY - p.y);
        ctx.scale(p.scaleX + p.wobble, p.scaleY - p.wobble);
        
        const g = ctx.createLinearGradient(0, -SETTINGS.slimeRadius, 0, 0);
        g.addColorStop(0, p.color); g.addColorStop(1, '#000000');
        ctx.fillStyle = g;
        ctx.shadowBlur = 20; ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, SETTINGS.slimeRadius, Math.PI, 0);
        ctx.fill();

        // Блик
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(-15, -25, 10, 0, Math.PI*2); ctx.fill();

        // Глаза
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(-18, -22, 7, 0, Math.PI*2); ctx.arc(18, -22, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black';
        const lookX = (b.x - p.x) * 0.03; const lookY = (b.y - (floorY - p.y)) * 0.03;
        ctx.beginPath(); ctx.arc(-18 + lookX, -22 + lookY, 3.5, 0, Math.PI*2); 
        ctx.arc(18 + lookX, -22 + lookY, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      });

      // Волейбольный мяч
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);
      ctx.shadowBlur = 15; ctx.shadowColor = '#FFF';
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(0, 0, SETTINGS.ballRadius, 0, Math.PI*2); ctx.fill();
      
      // Полоски мяча
      ctx.strokeStyle = '#DDD'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-SETTINGS.ballRadius, 0); ctx.lineTo(SETTINGS.ballRadius, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, SETTINGS.ballRadius, 0.5, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, SETTINGS.ballRadius, 3.5, 5.5); ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(update);
    };

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [gameState]);

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-164px)] bg-[#050508] overflow-hidden select-none">
      <AnimatePresence>
        {gameState === 'loading' && (
          <motion.div 
            initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#050508] flex flex-col items-center justify-center"
          >
            <motion.div 
              animate={{ y: [0, -20, 0] }} 
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="w-12 h-12 bg-white rounded-full shadow-[0_0_30px_#fff] mb-6"
            />
            <h2 className="text-xl font-black text-white italic tracking-widest uppercase">Get Ready!</h2>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Счет */}
      <div className="absolute top-8 left-0 w-full flex justify-center items-baseline gap-12 pointer-events-none">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-cyan-400 font-bold tracking-[0.2em]">P1</span>
          <span className="text-4xl font-black text-white">{score.p1}</span>
        </div>
        <div className="text-2xl font-black text-white/10 italic">VS</div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-pink-500 font-bold tracking-[0.2em]">P2</span>
          <span className="text-4xl font-black text-white">{score.p2}</span>
        </div>
      </div>

      {/* Кнопки управления (уменьшены и опущены) */}
      <div className="absolute bottom-6 left-6 flex gap-3">
        <button 
          onPointerDown={() => keys.current['KeyA'] = true} onPointerUp={() => keys.current['KeyA'] = false}
          className="w-14 h-14 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-xl active:bg-cyan-500/30 transition-all"
        >←</button>
        <button 
          onPointerDown={() => keys.current['KeyD'] = true} onPointerUp={() => keys.current['KeyD'] = false}
          className="w-14 h-14 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-xl active:bg-cyan-500/30 transition-all"
        >→</button>
      </div>

      <button 
        onPointerDown={() => keys.current['KeyW'] = true} onPointerUp={() => keys.current['KeyW'] = false}
        className="absolute bottom-6 right-6 w-16 h-16 bg-blue-600/20 rounded-full border-2 border-blue-500/40 flex items-center justify-center font-bold text-blue-400 text-xs active:scale-90 transition-all"
      >JUMP</button>

      <button onClick={() => navigate(-1)} className="absolute top-6 right-6 text-[10px] text-white/30 font-bold border border-white/10 px-3 py-1 rounded-md uppercase tracking-tighter">Exit</button>
    </div>
  );
};