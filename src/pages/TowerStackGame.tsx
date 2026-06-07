/**
 * TowerStackGame
 * --------------------------------------------------------------------------
 * A premium 1v1 "Tower Stack" duel for a Telegram Mini App.
 *
 * This is a REAL stack game: dropping a block slices off the overhang, the
 * remaining overlap becomes the placed block, and the next block inherits the
 * reduced width. Miss the tower entirely and you lose points.
 *
 * Architecture (read before extending):
 *  - The PLAYER side is simulated locally with full block geometry.
 *  - The OPPONENT side is intentionally *blind* — we never render its tower.
 *    It exists only as a stream of `OpponentEvent`s reflected in the HUD
 *    (score + last-move quality). Today those come from `useBotOpponent`.
 *    To go online, write `useSocketOpponent(active, onEvent)` with the SAME
 *    signature emitting the SAME `OpponentEvent` shape from WebSocket
 *    messages, then swap the line marked `// === OPPONENT SOURCE ===`.
 *  - High-frequency motion (the sliding block) is driven by refs + a single
 *    requestAnimationFrame loop writing `transform` straight to the DOM, so it
 *    never re-renders React. State changes only on discrete events.
 *
 * Single exported component: `TowerStackGame`.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/* =========================================================================
 * TUNING — everything you'd want to balance lives here.
 * ====================================================================== */
const ROUND_DURATION_MS = 40_000; // round is exactly 40s

const BLOCK_HEIGHT = 28; // px, on-screen height of one stacked block
const BLOCK_WIDTH_RATIO = 0.44; // starting block width as a fraction of the stage
const BLOCK_WIDTH_MIN = 96; // px clamp
const BLOCK_WIDTH_MAX = 170; // px clamp
const MIN_OVERLAP = 1; // px below which a drop counts as a MISS
const ACTIVE_LINE_RATIO = 0.32; // where the moving block sits (from top of stage)
const MAX_RENDERED_BLOCKS = 22; // older blocks scroll off-screen and are pruned

const BLOCK_SPEED_START = 235; // px/s horizontal speed of the moving block
const BLOCK_SPEED_RAMP = 8; // px/s added per placed block (difficulty curve)
const BLOCK_SPEED_MAX = 480; // px/s cap

// Alignment tolerances (px offset between the active block and the one below).
const PERFECT_THRESHOLD = 6; // within this → no cut, full width kept
const GREAT_THRESHOLD = 16; // within this → small cut, still builds combo
const GOOD_THRESHOLD = 34; // beyond this (but landed) → "hard" impact feedback

// Scoring. MISS is negative; the player score is clamped to >= 0.
const MISS_PENALTY = 40;
const SCORE: Record<BaseQuality, number> = {
  PERFECT: 100,
  GREAT: 60,
  GOOD: 30,
  MISS: -MISS_PENALTY,
};

const COMBO_THRESHOLD = 3; // consecutive strong moves before COMBO kicks in
const COMBO_BONUS = 25; // extra points per combo step beyond the threshold

// Bot cadence + skill profile (only used by useBotOpponent).
const BOT_MIN_INTERVAL_MS = 820;
const BOT_MAX_INTERVAL_MS = 1480;
const BOT_QUALITY_WEIGHTS = { PERFECT: 0.3, GREAT: 0.36, GOOD: 0.22, MISS: 0.12 };

/* =========================================================================
 * TYPES
 * ====================================================================== */
type BaseQuality = "PERFECT" | "GREAT" | "GOOD" | "MISS";
type Quality = BaseQuality | "COMBO";
type Phase = "ready" | "playing" | "result";
type Outcome = "win" | "lose" | "draw";

interface PlacedBlock {
  id: number;
  level: number; // absolute level (0 = base), drives camera math
  x: number; // locked left offset within the stage
  width: number; // actual (possibly sliced) width
}

interface SlicePiece {
  id: number;
  x: number;
  width: number;
  hue: number;
  drift: number; // horizontal drift direction for the fall (-1 | 1)
}

interface FloatingFx {
  id: number;
  label: Quality;
  points: number;
}

/** The single contract between the game and any opponent source. */
export interface OpponentEvent {
  quality: Quality;
  scoreDelta: number;
  totalScore: number;
  combo: number;
  ts: number;
}

/** Optional props — the component works as `<TowerStackGame />` with no props. */
export interface TowerStackGameProps {
  onExit?: () => void;
}

/* =========================================================================
 * PURE HELPERS — shared scoring logic for player and bot.
 * ====================================================================== */
/**
 * Resolve a base move into a display label + points + new combo count.
 * Strong moves (PERFECT/GREAT) extend the combo; anything weaker resets it.
 * Past the threshold, strong moves read as "COMBO" with escalating bonus.
 * Used identically by the player and the bot so scoring stays consistent.
 */
