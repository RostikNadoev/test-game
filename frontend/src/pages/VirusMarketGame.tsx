import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCcw, Trophy } from 'lucide-react';

type Direction = 'up' | 'down';
type Phase = 'choose' | 'live' | 'result' | 'gameOver';
type MatchWinner = 'player' | 'bot' | null;

type Scores = {
  player: number;
  bot: number;
};

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type MarketRound = {
  symbol: string;
  payout: number;
  strike: number;
  outcome: Direction;
  candles: Candle[];
};

type RoundResult = {
  outcome: Direction;
  playerPick: Direction;
  botPick: Direction;
  playerPoint: boolean;
  botPoint: boolean;
  delta: number;
  deltaPct: number;
  overtime: boolean;
  nextScores: Scores;
};

const TARGET_SCORE = 3;
const CHOICE_MS = 6000;
const PREVIEW_CANDLES = 18;
const TOTAL_CANDLES = 52;
const LIVE_STEP_MS = 430;
const LIVE_MS = (TOTAL_CANDLES - PREVIEW_CANDLES) * LIVE_STEP_MS;
const PAYOUT = 1.82;

const PAIRS = ['TON/USD', 'BTC/USD', 'ETH/USD', 'SOL/USD', 'NOT/USD'];

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randomDirection = (): Direction => (Math.random() > 0.5 ? 'up' : 'down');
const oppositeDirection = (direction: Direction): Direction => (direction === 'up' ? 'down' : 'up');

const formatPrice = (value: number) => {
  if (value >= 1000) return value.toFixed(1);
  if (value >= 100) return value.toFixed(2);
  if (value >= 10) return value.toFixed(3);
  return value.toFixed(4);
};

const formatSigned = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
const formatPct = (value: number) => `${formatSigned(value, 2)}%`;

const makeCandle = (open: number, close: number, power = 1): Candle => {
  const wick = Math.max(open, close) * randomBetween(0.0008, 0.0048) * power;
  const top = Math.max(open, close) + wick * randomBetween(0.55, 1.25);
  const bottom = Math.min(open, close) - wick * randomBetween(0.55, 1.25);

  return {
    open,
    close,
    high: Math.max(top, open, close),
    low: Math.max(0.0001, Math.min(bottom, open, close)),
  };
};

const generateMarketRound = (): MarketRound => {
  const symbol = PAIRS[Math.floor(Math.random() * PAIRS.length)];
  const start = randomBetween(28, 184);
  const candles: Candle[] = [];
  let price = start;
  let flow = randomBetween(-0.0012, 0.0012);

  for (let i = 0; i < PREVIEW_CANDLES; i += 1) {
    const open = price;
    flow = flow * 0.68 + randomBetween(-0.0017, 0.0017);
    const close = Math.max(0.001, open * (1 + flow + randomBetween(-0.0019, 0.0019)));
    candles.push(makeCandle(open, close, 0.9));
    price = close;
  }

  const strike = candles[candles.length - 1].close;
  const outcome = randomDirection();
  const finalMove = randomBetween(0.0035, 0.014) * (outcome === 'up' ? 1 : -1);
  const finalClose = strike * (1 + finalMove);
  const futureCount = TOTAL_CANDLES - PREVIEW_CANDLES;
  let current = strike;
  let microTrend = randomBetween(-0.0014, 0.0014);

  for (let i = 1; i <= futureCount; i += 1) {
    const progress = i / futureCount;
    const open = current;
    const expected = strike + (finalClose - strike) * Math.pow(progress, 1.35);
    const wave = Math.sin(progress * Math.PI * 5.2) * strike * randomBetween(0.0007, 0.0022);
    microTrend = microTrend * 0.58 + randomBetween(-0.0018, 0.0018);
    const close = i === futureCount
      ? finalClose
      : Math.max(0.001, expected + wave + strike * microTrend * (1 - progress * 0.34));

    candles.push(makeCandle(open, close, progress > 0.72 ? 1.18 : 1));
    current = close;
  }

  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  candles[lastIndex] = {
    ...last,
    close: finalClose,
    high: Math.max(last.high, finalClose, last.open),
    low: Math.min(last.low, finalClose, last.open),
  };

  return {
    symbol,
    payout: PAYOUT,
    strike,
    outcome,
    candles,
  };
};

