import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Player = 'amber' | 'violet';
type Phase = 'ready' | 'rolling' | 'decision' | 'rerolling' | 'reveal' | 'gameover';


const TARGET_SCORE = 3;
const DICE_COUNT = 3;

const PLAYERS: Record<Player, { name: string; main: string; soft: string; muted: string }> = {
  amber: {
    name: 'Amber',
    main: '#f59e42',
    soft: '#ffedd5',
    muted: 'rgba(245,158,66,.22)',
  },
  violet: {
    name: 'Violet',
    main: '#2f8cff',
    soft: '#dbeafe',
    muted: 'rgba(47,140,255,.22)',
  },
};

const other = (player: Player): Player => (player === 'amber' ? 'violet' : 'amber');
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const rollDice = () => Array.from({ length: DICE_COUNT }, rollDie);
const sumDice = (dice: number[]) => dice.reduce((sum, value) => sum + value, 0);
const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const pipMap: Record<number, string[]> = {
  1: ['center'],
  2: ['tl', 'br'],
  3: ['tl', 'center', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'center', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

const PipLayer = ({ value, mini = false }: { value: number; mini?: boolean }) => (
  <span key={`${mini ? 'mini' : 'big'}-${value}`} className={mini ? 'dd-mini-pip-layer' : 'dd-pip-layer'}>
    {pipMap[value].map((pip) => (
      <span key={pip} className={`${mini ? 'dd-mini-pip' : 'dd-pip'} ${mini ? 'dd-mini-pip' : 'dd-pip'}-${pip}`} />
    ))}
  </span>
);

const Die = ({
  value,
  index,
  rolling,
  selected,
  selectable,
  onClick,
}: {
  value: number;
  index: number;
  rolling: boolean;
  selected: boolean;
  selectable: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    className={`dd-die ${rolling ? 'dd-die-rolling' : ''} ${selected ? 'dd-die-selected' : ''}`}
    disabled={!selectable}
    onClick={onClick}
    style={cssVars({ '--delay': `${index * 45}ms` })}
    aria-label={`Кубик ${value}`}
  >
    <span className="dd-die-shell">
      <span className="dd-die-gloss" />
      <PipLayer value={value} />
    </span>
  </button>
);

const MiniDie = ({ value, player }: { value: number; player: Player }) => (
  <span
    className="dd-mini-die"
    style={cssVars({
      '--die-accent': PLAYERS[player].main,
      '--die-soft': PLAYERS[player].soft,
    })}
    aria-label={`Кубик ${value}`}
  >
    <PipLayer value={value} mini />
  </span>
);

const ScoreLine = ({ player, score, active }: { player: Player; score: number; active: boolean }) => {
  const meta = PLAYERS[player];

  return (
    <div
      className={`dd-score-line ${active ? 'dd-score-line-active' : ''}`}
      style={cssVars({ '--player': meta.main, '--player-muted': meta.muted })}
    >
      <span className="dd-player-dot" />
      <span className="dd-player-name">{meta.name}</span>
      <span className="dd-score-dots">
        {Array.from({ length: TARGET_SCORE }).map((_, index) => (
          <i key={index} className={index < score ? 'dd-score-dot-on' : ''} />
        ))}
      </span>
      <b>{score}</b>
    </div>
  );
};

const BankedResult = ({ player, dice, active }: { player: Player; dice: number[] | null; active: boolean }) => {
  const meta = PLAYERS[player];
  const total = dice ? sumDice(dice) : null;

  return (
    <section
      className={`dd-banked ${active ? 'dd-banked-active' : ''}`}
      style={cssVars({ '--player': meta.main, '--player-soft': meta.soft, '--player-muted': meta.muted })}
    >
      <div className="dd-banked-top">
        <span>{meta.name}</span>
        <b>{total ?? '—'}</b>
      </div>

      <div className="dd-banked-dice">
        {dice ? (
          dice.map((value, index) => <MiniDie key={`${player}-${index}-${value}`} value={value} player={player} />)
        ) : (
          <span className="dd-empty-dice">waiting</span>
        )}
      </div>
    </section>
  );
};

export const DiceDuelGame: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('ready');
  const [currentPlayer, setCurrentPlayer] = useState<Player>('amber');
  const [scores, setScores] = useState<Record<Player, number>>({ amber: 0, violet: 0 });
  const [round, setRound] = useState(1);
  const [activeDice, setActiveDice] = useState<number[]>([1, 1, 1]);
  const [stoppedDice, setStoppedDice] = useState<boolean[]>([true, true, true]);
  const [bankedDice, setBankedDice] = useState<Record<Player, number[] | null>>({ amber: null, violet: null });
  const [selectedDie, setSelectedDie] = useState<number | null>(null);
  const [usedReroll, setUsedReroll] = useState(false);
  const [message, setMessage] = useState('Amber начинает. Брось 3 кубика.');
  const [roundWinner, setRoundWinner] = useState<Player | 'push' | null>(null);

  const intervalRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const total = useMemo(() => sumDice(activeDice), [activeDice]);
  const matchWinner = scores.amber >= TARGET_SCORE ? 'amber' : scores.violet >= TARGET_SCORE ? 'violet' : null;
  const isBusy = phase === 'rolling' || phase === 'rerolling';
  const canSelectDie = phase === 'decision' && !usedReroll;
  const canRisk = phase === 'decision' && !usedReroll && selectedDie !== null;
  const activeMeta = PLAYERS[currentPlayer];

  const clearRollTimers = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pushTimeout = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(callback, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  useEffect(() => () => clearRollTimers(), [clearRollTimers]);

  const resetMatch = () => {
    clearRollTimers();
    setPhase('ready');
    setCurrentPlayer('amber');
    setScores({ amber: 0, violet: 0 });
    setRound(1);
    setActiveDice([1, 1, 1]);
    setStoppedDice([true, true, true]);
    setBankedDice({ amber: null, violet: null });
    setSelectedDie(null);
    setUsedReroll(false);
    setRoundWinner(null);
    setMessage('Amber начинает. Брось 3 кубика.');
  };

  const prepareNextRound = () => {
    const nextStarter = roundWinner && roundWinner !== 'push' ? roundWinner : other(currentPlayer);

    setRound((value) => value + 1);
    setCurrentPlayer(nextStarter);
    setBankedDice({ amber: null, violet: null });
    setActiveDice([1, 1, 1]);
    setStoppedDice([true, true, true]);
    setSelectedDie(null);
    setUsedReroll(false);
    setRoundWinner(null);
    setPhase('ready');
    setMessage(`${PLAYERS[nextStarter].name} начинает новый раунд. Брось 3 кубика.`);
  };

  const finishRoll = (finalDice: number[], isFull: boolean) => {
    const nextTotal = sumDice(finalDice);

    setActiveDice(finalDice);
    setStoppedDice([true, true, true]);
    setSelectedDie(null);
    setPhase('decision');

    if (!isFull) setUsedReroll(true);

    setMessage(
      isFull
        ? `${activeMeta.name}: сумма ${nextTotal}. Можно зафиксировать или рискнуть одним кубиком.`
        : `${activeMeta.name}: новая сумма ${nextTotal}. Теперь фиксируй результат.`,
    );
  };

  const animateRoll = (mode: 'full' | 'single', dieIndex?: number) => {
    if (isBusy || matchWinner) return;

    const isFull = mode === 'full';
    const finalDice = isFull ? rollDice() : [...activeDice];

    if (!isFull && typeof dieIndex === 'number') {
      finalDice[dieIndex] = rollDie();
    }

    clearRollTimers();

    if (isFull) {
      setSelectedDie(null);
      setStoppedDice([false, false, false]);
      setPhase('rolling');
      setMessage('Кубики крутятся...');
    } else {
      setStoppedDice(activeDice.map((_, index) => index !== dieIndex));
      setPhase('rerolling');
      setMessage(`Риск-переброс кубика #${(dieIndex ?? 0) + 1}...`);
    }

    const startedAt = Date.now();
    const fullStopTimes = [420, 690, 960];
    const singleStopTime = 640;

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;

      setActiveDice((prev) => {
        if (isFull) {
          return prev.map((_, index) => (elapsed >= fullStopTimes[index] ? finalDice[index] : rollDie()));
        }

        return prev.map((value, index) => {
          if (index !== dieIndex) return value;
          return elapsed >= singleStopTime ? finalDice[index] : rollDie();
        });
      });

      if (isFull) {
        setStoppedDice(fullStopTimes.map((stopTime) => elapsed >= stopTime));
      } else {
        setStoppedDice((prev) =>
          prev.map((_, index) => {
            if (index !== dieIndex) return true;
            return elapsed >= singleStopTime;
          }),
        );
      }
    }, 72);

    const finishDelay = isFull ? fullStopTimes[2] + 150 : singleStopTime + 150;

    pushTimeout(() => {
      clearRollTimers();
      finishRoll(finalDice, isFull);
    }, finishDelay);
  };

  const startRoll = () => {
    if (phase !== 'ready' || matchWinner) return;
    animateRoll('full');
  };

  const rerollSelected = () => {
    if (!canRisk || selectedDie === null) return;
    animateRoll('single', selectedDie);
  };

  const bankCurrent = () => {
    if (phase !== 'decision' || matchWinner) return;

    const currentDice = [...activeDice];
    const currentTotal = sumDice(currentDice);
    const nextBanked = { ...bankedDice, [currentPlayer]: currentDice };

    setBankedDice(nextBanked);
    setSelectedDie(null);
    setUsedReroll(false);

    if (currentPlayer === 'amber' && !nextBanked.violet) {
      setCurrentPlayer('violet');
      setActiveDice([1, 1, 1]);
      setStoppedDice([true, true, true]);
      setPhase('ready');
      setMessage(`Amber зафиксировал ${currentTotal}. Ход Violet.`);
      return;
    }

    if (currentPlayer === 'violet' && !nextBanked.amber) {
      setCurrentPlayer('amber');
      setActiveDice([1, 1, 1]);
      setStoppedDice([true, true, true]);
      setPhase('ready');
      setMessage(`Violet зафиксировал ${currentTotal}. Ход Amber.`);
      return;
    }

    const amberTotal = sumDice(nextBanked.amber || []);
    const violetTotal = sumDice(nextBanked.violet || []);
    const winner: Player | 'push' = amberTotal > violetTotal ? 'amber' : violetTotal > amberTotal ? 'violet' : 'push';

    setRoundWinner(winner);
    setPhase('reveal');

    if (winner === 'push') {
      setMessage(`Ничья ${amberTotal}:${violetTotal}. Очко никто не получает.`);
      return;
    }

    const nextScores = { ...scores, [winner]: scores[winner] + 1 };
    setScores(nextScores);

    if (nextScores[winner] >= TARGET_SCORE) {
      setPhase('gameover');
      setMessage(`${PLAYERS[winner].name} выиграл матч до ${TARGET_SCORE} побед.`);
      return;
    }

    setMessage(`${PLAYERS[winner].name} выигрывает раунд ${amberTotal}:${violetTotal}.`);
  };

  const actionLabel =
    phase === 'ready'
      ? 'Бросить'
      : phase === 'rolling' || phase === 'rerolling'
        ? 'Крутятся...'
      : phase === 'reveal'
        ? 'Дальше'
        : phase === 'gameover'
          ? 'Новый матч'
          : 'Зафиксировать';

  const handlePrimary = () => {
    if (phase === 'ready') startRoll();
    if (phase === 'decision') bankCurrent();
    if (phase === 'reveal' && !matchWinner) prepareNextRound();
    if (phase === 'gameover') resetMatch();
  };

  const title =
    phase === 'reveal'
      ? roundWinner === 'push'
        ? 'Ничья'
        : roundWinner
          ? `${PLAYERS[roundWinner].name} +1`
          : 'Сравнение'
      : phase === 'gameover' && matchWinner
        ? `${PLAYERS[matchWinner].name} WIN`
        : activeMeta.name;

  return (
    <div className="dd-page">
      <style>{`
        .dd-page {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          box-sizing: border-box;
          color: white;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          gap: 10px;
          padding: 10px 10px max(10px, env(safe-area-inset-bottom));
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: transparent;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .dd-page * {
          box-sizing: border-box;
        }

        .dd-hud,
        .dd-play-card,
        .dd-banked,
        .dd-actions {
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(18,18,24,.56);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 14px 34px rgba(0,0,0,.16);
          backdrop-filter: blur(16px);
        }

        .dd-hud {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 8px;
          min-height: 58px;
          border-radius: 22px;
          padding: 8px;
        }

        .dd-round {
          min-width: 64px;
          text-align: center;
          line-height: 1;
        }

        .dd-round strong {
          display: block;
          color: #fff;
          font-size: 22px;
          font-weight: 850;
          letter-spacing: -.06em;
        }

        .dd-round span {
          display: block;
          margin-top: 3px;
          color: rgba(255,255,255,.38);
          font-size: 8px;
          font-weight: 760;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .dd-score-line {
          min-width: 0;
          height: 42px;
          display: flex;
          align-items: center;
          gap: 7px;
          border-radius: 17px;
          padding: 0 9px;
          color: rgba(255,255,255,.62);
          background: rgba(255,255,255,.035);
          transition: background .18s ease, border-color .18s ease, opacity .18s ease;
          opacity: .72;
        }

        .dd-score-line-active {
          opacity: 1;
          background: var(--player-muted);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
        }

        .dd-player-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: 0 0 auto;
          background: var(--player);
          box-shadow: 0 0 14px var(--player);
        }

        .dd-player-name {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-size: 11px;
          font-weight: 760;
          letter-spacing: -.01em;
        }

        .dd-score-dots {
          display: flex;
          gap: 3px;
          margin-left: auto;
        }

        .dd-score-dots i {
          display: block;
          width: 10px;
          height: 5px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
        }

        .dd-score-dot-on {
          background: var(--player) !important;
          box-shadow: 0 0 12px var(--player);
        }

        .dd-score-line b {
          color: #fff;
          font-size: 18px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.05em;
        }

        .dd-board {
          position: relative;
          min-height: 0;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 10px;
        }

        .dd-banked-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          min-height: 86px;
        }

        .dd-banked {
          min-width: 0;
          overflow: hidden;
          border-radius: 22px;
          padding: 10px;
        }

        .dd-banked-active {
          border-color: var(--player);
          background: var(--player-muted);
        }

        .dd-banked-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .dd-banked-top span {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: var(--player-soft);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .dd-banked-top b {
          color: white;
          font-size: 27px;
          line-height: .88;
          font-weight: 860;
          letter-spacing: -.07em;
        }

        .dd-banked-dice {
          margin-top: 10px;
          min-height: 32px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .dd-empty-dice {
          color: rgba(255,255,255,.35);
          font-size: 10px;
          font-weight: 650;
        }

        .dd-play-card {
          min-height: 0;
          overflow: hidden;
          border-radius: 28px;
          padding: clamp(14px, 2.4vh, 22px);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          align-items: center;
        }

        .dd-turn {
          min-width: 0;
          text-align: center;
        }

        .dd-turn-kicker {
          color: rgba(255,255,255,.42);
          font-size: 9px;
          line-height: 1;
          font-weight: 720;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .dd-turn-name {
          margin-top: 6px;
          color: white;
          font-size: clamp(30px, 7vw, 58px);
          line-height: .92;
          font-weight: 860;
          letter-spacing: -.075em;
        }

        .dd-dice-cloud {
          width: 100%;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(9px, 2.4vw, 20px);
          padding: 14px 0;
        }

        .dd-die {
          position: relative;
          width: clamp(64px, 18vw, 112px);
          height: clamp(64px, 18vw, 112px);
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          animation: ddDieIn .2s ease both;
          animation-delay: var(--delay);
          transition: transform .14s ease, opacity .14s ease;
        }

        .dd-die:disabled {
          cursor: default;
        }

        .dd-die:not(:disabled):active {
          transform: scale(.95);
        }

        .dd-die-rolling {
          pointer-events: none;
        }

        .dd-die-rolling .dd-die-shell {
          animation: ddDiceRoll .28s cubic-bezier(.2,.8,.2,1) infinite;
          animation-delay: var(--delay);
        }

        .dd-die-rolling .dd-die-gloss {
          animation: ddGlossSweep .36s ease-in-out infinite;
        }


        .dd-die-shell {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: clamp(18px, 4vw, 28px);
          border: 1px solid rgba(255,255,255,.28);
          background:
            radial-gradient(circle at 28% 20%, rgba(255,255,255,.85), transparent 18%),
            linear-gradient(145deg, #fff7ed 0%, #fde68a 34%, #fb923c 70%, #7c2d12 100%);
          box-shadow:
            0 18px 28px rgba(0,0,0,.30),
            inset 0 3px 9px rgba(255,255,255,.44),
            inset 0 -14px 22px rgba(124,45,18,.40);
          transition: transform .18s cubic-bezier(.2,.9,.22,1), box-shadow .18s ease, filter .18s ease;
        }

        .dd-die-gloss {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background:
            radial-gradient(circle at 28% 18%, rgba(255,255,255,.42), transparent 24%),
            linear-gradient(135deg, rgba(255,255,255,.20), transparent 36%, rgba(255,255,255,.08) 72%, transparent);
          mix-blend-mode: screen;
          opacity: .72;
        }

        .dd-pip-layer {
          position: absolute;
          inset: 0;
          z-index: 2;
          animation: ddPipSwap .18s cubic-bezier(.2,.8,.2,1) both;
        }

        .dd-pip,
        .dd-mini-pip {
          position: absolute;
          width: 15%;
          height: 15%;
          border-radius: 999px;
          background: radial-gradient(circle at 34% 28%, #5b3418, #1f1308 72%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.16), 0 1px 1px rgba(255,255,255,.08);
        }

        .dd-pip-tl, .dd-mini-pip-tl { left: 22%; top: 22%; }
        .dd-pip-tr, .dd-mini-pip-tr { right: 22%; top: 22%; }
        .dd-pip-ml, .dd-mini-pip-ml { left: 22%; top: 42.5%; }
        .dd-pip-mr, .dd-mini-pip-mr { right: 22%; top: 42.5%; }
        .dd-pip-bl, .dd-mini-pip-bl { left: 22%; bottom: 22%; }
        .dd-pip-br, .dd-mini-pip-br { right: 22%; bottom: 22%; }
        .dd-pip-center, .dd-mini-pip-center { left: 42.5%; top: 42.5%; }

        .dd-die-selected .dd-die-shell {
          transform: translateY(-9px) scale(1.04);
          filter: drop-shadow(0 0 20px rgba(253,230,138,.42));
          box-shadow:
            0 18px 28px rgba(0,0,0,.30),
            inset 0 3px 9px rgba(255,255,255,.44),
            inset 0 -14px 22px rgba(124,45,18,.40),
            0 0 0 4px rgba(253,230,138,.20);
        }

        .dd-mini-die {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,.20);
          background:
            radial-gradient(circle at 28% 20%, rgba(255,255,255,.82), transparent 19%),
            linear-gradient(145deg, #fff7ed, var(--die-soft) 42%, var(--die-accent));
          box-shadow: 0 9px 14px rgba(0,0,0,.18), inset 0 2px 5px rgba(255,255,255,.34);
          flex: 0 0 auto;
        }

        .dd-mini-pip-layer {
          position: absolute;
          inset: 0;
        }

        .dd-total {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 9px;
          color: rgba(255,255,255,.42);
          font-size: 10px;
          font-weight: 760;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .dd-total b {
          color: #fff;
          font-size: clamp(34px, 8vw, 64px);
          line-height: .85;
          font-weight: 860;
          letter-spacing: -.07em;
        }

        .dd-actions {
          position: relative;
          z-index: 6;
          border-radius: 24px;
          padding: 10px;
          display: grid;
          gap: 9px;
        }

        .dd-status {
          min-height: 16px;
          color: rgba(255,255,255,.72);
          font-size: 11px;
          line-height: 1.25;
          font-weight: 650;
          text-align: center;
        }

        .dd-button-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .dd-button {
          min-height: 43px;
          border: 0;
          border-radius: 18px;
          padding: 0 15px;
          color: #150c05;
          background: linear-gradient(135deg, #fff7ed 0%, #f59e42 58%, #ea580c 100%);
          box-shadow: 0 14px 28px rgba(245,158,66,.18), inset 0 2px 0 rgba(255,255,255,.30);
          font-size: 10px;
          line-height: 1;
          font-weight: 840;
          text-transform: uppercase;
          letter-spacing: .07em;
          white-space: nowrap;
          transition: transform .12s ease, opacity .12s ease, filter .12s ease;
        }

        .dd-button:active {
          transform: scale(.97);
        }

        .dd-button:disabled {
          opacity: .34;
          filter: grayscale(1);
        }

        .dd-button-risk {
          color: white;
          background: linear-gradient(135deg, #2f8cff, #22d3ee);
          box-shadow: 0 14px 28px rgba(47,140,255,.18), inset 0 2px 0 rgba(255,255,255,.24);
        }

        .dd-button-ghost {
          color: rgba(255,255,255,.72);
          background: rgba(255,255,255,.065);
          border: 1px solid rgba(255,255,255,.08);
          box-shadow: none;
        }

        @keyframes ddDiceRoll {
          0% { transform: translateY(0) rotate(0deg) scale(1); }
          28% { transform: translateY(-10px) rotate(-8deg) scale(1.035); }
          56% { transform: translateY(5px) rotate(9deg) scale(.99); }
          100% { transform: translateY(0) rotate(0deg) scale(1); }
        }

        @keyframes ddGlossSweep {
          0%, 100% { opacity: .42; transform: translateX(-10%); }
          50% { opacity: .9; transform: translateX(12%); }
        }

        @keyframes ddPipSwap {
          0% { opacity: 0; transform: scale(.78); filter: blur(1px); }
          70% { opacity: 1; transform: scale(1.06); filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }

        @keyframes ddDieIn {
          from { opacity: .65; transform: translateY(5px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-height: 690px) {
          .dd-page {
            gap: 7px;
            padding-top: 7px;
          }

          .dd-hud {
            min-height: 50px;
            border-radius: 19px;
          }

          .dd-score-line {
            height: 36px;
          }

          .dd-board {
            gap: 7px;
          }

          .dd-banked-row {
            min-height: 72px;
          }

          .dd-banked {
            border-radius: 18px;
            padding: 8px;
          }

          .dd-banked-top b {
            font-size: 22px;
          }

          .dd-mini-die {
            width: 27px;
            height: 27px;
            border-radius: 9px;
          }

          .dd-play-card {
            border-radius: 23px;
            padding: 11px;
          }

          .dd-turn-name {
            font-size: clamp(25px, 6vw, 42px);
          }

          .dd-die {
            width: clamp(54px, 15vw, 82px);
            height: clamp(54px, 15vw, 82px);
          }

          .dd-actions {
            border-radius: 20px;
            padding: 8px;
            gap: 7px;
          }

          .dd-button {
            min-height: 38px;
          }
        }

        @media (max-width: 520px) {
          .dd-page {
            padding-left: 8px;
            padding-right: 8px;
          }

          .dd-hud {
            gap: 5px;
            padding: 6px;
          }

          .dd-round {
            min-width: 48px;
          }

          .dd-round strong {
            font-size: 18px;
          }

          .dd-round span {
            font-size: 7px;
          }

          .dd-score-line {
            gap: 5px;
            padding: 0 7px;
          }

          .dd-player-name {
            font-size: 9px;
          }

          .dd-score-dots {
            display: none;
          }

          .dd-score-line b {
            margin-left: auto;
            font-size: 16px;
          }

          .dd-banked-row {
            min-height: 80px;
          }

          .dd-banked-dice {
            gap: 4px;
          }


          .dd-dice-cloud {
            gap: 7px;
          }

          .dd-button-row {
            grid-template-columns: 74px minmax(0, 1fr) 74px;
            gap: 6px;
          }

          .dd-button {
            padding: 0 10px;
            font-size: 9px;
            letter-spacing: .045em;
          }
        }
      `}</style>

      <div className="dd-hud">
        <ScoreLine player="amber" score={scores.amber} active={currentPlayer === 'amber' && phase !== 'reveal' && phase !== 'gameover'} />
        <div className="dd-round">
          <strong>{round}</strong>
          <span>round</span>
        </div>
        <ScoreLine player="violet" score={scores.violet} active={currentPlayer === 'violet' && phase !== 'reveal' && phase !== 'gameover'} />
      </div>

      <main className="dd-board">
        <div className="dd-banked-row">
          <BankedResult player="amber" dice={bankedDice.amber} active={currentPlayer === 'amber' && phase !== 'reveal' && phase !== 'gameover'} />
          <BankedResult player="violet" dice={bankedDice.violet} active={currentPlayer === 'violet' && phase !== 'reveal' && phase !== 'gameover'} />
        </div>

        <section className="dd-play-card">
          <div className="dd-turn">
            <div className="dd-turn-kicker">{phase === 'reveal' || phase === 'gameover' ? 'Итог' : 'Ходит'}</div>
            <div className="dd-turn-name">{title}</div>
          </div>

          <div className="dd-dice-cloud">
            {activeDice.map((value, index) => (
              <Die
                key={`active-die-${index}-${value}`}
                value={value}
                index={index}
                rolling={
                  phase === 'rolling'
                    ? !stoppedDice[index]
                    : phase === 'rerolling' && selectedDie === index
                      ? !stoppedDice[index]
                      : false
                }
                selected={selectedDie === index}
                selectable={canSelectDie}
                onClick={canSelectDie ? () => setSelectedDie(index) : undefined}
              />
            ))}
          </div>

          <div className="dd-total">
            Сумма <b>{phase === 'ready' ? '—' : total}</b>
          </div>
        </section>
      </main>

      <footer className="dd-actions">
        <div className="dd-status">{matchWinner ? `${PLAYERS[matchWinner].name} выиграл матч до ${TARGET_SCORE} побед.` : message}</div>

        <div className="dd-button-row">
          <button type="button" className="dd-button dd-button-risk" disabled={!canRisk} onClick={rerollSelected}>
            Риск
          </button>

          <button type="button" className="dd-button" onClick={handlePrimary} disabled={isBusy || (phase === 'ready' && !!matchWinner)}>
            {actionLabel}
          </button>

          <button type="button" className="dd-button dd-button-ghost" onClick={resetMatch}>
            Сброс
          </button>
        </div>
      </footer>
    </div>
  );
};

export const DiceDuel = DiceDuelGame;
export const DiceBattleGame = DiceDuelGame;
export default DiceDuelGame;
