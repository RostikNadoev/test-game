import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ============================================================================
 * Fruit Cascade — premium mobile casino slot
 * Single-file, no external CSS, no extra deps.
 * ==========================================================================*/

const COLS = 6;
const ROWS = 5;
const CELL_COUNT = COLS * ROWS;
const MIN_CLUSTER = 5;
const MAX_CASCADES = 12;

type SymbolId =
  | 'cherry'
  | 'lemon'
  | 'grape'
  | 'watermelon'
  | 'orange'
  | 'strawberry'
  | 'wild';

interface SymbolDef {
  id: SymbolId;
  name: string;
  /** payout per symbol in a cluster, multiplied by cluster size + cascade */
  pay: number;
  weight: number; // spawn likelihood
  glow: string; // accent color used for glow/halo
}

/* Payouts bumped ~30% and weights nudged so medium clusters land more often. */
const SYMBOLS: Record<SymbolId, SymbolDef> = {
  cherry: { id: 'cherry', name: 'Cherry', pay: 0.52, weight: 21, glow: '#ff4d6d' },
  lemon: { id: 'lemon', name: 'Lemon', pay: 0.66, weight: 20, glow: '#ffe14d' },
  orange: { id: 'orange', name: 'Orange', pay: 0.8, weight: 18, glow: '#ff9a3d' },
  grape: { id: 'grape', name: 'Grape', pay: 1.2, weight: 15, glow: '#b06bff' },
  strawberry: { id: 'strawberry', name: 'Strawberry', pay: 1.6, weight: 13, glow: '#ff5c7a' },
  watermelon: { id: 'watermelon', name: 'Watermelon', pay: 2.4, weight: 9, glow: '#3ddc84' },
  wild: { id: 'wild', name: 'Golden Star', pay: 6.5, weight: 4, glow: '#ffd34d' },
};

const SYMBOL_ORDER: SymbolId[] = [
  'cherry',
  'lemon',
  'orange',
  'grape',
  'strawberry',
  'watermelon',
  'wild',
];

const BET_STEPS = [0.2, 0.5, 1, 2, 5, 10, 20, 50];

/* Cascade pacing (ms) — bigger, more dramatic pauses. */
const T_HIGHLIGHT = 540;
const T_POP = 680;
const T_PAUSE_BEFORE_DROP = 200;
const T_DROP = 760;
const T_PAUSE_AFTER = 320;

/* ----------------------------------------------------------------------------
 * SVG symbols — detailed, gradient-rich, casino depth.
 * Each is rendered inside a 0..100 viewBox.
 * --------------------------------------------------------------------------*/

let GRAD_SEQ = 1;

const SymbolSVG = ({ id, size = 56 }: { id: SymbolId; size?: number }) => {
  // stable per-instance id (no Math.random in render path)
  const uid = useMemo(() => `g${GRAD_SEQ++}`, []);
  const g = (n: string) => `${id}-${n}-${uid}`;

  switch (id) {
    case 'cherry':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b1')} cx="38%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#ff7a93" />
              <stop offset="55%" stopColor="#e01e4f" />
              <stop offset="100%" stopColor="#9c0d33" />
            </radialGradient>
            <radialGradient id={g('b2')} cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#ff6b86" />
              <stop offset="55%" stopColor="#c9173f" />
              <stop offset="100%" stopColor="#7d0a28" />
            </radialGradient>
            <linearGradient id={g('stem')} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7ad36b" />
              <stop offset="100%" stopColor="#2c8a3a" />
            </linearGradient>
          </defs>
          <path d="M52 20 C40 36 28 50 30 64" stroke={`url(#${g('stem')})`} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M52 20 C66 34 74 48 72 62" stroke={`url(#${g('stem')})`} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M50 20 C58 10 74 8 84 14 C74 22 60 24 50 20Z" fill="#3aa64a" />
          <circle cx="30" cy="72" r="17" fill={`url(#${g('b1')})`} />
          <circle cx="70" cy="70" r="18" fill={`url(#${g('b2')})`} />
          <ellipse cx="25" cy="66" rx="5" ry="3.5" fill="#fff" opacity="0.6" />
          <ellipse cx="64" cy="63" rx="5.5" ry="4" fill="#fff" opacity="0.6" />
        </svg>
      );

    case 'lemon':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b')} cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor="#fff7b0" />
              <stop offset="50%" stopColor="#ffdf3d" />
              <stop offset="100%" stopColor="#e0a400" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="52" rx="34" ry="28" fill={`url(#${g('b')})`} transform="rotate(-18 50 52)" />
          <path d="M16 40 C20 34 24 33 26 36" stroke="#fff" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
          <path d="M78 46 c4 -2 7 -1 8 2 c-3 2 -6 2 -8 -2Z" fill="#caa400" />
          <ellipse cx="36" cy="40" rx="8" ry="4" fill="#fff" opacity="0.55" transform="rotate(-18 36 40)" />
        </svg>
      );

    case 'orange':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b')} cx="36%" cy="32%" r="72%">
              <stop offset="0%" stopColor="#ffd28a" />
              <stop offset="45%" stopColor="#ff9a2e" />
              <stop offset="100%" stopColor="#d35e00" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="54" r="32" fill={`url(#${g('b')})`} />
          <circle cx="50" cy="54" r="32" fill="none" stroke="#b14e00" strokeWidth="1.5" opacity="0.4" />
          <path d="M50 30 c6 -8 16 -10 22 -6 c-6 6 -14 8 -22 6Z" fill="#3aa64a" />
          <ellipse cx="38" cy="42" rx="9" ry="5" fill="#fff" opacity="0.5" />
          <circle cx="50" cy="54" r="3" fill="#c85a00" opacity="0.5" />
        </svg>
      );

    case 'grape':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b')} cx="36%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#d8a6ff" />
              <stop offset="55%" stopColor="#8b3bef" />
              <stop offset="100%" stopColor="#54199c" />
            </radialGradient>
          </defs>
          <path d="M50 18 C44 24 42 30 48 34" stroke="#8a5a2a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M48 22 c8 -8 20 -8 26 -2 c-9 4 -19 4 -26 2Z" fill="#3aa64a" />
          {[
            [38, 40], [54, 40], [46, 50], [62, 50], [34, 54],
            [42, 62], [58, 62], [50, 72], [66, 62],
          ].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="9" fill={`url(#${g('b')})`} />
              <ellipse cx={cx - 3} cy={cy - 3} rx="2.6" ry="1.8" fill="#fff" opacity="0.55" />
            </g>
          ))}
        </svg>
      );

    case 'strawberry':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b')} cx="38%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#ff8aa3" />
              <stop offset="50%" stopColor="#f02e52" />
              <stop offset="100%" stopColor="#a30e30" />
            </radialGradient>
          </defs>
          <path d="M50 86 C26 74 22 52 30 38 C40 30 60 30 70 38 C78 52 74 74 50 86Z" fill={`url(#${g('b')})`} />
          <path d="M34 28 c4 6 10 8 16 8 c6 0 12 -2 16 -8 c-2 8 -8 12 -16 12 c-8 0 -14 -4 -16 -12Z" fill="#3aa64a" />
          <path d="M50 22 c2 6 0 10 0 14 c0 -4 -2 -8 0 -14Z" fill="#2f8a3a" />
          {[[42, 48], [56, 50], [48, 60], [62, 62], [38, 62], [52, 72]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="1.8" ry="3" fill="#ffe14d" transform={`rotate(20 ${x} ${y})`} />
          ))}
        </svg>
      );

    case 'watermelon':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <linearGradient id={g('rind')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5fd06b" />
              <stop offset="100%" stopColor="#2c7a35" />
            </linearGradient>
            <linearGradient id={g('flesh')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7a8f" />
              <stop offset="100%" stopColor="#e0294a" />
            </linearGradient>
          </defs>
          <path d="M14 40 A38 38 0 0 0 86 40 Z" fill={`url(#${g('rind')})`} />
          <path d="M20 42 A32 32 0 0 0 80 42 Z" fill="#eafff0" />
          <path d="M24 44 A28 28 0 0 0 76 44 Z" fill={`url(#${g('flesh')})`} />
          {[[40, 52], [50, 58], [60, 52], [34, 60], [66, 60], [50, 46]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="1.8" ry="3" fill="#241015" transform={`rotate(15 ${x} ${y})`} />
          ))}
        </svg>
      );

    case 'wild':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={g('b')} cx="42%" cy="34%" r="70%">
              <stop offset="0%" stopColor="#fff6c2" />
              <stop offset="45%" stopColor="#ffd34d" />
              <stop offset="100%" stopColor="#c98a00" />
            </radialGradient>
            <linearGradient id={g('rim')} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff2a8" />
              <stop offset="100%" stopColor="#a86a00" />
            </linearGradient>
          </defs>
          <path
            d="M50 12 L60 38 L88 40 L66 58 L74 86 L50 70 L26 86 L34 58 L12 40 L40 38 Z"
            fill={`url(#${g('b')})`}
            stroke={`url(#${g('rim')})`}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M50 24 L56 40 L50 54 L44 40 Z" fill="#fff" opacity="0.5" />
        </svg>
      );

    default:
      return null;
  }
};

