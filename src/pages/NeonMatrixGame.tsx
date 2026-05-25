import React, { useEffect, useMemo, useRef, useState } from 'react';

type Player = 'cyan' | 'magenta';
type Phase = 'pickCyan' | 'handoff' | 'pickMagenta' | 'spinning' | 'impact' | 'result' | 'gameover';

type PickState = Record<Player, number | null>;
type HealthState = Record<Player, number>;

type Particle = {
  id: number;
  x: string;
  y: string;
  angle: number;
  distance: number;
  size: number;
  tone: 'cyan' | 'magenta' | 'gold' | 'green' | 'red';
  delay: number;
};

type RoundOutcome = {
  target: number;
  cyanPick: number;
  magentaPick: number;
  cyanDistance: number;
  magentaDistance: number;
  damage: number;
  attacker: Player | null;
  defender: Player | null;
};

type HapticFeedback = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = {
  HapticFeedback?: HapticFeedback;
};

const START_HP = 100;
const MIN_NUMBER = 1;
const MAX_NUMBER = 100;
const CIRCLE_SIZE = MAX_NUMBER - MIN_NUMBER + 1;
const SPIN_MS = 5000;
const DAMAGE_APPLY_MS = 1600;
const RESULT_SHOW_MS = 3900;

const PLAYERS: Record<
  Player,
  {
    name: string;
    label: string;
    short: string;
    main: string;
    soft: string;
    glow: string;
  }
> = {
  cyan: {
    name: 'Cyan',
    label: 'Игрок 1',
    short: 'P1',
    main: '#22d3ee',
    soft: 'rgba(34, 211, 238, .15)',
    glow: 'rgba(34, 211, 238, .68)',
  },
  magenta: {
    name: 'Magenta',
    label: 'Игрок 2',
    short: 'P2',
    main: '#e879f9',
    soft: 'rgba(232, 121, 249, .15)',
    glow: 'rgba(232, 121, 249, .62)',
  },
};

let lastSelectionHapticAt = 0;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randomNumber = () => MIN_NUMBER + Math.floor(Math.random() * MAX_NUMBER);
const formatHp = (value: number) => Math.max(0, value).toString();

const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const getTg = () => {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
};

const fallbackVibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

const hapticSelect = (force = false) => {
  const now = Date.now();

  if (!force && now - lastSelectionHapticAt < 75) return;

  lastSelectionHapticAt = now;

  getTg()?.HapticFeedback?.selectionChanged?.();
  fallbackVibrate(5);
};

const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  getTg()?.HapticFeedback?.impactOccurred?.(style);

  if (style === 'heavy') {
    fallbackVibrate([30, 24, 38]);
    return;
  }

  if (style === 'medium') {
    fallbackVibrate(18);
    return;
  }

  fallbackVibrate(8);
};

const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  getTg()?.HapticFeedback?.notificationOccurred?.(type);

  if (type === 'error') {
    fallbackVibrate([34, 28, 44]);
    return;
  }

  if (type === 'warning') {
    fallbackVibrate([18, 22, 18]);
    return;
  }

  fallbackVibrate([12, 18, 12]);
};

const circularDistance = (a: number, b: number) => {
  const direct = Math.abs(a - b);
  const circular = CIRCLE_SIZE - direct;
  return Math.min(direct, circular);
};

const numberToAngle = (value: number) => {
  return ((value - MIN_NUMBER) / (MAX_NUMBER - MIN_NUMBER)) * 360;
};

const getSpinAngle = (currentAngle: number, targetNumber: number) => {
  const normalized = ((currentAngle % 360) + 360) % 360;
  const targetAngle = numberToAngle(targetNumber);
  const delta = (targetAngle - normalized + 360) % 360;
  const fullSpins = 7 * 360;

  return currentAngle + fullSpins + delta;
};

const getRoundOutcome = (target: number, picks: PickState): RoundOutcome | null => {
  if (picks.cyan === null || picks.magenta === null) return null;

  const cyanDistance = circularDistance(picks.cyan, target);
  const magentaDistance = circularDistance(picks.magenta, target);
  const damage = Math.abs(cyanDistance - magentaDistance);

  if (damage === 0) {
    return {
      target,
      cyanPick: picks.cyan,
      magentaPick: picks.magenta,
      cyanDistance,
      magentaDistance,
      damage: 0,
      attacker: null,
      defender: null,
    };
  }

  const attacker: Player = cyanDistance < magentaDistance ? 'cyan' : 'magenta';
  const defender: Player = attacker === 'cyan' ? 'magenta' : 'cyan';

  return {
    target,
    cyanPick: picks.cyan,
    magentaPick: picks.magenta,
    cyanDistance,
    magentaDistance,
    damage,
    attacker,
    defender,
  };
};

