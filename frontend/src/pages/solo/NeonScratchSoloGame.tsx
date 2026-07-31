import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import { useLanguage } from '../../i18n/LanguageContext';

import loadingCardImg from '../../assets/solo/scratch/loading-card.webp';
import titleImg from '../../assets/solo/scratch/title.webp';
import iconDiamondImg from '../../assets/solo/scratch/icon-diamond.webp';
import iconCoinImg from '../../assets/solo/scratch/icon-coin.webp';
import iconCloverImg from '../../assets/solo/scratch/icon-clover.webp';
import iconOrbImg from '../../assets/solo/scratch/icon-orb.webp';
import iconStarImg from '../../assets/solo/scratch/icon-star.webp';
import iconCrownImg from '../../assets/solo/scratch/icon-crown.webp';

const MIN_BET = 1;
const QUICK_BETS = [10, 100];
const CARD_COUNT = 3;
const SCRATCH_THRESHOLD = 36;

type GamePhase = 'idle' | 'scratching' | 'finished';

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

type ScratchIconKey = 'diamond' | 'coin' | 'clover' | 'orb' | 'star' | 'crown';

type PrizeDef = {
  id: string;
  label: string;
  multiplier: number;
  weight: number;
  icon: ScratchIconKey;
  tone: string;
  glow: string;
  text: string;
};

type ScratchCardData = {
  id: number;
  index: number;
  prize: PrizeDef;
};

const PRIZES: PrizeDef[] = [
  {
    id: 'zero',
    label: 'MISS',
    multiplier: 0,
    weight: 30,
    icon: 'diamond',
    tone: '#768194',
    glow: 'rgba(141, 151, 171, .20)',
    text: 'rgba(231, 238, 255, .72)',
  },
  {
    id: 'x02',
    label: 'X0.2',
    multiplier: 0.2,
    weight: 18,
    icon: 'diamond',
    tone: '#5c8dff',
    glow: 'rgba(92, 141, 255, .22)',
    text: '#a9c2ff',
  },
  {
    id: 'x03',
    label: 'X0.3',
    multiplier: 0.3,
    weight: 16,
    icon: 'diamond',
    tone: '#5cd6ff',
    glow: 'rgba(83, 215, 255, .24)',
    text: '#9feaff',
  },
  {
    id: 'x05',
    label: 'X0.5',
    multiplier: 0.5,
    weight: 14,
    icon: 'diamond',
    tone: '#5cffd1',
    glow: 'rgba(92, 255, 209, .24)',
    text: '#a5ffe8',
  },
  {
    id: 'x07',
    label: 'X0.7',
    multiplier: 0.7,
    weight: 12,
    icon: 'diamond',
    tone: '#8dff80',
    glow: 'rgba(141, 255, 128, .25)',
    text: '#baff9c',
  },
  {
    id: 'x1',
    label: 'X1',
    multiplier: 1,
    weight: 10,
    icon: 'coin',
    tone: '#ffe26f',
    glow: 'rgba(255, 226, 111, .27)',
    text: '#fff1a8',
  },
  {
    id: 'x13',
    label: 'X1.3',
    multiplier: 1.3,
    weight: 8,
    icon: 'coin',
    tone: '#c7ff58',
    glow: 'rgba(199, 255, 88, .27)',
    text: '#ddff91',
  },
  {
    id: 'x15',
    label: 'X1.5',
    multiplier: 1.5,
    weight: 7,
    icon: 'coin',
    tone: '#73ff5f',
    glow: 'rgba(115, 255, 95, .28)',
    text: '#aaff9c',
  },
  {
    id: 'x2',
    label: 'X2',
    multiplier: 2,
    weight: 6,
    icon: 'clover',
    tone: '#43ff5e',
    glow: 'rgba(67, 255, 94, .30)',
    text: '#adffb9',
  },
  {
    id: 'x3',
    label: 'X3',
    multiplier: 3,
    weight: 5,
    icon: 'clover',
    tone: '#7aff44',
    glow: 'rgba(122, 255, 68, .32)',
    text: '#cbff9e',
  },
  {
    id: 'x5',
    label: 'X5',
    multiplier: 5,
    weight: 4,
    icon: 'star',
    tone: '#ff5fae',
    glow: 'rgba(255, 95, 174, .33)',
    text: '#ffacd7',
  },
  {
    id: 'x7',
    label: 'X7',
    multiplier: 7,
    weight: 3,
    icon: 'star',
    tone: '#ff4f7b',
    glow: 'rgba(255, 79, 123, .34)',
    text: '#ff9ab5',
  },
  {
    id: 'x10',
    label: 'X10',
    multiplier: 10,
    weight: 2,
    icon: 'orb',
    tone: '#c166ff',
    glow: 'rgba(193, 102, 255, .36)',
    text: '#dea6ff',
  },
  {
    id: 'x25',
    label: 'X25',
    multiplier: 25,
    weight: 1,
    icon: 'crown',
    tone: '#fff06a',
    glow: 'rgba(255, 240, 106, .42)',
    text: '#fff6a8',
  },
];

let cardSeq = 1;

const getTelegramHaptics = () =>
  (window as BrowserWithAudio).Telegram?.WebApp?.HapticFeedback;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const waitFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const formatMoney = (value: number, locale = 'en-US') =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

const sanitizeBetInput = (value: string) => {
  const onlyDigits = value.replace(/[^\d]/g, '');
  return onlyDigits.replace(/^0+(\d)/, '$1');
};

type ServerScratchOutcome = {
  cards: Array<{
    index: number;
    prize: { id: string; label: string; multiplier: number; icon: ScratchIconKey };
  }>;
  total_multiplier: number;
  total_win: number;
};

const prizeFromServer = (prize: ServerScratchOutcome['cards'][number]['prize']): PrizeDef => {
  const found = PRIZES.find((item) => item.id === prize.id);
  if (found) return found;
  return {
    id: prize.id,
    label: prize.label,
    multiplier: prize.multiplier,
    weight: 0,
    icon: prize.icon,
    tone: '#768194',
    glow: 'rgba(141, 151, 171, .20)',
    text: 'rgba(231, 238, 255, .72)',
  };
};

const cardsFromOutcome = (outcome: ServerScratchOutcome): ScratchCardData[] =>
  outcome.cards.map((card, index) => ({
    id: cardSeq++,
    index: card.index ?? index,
    prize: prizeFromServer(card.prize),
  }));

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

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

const SCRATCH_ICON_BY_KEY: Record<ScratchIconKey, string> = {
  diamond: iconDiamondImg,
  coin: iconCoinImg,
  clover: iconCloverImg,
  orb: iconOrbImg,
  star: iconStarImg,
  crown: iconCrownImg,
};

