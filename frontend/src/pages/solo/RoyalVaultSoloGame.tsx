import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/useAuth';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import { useLanguage } from '../../i18n/LanguageContext';
import iconDiamond from '../../assets/solo/scratch/icon-diamond.webp';
import iconCoin from '../../assets/solo/scratch/icon-coin.webp';
import iconClover from '../../assets/solo/scratch/icon-clover.webp';
import iconOrb from '../../assets/solo/scratch/icon-orb.webp';
import iconStar from '../../assets/solo/scratch/icon-star.webp';
import iconCrown from '../../assets/solo/scratch/icon-crown.webp';
import './RoyalVaultSoloGame.css';

type SymbolId = 'wild' | 'diamond' | 'clover' | 'coin' | 'star' | 'orb';
type SlotBoard = SymbolId[][];
type SpinStage = 'idle' | 'rolling' | 'lines' | 'win';

type SymbolDefinition = {
  id: SymbolId;
  image: string;
  label: string;
  weight: number;
  payouts: [number, number, number];
  tone: string;
};

type WinLine = {
  lineIndex: number;
  symbol: SymbolId;
  count: number;
  amount: number;
  cells: string[];
};

type WinPresentation = {
  amount: number;
  lineCount: number;
  tier: 'regular' | 'big' | 'royal';
};

type ServerRoyalVaultOutcome = {
  board: SlotBoard;
  wins: Array<{
    line_index: number;
    symbol: SymbolId;
    count: number;
    amount: number;
    cells: string[];
  }>;
  total_win: number;
};

type TelegramHaptics = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type RoyalVaultWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    Telegram?: { WebApp?: { HapticFeedback?: TelegramHaptics } };
  };

const REEL_COUNT = 5;
const ROW_COUNT = 3;
const QUICK_BETS = [10, 25, 50, 100];
const FIRST_REEL_STOP_DELAY_MS = 1450;
const REEL_STOP_GAP_MS = 240;
const REEL_BRAKE_MS = 620;
const LINE_PRESENTATION_MS = 1250;
const AFTER_LINES_PAUSE_MS = 850;
const WIN_OVERLAY_MS = 2050;

const SYMBOLS: SymbolDefinition[] = [
  { id: 'wild', image: iconCrown, label: 'Wild', weight: 7, payouts: [18, 48, 140], tone: '#f9d879' },
  { id: 'diamond', image: iconDiamond, label: 'Diamond', weight: 9, payouts: [24, 64, 190], tone: '#d8fff8' },
  { id: 'clover', image: iconClover, label: 'Clover', weight: 12, payouts: [12, 32, 84], tone: '#70f4a3' },
  { id: 'coin', image: iconCoin, label: 'Coin', weight: 14, payouts: [9, 22, 58], tone: '#ffd66d' },
  { id: 'star', image: iconStar, label: 'Star', weight: 18, payouts: [6, 15, 38], tone: '#ff91cc' },
  { id: 'orb', image: iconOrb, label: 'Orb', weight: 22, payouts: [4, 10, 26], tone: '#9fc7ff' },
];

const SYMBOL_BY_ID = SYMBOLS.reduce<Record<SymbolId, SymbolDefinition>>(
  (acc, symbol) => {
    acc[symbol.id] = symbol;
    return acc;
  },
  {} as Record<SymbolId, SymbolDefinition>,
);

const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

const STARTING_BOARD: SlotBoard = [
  ['clover', 'coin', 'orb'],
  ['diamond', 'wild', 'star'],
  ['coin', 'clover', 'diamond'],
  ['star', 'coin', 'orb'],
  ['wild', 'diamond', 'clover'],
];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const pickWeightedSymbol = (excludeWild = false): SymbolId => {
  const pool = excludeWild ? SYMBOLS.filter((symbol) => symbol.id !== 'wild') : SYMBOLS;
  const total = pool.reduce((sum, symbol) => sum + symbol.weight, 0);
  let cursor = Math.random() * total;

  for (const symbol of pool) {
    cursor -= symbol.weight;
    if (cursor <= 0) return symbol.id;
  }

  return pool[pool.length - 1].id;
};

