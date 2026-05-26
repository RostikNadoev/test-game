import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

type Phase = 'planning' | 'revealing' | 'sliding' | 'roundEnd' | 'gameOver';
type PenguinStatus = 'alive' | 'falling' | 'gone';

type Vec2 = {
  x: number;
  z: number;
};

type Penguin = {
  id: string;
  name: string;
  scarf: string;
  body: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  status: PenguinStatus;
  fall: number;
  yaw: number;
  spin: number;
  wobble: number;
  isPlayer: boolean;
};

type Impact = {
  id: string;
  x: number;
  z: number;
  life: number;
  kind: 'bump' | 'fall';
};

type GameRefs = {
  phaseRef: MutableRefObject<Phase>;
  penguinsRef: MutableRefObject<Penguin[]>;
  impactsRef: MutableRefObject<Impact[]>;
  planningEndAtRef: MutableRefObject<number>;
  revealEndAtRef: MutableRefObject<number>;
  playerPlanRef: MutableRefObject<Vec2>;
  botPlansRef: MutableRefObject<Record<number, Vec2>>;
  transitionRef: MutableRefObject<boolean>;
};

const PLAYER_INDEX = 0;

const BOARD_HALF = 3.25;
const BOARD_SIZE = BOARD_HALF * 2;
const WATER_Y = -1.14;

const PLAN_MS_HUMAN = 5000;
const PLAN_MS_BOTS_ONLY = 1200;
const REVEAL_MS = 980;

const PENGUIN_RADIUS = 0.3;
const MAX_DRAG = 3.1;
const MIN_DRAG = 0.08;

const MAX_LAUNCH_SPEED = 7.15;
const MIN_LAUNCH_SPEED = 1.55;

const ICE_DAMPING = 0.984;
const STOP_SPEED = 0.14;
const COLLISION_BOUNCE = 0.98;
const COLLISION_KICK = 0.34;
const SIDE_KICK = 0.07;

const FALL_SPEED = 2.7;
const EDGE_SLACK = 0.1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const len = (v: Vec2) => Math.hypot(v.x, v.z);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

const normalize = (v: Vec2): Vec2 => {
  const l = len(v) || 1;
  return { x: v.x / l, z: v.z / l };
};

const clonePenguins = (penguins: Penguin[]) => penguins.map((penguin) => ({ ...penguin }));
const countAlive = (penguins: Penguin[]) => penguins.filter((penguin) => penguin.status === 'alive').length;

const makeImpactId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeAngle = (angle: number) => {
  let next = angle;

  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;

  return next;
};

const lerpAngle = (from: number, to: number, t: number) => {
  return from + normalizeAngle(to - from) * t;
};

const directionToYaw = (vx: number, vz: number) => {
  return Math.atan2(-vx, -vz);
};

const createInitialPenguins = (): Penguin[] => [
  {
    id: 'you',
    name: 'YOU',
    scarf: '#facc15',
    body: '#111827',
    x: 0,
    z: 1.48,
    vx: 0,
    vz: 0,
    radius: PENGUIN_RADIUS,
    status: 'alive',
    fall: 0,
    yaw: Math.PI,
    spin: 0,
    wobble: 0,
    isPlayer: true,
  },
  {
    id: 'piko',
    name: 'PIKO',
    scarf: '#60a5fa',
    body: '#0f172a',
    x: 0,
    z: -1.62,
    vx: 0,
    vz: 0,
    radius: PENGUIN_RADIUS,
    status: 'alive',
    fall: 0,
    yaw: 0,
    spin: 0,
    wobble: 0,
    isPlayer: false,
  },
  {
    id: 'momo',
    name: 'MOMO',
    scarf: '#f472b6',
    body: '#111827',
    x: -1.62,
    z: -0.05,
    vx: 0,
    vz: 0,
    radius: PENGUIN_RADIUS,
    status: 'alive',
    fall: 0,
    yaw: Math.PI / 2,
    spin: 0,
    wobble: 0,
    isPlayer: false,
  },
  {
    id: 'tiki',
    name: 'TIKI',
    scarf: '#4ade80',
    body: '#0f172a',
    x: 1.62,
    z: -0.05,
    vx: 0,
    vz: 0,
    radius: PENGUIN_RADIUS,
    status: 'alive',
    fall: 0,
    yaw: -Math.PI / 2,
    spin: 0,
    wobble: 0,
    isPlayer: false,
  },
];

const planToVelocity = (plan: Vec2): Vec2 => {
  const power = Math.min(MAX_DRAG, len(plan));

  if (power < MIN_DRAG) {
    return { x: 0, z: 0 };
  }

  const dir = normalize(plan);
  const speed = MIN_LAUNCH_SPEED + (power / MAX_DRAG) * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);

  return {
    x: dir.x * speed,
    z: dir.z * speed,
  };
};