const ScratchIcon = ({ icon, alt = '' }: { icon: ScratchIconKey; alt?: string }) => {
  const shared = {
    src: SCRATCH_ICON_BY_KEY[icon],
    draggable: false as const,
    className: 'ns-symbol ns-symbol-img',
  };

  if (alt) {
    return <img {...shared} alt={alt} />;
  }

  return <img {...shared} alt="" aria-hidden="true" />;
};

const GameTitle = ({ loading = false }: { loading?: boolean }) => (
  <img
    src={titleImg}
    alt="Lucky Scratch"
    draggable={false}
    className={loading ? 'ns-title-img ns-title-img-loading' : 'ns-title-img'}
  />
);

const PRIZE_CARD_CSS = PRIZES.map(
  (prize) => `
    .ns-card[data-prize="${prize.id}"] {
      --cardGlow: ${prize.glow};
      --cardText: ${prize.text};
      --cardTone: ${prize.tone};
    }`,
).join('\n');

const CARD_INDEX_CSS = [0, 1, 2]
  .map((index) => `.ns-card[data-index="${index}"] { animation-delay: ${index * 120}ms; }`)
  .join('\n');

const PREVIEW_INDEX_CSS = [
  {
    index: 0,
    glow: 'rgba(73, 236, 255, .18)',
    text: '#e8feff',
    tone: '#49ecff',
  },
  {
    index: 1,
    glow: 'rgba(255, 87, 189, .18)',
    text: '#e8feff',
    tone: '#ff57bd',
  },
  {
    index: 2,
    glow: 'rgba(255, 207, 98, .16)',
    text: '#e8feff',
    tone: '#ffcf62',
  },
]
  .map(
    (preview) => `
    .ns-card.disabled-preview[data-index="${preview.index}"] {
      --cardGlow: ${preview.glow};
      --cardText: ${preview.text};
      --cardTone: ${preview.tone};
    }`,
  )
  .join('\n');

const FINAL_TIER_CSS = `
  .ns-final-card.is-zero {
    --finalGlow: rgba(120, 130, 150, .24);
    --finalGlowSoft: rgba(120, 130, 150, .22);
    --finalText: #aeb7c8;
  }

  .ns-final-card.is-win {
    --finalGlow: rgba(73, 236, 255, .30);
    --finalGlowSoft: rgba(73, 236, 255, .24);
    --finalText: #e8feff;
  }

  .ns-final-card.is-big {
    --finalGlow: rgba(197, 121, 255, .32);
    --finalGlowSoft: rgba(197, 121, 255, .25);
    --finalText: #d9a6ff;
  }

  .ns-final-card.is-mega {
    --finalGlow: rgba(255, 91, 195, .34);
    --finalGlowSoft: rgba(255, 91, 195, .28);
    --finalText: #ff8fd8;
  }

  .ns-final-card.is-epic {
    --finalGlow: rgba(255, 240, 106, .38);
    --finalGlowSoft: rgba(255, 240, 106, .30);
    --finalText: #fff6a8;
  }
`;

