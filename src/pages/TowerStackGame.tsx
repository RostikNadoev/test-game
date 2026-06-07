/**
 * TowerStackGame
 * --------------------------------------------------------------------------
 * 1v1 Tower Stack duel for Telegram Mini App.
 *
 * - Fits inside parent route height, no bottom overflow.
 * - No bottom "TAP TO DROP" control.
 * - No shake animation.
 * - 3-second countdown overlay before the round starts.
 * - Countdown has no frame/card, only dark overlay + clean number.
 * - Floating GOOD/PERFECT/MISS/COMBO labels are pure text: no frames, no shadows.
 * - Telegram HapticFeedback + navigator.vibrate fallback.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';

/* =========================================================================
 * TUNING
 * ====================================================================== */
const ROUND_DURATION_MS = 40_000;

const BLOCK_HEIGHT = 28;
const BLOCK_WIDTH_RATIO = 0.44;
const BLOCK_WIDTH_MIN = 96;
const BLOCK_WIDTH_MAX = 170;
const MIN_OVERLAP = 1;
const ACTIVE_LINE_RATIO = 0.3;
const MAX_RENDERED_BLOCKS = 22;

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
  x: number;
  width: number;
  hue: number;
  drift: number;
}

interface FloatingFx {
  id: number;
  label: Quality;
  points: number;
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

const hueForLevel = (level: number) => (192 + level * 24) % 360;

const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));

const clampScore = (n: number) => (n < 0 ? 0 : n);

function triggerHaptic(kind: HapticKind = 'tap') {
  const tg = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          HapticFeedback?: {
            impactOccurred?: (
              style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft',
            ) => void;
            notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
            selectionChanged?: () => void;
          };
        };
      };
    }
  ).Telegram?.WebApp;

  try {
    if (kind === 'success') {
      tg?.HapticFeedback?.notificationOccurred?.('success');
      navigator.vibrate?.(22);
      return;
    }

    if (kind === 'error') {
      tg?.HapticFeedback?.notificationOccurred?.('error');
      navigator.vibrate?.([28, 24, 28]);
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
    // Haptics are optional.
  }
}

/* =========================================================================
 * BOT OPPONENT
 * ====================================================================== */
