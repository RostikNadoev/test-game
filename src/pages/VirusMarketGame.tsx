import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  RefreshCcw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Direction = 'up' | 'down';
type Phase = 'pick' | 'live' | 'roundResult' | 'finished';
type Winner = 'player' | 'bot' | null;

type Scores = {
  player: number;
  bot: number;
};

type RoundPick = {
  player: Direction;
  bot: Direction;
};

type BinaryMarket = {
  symbol: string;
  label: string;
  startPrice: number;
  outcome: Direction;
  prices: number[];
  pulseLabel: string;
};

type RoundResult = {
  outcome: Direction;
  playerPick: Direction;
  botPick: Direction;
  playerPoint: boolean;
  botPoint: boolean;
  priceDelta: number;
  priceDeltaPct: number;
  nextScores: Scores;
  wasOvertime: boolean;
};

const TARGET_SCORE = 3;
const EXPIRATION_SECONDS = 16;
const MARKET_STEPS = 128;
const TICK_MS = Math.round((EXPIRATION_SECONDS * 1000) / MARKET_STEPS);
const PAYOUT = 1.82;

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

const SYMBOLS = [
  { symbol: 'TON/USD', label: 'Toncoin OTC' },
  { symbol: 'BTC/USD', label: 'Bitcoin OTC' },
  { symbol: 'ETH/USD', label: 'Ethereum OTC' },
  { symbol: 'SOL/USD', label: 'Solana OTC' },
  { symbol: 'BNB/USD', label: 'BNB OTC' },
];

const PULSES = [
  'market pressure is building',
  'volatility spike detected',
  'short candle battle',
  'liquidity is moving fast',
  'price is testing the strike',
  'bot reads the same chart',
];

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const oppositeDirection = (direction: Direction): Direction => (direction === 'up' ? 'down' : 'up');

const formatPrice = (value: number) => {
  if (value >= 1000) return value.toFixed(1);
  if (value >= 100) return value.toFixed(2);
  if (value >= 10) return value.toFixed(3);
  return value.toFixed(4);
};

const formatSigned = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
const formatPct = (value: number) => `${formatSigned(value, 2)}%`;

const generateBinaryMarket = (): BinaryMarket => {
  const pair = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const startPrice = randomBetween(18.5, 184.5);
  const outcome: Direction = Math.random() > 0.5 ? 'up' : 'down';
  const finalMovePct = randomBetween(0.28, 1.85) * (outcome === 'up' ? 1 : -1);
  const finalPrice = startPrice * (1 + finalMovePct / 100);
  const prices: number[] = [startPrice];
  let lastNoise = 0;

  for (let step = 1; step <= MARKET_STEPS; step += 1) {
    const progress = step / MARKET_STEPS;
    const latePush = Math.pow(progress, 1.45);
    const wave = Math.sin(progress * Math.PI * 4.1 + randomBetween(-0.15, 0.15));
    const microWave = Math.sin(progress * Math.PI * 13.5) * randomBetween(0.0007, 0.0024);
    const noise = lastNoise * 0.58 + randomBetween(-0.0032, 0.0032);
    lastNoise = noise;

    const trendPrice = startPrice + (finalPrice - startPrice) * latePush;
    const noisy = trendPrice + startPrice * (wave * 0.0044 + microWave + noise * (1 - progress * 0.35));
    prices.push(Math.max(0.001, noisy));
  }

  prices[MARKET_STEPS] = finalPrice;

  return {
    ...pair,
    startPrice,
    outcome,
    prices,
    pulseLabel: PULSES[Math.floor(Math.random() * PULSES.length)],
  };
};