const StyleBlock = () => (
  <style>{`
    html.neon-scratch-active,
    body.neon-scratch-active,
    body.neon-scratch-active #root,
    body.neon-scratch-active .solo-app-shell,
    body.neon-scratch-active .neon-scratch-app-shell,
    body.neon-scratch-active .solo-main,
    body.neon-scratch-active .neon-scratch-main {
      background:
        radial-gradient(94% 58% at 50% -14%, rgba(73, 237, 255, .24), transparent 58%),
        radial-gradient(84% 48% at 4% 20%, rgba(255, 64, 181, .28), transparent 55%),
        radial-gradient(92% 56% at 98% 32%, rgba(112, 81, 255, .24), transparent 58%),
        radial-gradient(115% 56% at 50% 108%, rgba(255, 176, 47, .20), transparent 62%),
        linear-gradient(180deg, #050711 0%, #100621 46%, #06050d 100%) !important;
      background-attachment: fixed !important;
      background-repeat: no-repeat !important;
    }

    body.neon-scratch-active .solo-app-shell,
    body.neon-scratch-active .neon-scratch-app-shell {
      overflow: hidden !important;
      background-color: transparent !important;
    }

    body.neon-scratch-active .solo-main,
    body.neon-scratch-active .neon-scratch-main {
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      height: auto !important;
      padding-bottom: 0 !important;
      overflow: hidden !important;
      background-color: transparent !important;
    }

    body.neon-scratch-active .header-panel {
      background:
        radial-gradient(circle at 12% 0%, rgba(75, 239, 255, .20), transparent 38%),
        radial-gradient(circle at 88% 0%, rgba(255, 77, 188, .18), transparent 36%),
        radial-gradient(circle at 50% 100%, rgba(255, 197, 75, .10), transparent 44%),
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.026)),
        rgba(10, 8, 25, .68) !important;
      border-color: rgba(92, 237, 255, .20) !important;
      box-shadow:
        0 16px 38px rgba(0,0,0,.32),
        inset 0 1px 0 rgba(255,255,255,.10),
        0 0 28px rgba(255, 75, 190, .08) !important;
    }

    body.neon-scratch-active .solo-header-badge {
      color: #04141a !important;
      background: linear-gradient(180deg, #8effff, #42dbff) !important;
      box-shadow: 0 0 14px rgba(70, 232, 255, .24) !important;
    }

    .ns-root {
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

    .ns-root * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    .ns-content {
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

    .ns-title-img {
      display: block;
      width: min(100%, 310px);
      max-height: 64px;
      height: auto;
      object-fit: contain;
      margin: 0 auto;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      filter:
        drop-shadow(0 7px 0 rgba(25, 10, 48, .55))
        drop-shadow(0 10px 18px rgba(0, 0, 0, .42))
        drop-shadow(0 0 22px rgba(73, 236, 255, .18));
      transform: translateZ(0);
    }

    .ns-title-img-loading {
      width: min(86vw, 410px);
      max-height: 92px;
      filter:
        drop-shadow(0 8px 0 rgba(25, 10, 48, .58))
        drop-shadow(0 14px 26px rgba(0, 0, 0, .48))
        drop-shadow(0 0 28px rgba(255, 86, 190, .22));
    }

    .ns-load-card-img {
      position: relative;
      z-index: 1;
      display: block;
      width: min(66vw, 210px);
      height: auto;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      filter:
        drop-shadow(0 18px 36px rgba(0, 0, 0, .36))
        drop-shadow(0 0 26px rgba(75, 235, 255, .20))
        drop-shadow(0 0 18px rgba(255, 76, 191, .16));
      animation: nsLoaderFloat 1.6s ease-in-out infinite;
    }

    .ns-symbol-img {
      display: block;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }


    .ns-loading {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      text-align: center;
    }

    .ns-loading-glow {
      position: absolute;
      width: 320px;
      height: 320px;
      border-radius: 999px;
      background:
        radial-gradient(circle, rgba(71, 232, 255, .22), transparent 60%),
        radial-gradient(circle at 32% 42%, rgba(255, 78, 190, .18), transparent 42%),
        radial-gradient(circle at 68% 55%, rgba(255, 198, 66, .16), transparent 42%);
      animation: nsLoadPulse 1.5s ease-in-out infinite;
    }

    .ns-loader-card {
      position: relative;
      width: 154px;
      height: 104px;
      border-radius: 25px;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 35% 12%, rgba(255,255,255,.16), transparent 42%),
        linear-gradient(135deg, rgba(77, 233, 255, .22), rgba(255, 76, 191, .18)),
        rgba(16, 10, 34, .86);
      border: 1px solid rgba(110, 237, 255, .24);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 20px 50px rgba(0,0,0,.36),
        0 0 30px rgba(81, 232, 255, .12);
      animation: nsLoaderFloat 1.6s ease-in-out infinite;
    }

    .ns-loader-card::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        linear-gradient(110deg, transparent 0%, rgba(255,255,255,.16) 46%, transparent 58%);
      transform: translateX(-120%);
      animation: nsShine 1.5s ease-in-out infinite;
    }

    .ns-loader-symbol {
      position: relative;
      z-index: 1;
      width: 70px;
      height: 70px;
      filter: drop-shadow(0 0 16px rgba(76, 233, 255, .22));
    }

    .ns-load-title {
      position: relative;
      margin-top: 24px;
      font-size: 27px;
      line-height: .92;
      letter-spacing: .03em;
      color: #dffcff;
      text-shadow:
        0 3px 0 #183252,
        0 8px 18px rgba(0,0,0,.48),
        0 0 24px rgba(71,232,255,.28);
    }

    .ns-load-title span {
      color: #ff7fd3;
      text-shadow:
        0 3px 0 #4f123e,
        0 8px 18px rgba(0,0,0,.48),
        0 0 22px rgba(255,81,190,.30);
    }

    .ns-load-bar {
      position: relative;
      overflow: hidden;
      width: 210px;
      height: 8px;
      margin-top: 20px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.08);
    }

    .ns-load-bar span {
      display: block;
      height: 100%;
      width: var(--loadProgress, 0%);
      border-radius: inherit;
      background: linear-gradient(90deg, #49ecff, #ff57bd, #ffcf62);
      transition: width .08s linear;
    }

    @keyframes nsLoadPulse {
      50% {
        transform: scale(1.08);
        opacity: .76;
      }
    }

    @keyframes nsLoaderFloat {
      50% {
        transform: translateY(-7px) rotate(-1.2deg);
      }
    }

    @keyframes nsShine {
      50%, 100% {
        transform: translateX(120%);
      }
    }

    .ns-top {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px 1fr 42px;
      align-items: center;
      gap: 8px;
    }

    .ns-icon-btn {
      width: 40px;
      height: 40px;
      border-radius: 17px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,.92);
      background:
        radial-gradient(circle at 30% 0%, rgba(255,255,255,.16), transparent 43%),
        linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.026)),
        rgba(16, 10, 34, .72);
      border: 1px solid rgba(103, 237, 255, .15);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 9px 19px rgba(0,0,0,.24);
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }

    .ns-icon-btn:active,
    .ns-card:active,
    .ns-bet-quick:active,
    .ns-start-btn:active {
      transform: scale(.95) translateZ(0);
      filter: brightness(1.08);
    }

    .ns-title-wrap {
      min-width: 0;
      text-align: center;
    }

    .ns-kicker {
      margin: 0 0 2px;
      color: rgba(116, 244, 255, .72);
      font-size: 7px;
      line-height: 1;
      letter-spacing: .20em;
    }

    .ns-title {
      margin: 0;
      font-size: 24px;
      line-height: .95;
      letter-spacing: .02em;
      color: #e8feff;
      text-shadow:
        0 3px 0 #193457,
        0 7px 13px rgba(0,0,0,.56),
        0 0 20px rgba(73, 236, 255, .25);
    }

    .ns-title span {
      color: #ff83d6;
      text-shadow:
        0 3px 0 #50143f,
        0 7px 13px rgba(0,0,0,.56),
        0 0 20px rgba(255, 89, 192, .30);
    }

    .ns-board-area {
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      grid-template-rows: 1fr auto;
      gap: 8px;
      overflow: hidden;
    }

    .ns-cards {
      min-height: 0;
      display: grid;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 8px;
      overflow: hidden;
    }

    .ns-card {
      position: relative;
      min-height: 0;
      width: 100%;
      border-radius: 25px;
      overflow: hidden;
      padding: 9px;
      color: #fff;
      background:
        radial-gradient(circle at 16% 14%, rgba(255,255,255,.13), transparent 38%),
        radial-gradient(circle at 84% 18%, var(--cardGlow), transparent 42%),
        radial-gradient(circle at 8% 100%, var(--cardGlow), transparent 48%),
        linear-gradient(135deg, var(--cardGlow), rgba(255, 88, 191, .055)),
        rgba(14, 9, 29, .84);
      border: 1px solid rgba(109, 237, 255, .16);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.09),
        inset 0 -12px 24px rgba(0,0,0,.23),
        0 12px 24px rgba(0,0,0,.25),
        0 0 18px var(--cardGlow);
      transform: translate3d(0, 18px, 0);
      opacity: 0;
      animation: nsCardIn .58s cubic-bezier(.16, .88, .18, 1) both;
      animation-delay: var(--enterDelay);
      contain: layout paint style;
    }

    @keyframes nsCardIn {
      to {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }
    }

    .ns-card-inner {
      position: relative;
      height: 100%;
      min-height: 0;
      border-radius: 19px;
      overflow: hidden;
      display: grid;
      grid-template-columns: 78px 1fr 66px;
      align-items: center;
      gap: 9px;
      padding: 10px;
      background:
        radial-gradient(circle at 26% 10%, rgba(255,255,255,.12), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.022)),
        rgba(255,255,255,.034);
      border: 1px solid rgba(255,255,255,.065);
    }

    .ns-symbol-box {
      position: relative;
      width: 68px;
      height: 68px;
      border-radius: 21px;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 35% 16%, rgba(255,255,255,.14), transparent 44%),
        rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.075);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 8px 18px rgba(0,0,0,.20);
    }

    .ns-symbol {
      width: 60px;
      height: 60px;
      object-fit: contain;
      filter:
        drop-shadow(0 5px 6px rgba(0,0,0,.30))
        drop-shadow(0 0 12px var(--cardGlow));
    }

    .ns-prize-main {
      min-width: 0;
    }

    .ns-prize-label {
      font-size: 27px;
      line-height: .95;
      color: var(--cardText);
      text-shadow:
        0 0 18px var(--cardGlow),
        0 4px 10px rgba(0,0,0,.42);
      white-space: nowrap;
    }

    .ns-prize-sub {
      margin-top: 6px;
      color: rgba(240, 245, 255, .58);
      font-size: 8px;
      line-height: 1.2;
      letter-spacing: .12em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .ns-prize-amount {
      justify-self: end;
      min-width: 58px;
      padding: 8px 7px;
      border-radius: 15px;
      text-align: center;
      color: #fff;
      font-size: 13px;
      line-height: 1;
      background:
        radial-gradient(circle at 50% 0%, var(--cardGlow), transparent 58%),
        rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.07);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }

    .ns-scratch-canvas {
      position: absolute;
      inset: 0;
      z-index: 5;
      width: 100%;
      height: 100%;
      touch-action: none;
      cursor: grab;
      opacity: 1;
      transition: opacity .35s ease, transform .35s ease;
    }

    .ns-card.revealed .ns-scratch-canvas {
      opacity: 0;
      transform: scale(1.015);
      pointer-events: none;
    }

    .ns-progress-pill {
      position: absolute;
      left: 14px;
      bottom: 13px;
      z-index: 6;
      width: 72px;
      height: 5px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.08);
      pointer-events: none;
      transition: opacity .25s ease;
    }

    .ns-progress-pill span {
      display: block;
      height: 100%;
      width: var(--scratchProgress);
      border-radius: inherit;
      background: linear-gradient(90deg, #49ecff, #ff57bd);
      transition: width .12s linear;
    }

    .ns-card.revealed .ns-progress-pill {
      opacity: 0;
    }



    .ns-card.disabled-preview {
      opacity: .54;
      filter: saturate(.78) brightness(.82);
      pointer-events: none;
    }

    .ns-card.disabled-preview .ns-card-inner {
      display: grid;
      grid-template-columns: 1fr;
      padding: 0;
      place-items: center;
      background:
        radial-gradient(circle at 50% 22%, rgba(255,255,255,.10), transparent 42%),
        rgba(255,255,255,.026);
    }

    .ns-preview-card-img {
      display: block;
      width: min(78%, 170px);
      max-height: 96%;
      height: auto;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      filter:
        drop-shadow(0 10px 16px rgba(0,0,0,.26))
        drop-shadow(0 0 18px rgba(73,236,255,.12));
    }

    .ns-card.disabled-preview::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        linear-gradient(110deg, transparent 0%, rgba(255,255,255,.12) 48%, transparent 60%);
      transform: translateX(-120%);
      animation: nsDisabledShine 3.2s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes nsDisabledShine {
      58%, 100% {
        transform: translateX(120%);
      }
    }

    .ns-result-bar {
      flex: 0 0 auto;
      min-height: 52px;
      border-radius: 22px;
      padding: 7px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      background:
        radial-gradient(circle at 86% 50%, rgba(255, 85, 194, .12), transparent 42%),
        linear-gradient(180deg, rgba(255,255,255,.064), rgba(255,255,255,.024)),
        rgba(13, 8, 28, .76);
      border: 1px solid rgba(111, 238, 255, .13);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.08),
        0 8px 18px rgba(0,0,0,.20);
    }

    .ns-result-card {
      min-width: 0;
      padding: 7px 10px;
      border-radius: 17px;
      background: rgba(255,255,255,.033);
      border: 1px solid rgba(255,255,255,.055);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .ns-result-label {
      color: rgba(166, 243, 255, .62);
      font-size: 7px;
      letter-spacing: .13em;
      text-transform: uppercase;
      line-height: 1.1;
    }

    .ns-result-value {
      margin-top: 4px;
      color: #fff;
      font-size: 18px;
      line-height: 1;
      text-shadow: 0 0 14px rgba(76, 233, 255, .22);
      font-variant-numeric: tabular-nums;
    }

    .ns-controls {
      flex: 0 0 auto;
      display: grid;
      gap: 7px;
      min-height: 0;
    }

    .ns-bet-card {
      display: grid;
      grid-template-columns: 1fr 54px 54px;
      gap: 6px;
      align-items: center;
      border-radius: 20px;
      padding: 6px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.062), rgba(255,255,255,.021)),
        rgba(15, 9, 30, .80);
      border: 1px solid rgba(111, 238, 255, .14);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.075),
        0 7px 15px rgba(0,0,0,.18);
    }

    .ns-bet-field {
      height: 42px;
      min-width: 0;
      border-radius: 15px;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      padding: 0 11px;
      background:
        radial-gradient(circle at 50% 0%, rgba(73, 236, 255, .10), transparent 50%),
        rgba(255,255,255,.032);
      border: 1px solid rgba(255,255,255,.052);
    }

    .ns-bet-label {
      color: rgba(166, 243, 255, .62);
      font-size: 7px;
      line-height: 1;
      letter-spacing: .15em;
      text-transform: uppercase;
    }

    .ns-bet-input {
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

    .ns-bet-input::-webkit-outer-spin-button,
    .ns-bet-input::-webkit-inner-spin-button {
      margin: 0;
      appearance: none;
    }

    .ns-bet-input:disabled {
      opacity: .55;
    }

    .ns-bet-quick {
      height: 42px;
      border-radius: 15px;
      color: #06131b;
      font-size: 11px;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.46), transparent 44%),
        linear-gradient(180deg, #dffcff, #4de8ff);
      border: 1px solid rgba(134, 246, 255, .46);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.44),
        0 0 12px rgba(73, 236, 255, .16);
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }

    .ns-bet-quick:disabled {
      opacity: .42;
      color: rgba(255,255,255,.36);
      background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
        rgba(255,255,255,.035);
      border-color: rgba(255,255,255,.055);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
    }

    .ns-start-row {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 78px;
    }

    .ns-start-btn {
      position: relative;
      width: min(100%, 230px);
      height: 58px;
      border-radius: 20px;
      padding: 0;
      border: 0;
      overflow: hidden;
      color: #06131b;
      background:
        radial-gradient(circle at 35% 0%, rgba(255,255,255,.55), transparent 42%),
        linear-gradient(135deg, #dffcff 0%, #55eaff 44%, #ff61c3 100%);
      box-shadow:
        inset 0 2px 7px rgba(255,255,255,.52),
        inset 0 -8px 13px rgba(20, 34, 92, .22),
        0 0 20px rgba(78, 235, 255, .24),
        0 8px 20px rgba(0,0,0,.25);
      isolation: isolate;
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }

    .ns-start-btn:disabled {
      opacity: .62;
      filter: saturate(.86);
    }

    .ns-start-btn::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        linear-gradient(110deg, transparent 0%, rgba(255,255,255,.26) 46%, transparent 58%);
      transform: translateX(-120%);
      animation: nsButtonShine 2.4s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes nsButtonShine {
      55%, 100% {
        transform: translateX(120%);
      }
    }

    .ns-start-main {
      position: relative;
      z-index: 1;
      display: block;
      font-size: 16px;
      line-height: 1;
    }

    .ns-start-sub {
      position: relative;
      z-index: 1;
      display: block;
      margin-top: 4px;
      color: rgba(6, 19, 27, .72);
      font-size: 7px;
      letter-spacing: .12em;
      text-transform: uppercase;
      line-height: 1;
    }

    .ns-final-layer {
      position: fixed;
      inset: 0;
      z-index: 240;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background:
        radial-gradient(circle at 50% 45%, rgba(75, 36, 152, .3), transparent 48%),
        rgba(4, 4, 10, .66);
      -webkit-backdrop-filter: blur(14px) saturate(.82);
      backdrop-filter: blur(14px) saturate(.82);
      animation: nsFade .18s ease-out both;
      pointer-events: none;
    }

    .ns-final-card {
      position: relative;
      overflow: hidden;
      width: min(330px, 88vw);
      border-radius: 30px;
      padding: 22px 18px 18px;
      text-align: center;
      background:
        radial-gradient(circle at 50% 0%, var(--finalGlow), transparent 48%),
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.032)),
        rgba(13, 9, 31, .94);
      border: 1px solid rgba(111, 238, 255, .18);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.10),
        0 24px 70px rgba(0,0,0,.58),
        0 0 38px var(--finalGlowSoft);
      animation: nsFinalPop .36s cubic-bezier(.22, 1.3, .3, 1) both;
    }

    .ns-final-symbol {
      width: 88px;
      height: 88px;
      margin: 0 auto 12px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }

    .ns-final-title {
      font-size: 31px;
      line-height: .95;
      color: var(--finalText);
      text-shadow: 0 0 24px var(--finalGlowSoft);
    }

    .ns-final-value {
      margin-top: 10px;
      font-size: 38px;
      line-height: 1;
      color: #fff;
      text-shadow: 0 0 18px rgba(255,255,255,.20);
      font-variant-numeric: tabular-nums;
    }

    .ns-final-mult {
      position: relative;
      z-index: 2;
      margin-top: 8px;
      color: rgba(215, 246, 255, .76);
      font-size: 12px;
    }

    .ns-final-symbol,
    .ns-final-title,
    .ns-final-value {
      position: relative;
      z-index: 2;
    }

    .ns-final-fx {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .ns-final-fx i {
      --ns-angle: calc(var(--ns-fx) * 29deg);
      position: absolute;
      left: 50%;
      top: 47%;
      width: 4px;
      height: 10px;
      border-radius: 999px;
      background: var(--finalText);
      opacity: 0;
      transform: rotate(var(--ns-angle)) translateY(-34px);
      animation: nsFinalSpark 1.3s ease-out calc(var(--ns-fx) * 25ms) both;
    }

    @keyframes nsFade {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }

    @keyframes nsFinalPop {
      from {
        opacity: 0;
        transform: translateY(16px) scale(.82);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes nsFinalSpark {
      12% { opacity: .9; }
      100% { opacity: 0; transform: rotate(var(--ns-angle)) translateY(-142px) scale(.3); }
    }

    .ns-modal-layer {
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
      animation: nsFade .18s ease-out both;
    }

    .ns-modal {
      width: 100%;
      max-width: 480px;
      max-height: min(76vh, 610px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 24px 24px 0 0;
      background: linear-gradient(180deg, #1a1139, #070812);
      border: 1px solid rgba(111, 238, 255, .18);
      border-bottom: 0;
      box-shadow: 0 -18px 50px rgba(0,0,0,.38);
      animation: nsSlideUp .24s ease-out both;
    }

    @keyframes nsSlideUp {
      from {
        transform: translateY(100%);
      }

      to {
        transform: translateY(0);
      }
    }

    .ns-modal-grip {
      width: 42px;
      height: 4px;
      border-radius: 999px;
      margin: 9px auto 0;
      background: rgba(255,255,255,.22);
    }

    .ns-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 11px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    .ns-modal-head p {
      margin: 0 0 2px;
      color: rgba(166, 243, 255, .60);
      font-size: 8px;
      letter-spacing: .18em;
    }

    .ns-modal-head h2 {
      margin: 0;
      color: #e8feff;
      font-size: 17px;
    }

    .ns-modal-head button {
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

    .ns-modal-body {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 12px 16px 20px;
    }

    .ns-modal-body section + section {
      margin-top: 14px;
    }

    .ns-modal-body h3 {
      margin: 0 0 5px;
      color: #9ff6ff;
      font-size: 12px;
    }

    .ns-modal-body p {
      margin: 0;
      color: rgba(239,231,255,.78);
      font-size: 12px;
      line-height: 1.5;
    }

    .ns-info-list {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
    }

    .ns-info-list span {
      height: 30px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: #06131b;
      font-size: 10px;
      background: linear-gradient(180deg, #dffcff, #4de8ff);
    }

    @media (max-height: 760px) {
      .ns-root {
        padding-top: 9px;
        padding-bottom: calc(5px + env(safe-area-inset-bottom, 0px));
      }

      .ns-content {
        gap: 6px;
      }

      .ns-title {
        font-size: 21px;
      }

      .ns-title-img {
        max-height: 58px;
        width: min(100%, 290px);
      }

      .ns-load-card-img {
        width: min(62vw, 188px);
      }


      .ns-kicker {
        font-size: 6.5px;
      }

      .ns-icon-btn {
        width: 38px;
        height: 38px;
        border-radius: 16px;
      }

      .ns-cards {
        gap: 6px;
      }

      .ns-card {
        border-radius: 22px;
        padding: 8px;
      }

      .ns-card-inner {
        grid-template-columns: 66px 1fr 58px;
        padding: 8px;
        gap: 7px;
        border-radius: 17px;
      }

      .ns-symbol-box {
        width: 58px;
        height: 58px;
        border-radius: 18px;
      }

      .ns-symbol {
        width: 48px;
        height: 48px;
      }

      .ns-prize-label {
        font-size: 23px;
      }

      .ns-prize-sub {
        font-size: 6.8px;
        margin-top: 4px;
      }

      .ns-prize-amount {
        min-width: 52px;
        font-size: 11px;
        padding: 7px 6px;
      }

      .ns-result-bar {
        min-height: 48px;
      }

      .ns-result-value {
        font-size: 16px;
      }

      .ns-bet-card {
        padding: 5px;
        border-radius: 17px;
      }

      .ns-bet-field,
      .ns-bet-quick {
        height: 38px;
        border-radius: 13px;
      }

      .ns-bet-label {
        font-size: 6.4px;
      }

      .ns-bet-input {
        font-size: 14px;
      }

      .ns-bet-quick {
        font-size: 9.5px;
      }

      .ns-start-row {
        min-height: 70px;
      }

      .ns-start-btn {
        height: 54px;
        width: min(100%, 215px);
        border-radius: 18px;
      }
    }

    @media (max-height: 690px) {
      .ns-root {
        padding-top: 7px;
        padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
      }

      .ns-content {
        gap: 5px;
      }

      .ns-top {
        grid-template-columns: 36px 1fr 36px;
      }

      .ns-icon-btn {
        width: 35px;
        height: 35px;
        border-radius: 15px;
      }

      .ns-title {
        font-size: 19px;
      }

      .ns-title-img {
        max-height: 50px;
        width: min(100%, 250px);
      }

      .ns-load-card-img {
        width: min(58vw, 168px);
      }


      .ns-card-inner {
        grid-template-columns: 58px 1fr 52px;
        padding: 7px;
      }

      .ns-symbol-box {
        width: 51px;
        height: 51px;
      }

      .ns-symbol {
        width: 42px;
        height: 42px;
      }

      .ns-prize-label {
        font-size: 20px;
      }

      .ns-prize-sub {
        display: none;
      }

      .ns-prize-amount {
        min-width: 48px;
        font-size: 10px;
      }

      .ns-result-bar {
        min-height: 43px;
        padding: 5px;
      }

      .ns-result-label {
        font-size: 6px;
      }

      .ns-result-value {
        font-size: 14px;
      }

      .ns-bet-field,
      .ns-bet-quick {
        height: 35px;
      }

      .ns-start-row {
        min-height: 64px;
      }

      .ns-start-btn {
        height: 50px;
        width: min(100%, 200px);
      }
    }

    @media (max-width: 390px) {
      .ns-root {
        padding-left: 10px;
        padding-right: 10px;
      }

      .ns-card-inner {
        grid-template-columns: 58px 1fr 50px;
      }

      .ns-prize-label {
        font-size: 21px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ns-card,
      .ns-loader-card,
      .ns-loading-glow,
      .ns-start-btn::after,
      .ns-scratch-canvas,
      .ns-final-card {
        animation: none !important;
        transition: none !important;
      }
    }

    ${PRIZE_CARD_CSS}
    ${CARD_INDEX_CSS}
    ${PREVIEW_INDEX_CSS}
    ${FINAL_TIER_CSS}
  `}</style>
);

