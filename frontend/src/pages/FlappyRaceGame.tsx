import { useEffect, useMemo, useRef, useState } from "react";
import { useArcadeRaceOnline } from "../hooks/useArcadeRaceOnline";

type MatchPhase = "countdown" | "playing" | "finished";

type Bird = {
  x: number;
  y: number;
  vy: number;
  radius: number;
  rotation: number;
  wing: number;
};

type Gate = {
  id: number;
  x: number;
  width: number;
  baseGapY: number;
  gapSize: number;
  movementAmplitude: number;
  movementSpeed: number;
  movementOffset: number;
  passed: boolean;
  coinTaken: boolean;
  coinOffset: number;
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

type Cloud = {
  x: number;
  y: number;
  scale: number;
  speed: number;
  alpha: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  life: number;
  hue: number;
  scale: number;
};

const MAX_DPR = 1.7;

const GAME = {
  gravity: 1_480,
  flapVelocity: -455,
  birdRadius: 16,
  gateWidth: 62,
  startGap: 154,
  minGap: 118,
  gateSpacing: 232,
  startSpeed: 158,
  maxSpeed: 272,
  collisionPenalty: 18,
  invulnerabilityMs: 950,
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
        ? "border-[#52FFE5]/42 bg-[#52FFE5]/10"
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

export const FlappyRaceGame = () => {
  const match = useArcadeRaceOnline("flappy_race");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const progressRef = useRef(0);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [status, setStatus] = useState("GET READY");
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    setScore(match.myScore);
    setCombo(match.myCombo);
    setBestCombo(match.myBestCombo);
  }, [match.myBestCombo, match.myCombo, match.myScore]);

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
    setStatus(match.phase === "waiting" ? "WAITING" : "GET READY");
    setShowHint(true);

    const random = createRandom(match.seed);

    const viewport = {
      width: 1,
      height: 440,
      dpr: 1,
    };

    const bird: Bird = {
      x: 0,
      y: 0,
      vy: 0,
      radius: GAME.birdRadius,
      rotation: 0,
      wing: 0,
    };

    const gates: Gate[] = [];
    const particles: Particle[] = [];
    const clouds: Cloud[] = [];
    const texts: FloatingText[] = [];

    let internalPhase: MatchPhase =
      match.phaseRef.current === "playing"
        ? "playing"
        : match.phaseRef.current === "match_over"
          ? "finished"
          : "countdown";
    let internalScore = match.myScore;
    let internalCombo = match.myCombo;
    let internalBestCombo = match.myBestCombo;
    let nextGateId = 1;
    let previousFrameAt = performance.now();
    let invulnerableUntil = 0;
    let flash = 0;
    let cameraShake = 0;
    let initialized = false;

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
        const speed = (45 + random() * 175) * strength;
        const life = 0.35 + random() * 0.45;

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 1.5 + random() * 3.6,
          life,
          maxLife: life,
          hue: hue + (random() - 0.5) * 25,
          gravity: 80 + random() * 220,
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

    const currentGapY = (gate: Gate, now: number) =>
      gate.baseGapY +
      Math.sin(now * 0.001 * gate.movementSpeed + gate.movementOffset) *
        gate.movementAmplitude;

    const makeGate = (x: number, progression: number) => {
      const topSafe = 118;
      const bottomSafe = 62;
      const minimumCenter = topSafe + 88;
      const maximumCenter = viewport.height - bottomSafe - 88;
      const gapSize = lerp(
        GAME.startGap,
        GAME.minGap,
        clamp(progression, 0, 1),
      );
      const movingChance = lerp(0.16, 0.78, clamp(progression, 0, 1));
      const moving = random() < movingChance;

      gates.push({
        id: nextGateId,
        x,
        width: GAME.gateWidth,
        baseGapY: lerp(minimumCenter, maximumCenter, random()),
        gapSize,
        movementAmplitude: moving ? 14 + progression * 24 + random() * 18 : 0,
        movementSpeed: moving ? 1.35 + progression * 1.55 + random() * 0.72 : 0,
        movementOffset: random() * Math.PI * 2,
        passed: false,
        coinTaken: false,
        coinOffset: (random() - 0.5) * gapSize * 0.36,
      });

      nextGateId += 1;
    };

    const ensureGates = (progression: number) => {
      while (
        gates.length === 0 ||
        gates[gates.length - 1].x < viewport.width + GAME.gateSpacing
      ) {
        const lastX = gates.length
          ? gates[gates.length - 1].x
          : viewport.width + 150;

        makeGate(lastX + GAME.gateSpacing, progression);
      }
    };

    const initialize = () => {
      bird.x = viewport.width * 0.27;
      bird.y = viewport.height * 0.5;
      bird.vy = 0;
      bird.rotation = 0;
      bird.wing = 0;

      gates.length = 0;
      clouds.length = 0;
      particles.length = 0;
      texts.length = 0;
      nextGateId = 1;

      for (let index = 0; index < 11; index += 1) {
        clouds.push({
          x: random() * viewport.width,
          y: 90 + random() * Math.max(120, viewport.height * 0.58),
          scale: 0.55 + random() * 1.25,
          speed: 7 + random() * 14,
          alpha: 0.08 + random() * 0.16,
        });
      }

      ensureGates(0);
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
        bird.x = viewport.width * 0.27;
        bird.y = clamp(bird.y, 100, viewport.height - 60);
      }
    };

    const scoreGate = (gate: Gate, now: number) => {
      const gapY = currentGapY(gate, now);
      const centerDistance = Math.abs(bird.y - gapY);
      const perfect = centerDistance <= 15;

      internalCombo += 1;
      internalBestCombo = Math.max(internalBestCombo, internalCombo);

      const currentMultiplier = Math.min(
        5,
        1 + Math.floor(Math.max(0, internalCombo - 1) / 4),
      );
      const gained = (perfect ? 22 : 12) * currentMultiplier;

      internalScore += gained;
      match.sendEvent({
        kind: "gate",
        grade: perfect ? "perfect" : "gate",
        objectId: gate.id,
        perfect,
      });

      setScore(internalScore);
      setCombo(internalCombo);
      setBestCombo(internalBestCombo);

      addText(
        perfect ? `PERFECT +${gained}` : `GATE +${gained}`,
        gate.x + gate.width * 0.5,
        gapY - 34,
        perfect ? 48 : 176,
        perfect ? 1.08 : 0.96,
      );

      addParticles(
        bird.x,
        bird.y,
        perfect ? 48 : 176,
        perfect ? 24 : 14,
        perfect ? 1.15 : 0.82,
      );

      cameraShake = perfect ? 4.5 : 1.8;
      triggerHaptic(perfect ? "heavy" : "success");
    };

    const collectCoin = (gate: Gate, gapY: number) => {
      gate.coinTaken = true;

      const coinMultiplier = Math.min(
        5,
        1 + Math.floor(Math.max(0, internalCombo - 1) / 4),
      );
      const gained = 8 * coinMultiplier;
      internalScore += gained;
      match.sendEvent({ kind: "star", objectId: gate.id });
      setScore(internalScore);

      addText(`STAR +${gained}`, gate.x + gate.width * 0.5, gapY, 48, 0.9);
      addParticles(gate.x + gate.width * 0.5, gapY, 48, 18, 0.9);
      triggerHaptic("light");
    };

    const handleCrash = (now: number) => {
      if (now < invulnerableUntil || internalPhase !== "playing") return;

      invulnerableUntil = now + GAME.invulnerabilityMs;
      internalScore = Math.max(0, internalScore - GAME.collisionPenalty);
      internalCombo = 0;
      match.sendEvent({ kind: "crash" });

      setScore(internalScore);
      setCombo(0);
      setStatus(`-${GAME.collisionPenalty}`);

      bird.vy = -255;
      bird.y = clamp(bird.y, 135, viewport.height - 105);
      flash = 1;
      cameraShake = 8;

      addParticles(bird.x, bird.y, 350, 28, 1.2);
      addText(
        `HIT -${GAME.collisionPenalty}`,
        bird.x + 42,
        bird.y - 30,
        350,
        1,
      );

      triggerHaptic("error");
    };

    const flap = () => {
      if (internalPhase !== "playing") return;

      bird.vy = GAME.flapVelocity;
      bird.wing = 1;
      setShowHint(false);

      addParticles(bird.x - 12, bird.y + 7, 184, 6, 0.35);
      triggerHaptic("light");
    };

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      flap();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.code !== "ArrowUp") return;

      event.preventDefault();
      flap();
    };

    const updateMatchClock = () => {
      const serverPhase = match.phaseRef.current;

      if (serverPhase === "playing" && internalPhase !== "playing") {
        internalPhase = "playing";
        setStatus("FLY");
        bird.vy = GAME.flapVelocity * 0.72;
        triggerHaptic("medium");
        return;
      }

      if (serverPhase === "match_over" && internalPhase !== "finished") {
        internalPhase = "finished";
        setStatus("FINISH");
        bird.vy = 0;
        triggerHaptic("success");
        return;
      }

      if (serverPhase === "waiting" || serverPhase === "countdown") {
        internalPhase = "countdown";
      }
    };

    const updateWorld = (deltaTime: number, now: number) => {
      const progression = progressRef.current;
      const speed = lerp(GAME.startSpeed, GAME.maxSpeed, progression);

      for (const cloud of clouds) {
        cloud.x -= cloud.speed * deltaTime;

        if (cloud.x < -100 * cloud.scale) {
          cloud.x = viewport.width + 100 * cloud.scale;
          cloud.y = 90 + random() * Math.max(120, viewport.height * 0.58);
        }
      }

      if (internalPhase === "playing") {
        bird.vy += GAME.gravity * deltaTime;
        bird.y += bird.vy * deltaTime;
        bird.rotation = lerp(
          bird.rotation,
          clamp(bird.vy / 720, -0.48, 1.08),
          Math.min(1, deltaTime * 10),
        );
        bird.wing = Math.max(0, bird.wing - deltaTime * 4.6);

        for (const gate of gates) {
          gate.x -= speed * deltaTime;
        }

        ensureGates(progression);

        while (gates.length && gates[0].x + gates[0].width < -20) {
          gates.shift();
        }

        if (
          bird.y - bird.radius < 82 ||
          bird.y + bird.radius > viewport.height - 28
        ) {
          handleCrash(now);
          bird.y = clamp(bird.y, 100, viewport.height - 48);
        }

        for (const gate of gates) {
          const gapY = currentGapY(gate, now);
          const halfGap = gate.gapSize * 0.5;
          const overlapsX =
            bird.x + bird.radius > gate.x &&
            bird.x - bird.radius < gate.x + gate.width;
          const safeY =
            bird.y - bird.radius > gapY - halfGap &&
            bird.y + bird.radius < gapY + halfGap;

          if (overlapsX && !safeY) {
            handleCrash(now);
          }

          const coinX = gate.x + gate.width * 0.5;
          const coinY = gapY + gate.coinOffset;

          if (
            !gate.coinTaken &&
            Math.hypot(bird.x - coinX, bird.y - coinY) < bird.radius + 10
          ) {
            collectCoin(gate, coinY);
          }

          if (!gate.passed && gate.x + gate.width < bird.x - bird.radius) {
            gate.passed = true;
            scoreGate(gate, now);
          }
        }
      } else if (internalPhase === "countdown") {
        bird.y = viewport.height * 0.5 + Math.sin(now * 0.005) * 8;
        bird.rotation = Math.sin(now * 0.004) * 0.08;
        bird.wing = 0.5 + Math.sin(now * 0.014) * 0.5;
      }

      flash *= Math.pow(0.012, deltaTime);
      cameraShake *= Math.pow(0.025, deltaTime);

      for (const particle of particles) {
        particle.vy += particle.gravity * deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.vx *= Math.pow(0.965, deltaTime * 60);
        particle.life -= deltaTime;
      }

      for (const text of texts) {
        text.y -= 32 * deltaTime;
        text.life -= deltaTime * 0.9;
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        if (particles[index].life <= 0) particles.splice(index, 1);
      }

      for (let index = texts.length - 1; index >= 0; index -= 1) {
        if (texts[index].life <= 0) texts.splice(index, 1);
      }
    };

    const drawCloud = (cloud: Cloud) => {
      context.save();
      context.globalAlpha = cloud.alpha;
      context.fillStyle = "#dffcff";

      context.beginPath();
      context.arc(cloud.x, cloud.y, 22 * cloud.scale, 0, Math.PI * 2);
      context.arc(
        cloud.x + 24 * cloud.scale,
        cloud.y - 8 * cloud.scale,
        29 * cloud.scale,
        0,
        Math.PI * 2,
      );
      context.arc(
        cloud.x + 55 * cloud.scale,
        cloud.y,
        21 * cloud.scale,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    };

    const drawBackground = () => {
      const glow = context.createRadialGradient(
        viewport.width * 0.72,
        viewport.height * 0.16,
        4,
        viewport.width * 0.72,
        viewport.height * 0.16,
        viewport.width * 0.64,
      );
      glow.addColorStop(0, "rgba(82,255,229,0.16)");
      glow.addColorStop(1, "rgba(82,255,229,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, viewport.width, viewport.height);

      for (const cloud of clouds) drawCloud(cloud);

      const floorGradient = context.createLinearGradient(
        0,
        viewport.height - 44,
        0,
        viewport.height,
      );
      floorGradient.addColorStop(0, "rgba(9,28,33,0)");
      floorGradient.addColorStop(1, "rgba(2,10,14,0.48)");
      context.fillStyle = floorGradient;
      context.fillRect(0, viewport.height - 86, viewport.width, 86);
    };

    const drawGatePillar = (
      x: number,
      y: number,
      width: number,
      height: number,
      capAtBottom: boolean,
    ) => {
      if (height <= 0) return;

      context.save();

      const gradient = context.createLinearGradient(x, 0, x + width, 0);
      gradient.addColorStop(0, "#0b7068");
      gradient.addColorStop(0.32, "#3ad6bd");
      gradient.addColorStop(0.72, "#168d83");
      gradient.addColorStop(1, "#064a49");
      context.fillStyle = gradient;
      context.shadowBlur = 13;
      context.shadowColor = "rgba(82,255,229,0.2)";

      roundedRect(x, y, width, height, 12);
      context.fill();
      context.shadowBlur = 0;

      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.lineWidth = 1.2;
      roundedRect(x + 1, y + 1, width - 2, height - 2, 11);
      context.stroke();

      const capHeight = 18;
      const capY = capAtBottom ? y + height - capHeight : y;
      const capGradient = context.createLinearGradient(
        x - 5,
        capY,
        x + width + 5,
        capY,
      );
      capGradient.addColorStop(0, "#075954");
      capGradient.addColorStop(0.35, "#5af4d7");
      capGradient.addColorStop(1, "#0d6a64");
      context.fillStyle = capGradient;
      roundedRect(x - 6, capY, width + 12, capHeight, 7);
      context.fill();

      context.restore();
    };

    const drawCoin = (x: number, y: number, time: number) => {
      const pulse = 1 + Math.sin(time * 0.009) * 0.08;

      context.save();
      context.translate(x, y);
      context.scale(pulse, pulse);
      context.rotate(time * 0.0018);
      context.shadowBlur = 18;
      context.shadowColor = "rgba(242,199,102,0.72)";

      const gradient = context.createRadialGradient(-3, -4, 1, 0, 0, 12);
      gradient.addColorStop(0, "#fff7bd");
      gradient.addColorStop(0.45, "#f8cb58");
      gradient.addColorStop(1, "#b87520");
      context.fillStyle = gradient;

      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const radius = point % 2 === 0 ? 10 : 4.6;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.restore();
    };

    const drawGates = (now: number) => {
      for (const gate of gates) {
        const gapY = currentGapY(gate, now);
        const halfGap = gate.gapSize * 0.5;
        const topHeight = gapY - halfGap;
        const bottomY = gapY + halfGap;

        drawGatePillar(gate.x, 74, gate.width, topHeight - 74, true);
        drawGatePillar(
          gate.x,
          bottomY,
          gate.width,
          viewport.height - bottomY + 20,
          false,
        );

        if (!gate.coinTaken) {
          drawCoin(gate.x + gate.width * 0.5, gapY + gate.coinOffset, now);
        }

        if (!gate.passed) {
          context.save();
          context.strokeStyle = "rgba(82,255,229,0.1)";
          context.lineWidth = 1;
          context.setLineDash([3, 7]);
          context.beginPath();
          context.moveTo(gate.x + gate.width * 0.5, gapY - halfGap + 12);
          context.lineTo(gate.x + gate.width * 0.5, gapY + halfGap - 12);
          context.stroke();
          context.restore();
        }
      }
    };

    const drawBird = (now: number) => {
      const invulnerable = now < invulnerableUntil;
      const blink = invulnerable && Math.floor(now / 70) % 2 === 0;

      if (blink) return;

      context.save();
      context.translate(bird.x, bird.y);
      context.rotate(bird.rotation);

      const fireCombo = internalCombo >= 8;
      const outerGlow = context.createRadialGradient(
        0,
        0,
        bird.radius * 0.25,
        0,
        0,
        bird.radius * 2.4,
      );
      outerGlow.addColorStop(
        0,
        fireCombo ? "rgba(255,164,52,0.34)" : "rgba(82,255,229,0.22)",
      );
      outerGlow.addColorStop(1, "rgba(82,255,229,0)");
      context.fillStyle = outerGlow;
      context.beginPath();
      context.arc(0, 0, bird.radius * 2.4, 0, Math.PI * 2);
      context.fill();

      const bodyGradient = context.createRadialGradient(-6, -7, 2, 2, 3, 25);
      bodyGradient.addColorStop(0, "#f0ffff");
      bodyGradient.addColorStop(0.28, "#62ffe7");
      bodyGradient.addColorStop(0.72, "#18a99e");
      bodyGradient.addColorStop(1, "#075e60");
      context.fillStyle = bodyGradient;
      context.shadowBlur = 13;
      context.shadowColor = "rgba(82,255,229,0.5)";
      context.beginPath();
      context.ellipse(0, 0, 21, 15.5, 0, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;

      const wingLift = bird.wing * 8 + Math.sin(now * 0.02) * 2;
      context.fillStyle = fireCombo ? "#ff9f43" : "#32c9bd";
      context.beginPath();
      context.ellipse(-7, 7 - wingLift * 0.35, 12, 6, -0.5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#ffcc67";
      context.beginPath();
      context.moveTo(17, -3);
      context.lineTo(28, 1);
      context.lineTo(17, 6);
      context.closePath();
      context.fill();

      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(8, -5, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#10212a";
      context.beginPath();
      context.arc(10, -5, 2.2, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(255,255,255,0.55)";
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(0, 0, 19.5, 14, 0, 0, Math.PI * 2);
      context.stroke();

      context.restore();
    };

    const drawEffects = () => {
      context.save();
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.globalAlpha = alpha;
        context.fillStyle = `hsl(${particle.hue},100%,67%)`;
        context.shadowBlur = 8;
        context.shadowColor = `hsla(${particle.hue},100%,58%,0.8)`;
        context.beginPath();
        context.arc(
          particle.x,
          particle.y,
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
        const scale = text.scale * (0.92 + (1 - alpha) * 0.16);

        context.save();
        context.translate(text.x, text.y);
        context.scale(scale, scale);
        context.globalAlpha = alpha;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "900 11px Supercell, system-ui, sans-serif";
        context.fillStyle = `hsl(${text.hue},100%,72%)`;
        context.shadowBlur = 12;
        context.shadowColor = `hsla(${text.hue},100%,58%,0.85)`;
        context.fillText(text.text, 0, 0);
        context.restore();
      }

      if (flash > 0.01) {
        context.fillStyle = `rgba(255,55,88,${flash * 0.09})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }
    };

    const render = (now: number) => {
      context.clearRect(0, 0, viewport.width, viewport.height);

      const shakeX = cameraShake > 0.1 ? (random() - 0.5) * cameraShake : 0;
      const shakeY = cameraShake > 0.1 ? (random() - 0.5) * cameraShake : 0;

      context.save();
      context.translate(shakeX, shakeY);
      drawBackground();
      drawGates(now);
      drawBird(now);
      drawEffects();
      context.restore();
    };

    const frame = (now: number) => {
      const deltaTime = Math.max(0, Math.min(34, now - previousFrameAt) / 1000);
      previousFrameAt = now;

      updateMatchClock();
      updateWorld(deltaTime, now);
      render(now);

      animationRef.current = window.requestAnimationFrame(frame);
    };

    resize();
    previousFrameAt = performance.now();

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }

      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
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
                <span className="text-[20px] font-black leading-none tabular-nums text-[#52FFE5]">
                  {score}
                </span>
                <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/30">
                  x{Math.max(1, multiplier)} · {combo}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div
              className={[
                "font-black tabular-nums",
                phase === "countdown"
                  ? "text-[26px] leading-none text-white"
                  : "text-[22px] leading-none text-white",
              ].join(" ")}
            >
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
            {status} · best combo {bestCombo}
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
            <div className="text-[58px] font-black leading-none text-white drop-shadow-[0_10px_30px_rgba(82,255,229,0.35)]">
              {countdown}
            </div>
            <div className="mt-3 text-[9px] font-black uppercase tracking-[0.22em] text-white/48">
              tap to fly
            </div>
          </div>
        </div>
      )}

      {showHint && phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center px-4">
          <div className="animate-pulse rounded-full border border-white/[0.09] bg-black/30 px-4 py-2 text-[9px] font-black uppercase tracking-[0.17em] text-white/55 backdrop-blur-md">
            Нажимай, чтобы держаться в воздухе
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 px-5 backdrop-blur-[3px]">
          <div className="w-full max-w-[310px] rounded-[28px] border border-white/12 bg-[#0b1720]/96 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-[#52FFE5]/55">
              Flappy Race
            </div>
            <div className="mt-3 text-[28px] font-black leading-none text-white">
              {score}
            </div>
            <div className="mt-2 text-[8px] font-black uppercase tracking-[0.16em] text-white/35">
              {match.draw
                ? "ничья"
                : match.winnerUserId === match.myUserId
                  ? "победа"
                  : "поражение"} · best combo {bestCombo}
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

export default FlappyRaceGame;