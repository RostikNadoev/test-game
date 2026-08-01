import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../i18n/LanguageContext';
import iconDiamond from '../../assets/solo/scratch/icon-diamond.webp';
import iconCoin from '../../assets/solo/scratch/icon-coin.webp';
import iconClover from '../../assets/solo/scratch/icon-clover.webp';
import iconOrb from '../../assets/solo/scratch/icon-orb.webp';
import iconStar from '../../assets/solo/scratch/icon-star.webp';
import iconCrown from '../../assets/solo/scratch/icon-crown.webp';
import './EclipseReelsSoloGame.css';

type EclipseSymbolId = 'wild' | 'diamond' | 'clover' | 'coin' | 'star' | 'orb';
type EclipseStage = 'idle' | 'spinning' | 'rays' | 'win';

type EclipseSymbol = {
  id: EclipseSymbolId;
  image: string;
  label: string;
  weight: number;
  payout: number;
  tone: string;
};

type RayWin = {
  ray: number;
  symbol: EclipseSymbolId;
  amount: number;
};

type EclipseWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
        };
      };
    };
  };

const RAY_COUNT = 8;
const RING_COUNT = 3;
const QUICK_BETS = [10, 25, 50, 100];

const SYMBOLS: EclipseSymbol[] = [
  { id: 'wild', image: iconCrown, label: 'Eclipse Wild', weight: 5, payout: 72, tone: '#ffcf75' },
  { id: 'diamond', image: iconDiamond, label: 'Diamond', weight: 8, payout: 44, tone: '#d6fcff' },
  { id: 'clover', image: iconClover, label: 'Clover', weight: 11, payout: 25, tone: '#88ff9e' },
  { id: 'coin', image: iconCoin, label: 'Coin', weight: 14, payout: 16, tone: '#ffd36a' },
  { id: 'star', image: iconStar, label: 'Star', weight: 17, payout: 11, tone: '#ff5f91' },
  { id: 'orb', image: iconOrb, label: 'Orb', weight: 20, payout: 8, tone: '#c982ff' },
];

const SYMBOL_BY_ID = SYMBOLS.reduce<Record<EclipseSymbolId, EclipseSymbol>>((acc, symbol) => {
  acc[symbol.id] = symbol;
  return acc;
}, {} as Record<EclipseSymbolId, EclipseSymbol>);

const STARTING_RINGS: EclipseSymbolId[][] = [
  ['star', 'coin', 'orb', 'diamond', 'clover', 'coin', 'star', 'orb'],
  ['diamond', 'orb', 'coin', 'star', 'wild', 'clover', 'coin', 'star'],
  ['coin', 'clover', 'star', 'orb', 'diamond', 'coin', 'clover', 'wild'],
];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const roundCredits = (value: number) => Math.round(value * 100) / 100;

const pickSymbol = (excludeWild = false): EclipseSymbolId => {
  const pool = excludeWild ? SYMBOLS.filter((symbol) => symbol.id !== 'wild') : SYMBOLS;
  const total = pool.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = Math.random() * total;

  for (const symbol of pool) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol.id;
  }

  return pool[pool.length - 1].id;
};

const createRing = () => Array.from({ length: RAY_COUNT }, () => pickSymbol());

const createOutcome = (): EclipseSymbolId[][] => {
  const rings = Array.from({ length: RING_COUNT }, createRing);

  if (Math.random() < 0.52) {
    const ray = Math.floor(Math.random() * RAY_COUNT);
    const symbol = pickSymbol(true);

    rings.forEach((ring, index) => {
      ring[ray] = index > 0 && Math.random() < 0.14 ? 'wild' : symbol;
    });

    if (Math.random() < 0.13) {
      const extraRay = (ray + 2 + Math.floor(Math.random() * 5)) % RAY_COUNT;
      const extraSymbol = pickSymbol(true);
      rings.forEach((ring) => { ring[extraRay] = extraSymbol; });
    }
  }

  return rings;
};

const evaluateRays = (rings: EclipseSymbolId[][], bet: number): RayWin[] => {
  const lineBet = bet / RAY_COUNT;

  return Array.from({ length: RAY_COUNT }, (_, ray) => {
    const ids = rings.map((ring) => ring[ray]);
    const target = ids.find((id) => id !== 'wild') ?? 'wild';
    if (!ids.every((id) => id === target || id === 'wild')) return null;

    return {
      ray,
      symbol: target,
      amount: roundCredits(SYMBOL_BY_ID[target].payout * lineBet),
    };
  }).filter((win): win is RayWin => win !== null);
};

