import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/* ============================================================================
 * Fruit Cascade — cascade slot for Telegram/mobile.
 * Single-file component: no external css, no deps.
 * ========================================================================== */

const COLS = 6;
const ROWS = 5;
const CELL_COUNT = COLS * ROWS;
const MIN_CLUSTER = 5;
const MAX_CASCADES = 10;

const DROP_MS = 520;
const HIGHLIGHT_MS = 230;
const POP_MS = 220;
const AFTER_DROP_MS = 95;

type SymbolId = 'cherry' | 'lemon' | 'orange' | 'grape' | 'strawberry' | 'watermelon' | 'wild';
type CellPhase = 'idle' | 'drop' | 'win' | 'pop';
type BigTier = null | 'big' | 'mega' | 'epic';

interface SymbolDef {
  id: SymbolId;
  name: string;
  pay: number;
  weight: number;
  glow: string;
}

interface Cell {
  id: number;
  sym: SymbolId;
  phase: CellPhase;
  delay: number;
  drop: number;
  rot: number;
}

interface WinToast {
  id: number;
  value: number;
  x: number;
  y: number;
}

type TelegramHaptics = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = {
  HapticFeedback?: TelegramHaptics;
};

type BrowserWithAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    Telegram?: { WebApp?: TelegramWebApp };
  };

const SYMBOLS: Record<SymbolId, SymbolDef> = {
  cherry: { id: 'cherry', name: 'Cherry', pay: 0.55, weight: 22, glow: '#ff4d6d' },
  lemon: { id: 'lemon', name: 'Lemon', pay: 0.68, weight: 20, glow: '#ffe14d' },
  orange: { id: 'orange', name: 'Orange', pay: 0.82, weight: 18, glow: '#ff9a3d' },
  grape: { id: 'grape', name: 'Grape', pay: 1.25, weight: 15, glow: '#b06bff' },
  strawberry: { id: 'strawberry', name: 'Strawberry', pay: 1.65, weight: 13, glow: '#ff5c7a' },
  watermelon: { id: 'watermelon', name: 'Watermelon', pay: 2.45, weight: 9, glow: '#3ddc84' },
  wild: { id: 'wild', name: 'Wild Star', pay: 6.8, weight: 3, glow: '#ffd34d' },
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

const WEIGHT_TABLE: SymbolId[] = SYMBOL_ORDER.flatMap((sym) =>
  Array.from({ length: SYMBOLS[sym].weight }, () => sym),
);

let cellSeq = 1;
let toastSeq = 1;
let gradientSeq = 1;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const randomSym = () => WEIGHT_TABLE[Math.floor(Math.random() * WEIGHT_TABLE.length)];
const boardIndex = (row: number, col: number) => row * COLS + col;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

const getTelegramHaptics = () =>
  (window as BrowserWithAudio).Telegram?.WebApp?.HapticFeedback;

const makeCell = (phase: CellPhase = 'idle', delay = 0, drop = 0): Cell => ({
  id: cellSeq++,
  sym: randomSym(),
  phase,
  delay,
  drop,
  rot: Math.round((Math.random() - 0.5) * 10),
});

const makeBoard = (phase: CellPhase = 'idle'): Cell[] =>
  Array.from({ length: CELL_COUNT }, (_, index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return makeCell(phase, col * 18 + row * 24, phase === 'drop' ? row + 2 : 0);
  });

const injectStarterCluster = (board: Cell[], chance = 0.42) => {
  if (Math.random() > chance) return board;

  const next = board.map((cell) => ({ ...cell }));
  const symPool: SymbolId[] = ['cherry', 'lemon', 'orange', 'grape', 'strawberry'];
  const sym = symPool[Math.floor(Math.random() * symPool.length)];
  const startRow = Math.floor(Math.random() * (ROWS - 1));
  const startCol = Math.floor(Math.random() * (COLS - 2));

  const shape = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [Math.random() > 0.5 ? 0 : 1, 2],
  ];

  shape.forEach(([dr, dc]) => {
    const index = boardIndex(startRow + dr, startCol + dc);
    next[index] = { ...next[index], sym };
  });

  return next;
};

const findClusters = (board: Cell[]) => {
  const result: number[][] = [];
  const usedKeys = new Set<string>();

  SYMBOL_ORDER.filter((sym) => sym !== 'wild').forEach((targetSym) => {
    const visited = new Array<boolean>(CELL_COUNT).fill(false);

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const start = boardIndex(row, col);

        if (visited[start]) continue;
        if (board[start].sym !== targetSym && board[start].sym !== 'wild') continue;

        const stack = [start];
        const group: number[] = [];

        visited[start] = true;

        while (stack.length > 0) {
          const current = stack.pop()!;
          group.push(current);

          const currentRow = Math.floor(current / COLS);
          const currentCol = current % COLS;

          const neighbors = [
            [currentRow - 1, currentCol],
            [currentRow + 1, currentCol],
            [currentRow, currentCol - 1],
            [currentRow, currentCol + 1],
          ];

          neighbors.forEach(([nextRow, nextCol]) => {
            if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) return;

            const nextIndex = boardIndex(nextRow, nextCol);

            if (visited[nextIndex]) return;
            if (board[nextIndex].sym !== targetSym && board[nextIndex].sym !== 'wild') return;

            visited[nextIndex] = true;
            stack.push(nextIndex);
          });
        }

        const realSymbols = group.filter((index) => board[index].sym === targetSym).length;

        if (group.length >= MIN_CLUSTER && realSymbols > 0) {
          const key = [...group].sort((a, b) => a - b).join('-');

          if (!usedKeys.has(key)) {
            usedKeys.add(key);
            result.push(group);
          }
        }
      }
    }
  });

  return result;
};

