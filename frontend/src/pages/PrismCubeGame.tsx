import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type MatchPhase = "countdown" | "playing" | "finished";
type Lane = 0 | 1 | 2;
type SurfaceKind = "base" | "glass" | "pulse" | "tech";
type HazardKind = "spike" | "double_spike" | "saw" | "wall";
type PickupKind = "shard" | "core";
type FaceColor = 0 | 1 | 2 | 3;

type Surface = {
  id: number;
  x: number;
  width: number;
  lane: Lane;
  kind: SurfaceKind;
  landed: boolean;
};

type Hazard = {
  id: number;
  x: number;
  lane: Lane;
  kind: HazardKind;
  width: number;
  height: number;
};

type Pickup = {
  id: number;
  x: number;
  lane: Lane;
  yOffset: number;
  kind: PickupKind;
  taken: boolean;
};

type SyncPad = {
  id: number;
  x: number;
  lane: Lane;
  color: FaceColor;
  scored: boolean;
};

type JumpOrb = {
  id: number;
  x: number;
  lane: Lane;
  yOffset: number;
  used: boolean;
};

type Checkpoint = {
  x: number;
  lane: Lane;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
  gravity: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  hue: number;
  scale: number;
};

type UiState = {
  score: number;
  rivalScore: number;
  combo: number;
  bestCombo: number;
  syncs: number;
  crashes: number;
  distance: number;
  face: FaceColor;
  energy: number;
  seed: number;
};

const MATCH_SECONDS = 45;
const COUNTDOWN_SECONDS = 3;
const MAX_DPR = 1.65;
const PLAYER_SCREEN_X_RATIO = 0.24;
const PLAYER_SIZE = 38;
const GRAVITY = 2_100;
const JUMP_VELOCITY = -650;
const HOLD_FORCE = -1_300;
const HOLD_LIMIT_MS = 185;
const ORB_VELOCITY = -720;
const START_SPEED = 242;
const MAX_SPEED = 330;
const SECTION_WIDTH = 590;
const LANE_GAP = 92;
const BASE_SURFACE_DEPTH = 170;
const RESPAWN_DELAY_MS = 650;
const INVULNERABILITY_MS = 900;

const FACE_COLORS = ["#5BE7FF", "#FF6FCA", "#FFD76A", "#66F2A8"] as const;
const FACE_NAMES = ["CYAN", "PINK", "GOLD", "MINT"] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

const normalizeQuarter = (value: number) => {
  const rounded = Math.round(value);
  return ((rounded % 4) + 4) % 4 as FaceColor;
};

const createRandom = (initialSeed: number) => {
  let seed = Math.max(1, Math.floor(initialSeed) % 2_147_483_647);

  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
};

const randomSeed = () => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return Math.max(1, buffer[0] || 1);
  }

  return Math.max(1, Math.floor(Date.now() % 2_147_483_647));
};

const getInitials = (value: string) =>
  value
    .replace("@", "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TG";

const triggerHaptic = (
  type: "light" | "medium" | "heavy" | "success" | "error",
) => {
  const feedback = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (style: "light" | "medium" | "heavy") => void;
            notificationOccurred?: (kind: "success" | "error") => void;
          };
        };
      };
    }
  ).Telegram?.WebApp?.HapticFeedback;

  if (type === "success" || type === "error") {
    feedback?.notificationOccurred?.(type);
    return;
  }

  feedback?.impactOccurred?.(type);
};

const initialUiState = (seed: number): UiState => ({
  score: 0,
  rivalScore: 0,
  combo: 0,
  bestCombo: 0,
  syncs: 0,
  crashes: 0,
  distance: 0,
  face: 0,
  energy: 0,
  seed,
});

const PlayerAvatar = ({ name, rival = false }: { name: string; rival?: boolean }) => (
  <div
    className={[
      "grid h-10 w-10 shrink-0 place-items-center rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.26)]",
      rival
        ? "border-[#FF6FCA]/42 bg-[#FF6FCA]/10 text-[#FFC4E8]"
        : "border-[#5BE7FF]/46 bg-[#5BE7FF]/10 text-[#C7F9FF]",
    ].join(" ")}
  >
    {getInitials(name)}
  </div>
);