const isOffPlatform = (penguin: Penguin) => {
  const slack = penguin.radius * 0.08;

  return (
    penguin.x < -BOARD_HALF - EDGE_SLACK + slack ||
    penguin.x > BOARD_HALF + EDGE_SLACK - slack ||
    penguin.z < -BOARD_HALF - EDGE_SLACK + slack ||
    penguin.z > BOARD_HALF + EDGE_SLACK - slack
  );
};

const planBotMove = (penguin: Penguin, allPenguins: Penguin[]): Vec2 => {
  const enemies = allPenguins.filter((other) => other.status === 'alive' && other.id !== penguin.id);

  if (enemies.length === 0) {
    return { x: 0, z: 0 };
  }

  const centerPull = normalize({ x: -penguin.x, z: -penguin.z });

  const nearest = [...enemies].sort(
    (a, b) =>
      dist({ x: penguin.x, z: penguin.z }, { x: a.x, z: a.z }) -
      dist({ x: penguin.x, z: penguin.z }, { x: b.x, z: b.z }),
  )[0];

  const toEnemy = normalize({
    x: nearest.x - penguin.x,
    z: nearest.z - penguin.z,
  });

  const dangerEdge = Math.max(Math.abs(penguin.x), Math.abs(penguin.z)) > BOARD_HALF - 0.78;
  const aggression = dangerEdge ? 0.34 : 0.74;

  const aim = normalize({
    x: toEnemy.x * aggression + centerPull.x * (1 - aggression),
    z: toEnemy.z * aggression + centerPull.z * (1 - aggression),
  });

  const angle = Math.atan2(aim.z, aim.x) + (Math.random() - 0.5) * 0.45;
  const power = 1.75 + Math.random() * 0.82;

  return {
    x: Math.cos(angle) * power,
    z: Math.sin(angle) * power,
  };
};

const PenguinModel = ({ penguin }: { penguin: Penguin }) => {
  if (penguin.status === 'gone') return null;

  const y = penguin.status === 'falling' ? 0.35 - penguin.fall * 2.32 : 0.35;
  const baseScale = 0.72;
  const scale =
    penguin.status === 'falling' ? Math.max(0.32, baseScale - penguin.fall * 0.3) : baseScale;
  const opacity = penguin.status === 'falling' ? Math.max(0.12, 1 - penguin.fall * 0.78) : 1;

  return (
    <group position={[penguin.x, y, penguin.z]} rotation={[0, penguin.yaw, penguin.wobble]} scale={scale}>
      <mesh position={[0, -0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.47, 36]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.19 * opacity} depthWrite={false} />
      </mesh>

      <mesh castShadow position={[0, 0.07, 0]} scale={[0.54, 0.77, 0.47]}>
        <sphereGeometry args={[1, 36, 26]} />
        <meshStandardMaterial color={penguin.body} roughness={0.5} metalness={0.03} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0, 0.7, -0.03]} scale={[0.48, 0.43, 0.42]}>
        <sphereGeometry args={[1, 36, 24]} />
        <meshStandardMaterial color={penguin.body} roughness={0.48} metalness={0.03} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0, 0.02, -0.245]} scale={[0.37, 0.5, 0.13]}>
        <sphereGeometry args={[1, 32, 20]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.46} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[-0.17, 0.745, -0.335]} scale={[0.165, 0.185, 0.076]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.44} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0.17, 0.745, -0.335]} scale={[0.165, 0.185, 0.076]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.44} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[-0.17, 0.755, -0.405]} scale={[0.046, 0.054, 0.024]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#020617" roughness={0.3} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0.17, 0.755, -0.405]} scale={[0.046, 0.054, 0.024]}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#020617" roughness={0.3} transparent opacity={opacity} />
      </mesh>

      <mesh position={[-0.184, 0.775, -0.427]} scale={[0.014, 0.014, 0.008]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95 * opacity} />
      </mesh>

      <mesh position={[0.156, 0.775, -0.427]} scale={[0.014, 0.014, 0.008]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95 * opacity} />
      </mesh>

      <mesh position={[-0.29, 0.66, -0.365]} scale={[0.048, 0.031, 0.012]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.42 * opacity} />
      </mesh>

      <mesh position={[0.29, 0.66, -0.365]} scale={[0.048, 0.031, 0.012]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.42 * opacity} />
      </mesh>

      <mesh castShadow position={[0, 0.63, -0.49]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
        <coneGeometry args={[0.098, 0.25, 4]} />
        <meshStandardMaterial color="#fb923c" roughness={0.38} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[-0.49, 0.03, -0.005]} rotation={[0.05, 0, -0.63]} scale={[0.105, 0.35, 0.16]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.62} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0.49, 0.03, -0.005]} rotation={[0.05, 0, 0.63]} scale={[0.105, 0.35, 0.16]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.62} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[-0.18, -0.51, -0.08]} rotation={[0.12, 0.22, 0]} scale={[0.18, 0.045, 0.27]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.48} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0.18, -0.51, -0.08]} rotation={[0.12, -0.22, 0]} scale={[0.18, 0.045, 0.27]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.48} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0, 0.25, -0.425]} scale={[0.56, 0.1, 0.072]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={penguin.scarf} roughness={0.38} metalness={0.02} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0.33, 0.205, -0.495]} rotation={[0, 0, -0.38]} scale={[0.155, 0.082, 0.088]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={penguin.scarf} roughness={0.38} metalness={0.02} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0, 1.03, -0.02]} scale={[0.37, 0.12, 0.34]}>
        <sphereGeometry args={[1, 28, 14]} />
        <meshStandardMaterial color={penguin.scarf} roughness={0.46} transparent opacity={opacity} />
      </mesh>

      <mesh castShadow position={[0, 1.105, -0.01]} scale={[0.25, 0.165, 0.24]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color={penguin.scarf} roughness={0.46} transparent opacity={opacity} />
      </mesh>

      <mesh position={[0, 1.27, -0.01]} scale={[0.095, 0.095, 0.095]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.48} transparent opacity={opacity} />
      </mesh>

      <mesh position={[0, 0.46, -0.502]} scale={[0.05, 0.03, 0.012]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.24 * opacity} />
      </mesh>

      {penguin.isPlayer && (
        <mesh castShadow position={[0, 1.42, -0.02]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.13, 0.22, 4]} />
          <meshStandardMaterial
            color="#fde047"
            emissive="#854d0e"
            emissiveIntensity={0.34}
            roughness={0.38}
            transparent
            opacity={opacity}
          />
        </mesh>
      )}
    </group>
  );
};

