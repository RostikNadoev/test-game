import { useEffect, useMemo, useState } from 'react';
import { SoloBalanceBar } from '../../components/Solo/SoloBalanceBar';
import { useSoloSession } from '../../hooks/useSoloSession';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import type { CrystalMinesPublicState } from '../../api/types';
import {
  deriveCrystalMinesPicked,
  mergePickedSets,
} from '../../utils/soloSessionState';
const GRID = 25;
const MIN_BET = 1;
const QUICK_BETS = [10, 50, 100].filter((value) => value >= MIN_BET);

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

type Phase = 'idle' | 'playing' | 'finished';

type StepEvent = {
  cell_index: number;
  safe: boolean;
  status: string;
  multiplier: number;
  reveal_mines?: number[];
  payout?: number;
};

export const CrystalMinesSoloGame = () => {
  const { balance, canAfford, error: walletError, setError: setWalletError } = useSoloWallet();
  const session = useSoloSession('crystal_mines');
  const { markPublicStateHydrated, publicState, resumed, status, isSessionPlayable } = session;
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [revealedMines, setRevealedMines] = useState<number[]>([]);
  const [lastWin, setLastWin] = useState(0);

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

  const canStart = effectivePhase === 'idle' && !session.loading;
  const canPick = effectivePhase === 'playing' && isSessionPlayable && !session.loading;
  const canCashout = effectivePhase === 'playing' && session.openedSteps > 0 && !session.loading;

  useEffect(() => {
    if (!resumed || status !== 'active') return;
    const state = publicState as CrystalMinesPublicState | null;
    if (!state) return;
    setPicked(new Set(state.picked));
    setRevealedMines([]);
    setPhase('playing');
    markPublicStateHydrated();
  }, [markPublicStateHydrated, publicState, resumed, status]);

  const multiplier = session.multiplier || 1;
  const cashoutValue = useMemo(
    () => formatMoney(effectiveBet * multiplier),
    [effectiveBet, multiplier],
  );

  const start = async () => {
    if (!canAfford(bet)) {
      setWalletError('insufficient balance');
      return;
    }
    session.reset();
    setPicked(new Set());
    setRevealedMines([]);
    setLastWin(0);
    try {
      await session.start(bet);
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
      if (event.reveal_mines?.length) setRevealedMines(event.reveal_mines);
      if (event.status === 'bust' || event.status === 'completed') {
        setPhase('finished');
        setLastWin(response.payout_coins ?? 0);
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
    } catch {
      // handled
    }
  };

  return (
    <main className="solo-session-page cm-page">
      <style>{`
        .cm-page { min-height: 100%; padding: 16px 16px 120px; color: #fff; background: radial-gradient(circle at top, rgba(82,255,229,.12), transparent 45%), #060914; }
        .cm-head { text-align: center; margin-bottom: 12px; }
        .cm-title { font-size: 24px; font-weight: 800; }
        .cm-sub { color: rgba(255,255,255,.55); font-size: 12px; margin-top: 4px; }
        .cm-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-width: 360px; margin: 16px auto; }
        .cm-cell { aspect-ratio: 1; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); font-weight: 800; }
        .cm-cell.safe { background: rgba(82,255,229,.18); border-color: rgba(82,255,229,.35); }
        .cm-cell.mine { background: rgba(255,94,138,.22); border-color: rgba(255,94,138,.45); }
        .cm-cell:disabled { opacity: .45; }
        .cm-panel { max-width: 360px; margin: 0 auto; display: grid; gap: 10px; }
        .cm-stat { display: flex; justify-content: space-between; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
        .cm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cm-btn { border: 0; border-radius: 16px; padding: 14px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #52ffe5, #167a70); }
        .cm-btn.secondary { background: rgba(255,255,255,.08); }
        .cm-bet-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .cm-chip { border-radius: 999px; padding: 8px 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #fff; }
        .cm-chip.active { border-color: rgba(82,255,229,.45); color: #52ffe5; }
      `}</style>

      <div className="cm-head">
        <div className="cm-title">Crystal Mines</div>
        <div className="cm-sub">5 мин на поле 5×5. Открывай кристаллы, избегай мин, забирай множитель.</div>
      </div>

      <SoloBalanceBar balance={balance} error={session.error ?? walletError} />

      <div className="cm-grid">
        {Array.from({ length: GRID }, (_, index) => {
          const isPicked = effectivePicked.has(index);
          const isMine = revealedMines.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`cm-cell ${isPicked ? (isMine ? 'mine' : 'safe') : ''}`}
              disabled={!canPick || isPicked || effectivePhase !== 'playing'}
              onClick={() => void pickCell(index)}
            >
              {isPicked ? (isMine ? '💣' : '💎') : ''}
            </button>
          );
        })}
      </div>

      <div className="cm-panel">
        <div className="cm-stat"><span>Множитель</span><strong>x{multiplier.toFixed(2)}</strong></div>
        <div className="cm-stat"><span>Cashout</span><strong>{cashoutValue}</strong></div>
        {phase === 'finished' ? (
          <div className="cm-stat"><span>Итог</span><strong>{formatMoney(lastWin)}</strong></div>
        ) : null}

        <div className="cm-bet-row">
          {QUICK_BETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`cm-chip ${bet === value ? 'active' : ''}`}
              disabled={effectivePhase === 'playing'}
              onClick={() => setBet(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="cm-actions">
          {effectivePhase === 'idle' || effectivePhase === 'finished' ? (
            <button type="button" className="cm-btn" disabled={!canStart} onClick={() => void start()}>
              {effectivePhase === 'finished' ? 'Снова' : 'Старт'}
            </button>
          ) : (
            <>
              <button type="button" className="cm-btn secondary" onClick={() => void cashout()} disabled={!canCashout}>
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
