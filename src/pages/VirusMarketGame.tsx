import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Lock,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Player = 'p1' | 'p2';
type Phase = 'pickP1' | 'handoff' | 'pickP2' | 'market' | 'result' | 'gameover';

type CoinId =
  | 'frogx'
  | 'doge404'
  | 'mooncat'
  | 'rugrat'
  | 'pepeprime'
  | 'hamx'
  | 'bananavolt'
  | 'goblinbank'
  | 'tonrocket'
  | 'pixelape';

type Coin = {
  id: CoinId;
  symbol: string;
  name: string;
  emoji: string;
  tag: string;
  base: number;
  volatility: number;
  bias: number;
  color: string;
  glow: string;
  gradient: string;
};

type Picks = Record<Player, CoinId | null>;
type Scores = Record<Player, number>;

type MarketData = {
  histories: Record<CoinId, number[]>;
  eventLabel: string;
  eventTone: string;
};

const TARGET_SCORE = 4;
const MARKET_STEPS = 100;
const TICK_MS = 100;
const TRADE_DURATION_MS = MARKET_STEPS * TICK_MS;

const COINS: Coin[] = [
  {
    id: 'frogx',
    symbol: 'FRGX',
    name: 'Frog X',
    emoji: '🐸',
    tag: 'community pump',
    base: 1.12,
    volatility: 0.105,
    bias: 0.009,
    color: '#22c55e',
    glow: 'rgba(34,197,94,.55)',
    gradient: 'from-emerald-300 via-lime-400 to-green-500',
  },
  {
    id: 'doge404',
    symbol: 'D404',
    name: 'Doge 404',
    emoji: '🐶',
    tag: 'chaos meme',
    base: 0.74,
    volatility: 0.13,
    bias: 0.005,
    color: '#facc15',
    glow: 'rgba(250,204,21,.55)',
    gradient: 'from-yellow-200 via-amber-400 to-orange-500',
  },
  {
    id: 'mooncat',
    symbol: 'MCAT',
    name: 'Moon Cat',
    emoji: '🐱',
    tag: 'quiet whale',
    base: 2.4,
    volatility: 0.08,
    bias: 0.008,
    color: '#38bdf8',
    glow: 'rgba(56,189,248,.55)',
    gradient: 'from-sky-200 via-cyan-400 to-blue-500',
  },
  {
    id: 'rugrat',
    symbol: 'RUG',
    name: 'Rug Rat',
    emoji: '🐭',
    tag: 'danger coin',
    base: 0.42,
    volatility: 0.17,
    bias: -0.002,
    color: '#e879f9',
    glow: 'rgba(232,121,249,.55)',
    gradient: 'from-fuchsia-300 via-purple-500 to-violet-700',
  },
  {
    id: 'pepeprime',
    symbol: 'PEPX',
    name: 'Pepe Prime',
    emoji: '🟢',
    tag: 'viral wave',
    base: 1.86,
    volatility: 0.115,
    bias: 0.006,
    color: '#84cc16',
    glow: 'rgba(132,204,22,.55)',
    gradient: 'from-lime-200 via-green-400 to-emerald-600',
  },
  {
    id: 'hamx',
    symbol: 'HAMX',
    name: 'Hamster X',
    emoji: '🐹',
    tag: 'tap hype',
    base: 0.31,
    volatility: 0.145,
    bias: 0.004,
    color: '#fb923c',
    glow: 'rgba(251,146,60,.55)',
    gradient: 'from-orange-200 via-orange-400 to-red-500',
  },
  {
    id: 'bananavolt',
    symbol: 'BANV',
    name: 'Banana Volt',
    emoji: '🍌',
    tag: 'degen fuel',
    base: 0.92,
    volatility: 0.125,
    bias: 0.007,
    color: '#fde047',
    glow: 'rgba(253,224,71,.55)',
    gradient: 'from-yellow-100 via-yellow-300 to-lime-500',
  },
  {
    id: 'goblinbank',
    symbol: 'GOBL',
    name: 'Goblin Bank',
    emoji: '👹',
    tag: 'dark liquidity',
    base: 3.15,
    volatility: 0.09,
    bias: 0.003,
    color: '#a78bfa',
    glow: 'rgba(167,139,250,.55)',
    gradient: 'from-violet-200 via-purple-400 to-indigo-700',
  },
  {
    id: 'tonrocket',
    symbol: 'TONR',
    name: 'TON Rocket',
    emoji: '🚀',
    tag: 'telegram alpha',
    base: 1.58,
    volatility: 0.1,
    bias: 0.009,
    color: '#22d3ee',
    glow: 'rgba(34,211,238,.55)',
    gradient: 'from-cyan-200 via-sky-400 to-blue-600',
  },
  {
    id: 'pixelape',
    symbol: 'PAPE',
    name: 'Pixel Ape',
    emoji: '🦍',
    tag: 'nft relic',
    base: 0.67,
    volatility: 0.155,
    bias: 0.001,
    color: '#f472b6',
    glow: 'rgba(244,114,182,.55)',
    gradient: 'from-pink-200 via-rose-400 to-fuchsia-600',
  },
];

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