export default function PrismCubeGame() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [phase, setPhase] = useState<MatchPhase>("countdown");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS);
  const [hintVisible, setHintVisible] = useState(true);
  const [ui, setUi] = useState<UiState>(() => initialUiState(randomSeed()));

  const result = useMemo(() => {
    if (ui.score === ui.rivalScore) return "draw" as const;
    return ui.score > ui.rivalScore ? ("win" as const) : ("lose" as const);
  }, [ui.rivalScore, ui.score]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const seed = randomSeed();
    const random = createRandom(seed);
    const fxRandom = createRandom(seed + 77_731);
    const rivalRandom = createRandom(seed + 918_241);

    setUi(initialUiState(seed));
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
    setTimeLeft(MATCH_SECONDS);
    setHintVisible(true);

    let animationId = 0;
    let previousFrameAt = performance.now();
    const matchCreatedAt = previousFrameAt;
    let internalPhase: MatchPhase = "countdown";
    let lastUiCommitAt = 0;
    let levelGeneratedTo = 0;
    let nextId = 1;
    let currentSectionIndex = 0;
    let currentCheckpointIndex = 0;
    let worldOffset = 0;
    let maxWorldOffset = 0;
    let localScore = 0;
    let rivalScore = 0;
    let combo = 0;
    let bestCombo = 0;
    let syncs = 0;
    let crashes = 0;
    let distancePointsStep = 0;
    let energy = 0;
    let overdriveUntil = 0;
    let crashFlash = 0;
    let syncFlash = 0;
    let cameraShake = 0;
    let speedPulse = 0;
    let rivalBeat = -1;
    let finishedCommitted = false;
    let pointerDown = false;
    let pointerDownAt = 0;
    let hintHidden = false;
    let latestCheckpointX = 0;
    let respawnAt = 0;
    let invulnerableUntil = 0;
    let statusText = "GET READY";
    let statusHue = 190;
    let statusUntil = 0;

    const viewport = {
      width: 1,
      height: 520,
      dpr: 1,
      groundY: 0,
      playerX: 0,
    };

    const player = {
      y: 0,
      previousY: 0,
      vy: 0,
      grounded: true,
      lane: 0 as Lane,
      angle: 0,
      angularVelocity: 0,
      face: 0 as FaceColor,
      squash: 0,
      stretch: 0,
      dead: false,
      orbLockUntil: 0,
    };

    const surfaces: Surface[] = [];
    const hazards: Hazard[] = [];
    const pickups: Pickup[] = [];
    const syncPads: SyncPad[] = [];
    const jumpOrbs: JumpOrb[] = [];
    const checkpoints: Checkpoint[] = [];
    const particles: Particle[] = [];
    const texts: FloatingText[] = [];

    const laneY = (lane: Lane) => viewport.groundY - lane * LANE_GAP;

    const playerWorldX = () => worldOffset + viewport.playerX;

    const comboMultiplier = () => Math.min(5, 1 + Math.floor(combo / 5));

    const setStatus = (text: string, hue: number, duration = 700) => {
      statusText = text;
      statusHue = hue;
      statusUntil = performance.now() + duration;
    };

    const addText = (
      x: number,
      y: number,
      text: string,
      hue: number,
      scale = 1,
    ) => {
      texts.push({
        x,
        y,
        text,
        life: 0.72,
        maxLife: 0.72,
        hue,
        scale,
      });
    };

    const addParticles = (
      x: number,
      y: number,
      amount: number,
      hue: number,
      power = 1,
    ) => {
      for (let index = 0; index < amount && particles.length < 150; index += 1) {
        const angle = fxRandom() * Math.PI * 2;
        const speed = (45 + fxRandom() * 180) * power;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30 * power,
          size: 1.5 + fxRandom() * 4.5,
          life: 0.38 + fxRandom() * 0.62,
          maxLife: 1,
          hue: hue + fxRandom() * 24 - 12,
          gravity: 240 + fxRandom() * 340,
        });
      }
    };

    const award = (
      basePoints: number,
      comboGain: number,
      label: string,
      hue: number,
      x = viewport.playerX,
      y = player.y,
    ) => {
      combo = Math.max(0, combo + comboGain);
      bestCombo = Math.max(bestCombo, combo);
      const points = Math.round(basePoints * comboMultiplier());
      localScore += points;
      energy = clamp(energy + Math.max(2, comboGain * 5 + basePoints * 0.08), 0, 100);
      addText(x, y - 16, `${label} +${points}`, hue, 1 + comboMultiplier() * 0.06);

      if (energy >= 100) {
        energy = 0;
        overdriveUntil = performance.now() + 4_200;
        speedPulse = 1;
        syncFlash = 1;
        addParticles(viewport.playerX, player.y, 34, 185, 1.35);
        setStatus("PRISM RUSH", 185, 1_200);
        triggerHaptic("success");
      }
    };

    const addSurface = (
      x: number,
      width: number,
      lane: Lane,
      kind: SurfaceKind = lane === 0 ? "base" : "glass",
    ) => {
      surfaces.push({ id: nextId++, x, width, lane, kind, landed: false });
    };

    const addHazard = (
      x: number,
      lane: Lane,
      kind: HazardKind,
      width = kind === "double_spike" ? 58 : kind === "wall" ? 42 : 30,
      height = kind === "wall" ? 62 : kind === "saw" ? 42 : 34,
    ) => {
      hazards.push({ id: nextId++, x, lane, kind, width, height });
    };

    const addPickup = (
      x: number,
      lane: Lane,
      yOffset = 48,
      kind: PickupKind = "shard",
    ) => {
      pickups.push({
        id: nextId++,
        x,
        lane,
        yOffset,
        kind,
        taken: false,
      });
    };

    const addPickupArc = (
      startX: number,
      endX: number,
      lane: Lane,
      count: number,
      height = 72,
      rareCenter = false,
    ) => {
      for (let index = 0; index < count; index += 1) {
        const progress = count <= 1 ? 0.5 : index / (count - 1);
        const arc = Math.sin(progress * Math.PI) * height;
        addPickup(
          lerp(startX, endX, progress),
          lane,
          35 + arc,
          rareCenter && index === Math.floor(count / 2) ? "core" : "shard",
        );
      }
    };

    const addSyncPad = (x: number, lane: Lane, color?: FaceColor) => {
      syncPads.push({
        id: nextId++,
        x,
        lane,
        color: color ?? (Math.floor(random() * 4) as FaceColor),
        scored: false,
      });
    };

    const addOrb = (x: number, lane: Lane, yOffset = 70) => {
      jumpOrbs.push({
        id: nextId++,
        x,
        lane,
        yOffset,
        used: false,
      });
    };

    const addCheckpoint = (x: number, lane: Lane = 0) => {
      checkpoints.push({ x, lane });
    };

    const addSafeIntro = (startX: number) => {
      addSurface(startX, 210, 0, "tech");
      addCheckpoint(startX + 24, 0);
      addPickup(startX + 85, 0, 44);
      addPickup(startX + 135, 0, 44);
    };

    const sectionWarmup = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, SECTION_WIDTH - 210, 0, "base");
      const spikeX = startX + 300 + random() * 50;
      addHazard(spikeX, 0, difficulty > 0.62 ? "double_spike" : "spike");
      addPickupArc(spikeX - 55, spikeX + 105, 0, 5, 62, true);
      addSyncPad(startX + 470, 0);
    };

    const sectionGapArc = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      const gapStart = startX + 250;
      const gapWidth = 72 + difficulty * 34 + random() * 24;
      addSurface(startX + 210, 40, 0, "base");
      addSurface(gapStart + gapWidth, SECTION_WIDTH - (gapStart - startX) - gapWidth, 0, "pulse");
      addPickupArc(gapStart - 26, gapStart + gapWidth + 50, 0, 6, 88, true);
      addSyncPad(gapStart + gapWidth + 100, 0);
    };

    const sectionUpperChoice = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, SECTION_WIDTH - 210, 0, "base");
      addHazard(startX + 320, 0, difficulty > 0.5 ? "double_spike" : "spike");
      addSurface(startX + 280, 225, 1, "glass");
      addPickupArc(startX + 300, startX + 485, 1, 7, 36, true);
      addSyncPad(startX + 430, 1);
      addPickup(startX + 520, 0, 44);
    };

    const sectionOrbLift = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, SECTION_WIDTH - 210, 0, "base");
      const wallX = startX + 360;
      addHazard(wallX, 0, "wall", 46, 72 + difficulty * 12);
      addOrb(startX + 295, 0, 86);
      addSurface(startX + 350, 180, 1, "pulse");
      addPickupArc(startX + 365, startX + 515, 1, 7, 48, true);
      addSyncPad(startX + 455, 1);
    };

    const sectionStairs = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, 110, 0, "base");
      addSurface(startX + 300, 120, 1, "tech");
      addSurface(startX + 420, 120, difficulty > 0.55 ? 2 : 1, "glass");
      addSurface(startX + 515, SECTION_WIDTH - 515, 0, "pulse");
      addPickup(startX + 325, 1, 40);
      addPickup(startX + 370, 1, 46);
      addPickup(startX + 450, difficulty > 0.55 ? 2 : 1, 44, "core");
      addSyncPad(startX + 478, difficulty > 0.55 ? 2 : 1);
    };

    const sectionSawRhythm = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, SECTION_WIDTH - 210, 0, "base");
      const first = startX + 300;
      addHazard(first, 0, "saw");
      addHazard(first + 155 - difficulty * 18, 0, difficulty > 0.66 ? "double_spike" : "spike");
      addPickupArc(first - 32, first + 195, 0, 8, 82, true);
      addSyncPad(startX + 505, 0);
    };

    const sectionPrecisionBridge = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, 110, 0, "base");
      addSurface(startX + 345, 88, 1, "glass");
      addSurface(startX + 470, 92, difficulty > 0.6 ? 2 : 1, "pulse");
      addSurface(startX + 555, 35, 0, "base");
      addPickupArc(startX + 300, startX + 520, 1, 7, 78, true);
      addOrb(startX + 405, 1, 76);
      addSyncPad(startX + 492, difficulty > 0.6 ? 2 : 1);
    };

    const sectionPrismGate = (startX: number, difficulty: number) => {
      addSafeIntro(startX);
      addSurface(startX + 210, SECTION_WIDTH - 210, 0, "pulse");
      const shuffled = [0, 1, 2, 3] as FaceColor[];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      for (let index = 0; index < 3; index += 1) {
        const x = startX + 300 + index * (100 - difficulty * 8);
        addSyncPad(x, 0, shuffled[index]);
        if (index < 2) addHazard(x + 48, 0, index === 1 && difficulty > 0.7 ? "double_spike" : "spike");
      }
      addPickup(startX + 532, 0, 66, "core");
    };

    const sectionFactories = [
      sectionWarmup,
      sectionGapArc,
      sectionUpperChoice,
      sectionOrbLift,
      sectionStairs,
      sectionSawRhythm,
      sectionPrecisionBridge,
      sectionPrismGate,
    ];

    const generateSection = (startX: number) => {
      const elapsedDifficulty = clamp(currentSectionIndex / 12, 0, 1);
      let factoryIndex = Math.floor(random() * sectionFactories.length);

      if (currentSectionIndex < 2) {
        factoryIndex = currentSectionIndex === 0 ? 0 : random() > 0.5 ? 1 : 2;
      }

      sectionFactories[factoryIndex](startX, elapsedDifficulty);
      currentSectionIndex += 1;
      levelGeneratedTo = startX + SECTION_WIDTH;
    };

    const ensureLevel = (targetX: number) => {
      while (levelGeneratedTo < targetX) {
        generateSection(levelGeneratedTo);
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      viewport.width = Math.max(1, bounds.width);
      viewport.height = Math.max(480, bounds.height);
      viewport.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      viewport.groundY = viewport.height * 0.77;
      viewport.playerX = viewport.width * PLAYER_SCREEN_X_RATIO;

      canvas.width = Math.round(viewport.width * viewport.dpr);
      canvas.height = Math.round(viewport.height * viewport.dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

      if (player.grounded || player.y === 0) {
        player.y = laneY(player.lane) - PLAYER_SIZE;
        player.previousY = player.y;
      }
    };

    const surfaceAt = (worldX: number, expectedLane?: Lane) => {
      let best: Surface | null = null;

      for (const surface of surfaces) {
        if (worldX < surface.x - 3 || worldX > surface.x + surface.width + 3) continue;
        if (expectedLane !== undefined && surface.lane !== expectedLane) continue;
        if (!best || surface.lane > best.lane) best = surface;
      }

      return best;
    };

    const playerRect = () => ({
      x: viewport.playerX - PLAYER_SIZE * 0.42,
      y: player.y + PLAYER_SIZE * 0.08,
      width: PLAYER_SIZE * 0.84,
      height: PLAYER_SIZE * 0.84,
    });

    const worldPlayerRect = () => ({
      x: playerWorldX() - PLAYER_SIZE * 0.42,
      y: player.y + PLAYER_SIZE * 0.08,
      width: PLAYER_SIZE * 0.84,
      height: PLAYER_SIZE * 0.84,
    });

    const intersects = (
      first: { x: number; y: number; width: number; height: number },
      second: { x: number; y: number; width: number; height: number },
    ) =>
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y;

    const tryOrb = (now: number) => {
      if (player.grounded || now < player.orbLockUntil || player.dead) return false;

      const centerWorldX = playerWorldX();
      const centerY = player.y + PLAYER_SIZE / 2;
      let bestOrb: JumpOrb | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const orb of jumpOrbs) {
        if (orb.used) continue;
        const orbY = laneY(orb.lane) - orb.yOffset;
        const dx = orb.x - centerWorldX;
        const dy = orbY - centerY;
        const distance = Math.hypot(dx, dy);
        if (distance < 64 && distance < bestDistance) {
          bestDistance = distance;
          bestOrb = orb;
        }
      }

      if (!bestOrb) return false;

      bestOrb.used = true;
      player.vy = ORB_VELOCITY;
      player.angularVelocity = 8.6;
      player.orbLockUntil = now + 190;
      award(18, 1, "ORB", 190, viewport.playerX + 10, centerY);
      addParticles(viewport.playerX + 10, centerY, 22, 190, 1.1);
      triggerHaptic("medium");
      return true;
    };

    const jump = (now: number) => {
      if (internalPhase !== "playing" || player.dead) return;
      if (!player.grounded) {
        void tryOrb(now);
        return;
      }

      player.grounded = false;
      player.vy = JUMP_VELOCITY;
      player.angularVelocity = 6.8;
      pointerDownAt = now;
      pointerDown = true;
      player.squash = 0.16;
      addParticles(viewport.playerX, player.y + PLAYER_SIZE, 7, 190, 0.55);
      triggerHaptic("light");
    };

    const crash = (now: number) => {
      if (player.dead || now < invulnerableUntil || internalPhase !== "playing") return;

      player.dead = true;
      player.grounded = false;
      respawnAt = now + RESPAWN_DELAY_MS;
      pointerDown = false;
      crashes += 1;
      combo = 0;
      localScore = Math.max(0, localScore - 60);
      energy = Math.max(0, energy - 28);
      crashFlash = 1;
      cameraShake = 12;
      setStatus("SHATTER -60", 350, 800);
      addParticles(viewport.playerX, player.y + PLAYER_SIZE / 2, 34, 338, 1.45);
      triggerHaptic("error");
    };

    const respawn = (now: number) => {
      let checkpoint = checkpoints[0] || { x: 0, lane: 0 as Lane };

      for (let index = 0; index < checkpoints.length; index += 1) {
        if (checkpoints[index].x <= latestCheckpointX + 1) {
          checkpoint = checkpoints[index];
          currentCheckpointIndex = index;
        } else {
          break;
        }
      }

      worldOffset = Math.max(0, checkpoint.x - viewport.playerX + 34);
      player.lane = checkpoint.lane;
      player.y = laneY(checkpoint.lane) - PLAYER_SIZE;
      player.previousY = player.y;
      player.vy = 0;
      player.grounded = true;
      player.dead = false;
      player.angle = Math.round(player.angle / (Math.PI / 2)) * (Math.PI / 2);
      player.face = normalizeQuarter(player.angle / (Math.PI / 2));
      player.angularVelocity = 0;
      player.squash = 0.22;
      invulnerableUntil = now + INVULNERABILITY_MS;
      setStatus("BACK IN", 190, 650);
    };

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      jump(performance.now());
    };

    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault();
      pointerDown = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump(performance.now());
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        pointerDown = false;
      }
    };

    const updateRival = (elapsedPlaying: number) => {
      const beat = Math.floor(elapsedPlaying * 3.45);
      if (beat === rivalBeat) return;
      rivalBeat = beat;

      const skill = 0.83 + Math.sin(seed * 0.000001) * 0.035;
      const crashRoll = rivalRandom();

      if (crashRoll > skill + 0.11) {
        rivalScore = Math.max(0, rivalScore - 58);
        return;
      }

      const eventRoll = rivalRandom();
      const base = eventRoll > 0.86 ? 34 : eventRoll > 0.56 ? 18 : 10;
      const streakFactor = 1 + Math.min(3.2, beat / 45) * 0.18;
      rivalScore += Math.round(base * streakFactor * (0.84 + rivalRandom() * 0.34));
    };

    const update = (dt: number, now: number, elapsedPlaying: number) => {
      ensureLevel(worldOffset + viewport.width * 2.6);
      updateRival(elapsedPlaying);

      if (player.dead) {
        if (now >= respawnAt) respawn(now);
        crashFlash *= Math.pow(0.02, dt);
        cameraShake *= Math.pow(0.04, dt);
        return;
      }

      const difficulty = clamp(elapsedPlaying / MATCH_SECONDS, 0, 1);
      const inOverdrive = now < overdriveUntil;
      const targetSpeed = lerp(START_SPEED, MAX_SPEED, easeOutCubic(difficulty));
      const airbornePenalty = player.grounded ? 1 : 0.965;
      const speed = targetSpeed * airbornePenalty * (inOverdrive ? 1.11 : 1);
      worldOffset += speed * dt;
      maxWorldOffset = Math.max(maxWorldOffset, worldOffset);
      speedPulse = Math.max(0, speedPulse - dt * 1.75);

      const distanceStep = Math.floor(maxWorldOffset / 44);
      if (distanceStep > distancePointsStep) {
        localScore += distanceStep - distancePointsStep;
        distancePointsStep = distanceStep;
      }

      const currentWorldX = playerWorldX();
      for (let index = currentCheckpointIndex; index < checkpoints.length; index += 1) {
        if (checkpoints[index].x <= currentWorldX - 20) {
          latestCheckpointX = checkpoints[index].x;
          currentCheckpointIndex = index;
        } else {
          break;
        }
      }

      player.previousY = player.y;

      if (
        pointerDown &&
        !player.grounded &&
        now - pointerDownAt < HOLD_LIMIT_MS &&
        player.vy < 80
      ) {
        player.vy += HOLD_FORCE * dt;
      }

      if (!player.grounded) {
        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        player.angle += player.angularVelocity * dt;
      }

      const worldRect = worldPlayerRect();
      const previousBottom = player.previousY + PLAYER_SIZE;
      const currentBottom = player.y + PLAYER_SIZE;
      let landingSurface: Surface | null = null;

      if (player.vy >= 0) {
        for (const surface of surfaces) {
          const top = laneY(surface.lane);
          const horizontallyInside =
            worldRect.x + worldRect.width > surface.x + 4 &&
            worldRect.x < surface.x + surface.width - 4;
          const crossedTop = previousBottom <= top + 7 && currentBottom >= top - 3;

          if (!horizontallyInside || !crossedTop) continue;
          if (!landingSurface || surface.lane > landingSurface.lane) {
            landingSurface = surface;
          }
        }
      }

      if (landingSurface) {
        const impactSpeed = player.vy;
        const wasAirborne = !player.grounded;
        player.lane = landingSurface.lane;
        player.y = laneY(landingSurface.lane) - PLAYER_SIZE;
        player.vy = 0;
        player.grounded = true;
        player.angle = Math.round(player.angle / (Math.PI / 2)) * (Math.PI / 2);
        player.face = normalizeQuarter(player.angle / (Math.PI / 2));
        player.angularVelocity = 0;
        player.squash = clamp(impactSpeed / 1_800, 0.08, 0.24);

        if (wasAirborne) {
          const edgeDistance = Math.min(
            currentWorldX - landingSurface.x,
            landingSurface.x + landingSurface.width - currentWorldX,
          );
          if (edgeDistance > 28 && impactSpeed < 1_040) {
            award(7, 1, "CLEAN", 160, viewport.playerX, player.y);
          }
          addParticles(viewport.playerX, player.y + PLAYER_SIZE, 8, 188, 0.65);
        }

        if (!landingSurface.landed && landingSurface.lane > 0) {
          landingSurface.landed = true;
          award(10 + landingSurface.lane * 5, 1, "HIGH ROUTE", 280);
        }
      } else if (player.grounded) {
        const support = surfaceAt(currentWorldX, player.lane);
        if (!support) {
          player.grounded = false;
          player.vy = 45;
        }
      }

      const activeSurface = surfaceAt(currentWorldX, player.lane);
      if (player.grounded && activeSurface) {
        player.y = laneY(activeSurface.lane) - PLAYER_SIZE;
      }

      const playerHitbox = worldPlayerRect();

      for (const pickup of pickups) {
        if (pickup.taken) continue;
        const pickupY = laneY(pickup.lane) - pickup.yOffset;
        const radius = pickup.kind === "core" ? 14 : 10;
        const centerX = playerHitbox.x + playerHitbox.width / 2;
        const centerY = playerHitbox.y + playerHitbox.height / 2;
        const close = Math.hypot(centerX - pickup.x, centerY - pickupY) < radius + 23;

        if (!close) continue;

        pickup.taken = true;
        const isCore = pickup.kind === "core";
        award(isCore ? 30 : 9, isCore ? 2 : 1, isCore ? "CORE" : "SHARD", isCore ? 48 : 190, pickup.x - worldOffset, pickupY);
        addParticles(pickup.x - worldOffset, pickupY, isCore ? 20 : 10, isCore ? 48 : 190, isCore ? 1.1 : 0.7);
        triggerHaptic(isCore ? "medium" : "light");
      }

      for (const pad of syncPads) {
        if (pad.scored || !player.grounded || player.lane !== pad.lane) continue;
        const dx = Math.abs(currentWorldX - (pad.x + 26));
        if (dx > 29) continue;

        pad.scored = true;
        const matched = player.face === pad.color;
        if (matched) {
          syncs += 1;
          syncFlash = 1;
          award(28, 2, "SYNC", 188, viewport.playerX, player.y - 8);
          addParticles(viewport.playerX, player.y + PLAYER_SIZE, 24, 188, 1.05);
          triggerHaptic("success");
        } else {
          localScore += 4;
          addText(viewport.playerX, player.y - 10, "PHASE +4", 260, 0.88);
        }
      }

      for (const hazard of hazards) {
        const top = laneY(hazard.lane);
        const hazardRect = {
          x: hazard.x,
          y: top - hazard.height,
          width: hazard.width,
          height: hazard.height,
        };

        if (hazard.kind === "saw") {
          const centerX = hazard.x + hazard.width / 2;
          const centerY = top - hazard.height / 2;
          const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
          const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
          if (Math.hypot(playerCenterX - centerX, playerCenterY - centerY) < 29) {
            crash(now);
            break;
          }
        } else if (intersects(playerHitbox, hazardRect)) {
          crash(now);
          break;
        }
      }

      if (player.y > viewport.height + 90) {
        crash(now);
      }

      for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += particle.gravity * dt;
        particle.life -= dt;
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        if (particles[index].life <= 0) particles.splice(index, 1);
      }

      for (const text of texts) {
        text.y -= 42 * dt;
        text.life -= dt;
      }

      for (let index = texts.length - 1; index >= 0; index -= 1) {
        if (texts[index].life <= 0) texts.splice(index, 1);
      }

      player.squash *= Math.pow(0.025, dt);
      player.stretch *= Math.pow(0.04, dt);
      crashFlash *= Math.pow(0.02, dt);
      syncFlash *= Math.pow(0.035, dt);
      cameraShake *= Math.pow(0.035, dt);
    };

    const drawRoundedRect = (
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ) => {
      const safeRadius = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.roundRect(x, y, width, height, safeRadius);
    };

    const drawBackground = (now: number, elapsedPlaying: number) => {
      const gradient = context.createLinearGradient(0, 0, 0, viewport.height);
      gradient.addColorStop(0, "#05081a");
      gradient.addColorStop(0.48, "#10194a");
      gradient.addColorStop(1, "#070a16");
      context.fillStyle = gradient;
      context.fillRect(0, 0, viewport.width, viewport.height);

      const pulse = 0.5 + Math.sin(now * 0.0025) * 0.5;
      const glow = context.createRadialGradient(
        viewport.width * 0.72,
        viewport.height * 0.2,
        0,
        viewport.width * 0.72,
        viewport.height * 0.2,
        viewport.width * 0.8,
      );
      glow.addColorStop(0, `rgba(91,231,255,${0.12 + pulse * 0.05})`);
      glow.addColorStop(0.42, "rgba(157,124,255,0.08)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, viewport.width, viewport.height);

      const horizonY = viewport.height * 0.56;
      context.save();
      context.globalAlpha = 0.34;
      context.strokeStyle = "rgba(95,215,255,0.23)";
      context.lineWidth = 1;
      const gridOffset = -((worldOffset * 0.18) % 54);
      for (let x = gridOffset - 54; x < viewport.width + 54; x += 54) {
        context.beginPath();
        context.moveTo(x, horizonY);
        context.lineTo(viewport.width / 2 + (x - viewport.width / 2) * 2.7, viewport.height);
        context.stroke();
      }
      for (let row = 0; row < 8; row += 1) {
        const progress = row / 7;
        const y = horizonY + Math.pow(progress, 1.8) * (viewport.height - horizonY);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(viewport.width, y);
        context.stroke();
      }
      context.restore();

      for (let index = 0; index < 22; index += 1) {
        const starX = ((index * 173 + seed * 0.013 - worldOffset * (0.015 + (index % 4) * 0.004)) % (viewport.width + 80)) - 40;
        const starY = 75 + ((index * 89 + seed * 0.007) % Math.max(110, horizonY - 90));
        const alpha = 0.18 + ((index * 31) % 50) / 100;
        context.fillStyle = `rgba(210,242,255,${alpha})`;
        context.fillRect(starX, starY, index % 5 === 0 ? 2.2 : 1.2, index % 5 === 0 ? 2.2 : 1.2);
      }

      const speedIntensity = clamp(elapsedPlaying / MATCH_SECONDS + speedPulse * 0.5, 0, 1.35);
      if (speedIntensity > 0.28) {
        context.save();
        context.globalAlpha = 0.12 + speedIntensity * 0.08;
        context.strokeStyle = "#74EEFF";
        context.lineWidth = 1;
        for (let index = 0; index < 16; index += 1) {
          const y = 90 + ((index * 61 + now * 0.16) % Math.max(160, viewport.height - 180));
          const x = viewport.width - ((index * 97 + now * (0.13 + speedIntensity * 0.08)) % (viewport.width + 120));
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + 24 + speedIntensity * 60, y);
          context.stroke();
        }
        context.restore();
      }
    };

    const drawSurface = (surface: Surface) => {
      const x = surface.x - worldOffset;
      if (x > viewport.width + 120 || x + surface.width < -120) return;

      const top = laneY(surface.lane);
      const depth = surface.lane === 0 ? BASE_SURFACE_DEPTH : 18;
      const color =
        surface.kind === "pulse"
          ? "#6D63FF"
          : surface.kind === "glass"
            ? "#2B4F8F"
            : surface.kind === "tech"
              ? "#26314A"
              : "#151D32";

      const frontGradient = context.createLinearGradient(0, top, 0, top + depth);
      frontGradient.addColorStop(0, color);
      frontGradient.addColorStop(1, "#070A13");
      context.fillStyle = frontGradient;
      context.fillRect(x, top, surface.width, depth);

      context.fillStyle = "rgba(255,255,255,0.055)";
      context.fillRect(x, top, surface.width, 4);
      context.fillStyle = surface.kind === "pulse" ? "#9D7CFF" : "#5BE7FF";
      context.globalAlpha = surface.kind === "pulse" ? 0.75 : 0.42;
      context.fillRect(x, top - 2, surface.width, 2);
      context.globalAlpha = 1;

      if (surface.lane === 0) {
        context.fillStyle = "rgba(91,231,255,0.08)";
        for (let panelX = x + 16; panelX < x + surface.width - 12; panelX += 52) {
          drawRoundedRect(panelX, top + 17, 28, 10, 3);
          context.fill();
          context.fillStyle = "rgba(255,111,202,0.07)";
          context.fillRect(panelX + 4, top + 21, 10, 2);
          context.fillStyle = "rgba(91,231,255,0.08)";
        }
      } else {
        context.strokeStyle = "rgba(170,223,255,0.18)";
        context.lineWidth = 1;
        for (let lineX = x + 18; lineX < x + surface.width; lineX += 34) {
          context.beginPath();
          context.moveTo(lineX, top + 4);
          context.lineTo(lineX - 12, top + depth - 2);
          context.stroke();
        }
      }
    };

    const drawHazard = (hazard: Hazard, now: number) => {
      const x = hazard.x - worldOffset;
      if (x > viewport.width + 100 || x + hazard.width < -100) return;
      const top = laneY(hazard.lane);

      if (hazard.kind === "spike" || hazard.kind === "double_spike") {
        const count = hazard.kind === "double_spike" ? 2 : 1;
        const singleWidth = hazard.width / count;
        for (let index = 0; index < count; index += 1) {
          const spikeX = x + index * singleWidth;
          const gradient = context.createLinearGradient(spikeX, top - hazard.height, spikeX, top);
          gradient.addColorStop(0, "#FF84D2");
          gradient.addColorStop(1, "#7A2D86");
          context.fillStyle = gradient;
          context.beginPath();
          context.moveTo(spikeX + 2, top);
          context.lineTo(spikeX + singleWidth / 2, top - hazard.height);
          context.lineTo(spikeX + singleWidth - 2, top);
          context.closePath();
          context.fill();
          context.strokeStyle = "rgba(255,220,248,0.75)";
          context.lineWidth = 1.4;
          context.stroke();
        }
        return;
      }

      if (hazard.kind === "wall") {
        const gradient = context.createLinearGradient(x, top - hazard.height, x + hazard.width, top);
        gradient.addColorStop(0, "#263C73");
        gradient.addColorStop(1, "#12172B");
        context.fillStyle = gradient;
        drawRoundedRect(x, top - hazard.height, hazard.width, hazard.height, 7);
        context.fill();
        context.strokeStyle = "rgba(91,231,255,0.7)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "rgba(255,111,202,0.55)";
        context.fillRect(x + 8, top - hazard.height + 12, hazard.width - 16, 4);
        context.fillStyle = "rgba(255,215,106,0.58)";
        context.fillRect(x + 8, top - 19, hazard.width - 16, 3);
        return;
      }

      const centerX = x + hazard.width / 2;
      const centerY = top - hazard.height / 2;
      const radius = hazard.width / 2;
      context.save();
      context.translate(centerX, centerY);
      context.rotate(now * 0.005);
      context.fillStyle = "#FF6FCA";
      for (let index = 0; index < 10; index += 1) {
        context.rotate((Math.PI * 2) / 10);
        context.beginPath();
        context.moveTo(radius * 0.62, -4);
        context.lineTo(radius + 7, 0);
        context.lineTo(radius * 0.62, 4);
        context.closePath();
        context.fill();
      }
      const core = context.createRadialGradient(0, 0, 0, 0, 0, radius * 0.72);
      core.addColorStop(0, "#F9F2FF");
      core.addColorStop(0.28, "#9D7CFF");
      core.addColorStop(1, "#2C1748");
      context.fillStyle = core;
      context.beginPath();
      context.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const drawPickup = (pickup: Pickup, now: number) => {
      if (pickup.taken) return;
      const x = pickup.x - worldOffset;
      if (x < -80 || x > viewport.width + 80) return;
      const y = laneY(pickup.lane) - pickup.yOffset;
      const radius = pickup.kind === "core" ? 12 : 8;
      const pulse = 1 + Math.sin(now * 0.006 + pickup.id) * 0.1;

      context.save();
      context.translate(x, y);
      context.rotate(now * 0.0018 + pickup.id);
      context.scale(pulse, pulse);
      context.shadowBlur = pickup.kind === "core" ? 22 : 12;
      context.shadowColor = pickup.kind === "core" ? "#FFD76A" : "#5BE7FF";
      context.fillStyle = pickup.kind === "core" ? "#FFD76A" : "#5BE7FF";
      context.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = -Math.PI / 2 + (index / 6) * Math.PI * 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "rgba(255,255,255,0.7)";
      context.beginPath();
      context.arc(-radius * 0.2, -radius * 0.25, radius * 0.22, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const drawSyncPad = (pad: SyncPad, now: number) => {
      const x = pad.x - worldOffset;
      if (x < -90 || x > viewport.width + 90) return;
      const y = laneY(pad.lane);
      const color = FACE_COLORS[pad.color];
      const pulse = 0.55 + Math.sin(now * 0.005 + pad.id) * 0.2;

      context.save();
      context.globalAlpha = pad.scored ? 0.2 : 1;
      const glow = context.createLinearGradient(x, y - 10, x + 52, y);
      glow.addColorStop(0, "rgba(255,255,255,0.12)");
      glow.addColorStop(0.5, color);
      glow.addColorStop(1, "rgba(255,255,255,0.12)");
      context.fillStyle = glow;
      drawRoundedRect(x, y - 9, 52, 9, 4);
      context.fill();
      context.globalAlpha = pad.scored ? 0.12 : pulse;
      context.fillStyle = color;
      context.fillRect(x + 5, y - 18, 42, 3);
      context.restore();
    };

    const drawOrb = (orb: JumpOrb, now: number) => {
      const x = orb.x - worldOffset;
      if (x < -90 || x > viewport.width + 90) return;
      const y = laneY(orb.lane) - orb.yOffset;
      const pulse = 1 + Math.sin(now * 0.008 + orb.id) * 0.12;

      context.save();
      context.translate(x, y);
      context.scale(pulse, pulse);
      context.globalAlpha = orb.used ? 0.2 : 1;
      context.shadowBlur = 22;
      context.shadowColor = "#8AFFF2";
      context.strokeStyle = "#8AFFF2";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 15, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = "rgba(138,255,242,0.2)";
      context.beginPath();
      context.arc(0, 0, 9, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const drawCube = (now: number) => {
      if (player.dead && now < respawnAt) return;

      const blink = now < invulnerableUntil && Math.floor(now / 75) % 2 === 0;
      if (blink) return;

      const centerX = viewport.playerX;
      const centerY = player.y + PLAYER_SIZE / 2;
      const squashX = 1 + player.squash * 0.65 - player.stretch * 0.22;
      const squashY = 1 - player.squash * 0.62 + player.stretch * 0.28;
      const activeColor = FACE_COLORS[player.face];

      context.save();
      context.translate(centerX, centerY);
      context.rotate(player.angle);
      context.scale(squashX, squashY);
      context.shadowBlur = now < overdriveUntil ? 30 : 16;
      context.shadowColor = activeColor;

      const gradient = context.createLinearGradient(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, PLAYER_SIZE / 2);
      gradient.addColorStop(0, "#F4FBFF");
      gradient.addColorStop(0.1, activeColor);
      gradient.addColorStop(0.62, "#29396A");
      gradient.addColorStop(1, "#101428");
      context.fillStyle = gradient;
      drawRoundedRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 7);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "rgba(255,255,255,0.88)";
      context.lineWidth = 2.2;
      context.stroke();

      const quarter = PLAYER_SIZE / 2;
      const colors = FACE_COLORS;
      context.globalAlpha = 0.82;
      context.fillStyle = colors[0];
      context.fillRect(-quarter + 5, -quarter + 5, 9, 9);
      context.fillStyle = colors[1];
      context.fillRect(quarter - 14, -quarter + 5, 9, 9);
      context.fillStyle = colors[2];
      context.fillRect(quarter - 14, quarter - 14, 9, 9);
      context.fillStyle = colors[3];
      context.fillRect(-quarter + 5, quarter - 14, 9, 9);
      context.globalAlpha = 1;

      context.fillStyle = "rgba(4,7,20,0.82)";
      drawRoundedRect(-10, -10, 20, 20, 5);
      context.fill();
      context.fillStyle = activeColor;
      context.fillRect(-5, -5, 10, 10);
      context.restore();

      context.save();
      context.globalAlpha = 0.3;
      context.fillStyle = activeColor;
      context.beginPath();
      context.ellipse(centerX, laneY(player.lane) + 6, 28, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };

    const drawScene = (now: number, elapsedPlaying: number) => {
      context.clearRect(0, 0, viewport.width, viewport.height);
      drawBackground(now, elapsedPlaying);

      const shakeX = cameraShake > 0.1 ? (fxRandom() - 0.5) * cameraShake : 0;
      const shakeY = cameraShake > 0.1 ? (fxRandom() - 0.5) * cameraShake : 0;
      context.save();
      context.translate(shakeX, shakeY);

      for (const surface of surfaces) drawSurface(surface);
      for (const pad of syncPads) drawSyncPad(pad, now);
      for (const pickup of pickups) drawPickup(pickup, now);
      for (const orb of jumpOrbs) drawOrb(orb, now);
      for (const hazard of hazards) drawHazard(hazard, now);

      for (const particle of particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.globalAlpha = alpha;
        context.fillStyle = `hsl(${particle.hue} 95% 70%)`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      drawCube(now);

      for (const text of texts) {
        const alpha = clamp(text.life / text.maxLife, 0, 1);
        context.save();
        context.globalAlpha = alpha;
        context.textAlign = "center";
        context.font = `900 ${Math.round(12 * text.scale)}px system-ui, sans-serif`;
        context.fillStyle = `hsl(${text.hue} 95% 76%)`;
        context.shadowBlur = 12;
        context.shadowColor = `hsl(${text.hue} 95% 58%)`;
        context.fillText(text.text, text.x, text.y);
        context.restore();
      }

      if (now < overdriveUntil) {
        const alpha = 0.05 + Math.sin(now * 0.02) * 0.02;
        context.fillStyle = `rgba(91,231,255,${alpha})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }

      if (syncFlash > 0.01) {
        context.fillStyle = `rgba(91,231,255,${syncFlash * 0.12})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }

      if (crashFlash > 0.01) {
        context.fillStyle = `rgba(255,62,126,${crashFlash * 0.18})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }

      context.restore();

      if (now < statusUntil && internalPhase === "playing") {
        const alpha = clamp((statusUntil - now) / 240, 0, 1);
        context.save();
        context.globalAlpha = alpha;
        context.textAlign = "center";
        context.font = "900 13px system-ui, sans-serif";
        context.fillStyle = `hsl(${statusHue} 95% 72%)`;
        context.shadowBlur = 16;
        context.shadowColor = `hsl(${statusHue} 95% 52%)`;
        context.fillText(statusText, viewport.width / 2, viewport.height * 0.27);
        context.restore();
      }
    };

    const commitUi = (now: number) => {
      if (now - lastUiCommitAt < 70) return;
      lastUiCommitAt = now;

      setUi({
        score: localScore,
        rivalScore,
        combo,
        bestCombo,
        syncs,
        crashes,
        distance: Math.floor(maxWorldOffset * 0.055),
        face: player.face,
        energy,
        seed,
      });
    };

    const frame = (now: number) => {
      const dt = Math.min(32, Math.max(0, now - previousFrameAt)) / 1000;
      previousFrameAt = now;
      const totalElapsed = (now - matchCreatedAt) / 1000;
      const elapsedPlaying = Math.max(0, totalElapsed - COUNTDOWN_SECONDS);

      if (totalElapsed < COUNTDOWN_SECONDS) {
        internalPhase = "countdown";
        const nextCountdown = Math.max(1, Math.ceil(COUNTDOWN_SECONDS - totalElapsed));
        setCountdown((previous) => (previous === nextCountdown ? previous : nextCountdown));
      } else if (elapsedPlaying < MATCH_SECONDS) {
        if (internalPhase !== "playing") {
          internalPhase = "playing";
          setPhase("playing");
          setHintVisible(true);
          triggerHaptic("medium");
        }

        update(dt, now, elapsedPlaying);
        const nextTimeLeft = Math.max(0, Math.ceil(MATCH_SECONDS - elapsedPlaying));
        setTimeLeft((previous) => (previous === nextTimeLeft ? previous : nextTimeLeft));

        if (elapsedPlaying > 5.2 && !hintHidden) {
          hintHidden = true;
          setHintVisible(false);
        }
      } else {
        internalPhase = "finished";
        if (!finishedCommitted) {
          finishedCommitted = true;
          setPhase("finished");
          setTimeLeft(0);
          setUi({
            score: localScore,
            rivalScore,
            combo,
            bestCombo,
            syncs,
            crashes,
            distance: Math.floor(maxWorldOffset * 0.055),
            face: player.face,
            energy,
            seed,
          });
          triggerHaptic(localScore >= rivalScore ? "success" : "error");
        }
      }

      drawScene(now, elapsedPlaying);
      commitUi(now);
      animationId = requestAnimationFrame(frame);
    };

    resize();
    ensureLevel(viewport.width * 3.2);
    player.lane = 0;
    player.y = laneY(0) - PLAYER_SIZE;
    player.previousY = player.y;
    latestCheckpointX = checkpoints[0]?.x || 0;

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    animationId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [matchKey]);

  const formattedTime = `00:${String(Math.max(0, timeLeft)).padStart(2, "0")}`;
  const multiplier = Math.min(5, 1 + Math.floor(ui.combo / 5));
  const faceColor = FACE_COLORS[ui.face];

  return (
    <div
      ref={containerRef}
      className="prism-cube-game relative h-full min-h-[480px] w-full select-none overflow-hidden bg-[#050817] text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[24px] border border-white/[0.09] bg-[#050816]/78 p-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.34)] backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <PlayerAvatar name="You" />
            <div className="min-w-0 pt-[0.1em]">
              <div className="truncate text-[8px] font-black uppercase leading-[1.5] tracking-[0.15em] text-[#72EFFF]">
                Ты
              </div>
              <div className="text-[19px] font-black leading-[1.3] text-white">
                {ui.score}
              </div>
              <div className="text-[7px] font-black uppercase leading-[1.5] tracking-[0.1em] text-white/42">
                Combo X{multiplier}
              </div>
            </div>
          </div>

          <div className="min-w-[88px] rounded-[17px] border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-center">
            <div className="pt-[0.08em] text-[7px] font-black uppercase leading-[1.55] tracking-[0.15em] text-white/36">
              Время
            </div>
            <div className="pt-[0.04em] text-[17px] font-black leading-[1.35] text-white">
              {formattedTime}
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            <div className="min-w-0 pt-[0.1em]">
              <div className="truncate text-[8px] font-black uppercase leading-[1.5] tracking-[0.15em] text-[#FF83D5]">
                Rival
              </div>
              <div className="text-[19px] font-black leading-[1.3] text-white">
                {ui.rivalScore}
              </div>
              <div className="text-[7px] font-black uppercase leading-[1.5] tracking-[0.1em] text-white/42">
                Local bot
              </div>
            </div>
            <PlayerAvatar name="Rival" rival />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-full border border-white/[0.08] bg-black/28 px-3 py-1.5 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/52">
            <span
              className="h-2.5 w-2.5 rounded-[3px] shadow-[0_0_12px_currentColor]"
              style={{ backgroundColor: faceColor, color: faceColor }}
            />
            {FACE_NAMES[ui.face]}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#5BE7FF,#9D7CFF,#FF6FCA)] transition-[width] duration-100"
              style={{ width: `${ui.energy}%` }}
            />
          </div>
          <div className="text-[7px] font-black uppercase tracking-[0.12em] text-white/48">
            {ui.distance} M
          </div>
        </div>
      </div>

      {phase === "countdown" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#02040d]/42 backdrop-blur-[1.5px]">
          <div
            key={countdown}
            className="prism-countdown pt-[0.16em] text-[86px] font-black leading-[1.22] text-white drop-shadow-[0_12px_32px_rgba(91,231,255,0.42)]"
          >
            {countdown}
          </div>
        </div>
      )}

      {phase === "playing" && hintVisible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center px-4">
          <div className="rounded-full border border-white/[0.09] bg-black/38 px-4 py-2 pt-[0.68em] text-center text-[8px] font-black uppercase leading-[1.45] tracking-[0.12em] text-white/68 backdrop-blur-md">
            Тап — прыжок · удержание — выше · тап у сферы — импульс
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#02040d]/78 px-4 backdrop-blur-md">
          <div className="w-full max-w-[350px] overflow-hidden rounded-[30px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(17,23,55,0.98),rgba(6,8,20,0.99))] p-4 shadow-[0_28px_85px_rgba(0,0,0,0.58)]">
            <div
              className={[
                "rounded-[22px] border px-4 py-4 text-center",
                result === "win"
                  ? "border-[#62F2BF]/24 bg-[#62F2BF]/8"
                  : result === "draw"
                    ? "border-[#FFD76A]/24 bg-[#FFD76A]/8"
                    : "border-[#FF6F96]/24 bg-[#FF6F96]/8",
              ].join(" ")}
            >
              <div
                className={[
                  "pt-[0.12em] text-[9px] font-black uppercase leading-[1.5] tracking-[0.16em]",
                  result === "win"
                    ? "text-[#7DF6CB]"
                    : result === "draw"
                      ? "text-[#FFE59B]"
                      : "text-[#FF8AA8]",
                ].join(" ")}
              >
                Prism Cube
              </div>
              <div className="mt-1 pt-[0.05em] text-[28px] font-black uppercase leading-[1.28] text-white">
                {result === "win" ? "Победа" : result === "draw" ? "Ничья" : "Поражение"}
              </div>

              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] border-2 border-[#5BE7FF]/55 bg-[#5BE7FF]/10 text-[12px] font-black text-[#C8FAFF]">
                    YOU
                  </div>
                  <div className="mt-2 pt-[0.08em] text-[23px] font-black leading-[1.35]">
                    {ui.score}
                  </div>
                </div>
                <div className="pt-[0.18em] text-[9px] font-black uppercase leading-[1.5] tracking-[0.16em] text-white/28">
                  VS
                </div>
                <div className="text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] border border-[#FF6FCA]/45 bg-[#FF6FCA]/10 text-[11px] font-black text-[#FFD0EB]">
                    RV
                  </div>
                  <div className="mt-2 pt-[0.08em] text-[23px] font-black leading-[1.35]">
                    {ui.rivalScore}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[15px] border border-white/[0.07] bg-black/18 px-2 py-2">
                  <div className="text-[7px] font-black uppercase leading-[1.5] tracking-[0.1em] text-white/34">
                    Sync
                  </div>
                  <div className="pt-[0.05em] text-[14px] font-black leading-[1.4]">{ui.syncs}</div>
                </div>
                <div className="rounded-[15px] border border-white/[0.07] bg-black/18 px-2 py-2">
                  <div className="text-[7px] font-black uppercase leading-[1.5] tracking-[0.1em] text-white/34">
                    Best
                  </div>
                  <div className="pt-[0.05em] text-[14px] font-black leading-[1.4]">X{Math.min(5, 1 + Math.floor(ui.bestCombo / 5))}</div>
                </div>
                <div className="rounded-[15px] border border-white/[0.07] bg-black/18 px-2 py-2">
                  <div className="text-[7px] font-black uppercase leading-[1.5] tracking-[0.1em] text-white/34">
                    Ошибки
                  </div>
                  <div className="pt-[0.05em] text-[14px] font-black leading-[1.4]">{ui.crashes}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMatchKey((value) => value + 1)}
              className="mt-3 min-h-[56px] w-full rounded-[19px] border border-[#5BE7FF]/22 bg-[linear-gradient(180deg,rgba(91,231,255,0.24),rgba(91,231,255,0.1))] px-4 py-3 pt-[0.9em] text-[10px] font-black uppercase leading-[1.45] tracking-[0.13em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_15px_34px_rgba(0,0,0,0.28)] transition active:scale-[0.985]"
            >
              Новая карта
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-2 min-h-[52px] w-full rounded-[18px] border border-white/[0.09] bg-white/[0.045] px-4 py-3 pt-[0.88em] text-[9px] font-black uppercase leading-[1.45] tracking-[0.13em] text-white/72 transition active:scale-[0.985]"
            >
              К играм
            </button>
          </div>
        </div>
      )}

      <style>{`
        .prism-cube-game,
        .prism-cube-game * {
          line-height: 1.34;
          overflow-wrap: normal;
        }

        .prism-cube-game button,
        .prism-cube-game [class*="uppercase"] {
          overflow: visible;
        }

        @keyframes prismCountdown {
          0% {
            opacity: 0;
            transform: scale(0.55) rotate(-8deg);
          }
          55% {
            opacity: 1;
            transform: scale(1.09) rotate(2deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        .prism-countdown {
          animation: prismCountdown 430ms cubic-bezier(0.2, 0.86, 0.25, 1);
        }
      `}</style>
    </div>
  );
}