const SymbolSVG = memo(({ id, size = 48 }: { id: SymbolId; size?: number }) => {
  const uid = useMemo(() => `fcg-${gradientSeq++}`, []);
  const gid = (name: string) => `${uid}-${id}-${name}`;

  switch (id) {
    case 'cherry':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="35%" cy="30%" r="70%">
              <stop stopColor="#ff8fa3" />
              <stop offset="0.55" stopColor="#ec2853" />
              <stop offset="1" stopColor="#8e0a2c" />
            </radialGradient>
            <linearGradient id={gid('s')} x1="0" x2="1" y1="0" y2="1">
              <stop stopColor="#85ef72" />
              <stop offset="1" stopColor="#1f8b38" />
            </linearGradient>
          </defs>

          <path
            d="M48 20C37 34 31 48 31 62M49 20C64 32 70 46 68 62"
            fill="none"
            stroke={`url(#${gid('s')})`}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M49 20c8-11 24-11 34-4-9 7-24 9-34 4Z" fill="#40b852" />
          <circle cx="30" cy="70" r="18" fill={`url(#${gid('a')})`} />
          <circle cx="68" cy="70" r="19" fill={`url(#${gid('a')})`} />
          <ellipse cx="25" cy="63" rx="5" ry="3" fill="#fff" opacity="0.64" />
          <ellipse cx="62" cy="62" rx="5" ry="3" fill="#fff" opacity="0.58" />
        </svg>
      );

    case 'lemon':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="35%" cy="30%" r="75%">
              <stop stopColor="#fff9b7" />
              <stop offset="0.55" stopColor="#ffe241" />
              <stop offset="1" stopColor="#d99d00" />
            </radialGradient>
          </defs>

          <ellipse
            cx="50"
            cy="52"
            rx="35"
            ry="27"
            transform="rotate(-18 50 52)"
            fill={`url(#${gid('a')})`}
          />
          <ellipse
            cx="37"
            cy="42"
            rx="8"
            ry="4"
            transform="rotate(-18 37 42)"
            fill="#fff"
            opacity="0.55"
          />
          <path d="M79 45c4-2 7-1 9 2-4 3-7 3-9-2Z" fill="#b98200" opacity="0.55" />
        </svg>
      );

    case 'orange':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="35%" cy="30%" r="75%">
              <stop stopColor="#ffd08a" />
              <stop offset="0.52" stopColor="#ff952c" />
              <stop offset="1" stopColor="#cf5b00" />
            </radialGradient>
          </defs>

          <circle cx="50" cy="55" r="33" fill={`url(#${gid('a')})`} />
          <path d="M49 28c8-9 18-9 25-4-7 6-17 7-25 4Z" fill="#45b950" />
          <ellipse cx="38" cy="43" rx="8" ry="5" fill="#fff" opacity="0.5" />
          <circle cx="50" cy="55" r="3" fill="#b54d00" opacity="0.35" />
        </svg>
      );

    case 'grape':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="35%" cy="30%" r="75%">
              <stop stopColor="#dca9ff" />
              <stop offset="0.56" stopColor="#8b3cf2" />
              <stop offset="1" stopColor="#51169c" />
            </radialGradient>
          </defs>

          <path
            d="M50 18c-6 7-5 13 0 18"
            fill="none"
            stroke="#8a5a2a"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M48 22c9-8 20-8 27-2-9 4-19 4-27 2Z" fill="#40b852" />

          {[
            [38, 41],
            [54, 41],
            [46, 52],
            [62, 52],
            [34, 56],
            [42, 66],
            [58, 66],
            [50, 76],
          ].map(([cx, cy], index) => (
            <g key={index}>
              <circle cx={cx} cy={cy} r="10" fill={`url(#${gid('a')})`} />
              <ellipse cx={cx - 3} cy={cy - 3} rx="2.5" ry="1.7" fill="#fff" opacity="0.56" />
            </g>
          ))}
        </svg>
      );

    case 'strawberry':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="36%" cy="32%" r="76%">
              <stop stopColor="#ff91a8" />
              <stop offset="0.54" stopColor="#ef2e52" />
              <stop offset="1" stopColor="#990b2b" />
            </radialGradient>
          </defs>

          <path
            d="M50 87C27 75 22 53 30 39c10-10 30-10 40 0 8 14 3 36-20 48Z"
            fill={`url(#${gid('a')})`}
          />
          <path
            d="M34 30c5 5 11 7 16 7s11-2 16-7c-2 8-8 12-16 12s-14-4-16-12Z"
            fill="#40b852"
          />

          {[
            [42, 50],
            [57, 51],
            [49, 61],
            [63, 64],
            [37, 64],
            [52, 74],
          ].map(([x, y], index) => (
            <ellipse
              key={index}
              cx={x}
              cy={y}
              rx="1.8"
              ry="3"
              fill="#ffe66d"
              transform={`rotate(20 ${x} ${y})`}
            />
          ))}
        </svg>
      );

    case 'watermelon':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={gid('a')} x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#69df72" />
              <stop offset="1" stopColor="#227c33" />
            </linearGradient>
            <linearGradient id={gid('b')} x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#ff7e93" />
              <stop offset="1" stopColor="#e32949" />
            </linearGradient>
          </defs>

          <path d="M14 40a38 38 0 0 0 72 0Z" fill={`url(#${gid('a')})`} />
          <path d="M20 42a32 32 0 0 0 60 0Z" fill="#eafff0" />
          <path d="M24 44a28 28 0 0 0 52 0Z" fill={`url(#${gid('b')})`} />

          {[
            [40, 53],
            [50, 59],
            [60, 53],
            [35, 61],
            [65, 61],
            [50, 48],
          ].map(([x, y], index) => (
            <ellipse
              key={index}
              cx={x}
              cy={y}
              rx="1.8"
              ry="3"
              fill="#211017"
              transform={`rotate(15 ${x} ${y})`}
            />
          ))}
        </svg>
      );

    case 'wild':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id={gid('a')} cx="38%" cy="30%" r="72%">
              <stop stopColor="#fff7be" />
              <stop offset="0.48" stopColor="#ffd24d" />
              <stop offset="1" stopColor="#bf7600" />
            </radialGradient>
          </defs>

          <path
            d="M50 10l10 28 30 2-23 19 8 29-25-17-25 17 8-29-23-19 30-2Z"
            fill={`url(#${gid('a')})`}
            stroke="#fff0a0"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M50 23l6 17-6 17-6-17Z" fill="#fff" opacity="0.5" />
        </svg>
      );

    default:
      return null;
  }
});