const HealthBar = ({
  player,
  hp,
  active,
  damaged,
  damage,
}: {
  player: Player;
  hp: number;
  active: boolean;
  damaged: boolean;
  damage: number;
}) => {
  const meta = PLAYERS[player];
  const percent = clamp((hp / START_HP) * 100, 0, 100);

  return (
    <div
      className={`rd-health rd-health-${player} ${active ? 'rd-health-active' : ''} ${
        damaged ? 'rd-health-damaged' : ''
      }`}
      style={cssVars({
        '--player': meta.main,
        '--player-soft': meta.soft,
        '--player-glow': meta.glow,
        '--hp': `${percent}%`,
      })}
    >
      <div className="rd-health-head">
        <span>{meta.short}</span>
        <b>{formatHp(hp)}</b>
      </div>

      <div className="rd-health-track">
        <i />
      </div>

      {damaged && damage > 0 && <em>-{damage}</em>}
    </div>
  );
};

const TopHud = ({
  health,
  round,
  activePlayer,
  phase,
  outcome,
}: {
  health: HealthState;
  round: number;
  activePlayer: Player;
  phase: Phase;
  outcome: RoundOutcome | null;
}) => {
  const damagedPlayer = phase === 'impact' || phase === 'result' ? outcome?.defender ?? null : null;
  const canPick = phase === 'pickCyan' || phase === 'pickMagenta';

  return (
    <div className="rd-top">
      <HealthBar
        player="cyan"
        hp={health.cyan}
        active={activePlayer === 'cyan' && canPick}
        damaged={damagedPlayer === 'cyan'}
        damage={outcome?.damage ?? 0}
      />

      <div className="rd-round">
        <span>R</span>
        <b>{round}</b>
      </div>

      <HealthBar
        player="magenta"
        hp={health.magenta}
        active={activePlayer === 'magenta' && canPick}
        damaged={damagedPlayer === 'magenta'}
        damage={outcome?.damage ?? 0}
      />
    </div>
  );
};