function useBotOpponent(
  active: boolean,
  onEvent: (event: OpponentEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setTimeout>;
    let score = 0;
    let combo = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const resolved = resolveMove(botBaseQuality(), combo);

      combo = resolved.combo;
      score = clampScore(score + resolved.points);

      onEventRef.current({
        quality: resolved.label,
        scoreDelta: resolved.points,
        totalScore: score,
        combo,
        ts: Date.now(),
      });

      timer = setTimeout(tick, randInt(BOT_MIN_INTERVAL_MS, BOT_MAX_INTERVAL_MS));
    };

    timer = setTimeout(tick, randInt(BOT_MIN_INTERVAL_MS, BOT_MAX_INTERVAL_MS));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
  const [activeWidth, setActiveWidth] = useState(BLOCK_WIDTH_MIN);
  const [activeHue, setActiveHue] = useState(hueForLevel(1));
  const [fx, setFx] = useState<FloatingFx[]>([]);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);

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

  /* ---- fit inside App route, not whole window ------------------------- */
  const applyViewportHeight = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const parentHeight = root.parentElement?.clientHeight ?? 0;
    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;
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

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;

    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // Ignore outside Telegram.
    }

    applyViewportHeight();

    window.addEventListener('resize', applyViewportHeight);
    tg?.onEvent?.('viewportChanged', applyViewportHeight);

    return () => {
      window.removeEventListener('resize', applyViewportHeight);
      tg?.offEvent?.('viewportChanged', applyViewportHeight);
    };
  }, [applyViewportHeight]);

  /* ---- geometry -------------------------------------------------------- */
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

    stageWidthRef.current = stage.clientWidth;
    recomputeBounds(topWidthRef.current);
  }, [recomputeBounds]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  /* ---- animation loop -------------------------------------------------- */
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

  /* ---- active block ---------------------------------------------------- */
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
    setActiveHue(hueForLevel(placedCountRef.current));

    const el = activeBlockRef.current;
    if (el) {
      el.style.transform = `translate3d(${xRef.current}px,0,0)`;
    }
  }, [recomputeBounds]);

  /* ---- feedback -------------------------------------------------------- */
  const pushFx = useCallback((label: Quality, points: number) => {
    const id = nextId();

    setFx((prev) => [...prev, { id, label, points }]);

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
    }, 220);
  }, []);

  const spawnSlice = useCallback((x: number, width: number, drift: number) => {
    const id = nextId();
    const hue = hueForLevel(placedCountRef.current);

    setSlices((prev) => [...prev, { id, x, width, hue, drift }]);

    const timeout = setTimeout(() => {
      setSlices((prev) => prev.filter((slice) => slice.id !== id));
    }, 500);

    timeoutsRef.current.push(timeout);
  }, []);

  /* ---- player move ----------------------------------------------------- */
  const placeBlock = useCallback(() => {
    if (phase !== 'playing') return;

    const currentWidth = topWidthRef.current;
    const activeX = xRef.current;
    const prevX = topXRef.current;
    const signedOffset = activeX - prevX;
    const offset = Math.abs(signedOffset);
    const overlap = currentWidth - offset;

    if (overlap < MIN_OVERLAP) {
      comboRef.current = 0;

      const resolved = resolveMove('MISS', 0);

      setPlayerScore((score) => clampScore(score + resolved.points));
      pushFx('MISS', resolved.points);
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

      spawnSlice(sliceX, sliceWidth, signedOffset > 0 ? 1 : -1);
    }

    const resolved = resolveMove(base, comboRef.current);

    comboRef.current = resolved.combo;

    const level = placedCountRef.current;
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
    pushFx(resolved.label, resolved.points);

    if (resolved.label === 'PERFECT' || resolved.label === 'COMBO') {
      triggerHaptic('success');
      pulse('good');
    } else {
      triggerHaptic('tap');
    }

    spawnActiveBlock();
  }, [phase, pulse, pushFx, spawnActiveBlock, spawnSlice]);

  /* ---- opponent -------------------------------------------------------- */
  const handleOpponentEvent = useCallback((event: OpponentEvent) => {
    setOpponentScore(event.totalScore);
    setOpponentQuality(event.quality);
  }, []);

  useBotOpponent(phase === 'playing', handleOpponentEvent);

  /* ---- countdown ------------------------------------------------------- */
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

  /* ---- round clock ----------------------------------------------------- */
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

  useEffect(() => {
    return () => {
      stopLoop();

      if (clockRef.current) {
        clearInterval(clockRef.current);
      }

      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }

      countdownTimersRef.current.forEach(clearTimeout);
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [stopLoop]);

  /* ---- start/reset ----------------------------------------------------- */
  const resetGame = useCallback(() => {
    applyViewportHeight();
    measure();

    const stageW = stageWidthRef.current;
    const baseWidth = Math.round(
      Math.min(
        BLOCK_WIDTH_MAX,
        Math.max(BLOCK_WIDTH_MIN, stageW * BLOCK_WIDTH_RATIO),
      ),
    );
    const center = Math.round((stageW - baseWidth) / 2);

    placedCountRef.current = 1;
    comboRef.current = 0;
    speedRef.current = BLOCK_SPEED_START;
    spawnSideRef.current = 1;

    topXRef.current = center;
    topWidthRef.current = baseWidth;

    xRef.current = 0;
    dirRef.current = 1;

    recomputeBounds(baseWidth);

    setPlaced([{ id: nextId(), level: 0, x: center, width: baseWidth }]);
    setSlices([]);
    setFx([]);
    setOutcome(null);
    setPlayerScore(0);
    setOpponentScore(0);
    setOpponentQuality(null);
    setSecondsLeft(ROUND_DURATION_MS / 1000);
    setActiveWidth(baseWidth);
    setActiveHue(hueForLevel(1));
    setFlash(null);
    setCountdown(3);
  }, [applyViewportHeight, measure, recomputeBounds]);

  const startCountdown = useCallback(() => {
    resetGame();
    setPhase('countdown');
  }, [resetGame]);

  /* ---- input ----------------------------------------------------------- */
  const onSurfacePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();

      if (phase === 'playing') {
        placeBlock();
      }
    },
    [phase, placeBlock],
  );

  /* ---- derived --------------------------------------------------------- */
  const topLevel = placed.length ? placed[placed.length - 1].level : 0;
  const activeTop = `calc(var(--tsq-stage-h, 100%) * ${ACTIVE_LINE_RATIO})`;
  const lowTime = secondsLeft <= 10;

  return (
    <div ref={rootRef} className="tsq-root">
      <style>{STYLES}</style>

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

      <main className="tsq-stage-wrap" onPointerDown={onSurfacePointerDown}>
        <div className="tsq-grid" aria-hidden />

        {flash && <div className={`tsq-flash is-${flash}`} aria-hidden />}

        <div className="tsq-stage" ref={stageRef}>
          <div className="tsq-anchor" style={{ top: activeTop }}>
            {placed.map((block) => {
              const depth = topLevel - block.level + 1;

              return (
                <div
                  key={block.id}
                  className="tsq-block tsq-block--placed"
                  style={
                    {
                      width: block.width,
                      height: BLOCK_HEIGHT,
                      transform: `translate3d(${block.x}px, ${
                        depth * BLOCK_HEIGHT
                      }px, 0)`,
                      '--h': hueForLevel(block.level),
                    } as CSSProperties
                  }
                >
                  <span className="tsq-block__land" />
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
                    height: BLOCK_HEIGHT,
                    '--sx': `${slice.x}px`,
                    '--dx': `${slice.drift * 26}px`,
                    '--rot': `${slice.drift * 36}deg`,
                    '--h': slice.hue,
                  } as CSSProperties
                }
              />
            ))}

            {(phase === 'countdown' || phase === 'playing') && (
              <div
                ref={activeBlockRef}
                className="tsq-block tsq-block--active"
                style={
                  {
                    width: activeWidth,
                    height: BLOCK_HEIGHT,
                    transform: `translate3d(${xRef.current}px,0,0)`,
                    '--h': activeHue,
                  } as CSSProperties
                }
              />
            )}

            {fx.map((item) => (
              <div key={item.id} className={`tsq-fx q-${item.label.toLowerCase()}`}>
                <span className="tsq-fx__label">{item.label}</span>
                <span className="tsq-fx__pts">
                  {item.points >= 0 ? `+${item.points}` : item.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {phase === 'ready' && (
        <div className="tsq-overlay">
          <div className="tsq-panel">
            <p className="tsq-panel__kicker">BATTLE CLUB · 1V1 DUEL</p>
            <h1 className="tsq-panel__title">TOWER&nbsp;STACK</h1>
            <p className="tsq-panel__sub">
              Ставь блоки ровно, режь лишнее и набирай больше очков за 40 секунд.
              Промах снимает {MISS_PENALTY} очков.
            </p>

            <button type="button" className="tsq-cta" onClick={startCountdown}>
              START DUEL
            </button>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="tsq-countdown" aria-hidden>
          <div key={countdown} className="tsq-countdown__num">
            {countdown}
          </div>
          <div className="tsq-countdown__label">GET READY</div>
        </div>
      )}

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
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;600;700&display=swap');

.tsq-root{
  --tsq-h: 100%;
  --bg-0:#070912;
  --bg-1:#0d1226;
  --ink:#eaf0ff;
  --muted:#8a93b8;
  --you:#33e6c0;
  --rival:#ff5d8f;
  --accent:#6c8cff;
  --glass:rgba(255,255,255,.06);
  --glass-line:rgba(255,255,255,.10);

  position:relative;
  width:100%;
  height:var(--tsq-h);
  max-height:var(--tsq-h);
  min-height:0;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(108,140,255,.20), transparent 60%),
    radial-gradient(90% 60% at 100% 110%, rgba(255,93,143,.16), transparent 60%),
    linear-gradient(180deg, var(--bg-1), var(--bg-0));
  color:var(--ink);
  font-family:'Rajdhani', system-ui, -apple-system, sans-serif;
  -webkit-tap-highlight-color:transparent;
  user-select:none;
  touch-action:manipulation;
}

.tsq-root *{
  box-sizing:border-box;
}

/* ---------------- HUD ---------------- */
.tsq-hud{
  flex:0 0 auto;
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:start;
  gap:8px;
  padding:4px 10px 6px;
}

.tsq-side{
  display:flex;
  flex-direction:column;
  gap:0;
  min-width:0;
  padding:6px 10px;
  border-radius:13px;
  background:var(--glass);
  border:1px solid var(--glass-line);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
}

.tsq-side--rival{
  align-items:flex-end;
  text-align:right;
}

.tsq-side__tag{
  font-size:9px;
  line-height:1;
  letter-spacing:.2em;
  font-weight:700;
  color:var(--muted);
}

.tsq-side--you .tsq-side__tag{
  color:var(--you);
}

.tsq-side--rival .tsq-side__tag{
  color:var(--rival);
}

.tsq-side__score{
  margin-top:3px;
  font-family:'Orbitron', monospace;
  font-weight:800;
  font-size:22px;
  line-height:1;
  font-variant-numeric:tabular-nums;
}

.tsq-side--you .tsq-side__score{
  text-shadow:0 0 14px rgba(51,230,192,.4);
}

.tsq-side--rival .tsq-side__score{
  text-shadow:0 0 14px rgba(255,93,143,.4);
}

.tsq-rival-q{
  margin-top:3px;
  min-height:16px;
  padding:2px 7px;
  border-radius:999px;
  font-size:10px;
  line-height:1.1;
  font-weight:700;
  letter-spacing:.12em;
  animation:tsq-pop .26s ease;
}

.q-perfect{
  color:#aeffe9;
  background:rgba(51,230,192,.16);
}

.q-great{
  color:#bfe0ff;
  background:rgba(108,140,255,.16);
}

.q-good{
  color:#ffe6b3;
  background:rgba(255,196,84,.14);
}

.q-miss{
  color:#ffb0c4;
  background:rgba(255,93,143,.16);
}

.q-combo{
  color:#fff;
  background:linear-gradient(90deg,rgba(108,140,255,.42),rgba(255,93,143,.42));
}

.q-wait{
  color:var(--muted);
  background:transparent;
}

.tsq-clock{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
  padding-top:0;
}

.tsq-clock__num{
  font-family:'Orbitron', monospace;
  font-weight:800;
  font-size:25px;
  line-height:1;
  font-variant-numeric:tabular-nums;
  transition:color .25s;
}

.tsq-clock__num.is-low{
  color:#ff6b8b;
  text-shadow:0 0 18px rgba(255,93,143,.58);
  animation:tsq-pulse 1s infinite;
}

.tsq-clock__unit{
  margin-left:1px;
  font-size:11px;
  color:var(--muted);
}

.tsq-clock__bar{
  width:84px;
  height:4px;
  overflow:hidden;
  border-radius:99px;
  background:rgba(255,255,255,.10);
}

.tsq-clock__fill{
  display:block;
  width:100%;
  height:100%;
  border-radius:99px;
  transform-origin:left center;
  background:linear-gradient(90deg,var(--you),var(--accent));
}

.tsq-clock__fill.is-running{
  animation-name:tsq-drain;
  animation-timing-function:linear;
  animation-fill-mode:forwards;
}

.tsq-clock__fill.is-low{
  background:linear-gradient(90deg,#ff8a5c,var(--rival));
}

/* ---------------- STAGE ---------------- */
.tsq-stage-wrap{
  position:relative;
  flex:1 1 auto;
  min-height:0;
  overflow:hidden;
  margin:0 10px 8px;
  border-radius:21px;
  border:1px solid var(--glass-line);
  background:
    radial-gradient(circle at 50% 0%, rgba(108,140,255,.12), transparent 38%),
    linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 20px 52px -30px rgba(0,0,0,.9);
}

.tsq-grid{
  position:absolute;
  inset:0;
  opacity:.48;
  pointer-events:none;
  background-image:
    linear-gradient(rgba(108,140,255,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(108,140,255,.07) 1px, transparent 1px);
  background-size:30px 30px;
  -webkit-mask-image:radial-gradient(120% 90% at 50% 28%, #000 40%, transparent 82%);
  mask-image:radial-gradient(120% 90% at 50% 28%, #000 40%, transparent 82%);
}

.tsq-flash{
  position:absolute;
  inset:0;
  z-index:6;
  border-radius:21px;
  pointer-events:none;
  opacity:0;
}

.tsq-flash.is-good{
  box-shadow:inset 0 0 54px rgba(51,230,192,.36);
  animation:tsq-flash .22s ease;
}

.tsq-flash.is-bad{
  box-shadow:inset 0 0 56px rgba(255,93,143,.42);
  animation:tsq-flash .24s ease;
}

.tsq-stage{
  position:absolute;
  inset:0;
  --tsq-stage-h:100%;
}

.tsq-anchor{
  position:absolute;
  left:0;
  right:0;
  height:0;
}

/* ---------------- BLOCKS ---------------- */
.tsq-block{
  position:absolute;
  top:0;
  left:0;
  border-radius:7px;
  will-change:transform;
  background:
    linear-gradient(177deg,
      hsl(var(--h) 95% 68%) 0%,
      hsl(var(--h) 88% 54%) 48%,
      hsl(var(--h) 82% 44%) 100%);
  box-shadow:
    0 0 16px hsla(var(--h),95%,60%,.45),
    0 6px 12px -6px rgba(0,0,0,.7),
    inset 0 1.5px 0 rgba(255,255,255,.6),
    inset 0 0 0 1px hsla(var(--h),90%,78%,.35),
    inset 0 -6px 10px hsla(var(--h),75%,26%,.6);
}

.tsq-block::before{
  content:"";
  position:absolute;
  left:7%;
  right:7%;
  top:2px;
  height:38%;
  border-radius:6px 6px 9px 9px;
  pointer-events:none;
  background:linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,0));
}

.tsq-block--placed{
  transition:transform .16s cubic-bezier(.22,1,.36,1);
}

.tsq-block__land{
  position:absolute;
  inset:-2px;
  border-radius:9px;
  pointer-events:none;
  opacity:0;
  background:radial-gradient(circle, hsla(var(--h),95%,75%,.48), transparent 70%);
  animation:tsq-land .3s ease-out;
}

.tsq-block--active{
  z-index:3;
  box-shadow:
    0 0 24px hsla(var(--h),95%,62%,.65),
    0 8px 16px -6px rgba(0,0,0,.7),
    inset 0 1.5px 0 rgba(255,255,255,.66),
    inset 0 0 0 1px hsla(var(--h),90%,80%,.45),
    inset 0 -6px 10px hsla(var(--h),75%,26%,.6);
  animation:tsq-breathe 1.5s ease-in-out infinite;
}

.tsq-slice{
  position:absolute;
  top:0;
  left:0;
  z-index:2;
  border-radius:6px;
  pointer-events:none;
  background:linear-gradient(177deg, hsl(var(--h) 92% 64%), hsl(var(--h) 82% 46%));
  box-shadow:
    0 0 12px hsla(var(--h),95%,60%,.35),
    inset 0 1px 0 rgba(255,255,255,.4);
  transform:translate3d(var(--sx),0,0);
  animation:tsq-slice-fall .48s cubic-bezier(.4,0,.7,1) forwards;
}

/* ---------------- FLOATING LABELS: PURE TEXT ONLY ---------------- */
.tsq-fx{
  position:absolute;
  top:-32px;
  left:50%;
  z-index:7;
  pointer-events:none;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:0;
  padding:0 !important;
  margin:0;
  border:none !important;
  outline:none !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
  filter:none !important;
  transform:translateX(-50%);
  animation:tsq-rise .68s ease-out forwards;
}

.tsq-fx.q-perfect,
.tsq-fx.q-great,
.tsq-fx.q-good,
.tsq-fx.q-miss,
.tsq-fx.q-combo{
  border:none !important;
  background:transparent !important;
  box-shadow:none !important;
  filter:none !important;
}

.tsq-fx__label{
  padding:0;
  margin:0;
  border:none !important;
  background:transparent !important;
  box-shadow:none !important;
  filter:none !important;
  text-shadow:none !important;
  font-family:'Orbitron', monospace;
  font-weight:800;
  font-size:21px;
  line-height:1;
  letter-spacing:.05em;
}

.tsq-fx__pts{
  margin-top:2px;
  padding:0;
  border:none !important;
  background:transparent !important;
  box-shadow:none !important;
  filter:none !important;
  text-shadow:none !important;
  font-size:12px;
  line-height:1;
  font-weight:700;
  color:rgba(234,240,255,.78);
}

.tsq-fx.q-perfect .tsq-fx__label{
  color:#5ffbe0;
}

.tsq-fx.q-great .tsq-fx__label{
  color:#9cc0ff;
}

.tsq-fx.q-good .tsq-fx__label{
  color:#ffd98a;
}

.tsq-fx.q-miss .tsq-fx__label{
  color:#ff7a99;
}

.tsq-fx.q-miss .tsq-fx__pts{
  color:#ff8aa6;
}

.tsq-fx.q-combo .tsq-fx__label{
  color:#ffffff;
  background:linear-gradient(90deg,#6c8cff,#ff5d8f) !important;
  -webkit-background-clip:text !important;
  background-clip:text !important;
  -webkit-text-fill-color:transparent;
}

/* ---------------- COUNTDOWN: NO FRAME, DARKENS GAME ---------------- */
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
    radial-gradient(circle at 50% 43%, rgba(108,140,255,.18), transparent 26%),
    radial-gradient(circle at 50% 58%, rgba(51,230,192,.10), transparent 32%),
    rgba(2,3,10,.78);
  backdrop-filter:blur(3px) saturate(1.08);
  -webkit-backdrop-filter:blur(3px) saturate(1.08);
}

.tsq-countdown__num{
  width:auto;
  height:auto;
  display:block;
  border:none !important;
  outline:none !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
  font-family:'Orbitron', monospace;
  font-size:104px;
  line-height:.9;
  font-weight:800;
  color:#fff;
  letter-spacing:-.08em;
  text-shadow:
    0 0 24px rgba(108,140,255,.72),
    0 0 52px rgba(51,230,192,.34);
  animation:tsq-count .88s cubic-bezier(.22,1,.36,1);
}

.tsq-countdown__label{
  margin-top:18px;
  padding:0;
  border:none !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
  color:rgba(234,240,255,.62);
  font-size:11px;
  line-height:1;
  font-weight:800;
  letter-spacing:.24em;
  text-shadow:none;
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
  background:rgba(5,7,16,.72);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
  animation:tsq-fade .22s ease;
}

.tsq-panel{
  width:100%;
  max-width:360px;
  text-align:center;
  padding:26px 22px 22px;
  border-radius:24px;
  border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(28,36,68,.85), rgba(12,16,34,.92));
  box-shadow:
    0 36px 82px -30px rgba(0,0,0,.9),
    inset 0 1px 0 rgba(255,255,255,.12);
  animation:tsq-rise-in .32s cubic-bezier(.22,1,.36,1);
}

.tsq-panel__kicker{
  margin:0 0 10px;
  font-size:10px;
  letter-spacing:.26em;
  font-weight:700;
  color:var(--accent);
}

.tsq-panel__title{
  margin:0;
  font-family:'Orbitron', monospace;
  font-weight:800;
  font-size:36px;
  line-height:1;
  background:linear-gradient(180deg,#fff,#9fb4ff);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
  filter:drop-shadow(0 6px 24px rgba(108,140,255,.5));
}

.tsq-panel__sub{
  margin:14px 2px 20px;
  color:var(--muted);
  font-size:14px;
  line-height:1.45;
  font-weight:500;
}

.tsq-result-title{
  font-size:42px;
}

.tsq-panel--win .tsq-result-title{
  background:linear-gradient(180deg,#a9ffe9,#33e6c0);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
}

.tsq-panel--lose .tsq-result-title{
  background:linear-gradient(180deg,#ffc2d2,#ff5d8f);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
}

.tsq-panel--draw .tsq-result-title{
  background:linear-gradient(180deg,#fff,#cdd6ff);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
}

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
  font-family:'Orbitron', monospace;
  font-size:31px;
}

.tsq-result-scores__col:first-child strong{
  color:var(--you);
}

.tsq-result-scores__col:last-child strong{
  color:var(--rival);
}

.tsq-result-scores__vs{
  font-family:'Orbitron', monospace;
  font-size:12px;
  color:var(--muted);
}

.tsq-cta{
  width:100%;
  height:54px;
  border:none;
  cursor:pointer;
  border-radius:17px;
  color:#04121a;
  font-family:'Orbitron', monospace;
  font-weight:800;
  font-size:14px;
  letter-spacing:.13em;
  background:linear-gradient(135deg, var(--you), var(--accent));
  box-shadow:
    0 16px 40px -14px rgba(51,230,192,.7),
    inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .08s ease;
}

.tsq-cta:active{
  transform:translateY(2px) scale(.985);
}

.tsq-ghost{
  margin-top:12px;
  width:100%;
  height:40px;
  border:1px solid var(--glass-line);
  background:transparent;
  color:var(--muted);
  border-radius:13px;
  cursor:pointer;
  font-family:'Rajdhani', sans-serif;
  font-weight:600;
  letter-spacing:.1em;
  font-size:13px;
}

/* ---------------- KEYFRAMES ---------------- */
@keyframes tsq-drain{
  from{ transform:scaleX(1); }
  to{ transform:scaleX(0); }
}

@keyframes tsq-breathe{
  0%,100%{ filter:brightness(1); }
  50%{ filter:brightness(1.12); }
}

@keyframes tsq-land{
  0%{ opacity:.78; transform:scale(1.03); }
  100%{ opacity:0; transform:scale(1.2); }
}

@keyframes tsq-slice-fall{
  0%{
    opacity:1;
    transform:translate3d(var(--sx),0,0) rotate(0);
  }
  100%{
    opacity:0;
    transform:translate3d(calc(var(--sx) + var(--dx)),112px,0) rotate(var(--rot));
  }
}

@keyframes tsq-rise{
  0%{
    opacity:0;
    transform:translate(-50%,6px) scale(.86);
  }
  18%{
    opacity:1;
    transform:translate(-50%,0) scale(1);
  }
  100%{
    opacity:0;
    transform:translate(-50%,-38px) scale(1.03);
  }
}

@keyframes tsq-flash{
  0%{ opacity:0; }
  32%{ opacity:1; }
  100%{ opacity:0; }
}

@keyframes tsq-pop{
  0%{
    transform:scale(.7);
    opacity:0;
  }
  100%{
    transform:scale(1);
    opacity:1;
  }
}

@keyframes tsq-pulse{
  0%,100%{ transform:scale(1); }
  50%{ transform:scale(1.1); }
}

@keyframes tsq-fade{
  from{ opacity:0; }
  to{ opacity:1; }
}

@keyframes tsq-rise-in{
  from{
    opacity:0;
    transform:translateY(18px) scale(.96);
  }
  to{
    opacity:1;
    transform:translateY(0) scale(1);
  }
}

@keyframes tsq-count{
  0%{
    opacity:0;
    transform:scale(.62) translateY(14px);
  }
  26%{
    opacity:1;
    transform:scale(1.08) translateY(0);
  }
  100%{
    opacity:.96;
    transform:scale(1) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce){
  .tsq-block--active,
  .tsq-clock__num.is-low,
  .tsq-countdown__num{
    animation:none !important;
  }
}
`;