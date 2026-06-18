import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Lock,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Player = 'p1' | 'p2';
type Phase = 'pickP1' | 'handoff' | 'pickP2' | 'market' | 'result';

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
};

type Picks = Record<Player, CoinId | null>;

type MarketData = {
  histories: Record<CoinId, number[]>;
  eventLabel: string;
  eventTone: string;
  hotCoin: CoinId;
  weakCoin: CoinId;
};

const TRADE_SECONDS = 40;
const MARKET_STEPS = 200;
const TICK_MS = 200;
const TRADE_DURATION_MS = TRADE_SECONDS * 1000;

// Рынок остаётся азартным, но без абсурдных тысяч процентов.
const MAX_PRICE_MULTIPLIER = 1.8;
const MIN_PRICE_MULTIPLIER = 0.6;

const COINS: Coin[] = [
  {
    id: 'frogx',
    symbol: 'FRGX',
    name: 'Frog X',
    emoji: '🐸',
    tag: 'community',
    base: 1.12,
    volatility: 0.038,
    bias: 0.0014,
    color: '#22c55e',
    glow: 'rgba(34,197,94,.35)',
  },
  {
    id: 'doge404',
    symbol: 'D404',
    name: 'Doge 404',
    emoji: '🐶',
    tag: 'chaos meme',
    base: 0.74,
    volatility: 0.046,
    bias: 0.001,
    color: '#facc15',
    glow: 'rgba(250,204,21,.32)',
  },
  {
    id: 'mooncat',
    symbol: 'MCAT',
    name: 'Moon Cat',
    emoji: '🐱',
    tag: 'stable hype',
    base: 2.4,
    volatility: 0.032,
    bias: 0.0012,
    color: '#38bdf8',
    glow: 'rgba(56,189,248,.35)',
  },
  {
    id: 'rugrat',
    symbol: 'RUG',
    name: 'Rug Rat',
    emoji: '🐭',
    tag: 'high risk',
    base: 0.42,
    volatility: 0.052,
    bias: -0.0002,
    color: '#e879f9',
    glow: 'rgba(232,121,249,.34)',
  },
  {
    id: 'pepeprime',
    symbol: 'PEPX',
    name: 'Pepe Prime',
    emoji: '🟢',
    tag: 'viral wave',
    base: 1.86,
    volatility: 0.041,
    bias: 0.001,
    color: '#84cc16',
    glow: 'rgba(132,204,22,.32)',
  },
  {
    id: 'hamx',
    symbol: 'HAMX',
    name: 'Hamster X',
    emoji: '🐹',
    tag: 'tap hype',
    base: 0.31,
    volatility: 0.049,
    bias: 0.0007,
    color: '#fb923c',
    glow: 'rgba(251,146,60,.32)',
  },
  {
    id: 'bananavolt',
    symbol: 'BANV',
    name: 'Banana Volt',
    emoji: '🍌',
    tag: 'degen fuel',
    base: 0.92,
    volatility: 0.043,
    bias: 0.001,
    color: '#fde047',
    glow: 'rgba(253,224,71,.30)',
  },
  {
    id: 'goblinbank',
    symbol: 'GOBL',
    name: 'Goblin Bank',
    emoji: '👹',
    tag: 'liquidity',
    base: 3.15,
    volatility: 0.033,
    bias: 0.0006,
    color: '#a78bfa',
    glow: 'rgba(167,139,250,.34)',
  },
  {
    id: 'tonrocket',
    symbol: 'TONR',
    name: 'TON Rocket',
    emoji: '🚀',
    tag: 'telegram',
    base: 1.58,
    volatility: 0.036,
    bias: 0.0013,
    color: '#22d3ee',
    glow: 'rgba(34,211,238,.35)',
  },
  {
    id: 'pixelape',
    symbol: 'PAPE',
    name: 'Pixel Ape',
    emoji: '🦍',
    tag: 'nft relic',
    base: 0.67,
    volatility: 0.05,
    bias: 0.0002,
    color: '#f472b6',
    glow: 'rgba(244,114,182,.32)',
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

const getCurrent = (history: number[], step: number) => history[Math.min(step, history.length - 1)];

const generateMarket = (): MarketData => {
  const histories = {} as Record<CoinId, number[]>;

  const hotCoin = COINS[Math.floor(Math.random() * COINS.length)].id;
  let weakCoin = COINS[Math.floor(Math.random() * COINS.length)].id;

  if (weakCoin === hotCoin) {
    weakCoin = COINS[(COINS.findIndex((coin) => coin.id === hotCoin) + 4) % COINS.length].id;
  }

  const eventPool = [
    { label: 'Whale entry', tone: 'large wallet opened a position' },
    { label: 'Meme wave', tone: 'social volume is moving buyers' },
    { label: 'Listing rumor', tone: 'market is pricing new liquidity' },
    { label: 'Bot fight', tone: 'algorithms are pushing the spread' },
    { label: 'Panic bid', tone: 'late buyers are chasing candles' },
    { label: 'Quiet pump', tone: 'low volume but steady pressure' },
  ];

  const event = eventPool[Math.floor(Math.random() * eventPool.length)];

  COINS.forEach((coin) => {
    const start = coin.base * randomBetween(0.988, 1.012);
    const values = [start];
    let momentum = coin.bias + randomBetween(-0.0038, 0.0048);

    for (let i = 1; i <= MARKET_STEPS; i += 1) {
      const prev = values[i - 1];
      const progress = i / MARKET_STEPS;
      const trendWindow = Math.sin(Math.PI * progress);
      const lateDamping = i > MARKET_STEPS * 0.78 ? 0.62 : 1;

      let localMomentum = momentum * 0.76 + coin.bias;

      if (coin.id === hotCoin && i > MARKET_STEPS * 0.18 && i < MARKET_STEPS * 0.76) {
        localMomentum += randomBetween(0.00045, 0.0026) * trendWindow;
      }

      if (coin.id === weakCoin && i > MARKET_STEPS * 0.28 && i < MARKET_STEPS * 0.86) {
        localMomentum -= randomBetween(0.00045, 0.0029) * trendWindow;
      }

      const noise = randomBetween(-coin.volatility, coin.volatility) * 0.052 * lateDamping;
      const microShock = Math.random() > 0.955 ? randomBetween(-coin.volatility * 0.12, coin.volatility * 0.15) : 0;

      momentum = localMomentum + noise + microShock;

      const rawNext = prev * (1 + momentum);
      const next = Math.max(
        start * MIN_PRICE_MULTIPLIER,
        Math.min(start * MAX_PRICE_MULTIPLIER, rawNext),
      );

      values.push(next);
    }

    histories[coin.id] = values;
  });

  return {
    histories,
    eventLabel: event.label,
    eventTone: event.tone,
    hotCoin,
    weakCoin,
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
  const height = 34;
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
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const EmptyChart = () => (
  <div className="vm-chart-empty">
    <div className="vm-chart-empty-icon">
      <BarChart3 size={30} />
    </div>
    <b>Choose coins</b>
    <span>one 40s trading round</span>
  </div>
);

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

    return ids;
  }, [picks]);

  const width = 420;
  const height = 228;
  const padX = 22;
  const padY = 24;

  if (!market || activeIds.length === 0) return <EmptyChart />;

  const series = activeIds.map((id) => {
    const coin = coinById(id);
    const values = market.histories[id].slice(0, Math.max(2, step + 1));
    const pctValues = values.map((_, index) => getPct(market.histories[id], index));

    return {
      coin,
      pctValues,
    };
  });

  const allPct = series.flatMap((item) => item.pctValues);
  const minPct = Math.min(-10, Math.min(...allPct));
  const maxPct = Math.max(10, Math.max(...allPct));
  const pctRange = Math.max(maxPct - minPct, 0.0001);

  const yOf = (value: number) => height - padY - ((value - minPct) / pctRange) * (height - padY * 2);
  const xOf = (index: number) => padX + (index / MARKET_STEPS) * (width - padX * 2);
  const zeroY = yOf(0);

  return (
    <div className="vm-chart">
      <div className="vm-chart-soft-grid" />

      <svg viewBox={`0 0 ${width} ${height}`} className="vm-chart-svg">
        {[0.25, 0.5, 0.75].map((line) => (
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
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,.16)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
        />

        {series.map(({ coin, pctValues }, index) => {
          const path = pctValues
            .map((value, pointIndex) => {
              const x = xOf(pointIndex);
              const y = yOf(value);

              return `${pointIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');

          const lastPct = pctValues[pctValues.length - 1];
          const lastX = xOf(pctValues.length - 1);
          const lastY = yOf(lastPct);

          return (
            <g key={coin.id}>
              <path
                d={path}
                fill="none"
                stroke={coin.color}
                strokeWidth={index === 0 ? 4.6 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={index === 0 ? 1 : 0.82}
              />

              <circle cx={lastX} cy={lastY} r={5.4} fill={coin.color} />
              <circle cx={lastX} cy={lastY} r={13} fill={coin.color} opacity="0.10" />
            </g>
          );
        })}
      </svg>

      <div className="vm-chart-legend">
        {series.map(({ coin }) => {
          const history = market.histories[coin.id];
          const currentPct = getPct(history, step);

          return (
            <div key={coin.id} className="vm-legend-item">
              <i style={{ background: coin.color, boxShadow: `0 0 14px ${coin.glow}` }} />
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
  const history = market?.histories[coin.id] ?? [coin.base, coin.base * 1.004, coin.base * 0.997, coin.base * 1.011];
  const visibleStep = Math.min(step, history.length - 1);
  const current = getCurrent(history, visibleStep);
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
      <div className="vm-coin-top">
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

const PickPanel = ({
  player,
  coin,
  pnl,
  revealed,
}: {
  player: Player;
  coin: Coin | null;
  pnl: number;
  revealed: boolean;
}) => {
  const accent = player === 'p1' ? '#2f8cff' : '#f59e42';

  return (
    <div className="vm-pick" style={cssVars({ '--accent': accent })}>
      <div className="vm-pick-top">
        <span>{player === 'p1' ? 'P1' : 'P2'}</span>
        {!revealed && <Lock size={12} />}
      </div>

      <div className="vm-pick-main">
        <div className="vm-pick-icon">{revealed && coin ? coin.emoji : '•'}</div>
        <div className="vm-pick-copy">
          <b>{revealed && coin ? coin.name : 'Hidden'}</b>
          <span>{revealed && coin ? `$${coin.symbol}` : 'secret pick'}</span>
        </div>
      </div>

      {revealed && (
        <div className={`vm-pnl ${pnl >= 0 ? 'vm-up' : 'vm-down'}`}>
          {formatPct(pnl)}
        </div>
      )}
    </div>
  );
};

const ResultCard = ({
  winner,
  pnl,
  p1Coin,
  p2Coin,
  onRestart,
}: {
  winner: Player | 'draw' | null;
  pnl: Record<Player, number>;
  p1Coin: Coin | null;
  p2Coin: Coin | null;
  onRestart: () => void;
}) => {
  const title = winner === 'draw' ? 'Draw' : winner === 'p1' ? 'P1 won the trade' : 'P2 won the trade';
  const icon = winner === 'draw' ? '⚖️' : winner === 'p1' ? '🔵' : '🟠';

  return (
    <section className="vm-result-card">
      <div className="vm-result-icon">{icon}</div>
      <h2>{title}</h2>
      <p>
        {p1Coin ? `$${p1Coin.symbol}` : 'P1'} {formatPct(pnl.p1)} · {p2Coin ? `$${p2Coin.symbol}` : 'P2'} {formatPct(pnl.p2)}
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

      <button type="button" className="vm-button" onClick={onRestart}>
        Play again
      </button>
    </section>
  );
};

export const VirusMarketGame = () => {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('pickP1');
  const [picks, setPicks] = useState<Picks>({ p1: null, p2: null });
  const [draft, setDraft] = useState<CoinId | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('P1 выбирает coin. P2 не смотрит.');
  const [lastWinner, setLastWinner] = useState<Player | 'draw' | null>(null);

  const activePlayer: Player = phase === 'pickP2' ? 'p2' : 'p1';
  const canPick = phase === 'pickP1' || phase === 'pickP2';
  const isRevealed = phase === 'market' || phase === 'result';

  const p1Coin = picks.p1 ? coinById(picks.p1) : null;
  const p2Coin = picks.p2 ? coinById(picks.p2) : null;
  const selectedCoin = draft ? coinById(draft) : null;

  const pnl = useMemo(() => {
    if (!market || !picks.p1 || !picks.p2) return { p1: 0, p2: 0 };

    return {
      p1: getPct(market.histories[picks.p1], step),
      p2: getPct(market.histories[picks.p2], step),
    };
  }, [market, picks, step]);

  const tradeProgress = phase === 'market' ? Math.min(100, (step / MARKET_STEPS) * 100) : phase === 'result' ? 100 : 0;
  const secondsLeft = phase === 'market'
    ? Math.max(0, Math.ceil((TRADE_DURATION_MS - step * TICK_MS) / 1000))
    : TRADE_SECONDS;

  const title =
    phase === 'market'
      ? 'Live round'
      : phase === 'result'
        ? 'Result'
        : phase === 'handoff'
          ? 'Secret pick'
          : activePlayer === 'p1'
            ? 'P1 buy'
            : 'P2 buy';

  const finishRound = (finalMarket: MarketData) => {
    if (!picks.p1 || !picks.p2) return;

    const p1Pnl = getPct(finalMarket.histories[picks.p1], MARKET_STEPS);
    const p2Pnl = getPct(finalMarket.histories[picks.p2], MARKET_STEPS);

    if (Math.abs(p1Pnl - p2Pnl) < 0.2) {
      setLastWinner('draw');
      setMessage('Ничья. Рынок почти не выбрал сторону.');
    } else {
      const winner: Player = p1Pnl > p2Pnl ? 'p1' : 'p2';
      setLastWinner(winner);
      setMessage(`${winner === 'p1' ? 'P1' : 'P2'} забрал этот трейд.`);
    }

    setStep(MARKET_STEPS);
    setPhase('result');
  };

  useEffect(() => {
    if (phase !== 'market' || !market) return undefined;

    if (step >= MARKET_STEPS) {
      const id = window.setTimeout(() => {
        finishRound(market);
      }, 320);

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
    setMessage('Торги начались. Один раунд, 40 секунд.');
  };

  const resetGame = () => {
    setPhase('pickP1');
    setPicks({ p1: null, p2: null });
    setDraft(null);
    setMarket(null);
    setStep(0);
    setMessage('P1 выбирает coin. P2 не смотрит.');
    setLastWinner(null);
  };

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
          color: #fff;
          background: transparent;
          user-select: none;
          -webkit-overflow-scrolling: touch;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .vm-page * {
          box-sizing: border-box;
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
          grid-template-columns: 40px 1fr 62px;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .vm-back,
        .vm-status {
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(18,18,24,.48);
          color: rgba(255,255,255,.78);
          backdrop-filter: blur(16px);
        }

        .vm-back {
          width: 40px;
        }

        .vm-status {
          min-width: 62px;
          padding: 0 9px;
          color: rgba(255,255,255,.82);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: -.02em;
        }

        .vm-title {
          min-width: 0;
          text-align: center;
        }

        .vm-title small {
          display: block;
          color: rgba(255,255,255,.44);
          font-size: 9px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vm-title h1 {
          margin: 4px 0 0;
          color: #fff;
          font-size: 22px;
          line-height: .95;
          font-weight: 850;
          letter-spacing: -.055em;
        }

        .vm-panel {
          position: relative;
          z-index: 3;
          overflow: hidden;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(18,18,24,.54);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 18px 48px rgba(0,0,0,.18);
          backdrop-filter: blur(18px);
        }

        .vm-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 38px;
          padding: 10px 11px 7px;
        }

        .vm-live {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(255,255,255,.75);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .vm-live i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 14px rgba(34,197,94,.72);
        }

        .vm-event {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 650;
        }

        .vm-chart,
        .vm-chart-empty {
          position: relative;
          height: 244px;
          margin: 8px 10px 10px;
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.07);
          background: rgba(0,0,0,.18);
        }

        .vm-chart-empty {
          display: grid;
          place-items: center;
          color: rgba(255,255,255,.48);
          text-align: center;
        }

        .vm-chart-empty-icon {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          background: rgba(255,255,255,.045);
          color: rgba(255,255,255,.52);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        }

        .vm-chart-empty b {
          position: absolute;
          bottom: 76px;
          color: rgba(255,255,255,.82);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -.03em;
        }

        .vm-chart-empty span {
          position: absolute;
          bottom: 56px;
          color: rgba(255,255,255,.38);
          font-size: 10px;
          font-weight: 650;
        }

        .vm-chart-soft-grid {
          position: absolute;
          inset: 0;
          opacity: .26;
          background:
            linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
          background-size: 44px 38px;
          mask-image: linear-gradient(180deg, transparent, black 14%, black 90%);
        }

        .vm-chart-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
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
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(0,0,0,.26);
          padding: 6px 8px;
          backdrop-filter: blur(10px);
        }

        .vm-legend-item i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
        }

        .vm-legend-item span {
          color: rgba(255,255,255,.64);
          font-size: 9px;
          font-weight: 760;
          letter-spacing: .06em;
        }

        .vm-legend-item b {
          font-size: 10px;
          font-weight: 820;
        }

        .vm-timer {
          padding: 0 10px 10px;
        }

        .vm-timer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 7px;
          color: rgba(255,255,255,.45);
          font-size: 10px;
          font-weight: 720;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .vm-time-left {
          color: #a7f3d0;
          font-variant-numeric: tabular-nums;
        }

        .vm-progress {
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
        }

        .vm-progress-fill {
          height: 100%;
          width: var(--progress);
          border-radius: inherit;
          background: linear-gradient(90deg, #2f8cff, #22d3ee, #f59e42);
          box-shadow: 0 0 22px rgba(34,211,238,.24);
          transition: width .2s linear;
        }

        .vm-picks {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 0 10px 10px;
        }

        .vm-pick {
          min-width: 0;
          border-radius: 19px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(255,255,255,.04);
          padding: 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }

        .vm-pick-top {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 780;
          letter-spacing: .10em;
          text-transform: uppercase;
        }

        .vm-pick-main {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vm-pick-icon {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: color-mix(in srgb, var(--accent) 18%, rgba(255,255,255,.045));
          font-size: 17px;
        }

        .vm-pick-copy {
          min-width: 0;
        }

        .vm-pick-copy b,
        .vm-pick-copy span {
          display: block;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .vm-pick-copy b {
          color: #fff;
          font-size: 12px;
          font-weight: 820;
          letter-spacing: -.035em;
        }

        .vm-pick-copy span {
          margin-top: 2px;
          color: rgba(255,255,255,.38);
          font-size: 9px;
          font-weight: 640;
        }

        .vm-pnl {
          margin-top: 9px;
          font-size: 21px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.06em;
        }

        .vm-market-list-title {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 12px 3px 8px;
          color: rgba(255,255,255,.56);
          font-size: 10px;
          font-weight: 720;
          letter-spacing: .08em;
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
          min-height: 124px;
          overflow: hidden;
          text-align: left;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(18,18,24,.48);
          padding: 11px;
          color: white;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 14px 34px rgba(0,0,0,.14);
          backdrop-filter: blur(16px);
          transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease, background .14s ease;
        }

        .vm-coin:active {
          transform: scale(.974);
        }

        .vm-coin-selected {
          border-color: var(--coin);
          background: color-mix(in srgb, var(--coin) 10%, rgba(18,18,24,.58));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 0 0 1px color-mix(in srgb, var(--coin) 25%, transparent), 0 14px 34px var(--glow);
        }

        .vm-coin-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }

        .vm-coin-icon {
          font-size: 24px;
          line-height: 1;
        }

        .vm-change {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          border-radius: 999px;
          background: rgba(0,0,0,.20);
          padding: 5px 7px;
          font-size: 9px;
          font-weight: 780;
        }

        .vm-symbol {
          margin-top: 7px;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 760;
          letter-spacing: .10em;
        }

        .vm-name {
          margin-top: 4px;
          font-size: 15px;
          line-height: .98;
          font-weight: 830;
          letter-spacing: -.045em;
        }

        .vm-tag {
          margin-top: 4px;
          color: rgba(255,255,255,.42);
          font-size: 10px;
          font-weight: 620;
        }

        .vm-card-chart {
          margin-top: 8px;
          height: 29px;
          opacity: .92;
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
          font-weight: 730;
          letter-spacing: .10em;
          text-transform: uppercase;
        }

        .vm-price-row b {
          font-size: 13px;
          font-weight: 820;
          font-variant-numeric: tabular-nums;
        }

        .vm-card,
        .vm-result-card {
          position: relative;
          z-index: 5;
          overflow: hidden;
          margin-top: 10px;
          border-radius: 27px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(18,18,24,.58);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 20px 54px rgba(0,0,0,.20);
          backdrop-filter: blur(18px);
          padding: 20px;
          text-align: center;
        }

        .vm-card-icon,
        .vm-result-icon {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          margin: 0 auto 13px;
          border-radius: 22px;
          background: rgba(255,255,255,.055);
          font-size: 28px;
        }

        .vm-card h2,
        .vm-result-card h2 {
          margin: 0;
          font-size: 29px;
          line-height: .92;
          font-weight: 860;
          letter-spacing: -.075em;
        }

        .vm-card p,
        .vm-result-card p {
          margin: 11px auto 0;
          max-width: 310px;
          color: rgba(255,255,255,.62);
          font-size: 13px;
          line-height: 1.36;
          font-weight: 620;
        }

        .vm-result-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 15px;
        }

        .vm-result-cell {
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.075);
          background: rgba(255,255,255,.04);
          padding: 12px 8px;
        }

        .vm-result-cell span {
          color: rgba(255,255,255,.40);
          font-size: 9px;
          font-weight: 760;
          letter-spacing: .10em;
          text-transform: uppercase;
        }

        .vm-result-cell b {
          display: block;
          margin-top: 7px;
          font-size: 24px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.06em;
        }

        .vm-bottom {
          position: sticky;
          z-index: 20;
          bottom: -10px;
          margin: 10px -8px 0;
          padding: 8px 8px max(8px, env(safe-area-inset-bottom));
          background: linear-gradient(180deg, transparent 0%, rgba(18,18,24,.54) 42%, rgba(18,18,24,.74) 100%);
          backdrop-filter: blur(14px);
        }

        .vm-message {
          min-height: 15px;
          margin-bottom: 8px;
          text-align: center;
          color: rgba(255,255,255,.66);
          font-size: 11px;
          line-height: 1.25;
          font-weight: 620;
        }

        .vm-actions {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .vm-button {
          min-height: 44px;
          border: 0;
          border-radius: 19px;
          padding: 0 16px;
          background: linear-gradient(135deg, #2f8cff, #22d3ee 52%, #f59e42);
          color: #041018;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: .08em;
          text-transform: uppercase;
          box-shadow: 0 16px 38px rgba(34,211,238,.18), inset 0 2px 0 rgba(255,255,255,.30);
        }

        .vm-button:disabled {
          opacity: .42;
          filter: grayscale(1);
        }

        .vm-button:active {
          transform: scale(.974);
        }

        .vm-ghost {
          min-width: 84px;
          color: rgba(255,255,255,.72);
          background: rgba(255,255,255,.065);
          border: 1px solid rgba(255,255,255,.08);
          box-shadow: 0 14px 34px rgba(0,0,0,.16);
        }

        @media (max-height: 720px) {
          .vm-chart,
          .vm-chart-empty {
            height: 218px;
          }

          .vm-coin {
            min-height: 120px;
            border-radius: 21px;
          }

          .vm-name {
            font-size: 14px;
          }
        }
      `}</style>

      <header className="vm-top">
        <button type="button" className="vm-back" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={18} />
        </button>

        <div className="vm-title">
          <small>{title}</small>
          <h1>Virus Market</h1>
        </div>

        <div className="vm-status">{phase === 'market' ? `${secondsLeft}s` : phase === 'result' ? 'Done' : '40s'}</div>
      </header>

      <section className="vm-panel">
        <div className="vm-panel-head">
          <div className="vm-live">
            <i />
            {phase === 'market' ? 'Live' : 'Market'}
          </div>

          <div className="vm-event">
            {market ? `${market.eventLabel} · ${market.eventTone}` : 'one round · winner takes trade'}
          </div>
        </div>

        <ExchangeChart market={market} step={step} picks={picks} />

        <div className="vm-timer">
          <div className="vm-timer-row">
            <span>Trading round</span>
            <span className="vm-time-left">{phase === 'market' ? `${secondsLeft}s left` : `${TRADE_SECONDS}s`}</span>
          </div>

          <div className="vm-progress">
            <div className="vm-progress-fill" style={cssVars({ '--progress': `${tradeProgress}%` })} />
          </div>
        </div>

        <div className="vm-picks">
          <PickPanel player="p1" coin={p1Coin} pnl={pnl.p1} revealed={isRevealed} />
          <PickPanel player="p2" coin={p2Coin} pnl={pnl.p2} revealed={isRevealed} />
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
          <p>P1 уже выбрал coin. Выбор скрыт. Теперь P2 выбирает свой вход в рынок.</p>

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

      {phase === 'result' && (
        <ResultCard
          winner={lastWinner}
          pnl={pnl}
          p1Coin={p1Coin}
          p2Coin={p2Coin}
          onRestart={resetGame}
        />
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

          <button type="button" className="vm-button vm-ghost" onClick={resetGame}>
            <RefreshCcw size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default VirusMarketGame;