const Avatar = ({ type }: { type: 'player' | 'bot' }) => (
  <div className={`bo-avatar ${type === 'player' ? 'bo-avatar-player' : 'bo-avatar-bot'}`}>
    {type === 'player' ? 'R' : 'B'}
  </div>
);

const TopPlayer = ({ type, name }: { type: 'player' | 'bot'; name: string }) => (
  <div className={`bo-player ${type === 'bot' ? 'bo-player-right' : ''}`}>
    {type === 'player' && <Avatar type={type} />}
    <div className="bo-player-copy">
      <b>{name}</b>
      <span>{type === 'player' ? 'YOU' : 'BOT'}</span>
    </div>
    {type === 'bot' && <Avatar type={type} />}
  </div>
);

const CandleChart = ({
  market,
  visibleCount,
  phase,
  playerPick,
  botPick,
}: {
  market: MarketRound;
  visibleCount: number;
  phase: Phase;
  playerPick: Direction | null;
  botPick: Direction | null;
}) => {
  const width = 420;
  const height = 300;
  const padLeft = 18;
  const padRight = 64;
  const padTop = 20;
  const padBottom = 22;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const visibleCandles = market.candles.slice(0, Math.max(2, visibleCount));
  const lastVisible = visibleCandles[visibleCandles.length - 1];
  const allHigh = Math.max(...market.candles.map((candle) => candle.high), market.strike);
  const allLow = Math.min(...market.candles.map((candle) => candle.low), market.strike);
  const padding = Math.max((allHigh - allLow) * 0.18, market.strike * 0.0022);
  const maxValue = allHigh + padding;
  const minValue = Math.max(0.0001, allLow - padding);
  const valueRange = Math.max(maxValue - minValue, 0.0001);
  const stepX = plotWidth / Math.max(TOTAL_CANDLES - 1, 1);
  const candleWidth = Math.max(3.2, Math.min(6.7, stepX * 0.66));
  const activeX = padLeft + (visibleCandles.length - 1) * stepX;
  const expiryX = padLeft + (TOTAL_CANDLES - 1) * stepX;

  const yOf = (value: number) => padTop + ((maxValue - value) / valueRange) * plotHeight;
  const xOf = (index: number) => padLeft + index * stepX;
  const strikeY = yOf(market.strike);
  const priceY = yOf(lastVisible.close);
  const currentDirection: Direction = lastVisible.close >= market.strike ? 'up' : 'down';

  return (
    <div className="bo-chart-wrap">
      <div className="bo-chart-head">
        <div>
          <b>{market.symbol}</b>
          <span>OTC · 1 round</span>
        </div>
        <div className={`bo-live-price ${currentDirection === 'up' ? 'bo-text-up' : 'bo-text-down'}`}>
          {formatPrice(lastVisible.close)}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="bo-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="boFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,.04)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} fill="url(#boFade)" />

        {[0, 0.25, 0.5, 0.75, 1].map((line) => {
          const y = padTop + plotHeight * line;
          return (
            <line
              key={`h-${line}`}
              x1={padLeft}
              x2={width - padRight + 15}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,.055)"
              strokeWidth="1"
            />
          );
        })}

        {[0.16, 0.32, 0.48, 0.64, 0.8].map((line) => {
          const x = padLeft + plotWidth * line;
          return (
            <line
              key={`v-${line}`}
              x1={x}
              x2={x}
              y1={padTop - 2}
              y2={height - padBottom}
              stroke="rgba(255,255,255,.04)"
              strokeWidth="1"
            />
          );
        })}

        <line
          x1={padLeft}
          x2={width - padRight + 20}
          y1={strikeY}
          y2={strikeY}
          stroke="rgba(255,255,255,.26)"
          strokeWidth="1.2"
          strokeDasharray="6 7"
        />

        <line
          x1={padLeft}
          x2={width - padRight + 20}
          y1={priceY}
          y2={priceY}
          stroke={currentDirection === 'up' ? 'rgba(26, 203, 127, .46)' : 'rgba(255, 83, 92, .46)'}
          strokeWidth="1.15"
        />

        <rect
          x={activeX + stepX * 0.55}
          y={padTop - 2}
          width={Math.max(0, expiryX - activeX)}
          height={plotHeight + 2}
          fill="rgba(0,0,0,.16)"
        />

        <line
          x1={expiryX}
          x2={expiryX}
          y1={padTop - 8}
          y2={height - padBottom + 4}
          stroke="rgba(255,255,255,.22)"
          strokeWidth="1.2"
          strokeDasharray="3 6"
        />

        {visibleCandles.map((candle, index) => {
          const x = xOf(index);
          const openY = yOf(candle.open);
          const closeY = yOf(candle.close);
          const highY = yOf(candle.high);
          const lowY = yOf(candle.low);
          const isUp = candle.close >= candle.open;
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2.4, Math.abs(closeY - openY));
          const color = isUp ? '#1acb7f' : '#ff535c';
          const isLast = index === visibleCandles.length - 1;

          return (
            <g key={`${index}-${candle.open}-${candle.close}`} className={isLast && phase === 'live' ? 'bo-last-candle' : undefined}>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                stroke={color}
                strokeWidth="1.25"
                strokeLinecap="round"
                opacity={isLast ? 1 : 0.86}
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                rx="1.5"
                fill={color}
                opacity={isLast ? 1 : 0.92}
              />
            </g>
          );
        })}

        <circle
          cx={activeX}
          cy={priceY}
          r="4.2"
          fill={currentDirection === 'up' ? '#1acb7f' : '#ff535c'}
          className={phase === 'live' ? 'bo-price-dot' : undefined}
        />

        <g transform={`translate(${width - padRight + 25} ${priceY - 12})`}>
          <rect
            width="56"
            height="24"
            rx="8"
            fill={currentDirection === 'up' ? '#1acb7f' : '#ff535c'}
            opacity=".96"
          />
          <text
            x="28"
            y="15.5"
            textAnchor="middle"
            fill="#07100d"
            fontSize="8.5"
            fontWeight="900"
          >
            {formatPrice(lastVisible.close)}
          </text>
        </g>

        <g transform={`translate(${width - padRight + 25} ${strikeY + 6})`}>
          <rect width="54" height="20" rx="7" fill="rgba(255,255,255,.10)" />
          <text x="27" y="13" textAnchor="middle" fill="rgba(255,255,255,.66)" fontSize="8" fontWeight="800">
            {formatPrice(market.strike)}
          </text>
        </g>
      </svg>

      <div className="bo-chart-bottom">
        <div className="bo-chip">
          <span>strike</span>
          <b>{formatPrice(market.strike)}</b>
        </div>
        <div className="bo-chip">
          <span>payout</span>
          <b>x{market.payout.toFixed(2)}</b>
        </div>
        <div className="bo-chip bo-chip-picks">
          <span>pick</span>
          <b>
            {playerPick ? (playerPick === 'up' ? '↑' : '↓') : '—'}
            <i />
            {botPick ? (botPick === 'up' ? '↑' : '↓') : '—'}
          </b>
        </div>
      </div>
    </div>
  );
};

