import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const BALL_FRICTION = 0.99; // Мяч катится дольше
const PLAYER_RADIUS = 16; 
const BALL_RADIUS = 10;   
const GOAL_WIDTH = 110;   
const POST_RADIUS = 4; // Радиус штанги

export const NewGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [goalEvent, setGoalEvent] = useState<{ team: 'HOME' | 'AWAY' | null }>({ team: null });

  const world = useRef({
    width: 0, height: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0, angle: 0 },
    p1: { x: 0, y: 0, vx: 0, vy: 0 }, 
    p2: { x: 0, y: 0 },               
    joystick: { active: false, startX: 0, startY: 0, currX: 0, currY: 0 },
    isPaused: false
  });

  const resetPositions = () => {
    const w = world.current;
    w.ball = { x: w.width / 2, y: w.height / 2, vx: 0, vy: 0, angle: 0 };
    w.p1.x = w.width / 2; w.p1.y = w.height - 120;
    w.p2.x = w.width / 2; w.p2.y = 120;
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
      resetPositions();
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    const loop = () => {
      const w = world.current;
      const { ball, p1, p2, joystick: j } = w;

      if (!w.isPaused) {
        // --- ДВИЖЕНИЕ ИГРОКА ---
        if (j.active) {
          const dx = j.currX - j.startX; const dy = j.currY - j.startY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const speed = Math.min(dist, 50) / 7;
          if (dist > 2) { p1.vx = (dx / dist) * speed; p1.vy = (dy / dist) * speed; p1.x += p1.vx; p1.y += p1.vy; }
        } else { p1.vx *= 0.8; p1.vy *= 0.8; }

        // --- ФИЗИКА МЯЧА ---
        ball.x += ball.vx; ball.y += ball.vy;
        ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;
        ball.angle += (Math.abs(ball.vx) + Math.abs(ball.vy)) * 0.05;

        // Коллизия Игрок - Мяч
        const dxB = ball.x - p1.x; const dyB = ball.y - p1.y;
        const distB = Math.sqrt(dxB * dxB + dyB * dyB);
        if (distB < PLAYER_RADIUS + BALL_RADIUS) {
          const angle = Math.atan2(dyB, dxB);
          const force = 7;
          ball.vx = Math.cos(angle) * force + p1.vx * 0.5;
          ball.vy = Math.sin(angle) * force + p1.vy * 0.5;
          ball.x = p1.x + Math.cos(angle) * (PLAYER_RADIUS + BALL_RADIUS);
          ball.y = p1.y + Math.sin(angle) * (PLAYER_RADIUS + BALL_RADIUS);
        }

        // --- ЛОГИКА ШТАНГ И ВОРОТ ---
        const goalLeft = w.width / 2 - GOAL_WIDTH / 2;
        const goalRight = w.width / 2 + GOAL_WIDTH / 2;
        const posts = [
          { x: goalLeft, y: 10 }, { x: goalRight, y: 10 }, // Верхние
          { x: goalLeft, y: w.height - 10 }, { x: goalRight, y: w.height - 10 } // Нижние
        ];

        posts.forEach(post => {
          const dx = ball.x - post.x;
          const dy = ball.y - post.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BALL_RADIUS + POST_RADIUS) {
            const angle = Math.atan2(dy, dx);
            const speed = Math.sqrt(ball.vx**2 + ball.vy**2);
            ball.vx = Math.cos(angle) * (speed + 1);
            ball.vy = Math.sin(angle) * (speed + 1);
            ball.x = post.x + Math.cos(angle) * (BALL_RADIUS + POST_RADIUS);
          }
        });

        // ПРОВЕРКА ГОЛА
        const isBallInGoalX = ball.x > goalLeft && ball.x < goalRight;
        if (isBallInGoalX) {
          if (ball.y < -BALL_RADIUS) { 
            w.isPaused = true;
            setScore(s => ({ ...s, home: s.home + 1 }));
            setGoalEvent({ team: 'HOME' });
            setTimeout(resetPositions, 2000);
          } else if (ball.y > w.height + BALL_RADIUS) {
            w.isPaused = true;
            setScore(s => ({ ...s, away: s.away + 1 }));
            setGoalEvent({ team: 'AWAY' });
            setTimeout(resetPositions, 2000);
          }
        }

        // Отскоки от стен (если не в створе ворот)
        if (ball.x < BALL_RADIUS || ball.x > w.width - BALL_RADIUS) ball.vx *= -0.8;
        if (!isBallInGoalX) {
          if (ball.y < BALL_RADIUS + 10 || ball.y > w.height - BALL_RADIUS - 10) ball.vy *= -0.8;
        }

        // Ограничения
        ball.x = Math.max(BALL_RADIUS, Math.min(w.width - BALL_RADIUS, ball.x));
        p1.x = Math.max(PLAYER_RADIUS, Math.min(w.width - PLAYER_RADIUS, p1.x));
        p1.y = Math.max(PLAYER_RADIUS, Math.min(w.height - PLAYER_RADIUS, p1.y));
      }

      // --- ОТРИСОВКА ---
      ctx.fillStyle = '#2d8a34'; ctx.fillRect(0, 0, w.width, w.height);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2d8a34' : '#35963c';
        ctx.fillRect(0, (w.height / 10) * i, w.width, w.height / 10);
      }

      // Разметка
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, w.width - 20, w.height - 20);
      ctx.beginPath(); ctx.moveTo(10, w.height/2); ctx.lineTo(w.width - 10, w.height/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w.width/2, w.height/2, 60, 0, Math.PI*2); ctx.stroke();
      ctx.strokeRect(w.width / 2 - 85, 10, 170, 70); 
      ctx.strokeRect(w.width / 2 - 85, w.height - 80, 170, 70);

      // Ворота и штанги
      const drawGoalUI = (isTop: boolean) => {
        const gx = w.width / 2 - GOAL_WIDTH / 2;
        const gy = isTop ? 10 : w.height - 10;
        const depth = isTop ? -20 : 20;

        // Сетка
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=GOAL_WIDTH; i+=10) { ctx.moveTo(gx+i, gy); ctx.lineTo(gx+i, gy+depth); }
        ctx.stroke();

        // Штанги (белые кругляшки)
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(gx, gy, POST_RADIUS, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(gx + GOAL_WIDTH, gy, POST_RADIUS, 0, Math.PI*2); ctx.fill();
        
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.strokeRect(gx, isTop ? gy + depth : gy, GOAL_WIDTH, Math.abs(depth));
      };
      drawGoalUI(true); drawGoalUI(false);

      // Мяч
      ctx.save();
      ctx.translate(ball.x, ball.y); ctx.rotate(ball.angle);
      const bGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, BALL_RADIUS);
      bGrad.addColorStop(0, '#fff'); bGrad.addColorStop(1, '#ddd');
      ctx.fillStyle = bGrad; ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.stroke();
      ctx.restore();

      // Игроки
      const drawP = (x: number, y: number, c1: string, c2: string) => {
        ctx.save(); ctx.translate(x, y);
        const g = ctx.createRadialGradient(-4, -4, 0, 0, 0, PLAYER_RADIUS);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
        ctx.restore();
      };
      drawP(p2.x, p2.y, '#ff6b6b', '#c92a2a');
      drawP(p1.x, p1.y, '#4dabf7', '#1971c2');

      // Джойстик
      if (j.active && !w.isPaused) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(j.startX, j.startY, 40, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(j.currX, j.currY, 20, 0, Math.PI*2); ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#1a1a1a] overflow-hidden select-none touch-none">
      <div className="flex justify-between items-center px-8 py-4 bg-black/90 border-b border-white/10 z-20 shadow-2xl">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-red-500 font-black">AWAY</span>
          <AnimatePresence mode="wait">
            <motion.span key={score.away} initial={{ scale: 1.5, color: '#ff0000' }} animate={{ scale: 1, color: '#ffffff' }} className="text-4xl font-black italic">{score.away}</motion.span>
          </AnimatePresence>
        </div>
        <button onClick={() => navigate(-1)} className="px-6 py-2 bg-white/5 rounded-full text-[11px] text-white/70 font-bold border border-white/10 transition-all active:scale-90">EXIT</button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-blue-500 font-black">HOME</span>
          <AnimatePresence mode="wait">
            <motion.span key={score.home} initial={{ scale: 1.5, color: '#0066ff' }} animate={{ scale: 1, color: '#ffffff' }} className="text-4xl font-black italic">{score.home}</motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div 
        ref={containerRef} className="flex-1 w-full relative"
        onTouchStart={(e) => { if(world.current.isPaused) return; const t = e.touches[0]; world.current.joystick = { active: true, startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY }; }}
        onTouchMove={(e) => { if (!world.current.joystick.active || world.current.isPaused) return; const t = e.touches[0]; world.current.joystick.currX = t.clientX; world.current.joystick.currY = t.clientY; }}
        onTouchEnd={() => world.current.joystick.active = false}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        <AnimatePresence>
          {goalEvent.team && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.5 }} className="absolute inset-0 flex items-center justify-center z-30 bg-black/20 backdrop-blur-[2px]">
              <div className="text-center">
                <motion.h2 animate={{ y: [0, -20, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className={`text-8xl font-black italic tracking-tighter ${goalEvent.team === 'HOME' ? 'text-blue-500' : 'text-red-500'}`}>GOAL!</motion.h2>
                <p className="text-white font-bold text-xl uppercase tracking-widest mt-4 bg-black/50 py-2 px-6 rounded-full inline-block">Score Update</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};