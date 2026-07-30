import { useEffect, useMemo, useRef, useState } from "react";
import { useArcadeRaceOnline } from "../hooks/useArcadeRaceOnline";
import car1 from "../assets/games/crossy/car1.webp";
import car2 from "../assets/games/crossy/car2.webp";
import car3 from "../assets/games/crossy/car3.webp";
import car4 from "../assets/games/crossy/car4.webp";
import car5 from "../assets/games/crossy/car5.webp";
import coin1 from "../assets/games/crossy/coin1.webp";
import log1Sprite from "../assets/games/crossy/log1.webp";
import log2Sprite from "../assets/games/crossy/log2.webp";
import pers from "../assets/games/crossy/pers.webp";
import trainSprite from "../assets/games/crossy/train.webp";
import treeSprite from "../assets/games/crossy/tree.webp";
import coinIcon from "../assets/solo/scratch/icon-coin.webp";

type MatchPhase = "countdown" | "playing" | "finished";
type RowKind = "grass" | "road" | "rail" | "water";
type Direction = -1 | 1;
type Facing = "up" | "down" | "left" | "right";

type Player = {
  x: number;
  row: number;
  fromX: number;
  fromRow: number;
  targetX: number;
  targetRow: number;
  moveStartedAt: number;
  moveDuration: number;
  facing: Facing;
  squash: number;
  invulnerableUntil: number;
  movementLockedUntil: number;
};

type VehicleSpriteKey = "car1" | "car2" | "car3" | "car4" | "car5";

type Vehicle = {
  id: number;
  x: number;
  width: number;
  height: number;
  speed: number;
  direction: Direction;
  spriteKey: VehicleSpriteKey;
};

type Log = {
  id: number;
  x: number;
  width: number;
  speed: number;
  direction: Direction;
  cells: 1 | 2;
  spriteKey: "log1" | "log2";
};

