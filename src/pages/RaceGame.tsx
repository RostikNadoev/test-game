import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type TrackPoint = { x: number; y: number };

type Decor = {
  x: number;
  y: number;
  type: 'tree' | 'stand' | 'light' | 'tent' | 'yacht' | 'ads' | 'bush' | 'bench';
  size: number;
  angle: number;
  detail?: number;
};

type Particle = {
  x: number;
  y: number;
  life: number;
  size: number;
};

const SETTINGS = {
  physics: {
    maxSpeed: 9,
    accel: 0.22,
    friction: 0.987,
    driftFactor: 0.972,
    turnSpeed: 0.085,
    wallFriction: 0.45,
    turnResistance: 0.93,
    steerSmoothing: 0.18,
  },
  visual: {
    trackWidth: 155,
    curbWidth: 16,
    curbLen: 28,
    decorCullDistance: 1100,
  },
  joystick: {
    radius: 50,
    visualFollow: 0.22,
    visualReturn: 0.16,
  },
  ui: {
    hudIntervalMs: 100,
  },
} as const;

const TRACK_NODES: TrackPoint[] = [
  { x: 400, y: 800 }, { x: 1800, y: 800 },
  { x: 2400, y: 1400 }, { x: 3400, y: 1400 },
  { x: 3800, y: 1900 }, { x: 3200, y: 2400 }, { x: 4200, y: 2800 },
  { x: 5500, y: 2200 }, { x: 6000, y: 800 },
  { x: 6200, y: 0 }, { x: 5500, y: -600 }, { x: 6500, y: -1000 },
  { x: 5000, y: -2000 }, { x: 3500, y: -1800 },
  { x: 2500, y: -2500 }, { x: 1000, y: -2000 },
  { x: 200, y: -1000 }, { x: -800, y: -1500 }, { x: -1500, y: -500 },
  { x: -800, y: 800 }, { x: 0, y: 800 },
];

function getDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;

  return {
    d: Math.hypot(px - cx, py - cy),
    nx: px - cx,
    ny: py - cy,
  };
}

