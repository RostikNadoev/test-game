import { useEffect, useMemo, useRef, useState } from "react";
import { useArcadeRaceOnline } from "../hooks/useArcadeRaceOnline";

type MatchPhase = "countdown" | "playing" | "finished";
type PlatformType = "normal" | "moving" | "breakable" | "spring";

type Player = {
  x: number;
  y: number;
  previousY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  squash: number;
  tilt: number;
};

type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  type: PlatformType;
  vx: number;
  broken: boolean;
  fade: number;
  hasStar: boolean;
  starTaken: boolean;
  scored: boolean;
  safePartnerId?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  gravity: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  life: number;
  hue: number;
  scale: number;
};

type BackgroundStar = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkle: number;
};

const MAX_DPR = 1.7;

const GAME = {
  gravity: 1_520,
  jumpVelocity: -650,
  springVelocity: -845,
  horizontalAcceleration: 1_850,
  maxHorizontalSpeed: 330,
  horizontalFriction: 0.84,
  platformHeight: 13,
  minVerticalGap: 76,
  maxVerticalGap: 112,
  minPlatformWidth: 54,
  maxPlatformWidth: 96,
  maxHorizontalGapRatio: 0.4,
  safePlatformMinOffset: 28,
  safePlatformMaxOffset: 42,
  heightPointStepPx: 24,
  heightPointsPerStep: 2,
  fallPenalty: 28,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

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
  const webApp = (
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
  ).Telegram?.WebApp;

  if (type === "success" || type === "error") {
    webApp?.HapticFeedback?.notificationOccurred?.(type);
    return;
  }

  webApp?.HapticFeedback?.impactOccurred?.(type);
};

const createRandom = (initialSeed: number) => {
  let seed = Math.max(1, Math.floor(initialSeed) % 2_147_483_647);

  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
};