const orbitPoint = (ray: number, radius: number) => {
  const angle = (ray * Math.PI * 2) / RAY_COUNT - Math.PI / 2;
  return {
    '--orbit-x': `${50 + Math.cos(angle) * radius}%`,
    '--orbit-y': `${50 + Math.sin(angle) * radius}%`,
  } as CSSProperties;
};

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 10.7V16" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M12 7.3h.01" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const SoundIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4.5 9.2v5.6h3.2l4.7 3.6V5.6L7.7 9.2H4.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    {muted
      ? <path d="m16.2 9.1 4.1 5.8M20.3 9.1l-4.1 5.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      : <path d="M15.7 8.6a4.7 4.7 0 0 1 0 6.8M18.5 6a8.4 8.4 0 0 1 0 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const EclipseInfo = ({ onClose }: { onClose: () => void }) => {
  const { tr } = useLanguage();

  return createPortal(
    <div className="er-modal-layer" onPointerDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="er-info" role="dialog" aria-modal="true" aria-label={tr('Game rules', 'Правила игры')}>
        <div className="er-info-head">
          <div><span>{tr('ORBIT GUIDE', 'ПРАВИЛА ОРБИТ')}</span><h2>{tr('How it works', 'Как играть')}</h2></div>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><CloseIcon /></button>
        </div>
        <p>{tr(
          'Three rings spin in opposite directions. Match the same symbol across all three rings on any glowing ray. Eclipse Wild replaces every symbol.',
          'Три кольца вращаются в разные стороны. Собери одинаковый символ на всех трёх кольцах по одному лучу. Eclipse Wild заменяет любой символ.',
        )}</p>
        <div className="er-rule-strip">
          <div><b>3</b><span>{tr('ORBITAL RINGS', 'ОРБИТАЛЬНЫХ КОЛЬЦА')}</span></div>
          <div><b>8</b><span>{tr('ACTIVE RAYS', 'АКТИВНЫХ ЛУЧЕЙ')}</span></div>
          <div><b>1</b><span>WILD CORE</span></div>
        </div>
        <div className="er-paytable">
          {SYMBOLS.map((symbol) => (
            <div key={symbol.id}>
              <img src={symbol.image} alt={symbol.label} draggable={false} />
              <span>{symbol.label}</span>
              <strong>{symbol.payout}×</strong>
            </div>
          ))}
        </div>
        <small>{tr('Values are multiplied by the bet on one ray.', 'Значения умножаются на ставку одного луча.')}</small>
      </section>
    </div>,
    document.body,
  );
};

const EclipseLoader = ({ progress }: { progress: number }) => {
  const { tr } = useLanguage();
  return (
    <div className="er-loader">
      <div className="er-loader-orbits"><i /><i /><i /><b /></div>
      <span>{tr('ALIGNING ORBITS', 'НАСТРАИВАЕМ ОРБИТЫ')}</span>
      <h1>ECLIPSE <em>REELS</em></h1>
      <div className="er-loader-bar"><i style={{ width: `${progress}%` }} /></div>
    </div>
  );
};

export const EclipseReelsSoloGame = () => {
  const { tr, locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [rings, setRings] = useState<EclipseSymbolId[][]>(STARTING_RINGS);
  const [stage, setStage] = useState<EclipseStage>('idle');
  const [settledRings, setSettledRings] = useState(RING_COUNT);
  const [spinEpoch, setSpinEpoch] = useState(0);
  const [wins, setWins] = useState<RayWin[]>([]);
  const [activeWinIndex, setActiveWinIndex] = useState(0);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(25);
  const [lastWin, setLastWin] = useState(0);
  const [presentation, setPresentation] = useState<{ amount: number; rays: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('eclipse-reels-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const mountedRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  const spinning = stage !== 'idle';
  const activeWin = wins[activeWinIndex] ?? null;
  const format = useCallback((value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value), [locale]);

  const haptic = useCallback((kind: 'tap' | 'stop' | 'win' | 'error') => {
    const feedback = (window as EclipseWindow).Telegram?.WebApp?.HapticFeedback;
    if (kind === 'win') feedback?.notificationOccurred?.('success');
    else if (kind === 'error') feedback?.notificationOccurred?.('error');
    else feedback?.impactOccurred?.(kind === 'stop' ? 'rigid' : 'light');
  }, []);

  const playSound = useCallback((kind: 'tap' | 'spin' | 'stop' | 'win') => {
    if (muted) return;
    const AudioCtor = window.AudioContext ?? (window as EclipseWindow).webkitAudioContext;
    if (!AudioCtor) return;
    const context = audioRef.current ?? new AudioCtor();
    audioRef.current = context;
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    gain.connect(context.destination);
    oscillator.connect(gain);
    oscillator.type = kind === 'spin' ? 'sawtooth' : kind === 'win' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'tap' ? 330 : kind === 'stop' ? 185 : kind === 'spin' ? 92 : 480, now);
    if (kind === 'spin') oscillator.frequency.exponentialRampToValueAtTime(230, now + 0.48);
    if (kind === 'win') oscillator.frequency.exponentialRampToValueAtTime(1080, now + 0.42);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.1 : 0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.48 : 0.18));
    oscillator.start(now);
    oscillator.stop(now + (kind === 'win' ? 0.5 : 0.5));
  }, [muted]);

  const spin = useCallback(async () => {
    if (spinning) return;
    if (balance < bet) {
      setAuto(false);
      haptic('error');
      return;
    }

    const target = createOutcome();
    setBalance((value) => roundCredits(value - bet));
    setLastWin(0);
    setWins([]);
    setPresentation(null);
    setSettledRings(0);
    setSpinEpoch((value) => value + 1);
    setStage('spinning');
    haptic('tap');
    playSound('spin');

    for (let ring = 0; ring < RING_COUNT; ring += 1) {
      await sleep(ring === 0 ? 1080 : 190);
      if (!mountedRef.current) return;
      setRings((current) => current.map((symbols, index) => index === ring ? target[ring] : symbols));
      setSettledRings(ring + 1);
      haptic('stop');
      playSound('stop');
    }

    const result = evaluateRays(target, bet);
    const amount = roundCredits(result.reduce((sum, win) => sum + win.amount, 0));

    if (result.length > 0) {
      setWins(result);
      setStage('rays');
      for (let index = 0; index < result.length; index += 1) {
        setActiveWinIndex(index);
        await sleep(720);
        if (!mountedRef.current) return;
      }

      setLastWin(amount);
      setBalance((value) => roundCredits(value + amount));
      setPresentation({ amount, rays: result.length });
      setStage('win');
      haptic('win');
      playSound('win');
      await sleep(1650);
      if (!mountedRef.current) return;
      setPresentation(null);
    }

    setStage('idle');
  }, [balance, bet, haptic, playSound, spinning]);

  useEffect(() => {
    mountedRef.current = true;
    document.documentElement.classList.add('eclipse-reels-active');
    document.body.classList.add('eclipse-reels-active');
    return () => {
      mountedRef.current = false;
      document.documentElement.classList.remove('eclipse-reels-active');
      document.body.classList.remove('eclipse-reels-active');
      audioRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const duration = 1180;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setLoadProgress((1 - Math.pow(1 - progress, 3)) * 100);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else window.setTimeout(() => setLoading(false), 100);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localStorage.setItem('eclipse-reels-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    if (!auto || spinning || loading) return undefined;
    if (balance < bet) {
      setAuto(false);
      return undefined;
    }
    const timer = window.setTimeout(() => void spin(), wins.length ? 1150 : 450);
    return () => window.clearTimeout(timer);
  }, [auto, balance, bet, loading, spin, spinning, wins.length]);

  useEffect(() => {
    if (wins.length <= 1 || spinning) return undefined;
    const timer = window.setInterval(() => setActiveWinIndex((value) => (value + 1) % wins.length), 1150);
    return () => window.clearInterval(timer);
  }, [spinning, wins]);

  const activeSymbol = activeWin ? SYMBOL_BY_ID[activeWin.symbol] : null;
  const winningPositions = useMemo(() => new Set(activeWin ? rings.map((_, ring) => `${ring}-${activeWin.ray}`) : []), [activeWin, rings]);

  if (loading) return <div className="er-root"><EclipseLoader progress={loadProgress} /></div>;

  return (
    <div className="er-root">
      <div className="er-content">
        <header className="er-head">
          <button type="button" className="er-icon-btn" onClick={() => setShowInfo(true)} aria-label={tr('Game rules', 'Правила игры')}><InfoIcon /></button>
          <div><span>{tr('ORBITAL SLOT', 'ОРБИТАЛЬНЫЙ СЛОТ')}</span><h1>ECLIPSE <em>REELS</em></h1></div>
          <button type="button" className="er-icon-btn" onClick={() => { setMuted((value) => !value); haptic('tap'); }} aria-label={muted ? tr('Turn sound on', 'Включить звук') : tr('Turn sound off', 'Выключить звук')}><SoundIcon muted={muted} /></button>
        </header>

        <div className="er-stats">
          <div><span>{tr('DEMO BALANCE', 'ДЕМО-БАЛАНС')}</span><strong>{format(balance)}</strong></div>
          <i />
          <div><span>{tr('LAST WIN', 'ВЫИГРЫШ')}</span><strong className={lastWin > 0 ? 'is-win' : ''}>{format(lastWin)}</strong></div>
          <b>{tr('8 RAYS', '8 ЛУЧЕЙ')}</b>
        </div>

        <main className={`er-machine stage-${stage}`}>
          <div className="er-orbit-board">
            <div className="er-eclipse-corona" />
            {rings.map((symbols, ring) => {
              const isSpinning = stage === 'spinning' && ring >= settledRings;
              return (
                <div
                  key={`${spinEpoch}-${ring}`}
                  className={`er-ring er-ring-${ring} ${isSpinning ? 'is-spinning' : 'is-settled'}`}
                  style={{ '--ring-duration': `${1080 + ring * 190}ms` } as CSSProperties}
                >
                  <div className="er-ring-rail" />
                  {symbols.map((symbolId, ray) => {
                    const symbol = SYMBOL_BY_ID[symbolId];
                    const winning = winningPositions.has(`${ring}-${ray}`);
                    return (
                      <span
                        className={`er-orbit-symbol ${winning ? 'is-winning' : ''}`}
                        key={`${ring}-${ray}-${symbolId}`}
                        style={{ ...orbitPoint(ray, 43), '--symbol-tone': symbol.tone } as CSSProperties}
                      >
                        <img src={symbol.image} alt={symbol.label} draggable={false} />
                      </span>
                    );
                  })}
                </div>
              );
            })}

            <div className="er-core"><i /><span>WILD</span></div>
            {activeWin && <div key={`ray-${activeWin.ray}`} className="er-winning-ray" style={{ '--win-ray': `${activeWin.ray * 45}deg` } as CSSProperties}><i /></div>}
            {Array.from({ length: RAY_COUNT }, (_, ray) => <span className="er-ray-tick" key={ray} style={orbitPoint(ray, 47)}>{ray + 1}</span>)}
          </div>

          {presentation && (
            <div className="er-win-reveal" aria-live="polite">
              <div><img src={activeSymbol?.image ?? iconCrown} alt="" draggable={false} /><span>{tr('TOTAL WIN', 'ОБЩИЙ ВЫИГРЫШ')}</span><strong>+{format(presentation.amount)}</strong><small>{presentation.rays === 1 ? tr('1 winning ray', '1 выигрышный луч') : tr(`${presentation.rays} winning rays`, `${presentation.rays} выигрышных луча`)}</small></div>
            </div>
          )}

          <div className="er-status" aria-live="polite">
            {stage === 'spinning' ? <><i />{tr('ORBITS IN MOTION', 'ОРБИТЫ В ДВИЖЕНИИ')}</>
              : stage === 'rays' ? <><b>↗</b>{tr('ALIGNING RAY', 'ПРОВЕРЯЕМ ЛУЧ')} {activeWinIndex + 1}/{wins.length}</>
                : stage === 'win' ? <><i className="win" />{tr('ECLIPSE PAYOUT', 'ВЫИГРЫШ ECLIPSE')}</>
                  : activeWin ? <><img src={activeSymbol?.image} alt="" />{tr('RAY', 'ЛУЧ')} {activeWin.ray + 1} · +{format(activeWin.amount)}</>
                    : <><b>◆</b>{tr('Match one symbol across all rings', 'Собери символ на всех трёх кольцах')}</>}
          </div>
        </main>

        <footer className="er-controls">
          <div className="er-bet-row">
            <div><span>{tr('TOTAL BET', 'ОБЩАЯ СТАВКА')}</span><strong>{format(bet)}</strong></div>
            {QUICK_BETS.map((value) => <button key={value} type="button" className={bet === value ? 'active' : ''} disabled={spinning} onClick={() => { setBet(value); setWins([]); setLastWin(0); haptic('tap'); playSound('tap'); }}>{value}</button>)}
          </div>
          <div className="er-actions">
            <button type="button" className={`er-auto ${auto ? 'active' : ''}`} onClick={() => { setAuto((value) => !value); haptic('tap'); playSound('tap'); }}><span>{auto ? tr('AUTO ON', 'АВТО ВКЛ') : tr('AUTO', 'АВТО')}</span><i /></button>
            <button type="button" className="er-spin" disabled={spinning || balance < bet} onClick={() => void spin()}><span className="er-spin-orbit" /><strong>{spinning ? tr('ALIGNING', 'ВРАЩЕНИЕ') : tr('SPIN ORBITS', 'КРУТИТЬ')}</strong></button>
            <div className="er-demo"><span>DEMO</span><small>{tr('FRONTEND ONLY', 'ТОЛЬКО ФРОНТ')}</small></div>
          </div>
        </footer>
      </div>
      {showInfo && <EclipseInfo onClose={() => setShowInfo(false)} />}
    </div>
  );
};
