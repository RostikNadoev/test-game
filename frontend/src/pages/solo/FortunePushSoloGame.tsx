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
import iconCoin from '../../assets/solo/scratch/icon-coin.webp';
import iconDiamond from '../../assets/solo/scratch/icon-diamond.webp';
import iconCrown from '../../assets/solo/scratch/icon-crown.webp';
import './FortunePushSoloGame.css';

type PieceKind = 'coin' | 'crystal' | 'crown';
type PieceState = 'rest' | 'dropping' | 'falling';
type PushStage = 'idle' | 'dropping' | 'pushing' | 'bonus' | 'win';

type TablePiece = {
  id: number;
  kind: PieceKind;
  x: number;
  y: number;
  rotation: number;
  state: PieceState;
  fallValue?: number;
};

type FortuneWindow = Window &
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

const LANES = [22, 50, 78];
const QUICK_BETS = [10, 25, 50, 100];
let pieceSequence = 1;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const roundCredits = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createPiece = (kind: PieceKind, x: number, y: number, state: PieceState = 'rest'): TablePiece => ({
  id: pieceSequence++,
  kind,
  x,
  y,
  state,
  rotation: Math.round(Math.random() * 40 - 20),
});

const initialPieces = () => Array.from({ length: 30 }, (_, index) => {
  const row = Math.floor(index / 6);
  const column = index % 6;
  const kind: PieceKind = index === 8 || index === 23 ? 'crystal' : index === 16 ? 'crown' : 'coin';
  return createPiece(
    kind,
    clamp(10 + column * 16 + (Math.random() * 4 - 2), 8, 92),
    clamp(39 + row * 9.4 + (Math.random() * 3 - 1.5), 34, 84),
  );
});