const DirectionBadge = ({ direction }: { direction: Direction }) => (
  <span className={`vm-dir-badge vm-${direction}`}>
    {direction === 'up' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    {direction === 'up' ? 'UP' : 'DOWN'}
  </span>
);

const ScorePips = ({ score, side }: { score: number; side: 'player' | 'bot' }) => (
  <div className={`vm-score-pips vm-score-${side}`}>
    {Array.from({ length: TARGET_SCORE }).map((_, index) => (
      <i key={index} className={index < Math.min(score, TARGET_SCORE) ? 'vm-pip-filled' : ''} />
    ))}
    {score > TARGET_SCORE && <b>+{score - TARGET_SCORE}</b>}
  </div>
);

const PlayerCard = ({
  title,
  score,
  pick,
  active,
  isBot,
}: {
  title: string;
  score: number;
  pick: Direction | null;
  active: boolean;
  isBot?: boolean;
}) => (
  <div className={`vm-player-card ${active ? 'vm-player-active' : ''}`}>
    <div className="vm-player-top">
      <div className="vm-avatar">{isBot ? <Bot size={18} /> : 'YOU'}</div>
      <div className="vm-player-copy">
        <span>{title}</span>
        <b>{score}</b>
      </div>
    </div>

    <ScorePips score={score} side={isBot ? 'bot' : 'player'} />

    <div className="vm-player-pick">
      {pick ? <DirectionBadge direction={pick} /> : <span className="vm-hidden-pick">WAITING</span>}
    </div>
  </div>
);

const EmptyChart = () => (
  <div className="vm-chart-empty">
    <div className="vm-chart-empty-orb">
      <Activity size={34} />
    </div>
    <b>Choose direction</b>
    <span>price starts after your trade</span>
  </div>
);

const OptionChart = ({
  market,
  step,
  phase,
}: {
  market: BinaryMarket | null;
  step: number;
  phase: Phase;
}) => {
  const width = 460;
  const height = 260;
  const padX = 18;
  const padY = 20;

  if (!market) return <EmptyChart />;

  const visible = market.prices.slice(0, Math.max(2, step + 1));
  const min = Math.min(...visible, market.startPrice * 0.991);
  const max = Math.max(...visible, market.startPrice * 1.009);
  const range = Math.max(max - min, 0.00001);
  const current = visible[visible.length - 1];
  const deltaPct = ((current - market.startPrice) / market.startPrice) * 100;
  const isUpNow = current >= market.startPrice;

  const xOf = (index: number) => padX + (index / MARKET_STEPS) * (width - padX * 2);
  const yOf = (value: number) => height - padY - ((value - min) / range) * (height - padY * 2);
  const strikeY = yOf(market.startPrice);
  const currentX = xOf(Math.min(step, MARKET_STEPS));
  const currentY = yOf(current);

  const path = visible
    .map((price, index) => `${index === 0 ? 'M' : 'L'} ${xOf(index)} ${yOf(price)}`)
    .join(' ');

  const areaPath = `${path} L ${currentX} ${height - padY} L ${padX} ${height - padY} Z`;

  return (
    <div className={`vm-chart vm-chart-${isUpNow ? 'up' : 'down'}`}>
      <div className="vm-chart-grid" />
      <div className="vm-chart-topline">
        <div>
          <span>{market.symbol}</span>
          <b>{formatPrice(current)}</b>
        </div>
        <em className={isUpNow ? 'vm-positive' : 'vm-negative'}>{formatPct(deltaPct)}</em>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="vm-chart-svg">
        {[0.22, 0.42, 0.62, 0.82].map((line) => (
          <line
            key={line}
            x1={padX}
            x2={width - padX}
            y1={padY + (height - padY * 2) * line}
            y2={padY + (height - padY * 2) * line}
            stroke="rgba(255,255,255,.055)"
            strokeWidth="1"
          />
        ))}

        <line
          x1={padX}
          x2={width - padX}
          y1={strikeY}
          y2={strikeY}
          stroke="rgba(255,255,255,.28)"
          strokeWidth="1.3"
          strokeDasharray="6 7"
        />

        <path d={areaPath} fill={isUpNow ? 'rgba(35, 219, 126, .13)' : 'rgba(255, 82, 82, .13)'} />
        <path
          d={path}
          fill="none"
          stroke={isUpNow ? '#25df7d' : '#ff5454'}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle cx={currentX} cy={currentY} r="6.5" fill={isUpNow ? '#25df7d' : '#ff5454'} />
        <circle cx={currentX} cy={currentY} r="18" fill={isUpNow ? '#25df7d' : '#ff5454'} opacity="0.12" />
      </svg>

      <div className="vm-strike-tag" style={cssVars({ '--strike-y': `${(strikeY / height) * 100}%` })}>
        strike {formatPrice(market.startPrice)}
      </div>

      <div className="vm-current-tag" style={cssVars({ '--point-y': `${(currentY / height) * 100}%` })}>
        {formatPrice(current)}
      </div>

      {phase === 'roundResult' || phase === 'finished' ? (
        <div className={`vm-expire-line vm-expire-${market.outcome}`}>
          <DirectionBadge direction={market.outcome} />
        </div>
      ) : null}
    </div>
  );
};

const TradeButton = ({
  direction,
  disabled,
  selected,
  onClick,
}: {
  direction: Direction;
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
}) => {
  const isUp = direction === 'up';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`vm-trade-btn vm-trade-${direction} ${selected ? 'vm-trade-selected' : ''}`}
    >
      <span className="vm-trade-icon">{isUp ? <TrendingUp size={25} /> : <TrendingDown size={25} />}</span>
      <span className="vm-trade-copy">
        <b>{isUp ? 'ВВЕРХ' : 'ВНИЗ'}</b>
        <em>{isUp ? 'CALL' : 'PUT'}</em>
      </span>
    </button>
  );
};