export const RaceGame: React.FC = () => {
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [lap, setLap] = useState(0);
  const [currentLapTime, setCurrentLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [delta, setDelta] = useState<{ val: string; color: string } | null>(null);

  const car = useRef({
    x: 400,
    y: 800,
    angle: 0,
    speed: 0,
    vX: 0,
    vY: 0,
    passedFinish: false,
    steerVel: 0,
  });

  const joystick = useRef({
    active: false,
    inputX: 0,
    inputY: 0,
    visualX: 0,
    visualY: 0,
    targetVisualX: 0,
    targetVisualY: 0,
    startX: 0,
    startY: 0,
  });

  const timing = useRef({
    start: performance.now(),
    best: null as number | null,
    lastFrame: 0,
    lastHudUpdate: 0,
  });

  const viewport = useRef({
    width: 0,
    height: 0,
    dpr: 1,
  });

  const smoothTrack = useRef<TrackPoint[]>([]);
  const decorations = useRef<Decor[]>([]);
  const particles = useRef<Particle[]>([]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = container.clientWidth;
    const height = container.clientHeight;

    viewport.current = { width, height, dpr };

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }, []);

  const generateWorld = useCallback((track: TrackPoint[]) => {
    const items: Decor[] = [];
    const roadSafeRadius = SETTINGS.visual.trackWidth / 2 + 25;

    const isTooCloseToTrack = (x: number, y: number) => {
      for (let i = 0; i < track.length; i += 1) {
        const p1 = track[i];
        const p2 = track[(i + 1) % track.length];
        const res = getDist(x, y, p1.x, p1.y, p2.x, p2.y);
        if (res.d < roadSafeRadius) return true;
      }
      return false;
    };

    const isColliding = (x: number, y: number, minSpace: number) => {
      for (let i = 0; i < items.length; i += 1) {
        if (Math.hypot(items[i].x - x, items[i].y - y) < minSpace) return true;
      }
      return false;
    };

    const addDecor = (
      x: number,
      y: number,
      type: Decor['type'],
      size: number,
      angle = 0,
      minSpace = 40,
    ) => {
      if (!isTooCloseToTrack(x, y) && !isColliding(x, y, minSpace)) {
        items.push({ x, y, type, size, angle, detail: Math.random() });
      }
    };

    track.forEach((p, i) => {
      if (i % 2 !== 0) return;

      const p2 = track[(i + 1) % track.length];
      const angle = Math.atan2(p2.y - p.y, p2.x - p.x);
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const side = i % 4 === 0 ? 1 : -1;

      if (i % 12 === 0) {
        addDecor(p.x + nx * 110 * side, p.y + ny * 110 * side, 'ads', 60, angle + Math.PI / 2, 100);
      }

      if (i % 20 === 0) {
        addDecor(
          p.x + nx * 140 * side,
          p.y + ny * 140 * side,
          'stand',
          90,
          angle + (side > 0 ? 0 : Math.PI),
          150,
        );
      }

      if (i % 8 === 0) {
        addDecor(p.x + nx * 95 * side, p.y + ny * 95 * side, 'light', 10, 0, 80);
      }

      if (i % 15 === 0) {
        addDecor(p.x + nx * 160 * side, p.y + ny * 160 * side, 'tent', 40, angle, 120);
      }

      if (i % 10 === 0) {
        addDecor(p.x + nx * 105 * side, p.y + ny * 105 * side, 'bench', 25, angle + Math.PI / 2, 60);
      }

      for (let j = 0; j < 2; j += 1) {
        const dist = 180 + Math.random() * 260;
        const ox = p.x + nx * dist * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 50;
        const oy = p.y + ny * dist * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 50;
        addDecor(ox, oy, Math.random() > 0.4 ? 'tree' : 'bush', 25 + Math.random() * 35, 0, 50);
      }
    });

    for (let k = 0; k < 12; k += 1) {
      addDecor(2800 + Math.random() * 400, 1600 + k * 200, 'yacht', 70, Math.random() * 0.5, 120);
    }

    decorations.current = items;
  }, []);

  const buildTrack = useCallback(() => {
    let pts = [...TRACK_NODES];

    for (let j = 0; j < 3; j += 1) {
      const next: TrackPoint[] = [];

      for (let i = 0; i < pts.length; i += 1) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        next.push(
          { x: p1.x * 0.75 + p2.x * 0.25, y: p1.y * 0.75 + p2.y * 0.25 },
          { x: p1.x * 0.25 + p2.x * 0.75, y: p1.y * 0.25 + p2.y * 0.75 },
        );
      }

      pts = next;
    }

    smoothTrack.current = pts;
    generateWorld(pts);
  }, [generateWorld]);

  useEffect(() => {
    buildTrack();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [buildTrack, resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const drawCurbs = (track: TrackPoint[], side: number) => {
      let dash = 0;

      for (let i = 0; i < track.length; i += 1) {
        const p1 = track[i];
        const p2 = track[(i + 1) % track.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * side;
        const ny = (dx / len) * side;

        ctx.lineWidth = SETTINGS.visual.curbWidth;

        for (let l = 0; l < len; l += SETTINGS.visual.curbLen) {
          ctx.strokeStyle = dash % 2 === 0 ? '#fff' : '#e74c3c';
          ctx.beginPath();
          ctx.moveTo(p1.x + (dx * l) / len + nx, p1.y + (dy * l) / len + ny);
          ctx.lineTo(
            p1.x + (dx * Math.min(l + SETTINGS.visual.curbLen, len)) / len + nx,
            p1.y + (dy * Math.min(l + SETTINGS.visual.curbLen, len)) / len + ny,
          );
          ctx.stroke();
          dash += 1;
        }
      }
    };

    const drawDecor = (d: Decor, now: number, carX: number, carY: number) => {
      const distToCar = Math.hypot(carX - d.x, carY - d.y);
      if (distToCar > SETTINGS.visual.decorCullDistance) return;

      if (d.type === 'tree') {
        ctx.fillStyle = '#145214';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e821e';
        ctx.beginPath();
        ctx.arc(d.x - d.size * 0.3, d.y - d.size * 0.3, d.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'stand') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);

        ctx.fillStyle = '#34495e';
        ctx.fillRect(-60, -25, 120, 50);

        for (let f = 0; f < 10; f += 1) {
          ctx.fillStyle = `hsl(${(f * 40 + now / 12) % 360}, 60%, 50%)`;
          ctx.fillRect(-52 + f * 10, -14 + Math.sin(now / 180 + f) * 2, 6, 6);
        }

        ctx.restore();
      } else if (d.type === 'light') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'ads') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-40, -5, 80, 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px Arial';
        ctx.fillText('TWIN GAMES', -30, 3);
        ctx.restore();
      } else if (d.type === 'bush') {
        ctx.fillStyle = '#2d5a27';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'tent') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.moveTo(-20, 20);
        ctx.lineTo(0, -20);
        ctx.lineTo(20, 20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (d.type === 'bench') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(-15, -5, 30, 10);
        ctx.restore();
      } else if (d.type === 'yacht') {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-d.size, 0);
        ctx.lineTo(d.size, -d.size / 3);
        ctx.lineTo(d.size, d.size / 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3498db';
        ctx.fillRect(d.size / 4, -d.size / 6, d.size / 2, d.size / 3);
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      const c = car.current;
      const j = joystick.current;
      const st = smoothTrack.current;
      const vp = viewport.current;
      const t = timing.current;

      const dtMs = t.lastFrame === 0 ? 16.67 : Math.min(now - t.lastFrame, 32);
      const dt = dtMs / 16.67;
      t.lastFrame = now;

      if (now - t.lastHudUpdate >= SETTINGS.ui.hudIntervalMs) {
        const elapsed = (now - t.start) / 1000;
        setCurrentLapTime(elapsed);
        t.lastHudUpdate = now;
      }

      const stickLerp = j.active
        ? SETTINGS.joystick.visualFollow
        : SETTINGS.joystick.visualReturn;

      j.visualX += (j.targetVisualX - j.visualX) * stickLerp * dt;
      j.visualY += (j.targetVisualY - j.visualY) * stickLerp * dt;

      if (j.active) {
        const sAngle = Math.atan2(j.inputY, j.inputX);
        const diff = Math.atan2(Math.sin(sAngle - c.angle), Math.cos(sAngle - c.angle));

        c.steerVel += diff * SETTINGS.physics.steerSmoothing * dt;
        c.steerVel *= Math.pow(0.82, dt);

        c.speed *= 1 - Math.abs(diff) * (1 - SETTINGS.physics.turnResistance) * 0.45;

        if (Math.abs(diff) < Math.PI / 1.45) {
          c.speed += SETTINGS.physics.accel * dt * (1 - Math.abs(diff) * 0.12);

          if (Math.random() > 0.45 && particles.current.length < 80) {
            particles.current.push({
              x: c.x,
              y: c.y,
              life: 1,
              size: 2 + Math.random() * 3,
            });
          }
        } else {
          c.speed *= 0.985;
        }

        c.angle += (diff * SETTINGS.physics.turnSpeed + c.steerVel * 0.55) * dt * Math.min(Math.abs(c.speed) / 2.2 + 0.25, 1.15);
      } else {
        c.steerVel *= Math.pow(0.88, dt);
        c.angle += c.steerVel * 0.18 * dt;
      }

      c.speed *= Math.pow(SETTINGS.physics.friction, dt);
      if (c.speed > SETTINGS.physics.maxSpeed) c.speed = SETTINGS.physics.maxSpeed;

      const forwardVX = Math.cos(c.angle) * c.speed;
      const forwardVY = Math.sin(c.angle) * c.speed;

      c.vX = c.vX * SETTINGS.physics.driftFactor + forwardVX * (1 - SETTINGS.physics.driftFactor);
      c.vY = c.vY * SETTINGS.physics.driftFactor + forwardVY * (1 - SETTINGS.physics.driftFactor);

      const nextX = c.x + c.vX * dt;
      const nextY = c.y + c.vY * dt;

      let onRoad = false;
      let wall = { nx: 0, ny: 0, d: 999999 };

      for (let i = 0; i < st.length; i += 1) {
        const p1 = st[i];
        const p2 = st[(i + 1) % st.length];
        const r = getDist(nextX, nextY, p1.x, p1.y, p2.x, p2.y);

        if (r.d < SETTINGS.visual.trackWidth / 2) {
          onRoad = true;
          break;
        }

        if (r.d < wall.d) wall = r;
      }

      if (onRoad) {
        c.x = nextX;
        c.y = nextY;
      } else {
        const mag = Math.hypot(wall.nx, wall.ny) || 1;
        c.x -= (wall.nx / mag) * 5 * dt;
        c.y -= (wall.ny / mag) * 5 * dt;
        c.vX *= SETTINGS.physics.wallFriction;
        c.vY *= SETTINGS.physics.wallFriction;
        c.speed *= SETTINGS.physics.wallFriction;
        c.steerVel *= 0.8;
      }

      const elapsed = (now - t.start) / 1000;
      const finCheck = getDist(c.x, c.y, 400, 680, 400, 920);

      if (finCheck.d < 60 && !c.passedFinish && elapsed > 5) {
        c.passedFinish = true;

        if (t.best !== null) {
          const diff = elapsed - t.best;
          setDelta({
            val: `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`,
            color: diff <= 0 ? '#4ade80' : '#f87171',
          });

          window.setTimeout(() => setDelta(null), 2000);
        }

        if (t.best === null || elapsed < t.best) {
          t.best = elapsed;
          setBestLap(elapsed);
        }

        setLap(v => v + 1);
        t.start = now;

        window.setTimeout(() => {
          c.passedFinish = false;
        }, 1200);
      }

      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, vp.width, vp.height);

      ctx.save();
      ctx.translate(vp.width / 2 - c.x, vp.height / 2 - c.y);

      ctx.fillStyle = '#1a331a';
      ctx.fillRect(c.x - 2500, c.y - 2500, 8000, 8000);

      ctx.fillStyle = '#c2b280';
      ctx.fillRect(2450, -3000, 750, 8000);

      ctx.fillStyle = '#1e3799';
      ctx.fillRect(2550, -3000, 600, 8000);

      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(2300, 1310, 850, 180);

      drawCurbs(st, SETTINGS.visual.trackWidth / 2);
      drawCurbs(st, -SETTINGS.visual.trackWidth / 2);

      ctx.strokeStyle = '#1a1a1c';
      ctx.lineWidth = SETTINGS.visual.trackWidth;
      ctx.beginPath();
      st.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      ctx.translate(400, 800);
      const ckS = 15;

      for (let r = 0; r < 2; r += 1) {
        for (let col = -5; col < 6; col += 1) {
          ctx.fillStyle = (r + col) % 2 === 0 ? '#fff' : '#000';
          ctx.fillRect(r * ckS - ckS, col * ckS, ckS, ckS);
        }
      }

      ctx.restore();

      for (let i = 0; i < decorations.current.length; i += 1) {
        drawDecor(decorations.current[i], now, c.x, c.y);
      }

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);

      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-22, -12, 44, 24);

      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(4, -10, 12, 20);

      ctx.fillStyle = '#fff';
      ctx.fillRect(18, -10, 5, 6);
      ctx.fillRect(18, 4, 5, 6);

      ctx.restore();

      const nextParticles: Particle[] = [];
      for (let i = 0; i < particles.current.length; i += 1) {
        const p = particles.current[i];
        ctx.fillStyle = `rgba(255,255,255,${p.life * 0.25})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        p.life -= 0.04 * dt;
        if (p.life > 0) nextParticles.push(p);
      }
      particles.current = nextParticles;

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleJoystick = (
    e: React.MouseEvent | React.TouchEvent | null,
    type: 'start' | 'move' | 'end',
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (type === 'end') {
      joystick.current.active = false;
      joystick.current.startX = 0;
      joystick.current.startY = 0;
      joystick.current.inputX = 0;
      joystick.current.inputY = 0;
      joystick.current.targetVisualX = 0;
      joystick.current.targetVisualY = 0;
      return;
    }

    const source =
      'touches' in (e as React.TouchEvent)
        ? (e as React.TouchEvent).touches[0]
        : (e as React.MouseEvent);

    const x = source.clientX - rect.left;
    const y = source.clientY - rect.top;

    if (type === 'start') {
      joystick.current.active = true;
      joystick.current.startX = x;
      joystick.current.startY = y;
      return;
    }

    if (!joystick.current.active) return;

    const dx = x - joystick.current.startX;
    const dy = y - joystick.current.startY;
    const d = Math.max(1, Math.hypot(dx, dy));
    const lim = SETTINGS.joystick.radius;

    const clamped = Math.min(d, lim);
    const visualX = (dx / d) * clamped;
    const visualY = (dy / d) * clamped;

    joystick.current.targetVisualX = visualX;
    joystick.current.targetVisualY = visualY;
    joystick.current.inputX = visualX / lim;
    joystick.current.inputY = visualY / lim;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-164px)] bg-[#0A0A0F] touch-none select-none overflow-hidden font-mono text-white overscroll-none"
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      <div className="absolute top-4 left-52 pointer-events-none">
        <div className="bg-yellow-500 text-black px-4 py-2 font-black italic text-xl skew-x-[-12deg] shadow-[4px_4px_0px_#fff] border-2 border-black">
          LAP {lap + 1}
        </div>
      </div>

      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1.5">
        <div className="bg-black/80 p-3 border-l-[3px] border-yellow-500 shadow-2xl">
          <div className="text-[8px] opacity-70 uppercase tracking-widest text-yellow-500 font-bold">
            Live Session
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-black tabular-nums tracking-tighter">
              {currentLapTime.toFixed(2)}s
            </div>
            {delta && (
              <div
                className="text-lg font-black animate-pulse tabular-nums"
                style={{ color: delta.color }}
              >
                {delta.val}s
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 p-2 rounded-sm border border-white/10 w-fit">
          <div className="text-[7px] opacity-50 uppercase tracking-tighter font-bold">
            Circuit Record
          </div>
          <div className="text-sm font-bold text-yellow-200">
            {bestLap ? `${bestLap.toFixed(2)}s` : '--.--'}
          </div>
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="absolute top-4 right-4 text-white/50 border border-white/10 bg-white/5 px-3 py-1.5 rounded-sm text-[10px]"
      >
        EXIT
      </button>

      <div
        className="absolute bottom-20 right-12 w-36 h-36 rounded-full bg-black/40 border-4 border-white/10 flex items-center justify-center z-50 shadow-[0_0_50px_rgba(0,0,0,0.5)] touch-none"
        onMouseDown={(e) => handleJoystick(e, 'start')}
        onMouseMove={(e) => handleJoystick(e, 'move')}
        onMouseUp={() => handleJoystick(null, 'end')}
        onMouseLeave={() => handleJoystick(null, 'end')}
        onTouchStart={(e) => handleJoystick(e, 'start')}
        onTouchMove={(e) => handleJoystick(e, 'move')}
        onTouchEnd={() => handleJoystick(null, 'end')}
      >
        <div
          className="w-16 h-16 bg-gradient-to-br from-white to-gray-400 rounded-full shadow-2xl pointer-events-none border-2 border-black/20"
          style={{
            transform: `translate(${joystick.current.visualX}px, ${joystick.current.visualY}px)`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
};