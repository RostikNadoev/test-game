import React, { useEffect, useMemo, useRef, useState } from 'react';

type Player = 'cyan' | 'magenta';
type Phase = 'pickCyan' | 'handoff' | 'pickMagenta' | 'spinning' | 'result' | 'gameover';
type Winner = Player | 'draw' | null;

type PickState = Record<Player, number | null>;
type ScoreState = Record<Player, number>;

type Particle = {
  id: number;
  x: string;
  y: string;
  angle: number;
  distance: number;
  size: number;
  tone: 'cyan' | 'magenta' | 'gold' | 'green';
  delay: number;
};

const TARGET_SCORE = 5;
const MIN_NUMBER = 1;
const MAX_NUMBER = 100;
const CIRCLE_SIZE = MAX_NUMBER - MIN_NUMBER + 1;
const SPIN_MS = 5200;

const PLAYERS: Record<
  Player,
  {
    name: string;
    label: string;
    short: string;
    main: string;
    glow: string;
  }
> = {
  cyan: {
    name: 'Cyan',
    label: 'Игрок 1',
    short: 'P1',
    main: '#22d3ee',
    glow: 'rgba(34, 211, 238, .68)',
  },
  magenta: {
    name: 'Magenta',
    label: 'Игрок 2',
    short: 'P2',
    main: '#e879f9',
    glow: 'rgba(232, 121, 249, .62)',
  },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randomNumber = () => MIN_NUMBER + Math.floor(Math.random() * MAX_NUMBER);

const distance = (a: number, b: number) => {
  const direct = Math.abs(a - b);
  const circular = CIRCLE_SIZE - direct;
  return Math.min(direct, circular);
};

const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const numberToAngle = (value: number) => {
  return ((value - MIN_NUMBER) / (MAX_NUMBER - MIN_NUMBER)) * 360;
};

const getWinner = (target: number, picks: PickState): Winner => {
  if (picks.cyan === null || picks.magenta === null) return null;

  const cyanDistance = distance(picks.cyan, target);
  const magentaDistance = distance(picks.magenta, target);

  if (cyanDistance === magentaDistance) return 'draw';
  return cyanDistance < magentaDistance ? 'cyan' : 'magenta';
};

const getSpinAngle = (currentAngle: number, targetNumber: number) => {
  const normalized = ((currentAngle % 360) + 360) % 360;
  const targetAngle = numberToAngle(targetNumber);
  const delta = (targetAngle - normalized + 360) % 360;
  const fullSpins = 7 * 360;

  return currentAngle + fullSpins + delta;
};

const ScoreDot = ({
  player,
  score,
  active,
}: {
  player: Player;
  score: number;
  active: boolean;
}) => {
  const meta = PLAYERS[player];

  return (
    <div className={`rd-score rd-score-${player} ${active ? 'rd-score-active' : ''}`}>
      <span
        className="rd-score-light"
        style={{
          background: meta.main,
          boxShadow: active ? `0 0 18px ${meta.glow}` : undefined,
        }}
      />
      <b>{score}</b>
    </div>
  );
};

const Wheel = ({
  angle,
  displayNumber,
  phase,
  target,
  picks,
  showPicks,
}: {
  angle: number;
  displayNumber: number;
  phase: Phase;
  target: number | null;
  picks: PickState;
  showPicks: boolean;
}) => {
  const labels = useMemo(() => [1, 25, 50, 75, 100], []);

  return (
    <div className={`rd-wheel rd-wheel-${phase}`}>
      <div className="rd-wheel-surface" />

      <div className="rd-marks">
        {Array.from({ length: 80 }).map((_, index) => (
          <i
            key={index}
            className={index % 10 === 0 ? 'rd-mark-major' : ''}
            style={cssVars({ '--a': `${index * 4.5}deg` })}
          />
        ))}
      </div>

      <div className="rd-labels">
        {labels.map((label) => {
          const angleDeg = numberToAngle(label);
          const rad = (angleDeg - 90) * (Math.PI / 180);
          const x = 50 + Math.cos(rad) * 41;
          const y = 50 + Math.sin(rad) * 41;

          return (
            <span key={label} style={{ left: `${x}%`, top: `${y}%` }}>
              {label}
            </span>
          );
        })}
      </div>

      {showPicks && picks.cyan !== null && (
        <div
          className="rd-bet rd-bet-cyan"
          style={cssVars({ '--a': `${numberToAngle(picks.cyan)}deg` })}
        >
          <span>P1</span>
        </div>
      )}

      {showPicks && picks.magenta !== null && (
        <div
          className="rd-bet rd-bet-magenta"
          style={cssVars({ '--a': `${numberToAngle(picks.magenta)}deg` })}
        >
          <span>P2</span>
        </div>
      )}

      {target !== null && (
        <div
          className="rd-bet rd-bet-target"
          style={cssVars({ '--a': `${numberToAngle(target)}deg` })}
        >
          <span>{target}</span>
        </div>
      )}

      <div
        className="rd-arrow"
        style={cssVars({
          '--angle': `${angle}deg`,
          '--spin-ms': `${SPIN_MS}ms`,
        })}
      >
        <div className="rd-arrow-line" />
        <div className="rd-arrow-head" />
      </div>

      <div className="rd-center">
        <small>{phase === 'spinning' ? 'spinning' : target !== null ? 'final' : 'pick'}</small>
        <strong>{phase === 'spinning' ? '•••' : target ?? displayNumber}</strong>
      </div>
    </div>
  );
};

const MiniPicks = ({
  picks,
  target,
  hiddenCyan,
  hiddenMagenta,
}: {
  picks: PickState;
  target: number | null;
  hiddenCyan: boolean;
  hiddenMagenta: boolean;
}) => {
  const cyanDiff = picks.cyan !== null && target !== null ? distance(picks.cyan, target) : null;
  const magentaDiff = picks.magenta !== null && target !== null ? distance(picks.magenta, target) : null;

  return (
    <div className="rd-picks">
      <div className="rd-pick rd-pick-cyan">
        <span>P1</span>
        <b>{hiddenCyan ? '??' : picks.cyan ?? '—'}</b>
        {cyanDiff !== null && <small>Δ{cyanDiff}</small>}
      </div>

      <div className="rd-pick rd-pick-magenta">
        <span>P2</span>
        <b>{hiddenMagenta ? '??' : picks.magenta ?? '—'}</b>
        {magentaDiff !== null && <small>Δ{magentaDiff}</small>}
      </div>
    </div>
  );
};

export const NeonMatrixGame: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('pickCyan');
  const [scores, setScores] = useState<ScoreState>({ cyan: 0, magenta: 0 });
  const [round, setRound] = useState(1);
  const [draftValue, setDraftValue] = useState(50);
  const [picks, setPicks] = useState<PickState>({ cyan: null, magenta: null });
  const [target, setTarget] = useState<number | null>(null);
  const [winner, setWinner] = useState<Winner>(null);
  const [arrowAngle, setArrowAngle] = useState(numberToAngle(50));
  const [message, setMessage] = useState('Игрок 1 выбирает число.');
  const [particles, setParticles] = useState<Particle[]>([]);

  const timersRef = useRef<number[]>([]);

  const activePlayer: Player = phase === 'pickMagenta' ? 'magenta' : 'cyan';
  const handoffPlayer: Player = picks.cyan === null ? 'cyan' : 'magenta';
  const canPick = phase === 'pickCyan' || phase === 'pickMagenta';

  const matchWinner: Player | null =
    scores.cyan >= TARGET_SCORE ? 'cyan' : scores.magenta >= TARGET_SCORE ? 'magenta' : null;

  const showWheelPicks = phase === 'spinning' || phase === 'result' || phase === 'gameover';

  const resultText = useMemo(() => {
    if (target === null || picks.cyan === null || picks.magenta === null) return '';

    const cyanDistance = distance(picks.cyan, target);
    const magentaDistance = distance(picks.magenta, target);

    if (cyanDistance === magentaDistance) {
      return `Финал ${target}. Ничья — оба Δ${cyanDistance}.`;
    }

    if (cyanDistance < magentaDistance) {
      return `Финал ${target}. P1 ближе: Δ${cyanDistance}.`;
    }

    return `Финал ${target}. P2 ближе: Δ${magentaDistance}.`;
  }, [target, picks]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const schedule = (callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((timerId) => timerId !== id);
      callback();
    }, delay);

    timersRef.current.push(id);
    return id;
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const burst = (tone: Particle['tone'], x: string, y: string, amount = 18) => {
    const items = Array.from({ length: amount }, (_, index) => ({
      id: Date.now() + Math.random() + index,
      x,
      y,
      angle: (360 / amount) * index + Math.random() * 20,
      distance: 48 + Math.random() * 80,
      size: 3 + Math.random() * 6,
      tone,
      delay: Math.random() * 70,
    }));

    setParticles((prev) => [...prev, ...items]);

    window.setTimeout(() => {
      setParticles((prev) => prev.filter((item) => !items.some((newItem) => newItem.id === item.id)));
    }, 1100);
  };

  const changeDraft = (value: number) => {
    if (!canPick) return;

    const nextValue = clamp(Math.round(value), MIN_NUMBER, MAX_NUMBER);
    setDraftValue(nextValue);
    setArrowAngle(numberToAngle(nextValue));
  };

  const nudge = (step: number) => {
    changeDraft(draftValue + step);
  };

  const finishRound = (finalTarget: number, finalPicks: PickState) => {
    const roundWinner = getWinner(finalTarget, finalPicks);

    setTarget(finalTarget);
    setWinner(roundWinner);

    if (roundWinner === 'draw') {
      burst('green', '50%', '43%', 22);
      setPhase('result');
      setMessage('Ничья. Оба одинаково близко.');
      return;
    }

    if (!roundWinner) return;

    const nextScores: ScoreState = {
      ...scores,
      [roundWinner]: scores[roundWinner] + 1,
    };

    setScores(nextScores);
    burst(roundWinner, roundWinner === 'cyan' ? '34%' : '66%', '43%', 22);

    if (nextScores[roundWinner] >= TARGET_SCORE) {
      setPhase('gameover');
      setMessage(`${roundWinner === 'cyan' ? 'P1' : 'P2'} выиграл матч.`);
      return;
    }

    setPhase('result');
    setMessage(`${roundWinner === 'cyan' ? 'P1' : 'P2'} получает очко.`);
  };

  const startSpin = (finalPicks: PickState) => {
    clearTimers();

    const finalTarget = randomNumber();

    setTarget(null);
    setWinner(null);
    setPhase('spinning');
    setMessage('Рулетка крутится...');
    burst('gold', '50%', '43%', 10);

    schedule(() => {
      setArrowAngle((current) => getSpinAngle(current, finalTarget));
    }, 60);

    schedule(() => {
      burst('gold', '50%', '43%', 30);
      finishRound(finalTarget, finalPicks);
    }, SPIN_MS + 180);
  };

  const confirmPick = () => {
    if (!canPick) return;

    const player = activePlayer;
    const nextPicks: PickState = {
      ...picks,
      [player]: draftValue,
    };

    setPicks(nextPicks);
    burst(player, player === 'cyan' ? '34%' : '66%', '43%', 14);

    const missingPlayer: Player | null =
      nextPicks.cyan === null ? 'cyan' : nextPicks.magenta === null ? 'magenta' : null;

    if (missingPlayer) {
      setPhase('handoff');
      setMessage(`${PLAYERS[player].short} сохранён. Передай телефон ${PLAYERS[missingPlayer].short}.`);
      return;
    }

    setMessage('Оба выбора сохранены.');
    schedule(() => startSpin(nextPicks), 320);
  };

  const continueToSecondPlayer = () => {
    const nextPlayer: Player = picks.cyan === null ? 'cyan' : 'magenta';

    setDraftValue(50);
    setArrowAngle(numberToAngle(50));
    setTarget(null);
    setWinner(null);
    setPhase(nextPlayer === 'cyan' ? 'pickCyan' : 'pickMagenta');
    setMessage(`${PLAYERS[nextPlayer].label} выбирает число.`);
  };

  const nextRound = () => {
    clearTimers();

    const starter: Player =
      winner && winner !== 'draw'
        ? winner
        : round % 2 === 1
          ? 'magenta'
          : 'cyan';

    setRound((value) => value + 1);
    setDraftValue(50);
    setPicks({ cyan: null, magenta: null });
    setTarget(null);
    setWinner(null);
    setArrowAngle(numberToAngle(50));
    setPhase(starter === 'cyan' ? 'pickCyan' : 'pickMagenta');
    setMessage(`${PLAYERS[starter].label} выбирает число.`);
  };

  const resetMatch = () => {
    clearTimers();

    setPhase('pickCyan');
    setScores({ cyan: 0, magenta: 0 });
    setRound(1);
    setDraftValue(50);
    setPicks({ cyan: null, magenta: null });
    setTarget(null);
    setWinner(null);
    setArrowAngle(numberToAngle(50));
    setMessage('Игрок 1 выбирает число.');
    setParticles([]);
  };

  const primaryLabel =
    phase === 'handoff'
      ? `${PLAYERS[handoffPlayer].short} готов`
      : phase === 'result'
        ? 'Дальше'
        : phase === 'gameover'
          ? 'Новый матч'
          : phase === 'spinning'
            ? 'Крутится'
            : 'Выбрать';

  const handlePrimary = () => {
    if (phase === 'handoff') {
      continueToSecondPlayer();
      return;
    }

    if (phase === 'result') {
      nextRound();
      return;
    }

    if (phase === 'gameover') {
      resetMatch();
      return;
    }

    confirmPick();
  };

  const hiddenCyan =
    target === null &&
    picks.cyan !== null &&
    (phase === 'handoff' || phase === 'pickCyan' || phase === 'pickMagenta');

  const hiddenMagenta =
    target === null &&
    picks.magenta !== null &&
    (phase === 'handoff' || phase === 'pickCyan' || phase === 'pickMagenta');

  const title =
    phase === 'gameover' && matchWinner
      ? `${matchWinner === 'cyan' ? 'P1' : 'P2'} win`
      : phase === 'result'
        ? winner === 'draw'
          ? 'Draw'
          : `${winner === 'cyan' ? 'P1' : 'P2'} +1`
        : 'Duel';

  return (
    <div className={`rd-page rd-${phase} ${winner ? `rd-winner-${winner}` : ''}`}>
      <style>{`
        .rd-page {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          gap: 4px;
          padding: 8px 8px max(8px, env(safe-area-inset-bottom));
          color: white;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          user-select: none;
          isolation: isolate;
          background:
            radial-gradient(circle at 50% 12%, rgba(255,255,255,.08), transparent 28%),
            radial-gradient(circle at 20% 46%, rgba(34,211,238,.14), transparent 34%),
            radial-gradient(circle at 82% 44%, rgba(232,121,249,.13), transparent 34%),
            linear-gradient(145deg, #030712 0%, #070b18 46%, #12051b 100%);
        }

        .rd-page * {
          box-sizing: border-box;
        }

        .rd-page::before {
          content: "";
          position: absolute;
          inset: -35%;
          z-index: -2;
          opacity: .18;
          background:
            conic-gradient(
              from 160deg at 50% 50%,
              transparent 0deg,
              rgba(34,211,238,.18) 78deg,
              transparent 150deg,
              rgba(232,121,249,.16) 240deg,
              transparent 330deg
            );
          animation: rdAura 36s linear infinite;
        }

        .rd-page::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 44%, rgba(0,0,0,.50) 100%),
            linear-gradient(180deg, rgba(0,0,0,.08), transparent 40%, rgba(0,0,0,.28));
        }

        .rd-top {
          position: relative;
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 6px;
          min-height: 38px;
        }

        .rd-score {
          height: 34px;
          display: flex;
          align-items: center;
          gap: 7px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.055);
          padding: 0 10px;
          opacity: .62;
          backdrop-filter: blur(16px);
        }

        .rd-score-magenta {
          justify-content: flex-end;
        }

        .rd-score-active {
          opacity: 1;
        }

        .rd-score-light {
          width: 8px;
          height: 8px;
          border-radius: 999px;
        }

        .rd-score b {
          font-size: 17px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.06em;
        }

        .rd-round {
          width: 42px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.07);
          font-size: 15px;
          font-weight: 1000;
          backdrop-filter: blur(16px);
        }

        .rd-main {
          position: relative;
          z-index: 10;
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          align-items: center;
          justify-items: center;
          gap: 4px;
        }

        .rd-title {
          text-align: center;
          transform: translateY(4px);
        }

        .rd-title small {
          display: block;
          color: rgba(255,255,255,.38);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .26em;
          text-transform: uppercase;
        }

        .rd-title h1 {
          margin: 5px 0 0;
          font-size: clamp(28px, 6.2vw, 46px);
          line-height: .85;
          font-weight: 1000;
          letter-spacing: -.08em;
          background: linear-gradient(90deg, #a5f3fc, #fff, #f5d0fe);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 18px 40px rgba(0,0,0,.42);
        }

        .rd-wheel {
          position: relative;
          width: min(88vw, 448px);
          height: min(88vw, 448px);
          max-width: min(59vh, 448px);
          max-height: min(59vh, 448px);
          min-width: 302px;
          min-height: 302px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          filter: drop-shadow(0 30px 70px rgba(0,0,0,.45));
        }

        .rd-wheel-surface {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.14);
          background:
            radial-gradient(circle at 50% 42%, rgba(255,255,255,.17), rgba(255,255,255,.04) 35%, rgba(255,255,255,.018) 63%, rgba(0,0,0,.24) 100%),
            conic-gradient(
              from 0deg,
              rgba(34,211,238,.18),
              rgba(255,255,255,.04),
              rgba(232,121,249,.17),
              rgba(255,255,255,.04),
              rgba(34,211,238,.18)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.18),
            inset 0 -42px 70px rgba(0,0,0,.28),
            0 0 78px rgba(34,211,238,.09);
        }

        .rd-spinning .rd-wheel-surface {
          animation: rdWheelGlow 1s ease-in-out infinite alternate;
        }

        .rd-marks {
          position: absolute;
          inset: 0;
          border-radius: inherit;
        }

        .rd-marks i {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 2px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,.18);
          transform:
            rotate(var(--a))
            translateY(calc(-1 * min(42vw, 204px)))
            translateX(-50%);
          transform-origin: center;
        }

        .rd-marks .rd-mark-major {
          width: 3px;
          height: 16px;
          background: rgba(255,255,255,.52);
          box-shadow: 0 0 14px rgba(255,255,255,.16);
        }

        .rd-labels {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .rd-labels span {
          position: absolute;
          transform: translate(-50%, -50%);
          color: rgba(255,255,255,.34);
          font-size: 10px;
          font-weight: 1000;
        }

        .rd-bet {
          position: absolute;
          inset: 0;
          z-index: 6;
          transform: rotate(var(--a));
          pointer-events: none;
        }

        .rd-bet span {
          position: absolute;
          left: 50%;
          top: 8%;
          min-width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          transform: translate(-50%, -50%) rotate(calc(-1 * var(--a)));
          border-radius: 999px;
          color: #020617;
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.02em;
          box-shadow:
            0 0 0 4px rgba(255,255,255,.08),
            0 0 26px currentColor;
        }

        .rd-bet-cyan span {
          background: #67e8f9;
          color: #083344;
          box-shadow:
            0 0 0 4px rgba(103,232,249,.12),
            0 0 28px rgba(34,211,238,.75);
        }

        .rd-bet-magenta span {
          background: #f5d0fe;
          color: #4a044e;
          box-shadow:
            0 0 0 4px rgba(245,208,254,.12),
            0 0 28px rgba(217,70,239,.75);
        }

        .rd-bet-target span {
          min-width: 34px;
          height: 34px;
          background: linear-gradient(135deg, #fff7ed, #fde68a, #f59e0b);
          color: #422006;
          box-shadow:
            0 0 0 5px rgba(251,191,36,.14),
            0 0 34px rgba(251,191,36,.85);
          animation: rdTargetPulse .9s ease-in-out infinite alternate;
        }

        .rd-arrow {
          position: absolute;
          inset: 9%;
          z-index: 8;
          transform: rotate(var(--angle));
          transform-origin: center;
          transition: transform .18s ease-out;
          pointer-events: none;
        }

        .rd-spinning .rd-arrow {
          transition: transform var(--spin-ms) cubic-bezier(.06, .86, .05, 1);
        }

        .rd-arrow-line {
          position: absolute;
          left: 50%;
          top: 8%;
          width: 5px;
          height: 41%;
          transform: translateX(-50%);
          border-radius: 999px;
          background:
            linear-gradient(180deg, #ffffff, #fde68a 45%, rgba(251,191,36,.18));
          box-shadow:
            0 0 26px rgba(251,191,36,.70),
            0 0 52px rgba(251,191,36,.34);
        }

        .rd-arrow-head {
          position: absolute;
          left: 50%;
          top: 3.4%;
          width: 0;
          height: 0;
          transform: translateX(-50%);
          border-left: 12px solid transparent;
          border-right: 12px solid transparent;
          border-bottom: 25px solid #fde68a;
          filter:
            drop-shadow(0 0 12px rgba(251,191,36,.88))
            drop-shadow(0 0 28px rgba(251,191,36,.42));
        }

        .rd-center {
          position: relative;
          z-index: 9;
          width: 40%;
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          align-content: center;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.14);
          background:
            radial-gradient(circle at 50% 18%, rgba(255,255,255,.18), transparent 34%),
            linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035));
          box-shadow:
            0 26px 70px rgba(0,0,0,.46),
            inset 0 1px 0 rgba(255,255,255,.18),
            inset 0 -30px 46px rgba(0,0,0,.25);
          backdrop-filter: blur(18px);
        }

        .rd-spinning .rd-center {
          animation: rdCenterPulse .58s ease-in-out infinite alternate;
        }

        .rd-center small {
          color: rgba(255,255,255,.42);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .20em;
          text-transform: uppercase;
        }

        .rd-center strong {
          margin-top: 6px;
          color: white;
          font-size: clamp(48px, 13vw, 80px);
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.09em;
        }

        .rd-picks {
          width: min(100%, 318px);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          transform: translateY(-3px);
        }

        .rd-pick {
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.055);
          backdrop-filter: blur(14px);
        }

        .rd-pick span {
          color: rgba(255,255,255,.38);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .rd-pick b {
          font-size: 16px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.06em;
        }

        .rd-pick small {
          color: rgba(255,255,255,.45);
          font-size: 8px;
          font-weight: 1000;
        }

        .rd-pick-cyan b {
          color: #a5f3fc;
        }

        .rd-pick-magenta b {
          color: #f5d0fe;
        }

        .rd-bottom {
          position: relative;
          z-index: 20;
          display: grid;
          gap: 6px;
          transform: translateY(4px);
        }

        .rd-message {
          min-height: 14px;
          text-align: center;
          color: rgba(255,255,255,.66);
          font-size: 10px;
          line-height: 1.2;
          font-weight: 800;
          text-shadow: 0 8px 22px rgba(0,0,0,.38);
        }

        .rd-slider-box {
          display: grid;
          gap: 6px;
          padding: 8px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.055);
          box-shadow:
            0 16px 42px rgba(0,0,0,.24),
            inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter: blur(18px);
        }

        .rd-slider-row {
          position: relative;
          height: 26px;
          display: grid;
          align-items: center;
        }

        .rd-slider-track {
          position: absolute;
          left: 4px;
          right: 4px;
          top: 50%;
          height: 6px;
          transform: translateY(-50%);
          border-radius: 999px;
          overflow: hidden;
          background: rgba(0,0,0,.34);
          box-shadow:
            inset 0 1px 3px rgba(0,0,0,.55),
            0 0 0 1px rgba(255,255,255,.05);
        }

        .rd-slider-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22d3ee, #a855f7, #ec4899);
          box-shadow: 0 0 18px rgba(168,85,247,.36);
        }

        .rd-slider {
          position: relative;
          z-index: 3;
          width: 100%;
          opacity: 0;
          cursor: pointer;
        }

        .rd-nudges {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 5px;
        }

        .rd-nudge {
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 13px;
          padding: 7px 0;
          color: rgba(255,255,255,.66);
          background: rgba(255,255,255,.055);
          font-size: 10px;
          line-height: 1;
          font-weight: 1000;
        }

        .rd-nudge:active {
          transform: scale(.96);
          background: rgba(255,255,255,.11);
        }

        .rd-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 6px;
        }

        .rd-button {
          border: 0;
          min-height: 40px;
          border-radius: 18px;
          padding: 0 15px;
          color: white;
          background: linear-gradient(135deg, #22d3ee 0%, #a855f7 52%, #ec4899 100%);
          box-shadow:
            0 16px 36px rgba(168,85,247,.26),
            inset 0 2px 0 rgba(255,255,255,.24);
          font-size: 10px;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: .10em;
          white-space: nowrap;
        }

        .rd-button:active {
          transform: scale(.97);
        }

        .rd-button:disabled {
          opacity: .45;
          filter: grayscale(1);
        }

        .rd-button-ghost {
          min-width: 74px;
          color: rgba(255,255,255,.64);
          background: rgba(255,255,255,.075);
          border: 1px solid rgba(255,255,255,.09);
          box-shadow: 0 13px 30px rgba(0,0,0,.20);
        }

        .rd-card {
          position: absolute;
          z-index: 80;
          left: 50%;
          top: 50%;
          width: min(330px, calc(100% - 32px));
          transform: translate(-50%, -50%);
          display: grid;
          justify-items: center;
          gap: 12px;
          padding: 22px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 30px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.16), transparent 42%),
            rgba(5, 8, 18, .88);
          box-shadow:
            0 34px 92px rgba(0,0,0,.58),
            inset 0 1px 0 rgba(255,255,255,.12);
          backdrop-filter: blur(24px);
          animation: rdCardIn .25s ease both;
        }

        .rd-card-icon {
          display: grid;
          place-items: center;
          width: 62px;
          height: 62px;
          border-radius: 23px;
          background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(217,70,239,.22));
          font-size: 30px;
        }

        .rd-card h2 {
          margin: 0;
          font-size: clamp(27px, 7vw, 40px);
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.08em;
        }

        .rd-card p {
          margin: 0;
          max-width: 270px;
          color: rgba(255,255,255,.60);
          font-size: 12px;
          line-height: 1.35;
          font-weight: 750;
        }

        .rd-particle {
          position: absolute;
          z-index: 90;
          left: var(--x);
          top: var(--y);
          width: var(--s);
          height: var(--s);
          border-radius: 999px;
          pointer-events: none;
          background: currentColor;
          color: #67e8f9;
          box-shadow: 0 0 18px currentColor;
          transform: translate(-50%, -50%);
          animation: rdParticle .92s cubic-bezier(.18,.86,.22,1) forwards;
          animation-delay: var(--delay);
        }

        .rd-particle-magenta {
          color: #f5d0fe;
        }

        .rd-particle-gold {
          color: #fde68a;
        }

        .rd-particle-green {
          color: #bbf7d0;
        }

        @keyframes rdAura {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes rdWheelGlow {
          from {
            filter: brightness(1);
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,.18),
              inset 0 -42px 70px rgba(0,0,0,.28),
              0 0 62px rgba(34,211,238,.08);
          }
          to {
            filter: brightness(1.14);
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,.18),
              inset 0 -42px 70px rgba(0,0,0,.28),
              0 0 92px rgba(251,191,36,.18);
          }
        }

        @keyframes rdCenterPulse {
          from {
            transform: scale(.985);
            filter: brightness(1);
          }
          to {
            transform: scale(1.02);
            filter: brightness(1.14);
          }
        }

        @keyframes rdTargetPulse {
          from {
            transform: translate(-50%, -50%) rotate(calc(-1 * var(--a))) scale(.94);
          }
          to {
            transform: translate(-50%, -50%) rotate(calc(-1 * var(--a))) scale(1.08);
          }
        }

        @keyframes rdCardIn {
          from {
            opacity: 0;
            transform: translate(-50%, -44%) scale(.94);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes rdParticle {
          0% {
            opacity: 0;
            transform:
              translate(-50%, -50%)
              rotate(var(--a))
              translateX(0)
              scale(.25);
          }
          18% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform:
              translate(-50%, -50%)
              rotate(var(--a))
              translateX(var(--d))
              scale(1.1);
          }
        }

        @media (max-height: 720px) {
          .rd-page {
            gap: 2px;
            padding-top: 6px;
            padding-bottom: max(6px, env(safe-area-inset-bottom));
          }

          .rd-top {
            min-height: 34px;
          }

          .rd-score,
          .rd-round {
            height: 31px;
          }

          .rd-title h1 {
            font-size: clamp(25px, 5.7vw, 38px);
          }

          .rd-wheel {
            min-width: 284px;
            min-height: 284px;
            width: min(84vw, 390px);
            height: min(84vw, 390px);
            max-width: min(55vh, 390px);
            max-height: min(55vh, 390px);
          }

          .rd-center strong {
            font-size: clamp(42px, 12vw, 70px);
          }

          .rd-slider-box {
            padding: 7px;
          }

          .rd-button {
            min-height: 37px;
          }
        }

        @media (max-width: 520px) {
          .rd-title h1 {
            font-size: 29px;
          }

          .rd-wheel {
            min-width: 302px;
            min-height: 302px;
            width: min(88vw, 360px);
            height: min(88vw, 360px);
          }

          .rd-marks i {
            transform:
              rotate(var(--a))
              translateY(calc(-1 * min(42vw, 164px)))
              translateX(-50%);
          }

          .rd-center strong {
            font-size: 50px;
          }

          .rd-actions {
            grid-template-columns: 1fr;
          }

          .rd-button-ghost {
            min-width: 0;
          }
        }
      `}</style>

      <div className="rd-top">
        <ScoreDot player="cyan" score={scores.cyan} active={activePlayer === 'cyan' && canPick} />
        <div className="rd-round">{round}</div>
        <ScoreDot player="magenta" score={scores.magenta} active={activePlayer === 'magenta' && canPick} />
      </div>

      <main className="rd-main">
        <div className="rd-title">
          <small>
            {phase === 'spinning'
              ? 'roulette'
              : phase === 'result'
                ? 'result'
                : phase === 'gameover'
                  ? 'match'
                  : phase === 'handoff'
                    ? 'secret'
                    : `${PLAYERS[activePlayer].label}`}
          </small>
          <h1>{title}</h1>
        </div>

        <Wheel
          angle={arrowAngle}
          displayNumber={draftValue}
          phase={phase}
          target={target}
          picks={picks}
          showPicks={showWheelPicks}
        />

        <MiniPicks
          picks={picks}
          target={target}
          hiddenCyan={hiddenCyan}
          hiddenMagenta={hiddenMagenta}
        />

        {phase === 'handoff' && (
          <div className="rd-card">
            <div className="rd-card-icon">🤫</div>
            <h2>Передай телефон</h2>
            <p>
              Выбор сохранён и скрыт. Теперь выбирает {PLAYERS[handoffPlayer].short}.
            </p>
            <button type="button" className="rd-button" onClick={continueToSecondPlayer}>
              {PLAYERS[handoffPlayer].short} готов
            </button>
          </div>
        )}

        {phase === 'gameover' && (
          <div className="rd-card">
            <div className="rd-card-icon">🏆</div>
            <h2>{matchWinner === 'cyan' ? 'P1 победил' : 'P2 победил'}</h2>
            <p>
              Финальный счёт {scores.cyan}:{scores.magenta}. Игра до {TARGET_SCORE} очков.
            </p>
            <button type="button" className="rd-button" onClick={resetMatch}>
              Новый матч
            </button>
          </div>
        )}

        {particles.map((particle) => (
          <i
            key={particle.id}
            className={`rd-particle ${
              particle.tone === 'magenta'
                ? 'rd-particle-magenta'
                : particle.tone === 'gold'
                  ? 'rd-particle-gold'
                  : particle.tone === 'green'
                    ? 'rd-particle-green'
                    : ''
            }`}
            style={cssVars({
              '--x': particle.x,
              '--y': particle.y,
              '--a': `${particle.angle}deg`,
              '--d': `${particle.distance}px`,
              '--s': `${particle.size}px`,
              '--delay': `${particle.delay}ms`,
            })}
          />
        ))}
      </main>

      <div className="rd-bottom">
        <div className="rd-message">
          {matchWinner ? `${matchWinner === 'cyan' ? 'P1' : 'P2'} выиграл матч.` : resultText || message}
        </div>

        {canPick && (
          <div className="rd-slider-box">
            <div className="rd-slider-row">
              <div className="rd-slider-track">
                <div
                  className="rd-slider-fill"
                  style={{
                    width: `${((draftValue - MIN_NUMBER) / (MAX_NUMBER - MIN_NUMBER)) * 100}%`,
                  }}
                />
              </div>

              <input
                type="range"
                min={MIN_NUMBER}
                max={MAX_NUMBER}
                step={1}
                value={draftValue}
                onChange={(event) => changeDraft(Number(event.target.value))}
                className="rd-slider"
              />
            </div>

            <div className="rd-nudges">
              <button type="button" className="rd-nudge" onClick={() => nudge(-10)}>
                -10
              </button>
              <button type="button" className="rd-nudge" onClick={() => nudge(-1)}>
                -1
              </button>
              <button type="button" className="rd-nudge" onClick={() => nudge(1)}>
                +1
              </button>
              <button type="button" className="rd-nudge" onClick={() => nudge(10)}>
                +10
              </button>
            </div>
          </div>
        )}

        <div className="rd-actions">
          <button
            type="button"
            className="rd-button"
            onClick={handlePrimary}
            disabled={phase === 'spinning'}
          >
            {primaryLabel}
          </button>

        </div>
      </div>
    </div>
  );
};

export const NeonMatrix = NeonMatrixGame;
export const NumberMatrixGame = NeonMatrixGame;
export default NeonMatrixGame;