/* ----------------------------------------------------------------------------
 * Game model + helpers
 * --------------------------------------------------------------------------*/

interface Cell {
  id: number; // stable react key, regenerated on respawn
  sym: SymbolId;
  state: 'idle' | 'pop' | 'falling';
  fallDelay: number; // ms used for stagger
}

interface WinToast {
  id: number;
  amount: number;
}

let CELL_SEQ = 1;
const nextId = () => CELL_SEQ++;
let TOAST_SEQ = 1;
const nextToastId = () => TOAST_SEQ++;

const WEIGHT_TABLE: SymbolId[] = (() => {
  const t: SymbolId[] = [];
  SYMBOL_ORDER.forEach((s) => {
    for (let i = 0; i < SYMBOLS[s].weight; i++) t.push(s);
  });
  return t;
})();

const randomSym = (): SymbolId => WEIGHT_TABLE[Math.floor(Math.random() * WEIGHT_TABLE.length)];

const makeCell = (state: Cell['state'] = 'idle', fallDelay = 0): Cell => ({
  id: nextId(),
  sym: randomSym(),
  state,
  fallDelay,
});

const makeBoard = (): Cell[] => Array.from({ length: CELL_COUNT }, () => makeCell());

const idx = (r: number, c: number) => r * COLS + c;

/** flood-fill clusters of identical symbols (wild matches any neighbor group) */
const findClusters = (board: Cell[]): number[][] => {
  const visited = new Array(CELL_COUNT).fill(false);
  const clusters: number[][] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const start = idx(r, c);
      if (visited[start]) continue;
      const baseSym = board[start].sym;
      if (baseSym === 'wild') continue; // wild seeds handled by absorption below

      const stack = [start];
      const group: number[] = [];
      visited[start] = true;

      while (stack.length) {
        const cur = stack.pop()!;
        group.push(cur);
        const cr = Math.floor(cur / COLS);
        const cc = cur % COLS;
        const neighbors = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const ni = idx(nr, nc);
          if (visited[ni]) continue;
          if (board[ni].sym === baseSym || board[ni].sym === 'wild') {
            visited[ni] = true;
            stack.push(ni);
          }
        }
      }
      if (group.length >= MIN_CLUSTER) clusters.push(group);
    }
  }
  return clusters;
};

/* ----------------------------------------------------------------------------
 * Loading screen
 * --------------------------------------------------------------------------*/