const Wheel = ({
  angle,
  displayNumber,
  phase,
  target,
  picks,
  outcome,
  showPicks,
}: {
  angle: number;
  displayNumber: number;
  phase: Phase;
  target: number | null;
  picks: PickState;
  outcome: RoundOutcome | null;
  showPicks: boolean;
}) => {
  const labels = useMemo(() => [1, 25, 50, 75, 100], []);
  const showDistances = phase === 'impact' || phase === 'result' || phase === 'gameover';

  return (
    <div className={`rd-wheel rd-wheel-${phase}`}>
      <div className="rd-wheel-orb" />
      <div className="rd-wheel-aura" />
      <div className="rd-wheel-surface" />
      <div className="rd-wheel-glass" />

      <div className="rd-marks">
        {Array.from({ length: 100 }).map((_, index) => (
          <i
            key={index}
            className={index % 10 === 0 ? 'rd-mark-major' : index % 5 === 0 ? 'rd-mark-mid' : ''}
            style={cssVars({ '--a': `${index * 3.6}deg` })}
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
          <span>
            <b>P1</b>
            {showDistances && outcome && <em>Δ{outcome.cyanDistance}</em>}
          </span>
        </div>
      )}

      {showPicks && picks.magenta !== null && (
        <div
          className="rd-bet rd-bet-magenta"
          style={cssVars({ '--a': `${numberToAngle(picks.magenta)}deg` })}
        >
          <span>
            <b>P2</b>
            {showDistances && outcome && <em>Δ{outcome.magentaDistance}</em>}
          </span>
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

      {phase === 'impact' && outcome && (
        <div className={`rd-clash ${outcome.defender ? `rd-clash-to-${outcome.defender}` : ''}`}>
          <div className="rd-clash-value rd-clash-cyan">
            <small>P1</small>
            <span>{outcome.cyanDistance}</span>
          </div>

          <div className="rd-clash-core">
            <small>hit</small>
            <b>{outcome.damage}</b>
          </div>

          <div className="rd-clash-value rd-clash-magenta">
            <small>P2</small>
            <span>{outcome.magentaDistance}</span>
          </div>
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
        <small>
          {phase === 'spinning'
            ? 'rolling'
            : target !== null
              ? 'final'
              : 'pick'}
        </small>
        <strong>{phase === 'spinning' ? '•••' : target ?? displayNumber}</strong>
      </div>
    </div>
  );
};

const PickPreview = ({
  picks,
  target,
  hiddenCyan,
  hiddenMagenta,
  outcome,
  phase,
}: {
  picks: PickState;
  target: number | null;
  hiddenCyan: boolean;
  hiddenMagenta: boolean;
  outcome: RoundOutcome | null;
  phase: Phase;
}) => {
  const showDistances = phase === 'impact' || phase === 'result' || phase === 'gameover';

  return (
    <div className="rd-picks">
      <div className="rd-pick rd-pick-cyan">
        <span>P1</span>
        <b>{hiddenCyan ? '??' : picks.cyan ?? '—'}</b>
        {showDistances && outcome && <small>Δ{outcome.cyanDistance}</small>}
      </div>

      <div className="rd-pick rd-pick-final">
        <span>Final</span>
        <b>{target ?? '—'}</b>
      </div>

      <div className="rd-pick rd-pick-magenta">
        <span>P2</span>
        <b>{hiddenMagenta ? '??' : picks.magenta ?? '—'}</b>
        {showDistances && outcome && <small>Δ{outcome.magentaDistance}</small>}
      </div>
    </div>
  );
};

const NumberPicker = ({
  value,
  activePlayer,
  onChange,
}: {
  value: number;
  activePlayer: Player;
  onChange: (value: number) => void;
}) => {
  const meta = PLAYERS[activePlayer];
  const percent = ((value - MIN_NUMBER) / (MAX_NUMBER - MIN_NUMBER)) * 100;

  return (
    <div
      className="rd-picker"
      style={cssVars({
        '--player': meta.main,
        '--player-soft': meta.soft,
        '--player-glow': meta.glow,
        '--value': `${percent}%`,
      })}
    >
      <div className="rd-picker-value">
        <span>{meta.short}</span>
        <b>{value}</b>
      </div>

      <div className="rd-slider-row">
        <div className="rd-slider-track">
          <div className="rd-slider-fill" />
          <div className="rd-slider-thumb">
            <i>{value}</i>
          </div>
        </div>

        <input
          type="range"
          min={MIN_NUMBER}
          max={MAX_NUMBER}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="rd-slider"
        />
      </div>
    </div>
  );
};

export const NeonMatrixGame: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('pickCyan');
  const [health, setHealth] = useState<HealthState>({ cyan: START_HP, magenta: START_HP });
  const [round, setRound] = useState(1);
  const [draftValue, setDraftValue] = useState(50);
  const [picks, setPicks] = useState<PickState>({ cyan: null, magenta: null });
  const [target, setTarget] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [arrowAngle, setArrowAngle] = useState(numberToAngle(50));
  const [message, setMessage] = useState('Выбери число ближе к финалу.');
  const [particles, setParticles] = useState<Particle[]>([]);

  const timersRef = useRef<number[]>([]);

  const activePlayer: Player = phase === 'pickMagenta' ? 'magenta' : 'cyan';
  const handoffPlayer: Player = picks.cyan === null ? 'cyan' : 'magenta';
  const canPick = phase === 'pickCyan' || phase === 'pickMagenta';

  const matchWinner: Player | null =
    health.cyan <= 0 ? 'magenta' : health.magenta <= 0 ? 'cyan' : null;

  const showWheelPicks =
    phase === 'spinning' || phase === 'impact' || phase === 'result' || phase === 'gameover';

  const resultText = useMemo(() => {
    if (!outcome) return '';

    if (outcome.damage === 0) {
      return `Одинаково близко: Δ${outcome.cyanDistance}. Урона нет.`;
    }

    const attacker = PLAYERS[outcome.attacker!].short;
    const defender = PLAYERS[outcome.defender!].short;

    return `${attacker} ближе. ${defender} получает -${outcome.damage} HP.`;
  }, [outcome]);

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
      distance: 42 + Math.random() * 86,
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
    hapticSelect();
  };

  const finishRound = (finalTarget: number, finalPicks: PickState) => {
    const nextOutcome = getRoundOutcome(finalTarget, finalPicks);

    if (!nextOutcome) return;

    setTarget(finalTarget);
    setOutcome(nextOutcome);
    setPhase('impact');

    hapticImpact('heavy');

    if (nextOutcome.damage === 0) {
      setMessage('Одинаковая дистанция. Урона нет.');
      burst('green', '50%', '43%', 24);
      hapticNotify('success');

      schedule(() => {
        setPhase('result');
      }, RESULT_SHOW_MS);

      return;
    }

    const nextHealth: HealthState = {
      ...health,
      [nextOutcome.defender!]: clamp(health[nextOutcome.defender!] - nextOutcome.damage, 0, START_HP),
    };

    setMessage(`${PLAYERS[nextOutcome.attacker!].short} ближе. Урон ${nextOutcome.damage} HP.`);

    schedule(() => {
      hapticImpact('heavy');
    }, 860);

    schedule(() => {
      setHealth(nextHealth);
      hapticNotify(nextHealth.cyan <= 0 || nextHealth.magenta <= 0 ? 'error' : 'warning');
      burst(nextOutcome.defender === 'cyan' ? 'magenta' : 'cyan', nextOutcome.defender === 'cyan' ? '24%' : '76%', '12%', 20);
      burst('red', nextOutcome.defender === 'cyan' ? '22%' : '78%', '14%', 18);
    }, DAMAGE_APPLY_MS);

    schedule(() => {
      if (nextHealth.cyan <= 0 || nextHealth.magenta <= 0) {
        setPhase('gameover');
        setMessage(`${nextHealth.cyan <= 0 ? 'P2' : 'P1'} выиграл матч.`);
        hapticNotify('success');
        return;
      }

      setPhase('result');
    }, RESULT_SHOW_MS);
  };

  const startSpin = (finalPicks: PickState) => {
    clearTimers();

    const finalTarget = randomNumber();

    setTarget(null);
    setOutcome(null);
    setPhase('spinning');
    setMessage('Рулетка крутится...');
    burst('gold', '50%', '43%', 12);
    hapticImpact('medium');

    schedule(() => {
      setArrowAngle((current) => getSpinAngle(current, finalTarget));
    }, 60);

    schedule(() => {
      burst('gold', '50%', '43%', 32);
      hapticImpact('heavy');
      finishRound(finalTarget, finalPicks);
    }, SPIN_MS + 160);
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
    hapticImpact('medium');

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
    setOutcome(null);
    setPhase(nextPlayer === 'cyan' ? 'pickCyan' : 'pickMagenta');
    setMessage(`${PLAYERS[nextPlayer].label} выбирает число.`);
    hapticSelect(true);
  };

  const nextRound = () => {
    clearTimers();

    const starter: Player = round % 2 === 1 ? 'magenta' : 'cyan';

    setRound((value) => value + 1);
    setDraftValue(50);
    setPicks({ cyan: null, magenta: null });
    setTarget(null);
    setOutcome(null);
    setArrowAngle(numberToAngle(50));
    setPhase(starter === 'cyan' ? 'pickCyan' : 'pickMagenta');
    setMessage(`${PLAYERS[starter].label} выбирает число.`);
    hapticSelect(true);
  };

  const resetMatch = () => {
    clearTimers();

    setPhase('pickCyan');
    setHealth({ cyan: START_HP, magenta: START_HP });
    setRound(1);
    setDraftValue(50);
    setPicks({ cyan: null, magenta: null });
    setTarget(null);
    setOutcome(null);
    setArrowAngle(numberToAngle(50));
    setMessage('Выбери число ближе к финалу.');
    setParticles([]);
    hapticSelect(true);
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
            : phase === 'impact'
              ? 'Удар'
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
      : phase === 'impact'
        ? 'Impact'
        : phase === 'result'
          ? 'Damage'
          : 'Duel';

  return (
    <div className={`rd-page rd-${phase}`}>
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
          padding: 7px 7px max(7px, env(safe-area-inset-bottom));
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
            radial-gradient(circle at 50% 10%, rgba(255,255,255,.08), transparent 27%),
            radial-gradient(circle at 18% 46%, rgba(34,211,238,.16), transparent 34%),
            radial-gradient(circle at 84% 44%, rgba(232,121,249,.15), transparent 34%),
            linear-gradient(145deg, #020617 0%, #070b18 48%, #12051b 100%);
        }

        .rd-page * {
          box-sizing: border-box;
        }

        .rd-page::before {
          content: "";
          position: absolute;
          inset: -35%;
          z-index: -2;
          opacity: .20;
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
            linear-gradient(180deg, rgba(0,0,0,.08), transparent 40%, rgba(0,0,0,.30));
        }

        .rd-top {
          position: relative;
          z-index: 25;
          display: grid;
          grid-template-columns: 1fr 42px 1fr;
          align-items: center;
          gap: 5px;
          min-height: 42px;
        }

        .rd-health {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border-radius: 17px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at 50% 0%, var(--player-soft), transparent 70%),
            rgba(255,255,255,.050);
          padding: 6px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.09),
            0 14px 38px rgba(0,0,0,.25);
          backdrop-filter: blur(18px);
        }

        .rd-health-active {
          border-color: rgba(255,255,255,.16);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 0 28px var(--player-soft);
        }

        .rd-health-head {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 5px;
        }

        .rd-health-head span {
          color: rgba(255,255,255,.48);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .rd-health-head b {
          color: white;
          font-size: 15px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.06em;
        }

        .rd-health-track {
          position: relative;
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(0,0,0,.34);
          box-shadow: inset 0 1px 3px rgba(0,0,0,.65);
        }

        .rd-health-track i {
          position: absolute;
          inset: 0 auto 0 0;
          width: var(--hp);
          border-radius: inherit;
          background:
            linear-gradient(90deg, var(--player), #ffffff);
          box-shadow: 0 0 18px var(--player-glow);
          transition: width 1.85s cubic-bezier(.16, 1, .22, 1);
        }

        .rd-health-magenta .rd-health-track i {
          left: auto;
          right: 0;
          background:
            linear-gradient(270deg, var(--player), #ffffff);
        }

        .rd-health em {
          position: absolute;
          z-index: 4;
          right: 8px;
          top: 5px;
          color: #fecaca;
          font-size: 14px;
          line-height: 1;
          font-style: normal;
          font-weight: 1000;
          text-shadow: 0 0 18px rgba(248,113,113,.8);
          animation: rdDamagePop 1.55s ease both;
        }

        .rd-health-cyan em {
          right: auto;
          left: 8px;
        }

        .rd-health-damaged {
          animation: rdHealthHit 1.15s ease both;
        }

        .rd-round {
          height: 40px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 2px;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.065);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.10),
            0 14px 36px rgba(0,0,0,.28);
          backdrop-filter: blur(18px);
        }

        .rd-round span {
          color: rgba(255,255,255,.42);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .rd-round b {
          color: white;
          font-size: 16px;
          line-height: .9;
          font-weight: 1000;
        }

        .rd-main {
          position: relative;
          z-index: 10;
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          align-items: center;
          justify-items: center;
          gap: 2px;
        }

        .rd-title {
          text-align: center;
          transform: translateY(1px);
        }

        .rd-title small {
          display: block;
          color: rgba(255,255,255,.34);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .22em;
          text-transform: uppercase;
        }

        .rd-title h1 {
          margin: 3px 0 0;
          font-size: clamp(23px, 5.4vw, 38px);
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
          width: min(87vw, 448px);
          height: min(87vw, 448px);
          max-width: min(57vh, 448px);
          max-height: min(57vh, 448px);
          min-width: 286px;
          min-height: 286px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          filter: drop-shadow(0 30px 70px rgba(0,0,0,.46));
        }

        .rd-pickCyan .rd-wheel,
        .rd-pickMagenta .rd-wheel {
          width: min(84vw, 420px);
          height: min(84vw, 420px);
          max-width: min(50vh, 420px);
          max-height: min(50vh, 420px);
        }

        .rd-wheel-orb {
          position: absolute;
          inset: -9%;
          border-radius: inherit;
          opacity: .78;
          background:
            radial-gradient(circle at 34% 32%, rgba(34,211,238,.18), transparent 34%),
            radial-gradient(circle at 70% 68%, rgba(232,121,249,.18), transparent 35%);
          filter: blur(11px);
          animation: rdOrbFloat 4.8s ease-in-out infinite alternate;
        }

        .rd-wheel-aura {
          position: absolute;
          inset: -3%;
          border-radius: inherit;
          background:
            conic-gradient(
              from 0deg,
              rgba(34,211,238,.0),
              rgba(34,211,238,.18),
              rgba(255,255,255,.04),
              rgba(232,121,249,.18),
              rgba(34,211,238,.0)
            );
          filter: blur(9px);
          opacity: .64;
          animation: rdAuraSlow 12s linear infinite;
        }

        .rd-wheel-surface {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.15);
          background:
            radial-gradient(circle at 50% 42%, rgba(255,255,255,.18), rgba(255,255,255,.045) 35%, rgba(255,255,255,.018) 63%, rgba(0,0,0,.25) 100%),
            repeating-conic-gradient(
              from 0deg,
              rgba(255,255,255,.055) 0deg,
              rgba(255,255,255,.055) 1deg,
              transparent 1deg,
              transparent 3.6deg
            ),
            conic-gradient(
              from 0deg,
              rgba(34,211,238,.22),
              rgba(255,255,255,.045),
              rgba(232,121,249,.21),
              rgba(255,255,255,.045),
              rgba(34,211,238,.22)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.19),
            inset 0 -42px 70px rgba(0,0,0,.30),
            0 0 82px rgba(34,211,238,.10);
        }

        .rd-wheel-glass {
          position: absolute;
          inset: 9%;
          border-radius: inherit;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,.09), transparent 32%),
            radial-gradient(circle at 50% 80%, rgba(0,0,0,.24), transparent 46%);
          border: 1px solid rgba(255,255,255,.045);
        }

        .rd-spinning .rd-wheel-surface {
          animation: rdWheelGlow 1s ease-in-out infinite alternate;
        }

        .rd-impact .rd-wheel-surface {
          animation: rdImpactGlow 1.45s ease-in-out both;
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

        .rd-marks .rd-mark-mid {
          height: 11px;
          background: rgba(255,255,255,.28);
        }

        .rd-marks .rd-mark-major {
          width: 3px;
          height: 16px;
          background: rgba(255,255,255,.54);
          box-shadow: 0 0 14px rgba(255,255,255,.18);
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
          top: 7.5%;
          min-width: 30px;
          min-height: 30px;
          display: grid;
          place-items: center;
          gap: 1px;
          transform: translate(-50%, -50%) rotate(calc(-1 * var(--a)));
          border-radius: 999px;
          padding: 4px 6px;
          color: #020617;
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.02em;
          box-shadow:
            0 0 0 4px rgba(255,255,255,.08),
            0 0 26px currentColor;
        }

        .rd-bet span b {
          font-size: 9px;
          line-height: 1;
        }

        .rd-bet span em {
          font-size: 8px;
          line-height: 1;
          font-style: normal;
          opacity: .8;
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
          min-width: 36px;
          height: 36px;
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
            0 0 26px rgba(251,191,36,.72),
            0 0 54px rgba(251,191,36,.36);
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
            drop-shadow(0 0 12px rgba(251,191,36,.9))
            drop-shadow(0 0 30px rgba(251,191,36,.44));
        }

        .rd-center {
          position: relative;
          z-index: 9;
          width: 38%;
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
          font-size: clamp(42px, 10.5vw, 70px);
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.09em;
        }

        .rd-clash {
          position: absolute;
          inset: 0;
          z-index: 30;
          display: grid;
          place-items: center;
          pointer-events: none;
        }

        .rd-clash-value {
          position: absolute;
          top: 50%;
          width: 72px;
          height: 72px;
          display: grid;
          place-items: center;
          align-content: center;
          border-radius: 25px;
          border: 1px solid rgba(255,255,255,.14);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.20), transparent 70%),
            rgba(5,8,18,.82);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.13),
            0 20px 60px rgba(0,0,0,.44);
          backdrop-filter: blur(18px);
        }

        .rd-clash-value small {
          color: rgba(255,255,255,.42);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .16em;
        }

        .rd-clash-value span {
          margin-top: 6px;
          font-size: 35px;
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.08em;
        }

        .rd-clash-cyan {
          color: #a5f3fc;
          animation: rdClashCyan 1.34s cubic-bezier(.2,.9,.2,1) both;
        }

        .rd-clash-magenta {
          color: #f5d0fe;
          animation: rdClashMagenta 1.34s cubic-bezier(.2,.9,.2,1) both;
        }

        .rd-clash-core {
          position: relative;
          width: 102px;
          height: 102px;
          display: grid;
          place-items: center;
          align-content: center;
          border-radius: 34px;
          border: 1px solid rgba(255,255,255,.15);
          background:
            radial-gradient(circle at 50% 0%, rgba(248,113,113,.25), transparent 70%),
            rgba(5,8,18,.90);
          box-shadow:
            0 0 58px rgba(248,113,113,.30),
            inset 0 1px 0 rgba(255,255,255,.13);
          opacity: 0;
          transform: scale(.78);
          animation: rdClashCore 1.14s ease .82s both;
          backdrop-filter: blur(18px);
        }

        .rd-clash-core::before {
          content: "";
          position: absolute;
          inset: -18px;
          border-radius: inherit;
          background:
            radial-gradient(circle, rgba(248,113,113,.22), transparent 64%);
          animation: rdShockwave 1.18s ease .82s both;
        }

        .rd-clash-core small {
          position: relative;
          z-index: 2;
          color: rgba(255,255,255,.45);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .rd-clash-core b {
          position: relative;
          z-index: 2;
          margin-top: 6px;
          color: #fecaca;
          font-size: 44px;
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.08em;
          text-shadow: 0 0 24px rgba(248,113,113,.72);
        }

        .rd-clash-to-cyan .rd-clash-core::after,
        .rd-clash-to-magenta .rd-clash-core::after {
          content: "";
          position: absolute;
          z-index: 3;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: #fb7185;
          box-shadow:
            0 0 24px rgba(248,113,113,.92),
            0 0 58px rgba(248,113,113,.42);
          animation: rdDamageFlyCyan 1.28s ease 1.22s both;
        }

        .rd-clash-to-magenta .rd-clash-core::after {
          animation-name: rdDamageFlyMagenta;
        }

        .rd-picks {
          width: min(100%, 338px);
          display: grid;
          grid-template-columns: 1fr .82fr 1fr;
          gap: 5px;
          transform: translateY(-2px);
        }

        .rd-pick {
          min-height: 29px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.052);
          backdrop-filter: blur(14px);
          padding: 0 7px;
        }

        .rd-pick span {
          color: rgba(255,255,255,.38);
          font-size: 7px;
          font-weight: 1000;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .rd-pick b {
          font-size: 14px;
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

        .rd-pick-final b {
          color: #fde68a;
        }

        .rd-bottom {
          position: relative;
          z-index: 20;
          display: grid;
          gap: 5px;
        }

        .rd-message {
          min-height: 12px;
          text-align: center;
          color: rgba(255,255,255,.58);
          font-size: 9px;
          line-height: 1.15;
          font-weight: 800;
          text-shadow: 0 8px 22px rgba(0,0,0,.38);
        }

        .rd-picker {
          display: grid;
          grid-template-columns: 62px minmax(0, 1fr);
          align-items: center;
          gap: 9px;
          min-height: 54px;
          padding: 8px 10px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at var(--value) 0%, var(--player-soft), transparent 48%),
            rgba(255,255,255,.055);
          box-shadow:
            0 14px 38px rgba(0,0,0,.24),
            inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter: blur(18px);
        }

        .rd-picker-value {
          min-width: 0;
          display: grid;
          align-content: center;
          gap: 3px;
        }

        .rd-picker-value span {
          color: rgba(255,255,255,.42);
          font-size: 7px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .rd-picker-value b {
          color: white;
          font-size: 30px;
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.08em;
          text-shadow: 0 0 22px var(--player-glow);
        }

        .rd-slider-row {
          position: relative;
          height: 36px;
          display: grid;
          align-items: center;
        }

        .rd-slider-track {
          position: absolute;
          left: 8px;
          right: 8px;
          top: 50%;
          height: 9px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: rgba(0,0,0,.34);
          box-shadow:
            inset 0 1px 3px rgba(0,0,0,.55),
            0 0 0 1px rgba(255,255,255,.05);
        }

        .rd-slider-fill {
          position: absolute;
          inset: 0 auto 0 0;
          width: var(--value);
          border-radius: inherit;
          background: linear-gradient(90deg, #22d3ee, #a855f7, #ec4899);
          box-shadow: 0 0 20px rgba(168,85,247,.40);
        }

        .rd-slider-thumb {
          position: absolute;
          left: var(--value);
          top: 50%;
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: white;
          box-shadow:
            0 0 0 7px rgba(255,255,255,.08),
            0 0 34px var(--player-glow);
        }

        .rd-slider-thumb i {
          color: #020617;
          font-size: 8px;
          line-height: 1;
          font-style: normal;
          font-weight: 1000;
        }

        .rd-slider {
          position: relative;
          z-index: 4;
          width: 100%;
          height: 36px;
          opacity: 0;
          cursor: pointer;
        }

        .rd-button {
          border: 0;
          width: 100%;
          min-height: 42px;
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
          letter-spacing: .11em;
          white-space: nowrap;
        }

        .rd-button:active {
          transform: scale(.97);
        }

        .rd-button:disabled {
          opacity: .45;
          filter: grayscale(1);
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
            rgba(5, 8, 18, .90);
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

        .rd-particle-red {
          color: #fecaca;
        }

        @keyframes rdAura {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes rdAuraSlow {
          from { transform: rotate(0deg) scale(.98); }
          to { transform: rotate(360deg) scale(1.02); }
        }

        @keyframes rdOrbFloat {
          from {
            transform: rotate(-8deg) scale(.98);
          }
          to {
            transform: rotate(8deg) scale(1.02);
          }
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
              0 0 98px rgba(251,191,36,.20);
          }
        }

        @keyframes rdImpactGlow {
          0%, 100% {
            filter: brightness(1);
          }
          45% {
            filter: brightness(1.24);
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

        @keyframes rdClashCyan {
          0% {
            opacity: 0;
            transform: translate(-150%, -50%) scale(.78) rotate(-4deg);
            filter: blur(10px);
          }
          25% {
            opacity: 1;
            filter: blur(0);
          }
          70% {
            opacity: 1;
            transform: translate(-60%, -50%) scale(1.04) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate(-20%, -50%) scale(.82) rotate(3deg);
          }
        }

        @keyframes rdClashMagenta {
          0% {
            opacity: 0;
            transform: translate(150%, -50%) scale(.78) rotate(4deg);
            filter: blur(10px);
          }
          25% {
            opacity: 1;
            filter: blur(0);
          }
          70% {
            opacity: 1;
            transform: translate(60%, -50%) scale(1.04) rotate(0deg);
          }
          100% {
            opacity: 0;
            transform: translate(20%, -50%) scale(.82) rotate(-3deg);
          }
        }

        @keyframes rdClashCore {
          0% {
            opacity: 0;
            transform: scale(.72);
            filter: blur(8px);
          }
          44%, 78% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(.88);
          }
        }

        @keyframes rdShockwave {
          0% {
            opacity: 0;
            transform: scale(.45);
          }
          35% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: scale(1.65);
          }
        }

        @keyframes rdDamageFlyCyan {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(.6);
          }
          15% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-42vw, -43vh) scale(.2);
          }
        }

        @keyframes rdDamageFlyMagenta {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(.6);
          }
          15% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(42vw, -43vh) scale(.2);
          }
        }

        @keyframes rdHealthHit {
          0%, 100% {
            transform: translateX(0);
            filter: brightness(1);
          }
          14% {
            transform: translateX(-2px);
            filter: brightness(1.34);
          }
          28% {
            transform: translateX(2px);
          }
          42% {
            transform: translateX(-1px);
          }
          56% {
            transform: translateX(1px);
          }
        }

        @keyframes rdDamagePop {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(.8);
          }
          22% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-18px) scale(.9);
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
            min-height: 39px;
          }

          .rd-health {
            padding: 6px;
            border-radius: 15px;
          }

          .rd-health-head {
            margin-bottom: 4px;
          }

          .rd-health-head b {
            font-size: 14px;
          }

          .rd-round {
            height: 37px;
            border-radius: 14px;
          }

          .rd-title h1 {
            font-size: clamp(22px, 5.2vw, 34px);
          }

          .rd-title small {
            font-size: 6.5px;
          }

          .rd-wheel {
            min-width: 270px;
            min-height: 270px;
            width: min(82vw, 382px);
            height: min(82vw, 382px);
            max-width: min(51vh, 382px);
            max-height: min(51vh, 382px);
          }

          .rd-pickCyan .rd-wheel,
          .rd-pickMagenta .rd-wheel {
            width: min(80vw, 360px);
            height: min(80vw, 360px);
            max-width: min(47vh, 360px);
            max-height: min(47vh, 360px);
          }

          .rd-center strong {
            font-size: clamp(37px, 10vw, 62px);
          }

          .rd-picks {
            transform: translateY(-1px);
          }

          .rd-pick {
            min-height: 27px;
          }

          .rd-picker {
            min-height: 50px;
            padding: 7px 9px;
            border-radius: 20px;
            grid-template-columns: 58px minmax(0, 1fr);
          }

          .rd-picker-value b {
            font-size: 27px;
          }

          .rd-button {
            min-height: 39px;
          }
        }

        @media (max-width: 520px) {
          .rd-wheel {
            min-width: 282px;
            min-height: 282px;
            width: min(85vw, 354px);
            height: min(85vw, 354px);
          }

          .rd-pickCyan .rd-wheel,
          .rd-pickMagenta .rd-wheel {
            min-width: 274px;
            min-height: 274px;
            width: min(82vw, 342px);
            height: min(82vw, 342px);
          }

          .rd-marks i {
            transform:
              rotate(var(--a))
              translateY(calc(-1 * min(42vw, 160px)))
              translateX(-50%);
          }

          .rd-center strong {
            font-size: 44px;
          }
        }
      `}</style>

      <TopHud
        health={health}
        round={round}
        activePlayer={activePlayer}
        phase={phase}
        outcome={outcome}
      />

      <main className="rd-main">
        <div className="rd-title">
          <small>
            {phase === 'spinning'
              ? 'roulette'
              : phase === 'impact'
                ? 'distance clash'
                : phase === 'result'
                  ? 'round result'
                  : phase === 'gameover'
                    ? 'match'
                    : phase === 'handoff'
                      ? 'secret pick'
                      : PLAYERS[activePlayer].label}
          </small>
          <h1>{title}</h1>
        </div>

        <Wheel
          angle={arrowAngle}
          displayNumber={draftValue}
          phase={phase}
          target={target}
          picks={picks}
          outcome={outcome}
          showPicks={showWheelPicks}
        />

        <PickPreview
          picks={picks}
          target={target}
          hiddenCyan={hiddenCyan}
          hiddenMagenta={hiddenMagenta}
          outcome={outcome}
          phase={phase}
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
              Финальное здоровье: P1 {formatHp(health.cyan)} HP · P2 {formatHp(health.magenta)} HP.
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
                    : particle.tone === 'red'
                      ? 'rd-particle-red'
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
          <NumberPicker
            value={draftValue}
            activePlayer={activePlayer}
            onChange={changeDraft}
          />
        )}

        <button
          type="button"
          className="rd-button"
          onClick={handlePrimary}
          disabled={phase === 'spinning' || phase === 'impact'}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
};

export const NeonMatrix = NeonMatrixGame;
export const NumberMatrixGame = NeonMatrixGame;
export default NeonMatrixGame;