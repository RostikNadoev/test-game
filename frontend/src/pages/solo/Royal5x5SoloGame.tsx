import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Royal5x5PublicState } from '../../api/types';
import { useSoloSession } from '../../hooks/useSoloSession';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  deriveRoyal5x5CurrentRow,
  deriveRoyal5x5PickedByRow,
  deriveRoyal5x5Revealed,
  makeCellKey,
  mergeRevealedSets,
} from '../../utils/soloSessionState';

import trailImg from '../../assets/solo/apples/trail.webp';
import logoImg from '../../assets/solo/apples/logo.webp';
import appleImg from '../../assets/solo/apples/apple.webp';
import bombImg from '../../assets/solo/apples/bomb.webp';

const ROWS = 7;
const COLS = 5;
const MIN_BET = 1;
const QUICK_BETS = [10, 100];
const MULTIPLIERS = [1.1, 1.3, 1.6, 2, 3, 5, 10];

type GamePhase = 'idle' | 'playing' | 'cashed' | 'lost' | 'completed';

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

const getTelegramHaptics = () =>
  (window as BrowserWithAudio).Telegram?.WebApp?.HapticFeedback;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const waitFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatMoney = (value: number, locale = 'en-US') =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

const getCashoutMultiplier = (openedRows: number) => {
  if (openedRows <= 0) return 1;
  return MULTIPLIERS[Math.min(openedRows - 1, MULTIPLIERS.length - 1)];
};

const sanitizeBetInput = (value: string) => {
  const onlyDigits = value.replace(/[^\d]/g, '');
  return onlyDigits.replace(/^0+(\d)/, '$1');
};

const AssetImage = ({
  src,
  size,
  className = '',
  alt = '',
}: {
  src: string;
  size: number;
  className?: string;
  alt?: string;
}) => {
  const shared = {
    src,
    draggable: false as const,
    className: `at-asset-img ${className}`,
    'data-size': String(size),
  };

  if (alt) {
    return <img {...shared} alt={alt} />;
  }

  return <img {...shared} alt="" aria-hidden="true" />;
};

const TrailTitle = ({ loading = false }: { loading?: boolean }) => (
  <img
    src={trailImg}
    alt="Apple Trail"
    draggable={false}
    className={loading ? 'at-title-img at-title-img-loading' : 'at-title-img'}
  />
);

const AppleIcon = ({ size = 56 }: { size?: number }) => (
  <AssetImage src={appleImg} size={size} className="at-symbol-img at-apple-img" />
);

const BombIcon = ({ size = 56 }: { size?: number }) => (
  <AssetImage src={bombImg} size={size} className="at-symbol-img at-bomb-img" />
);

const QuestionIcon = ({ size = 42 }: { size?: number }) => (
  <AssetImage src={logoImg} size={size} className="at-logo-img" />
);

const InfoIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 21.25C6.89 21.25 2.75 17.11 2.75 12S6.89 2.75 12 2.75 21.25 6.89 21.25 12 17.11 21.25 12 21.25Z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M12 10.6V16.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M12 7.45H12.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const CloseIcon = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.75 6.75L17.25 17.25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M17.25 6.75L6.75 17.25" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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
    <path d="M16 9L20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M20 9L16 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ASSET_SIZE_CSS = [42, 44, 48, 50, 56, 58, 60, 68, 70]
  .map((size) => `.at-asset-img[data-size="${size}"] { width: ${size}px; height: ${size}px; }`)
  .join('\n');

const FINAL_TIER_CSS = `
  .at-final-card.is-lost {
    --finalGlow: rgba(255, 45, 59, .28);
    --finalGlowSoft: rgba(255, 45, 59, .26);
    --finalText: #ff6673;
  }

  .at-final-card.is-win {
    --finalGlow: rgba(255, 190, 72, .30);
    --finalGlowSoft: rgba(255, 190, 72, .24);
    --finalText: #fff1a8;
  }

  .at-final-card.is-mega {
    --finalGlow: rgba(202, 116, 255, .32);
    --finalGlowSoft: rgba(202, 116, 255, .24);
    --finalText: #d79cff;
  }

  .at-final-card.is-epic {
    --finalGlow: rgba(113, 255, 97, .34);
    --finalGlowSoft: rgba(113, 255, 97, .28);
    --finalText: #9dff83;
  }

  .at-tile[data-tile="bomb"] {
    --tile-glow: rgba(255, 68, 68, .22);
  }

  .at-tile[data-tile="apple"] {
    --tile-glow: rgba(201, 255, 98, .18);
  }
`;

const StyleBlock = () => (
  <style>{`
    html.apple-trail-active,
    body.apple-trail-active,
    body.apple-trail-active #root,
    body.apple-trail-active .solo-app-shell,
    body.apple-trail-active .royal-apple-app-shell,
    body.apple-trail-active .solo-main,
    body.apple-trail-active .royal-apple-main {
      background:
        radial-gradient(90% 55% at 50% -12%, rgba(255, 204, 72, .28), transparent 58%),
        radial-gradient(92% 54% at 4% 18%, rgba(159, 54, 255, .28), transparent 56%),
        radial-gradient(88% 58% at 95% 22%, rgba(38, 179, 124, .22), transparent 58%),
        radial-gradient(110% 56% at 50% 105%, rgba(214, 42, 24, .38), transparent 62%),
        linear-gradient(180deg, #090414 0%, #190920 43%, #100712 100%) !important;
      background-attachment: fixed !important;
      background-repeat: no-repeat !important;
    }

    body.apple-trail-active .solo-app-shell,
    body.apple-trail-active .royal-apple-app-shell {
      overflow: hidden !important;
      background-color: transparent !important;
    }

    body.apple-trail-active .solo-main,
    body.apple-trail-active .royal-apple-main {
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      height: auto !important;
      padding-bottom: 0 !important;
      overflow: hidden !important;
      background-color: transparent !important;
    }

    body.apple-trail-active .header-panel {
      background:
        radial-gradient(circle at 14% 0%, rgba(255, 207, 94, .18), transparent 37%),
        radial-gradient(circle at 88% 0%, rgba(119, 255, 139, .11), transparent 35%),
        radial-gradient(circle at 50% 100%, rgba(255, 62, 37, .11), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.074), rgba(255,255,255,.026)),
        rgba(28, 11, 28, .66) !important;
      border-color: rgba(255, 176, 83, .22) !important;
      box-shadow:
        0 16px 38px rgba(0, 0, 0, .30),
        inset 0 1px 0 rgba(255,255,255,.09),
        0 0 26px rgba(255, 143, 45, .08) !important;
    }

    body.apple-trail-active .solo-header-badge {
      color: #180812 !important;
      background: linear-gradient(180deg, #c9ff62, #58de46) !important;
      box-shadow: 0 0 14px rgba(124, 255, 91, .22) !important;
    }

    .at-root {
      position: relative;
      min-height: 0;
      height: 100%;
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      padding: 12px 12px calc(7px + env(safe-area-inset-bottom, 0px));
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      overflow: hidden;
      color: #fff;
      font-family: 'Supercell', Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      contain: layout paint style;
      transform: translateZ(0);
      background: transparent;
    }

    .at-root * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    .at-content {
      position: relative;
      z-index: 1;
      min-height: 0;
      height: 100%;
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }

    .at-asset-img {
      display: block;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    .at-title-img {
      display: block;
      width: min(100%, 380px);
      height: auto;
      max-height: 75px;
      margin: 0 auto;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      filter:
        drop-shadow(0 5px 0 rgba(90, 18, 10, .72))
        drop-shadow(0 9px 14px rgba(0, 0, 0, .42))
        drop-shadow(0 0 18px rgba(95, 255, 84, .18));
      transform: translateZ(0);
    }

    .at-title-img-loading {
      width: min(78vw, 365px);
      max-height: 88px;
      filter:
        drop-shadow(0 6px 0 rgba(90, 18, 10, .72))
        drop-shadow(0 12px 24px rgba(0, 0, 0, .46))
        drop-shadow(0 0 22px rgba(95, 255, 84, .24));
    }

    .at-logo-img {
      width: min(66%, 48px) !important;
      height: min(66%, 48px) !important;
      opacity: .94;
      filter:
        drop-shadow(0 3px 5px rgba(0,0,0,.36))
        drop-shadow(0 0 8px rgba(255, 196, 83, .14));
    }

    .at-symbol-img {
      width: min(84%, 60px) !important;
      height: min(84%, 60px) !important;
      filter:
        drop-shadow(0 5px 5px rgba(0,0,0,.30))
        drop-shadow(0 0 10px rgba(255,255,255,.08));
    }

    .at-bomb-img {
      width: min(82%, 58px) !important;
      height: min(82%, 58px) !important;
      filter:
        drop-shadow(0 5px 5px rgba(0,0,0,.34))
        drop-shadow(0 0 12px rgba(255, 67, 67, .15));
    }

    .at-loading {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      overflow: hidden;
    }

    .at-loading-glow {
      position: absolute;
      width: 300px;
      height: 300px;
      border-radius: 999px;
      background:
        radial-gradient(circle, rgba(255, 185, 64, .24), transparent 62%),
        radial-gradient(circle at 35% 40%, rgba(128, 255, 84, .15), transparent 44%),
        radial-gradient(circle at 65% 60%, rgba(255, 48, 66, .16), transparent 42%);
      animation: atLoadPulse 1.4s ease-in-out infinite;
    }

    .at-loading-orbit {
      position: relative;
      width: 154px;
      height: 154px;
      border-radius: 999px;
      border: 1px solid rgba(255, 220, 123, .16);
      animation: atLoadSpin 2s linear infinite;
    }

    .at-loading-orbit::before,
    .at-loading-orbit::after {
      content: '';
      position: absolute;
      inset: 13px;
      border-radius: inherit;
      border: 1px solid rgba(255,255,255,.07);
    }

    .at-loading-apple,
    .at-loading-bomb {
      position: absolute;
      display: grid;
      place-items: center;
      width: 66px;
      height: 66px;
      border-radius: 999px;
      background: rgba(255,255,255,.052);
      border: 1px solid rgba(255,255,255,.08);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 14px 30px rgba(0,0,0,.25);
      animation: atLoadCounterSpin 2s linear infinite;
    }

    .at-loading-apple {
      top: -8px;
      left: 44px;
    }

    .at-loading-bomb {
      bottom: -8px;
      left: 44px;
    }

    .at-loading-bar {
      position: relative;
      overflow: hidden;
      width: 210px;
      height: 8px;
      margin-top: 20px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.08);
    }

    .at-loading-bar span {
      display: block;
      height: 100%;
      width: var(--loadProgress, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, #c9ff62, #fff1a8, #ff6538);
      transition: width .08s linear;
    }

    @keyframes atLoadPulse {
      50% {
        transform: scale(1.08);
        opacity: .78;
      }
    }

    @keyframes atLoadSpin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes atLoadCounterSpin {
      to {
        transform: rotate(-360deg);
      }
    }

    .at-top {
      display: grid;
      grid-template-columns: 42px 1fr 42px;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .at-icon-btn {
      width: 40px;
      height: 40px;
      border-radius: 17px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,.9);
      background:
        radial-gradient(circle at 30% 0%, rgba(255,255,255,.15), transparent 43%),
        linear-gradient(180deg, rgba(255,255,255,.082), rgba(255,255,255,.026)),
        rgba(36, 15, 42, .72);
      border: 1px solid rgba(255, 174, 88, .16);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.1),
        0 9px 19px rgba(0,0,0,.22);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .at-icon-btn:active,
    .at-tile:active,
    .at-bet-quick:active,
    .at-cash-btn:active,
    .at-main-btn:active {
      transform: scale(.95) translateZ(0);
      filter: brightness(1.08);
    }

    .at-title-wrap {
      min-width: 0;
      text-align: center;
    }

    .at-main-layout {
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 58px;
      gap: 7px;
      align-items: stretch;
      overflow: hidden;
    }

    .at-board-shell {
      position: relative;
      min-height: 0;
      overflow: hidden;
      border-radius: 25px;
      padding: 9px;
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 207, 94, .12), transparent 36%),
        linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.026)),
        rgba(31, 13, 30, .82);
      border: 1px solid rgba(255, 174, 88, .22);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        inset 0 -12px 30px rgba(0,0,0,.24),
        0 14px 30px rgba(0,0,0,.26),
        0 0 20px rgba(108, 255, 83, .07);
      contain: layout paint style;
      transform: translateZ(0);
    }

    .at-board {
      display: grid;
      grid-template-rows: repeat(${ROWS}, minmax(0, 1fr));
      gap: 6px;
      height: 100%;
      min-height: 0;
    }

    .at-row {
      display: block;
      min-height: 0;
    }

    .at-row-cells {
      display: grid;
      grid-template-columns: repeat(${COLS}, minmax(0, 1fr));
      gap: 6px;
      height: 100%;
      min-height: 0;
    }

    .at-tile {
      position: relative;
      min-width: 0;
      width: 100%;
      height: 100%;
      aspect-ratio: auto;
      border-radius: 17px;
      overflow: hidden;
      border: 1px solid rgba(255, 156, 91, .17);
      background: rgba(59, 23, 48, .78);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        inset 0 -5px 10px rgba(0,0,0,.18);
      transform: translateZ(0);
      transition:
        transform .18s ease,
        border-color .22s ease,
        filter .22s ease,
        opacity .22s ease,
        box-shadow .22s ease;
      contain: layout paint style;
      perspective: 900px;
    }

    .at-tile.available {
      cursor: pointer;
      border-color: rgba(255, 207, 94, .44);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 0 15px rgba(255, 207, 94, .14),
        inset 0 -5px 10px rgba(0,0,0,.18);
    }

    .at-tile.locked {
      opacity: .62;
      filter: saturate(.82) brightness(.9);
    }

    .at-tile.apple {
      border-color: rgba(186, 255, 94, .52);
      box-shadow:
        0 0 14px rgba(129, 255, 94, .14),
        inset 0 1px 0 rgba(255,255,255,.10);
    }

    .at-tile.bomb {
      border-color: rgba(255, 64, 64, .56);
      box-shadow:
        0 0 18px rgba(255, 38, 56, .18),
        inset 0 1px 0 rgba(255,255,255,.10);
    }

    .at-tile.bomb.picked-bomb {
      animation: atBombShake .34s ease-out both;
    }

    .at-tile.dimmed {
      opacity: .42;
      filter: saturate(.68) brightness(.70);
    }

    .at-card-inner {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      transform-style: preserve-3d;
      transform: rotateY(0deg) translateZ(0);
      transition: transform .74s cubic-bezier(.16, .86, .18, 1);
      will-change: transform;
    }

    .at-tile.revealed .at-card-inner {
      transform: rotateY(180deg) translateZ(0);
    }

    .at-tile.pending .at-card-inner {
      animation: atPendingTile .78s ease-in-out infinite;
    }

    .at-card-face {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      border-radius: inherit;
      overflow: hidden;
      backface-visibility: hidden;
      transform: translateZ(0);
    }

    .at-card-front {
      background:
        radial-gradient(circle at 35% 10%, rgba(255,255,255,.12), transparent 40%),
        linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.022)),
        rgba(59, 23, 48, .78);
    }

    .at-card-front::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 14px;
      pointer-events: none;
      border: 1px solid rgba(255, 226, 122, .14);
      opacity: .72;
    }

    .at-card-back {
      transform: rotateY(180deg) translateZ(0);
      background:
        radial-gradient(circle at 50% 20%, var(--tile-glow), transparent 44%),
        linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.024)),
        rgba(50, 24, 41, .82);
    }

    @keyframes atBombShake {
      0%, 100% {
        transform: translateX(0) translateZ(0);
      }

      20% {
        transform: translateX(-3px) translateZ(0);
      }

      40% {
        transform: translateX(3px) translateZ(0);
      }

      60% {
        transform: translateX(-2px) translateZ(0);
      }

      80% {
        transform: translateX(2px) translateZ(0);
      }
    }

    .at-side-panel {
      min-height: 0;
      border-radius: 20px;
      padding: 6px 4px;
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 207, 94, .10), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.022)),
        rgba(22, 13, 31, .82);
      border: 1px solid rgba(255, 174, 88, .16);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 12px 24px rgba(0,0,0,.22);
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }

    .at-side-title {
      flex: 0 0 auto;
      text-align: center;
      color: rgba(255, 210, 158, .68);
      font-size: 6.5px;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 1px 0;
    }

    .at-mult-pill {
      flex: 1 1 0;
      min-height: 0;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,.52);
      font-size: 10.5px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.018)),
        rgba(255,255,255,.026);
      border: 1px solid rgba(255,255,255,.052);
      transition:
        transform .24s ease,
        color .24s ease,
        background .24s ease,
        box-shadow .24s ease,
        border-color .24s ease;
    }

    .at-mult-pill.reached {
      color: #b9ff74;
      border-color: rgba(139, 255, 91, .24);
      background:
        radial-gradient(circle at 50% 0%, rgba(121, 255, 93, .11), transparent 48%),
        rgba(36, 72, 30, .20);
    }

    .at-mult-pill.active {
      color: #201005;
      background: linear-gradient(180deg, #fff1a8, #ffb548);
      border-color: rgba(255, 229, 129, .76);
      box-shadow:
        0 0 15px rgba(255, 186, 72, .28),
        inset 0 1px 0 rgba(255,255,255,.50);
      transform: scale(1.025);
    }

    .at-result-bar {
      min-height: 48px;
      flex: 0 0 auto;
      border-radius: 20px;
      padding: 6px;
      display: grid;
      grid-template-columns: 1fr minmax(112px, .72fr);
      gap: 6px;
      background:
        radial-gradient(circle at 82% 50%, rgba(119, 255, 91, .11), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.022)),
        rgba(24, 11, 30, .78);
      border: 1px solid rgba(255, 174, 88, .14);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 8px 18px rgba(0,0,0,.18);
    }

    .at-result-card {
      min-width: 0;
      padding: 6px 9px;
      border-radius: 15px;
      background: rgba(255,255,255,.032);
      border: 1px solid rgba(255,255,255,.052);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .at-result-label {
      color: rgba(255, 210, 158, .62);
      font-size: 6.5px;
      letter-spacing: .12em;
      text-transform: uppercase;
      line-height: 1.1;
    }

    .at-result-value {
      margin-top: 3px;
      color: #ffd15f;
      font-size: 17px;
      line-height: 1;
      text-shadow: 0 0 12px rgba(255, 203, 89, .22);
      font-variant-numeric: tabular-nums;
    }

    .at-cash-wrap {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .at-cash-btn {
      height: 31px;
      border-radius: 14px;
      color: #082009;
      font-size: 12px;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.42), transparent 44%),
        linear-gradient(180deg, #a5ff72, #38b936);
      border: 1px solid rgba(196, 255, 133, .66);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.46),
        0 0 14px rgba(103, 255, 76, .18);
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }

    .at-cash-btn:disabled {
      opacity: .42;
      color: rgba(255,255,255,.34);
      background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
        rgba(255,255,255,.035);
      border-color: rgba(255,255,255,.055);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
    }

    .at-current-mult {
      text-align: center;
      color: rgba(255, 238, 180, .60);
      font-size: 7.4px;
      line-height: 1.15;
      white-space: nowrap;
    }

    .at-current-mult b {
      color: #fff1a8;
    }

    .at-controls {
      flex: 0 0 auto;
      display: grid;
      gap: 6px;
      min-height: 0;
    }

    .at-bet-card {
      display: grid;
      grid-template-columns: 1fr 54px 54px;
      gap: 6px;
      align-items: center;
      border-radius: 19px;
      padding: 6px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.021)),
        rgba(31, 13, 30, .80);
      border: 1px solid rgba(255, 174, 88, .15);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.075),
        0 7px 15px rgba(0,0,0,.17);
    }

    .at-bet-field {
      height: 42px;
      min-width: 0;
      border-radius: 15px;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      padding: 0 11px;
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 211, 77, .10), transparent 50%),
        rgba(255, 255, 255, .032);
      border: 1px solid rgba(255, 255, 255, .052);
    }

    .at-bet-label {
      color: rgba(255, 210, 158, .58);
      font-size: 7px;
      line-height: 1;
      letter-spacing: .15em;
      text-transform: uppercase;
    }

    .at-bet-input {
      width: 100%;
      min-width: 0;
      height: 100%;
      border: 0;
      outline: none;
      background: transparent;
      color: #fff;
      text-align: right;
      font-family: inherit;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
      appearance: textfield;
    }

    .at-bet-input::-webkit-outer-spin-button,
    .at-bet-input::-webkit-inner-spin-button {
      margin: 0;
      appearance: none;
    }

    .at-bet-input:disabled {
      opacity: .55;
    }

    .at-bet-quick {
      height: 42px;
      border-radius: 15px;
      color: #1a1024;
      font-size: 11px;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.42), transparent 44%),
        linear-gradient(180deg, #fff3bd, #ffb347);
      border: 1px solid rgba(255, 211, 77, .42);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.44),
        0 0 12px rgba(255, 179, 71, .14);
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }

    .at-bet-quick:disabled {
      opacity: .42;
      color: rgba(255,255,255,.36);
      background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
        rgba(255,255,255,.035);
      border-color: rgba(255,255,255,.055);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
    }

    .at-start-row {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 88px;
    }

    .at-main-btn {
      position: relative;
      width: 90px;
      height: 90px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      color: #231006;
      background:
        radial-gradient(circle at 38% 25%, #fff8c8 0%, #ffd45e 42%, #ff922f 68%, #d84827 100%);
      box-shadow:
        inset 0 2px 7px rgba(255,255,255,.58),
        inset 0 -7px 13px rgba(111, 39, 3, .28),
        0 0 18px rgba(255, 181, 72, .26),
        0 8px 18px rgba(0,0,0,.25);
      overflow: hidden;
      isolation: isolate;
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
      transform: translateZ(0);
    }

    .at-main-btn:disabled {
      opacity: .62;
      filter: saturate(.86);
    }

    .at-main-ring {
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: inherit;
      background:
        radial-gradient(circle at 35% 20%, rgba(255,255,255,.52), transparent 38%),
        linear-gradient(135deg, rgba(255,255,255,.18), transparent 45%);
      opacity: .82;
    }

    .at-main-core {
      position: absolute;
      inset: 6px;
      z-index: 1;
      border-radius: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(circle at 38% 25%, #fff8c8 0%, #ffd45e 54%, #f09428 100%);
      box-shadow:
        inset 0 2px 7px rgba(255,255,255,.52),
        inset 0 -6px 11px rgba(95, 40, 0, .25);
    }

    .at-main-title {
      font-size: 14px;
      line-height: 1;
    }

    .at-main-subtitle {
      margin-top: 3px;
      font-size: 6.5px;
      line-height: 1.15;
      letter-spacing: .08em;
      color: rgba(35, 16, 6, .78);
      text-transform: uppercase;
    }

    .at-final-layer {
      position: fixed;
      inset: 0;
      z-index: 240;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 45%, rgba(96, 32, 92, .3), transparent 48%),
        rgba(5, 2, 8, .66);
      -webkit-backdrop-filter: blur(14px) saturate(.82);
      backdrop-filter: blur(14px) saturate(.82);
      animation: atFade .18s ease-out both;
      pointer-events: none;
    }

    .at-final-card {
      position: relative;
      overflow: hidden;
      width: min(330px, 88vw);
      border-radius: 30px;
      padding: 22px 18px 18px;
      text-align: center;
      background:
        radial-gradient(circle at 50% 0%, var(--finalGlow), transparent 48%),
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.032)),
        rgba(28, 12, 34, .94);
      border: 1px solid rgba(255, 221, 134, .18);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 24px 70px rgba(0,0,0,.58),
        0 0 38px var(--finalGlowSoft);
      animation: atFinalPop .36s cubic-bezier(.22, 1.3, .3, 1) both;
    }

    .at-final-icon {
      display: grid;
      width: 88px;
      height: 88px;
      margin: 0 auto 12px;
      place-items: center;
      border-radius: 999px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }

    .at-final-title {
      font-size: 31px;
      line-height: .95;
      color: var(--finalText);
      text-shadow: 0 0 24px var(--finalGlowSoft);
    }

    .at-final-value {
      margin-top: 10px;
      font-size: 38px;
      line-height: 1;
      color: #fff;
      text-shadow: 0 0 18px rgba(255,255,255,.20);
      font-variant-numeric: tabular-nums;
    }

    .at-final-mult {
      position: relative;
      z-index: 2;
      margin-top: 8px;
      color: rgba(255, 239, 188, .76);
      font-size: 12px;
    }

    .at-final-icon,
    .at-final-title,
    .at-final-value {
      position: relative;
      z-index: 2;
    }

    .at-final-fx {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .at-final-fx i {
      --at-angle: calc(var(--at-fx) * 31deg);
      position: absolute;
      left: 50%;
      top: 48%;
      width: 4px;
      height: 10px;
      border-radius: 999px;
      background: var(--finalText);
      opacity: 0;
      transform: rotate(var(--at-angle)) translateY(-34px);
      animation: atFinalSpark 1.3s ease-out calc(var(--at-fx) * 26ms) both;
    }

    @keyframes atFade {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }

    @keyframes atFinalPop {
      from {
        opacity: 0;
        transform: translateY(16px) scale(.82);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes atFinalSpark {
      12% { opacity: .9; }
      100% { opacity: 0; transform: rotate(var(--at-angle)) translateY(-138px) scale(.3); }
    }

    @keyframes atPendingTile {
      50% { filter: brightness(1.15); transform: scale(.97); }
    }

    .at-modal-layer {
      position: fixed;
      inset: 0;
      z-index: 240;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0;
      background: rgba(5,3,12,.68);
      backdrop-filter: blur(14px) saturate(.82);
      -webkit-backdrop-filter: blur(14px) saturate(.82);
      animation: atFade .18s ease-out both;
    }

    .at-modal {
      width: 100%;
      max-width: 480px;
      max-height: min(76vh, 610px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 24px 24px 0 0;
      background: linear-gradient(180deg, #25102f, #120713);
      border: 1px solid rgba(255,214,122,.18);
      border-bottom: 0;
      box-shadow: 0 -18px 50px rgba(0,0,0,.38);
      animation: atSlideUp .24s ease-out both;
    }

    @keyframes atSlideUp {
      from {
        transform: translateY(100%);
      }

      to {
        transform: translateY(0);
      }
    }

    .at-modal-grip {
      width: 42px;
      height: 4px;
      border-radius: 999px;
      margin: 9px auto 0;
      background: rgba(255,255,255,.22);
    }

    .at-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 11px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    .at-modal-head p {
      margin: 0 0 2px;
      color: rgba(255, 210, 158, .58);
      font-size: 8px;
      letter-spacing: .18em;
    }

    .at-modal-head h2 {
      margin: 0;
      color: #fff3bd;
      font-size: 17px;
    }

    .at-modal-head button {
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

    .at-modal-body {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px 16px 20px;
    }

    .at-modal-body section + section {
      margin-top: 14px;
    }

    .at-modal-body h3 {
      margin: 0 0 5px;
      color: #ffd891;
      font-size: 12px;
    }

    .at-modal-body p {
      margin: 0;
      color: rgba(239,231,255,.78);
      font-size: 12px;
      line-height: 1.5;
    }

    .at-info-mults {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
    }

    .at-info-mults span {
      height: 30px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: #201005;
      font-size: 10px;
      background: linear-gradient(180deg, #fff1a8, #ffb548);
    }

    @media (max-height: 760px) {
      .at-root {
        padding-top: 9px;
        padding-bottom: calc(5px + env(safe-area-inset-bottom, 0px));
      }

      .at-content {
        gap: 6px;
      }

      .at-title-img {
        max-height: 54px;
      }

      .at-icon-btn {
        width: 38px;
        height: 38px;
        border-radius: 16px;
      }

      .at-main-layout {
        grid-template-columns: 1fr 54px;
        gap: 6px;
      }

      .at-board-shell {
        padding: 8px;
        border-radius: 22px;
      }

      .at-board {
        gap: 5px;
      }

      .at-row-cells {
        gap: 5px;
      }

      .at-tile {
        border-radius: 14px;
      }

      .at-card-front::after {
        border-radius: 12px;
      }

      .at-side-panel {
        border-radius: 18px;
        padding: 5px 3px;
        gap: 4px;
      }

      .at-side-title {
        font-size: 6px;
      }

      .at-mult-pill {
        border-radius: 10px;
        font-size: 9.8px;
      }

      .at-result-bar {
        min-height: 45px;
      }

      .at-result-value {
        font-size: 16px;
      }

      .at-cash-btn {
        height: 29px;
        font-size: 10.5px;
      }

      .at-current-mult {
        font-size: 6.8px;
      }

      .at-bet-card {
        padding: 5px;
        border-radius: 17px;
      }

      .at-bet-field,
      .at-bet-quick {
        height: 38px;
        border-radius: 13px;
      }

      .at-bet-label {
        font-size: 6.4px;
      }

      .at-bet-input {
        font-size: 14px;
      }

      .at-bet-quick {
        font-size: 9.5px;
      }

      .at-start-row {
        min-height: 78px;
      }

      .at-main-btn {
        width: 82px;
        height: 82px;
      }

      .at-main-title {
        font-size: 12.5px;
      }

      .at-main-subtitle {
        font-size: 5.8px;
      }
    }

    @media (max-height: 690px) {
      .at-root {
        padding-top: 7px;
        padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
      }

      .at-content {
        gap: 5px;
      }

      .at-top {
        grid-template-columns: 36px 1fr 36px;
      }

      .at-icon-btn {
        width: 35px;
        height: 35px;
        border-radius: 15px;
      }

      .at-title-img {
        max-height: 46px;
      }

      .at-main-layout {
        grid-template-columns: 1fr 50px;
        gap: 5px;
      }

      .at-board-shell {
        padding: 7px;
        border-radius: 20px;
      }

      .at-board {
        gap: 4px;
      }

      .at-row-cells {
        gap: 4px;
      }

      .at-tile {
        border-radius: 13px;
      }

      .at-logo-img {
        width: min(62%, 42px) !important;
        height: min(62%, 42px) !important;
      }

      .at-symbol-img {
        width: min(82%, 54px) !important;
        height: min(82%, 54px) !important;
      }

      .at-side-panel {
        padding: 4px 3px;
        gap: 3px;
      }

      .at-side-title {
        font-size: 5.8px;
      }

      .at-mult-pill {
        font-size: 9px;
        border-radius: 9px;
      }

      .at-result-bar {
        min-height: 42px;
        padding: 5px;
      }

      .at-result-label {
        font-size: 6px;
      }

      .at-result-value {
        font-size: 14px;
      }

      .at-cash-btn {
        height: 27px;
        font-size: 10px;
      }

      .at-current-mult {
        font-size: 6.4px;
      }

      .at-bet-field,
      .at-bet-quick {
        height: 35px;
      }

      .at-start-row {
        min-height: 70px;
      }

      .at-main-btn {
        width: 74px;
        height: 74px;
      }
    }

    @media (max-width: 390px) {
      .at-root {
        padding-left: 10px;
        padding-right: 10px;
      }

      .at-main-layout {
        grid-template-columns: 1fr 50px;
      }

      .at-mult-pill {
        font-size: 9px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .at-card-inner,
      .at-tile.bomb.picked-bomb,
      .at-final-card,
      .at-loading-orbit,
      .at-loading-apple,
      .at-loading-bomb,
      .at-loading-glow {
        animation: none !important;
        transition: none !important;
      }
    }

    ${ASSET_SIZE_CSS}
    ${FINAL_TIER_CSS}
  `}</style>
);

