import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Player {
  x: number;
  y: number;
  hp: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  fade: number;
  gravity: number;
}

interface WindStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
}

interface MountainRange {
  points: { x: number; y: number }[];
  color: string;
  ridgeColor: string;
  parallaxSpeed: number;
  snowOpacity: number;
}

const MOUNTAIN_SETTINGS = [
  { baseHeight: 0.7, variance: 0.16, color: '#13182d', ridgeColor: 'rgba(255,255,255,0.05)', speed: 0.22, detail: 58, snowOpacity: 0.16 },
  { baseHeight: 0.56, variance: 0.13, color: '#1c2340', ridgeColor: 'rgba(255,255,255,0.06)', speed: 0.42, detail: 44, snowOpacity: 0.12 },
  { baseHeight: 0.38, variance: 0.10, color: '#263153', ridgeColor: 'rgba(255,255,255,0.07)', speed: 0.68, detail: 34, snowOpacity: 0.08 },
  { baseHeight: 0.22, variance: 0.06, color: '#31406a', ridgeColor: 'rgba(255,255,255,0.08)', speed: 1.0, detail: 22, snowOpacity: 0.0 },
] as const;

const SETTINGS = {
  gravity: 0.22,
  groundY: 100,
  playerSize: 50,
  maxPower: 44,
  worldWidth: 4000,
  maxHP: 3,
  maxDpr: 1.5,
  grassStep: 9,
  maxParticles: 140,
  p1StartX: 950,
  p2StartX: 3050,
  launchScale: 0.108,
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const ArcherGame: React.FC = () => {
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const nextTurnTimeoutRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const [turn, setTurn] = useState<1 | 2>(1);
  const [p1, setP1] = useState<Player>({
    x: SETTINGS.p1StartX,
    y: 0,
    hp: 3,
    color: '#FF3B3B',
  });
  const [p2, setP2] = useState<Player>({
    x: SETTINGS.p2StartX,
    y: 0,
    hp: 3,
    color: '#3B82FF',
  });
  const [wind, setWind] = useState(0);
  const [winner, setWinner] = useState<number | null>(null);

  const turnRef = useRef<1 | 2>(1);
  const windRef = useRef(0);
  const winnerRef = useRef<number | null>(null);
  const p1Ref = useRef<Player>({
    x: SETTINGS.p1StartX,
    y: 0,
    hp: 3,
    color: '#FF3B3B',
  });
  const p2Ref = useRef<Player>({
    x: SETTINGS.p2StartX,
    y: 0,
    hp: 3,
    color: '#3B82FF',
  });

  const projectile = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    active: false,
    angle: 0,
    landed: false,
  });

  const camera = useRef({
    x: 0,
    targetX: 0,
    shake: 0,
  });

  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
  });

  const particles = useRef<Particle[]>([]);
  const windStreaks = useRef<WindStreak[]>([]);
  const stars = useRef<Star[]>([]);
  const mountainRanges = useRef<MountainRange[]>([]);
  const grassBlades = useRef<{ x: number; h: number; offset: number; color: string }[]>([]);
  const trees = useRef<{ x: number; s: number; tint: string }[]>([]);

  const getGroundY = (x: number, viewHeight: number) =>
    viewHeight - SETTINGS.groundY + Math.sin(x / 300) * 20;

  const getPlayerY = (x: number, viewHeight: number) =>
    getGroundY(x, viewHeight) - SETTINGS.playerSize;

  const updateWind = () => {
    const next = Number((Math.random() * 0.07 - 0.035).toFixed(3));
    windRef.current = next;
    setWind(next);
  };

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  useEffect(() => {
    p1Ref.current = p1;
  }, [p1]);

  useEffect(() => {
    p2Ref.current = p2;
  }, [p2]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('touchmove', preventDefault, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('touchmove', preventDefault);
      }
    };
  }, []);

  useEffect(() => {
    const blades: { x: number; h: number; offset: number; color: string }[] = [];
    for (let i = 0; i < SETTINGS.worldWidth; i += SETTINGS.grassStep) {
      blades.push({
        x: i,
        h: 7 + Math.random() * 8,
        offset: Math.random() * Math.PI * 2,
        color: Math.random() > 0.45 ? '#10b981' : '#059669',
      });
    }
    grassBlades.current = blades;

    trees.current = Array.from({ length: 34 }, () => ({
      x: Math.random() * SETTINGS.worldWidth,
      s: 0.65 + Math.random() * 1.05,
      tint: Math.random() > 0.5 ? '#111827' : '#1f2937',
    }));

    windStreaks.current = Array.from({ length: 30 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * Math.max(220, window.innerHeight - 280),
      len: 18 + Math.random() * 34,
      speed: 0.4 + Math.random() * 1.5,
    }));

    stars.current = Array.from({ length: 58 }, () => ({
      x: Math.random() * window.innerWidth,
      y: 30 + Math.random() * 230,
      size: 0.8 + Math.random() * 1.8,
      twinkle: Math.random() * Math.PI * 2,
    }));

    const viewHeight = window.innerHeight;

    mountainRanges.current = MOUNTAIN_SETTINGS.map(layer => {
      const points: { x: number; y: number }[] = [];
      const step = SETTINGS.worldWidth / layer.detail;

      for (let i = 0; i <= layer.detail; i += 1) {
        const x = i * step;
        const noise =
          Math.sin(i * 0.42) * 0.28 +
          Math.sin(i * 1.08) * 0.17 +
          Math.sin(i * 0.18 + 1.3) * 0.12 +
          (Math.random() - 0.5) * 0.08;

        const yHeight = layer.baseHeight + noise * layer.variance;
        const y = viewHeight - SETTINGS.groundY - yHeight * viewHeight;
        points.push({ x, y });
      }

      return {
        points,
        color: layer.color,
        ridgeColor: layer.ridgeColor,
        parallaxSpeed: layer.speed,
        snowOpacity: layer.snowOpacity,
      };
    });

    updateWind();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, SETTINGS.maxDpr);
      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      setP1(prev => {
        const next = { ...prev, y: getPlayerY(prev.x, height) };
        p1Ref.current = next;
        return next;
      });

      setP2(prev => {
        const next = { ...prev, y: getPlayerY(prev.x, height) };
        p2Ref.current = next;
        return next;
      });
    };

    resize();
    window.addEventListener('resize', resize);

    const drawSky = (ctx2: CanvasRenderingContext2D, width: number, height: number, now: number) => {
      const skyGrad = ctx2.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, '#030816');
      skyGrad.addColorStop(0.45, '#15173d');
      skyGrad.addColorStop(1, '#281d4f');
      ctx2.fillStyle = skyGrad;
      ctx2.fillRect(0, 0, width, height);

      for (let i = 0; i < stars.current.length; i += 1) {
        const s = stars.current[i];
        const alpha = 0.35 + ((Math.sin(now * 0.0016 + s.twinkle) + 1) * 0.5) * 0.45;
        ctx2.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx2.beginPath();
        ctx2.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx2.fill();
      }

      const haze = ctx2.createLinearGradient(0, 0, 0, height * 0.7);
      haze.addColorStop(0, 'rgba(120,160,255,0.02)');
      haze.addColorStop(1, 'rgba(255,140,200,0.08)');
      ctx2.fillStyle = haze;
      ctx2.fillRect(0, 0, width, height * 0.7);
    };

    const drawMoon = (ctx2: CanvasRenderingContext2D, width: number) => {
      ctx2.save();

      const mx = width * 0.52;
      const my = 170;

      const glow = ctx2.createRadialGradient(mx, my, 0, mx, my, 90);
      glow.addColorStop(0, 'rgba(255,255,255,0.22)');
      glow.addColorStop(0.4, 'rgba(210,230,255,0.08)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.fillStyle = glow;
      ctx2.beginPath();
      ctx2.arc(mx, my, 90, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.fillStyle = '#f8fafc';
      ctx2.beginPath();
      ctx2.arc(mx, my, 32, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.fillStyle = 'rgba(200,210,220,0.25)';
      ctx2.beginPath();
      ctx2.arc(mx - 10, my - 8, 6, 0, Math.PI * 2);
      ctx2.arc(mx + 8, my + 7, 4, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.restore();
    };

    const drawWindVisuals = (ctx2: CanvasRenderingContext2D, width: number, dt60: number) => {
      ctx2.save();
      ctx2.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx2.lineWidth = 1;

      const currentWind = windRef.current;

      for (let i = 0; i < windStreaks.current.length; i += 1) {
        const s = windStreaks.current[i];
        s.x += (currentWind * 110 + (currentWind > 0 ? s.speed : -s.speed)) * dt60;

        if (s.x > width + s.len) s.x = -s.len;
        if (s.x < -s.len) s.x = width + s.len;

        ctx2.beginPath();
        ctx2.moveTo(s.x, s.y);
        ctx2.lineTo(s.x + s.len, s.y + Math.sin(s.x * 0.01) * 1.8);
        ctx2.stroke();
      }

      ctx2.restore();
    };

    const drawMountains = (ctx2: CanvasRenderingContext2D, h: number) => {
      for (let i = 0; i < mountainRanges.current.length; i += 1) {
        const range = mountainRanges.current[i];

        ctx2.save();
        ctx2.translate(-camera.current.x * range.parallaxSpeed, 0);

        ctx2.fillStyle = range.color;
        ctx2.beginPath();
        ctx2.moveTo(0, h);

        for (let j = 0; j < range.points.length; j += 1) {
          const p = range.points[j];
          ctx2.lineTo(p.x, p.y);
        }

        ctx2.lineTo(SETTINGS.worldWidth, h);
        ctx2.closePath();
        ctx2.fill();

        ctx2.strokeStyle = range.ridgeColor;
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        for (let j = 0; j < range.points.length; j += 1) {
          const p = range.points[j];
          if (j === 0) ctx2.moveTo(p.x, p.y);
          else ctx2.lineTo(p.x, p.y);
        }
        ctx2.stroke();

        if (range.snowOpacity > 0) {
          ctx2.fillStyle = `rgba(255,255,255,${range.snowOpacity})`;
          for (let j = 1; j < range.points.length - 1; j += 1) {
            const prevP = range.points[j - 1];
            const p = range.points[j];
            const nextP = range.points[j + 1];

            if (p.y < prevP.y && p.y < nextP.y && p.y < h * 0.58) {
              ctx2.beginPath();
              ctx2.moveTo(p.x, p.y);
              ctx2.lineTo(prevP.x, (p.y + prevP.y) * 0.5 + 6);
              ctx2.lineTo(nextP.x, (p.y + nextP.y) * 0.5 + 6);
              ctx2.closePath();
              ctx2.fill();
            }
          }
        }

        ctx2.restore();
      }

      const fog = ctx2.createLinearGradient(0, h * 0.35, 0, h * 0.8);
      fog.addColorStop(0, 'rgba(255,255,255,0)');
      fog.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx2.fillStyle = fog;
      ctx2.fillRect(0, 0, canvas.clientWidth, h);
    };

    const drawHillsGround = (ctx2: CanvasRenderingContext2D, h: number) => {
      for (let i = 0; i < trees.current.length; i += 1) {
        const t = trees.current[i];
        const ground = getGroundY(t.x, h);

        ctx2.fillStyle = t.tint;
        ctx2.beginPath();
        ctx2.moveTo(t.x, ground + 5);
        ctx2.lineTo(t.x + 25 * t.s, ground - 140 * t.s);
        ctx2.lineTo(t.x + 50 * t.s, ground + 5);
        ctx2.fill();
      }

      const hillGrad = ctx2.createLinearGradient(0, h - SETTINGS.groundY - 20, 0, h);
      hillGrad.addColorStop(0, '#0a3c1e');
      hillGrad.addColorStop(0.55, '#052e16');
      hillGrad.addColorStop(1, '#021109');

      ctx2.fillStyle = hillGrad;
      ctx2.beginPath();
      ctx2.moveTo(0, h);
      for (let x = 0; x <= SETTINGS.worldWidth; x += 12) {
        ctx2.lineTo(x, getGroundY(x, h));
      }
      ctx2.lineTo(SETTINGS.worldWidth, h);
      ctx2.fill();

      ctx2.strokeStyle = 'rgba(120,255,180,0.08)';
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      for (let x = 0; x <= SETTINGS.worldWidth; x += 18) {
        const gy = getGroundY(x, h);
        if (x === 0) ctx2.moveTo(x, gy);
        else ctx2.lineTo(x, gy);
      }
      ctx2.stroke();
    };

    const drawAimSystem = (ctx2: CanvasRenderingContext2D, player: Player, h: number) => {
      const dx = drag.current.startX - drag.current.currX;
      const dy = drag.current.startY - drag.current.currY;
      const powerPct = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 250);
      const angleDeg = Math.round(
        Math.atan2(dy, turnRef.current === 1 ? dx : -dx) * (180 / Math.PI) * -1,
      );

      ctx2.save();

      let tx = player.x + 25;
      let ty = player.y + 25;
      let tvx = Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dx * SETTINGS.launchScale));
      let tvy = Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dy * SETTINGS.launchScale));

      for (let i = 0; i < 62; i += 1) {
        if (i % 2 === 0) {
          ctx2.fillStyle = `rgba(255,255,255,${0.42 * (1 - i / 62)})`;
          ctx2.beginPath();
          ctx2.arc(tx, ty, 2.6 * (1 - i / 62), 0, Math.PI * 2);
          ctx2.fill();
        }

        for (let j = 0; j < 2; j += 1) {
          tvx += windRef.current * 0.14;
          tvy += SETTINGS.gravity;
          tx += tvx;
          ty += tvy;
        }

        if (ty > getGroundY(tx, h)) break;
      }

      ctx2.restore();

      const bx = turnRef.current === 1 ? player.x - 50 : player.x + SETTINGS.playerSize + 35;
      const by = player.y - 120;
      const bw = 18;
      const bh = 150;

      ctx2.fillStyle = 'rgba(0,0,0,0.62)';
      roundedRect(ctx2, bx, by, bw, bh, 4);
      ctx2.fill();

      ctx2.fillStyle = powerPct > 0.8 ? '#ef4444' : '#fbbf24';
      roundedRect(ctx2, bx + 3, by + bh - bh * powerPct + 3, bw - 6, bh * powerPct - 6, 2);
      ctx2.fill();

      ctx2.fillStyle = 'white';
      ctx2.font = '900 24px Montserrat, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.fillText(`${angleDeg}°`, player.x + 25, player.y - 35);
    };

    const drawStylizedPlayer = (ctx2: CanvasRenderingContext2D, player: Player) => {
      ctx2.save();

      ctx2.fillStyle = 'rgba(0,0,0,0.2)';
      ctx2.beginPath();
      ctx2.ellipse(player.x + 25, player.y + 52, 18, 5, 0, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.shadowBlur = 15;
      ctx2.shadowColor = player.color;
      ctx2.fillStyle = player.color;

      roundedRect(ctx2, player.x + 10, player.y + 15, 30, 35, 10);
      ctx2.fill();

      ctx2.beginPath();
      ctx2.arc(player.x + 25, player.y + 5, 12, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.shadowBlur = 0;
      ctx2.fillStyle = 'rgba(0,0,0,0.7)';
      const lookDir = player.x < SETTINGS.worldWidth / 2 ? 4 : -4;
      ctx2.beginPath();
      ctx2.arc(player.x + 25 + lookDir, player.y + 3, 2.5, 0, Math.PI * 2);
      ctx2.arc(
        player.x + 25 + lookDir + (lookDir > 0 ? 6 : -6),
        player.y + 3,
        2.5,
        0,
        Math.PI * 2,
      );
      ctx2.fill();

      ctx2.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx2.lineWidth = 1.5;
      ctx2.beginPath();
      ctx2.moveTo(player.x + 6, player.y + 32);
      ctx2.lineTo(player.x - 7, player.y + 20);
      ctx2.lineTo(player.x + 2, player.y + 8);
      ctx2.stroke();

      ctx2.restore();
    };

    const drawLushGrass = (ctx2: CanvasRenderingContext2D, h: number, width: number) => {
      const time = performance.now() * 0.002;
      const camX = camera.current.x;

      ctx2.lineWidth = 1.1;

      for (let i = 0; i < grassBlades.current.length; i += 1) {
        const b = grassBlades.current[i];
        if (b.x < camX - 120 || b.x > camX + width + 120) continue;

        const ground = getGroundY(b.x, h);
        ctx2.strokeStyle = b.color;
        ctx2.beginPath();
        ctx2.moveTo(b.x, ground);
        ctx2.quadraticCurveTo(
          b.x,
          ground - b.h,
          b.x + Math.sin(time + b.offset) * 4 + windRef.current * 18,
          ground - b.h,
        );
        ctx2.stroke();
      }
    };

    const drawSpear = (ctx2: CanvasRenderingContext2D, x: number, y: number, angle: number) => {
      ctx2.save();
      ctx2.translate(x, y);
      ctx2.rotate(angle);

      ctx2.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(-38, 0);
      ctx2.lineTo(-14, 0);
      ctx2.stroke();

      ctx2.strokeStyle = 'white';
      ctx2.lineWidth = 3;
      ctx2.beginPath();
      ctx2.moveTo(-25, 0);
      ctx2.lineTo(25, 0);
      ctx2.stroke();

      ctx2.fillStyle = '#fbbf24';
      ctx2.beginPath();
      ctx2.moveTo(25, 0);
      ctx2.lineTo(12, -8);
      ctx2.lineTo(12, 6);
      ctx2.closePath();
      ctx2.fill();

      ctx2.restore();
    };

    const createExplosion = (
      x: number,
      y: number,
      color: string,
      count: number,
      isBlood: boolean,
    ) => {
      const next: Particle[] = [];
      const existing = particles.current.length;
      const allowed = Math.max(0, SETTINGS.maxParticles - existing);
      const limit = Math.min(count, allowed);

      for (let i = 0; i < limit; i += 1) {
        next.push({
          x,
          y,
          color,
          size: isBlood ? Math.random() * 4 + 2 : Math.random() * 2.5,
          vx: (Math.random() - 0.5) * (isBlood ? 8 : 12),
          vy: (Math.random() - 0.7) * (isBlood ? 10 : 12),
          alpha: 1,
          fade: isBlood ? 0.06 : 0.035,
          gravity: isBlood ? 0.28 : 0.22,
        });
      }

      particles.current.push(...next);
    };

    const checkCollision = (x: number, y: number, t: Player) =>
      x > t.x && x < t.x + 50 && y > t.y && y < t.y + 50;

    const handleImpact = (isHit: boolean) => {
      projectile.current.active = false;
      projectile.current.landed = true;

      const x = projectile.current.x;
      const y = projectile.current.y;

      if (isHit) {
        camera.current.shake = 22;
        createExplosion(x, y, '#ff0000', 34, true);

        if (turnRef.current === 1) {
          setP2(prev => {
            const next = { ...prev, hp: Math.max(0, prev.hp - 1) };
            p2Ref.current = next;
            return next;
          });
        } else {
          setP1(prev => {
            const next = { ...prev, hp: Math.max(0, prev.hp - 1) };
            p1Ref.current = next;
            return next;
          });
        }
      } else {
        createExplosion(x, y, '#fbbf24', 10, false);
      }

      if (nextTurnTimeoutRef.current) {
        window.clearTimeout(nextTurnTimeoutRef.current);
      }

      nextTurnTimeoutRef.current = window.setTimeout(() => {
        if (p1Ref.current.hp <= 0 || p2Ref.current.hp <= 0) return;

        projectile.current.landed = false;
        setTurn(prev => {
          const next = prev === 1 ? 2 : 1;
          turnRef.current = next;
          return next;
        });
        updateWind();
      }, 1100);
    };

    const updateParticles = (ctx2: CanvasRenderingContext2D, dt60: number) => {
      const nextParticles: Particle[] = [];

      for (let i = 0; i < particles.current.length; i += 1) {
        const p = particles.current[i];
        p.x += p.vx * dt60;
        p.vy += p.gravity * dt60;
        p.y += p.vy * dt60;
        p.alpha -= p.fade * dt60;

        if (p.alpha > 0) {
          ctx2.globalAlpha = Math.max(0, p.alpha);
          ctx2.fillStyle = p.color;
          ctx2.beginPath();
          ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx2.fill();
          nextParticles.push(p);
        }
      }

      particles.current = nextParticles;
      ctx2.globalAlpha = 1;
    };

    const render = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const prev = lastFrameRef.current || now;
      const dtMs = Math.min(now - prev, 32);
      const dt60 = dtMs / 16.6667;
      lastFrameRef.current = now;

      if (projectile.current.active) {
        camera.current.targetX = projectile.current.x - width / 2;
      } else if (!projectile.current.landed) {
        camera.current.targetX =
          (turnRef.current === 1 ? p1Ref.current.x : p2Ref.current.x) - width / 2;
      }

      camera.current.targetX = Math.max(
        0,
        Math.min(camera.current.targetX, SETTINGS.worldWidth - width),
      );

      const camLerp = projectile.current.active ? 0.17 : 0.065;
      camera.current.x += (camera.current.targetX - camera.current.x) * camLerp * dt60;

      drawSky(ctx, width, height, now);
      drawMoon(ctx, width);
      drawWindVisuals(ctx, width, dt60);
      drawMountains(ctx, height);

      ctx.save();
      ctx.translate(-camera.current.x + (Math.random() - 0.5) * camera.current.shake, 0);

      if (camera.current.shake > 0) {
        camera.current.shake *= Math.pow(0.86, dt60);
      }

      drawHillsGround(ctx, height);
      drawStylizedPlayer(ctx, p1Ref.current);
      drawStylizedPlayer(ctx, p2Ref.current);

      if (drag.current.active && !projectile.current.active) {
        drawAimSystem(ctx, turnRef.current === 1 ? p1Ref.current : p2Ref.current, height);
      }

      if (projectile.current.active) {
        const pr = projectile.current;

        for (let i = 0; i < 2; i += 1) {
          pr.vx += windRef.current * 0.12 * dt60;
          pr.x += pr.vx * dt60;
          pr.vy += SETTINGS.gravity * dt60;
          pr.y += pr.vy * dt60;

          const target = turnRef.current === 1 ? p2Ref.current : p1Ref.current;

          if (checkCollision(pr.x, pr.y, target)) {
            handleImpact(true);
            break;
          }

          if (
            pr.y > getGroundY(pr.x, height) + 28 ||
            pr.x < 0 ||
            pr.x > SETTINGS.worldWidth
          ) {
            handleImpact(false);
            break;
          }
        }

        pr.angle = Math.atan2(pr.vy, pr.vx);
        if (pr.active) {
          drawSpear(ctx, pr.x, pr.y, pr.angle);
        }
      }

      updateParticles(ctx, dt60);
      drawLushGrass(ctx, height, width);

      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (nextTurnTimeoutRef.current) window.clearTimeout(nextTurnTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (p1.hp <= 0) {
      winnerRef.current = 2;
      setWinner(2);
    }
    if (p2.hp <= 0) {
      winnerRef.current = 1;
      setWinner(1);
    }
  }, [p1.hp, p2.hp]);

  const handleStart = (e: any) => {
    if (projectile.current.active || winnerRef.current) return;
    if (e.cancelable) e.preventDefault();

    const t = e.touches ? e.touches[0] : e;
    drag.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      currX: t.clientX,
      currY: t.clientY,
    };
  };

  const handleMove = (e: any) => {
    if (!drag.current.active) return;
    if (e.cancelable) e.preventDefault();

    const t = e.touches ? e.touches[0] : e;
    drag.current.currX = t.clientX;
    drag.current.currY = t.clientY;
  };

  const handleEnd = () => {
    if (!drag.current.active) return;

    const dx = (drag.current.startX - drag.current.currX) * SETTINGS.launchScale;
    const dy = (drag.current.startY - drag.current.currY) * SETTINGS.launchScale;
    const shooter = turnRef.current === 1 ? p1Ref.current : p2Ref.current;

    projectile.current = {
      x: shooter.x + 25,
      y: shooter.y + 25,
      vx: Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dx)),
      vy: Math.max(-SETTINGS.maxPower, Math.min(SETTINGS.maxPower, dy)),
      active: true,
      angle: 0,
      landed: false,
    };

    drag.current.active = false;
  };

  const HeartIcon = ({ filled, color }: { filled: boolean; color: string }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={`transition-all duration-500 ${
        filled ? 'scale-110 opacity-100' : 'scale-75 opacity-20'
      }`}
    >
      <path
        fill={color}
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-[calc(100vh-164px)] bg-[#020617] relative touch-none overscroll-none overflow-hidden select-none font-sans"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <button
          onClick={() => navigate('/')}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-[9px] text-white/70 font-bold tracking-[0.2em] uppercase transition-all active:scale-90"
        >
          Exit
        </button>
      </div>

      <div className="absolute inset-0 pt-5 px-5 flex justify-between items-start z-10 pointer-events-none">
        <div
          className={`flex flex-col gap-2 transition-all duration-500 ${
            turn === 1 ? 'scale-100' : 'opacity-40 scale-90'
          }`}
        >
          <div className="flex flex-col gap-2 bg-black/40 p-2 rounded-xl border border-white/10 shadow-2xl backdrop-blur-sm">
            {[...Array(SETTINGS.maxHP)].map((_, i) => (
              <HeartIcon key={i} filled={p1.hp > i} color={p1.color} />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 mt-24">
          <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 text-[9px] font-bold text-white tracking-[0.2em] uppercase shadow-2xl">
            WIND: {Math.abs(wind * 10000).toFixed(0)} {wind > 0 ? '>>>' : '<<<'}
          </div>
        </div>

        <div
          className={`flex flex-col items-end gap-2 transition-all duration-500 ${
            turn === 2 ? 'scale-100' : 'opacity-40 scale-90'
          }`}
        >
          <div className="flex flex-col gap-2 bg-black/40 p-2 rounded-xl border border-white/10 shadow-2xl backdrop-blur-sm">
            {[...Array(SETTINGS.maxHP)].map((_, i) => (
              <HeartIcon key={i} filled={p2.hp > i} color={p2.color} />
            ))}
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        className="w-full h-full cursor-crosshair"
      />

      {winner && (
        <div className="absolute inset-0 bg-slate-950/98 flex flex-col items-center justify-center z-50 p-6 text-center animate-in fade-in duration-700">
          <h2 className="text-[5rem] font-black text-white italic tracking-tighter mb-8">
            {winner === 1 ? 'RED' : 'BLUE'} WIN
          </h2>
          <button
            onClick={() => window.location.reload()}
            className="px-10 py-3 bg-white text-black font-black rounded-lg uppercase tracking-widest hover:invert transition-all"
          >
            Rematch
          </button>
        </div>
      )}
    </div>
  );
};