function resolveMove(
  base: BaseQuality,
  prevCombo: number
): { label: Quality; points: number; combo: number } {
  const strong = base === "PERFECT" || base === "GREAT";
  const combo = strong ? prevCombo + 1 : 0;
  let points = SCORE[base];
  let label: Quality = base;

  if (strong && combo >= COMBO_THRESHOLD) {
    points += COMBO_BONUS * (combo - COMBO_THRESHOLD + 1);
    label = "COMBO";
  }
  return { label, points, combo };
}

function botBaseQuality(): BaseQuality {
  const r = Math.random();
  const w = BOT_QUALITY_WEIGHTS;
  if (r < w.PERFECT) return "PERFECT";
  if (r < w.PERFECT + w.GREAT) return "GREAT";
  if (r < w.PERFECT + w.GREAT + w.GOOD) return "GOOD";
  return "MISS";
}

const hueForLevel = (level: number) => (192 + level * 24) % 360;
const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));
const clampScore = (n: number) => (n < 0 ? 0 : n);

/* =========================================================================
 * OPPONENT SOURCE (BOT) — isolated so it can be replaced by a socket hook.
 *
 * Future online version (drop-in, same signature + event shape):
 *   function useSocketOpponent(active, onEvent) {
 *     useEffect(() => {
 *       if (!active) return;
 *       const ws = new WebSocket(url);
 *       ws.onmessage = (m) => onEvent(JSON.parse(m.data) as OpponentEvent);
 *       return () => ws.close();
 *     }, [active]);
 *   }
 * ====================================================================== */
