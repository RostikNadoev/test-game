import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Phase = 'ready' | 'running' | 'crashed' | 'reveal' | 'gameover';
type FinalWinner = 'user' | 'bot' | 'draw';

type RoundOutcome = {
  crashPoint: number;
  userCashout: number | null;
  botCashout: number | null;
  userPoints: number;
  botPoints: number;
};

type Totals = {
  user: number;
  bot: number;
};

type HapticFeedback = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = {
  HapticFeedback?: HapticFeedback;
};

const TOTAL_ROUNDS = 5;
const BASE_POINTS = 100;
const REVEAL_DELAY_MS = 1700;

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatX = (value: number) => `${value.toFixed(2)}x`;
const formatPoints = (value: number) => value.toLocaleString('ru-RU');

const getTg = () => {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
};

const fallbackVibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  const haptic = getTg()?.HapticFeedback;

  haptic?.impactOccurred?.(style);

  if (style === 'heavy') {
    fallbackVibrate([28, 24, 34]);
    return;
  }

  if (style === 'medium') {
    fallbackVibrate(18);
    return;
  }

  fallbackVibrate(8);
};

const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  const haptic = getTg()?.HapticFeedback;

  haptic?.notificationOccurred?.(type);

  if (type === 'error') {
    fallbackVibrate([36, 28, 46]);
    return;
  }

  if (type === 'warning') {
    fallbackVibrate([18, 22, 18]);
    return;
  }

  fallbackVibrate([12, 18, 12]);
};

const hapticSelect = () => {
  const haptic = getTg()?.HapticFeedback;

  haptic?.selectionChanged?.();
  fallbackVibrate(6);
};

const generateCrashPoint = () => {
  const r = Math.random();

  if (r < 0.11) return Number((1.12 + Math.random() * 0.42).toFixed(2));
  if (r < 0.54) return Number((1.55 + Math.random() * 1.25).toFixed(2));
  if (r < 0.84) return Number((2.8 + Math.random() * 2.1).toFixed(2));
  if (r < 0.96) return Number((4.9 + Math.random() * 2.65).toFixed(2));

  return Number((7.6 + Math.random() * 3.1).toFixed(2));
};

const generateBotTarget = () => {
  const r = Math.random();

  if (r < 0.22) return Number((1.25 + Math.random() * 0.5).toFixed(2));
  if (r < 0.64) return Number((1.75 + Math.random() * 1.1).toFixed(2));
  if (r < 0.88) return Number((2.85 + Math.random() * 1.65).toFixed(2));

  return Number((4.45 + Math.random() * 2.35).toFixed(2));
};

const getMultiplierAt = (elapsedMs: number) => {
  const t = elapsedMs / 1000;

  return 1 + t * 0.045 + t ** 2 * 0.022 + t ** 3 * 0.0019;
};

