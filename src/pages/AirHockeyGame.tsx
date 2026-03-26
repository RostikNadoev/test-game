import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SETTINGS = {
  puckSize: 16,
  paddleSize: 30,
  friction: 0.992,
  wallBounciness: 0.8,
  maxPuckSpeed: 18,
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export const AirHockeyGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });

  const puck = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const p1 = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, isDragging: false }); 
  const p2 = useRef({ x: 0, y: 0 }); 
  const particles = useRef<Particle[]>([]);

  // Теперь шайба просто появляется на половине игрока без скорости
  const spawnPuck = (w: number, h: number, targetPlayer: 'p1' | 'p2') => {
    puck.current = {
      x: w / 2,
      y: targetPlayer === 'p1' ? h * 0.75 : h * 0.25, // Спавн прямо на половине игрока
      vx: 0,
      vy: 0
    };
  };

  const updateAI = (w: number, h: number) => {
    const targetX = puck.current.x;
    const paddleSpeed = 0.08;
    
    if (puck.current.y < h / 2) {
      const dx = targetX - p2.current.x;
      p2.current.x += dx * paddleSpeed;
    } else {
      const dx = (w / 2) - p2.current.x;
      p2.current.x += dx * 0.03;
    }
    
    if (p2.current.x < SETTINGS.paddleSize) p2.current.x = SETTINGS.paddleSize;
    if (p2.current.x > w - SETTINGS.paddleSize) p2.current.x = w - SETTINGS.paddleSize;
  };

  const createGoalEffect = (x: number, y: number, color: string) => {
    for (let i = 0; i < 25; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w;
    canvas.height = h;

    spawnPuck(w, h, 'p1');
    p1.current = { x: w / 2, y: h - 100, lastX: w / 2, lastY: h - 100, isDragging: false };
    p2.current = { x: w / 2, y: 100 };

    let raf: number;

    const update = () => {
      const p = puck.current;
      updateAI(w, h);

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= SETTINGS.friction;
      p.vy *= SETTINGS.friction;

      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
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

      if (p.y < SETTINGS.puckSize || p.y > h - SETTINGS.puckSize) {
        if (p.x > w * 0.3 && p.x < w * 0.7) {
          const isTopGoal = p.y < h / 2;
          createGoalEffect(p.x, p.y, isTopGoal ? '#3b82f6' : '#ef4444');
          if (isTopGoal) {
            setScore(s => ({ ...s, p1: s.p1 + 1 }));
            spawnPuck(w, h, 'p2'); 
          } else {
            setScore(s => ({ ...s, p2: s.p2 + 1 }));
            spawnPuck(w, h, 'p1'); 
          }
        } else {
          p.y = p.y < SETTINGS.puckSize ? SETTINGS.puckSize : h - SETTINGS.puckSize;
          p.vy *= -SETTINGS.wallBounciness;
        }
      }

      [p1.current, { x: p2.current.x, y: p2.current.y, isAI: true }].forEach((paddle, index) => {
        const dx = p.x - paddle.x;
        const dy = p.y - paddle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = SETTINGS.puckSize + SETTINGS.paddleSize;

        if (dist < minDist) {
          const angle = Math.atan2(dy, dx);
          p.x = paddle.x + Math.cos(angle) * minDist;
          p.y = paddle.y + Math.sin(angle) * minDist;
          
          if (index === 0) { 
            const vx = (p1.current.x - p1.current.lastX) * 0.8;
            const vy = (p1.current.y - p1.current.lastY) * 0.8;
            p.vx = vx + Math.cos(angle) * (speed + 2);
            p.vy = vy + Math.sin(angle) * (speed + 2);
          } else { 
            p.vx = Math.cos(angle) * (speed + 1.5);
            p.vy = Math.sin(angle) * (speed + 1.5);
          }
        }
      });

      p1.current.lastX = p1.current.x;
      p1.current.lastY = p1.current.y;

      ctx.fillStyle = '#0A0A0F';
      ctx.fillRect(0, 0, w, h);

      // Разметка поля и КАРКАСЫ ворот цветами команд
      ctx.lineWidth = 4;
      
      // Ворота ИИ (Синие)
      ctx.strokeStyle = '#3b82f6';
      ctx.strokeRect(w * 0.3, 0, w * 0.4, 5);
      
      // Ворота Игрока (Красные)
      ctx.strokeStyle = '#ef4444';
      ctx.strokeRect(w * 0.3, h - 5, w * 0.4, 5);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w/2, h/2, 40, 0, Math.PI*2); ctx.stroke();

      particles.current.forEach((part, i) => {
        ctx.fillStyle = part.color;
        ctx.globalAlpha = part.life;
        ctx.beginPath(); ctx.arc(part.x, part.y, 2, 0, Math.PI*2); ctx.fill();
        part.x += part.vx; part.y += part.vy;
        part.life -= 0.02;
        if (part.life <= 0) particles.current.splice(i, 1);
      });
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, SETTINGS.puckSize, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(p1.current.x, p1.current.y, SETTINGS.paddleSize, 0, Math.PI * 2); ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath(); ctx.arc(p2.current.x, p2.current.y, SETTINGS.paddleSize, 0, Math.PI * 2); ctx.fill();
      ctx.stroke();

      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleStart = (e: any) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const dist = Math.sqrt((x - p1.current.x)**2 + (y - p1.current.y)**2);
    if (dist < SETTINGS.paddleSize * 2.5) {
      p1.current.isDragging = true;
    }
  };

  const handleMove = (e: any) => {
    if (!p1.current.isDragging) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let nextX = clientX - rect.left;
    let nextY = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    nextX = Math.max(SETTINGS.paddleSize, Math.min(w - SETTINGS.paddleSize, nextX));
    nextY = Math.max(h / 2 + SETTINGS.paddleSize, Math.min(h - SETTINGS.paddleSize, nextY));
    p1.current.x = nextX;
    p1.current.y = nextY;
  };

  const handleEnd = () => {
    p1.current.isDragging = false;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-[#0A0A0F] overflow-hidden touch-none select-none">
      <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col items-center gap-4 z-10 pointer-events-none opacity-20">
        <div className="text-6xl font-black text-blue-500">{score.p2}</div>
        <div className="w-12 h-1 bg-white/20" />
        <div className="text-6xl font-black text-red-500">{score.p1}</div>
      </div>
      <button onClick={() => navigate('/')} className="absolute top-6 right-6 z-20 text-white/20 text-[10px] border border-white/10 px-3 py-1 rounded tracking-widest uppercase">
        Exit
      </button>
      <canvas 
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        className="w-full h-full"
      />
    </div>
  );
};