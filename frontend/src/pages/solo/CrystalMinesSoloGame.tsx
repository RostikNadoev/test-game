import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSoloSession } from '../../hooks/useSoloSession';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CrystalMinesPublicState } from '../../api/types';
import {
  deriveCrystalMinesPicked,
  mergePickedSets,
} from '../../utils/soloSessionState';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';
import titleAsset from '../../assets/solo/mines/title.webp';
import tileAsset from '../../assets/solo/mines/tile.webp';
import diamondAsset from '../../assets/solo/mines/diamond.webp';
import bombAsset from '../../assets/solo/mines/bomb.webp';

const GRID = 25;
const MIN_BET = 1;
const QUICK_BETS = [10, 50, 100].filter((value) => value >= MIN_BET);

const formatMoney = (value: number, locale = 'en-US') =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

const restoreMinesViewport = () => {
  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelector<HTMLElement>('.cm-page')?.parentElement?.scrollTo(0, 0);
  };

  window.requestAnimationFrame(resetScroll);
  window.setTimeout(resetScroll, 180);
  window.setTimeout(resetScroll, 420);
};

type Phase = 'idle' | 'playing' | 'finished';
type FinishType = 'win' | 'lose' | null;

type StepEvent = {
  cell_index: number;
  safe: boolean;
  status: string;
  multiplier: number;
  reveal_mines?: number[];
  payout?: number;
};

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 10.6v5.7M12 7.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const MinesLoadingScreen = ({ progress }: { progress: number }) => (
  <div className="cm-loading" aria-hidden="true">
    <div className="cm-loading-aura" />
    <div className="cm-loading-scene">
      <img className="cm-loading-diamond is-left" src={diamondAsset} alt="" />
      <img className="cm-loading-bomb" src={bombAsset} alt="" />
      <img className="cm-loading-diamond is-right" src={diamondAsset} alt="" />
    </div>
    <img className="cm-loading-title" src={titleAsset} alt="Crystal Mines" />
    <div className="cm-loading-track"><span style={{ width: `${progress}%` }} /></div>
  </div>
);

const MinesInfoModal = ({ bet, onClose }: { bet: number; onClose: () => void }) => {
  const { locale, tr } = useLanguage();

  return createPortal(
    <div className="cm-modal-layer" onClick={onClose}>
      <div className="cm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="cm-modal-head">
          <div><p>{tr('INFO', 'ИНФО')}</p><h2>Crystal Mines</h2></div>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'Закрыть')}><CloseIcon /></button>
        </div>
        <div className="cm-modal-body">
          <section>
            <h3>{tr('How to play', 'Как играть')}</h3>
            <p>{tr(
              'Open tiles one by one. Every crystal increases the multiplier; a mine ends the round.',
              'Открывай плитки по одной. Каждый кристалл повышает множитель, а мина завершает раунд.',
            )}</p>
          </section>
          <section>
            <h3>{tr('Cashout', 'Забрать выигрыш')}</h3>
            <p>{tr(
              'After the first crystal you can lock in the current payout at any time.',
              'После первого кристалла можно в любой момент забрать текущий выигрыш.',
            )}</p>
          </section>
          <div className="cm-info-bet">
            <span>{tr('Current bet', 'Текущая ставка')}</span>
            <strong>{formatMoney(bet, locale)} GAME</strong>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const MinesResultEffect = ({ type, win, bet, onClose }: {
  type: Exclude<FinishType, null>;
  win: number;
  bet: number;
  onClose: () => void;
}) => {
  const { locale, tr } = useLanguage();
  const ratio = bet > 0 ? win / bet : 0;
  const isLoss = type === 'lose';
  const tier = isLoss ? 'is-lose' : ratio >= 7 ? 'is-epic' : ratio >= 3 ? 'is-big' : 'is-win';
  const effectCount = isLoss ? 14 : ratio >= 7 ? 26 : ratio >= 3 ? 20 : 14;

  useEffect(() => {
    const timer = window.setTimeout(onClose, isLoss ? 1450 : 1950);
    return () => window.clearTimeout(timer);
  }, [isLoss, onClose]);

  return createPortal(
    <div className={`cm-result-effect ${tier}`} aria-live="polite">
      <div className="cm-result-copy">
        <span>{isLoss ? tr('Mine found', 'Найдена мина') : tr('WIN', 'ВЫИГРЫШ')}</span>
        {!isLoss && (
          <strong>
            {formatMoney(win, locale)}
            <img src={coinIcon} alt="" />
          </strong>
        )}
      </div>

      <div className="cm-result-confetti" aria-hidden="true">
        {Array.from({ length: effectCount }, (_, index) => (
        <i
          key={index}
          style={
            {
              '--cm-fx': index,
              '--cm-left': `${(index * 41 + 7) % 94}%`,
              '--cm-drift': `${((index % 5) - 2) * 18}px`,
            } as CSSProperties
          }
        />
        ))}
      </div>
    </div>,
    document.body,
  );
};