const RoundResultPanel = ({
  result,
  winner,
  onNextRound,
  onRestart,
}: {
  result: RoundResult | null;
  winner: Winner;
  onNextRound: () => void;
  onRestart: () => void;
}) => {
  if (!result) return null;

  const playerText = result.playerPoint ? '+1 тебе' : '+0 тебе';
  const botText = result.botPoint ? '+1 боту' : '+0 боту';
  const title = winner
    ? winner === 'player'
      ? 'Ты забрал матч'
      : 'Бот забрал матч'
    : result.wasOvertime
      ? 'Доп раунд'
      : result.playerPoint && result.botPoint
        ? 'Оба угадали'
        : result.playerPoint
          ? 'Раунд твой'
          : result.botPoint
            ? 'Раунд бота'
            : 'Оба промазали';

  return (
    <section className="vm-round-result">
      <div className="vm-result-glow" />
      <div className="vm-result-icon">{winner ? <Trophy size={28} /> : <Target size={28} />}</div>
      <h2>{title}</h2>
      <p>
        Экспирация закрылась <DirectionBadge direction={result.outcome} /> · {formatPct(result.priceDeltaPct)}
      </p>

      <div className="vm-result-cells">
        <div className={result.playerPoint ? 'vm-result-win' : ''}>
          <span>Ты выбрал</span>
          <DirectionBadge direction={result.playerPick} />
          <b>{playerText}</b>
        </div>
        <div className={result.botPoint ? 'vm-result-win' : ''}>
          <span>Бот выбрал</span>
          <DirectionBadge direction={result.botPick} />
          <b>{botText}</b>
        </div>
      </div>

      <button type="button" className="vm-main-action" onClick={winner ? onRestart : onNextRound}>
        {winner ? 'Играть снова' : result.nextScores.player >= TARGET_SCORE && result.nextScores.bot >= TARGET_SCORE ? 'Доп раунд' : 'Следующий раунд'}
      </button>
    </section>
  );
};

