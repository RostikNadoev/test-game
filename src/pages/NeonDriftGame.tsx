import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const CONFIG = {
  speed: 4.8,
  driftFactor: 0.035, // Насколько сильно машину "заносит"
  turnSpeed: 0.065,
  maxTrail: 50,
  wallPadding: 20
};

export const NeonDriftGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'over'>('start');
  const [combo, setCombo] = useState(1);
  
  const car = useRef({
    x: 0, y: 0,
    angle: -Math.PI / 2,
    vX: 0, vY: 0,
    isDrifting: false,
    trail: [] as {x: number, y: number, drifting: boolean}[]
  });

  const initGame = () => {
    const cw = window.innerWidth;
    const ch = window.innerHeight - 164;
    car.current = {
      x: cw / 2, y: ch / 2,
      angle: -Math.PI / 2,
      vX: 0, vY: 0,
      isDrifting: false,
      trail: []
    };
    setScore(0);
    setCombo(1);
    setGameState('playing');
  };

  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const update = () => {
      const c = car.current;
      const cw = canvas.width;
      const ch = canvas.height;

      // 1. Физика поворота
      if (c.isDrifting) {
        c.angle += CONFIG.turnSpeed;
        setCombo(prev => Math.min(prev + 0.01, 5));
      } else {
        setCombo(1);
      }

      // Вектор направления носа машины
      const targetVX = Math.cos(c.angle) * CONFIG.speed;
      const targetVY = Math.sin(c.angle) * CONFIG.speed;

      // Инерция (дрифт)
      c.vX += (targetVX - c.vX) * CONFIG.driftFactor;
      c.vY += (targetVY - c.vY) * CONFIG.driftFactor;

      c.x += c.vX;
      c.y += c.vY;

      // 2. След (Trail)
      c.trail.push({ x: c.x, y: c.y, drifting: c.isDrifting });
      if (c.trail.length > CONFIG.maxTrail) c.trail.shift();

      // 3. Проверка столкновений
      if (c.x < 0 || c.x > cw || c.y < 0 || c.y > ch) {
        setGameState('over');
        return;
      }

      // 4. Отрисовка
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, cw, ch);
      
      // Сетка
      ctx.strokeStyle = '#151520';
      ctx.lineWidth = 1;
      for(let i=0; i<cw; i+=50) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i, ch); ctx.stroke(); }
      for(let i=0; i<ch; i+=50) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(cw, i); ctx.stroke(); }

      // Отрисовка следа протекторов
      if (c.trail.length > 2) {
        for(let i = 1; i < c.trail.length; i++) {
          ctx.beginPath();
          ctx.strokeStyle = c.trail[i].drifting ? '#00f2ff' : '#333344';
          ctx.lineWidth = c.trail[i].drifting ? 4 : 2;
          ctx.globalAlpha = i / c.trail.length;
          ctx.moveTo(c.trail[i-1].x, c.trail[i-1].y);
          ctx.lineTo(c.trail[i].x, c.trail[i].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Машина
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      
      // Свечение под машиной
      ctx.shadowBlur = 15;
      ctx.shadowColor = c.isDrifting ? '#00f2ff' : '#ff007a';
      
      // Кузов
      ctx.fillStyle = '#fff';
      ctx.fillRect(-12, -7, 24, 14);
      // Спойлер
      ctx.fillStyle = c.isDrifting ? '#00f2ff' : '#ff007a';
      ctx.fillRect(-14, -8, 4, 16);
      // Кабина
      ctx.fillStyle = '#050508';
      ctx.fillRect(-2, -5, 8, 10);
      
      ctx.restore();

      if (c.isDrifting) setScore(s => s + Math.floor(1 * combo));

      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [gameState, combo]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-[#050508] overflow-hidden flex flex-col"
      onPointerDown={() => { car.current.isDrifting = true; if(gameState !== 'playing') initGame(); }}
      onPointerUp={() => car.current.isDrifting = false}
    >
      <div className="absolute top-4 left-6 z-10 pointer-events-none">
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-black text-white tabular-nums">{score}</p>
          <p className="text-cyan-400 font-bold text-sm">x{combo.toFixed(1)}</p>
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Drift Points</p>
      </div>

      <canvas 
        ref={canvasRef} 
        width={window.innerWidth} 
        height={window.innerHeight - 164}
        className="block"
      />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div exit={{opacity: 0}} className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
            <motion.div 
              animate={{ y: [0, -10, 0] }} 
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-cyan-500 mb-4"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </motion.div>
            <h2 className="text-white font-black text-xl mb-2">NEON DRIFT</h2>
            <p className="text-gray-400 text-xs uppercase tracking-[0.3em]">Hold to initiate drift</p>
          </motion.div>
        )}

        {gameState === 'over' && (
          <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/10 backdrop-blur-xl z-30">
            <h2 className="text-white font-black text-5xl mb-2 italic">WASTED</h2>
            <p className="text-white/60 text-sm mb-8 uppercase tracking-widest font-bold">Total Score: {score}</p>
            <div className="flex gap-4">
              <button onClick={() => navigate(-1)} className="px-6 py-3 border border-white/20 rounded-xl text-white text-xs font-bold uppercase">Exit</button>
              <button onClick={initGame} className="px-10 py-3 bg-white rounded-xl text-black text-xs font-bold uppercase shadow-[0_0_30px_rgba(255,255,255,0.3)]">Restart</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};