const coinById = (id: CoinId) => COINS.find((coin) => coin.id === id)!;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const formatPrice = (value: number) => {
  if (value >= 10) return value.toFixed(2);
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(4);
};

const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const getPct = (history: number[], step: number) => {
  const first = history[0];
  const current = history[Math.min(step, history.length - 1)];

  return ((current - first) / first) * 100;
};

const generateMarket = (): MarketData => {
  const histories = {} as Record<CoinId, number[]>;

  const hotCoin = COINS[Math.floor(Math.random() * COINS.length)].id;
  let cursedCoin = COINS[Math.floor(Math.random() * COINS.length)].id;

  if (cursedCoin === hotCoin) {
    cursedCoin = COINS[(COINS.findIndex((coin) => coin.id === hotCoin) + 3) % COINS.length].id;
  }

  const eventPool = [
    { label: 'Whale entered', tone: 'large wallet bought the dip' },
    { label: 'Meme wave', tone: 'social feed exploded' },
    { label: 'Fake listing rumor', tone: 'market is unstable' },
    { label: 'Liquidity trap', tone: 'spread got dangerous' },
    { label: 'Influencer candle', tone: 'one post moved the chart' },
    { label: 'Bot war', tone: 'algos are fighting' },
  ];

  const event = eventPool[Math.floor(Math.random() * eventPool.length)];

  COINS.forEach((coin) => {
    const values = [coin.base * randomBetween(0.97, 1.03)];
    let momentum = coin.bias + randomBetween(-0.012, 0.014);

    for (let i = 1; i <= MARKET_STEPS; i += 1) {
      const prev = values[i - 1];

      if (coin.id === hotCoin && i > 20 && i < 70) {
        momentum += randomBetween(0.004, 0.015);
      }

      if (coin.id === cursedCoin && i > 35 && i < 84) {
        momentum -= randomBetween(0.006, 0.02);
      }

      const lateShake = i > 72 ? randomBetween(-coin.volatility, coin.volatility) * 0.2 : 0;
      const noise = randomBetween(-coin.volatility, coin.volatility) * 0.18;
      const shock = Math.random() > 0.94 ? randomBetween(-coin.volatility * 0.65, coin.volatility * 0.82) : 0;

      momentum *= 0.9;
      momentum += coin.bias;
      momentum += noise + shock + lateShake;

      const next = Math.max(0.025, prev * (1 + momentum));
      values.push(next);
    }

    histories[coin.id] = values;
  });

  return {
    histories,
    eventLabel: event.label,
    eventTone: event.tone,
  };
};