const LoadingScreen = ({ progress }: { progress: number }) => {
  const orbiting: SymbolId[] = ['cherry', 'lemon', 'grape', 'watermelon', 'orange', 'strawberry'];
  return (
    <div className="fc-loader">
      <div className="fc-loader-glow" />
      <div className="fc-ring fc-ring-a" />
      <div className="fc-ring fc-ring-b" />
      <div className="fc-orbit">
        {orbiting.map((s, i) => (
          <div
            key={s}
            className="fc-orbit-item"
            style={{ transform: `rotate(${(360 / orbiting.length) * i}deg) translateY(-92px)` }}
          >
            <div style={{ transform: `rotate(${-(360 / orbiting.length) * i}deg)` }}>
              <SymbolSVG id={s} size={38} />
            </div>
          </div>
        ))}
        <div className="fc-orbit-core">
          <SymbolSVG id="wild" size={66} />
        </div>
      </div>
      <h1 className="fc-loader-title">FRUIT CASCADE</h1>
      <p className="fc-loader-sub">Premium Cluster Slots</p>
      <div className="fc-loader-bar">
        <div className="fc-loader-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="fc-loader-pct">{Math.round(progress)}%</p>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Info modal — compact bottom sheet
 * --------------------------------------------------------------------------*/

const InfoModal = ({ onClose, bet }: { onClose: () => void; bet: number }) => (
  <div className="fc-modal-overlay" onClick={onClose}>
    <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
      <div className="fc-modal-grip" />
      <div className="fc-modal-head">
        <h2>How to Play</h2>
        <button className="fc-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="fc-modal-body">
        <section>
          <h3>Basics</h3>
          <p>
            Land <b>{MIN_CLUSTER}+</b> matching fruits touching each other (up, down, left, right)
            to win.
          </p>
        </section>
        <section>
          <h3>Cascades &amp; multiplier</h3>
          <p>
            Winning fruits burst and new fruit drops in. Each new win in the same spin raises the
            multiplier <b>×1, ×2, ×3…</b>
          </p>
        </section>
        <section>
          <h3>Wild</h3>
          <p>The golden star joins any cluster and pays the most on its own.</p>
        </section>
        <section>
          <h3>Paytable</h3>
          <p className="fc-pay-note">Per fruit in a cluster at bet {bet.toFixed(2)}.</p>
          <div className="fc-pay-grid">
            {SYMBOL_ORDER.map((s) => (
              <div className="fc-pay-row" key={s}>
                <div className="fc-pay-sym">
                  <SymbolSVG id={s} size={26} />
                </div>
                <div className="fc-pay-name">{SYMBOLS[s].name}</div>
                <div className="fc-pay-val">{(SYMBOLS[s].pay * (bet / 10)).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </div>
);

/* ----------------------------------------------------------------------------
 * Big win overlay
 * --------------------------------------------------------------------------*/

type BigTier = null | 'big' | 'mega' | 'epic';

const TIER_LABEL: Record<Exclude<BigTier, null>, string> = {
  big: 'BIG WIN',
  mega: 'MEGA WIN',
  epic: 'EPIC WIN',
};

const BigWinOverlay = ({ tier, amount }: { tier: Exclude<BigTier, null>; amount: number }) => {
  const [shown, setShown] = useState(0);

  // animated count-up
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(amount * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount]);

  return (
    <div className="fc-bigwin-overlay">
      <div className="fc-bigwin-pulse" />
      <div className="fc-confetti">
        {Array.from({ length: 34 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 29) % 100}%`,
              animationDelay: `${(i % 9) * 0.1}s`,
              background: ['#ffd34d', '#ff5c7a', '#3ddc84', '#b06bff', '#3da8ff'][i % 5],
            }}
          />
        ))}
      </div>
      <div className={`fc-bigwin-text ${tier}`}>{TIER_LABEL[tier]}</div>
      <div className="fc-bigwin-amount">{shown.toFixed(2)}</div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Main game
 * --------------------------------------------------------------------------*/

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const InnerGame = () => {
  const [loading, setLoading] = useState(true);
  const [loadPct, setLoadPct] = useState(0);

  const [board, setBoard] = useState<Cell[]>(() => makeBoard());
  const [balance, setBalance] = useState(1000);
  const [betIdx, setBetIdx] = useState(2); // default 1.00
  const bet = BET_STEPS[betIdx];

  const [spinning, setSpinning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [winCells, setWinCells] = useState<Set<number>>(new Set());
  const [multiplier, setMultiplier] = useState(1);
  const [toasts, setToasts] = useState<WinToast[]>([]);
  const [displayWin, setDisplayWin] = useState(0); // smooth, persistent total
  const [boardFlash, setBoardFlash] = useState(false);
  const [bigTier, setBigTier] = useState<BigTier>(null);
  const [bigAmount, setBigAmount] = useState(0);

  const autoRef = useRef(auto);
  autoRef.current = auto;
  const spinningRef = useRef(spinning);
  spinningRef.current = spinning;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  /* mount: add global class so the casino background covers the whole page */
  useEffect(() => {
    document.body.classList.add('fruit-cascade-active');
    document.documentElement.classList.add('fruit-cascade-active');
    return () => {
      document.body.classList.remove('fruit-cascade-active');
      document.documentElement.classList.remove('fruit-cascade-active');
    };
  }, []);

  /* loading sequence */
  useEffect(() => {
    const total = 2100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / total);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setLoadPct(eased * 100);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setLoading(false), 220);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* smooth count-up for the win bar whenever displayWin target changes */
  const winTargetRef = useRef(0);
  const [winShown, setWinShown] = useState(0);
  useEffect(() => {
    winTargetRef.current = displayWin;
    let raf = 0;
    const animate = () => {
      setWinShown((prev) => {
        const target = winTargetRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) return target;
        return prev + diff * 0.18;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [displayWin]);

  const pushToast = useCallback((amount: number) => {
    const id = nextToastId();
    setToasts((t) => [...t, { id, amount }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 1150);
  }, []);

  const spin = useCallback(async () => {
    if (spinningRef.current) return;
    if (balanceRef.current < bet) {
      setAuto(false);
      return;
    }

    setSpinning(true);
    setBalance((b) => +(b - bet).toFixed(2));
    setDisplayWin(0);
    setWinShown(0);
    setBigTier(null);
    setMultiplier(1);
    setWinCells(new Set());
    setToasts([]);

    // fresh drop with staggered delays
    const fresh = Array.from({ length: CELL_COUNT }, (_, i) =>
      makeCell('falling', (i % COLS) * 36 + Math.floor(i / COLS) * 26),
    );
    setBoard(fresh);
    await sleep(T_DROP);
    setBoard((b) => b.map((c) => ({ ...c, state: 'idle' })));
    await sleep(T_PAUSE_BEFORE_DROP);

    let current = fresh.map((c) => ({ ...c, state: 'idle' as const }));
    let totalWin = 0;
    let cascade = 0;

    while (cascade < MAX_CASCADES) {
      const clusters = findClusters(current);
      if (clusters.length === 0) break;

      cascade++;
      const mult = cascade; // ×1, ×2, ×3 ...
      setMultiplier(mult);

      const winning = new Set<number>();
      let stepWin = 0;
      for (const group of clusters) {
        const baseIdx = group.find((gi) => current[gi].sym !== 'wild') ?? group[0];
        const baseSym = current[baseIdx].sym;
        const wildCount = group.filter((gi) => current[gi].sym === 'wild').length;
        // size factor a touch steeper; wilds add a bonus contribution
        const sizeFactor = 1 + (group.length - MIN_CLUSTER) * 0.42;
        const wildBonus = 1 + wildCount * 0.25;
        const clusterPay =
          SYMBOLS[baseSym].pay * sizeFactor * wildBonus * (bet / 10) * group.length;
        stepWin += clusterPay;
        group.forEach((gi) => winning.add(gi));
      }
      stepWin = +(stepWin * mult).toFixed(2);
      totalWin += stepWin;

      // highlight winners
      setWinCells(new Set(winning));
      await sleep(T_HIGHLIGHT);

      // pop / burst (+ board flash for larger cascades)
      setBoard(current.map((c, i) => (winning.has(i) ? { ...c, state: 'pop' } : c)));
      if (winning.size >= 8 || mult >= 3) {
        setBoardFlash(true);
        setTimeout(() => setBoardFlash(false), 280);
      }
      pushToast(stepWin);
      setDisplayWin((w) => +(w + stepWin).toFixed(2));
      await sleep(T_POP);
      await sleep(T_PAUSE_BEFORE_DROP);

      // collapse columns: survivors fall, new spawn on top
      const next: Cell[] = current.map((c) => ({ ...c }));
      for (let c = 0; c < COLS; c++) {
        const colCells: Cell[] = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          const i = idx(r, c);
          if (!winning.has(i)) colCells.push(current[i]);
        }
        const missing = ROWS - colCells.length;
        const rebuilt: Cell[] = [];
        for (let m = 0; m < missing; m++) {
          rebuilt.push(makeCell('falling', m * 52));
        }
        const columnTopToBottom = [...rebuilt, ...colCells.reverse()];
        for (let r = 0; r < ROWS; r++) {
          const cell = columnTopToBottom[r];
          next[idx(r, c)] = {
            ...cell,
            state: winning.has(idx(r, c)) ? 'falling' : cell.state,
          };
        }
      }
      setWinCells(new Set());
      setBoard(next);
      await sleep(T_DROP);
      setBoard((b) => b.map((c) => ({ ...c, state: 'idle' })));
      current = next.map((c) => ({ ...c, state: 'idle' as const }));
      await sleep(T_PAUSE_AFTER);
    }

    totalWin = +totalWin.toFixed(2);
    if (totalWin > 0) {
      setBalance((b) => +(b + totalWin).toFixed(2));
      setDisplayWin(totalWin); // keep total visible until next spin
      const ratio = totalWin / bet;
      let tier: BigTier = null;
      if (ratio >= 35) tier = 'epic';
      else if (ratio >= 18) tier = 'mega';
      else if (ratio >= 8) tier = 'big';

      if (tier) {
        setBigAmount(totalWin);
        setBigTier(tier);
        await sleep(tier === 'epic' ? 3000 : tier === 'mega' ? 2600 : 2200);
        setBigTier(null);
      }
    }

    setMultiplier(1);
    setSpinning(false);

    if (autoRef.current) {
      await sleep(450);
      if (autoRef.current && !spinningRef.current) {
        if (balanceRef.current < bet) {
          setAuto(false);
        } else {
          spin();
        }
      }
    }
  }, [bet, pushToast]);

  // kick off auto when toggled on while idle
  useEffect(() => {
    if (auto && !spinning) {
      spin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const changeBet = (dir: -1 | 1) => {
    setBetIdx((i) => Math.max(0, Math.min(BET_STEPS.length - 1, i + dir)));
  };

  if (loading) {
    return (
      <div className="fc-root">
        <StyleBlock />
        <div className="fc-ambient" />
        <LoadingScreen progress={loadPct} />
      </div>
    );
  }

  return (
    <div className="fc-root">
      <StyleBlock />

      {/* fixed ambient layer that fills the whole viewport */}
      <div className="fc-ambient">
        <span className="fc-orb fc-orb1" />
        <span className="fc-orb fc-orb2" />
        <span className="fc-orb fc-orb3" />
        <span className="fc-grain" />
      </div>

      {/* header */}
      <header className="fc-header">
        <div className="fc-logo">
          <span className="fc-logo-star">
            <SymbolSVG id="wild" size={26} />
          </span>
          <span className="fc-logo-text">
            FRUIT<span>CASCADE</span>
          </span>
        </div>
        <div className="fc-mult-pill" data-active={multiplier > 1}>
          ×{multiplier}
        </div>
      </header>

      {/* board */}
      <main className="fc-board-wrap">
        <div className={`fc-board-frame ${boardFlash ? 'flash' : ''}`}>
          <div className="fc-frame-glow" />
          <div className="fc-sheen" />
          <div className="fc-board" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {board.map((cell, i) => {
              const isWin = winCells.has(i);
              return (
                <div
                  key={cell.id}
                  className={[
                    'fc-cell',
                    cell.state === 'pop' ? 'pop' : '',
                    cell.state === 'falling' ? 'falling' : '',
                    isWin ? 'win' : '',
                  ].join(' ')}
                  style={{
                    animationDelay:
                      cell.state === 'falling' ? `${cell.fallDelay}ms` : undefined,
                    ['--glow' as string]: SYMBOLS[cell.sym].glow,
                  }}
                >
                  <div className="fc-cell-inner">
                    <SymbolSVG id={cell.sym} size={42} />
                  </div>
                  {isWin && (
                    <div className="fc-sparkles">
                      {Array.from({ length: 6 }).map((_, s) => (
                        <span key={s} style={{ ['--a' as string]: `${s * 60}deg` }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* floating win toasts */}
          <div className="fc-float-layer">
            {toasts.map((t) => (
              <div className="fc-float-win" key={t.id}>
                +{t.amount.toFixed(2)}
              </div>
            ))}
          </div>
        </div>

        {/* win bar */}
        <div className="fc-winbar" data-on={winShown > 0.01}>
          <span className="fc-winbar-label">WIN</span>
          <span className="fc-winbar-amount">{winShown.toFixed(2)}</span>
        </div>
      </main>

      {/* controls */}
      <footer className="fc-controls">
        <div className="fc-stat-row">
          <div className="fc-stat">
            <span className="fc-stat-label">Balance</span>
            <span className="fc-stat-value">{balance.toFixed(2)}</span>
          </div>
          <button className="fc-info-btn" onClick={() => setShowInfo(true)} aria-label="Game info">
            i
          </button>
          <div className="fc-stat fc-stat-right">
            <span className="fc-stat-label">Bet</span>
            <span className="fc-stat-value">{bet.toFixed(2)}</span>
          </div>
        </div>

        <div className="fc-action-row">
          <div className="fc-bet-ctrl">
            <button
              className="fc-bet-btn"
              disabled={spinning || betIdx === 0}
              onClick={() => changeBet(-1)}
              aria-label="Decrease bet"
            >
              −
            </button>
            <span className="fc-bet-display">{bet.toFixed(2)}</span>
            <button
              className="fc-bet-btn"
              disabled={spinning || betIdx === BET_STEPS.length - 1}
              onClick={() => changeBet(1)}
              aria-label="Increase bet"
            >
              +
            </button>
          </div>

          <button
            className={`fc-spin ${spinning ? 'spinning' : ''}`}
            disabled={spinning || balance < bet}
            onClick={() => spin()}
            aria-label="Spin"
          >
            <span className="fc-spin-ring" />
            <span className="fc-spin-glow" />
            <span className="fc-spin-core">
              {spinning ? (
                <span className="fc-spin-loader" />
              ) : (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4V2L8 5l4 3V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" fill="#1a1024" />
                </svg>
              )}
            </span>
          </button>

          <button
            className={`fc-auto ${auto ? 'on' : ''}`}
            disabled={spinning && !auto}
            onClick={() => setAuto((a) => !a)}
            aria-label="Auto spin"
          >
            <span className="fc-auto-dot" />
            AUTO
          </button>
        </div>
      </footer>

      {bigTier && <BigWinOverlay tier={bigTier} amount={bigAmount} />}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} bet={bet} />}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Styles (single block, no external CSS)
 * --------------------------------------------------------------------------*/

const StyleBlock = () => (
  <style>{`
  /* ---- global page take-over while game is mounted ---- */
  html.fruit-cascade-active,
  body.fruit-cascade-active,
  body.fruit-cascade-active #root{
    background:#0b0716 !important;
  }
  body.fruit-cascade-active{
    background:
      radial-gradient(120% 70% at 50% -5%, #2a1448 0%, rgba(42,20,72,0) 55%),
      radial-gradient(100% 50% at 50% 105%, #1a0e30 0%, rgba(26,14,48,0) 60%),
      linear-gradient(180deg,#0b0716 0%,#120a26 50%,#0a0614 100%) !important;
    background-attachment:fixed !important;
  }
  /* neutralize any app header strip so the scene reads as one */
  body.fruit-cascade-active header,
  body.fruit-cascade-active [class*="header"],
  body.fruit-cascade-active [class*="Header"]{
    background:transparent !important;
    box-shadow:none !important;
    border-color:transparent !important;
  }

  .fc-root{
    position:relative;
    width:100%;
    max-width:480px;
    margin:0 auto;
    min-height:100%;
    display:flex;
    flex-direction:column;
    padding:10px 12px calc(18px + env(safe-area-inset-bottom,0px));
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    color:#f4eefe;
    box-sizing:border-box;
    user-select:none;
    -webkit-tap-highlight-color:transparent;
    z-index:0;
  }
  .fc-root *{box-sizing:border-box;}

  /* fixed ambient layer fills the entire viewport (behind header too) */
  .fc-ambient{
    position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;
    background:
      radial-gradient(120% 70% at 50% -5%, #2a1448 0%, rgba(42,20,72,0) 55%),
      radial-gradient(100% 50% at 50% 105%, #1a0e30 0%, rgba(26,14,48,0) 60%),
      linear-gradient(180deg,#0b0716 0%,#120a26 50%,#0a0614 100%);
  }
  .fc-orb{position:absolute;border-radius:50%;filter:blur(46px);opacity:.5;}
  .fc-orb1{width:220px;height:220px;background:#7a2bff;top:-40px;left:-60px;animation:fcFloat 9s ease-in-out infinite;}
  .fc-orb2{width:200px;height:200px;background:#ff7a1a;bottom:80px;right:-60px;animation:fcFloat 11s ease-in-out infinite reverse;}
  .fc-orb3{width:180px;height:180px;background:#1f7bff;top:42%;left:28%;opacity:.28;animation:fcFloat 13s ease-in-out infinite;}
  .fc-grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;
    background-image:radial-gradient(rgba(255,255,255,.6) .5px,transparent .5px);background-size:3px 3px;}
  @keyframes fcFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(16px,-22px)}}

  /* header */
  .fc-header{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
  .fc-logo{display:flex;align-items:center;gap:8px;}
  .fc-logo-star{filter:drop-shadow(0 0 6px #ffd34d);animation:fcSpinSlow 6s linear infinite;}
  @keyframes fcSpinSlow{to{transform:rotate(360deg)}}
  .fc-logo-text{font-weight:800;font-size:20px;letter-spacing:1px;
    background:linear-gradient(90deg,#ffe9a8,#ffb347,#ffe9a8);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
  .fc-logo-text span{color:#c9a0ff;-webkit-text-fill-color:#c9a0ff;margin-left:2px;font-weight:700;}
  .fc-mult-pill{font-weight:800;font-size:15px;padding:5px 12px;border-radius:14px;
    color:#bfa6ff;border:1px solid rgba(170,130,255,.35);
    background:rgba(60,30,110,.4);transition:.25s;}
  .fc-mult-pill[data-active="true"]{color:#1a1024;
    background:linear-gradient(90deg,#ffd34d,#ff9a3d);
    border-color:#ffd34d;box-shadow:0 0 16px rgba(255,180,60,.7);transform:scale(1.06);}

  /* board frame */
  .fc-board-wrap{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center;}
  .fc-board-frame{
    position:relative;border-radius:24px;padding:13px;
    background:
      linear-gradient(180deg,rgba(46,26,82,.72),rgba(18,10,34,.85));
    border:1px solid rgba(255,210,120,.32);
    box-shadow:
      0 0 0 2px rgba(255,200,90,.2),
      0 10px 40px rgba(120,40,200,.45),
      inset 0 0 30px rgba(0,0,0,.55);
    overflow:hidden;
    transition:box-shadow .25s;
  }
  .fc-board-frame.flash{box-shadow:
      0 0 0 2px rgba(255,235,160,.9),
      0 0 50px rgba(255,200,90,.7),
      inset 0 0 60px rgba(255,210,120,.35);}
  .fc-board-frame::before{
    content:'';position:absolute;inset:4px;border-radius:19px;
    border:1px solid rgba(255,210,120,.24);pointer-events:none;z-index:4;
  }
  /* animated gold corner highlights */
  .fc-frame-glow{position:absolute;inset:-1px;border-radius:24px;pointer-events:none;z-index:1;
    background:conic-gradient(from 0deg,transparent 0deg,rgba(255,210,120,.5) 40deg,transparent 80deg,
      transparent 180deg,rgba(170,130,255,.4) 220deg,transparent 260deg,transparent 360deg);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;padding:1.5px;opacity:.8;
    animation:fcSpinSlow 8s linear infinite;}
  .fc-sheen{
    position:absolute;top:0;left:-60%;width:50%;height:100%;
    background:linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent);
    transform:skewX(-18deg);animation:fcSheen 5.5s ease-in-out infinite;pointer-events:none;z-index:3;
  }
  @keyframes fcSheen{0%{left:-60%}45%{left:160%}100%{left:160%}}

  .fc-board{display:grid;gap:5px;position:relative;z-index:2;}
  .fc-cell{
    position:relative;aspect-ratio:1;border-radius:13px;
    display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 35% 28%,rgba(84,58,138,.6),rgba(22,13,40,.88));
    border:1px solid rgba(150,110,220,.22);
    box-shadow:inset 0 1px 2px rgba(255,255,255,.08),inset 0 -3px 8px rgba(0,0,0,.5);
    overflow:visible;
  }
  .fc-cell-inner{display:flex;align-items:center;justify-content:center;width:100%;height:100%;
    filter:drop-shadow(0 3px 5px rgba(0,0,0,.55));transition:transform .2s;}
  .fc-cell.falling .fc-cell-inner{animation:fcDrop .76s cubic-bezier(.3,1.4,.45,1) backwards;}
  @keyframes fcDrop{
    0%{transform:translateY(-220%) scale(.7);opacity:0;}
    55%{opacity:1;}
    72%{transform:translateY(12%) scale(1.05);}
    85%{transform:translateY(-4%) scale(.99);}
    100%{transform:translateY(0) scale(1);}
  }
  .fc-cell.win{
    border-color:var(--glow);
    box-shadow:0 0 18px var(--glow),inset 0 0 16px color-mix(in srgb,var(--glow) 45%,transparent);
    animation:fcWinPulse .5s ease-in-out infinite alternate;
    z-index:3;
  }
  @keyframes fcWinPulse{from{filter:brightness(1)}to{filter:brightness(1.45)}}
  .fc-cell.win .fc-cell-inner{animation:fcWinBob .55s ease-in-out infinite alternate;}
  @keyframes fcWinBob{from{transform:scale(1)}to{transform:scale(1.14)}}

  /* premium pop / burst */
  .fc-cell.pop{z-index:5;}
  .fc-cell.pop .fc-cell-inner{animation:fcPop .68s cubic-bezier(.5,.1,.3,1) forwards;}
  .fc-cell.pop::after{
    content:'';position:absolute;inset:-4px;border-radius:50%;
    border:3px solid var(--glow);
    box-shadow:0 0 18px var(--glow);
    animation:fcRing .68s ease-out forwards;
  }
  .fc-cell.pop::before{
    content:'';position:absolute;inset:0;border-radius:13px;
    background:radial-gradient(circle,var(--glow),transparent 68%);
    animation:fcBurst .68s ease-out forwards;z-index:-1;
  }
  @keyframes fcPop{
    0%{transform:scale(1)}
    25%{transform:scale(1.32) rotate(6deg);filter:brightness(1.6)}
    100%{transform:scale(0) rotate(48deg);opacity:0;}
  }
  @keyframes fcBurst{0%{opacity:.95;transform:scale(.35)}100%{opacity:0;transform:scale(1.7)}}
  @keyframes fcRing{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(1.8)}}

  /* sparkle particles around winning cells */
  .fc-sparkles{position:absolute;inset:0;pointer-events:none;z-index:6;}
  .fc-sparkles span{position:absolute;top:50%;left:50%;width:5px;height:5px;border-radius:50%;
    background:radial-gradient(circle,#fff,var(--glow));
    box-shadow:0 0 6px var(--glow);
    transform:translate(-50%,-50%) rotate(var(--a)) translateY(-4px);
    animation:fcSpark 1s ease-out infinite;}
  @keyframes fcSpark{
    0%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a)) translateY(-2px) scale(.4);}
    40%{opacity:1;}
    100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a)) translateY(-20px) scale(1);}
  }

  /* floating wins */
  .fc-float-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:7;}
  .fc-float-win{position:absolute;font-weight:900;font-size:30px;
    color:#fff;text-shadow:0 0 14px #ffd34d,0 2px 4px rgba(0,0,0,.6);
    background:linear-gradient(90deg,#fff2b0,#ffce4d);-webkit-background-clip:text;background-clip:text;
    animation:fcFloatUp 1.15s ease-out forwards;}
  @keyframes fcFloatUp{
    0%{transform:translateY(20px) scale(.5);opacity:0;}
    22%{transform:translateY(0) scale(1.15);opacity:1;}
    70%{opacity:1;}
    100%{transform:translateY(-72px) scale(1);opacity:0;}
  }

  /* win bar */
  .fc-winbar{margin-top:12px;display:flex;align-items:center;justify-content:center;gap:10px;
    padding:8px 16px;border-radius:14px;min-height:44px;
    background:linear-gradient(180deg,rgba(42,26,74,.62),rgba(20,12,38,.62));
    border:1px solid rgba(150,110,220,.2);transition:border-color .3s,box-shadow .3s;}
  .fc-winbar[data-on="true"]{border-color:rgba(255,200,90,.55);box-shadow:0 0 20px rgba(255,180,60,.4);}
  .fc-winbar-label{font-size:12px;letter-spacing:2px;color:#a98fe0;font-weight:700;}
  .fc-winbar-amount{font-size:23px;font-weight:900;
    background:linear-gradient(90deg,#ffe9a8,#ffb347);-webkit-background-clip:text;background-clip:text;color:transparent;}

  /* controls */
  .fc-controls{position:relative;z-index:2;margin-top:12px;}
  .fc-stat-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
  .fc-stat{display:flex;flex-direction:column;flex:1;padding:8px 14px;border-radius:14px;
    background:linear-gradient(180deg,rgba(42,26,74,.58),rgba(20,12,38,.68));
    border:1px solid rgba(150,110,220,.2);}
  .fc-stat-right{align-items:flex-end;}
  .fc-stat-label{font-size:10px;letter-spacing:1.5px;color:#9a82d0;font-weight:600;text-transform:uppercase;}
  .fc-stat-value{font-size:18px;font-weight:800;color:#fff;}
  .fc-info-btn{flex:0 0 auto;width:38px;height:38px;border-radius:50%;font-style:italic;font-weight:800;font-size:18px;
    color:#1a1024;cursor:pointer;border:none;
    background:linear-gradient(180deg,#ffe9a8,#ffb347);
    box-shadow:0 0 12px rgba(255,180,60,.5);transition:transform .12s;}
  .fc-info-btn:active{transform:scale(.9);}

  .fc-action-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}

  .fc-bet-ctrl{display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-start;}
  .fc-bet-btn{width:42px;height:42px;border-radius:12px;font-size:24px;font-weight:800;line-height:1;
    color:#ffd9a0;cursor:pointer;
    background:linear-gradient(180deg,rgba(62,38,104,.82),rgba(30,18,52,.92));
    border:1px solid rgba(255,200,100,.3);transition:transform .1s,opacity .2s;}
  .fc-bet-btn:active:not(:disabled){transform:scale(.88);}
  .fc-bet-btn:disabled{opacity:.35;cursor:default;}
  .fc-bet-display{min-width:54px;text-align:center;font-weight:800;font-size:15px;color:#fff;}

  .fc-spin{position:relative;width:86px;height:86px;border-radius:50%;border:none;cursor:pointer;
    background:transparent;flex:0 0 auto;}
  .fc-spin:disabled{cursor:default;}
  .fc-spin-glow{position:absolute;inset:-8px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,180,60,.5),transparent 70%);
    animation:fcPulse 2s ease-in-out infinite;}
  .fc-spin-ring{position:absolute;inset:0;border-radius:50%;
    background:conic-gradient(from 0deg,#ffd34d,#ff7a1a,#ff4d6d,#b06bff,#3da8ff,#ffd34d);
    animation:fcSpinSlow 4s linear infinite;
    box-shadow:0 0 24px rgba(255,170,60,.7);}
  .fc-spin-core{position:absolute;inset:5px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(circle at 38% 30%,#ffe9a8,#ffb347 55%,#e07e10);
    box-shadow:inset 0 2px 6px rgba(255,255,255,.6),inset 0 -4px 10px rgba(120,50,0,.6);
    transition:transform .12s;}
  .fc-spin:not(:disabled):active .fc-spin-core{transform:scale(.9);}
  .fc-spin.spinning .fc-spin-ring{animation-duration:.8s;}
  .fc-spin:disabled .fc-spin-glow{opacity:.3;}
  .fc-spin-loader{width:24px;height:24px;border-radius:50%;border:3px solid rgba(26,16,36,.3);
    border-top-color:#1a1024;animation:fcSpinSlow .7s linear infinite;}

  .fc-auto{display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:center;
    width:64px;height:58px;border-radius:16px;font-size:11px;font-weight:800;letter-spacing:1px;cursor:pointer;
    color:#bfa6ff;flex:0 0 auto;
    background:linear-gradient(180deg,rgba(52,32,92,.72),rgba(26,16,44,.88));
    border:1px solid rgba(150,110,220,.3);transition:.2s;}
  .fc-auto-dot{width:9px;height:9px;border-radius:50%;background:#6a5a9a;transition:.2s;}
  .fc-auto:active:not(:disabled){transform:scale(.92);}
  .fc-auto:disabled{opacity:.4;cursor:default;}
  .fc-auto.on{color:#1a1024;background:linear-gradient(180deg,#9fffc4,#3ddc84);
    border-color:#3ddc84;box-shadow:0 0 16px rgba(60,220,130,.6);}
  .fc-auto.on .fc-auto-dot{background:#1a1024;box-shadow:0 0 6px #fff;animation:fcBlink 1s infinite;}
  @keyframes fcBlink{50%{opacity:.3}}

  /* loader */
  .fc-loader{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .fc-loader-glow{position:absolute;width:300px;height:300px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,180,60,.25),transparent 65%);animation:fcPulse 2.4s ease-in-out infinite;}
  @keyframes fcPulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.15);opacity:1}}
  .fc-ring{position:absolute;border-radius:50%;}
  .fc-ring-a{width:240px;height:240px;border:2px solid rgba(255,200,90,.25);border-top-color:#ffd34d;animation:fcSpinSlow 2.4s linear infinite;}
  .fc-ring-b{width:200px;height:200px;border:2px solid rgba(170,130,255,.2);border-bottom-color:#b06bff;animation:fcSpinSlow 1.8s linear infinite reverse;}
  .fc-orbit{position:relative;width:200px;height:200px;display:flex;align-items:center;justify-content:center;margin-bottom:24px;animation:fcSpinSlow 14s linear infinite;}
  .fc-orbit-item{position:absolute;filter:drop-shadow(0 0 8px rgba(255,255,255,.3));}
  .fc-orbit-core{filter:drop-shadow(0 0 14px #ffd34d);animation:fcPulse 1.8s ease-in-out infinite;}
  .fc-loader-title{font-size:30px;font-weight:900;letter-spacing:3px;margin:0;
    background:linear-gradient(90deg,#ffe9a8,#ffb347,#ffe9a8);-webkit-background-clip:text;background-clip:text;color:transparent;
    text-shadow:0 0 30px rgba(255,180,60,.3);animation:fcGlow 2s ease-in-out infinite;}
  @keyframes fcGlow{50%{filter:brightness(1.25)}}
  .fc-loader-sub{margin:6px 0 26px;font-size:12px;letter-spacing:4px;color:#a98fe0;text-transform:uppercase;}
  .fc-loader-bar{width:220px;height:8px;border-radius:8px;overflow:hidden;
    background:rgba(60,36,100,.5);border:1px solid rgba(255,200,90,.25);}
  .fc-loader-fill{height:100%;border-radius:8px;
    background:linear-gradient(90deg,#ffd34d,#ff7a1a,#ff4d6d);
    box-shadow:0 0 14px rgba(255,170,60,.8);transition:width .1s;}
  .fc-loader-pct{margin-top:10px;font-size:13px;font-weight:700;color:#ffd9a0;}

  /* big win */
  .fc-bigwin-overlay{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(circle at 50% 45%,rgba(40,18,70,.86),rgba(8,4,16,.96));animation:fcFade .3s ease;}
  @keyframes fcFade{from{opacity:0}to{opacity:1}}
  .fc-bigwin-pulse{position:absolute;width:320px;height:320px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,190,70,.35),transparent 65%);
    animation:fcBigPulse 1.4s ease-in-out infinite;}
  @keyframes fcBigPulse{0%,100%{transform:scale(.85);opacity:.6}50%{transform:scale(1.25);opacity:1}}
  .fc-bigwin-text{position:relative;font-size:46px;font-weight:900;letter-spacing:2px;
    background:linear-gradient(90deg,#ffe9a8,#ffb347,#ff4d6d);-webkit-background-clip:text;background-clip:text;color:transparent;
    text-shadow:0 0 40px rgba(255,180,60,.6);animation:fcBigPop .6s cubic-bezier(.34,1.56,.6,1);}
  .fc-bigwin-text.mega{font-size:52px;background:linear-gradient(90deg,#9fffc4,#ffd34d,#ff5c7a,#b06bff);
    -webkit-background-clip:text;background-clip:text;}
  .fc-bigwin-text.epic{font-size:56px;background:linear-gradient(90deg,#3da8ff,#b06bff,#ffd34d,#ff5c7a,#3ddc84);
    -webkit-background-clip:text;background-clip:text;animation:fcBigPop .6s cubic-bezier(.34,1.56,.6,1),fcGlow 1.4s ease-in-out infinite;}
  @keyframes fcBigPop{0%{transform:scale(0) rotate(-12deg);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
  .fc-bigwin-amount{position:relative;margin-top:14px;font-size:42px;font-weight:900;color:#fff;text-shadow:0 0 24px #ffd34d;
    animation:fcCountIn .5s ease .2s backwards;}
  @keyframes fcCountIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
  .fc-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
  .fc-confetti span{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;
    animation:fcConfetti 2.6s linear infinite;}
  @keyframes fcConfetti{0%{transform:translateY(-12px) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(560deg);opacity:0}}

  /* modal — compact bottom sheet */
  .fc-modal-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;
    background:rgba(6,3,14,.72);backdrop-filter:blur(4px);animation:fcFade .25s ease;}
  .fc-modal{width:100%;max-width:480px;max-height:min(78vh,620px);border-radius:22px 22px 0 0;overflow:hidden;
    display:flex;flex-direction:column;
    background:linear-gradient(180deg,#1c1130,#120a22);
    border:1px solid rgba(255,200,90,.3);border-bottom:none;
    box-shadow:0 -8px 40px rgba(120,40,200,.4);animation:fcSlideUp .32s cubic-bezier(.2,.8,.3,1);}
  @keyframes fcSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  .fc-modal-grip{width:40px;height:4px;border-radius:4px;background:rgba(180,150,240,.4);margin:8px auto 0;}
  .fc-modal-head{display:flex;align-items:center;justify-content:space-between;padding:8px 18px 10px;
    border-bottom:1px solid rgba(150,110,220,.2);}
  .fc-modal-head h2{margin:0;font-size:17px;font-weight:900;
    background:linear-gradient(90deg,#ffe9a8,#ffb347);-webkit-background-clip:text;background-clip:text;color:transparent;}
  .fc-modal-close{width:30px;height:30px;border-radius:50%;border:1px solid rgba(150,110,220,.3);
    background:rgba(60,36,100,.5);color:#cbb6f0;font-size:13px;cursor:pointer;transition:transform .1s;}
  .fc-modal-close:active{transform:scale(.9);}
  .fc-modal-body{padding:4px 18px 22px;overflow-y:auto;-webkit-overflow-scrolling:touch;}
  .fc-modal-body section{margin-top:12px;}
  .fc-modal-body h3{margin:0 0 3px;font-size:12.5px;font-weight:800;color:#ffd9a0;letter-spacing:.4px;}
  .fc-modal-body p{margin:0;font-size:12.5px;line-height:1.45;color:#c9bce8;}
  .fc-modal-body b{color:#fff;}
  .fc-pay-note{margin-bottom:7px!important;font-size:11px!important;color:#9a82d0!important;}
  .fc-pay-grid{display:flex;flex-direction:column;gap:5px;}
  .fc-pay-row{display:flex;align-items:center;gap:10px;padding:5px 10px;border-radius:11px;
    background:linear-gradient(180deg,rgba(52,32,92,.42),rgba(24,14,42,.6));
    border:1px solid rgba(150,110,220,.16);}
  .fc-pay-sym{flex:0 0 auto;width:26px;height:26px;display:flex;align-items:center;justify-content:center;
    filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));}
  .fc-pay-name{flex:1;font-size:12.5px;font-weight:700;color:#f0e8ff;}
  .fc-pay-val{font-size:13px;font-weight:900;
    background:linear-gradient(90deg,#ffe9a8,#ffb347);-webkit-background-clip:text;background-clip:text;color:transparent;}

  @media (prefers-reduced-motion: reduce){
    .fc-sheen,.fc-orb,.fc-logo-star,.fc-spin-ring,.fc-spin-glow,.fc-confetti span,
    .fc-orbit,.fc-frame-glow,.fc-sparkles span,.fc-bigwin-pulse{animation:none!important;}
  }
  `}</style>
);

export const FruitCascadeSoloGame = () => {
  return <InnerGame />;
};