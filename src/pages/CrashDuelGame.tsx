import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Bot, ChevronRight, RefreshCw, Shield, Sparkles, Trophy, Zap } from 'lucide-react';
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

type Totals = { user: number; bot: number };

type HapticFeedback = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = { HapticFeedback?: HapticFeedback };

const TOTAL_ROUNDS = 5;
const BASE_POINTS = 100;
const REVEAL_DELAY_MS = 1700;
const CHART_STEPS = 36;

// Chart coordinate space (matches the SVG viewBox below).
const VIEW_W = 360;
const VIEW_H = 220;

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatX = (value: number) => `${value.toFixed(2)}x`;
const formatPoints = (value: number) => value.toLocaleString('ru-RU');

const getTg = () => (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

const fallbackVibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
};

const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  getTg()?.HapticFeedback?.impactOccurred?.(style);
  if (style === 'heavy') return fallbackVibrate([28, 24, 34]);
  if (style === 'medium') return fallbackVibrate(18);
  return fallbackVibrate(8);
};

const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  getTg()?.HapticFeedback?.notificationOccurred?.(type);
  if (type === 'error') return fallbackVibrate([36, 28, 46]);
  if (type === 'warning') return fallbackVibrate([18, 22, 18]);
  return fallbackVibrate([12, 18, 12]);
};

const hapticSelect = () => {
  getTg()?.HapticFeedback?.selectionChanged?.();
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

type ChartData = {
  path: string;
  areaPath: string;
  endX: number;
  endY: number;
  progress: number;
};

const getChartData = (multiplier: number, crashed: boolean): ChartData => {
  const progress = clamp(Math.log(Math.max(multiplier, 1)) / Math.log(9), 0, 1);
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= CHART_STEPS; i += 1) {
    const p = (i / CHART_STEPS) * progress;
    const x = 18 + p * 326;
    const curve = Math.pow(p, 1.58);
    const micro = Math.sin(p * 23) * 2.1 + Math.sin(p * 9) * 1.5;
    const y = 196 - curve * 134 + micro;
    points.push({ x, y });
  }

  if (crashed) {
    const last = points[points.length - 1];
    points.push({ x: clamp(last.x + 16, 22, 354), y: clamp(last.y + 42, 92, 206) });
    points.push({ x: clamp(last.x + 35, 38, 356), y: 209 });
  }

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const end = points[points.length - 1];
  const areaPath = `${path} L ${end.x.toFixed(1)} 220 L 18 220 Z`;

  return { path, areaPath, endX: end.x, endY: end.y, progress };
};

// Exact point on the trajectory for a given multiplier (used to lock the
// static shield / bot markers onto the curve without touching the rAF loop).
const curvePctAt = (multiplier: number): CSSProperties => {
  const { endX, endY } = getChartData(multiplier, false);
  return { left: `${(endX / VIEW_W) * 100}%`, top: `${(endY / VIEW_H) * 100}%` };
};