const LoadingScreen = ({ progress }: { progress: number }) => {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    barRef.current?.style.setProperty('--loadProgress', `${progress}%`);
  }, [progress]);

  return (
  <div className="ns-loading">
    <div className="ns-loading-glow" />

    <img
      src={loadingCardImg}
      alt="Scratch card"
      draggable={false}
      className="ns-load-card-img"
    />

    <GameTitle loading />

    <div ref={barRef} className="ns-load-bar">
      <span />
    </div>
  </div>
  );
};

const ScratchCard = ({
  card,
  bet,
  revealed,
  disabled,
  onReveal,
}: {
  card: ScratchCardData;
  bet: number;
  revealed: boolean;
  disabled: boolean;
  onReveal: (id: number) => void;
}) => {
  const { locale, tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const revealedRef = useRef(revealed);
  const lastCheckRef = useRef(0);
  const progressPillRef = useRef<HTMLDivElement | null>(null);

  const [progress, setProgress] = useState(revealed ? 100 : 0);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    progressPillRef.current?.style.setProperty('--scratchProgress', `${progress}%`);
  }, [progress]);

  const drawMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctxRef.current = ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cssWidth = rect.width;
    const cssHeight = rect.height;

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    drawRoundedRect(ctx, 0, 0, cssWidth, cssHeight, 24);

    const gradient = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
    gradient.addColorStop(0, '#dffcff');
    gradient.addColorStop(0.18, '#75f0ff');
    gradient.addColorStop(0.45, '#b98dff');
    gradient.addColorStop(0.72, '#ff65c7');
    gradient.addColorStop(1, '#ffe38b');

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.save();
    drawRoundedRect(ctx, 0, 0, cssWidth, cssHeight, 24);
    ctx.clip();

    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    for (let x = -cssHeight; x < cssWidth + cssHeight; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, cssHeight);
      ctx.lineTo(x + cssHeight, 0);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#07111c';

    for (let i = 0; i < 42; i += 1) {
      const x = Math.random() * cssWidth;
      const y = Math.random() * cssHeight;
      const r = 1 + Math.random() * 2.2;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(4, 10, 18, .68)';
    ctx.font = '700 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tr('SCRATCH', 'СТИРАЙ'), cssWidth / 2, cssHeight / 2);

    ctx.restore();

    setProgress(0);
  }, [tr]);

  const completeReveal = useCallback(() => {
    if (revealedRef.current) return;

    revealedRef.current = true;
    setProgress(100);

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (canvas && ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }

    onReveal(card.id);
  }, [card.id, onReveal]);

  const checkProgress = useCallback(() => {
    if (revealedRef.current) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!canvas || !ctx) return;

    const now = performance.now();

    if (now - lastCheckRef.current < 120) return;
    lastCheckRef.current = now;

    const { width, height } = canvas;
    if (width <= 0 || height <= 0) return;

    const image = ctx.getImageData(0, 0, width, height).data;
    let total = 0;
    let cleared = 0;

    for (let i = 3; i < image.length; i += 24) {
      total += 1;

      if (image[i] < 35) {
        cleared += 1;
      }
    }

    const nextProgress = total > 0 ? Math.min(100, (cleared / total) * 100) : 0;
    setProgress(nextProgress);

    if (nextProgress >= SCRATCH_THRESHOLD) {
      completeReveal();
    }
  }, [completeReveal]);

  const eraseAt = useCallback((x: number, y: number, from?: { x: number; y: number } | null) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (from) {
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, []);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || revealedRef.current) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;

    const point = getPoint(event);
    lastPointRef.current = point;

    eraseAt(point.x, point.y, null);
    checkProgress();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled || revealedRef.current) return;

    const point = getPoint(event);

    eraseAt(point.x, point.y, lastPointRef.current);
    lastPointRef.current = point;

    checkProgress();
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    lastPointRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    checkProgress();
  };

  useEffect(() => {
    revealedRef.current = false;
    lastPointRef.current = null;
    drawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let resizeObserver: ResizeObserver | null = null;

    const redraw = () => {
      if (!revealedRef.current) {
        drawMask();
      }
    };

    const timer = window.setTimeout(redraw, 30);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => redraw());
      resizeObserver.observe(canvas);
    }

    return () => {
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
    };
  }, [card.id, drawMask]);

  useEffect(() => {
    if (!revealed) return;

    const frameId = window.requestAnimationFrame(() => {
      completeReveal();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [revealed, completeReveal]);

  return (
    <div
      className={`ns-card ${revealed ? 'revealed' : ''}`}
      data-prize={card.prize.id}
      data-index={card.index}
    >
      <div className="ns-card-inner">
        <div className="ns-symbol-box">
          <ScratchIcon icon={card.prize.icon} />
        </div>

        <div className="ns-prize-main">
          <div className="ns-prize-label">{card.prize.label}</div>
          <div className="ns-prize-sub">{tr('Lucky scratch', 'Счастливый билет')} #{card.index + 1}</div>
        </div>

        <div className="ns-prize-amount">
          {card.prize.multiplier > 0 ? formatMoney(roundMoney(bet * card.prize.multiplier), locale) : '0'}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="ns-scratch-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />

      <div ref={progressPillRef} className="ns-progress-pill">
        <span />
      </div>
    </div>
  );
};


const ClosedScratchPreview = ({ index }: { index: number }) => (
  <div className="ns-card disabled-preview" data-index={index}>
    <div className="ns-card-inner">
      <img
        src={loadingCardImg}
        alt="Closed scratch"
        draggable={false}
        className="ns-preview-card-img"
      />
    </div>
  </div>
);

const InfoModal = ({ bet, onClose }: { bet: number; onClose: () => void }) => {
  const { locale, tr } = useLanguage();

  return createPortal(
    <div className="ns-modal-layer" onClick={onClose}>
      <div className="ns-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ns-modal-grip" />

        <div className="ns-modal-head">
          <div>
            <p>{tr('INFO', 'ИНФО')}</p>
            <h2>Neon Scratch</h2>
          </div>

          <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}>
            <CloseIcon />
          </button>
        </div>

        <div className="ns-modal-body">
          <section>
            <h3>{tr('How to play', 'Как играть')}</h3>
            <p>{tr(
              'Place a bet, press Start and scratch all three cards. A card opens automatically once enough foil is removed.',
              'Сделай ставку, нажми Start и сотри три карточки. Карточка откроется автоматически, когда снято достаточно покрытия.',
            )}</p>
          </section>

          <section>
            <h3>{tr('Payout', 'Выигрыш')}</h3>
            <p>{tr(
              'Every card has its own multiplier. The final payout is the sum of all three revealed prizes.',
              'У каждой карточки свой множитель. Итоговая выплата — сумма всех трёх открытых призов.',
            )}</p>

            <div className="ns-info-list">
              {PRIZES.filter((prize) => prize.multiplier > 0).map((prize) => (
                <span key={prize.id}>{prize.label}</span>
              ))}
            </div>
          </section>

          <section>
            <h3>{tr('Bet', 'Ставка')}</h3>
            <p>{tr('Current bet', 'Текущая ставка')}: {formatMoney(bet, locale)} GAME.</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const FinalOverlay = ({
  win,
  totalMultiplier,
}: {
  win: number;
  totalMultiplier: number;
}) => {
  const { locale, tr } = useLanguage();
  const isBig = totalMultiplier >= 3;
  const isMega = totalMultiplier >= 7;
  const isEpic = totalMultiplier >= 20;
  const isZero = win <= 0;

  const tierClass = isZero ? 'is-zero' : isEpic ? 'is-epic' : isMega ? 'is-mega' : isBig ? 'is-big' : 'is-win';
  const effectCount = isZero ? 0 : isEpic ? 22 : isMega ? 16 : isBig ? 12 : 7;

  return createPortal(
    <div className="ns-final-layer">
      <div className={`ns-final-card ${tierClass}`}>
        <div className="ns-final-symbol">
          <ScratchIcon icon={isEpic ? 'crown' : isMega ? 'orb' : isBig ? 'star' : 'diamond'} />
        </div>

        <div className="ns-final-title">
          {isZero
            ? tr('NO WIN', 'БЕЗ ВЫИГРЫША')
            : isEpic
              ? tr('EPIC WIN', 'ЭПИЧЕСКИЙ ВЫИГРЫШ')
              : isMega
                ? tr('MEGA WIN', 'МЕГА ВЫИГРЫШ')
                : isBig
                  ? tr('BIG WIN', 'БОЛЬШОЙ ВЫИГРЫШ')
                  : tr('WIN', 'ВЫИГРЫШ')}
        </div>

        <div className="ns-final-value">{formatMoney(win, locale)}</div>

        <div className="ns-final-mult">{tr('Total', 'Итого')}: X{roundMoney(totalMultiplier)}</div>
        <div className="ns-final-fx" aria-hidden="true">
          {Array.from({ length: effectCount }, (_, index) => (
            <i key={index} style={{ '--ns-fx': index } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const NeonScratchSoloGame = () => {
  const { locale, tr } = useLanguage();
  const { spin, loading: walletLoading, canAfford, setError } = useSoloWallet();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [bet, setBet] = useState(1);
  const [betInput, setBetInput] = useState('1');
  const [cards, setCards] = useState<ScratchCardData[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(() => new Set());
  const [muted, setMuted] = useState(() => localStorage.getItem('neon-scratch-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [showFinal, setShowFinal] = useState(false);
  const [serverWin, setServerWin] = useState(0);
  const [serverMult, setServerMult] = useState(0);

  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const revealedCards = useMemo(
    () => cards.filter((card) => revealedIds.has(card.id)),
    [cards, revealedIds],
  );

  const currentWin = roundMoney(
    revealedCards.reduce((sum, card) => sum + bet * card.prize.multiplier, 0),
  );

  const totalMultiplier = roundMoney(
    cards.reduce((sum, card) => sum + card.prize.multiplier, 0),
  );

  const totalWin = serverWin > 0 ? serverWin : roundMoney(bet * totalMultiplier);
  const displayMult = serverMult > 0 ? serverMult : totalMultiplier;
  const isPlaying = phase === 'scratching';

  const haptic = useCallback((kind: 'tap' | 'start' | 'scratch' | 'card' | 'win') => {
    const tgHaptics = getTelegramHaptics();

    if (kind === 'win') tgHaptics?.notificationOccurred?.('success');
    else if (kind === 'card') tgHaptics?.impactOccurred?.('medium');
    else if (kind === 'scratch') tgHaptics?.impactOccurred?.('light');
    else tgHaptics?.selectionChanged?.();

    if ('vibrate' in navigator) {
      const pattern: number | number[] =
        kind === 'win' ? [22, 24, 36] : kind === 'card' ? 18 : kind === 'start' ? 12 : 7;

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
    (kind: 'tap' | 'start' | 'scratch' | 'card' | 'win') => {
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
        playTone(560, 0, 0.07, 0.022);
      }

      if (kind === 'start') {
        playTone(240, 0, 0.12, 0.024, 'triangle');
        playTone(420, 0.08, 0.14, 0.022);
      }

      if (kind === 'scratch') {
        playTone(780, 0, 0.035, 0.010, 'square');
      }

      if (kind === 'card') {
        playTone(520, 0, 0.09, 0.024);
        playTone(820, 0.07, 0.12, 0.022);
      }

      if (kind === 'win') {
        [520, 720, 980, 1240].forEach((freq, index) => {
          playTone(freq, index * 0.08, 0.16, 0.025);
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

  const startRound = async () => {
    if (isPlaying || walletLoading) return;
    if (!canAfford(bet)) {
      setError('insufficient balance');
      return;
    }

    haptic('start');
    playSound('start');

    setShowFinal(false);
    setPhase('idle');
    setRevealedIds(new Set());
    setCards([]);
    setServerWin(0);
    setServerMult(0);

    try {
      const response = await spin('neon_scratch', bet);
      const outcome = response.outcome as ServerScratchOutcome;
      setServerWin(response.payout_coins);
      setServerMult(outcome.total_multiplier ?? 0);

      await waitFrame();
      await sleep(80);

      setCards(cardsFromOutcome(outcome));
      setPhase('scratching');
    } catch {
      // error surfaced via walletError
    }
  };

  const handleCardReveal = useCallback(
    (id: number) => {
      haptic('card');
      playSound('card');

      setRevealedIds((prev) => {
        if (prev.has(id)) return prev;

        const next = new Set(prev);
        next.add(id);

        if (next.size >= CARD_COUNT) {
          window.setTimeout(() => {
            setPhase('finished');
            setShowFinal(true);

            if (totalWin > 0) {
              haptic('win');
              playSound('win');
            }

            window.setTimeout(() => {
              setShowFinal(false);
            }, totalWin > 0 ? 1650 : 1250);
          }, 520);
        }

        return next;
      });
    },
    [haptic, playSound, totalWin],
  );

  const handleBetInput = (value: string) => {
    if (isPlaying) return;

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
    if (isPlaying) return;

    haptic('tap');
    playSound('tap');
    setBetValue(value);
  };

  const toggleMute = () => {
    haptic('tap');
    setMuted((value) => !value);
  };

  useEffect(() => {
    document.documentElement.classList.add('neon-scratch-active');
    document.body.classList.add('neon-scratch-active');

    return () => {
      document.documentElement.classList.remove('neon-scratch-active');
      document.body.classList.remove('neon-scratch-active');

      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('neon-scratch-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 2000;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2.5);

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
      <div className="ns-root">
        <StyleBlock />
        <LoadingScreen progress={loadProgress} />
      </div>
    );
  }

  return (
    <div className="ns-root">
      <StyleBlock />

      <div className="ns-content">
        <div className="ns-top">
          <button
            type="button"
            className="ns-icon-btn"
            onClick={() => setShowInfo(true)}
            aria-label={tr('Information', 'Информация')}
          >
            <InfoIcon />
          </button>

          <div className="ns-title-wrap">
            <GameTitle />
          </div>

          <button
            type="button"
            className="ns-icon-btn"
            onClick={toggleMute}
            aria-label={muted ? tr('Turn sound on', 'Включить звук') : tr('Turn sound off', 'Выключить звук')}
          >
            {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
          </button>
        </div>


        <main className="ns-board-area">
          <section className="ns-cards">
            {cards.length > 0 ? (
              cards.map((card) => (
                <ScratchCard
                  key={card.id}
                  card={card}
                  bet={bet}
                  revealed={revealedIds.has(card.id)}
                  disabled={phase !== 'scratching'}
                  onReveal={handleCardReveal}
                />
              ))
            ) : (
              Array.from({ length: CARD_COUNT }, (_, index) => (
                <ClosedScratchPreview key={index} index={index} />
              ))
            )}
          </section>

          <div className="ns-result-bar">
            <div className="ns-result-card">
              <span className="ns-result-label">{tr('Win', 'Выигрыш')}</span>
              <strong className="ns-result-value">
                {phase === 'finished' ? formatMoney(totalWin, locale) : formatMoney(currentWin, locale)}
              </strong>
            </div>

            <div className="ns-result-card">
              <span className="ns-result-label">{tr('Revealed', 'Открыто')}</span>
              <strong className="ns-result-value">
                {revealedIds.size}/{CARD_COUNT}
              </strong>
            </div>
          </div>
        </main>

        <footer className="ns-controls">
          <div className="ns-bet-card">
            <label className="ns-bet-field">
              <span className="ns-bet-label">{tr('Bet', 'Ставка')}</span>

              <input
                className="ns-bet-input"
                value={betInput}
                disabled={isPlaying}
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
                className="ns-bet-quick"
                disabled={isPlaying}
                onClick={() => chooseQuickBet(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="ns-start-row">
            <button
              type="button"
              className="ns-start-btn"
              disabled={isPlaying}
              onClick={startRound}
            >
              <span className="ns-start-main">
                {isPlaying ? tr('SCRATCH', 'СТИРАЙ') : phase === 'finished' ? tr('AGAIN', 'ЕЩЁ') : tr('START', 'СТАРТ')}
              </span>

              <span className="ns-start-sub">
                {isPlaying ? tr('Reveal all 3', 'Сотри все 3') : tr('Begin', 'Запустить')}
              </span>
            </button>
          </div>
        </footer>
      </div>

      {showFinal && <FinalOverlay win={totalWin} totalMultiplier={displayMult} />}

      {showInfo && <InfoModal bet={bet} onClose={() => setShowInfo(false)} />}
    </div>
  );
};
