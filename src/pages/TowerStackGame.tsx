/**
 * TowerStackGame
 * --------------------------------------------------------------------------
 * A premium 1v1 "Tower Stack" duel screen for a Telegram Mini App.
 *
 * Architecture notes (read before extending):
 *  - The PLAYER side is fully simulated locally (tap to lock a moving block).
 *  - The OPPONENT side is intentionally *blind*: we never render its tower.
 *    We only ever consume `OpponentEvent`s and reflect score + last-move
 *    quality. Today those events come from `useBotOpponent`. To go online,
 *    write a `useSocketOpponent` hook with the SAME signature that emits the
 *    SAME `OpponentEvent` shape from WebSocket messages, and swap the one
 *    line marked `// === OPPONENT SOURCE ===`. Nothing else changes.
 *  - High-frequency motion (the sliding block) is driven by refs + a single
 *    requestAnimationFrame loop writing `transform` directly to the DOM, so
 *    it never triggers React re-renders. React state only changes on discrete
 *    events (a placed block, a score change, the per-second clock).
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

const BLOCK_HEIGHT = 26; // px, on-screen height of one stacked block
const BLOCK_WIDTH_RATIO = 0.56; // block width as a fraction of the play area
const BLOCK_WIDTH_MIN = 118; // px clamp
const BLOCK_WIDTH_MAX = 220; // px clamp
const ACTIVE_LINE_RATIO = 0.3; // where the moving block sits (from top of stage)
const MAX_RENDERED_BLOCKS = 22; // older blocks scroll off-screen and are pruned

const BLOCK_SPEED_START = 235; // px/s horizontal speed of the moving block
const BLOCK_SPEED_RAMP = 7; // px/s added per placed block (difficulty curve)
const BLOCK_SPEED_MAX = 470; // px/s cap

// Alignment thresholds (px offset between the moving block and the one below).
const PERFECT_THRESHOLD = 6;
const GREAT_THRESHOLD = 16;
const GOOD_THRESHOLD = 34;

// Points awarded per move quality.
const SCORE: Record<BaseQuality, number> = {
  PERFECT: 100,
  GREAT: 60,
  GOOD: 30,
  MISS: 0,
};

const COMBO_THRESHOLD = 3; // consecutive strong moves before COMBO kicks in
const COMBO_BONUS = 25; // extra points per combo step beyond the threshold

// Bot cadence + skill profile (only used by useBotOpponent).
const BOT_MIN_INTERVAL_MS = 820;
const BOT_MAX_INTERVAL_MS = 1480;
const BOT_QUALITY_WEIGHTS = { PERFECT: 0.32, GREAT: 0.36, GOOD: 0.22, MISS: 0.1 };

/* =========================================================================
 * TYPES
 * ====================================================================== */
type BaseQuality = "PERFECT" | "GREAT" | "GOOD" | "MISS";
type Quality = BaseQuality | "COMBO";
type Phase = "ready" | "playing" | "result";
type Outcome = "win" | "lose" | "draw";

interface PlacedBlock {
  id: number;
  level: number; // absolute level (0 = base), used for camera math
  x: number; // locked left offset within the stage
}

