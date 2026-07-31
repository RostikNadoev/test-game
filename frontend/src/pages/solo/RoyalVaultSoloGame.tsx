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
import './RoyalVaultSoloGame.css';

type SymbolId = 'wild' | 'diamond' | 'clover' | 'coin' | 'star' | 'orb';
type SlotBoard = SymbolId[][];

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
const LINE_COUNT = 10;
const QUICK_BETS = [10, 25, 50, 100];

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
const roundCredits = (value: number) => Math.round(value * 100) / 100;

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

const createOutcome = (): SlotBoard => {
  const board = Array.from({ length: REEL_COUNT }, createRandomColumn);

  if (Math.random() < 0.48) {
    const line = PAYLINES[Math.floor(Math.random() * PAYLINES.length)];
    const symbol = pickWeightedSymbol(true);
    const roll = Math.random();
    const count = roll > 0.94 ? 5 : roll > 0.78 ? 4 : 3;

    for (let reel = 0; reel < count; reel += 1) {
      board[reel][line[reel]] = reel > 0 && Math.random() < 0.12 ? 'wild' : symbol;
    }
  }

  return board;
};

const evaluateBoard = (board: SlotBoard, totalBet: number): WinLine[] => {
  const lineBet = totalBet / LINE_COUNT;

  return PAYLINES.flatMap((line, lineIndex) => {
    const ids = line.map((row, reel) => board[reel][row]);
    const target = ids.find((id) => id !== 'wild') ?? 'wild';
    let count = 0;

    for (const id of ids) {
      if (id === target || id === 'wild') count += 1;
      else break;
    }

    if (count < 3) return [];

    const payout = SYMBOL_BY_ID[target].payouts[count - 3] * lineBet;
    return [{
      lineIndex,
      symbol: target,
      count,
      amount: roundCredits(payout),
      cells: Array.from({ length: count }, (_, reel) => `${reel}-${line[reel]}`),
    }];
  });
};

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

const WinCelebration = ({ amount, onDone }: { amount: number; onDone: () => void }) => {
  const { tr, locale } = useLanguage();

  useEffect(() => {
    const timer = window.setTimeout(onDone, 1850);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <div className="rv-celebration" aria-live="polite">
      <div className="rv-celebration-rays" />
      <div className="rv-celebration-crown"><img src={iconCrown} alt="" draggable={false} /></div>
      <span>{tr('ROYAL WIN', 'КОРОЛЕВСКИЙ ВЫИГРЫШ')}</span>
      <strong>+{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)}</strong>
      <small>{tr('DEMO CREDITS', 'ДЕМО-КРЕДИТЫ')}</small>
      <div className="rv-spark-field" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ '--spark': index } as CSSProperties} />)}
      </div>
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