const pickMultiplier = () => {
  const roll = Math.random() * 100;
  if (roll < 36) return 0;
  if (roll < 54) return 0.5;
  if (roll < 73) return 1;
  if (roll < 87) return 2;
  if (roll < 95) return 3;
  if (roll < 99) return 5;
  return 10;
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

const FortuneInfo = ({ onClose }: { onClose: () => void }) => {
  const { tr } = useLanguage();
  return createPortal(
    <div className="fp-modal-layer" onPointerDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="fp-info" role="dialog" aria-modal="true" aria-label={tr('Game rules', 'Правила игры')}>
        <div className="fp-info-head">
          <div><span>{tr('TABLE GUIDE', 'ПРАВИЛА СТОЛА')}</span><h2>{tr('How to play', 'Как играть')}</h2></div>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><CloseIcon /></button>
        </div>
        <p>{tr(
          'Choose one of three lanes and drop a coin. The moving shelf pushes the whole field. Every item that falls over the front edge becomes your prize.',
          'Выбери одну из трёх дорожек и сбрось монету. Подвижная платформа толкает всё поле. Каждый предмет, упавший с переднего края, становится твоим призом.',
        )}</p>
        <div className="fp-info-items">
          <div><img src={iconCoin} alt="Coin" /><span>{tr('COIN', 'МОНЕТА')}</span><strong>0.5×–2×</strong></div>
          <div><img src={iconDiamond} alt="Crystal" /><span>{tr('CRYSTAL', 'КРИСТАЛЛ')}</span><strong>+1 ◆</strong></div>
          <div><img src={iconCrown} alt="Crown" /><span>{tr('CROWN', 'КОРОНА')}</span><strong>5×–10×</strong></div>
        </div>
        <div className="fp-bonus-rule"><div><i /><i /><i /></div><strong>GOLDEN PUSH</strong><p>{tr('Collect three crystals to trigger a guaranteed bonus push.', 'Собери три кристалла, чтобы запустить гарантированный бонусный толчок.')}</p></div>
        <small>{tr('Frontend demo: results and balance are stored only in this screen.', 'Frontend-демо: результаты и баланс существуют только на этом экране.')}</small>
      </section>
    </div>,
    document.body,
  );
};

const FortuneLoader = ({ progress }: { progress: number }) => {
  const { tr } = useLanguage();
  return (
    <div className="fp-loader">
      <div className="fp-loader-machine">
        <div className="fp-loader-shelf" />
        {[0, 1, 2, 3, 4].map((index) => <img key={index} src={index === 2 ? iconDiamond : iconCoin} alt="" style={{ '--loader-coin': index } as CSSProperties} />)}
      </div>
      <span>{tr('FILLING THE TABLE', 'ЗАПОЛНЯЕМ СТОЛ')}</span>
      <h1>FORTUNE <em>PUSH</em></h1>
      <div className="fp-loader-bar"><i style={{ width: `${progress}%` }} /></div>
    </div>
  );
};

export const FortunePushSoloGame = () => {
  const { tr, locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [pieces, setPieces] = useState<TablePiece[]>(initialPieces);
  const [stage, setStage] = useState<PushStage>('idle');
  const [selectedLane, setSelectedLane] = useState(1);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(25);
  const [lastWin, setLastWin] = useState(0);
  const [gemMeter, setGemMeter] = useState(0);
  const [pushPulse, setPushPulse] = useState(0);
  const [presentation, setPresentation] = useState<{ amount: number; bonus: boolean } | null>(null);
  const [noDrop, setNoDrop] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('fortune-push-muted') === '1');
  const mountedRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  const busy = stage !== 'idle';
  const format = useCallback((value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value), [locale]);

  const haptic = useCallback((kind: 'tap' | 'drop' | 'push' | 'win' | 'error') => {
    const feedback = (window as FortuneWindow).Telegram?.WebApp?.HapticFeedback;
    if (kind === 'win') feedback?.notificationOccurred?.('success');
    else if (kind === 'error') feedback?.notificationOccurred?.('error');
    else feedback?.impactOccurred?.(kind === 'push' ? 'rigid' : kind === 'drop' ? 'medium' : 'light');
  }, []);

  const playSound = useCallback((kind: 'tap' | 'drop' | 'push' | 'coin' | 'win') => {
    if (muted) return;
    const AudioCtor = window.AudioContext ?? (window as FortuneWindow).webkitAudioContext;
    if (!AudioCtor) return;
    const context = audioRef.current ?? new AudioCtor();
    audioRef.current = context;
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    gain.connect(context.destination);
    oscillator.connect(gain);
    oscillator.type = kind === 'push' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(kind === 'tap' ? 330 : kind === 'drop' ? 210 : kind === 'push' ? 92 : kind === 'coin' ? 760 : 520, now);
    if (kind === 'coin') oscillator.frequency.exponentialRampToValueAtTime(1120, now + 0.12);
    if (kind === 'win') oscillator.frequency.exponentialRampToValueAtTime(1260, now + 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.1 : 0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.46 : 0.16));
    oscillator.start(now);
    oscillator.stop(now + (kind === 'win' ? 0.48 : 0.18));
  }, [muted]);

  const refillTable = useCallback(() => {
    setPieces((current) => {
      if (current.length >= 25) return current;
      const missing = 28 - current.length;
      return [
        ...current,
        ...Array.from({ length: missing }, (_, index) => createPiece(
          index === 3 ? 'crystal' : 'coin',
          12 + (index % 6) * 15 + Math.random() * 3,
          35 + Math.floor(index / 6) * 8 + Math.random() * 3,
        )),
      ];
    });
  }, []);

  const drop = useCallback(async () => {
    if (busy) return;
    if (balance < bet) {
      haptic('error');
      return;
    }

    const bonusRound = gemMeter >= 3;
    const laneX = LANES[selectedLane];
    const droppedKind: PieceKind = bonusRound ? 'crown' : Math.random() < 0.13 ? 'crystal' : 'coin';
    const dropped = createPiece(droppedKind, laneX, 4, 'dropping');
    setBalance((value) => roundCredits(value - bet));
    setLastWin(0);
    setNoDrop(false);
    setPresentation(null);
    setPieces((current) => [...current, dropped]);
    setStage(bonusRound ? 'bonus' : 'dropping');
    haptic('drop');
    playSound('drop');

    if (bonusRound) {
      setGemMeter(0);
      const rain = Array.from({ length: 6 }, (_, index) => createPiece('coin', 14 + index * 14 + Math.random() * 3, -2 - index * 1.5, 'dropping'));
      setPieces((current) => [...current, ...rain]);
    }

    await sleep(90);
    if (!mountedRef.current) return;
    setPieces((current) => current.map((piece) => piece.state === 'dropping'
      ? { ...piece, y: 31 + Math.random() * 13, x: clamp(piece.x + Math.random() * 5 - 2.5, 8, 92) }
      : piece));
    await sleep(bonusRound ? 720 : 560);
    if (!mountedRef.current) return;
    setPieces((current) => current.map((piece) => piece.state === 'dropping' ? { ...piece, state: 'rest' } : piece));
    setStage('pushing');

    for (let pulse = 0; pulse < 3; pulse += 1) {
      setPushPulse((value) => value + 1);
      setPieces((current) => current.map((piece) => {
        if (piece.state !== 'rest') return piece;
        const laneForce = Math.abs(piece.x - laneX) < 19 ? 6.2 : 3.4;
        return {
          ...piece,
          x: clamp(piece.x + (Math.random() * 3.2 - 1.6), 6, 94),
          y: clamp(piece.y + laneForce + Math.random() * 2, 26, 86),
        };
      }));
      haptic('push');
      playSound('push');
      await sleep(430);
      if (!mountedRef.current) return;
    }

    const multiplier = bonusRound ? [3, 5, 8][Math.floor(Math.random() * 3)] : pickMultiplier();
    const amount = roundCredits(bet * multiplier);
    const fallCount = multiplier <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(multiplier / 2)));

    if (fallCount > 0) {
      setPieces((current) => {
        const candidates = [...current].filter((piece) => piece.state === 'rest').sort((a, b) => b.y - a.y).slice(0, fallCount);
        const fallingIds = new Set(candidates.map((piece) => piece.id));
        return current.map((piece) => fallingIds.has(piece.id)
          ? { ...piece, state: 'falling', y: 112, fallValue: roundCredits(amount / fallCount) }
          : piece);
      });
      haptic('win');
      playSound('coin');
      await sleep(720);
      if (!mountedRef.current) return;
      setPieces((current) => current.filter((piece) => piece.state !== 'falling'));
      setBalance((value) => roundCredits(value + amount));
      setLastWin(amount);
      setPresentation({ amount, bonus: bonusRound });
      setStage('win');
      playSound('win');
      await sleep(1550);
      if (!mountedRef.current) return;
      setPresentation(null);
    } else {
      setNoDrop(true);
      await sleep(780);
      setNoDrop(false);
    }

    if (!bonusRound && (droppedKind === 'crystal' || Math.random() < 0.31)) {
      setGemMeter((value) => Math.min(3, value + 1));
    }

    refillTable();
    setStage('idle');
  }, [balance, bet, busy, gemMeter, haptic, playSound, refillTable, selectedLane]);

  useEffect(() => {
    mountedRef.current = true;
    document.documentElement.classList.add('fortune-push-active');
    document.body.classList.add('fortune-push-active');
    return () => {
      mountedRef.current = false;
      document.documentElement.classList.remove('fortune-push-active');
      document.body.classList.remove('fortune-push-active');
      audioRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const duration = 1250;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setLoadProgress((1 - Math.pow(1 - progress, 3)) * 100);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else window.setTimeout(() => setLoading(false), 110);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localStorage.setItem('fortune-push-muted', muted ? '1' : '0');
  }, [muted]);

  const pieceCounts = useMemo(() => ({
    coins: pieces.filter((piece) => piece.kind === 'coin').length,
    specials: pieces.filter((piece) => piece.kind !== 'coin').length,
  }), [pieces]);

  if (loading) return <div className="fp-root"><FortuneLoader progress={loadProgress} /></div>;

  return (
    <div className="fp-root">
      <div className="fp-content">
        <header className="fp-head">
          <button type="button" className="fp-icon-btn" onClick={() => setShowInfo(true)} aria-label={tr('Game rules', 'Правила игры')}><InfoIcon /></button>
          <div><span>{tr('PHYSICS TABLE', 'ФИЗИЧЕСКИЙ СТОЛ')}</span><h1>FORTUNE <em>PUSH</em></h1></div>
          <button type="button" className="fp-icon-btn" onClick={() => { setMuted((value) => !value); haptic('tap'); }} aria-label={muted ? tr('Turn sound on', 'Включить звук') : tr('Turn sound off', 'Выключить звук')}><SoundIcon muted={muted} /></button>
        </header>

        <div className="fp-stats">
          <div><span>{tr('DEMO BALANCE', 'ДЕМО-БАЛАНС')}</span><strong>{format(balance)}</strong></div>
          <i />
          <div><span>{tr('LAST WIN', 'ВЫИГРЫШ')}</span><strong className={lastWin > 0 ? 'is-win' : ''}>{format(lastWin)}</strong></div>
          <b>{pieceCounts.coins + pieceCounts.specials} {tr('ITEMS', 'ФИШЕК')}</b>
        </div>

        <main className={`fp-machine stage-${stage}`}>
          <div className="fp-lane-rail">
            {LANES.map((lane, index) => <button key={lane} type="button" disabled={busy} className={selectedLane === index ? 'active' : ''} onClick={() => { setSelectedLane(index); haptic('tap'); playSound('tap'); }}><i /><span>{index + 1}</span></button>)}
          </div>

          <div className="fp-table">
            <div className="fp-back-wall"><span>{tr('DROP ZONE', 'ЗОНА СБРОСА')}</span></div>
            <div className="fp-pusher" key={pushPulse}><i /><span /></div>
            <div className="fp-field">
              <div className="fp-lane-guide" style={{ '--lane-x': `${LANES[selectedLane]}%` } as CSSProperties} />
              {pieces.map((piece) => (
                <span
                  key={piece.id}
                  className={`fp-piece is-${piece.kind} is-${piece.state}`}
                  style={{ '--piece-x': `${piece.x}%`, '--piece-y': `${piece.y}%`, '--piece-rotation': `${piece.rotation}deg` } as CSSProperties}
                >
                  <img src={piece.kind === 'coin' ? iconCoin : piece.kind === 'crystal' ? iconDiamond : iconCrown} alt={piece.kind} draggable={false} />
                  {piece.state === 'falling' && piece.fallValue && <b>+{format(piece.fallValue)}</b>}
                </span>
              ))}
            </div>
            <div className="fp-front-edge"><i /><span>{tr('PRIZE EDGE', 'ПРИЗОВОЙ КРАЙ')}</span></div>
            <div className="fp-catch-tray" />
          </div>

          <div className="fp-gem-meter">
            <span>GOLDEN PUSH</span>
            <div>{[0, 1, 2].map((index) => <i className={index < gemMeter ? 'filled' : ''} key={index}><img src={iconDiamond} alt="" /></i>)}</div>
            <small>{gemMeter >= 3 ? tr('BONUS READY', 'БОНУС ГОТОВ') : `${gemMeter}/3`}</small>
          </div>

          {presentation && <div className={`fp-win-reveal ${presentation.bonus ? 'is-bonus' : ''}`} aria-live="polite"><div><img src={presentation.bonus ? iconCrown : iconCoin} alt="" /><span>{presentation.bonus ? 'GOLDEN PUSH' : tr('TABLE WIN', 'ВЫИГРЫШ')}</span><strong>+{format(presentation.amount)}</strong><small>{tr('FELL OVER THE EDGE', 'УПАЛО С КРАЯ')}</small></div></div>}
          {noDrop && <div className="fp-no-drop"><i>◆</i><strong>{tr('NO DROP', 'НИЧЕГО НЕ УПАЛО')}</strong><span>{tr('The table is getting heavier', 'На столе становится теснее')}</span></div>}

          <div className="fp-status" aria-live="polite">
            {stage === 'dropping' || stage === 'bonus' ? <><i />{stage === 'bonus' ? 'GOLDEN RAIN' : tr('COIN DROPPED', 'МОНЕТА СБРОШЕНА')}</>
              : stage === 'pushing' ? <><b>⇣</b>{tr('PUSHING THE FIELD', 'ТОЛКАЕМ ПОЛЕ')}</>
                : stage === 'win' ? <><i className="win" />{tr('PRIZE COLLECTED', 'ПРИЗ СОБРАН')}</>
                  : <><b>◆</b>{tr('Choose a lane and drop', 'Выбери дорожку и сбрось монету')}</>}
          </div>
        </main>

        <footer className="fp-controls">
          <div className="fp-bet-row">
            <div><span>{tr('COIN VALUE', 'ЦЕНА МОНЕТЫ')}</span><strong>{format(bet)}</strong></div>
            {QUICK_BETS.map((value) => <button type="button" key={value} className={bet === value ? 'active' : ''} disabled={busy} onClick={() => { setBet(value); setLastWin(0); haptic('tap'); playSound('tap'); }}>{value}</button>)}
          </div>
          <div className="fp-actions">
            <div className="fp-lane-readout"><span>{tr('LANE', 'ДОРОЖКА')}</span><strong>0{selectedLane + 1}</strong></div>
            <button type="button" className="fp-drop-btn" disabled={busy || balance < bet} onClick={() => void drop()}><span className="fp-drop-coin"><img src={gemMeter >= 3 ? iconCrown : iconCoin} alt="" /></span><strong>{busy ? tr('PUSHING', 'ТОЛКАЕМ') : gemMeter >= 3 ? 'GOLDEN PUSH' : tr('DROP COIN', 'СБРОСИТЬ')}</strong></button>
            <div className="fp-demo"><span>DEMO</span><small>{tr('FRONTEND ONLY', 'ТОЛЬКО ФРОНТ')}</small></div>
          </div>
        </footer>
      </div>
      {showInfo && <FortuneInfo onClose={() => setShowInfo(false)} />}
    </div>
  );
};