interface FloatingFx {
  id: number;
  label: Quality;
  points: number;
  burst: boolean; // whether to spawn particles (PERFECT / COMBO only)
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
function baseQualityFromOffset(offset: number): BaseQuality {
  if (offset <= PERFECT_THRESHOLD) return "PERFECT";
  if (offset <= GREAT_THRESHOLD) return "GREAT";
  if (offset <= GOOD_THRESHOLD) return "GOOD";
  return "MISS";
}

/**
 * Resolve a base move into a display label + points + new combo count.
 * Strong moves (PERFECT/GREAT) extend the combo; anything weaker resets it.
 * Once the combo passes the threshold, strong moves read as "COMBO" and earn
 * escalating bonus points. Used identically by the player and the bot.
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

const hueForLevel = (level: number) => (192 + level * 26) % 360;
const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min));

/* =========================================================================
 * OPPONENT SOURCE (BOT) — isolated so it can be replaced by a socket hook.
 *
 * Future online version:
 *   function useSocketOpponent(active, onEvent) {
 *     useEffect(() => {
 *       const ws = new WebSocket(url);
 *       ws.onmessage = (m) => onEvent(JSON.parse(m.data) as OpponentEvent);
 *       return () => ws.close();
 *     }, [active]);
 *   }
 * Same signature, same event shape — drop-in replacement.
 * ====================================================================== */
function useBotOpponent(
  active: boolean,
  onEvent: (event: OpponentEvent) => void
) {
  // Keep the latest callback in a ref so re-scheduling never re-subscribes.
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
      const base = botBaseQuality();
      const resolved = resolveMove(base, combo);
      combo = resolved.combo;
      score += resolved.points;

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
  const [activeHue, setActiveHue] = useState(hueForLevel(1));
  const [fx, setFx] = useState<FloatingFx[]>([]);
  const [shake, setShake] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /* ---- Refs (high frequency / mutable engine values) ------------------- */
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);

