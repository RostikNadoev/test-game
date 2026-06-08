/**
 * TowerStackGame
 * --------------------------------------------------------------------------
 * Premium 1v1 Tower Stack duel for a Telegram Mini App.
 *
 * Visual direction:
 *   - Dark futuristic industrial arena rendered from `stackback.png`.
 *   - Circular glowing podium; the tower physically rises out of it.
 *   - Heavy graphite / dark-stone slabs with subtle cyan seams (no rainbow).
 *   - Pseudo-3D blocks, lightweight dust on impact, soft rim glow.
 *   - Minimal "expensive" duel HUD, clean system typography (no web fonts).
 *
 * Layout:
 *   - Fills the parent route / Telegram viewport height exactly, no overflow.
 *   - Vertical swipes / page scroll locked while the Mini App is open.
 *   - Safe-area aware so nothing hides behind the iPhone home indicator.
 *   - Works cleanly from 320px to 480px wide.
 *
 * Opponent:
 *   - Player only ever sees their OWN tower.
 *   - Rival score + action quality shown in the HUD, updated live.
 *   - Opponent data is isolated behind `useOpponentFeed`, fed by a swappable
 *     "driver". A bot driver is used now; a WebSocket driver can replace it
 *     later WITHOUT touching the component (see createBotDriver / notes).
 *
 * Performance:
 *   - Active block moves via ref + requestAnimationFrame (no per-frame state).
 *   - Background image is static; only one cheap GPU fog layer animates.
 *   - Glow / box-shadow limited to the active + most recent blocks.
 *   - All timers, rAF, intervals, listeners and Telegram listeners cleaned up.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';

import stackback from '../assets/stackback.png';

/* =========================================================================
 * TUNING
 * ====================================================================== */
const ROUND_DURATION_MS = 40_000;

/* Block geometry is responsive — these are the bounds. */
const BLOCK_HEIGHT_MIN = 20;
const BLOCK_HEIGHT_MAX = 28;
const BLOCK_WIDTH_RATIO = 0.46;
const BLOCK_WIDTH_MIN = 84;
const BLOCK_WIDTH_MAX = 172;

const MIN_OVERLAP = 1;
const MAX_RENDERED_BLOCKS = 20;

/* Scene anchoring (fractions of the stage). Tweak BASE_Y_RATIO to line the
 * tower base up with the podium in your specific stackback.png crop. */
const BASE_Y_RATIO = 0.18; // podium height from stage bottom
const TOP_MARGIN_RATIO = 0.16; // keep the active block away from the top edge
const ACTIVE_GAP_RATIO = 0.85; // hover gap above the tower (× block height)

const BLOCK_SPEED_START = 235;
const BLOCK_SPEED_RAMP = 8;
const BLOCK_SPEED_MAX = 480;

const PERFECT_THRESHOLD = 6;
const GREAT_THRESHOLD = 16;

const MISS_PENALTY = 40;

const SCORE: Record<BaseQuality, number> = {
  PERFECT: 100,
  GREAT: 60,
  GOOD: 30,
  MISS: -MISS_PENALTY,
};

const COMBO_THRESHOLD = 3;
const COMBO_BONUS = 25;

const BOT_MIN_INTERVAL_MS = 820;
const BOT_MAX_INTERVAL_MS = 1480;
const BOT_QUALITY_WEIGHTS = {
  PERFECT: 0.3,
  GREAT: 0.36,
  GOOD: 0.22,
  MISS: 0.12,
};

/* =========================================================================
 * TYPES
 * ====================================================================== */
type BaseQuality = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';
type Quality = BaseQuality | 'COMBO';
type Phase = 'ready' | 'countdown' | 'playing' | 'result';
type Outcome = 'win' | 'lose' | 'draw';
type HapticKind = 'tap' | 'success' | 'error' | 'start';

interface PlacedBlock {
  id: number;
  level: number;
  x: number;
  width: number;
}

interface SlicePiece {
  id: number;
  level: number;
  x: number;
  width: number;
  drift: number;
}

interface DustPiece {
  id: number;
  level: number;
  x: number;
  dx: number;
  dy: number;
}

interface FloatingFx {
  id: number;
  level: number;
  label: Quality;
  points: number;
}

interface StageMetrics {
  stageW: number;
  stageH: number;
  blockH: number;
  baseY: number;
  activeGap: number;
  topMargin: number;
}

export interface OpponentEvent {
  quality: Quality;
  scoreDelta: number;
  totalScore: number;
  combo: number;
  ts: number;
}

export interface TowerStackGameProps {
  onExit?: () => void;
}

/* =========================================================================
 * HELPERS
 * ====================================================================== */
const clamp = (n: number, min: number, max: number) =>
  n < min ? min : n > max ? max : n;

const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));

const clampScore = (n: number) => (n < 0 ? 0 : n);

function resolveMove(
  base: BaseQuality,
  prevCombo: number,
): { label: Quality; points: number; combo: number } {
  const strong = base === 'PERFECT' || base === 'GREAT';
  const combo = strong ? prevCombo + 1 : 0;

  let points = SCORE[base];
  let label: Quality = base;

  if (strong && combo >= COMBO_THRESHOLD) {
    points += COMBO_BONUS * (combo - COMBO_THRESHOLD + 1);
    label = 'COMBO';
  }

  return { label, points, combo };
}

function botBaseQuality(): BaseQuality {
  const r = Math.random();
  const w = BOT_QUALITY_WEIGHTS;

  if (r < w.PERFECT) return 'PERFECT';
  if (r < w.PERFECT + w.GREAT) return 'GREAT';
  if (r < w.PERFECT + w.GREAT + w.GOOD) return 'GOOD';

  return 'MISS';
}