const MiniLine = ({
  history,
  step,
  color,
}: {
  history: number[];
  step: number;
  color: string;
}) => {
  const width = 128;
  const height = 38;
  const visible = history.slice(0, Math.max(2, step + 1));
  const min = Math.min(...visible);
  const max = Math.max(...visible);
  const range = Math.max(max - min, 0.0001);

  const path = visible
    .map((value, index) => {
      const x = (index / Math.max(visible.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 5) - 2.5;

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="vm-mini-chart">
      <path d={path} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const ExchangeChart = ({
  market,
  step,
  picks,
}: {
  market: MarketData | null;
  step: number;
  picks: Picks;
}) => {
  const activeIds = useMemo(() => {
    const ids: CoinId[] = [];

    if (picks.p1) ids.push(picks.p1);
    if (picks.p2 && picks.p2 !== picks.p1) ids.push(picks.p2);

    if (ids.length === 0) return ['tonrocket', 'frogx'] as CoinId[];

    return ids;
  }, [picks]);

  const width = 420;
  const height = 238;
  const padX = 18;
  const padY = 18;

  if (!market) {
    return (
      <div className="vm-chart-empty">
        <div className="vm-chart-grid" />
        <BarChart3 size={32} />
        <span>WAITING FOR TRADES</span>
      </div>
    );
  }

  const series = activeIds.map((id) => ({
    coin: coinById(id),
    values: market.histories[id].slice(0, Math.max(2, step + 1)),
  }));

  const all = series.flatMap((item) => item.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(max - min, 0.0001);

  const yOf = (value: number) => height - padY - ((value - min) / range) * (height - padY * 2);
  const xOf = (index: number) => padX + (index / MARKET_STEPS) * (width - padX * 2);

  const gridLabels = [max, min + range * 0.66, min + range * 0.33, min];

  return (
    <div className="vm-chart">
      <div className="vm-chart-grid" />

      <div className="vm-chart-scale">
        {gridLabels.map((label) => (
          <span key={label}>{formatPrice(label)}</span>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="vm-chart-svg">
        {[0.25, 0.5, 0.75].map((line) => (
          <line
            key={line}
            x1={padX}
            x2={width - padX}
            y1={padY + (height - padY * 2) * line}
            y2={padY + (height - padY * 2) * line}
            stroke="rgba(255,255,255,.08)"
            strokeWidth="1"
          />
        ))}

        {series.map(({ coin, values }, seriesIndex) => {
          const path = values
            .map((value, index) => {
              const x = xOf(index);
              const y = yOf(value);

              return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');

          const last = values[values.length - 1];
          const lastX = xOf(values.length - 1);
          const lastY = yOf(last);

          return (
            <g key={coin.id}>
              <path
                d={path}
                fill="none"
                stroke={coin.color}
                strokeWidth={seriesIndex === 0 ? 5 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={seriesIndex === 0 ? 1 : 0.82}
              />

              <circle cx={lastX} cy={lastY} r={6} fill={coin.color} />
              <circle cx={lastX} cy={lastY} r={12} fill={coin.color} opacity="0.14" />
            </g>
          );
        })}
      </svg>

      <div className="vm-chart-legend">
        {series.map(({ coin, values }) => {
          const currentPct = getPct(values, values.length - 1);

          return (
            <div key={coin.id} className="vm-legend-item">
              <i style={{ background: coin.color, boxShadow: `0 0 18px ${coin.glow}` }} />
              <span>${coin.symbol}</span>
              <b className={currentPct >= 0 ? 'vm-up' : 'vm-down'}>{formatPct(currentPct)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CoinCard = ({
  coin,
  selected,
  disabled,
  market,
  step,
  onClick,
}: {
  coin: Coin;
  selected: boolean;
  disabled: boolean;
  market: MarketData | null;
  step: number;
  onClick: () => void;
}) => {
  const history = market?.histories[coin.id] ?? [coin.base, coin.base * 1.01, coin.base * 0.99, coin.base * 1.02];
  const visibleStep = Math.min(step, history.length - 1);
  const current = history[visibleStep];
  const currentPct = getPct(history, visibleStep);
  const isUp = currentPct >= 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`vm-coin ${selected ? 'vm-coin-selected' : ''}`}
      style={cssVars({
        '--coin': coin.color,
        '--glow': coin.glow,
      })}
    >
      <div className={`vm-coin-bg bg-gradient-to-br ${coin.gradient}`} />

      <div className="vm-coin-head">
        <div className="vm-coin-icon">{coin.emoji}</div>

        <div className={`vm-change ${isUp ? 'vm-up' : 'vm-down'}`}>
          {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {formatPct(currentPct)}
        </div>
      </div>

      <div className="vm-symbol">${coin.symbol}</div>
      <div className="vm-name">{coin.name}</div>
      <div className="vm-tag">{coin.tag}</div>

      <div className="vm-card-chart">
        <MiniLine history={history} step={visibleStep} color={coin.color} />
      </div>

      <div className="vm-price-row">
        <span>price</span>
        <b>{formatPrice(current)}</b>
      </div>
    </button>
  );
};

const Score = ({
  label,
  score,
  active,
}: {
  label: string;
  score: number;
  active: boolean;
}) => (
  <div className={`vm-score ${active ? 'vm-score-active' : ''}`}>
    <span>{label}</span>
    <b>{score}</b>
  </div>
);

export const VirusMarketGame = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('pickP1');
  const [scores, setScores] = useState<Scores>({ p1: 0, p2: 0 });
  const [round, setRound] = useState(1);
  const [picks, setPicks] = useState<Picks>({ p1: null, p2: null });
  const [draft, setDraft] = useState<CoinId | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('P1 выбирает coin. P2 не смотрит.');
  const [lastWinner, setLastWinner] = useState<Player | 'draw' | null>(null);

  const activePlayer: Player = phase === 'pickP2' ? 'p2' : 'p1';
  const canPick = phase === 'pickP1' || phase === 'pickP2';
  const isRevealed = phase === 'market' || phase === 'result' || phase === 'gameover';

  const matchWinner: Player | null =
    scores.p1 >= TARGET_SCORE ? 'p1' : scores.p2 >= TARGET_SCORE ? 'p2' : null;

  const p1Coin = picks.p1 ? coinById(picks.p1) : null;
  const p2Coin = picks.p2 ? coinById(picks.p2) : null;

  const pnl = useMemo(() => {
    if (!market || !picks.p1 || !picks.p2) return { p1: 0, p2: 0 };

    return {
      p1: getPct(market.histories[picks.p1], step),
      p2: getPct(market.histories[picks.p2], step),
    };
  }, [market, picks, step]);

  const tradeProgress = phase === 'market' ? Math.min(100, (step / MARKET_STEPS) * 100) : 0;
  const secondsLeft = phase === 'market' ? Math.max(0, Math.ceil((TRADE_DURATION_MS - step * TICK_MS) / 1000)) : 10;

  const selectedCoin = draft ? coinById(draft) : null;

  const finishRound = (finalMarket: MarketData) => {
    if (!picks.p1 || !picks.p2) return;

    const p1Pnl = getPct(finalMarket.histories[picks.p1], MARKET_STEPS);
    const p2Pnl = getPct(finalMarket.histories[picks.p2], MARKET_STEPS);

    if (Math.abs(p1Pnl - p2Pnl) < 0.15) {
      setLastWinner('draw');
      setPhase('result');
      setMessage('Ничья. Оба почти одинаково зашли в рынок.');
      return;
    }

    const winner: Player = p1Pnl > p2Pnl ? 'p1' : 'p2';
    const nextScores = {
      ...scores,
      [winner]: scores[winner] + 1,
    };

    setLastWinner(winner);
    setScores(nextScores);

    if (nextScores[winner] >= TARGET_SCORE) {
      setPhase('gameover');
      setMessage(`${winner === 'p1' ? 'P1' : 'P2'} забрал рынок.`);
      return;
    }

    setPhase('result');
    setMessage(`${winner === 'p1' ? 'P1' : 'P2'} заработал больше.`);
  };

  useEffect(() => {
    if (phase !== 'market' || !market) return undefined;

    if (step >= MARKET_STEPS) {
      const id = window.setTimeout(() => {
        finishRound(market);
      }, 380);

      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      setStep((value) => Math.min(value + 1, MARKET_STEPS));
    }, TICK_MS);

    return () => window.clearTimeout(id);
  }, [phase, step, market]);

  const confirmPick = () => {
    if (!canPick || !draft) return;

    if (phase === 'pickP1') {
      setPicks({ p1: draft, p2: null });
      setDraft(null);
      setPhase('handoff');
      setMessage('Выбор P1 скрыт. Передай телефон P2.');
      return;
    }

    const nextPicks: Picks = {
      ...picks,
      p2: draft,
    };

    const nextMarket = generateMarket();

    setPicks(nextPicks);
    setDraft(null);
    setMarket(nextMarket);
    setStep(0);
    setLastWinner(null);
    setPhase('market');
    setMessage('Торги начались. 10 секунд до закрытия рынка.');
  };

  const nextRound = () => {
    setRound((value) => value + 1);
    setPicks({ p1: null, p2: null });
    setDraft(null);
    setMarket(null);
    setStep(0);
    setLastWinner(null);
    setPhase('pickP1');
    setMessage('P1 выбирает coin. P2 не смотрит.');
  };

  const resetMatch = () => {
    setPhase('pickP1');
    setScores({ p1: 0, p2: 0 });
    setRound(1);
    setPicks({ p1: null, p2: null });
    setDraft(null);
    setMarket(null);
    setStep(0);
    setMessage('P1 выбирает coin. P2 не смотрит.');
    setLastWinner(null);
  };

  const title =
    phase === 'market'
      ? 'LIVE TRADING'
      : phase === 'result'
        ? 'ROUND CLOSED'
        : phase === 'gameover'
          ? 'MARKET WON'
          : phase === 'handoff'
            ? 'SECRET PICK'
            : activePlayer === 'p1'
              ? 'P1 BUY'
              : 'P2 BUY';

  return (
    <div className="vm-page">
      <style>{`
        .vm-page {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 8px max(10px, env(safe-area-inset-bottom));
          color: white;
          background:
            radial-gradient(circle at 12% 0%, rgba(16,185,129,.18), transparent 30%),
            radial-gradient(circle at 88% 8%, rgba(139,92,246,.18), transparent 34%),
            radial-gradient(circle at 48% 42%, rgba(34,211,238,.08), transparent 36%),
            linear-gradient(180deg, #020617 0%, #050610 46%, #020617 100%);
          user-select: none;
          -webkit-overflow-scrolling: touch;
        }

        .vm-page * {
          box-sizing: border-box;
        }

        .vm-page::before {
          content: "";
          position: fixed;
          inset: -30%;
          pointer-events: none;
          opacity: .13;
          background:
            linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
          background-size: 34px 34px;
          transform: rotate(-7deg);
        }

        .vm-up {
          color: #86efac;
        }

        .vm-down {
          color: #fca5a5;
        }

        .vm-top {
          position: relative;
          z-index: 4;
          display: grid;
          grid-template-columns: 36px 1fr 36px;
          align-items: center;
          gap: 8px;
          margin-bottom: 7px;
        }

        .vm-back,
        .vm-round {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.06);
          color: rgba(255,255,255,.75);
          backdrop-filter: blur(18px);
        }

        .vm-round {
          color: white;
          font-size: 13px;
          font-weight: 1000;
        }

        .vm-title {
          min-width: 0;
          text-align: center;
        }

        .vm-title small {
          display: block;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .24em;
          text-transform: uppercase;
        }

        .vm-title h1 {
          margin: 3px 0 0;
          font-size: 22px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.07em;
          background: linear-gradient(90deg, #bbf7d0, #fff, #c4b5fd);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .vm-score-row {
          position: relative;
          z-index: 4;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          margin-bottom: 7px;
        }

        .vm-score {
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 15px;
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.052);
          padding: 0 11px;
          opacity: .72;
          backdrop-filter: blur(18px);
        }

        .vm-score-active {
          opacity: 1;
          border-color: rgba(34,211,238,.28);
          box-shadow: 0 0 28px rgba(34,211,238,.12);
        }

        .vm-score span {
          color: rgba(255,255,255,.5);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vm-score b {
          font-size: 17px;
          line-height: 1;
          font-weight: 1000;
        }

        .vm-panel {
          position: relative;
          z-index: 3;
          overflow: hidden;
          border-radius: 25px;
          border: 1px solid rgba(255,255,255,.1);
          background:
            linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.026)),
            rgba(2,6,23,.7);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.1),
            0 22px 70px rgba(0,0,0,.34);
          backdrop-filter: blur(20px);
        }

        .vm-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 32px;
          padding: 8px 10px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.22);
        }

        .vm-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,255,255,.74);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vm-live i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 16px rgba(34,197,94,.8);
        }

        .vm-event {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .vm-timer {
          padding: 0 10px 10px;
        }

        .vm-timer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          color: rgba(255,255,255,.45);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vm-time-left {
          color: #a7f3d0;
        }

        .vm-progress {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
        }

        .vm-progress-fill {
          height: 100%;
          width: var(--progress);
          border-radius: inherit;
          background: linear-gradient(90deg, #22c55e, #22d3ee, #a78bfa);
          box-shadow: 0 0 24px rgba(34,211,238,.35);
          transition: width .1s linear;
        }

        .vm-chart,
        .vm-chart-empty {
          position: relative;
          height: 248px;
          margin: 10px;
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.08);
          background:
            radial-gradient(circle at 20% 20%, rgba(34,197,94,.12), transparent 35%),
            radial-gradient(circle at 82% 28%, rgba(139,92,246,.14), transparent 36%),
            rgba(0,0,0,.28);
        }

        .vm-chart-empty {
          display: grid;
          place-items: center;
          color: rgba(255,255,255,.38);
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vm-chart-empty svg {
          opacity: .55;
          margin-bottom: 34px;
        }

        .vm-chart-empty span {
          position: absolute;
          bottom: 74px;
        }

        .vm-chart-grid {
          position: absolute;
          inset: 0;
          opacity: .42;
          background:
            linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px);
          background-size: 42px 34px;
          mask-image: linear-gradient(180deg, transparent, black 12%, black 88%, transparent);
        }

        .vm-chart-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .vm-chart-scale {
          position: absolute;
          right: 8px;
          top: 13px;
          bottom: 50px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-end;
          pointer-events: none;
        }

        .vm-chart-scale span {
          padding: 3px 5px;
          border-radius: 999px;
          background: rgba(0,0,0,.32);
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 1000;
          backdrop-filter: blur(12px);
        }

        .vm-chart-legend {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 8px;
          z-index: 5;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .vm-legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(0,0,0,.34);
          padding: 6px 8px;
          backdrop-filter: blur(12px);
        }

        .vm-legend-item i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
        }

        .vm-legend-item span {
          color: rgba(255,255,255,.62);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .12em;
        }

        .vm-legend-item b {
          font-size: 9px;
          font-weight: 1000;
        }

        .vm-picks {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          padding: 0 10px 10px;
        }

        .vm-pick {
          min-width: 0;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.045);
          padding: 9px;
        }

        .vm-pick-top {
          display: flex;
          justify-content: space-between;
          gap: 7px;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vm-pick-main {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vm-pick-icon {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: rgba(255,255,255,.08);
          font-size: 17px;
        }

        .vm-pick-name {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: white;
          font-size: 12px;
          font-weight: 1000;
          letter-spacing: -.04em;
        }

        .vm-pnl {
          margin-top: 7px;
          font-size: 20px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.06em;
        }

        .vm-market-list-title {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 12px 2px 8px;
          color: rgba(255,255,255,.55);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vm-market-list-title span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .vm-coin-grid {
          position: relative;
          z-index: 3;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding-bottom: 8px;
        }

        .vm-coin {
          position: relative;
          min-height: 136px;
          overflow: hidden;
          text-align: left;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.052);
          padding: 11px;
          color: white;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.1),
            0 18px 45px rgba(0,0,0,.25);
          backdrop-filter: blur(18px);
          transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease;
        }

        .vm-coin:active {
          transform: scale(.97);
        }

        .vm-coin-selected {
          border-color: color-mix(in srgb, var(--coin) 70%, white 10%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.14),
            0 0 0 1px color-mix(in srgb, var(--coin) 35%, transparent),
            0 18px 50px var(--glow);
        }

        .vm-coin-bg {
          position: absolute;
          inset: 0;
          opacity: .15;
        }

        .vm-coin-head,
        .vm-symbol,
        .vm-name,
        .vm-tag,
        .vm-card-chart,
        .vm-price-row {
          position: relative;
        }

        .vm-coin-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }

        .vm-coin-icon {
          font-size: 25px;
          line-height: 1;
        }

        .vm-change {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border-radius: 999px;
          background: rgba(0,0,0,.24);
          padding: 5px 7px;
          font-size: 9px;
          font-weight: 1000;
        }

        .vm-symbol {
          margin-top: 7px;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .16em;
        }

        .vm-name {
          margin-top: 4px;
          font-size: 15px;
          line-height: .95;
          font-weight: 1000;
          letter-spacing: -.055em;
        }

        .vm-tag {
          margin-top: 4px;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 850;
        }

        .vm-card-chart {
          margin-top: 7px;
          height: 31px;
          opacity: .95;
        }

        .vm-mini-chart {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .vm-price-row {
          margin-top: 7px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .vm-price-row span {
          color: rgba(255,255,255,.35);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vm-price-row b {
          font-size: 13px;
          font-weight: 1000;
        }

        .vm-card {
          position: relative;
          z-index: 5;
          overflow: hidden;
          margin-top: 10px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.12);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.14), transparent 46%),
            rgba(2,6,23,.78);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.12),
            0 26px 80px rgba(0,0,0,.45);
          backdrop-filter: blur(22px);
          padding: 20px;
          text-align: center;
        }

        .vm-card-icon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          margin: 0 auto 12px;
          border-radius: 23px;
          background: linear-gradient(135deg, rgba(34,197,94,.2), rgba(34,211,238,.18), rgba(168,85,247,.2));
          font-size: 30px;
        }

        .vm-card h2 {
          margin: 0;
          font-size: 30px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.08em;
        }

        .vm-card p {
          margin: 11px auto 0;
          max-width: 310px;
          color: rgba(255,255,255,.62);
          font-size: 12px;
          line-height: 1.35;
          font-weight: 750;
        }

        .vm-result-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 15px;
        }

        .vm-result-cell {
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.055);
          padding: 11px 8px;
        }

        .vm-result-cell span {
          color: rgba(255,255,255,.4);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vm-result-cell b {
          display: block;
          margin-top: 7px;
          font-size: 23px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -.06em;
        }

        .vm-bottom {
          position: sticky;
          z-index: 20;
          bottom: -10px;
          margin: 10px -8px 0;
          padding: 8px 8px max(8px, env(safe-area-inset-bottom));
          background:
            linear-gradient(180deg, transparent 0%, rgba(2,6,23,.86) 28%, rgba(2,6,23,.96) 100%);
          backdrop-filter: blur(18px);
        }

        .vm-message {
          min-height: 15px;
          margin-bottom: 7px;
          text-align: center;
          color: rgba(255,255,255,.68);
          font-size: 10px;
          line-height: 1.25;
          font-weight: 800;
        }

        .vm-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 7px;
        }

        .vm-button {
          min-height: 42px;
          border: 0;
          border-radius: 19px;
          padding: 0 15px;
          background: linear-gradient(135deg, #6ee7b7, #22d3ee 48%, #a78bfa);
          color: #020617;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .12em;
          text-transform: uppercase;
          box-shadow:
            0 18px 44px rgba(34,211,238,.2),
            inset 0 2px 0 rgba(255,255,255,.35);
        }

        .vm-button:disabled {
          opacity: .45;
          filter: grayscale(1);
        }

        .vm-button:active {
          transform: scale(.97);
        }

        .vm-ghost {
          min-width: 76px;
          color: rgba(255,255,255,.68);
          background: rgba(255,255,255,.075);
          border: 1px solid rgba(255,255,255,.1);
          box-shadow: 0 16px 40px rgba(0,0,0,.22);
        }

        @media (max-height: 720px) {
          .vm-chart,
          .vm-chart-empty {
            height: 220px;
          }

          .vm-coin {
            min-height: 126px;
            border-radius: 22px;
          }

          .vm-name {
            font-size: 14px;
          }
        }
      `}</style>

      <header className="vm-top">
        <button type="button" className="vm-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>

        <div className="vm-title">
          <small>{title}</small>
          <h1>Virus Market</h1>
        </div>

        <div className="vm-round">{round}</div>
      </header>

      <div className="vm-score-row">
        <Score label="P1" score={scores.p1} active={activePlayer === 'p1' && canPick} />
        <Score label="P2" score={scores.p2} active={activePlayer === 'p2' && canPick} />
      </div>

      <section className="vm-panel">
        <div className="vm-panel-head">
          <div className="vm-live">
            <i />
            {phase === 'market' ? 'LIVE' : 'EXCHANGE'}
          </div>

          <div className="vm-event">
            {market ? `${market.eventLabel} · ${market.eventTone}` : 'fake meme coin exchange'}
          </div>
        </div>

        <ExchangeChart market={market} step={step} picks={picks} />

        <div className="vm-timer">
          <div className="vm-timer-row">
            <span>Trading round</span>
            <span className="vm-time-left">{phase === 'market' ? `${secondsLeft}s left` : '10s'}</span>
          </div>

          <div className="vm-progress">
            <div className="vm-progress-fill" style={cssVars({ '--progress': `${tradeProgress}%` })} />
          </div>
        </div>

        <div className="vm-picks">
          <div className="vm-pick">
            <div className="vm-pick-top">
              <span>P1 PICK</span>
              <Lock size={11} />
            </div>

            <div className="vm-pick-main">
              <div className="vm-pick-icon">{isRevealed && p1Coin ? p1Coin.emoji : '🔒'}</div>
              <div className="vm-pick-name">{isRevealed && p1Coin ? p1Coin.name : 'Hidden'}</div>
            </div>

            {isRevealed && (
              <div className={`vm-pnl ${pnl.p1 >= 0 ? 'vm-up' : 'vm-down'}`}>
                {formatPct(pnl.p1)}
              </div>
            )}
          </div>

          <div className="vm-pick">
            <div className="vm-pick-top">
              <span>P2 PICK</span>
              <Zap size={11} />
            </div>

            <div className="vm-pick-main">
              <div className="vm-pick-icon">{isRevealed && p2Coin ? p2Coin.emoji : '🔒'}</div>
              <div className="vm-pick-name">{isRevealed && p2Coin ? p2Coin.name : 'Hidden'}</div>
            </div>

            {isRevealed && (
              <div className={`vm-pnl ${pnl.p2 >= 0 ? 'vm-up' : 'vm-down'}`}>
                {formatPct(pnl.p2)}
              </div>
            )}
          </div>
        </div>
      </section>

      {canPick && (
        <>
          <div className="vm-market-list-title">
            <span>
              <Activity size={13} />
              Choose coin
            </span>
            <span>{activePlayer === 'p1' ? 'P1 turn' : 'P2 turn'}</span>
          </div>

          <section className="vm-coin-grid">
            {COINS.map((coin) => (
              <CoinCard
                key={coin.id}
                coin={coin}
                selected={draft === coin.id}
                disabled={!canPick}
                market={market}
                step={step}
                onClick={() => setDraft(coin.id)}
              />
            ))}
          </section>
        </>
      )}

      {phase === 'handoff' && (
        <section className="vm-card">
          <div className="vm-card-icon">🤫</div>
          <h2>Передай телефон</h2>
          <p>P1 уже купил coin. Выбор скрыт. Теперь P2 выбирает свой вход в рынок.</p>

          <button
            type="button"
            className="vm-button"
            onClick={() => {
              setPhase('pickP2');
              setMessage('P2 выбирает coin. P1 не смотрит.');
            }}
            style={{ marginTop: 17, width: '100%' }}
          >
            P2 готов
          </button>
        </section>
      )}

      {(phase === 'result' || phase === 'gameover') && (
        <section className="vm-card">
          <div className="vm-card-icon">
            {lastWinner === 'draw' ? '⚖️' : lastWinner === 'p1' ? '🟢' : '🟣'}
          </div>

          <h2>
            {phase === 'gameover'
              ? matchWinner === 'p1'
                ? 'P1 забрал рынок'
                : 'P2 забрал рынок'
              : lastWinner === 'draw'
                ? 'Ничья'
                : `${lastWinner === 'p1' ? 'P1' : 'P2'} +1`}
          </h2>

          <p>
            {market?.eventLabel}. P1: {formatPct(pnl.p1)} · P2: {formatPct(pnl.p2)}
          </p>

          <div className="vm-result-grid">
            <div className="vm-result-cell">
              <span>P1</span>
              <b className={pnl.p1 >= 0 ? 'vm-up' : 'vm-down'}>{formatPct(pnl.p1)}</b>
            </div>

            <div className="vm-result-cell">
              <span>P2</span>
              <b className={pnl.p2 >= 0 ? 'vm-up' : 'vm-down'}>{formatPct(pnl.p2)}</b>
            </div>
          </div>

          <button
            type="button"
            className="vm-button"
            onClick={phase === 'gameover' ? resetMatch : nextRound}
            style={{ marginTop: 17, width: '100%' }}
          >
            {phase === 'gameover' ? 'Новый матч' : 'Следующий раунд'}
          </button>
        </section>
      )}

      <footer className="vm-bottom">
        <div className="vm-message">{message}</div>

        <div className="vm-actions">
          <button
            type="button"
            className="vm-button"
            disabled={!canPick || !draft}
            onClick={confirmPick}
          >
            {selectedCoin ? `Buy $${selectedCoin.symbol}` : 'Выбери coin'}
          </button>

          <button type="button" className="vm-button vm-ghost" onClick={resetMatch}>
            Reset
          </button>
        </div>
      </footer>
    </div>
  );
};

export default VirusMarketGame;