import React, { useMemo, useState } from 'react';

type Player = 'amber' | 'violet';
type Phase = 'ready' | 'rolling' | 'decision' | 'rerolling' | 'reveal' | 'gameover';

type Spark = { id: number; x: string; y: string; tone: 'gold' | 'pink' | 'green' };
type FloatingText = { id: number; text: string; x: string; y: string; tone: 'gold' | 'pink' | 'green' };

const TARGET_SCORE = 3;
const DICE_COUNT = 3;

const PLAYERS: Record<Player, { name: string; main: string; soft: string; glow: string }> = {
  amber: { name: 'Amber', main: '#f59e0b', soft: '#fde68a', glow: 'rgba(251, 191, 36, .72)' },
  violet: { name: 'Violet', main: '#d946ef', soft: '#f5d0fe', glow: 'rgba(217, 70, 239, .64)' },
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
    style={cssVars({ '--delay': `${index * 70}ms` })}
    aria-label={`Кубик ${value}`}
  >
    <span className="dd-shadow" />
    <span className="dd-die-shell">
      <span className="dd-die-gloss" />
      <PipLayer value={value} />
    </span>
  </button>
);

const MiniDie = ({ value, player, delay = 0 }: { value: number; player: Player; delay?: number }) => (
  <div className={`dd-mini-die dd-mini-die-${player}`} style={{ animationDelay: `${delay}ms` }} aria-label={`Кубик ${value}`}>
    <PipLayer value={value} mini />
  </div>
);