/* Telegram WebApp typing (only the bits we touch). */
interface TelegramWebApp {
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  HapticFeedback?: {
    impactOccurred?: (
      style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft',
    ) => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
}

const getTelegram = (): TelegramWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram
    ?.WebApp;

function triggerHaptic(kind: HapticKind = 'tap') {
  const tg = getTelegram();

  try {
    if (kind === 'success') {
      tg?.HapticFeedback?.notificationOccurred?.('success');
      navigator.vibrate?.(22);
      return;
    }

    if (kind === 'error') {
      tg?.HapticFeedback?.notificationOccurred?.('error');
      navigator.vibrate?.([26, 22, 26]);
      return;
    }

    if (kind === 'start') {
      tg?.HapticFeedback?.impactOccurred?.('medium');
      navigator.vibrate?.(24);
      return;
    }

    tg?.HapticFeedback?.selectionChanged?.();
    tg?.HapticFeedback?.impactOccurred?.('light');
    navigator.vibrate?.(12);
  } catch {
    // Haptics are always optional.
  }
}

/* =========================================================================
 * OPPONENT FEED (online-ready)
 * --------------------------------------------------------------------------
 * The component never knows whether the rival is a bot or a remote player.
 * It just subscribes to an OpponentDriver. To go live later, write
 * `createSocketDriver(url)` returning the same { start, stop } shape and swap
 * the one line inside useOpponentFeed — nothing else changes.
 * ====================================================================== */
interface OpponentDriver {
  start: (emit: (event: OpponentEvent) => void) => void;
  stop: () => void;
}

function createBotDriver(): OpponentDriver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let score = 0;
  let combo = 0;

  return {
    start(emit) {
      const tick = () => {
        if (cancelled) return;

        const resolved = resolveMove(botBaseQuality(), combo);

        combo = resolved.combo;
        score = clampScore(score + resolved.points);

        emit({
          quality: resolved.label,
          scoreDelta: resolved.points,
          totalScore: score,
          combo,
          ts: Date.now(),
        });

        timer = setTimeout(
          tick,
          randInt(BOT_MIN_INTERVAL_MS, BOT_MAX_INTERVAL_MS),
        );
      };

      timer = setTimeout(tick, randInt(BOT_MIN_INTERVAL_MS, BOT_MAX_INTERVAL_MS));
    },
    stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/*
 * Example future driver (left here as documentation, intentionally unused):
 *
 * function createSocketDriver(url: string): OpponentDriver {
 *   let ws: WebSocket | null = null;
 *   return {
 *     start(emit) {
 *       ws = new WebSocket(url);
 *       ws.onmessage = (e) => emit(JSON.parse(e.data) as OpponentEvent);
 *     },
 *     stop() { ws?.close(); ws = null; },
 *   };
 * }
 */

function useOpponentFeed({
  active,
  onEvent,
}: {
  active: boolean;
  onEvent: (event: OpponentEvent) => void;
}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!active) return;

    // Swap this single line for createSocketDriver(url) to go online.
    const driver = createBotDriver();

    driver.start((event) => onEventRef.current(event));

    return () => driver.stop();
  }, [active]);
}

/* =========================================================================
 * COMPONENT
 * ====================================================================== */