  const stageWidthRef = useRef(0);
  const blockWidthRef = useRef(BLOCK_WIDTH_MIN);
  const minXRef = useRef(0);
  const maxXRef = useRef(0);
  const xRef = useRef(0); // current left offset of the moving block
  const dirRef = useRef(1); // +1 / -1
  const speedRef = useRef(BLOCK_SPEED_START);
  const prevXRef = useRef(0); // x of the block currently on top of the stack
  const placedCountRef = useRef(0); // absolute placed count (drives next level)
  const comboRef = useRef(0); // player combo streak
  const spawnSideRef = useRef(1); // alternate spawn side for variety

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef(0);
  const fxIdRef = useRef(0);
  const blockIdRef = useRef(0);
  const fxTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Telegram viewport handling (no scroll, exact fit) --------------- */
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: any })?.Telegram?.WebApp;
    const applyHeight = () => {
      const h = tg?.viewportStableHeight || window.innerHeight;
      rootRef.current?.style.setProperty("--tsq-h", `${h}px`);
    };
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      /* not in Telegram — ignore */
    }
    applyHeight();
    window.addEventListener("resize", applyHeight);
    tg?.onEvent?.("viewportChanged", applyHeight);
    return () => {
      window.removeEventListener("resize", applyHeight);
      tg?.offEvent?.("viewportChanged", applyHeight);
    };
  }, []);

  /* ---- Measure the stage and derive block geometry --------------------- */
  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const width = stage.clientWidth;
    stageWidthRef.current = width;
    const blockWidth = Math.round(
      Math.min(BLOCK_WIDTH_MAX, Math.max(BLOCK_WIDTH_MIN, width * BLOCK_WIDTH_RATIO))
    );
    blockWidthRef.current = blockWidth;
    minXRef.current = 0;
    maxXRef.current = Math.max(0, width - blockWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /* ---- The single rAF loop: moves the active block, no re-renders ------ */
  const stepLoop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    // Clamp dt so a backgrounded tab doesn't teleport the block.
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

  /* ---- Spawn a fresh moving block on top of the stack ------------------ */
  const spawnActiveBlock = useCallback(() => {
    const fromLeft = spawnSideRef.current > 0;
    spawnSideRef.current *= -1;
    xRef.current = fromLeft ? minXRef.current : maxXRef.current;
    dirRef.current = fromLeft ? 1 : -1;
    speedRef.current = Math.min(
      BLOCK_SPEED_MAX,
      BLOCK_SPEED_START + placedCountRef.current * BLOCK_SPEED_RAMP
    );
    setActiveHue(hueForLevel(placedCountRef.current + 1));
    const el = activeBlockRef.current;
    if (el) el.style.transform = `translate3d(${xRef.current}px,0,0)`;
  }, []);

  /* ---- Floating feedback popup (auto-cleaned) -------------------------- */
  const pushFx = useCallback((label: Quality, points: number) => {
    const id = fxIdRef.current++;
    const burst = label === "PERFECT" || label === "COMBO";
    setFx((prev) => [...prev, { id, label, points, burst }]);
    const t = setTimeout(() => {
      setFx((prev) => prev.filter((f) => f.id !== id));
    }, 760);
    fxTimeouts.current.push(t);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
    shakeTimeout.current = setTimeout(() => setShake(false), 240);
  }, []);

  /* ---- PLAYER MOVE: lock the moving block ------------------------------ */
  const placeBlock = useCallback(() => {
    if (phase !== "playing") return;

    const offset = Math.abs(xRef.current - prevXRef.current);
    const base = baseQualityFromOffset(offset);
    const resolved = resolveMove(base, comboRef.current);
    comboRef.current = resolved.combo;

    // PERFECT snaps to a clean lock; everything else stays where you tapped.
    const lockedX = base === "PERFECT" ? prevXRef.current : xRef.current;
    prevXRef.current = lockedX;

    const level = placedCountRef.current;
    placedCountRef.current += 1;

    const newBlock: PlacedBlock = { id: blockIdRef.current++, level, x: lockedX };
    setPlaced((prev) => {
      const next = [...prev, newBlock];
      // Prune blocks that have scrolled off the top of the viewport.
      return next.length > MAX_RENDERED_BLOCKS
        ? next.slice(next.length - MAX_RENDERED_BLOCKS)
        : next;
    });

    setPlayerScore((s) => s + resolved.points);
    pushFx(resolved.label, resolved.points);
    if (resolved.label === "PERFECT" || resolved.label === "COMBO") triggerShake();

    spawnActiveBlock();
  }, [phase, pushFx, spawnActiveBlock, triggerShake]);

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
        // Decide the winner from the latest scores.
        setPhase("result");
        return;
      }
      // setState bails out when the integer value is unchanged → ~1 render/s.
      setSecondsLeft(Math.ceil(remaining / 1000));
    }, 200);

    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [phase]);

  // Resolve outcome once when the round ends (reads the final scores).
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
      if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
      fxTimeouts.current.forEach(clearTimeout);
    };
  }, [stopLoop]);

  /* ---- Lifecycle controls ---------------------------------------------- */
  const resetEngine = useCallback(() => {
    measure();
    placedCountRef.current = 1;
    comboRef.current = 0;
    speedRef.current = BLOCK_SPEED_START;
    const center = Math.round((stageWidthRef.current - blockWidthRef.current) / 2);
    prevXRef.current = center;

    setPlaced([{ id: blockIdRef.current++, level: 0, x: center }]);
    setPlayerScore(0);
    setOpponentScore(0);
    setOpponentQuality(null);
    setFx([]);
    setOutcome(null);
    setSecondsLeft(ROUND_DURATION_MS / 1000);
    setActiveHue(hueForLevel(1));

    xRef.current = minXRef.current;
    dirRef.current = 1;
    spawnSideRef.current = 1;
  }, [measure]);

  const startGame = useCallback(() => {
    resetEngine();
    setPhase("playing");
  }, [resetEngine]);

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
            className={`tsq-rival-quality q-${(opponentQuality ?? "wait").toLowerCase()}`}
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
        <div className="tsq-stage" ref={stageRef}>
          {/* Anchor line: active block sits here; placed blocks stack downward */}
          <div className="tsq-anchor" style={{ top: activeTop }}>
            {placed.map((b) => {
              const depth = topLevel - b.level + 1; // 1 = just below active
              const hue = hueForLevel(b.level);
              return (
                <div
                  key={b.id}
                  className="tsq-block tsq-block--placed"
                  style={
                    {
                      width: blockWidthRef.current,
                      height: BLOCK_HEIGHT,
                      transform: `translate3d(${b.x}px, ${depth * BLOCK_HEIGHT}px, 0)`,
                      ["--h" as any]: hue,
                    } as React.CSSProperties
                  }
                />
              );
            })}

            {phase === "playing" && (
              <div
                ref={activeBlockRef}
                className="tsq-block tsq-block--active"
                style={
                  {
                    width: blockWidthRef.current,
                    height: BLOCK_HEIGHT,
                    ["--h" as any]: activeHue,
                  } as React.CSSProperties
                }
              >
                <span className="tsq-block__sheen" />
              </div>
            )}

            {/* Floating quality popups + lightweight particles */}
            {fx.map((f) => (
              <div key={f.id} className={`tsq-fx q-${f.label.toLowerCase()}`}>
                <span className="tsq-fx__label">{f.label}</span>
                {f.points > 0 && <span className="tsq-fx__pts">+{f.points}</span>}
                {f.burst && (
                  <span className="tsq-fx__burst">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <i
                        key={i}
                        style={{ ["--a" as any]: `${i * 45}deg` }}
                      />
                    ))}
                  </span>
                )}
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
              Tap to lock each block. Nail the alignment for PERFECT hits and
              chain COMBOs. Highest score after 40 seconds wins.
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
 * Animations use only transform/opacity for smoothness on mobile.
 * ====================================================================== */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;600;700&display=swap');

