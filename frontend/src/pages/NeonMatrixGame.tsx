import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLobbyMatchFinish } from '../hooks/useLobbyMatchFinish';

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
const PARTICLE_LIMIT = 32;
const WHEEL_MARKS = Array.from({ length: 60 }, (_, index) => ({
  index,
  angle: index * 6,
  className: index % 6 === 0 ? 'rd-mark-major' : index % 3 === 0 ? 'rd-mark-mid' : '',
}));
const WHEEL_LABELS = [1, 25, 50, 75, 100] as const;

/* P1 = mint, P2 = rose. Target / action accent = gold. Internal keys stay 'cyan'/'magenta'. */
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
    name: 'Blue',
    label: 'Игрок 1',
    short: 'P1',
    main: '#2F8CFF',
    soft: 'rgba(47, 140, 255, .15)',
    glow: 'rgba(91, 183, 255, .58)',
  },
  magenta: {
    name: 'Orange',
    label: 'Игрок 2',
    short: 'P2',
    main: '#FF8F2D',
    soft: 'rgba(255, 143, 45, .15)',
    glow: 'rgba(255, 143, 45, .55)',
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
        <span>Round</span>
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
  const showDistances = phase === 'impact' || phase === 'result' || phase === 'gameover';

  return (
    <div className={`rd-wheel rd-wheel-${phase}`}>
      <div className="rd-wheel-orb" />
      <div className="rd-wheel-aura" />
      <div className="rd-wheel-surface" />
      <div className="rd-wheel-glass" />

      <div className="rd-marks">
        {WHEEL_MARKS.map((mark) => (
          <i
            key={mark.index}
            className={mark.className}
            style={cssVars({ '--a': `${mark.angle}deg` })}
          />
        ))}
      </div>

      <div className="rd-labels">
        {WHEEL_LABELS.map((label) => {
          const angleDeg = numberToAngle(label);
          const rad = (angleDeg - 90) * (Math.PI / 180);
          const x = 50 + Math.cos(rad) * 36;
          const y = 50 + Math.sin(rad) * 36;

          return (
            <span key={label} style={{ left: `${x}%`, top: `${y}%` }}>
              {label}
            </span>
          );
        })}
      </div>

      {showPicks && picks.cyan !== null && (
        <div className="rd-bet rd-bet-cyan" style={cssVars({ '--a': `${numberToAngle(picks.cyan)}deg` })}>
          <span>
            <b>P1</b>
            {showDistances && outcome && <em>Δ{outcome.cyanDistance}</em>}
          </span>
        </div>
      )}

      {showPicks && picks.magenta !== null && (
        <div className="rd-bet rd-bet-magenta" style={cssVars({ '--a': `${numberToAngle(picks.magenta)}deg` })}>
          <span>
            <b>P2</b>
            {showDistances && outcome && <em>Δ{outcome.magentaDistance}</em>}
          </span>
        </div>
      )}

      {target !== null && (
        <div className="rd-bet rd-bet-target" style={cssVars({ '--a': `${numberToAngle(target)}deg` })}>
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
        <small>{phase === 'spinning' ? 'rolling' : target !== null ? 'final' : 'pick'}</small>
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
        <b>{hiddenCyan ? '••' : picks.cyan ?? '—'}</b>
        {showDistances && outcome && <small>Δ{outcome.cyanDistance}</small>}
      </div>

      <div className="rd-pick rd-pick-final">
        <span>Final</span>
        <b>{target ?? '—'}</b>
      </div>

      <div className="rd-pick rd-pick-magenta">
        <span>P2</span>
        <b>{hiddenMagenta ? '••' : picks.magenta ?? '—'}</b>
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextValue = MIN_NUMBER + Math.round(ratio * (MAX_NUMBER - MIN_NUMBER));

    onChange(nextValue);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;

    draggingRef.current = false;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

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
        <div ref={trackRef} className="rd-slider-track">
          <div className="rd-slider-fill" />
          <div className="rd-slider-thumb">
            <i>{value}</i>
          </div>
        </div>

        <div
          className="rd-slider-hit"
          role="slider"
          tabIndex={0}
          aria-valuemin={MIN_NUMBER}
          aria-valuemax={MAX_NUMBER}
          aria-valuenow={value}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        />

        <input
          type="range"
          min={MIN_NUMBER}
          max={MAX_NUMBER}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="rd-slider"
          aria-hidden="true"
          tabIndex={-1}
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

  const matchWinner: Player | null = health.cyan <= 0 ? 'magenta' : health.magenta <= 0 ? 'cyan' : null;
  const finishLobbyMatch = useLobbyMatchFinish('neon_matrix');

  useEffect(() => {
    if (phase !== 'gameover' || !matchWinner) return;
    void finishLobbyMatch(matchWinner === 'cyan' ? 'win' : 'loss');
  }, [phase, matchWinner, finishLobbyMatch]);

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
    // Tasteful cap — keeps impact feedback premium instead of noisy.
    const count = Math.max(4, Math.min(amount, 10));

    const items = Array.from({ length: count }, (_, index) => ({
      id: Date.now() + Math.random() + index,
      x,
      y,
      angle: (360 / count) * index + Math.random() * 18,
      distance: 34 + Math.random() * 68,
      size: 2 + Math.random() * 4,
      tone,
      delay: Math.random() * 60,
    }));

    const ids = new Set(items.map((item) => item.id));

    setParticles((prev) => [...prev, ...items].slice(-PARTICLE_LIMIT));

    window.setTimeout(() => {
      setParticles((prev) => prev.filter((item) => !ids.has(item.id)));
    }, 850);
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
      burst('green', '50%', '43%', 18);
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
      burst(nextOutcome.defender === 'cyan' ? 'magenta' : 'cyan', nextOutcome.defender === 'cyan' ? '24%' : '76%', '12%', 16);
      burst('red', nextOutcome.defender === 'cyan' ? '22%' : '78%', '14%', 14);
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
    burst('gold', '50%', '43%', 10);
    hapticImpact('medium');

    schedule(() => {
      setArrowAngle((current) => getSpinAngle(current, finalTarget));
    }, 60);

    schedule(() => {
      burst('gold', '50%', '43%', 16);
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
    burst(player, player === 'cyan' ? '34%' : '66%', '43%', 12);
    hapticImpact('medium');

    const missingPlayer: Player | null =
      nextPicks.cyan === null ? 'cyan' : nextPicks.magenta === null ? 'magenta' : null;

    if (missingPlayer) {
      setPhase('handoff');
      setMessage(`${PLAYERS[player].short} сохранён. Передай телефон ${PLAYERS[missingPlayer].short}.`);
      return;
    }

    // Both picks are in: lock controls immediately so a fast double-tap
    // can't queue a second spin during the 320ms pre-roll.
    setPhase('spinning');
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
          --mint: #5BB7FF;
          --rose: #FF8F2D;
          --gold: #FFC96A;
          --danger: #FF6B6B;
          --bg-primary: #09090d;
          --bg-deep: #050507;
          --line: rgba(255,255,255,.07);
          --line-soft: rgba(255,255,255,.05);

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
          font-family: 'Supercell','Inter',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size: 12px;
          line-height: 1.36;
          -webkit-font-smoothing: antialiased;
          user-select: none;
          isolation: isolate;
          background:
            radial-gradient(circle at 16% -10%, rgba(47,140,255,.13), transparent 34%),
            radial-gradient(circle at 88% -12%, rgba(255,143,45,.12), transparent 32%),
            radial-gradient(circle at 50% 122%, rgba(255,201,106,.06), transparent 52%),
            linear-gradient(180deg, #0d0d12 0%, var(--bg-primary) 54%, var(--bg-deep) 100%);
        }

        .rd-page * { box-sizing: border-box; }

        .rd-top, .rd-main, .rd-bottom, .rd-wheel { contain: layout paint; }

        .rd-page::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 48%, transparent 0 46%, rgba(0,0,0,.46) 100%),
            linear-gradient(180deg, rgba(0,0,0,.06), transparent 38%, rgba(0,0,0,.26));
        }

        /* ---------------------------------------------------------- HUD */

        .rd-top {
          position: relative;
          z-index: 25;
          display: grid;
          grid-template-columns: 1fr 48px 1fr;
          align-items: center;
          gap: 6px;
          min-height: 40px;
        }

        .rd-health {
          position: relative;
          min-width: 0;
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid var(--line);
          background:
            radial-gradient(circle at 50% 0%, var(--player-soft), transparent 74%),
            rgba(255,255,255,.025);
          padding: 6px 9px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 22px rgba(0,0,0,.28);
        }

        .rd-health-active {
          border-color: var(--player-glow);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 0 22px var(--player-soft);
        }

        .rd-health-head {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
        }

        .rd-health-head span {
          color: var(--player);
          font-size: 8px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .2em;
          text-transform: uppercase;
          opacity: .85;
        }

        .rd-health-head b {
          color: white;
          font-size: 13px;
          line-height: 1.18;
          font-weight: 900;
          letter-spacing: -.05em;
        }

        .rd-health-track {
          position: relative;
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(0,0,0,.4);
          box-shadow: inset 0 1px 2px rgba(0,0,0,.6);
        }

        .rd-health-track i {
          position: absolute;
          inset: 0 auto 0 0;
          width: var(--hp);
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,.28), transparent 62%), var(--player);
          box-shadow: 0 0 14px var(--player-glow);
          transition: width 1.85s cubic-bezier(.16, 1, .22, 1);
        }

        .rd-health-magenta .rd-health-track i {
          left: auto;
          right: 0;
        }

        .rd-health em {
          position: absolute;
          z-index: 4;
          right: 9px;
          top: 6px;
          color: var(--danger);
          font-size: 12px;
          line-height: 1.18;
          font-style: normal;
          font-weight: 900;
          text-shadow: 0 0 16px rgba(255,107,107,.7);
          animation: rdDamagePop 1.55s ease both;
        }

        .rd-health-cyan em { right: auto; left: 9px; }
        .rd-health-damaged { animation: rdHealthHit 1.15s ease both; }

        .rd-round {
          height: 39px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 2px;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.03);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 22px rgba(0,0,0,.28);
        }

        .rd-round span {
          color: rgba(255,255,255,.4);
          font-size: 6.5px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .rd-round b {
          color: var(--gold);
          font-size: 14px;
          line-height: 1.18;
          font-weight: 900;
          letter-spacing: -.04em;
          text-shadow: 0 0 16px rgba(255,201,106,.3);
        }

        /* ---------------------------------------------------------- stage */

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

        .rd-title { text-align: center; }

        .rd-title small {
          display: block;
          color: rgba(255,255,255,.42);
          font-size: 7px;
          line-height: 1.32;
          font-weight: 900;
          letter-spacing: .26em;
          text-transform: uppercase;
          padding-top: 1px;
          padding-bottom: 2px;
        }

        .rd-title h1 {
          margin: 2px 0 0;
          font-size: clamp(18px, 4.6vw, 28px);
          line-height: 1.24;
          font-weight: 900;
          letter-spacing: -.07em;
          padding: 1px 0 3px;
          background: linear-gradient(100deg, #EAF4FF, #ffffff 42%, #ffe9b8);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .rd-impact .rd-title h1 { background: linear-gradient(100deg, #fff, #FFE1C2); -webkit-background-clip: text; background-clip: text; }
        .rd-gameover .rd-title h1 { background: linear-gradient(100deg, #fff, #ffe9b8); -webkit-background-clip: text; background-clip: text; }

        .rd-wheel {
          position: relative;
          width: min(86vw, 440px);
          height: min(86vw, 440px);
          max-width: min(56vh, 440px);
          max-height: min(56vh, 440px);
          min-width: 282px;
          min-height: 282px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          box-shadow:
            0 24px 52px rgba(0,0,0,.52),
            0 0 0 1px rgba(255,255,255,.05),
            0 0 36px rgba(255,201,106,.12);
          transform: translateZ(0);
          will-change: transform;
        }

        .rd-pickCyan .rd-wheel,
        .rd-pickMagenta .rd-wheel {
          width: min(83vw, 412px);
          height: min(83vw, 412px);
          max-width: min(49vh, 412px);
          max-height: min(49vh, 412px);
        }

        .rd-wheel-orb {
          position: absolute;
          inset: 5%;
          border-radius: inherit;
          background: radial-gradient(circle at 50% 28%, rgba(255,255,255,.05), transparent 52%);
        }

        .rd-wheel-aura {
          position: absolute;
          inset: -3px;
          border-radius: inherit;
          border: 2px solid rgba(255,201,106,.42);
          box-shadow:
            0 0 30px rgba(255,201,106,.18),
            0 0 24px rgba(47,140,255,.10),
            inset 0 0 0 1px rgba(255,255,255,.06);
        }

        .rd-wheel-surface {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.15);
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,.14), transparent 40%),
            radial-gradient(circle at 50% 50%, rgba(255,201,106,.10) 0%, transparent 24%),
            repeating-conic-gradient(from -3deg, rgba(255,255,255,.035) 0deg 3deg, rgba(0,0,0,.08) 3deg 6deg),
            radial-gradient(circle at 50% 50%, #1b1c29 0%, #0d0e18 58%, #040407 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            inset 0 -34px 58px rgba(0,0,0,.66),
            inset 0 0 0 8px rgba(255,201,106,.055),
            inset 0 0 0 16px rgba(255,255,255,.025);
        }

        .rd-wheel-glass {
          position: absolute;
          inset: 14%;
          border-radius: inherit;
          pointer-events: none;
          border: 1px solid rgba(255,255,255,.05);
          background:
            radial-gradient(circle at 50% 26%, rgba(255,255,255,.05), transparent 42%),
            radial-gradient(circle at 50% 82%, rgba(0,0,0,.22), transparent 48%);
        }

        .rd-spinning .rd-wheel-surface {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            inset 0 -34px 58px rgba(0,0,0,.66),
            inset 0 0 0 8px rgba(255,201,106,.07),
            0 0 28px rgba(47,140,255,.18);
        }
        .rd-impact .rd-wheel-surface {
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.16),
            inset 0 -34px 58px rgba(0,0,0,.66),
            inset 0 0 0 8px rgba(255,201,106,.07),
            0 0 34px rgba(255,143,45,.24);
        }

        .rd-marks { position: absolute; inset: 0; border-radius: inherit; }

        /* 60 ticks instead of 100 keeps the wheel lighter in Telegram WebView. */
        .rd-marks i {
          position: absolute;
          left: 50%;
          top: 0;
          width: 2px;
          height: 48%;
          transform-origin: 50% 100%;
          transform: translateX(-50%) rotate(var(--a));
          background: linear-gradient(to bottom, rgba(255,255,255,.24) 0 8px, transparent 8px);
          filter: drop-shadow(0 0 3px rgba(255,255,255,.16));
        }

        .rd-marks .rd-mark-mid {
          width: 2.5px;
          background: linear-gradient(to bottom, rgba(255,255,255,.42) 0 12px, transparent 12px);
        }

        .rd-marks .rd-mark-major {
          width: 3px;
          background: linear-gradient(to bottom, rgba(255,201,106,.92) 0 17px, transparent 17px);
          filter: drop-shadow(0 0 6px rgba(255,201,106,.36));
        }

        .rd-labels { position: absolute; inset: 0; pointer-events: none; }

        .rd-labels span {
          position: absolute;
          transform: translate(-50%, -50%);
          color: rgba(255,255,255,.76);
          font-size: 9px;
          line-height: 1.28;
          font-weight: 900;
          letter-spacing: -.02em;
          text-shadow: 0 1px 4px rgba(0,0,0,.72), 0 0 12px rgba(255,201,106,.20);
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
          min-width: 28px;
          min-height: 28px;
          display: grid;
          place-items: center;
          gap: 1px;
          transform: translate(-50%, -50%) rotate(calc(-1 * var(--a)));
          border-radius: 999px;
          padding: 3px 6px;
          font-size: 8px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .rd-bet span b { font-size: 8px; line-height: 1.15; }
        .rd-bet span em { font-size: 6.8px; line-height: 1.15; font-style: normal; opacity: .82; }

        .rd-bet-cyan span {
          background: linear-gradient(180deg, #A7D8FF, #2F8CFF);
          color: #031426;
          box-shadow: 0 0 0 3px rgba(47,140,255,.14), 0 0 16px rgba(47,140,255,.55);
        }

        .rd-bet-magenta span {
          background: linear-gradient(180deg, #FFCC8A, #FF8F2D);
          color: #321804;
          box-shadow: 0 0 0 3px rgba(255,143,45,.14), 0 0 16px rgba(255,143,45,.5);
        }

        .rd-bet-target span {
          min-width: 34px;
          height: 34px;
          background: linear-gradient(180deg, #ffe9ad, #FFC96A);
          color: #3a2a06;
          box-shadow: 0 0 0 4px rgba(255,201,106,.16), 0 0 22px rgba(255,201,106,.7);
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

        .rd-spinning .rd-arrow { transition: transform var(--spin-ms) cubic-bezier(.06, .86, .05, 1); }

        .rd-arrow-line {
          position: absolute;
          left: 50%;
          top: 8%;
          width: 4px;
          height: 41%;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff, #FFC96A 48%, rgba(255,201,106,.12));
          box-shadow: 0 0 16px rgba(255,201,106,.5);
        }

        .rd-arrow-head {
          position: absolute;
          left: 50%;
          top: 3.2%;
          width: 0;
          height: 0;
          transform: translateX(-50%);
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 22px solid #FFC96A;
          filter: none;
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
          border: 1px solid rgba(255,255,255,.1);
          background:
            radial-gradient(circle at 50% 20%, rgba(255,255,255,.08), transparent 40%),
            linear-gradient(180deg, rgba(22,22,30,.92), rgba(10,10,16,.94));
          box-shadow:
            0 20px 48px rgba(0,0,0,.5),
            inset 0 1px 0 rgba(255,255,255,.1),
            inset 0 -22px 36px rgba(0,0,0,.4);

        }

        .rd-spinning .rd-center { box-shadow: 0 20px 48px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.1), 0 0 20px rgba(47,140,255,.10); }

        .rd-center small {
          color: rgba(255,255,255,.48);
          font-size: 6.5px;
          line-height: 1.36;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
          padding-top: 2px;
        }

        .rd-center strong {
          margin-top: 2px;
          color: white;
          font-size: clamp(30px, 8vw, 48px);
          line-height: 1.18;
          font-weight: 900;
          letter-spacing: -.08em;
          padding-bottom: 2px;
          text-shadow: 0 0 26px rgba(255,201,106,.22);
        }

        .rd-final .rd-center strong,
        .rd-result .rd-center strong { color: var(--gold); }

        /* ---------------------------------------------------------- clash */

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
          width: 70px;
          height: 70px;
          display: grid;
          place-items: center;
          align-content: center;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.12);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.14), transparent 70%),
            rgba(8,8,14,.86);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 18px 50px rgba(0,0,0,.46);

        }

        .rd-clash-value small {
          font-size: 7px;
          line-height: 1.18;
          font-weight: 900;
          letter-spacing: .14em;
          opacity: .65;
        }

        .rd-clash-value span {
          margin-top: 6px;
          font-size: 26px;
          line-height: 1.08;
          font-weight: 900;
          letter-spacing: -.07em;
        }

        .rd-clash-cyan { color: #A7D8FF; animation: rdClashCyan 1.34s cubic-bezier(.2,.9,.2,1) both; }
        .rd-clash-magenta { color: #FFCC8A; animation: rdClashMagenta 1.34s cubic-bezier(.2,.9,.2,1) both; }

        .rd-clash-core {
          position: relative;
          width: 100px;
          height: 100px;
          display: grid;
          place-items: center;
          align-content: center;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.14);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,107,107,.22), transparent 70%),
            rgba(8,8,14,.92);
          box-shadow: 0 0 50px rgba(255,107,107,.26), inset 0 1px 0 rgba(255,255,255,.1);
          opacity: 0;
          transform: scale(.78);
          animation: rdClashCore 1.14s ease .82s both;

        }

        .rd-clash-core::before {
          content: "";
          position: absolute;
          inset: -18px;
          border-radius: inherit;
          background: radial-gradient(circle, rgba(255,107,107,.2), transparent 64%);
          animation: rdShockwave 1.18s ease .82s both;
        }

        .rd-clash-core small {
          position: relative;
          z-index: 2;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .rd-clash-core b {
          position: relative;
          z-index: 2;
          margin-top: 6px;
          color: #ffd7df;
          font-size: 31px;
          line-height: 1.08;
          font-weight: 900;
          letter-spacing: -.07em;
          text-shadow: 0 0 22px rgba(255,107,107,.7);
        }

        .rd-clash-to-cyan .rd-clash-core::after,
        .rd-clash-to-magenta .rd-clash-core::after {
          content: "";
          position: absolute;
          z-index: 3;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: var(--danger);
          box-shadow: 0 0 22px rgba(255,107,107,.9), 0 0 48px rgba(255,107,107,.4);
          animation: rdDamageFlyCyan 1.28s ease 1.22s both;
        }

        .rd-clash-to-magenta .rd-clash-core::after { animation-name: rdDamageFlyMagenta; }

        /* ---------------------------------------------------------- picks */

        .rd-picks {
          width: min(100%, 336px);
          display: grid;
          grid-template-columns: 1fr .82fr 1fr;
          gap: 6px;
        }

        .rd-pick {
          min-height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,.035);
          padding: 0 8px;
        }

        .rd-pick span {
          color: rgba(255,255,255,.36);
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .rd-pick b { font-size: 12px; line-height: 1.12; font-weight: 900; letter-spacing: -.05em; }
        .rd-pick small { color: rgba(255,255,255,.45); font-size: 8px; font-weight: 900; }

        .rd-pick-cyan b { color: var(--mint); }
        .rd-pick-magenta b { color: var(--rose); }
        .rd-pick-final { border-color: rgba(255,201,106,.2); background: rgba(255,201,106,.06); }
        .rd-pick-final b { color: var(--gold); }

        /* ---------------------------------------------------------- bottom */

        .rd-bottom { position: relative; z-index: 20; display: grid; gap: 6px; }

        .rd-message {
          min-height: 18px;
          text-align: center;
          color: rgba(255,255,255,.58);
          font-size: 9px;
          line-height: 1.42;
          font-weight: 700;
          letter-spacing: .01em;
          padding: 1px 4px;
        }

        .rd-picker {
          display: grid;
          grid-template-columns: 66px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          min-height: 64px;
          padding: 10px 12px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.09);
          background:
            radial-gradient(circle at var(--value) 0%, var(--player-soft), transparent 52%),
            rgba(255,255,255,.042);
          box-shadow: 0 10px 30px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07);

        }

        .rd-picker-value { min-width: 0; display: grid; align-content: center; gap: 3px; }

        .rd-picker-value span {
          color: var(--player);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
          opacity: .85;
        }

        .rd-picker-value b {
          color: white;
          font-size: 23px;
          line-height: 1.22;
          font-weight: 900;
          letter-spacing: -.07em;
          padding-bottom: 1px;
          text-shadow: 0 0 20px var(--player-glow);
        }

        .rd-slider-row {
          position: relative;
          height: 48px;
          display: grid;
          align-items: center;
          touch-action: none;
        }

        .rd-slider-track {
          position: absolute;
          left: 6px;
          right: 6px;
          top: 50%;
          height: 11px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: rgba(0,0,0,.48);
          box-shadow: inset 0 1px 2px rgba(0,0,0,.60), 0 0 0 1px rgba(255,255,255,.07);
        }

        .rd-slider-fill {
          position: absolute;
          inset: 0 auto 0 0;
          width: var(--value);
          border-radius: inherit;
          background: linear-gradient(90deg, var(--player) 0%, var(--player) 72%, #ffffff 100%);
          box-shadow: 0 0 16px var(--player-glow);
        }

        .rd-slider-thumb {
          position: absolute;
          left: var(--value);
          top: 50%;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 0 0 8px rgba(255,255,255,.075), 0 0 30px var(--player-glow), 0 8px 16px rgba(0,0,0,.46);
        }

        .rd-slider-thumb i {
          color: #050507;
          font-size: 9px;
          line-height: 1.2;
          font-style: normal;
          font-weight: 900;
          padding-top: 1px;
        }

        .rd-slider-hit {
          position: absolute;
          z-index: 6;
          inset: -8px -8px;
          border-radius: 999px;
          cursor: pointer;
          touch-action: none;
        }

        .rd-slider { position: absolute; inset: 0; z-index: 2; width: 100%; height: 48px; opacity: 0; cursor: pointer; margin: 0; pointer-events: none; }

        .rd-button {
          border: 0;
          width: 100%;
          min-height: 46px;
          border-radius: 17px;
          padding: 4px 16px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1c1505;
          background: linear-gradient(135deg, #ffe9ad 0%, #FFC96A 46%, #d78a20 100%);
          box-shadow: 0 12px 28px rgba(255,201,106,.22), inset 0 1px 0 rgba(255,255,255,.5);
          font-size: 9.5px;
          line-height: 1.35;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .12em;
          white-space: nowrap;
          transition: transform .12s ease, filter .12s ease;
        }

        .rd-button:active { transform: scale(.975); }
        .rd-button:disabled { opacity: .4; filter: grayscale(.7); transform: none; }

        /* ---------------------------------------------------------- modal */

        .rd-card {
          position: absolute;
          z-index: 80;
          left: 50%;
          top: 50%;
          width: min(328px, calc(100% - 30px));
          transform: translate(-50%, -50%);
          display: grid;
          justify-items: center;
          gap: 12px;
          padding: 24px 22px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 26px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,201,106,.12), transparent 44%),
            rgba(8, 8, 14, .94);
          box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);

          animation: rdCardIn .25s ease both;
        }

        .rd-card-icon {
          display: grid;
          place-items: center;
          width: 58px;
          height: 58px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.1);
          background: linear-gradient(135deg, rgba(47,140,255,.18), rgba(255,201,106,.18));
          font-size: 24px;
        }

        .rd-card h2 {
          margin: 0;
          color: #fff;
          font-size: clamp(20px, 5.4vw, 28px);
          line-height: 1.24;
          font-weight: 900;
          letter-spacing: -.06em;
          padding: 1px 0 3px;
        }

        .rd-card p {
          margin: 0;
          max-width: 264px;
          color: rgba(255,255,255,.56);
          font-size: 10.5px;
          line-height: 1.45;
          font-weight: 600;
        }

        /* ---------------------------------------------------------- particles */

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
          color: var(--mint);
          box-shadow: 0 0 8px currentColor;
          transform: translate(-50%, -50%);
          animation: rdParticle .78s cubic-bezier(.18,.86,.22,1) forwards;
          animation-delay: var(--delay);
        }

        .rd-particle-magenta { color: var(--rose); }
        .rd-particle-gold { color: var(--gold); }
        .rd-particle-green { color: #9fd6ff; }
        .rd-particle-red { color: var(--danger); }

        /* ---------------------------------------------------------- keyframes */

        @keyframes rdWheelGlow {
          from { filter: brightness(1); }
          to { filter: brightness(1.1); }
        }

        @keyframes rdImpactGlow {
          0%, 100% { filter: brightness(1); }
          45% { filter: brightness(1.2); }
        }

        @keyframes rdCenterPulse {
          from { transform: scale(.99); filter: brightness(1); }
          to { transform: scale(1.02); filter: brightness(1.1); }
        }

        @keyframes rdTargetPulse {
          from { transform: translate(-50%, -50%) rotate(calc(-1 * var(--a))) scale(.94); }
          to { transform: translate(-50%, -50%) rotate(calc(-1 * var(--a))) scale(1.07); }
        }

        @keyframes rdClashCyan {
          0% { opacity: 0; transform: translate(-150%, -50%) scale(.78) rotate(-4deg); }
          26% { opacity: 1; }
          70% { opacity: 1; transform: translate(-62%, -50%) scale(1.03) rotate(0deg); }
          100% { opacity: 0; transform: translate(-22%, -50%) scale(.82) rotate(3deg); }
        }

        @keyframes rdClashMagenta {
          0% { opacity: 0; transform: translate(150%, -50%) scale(.78) rotate(4deg); }
          26% { opacity: 1; }
          70% { opacity: 1; transform: translate(62%, -50%) scale(1.03) rotate(0deg); }
          100% { opacity: 0; transform: translate(22%, -50%) scale(.82) rotate(-3deg); }
        }

        @keyframes rdClashCore {
          0% { opacity: 0; transform: scale(.72); }
          44%, 78% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(.88); }
        }

        @keyframes rdShockwave {
          0% { opacity: 0; transform: scale(.45); }
          35% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.6); }
        }

        @keyframes rdDamageFlyCyan {
          0% { opacity: 0; transform: translate(0, 0) scale(.6); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(-42vw, -42vh) scale(.2); }
        }

        @keyframes rdDamageFlyMagenta {
          0% { opacity: 0; transform: translate(0, 0) scale(.6); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(42vw, -42vh) scale(.2); }
        }

        @keyframes rdHealthHit {
          0%, 100% { transform: translateX(0); filter: brightness(1); }
          14% { transform: translateX(-2px); filter: brightness(1.3); }
          28% { transform: translateX(2px); }
          42% { transform: translateX(-1px); }
          56% { transform: translateX(1px); }
        }

        @keyframes rdDamagePop {
          0% { opacity: 0; transform: translateY(8px) scale(.8); }
          22% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-16px) scale(.9); }
        }

        @keyframes rdCardIn {
          from { opacity: 0; transform: translate(-50%, -44%) scale(.94); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes rdParticle {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateX(0) scale(.25); }
          18% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateX(var(--d)) scale(1.05); }
        }

        /* ---------------------------------------------------------- responsive */

        @media (max-height: 720px) {
          .rd-page { gap: 3px; padding-top: 7px; padding-bottom: max(7px, env(safe-area-inset-bottom)); }
          .rd-top { min-height: 41px; }
          .rd-health { padding: 6px 8px; border-radius: 14px; }
          .rd-health-head { margin-bottom: 5px; }
          .rd-health-head b { font-size: 12px; line-height:1.18; }
          .rd-round { height: 37px; border-radius: 13px; }
          .rd-title h1 { font-size: clamp(17px, 4.4vw, 25px); line-height:1.24; }
          .rd-wheel {
            min-width: 264px; min-height: 264px;
            width: min(80vw, 374px); height: min(80vw, 374px);
            max-width: min(50vh, 374px); max-height: min(50vh, 374px);
          }
          .rd-pickCyan .rd-wheel, .rd-pickMagenta .rd-wheel {
            width: min(78vw, 354px); height: min(78vw, 354px);
            max-width: min(46vh, 354px); max-height: min(46vh, 354px);
          }
          .rd-center strong { font-size: clamp(28px, 7.8vw, 42px); line-height:1.18; }
          .rd-pick { min-height: 26px; }
          .rd-picker { min-height: 58px; padding: 8px 10px; border-radius: 19px; grid-template-columns: 60px minmax(0, 1fr); }
          .rd-picker-value b { font-size: 21px; line-height:1.22; }
          .rd-button { min-height: 44px; }
        }

        @media (max-width: 520px) {
          .rd-wheel { min-width: 278px; min-height: 278px; width: min(85vw, 348px); height: min(85vw, 348px); }
          .rd-pickCyan .rd-wheel, .rd-pickMagenta .rd-wheel { min-width: 270px; min-height: 270px; width: min(82vw, 336px); height: min(82vw, 336px); }
          .rd-center strong { font-size: 34px; line-height:1.18; }
        }

        @media (prefers-reduced-motion: reduce) {
          .rd-page *, .rd-page *::before, .rd-page *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; }
          .rd-arrow, .rd-spinning .rd-arrow { transition: transform var(--spin-ms) linear; }
        }
      `}</style>

      <TopHud health={health} round={round} activePlayer={activePlayer} phase={phase} outcome={outcome} />

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
            <p>Выбор сохранён и скрыт. Теперь выбирает {PLAYERS[handoffPlayer].short}.</p>
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

        {canPick && <NumberPicker value={draftValue} activePlayer={activePlayer} onChange={changeDraft} />}

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