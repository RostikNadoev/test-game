import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { SoloBalanceBar } from '../../components/Solo/SoloBalanceBar';
import { useSoloWallet } from '../../hooks/useSoloWallet';

import cherryImg from '../../assets/solo/fruit/cherry.webp';
import lemonImg from '../../assets/solo/fruit/lemon.webp';
import melonImg from '../../assets/solo/fruit/melon.webp';
import orangeImg from '../../assets/solo/fruit/orange.webp';
import starImg from '../../assets/solo/fruit/star.webp';
import strawberryImg from '../../assets/solo/fruit/strawberry.webp';
import wineImg from '../../assets/solo/fruit/wine.webp';

/* ============================================================================
 * Fruit Cascade — cascade slot for Telegram/mobile.
 * Uses external WEBP fruit assets from assets/solo/fruit.
 * ========================================================================== */

const COLS = 6;
const ROWS = 5;
const CELL_COUNT = COLS * ROWS;
const MIN_CLUSTER = 5;

const DROP_MS = 510;
const HIGHLIGHT_MS = 220;
const POP_MS = 210;
const AFTER_DROP_MS = 90;

const QUICK_BETS = [1, 5, 10, 25, 50, 100, 250, 500];

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

const SYMBOL_IMAGES: Record<SymbolId, string> = {
  cherry: cherryImg,
  lemon: lemonImg,
  orange: orangeImg,
  grape: wineImg,
  strawberry: strawberryImg,
  watermelon: melonImg,
  wild: starImg,
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

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const randomSym = () => WEIGHT_TABLE[Math.floor(Math.random() * WEIGHT_TABLE.length)];
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

const boardFromSymbols = (symbols: SymbolId[], phase: CellPhase = 'idle'): Cell[] =>
  symbols.map((sym, index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return {
      id: cellSeq++,
      sym,
      phase,
      delay: col * 16 + row * 22,
      drop: phase === 'drop' ? row + 2 : 0,
      rot: 0,
    };
  });

type ServerFruitOutcome = {
  initial_board: SymbolId[];
  steps: Array<{
    cascade: number;
    winning: number[];
    step_win: number;
    next_board: SymbolId[];
    total_win: number;
  }>;
  total_win: number;
  big_tier?: string;
};

const makeBoard = (phase: CellPhase = 'idle'): Cell[] =>
  Array.from({ length: CELL_COUNT }, (_, index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;

    return makeCell(phase, col * 16 + row * 22, phase === 'drop' ? row + 2 : 0);
  });

const SymbolIcon = memo(
  ({
    id,
    size = 48,
    className = '',
  }: {
    id: SymbolId;
    size?: number;
    className?: string;
  }) => (
    <img
      src={SYMBOL_IMAGES[id]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`fc-symbol-img ${className}`}
      style={{ width: size, height: size }}
    />
  ),
);

SymbolIcon.displayName = 'SymbolIcon';

const InfoIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 21.25C6.89 21.25 2.75 17.11 2.75 12S6.89 2.75 12 2.75 21.25 6.89 21.25 12 17.11 21.25 12 21.25Z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M12 10.6V16.4"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M12 7.45H12.01"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const VolumeOnIcon = ({ size = 19 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 9.4V14.6H7.25L12.2 18.4V5.6L7.25 9.4H4Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M15.4 8.35C16.35 9.3 16.9 10.58 16.9 12C16.9 13.42 16.35 14.7 15.4 15.65"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M18.05 5.85C19.62 7.43 20.5 9.6 20.5 12C20.5 14.4 19.62 16.57 18.05 18.15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const VolumeOffIcon = ({ size = 19 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 9.4V14.6H7.25L12.2 18.4V5.6L7.25 9.4H4Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M16 9L20 15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M20 9L16 15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const CloseIcon = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6.75 6.75L17.25 17.25"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M17.25 6.75L6.75 17.25"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </svg>
);

const LoadingScreen = ({ progress }: { progress: number }) => (
  <div className="fc-loading-screen">
    <div className="fc-load-halo" />
    <div className="fc-load-ring fc-load-ring-a" />
    <div className="fc-load-ring fc-load-ring-b" />

    <div className="fc-load-star">
      <SymbolIcon id="wild" size={82} />
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
          <CloseIcon />
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
            Выбери размер ставки целым числом от 1 и нажми Spin. Для быстрого изменения можно
            использовать кнопки -10, -1, +1, +10 или готовые значения под ставкой.
          </p>
        </section>

        <section>
          <h3>Выплаты при ставке {formatMoney(bet)}</h3>

          <div className="fc-paytable">
            {SYMBOL_ORDER.map((symbol) => (
              <div className="fc-pay-row" key={symbol}>
                <SymbolIcon id={symbol} size={30} />
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

    .fc-symbol-img {
      display: block;
      object-fit: contain;
      user-select: none;
      pointer-events: none;
      -webkit-user-drag: none;
      transform: translateZ(0);
      filter:
        drop-shadow(0 4px 4px rgba(0, 0, 0, .28))
        drop-shadow(0 0 8px rgba(255, 255, 255, .08));
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
      color: rgba(255,255,255,.88);
      background:
        radial-gradient(circle at 30% 0%, rgba(255,255,255,.13), transparent 42%),
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
    .fc-bet-chip:active,
    .fc-auto-btn:active,
    .fc-spin-btn:active,
    .fc-sound-pill:active {
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
      width: 89%;
      height: 89%;
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
      opacity: .62;
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

    .fc-bet-row {
      display: grid;
      grid-template-columns: 45px 42px 1fr 42px 45px;
      align-items: center;
      gap: 6px;
    }

    .fc-bet-btn {
      height: 42px;
      border-radius: 15px;
      color: #fff1ba;
      font-size: 14px;
      line-height: 1;
      background:
        radial-gradient(circle at 30% 0%, rgba(255,255,255,.14), transparent 40%),
        linear-gradient(180deg, rgba(255,179,71,.24), rgba(255,255,255,.035));
      border: 1px solid rgba(255,211,77,.18);
      transition: transform .1s ease, opacity .1s ease, filter .1s ease;
    }

    .fc-bet-btn.main {
      font-size: 20px;
    }

    .fc-bet-btn:disabled {
      opacity: .38;
    }

    .fc-bet-value {
      height: 42px;
      text-align: center;
      min-width: 0;
      border-radius: 15px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 211, 77, .12), transparent 50%),
        rgba(255, 255, 255, .035);
      border: 1px solid rgba(255, 255, 255, .055);
    }

    .fc-bet-label {
      display: block;
      margin-bottom: 2px;
      font-size: 7px;
      line-height: 1.1;
      letter-spacing: .17em;
      color: rgba(210,190,245,.58);
    }

    .fc-bet-number {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 17px;
      line-height: 1.1;
      color: #fff;
    }

    .fc-bet-chip-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .fc-bet-chip {
      height: 29px;
      border-radius: 12px;
      color: rgba(255, 255, 255, .78);
      font-size: 9px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.022)),
        rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.06);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .fc-bet-chip.active {
      color: #1a1024;
      background: linear-gradient(180deg, #fff3bd, #ffb347);
      border-color: rgba(255, 211, 77, .45);
      box-shadow: 0 0 14px rgba(255, 179, 71, .18);
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
      gap: 4px;
      align-items: center;
      justify-content: center;
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.024)),
        rgba(22, 12, 42, .74);
      border: 1px solid rgba(255,255,255,.075);
      color: rgba(220,202,255,.72);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .fc-sound-pill span {
      font-size: 9px;
      letter-spacing: .1em;
      color: rgba(255,255,255,.72);
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
      grid-template-columns: 34px 1fr auto;
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

      .fc-bet-row {
        grid-template-columns: 42px 38px 1fr 38px 42px;
        gap: 5px;
      }

      .fc-bet-btn {
        height: 38px;
        border-radius: 14px;
        font-size: 12px;
      }

      .fc-bet-btn.main {
        font-size: 18px;
      }

      .fc-bet-value {
        height: 38px;
      }

      .fc-bet-chip {
        height: 26px;
        font-size: 8px;
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
  const { balance, spin: soloSpin, loading: walletLoading, error: walletError, canAfford, setError } =
    useSoloWallet();
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

  const spin = useCallback(async () => {
    if (spinningRef.current || walletLoading) return;
    if (!canAfford(bet)) {
      setError('insufficient balance');
      return;
    }

    setSpinning(true);
    spinningRef.current = true;
    setBigTier(null);
    setMultiplier(1);
    setWinCells(new Set());
    setToasts([]);
    setWinValue(0);
    setWinShown(0);
    winShownRef.current = 0;

    haptic('spin');
    playSound('spin');

    try {
      const response = await soloSpin('fruit_cascade', bet);
      const outcome = response.outcome as ServerFruitOutcome;

      const freshBoard = boardFromSymbols(outcome.initial_board, 'drop');
      setBoard(freshBoard);
      await sleep(DROP_MS + 65);

      let current = freshBoard.map((cell) => ({
        ...cell,
        phase: 'idle' as CellPhase,
        delay: 0,
        drop: 0,
      }));

      setBoard(current);
      await sleep(50);

      let totalWin = outcome.total_win ?? response.payout_coins;

      for (const step of outcome.steps ?? []) {
        setMultiplier(step.cascade);
        const winning = new Set(step.winning);

        setWinCells(winning);
        setBoard(current.map((cell, index) => (winning.has(index) ? { ...cell, phase: 'win' } : cell)));

        haptic('win');
        playSound('win');
        pushToast(step.step_win);
        totalWin = step.total_win;
        setWinValue(totalWin);
        animateWinNumber(totalWin);

        await sleep(HIGHLIGHT_MS);

        setBoard((prev) =>
          prev.map((cell, index) => (winning.has(index) ? { ...cell, phase: 'pop' } : cell)),
        );

        setBoardFlash(true);
        haptic('pop');
        playSound('pop');
        window.setTimeout(() => setBoardFlash(false), 230);

        await sleep(POP_MS);

        current = boardFromSymbols(step.next_board, 'drop');
        setWinCells(new Set());
        setBoard(current);
        playSound('drop');

        await sleep(DROP_MS + 18);

        current = current.map((cell) => ({
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
    } catch {
      // wallet error shown in bar
    }

    setMultiplier(1);
    setSpinning(false);
    spinningRef.current = false;
  }, [
    animateWinNumber,
    bet,
    canAfford,
    haptic,
    playSound,
    pushToast,
    setError,
    soloSpin,
    walletLoading,
  ]);

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
    const duration = 740;

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

  const changeBet = (delta: number) => {
    if (spinning) return;

    haptic('tap');
    playSound('tap');

    setBet((value) => Math.max(1, value + delta));
  };

  const chooseBet = (value: number) => {
    if (spinning) return;

    haptic('tap');
    playSound('tap');

    setBet(value);
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
        <SoloBalanceBar balance={balance} error={walletError} />

        <div className="fc-top">
          <button
            type="button"
            className="fc-info-btn"
            onClick={() => setShowInfo(true)}
            aria-label="Info"
          >
            <InfoIcon />
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
            {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
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
                      <SymbolIcon id={cell.sym} size={48} />
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
            <div className="fc-bet-row">
              <button
                type="button"
                className="fc-bet-btn"
                disabled={spinning || bet <= 1}
                onClick={() => changeBet(-10)}
                aria-label="Decrease bet by 10"
              >
                -10
              </button>

              <button
                type="button"
                className="fc-bet-btn main"
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
                className="fc-bet-btn main"
                disabled={spinning}
                onClick={() => changeBet(1)}
                aria-label="Increase bet"
              >
                +
              </button>

              <button
                type="button"
                className="fc-bet-btn"
                disabled={spinning}
                onClick={() => changeBet(10)}
                aria-label="Increase bet by 10"
              >
                +10
              </button>
            </div>

            <div className="fc-bet-chip-row">
              {QUICK_BETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`fc-bet-chip ${bet === value ? 'active' : ''}`}
                  disabled={spinning}
                  onClick={() => chooseBet(value)}
                >
                  {formatMoney(value)}
                </button>
              ))}
            </div>
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
              {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
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