.tsq-root{
  --tsq-h: 100dvh;
  --bg-0:#070912; --bg-1:#0d1226; --bg-2:#131a36;
  --ink:#eaf0ff; --muted:#8a93b8;
  --you:#33e6c0; --rival:#ff5d8f; --accent:#6c8cff;
  --glass: rgba(255,255,255,.06);
  --glass-line: rgba(255,255,255,.10);
  position:relative; width:100%; height:var(--tsq-h);
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
.tsq-hud{
  flex:0 0 auto; display:grid; grid-template-columns:1fr auto 1fr;
  align-items:start; gap:10px; padding:14px 14px 10px;
}
.tsq-side{ display:flex; flex-direction:column; gap:2px; padding:9px 12px;
  border-radius:16px; background:var(--glass); border:1px solid var(--glass-line);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); min-width:0; }
.tsq-side--rival{ align-items:flex-end; text-align:right; }
.tsq-side__tag{ font-size:10px; letter-spacing:.22em; font-weight:700; color:var(--muted); }
.tsq-side--you .tsq-side__tag{ color:var(--you); }
.tsq-side--rival .tsq-side__tag{ color:var(--rival); }
.tsq-side__score{ font-family:'Orbitron',monospace; font-weight:800; font-size:26px; line-height:1;
  font-variant-numeric:tabular-nums; }
.tsq-side--you .tsq-side__score{ text-shadow:0 0 18px rgba(51,230,192,.45); }
.tsq-side--rival .tsq-side__score{ text-shadow:0 0 18px rgba(255,93,143,.45); }

.tsq-rival-quality{ margin-top:3px; font-size:11px; font-weight:700; letter-spacing:.14em;
  padding:2px 8px; border-radius:999px; animation:tsq-pop .32s ease; }
