import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';

type Phase = 'ready' | 'flying' | 'settling';

type Vec = {
  x: number;
  y: number;
};

type Ball = Vec & {
  vx: number;
  vy: number;
  r: number;
  rotation: number;
};

type Hoop = Vec & {
  id: number;
  width: number;
  angle: number;
  netMin: number;
  netMax: number;
  bottomWidth: number;
  accent: number;
  stretch: number;
  stretchV: number;
};

type Particle = Vec & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  gravity: number;
};

type Trail = Vec & {
  life: number;
  size: number;
};

type Label = Vec & {
  text: string;
  life: number;
  maxLife: number;
  hue: number;
  scale: number;
};

type Aim = {
  active: boolean;
  pointerId: number | null;
  x: number;
  y: number;
  power: number;
};

const CFG = {
  gravity: 1680,
  maxPull: 128,
  launchPower: 8.95,
  maxLaunchSpeed: 1490,
  drag: 0.99935,
  ballRadius: 19,
  rimRadius: 4.2,
  minGap: 174,
  maxGap: 202,
  margin: 20,
  maxDpr: 1.7,
  settleMs: 520,
  returnMs: 185,
  naturalDropMs: 155,
  timeoutMs: 5400,
  fireCombo: 4,
  maxMultiplier: 5,
};

const clamp = (
  value: number,
  min: number,
  max: number,
) => Math.max(min, Math.min(max, value));

const lerp = (
  from: number,
  to: number,
  amount: number,
) => from + (to - from) * amount;

const getInitials = (value: string) =>
  value
    .replace('@', '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG';

const haptic = (
  kind:
    | 'light'
    | 'medium'
    | 'heavy'
    | 'success'
    | 'error',
) => {
  const webApp = (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (
              style:
                | 'light'
                | 'medium'
                | 'heavy',
            ) => void;

            notificationOccurred?: (
              type: 'success' | 'error',
            ) => void;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  if (kind === 'success' || kind === 'error') {
    webApp?.HapticFeedback?.notificationOccurred?.(
      kind,
    );
    return;
  }

  webApp?.HapticFeedback?.impactOccurred?.(
    kind,
  );
};

const localToWorld = (
  x: number,
  y: number,
  angle: number,
): Vec => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
};

const worldToLocal = (
  x: number,
  y: number,
  angle: number,
): Vec => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: x * cos + y * sin,
    y: -x * sin + y * cos,
  };
};

const closestOnSegment = (
  point: Vec,
  start: Vec,
  end: Vec,
): Vec => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;

  const lengthSquared =
    segmentX * segmentX +
      segmentY * segmentY || 1;

  const progress = clamp(
    ((point.x - start.x) * segmentX +
      (point.y - start.y) * segmentY) /
      lengthSquared,
    0,
    1,
  );

  return {
    x: start.x + segmentX * progress,
    y: start.y + segmentY * progress,
  };
};

const collidePoint = (
  ball: Ball,
  point: Vec,
  radius: number,
  bounce: number,
) => {
  const dx = ball.x - point.x;
  const dy = ball.y - point.y;

  const distance = Math.hypot(dx, dy);
  const minimumDistance = ball.r + radius;

  if (distance >= minimumDistance) {
    return false;
  }

  const normalX =
    distance > 0.0001 ? dx / distance : 0;

  const normalY =
    distance > 0.0001 ? dy / distance : -1;

  const penetration =
    minimumDistance - distance;

  ball.x += normalX * penetration;
  ball.y += normalY * penetration;

  const normalVelocity =
    ball.vx * normalX +
    ball.vy * normalY;

  if (normalVelocity < 0) {
    ball.vx -=
      (1 + bounce) *
      normalVelocity *
      normalX;

    ball.vy -=
      (1 + bounce) *
      normalVelocity *
      normalY;
  }

  return true;
};

const collideSegment = (
  ball: Ball,
  start: Vec,
  end: Vec,
  extraRadius: number,
  bounce: number,
) => {
  const point = closestOnSegment(
    ball,
    start,
    end,
  );

  const dx = ball.x - point.x;
  const dy = ball.y - point.y;

  const distance = Math.hypot(dx, dy);

  const minimumDistance =
    ball.r + extraRadius;

  if (distance >= minimumDistance) {
    return false;
  }

  const normalX =
    distance > 0.0001 ? dx / distance : 0;

  const normalY =
    distance > 0.0001 ? dy / distance : -1;

  const penetration =
    minimumDistance - distance;

  ball.x += normalX * penetration;
  ball.y += normalY * penetration;

  const normalVelocity =
    ball.vx * normalX +
    ball.vy * normalY;

  if (normalVelocity < 0) {
    ball.vx -=
      (1 + bounce) *
      normalVelocity *
      normalX;

    ball.vy -=
      (1 + bounce) *
      normalVelocity *
      normalY;
  }

  return true;
};

const createRandom = () => {
  let seed =
    Math.floor(
      Math.random() * 2_147_483_647,
    ) || 1;

  return () => {
    seed =
      (seed * 16_807) % 2_147_483_647;

    return (
      (seed - 1) /
      2_147_483_646
    );
  };
};

