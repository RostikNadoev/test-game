import { useEffect, useMemo, useState } from 'react';
import { useSoloSession } from '../../hooks/useSoloSession';
import { useSoloWallet } from '../../hooks/useSoloWallet';
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

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

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

export const CrystalMinesSoloGame = () => {
  const { canAfford, setError: setWalletError } = useSoloWallet();
  const session = useSoloSession('crystal_mines');
  const { markPublicStateHydrated, publicState, resumed, status, isSessionPlayable } = session;

  const [betInput, setBetInput] = useState('10');
  const [phase, setPhase] = useState<Phase>('idle');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [revealedMines, setRevealedMines] = useState<number[]>([]);
  const [lastWin, setLastWin] = useState(0);
  const [finishType, setFinishType] = useState<FinishType>(null);

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

  const cashoutValue = useMemo(() => formatMoney(cashoutRawValue), [cashoutRawValue]);

  const canStart =
    effectivePhase === 'idle' &&
    !session.loading &&
    bet >= MIN_BET &&
    canAfford(bet);

  const canPick =
    effectivePhase === 'playing' &&
    isSessionPlayable &&
    !session.loading;

  const canCashout =
    effectivePhase === 'playing' &&
    session.openedSteps > 0 &&
    !session.loading;

  useEffect(() => {
    if (!resumed || status !== 'active') return;

    const state = publicState as CrystalMinesPublicState | null;
    if (!state) return;

    setPicked(new Set(state.picked ?? []));
    setRevealedMines([]);
    setLastWin(0);
    setFinishType(null);
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
    setPhase('idle');
  };

  const start = async () => {
    const normalizedBet = Math.max(MIN_BET, Math.floor(Number(bet) || MIN_BET));

    if (!canAfford(normalizedBet)) {
      setWalletError('insufficient balance');
      return;
    }

    session.reset();
    setBetInput(String(normalizedBet));
    setPicked(new Set());
    setRevealedMines([]);
    setLastWin(0);
    setFinishType(null);

    try {
      await session.start(normalizedBet);
      setPhase('playing');
    } catch {
      // handled
    }
  };

  const pickCell = async (index: number) => {
    if (!canPick || effectivePicked.has(index)) return;

    try {
      const response = await session.step('pick', { cell_index: index });
      const event = response.event as StepEvent;

      setPicked((prev) => new Set(prev).add(index));

      if (event.reveal_mines?.length) {
        setRevealedMines(event.reveal_mines);
      }

      if (event.status === 'bust' || event.status === 'completed') {
        const payout = response.payout_coins ?? event.payout ?? 0;

        setPhase('finished');
        setLastWin(payout);
        setFinishType(event.status === 'bust' ? 'lose' : 'win');
      }
    } catch {
      // handled
    }
  };

  const cashout = async () => {
    if (!canCashout) return;

    try {
      const response = await session.cashout();
      setPhase('finished');
      setLastWin(response.payout_coins ?? 0);
      setFinishType('win');
    } catch {
      // handled
    }
  };

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
          height: 100dvh;
          min-height: 0 !important;
          max-height: 100dvh;
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
          text-align: center;
          margin-top: 15px;
          margin-bottom: 5px;
        }

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
          font-size: 14px;
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

        .cm-casino-fx {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          overflow: hidden;
        }

        .cm-casino-fx span {
          position: absolute;
          top: -18px;
          width: 7px;
          height: 14px;
          border-radius: 999px;
          background: rgba(82,255,229,.9);
          opacity: 0;
        }

        .cm-win .cm-casino-fx span {
          animation: cmConfetti 1.2s ease-out both;
        }

        .cm-casino-fx span:nth-child(1) { left: 8%; animation-delay: .02s; background: #52ffe5; }
        .cm-casino-fx span:nth-child(2) { left: 18%; animation-delay: .08s; background: #ffffff; }
        .cm-casino-fx span:nth-child(3) { left: 29%; animation-delay: .14s; background: #52ffe5; }
        .cm-casino-fx span:nth-child(4) { left: 41%; animation-delay: .04s; background: #ffe27a; }
        .cm-casino-fx span:nth-child(5) { left: 53%; animation-delay: .12s; background: #ffffff; }
        .cm-casino-fx span:nth-child(6) { left: 66%; animation-delay: .06s; background: #52ffe5; }
        .cm-casino-fx span:nth-child(7) { left: 77%; animation-delay: .16s; background: #ffe27a; }
        .cm-casino-fx span:nth-child(8) { left: 89%; animation-delay: .1s; background: #ffffff; }

        @keyframes cmCrystalPop {
          0% { opacity: 0; transform: translateZ(18px) scale(.35) rotate(-12deg); }
          70% { opacity: 1; transform: translateZ(18px) scale(1.22) rotate(7deg); }
          100% { opacity: 1; transform: translateZ(18px) scale(1) rotate(0); }
        }

        @keyframes cmMinePop {
          0% { opacity: 0; transform: translateZ(18px) scale(.35) rotate(0); }
          35% { opacity: 1; transform: translateZ(18px) scale(1.2) rotate(-12deg); }
          65% { transform: translateZ(18px) scale(1.04) rotate(10deg); }
          100% { opacity: 1; transform: translateZ(18px) scale(1) rotate(0); }
        }

        @keyframes cmConfetti {
          0% {
            opacity: 0;
            transform: translateY(0) rotate(0deg) scale(.7);
          }

          12% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform: translateY(105dvh) rotate(420deg) scale(1);
          }
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

      <div className="cm-casino-fx" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="cm-head">
        <img className="cm-title-img" src={titleAsset} alt="Crystal Mines" />
      </div>

      <div className="cm-grid">
        {Array.from({ length: GRID }, (_, index) => {
          const isPicked = effectivePicked.has(index);
          const isMine = revealedMines.includes(index);
          const isSafe = isPicked && !isMine;
          const isOpened = isPicked || isMine;

          return (
            <button
              key={index}
              type="button"
              className={`cm-cell ${isOpened ? 'opened' : ''} ${isSafe ? 'safe' : ''} ${
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
          <span>Множитель</span>
          <strong>x{multiplier.toFixed(2)}</strong>
        </div>

        <div className="cm-stat">
          <span>Cashout</span>
          <strong className="cm-money">
            {cashoutValue}
            <img className="cm-coin" src={coinIcon} alt="" />
          </strong>
        </div>

        {phase === 'finished' ? (
          <div className="cm-stat">
            <span>Итог</span>
            <strong>{formatMoney(lastWin)}</strong>
          </div>
        ) : null}

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
              Играть
            </button>
          ) : phase === 'finished' ? (
            <button type="button" className="cm-btn wide" onClick={resetToIdle}>
              Заново
            </button>
          ) : (
            <>
              <button
                type="button"
                className="cm-btn cashout"
                onClick={() => void cashout()}
                disabled={!canCashout}
              >
                Cashout
              </button>

              <button type="button" className="cm-btn" disabled>
                Шагов: {session.openedSteps}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
};