.q-perfect{ color:#aeffe9; background:rgba(51,230,192,.16); }
.q-great{ color:#bfe0ff; background:rgba(108,140,255,.16); }
.q-good{ color:#ffe6b3; background:rgba(255,196,84,.14); }
.q-miss{ color:#ffb0c4; background:rgba(255,93,143,.14); }
.q-combo{ color:#fff; background:linear-gradient(90deg,rgba(108,140,255,.4),rgba(255,93,143,.4)); }
.q-wait{ color:var(--muted); background:transparent; }

.tsq-clock{ display:flex; flex-direction:column; align-items:center; gap:6px; padding-top:2px; }
.tsq-clock__num{ font-family:'Orbitron',monospace; font-weight:800; font-size:30px; line-height:1;
  font-variant-numeric:tabular-nums; transition:color .3s; }
.tsq-clock__num.is-low{ color:#ff6b8b; text-shadow:0 0 20px rgba(255,93,143,.6); animation:tsq-pulse 1s infinite; }
.tsq-clock__unit{ font-size:13px; color:var(--muted); margin-left:1px; }
.tsq-clock__bar{ width:96px; height:5px; border-radius:99px; overflow:hidden;
  background:rgba(255,255,255,.10); }
.tsq-clock__fill{ display:block; height:100%; width:100%; transform-origin:left center;
  border-radius:99px; background:linear-gradient(90deg,var(--you),var(--accent)); }
.tsq-clock__fill.is-running{ animation-name:tsq-drain; animation-timing-function:linear; animation-fill-mode:forwards; }
.tsq-clock__fill.is-low{ background:linear-gradient(90deg,#ff8a5c,var(--rival)); }

/* ---------------- STAGE ---------------- */
.tsq-stage-wrap{ position:relative; flex:1 1 auto; min-height:0; overflow:hidden;
  margin:2px 12px 0; border-radius:24px; border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -30px rgba(0,0,0,.9);
}
.tsq-stage-wrap.is-shake{ animation:tsq-shake .24s ease; }
.tsq-grid{ position:absolute; inset:0; opacity:.5; pointer-events:none;
  background-image:
    linear-gradient(rgba(108,140,255,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(108,140,255,.07) 1px, transparent 1px);
  background-size:32px 32px;
  -webkit-mask-image:radial-gradient(120% 90% at 50% 30%, #000 40%, transparent 80%);
          mask-image:radial-gradient(120% 90% at 50% 30%, #000 40%, transparent 80%);
}
.tsq-stage{ position:absolute; inset:0; --tsq-stage-h:100%; }
.tsq-anchor{ position:absolute; left:0; right:0; height:0; }

/* blocks */
.tsq-block{ position:absolute; top:0; left:0; border-radius:8px; will-change:transform;
  background:linear-gradient(180deg, hsl(var(--h) 92% 64%), hsl(var(--h) 80% 46%));
  box-shadow:
    0 0 18px hsla(var(--h),95%,60%,.45),
    inset 0 1px 0 rgba(255,255,255,.45),
    inset 0 -4px 8px hsla(var(--h),80%,30%,.5);
}
.tsq-block--placed{ transition:transform .18s cubic-bezier(.22,1,.36,1); }
.tsq-block--placed::after{ content:""; position:absolute; inset:-2px; border-radius:10px; pointer-events:none;
  background:radial-gradient(circle, hsla(var(--h),95%,72%,.55), transparent 70%);
  opacity:0; animation:tsq-lockglow .36s ease-out; }
.tsq-block--active{ z-index:3; box-shadow:
    0 0 26px hsla(var(--h),95%,62%,.7),
    inset 0 1px 0 rgba(255,255,255,.55),
    inset 0 -4px 8px hsla(var(--h),80%,30%,.5);
  animation:tsq-float 1.6s ease-in-out infinite; }
.tsq-block__sheen{ position:absolute; inset:0; border-radius:8px; overflow:hidden; }
.tsq-block__sheen::after{ content:""; position:absolute; top:0; bottom:0; width:40%;
  left:-50%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);
  transform:skewX(-18deg); animation:tsq-sheen 1.8s ease-in-out infinite; }

/* floating feedback */
.tsq-fx{ position:absolute; top:-30px; left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:2px; z-index:5;
  pointer-events:none; animation:tsq-rise .76s ease-out forwards; }
.tsq-fx__label{ font-family:'Orbitron',monospace; font-weight:800; font-size:22px; letter-spacing:.06em; }
.tsq-fx__pts{ font-size:13px; font-weight:700; color:var(--muted); }
.tsq-fx.q-perfect .tsq-fx__label{ color:#5ffbe0; text-shadow:0 0 18px rgba(51,230,192,.8); }
.tsq-fx.q-great .tsq-fx__label{ color:#9cc0ff; text-shadow:0 0 16px rgba(108,140,255,.7); }
.tsq-fx.q-good .tsq-fx__label{ color:#ffd98a; text-shadow:0 0 14px rgba(255,196,84,.6); }
.tsq-fx.q-miss .tsq-fx__label{ color:#ff8aa6; }
.tsq-fx.q-combo .tsq-fx__label{ color:#fff;
  background:linear-gradient(90deg,#6c8cff,#ff5d8f); -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; text-shadow:none; filter:drop-shadow(0 0 14px rgba(255,93,143,.7)); }
.tsq-fx__burst{ position:absolute; top:18px; left:50%; width:0; height:0; }
.tsq-fx__burst i{ position:absolute; left:-3px; top:-3px; width:6px; height:6px; border-radius:99px;
  background:currentColor; color:#7ef0e0;
  transform:rotate(var(--a)) translateY(0); animation:tsq-spark .6s ease-out forwards; }
.tsq-fx.q-combo .tsq-fx__burst i{ color:#ff9ec4; }

/* ---------------- CONTROL ---------------- */
.tsq-control{ flex:0 0 auto; display:flex; justify-content:center; padding:16px 14px calc(18px + env(safe-area-inset-bottom)); }
.tsq-tap{ position:relative; width:100%; max-width:440px; height:64px; border:none; cursor:pointer;
  border-radius:20px; color:#04121a; font-family:'Orbitron',monospace; font-weight:800;
  font-size:15px; letter-spacing:.14em; overflow:hidden;
  background:linear-gradient(135deg, var(--you), var(--accent));
  box-shadow:0 14px 40px -12px rgba(51,230,192,.7), inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .08s ease, filter .2s ease; }
.tsq-tap:active{ transform:translateY(2px) scale(.985); }
.tsq-tap:disabled{ filter:grayscale(.7) brightness(.7); cursor:default; box-shadow:none; }
.tsq-tap__label{ position:relative; z-index:1; }
.tsq-tap__ring{ position:absolute; inset:0; border-radius:20px; pointer-events:none;
  background:radial-gradient(60% 120% at 50% 0%, rgba(255,255,255,.45), transparent 70%); }

/* ---------------- OVERLAYS ---------------- */
.tsq-overlay{ position:absolute; inset:0; z-index:20; display:flex; align-items:center; justify-content:center;
  padding:24px; background:rgba(5,7,16,.72); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  animation:tsq-fade .25s ease; }
.tsq-panel{ width:100%; max-width:380px; text-align:center; padding:30px 26px 26px;
  border-radius:26px; border:1px solid var(--glass-line);
  background:linear-gradient(180deg, rgba(28,36,68,.85), rgba(12,16,34,.9));
  box-shadow:0 40px 90px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.12);
  animation:tsq-rise-in .35s cubic-bezier(.22,1,.36,1); }
.tsq-panel__kicker{ margin:0 0 10px; font-size:11px; letter-spacing:.28em; font-weight:700; color:var(--accent); }
.tsq-panel__title{ margin:0; font-family:'Orbitron',monospace; font-weight:800; font-size:40px; line-height:1;
  letter-spacing:.02em; background:linear-gradient(180deg,#fff,#9fb4ff);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
  filter:drop-shadow(0 6px 24px rgba(108,140,255,.5)); }
.tsq-panel__sub{ margin:14px 4px 22px; color:var(--muted); font-size:15px; line-height:1.5; font-weight:500; }
.tsq-result-title{ font-size:46px; }
.tsq-panel--win .tsq-result-title{ background:linear-gradient(180deg,#a9ffe9,#33e6c0); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 6px 24px rgba(51,230,192,.6)); }
.tsq-panel--lose .tsq-result-title{ background:linear-gradient(180deg,#ffc2d2,#ff5d8f); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 6px 24px rgba(255,93,143,.55)); }
.tsq-panel--draw .tsq-result-title{ background:linear-gradient(180deg,#fff,#cdd6ff); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.tsq-result-scores{ display:flex; align-items:center; justify-content:center; gap:18px; margin:6px 0 24px; }
.tsq-result-scores__col{ display:flex; flex-direction:column; gap:4px; min-width:78px; }
.tsq-result-scores__col span{ font-size:11px; letter-spacing:.2em; color:var(--muted); font-weight:700; }
.tsq-result-scores__col strong{ font-family:'Orbitron',monospace; font-size:34px; }
.tsq-result-scores__col:first-child strong{ color:var(--you); }
.tsq-result-scores__col:last-child strong{ color:var(--rival); }
.tsq-result-scores__vs{ font-family:'Orbitron',monospace; font-size:13px; color:var(--muted); }
.tsq-cta{ width:100%; height:58px; border:none; cursor:pointer; border-radius:18px;
  font-family:'Orbitron',monospace; font-weight:800; font-size:15px; letter-spacing:.14em; color:#04121a;
  background:linear-gradient(135deg, var(--you), var(--accent));
  box-shadow:0 16px 40px -14px rgba(51,230,192,.7), inset 0 1px 0 rgba(255,255,255,.5);
  transition:transform .08s ease; }
.tsq-cta:active{ transform:translateY(2px) scale(.985); }
.tsq-ghost{ margin-top:12px; width:100%; height:44px; border:1px solid var(--glass-line);
  background:transparent; color:var(--muted); border-radius:14px; cursor:pointer;
  font-family:'Rajdhani',sans-serif; font-weight:600; letter-spacing:.1em; font-size:13px; }

/* ---------------- KEYFRAMES ---------------- */
@keyframes tsq-drain{ from{ transform:scaleX(1);} to{ transform:scaleX(0);} }
@keyframes tsq-lockglow{ 0%{ opacity:.9; transform:scale(1.04);} 100%{ opacity:0; transform:scale(1.2);} }
@keyframes tsq-float{ 0%,100%{ filter:brightness(1);} 50%{ filter:brightness(1.12);} }
@keyframes tsq-sheen{ 0%{ left:-60%;} 55%,100%{ left:130%;} }
@keyframes tsq-rise{ 0%{ opacity:0; transform:translate(-50%,6px) scale(.85);} 18%{ opacity:1; transform:translate(-50%,0) scale(1);} 100%{ opacity:0; transform:translate(-50%,-40px) scale(1.04);} }
@keyframes tsq-spark{ 0%{ opacity:1; transform:rotate(var(--a)) translateY(0) scale(1);} 100%{ opacity:0; transform:rotate(var(--a)) translateY(-34px) scale(.3);} }
@keyframes tsq-shake{ 0%,100%{ transform:translateX(0);} 25%{ transform:translateX(-4px);} 50%{ transform:translateX(4px);} 75%{ transform:translateX(-2px);} }
@keyframes tsq-pop{ 0%{ transform:scale(.6); opacity:0;} 100%{ transform:scale(1); opacity:1;} }
@keyframes tsq-pulse{ 0%,100%{ transform:scale(1);} 50%{ transform:scale(1.12);} }
@keyframes tsq-fade{ from{opacity:0;} to{opacity:1;} }
@keyframes tsq-rise-in{ from{ opacity:0; transform:translateY(20px) scale(.96);} to{ opacity:1; transform:translateY(0) scale(1);} }

@media (prefers-reduced-motion: reduce){
  .tsq-block--active, .tsq-block__sheen::after, .tsq-clock__num.is-low{ animation:none !important; }
}
`;