import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const ROWS = 7;
const COLS = 5;
const MIN_BET = 1;
const QUICK_BETS = [1, 5, 10, 25, 50, 100, 250, 500];
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

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

const makeCellKey = (row: number, col: number) => `${row}:${col}`;

const makeBombs = () =>
  Array.from({ length: ROWS }, () => Math.floor(Math.random() * COLS));

const revealAllCells = () => {
  const next = new Set<string>();

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      next.add(makeCellKey(row, col));
    }
  }

  return next;
};

const getCashoutMultiplier = (openedRows: number) => {
  if (openedRows <= 0) return 1;
  return MULTIPLIERS[Math.min(openedRows - 1, MULTIPLIERS.length - 1)];
};

const AppleIcon = ({ size = 52 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="appleBodyGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(35 28) rotate(48) scale(62)">
        <stop stopColor="#ffffff" />
        <stop offset="0.2" stopColor="#ff9f4e" />
        <stop offset="0.52" stopColor="#f83b25" />
        <stop offset="1" stopColor="#8f0e15" />
      </radialGradient>
      <linearGradient id="appleLeafGradient" x1="50" y1="12" x2="82" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#c9ff62" />
        <stop offset="0.5" stopColor="#59d02f" />
        <stop offset="1" stopColor="#176f20" />
      </linearGradient>
    </defs>

    <path
      d="M48 27C39 18 24 20 17 34C8 52 17 83 38 88C44 90 47 86 50 86C53 86 56 90 62 88C83 83 92 52 83 34C76 20 61 18 52 27C51 28 49 28 48 27Z"
      fill="url(#appleBodyGradient)"
      stroke="#ffcf82"
      strokeWidth="2.5"
    />
    <path
      d="M51 26C51 18 55 13 61 10"
      stroke="#7d4218"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M58 14C69 7 82 10 88 19C78 25 66 26 58 14Z"
      fill="url(#appleLeafGradient)"
      stroke="#c8ff70"
      strokeWidth="1.5"
    />
    <ellipse cx="34" cy="39" rx="10" ry="6" fill="white" opacity="0.46" transform="rotate(-25 34 39)" />
    <ellipse cx="43" cy="51" rx="4" ry="2.5" fill="white" opacity="0.22" transform="rotate(-20 43 51)" />
  </svg>
);

const BombIcon = ({ size = 52 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="bombBodyGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(34 28) rotate(48) scale(68)">
        <stop stopColor="#5e6075" />
        <stop offset="0.48" stopColor="#171826" />
        <stop offset="1" stopColor="#05050a" />
      </radialGradient>
      <radialGradient id="bombSparkGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(78 15) scale(24)">
        <stop stopColor="#ffffff" />
        <stop offset="0.25" stopColor="#fff075" />
        <stop offset="0.58" stopColor="#ff6d1c" />
        <stop offset="1" stopColor="#ff2555" />
      </radialGradient>
    </defs>

    <circle cx="48" cy="56" r="31" fill="url(#bombBodyGradient)" stroke="#8f91a5" strokeWidth="2.2" />
    <path d="M63 32C67 24 72 19 80 15" stroke="#8f91a5" strokeWidth="5" strokeLinecap="round" />
    <path d="M75 11L80 17L88 13L84 21L91 27L82 26L78 35L75 26L66 25L73 20Z" fill="url(#bombSparkGradient)" />
    <ellipse cx="35" cy="43" rx="10" ry="7" fill="white" opacity="0.14" transform="rotate(-30 35 43)" />
    <path d="M38 56H58" stroke="#07070c" strokeWidth="4" strokeLinecap="round" opacity="0.48" />
  </svg>
);

const QuestionIcon = ({ size = 38 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path
      d="M50 81C44 81 39 76 39 70C39 64 44 59 50 59C56 59 61 64 61 70C61 76 56 81 50 81Z"
      fill="#ffe3a5"
    />
    <path
      d="M31 35C33 23 43 16 56 18C69 20 77 29 76 41C75 50 69 56 59 61C55 63 53 66 53 70H42C42 61 46 55 55 50C62 46 65 43 65 39C66 34 62 30 55 29C48 28 43 31 42 38L31 35Z"
      fill="#ffe3a5"
    />
  </svg>
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

    body.apple-trail-active .solo-main,
    body.apple-trail-active .royal-apple-main {
      overflow: hidden !important;
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
      min-height: 100%;
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      padding: 4px 12px calc(12px + env(safe-area-inset-bottom, 0px));
      display: flex;
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
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .at-top {
      display: grid;
      grid-template-columns: 46px 1fr 46px;
      align-items: center;
      gap: 9px;
    }

    .at-icon-btn {
      width: 44px;
      height: 44px;
      border-radius: 18px;
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
        0 10px 22px rgba(0,0,0,.24);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .at-icon-btn:active,
    .at-tile:active,
    .at-bet-btn:active,
    .at-bet-chip:active,
    .at-cash-btn:active,
    .at-main-btn:active,
    .at-side-btn:active {
      transform: scale(.95) translateZ(0);
      filter: brightness(1.08);
    }

    .at-title-wrap {
      min-width: 0;
      text-align: center;
    }

    .at-title {
      margin: 0;
      font-size: 27px;
      line-height: .92;
      letter-spacing: .03em;
      color: #ffefaa;
      text-shadow:
        0 3px 0 #7a1c13,
        0 7px 12px rgba(0, 0, 0, .58),
        0 0 24px rgba(105, 255, 83, .22);
    }

    .at-title span {
      color: #ff6538;
      text-shadow:
        0 3px 0 #6b120e,
        0 7px 12px rgba(0, 0, 0, .58),
        0 0 20px rgba(255, 96, 45, .30);
    }

    .at-subtitle {
      margin: 3px 0 0;
      color: rgba(201, 255, 98, .78);
      font-size: 8px;
      letter-spacing: .18em;
      text-transform: uppercase;
    }

    .at-main-layout {
      min-height: 0;
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 78px;
      gap: 8px;
      align-items: stretch;
    }

    .at-board-shell {
      position: relative;
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
        0 16px 34px rgba(0,0,0,.30),
        0 0 24px rgba(108, 255, 83, .08);
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
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 7px;
      min-height: 0;
      align-items: center;
    }

    .at-row-badge {
      position: relative;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: rgba(255,255,255,.72);
      font-size: 13px;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.12), transparent 45%),
        rgba(39, 17, 35, .82);
      border: 1px solid rgba(255, 174, 88, .18);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 6px 12px rgba(0,0,0,.18);
    }

    .at-row-badge.active {
      color: #1d1009;
      background: linear-gradient(180deg, #fff1a7, #ffb548);
      box-shadow:
        0 0 16px rgba(255, 181, 72, .35),
        inset 0 1px 0 rgba(255,255,255,.55);
    }

    .at-row-badge.done {
      color: #09200d;
      background: linear-gradient(180deg, #c9ff62, #58de46);
      box-shadow: 0 0 15px rgba(93, 225, 69, .25);
    }

    .at-row-cells {
      display: grid;
      grid-template-columns: repeat(${COLS}, minmax(0, 1fr));
      gap: 6px;
      min-height: 0;
    }

    .at-tile {
      position: relative;
      min-width: 0;
      aspect-ratio: 1;
      border-radius: 16px;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 35% 10%, rgba(255,255,255,.12), transparent 40%),
        linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.022)),
        rgba(59, 23, 48, .78);
      border: 1px solid rgba(255, 156, 91, .17);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        inset 0 -5px 10px rgba(0,0,0,.18);
      transform: translateZ(0);
      transition:
        transform .12s ease,
        border-color .18s ease,
        filter .18s ease,
        opacity .18s ease,
        box-shadow .18s ease;
      contain: layout paint style;
    }

    .at-tile.available {
      cursor: pointer;
      border-color: rgba(255, 207, 94, .36);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 0 14px rgba(255, 207, 94, .12),
        inset 0 -5px 10px rgba(0,0,0,.18);
    }

    .at-tile.available::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 14px;
      pointer-events: none;
      border: 1px solid rgba(255, 226, 122, .18);
      opacity: .75;
    }

    .at-tile.locked {
      opacity: .58;
      filter: saturate(.78) brightness(.86);
    }

    .at-tile.revealed {
      animation: atFlip .25s ease-out both;
    }

    .at-tile.apple {
      border-color: rgba(186, 255, 94, .55);
      background:
        radial-gradient(circle at 50% 20%, rgba(201,255,98,.18), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.024)),
        rgba(50, 24, 41, .82);
      box-shadow:
        0 0 17px rgba(129, 255, 94, .18),
        inset 0 1px 0 rgba(255,255,255,.10);
    }

    .at-tile.bomb {
      border-color: rgba(255, 64, 64, .58);
      background:
        radial-gradient(circle at 50% 22%, rgba(255,68,68,.22), transparent 43%),
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)),
        rgba(42, 12, 22, .88);
      animation: atBombShake .38s ease-out both;
      box-shadow:
        0 0 24px rgba(255, 38, 56, .26),
        inset 0 1px 0 rgba(255,255,255,.10);
    }

    .at-tile.dimmed {
      opacity: .48;
      filter: saturate(.7) brightness(.72);
    }

    .at-tile-content {
      position: relative;
      z-index: 2;
      display: grid;
      place-items: center;
      transform: translateZ(0);
    }

    .at-tile.hidden-tile .at-tile-content {
      opacity: .86;
    }

    .at-tile.apple .at-tile-content {
      animation: atApplePop .32s cubic-bezier(.22, 1.25, .28, 1) both;
    }

    .at-tile.bomb .at-tile-content {
      animation: atBombPop .34s cubic-bezier(.22, 1.25, .28, 1) both;
    }

    @keyframes atFlip {
      0% {
        transform: scale(.93) rotateX(22deg) translateZ(0);
      }

      100% {
        transform: scale(1) rotateX(0) translateZ(0);
      }
    }

    @keyframes atApplePop {
      0% {
        transform: scale(.35) translateZ(0);
        opacity: 0;
      }

      80% {
        transform: scale(1.12) translateZ(0);
        opacity: 1;
      }

      100% {
        transform: scale(1) translateZ(0);
      }
    }

    @keyframes atBombPop {
      0% {
        transform: scale(.35) rotate(-12deg) translateZ(0);
        opacity: 0;
      }

      80% {
        transform: scale(1.12) rotate(8deg) translateZ(0);
        opacity: 1;
      }

      100% {
        transform: scale(1) rotate(0) translateZ(0);
      }
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
      border-radius: 24px;
      padding: 8px;
      background:
        radial-gradient(circle at 50% 0%, rgba(255, 207, 94, .10), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.024)),
        rgba(22, 13, 31, .82);
      border: 1px solid rgba(255, 174, 88, .18);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 14px 28px rgba(0,0,0,.24);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .at-side-title {
      text-align: center;
      color: rgba(255, 210, 158, .68);
      font-size: 8px;
      letter-spacing: .12em;
      text-transform: uppercase;
      padding: 2px 0;
    }

    .at-mult-pill {
      flex: 1;
      min-height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,.52);
      font-size: 15px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.018)),
        rgba(255,255,255,.026);
      border: 1px solid rgba(255,255,255,.055);
      transition:
        transform .18s ease,
        color .18s ease,
        background .18s ease,
        box-shadow .18s ease,
        border-color .18s ease;
    }

    .at-mult-pill.reached {
      color: #b9ff74;
      border-color: rgba(139, 255, 91, .26);
      background:
        radial-gradient(circle at 50% 0%, rgba(121, 255, 93, .12), transparent 48%),
        rgba(36, 72, 30, .22);
    }

    .at-mult-pill.active {
      color: #201005;
      background: linear-gradient(180deg, #fff1a8, #ffb548);
      border-color: rgba(255, 229, 129, .78);
      box-shadow:
        0 0 18px rgba(255, 186, 72, .34),
        inset 0 1px 0 rgba(255,255,255,.52);
      transform: scale(1.035);
    }

    .at-result-bar {
      min-height: 62px;
      border-radius: 24px;
      padding: 8px;
      display: grid;
      grid-template-columns: 1fr minmax(124px, .82fr);
      gap: 8px;
      background:
        radial-gradient(circle at 82% 50%, rgba(119, 255, 91, .12), transparent 38%),
        linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.024)),
        rgba(24, 11, 30, .78);
      border: 1px solid rgba(255, 174, 88, .15);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 10px 22px rgba(0,0,0,.21);
    }

    .at-result-card {
      min-width: 0;
      padding: 8px 11px;
      border-radius: 18px;
      background: rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.055);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .at-result-label {
      color: rgba(255, 210, 158, .62);
      font-size: 8px;
      letter-spacing: .14em;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .at-result-value {
      margin-top: 5px;
      color: #ffd15f;
      font-size: 21px;
      line-height: 1;
      text-shadow: 0 0 14px rgba(255, 203, 89, .24);
      font-variant-numeric: tabular-nums;
    }

    .at-cash-wrap {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .at-cash-btn {
      height: 39px;
      border-radius: 17px;
      color: #082009;
      font-size: 15px;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.42), transparent 44%),
        linear-gradient(180deg, #a5ff72, #38b936);
      border: 1px solid rgba(196, 255, 133, .68);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.48),
        0 0 16px rgba(103, 255, 76, .22);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .at-cash-btn:disabled {
      opacity: .46;
      color: rgba(255,255,255,.36);
      background:
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)),
        rgba(255,255,255,.04);
      border-color: rgba(255,255,255,.06);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    }

    .at-current-mult {
      text-align: center;
      color: rgba(255, 238, 180, .62);
      font-size: 9px;
      line-height: 1.25;
    }

    .at-current-mult b {
      color: #fff1a8;
    }

    .at-controls {
      display: grid;
      gap: 8px;
    }

    .at-bet-card {
      display: grid;
      gap: 7px;
      border-radius: 22px;
      padding: 8px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
        rgba(31, 13, 30, .80);
      border: 1px solid rgba(255, 174, 88, .18);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.09),
        0 10px 20px rgba(0,0,0,.22);
    }

    .at-bet-row {
      display: grid;
      grid-template-columns: 45px 42px 1fr 42px 45px;
      align-items: center;
      gap: 6px;
    }

    .at-bet-btn {
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

    .at-bet-btn.main {
      font-size: 20px;
    }

    .at-bet-btn:disabled {
      opacity: .38;
    }

    .at-bet-value {
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

    .at-bet-label {
      margin-bottom: 2px;
      color: rgba(255, 210, 158, .60);
      font-size: 7px;
      line-height: 1.1;
      letter-spacing: .17em;
      text-transform: uppercase;
    }

    .at-bet-number {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
      font-size: 17px;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }

    .at-bet-chip-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .at-bet-chip {
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

    .at-bet-chip.active {
      color: #1a1024;
      background: linear-gradient(180deg, #fff3bd, #ffb347);
      border-color: rgba(255, 211, 77, .45);
      box-shadow: 0 0 14px rgba(255, 179, 71, .18);
    }

    .at-bottom-actions {
      display: grid;
      grid-template-columns: 76px 1fr 76px;
      align-items: center;
      gap: 10px;
    }

    .at-side-btn {
      height: 62px;
      border-radius: 21px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      align-items: center;
      justify-content: center;
      color: rgba(220,202,255,.72);
      background:
        linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.024)),
        rgba(27, 14, 38, .78);
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 9px 20px rgba(0,0,0,.20);
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .at-side-btn span {
      color: rgba(255,255,255,.72);
      font-size: 9px;
      letter-spacing: .1em;
    }

    .at-side-btn.on {
      color: #082011;
      background: linear-gradient(180deg, #b7ffd0, #3ddc84);
      border-color: rgba(159,255,196,.72);
      box-shadow: 0 0 16px rgba(61,220,132,.20);
    }

    .at-auto-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: rgba(220,202,255,.34);
    }

    .at-side-btn.on .at-auto-dot {
      background: #082011;
      animation: atAutoBlink 1s ease-in-out infinite;
    }

    @keyframes atAutoBlink {
      50% {
        opacity: .36;
      }
    }

    .at-main-btn {
      position: relative;
      justify-self: center;
      width: 98px;
      height: 98px;
      border-radius: 999px;
      color: #231006;
      background: transparent;
      transition: transform .1s ease, filter .1s ease, opacity .1s ease;
    }

    .at-main-btn:disabled {
      opacity: .82;
    }

    .at-main-ring {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: conic-gradient(from 0deg, #fff1a8, #ffb548, #ff5b2d, #ff2b58, #fff1a8);
      box-shadow:
        0 0 23px rgba(255, 181, 72, .42),
        0 0 34px rgba(255, 52, 44, .20);
      animation: atSpin 5s linear infinite;
    }

    .at-main-core {
      position: absolute;
      inset: 7px;
      border-radius: inherit;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(circle at 38% 28%, #fff6c2, #ffca58 56%, #e26e17);
      box-shadow:
        inset 0 2px 7px rgba(255,255,255,.54),
        inset 0 -7px 12px rgba(90,42,0,.34);
    }

    .at-main-title {
      font-size: 16px;
      line-height: 1;
    }

    .at-main-subtitle {
      margin-top: 4px;
      font-size: 7.5px;
      line-height: 1.18;
      letter-spacing: .09em;
      color: rgba(35, 16, 6, .78);
      text-transform: uppercase;
    }

    @keyframes atSpin {
      to {
        transform: rotate(360deg);
      }
    }

    .at-final-layer {
      position: fixed;
      inset: 0;
      z-index: 85;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 45%, rgba(48, 15, 55, .68), rgba(5, 2, 8, .92));
      animation: atFade .18s ease-out both;
      pointer-events: none;
    }

    .at-final-card {
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
      margin-top: 8px;
      color: rgba(255, 239, 188, .76);
      font-size: 12px;
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

    .at-modal-layer {
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
        padding-top: 2px;
        padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      }

      .at-title {
        font-size: 23px;
      }

      .at-subtitle {
        display: none;
      }

      .at-main-layout {
        grid-template-columns: 1fr 72px;
        gap: 7px;
      }

      .at-board-shell {
        padding: 8px;
        border-radius: 22px;
      }

      .at-row {
        grid-template-columns: 30px 1fr;
        gap: 6px;
      }

      .at-row-badge {
        width: 30px;
        height: 30px;
        font-size: 12px;
      }

      .at-row-cells {
        gap: 5px;
      }

      .at-tile {
        border-radius: 14px;
      }

      .at-result-bar {
        min-height: 56px;
        border-radius: 21px;
      }

      .at-result-value {
        font-size: 18px;
      }

      .at-cash-btn {
        height: 36px;
        font-size: 13px;
      }

      .at-bet-card {
        padding: 6px;
      }

      .at-bet-row {
        grid-template-columns: 42px 38px 1fr 38px 42px;
        gap: 5px;
      }

      .at-bet-btn {
        height: 38px;
        border-radius: 14px;
        font-size: 12px;
      }

      .at-bet-btn.main {
        font-size: 18px;
      }

      .at-bet-value {
        height: 38px;
      }

      .at-bet-chip {
        height: 26px;
        font-size: 8px;
      }

      .at-bottom-actions {
        grid-template-columns: 70px 1fr 70px;
        gap: 8px;
      }

      .at-side-btn {
        height: 54px;
        border-radius: 18px;
      }

      .at-main-btn {
        width: 84px;
        height: 84px;
      }

      .at-main-title {
        font-size: 14px;
      }

      .at-main-subtitle {
        font-size: 6.8px;
      }
    }

    @media (max-width: 390px) {
      .at-root {
        padding-left: 10px;
        padding-right: 10px;
      }

      .at-main-layout {
        grid-template-columns: 1fr 66px;
      }

      .at-side-title {
        font-size: 7px;
      }

      .at-mult-pill {
        min-height: 35px;
        font-size: 13px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .at-main-ring,
      .at-side-btn.on .at-auto-dot,
      .at-tile.revealed,
      .at-tile.bomb,
      .at-tile.apple .at-tile-content,
      .at-tile.bomb .at-tile-content,
      .at-final-card {
        animation: none !important;
      }
    }
  `}</style>
);

const InfoModal = ({ bet, onClose }: { bet: number; onClose: () => void }) => (
  <div className="at-modal-layer" onClick={onClose}>
    <div className="at-modal" onClick={(event) => event.stopPropagation()}>
      <div className="at-modal-grip" />

      <div className="at-modal-head">
        <div>
          <p>INFO</p>
          <h2>Apple Trail</h2>
        </div>

        <button type="button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="at-modal-body">
        <section>
          <h3>Как играется</h3>
          <p>
            На каждом ряду выбери одно закрытое яблоко. Если внутри яблоко — проходишь выше и
            множитель растёт. Если попалась бомба — раунд проигран.
          </p>
        </section>

        <section>
          <h3>Когда забирать</h3>
          <p>
            После любого успешного выбора можно нажать «Забрать». Чем выше ты дошёл, тем больше
            множитель и итоговый выигрыш.
          </p>

          <div className="at-info-mults">
            {MULTIPLIERS.map((multiplier) => (
              <span key={multiplier}>X{multiplier}</span>
            ))}
          </div>
        </section>

        <section>
          <h3>Ставка</h3>
          <p>
            Текущая ставка: {formatMoney(bet)}. Кнопка запуска сейчас не привязана к беку и не
            списывает баланс — это локальная механика для проверки игры.
          </p>
        </section>
      </div>
    </div>
  </div>
);

const FinalOverlay = ({
  phase,
  win,
  multiplier,
}: {
  phase: GamePhase;
  win: number;
  multiplier: number;
}) => {
  const isLost = phase === 'lost';
  const isEpic = !isLost && multiplier >= 7;
  const isMega = !isLost && multiplier >= 3 && multiplier < 7;

  return (
    <div className="at-final-layer">
      <div
        className="at-final-card"
        style={
          {
            '--finalGlow': isLost
              ? 'rgba(255, 45, 59, .28)'
              : isEpic
                ? 'rgba(113, 255, 97, .34)'
                : isMega
                  ? 'rgba(202, 116, 255, .32)'
                  : 'rgba(255, 190, 72, .30)',
            '--finalGlowSoft': isLost
              ? 'rgba(255, 45, 59, .26)'
              : isEpic
                ? 'rgba(113, 255, 97, .28)'
                : isMega
                  ? 'rgba(202, 116, 255, .24)'
                  : 'rgba(255, 190, 72, .24)',
            '--finalText': isLost ? '#ff6673' : isEpic ? '#9dff83' : isMega ? '#d79cff' : '#fff1a8',
          } as CSSProperties
        }
      >
        <div className="at-final-icon">
          {isLost ? <BombIcon size={68} /> : <AppleIcon size={70} />}
        </div>

        <div className="at-final-title">
          {isLost ? 'BOMB!' : isEpic ? 'EPIC WIN' : isMega ? 'MEGA WIN' : 'WIN'}
        </div>

        <div className="at-final-value">{isLost ? '0' : formatMoney(win)}</div>

        <div className="at-final-mult">Multiplier: X{multiplier}</div>
      </div>
    </div>
  );
};

export const Royal5x5SoloGame = () => {
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [bet, setBet] = useState(1);
  const [bombs, setBombs] = useState<number[]>(() => makeBombs());
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [pickedByRow, setPickedByRow] = useState<Array<number | null>>(() =>
    Array.from({ length: ROWS }, () => null),
  );
  const [currentRow, setCurrentRow] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('apple-trail-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [showFinal, setShowFinal] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  const phaseRef = useRef<GamePhase>(phase);

  mutedRef.current = muted;
  phaseRef.current = phase;

  const cashMultiplier = getCashoutMultiplier(currentRow);
  const nextMultiplier = phase === 'playing' ? MULTIPLIERS[currentRow] ?? cashMultiplier : cashMultiplier;
  const cashoutValue = roundMoney(bet * cashMultiplier);
  const canCashout = phase === 'playing' && currentRow > 0;

  const statusLabel = useMemo(() => {
    if (phase === 'idle') return 'Выбери ставку и начни раунд';
    if (phase === 'playing') return `Выбери яблоко на ряду ${currentRow + 1}`;
    if (phase === 'lost') return 'Бомба! Раунд проигран';
    if (phase === 'completed') return 'Ты дошёл до верха';
    return 'Выигрыш забран';
  }, [currentRow, phase]);

  const haptic = useCallback((kind: 'tap' | 'start' | 'apple' | 'bomb' | 'cash' | 'win') => {
    const tgHaptics = getTelegramHaptics();

    if (kind === 'bomb') tgHaptics?.notificationOccurred?.('error');
    else if (kind === 'cash' || kind === 'win') tgHaptics?.notificationOccurred?.('success');
    else if (kind === 'apple') tgHaptics?.impactOccurred?.('medium');
    else tgHaptics?.selectionChanged?.();

    if ('vibrate' in navigator) {
      const pattern: VibratePattern =
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

  const resetRound = useCallback(() => {
    setBombs(makeBombs());
    setRevealed(new Set());
    setPickedByRow(Array.from({ length: ROWS }, () => null));
    setCurrentRow(0);
    setLastWin(0);
    setShowFinal(false);
  }, []);

  const startRound = () => {
    if (phase === 'playing') return;

    haptic('start');
    playSound('start');

    resetRound();
    setPhase('playing');
  };

  const endRound = useCallback(
    (nextPhase: GamePhase, win: number) => {
      setPhase(nextPhase);
      setLastWin(win);
      setRevealed(revealAllCells());
      setShowFinal(true);

      window.setTimeout(() => {
        setShowFinal(false);
      }, nextPhase === 'lost' ? 1250 : 1550);
    },
    [],
  );

  const pickTile = (row: number, col: number) => {
    if (phase !== 'playing') return;
    if (row !== currentRow) return;

    const key = makeCellKey(row, col);

    if (revealed.has(key)) return;

    const isBomb = bombs[row] === col;

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

    if (isBomb) {
      haptic('bomb');
      playSound('bomb');

      window.setTimeout(() => {
        endRound('lost', 0);
      }, 360);

      return;
    }

    haptic('apple');
    playSound('apple');

    const nextRow = row + 1;

    if (nextRow >= ROWS) {
      const win = roundMoney(bet * MULTIPLIERS[ROWS - 1]);

      window.setTimeout(() => {
        haptic('win');
        playSound('win');
        setCurrentRow(nextRow);
        endRound('completed', win);
      }, 320);

      return;
    }

    setCurrentRow(nextRow);
  };

  const cashout = () => {
    if (!canCashout) return;

    const win = roundMoney(bet * cashMultiplier);

    haptic('cash');
    playSound('cash');
    endRound('cashed', win);
  };

  const changeBet = (delta: number) => {
    if (phase === 'playing') return;

    haptic('tap');
    playSound('tap');

    setBet((value) => Math.max(MIN_BET, value + delta));
  };

  const chooseBet = (value: number) => {
    if (phase === 'playing') return;

    haptic('tap');
    playSound('tap');
    setBet(value);
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
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('apple-trail-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    if (!auto || phase !== 'playing') return undefined;

    const timer = window.setTimeout(() => {
      const safeChoices = Array.from({ length: COLS }, (_, col) => col).filter(
        (col) => col !== bombs[currentRow],
      );

      const selected = safeChoices[Math.floor(Math.random() * safeChoices.length)];

      pickTile(currentRow, selected);
    }, 620);

    return () => window.clearTimeout(timer);
  }, [auto, bombs, currentRow, phase]);

  return (
    <div className="at-root">
      <StyleBlock />

      <div className="at-content">
        <div className="at-top">
          <button
            type="button"
            className="at-icon-btn"
            onClick={() => setShowInfo(true)}
            aria-label="Info"
          >
            <InfoIcon />
          </button>

          <div className="at-title-wrap">
            <h1 className="at-title">
              APPLE <span>TRAIL</span>
            </h1>
            <p className="at-subtitle">{statusLabel}</p>
          </div>

          <button
            type="button"
            className="at-icon-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          >
            {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
          </button>
        </div>

        <div className="at-main-layout">
          <section className="at-board-shell">
            <div className="at-board">
              {Array.from({ length: ROWS }, (_, visualIndex) => {
                const row = ROWS - 1 - visualIndex;
                const isActiveRow = phase === 'playing' && row === currentRow;
                const isDoneRow = row < currentRow;

                return (
                  <div className="at-row" key={row}>
                    <div
                      className={[
                        'at-row-badge',
                        isActiveRow ? 'active' : '',
                        isDoneRow ? 'done' : '',
                      ].join(' ')}
                    >
                      {row + 1}
                    </div>

                    <div className="at-row-cells">
                      {Array.from({ length: COLS }, (_, col) => {
                        const key = makeCellKey(row, col);
                        const isRevealed = revealed.has(key);
                        const isBomb = bombs[row] === col;
                        const isPicked = pickedByRow[row] === col;
                        const isAvailable = phase === 'playing' && row === currentRow && !isRevealed;
                        const isLocked = phase === 'playing' && row !== currentRow && !isRevealed;
                        const shouldDim =
                          isRevealed &&
                          phase !== 'playing' &&
                          !isPicked &&
                          !(phase === 'lost' && isBomb);

                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => pickTile(row, col)}
                            className={[
                              'at-tile',
                              isAvailable ? 'available' : '',
                              isLocked ? 'locked' : '',
                              isRevealed ? 'revealed' : 'hidden-tile',
                              isRevealed && isBomb ? 'bomb' : '',
                              isRevealed && !isBomb ? 'apple' : '',
                              shouldDim ? 'dimmed' : '',
                            ].join(' ')}
                            aria-label={`Row ${row + 1}, tile ${col + 1}`}
                          >
                            <span className="at-tile-content">
                              {isRevealed ? (
                                isBomb ? (
                                  <BombIcon size={52} />
                                ) : (
                                  <AppleIcon size={52} />
                                )
                              ) : (
                                <QuestionIcon size={34} />
                              )}
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
            <div className="at-side-title">WIN</div>

            {Array.from({ length: ROWS }, (_, visualIndex) => {
              const row = ROWS - 1 - visualIndex;
              const multiplier = MULTIPLIERS[row];
              const isReached = row < currentRow;
              const isActive = phase === 'playing' && row === currentRow;

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
            <span className="at-result-label">Выигрыш</span>
            <strong className="at-result-value">
              {phase === 'playing' ? formatMoney(cashoutValue) : formatMoney(lastWin)}
            </strong>
          </div>

          <div className="at-cash-wrap">
            <button
              type="button"
              className="at-cash-btn"
              disabled={!canCashout}
              onClick={cashout}
            >
              ЗАБРАТЬ
            </button>

            <div className="at-current-mult">
              Текущий множитель: <b>X{phase === 'playing' ? cashMultiplier : getCashoutMultiplier(currentRow)}</b>
              <br />
              Следующий: <b>X{nextMultiplier}</b>
            </div>
          </div>
        </div>

        <footer className="at-controls">
          <div className="at-bet-card">
            <div className="at-bet-row">
              <button
                type="button"
                className="at-bet-btn"
                disabled={phase === 'playing' || bet <= MIN_BET}
                onClick={() => changeBet(-10)}
              >
                -10
              </button>

              <button
                type="button"
                className="at-bet-btn main"
                disabled={phase === 'playing' || bet <= MIN_BET}
                onClick={() => changeBet(-1)}
              >
                -
              </button>

              <div className="at-bet-value">
                <span className="at-bet-label">Ставка</span>
                <span className="at-bet-number">{formatMoney(bet)}</span>
              </div>

              <button
                type="button"
                className="at-bet-btn main"
                disabled={phase === 'playing'}
                onClick={() => changeBet(1)}
              >
                +
              </button>

              <button
                type="button"
                className="at-bet-btn"
                disabled={phase === 'playing'}
                onClick={() => changeBet(10)}
              >
                +10
              </button>
            </div>

            <div className="at-bet-chip-row">
              {QUICK_BETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`at-bet-chip ${bet === value ? 'active' : ''}`}
                  disabled={phase === 'playing'}
                  onClick={() => chooseBet(value)}
                >
                  {formatMoney(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="at-bottom-actions">
            <button
              type="button"
              className={`at-side-btn ${auto ? 'on' : ''}`}
              onClick={() => {
                haptic('tap');
                playSound('tap');
                setAuto((value) => !value);
              }}
            >
              <span className="at-auto-dot" />
              <span>AUTO</span>
            </button>

            <button
              type="button"
              className="at-main-btn"
              onClick={phase === 'playing' ? cashout : startRound}
            >
              <span className="at-main-ring" />
              <span className="at-main-core">
                <span className="at-main-title">{phase === 'playing' ? 'TAKE' : 'START'}</span>
                <span className="at-main-subtitle">
                  {phase === 'playing' ? 'Забрать' : 'Выбрать яблоко'}
                </span>
              </span>
            </button>

            <button
              type="button"
              className="at-side-btn"
              onClick={toggleMute}
              aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            >
              {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
              <span>{muted ? 'OFF' : 'ON'}</span>
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