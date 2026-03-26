import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// --- НАСТРОЙКИ ---
const SETTINGS = {
  physics: {
    maxSpeed: 8.5,       // В 2 раза быстрее (было 4.2)
    accel: 0.22,         // Ускорение выше для динамики (было 0.09)
    friction: 0.98,      // Чуть меньше трения для наката
    driftFactor: 0.90,   // Чуть более выраженный дрифт
    turnSpeed: 0.05,     
    wallFriction: 0.7,   // Сильнее замедляет при ударе о стену на большой скорости
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

export const RaceGame: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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
  }, []);

  const getDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    const cx = x1 + t * (x2 - x1); const cy = y1 + t * (y2 - y1);
    return { d: Math.sqrt((px - cx)**2 + (py - cy)**2), nx: px - cx, ny: py - cy };
  };

  useEffect(() => {
    // Убираем скролл на странице
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    buildTrack();
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext('2d')) return;
    const ctx = canvas.getContext('2d')!;

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
          setDelta({
            val: (diff > 0 ? "+" : "") + diff.toFixed(2),
            color: diff <= 0 ? "#2ecc71" : "#e74c3c"
          });
        }
      }

      if (j.active) {
        const sAngle = Math.atan2(j.inputY, j.inputX);
        const diff = Math.atan2(Math.sin(sAngle - c.angle), Math.cos(sAngle - c.angle));
        if (Math.abs(diff) < Math.PI / 1.5) c.speed += SETTINGS.physics.accel;
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
          timing.current.best = elapsed;
          setBestLap(elapsed);
        }
        setLap(l => l + 1);
        timing.current.start = Date.now();
        setTimeout(() => c.passedFinish = false, 2000);
      }

      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      ctx.save();
      ctx.translate(canvas.width / 2 - c.x, canvas.height / 2 - c.y);

      ctx.fillStyle = '#1b4d1b'; ctx.fillRect(c.x-2000, c.y-2000, 4000, 4000);

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
            ctx.stroke();
            dash++;
          }
        }
      }
      drawCurbs(SETTINGS.visual.trackWidth/2); drawCurbs(-SETTINGS.visual.trackWidth/2);

      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = SETTINGS.visual.trackWidth;
      ctx.beginPath(); st.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();

      ctx.save();
      const sNode = TRACK_NODES[0];
      const nextNode = TRACK_NODES[1];
      const angle = Math.atan2(nextNode.x - sNode.x, nextNode.y - sNode.y);
      ctx.translate(sNode.x, sNode.y);
      ctx.rotate(angle + Math.PI/2);
      const fWidth = SETTINGS.visual.trackWidth; 
      for(let r=0; r<2; r++) {
        for(let col=0; col < fWidth/15; col++) {
          ctx.fillStyle = (r+col)%2 === 0 ? '#fff' : '#000';
          ctx.fillRect(r*15 - 15, col*15 - fWidth/2, 15, 15);
        }
      }
      ctx.restore();

      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(-18, -10, 36, 20); 
      ctx.fillStyle = '#333'; ctx.fillRect(4, -8, 8, 16); 
      ctx.restore();

      ctx.restore();
      if(raf % 5 === 0) setSpeed(Math.floor(Math.abs(c.speed) * 42));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      // Возвращаем скролл при уходе со страницы
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
    };
  }, [buildTrack]);

  const handleJoystick = (e: any, type: string) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left; const y = clientY - rect.top;

    if (type === 'start') { 
      joystick.current.active = true; 
      joystick.current.startX = x; 
      joystick.current.startY = y; 
    }
    else if (type === 'move' && joystick.current.active) {
      const dx = x - joystick.current.startX; 
      const dy = y - joystick.current.startY;
      const d = Math.sqrt(dx*dx+dy*dy); 
      const lim = 50;
      joystick.current.visualX = (dx/d) * Math.min(d, lim);
      joystick.current.visualY = (dy/d) * Math.min(d, lim);
      joystick.current.inputX = joystick.current.visualX / lim;
      joystick.current.inputY = joystick.current.visualY / lim;
    } else if (type === 'end') {
      // Сброс стика в центр при отпускании
      joystick.current = { 
        active: false, 
        startX: 0, 
        startY: 0, 
        visualX: 0, 
        visualY: 0, 
        inputX: 0, 
        inputY: 0 
      };
    }
  };

  return (
    <div className="fixed inset-0 bg-[#000] touch-none select-none overflow-hidden font-mono text-white">
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      <div className="absolute top-8 left-8 pointer-events-none flex flex-col gap-2">
        <div className="text-8xl font-black italic tracking-tighter">{speed}</div>
        <div className="text-xs opacity-50 uppercase tracking-[0.5em] mb-4">KMH</div>
        
        <div className="flex flex-col gap-1 border-l-4 border-red-600 pl-4">
          <div className="text-xl font-bold">LAP {lap || 1}</div>
          <div className="text-4xl font-bold tracking-tight">
            {currentLapTime.toFixed(2)}s
          </div>
          {delta && (
            <div className="text-xl font-bold" style={{ color: delta.color }}>
              {delta.val}s
            </div>
          )}
          {bestLap && <div className="text-sm opacity-40 mt-2">BEST: {bestLap.toFixed(2)}s</div>}
        </div>
      </div>

      <button 
        onClick={() => navigate('/')} 
        className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors z-10"
      >
        EXIT
      </button>

      <div 
        className="absolute bottom-16 right-16 w-32 h-32 rounded-full bg-white/5 border-2 border-white/10 backdrop-blur-md flex items-center justify-center"
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