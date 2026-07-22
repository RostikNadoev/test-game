import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import backgroundFar from "../assets/games/rooftop/background_far.webp";
import backgroundMid from "../assets/games/rooftop/background_mid.webp";
import backgroundNear from "../assets/games/rooftop/background_near.webp";
import runnerRun1 from "../assets/games/rooftop/runner_run_1.webp";
import runnerRun2 from "../assets/games/rooftop/runner_run_2.webp";
import runnerJump from "../assets/games/rooftop/runner_jump.webp";
import runnerSlide from "../assets/games/rooftop/runner_slide.webp";

type Phase = "loading" | "countdown" | "playing" | "finished";
type Lane = 0 | 1 | 2;
type SurfaceStyle = "industrial" | "neon" | "billboard";
type ObstacleKind = "vent" | "crate" | "beam" | "laser" | "fan";
type PickupKind = "coin" | "energy";
type ParticleTone = "cyan" | "pink" | "gold" | "white" | "red";
type DecorKind = "sign" | "pipe" | "antenna" | "holo";

type Surface = {
  id: number;
  x: number;
  width: number;
  lane: Exclude<Lane, 0>;
  style: SurfaceStyle;
  visited: boolean;
};

type Obstacle = {
  id: number;
  x: number;
  lane: Lane;
  surfaceId: number | null;
  kind: ObstacleKind;
  width: number;
  passed: boolean;
  hit: boolean;
  phase: number;
};

type Pickup = {
  id: number;
  x: number;
  lane: Lane;
  surfaceId: number | null;
  kind: PickupKind;
  yOffset: number;
  collected: boolean;
  phase: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  tone: ParticleTone;
};

type Decor = {
  id: number;
  x: number;
  lane: Lane;
  kind: DecorKind;
  width: number;
  height: number;
  seed: number;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GameImages = {
  far: HTMLImageElement;
  mid: HTMLImageElement;
  near: HTMLImageElement;
  run1: HTMLImageElement;
  run2: HTMLImageElement;
  jump: HTMLImageElement;
  slide: HTMLImageElement;
};

const MATCH_SECONDS = 45;
const MAX_DPR = 1.65;
const PLAYER_X_RATIO = 0.27;
const BASE_RUN_SPEED = 292;
const SPEED_GROWTH = 1.8;
const AIR_SPEED_FACTOR = 0.91;
const SLIDE_SPEED_FACTOR = 0.965;
const STUMBLE_SPEED_FACTOR = 0.56;
const OVERDRIVE_SPEED_FACTOR = 1.11;
const GRAVITY = 2_100;
const JUMP_VELOCITY = -720;
const HOLD_FORCE = -900;
const HOLD_LIMIT_MS = 220;
const SLIDE_MS = 560;
const INPUT_DELAY_MS = 64;
const SWIPE_THRESHOLD = 28;
const FLOW_MAX = 100;

const PLAYER_CROPS: Record<"run1" | "run2" | "jump" | "slide", CropRect> = {
  run1: { x: 140, y: 85, width: 890, height: 1030 },
  run2: { x: 130, y: 78, width: 905, height: 1040 },
  jump: { x: 180, y: 120, width: 870, height: 930 },
  slide: { x: 95, y: 330, width: 1090, height: 575 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, r);
};

const getInitials = (name: string) =>
  name
    .replace("@", "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TG";

const triggerHaptic = (kind: "light" | "medium" | "success" | "error") => {
  const feedback = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (style: "light" | "medium") => void;
            notificationOccurred?: (type: "success" | "error") => void;
          };
        };
      };
    }
  ).Telegram?.WebApp?.HapticFeedback;

  if (kind === "success" || kind === "error") {
    feedback?.notificationOccurred?.(kind);
  } else {
    feedback?.impactOccurred?.(kind);
  }
};

const makeImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${source}`));
    image.src = source;
  });

export default function RooftopRunGame() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<GameImages | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const scoreRef = useRef(0);
  const rivalScoreRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  const [assetsReady, setAssetsReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS);
  const [score, setScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [coins, setCoins] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [perfects, setPerfects] = useState(0);
  const [hits, setHits] = useState(0);
  const [flow, setFlow] = useState(0);
  const [route, setRoute] = useState("НИЖНИЙ");
  const [speedPercent, setSpeedPercent] = useState(100);
  const [overdrive, setOverdrive] = useState(false);
  const [matchKey, setMatchKey] = useState(0);

  const didWin = score > rivalScore;
  const isDraw = score === rivalScore;
  const formattedTime = useMemo(
    () => `00:${String(Math.max(0, timeLeft)).padStart(2, "0")}`,
    [timeLeft],
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      makeImage(backgroundFar),
      makeImage(backgroundMid),
      makeImage(backgroundNear),
      makeImage(runnerRun1),
      makeImage(runnerRun2),
      makeImage(runnerJump),
      makeImage(runnerSlide),
    ])
      .then(([far, mid, near, run1, run2, jump, slide]) => {
        if (cancelled) return;
        imagesRef.current = { far, mid, near, run1, run2, jump, slide };
        phaseRef.current = "countdown";
        setAssetsReady(true);
        setPhase("countdown");
      })
      .catch(() => {
        if (cancelled) return;
        phaseRef.current = "countdown";
        setAssetsReady(true);
        setPhase("countdown");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    rivalScoreRef.current = rivalScore;
  }, [rivalScore]);

  useEffect(() => {
    if (!assetsReady) return;

    let cancelled = false;
    phaseRef.current = "countdown";
    scoreRef.current = 0;
    rivalScoreRef.current = 0;

    setPhase("countdown");
    setCountdown(3);
    setTimeLeft(MATCH_SECONDS);
    setScore(0);
    setRivalScore(0);
    setDistance(0);
    setCoins(0);
    setCombo(0);
    setBestCombo(0);
    setPerfects(0);
    setHits(0);
    setFlow(0);
    setRoute("НИЖНИЙ");
    setSpeedPercent(100);
    setOverdrive(false);

    const startedAt = performance.now();

    const countdownFrame = () => {
      if (cancelled) return;
      const elapsed = performance.now() - startedAt;
      setCountdown(Math.max(1, 3 - Math.floor(elapsed / 1000)));

      if (elapsed >= 3000) {
        phaseRef.current = "playing";
        setPhase("playing");
        triggerHaptic("medium");
        return;
      }

      requestAnimationFrame(countdownFrame);
    };

    requestAnimationFrame(countdownFrame);

    return () => {
      cancelled = true;
    };
  }, [matchKey, assetsReady]);

  useEffect(() => {
    if (phase !== "playing") return;

    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const next = Math.max(0, Math.ceil(MATCH_SECONDS - elapsed));
      setTimeLeft(next);

      if (elapsed >= MATCH_SECONDS) {
        window.clearInterval(timer);
        phaseRef.current = "finished";
        setPhase("finished");
        triggerHaptic(
          scoreRef.current >= rivalScoreRef.current ? "success" : "error",
        );
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!assetsReady) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const images = imagesRef.current;
    let animationId = 0;
    let previousFrame = performance.now();
    let elapsedPlaying = 0;
    let worldOffset = 0;
    let nextSectionX = 760;
    let sectionIndex = 0;
    let objectId = 1;
    let uiAccumulator = 0;
    let currentSpeed = BASE_RUN_SPEED;
    let targetSpeed = BASE_RUN_SPEED;
    let bonusScore = 0;
    let localDistance = 0;
    let localCoins = 0;
    let localCombo = 0;
    let localBestCombo = 0;
    let localPerfects = 0;
    let localHits = 0;
    let localFlow = 0;
    let overdriveUntil = 0;
    let overdriveUiActive = false;
    let stumbleUntil = 0;
    let landingSlowUntil = 0;
    let invulnerableUntil = 0;
    let shake = 0;
    let flash = 0;
    let cameraLift = 0;
    let jumpStartedAt = 0;
    let pointerHeld = false;
    let inputStart: { x: number; y: number; at: number; id: number } | null = null;
    let jumpTimer = 0;
    let inputConsumed = false;
    let rivalDistance = 0;
    let rivalBonus = 0;
    let rivalComboLocal = 0;

    const viewport = {
      width: 1,
      height: 560,
      dpr: 1,
      baseY: 430,
      midY: 320,
      highY: 220,
    };

    const player = {
      y: viewport.baseY,
      vy: 0,
      grounded: true,
      supportId: null as number | null,
      slidingUntil: 0,
      fastFall: false,
      lastSurfaceId: null as number | null,
    };

    const surfaces: Surface[] = [];
    const obstacles: Obstacle[] = [];
    const pickups: Pickup[] = [];
    const particles: Particle[] = [];
    const decors: Decor[] = [];

    const laneY = (lane: Lane) => {
      if (lane === 2) return viewport.highY;
      if (lane === 1) return viewport.midY;
      return viewport.baseY;
    };

    const surfaceById = (id: number | null) =>
      id === null ? null : surfaces.find((surface) => surface.id === id) ?? null;

    const surfaceTop = (surfaceId: number | null, lane: Lane) => {
      if (surfaceId === null) return laneY(lane);
      const surface = surfaceById(surfaceId);
      return surface ? laneY(surface.lane) : laneY(lane);
    };

    const screenX = (worldX: number) => worldX - worldOffset;

    const randomFor = (seed: number) => {
      const value = Math.sin(seed * 12.9898 + matchKey * 31.17) * 43_758.5453;
      return value - Math.floor(value);
    };

    const addSurface = (
      x: number,
      width: number,
      lane: Exclude<Lane, 0>,
      style: SurfaceStyle,
    ) => {
      const surface: Surface = {
        id: objectId++,
        x,
        width,
        lane,
        style,
        visited: false,
      };
      surfaces.push(surface);
      return surface.id;
    };

    const addObstacle = (
      x: number,
      lane: Lane,
      surfaceId: number | null,
      kind: ObstacleKind,
      width?: number,
    ) => {
      const defaultWidth =
        kind === "beam" ? 118 : kind === "laser" ? 76 : kind === "fan" ? 62 : 54;
      obstacles.push({
        id: objectId++,
        x,
        lane,
        surfaceId,
        kind,
        width: width ?? defaultWidth,
        passed: false,
        hit: false,
        phase: randomFor(objectId) * Math.PI * 2,
      });
    };

    const addPickup = (
      x: number,
      lane: Lane,
      surfaceId: number | null,
      kind: PickupKind,
      yOffset: number,
    ) => {
      pickups.push({
        id: objectId++,
        x,
        lane,
        surfaceId,
        kind,
        yOffset,
        collected: false,
        phase: randomFor(objectId) * Math.PI * 2,
      });
    };

    const addCoinLine = (
      startX: number,
      count: number,
      gap: number,
      lane: Lane,
      surfaceId: number | null,
      yOffset = -54,
    ) => {
      for (let index = 0; index < count; index += 1) {
        addPickup(startX + index * gap, lane, surfaceId, "coin", yOffset);
      }
    };

    const addCoinArc = (
      startX: number,
      count: number,
      gap: number,
      lane: Lane,
      surfaceId: number | null,
      height = 72,
    ) => {
      for (let index = 0; index < count; index += 1) {
        const t = count <= 1 ? 0 : index / (count - 1);
        addPickup(
          startX + index * gap,
          lane,
          surfaceId,
          "coin",
          -52 - Math.sin(t * Math.PI) * height,
        );
      }
    };

    const addDecor = (
      x: number,
      lane: Lane,
      kind: DecorKind,
      width: number,
      height: number,
    ) => {
      decors.push({
        id: objectId++,
        x,
        lane,
        kind,
        width,
        height,
        seed: randomFor(objectId),
      });
    };

    const generateSection = () => {
      const start = nextSectionX;
      const variant = sectionIndex % 7;
      const style: SurfaceStyle =
        sectionIndex % 3 === 0
          ? "neon"
          : sectionIndex % 3 === 1
            ? "industrial"
            : "billboard";

      if (variant === 0) {
        addCoinLine(start + 120, 6, 48, 0, null, -56);
        addObstacle(start + 470, 0, null, "vent");
        addDecor(start + 250, 0, "sign", 92, 62);
        nextSectionX += 760;
      } else if (variant === 1) {
        const mid = addSurface(start + 150, 470, 1, style);
        addCoinLine(start + 210, 8, 46, 1, mid, -50);
        addObstacle(start + 360, 0, null, "crate");
        addPickup(start + 545, 1, mid, "energy", -78);
        addDecor(start + 40, 0, "pipe", 150, 44);
        nextSectionX += 820;
      } else if (variant === 2) {
        const mid = addSurface(start + 90, 420, 1, "industrial");
        const high = addSurface(start + 390, 330, 2, "billboard");
        addCoinArc(start + 145, 6, 48, 1, mid, 54);
        addCoinLine(start + 445, 6, 42, 2, high, -48);
        addObstacle(start + 280, 0, null, "beam");
        addObstacle(start + 555, 1, mid, "vent");
        addPickup(start + 650, 2, high, "energy", -75);
        addDecor(start + 760, 0, "antenna", 40, 120);
        nextSectionX += 900;
      } else if (variant === 3) {
        const midA = addSurface(start + 70, 290, 1, "neon");
        const midB = addSurface(start + 470, 320, 1, "industrial");
        addCoinArc(start + 105, 5, 45, 1, midA, 44);
        addCoinArc(start + 500, 6, 44, 1, midB, 48);
        addObstacle(start + 330, 0, null, "laser");
        addObstacle(start + 620, 1, midB, "beam");
        addPickup(start + 410, 0, null, "energy", -95);
        addDecor(start + 390, 0, "holo", 88, 112);
        nextSectionX += 870;
      } else if (variant === 4) {
        const mid = addSurface(start + 110, 650, 1, "billboard");
        const high = addSurface(start + 320, 360, 2, "neon");
        addCoinLine(start + 155, 12, 46, 1, mid, -50);
        addCoinLine(start + 365, 7, 42, 2, high, -48);
        addObstacle(start + 275, 0, null, "fan");
        addObstacle(start + 525, 1, mid, "crate");
        addPickup(start + 620, 2, high, "energy", -76);
        addDecor(start + 790, 0, "sign", 110, 72);
        nextSectionX += 930;
      } else if (variant === 5) {
        const mid = addSurface(start + 200, 390, 1, "industrial");
        addObstacle(start + 155, 0, null, "beam");
        addObstacle(start + 415, 1, mid, "laser");
        addCoinArc(start + 220, 7, 48, 1, mid, 68);
        addCoinLine(start + 650, 5, 50, 0, null, -58);
        addPickup(start + 540, 1, mid, "energy", -88);
        addDecor(start + 610, 0, "pipe", 170, 46);
        nextSectionX += 860;
      } else {
        const mid = addSurface(start + 80, 540, 1, "neon");
        const high = addSurface(start + 500, 270, 2, "billboard");
        addCoinLine(start + 120, 9, 46, 1, mid, -52);
        addCoinArc(start + 520, 6, 42, 2, high, 42);
        addObstacle(start + 330, 0, null, "crate");
        addObstacle(start + 365, 1, mid, "beam");
        addPickup(start + 710, 2, high, "energy", -74);
        addDecor(start + 790, 0, "holo", 104, 126);
        nextSectionX += 920;
      }

      sectionIndex += 1;
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      viewport.width = Math.max(1, bounds.width);
      viewport.height = Math.max(520, bounds.height);
      viewport.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      viewport.baseY = viewport.height * 0.79;
      viewport.midY = viewport.baseY - clamp(viewport.height * 0.145, 94, 118);
      viewport.highY = viewport.midY - clamp(viewport.height * 0.135, 88, 108);

      canvas.width = Math.round(viewport.width * viewport.dpr);
      canvas.height = Math.round(viewport.height * viewport.dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

      if (player.grounded) {
        player.y = player.supportId
          ? surfaceTop(player.supportId, 1)
          : viewport.baseY;
      }
    };

    const createParticles = (
      x: number,
      y: number,
      amount: number,
      tone: ParticleTone,
      power = 1,
    ) => {
      for (let index = 0; index < amount && particles.length < 110; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (35 + Math.random() * 135) * power;
        const life = 0.28 + Math.random() * 0.48;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 36,
          life,
          maxLife: life,
          size: 1.5 + Math.random() * 3.5,
          tone,
        });
      }
    };

    const addFlow = (amount: number, now: number) => {
      if (now < overdriveUntil) return;
      localFlow = clamp(localFlow + amount, 0, FLOW_MAX);
      if (localFlow >= FLOW_MAX) {
        localFlow = 0;
        overdriveUntil = now + 3_500;
        overdriveUiActive = true;
        setOverdrive(true);
        triggerHaptic("success");
        createParticles(
          viewport.width * PLAYER_X_RATIO,
          player.y - 42,
          30,
          "cyan",
          1.3,
        );
      }
    };

    const addPoints = (points: number, comboGain: number, now: number) => {
      localCombo = Math.min(40, localCombo + comboGain);
      localBestCombo = Math.max(localBestCombo, localCombo);
      const multiplier = Math.min(5, 1 + Math.floor(localCombo / 7));
      bonusScore += Math.round(points * multiplier);
      addFlow(Math.max(1, Math.round(points * 0.28)), now);
    };

    const obstacleRect = (obstacle: Obstacle) => {
      const x = screenX(obstacle.x);
      const top = surfaceTop(obstacle.surfaceId, obstacle.lane);

      if (obstacle.kind === "beam") {
        return { x, y: top - 72, width: obstacle.width, height: 28 };
      }
      if (obstacle.kind === "laser") {
        return { x, y: top - 38, width: obstacle.width, height: 17 };
      }
      if (obstacle.kind === "fan") {
        return { x, y: top - 58, width: obstacle.width, height: 58 };
      }
      if (obstacle.kind === "crate") {
        return { x, y: top - 55, width: obstacle.width, height: 55 };
      }
      return { x, y: top - 48, width: obstacle.width, height: 48 };
    };

    const playerRect = (now: number) => {
      const sliding = now < player.slidingUntil;
      const width = sliding ? 78 : 48;
      const height = sliding ? 34 : 76;
      return {
        x: viewport.width * PLAYER_X_RATIO - width / 2,
        y: player.y - height,
        width,
        height,
      };
    };

    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    const jump = (now: number) => {
      if (phaseRef.current !== "playing" || !player.grounded) return;
      player.grounded = false;
      player.supportId = null;
      player.vy = JUMP_VELOCITY;
      player.fastFall = false;
      jumpStartedAt = now;
      pointerHeld = true;
      triggerHaptic("light");
      createParticles(
        viewport.width * PLAYER_X_RATIO - 12,
        player.y - 2,
        7,
        "white",
        0.65,
      );
    };

    const slide = (now: number) => {
      if (phaseRef.current !== "playing") return;
      if (!player.grounded) {
        player.fastFall = true;
        player.vy = Math.max(player.vy, 360);
        return;
      }
      player.slidingUntil = now + SLIDE_MS;
      triggerHaptic("light");
    };

    const beginInput = (event: PointerEvent) => {
      event.preventDefault();
      inputStart = {
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        id: event.pointerId,
      };
      inputConsumed = false;
      pointerHeld = true;
      canvas.setPointerCapture(event.pointerId);
      jumpTimer = window.setTimeout(() => {
        if (!inputConsumed && inputStart) jump(performance.now());
      }, INPUT_DELAY_MS);
    };

    const moveInput = (event: PointerEvent) => {
      if (!inputStart || inputConsumed) return;
      const dy = event.clientY - inputStart.y;
      if (dy > SWIPE_THRESHOLD) {
        inputConsumed = true;
        window.clearTimeout(jumpTimer);
        slide(performance.now());
      }
    };

    const endInput = (event: PointerEvent) => {
      event.preventDefault();
      pointerHeld = false;
      window.clearTimeout(jumpTimer);
      if (inputStart && !inputConsumed && player.grounded) {
        jump(performance.now());
      }
      inputStart = null;
      inputConsumed = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space" || event.code === "ArrowUp") {
        pointerHeld = true;
        jump(performance.now());
      }
      if (event.code === "ArrowDown") slide(performance.now());
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        pointerHeld = false;
      }
    };

    const findLandingTop = (previousFoot: number, nextFoot: number) => {
      const playerWorldX = worldOffset + viewport.width * PLAYER_X_RATIO;
      let landingTop = viewport.baseY;
      let landingId: number | null = null;

      for (const surface of surfaces) {
        if (
          playerWorldX < surface.x + 8 ||
          playerWorldX > surface.x + surface.width - 8
        ) {
          continue;
        }
        const top = laneY(surface.lane);
        if (previousFoot <= top && nextFoot >= top && top < landingTop) {
          landingTop = top;
          landingId = surface.id;
        }
      }

      return { top: landingTop, id: landingId };
    };

    const supportStillExists = () => {
      if (player.supportId === null) return true;
      const support = surfaceById(player.supportId);
      if (!support) return false;
      const playerWorldX = worldOffset + viewport.width * PLAYER_X_RATIO;
      return (
        playerWorldX >= support.x + 5 &&
        playerWorldX <= support.x + support.width - 5
      );
    };

    const tryAutoMantle = () => {
      if (player.grounded || player.vy < 0) return false;
      const playerWorldX = worldOffset + viewport.width * PLAYER_X_RATIO;
      for (const surface of surfaces) {
        const edgeDistance = surface.x - playerWorldX;
        const top = laneY(surface.lane);
        if (
          edgeDistance >= -8 &&
          edgeDistance <= 16 &&
          player.y >= top - 18 &&
          player.y <= top + 30
        ) {
          player.y = top;
          player.vy = 0;
          player.grounded = true;
          player.supportId = surface.id;
          landingSlowUntil = performance.now() + 90;
          createParticles(
            viewport.width * PLAYER_X_RATIO + 18,
            top,
            8,
            "cyan",
            0.7,
          );
          return true;
        }
      }
      return false;
    };

    const crash = (now: number, x: number, y: number) => {
      if (now < invulnerableUntil) return;
      invulnerableUntil = now + 900;
      stumbleUntil = now + 720;
      localHits += 1;
      localCombo = 0;
      localFlow = Math.max(0, localFlow - 28);
      bonusScore = Math.max(0, bonusScore - 35);
      shake = 10;
      flash = 1;
      triggerHaptic("error");
      createParticles(x, y, 20, "red", 1.1);
    };

    const updateRival = (dt: number, now: number) => {
      const wave = Math.sin(elapsedPlaying * 1.37 + 1.4);
      const jumpPenalty = wave > 0.36 ? 0.93 : 1;
      const stumblePenalty = Math.sin(elapsedPlaying * 0.53 + 4.2) < -0.91 ? 0.78 : 1;
      const rivalSpeed =
        (BASE_RUN_SPEED + elapsedPlaying * 1.65) * jumpPenalty * stumblePenalty;
      rivalDistance += rivalSpeed * dt * 0.048;

      const beat = Math.floor(elapsedPlaying * 1.6);
      const priorBeat = Math.floor((elapsedPlaying - dt) * 1.6);
      if (beat !== priorBeat) {
        const success = Math.sin(beat * 2.11 + 0.3) > -0.42;
        if (success) {
          rivalComboLocal = Math.min(35, rivalComboLocal + 1);
          const mult = Math.min(5, 1 + Math.floor(rivalComboLocal / 7));
          rivalBonus += Math.round((6 + Math.abs(Math.sin(beat)) * 9) * mult);
        } else {
          rivalComboLocal = 0;
          rivalBonus = Math.max(0, rivalBonus - 24);
        }
      }

      if (now < overdriveUntil && Math.sin(elapsedPlaying * 2.2) > 0.65) {
        rivalBonus += dt * 4;
      }
    };

    const update = (dt: number, now: number) => {
      if (phaseRef.current !== "playing") return;

      elapsedPlaying += dt;
      while (nextSectionX < worldOffset + viewport.width + 1_600) {
        generateSection();
      }

      const airborne = !player.grounded;
      const sliding = now < player.slidingUntil;
      let speedFactor = 1;
      if (airborne) speedFactor *= AIR_SPEED_FACTOR;
      if (sliding) speedFactor *= SLIDE_SPEED_FACTOR;
      if (now < landingSlowUntil) speedFactor *= 0.96;
      if (now < stumbleUntil) speedFactor *= STUMBLE_SPEED_FACTOR;
      if (now < overdriveUntil) speedFactor *= OVERDRIVE_SPEED_FACTOR;

      targetSpeed = (BASE_RUN_SPEED + elapsedPlaying * SPEED_GROWTH) * speedFactor;
      currentSpeed = lerp(currentSpeed, targetSpeed, 1 - Math.pow(0.0007, dt));
      worldOffset += currentSpeed * dt;
      localDistance += currentSpeed * dt * 0.048;

      if (pointerHeld && !player.grounded && now - jumpStartedAt < HOLD_LIMIT_MS && player.vy < 0) {
        player.vy += HOLD_FORCE * dt;
      }

      if (player.grounded && !supportStillExists()) {
        player.grounded = false;
        player.supportId = null;
        player.vy = 60;
      }

      if (!player.grounded) {
        const previousFoot = player.y;
        player.vy += GRAVITY * dt * (player.fastFall ? 1.35 : 1);
        const nextFoot = player.y + player.vy * dt;

        if (!tryAutoMantle()) {
          const landing = findLandingTop(previousFoot, nextFoot);
          if (player.vy >= 0 && previousFoot <= landing.top && nextFoot >= landing.top) {
            const landingSpeed = player.vy;
            const landedOnNewSurface = landing.id !== null && landing.id !== player.lastSurfaceId;
            player.y = landing.top;
            player.vy = 0;
            player.grounded = true;
            player.supportId = landing.id;
            player.fastFall = false;
            player.lastSurfaceId = landing.id;
            landingSlowUntil = now + 85;

            if (landedOnNewSurface) {
              const perfect = landingSpeed > 380 && landingSpeed < 770;
              addPoints(perfect ? 15 : 8, perfect ? 2 : 1, now);
              if (perfect) localPerfects += 1;
              createParticles(
                viewport.width * PLAYER_X_RATIO,
                player.y,
                perfect ? 14 : 8,
                perfect ? "cyan" : "white",
                perfect ? 1 : 0.65,
              );
              if (perfect) triggerHaptic("medium");
            }
          } else {
            player.y = nextFoot;
          }
        }
      }

      const rect = playerRect(now);

      for (const obstacle of obstacles) {
        const obstacleBox = obstacleRect(obstacle);
        if (obstacleBox.x + obstacleBox.width < -100) continue;

        if (!obstacle.passed && obstacleBox.x + obstacleBox.width < rect.x) {
          obstacle.passed = true;
          if (!obstacle.hit) {
            addPoints(obstacle.kind === "beam" ? 14 : 10, 1, now);
          }
        }

        if (
          !obstacle.hit &&
          now >= invulnerableUntil &&
          intersects(rect, obstacleBox)
        ) {
          const safeSlide = obstacle.kind === "beam" && sliding;
          if (!safeSlide) {
            obstacle.hit = true;
            crash(
              now,
              obstacleBox.x + obstacleBox.width / 2,
              obstacleBox.y + obstacleBox.height / 2,
            );
          }
        }
      }

      for (const pickup of pickups) {
        if (pickup.collected) continue;
        const x = screenX(pickup.x);
        const top = surfaceTop(pickup.surfaceId, pickup.lane);
        const y = top + pickup.yOffset;
        const magnet = now < overdriveUntil ? 82 : 28;
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const dx = centerX - x;
        const dy = centerY - y;

        if (Math.hypot(dx, dy) < magnet) {
          pickup.collected = true;
          if (pickup.kind === "coin") {
            localCoins += 1;
            addPoints(7, 1, now);
            createParticles(x, y, 8, "gold", 0.75);
            triggerHaptic("light");
          } else {
            addPoints(24, 2, now);
            addFlow(30, now);
            createParticles(x, y, 18, "pink", 1);
            triggerHaptic("success");
          }
        }
      }

      for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 280 * dt;
        particle.life -= dt;
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        if (particles[index].life <= 0) particles.splice(index, 1);
      }

      for (let index = surfaces.length - 1; index >= 0; index -= 1) {
        if (screenX(surfaces[index].x + surfaces[index].width) < -300) {
          surfaces.splice(index, 1);
        }
      }
      for (let index = obstacles.length - 1; index >= 0; index -= 1) {
        if (screenX(obstacles[index].x + obstacles[index].width) < -320) {
          obstacles.splice(index, 1);
        }
      }
      for (let index = pickups.length - 1; index >= 0; index -= 1) {
        if (screenX(pickups[index].x) < -320) pickups.splice(index, 1);
      }
      for (let index = decors.length - 1; index >= 0; index -= 1) {
        if (screenX(decors[index].x + decors[index].width) < -400) {
          decors.splice(index, 1);
        }
      }

      if (now >= overdriveUntil && overdriveUiActive) {
        overdriveUiActive = false;
        setOverdrive(false);
      }
      shake *= Math.pow(0.02, dt);
      flash *= Math.pow(0.012, dt);
      const liftTarget = clamp((viewport.baseY - player.y) * 0.19, 0, 34);
      cameraLift = lerp(cameraLift, liftTarget, 1 - Math.pow(0.002, dt));

      updateRival(dt, now);

      uiAccumulator += dt;
      if (uiAccumulator >= 0.085) {
        uiAccumulator = 0;
        const totalScore = Math.max(0, Math.floor(localDistance) + Math.floor(bonusScore));
        const rivalTotal = Math.max(0, Math.floor(rivalDistance + rivalBonus));
        scoreRef.current = totalScore;
        rivalScoreRef.current = rivalTotal;
        setScore(totalScore);
        setRivalScore(rivalTotal);
        setDistance(Math.floor(localDistance));
        setCoins(localCoins);
        setCombo(localCombo);
        setBestCombo(localBestCombo);
        setPerfects(localPerfects);
        setHits(localHits);
        setFlow(Math.round(localFlow));
        setSpeedPercent(Math.round((currentSpeed / (BASE_RUN_SPEED + elapsedPlaying * SPEED_GROWTH)) * 100));
        setRoute(
          player.y <= viewport.highY + 18
            ? "ВЕРХНИЙ"
            : player.y <= viewport.midY + 22
              ? "СРЕДНИЙ"
              : "НИЖНИЙ",
        );
      }
    };

    const drawCover = (
      image: HTMLImageElement,
      alpha: number,
      pan: number,
      zoom: number,
    ) => {
      if (!image.complete || image.naturalWidth === 0) return;
      const scale = Math.max(viewport.width / image.naturalWidth, viewport.height / image.naturalHeight) * zoom;
      const sourceWidth = viewport.width / scale;
      const sourceHeight = viewport.height / scale;
      const maxSourceX = Math.max(0, image.naturalWidth - sourceWidth);
      const sourceX = clamp(maxSourceX * 0.5 + pan, 0, maxSourceX);
      const sourceY = clamp((image.naturalHeight - sourceHeight) * 0.43, 0, Math.max(0, image.naturalHeight - sourceHeight));
      context.save();
      context.globalAlpha = alpha;
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        viewport.width,
        viewport.height,
      );
      context.restore();
    };

    const drawBackground = (now: number) => {
      const fallback = context.createLinearGradient(0, 0, 0, viewport.height);
      fallback.addColorStop(0, "#070b2b");
      fallback.addColorStop(0.55, "#1d1452");
      fallback.addColorStop(1, "#070815");
      context.fillStyle = fallback;
      context.fillRect(0, 0, viewport.width, viewport.height);

      if (images) {
        const backgrounds = [images.far, images.mid, images.near];
        const zoneLength = 4_800;
        const zoneFloat = worldOffset / zoneLength;
        const zone = Math.floor(zoneFloat) % backgrounds.length;
        const nextZone = (zone + 1) % backgrounds.length;
        const blend = smoothstep(0.72, 1, zoneFloat - Math.floor(zoneFloat));
        const pan = Math.sin(now * 0.00008) * 45 + (worldOffset * 0.012) % 70;
        drawCover(backgrounds[zone], 1 - blend * 0.82, pan, 1.035);
        if (blend > 0.001) {
          drawCover(backgrounds[nextZone], blend * 0.92, -pan * 0.6, 1.05);
        }
      }

      const atmosphere = context.createLinearGradient(0, 0, 0, viewport.height);
      atmosphere.addColorStop(0, "rgba(7,8,35,0.08)");
      atmosphere.addColorStop(0.48, "rgba(20,10,54,0.04)");
      atmosphere.addColorStop(0.74, "rgba(5,7,18,0.30)");
      atmosphere.addColorStop(1, "rgba(3,5,12,0.88)");
      context.fillStyle = atmosphere;
      context.fillRect(0, 0, viewport.width, viewport.height);

      context.save();
      context.globalCompositeOperation = "screen";
      for (let index = 0; index < 5; index += 1) {
        const x = ((index * 131 + worldOffset * (0.025 + index * 0.004)) % (viewport.width + 180)) - 90;
        const y = viewport.height * (0.24 + index * 0.095);
        const glow = context.createRadialGradient(x, y, 0, x, y, 110);
        glow.addColorStop(0, index % 2 === 0 ? "rgba(70,224,255,0.08)" : "rgba(255,65,190,0.07)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = glow;
        context.fillRect(x - 110, y - 110, 220, 220);
      }
      context.restore();
    };

    const drawGround = () => {
      const top = viewport.baseY;
      const facade = context.createLinearGradient(0, top, 0, viewport.height);
      facade.addColorStop(0, "#121526");
      facade.addColorStop(0.35, "#0b0f1d");
      facade.addColorStop(1, "#05070e");
      context.fillStyle = facade;
      context.fillRect(0, top, viewport.width, viewport.height - top);

      const tile = 118;
      const offset = -(worldOffset % tile);
      for (let x = offset - tile; x < viewport.width + tile; x += tile) {
        context.fillStyle = "rgba(255,255,255,0.025)";
        context.fillRect(x + 4, top + 28, tile - 8, viewport.height - top - 34);
        context.strokeStyle = "rgba(125,154,205,0.11)";
        context.lineWidth = 1;
        context.strokeRect(x + 4.5, top + 28.5, tile - 9, viewport.height - top - 35);

        const windowSeed = Math.floor((worldOffset + x) / tile);
        for (let row = 0; row < 2; row += 1) {
          const lit = Math.sin(windowSeed * 3.1 + row * 8.2) > -0.2;
          context.fillStyle = lit
            ? row % 2 === 0
              ? "rgba(80,225,255,0.28)"
              : "rgba(255,75,190,0.24)"
            : "rgba(25,32,52,0.55)";
          roundedRect(context, x + 22 + row * 42, top + 54, 24, 34, 4);
          context.fill();
        }
      }

      const slab = context.createLinearGradient(0, top - 14, 0, top + 24);
      slab.addColorStop(0, "#3b4056");
      slab.addColorStop(0.25, "#202536");
      slab.addColorStop(1, "#101421");
      context.fillStyle = slab;
      context.fillRect(0, top - 15, viewport.width, 43);

      context.fillStyle = "rgba(255,255,255,0.12)";
      context.fillRect(0, top - 15, viewport.width, 2);

      const accent = Math.floor(worldOffset / 1_200) % 2 === 0 ? "#54e7ff" : "#ff56c7";
      context.shadowColor = accent;
      context.shadowBlur = 12;
      context.fillStyle = accent;
      context.fillRect(0, top - 4, viewport.width, 3);
      context.shadowBlur = 0;

      const panelWidth = 84;
      const panelOffset = -(worldOffset % panelWidth);
      context.strokeStyle = "rgba(255,255,255,0.075)";
      for (let x = panelOffset; x < viewport.width + panelWidth; x += panelWidth) {
        context.beginPath();
        context.moveTo(x, top - 14);
        context.lineTo(x + 18, top + 25);
        context.stroke();
      }
    };

    const drawDecor = (decor: Decor, now: number) => {
      const x = screenX(decor.x);
      const base = laneY(decor.lane);
      if (x + decor.width < -80 || x > viewport.width + 80) return;

      context.save();
      if (decor.kind === "sign") {
        context.fillStyle = "rgba(7,10,22,0.88)";
        roundedRect(context, x, base - decor.height - 18, decor.width, decor.height, 10);
        context.fill();
        context.strokeStyle = decor.seed > 0.5 ? "#56e9ff" : "#ff58c9";
        context.lineWidth = 2;
        context.stroke();
        context.shadowColor = context.strokeStyle;
        context.shadowBlur = 12;
        context.fillStyle = context.strokeStyle;
        context.globalAlpha = 0.6 + Math.sin(now * 0.004 + decor.seed * 10) * 0.18;
        context.fillRect(x + 12, base - decor.height + 2, decor.width - 24, 5);
      } else if (decor.kind === "pipe") {
        context.strokeStyle = "#303649";
        context.lineWidth = 16;
        context.beginPath();
        context.moveTo(x, base - 22);
        context.lineTo(x + decor.width, base - 22);
        context.stroke();
        context.strokeStyle = "rgba(118,238,255,0.42)";
        context.lineWidth = 2;
        context.stroke();
      } else if (decor.kind === "antenna") {
        context.strokeStyle = "#31364a";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(x + decor.width / 2, base);
        context.lineTo(x + decor.width / 2, base - decor.height);
        context.stroke();
        context.fillStyle = "#ff4ebc";
        context.shadowColor = "#ff4ebc";
        context.shadowBlur = 12;
        context.beginPath();
        context.arc(x + decor.width / 2, base - decor.height, 4, 0, Math.PI * 2);
        context.fill();
      } else {
        const alpha = 0.25 + Math.sin(now * 0.003 + decor.seed * 10) * 0.08;
        context.fillStyle = `rgba(104,229,255,${alpha})`;
        roundedRect(context, x, base - decor.height, decor.width, decor.height, 12);
        context.fill();
        context.strokeStyle = "rgba(255,95,205,0.65)";
        context.lineWidth = 2;
        context.stroke();
      }
      context.restore();
    };

    const drawSurface = (surface: Surface) => {
      const x = screenX(surface.x);
      const y = laneY(surface.lane);
      if (x + surface.width < -100 || x > viewport.width + 100) return;

      const height = surface.lane === 2 ? 30 : 36;
      context.save();

      context.fillStyle = "rgba(2,4,10,0.40)";
      context.fillRect(x + 12, y + height, surface.width - 24, viewport.baseY - y - height);

      const underside = context.createLinearGradient(0, y, 0, y + height + 50);
      underside.addColorStop(0, "#272b40");
      underside.addColorStop(0.4, "#161a2a");
      underside.addColorStop(1, "#0a0d18");
      context.fillStyle = underside;
      roundedRect(context, x, y - 12, surface.width, height + 22, 8);
      context.fill();

      const topGradient = context.createLinearGradient(0, y - 12, 0, y + 8);
      if (surface.style === "neon") {
        topGradient.addColorStop(0, "#5f4b83");
        topGradient.addColorStop(1, "#25243c");
      } else if (surface.style === "billboard") {
        topGradient.addColorStop(0, "#3c5672");
        topGradient.addColorStop(1, "#1b293c");
      } else {
        topGradient.addColorStop(0, "#51576a");
        topGradient.addColorStop(1, "#222737");
      }
      context.fillStyle = topGradient;
      roundedRect(context, x, y - 14, surface.width, 20, 7);
      context.fill();

      const accent = surface.style === "neon" ? "#ff58ca" : surface.style === "billboard" ? "#5deeff" : "#7e8fae";
      context.strokeStyle = "rgba(255,255,255,0.22)";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y - 13.5, surface.width - 1, 19);
      context.shadowColor = accent;
      context.shadowBlur = 10;
      context.fillStyle = accent;
      context.fillRect(x + 10, y + 11, Math.max(0, surface.width - 20), 3);
      context.shadowBlur = 0;

      for (let supportX = x + 36; supportX < x + surface.width - 20; supportX += 104) {
        context.fillStyle = "rgba(31,37,55,0.92)";
        context.fillRect(supportX, y + 22, 10, Math.max(16, viewport.baseY - y - 22));
        context.fillStyle = "rgba(100,225,255,0.16)";
        context.fillRect(supportX + 2, y + 26, 2, Math.max(10, viewport.baseY - y - 30));
      }

      context.restore();
    };

    const drawObstacle = (obstacle: Obstacle, now: number) => {
      const box = obstacleRect(obstacle);
      if (box.x + box.width < -80 || box.x > viewport.width + 80) return;
      const top = surfaceTop(obstacle.surfaceId, obstacle.lane);

      context.save();
      if (obstacle.hit) context.globalAlpha = 0.42;

      if (obstacle.kind === "vent") {
        const gradient = context.createLinearGradient(0, box.y, 0, top);
        gradient.addColorStop(0, "#171c2b");
        gradient.addColorStop(1, "#50586b");
        context.fillStyle = gradient;
        roundedRect(context, box.x, box.y, box.width, box.height, 8);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.18)";
        context.stroke();
        context.fillStyle = "#0b101b";
        roundedRect(context, box.x + 8, box.y + 10, box.width - 16, box.height - 19, 5);
        context.fill();
        context.strokeStyle = "rgba(84,233,255,0.55)";
        context.lineWidth = 2;
        for (let row = 0; row < 4; row += 1) {
          context.beginPath();
          context.moveTo(box.x + 13, box.y + 16 + row * 7);
          context.lineTo(box.x + box.width - 13, box.y + 16 + row * 7);
          context.stroke();
        }
      } else if (obstacle.kind === "crate") {
        const gradient = context.createLinearGradient(0, box.y, box.width, top);
        gradient.addColorStop(0, "#33394d");
        gradient.addColorStop(1, "#171c2a");
        context.fillStyle = gradient;
        roundedRect(context, box.x, box.y, box.width, box.height, 7);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.17)";
        context.stroke();
        context.strokeStyle = "#ffb23f";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(box.x + 8, box.y + box.height - 10);
        context.lineTo(box.x + box.width - 8, box.y + 10);
        context.stroke();
      } else if (obstacle.kind === "beam") {
        context.fillStyle = "#252b3c";
        roundedRect(context, box.x, box.y, box.width, box.height, 8);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.22)";
        context.stroke();
        context.fillStyle = "#ffba35";
        for (let stripe = -20; stripe < box.width + 20; stripe += 30) {
          context.save();
          context.beginPath();
          context.rect(box.x, box.y, box.width, box.height);
          context.clip();
          context.translate(box.x + stripe, box.y);
          context.rotate(-0.55);
          context.fillRect(0, -18, 12, 70);
          context.restore();
        }
        context.fillStyle = "#33394d";
        context.fillRect(box.x + 8, box.y + box.height, 8, top - (box.y + box.height));
        context.fillRect(box.x + box.width - 16, box.y + box.height, 8, top - (box.y + box.height));
      } else if (obstacle.kind === "laser") {
        context.fillStyle = "#242a3b";
        roundedRect(context, box.x - 8, top - 55, 14, 55, 5);
        context.fill();
        roundedRect(context, box.x + box.width - 6, top - 55, 14, 55, 5);
        context.fill();
        const pulse = 0.55 + Math.sin(now * 0.012 + obstacle.phase) * 0.28;
        context.shadowColor = "#ff4abf";
        context.shadowBlur = 16;
        context.fillStyle = `rgba(255,70,190,${pulse})`;
        context.fillRect(box.x, box.y, box.width, box.height);
        context.shadowBlur = 0;
      } else {
        const radius = box.width / 2;
        context.fillStyle = "#252b3d";
        context.beginPath();
        context.arc(box.x + radius, box.y + radius, radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.20)";
        context.lineWidth = 2;
        context.stroke();
        context.save();
        context.translate(box.x + radius, box.y + radius);
        context.rotate(now * 0.004 + obstacle.phase);
        context.fillStyle = "#59eaff";
        for (let blade = 0; blade < 4; blade += 1) {
          context.rotate(Math.PI / 2);
          roundedRect(context, 2, -4, radius - 8, 8, 4);
          context.fill();
        }
        context.restore();
      }

      context.restore();
    };

    const drawPickup = (pickup: Pickup, now: number) => {
      if (pickup.collected) return;
      const x = screenX(pickup.x);
      const top = surfaceTop(pickup.surfaceId, pickup.lane);
      const y = top + pickup.yOffset + Math.sin(now * 0.004 + pickup.phase) * 4;
      if (x < -50 || x > viewport.width + 50) return;

      context.save();
      if (pickup.kind === "coin") {
        context.shadowColor = "#ffd65b";
        context.shadowBlur = 15;
        const gradient = context.createRadialGradient(x - 4, y - 5, 2, x, y, 15);
        gradient.addColorStop(0, "#fff4a8");
        gradient.addColorStop(0.45, "#ffd653");
        gradient.addColorStop(1, "#ee8b1d");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, 12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.65)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "rgba(108,55,0,0.48)";
        context.beginPath();
        context.moveTo(x, y - 6);
        context.lineTo(x + 5, y + 5);
        context.lineTo(x - 5, y + 5);
        context.closePath();
        context.fill();
      } else {
        context.translate(x, y);
        context.rotate(now * 0.002 + pickup.phase);
        context.shadowColor = "#ff57c8";
        context.shadowBlur = 20;
        const gradient = context.createLinearGradient(-12, -15, 12, 15);
        gradient.addColorStop(0, "#74efff");
        gradient.addColorStop(0.5, "#a26dff");
        gradient.addColorStop(1, "#ff56c6");
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(0, -16);
        context.lineTo(12, 0);
        context.lineTo(0, 16);
        context.lineTo(-12, 0);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.75)";
        context.lineWidth = 1.5;
        context.stroke();
      }
      context.restore();
    };

    const drawParticles = () => {
      const tones: Record<ParticleTone, string> = {
        cyan: "#72efff",
        pink: "#ff68cc",
        gold: "#ffd45e",
        white: "#f5f8ff",
        red: "#ff5d7e",
      };
      for (const particle of particles) {
        context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.fillStyle = tones[particle.tone];
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const drawPlayer = (now: number) => {
      const rect = playerRect(now);
      const sliding = now < player.slidingUntil;
      const airborne = !player.grounded;
      const runKey = Math.floor(now / 105) % 2 === 0 ? "run1" : "run2";
      const key = sliding ? "slide" : airborne ? "jump" : runKey;
      const image = images?.[key];
      const crop = PLAYER_CROPS[key];
      const blink = now < invulnerableUntil && Math.floor(now / 70) % 2 === 0;

      context.save();
      context.globalAlpha = player.grounded ? 0.36 : 0.18;
      context.fillStyle = "#02040a";
      context.beginPath();
      context.ellipse(
        viewport.width * PLAYER_X_RATIO,
        player.y + 3,
        sliding ? 40 : 26,
        7,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

      if (blink) return;

      context.save();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const tilt = airborne ? clamp(player.vy / 2_600, -0.12, 0.14) : 0;
      const bob = !airborne && !sliding ? Math.sin(now * 0.019) * 1.3 : 0;
      const stretchY = airborne ? 1 + clamp(Math.abs(player.vy) / 5_000, 0, 0.055) : 1;
      const squashX = airborne ? 1 - (stretchY - 1) * 0.45 : 1;

      context.translate(centerX, centerY + bob);
      context.rotate(tilt);
      context.scale(squashX, stretchY);

      if (now < overdriveUntil) {
        context.shadowColor = "#63edff";
        context.shadowBlur = 22;
        context.globalAlpha = 0.24;
        context.fillStyle = "#65eaff";
        roundedRect(context, -rect.width * 0.66, -rect.height * 0.45, rect.width * 0.7, rect.height * 0.85, 18);
        context.fill();
        context.globalAlpha = 1;
      }

      if (image?.complete && image.naturalWidth > 0) {
        const drawWidth = sliding ? 102 : 88;
        const drawHeight = sliding ? 55 : 112;
        context.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          -drawWidth / 2,
          -drawHeight / 2 - (sliding ? 2 : 9),
          drawWidth,
          drawHeight,
        );
      } else {
        context.fillStyle = "#7a5cff";
        roundedRect(context, -rect.width / 2, -rect.height / 2, rect.width, rect.height, 12);
        context.fill();
      }
      context.restore();
    };

    const drawRainAndSpeed = (now: number) => {
      context.save();
      context.strokeStyle = "rgba(130,198,255,0.11)";
      context.lineWidth = 1;
      for (let index = 0; index < 34; index += 1) {
        const x = ((index * 79 + now * 0.12) % (viewport.width + 80)) - 40;
        const y = ((index * 137 + now * 0.31) % (viewport.height + 120)) - 60;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 7, y + 19);
        context.stroke();
      }

      if (currentSpeed > BASE_RUN_SPEED * 1.05) {
        const strength = clamp((currentSpeed - BASE_RUN_SPEED) / 90, 0, 1);
        context.strokeStyle = `rgba(125,231,255,${0.08 + strength * 0.12})`;
        for (let index = 0; index < 10; index += 1) {
          const y = viewport.height * (0.2 + ((index * 0.083 + now * 0.00015) % 0.62));
          const length = 35 + strength * 70;
          context.beginPath();
          context.moveTo(viewport.width - ((index * 91 + now * 0.18) % viewport.width), y);
          context.lineTo(viewport.width - ((index * 91 + now * 0.18) % viewport.width) - length, y);
          context.stroke();
        }
      }
      context.restore();
    };

    const drawScene = (now: number) => {
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);
      drawBackground(now);
      drawRainAndSpeed(now);

      const shakeX = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
      const shakeY = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
      context.save();
      context.translate(shakeX, shakeY + cameraLift);

      for (const decor of decors) drawDecor(decor, now);
      drawGround();
      for (const surface of surfaces) drawSurface(surface);
      for (const pickup of pickups) drawPickup(pickup, now);
      for (const obstacle of obstacles) drawObstacle(obstacle, now);
      drawParticles();
      drawPlayer(now);

      if (flash > 0.01) {
        context.fillStyle = `rgba(255,55,105,${flash * 0.13})`;
        context.fillRect(0, -cameraLift, viewport.width, viewport.height);
      }
      context.restore();

      const vignette = context.createRadialGradient(
        viewport.width / 2,
        viewport.height * 0.48,
        viewport.width * 0.18,
        viewport.width / 2,
        viewport.height * 0.5,
        viewport.height * 0.72,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(1,2,9,0.42)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, viewport.width, viewport.height);
    };

    const frame = (now: number) => {
      const dt = Math.min(32, Math.max(0, now - previousFrame)) / 1000;
      previousFrame = now;
      update(dt, now);
      drawScene(now);
      animationId = requestAnimationFrame(frame);
    };

    resize();
    while (nextSectionX < viewport.width + 2_200) generateSection();

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", beginInput);
    canvas.addEventListener("pointermove", moveInput);
    canvas.addEventListener("pointerup", endInput);
    canvas.addEventListener("pointercancel", endInput);
    animationId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationId);
      window.clearTimeout(jumpTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("pointerdown", beginInput);
      canvas.removeEventListener("pointermove", moveInput);
      canvas.removeEventListener("pointerup", endInput);
      canvas.removeEventListener("pointercancel", endInput);
    };
  }, [matchKey, assetsReady]);

  const progress = clamp((MATCH_SECONDS - timeLeft) / MATCH_SECONDS, 0, 1);

  return (
    <div
      ref={containerRef}
      className="rooftop-top relative h-full min-h-[520px] w-full select-none overflow-hidden bg-[#050711] text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div className="overflow-hidden rounded-[24px] border border-white/[0.10] bg-[#050815]/72 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#64E9FF]/45 bg-[#64E9FF]/12 text-[10px] font-black text-[#C4F9FF]">
                {getInitials("You")}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[8px] font-black uppercase tracking-[0.13em] text-[#72E9FF]">
                  Ты
                </div>
                <div className="text-[20px] font-black leading-tight text-white">
                  {score}
                </div>
              </div>
            </div>

            <div className="min-w-[82px] text-center">
              <div className="text-[7px] font-black uppercase tracking-[0.15em] text-white/42">
                Время
              </div>
              <div className="mt-0.5 text-[17px] font-black leading-tight text-white">
                {formattedTime}
              </div>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 text-right">
              <div className="min-w-0">
                <div className="truncate text-[8px] font-black uppercase tracking-[0.13em] text-[#FF75CB]">
                  Rival
                </div>
                <div className="text-[20px] font-black leading-tight text-white">
                  {rivalScore}
                </div>
              </div>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#FF68C5]/45 bg-[#FF68C5]/12 text-[10px] font-black text-[#FFD0ED]">
                RV
              </div>
            </div>
          </div>

          <div className="h-[3px] bg-white/[0.06]">
            <div
              className="h-full bg-[linear-gradient(90deg,#5CE8FF,#9C73FF,#FF5BC9)] transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="rounded-full border border-white/[0.09] bg-black/32 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/66 backdrop-blur-md">
            {route} · {distance} M · {coins} монет
          </div>
          <div className="rounded-full border border-white/[0.09] bg-black/32 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/66 backdrop-blur-md">
            Скорость {speedPercent}% · X{Math.min(5, 1 + Math.floor(combo / 7))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 px-4">
        <div className="mx-auto max-w-[360px] rounded-[18px] border border-white/[0.09] bg-[#050815]/68 px-3 py-2.5 backdrop-blur-xl">
          <div className="mb-1.5 flex items-center justify-between text-[7px] font-black uppercase tracking-[0.15em] text-white/55">
            <span>{overdrive ? "OVERDRIVE" : "FLOW"}</span>
            <span>{overdrive ? "АКТИВЕН" : `${flow}%`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={[
                "h-full rounded-full transition-[width] duration-150",
                overdrive
                  ? "w-full animate-pulse bg-[linear-gradient(90deg,#58EAFF,#FF5BC8,#FFD75A)]"
                  : "bg-[linear-gradient(90deg,#5BEAFF,#9C73FF,#FF5BC8)]",
              ].join(" ")}
              style={overdrive ? undefined : { width: `${flow}%` }}
            />
          </div>
        </div>
      </div>

      {phase === "loading" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#03050d]">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#63E9FF]" />
            <div className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/55">
              Загружаем город
            </div>
          </div>
        </div>
      )}

      {phase === "countdown" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#02040b]/42 backdrop-blur-[2px]">
          <div
            key={countdown}
            className="rooftop-countdown pt-[0.12em] text-[88px] font-black leading-none text-white drop-shadow-[0_14px_35px_rgba(88,226,255,0.42)]"
          >
            {countdown}
          </div>
        </div>
      )}

      {phase === "playing" && timeLeft > 39 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[86px] z-20 flex justify-center px-5">
          <div className="rounded-full border border-white/[0.09] bg-black/42 px-4 py-2.5 text-center text-[8px] font-black uppercase tracking-[0.12em] text-white/70 backdrop-blur-md">
            Тап — прыжок · Удержание — выше · Свайп вниз — подкат или быстрое падение
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#02040b]/80 px-4 backdrop-blur-lg">
          <div className="w-full max-w-[360px] overflow-hidden rounded-[30px] border border-white/[0.11] bg-[linear-gradient(180deg,rgba(20,24,48,0.98),rgba(6,8,18,0.99))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
            <div
              className={[
                "rounded-[23px] border px-4 py-4 text-center",
                didWin
                  ? "border-[#58F0C2]/25 bg-[#58F0C2]/8"
                  : isDraw
                    ? "border-[#F6CF68]/25 bg-[#F6CF68]/8"
                    : "border-[#FF678D]/25 bg-[#FF678D]/8",
              ].join(" ")}
            >
              <div
                className={[
                  "text-[8px] font-black uppercase tracking-[0.17em]",
                  didWin
                    ? "text-[#71F5CC]"
                    : isDraw
                      ? "text-[#F7D87E]"
                      : "text-[#FF86A1]",
                ].join(" ")}
              >
                Neon Routes
              </div>
              <div className="mt-1 text-[29px] font-black uppercase leading-tight text-white">
                {didWin ? "Победа" : isDraw ? "Ничья" : "Поражение"}
              </div>

              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-[#61E8FF]/55 bg-[#61E8FF]/12 text-[13px] font-black text-[#C9F9FF]">
                    YOU
                  </div>
                  <div className="mt-2 text-[23px] font-black">{score}</div>
                </div>
                <div className="text-[8px] font-black uppercase tracking-[0.16em] text-white/28">
                  VS
                </div>
                <div>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#FF69C4]/45 bg-[#FF69C4]/11 text-[12px] font-black text-[#FFD0ED]">
                    RV
                  </div>
                  <div className="mt-2 text-[23px] font-black">{rivalScore}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  ["Метров", distance],
                  ["Монет", coins],
                  ["Perfect", perfects],
                  ["Ошибок", hits],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[14px] border border-white/[0.07] bg-black/18 px-1.5 py-2"
                  >
                    <div className="text-[6px] font-black uppercase tracking-[0.08em] text-white/38">
                      {label}
                    </div>
                    <div className="mt-1 text-[13px] font-black text-white">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 text-[7px] font-black uppercase tracking-[0.12em] text-white/38">
                Лучшее комбо X{Math.min(5, 1 + Math.floor(bestCombo / 7))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMatchKey((value) => value + 1)}
              className="mt-3 min-h-[56px] w-full rounded-[19px] border border-[#5CE8FF]/25 bg-[linear-gradient(180deg,rgba(92,232,255,0.25),rgba(92,232,255,0.11))] px-4 py-3 text-[10px] font-black uppercase tracking-[0.13em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_15px_34px_rgba(0,0,0,0.30)] transition active:scale-[0.985]"
            >
              Играть снова
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-2 min-h-[52px] w-full rounded-[18px] border border-white/[0.09] bg-white/[0.045] px-4 py-3 text-[9px] font-black uppercase tracking-[0.13em] text-white/72 transition active:scale-[0.985]"
            >
              К играм
            </button>
          </div>
        </div>
      )}

      <style>{`
        .rooftop-top,
        .rooftop-top * {
          line-height: 1.28;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        @keyframes rooftopCountdown {
          0% {
            opacity: 0;
            transform: scale(0.48);
          }
          48% {
            opacity: 1;
            transform: scale(1.09);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .rooftop-countdown {
          animation: rooftopCountdown 430ms cubic-bezier(0.2, 0.86, 0.24, 1);
        }
      `}</style>
    </div>
  );
}