const ScoreLine = ({ player, score, active }: { player: Player; score: number; active: boolean }) => {
  const meta = PLAYERS[player];

  return (
    <div className={`dd-score-line dd-score-line-${player} ${active ? 'dd-score-line-active' : ''}`}>
      <span
        className="dd-player-dot"
        style={{ background: meta.main, boxShadow: active ? `0 0 24px ${meta.glow}` : undefined }}
      />
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

const BankedResult = ({ player, dice }: { player: Player; dice: number[] | null }) => {
  const meta = PLAYERS[player];

  return (
    <div className={`dd-banked dd-banked-${player} ${dice ? 'dd-banked-show' : ''}`}>
      <div className="dd-banked-label" style={{ color: meta.soft }}>
        {meta.name}
      </div>
      <div className="dd-banked-total">{dice ? sumDice(dice) : '—'}</div>
      <div className="dd-banked-dice">
        {dice?.map((value, index) => (
          <MiniDie key={`${player}-${index}-${value}`} value={value} player={player} delay={index * 85} />
        ))}
      </div>
    </div>
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
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [floating, setFloating] = useState<FloatingText[]>([]);
  const [impact, setImpact] = useState<Player | 'push' | null>(null);

  const total = useMemo(() => sumDice(activeDice), [activeDice]);
  const matchWinner = scores.amber >= TARGET_SCORE ? 'amber' : scores.violet >= TARGET_SCORE ? 'violet' : null;
  const isBusy = phase === 'rolling' || phase === 'rerolling';
  const canSelectDie = phase === 'decision' && !usedReroll;
  const canRisk = phase === 'decision' && !usedReroll && selectedDie !== null;
  const activeMeta = PLAYERS[currentPlayer];

  const addSpark = (x: string, y: string, tone: Spark['tone'] = 'gold') => {
    const id = Date.now() + Math.random();
    setSparks((prev) => [...prev, { id, x, y, tone }]);
    window.setTimeout(() => setSparks((prev) => prev.filter((spark) => spark.id !== id)), 900);
  };

  const addFloat = (text: string, x: string, y: string, tone: FloatingText['tone'] = 'gold') => {
    const id = Date.now() + Math.random();
    setFloating((prev) => [...prev, { id, text, x, y, tone }]);
    window.setTimeout(() => setFloating((prev) => prev.filter((item) => item.id !== id)), 1200);
  };

  const pulseImpact = (tone: Player | 'push') => {
    setImpact(tone);
    window.setTimeout(() => setImpact(null), 760);
  };

  const resetMatch = () => {
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
    setImpact(null);
    setMessage('Amber начинает. Брось 3 кубика.');
    setSparks([]);
    setFloating([]);
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
    setImpact(null);
    setPhase('ready');
    setMessage(`${PLAYERS[nextStarter].name} начинает новый раунд. Брось 3 кубика.`);
  };

  const finishRoll = (finalDice: number[], isFull: boolean) => {
    setActiveDice(finalDice);
    setStoppedDice([true, true, true]);
    setSelectedDie(null);
    setPhase('decision');

    if (!isFull) setUsedReroll(true);

    const nextTotal = sumDice(finalDice);
    const tone = currentPlayer === 'amber' ? 'gold' : 'pink';

    addSpark('50%', '54%', tone);
    addFloat(String(nextTotal), '50%', '42%', tone);
    pulseImpact(currentPlayer);

    setMessage(
      isFull
        ? `${PLAYERS[currentPlayer].name}: сумма ${nextTotal}. Можно оставить или выбрать один кубик для риска.`
        : `${PLAYERS[currentPlayer].name}: новая сумма ${nextTotal}. Теперь фиксируй результат.`,
    );
  };

  const animateRoll = (mode: 'full' | 'single', dieIndex?: number) => {
    if (isBusy || matchWinner) return;

    const isFull = mode === 'full';

    setPhase(isFull ? 'rolling' : 'rerolling');
    setRoundWinner(null);
    setMessage(isFull ? 'Кубики меняют грани...' : `Риск-переброс кубика #${(dieIndex ?? 0) + 1}...`);

    const finalDice = isFull ? rollDice() : [...activeDice];
    if (!isFull && typeof dieIndex === 'number') finalDice[dieIndex] = rollDie();

    const start = Date.now();
    const fullStopTimes = [430, 760, 1090];
    const singleStopTime = 610;

    setStoppedDice(isFull ? [false, false, false] : activeDice.map((_, index) => index !== dieIndex));

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - start;

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

      const finished = isFull ? elapsed >= fullStopTimes[2] + 150 : elapsed >= singleStopTime + 130;

      if (finished) {
        window.clearInterval(timer);
        finishRoll(finalDice, isFull);
      }
    }, 74);
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
    const nextBanked = { ...bankedDice, [currentPlayer]: currentDice };
    const currentTotal = sumDice(currentDice);
    const tone = currentPlayer === 'amber' ? 'gold' : 'pink';

    setBankedDice(nextBanked);
    setSelectedDie(null);
    setUsedReroll(false);

    addSpark(currentPlayer === 'amber' ? '17%' : '83%', '53%', tone);
    addFloat(`LOCK ${currentTotal}`, currentPlayer === 'amber' ? '22%' : '78%', '39%', tone);
    pulseImpact(currentPlayer);

    if (currentPlayer === 'amber' && !nextBanked.violet) {
      setCurrentPlayer('violet');
      setActiveDice([1, 1, 1]);
      setStoppedDice([true, true, true]);
      setPhase('ready');
      setMessage('Amber зафиксировал сумму. Ход Violet.');
      return;
    }

    if (currentPlayer === 'violet' && !nextBanked.amber) {
      setCurrentPlayer('amber');
      setActiveDice([1, 1, 1]);
      setStoppedDice([true, true, true]);
      setPhase('ready');
      setMessage('Violet зафиксировал сумму. Ход Amber.');
      return;
    }

    const amberTotal = sumDice(nextBanked.amber || []);
    const violetTotal = sumDice(nextBanked.violet || []);
    const winner: Player | 'push' = amberTotal > violetTotal ? 'amber' : violetTotal > amberTotal ? 'violet' : 'push';

    setRoundWinner(winner);
    setPhase('reveal');
    pulseImpact(winner);

    if (winner === 'push') {
      addSpark('50%', '50%', 'green');
      addFloat('НИЧЬЯ', '50%', '36%', 'green');
      setMessage(`Ничья ${amberTotal}:${violetTotal}. Очко никто не получает.`);
      return;
    }

    const nextScores = { ...scores, [winner]: scores[winner] + 1 };

    setScores(nextScores);
    addSpark(winner === 'amber' ? '24%' : '76%', '45%', winner === 'amber' ? 'gold' : 'pink');
    addFloat('+1 POINT', winner === 'amber' ? '27%' : '73%', '31%', winner === 'amber' ? 'gold' : 'pink');

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
          padding:
            clamp(8px, 1.2vh, 13px)
            clamp(10px, 2vw, 18px)
            max(88px, calc(env(safe-area-inset-bottom) + 78px));
          gap: clamp(6px, 1.1vh, 10px);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at 50% 14%, rgba(255, 255, 255, .08), transparent 28%),
            radial-gradient(circle at 20% 38%, rgba(245, 158, 11, .25), transparent 26%),
            radial-gradient(circle at 78% 42%, rgba(217, 70, 239, .23), transparent 28%),
            radial-gradient(circle at 50% 94%, rgba(14, 165, 233, .13), transparent 31%),
            linear-gradient(145deg, #04020a 0%, #13071f 34%, #160706 68%, #05020c 100%);
        }

        .dd-page::before {
          content: "";
          position: absolute;
          inset: -30%;
          pointer-events: none;
          opacity: .34;
          background:
            conic-gradient(
              from 180deg at 50% 50%,
              transparent 0deg,
              rgba(245, 158, 11, .16) 68deg,
              transparent 128deg,
              rgba(217, 70, 239, .16) 220deg,
              transparent 300deg
            );
          animation: ddAura 22s linear infinite;
        }

        .dd-page::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 52%, transparent 0 42%, rgba(0,0,0,.44) 100%),
            linear-gradient(180deg, rgba(0,0,0,.18), transparent 34%, rgba(0,0,0,.22));
        }

        .dd-hud {
          position: relative;
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: clamp(6px, 2vw, 14px);
          min-height: clamp(44px, 7.5vh, 62px);
        }

        .dd-round {
          text-align: center;
          min-width: 72px;
          line-height: 1;
        }

        .dd-round strong {
          display: block;
          color: #fff7ed;
          font-size: clamp(15px, 3.2vw, 23px);
          font-weight: 1000;
          letter-spacing: -.05em;
          text-shadow: 0 0 22px rgba(251,191,36,.28);
        }

        .dd-round span {
          display: block;
          margin-top: 3px;
          color: rgba(255,255,255,.36);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .22em;
          text-transform: uppercase;
        }

        .dd-score-line {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          color: rgba(255,255,255,.55);
          font-size: clamp(11px, 2.4vw, 14px);
          font-weight: 950;
          letter-spacing: -.02em;
          transition: color .18s ease, transform .18s ease, text-shadow .18s ease;
        }

        .dd-score-line-violet { justify-content: flex-end; }

        .dd-score-line-active {
          color: white;
          transform: translateY(-1px);
          text-shadow: 0 0 18px rgba(255,255,255,.18);
        }

        .dd-player-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .dd-player-name {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .dd-score-line b {
          color: #fff7ed;
          font-size: clamp(16px, 3.2vw, 23px);
          font-weight: 1000;
          line-height: 1;
        }

        .dd-score-dots {
          display: flex;
          gap: 4px;
        }

        .dd-score-dots i {
          display: block;
          width: clamp(9px, 2.2vw, 16px);
          height: 5px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
        }

        .dd-score-line-amber .dd-score-dot-on {
          background: linear-gradient(90deg, #fde68a, #f97316);
          box-shadow: 0 0 14px rgba(251,191,36,.45);
        }

        .dd-score-line-violet .dd-score-dot-on {
          background: linear-gradient(90deg, #f5d0fe, #a855f7);
          box-shadow: 0 0 14px rgba(217,70,239,.42);
        }

        .dd-space {
          position: relative;
          z-index: 10;
          min-height: 0;
          overflow: hidden;
          display: grid;
          place-items: center;
        }

        .dd-space-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .dd-space-bg::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 57%;
          width: min(82vw, 640px);
          height: min(42vh, 280px);
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(ellipse at center, rgba(255,255,255,.16), rgba(255,255,255,.03) 34%, transparent 70%);
          filter: blur(1px);
        }

        .dd-space-bg::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 67%;
          width: min(68vw, 520px);
          height: min(20vh, 138px);
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: rgba(0,0,0,.34);
          filter: blur(28px);
        }

        .dd-banked {
          position: absolute;
          top: 50%;
          width: 27%;
          min-width: 88px;
          max-width: 180px;
          transform: translateY(-50%);
          opacity: .45;
          pointer-events: none;
          transition: opacity .22s ease, transform .22s ease;
        }

        .dd-banked-show { opacity: 1; }
        .dd-banked-amber { left: 0; text-align: left; }
        .dd-banked-violet { right: 0; text-align: right; }

        .dd-banked-label {
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
          opacity: .78;
        }

        .dd-banked-total {
          margin-top: 8px;
          color: white;
          font-size: clamp(40px, 10vw, 92px);
          line-height: .85;
          font-weight: 1000;
          letter-spacing: -.08em;
          text-shadow: 0 12px 34px rgba(0,0,0,.38);
        }

        .dd-banked-dice {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .dd-banked-violet .dd-banked-dice { justify-content: flex-end; }

        .dd-main {
          position: relative;
          width: min(78vw, 560px);
          height: min(66vh, 460px);
          min-height: 270px;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          align-items: center;
          justify-items: center;
          perspective: 1100px;
        }

        .dd-turn {
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .dd-turn-kicker {
          color: rgba(255,255,255,.42);
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .24em;
          text-transform: uppercase;
        }

        .dd-turn-name {
          margin-top: 8px;
          color: white;
          font-size: clamp(30px, 7vw, 62px);
          line-height: .88;
          font-weight: 1000;
          letter-spacing: -.08em;
          text-shadow: 0 18px 45px rgba(0,0,0,.42);
        }

        .dd-dice-cloud {
          position: relative;
          width: 100%;
          min-height: clamp(118px, 28vh, 218px);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(9px, 2.4vw, 22px);
        }

        .dd-die {
          position: relative;
          width: clamp(62px, 15vw, 112px);
          height: clamp(62px, 15vw, 112px);
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          transition: transform .17s ease, filter .17s ease;
        }

        .dd-die:disabled { cursor: default; }
        .dd-die:not(:disabled):active { transform: scale(.95); }

        .dd-shadow {
          position: absolute;
          left: 50%;
          bottom: -18px;
          width: 86%;
          height: 22px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(0,0,0,.42);
          filter: blur(8px);
          opacity: .78;
          transition: transform .18s ease, opacity .18s ease;
        }

        .dd-die-shell {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: clamp(18px, 4vw, 28px);
          border: 2px solid rgba(255,255,255,.28);
          background:
            radial-gradient(circle at 28% 20%, rgba(255,255,255,.95), transparent 18%),
            linear-gradient(145deg, #fff7ed 0%, #fde68a 34%, #fb923c 66%, #7c2d12 100%);
          box-shadow:
            0 24px 32px rgba(0,0,0,.38),
            inset 0 4px 10px rgba(255,255,255,.55),
            inset 0 -16px 26px rgba(124,45,18,.50);
          transition: transform .22s cubic-bezier(.2,.9,.22,1), filter .22s ease, box-shadow .22s ease;
        }

        .dd-die-gloss {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          background:
            radial-gradient(circle at 28% 18%, rgba(255,255,255,.55), transparent 22%),
            linear-gradient(135deg, rgba(255,255,255,.28), transparent 35%, rgba(255,255,255,.12) 72%, transparent);
          mix-blend-mode: screen;
          opacity: .72;
        }

        .dd-pip-layer {
          position: absolute;
          inset: 0;
          z-index: 2;
          animation: ddPipSwap .20s cubic-bezier(.2,.8,.2,1) both;
        }

        .dd-pip, .dd-mini-pip {
          position: absolute;
          width: 15%;
          height: 15%;
          border-radius: 999px;
          background: radial-gradient(circle at 34% 28%, #5b3418, #1f1308 72%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.20), 0 1px 1px rgba(255,255,255,.10);
        }

        .dd-pip-tl, .dd-mini-pip-tl { left: 22%; top: 22%; }
        .dd-pip-tr, .dd-mini-pip-tr { right: 22%; top: 22%; }
        .dd-pip-ml, .dd-mini-pip-ml { left: 22%; top: 42.5%; }
        .dd-pip-mr, .dd-mini-pip-mr { right: 22%; top: 42.5%; }
        .dd-pip-bl, .dd-mini-pip-bl { left: 22%; bottom: 22%; }
        .dd-pip-br, .dd-mini-pip-br { right: 22%; bottom: 22%; }
        .dd-pip-center, .dd-mini-pip-center { left: 42.5%; top: 42.5%; }

        .dd-die-selected .dd-die-shell {
          transform: translateY(-12px) scale(1.04);
          filter: drop-shadow(0 0 28px rgba(253,230,138,.62));
          box-shadow:
            0 24px 32px rgba(0,0,0,.38),
            inset 0 4px 10px rgba(255,255,255,.55),
            inset 0 -16px 26px rgba(124,45,18,.50),
            0 0 0 5px rgba(253,230,138,.25);
        }

        .dd-die-selected .dd-shadow {
          transform: translateX(-50%) scale(.7);
          opacity: .42;
        }

        .dd-die-rolling .dd-die-shell {
          animation: ddDicePulse .34s cubic-bezier(.2,.8,.2,1) infinite;
          animation-delay: var(--delay);
        }

        .dd-die-rolling .dd-shadow {
          animation: ddDiceShadowPulse .34s ease-in-out infinite;
          animation-delay: var(--delay);
        }

        .dd-total {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: baseline;
          gap: 10px;
          color: rgba(255,255,255,.45);
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .2em;
          text-transform: uppercase;
        }

        .dd-total b {
          color: #fff7ed;
          font-size: clamp(34px, 8vw, 66px);
          line-height: .85;
          letter-spacing: -.08em;
          text-shadow: 0 0 28px rgba(251,191,36,.24);
        }

        .dd-mini-die {
          position: relative;
          width: clamp(26px, 6vw, 40px);
          height: clamp(26px, 6vw, 40px);
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,.22);
          background:
            radial-gradient(circle at 28% 20%, rgba(255,255,255,.95), transparent 18%),
            linear-gradient(145deg, #fff7ed, #facc15 52%, #b45309);
          box-shadow:
            0 10px 16px rgba(0,0,0,.30),
            inset 0 2px 5px rgba(255,255,255,.42),
            inset 0 -8px 13px rgba(124,45,18,.34);
          animation: ddBankIn .54s cubic-bezier(.16,.9,.2,1) both;
        }

        .dd-mini-pip-layer {
          position: absolute;
          inset: 0;
        }

        .dd-actions {
          position: relative;
          z-index: 20;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          min-height: 64px;
        }

        .dd-status {
          min-width: 0;
          color: rgba(255,255,255,.75);
          font-size: 12px;
          line-height: 1.2;
          font-weight: 850;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-shadow: 0 8px 24px rgba(0,0,0,.38);
        }

        .dd-button-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }

        .dd-button {
          border: 0;
          border-radius: 999px;
          padding: 13px 17px;
          color: #1c1208;
          background: linear-gradient(135deg, #fff7ed 0%, #facc15 42%, #ea580c 100%);
          box-shadow: 0 15px 35px rgba(180,83,9,.30), inset 0 2px 0 rgba(255,255,255,.40);
          font-size: 11px;
          line-height: 1;
          font-weight: 1000;
          text-transform: uppercase;
          letter-spacing: .07em;
          white-space: nowrap;
          transition: transform .14s ease, opacity .14s ease, filter .14s ease;
        }

        .dd-button:active { transform: scale(.96); }
        .dd-button:disabled { opacity: .35; filter: grayscale(1); }

        .dd-button-risk {
          color: white;
          background: linear-gradient(135deg, #fb7185 0%, #d946ef 48%, #7c3aed 100%);
          box-shadow: 0 15px 35px rgba(168,85,247,.28), inset 0 2px 0 rgba(255,255,255,.28);
        }

        .dd-button-ghost {
          color: rgba(255,255,255,.72);
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 15px 35px rgba(0,0,0,.20);
        }

        .dd-spark {
          position: absolute;
          left: var(--x);
          top: var(--y);
          z-index: 40;
          width: 13px;
          height: 13px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          color: #fde68a;
          background: currentColor;
          box-shadow: 0 0 30px currentColor;
          animation: ddSpark .88s ease-out forwards;
        }

        .dd-spark-pink { color: #f5d0fe; }
        .dd-spark-green { color: #bbf7d0; }

        .dd-spark::before,
        .dd-spark::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 100px;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, currentColor, transparent);
          transform: translate(-50%, -50%);
          opacity: .78;
        }

        .dd-spark::after { transform: translate(-50%, -50%) rotate(90deg); }

        .dd-float {
          position: absolute;
          left: var(--x);
          top: var(--y);
          z-index: 45;
          transform: translate(-50%, -50%);
          color: #fde68a;
          font-size: clamp(22px, 5vw, 46px);
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.06em;
          text-shadow: 0 9px 26px rgba(0,0,0,.48), 0 0 28px rgba(251,191,36,.36);
          pointer-events: none;
          white-space: nowrap;
          animation: ddFloat .98s ease-out forwards;
        }

        .dd-float-pink {
          color: #f5d0fe;
          text-shadow: 0 9px 26px rgba(0,0,0,.48), 0 0 28px rgba(217,70,239,.38);
        }

        .dd-float-green {
          color: #bbf7d0;
          text-shadow: 0 9px 26px rgba(0,0,0,.48), 0 0 28px rgba(34,197,94,.38);
        }

        .dd-impact-amber .dd-space-bg::before { animation: ddImpactGold .76s ease-out; }
        .dd-impact-violet .dd-space-bg::before { animation: ddImpactPink .76s ease-out; }
        .dd-impact-push .dd-space-bg::before { animation: ddImpactGreen .76s ease-out; }

        @keyframes ddAura {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes ddDicePulse {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          42% { transform: translateY(-4px) scale(1.018); filter: brightness(1.08); }
          70% { transform: translateY(2px) scale(.992); filter: brightness(.98); }
        }

        @keyframes ddDiceShadowPulse {
          0%, 100% { transform: translateX(-50%) scale(.96); opacity: .68; }
          45% { transform: translateX(-50%) scale(.84); opacity: .48; }
          76% { transform: translateX(-50%) scale(1.05); opacity: .78; }
        }

        @keyframes ddPipSwap {
          0% { opacity: 0; transform: scale(.72) rotate(-3deg); filter: blur(2px); }
          65% { opacity: 1; transform: scale(1.08) rotate(1deg); filter: blur(0); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
        }

        @keyframes ddBankIn {
          0% { opacity: 0; transform: translateY(-18px) scale(.68) rotate(-22deg); }
          70% { opacity: 1; transform: translateY(3px) scale(1.05) rotate(4deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }

        @keyframes ddSpark {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(.44) rotate(0deg); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(3.2) rotate(36deg); }
        }

        @keyframes ddFloat {
          0% { opacity: 0; transform: translate(-50%, -25%) scale(.74); }
          16% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
          100% { opacity: 0; transform: translate(-50%, -142%) scale(1); }
        }

        @keyframes ddImpactGold {
          0% { box-shadow: 0 0 0 rgba(251,191,36,0); }
          45% { box-shadow: 0 0 90px rgba(251,191,36,.36); }
          100% { box-shadow: 0 0 0 rgba(251,191,36,0); }
        }

        @keyframes ddImpactPink {
          0% { box-shadow: 0 0 0 rgba(217,70,239,0); }
          45% { box-shadow: 0 0 90px rgba(217,70,239,.34); }
          100% { box-shadow: 0 0 0 rgba(217,70,239,0); }
        }

        @keyframes ddImpactGreen {
          0% { box-shadow: 0 0 0 rgba(34,197,94,0); }
          45% { box-shadow: 0 0 90px rgba(34,197,94,.28); }
          100% { box-shadow: 0 0 0 rgba(34,197,94,0); }
        }

        @media (max-height: 720px) {
          .dd-page { padding-top: 6px; padding-bottom: max(82px, calc(env(safe-area-inset-bottom) + 72px)); }
          .dd-hud { min-height: 42px; }
          .dd-turn-name { font-size: clamp(26px, 6vw, 48px); }
          .dd-main { height: min(62vh, 390px); min-height: 238px; }
          .dd-dice-cloud { min-height: clamp(104px, 24vh, 174px); }
          .dd-status { font-size: 10px; }
          .dd-button { padding: 11px 13px; font-size: 10px; }
        }

        @media (max-width: 580px) {
          .dd-page { padding-left: 8px; padding-right: 8px; padding-bottom: max(90px, calc(env(safe-area-inset-bottom) + 80px)); }
          .dd-hud { gap: 5px; }
          .dd-player-name { font-size: 10px; }
          .dd-score-line { gap: 5px; }
          .dd-score-line b { font-size: 15px; }
          .dd-score-dots { gap: 3px; }
          .dd-score-dots i { width: 9px; height: 4px; }
          .dd-round { min-width: 56px; }
          .dd-round strong { font-size: 15px; }
          .dd-round span { font-size: 7px; }
          .dd-banked { top: 58%; width: 24%; }
          .dd-banked-total { font-size: clamp(34px, 11vw, 52px); }
          .dd-banked-label { font-size: 7px; letter-spacing: .12em; }
          .dd-banked-dice { gap: 4px; }
          .dd-main { width: min(76vw, 360px); height: min(62vh, 410px); min-height: 260px; }
          .dd-turn-name { font-size: 30px; }
          .dd-dice-cloud { gap: 7px; }
          .dd-die { width: clamp(52px, 16vw, 68px); height: clamp(52px, 16vw, 68px); }
          .dd-total { font-size: 8px; }
          .dd-total b { font-size: 36px; }
          .dd-actions { grid-template-columns: 1fr; gap: 7px; min-height: 95px; }
          .dd-status { text-align: center; white-space: normal; font-size: 10px; }
          .dd-button-row { justify-content: center; flex-wrap: wrap; }
          .dd-button { padding: 11px 13px; font-size: 9px; }
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

      <div
        className={`dd-space ${
          impact === 'amber'
            ? 'dd-impact-amber'
            : impact === 'violet'
              ? 'dd-impact-violet'
              : impact === 'push'
                ? 'dd-impact-push'
                : ''
        }`}
      >
        <div className="dd-space-bg" />

        <BankedResult player="amber" dice={bankedDice.amber} />
        <BankedResult player="violet" dice={bankedDice.violet} />

        <div className="dd-main">
          <div className="dd-turn">
            <div className="dd-turn-kicker">{phase === 'reveal' || phase === 'gameover' ? 'Вскрытие' : 'Ходит'}</div>
            <div className="dd-turn-name">
              {phase === 'reveal'
                ? roundWinner === 'push'
                  ? 'Ничья'
                  : roundWinner
                    ? `${PLAYERS[roundWinner].name} +1`
                    : 'Сравнение'
                : phase === 'gameover' && matchWinner
                  ? `${PLAYERS[matchWinner].name} WIN`
                  : activeMeta.name}
            </div>
          </div>

          <div className="dd-dice-cloud">
            {activeDice.map((value, index) => (
              <Die
                key={`active-die-${index}`}
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
        </div>

        {sparks.map((spark) => (
          <span
            key={spark.id}
            className={`dd-spark ${spark.tone === 'pink' ? 'dd-spark-pink' : spark.tone === 'green' ? 'dd-spark-green' : ''}`}
            style={cssVars({ '--x': spark.x, '--y': spark.y })}
          />
        ))}

        {floating.map((item) => (
          <span
            key={item.id}
            className={`dd-float ${item.tone === 'pink' ? 'dd-float-pink' : item.tone === 'green' ? 'dd-float-green' : ''}`}
            style={cssVars({ '--x': item.x, '--y': item.y })}
          >
            {item.text}
          </span>
        ))}
      </div>

      <div className="dd-actions">
        <div className="dd-status">{matchWinner ? `${PLAYERS[matchWinner].name} выиграл матч до ${TARGET_SCORE} побед.` : message}</div>

        <div className="dd-button-row">
          {phase === 'decision' && !usedReroll && (
            <button type="button" className="dd-button dd-button-risk" disabled={!canRisk} onClick={rerollSelected}>
              Риск
            </button>
          )}

          <button
            type="button"
            className="dd-button"
            disabled={phase === 'rolling' || phase === 'rerolling' || (phase === 'ready' && !!matchWinner)}
            onClick={handlePrimary}
          >
            {actionLabel}
          </button>

          {phase !== 'gameover' && (
            <button type="button" className="dd-button dd-button-ghost" onClick={resetMatch}>
              Сброс
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const DiceDuel = DiceDuelGame;
export const DiceBattleGame = DiceDuelGame;
export default DiceDuelGame;