const createRandomColumn = (): SymbolId[] =>
  Array.from({ length: ROW_COUNT }, () => pickWeightedSymbol());

const createSpinStrips = (current: SlotBoard, target: SlotBoard): SlotBoard =>
  Array.from({ length: REEL_COUNT }, (_, reel) => [
    ...current[reel],
    ...Array.from({ length: 12 }, () => pickWeightedSymbol()),
    ...target[reel],
  ]);

const createAnimationTarget = (): SlotBoard =>
  Array.from({ length: REEL_COUNT }, createRandomColumn);

const linePoints = (line: number[]) =>
  line.map((row, reel) => `${50 + reel * 100},${50 + row * 100}`).join(' ');

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
    {muted ? (
      <>
        <path d="m16.2 9.1 4.1 5.8M20.3 9.1l-4.1 5.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ) : (
      <path d="M15.7 8.6a4.7 4.7 0 0 1 0 6.8M18.5 6a8.4 8.4 0 0 1 0 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    )}
  </svg>
);

const SpinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M19.2 8.1A8 8 0 1 0 20 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M15.8 5.2h4.1v4.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.8 6.8 17.2 17.2M17.2 6.8 6.8 17.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const MiniLine = ({ rows }: { rows: number[] }) => (
  <svg className="rv-mini-line" viewBox="0 0 50 30" aria-hidden="true">
    {Array.from({ length: 15 }, (_, index) => (
      <circle key={index} cx={5 + (index % 5) * 10} cy={5 + Math.floor(index / 5) * 10} r="1.35" />
    ))}
    <polyline points={rows.map((row, reel) => `${5 + reel * 10},${5 + row * 10}`).join(' ')} />
  </svg>
);

const PaytableModal = ({ onClose }: { onClose: () => void }) => {
  const { tr } = useLanguage();

  return createPortal(
    <div className="rv-modal-layer" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="rv-info-modal" role="dialog" aria-modal="true" aria-label={tr('Game rules', 'Правила игры')}>
        <div className="rv-modal-head">
          <div>
            <span>{tr('GAME GUIDE', 'ПРАВИЛА')}</span>
            <h2>{tr('Paytable', 'Таблица выплат')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><CloseIcon /></button>
        </div>

        <p className="rv-modal-copy">
          {tr(
            'Match 3 or more symbols from the left reel. The crown is Wild and replaces any symbol.',
            'Собери 3 или больше символов слева направо. Корона — Wild и заменяет любой символ.',
          )}
        </p>

        <div className="rv-paytable">
          {SYMBOLS.map((symbol) => (
            <div className="rv-pay-row" key={symbol.id}>
              <img src={symbol.image} alt={symbol.label} draggable={false} />
              <div><strong>{symbol.label}</strong><small>{symbol.id === 'wild' ? tr('WILD SYMBOL', 'WILD-СИМВОЛ') : tr('3 · 4 · 5 symbols', '3 · 4 · 5 символов')}</small></div>
              <span>{symbol.payouts.join(' · ')}</span>
            </div>
          ))}
        </div>

        <div className="rv-lines-head"><span>{tr('10 ACTIVE LINES', '10 АКТИВНЫХ ЛИНИЙ')}</span><small>{tr('Paid left to right', 'Выплаты слева направо')}</small></div>
        <div className="rv-lines-grid">
          {PAYLINES.map((line, index) => (
            <div className="rv-line-tile" key={index}><b>{index + 1}</b><MiniLine rows={line} /></div>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
};

const LoadingScreen = ({ progress }: { progress: number }) => {
  const { tr } = useLanguage();
  return (
    <div className="rv-loader">
      <div className="rv-loader-halo" />
      <div className="rv-loader-mark">
        {[iconDiamond, iconCrown, iconClover].map((image, index) => (
          <span key={image} style={{ '--loader-index': index } as CSSProperties}><img src={image} alt="" draggable={false} /></span>
        ))}
      </div>
      <p>{tr('PRIVATE TABLE', 'ПРИВАТНЫЙ СТОЛ')}</p>
      <h1>ROYAL <em>VAULT</em></h1>
      <div className="rv-loader-bar"><span style={{ width: `${progress}%` }} /></div>
      <small>{tr('Preparing the reels', 'Подготавливаем барабаны')}</small>
    </div>
  );
};

const RoyalWinOverlay = ({
  presentation,
  format,
}: {
  presentation: WinPresentation;
  format: (value: number) => string;
}) => {
  const { locale, tr } = useLanguage();
  const title = presentation.tier === 'royal'
    ? tr('ROYAL WIN', 'КОРОЛЕВСКИЙ ВЫИГРЫШ')
    : presentation.tier === 'big'
      ? tr('BIG WIN', 'БОЛЬШОЙ ВЫИГРЫШ')
      : tr('WIN', 'ВЫИГРЫШ');

  return createPortal(
    <div className={`rv-win-reveal is-${presentation.tier}`} aria-live="polite">
      <div className="rv-win-reveal-copy">
        <div className={`rv-win-reveal-title ${locale === 'ru-RU' ? 'is-ru' : ''}`}>
          {locale === 'ru-RU' && title.includes(' ') ? title.split(' ').map((word) => <span key={word}>{word}</span>) : title}
        </div>
        <strong className="rv-win-reveal-amount">+{format(presentation.amount)}</strong>
        <p className="rv-win-reveal-lines">{presentation.lineCount === 1
          ? tr('1 winning line', '1 выигрышная линия')
          : tr(`${presentation.lineCount} winning lines`, `${presentation.lineCount} выигрышных линий`)}</p>
      </div>
    </div>,
    document.body,
  );
};

export const RoyalVaultSoloGame = () => {
  const { tr, locale } = useLanguage();
  const { pauseBalanceSync, previewGameBalanceChange, resumeBalanceSync } = useAuth();
  const { balance, spin: soloSpin, loading: walletLoading, canAfford, setError } = useSoloWallet();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [board, setBoard] = useState<SlotBoard>(STARTING_BOARD);
  const [spinning, setSpinning] = useState(false);
  const [spinStage, setSpinStage] = useState<SpinStage>('idle');
  const [spinStrips, setSpinStrips] = useState<SlotBoard | null>(null);
  const [settledReels, setSettledReels] = useState(REEL_COUNT);
  const [stoppingReel, setStoppingReel] = useState<number | null>(null);
  const [bet, setBet] = useState(25);
  const [winAmount, setWinAmount] = useState(0);
  const [wins, setWins] = useState<WinLine[]>([]);
  const [activeWin, setActiveWin] = useState(0);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('royal-vault-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [winPresentation, setWinPresentation] = useState<WinPresentation | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);
  const balanceSyncPausedRef = useRef(false);

  const format = useCallback(
    (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    [locale],
  );

  const haptic = useCallback((kind: 'tap' | 'stop' | 'win' | 'error') => {
    const feedback = (window as RoyalVaultWindow).Telegram?.WebApp?.HapticFeedback;
    if (kind === 'win') feedback?.notificationOccurred?.('success');
    else if (kind === 'error') feedback?.notificationOccurred?.('error');
    else feedback?.impactOccurred?.(kind === 'stop' ? 'rigid' : 'light');
  }, []);

  const playSound = useCallback((kind: 'tap' | 'spin' | 'stop' | 'win') => {
    if (muted) return;
    const AudioCtor = window.AudioContext ?? (window as RoyalVaultWindow).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = audioRef.current ?? new AudioCtor();
    audioRef.current = ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (kind === 'spin') {
      const source = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.25), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.frequency.exponentialRampToValueAtTime(1300, now + 1.18);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.23);
      source.connect(filter).connect(gain);
      source.start(now);
      source.stop(now + 1.25);
      return;
    }

    const oscillator = ctx.createOscillator();
    oscillator.type = kind === 'win' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'tap' ? 360 : kind === 'stop' ? 220 : 620, now);
    if (kind === 'win') oscillator.frequency.exponentialRampToValueAtTime(1240, now + 0.36);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.12 : 0.07, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.48 : 0.12));
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + (kind === 'win' ? 0.5 : 0.14));
  }, [muted]);

  const activeLine = wins[activeWin] ?? null;
  const winningCells = useMemo(() => new Set(activeLine?.cells ?? []), [activeLine]);

  const spin = useCallback(async () => {
    if (spinning || walletLoading) return;
    if (!canAfford(bet)) {
      setAuto(false);
      setError('insufficient balance');
      haptic('error');
      return;
    }

    const strips = createSpinStrips(board, createAnimationTarget());
    const startedAt = performance.now();
    setSpinning(true);
    setSpinStage('rolling');
    setSpinStrips(strips);
    setSettledReels(0);
    setWins([]);
    setActiveWin(0);
    setWinAmount(0);
    setWinPresentation(null);
    haptic('tap');
    playSound('spin');
    pauseBalanceSync();
    balanceSyncPausedRef.current = true;
    previewGameBalanceChange(-bet);

    try {
      const response = await soloSpin('royal_vault', bet);
      const outcome = response.outcome as ServerRoyalVaultOutcome;
      const targetBoard = outcome.board;
      const result: WinLine[] = (outcome.wins ?? []).map((win) => ({
        lineIndex: win.line_index,
        symbol: win.symbol,
        count: win.count,
        amount: win.amount,
        cells: win.cells,
      }));
      const amount = response.payout_coins;
      setSpinStrips(createSpinStrips(board, targetBoard));
      const firstStopWait = Math.max(0, FIRST_REEL_STOP_DELAY_MS - (performance.now() - startedAt));

      for (let reel = 0; reel < REEL_COUNT; reel += 1) {
        await sleep(reel === 0 ? firstStopWait : REEL_STOP_GAP_MS);
        if (!mountedRef.current) return;
        setStoppingReel(reel);
        await sleep(REEL_BRAKE_MS);
        if (!mountedRef.current) return;
        setBoard((current) => current.map((column, index) => index === reel ? targetBoard[reel] : column));
        setSettledReels(reel + 1);
        setStoppingReel(null);
        haptic('stop');
        playSound('stop');
      }

      setSpinStrips(null);

      if (result.length > 0) {
        setSpinStage('lines');
        setWins(result);

        for (let lineIndex = 0; lineIndex < result.length; lineIndex += 1) {
          setActiveWin(lineIndex);
          await sleep(LINE_PRESENTATION_MS);
          if (!mountedRef.current) return;
        }

        await sleep(AFTER_LINES_PAUSE_MS);
        if (!mountedRef.current) return;

        setSpinStage('win');
        setWinAmount(amount);
        setWinPresentation({
          amount,
          lineCount: result.length,
          tier: amount >= bet * 6 ? 'royal' : amount >= bet * 2 ? 'big' : 'regular',
        });
        haptic('win');
        playSound('win');

        await sleep(WIN_OVERLAY_MS);
        if (!mountedRef.current) return;
        setWinPresentation(null);
      }
    } catch {
      setAuto(false);
      setSpinStrips(null);
      setSettledReels(REEL_COUNT);
      setStoppingReel(null);
      haptic('error');
    } finally {
      if (balanceSyncPausedRef.current) {
        balanceSyncPausedRef.current = false;
        try {
          await resumeBalanceSync(true);
        } catch {
          // the normal balance polling will retry
        }
      }
    }

    setSpinStage('idle');
    setSpinning(false);
  }, [
    bet,
    board,
    canAfford,
    haptic,
    pauseBalanceSync,
    playSound,
    previewGameBalanceChange,
    resumeBalanceSync,
    setError,
    soloSpin,
    spinning,
    walletLoading,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    document.documentElement.classList.add('royal-vault-active');
    document.body.classList.add('royal-vault-active');
    return () => {
      mountedRef.current = false;
      document.documentElement.classList.remove('royal-vault-active');
      document.body.classList.remove('royal-vault-active');
      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
      if (balanceSyncPausedRef.current) {
        balanceSyncPausedRef.current = false;
        void resumeBalanceSync(true).catch(() => undefined);
      }
    };
  }, [resumeBalanceSync]);

  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const duration = 1150;
    const tick = (now: number) => {
      const value = Math.min(1, (now - started) / duration);
      setLoadProgress((1 - Math.pow(1 - value, 3)) * 100);
      if (value < 1) frame = requestAnimationFrame(tick);
      else window.setTimeout(() => setLoading(false), 120);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localStorage.setItem('royal-vault-muted', muted ? '1' : '0');
  }, [muted]);

  useEffect(() => {
    if (wins.length <= 1 || spinning) return undefined;
    const timer = window.setInterval(() => setActiveWin((value) => (value + 1) % wins.length), 1050);
    return () => window.clearInterval(timer);
  }, [spinning, wins]);

  useEffect(() => {
    if (!auto || spinning || loading) return undefined;
    if (!canAfford(bet)) {
      setAuto(false);
      return undefined;
    }
    const timer = window.setTimeout(() => void spin(), wins.length ? 1250 : 420);
    return () => window.clearTimeout(timer);
  }, [auto, bet, canAfford, loading, spin, spinning, wins.length]);

  const selectBet = (value: number) => {
    if (spinning) return;
    setBet(value);
    setWinAmount(0);
    setWins([]);
    haptic('tap');
    playSound('tap');
  };

  if (loading) {
    return <div className="rv-root"><LoadingScreen progress={loadProgress} /></div>;
  }

  return (
    <div className="rv-root">
      <div className="rv-ambient rv-ambient-one" />
      <div className="rv-ambient rv-ambient-two" />

      <div className="rv-content">
        <header className="rv-game-head">
          <button type="button" className="rv-round-btn" onClick={() => setShowInfo(true)} aria-label={tr('Game rules', 'Правила игры')}><InfoIcon /></button>
          <div className="rv-title-block">
            <span>{tr('CLASSIC LINE SLOT', 'КЛАССИЧЕСКИЙ СЛОТ')}</span>
            <h1>ROYAL <em>VAULT</em></h1>
          </div>
          <button type="button" className="rv-round-btn" onClick={() => { setMuted((value) => !value); haptic('tap'); }} aria-label={muted ? tr('Turn sound on', 'Включить звук') : tr('Turn sound off', 'Выключить звук')}><SoundIcon muted={muted} /></button>
        </header>

        <div className="rv-stats">
          <div><span>{tr('BALANCE', 'БАЛАНС')}</span><strong>{format(balance)}</strong></div>
          <i />
          <div><span>{tr('LAST WIN', 'ВЫИГРЫШ')}</span><strong className={winAmount > 0 ? 'is-win' : ''}>{format(winAmount)}</strong></div>
          <b>{tr('10 LINES', '10 ЛИНИЙ')}</b>
        </div>

        <main className={`rv-machine ${spinStage === 'rolling' ? 'is-spinning' : ''} ${wins.length ? 'has-win' : ''}`}>
          <div className="rv-machine-crown">♛</div>
          <div className="rv-reel-window">
            <div className="rv-reels">
              {board.map((column, reel) => {
                const isRolling = spinStage === 'rolling' && reel >= settledReels && spinStrips !== null;
                const isStopping = isRolling && stoppingReel === reel;
                const reelSymbols = isRolling ? spinStrips[reel] : column;
                const stripEnd = -((reelSymbols.length - ROW_COUNT) / reelSymbols.length) * 100;

                return (
                  <div className={`rv-reel ${isStopping ? 'is-stopping' : isRolling ? 'is-rolling' : 'is-settled'}`} key={reel}>
                    <div
                      className={`rv-reel-track ${isStopping ? 'is-stopping' : isRolling ? 'is-rolling' : ''}`}
                      style={{
                        '--strip-scale': isRolling ? reelSymbols.length / ROW_COUNT : 1,
                        '--strip-end': `${stripEnd}%`,
                        '--spin-duration': `${720 + reel * 45}ms`,
                        '--brake-duration': `${REEL_BRAKE_MS}ms`,
                      } as CSSProperties}
                    >
                      {reelSymbols.map((symbolId, row) => {
                        const symbol = SYMBOL_BY_ID[symbolId];
                        const isWinning = !isRolling && winningCells.has(`${reel}-${row}`);
                        return (
                          <div className={`rv-symbol ${isWinning ? 'is-winning' : ''}`} key={`${reel}-${row}-${symbolId}`} style={{ '--symbol-tone': symbol.tone } as CSSProperties}>
                            <span className="rv-symbol-glow" />
                            <img src={symbol.image} alt={symbol.label} draggable={false} />
                            {symbolId === 'wild' && <small>WILD</small>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeLine && (
              <svg key={`line-${activeLine.lineIndex}`} className="rv-payline-overlay" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
                <polyline className="rv-payline-glow" points={linePoints(PAYLINES[activeLine.lineIndex])} />
                <polyline className="rv-payline-stroke" points={linePoints(PAYLINES[activeLine.lineIndex])} />
              </svg>
            )}

            <span className="rv-line-number rv-line-number-left">{activeLine ? activeLine.lineIndex + 1 : ''}</span>
            <span className="rv-line-number rv-line-number-right">{activeLine ? activeLine.lineIndex + 1 : ''}</span>
          </div>

          <div className="rv-result-strip" aria-live="polite">
            {spinStage === 'rolling' ? (
              <><span className="rv-status-dot" />{tr('THE VAULT IS TURNING', 'ХРАНИЛИЩЕ ВРАЩАЕТСЯ')}</>
            ) : spinStage === 'lines' && activeLine ? (
              <><span className="rv-line-draw-icon">↗</span><strong>{tr('DRAWING LINE', 'РИСУЕМ ЛИНИЮ')} {activeWin + 1}/{wins.length}</strong></>
            ) : spinStage === 'win' ? (
              <><span className="rv-status-dot is-win" />{tr('WIN CONFIRMED', 'ВЫИГРЫШ ПОДТВЕРЖДЁН')}</>
            ) : activeLine ? (
              <><img src={SYMBOL_BY_ID[activeLine.symbol].image} alt="" /> <strong>{tr('LINE', 'ЛИНИЯ')} {activeLine.lineIndex + 1}</strong><span>{activeLine.count}× · +{format(activeLine.amount)}</span></>
            ) : (
              <><span className="rv-status-diamond">◆</span>{tr('Match symbols from the left', 'Собери символы слева направо')}</>
            )}
          </div>
        </main>

        <footer className="rv-controls">
          <div className="rv-bet-panel">
            <div className="rv-control-label"><span>{tr('TOTAL BET', 'ОБЩАЯ СТАВКА')}</span><strong>{format(bet)}</strong></div>
            <div className="rv-bet-options">
              {QUICK_BETS.map((value) => (
                <button type="button" key={value} disabled={spinning} className={bet === value ? 'active' : ''} onClick={() => selectBet(value)}>{value}</button>
              ))}
            </div>
          </div>

          <div className="rv-actions">
            <button type="button" className={`rv-auto-btn ${auto ? 'active' : ''}`} onClick={() => { setAuto((value) => !value); haptic('tap'); playSound('tap'); }}>
              <span>{auto ? tr('AUTO ON', 'АВТО ВКЛ') : tr('AUTO', 'АВТО')}</span><i />
            </button>
            <button type="button" className="rv-spin-btn" disabled={spinning || walletLoading || !canAfford(bet)} onClick={() => void spin()} aria-label={tr('Spin reels', 'Крутить барабаны')}>
              <span className="rv-spin-shine" />
              <span className="rv-spin-icon"><SpinIcon /></span>
              <strong>{spinning ? tr('SPINNING', 'КРУТИМ') : tr('SPIN', 'КРУТИТЬ')}</strong>
            </button>
          </div>
        </footer>
      </div>

      {winPresentation && <RoyalWinOverlay presentation={winPresentation} format={format} />}

      {showInfo && <PaytableModal onClose={() => setShowInfo(false)} />}
    </div>
  );
};
