/**
 * PhysicsDuel.tsx
 * ---------------------------------------------------------------------------
 * A premium 1v1 physics duel for a React + TypeScript Telegram Mini App.
 *
 * - Two black cubes (player + bot) duel on ONE shared, seeded staircase.
 * - Physics/map tuning is inspired by the readable stair-runs and momentum-heavy
 *   landing feel of Climb Jump, while keeping this game local and duel-based.
 * - 15 turns. Each turn: 5s preparation -> both cubes launch SIMULTANEOUSLY
 *   -> turn ends only when BOTH cubes have fully stopped.
 * - Custom lightweight impulse-based rigid-body physics (no Matter.js needed):
 *   gravity, friction, restitution, angular velocity, corner collisions,
 *   tumbling, sliding, and stable settle/stop detection.
 * - Smooth camera that frames both cubes, with stylish offscreen-opponent
 *   directional arrows (size/brightness scale with distance).
 * - Parallax background from src/assets/upback.png, plus fog, grain, vignette.
 * - Canvas for the world; React only for low-frequency HUD/overlays.
 * - Telegram Mini App safe: locked scroll/swipes, fits container height, no
 *   100vh overflow, full cleanup of RAF / timers / listeners / observers.
 *
 * Bot input is isolated behind a MoveProvider interface so it can be swapped
 * for a WebSocket remote player later WITHOUT touching the engine.
 *
 * Usage (route-compatible, fills its parent container):
 *   import { PhysicsDuel } from './games/PhysicsDuel';
 *   <Route path="/duel" element={<div style={{height:'100%'}}><PhysicsDuel /></div>} />
 *
 * The component fills 100% of its parent. Give the parent a real height
 * (the component also falls back to the Telegram viewport height if needed).
 * ---------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import upback from '../assets/upback.png';
import { getTelegramWebApp } from '../types/telegram';
import { useLobbyMatchFinish } from '../hooks/useLobbyMatchFinish';
import { MatchFinishStatus } from '../components/Match/MatchFinishStatus';

/* ===========================================================================
 * Tuning constants  (safe to tweak; all in px / seconds / radians)
 * ========================================================================= */

const TOTAL_TURNS = 15;
const PREP_TIME = 5;
const MAX_RESOLVE = 12;

// A smaller fixed step + a few more solver passes makes corner landings much less
// jittery on 60/120 Hz phones while keeping the engine lightweight.
const FIXED_DT = 1 / 180;
const MAX_SUBSTEPS = 9;
const SOLVER_ITERS = 7;

// Climb-Jump-like feel: slightly floatier arc, low air resistance and enough
// restitution to keep a bad corner landing alive without turning the cube rubbery.
const GRAVITY = 1850;
const AIR_DRAG = 0.01;
const ANG_AIR_DRAG = 0.11;
const ROLL_RES = 0.18;
const RESTITUTION = 0.16;
const FRICTION = 0.25;
const MAX_ANGULAR_SPEED = 11.5;

/* --- Drag-to-launch tuning --- */
const DRAG_SCALE = 4.8;
const MIN_LAUNCH = 240;
const MAX_LAUNCH = 990;
const MIN_PULL = 10;
const LAUNCH_ANGLE_MIN = (25 * Math.PI) / 180;
const LAUNCH_ANGLE_MAX = (75 * Math.PI) / 180;
const DEFAULT_ANGLE = (50 * Math.PI) / 180;
const DEFAULT_SPEED = 445;

// Rotation follows horizontal launch direction instead of being random. This is
// the biggest change to how the cube "feels": rightward shots naturally tumble
// clockwise, leftward recovery shots tumble the other way.
const MIN_LAUNCH_SPIN = 2.05;
const LAUNCH_SPIN_POWER = 0.034;
const LAUNCH_SPIN_JITTER = 0.28;

const SLOP = 0.35;
const CORR = 0.72;

const SPEED_EPS = 10;
const ANG_EPS = 0.28;
const STILL_TIME = 0.34;

const CUBE = 26;
const CUBE_MASS = 1;
const INV_M = 1 / CUBE_MASS;
const INV_I = 1 / ((CUBE_MASS * CUBE * CUBE) / 6);

const START_WALL_X = 0;
const START_WALL_BOUNCE = 0.06;
const START_WALL_SPIN_DAMP = 0.28;

const DPR_CAP = 1.5;

// The reference game has a clear staircase rhythm: small upward steps grouped
// into runs, then long flat ledges where a good landing can settle.
const LEVEL = 22;
const PX_PER_M = 42;
const WORLD_LEN = 9000;

const CAM_LERP = 5.8;
const PARALLAX = 0.1;

const MAX_PARTICLES = 110;

/* ===========================================================================
 * Deterministic RNG + seeded staircase generation
 * ========================================================================= */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Step {
  x0: number;
  x1: number;
  mid: number;
  topY: number; // world Y of top surface at mid (smaller Y = higher up)
  slope: number; // tan of crooked tilt of the top face
  nx: number; // top-face outward normal (pointing up-ish)
  ny: number;
  leftExposed: boolean; // left face is an exposed riser (this step higher than left neighbor)
  rightExposed: boolean; // right face is an exposed riser
  // cached cosmetic noise so the texture is stable per match
  noise: number[];
}

interface Stairs {
  steps: Step[];
  minTopY: number;
  maxTopY: number;
}

function generateStairs(seed: number): Stairs {
  const rnd = mulberry32(seed);
  const steps: Step[] = [];

  let x = 0;
  let topY = 548;
  const MIN_TOP = -5600;
  const MAX_TOP = 640;

  // A "run" is a staircase burst. At the end of each burst we insert a longer
  // landing shelf. This gives the level the readable rhythm visible in Climb Jump
  // instead of looking like uniform procedural noise.
  let runLeft = 5 + Math.floor(rnd() * 4);
  let justHadPlateau = false;

  while (x < WORLD_LEN) {
    const startPad = steps.length < 2;
    const plateau = !startPad && runLeft <= 0;

    let width: number;
    let deltaLevels = 0;

    if (startPad) {
      width = 142 + rnd() * 18;
      deltaLevels = 0;
    } else if (plateau) {
      // Long breathers are a signature part of the route. They also make a clean
      // landing meaningful because the cube can actually settle before the next jump.
      width = CUBE * (3.35 + rnd() * 2.05);
      const pr = rnd();
      deltaLevels = pr < 0.58 ? 0 : pr < 0.92 ? -1 : 1;
      runLeft = 5 + Math.floor(rnd() * 5);
      justHadPlateau = true;
    } else {
      const wr = rnd();
      if (wr < 0.5) width = CUBE * (1.02 + rnd() * 0.17);
      else if (wr < 0.86) width = CUBE * (1.2 + rnd() * 0.34);
      else width = CUBE * (1.58 + rnd() * 0.48);

      // Mostly climb one level at a time. Two-level jumps exist, but are rare
      // enough to feel like deliberate obstacles instead of random punishment.
      const hr = rnd();
      if (justHadPlateau && hr < 0.28) deltaLevels = -2;
      else if (hr < 0.72) deltaLevels = -1;
      else if (hr < 0.87) deltaLevels = 0;
      else if (hr < 0.97) deltaLevels = -2;
      else deltaLevels = 1;

      runLeft -= 1;
      justHadPlateau = false;
    }

    topY += deltaLevels * LEVEL;
    if (topY < MIN_TOP) topY = MIN_TOP + rnd() * LEVEL * 2;
    if (topY > MAX_TOP) topY = MAX_TOP - rnd() * LEVEL;

    // Climb Jump's staircase is visually blocky and readable. Keep almost every
    // top perfectly flat; a tiny tilt appears only occasionally for physics variety.
    const slope = !startPad && !plateau && rnd() < 0.055 ? (rnd() - 0.5) * 0.022 : 0;

    const x0 = x;
    const x1 = x + width;
    const mid = (x0 + x1) / 2;
    const nmag = Math.hypot(slope, 1);

    const noise: number[] = [];
    for (let i = 0; i < 5; i++) noise.push(rnd());

    steps.push({
      x0,
      x1,
      mid,
      topY,
      slope,
      nx: slope / nmag,
      ny: -1 / nmag,
      leftExposed: false,
      rightExposed: false,
      noise,
    });

    x = x1;
  }

  let minTopY = Infinity;
  let maxTopY = -Infinity;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const L = steps[i - 1];
    const R = steps[i + 1];
    s.leftExposed = !!L && s.topY < L.topY - 1;
    s.rightExposed = !!R && s.topY < R.topY - 1;
    minTopY = Math.min(minTopY, s.topY);
    maxTopY = Math.max(maxTopY, s.topY);
  }

  return { steps, minTopY, maxTopY };
}