export const RoyalVaultSoloGame = () => {
  const { tr, locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [board, setBoard] = useState<SlotBoard>(STARTING_BOARD);
  const [spinning, setSpinning] = useState(false);
  const [settledReels, setSettledReels] = useState(REEL_COUNT);
  const [bet, setBet] = useState(25);
  const [balance, setBalance] = useState(1000);
  const [winAmount, setWinAmount] = useState(0);
  const [wins, setWins] = useState<WinLine[]>([]);
  const [activeWin, setActiveWin] = useState(0);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('royal-vault-muted') === '1');
  const [showInfo, setShowInfo] = useState(false);
  const [celebration, setCelebration] = useState<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const mountedRef = useRef(true);
  const settledRef = useRef(new Set<number>());

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
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.46), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.frequency.exponentialRampToValueAtTime(1300, now + 0.42);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
      source.connect(filter).connect(gain);
      source.start(now);
      source.stop(now + 0.48);
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
    if (spinning) return;
    if (balance < bet) {
      setAuto(false);
      haptic('error');
      return;
    }

    const targetBoard = createOutcome();
    setSpinning(true);
    setSettledReels(0);
    settledRef.current.clear();
    setWins([]);
    setActiveWin(0);
    setWinAmount(0);
    setCelebration(null);
    setBalance((value) => roundCredits(value - bet));
    haptic('tap');
    playSound('spin');

    const ticker = window.setInterval(() => {
      if (!mountedRef.current) return;
      setBoard((current) => current.map((column, reel) => (
        settledRef.current.has(reel) ? column : createRandomColumn()
      )));
    }, 76);

    await sleep(540);

    for (let reel = 0; reel < REEL_COUNT; reel += 1) {
      settledRef.current.add(reel);
      setBoard((current) => current.map((column, index) => index === reel ? targetBoard[reel] : column));
      setSettledReels(reel + 1);
      haptic('stop');
      playSound('stop');
      await sleep(150 + reel * 12);
    }

    window.clearInterval(ticker);
    const result = evaluateBoard(targetBoard, bet);
    const amount = roundCredits(result.reduce((sum, line) => sum + line.amount, 0));

    if (result.length > 0) {
      setWins(result);
      setWinAmount(amount);
      setBalance((value) => roundCredits(value + amount));
      haptic('win');
      playSound('win');
      if (amount >= bet * 2) setCelebration(amount);
    }

    setSpinning(false);
  }, [balance, bet, haptic, playSound, spinning]);

  useEffect(() => {
    document.documentElement.classList.add('royal-vault-active');
    document.body.classList.add('royal-vault-active');
    return () => {
      mountedRef.current = false;
      document.documentElement.classList.remove('royal-vault-active');
      document.body.classList.remove('royal-vault-active');
      audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, []);

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
    if (wins.length <= 1) return undefined;
    const timer = window.setInterval(() => setActiveWin((value) => (value + 1) % wins.length), 1050);
    return () => window.clearInterval(timer);
  }, [wins]);

  useEffect(() => {
    if (!auto || spinning || loading || celebration !== null) return undefined;
    if (balance < bet) {
      setAuto(false);
      return undefined;
    }
    const timer = window.setTimeout(() => void spin(), wins.length ? 1250 : 420);
    return () => window.clearTimeout(timer);
  }, [auto, balance, bet, celebration, loading, spin, spinning, wins.length]);

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
          <div><span>{tr('DEMO BALANCE', 'ДЕМО-БАЛАНС')}</span><strong>{format(balance)}</strong></div>
          <i />
          <div><span>{tr('LAST WIN', 'ВЫИГРЫШ')}</span><strong className={winAmount > 0 ? 'is-win' : ''}>{format(winAmount)}</strong></div>
          <b>{tr('10 LINES', '10 ЛИНИЙ')}</b>
        </div>

        <main className={`rv-machine ${spinning ? 'is-spinning' : ''} ${wins.length ? 'has-win' : ''}`}>
          <div className="rv-machine-crown">♛</div>
          <div className="rv-reel-window">
            <div className="rv-reels">
              {board.map((column, reel) => (
                <div className={`rv-reel ${reel >= settledReels ? 'is-moving' : 'is-settled'}`} key={reel} style={{ '--reel': reel } as CSSProperties}>
                  {column.map((symbolId, row) => {
                    const symbol = SYMBOL_BY_ID[symbolId];
                    const isWinning = winningCells.has(`${reel}-${row}`);
                    return (
                      <div className={`rv-symbol ${isWinning ? 'is-winning' : ''}`} key={`${reel}-${row}`} style={{ '--symbol-tone': symbol.tone } as CSSProperties}>
                        <span className="rv-symbol-glow" />
                        <img src={symbol.image} alt={symbol.label} draggable={false} />
                        {symbolId === 'wild' && <small>WILD</small>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {activeLine && (
              <svg className="rv-payline-overlay" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true">
                <polyline className="rv-payline-glow" points={linePoints(PAYLINES[activeLine.lineIndex])} />
                <polyline className="rv-payline-stroke" points={linePoints(PAYLINES[activeLine.lineIndex])} />
              </svg>
            )}

            <span className="rv-line-number rv-line-number-left">{activeLine ? activeLine.lineIndex + 1 : ''}</span>
            <span className="rv-line-number rv-line-number-right">{activeLine ? activeLine.lineIndex + 1 : ''}</span>
          </div>

          <div className="rv-result-strip" aria-live="polite">
            {spinning ? (
              <><span className="rv-status-dot" />{tr('THE VAULT IS TURNING', 'ХРАНИЛИЩЕ ВРАЩАЕТСЯ')}</>
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
            <button type="button" className="rv-spin-btn" disabled={spinning || balance < bet} onClick={() => void spin()} aria-label={tr('Spin reels', 'Крутить барабаны')}>
              <span className="rv-spin-shine" />
              <span className="rv-spin-icon"><SpinIcon /></span>
              <strong>{spinning ? tr('SPINNING', 'КРУТИМ') : tr('SPIN', 'КРУТИТЬ')}</strong>
            </button>
            <div className="rv-demo-mark"><span>DEMO</span><small>{tr('FRONTEND ONLY', 'ТОЛЬКО ФРОНТ')}</small></div>
          </div>
        </footer>
      </div>

      {showInfo && <PaytableModal onClose={() => setShowInfo(false)} />}
      {celebration !== null && <WinCelebration amount={celebration} onDone={() => setCelebration(null)} />}
    </div>
  );
};
