import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SETTINGS = {
  gravity: 0.35,
  jumpForce: -11,
  speed: 7,
  slimeRadius: 40,
  ballRadius: 15,
  netHeight: 120,
  terminalVelocity: 14
};

export const VolleyGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameState, setGameState] = useState<'loading' | 'playing'>('loading');
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  
  // Координаты теперь считаются в "альбомном" уме: X - длинная сторона, Y - короткая
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
      // В альбомном режиме "Ширина" - это высота контейнера, а "Высота" - ширина
      const cw = canvas.width;  // Длинная сторона (визуально вертикаль контейнера)
      const ch = canvas.height; // Короткая сторона
      const floorY = ch - 50;   // Пол

      // --- Физика ---
      [p1.current, p2.current].forEach((p, i) => {
        if (i === 0) {
          if (keys.current['KeyA']) { p.x -= SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.15) * 0.08; }
          if (keys.current['KeyD']) { p.x += SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.15) * 0.08; }
          if (keys.current['KeyW'] && p.y === 0) p.vY = SETTINGS.jumpForce;
        }

        p.vY += SETTINGS.gravity;
        p.y += p.vY;

        if (p.y > 0) { p.y = 0; p.vY = 0; }
        
        p.scaleX += (1 - p.scaleX) * 0.2;
        p.scaleY += (1 - p.scaleY) * 0.2;

        const margin = SETTINGS.slimeRadius;
        if (i === 0) p.x = Math.max(margin, Math.min(cw/2 - margin - 5, p.x));
        else p.x = Math.max(cw/2 + margin + 5, Math.min(cw - margin, p.x));
      });

      const b = ball.current;
      b.vY = Math.min(b.vY + SETTINGS.gravity * 0.6, SETTINGS.terminalVelocity);
      b.x += b.vX; b.y += b.vY;
      b.rotation += b.vX * 0.05;

      if (b.x < SETTINGS.ballRadius || b.x > cw - SETTINGS.ballRadius) b.vX *= -0.8;
      if (b.y < SETTINGS.ballRadius) b.vY *= -0.8;

      // Сетка
      if (b.y > floorY - SETTINGS.netHeight && Math.abs(b.x - cw/2) < SETTINGS.ballRadius + 5) {
        b.vX *= -0.8;
        b.x = b.x < cw/2 ? cw/2 - 20 : cw/2 + 20;
      }

      // Коллизия со слаймами
      [p1.current, p2.current].forEach(p => {
        const dx = b.x - p.x;
        const dy = b.y - (floorY - p.y);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < SETTINGS.slimeRadius + SETTINGS.ballRadius) {
          const angle = Math.atan2(dy, dx);
          b.vX = Math.cos(angle) * 12;
          b.vY = Math.sin(angle) * 12;
        }
      });

      if (b.y > floorY) {
        if (b.x < cw/2) setScore(s => ({ ...s, p2: s.p2 + 1 }));
        else setScore(s => ({ ...s, p1: s.p1 + 1 }));
        b.x = b.x < cw/2 ? cw * 0.75 : cw * 0.25; b.y = 100; b.vX = 0; b.vY = 0;
      }

      // --- Отрисовка ---
      ctx.clearRect(0, 0, cw, ch);
      
      // Фон
      ctx.fillStyle = '#08080E';
      ctx.fillRect(0, 0, cw, ch);

      // Рисуем сетку
      ctx.save();
      ctx.strokeStyle = '#444455';
      ctx.lineWidth = 2;
      ctx.strokeRect(cw/2 - 4, floorY - SETTINGS.netHeight, 8, SETTINGS.netHeight);
      // Паттерн сетки
      ctx.beginPath();
      for(let ly = 0; ly < SETTINGS.netHeight; ly += 10) {
        ctx.moveTo(cw/2 - 4, floorY - ly); ctx.lineTo(cw/2 + 4, floorY - ly);
      }
      ctx.stroke();
      ctx.restore();

      // Пол
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(0, floorY, cw, 50);

      // Слаймы
      [p1.current, p2.current].forEach(p => {
        ctx.save();
        ctx.translate(p.x, floorY - p.y);
        ctx.scale(p.scaleX + p.wobble, p.scaleY - p.wobble);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(0, 0, SETTINGS.slimeRadius, Math.PI, 0); ctx.fill();
        ctx.restore();
      });

      // Мяч
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);
      ctx.fillStyle = '#FFF';
      ctx.shadowBlur = 10; ctx.shadowColor = '#FFF';
      ctx.beginPath(); ctx.arc(0, 0, SETTINGS.ballRadius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-SETTINGS.ballRadius, 0); ctx.lineTo(SETTINGS.ballRadius, 0); ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(update);
    };

    // ГЕОМЕТРИЯ: Инвертируем ширину и высоту для рисования
    const rect = container.getBoundingClientRect();
    canvas.width = rect.height; // Код думает, что это ширина
    canvas.height = rect.width; // Код думает, что это высота
    
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [gameState]);

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-164px)] bg-[#050508] overflow-hidden flex items-center justify-center">
      <AnimatePresence>
        {gameState === 'loading' && (
          <motion.div 
            initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center text-white"
          >
            <motion.div
              animate={{ rotate: 90 }}
              transition={{ duration: 1.2, repeat: 1 }}
              className="w-12 h-20 border-2 border-white rounded-lg mb-4 flex items-center justify-center"
            >
              <div className="w-1 h-3 bg-white/30 rounded-full" />
            </motion.div>
            <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Rotating Arena...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Повернутый Canvas */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          transform: 'rotate(-90deg)', 
          transformOrigin: 'center',
          width: 'calc(100vh - 164px)', 
          height: '100vw'
        }} 
        className="block"
      />

      {/* Интерфейс (не повернут, чтобы было удобно нажимать) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        <div className="flex justify-between items-start">
          <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <p className="text-[10px] text-cyan-400 font-bold uppercase">P1</p>
            <p className="text-2xl font-black text-white leading-none">{score.p1}</p>
          </div>
          <button onClick={() => navigate(-1)} className="pointer-events-auto px-4 py-2 bg-white/5 rounded-lg text-[10px] text-white/50 border border-white/10">EXIT</button>
          <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 text-right">
            <p className="text-[10px] text-pink-500 font-bold uppercase">P2</p>
            <p className="text-2xl font-black text-white leading-none">{score.p2}</p>
          </div>
        </div>

        <div className="flex justify-between items-end pointer-events-auto">
          <div className="flex gap-2">
            <button 
              onPointerDown={() => keys.current['KeyA'] = true} onPointerUp={() => keys.current['KeyA'] = false}
              className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-xl active:scale-90 transition-transform"
            >←</button>
            <button 
              onPointerDown={() => keys.current['KeyD'] = true} onPointerUp={() => keys.current['KeyD'] = false}
              className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-xl active:scale-90 transition-transform"
            >→</button>
          </div>
          <button 
            onPointerDown={() => keys.current['KeyW'] = true} onPointerUp={() => keys.current['KeyW'] = false}
            className="w-20 h-20 bg-cyan-500/20 border-2 border-cyan-500 rounded-full font-black text-cyan-500 text-xs active:scale-90 transition-transform"
          >JUMP</button>
        </div>
      </div>
    </div>
  );
};