const Avatar = ({
  photoUrl,
  name,
  side,
}: {
  photoUrl?: string;
  name: string;
  side: 'player' | 'rival';
}) => (
  <div
    className={[
      'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border text-[10px] font-black uppercase text-white shadow-[0_8px_24px_rgba(0,0,0,0.24)]',
      side === 'player'
        ? 'border-[#52FFE5]/35 bg-[#52FFE5]/10'
        : 'border-[#F2A65A]/35 bg-[#F2A65A]/10',
    ].join(' ')}
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

export const DunkShotGame = () => {
  const { user } = useAuth();

  const playerName =
    user?.tg_user || 'Player';

  const rivalName = 'Opponent';

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const frameRef =
    useRef<number | null>(null);

  const [score, setScore] =
    useState(0);

  const [combo, setCombo] =
    useState(0);

  const [phase, setPhase] =
    useState<Phase>('ready');

  const [callout, setCallout] =
    useState('READY');

  const [hint, setHint] =
    useState(true);

  const [best, setBest] = useState(() =>
    typeof window === 'undefined'
      ? 0
      : Number(
          localStorage.getItem(
            'twingames_dunk_shot_best',
          ) || 0,
        ),
  );

  const multiplier = Math.min(
    CFG.maxMultiplier,
    1 +
      Math.floor(
        Math.max(0, combo - 1) / 3,
      ),
  );

  const fire =
    combo >= CFG.fireCombo;

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;

    if (!canvas || !root) {
      return;
    }

    const context =
      canvas.getContext('2d');

    if (!context) {
      return;
    }

    const random = createRandom();

    const viewport = {
      width: 0,
      height: 0,
      dpr: 1,
    };

    const camera = {
      y: 0,
      targetY: 0,
      shake: 0,
    };

    const ball: Ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: CFG.ballRadius,
      rotation: 0,
    };

    const aim: Aim = {
      active: false,
      pointerId: null,
      x: 0,
      y: 0,
      power: 0,
    };

    const hoops: Hoop[] = [];
    const particles: Particle[] = [];
    const trails: Trail[] = [];
    const labels: Label[] = [];

    let initialized = false;
    let currentHoopIndex = 0;

    let livePhase: Phase = 'ready';

    let liveScore = 0;
    let liveCombo = 0;

    let rimTouched = false;
    let leftOldHoop = false;

    let shotStartedAt = 0;
    let settleStartedAt = 0;
    let settleUntil = 0;

    let previousFrame =
      performance.now();

    let missFlash = 0;

    const changePhase = (
      next: Phase,
    ) => {
      livePhase = next;
      setPhase(next);
    };

    const getWorldPoint = (
      hoop: Hoop,
      localX: number,
      localY: number,
    ): Vec => {
      const point = localToWorld(
        localX,
        localY,
        hoop.angle,
      );

      return {
        x: hoop.x + point.x,
        y: hoop.y + point.y,
      };
    };

    const getNetDepth = (
      hoop: Hoop,
    ) =>
      lerp(
        hoop.netMin,
        hoop.netMax,
        clamp(hoop.stretch, 0, 1),
      );

    const getRestPosition = (
      hoop: Hoop,
    ) =>
      getWorldPoint(
        hoop,
        0,
        Math.max(
          ball.r * 0.82,
          getNetDepth(hoop) -
            ball.r * 0.62,
        ),
      );

    const addLabel = (
      text: string,
      x: number,
      y: number,
      hue: number,
      scale = 1,
    ) => {
      labels.push({
        text,
        x,
        y,
        hue,
        scale,
        life: 1,
        maxLife: 1,
      });

      setCallout(text);
    };

    const createBurst = (
      x: number,
      y: number,
      hue: number,
      amount: number,
      power = 1,
    ) => {
      for (
        let index = 0;
        index < amount;
        index += 1
      ) {
        const angle =
          random() * Math.PI * 2;

        const speed =
          (105 + random() * 360) *
          power;

        const life =
          0.55 + random() * 0.45;

        particles.push({
          x,
          y,
          vx:
            Math.cos(angle) * speed,
          vy:
            Math.sin(angle) * speed -
            70,
          life,
          maxLife: life,
          size:
            1.8 + random() * 4.2,
          hue:
            hue +
            (random() - 0.5) * 28,
          gravity:
            350 + random() * 470,
        });
      }
    };

    const createNextHoop = (
      index: number,
    ) => {
      const previous =
        hoops[index - 1];

      const width =
        72 + random() * 5;

      if (!previous) {
        hoops.push({
          id: index,
          x: viewport.width * 0.5,
          y:
            viewport.height -
            112,
          width,
          angle: 0,
          netMin: 27,
          netMax: 58,
          bottomWidth: 31,
          accent: 24,
          stretch: 1,
          stretchV: 0,
        });

        return;
      }

      const verticalGap =
        CFG.minGap +
        random() *
          (CFG.maxGap - CFG.minGap);

      const padding =
        CFG.margin + width / 2;

      const minX = padding;

      const maxX = Math.max(
        minX,
        viewport.width - padding,
      );

      const previousOnLeft =
        previous.x <
        viewport.width * 0.5;

      const shouldAlternate =
        random() < 0.94;

      const placeOnRight =
        shouldAlternate
          ? previousOnLeft
          : !previousOnLeft;

      let x = placeOnRight
        ? lerp(
            viewport.width * 0.66,
            viewport.width * 0.84,
            random(),
          )
        : lerp(
            viewport.width * 0.16,
            viewport.width * 0.34,
            random(),
          );

      x = clamp(x, minX, maxX);

      const minimumHorizontalShift =
        Math.min(
          82,
          viewport.width * 0.22,
        );

      if (
        Math.abs(x - previous.x) <
        minimumHorizontalShift
      ) {
        x = placeOnRight
          ? clamp(
              previous.x +
                minimumHorizontalShift,
              minX,
              maxX,
            )
          : clamp(
              previous.x -
                minimumHorizontalShift,
              minX,
              maxX,
            );
      }

      const direction =
        x > previous.x ? 1 : -1;

      const angleDegrees = clamp(
        direction * -1.35 +
          (random() - 0.5) * 1.8,
        -2.8,
        2.8,
      );

      hoops.push({
        id: index,
        x,
        y:
          previous.y -
          verticalGap,
        width,
        angle:
          (angleDegrees *
            Math.PI) /
          180,
        netMin:
          26 + random() * 2,
        netMax:
          57 + random() * 4,
        bottomWidth:
          30 + random() * 4,
        accent:
          index % 5 === 0
            ? 42
            : index % 3 === 0
              ? 184
              : 22,
        stretch: 0.08,
        stretchV: 0,
      });
    };

    const ensureHoops = () => {
      while (
        hoops.length <
        currentHoopIndex + 9
      ) {
        createNextHoop(
          hoops.length,
        );
      }
    };

    const placeBallInCurrentHoop =
      () => {
        const hoop =
          hoops[currentHoopIndex];

        hoop.stretch = 1;
        hoop.stretchV = 0;

        const rest =
          getRestPosition(hoop);

        ball.x = rest.x;
        ball.y = rest.y;
        ball.vx = 0;
        ball.vy = 0;

        ball.rotation =
          hoop.angle * 0.45;

        rimTouched = false;
        leftOldHoop = false;

        changePhase('ready');
      };

    const initialize = () => {
      hoops.length = 0;
      currentHoopIndex = 0;

      createNextHoop(0);
      ensureHoops();

      camera.y = 0;
      camera.targetY = 0;

      placeBallInCurrentHoop();

      initialized = true;
    };

    const resize = () => {
      const rect =
        root.getBoundingClientRect();

      viewport.width = Math.max(
        1,
        rect.width,
      );

      viewport.height = Math.max(
        440,
        rect.height,
      );

      viewport.dpr = Math.min(
        window.devicePixelRatio || 1,
        CFG.maxDpr,
      );

      canvas.width = Math.round(
        viewport.width * viewport.dpr,
      );

      canvas.height = Math.round(
        viewport.height * viewport.dpr,
      );

      canvas.style.width =
        `${viewport.width}px`;

      canvas.style.height =
        `${viewport.height}px`;

      context.setTransform(
        viewport.dpr,
        0,
        0,
        viewport.dpr,
        0,
        0,
      );

      if (!initialized) {
        initialize();
        return;
      }

      for (const hoop of hoops) {
        const padding =
          CFG.margin + hoop.width / 2;

        hoop.x = clamp(
          hoop.x,
          padding,
          viewport.width - padding,
        );
      }

      ball.x = clamp(
        ball.x,
        ball.r,
        viewport.width - ball.r,
      );
    };

    const pointerToWorld = (
      clientX: number,
      clientY: number,
    ): Vec => {
      const rect =
        canvas.getBoundingClientRect();

      return {
        x: clientX - rect.left,
        y:
          clientY -
          rect.top +
          camera.y,
      };
    };

    const returnToOldHoop = (
      now: number,
    ) => {
      liveCombo = 0;
      setCombo(0);

      trails.length = 0;

      addLabel(
        'TRY AGAIN',
        hoops[currentHoopIndex].x,
        hoops[currentHoopIndex].y -
          48,
        28,
        0.94,
      );

      haptic('light');

      ball.vx *= 0.12;
      ball.vy *= 0.1;

      settleStartedAt = now;

      settleUntil =
        now + CFG.returnMs;

      changePhase('settling');
    };

    const handleMiss = () => {
      liveCombo = 0;
      setCombo(0);

      trails.length = 0;

      missFlash = 1;
      camera.shake = 5;

      addLabel(
        'MISS',
        ball.x,
        camera.y +
          viewport.height * 0.47,
        350,
        1.04,
      );

      haptic('error');

      placeBallInCurrentHoop();
    };

    const scoreTargetHoop = (
      targetIndex: number,
      crossingX: number,
      verticalVelocity: number,
      now: number,
    ) => {
      if (
        livePhase !== 'flying' ||
        targetIndex !==
          currentHoopIndex + 1
      ) {
        return;
      }

      const hoop =
        hoops[targetIndex];

      const centered =
        Math.abs(crossingX) <=
        hoop.width * 0.075;

      const clean = !rimTouched;

      const perfect =
        centered &&
        clean &&
        verticalVelocity > 240;

      liveCombo += 1;

      const localMultiplier =
        Math.min(
          CFG.maxMultiplier,
          1 +
            Math.floor(
              Math.max(
                0,
                liveCombo - 1,
              ) / 3,
            ),
        );

      const gained =
        (perfect
          ? 35
          : clean
            ? 24
            : 14) *
        localMultiplier;

      liveScore += gained;

      setScore(liveScore);
      setCombo(liveCombo);

      const storedBest = Number(
        localStorage.getItem(
          'twingames_dunk_shot_best',
        ) || 0,
      );

      if (liveScore > storedBest) {
        setBest(liveScore);

        localStorage.setItem(
          'twingames_dunk_shot_best',
          String(liveScore),
        );
      }

      const text = perfect
        ? 'PERFECT SWISH'
        : clean
          ? 'SWISH'
          : 'BUCKET';

      const hue =
        liveCombo >= CFG.fireCombo
          ? 22
          : perfect
            ? 46
            : 180;

      addLabel(
        `${text}  +${gained}`,
        hoop.x,
        hoop.y - 48,
        hue,
        perfect ? 1.1 : 1,
      );

      createBurst(
        hoop.x,
        hoop.y + 8,
        hue,
        perfect ? 32 : 22,
        perfect ? 1.18 : 1,
      );

      if (
        liveCombo === CFG.fireCombo
      ) {
        addLabel(
          'FIREBALL',
          hoop.x,
          hoop.y - 82,
          18,
          1.16,
        );

        createBurst(
          hoop.x,
          hoop.y,
          18,
          38,
          1.3,
        );
      }

      camera.shake =
        perfect ? 7 : 4;

      haptic(
        perfect ? 'heavy' : 'success',
      );

      currentHoopIndex =
        targetIndex;

      hoop.stretch = Math.max(
        hoop.stretch,
        0.28,
      );

      hoop.stretchV += 2.3;

      ensureHoops();

      camera.targetY =
        hoops[currentHoopIndex].y -
        (viewport.height - 148);

      settleStartedAt = now;

      settleUntil =
        now + CFG.settleMs;

      rimTouched = false;

      changePhase('settling');
    };

    const detectScore = (
      previousPosition: Vec,
      nextPosition: Vec,
      now: number,
    ) => {
      const targetIndex =
        currentHoopIndex + 1;

      const hoop =
        hoops[targetIndex];

      if (!hoop) {
        return false;
      }

      const previousLocal =
        worldToLocal(
          previousPosition.x -
            hoop.x,
          previousPosition.y -
            hoop.y,
          hoop.angle,
        );

      const nextLocal =
        worldToLocal(
          nextPosition.x - hoop.x,
          nextPosition.y - hoop.y,
          hoop.angle,
        );

      const localVelocity =
        worldToLocal(
          ball.vx,
          ball.vy,
          hoop.angle,
        );

      const crossedOpening =
        previousLocal.y < 0 &&
        nextLocal.y >= 0 &&
        localVelocity.y > 45;

      if (!crossedOpening) {
        return false;
      }

      const denominator =
        nextLocal.y -
        previousLocal.y;

      const progress =
        Math.abs(denominator) <
        0.0001
          ? 1
          : clamp(
              -previousLocal.y /
                denominator,
              0,
              1,
            );

      const crossingX =
        previousLocal.x +
        (nextLocal.x -
          previousLocal.x) *
          progress;

      const clearHalfWidth =
        Math.max(
          10,
          hoop.width / 2 -
            ball.r -
            CFG.rimRadius +
            2.5,
        );

      if (
        Math.abs(crossingX) >
        clearHalfWidth
      ) {
        return false;
      }

      scoreTargetHoop(
        targetIndex,
        crossingX,
        localVelocity.y,
        now,
      );

      return true;
    };

    const detectOldHoopReturn = (
      previousPosition: Vec,
      nextPosition: Vec,
      now: number,
    ) => {
      if (
        !leftOldHoop ||
        livePhase !== 'flying'
      ) {
        return false;
      }

      const hoop =
        hoops[currentHoopIndex];

      const previousLocal =
        worldToLocal(
          previousPosition.x -
            hoop.x,
          previousPosition.y -
            hoop.y,
          hoop.angle,
        );

      const nextLocal =
        worldToLocal(
          nextPosition.x - hoop.x,
          nextPosition.y - hoop.y,
          hoop.angle,
        );

      const localVelocity =
        worldToLocal(
          ball.vx,
          ball.vy,
          hoop.angle,
        );

      const returned =
        previousLocal.y < 0 &&
        nextLocal.y >= 0 &&
        localVelocity.y > 30 &&
        Math.abs(nextLocal.x) <=
          hoop.width / 2;

      if (!returned) {
        return false;
      }

      returnToOldHoop(now);

      return true;
    };

    const collideTargetRim = (
      hoop: Hoop,
    ) => {
      const leftRim =
        getWorldPoint(
          hoop,
          -hoop.width / 2,
          0,
        );

      const rightRim =
        getWorldPoint(
          hoop,
          hoop.width / 2,
          0,
        );

      const hit =
        collidePoint(
          ball,
          leftRim,
          CFG.rimRadius,
          0.76,
        ) ||
        collidePoint(
          ball,
          rightRim,
          CFG.rimRadius,
          0.76,
        );

      if (!hit) {
        return;
      }

      if (!rimTouched) {
        haptic('light');
      }

      rimTouched = true;

      createBurst(
        ball.x,
        ball.y,
        hoop.accent,
        3,
        0.4,
      );

      ball.vx *= 0.995;
      ball.vy *= 0.995;
    };

    const collideCurrentNet = (
      hoop: Hoop,
    ) => {
      const depth = Math.max(
        getNetDepth(hoop),
        hoop.netMax * 0.78,
      );

      const leftTop =
        getWorldPoint(
          hoop,
          -hoop.width / 2,
          4,
        );

      const rightTop =
        getWorldPoint(
          hoop,
          hoop.width / 2,
          4,
        );

      const leftBottom =
        getWorldPoint(
          hoop,
          -hoop.bottomWidth / 2,
          depth,
        );

      const rightBottom =
        getWorldPoint(
          hoop,
          hoop.bottomWidth / 2,
          depth,
        );

      collideSegment(
        ball,
        leftTop,
        leftBottom,
        1.2,
        0.18,
      );

      collideSegment(
        ball,
        rightTop,
        rightBottom,
        1.2,
        0.18,
      );

      collideSegment(
        ball,
        leftBottom,
        rightBottom,
        1.8,
        0.12,
      );
    };

    const updateNets = (
      deltaTime: number,
    ) => {
      hoops.forEach(
        (hoop, index) => {
          let targetStretch = 0.08;

          if (
            index ===
              currentHoopIndex &&
            (livePhase === 'ready' ||
              livePhase ===
                'settling')
          ) {
            targetStretch = 1;
          }

          if (
            livePhase === 'flying' &&
            index ===
              currentHoopIndex + 1
          ) {
            const localBall =
              worldToLocal(
                ball.x - hoop.x,
                ball.y - hoop.y,
                hoop.angle,
              );

            const closeToNet =
              localBall.y >
                -ball.r * 1.2 &&
              localBall.y <
                hoop.netMax +
                  ball.r &&
              Math.abs(localBall.x) <
                hoop.width / 2 +
                  ball.r;

            if (closeToNet) {
              targetStretch = Math.max(
                targetStretch,
                0.18 +
                  clamp(
                    (localBall.y +
                      ball.r) /
                      (hoop.netMax +
                        ball.r),
                    0,
                    1,
                  ) *
                    0.5,
              );
            }
          }

          hoop.stretchV +=
            (targetStretch -
              hoop.stretch) *
            34 *
            deltaTime;

          hoop.stretchV *=
            Math.pow(
              0.16,
              deltaTime,
            );

          hoop.stretch +=
            hoop.stretchV *
            deltaTime;

          hoop.stretch = clamp(
            hoop.stretch,
            0.04,
            1.08,
          );
        },
      );
    };

    const updateBall = (
      deltaTime: number,
      now: number,
    ) => {
      if (livePhase === 'ready') {
        const rest =
          getRestPosition(
            hoops[currentHoopIndex],
          );

        ball.x +=
          (rest.x - ball.x) *
          Math.min(
            1,
            deltaTime * 19,
          );

        ball.y +=
          (rest.y - ball.y) *
          Math.min(
            1,
            deltaTime * 19,
          );

        ball.vx = 0;
        ball.vy = 0;

        return;
      }

      if (
        livePhase === 'settling'
      ) {
        const hoop =
          hoops[currentHoopIndex];

        const elapsed =
          now - settleStartedAt;

        if (
          elapsed <
          CFG.naturalDropMs
        ) {
          const stepTime =
            deltaTime / 3;

          for (
            let step = 0;
            step < 3;
            step += 1
          ) {
            ball.vy +=
              CFG.gravity *
              stepTime *
              0.58;

            ball.vx *= Math.pow(
              0.985,
              stepTime * 60,
            );

            ball.vy *= Math.pow(
              0.985,
              stepTime * 60,
            );

            ball.x +=
              ball.vx * stepTime;

            ball.y +=
              ball.vy * stepTime;

            ball.rotation +=
              ball.vx *
              stepTime *
              0.018;

            collideCurrentNet(
              hoop,
            );
          }
        } else {
          const rest =
            getRestPosition(hoop);

          ball.vx +=
            (rest.x - ball.x) *
            34 *
            deltaTime;

          ball.vy +=
            (rest.y - ball.y) *
            34 *
            deltaTime;

          ball.vx *= Math.pow(
            0.58,
            deltaTime * 60,
          );

          ball.vy *= Math.pow(
            0.58,
            deltaTime * 60,
          );

          ball.x +=
            ball.vx * deltaTime;

          ball.y +=
            ball.vy * deltaTime;

          ball.rotation +=
            ball.vx *
            deltaTime *
            0.015;
        }

        if (now >= settleUntil) {
          placeBallInCurrentHoop();
        }

        return;
      }

      const expectedDistance =
        Math.hypot(
          ball.vx,
          ball.vy,
        ) * deltaTime;

      const steps = clamp(
        Math.ceil(
          expectedDistance /
            Math.max(
              3.4,
              ball.r * 0.25,
            ),
        ),
        1,
        18,
      );

      const stepTime =
        deltaTime / steps;

      for (
        let step = 0;
        step < steps;
        step += 1
      ) {
        const previousPosition = {
          x: ball.x,
          y: ball.y,
        };

        ball.vy +=
          CFG.gravity * stepTime;

        ball.vx *= Math.pow(
          CFG.drag,
          stepTime * 60,
        );

        ball.vy *= Math.pow(
          CFG.drag,
          stepTime * 60,
        );

        ball.x +=
          ball.vx * stepTime;

        ball.y +=
          ball.vy * stepTime;

        ball.rotation +=
          ball.vx *
          stepTime *
          0.024;

        if (ball.x < ball.r) {
          ball.x = ball.r;

          ball.vx =
            Math.abs(ball.vx) *
            0.7;

          rimTouched = true;
        } else if (
          ball.x >
          viewport.width - ball.r
        ) {
          ball.x =
            viewport.width -
            ball.r;

          ball.vx =
            -Math.abs(ball.vx) *
            0.7;

          rimTouched = true;
        }

        const oldHoop =
          hoops[currentHoopIndex];

        const localPosition =
          worldToLocal(
            ball.x - oldHoop.x,
            ball.y - oldHoop.y,
            oldHoop.angle,
          );

        if (
          !leftOldHoop &&
          (localPosition.y <
            -ball.r * 1.12 ||
            Math.abs(
              localPosition.x,
            ) >
              oldHoop.width / 2 +
                ball.r * 1.2)
        ) {
          leftOldHoop = true;
        }

        if (
          detectScore(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }

        if (
          detectOldHoopReturn(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }

        const targetHoop =
          hoops[
            currentHoopIndex + 1
          ];

        if (targetHoop) {
          collideTargetRim(
            targetHoop,
          );
        }

        if (
          detectScore(
            previousPosition,
            ball,
            now,
          )
        ) {
          return;
        }
      }

      const speed = Math.hypot(
        ball.vx,
        ball.vy,
      );

      if (
        liveCombo >= CFG.fireCombo
      ) {
        trails.push({
          x: ball.x,
          y: ball.y,
          life: 1,
          size:
            ball.r *
            (0.82 +
              random() * 0.32),
        });

        if (trails.length > 24) {
          trails.shift();
        }
      } else if (speed > 350) {
        trails.push({
          x: ball.x,
          y: ball.y,
          life: 0.42,
          size: ball.r * 0.48,
        });

        if (trails.length > 8) {
          trails.shift();
        }
      }

      if (
        ball.y - camera.y >
          viewport.height + 84 ||
        ball.y - camera.y <
          -viewport.height * 0.75 ||
        now - shotStartedAt >
          CFG.timeoutMs
      ) {
        handleMiss();
      }
    };

    const updateEffects = (
      deltaTime: number,
    ) => {
      camera.y +=
        (camera.targetY -
          camera.y) *
        Math.min(
          1,
          deltaTime * 6.2,
        );

      camera.shake *= Math.pow(
        0.06,
        deltaTime,
      );

      missFlash *= Math.pow(
        0.02,
        deltaTime,
      );

      particles.forEach(
        (particle) => {
          particle.vy +=
            particle.gravity *
            deltaTime;

          particle.x +=
            particle.vx *
            deltaTime;

          particle.y +=
            particle.vy *
            deltaTime;

          particle.vx *= Math.pow(
            0.982,
            deltaTime * 60,
          );

          particle.life -=
            deltaTime;
        },
      );

      trails.forEach((trail) => {
        trail.life -=
          deltaTime *
          (liveCombo >=
          CFG.fireCombo
            ? 1.45
            : 2.8);
      });

      labels.forEach((item) => {
        item.y -= 34 * deltaTime;

        item.life -=
          deltaTime * 0.82;
      });

      for (
        let index =
          particles.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          particles[index].life <= 0
        ) {
          particles.splice(index, 1);
        }
      }

      for (
        let index =
          trails.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          trails[index].life <= 0
        ) {
          trails.splice(index, 1);
        }
      }

      for (
        let index =
          labels.length - 1;
        index >= 0;
        index -= 1
      ) {
        if (
          labels[index].life <= 0
        ) {
          labels.splice(index, 1);
        }
      }
    };

    const drawHoop = (
      hoop: Hoop,
      isTarget: boolean,
      isCurrent: boolean,
    ) => {
      const screenY =
        hoop.y - camera.y;

      if (
        screenY < -120 ||
        screenY >
          viewport.height + 130
      ) {
        return;
      }

      const depth =
        getNetDepth(hoop);

      const stretch = clamp(
        hoop.stretch,
        0,
        1.05,
      );

      const halfTop =
        hoop.width / 2;

      const halfBottom = lerp(
        hoop.width * 0.24,
        hoop.bottomWidth / 2,
        stretch,
      );

      const sway = clamp(
        hoop.stretchV * 1.25,
        -2.3,
        2.3,
      );

      context.save();

      context.translate(
        hoop.x,
        screenY,
      );

      context.rotate(hoop.angle);

      if (isTarget) {
        const pulse =
          0.76 +
          Math.sin(
            performance.now() *
              0.005,
          ) *
            0.1;

        const glow =
          context.createRadialGradient(
            0,
            12,
            2,
            0,
            12,
            hoop.width * 1.12,
          );

        glow.addColorStop(
          0,
          `hsla(${hoop.accent},100%,62%,${0.14 * pulse})`,
        );

        glow.addColorStop(
          1,
          `hsla(${hoop.accent},100%,55%,0)`,
        );

        context.fillStyle = glow;

        context.fillRect(
          -hoop.width * 1.3,
          -hoop.width,
          hoop.width * 2.6,
          hoop.width * 2.2,
        );
      }

      const netFill =
        context.createLinearGradient(
          0,
          3,
          0,
          depth,
        );

      netFill.addColorStop(
        0,
        'rgba(255,255,255,0.015)',
      );

      netFill.addColorStop(
        1,
        'rgba(255,255,255,0.07)',
      );

      context.fillStyle = netFill;

      context.beginPath();

      context.moveTo(
        -halfTop + 3,
        3,
      );

      context.bezierCurveTo(
        -halfTop * 0.82,
        depth * 0.35,
        -halfBottom +
          sway * 0.25,
        depth * 0.78,
        -halfBottom +
          sway * 0.2,
        depth,
      );

      context.quadraticCurveTo(
        sway * 0.3,
        depth +
          5 +
          stretch * 2,
        halfBottom +
          sway * 0.2,
        depth,
      );

      context.bezierCurveTo(
        halfBottom +
          sway * 0.25,
        depth * 0.78,
        halfTop * 0.82,
        depth * 0.35,
        halfTop - 3,
        3,
      );

      context.closePath();
      context.fill();

      context.lineWidth = 1.05;

      context.strokeStyle =
        isCurrent
          ? 'rgba(255,255,255,0.43)'
          : isTarget
            ? 'rgba(255,255,255,0.52)'
            : 'rgba(255,255,255,0.22)';

      for (
        let index = 0;
        index <= 7;
        index += 1
      ) {
        const progress =
          index / 7;

        const topX =
          -halfTop +
          hoop.width * progress;

        const bottomX =
          -halfBottom +
          halfBottom *
            2 *
            progress;

        context.beginPath();

        context.moveTo(
          topX,
          4,
        );

        context.bezierCurveTo(
          topX * 0.72,
          depth * 0.34,
          bottomX +
            sway * 0.18,
          depth * 0.74,
          bottomX +
            sway * 0.2,
          depth,
        );

        context.stroke();
      }

      for (
        let row = 1;
        row <= 4;
        row += 1
      ) {
        const progress = row / 5;

        const rowWidth = lerp(
          halfTop,
          halfBottom,
          progress,
        );

        const rowY =
          4 + depth * progress;

        context.beginPath();

        context.moveTo(
          -rowWidth +
            sway *
              progress *
              0.2,
          rowY,
        );

        context.quadraticCurveTo(
          sway *
            progress *
            0.25,
          rowY +
            2.5 +
            stretch,
          rowWidth +
            sway *
              progress *
              0.2,
          rowY,
        );

        context.stroke();
      }

      context.lineWidth = 1.7;

      context.strokeStyle =
        'rgba(255,255,255,0.48)';

      context.beginPath();

      context.moveTo(
        -halfBottom +
          sway * 0.2,
        depth,
      );

      context.quadraticCurveTo(
        sway * 0.3,
        depth +
          5 +
          stretch * 2,
        halfBottom +
          sway * 0.2,
        depth,
      );

      context.stroke();

      const rimHue = isTarget
        ? hoop.accent
        : 23;

      context.lineCap = 'round';

      context.shadowBlur =
        isTarget ? 18 : 8;

      context.shadowColor =
        `hsla(${rimHue},100%,55%,${isTarget ? 0.76 : 0.38})`;

      context.strokeStyle =
        isCurrent
          ? '#f8b15b'
          : `hsl(${rimHue},94%,60%)`;

      context.lineWidth =
        isTarget ? 6.1 : 5.4;

      context.beginPath();

      context.ellipse(
        0,
        0,
        halfTop,
        5.5,
        0,
        0,
        Math.PI * 2,
      );

      context.stroke();

      context.shadowBlur = 0;

      context.strokeStyle =
        'rgba(255,255,255,0.5)';

      context.lineWidth = 1;

      context.beginPath();

      context.ellipse(
        0,
        -1.4,
        halfTop - 2,
        3.8,
        0,
        0,
        Math.PI * 2,
      );

      context.stroke();

      context.restore();
    };

    const drawTrails = () => {
      const isFire =
        liveCombo >= CFG.fireCombo;

      trails.forEach(
        (trail, index) => {
          const alpha =
            clamp(
              trail.life,
              0,
              1,
            ) *
            ((index + 1) /
              Math.max(
                1,
                trails.length,
              ));

          const screenY =
            trail.y - camera.y;

          const hue = isFire
            ? 16 + index * 1.1
            : 185;

          const glow =
            context.createRadialGradient(
              trail.x,
              screenY,
              0,
              trail.x,
              screenY,
              trail.size * 2.5,
            );

          glow.addColorStop(
            0,
            `hsla(${hue},100%,64%,${alpha * 0.52})`,
          );

          glow.addColorStop(
            1,
            `hsla(${hue},100%,50%,0)`,
          );

          context.fillStyle = glow;

          context.beginPath();

          context.arc(
            trail.x,
            screenY,
            trail.size * 2.5,
            0,
            Math.PI * 2,
          );

          context.fill();
        },
      );
    };

    const drawBall = () => {
      const screenY =
        ball.y - camera.y;

      const isFire =
        liveCombo >= CFG.fireCombo;

      drawTrails();

      context.save();

      context.translate(
        ball.x,
        screenY,
      );

      context.rotate(
        ball.rotation,
      );

      const outerGlow =
        context.createRadialGradient(
          0,
          0,
          ball.r * 0.3,
          0,
          0,
          ball.r *
            (isFire ? 3.7 : 2.15),
        );

      outerGlow.addColorStop(
        0,
        isFire
          ? 'rgba(255,232,133,0.92)'
          : 'rgba(247,165,75,0.36)',
      );

      outerGlow.addColorStop(
        0.38,
        isFire
          ? 'rgba(255,103,25,0.54)'
          : 'rgba(247,165,75,0.14)',
      );

      outerGlow.addColorStop(
        1,
        'rgba(255,55,10,0)',
      );

      context.fillStyle =
        outerGlow;

      context.beginPath();

      context.arc(
        0,
        0,
        ball.r *
          (isFire ? 3.7 : 2.15),
        0,
        Math.PI * 2,
      );

      context.fill();

      const ballFill =
        context.createRadialGradient(
          -6,
          -7,
          2,
          1,
          2,
          ball.r * 1.32,
        );

      ballFill.addColorStop(
        0,
        isFire
          ? '#fff5ae'
          : '#ffd27c',
      );

      ballFill.addColorStop(
        0.38,
        isFire
          ? '#ff8e26'
          : '#ef8f36',
      );

      ballFill.addColorStop(
        1,
        isFire
          ? '#db2700'
          : '#9d3b20',
      );

      context.fillStyle =
        ballFill;

      context.shadowBlur =
        isFire ? 23 : 10;

      context.shadowColor = isFire
        ? '#ff5417'
        : 'rgba(241,132,45,0.65)';

      context.beginPath();

      context.arc(
        0,
        0,
        ball.r,
        0,
        Math.PI * 2,
      );

      context.fill();

      context.shadowBlur = 0;

      context.strokeStyle =
        'rgba(61,20,12,0.8)';

      context.lineWidth = 2;

      context.beginPath();

      context.arc(
        0,
        0,
        ball.r * 0.94,
        -0.66,
        0.66,
      );

      context.stroke();

      context.beginPath();

      context.arc(
        0,
        0,
        ball.r * 0.94,
        Math.PI - 0.66,
        Math.PI + 0.66,
      );

      context.stroke();

      context.beginPath();

      context.moveTo(
        -ball.r,
        0,
      );

      context.quadraticCurveTo(
        0,
        -4,
        ball.r,
        0,
      );

      context.stroke();

      context.beginPath();

      context.moveTo(
        0,
        -ball.r,
      );

      context.quadraticCurveTo(
        -4,
        0,
        0,
        ball.r,
      );

      context.stroke();

      context.restore();
    };

    const drawAim = () => {
      if (
        !aim.active ||
        livePhase !== 'ready'
      ) {
        return;
      }

      const pullX =
        ball.x - aim.x;

      const pullY =
        ball.y - aim.y;

      const pullDistance =
        Math.hypot(
          pullX,
          pullY,
        ) || 1;

      const distance = Math.min(
        CFG.maxPull,
        pullDistance,
      );

      const startVelocityX =
        (pullX / pullDistance) *
        distance *
        CFG.launchPower;

      const startVelocityY =
        (pullY / pullDistance) *
        distance *
        CFG.launchPower;

      context.save();

      context.lineCap = 'round';

      context.setLineDash([
        2.5,
        6,
      ]);

      context.lineWidth = 1.4;

      context.strokeStyle =
        `rgba(255,255,255,${0.13 + aim.power * 0.25})`;

      context.beginPath();

      context.moveTo(
        ball.x,
        ball.y - camera.y,
      );

      context.lineTo(
        lerp(
          ball.x,
          aim.x,
          0.76,
        ),
        lerp(
          ball.y,
          aim.y,
          0.76,
        ) - camera.y,
      );

      context.stroke();

      context.setLineDash([]);

      let previewX = ball.x;
      let previewY = ball.y;

      let previewVelocityX =
        startVelocityX;

      let previewVelocityY =
        startVelocityY;

      const previewStep = 0.056;

      for (
        let index = 1;
        index <= 11;
        index += 1
      ) {
        previewVelocityY +=
          CFG.gravity *
          previewStep;

        previewX +=
          previewVelocityX *
          previewStep;

        previewY +=
          previewVelocityY *
          previewStep;

        const alpha =
          1 - index / 12;

        context.fillStyle =
          liveCombo >=
          CFG.fireCombo
            ? `rgba(255,116,36,${alpha * 0.8})`
            : `rgba(255,255,255,${alpha * 0.48})`;

        context.beginPath();

        context.arc(
          previewX,
          previewY - camera.y,
          2 + alpha * 1.8,
          0,
          Math.PI * 2,
        );

        context.fill();
      }

      context.restore();
    };

    const drawEffects = () => {
      particles.forEach(
        (particle) => {
          const alpha = clamp(
            particle.life /
              particle.maxLife,
            0,
            1,
          );

          context.globalAlpha =
            alpha;

          context.fillStyle =
            `hsl(${particle.hue},100%,66%)`;

          context.shadowBlur = 9;

          context.shadowColor =
            `hsla(${particle.hue},100%,55%,0.78)`;

          context.beginPath();

          context.arc(
            particle.x,
            particle.y - camera.y,
            particle.size * alpha,
            0,
            Math.PI * 2,
          );

          context.fill();
        },
      );

      context.globalAlpha = 1;
      context.shadowBlur = 0;

      labels.forEach((item) => {
        const alpha = clamp(
          item.life / item.maxLife,
          0,
          1,
        );

        const scale =
          item.scale *
          (0.94 +
            (1 - alpha) * 0.18);

        context.save();

        context.translate(
          item.x,
          item.y - camera.y,
        );

        context.scale(
          scale,
          scale,
        );

        context.globalAlpha =
          alpha;

        context.textAlign =
          'center';

        context.textBaseline =
          'middle';

        context.font =
          '900 12px Supercell, system-ui, sans-serif';

        context.shadowBlur = 15;

        context.shadowColor =
          `hsla(${item.hue},100%,55%,0.88)`;

        context.fillStyle =
          `hsl(${item.hue},100%,70%)`;

        context.fillText(
          item.text,
          0,
          0,
        );

        context.restore();
      });

      if (missFlash > 0.01) {
        context.fillStyle =
          `rgba(255,38,77,${missFlash * 0.07})`;

        context.fillRect(
          0,
          0,
          viewport.width,
          viewport.height,
        );
      }
    };

    const render = () => {
      context.clearRect(
        0,
        0,
        viewport.width,
        viewport.height,
      );

      const shakeX =
        camera.shake > 0.1
          ? (random() - 0.5) *
            camera.shake
          : 0;

      const shakeY =
        camera.shake > 0.1
          ? (random() - 0.5) *
            camera.shake
          : 0;

      context.save();

      context.translate(
        shakeX,
        shakeY,
      );

      hoops.forEach(
        (hoop, index) =>
          drawHoop(
            hoop,
            index ===
              currentHoopIndex + 1,
            index ===
              currentHoopIndex,
          ),
      );

      drawAim();
      drawBall();
      drawEffects();

      context.restore();
    };

    const frame = (
      now: number,
    ) => {
      const deltaTime = Math.max(
        0,
        Math.min(
          34,
          now - previousFrame,
        ) / 1000,
      );

      previousFrame = now;

      updateNets(deltaTime);
      updateBall(deltaTime, now);
      updateEffects(deltaTime);
      render();

      frameRef.current =
        requestAnimationFrame(frame);
    };

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      if (livePhase !== 'ready') {
        return;
      }

      const point =
        pointerToWorld(
          event.clientX,
          event.clientY,
        );

      const distance = Math.hypot(
        point.x - ball.x,
        point.y - ball.y,
      );

      if (distance > 80) {
        return;
      }

      event.preventDefault();

      canvas.setPointerCapture(
        event.pointerId,
      );

      aim.active = true;
      aim.pointerId =
        event.pointerId;

      aim.x = point.x;
      aim.y = point.y;
      aim.power = 0;

      setHint(false);

      haptic('light');
    };

    const handlePointerMove = (
      event: PointerEvent,
    ) => {
      if (
        !aim.active ||
        aim.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const point =
        pointerToWorld(
          event.clientX,
          event.clientY,
        );

      const dx =
        point.x - ball.x;

      const dy =
        point.y - ball.y;

      const distance =
        Math.hypot(dx, dy) || 1;

      const pullDistance =
        Math.min(
          CFG.maxPull,
          distance,
        );

      aim.x =
        ball.x +
        (dx / distance) *
          pullDistance;

      aim.y =
        ball.y +
        (dy / distance) *
          pullDistance;

      aim.power =
        pullDistance / CFG.maxPull;
    };

    const releaseShot = (
      event: PointerEvent,
    ) => {
      if (
        !aim.active ||
        aim.pointerId !==
          event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const pullX =
        ball.x - aim.x;

      const pullY =
        ball.y - aim.y;

      const pullDistance =
        Math.hypot(
          pullX,
          pullY,
        );

      const power = aim.power;

      aim.active = false;
      aim.pointerId = null;

      if (pullDistance < 18) {
        return;
      }

      const speed = Math.min(
        CFG.maxLaunchSpeed,
        pullDistance *
          CFG.launchPower,
      );

      ball.vx =
        (pullX / pullDistance) *
        speed;

      ball.vy =
        (pullY / pullDistance) *
        speed;

      shotStartedAt =
        performance.now();

      rimTouched = false;
      leftOldHoop = false;

      changePhase('flying');

      haptic(
        power > 0.76
          ? 'medium'
          : 'light',
      );
    };

    const blockTouch = (
      event: TouchEvent,
    ) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    resize();

    window.addEventListener(
      'resize',
      resize,
    );

    canvas.addEventListener(
      'pointerdown',
      handlePointerDown,
    );

    canvas.addEventListener(
      'pointermove',
      handlePointerMove,
    );

    canvas.addEventListener(
      'pointerup',
      releaseShot,
    );

    canvas.addEventListener(
      'pointercancel',
      releaseShot,
    );

    root.addEventListener(
      'touchstart',
      blockTouch,
      {
        passive: false,
      },
    );

    root.addEventListener(
      'touchmove',
      blockTouch,
      {
        passive: false,
      },
    );

    frameRef.current =
      requestAnimationFrame(frame);

    return () => {
      if (
        frameRef.current !== null
      ) {
        cancelAnimationFrame(
          frameRef.current,
        );
      }

      window.removeEventListener(
        'resize',
        resize,
      );

      canvas.removeEventListener(
        'pointerdown',
        handlePointerDown,
      );

      canvas.removeEventListener(
        'pointermove',
        handlePointerMove,
      );

      canvas.removeEventListener(
        'pointerup',
        releaseShot,
      );

      canvas.removeEventListener(
        'pointercancel',
        releaseShot,
      );

      root.removeEventListener(
        'touchstart',
        blockTouch,
      );

      root.removeEventListener(
        'touchmove',
        blockTouch,
      );
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-[440px] w-full select-none overflow-hidden bg-transparent text-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar
              photoUrl={user?.photo_url}
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

                <span className="text-[6px] font-black uppercase tracking-[0.15em] text-white/28">
                  score
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-1 text-center">
            <div
              className={[
                'text-[18px] font-black leading-none tabular-nums',
                fire
                  ? 'text-[#ff8c36]'
                  : 'text-white/92',
              ].join(' ')}
            >
              x{Math.max(1, multiplier)}
            </div>

            <div className="mt-1 text-[6px] font-black uppercase tracking-[0.15em] text-white/28">
              combo {combo}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="max-w-[92px] truncate text-[9px] font-black leading-none text-white/90">
                {rivalName}
              </div>

              <div className="mt-1.5 flex items-baseline justify-end gap-1.5">
                <span className="text-[6px] font-black uppercase tracking-[0.15em] text-white/28">
                  score
                </span>

                <span className="text-[20px] font-black leading-none tabular-nums text-[#F2A65A]">
                  0
                </span>
              </div>
            </div>

            <Avatar
              name={rivalName}
              side="rival"
            />
          </div>
        </div>

        <div className="mx-auto mt-2 flex max-w-[480px] items-center justify-between px-1">
          <span className="text-[6px] font-black uppercase tracking-[0.15em] text-white/24">
            best {best}
          </span>

          <span
            className={[
              'text-[7px] font-black uppercase tracking-[0.18em]',
              fire
                ? 'text-[#ff9d55]'
                : 'text-white/28',
            ].join(' ')}
          >
            {phase === 'ready'
              ? 'PULL & RELEASE'
              : callout}
          </span>

          <span className="text-[6px] font-black uppercase tracking-[0.15em] text-white/24">
            duel preview
          </span>
        </div>
      </header>

      {hint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex justify-center px-4">
          <div className="animate-pulse text-[9px] font-black uppercase tracking-[0.17em] text-white/42">
            Потяни мяч и отпусти
          </div>
        </div>
      )}
    </div>
  );
};

export default DunkShotGame;