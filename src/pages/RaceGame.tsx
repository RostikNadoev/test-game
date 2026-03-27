import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SETTINGS = {
  physics: {
    maxSpeed: 9,
    accel: 0.2,
    friction: 0.985,
    driftFactor: 0.96,
    turnSpeed: 0.08,
    wallFriction: 0.45,
    turnResistance: 0.95,
  },
  visual: {
    trackWidth: 155,
    curbWidth: 16,
    curbLen: 28,
  }
};

const TRACK_NODES = [
  { x: 400, y: 800 }, { x: 1800, y: 800 }, 
  { x: 2400, y: 1400 }, { x: 3400, y: 1400 }, 
  { x: 3800, y: 1900 }, { x: 3200, y: 2400 }, { x: 4200, y: 2800 }, 
  { x: 5500, y: 2200 }, { x: 6000, y: 800 }, 
  { x: 6200, y: 0 }, { x: 5500, y: -600 }, { x: 6500, y: -1000 }, 
  { x: 5000, y: -2000 }, { x: 3500, y: -1800 }, 
  { x: 2500, y: -2500 }, { x: 1000, y: -2000 }, 
  { x: 200, y: -1000 }, { x: -800, y: -1500 }, { x: -1500, y: -500 }, 
  { x: -800, y: 800 }, { x: 0, y: 800 } 
];

type Decor = { 
  x: number, y: number, type: 'tree' | 'stand' | 'light' | 'tent' | 'yacht' | 'ads' | 'bush' | 'bench'; 
  size: number, angle: number, color?: string, detail?: number 
};