export const VirusMarketGame = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('pick');
  const [scores, setScores] = useState<Scores>({ player: 0, bot: 0 });
  const [round, setRound] = useState(1);
  const [isOvertime, setIsOvertime] = useState(false);
  const [picks, setPicks] = useState<RoundPick | null>(null);
  const [market, setMarket] = useState<BinaryMarket | null>(null);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [winner, setWinner] = useState<Winner>(null);

  const currentPrice = market?.prices[Math.min(step, MARKET_STEPS)] ?? 0;
  const priceDelta = market ? currentPrice - market.startPrice : 0;
  const priceDeltaPct = market ? (priceDelta / market.startPrice) * 100 : 0;
  const secondsLeft = phase === 'live' ? Math.max(0, Math.ceil(EXPIRATION_SECONDS - step * (TICK_MS / 1000))) : EXPIRATION_SECONDS;
  const progress = phase === 'live' ? Math.min(100, (step / MARKET_STEPS) * 100) : phase === 'roundResult' || phase === 'finished' ? 100 : 0;

  const statusText = useMemo(() => {
    if (winner === 'player') return 'Victory';
    if (winner === 'bot') return 'Lost';
    if (isOvertime) return 'Overtime';
    if (phase === 'live') return `${secondsLeft}s`;
    return `Round ${round}`;
  }, [winner, isOvertime, phase, secondsLeft, round]);

  const settleRound = () => {
    if (!market || !picks) return;

    const finalPrice = market.prices[MARKET_STEPS];
    const finalDelta = finalPrice - market.startPrice;
    const finalDeltaPct = (finalDelta / market.startPrice) * 100;
    const outcome = finalPrice >= market.startPrice ? 'up' : 'down';
    const playerPoint = picks.player === outcome;
    const botPoint = picks.bot === outcome;

    const nextScores: Scores = {
      player: scores.player + (playerPoint ? 1 : 0),
      bot: scores.bot + (botPoint ? 1 : 0),
    };

    let nextWinner: Winner = null;

    if (isOvertime) {
      nextWinner = playerPoint ? 'player' : 'bot';
    } else if (nextScores.player >= TARGET_SCORE && nextScores.bot >= TARGET_SCORE) {
      nextWinner = null;
    } else if (nextScores.player >= TARGET_SCORE) {
      nextWinner = 'player';
    } else if (nextScores.bot >= TARGET_SCORE) {
      nextWinner = 'bot';
    }

    const nextResult: RoundResult = {
      outcome,
      playerPick: picks.player,
      botPick: picks.bot,
      playerPoint,
      botPoint,
      priceDelta: finalDelta,
      priceDeltaPct: finalDeltaPct,
      nextScores,
      wasOvertime: isOvertime,
    };

    setScores(nextScores);
    setResult(nextResult);
    setWinner(nextWinner);
    setIsOvertime(!nextWinner && nextScores.player >= TARGET_SCORE && nextScores.bot >= TARGET_SCORE);
    setStep(MARKET_STEPS);
    setPhase(nextWinner ? 'finished' : 'roundResult');
  };

  useEffect(() => {
    if (phase !== 'live') return undefined;

    if (step >= MARKET_STEPS) {
      const id = window.setTimeout(settleRound, 260);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      setStep((value) => Math.min(value + 1, MARKET_STEPS));
    }, TICK_MS);

    return () => window.clearTimeout(id);
  }, [phase, step, market, picks, scores, isOvertime]);

  const startTrade = (direction: Direction) => {
    if (phase !== 'pick') return;

    const botDirection = isOvertime
      ? oppositeDirection(direction)
      : Math.random() > 0.5
        ? direction
        : oppositeDirection(direction);

    setPicks({ player: direction, bot: botDirection });
    setMarket(generateBinaryMarket());
    setResult(null);
    setWinner(null);
    setStep(0);
    setPhase('live');
  };

  const nextRound = () => {
    setRound((value) => value + 1);
    setPicks(null);
    setMarket(null);
    setResult(null);
    setStep(0);
    setPhase('pick');
  };

  const resetGame = () => {
    setPhase('pick');
    setScores({ player: 0, bot: 0 });
    setRound(1);
    setIsOvertime(false);
    setPicks(null);
    setMarket(null);
    setStep(0);
    setResult(null);
    setWinner(null);
  };

  const helperText = useMemo(() => {
    if (winner === 'player') return 'Матч завершен. Ты первым выиграл решающий трейд.';
    if (winner === 'bot') return 'Матч завершен. Бот забрал решающий трейд.';
    if (phase === 'live') {
      if (!picks) return 'Сделка открыта.';
      if (picks.player === picks.bot) return 'Вы с ботом выбрали одну сторону. Если рынок закроется туда — очко получите оба.';
      return 'Вы выбрали разные стороны. На экспирации очко получит только тот, кто угадал направление.';
    }
    if (phase === 'roundResult' && scores.player >= TARGET_SCORE && scores.bot >= TARGET_SCORE) {
      return 'Счет 3:3. Теперь доп раунд: ты выбираешь первым, боту автоматически остается второй вариант.';
    }
    if (isOvertime) return 'Доп раунд: выбирай направление, бот получит противоположный вариант без выбора.';
    return 'Выбери ВВЕРХ или ВНИЗ. Через короткую экспирацию направление закрытия даст очко.';
  }, [winner, phase, picks, scores, isOvertime]);

  return (
    <div className="vm-page">
      <style>{`
        .vm-page {
          position: relative;
          width: 100%;
          min-height: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 8px max(10px, env(safe-area-inset-bottom));
          color: #fff;
          background:
            radial-gradient(circle at 50% -12%, rgba(43, 163, 255, .26), transparent 38%),
            radial-gradient(circle at 102% 42%, rgba(32, 226, 136, .13), transparent 36%),
            radial-gradient(circle at -10% 70%, rgba(255, 82, 82, .13), transparent 34%),
            linear-gradient(180deg, rgba(8, 12, 23, .72), rgba(9, 12, 19, .96));
          user-select: none;
          -webkit-overflow-scrolling: touch;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .vm-page * {
          box-sizing: border-box;
        }

        .vm-page button {
          font-family: inherit;
          -webkit-tap-highlight-color: transparent;
        }

        .vm-positive {
          color: #28e489;
        }

        .vm-negative {
          color: #ff6868;
        }

        .vm-top {
          position: relative;
          z-index: 6;
          display: grid;
          grid-template-columns: 40px 1fr 78px;
          align-items: center;
          gap: 8px;
          margin-bottom: 9px;
        }

        .vm-back,
        .vm-status {
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(14, 20, 33, .72);
          color: rgba(255,255,255,.82);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.065), 0 12px 34px rgba(0,0,0,.20);
          backdrop-filter: blur(18px);
        }

        .vm-back {
          width: 40px;
        }

        .vm-status {
          padding: 0 10px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .vm-title {
          min-width: 0;
          text-align: center;
        }

        .vm-title small {
          display: block;
          color: rgba(255,255,255,.45);
          font-size: 9px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vm-title h1 {
          margin: 4px 0 0;
          color: #fff;
          font-size: 22px;
          line-height: .95;
          font-weight: 900;
          letter-spacing: -.055em;
        }

        .vm-board {
          position: relative;
          z-index: 4;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 9px;
        }

        .vm-player-card {
          position: relative;
          overflow: hidden;
          min-width: 0;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(15, 22, 35, .68);
          padding: 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 16px 40px rgba(0,0,0,.18);
          backdrop-filter: blur(18px);
        }

        .vm-player-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          opacity: .36;
          background: radial-gradient(circle at 20% 0%, rgba(47,140,255,.28), transparent 42%);
          pointer-events: none;
        }

        .vm-player-card:nth-child(2)::before {
          background: radial-gradient(circle at 80% 0%, rgba(245,158,66,.24), transparent 42%);
        }

        .vm-player-active {
          border-color: rgba(54, 211, 153, .33);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 1px rgba(54,211,153,.12), 0 18px 44px rgba(0,0,0,.18);
        }

        .vm-player-top,
        .vm-score-pips,
        .vm-player-pick {
          position: relative;
          z-index: 2;
        }

        .vm-player-top {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .vm-avatar {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 14px;
          background: rgba(255,255,255,.07);
          color: rgba(255,255,255,.85);
          font-size: 9px;
          font-weight: 950;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }

        .vm-player-copy {
          min-width: 0;
          flex: 1;
        }

        .vm-player-copy span,
        .vm-player-copy b {
          display: block;
        }

        .vm-player-copy span {
          color: rgba(255,255,255,.46);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-player-copy b {
          margin-top: 2px;
          color: #fff;
          font-size: 25px;
          line-height: .9;
          font-weight: 950;
          letter-spacing: -.06em;
        }

        .vm-score-pips {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 10px;
        }

        .vm-score-pips i {
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        }

        .vm-score-pips b {
          color: rgba(255,255,255,.68);
          font-size: 10px;
          font-weight: 900;
        }

        .vm-score-player .vm-pip-filled {
          background: linear-gradient(90deg, #2f8cff, #23d77f);
          box-shadow: 0 0 16px rgba(47,140,255,.28);
        }

        .vm-score-bot .vm-pip-filled {
          background: linear-gradient(90deg, #f59e42, #ff5454);
          box-shadow: 0 0 16px rgba(245,158,66,.24);
        }

        .vm-player-pick {
          margin-top: 10px;
          min-height: 27px;
          display: flex;
          align-items: center;
        }

        .vm-hidden-pick {
          display: inline-flex;
          align-items: center;
          height: 27px;
          border-radius: 999px;
          padding: 0 10px;
          color: rgba(255,255,255,.37);
          background: rgba(0,0,0,.19);
          border: 1px solid rgba(255,255,255,.06);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .10em;
        }

        .vm-dir-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 27px;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .08em;
          vertical-align: middle;
        }

        .vm-dir-badge.vm-up {
          color: #072514;
          background: linear-gradient(180deg, #7affbb, #22d77f);
          box-shadow: 0 10px 24px rgba(35,215,127,.20), inset 0 2px 0 rgba(255,255,255,.34);
        }

        .vm-dir-badge.vm-down {
          color: #300807;
          background: linear-gradient(180deg, #ff9b9b, #ff5454);
          box-shadow: 0 10px 24px rgba(255,84,84,.18), inset 0 2px 0 rgba(255,255,255,.30);
        }

        .vm-terminal {
          position: relative;
          z-index: 3;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(11, 16, 27, .78);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 22px 58px rgba(0,0,0,.22);
          backdrop-filter: blur(20px);
        }

        .vm-terminal-head {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 10px;
          min-height: 54px;
          padding: 11px 12px 7px;
        }

        .vm-pair {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .vm-pair-logo {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: linear-gradient(135deg, rgba(47,140,255,.22), rgba(37,223,125,.16));
          color: #a8e7ff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.09);
        }

        .vm-pair-copy {
          min-width: 0;
        }

        .vm-pair-copy b,
        .vm-pair-copy span {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .vm-pair-copy b {
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -.035em;
        }

        .vm-pair-copy span {
          margin-top: 3px;
          color: rgba(255,255,255,.38);
          font-size: 10px;
          font-weight: 700;
        }

        .vm-payout {
          min-width: 74px;
          border-radius: 17px;
          background: rgba(42, 255, 154, .10);
          border: 1px solid rgba(42,255,154,.16);
          padding: 8px 10px;
          text-align: center;
        }

        .vm-payout span,
        .vm-payout b {
          display: block;
        }

        .vm-payout span {
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-payout b {
          margin-top: 2px;
          color: #6dffad;
          font-size: 16px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.045em;
        }

        .vm-chart,
        .vm-chart-empty {
          position: relative;
          height: 278px;
          margin: 5px 10px 10px;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.075);
          background:
            radial-gradient(circle at 80% 12%, rgba(47,140,255,.12), transparent 35%),
            linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.28));
        }

        .vm-chart-empty {
          display: grid;
          place-items: center;
          text-align: center;
          color: rgba(255,255,255,.48);
        }

        .vm-chart-empty-orb {
          width: 68px;
          height: 68px;
          display: grid;
          place-items: center;
          border-radius: 24px;
          background: rgba(255,255,255,.055);
          color: rgba(255,255,255,.62);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 18px 42px rgba(0,0,0,.18);
        }

        .vm-chart-empty b {
          position: absolute;
          bottom: 86px;
          color: rgba(255,255,255,.88);
          font-size: 17px;
          font-weight: 950;
          letter-spacing: -.05em;
        }

        .vm-chart-empty span {
          position: absolute;
          bottom: 64px;
          color: rgba(255,255,255,.42);
          font-size: 11px;
          font-weight: 700;
        }

        .vm-chart-grid {
          position: absolute;
          inset: 0;
          opacity: .36;
          background:
            linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
          background-size: 46px 38px;
          mask-image: linear-gradient(180deg, transparent, black 11%, black 90%);
        }

        .vm-chart-topline {
          position: absolute;
          z-index: 5;
          left: 10px;
          right: 10px;
          top: 10px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          pointer-events: none;
        }

        .vm-chart-topline span,
        .vm-chart-topline b {
          display: block;
        }

        .vm-chart-topline span {
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-chart-topline b {
          margin-top: 3px;
          color: #fff;
          font-size: 20px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.055em;
          font-variant-numeric: tabular-nums;
        }

        .vm-chart-topline em {
          min-width: 74px;
          text-align: right;
          font-size: 14px;
          line-height: 1;
          font-weight: 950;
          font-style: normal;
          letter-spacing: -.03em;
          font-variant-numeric: tabular-nums;
        }

        .vm-chart-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .vm-strike-tag,
        .vm-current-tag {
          position: absolute;
          z-index: 6;
          right: 8px;
          transform: translateY(-50%);
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 9px;
          font-weight: 850;
          font-variant-numeric: tabular-nums;
          pointer-events: none;
          backdrop-filter: blur(10px);
        }

        .vm-strike-tag {
          top: var(--strike-y);
          color: rgba(255,255,255,.70);
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.10);
        }

        .vm-current-tag {
          top: var(--point-y);
          color: #fff;
          background: rgba(0,0,0,.42);
          border: 1px solid rgba(255,255,255,.09);
        }

        .vm-expire-line {
          position: absolute;
          z-index: 8;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          min-width: 86px;
          height: 46px;
          border-radius: 18px;
          background: rgba(0,0,0,.42);
          border: 1px solid rgba(255,255,255,.10);
          backdrop-filter: blur(14px);
        }

        .vm-trade-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
          padding: 0 10px 10px;
        }

        .vm-info-cell {
          min-height: 58px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(255,255,255,.045);
          padding: 9px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
        }

        .vm-info-cell span,
        .vm-info-cell b {
          display: block;
        }

        .vm-info-cell span {
          color: rgba(255,255,255,.40);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-info-cell b {
          margin-top: 7px;
          color: #fff;
          font-size: 14px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.035em;
          font-variant-numeric: tabular-nums;
        }

        .vm-clock {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .vm-progress {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          margin: 0 10px 12px;
          background: rgba(255,255,255,.075);
        }

        .vm-progress-fill {
          height: 100%;
          width: var(--progress);
          border-radius: inherit;
          background: linear-gradient(90deg, #2f8cff, #25df7d 55%, #ffcc4d);
          box-shadow: 0 0 22px rgba(37,223,125,.25);
          transition: width ${TICK_MS}ms linear;
        }

        .vm-message-card {
          position: relative;
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 10px 0;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(14, 20, 33, .64);
          padding: 11px 12px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 14px 36px rgba(0,0,0,.14);
          backdrop-filter: blur(18px);
        }

        .vm-message-card i {
          width: 33px;
          height: 33px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 14px;
          background: rgba(47,140,255,.13);
          color: #9bd5ff;
          font-style: normal;
        }

        .vm-message-card p {
          margin: 0;
          color: rgba(255,255,255,.66);
          font-size: 11px;
          line-height: 1.28;
          font-weight: 680;
        }

        .vm-bottom {
          position: sticky;
          z-index: 20;
          bottom: -10px;
          margin: 10px -8px 0;
          padding: 9px 8px max(9px, env(safe-area-inset-bottom));
          background: linear-gradient(180deg, transparent 0%, rgba(8,12,23,.70) 34%, rgba(8,12,23,.94) 100%);
          backdrop-filter: blur(16px);
        }

        .vm-trade-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .vm-trade-btn {
          position: relative;
          overflow: hidden;
          min-height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 0;
          border-radius: 24px;
          color: #06130c;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.34), 0 18px 42px rgba(0,0,0,.23);
          transition: transform .13s ease, filter .13s ease, opacity .13s ease;
        }

        .vm-trade-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,.28), transparent 38%);
          pointer-events: none;
        }

        .vm-trade-btn:active:not(:disabled) {
          transform: scale(.976);
        }

        .vm-trade-btn:disabled {
          opacity: .44;
          filter: grayscale(.85);
        }

        .vm-trade-up {
          background: linear-gradient(180deg, #7cffbd, #25df7d 56%, #15b967);
        }

        .vm-trade-down {
          color: #310807;
          background: linear-gradient(180deg, #ffaaaa, #ff5a5a 55%, #dd3535);
        }

        .vm-trade-selected {
          opacity: 1 !important;
          filter: none !important;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.36), 0 0 0 2px rgba(255,255,255,.10), 0 22px 48px rgba(0,0,0,.26);
        }

        .vm-trade-icon,
        .vm-trade-copy {
          position: relative;
          z-index: 2;
        }

        .vm-trade-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: rgba(255,255,255,.26);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.24);
        }

        .vm-trade-copy b,
        .vm-trade-copy em {
          display: block;
          text-align: left;
        }

        .vm-trade-copy b {
          font-size: 17px;
          line-height: .95;
          font-weight: 1000;
          letter-spacing: -.045em;
        }

        .vm-trade-copy em {
          margin-top: 4px;
          opacity: .58;
          font-size: 9px;
          line-height: 1;
          font-style: normal;
          font-weight: 950;
          letter-spacing: .18em;
        }

        .vm-sub-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          margin-top: 8px;
        }

        .vm-main-action,
        .vm-reset {
          min-height: 44px;
          border: 0;
          border-radius: 18px;
          color: #061018;
          background: linear-gradient(135deg, #2f8cff, #25df7d 58%, #f9c74f);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .10em;
          text-transform: uppercase;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.31), 0 16px 34px rgba(37,223,125,.14);
        }

        .vm-reset {
          width: 54px;
          display: grid;
          place-items: center;
          color: rgba(255,255,255,.78);
          background: rgba(255,255,255,.075);
          border: 1px solid rgba(255,255,255,.09);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 14px 30px rgba(0,0,0,.18);
        }

        .vm-main-action:disabled {
          opacity: .46;
          filter: grayscale(.9);
        }

        .vm-round-result {
          position: relative;
          z-index: 12;
          overflow: hidden;
          margin-top: 10px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(14,20,33,.82);
          padding: 18px;
          text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 20px 54px rgba(0,0,0,.22);
          backdrop-filter: blur(20px);
        }

        .vm-result-glow {
          position: absolute;
          inset: -80px -40px auto;
          height: 170px;
          opacity: .38;
          background: radial-gradient(circle, rgba(47,140,255,.38), transparent 62%);
          pointer-events: none;
        }

        .vm-result-icon {
          position: relative;
          z-index: 2;
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          margin: 0 auto 12px;
          border-radius: 22px;
          background: rgba(255,255,255,.075);
          color: #bce8ff;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.09);
        }

        .vm-round-result h2,
        .vm-round-result p,
        .vm-result-cells,
        .vm-round-result .vm-main-action {
          position: relative;
          z-index: 2;
        }

        .vm-round-result h2 {
          margin: 0;
          color: #fff;
          font-size: 28px;
          line-height: .94;
          font-weight: 1000;
          letter-spacing: -.075em;
        }

        .vm-round-result p {
          margin: 10px auto 0;
          max-width: 320px;
          color: rgba(255,255,255,.62);
          font-size: 12px;
          line-height: 1.38;
          font-weight: 720;
        }

        .vm-result-cells {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 14px;
        }

        .vm-result-cells > div {
          border-radius: 21px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(255,255,255,.045);
          padding: 11px 8px;
          min-width: 0;
        }

        .vm-result-cells > div.vm-result-win {
          border-color: rgba(37,223,125,.22);
          background: rgba(37,223,125,.075);
        }

        .vm-result-cells span,
        .vm-result-cells b {
          display: block;
        }

        .vm-result-cells span {
          margin-bottom: 8px;
          color: rgba(255,255,255,.40);
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-result-cells b {
          margin-top: 9px;
          color: #fff;
          font-size: 15px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .vm-round-result .vm-main-action {
          width: 100%;
          margin-top: 15px;
        }

        @media (max-height: 720px) {
          .vm-chart,
          .vm-chart-empty {
            height: 236px;
          }

          .vm-trade-btn {
            min-height: 64px;
          }

          .vm-player-copy b {
            font-size: 22px;
          }

          .vm-terminal-head {
            min-height: 48px;
          }
        }
      `}</style>

      <header className="vm-top">
        <button type="button" className="vm-back" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={18} />
        </button>

        <div className="vm-title">
          <small>{isOvertime ? 'sudden death option' : 'binary option duel'}</small>
          <h1>Virus Option</h1>
        </div>

        <div className="vm-status">{statusText}</div>
      </header>

      <section className="vm-board">
        <PlayerCard title="Твой счет" score={scores.player} pick={picks?.player ?? null} active={phase === 'pick' || phase === 'live'} />
        <PlayerCard title="Счет бота" score={scores.bot} pick={picks?.bot ?? null} active={phase === 'live'} isBot />
      </section>

      <section className="vm-terminal">
        <div className="vm-terminal-head">
          <div className="vm-pair">
            <div className="vm-pair-logo">
              <Zap size={18} />
            </div>
            <div className="vm-pair-copy">
              <b>{market?.symbol ?? 'TON/USD'}</b>
              <span>{market ? `${market.label} · ${market.pulseLabel}` : 'OTC chart · one tap trade'}</span>
            </div>
          </div>

          <div className="vm-payout">
            <span>payout</span>
            <b>x{PAYOUT.toFixed(2)}</b>
          </div>
        </div>

        <OptionChart market={market} step={step} phase={phase} />

        <div className="vm-trade-info">
          <div className="vm-info-cell">
            <span>expiration</span>
            <b className="vm-clock"><Clock3 size={13} /> {secondsLeft}s</b>
          </div>

          <div className="vm-info-cell">
            <span>change</span>
            <b className={priceDeltaPct >= 0 ? 'vm-positive' : 'vm-negative'}>{market ? formatPct(priceDeltaPct) : '+0.00%'}</b>
          </div>

          <div className="vm-info-cell">
            <span>mode</span>
            <b>{isOvertime ? 'OT' : `${TARGET_SCORE} pts`}</b>
          </div>
        </div>

        <div className="vm-progress">
          <div className="vm-progress-fill" style={cssVars({ '--progress': `${progress}%` })} />
        </div>
      </section>

      <div className="vm-message-card">
        <i><ShieldCheck size={17} /></i>
        <p>{helperText}</p>
      </div>

      {(phase === 'roundResult' || phase === 'finished') && (
        <RoundResultPanel result={result} winner={winner} onNextRound={nextRound} onRestart={resetGame} />
      )}

      <footer className="vm-bottom">
        <div className="vm-trade-actions">
          <TradeButton
            direction="up"
            disabled={phase !== 'pick'}
            selected={picks?.player === 'up'}
            onClick={() => startTrade('up')}
          />
          <TradeButton
            direction="down"
            disabled={phase !== 'pick'}
            selected={picks?.player === 'down'}
            onClick={() => startTrade('down')}
          />
        </div>

        <div className="vm-sub-actions">
          <button
            type="button"
            className="vm-main-action"
            disabled={phase === 'live'}
            onClick={phase === 'roundResult' ? nextRound : resetGame}
          >
            {phase === 'live' ? 'Сделка идет' : phase === 'roundResult' ? 'Следующий раунд' : winner ? 'Новая игра' : 'Новая серия'}
          </button>
          <button type="button" className="vm-reset" onClick={resetGame} aria-label="Сбросить игру">
            <RefreshCcw size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default VirusMarketGame;