SymbolSVG.displayName = 'SymbolSVG';

const LoadingScreen = ({ progress }: { progress: number }) => (
  <div className="fc-loading-screen">
    <div className="fc-load-halo" />
    <div className="fc-load-ring fc-load-ring-a" />
    <div className="fc-load-ring fc-load-ring-b" />

    <div className="fc-load-star">
      <SymbolSVG id="wild" size={76} />
    </div>

    <div className="fc-load-title">FRUIT CASCADE</div>

    <div className="fc-load-bar">
      <span style={{ width: `${progress}%` }} />
    </div>
  </div>
);

const BigWinOverlay = ({ tier, amount }: { tier: Exclude<BigTier, null>; amount: number }) => {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 900;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);

      setShown(roundMoney(amount * eased));

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [amount]);

  return (
    <div className="fc-bigwin">
      <div className="fc-bigwin-burst" />

      <div className="fc-confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            key={index}
            style={{
              left: `${(index * 37) % 100}%`,
              animationDelay: `${(index % 8) * 0.08}s`,
            }}
          />
        ))}
      </div>

      <div className={`fc-bigwin-label ${tier}`}>
        {tier === 'epic' ? 'EPIC WIN' : tier === 'mega' ? 'MEGA WIN' : 'BIG WIN'}
      </div>

      <div className="fc-bigwin-value">{formatMoney(shown)}</div>
    </div>
  );
};