export function TowerStackGame({ onExit }: TowerStackGameProps = {}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState(3);

  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentQuality, setOpponentQuality] = useState<Quality | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(ROUND_DURATION_MS / 1000);
  const [placed, setPlaced] = useState<PlacedBlock[]>([]);
  const [slices, setSlices] = useState<SlicePiece[]>([]);
  const [dust, setDust] = useState<DustPiece[]>([]);
  const [fx, setFx] = useState<FloatingFx[]>([]);
  const [activeWidth, setActiveWidth] = useState(BLOCK_WIDTH_MIN);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const [metrics, setMetrics] = useState<StageMetrics>({
    stageW: 0,
    stageH: 0,
    blockH: BLOCK_HEIGHT_MAX,
    baseY: 0,
    activeGap: 0,
    topMargin: 0,
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);

  /* live geometry for the rAF loop (no re-render) */
  const stageWidthRef = useRef(0);
  const minXRef = useRef(0);
  const maxXRef = useRef(0);
  const xRef = useRef(0);
  const dirRef = useRef(1);
  const speedRef = useRef(BLOCK_SPEED_START);

  const topXRef = useRef(0);
  const topWidthRef = useRef(BLOCK_WIDTH_MIN);
  const placedCountRef = useRef(1);
  const comboRef = useRef(0);
  const spawnSideRef = useRef(1);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef(0);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextId = () => idRef.current++;

  /* ---- fit inside the route / Telegram viewport ----------------------- */
  const applyViewportHeight = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const parentHeight = root.parentElement?.clientHeight ?? 0;
    const tg = getTelegram();
    const tgHeight = tg?.viewportStableHeight || tg?.viewportHeight;
    const fallbackHeight = window.innerHeight;

    const height = Math.floor(
      parentHeight > 0 ? parentHeight : tgHeight || fallbackHeight,
    );

    root.style.setProperty('--tsq-h', `${height}px`);
  }, []);

  useLayoutEffect(() => {
    applyViewportHeight();
  }, [applyViewportHeight]);

  /* ---- Telegram setup + scroll / swipe lock --------------------------- */
  useEffect(() => {
    const tg = getTelegram();

    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.disableVerticalSwipes?.();
    } catch {
      // Ignore outside Telegram.
    }

    applyViewportHeight();

    const root = rootRef.current;
    const preventTouchMove = (event: TouchEvent) => {
      // Stop the page / Mini App from dragging behind the game.
      event.preventDefault();
    };

    root?.addEventListener('touchmove', preventTouchMove, { passive: false });
    window.addEventListener('resize', applyViewportHeight);
    tg?.onEvent?.('viewportChanged', applyViewportHeight);

    return () => {
      root?.removeEventListener('touchmove', preventTouchMove);
      window.removeEventListener('resize', applyViewportHeight);
      tg?.offEvent?.('viewportChanged', applyViewportHeight);

      try {
        tg?.enableVerticalSwipes?.();
      } catch {
        // Ignore outside Telegram.
      }
    };
  }, [applyViewportHeight]);

  /* ---- geometry / responsive metrics ---------------------------------- */
  const recomputeBounds = useCallback((width: number) => {
    const stageW = stageWidthRef.current;

    minXRef.current = 0;
    maxXRef.current = Math.max(0, stageW - width);

    if (xRef.current > maxXRef.current) {
      xRef.current = maxXRef.current;
    }
  }, []);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;

    stageWidthRef.current = stageW;

    const blockH = Math.round(clamp(stageW * 0.072, BLOCK_HEIGHT_MIN, BLOCK_HEIGHT_MAX));
    const baseY = Math.round(Math.max(64, stageH * BASE_Y_RATIO));
    const activeGap = Math.round(blockH * ACTIVE_GAP_RATIO);
    const topMargin = Math.round(clamp(stageH * TOP_MARGIN_RATIO, 44, 120));

    const root = rootRef.current;
    root?.style.setProperty('--tsq-block-h', `${blockH}px`);
    root?.style.setProperty('--tsq-base-y', `${baseY}px`);

    setMetrics({ stageW, stageH, blockH, baseY, activeGap, topMargin });
    recomputeBounds(topWidthRef.current);
  }, [recomputeBounds]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  /* ---- animation loop (active block only) ----------------------------- */
  const stepLoop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);

    lastTsRef.current = ts;

    let x = xRef.current + dirRef.current * speedRef.current * dt;

    if (x <= minXRef.current) {
      x = minXRef.current;
      dirRef.current = 1;
    } else if (x >= maxXRef.current) {
      x = maxXRef.current;
      dirRef.current = -1;
    }

    xRef.current = x;

    const el = activeBlockRef.current;
    if (el) {
      el.style.transform = `translate3d(${x}px,0,0)`;
    }

    rafRef.current = requestAnimationFrame(stepLoop);
  }, []);

  const startLoop = useCallback(() => {
    lastTsRef.current = 0;

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(stepLoop);
    }
  }, [stepLoop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /* ---- active block spawn --------------------------------------------- */
  const spawnActiveBlock = useCallback(() => {
    const width = topWidthRef.current;

    recomputeBounds(width);

    const fromLeft = spawnSideRef.current > 0;
    spawnSideRef.current *= -1;

    xRef.current = fromLeft ? minXRef.current : maxXRef.current;
    dirRef.current = fromLeft ? 1 : -1;

    speedRef.current = Math.min(
      BLOCK_SPEED_MAX,
      BLOCK_SPEED_START + (placedCountRef.current - 1) * BLOCK_SPEED_RAMP,
    );

    setActiveWidth(width);

    const el = activeBlockRef.current;
    if (el) {
      el.style.transform = `translate3d(${xRef.current}px,0,0)`;
    }
  }, [recomputeBounds]);

  /* keep the active block positioned when it first appears */
  useLayoutEffect(() => {
    if (phase === 'countdown' || phase === 'playing') {
      const el = activeBlockRef.current;
      if (el) {
        el.style.transform = `translate3d(${xRef.current}px,0,0)`;
      }
    }
  }, [phase]);

  /* ---- feedback ------------------------------------------------------- */
  const pushFx = useCallback((label: Quality, points: number, level: number) => {
    const id = nextId();

    setFx((prev) => [...prev, { id, label, points, level }]);

    const timeout = setTimeout(() => {
      setFx((prev) => prev.filter((item) => item.id !== id));
    }, 680);

    timeoutsRef.current.push(timeout);
  }, []);

  const pulse = useCallback((kind: 'good' | 'bad') => {
    setFlash(kind);

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    flashTimeoutRef.current = setTimeout(() => {
      setFlash(null);
    }, 200);
  }, []);

  const spawnSlice = useCallback(
    (level: number, x: number, width: number, drift: number) => {
      const id = nextId();

      setSlices((prev) => [...prev, { id, level, x, width, drift }]);

      const timeout = setTimeout(() => {
        setSlices((prev) => prev.filter((slice) => slice.id !== id));
      }, 480);

      timeoutsRef.current.push(timeout);
    },
    [],
  );

  const spawnDust = useCallback((level: number, centerX: number) => {
    const pieces: DustPiece[] = [];
    const count = 5;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * (0.15 + Math.random() * 0.7));
      const speed = 18 + Math.random() * 26;

      pieces.push({
        id: nextId(),
        level,
        x: centerX + (Math.random() - 0.5) * 24,
        dx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
        dy: -(8 + Math.random() * 18),
      });
    }

    setDust((prev) => [...prev, ...pieces]);

    const ids = pieces.map((p) => p.id);
    const timeout = setTimeout(() => {
      setDust((prev) => prev.filter((p) => !ids.includes(p.id)));
    }, 460);

    timeoutsRef.current.push(timeout);
  }, []);

  /* ---- player move ---------------------------------------------------- */
  const placeBlock = useCallback(() => {
    if (phase !== 'playing') return;

    const currentWidth = topWidthRef.current;
    const activeX = xRef.current;
    const prevX = topXRef.current;
    const signedOffset = activeX - prevX;
    const offset = Math.abs(signedOffset);
    const overlap = currentWidth - offset;
    const level = placedCountRef.current;

    if (overlap < MIN_OVERLAP) {
      comboRef.current = 0;

      const resolved = resolveMove('MISS', 0);

      setPlayerScore((score) => clampScore(score + resolved.points));
      pushFx('MISS', resolved.points, level - 1);
      triggerHaptic('error');
      pulse('bad');
      spawnActiveBlock();

      return;
    }

    let base: BaseQuality;
    let newX: number;
    let newWidth: number;

    if (offset <= PERFECT_THRESHOLD) {
      base = 'PERFECT';
      newX = prevX;
      newWidth = currentWidth;
    } else {
      base = offset <= GREAT_THRESHOLD ? 'GREAT' : 'GOOD';
      newX = Math.round(Math.max(activeX, prevX));
      newWidth = Math.round(overlap);

      const sliceWidth = Math.round(offset);
      const sliceX =
        signedOffset > 0 ? Math.round(prevX + currentWidth) : Math.round(activeX);

      spawnSlice(level, sliceX, sliceWidth, signedOffset > 0 ? 1 : -1);
    }

    const resolved = resolveMove(base, comboRef.current);

    comboRef.current = resolved.combo;
    placedCountRef.current += 1;

    topXRef.current = newX;
    topWidthRef.current = newWidth;

    const block: PlacedBlock = {
      id: nextId(),
      level,
      x: newX,
      width: newWidth,
    };

    setPlaced((prev) => {
      const next = [...prev, block];

      return next.length > MAX_RENDERED_BLOCKS
        ? next.slice(next.length - MAX_RENDERED_BLOCKS)
        : next;
    });

    setPlayerScore((score) => clampScore(score + resolved.points));
    pushFx(resolved.label, resolved.points, level);

    if (base === 'PERFECT' || resolved.label === 'COMBO') {
      triggerHaptic('success');
      pulse('good');
      spawnDust(level, newX + newWidth / 2);
    } else if (base === 'GREAT') {
      triggerHaptic('tap');
      spawnDust(level, newX + newWidth / 2);
    } else {
      triggerHaptic('tap');
    }

    spawnActiveBlock();
  }, [phase, pulse, pushFx, spawnActiveBlock, spawnSlice, spawnDust]);

  /* ---- opponent ------------------------------------------------------- */
  const handleOpponentEvent = useCallback((event: OpponentEvent) => {
    setOpponentScore(event.totalScore);
    setOpponentQuality(event.quality);
  }, []);

  useOpponentFeed({ active: phase === 'playing', onEvent: handleOpponentEvent });

  /* ---- countdown ------------------------------------------------------ */
  useEffect(() => {
    if (phase !== 'countdown') return;

    setCountdown(3);
    triggerHaptic('start');

    const timers = [
      setTimeout(() => {
        setCountdown(2);
        triggerHaptic('tap');
      }, 1_000),
      setTimeout(() => {
        setCountdown(1);
        triggerHaptic('tap');
      }, 2_000),
      setTimeout(() => {
        triggerHaptic('success');
        setPhase('playing');
      }, 3_000),
    ];

    countdownTimersRef.current = timers;

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [phase]);

  /* ---- round clock ---------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'playing') return;

    endAtRef.current = Date.now() + ROUND_DURATION_MS;
    setSecondsLeft(ROUND_DURATION_MS / 1000);

    clockRef.current = setInterval(() => {
      const remaining = endAtRef.current - Date.now();

      if (remaining <= 0) {
        if (clockRef.current) {
          clearInterval(clockRef.current);
        }

        setSecondsLeft(0);
        setPhase('result');

        return;
      }

      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 200);

    return () => {
      if (clockRef.current) {
        clearInterval(clockRef.current);
      }
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'result') return;

    setOutcome(
      playerScore > opponentScore
        ? 'win'
        : playerScore < opponentScore
          ? 'lose'
          : 'draw',
    );
  }, [phase, playerScore, opponentScore]);

  useEffect(() => {
    if (phase === 'playing') {
      startLoop();
    } else {
      stopLoop();
    }

    return stopLoop;
  }, [phase, startLoop, stopLoop]);

  /* ---- unmount cleanup ------------------------------------------------ */
  useEffect(() => {
    return () => {
      stopLoop();

      if (clockRef.current) clearInterval(clockRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);

      countdownTimersRef.current.forEach(clearTimeout);
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [stopLoop]);

  /* ---- start / reset -------------------------------------------------- */
  const resetGame = useCallback(() => {
    applyViewportHeight();
    measure();

    const stageW = stageWidthRef.current;
    const baseWidth = Math.round(
      clamp(stageW * BLOCK_WIDTH_RATIO, BLOCK_WIDTH_MIN, BLOCK_WIDTH_MAX),
    );
    const center = Math.round((stageW - baseWidth) / 2);

    placedCountRef.current = 1;
    comboRef.current = 0;
    speedRef.current = BLOCK_SPEED_START;
    spawnSideRef.current = 1;

    topXRef.current = center;
    topWidthRef.current = baseWidth;

    xRef.current = center;
    dirRef.current = 1;

    recomputeBounds(baseWidth);

    setPlaced([{ id: nextId(), level: 0, x: center, width: baseWidth }]);
    setSlices([]);
    setDust([]);
    setFx([]);
    setOutcome(null);
    setPlayerScore(0);
    setOpponentScore(0);
    setOpponentQuality(null);
    setSecondsLeft(ROUND_DURATION_MS / 1000);
    setActiveWidth(baseWidth);
    setFlash(null);
    setCountdown(3);
  }, [applyViewportHeight, measure, recomputeBounds]);

  const startCountdown = useCallback(() => {
    resetGame();
    setPhase('countdown');
  }, [resetGame]);

  /* ---- input ---------------------------------------------------------- */
  const onSurfacePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();

      if (phase === 'playing') {
        placeBlock();
      }
    },
    [phase, placeBlock],
  );

  /* ---- derived layout ------------------------------------------------- */
  const topLevel = placed.length ? placed[placed.length - 1].level : 0;
  const { baseY, blockH, activeGap, stageH, topMargin } = metrics;

  /* world camera: keep the active block near a comfortable top line; the
   * tower stays planted on the podium until it grows tall, then it rises. */
  const activeTopFromBottom = baseY + (topLevel + 1) * blockH + activeGap + blockH;
  const cameraPx = Math.max(0, activeTopFromBottom - (stageH - topMargin));
  const activeBottom = baseY + (topLevel + 1) * blockH + activeGap;

  const lowTime = secondsLeft <= 10;

  const worldStyle = useMemo<CSSProperties>(
    () => ({ transform: `translate3d(0, ${cameraPx}px, 0)` }),
    [cameraPx],
  );

  return (
    <div ref={rootRef} className="tsq-root">
      <style>{STYLES}</style>

      {/* ---- scene background -------------------------------------- */}
      <div
        className="tsq-scene-bg"
        style={{ backgroundImage: `url(${stackback})` }}
        aria-hidden
      />
      <div className="tsq-scene-fog" aria-hidden />
      <div className="tsq-scene-vignette" aria-hidden />

      {/* ---- HUD --------------------------------------------------- */}
      <header className="tsq-hud">
        <div className="tsq-side tsq-side--you">
          <span className="tsq-side__tag">YOU</span>
          <span className="tsq-side__score">{playerScore}</span>
        </div>

        <div className="tsq-clock" aria-label="time remaining">
          <div className={`tsq-clock__num ${lowTime ? 'is-low' : ''}`}>
            {secondsLeft}
            <span className="tsq-clock__unit">s</span>
          </div>

          <div className="tsq-clock__bar">
            <span
              key={phase === 'playing' ? 'run' : 'idle'}
              className={`tsq-clock__fill ${
                phase === 'playing' ? 'is-running' : ''
              } ${lowTime ? 'is-low' : ''}`}
              style={{ animationDuration: `${ROUND_DURATION_MS}ms` }}
            />
          </div>
        </div>

        <div className="tsq-side tsq-side--rival">
          <span className="tsq-side__tag">RIVAL</span>
          <span className="tsq-side__score">{opponentScore}</span>
          <span
            key={`${opponentScore}-${opponentQuality ?? ''}`}
            className={`tsq-rival-q q-${(opponentQuality ?? 'wait').toLowerCase()}`}
          >
            {opponentQuality ?? '—'}
          </span>
        </div>
      </header>

      {/* ---- stage ------------------------------------------------- */}
      <main className="tsq-stage-wrap" onPointerDown={onSurfacePointerDown}>
        {flash && <div className={`tsq-flash is-${flash}`} aria-hidden />}

        <div className="tsq-stage" ref={stageRef}>
          {/* glowing podium the tower rises out of */}
          <div className="tsq-podium" aria-hidden>
            <span className="tsq-podium__glow" />
            <span className="tsq-podium__ring" />
          </div>

          <div className="tsq-world" style={worldStyle}>
            {placed.map((block) => {
              const recent = block.level >= topLevel - 1;

              return (
                <div
                  key={block.id}
                  className={`tsq-block tsq-block--placed ${
                    recent ? 'is-recent' : ''
                  }`}
                  style={{
                    width: block.width,
                    height: blockH,
                    left: block.x,
                    bottom: baseY + block.level * blockH,
                  }}
                >
                  <span className="tsq-block__seam" />
                </div>
              );
            })}

            {slices.map((slice) => (
              <div
                key={slice.id}
                className="tsq-slice"
                style={
                  {
                    width: slice.width,
                    height: blockH,
                    left: slice.x,
                    bottom: baseY + slice.level * blockH,
                    '--dx': `${slice.drift * 30}px`,
                    '--rot': `${slice.drift * 42}deg`,
                  } as CSSProperties
                }
              />
            ))}

            {dust.map((piece) => (
              <span
                key={piece.id}
                className="tsq-dust"
                style={
                  {
                    left: piece.x,
                    bottom: baseY + piece.level * blockH,
                    '--dx': `${piece.dx}px`,
                    '--dy': `${piece.dy}px`,
                  } as CSSProperties
                }
              />
            ))}

            {(phase === 'countdown' || phase === 'playing') && (
              <div
                ref={activeBlockRef}
                className="tsq-block tsq-block--active"
                style={{
                  width: activeWidth,
                  height: blockH,
                  left: 0,
                  bottom: activeBottom,
                }}
              >
                <span className="tsq-block__seam" />
              </div>
            )}

            {fx.map((item) => (
              <div
                key={item.id}
                className={`tsq-fx q-${item.label.toLowerCase()}`}
                style={{ bottom: baseY + (item.level + 1) * blockH + activeGap }}
              >
                <span className="tsq-fx__label">{item.label}</span>
                <span className="tsq-fx__pts">
                  {item.points >= 0 ? `+${item.points}` : item.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ---- ready overlay ----------------------------------------- */}
      {phase === 'ready' && (
        <div className="tsq-overlay">
          <div className="tsq-panel">
            <p className="tsq-panel__kicker">BATTLE CLUB · 1V1 DUEL</p>
            <h1 className="tsq-panel__title">TOWER&nbsp;STACK</h1>
            <p className="tsq-panel__sub">
              Ставь блоки ровно, срезай лишнее и набери больше очков за 40
              секунд. Промах снимает {MISS_PENALTY} очков.
            </p>

            <button type="button" className="tsq-cta" onClick={startCountdown}>
              START DUEL
            </button>
          </div>
        </div>
      )}

      {/* ---- countdown overlay ------------------------------------- */}
      {phase === 'countdown' && (
        <div className="tsq-countdown" aria-hidden>
          <div key={countdown} className="tsq-countdown__num">
            {countdown}
          </div>
          <div className="tsq-countdown__label">GET READY</div>
        </div>
      )}

      {/* ---- result overlay ---------------------------------------- */}
      {phase === 'result' && outcome && (
        <div className="tsq-overlay">
          <div className={`tsq-panel tsq-panel--${outcome}`}>
            <p className="tsq-panel__kicker">ROUND COMPLETE</p>

            <h1 className="tsq-panel__title tsq-result-title">
              {outcome === 'win'
                ? 'VICTORY'
                : outcome === 'lose'
                  ? 'DEFEAT'
                  : 'DRAW'}
            </h1>

            <div className="tsq-result-scores">
              <div className="tsq-result-scores__col">
                <span>YOU</span>
                <strong>{playerScore}</strong>
              </div>

              <div className="tsq-result-scores__vs">VS</div>

              <div className="tsq-result-scores__col">
                <span>RIVAL</span>
                <strong>{opponentScore}</strong>
              </div>
            </div>

            <button type="button" className="tsq-cta" onClick={startCountdown}>
              PLAY AGAIN
            </button>

            {onExit && (
              <button type="button" className="tsq-ghost" onClick={onExit}>
                Leave
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TowerStackGame;

/* =========================================================================
 * STYLES
 * ====================================================================== */
const STYLES = `
.tsq-root{
  --tsq-h: 100%;
  --tsq-block-h: 26px;
  --tsq-base-y: 90px;

  --ink:#e9f1f7;
  --muted:#7d8aa0;
  --cyan:#36d6f2;
  --cyan-soft:rgba(54,214,242,.16);
  --rival:#ff5d82;
  --glass:rgba(16,22,33,.52);
  --glass-line:rgba(120,150,180,.16);

  --font-display: ui-monospace, "SF Mono", "Segoe UI Mono", "Roboto Mono",
    Menlo, Consolas, monospace;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  position:relative;
  width:100%;
  height:var(--tsq-h);
  max-height:var(--tsq-h);
  min-height:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  background:#05070d;
  color:var(--ink);
  font-family:var(--font-body);
  padding-bottom:env(safe-area-inset-bottom, 0px);
  -webkit-tap-highlight-color:transparent;
  user-select:none;
  -webkit-user-select:none;
  touch-action:none;
  overscroll-behavior:none;
}

.tsq-root *{ box-sizing:border-box; }

/* ---------------- SCENE ---------------- */
.tsq-scene-bg{
  position:absolute;
  inset:0;
  z-index:0;
  background-position:center bottom;
  background-size:cover;
  background-repeat:no-repeat;
  background-color:#05070d;
}

.tsq-scene-fog{
  position:absolute;
  inset:-12% -20%;
  z-index:1;
  pointer-events:none;
  opacity:.5;
  background:
    radial-gradient(40% 30% at 30% 72%, rgba(54,214,242,.14), transparent 70%),
    radial-gradient(46% 34% at 72% 66%, rgba(70,120,200,.12), transparent 72%);
  animation:tsq-fog 26s ease-in-out infinite alternate;
  will-change:transform;
}

.tsq-scene-vignette{
  position:absolute;
  inset:0;
  z-index:2;
  pointer-events:none;
  background:
    radial-gradient(130% 80% at 50% 18%, transparent 38%, rgba(3,5,11,.78) 100%),
    linear-gradient(180deg, rgba(4,6,12,.55) 0%, rgba(4,6,12,0) 26%,
      rgba(4,6,12,0) 60%, rgba(4,6,12,.42) 100%);
}

/* ---------------- HUD ---------------- */
.tsq-hud{
  position:relative;
  z-index:10;
  flex:0 0 auto;
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:start;
  gap:8px;
  padding:calc(env(safe-area-inset-top, 0px) + 6px) 10px 4px;
}

.tsq-side{
  display:flex;
  flex-direction:column;
  min-width:0;
  padding:6px 11px;
  border-radius:13px;
  background:var(--glass);
  border:1px solid var(--glass-line);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
}

.tsq-side--rival{ align-items:flex-end; text-align:right; }

.tsq-side__tag{
  font-size:9px;
  line-height:1;
  letter-spacing:.24em;
  font-weight:700;
  color:var(--muted);
}
.tsq-side--you .tsq-side__tag{ color:var(--cyan); }
.tsq-side--rival .tsq-side__tag{ color:var(--rival); }

.tsq-side__score{
  margin-top:4px;
  font-family:var(--font-display);
  font-weight:700;
  font-size:22px;
  line-height:1;
  font-variant-numeric:tabular-nums;
  letter-spacing:.02em;
}
.tsq-side--you .tsq-side__score{ text-shadow:0 0 16px rgba(54,214,242,.34); }
.tsq-side--rival .tsq-side__score{ text-shadow:0 0 16px rgba(255,93,130,.32); }

.tsq-rival-q{
  margin-top:4px;
  min-height:15px;
  padding:2px 8px;
  border-radius:999px;
  font-size:10px;
  line-height:1.1;
  font-weight:700;
  letter-spacing:.14em;
  animation:tsq-pop .26s ease;
}
.q-perfect{ color:#a9f4ff; background:rgba(54,214,242,.16); }
.q-great{ color:#bcd6ff; background:rgba(96,150,235,.16); }
.q-good{ color:#e7d8b4; background:rgba(200,170,110,.14); }
.q-miss{ color:#ffb2c4; background:rgba(255,93,130,.16); }
.q-combo{
  color:#fff;
  background:linear-gradient(90deg, rgba(54,214,242,.4), rgba(255,93,130,.4));
}
.q-wait{ color:var(--muted); background:transparent; }

.tsq-clock{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:5px;
}
.tsq-clock__num{
  font-family:var(--font-display);
  font-weight:700;
  font-size:25px;
  line-height:1;
  font-variant-numeric:tabular-nums;
  transition:color .25s;
  text-shadow:0 0 18px rgba(54,214,242,.22);
}
.tsq-clock__num.is-low{
  color:#ff6b8b;
  text-shadow:0 0 18px rgba(255,93,130,.55);
  animation:tsq-pulse 1s infinite;
}
.tsq-clock__unit{ margin-left:1px; font-size:11px; color:var(--muted); }

.tsq-clock__bar{
  width:88px;
  height:4px;
  overflow:hidden;
  border-radius:99px;
  background:rgba(255,255,255,.1);
}
.tsq-clock__fill{
  display:block;
  width:100%;
  height:100%;
  border-radius:99px;
  transform-origin:left center;
  background:linear-gradient(90deg, var(--cyan), #4d8cff);
}
.tsq-clock__fill.is-running{
  animation-name:tsq-drain;
  animation-timing-function:linear;
  animation-fill-mode:forwards;
}
.tsq-clock__fill.is-low{ background:linear-gradient(90deg, #ff9a5c, var(--rival)); }

/* ---------------- STAGE ---------------- */
.tsq-stage-wrap{
  position:relative;
  z-index:5;
  flex:1 1 auto;
  min-height:0;
  overflow:hidden;
  touch-action:none;
}

.tsq-flash{
  position:absolute;
  inset:0;
  z-index:8;
  pointer-events:none;
  opacity:0;
}
.tsq-flash.is-good{
  box-shadow:inset 0 0 70px rgba(54,214,242,.3);
  animation:tsq-flash .2s ease;
}
.tsq-flash.is-bad{
  box-shadow:inset 0 0 72px rgba(255,93,130,.36);
  animation:tsq-flash .22s ease;
}

.tsq-stage{
  position:absolute;
  inset:0;
}

/* ---- podium the tower rises out of ---- */
.tsq-podium{
  position:absolute;
  left:50%;
  bottom:var(--tsq-base-y);
  transform:translate(-50%, 50%);
  width:min(78%, 320px);
  height:78px;
  pointer-events:none;
  z-index:1;
}
.tsq-podium__glow{
  position:absolute;
  inset:0;
  border-radius:50%;
  background:radial-gradient(ellipse at center,
    rgba(54,214,242,.32) 0%,
    rgba(54,214,242,.1) 46%,
    transparent 70%);
  filter:blur(2px);
}
.tsq-podium__ring{
  position:absolute;
  left:8%;
  right:8%;
  top:36%;
  height:34%;
  border-radius:50%;
  border:1px solid rgba(120,220,245,.4);
  box-shadow:
    0 0 18px rgba(54,214,242,.3),
    inset 0 0 14px rgba(54,214,242,.18);
}

/* ---- world (camera-translated block container) ---- */
.tsq-world{
  position:absolute;
  inset:0;
  z-index:2;
  will-change:transform;
  transition:transform .22s cubic-bezier(.22,1,.36,1);
}

/* ---------------- BLOCKS (graphite stone) ---------------- */
.tsq-block{
  position:absolute;
  border-radius:5px;
  background:
    linear-gradient(180deg, #323a4c 0%, #232a39 52%, #161b27 100%);
  border:1px solid rgba(130,150,180,.1);
  box-shadow:
    inset 0 1px 0 rgba(200,220,245,.08),
    inset -3px 0 7px rgba(0,0,0,.42),
    inset 0 -3px 7px rgba(0,0,0,.5);
}

/* top highlight + faint stone scratches, all cheap (no filters) */
.tsq-block::before{
  content:"";
  position:absolute;
  left:6%;
  right:34%;
  top:2px;
  height:3px;
  border-radius:3px;
  pointer-events:none;
  background:linear-gradient(90deg, rgba(190,210,235,.32), transparent);
}
.tsq-block::after{
  content:"";
  position:absolute;
  inset:0;
  border-radius:5px;
  pointer-events:none;
  background:
    linear-gradient(270deg, rgba(0,0,0,.34), transparent 28%),
    repeating-linear-gradient(116deg,
      rgba(220,235,255,.03) 0 1px, transparent 1px 8px);
}

/* cyan glowing bottom seam — calm for old blocks */
.tsq-block__seam{
  position:absolute;
  left:7%;
  right:7%;
  bottom:1px;
  height:1px;
  border-radius:2px;
  background:rgba(54,214,242,.22);
}

.tsq-block--placed{ z-index:1; animation:tsq-drop .16s cubic-bezier(.22,1,.36,1); }

/* only the most recent placements get glow */
.tsq-block--placed.is-recent{
  border-color:rgba(54,214,242,.18);
  box-shadow:
    inset 0 1px 0 rgba(200,220,245,.1),
    inset -3px 0 7px rgba(0,0,0,.4),
    0 0 14px rgba(54,214,242,.16);
}
.tsq-block--placed.is-recent .tsq-block__seam{
  background:rgba(54,214,242,.7);
  box-shadow:0 0 10px rgba(54,214,242,.55);
}

.tsq-block--active{
  z-index:4;
  border-color:rgba(54,214,242,.28);
  box-shadow:
    inset 0 1px 0 rgba(210,230,250,.14),
    inset -3px 0 7px rgba(0,0,0,.4),
    0 0 20px rgba(54,214,242,.3);
  animation:tsq-breathe 1.6s ease-in-out infinite;
}
.tsq-block--active .tsq-block__seam{
  height:2px;
  background:rgba(54,214,242,.92);
  box-shadow:0 0 12px rgba(54,214,242,.7);
}

/* ---- sliced-off pieces (cheap fall) ---- */
.tsq-slice{
  position:absolute;
  z-index:3;
  border-radius:4px;
  pointer-events:none;
  background:linear-gradient(180deg, #2b3243, #171c27);
  border:1px solid rgba(130,150,180,.08);
  box-shadow:inset 0 1px 0 rgba(200,220,245,.06);
  animation:tsq-slice-fall .46s cubic-bezier(.4,0,.7,1) forwards;
}

/* ---- impact dust ---- */
.tsq-dust{
  position:absolute;
  width:4px;
  height:4px;
  border-radius:50%;
  pointer-events:none;
  z-index:5;
  background:rgba(180,225,245,.7);
  box-shadow:0 0 6px rgba(54,214,242,.5);
  animation:tsq-dust .44s ease-out forwards;
}

/* ---------------- FLOATING LABELS (pure text) ---------------- */
.tsq-fx{
  position:absolute;
  left:50%;
  z-index:7;
  pointer-events:none;
  display:flex;
  flex-direction:column;
  align-items:center;
  transform:translateX(-50%);
  animation:tsq-rise .68s ease-out forwards;
}
.tsq-fx__label{
  font-family:var(--font-display);
  font-weight:700;
  font-size:20px;
  line-height:1;
  letter-spacing:.06em;
}
.tsq-fx__pts{
  margin-top:2px;
  font-size:12px;
  line-height:1;
  font-weight:700;
  color:rgba(220,232,245,.72);
}
.tsq-fx.q-perfect .tsq-fx__label{
  color:#7df3ff;
  text-shadow:0 0 14px rgba(54,214,242,.6);
}
.tsq-fx.q-great .tsq-fx__label{ color:#a9c6ff; }
.tsq-fx.q-good .tsq-fx__label{ color:#e7d3a3; }
.tsq-fx.q-miss .tsq-fx__label{ color:#ff7a99; }
.tsq-fx.q-miss .tsq-fx__pts{ color:#ff8aa6; }
.tsq-fx.q-combo .tsq-fx__label{
  color:#fff;
  text-shadow:0 0 16px rgba(54,214,242,.55), 0 0 24px rgba(255,93,130,.4);
}

/* ---------------- COUNTDOWN (no frame) ---------------- */
.tsq-countdown{
  position:absolute;
  inset:0;
  z-index:18;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  pointer-events:none;
  background:
    radial-gradient(circle at 50% 46%, rgba(54,214,242,.16), transparent 30%),
    rgba(3,5,11,.72);
  backdrop-filter:blur(2px) saturate(1.05);
  -webkit-backdrop-filter:blur(2px) saturate(1.05);
}
.tsq-countdown__num{
  font-family:var(--font-display);
  font-size:104px;
  line-height:.9;
  font-weight:700;
  color:#fff;
  letter-spacing:-.04em;
  text-shadow:
    0 0 26px rgba(54,214,242,.65),
    0 0 56px rgba(54,214,242,.3);
  animation:tsq-count .88s cubic-bezier(.22,1,.36,1);
}
.tsq-countdown__label{
  margin-top:18px;
  color:rgba(220,232,245,.6);
  font-size:11px;
  line-height:1;
  font-weight:700;
  letter-spacing:.28em;
}

/* ---------------- OVERLAYS ---------------- */
.tsq-overlay{
  position:absolute;
  inset:0;
  z-index:20;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));
  background:rgba(4,6,13,.66);
  backdrop-filter:blur(9px);
  -webkit-backdrop-filter:blur(9px);
  animation:tsq-fade .22s ease;
}
.tsq-panel{
  width:100%;
  max-width:360px;
  text-align:center;
  padding:26px 22px 22px;
  border-radius:22px;
  border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(22,30,44,.92), rgba(9,13,22,.95));
  box-shadow:
    0 36px 82px -30px rgba(0,0,0,.9),
    inset 0 1px 0 rgba(200,220,245,.1);
  animation:tsq-rise-in .3s cubic-bezier(.22,1,.36,1);
}
.tsq-panel__kicker{
  margin:0 0 10px;
  font-size:10px;
  letter-spacing:.28em;
  font-weight:700;
  color:var(--cyan);
}
.tsq-panel__title{
  margin:0;
  font-family:var(--font-display);
  font-weight:700;
  font-size:34px;
  line-height:1;
  letter-spacing:.02em;
  color:#eaf4fb;
  text-shadow:0 6px 26px rgba(54,214,242,.34);
}
.tsq-panel__sub{
  margin:14px 2px 20px;
  color:var(--muted);
  font-size:14px;
  line-height:1.45;
  font-weight:500;
}
.tsq-result-title{ font-size:42px; }
.tsq-panel--win .tsq-result-title{ color:#8df0ff; text-shadow:0 0 30px rgba(54,214,242,.5); }
.tsq-panel--lose .tsq-result-title{ color:#ff8aa6; text-shadow:0 0 30px rgba(255,93,130,.45); }
.tsq-panel--draw .tsq-result-title{ color:#e7eefc; }

.tsq-result-scores{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:16px;
  margin:8px 0 22px;
}
.tsq-result-scores__col{
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:74px;
}
.tsq-result-scores__col span{
  font-size:10px;
  letter-spacing:.2em;
  color:var(--muted);
  font-weight:700;
}
.tsq-result-scores__col strong{
  font-family:var(--font-display);
  font-size:30px;
  font-variant-numeric:tabular-nums;
}
.tsq-result-scores__col:first-child strong{ color:var(--cyan); }
.tsq-result-scores__col:last-child strong{ color:var(--rival); }
.tsq-result-scores__vs{
  font-family:var(--font-display);
  font-size:12px;
  color:var(--muted);
}

.tsq-cta{
  width:100%;
  height:54px;
  border:none;
  cursor:pointer;
  border-radius:15px;
  color:#04121a;
  font-family:var(--font-display);
  font-weight:700;
  font-size:14px;
  letter-spacing:.14em;
  background:linear-gradient(135deg, var(--cyan), #4d8cff);
  box-shadow:
    0 16px 40px -14px rgba(54,214,242,.6),
    inset 0 1px 0 rgba(255,255,255,.4);
  transition:transform .08s ease;
  touch-action:manipulation;
}
.tsq-cta:active{ transform:translateY(2px) scale(.985); }

.tsq-ghost{
  margin-top:12px;
  width:100%;
  height:40px;
  border:1px solid var(--glass-line);
  background:transparent;
  color:var(--muted);
  border-radius:12px;
  cursor:pointer;
  font-family:var(--font-body);
  font-weight:600;
  letter-spacing:.1em;
  font-size:13px;
  touch-action:manipulation;
}

/* ---------------- KEYFRAMES ---------------- */
@keyframes tsq-drain{ from{ transform:scaleX(1); } to{ transform:scaleX(0); } }

@keyframes tsq-breathe{
  0%,100%{ filter:brightness(1); }
  50%{ filter:brightness(1.1); }
}

@keyframes tsq-drop{
  0%{ transform:translateY(calc(var(--tsq-block-h) * -.9)); opacity:.6; }
  100%{ transform:translateY(0); opacity:1; }
}

@keyframes tsq-slice-fall{
  0%{ opacity:1; transform:translate3d(0,0,0) rotate(0); }
  100%{
    opacity:0;
    transform:translate3d(var(--dx), 120px, 0) rotate(var(--rot));
  }
}

@keyframes tsq-dust{
  0%{ opacity:.9; transform:translate3d(0,0,0) scale(1); }
  100%{
    opacity:0;
    transform:translate3d(var(--dx), calc(var(--dy) + 28px), 0) scale(.4);
  }
}

@keyframes tsq-rise{
  0%{ opacity:0; transform:translate(-50%,4px) scale(.86); }
  18%{ opacity:1; transform:translate(-50%,0) scale(1); }
  100%{ opacity:0; transform:translate(-50%,-34px) scale(1.02); }
}

@keyframes tsq-flash{ 0%{ opacity:0; } 32%{ opacity:1; } 100%{ opacity:0; } }

@keyframes tsq-pop{
  0%{ transform:scale(.7); opacity:0; }
  100%{ transform:scale(1); opacity:1; }
}

@keyframes tsq-pulse{
  0%,100%{ transform:scale(1); }
  50%{ transform:scale(1.1); }
}

@keyframes tsq-fade{ from{ opacity:0; } to{ opacity:1; } }

@keyframes tsq-rise-in{
  from{ opacity:0; transform:translateY(16px) scale(.96); }
  to{ opacity:1; transform:translateY(0) scale(1); }
}

@keyframes tsq-count{
  0%{ opacity:0; transform:scale(.62) translateY(12px); }
  26%{ opacity:1; transform:scale(1.08) translateY(0); }
  100%{ opacity:.96; transform:scale(1) translateY(0); }
}

@keyframes tsq-fog{
  0%{ transform:translate3d(-3%,0,0); }
  100%{ transform:translate3d(3%,-2%,0); }
}

@media (prefers-reduced-motion: reduce){
  .tsq-block--active,
  .tsq-clock__num.is-low,
  .tsq-countdown__num,
  .tsq-scene-fog{
    animation:none !important;
  }
}
`;