function stepIndexAt(steps: Step[], px: number): number {
  // Binary search; clamps to first/last (ends extend flat to infinity).
  if (px <= steps[0].x0) return 0;
  if (px >= steps[steps.length - 1].x1) return steps.length - 1;
  let lo = 0;
  let hi = steps.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = steps[mid];
    if (px < s.x0) hi = mid - 1;
    else if (px >= s.x1) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(steps.length - 1, lo));
}

function surfaceYAt(s: Step, px: number): number {
  const cx = Math.max(s.x0, Math.min(s.x1, px));
  return s.topY + s.slope * (cx - s.mid);
}

/* ===========================================================================
 * Cube body
 * ========================================================================= */

interface Cube {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  av: number; // angular velocity
  stopped: boolean;
  stillTimer: number;
  startX: number; // x at the start of the current turn
  dustCd: number; // impact-dust cooldown
  isPlayer: boolean;
}

function spawnCubeOnStep(stairs: Stairs, px: number, isPlayer: boolean): Cube {
  const s = stairs.steps[stepIndexAt(stairs.steps, px)];
  const sy = surfaceYAt(s, px);
  return {
    x: px,
    y: sy - CUBE / 2 - 0.5,
    vx: 0,
    vy: 0,
    angle: 0,
    av: 0,
    stopped: true,
    stillTimer: 0,
    startX: px,
    dustCd: 0,
    isPlayer,
  };
}

interface TerrainContact {
  d: number; // penetration depth
  nx: number;
  ny: number;
}

function terrainContact(stairs: Stairs, px: number, py: number): TerrainContact | null {
  const steps = stairs.steps;
  const s = steps[stepIndexAt(steps, px)];
  const sy = surfaceYAt(s, px);
  if (py <= sy) return null; // above the surface, not penetrating

  // Candidate 1: top face (sloped normal)
  let bestD = py - sy;
  let bestNx = s.nx;
  let bestNy = s.ny;

  // Candidate 2/3: exposed risers (only consider shallow side penetration)
  if (s.leftExposed) {
    const dl = px - s.x0;
    if (dl >= 0 && dl < bestD && dl < CUBE) {
      bestD = dl;
      bestNx = -1;
      bestNy = 0;
    }
  }
  if (s.rightExposed) {
    const dr = s.x1 - px;
    if (dr >= 0 && dr < bestD && dr < CUBE) {
      bestD = dr;
      bestNx = 1;
      bestNy = 0;
    }
  }
  return { d: bestD, nx: bestNx, ny: bestNy };
}

/* ===========================================================================
 * Move provider (bot now; swappable for WebSocket later)
 *
 * To go online later: implement RemoteMoveProvider whose requestMove() resolves
 * from network input received during the prep window, and feed its result into
 * pendingMoveRef the same way the bot's result is fed. The engine never needs
 * to know the difference.
 * ========================================================================= */

interface LaunchMove {
  vx: number; // launch velocity x (px/s); forward (right) is positive
  vy: number; // launch velocity y (px/s); up is negative (screen coords)
  power: number; // 0..100 normalized magnitude, for the HUD / preview only
}

interface MoveContext {
  cube: Cube;
  stairs: Stairs;
  turn: number;
  totalTurns: number;
}

interface MoveProvider {
  /** Called once at the start of a prep phase; the move stays secret until launch. */
  requestMove(ctx: MoveContext, rnd: () => number): LaunchMove;
}

const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Build a sanitized launch from an angle (above horizontal) + speed. */
function moveFromAngleSpeed(angle: number, speed: number): LaunchMove {
  const a = clampN(angle, LAUNCH_ANGLE_MIN, LAUNCH_ANGLE_MAX);
  const s = clampN(speed, MIN_LAUNCH, MAX_LAUNCH);
  const power = Math.round(clampN((s - MIN_LAUNCH) / (MAX_LAUNCH - MIN_LAUNCH), 0, 1) * 100);
  return { vx: Math.cos(a) * s, vy: -Math.sin(a) * s, power };
}

const DEFAULT_MOVE = (): LaunchMove => moveFromAngleSpeed(DEFAULT_ANGLE, DEFAULT_SPEED);

/**
 * Turn a raw horizontal/up velocity request into a legal launch.
 * Unlike the bot helper, player drag is allowed to shoot LEFT or RIGHT:
 * pulling right means the cube flies left, pulling left means it flies right.
 * Vertical downward launches are still blocked, and angle/speed are clamped.
 */
function clampLaunch(vxRaw: number, vyUpRaw: number): LaunchMove {
  const dir = vxRaw < 0 ? -1 : 1;
  const vxAbs = Math.abs(vxRaw);
  const vyUp = Math.max(0, vyUpRaw); // never launch downward
  const speed = Math.hypot(vxAbs, vyUp);
  if (speed < 1) return DEFAULT_MOVE();

  const angle = clampN(Math.atan2(vyUp, Math.max(1, vxAbs)), LAUNCH_ANGLE_MIN, LAUNCH_ANGLE_MAX);
  const s = clampN(speed, MIN_LAUNCH, MAX_LAUNCH);
  const power = Math.round(clampN((s - MIN_LAUNCH) / (MAX_LAUNCH - MIN_LAUNCH), 0, 1) * 100);

  return {
    vx: dir * Math.cos(angle) * s,
    vy: -Math.sin(angle) * s,
    power,
  };
}

/** Solve a launch speed that, at the given angle, passes through (dx, dyDown). */
function speedForTarget(dx: number, dyDown: number, angle: number): number | null {
  if (dx <= 0) return null;
  const c = Math.cos(angle);
  const t = Math.tan(angle);
  // dyDown = -dx*tan + (g*dx^2)/(2 s^2 c^2)  ->  solve for s
  const denom = 2 * c * c * (dyDown + dx * t);
  if (denom <= 0) return null; // can't reach with this angle (need steeper)
  const s2 = (GRAVITY * dx * dx) / denom;
  if (s2 <= 0) return null;
  return Math.sqrt(s2);
}

