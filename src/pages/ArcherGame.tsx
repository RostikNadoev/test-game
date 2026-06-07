import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Turn = 1 | 2;
type Facing = 1 | -1;

interface Player {
  x: number;
  y: number;
  hp: number;
  color: string;
  glow: string;
  name: string;
  facing: Facing;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  active: boolean;
  landed: boolean;
  owner: Turn;
  slowMoUsed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  gravity: number;
}

interface TrailDot {
  x: number;
  y: number;
  alpha: number;
  size: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
  alpha: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface GrassBlade {
  x: number;
  h: number;
  phase: number;
  color: string;
}

interface HillLayer {
  points: { x: number; y: number }[];
  color: string;
  speed: number;
  alpha: number;
}

const SETTINGS = {
  maxHP: 3,
  maxDpr: 1.5,
  worldWidth: 3800,

  playerSize: 58,
  p1StartX: 920,
  p2StartX: 2880,

  groundOffset: 86,
  gravity: 0.225,
  launchScale: 0.112,
  maxPower: 41,

  hiddenWindMin: -0.036,
  hiddenWindMax: 0.036,
  windForce: 0.13,

  turnDelayMs: 980,
  maxParticles: 130,
  maxTrailDots: 18,

  slowMoDistance: 310,
  slowMoDurationMs: 560,
  slowMoScale: 0.42,

  cameraLerpIdle: 0.065,
  cameraLerpProjectile: 0.17,
};

const HILL_CONFIG = [
  { base: 0.7, variance: 0.14, color: '#11172d', speed: 0.2, alpha: 1, detail: 58 },
  { base: 0.53, variance: 0.12, color: '#1b2440', speed: 0.42, alpha: 1, detail: 46 },
  { base: 0.34, variance: 0.09, color: '#28365d', speed: 0.72, alpha: 1, detail: 34 },
  { base: 0.18, variance: 0.05, color: '#365071', speed: 1, alpha: 1, detail: 26 },
] as const;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getGroundY(x: number, height: number) {
  const base = height - SETTINGS.groundOffset;
  return (
    base +
    Math.sin(x / 330) * 22 +
    Math.sin(x / 770 + 1.5) * 12 +
    Math.sin(x / 1500) * 10
  );
}

function getPlayerY(x: number, height: number) {
  return getGroundY(x, height) - SETTINGS.playerSize;
}

function getHiddenWind() {
  return rand(SETTINGS.hiddenWindMin, SETTINGS.hiddenWindMax);
}

function triggerHaptic(kind: 'light' | 'hit' | 'miss' | 'start' = 'light') {
  const tg = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (
              style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft',
            ) => void;
            notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            selectionChanged?: () => void;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  try {
    if (kind === 'hit') {
      tg?.HapticFeedback?.notificationOccurred?.('success');
      navigator.vibrate?.(24);
      return;
    }

    if (kind === 'miss') {
      tg?.HapticFeedback?.impactOccurred?.('soft');
      navigator.vibrate?.(14);
      return;
    }

    if (kind === 'start') {
      tg?.HapticFeedback?.impactOccurred?.('medium');
      navigator.vibrate?.(20);
      return;
    }

    tg?.HapticFeedback?.selectionChanged?.();
    tg?.HapticFeedback?.impactOccurred?.('light');
    navigator.vibrate?.(8);
  } catch {
    // Haptics are optional.
  }
}

function makePlayers(height: number): { p1: Player; p2: Player } {
  const p1: Player = {
    x: SETTINGS.p1StartX,
    y: getPlayerY(SETTINGS.p1StartX, height),
    hp: SETTINGS.maxHP,
    color: '#ff4d5f',
    glow: 'rgba(255,77,95,0.55)',
    name: 'RED',
    facing: 1,
  };

  const p2: Player = {
    x: SETTINGS.p2StartX,
    y: getPlayerY(SETTINGS.p2StartX, height),
    hp: SETTINGS.maxHP,
    color: '#4d8dff',
    glow: 'rgba(77,141,255,0.55)',
    name: 'BLUE',
    facing: -1,
  };

  return { p1, p2 };
}

export const ArcherGame: React.FC = () => {
  const navigate = useNavigate();

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const nextTurnTimeoutRef = useRef<number | null>(null);
  const slowMoUntilRef = useRef(0);
  const lastFrameRef = useRef(0);

  const [turn, setTurn] = useState<Turn>(1);
  const [p1State, setP1State] = useState<Player>(() => makePlayers(640).p1);
  const [p2State, setP2State] = useState<Player>(() => makePlayers(640).p2);
  const [winner, setWinner] = useState<Turn | null>(null);
  const [shotHint, setShotHint] = useState('DRAG TO AIM');

  const turnRef = useRef<Turn>(1);
  const winnerRef = useRef<Turn | null>(null);

  const p1Ref = useRef<Player>(makePlayers(640).p1);
  const p2Ref = useRef<Player>(makePlayers(640).p2);

  const hiddenWindRef = useRef(getHiddenWind());

  const cameraRef = useRef({
    x: 0,
    targetX: 0,
    shake: 0,
  });

  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
  });

  const projectileRef = useRef<Projectile>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    active: false,
    landed: false,
    owner: 1,
    slowMoUsed: false,
  });

  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<TrailDot[]>([]);
  const starsRef = useRef<Star[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const grassRef = useRef<GrassBlade[]>([]);
  const hillsRef = useRef<HillLayer[]>([]);

  const syncPlayersForHeight = useCallback((height: number) => {
    setP1State((prev) => {
      const next = { ...prev, y: getPlayerY(prev.x, height) };
      p1Ref.current = next;
      return next;
    });

    setP2State((prev) => {
      const next = { ...prev, y: getPlayerY(prev.x, height) };
      p2Ref.current = next;
      return next;
    });
  }, []);

  const randomizeHiddenWind = useCallback(() => {
    hiddenWindRef.current = getHiddenWind();
  }, []);

  const applyGameHeight = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const parentHeight = root.parentElement?.clientHeight ?? 0;
    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;
    const tgHeight = tg?.viewportStableHeight || tg?.viewportHeight;
    const fallback = window.innerHeight;

    const height = Math.floor(parentHeight > 0 ? parentHeight : tgHeight || fallback);
    root.style.setProperty('--archer-h', `${height}px`);
  }, []);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    const height = canvas?.clientHeight || rootRef.current?.clientHeight || window.innerHeight;
    const { p1, p2 } = makePlayers(height);

    p1Ref.current = p1;
    p2Ref.current = p2;

    setP1State(p1);
    setP2State(p2);
    setWinner(null);
    setTurn(1);
    setShotHint('DRAG TO AIM');

    turnRef.current = 1;
    winnerRef.current = null;
    hiddenWindRef.current = getHiddenWind();

    projectileRef.current = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      active: false,
      landed: false,
      owner: 1,
      slowMoUsed: false,
    };

    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
    particlesRef.current = [];
    trailRef.current = [];

    cameraRef.current = {
      x: Math.max(0, p1.x - (canvas?.clientWidth || window.innerWidth) / 2),
      targetX: 0,
      shake: 0,
    };

    triggerHaptic('start');
  }, []);

  useLayoutEffect(() => {
    applyGameHeight();
  }, [applyGameHeight]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';

    const preventTouchMove = (event: TouchEvent) => {
      if (root.contains(event.target as Node)) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;

    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      // Ignore outside Telegram.
    }

    applyGameHeight();

    window.addEventListener('resize', applyGameHeight);
    tg?.onEvent?.('viewportChanged', applyGameHeight);

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;

      document.removeEventListener('touchmove', preventTouchMove);
      window.removeEventListener('resize', applyGameHeight);
      tg?.offEvent?.('viewportChanged', applyGameHeight);

      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        // Ignore.
      }
    };
  }, [applyGameHeight]);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  useEffect(() => {
    p1Ref.current = p1State;
  }, [p1State]);

  useEffect(() => {
    p2Ref.current = p2State;
  }, [p2State]);

  useEffect(() => {
    const width = Math.max(window.innerWidth, 420);
    const height = Math.max(window.innerHeight, 640);

    starsRef.current = Array.from({ length: 72 }, () => ({
      x: Math.random() * width,
      y: 20 + Math.random() * height * 0.46,
      size: 0.7 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
    }));

    cloudsRef.current = Array.from({ length: 10 }, () => ({
      x: Math.random() * SETTINGS.worldWidth,
      y: 55 + Math.random() * 180,
      w: 90 + Math.random() * 180,
      speed: 0.08 + Math.random() * 0.16,
      alpha: 0.05 + Math.random() * 0.08,
    }));

    grassRef.current = Array.from({ length: Math.floor(SETTINGS.worldWidth / 11) }, (_, i) => ({
      x: i * 11 + Math.random() * 4,
      h: 7 + Math.random() * 11,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() > 0.5 ? '#12c98b' : '#0b8f62',
    }));

    hillsRef.current = HILL_CONFIG.map((layer) => {
      const points: { x: number; y: number }[] = [];
      const step = SETTINGS.worldWidth / layer.detail;

      for (let i = 0; i <= layer.detail; i += 1) {
        const x = i * step;
        const noise =
          Math.sin(i * 0.36) * 0.3 +
          Math.sin(i * 0.91 + 1.5) * 0.19 +
          Math.sin(i * 0.17 + 0.8) * 0.16 +
          (Math.random() - 0.5) * 0.07;

        const y = height - SETTINGS.groundOffset - (layer.base + noise * layer.variance) * height;

        points.push({ x, y });
      }

      return {
        points,
        color: layer.color,
        speed: layer.speed,
        alpha: layer.alpha,
      };
    });

    randomizeHiddenWind();
  }, [randomizeHiddenWind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      applyGameHeight();

      const dpr = Math.min(window.devicePixelRatio || 1, SETTINGS.maxDpr);
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.clientHeight);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncPlayersForHeight(height);
    };

    resize();

    if ('ResizeObserver' in window) {
      resizeObserverRef.current = new ResizeObserver(resize);
      resizeObserverRef.current.observe(root);
    }

    window.addEventListener('resize', resize);

    const createParticles = (
      x: number,
      y: number,
      color: string,
      count: number,
      power: number,
      gravity: number,
    ) => {
      const allowed = Math.max(0, SETTINGS.maxParticles - particlesRef.current.length);
      const limit = Math.min(allowed, count);

      for (let i = 0; i < limit; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * power;

        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - Math.random() * power * 0.45,
          size: 1.5 + Math.random() * 4,
          life: 1,
          maxLife: 1,
          color,
          gravity,
        });
      }
    };

    const switchTurn = () => {
      if (p1Ref.current.hp <= 0 || p2Ref.current.hp <= 0) return;

      projectileRef.current.landed = false;
      trailRef.current = [];
      randomizeHiddenWind();

      setTurn((prev) => {
        const next: Turn = prev === 1 ? 2 : 1;
        turnRef.current = next;
        return next;
      });

      setShotHint('DRAG TO AIM');
    };

    const finishProjectile = (hit: boolean, target?: Player) => {
      const projectile = projectileRef.current;

      projectile.active = false;
      projectile.landed = true;

      if (hit && target) {
        triggerHaptic('hit');
        cameraRef.current.shake = 8;

        createParticles(
          projectile.x,
          projectile.y,
          target.color,
          34,
          9,
          0.25,
        );

        if (projectile.owner === 1) {
          setP2State((prev) => {
            const next = { ...prev, hp: Math.max(0, prev.hp - 1) };
            p2Ref.current = next;

            if (next.hp <= 0) {
              winnerRef.current = 1;
              setWinner(1);
            }

            return next;
          });
        } else {
          setP1State((prev) => {
            const next = { ...prev, hp: Math.max(0, prev.hp - 1) };
            p1Ref.current = next;

            if (next.hp <= 0) {
              winnerRef.current = 2;
              setWinner(2);
            }

            return next;
          });
        }
      } else {
        triggerHaptic('miss');
        createParticles(projectile.x, projectile.y, '#fbbf24', 16, 7, 0.28);
      }

      if (nextTurnTimeoutRef.current) {
        window.clearTimeout(nextTurnTimeoutRef.current);
      }

      nextTurnTimeoutRef.current = window.setTimeout(switchTurn, SETTINGS.turnDelayMs);
    };

    const checkHit = (x: number, y: number, target: Player) => {
      const pad = 12;

      return (
        x > target.x - pad &&
        x < target.x + SETTINGS.playerSize + pad &&
        y > target.y - pad &&
        y < target.y + SETTINGS.playerSize + 8
      );
    };

    const getShotVelocity = () => {
      const pullX = dragRef.current.startX - dragRef.current.currX;
      const pullY = dragRef.current.startY - dragRef.current.currY;

      const vx = clamp(pullX * SETTINGS.launchScale, -SETTINGS.maxPower, SETTINGS.maxPower);
      const vy = clamp(pullY * SETTINGS.launchScale, -SETTINGS.maxPower, SETTINGS.maxPower);

      return { vx, vy, power: Math.min(1, Math.sqrt(pullX * pullX + pullY * pullY) / 260) };
    };

    const drawSky = (width: number, height: number, now: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#050716');
      sky.addColorStop(0.42, '#131943');
      sky.addColorStop(0.75, '#261e55');
      sky.addColorStop(1, '#110b23');

      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      const nebula = ctx.createRadialGradient(width * 0.66, height * 0.2, 0, width * 0.66, height * 0.2, height * 0.7);
      nebula.addColorStop(0, 'rgba(116,142,255,0.2)');
      nebula.addColorStop(0.42, 'rgba(255,84,142,0.08)');
      nebula.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < starsRef.current.length; i += 1) {
        const star = starsRef.current[i];
        const alpha = 0.25 + ((Math.sin(now * 0.0014 + star.phase) + 1) / 2) * 0.58;

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      const moonX = width * 0.55;
      const moonY = height * 0.2;

      const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 110);
      moonGlow.addColorStop(0, 'rgba(255,255,255,0.24)');
      moonGlow.addColorStop(0.4, 'rgba(140,170,255,0.1)');
      moonGlow.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 110, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fbff';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 31, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(180,195,220,0.28)';
      ctx.beginPath();
      ctx.arc(moonX - 8, moonY - 7, 5, 0, Math.PI * 2);
      ctx.arc(moonX + 10, moonY + 6, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawClouds = (width: number, dt60: number) => {
      const wind = hiddenWindRef.current;

      ctx.save();

      for (let i = 0; i < cloudsRef.current.length; i += 1) {
        const cloud = cloudsRef.current[i];

        cloud.x += (cloud.speed + wind * 28) * dt60;

        if (cloud.x < -240) cloud.x = SETTINGS.worldWidth + 180;
        if (cloud.x > SETTINGS.worldWidth + 240) cloud.x = -180;

        const screenX = cloud.x - cameraRef.current.x * 0.12;
        if (screenX < -260 || screenX > width + 260) continue;

        const grad = ctx.createRadialGradient(screenX, cloud.y, 0, screenX, cloud.y, cloud.w);
        grad.addColorStop(0, `rgba(255,255,255,${cloud.alpha})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(screenX, cloud.y, cloud.w, cloud.w * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const drawHills = (width: number, height: number) => {
      for (let i = 0; i < hillsRef.current.length; i += 1) {
        const layer = hillsRef.current[i];

        ctx.save();
        ctx.globalAlpha = layer.alpha;
        ctx.translate(-cameraRef.current.x * layer.speed, 0);

        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let j = 0; j < layer.points.length; j += 1) {
          const point = layer.points[j];
          ctx.lineTo(point.x, point.y);
        }

        ctx.lineTo(SETTINGS.worldWidth, height);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let j = 0; j < layer.points.length; j += 1) {
          const point = layer.points[j];

          if (j === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }

        ctx.stroke();
        ctx.restore();
      }

      const fog = ctx.createLinearGradient(0, height * 0.34, 0, height * 0.84);
      fog.addColorStop(0, 'rgba(255,255,255,0)');
      fog.addColorStop(1, 'rgba(255,255,255,0.05)');

      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, width, height);
    };

    const drawGround = (height: number) => {
      const groundGradient = ctx.createLinearGradient(0, height - SETTINGS.groundOffset - 44, 0, height);
      groundGradient.addColorStop(0, '#0b5b35');
      groundGradient.addColorStop(0.5, '#073b23');
      groundGradient.addColorStop(1, '#02120b');

      ctx.fillStyle = groundGradient;
      ctx.beginPath();
      ctx.moveTo(0, height);

      for (let x = 0; x <= SETTINGS.worldWidth; x += 12) {
        ctx.lineTo(x, getGroundY(x, height));
      }

      ctx.lineTo(SETTINGS.worldWidth, height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(118,255,191,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let x = 0; x <= SETTINGS.worldWidth; x += 18) {
        const y = getGroundY(x, height);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
    };

    const drawGrass = (height: number, width: number, now: number) => {
      const cameraX = cameraRef.current.x;
      const wind = hiddenWindRef.current;
      const time = now * 0.002;

      ctx.lineWidth = 1;

      for (let i = 0; i < grassRef.current.length; i += 1) {
        const blade = grassRef.current[i];
        if (blade.x < cameraX - 90 || blade.x > cameraX + width + 90) continue;

        const y = getGroundY(blade.x, height);
        const sway = Math.sin(time + blade.phase) * 3 + wind * 130;

        ctx.strokeStyle = blade.color;
        ctx.beginPath();
        ctx.moveTo(blade.x, y);
        ctx.quadraticCurveTo(
          blade.x + sway * 0.25,
          y - blade.h * 0.65,
          blade.x + sway,
          y - blade.h,
        );
        ctx.stroke();
      }
    };

    const drawPlayer = (player: Player, now: number, isActive: boolean) => {
      const bob = Math.sin(now * 0.004 + player.x * 0.01) * 1.4;
      const x = player.x;
      const y = player.y + bob;
      const s = SETTINGS.playerSize;
      const f = player.facing;

      ctx.save();

      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.ellipse(x + s / 2, y + s + 5, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isActive) {
        const glow = ctx.createRadialGradient(x + s / 2, y + s / 2, 0, x + s / 2, y + s / 2, 58);
        glow.addColorStop(0, player.glow);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, 58, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.translate(x + s / 2, y + s / 2);
      ctx.scale(f, 1);
      ctx.translate(-s / 2, -s / 2);

      ctx.fillStyle = '#101827';
      roundedRect(ctx, 13, 21, 32, 33, 12);
      ctx.fill();

      const bodyGrad = ctx.createLinearGradient(13, 21, 45, 55);
      bodyGrad.addColorStop(0, player.color);
      bodyGrad.addColorStop(1, '#101827');

      ctx.fillStyle = bodyGrad;
      roundedRect(ctx, 14, 20, 30, 34, 11);
      ctx.fill();

      ctx.fillStyle = '#f0b38a';
      ctx.beginPath();
      ctx.arc(29, 10, 13, 0, Math.PI * 2);
      ctx.fill();

      const helmet = ctx.createLinearGradient(16, -4, 46, 16);
      helmet.addColorStop(0, '#f8fafc');
      helmet.addColorStop(1, player.color);

      ctx.fillStyle = helmet;
      ctx.beginPath();
      ctx.arc(29, 7, 14, Math.PI, Math.PI * 2);
      ctx.lineTo(43, 10);
      ctx.quadraticCurveTo(32, 15, 16, 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(34, 9, 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f0b38a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(39, 31);
      ctx.lineTo(59, 24);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(49, 22);
      ctx.lineTo(74, 15);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(76, 14);
      ctx.lineTo(65, 9);
      ctx.lineTo(67, 19);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(21, 52);
      ctx.lineTo(16, 68);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(37, 52);
      ctx.lineTo(44, 68);
      ctx.stroke();

      ctx.restore();
    };

    const drawAim = (height: number) => {
      if (!dragRef.current.active || projectileRef.current.active || winnerRef.current) return;

      const shooter = turnRef.current === 1 ? p1Ref.current : p2Ref.current;
      const shot = getShotVelocity();

      const originX = shooter.x + SETTINGS.playerSize / 2 + shooter.facing * 22;
      const originY = shooter.y + SETTINGS.playerSize / 2 - 2;

      let tx = originX;
      let ty = originY;
      let tvx = shot.vx;
      let tvy = shot.vy;

      ctx.save();

      for (let i = 0; i < 72; i += 1) {
        if (i % 2 === 0) {
          const alpha = 0.45 * (1 - i / 72);

          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.4 * (1 - i / 80), 0, Math.PI * 2);
          ctx.fill();
        }

        tvx += hiddenWindRef.current * SETTINGS.windForce * 2;
        tvy += SETTINGS.gravity * 2;
        tx += tvx * 2;
        ty += tvy * 2;

        if (ty > getGroundY(tx, height)) break;
      }

      const meterX = shooter.x + SETTINGS.playerSize / 2 - 52 * shooter.facing;
      const meterY = shooter.y - 118;

      ctx.fillStyle = 'rgba(2,6,23,0.68)';
      roundedRect(ctx, meterX - 9, meterY, 18, 140, 7);
      ctx.fill();

      const fillHeight = Math.max(0, shot.power * 130);

      const powerGrad = ctx.createLinearGradient(0, meterY + 140, 0, meterY);
      powerGrad.addColorStop(0, '#33e6c0');
      powerGrad.addColorStop(0.6, '#fbbf24');
      powerGrad.addColorStop(1, '#ff4d5f');

      ctx.fillStyle = powerGrad;
      roundedRect(ctx, meterX - 5, meterY + 136 - fillHeight, 10, fillHeight, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = '900 18px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(shot.power * 100)}%`, shooter.x + SETTINGS.playerSize / 2, shooter.y - 26);

      ctx.restore();
    };

    const drawSpear = (projectile: Projectile) => {
      ctx.save();

      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(projectile.angle);

      const trail = ctx.createLinearGradient(-56, 0, 28, 0);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, 'rgba(255,255,255,0.55)');

      ctx.strokeStyle = trail;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-58, 0);
      ctx.lineTo(-18, 0);
      ctx.stroke();

      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(28, 0);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(15,23,42,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-26, 2.5);
      ctx.lineTo(20, 2.5);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(18, -8);
      ctx.lineTo(20, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(24, -4);
      ctx.lineTo(25, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawTrail = () => {
      ctx.save();

      for (let i = 0; i < trailRef.current.length; i += 1) {
        const dot = trailRef.current[i];

        ctx.fillStyle = `rgba(255,255,255,${dot.alpha})`;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const updateParticles = (dt60: number) => {
      const next: Particle[] = [];

      for (let i = 0; i < particlesRef.current.length; i += 1) {
        const p = particlesRef.current[i];

        p.x += p.vx * dt60;
        p.vy += p.gravity * dt60;
        p.y += p.vy * dt60;
        p.life -= 0.035 * dt60;

        if (p.life > 0) {
          next.push(p);

          const alpha = Math.max(0, p.life / p.maxLife);

          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      particlesRef.current = next;
    };

    const updateProjectile = (height: number, now: number, dt60: number) => {
      const projectile = projectileRef.current;
      if (!projectile.active) return;

      const target = projectile.owner === 1 ? p2Ref.current : p1Ref.current;
      const dx = target.x + SETTINGS.playerSize / 2 - projectile.x;
      const dy = target.y + SETTINGS.playerSize / 2 - projectile.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!projectile.slowMoUsed && distance < SETTINGS.slowMoDistance) {
        projectile.slowMoUsed = true;
        slowMoUntilRef.current = now + SETTINGS.slowMoDurationMs;
      }

      const timeScale = now < slowMoUntilRef.current ? SETTINGS.slowMoScale : 1;
      const scaledDt = dt60 * timeScale;

      const steps = 2;

      for (let i = 0; i < steps; i += 1) {
        projectile.vx += hiddenWindRef.current * SETTINGS.windForce * scaledDt;
        projectile.vy += SETTINGS.gravity * scaledDt;

        projectile.x += projectile.vx * scaledDt;
        projectile.y += projectile.vy * scaledDt;

        projectile.angle = Math.atan2(projectile.vy, projectile.vx);

        if (checkHit(projectile.x, projectile.y, target)) {
          finishProjectile(true, target);
          break;
        }

        if (
          projectile.y > getGroundY(projectile.x, height) + 20 ||
          projectile.x < -100 ||
          projectile.x > SETTINGS.worldWidth + 100
        ) {
          finishProjectile(false);
          break;
        }
      }

      if (projectile.active) {
        trailRef.current.unshift({
          x: projectile.x,
          y: projectile.y,
          alpha: 0.5,
          size: 3.2,
        });

        trailRef.current = trailRef.current
          .slice(0, SETTINGS.maxTrailDots)
          .map((dot, index) => ({
            ...dot,
            alpha: Math.max(0, 0.45 * (1 - index / SETTINGS.maxTrailDots)),
            size: Math.max(0.6, 3.2 * (1 - index / SETTINGS.maxTrailDots)),
          }));
      }
    };

    const drawVignette = (width: number, height: number, now: number) => {
      const slow = now < slowMoUntilRef.current;

      const vignette = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.12,
        width / 2,
        height / 2,
        height * 0.76,
      );

      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, slow ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.18)');

      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      if (slow) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = '900 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '3px';
        ctx.fillText('FOCUS', width / 2, 74);
      }
    };

    const render = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const prev = lastFrameRef.current || now;
      const dtMs = Math.min(32, now - prev);
      const dt60 = dtMs / 16.6667;

      lastFrameRef.current = now;

      const projectile = projectileRef.current;
      const camera = cameraRef.current;

      if (projectile.active) {
        camera.targetX = projectile.x - width / 2;
      } else if (!projectile.landed) {
        const current = turnRef.current === 1 ? p1Ref.current : p2Ref.current;
        camera.targetX = current.x - width / 2;
      }

      camera.targetX = clamp(camera.targetX, 0, Math.max(0, SETTINGS.worldWidth - width));

      const cameraLerp = projectile.active ? SETTINGS.cameraLerpProjectile : SETTINGS.cameraLerpIdle;
      camera.x += (camera.targetX - camera.x) * cameraLerp * dt60;

      if (camera.shake > 0.1) {
        camera.shake *= Math.pow(0.82, dt60);
      } else {
        camera.shake = 0;
      }

      drawSky(width, height, now);
      drawClouds(width, dt60);
      drawHills(width, height);

      const shakeX = camera.shake ? (Math.random() - 0.5) * camera.shake : 0;
      const shakeY = camera.shake ? (Math.random() - 0.5) * camera.shake * 0.5 : 0;

      ctx.save();
      ctx.translate(-camera.x + shakeX, shakeY);

      drawGround(height);

      drawPlayer(p1Ref.current, now, turnRef.current === 1 && !projectile.active);
      drawPlayer(p2Ref.current, now, turnRef.current === 2 && !projectile.active);

      drawAim(height);
      updateProjectile(height, now, dt60);
      drawTrail();

      if (projectile.active) {
        drawSpear(projectile);
      }

      updateParticles(dt60);
      drawGrass(height, width, now);

      ctx.restore();

      drawVignette(width, height, now);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (nextTurnTimeoutRef.current) {
        window.clearTimeout(nextTurnTimeoutRef.current);
      }
    };
  }, [applyGameHeight, randomizeHiddenWind, syncPlayersForHeight]);

  const beginDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    if (winnerRef.current) return;
    if (projectileRef.current.active || projectileRef.current.landed) return;

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currX: event.clientX,
      currY: event.clientY,
    };

    setShotHint('RELEASE TO THROW');
    triggerHaptic('light');

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }
  };

  const moveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== event.pointerId) return;

    dragRef.current.currX = event.clientX;
    dragRef.current.currY = event.clientY;
  };

  const finishShot = () => {
    if (!dragRef.current.active) return;
    if (winnerRef.current) return;

    const pullX = dragRef.current.startX - dragRef.current.currX;
    const pullY = dragRef.current.startY - dragRef.current.currY;

    const vx = clamp(pullX * SETTINGS.launchScale, -SETTINGS.maxPower, SETTINGS.maxPower);
    const vy = clamp(pullY * SETTINGS.launchScale, -SETTINGS.maxPower, SETTINGS.maxPower);

    const shooter = turnRef.current === 1 ? p1Ref.current : p2Ref.current;

    projectileRef.current = {
      x: shooter.x + SETTINGS.playerSize / 2 + shooter.facing * 24,
      y: shooter.y + SETTINGS.playerSize / 2 - 2,
      vx,
      vy,
      angle: Math.atan2(vy, vx),
      active: true,
      landed: false,
      owner: turnRef.current,
      slowMoUsed: false,
    };

    slowMoUntilRef.current = 0;
    trailRef.current = [];
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;

    setShotHint('SPEAR IN FLIGHT');
    triggerHaptic('light');
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    if (dragRef.current.pointerId !== event.pointerId) return;

    finishShot();

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }
  };

  const cancelDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    if (dragRef.current.pointerId !== event.pointerId) return;

    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
    setShotHint('DRAG TO AIM');
  };

  const Heart = ({ filled, color }: { filled: boolean; color: string }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={`transition-all duration-300 ${
        filled ? 'scale-100 opacity-100' : 'scale-75 opacity-20'
      }`}
      style={{ filter: filled ? `drop-shadow(0 0 8px ${color})` : 'none' }}
    >
      <path
        fill={color}
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"
      />
    </svg>
  );

  return (
    <div
      ref={rootRef}
      className="relative h-[var(--archer-h)] max-h-[var(--archer-h)] min-h-0 w-full overflow-hidden select-none bg-[#040716] text-white"
      style={{
        '--archer-h': '100%',
        touchAction: 'none',
        overscrollBehavior: 'none',
      } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
        }}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-3">
        <div
          className={`rounded-2xl border border-white/10 bg-black/35 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.32)] backdrop-blur-xl transition ${
            turn === 1 && !winner ? 'scale-100 opacity-100' : 'scale-95 opacity-45'
          }`}
        >
          <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/48">
            RED
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: SETTINGS.maxHP }).map((_, index) => (
              <Heart key={index} filled={p1State.hp > index} color={p1State.color} />
            ))}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-white/62 backdrop-blur-xl transition active:scale-95"
          >
            Exit
          </button>

          <div className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white/62 backdrop-blur-xl">
            {winner ? 'ROUND OVER' : turn === 1 ? 'RED TURN' : 'BLUE TURN'}
          </div>

          <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/42 backdrop-blur-xl">
            {shotHint}
          </div>
        </div>

        <div
          className={`rounded-2xl border border-white/10 bg-black/35 p-2 text-right shadow-[0_16px_45px_rgba(0,0,0,0.32)] backdrop-blur-xl transition ${
            turn === 2 && !winner ? 'scale-100 opacity-100' : 'scale-95 opacity-45'
          }`}
        >
          <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/48">
            BLUE
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: SETTINGS.maxHP }).map((_, index) => (
              <Heart key={index} filled={p2State.hp > index} color={p2State.color} />
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
        <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/46 backdrop-blur-xl">
          Pull back, aim, release
        </div>
      </div>

      {winner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#020617]/88 p-6 text-center backdrop-blur-xl">
          <div className="w-full max-w-[360px] rounded-[32px] border border-white/10 bg-white/[0.07] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.26em] text-white/42">
              Duel Complete
            </div>

            <h2
              className="text-[48px] font-black leading-none tracking-[-0.08em]"
              style={{
                color: winner === 1 ? p1State.color : p2State.color,
                textShadow:
                  winner === 1
                    ? '0 0 28px rgba(255,77,95,0.42)'
                    : '0 0 28px rgba(77,141,255,0.42)',
              }}
            >
              {winner === 1 ? 'RED' : 'BLUE'} WIN
            </h2>

            <p className="mx-auto mt-3 max-w-[260px] text-sm font-medium leading-relaxed text-white/46">
              Красивый бросок. Скрытый ветер уже изменится в новом раунде.
            </p>

            <button
              type="button"
              onClick={resetGame}
              className="mt-6 h-13 w-full rounded-[20px] bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-[#050610] transition active:scale-95"
            >
              Rematch
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-3 h-11 w-full rounded-[18px] border border-white/10 bg-white/[0.05] text-xs font-black uppercase tracking-[0.16em] text-white/54 transition active:scale-95"
            >
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};