type Row = {
  index: number;
  kind: RowKind;
  direction: Direction;
  speed: number;
  vehicles: Vehicle[];
  logs: Log[];
  laneLoopLength: number;
  trees: number[];
  coinColumn: number | null;
  coinTaken: boolean;
  trainX: number;
  trainWidth: number;
  warning: boolean;
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

const WORLD = {
  columns: 7,
  baseTile: 54,
  moveDurationMs: 124,
  visibleRows: 12,
  checkpointEvery: 5,
  rowPoints: 8,
  coinPoints: 22,
  deathPenalty: 24,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const easeInOutCubic = (value: number) =>
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
const getInitials = (value: string) =>
  value.replace("@", "").trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join("") || "TG";

const createRandom = (initialSeed: number) => {
  let seed = Math.max(1, Math.floor(initialSeed) % 2_147_483_647);
  return () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };
};

const triggerHaptic = (type: "light" | "medium" | "success" | "error") => {
  const feedback = (window as typeof window & {
    Telegram?: { WebApp?: { HapticFeedback?: {
      impactOccurred?: (style: "light" | "medium") => void;
      notificationOccurred?: (kind: "success" | "error") => void;
    } } };
  }).Telegram?.WebApp?.HapticFeedback;

  if (type === "success" || type === "error") {
    feedback?.notificationOccurred?.(type);
  } else {
    feedback?.impactOccurred?.(type);
  }
};

const PlayerAvatar = ({ photoUrl, name, side }: {
  photoUrl?: string;
  name: string;
  side: "player" | "opponent";
}) => (
  <div className={[
    "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]",
    side === "player"
      ? "border-[#F7C85F]/48 bg-[#F7C85F]/12"
      : "border-[#FF7A90]/42 bg-[#FF7A90]/10",
  ].join(" ")}>
    {photoUrl ? (
      <img src={photoUrl} alt={name} className="h-full w-full object-cover" draggable={false} />
    ) : getInitials(name)}
  </div>
);

export const CrossyRoadGame = () => {
  const match = useArcadeRaceOnline("crossy_pvp");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const [bestRow, setBestRow] = useState(0);
  const [status, setStatus] = useState("GET READY");
  const [showHint, setShowHint] = useState(true);

  const playerName = match.playerProfile.name;
  const opponentName = match.opponentProfile.name;
  const score = match.myScore;
  const opponentScore = match.opponentScore;
  const coins = match.myCombo;
  const displayRow = Math.max(bestRow, match.myHeightScore);
  const phase: MatchPhase =
    match.phase === "match_over"
      ? "finished"
      : match.phase === "playing"
        ? "playing"
        : "countdown";
  const countdown = Math.max(1, match.countdownLeft || 3);
  const timeLeft = match.matchTimeLeft;
  const multiplier = useMemo(
    () => Math.min(5, 1 + Math.floor(Math.max(0, displayRow - 1) / 12)),
    [displayRow],
  );

  const isDraw = match.draw;
  const didWin = !isDraw && match.winnerUserId === match.myUserId;
  const winnerIsPlayer = didWin;
  const winnerProfile = winnerIsPlayer ? match.playerProfile : match.opponentProfile;
  const loserProfile = winnerIsPlayer ? match.opponentProfile : match.playerProfile;
  const winnerScore = winnerIsPlayer ? score : opponentScore;
  const loserScore = winnerIsPlayer ? opponentScore : score;
  const displayedReward = didWin
    ? Math.max(0, match.serverState?.winner_profit ?? 0)
    : 0;
  const formatReward = (value: number) =>
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    setBestRow(0);
    setStatus(match.phase === "waiting" ? "WAITING" : "GET READY");
    setShowHint(true);

    const random = createRandom(match.seed);
    const fxRandom = createRandom(match.seed + 91_973);
    const viewport = {
      width: 1,
      height: 480,
      dpr: 1,
      scale: 1,
      tile: WORLD.baseTile,
      rowHeight: WORLD.baseTile,
      boardWidth: WORLD.columns * WORLD.baseTile,
      boardLeft: 0,
    };

    const player: Player = {
      x: 3,
      row: 0,
      fromX: 3,
      fromRow: 0,
      targetX: 3,
      targetRow: 0,
      moveStartedAt: 0,
      moveDuration: WORLD.moveDurationMs,
      facing: "up",
      squash: 0,
      invulnerableUntil: 0,
      movementLockedUntil: 0,
    };

    const rows = new Map<number, Row>();
    const particles: Particle[] = [];
    const texts: FloatingText[] = [];

    let internalBestRow = 0;
    let cameraRow = -3.2;
    let targetCameraRow = -3.2;
    let checkpointRow = 0;
    let checkpointX = 3;
    let previousFrameAt = performance.now();
    let nextObjectId = 1;
    let pointerStart: { x: number; y: number } | null = null;
    const pendingMoves: Array<{ dx: number; dRow: number; facing: Facing }> = [];
    let lastMoveAt = 0;
    let flash = 0;
    let cameraShake = 0;
    let initialized = false;

    const spriteImages = {
      car1: new Image(),
      car2: new Image(),
      car3: new Image(),
      car4: new Image(),
      car5: new Image(),
      coin1: new Image(),
      log1: new Image(),
      log2: new Image(),
      pers: new Image(),
      train: new Image(),
      tree: new Image(),
    };

    spriteImages.car1.src = car1;
    spriteImages.car2.src = car2;
    spriteImages.car3.src = car3;
    spriteImages.car4.src = car4;
    spriteImages.car5.src = car5;
    spriteImages.coin1.src = coin1;
    spriteImages.log1.src = log1Sprite;
    spriteImages.log2.src = log2Sprite;
    spriteImages.pers.src = pers;
    spriteImages.train.src = trainSprite;
    spriteImages.tree.src = treeSprite;

    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      const r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + width - r, y);
      context.quadraticCurveTo(x + width, y, x + width, y + r);
      context.lineTo(x + width, y + height - r);
      context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      context.lineTo(x + r, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    };

    const drawSprite = (
      image: HTMLImageElement,
      x: number,
      y: number,
      width: number,
      height: number,
      flipX = false,
    ) => {
      if (!image.complete || image.naturalWidth === 0) return false;

      context.save();

      if (flipX) {
        context.translate(x + width / 2, y + height / 2);
        context.scale(-1, 1);
        context.drawImage(image, -width / 2, -height / 2, width, height);
      } else {
        context.drawImage(image, x, y, width, height);
      }

      context.restore();
      return true;
    };

    const columnCenterX = (column: number) =>
      viewport.boardLeft + column * viewport.tile + viewport.tile / 2;
    const rowScreenY = (rowIndex: number) =>
      viewport.height * 0.72 - (rowIndex - cameraRow) * viewport.rowHeight;

    const addParticles = (x: number, y: number, hue: number, count: number, strength = 1) => {
      for (let index = 0; index < count; index += 1) {
        const angle = fxRandom() * Math.PI * 2;
        const speed = (40 + fxRandom() * 150) * strength;
        const life = 0.34 + fxRandom() * 0.46;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 1.4 + fxRandom() * 3.2,
          hue: hue + (fxRandom() - 0.5) * 24,
        });
      }
    };

    const addText = (text: string, x: number, y: number, hue: number, scale = 1) => {
      texts.push({ x, y, text, life: 1, hue, scale });
      setStatus(text);
    };

    const chooseRowKind = (index: number): RowKind => {
      if (index <= 1 || index % WORLD.checkpointEvery === 0) return "grass";
      const difficulty = clamp(index / 80, 0, 1);
      const value = random();
      const rail = lerp(0.07, 0.13, difficulty);
      const water = lerp(0.16, 0.25, difficulty);
      const grass = lerp(0.31, 0.22, difficulty);
      if (value < rail) return "rail";
      if (value < rail + water) return "water";
      if (value < rail + water + grass) return "grass";
      return "road";
    };

    const makeVehicles = (
      direction: Direction,
      speed: number,
    ) => {
      const boardWidth = WORLD.columns * WORLD.baseTile;
      const offscreenMargin = WORLD.baseTile * 1.6;
      const laneSpeed = speed * (0.94 + random() * 0.12);

      const definitions: Array<{
        key: VehicleSpriteKey;
        width: number;
        height: number;
      }> = [
        { key: "car1", width: WORLD.baseTile * 0.95, height: WORLD.baseTile * 0.72 },
        { key: "car2", width: WORLD.baseTile * 1.02, height: WORLD.baseTile * 0.74 },
        { key: "car3", width: WORLD.baseTile * 1.08, height: WORLD.baseTile * 0.76 },
        { key: "car4", width: WORLD.baseTile * 1.18, height: WORLD.baseTile * 0.78 },
        { key: "car5", width: WORLD.baseTile * 1.32, height: WORLD.baseTile * 0.82 },
      ];

      const styleRoll = random();
      const count = styleRoll < 0.22 ? 2 : styleRoll < 0.78 ? 3 : 4;

      const items = Array.from({ length: count }, () => {
        const definition = definitions[Math.floor(random() * definitions.length)];
        return { ...definition };
      });

      const gaps = items.map(() => {
        if (styleRoll < 0.22) return WORLD.baseTile * lerp(1.5, 3.1, random());
        if (styleRoll < 0.78) return WORLD.baseTile * lerp(0.82, 2.05, random());
        return WORLD.baseTile * lerp(0.55, 1.28, random());
      });

      if (random() < 0.42) {
        const largeGapIndex = Math.floor(random() * gaps.length);
        gaps[largeGapIndex] += WORLD.baseTile * lerp(0.9, 2.3, random());
      }

      const maxWidth = Math.max(...items.map((item) => item.width));
      let loopLength = items.reduce(
        (sum, item, index) => sum + item.width + gaps[index],
        0,
      );

      const minimumLoopLength =
        boardWidth +
        offscreenMargin * 2 +
        maxWidth +
        WORLD.baseTile;

      if (loopLength < minimumLoopLength) {
        let missing = minimumLoopLength - loopLength;

        while (missing > 0.01) {
          const gapIndex = Math.floor(random() * gaps.length);
          const addition = Math.min(
            missing,
            WORLD.baseTile * lerp(0.35, 1.05, random()),
          );

          gaps[gapIndex] += addition;
          missing -= addition;
        }

        loopLength = items.reduce(
          (sum, item, index) => sum + item.width + gaps[index],
          0,
        );
      }

      const phase = random() * loopLength;
      let offset = 0;

      const vehicles = items.map((item, index) => {
        let x =
          direction > 0
            ? offset - phase
            : boardWidth - (offset - phase) - item.width;

        while (x > boardWidth + offscreenMargin) x -= loopLength;
        while (x + item.width < -offscreenMargin) x += loopLength;

        const vehicle: Vehicle = {
          id: nextObjectId++,
          x,
          width: item.width,
          height: item.height,
          speed: laneSpeed,
          direction,
          spriteKey: item.key,
        };

        offset += item.width + gaps[index];
        return vehicle;
      });

      return { vehicles, loopLength };
    };

    const makeLogs = (
      direction: Direction,
      speed: number,
    ) => {
      const boardWidth = WORLD.columns * WORLD.baseTile;
      const offscreenMargin = WORLD.baseTile * 1.6;
      const laneSpeed = Math.min(92, speed * (0.88 + random() * 0.1));

      const styleRoll = random();
      const count = styleRoll < 0.08 ? 2 : styleRoll < 0.7 ? 3 : 4;
      const cellsList = Array.from(
        { length: count },
        () => (random() < 0.56 ? 1 : 2) as 1 | 2,
      );
      const widths = cellsList.map((cells) => WORLD.baseTile * cells);

      const gaps = widths.map(() => {
        if (styleRoll < 0.08) return WORLD.baseTile * lerp(0.72, 1.22, random());
        if (styleRoll < 0.7) return WORLD.baseTile * lerp(0.34, 0.88, random());
        return WORLD.baseTile * lerp(0.24, 0.64, random());
      });

      // На воде не создаём огромные случайные разрывы: даже серия из двух
      // или трёх речных рядов должна оставаться проходимой без ожидания удачи.

      const maxWidth = Math.max(...widths);
      let loopLength = widths.reduce(
        (sum, width, index) => sum + width + gaps[index],
        0,
      );

      const minimumLoopLength =
        boardWidth +
        offscreenMargin * 2 +
        maxWidth +
        WORLD.baseTile * 0.7;

      if (loopLength < minimumLoopLength) {
        let missing = minimumLoopLength - loopLength;

        while (missing > 0.01) {
          const gapIndex = Math.floor(random() * gaps.length);
          const addition = Math.min(
            missing,
            WORLD.baseTile * lerp(0.3, 0.9, random()),
          );

          gaps[gapIndex] += addition;
          missing -= addition;
        }

        loopLength = widths.reduce(
          (sum, width, index) => sum + width + gaps[index],
          0,
        );
      }

      const phase = random() * loopLength;
      let offset = 0;

      const logs = widths.map((width, index) => {
        const cells = cellsList[index];
        let x =
          direction > 0
            ? offset - phase
            : boardWidth - (offset - phase) - width;

        while (x > boardWidth + offscreenMargin) x -= loopLength;
        while (x + width < -offscreenMargin) x += loopLength;

        const log: Log = {
          id: nextObjectId++,
          x,
          width,
          speed: laneSpeed,
          direction,
          cells,
          spriteKey: cells === 1 ? "log1" : "log2",
        };

        offset += width + gaps[index];
        return log;
      });

      return { logs, loopLength };
    };

    const generateRow = (index: number) => {
      const existing = rows.get(index);
      if (existing) return existing;

      let kind = chooseRowKind(index);
      const previousRow = rows.get(index - 1);
      const rowBeforePrevious = rows.get(index - 2);
      if (
        kind === "water" &&
        previousRow?.kind === "water" &&
        rowBeforePrevious?.kind === "water"
      ) {
        kind = "grass";
      }
      const direction: Direction = random() > 0.5 ? 1 : -1;
      const difficulty = clamp(index / 70, 0, 1);
      const speed = kind === "rail"
        ? lerp(500, 760, difficulty)
        : kind === "water"
          ? lerp(52, 90, difficulty)
          : lerp(112, 232, difficulty);

      let trees: number[] = [];
      if (kind === "grass" && index > 1) {
        for (let column = 0; column < WORLD.columns; column += 1) {
          if (random() < 0.22 && column !== 3) trees.push(column);
        }
      }

      const coinColumn = index > 0 && random() < 0.3
        ? Math.floor(random() * WORLD.columns)
        : null;
      if (coinColumn !== null) trees = trees.filter((column) => column !== coinColumn);

      const vehicleLane =
        kind === "road"
          ? makeVehicles(direction, speed)
          : { vehicles: [] as Vehicle[], loopLength: 0 };

      const logLane =
        kind === "water"
          ? makeLogs(direction, speed)
          : { logs: [] as Log[], loopLength: 0 };

      const row: Row = {
        index,
        kind,
        direction,
        speed,
        vehicles: vehicleLane.vehicles,
        logs: logLane.logs,
        laneLoopLength:
          kind === "road"
            ? vehicleLane.loopLength
            : kind === "water"
              ? logLane.loopLength
              : 0,
        trees,
        coinColumn,
        coinTaken: false,
        trainX: direction > 0 ? -WORLD.baseTile * 6 : WORLD.columns * WORLD.baseTile,
        trainWidth: WORLD.baseTile * lerp(4.4, 6.1, random()),
        warning: false,
      };
      rows.set(index, row);
      return row;
    };

    const ensureRows = () => {
      const minRow = Math.floor(cameraRow) - 4;
      const maxRow = Math.ceil(cameraRow) + WORLD.visibleRows + 7;
      for (let row = minRow; row <= maxRow; row += 1) generateRow(row);
      for (const row of [...rows.keys()]) {
        if (row < minRow - 5 || row > maxRow + 5) rows.delete(row);
      }
    };

    const initialize = () => {
      rows.clear();
      particles.length = 0;
      texts.length = 0;
      nextObjectId = 1;

      Object.assign(player, {
        x: 3, row: 0, fromX: 3, fromRow: 0, targetX: 3, targetRow: 0,
        moveStartedAt: 0, facing: "up", squash: 0, invulnerableUntil: 0,
        movementLockedUntil: 0,
      });
      cameraRow = -3.2;
      targetCameraRow = -3.2;
      checkpointRow = 0;
      checkpointX = 3;
      internalBestRow = 0;
      ensureRows();
      initialized = true;
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      viewport.width = Math.max(1, bounds.width);
      viewport.height = Math.max(480, bounds.height);
      viewport.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      viewport.tile = viewport.width / WORLD.columns;
      viewport.scale = viewport.tile / WORLD.baseTile;
      viewport.rowHeight = viewport.tile;
      viewport.boardWidth = viewport.width;
      viewport.boardLeft = 0;

      canvas.width = Math.round(viewport.width * viewport.dpr);
      canvas.height = Math.round(viewport.height * viewport.dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      if (!initialized) initialize();
    };

    const renderedPlayer = (now: number) => {
      const progress = clamp((now - player.moveStartedAt) / player.moveDuration, 0, 1);
      const eased = easeInOutCubic(progress);
      const x = lerp(player.fromX, player.targetX, eased);
      const row = lerp(player.fromRow, player.targetRow, eased);
      if (progress >= 1) {
        player.x = player.targetX;
        player.row = player.targetRow;
      }
      return { x, row, progress };
    };

    const isMoving = (now: number) => now - player.moveStartedAt < player.moveDuration;
    const occupiedByTree = (row: number, column: number) =>
      generateRow(row).kind === "grass" && generateRow(row).trees.includes(column);

    const requestMove = (dx: number, dRow: number, now: number, facing: Facing) => {
      if (
        match.phaseRef.current !== "playing" ||
        now < player.movementLockedUntil
      ) return;

      if (isMoving(now)) {
        const previous = pendingMoves[pendingMoves.length - 1];
        if (
          pendingMoves.length < 2 &&
          (!previous || previous.dx !== dx || previous.dRow !== dRow)
        ) {
          pendingMoves.push({ dx, dRow, facing });
        }
        return;
      }

      // Синхронизируем логическую позицию с последним отрисованным кадром.
      // Это убирает телепортацию, когда следующий свайп приходит ровно между
      // завершением анимации и следующим requestAnimationFrame.
      const current = renderedPlayer(now);
      player.x = current.x;
      player.row = current.row;

      if (now - lastMoveAt < 54) return;
      const snappedColumn = clamp(Math.round(player.targetX), 0, WORLD.columns - 1);
      const nextX = clamp(snappedColumn + dx, 0, WORLD.columns - 1);
      const nextRow = Math.max(0, Math.round(player.targetRow) + dRow);

      if (occupiedByTree(nextRow, nextX)) {
        player.squash = 0.35;
        triggerHaptic("light");
        return;
      }

      player.fromX = player.x;
      player.fromRow = player.row;
      player.targetX = nextX;
      player.targetRow = nextRow;
      player.moveStartedAt = now;
      player.facing = facing;
      player.squash = 0.72;
      lastMoveAt = now;
      setShowHint(false);

      if (nextRow > internalBestRow) {
        const gained = (nextRow - internalBestRow) * WORLD.rowPoints;
        internalBestRow = nextRow;
        setBestRow(internalBestRow);
        match.sendEvent({ kind: "row", value: nextRow });

        if (nextRow % WORLD.checkpointEvery === 0) {
          checkpointRow = nextRow;
          checkpointX = nextX;
          addText("CHECKPOINT", columnCenterX(nextX), rowScreenY(nextRow) - 34, 48, 1);
          triggerHaptic("success");
        } else {
          addText(`+${gained}`, columnCenterX(nextX), rowScreenY(nextRow) - 30, 52, 0.85);
          triggerHaptic("light");
        }
      }
      targetCameraRow = Math.max(targetCameraRow, nextRow - 3.4);
    };

    const collectCoin = (row: Row) => {
      if (row.coinTaken || row.coinColumn === null) return;
      row.coinTaken = true;
      const objectId = (row.index + 1) * 100 + row.coinColumn + 1;
      match.sendEvent({
        kind: "coin",
        objectId,
        value: row.index,
      });
      addText(`COIN +${WORLD.coinPoints}`, columnCenterX(row.coinColumn), rowScreenY(row.index) - 28, 48, 1);
      addParticles(columnCenterX(row.coinColumn), rowScreenY(row.index), 48, 18, 0.8);
      triggerHaptic("success");
    };

    const respawn = (reason: string, now: number) => {
      if (now < player.invulnerableUntil) return;
      const respawnUnlockAt = now + 1_050;
      pointerStart = null;
      pendingMoves.length = 0;
      match.sendEvent({
        kind: "death",
        grade: reason.toLowerCase(),
      });
      Object.assign(player, {
        x: checkpointX,
        row: checkpointRow,
        fromX: checkpointX,
        fromRow: checkpointRow,
        targetX: checkpointX,
        targetRow: checkpointRow,
        moveStartedAt: now - player.moveDuration,
        squash: 0.85,
        invulnerableUntil: respawnUnlockAt,
        movementLockedUntil: respawnUnlockAt,
      });
      lastMoveAt = respawnUnlockAt;
      targetCameraRow = Math.max(-3.2, checkpointRow - 3.4);
      cameraRow = Math.max(-3.2, Math.min(cameraRow, targetCameraRow + 2));
      flash = 1;
      cameraShake = 9;
      addText(`${reason} -${WORLD.deathPenalty}`, columnCenterX(checkpointX), rowScreenY(checkpointRow) - 36, 350, 1);
      addParticles(columnCenterX(checkpointX), rowScreenY(checkpointRow), 350, 30, 1.2);
      triggerHaptic("error");
    };

    const updateRows = (deltaTime: number, now: number) => {
      const boardBaseWidth = WORLD.columns * WORLD.baseTile;
      const vehicleMargin = WORLD.baseTile * 1.45;
      const logMargin = WORLD.baseTile * 1.6;

      for (const row of rows.values()) {
        if (row.vehicles.length > 0 && row.laneLoopLength > 0) {
          for (const vehicle of row.vehicles) {
            vehicle.x += vehicle.speed * vehicle.direction * deltaTime;

            if (vehicle.direction > 0) {
              while (vehicle.x > boardBaseWidth + vehicleMargin) {
                vehicle.x -= row.laneLoopLength;
              }
            } else {
              while (vehicle.x + vehicle.width < -vehicleMargin) {
                vehicle.x += row.laneLoopLength;
              }
            }
          }
        }

        if (row.logs.length > 0 && row.laneLoopLength > 0) {
          for (const log of row.logs) {
            log.x += log.speed * log.direction * deltaTime;

            if (log.direction > 0) {
              while (log.x > boardBaseWidth + logMargin) {
                log.x -= row.laneLoopLength;
              }
            } else {
              while (log.x + log.width < -logMargin) {
                log.x += row.laneLoopLength;
              }
            }
          }
        }

        if (row.kind === "rail") {
          const cycleTime = (now + row.index * 731) % 4_200;
          row.warning = cycleTime > 2_200 && cycleTime < 3_100;
          const phase = clamp((cycleTime - 3_100) / 850, 0, 1.65);
          row.trainX = row.direction > 0
            ? -row.trainWidth + phase * (boardBaseWidth + row.trainWidth)
            : boardBaseWidth - phase * (boardBaseWidth + row.trainWidth);
        }
      }
    };

    const updatePlayer = (deltaTime: number, now: number) => {
      const rendered = renderedPlayer(now);
      player.squash *= Math.pow(0.045, deltaTime);
      if (now < player.movementLockedUntil || rendered.progress < 1) return;

      const row = generateRow(player.targetRow);
      const localX = player.targetX * WORLD.baseTile + WORLD.baseTile / 2;
      const half = WORLD.baseTile * 0.27;
      const landedColumn = clamp(Math.round(player.targetX), 0, WORLD.columns - 1);
      if (row.coinColumn === landedColumn && !row.coinTaken) collectCoin(row);

      if (row.kind === "road") {
        const hit = row.vehicles.some((vehicle) =>
          localX + half > vehicle.x && localX - half < vehicle.x + vehicle.width,
        );
        if (hit) return respawn("CRASH", now);
      }

      if (row.kind === "rail") {
        if (localX + half > row.trainX && localX - half < row.trainX + row.trainWidth) {
          return respawn("TRAIN", now);
        }
      }

      if (row.kind === "water") {
        const log = row.logs.find((item) =>
          localX >= item.x && localX <= item.x + item.width,
        );

        if (!log) return respawn("SPLASH", now);

        const tile = WORLD.baseTile;
        const anchorCenters =
          log.cells === 1
            ? [log.x + tile * 0.5]
            : [log.x + tile * 0.5, log.x + tile * 1.5];

        const nearestAnchor = anchorCenters.reduce(
          (best, current) =>
            Math.abs(current - localX) < Math.abs(best - localX)
              ? current
              : best,
          anchorCenters[0],
        );

        const anchoredColumn = (nearestAnchor - tile / 2) / tile;

        player.x = anchoredColumn;
        player.fromX = anchoredColumn;
        player.targetX = anchoredColumn;

        if (player.x < -0.55 || player.x > WORLD.columns - 0.45) {
          return respawn("SPLASH", now);
        }
      } else {
        const snapped = clamp(Math.round(player.targetX), 0, WORLD.columns - 1);
        player.x = snapped;
        player.fromX = snapped;
        player.targetX = snapped;
      }

      const nextMove = pendingMoves.shift();
      if (nextMove) {
        requestMove(nextMove.dx, nextMove.dRow, now + 1, nextMove.facing);
      }
    };

    const updateEffects = (deltaTime: number) => {
      flash *= Math.pow(0.012, deltaTime);
      cameraShake *= Math.pow(0.025, deltaTime);
      for (const particle of particles) {
        particle.vy += 180 * deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.vx *= Math.pow(0.97, deltaTime * 60);
        particle.life -= deltaTime;
      }
      for (const text of texts) {
        text.y -= 30 * deltaTime;
        text.life -= deltaTime * 0.88;
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        if (particles[index].life <= 0) particles.splice(index, 1);
      }
      for (let index = texts.length - 1; index >= 0; index -= 1) {
        if (texts[index].life <= 0) texts.splice(index, 1);
      }
    };

    const drawBackground = () => {
      const gradient = context.createLinearGradient(0, 0, 0, viewport.height);
      gradient.addColorStop(0, "#162946");
      gradient.addColorStop(0.48, "#173653");
      gradient.addColorStop(1, "#07151f");
      context.fillStyle = gradient;
      context.fillRect(0, 0, viewport.width, viewport.height);

      const glow = context.createRadialGradient(
        viewport.width * 0.5, viewport.height * 0.18, 8,
        viewport.width * 0.5, viewport.height * 0.18, viewport.width * 0.8,
      );
      glow.addColorStop(0, "rgba(82,255,229,0.12)");
      glow.addColorStop(1, "rgba(82,255,229,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, viewport.width, viewport.height);
    };

    const drawGrass = (row: Row, y: number, height: number) => {
      const checkpoint = row.index % WORLD.checkpointEvery === 0;
      const previousGrass = generateRow(row.index - 1).kind === "grass";
      const nextGrass = generateRow(row.index + 1).kind === "grass";
      const top = previousGrass ? y - 2 : y;
      const bottomExtra = nextGrass ? 3 : 0;

      context.fillStyle = checkpoint ? "#35aa62" : "#2f9d59";
      context.fillRect(0, top, viewport.width, height + bottomExtra + 2);

      const glow = context.createLinearGradient(0, top, 0, top + height);
      glow.addColorStop(0, "rgba(132,255,170,0.18)");
      glow.addColorStop(0.55, "rgba(76,210,122,0.08)");
      glow.addColorStop(1, "rgba(10,80,46,0.16)");
      context.fillStyle = glow;
      context.fillRect(0, top, viewport.width, height + bottomExtra + 2);

      context.fillStyle = "rgba(220,255,223,0.10)";
      for (let dot = 0; dot < 24; dot += 1) {
        const seed = (row.index * 37 + dot * 53) % 997;
        const x = ((seed * 71) % 1000) / 1000 * viewport.width;
        const yy = y + (((seed * 29) % 1000) / 1000) * height;
        context.beginPath();
        context.arc(x, yy, 0.7 + (seed % 3) * 0.35, 0, Math.PI * 2);
        context.fill();
      }

      if (checkpoint) {
        context.fillStyle = "rgba(255,231,115,0.16)";
        for (let column = 0; column < WORLD.columns; column += 2) {
          context.fillRect(column * viewport.tile, y + height * 0.43, viewport.tile, height * 0.15);
        }
      }

      for (const column of row.trees) {
        const treeWidth = viewport.tile * 1.16;
        const treeHeight = viewport.tile * 1;
        const treeX = columnCenterX(column) - treeWidth / 2;
        const treeY = y + height * 0.05;

        const drawn = drawSprite(
          spriteImages.tree,
          treeX,
          treeY,
          treeWidth,
          treeHeight,
        );

        if (!drawn) {
          context.fillStyle = "#70441f";
          roundedRect(
            treeX + treeWidth * 0.42,
            y + height * 0.48,
            treeWidth * 0.16,
            height * 0.3,
            3,
          );
          context.fill();
        }
      }
    };

    const drawRoad = (row: Row, y: number, height: number) => {
      const gradient = context.createLinearGradient(0, y, 0, y + height);
      gradient.addColorStop(0, "#30394a");
      gradient.addColorStop(1, "#161d29");
      context.fillStyle = gradient;
      context.fillRect(0, y - 1, viewport.width, height + 2);

      context.strokeStyle = "rgba(255,238,154,0.45)";
      context.lineWidth = 2;
      context.setLineDash([12, 14]);
      context.beginPath();
      context.moveTo(0, y + height / 2);
      context.lineTo(viewport.width, y + height / 2);
      context.stroke();
      context.setLineDash([]);

      for (const vehicle of row.vehicles) {
        const vehicleX = vehicle.x * viewport.scale;
        const vehicleWidth = vehicle.width * viewport.scale * 1.2;
        const vehicleHeight = vehicle.height * viewport.scale * 1.4;
        const vehicleY =
          y + (height - vehicleHeight) / 2 + viewport.tile * 0.015;

        const drawn = drawSprite(
          spriteImages[vehicle.spriteKey],
          vehicleX,
          vehicleY,
          vehicleWidth,
          vehicleHeight,
          vehicle.direction < 0,
        );

        if (!drawn) {
          context.fillStyle = "#4ea1ff";
          roundedRect(
            vehicleX,
            vehicleY,
            vehicleWidth,
            vehicleHeight,
            8,
          );
          context.fill();
        }
      }
    };

    const drawWater = (row: Row, y: number, height: number, now: number) => {
      const gradient = context.createLinearGradient(0, y, 0, y + height);
      gradient.addColorStop(0, "#2eb9db");
      gradient.addColorStop(0.5, "#148eb8");
      gradient.addColorStop(1, "#075477");
      context.fillStyle = gradient;
      context.fillRect(0, y - 1, viewport.width, height + 3);

      const shimmer = context.createLinearGradient(0, y, viewport.width, y + height);
      shimmer.addColorStop(0, "rgba(202,252,255,0.03)");
      shimmer.addColorStop(0.5, "rgba(202,252,255,0.16)");
      shimmer.addColorStop(1, "rgba(202,252,255,0.03)");
      context.fillStyle = shimmer;
      context.fillRect(0, y, viewport.width, height);

      for (let index = 0; index < 5; index += 1) {
        const waveY = y + 7 + index * (height / 5) + Math.sin(now * 0.0035 + row.index * 0.7 + index) * 2.5;
        context.strokeStyle = `rgba(190,249,255,${0.1 + index * 0.018})`;
        context.lineWidth = 1.2;
        context.beginPath();
        for (let x = -20; x <= viewport.width + 20; x += 16) {
          const yy = waveY + Math.sin(x * 0.035 + now * 0.004 + index) * 2.2;
          if (x === -20) context.moveTo(x, yy); else context.lineTo(x, yy);
        }
        context.stroke();
      }

      for (const log of row.logs) {
        const logX = log.x * viewport.scale;
        const logWidth = log.width * viewport.scale *1.1;
        const logHeight = viewport.tile * 0.68;
        const logY = y + (height - logHeight) / 2 + viewport.tile * 0.03;

        const drawn = drawSprite(
          spriteImages[log.spriteKey],
          logX,
          logY,
          logWidth,
          logHeight,
        );

        if (!drawn) {
          const body = context.createLinearGradient(
            logX,
            0,
            logX + logWidth,
            0,
          );
          body.addColorStop(0, "#6d3517");
          body.addColorStop(0.5, "#c17432");
          body.addColorStop(1, "#5c2b14");
          context.fillStyle = body;
          roundedRect(logX, logY, logWidth, logHeight, 11);
          context.fill();
        }
      }
    };

    const drawRail = (row: Row, y: number, height: number, now: number) => {
      context.fillStyle = "#4a463d";
      context.fillRect(0, y - 1, viewport.width, height + 2);
      context.fillStyle = "#23262d";
      context.fillRect(0, y + height * 0.22, viewport.width, 5);
      context.fillRect(0, y + height * 0.7, viewport.width, 5);
      context.fillStyle = "#776647";
      for (let x = 0; x < viewport.width; x += 24 * viewport.scale) {
        context.fillRect(x, y + height * 0.13, 7 * viewport.scale, height * 0.68);
      }
      if (row.warning) {
        const pulse = 0.45 + Math.sin(now * 0.025) * 0.35;
        context.fillStyle = `rgba(255,80,70,${pulse})`;
        context.beginPath();
        context.arc(17, y + height / 2, 8, 0, Math.PI * 2);
        context.arc(viewport.width - 17, y + height / 2, 8, 0, Math.PI * 2);
        context.fill();
      }
      const trainX = row.trainX * viewport.scale;
      const trainWidth = row.trainWidth * viewport.scale;
      const trainHeight = height * 1.7;
      if (trainX + trainWidth > 0 && trainX < viewport.width) {
        const trainY = y + (height - trainHeight) / 2;
        const drawn = drawSprite(
          spriteImages.train,
          trainX,
          trainY,
          trainWidth,
          trainHeight,
        );

        if (!drawn) {
          const body = context.createLinearGradient(
            trainX,
            0,
            trainX + trainWidth,
            0,
          );
          body.addColorStop(0, "#d9464e");
          body.addColorStop(0.45, "#ff7b48");
          body.addColorStop(1, "#9f2838");
          context.fillStyle = body;
          roundedRect(trainX, trainY, trainWidth, trainHeight, 10);
          context.fill();
        }
      }
    };

    const drawCoin = (row: Row, y: number, now: number) => {
      if (row.coinColumn === null || row.coinTaken) return;

      const x = columnCenterX(row.coinColumn);
      const pulse = 1 + Math.sin(now * 0.009 + row.index) * 0.08;
      const size = viewport.tile * 0.42 * pulse;
      const coinX = x - size / 2;
      const coinY = y + viewport.rowHeight * 0.48 - size / 2;

      const drawn = drawSprite(
        spriteImages.coin1,
        coinX,
        coinY,
        size,
        size,
      );

      if (!drawn) {
        context.fillStyle = "#ffd65e";
        context.beginPath();
        context.arc(x, coinY + size / 2, size / 2, 0, Math.PI * 2);
        context.fill();
      }
    };

    const drawRows = (now: number) => {
      const minRow = Math.floor(cameraRow) - 3;
      const maxRow = Math.ceil(cameraRow) + WORLD.visibleRows + 5;
      for (let rowIndex = maxRow; rowIndex >= minRow; rowIndex -= 1) {
        const row = generateRow(rowIndex);
        const y = rowScreenY(rowIndex);
        const height = viewport.rowHeight + 2;
        if (y > viewport.height + height || y < -height) continue;
        if (row.kind === "grass") drawGrass(row, y, height);
        if (row.kind === "road") drawRoad(row, y, height);
        if (row.kind === "water") drawWater(row, y, height, now);
        if (row.kind === "rail") drawRail(row, y, height, now);
        drawCoin(row, y, now);
      }
    };

    const drawPlayer = (now: number) => {
      const rendered = renderedPlayer(now);
      const x = columnCenterX(rendered.x);
      const baseY = rowScreenY(rendered.row) + viewport.rowHeight * 0.47;
      const y =
        baseY -
        Math.sin(rendered.progress * Math.PI) * 20 * viewport.scale;

      if (
        now < player.invulnerableUntil &&
        Math.floor(now / 75) % 2 === 0
      ) {
        return;
      }

      const jumpWave = Math.sin(rendered.progress * Math.PI);
      const directionTilt =
        player.facing === "left"
          ? -0.11
          : player.facing === "right"
            ? 0.11
            : player.facing === "down"
              ? 0.035
              : -0.025;
      const tilt = directionTilt * jumpWave;
      const landingStretch = Math.sin(rendered.progress * Math.PI * 2) * 0.025;

      context.save();
      context.translate(x, y);
      context.rotate(tilt);
      context.scale(
        1 + player.squash * 0.085 - landingStretch,
        1 - player.squash * 0.065 + landingStretch,
      );

      const spriteWidth = viewport.tile * 0.82;
      const spriteHeight = viewport.tile * 0.82;
      const drawn = drawSprite(
        spriteImages.pers,
        -spriteWidth / 2,
        -spriteHeight * 0.56,
        spriteWidth,
        spriteHeight,
      );

      if (!drawn) {
        const body = context.createRadialGradient(-7, -10, 2, 0, 0, 28);
        body.addColorStop(0, "#dfffea");
        body.addColorStop(0.45, "#80e7aa");
        body.addColorStop(1, "#2d9d65");
        context.fillStyle = body;
        roundedRect(-17, -21, 34, 42, 13);
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
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      context.globalAlpha = 1;
      for (const text of texts) {
        const alpha = clamp(text.life, 0, 1);
        context.save();
        context.translate(text.x, text.y);
        context.scale(text.scale, text.scale);
        context.globalAlpha = alpha;
        context.textAlign = "center";
        context.font = "900 10px Supercell, system-ui, sans-serif";
        context.fillStyle = `hsl(${text.hue},100%,72%)`;
        context.fillText(text.text, 0, 0);
        context.restore();
      }
      if (flash > 0.01) {
        context.fillStyle = `rgba(255,55,88,${flash * 0.1})`;
        context.fillRect(0, 0, viewport.width, viewport.height);
      }
    };

    const render = (now: number) => {
      context.clearRect(0, 0, viewport.width, viewport.height);
      const shakeX = cameraShake > 0.1 ? (fxRandom() - 0.5) * cameraShake : 0;
      const shakeY = cameraShake > 0.1 ? (fxRandom() - 0.5) * cameraShake : 0;
      context.save();
      context.translate(shakeX, shakeY);
      drawBackground();
      drawRows(now);
      drawPlayer(now);
      drawEffects();
      context.restore();
    };

    const moveFromGesture = (startX: number, startY: number, endX: number, endY: number, now: number) => {
      const dx = endX - startX;
      const dy = endY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 18) return requestMove(0, 1, now, "up");
      if (absX > absY) requestMove(dx > 0 ? 1 : -1, 0, now, dx > 0 ? "right" : "left");
      else requestMove(0, dy < 0 ? 1 : -1, now, dy < 0 ? "up" : "down");
    };

    const handlePointerDown = (event: PointerEvent) => {
      const now = performance.now();
      if (
        match.phaseRef.current !== "playing" ||
        now < player.movementLockedUntil
      ) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStart) return;
      event.preventDefault();
      moveFromGesture(pointerStart.x, pointerStart.y, event.clientX, event.clientY, performance.now());
      pointerStart = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const now = performance.now();
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") requestMove(0, 1, now, "up");
      else if (event.code === "ArrowDown" || event.code === "KeyS") requestMove(0, -1, now, "down");
      else if (event.code === "ArrowLeft" || event.code === "KeyA") requestMove(-1, 0, now, "left");
      else if (event.code === "ArrowRight" || event.code === "KeyD") requestMove(1, 0, now, "right");
    };

    const frame = (now: number) => {
      const deltaTime = Math.max(0, Math.min(34, now - previousFrameAt) / 1_000);
      previousFrameAt = now;
      if (match.phaseRef.current !== "match_over") {
        updateRows(deltaTime, now);
        if (match.phaseRef.current === "playing") {
          updatePlayer(deltaTime, now);
        }
        ensureRows();
      }
      cameraRow += (targetCameraRow - cameraRow) * Math.min(1, deltaTime * 6.2);
      updateEffects(deltaTime);
      render(now);
      animationRef.current = window.requestAnimationFrame(frame);
    };

    resize();
    previousFrameAt = performance.now();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [match.lobbyId, match.matchInstanceKey, match.seed, match.sendEvent]);

  if (!match.lobbyId) {
    return (
      <div className="grid h-full min-h-[480px] place-items-center p-5 text-center text-white">
        <div>
          <div className="text-[20px] font-black uppercase">Лобби не найдено</div>
          <button
            type="button"
            onClick={match.backToLobbies}
            className="mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black"
          >
            К лобби
          </button>
        </div>
      </div>
    );
  }

  if (
    (match.connectionStatus === "error" || match.connectionStatus === "closed") &&
    !match.serverState
  ) {
    return (
      <div className="grid h-full min-h-[480px] place-items-center p-5 text-center text-white">
        <div>
          <div className="text-[20px] font-black uppercase">Нет соединения</div>
          <div className="mt-2 text-[10px] text-white/45">
            {match.socketError || "WebSocket закрыт"}
          </div>
          <button
            type="button"
            onClick={match.backToLobbies}
            className="mt-5 rounded-2xl bg-white px-5 py-3 text-[10px] font-black uppercase text-black"
          >
            К лобби
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="crossy-text-safe relative h-full min-h-[480px] w-full select-none overflow-hidden bg-transparent text-white [&_button]:leading-[1.45] [&_button]:pt-[0.18em]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PlayerAvatar photoUrl={match.playerProfile.photoUrl} name={playerName} side="player" />
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[9px] font-black leading-[1.3] py-[0.08em] text-white/90">{playerName}</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[20px] font-black leading-[1.3] py-[0.08em] tabular-nums text-[#F7C85F]">{score}</span>
                <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/30">x{multiplier} · row {displayRow}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 text-center">
            <div className="text-[22px] font-black leading-[1.3] py-[0.08em] tabular-nums text-white">{phase === "countdown" ? countdown : timeLeft}</div>
            <div className="mt-1 text-[6px] font-black uppercase tracking-[0.16em] text-white/30">{phase === "finished" ? "finished" : "seconds"}</div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[9px] font-black leading-[1.3] py-[0.08em] text-white/90">{opponentName}</div>
              <div className="mt-1.5 flex items-baseline justify-end gap-1.5">
                <span className="text-[6px] font-black uppercase tracking-[0.14em] text-white/30">
                  coins {match.opponentCombo} · row {match.opponentHeightScore}
                </span>
                <span className="text-[20px] font-black leading-[1.3] py-[0.08em] tabular-nums text-[#FF7A90]">
                  {opponentScore}
                </span>
              </div>
            </div>
            <PlayerAvatar photoUrl={match.opponentProfile.photoUrl} name={opponentName} side="opponent" />
          </div>
        </div>

        <div className="mx-auto mt-2 flex max-w-[480px] justify-center">
          <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-[7px] font-black uppercase tracking-[0.17em] text-white/45 backdrop-blur-md">
            {status} · coins {coins} · checkpoint {Math.floor(displayRow / WORLD.checkpointEvery) * WORLD.checkpointEvery}
          </div>
        </div>
      </header>

      {match.phase === "waiting" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/25 px-5 text-center backdrop-blur-[2px]">
          <div>
            <div className="text-[20px] font-black uppercase text-white">Ждём соперника</div>
            <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
              Матч начнётся, когда подключатся оба игрока
            </div>
          </div>
        </div>
      )}

      {match.phase === "countdown" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/10">
          <div className="text-center">
            <div className="min-h-[78px] overflow-visible px-3 pt-3 text-[58px] font-black leading-[1.22] text-white drop-shadow-[0_10px_30px_rgba(247,200,95,0.35)]">{countdown}</div>
            <div className="mt-3 text-[9px] font-black uppercase tracking-[0.22em] text-white/48">cross the road</div>
          </div>
        </div>
      )}

      {showHint && phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center px-4">
          <div className="animate-pulse rounded-full border border-white/[0.09] bg-black/30 px-4 py-2 text-[9px] font-black uppercase tracking-[0.17em] text-white/55 backdrop-blur-md">
            Тап — вперёд · свайп — направление
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 px-4 backdrop-blur-[6px]">
          <div className="relative w-full max-w-[342px] overflow-hidden rounded-[30px] border border-white/[0.1] bg-[#0d1119]/95 px-5 pb-5 pt-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.72)]">
            <div
              className={[
                "pointer-events-none absolute inset-x-0 top-0 h-32 opacity-45 blur-2xl",
                isDraw
                  ? "bg-white/10"
                  : didWin
                    ? "bg-[#39E58C]/20"
                    : "bg-[#FF5D73]/20",
              ].join(" ")}
            />

            <div className="relative">
              <div className="text-[8px] font-black uppercase leading-[1.5] tracking-[0.22em] text-white/35">
                Crossy PVP · Match result
              </div>
              <h2
                className={[
                  "mt-2 py-1 text-[27px] font-black uppercase leading-[1.25] tracking-[-0.04em]",
                  isDraw
                    ? "text-white"
                    : didWin
                      ? "text-[#49E99A]"
                      : "text-[#FF667B]",
                ].join(" ")}
              >
                {isDraw ? "Ничья" : didWin ? "Победа" : "Поражение"}
              </h2>

              {isDraw ? (
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  {[
                    { profile: match.playerProfile, value: score },
                    { profile: match.opponentProfile, value: opponentScore },
                  ].map(({ profile, value }, index) => (
                    <div key={profile.id || index} className="min-w-0">
                      <div className="mx-auto grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-[17px] font-black uppercase text-white">
                        {profile.photoUrl ? (
                          <img src={profile.photoUrl} alt={profile.name} className="h-full w-full object-cover" draggable={false} />
                        ) : getInitials(profile.name)}
                      </div>
                      <div className="mt-2 truncate px-1 text-[9px] font-black leading-[1.5] text-white/62">{profile.name}</div>
                      <div className="mt-1 text-[23px] font-black leading-[1.25] tabular-nums text-white">{value}</div>
                    </div>
                  ))}
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25">VS</div>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-[1.2fr_auto_0.9fr] items-end gap-3">
                  <div className="min-w-0">
                    <div className="relative mx-auto w-fit">
                      <div className="absolute -inset-2 rounded-full bg-[#F7C85F]/15 blur-xl" />
                      <div className="relative grid h-[92px] w-[92px] place-items-center overflow-hidden rounded-full border-2 border-[#F7C85F]/70 bg-white/[0.07] text-[20px] font-black uppercase text-white shadow-[0_15px_45px_rgba(247,200,95,0.17)]">
                        {winnerProfile.photoUrl ? (
                          <img src={winnerProfile.photoUrl} alt={winnerProfile.name} className="h-full w-full object-cover" draggable={false} />
                        ) : getInitials(winnerProfile.name)}
                      </div>
                    </div>
                    <div className="mt-2 truncate px-1 text-[9px] font-black leading-[1.5] text-[#F7C85F]">{winnerProfile.name}</div>
                    <div className="mt-1 text-[27px] font-black leading-[1.25] tabular-nums text-white">{winnerScore}</div>
                  </div>

                  <div className="pb-9 text-[8px] font-black uppercase tracking-[0.18em] text-white/22">VS</div>

                  <div className="min-w-0 pb-1">
                    <div className="mx-auto grid h-[64px] w-[64px] place-items-center overflow-hidden rounded-full border border-white/12 bg-white/[0.045] text-[14px] font-black uppercase text-white/70">
                      {loserProfile.photoUrl ? (
                        <img src={loserProfile.photoUrl} alt={loserProfile.name} className="h-full w-full object-cover opacity-80" draggable={false} />
                      ) : getInitials(loserProfile.name)}
                    </div>
                    <div className="mt-2 truncate px-1 text-[8px] font-black leading-[1.5] text-white/38">{loserProfile.name}</div>
                    <div className="mt-1 text-[21px] font-black leading-[1.25] tabular-nums text-white/55">{loserScore}</div>
                  </div>
                </div>
              )}

              <div className="my-5 h-px bg-white/[0.07]" />

              <div
                className={[
                  "game-result-reward mx-auto flex w-fit items-center justify-center gap-2 rounded-full border px-4 py-2.5",
                  isDraw
                    ? "border-white/10 bg-white/[0.05] text-white/55"
                    : didWin
                      ? "border-[#49E99A]/20 bg-[#49E99A]/10 text-[#49E99A]"
                      : "border-[#FF667B]/20 bg-[#FF667B]/10 text-[#FF667B]",
                ].join(" ")}
              >
                <span className="text-[20px] font-black leading-[1.25] tabular-nums">
                  {didWin ? `+${formatReward(displayedReward)}` : "0"}
                </span>
                <img src={coinIcon} alt="GAME" className="h-6 w-6 object-contain" draggable={false} />
              </div>

              <button
                type="button"
                onClick={match.backToLobbies}
                className="group mt-5 grid min-h-[58px] w-full grid-cols-[42px_1fr_42px] items-center rounded-[20px] border border-white/[0.11] bg-[linear-gradient(180deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.045)_100%)] px-2.5 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_16px_36px_rgba(0,0,0,0.30)] transition-[transform,border-color,background-color,box-shadow] duration-150 hover:border-white/[0.17] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.135)_0%,rgba(255,255,255,0.06)_100%)] active:translate-y-[1px] active:scale-[0.985] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_20px_rgba(0,0,0,0.24)]"
              >
                <span className="grid h-[38px] w-[38px] place-items-center rounded-[13px] border border-white/[0.10] bg-black/20 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-150 group-hover:bg-black/28 group-hover:text-white">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[17px] w-[17px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5" />
                    <path d="m11 18-6-6 6-6" />
                  </svg>
                </span>

                <span className="px-2 pt-[0.16em] text-center text-[10px] font-black uppercase leading-[1.5] tracking-[0.14em] text-white">
                  К лобби
                </span>

                <span className="grid h-[38px] w-[38px] place-items-center text-white/30 transition duration-150 group-hover:translate-x-0.5 group-hover:text-white/55">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[16px] w-[16px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrossyRoadGame;