function createBotProvider(): MoveProvider {
  return {
    requestMove(ctx, rnd) {
      const { cube, stairs } = ctx;
      const steps = stairs.steps;
      const hereIndex = stepIndexAt(steps, cube.x);
      const here = steps[hereIndex];

      let best: { score: number; step: Step; speed: number; angle: number } | null = null;

      // Prefer a real reachable landing, not simply the farthest step. This makes
      // the bot obey the same "calculate your landing" rhythm as the player.
      for (let i = hereIndex + 1; i < Math.min(steps.length, hereIndex + 13); i++) {
        const target = steps[i];
        const dx = target.mid - cube.x;
        if (dx < 28 || dx > 500) continue;

        const dyDown = target.topY - CUBE / 2 - cube.y;
        let angle = (44 + rnd() * 16) * (Math.PI / 180);
        let speed = speedForTarget(dx, dyDown, angle);

        for (let tries = 0; tries < 5 && speed == null; tries++) {
          angle = Math.min(LAUNCH_ANGLE_MAX, angle + 5 * (Math.PI / 180));
          speed = speedForTarget(dx, dyDown, angle);
        }
        if (speed == null || speed > MAX_LAUNCH * 1.03 || speed < MIN_LAUNCH * 0.82) continue;

        const width = target.x1 - target.x0;
        const climb = Math.max(0, (here.topY - target.topY) / LEVEL);
        const safeBonus = width / CUBE;
        const progress = dx / 110;
        const powerPenalty = Math.max(0, speed - MAX_LAUNCH * 0.82) / 160;
        const score = safeBonus * 1.35 + progress - climb * 0.22 - powerPenalty + (rnd() - 0.5) * 0.34;

        if (!best || score > best.score) best = { score, step: target, speed, angle };
      }

      if (!best) return DEFAULT_MOVE();

      // Human imperfection. Enough to keep the duel interesting, but not so much
      // that the bot seems to randomly throw itself off the staircase.
      const speedNoise = 1 + (rnd() - 0.5) * 0.105;
      const angleNoise = (rnd() - 0.5) * (4.5 * Math.PI / 180);
      return moveFromAngleSpeed(best.angle + angleNoise, best.speed * speedNoise);
    },
  };
}

/* ===========================================================================
 * Particles (impact dust + debris)
 * ========================================================================= */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: 0 | 1; // 0 = dust, 1 = debris
}

/* ===========================================================================
 * Game phases & mutable game state (kept in a ref; never triggers React renders)
 * ========================================================================= */

type Phase = 'intro' | 'prep' | 'resolve' | 'result';
type Outcome = 'VICTORY' | 'DEFEAT' | 'DRAW' | null;

interface GameState {
  phase: Phase;
  turn: number;
  prepLeft: number;
  resolveElapsed: number;
  stairs: Stairs;
  player: Cube;
  bot: Cube;
  pendingPlayer: LaunchMove;
  pendingBot: LaunchMove;
  cam: { x: number; y: number };
  particles: Particle[];
  outcome: Outcome;
  finalPlayerM: number;
  finalBotM: number;
  rndSeed: number;
}

/* ===========================================================================
 * Component
 * ========================================================================= */

export interface PhysicsDuelProps {
  /** Optional fixed seed for the staircase (otherwise random per match). */
  seed?: number;
  /** Optional exit handler; if omitted, the Exit button tries Telegram close. */
  onExit?: () => void;
}