export const CrashDuelGame = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(1);
  const [multiplier, setMultiplier] = useState(1);
  const [userCashout, setUserCashout] = useState<number | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [totals, setTotals] = useState<Totals>({ user: 0, bot: 0 });

  // DOM refs driven imperatively during the run (keeps React out of the 60fps loop)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const xRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);
  const hotRef = useRef<SVGPathElement | null>(null);
  const potentialRef = useRef<HTMLElement | null>(null);
  const cashLabelRef = useRef<HTMLSpanElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const crashPointRef = useRef(2);
  const botTargetRef = useRef(2);
  const userCashoutRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const pulseRef = useRef({ x2: false, x3: false, x5: false });

  const isRunning = phase === 'running';
  const isCrashVisual = phase === 'crashed' || phase === 'reveal' || phase === 'gameover';

  // Live value: derived from elapsed time so any (rare) render during the run is exact.
  const liveMult = isRunning ? getMultiplierAt(performance.now() - startedAtRef.current) : multiplier;
  const chartMult = phase === 'ready' ? 1 : isCrashVisual && crashPoint ? crashPoint : liveMult;
  const chart = useMemo(() => getChartData(chartMult, isCrashVisual), [chartMult, isCrashVisual]);

  const heat = clamp((chartMult - 1) / 5, 0, 1);
  const bigXValue = phase === 'ready' ? 1 : isCrashVisual && crashPoint ? crashPoint : liveMult;
  const securedPoints = userCashout ? Math.round(userCashout * BASE_POINTS) : 0;
  const livePotential = Math.round(liveMult * BASE_POINTS);

  // Static on-curve markers (computed only on state change, never per frame).
  const userMarkerStyle = useMemo<CSSProperties | null>(
    () => (userCashout ? curvePctAt(userCashout) : null),
    [userCashout],
  );
  const botMarkerStyle = useMemo<CSSProperties | null>(
    () => (phase === 'reveal' && outcome?.botCashout ? curvePctAt(outcome.botCashout) : null),
    [phase, outcome],
  );

  const finalWinner: FinalWinner = useMemo(() => {
    if (totals.user === totals.bot) return 'draw';
    return totals.user > totals.bot ? 'user' : 'bot';
  }, [totals]);

  const stopRaf = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const clearRevealTimer = () => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopRaf();
      clearRevealTimer();
    };
  }, []);

  const finishRound = (displayMultiplier?: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    stopRaf();
    clearRevealTimer();

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
    setOutcome(nextOutcome);
    setPhase('crashed');
    setTotals((prev) => ({ user: prev.user + userPoints, bot: prev.bot + botPoints }));

    if (!finalUserCashout) hapticNotify('error');
    else if (userPoints >= botPoints) hapticNotify('success');
    else hapticNotify('warning');

    revealTimerRef.current = window.setTimeout(() => setPhase('reveal'), REVEAL_DELAY_MS);
  };

  const startRound = () => {
    if (phase !== 'ready') return;

    stopRaf();
    clearRevealTimer();

    crashPointRef.current = generateCrashPoint();
    botTargetRef.current = generateBotTarget();
    userCashoutRef.current = null;
    finishedRef.current = false;
    pulseRef.current = { x2: false, x3: false, x5: false };
    startedAtRef.current = performance.now();

    setMultiplier(1);
    setUserCashout(null);
    setCrashPoint(null);
    setOutcome(null);
    setPhase('running');
    hapticSelect();

    const tick = (now: number) => {
      const mult = getMultiplierAt(now - startedAtRef.current);
      const rounded = Number(mult.toFixed(2));

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

      if (mult >= crashPointRef.current) {
        finishRound(crashPointRef.current);
        return;
      }

      const root = rootRef.current;
      if (root) {
        const data = getChartData(mult, false);
        root.style.setProperty('--end-x', String(data.endX));
        root.style.setProperty('--end-y', String(data.endY));
        root.style.setProperty('--heat', String(clamp((mult - 1) / 5, 0, 1)));
        areaRef.current?.setAttribute('d', data.areaPath);
        glowRef.current?.setAttribute('d', data.path);
        lineRef.current?.setAttribute('d', data.path);
        hotRef.current?.setAttribute('d', data.path);
        if (xRef.current) xRef.current.textContent = formatX(mult);
        if (!userCashoutRef.current) {
          if (potentialRef.current) potentialRef.current.textContent = formatPoints(Math.round(mult * BASE_POINTS));
          if (cashLabelRef.current) cashLabelRef.current.textContent = `Cash out ${formatX(mult)}`;
        }
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  };

  const cashOut = () => {
    // finishedRef is the reliable guard — it flips synchronously the instant the
    // crash is detected, before React commits the phase change, so a tap landing
    // in that gap can never register a cash-out after the crash.
    if (finishedRef.current || userCashoutRef.current !== null) return;
    if (phase !== 'running') return;

    const lockedValue = Number(getMultiplierAt(performance.now() - startedAtRef.current).toFixed(2));
    userCashoutRef.current = lockedValue;
    setUserCashout(lockedValue);
    hapticImpact('heavy');
  };

  const nextRound = () => {
    clearRevealTimer();

    if (round >= TOTAL_ROUNDS) {
      setPhase('gameover');
      return;
    }

    setRound((value) => value + 1);
    setMultiplier(1);
    setUserCashout(null);
    setCrashPoint(null);
    setOutcome(null);
    setPhase('ready');
  };

  const restart = () => {
    stopRaf();
    clearRevealTimer();

    userCashoutRef.current = null;
    finishedRef.current = false;

    setRound(1);
    setMultiplier(1);
    setUserCashout(null);
    setCrashPoint(null);
    setOutcome(null);
    setTotals({ user: 0, bot: 0 });
    setPhase('ready');
  };

  const phaseLabel =
    phase === 'ready' ? 'Ready' : phase === 'running' ? 'Live' : phase === 'crashed' ? 'Crash' : phase === 'reveal' ? 'Reveal' : 'Final';

  return (
    <div
      ref={rootRef}
      className={`cd-page cd-ph-${phase} ${isCrashVisual ? 'cd-crash' : ''}`}
      style={cssVars({ '--end-x': chart.endX, '--end-y': chart.endY, '--heat': heat })}
    >
      <style>{`
        .cd-page {
          --ton: #2f8cff;
          --ton-rgb: 47,140,255;
          --coin: #f59e42;
          --coin-rgb: 245,158,66;
          --live: #52FFE5;
          --live-rgb: 82,255,229;
          --gold: #F2C766;
          --gold-rgb: 242,199,102;
          --crash: #FF6B8A;
          --crash-rgb: 255,107,138;
          --accent: var(--live);
          --accent-rgb: var(--live-rgb);
          --line: rgba(255,255,255,.07);
          --t2: rgba(255,255,255,.42);

          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 8px 8px max(8px, env(safe-area-inset-bottom));
          color: #fff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          user-select: none;
          /* Transparent on purpose — the game lives inside the existing app background. */
          background: transparent;
        }
        .cd-page.cd-crash { --accent: var(--crash); --accent-rgb: var(--crash-rgb); }
        .cd-page * { box-sizing: border-box; }

        /* -------------------------------------------------------- top HUD */

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
          border-radius: 12px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.04);
          color: rgba(255,255,255,.72);
        }
        .cd-back:active { transform: scale(.94); }

        .cd-score-hud {
          position: relative;
          min-height: 44px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 8px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.03);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
          padding: 7px 10px;
        }

        .cd-hud-player { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .cd-hud-player-bot { justify-content: flex-end; text-align: right; }

        .cd-hud-icon {
          width: 26px;
          height: 26px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(255,255,255,.05);
          color: rgba(255,255,255,.6);
        }
        .cd-hud-icon-user { color: var(--ton); background: rgba(47,140,255,.12); }

        .cd-hud-player span {
          display: block;
          color: rgba(255,255,255,.34);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cd-hud-player b {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 17px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.04em;
        }
        .cd-hud-player-user b { color: var(--ton); }

        .cd-hud-center { min-width: 56px; display: grid; justify-items: center; gap: 4px; }

        .cd-hud-title {
          color: rgba(255,255,255,.45);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .2em;
          text-transform: uppercase;
        }

        .cd-round-dots { display: flex; gap: 4px; }
        .cd-round-dot { width: 5px; height: 5px; border-radius: 999px; background: rgba(255,255,255,.14); transition: background .25s ease; }
        .cd-round-dot-active { background: var(--gold); box-shadow: 0 0 9px rgba(var(--gold-rgb),.5); }

        .cd-phase {
          min-height: 15px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: rgba(0,0,0,.28);
          color: rgba(255,255,255,.55);
          padding: 0 8px;
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .cd-ph-running .cd-phase { color: var(--live); }
        .cd-crash .cd-phase { color: var(--crash); }

        /* -------------------------------------------------------- arena */

        .cd-arena {
          position: relative;
          z-index: 3;
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid var(--line);
          /* Translucent dark glass: a contained stage, not a page background. */
          background:
            radial-gradient(circle at 50% 12%, rgba(var(--ton-rgb),.07), transparent 42%),
            radial-gradient(circle at 50% 92%, rgba(var(--live-rgb),.05), transparent 46%),
            linear-gradient(180deg, rgba(12,13,22,.66), rgba(5,5,9,.8));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), inset 0 -38px 64px rgba(0,0,0,.36);
        }

        .cd-arena::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .1;
          background:
            linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
          background-size: 32px 32px;
          -webkit-mask-image: radial-gradient(circle at 50% 44%, #000, transparent 72%);
          mask-image: radial-gradient(circle at 50% 44%, #000, transparent 72%);
        }

        .cd-arena::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, transparent 0 52%, rgba(0,0,0,.38) 100%);
        }

        .cd-chart { position: absolute; inset: 78px 13px 22px; z-index: 2; }
        .cd-chart svg { width: 100%; height: 100%; overflow: visible; }

        .cd-area { opacity: .9; transition: opacity .25s ease; }
        .cd-area-top { stop-color: var(--accent); stop-opacity: .22; }
        .cd-area-bot { stop-color: var(--accent); stop-opacity: 0; }

        /* Soft glow is a layered translucent stroke — no per-frame filter rasterisation. */
        .cd-line-glow {
          fill: none;
          stroke: var(--accent);
          stroke-width: 13;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .16;
          transition: stroke .2s ease;
        }
        .cd-line {
          fill: none;
          stroke: var(--accent);
          stroke-width: 4.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke .2s ease;
        }
        .cd-line-hot {
          fill: none;
          stroke: rgba(255,255,255,.82);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .75;
        }

        .cd-point {
          position: absolute;
          z-index: 5;
          left: calc(var(--end-x) / 360 * 100%);
          top: calc(var(--end-y) / 220 * 100%);
          width: 15px;
          height: 15px;
          border-radius: 999px;
          border: 2.5px solid #fff;
          background: var(--accent);
          box-shadow: 0 0 14px rgba(var(--accent-rgb), .75);
          transform: translate(-50%, -50%);
          transition: background .2s ease;
        }
        .cd-point::before {
          content: "";
          position: absolute;
          inset: -10px;
          border-radius: inherit;
          border: 1px solid rgba(var(--accent-rgb), .5);
          animation: cdPulse 1.2s ease-in-out infinite;
        }
        .cd-ph-crashed .cd-point::before,
        .cd-ph-reveal .cd-point::before,
        .cd-ph-gameover .cd-point::before { animation: none; opacity: 0; }

        /* on-curve cashout markers */
        .cd-marker {
          position: absolute;
          z-index: 6;
          width: 21px;
          height: 21px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          transform: translate(-50%, -50%);
          animation: cdMarkerIn .26s cubic-bezier(.16,1.1,.28,1) both;
        }
        .cd-marker-user {
          color: var(--live);
          background: rgba(var(--live-rgb), .16);
          border: 1px solid rgba(var(--live-rgb), .55);
          box-shadow: 0 0 12px rgba(var(--live-rgb), .35);
        }
        .cd-marker-bot {
          color: #cbd5e1;
          background: rgba(148,163,184,.16);
          border: 1px solid rgba(148,163,184,.5);
        }

        .cd-crash-flash {
          position: absolute;
          z-index: 7;
          left: calc(var(--end-x) / 360 * 100%);
          top: calc(var(--end-y) / 220 * 100%);
          width: 210px;
          height: 210px;
          pointer-events: none;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(var(--coin-rgb),.7) 0%, rgba(var(--crash-rgb),.42) 30%, transparent 64%);
          opacity: 0;
        }
        .cd-ph-crashed .cd-crash-flash { animation: cdCrashFlash .66s ease both; }

        /* market HUD inside arena */
        .cd-market-hud {
          position: absolute;
          z-index: 8;
          top: 12px;
          left: 13px;
          right: 13px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: start;
          gap: 10px;
          pointer-events: none;
        }

        .cd-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 23px;
          padding: 0 9px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(0,0,0,.3);
          color: rgba(255,255,255,.6);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cd-live-dot { width: 6px; height: 6px; border-radius: 999px; background: #94a3b8; transition: background .2s ease; }
        .cd-ph-running .cd-live-dot { background: var(--live); box-shadow: 0 0 10px rgba(var(--live-rgb),.7); }
        .cd-crash .cd-live-dot { background: var(--crash); box-shadow: 0 0 10px rgba(var(--crash-rgb),.7); }

        .cd-x {
          margin-top: 8px;
          font-size: clamp(50px, 14.5vw, 82px);
          line-height: .82;
          font-weight: 900;
          letter-spacing: -.08em;
          color: #fff;
          text-shadow: 0 0 22px rgba(var(--accent-rgb), .22), 0 18px 44px rgba(0,0,0,.5);
        }
        .cd-crash .cd-x { color: #ffd0d8; }
        .cd-ph-crashed .cd-x { animation: cdCrashText .42s ease both; }

        .cd-small-state {
          align-self: start;
          min-width: 90px;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(0,0,0,.28);
          padding: 9px;
          text-align: right;
        }
        .cd-small-state span {
          display: block;
          color: rgba(255,255,255,.34);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .cd-small-state b {
          display: block;
          margin-top: 5px;
          color: #fff;
          font-size: 17px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -.03em;
        }
        .cd-small-state-safe b { color: var(--live); }

        /* -------------------------------------------------------- actions */

        .cd-actions {
          position: relative;
          z-index: 8;
          flex: 0 0 auto;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.03);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
          padding: 10px;
        }

        .cd-action-top {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 9px;
        }
        .cd-action-top span {
          display: block;
          color: rgba(255,255,255,.4);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cd-action-top b {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 23px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.06em;
        }
        .cd-ph-running .cd-action-top b { color: var(--coin); }
        .cd-actions-safe .cd-action-top b { color: var(--live); }

        .cd-status-pill {
          min-height: 28px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(0,0,0,.28);
          color: rgba(255,255,255,.6);
          padding: 0 11px;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .cd-status-pill-safe { color: var(--live); border-color: rgba(var(--live-rgb),.3); }
        .cd-status-pill-risk { color: var(--coin); border-color: rgba(var(--coin-rgb),.3); }

        .cd-btn {
          width: 100%;
          min-height: 50px;
          border: 0;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
          text-transform: uppercase;
          transition: transform .1s ease, filter .15s ease;
        }
        .cd-btn:active { transform: scale(.985); }
        .cd-btn:disabled { transform: none; }

        .cd-btn-ton {
          background: linear-gradient(135deg, #7fb6ff 0%, #2f8cff 52%, #1e6fe0 100%);
          color: #00122e;
          box-shadow: 0 12px 30px rgba(var(--ton-rgb),.2), inset 0 1px 0 rgba(255,255,255,.4);
        }
        .cd-btn-mint {
          background: linear-gradient(135deg, #8ffff0 0%, #52FFE5 52%, #2fd9c4 100%);
          color: #042620;
          box-shadow: 0 12px 30px rgba(var(--live-rgb),.18), inset 0 1px 0 rgba(255,255,255,.45);
        }
        .cd-btn-gold {
          background: linear-gradient(135deg, #ffe9ad 0%, #F2C766 50%, #d8a63c 100%);
          color: #221903;
          box-shadow: 0 12px 30px rgba(var(--gold-rgb),.18), inset 0 1px 0 rgba(255,255,255,.5);
        }
        .cd-btn-secured {
          background: rgba(var(--live-rgb),.1);
          border: 1px solid rgba(var(--live-rgb),.3);
          color: var(--live);
        }
        .cd-btn-mute {
          background: rgba(255,255,255,.05);
          border: 1px solid var(--line);
          color: rgba(255,255,255,.5);
        }

        /* -------------------------------------------------------- reveal */

        .cd-reveal {
          position: absolute;
          z-index: 40;
          inset: 0;
          display: grid;
          place-items: end center;
          padding: 10px;
          background: linear-gradient(180deg, transparent 0%, rgba(3,3,5,.2) 34%, rgba(3,3,5,.86) 100%);
          pointer-events: none;
        }
        .cd-reveal-card {
          width: min(100%, 408px);
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(10,10,17,.97);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 80px rgba(0,0,0,.6);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          padding: 14px;
          animation: cdRevealIn .4s cubic-bezier(.16,1.1,.28,1) both;
          pointer-events: auto;
        }
        .cd-reveal-head { text-align: center; margin-bottom: 11px; }
        .cd-reveal-head small {
          color: rgba(255,255,255,.4);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .22em;
          text-transform: uppercase;
        }
        .cd-reveal-head h2 {
          margin: 6px 0 0;
          color: #fff;
          font-size: 29px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.07em;
        }

        .cd-reveal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .cd-reveal-box {
          min-height: 86px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.035);
          text-align: center;
        }
        .cd-reveal-box-user { border-color: rgba(var(--ton-rgb),.28); background: rgba(var(--ton-rgb),.06); }
        .cd-reveal-box span {
          color: rgba(255,255,255,.4);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cd-reveal-box b {
          display: block;
          margin-top: 7px;
          color: #fff;
          font-size: 26px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.06em;
        }
        .cd-reveal-box-user b { color: var(--ton); }
        .cd-reveal-box em {
          display: block;
          margin-top: 7px;
          color: var(--coin);
          font-size: 11px;
          font-style: normal;
          font-weight: 900;
          letter-spacing: .02em;
        }

        .cd-crash-box {
          margin-top: 8px;
          min-height: 46px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: rgba(var(--crash-rgb),.06);
          text-align: center;
          color: rgba(255,255,255,.66);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.3;
          padding: 0 12px;
        }
        .cd-crash-box b { color: var(--crash); font-weight: 900; }
        .cd-reveal-action { margin-top: 9px; }

        /* -------------------------------------------------------- final */

        .cd-final {
          position: absolute;
          z-index: 50;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 12px;
          background:
            radial-gradient(circle at 50% 16%, rgba(var(--live-rgb),.12), transparent 38%),
            radial-gradient(circle at 50% 88%, rgba(var(--gold-rgb),.1), transparent 38%),
            rgba(3,3,5,.92);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          animation: cdFinalIn .32s ease both;
        }
        .cd-final-card {
          width: min(100%, 400px);
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(10,10,17,.97);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 30px 100px rgba(0,0,0,.6);
          padding: 18px;
          text-align: center;
        }
        .cd-final-icon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          margin: 0 auto 12px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(var(--gold-rgb),.1);
          color: var(--gold);
        }
        .cd-final-icon-win { background: rgba(var(--live-rgb),.1); color: var(--live); }
        .cd-final-card h2 {
          margin: 0;
          color: #fff;
          font-size: 33px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.07em;
        }
        .cd-final-card p {
          max-width: 300px;
          margin: 10px auto 14px;
          color: rgba(255,255,255,.5);
          font-size: 11px;
          line-height: 1.4;
          font-weight: 600;
        }
        .cd-final-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 11px; }
        .cd-final-score {
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.035);
          padding: 12px 8px;
        }
        .cd-final-score-user { border-color: rgba(var(--ton-rgb),.28); background: rgba(var(--ton-rgb),.06); }
        .cd-final-score span {
          color: rgba(255,255,255,.38);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .cd-final-score b {
          display: block;
          margin-top: 7px;
          color: #fff;
          font-size: 26px;
          line-height: .9;
          font-weight: 900;
          letter-spacing: -.06em;
        }
        .cd-final-score-user b { color: var(--ton); }

        .cd-secondary {
          width: 100%;
          min-height: 42px;
          margin-top: 8px;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.04);
          color: rgba(255,255,255,.72);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .13em;
          text-transform: uppercase;
        }
        .cd-secondary:active { transform: scale(.99); }

        /* -------------------------------------------------------- keyframes */

        @keyframes cdPulse {
          0%, 100% { opacity: .35; transform: scale(.82); }
          50% { opacity: .85; transform: scale(1.18); }
        }
        @keyframes cdMarkerIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(.4); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes cdCrashFlash {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.2); }
          42% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.55); }
        }
        @keyframes cdCrashText {
          0% { transform: scale(1); }
          40% { transform: scale(1.07) rotate(-1deg); }
          100% { transform: scale(1); }
        }
        @keyframes cdRevealIn {
          from { opacity: 0; transform: translateY(22px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cdFinalIn { from { opacity: 0; } to { opacity: 1; } }

        @media (max-height: 720px) {
          .cd-page { gap: 5px; padding: 6px 6px max(6px, env(safe-area-inset-bottom)); }
          .cd-back { width: 32px; height: 32px; border-radius: 11px; }
          .cd-score-hud { min-height: 40px; border-radius: 16px; padding: 6px 8px; }
          .cd-hud-icon { width: 24px; height: 24px; }
          .cd-hud-player b { font-size: 15px; }
          .cd-arena { border-radius: 20px; }
          .cd-chart { inset: 70px 11px 20px; }
          .cd-x { font-size: clamp(44px, 13.5vw, 68px); }
          .cd-actions { padding: 8px; border-radius: 18px; }
          .cd-action-top { margin-bottom: 7px; }
          .cd-action-top b { font-size: 21px; }
          .cd-btn { min-height: 46px; }
          .cd-reveal-card { padding: 12px; border-radius: 22px; }
          .cd-reveal-head h2 { font-size: 26px; }
          .cd-reveal-box { min-height: 78px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cd-page *, .cd-page *::before, .cd-page *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; }
          .cd-point, .cd-line, .cd-line-glow, .cd-round-dot, .cd-live-dot { transition: none; }
        }
      `}</style>

      <header className="cd-top">
        <button type="button" className="cd-back" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={17} />
        </button>

        <div className="cd-score-hud">
          <div className="cd-hud-player cd-hud-player-user">
            <div className="cd-hud-icon cd-hud-icon-user">
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
                <i key={index} className={`cd-round-dot ${index < round ? 'cd-round-dot-active' : ''}`} />
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
        <div className="cd-chart">
          <svg viewBox="0 0 360 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cdArea" x1="0" x2="0" y1="0" y2="1">
                <stop className="cd-area-top" offset="0%" />
                <stop className="cd-area-bot" offset="100%" />
              </linearGradient>
            </defs>
            <path ref={areaRef} className="cd-area" d={chart.areaPath} fill="url(#cdArea)" />
            <path ref={glowRef} className="cd-line-glow" d={chart.path} />
            <path ref={lineRef} className="cd-line" d={chart.path} />
            <path ref={hotRef} className="cd-line-hot" d={chart.path} />
          </svg>

          <div className="cd-point" />

          {userMarkerStyle && (phase === 'running' || isCrashVisual) && (
            <div className="cd-marker cd-marker-user" style={userMarkerStyle}>
              <Shield size={11} />
            </div>
          )}

          {botMarkerStyle && (
            <div className="cd-marker cd-marker-bot" style={botMarkerStyle}>
              <Bot size={11} />
            </div>
          )}
        </div>

        <div className="cd-crash-flash" />

        <div className="cd-market-hud">
          <div>
            <div className="cd-live-pill">
              <span className="cd-live-dot" />
              {phase === 'ready' ? 'waiting' : phase === 'running' ? 'live' : phase === 'crashed' ? 'crashed' : 'revealed'}
            </div>
            <div className="cd-x" ref={xRef}>
              {formatX(bigXValue)}
            </div>
          </div>

          <div className={`cd-small-state ${userCashout ? 'cd-small-state-safe' : ''}`}>
            <span>Your exit</span>
            <b>{userCashout ? formatX(userCashout) : phase === 'crashed' || phase === 'reveal' ? 'crash' : '—'}</b>
          </div>
        </div>
      </section>

      <section className={`cd-actions ${userCashout ? 'cd-actions-safe' : ''}`}>
        <div className="cd-action-top">
          <div>
            <span>{phase === 'running' ? (userCashout ? 'secured' : 'current') : phase === 'ready' ? 'base' : 'round'}</span>
            <b ref={potentialRef}>
              {phase === 'running'
                ? formatPoints(userCashout ? securedPoints : livePotential)
                : outcome
                  ? `+${formatPoints(outcome.userPoints)}`
                  : formatPoints(BASE_POINTS)}
            </b>
          </div>

          <div
            className={`cd-status-pill ${userCashout ? 'cd-status-pill-safe' : phase === 'running' ? 'cd-status-pill-risk' : ''}`}
          >
            {userCashout ? 'safe' : phase === 'running' ? 'risk' : 'x100'}
          </div>
        </div>

        {phase === 'ready' && (
          <button type="button" className="cd-btn cd-btn-ton" onClick={startRound}>
            <Zap size={16} />
            Start
          </button>
        )}

        {phase === 'running' &&
          (userCashout ? (
            <button type="button" className="cd-btn cd-btn-secured" disabled>
              <Shield size={16} />
              Secured {formatX(userCashout)}
            </button>
          ) : (
            <button type="button" className="cd-btn cd-btn-mint" onClick={cashOut}>
              <Zap size={16} />
              <span ref={cashLabelRef}>Cash out {formatX(liveMult)}</span>
            </button>
          ))}

        {phase === 'crashed' && (
          <button type="button" className="cd-btn cd-btn-mute" disabled>
            Revealing…
          </button>
        )}

        {phase === 'reveal' && (
          <button type="button" className="cd-btn cd-btn-gold" onClick={nextRound}>
            {round >= TOTAL_ROUNDS ? <Trophy size={16} /> : <ChevronRight size={16} />}
            {round >= TOTAL_ROUNDS ? 'Final' : 'Next'}
          </button>
        )}

        {phase === 'gameover' && (
          <button type="button" className="cd-btn cd-btn-ton" onClick={restart}>
            <RefreshCw size={16} />
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
              <div className="cd-reveal-box cd-reveal-box-user">
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
              <button type="button" className="cd-btn cd-btn-gold" onClick={nextRound}>
                {round >= TOTAL_ROUNDS ? <Trophy size={16} /> : <ChevronRight size={16} />}
                {round >= TOTAL_ROUNDS ? 'Final' : 'Next'}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase === 'gameover' && (
        <section className="cd-final">
          <div className="cd-final-card">
            <div className={`cd-final-icon ${finalWinner === 'user' ? 'cd-final-icon-win' : ''}`}>
              {finalWinner === 'user' ? <Trophy size={30} /> : finalWinner === 'bot' ? <Bot size={30} /> : <Sparkles size={30} />}
            </div>

            <h2>{finalWinner === 'draw' ? 'Draw' : finalWinner === 'user' ? 'You win' : 'Bot wins'}</h2>
            <p>Победитель определяется только по сумме очков за 5 раундов.</p>

            <div className="cd-final-grid">
              <div className="cd-final-score cd-final-score-user">
                <span>You</span>
                <b>{formatPoints(totals.user)}</b>
              </div>
              <div className="cd-final-score">
                <span>Bot</span>
                <b>{formatPoints(totals.bot)}</b>
              </div>
            </div>

            <button type="button" className="cd-btn cd-btn-ton" onClick={restart}>
              <RefreshCw size={16} />
              New match
            </button>

            <button type="button" className="cd-secondary" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default CrashDuelGame;