const LoadingScreen = ({ progress }: { progress: number }) => {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    barRef.current?.style.setProperty('--loadProgress', `${progress}%`);
  }, [progress]);

  return (
  <div className="at-loading">
    <div className="at-loading-glow" />

    <div className="at-loading-orbit">
      <div className="at-loading-apple">
        <AppleIcon size={50} />
      </div>

      <div className="at-loading-bomb">
        <BombIcon size={48} />
      </div>
    </div>

    <TrailTitle loading />

    <div ref={barRef} className="at-loading-bar">
      <span />
    </div>
  </div>
  );
};

const InfoModal = ({ bet, onClose }: { bet: number; onClose: () => void }) => {
  const { locale, tr } = useLanguage();

  return createPortal(<div className="at-modal-layer" onClick={onClose}>
    <div className="at-modal" onClick={(event) => event.stopPropagation()}>
      <div className="at-modal-grip" />

      <div className="at-modal-head">
        <div>
          <p>{tr('INFO', 'ИНФО')}</p>
          <h2>Apple Trail</h2>
        </div>

        <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}>
          <CloseIcon />
        </button>
      </div>

      <div className="at-modal-body">
        <section>
          <h3>{tr('How to play', 'Как играть')}</h3>
          <p>
            {tr(
              'Choose one closed tile in each row. An apple moves you higher and grows the multiplier; a bomb ends the round.',
              'На каждом ряду выбери одну закрытую плитку. Яблоко поднимает выше и увеличивает множитель, а бомба завершает раунд.',
            )}
          </p>
        </section>

        <section>
          <h3>{tr('When to cash out', 'Когда забирать')}</h3>
          <p>
            {tr(
              'Cash out after any successful pick. The higher you climb, the larger the multiplier and payout.',
              'После любого успешного выбора можно забрать выигрыш. Чем выше ты дошёл, тем больше множитель и выплата.',
            )}
          </p>

          <div className="at-info-mults">
            {MULTIPLIERS.map((multiplier) => (
              <span key={multiplier}>X{multiplier}</span>
            ))}
          </div>
        </section>

        <section>
          <h3>{tr('Bet', 'Ставка')}</h3>
          <p>
            {tr(
              `Current bet: ${formatMoney(bet, locale)} GAME. The server determines every tile before it is revealed.`,
              `Текущая ставка: ${formatMoney(bet, locale)} GAME. Результат каждой плитки определяет сервер до её открытия.`,
            )}
          </p>
        </section>
      </div>
    </div>
  </div>, document.body);
};

