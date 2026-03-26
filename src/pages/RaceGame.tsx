import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// --- НАСТРОЙКИ ---
const SETTINGS = {
  physics: {
    maxSpeed: 8.5,
    accel: 0.22,
    friction: 0.98,
    driftFactor: 0.90,
    turnSpeed: 0.05,
    wallFriction: 0.7,
  },
  visual: {
    trackWidth: 160,
    curbWidth: 14,
    curbLen: 25,
    finishLineHeight: 30 
  }
};

const TRACK_NODES = [
  { x: 400, y: 800 }, { x: 1400, y: 800 }, { x: 1900, y: 1100 }, 
  { x: 2400, y: 800 }, { x: 2400, y: 200 }, { x: 1900, y: -200 }, 
  { x: 1400, y: 100 }, { x: 1100, y: -100 }, { x: 800, y: 200 },
  { x: 400, y: 0 }, { x: -200, y: -200 }, { x: -500, y: 200 },
  { x: -200, y: 600 }, { x: 100, y: 900 }
];

type Decor = { x: number, y: number, type: 'tree' | 'stand' | 'light' | 'tent', size: number, angle?: number };
type Particle = { x: number, y: number, life: number, size: number };

export const RaceGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [speed, setSpeed] = useState(0);
  const [lap, setLap] = useState(0);
  const [currentLapTime, setCurrentLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [delta, setDelta] = useState<{ val: string, color: string } | null>(null);

  const car = useRef({
    x: TRACK_NODES[0].x, y: TRACK_NODES[0].y,
    angle: 0, speed: 0, vX: 0, vY: 0,
    passedFinish: false
  });

  const joystick = useRef({ active: false, inputX: 0, inputY: 0, visualX: 0, visualY: 0, startX: 0, startY: 0 });
  const timing = useRef({ start: 0, best: null as number | null });
  const smoothTrack = useRef<{x: number, y: number}[]>([]);
  const decorations = useRef<Decor[]>([]);
  const particles = useRef<Particle[]>([]);

  const generateDecor = useCallback((track: {x: number, y: number}[]) => {
    const items: Decor[] = [];
    track.forEach((p, i) => {
      if (i % 8 !== 0) return;
      const p2 = track[(i + 1) % track.length];
      const angle = Math.atan2(p2.y - p.y, p2.x - p.x);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const side = Math.random() > 0.5 ? 1 : -1;
      const dist = 140 + Math.random() * 100;
      const x = p.x + nx * dist * side;
      const y = p.y + ny * dist * side;

      const rand = Math.random();
      if (rand > 0.7) items.push({ x, y, type: 'tree', size: 15 + Math.random() * 25 });
      else if (rand > 0.5) items.push({ x, y, type: 'stand', size: 60, angle: angle });
      else if (rand > 0.3) items.push({ x, y, type: 'light', size: 10 });
      else items.push({ x, y, type: 'tent', size: 30 + Math.random() * 20, angle: Math.random() * Math.PI });
    });
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
    generateDecor(pts);
  }, [generateDecor]);

  const drawTree = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.fillStyle = '#0a2e0a';
    ctx.beginPath(); ctx.arc(x + 2, y + 2, size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d5a27';
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d7a36';
    ctx.beginPath(); ctx.arc(x - size/3, y - size/3, size/2, 0, Math.PI * 2); ctx.fill();
  };

  const getDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    const cx = x1 + t * (x2 - x1); const cy = y1 + t * (y2 - y1);
    return { d: Math.sqrt((px - cx)**2 + (py - cy)**2), nx: px - cx, ny: py - cy };
  };

  useEffect(() => {
    buildTrack();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    // --- БЛОКИРОВКА ЖЕСТОВ И СВОРАЧИВАНИЯ ---
    const preventAll = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };

    // Запрет контекстного меню (правая кнопка / долгий тап)
    container.addEventListener('contextmenu', preventAll);
    // Запрет скролла и pull-to-refresh
    container.addEventListener('touchstart', preventAll, { passive: false });
    container.addEventListener('touchmove', preventAll, { passive: false });
    // Запрет зума
    container.addEventListener('gesturestart', preventAll);

    let raf: number;
    timing.current.start = Date.now();

    const loop = () => {
      const c = car.current;
      const j = joystick.current;
      const now = Date.now();
      const elapsed = (now - timing.current.start) / 1000;
      setCurrentLapTime(elapsed);

      if (timing.current.best) {
        const diff = elapsed - timing.current.best;
        if (elapsed > 0.5) {
          setDelta({ val: (diff > 0 ? "+" : "") + diff.toFixed(2), color: diff <= 0 ? "#2ecc71" : "#e74c3c" });
        }
      }

      // Physics
      if (j.active) {
        const sAngle = Math.atan2(j.inputY, j.inputX);
        const diff = Math.atan2(Math.sin(sAngle - c.angle), Math.cos(sAngle - c.angle));
        if (Math.abs(diff) < Math.PI / 1.5) {
          c.speed += SETTINGS.physics.accel;
          if (Math.random() > 0.5) particles.current.push({ x: c.x, y: c.y, life: 1.0, size: 2 + Math.random() * 5 });
        }
        else c.speed *= 0.94;
        c.angle += diff * SETTINGS.physics.turnSpeed * Math.min(Math.abs(c.speed) / 3, 1);
      }
      c.speed *= SETTINGS.physics.friction;
      
      const hX = Math.cos(c.angle) * c.speed;
      const hY = Math.sin(c.angle) * c.speed;
      c.vX = c.vX * SETTINGS.physics.driftFactor + hX * (1 - SETTINGS.physics.driftFactor);
      c.vY = c.vY * SETTINGS.physics.driftFactor + hY * (1 - SETTINGS.physics.driftFactor);

      let nX = c.x + c.vX; let nY = c.y + c.vY;
      let onRoad = false; let wall = { nx: 0, ny: 0, d: 999 };
      const st = smoothTrack.current;
      for (let i = 0; i < st.length; i++) {
        const r = getDist(nX, nY, st[i].x, st[i].y, st[(i+1)%st.length].x, st[(i+1)%st.length].y);
        if (r.d < SETTINGS.visual.trackWidth / 2) { onRoad = true; break; }
        if (r.d < wall.d) wall = r;
      }

      if (onRoad) { c.x = nX; c.y = nY; }
      else {
        const mag = Math.sqrt(wall.nx**2 + wall.ny**2);
        c.x -= (wall.nx/mag) * 3; c.y -= (wall.ny/mag) * 3;
        c.vX *= SETTINGS.physics.wallFriction; c.vY *= SETTINGS.physics.wallFriction;
        c.speed *= SETTINGS.physics.wallFriction;
      }

      const fDist = Math.sqrt((c.x - TRACK_NODES[0].x)**2 + (c.y - TRACK_NODES[0].y)**2);
      if (fDist < 70 && !c.passedFinish) {
        c.passedFinish = true;
        if (timing.current.best === null || elapsed < timing.current.best) {
          timing.current.best = elapsed; setBestLap(elapsed);
        }
        setLap(l => l + 1); timing.current.start = Date.now();
        setTimeout(() => c.passedFinish = false, 2000);
      }

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Rendering
      ctx.save();
      ctx.translate(canvas.width / 2 - c.x, canvas.height / 2 - c.y);

      // Grass
      ctx.fillStyle = '#1b4d1b'; ctx.fillRect(c.x-2000, c.y-2000, 4000, 4000);

      // Light Halos
      decorations.current.filter(d => d.type === 'light').forEach(d => {
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 100);
        grad.addColorStop(0, 'rgba(255, 255, 200, 0.15)');
        grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(d.x, d.y, 100, 0, Math.PI*2); ctx.fill();
      });

      // Track & Curbs
      const drawCurbs = (side: number) => {
        let dash = 0;
        for (let i = 0; i < st.length; i++) {
          const p1 = st[i]; const p2 = st[(i+1)%st.length];
          const dx = p2.x - p1.x; const dy = p2.y - p1.y;
          const len = Math.sqrt(dx*dx+dy*dy);
          const nx = -dy/len * side; const ny = dx/len * side;
          ctx.lineWidth = SETTINGS.visual.curbWidth;
          for (let l = 0; l < len; l += SETTINGS.visual.curbLen) {
            ctx.strokeStyle = (dash % 2 === 0) ? '#fff' : '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(p1.x + (dx*l/len) + nx, p1.y + (dy*l/len) + ny);
            ctx.lineTo(p1.x + (dx*Math.min(l+SETTINGS.visual.curbLen, len)/len) + nx, p1.y + (dy*Math.min(l+SETTINGS.visual.curbLen, len)/len) + ny);
            ctx.stroke(); dash++;
          }
        }
      }
      drawCurbs(SETTINGS.visual.trackWidth/2); drawCurbs(-SETTINGS.visual.trackWidth/2);

      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = SETTINGS.visual.trackWidth;
      ctx.beginPath(); st.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();

      // Finish Line
      ctx.save();
      const sNode = TRACK_NODES[0]; const nextNode = TRACK_NODES[1];
      const fAngle = Math.atan2(nextNode.x - sNode.x, nextNode.y - sNode.y);
      ctx.translate(sNode.x, sNode.y); ctx.rotate(fAngle + Math.PI/2);
      for(let r=0; r<2; r++) {
        for(let col=0; col < SETTINGS.visual.trackWidth/12; col++) {
          ctx.fillStyle = (r+col)%2 === 0 ? '#fff' : '#000';
          ctx.fillRect(r*15 -15, col*15 - SETTINGS.visual.trackWidth/1.3, 15, 15);
        } 
      }
      ctx.restore();

      // Particles (Smoke)
      particles.current.forEach((p, idx) => {
        ctx.fillStyle = `rgba(255,255,255,${p.life * 0.3})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        p.life -= 0.02; p.size += 0.1;
        if (p.life <= 0) particles.current.splice(idx, 1);
      });

      // Decorations
      decorations.current.forEach(d => {
        if (d.type === 'tree') drawTree(ctx, d.x, d.y, d.size);
        if (d.type === 'stand') {
          ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.angle || 0);
          ctx.fillStyle = '#444'; ctx.fillRect(-40, -15, 80, 30);
          ctx.fillStyle = '#666'; ctx.fillRect(-40, -10, 80, 5); ctx.restore();
        }
        if (d.type === 'light') {
          ctx.fillStyle = '#333'; ctx.fillRect(d.x-2, d.y-2, 4, 4);
          ctx.fillStyle = '#ffffaa'; ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, Math.PI*2); ctx.fill();
        }
      });

      // --- CAR MODEL ---
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
      const drawHeadlight = (offsetY: number) => {
        const lightGrad = ctx.createRadialGradient(25, offsetY, 0, 160, offsetY, 100);
        lightGrad.addColorStop(0, 'rgba(255, 255, 230, 0.4)');
        lightGrad.addColorStop(1, 'rgba(255, 255, 230, 0)');
        ctx.fillStyle = lightGrad;
        ctx.beginPath(); ctx.moveTo(20, offsetY);
        ctx.arc(20, offsetY, 180, -Math.PI / 7, Math.PI / 7); ctx.fill();
      };
      drawHeadlight(-8); drawHeadlight(8);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-18, -10, 38, 22); 
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(-20, -11, 40, 22); 
      ctx.fillStyle = '#d35400'; ctx.fillRect(-5, -11, 15, 3); ctx.fillRect(-5, 8, 15, 3); 
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(13, -7); ctx.lineTo(13, 7); ctx.lineTo(2, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(18, -10, 3, 5); ctx.fillRect(18, 5, 3, 5);
      ctx.fillStyle = c.speed < 0 ? '#ff3333' : '#770000';
      ctx.fillRect(-21, -10, 2, 5); ctx.fillRect(-21, 5, 2, 5);
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(-22, -11, 5, 22);
      ctx.restore();
      ctx.restore();

      if(raf % 5 === 0) setSpeed(Math.floor(Math.abs(c.speed) * 42));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('touchstart', preventAll);
      container.removeEventListener('touchmove', preventAll);
      container.removeEventListener('contextmenu', preventAll);
      container.removeEventListener('gesturestart', preventAll);
    };
  }, [buildTrack]);

  const handleJoystick = (e: any, type: string) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left; const y = clientY - rect.top;

    if (type === 'start') { 
      joystick.current.active = true; joystick.current.startX = x; joystick.current.startY = y; 
    } else if (type === 'move' && joystick.current.active) {
      const dx = x - joystick.current.startX; const dy = y - joystick.current.startY;
      const d = Math.max(1, Math.sqrt(dx*dx+dy*dy)); const lim = 50;
      joystick.current.visualX = (dx/d) * Math.min(d, lim);
      joystick.current.visualY = (dy/d) * Math.min(d, lim);
      joystick.current.inputX = joystick.current.visualX / lim;
      joystick.current.inputY = joystick.current.visualY / lim;
    } else if (type === 'end') {
      joystick.current = { active: false, startX: 0, startY: 0, visualX: 0, visualY: 0, inputX: 0, inputY: 0 };
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-[calc(100vh-164px)] bg-[#0A0A0F] touch-none select-none overflow-hidden font-mono text-white"
      style={{ 
        touchAction: 'none', 
        overscrollBehavior: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block" 
        style={{ touchAction: 'none' }} 
      />
      
      <div className="absolute top-6 left-6 pointer-events-none flex flex-col">
        <div className="text-7xl font-black italic tracking-tighter leading-none">{speed}</div>
        <div className="text-xs opacity-50 uppercase tracking-[0.3em] mt-1">KMH</div>
        <div className="mt-4 flex flex-col gap-0 border-l-4 border-yellow-500 pl-4">
          <div className="text-sm font-bold opacity-70 uppercase">Lap {lap || 1}</div>
          <div className="text-3xl font-bold tracking-tight">{currentLapTime.toFixed(2)}s</div>
          {delta && <div className="text-xl font-bold" style={{ color: delta.color }}>{delta.val}s</div>}
          {bestLap && <div className="text-[10px] opacity-40 mt-1 uppercase">Best: {bestLap.toFixed(2)}s</div>}
        </div>
      </div>

      <button onClick={() => navigate('/')} className="absolute top-6 right-6 text-white/30 hover:text-white border border-white/10 bg-white/5 px-4 py-2 rounded-sm text-xs backdrop-blur-md z-10">
        EXIT
      </button>

      <div 
        className="absolute bottom-24 right-10 w-32 h-32 rounded-full bg-white/5 border-2 border-white/10 backdrop-blur-md flex items-center justify-center z-50"
        onMouseDown={(e) => handleJoystick(e, 'start')} 
        onMouseMove={(e) => handleJoystick(e, 'move')} 
        onMouseUp={() => handleJoystick(null, 'end')}
        onTouchStart={(e) => handleJoystick(e, 'start')} 
        onTouchMove={(e) => handleJoystick(e, 'move')} 
        onTouchEnd={() => handleJoystick(null, 'end')}
      >
        <div 
          className="w-14 h-14 bg-white rounded-full shadow-2xl pointer-events-none" 
          style={{ 
            transform: `translate(${joystick.current.visualX}px, ${joystick.current.visualY}px)`, 
            transition: joystick.current.active ? 'none' : 'transform 0.15s ease-out' 
          }} 
        />
      </div>
    </div>
  );
};