export const RaceGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [lap, setLap] = useState(0);
  const [currentLapTime, setCurrentLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [delta, setDelta] = useState<{ val: string, color: string } | null>(null);

  const car = useRef({ x: 400, y: 800, angle: 0, speed: 0, vX: 0, vY: 0, passedFinish: false });
  const joystick = useRef({ active: false, inputX: 0, inputY: 0, visualX: 0, visualY: 0, startX: 0, startY: 0 });
  const timing = useRef({ start: Date.now(), best: null as number | null });
  const smoothTrack = useRef<{x: number, y: number}[]>([]);
  const decorations = useRef<Decor[]>([]);
  const particles = useRef<{x: number, y: number, life: number, size: number}[]>([]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length > 1 || (e.target as HTMLElement).closest('.touch-none')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const generateWorld = useCallback((track: {x: number, y: number}[]) => {
    const items: Decor[] = [];
    // Зона безопасности: половина ширины трассы + запас, чтобы не стоять на обочине
    const roadSafeRadius = (SETTINGS.visual.trackWidth / 2) + 25;

    const isTooCloseToTrack = (x: number, y: number) => {
      for (let i = 0; i < track.length; i++) {
        const p1 = track[i], p2 = track[(i + 1) % track.length];
        const res = getDist(x, y, p1.x, p1.y, p2.x, p2.y);
        if (res.d < roadSafeRadius) return true;
      }
      return false;
    };

    const isColliding = (x: number, y: number, minSpace: number) => {
      return items.some(item => Math.hypot(item.x - x, item.y - y) < minSpace);
    };

    const addDecor = (x: number, y: number, type: Decor['type'], size: number, angle = 0, minSpace = 40) => {
      if (!isTooCloseToTrack(x, y) && !isColliding(x, y, minSpace)) {
        items.push({ x, y, type, size, angle, detail: Math.random() });
      }
    };

    track.forEach((p, i) => {
      // Генерируем чаще
      if (i % 2 !== 0) return;
      
      const p2 = track[(i + 1) % track.length];
      const angle = Math.atan2(p2.y - p.y, p2.x - p.x);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const side = i % 4 === 0 ? 1 : -1;

      // Рекламные щиты и трибуны (ближе к трассе)
      if (i % 12 === 0) {
        addDecor(p.x + nx * 110 * side, p.y + ny * 110 * side, 'ads', 60, angle + Math.PI/2, 100);
      }
      if (i % 20 === 0) {
        addDecor(p.x + nx * 140 * side, p.y + ny * 140 * side, 'stand', 90, angle + (side > 0 ? 0 : Math.PI), 150);
      }

      // Освещение
      if (i % 8 === 0) {
        addDecor(p.x + nx * 95 * side, p.y + ny * 95 * side, 'light', 10, 0, 80);
      }

      // Новые объекты: палатки и скамейки
      if (i % 15 === 0) {
        addDecor(p.x + nx * 160 * side, p.y + ny * 160 * side, 'tent', 40, angle, 120);
      }
      if (i % 10 === 0) {
        addDecor(p.x + nx * 105 * side, p.y + ny * 105 * side, 'bench', 25, angle + Math.PI/2, 60);
      }

      // Растительность (дальше от трассы, больше объектов)
      for (let j = 0; j < 3; j++) {
        const dist = 180 + Math.random() * 300;
        const ox = p.x + nx * dist * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 50;
        const oy = p.y + ny * dist * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 50;
        addDecor(ox, oy, Math.random() > 0.4 ? 'tree' : 'bush', 25 + Math.random() * 35, 0, 50);
      }
    });

    // Яхты в заливе (специфическая зона)
    for(let k=0; k<15; k++) {
      addDecor(2800 + Math.random() * 400, 1600 + k * 200, 'yacht', 70, Math.random() * 0.5, 120);
    }

    decorations.current = items;
  }, []);

  const buildTrack = useCallback(() => {
    let pts = [...TRACK_NODES];
    for (let j = 0; j < 3; j++) {
      const next = [];
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i]; const p2 = pts[(i + 1) % pts.length];
        next.push(
          { x: p1.x * 0.75 + p2.x * 0.25, y: p1.y * 0.75 + p2.y * 0.25 },
          { x: p1.x * 0.25 + p2.x * 0.75, y: p1.y * 0.25 + p2.y * 0.75 }
        );
      }
      pts = next;
    }
    smoothTrack.current = pts;
    generateWorld(pts);
  }, [generateWorld]);

  const getDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx*dx + dy*dy;
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return { d: Math.sqrt((px - (x1 + t * dx))**2 + (py - (y1 + t * dy))**2), nx: px - (x1 + t * dx), ny: py - (y1 + t * dy) };
  };

  useEffect(() => {
    buildTrack();
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let raf: number;
    const loop = () => {
      const c = car.current, j = joystick.current, now = Date.now();
      const elapsed = (now - timing.current.start) / 1000;
      setCurrentLapTime(elapsed);

      if (j.active) {
        const sAngle = Math.atan2(j.inputY, j.inputX);
        const diff = Math.atan2(Math.sin(sAngle - c.angle), Math.cos(sAngle - c.angle));
        c.speed *= (1 - Math.abs(diff) * (1 - SETTINGS.physics.turnResistance));
        if (Math.abs(diff) < Math.PI / 1.5) {
          c.speed += SETTINGS.physics.accel * (1 - Math.abs(diff) * 0.2);
          if (Math.random() > 0.4) particles.current.push({ x: c.x, y: c.y, life: 1.0, size: 2 + Math.random() * 4 });
        } else {
          c.speed *= 0.95;
        }
        c.angle += diff * SETTINGS.physics.turnSpeed * Math.min(Math.abs(c.speed) / 2, 1);
      }

      c.speed *= SETTINGS.physics.friction;
      if (c.speed > SETTINGS.physics.maxSpeed) c.speed = SETTINGS.physics.maxSpeed;

      const targetVX = Math.cos(c.angle) * c.speed;
      const targetVY = Math.sin(c.angle) * c.speed;
      c.vX = c.vX * SETTINGS.physics.driftFactor + targetVX * (1 - SETTINGS.physics.driftFactor);
      c.vY = c.vY * SETTINGS.physics.driftFactor + targetVY * (1 - SETTINGS.physics.driftFactor);

      let nX = c.x + c.vX, nY = c.y + c.vY;
      let onRoad = false, wall = { nx: 0, ny: 0, d: 999 };
      const st = smoothTrack.current;
      for (let i = 0; i < st.length; i++) {
        const r = getDist(nX, nY, st[i].x, st[i].y, st[(i+1)%st.length].x, st[(i+1)%st.length].y);
        if (r.d < SETTINGS.visual.trackWidth / 2) { onRoad = true; break; }
        if (r.d < wall.d) wall = r;
      }
      
      if (onRoad) { c.x = nX; c.y = nY; } 
      else {
        const mag = Math.sqrt(wall.nx**2 + wall.ny**2) || 1;
        c.x -= (wall.nx/mag) * 5; c.y -= (wall.ny/mag) * 5;
        c.vX *= SETTINGS.physics.wallFriction; c.vY *= SETTINGS.physics.wallFriction;
        c.speed *= SETTINGS.physics.wallFriction;
      }

      const finCheck = getDist(c.x, c.y, 400, 680, 400, 920);
      if (finCheck.d < 60 && !c.passedFinish && elapsed > 5) {
        c.passedFinish = true;
        if (timing.current.best) {
          const diff = elapsed - timing.current.best;
          setDelta({ val: (diff > 0 ? "+" : "") + diff.toFixed(2), color: diff <= 0 ? "#4ade80" : "#f87171" });
          setTimeout(() => setDelta(null), 3000);
        }
        if (!timing.current.best || elapsed < timing.current.best) { timing.current.best = elapsed; setBestLap(elapsed); }
        setLap(l => l + 1); 
        timing.current.start = Date.now();
        setTimeout(() => c.passedFinish = false, 2000);
      }

      canvas.width = container.clientWidth; canvas.height = container.clientHeight;
      ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0,0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2 - c.x, canvas.height / 2 - c.y);

      ctx.fillStyle = '#1a331a'; ctx.fillRect(c.x-2500, c.y-2500, 8000, 8000);
      ctx.fillStyle = '#c2b280'; ctx.fillRect(2450, -3000, 750, 8000);
      ctx.fillStyle = '#1e3799'; ctx.fillRect(2550, -3000, 600, 8000);
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(2300, 1310, 850, 180);

      const drawCurbs = (side: number) => {
        let dash = 0;
        for (let i = 0; i < st.length; i++) {
          const p1 = st[i], p2 = st[(i+1)%st.length];
          const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx*dx+dy*dy);
          const nx = -dy/len * side, ny = dx/len * side;
          ctx.lineWidth = SETTINGS.visual.curbWidth;
          for (let l = 0; l < len; l += SETTINGS.visual.curbLen) {
            ctx.strokeStyle = (dash % 2 === 0) ? '#fff' : '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(p1.x + (dx*l/len) + nx, p1.y + (dy*l/len) + ny);
            ctx.lineTo(p1.x + (dx*Math.min(l+SETTINGS.visual.curbLen, len)/len) + nx, p1.y + (dy*Math.min(l+SETTINGS.visual.curbLen, len)/len) + ny);
            ctx.stroke(); dash++;
          }
        }
      };
      drawCurbs(SETTINGS.visual.trackWidth/2); drawCurbs(-SETTINGS.visual.trackWidth/2);
      ctx.strokeStyle = '#1a1a1c'; ctx.lineWidth = SETTINGS.visual.trackWidth;
      ctx.beginPath(); st.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();

      ctx.save(); ctx.translate(400, 800);
      const ckS = 15;
      for (let r = 0; r < 2; r++) {
        for (let col = -5; col < 6; col++) {
          ctx.fillStyle = (r + col) % 2 === 0 ? '#fff' : '#000';
          ctx.fillRect(r * ckS - ckS, col * ckS, ckS, ckS);
        }
      }
      ctx.restore();

      decorations.current.forEach(d => {
        const distToCar = Math.hypot(c.x - d.x, c.y - d.y);
        if (distToCar > 1200) return;
        if (d.type === 'tree') {
          ctx.fillStyle = '#145214'; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#1e821e'; ctx.beginPath(); ctx.arc(d.x-d.size*0.3, d.y-d.size*0.3, d.size*0.6, 0, Math.PI*2); ctx.fill();
        } else if (d.type === 'stand') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
          ctx.fillStyle = '#34495e'; ctx.fillRect(-60, -25, 120, 50);
          for(let f=0; f<15; f++) {
            ctx.fillStyle = `hsl(${(f*40 + now/10)%360}, 60%, 50%)`;
            ctx.fillRect(-55+f*7.5, -18 + Math.sin(now/150+f)*4, 5, 5);
          }
          ctx.restore();
        } else if (d.type === 'light') {
          ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, Math.PI*2); ctx.fill();
          const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 60);
          g.addColorStop(0, 'rgba(241,196,15,0.15)'); g.addColorStop(1, 'transparent');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, 60, 0, Math.PI*2); ctx.fill();
        } else if (d.type === 'ads') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
          ctx.fillStyle = '#e74c3c'; ctx.fillRect(-40, -5, 80, 10);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Arial'; ctx.fillText('RACING NEXT', -35, 3);
          ctx.restore();
        } else if (d.type === 'bush') {
          ctx.fillStyle = '#2d5a27'; ctx.beginPath(); ctx.arc(d.x, d.y, d.size/2, 0, Math.PI*2); ctx.fill();
        } else if (d.type === 'tent') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
          ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(0, -20); ctx.lineTo(20, 20); ctx.fill();
          ctx.restore();
        } else if (d.type === 'bench') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
          ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-15, -5, 30, 10);
          ctx.restore();
        } else if (d.type === 'yacht') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-d.size, 0); ctx.lineTo(d.size, -d.size/3); ctx.lineTo(d.size, d.size/3); ctx.fill();
          ctx.fillStyle = '#3498db'; ctx.fillRect(d.size/4, -d.size/6, d.size/2, d.size/3);
          ctx.restore();
        }
      });

      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(-22, -12, 44, 24); 
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(4, -10, 12, 20); 
      ctx.fillStyle = '#fff'; ctx.fillRect(18, -10, 5, 6); ctx.fillRect(18, 4, 5, 6);
      ctx.restore();

      particles.current.forEach((p, idx) => {
        ctx.fillStyle = `rgba(255,255,255,${p.life * 0.3})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        p.life -= 0.03; if (p.life <= 0) particles.current.splice(idx, 1);
      });

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [buildTrack]);

  const handleJoystick = (e: any, type: string) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left, y = clientY - rect.top;
    if (type === 'start') { joystick.current.active = true; joystick.current.startX = x; joystick.current.startY = y; }
    else if (type === 'move' && joystick.current.active) {
      const dx = x - joystick.current.startX, dy = y - joystick.current.startY;
      const d = Math.max(1, Math.sqrt(dx*dx+dy*dy)), lim = 50;
      joystick.current.visualX = (dx/d) * Math.min(d, lim);
      joystick.current.visualY = (dy/d) * Math.min(d, lim);
      joystick.current.inputX = joystick.current.visualX / lim;
      joystick.current.inputY = joystick.current.visualY / lim;
    } else if (type === 'end') {
      joystick.current = { active: false, startX: 0, startY: 0, visualX: 0, visualY: 0, inputX: 0, inputY: 0 };
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-164px)] bg-[#0A0A0F] touch-none select-none overflow-hidden font-mono text-white overscroll-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute top-4 left-52 pointer-events-none">
         <div className="bg-yellow-500 text-black px-4 py-2 font-black italic text-xl skew-x-[-12deg] shadow-[4px_4px_0px_#fff] border-2 border-black">LAP {lap + 1}</div>
      </div>
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1.5">
        <div className="bg-black/80 backdrop-blur-xl p-3 border-l-[3px] border-yellow-500 shadow-2xl">
          <div className="text-[8px] opacity-70 uppercase tracking-widest text-yellow-500 font-bold">Live Session</div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-black tabular-nums tracking-tighter">{currentLapTime.toFixed(2)}s</div>
            {delta && <div className="text-lg font-black animate-pulse tabular-nums" style={{ color: delta.color }}>{delta.val}s</div>}
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-md p-2 rounded-sm border border-white/10 w-fit">
          <div className="text-[7px] opacity-50 uppercase tracking-tighter font-bold">Circuit Record</div>
          <div className="text-sm font-bold text-yellow-200">{bestLap ? bestLap.toFixed(2) + 's' : '--.--'}</div>
        </div>
      </div>
      <button onClick={() => navigate('/')} className="absolute top-4 right-4 text-white/50 border border-white/10 bg-white/5 px-3 py-1.5 rounded-sm text-[10px] backdrop-blur-md hover:bg-white/10 transition-colors">EXIT</button>
      <div className="absolute bottom-20 right-12 w-36 h-36 rounded-full bg-black/40 border-4 border-white/10 backdrop-blur-xl flex items-center justify-center z-50 shadow-[0_0_50px_rgba(0,0,0,0.5)] touch-none"
        onMouseDown={(e) => handleJoystick(e, 'start')} onMouseMove={(e) => handleJoystick(e, 'move')} onMouseUp={() => handleJoystick(null, 'end')}
        onTouchStart={(e) => handleJoystick(e, 'start')} onTouchMove={(e) => handleJoystick(e, 'move')} onTouchEnd={() => handleJoystick(null, 'end')}>
        <div className="w-16 h-16 bg-gradient-to-br from-white to-gray-400 rounded-full shadow-2xl pointer-events-none border-2 border-black/20" 
          style={{ transform: `translate(${joystick.current.visualX}px, ${joystick.current.visualY}px)`, transition: joystick.current.active ? 'none' : 'transform 0.15s' }} />
      </div>
    </div>
  );
};