const InfoModal = ({ bet, onClose }: { bet: number; onClose: () => void }) => (
  <div className="fc-modal-layer" onClick={onClose}>
    <div className="fc-modal" onClick={(event) => event.stopPropagation()}>
      <div className="fc-modal-grip" />

      <div className="fc-modal-head">
        <div>
          <p>INFO</p>
          <h2>Fruit Cascade</h2>
        </div>

        <button type="button" onClick={onClose} aria-label="Close">
          X
        </button>
      </div>

      <div className="fc-modal-body">
        <section>
          <h3>Как играется</h3>
          <p>
            Собери {MIN_CLUSTER}+ одинаковых фруктов рядом по сторонам. Выигрышные символы
            лопаются, сверху падают новые, а множитель растёт на каждом каскаде.
          </p>
        </section>

        <section>
          <h3>Ставка</h3>
          <p>
            Выбери размер ставки целым числом от 1 и нажми Spin. Чем выше ставка, тем больше
            итоговый выигрыш.
          </p>
        </section>

        <section>
          <h3>Выплаты при ставке {formatMoney(bet)}</h3>

          <div className="fc-paytable">
            {SYMBOL_ORDER.map((symbol) => (
              <div className="fc-pay-row" key={symbol}>
                <SymbolSVG id={symbol} size={25} />
                <span>{SYMBOLS[symbol].name}</span>
                <b>{formatMoney(SYMBOLS[symbol].pay * (bet / 10))}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </div>
);

const StyleBlock = () => (
  <style>{`
    html.fruit-cascade-active,
    body.fruit-cascade-active,
    body.fruit-cascade-active #root,
    body.fruit-cascade-active .solo-app-shell,
    body.fruit-cascade-active .fruit-cascade-app-shell,
    body.fruit-cascade-active .solo-main,
    body.fruit-cascade-active .fruit-cascade-main {
      background:
        radial-gradient(105% 58% at 50% -10%, rgba(123, 54, 255, .46), transparent 58%),
        radial-gradient(90% 48% at 8% 18%, rgba(47, 140, 255, .20), transparent 55%),
        radial-gradient(95% 58% at 98% 88%, rgba(255, 143, 45, .22), transparent 58%),
        linear-gradient(180deg, #10081f 0%, #160b2b 46%, #090611 100%) !important;
      background-attachment: fixed !important;
      background-repeat: no-repeat !important;
    }

    body.fruit-cascade-active .solo-main,
    body.fruit-cascade-active .fruit-cascade-main {
      overflow: hidden !important;
    }

    body.fruit-cascade-active .header-panel {
      background:
        radial-gradient(circle at 12% 0%, rgba(255, 211, 77, .12), transparent 36%),
        radial-gradient(circle at 92% 0%, rgba(176, 107, 255, .14), transparent 34%),
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)),
        rgba(18, 10, 36, .62) !important;
      border-color: rgba(255, 214, 122, .13) !important;
      box-shadow:
        0 16px 38px rgba(0,0,0,.26),
        inset 0 1px 0 rgba(255,255,255,.08) !important;
    }

    .fc-root {
      position: relative;
      min-height: 100%;
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      padding: 6px 12px calc(14px + env(safe-area-inset-bottom, 0px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: #fff;
      font-family: 'Supercell', Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      contain: layout paint style;
      transform: translateZ(0);
      background: transparent;
    }

    .fc-root * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    .fc-content {
      position: relative;
      z-index: 1;
      min-height: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .fc-top {
      display: grid;
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
      gap: 9px;
      padding-bottom: 8px;
    }

    .fc-icon-btn,
    .fc-info-btn {
      width: 42px;
      height: 42px;
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,.86);
      background:
        linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.028)),
        rgba(27, 15, 52, .68);
      border: 1px solid rgba(255,255,255,.085);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.1),
        0 9px 20px rgba(0,0,0,.22);
      transform: translateZ(0);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .fc-icon-btn:active,
    .fc-info-btn:active,
    .fc-bet-btn:active,
    .fc-auto-btn:active,
    .fc-spin-btn:active {
      transform: scale(.94) translateZ(0);
      filter: brightness(1.08);
    }

    .fc-title-block {
      min-width: 0;
      text-align: center;
    }

    .fc-kicker {
      margin: 0 0 2px;
      font-size: 8px;
      line-height: 1.25;
      letter-spacing: .18em;
      color: rgba(255, 218, 151, .72);
    }

    .fc-title {
      margin: 0;
      font-size: 20px;
      line-height: 1.05;
      letter-spacing: .02em;
      color: #fff4c9;
      text-shadow: 0 3px 15px rgba(255, 168, 57, .34);
    }

    .fc-title span {
      color: #cda7ff;
    }

    .fc-board-area {
      min-height: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
    }

    .fc-board-frame {
      position: relative;
      overflow: hidden;
      border-radius: 25px;
      padding: 12px;
      background:
        radial-gradient(circle at 50% 0%, rgba(255,211,77,.09), transparent 36%),
        linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.026)),
        rgba(17, 9, 34, .82);
      border: 1px solid rgba(255, 214, 122, .20);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        inset 0 -12px 30px rgba(0,0,0,.22),
        0 16px 34px rgba(0,0,0,.30),
        0 0 20px rgba(126, 64, 255, .13);
      transform: translateZ(0);
      contain: layout paint style;
    }

    .fc-board-frame.flash {
      animation: fcBoardFlash .26s ease-out;
    }

    @keyframes fcBoardFlash {
      50% {
        box-shadow:
          inset 0 0 28px rgba(255,211,77,.23),
          0 0 26px rgba(255,211,77,.18),
          0 16px 34px rgba(0,0,0,.30);
      }
    }

    .fc-board {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(${COLS}, minmax(0, 1fr));
      gap: clamp(4px, 1.25vw, 6px);
      transform: translateZ(0);
      contain: layout paint style;
    }

    .fc-cell {
      position: relative;
      aspect-ratio: 1;
      border-radius: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(circle at 34% 20%, rgba(255,255,255,.13), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
        rgba(32, 18, 58, .74);
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        inset 0 -5px 9px rgba(0,0,0,.16);
      transform: translateZ(0);
      will-change: transform, opacity;
      contain: layout paint style;
    }

    .fc-cell-inner {
      width: 86%;
      height: 86%;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(var(--rot)) translateZ(0);
      will-change: transform, opacity;
    }

    .fc-cell.drop .fc-cell-inner {
      animation: fcDropPhysics ${DROP_MS}ms cubic-bezier(.16, .9, .19, 1) both;
      animation-delay: var(--delay);
    }

    @keyframes fcDropPhysics {
      0% {
        transform: translate3d(0, calc(var(--drop) * -112%), 0) rotate(calc(var(--rot) - 5deg)) scale(.97);
        opacity: .22;
      }

      66% {
        transform: translate3d(0, 6%, 0) rotate(calc(var(--rot) + 2deg)) scale(1.035, .97);
        opacity: 1;
      }

      84% {
        transform: translate3d(0, -2.5%, 0) rotate(var(--rot)) scale(.99, 1.015);
      }

      100% {
        transform: translate3d(0, 0, 0) rotate(var(--rot)) scale(1);
        opacity: 1;
      }
    }

    .fc-cell.win {
      z-index: 3;
      border-color: var(--glow);
      animation: fcWinMark .24s ease-out both;
    }

    .fc-cell.win::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: inherit;
      opacity: .74;
      pointer-events: none;
      background: radial-gradient(circle, var(--glow), transparent 68%);
      transform: translateZ(0);
    }

    @keyframes fcWinMark {
      0% {
        transform: translateZ(0) scale(1);
      }

      55% {
        transform: translateZ(0) scale(1.04);
      }

      100% {
        transform: translateZ(0) scale(1.015);
      }
    }

    .fc-cell.pop .fc-cell-inner {
      animation: fcPop ${POP_MS}ms ease-in both;
    }

    @keyframes fcPop {
      0% {
        transform: rotate(var(--rot)) scale(1);
        opacity: 1;
      }

      45% {
        transform: rotate(var(--rot)) scale(1.14);
        opacity: 1;
      }

      100% {
        transform: rotate(var(--rot)) scale(.25);
        opacity: 0;
      }
    }

    .fc-particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 4;
    }

    .fc-particles span {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 4px;
      height: 4px;
      border-radius: 999px;
      background: var(--glow);
      animation: fcSpark ${POP_MS}ms ease-out both;
      transform: rotate(var(--a)) translateX(0);
    }

    @keyframes fcSpark {
      to {
        opacity: 0;
        transform: rotate(var(--a)) translateX(21px) scale(.35);
      }
    }

    .fc-winline {
      height: 44px;
      border-radius: 18px;
      padding: 0 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
        rgba(20, 11, 39, .78);
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 8px 18px rgba(0,0,0,.21);
    }

    .fc-win-caption {
      font-size: 9px;
      letter-spacing: .16em;
      color: rgba(210,190,245,.66);
    }

    .fc-win-value {
      font-size: 19px;
      line-height: 1;
      color: #fff3c0;
      text-shadow: 0 0 13px rgba(255,190,77,.22);
    }

    .fc-win-mult {
      min-width: 45px;
      text-align: right;
      font-size: 16px;
      color: #9fffc4;
      text-shadow: 0 0 12px rgba(61,220,132,.24);
    }

    .fc-toast-layer {
      position: absolute;
      inset: 0;
      z-index: 8;
      pointer-events: none;
    }

    .fc-toast {
      position: absolute;
      left: var(--x);
      top: var(--y);
      transform: translate(-50%, -50%) translateZ(0);
      padding: 7px 10px;
      border-radius: 999px;
      color: #1a1024;
      font-size: 12px;
      background: linear-gradient(180deg, #fff3bd, #ffb347);
      box-shadow: 0 7px 16px rgba(255, 179, 71, .24);
      animation: fcToast .82s ease-out both;
      white-space: nowrap;
    }

    @keyframes fcToast {
      to {
        transform: translate(-50%, -105%) translateZ(0) scale(1.06);
        opacity: 0;
      }
    }

    .fc-controls {
      position: relative;
      z-index: 2;
      padding-top: 8px;
      display: grid;
      gap: 8px;
    }

    .fc-bet-card {
      display: grid;
      grid-template-columns: 54px 1fr 54px;
      align-items: center;
      gap: 7px;
      border-radius: 22px;
      padding: 8px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
        rgba(17, 9, 34, .76);
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.09),
        0 10px 20px rgba(0,0,0,.22);
    }

    .fc-bet-btn {
      height: 44px;
      border-radius: 16px;
      color: #fff1ba;
      font-size: 22px;
      line-height: 1;
      background:
        radial-gradient(circle at 30% 0%, rgba(255,255,255,.14), transparent 40%),
        linear-gradient(180deg, rgba(255,179,71,.24), rgba(255,255,255,.035));
      border: 1px solid rgba(255,211,77,.18);
      transition: transform .1s ease, opacity .1s ease, filter .1s ease;
    }

    .fc-bet-btn:disabled {
      opacity: .38;
    }

    .fc-bet-value {
      text-align: center;
      min-width: 0;
    }

    .fc-bet-label {
      display: block;
      margin-bottom: 2px;
      font-size: 8px;
      line-height: 1.2;
      letter-spacing: .17em;
      color: rgba(210,190,245,.58);
    }

    .fc-bet-number {
      display: block;
      font-size: 19px;
      line-height: 1.1;
      color: #fff;
    }

    .fc-main-actions {
      display: grid;
      grid-template-columns: 74px 1fr 74px;
      align-items: center;
      gap: 10px;
    }

    .fc-auto-btn {
      height: 58px;
      border-radius: 19px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      letter-spacing: .08em;
      color: rgba(220,202,255,.72);
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.024)),
        rgba(22, 12, 42, .74);
      border: 1px solid rgba(255,255,255,.075);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .fc-auto-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: rgba(220,202,255,.34);
    }

    .fc-auto-btn.on {
      color: #082011;
      background: linear-gradient(180deg, #b7ffd0, #3ddc84);
      border-color: rgba(159,255,196,.72);
      box-shadow: 0 0 16px rgba(61,220,132,.20);
    }

    .fc-auto-btn.on .fc-auto-dot {
      background: #082011;
      animation: fcAutoBlink 1s ease-in-out infinite;
    }

    @keyframes fcAutoBlink {
      50% {
        opacity: .34;
      }
    }

    .fc-spin-btn {
      position: relative;
      justify-self: center;
      width: 84px;
      height: 84px;
      border-radius: 999px;
      background: transparent;
      transition: transform .1s ease, filter .1s ease;
    }

    .fc-spin-btn:disabled {
      opacity: .82;
    }

    .fc-spin-ring {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: conic-gradient(from 0deg, #ffd34d, #ff7a1a, #ff4d6d, #b06bff, #3da8ff, #ffd34d);
      box-shadow: 0 0 21px rgba(255, 179, 71, .34);
      animation: fcSpin 4.5s linear infinite;
    }

    .fc-spin-btn.spinning .fc-spin-ring {
      animation-duration: .82s;
    }

    .fc-spin-core {
      position: absolute;
      inset: 6px;
      border-radius: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1a1024;
      font-size: 17px;
      background: radial-gradient(circle at 38% 28%, #fff6c2, #ffbe4f 56%, #d8730d);
      box-shadow:
        inset 0 2px 7px rgba(255,255,255,.54),
        inset 0 -6px 11px rgba(90,42,0,.34);
    }

    .fc-spin-loader {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      border: 3px solid rgba(26,16,36,.28);
      border-top-color: #1a1024;
      animation: fcSpin .68s linear infinite;
    }

    @keyframes fcSpin {
      to {
        transform: rotate(360deg);
      }
    }

    .fc-sound-pill {
      height: 58px;
      border-radius: 19px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.024)),
        rgba(22, 12, 42, .74);
      border: 1px solid rgba(255,255,255,.075);
      color: rgba(220,202,255,.72);
    }

    .fc-sound-pill span:first-child {
      font-size: 8px;
      letter-spacing: .16em;
      color: rgba(210,190,245,.58);
    }

    .fc-sound-pill span:last-child {
      margin-top: 2px;
      font-size: 12px;
      color: #fff3c0;
    }

    .fc-loading-screen {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .fc-load-halo {
      position: absolute;
      width: 270px;
      height: 270px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255, 190, 77, .22), transparent 66%);
      animation: fcPulse 1.8s ease-in-out infinite;
    }

    .fc-load-ring {
      position: absolute;
      border-radius: 999px;
      border: 2px solid rgba(255,255,255,.10);
    }

    .fc-load-ring-a {
      width: 220px;
      height: 220px;
      border-top-color: #ffd34d;
      animation: fcSpin 2.2s linear infinite;
    }

    .fc-load-ring-b {
      width: 178px;
      height: 178px;
      border-bottom-color: #b06bff;
      animation: fcSpin 1.6s linear infinite reverse;
    }

    .fc-load-star {
      position: relative;
      animation: fcPulse 1.5s ease-in-out infinite;
    }

    .fc-load-title {
      position: relative;
      margin-top: 24px;
      font-size: 25px;
      line-height: 1;
      color: #fff3bd;
      text-shadow: 0 0 18px rgba(255,190,77,.26);
    }

    .fc-load-bar {
      position: relative;
      overflow: hidden;
      width: 210px;
      height: 8px;
      margin-top: 22px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.08);
    }

    .fc-load-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #ffd34d, #ff7a1a, #ff4d6d);
      transition: width .1s ease;
    }

    @keyframes fcPulse {
      50% {
        transform: scale(1.08);
        opacity: .78;
      }
    }

    .fc-bigwin {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 45%, rgba(32, 15, 65, .86), rgba(7, 4, 14, .96));
      animation: fcFade .18s ease-out both;
    }

    @keyframes fcFade {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }

    .fc-bigwin-burst {
      position: absolute;
      width: 310px;
      height: 310px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(255,211,77,.32), transparent 67%);
      animation: fcBigPulse 1.2s ease-in-out infinite;
    }

    @keyframes fcBigPulse {
      50% {
        transform: scale(1.16);
        opacity: .75;
      }
    }

    .fc-bigwin-label {
      position: relative;
      font-size: 43px;
      line-height: .95;
      letter-spacing: .03em;
      color: #fff1ba;
      text-shadow: 0 0 24px rgba(255,190,77,.44);
      animation: fcBigPop .42s cubic-bezier(.22, 1.35, .31, 1) both;
    }

    .fc-bigwin-label.mega {
      font-size: 48px;
      color: #d2b6ff;
    }

    .fc-bigwin-label.epic {
      font-size: 51px;
      color: #9fffc4;
    }

    @keyframes fcBigPop {
      from {
        transform: scale(.35) rotate(-8deg);
        opacity: 0;
      }

      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    .fc-bigwin-value {
      position: relative;
      margin-top: 12px;
      font-size: 39px;
      color: #fff;
      text-shadow: 0 0 18px rgba(255,211,77,.44);
    }

    .fc-confetti {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .fc-confetti span {
      position: absolute;
      top: -14px;
      width: 8px;
      height: 12px;
      border-radius: 2px;
      background: #ffd34d;
      animation: fcConfetti 2s linear infinite;
    }

    .fc-confetti span:nth-child(3n) {
      background: #ff5c7a;
    }

    .fc-confetti span:nth-child(3n + 1) {
      background: #3ddc84;
    }

    @keyframes fcConfetti {
      to {
        transform: translate3d(0, 110vh, 0) rotate(460deg);
        opacity: 0;
      }
    }

    .fc-modal-layer {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0;
      background: rgba(5,3,12,.68);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      animation: fcFade .18s ease-out both;
    }

    .fc-modal {
      width: 100%;
      max-width: 480px;
      max-height: min(76vh, 610px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 24px 24px 0 0;
      background: linear-gradient(180deg, #20133b, #120a22);
      border: 1px solid rgba(255,214,122,.18);
      border-bottom: 0;
      box-shadow: 0 -18px 50px rgba(0,0,0,.38);
      animation: fcSlideUp .24s ease-out both;
    }

    @keyframes fcSlideUp {
      from {
        transform: translateY(100%);
      }

      to {
        transform: translateY(0);
      }
    }

    .fc-modal-grip {
      width: 42px;
      height: 4px;
      border-radius: 999px;
      margin: 9px auto 0;
      background: rgba(255,255,255,.22);
    }

    .fc-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 11px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    .fc-modal-head p {
      margin: 0 0 2px;
      font-size: 8px;
      letter-spacing: .18em;
      color: rgba(210,190,245,.58);
    }

    .fc-modal-head h2 {
      margin: 0;
      font-size: 17px;
      color: #fff3bd;
    }

    .fc-modal-head button {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      color: #fff;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.08);
      font-size: 16px;
    }

    .fc-modal-body {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px 16px 20px;
    }

    .fc-modal-body section + section {
      margin-top: 14px;
    }

    .fc-modal-body h3 {
      margin: 0 0 5px;
      font-size: 12px;
      color: #ffd891;
    }

    .fc-modal-body p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(239,231,255,.78);
    }

    .fc-paytable {
      display: grid;
      gap: 5px;
    }

    .fc-pay-row {
      display: grid;
      grid-template-columns: 30px 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 12px;
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.055);
    }

    .fc-pay-row span {
      font-size: 12px;
      color: rgba(239,231,255,.86);
    }

    .fc-pay-row b {
      font-size: 12px;
      color: #fff3bd;
    }

    @media (max-height: 720px) {
      .fc-root {
        padding-top: 2px;
        padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      }

      .fc-top {
        padding-bottom: 5px;
      }

      .fc-title {
        font-size: 18px;
      }

      .fc-board-frame {
        padding: 10px;
        border-radius: 22px;
      }

      .fc-cell {
        border-radius: 13px;
      }

      .fc-controls {
        gap: 6px;
        padding-top: 6px;
      }

      .fc-spin-btn {
        width: 76px;
        height: 76px;
      }

      .fc-bet-card {
        padding: 6px;
      }

      .fc-main-actions {
        grid-template-columns: 68px 1fr 68px;
        gap: 8px;
      }

      .fc-auto-btn,
      .fc-sound-pill {
        height: 52px;
        border-radius: 17px;
      }

      .fc-winline {
        height: 39px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fc-spin-ring,
      .fc-load-ring,
      .fc-load-star,
      .fc-load-halo,
      .fc-confetti span,
      .fc-bigwin-burst,
      .fc-cell.drop .fc-cell-inner,
      .fc-cell.win,
      .fc-cell.pop .fc-cell-inner,
      .fc-particles span {
        animation: none !important;
      }
    }
  `}</style>
);

const cellStyle = (cell: Cell): CSSProperties =>
  ({
    '--delay': `${cell.delay}ms`,
    '--drop': cell.drop,
    '--rot': `${cell.rot}deg`,
    '--glow': SYMBOLS[cell.sym].glow,
  }) as CSSProperties;

export const FruitCascadeSoloGame = () => {
  const [loading, setLoading] = useState(true);
  const [loadPct, setLoadPct] = useState(0);
  const [board, setBoard] = useState<Cell[]>(() => makeBoard());
  const [bet, setBet] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('fruit-cascade-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [winCells, setWinCells] = useState<Set<number>>(() => new Set());
  const [winValue, setWinValue] = useState(0);
  const [winShown, setWinShown] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [boardFlash, setBoardFlash] = useState(false);
  const [toasts, setToasts] = useState<WinToast[]>([]);
  const [bigTier, setBigTier] = useState<BigTier>(null);
  const [bigAmount, setBigAmount] = useState(0);

  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  const spinningRef = useRef(spinning);
  const autoRef = useRef(auto);
  const winShownRef = useRef(0);

  mutedRef.current = muted;
  spinningRef.current = spinning;
  autoRef.current = auto;

  const haptic = useCallback((kind: 'tap' | 'spin' | 'win' | 'big' | 'pop') => {
    const tgHaptics = getTelegramHaptics();

    if (kind === 'big') tgHaptics?.notificationOccurred?.('success');
    else if (kind === 'win') tgHaptics?.impactOccurred?.('medium');
    else if (kind === 'pop') tgHaptics?.impactOccurred?.('light');
    else tgHaptics?.selectionChanged?.();

    if ('vibrate' in navigator) {
      const pattern: VibratePattern =
        kind === 'big' ? [35, 30, 45] : kind === 'win' ? 22 : kind === 'spin' ? 14 : 8;

      navigator.vibrate(pattern);
    }
  }, []);

  const getAudioContext = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const AudioCtor = window.AudioContext || (window as BrowserWithAudio).webkitAudioContext;

    if (!AudioCtor) return null;

    audioRef.current = new AudioCtor();

    return audioRef.current;
  }, []);

  const playSound = useCallback(
    (kind: 'tap' | 'spin' | 'pop' | 'drop' | 'win' | 'big') => {
      if (mutedRef.current) return;

      const ctx = getAudioContext();

      if (!ctx) return;

      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const now = ctx.currentTime;

      const playTone = (
        frequency: number,
        startOffset: number,
        duration: number,
        volume: number,
        type: OscillatorType = 'sine',
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now + startOffset);

        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(volume, now + startOffset + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      if (kind === 'tap') playTone(520, 0, 0.07, 0.025);

      if (kind === 'spin') {
        playTone(180, 0, 0.12, 0.025, 'triangle');
        playTone(260, 0.05, 0.16, 0.022, 'triangle');
      }

      if (kind === 'drop') {
        playTone(160, 0, 0.08, 0.018, 'triangle');
      }

      if (kind === 'pop') {
        playTone(620, 0, 0.06, 0.023, 'square');
        playTone(820, 0.035, 0.07, 0.018, 'sine');
      }

      if (kind === 'win') {
        playTone(520, 0, 0.09, 0.026);
        playTone(720, 0.08, 0.11, 0.024);
        playTone(960, 0.17, 0.13, 0.022);
      }

      if (kind === 'big') {
        [440, 660, 880, 1170].forEach((freq, index) => {
          playTone(freq, index * 0.1, 0.18, 0.028);
        });
      }
    },
    [getAudioContext],
  );

  const animateWinNumber = useCallback((target: number) => {
    const from = winShownRef.current;
    const start = performance.now();
    const duration = 320;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = roundMoney(from + (target - from) * eased);

      winShownRef.current = value;
      setWinShown(value);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  const pushToast = useCallback((value: number) => {
    const id = toastSeq++;

    setToasts((items) => [
      ...items,
      {
        id,
        value,
        x: 32 + Math.random() * 36,
        y: 32 + Math.random() * 25,
      },
    ]);

    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 860);
  }, []);

  const collapseBoard = useCallback((current: Cell[], winning: Set<number>) => {
    const next: Cell[] = new Array<Cell>(CELL_COUNT);

    for (let col = 0; col < COLS; col += 1) {
      const survivors: Array<{ cell: Cell; row: number }> = [];

      for (let row = ROWS - 1; row >= 0; row -= 1) {
        const currentIndex = boardIndex(row, col);

        if (!winning.has(currentIndex)) {
          survivors.push({ cell: current[currentIndex], row });
        }
      }

      let writeRow = ROWS - 1;

      survivors.forEach(({ cell, row }) => {
        const distance = Math.max(0, writeRow - row);

        next[boardIndex(writeRow, col)] = {
          ...cell,
          phase: distance > 0 ? 'drop' : 'idle',
          drop: distance,
          delay: distance > 0 ? col * 12 + (ROWS - writeRow) * 9 : 0,
        };

        writeRow -= 1;
      });

      for (let row = writeRow; row >= 0; row -= 1) {
        next[boardIndex(row, col)] = makeCell('drop', col * 12 + row * 19, row + 2);
      }
    }

    return next;
  }, []);

  const spin = useCallback(async () => {
    if (spinningRef.current) return;

    setSpinning(true);
    setBigTier(null);
    setMultiplier(1);
    setWinCells(new Set());
    setToasts([]);
    setWinValue(0);
    setWinShown(0);
    winShownRef.current = 0;

    haptic('spin');
    playSound('spin');

    const freshBoard = injectStarterCluster(makeBoard('drop'));

    setBoard(freshBoard);
    await sleep(DROP_MS + 70);

    let current = freshBoard.map((cell) => ({
      ...cell,
      phase: 'idle' as CellPhase,
      delay: 0,
      drop: 0,
    }));

    setBoard(current);
    await sleep(55);

    let totalWin = 0;
    let cascade = 0;

    while (cascade < MAX_CASCADES) {
      const clusters = findClusters(current);

      if (clusters.length === 0) break;

      cascade += 1;
      setMultiplier(cascade);

      const winning = new Set<number>();
      let stepWin = 0;

      clusters.forEach((group) => {
        const baseIndex = group.find((index) => current[index].sym !== 'wild') ?? group[0];
        const baseSym = current[baseIndex].sym === 'wild' ? 'wild' : current[baseIndex].sym;
        const wildCount = group.filter((index) => current[index].sym === 'wild').length;
        const sizeBoost = 1 + Math.max(0, group.length - MIN_CLUSTER) * 0.42;
        const wildBoost = 1 + wildCount * 0.24;

        stepWin += SYMBOLS[baseSym].pay * group.length * sizeBoost * wildBoost * (bet / 10) * cascade;

        group.forEach((index) => winning.add(index));
      });

      stepWin = roundMoney(stepWin);
      totalWin = roundMoney(totalWin + stepWin);

      setWinCells(winning);
      setBoard(current.map((cell, index) => (winning.has(index) ? { ...cell, phase: 'win' } : cell)));

      haptic('win');
      playSound('win');
      pushToast(stepWin);
      setWinValue(totalWin);
      animateWinNumber(totalWin);

      await sleep(HIGHLIGHT_MS);

      setBoard((prev) =>
        prev.map((cell, index) => (winning.has(index) ? { ...cell, phase: 'pop' } : cell)),
      );

      setBoardFlash(true);
      haptic('pop');
      playSound('pop');

      window.setTimeout(() => setBoardFlash(false), 240);

      await sleep(POP_MS);

      const next = collapseBoard(current, winning);

      setWinCells(new Set());
      setBoard(next);
      playSound('drop');

      await sleep(DROP_MS + 20);

      current = next.map((cell) => ({
        ...cell,
        phase: 'idle' as CellPhase,
        delay: 0,
        drop: 0,
      }));

      setBoard(current);

      await sleep(AFTER_DROP_MS);
    }

    if (totalWin > 0) {
      const ratio = totalWin / bet;
      const tier: BigTier = ratio >= 14 ? 'epic' : ratio >= 7 ? 'mega' : ratio >= 3 ? 'big' : null;

      if (tier) {
        setBigAmount(totalWin);
        setBigTier(tier);
        haptic('big');
        playSound('big');

        await sleep(tier === 'epic' ? 2200 : tier === 'mega' ? 1950 : 1650);

        setBigTier(null);
      }
    }

    setMultiplier(1);
    setSpinning(false);
  }, [animateWinNumber, bet, collapseBoard, haptic, playSound, pushToast]);

  useEffect(() => {
    document.documentElement.classList.add('fruit-cascade-active');
    document.body.classList.add('fruit-cascade-active');

    return () => {
      document.documentElement.classList.remove('fruit-cascade-active');
      document.body.classList.remove('fruit-cascade-active');

      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('fruit-cascade-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 760;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2.5);

      setLoadPct(eased * 100);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        window.setTimeout(() => setLoading(false), 90);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!auto || spinning) return undefined;

    const timer = window.setTimeout(() => {
      void spin();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [auto, spinning, spin]);

  const changeBet = (direction: -1 | 1) => {
    if (spinning) return;

    haptic('tap');
    playSound('tap');

    setBet((value) => Math.max(1, value + direction));
  };

  const toggleMute = () => {
    haptic('tap');
    setMuted((value) => !value);
  };

  if (loading) {
    return (
      <div className="fc-root">
        <StyleBlock />
        <LoadingScreen progress={loadPct} />
      </div>
    );
  }

  return (
    <div className="fc-root">
      <StyleBlock />

      <div className="fc-content">
        <div className="fc-top">
          <button
            type="button"
            className="fc-info-btn"
            onClick={() => setShowInfo(true)}
            aria-label="Info"
          >
            i
          </button>

          <div className="fc-title-block">
            <p className="fc-kicker">SOLO SLOT</p>
            <h1 className="fc-title">
              FRUIT <span>CASCADE</span>
            </h1>
          </div>

          <button
            type="button"
            className="fc-icon-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          >
            {muted ? 'OFF' : 'ON'}
          </button>
        </div>

        <main className="fc-board-area">
          <div className={`fc-board-frame ${boardFlash ? 'flash' : ''}`}>
            <div className="fc-board">
              {board.map((cell, index) => {
                const isWinning = winCells.has(index);

                return (
                  <div
                    className={`fc-cell ${cell.phase} ${isWinning ? 'win' : ''}`}
                    key={cell.id}
                    style={cellStyle(cell)}
                  >
                    <div className="fc-cell-inner">
                      <SymbolSVG id={cell.sym} size={46} />
                    </div>

                    {cell.phase === 'pop' && (
                      <div className="fc-particles">
                        {Array.from({ length: 4 }, (_, spark) => (
                          <span
                            key={spark}
                            style={{ '--a': `${spark * 90}deg` } as CSSProperties}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="fc-toast-layer">
              {toasts.map((toast) => (
                <div
                  className="fc-toast"
                  key={toast.id}
                  style={
                    {
                      '--x': `${toast.x}%`,
                      '--y': `${toast.y}%`,
                    } as CSSProperties
                  }
                >
                  +{formatMoney(toast.value)}
                </div>
              ))}
            </div>
          </div>

          <div className="fc-winline">
            <span className="fc-win-caption">WIN</span>
            <strong className="fc-win-value">{formatMoney(winShown || winValue)}</strong>
            <span className="fc-win-mult">X{multiplier}</span>
          </div>
        </main>

        <footer className="fc-controls">
          <div className="fc-bet-card">
            <button
              type="button"
              className="fc-bet-btn"
              disabled={spinning || bet <= 1}
              onClick={() => changeBet(-1)}
              aria-label="Decrease bet"
            >
              -
            </button>

            <div className="fc-bet-value">
              <span className="fc-bet-label">BET</span>
              <span className="fc-bet-number">{formatMoney(bet)}</span>
            </div>

            <button
              type="button"
              className="fc-bet-btn"
              disabled={spinning}
              onClick={() => changeBet(1)}
              aria-label="Increase bet"
            >
              +
            </button>
          </div>

          <div className="fc-main-actions">
            <button
              type="button"
              className={`fc-auto-btn ${auto ? 'on' : ''}`}
              onClick={() => {
                haptic('tap');
                playSound('tap');
                setAuto((value) => !value);
              }}
              aria-label="Auto spin"
            >
              <span className="fc-auto-dot" />
              AUTO
            </button>

            <button
              type="button"
              className={`fc-spin-btn ${spinning ? 'spinning' : ''}`}
              disabled={spinning}
              onClick={() => void spin()}
              aria-label="Spin"
            >
              <span className="fc-spin-ring" />
              <span className="fc-spin-core">
                {spinning ? <span className="fc-spin-loader" /> : 'SPIN'}
              </span>
            </button>

            <button
              type="button"
              className="fc-sound-pill"
              onClick={toggleMute}
              aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            >
              <span>SOUND</span>
              <span>{muted ? 'OFF' : 'ON'}</span>
            </button>
          </div>
        </footer>
      </div>

      {bigTier && <BigWinOverlay tier={bigTier} amount={bigAmount} />}

      {showInfo && <InfoModal bet={bet} onClose={() => setShowInfo(false)} />}
    </div>
  );
};