const IcePlatform = () => {
  const iceLines = [
    { x: -1.85, z: -1.12, w: 0.72, h: 0.026, r: 0.12 },
    { x: 0.52, z: -1.48, w: 0.9, h: 0.025, r: -0.32 },
    { x: 1.45, z: 0.18, w: 0.78, h: 0.023, r: 0.36 },
    { x: -1.42, z: 1.02, w: 0.94, h: 0.026, r: -0.22 },
    { x: 0.1, z: 1.15, w: 1.0, h: 0.024, r: 0.16 },
    { x: 0, z: -0.05, w: 0.54, h: 0.021, r: 0.45 },
  ];

  return (
    <group>
      <mesh receiveShadow position={[0, -0.28, 0]}>
        <boxGeometry args={[BOARD_SIZE, 0.5, BOARD_SIZE]} />
        <meshStandardMaterial color="#5aa6c7" roughness={0.58} metalness={0.04} />
      </mesh>

      <mesh receiveShadow position={[0, -0.03, 0]}>
        <boxGeometry args={[BOARD_SIZE + 0.1, 0.12, BOARD_SIZE + 0.1]} />
        <meshStandardMaterial color="#96dcf6" roughness={0.24} metalness={0.08} />
      </mesh>

      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[BOARD_SIZE + 0.02, 0.06, BOARD_SIZE + 0.02]} />
        <meshPhysicalMaterial
          color="#e9fbff"
          roughness={0.07}
          metalness={0.02}
          transmission={0.12}
          transparent
          opacity={0.98}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
      </mesh>

      <mesh position={[0, 0.074, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD_SIZE - 0.34, BOARD_SIZE - 0.34]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.06} />
      </mesh>

      {iceLines.map((line, index) => (
        <mesh key={index} position={[line.x, 0.095, line.z]} rotation={[-Math.PI / 2, 0, line.r]}>
          <planeGeometry args={[line.w, line.h]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.26} />
        </mesh>
      ))}

      <mesh position={[0, 0.101, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BOARD_HALF - 0.2, BOARD_HALF - 0.15, 4, 1]} />
        <meshBasicMaterial color="#ecfeff" transparent opacity={0.2} />
      </mesh>

      <mesh position={[0, 0.108, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[0.36, 0.39, 64]} />
        <meshBasicMaterial color="#bae6fd" transparent opacity={0.14} />
      </mesh>

      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[BOARD_SIZE - 0.32, 0.12, BOARD_SIZE - 0.32]} />
        <meshStandardMaterial color="#426e80" roughness={0.72} metalness={0.02} />
      </mesh>
    </group>
  );
};

