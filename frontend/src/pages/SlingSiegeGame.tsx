/* eslint-disable react-hooks/immutability */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import {
  SLING_SIEGE_LEVELS,
  type SlingBiome,
  type SlingMaterial,
  type SlingProjectileKind,
  type SlingSiegeLevel,
} from '../data/slingSiegeLevels';
import backgroundMeadow from '../assets/games/sling/background_meadow.webp';
import backgroundSunset from '../assets/games/sling/background_sunset.webp';
import backgroundNight from '../assets/games/sling/background_night.webp';
import groundImage from '../assets/games/sling/ground.webp';
import slingshotImage from '../assets/games/sling/slingshot.webp';
import strikerImage from '../assets/games/sling/creature_striker.webp';
import splitterImage from '../assets/games/sling/creature_splitter.webp';
import novaImage from '../assets/games/sling/creature_nova.webp';
import crusherImage from '../assets/games/sling/creature_crusher.webp';
import dropperImage from '../assets/games/sling/creature_dropper.webp';
import enemyImage from '../assets/games/sling/enemy_gloom.webp';
import woodImage from '../assets/games/sling/block_wood.webp';
import glassImage from '../assets/games/sling/block_glass.webp';
import stoneImage from '../assets/games/sling/block_stone.webp';
import chargeImage from '../assets/games/sling/block_charge.webp';

const WORLD_W = 1080;
const VIEW_W = 520;
const VIEW_H = 560;
const GROUND_Y = 500;
const SLING_X = 108;
const SLING_Y = 382;
const MAX_PULL = 92;
const LAUNCH_SCALE = 5.65;
const GRAVITY = 760;
const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 5;
const PROJECTILE_MAX_LIFE = 8;
const CAMERA_FOLLOW_X = VIEW_W * 0.38;

const MATERIAL_HP: Record<SlingMaterial, number> = {
  wood: 92,
  glass: 52,
  stone: 185,
  charge: 38,
};

const MATERIAL_MASS: Record<SlingMaterial, number> = {
  wood: 1,
  glass: 0.62,
  stone: 2.15,
  charge: 0.9,
};

const MATERIAL_RESTITUTION: Record<SlingMaterial, number> = {
  wood: 0.16,
  glass: 0.22,
  stone: 0.08,
  charge: 0.14,
};

const PROJECTILE_META: Record<
  SlingProjectileKind,
  {
    label: string;
    ability: string;
    mass: number;
    radius: number;
    image: string;
    tint: string;
  }
> = {
  striker: {
    label: 'STRIKER',
    ability: 'TAP · BOOST',
    mass: 1.08,
    radius: 20,
    image: strikerImage,
    tint: '#ff6b55',
  },
  splitter: {
    label: 'ECHO',
    ability: 'TAP · SPLIT',
    mass: 0.82,
    radius: 18,
    image: splitterImage,
    tint: '#71c9ff',
  },
  nova: {
    label: 'NOVA',
    ability: 'TAP · BLAST',
    mass: 1.05,
    radius: 20,
    image: novaImage,
    tint: '#aa7cff',
  },
  crusher: {
    label: 'TITAN',
    ability: 'TAP · SLAM',
    mass: 2.2,
    radius: 23,
    image: crusherImage,
    tint: '#ffb44f',
  },
  dropper: {
    label: 'COMET',
    ability: 'TAP · DROP',
    mass: 1,
    radius: 19,
    image: dropperImage,
    tint: '#70e5ad',
  },
};

type ImageKey =
  | SlingBiome
  | SlingMaterial
  | SlingProjectileKind
  | 'ground'
  | 'slingshot'
  | 'enemy';

type LoadedImages = Partial<Record<ImageKey, HTMLImageElement>>;

type ProjectileBody = {
  id: number;
  kind: SlingProjectileKind | 'payload';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
  rotation: number;
  omega: number;
  alive: boolean;
  age: number;
  abilityUsed: boolean;
  primary: boolean;
  sleepingFor: number;
};

type BlockBody = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  material: SlingMaterial;
  hp: number;
  maxHp: number;
  mass: number;
  invMass: number;
  alive: boolean;
  hitFlash: number;
};

type EnemyBody = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  alive: boolean;
  rotation: number;
  omega: number;
  hitFlash: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  omega: number;
  color: string;
  shape: 'rect' | 'circle';
};

type PointerMode = 'idle' | 'aim' | 'pan';

type ResultState = 'none' | 'cleared' | 'failed';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));


const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const materialColor = (material: SlingMaterial) => {
  if (material === 'wood') return '#b87944';
  if (material === 'glass') return '#8fe4ef';
  if (material === 'stone') return '#858b96';
  return '#e95f55';
};

const haptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  const browser = window as typeof window & {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred?: (style: string) => void;
          notificationOccurred?: (type: string) => void;
        };
      };
    };
  };

  browser.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);
};

const notifyHaptic = (type: 'success' | 'error') => {
  const browser = window as typeof window & {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          notificationOccurred?: (value: string) => void;
        };
      };
    };
  };

  browser.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type);
};