export const CrystalMinesSoloGame = () => {
  const { locale, tr } = useLanguage();
  const { canAfford, setError: setWalletError } = useSoloWallet();
  const session = useSoloSession('crystal_mines');
  const { markPublicStateHydrated, publicState, resumed, status, isSessionPlayable } = session;

  const [betInput, setBetInput] = useState('10');
  const [phase, setPhase] = useState<Phase>('idle');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [revealedMines, setRevealedMines] = useState<number[]>([]);
  const [lastWin, setLastWin] = useState(0);
  const [finishType, setFinishType] = useState<FinishType>(null);
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showFinal, setShowFinal] = useState(false);
  const [loadingScreen, setLoadingScreen] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  const bet = useMemo(() => {
    const value = Math.floor(Number(betInput.replace(',', '.')));
    if (!Number.isFinite(value)) return 0;
    return value;
  }, [betInput]);

  const effectivePhase: Phase =
    session.sessionId && status === 'active' && isSessionPlayable ? 'playing' : phase;

  const effectiveBet =
    session.sessionId && status === 'active' && session.betCoins > 0
      ? session.betCoins
      : bet;

  const derivedPicked = useMemo(
    () => deriveCrystalMinesPicked(publicState as CrystalMinesPublicState | null),
    [publicState],
  );

  const effectivePicked = useMemo(
    () => mergePickedSets(picked, derivedPicked),
    [derivedPicked, picked],
  );

  const multiplier = session.multiplier || 1;

  const cashoutRawValue = useMemo(() => {
    if (effectiveBet < MIN_BET) return 0;
    return Number((effectiveBet * multiplier).toFixed(2));
  }, [effectiveBet, multiplier]);

  const cashoutValue = useMemo(() => formatMoney(cashoutRawValue, locale), [cashoutRawValue, locale]);

  const canStart =
    effectivePhase === 'idle' &&
    !session.loading &&
    bet >= MIN_BET &&
    canAfford(bet);

  const canPick =
    effectivePhase === 'playing' &&
    isSessionPlayable &&
    pendingCell === null &&
    !session.loading;

  const canCashout =
    effectivePhase === 'playing' &&
    session.openedSteps > 0 &&
    pendingCell === null &&
    !session.loading;

  useEffect(() => {
    if (!resumed || status !== 'active') return;

    const state = publicState as CrystalMinesPublicState | null;
    if (!state) return;

    setPicked(new Set(state.picked ?? []));
    setRevealedMines([]);
    setLastWin(0);
    setFinishType(null);
    setPendingCell(null);
    setShowFinal(false);
    setPhase('playing');

    if (session.betCoins > 0) {
      setBetInput(String(session.betCoins));
    }

    markPublicStateHydrated();
  }, [markPublicStateHydrated, publicState, resumed, session.betCoins, status]);

  const resetToIdle = () => {
    session.reset();
    setPicked(new Set());
    setRevealedMines([]);
    setLastWin(0);
    setFinishType(null);
    setPendingCell(null);
    setShowFinal(false);
    setPhase('idle');
  };

  const start = async () => {
    const normalizedBet = Math.max(MIN_BET, Math.floor(Number(bet) || MIN_BET));

    if (!canAfford(normalizedBet)) {
      setWalletError('insufficient balance');
      return;
    }

    session.reset();
    (document.activeElement as HTMLElement | null)?.blur?.();
    restoreMinesViewport();
    setBetInput(String(normalizedBet));
    setPicked(new Set());
    setRevealedMines([]);
    setLastWin(0);
    setFinishType(null);
    setPendingCell(null);
    setShowFinal(false);

    try {
      await session.start(normalizedBet);
      setPhase('playing');
    } catch {
      // handled
    }
  };

  const pickCell = async (index: number) => {
    if (!canPick || effectivePicked.has(index)) return;

    setPendingCell(index);

    try {
      const response = await session.step('pick', { cell_index: index });
      const event = response.event as StepEvent;

      if (event.reveal_mines?.length) {
        setRevealedMines(event.reveal_mines);
      }

      setPicked((prev) => new Set(prev).add(index));

      if (event.status === 'bust' || event.status === 'completed') {
        const payout = response.payout_coins ?? event.payout ?? 0;

        setPhase('finished');
        setLastWin(payout);
        setFinishType(event.status === 'bust' ? 'lose' : 'win');
        window.setTimeout(() => setShowFinal(true), 560);
      }
    } catch {
      // handled
    } finally {
      setPendingCell(null);
    }
  };

  const cashout = async () => {
    if (!canCashout) return;

    try {
      const response = await session.cashout();
      setPhase('finished');
      setLastWin(response.payout_coins ?? 0);
      setFinishType('win');
      window.setTimeout(() => setShowFinal(true), 240);
    } catch {
      // handled
    }
  };

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const duration = 1650;
    const tick = (now: number) => {
      const value = Math.min(1, (now - startedAt) / duration);
      setLoadProgress((1 - Math.pow(1 - value, 2.5)) * 100);
      if (value < 1) frame = requestAnimationFrame(tick);
      else setLoadingScreen(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className={`solo-session-page cm-page ${finishType ? `cm-${finishType}` : ''}`}>
      <style>{`
        html:has(.cm-page),
        body:has(.cm-page),
        #root:has(.cm-page) {
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
        }

        .solo-session-page.cm-page {
          width: 100%;
          height: 100%;
          min-height: 0 !important;
          max-height: 100%;
          overflow: hidden !important;
          overscroll-behavior: none;
          box-sizing: border-box;
          padding: 8px 16px 10px !important;
          color: #fff;
          background: transparent !important;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .cm-page::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          z-index: 1;
        }

        .cm-page.cm-win::before {
          opacity: 1;
          animation: cmWinGlow 1.1s ease both;
          background:
            radial-gradient(circle at center, rgba(82,255,229,.28), transparent 48%),
            radial-gradient(circle at 20% 18%, rgba(255,255,255,.14), transparent 16%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,.1), transparent 14%);
        }

        .cm-page.cm-lose::before {
          opacity: 1;
          animation: cmLoseGlow .9s ease both;
          background:
            radial-gradient(circle at center, rgba(255,94,138,.2), transparent 48%),
            linear-gradient(180deg, rgba(255,45,91,.07), transparent 55%);
        }

        .cm-page.cm-lose {
          animation: cmPageShake .32s ease both;
        }

        .cm-head {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 42px;
          align-items: center;
          gap: 8px;
          margin-top: 15px;
          margin-bottom: 5px;
        }

        .cm-info-btn {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border: 1px solid rgba(115, 225, 255, .14);
          border-radius: 15px;
          color: rgba(207, 245, 255, .82);
          background: rgba(21, 45, 65, .62);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08);
        }

        .cm-info-btn:active { transform: scale(.94); }

        .cm-title-img {
          display: block;
          width: min(82%, 330px);
          max-height: 74px;
          object-fit: contain;
          margin: 0 auto;
          filter: drop-shadow(0 12px 20px rgba(0,0,0,.28));
          pointer-events: none;
          user-select: none;
        }

        .cm-grid {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 5px;
          width: min(100%, 378px);
          max-width: 378px;
          margin: 4px auto 7px;
        }

        .cm-cell {
          aspect-ratio: 1;
          border: 0;
          padding: 0;
          background: transparent;
          border-radius: 14px;
          font-weight: 800;
          perspective: 700px;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .cm-cell:disabled {
          cursor: default;
        }

        .cm-tile {
          position: relative;
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 14px;
          transform-style: preserve-3d;
          transition:
            transform .48s cubic-bezier(.19,.9,.22,1.18),
            opacity .18s ease,
            filter .18s ease;
        }

        .cm-cell.opened .cm-tile {
          transform: rotateY(180deg);
        }

        .cm-cell.pending .cm-tile {
          animation: cmPendingTile .78s ease-in-out infinite;
        }

        .cm-cell:not(:disabled):active .cm-tile {
          transform: scale(.94);
        }

        .cm-cell.opened:not(:disabled):active .cm-tile {
          transform: rotateY(180deg) scale(.98);
        }

        .cm-face {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          backface-visibility: hidden;
          overflow: visible;
        }

        .cm-front {
          transform: rotateY(0deg);
        }

        .cm-back {
          transform: rotateY(180deg);
        }

        .cm-tile-img {
          width: 120%;
          height: 120%;
          object-fit: contain;
          display: block;
          pointer-events: none;
          user-select: none;
          filter: drop-shadow(0 8px 14px rgba(0,0,0,.22));
        }

        .cm-reveal-img {
          width: 88%;
          height: 88%;
          object-fit: contain;
          display: block;
          pointer-events: none;
          user-select: none;
          transform: translateZ(18px);
          filter: drop-shadow(0 8px 13px rgba(0,0,0,.3));
        }

        .cm-cell.safe.opened .cm-reveal-img {
          animation: cmCrystalPop .42s cubic-bezier(.2,.9,.25,1.35) both;
        }

        .cm-cell.mine.opened .cm-reveal-img {
          width: 98%;
          height: 98%;
          animation: cmMinePop .34s ease both;
        }

        .cm-panel {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          max-width: 378px;
          width: 100%;
          margin: 0 auto;
          display: grid;
          gap: 7px;
        }

        .cm-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
          border-radius: 16px;
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.08);
        }

        .cm-stat strong,
        .cm-money {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .cm-stat strong {
          color: rgba(255,255,255,.96);
        }

        .cm-coin {
          width: 20px;
          height: 20px;
          object-fit: contain;
          flex: 0 0 auto;
          filter: drop-shadow(0 3px 7px rgba(0,0,0,.28));
        }

        .cm-win .cm-stat strong {
          color: #52ffe5;
          text-shadow: 0 0 16px rgba(82,255,229,.35);
        }

        .cm-lose .cm-stat strong {
          color: #ff7d9d;
          text-shadow: 0 0 16px rgba(255,94,138,.28);
        }

        .cm-bet-row {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 8px;
          align-items: center;
        }

        .cm-bet-input-wrap {
          min-width: 0;
          height: 38px;
          display: flex;
          align-items: center;
          gap: 7px;
          border-radius: 999px;
          padding: 0 11px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          box-sizing: border-box;
        }

        .cm-bet-input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: none;
          color: #fff;
          background: transparent;
          font-size: 16px;
          font-weight: 800;
          line-height: 1;
        }

        .cm-bet-input:disabled {
          opacity: .55;
        }

        .cm-bet-input::-webkit-outer-spin-button,
        .cm-bet-input::-webkit-inner-spin-button {
          margin: 0;
          -webkit-appearance: none;
        }

        .cm-bet-input[type="number"] {
          -moz-appearance: textfield;
        }

        .cm-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .cm-btn {
          border: 0;
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 800;
          color: #fff;
          background: linear-gradient(135deg, #52ffe5, #167a70);
          box-shadow: 0 10px 24px rgba(82,255,229,.14);
          transition:
            transform .14s ease,
            opacity .14s ease,
            filter .14s ease;
        }

        .cm-btn.secondary {
          background: rgba(255,255,255,.08);
          box-shadow: none;
        }

        .cm-btn.cashout {
          position: relative;
          overflow: hidden;
          color: #031210;
          background:
            radial-gradient(circle at 30% 0%, rgba(255,255,255,.62), transparent 34%),
            linear-gradient(135deg, #eaffff 0%, #7ffff1 42%, #1fc9b8 100%);
          box-shadow:
            0 0 0 1px rgba(145,255,244,.22),
            0 12px 30px rgba(82,255,229,.24),
            inset 0 1px 0 rgba(255,255,255,.58),
            inset 0 -10px 18px rgba(0,0,0,.13);
          text-shadow: 0 1px 0 rgba(255,255,255,.35);
        }

        .cm-btn.cashout::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,.42) 42%,
            transparent 70%
          );
          transform: translateX(-120%);
          animation: cmCashoutShine 2.4s ease-in-out infinite;
          pointer-events: none;
        }

        .cm-btn.cashout:not(:disabled) {
          animation: cmCashoutPulse 1.8s ease-in-out infinite;
        }

        .cm-btn.cashout:disabled {
          color: rgba(255,255,255,.6);
          background: rgba(255,255,255,.08);
          box-shadow: none;
          text-shadow: none;
          animation: none;
        }

        .cm-btn.wide {
          grid-column: 1 / -1;
        }

        .cm-btn:not(:disabled):active {
          transform: scale(.96);
        }

        .cm-btn:disabled {
          opacity: .45;
        }

        .cm-chip {
          height: 38px;
          min-width: 52px;
          border-radius: 999px;
          padding: 0 10px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.04);
          color: #fff;
          transition:
            transform .14s ease,
            border-color .14s ease,
            color .14s ease,
            opacity .14s ease;
        }

        .cm-chip.active {
          border-color: rgba(82,255,229,.45);
          color: #52ffe5;
        }

        .cm-chip:not(:disabled):active {
          transform: scale(.95);
        }

        .cm-chip:disabled {
          opacity: .48;
        }

        .cm-loading {
          position: absolute;
          inset: 0;
          z-index: 30;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 50% 40%, rgba(25, 174, 231, .18), transparent 42%),
            linear-gradient(180deg, #061522, #030a11);
        }

        .cm-loading-aura {
          position: absolute;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(46, 204, 255, .2), transparent 68%);
          animation: cmLoadingAura 1.9s ease-in-out infinite;
        }

        .cm-loading-scene {
          position: relative;
          display: grid;
          width: 220px;
          height: 150px;
          place-items: center;
        }

        .cm-loading-bomb,
        .cm-loading-diamond {
          position: absolute;
          object-fit: contain;
          filter: drop-shadow(0 14px 25px rgba(0, 0, 0, .36));
        }

        .cm-loading-bomb {
          width: 104px;
          height: 104px;
          opacity: .5;
          animation: cmLoadingBomb 2.8s ease-in-out infinite;
        }

        .cm-loading-diamond {
          z-index: 2;
          width: 86px;
          height: 86px;
        }

        .cm-loading-diamond.is-left {
          left: 12px;
          bottom: 10px;
          animation: cmLoadingGemLeft 2.1s ease-in-out infinite;
        }

        .cm-loading-diamond.is-right {
          right: 8px;
          top: 4px;
          width: 70px;
          height: 70px;
          animation: cmLoadingGemRight 2.35s ease-in-out infinite;
        }

        .cm-loading-title {
          position: relative;
          width: min(78%, 310px);
          max-height: 76px;
          margin-top: 18px;
          object-fit: contain;
          filter: drop-shadow(0 12px 22px rgba(0, 0, 0, .34));
        }

        .cm-loading-track {
          position: relative;
          overflow: hidden;
          width: 210px;
          height: 7px;
          margin-top: 24px;
          border: 1px solid rgba(113, 225, 255, .13);
          border-radius: 999px;
          background: rgba(255, 255, 255, .05);
        }

        .cm-loading-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #197ba6, #56e7ff, #d9fbff);
          box-shadow: 0 0 14px rgba(72, 218, 255, .42);
          transition: width .1s linear;
        }

        .cm-modal-layer {
          position: fixed;
          inset: 0;
          z-index: 240;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(2, 8, 14, .62);
          -webkit-backdrop-filter: blur(14px) saturate(.82);
          backdrop-filter: blur(14px) saturate(.82);
          animation: cmOverlayIn .2s ease both;
        }

        .cm-modal {
          width: min(100%, 370px);
          overflow: hidden;
          border: 1px solid rgba(106, 224, 255, .15);
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(20, 48, 67, .98), rgba(5, 18, 29, .99));
          box-shadow: 0 28px 70px rgba(0, 0, 0, .48), inset 0 1px 0 rgba(255, 255, 255, .08);
        }

        .cm-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, .06);
        }

        .cm-modal-head p,
        .cm-modal-head h2 { margin: 0; }
        .cm-modal-head p { color: rgba(120, 224, 255, .64); font-size: 8px; letter-spacing: .16em; }
        .cm-modal-head h2 { margin-top: 4px; color: #eefcff; font-size: 18px; line-height: 1.25; }
        .cm-modal-head button { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 12px; color: rgba(255,255,255,.76); background: rgba(255,255,255,.06); }
        .cm-modal-body { display: grid; gap: 14px; padding: 16px 18px 18px; }
        .cm-modal-body section + section { padding-top: 14px; border-top: 1px solid rgba(255,255,255,.055); }
        .cm-modal-body h3 { margin: 0 0 6px; color: rgba(184, 243, 255, .9); font-size: 10px; line-height: 1.4; }
        .cm-modal-body p { margin: 0; color: rgba(255,255,255,.52); font-size: 8.5px; line-height: 1.65; }
        .cm-info-bet { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px; border-radius: 14px; background: rgba(89, 218, 255, .065); }
        .cm-info-bet span { color: rgba(255,255,255,.48); font-size: 8px; }
        .cm-info-bet strong { color: #a7efff; font-size: 10px; }

        .cm-result-effect {
          position: fixed;
          inset: 0;
          z-index: 240;
          display: grid;
          place-items: center;
          overflow: hidden;
          pointer-events: none;
          animation: cmOverlayIn .2s ease both;
        }

        .cm-result-effect:not(.is-lose) {
          background:
            radial-gradient(circle at 50% 46%, rgba(58, 226, 255, .25), transparent 43%),
            rgba(2, 10, 17, .34);
          -webkit-backdrop-filter: blur(10px) saturate(.86);
          backdrop-filter: blur(10px) saturate(.86);
        }

        .cm-result-effect.is-big {
          background:
            radial-gradient(circle at 50% 46%, rgba(92, 255, 229, .32), transparent 46%),
            rgba(2, 10, 17, .38);
        }

        .cm-result-effect.is-epic {
          background:
            radial-gradient(circle at 50% 46%, rgba(190, 120, 255, .32), transparent 47%),
            rgba(2, 10, 17, .40);
        }

        .cm-result-copy {
          position: relative;
          z-index: 2;
          display: grid;
          justify-items: center;
          gap: 9px;
          text-align: center;
          animation: cmResultCopyIn .42s cubic-bezier(.2, 1.2, .3, 1) both;
        }

        .cm-result-copy span {
          padding-block: 3px;
          color: #dffcff;
          font-size: 30px;
          line-height: 1.25;
          text-shadow: 0 0 24px rgba(82, 255, 229, .42);
        }

        .cm-result-copy strong {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding-block: 3px;
          color: #fff;
          font-size: 35px;
          line-height: 1.2;
          text-shadow: 0 0 20px rgba(92, 232, 255, .35);
        }

        .cm-result-copy strong img {
          width: 29px;
          height: 29px;
          object-fit: contain;
          filter: drop-shadow(0 5px 10px rgba(0,0,0,.3));
        }

        .cm-result-effect.is-lose .cm-result-copy {
          align-self: center;
          animation: cmSadCopyIn .4s ease-out both;
        }

        .cm-result-effect.is-lose .cm-result-copy span {
          color: rgba(205, 211, 220, .8);
          font-size: 22px;
          text-shadow: 0 6px 20px rgba(0, 0, 0, .28);
        }

        .cm-result-confetti {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .cm-result-confetti i {
          position: absolute;
          left: var(--cm-left);
          top: -18px;
          width: 7px;
          height: 14px;
          border-radius: 3px;
          opacity: 0;
          background: #52ffe5;
          box-shadow: 0 0 8px rgba(82, 255, 229, .36);
          animation: cmResultConfetti 1.55s ease-in calc(var(--cm-fx) * 24ms) both;
        }

        .cm-result-confetti i:nth-child(3n) { background: #fff; }
        .cm-result-confetti i:nth-child(3n + 1) { background: #7deaff; }
        .cm-result-effect.is-epic .cm-result-confetti i:nth-child(3n) { background: #d7a8ff; }

        .cm-result-effect.is-lose .cm-result-confetti i {
          width: 6px;
          height: 11px;
          border-radius: 999px;
          background: rgba(159, 167, 179, .62);
          box-shadow: none;
          animation-name: cmSadConfetti;
          animation-duration: 1.35s;
        }

        @keyframes cmCrystalPop {
          0% { opacity: 0; transform: translateZ(18px) scale(.35) rotate(-12deg); }
          70% { opacity: 1; transform: translateZ(18px) scale(1.22) rotate(7deg); }
          100% { opacity: 1; transform: translateZ(18px) scale(1) rotate(0); }
        }

        @keyframes cmPendingTile { 50% { filter: brightness(1.16); transform: scale(.97); } }
        @keyframes cmLoadingAura { 50% { transform: scale(1.12); opacity: .72; } }
        @keyframes cmLoadingBomb { 0%, 100% { transform: translateY(1px) rotate(-5deg); } 50% { transform: translateY(-7px) rotate(6deg); } }
        @keyframes cmLoadingGemLeft { 0%, 100% { transform: translate(0, 0) rotate(-10deg); } 50% { transform: translate(6px, -9px) rotate(4deg); } }
        @keyframes cmLoadingGemRight { 0%, 100% { transform: translate(0, 0) rotate(8deg); } 50% { transform: translate(-5px, 8px) rotate(-5deg); } }
        @keyframes cmOverlayIn { from { opacity: 0; } }
        @keyframes cmResultCopyIn { from { opacity: 0; transform: translateY(12px) scale(.72); } }
        @keyframes cmSadCopyIn { from { opacity: 0; transform: translateY(-8px); } }
        @keyframes cmResultConfetti {
          0% { opacity: 0; transform: translate3d(0, -20px, 0) rotate(0); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--cm-drift), 105dvh, 0) rotate(520deg); }
        }
        @keyframes cmSadConfetti {
          0% { opacity: 0; transform: translate3d(0, -18px, 0) rotate(0); }
          16% { opacity: .62; }
          100% { opacity: 0; transform: translate3d(var(--cm-drift), 82dvh, 0) rotate(145deg); }
        }

        @keyframes cmMinePop {
          0% { opacity: 0; transform: translateZ(18px) scale(.35) rotate(0); }
          35% { opacity: 1; transform: translateZ(18px) scale(1.2) rotate(-12deg); }
          65% { transform: translateZ(18px) scale(1.04) rotate(10deg); }
          100% { opacity: 1; transform: translateZ(18px) scale(1) rotate(0); }
        }

        @keyframes cmWinGlow {
          0% { opacity: 0; transform: scale(.96); }
          20% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.04); }
        }

        @keyframes cmLoseGlow {
          0% { opacity: 0; }
          18% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes cmPageShake {
          0%, 100% { transform: translateX(0); }
          22% { transform: translateX(-4px); }
          44% { transform: translateX(4px); }
          66% { transform: translateX(-3px); }
          84% { transform: translateX(2px); }
        }

        @keyframes cmCashoutShine {
          0%, 45% {
            transform: translateX(-120%);
          }

          75%, 100% {
            transform: translateX(120%);
          }
        }

        @keyframes cmCashoutPulse {
          0%, 100% {
            filter: brightness(1);
          }

          50% {
            filter: brightness(1.12);
          }
        }

        @media (max-height: 680px) {
          .solo-session-page.cm-page {
            padding: 6px 14px 8px !important;
          }

          .cm-head {
            margin-top: 13px;
            margin-bottom: 4px;
          }

          .cm-title-img {
            width: min(78%, 300px);
            max-height: 60px;
          }

          .cm-grid {
            gap: 4px;
            margin: 4px auto 6px;
            max-width: 350px;
          }

          .cm-panel {
            gap: 6px;
            max-width: 350px;
          }

          .cm-stat {
            padding: 8px 12px;
          }

          .cm-btn {
            padding: 11px 12px;
          }
        }

        @media (max-height: 610px) {
          .cm-head {
            margin-top: 8px;
            margin-bottom: 3px;
          }

          .cm-title-img {
            width: min(72%, 260px);
            max-height: 48px;
          }

          .cm-grid {
            max-width: 320px;
            gap: 4px;
            margin: 3px auto 4px;
          }

          .cm-panel {
            max-width: 320px;
            gap: 5px;
          }

          .cm-stat {
            padding: 7px 11px;
            font-size: 13px;
          }

          .cm-btn {
            padding: 10px;
            border-radius: 14px;
          }

          .cm-bet-row {
            gap: 6px;
          }

          .cm-chip {
            height: 34px;
            min-width: 48px;
            padding: 0 8px;
          }

          .cm-bet-input-wrap {
            height: 34px;
          }
        }

        @media (max-width: 360px) {
          .solo-session-page.cm-page {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }

          .cm-title-img {
            width: min(82%, 280px);
          }

          .cm-grid {
            gap: 4px;
            max-width: 340px;
          }

          .cm-panel {
            max-width: 340px;
          }

          .cm-bet-row {
            grid-template-columns: 1fr repeat(3, 44px);
          }

          .cm-chip {
            min-width: 44px;
            padding: 0 6px;
          }

          .cm-coin {
            width: 15px;
            height: 15px;
          }
        }
      `}</style>

      {loadingScreen && <MinesLoadingScreen progress={loadProgress} />}

      <div className="cm-head">
        <button type="button" className="cm-info-btn" onClick={() => setShowInfo(true)} aria-label={tr('Information', 'Информация')}>
          <InfoIcon />
        </button>
        <img className="cm-title-img" src={titleAsset} alt="Crystal Mines" />
        <span aria-hidden="true" />
      </div>

      <div className="cm-grid">
        {Array.from({ length: GRID }, (_, index) => {
          const isPending = pendingCell === index;
          const isPicked = effectivePicked.has(index) && !isPending;
          const isMine = revealedMines.includes(index);
          const isSafe = isPicked && !isMine;
          const isOpened = (isPicked || isMine) && !isPending;

          return (
            <button
              key={index}
              type="button"
              className={`cm-cell ${isOpened ? 'opened' : ''} ${isSafe ? 'safe' : ''} ${isPending ? 'pending' : ''} ${
                isMine ? 'mine' : ''
              }`}
              disabled={!canPick || isPicked || effectivePhase !== 'playing'}
              onClick={() => void pickCell(index)}
            >
              <span className="cm-tile">
                <span className="cm-face cm-front">
                  <img className="cm-tile-img" src={tileAsset} alt="" />
                </span>

                <span className="cm-face cm-back">
                  {isOpened ? (
                    <img
                      className="cm-reveal-img"
                      src={isMine ? bombAsset : diamondAsset}
                      alt=""
                    />
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="cm-panel">
        <div className="cm-stat">
          <span>{tr('Multiplier', 'Множитель')}</span>
          <strong>x{multiplier.toFixed(2)}</strong>
        </div>

        <div className="cm-stat">
          <span>{tr('Cashout', 'Забрать')}</span>
          <strong className="cm-money">
            {cashoutValue}
            <img className="cm-coin" src={coinIcon} alt="" />
          </strong>
        </div>

        <div className="cm-bet-row">
          <label className="cm-bet-input-wrap">
            <img className="cm-coin" src={coinIcon} alt="" />
            <input
              className="cm-bet-input"
              type="number"
              min={MIN_BET}
              inputMode="numeric"
              value={betInput}
              disabled={effectivePhase === 'playing' || phase === 'finished'}
              onChange={(event) => setBetInput(event.currentTarget.value)}
              onBlur={restoreMinesViewport}
            />
          </label>

          {QUICK_BETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`cm-chip ${bet === value ? 'active' : ''}`}
              disabled={effectivePhase === 'playing' || phase === 'finished'}
              onClick={() => setBetInput(String(value))}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="cm-actions">
          {effectivePhase === 'idle' ? (
            <button
              type="button"
              className="cm-btn wide"
              disabled={!canStart}
              onClick={() => void start()}
            >
              {tr('Play', 'Играть')}
            </button>
          ) : phase === 'finished' ? (
            <button type="button" className="cm-btn wide" onClick={resetToIdle}>
              {tr('Play again', 'Заново')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="cm-btn cashout"
                onClick={() => void cashout()}
                disabled={!canCashout}
              >
                {tr('Cashout', 'Забрать')}
              </button>

              <button type="button" className="cm-btn" disabled>
                {tr('Picks', 'Ходов')}: {session.openedSteps}
              </button>
            </>
          )}
        </div>
      </div>

      {showInfo && <MinesInfoModal bet={effectiveBet} onClose={() => setShowInfo(false)} />}
      {showFinal && finishType && (
        <MinesResultEffect
          type={finishType}
          win={lastWin}
          bet={effectiveBet}
          onClose={() => setShowFinal(false)}
        />
      )}
    </main>
  );
};