const PlayerAvatar = ({
  photoUrl,
  name,
  side,
}: {
  photoUrl?: string;
  name: string;
  side: "player" | "opponent";
}) => (
  <div
    className={[
      "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]",
      side === "player"
        ? "border-[#9D7CFF]/45 bg-[#9D7CFF]/12"
        : "border-[#FF7A90]/42 bg-[#FF7A90]/10",
    ].join(" ")}
  >
    {photoUrl ? (
      <img
        src={photoUrl}
        alt={name}
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : (
      getInitials(name)
    )}
  </div>
);

export const DoodleJumpGame = () => {
  const match = useArcadeRaceOnline("doodle_jump");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const progressRef = useRef(0);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [heightScore, setHeightScore] = useState(0);
  const [status, setStatus] = useState("GET READY");
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    setScore(match.myScore);
    setCombo(match.myCombo);
    setBestCombo(match.myBestCombo);
    setHeightScore(match.myHeightScore);
  }, [match.myBestCombo, match.myCombo, match.myHeightScore, match.myScore]);

  useEffect(() => {
    progressRef.current = match.matchProgress;
  }, [match.matchProgress]);

  const playerName = match.playerProfile.name;
  const opponentName = match.opponentProfile.name;
  const phase: MatchPhase =
    match.phase === "match_over"
      ? "finished"
      : match.phase === "playing"
        ? "playing"
        : "countdown";
  const countdown = Math.max(1, match.countdownLeft || 3);
  const timeLeft = match.matchTimeLeft;
  const multiplier = useMemo(
    () => Math.min(5, 1 + Math.floor(Math.max(0, combo - 1) / 4)),
    [combo],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container || !match.lobbyId || !match.serverState) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    setScore(match.myScore);
    setCombo(match.myCombo);
    setBestCombo(match.myBestCombo);
    setHeightScore(match.myHeightScore);
    setStatus(match.phase === "waiting" ? "WAITING" : "GET READY");
    setShowHint(true);

    const random = createRandom(match.seed);

    const viewport = {
      width: 1,
      height: 440,
      dpr: 1,
    };

    const camera = {
      y: 0,
      targetY: 0,
      shake: 0,
    };

    const player: Player = {
      x: 0,
      y: 0,
      previousY: 0,
      vx: 0,
      vy: 0,
      width: 34,
      height: 38,
      squash: 0,
      tilt: 0,
    };

    const platforms: Platform[] = [];
    const particles: Particle[] = [];
    const texts: FloatingText[] = [];
    const backgroundStars: BackgroundStar[] = [];

    const control = {
      active: false,
      pointerId: null as number | null,
      targetX: 0,
      left: false,
      right: false,
    };

    let internalPhase: MatchPhase =
      match.phaseRef.current === "playing"
        ? "playing"
        : match.phaseRef.current === "match_over"
          ? "finished"
          : "countdown";
    let internalScore = match.myScore;
    let internalCombo = match.myCombo;
    let internalBestCombo = match.myBestCombo;
    let internalHeightScore = match.myHeightScore;
    let highestWorldY = 0;
    let nextPlatformId = 1;
    let highestGeneratedY = 0;
    let checkpointPlatformId = 0;
    let startPlatformY = 0;
    let previousFrameAt = performance.now();
    let initialized = false;
    let respawnUntil = 0;
    let flash = 0;

    const roundedRect = (
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
    ) => {
      const r = Math.min(radius, width / 2, height / 2);

      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + width - r, y);
      context.quadraticCurveTo(x + width, y, x + width, y + r);
      context.lineTo(x + width, y + height - r);
      context.quadraticCurveTo(
        x + width,
        y + height,
        x + width - r,
        y + height,
      );
      context.lineTo(x + r, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    };

    const addParticles = (
      x: number,
      y: number,
      hue: number,
      count: number,
      strength: number,
    ) => {
      for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const speed = (55 + random() * 190) * strength;
        const life = 0.38 + random() * 0.48;

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 1.6 + random() * 3.8,
          hue: hue + (random() - 0.5) * 24,
          gravity: 120 + random() * 260,
        });
      }
    };

    const addText = (
      text: string,
      x: number,
      y: number,
      hue: number,
      scale = 1,
    ) => {
      texts.push({
        x,
        y,
        text,
        life: 1,
        hue,
        scale,
      });

      setStatus(text);
    };

    const choosePlatformType = (progression: number): PlatformType => {
      const difficulty = clamp(progression, 0, 1);
      const value = random();
      const movingChance = lerp(0.08, 0.3, difficulty);
      const breakableChance = lerp(0.05, 0.24, difficulty);

      if (value < movingChance) return "moving";
      if (value < movingChance + breakableChance) return "breakable";
      if (value > 0.91) return "spring";
      return "normal";
    };

    const createPlatformAbove = (progression: number) => {
      const previous = platforms
        .filter((platform) => !platform.broken && platform.fade > 0)
        .reduce<Platform | null>((highest, platform) => {
          if (!highest || platform.y < highest.y) return platform;
          return highest;
        }, null);

      const previousX = previous?.x ?? viewport.width * 0.5 - 45;
      const previousWidth = previous?.width ?? 90;
      const difficulty = clamp(progression, 0, 1);
      const gap =
        lerp(GAME.minVerticalGap, GAME.maxVerticalGap, difficulty) *
        (0.92 + random() * 0.18);
      const width =
        lerp(GAME.maxPlatformWidth, GAME.minPlatformWidth, difficulty) *
        (0.9 + random() * 0.16);
      const centerFrom = previousX + previousWidth * 0.5;
      const maxCenterShift = viewport.width * GAME.maxHorizontalGapRatio;
      const useOppositeSide = random() < lerp(0.34, 0.72, difficulty);

      let targetCenter: number;

      if (useOppositeSide) {
        const previousOnLeft = centerFrom < viewport.width * 0.5;
        const direction = previousOnLeft ? 1 : -1;
        const shift = lerp(
          viewport.width * 0.2,
          maxCenterShift,
          random(),
        );
        targetCenter = centerFrom + direction * shift;
      } else {
        const minimumShift = lerp(18, 56, difficulty);
        const direction = random() > 0.5 ? 1 : -1;
        const shift = direction * lerp(minimumShift, maxCenterShift, random());
        targetCenter = centerFrom + shift;
      }

      let allowedCenterMin = centerFrom - maxCenterShift;
      let allowedCenterMax = centerFrom + maxCenterShift;

      const previousSafePartner = previous?.safePartnerId
        ? platforms.find((platform) => platform.id === previous.safePartnerId)
        : undefined;

      if (
        previousSafePartner &&
        !previousSafePartner.broken &&
        previousSafePartner.fade > 0
      ) {
        const safeCenter =
          previousSafePartner.x + previousSafePartner.width * 0.5;

        allowedCenterMin = Math.max(
          allowedCenterMin,
          safeCenter - maxCenterShift,
        );
        allowedCenterMax = Math.min(
          allowedCenterMax,
          safeCenter + maxCenterShift,
        );
      }

      targetCenter = clamp(
        targetCenter,
        allowedCenterMin,
        allowedCenterMax,
      );

      const nextCenter = clamp(
        targetCenter,
        20 + width * 0.5,
        viewport.width - 20 - width * 0.5,
      );
      const type = choosePlatformType(difficulty);
      const y = highestGeneratedY - gap;
      const platformId = nextPlatformId;
      nextPlatformId += 1;

      const platform: Platform = {
        id: platformId,
        x: nextCenter - width * 0.5,
        y,
        width,
        type,
        vx:
          type === "moving"
            ? (random() > 0.5 ? 1 : -1) *
              (56 + difficulty * 56 + random() * 38)
            : 0,
        broken: false,
        fade: 1,
        hasStar: random() > 0.72,
        starTaken: false,
        scored: false,
      };

      platforms.push(platform);

      if (type === "breakable") {
        const safeWidth = clamp(
          width * (0.96 + random() * 0.22),
          62,
          92,
        );
        const preferredDirection =
          nextCenter < viewport.width * 0.5 ? 1 : -1;
        const safeShift = Math.min(
          viewport.width * (0.2 + random() * 0.09),
          maxCenterShift * 0.78,
        );

        let safeCenter = clamp(
          nextCenter + preferredDirection * safeShift,
          18 + safeWidth * 0.5,
          viewport.width - 18 - safeWidth * 0.5,
        );

        if (Math.abs(safeCenter - nextCenter) < viewport.width * 0.13) {
          safeCenter = clamp(
            nextCenter - preferredDirection * safeShift,
            18 + safeWidth * 0.5,
            viewport.width - 18 - safeWidth * 0.5,
          );
        }

        const safePlatformId = nextPlatformId;
        nextPlatformId += 1;

        platforms.push({
          id: safePlatformId,
          x: safeCenter - safeWidth * 0.5,
          y:
            y +
            lerp(
              GAME.safePlatformMinOffset,
              GAME.safePlatformMaxOffset,
              random(),
            ),
          width: safeWidth,
          type: "normal",
          vx: 0,
          broken: false,
          fade: 1,
          hasStar: false,
          starTaken: true,
          scored: false,
        });

        platform.safePartnerId = safePlatformId;
      }

      highestGeneratedY = y;
    };

    const ensurePlatforms = (progression: number) => {
      const requiredTop = camera.y - 520;

      while (highestGeneratedY > requiredTop) {
        createPlatformAbove(progression);
      }
    };

    const initialize = () => {
      platforms.length = 0;
      particles.length = 0;
      texts.length = 0;
      backgroundStars.length = 0;
      nextPlatformId = 1;

      startPlatformY = viewport.height * 0.76;
      highestGeneratedY = startPlatformY;

      const startPlatform: Platform = {
        id: nextPlatformId,
        x: viewport.width * 0.5 - 58,
        y: startPlatformY,
        width: 116,
        type: "normal",
        vx: 0,
        broken: false,
        fade: 1,
        hasStar: false,
        starTaken: true,
        scored: true,
      };

      platforms.push(startPlatform);
      checkpointPlatformId = startPlatform.id;
      nextPlatformId += 1;

      player.x = viewport.width * 0.5;
      player.y = startPlatformY - player.height * 0.5;
      player.previousY = player.y;
      player.vx = 0;
      player.vy = 0;
      player.squash = 0;
      player.tilt = 0;

      camera.y = 0;
      camera.targetY = 0;
      highestWorldY = player.y;

      for (let index = 0; index < 70; index += 1) {
        backgroundStars.push({
          x: random() * viewport.width,
          y: random() * viewport.height,
          size: 0.6 + random() * 1.8,
          alpha: 0.16 + random() * 0.42,
          twinkle: random() * Math.PI * 2,
        });
      }

      ensurePlatforms(0);
      initialized = true;
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();

      viewport.width = Math.max(1, bounds.width);
      viewport.height = Math.max(440, bounds.height);
      viewport.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      canvas.width = Math.round(viewport.width * viewport.dpr);
      canvas.height = Math.round(viewport.height * viewport.dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

      if (!initialized) {
        initialize();
      } else {
        player.x = clamp(player.x, 0, viewport.width);

        for (const platform of platforms) {
          platform.x = clamp(
            platform.x,
            12,
            Math.max(12, viewport.width - 12 - platform.width),
          );
        }
      }
    };

    const platformById = (id: number) =>
      platforms.find((platform) => platform.id === id);

    const updateScoreForHeight = () => {
      highestWorldY = Math.min(highestWorldY, player.y);

      const heightSteps = Math.max(
        0,
        Math.floor(
          (startPlatformY - highestWorldY) / GAME.heightPointStepPx,
        ),
      );
      const nextHeightScore = heightSteps * GAME.heightPointsPerStep;

      if (nextHeightScore <= internalHeightScore) return;

      const difference = nextHeightScore - internalHeightScore;
      internalHeightScore = nextHeightScore;
      internalScore += difference;
      match.sendEvent({ kind: "height", value: heightSteps });

      setHeightScore(internalHeightScore);
      setScore(internalScore);
    };

    const landOnPlatform = (platform: Platform, now: number) => {
      const playerCenter = player.x;
      const platformCenter = platform.x + platform.width * 0.5;
      const centerDistance = Math.abs(playerCenter - platformCenter);
      const perfect = centerDistance <= platform.width * 0.13;
      const firstLanding = !platform.scored;

      player.vy =
        platform.type === "spring" ? GAME.springVelocity : GAME.jumpVelocity;
      player.squash = platform.type === "spring" ? 1 : 0.68;

      if (platform.type === "breakable") {
        const safePartner = platform.safePartnerId
          ? platformById(platform.safePartnerId)
          : undefined;

        if (safePartner && !safePartner.broken && safePartner.fade > 0) {
          checkpointPlatformId = safePartner.id;
        }

        platform.broken = true;
      } else {
        checkpointPlatformId = platform.id;
      }

      if (!firstLanding) {
        internalCombo = 0;
        setCombo(0);
        setStatus("ALREADY USED");

        addText(
          "USED +0",
          platformCenter,
          platform.y - 28,
          220,
          0.8,
        );
        addParticles(player.x, platform.y, 220, 5, 0.42);
        triggerHaptic("light");

        if (now > respawnUntil) {
          setShowHint(false);
        }

        return;
      }

      platform.scored = true;

      if (perfect) {
        internalCombo += 1;
      } else {
        internalCombo = Math.max(0, internalCombo - 1);
      }

      internalBestCombo = Math.max(internalBestCombo, internalCombo);

      const currentMultiplier = Math.min(
        5,
        1 + Math.floor(Math.max(0, internalCombo - 1) / 4),
      );
      const typeBonus =
        platform.type === "spring"
          ? 25
          : platform.type === "moving"
            ? 8
            : platform.type === "breakable"
              ? 12
              : 0;
      const gained = (perfect ? 14 : 6) * currentMultiplier + typeBonus;

      internalScore += gained;
      match.sendEvent({
        kind: "platform",
        grade: platform.type,
        objectId: platform.id,
        perfect,
      });
      setScore(internalScore);
      setCombo(internalCombo);
      setBestCombo(internalBestCombo);

      const hue =
        platform.type === "spring"
          ? 48
          : perfect
            ? 176
            : platform.type === "breakable"
              ? 24
              : 268;

      addText(
        platform.type === "spring"
          ? `BOOST +${gained}`
          : perfect
            ? `PERFECT +${gained}`
            : `JUMP +${gained}`,
        platformCenter,
        platform.y - 28,
        hue,
        platform.type === "spring" || perfect ? 1.08 : 0.92,
      );

      addParticles(
        player.x,
        platform.y,
        hue,
        platform.type === "spring" ? 28 : perfect ? 20 : 10,
        platform.type === "spring" ? 1.2 : 0.78,
      );

      camera.shake = platform.type === "spring" ? 5.5 : perfect ? 2.5 : 1;
      triggerHaptic(
        platform.type === "spring" ? "heavy" : perfect ? "success" : "light",
      );

      if (now > respawnUntil) {
        setShowHint(false);
      }
    };

    const collectStar = (platform: Platform) => {
      platform.starTaken = true;
      const gained = 18;
      internalScore += gained;
      match.sendEvent({ kind: "star", objectId: platform.id });
      setScore(internalScore);
      addText(
        `STAR +${gained}`,
        platform.x + platform.width * 0.5,
        platform.y - 30,
        48,
        0.95,
      );
      addParticles(
        platform.x + platform.width * 0.5,
        platform.y - 22,
        48,
        18,
        0.9,
      );
      triggerHaptic("light");
    };

    const respawn = (now: number) => {
      const storedCheckpoint = platformById(checkpointPlatformId);
      const checkpoint =
        storedCheckpoint &&
        !storedCheckpoint.broken &&
        storedCheckpoint.fade > 0
          ? storedCheckpoint
          : [...platforms]
              .filter(
                (platform) =>
                  !platform.broken &&
                  platform.fade > 0 &&
                  platform.type !== "breakable",
              )
              .sort((first, second) => {
                const targetY = camera.y + viewport.height * 0.62;
                return (
                  Math.abs(first.y - targetY) - Math.abs(second.y - targetY)
                );
              })[0] || platforms.find((platform) => !platform.broken);

      internalScore = Math.max(0, internalScore - GAME.fallPenalty);
      internalCombo = 0;
      match.sendEvent({ kind: "fall" });

      setScore(internalScore);
      setCombo(0);
      setStatus(`FALL -${GAME.fallPenalty}`);

      if (checkpoint) {
        checkpointPlatformId = checkpoint.id;
        player.x = checkpoint.x + checkpoint.width * 0.5;
        player.y = checkpoint.y - player.height * 0.5 - 6;
      } else {
        player.x = viewport.width * 0.5;
        player.y = camera.y + viewport.height * 0.45;
      }

      player.previousY = player.y;
      player.vx = 0;
      player.vy = GAME.jumpVelocity * 0.88;
      respawnUntil = now + 800;
      flash = 1;
      camera.shake = 8;

      addParticles(player.x, player.y, 350, 28, 1.18);
      triggerHaptic("error");
    };

    const pointerX = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return event.clientX - bounds.left;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (internalPhase !== "playing") return;

      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      control.active = true;
      control.pointerId = event.pointerId;
      control.targetX = pointerX(event);
      setShowHint(false);
      triggerHaptic("light");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!control.active || control.pointerId !== event.pointerId) return;

      event.preventDefault();
      control.targetX = pointerX(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!control.active || control.pointerId !== event.pointerId) return;

      event.preventDefault();
      control.active = false;
      control.pointerId = null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        control.left = true;
        event.preventDefault();
      }

      if (event.code === "ArrowRight" || event.code === "KeyD") {
        control.right = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        control.left = false;
      }

      if (event.code === "ArrowRight" || event.code === "KeyD") {
        control.right = false;
      }
    };

    const updateMatchClock = () => {
      const serverPhase = match.phaseRef.current;

      if (serverPhase === "playing" && internalPhase !== "playing") {
        internalPhase = "playing";
        setStatus("JUMP");
        player.vy = GAME.jumpVelocity;
        triggerHaptic("medium");
        return;
      }

      if (serverPhase === "match_over" && internalPhase !== "finished") {
        internalPhase = "finished";
        setStatus("FINISH");
        player.vx = 0;
        player.vy = 0;
        triggerHaptic("success");
        return;
      }

      if (serverPhase === "waiting" || serverPhase === "countdown") {
        internalPhase = "countdown";
      }
    };

    const updatePlatforms = (deltaTime: number) => {
      for (const platform of platforms) {
        if (platform.type === "moving" && !platform.broken) {
          platform.x += platform.vx * deltaTime;

          if (platform.x < 12) {
            platform.x = 12;
            platform.vx = Math.abs(platform.vx);
          } else if (platform.x + platform.width > viewport.width - 12) {
            platform.x = viewport.width - 12 - platform.width;
            platform.vx = -Math.abs(platform.vx);
          }
        }

        if (platform.broken) {
          platform.y += 170 * deltaTime;
          platform.fade = Math.max(0, platform.fade - deltaTime * 2.2);
        }
      }
    };

    const updatePlayer = (deltaTime: number, now: number) => {
      if (internalPhase !== "playing") {
        if (internalPhase === "countdown") {
          player.squash = 0.08 + Math.sin(now * 0.008) * 0.04;
        }
        return;
      }

      player.previousY = player.y;

      let inputDirection = 0;

      if (control.active) {
        const difference = control.targetX - player.x;
        inputDirection = clamp(difference / 70, -1, 1);
      } else {
        inputDirection = Number(control.right) - Number(control.left);
      }

      if (Math.abs(inputDirection) > 0.02) {
        player.vx += inputDirection * GAME.horizontalAcceleration * deltaTime;
      } else {
        player.vx *= Math.pow(GAME.horizontalFriction, deltaTime * 60);
      }

      player.vx = clamp(
        player.vx,
        -GAME.maxHorizontalSpeed,
        GAME.maxHorizontalSpeed,
      );
      player.vy += GAME.gravity * deltaTime;
      player.x += player.vx * deltaTime;
      player.y += player.vy * deltaTime;
      player.tilt = lerp(
        player.tilt,
        clamp(player.vx / GAME.maxHorizontalSpeed, -1, 1) * 0.22,
        Math.min(1, deltaTime * 10),
      );
      player.squash *= Math.pow(0.035, deltaTime);

      if (player.x < -player.width * 0.5) {
        player.x = viewport.width + player.width * 0.5;
      } else if (player.x > viewport.width + player.width * 0.5) {
        player.x = -player.width * 0.5;
      }

      if (player.vy > 0) {
        const previousBottom = player.previousY + player.height * 0.5;
        const currentBottom = player.y + player.height * 0.5;

        const landing = platforms
          .filter(
            (platform) =>
              !platform.broken &&
              platform.fade > 0 &&
              previousBottom <= platform.y + 3 &&
              currentBottom >= platform.y &&
              player.x + player.width * 0.34 >= platform.x &&
              player.x - player.width * 0.34 <= platform.x + platform.width,
          )
          .sort((first, second) => first.y - second.y)[0];

        if (landing) {
          player.y = landing.y - player.height * 0.5;
          landOnPlatform(landing, now);
        }
      }

      for (const platform of platforms) {
        if (!platform.hasStar || platform.starTaken || platform.broken)
          continue;

        const starX = platform.x + platform.width * 0.5;
        const starY = platform.y - 25;

        if (Math.hypot(player.x - starX, player.y - starY) < 27) {
          collectStar(platform);
        }
      }

      updateScoreForHeight();

      const desiredCameraY = player.y - viewport.height * 0.43;
      camera.targetY = Math.min(camera.targetY, desiredCameraY);
      camera.y += (camera.targetY - camera.y) * Math.min(1, deltaTime * 6.6);

      const progression = progressRef.current;
      ensurePlatforms(progression);

      for (let index = platforms.length - 1; index >= 0; index -= 1) {
        if (
          platforms[index].y > camera.y + viewport.height + 220 ||
          platforms[index].fade <= 0
        ) {
          platforms.splice(index, 1);
        }
      }

      if (player.y > camera.y + viewport.height + 110 && now > respawnUntil) {
        respawn(now);
      }
    };

    const updateEffects = (deltaTime: number) => {
      camera.shake *= Math.pow(0.03, deltaTime);
      flash *= Math.pow(0.012, deltaTime);

      for (const particle of particles) {
        particle.vy += particle.gravity * deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.vx *= Math.pow(0.97, deltaTime * 60);
        particle.life -= deltaTime;
      }

      for (const text of texts) {
        text.y -= 34 * deltaTime;
        text.life -= deltaTime * 0.88;
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        if (particles[index].life <= 0) particles.splice(index, 1);
      }

      for (let index = texts.length - 1; index >= 0; index -= 1) {
        if (texts[index].life <= 0) texts.splice(index, 1);
      }
    };

    const drawBackground = (now: number) => {
      const glow = context.createRadialGradient(
        viewport.width * 0.18,
        viewport.height * 0.12,
        8,
        viewport.width * 0.18,
        viewport.height * 0.12,
        viewport.width * 0.74,
      );
      glow.addColorStop(0, "rgba(157,124,255,0.18)");
      glow.addColorStop(1, "rgba(157,124,255,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, viewport.width, viewport.height);

      for (const star of backgroundStars) {
        const parallaxY =
          (((star.y + camera.y * 0.08) % viewport.height) + viewport.height) %
          viewport.height;
        const alpha =
          star.alpha * (0.75 + Math.sin(now * 0.002 + star.twinkle) * 0.25);

        context.globalAlpha = alpha;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(star.x, parallaxY, star.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      const cloudShift = (((camera.y * 0.18) % 170) + 170) % 170;
      context.fillStyle = "rgba(235,232,255,0.07)";

      for (let row = -1; row < 6; row += 1) {
        const y = row * 170 + cloudShift;
        const offset = row % 2 === 0 ? -30 : 55;

        for (let x = offset; x < viewport.width + 120; x += 190) {
          context.beginPath();
          context.arc(x, y, 28, 0, Math.PI * 2);
          context.arc(x + 32, y - 8, 38, 0, Math.PI * 2);
          context.arc(x + 72, y, 26, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const drawStar = (x: number, y: number, now: number) => {
      const pulse = 1 + Math.sin(now * 0.008 + x) * 0.1;

      context.save();
      context.translate(x, y);
      context.scale(pulse, pulse);
      context.rotate(now * 0.0015);
      context.shadowBlur = 15;
      context.shadowColor = "rgba(242,199,102,0.72)";

      const gradient = context.createRadialGradient(-2, -3, 1, 0, 0, 11);
      gradient.addColorStop(0, "#fff9c5");
      gradient.addColorStop(0.5, "#f4ce62");
      gradient.addColorStop(1, "#b97a23");
      context.fillStyle = gradient;

      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const radius = point % 2 === 0 ? 9.5 : 4.2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.restore();
    };

    const drawPlatform = (platform: Platform, now: number) => {
      const screenY = platform.y - camera.y;

      if (
        screenY < -60 ||
        screenY > viewport.height + 70 ||
        platform.fade <= 0
      ) {
        return;
      }

      context.save();
      context.globalAlpha = platform.fade;

      const colors: Record<PlatformType, [string, string, string]> = {
        normal: ["#56f0cf", "#159c91", "#075d67"],
        moving: ["#b89cff", "#7555e8", "#3e2b9e"],
        breakable: ["#ffb45e", "#dd7044", "#8a342f"],
        spring: ["#fff2a2", "#efb93e", "#aa651c"],
      };
      const [light, middle, dark] = colors[platform.type];
      const gradient = context.createLinearGradient(
        platform.x,
        screenY,
        platform.x,
        screenY + GAME.platformHeight + 9,
      );
      gradient.addColorStop(0, light);
      gradient.addColorStop(0.45, middle);
      gradient.addColorStop(1, dark);

      context.fillStyle = gradient;
      context.shadowBlur = 13;
      context.shadowColor = `${middle}66`;
      roundedRect(platform.x, screenY, platform.width, GAME.platformHeight, 7);
      context.fill();
      context.shadowBlur = 0;

      context.strokeStyle = "rgba(255,255,255,0.42)";
      context.lineWidth = 1;
      roundedRect(
        platform.x + 1,
        screenY + 1,
        platform.width - 2,
        GAME.platformHeight - 2,
        6,
      );
      context.stroke();

      context.fillStyle = "rgba(0,0,0,0.22)";
      roundedRect(
        platform.x + 7,
        screenY + GAME.platformHeight - 1,
        platform.width - 14,
        7,
        4,
      );
      context.fill();

      if (platform.type === "moving") {
        context.strokeStyle = "rgba(255,255,255,0.64)";
        context.lineWidth = 1.4;
        context.beginPath();
        context.moveTo(platform.x + platform.width * 0.35, screenY + 6.5);
        context.lineTo(platform.x + platform.width * 0.22, screenY + 6.5);
        context.moveTo(platform.x + platform.width * 0.65, screenY + 6.5);
        context.lineTo(platform.x + platform.width * 0.78, screenY + 6.5);
        context.stroke();
      }

      if (platform.type === "breakable") {
        context.strokeStyle = "rgba(80,24,24,0.62)";
        context.lineWidth = 1.4;
        context.beginPath();
        context.moveTo(platform.x + platform.width * 0.42, screenY + 1);
        context.lineTo(platform.x + platform.width * 0.49, screenY + 6);
        context.lineTo(platform.x + platform.width * 0.45, screenY + 12);
        context.stroke();
      }

      if (platform.type === "spring") {
        const springPulse = 1 + Math.sin(now * 0.01) * 0.08;
        context.strokeStyle = "#fff7c9";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(platform.x + platform.width * 0.4, screenY);
        context.lineTo(
          platform.x + platform.width * 0.45,
          screenY - 9 * springPulse,
        );
        context.lineTo(
          platform.x + platform.width * 0.55,
          screenY - 2 * springPulse,
        );
        context.lineTo(
          platform.x + platform.width * 0.6,
          screenY - 12 * springPulse,
        );
        context.stroke();
      }

      if (platform.hasStar && !platform.starTaken && !platform.broken) {
        drawStar(platform.x + platform.width * 0.5, screenY - 25, now);
      }

      context.restore();
    };

    const drawPlayer = (now: number) => {
      const screenY = player.y - camera.y;
      const stretch = clamp(-player.vy / 1_200, -0.16, 0.2);
      const scaleX = 1 + player.squash * 0.22 - stretch * 0.16;
      const scaleY = 1 - player.squash * 0.2 + stretch * 0.22;
      const fireCombo = internalCombo >= 8;

      context.save();
      context.translate(player.x, screenY);
      context.rotate(player.tilt);
      context.scale(scaleX, scaleY);

      const glow = context.createRadialGradient(0, 0, 4, 0, 0, 47);
      glow.addColorStop(
        0,
        fireCombo ? "rgba(255,174,63,0.32)" : "rgba(157,124,255,0.3)",
      );
      glow.addColorStop(1, "rgba(157,124,255,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, 47, 0, Math.PI * 2);
      context.fill();

      const bodyGradient = context.createRadialGradient(-8, -10, 3, 2, 4, 30);
      bodyGradient.addColorStop(0, "#f4efff");
      bodyGradient.addColorStop(0.3, "#b58dff");
      bodyGradient.addColorStop(0.72, "#7555df");
      bodyGradient.addColorStop(1, "#392777");
      context.fillStyle = bodyGradient;
      context.shadowBlur = 14;
      context.shadowColor = "rgba(157,124,255,0.6)";
      roundedRect(
        -player.width * 0.5,
        -player.height * 0.5,
        player.width,
        player.height,
        13,
      );
      context.fill();
      context.shadowBlur = 0;

      context.fillStyle = "#ffffff";
      context.beginPath();
      context.ellipse(-7, -5, 5.5, 6.2, 0, 0, Math.PI * 2);
      context.ellipse(7, -5, 5.5, 6.2, 0, 0, Math.PI * 2);
      context.fill();

      const look = clamp(player.vx / GAME.maxHorizontalSpeed, -1, 1) * 1.5;
      context.fillStyle = "#1d1538";
      context.beginPath();
      context.arc(-7 + look, -4.5, 2.2, 0, Math.PI * 2);
      context.arc(7 + look, -4.5, 2.2, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(255,255,255,0.66)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(0, 5, 6, 0.15, Math.PI - 0.15);
      context.stroke();

      context.fillStyle = fireCombo ? "#ff9f43" : "#4ce7cf";
      context.beginPath();
      context.ellipse(-10, player.height * 0.5, 8, 4.5, 0, 0, Math.PI * 2);
      context.ellipse(10, player.height * 0.5, 8, 4.5, 0, 0, Math.PI * 2);
      context.fill();

      if (player.vy < -420) {
        const flameLength = 8 + Math.sin(now * 0.035) * 3;
        context.fillStyle = fireCombo ? "#ff6c32" : "#52ffe5";
        context.globalAlpha = 0.72;
        context.beginPath();
        context.moveTo(-10, player.height * 0.5 + 3);
        context.lineTo(-10, player.height * 0.5 + flameLength);
        context.lineTo(-5, player.height * 0.5 + 2);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(10, player.height * 0.5 + 3);
        context.lineTo(10, player.height * 0.5 + flameLength);
        context.lineTo(5, player.height * 0.5 + 2);
        context.closePath();
        context.fill();
      }

      context.restore();
    };

    const drawEffects = () => {
      context.save();
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.globalAlpha = alpha;
        context.fillStyle = `hsl(${particle.hue},100%,68%)`;
        context.shadowBlur = 8;
        context.shadowColor = `hsla(${particle.hue},100%,58%,0.8)`;
        context.beginPath();
        context.arc(
          particle.x,
          particle.y - camera.y,
          particle.size * alpha,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      context.restore();
      context.globalAlpha = 1;
      context.shadowBlur = 0;

      for (const text of texts) {
        const alpha = clamp(text.life, 0, 1);
        const scale = text.scale * (0.92 + (1 - alpha) * 0.18);

        context.save();
        context.translate(text.x, text.y - camera.y);
        context.scale(scale, scale);
        context.globalAlpha = alpha;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "900 11px Supercell, system-ui, sans-serif";
        context.fillStyle = `hsl(${text.hue},100%,72%)`;
        context.shadowBlur = 13;
        context.shadowColor = `hsla(${text.hue},100%,58%,0.88)`;
        context.fillText(text.text, 0, 0);
        context.restore();
      }

      if (flash > 0.01) {
        context.fillStyle = `rgba(255,50,90,${flash * 0.09})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }
    };

    const render = (now: number) => {
      context.clearRect(0, 0, viewport.width, viewport.height);

      const shakeX = camera.shake > 0.1 ? (random() - 0.5) * camera.shake : 0;
      const shakeY = camera.shake > 0.1 ? (random() - 0.5) * camera.shake : 0;

      context.save();
      context.translate(shakeX, shakeY);
      drawBackground(now);

      const sortedPlatforms = [...platforms].sort(
        (first, second) => first.y - second.y,
      );
      for (const platform of sortedPlatforms) drawPlatform(platform, now);

      drawPlayer(now);
      drawEffects();
      context.restore();
    };

    const frame = (now: number) => {
      const deltaTime = Math.max(0, Math.min(34, now - previousFrameAt) / 1000);
      previousFrameAt = now;

      updateMatchClock();
      updatePlatforms(deltaTime);
      updatePlayer(deltaTime, now);
      updateEffects(deltaTime);
      render(now);

      animationRef.current = window.requestAnimationFrame(frame);
    };

    resize();
    previousFrameAt = performance.now();

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }

      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [match.lobbyId, match.matchInstanceKey, match.seed]);

  if (!match.lobbyId) {
    return (
      <div className="grid h-full min-h-[440px] place-items-center p-5 text-center text-white">
        <div>
          <div className="text-[20px] font-black uppercase">Лобби не найдено</div>
          <button type="button" onClick={match.backToLobbies} className="mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black">К лобби</button>
        </div>
      </div>
    );
  }

  if ((match.connectionStatus === "error" || match.connectionStatus === "closed") && !match.serverState) {
    return (
      <div className="grid h-full min-h-[440px] place-items-center p-5 text-center text-white">
        <div>
          <div className="text-[20px] font-black uppercase">Нет соединения</div>
          <div className="mt-2 text-[10px] text-white/45">{match.socketError || "WebSocket закрыт"}</div>
          <button type="button" onClick={match.backToLobbies} className="mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black">К лобби</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[440px] w-full select-none overflow-hidden bg-transparent text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PlayerAvatar
              photoUrl={match.playerProfile.photoUrl}
              name={playerName}
              side="player"
            />

            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[9px] font-black leading-none text-white/90">
                {playerName}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[20px] font-black leading-none tabular-nums text-[#9D7CFF]">
                  {score}
                </span>
                <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/30">
                  x{Math.max(1, multiplier)} · {combo}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div className="text-[22px] font-black leading-none tabular-nums text-white">
              {phase === "countdown" ? countdown : timeLeft}
            </div>
            <div className="mt-1 text-[6px] font-black uppercase tracking-[0.16em] text-white/30">
              {phase === "finished" ? "finished" : "seconds"}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[9px] font-black leading-none text-white/90">
                {opponentName}
              </div>

              <div className="mt-1.5 flex items-baseline justify-end gap-1.5">
                <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/30">
                  x{Math.min(5, 1 + Math.floor(Math.max(0, match.opponentCombo - 1) / 4))} · {match.opponentCombo}
                </span>
                <span className="text-[20px] font-black leading-none tabular-nums text-[#FF7A90]">
                  {match.opponentScore}
                </span>
              </div>
            </div>

            <PlayerAvatar
              photoUrl={match.opponentProfile.photoUrl}
              name={opponentName}
              side="opponent"
            />
          </div>
        </div>

        <div className="mx-auto mt-2 flex max-w-[480px] justify-center">
          <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.17em] text-white/45 backdrop-blur-md">
            {status} · height {heightScore} · best combo {bestCombo}
          </div>
        </div>
      </header>

      {match.phase === "waiting" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/25 px-5 text-center backdrop-blur-[2px]">
          <div>
            <div className="text-[20px] font-black uppercase text-white">Ждём соперника</div>
            <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">Матч начнётся, когда подключатся оба игрока</div>
          </div>
        </div>
      )}

      {phase === "countdown" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/10">
          <div className="text-center">
            <div className="text-[58px] font-black leading-none text-white drop-shadow-[0_10px_30px_rgba(157,124,255,0.45)]">
              {countdown}
            </div>
            <div className="mt-3 text-[9px] font-black uppercase tracking-[0.22em] text-white/48">
              move left and right
            </div>
          </div>
        </div>
      )}

      {showHint && phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center px-4">
          <div className="animate-pulse rounded-full border border-white/[0.09] bg-black/30 px-4 py-2 text-[9px] font-black uppercase tracking-[0.17em] text-white/55 backdrop-blur-md">
            Веди пальцем влево и вправо
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 px-5 backdrop-blur-[3px]">
          <div className="w-full max-w-[310px] rounded-[28px] border border-white/12 bg-[#15132b]/96 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[#B49AFF]/65">
              Doodle Jump
            </div>
            <div className="mt-3 text-[28px] font-black leading-none text-white">
              {score}
            </div>
            <div className="mt-2 text-[8px] font-black uppercase tracking-[0.16em] text-white/35">
              {match.draw
                ? "ничья"
                : match.winnerUserId === match.myUserId
                  ? "победа"
                  : "поражение"} · height {heightScore} · best combo {bestCombo}
            </div>

            <button
              type="button"
              onClick={match.backToLobbies}
              className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-black transition active:scale-[0.98]"
            >
              К лобби
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoodleJumpGame;