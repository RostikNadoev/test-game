import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type StackBlock = { id: number; x: number; w: number; ti: number };
type Piece = { id: number; x: number; w: number; y: number; ti: number; dir: 1 | -1 };
type HitKind = 'perfect' | 'good' | 'close' | 'miss';
type HitMsg = { id: number; text: string; kind: HitKind };

// ─── Gameplay constants: механику почти не трогаем ────────────────────────────
const GAME_SECONDS = 30;
const STAGE_W = 300;
const START_W = 148;
const BLOCK_H = 24;
const PERFECT_GAP = 6;
const MIN_OVERLAP = 12;
const MIN_W = 32;
const MISS_PENALTY = 15;
const TAP_COOLDOWN_MS = 320;

// ─── UI constants ─────────────────────────────────────────────────────────────
const TOP_H = 58;
const TIMER_H = 3;
const ZONE_H = 34;
const STATS_H = 58;
const PLATFORM_H = 44;

// ─── Palette: твои тёмные premium-цвета ───────────────────────────────────────
const PAL = [
  { b: '#00FFCC', t: '#8EFFE8', d: '#007A60', g: 'rgba(0,255,204,0.6)' },
  { b: '#C084FC', t: '#E9D5FF', d: '#7E22CE', g: 'rgba(192,132,252,0.6)' },
  { b: '#FF9F5A', t: '#FECDAB', d: '#C2480A', g: 'rgba(255,159,90,0.6)' },
  { b: '#F472B6', t: '#FBCFE8', d: '#9D174D', g: 'rgba(244,114,182,0.6)' },
  { b: '#34D399', t: '#A7F3D0', d: '#065F46', g: 'rgba(52,211,153,0.6)' },
  { b: '#67E8F9', t: '#CFFAFE', d: '#0E7490', g: 'rgba(103,232,249,0.6)' },
] as const;

const MSG_COLOR: Record<HitKind, string> = {
  perfect: '#00FFCC',
  good: '#67E8F9',
  close: '#FF9F5A',
  miss: '#F87171',
};

const FLASH_BG: Record<HitKind, string> = {
  perfect: 'rgba(0,255,204,0.105)',
  good: 'rgba(103,232,249,0.08)',
  close: 'rgba(255,159,90,0.09)',
  miss: 'rgba(248,113,113,0.12)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function getKind(offset: number, overlap: number): HitKind {
  if (overlap <= MIN_OVERLAP) return 'miss';
  if (Math.abs(offset) <= PERFECT_GAP) return 'perfect';
  if (Math.abs(offset) <= 22) return 'good';
  return 'close';
}

function hitScore(kind: HitKind, overlap: number, combo: number): number {
  if (kind === 'perfect') return 100 + combo * 22;
  if (kind === 'good') return 60 + Math.round(overlap * 0.22);
  if (kind === 'close') return 28 + Math.round(overlap * 0.1);
  return -MISS_PENALTY;
}

function hitLabel(kind: HitKind, combo: number): string {
  if (kind === 'perfect') return combo >= 3 ? `PERFECT ×${combo}` : 'PERFECT!';
  if (kind === 'good') return 'GOOD';
  if (kind === 'close') return 'CLOSE';
  return `MISS −${MISS_PENALTY}`;
}

function blockGrad(ti: number): string {
  const p = PAL[ti % PAL.length];
  return `linear-gradient(168deg, ${p.t} 0%, ${p.b} 54%, ${p.d} 100%)`;
}

function makeBase(): StackBlock[] {
  return [{ id: 0, x: 0, w: START_W, ti: 0 }];
}

function formatTime(seconds: number) {
  return String(seconds).padStart(2, '0');
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────
function Block({
  x,
  w,
  y,
  ti,
  active,
}: {
  x: number;
  w: number;
  y: number;
  ti: number;
  active?: boolean;
}) {
  const p = PAL[ti % PAL.length];

  return (
    <div
      style={{
        position: 'absolute',
        height: BLOCK_H,
        width: w,
        left: `calc(50% + ${x}px)`,
        bottom: y,
        transform: 'translateX(-50%) skewX(-9deg)',
        background: blockGrad(ti),
        borderRadius: 10,
        boxShadow: active
          ? `0 0 28px ${p.g}, 0 0 7px ${p.g}, 0 9px 22px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -7px 12px rgba(0,0,0,0.22)`
          : '0 5px 15px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.46), inset 0 -6px 10px rgba(0,0,0,0.2)',
        zIndex: active ? 12 : 5,
        willChange: 'left, bottom, width',
        transition: active ? 'none' : 'bottom 160ms ease, width 160ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 7,
          right: 7,
          height: 4,
          background: 'rgba(255,255,255,0.42)',
          borderRadius: 3,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: '36%',
          height: 2,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '0 0 10px 10px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          left: 8,
          right: 8,
          height: 7,
          background: 'rgba(0,0,0,0.22)',
          filter: 'blur(5px)',
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

function BotPreview({ blocks }: { blocks: StackBlock[] }) {
  const show = blocks.slice(-6);

  return (
    <div
      style={{
        position: 'relative',
        width: 76,
        height: 76,
        overflow: 'hidden',
        borderRadius: 16,
        background:
          'radial-gradient(circle at 50% 18%, rgba(192,132,252,0.20), transparent 52%), rgba(255,255,255,0.025)',
        border: '0.5px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 5,
          width: 54,
          height: 5,
          transform: 'translateX(-50%)',
          background: 'rgba(192,132,252,0.5)',
          borderRadius: '50%',
          filter: 'blur(3px)',
        }}
      />

      {show.map((b, i) => (
        <div
          key={b.id}
          style={{
            position: 'absolute',
            height: 8,
            width: clamp(b.w * 0.28, 18, 62),
            left: '50%',
            bottom: 10 + i * 10,
            transform: `translateX(calc(-50% + ${b.x * 0.08}px)) skewX(-9deg)`,
            background: blockGrad(b.ti),
            borderRadius: 3,
            boxShadow: '0 2px 7px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.42)',
            transition: 'all 160ms ease',
          }}
        />
      ))}
    </div>
  );
}

function TinyStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <div
        style={{
          marginBottom: 3,
          fontSize: 7,
          fontWeight: 900,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.24)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 900,
          color,
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreCard({
  side,
  score,
  height,
  combo,
}: {
  side: 'you' | 'bot';
  score: number;
  height: number;
  combo?: number;
}) {
  const isYou = side === 'you';
  const color = isYou ? '#00FFCC' : '#C084FC';

  return (
    <div
      style={{
        minWidth: 0,
        height: 48,
        borderRadius: 16,
        padding: '7px 10px',
        background: isYou
          ? 'linear-gradient(135deg, rgba(0,255,204,0.115), rgba(0,255,204,0.025))'
          : 'linear-gradient(135deg, rgba(192,132,252,0.115), rgba(192,132,252,0.025))',
        border: `0.5px solid ${isYou ? 'rgba(0,255,204,0.18)' : 'rgba(192,132,252,0.18)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {isYou && (
        <div
          style={{
            width: 31,
            height: 31,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,255,204,0.09)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)',
            fontSize: 16,
          }}
        >
          👑
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1, textAlign: isYou ? 'left' : 'right' }}>
        <div
          style={{
            marginBottom: 2,
            fontSize: 7,
            fontWeight: 900,
            letterSpacing: '0.18em',
            color,
            opacity: 0.66,
            textTransform: 'uppercase',
          }}
        >
          {isYou ? 'Вы' : 'Бот'}
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            lineHeight: 0.92,
            color: '#fff',
            letterSpacing: '-0.055em',
          }}
        >
          {score}
        </div>

        <div
          style={{
            marginTop: 3,
            display: 'flex',
            justifyContent: isYou ? 'flex-start' : 'flex-end',
            gap: 6,
            fontSize: 7.5,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.32)',
          }}
        >
          <span>↑ {height}</span>
          {isYou && combo !== undefined && combo >= 2 && (
            <span style={{ color: '#FF9F5A' }}>×{combo}</span>
          )}
        </div>
      </div>

      {!isYou && (
        <div
          style={{
            width: 31,
            height: 31,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(192,132,252,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)',
            fontSize: 15,
          }}
        >
          🤖
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export const TowerStackGame: React.FC = () => {
  const [stack, setStack] = useState<StackBlock[]>(makeBase);
  const [botStack, setBotStack] = useState<StackBlock[]>(makeBase);
  const [activeX, setActiveX] = useState(0);
  const [score, setScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [perfects, setPerfects] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [hitMsg, setHitMsg] = useState<HitMsg | null>(null);
  const [botMsg, setBotMsg] = useState<HitMsg | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [flashKind, setFlashKind] = useState<HitKind | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapH, setWrapH] = useState(0);

  const stackRef = useRef(stack);
  const botStackRef = useRef(botStack);
  const axRef = useRef(0);
  const comboRef = useRef(0);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const startTsRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => setWrapH(el.getBoundingClientRect().height);
    update();

    const ro = new ResizeObserver(([entry]) => {
      setWrapH(entry.contentRect.height);
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  useEffect(() => {
    botStackRef.current = botStack;
  }, [botStack]);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const topBlock = stack[stack.length - 1];
  const height = stack.length - 1;
  const botHeight = botStack.length - 1;

  const metrics = useMemo(() => {
    const safeH = wrapH || 620;
    const topTotal = TOP_H + TIMER_H + 8;
    const gameAreaH = Math.max(240, safeH - topTotal);
    const towerCanvasH = Math.max(170, gameAreaH - STATS_H - ZONE_H);
    const towerViewH = Math.min(towerCanvasH, safeH < 620 ? 285 : safeH < 720 ? 325 : 355);
    const cameraY = Math.max(0, (stack.length + 1) * BLOCK_H - towerViewH + 24);

    return {
      safeH,
      gameAreaH,
      towerCanvasH,
      towerViewH,
      cameraY,
    };
  }, [stack.length, wrapH]);

  const cameraY = metrics.cameraY;

  const lead = score - botScore;
  const timePct = (timeLeft / GAME_SECONDS) * 100;
  const lw = topBlock?.w ?? START_W;
  const range = Math.max(36, (STAGE_W - lw) / 2 - 4);
  const accPct = clamp(50 + (activeX / range) * 50, 2, 98);

  const leadText = useMemo(() => {
    if (!started) return 'Готов к дуэли';
    if (done) {
      if (lead > 0) return `Ты победил +${lead}`;
      if (lead < 0) return `Бот выше на ${Math.abs(lead)}`;
      return 'Ничья';
    }
    if (Math.abs(lead) < 80) return 'Ровная дуэль';
    return lead > 0 ? `Ты ведёшь +${lead}` : `Бот ведёт +${Math.abs(lead)}`;
  }, [done, lead, started]);

  // ─── RAF: движение блока ───────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return undefined;

    const loop = (now: number) => {
      if (!startTsRef.current) startTsRef.current = now;

      if (!doneRef.current) {
        const t = (now - startTsRef.current) / 1000;
        const cur = stackRef.current;
        const lastWidth = cur[cur.length - 1]?.w ?? START_W;
        const activeRange = Math.max(36, (STAGE_W - lastWidth) / 2 - 4);
        const speed = 1.05 + Math.min(cur.length, 24) * 0.026;
        const x = Math.sin(t * speed * Math.PI) * activeRange;

        axRef.current = x;
        setActiveX(x);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [started]);

  // ─── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || done) return undefined;

    const id = window.setInterval(() => {
      const elapsed = startTsRef.current ? (performance.now() - startTsRef.current) / 1000 : 0;
      const left = Math.max(0, Math.ceil(GAME_SECONDS - elapsed));

      setTimeLeft(left);

      if (left <= 0) setDone(true);
    }, 150);

    return () => window.clearInterval(id);
  }, [done, started]);

  // ─── Bot: маленькая live-башня ─────────────────────────────────────────────
  useEffect(() => {
    if (!started || done) return undefined;

    const id = window.setInterval(() => {
      if (doneRef.current) return;

      const bs = botStackRef.current;
      const last = bs[bs.length - 1];

      const r = Math.random();
      const err =
        r < 0.32
          ? (Math.random() - 0.5) * 9
          : r < 0.78
            ? (Math.random() - 0.5) * 50
            : (Math.random() - 0.5) * 104;

      const bx = clamp(last.x + err, -110, 110);

      const lastLeft = last.x - last.w / 2;
      const lastRight = last.x + last.w / 2;
      const currentLeft = bx - last.w / 2;
      const currentRight = bx + last.w / 2;

      const overlapLeft = Math.max(lastLeft, currentLeft);
      const overlapRight = Math.min(lastRight, currentRight);
      const overlap = overlapRight - overlapLeft;
      const kind = getKind(bx - last.x, overlap);

      if (kind === 'miss') {
        setBotMsg({ id: Date.now(), text: 'MISS', kind });
        return;
      }

      const nextWidth = kind === 'perfect' ? last.w : clamp(overlap, MIN_W, START_W);
      const nextX = kind === 'perfect' ? last.x : (overlapLeft + overlapRight) / 2;

      setBotScore((value) => value + hitScore(kind, overlap, 0));
      setBotMsg({
        id: Date.now(),
        text: kind === 'perfect' ? 'PERFECT' : kind === 'good' ? 'GOOD' : 'CLOSE',
        kind,
      });

      setBotStack((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          x: nextX,
          w: nextWidth,
          ti: prev.length % PAL.length,
        },
      ]);
    }, 1150);

    return () => window.clearInterval(id);
  }, [done, started]);

  // ─── Place block ───────────────────────────────────────────────────────────
  const place = useCallback(() => {
    if (doneRef.current || !startedRef.current) return;

    const now = Date.now();
    if (now - lastTapRef.current < TAP_COOLDOWN_MS) return;
    lastTapRef.current = now;

    const cur = stackRef.current;
    const last = cur[cur.length - 1];
    const x = axRef.current;

    const lastLeft = last.x - last.w / 2;
    const lastRight = last.x + last.w / 2;
    const currentLeft = x - last.w / 2;
    const currentRight = x + last.w / 2;

    const overlapLeft = Math.max(lastLeft, currentLeft);
    const overlapRight = Math.min(lastRight, currentRight);
    const overlap = overlapRight - overlapLeft;
    const offset = x - last.x;
    const kind = getKind(offset, overlap);

    const id = Date.now();
    const ti = cur.length % PAL.length;
    const blockY = PLATFORM_H + cur.length * BLOCK_H - cameraY;

    setCooldown(true);
    window.setTimeout(() => setCooldown(false), TAP_COOLDOWN_MS);

    setFlashKind(kind);
    window.setTimeout(() => setFlashKind(null), 130);

    const nextCombo = kind === 'perfect' ? comboRef.current + 1 : 0;

    if (kind === 'miss') {
      setCombo(0);
      setScore((value) => Math.max(0, value - MISS_PENALTY));
      setHitMsg({ id, text: hitLabel(kind, 0), kind });
      setPieces((items) => [
        ...items,
        {
          id,
          x,
          w: last.w,
          y: blockY,
          ti,
          dir: (x >= last.x ? 1 : -1) as 1 | -1,
        },
      ]);

      window.setTimeout(() => {
        setPieces((items) => items.filter((piece) => piece.id !== id));
      }, 750);

      return;
    }

    const nextWidth = kind === 'perfect' ? last.w : clamp(overlap, MIN_W, START_W);
    const nextX = kind === 'perfect' ? last.x : (overlapLeft + overlapRight) / 2;
    const points = hitScore(kind, overlap, nextCombo);
    const cut = last.w - overlap;

    if (kind === 'perfect') {
      setPerfects((value) => value + 1);
    }

    if (cut > 5) {
      const cutRight = x > last.x;
      const cutX = cutRight ? overlapRight + cut / 2 : overlapLeft - cut / 2;
      const cutId = id + 1;

      setPieces((items) => [
        ...items,
        {
          id: cutId,
          x: cutX,
          w: cut,
          y: blockY,
          ti,
          dir: (cutRight ? 1 : -1) as 1 | -1,
        },
      ]);

      window.setTimeout(() => {
        setPieces((items) => items.filter((piece) => piece.id !== cutId));
      }, 750);
    }

    setScore((value) => Math.max(0, value + points));
    setCombo(nextCombo);
    setHitMsg({ id, text: hitLabel(kind, nextCombo), kind });
    setStack((prev) => [...prev, { id, x: nextX, w: nextWidth, ti }]);
  }, [cameraY]);

  // ─── Reset / start ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStack(makeBase());
    setBotStack(makeBase());
    setActiveX(0);
    axRef.current = 0;
    setScore(0);
    setBotScore(0);
    setCombo(0);
    setPerfects(0);
    setTimeLeft(GAME_SECONDS);
    setHitMsg(null);
    setBotMsg(null);
    setPieces([]);
    setDone(false);
    setStarted(false);
    setFlashKind(null);
    setCooldown(false);

    startTsRef.current = null;
    lastTapRef.current = 0;
  }, []);

  const startGame = useCallback(() => {
    reset();
    window.setTimeout(() => setStarted(true), 20);
  }, [reset]);

  const handlePointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!started) {
        startGame();
        return;
      }

      if (done) return;

      place();
    },
    [done, place, startGame, started],
  );

  const stopPointer = useCallback((event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const currentBlock: StackBlock = {
    id: 999999,
    x: activeX,
    w: topBlock?.w ?? START_W,
    ti: stack.length % PAL.length,
  };

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    padding: '6px 8px 8px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#050610',
    background: flashKind
      ? `linear-gradient(180deg, ${FLASH_BG[flashKind]}, #050610 42%)`
      : 'linear-gradient(180deg, #050610 0%, #070916 45%, #050610 100%)',
    color: '#fff',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    cursor: cooldown ? 'not-allowed' : 'pointer',
    transition: 'background 120ms ease',
  };

  return (
    <div ref={wrapRef} style={rootStyle} onPointerUp={handlePointer}>
      {/* Ambient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.055,
          }}
        >
          <defs>
            <pattern id="tower-stack-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tower-stack-dots)" />
        </svg>

        <div
          style={{
            position: 'absolute',
            top: -110,
            left: -80,
            width: 290,
            height: 290,
            borderRadius: '50%',
            background: 'rgba(82,255,229,0.08)',
            filter: 'blur(90px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '25%',
            right: -110,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(157,124,255,0.11)',
            filter: 'blur(100px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: '18%',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'rgba(242,199,102,0.06)',
            filter: 'blur(90px)',
          }}
        />
      </div>

      {/* Compact top UI */}
      <section
        style={{
          position: 'relative',
          zIndex: 20,
          height: TOP_H,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 62px minmax(0,1fr)',
          gap: 7,
        }}
      >
        <ScoreCard side="you" score={score} height={height} combo={combo} />

        <div
          style={{
            height: 48,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.035)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                marginBottom: 2,
                fontSize: 6.5,
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              Time
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 0.9,
                letterSpacing: '-0.055em',
                color: timeLeft <= 10 ? '#F87171' : timeLeft <= 20 ? '#FF9F5A' : '#fff',
                transition: 'color 260ms ease',
              }}
            >
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>

        <ScoreCard side="bot" score={botScore} height={botHeight} />
      </section>

      <div
        style={{
          position: 'relative',
          zIndex: 20,
          height: TIMER_H,
          flexShrink: 0,
          margin: '0 1px 5px',
          overflow: 'hidden',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.055)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${timePct}%`,
            borderRadius: 999,
            background:
              timeLeft <= 10
                ? 'linear-gradient(90deg,#F87171,#FB923C)'
                : 'linear-gradient(90deg,#00FFCC,#C084FC,#FF9F5A)',
            boxShadow: timeLeft <= 10 ? '0 0 14px rgba(248,113,113,0.45)' : '0 0 14px rgba(0,255,204,0.28)',
            transition: 'width 160ms linear, background 240ms ease',
          }}
        />
      </div>

      {/* Game card */}
      <main
        style={{
          position: 'relative',
          zIndex: 5,
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 27,
          background:
            'radial-gradient(circle at 50% 0%, rgba(82,255,229,0.13), transparent 32%), radial-gradient(circle at 88% 22%, rgba(157,124,255,0.17), transparent 34%), rgba(8,8,12,0.72)',
          border: '0.5px solid rgba(255,255,255,0.085)',
          boxShadow:
            '0 22px 80px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.075), inset 0 -1px 0 rgba(255,255,255,0.035)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Top small title/status */}
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 10,
            zIndex: 46,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 25,
              borderRadius: 999,
              padding: '0 10px',
              background: 'rgba(255,255,255,0.055)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ color: '#F2C766', fontSize: 12, lineHeight: 1 }}>▰</span>
            <span
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: '0.17em',
                textTransform: 'uppercase',
              }}
            >
              Tower Stack
            </span>
          </div>

          <div
            style={{
              marginTop: 7,
              maxWidth: 188,
              fontSize: 11,
              lineHeight: 1.25,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.38)',
            }}
          >
            {leadText}
          </div>
        </div>

        {/* Hit message */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 0,
            right: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          {hitMsg && (
            <div
              key={hitMsg.id}
              style={{
                padding: '5px 12px 6px',
                borderRadius: 999,
                border: `0.5px solid ${MSG_COLOR[hitMsg.kind]}44`,
                background: 'rgba(5,8,15,0.74)',
                backdropFilter: 'blur(12px)',
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: MSG_COLOR[hitMsg.kind],
                textShadow: `0 0 18px ${MSG_COLOR[hitMsg.kind]}88`,
                animation: 'towerPop 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
                lineHeight: 1,
              }}
            >
              {hitMsg.text}
            </div>
          )}
        </div>

        {/* Bot preview */}
        <aside
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 44,
            width: 98,
            borderRadius: 20,
            padding: 7,
            background: 'rgba(5,8,15,0.78)',
            border: '0.5px solid rgba(192,132,252,0.2)',
            boxShadow: '0 16px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)',
            backdropFilter: 'blur(16px)',
          }}
          onPointerUp={stopPointer}
        >
          <div
            style={{
              height: 16,
              marginBottom: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 5,
            }}
          >
            <span
              style={{
                fontSize: 7,
                fontWeight: 900,
                letterSpacing: '0.18em',
                color: 'rgba(255,255,255,0.34)',
                textTransform: 'uppercase',
              }}
            >
              Bot
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                borderRadius: 999,
                padding: '2px 5px',
                background: 'rgba(248,113,113,0.12)',
                color: '#F87171',
                fontSize: 6.2,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <i
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#F87171',
                  boxShadow: '0 0 7px #F87171',
                  animation: 'towerBlink 1.25s ease infinite',
                }}
              />
              Live
            </span>
          </div>

          <BotPreview blocks={botStack} />

          <div
            style={{
              height: 14,
              marginTop: 5,
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            {botMsg && (
              <span
                key={botMsg.id}
                style={{
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 8,
                  fontWeight: 900,
                  color: MSG_COLOR[botMsg.kind],
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  animation: 'towerPop 0.18s ease both',
                }}
              >
                {botMsg.text}
              </span>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <section
          style={{
            position: 'absolute',
            inset: `0 0 ${STATS_H + ZONE_H}px 0`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 0,
              width: STAGE_W,
              height: metrics.towerCanvasH,
              maxHeight: '100%',
              transform: 'translateX(-50%)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 0,
                width: STAGE_W,
                height: metrics.towerViewH,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Decorative center line */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 10,
                  bottom: 44,
                  width: 1,
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04), transparent)',
                  opacity: 0.75,
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 5,
                  width: 190,
                  height: 22,
                  transform: 'translateX(-50%)',
                  background: 'rgba(157,124,255,0.32)',
                  borderRadius: '50%',
                  filter: 'blur(11px)',
                  zIndex: 1,
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 0,
                  width: 184,
                  height: 34,
                  transform: 'translateX(-50%)',
                  borderRadius: '46% 46% 14px 14px',
                  background: 'linear-gradient(180deg,#2A1F5A 0%,#130D30 100%)',
                  boxShadow:
                    '0 10px 24px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.13)',
                  zIndex: 3,
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 7,
                  transform: 'translateX(-50%)',
                  fontSize: 16,
                  zIndex: 4,
                  lineHeight: 1,
                  color: '#F2C766',
                  filter: 'drop-shadow(0 0 8px rgba(242,199,102,0.82))',
                }}
              >
                ♛
              </div>

              {stack.map((block, index) => (
                <Block
                  key={block.id}
                  x={block.x}
                  w={block.w}
                  y={PLATFORM_H + index * BLOCK_H - cameraY}
                  ti={block.ti}
                />
              ))}

              {started && !done && (
                <Block
                  key="active"
                  x={currentBlock.x}
                  w={currentBlock.w}
                  y={PLATFORM_H + stack.length * BLOCK_H - cameraY}
                  ti={currentBlock.ti}
                  active
                />
              )}

              {pieces.map((piece) => (
                <div
                  key={piece.id}
                  style={
                    {
                      position: 'absolute',
                      height: BLOCK_H,
                      width: piece.w,
                      left: `calc(50% + ${piece.x}px)`,
                      bottom: piece.y,
                      transform: 'translateX(-50%) skewX(-9deg)',
                      background: blockGrad(piece.ti),
                      borderRadius: 10,
                      animation: 'towerFall 0.68s cubic-bezier(0.55,0,1,0.45) forwards',
                      zIndex: 9,
                      boxShadow: '0 8px 18px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.45)',
                      '--dx': `${piece.dir * 70}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        </section>

        {/* Accuracy zone */}
        <section
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: STATS_H,
            height: ZONE_H,
            zIndex: 34,
            display: started && !done ? 'flex' : 'none',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingTop: 1,
          }}
        >
          <div
            style={{
              position: 'relative',
              height: 8,
              borderRadius: 999,
              border: '0.5px solid rgba(255,255,255,0.075)',
              background: 'rgba(255,255,255,0.05)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
              overflow: 'visible',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 1,
                display: 'flex',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div style={{ flex: '0 0 20%', background: 'rgba(248,113,113,0.52)' }} />
              <div style={{ flex: '0 0 15%', background: 'rgba(255,159,90,0.56)' }} />
              <div style={{ flex: '0 0 30%', background: 'rgba(0,255,204,0.66)' }} />
              <div style={{ flex: '0 0 15%', background: 'rgba(255,159,90,0.56)' }} />
              <div style={{ flex: '0 0 20%', background: 'rgba(248,113,113,0.52)' }} />
            </div>

            <div
              style={{
                position: 'absolute',
                top: -5,
                left: `${accPct}%`,
                width: 4,
                height: 18,
                borderRadius: 999,
                background: '#fff',
                boxShadow: '0 0 9px rgba(255,255,255,0.9), 0 0 18px rgba(255,255,255,0.35)',
                transform: 'translateX(-50%)',
                transition: 'left 0.035s linear',
                zIndex: 5,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 4,
              display: 'grid',
              gridTemplateColumns: '1fr 0.8fr 1.2fr 0.8fr 1fr',
              textAlign: 'center',
              fontSize: 6,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {[
              ['MISS', 'rgba(248,113,113,0.43)'],
              ['CLOSE', 'rgba(255,159,90,0.45)'],
              ['PERFECT', 'rgba(0,255,204,0.68)'],
              ['CLOSE', 'rgba(255,159,90,0.45)'],
              ['MISS', 'rgba(248,113,113,0.43)'],
            ].map(([label, color]) => (
              <span key={`${label}-${color}`} style={{ color }}>
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Bottom stats */}
        <section
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 33,
            height: STATS_H,
            background: 'rgba(5,8,15,0.9)',
            borderTop: '0.5px solid rgba(255,255,255,0.065)',
            backdropFilter: 'blur(20px)',
            display: started && !done ? 'grid' : 'none',
            gridTemplateColumns: 'repeat(3,1fr)',
            alignItems: 'center',
            padding: '0 14px',
          }}
        >
          <TinyStat label="Комбо" value={combo >= 1 ? `×${combo}` : '×1'} color="#FF9F5A" />
          <TinyStat label="Высота" value={height} color="#00FFCC" />
          <TinyStat label="Perfect" value={perfects} color="#C084FC" />
        </section>

        {/* Start / finish overlay */}
        {(!started || done) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 65,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(5,6,16,0.7)',
              backdropFilter: 'blur(7px)',
              overflow: 'hidden',
            }}
            onPointerUp={stopPointer}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 304,
                borderRadius: 26,
                padding: done ? '20px 16px 16px' : '22px 16px 16px',
                textAlign: 'center',
                background:
                  'radial-gradient(circle at 50% 0%, rgba(82,255,229,0.12), transparent 38%), rgba(8,11,20,0.97)',
                border: '0.5px solid rgba(255,255,255,0.09)',
                boxShadow: '0 28px 80px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              {done ? (
                <>
                  <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>
                    {lead > 0 ? '🏆' : lead < 0 ? '🤖' : '🤝'}
                  </div>

                  <div
                    style={{
                      marginBottom: 4,
                      fontSize: 27,
                      fontWeight: 900,
                      letterSpacing: '-0.065em',
                      lineHeight: 1,
                      color: lead > 0 ? '#00FFCC' : lead < 0 ? '#C084FC' : '#FF9F5A',
                    }}
                  >
                    {lead > 0 ? 'ВЫ ПОБЕДИЛИ' : lead < 0 ? 'БОТ ПОБЕДИЛ' : 'НИЧЬЯ'}
                  </div>

                  <div
                    style={{
                      marginBottom: 15,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.34)',
                    }}
                  >
                    {lead > 0 ? `+${lead} очков` : lead < 0 ? `Разрыв ${Math.abs(lead)}` : 'Одинаковый счёт'}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {[
                      {
                        label: 'Вы',
                        value: score,
                        sub: `↑ ${height}`,
                        color: '#00FFCC',
                        bg: 'rgba(0,255,204,0.07)',
                        bd: 'rgba(0,255,204,0.17)',
                      },
                      {
                        label: 'Бот',
                        value: botScore,
                        sub: `↑ ${botHeight}`,
                        color: '#C084FC',
                        bg: 'rgba(192,132,252,0.07)',
                        bd: 'rgba(192,132,252,0.17)',
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: '10px 6px',
                          borderRadius: 16,
                          background: item.bg,
                          border: `0.5px solid ${item.bd}`,
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 2,
                            fontSize: 7,
                            fontWeight: 900,
                            letterSpacing: '0.18em',
                            color: item.color,
                            opacity: 0.72,
                            textTransform: 'uppercase',
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 26,
                            fontWeight: 900,
                            lineHeight: 1.08,
                            color: '#fff',
                            letterSpacing: '-0.055em',
                          }}
                        >
                          {item.value}
                        </div>
                        <div
                          style={{
                            fontSize: 8,
                            color: 'rgba(255,255,255,0.3)',
                            fontWeight: 800,
                          }}
                        >
                          {item.sub}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginBottom: 15,
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 4px',
                        borderRadius: 13,
                        background: 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <div
                        style={{
                          marginBottom: 2,
                          fontSize: 7,
                          fontWeight: 900,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: 'rgba(0,255,204,0.62)',
                        }}
                      >
                        Перфекты
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{perfects}</div>
                    </div>

                    <div
                      style={{
                        padding: '8px 4px',
                        borderRadius: 13,
                        background: 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <div
                        style={{
                          marginBottom: 2,
                          fontSize: 7,
                          fontWeight: 900,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,159,90,0.66)',
                        }}
                      >
                        Комбо
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
                        {combo > 0 ? `×${combo}` : '—'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onPointerUp={(event) => {
                      stopPointer(event);
                      startGame();
                    }}
                    style={{
                      width: '100%',
                      height: 48,
                      border: 'none',
                      borderRadius: 17,
                      background: 'linear-gradient(135deg,#00FFCC,#C084FC)',
                      color: '#040810',
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      boxShadow: '0 12px 30px rgba(0,255,204,0.24)',
                      cursor: 'pointer',
                    }}
                  >
                    Играть снова
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      margin: '0 auto 12px',
                      borderRadius: 21,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 28,
                      background:
                        'linear-gradient(135deg, rgba(0,255,204,0.13), rgba(192,132,252,0.14))',
                      border: '0.5px solid rgba(0,255,204,0.2)',
                      boxShadow: '0 0 34px rgba(0,255,204,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                  >
                    🏗️
                  </div>

                  <div
                    style={{
                      marginBottom: 3,
                      fontSize: 27,
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: '-0.065em',
                      color: '#fff',
                    }}
                  >
                    Tower Stack
                  </div>

                  <div
                    style={{
                      marginBottom: 14,
                      color: 'rgba(0,255,204,0.54)',
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                    }}
                  >
                    vs Bot • {GAME_SECONDS}s
                  </div>

                  <div
                    style={{
                      marginBottom: 17,
                      padding: '11px 13px',
                      borderRadius: 15,
                      background: 'rgba(255,255,255,0.035)',
                      border: '0.5px solid rgba(255,255,255,0.055)',
                      textAlign: 'left',
                      color: 'rgba(255,255,255,0.39)',
                      fontSize: 11,
                      lineHeight: 1.62,
                      fontWeight: 600,
                    }}
                  >
                    🟢{' '}
                    <strong style={{ color: 'rgba(0,255,204,0.76)', fontWeight: 800 }}>
                      PERFECT
                    </strong>{' '}
                    — точно в центр
                    <br />
                    🟡{' '}
                    <strong style={{ color: 'rgba(255,159,90,0.76)', fontWeight: 800 }}>
                      CLOSE
                    </strong>{' '}
                    — башня станет уже
                    <br />
                    🔴{' '}
                    <strong style={{ color: 'rgba(248,113,113,0.76)', fontWeight: 800 }}>
                      MISS
                    </strong>{' '}
                    — −{MISS_PENALTY} очков
                  </div>

                  <button
                    type="button"
                    onPointerUp={(event) => {
                      stopPointer(event);
                      startGame();
                    }}
                    style={{
                      width: '100%',
                      height: 50,
                      border: 'none',
                      borderRadius: 17,
                      background: 'linear-gradient(135deg,#00FFCC,#C084FC)',
                      color: '#040810',
                      fontSize: 13,
                      fontWeight: 900,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      boxShadow: '0 14px 34px rgba(0,255,204,0.26)',
                      cursor: 'pointer',
                    }}
                  >
                    Старт
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes towerPop {
          0%   { transform: scale(0.82) translateY(5px); opacity: 0; }
          66%  { transform: scale(1.1) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }

        @keyframes towerFall {
          0% {
            opacity: 1;
            transform: translateX(-50%) skewX(-9deg) translateY(0) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translateX(calc(-50% + var(--dx,65px))) skewX(-9deg) translateY(165px) rotate(22deg);
          }
        }

        @keyframes towerBlink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.34; transform: scale(0.86); }
        }

        * {
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </div>
  );
};

export default TowerStackGame;
