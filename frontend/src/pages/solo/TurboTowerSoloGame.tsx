import { useEffect, useMemo, useState } from 'react';
import { SoloBalanceBar } from '../../components/Solo/SoloBalanceBar';
import { useSoloSession } from '../../hooks/useSoloSession';
import { useSoloWallet } from '../../hooks/useSoloWallet';
import type { TurboTowerPublicState } from '../../api/types';
import {
  deriveTurboTowerFloor,
  deriveTurboTowerPicked,
} from '../../utils/soloSessionState';
const FLOORS = 8;
const DOORS = 3;
const MIN_BET = 1;
const QUICK_BETS = [10, 50, 100].filter((value) => value >= MIN_BET);

const formatMoney = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

type Phase = 'idle' | 'playing' | 'finished';

type StepEvent = {
  floor: number;
  door: number;
  safe: boolean;
  status: string;
  multiplier: number;
  trap_door?: number;
  reveal_traps?: number[];
  payout?: number;
};

export const TurboTowerSoloGame = () => {
  const { balance, canAfford, error: walletError, setError: setWalletError } = useSoloWallet();
  const session = useSoloSession('turbo_tower');
  const { markPublicStateHydrated, publicState, resumed, status, isSessionPlayable } = session;
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentFloor, setCurrentFloor] = useState(0);
  const [picked, setPicked] = useState<number[]>(() => Array.from({ length: FLOORS }, () => -1));
  const [traps, setTraps] = useState<number[]>(() => Array.from({ length: FLOORS }, () => -1));
  const [lastWin, setLastWin] = useState(0);

  const effectivePhase: Phase =
    session.sessionId && status === 'active' && isSessionPlayable ? 'playing' : phase;
  const effectiveBet =
    session.sessionId && session.status === 'active' && session.betCoins > 0
      ? session.betCoins
      : bet;

  const hydratedFloor = useMemo(
    () => deriveTurboTowerFloor(publicState as TurboTowerPublicState | null, currentFloor),
    [currentFloor, publicState],
  );
  const hydratedPicked = useMemo(
    () => deriveTurboTowerPicked(publicState as TurboTowerPublicState | null, FLOORS),
    [publicState],
  );
  const effectiveFloor =
    resumed && status === 'active' && !isSessionPlayable
      ? hydratedFloor
      : currentFloor;
  const effectivePicked = isSessionPlayable
    ? picked
    : hydratedPicked.some((door) => door >= 0)
      ? hydratedPicked
      : picked;

  const canStart = effectivePhase === 'idle' && !session.loading;
  const canPick = effectivePhase === 'playing' && isSessionPlayable && !session.loading;
  const canCashout = effectivePhase === 'playing' && session.openedSteps > 0 && !session.loading;

  useEffect(() => {
    if (!resumed || status !== 'active') return;
    const state = publicState as TurboTowerPublicState | null;
    if (!state) return;
    setCurrentFloor(state.current_floor);
    setPicked(
      state.picked?.length === FLOORS
        ? [...state.picked]
        : Array.from({ length: FLOORS }, () => -1),
    );
    setTraps(Array.from({ length: FLOORS }, () => -1));
    setPhase('playing');
    markPublicStateHydrated();
  }, [markPublicStateHydrated, publicState, resumed, status]);

  const multiplier = session.multiplier || 1;
  const cashoutValue = useMemo(
    () => formatMoney(effectiveBet * multiplier),
    [effectiveBet, multiplier],
  );

  const resetVisual = () => {
    setCurrentFloor(0);
    setPicked(Array.from({ length: FLOORS }, () => -1));
    setTraps(Array.from({ length: FLOORS }, () => -1));
    setLastWin(0);
  };

  const start = async () => {
    if (!canAfford(bet)) {
      setWalletError('insufficient balance');
      return;
    }
    session.reset();
    resetVisual();
    try {
      await session.start(bet);
      setPhase('playing');
    } catch {
      // handled
    }
  };

  const pickDoor = async (door: number) => {
    if (!canPick) return;
    if (effectivePicked[effectiveFloor] >= 0) return;
    try {
      const response = await session.step('pick', { floor: effectiveFloor, door });
      const event = response.event as StepEvent;
      setPicked((prev) => {
        const next = [...prev];
        next[effectiveFloor] = door;
        return next;
      });
      if (typeof event.trap_door === 'number') {
        setTraps((prev) => {
          const next = [...prev];
          next[effectiveFloor] = event.trap_door ?? -1;
          return next;
        });
      }
      if (event.reveal_traps?.length) setTraps(event.reveal_traps);
      if (event.status === 'bust' || event.status === 'completed') {
        setPhase('finished');
        setLastWin(response.payout_coins ?? 0);
        return;
      }
      setCurrentFloor((value) => value + 1);
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
    <main className="solo-session-page tt-page">
      <style>{`
        .tt-page { min-height: 100%; padding: 16px 16px 120px; color: #fff; background: radial-gradient(circle at top, rgba(157,124,255,.16), transparent 45%), #090812; }
        .tt-head { text-align: center; margin-bottom: 12px; }
        .tt-title { font-size: 24px; font-weight: 800; }
        .tt-sub { color: rgba(255,255,255,.55); font-size: 12px; margin-top: 4px; }
        .tt-tower { max-width: 360px; margin: 16px auto; display: grid; gap: 10px; }
        .tt-floor { padding: 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); }
        .tt-floor.active { border-color: rgba(157,124,255,.45); box-shadow: 0 0 24px rgba(157,124,255,.12); }
        .tt-floor-label { font-size: 11px; color: rgba(255,255,255,.45); margin-bottom: 8px; }
        .tt-doors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .tt-door { border: 0; border-radius: 14px; padding: 16px 0; font-weight: 800; color: #fff; background: rgba(255,255,255,.06); }
        .tt-door.trap { background: rgba(255,94,138,.22); }
        .tt-door.safe { background: rgba(82,255,229,.18); }
        .tt-panel { max-width: 360px; margin: 0 auto; display: grid; gap: 10px; }
        .tt-stat { display: flex; justify-content: space-between; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
        .tt-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .tt-btn { border: 0; border-radius: 16px; padding: 14px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #9d7cff, #52ffe5); }
        .tt-btn.secondary { background: rgba(255,255,255,.08); }
        .tt-bet-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .tt-chip { border-radius: 999px; padding: 8px 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #fff; }
        .tt-chip.active { border-color: rgba(157,124,255,.45); color: #cbb8ff; }
      `}</style>

      <div className="tt-head">
        <div className="tt-title">Turbo Tower</div>
        <div className="tt-sub">Поднимайся по этажам, выбирай безопасную дверь, cashout в любой момент.</div>
      </div>

      <SoloBalanceBar balance={balance} error={session.error ?? walletError} />

      <div className="tt-tower">
        {Array.from({ length: FLOORS }, (_, floor) => {
          const reverseFloor = FLOORS - 1 - floor;
          const isActive = effectivePhase === 'playing' && effectiveFloor === reverseFloor;
          return (
            <div key={reverseFloor} className={`tt-floor ${isActive ? 'active' : ''}`}>
              <div className="tt-floor-label">Этаж {reverseFloor + 1}</div>
              <div className="tt-doors">
                {Array.from({ length: DOORS }, (_, door) => {
                  const pickedDoor = effectivePicked[reverseFloor];
                  const trapDoor = traps[reverseFloor];
                  const revealed = pickedDoor >= 0 || trapDoor >= 0;
                  const isTrap = revealed && trapDoor === door;
                  const isSafePick = revealed && pickedDoor === door && !isTrap;
                  return (
                    <button
                      key={door}
                      type="button"
                      className={`tt-door ${isTrap ? 'trap' : ''} ${isSafePick ? 'safe' : ''}`}
                      disabled={!isActive || pickedDoor >= 0}
                      onClick={() => void pickDoor(door)}
                    >
                      {revealed ? (isTrap ? 'X' : isSafePick ? 'OK' : '') : door + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tt-panel">
        <div className="tt-stat"><span>Множитель</span><strong>x{multiplier.toFixed(2)}</strong></div>
        <div className="tt-stat"><span>Cashout</span><strong>{cashoutValue}</strong></div>
        {effectivePhase === 'finished' ? (
          <div className="tt-stat"><span>Итог</span><strong>{formatMoney(lastWin)}</strong></div>
        ) : null}

        <div className="tt-bet-row">
          {QUICK_BETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`tt-chip ${bet === value ? 'active' : ''}`}
              disabled={effectivePhase === 'playing'}
              onClick={() => setBet(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="tt-actions">
          {effectivePhase === 'idle' || effectivePhase === 'finished' ? (
            <button type="button" className="tt-btn" disabled={!canStart} onClick={() => void start()}>
              {effectivePhase === 'finished' ? 'Снова' : 'Старт'}
            </button>
          ) : (
            <>
              <button type="button" className="tt-btn secondary" onClick={() => void cashout()} disabled={!canCashout}>
                Cashout
              </button>
              <button type="button" className="tt-btn" disabled>
                Этаж {effectiveFloor + 1}/{FLOORS}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
};