function useBotOpponent(
  active: boolean,
  onEvent: (event: OpponentEvent) => void
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
  /* ---- React state (low frequency: discrete events only) --------------- */
  const [phase, setPhase] = useState<Phase>("ready");
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentQuality, setOpponentQuality] = useState<Quality | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_DURATION_MS / 1000);
  const [placed, setPlaced] = useState<PlacedBlock[]>([]);
  const [slices, setSlices] = useState<SlicePiece[]>([]);
  const [activeWidth, setActiveWidth] = useState(BLOCK_WIDTH_MIN);
  const [activeHue, setActiveHue] = useState(hueForLevel(1));
  const [fx, setFx] = useState<FloatingFx[]>([]);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /* ---- Refs (high frequency / mutable engine values) ------------------- */
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);

  const stageWidthRef = useRef(0);
  const minXRef = useRef(0);
  const maxXRef = useRef(0);
  const xRef = useRef(0); // current left offset of the moving block
  const dirRef = useRef(1); // +1 / -1
  const speedRef = useRef(BLOCK_SPEED_START);

  const topXRef = useRef(0); // left offset of the current top block
  const topWidthRef = useRef(BLOCK_WIDTH_MIN); // width of the current top block
  const placedCountRef = useRef(1); // next level index to assign
  const comboRef = useRef(0); // player combo streak
  const spawnSideRef = useRef(1); // alternate spawn side

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef(0);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextId = () => idRef.current++;

  /* ---- Telegram viewport handling (exact fit, no scroll) --------------- */
  const applyViewportHeight = useCallback(() => {
    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;
    const h = tg?.viewportStableHeight || window.innerHeight;
    rootRef.current?.style.setProperty("--tsq-h", `${h}px`);
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
      /* not inside Telegram — ignore */
    }
    applyViewportHeight();
    window.addEventListener("resize", applyViewportHeight);
    tg?.onEvent?.("viewportChanged", applyViewportHeight);
    return () => {
      window.removeEventListener("resize", applyViewportHeight);
      tg?.offEvent?.("viewportChanged", applyViewportHeight);
    };
  }, [applyViewportHeight]);

  /* ---- Geometry helpers ------------------------------------------------ */
  const recomputeBounds = useCallback((width: number) => {
    const stageW = stageWidthRef.current;
    minXRef.current = 0;
    maxXRef.current = Math.max(0, stageW - width);
    if (xRef.current > maxXRef.current) xRef.current = maxXRef.current;
  }, []);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stageWidthRef.current = stage.clientWidth;
    recomputeBounds(topWidthRef.current);
  }, [recomputeBounds]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /* ---- The single rAF loop: moves the active block, no re-renders ------ */
  const stepLoop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000); // clamp for backgrounded tabs
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
    if (el) el.style.transform = `translate3d(${x}px,0,0)`;
    rafRef.current = requestAnimationFrame(stepLoop);
  }, []);

  const startLoop = useCallback(() => {
    lastTsRef.current = 0;
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(stepLoop);
  }, [stepLoop]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /* ---- Spawn the next moving block from an alternating side ------------ */
  const spawnActiveBlock = useCallback(() => {
    const width = topWidthRef.current;
    recomputeBounds(width);
    const fromLeft = spawnSideRef.current > 0;
    spawnSideRef.current *= -1;

    xRef.current = fromLeft ? minXRef.current : maxXRef.current;
    dirRef.current = fromLeft ? 1 : -1;
    speedRef.current = Math.min(
      BLOCK_SPEED_MAX,
      BLOCK_SPEED_START + (placedCountRef.current - 1) * BLOCK_SPEED_RAMP
    );

    setActiveWidth(width);
    setActiveHue(hueForLevel(placedCountRef.current));
    const el = activeBlockRef.current;
    if (el) el.style.transform = `translate3d(${xRef.current}px,0,0)`;
  }, [recomputeBounds]);

  /* ---- Lightweight feedback (popup + screen pulse), auto-cleaned ------- */
  const pushFx = useCallback((label: Quality, points: number) => {
    const id = nextId();
    setFx((prev) => [...prev, { id, label, points }]);
    const t = setTimeout(
      () => setFx((prev) => prev.filter((f) => f.id !== id)),
      760
    );
    timeoutsRef.current.push(t);
  }, []);

  const pulse = useCallback((kind: "good" | "bad") => {
    setShake(true);
    setFlash(kind);
    if (fxTimeoutRef.current) clearTimeout(fxTimeoutRef.current);
    fxTimeoutRef.current = setTimeout(() => {
      setShake(false);
      setFlash(null);
    }, 280);
  }, []);

  const spawnSlice = useCallback((x: number, width: number, drift: number) => {
    const id = nextId();
    const hue = hueForLevel(placedCountRef.current);
    setSlices((prev) => [...prev, { id, x, width, hue, drift }]);
    const t = setTimeout(
      () => setSlices((prev) => prev.filter((s) => s.id !== id)),
      520
    );
    timeoutsRef.current.push(t);
  }, []);

  /* ---- PLAYER MOVE: drop, slice the overhang, score -------------------- */
  const placeBlock = useCallback(() => {
    if (phase !== "playing") return;

    const W = topWidthRef.current;
    const activeX = xRef.current;
    const prevX = topXRef.current;
    const signedOffset = activeX - prevX;
    const offset = Math.abs(signedOffset);
    const overlap = W - offset;

    /* --- MISS: no overlap. Subtract points, keep tower height, retry. --- */
    if (overlap < MIN_OVERLAP) {
      comboRef.current = 0;
      const resolved = resolveMove("MISS", 0);
      setPlayerScore((s) => clampScore(s + resolved.points));
      pushFx("MISS", resolved.points);
      pulse("bad");
      spawnActiveBlock(); // same width, from the other side
      return;
    }

    /* --- HIT: classify, cut the overhang, lock the overlap. ------------- */
    let base: BaseQuality;
    let newX: number;
    let newWidth: number;

    if (offset <= PERFECT_THRESHOLD) {
      base = "PERFECT";
      newX = prevX; // snap clean, no cut
      newWidth = W;
    } else {
      base = offset <= GREAT_THRESHOLD ? "GREAT" : "GOOD";
      newX = Math.round(Math.max(activeX, prevX));
      newWidth = Math.round(overlap);
      // The sliced-off overhang of the active block falls away.
      const sliceWidth = Math.round(offset);
      const sliceX =
        signedOffset > 0 ? Math.round(prevX + W) : Math.round(activeX);
      spawnSlice(sliceX, sliceWidth, signedOffset > 0 ? 1 : -1);
    }

    const resolved = resolveMove(base, comboRef.current);
    comboRef.current = resolved.combo;

    const level = placedCountRef.current;
    placedCountRef.current += 1;
    topXRef.current = newX;
    topWidthRef.current = newWidth;

    const block: PlacedBlock = { id: nextId(), level, x: newX, width: newWidth };
    setPlaced((prev) => {
      const next = [...prev, block];
      return next.length > MAX_RENDERED_BLOCKS
        ? next.slice(next.length - MAX_RENDERED_BLOCKS)
        : next;
    });

    setPlayerScore((s) => clampScore(s + resolved.points));
    pushFx(resolved.label, resolved.points);
    if (resolved.label === "PERFECT" || resolved.label === "COMBO") pulse("good");
    else if (offset > GOOD_THRESHOLD) pulse("good"); // hard landing impact

    spawnActiveBlock();
  }, [phase, pushFx, pulse, spawnSlice, spawnActiveBlock]);

  /* ---- OPPONENT EVENTS: update score + label ONLY (no tower) ----------- */
  const handleOpponentEvent = useCallback((event: OpponentEvent) => {
    setOpponentScore(event.totalScore);
    setOpponentQuality(event.quality);
  }, []);

  // === OPPONENT SOURCE === (replace with useSocketOpponent for online play)
  useBotOpponent(phase === "playing", handleOpponentEvent);

  /* ---- ROUND CLOCK + WINNER LOGIC -------------------------------------- */
  useEffect(() => {
    if (phase !== "playing") return;
    endAtRef.current = Date.now() + ROUND_DURATION_MS;
    setSecondsLeft(ROUND_DURATION_MS / 1000);

    clockRef.current = setInterval(() => {
      const remaining = endAtRef.current - Date.now();
      if (remaining <= 0) {
        if (clockRef.current) clearInterval(clockRef.current);
        setSecondsLeft(0);
        setPhase("result");
        return;
      }
      // setState bails out when the integer is unchanged → ~1 render/s.
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 200);

    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [phase]);

  // Resolve the outcome once when the round ends (reads the final scores).
  useEffect(() => {
    if (phase !== "result") return;
    setOutcome(
      playerScore > opponentScore
        ? "win"
        : playerScore < opponentScore
        ? "lose"
        : "draw"
    );
  }, [phase, playerScore, opponentScore]);

  /* ---- Drive the animation loop with the play phase -------------------- */
  useEffect(() => {
    if (phase === "playing") startLoop();
    else stopLoop();
    return stopLoop;
  }, [phase, startLoop, stopLoop]);

  /* ---- Global cleanup -------------------------------------------------- */
  useEffect(() => {
    return () => {
      stopLoop();
      if (clockRef.current) clearInterval(clockRef.current);
      if (fxTimeoutRef.current) clearTimeout(fxTimeoutRef.current);
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [stopLoop]);

  /* ---- Lifecycle controls ---------------------------------------------- */
  const startGame = useCallback(() => {
    measure();
    const stageW = stageWidthRef.current;
    const baseWidth = Math.round(
      Math.min(BLOCK_WIDTH_MAX, Math.max(BLOCK_WIDTH_MIN, stageW * BLOCK_WIDTH_RATIO))
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

    setPhase("playing");
  }, [measure, recomputeBounds]);

  /* ---- Input ----------------------------------------------------------- */
  const onSurfacePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (phase === "playing") placeBlock();
    },
    [phase, placeBlock]
  );

  /* ---- Derived render values ------------------------------------------- */
  const topLevel = placed.length ? placed[placed.length - 1].level : 0;
  const activeTop = `calc(var(--tsq-stage-h, 100%) * ${ACTIVE_LINE_RATIO})`;
  const lowTime = secondsLeft <= 10;

  /* ===================================================================== */
  return (
    <div ref={rootRef} className="tsq-root">
      <style>{STYLES}</style>

      {/* ---------------------- TOP HUD ---------------------- */}
      <header className="tsq-hud">
        <div className="tsq-side tsq-side--you">
          <span className="tsq-side__tag">YOU</span>
          <span className="tsq-side__score">{playerScore}</span>
        </div>

        <div className="tsq-clock" aria-label="time remaining">
          <div className={`tsq-clock__num ${lowTime ? "is-low" : ""}`}>
            {secondsLeft}
            <span className="tsq-clock__unit">s</span>
          </div>
          <div className="tsq-clock__bar">
            <span
              key={phase === "playing" ? "run" : "idle"}
              className={`tsq-clock__fill ${
                phase === "playing" ? "is-running" : ""
              } ${lowTime ? "is-low" : ""}`}
              style={{ animationDuration: `${ROUND_DURATION_MS}ms` }}
            />
          </div>
        </div>

        <div className="tsq-side tsq-side--rival">
          <span className="tsq-side__tag">RIVAL</span>
          <span className="tsq-side__score">{opponentScore}</span>
          <span
            key={`${opponentScore}-${opponentQuality ?? ""}`}
            className={`tsq-rival-q q-${(opponentQuality ?? "wait").toLowerCase()}`}
          >
            {opponentQuality ?? "—"}
          </span>
        </div>
      </header>

      {/* ---------------------- PLAY AREA ---------------------- */}
      <main
        className={`tsq-stage-wrap ${shake ? "is-shake" : ""}`}
        onPointerDown={onSurfacePointerDown}
      >
        <div className="tsq-grid" aria-hidden />
        {flash && <div className={`tsq-flash is-${flash}`} aria-hidden />}

        <div className="tsq-stage" ref={stageRef}>
          <div className="tsq-anchor" style={{ top: activeTop }}>
            {/* Placed tower — each block reflects its real (sliced) width */}
            {placed.map((b) => {
              const depth = topLevel - b.level + 1; // 1 = just below active
              return (
                <div
                  key={b.id}
                  className="tsq-block tsq-block--placed"
                  style={
                    {
                      width: b.width,
                      height: BLOCK_HEIGHT,
                      transform: `translate3d(${b.x}px, ${depth * BLOCK_HEIGHT}px, 0)`,
                      ["--h" as any]: hueForLevel(b.level),
                    } as React.CSSProperties
                  }
                >
                  <span className="tsq-block__land" />
                </div>
              );
            })}

            {/* Sliced-off debris falling away */}
            {slices.map((s) => (
              <div
                key={s.id}
                className="tsq-slice"
                style={
                  {
                    width: s.width,
                    height: BLOCK_HEIGHT,
                    ["--sx" as any]: `${s.x}px`,
                    ["--dx" as any]: `${s.drift * 26}px`,
                    ["--rot" as any]: `${s.drift * 36}deg`,
                    ["--h" as any]: s.hue,
                  } as React.CSSProperties
                }
              />
            ))}

            {/* Active moving block */}
            {phase === "playing" && (
              <div
                ref={activeBlockRef}
                className="tsq-block tsq-block--active"
                style={
                  {
                    width: activeWidth,
                    height: BLOCK_HEIGHT,
                    ["--h" as any]: activeHue,
                  } as React.CSSProperties
                }
              />
            )}

            {/* Quality popups */}
            {fx.map((f) => (
              <div key={f.id} className={`tsq-fx q-${f.label.toLowerCase()}`}>
                <span className="tsq-fx__label">{f.label}</span>
                <span className="tsq-fx__pts">
                  {f.points >= 0 ? `+${f.points}` : f.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ---------------------- BOTTOM CONTROL ---------------------- */}
      <footer className="tsq-control">
        <button
          type="button"
          className="tsq-tap"
          disabled={phase !== "playing"}
          onPointerDown={onSurfacePointerDown}
        >
          <span className="tsq-tap__ring" />
          <span className="tsq-tap__label">TAP TO DROP</span>
        </button>
      </footer>

      {/* ---------------------- READY OVERLAY ---------------------- */}
      {phase === "ready" && (
        <div className="tsq-overlay">
          <div className="tsq-panel">
            <p className="tsq-panel__kicker">BATTLE CLUB · 1v1 DUEL</p>
            <h1 className="tsq-panel__title">TOWER&nbsp;STACK</h1>
            <p className="tsq-panel__sub">
              Tap to drop each block. Overhang gets sliced off, so aim for
              PERFECT hits to keep your width and chain COMBOs. Highest score
              after 40 seconds wins — a miss costs you {MISS_PENALTY} points.
            </p>
            <button type="button" className="tsq-cta" onPointerDown={startGame}>
              START DUEL
            </button>
          </div>
        </div>
      )}

      {/* ---------------------- RESULT OVERLAY ---------------------- */}
      {phase === "result" && outcome && (
        <div className="tsq-overlay">
          <div className={`tsq-panel tsq-panel--${outcome}`}>
            <p className="tsq-panel__kicker">ROUND COMPLETE</p>
            <h1 className="tsq-panel__title tsq-result-title">
              {outcome === "win"
                ? "VICTORY"
                : outcome === "lose"
                ? "DEFEAT"
                : "DRAW"}
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
            <button type="button" className="tsq-cta" onPointerDown={startGame}>
              PLAY AGAIN
            </button>
            {onExit && (
              <button type="button" className="tsq-ghost" onPointerDown={onExit}>
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
 * STYLES — scoped under .tsq-root, injected once. Dark neon arcade theme.
 * Strict viewport-height layout; all animation is transform/opacity only.
 * ====================================================================== */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;600;700&display=swap');

.tsq-root{
  --tsq-h: 100dvh;
  --bg-0:#070912; --bg-1:#0d1226;
  --ink:#eaf0ff; --muted:#8a93b8;
  --you:#33e6c0; --rival:#ff5d8f; --accent:#6c8cff;
  --glass: rgba(255,255,255,.06);
  --glass-line: rgba(255,255,255,.10);
  position:relative; width:100%;
  height:var(--tsq-h); max-height:var(--tsq-h);
  padding-top:env(safe-area-inset-top);
  padding-bottom:env(safe-area-inset-bottom);
  box-sizing:border-box;
  display:flex; flex-direction:column; overflow:hidden;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(108,140,255,.20), transparent 60%),
    radial-gradient(90% 60% at 100% 110%, rgba(255,93,143,.16), transparent 60%),
    linear-gradient(180deg, var(--bg-1), var(--bg-0));
  color:var(--ink);
  font-family:'Rajdhani', system-ui, -apple-system, sans-serif;
  -webkit-tap-highlight-color:transparent; user-select:none; touch-action:manipulation;
}
.tsq-root *{ box-sizing:border-box; }

/* ---------------- HUD ---------------- */
.tsq-hud{ flex:0 0 auto; display:grid; grid-template-columns:1fr auto 1fr;
  align-items:start; gap:10px; padding:12px 12px 8px; }
.tsq-side{ display:flex; flex-direction:column; gap:1px; padding:8px 12px;
  border-radius:15px; background:var(--glass); border:1px solid var(--glass-line);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); min-width:0; }
.tsq-side--rival{ align-items:flex-end; text-align:right; }
.tsq-side__tag{ font-size:10px; letter-spacing:.22em; font-weight:700; color:var(--muted); }
.tsq-side--you .tsq-side__tag{ color:var(--you); }
.tsq-side--rival .tsq-side__tag{ color:var(--rival); }
.tsq-side__score{ font-family:'Orbitron',monospace; font-weight:800; font-size:25px; line-height:1.05;
  font-variant-numeric:tabular-nums; }
.tsq-side--you .tsq-side__score{ text-shadow:0 0 18px rgba(51,230,192,.45); }
.tsq-side--rival .tsq-side__score{ text-shadow:0 0 18px rgba(255,93,143,.45); }
.tsq-rival-q{ margin-top:3px; font-size:11px; font-weight:700; letter-spacing:.14em;
  padding:2px 8px; border-radius:999px; animation:tsq-pop .3s ease; }
.q-perfect{ color:#aeffe9; background:rgba(51,230,192,.16); }
.q-great{ color:#bfe0ff; background:rgba(108,140,255,.16); }
.q-good{ color:#ffe6b3; background:rgba(255,196,84,.14); }
.q-miss{ color:#ffb0c4; background:rgba(255,93,143,.16); }
.q-combo{ color:#fff; background:linear-gradient(90deg,rgba(108,140,255,.42),rgba(255,93,143,.42)); }
.q-wait{ color:var(--muted); background:transparent; }

.tsq-clock{ display:flex; flex-direction:column; align-items:center; gap:5px; padding-top:1px; }
.tsq-clock__num{ font-family:'Orbitron',monospace; font-weight:800; font-size:28px; line-height:1;
  font-variant-numeric:tabular-nums; transition:color .3s; }
.tsq-clock__num.is-low{ color:#ff6b8b; text-shadow:0 0 20px rgba(255,93,143,.6); animation:tsq-pulse 1s infinite; }
.tsq-clock__unit{ font-size:12px; color:var(--muted); margin-left:1px; }
.tsq-clock__bar{ width:92px; height:5px; border-radius:99px; overflow:hidden; background:rgba(255,255,255,.10); }
.tsq-clock__fill{ display:block; height:100%; width:100%; transform-origin:left center; border-radius:99px;
  background:linear-gradient(90deg,var(--you),var(--accent)); }
.tsq-clock__fill.is-running{ animation-name:tsq-drain; animation-timing-function:linear; animation-fill-mode:forwards; }
.tsq-clock__fill.is-low{ background:linear-gradient(90deg,#ff8a5c,var(--rival)); }

/* ---------------- STAGE ---------------- */
.tsq-stage-wrap{ position:relative; flex:1 1 auto; min-height:0; overflow:hidden;
  margin:2px 12px 0; border-radius:22px; border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -30px rgba(0,0,0,.9); }
.tsq-stage-wrap.is-shake{ animation:tsq-shake .26s ease; }
.tsq-grid{ position:absolute; inset:0; opacity:.5; pointer-events:none;
  background-image:
    linear-gradient(rgba(108,140,255,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(108,140,255,.07) 1px, transparent 1px);
  background-size:30px 30px;
  -webkit-mask-image:radial-gradient(120% 90% at 50% 28%, #000 40%, transparent 82%);
          mask-image:radial-gradient(120% 90% at 50% 28%, #000 40%, transparent 82%); }
.tsq-flash{ position:absolute; inset:0; border-radius:22px; pointer-events:none; z-index:6; opacity:0; }
.tsq-flash.is-good{ box-shadow:inset 0 0 60px rgba(51,230,192,.45); animation:tsq-flash .28s ease; }
.tsq-flash.is-bad{ box-shadow:inset 0 0 64px rgba(255,93,143,.5); animation:tsq-flash .3s ease; }
.tsq-stage{ position:absolute; inset:0; --tsq-stage-h:100%; }
.tsq-anchor{ position:absolute; left:0; right:0; height:0; }

/* ---------------- BLOCKS (premium 3D neon) ---------------- */
.tsq-block{ position:absolute; top:0; left:0; border-radius:7px; will-change:transform;
  background:linear-gradient(177deg,
    hsl(var(--h) 95% 68%) 0%,
    hsl(var(--h) 88% 54%) 48%,
    hsl(var(--h) 82% 44%) 100%);
  box-shadow:
    0 0 16px hsla(var(--h),95%,60%,.45),                 /* neon rim glow */
    0 6px 12px -6px rgba(0,0,0,.7),                       /* soft ground shadow */
    inset 0 1.5px 0 rgba(255,255,255,.6),                 /* top light edge */
    inset 0 0 0 1px hsla(var(--h),90%,78%,.35),           /* crisp rim */
    inset 0 -6px 10px hsla(var(--h),75%,26%,.6); }        /* bottom depth */
/* glossy top highlight */
.tsq-block::before{ content:""; position:absolute; left:7%; right:7%; top:2px; height:38%;
  border-radius:6px 6px 9px 9px; pointer-events:none;
  background:linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,0)); }
.tsq-block--placed{ transition:transform .17s cubic-bezier(.22,1,.36,1); }
/* impact pulse when a block lands */
.tsq-block__land{ position:absolute; inset:-2px; border-radius:9px; pointer-events:none;
  background:radial-gradient(circle, hsla(var(--h),95%,75%,.55), transparent 70%);
  opacity:0; animation:tsq-land .34s ease-out; }
.tsq-block--active{ z-index:3;
  box-shadow:
    0 0 26px hsla(var(--h),95%,62%,.72),
    0 8px 16px -6px rgba(0,0,0,.7),
    inset 0 1.5px 0 rgba(255,255,255,.66),
    inset 0 0 0 1px hsla(var(--h),90%,80%,.45),
    inset 0 -6px 10px hsla(var(--h),75%,26%,.6);
  animation:tsq-breathe 1.5s ease-in-out infinite; }

/* sliced-off debris */
.tsq-slice{ position:absolute; top:0; left:0; border-radius:6px; z-index:2; pointer-events:none;
  background:linear-gradient(177deg, hsl(var(--h) 92% 64%), hsl(var(--h) 82% 46%));
  box-shadow:0 0 12px hsla(var(--h),95%,60%,.4), inset 0 1px 0 rgba(255,255,255,.4);
  transform:translate3d(var(--sx),0,0); animation:tsq-slice-fall .5s cubic-bezier(.4,0,.7,1) forwards; }

/* ---------------- FEEDBACK POPUP ---------------- */
.tsq-fx{ position:absolute; top:-34px; left:50%; z-index:7; pointer-events:none;
  display:flex; flex-direction:column; align-items:center; gap:1px;
  transform:translateX(-50%); animation:tsq-rise .76s ease-out forwards; }
.tsq-fx__label{ font-family:'Orbitron',monospace; font-weight:800; font-size:22px; letter-spacing:.05em; }
.tsq-fx__pts{ font-size:13px; font-weight:700; color:var(--muted); }
.tsq-fx.q-perfect .tsq-fx__label{ color:#5ffbe0; text-shadow:0 0 18px rgba(51,230,192,.8); }
.tsq-fx.q-great .tsq-fx__label{ color:#9cc0ff; text-shadow:0 0 16px rgba(108,140,255,.7); }
.tsq-fx.q-good .tsq-fx__label{ color:#ffd98a; text-shadow:0 0 14px rgba(255,196,84,.6); }
.tsq-fx.q-miss .tsq-fx__label{ color:#ff7a99; text-shadow:0 0 14px rgba(255,93,143,.6); }
.tsq-fx.q-miss .tsq-fx__pts{ color:#ff8aa6; }
.tsq-fx.q-combo .tsq-fx__label{ color:#fff;
  background:linear-gradient(90deg,#6c8cff,#ff5d8f); -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; filter:drop-shadow(0 0 14px rgba(255,93,143,.7)); }

/* ---------------- BOTTOM CONTROL ---------------- */
.tsq-control{ flex:0 0 auto; display:flex; justify-content:center; padding:14px 12px 12px; }
.tsq-tap{ position:relative; width:100%; max-width:440px; height:60px; border:none; cursor:pointer;
  border-radius:18px; color:#04121a; font-family:'Orbitron',monospace; font-weight:800;
  font-size:15px; letter-spacing:.14em; overflow:hidden;
  background:linear-gradient(135deg, var(--you), var(--accent));
  box-shadow:0 14px 36px -12px rgba(51,230,192,.7), inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .08s ease, filter .2s ease; }
.tsq-tap:active{ transform:translateY(2px) scale(.985); }
.tsq-tap:disabled{ filter:grayscale(.7) brightness(.7); cursor:default; box-shadow:none; }
.tsq-tap__label{ position:relative; z-index:1; }
.tsq-tap__ring{ position:absolute; inset:0; border-radius:18px; pointer-events:none;
  background:radial-gradient(60% 120% at 50% 0%, rgba(255,255,255,.45), transparent 70%); }

/* ---------------- OVERLAYS ---------------- */
.tsq-overlay{ position:absolute; inset:0; z-index:20; display:flex; align-items:center; justify-content:center;
  padding:24px; background:rgba(5,7,16,.72); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  animation:tsq-fade .25s ease; }
.tsq-panel{ width:100%; max-width:370px; text-align:center; padding:28px 24px 24px;
  border-radius:24px; border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(28,36,68,.85), rgba(12,16,34,.92));
  box-shadow:0 40px 90px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.12);
  animation:tsq-rise-in .35s cubic-bezier(.22,1,.36,1); }
.tsq-panel__kicker{ margin:0 0 10px; font-size:11px; letter-spacing:.28em; font-weight:700; color:var(--accent); }
.tsq-panel__title{ margin:0; font-family:'Orbitron',monospace; font-weight:800; font-size:38px; line-height:1;
  background:linear-gradient(180deg,#fff,#9fb4ff); -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; filter:drop-shadow(0 6px 24px rgba(108,140,255,.5)); }
.tsq-panel__sub{ margin:14px 2px 22px; color:var(--muted); font-size:14.5px; line-height:1.5; font-weight:500; }
.tsq-result-title{ font-size:44px; }
.tsq-panel--win .tsq-result-title{ background:linear-gradient(180deg,#a9ffe9,#33e6c0); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 6px 24px rgba(51,230,192,.6)); }
.tsq-panel--lose .tsq-result-title{ background:linear-gradient(180deg,#ffc2d2,#ff5d8f); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 6px 24px rgba(255,93,143,.55)); }
.tsq-panel--draw .tsq-result-title{ background:linear-gradient(180deg,#fff,#cdd6ff); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.tsq-result-scores{ display:flex; align-items:center; justify-content:center; gap:18px; margin:6px 0 24px; }
.tsq-result-scores__col{ display:flex; flex-direction:column; gap:4px; min-width:76px; }
.tsq-result-scores__col span{ font-size:11px; letter-spacing:.2em; color:var(--muted); font-weight:700; }
.tsq-result-scores__col strong{ font-family:'Orbitron',monospace; font-size:33px; }
.tsq-result-scores__col:first-child strong{ color:var(--you); }
.tsq-result-scores__col:last-child strong{ color:var(--rival); }
.tsq-result-scores__vs{ font-family:'Orbitron',monospace; font-size:13px; color:var(--muted); }
.tsq-cta{ width:100%; height:56px; border:none; cursor:pointer; border-radius:17px;
  font-family:'Orbitron',monospace; font-weight:800; font-size:15px; letter-spacing:.14em; color:#04121a;
  background:linear-gradient(135deg, var(--you), var(--accent));
  box-shadow:0 16px 40px -14px rgba(51,230,192,.7), inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .08s ease; }
.tsq-cta:active{ transform:translateY(2px) scale(.985); }
.tsq-ghost{ margin-top:12px; width:100%; height:42px; border:1px solid var(--glass-line);
  background:transparent; color:var(--muted); border-radius:13px; cursor:pointer;
  font-family:'Rajdhani',sans-serif; font-weight:600; letter-spacing:.1em; font-size:13px; }

/* ---------------- KEYFRAMES ---------------- */
@keyframes tsq-drain{ from{ transform:scaleX(1);} to{ transform:scaleX(0);} }
@keyframes tsq-breathe{ 0%,100%{ filter:brightness(1);} 50%{ filter:brightness(1.14);} }
@keyframes tsq-land{ 0%{ opacity:.85; transform:scale(1.03);} 100%{ opacity:0; transform:scale(1.22);} }
@keyframes tsq-slice-fall{
  0%{ opacity:1; transform:translate3d(var(--sx),0,0) rotate(0);}
  100%{ opacity:0; transform:translate3d(calc(var(--sx) + var(--dx)),120px,0) rotate(var(--rot));} }
@keyframes tsq-rise{ 0%{ opacity:0; transform:translate(-50%,6px) scale(.85);} 18%{ opacity:1; transform:translate(-50%,0) scale(1);} 100%{ opacity:0; transform:translate(-50%,-42px) scale(1.04);} }
@keyframes tsq-shake{ 0%,100%{ transform:translateX(0);} 25%{ transform:translateX(-4px);} 50%{ transform:translateX(4px);} 75%{ transform:translateX(-2px);} }
@keyframes tsq-flash{ 0%{ opacity:0;} 30%{ opacity:1;} 100%{ opacity:0;} }
@keyframes tsq-pop{ 0%{ transform:scale(.6); opacity:0;} 100%{ transform:scale(1); opacity:1;} }
@keyframes tsq-pulse{ 0%,100%{ transform:scale(1);} 50%{ transform:scale(1.12);} }
@keyframes tsq-fade{ from{opacity:0;} to{opacity:1;} }
@keyframes tsq-rise-in{ from{ opacity:0; transform:translateY(20px) scale(.96);} to{ opacity:1; transform:translateY(0) scale(1);} }

@media (prefers-reduced-motion: reduce){
  .tsq-block--active{ animation:none !important; }
  .tsq-clock__num.is-low{ animation:none !important; }
}
`;