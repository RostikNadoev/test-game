import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SETTINGS = {
  gravity: 0.3,
  jumpForce: -10,
  speed: 6,
  slimeRadius: 45,
  ballRadius: 18,
  netHeight: 100,
  terminalVelocity: 12
};

export const VolleyGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isLandscape, setIsLandscape] = useState(false);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  
  const p1 = useRef({ x: 200, y: 0, vY: 0, scaleX: 1, scaleY: 1, color: '#00F2FF', wobble: 0 });
  const p2 = useRef({ x: 800, y: 0, vY: 0, scaleX: 1, scaleY: 1, color: '#FF007A', wobble: 0 });
  
  const ball = useRef({ 
    x: 500, y: 200, vX: 4, vY: 0, 
    trail: [] as {x: number, y: number, a: number}[] 
  });

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    if (!isLandscape) return;

    const canvas = canvasRef.current;
    const container = containerRef.current; // Получаем текущий элемент
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const update = () => {
      const cw = canvas.width;
      const ch = canvas.height;
      const floorY = ch - 60;

      // --- Логика слаймов ---
      [p1.current, p2.current].forEach((p, i) => {
        if (i === 0) {
          if (keys.current['KeyA']) { p.x -= SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.1) * 0.05; }
          if (keys.current['KeyD']) { p.x += SETTINGS.speed; p.wobble = Math.sin(Date.now() * 0.1) * 0.05; }
          if (keys.current['KeyW'] && p.y === 0) p.vY = SETTINGS.jumpForce;
        }

        p.vY += SETTINGS.gravity;
        p.y += p.vY;

        if (p.y > 0) {
          if (p.vY > 2) { 
            p.scaleY = 0.6;
            p.scaleX = 1.3;
          }
          p.y = 0;
          p.vY = 0;
        }

        p.scaleX += (1 - p.scaleX) * 0.15;
        p.scaleY += (1 - p.scaleY) * 0.15;

        if (p.y < 0) {
          p.scaleY = 1 + Math.abs(p.vY) * 0.03;
          p.scaleX = 1 - Math.abs(p.vY) * 0.02;
        }

        const margin = SETTINGS.slimeRadius;
        if (i === 0) p.x = Math.max(margin, Math.min(cw/2 - margin - 10, p.x));
        else p.x = Math.max(cw/2 + margin + 10, Math.min(cw - margin, p.x));
      });

      // --- Логика мяча ---
      const b = ball.current;
      b.vY = Math.min(b.vY + SETTINGS.gravity * 0.7, SETTINGS.terminalVelocity);
      b.x += b.vX;
      b.y += b.vY;

      b.trail.push({ x: b.x, y: b.y, a: 1 });
      if (b.trail.length > 15) b.trail.shift();
      b.trail.forEach(t => t.a *= 0.85);

      if (b.x < SETTINGS.ballRadius || b.x > cw - SETTINGS.ballRadius) {
        b.vX *= -0.8;
        b.x = b.x < SETTINGS.ballRadius ? SETTINGS.ballRadius : cw - SETTINGS.ballRadius;
      }

      const netX = cw / 2;
      if (b.y > floorY - SETTINGS.netHeight && Math.abs(b.x - netX) < SETTINGS.ballRadius + 5) {
        b.vX *= -0.8;
        b.x = b.x < netX ? netX - 20 : netX + 20;
      }

      [p1.current, p2.current].forEach(p => {
        const dx = b.x - p.x;
        const dy = b.y - (floorY - p.y - 10);
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < SETTINGS.slimeRadius + SETTINGS.ballRadius) {
          const angle = Math.atan2(dy, dx);
          const impactSpeed = Math.sqrt(b.vX * b.vX + b.vY * b.vY);
          const finalSpeed = Math.max(impactSpeed + 1, 9);
          
          b.vX = Math.cos(angle) * finalSpeed;
          b.vY = Math.sin(angle) * finalSpeed;
          
          p.scaleY = 0.8;
          p.scaleX = 1.2;
        }
      });

      if (b.y > floorY) {
        if (b.x < cw/2) setScore(s => ({ ...s, p2: s.p2 + 1 }));
        else setScore(s => ({ ...s, p1: s.p1 + 1 }));
        b.x = b.x < cw/2 ? cw * 0.75 : cw * 0.25;
        b.y = 100;
        b.vX = 0; b.vY = 0;
      }

      // --- Отрисовка ---
      ctx.clearRect(0, 0, cw, ch);
      
      const grad = ctx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, '#0f0c29');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 4;
      ctx.setLineDash([5, 10]);
      ctx.beginPath();
      ctx.moveTo(cw/2, floorY);
      ctx.lineTo(cw/2, floorY - SETTINGS.netHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      [p1.current, p2.current].forEach(p => {
        ctx.save();
        ctx.translate(p.x, floorY - p.y);
        ctx.scale(p.scaleX + p.wobble, p.scaleY - p.wobble);
        
        const sGrad = ctx.createRadialGradient(0, -20, 0, 0, -20, 50);
        sGrad.addColorStop(0, p.color);
        sGrad.addColorStop(1, '#000');
        ctx.fillStyle = sGrad;
        ctx.shadowBlur = 25;
        ctx.shadowColor = p.color;
        
        ctx.beginPath();
        ctx.arc(0, 0, SETTINGS.slimeRadius, Math.PI, 0);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(-15, -25, 6, 0, Math.PI * 2);
        ctx.arc(15, -25, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(-15 + (b.x - p.x)*0.02, -25 + (b.y - (floorY-p.y))*0.02, 3, 0, Math.PI * 2);
        ctx.arc(15 + (b.x - p.x)*0.02, -25 + (b.y - (floorY-p.y))*0.02, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      });

      b.trail.forEach(t => {
        ctx.fillStyle = `rgba(255, 255, 255, ${t.a * 0.3})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, SETTINGS.ballRadius * t.a, 0, Math.PI*2);
        ctx.fill();
      });
      
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#fff';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, SETTINGS.ballRadius, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(update);
    };

    // Исправлено: используем актуальные размеры из container.clientWidth/Height
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    raf = requestAnimationFrame(update);

    return () => cancelAnimationFrame(raf);
  }, [isLandscape]);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden">
      <AnimatePresence>
        {!isLandscape && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#0A0A0F] z-[60] flex flex-col items-center justify-center text-white p-10 text-center"
          >
            <motion.div
              animate={{ rotate: 90 }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
              className="w-16 h-28 border-4 border-white rounded-2xl mb-8 flex items-center justify-center"
            >
              <div className="w-1 h-4 bg-white rounded-full mb-1" />
            </motion.div>
            <h2 className="text-2xl font-black mb-2 uppercase tracking-tighter">Поверни экран</h2>
            <p className="text-gray-400 text-sm">Для игры в волейбол нужен альбомный режим</p>
          </motion.div>
        )}
      </AnimatePresence>

      {isLandscape && (
        <div className="relative w-full h-full">
          <canvas ref={canvasRef} className="w-full h-full block" />
          
          <div className="absolute top-6 left-10 flex gap-10 items-center pointer-events-none">
            <div className="text-5xl font-black italic text-white opacity-20">{score.p1} : {score.p2}</div>
          </div>

          <button 
            onClick={() => navigate(-1)}
            className="absolute top-6 right-6 px-4 py-2 bg-white/10 rounded-full text-[10px] font-bold text-white border border-white/20 uppercase tracking-widest"
          >
            Exit
          </button>

          <div className="absolute bottom-6 left-10 flex gap-4">
            <button 
              onPointerDown={() => { keys.current['KeyA'] = true; }}
              onPointerUp={() => { keys.current['KeyA'] = false; }}
              className="w-20 h-20 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center text-3xl active:bg-cyan-500/20 active:border-cyan-500 transition-all select-none"
            >←</button>
            <button 
              onPointerDown={() => { keys.current['KeyD'] = true; }}
              onPointerUp={() => { keys.current['KeyD'] = false; }}
              className="w-20 h-20 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center text-3xl active:bg-cyan-500/20 active:border-cyan-500 transition-all select-none"
            >→</button>
          </div>
          
          <button 
            onPointerDown={() => { keys.current['KeyW'] = true; }}
            onPointerUp={() => { keys.current['KeyW'] = false; }}
            className="absolute bottom-6 right-10 w-24 h-24 bg-pink-500/10 rounded-full border-2 border-pink-500/50 flex items-center justify-center font-black text-pink-500 active:scale-90 transition-all select-none"
          >JUMP</button>
        </div>
      )}
    </div>
  );
};