const ResultToast = ({ result }: { result: RoundResult }) => {
  const playerWon = result.playerPoint && !result.botPoint;
  const botWon = result.botPoint && !result.playerPoint;
  const bothWon = result.playerPoint && result.botPoint;

  return (
    <div className="bo-result-toast">
      <div className={`bo-result-mark ${result.outcome === 'up' ? 'bo-mark-up' : 'bo-mark-down'}`}>
        {result.outcome === 'up' ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </div>
      <div>
        <b>{playerWon ? '+1 тебе' : botWon ? '+1 боту' : bothWon ? '+1 обоим' : 'без очков'}</b>
        <span>
          close {result.outcome === 'up' ? 'above' : 'below'} strike · {formatPct(result.deltaPct)}
        </span>
      </div>
    </div>
  );
};

type BoTimerTone = 'idle' | 'up' | 'down';

const BoTimer = ({
  progress,
  label,
  tone,
}: {
  progress: number;
  label: string;
  tone: BoTimerTone;
}) => {
  const timerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timerRef.current?.style.setProperty('--timer', String(progress));
  }, [progress]);

  return (
    <div ref={timerRef} className={`bo-timer bo-timer-${tone}`}>
      <span>{label}</span>
    </div>
  );
};

export const VirusMarketGame = () => {
  const [phase, setPhase] = useState<Phase>('choose');
  const [scores, setScores] = useState<Scores>({ player: 0, bot: 0 });
  const [round, setRound] = useState(1);
  const [market, setMarket] = useState<MarketRound>(() => generateMarketRound());
  const [visibleCount, setVisibleCount] = useState(PREVIEW_CANDLES);
  const [choiceLeft, setChoiceLeft] = useState(CHOICE_MS);
  const [playerPick, setPlayerPick] = useState<Direction | null>(null);
  const [botPick, setBotPick] = useState<Direction | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [winner, setWinner] = useState<MatchWinner>(null);

  const isOvertime = scores.player >= TARGET_SCORE && scores.bot >= TARGET_SCORE && scores.player === scores.bot;
  const liveLeftMs = phase === 'live'
    ? Math.max(0, (TOTAL_CANDLES - visibleCount) * LIVE_STEP_MS)
    : LIVE_MS;

  const timerMs = phase === 'choose' ? choiceLeft : phase === 'live' ? liveLeftMs : 0;
  const timerTotal = phase === 'choose' ? CHOICE_MS : LIVE_MS;
  const timerProgress = timerTotal > 0 ? Math.max(0, Math.min(100, (timerMs / timerTotal) * 100)) : 0;
  const timerLabel = Math.ceil(timerMs / 1000).toString();

  const lastCandle = market.candles[Math.min(visibleCount - 1, market.candles.length - 1)];
  const delta = lastCandle.close - market.strike;
  const deltaPct = (delta / market.strike) * 100;

  const statusText = useMemo(() => {
    if (phase === 'choose') return isOvertime ? 'extra round · bot gets opposite' : 'choose direction';
    if (phase === 'live') return 'trade is open';
    if (phase === 'result') return 'round closed';
    return winner === 'player' ? 'you won the match' : 'bot won the match';
  }, [phase, isOvertime, winner]);

  const startNextRound = useCallback(() => {
    setRound((value) => value + 1);
    setMarket(generateMarketRound());
    setVisibleCount(PREVIEW_CANDLES);
    setChoiceLeft(CHOICE_MS);
    setPlayerPick(null);
    setBotPick(null);
    setResult(null);
    setPhase('choose');
  }, []);

  const resetMatch = useCallback(() => {
    setPhase('choose');
    setScores({ player: 0, bot: 0 });
    setRound(1);
    setMarket(generateMarketRound());
    setVisibleCount(PREVIEW_CANDLES);
    setChoiceLeft(CHOICE_MS);
    setPlayerPick(null);
    setBotPick(null);
    setResult(null);
    setWinner(null);
  }, []);

  const commitChoice = useCallback((direction: Direction) => {
    if (phase !== 'choose' || playerPick) return;

    const nextBotPick = isOvertime ? oppositeDirection(direction) : randomDirection();
    setPlayerPick(direction);
    setBotPick(nextBotPick);
    setVisibleCount(PREVIEW_CANDLES);
    setPhase('live');
  }, [phase, playerPick, isOvertime]);

  const resolveRound = useCallback(() => {
    if (!playerPick || !botPick) return;

    const finalCandle = market.candles[market.candles.length - 1];
    const finalDelta = finalCandle.close - market.strike;
    const finalDeltaPct = (finalDelta / market.strike) * 100;
    const playerPoint = playerPick === market.outcome;
    const botPoint = botPick === market.outcome;
    const nextScores = {
      player: scores.player + (playerPoint ? 1 : 0),
      bot: scores.bot + (botPoint ? 1 : 0),
    };

    let nextWinner: MatchWinner = null;
    if (nextScores.player >= TARGET_SCORE || nextScores.bot >= TARGET_SCORE) {
      if (nextScores.player > nextScores.bot) nextWinner = 'player';
      if (nextScores.bot > nextScores.player) nextWinner = 'bot';
    }

    setResult({
      outcome: market.outcome,
      playerPick,
      botPick,
      playerPoint,
      botPoint,
      delta: finalDelta,
      deltaPct: finalDeltaPct,
      overtime: isOvertime,
      nextScores,
    });
    setScores(nextScores);
    setWinner(nextWinner);
    setPhase('result');
  }, [playerPick, botPick, market, scores, isOvertime]);

  useEffect(() => {
    if (phase !== 'choose') return undefined;

    const deadline = Date.now() + CHOICE_MS;
    const frameId = window.requestAnimationFrame(() => {
      setChoiceLeft(CHOICE_MS);
    });

    const id = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setChoiceLeft(left);

      if (left <= 0) {
        window.clearInterval(id);
        commitChoice(randomDirection());
      }
    }, 90);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(id);
    };
  }, [phase, round, commitChoice]);

  useEffect(() => {
    if (phase !== 'live') return undefined;

    if (visibleCount >= TOTAL_CANDLES) {
      const id = window.setTimeout(resolveRound, 460);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      setVisibleCount((value) => Math.min(TOTAL_CANDLES, value + 1));
    }, LIVE_STEP_MS);

    return () => window.clearTimeout(id);
  }, [phase, visibleCount, resolveRound]);

  useEffect(() => {
    if (phase !== 'result' || !result) return undefined;

    const id = window.setTimeout(() => {
      if (winner) {
        setPhase('gameOver');
        return;
      }

      startNextRound();
    }, result.overtime ? 1700 : 1450);

    return () => window.clearTimeout(id);
  }, [phase, result, winner, startNextRound]);

  return (
    <div className="bo-page">
      <style>{`
        .bo-page {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          display: grid;
          grid-template-rows: 48px minmax(0, 1fr) 124px;
          gap: 8px;
          padding: 6px 8px max(6px, env(safe-area-inset-bottom));
          color: #fff;
          background: transparent;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .bo-page * {
          box-sizing: border-box;
        }

        .bo-top {
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr 82px 1fr;
          align-items: center;
          gap: 8px;
        }

        .bo-player {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bo-player-right {
          justify-content: flex-end;
          text-align: right;
        }

        .bo-avatar {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: #06100c;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: -.04em;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.42), 0 10px 22px rgba(0,0,0,.20);
        }

        .bo-avatar-player {
          background: linear-gradient(145deg, #33f0a2, #12a96e);
        }

        .bo-avatar-bot {
          background: linear-gradient(145deg, #ff7a81, #d93442);
        }

        .bo-player-copy {
          min-width: 0;
        }

        .bo-player-copy b,
        .bo-player-copy span {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .bo-player-copy b {
          color: rgba(255,255,255,.92);
          font-size: 12px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.035em;
        }

        .bo-player-copy span {
          margin-top: 4px;
          color: rgba(255,255,255,.35);
          font-size: 8px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: .16em;
        }

        .bo-score {
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(255,255,255,.035);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
        }

        .bo-score b {
          font-size: 20px;
          line-height: .86;
          font-weight: 900;
          letter-spacing: -.075em;
          font-variant-numeric: tabular-nums;
        }

        .bo-score span {
          margin-top: 1px;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .bo-stage {
          position: relative;
          min-height: 0;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.075);
          background: #080b11;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 16px 36px rgba(0,0,0,.18);
        }

        .bo-stage::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 72% 14%, rgba(26,203,127,.10), transparent 28%),
            radial-gradient(circle at 18% 88%, rgba(255,83,92,.08), transparent 30%);
          opacity: .95;
        }

        .bo-chart-wrap {
          position: relative;
          z-index: 1;
          height: 100%;
          min-height: 0;
          display: grid;
          grid-template-rows: 42px minmax(0, 1fr) 40px;
        }

        .bo-chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 12px 0;
        }

        .bo-chart-head b,
        .bo-chart-head span {
          display: block;
        }

        .bo-chart-head b {
          font-size: 13px;
          line-height: 1;
          font-weight: 860;
          letter-spacing: -.035em;
        }

        .bo-chart-head span {
          margin-top: 4px;
          color: rgba(255,255,255,.35);
          font-size: 9px;
          line-height: 1;
          font-weight: 720;
          letter-spacing: .04em;
        }

        .bo-live-price {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: -.055em;
          font-variant-numeric: tabular-nums;
        }

        .bo-text-up {
          color: #1acb7f;
        }

        .bo-text-down {
          color: #ff535c;
        }

        .bo-chart {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: block;
        }

        .bo-last-candle {
          filter: drop-shadow(0 0 7px rgba(255,255,255,.16));
        }

        .bo-price-dot {
          animation: boPulse 1.08s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes boPulse {
          0%, 100% { opacity: .72; }
          50% { opacity: 1; }
        }

        .bo-chart-bottom {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 7px;
          padding: 0 10px 10px;
        }

        .bo-chip {
          min-width: 0;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
          border-radius: 12px;
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.055);
          padding: 0 9px;
        }

        .bo-chip span {
          color: rgba(255,255,255,.34);
          font-size: 8px;
          line-height: 1;
          font-weight: 820;
          letter-spacing: .10em;
          text-transform: uppercase;
        }

        .bo-chip b {
          color: rgba(255,255,255,.86);
          font-size: 10px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.02em;
          font-variant-numeric: tabular-nums;
        }

        .bo-chip-picks b {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .bo-chip-picks i {
          width: 1px;
          height: 12px;
          background: rgba(255,255,255,.13);
        }

        .bo-tradebar {
          position: relative;
          min-height: 0;
          display: grid;
          grid-template-rows: 24px 70px 22px;
          gap: 5px;
          overflow: hidden;
        }

        .bo-info-line {
          display: grid;
          grid-template-columns: 1fr 64px 1fr;
          align-items: center;
          gap: 8px;
        }

        .bo-info-pill {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,.46);
          font-size: 9px;
          font-weight: 760;
          letter-spacing: .02em;
        }

        .bo-info-pill:last-child {
          justify-content: flex-end;
        }

        .bo-info-pill b {
          color: rgba(255,255,255,.82);
          font-size: 10px;
          font-weight: 850;
          font-variant-numeric: tabular-nums;
        }

        .bo-timer {
          width: 44px;
          height: 44px;
          justify-self: center;
          align-self: center;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background:
            conic-gradient(var(--timer-color) calc(var(--timer) * 1%), rgba(255,255,255,.075) 0),
            rgba(255,255,255,.035);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 10px 26px rgba(0,0,0,.16);
        }

        .bo-timer-idle {
          --timer-color: #ffffff;
        }

        .bo-timer-up {
          --timer-color: #1acb7f;
        }

        .bo-timer-down {
          --timer-color: #ff535c;
        }

        .bo-timer::before {
          content: "";
          position: absolute;
          width: 34px;
          height: 34px;
          border-radius: inherit;
          background: rgba(7,9,14,.94);
        }

        .bo-timer span {
          position: relative;
          z-index: 1;
          color: #fff;
          font-size: 13px;
          font-weight: 930;
          font-variant-numeric: tabular-nums;
        }

        .bo-actions {
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr 48px 1fr;
          gap: 8px;
          align-items: stretch;
        }

        .bo-arrow,
        .bo-reset {
          border: 0;
          outline: 0;
          color: #06100d;
          touch-action: manipulation;
          cursor: pointer;
          transition: transform .12s ease, opacity .12s ease, filter .12s ease;
        }

        .bo-arrow {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          display: grid;
          place-items: center;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.35), 0 16px 28px rgba(0,0,0,.18);
        }

        .bo-arrow svg {
          width: 36px;
          height: 36px;
          stroke-width: 3.4;
          filter: drop-shadow(0 1px 0 rgba(255,255,255,.18));
        }

        .bo-arrow::after {
          content: "";
          position: absolute;
          inset: 1px 1px auto;
          height: 42%;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,.32), transparent);
          pointer-events: none;
        }

        .bo-arrow-up {
          background: linear-gradient(180deg, #2ff4a5 0%, #16c97f 54%, #0c9d62 100%);
        }

        .bo-arrow-down {
          background: linear-gradient(180deg, #ff7c83 0%, #ff525c 54%, #c92d3b 100%);
        }

        .bo-arrow:disabled {
          opacity: .36;
          filter: grayscale(.72);
          cursor: default;
        }

        .bo-arrow:not(:disabled):active,
        .bo-reset:active {
          transform: scale(.965);
        }

        .bo-reset {
          height: 48px;
          align-self: center;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: rgba(255,255,255,.70);
          background: rgba(255,255,255,.065);
          border: 1px solid rgba(255,255,255,.075);
        }

        .bo-status {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: rgba(255,255,255,.52);
          font-size: 10px;
          font-weight: 730;
          letter-spacing: .02em;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bo-status b {
          color: rgba(255,255,255,.82);
          font-weight: 850;
        }

        .bo-dot-up,
        .bo-dot-down {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 999px;
        }

        .bo-dot-up {
          background: #1acb7f;
          box-shadow: 0 0 10px rgba(26,203,127,.58);
        }

        .bo-dot-down {
          background: #ff535c;
          box-shadow: 0 0 10px rgba(255,83,92,.58);
        }

        .bo-result-toast,
        .bo-game-over {
          position: absolute;
          z-index: 20;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          gap: 10px;
          width: min(300px, calc(100% - 28px));
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(8,11,17,.88);
          box-shadow: 0 24px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.07);
          backdrop-filter: blur(16px);
          padding: 13px;
        }

        .bo-result-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 16px;
          color: #06100d;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.34);
        }

        .bo-mark-up {
          background: #1acb7f;
        }

        .bo-mark-down {
          background: #ff535c;
        }

        .bo-result-toast b,
        .bo-result-toast span {
          display: block;
        }

        .bo-result-toast b {
          color: #fff;
          font-size: 16px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -.05em;
        }

        .bo-result-toast span {
          margin-top: 5px;
          color: rgba(255,255,255,.48);
          font-size: 10px;
          line-height: 1.2;
          font-weight: 680;
        }

        .bo-game-over {
          display: grid;
          justify-items: center;
          text-align: center;
          padding: 18px 14px 14px;
        }

        .bo-game-over-icon {
          width: 50px;
          height: 50px;
          display: grid;
          place-items: center;
          border-radius: 18px;
          color: #07100d;
          background: linear-gradient(145deg, #ffe27a, #ffb020);
          box-shadow: inset 0 2px 0 rgba(255,255,255,.42), 0 18px 42px rgba(255,176,32,.16);
        }

        .bo-game-over h2 {
          margin: 3px 0 0;
          font-size: 25px;
          line-height: .9;
          font-weight: 930;
          letter-spacing: -.075em;
        }

        .bo-game-over p {
          margin: 7px 0 0;
          color: rgba(255,255,255,.54);
          font-size: 11px;
          line-height: 1.35;
          font-weight: 650;
        }

        .bo-play-again {
          width: 100%;
          height: 42px;
          margin-top: 13px;
          border: 0;
          border-radius: 17px;
          color: #06100d;
          background: linear-gradient(180deg, #2ff4a5, #12b775);
          font-size: 10px;
          font-weight: 920;
          letter-spacing: .10em;
          text-transform: uppercase;
          box-shadow: inset 0 2px 0 rgba(255,255,255,.32);
        }

        @media (max-height: 690px) {
          .bo-page {
            grid-template-rows: 44px minmax(0, 1fr) 112px;
            gap: 6px;
            padding-top: 5px;
          }

          .bo-avatar {
            width: 31px;
            height: 31px;
            font-size: 12px;
          }

          .bo-score {
            height: 38px;
            border-radius: 16px;
          }

          .bo-score b {
            font-size: 18px;
          }

          .bo-stage {
            border-radius: 18px;
          }

          .bo-chart-wrap {
            grid-template-rows: 36px minmax(0, 1fr) 34px;
          }

          .bo-chart-head {
            padding-top: 8px;
          }

          .bo-chip {
            height: 26px;
            border-radius: 10px;
            padding: 0 7px;
          }

          .bo-tradebar {
            grid-template-rows: 22px 62px 18px;
            gap: 5px;
          }

          .bo-actions {
            grid-template-columns: 1fr 44px 1fr;
            gap: 7px;
          }

          .bo-arrow {
            border-radius: 20px;
          }

          .bo-reset {
            height: 44px;
            border-radius: 16px;
          }

          .bo-arrow svg {
            width: 32px;
            height: 32px;
          }

          .bo-timer {
            width: 40px;
            height: 40px;
          }

          .bo-timer::before {
            width: 31px;
            height: 31px;
          }

          .bo-status {
            font-size: 9px;
          }
        }
      `}</style>

      <header className="bo-top">
        <TopPlayer type="player" name="Ростик" />

        <div className="bo-score">
          <b>{scores.player}:{scores.bot}</b>
          <span>{isOvertime ? 'OT' : `R${round}`}</span>
        </div>

        <TopPlayer type="bot" name="Bot" />
      </header>

      <main className="bo-stage">
        <CandleChart
          market={market}
          visibleCount={visibleCount}
          phase={phase}
          playerPick={playerPick}
          botPick={botPick}
        />

        {phase === 'result' && result && <ResultToast result={result} />}

        {phase === 'gameOver' && (
          <section className="bo-game-over">
            <div className="bo-game-over-icon">
              <Trophy size={24} />
            </div>
            <h2>{winner === 'player' ? 'Победа' : 'Бот забрал'}</h2>
            <p>
              Финальный счет {scores.player}:{scores.bot}. При 3:3 включается extra round,
              где второй получает противоположную стрелку.
            </p>
            <button type="button" className="bo-play-again" onClick={resetMatch}>
              сыграть еще
            </button>
          </section>
        )}
      </main>

      <footer className="bo-tradebar">
        <div className="bo-info-line">
          <div className="bo-info-pill">
            <span>{phase === 'choose' ? 'choice' : 'expiry'}</span>
            <b>{phase === 'choose' ? '6s' : `${Math.ceil(LIVE_MS / 1000)}s`}</b>
          </div>

          <BoTimer
            progress={timerProgress}
            label={timerLabel}
            tone={phase === 'live' ? (delta >= 0 ? 'up' : 'down') : 'idle'}
          />

          <div className="bo-info-pill">
            <span>move</span>
            <b className={delta >= 0 ? 'bo-text-up' : 'bo-text-down'}>{formatPct(deltaPct)}</b>
          </div>
        </div>

        <div className="bo-actions">
          <button
            type="button"
            className="bo-arrow bo-arrow-up"
            disabled={phase !== 'choose'}
            onClick={() => commitChoice('up')}
            aria-label="Выбрать вверх"
          >
            <ChevronUp />
          </button>

          <button type="button" className="bo-reset" onClick={resetMatch} aria-label="Начать заново">
            <RefreshCcw size={17} />
          </button>

          <button
            type="button"
            className="bo-arrow bo-arrow-down"
            disabled={phase !== 'choose'}
            onClick={() => commitChoice('down')}
            aria-label="Выбрать вниз"
          >
            <ChevronDown />
          </button>
        </div>

        <div className="bo-status">
          <i className={delta >= 0 ? 'bo-dot-up' : 'bo-dot-down'} />
          <span>
            <b>{statusText}</b>
            {playerPick && botPick ? ` · you ${playerPick === 'up' ? '↑' : '↓'} / bot ${botPick === 'up' ? '↑' : '↓'}` : ''}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default VirusMarketGame;