const FinalOverlay = ({
  phase,
  win,
  multiplier,
}: {
  phase: GamePhase;
  win: number;
  multiplier: number;
}) => {
  const { locale, tr } = useLanguage();
  const isLost = phase === 'lost';
  const isEpic = !isLost && multiplier >= 7;
  const isMega = !isLost && multiplier >= 3 && multiplier < 7;

  const tierClass = isLost ? 'is-lost' : isEpic ? 'is-epic' : isMega ? 'is-mega' : 'is-win';
  const effectCount = isLost ? 0 : isEpic ? 20 : isMega ? 14 : 8;

  return createPortal(
    <div className="at-final-layer">
      <div className={`at-final-card ${tierClass}`}>
        <div className="at-final-icon">
          {isLost ? <BombIcon size={68} /> : <AppleIcon size={70} />}
        </div>

        <div className="at-final-title">
          {isLost
            ? tr('BOMB!', 'БОМБА!')
            : isEpic
              ? tr('EPIC WIN', 'ЭПИЧЕСКИЙ ВЫИГРЫШ')
              : isMega
                ? tr('MEGA WIN', 'МЕГА ВЫИГРЫШ')
                : tr('WIN', 'ВЫИГРЫШ')}
        </div>

        <div className="at-final-value">{isLost ? '0' : formatMoney(win, locale)}</div>

        <div className="at-final-mult">{tr('Multiplier', 'Множитель')}: X{multiplier}</div>
        <div className="at-final-fx" aria-hidden="true">
          {Array.from({ length: effectCount }, (_, index) => <i key={index} style={{ '--at-fx': index } as CSSProperties} />)}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const Royal5x5SoloGame = () => {
  const { locale, tr } = useLanguage();
  const { canAfford, setError: setWalletError } = useSoloWallet();
  const session = useSoloSession('royal_5x5');
  const { markPublicStateHydrated, publicState, resumed, status, isSessionPlayable, openedSteps } = session;
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [bet, setBet] = useState(1);
  const [betInput, setBetInput] = useState('1');
  const [bombs, setBombs] = useState<number[]>(() => Array.from({ length: ROWS }, () => -1));
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [pickedByRow, setPickedByRow] = useState<Array<number | null>>(() =>
    Array.from({ length: ROWS }, () => null),
  );
  const [currentRow, setCurrentRow] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [muted, setMuted] = useState(() => localStorage.getItem('apple-trail-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [showFinal, setShowFinal] = useState(false);
  const [isRevealingAll, setIsRevealingAll] = useState(false);
  const [pendingTile, setPendingTile] = useState<string | null>(null);

  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  const revealRunRef = useRef(0);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const effectivePhase: GamePhase =
    session.sessionId && status === 'active' && isSessionPlayable ? 'playing' : phase;
  const effectiveBet =
    session.sessionId && status === 'active' && session.betCoins > 0
      ? session.betCoins
      : bet;

  const derivedPickedByRow = deriveRoyal5x5PickedByRow(
    publicState as Royal5x5PublicState | null,
    ROWS,
  );
  const derivedRevealed = deriveRoyal5x5Revealed(publicState as Royal5x5PublicState | null);
  const derivedCurrentRow = deriveRoyal5x5CurrentRow(
    publicState as Royal5x5PublicState | null,
    currentRow,
  );
  const effectivePickedByRow = isSessionPlayable ? pickedByRow : derivedPickedByRow;
  const effectiveRevealed = mergeRevealedSets(revealed, derivedRevealed);
  const effectiveRow =
    resumed && status === 'active' && !isSessionPlayable
      ? derivedCurrentRow
      : effectivePhase === 'playing'
        ? currentRow
        : openedSteps;

  const cashMultiplier = getCashoutMultiplier(effectiveRow);
  const nextMultiplier =
    effectivePhase === 'playing' ? MULTIPLIERS[effectiveRow] ?? cashMultiplier : cashMultiplier;
  const cashoutValue = roundMoney(effectiveBet * cashMultiplier);
  const canCashout =
    effectivePhase === 'playing' && effectiveRow > 0 && !isRevealingAll && pendingTile === null && !session.loading;
  const canStart = effectivePhase !== 'playing' && !isRevealingAll && !session.loading;

  useEffect(() => {
    if (!resumed || status !== 'active') return;
    const state = publicState as Royal5x5PublicState | null;
    if (!state) return;
    setPickedByRow(
      state.picked_by_row.map((value) => (value >= 0 ? value : null)),
    );
    setRevealed(deriveRoyal5x5Revealed(state));
    setCurrentRow(state.current_row);
    setPhase('playing');
    setPendingTile(null);
    markPublicStateHydrated();
  }, [markPublicStateHydrated, publicState, resumed, status]);

  const haptic = useCallback((kind: 'tap' | 'start' | 'apple' | 'bomb' | 'cash' | 'win') => {
    const tgHaptics = getTelegramHaptics();

    if (kind === 'bomb') tgHaptics?.notificationOccurred?.('error');
    else if (kind === 'cash' || kind === 'win') tgHaptics?.notificationOccurred?.('success');
    else if (kind === 'apple') tgHaptics?.impactOccurred?.('medium');
    else tgHaptics?.selectionChanged?.();

    if ('vibrate' in navigator) {
      const pattern: number | number[] =
        kind === 'bomb'
          ? [35, 28, 55]
          : kind === 'cash' || kind === 'win'
            ? [22, 22, 32]
            : kind === 'apple'
              ? 18
              : 8;

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
    (kind: 'tap' | 'start' | 'apple' | 'bomb' | 'cash' | 'win') => {
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

      if (kind === 'tap') {
        playTone(520, 0, 0.07, 0.025);
      }

      if (kind === 'start') {
        playTone(220, 0, 0.12, 0.024, 'triangle');
        playTone(330, 0.07, 0.12, 0.022, 'triangle');
      }

      if (kind === 'apple') {
        playTone(560, 0, 0.08, 0.025);
        playTone(780, 0.07, 0.11, 0.022);
      }

      if (kind === 'bomb') {
        playTone(120, 0, 0.2, 0.035, 'sawtooth');
        playTone(70, 0.07, 0.24, 0.032, 'triangle');
      }

      if (kind === 'cash') {
        [520, 720, 960].forEach((freq, index) => {
          playTone(freq, index * 0.08, 0.15, 0.026);
        });
      }

      if (kind === 'win') {
        [460, 620, 820, 1100].forEach((freq, index) => {
          playTone(freq, index * 0.09, 0.17, 0.028);
        });
      }
    },
    [getAudioContext],
  );

  const setBetValue = useCallback((value: number) => {
    const nextBet = Math.max(MIN_BET, Math.floor(value || MIN_BET));

    setBet(nextBet);
    setBetInput(String(nextBet));
  }, []);

  const revealAllByRows = useCallback(async (runId: number) => {
    setIsRevealingAll(true);

    for (let visualIndex = 0; visualIndex < ROWS; visualIndex += 1) {
      if (revealRunRef.current !== runId) return;

      const row = ROWS - 1 - visualIndex;

      await waitFrame();

      setRevealed((prev) => {
        const next = new Set(prev);

        for (let col = 0; col < COLS; col += 1) {
          next.add(makeCellKey(row, col));
        }

        return next;
      });

      await sleep(138);
    }

    await sleep(680);

    if (revealRunRef.current !== runId) return;

    setIsRevealingAll(false);
  }, []);

  const resetRound = useCallback(() => {
    revealRunRef.current += 1;

    setBombs(Array.from({ length: ROWS }, () => -1));
    setRevealed(new Set());
    setPickedByRow(Array.from({ length: ROWS }, () => null));
    setCurrentRow(0);
    setLastWin(0);
    setShowFinal(false);
    setIsRevealingAll(false);
    setPendingTile(null);
  }, []);

  const startRound = async () => {
    if (!canStart) return;
    if (!canAfford(bet)) {
      setWalletError('insufficient balance');
      return;
    }

    haptic('start');
    playSound('start');

    resetRound();
    session.reset();

    try {
      await session.start(bet);
      setPhase('playing');
    } catch {
      // error in session.error
    }
  };

  const endRound = useCallback(
    async (nextPhase: GamePhase, win: number, openedRows: number) => {
      const runId = revealRunRef.current + 1;
      revealRunRef.current = runId;

      setPhase(nextPhase);
      setLastWin(win);
      setShowFinal(false);
      setCurrentRow(openedRows);

      await revealAllByRows(runId);

      if (revealRunRef.current !== runId) return;

      if (nextPhase === 'completed') {
        haptic('win');
        playSound('win');
      }

      setShowFinal(true);

      window.setTimeout(() => {
        if (revealRunRef.current === runId) {
          setShowFinal(false);
        }
      }, nextPhase === 'lost' ? 1250 : 1550);
    },
    [haptic, playSound, revealAllByRows],
  );

  const pickTile = async (row: number, col: number) => {
    if (effectivePhase !== 'playing') return;
    if (isRevealingAll || session.loading || !isSessionPlayable) return;
    if (row !== effectiveRow) return;

    const key = makeCellKey(row, col);

    if (effectiveRevealed.has(key)) return;
    if (effectivePickedByRow[row] !== null) return;

    setPendingTile(key);

    try {
      const response = await session.step('pick', { row, col });
      const event = response.event as {
        safe: boolean;
        status: string;
        bombs?: number[];
        payout?: number;
        current_row?: number;
      };

      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      setPickedByRow((prev) => {
        const next = [...prev];
        next[row] = col;
        return next;
      });

      if (event.bombs?.length) {
        setBombs(event.bombs);
      }

      if (!event.safe || event.status === 'bust') {
        haptic('bomb');
        playSound('bomb');
        window.setTimeout(() => {
          void endRound('lost', response.payout_coins ?? 0, row);
        }, 760);
        return;
      }

      haptic('apple');
      playSound('apple');

      if (event.status === 'completed') {
        window.setTimeout(() => {
          void endRound('completed', response.payout_coins ?? 0, row + 1);
        }, 760);
        return;
      }

      window.setTimeout(() => {
        setCurrentRow(event.current_row ?? row + 1);
      }, 430);
    } catch {
      // session error shown elsewhere
    } finally {
      setPendingTile(null);
    }
  };

  const cashout = async () => {
    if (!canCashout) return;

    haptic('cash');
    playSound('cash');

    try {
      const response = await session.cashout();
      void endRound('cashed', response.payout_coins ?? 0, currentRow);
    } catch {
      // handled
    }
  };

  const handleBetInput = (value: string) => {
    if (effectivePhase === 'playing' || isRevealingAll) return;

    const cleaned = sanitizeBetInput(value);
    setBetInput(cleaned);

    const numeric = Number(cleaned);

    if (Number.isFinite(numeric) && numeric >= MIN_BET) {
      setBet(Math.floor(numeric));
    }
  };

  const commitBetInput = () => {
    const numeric = Number(betInput);

    if (!Number.isFinite(numeric) || numeric < MIN_BET) {
      setBetValue(MIN_BET);
      return;
    }

    setBetValue(numeric);
  };

  const chooseQuickBet = (value: number) => {
    if (effectivePhase === 'playing' || isRevealingAll) return;

    haptic('tap');
    playSound('tap');
    setBetValue(value);
  };

  const toggleMute = () => {
    haptic('tap');
    setMuted((value) => !value);
  };

  useEffect(() => {
    document.documentElement.classList.add('apple-trail-active');
    document.body.classList.add('apple-trail-active');

    return () => {
      document.documentElement.classList.remove('apple-trail-active');
      document.body.classList.remove('apple-trail-active');

      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
      revealRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('apple-trail-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 2000;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2.4);

      setLoadProgress(eased * 100);

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setLoading(false);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, []);

  if (loading) {
    return (
      <div className="at-root">
        <StyleBlock />
        <LoadingScreen progress={loadProgress} />
      </div>
    );
  }

  return (
    <div className="at-root">
      <StyleBlock />

      <div className="at-content">
        <div className="at-top">
          <button
            type="button"
            className="at-icon-btn"
            onClick={() => setShowInfo(true)}
            aria-label={tr('Information', 'Информация')}
          >
            <InfoIcon />
          </button>

          <div className="at-title-wrap">
            <TrailTitle />
          </div>

          <button
            type="button"
            className="at-icon-btn"
            onClick={toggleMute}
            aria-label={muted ? tr('Turn sound on', 'Включить звук') : tr('Turn sound off', 'Выключить звук')}
          >
            {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
          </button>
        </div>


        <div className="at-main-layout">
          <section className="at-board-shell">
            <div className="at-board">
              {Array.from({ length: ROWS }, (_, visualIndex) => {
                const row = ROWS - 1 - visualIndex;

                return (
                  <div className="at-row" key={row}>
                    <div className="at-row-cells">
                      {Array.from({ length: COLS }, (_, col) => {
                        const key = makeCellKey(row, col);
                        const isPending = pendingTile === key;
                        const isRevealed = effectiveRevealed.has(key) && !isPending;
                        const isBomb = bombs[row] === col;
                        const isPicked = effectivePickedByRow[row] === col;
                        const isAvailable =
                          effectivePhase === 'playing' &&
                          row === effectiveRow &&
                          !isRevealed &&
                           effectivePickedByRow[row] === null &&
                           !isRevealingAll &&
                           pendingTile === null &&
                           isSessionPlayable;
                        const isLocked =
                          effectivePhase === 'playing' && row !== effectiveRow && !isRevealed;
                        const shouldDim =
                          isRevealed &&
                          effectivePhase !== 'playing' &&
                          !isPicked &&
                          !(phase === 'lost' && isBomb);

                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => pickTile(row, col)}
                            data-tile={isBomb ? 'bomb' : 'apple'}
                            className={[
                              'at-tile',
                              isAvailable ? 'available' : '',
                              isPending ? 'pending' : '',
                              isLocked ? 'locked' : '',
                              isRevealed ? 'revealed' : '',
                              isRevealed && isBomb ? 'bomb' : '',
                              isRevealed && !isBomb ? 'apple' : '',
                              isBomb && isPicked && phase === 'lost' ? 'picked-bomb' : '',
                              shouldDim ? 'dimmed' : '',
                            ].join(' ')}
                            aria-label={tr(`Row ${row + 1}, tile ${col + 1}`, `Ряд ${row + 1}, плитка ${col + 1}`)}
                          >
                            <span className="at-card-inner">
                              <span className="at-card-face at-card-front">
                                <QuestionIcon size={44} />
                              </span>

                              <span className="at-card-face at-card-back">
                                {isBomb ? <BombIcon size={58} /> : <AppleIcon size={60} />}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="at-side-panel">
            <div className="at-side-title">{tr('WIN', 'ПРИЗ')}</div>

            {Array.from({ length: ROWS }, (_, visualIndex) => {
              const row = ROWS - 1 - visualIndex;
              const multiplier = MULTIPLIERS[row];
              const isReached = row < currentRow;
              const isActive = effectivePhase === 'playing' && row === effectiveRow;

              return (
                <div
                  key={multiplier}
                  className={[
                    'at-mult-pill',
                    isReached ? 'reached' : '',
                    isActive ? 'active' : '',
                  ].join(' ')}
                >
                  X{multiplier}
                </div>
              );
            })}
          </aside>
        </div>

        <div className="at-result-bar">
          <div className="at-result-card">
            <span className="at-result-label">{tr('Win', 'Выигрыш')}</span>
            <strong className="at-result-value">
              {effectivePhase === 'playing' ? formatMoney(cashoutValue, locale) : formatMoney(lastWin, locale)}
            </strong>
          </div>

          <div className="at-cash-wrap">
            <button
              type="button"
              className="at-cash-btn"
              disabled={!canCashout}
              onClick={cashout}
            >
              {tr('CASH OUT', 'ЗАБРАТЬ')}
            </button>

            <div className="at-current-mult">
              {tr('Now', 'Сейчас')}: <b>X{effectivePhase === 'playing' ? cashMultiplier : getCashoutMultiplier(effectiveRow)}</b>
              {' '} / {tr('Next', 'Далее')}: <b>X{nextMultiplier}</b>
            </div>
          </div>
        </div>

        <footer className="at-controls">
          <div className="at-bet-card">
            <label className="at-bet-field">
              <span className="at-bet-label">{tr('Bet', 'Ставка')}</span>

              <input
                className="at-bet-input"
                value={betInput}
                disabled={effectivePhase === 'playing' || isRevealingAll}
                onChange={(event) => handleBetInput(event.target.value)}
                onBlur={commitBetInput}
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                aria-label={tr('Bet', 'Ставка')}
              />
            </label>

            {QUICK_BETS.map((value) => (
              <button
                key={value}
                type="button"
                className="at-bet-quick"
                disabled={effectivePhase === 'playing' || isRevealingAll}
                onClick={() => chooseQuickBet(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="at-start-row">
            <button
              type="button"
              className="at-main-btn"
              disabled={!canStart}
              onClick={startRound}
            >
              <span className="at-main-ring" />
              <span className="at-main-core">
                <span className="at-main-title">{effectivePhase === 'playing' ? tr('PLAY', 'ИГРА') : tr('START', 'СТАРТ')}</span>
                <span className="at-main-subtitle">
                  {effectivePhase === 'playing' ? tr('Round active', 'Идёт раунд') : tr('Begin', 'Начать')}
                </span>
              </span>
            </button>
          </div>
        </footer>
      </div>

      {showFinal && (
        <FinalOverlay
          phase={phase}
          win={lastWin}
          multiplier={getCashoutMultiplier(currentRow)}
        />
      )}

      {showInfo && <InfoModal bet={bet} onClose={() => setShowInfo(false)} />}
    </div>
  );
};
