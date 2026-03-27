import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Настройки баланса
const BALL_FRICTION = 0.985; 
const PLAYER_RADIUS = 16; 
const BALL_RADIUS = 10;   
const GOAL_WIDTH = 110;   
const POST_RADIUS = 4;
const PLAYER_SPEED_DIVIDER = 12; 
const HIT_FORCE = 4.5; 

export const NewGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const [score, setScore] = useState({ home: 0, away: 0 });
  const [goalEvent, setGoalEvent] = useState<{ team: 'HOME' | 'AWAY' | null }>({ team: null });

  const world = useRef({
    width: 0, height: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0, angle: 0 },
    p1: { x: 0, y: 0, vx: 0, vy: 0 }, 
    p2: { x: 0, y: 0, vx: 0, vy: 0 },               
    joystick: { active: false, x: 80, y: 0, currX: 80, currY: 0 },
    isPaused: false
  });

  // БЛОКИРОВКА СВАЙПОВ (из гонок)
  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length > 1 || (e.target as HTMLElement).closest('.touch-none')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const playHitSound = (freq: number, vol: number) => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.current.createOscillator();
      const gain = audioCtx.current.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.current.destination);
      osc.start();
      osc.stop(audioCtx.current.currentTime + 0.1);
    } catch (e) {}
  };

  const resetPositions = () => {
    const w = world.current;
    w.ball = { x: w.width / 2, y: w.height / 2, vx: 0, vy: 0, angle: 0 };
    w.p1.x = w.width / 2; w.p1.y = w.height - 120;
    w.p1.vx = 0; w.p1.vy = 0;
    w.p2.x = w.width / 2; w.p2.y = 120;
    w.p2.vx = 0; w.p2.vy = 0;
    w.isPaused = false;
    setGoalEvent({ team: null });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let raf: number;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      world.current.width = rect.width;
      world.current.height = rect.height;
      canvas.width = rect.width;
      canvas.height = rect.height;
      world.current.joystick.y = rect.height - 100;
      world.current.joystick.currY = rect.height - 100;
      resetPositions();
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    const loop = () => {
      const w = world.current;
      const { ball, p1, p2, joystick: j } = w;

      if (!w.isPaused) {
        if (j.active) {
          const dx = j.currX - j.x; const dy = j.currY - j.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 1) {
            p1.vx = (dx / dist) * (Math.min(dist, 40) / PLAYER_SPEED_DIVIDER);
            p1.vy = (dy / dist) * (Math.min(dist, 40) / PLAYER_SPEED_DIVIDER);
            p1.x += p1.vx; p1.y += p1.vy;
          }
        } else { p1.vx *= 0.8; p1.vy *= 0.8; }

        // Коллизия игроков
        const dxP = p2.x - p1.x; const dyP = p2.y - p1.y;
        const distP = Math.sqrt(dxP * dxP + dyP * dyP);
        if (distP < PLAYER_RADIUS * 2) {
          const angle = Math.atan2(dyP, dxP);
          const overlap = PLAYER_RADIUS * 2 - distP;
          p1.x -= Math.cos(angle) * (overlap / 2); p1.y -= Math.sin(angle) * (overlap / 2);
          p2.x += Math.cos(angle) * (overlap / 2); p2.y += Math.sin(angle) * (overlap / 2);
        }

        ball.x += ball.vx; ball.y += ball.vy;
        ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;
        ball.angle += (Math.abs(ball.vx) + Math.abs(ball.vy)) * 0.05;

        // Коллизия мяча с игроками
        [p1, p2].forEach(p => {
          const dxB = ball.x - p.x; const dyB = ball.y - p.y;
          const distB = Math.sqrt(dxB * dxB + dyB * dyB);
          if (distB < PLAYER_RADIUS + BALL_RADIUS) {
            playHitSound(280, 0.08);
            const angle = Math.atan2(dyB, dxB);
            ball.vx = Math.cos(angle) * HIT_FORCE + p.vx * 0.4;
            ball.vy = Math.sin(angle) * HIT_FORCE + p.vy * 0.4;
            ball.x = p.x + Math.cos(angle) * (PLAYER_RADIUS + BALL_RADIUS);
            ball.y = p.y + Math.sin(angle) * (PLAYER_RADIUS + BALL_RADIUS);
          }
        });

        const goalLeft = w.width / 2 - GOAL_WIDTH / 2;
        const goalRight = w.width / 2 + GOAL_WIDTH / 2;
        const inGoalX = ball.x > goalLeft && ball.x < goalRight;

        // Логика гола
        if (inGoalX) {
          if (ball.y < 10) { 
            w.isPaused = true; setScore(s => ({ ...s, home: s.home + 1 })); setGoalEvent({ team: 'HOME' }); setTimeout(resetPositions, 2000);
          } else if (ball.y > w.height - 10) {
            w.isPaused = true; setScore(s => ({ ...s, away: s.away + 1 })); setGoalEvent({ team: 'AWAY' }); setTimeout(resetPositions, 2000);
          }
        }

        // Отскок от стен
        if (ball.x < BALL_RADIUS + 10 || ball.x > w.width - BALL_RADIUS - 10) ball.vx *= -0.8;
        if (!inGoalX && (ball.y < BALL_RADIUS + 10 || ball.y > w.height - BALL_RADIUS - 10)) ball.vy *= -0.8;

        ball.x = Math.max(BALL_RADIUS + 5, Math.min(w.width - BALL_RADIUS - 5, ball.x));
        [p1, p2].forEach(p => {
          p.x = Math.max(PLAYER_RADIUS + 10, Math.min(w.width - PLAYER_RADIUS - 10, p.x));
          p.y = Math.max(PLAYER_RADIUS + 10, Math.min(w.height - PLAYER_RADIUS - 10, p.y));
        });
      }

      // --- ОТРИСОВКА ---
      ctx.fillStyle = '#2d8a34'; ctx.fillRect(0, 0, w.width, w.height);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2d8a34' : '#35963c';
        ctx.fillRect(0, (w.height / 10) * i, w.width, w.height / 10);
      }

      // Разметка поля
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w.width - 20, w.height - 20);
      ctx.beginPath(); ctx.moveTo(10, w.height/2); ctx.lineTo(w.width - 10, w.height/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w.width/2, w.height/2, 60, 0, Math.PI*2); ctx.stroke();

      // Штрафные площади
      ctx.strokeRect(w.width/2 - 90, 10, 180, 70);
      ctx.strokeRect(w.width/2 - 90, w.height - 80, 180, 70);

      // ВИЗУАЛЬНЫЕ ВОРОТА
      const drawGoalUI = (isTop: boolean) => {
        const gx = w.width / 2 - GOAL_WIDTH / 2;
        const gy = isTop ? 10 : w.height - 10;
        const depth = isTop ? -25 : 25;
        
        // Сетка
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=GOAL_WIDTH; i+=12) { ctx.moveTo(gx+i, gy); ctx.lineTo(gx+i, gy+depth); }
        for(let i=0; i<=Math.abs(depth); i+=8) { 
          const curY = isTop ? gy - i : gy + i;
          ctx.moveTo(gx, curY); ctx.lineTo(gx+GOAL_WIDTH, curY); 
        }
        ctx.stroke();

        // Каркас ворот
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.strokeRect(gx, isTop ? gy + depth : gy, GOAL_WIDTH, Math.abs(depth));
        
        // Штанги (белые точки)
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(gx, gy, POST_RADIUS, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(gx + GOAL_WIDTH, gy, POST_RADIUS, 0, Math.PI*2); ctx.fill();
      };
      drawGoalUI(true); drawGoalUI(false);

      // Игроки
      const drawP = (x: number, y: number, c1: string, c2: string) => {
        ctx.save(); ctx.translate(x, y);
        const g = ctx.createRadialGradient(-4, -4, 0, 0, 0, PLAYER_RADIUS);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      };
      drawP(p2.x, p2.y, '#ff6b6b', '#c92a2a');
      drawP(p1.x, p1.y, '#4dabf7', '#1971c2');

      // Мяч
      ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.angle);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.restore();

      // Джойстик
      if (j.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(j.x, j.y, 45, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(j.currX, j.currY, 22, 0, Math.PI*2); ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', updateSize); cancelAnimationFrame(raf); };
  }, []);

  const handleTouch = (e: React.TouchEvent) => {
    const w = world.current;
    if (w.isPaused) return;
    const t = e.touches[0];
    const rect = containerRef.current!.getBoundingClientRect();
    const touchX = t.clientX - rect.left;
    const touchY = t.clientY - rect.top;

    if (e.type === 'touchstart') {
      w.joystick.active = true;
      w.joystick.x = touchX;
      w.joystick.y = touchY;
    }
    
    const dx = touchX - w.joystick.x; const dy = touchY - w.joystick.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const max = 40;
    if (dist > max) {
      w.joystick.currX = w.joystick.x + (dx/dist) * max;
      w.joystick.currY = w.joystick.y + (dy/dist) * max;
    } else {
      w.joystick.currX = touchX; w.joystick.currY = touchY;
    }
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col bg-[#1a1a1a] overflow-hidden select-none touch-none overscroll-none" 
      style={{ touchAction: 'none' }}
    >
      <div className="flex justify-between items-center px-8 py-4 bg-black/90 border-b border-white/10 z-20 shadow-2xl">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-red-500 font-black">AWAY</span>
          <AnimatePresence mode="wait"><motion.span key={score.away} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="text-4xl font-black text-white italic">{score.away}</motion.span></AnimatePresence>
        </div>
        <button onClick={() => navigate(-1)} className="px-6 py-2 bg-white/5 rounded-full text-[11px] text-white/70 font-bold border border-white/10 active:scale-90 transition-transform">EXIT</button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-blue-500 font-black">HOME</span>
          <AnimatePresence mode="wait"><motion.span key={score.home} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="text-4xl font-black text-white italic">{score.home}</motion.span></AnimatePresence>
        </div>
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 w-full relative touch-none"
        onTouchStart={handleTouch} onTouchMove={handleTouch}
        onTouchEnd={() => { world.current.joystick.active = false; }}
      >
        <canvas ref={canvasRef} className="block w-full h-full touch-none" />
        <AnimatePresence>
          {goalEvent.team && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.5 }} className="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-[2px]">
              <h2 className={`text-8xl font-black italic ${goalEvent.team === 'HOME' ? 'text-blue-500' : 'text-red-500'}`}>GOAL!</h2>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};