function imageMapSources(): Record<ImageKey, string> {
  return {
    meadow: backgroundMeadow,
    sunset: backgroundSunset,
    night: backgroundNight,
    ground: groundImage,
    slingshot: slingshotImage,
    enemy: enemyImage,
    wood: woodImage,
    glass: glassImage,
    stone: stoneImage,
    charge: chargeImage,
    striker: strikerImage,
    splitter: splitterImage,
    nova: novaImage,
    crusher: crusherImage,
    dropper: dropperImage,
  };
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function SlingSiegeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const imagesRef = useRef<LoadedImages>({});
  const dprRef = useRef(1);
  const lastFrameRef = useRef(0);
  const accumulatorRef = useRef(0);
  const pointerModeRef = useRef<PointerMode>('idle');
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const cameraStartRef = useRef(0);
  const aimPointRef = useRef({ x: SLING_X, y: SLING_Y });
  const cameraXRef = useRef(0);
  const targetCameraRef = useRef(0);
  const introStartedRef = useRef(0);
  const introActiveRef = useRef(true);
  const shotCounterRef = useRef(1);
  const currentPrimaryIdRef = useRef<number | null>(null);
  const projectilesRef = useRef<ProjectileBody[]>([]);
  const blocksRef = useRef<BlockBody[]>([]);
  const enemiesRef = useRef<EnemyBody[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const settleTimerRef = useRef(0);
  const shotsUsedRef = useRef(0);
  const currentQueueIndexRef = useRef(0);
  const resultRef = useRef<ResultState>('none');
  const activeLevelRef = useRef(0);
  const lastUiSyncRef = useRef(0);

  const [levelIndex, setLevelIndex] = useState(0);
  const [imagesReady, setImagesReady] = useState(false);
  const [isAiming, setIsAiming] = useState(true);
  const [isFlying, setIsFlying] = useState(false);
  const [shotsUsed, setShotsUsed] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  const [enemiesLeft, setEnemiesLeft] = useState(0);
  const [result, setResult] = useState<ResultState>('none');
  const [abilityReady, setAbilityReady] = useState(false);
  const [introActive, setIntroActive] = useState(true);

  const level = SLING_SIEGE_LEVELS[levelIndex];
  const currentKind = level.queue[Math.min(queueIndex, level.queue.length - 1)];
  const currentMeta = PROJECTILE_META[currentKind];

  const levelProgress = useMemo(
    () => `${levelIndex + 1} / ${SLING_SIEGE_LEVELS.length}`,
    [levelIndex],
  );

  const buildLevel = useCallback((nextLevel: SlingSiegeLevel) => {
    blocksRef.current = nextLevel.blocks.map((block, index) => {
      const mass = MATERIAL_MASS[block.material] * Math.max(0.7, (block.w * block.h) / 4200);
      const hp = MATERIAL_HP[block.material];

      return {
        id: index + 1,
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h,
        angle: block.angle ?? 0,
        vx: 0,
        vy: 0,
        omega: 0,
        material: block.material,
        hp,
        maxHp: hp,
        mass,
        invMass: 1 / mass,
        alive: true,
        hitFlash: 0,
      };
    });

    enemiesRef.current = nextLevel.enemies.map((enemy, index) => ({
      id: index + 1,
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: 0,
      r: enemy.r ?? 20,
      hp: 88,
      alive: true,
      rotation: 0,
      omega: 0,
      hitFlash: 0,
    }));

    projectilesRef.current = [];
    particlesRef.current = [];
    aimPointRef.current = { x: SLING_X, y: SLING_Y };
    cameraXRef.current = 0;
    targetCameraRef.current = 0;
    introStartedRef.current = performance.now();
    introActiveRef.current = true;
    settleTimerRef.current = 0;
    shotsUsedRef.current = 0;
    currentQueueIndexRef.current = 0;
    currentPrimaryIdRef.current = null;
    resultRef.current = 'none';
    shakeRef.current = 0;
    pointerModeRef.current = 'idle';

    setShotsUsed(0);
    setQueueIndex(0);
    setEnemiesLeft(nextLevel.enemies.length);
    setResult('none');
    setIsAiming(true);
    setIsFlying(false);
    setAbilityReady(false);
    setIntroActive(true);
  }, []);

  useEffect(() => {
    activeLevelRef.current = levelIndex;
    buildLevel(SLING_SIEGE_LEVELS[levelIndex]);
  }, [buildLevel, levelIndex]);

  useEffect(() => {
    let cancelled = false;
    const sources = imageMapSources();
    const entries = Object.entries(sources) as Array<[ImageKey, string]>;
    let loaded = 0;

    const finishOne = () => {
      loaded += 1;
      if (!cancelled && loaded === entries.length) setImagesReady(true);
    };

    for (const [key, src] of entries) {
      const image = new Image();
      image.decoding = 'async';
      image.onload = finishOne;
      image.onerror = finishOne;
      image.src = src;
      imagesRef.current[key] = image;
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const spawnParticles = useCallback(
    (
      x: number,
      y: number,
      color: string,
      count: number,
      power: number,
      shape: Particle['shape'] = 'rect',
    ) => {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = power * (0.35 + Math.random() * 0.75);
        const maxLife = 0.45 + Math.random() * 0.55;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - power * 0.18,
          life: maxLife,
          maxLife,
          size: 3 + Math.random() * 8,
          rotation: Math.random() * Math.PI * 2,
          omega: (Math.random() - 0.5) * 12,
          color,
          shape,
        });
      }

      if (particlesRef.current.length > 220) {
        particlesRef.current.splice(0, particlesRef.current.length - 220);
      }
    },
    [],
  );

  const explodeAt = useCallback(
    (x: number, y: number, radius = 132, damage = 150, impulse = 360) => {
      spawnParticles(x, y, '#ffb245', 34, 340, 'circle');
      spawnParticles(x, y, '#f55e55', 18, 260, 'rect');
      shakeRef.current = Math.max(shakeRef.current, 14);
      haptic('heavy');

      for (const block of blocksRef.current) {
        if (!block.alive) continue;
        const dx = block.x - x;
        const dy = block.y - y;
        const dist = Math.max(18, Math.hypot(dx, dy));
        if (dist > radius) continue;
        const strength = 1 - dist / radius;
        block.hp -= damage * strength;
        block.vx += (dx / dist) * impulse * strength * block.invMass;
        block.vy += (dy / dist) * impulse * strength * block.invMass - 80 * strength;
        block.omega += (Math.random() - 0.5) * 4 * strength;
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const dist = Math.max(10, Math.hypot(dx, dy));
        if (dist > radius) continue;
        const strength = 1 - dist / radius;
        enemy.hp -= damage * 0.9 * strength + 38 * strength;
        enemy.vx += (dx / dist) * impulse * 0.9 * strength;
        enemy.vy += (dy / dist) * impulse * 0.9 * strength - 90 * strength;
      }
    },
    [spawnParticles],
  );

  const killBlock = useCallback(
    (block: BlockBody) => {
      if (!block.alive) return;
      block.alive = false;
      const color = materialColor(block.material);
      spawnParticles(block.x, block.y, color, block.material === 'glass' ? 26 : 18, 180);
      shakeRef.current = Math.max(shakeRef.current, block.material === 'stone' ? 7 : 4);

      if (block.material === 'charge') {
        explodeAt(block.x, block.y, 145, 175, 420);
      } else {
        haptic(block.material === 'stone' ? 'medium' : 'light');
      }
    },
    [explodeAt, spawnParticles],
  );

  const killEnemy = useCallback(
    (enemy: EnemyBody) => {
      if (!enemy.alive) return;
      enemy.alive = false;
      spawnParticles(enemy.x, enemy.y, '#8be071', 22, 180, 'circle');
      spawnParticles(enemy.x, enemy.y, '#2d6237', 10, 125, 'rect');
      shakeRef.current = Math.max(shakeRef.current, 6);
      haptic('medium');
    },
    [spawnParticles],
  );

  const damageBlock = useCallback(
    (block: BlockBody, damage: number, impulseX: number, impulseY: number, hitX: number) => {
      if (!block.alive) return;
      block.hp -= damage;
      block.vx += impulseX * block.invMass;
      block.vy += impulseY * block.invMass;
      block.omega += ((hitX - block.x) / Math.max(20, block.w)) * impulseY * 0.004;
      block.hitFlash = 0.09;

      if (block.hp <= 0) killBlock(block);
    },
    [killBlock],
  );

  const collideProjectileBlock = useCallback(
    (projectile: ProjectileBody, block: BlockBody) => {
      if (!projectile.alive || !block.alive) return false;

      const halfW = block.w / 2;
      const halfH = block.h / 2;
      const closestX = clamp(projectile.x, block.x - halfW, block.x + halfW);
      const closestY = clamp(projectile.y, block.y - halfH, block.y + halfH);
      const dx = projectile.x - closestX;
      const dy = projectile.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq > projectile.r * projectile.r) return false;

      let nx = 0;
      let ny = -1;
      let dist = Math.sqrt(Math.max(0.0001, distSq));

      if (distSq > 0.001) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        const left = Math.abs(projectile.x - (block.x - halfW));
        const right = Math.abs(block.x + halfW - projectile.x);
        const top = Math.abs(projectile.y - (block.y - halfH));
        const bottom = Math.abs(block.y + halfH - projectile.y);
        const min = Math.min(left, right, top, bottom);
        if (min === left) {
          nx = -1;
          ny = 0;
        } else if (min === right) {
          nx = 1;
          ny = 0;
        } else if (min === bottom) {
          nx = 0;
          ny = 1;
        }
        dist = 0;
      }

      const penetration = projectile.r - dist;
      projectile.x += nx * Math.max(0, penetration + 0.4);
      projectile.y += ny * Math.max(0, penetration + 0.4);

      const vn = projectile.vx * nx + projectile.vy * ny;
      const speed = Math.hypot(projectile.vx, projectile.vy);
      const materialFactor = block.material === 'stone' ? 0.72 : block.material === 'glass' ? 1.35 : 1;
      const isPayload = projectile.kind === 'payload';
      const damage = (28 + speed * 0.16 * projectile.mass) * materialFactor * (isPayload ? 1.7 : 1);
      const impulse = Math.max(0, -vn) * projectile.mass * 0.62;

      damageBlock(block, damage, -nx * impulse, -ny * impulse, projectile.x);

      if (vn < 0) {
        const restitution = MATERIAL_RESTITUTION[block.material];
        projectile.vx -= (1 + restitution) * vn * nx;
        projectile.vy -= (1 + restitution) * vn * ny;
        projectile.vx *= 0.84;
        projectile.vy *= 0.84;
        projectile.omega += (Math.random() - 0.5) * 2.2;
      }

      spawnParticles(closestX, closestY, materialColor(block.material), block.material === 'glass' ? 10 : 5, 90);
      shakeRef.current = Math.max(shakeRef.current, Math.min(8, speed / 90));

      if (isPayload) {
        projectile.alive = false;
        explodeAt(projectile.x, projectile.y, 96, 112, 270);
      }

      return true;
    },
    [damageBlock, explodeAt, spawnParticles],
  );

  const collideProjectileEnemy = useCallback(
    (projectile: ProjectileBody, enemy: EnemyBody) => {
      if (!projectile.alive || !enemy.alive) return false;
      const dx = projectile.x - enemy.x;
      const dy = projectile.y - enemy.y;
      const minDist = projectile.r + enemy.r;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) return false;

      const dist = Math.max(0.001, Math.sqrt(distSq));
      const nx = dx / dist;
      const ny = dy / dist;
      const speed = Math.hypot(projectile.vx, projectile.vy);
      const penetration = minDist - dist;
      projectile.x += nx * penetration * 0.55;
      projectile.y += ny * penetration * 0.55;
      enemy.x -= nx * penetration * 0.45;
      enemy.y -= ny * penetration * 0.45;

      const damage = 38 + speed * 0.17 * projectile.mass + (projectile.kind === 'crusher' ? 28 : 0);
      enemy.hp -= damage;
      enemy.vx -= nx * speed * 0.44 * projectile.mass;
      enemy.vy -= ny * speed * 0.44 * projectile.mass;
      enemy.omega += projectile.vx * 0.006;
      enemy.hitFlash = 0.1;

      const vn = projectile.vx * nx + projectile.vy * ny;
      if (vn < 0) {
        projectile.vx -= 1.2 * vn * nx;
        projectile.vy -= 1.2 * vn * ny;
        projectile.vx *= 0.77;
        projectile.vy *= 0.77;
      }

      spawnParticles(enemy.x, enemy.y, '#b9f18c', 12, 110, 'circle');
      shakeRef.current = Math.max(shakeRef.current, 7);
      haptic('medium');

      if (enemy.hp <= 0) killEnemy(enemy);
      return true;
    },
    [killEnemy, spawnParticles],
  );

  const resolveBlockBlock = useCallback((a: BlockBody, b: BlockBody) => {
    if (!a.alive || !b.alive) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const overlapX = a.w / 2 + b.w / 2 - Math.abs(dx);
    const overlapY = a.h / 2 + b.h / 2 - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return;

    const totalInv = a.invMass + b.invMass;
    if (overlapY < overlapX) {
      const sign = dy >= 0 ? 1 : -1;
      const correction = overlapY + 0.15;
      a.y -= sign * correction * (a.invMass / totalInv);
      b.y += sign * correction * (b.invMass / totalInv);
      const relative = (b.vy - a.vy) * sign;
      if (relative < 0) {
        const impulse = (-relative * 0.88) / totalInv;
        a.vy -= sign * impulse * a.invMass;
        b.vy += sign * impulse * b.invMass;
      }
      a.vx *= 0.992;
      b.vx *= 0.992;
    } else {
      const sign = dx >= 0 ? 1 : -1;
      const correction = overlapX + 0.15;
      a.x -= sign * correction * (a.invMass / totalInv);
      b.x += sign * correction * (b.invMass / totalInv);
      const relative = (b.vx - a.vx) * sign;
      if (relative < 0) {
        const impulse = (-relative * 0.72) / totalInv;
        a.vx -= sign * impulse * a.invMass;
        b.vx += sign * impulse * b.invMass;
      }
    }
  }, []);

  const resolveEnemyBlock = useCallback(
    (enemy: EnemyBody, block: BlockBody) => {
      if (!enemy.alive || !block.alive) return;
      const halfW = block.w / 2;
      const halfH = block.h / 2;
      const closestX = clamp(enemy.x, block.x - halfW, block.x + halfW);
      const closestY = clamp(enemy.y, block.y - halfH, block.y + halfH);
      const dx = enemy.x - closestX;
      const dy = enemy.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= enemy.r * enemy.r) return;

      const dist = Math.max(0.001, Math.sqrt(distSq));
      let nx = dx / dist;
      let ny = dy / dist;
      if (distSq < 0.001) {
        nx = 0;
        ny = enemy.y < block.y ? -1 : 1;
      }
      const penetration = enemy.r - (distSq < 0.001 ? 0 : dist);
      enemy.x += nx * (penetration + 0.2);
      enemy.y += ny * (penetration + 0.2);

      const blockSpeed = Math.hypot(block.vx, block.vy);
      const relativeSpeed = Math.hypot(enemy.vx - block.vx, enemy.vy - block.vy);
      if (blockSpeed > 55 || relativeSpeed > 105) {
        enemy.hp -= Math.max(8, block.mass * (blockSpeed + relativeSpeed * 0.45) * 0.12);
        enemy.hitFlash = 0.08;
        if (enemy.hp <= 0) killEnemy(enemy);
      }

      const vn = enemy.vx * nx + enemy.vy * ny;
      if (vn < 0) {
        enemy.vx -= 1.08 * vn * nx;
        enemy.vy -= 1.08 * vn * ny;
        enemy.vx *= 0.93;
      }
    },
    [killEnemy],
  );

  const finishLevel = useCallback((state: ResultState) => {
    if (resultRef.current !== 'none') return;
    resultRef.current = state;
    setResult(state);
    setIsFlying(false);
    setAbilityReady(false);
    pointerModeRef.current = 'idle';

    if (state === 'cleared') {
      notifyHaptic('success');
      shakeRef.current = Math.max(shakeRef.current, 8);
    } else {
      notifyHaptic('error');
    }
  }, []);

  const prepareNextShot = useCallback(() => {
    const nextIndex = currentQueueIndexRef.current + 1;
    const currentLevel = SLING_SIEGE_LEVELS[activeLevelRef.current];

    if (nextIndex >= currentLevel.queue.length) {
      finishLevel('failed');
      return;
    }

    currentQueueIndexRef.current = nextIndex;
    setQueueIndex(nextIndex);
    currentPrimaryIdRef.current = null;
    aimPointRef.current = { x: SLING_X, y: SLING_Y };
    targetCameraRef.current = 0;
    setIsAiming(true);
    setIsFlying(false);
    setAbilityReady(false);
    settleTimerRef.current = 0;
  }, [finishLevel]);

  const launchCurrent = useCallback(() => {
    if (!isAiming || introActiveRef.current || resultRef.current !== 'none') return;
    const currentLevel = SLING_SIEGE_LEVELS[activeLevelRef.current];
    const kind = currentLevel.queue[currentQueueIndexRef.current];
    if (!kind) return;

    const pullX = SLING_X - aimPointRef.current.x;
    const pullY = SLING_Y - aimPointRef.current.y;
    const pull = Math.hypot(pullX, pullY);
    if (pull < 16) {
      aimPointRef.current = { x: SLING_X, y: SLING_Y };
      return;
    }

    const meta = PROJECTILE_META[kind];
    const id = shotCounterRef.current++;
    const projectile: ProjectileBody = {
      id,
      kind,
      x: aimPointRef.current.x,
      y: aimPointRef.current.y,
      vx: pullX * LAUNCH_SCALE,
      vy: pullY * LAUNCH_SCALE,
      r: meta.radius,
      mass: meta.mass,
      rotation: 0,
      omega: 0,
      alive: true,
      age: 0,
      abilityUsed: false,
      primary: true,
      sleepingFor: 0,
    };

    projectilesRef.current.push(projectile);
    currentPrimaryIdRef.current = id;
    shotsUsedRef.current += 1;
    setShotsUsed(shotsUsedRef.current);
    setIsAiming(false);
    setIsFlying(true);
    setAbilityReady(true);
    aimPointRef.current = { x: SLING_X, y: SLING_Y };
    settleTimerRef.current = 0;
    haptic('medium');
  }, [isAiming]);

  const triggerAbility = useCallback(() => {
    if (!isFlying || !abilityReady || resultRef.current !== 'none') return;
    const primary = projectilesRef.current.find(
      (projectile) => projectile.id === currentPrimaryIdRef.current && projectile.alive,
    );
    if (!primary || primary.abilityUsed || primary.kind === 'payload') return;

    primary.abilityUsed = true;
    setAbilityReady(false);
    haptic('heavy');

    if (primary.kind === 'striker') {
      const speed = Math.max(1, Math.hypot(primary.vx, primary.vy));
      primary.vx = (primary.vx / speed) * Math.max(620, speed * 1.45);
      primary.vy = (primary.vy / speed) * Math.max(620, speed * 1.45) - 12;
      primary.omega += 5.5;
      spawnParticles(primary.x, primary.y, '#ff755f', 14, 120, 'circle');
      shakeRef.current = Math.max(shakeRef.current, 5);
      return;
    }

    if (primary.kind === 'splitter') {
      const speed = Math.max(240, Math.hypot(primary.vx, primary.vy));
      const angle = Math.atan2(primary.vy, primary.vx);
      primary.r = 15;
      primary.mass = 0.62;
      for (const offset of [-0.18, 0.18]) {
        projectilesRef.current.push({
          id: shotCounterRef.current++,
          kind: 'splitter',
          x: primary.x,
          y: primary.y,
          vx: Math.cos(angle + offset) * speed * 1.02,
          vy: Math.sin(angle + offset) * speed * 1.02,
          r: 14,
          mass: 0.58,
          rotation: primary.rotation,
          omega: primary.omega + offset * 8,
          alive: true,
          age: primary.age,
          abilityUsed: true,
          primary: false,
          sleepingFor: 0,
        });
      }
      spawnParticles(primary.x, primary.y, '#7bd4ff', 18, 115, 'circle');
      return;
    }

    if (primary.kind === 'nova') {
      explodeAt(primary.x, primary.y, 128, 128, 340);
      primary.vx *= 0.72;
      primary.vy *= 0.72;
      return;
    }

    if (primary.kind === 'crusher') {
      primary.vx *= 0.5;
      primary.vy = Math.max(520, primary.vy + 430);
      primary.mass = 2.65;
      primary.omega += 2.8;
      spawnParticles(primary.x, primary.y, '#ffc56d', 14, 105, 'rect');
      return;
    }

    if (primary.kind === 'dropper') {
      projectilesRef.current.push({
        id: shotCounterRef.current++,
        kind: 'payload',
        x: primary.x,
        y: primary.y + primary.r + 10,
        vx: primary.vx * 0.18,
        vy: Math.max(250, primary.vy + 280),
        r: 13,
        mass: 1.4,
        rotation: 0,
        omega: 4,
        alive: true,
        age: 0,
        abilityUsed: true,
        primary: false,
        sleepingFor: 0,
      });
      primary.vy -= 180;
      primary.vx *= 0.84;
      spawnParticles(primary.x, primary.y + 12, '#79efb5', 16, 100, 'circle');
    }
  }, [abilityReady, explodeAt, isFlying, spawnParticles]);

  const stepPhysics = useCallback(
    (dt: number) => {
      for (const block of blocksRef.current) {
        if (!block.alive) continue;
        block.hitFlash = Math.max(0, block.hitFlash - dt);
        block.vy += GRAVITY * dt;
        block.x += block.vx * dt;
        block.y += block.vy * dt;
        block.angle += block.omega * dt;
        block.vx *= 0.9986;
        block.vy *= 0.999;
        block.omega *= 0.996;

        if (block.x - block.w / 2 < 0) {
          block.x = block.w / 2;
          block.vx = Math.abs(block.vx) * 0.18;
        }
        if (block.x + block.w / 2 > WORLD_W) {
          block.x = WORLD_W - block.w / 2;
          block.vx = -Math.abs(block.vx) * 0.18;
        }
        if (block.y + block.h / 2 > GROUND_Y) {
          const impact = Math.abs(block.vy);
          block.y = GROUND_Y - block.h / 2;
          block.vy = -block.vy * MATERIAL_RESTITUTION[block.material] * 0.45;
          block.vx *= 0.9;
          block.omega *= 0.82;
          if (Math.abs(block.vy) < 8) block.vy = 0;
          if (impact > 280) shakeRef.current = Math.max(shakeRef.current, 2.5);
        }
      }

      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i < blocksRef.current.length; i += 1) {
          for (let j = i + 1; j < blocksRef.current.length; j += 1) {
            resolveBlockBlock(blocksRef.current[i], blocksRef.current[j]);
          }
        }
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        enemy.vy += GRAVITY * dt;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.rotation += enemy.omega * dt;
        enemy.vx *= 0.997;
        enemy.vy *= 0.999;
        enemy.omega *= 0.995;

        if (enemy.x - enemy.r < 0) {
          enemy.x = enemy.r;
          enemy.vx = Math.abs(enemy.vx) * 0.32;
        }
        if (enemy.x + enemy.r > WORLD_W) {
          enemy.x = WORLD_W - enemy.r;
          enemy.vx = -Math.abs(enemy.vx) * 0.32;
        }
        if (enemy.y + enemy.r > GROUND_Y) {
          const impact = Math.abs(enemy.vy);
          enemy.y = GROUND_Y - enemy.r;
          enemy.vy = -enemy.vy * 0.18;
          enemy.vx *= 0.86;
          enemy.omega *= 0.82;
          if (impact > 330) {
            enemy.hp -= impact * 0.12;
            if (enemy.hp <= 0) killEnemy(enemy);
          }
        }

        for (const block of blocksRef.current) resolveEnemyBlock(enemy, block);
      }

      for (const projectile of projectilesRef.current) {
        if (!projectile.alive) continue;
        projectile.age += dt;
        projectile.vy += GRAVITY * dt;
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.rotation += projectile.omega * dt;
        projectile.omega += projectile.vx * 0.00065;
        projectile.vx *= 0.9994;
        projectile.vy *= 0.9997;

        if (projectile.x - projectile.r < 0) {
          projectile.x = projectile.r;
          projectile.vx = Math.abs(projectile.vx) * 0.32;
        }
        if (projectile.x + projectile.r > WORLD_W) {
          projectile.x = WORLD_W - projectile.r;
          projectile.vx = -Math.abs(projectile.vx) * 0.3;
        }

        if (projectile.y + projectile.r > GROUND_Y) {
          const impact = Math.abs(projectile.vy);
          projectile.y = GROUND_Y - projectile.r;
          projectile.vy = -projectile.vy * (projectile.kind === 'crusher' ? 0.12 : 0.24);
          projectile.vx *= projectile.kind === 'crusher' ? 0.76 : 0.84;
          projectile.omega *= 0.85;
          if (impact > 210) {
            spawnParticles(projectile.x, GROUND_Y - 2, '#d8c18b', 7, 80, 'circle');
            shakeRef.current = Math.max(shakeRef.current, Math.min(7, impact / 80));
          }
          if (projectile.kind === 'payload' && impact > 70) {
            projectile.alive = false;
            explodeAt(projectile.x, projectile.y, 98, 120, 290);
          }
        }

        for (const block of blocksRef.current) {
          if (!projectile.alive) break;
          collideProjectileBlock(projectile, block);
        }

        for (const enemy of enemiesRef.current) {
          if (!projectile.alive) break;
          collideProjectileEnemy(projectile, enemy);
        }

        const speed = Math.hypot(projectile.vx, projectile.vy);
        if (speed < 22 && projectile.age > 0.8) projectile.sleepingFor += dt;
        else projectile.sleepingFor = 0;

        if (
          projectile.age > PROJECTILE_MAX_LIFE ||
          projectile.y > VIEW_H + 180 ||
          projectile.sleepingFor > 0.85
        ) {
          projectile.alive = false;
        }
      }

      for (const block of blocksRef.current) {
        if (block.alive && block.hp <= 0) killBlock(block);
      }
      for (const enemy of enemiesRef.current) {
        if (enemy.alive && enemy.hp <= 0) killEnemy(enemy);
      }

      for (const particle of particlesRef.current) {
        particle.life -= dt;
        particle.vy += GRAVITY * 0.65 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.rotation += particle.omega * dt;
        particle.vx *= 0.992;
        particle.vy *= 0.994;
      }
      particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0);

      const aliveEnemies = enemiesRef.current.filter((enemy) => enemy.alive).length;
      if (aliveEnemies === 0 && resultRef.current === 'none') {
        finishLevel('cleared');
      }

      const hasActiveProjectile = projectilesRef.current.some((projectile) => projectile.alive);
      if (isFlying && !hasActiveProjectile && resultRef.current === 'none') {
        settleTimerRef.current += dt;
        if (settleTimerRef.current > 0.34) {
          settleTimerRef.current = -999;
          prepareNextShot();
        }
      } else if (hasActiveProjectile) {
        settleTimerRef.current = 0;
      }

      shakeRef.current *= 0.88;
    },
    [
      collideProjectileBlock,
      collideProjectileEnemy,
      explodeAt,
      finishLevel,
      isFlying,
      killBlock,
      killEnemy,
      prepareNextShot,
      resolveBlockBlock,
      resolveEnemyBlock,
      spawnParticles,
    ],
  );

  const drawWorld = useCallback(
    (ctx: CanvasRenderingContext2D, now: number) => {
      const currentLevel = SLING_SIEGE_LEVELS[activeLevelRef.current];
      const images = imagesRef.current;
      const cameraX = cameraXRef.current;
      const shake = shakeRef.current;
      const shakeX = (Math.random() - 0.5) * shake;
      const shakeY = (Math.random() - 0.5) * shake * 0.55;

      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      ctx.translate(shakeX, shakeY);

      const bg = images[currentLevel.biome];
      if (bg?.complete && bg.naturalWidth > 0) {
        const parallax = cameraX * 0.13;
        const scale = Math.max(VIEW_H / bg.naturalHeight, (VIEW_W + 140) / bg.naturalWidth);
        const width = bg.naturalWidth * scale;
        const height = bg.naturalHeight * scale;
        const x = -((parallax % Math.max(1, width - VIEW_W + 140)) + 38);
        ctx.drawImage(bg, x, (VIEW_H - height) / 2, width, height);
        if (x + width < VIEW_W) ctx.drawImage(bg, x + width, (VIEW_H - height) / 2, width, height);
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        gradient.addColorStop(0, '#79c7e7');
        gradient.addColorStop(1, '#f0d99c');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      ctx.fillStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < 7; i += 1) {
        const x = ((i * 141 - cameraX * 0.22) % (VIEW_W + 180)) - 90;
        const y = 65 + (i % 3) * 36;
        ctx.beginPath();
        ctx.ellipse(x, y, 52, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-cameraX, 0);

      const ground = images.ground;
      if (ground?.complete && ground.naturalWidth > 0) {
        const tileW = 280;
        const tileH = 94;
        for (let x = -40; x < WORLD_W + tileW; x += tileW - 2) {
          ctx.drawImage(ground, x, GROUND_Y - 8, tileW, tileH);
        }
      } else {
        ctx.fillStyle = '#5d8b45';
        ctx.fillRect(0, GROUND_Y, WORLD_W, VIEW_H - GROUND_Y);
      }

      const sling = images.slingshot;
      if (sling?.complete && sling.naturalWidth > 0) {
        drawContainImage(ctx, sling, SLING_X, SLING_Y + 58, 112, 156);
      } else {
        ctx.strokeStyle = '#6e3e28';
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.moveTo(SLING_X - 25, SLING_Y + 112);
        ctx.lineTo(SLING_X - 18, SLING_Y + 28);
        ctx.moveTo(SLING_X + 25, SLING_Y + 112);
        ctx.lineTo(SLING_X + 18, SLING_Y + 28);
        ctx.stroke();
      }

      if (isAiming && resultRef.current === 'none') {
        const aim = aimPointRef.current;
        ctx.strokeStyle = 'rgba(66,33,21,.72)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(SLING_X - 20, SLING_Y + 20);
        ctx.lineTo(aim.x, aim.y);
        ctx.lineTo(SLING_X + 20, SLING_Y + 20);
        ctx.stroke();

        const kind = currentLevel.queue[currentQueueIndexRef.current];
        const meta = PROJECTILE_META[kind];
        const image = images[kind];
        if (image?.complete && image.naturalWidth > 0) {
          drawContainImage(ctx, image, aim.x, aim.y, meta.radius * 2.6, meta.radius * 2.6);
        } else {
          ctx.fillStyle = meta.tint;
          ctx.beginPath();
          ctx.arc(aim.x, aim.y, meta.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        const pullX = SLING_X - aim.x;
        const pullY = SLING_Y - aim.y;
        if (Math.hypot(pullX, pullY) > 12) {
          let px = aim.x;
          let py = aim.y;
          let vx = pullX * LAUNCH_SCALE;
          let vy = pullY * LAUNCH_SCALE;
          ctx.fillStyle = 'rgba(255,255,255,.8)';
          for (let i = 0; i < 12; i += 1) {
            const dt = 0.075;
            vx *= 0.999;
            vy += GRAVITY * dt;
            px += vx * dt;
            py += vy * dt;
            if (py > GROUND_Y) break;
            ctx.globalAlpha = 1 - i / 14;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(2.2, 4.3 - i * 0.14), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      for (const block of blocksRef.current) {
        if (!block.alive) continue;
        const image = images[block.material];
        const alpha = block.hitFlash > 0 ? 0.72 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(block.x, block.y);
        ctx.rotate(block.angle);
        if (image?.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, -block.w / 2, -block.h / 2, block.w, block.h);
        } else {
          ctx.fillStyle = materialColor(block.material);
          ctx.fillRect(-block.w / 2, -block.h / 2, block.w, block.h);
        }
        ctx.restore();

        if (block.hp < block.maxHp * 0.55 && block.material !== 'charge') {
          ctx.save();
          ctx.translate(block.x, block.y);
          ctx.rotate(block.angle);
          ctx.strokeStyle = 'rgba(36,26,22,.35)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-block.w * 0.22, -block.h * 0.36);
          ctx.lineTo(block.w * 0.08, -block.h * 0.04);
          ctx.lineTo(-block.w * 0.04, block.h * 0.34);
          ctx.stroke();
          ctx.restore();
        }
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        const image = images.enemy;
        ctx.save();
        if (enemy.hitFlash > 0) ctx.globalAlpha = 0.68;
        if (image?.complete && image.naturalWidth > 0) {
          drawContainImage(ctx, image, enemy.x, enemy.y, enemy.r * 2.7, enemy.r * 2.7, enemy.rotation);
        } else {
          ctx.translate(enemy.x, enemy.y);
          ctx.rotate(enemy.rotation);
          ctx.fillStyle = '#72c85f';
          ctx.beginPath();
          ctx.arc(0, 0, enemy.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (const projectile of projectilesRef.current) {
        if (!projectile.alive) continue;
        if (projectile.kind === 'payload') {
          ctx.save();
          ctx.translate(projectile.x, projectile.y);
          ctx.rotate(projectile.rotation);
          ctx.fillStyle = '#ffcf54';
          ctx.shadowColor = '#ff9f43';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, projectile.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }

        const meta = PROJECTILE_META[projectile.kind];
        const image = images[projectile.kind];
        if (image?.complete && image.naturalWidth > 0) {
          drawContainImage(
            ctx,
            image,
            projectile.x,
            projectile.y,
            projectile.r * 2.7,
            projectile.r * 2.7,
            projectile.rotation,
          );
        } else {
          ctx.fillStyle = meta.tint;
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const particle of particlesRef.current) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.color;
        if (particle.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.66);
        }
        ctx.restore();
      }

      ctx.restore();

      if (introActiveRef.current) {
        const elapsed = (now - introStartedRef.current) / 1000;
        const targetX = clamp(
          Math.max(...currentLevel.enemies.map((enemy) => enemy.x), 720) - VIEW_W * 0.58,
          0,
          WORLD_W - VIEW_W,
        );
        let cam = 0;
        if (elapsed < 0.68) cam = easeInOutCubic(elapsed / 0.68) * targetX;
        else if (elapsed < 1.25) cam = targetX;
        else if (elapsed < 1.95) cam = (1 - easeInOutCubic((elapsed - 1.25) / 0.7)) * targetX;
        else {
          introActiveRef.current = false;
          setIntroActive(false);
          cam = 0;
        }
        cameraXRef.current = cam;
        targetCameraRef.current = cam;
      }

      ctx.restore();
    },
    [isAiming],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(1.75, Math.max(1, window.devicePixelRatio || 1));
      dprRef.current = dpr;
      canvas.width = Math.round(VIEW_W * dpr);
      canvas.height = Math.round(VIEW_H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const previous = lastFrameRef.current || now;
      const frameDt = Math.min(0.035, Math.max(0, (now - previous) / 1000));
      lastFrameRef.current = now;
      accumulatorRef.current = Math.min(0.08, accumulatorRef.current + frameDt);

      let steps = 0;
      while (accumulatorRef.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        stepPhysics(FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
        steps += 1;
      }

      if (!introActiveRef.current) {
        if (isFlying) {
          const primary = projectilesRef.current.find(
            (projectile) => projectile.id === currentPrimaryIdRef.current && projectile.alive,
          );
          const fallback = projectilesRef.current.find((projectile) => projectile.alive);
          const focus = primary || fallback;
          if (focus) {
            targetCameraRef.current = clamp(
              focus.x - CAMERA_FOLLOW_X,
              0,
              WORLD_W - VIEW_W,
            );
          }
        } else if (isAiming && pointerModeRef.current !== 'pan') {
          targetCameraRef.current = Math.min(targetCameraRef.current, cameraXRef.current);
        }

        cameraXRef.current += (targetCameraRef.current - cameraXRef.current) * Math.min(1, frameDt * 7.5);
      }

      if (now - lastUiSyncRef.current > 120) {
        lastUiSyncRef.current = now;
        const alive = enemiesRef.current.filter((enemy) => enemy.alive).length;
        setEnemiesLeft((value) => (value === alive ? value : alive));
      }

      drawWorld(ctx, now);
      rafRef.current = window.requestAnimationFrame(frame);
    };

    rafRef.current = window.requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = 0;
      accumulatorRef.current = 0;
    };
  }, [drawWorld, isAiming, isFlying, stepPhysics]);

  const pointerToWorld = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, viewX: 0, viewY: 0 };
    const rect = canvas.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const viewY = ((event.clientY - rect.top) / rect.height) * VIEW_H;
    return {
      x: viewX + cameraXRef.current,
      y: viewY,
      viewX,
      viewY,
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (introActiveRef.current || resultRef.current !== 'none') return;
      const point = pointerToWorld(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerStartRef.current = { x: point.viewX, y: point.viewY };
      cameraStartRef.current = cameraXRef.current;

      if (
        isAiming &&
        Math.hypot(point.x - aimPointRef.current.x, point.y - aimPointRef.current.y) < 62
      ) {
        pointerModeRef.current = 'aim';
      } else {
        pointerModeRef.current = 'pan';
      }
    },
    [isAiming, pointerToWorld],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerModeRef.current === 'idle') return;
      const point = pointerToWorld(event);

      if (pointerModeRef.current === 'pan') {
        const delta = point.viewX - pointerStartRef.current.x;
        const next = clamp(cameraStartRef.current - delta, 0, WORLD_W - VIEW_W);
        cameraXRef.current = next;
        targetCameraRef.current = next;
        return;
      }

      const dx = point.x - SLING_X;
      const dy = point.y - SLING_Y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const factor = Math.min(1, MAX_PULL / dist);
      let x = SLING_X + dx * factor;
      let y = SLING_Y + dy * factor;

      x = Math.min(SLING_X + 18, x);
      y = clamp(y, SLING_Y - 68, SLING_Y + 76);
      aimPointRef.current = { x, y };
    },
    [pointerToWorld],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const mode = pointerModeRef.current;
      pointerModeRef.current = 'idle';
      if (mode === 'aim') launchCurrent();
    },
    [launchCurrent],
  );

  const onCanvasClick = useCallback(() => {
    if (pointerModeRef.current !== 'idle') return;
    if (isFlying) triggerAbility();
  }, [isFlying, triggerAbility]);

  const restartLevel = useCallback(() => {
    buildLevel(SLING_SIEGE_LEVELS[activeLevelRef.current]);
  }, [buildLevel]);

  const goToLevel = useCallback((next: number) => {
    const normalized = clamp(next, 0, SLING_SIEGE_LEVELS.length - 1);
    setLevelIndex(normalized);
  }, []);

  const remainingQueue = level.queue.slice(queueIndex);
  const stars = result === 'cleared'
    ? shotsUsed <= level.parShots
      ? 3
      : shotsUsed === level.parShots + 1
        ? 2
        : 1
    : 0;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent text-white">
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-2">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/55">
            SLING SIEGE
          </div>
          <div className="mt-1 truncate text-[15px] font-black uppercase leading-[1.35] text-white">
            {level.name}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-center backdrop-blur-md">
            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/55">LEVEL</div>
            <div className="mt-0.5 text-[12px] font-black leading-[1.3] text-white">{levelProgress}</div>
          </div>
          <div className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-center backdrop-blur-md">
            <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/55">TARGETS</div>
            <div className="mt-0.5 text-[12px] font-black leading-[1.3] text-white">{enemiesLeft}</div>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-2">
        <div
          className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[22px] border border-white/10 bg-black/10"
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onCanvasClick}
          />

          {!imagesReady && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-sm">
              <div className="rounded-xl border border-white/12 bg-black/35 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                LOADING WORLD
              </div>
            </div>
          )}

          {introActive && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-4 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
              TARGET PREVIEW
            </div>
          )}

          {!introActive && isAiming && result === 'none' && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/85 backdrop-blur-md">
              DRAG CREATURE · DRAG WORLD TO LOOK
            </div>
          )}

          {isFlying && result === 'none' && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                triggerAbility();
              }}
              disabled={!abilityReady}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-2xl border border-white/15 bg-black/65 px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white backdrop-blur-md transition active:scale-95 disabled:opacity-35"
            >
              {abilityReady ? currentMeta.ability : 'ABILITY USED'}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 shrink-0 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex w-full max-w-[520px] items-center justify-between gap-2 rounded-[20px] border border-white/10 bg-black/30 p-2 backdrop-blur-md">
          <button
            type="button"
            onClick={() => goToLevel(levelIndex - 1)}
            disabled={levelIndex === 0}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/8 text-white transition active:scale-95 disabled:opacity-25"
            aria-label="Previous level"
          >
            <ChevronLeft size={19} strokeWidth={2.7} />
          </button>

          <button
            type="button"
            onClick={restartLevel}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/8 text-white transition active:scale-95"
            aria-label="Restart level"
          >
            <RotateCcw size={17} strokeWidth={2.7} />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1">
            {remainingQueue.map((kind, index) => {
              const meta = PROJECTILE_META[kind];
              return (
                <div
                  key={`${kind}-${queueIndex + index}`}
                  className={[
                    'grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border transition',
                    index === 0
                      ? 'border-white/35 bg-white/14'
                      : 'border-white/8 bg-black/20 opacity-65',
                  ].join(' ')}
                  title={meta.label}
                >
                  <img src={meta.image} alt="" className="h-8 w-8 object-contain" draggable={false} />
                </div>
              );
            })}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[8px] font-black uppercase tracking-[0.13em] text-white/45">SHOTS</div>
            <div className="mt-0.5 text-[12px] font-black text-white">{shotsUsed}</div>
          </div>

          <button
            type="button"
            onClick={() => goToLevel(levelIndex + 1)}
            disabled={levelIndex === SLING_SIEGE_LEVELS.length - 1}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/8 text-white transition active:scale-95 disabled:opacity-25"
            aria-label="Next level"
          >
            <ChevronRight size={19} strokeWidth={2.7} />
          </button>
        </div>
      </div>

      {result !== 'none' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 px-5 backdrop-blur-[4px]">
          <div className="w-full max-w-[360px] rounded-[26px] border border-white/12 bg-[#10141b]/94 p-5 text-center shadow-2xl">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/45">
              LEVEL {levelIndex + 1}
            </div>
            <div className="mt-2 text-[24px] font-black uppercase leading-[1.3] text-white">
              {result === 'cleared' ? 'FORT CLEARED' : 'OUT OF CREATURES'}
            </div>

            {result === 'cleared' ? (
              <>
                <div className="mt-4 flex justify-center gap-2 text-[28px] leading-none">
                  {[0, 1, 2].map((star) => (
                    <span key={star} className={star < stars ? 'opacity-100' : 'opacity-20'}>
                      ★
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/45">USED</div>
                    <div className="mt-1 text-[17px] font-black text-white">{shotsUsed}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/45">PAR</div>
                    <div className="mt-1 text-[17px] font-black text-white">{level.parShots}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
                {enemiesLeft} TARGET{enemiesLeft === 1 ? '' : 'S'} LEFT
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={restartLevel}
                className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white transition active:scale-[.98]"
              >
                RETRY
              </button>
              <button
                type="button"
                onClick={() => {
                  if (result === 'cleared' && levelIndex < SLING_SIEGE_LEVELS.length - 1) {
                    goToLevel(levelIndex + 1);
                  } else {
                    restartLevel();
                  }
                }}
                className="rounded-2xl bg-white px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#10141b] transition active:scale-[.98]"
              >
                {result === 'cleared' && levelIndex < SLING_SIEGE_LEVELS.length - 1
                  ? 'NEXT LEVEL'
                  : 'PLAY AGAIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SlingSiegeGame;