export const PhysicsDuel: React.FC<PhysicsDuelProps> = ({ seed, onExit }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Low-frequency UI state (HUD only).
  const [phase, setPhase] = useState<Phase>('intro');
  const [turn, setTurn] = useState(1);
  const [timeLeft, setTimeLeft] = useState(PREP_TIME);
  const [playerM, setPlayerM] = useState(0);
  const [botM, setBotM] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const { finishMatch: finishLobbyMatch, pending: matchFinishPending, finishError: matchFinishError, clearPending: clearMatchFinish } = useLobbyMatchFinish('descent_duel');

  useEffect(() => {
    if (phase !== 'result' || !outcome) return;
    void finishLobbyMatch(outcome === 'VICTORY' ? 'win' : outcome === 'DEFEAT' ? 'loss' : 'draw');
  }, [phase, outcome, finishLobbyMatch]);

  const [power, setPower] = useState(0); // live launch power 0..100 (from drag), HUD only
  const [matchSeed] = useState(() => seed ?? ((Math.random() * 1e9) | 0));

  // Mutable engine state.
  const gameRef = useRef<GameState | null>(null);
  const botRef = useRef<MoveProvider>(createBotProvider());
  const rafRef = useRef<number | null>(null);
  const viewRef = useRef({ w: 360, h: 640, dpr: 1 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const vignetteRef = useRef<HTMLCanvasElement | null>(null);
  const lastTimeRef = useRef(0);
  const uiAccumRef = useRef(0);

  // Drag-to-launch (slingshot) state. Lives in a ref so the high-frequency render
  // loop reads it without triggering React re-renders.
  const dragRef = useRef<{
    active: boolean; // finger currently down
    locked: boolean; // released with a valid pull this prep phase
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    move: LaunchMove | null; // current legal move (live while dragging / when locked)
  }>({ active: false, locked: false, startX: 0, startY: 0, curX: 0, curY: 0, move: null });

  /* ----- build a fresh match ----- */
  const buildGame = useCallback((matchSeed: number): GameState => {
    const stairs = generateStairs(matchSeed);
    const player = spawnCubeOnStep(stairs, 90, true);
    const bot = spawnCubeOnStep(stairs, 150, false);
    return {
      phase: 'intro',
      turn: 1,
      prepLeft: PREP_TIME,
      resolveElapsed: 0,
      stairs,
      player,
      bot,
      pendingPlayer: DEFAULT_MOVE(),
      pendingBot: DEFAULT_MOVE(),
      cam: { x: 0, y: 0 },
      particles: [],
      outcome: null,
      finalPlayerM: 0,
      finalBotM: 0,
      rndSeed: matchSeed,
    };
  }, []);

  useEffect(() => {
    if (gameRef.current === null) {
      gameRef.current = buildGame(matchSeed);
    }
  }, [buildGame, matchSeed]);

  /* ----- helpers to push to React UI at low frequency ----- */
  const syncUI = useCallback(() => {
    const g = gameRef.current!;
    setPhase((p) => (p !== g.phase ? g.phase : p));
    setTurn((t) => (t !== g.turn ? g.turn : t));
    setOutcome((o) => (o !== g.outcome ? g.outcome : o));
    const tl = Math.max(0, Math.ceil(g.prepLeft));
    setTimeLeft((v) => (v !== tl ? tl : v));
    // Mirror the live launch power (from the current drag) onto the HUD meter.
    const d = dragRef.current;
    const pw = g.phase === 'prep' && d.move ? d.move.power : 0;
    setPower((v) => (v !== pw ? pw : v));
  }, []);

  /* ----- particles ----- */
  const spawnImpact = useCallback((g: GameState, x: number, y: number, strength: number) => {
    const n = Math.min(8, 2 + Math.floor(strength / 90));
    for (let i = 0; i < n; i++) {
      if (g.particles.length >= MAX_PARTICLES) break;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 40 + Math.random() * (strength * 0.5);
      const debris = Math.random() < 0.4;
      g.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp + (Math.random() - 0.5) * 30,
        vy: Math.sin(a) * sp - Math.random() * 40,
        life: 0,
        max: 0.4 + Math.random() * 0.5,
        size: debris ? 1.6 + Math.random() * 2.2 : 1 + Math.random() * 1.8,
        kind: debris ? 1 : 0,
      });
    }
  }, []);

  /* ----- physics for one cube, one substep ----- */
  const stepCube = useCallback(
    (g: GameState, cube: Cube, h: number) => {
      if (cube.stopped) return;

      cube.vy += GRAVITY * h;

      // Exponential damping is stable regardless of device frame pacing.
      const linearDamp = Math.exp(-AIR_DRAG * h);
      const angularDamp = Math.exp(-ANG_AIR_DRAG * h);
      cube.vx *= linearDamp;
      cube.vy *= linearDamp;
      cube.av *= angularDamp;
      cube.av = clampN(cube.av, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);

      cube.x += cube.vx * h;
      cube.y += cube.vy * h;
      cube.angle += cube.av * h;

      const half = CUBE / 2;
      let contact = false;
      let nearSurface = false;
      let maxImpact = 0;
      let impactX = cube.x;
      let impactY = cube.y + half;

      if (cube.x - half < START_WALL_X) {
        const impact = Math.abs(cube.vx);
        cube.x = START_WALL_X + half;
        if (cube.vx < 0) cube.vx = -cube.vx * START_WALL_BOUNCE;
        cube.av *= START_WALL_SPIN_DAMP;
        cube.stillTimer = 0;
        maxImpact = Math.max(maxImpact, impact);
        impactX = START_WALL_X;
      }

      for (let iter = 0; iter < SOLVER_ITERS; iter++) {
        const ca = Math.cos(cube.angle);
        const sa = Math.sin(cube.angle);
        const corners = [
          [-half, -half],
          [half, -half],
          [half, half],
          [-half, half],
        ] as const;

        for (let c = 0; c < corners.length; c++) {
          const lx = corners[c][0];
          const ly = corners[c][1];
          const rx = lx * ca - ly * sa;
          const ry = lx * sa + ly * ca;
          const pxw = cube.x + rx;
          const pyw = cube.y + ry;

          const nearStep = g.stairs.steps[stepIndexAt(g.stairs.steps, pxw)];
          const nearSy = surfaceYAt(nearStep, pxw);
          if (pyw >= nearSy - 3 && pyw <= nearSy + 7) nearSurface = true;

          const ct = terrainContact(g.stairs, pxw, pyw);
          if (!ct) continue;
          contact = true;

          const rvx = cube.vx - cube.av * ry;
          const rvy = cube.vy + cube.av * rx;
          const vn = rvx * ct.nx + rvy * ct.ny;

          if (vn < 0) {
            const rn = rx * ct.ny - ry * ct.nx;
            const denom = INV_M + rn * rn * INV_I;
            const j = Math.max(0, (-(1 + RESTITUTION) * vn) / denom);

            cube.vx += j * ct.nx * INV_M;
            cube.vy += j * ct.ny * INV_M;
            cube.av += (rx * (j * ct.ny) - ry * (j * ct.nx)) * INV_I;

            if (-vn > maxImpact && iter === 0) {
              maxImpact = -vn;
              impactX = pxw;
              impactY = pyw;
            }

            // Coulomb friction transfers horizontal landing speed into rotation.
            // That coupling is what makes edge landings naturally tip/roll instead
            // of feeling like a square sliding on rails.
            const rvx2 = cube.vx - cube.av * ry;
            const rvy2 = cube.vy + cube.av * rx;
            const tx = -ct.ny;
            const ty = ct.nx;
            const vt = rvx2 * tx + rvy2 * ty;
            const rt = rx * ty - ry * tx;
            const denomT = INV_M + rt * rt * INV_I;
            let jt = -vt / denomT;
            const maxF = FRICTION * j;
            jt = clampN(jt, -maxF, maxF);

            cube.vx += jt * tx * INV_M;
            cube.vy += jt * ty * INV_M;
            cube.av += (rx * (jt * ty) - ry * (jt * tx)) * INV_I;
            cube.av = clampN(cube.av, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
          }

          const corr = Math.max(ct.d - SLOP, 0) * CORR;
          if (corr > 0) {
            cube.x += ct.nx * corr;
            cube.y += ct.ny * corr;
          }
        }
      }

      if (contact) {
        const rollDamp = Math.exp(-ROLL_RES * h);
        cube.vx *= rollDamp;
        cube.av *= rollDamp;

        // No magnetic landing assist. Only when the cube is already nearly calm do
        // we add a very small sleep-friendly damping so it doesn't micro-jitter forever.
        const lowMotion = Math.abs(cube.vx) < 48 && Math.abs(cube.vy) < 44 && Math.abs(cube.av) < 1.8;
        if (lowMotion) {
          cube.vx *= Math.exp(-0.7 * h);
          cube.av *= Math.exp(-1.0 * h);
          if (cube.vy > 0) cube.vy *= Math.exp(-0.55 * h);
        }
      }

      cube.dustCd -= h;
      if (maxImpact > 190 && cube.dustCd <= 0) {
        spawnImpact(g, impactX, impactY, maxImpact);
        cube.dustCd = 0.12;
      }

      const speed = Math.hypot(cube.vx, cube.vy);
      const angsp = Math.abs(cube.av);
      const restingCandidate = (contact || nearSurface) && speed < SPEED_EPS && angsp < ANG_EPS;

      if (restingCandidate) {
        cube.stillTimer += h;
        if (cube.stillTimer >= STILL_TIME) {
          cube.stopped = true;
          cube.vx = 0;
          cube.vy = 0;
          cube.av = 0;
          cube.angle = Math.round(cube.angle / (Math.PI / 2)) * (Math.PI / 2);
        }
      } else {
        cube.stillTimer = 0;
      }
    },
    [spawnImpact],
  );

  /* ----- launch both cubes simultaneously ----- */
  const launch = useCallback((g: GameState) => {
    const fire = (cube: Cube, mv: LaunchMove) => {
      cube.vx = mv.vx;
      cube.vy = mv.vy;

      const dir = mv.vx < 0 ? -1 : 1;
      const jitter = (Math.random() - 0.5) * LAUNCH_SPIN_JITTER;
      cube.av = dir * (MIN_LAUNCH_SPIN + mv.power * LAUNCH_SPIN_POWER) + jitter;

      cube.stopped = false;
      cube.stillTimer = 0;
      cube.startX = cube.x;
      cube.y -= 1.5;
    };

    fire(g.player, g.pendingPlayer);
    fire(g.bot, g.pendingBot);
  }, []);

  /* ----- prep/resolve/turn transitions ----- */
  const enterPrep = useCallback((g: GameState) => {
    g.phase = 'prep';
    g.prepLeft = PREP_TIME;
    // Reset the player's aim for the new turn (defaults to a small safe hop).
    const d = dragRef.current;
    d.active = false;
    d.locked = false;
    d.move = null;
    g.pendingPlayer = DEFAULT_MOVE();
    // Bot decides its (secret) move now; this is where a network move would be requested.
    const rnd = mulberry32((g.rndSeed + g.turn * 977) >>> 0);
    g.pendingBot = botRef.current.requestMove(
      { cube: g.bot, stairs: g.stairs, turn: g.turn, totalTurns: TOTAL_TURNS },
      rnd,
    );
  }, []);

  const endTurn = useCallback(
    (g: GameState) => {
      if (g.turn >= TOTAL_TURNS) {
        // Final standing = absolute world x of each cube.
        g.finalPlayerM = g.player.x / PX_PER_M;
        g.finalBotM = g.bot.x / PX_PER_M;
        const diff = g.player.x - g.bot.x;
        if (Math.abs(diff) < CUBE * 0.6) g.outcome = 'DRAW';
        else g.outcome = diff > 0 ? 'VICTORY' : 'DEFEAT';
        g.phase = 'result';
      } else {
        g.turn += 1;
        enterPrep(g);
      }
    },
    [enterPrep],
  );

  /* ----- camera ----- */
  const updateCamera = useCallback((g: GameState, h: number) => {
    const v = viewRef.current;
    const p = g.player;
    const b = g.bot;
    const sep = Math.abs(p.x - b.x);
    const midX = (p.x + b.x) / 2;

    // --- Horizontal: frame both when close, otherwise follow the player (~42% in). ---
    let targetX: number;
    if (sep < v.w * 0.62) {
      targetX = midX - v.w / 2; // frame both
    } else {
      targetX = p.x - v.w * 0.42; // follow the player
    }
    if (targetX < -v.w * 0.2) targetX = -v.w * 0.2;

    // --- Vertical: anchor the GROUND beneath the player to the lower part of the
    // screen, NOT the cube itself. This keeps the staircase in the lower ~third and
    // leaves the upper portion for the parallax background, fog and atmosphere.
    // When the cube launches, it arcs up into that background space and stays
    // visible, while the ground line holds steady. ---
    const steps = g.stairs.steps;
    const sUnder = steps[stepIndexAt(steps, p.x)];
    const groundY = surfaceYAt(sUnder, p.x);
    // Player rests at groundY - CUBE/2; place that around 67% of screen height.
    let targetY = groundY - CUBE / 2 - v.h * 0.71;

    // Safety: if a big launch carries the cube near the top edge, ease the camera up
    // just enough to keep it on-screen (rare, thanks to the launch-speed clamp).
    const playerScreenY = p.y - targetY;
    if (playerScreenY < v.h * 0.12) targetY = p.y - v.h * 0.12;

    const k = Math.min(1, h * CAM_LERP);
    g.cam.x += (targetX - g.cam.x) * k;
    g.cam.y += (targetY - g.cam.y) * k;
  }, []);

  /* ----- one simulation tick ----- */
  const simulate = useCallback(
    (g: GameState, dt: number) => {
      if (g.phase === 'prep') {
        g.prepLeft -= dt;
        if (g.prepLeft <= 0) {
          // Lock in the player's move: a released drag, else the drag still held at
          // expiry, else a small safe default if the player did nothing.
          const d = dragRef.current;
          g.pendingPlayer = d.move ?? DEFAULT_MOVE();
          d.active = false;
          d.locked = true;
          launch(g);
          g.phase = 'resolve';
          g.resolveElapsed = 0;
        }
      } else if (g.phase === 'resolve') {
        g.resolveElapsed += dt;
        // Fixed-step physics for stability.
        let acc = dt;
        let steps = 0;
        while (acc > 1e-5 && steps < MAX_SUBSTEPS) {
          const hsub = Math.min(FIXED_DT, acc);
          stepCube(g, g.player, hsub);
          stepCube(g, g.bot, hsub);
          acc -= hsub;
          steps += 1;
        }
        const bothStopped = g.player.stopped && g.bot.stopped;
        if (bothStopped || g.resolveElapsed > MAX_RESOLVE) {
          g.player.stopped = true;
          g.bot.stopped = true;
          g.player.vx = g.player.vy = g.player.av = 0;
          g.bot.vx = g.bot.vy = g.bot.av = 0;
          endTurn(g);
        }
      }

      // Particles (cheap; integrate every frame).
      const ps = g.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const pt = ps[i];
        pt.life += dt;
        if (pt.life >= pt.max) {
          ps.splice(i, 1);
          continue;
        }
        pt.vy += GRAVITY * 0.55 * dt;
        pt.vx *= 1 - 1.4 * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
      }

      updateCamera(g, dt);
    },
    [launch, stepCube, endTurn, updateCamera],
  );

  /* ----- offscreen textures (grain + vignette) sized to viewport ----- */
  const buildTextures = useCallback(() => {
    const v = viewRef.current;
    // Grain (small tile, used as a repeating pattern).
    const g = document.createElement('canvas');
    g.width = 160;
    g.height = 160;
    const gx = g.getContext('2d')!;
    const id = gx.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (Math.random() * 255) | 0;
      id.data[i] = n;
      id.data[i + 1] = n;
      id.data[i + 2] = n;
      id.data[i + 3] = 255;
    }
    gx.putImageData(id, 0, 0);
    grainRef.current = g;

    // Vignette (radial darkening), full viewport, rebuilt on resize.
    const vg = document.createElement('canvas');
    vg.width = Math.max(2, v.w);
    vg.height = Math.max(2, v.h);
    const vc = vg.getContext('2d')!;
    const grad = vc.createRadialGradient(
      v.w / 2,
      v.h * 0.46,
      Math.min(v.w, v.h) * 0.22,
      v.w / 2,
      v.h * 0.5,
      Math.max(v.w, v.h) * 0.78,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    vc.fillStyle = grad;
    vc.fillRect(0, 0, v.w, v.h);
    vignetteRef.current = vg;
  }, []);

  /* ----- rendering ----- */
  const renderStep = useCallback(
    (ctx: CanvasRenderingContext2D, s: Step, camX: number, camY: number, viewH: number) => {
      const sx0 = s.x0 - camX;
      const sx1 = s.x1 - camX;
      const topL = s.topY + s.slope * (s.x0 - s.mid) - camY;
      const topR = s.topY + s.slope * (s.x1 - s.mid) - camY;
      const bottom = viewH + 64;

      // Tall simple columns + one crisp top cap. Less fake 2.5D geometry, more of
      // the clean readable staircase silhouette that makes Climb Jump work.
      const body = ctx.createLinearGradient(sx0, 0, sx1, 0);
      body.addColorStop(0, '#15171a');
      body.addColorStop(0.55, '#1b1d20');
      body.addColorStop(1, '#111316');

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.lineTo(sx1, bottom);
      ctx.lineTo(sx0, bottom);
      ctx.closePath();
      ctx.fill();

      const faceShade = ctx.createLinearGradient(0, Math.min(topL, topR), 0, bottom);
      faceShade.addColorStop(0, 'rgba(255,255,255,0.05)');
      faceShade.addColorStop(0.22, 'rgba(255,255,255,0.012)');
      faceShade.addColorStop(1, 'rgba(0,0,0,0.44)');
      ctx.fillStyle = faceShade;
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.lineTo(sx1, bottom);
      ctx.lineTo(sx0, bottom);
      ctx.closePath();
      ctx.fill();

      // Thin top surface. It reads as a physical ledge without visually making the
      // collision surface look offset from where the cube actually lands.
      ctx.strokeStyle = 'rgba(220,224,230,0.72)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(sx0, topL);
      ctx.lineTo(sx1, topR);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(91,183,255,0.09)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx0, topL + 2.5);
      ctx.lineTo(sx1, topR + 2.5);
      ctx.stroke();

      // Sparse stable texture flecks; enough depth without noisy concrete blocks.
      const width = sx1 - sx0;
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < s.noise.length; i++) {
        const nx = sx0 + s.noise[i] * width;
        const ny = Math.min(topL, topR) + 12 + s.noise[(i + 2) % s.noise.length] * 48;
        ctx.fillRect(nx, ny, 1.4, 1.4);
      }
    },
    [],
  );

  const renderCube = useCallback(
    (ctx: CanvasRenderingContext2D, cube: Cube, camX: number, camY: number) => {
      const sx = cube.x - camX;
      const sy = cube.y - camY;
      const half = CUBE / 2;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(cube.angle);

      // Body.
      ctx.fillStyle = '#050506';
      ctx.fillRect(-half, -half, CUBE, CUBE);

      // Edge highlight (player brighter than bot for subtle legibility).
      ctx.strokeStyle = cube.isPlayer ? 'rgba(236,238,242,0.9)' : 'rgba(150,153,158,0.75)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-half, -half, CUBE, CUBE);

      // Top-left specular line.
      ctx.strokeStyle = cube.isPlayer ? 'rgba(255,255,255,0.5)' : 'rgba(190,193,198,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-half + 2, -half + 2);
      ctx.lineTo(half - 4, -half + 2);
      ctx.stroke();
      ctx.restore();
    },
    [],
  );

  const renderArrow = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      g: GameState,
      target: Cube,
      viewW: number,
      viewH: number,
    ) => {
      const sx = target.x - g.cam.x;
      const sy = target.y - g.cam.y;
      const EDGE = 34;
      const onLeft = sx < EDGE;
      const onRight = sx > viewW - EDGE;
      if (!onLeft && !onRight) return; // visible enough

      const offBy = onLeft ? EDGE - sx : sx - (viewW - EDGE);
      const t = Math.max(0, Math.min(1, offBy / (viewW * 0.95)));
      const size = 30 - 16 * t; // close -> big, far -> small
      const alpha = 0.92 - 0.55 * t;
      const ax = onLeft ? EDGE : viewW - EDGE;
      const ay = Math.max(70, Math.min(viewH - 90, sy));
      const dir = onLeft ? -1 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      // Glow halo.
      const halo = ctx.createRadialGradient(ax, ay, 1, ax, ay, size * 1.7);
      halo.addColorStop(0, 'rgba(235,237,241,0.5)');
      halo.addColorStop(1, 'rgba(235,237,241,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(ax, ay, size * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Chevron.
      ctx.fillStyle = 'rgba(238,240,244,0.96)';
      ctx.beginPath();
      ctx.moveTo(ax + dir * size * 0.7, ay);
      ctx.lineTo(ax - dir * size * 0.5, ay - size * 0.6);
      ctx.lineTo(ax - dir * size * 0.16, ay);
      ctx.lineTo(ax - dir * size * 0.5, ay + size * 0.6);
      ctx.closePath();
      ctx.fill();

      // Distance label when far.
      if (t > 0.5) {
        const gapM = Math.abs(target.x - g.player.x) / PX_PER_M;
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = 'rgba(220,222,226,0.9)';
        ctx.font = '600 10px ui-monospace, Menlo, monospace';
        ctx.textAlign = onLeft ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        const tx = onLeft ? ax + size * 0.9 : ax - size * 0.9;
        ctx.fillText(`${Math.round(gapM)}m`, tx, ay + size * 0.95);
      }
      ctx.restore();
    },
    [],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!canvas || !g) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = viewRef.current;
    const { w, h } = v;

    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // --- Background: base wash + parallax image cover ---
    const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
    baseGrad.addColorStop(0, '#0c0d0f');
    baseGrad.addColorStop(1, '#070708');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      const aspect = img.naturalWidth / img.naturalHeight;
      const drawH = h * 1.06; // slight overscan to hide edges
      const drawW = drawH * aspect;
      let startX = (-g.cam.x * PARALLAX) % drawW;
      if (startX > 0) startX -= drawW;
      ctx.globalAlpha = 0.85;
      for (let x = startX; x < w; x += drawW) {
        ctx.drawImage(img, x, -h * 0.03, drawW, drawH);
      }
      ctx.globalAlpha = 1;
      // Dark overlay to keep the mood and contrast.
      ctx.fillStyle = 'rgba(8,8,10,0.45)';
      ctx.fillRect(0, 0, w, h);
    }

    // --- Foreground staircase (only visible steps) ---
    const steps = g.stairs.steps;
    const left = g.cam.x - 60;
    const right = g.cam.x + w + 60;
    // narrow down with a quick scan from an estimated index
    let i0 = stepIndexAt(steps, left);
    while (i0 > 0 && steps[i0].x1 > left) i0--;
    for (let i = i0; i < steps.length; i++) {
      const s = steps[i];
      if (s.x0 > right) break;
      if (s.x1 < left) continue;
      renderStep(ctx, s, g.cam.x, g.cam.y, h);
    }

    // --- Ground fog band ---
    const fog = ctx.createLinearGradient(0, h * 0.55, 0, h);
    fog.addColorStop(0, 'rgba(120,124,130,0)');
    fog.addColorStop(0.7, 'rgba(96,100,107,0.1)');
    fog.addColorStop(1, 'rgba(70,73,79,0.22)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // --- Particles (debris/dust) ---
    for (const pt of g.particles) {
      const a = 1 - pt.life / pt.max;
      const px = pt.x - g.cam.x;
      const py = pt.y - g.cam.y;
      if (pt.kind === 1) {
        ctx.fillStyle = `rgba(30,31,33,${a})`;
        ctx.fillRect(px, py, pt.size, pt.size);
      } else {
        ctx.fillStyle = `rgba(190,193,198,${a * 0.5})`;
        ctx.beginPath();
        ctx.arc(px, py, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Cubes ---
    renderCube(ctx, g.bot, g.cam.x, g.cam.y);
    renderCube(ctx, g.player, g.cam.x, g.cam.y);

    // Player marker (subtle caret above player's cube so "you" is legible).
    {
      const psx = g.player.x - g.cam.x;
      const psy = g.player.y - g.cam.y - CUBE - 6;
      ctx.fillStyle = 'rgba(236,238,242,0.85)';
      ctx.beginPath();
      ctx.moveTo(psx, psy + 6);
      ctx.lineTo(psx - 5, psy);
      ctx.lineTo(psx + 5, psy);
      ctx.closePath();
      ctx.fill();
    }

    // --- Aim preview (player, during prep) ---
    // Uses the actual chosen launch velocity (drag, or the safe default) and draws
    // a short dotted gravity arc plus the current pull direction.
    if (g.phase === 'prep') {
      const d = dragRef.current;
      const mv = d.move ?? DEFAULT_MOVE();
      const cubeSX = g.player.x - g.cam.x;
      const cubeSY = g.player.y - g.cam.y;

      // Pull guide: line from the cube to the current drag handle.
      if (d.active) {
        const hx = cubeSX + (d.curX - d.startX);
        const hy = cubeSY + (d.curY - d.startY);
        ctx.save();
        ctx.strokeStyle = 'rgba(236,238,242,0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cubeSX, cubeSY);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(236,238,242,0.8)';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Dotted gravity arc following only ~40% of the actual launch path.
      const onlyDefault = !d.move; // dim the arc when it's just the idle default
      ctx.fillStyle = 'rgba(236,238,242,0.55)';
      const startSY = g.player.y - CUBE / 2;
      for (let s = 1; s <= 10; s++) {
        const t = s * 0.045;
        const wx = g.player.x + mv.vx * t;
        const wy = startSY + mv.vy * t + 0.5 * GRAVITY * t * t;
        const psx = wx - g.cam.x;
        const psy = wy - g.cam.y;
        if (s % 2 === 0) {
          ctx.globalAlpha = Math.max(0, (onlyDefault ? 0.32 : 0.62) - s * 0.022);
          ctx.beginPath();
          ctx.arc(psx, psy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (psy > h + 40) break;
      }
      ctx.globalAlpha = 1;
    }

    // --- Offscreen opponent arrow (and player if needed) ---
    renderArrow(ctx, g, g.bot, w, h);

    // --- Grain overlay ---
    const grain = grainRef.current;
    if (grain) {
      const pat = ctx.createPattern(grain, 'repeat');
      if (pat) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.globalCompositeOperation = 'overlay';
        const ox = (Date.now() / 90) % 160;
        ctx.translate(-ox, -((ox * 0.7) % 160));
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w + 160, h + 160);
        ctx.restore();
      }
    }

    // --- Vignette ---
    const vg = vignetteRef.current;
    if (vg) ctx.drawImage(vg, 0, 0, w, h);
  }, [renderStep, renderCube, renderArrow]);

  /* ----- main loop ----- */
  const frameRef = useRef<(now: number) => void>(() => {});

  const frame = useCallback(
    (now: number) => {
      const g = gameRef.current!;
      if (!lastTimeRef.current) lastTimeRef.current = now;
      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (dt > 0.05) dt = 0.05; // clamp big stalls

      simulate(g, dt);
      render();

      // Throttle UI sync (distances + phase + timer) to ~10fps.
      uiAccumRef.current += dt;
      if (uiAccumRef.current >= 0.1) {
        uiAccumRef.current = 0;
        syncUI();
        setPlayerM((m) => {
          const nv = Math.round(g.player.x / PX_PER_M);
          return nv !== m ? nv : m;
        });
        setBotM((m) => {
          const nv = Math.round(g.bot.x / PX_PER_M);
          return nv !== m ? nv : m;
        });
      }

      rafRef.current = requestAnimationFrame((time) => frameRef.current(time));
    },
    [simulate, render, syncUI],
  );

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  /* ----- mount: canvas sizing, image, telegram, listeners, RAF ----- */
  useEffect(() => {
    // Background image.
    const image = new Image();
    image.src = upback;
    imgRef.current = image;

    // Telegram Mini App: lock vertical swipes, expand, and disable page scroll.
    const tg = getTelegramWebApp();
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      /* ignore */
    }

    const canvas = canvasRef.current!;
    const container = containerRef.current!;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      let h = rect.height;
      // Fall back to Telegram viewport / window height if container is collapsed.
      if (!h || h < 60) {
        h = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      viewRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      buildTextures();
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    // Block touchmove inside the game so the Mini App doesn't scroll/bounce.
    const blockTouch = (e: TouchEvent) => {
      e.preventDefault();
    };
    container.addEventListener('touchmove', blockTouch, { passive: false });

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      container.removeEventListener('touchmove', blockTouch);
      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        /* ignore */
      }
    };
  }, [frame, buildTextures]);

  /* ----- controls: drag-to-launch (slingshot) ----- */
  // Compute the legal move from the current drag (or null if the pull is too small).
  const computeDragMove = useCallback((): LaunchMove | null => {
    const d = dragRef.current;
    const pullX = d.startX - d.curX; // pull LEFT (back) => launch RIGHT (forward)
    const pullY = d.startY - d.curY; // pull DOWN (back) => launch UP
    if (Math.hypot(pullX, pullY) < MIN_PULL) return null;
    // pull down => curY > startY => pullY < 0 => upward magnitude = -pullY
    return clampLaunch(pullX * DRAG_SCALE, -pullY * DRAG_SCALE);
  }, []);

  const localXY = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  }, []);

  const onAreaDown = useCallback(
    (e: React.PointerEvent) => {
      if (gameRef.current?.phase !== 'prep') return;
      const { x, y } = localXY(e);
      const d = dragRef.current;
      d.active = true;
      d.locked = false;
      d.startX = x;
      d.startY = y;
      d.curX = x;
      d.curY = y;
      d.move = null;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [localXY],
  );

  const onAreaMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || gameRef.current?.phase !== 'prep') return;
      const { x, y } = localXY(e);
      d.curX = x;
      d.curY = y;
      d.move = computeDragMove();
    },
    [localXY, computeDragMove],
  );

  const onAreaUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const { x, y } = localXY(e);
      d.curX = x;
      d.curY = y;
      const mv = computeDragMove();
      d.active = false;
      if (mv) {
        // Released with a real pull: lock this move in for the rest of prep.
        d.move = mv;
        d.locked = true;
      } else {
        // Tiny pull: treat as no shot so the player can try again.
        d.move = null;
        d.locked = false;
      }
    },
    [localXY, computeDragMove],
  );

  const startMatch = useCallback(() => {
    const g = gameRef.current!;
    g.turn = 1;
    enterPrep(g);
    // Center camera immediately so the first frame isn't jarring.
    updateCamera(g, 1);
    syncUI();
  }, [enterPrep, updateCamera, syncUI]);

  const rematch = useCallback(() => {
    const newSeed = (Math.random() * 1e9) | 0;
    gameRef.current = buildGame(newSeed);
    setOutcome(null);
    setPlayerM(0);
    setBotM(0);
    setTurn(1);
    setTimeLeft(PREP_TIME);
    const g = gameRef.current;
    g.turn = 1;
    enterPrep(g);
    updateCamera(g, 1);
    syncUI();
  }, [buildGame, enterPrep, updateCamera, syncUI]);

  const exit = useCallback(() => {
    if (onExit) onExit();
    else {
      const tg = getTelegramWebApp();
      try {
        tg?.close?.();
      } catch {
        /* ignore */
      }
    }
  }, [onExit]);

  /* ===========================================================================
   * Render (DOM HUD over the canvas)
   * ========================================================================= */

  const turnLabel = String(turn).padStart(2, '0');

  return (
    <div
      ref={containerRef}
      className="pd-root"
      onPointerDown={onAreaDown}
      onPointerMove={onAreaMove}
      onPointerUp={onAreaUp}
      onPointerCancel={onAreaUp}
    >
      <MatchFinishStatus pending={matchFinishPending} error={matchFinishError} onDismiss={clearMatchFinish} />
      <style>{`
        .pd-root {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #070708;
          touch-action: none;
          overscroll-behavior: none;
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          color: #e9ebef;
          font-family: ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace;
        }

        .pd-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        .pd-hud-top {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 10px 12px;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(6, 6, 8, 0.72) 0%, rgba(6, 6, 8, 0) 100%);
        }

        .pd-turn-wrap {
          text-align: center;
          flex: 1;
        }

        .pd-turn-label {
          font-size: 11px;
          letter-spacing: 3px;
          opacity: 0.6;
        }

        .pd-turn-value {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .pd-stat {
          min-width: 64px;
        }

        .pd-stat-left { text-align: left; }
        .pd-stat-right { text-align: right; }

        .pd-stat-label {
          font-size: 10px;
          letter-spacing: 3px;
          opacity: 0.55;
        }

        .pd-stat-value {
          font-size: 17px;
          font-weight: 700;
        }

        .pd-prep {
          position: absolute;
          top: 64px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          pointer-events: none;
        }

        .pd-prep-label {
          font-size: 10px;
          letter-spacing: 4px;
          opacity: 0.55;
        }

        .pd-prep-time {
          font-size: 34px;
          font-weight: 800;
          line-height: 1;
          text-shadow: 0 2px 18px rgba(0, 0, 0, 0.8);
        }

        .pd-prep-progress {
          width: 120px;
          height: 3px;
          margin-top: 6px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 2px;
          overflow: hidden;
        }

        .pd-prep-progress-fill {
          height: 100%;
          background: rgba(236, 238, 242, 0.85);
          transition: width 0.18s linear;
        }

        .pd-resolve-label {
          position: absolute;
          top: 70px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          letter-spacing: 4px;
          opacity: 0.5;
          pointer-events: none;
        }

        .pd-launch-panel {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 12px 16px 18px;
          background: linear-gradient(0deg, rgba(6, 6, 8, 0.82) 0%, rgba(6, 6, 8, 0) 100%);
          opacity: 1;
          pointer-events: none;
          transition: opacity 0.2s;
        }

        .pd-launch-panel-dim {
          opacity: 0.4;
        }

        .pd-launch-meta {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          letter-spacing: 3px;
          opacity: 0.6;
          margin-bottom: 6px;
        }

        .pd-power-track {
          position: relative;
          height: 8px;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          overflow: hidden;
        }

        .pd-power-fill {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          background: linear-gradient(90deg, rgba(120, 123, 128, 0.45), rgba(236, 238, 242, 0.7));
          transition: width 0.06s linear;
        }

        .pd-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          background: radial-gradient(120% 120% at 50% 40%, rgba(8, 8, 10, 0.55), rgba(6, 6, 8, 0.9));
          backdrop-filter: blur(2px);
        }

        .pd-intro-kicker {
          font-size: 11px;
          letter-spacing: 5px;
          opacity: 0.55;
        }

        .pd-intro-title {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 2px;
          margin: 10px 0 4px;
        }

        .pd-intro-copy {
          font-size: 12px;
          opacity: 0.6;
          max-width: 280px;
          line-height: 1.5;
          margin: 0 auto 22px;
        }

        .pd-result-kicker {
          font-size: 13px;
          letter-spacing: 5px;
          opacity: 0.55;
          margin-bottom: 4px;
        }

        .pd-outcome {
          font-size: 44px;
          font-weight: 900;
          letter-spacing: 3px;
          text-shadow: 0 4px 30px rgba(0, 0, 0, 0.8);
        }

        .pd-outcome-victory { color: #f3f4f7; }
        .pd-outcome-defeat { color: #8b8e93; }
        .pd-outcome-draw { color: #c8cace; }

        .pd-result-scores {
          display: flex;
          gap: 28px;
          justify-content: center;
          margin: 20px 0 24px;
        }

        .pd-result-divider {
          width: 1px;
          background: rgba(255, 255, 255, 0.12);
        }

        .pd-result-stat-label {
          font-size: 10px;
          letter-spacing: 3px;
          opacity: 0.55;
        }

        .pd-result-stat-value {
          font-size: 24px;
          font-weight: 800;
        }

        .pd-result-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
        }

        .pd-btn-primary {
          font-size: 13px;
          letter-spacing: 3px;
          font-weight: 700;
          color: #0a0a0b;
          background: #eceef2;
          border: none;
          border-radius: 8px;
          padding: 12px 22px;
          cursor: pointer;
        }

        .pd-btn-ghost {
          font-size: 13px;
          letter-spacing: 3px;
          font-weight: 700;
          color: #e9ebef;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 8px;
          padding: 12px 22px;
          cursor: pointer;
        }
      `}</style>

      <canvas ref={canvasRef} className="pd-canvas" />

      <div className="pd-hud-top">
        <Stat label="YOU" value={`${playerM}m`} align="left" />
        <div className="pd-turn-wrap">
          <div className="pd-turn-label">TURN</div>
          <div className="pd-turn-value">
            {turnLabel} / {TOTAL_TURNS}
          </div>
        </div>
        <Stat label="RIVAL" value={`${botM}m`} align="right" />
      </div>

      {phase === 'prep' && (
        <div className="pd-prep">
          <div className="pd-prep-label">PREPARE</div>
          <div className="pd-prep-time">{timeLeft}</div>
          <div className="pd-prep-progress">
            <WidthFill pct={(timeLeft / PREP_TIME) * 100} className="pd-prep-progress-fill" />
          </div>
        </div>
      )}

      {phase === 'resolve' && <div className="pd-resolve-label">IN MOTION…</div>}

      {(phase === 'prep' || phase === 'resolve') && (
        <div className={`pd-launch-panel ${phase === 'resolve' ? 'pd-launch-panel-dim' : ''}`}>
          <div className="pd-launch-meta">
            <span>{power > 0 ? 'POWER' : 'DRAG TO AIM'}</span>
            <span>{power > 0 ? power : 'RELEASE TO LOCK'}</span>
          </div>
          <div className="pd-power-track">
            <WidthFill pct={power} className="pd-power-fill" />
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <Overlay>
          <div className="pd-intro-kicker">1 V 1 · PHYSICS DUEL</div>
          <div className="pd-intro-title">CLIMB DUEL</div>
          <div className="pd-intro-copy">
            {TOTAL_TURNS} turns. Each turn you have {PREP_TIME}s — drag to set your jump and release to
            lock it. Read the staircase, land cleanly and keep your momentum. Furthest cube wins.
          </div>
          <PrimaryButton label="BEGIN" onClick={startMatch} />
        </Overlay>
      )}

      {phase === 'result' && outcome && (
        <Overlay>
          <div className="pd-result-kicker">MATCH COMPLETE</div>
          <div
            className={`pd-outcome ${
              outcome === 'VICTORY'
                ? 'pd-outcome-victory'
                : outcome === 'DEFEAT'
                  ? 'pd-outcome-defeat'
                  : 'pd-outcome-draw'
            }`}
          >
            {outcome}
          </div>
          <div className="pd-result-scores">
            <ResultStat label="YOU" value={`${Math.round(playerM)}m`} />
            <div className="pd-result-divider" />
            <ResultStat label="RIVAL" value={`${Math.round(botM)}m`} />
          </div>
          <div className="pd-result-actions">
            <PrimaryButton label="REMATCH" onClick={rematch} />
            <GhostButton label="EXIT" onClick={exit} />
          </div>
        </Overlay>
      )}
    </div>
  );
};

/* ===========================================================================
 * Small presentational helpers
 * ========================================================================= */

const WidthFill = ({ pct, className }: { pct: number; className: string }) => {
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fillRef.current?.style.setProperty('width', `${Math.max(0, Math.min(100, pct))}%`);
  }, [pct]);

  return <div ref={fillRef} className={className} />;
};

const Stat: React.FC<{ label: string; value: string; align: 'left' | 'right' }> = ({
  label,
  value,
  align,
}) => (
  <div className={`pd-stat ${align === 'left' ? 'pd-stat-left' : 'pd-stat-right'}`}>
    <div className="pd-stat-label">{label}</div>
    <div className="pd-stat-value">{value}</div>
  </div>
);

const Overlay: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pd-overlay">{children}</div>
);

const ResultStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="pd-result-stat-label">{label}</div>
    <div className="pd-result-stat-value">{value}</div>
  </div>
);

const PrimaryButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} className="pd-btn-primary" type="button">
    {label}
  </button>
);

const GhostButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} className="pd-btn-ghost" type="button">
    {label}
  </button>
);

export default PhysicsDuel;