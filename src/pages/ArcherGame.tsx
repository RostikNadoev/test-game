import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Player { x: number; y: number; hp: number; color: string; }
interface Particle { x: number; y: number; vx: number; vy: number; alpha: number; color: string; size: number; life: number; }
interface WindStreak { x: number; y: number; len: number; speed: number; }

const SETTINGS = {
  gravity: 0.018, 
  groundY: 100,
  playerSize: 50,
  maxPower: 12,
  worldWidth: 3000,
  maxHP: 3,
};

export const ArcherGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [turn, setTurn] = useState<1 | 2>(1);
  const [p1, setP1] = useState<Player>({ x: 400, y: 0, hp: 3, color: '#FF3B3B' });
  const [p2, setP2] = useState<Player>({ x: 2600, y: 0, hp: 3, color: '#3B82FF' });
  const [wind, setWind] = useState(0);
  const [winner, setWinner] = useState<number | null>(null);

  const projectile = useRef({ x: 0, y: 0, vx: 0, vy: 0, active: false, angle: 0, landed: false });
  const camera = useRef({ x: 0, targetX: 0, shake: 0 });
  const drag = useRef({ active: false, startX: 0, startY: 0, currX: 0, currY: 0 });
  const particles = useRef<Particle[]>([]);
  const windStreaks = useRef<WindStreak[]>([]); // Для визуализации ветра
  
  const grassBlades = useRef<{x: number, h: number, offset: number, color: string}[]>([]);
  const trees = useRef<{ x: number, s: number }[]>([]);

  useEffect(() => {
    // Инициализация травы и деревьев
    const blades = [];
    for (let i = 0; i < SETTINGS.worldWidth; i += 4) {
      blades.push({
        x: i, h: 6 + Math.random() * 10, offset: Math.random() * Math.PI * 2,
        color: Math.random() > 0.4 ? '#10b981' : '#059669'
      });
    }
    grassBlades.current = blades;
    trees.current = Array.from({ length: 20 }, () => ({
      x: Math.random() * SETTINGS.worldWidth, s: 0.6 + Math.random() * 1.0
    }));

    // Инициализация линий ветра
    windStreaks.current = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * (window.innerHeight - 200),
      len: 20 + Math.random() * 40,
      speed: 0.5 + Math.random() * 2
    }));

    updateWind();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const resize = () => {
      canvas.width = containerRef.current!.clientWidth;
      canvas.height = containerRef.current!.clientHeight;
      const groundPos = (x: number) => canvas.height - SETTINGS.groundY - SETTINGS.playerSize + Math.sin(x/300)*20;
      setP1(p => ({ ...p, y: groundPos(p.x) }));
      setP2(p => ({ ...p, y: groundPos(p.x) }));
    };

    window.addEventListener('resize', resize);
    resize();

    let raf: number;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Камера
      if (projectile.current.active) {
        camera.current.targetX = projectile.current.x - w / 2;
      } else if (!projectile.current.landed) {
        camera.current.targetX = (turn === 1 ? p1.x : p2.x) - w / 2;
      }
      camera.current.targetX = Math.max(0, Math.min(camera.current.targetX, SETTINGS.worldWidth - w));
      const camLerp = projectile.current.active ? 0.2 : 0.03; 
      camera.current.x += (camera.current.targetX - camera.current.x) * camLerp;

      // Фон
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#020617'); skyGrad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      drawMoon(ctx, w);
      drawWindVisuals(ctx, w, h); // Рендерим визуальный ветер

      ctx.save();
      ctx.translate(-camera.current.x + (Math.random() - 0.5) * camera.current.shake, 0);
      if (camera.current.shake > 0) camera.current.shake *= 0.85;

      drawHills(ctx, h);
      [p1, p2].forEach(p => drawStylizedPlayer(ctx, p));

      if (drag.current.active && !projectile.current.active) {
        drawAimSystem(ctx, turn === 1 ? p1 : p2, h);
      }

      if (projectile.current.active) {
        const pr = projectile.current;
        pr.vx += wind * 0.01; // Увеличил влияние ветра для заметности
        pr.x += pr.vx; pr.vy += SETTINGS.gravity; pr.y += pr.vy;
        pr.angle = Math.atan2(pr.vy, pr.vx);
        drawSpear(ctx, pr.x, pr.y, pr.angle);
        const target = turn === 1 ? p2 : p1;
        if (checkCollision(pr.x, pr.y, target)) handleImpact(pr, true);
        else if (pr.y > h - SETTINGS.groundY + Math.sin(pr.x/300)*20 + 30 || pr.x < 0 || pr.x > SETTINGS.worldWidth) handleImpact(pr, false);
      }

      updateParticles(ctx);
      drawLushGrass(ctx, h);
      ctx.restore();
      raf = requestAnimationFrame(render);
    };

    const drawWindVisuals = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      windStreaks.current.forEach(s => {
        // Движение линий. Скорость зависит от wind
        s.x += wind * 200 + (wind > 0 ? s.speed : -s.speed);
        if (s.x > w) s.x = -s.len;
        if (s.x < -s.len) s.x = w;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.len, s.y + Math.sin(s.x * 0.01) * 2);
        ctx.stroke();
      });
      ctx.restore();
    };

    const drawMoon = (ctx: CanvasRenderingContext2D, w: number) => {
      ctx.save();
      const mx = w / 2;
      const my = 120;
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mx, my, 80, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 20; ctx.shadowColor = 'white';
      ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const drawHills = (ctx: CanvasRenderingContext2D, h: number) => {
      ctx.fillStyle = '#161e2e';
      trees.current.forEach(t => {
        ctx.beginPath();
        ctx.moveTo(t.x, h - SETTINGS.groundY);
        ctx.lineTo(t.x + 25 * t.s, h - SETTINGS.groundY - 140 * t.s);
        ctx.lineTo(t.x + 50 * t.s, h - SETTINGS.groundY);
        ctx.fill();
      });
      const hillGrad = ctx.createLinearGradient(0, h - SETTINGS.groundY, 0, h);
      hillGrad.addColorStop(0, '#064e3b'); hillGrad.addColorStop(1, '#022c22');
      ctx.fillStyle = hillGrad;
      ctx.beginPath(); ctx.moveTo(0, h);
      for(let x = 0; x <= SETTINGS.worldWidth; x += 10) ctx.lineTo(x, h - SETTINGS.groundY + Math.sin(x/300)*20);
      ctx.lineTo(SETTINGS.worldWidth, h); ctx.fill();
    };

    const drawAimSystem = (ctx: CanvasRenderingContext2D, p: Player, h: number) => {
      const dx = (drag.current.startX - drag.current.currX);
      const dy = (drag.current.startY - drag.current.currY);
      const powerPct = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 250);
      const angleDeg = Math.round(Math.atan2(dy, turn === 1 ? dx : -dx) * (180 / Math.PI) * -1);

      // Прогноз траектории
      ctx.save();
      let tx = p.x + 25, ty = p.y + 25;
      let tvx = Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dx * 0.05));
      let tvy = Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dy * 0.05));
      for (let i = 0; i < 80; i++) {
        if (i % 3 === 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * (1 - i/80)})`;
          ctx.beginPath(); ctx.arc(tx, ty, 3 * (1 - i/80), 0, Math.PI * 2); ctx.fill();
        }
        tvx += wind * 0.01; tvy += SETTINGS.gravity; tx += tvx; ty += tvy;
        if (ty > h - SETTINGS.groundY + Math.sin(tx/300)*20) break;
      }
      ctx.restore();

      // Шкала силы (поднята)
      const bx = turn === 1 ? p.x - 60 : p.x + SETTINGS.playerSize + 45;
      const by = p.y - 150; 
      const bw = 24, bh = 200;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 4) : ctx.rect(bx, by, bw, bh); ctx.fill();
      ctx.fillStyle = powerPct > 0.8 ? '#ef4444' : '#fbbf24';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx + 4, by + bh - (bh*powerPct) + 4, bw - 8, (bh*powerPct) - 8, 2) : ctx.rect(bx + 4, by + bh - (bh*powerPct) + 4, bw - 8, (bh*powerPct) - 8); ctx.fill();
      
      ctx.fillStyle = 'white'; ctx.font = '900 32px Montserrat'; ctx.textAlign = 'center';
      ctx.fillText(`${angleDeg}°`, p.x + 25, p.y - 45);
    };

   const drawStylizedPlayer = (ctx: CanvasRenderingContext2D, p: Player) => {
      ctx.save();
      // Тело и голова
      ctx.shadowBlur = 20; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x + 10, p.y + 15, 30, 35, 12) : ctx.rect(p.x + 10, p.y + 15, 30, 35); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 25, p.y + 5, 14, 0, Math.PI * 2); ctx.fill();
      
      // ГЛАЗА
      ctx.shadowBlur = 0; // Убираем свечение для глаз
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const lookDir = p.x < SETTINGS.worldWidth / 2 ? 4 : -4; // Смотрим к центру поля
      ctx.beginPath();
      ctx.arc(p.x + 25 + lookDir, p.y + 3, 2.5, 0, Math.PI * 2); // Первый глаз
      ctx.arc(p.x + 25 + lookDir + (lookDir > 0 ? 6 : -6), p.y + 3, 2.5, 0, Math.PI * 2); // Второй глаз
      ctx.fill();
      
      ctx.restore();
    };

    const drawLushGrass = (ctx: CanvasRenderingContext2D, h: number) => {
      const time = Date.now() * 0.0025;
      grassBlades.current.forEach(b => {
        if (b.x < camera.current.x - 100 || b.x > camera.current.x + ctx.canvas.width + 100) return;
        const groundPos = h - SETTINGS.groundY + Math.sin(b.x/300)*20;
        ctx.strokeStyle = b.color; ctx.beginPath(); ctx.moveTo(b.x, groundPos);
        ctx.quadraticCurveTo(b.x, groundPos - b.h, b.x + Math.sin(time + b.offset) * 4 + (wind * 20), groundPos - b.h); ctx.stroke();
      });
    };

    const drawSpear = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(15, -8); ctx.lineTo(15, 8); ctx.fill();
      ctx.restore();
    };

    const handleImpact = (pr: any, isHit: boolean) => {
      pr.active = false; pr.landed = true;
      if (isHit) {
        camera.current.shake = 40; createExplosion(pr.x, pr.y, '#ff0000', 70, true);
        if (turn === 1) setP2(p => ({ ...p, hp: Math.max(0, p.hp - 1) }));
        else setP1(p => ({ ...p, hp: Math.max(0, p.hp - 1) }));
      } else {
        createExplosion(pr.x, pr.y, '#fbbf24', 15, false); // Искры земли
      }
      setTimeout(() => {
        if (p1.hp <= 0 || p2.hp <= 0) return;
        pr.landed = false; setTurn(t => t === 1 ? 2 : 1); updateWind();
      }, 2500);
    };

    const checkCollision = (x: number, y: number, t: Player) => x > t.x && x < t.x + 50 && y > t.y && y < t.y + 50;
    
    const createExplosion = (x: number, y: number, color: string, count: number, isBlood: boolean) => {
      for (let i = 0; i < count; i++) {
        particles.current.push({ x, y, color, size: isBlood ? Math.random() * 6 + 2 : Math.random() * 3, vx: (Math.random() - 0.5) * (isBlood ? 7 : 12), vy: (Math.random() - 0.7) * (isBlood ? 9 : 12), alpha: 1, life: isBlood ? 0.006 : 0.02 });
      }
    };

    const updateParticles = (ctx: CanvasRenderingContext2D) => {
      particles.current.forEach((p, i) => {
        p.x += p.vx; p.vy += p.color === '#ff0000' ? 0.15 : 0.2; p.y += p.vy; p.alpha -= p.life;
        ctx.globalAlpha = Math.max(0, p.alpha); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        if (p.alpha <= 0) particles.current.splice(i, 1);
      });
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(render);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, [p1, p2, turn, wind]);

  useEffect(() => { if (p1.hp <= 0) setWinner(2); if (p2.hp <= 0) setWinner(1); }, [p1.hp, p2.hp]);
  const updateWind = () => setWind(Number((Math.random() * 0.08 - 0.04).toFixed(3)));

  const handleStart = (e: any) => {
    if (projectile.current.active || winner) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    drag.current = { active: true, startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY };
  };
  const handleMove = (e: any) => {
    if (!drag.current.active) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    drag.current.currX = t.clientX; drag.current.currY = t.clientY;
  };
  const handleEnd = () => {
    if (!drag.current.active) return;
    const dx = (drag.current.startX - drag.current.currX) * 0.05;
    const dy = (drag.current.startY - drag.current.currY) * 0.05;
    projectile.current = { x: (turn === 1 ? p1.x : p2.x) + 25, y: (turn === 1 ? p1.y : p2.y) + 25, vx: Math.max(-12, Math.min(12, dx)), vy: Math.max(-12, Math.min(12, dy)), active: true, angle: 0, landed: false };
    drag.current.active = false;
  };

  const HeartIcon = ({ filled, color }: { filled: boolean, color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" className={`transition-all duration-500 ${filled ? 'scale-110 opacity-100' : 'scale-75 opacity-20'}`}>
      <path fill={color} d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );

  return (
    <div ref={containerRef} className="w-full h-[calc(100vh-164px)] bg-[#020617] relative touch-none overscroll-none overflow-hidden select-none font-sans" style={{ touchAction: 'none' }}>
      
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <button onClick={() => navigate('/')} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-[10px] text-white/70 font-bold tracking-[0.2em] uppercase transition-all active:scale-90">Exit</button>
      </div>

      <div className="absolute inset-0 p-8 flex justify-between items-start z-10 pointer-events-none">
        {/* P1 HP */}
        <div className={`flex flex-col gap-2 transition-all duration-500 ${turn === 1 ? 'scale-110' : 'opacity-40'}`}>
          <div className="flex flex-col gap-3 bg-black/40 p-2.5 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
            {[...Array(SETTINGS.maxHP)].map((_, i) => <HeartIcon key={i} filled={p1.hp > i} color={p1.color} />)}
          </div>
        </div>

        {/* WIND INFO */}
        <div className="flex flex-col items-center gap-4 mt-44">
          <div className="bg-black/60 backdrop-blur-xl px-6 py-2.5 rounded-full border border-white/10 text-[10px] font-bold text-white tracking-[0.3em] uppercase shadow-2xl">
             WIND: {Math.abs(wind * 10000).toFixed(0)} {(wind > 0 ? '>>>' : '<<<')}
          </div>
        </div>

        {/* P2 HP */}
        <div className={`flex flex-col items-end gap-2 transition-all duration-500 ${turn === 2 ? 'scale-110' : 'opacity-40'}`}>
          <div className="flex flex-col gap-3 bg-black/40 p-2.5 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
            {[...Array(SETTINGS.maxHP)].map((_, i) => <HeartIcon key={i} filled={p2.hp > i} color={p2.color} />)}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd} className="w-full h-full cursor-crosshair" />

      {winner && (
        <div className="absolute inset-0 bg-slate-950/98 flex flex-col items-center justify-center z-50 p-6 text-center animate-in fade-in duration-700">
          <h2 className="text-[7rem] font-black text-white italic tracking-tighter mb-12">{winner === 1 ? 'RED' : 'BLUE'} WIN</h2>
          <button onClick={() => window.location.reload()} className="px-12 py-4 bg-white text-black font-black rounded-xl uppercase tracking-widest hover:invert transition-all">Rematch</button>
        </div>
      )}
    </div>
  );
};