const WaterWorld = () => {
  return (
    <group>
      <mesh position={[0, WATER_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[15, 96]} />
        <meshStandardMaterial color="#0b4d6e" roughness={0.28} metalness={0.06} transparent opacity={0.82} />
      </mesh>

      <mesh position={[0, WATER_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.85, 4.02, 96]} />
        <meshBasicMaterial color="#8be2ff" transparent opacity={0.16} />
      </mesh>

      <mesh position={[0, WATER_Y + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.4, 6.58, 96]} />
        <meshBasicMaterial color="#d6f4ff" transparent opacity={0.08} />
      </mesh>

      <mesh position={[0, WATER_Y + 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9.0, 9.15, 96]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.06} />
      </mesh>
    </group>
  );
};

const SnowParticles = () => {
  const groupRef = useRef<THREE.Group | null>(null);

  const flakes = useMemo(() => {
    return Array.from({ length: 36 }).map(() => ({
      x: (Math.random() - 0.5) * 15,
      y: Math.random() * 7 + 1,
      z: (Math.random() - 0.5) * 14,
      speed: 0.12 + Math.random() * 0.2,
      size: 0.014 + Math.random() * 0.018,
    }));
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    group.children.forEach((child, index) => {
      const data = flakes[index];
      child.position.y -= data.speed * delta;

      if (child.position.y < 0.2) {
        child.position.y = 7.5 + Math.random() * 1.5;
        child.position.x = (Math.random() - 0.5) * 15;
        child.position.z = (Math.random() - 0.5) * 14;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {flakes.map((flake, index) => (
        <mesh key={index} position={[flake.x, flake.y, flake.z]}>
          <sphereGeometry args={[flake.size, 8, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
        </mesh>
      ))}
    </group>
  );
};

const AimArrow = ({
  penguin,
  plan,
  faded = false,
}: {
  penguin: Penguin | undefined;
  plan: Vec2;
  faded?: boolean;
}) => {
  const power = len(plan);

  if (!penguin || penguin.status !== 'alive' || power < 0.08) return null;

  const dir = normalize(plan);
  const arrowLen = Math.min(MAX_DRAG, power);
  const angle = Math.atan2(dir.x, dir.z);
  const opacity = faded ? 0.6 : 0.88;

  return (
    <group position={[penguin.x, 0.16, penguin.z]} rotation={[0, angle, 0]}>
      <mesh position={[0, 0.04, arrowLen / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, arrowLen, 14]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={opacity} />
      </mesh>

      <mesh position={[0, 0.04, arrowLen]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.3, 18]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={Math.min(1, opacity + 0.12)} />
      </mesh>

      <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.345, 36]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={faded ? 0.16 : 0.26} />
      </mesh>

      <mesh position={[0, 0.023, arrowLen * 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.34, Math.max(0.2, arrowLen)]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={faded ? 0.06 : 0.09} depthWrite={false} />
      </mesh>
    </group>
  );
};

const Impacts = ({ impacts }: { impacts: Impact[] }) => (
  <group>
    {impacts.map((impact) => {
      const scale = impact.kind === 'fall' ? 1 + impact.life * 1.55 : 1 + impact.life * 1.0;
      const opacity = 1 - impact.life;

      return (
        <group key={impact.id} position={[impact.x, impact.kind === 'fall' ? -0.02 : 0.14, impact.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, scale]}>
            <ringGeometry args={impact.kind === 'fall' ? [0.24, 0.3, 32] : [0.16, 0.2, 28]} />
            <meshBasicMaterial
              color={impact.kind === 'fall' ? '#7dd3fc' : '#ffffff'}
              transparent
              opacity={opacity * 0.48}
            />
          </mesh>

          {impact.kind === 'bump' && (
            <mesh position={[0, 0.05, 0]}>
              <sphereGeometry args={[0.055 + impact.life * 0.055, 12, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={opacity * 0.3} />
            </mesh>
          )}
        </group>
      );
    })}
  </group>
);

const GameScene = ({
  gameRefs,
  penguins,
  playerPlan,
  visiblePlans,
  phase,
  onPointerPlan,
  onStartDrag,
  onEndDrag,
  onBeginReveal,
  onBeginSliding,
  onFinishRound,
  onUpdate,
}: {
  gameRefs: GameRefs;
  penguins: Penguin[];
  playerPlan: Vec2;
  visiblePlans: Record<number, Vec2>;
  phase: Phase;
  onPointerPlan: (point: Vec2) => void;
  onStartDrag: (point: Vec2) => void;
  onEndDrag: () => void;
  onBeginReveal: () => void;
  onBeginSliding: () => void;
  onFinishRound: (next: Penguin[]) => void;
  onUpdate: (penguins: Penguin[], countdownMs: number, impacts: Impact[]) => void;
}) => {
  const dragRef = useRef(false);
  const updateAccumulatorRef = useRef(0);

  const stepPhysics = useCallback((list: Penguin[], impacts: Impact[], dt: number) => {
    for (const penguin of list) {
      if (penguin.status === 'alive') {
        penguin.x += penguin.vx * dt;
        penguin.z += penguin.vz * dt;

        const speed = Math.hypot(penguin.vx, penguin.vz);
        penguin.spin += speed * dt * 3.8;
        penguin.wobble = Math.sin(penguin.spin) * clamp(speed / 8.2, 0, 0.2);
      } else if (penguin.status === 'falling') {
        penguin.x += penguin.vx * dt;
        penguin.z += penguin.vz * dt;
        penguin.fall += dt * FALL_SPEED;
        penguin.vx *= Math.pow(0.974, dt * 60);
        penguin.vz *= Math.pow(0.974, dt * 60);
        penguin.spin += dt * 12;
        penguin.wobble = Math.sin(penguin.spin) * 0.4;

        if (penguin.fall >= 1) {
          penguin.fall = 1;
          penguin.status = 'gone';
          penguin.vx = 0;
          penguin.vz = 0;
        }
      }
    }

    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a.status !== 'alive') continue;

      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b.status !== 'alive') continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.0001;
        const minD = a.radius + b.radius;

        if (d >= minD) continue;

        const nx = dx / d;
        const nz = dz / d;
        const overlap = minD - d;

        a.x -= nx * overlap * 0.52;
        a.z -= nz * overlap * 0.52;
        b.x += nx * overlap * 0.52;
        b.z += nz * overlap * 0.52;

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const velAlongNormal = rvx * nx + rvz * nz;

        if (velAlongNormal < 0) {
          const hitPower = Math.abs(velAlongNormal);
          const impulse = (-(1 + COLLISION_BOUNCE) * velAlongNormal) / 2;
          const bonusKick = Math.min(0.72, Math.max(0, hitPower - 0.62) * COLLISION_KICK);

          const ix = (impulse + bonusKick) * nx;
          const iz = (impulse + bonusKick) * nz;

          a.vx -= ix;
          a.vz -= iz;
          b.vx += ix;
          b.vz += iz;

          const tangentX = -nz;
          const tangentZ = nx;
          const sideKick = Math.min(0.4, hitPower * SIDE_KICK);

          a.vx += tangentX * sideKick;
          a.vz += tangentZ * sideKick;
          b.vx -= tangentX * sideKick;
          b.vz -= tangentZ * sideKick;

          if (hitPower > 0.68) {
            impacts.push({
              id: makeImpactId(),
              x: (a.x + b.x) / 2,
              z: (a.z + b.z) / 2,
              life: 0,
              kind: 'bump',
            });
          }
        }
      }
    }

    for (const penguin of list) {
      if (penguin.status !== 'alive') continue;

      penguin.vx *= Math.pow(ICE_DAMPING, dt * 60);
      penguin.vz *= Math.pow(ICE_DAMPING, dt * 60);

      const speed = Math.hypot(penguin.vx, penguin.vz);

      if (speed < STOP_SPEED) {
        penguin.vx = 0;
        penguin.vz = 0;
      } else {
        penguin.yaw = lerpAngle(penguin.yaw, directionToYaw(penguin.vx, penguin.vz), Math.min(1, dt * 7.5));
      }

      if (isOffPlatform(penguin)) {
        penguin.status = 'falling';
        penguin.fall = 0;
        impacts.push({
          id: makeImpactId(),
          x: clamp(penguin.x, -BOARD_HALF, BOARD_HALF),
          z: clamp(penguin.z, -BOARD_HALF, BOARD_HALF),
          life: 0,
          kind: 'fall',
        });
      }
    }

    for (const impact of impacts) {
      impact.life += dt * 1.8;
    }

    return impacts.filter((impact) => impact.life < 1);
  }, []);

  const allSettled = useCallback((list: Penguin[]) => {
    const aliveStopped = list.every((penguin) => {
      if (penguin.status !== 'alive') return true;
      return Math.hypot(penguin.vx, penguin.vz) < STOP_SPEED;
    });

    const noFalling = list.every((penguin) => penguin.status !== 'falling');

    return aliveStopped && noFalling;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    const now = performance.now();

    if (gameRefs.phaseRef.current === 'planning') {
      const remaining = Math.max(0, gameRefs.planningEndAtRef.current - now);

      if (remaining <= 0) {
        onBeginReveal();
      }

      updateAccumulatorRef.current += dt;

      if (updateAccumulatorRef.current > 0.07) {
        updateAccumulatorRef.current = 0;
        onUpdate(gameRefs.penguinsRef.current, remaining, gameRefs.impactsRef.current);
      }

      return;
    }

    if (gameRefs.phaseRef.current === 'revealing') {
      const nextPenguins = clonePenguins(gameRefs.penguinsRef.current);

      nextPenguins.forEach((penguin) => {
        if (penguin.status !== 'alive') return;

        const speed = Math.hypot(penguin.vx, penguin.vz);

        if (speed <= 0.001) return;

        const targetYaw = directionToYaw(penguin.vx, penguin.vz);
        penguin.yaw = lerpAngle(penguin.yaw, targetYaw, Math.min(1, dt * 5.8));
        penguin.wobble = Math.sin(now * 0.013 + penguin.x) * 0.045;
      });

      gameRefs.penguinsRef.current = nextPenguins;

      updateAccumulatorRef.current += dt;

      if (updateAccumulatorRef.current > 0.016) {
        updateAccumulatorRef.current = 0;
        onUpdate(nextPenguins, gameRefs.revealEndAtRef.current - now, gameRefs.impactsRef.current);
      }

      if (now >= gameRefs.revealEndAtRef.current) {
        onBeginSliding();
      }

      return;
    }

    if (gameRefs.phaseRef.current === 'sliding') {
      const nextPenguins = clonePenguins(gameRefs.penguinsRef.current);
      const nextImpacts = stepPhysics(nextPenguins, [...gameRefs.impactsRef.current], dt);

      gameRefs.penguinsRef.current = nextPenguins;
      gameRefs.impactsRef.current = nextImpacts;

      updateAccumulatorRef.current += dt;

      if (updateAccumulatorRef.current > 0.02) {
        updateAccumulatorRef.current = 0;
        onUpdate(nextPenguins, 0, nextImpacts);
      }

      if (allSettled(nextPenguins)) {
        onFinishRound(nextPenguins);
      }
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (gameRefs.phaseRef.current !== 'planning') return;

    event.stopPropagation();

    const point = {
      x: clamp(event.point.x, -BOARD_HALF, BOARD_HALF),
      z: clamp(event.point.z, -BOARD_HALF, BOARD_HALF),
    };

    const player = gameRefs.penguinsRef.current[PLAYER_INDEX];

    if (!player || player.status !== 'alive') return;

    if (dist({ x: player.x, z: player.z }, point) > 0.78) return;

    dragRef.current = true;
    onStartDrag(point);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current) return;
    if (gameRefs.phaseRef.current !== 'planning') return;

    event.stopPropagation();

    onPointerPlan({
      x: clamp(event.point.x, -BOARD_HALF, BOARD_HALF),
      z: clamp(event.point.z, -BOARD_HALF, BOARD_HALF),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = false;
    onEndDrag();
  };

  return (
    <>
      <color attach="background" args={['#06111d']} />
      <fog attach="fog" args={['#06111d', 19, 35]} />

      <ambientLight intensity={0.78} />

      <directionalLight
        position={[4, 10, 7]}
        intensity={1.52}
        castShadow
        shadow-mapSize-width={768}
        shadow-mapSize-height={768}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      <pointLight position={[-5, 4, -6]} intensity={1.75} color="#67e8f9" />
      <pointLight position={[5, 5, 5]} intensity={1.25} color="#dbeafe" />
      <pointLight position={[0, 3, 0]} intensity={0.55} color="#ffffff" />

      <WaterWorld />
      <IcePlatform />
      <SnowParticles />

      <mesh
        position={[0, 0.14, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {phase === 'planning' && <AimArrow penguin={penguins[PLAYER_INDEX]} plan={playerPlan} />}

      {phase === 'revealing' &&
        penguins.map((penguin, index) => (
          <AimArrow
            key={penguin.id}
            penguin={penguin}
            plan={visiblePlans[index] ?? { x: 0, z: 0 }}
            faded={!penguin.isPlayer}
          />
        ))}

      {[...penguins]
        .sort((a, b) => a.z - b.z)
        .map((penguin) => (
          <PenguinModel key={penguin.id} penguin={penguin} />
        ))}

      <Impacts impacts={gameRefs.impactsRef.current} />
    </>
  );
};

export const IceBumpGame = () => {
  const navigate = useNavigate();

  const phaseRef = useRef<Phase>('planning');
  const penguinsRef = useRef<Penguin[]>(createInitialPenguins());
  const impactsRef = useRef<Impact[]>([]);
  const planningEndAtRef = useRef<number>(performance.now() + PLAN_MS_HUMAN);
  const revealEndAtRef = useRef<number>(0);
  const playerPlanRef = useRef<Vec2>({ x: 0, z: 0 });
  const botPlansRef = useRef<Record<number, Vec2>>({});
  const transitionRef = useRef(false);
  const nextRoundTimeoutRef = useRef<number | null>(null);
  const roundRef = useRef(1);

  const [phase, setPhase] = useState<Phase>('planning');
  const [penguins, setPenguins] = useState<Penguin[]>(createInitialPenguins());
  const [, setImpacts] = useState<Impact[]>([]);
  const [round, setRound] = useState(1);
  const [countdownMs, setCountdownMs] = useState(PLAN_MS_HUMAN);
  const [playerPlan, setPlayerPlan] = useState<Vec2>({ x: 0, z: 0 });
  const [visiblePlans, setVisiblePlans] = useState<Record<number, Vec2>>({});
  const [message, setMessage] = useState('Потяни своего пингвина по льду.');

  const gameRefs = useMemo<GameRefs>(
    () => ({
      phaseRef,
      penguinsRef,
      impactsRef,
      planningEndAtRef,
      revealEndAtRef,
      playerPlanRef,
      botPlansRef,
      transitionRef,
    }),
    [],
  );

  const alivePenguins = useMemo(
    () => penguins.filter((penguin) => penguin.status === 'alive'),
    [penguins],
  );

  const winner = alivePenguins.length === 1 ? alivePenguins[0] : null;

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (nextRoundTimeoutRef.current !== null) {
      window.clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
  }, []);

  const startPlanning = useCallback(
    (source: Penguin[], nextRound: number) => {
      clearTimers();

      const nextPenguins = clonePenguins(source).map((penguin) => ({
        ...penguin,
        vx: 0,
        vz: 0,
        wobble: 0,
      }));

      const playerAlive = nextPenguins[PLAYER_INDEX]?.status === 'alive';
      const duration = playerAlive ? PLAN_MS_HUMAN : PLAN_MS_BOTS_ONLY;

      botPlansRef.current = {};
      nextPenguins.forEach((penguin, index) => {
        if (!penguin.isPlayer && penguin.status === 'alive') {
          botPlansRef.current[index] = planBotMove(penguin, nextPenguins);
        }
      });

      playerPlanRef.current = { x: 0, z: 0 };
      transitionRef.current = false;
      impactsRef.current = [];

      roundRef.current = nextRound;
      planningEndAtRef.current = performance.now() + duration;
      revealEndAtRef.current = 0;
      penguinsRef.current = nextPenguins;

      setRound(nextRound);
      setCountdownMs(duration);
      setPlayerPlan({ x: 0, z: 0 });
      setVisiblePlans({});
      setImpacts([]);
      setPenguins(nextPenguins);
      setMessage(playerAlive ? 'Потяни своего пингвина по льду.' : 'Ты выбыл. Боты выбирают ход…');
      setPhaseSafe('planning');
    },
    [clearTimers, setPhaseSafe],
  );

  const restart = useCallback(() => {
    const fresh = createInitialPenguins();

    penguinsRef.current = fresh;
    impactsRef.current = [];
    roundRef.current = 1;

    startPlanning(fresh, 1);
  }, [startPlanning]);

  const beginReveal = useCallback(() => {
    if (phaseRef.current !== 'planning') return;

    const next = clonePenguins(penguinsRef.current);
    const plans: Record<number, Vec2> = {};

    next.forEach((penguin, index) => {
      if (penguin.status !== 'alive') return;

      const plan = penguin.isPlayer
        ? playerPlanRef.current
        : botPlansRef.current[index] ?? { x: 0, z: 0 };

      const velocity = planToVelocity(plan);

      penguin.vx = velocity.x;
      penguin.vz = velocity.z;

      plans[index] = plan;
    });

    penguinsRef.current = next;
    revealEndAtRef.current = performance.now() + REVEAL_MS;

    setVisiblePlans(plans);
    setPenguins(next);
    setMessage('Ходы раскрыты!');
    setPhaseSafe('revealing');
  }, [setPhaseSafe]);

  const beginSliding = useCallback(() => {
    if (phaseRef.current !== 'revealing') return;

    const next = clonePenguins(penguinsRef.current).map((penguin) => {
      if (penguin.status !== 'alive') return penguin;

      const speed = Math.hypot(penguin.vx, penguin.vz);

      if (speed > 0.001) {
        return {
          ...penguin,
          yaw: directionToYaw(penguin.vx, penguin.vz),
          wobble: 0,
        };
      }

      return penguin;
    });

    penguinsRef.current = next;

    setVisiblePlans({});
    setPenguins(next);
    setMessage('Скольжение…');
    setPhaseSafe('sliding');
  }, [setPhaseSafe]);

  const finishRound = useCallback(
    (currentPenguins: Penguin[]) => {
      if (transitionRef.current) return;

      transitionRef.current = true;

      const next = clonePenguins(currentPenguins);
      const survivors = countAlive(next);

      penguinsRef.current = next;
      setPenguins(next);

      if (survivors <= 1) {
        setMessage(
          survivors === 1
            ? `${next.find((penguin) => penguin.status === 'alive')?.name ?? 'Кто-то'} победил`
            : 'Все упали. Ничья.',
        );
        setPhaseSafe('gameOver');
        return;
      }

      setMessage(next[PLAYER_INDEX].status === 'alive' ? 'Следующий ход…' : 'Ты выбыл. Боты продолжают.');
      setPhaseSafe('roundEnd');

      nextRoundTimeoutRef.current = window.setTimeout(() => {
        startPlanning(next, roundRef.current + 1);
      }, 680);
    },
    [setPhaseSafe, startPlanning],
  );

  const onUpdate = useCallback((nextPenguins: Penguin[], nextCountdown: number, nextImpacts: Impact[]) => {
    setPenguins(nextPenguins);
    setCountdownMs(Math.max(0, nextCountdown));
    setImpacts(nextImpacts);
  }, []);

  const onStartDrag = useCallback(() => undefined, []);

  const onPointerPlan = useCallback((point: Vec2) => {
    const currentPlayer = penguinsRef.current[PLAYER_INDEX];

    if (!currentPlayer || currentPlayer.status !== 'alive') return;

    const raw = {
      x: point.x - currentPlayer.x,
      z: point.z - currentPlayer.z,
    };

    const rawLen = len(raw);
    const nextPlan =
      rawLen > MAX_DRAG
        ? {
            x: (raw.x / rawLen) * MAX_DRAG,
            z: (raw.z / rawLen) * MAX_DRAG,
          }
        : raw;

    playerPlanRef.current = nextPlan;
    setPlayerPlan(nextPlan);
  }, []);

  const onEndDrag = useCallback(() => undefined, []);

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlTouch = document.documentElement.style.touchAction;
    const prevBodyTouch = document.body.style.touchAction;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.userSelect = 'none';

    const preventTouch = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    restart();

    return () => {
      clearTimers();

      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.touchAction = prevHtmlTouch;
      document.body.style.touchAction = prevBodyTouch;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.userSelect = prevBodyUserSelect;

      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [clearTimers, restart]);

  const phaseText =
    phase === 'planning'
      ? 'ПОДГОТОВКА'
      : phase === 'revealing'
        ? 'ХОДЫ'
        : phase === 'sliding'
          ? 'СКОЛЬЖЕНИЕ'
          : phase === 'roundEnd'
            ? 'РАУНД'
            : 'ФИНАЛ';

  return (
    <>
      <style>{`
        @keyframes icePulse {
          0%,100% { transform: scale(1); opacity: .86; }
          50% { transform: scale(1.035); opacity: 1; }
        }
      `}</style>

      <div
        className="relative h-full w-full overflow-hidden bg-[#06111d] text-white touch-none select-none"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <Canvas
          shadows
          dpr={[1, 1.35]}
          camera={{
            position: [0, 13.4, 16.8],
            rotation: [-0.66, 0, 0],
            fov: 54,
            near: 0.1,
            far: 100,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
        >
          <GameScene
            gameRefs={gameRefs}
            penguins={penguins}
            playerPlan={playerPlan}
            visiblePlans={visiblePlans}
            phase={phase}
            onPointerPlan={onPointerPlan}
            onStartDrag={onStartDrag}
            onEndDrag={onEndDrag}
            onBeginReveal={beginReveal}
            onBeginSliding={beginSliding}
            onFinishRound={finishRound}
            onUpdate={onUpdate}
          />
        </Canvas>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,.11),transparent_30%),linear-gradient(180deg,rgba(2,6,23,.02),rgba(2,6,23,.16))]" />

        <div className="absolute left-3 right-3 top-2 z-20 flex items-center justify-between gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-sm font-black text-white/90 backdrop-blur-md active:scale-95"
          >
            ←
          </button>

          <div className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-center backdrop-blur-md">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
              Ice Bump 3D
            </div>
            <div className="truncate text-sm font-black text-cyan-100">
              ROUND {round} • {phaseText}
            </div>
          </div>

          <div className="rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-right backdrop-blur-md">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">
              Alive
            </div>
            <div className="text-sm font-black text-cyan-100">{alivePenguins.length}/4</div>
          </div>
        </div>

        <div className="absolute left-3 right-3 top-[72px] z-20 flex items-center justify-between gap-2">
          <div className="rounded-full border border-white/10 bg-black/22 px-3 py-2 text-[11px] font-bold text-white/72 backdrop-blur-md">
            {message}
          </div>

          {(phase === 'planning' || phase === 'revealing') && (
            <div className="rounded-full border border-cyan-200/15 bg-cyan-300/12 px-3 py-2 text-[12px] font-black text-cyan-100 backdrop-blur-md animate-[icePulse_1.2s_ease-in-out_infinite]">
              {(countdownMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {phase === 'gameOver' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[340px] overflow-hidden rounded-[32px] border border-white/14 bg-slate-950/95 shadow-2xl">
              <div className="h-2.5 bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500" />

              <div className="p-6 text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">
                  Match Result
                </div>

                <div className="mt-2 text-4xl font-black text-white">
                  {winner?.isPlayer ? 'YOU WIN' : winner ? 'YOU LOSE' : 'DRAW'}
                </div>

                <div className="mt-2 text-sm font-bold text-cyan-100/72">
                  {winner ? `${winner.name} остался на льду последним` : 'Все упали в воду'}
                </div>

                <button
                  onClick={restart}
                  className="mt-6 w-full rounded-3xl bg-gradient-to-r from-cyan-300 to-sky-500 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-xl transition active:scale-[0.98]"
                >
                  Play Again
                </button>

                <button
                  onClick={() => navigate(-1)}
                  className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/80 transition active:scale-[0.98]"
                >
                  Назад
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default IceBumpGame;