const getChartData = (multiplier: number, phase: Phase) => {
  const isCrash = phase === 'crashed' || phase === 'reveal' || phase === 'gameover';
  const progress = clamp(Math.log(Math.max(multiplier, 1)) / Math.log(9), 0, 1);
  const steps = 42;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= steps; i += 1) {
    const p = (i / steps) * progress;
    const x = 18 + p * 326;
    const curve = Math.pow(p, 1.58);
    const micro = Math.sin(p * 23) * 2.3 + Math.sin(p * 9) * 1.7;
    const y = 196 - curve * 134 + micro;

    points.push({ x, y });
  }

  if (isCrash) {
    const last = points[points.length - 1];

    points.push({
      x: clamp(last.x + 16, 22, 354),
      y: clamp(last.y + 42, 92, 206),
    });

    points.push({
      x: clamp(last.x + 35, 38, 356),
      y: 209,
    });
  }

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} 220 L 18 220 Z`;
  const end = points[points.length - 1];

  return {
    path,
    areaPath,
    endX: end.x,
    endY: end.y,
    progress,
  };
};

export const CrashDuelGame = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(1);
  const [multiplier, setMultiplier] = useState(1);
  const [userCashout, setUserCashout] = useState<number | null>(null);
  const [botCashoutReveal, setBotCashoutReveal] = useState<number | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [totals, setTotals] = useState<Totals>({
    user: 0,
    bot: 0,
  });

  const rafRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const crashPointRef = useRef(2);
  const botTargetRef = useRef(2);
  const userCashoutRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const pulseRef = useRef({
    x2: false,
    x3: false,
    x5: false,
  });

  const chart = useMemo(() => getChartData(multiplier, phase), [multiplier, phase]);
  const isRunning = phase === 'running';
  const isCrashVisual = phase === 'crashed' || phase === 'reveal' || phase === 'gameover';
  const currentPotential = Math.round(multiplier * BASE_POINTS);
  const securedPoints = userCashout ? Math.round(userCashout * BASE_POINTS) : 0;
  const heat = clamp((multiplier - 1) / 5, 0, 1);

  const finalWinner: FinalWinner = useMemo(() => {
    if (totals.user === totals.bot) return 'draw';

    return totals.user > totals.bot ? 'user' : 'bot';
  }, [totals]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }

      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  const finishRound = (displayMultiplier?: number) => {
    if (finishedRef.current) return;

    finishedRef.current = true;

    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }

    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }

    const realCrashPoint = crashPointRef.current;
    const botTarget = botTargetRef.current;
    const finalMultiplier = displayMultiplier || realCrashPoint;

    const hiddenBotCashout = botTarget < realCrashPoint ? botTarget : null;
    const finalUserCashout = userCashoutRef.current;

    const userPoints = finalUserCashout ? Math.round(finalUserCashout * BASE_POINTS) : 0;
    const botPoints = hiddenBotCashout ? Math.round(hiddenBotCashout * BASE_POINTS) : 0;

    const nextOutcome: RoundOutcome = {
      crashPoint: realCrashPoint,
      userCashout: finalUserCashout,
      botCashout: hiddenBotCashout,
      userPoints,
      botPoints,
    };

    setMultiplier(Number(finalMultiplier.toFixed(2)));
    setCrashPoint(realCrashPoint);
    setBotCashoutReveal(hiddenBotCashout);
    setOutcome(nextOutcome);
    setPhase('crashed');

    setTotals((prev) => ({
      user: prev.user + userPoints,
      bot: prev.bot + botPoints,
    }));

    if (!finalUserCashout) {
      hapticNotify('error');
    } else if (userPoints >= botPoints) {
      hapticNotify('success');
    } else {
      hapticNotify('warning');
    }

    revealTimerRef.current = window.setTimeout(() => {
      setPhase('reveal');
    }, REVEAL_DELAY_MS);
  };

  const startRound = () => {
    const nextCrashPoint = generateCrashPoint();
    const nextBotTarget = generateBotTarget();

    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }

    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }

    crashPointRef.current = nextCrashPoint;
    botTargetRef.current = nextBotTarget;
    userCashoutRef.current = null;
    finishedRef.current = false;
    pulseRef.current = {
      x2: false,
      x3: false,
      x5: false,
    };

    setPhase('running');
    setMultiplier(1);
    setUserCashout(null);
    setBotCashoutReveal(null);
    setCrashPoint(null);
    setOutcome(null);

    hapticSelect();

    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const nextMultiplier = getMultiplierAt(now - startedAtRef.current);
      const rounded = Number(nextMultiplier.toFixed(2));

      if (!pulseRef.current.x2 && rounded >= 2) {
        pulseRef.current.x2 = true;
        hapticImpact('light');
      }

      if (!pulseRef.current.x3 && rounded >= 3) {
        pulseRef.current.x3 = true;
        hapticImpact('medium');
      }

      if (!pulseRef.current.x5 && rounded >= 5) {
        pulseRef.current.x5 = true;
        hapticImpact('medium');
      }

      if (nextMultiplier >= crashPointRef.current) {
        finishRound(crashPointRef.current);
        return;
      }

      setMultiplier(rounded);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  };

  const cashOut = () => {
    if (!isRunning || userCashoutRef.current) return;

    const lockedValue = Number(multiplier.toFixed(2));

    userCashoutRef.current = lockedValue;
    setUserCashout(lockedValue);
    hapticImpact('heavy');
  };

  const nextRound = () => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }

    if (round >= TOTAL_ROUNDS) {
      setPhase('gameover');
      return;
    }

    setRound((value) => value + 1);
    setMultiplier(1);
    setUserCashout(null);
    setBotCashoutReveal(null);
    setCrashPoint(null);
    setOutcome(null);
    setPhase('ready');
  };

  const restart = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }

    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }

    setPhase('ready');
    setRound(1);
    setMultiplier(1);
    setUserCashout(null);
    setBotCashoutReveal(null);
    setCrashPoint(null);
    setOutcome(null);
    setTotals({
      user: 0,
      bot: 0,
    });

    userCashoutRef.current = null;
    finishedRef.current = false;
  };

  const phaseLabel =
    phase === 'ready'
      ? 'Ready'
      : phase === 'running'
        ? 'Live'
        : phase === 'crashed'
          ? 'Crash'
          : phase === 'reveal'
            ? 'Reveal'
            : 'Final';

  return (
    <div
      className="cd-page"
      style={cssVars({
        '--end-x': chart.endX,
        '--end-y': chart.endY,
        '--heat': heat,
      })}
    >
      <style>{`
        .cd-page {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 7px;
          color: white;
          background:
            radial-gradient(circle at 18% 0%, rgba(34,211,238,.14), transparent 32%),
            radial-gradient(circle at 86% 10%, rgba(168,85,247,.15), transparent 32%),
            radial-gradient(circle at 50% 100%, rgba(34,197,94,.10), transparent 34%),
            linear-gradient(180deg, #02040c 0%, #050610 52%, #02030a 100%);
          user-select: none;
        }

        .cd-page * {
          box-sizing: border-box;
        }

        .cd-page::before {
          content: "";
          position: absolute;
          inset: -28%;
          pointer-events: none;
          opacity: .075;
          background:
            linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
          background-size: 36px 36px;
          transform: rotate(-8deg);
          animation: cdGrid 10s linear infinite;
          mask-image: radial-gradient(circle at 50% 38%, black, transparent 74%);
        }

        .cd-top {
          position: relative;
          z-index: 8;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
        }

        .cd-back {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.052);
          color: rgba(255,255,255,.78);
          backdrop-filter: blur(18px);
        }

        .cd-score-hud {
          position: relative;
          min-height: 44px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 8px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.075), transparent 70%),
            rgba(255,255,255,.045);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            0 14px 46px rgba(0,0,0,.28);
          backdrop-filter: blur(18px);
          padding: 7px 8px;
          overflow: hidden;
        }

        .cd-score-hud::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(34,197,94,.12), transparent 28%, transparent 72%, rgba(34,211,238,.12));
        }

        .cd-hud-player {
          position: relative;
          z-index: 2;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .cd-hud-player-bot {
          justify-content: flex-end;
          text-align: right;
        }

        .cd-hud-icon {
          width: 27px;
          height: 27px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: rgba(255,255,255,.075);
          color: rgba(255,255,255,.78);
        }

        .cd-hud-player span {
          display: block;
          color: rgba(255,255,255,.36);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .cd-hud-player b {
          display: block;
          margin-top: 4px;
          color: white;
          font-size: 17px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.045em;
        }

        .cd-hud-center {
          position: relative;
          z-index: 2;
          min-width: 58px;
          display: grid;
          justify-items: center;
          gap: 4px;
        }

        .cd-hud-title {
          color: rgba(255,255,255,.50);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .cd-round-dots {
          display: flex;
          gap: 3px;
        }

        .cd-round-dot {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: rgba(255,255,255,.16);
        }

        .cd-round-dot-active {
          background: #22c55e;
          box-shadow: 0 0 12px rgba(34,197,94,.75);
        }

        .cd-phase {
          min-height: 16px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.56);
          padding: 0 7px;
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .cd-arena {
          position: relative;
          z-index: 3;
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.10);
          background:
            radial-gradient(circle at 50% 16%, rgba(255,255,255,.085), transparent 34%),
            radial-gradient(circle at 18% 22%, rgba(34,211,238,.13), transparent 28%),
            radial-gradient(circle at 82% 74%, rgba(34,197,94,.11), transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
            rgba(2,6,23,.76);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.11),
            inset 0 -50px 90px rgba(0,0,0,.38),
            0 24px 80px rgba(0,0,0,.44);
          backdrop-filter: blur(24px);
        }

        .cd-arena::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .17;
          background:
            linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
          background-size: 31px 31px;
          mask-image: radial-gradient(circle at 50% 46%, black, transparent 72%);
        }

        .cd-arena::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 50%, rgba(0,0,0,.48) 100%),
            linear-gradient(180deg, rgba(255,255,255,.035), transparent 34%, rgba(0,0,0,.22));
        }

        .cd-energy-orb {
          position: absolute;
          z-index: 1;
          width: 230px;
          height: 230px;
          border-radius: 999px;
          background:
            radial-gradient(circle, rgba(34,197,94, calc(.12 + var(--heat) * .26)) 0%, rgba(34,211,238,.09) 36%, transparent 68%);
          left: calc(${(chart.endX / 360) * 100}% - 115px);
          top: calc(${(chart.endY / 220) * 100}% - 115px);
          filter: blur(4px);
          transition: left .08s linear, top .08s linear;
        }

        .cd-aurora {
          position: absolute;
          z-index: 1;
          inset: 0;
          pointer-events: none;
          opacity: ${isCrashVisual ? '.28' : '.42'};
          background:
            linear-gradient(115deg, transparent 0%, rgba(34,197,94,.07) 30%, transparent 54%),
            linear-gradient(245deg, transparent 6%, rgba(34,211,238,.07) 38%, transparent 68%);
          animation: cdAurora 4.8s ease-in-out infinite alternate;
        }

        .cd-depth-bars {
          position: absolute;
          z-index: 1;
          left: 18px;
          right: 18px;
          bottom: 22px;
          height: 76px;
          display: flex;
          align-items: end;
          gap: 5px;
          opacity: ${isCrashVisual ? '.2' : '.38'};
        }

        .cd-depth-bar {
          flex: 1;
          min-width: 0;
          border-radius: 999px 999px 0 0;
          background: linear-gradient(180deg, rgba(34,197,94,.48), rgba(34,197,94,.04));
          height: var(--bar-height);
          animation: cdBarPulse 1.8s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .cd-chart {
          position: absolute;
          inset: 78px 13px 22px;
          z-index: 2;
        }

        .cd-chart svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .cd-area {
          opacity: ${isCrashVisual ? '.23' : '.4'};
          transition: opacity .25s ease;
        }

        .cd-line-glow-wide {
          fill: none;
          stroke: ${isCrashVisual ? 'rgba(248,113,113,.22)' : 'rgba(34,197,94,.20)'};
          stroke-width: 32;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: blur(19px);
        }

        .cd-line-glow {
          fill: none;
          stroke: ${isCrashVisual ? 'rgba(248,113,113,.44)' : 'rgba(34,197,94,.38)'};
          stroke-width: 18;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: blur(10px);
        }

        .cd-line {
          fill: none;
          stroke: ${isCrashVisual ? '#fb7185' : '#22c55e'};
          stroke-width: 6.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 17px ${isCrashVisual ? 'rgba(248,113,113,.66)' : 'rgba(34,197,94,.62)'});
        }

        .cd-line-hot {
          fill: none;
          stroke: ${isCrashVisual ? 'rgba(254,202,202,.78)' : 'rgba(187,247,208,.82)'};
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .92;
        }

        .cd-point {
          position: absolute;
          z-index: 5;
          left: calc(${(chart.endX / 360) * 100}%);
          top: calc(${(chart.endY / 220) * 100}%);
          width: 17px;
          height: 17px;
          border-radius: 999px;
          border: 3px solid white;
          background: ${isCrashVisual ? '#fb7185' : '#22c55e'};
          box-shadow:
            0 0 30px ${isCrashVisual ? 'rgba(248,113,113,.9)' : 'rgba(34,197,94,.86)'},
            0 0 78px ${isCrashVisual ? 'rgba(248,113,113,.38)' : 'rgba(34,197,94,.30)'};
          transform: translate(-50%, -50%);
          transition: left .08s linear, top .08s linear, background .2s ease;
        }

        .cd-point::before {
          content: "";
          position: absolute;
          inset: -13px;
          border-radius: inherit;
          border: 1px solid ${isCrashVisual ? 'rgba(248,113,113,.48)' : 'rgba(34,197,94,.44)'};
          animation: cdPulse 1.15s ease-in-out infinite;
        }

        .cd-point::after {
          content: "";
          position: absolute;
          inset: -24px;
          border-radius: inherit;
          background: radial-gradient(circle, ${isCrashVisual ? 'rgba(248,113,113,.18)' : 'rgba(34,197,94,.18)'}, transparent 65%);
          animation: cdHalo 1.8s ease-in-out infinite;
        }

        .cd-spark {
          position: absolute;
          z-index: 4;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: ${isCrashVisual ? '#fb7185' : '#bbf7d0'};
          left: calc(${(chart.endX / 360) * 100}%);
          top: calc(${(chart.endY / 220) * 100}%);
          box-shadow: 0 0 14px currentColor;
          opacity: ${phase === 'running' ? '.9' : '0'};
          animation: cdSpark 1.2s ease-out infinite;
        }

        .cd-spark-b {
          animation-delay: .22s;
        }

        .cd-spark-c {
          animation-delay: .44s;
        }

        .cd-spark-d {
          animation-delay: .66s;
        }

        .cd-market-hud {
          position: absolute;
          z-index: 8;
          top: 13px;
          left: 13px;
          right: 13px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: start;
          gap: 10px;
          pointer-events: none;
        }

        .cd-x-block {
          min-width: 0;
        }

        .cd-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.24);
          color: rgba(255,255,255,.62);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
          backdrop-filter: blur(14px);
        }

        .cd-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: ${isCrashVisual ? '#ef4444' : phase === 'ready' ? '#94a3b8' : '#22c55e'};
          box-shadow: 0 0 16px ${isCrashVisual ? 'rgba(239,68,68,.82)' : phase === 'ready' ? 'rgba(148,163,184,.55)' : 'rgba(34,197,94,.82)'};
        }

        .cd-x {
          margin-top: 8px;
          font-size: clamp(58px, 17vw, 92px);
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.085em;
          color: ${isCrashVisual ? '#fca5a5' : 'white'};
          text-shadow:
            0 0 30px ${isCrashVisual ? 'rgba(248,113,113,.38)' : 'rgba(34,197,94,.28)'},
            0 28px 80px rgba(0,0,0,.50);
          animation: ${phase === 'crashed' ? 'cdCrashText .42s ease both' : 'none'};
        }

        .cd-small-state {
          align-self: start;
          min-width: 92px;
          border-radius: 17px;
          border: 1px solid rgba(255,255,255,.085);
          background: rgba(0,0,0,.22);
          padding: 9px;
          text-align: right;
          backdrop-filter: blur(14px);
        }

        .cd-small-state span {
          display: block;
          color: rgba(255,255,255,.36);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .cd-small-state b {
          display: block;
          margin-top: 5px;
          color: ${userCashout ? '#86efac' : 'white'};
          font-size: 17px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.03em;
        }

        .cd-crash-flash {
          position: absolute;
          z-index: 7;
          left: calc(${(chart.endX / 360) * 100}%);
          top: calc(${(chart.endY / 220) * 100}%);
          width: 250px;
          height: 250px;
          pointer-events: none;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          background:
            radial-gradient(circle, rgba(252,165,165,.88) 0%, rgba(251,113,133,.46) 24%, rgba(239,68,68,.14) 47%, transparent 70%);
          opacity: ${phase === 'crashed' ? '1' : '0'};
          animation: ${phase === 'crashed' ? 'cdCrashFlash .72s ease both' : 'none'};
        }

        .cd-actions {
          position: relative;
          z-index: 8;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at 50% 0%, rgba(34,197,94,.10), transparent 64%),
            linear-gradient(180deg, rgba(255,255,255,.064), rgba(255,255,255,.024)),
            rgba(2,6,23,.88);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 18px 60px rgba(0,0,0,.34);
          backdrop-filter: blur(22px);
          padding: 10px;
        }

        .cd-action-top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 8px;
        }

        .cd-action-top span {
          display: block;
          color: rgba(255,255,255,.40);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .cd-action-top b {
          display: block;
          margin-top: 4px;
          color: white;
          font-size: 24px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.065em;
        }

        .cd-status-pill {
          min-height: 30px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.085);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.62);
          padding: 0 10px;
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .cd-main-button {
          width: 100%;
          min-height: 52px;
          border: 0;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background:
            linear-gradient(135deg, #bbf7d0 0%, #22c55e 40%, #22d3ee 100%);
          color: #020617;
          font-size: 12px;
          font-weight: 1000;
          letter-spacing: .13em;
          text-transform: uppercase;
          box-shadow:
            0 18px 45px rgba(34,197,94,.17),
            inset 0 2px 0 rgba(255,255,255,.40);
          transition: transform .12s ease, opacity .15s ease;
        }

        .cd-main-button:active {
          transform: scale(.985);
        }

        .cd-main-button:disabled {
          opacity: .54;
        }

        .cd-main-button-wait {
          background:
            linear-gradient(135deg, #e2e8f0 0%, #94a3b8 46%, #64748b 100%);
        }

        .cd-reveal {
          position: absolute;
          z-index: 40;
          inset: 0;
          display: ${phase === 'reveal' ? 'grid' : 'none'};
          place-items: end center;
          padding: 10px;
          background:
            linear-gradient(180deg, transparent 0%, rgba(2,6,23,.16) 34%, rgba(2,6,23,.88) 100%);
          pointer-events: none;
        }

        .cd-reveal-card {
          width: min(100%, 408px);
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.12);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.12), transparent 50%),
            linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.038)),
            rgba(2,6,23,.94);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.13),
            0 30px 110px rgba(0,0,0,.66);
          backdrop-filter: blur(28px);
          padding: 14px;
          animation: cdRevealIn .42s cubic-bezier(.16,1.15,.28,1) both;
          pointer-events: auto;
        }

        .cd-reveal-head {
          text-align: center;
          margin-bottom: 10px;
        }

        .cd-reveal-head small {
          color: rgba(255,255,255,.40);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .22em;
          text-transform: uppercase;
        }

        .cd-reveal-head h2 {
          margin: 6px 0 0;
          color: white;
          font-size: 31px;
          line-height: .86;
          font-weight: 1000;
          letter-spacing: -.085em;
        }

        .cd-reveal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }

        .cd-reveal-box {
          min-height: 88px;
          display: grid;
          place-items: center;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.085);
          background: rgba(255,255,255,.05);
          text-align: center;
          animation: cdRevealBox .34s ease both;
        }

        .cd-reveal-box:nth-child(2) {
          animation-delay: .12s;
        }

        .cd-reveal-box span {
          color: rgba(255,255,255,.40);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .cd-reveal-box b {
          display: block;
          margin-top: 7px;
          color: white;
          font-size: 27px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.075em;
        }

        .cd-reveal-box em {
          display: block;
          margin-top: 7px;
          color: rgba(255,255,255,.48);
          font-size: 9px;
          font-style: normal;
          font-weight: 850;
        }

        .cd-crash-box {
          margin-top: 7px;
          min-height: 52px;
          display: grid;
          place-items: center;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.085);
          background:
            radial-gradient(circle at 50% 0%, rgba(248,113,113,.12), transparent 70%),
            rgba(255,255,255,.042);
          text-align: center;
          color: rgba(255,255,255,.68);
          font-size: 11px;
          font-weight: 900;
          line-height: 1.3;
          padding: 0 12px;
        }

        .cd-crash-box b {
          color: #fca5a5;
          font-weight: 1000;
        }

        .cd-reveal-action {
          margin-top: 8px;
        }

        .cd-final {
          display: ${phase === 'gameover' ? 'grid' : 'none'};
          position: absolute;
          z-index: 50;
          inset: 0;
          place-items: center;
          padding: 10px;
          background:
            radial-gradient(circle at 50% 18%, rgba(34,197,94,.18), transparent 34%),
            radial-gradient(circle at 50% 86%, rgba(168,85,247,.18), transparent 34%),
            rgba(2,6,23,.90);
          backdrop-filter: blur(18px);
          animation: cdFinalIn .35s ease both;
        }

        .cd-final-card {
          width: min(100%, 406px);
          overflow: hidden;
          border-radius: 32px;
          border: 1px solid rgba(255,255,255,.13);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.13), transparent 46%),
            linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.034)),
            rgba(2,6,23,.94);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.13),
            0 34px 120px rgba(0,0,0,.66);
          padding: 16px;
          text-align: center;
        }

        .cd-final-icon {
          width: 68px;
          height: 68px;
          display: grid;
          place-items: center;
          margin: 0 auto 12px;
          border-radius: 25px;
          border: 1px solid rgba(255,255,255,.11);
          background:
            radial-gradient(circle at 50% 0%, rgba(250,204,21,.18), transparent 70%),
            rgba(255,255,255,.055);
          color: #fde68a;
        }

        .cd-final-card h2 {
          margin: 0;
          color: white;
          font-size: 35px;
          line-height: .86;
          font-weight: 1000;
          letter-spacing: -.085em;
        }

        .cd-final-card p {
          max-width: 310px;
          margin: 9px auto 12px;
          color: rgba(255,255,255,.55);
          font-size: 11px;
          line-height: 1.35;
          font-weight: 780;
        }

        .cd-final-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          margin-bottom: 10px;
        }

        .cd-final-score {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.085);
          background: rgba(255,255,255,.048);
          padding: 12px 8px;
        }

        .cd-final-score span {
          color: rgba(255,255,255,.38);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .cd-final-score b {
          display: block;
          margin-top: 7px;
          color: white;
          font-size: 27px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.075em;
        }

        .cd-secondary {
          width: 100%;
          min-height: 42px;
          margin-top: 7px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.07);
          color: rgba(255,255,255,.76);
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        @keyframes cdGrid {
          from {
            transform: rotate(-8deg) translateY(0);
          }

          to {
            transform: rotate(-8deg) translateY(36px);
          }
        }

        @keyframes cdAurora {
          from {
            transform: translateX(-18px) skewX(-6deg);
          }

          to {
            transform: translateX(18px) skewX(6deg);
          }
        }

        @keyframes cdPulse {
          0%, 100% {
            opacity: .36;
            transform: scale(.82);
          }

          50% {
            opacity: .9;
            transform: scale(1.2);
          }
        }

        @keyframes cdHalo {
          0%, 100% {
            opacity: .45;
            transform: scale(.86);
          }

          50% {
            opacity: .9;
            transform: scale(1.15);
          }
        }

        @keyframes cdBarPulse {
          0%, 100% {
            opacity: .45;
            transform: scaleY(.92);
          }

          50% {
            opacity: .86;
            transform: scaleY(1.08);
          }
        }

        @keyframes cdSpark {
          0% {
            opacity: .95;
            transform: translate(-50%, -50%) scale(1);
          }

          100% {
            opacity: 0;
            transform: translate(calc(-50% - 36px), calc(-50% + 26px)) scale(.25);
          }
        }

        @keyframes cdCrashFlash {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(.18);
            filter: blur(0);
          }

          44% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }

          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.65);
            filter: blur(14px);
          }
        }

        @keyframes cdCrashText {
          0% {
            transform: scale(1);
            filter: blur(0);
          }

          38% {
            transform: scale(1.08) rotate(-1deg);
            filter: blur(1px);
          }

          100% {
            transform: scale(1);
            filter: blur(0);
          }
        }

        @keyframes cdRevealIn {
          from {
            opacity: 0;
            transform: translateY(24px) scale(.95);
            filter: blur(12px);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes cdRevealBox {
          from {
            opacity: 0;
            transform: scale(.92) translateY(8px);
            filter: blur(8px);
          }

          to {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0);
          }
        }

        @keyframes cdFinalIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @media (max-height: 720px) {
          .cd-page {
            gap: 5px;
            padding: 6px;
          }

          .cd-back {
            width: 32px;
            height: 32px;
            border-radius: 13px;
          }

          .cd-score-hud {
            min-height: 40px;
            border-radius: 18px;
            padding: 6px 7px;
          }

          .cd-hud-icon {
            width: 24px;
            height: 24px;
            border-radius: 10px;
          }

          .cd-hud-player b {
            font-size: 15px;
          }

          .cd-arena {
            border-radius: 26px;
          }

          .cd-chart {
            inset: 70px 11px 20px;
          }

          .cd-x {
            font-size: clamp(52px, 16vw, 76px);
          }

          .cd-actions {
            padding: 8px;
            border-radius: 22px;
          }

          .cd-action-top {
            margin-bottom: 7px;
          }

          .cd-action-top b {
            font-size: 22px;
          }

          .cd-main-button {
            min-height: 47px;
          }

          .cd-reveal-card {
            padding: 12px;
            border-radius: 27px;
          }

          .cd-reveal-head h2 {
            font-size: 28px;
          }

          .cd-reveal-box {
            min-height: 80px;
          }

          .cd-crash-box {
            min-height: 48px;
          }
        }
      `}</style>

      <header className="cd-top">
        <button type="button" className="cd-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={17} />
        </button>

        <div className="cd-score-hud">
          <div className="cd-hud-player">
            <div className="cd-hud-icon">
              <Shield size={13} />
            </div>

            <div>
              <span>You</span>
              <b>{formatPoints(totals.user)}</b>
            </div>
          </div>

          <div className="cd-hud-center">
            <div className="cd-hud-title">Crash</div>

            <div className="cd-round-dots">
              {Array.from({ length: TOTAL_ROUNDS }).map((_, index) => (
                <i
                  key={index}
                  className={`cd-round-dot ${index < round ? 'cd-round-dot-active' : ''}`}
                />
              ))}
            </div>

            <div className="cd-phase">{phaseLabel}</div>
          </div>

          <div className="cd-hud-player cd-hud-player-bot">
            <div>
              <span>Bot</span>
              <b>{formatPoints(totals.bot)}</b>
            </div>

            <div className="cd-hud-icon">
              <Bot size={13} />
            </div>
          </div>
        </div>
      </header>

      <section className="cd-arena">
        <div className="cd-energy-orb" />
        <div className="cd-aurora" />

        <div className="cd-depth-bars">
          {Array.from({ length: 20 }).map((_, index) => (
            <i
              key={index}
              className="cd-depth-bar"
              style={cssVars({
                '--bar-height': `${16 + ((index * 23) % 58)}px`,
                '--delay': `${index * 0.052}s`,
              })}
            />
          ))}
        </div>

        <div className="cd-chart">
          <svg viewBox="0 0 360 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cdArea" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isCrashVisual ? '#fb7185' : '#22c55e'}
                  stopOpacity="0.36"
                />
                <stop
                  offset="100%"
                  stopColor={isCrashVisual ? '#fb7185' : '#22c55e'}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            <path className="cd-area" d={chart.areaPath} fill="url(#cdArea)" />
            <path className="cd-line-glow-wide" d={chart.path} />
            <path className="cd-line-glow" d={chart.path} />
            <path className="cd-line" d={chart.path} />
            <path className="cd-line-hot" d={chart.path} />
          </svg>

          <div className="cd-point" />
          <div className="cd-spark cd-spark-a" />
          <div className="cd-spark cd-spark-b" />
          <div className="cd-spark cd-spark-c" />
          <div className="cd-spark cd-spark-d" />
        </div>

        <div className="cd-crash-flash" />

        <div className="cd-market-hud">
          <div className="cd-x-block">
            <div className="cd-live-pill">
              <span className="cd-live-dot" />
              {phase === 'ready'
                ? 'waiting'
                : phase === 'running'
                  ? 'live'
                  : phase === 'crashed'
                    ? 'crashed'
                    : 'revealed'}
            </div>

            <div className="cd-x">
              {phase === 'ready'
                ? '1.00x'
                : isCrashVisual && crashPoint
                  ? formatX(crashPoint)
                  : formatX(multiplier)}
            </div>
          </div>

          <div className="cd-small-state">
            <span>Your exit</span>
            <b>{userCashout ? formatX(userCashout) : phase === 'crashed' || phase === 'reveal' ? 'crash' : '—'}</b>
          </div>
        </div>
      </section>

      <section className="cd-actions">
        <div className="cd-action-top">
          <div>
            <span>
              {phase === 'running'
                ? userCashout
                  ? 'secured'
                  : 'current'
                : phase === 'ready'
                  ? 'base'
                  : 'round'}
            </span>

            <b>
              {phase === 'running'
                ? formatPoints(userCashout ? securedPoints : currentPotential)
                : outcome
                  ? `+${formatPoints(outcome.userPoints)}`
                  : formatPoints(BASE_POINTS)}
            </b>
          </div>

          <div className="cd-status-pill">
            {userCashout ? 'safe' : phase === 'running' ? 'risk' : 'x100'}
          </div>
        </div>

        {phase === 'ready' && (
          <button type="button" className="cd-main-button" onClick={startRound}>
            <Zap size={17} />
            Start
          </button>
        )}

        {phase === 'running' && (
          <button
            type="button"
            className={`cd-main-button ${userCashout ? 'cd-main-button-wait' : ''}`}
            disabled={Boolean(userCashout)}
            onClick={cashOut}
          >
            <Zap size={17} />
            {userCashout ? `Secured ${formatX(userCashout)}` : `Cash out ${formatX(multiplier)}`}
          </button>
        )}

        {phase === 'crashed' && (
          <button type="button" className="cd-main-button cd-main-button-wait" disabled>
            Revealing...
          </button>
        )}

        {phase === 'reveal' && (
          <button type="button" className="cd-main-button" onClick={nextRound}>
            {round >= TOTAL_ROUNDS ? <Trophy size={17} /> : <ChevronRight size={17} />}
            {round >= TOTAL_ROUNDS ? 'Final' : 'Next'}
          </button>
        )}

        {phase === 'gameover' && (
          <button type="button" className="cd-main-button" onClick={restart}>
            <RefreshCw size={17} />
            New match
          </button>
        )}
      </section>

      {phase === 'reveal' && outcome && (
        <section className="cd-reveal">
          <div className="cd-reveal-card">
            <div className="cd-reveal-head">
              <small>positions opened</small>
              <h2>Round score</h2>
            </div>

            <div className="cd-reveal-grid">
              <div className="cd-reveal-box">
                <div>
                  <span>You</span>
                  <b>{outcome.userCashout ? formatX(outcome.userCashout) : 'crash'}</b>
                  <em>+{formatPoints(outcome.userPoints)}</em>
                </div>
              </div>

              <div className="cd-reveal-box">
                <div>
                  <span>Bot</span>
                  <b>{outcome.botCashout ? formatX(outcome.botCashout) : 'crash'}</b>
                  <em>+{formatPoints(outcome.botPoints)}</em>
                </div>
              </div>
            </div>

            <div className="cd-crash-box">
              <span>
                Crash at <b>{formatX(outcome.crashPoint)}</b>. Очки добавлены в общий счёт.
              </span>
            </div>

            <div className="cd-reveal-action">
              <button type="button" className="cd-main-button" onClick={nextRound}>
                {round >= TOTAL_ROUNDS ? <Trophy size={17} /> : <ChevronRight size={17} />}
                {round >= TOTAL_ROUNDS ? 'Final' : 'Next'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="cd-final">
        <div className="cd-final-card">
          <div className="cd-final-icon">
            {finalWinner === 'user' ? <Trophy size={32} /> : finalWinner === 'bot' ? <Bot size={32} /> : <Sparkles size={32} />}
          </div>

          <h2>
            {finalWinner === 'draw'
              ? 'Draw'
              : finalWinner === 'user'
                ? 'You win'
                : 'Bot wins'}
          </h2>

          <p>Победитель определяется только по сумме очков за 5 раундов.</p>

          <div className="cd-final-grid">
            <div className="cd-final-score">
              <span>You</span>
              <b>{formatPoints(totals.user)}</b>
            </div>

            <div className="cd-final-score">
              <span>Bot</span>
              <b>{formatPoints(totals.bot)}</b>
            </div>
          </div>

          <button type="button" className="cd-main-button" onClick={restart}>
            <RefreshCw size={17} />
            New match
          </button>

          <button type="button" className="cd-secondary" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </section>
    </div>
  );
};

export default CrashDuelGame;