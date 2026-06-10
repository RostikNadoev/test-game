import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type Owner = 'player' | 'dealer';
type Phase = 'dealing' | 'player' | 'dealer' | 'settling' | 'round_over' | 'match_over';
type RoundWinner = 'player' | 'dealer' | 'push' | null;

type PlayingCard = {
  id: string;
  suit: Suit;
  rank: Rank;
  deck: number;
};

type Score = {
  player: number;
  dealer: number;
  push: number;
};

type HandInfo = {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
};

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const TARGET_WINS = 5;

/* Brand tokens (kept in JS for inline glows / particle colors) */
const GOLD = '#F2C766';
const MINT = '#52FFE5';
const ROSE = '#FF6B8A';
const CARD_RED = '#E5484D';
const CARD_INK = '#101019';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const isRed = (suit: Suit) => suit === '♥' || suit === '♦';
const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const rankValue = (rank: Rank) => {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
};

const getHandInfo = (cards: PlayingCard[]): HandInfo => {
  let total = cards.reduce((sum, card) => sum + rankValue(card.rank), 0);
  let aces = cards.filter((card) => card.rank === 'A').length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  const soft = aces > 0 && total <= 21;

  return {
    total,
    soft,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
};

const createShoe = (decks = 6) => {
  const shoe: PlayingCard[] = [];

  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({
          id: `${deck}-${rank}-${suit}-${Math.random().toString(36).slice(2, 10)}`,
          rank,
          suit,
          deck,
        });
      }
    }
  }

  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }

  return shoe;
};

const formatHand = (info: HandInfo, hidden = false) => {
  if (hidden) return '?';
  if (info.blackjack) return 'BJ';
  return String(info.total);
};

const getPipCount = (rank: Rank) => {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 0;
  return Number(rank);
};

const pipPositions: Record<number, Array<{ x: number; y: number; flip?: boolean }>> = {
  1: [{ x: 50, y: 50 }],
  2: [
    { x: 50, y: 26 },
    { x: 50, y: 74, flip: true },
  ],
  3: [
    { x: 50, y: 24 },
    { x: 50, y: 50 },
    { x: 50, y: 76, flip: true },
  ],
  4: [
    { x: 34, y: 28 },
    { x: 66, y: 28 },
    { x: 34, y: 72, flip: true },
    { x: 66, y: 72, flip: true },
  ],
  5: [
    { x: 34, y: 26 },
    { x: 66, y: 26 },
    { x: 50, y: 50 },
    { x: 34, y: 74, flip: true },
    { x: 66, y: 74, flip: true },
  ],
  6: [
    { x: 34, y: 24 },
    { x: 66, y: 24 },
    { x: 34, y: 50 },
    { x: 66, y: 50 },
    { x: 34, y: 76, flip: true },
    { x: 66, y: 76, flip: true },
  ],
  7: [
    { x: 34, y: 22 },
    { x: 66, y: 22 },
    { x: 50, y: 36 },
    { x: 34, y: 52 },
    { x: 66, y: 52 },
    { x: 34, y: 78, flip: true },
    { x: 66, y: 78, flip: true },
  ],
  8: [
    { x: 34, y: 20 },
    { x: 66, y: 20 },
    { x: 50, y: 35 },
    { x: 34, y: 50 },
    { x: 66, y: 50 },
    { x: 50, y: 65, flip: true },
    { x: 34, y: 80, flip: true },
    { x: 66, y: 80, flip: true },
  ],
  9: [
    { x: 34, y: 19 },
    { x: 66, y: 19 },
    { x: 34, y: 38 },
    { x: 66, y: 38 },
    { x: 50, y: 50 },
    { x: 34, y: 62, flip: true },
    { x: 66, y: 62, flip: true },
    { x: 34, y: 81, flip: true },
    { x: 66, y: 81, flip: true },
  ],
  10: [
    { x: 34, y: 17 },
    { x: 66, y: 17 },
    { x: 50, y: 29 },
    { x: 34, y: 41 },
    { x: 66, y: 41 },
    { x: 34, y: 59, flip: true },
    { x: 66, y: 59, flip: true },
    { x: 50, y: 71, flip: true },
    { x: 34, y: 83, flip: true },
    { x: 66, y: 83, flip: true },
  ],
};

/* ---------------------------------------------------------------- visuals */

const SuitMark = ({ suit }: { suit: Suit }) => (
  <span className="font-black leading-none" style={{ color: isRed(suit) ? CARD_RED : CARD_INK }}>
    {suit}
  </span>
);

const CourtArt = ({ rank, suit }: { rank: Rank; suit: Suit }) => {
  const color = isRed(suit) ? CARD_RED : CARD_INK;
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative grid place-items-center">
        <div className="absolute h-[78%] w-[78%] rotate-45 rounded-[22%] border" style={{ borderColor: `${GOLD}55` }} />
        <span className="relative text-[clamp(24px,8vw,42px)] font-black leading-none" style={{ color }}>
          {rank}
        </span>
        <span className="relative -mt-0.5 text-[clamp(11px,3vw,18px)] leading-none" style={{ color }}>
          {suit}
        </span>
      </div>
    </div>
  );
};

const PipArt = ({ card }: { card: PlayingCard }) => {
  const count = getPipCount(card.rank);
  const layout = pipPositions[count] ?? pipPositions[1];
  const ace = card.rank === 'A';

  return (
    <div className="absolute inset-[16%]">
      {layout.map((pip, i) => (
        <span
          key={i}
          className={cx(
            'absolute',
            ace ? 'text-[clamp(30px,9vw,52px)]' : 'text-[clamp(12px,3.4vw,22px)]',
          )}
          style={{ left: `${pip.x}%`, top: `${pip.y}%`, transform: `translate(-50%, -50%) rotate(${pip.flip ? 180 : 0}deg)` }}
        >
          <SuitMark suit={card.suit} />
        </span>
      ))}
    </div>
  );
};

const CardCenter = ({ card }: { card: PlayingCard }) =>
  getPipCount(card.rank) === 0 ? <CourtArt rank={card.rank} suit={card.suit} /> : <PipArt card={card} />;

const PlayingCardView = ({
  card,
  owner,
  index,
  count,
  hidden = false,
  dimmed = false,
  winner = false,
}: {
  card: PlayingCard;
  owner: Owner;
  index: number;
  count: number;
  hidden?: boolean;
  dimmed?: boolean;
  winner?: boolean;
}) => {
  const mid = (count - 1) / 2;
  const tilt = (index - mid) * (owner === 'player' ? 5 : 4);
  const lift = Math.abs(index - mid) * 5;
  const ink = isRed(card.suit) ? CARD_RED : CARD_INK;

  return (
    <div
      className={cx(
        'bj-card-shell relative shrink-0',
        owner === 'player' ? 'bj-deal-player' : 'bj-deal-dealer',
        dimmed && 'bj-dimmed',
        winner && 'bj-winning-card',
        winner && (owner === 'player' ? 'bj-win-mint' : 'bj-win-rose'),
      )}
      style={{
        ['--tilt' as string]: `${tilt}deg`,
        ['--lift' as string]: `${lift}px`,
        marginLeft: index === 0 ? undefined : 'calc(var(--bj-card-w) * -0.30)',
        zIndex: 10 + index,
      }}
    >
      <div className={cx('bj-card-inner', hidden && 'bj-card-hidden')}>
        <div className="bj-card-face bj-card-front">
          <div className="absolute inset-0 bg-[linear-gradient(158deg,#ffffff,#eceef4)]" />
          <div className="absolute inset-[3px] rounded-[calc(var(--bj-radius)-3px)] border border-black/[0.06]" />
          <div className="bj-corner left-1.5 top-1.5" style={{ color: ink }}>
            <strong>{card.rank}</strong>
            <span>{card.suit}</span>
          </div>
          <div className="bj-corner bottom-1.5 right-1.5 rotate-180" style={{ color: ink }}>
            <strong>{card.rank}</strong>
            <span>{card.suit}</span>
          </div>
          <CardCenter card={card} />
        </div>

        <div className="bj-card-face bj-card-back">
          <div className="absolute inset-0 bg-[linear-gradient(150deg,#0c0c14,#070709)]" />
          <div className="absolute inset-[3px] rounded-[calc(var(--bj-radius)-3px)] border" style={{ borderColor: `${GOLD}26` }} />
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="grid h-[42%] w-[42%] rotate-45 place-items-center rounded-[24%] border"
              style={{ borderColor: `${MINT}4d`, background: `${MINT}0d` }}
            >
              <span className="-rotate-45 text-[clamp(9px,2.6vw,13px)] font-black tracking-tight" style={{ color: `${MINT}cc` }}>
                21
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CardRow = ({ children }: { children: React.ReactNode }) => (
  <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+6px)] items-end justify-center">{children}</div>
);

const ScorePips = ({ value, tone }: { value: number; tone: 'player' | 'dealer' }) => (
  <div className="flex items-center gap-1">
    {Array.from({ length: TARGET_WINS }).map((_, i) => {
      const on = i < value;
      const color = tone === 'player' ? MINT : ROSE;
      return (
        <span
          key={i}
          className="h-1.5 w-3 rounded-full transition-colors duration-300"
          style={{
            background: on ? color : 'rgba(255,255,255,0.10)',
            boxShadow: on ? `0 0 8px ${color}80` : 'none',
          }}
        />
      );
    })}
  </div>
);

const TableLabel = ({
  title,
  score,
  hidden,
  tone,
}: {
  title: string;
  score: string;
  hidden?: boolean;
  tone: 'player' | 'dealer';
}) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/40 px-2.5 py-1">
    <span
      className="text-[9px] font-black uppercase tracking-[0.2em]"
      style={{ color: tone === 'player' ? `${MINT}b3` : `${ROSE}b3` }}
    >
      {title}
    </span>
    <span className={cx('text-sm font-black leading-none tabular-nums', hidden ? 'text-white/40' : 'text-white')}>{score}</span>
  </div>
);

const ResultBurst = ({ seed, kind }: { seed: number; kind: RoundWinner }) => {
  if (!kind) return null;
  const color = kind === 'player' ? MINT : kind === 'dealer' ? ROSE : GOLD;

  return (
    <div key={seed} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div className="bj-ring" style={{ borderColor: color, ['--c' as string]: color }} />
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i / 16) * Math.PI * 2 + seed * 0.2;
        const dist = 64 + ((i * 17 + seed * 5) % 64);
        return (
          <span
            key={i}
            className="bj-spark"
            style={{
              background: color,
              color,
              ['--dx' as string]: `${Math.cos(angle) * dist}px`,
              ['--dy' as string]: `${Math.sin(angle) * dist}px`,
              animationDelay: `${(i % 4) * 28}ms`,
            }}
          />
        );
      })}
    </div>
  );
};

const CtrlButton = ({
  children,
  onClick,
  disabled,
  tone,
  full,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: 'mint' | 'gold' | 'rose';
  full?: boolean;
}) => {
  const color = tone === 'mint' ? MINT : tone === 'gold' ? GOLD : ROSE;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'relative h-[46px] rounded-2xl border text-xs font-black uppercase tracking-[0.14em] transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        full ? 'w-full' : 'flex-1',
      )}
      style={{ borderColor: `${color}40`, background: `${color}1a`, color }}
    >
      {children}
    </button>
  );
};

/* ------------------------------------------------------------- result copy */

const resultCopy = (winner: RoundWinner, p: HandInfo, d: HandInfo): { title: string; sub: string; color: string } => {
  if (winner === 'push') return { title: 'Ничья', sub: `${p.total} : ${d.total}`, color: GOLD };
  if (winner === 'player') {
    if (p.blackjack) return { title: 'Блэкджек', sub: 'Идеальная рука', color: MINT };
    if (d.bust) return { title: 'Перебор дилера', sub: `У дилера ${d.total}`, color: MINT };
    return { title: 'Победа', sub: `${p.total} против ${d.total}`, color: MINT };
  }
  if (winner === 'dealer') {
    if (d.blackjack) return { title: 'Блэкджек дилера', sub: 'У дилера 21', color: ROSE };
    if (p.bust) return { title: 'Перебор', sub: `У тебя ${p.total}`, color: ROSE };
    return { title: 'Дилер выиграл', sub: `${d.total} против ${p.total}`, color: ROSE };
  }
  return { title: 'Блэкджек', sub: 'Сделай ход', color: '#FFFFFF' };
};

/* -------------------------------------------------------------- main game */

export const BlackjackDuelGame: React.FC = () => {
  const timersRef = useRef<number[]>([]);
  const deckRef = useRef<PlayingCard[]>(createShoe());
  const runningDealerRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('dealing');
  const [playerCards, setPlayerCards] = useState<PlayingCard[]>([]);
  const [dealerCards, setDealerCards] = useState<PlayingCard[]>([]);
  const [dealerHoleOpen, setDealerHoleOpen] = useState(false);
  const [score, setScore] = useState<Score>({ player: 0, dealer: 0, push: 0 });
  const [round, setRound] = useState(1);
  const [roundWinner, setRoundWinner] = useState<RoundWinner>(null);
  const [message, setMessage] = useState('Раздача');
  const [subMessage, setSubMessage] = useState('Карты на стол');
  const [burst, setBurst] = useState(0);
  const [matchTitle, setMatchTitle] = useState('');

  const playerInfo = useMemo(() => getHandInfo(playerCards), [playerCards]);
  const dealerInfo = useMemo(() => getHandInfo(dealerCards), [dealerCards]);
  const visibleDealerInfo = useMemo(
    () => getHandInfo(dealerHoleOpen ? dealerCards : dealerCards.slice(0, 1)),
    [dealerCards, dealerHoleOpen],
  );

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    runningDealerRef.current = false;
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const drawCard = useCallback(() => {
    if (deckRef.current.length < 26) deckRef.current = createShoe();
    const card = deckRef.current.pop();
    if (!card) throw new Error('Shoe is empty');
    return card;
  }, []);

  const settleRound = useCallback(
    async (pCards: PlayingCard[], dCards: PlayingCard[]) => {
      runningDealerRef.current = false;
      setPhase('settling');
      setDealerHoleOpen(true);
      setMessage('Вскрытие');
      setSubMessage('Считаем карты');
      await wait(680);

      const p = getHandInfo(pCards);
      const d = getHandInfo(dCards);
      let winner: RoundWinner;

      if (p.bust && d.bust) winner = 'push';
      else if (p.blackjack && !d.blackjack) winner = 'player';
      else if (d.blackjack && !p.blackjack) winner = 'dealer';
      else if (p.bust) winner = 'dealer';
      else if (d.bust) winner = 'player';
      else if (p.total > d.total) winner = 'player';
      else if (d.total > p.total) winner = 'dealer';
      else winner = 'push';

      const nextScore: Score = {
        player: score.player + (winner === 'player' ? 1 : 0),
        dealer: score.dealer + (winner === 'dealer' ? 1 : 0),
        push: score.push + (winner === 'push' ? 1 : 0),
      };
      const copy = resultCopy(winner, p, d);

      setRoundWinner(winner);
      setScore(nextScore);
      setBurst((value) => value + 1);
      setMessage(copy.title);
      setSubMessage(copy.sub);

      if (nextScore.player >= TARGET_WINS || nextScore.dealer >= TARGET_WINS) {
        setPhase('match_over');
        setMatchTitle(nextScore.player > nextScore.dealer ? 'Стол твой' : 'Дилер победил');
        return;
      }

      setPhase('round_over');
    },
    [score.dealer, score.player, score.push],
  );

  const runDealer = useCallback(
    async (currentDealerCards: PlayingCard[], currentPlayerCards: PlayingCard[]) => {
      if (runningDealerRef.current) return;
      runningDealerRef.current = true;
      setPhase('dealer');
      setDealerHoleOpen(true);
      setMessage('Ход дилера');
      setSubMessage('Дилер тянет до 17');
      await wait(760);

      let cards = currentDealerCards;
      while (runningDealerRef.current) {
        const info = getHandInfo(cards);
        const shouldHit = info.total < 17 || (info.total === 17 && info.soft && Math.random() < 0.25);
        if (!shouldHit) break;

        const next = drawCard();
        cards = [...cards, next];
        setDealerCards(cards);
        setMessage('Дилер берёт');
        setSubMessage(`У дилера ${getHandInfo(cards).total}`);
        await wait(720);

        if (getHandInfo(cards).bust) break;
      }

      await settleRound(currentPlayerCards, cards);
    },
    [drawCard, settleRound],
  );

  const startRound = useCallback(
    (nextRound = round) => {
      clearTimers();
      if (deckRef.current.length < 34) deckRef.current = createShoe();

      const p1 = drawCard();
      const d1 = drawCard();
      const p2 = drawCard();
      const d2 = drawCard();
      const initialPlayer = [p1, p2];
      const initialDealer = [d1, d2];

      setRound(nextRound);
      setRoundWinner(null);
      setDealerHoleOpen(false);
      setPlayerCards([]);
      setDealerCards([]);
      setPhase('dealing');
      setMessage('Раздача');
      setSubMessage('Карты на стол');
      setMatchTitle('');

      schedule(() => setPlayerCards([p1]), 110);
      schedule(() => setDealerCards([d1]), 400);
      schedule(() => setPlayerCards([p1, p2]), 700);
      schedule(() => setDealerCards([d1, d2]), 1000);
      schedule(() => {
        const p = getHandInfo(initialPlayer);
        const d = getHandInfo(initialDealer);

        if (p.blackjack || d.blackjack) {
          settleRound(initialPlayer, initialDealer);
          return;
        }

        setPhase('player');
        setMessage('Твой ход');
        setSubMessage('Возьми карту или вскрывайся');
      }, 1480);
    },
    [clearTimers, drawCard, round, schedule, settleRound],
  );

  useEffect(() => {
    startRound(1);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hit = useCallback(() => {
    if (phase !== 'player') return;
    const nextCard = drawCard();
    const nextPlayer = [...playerCards, nextCard];
    setPlayerCards(nextPlayer);

    const info = getHandInfo(nextPlayer);
    if (info.bust) {
      setPhase('dealer'); // lock controls immediately — prevents a second tap during the delay
      setMessage('Перебор');
      setSubMessage(`${info.total} — слишком много`);
      schedule(() => runDealer(dealerCards, nextPlayer), 620);
    } else if (info.total === 21) {
      setPhase('dealer');
      setMessage('21');
      setSubMessage('Стоп автоматически');
      schedule(() => runDealer(dealerCards, nextPlayer), 620);
    } else {
      setMessage('Карта взята');
      setSubMessage(`У тебя ${info.total}`);
    }
  }, [dealerCards, drawCard, phase, playerCards, runDealer, schedule]);

  const stand = useCallback(() => {
    if (phase !== 'player') return;
    setMessage('Вскрытие');
    setSubMessage(`Фиксируем ${playerInfo.total}`);
    runDealer(dealerCards, playerCards);
  }, [dealerCards, phase, playerCards, playerInfo.total, runDealer]);

  const nextRound = useCallback(() => {
    if (phase !== 'round_over') return;
    startRound(round + 1);
  }, [phase, round, startRound]);

  const restartMatch = useCallback(() => {
    clearTimers();
    deckRef.current = createShoe();
    setScore({ player: 0, dealer: 0, push: 0 });
    setRound(1);
    setMatchTitle('');
    startRound(1);
  }, [clearTimers, startRound]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'h' || key === 'enter') hit();
      if (key === 's' || key === ' ') {
        e.preventDefault();
        stand();
      }
      if (key === 'n') nextRound();
      if (key === 'r') restartMatch();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hit, nextRound, restartMatch, stand]);

  const result = resultCopy(roundWinner, playerInfo, dealerInfo);
  const dealerHidden = !dealerHoleOpen && dealerCards.length > 1;
  const waitingPhase = phase === 'dealing' || phase === 'dealer' || phase === 'settling';
  const waitingLabel = phase === 'dealing' ? 'Раздача' : phase === 'dealer' ? 'Ход дилера' : 'Подсчёт';

  return (
    <div className="bj-root relative flex h-full min-h-[440px] w-full select-none flex-col overflow-hidden bg-[#050507] text-white">
      <style>{`
        .bj-root {
          --bj-card-w: clamp(56px, 14.5vw, 90px);
          --bj-card-h: calc(var(--bj-card-w) * 1.42);
          --bj-radius: clamp(10px, 1.4vw, 16px);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .bj-card-shell {
          width: var(--bj-card-w);
          height: var(--bj-card-h);
          perspective: 900px;
          transform: translate3d(0, var(--lift), 0) rotate(var(--tilt));
          filter: drop-shadow(0 12px 14px rgba(0,0,0,0.40));
          will-change: transform;
        }
        .bj-dimmed { opacity: .55; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.4)) saturate(.7); }

        .bj-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 560ms cubic-bezier(.2,.8,.2,1);
        }
        .bj-card-hidden { transform: rotateY(180deg); }

        .bj-card-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: var(--bj-radius);
          border: 1px solid rgba(15,23,42,.16);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .bj-card-back { transform: rotateY(180deg); border-color: rgba(242,199,102,.16); }

        .bj-corner {
          position: absolute;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: .82;
        }
        .bj-corner strong { font-size: clamp(11px, 3.3vw, 16px); font-weight: 900; }
        .bj-corner span { font-size: clamp(10px, 3vw, 15px); font-weight: 800; margin-top: 1px; }

        @keyframes bjDealPlayer {
          0%   { opacity: 0; transform: translate3d(38vw, -26vh, 0) rotate(18deg) scale(.42); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1); }
        }
        @keyframes bjDealDealer {
          0%   { opacity: 0; transform: translate3d(30vw, 12vh, 0) rotate(-16deg) scale(.42); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1); }
        }
        .bj-deal-player { animation: bjDealPlayer 500ms cubic-bezier(.2,.8,.2,1) both; }
        .bj-deal-dealer { animation: bjDealDealer 500ms cubic-bezier(.2,.8,.2,1) both; }

        @keyframes bjWinCard {
          0%,100% { transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1); }
          50%     { transform: translate3d(0, calc(var(--lift) - 8px), 0) rotate(var(--tilt)) scale(1.03); }
        }
        /* declared after deal rules so it wins the cascade once a round resolves */
        .bj-winning-card { animation: bjWinCard 1500ms ease-in-out infinite; }
        .bj-win-mint .bj-card-front { box-shadow: inset 0 0 0 1.5px rgba(82,255,229,.75), 0 0 18px rgba(82,255,229,.30); }
        .bj-win-rose .bj-card-front { box-shadow: inset 0 0 0 1.5px rgba(255,107,138,.75), 0 0 18px rgba(255,107,138,.30); }

        @keyframes bjStatusIn {
          0%   { opacity: 0; transform: translateY(7px) scale(.97); }
          100% { opacity: 1; transform: none; }
        }
        .bj-status-in { animation: bjStatusIn 230ms ease-out both; }

        @keyframes bjRing {
          0%   { transform: translate(-50%,-50%) scale(.35); opacity: .65; }
          100% { transform: translate(-50%,-50%) scale(2.3); opacity: 0; }
        }
        .bj-ring {
          position: absolute; left: 50%; top: 50%;
          width: 120px; height: 120px; border-radius: 999px;
          border: 2px solid var(--c);
          box-shadow: 0 0 24px -4px var(--c);
          animation: bjRing 700ms ease-out both;
        }

        @keyframes bjSpark {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(.6); }
          14%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2); }
        }
        .bj-spark {
          position: absolute; left: 50%; top: 50%;
          width: 4px; height: 4px; border-radius: 999px;
          transform: translate(-50%,-50%);
          animation: bjSpark 700ms cubic-bezier(.2,.8,.2,1) both;
          filter: drop-shadow(0 0 4px currentColor);
        }

        @media (max-height: 680px) {
          .bj-root { --bj-card-w: clamp(48px, 12vw, 76px); }
        }
        @media (max-height: 560px) {
          .bj-root { --bj-card-w: clamp(42px, 11vw, 64px); }
          .bj-status-msg { font-size: clamp(17px, 5vw, 26px) !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bj-deal-player, .bj-deal-dealer, .bj-winning-card,
          .bj-status-in, .bj-ring, .bj-spark { animation: none !important; }
          .bj-card-inner { transition: none !important; }
        }
      `}</style>

      {/* ambient background — subtle, no heavy blur */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(80% 50% at 50% 0%, ${GOLD}10, transparent 60%),` +
            `radial-gradient(85% 60% at 50% 100%, ${MINT}10, transparent 55%)`,
        }}
      />

      {/* HUD */}
      <div className="relative z-20 shrink-0 px-3 pt-2">
        <div className="mx-auto flex max-w-[440px] items-center justify-between gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: `${MINT}cc` }}>
              Ты
            </span>
            <ScorePips value={score.player} tone="player" />
          </div>

          <div className="flex flex-col items-center leading-none">
            <span className="text-[8px] font-black uppercase tracking-[0.24em] text-white/35">Раунд</span>
            <span className="mt-0.5 text-sm font-black" style={{ color: GOLD }}>
              {round}
            </span>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <ScorePips value={score.dealer} tone="dealer" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: `${ROSE}cc` }}>
              Дилер
            </span>
          </div>
        </div>
      </div>

      {/* TABLE — takes the rest of the height */}
      <div className="relative z-10 mx-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-white/[0.06]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              `radial-gradient(120% 80% at 50% 8%, ${MINT}0a, transparent 46%),` +
              `radial-gradient(120% 90% at 50% 108%, #0b1a14e6, transparent 60%),` +
              `linear-gradient(180deg, #080810, #050507)`,
          }}
        />
        <div className="pointer-events-none absolute inset-[6px] rounded-[18px] border" style={{ borderColor: `${GOLD}14` }} />

        {/* dealer */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3">
          <TableLabel title="Дилер" score={formatHand(visibleDealerInfo, dealerHidden)} hidden={dealerHidden} tone="dealer" />
          <CardRow>
            {dealerCards.map((card, index) => (
              <PlayingCardView
                key={card.id}
                card={card}
                owner="dealer"
                index={index}
                count={dealerCards.length}
                hidden={!dealerHoleOpen && index === 1}
                dimmed={roundWinner === 'player'}
                winner={roundWinner === 'dealer'}
              />
            ))}
          </CardRow>
        </div>

        {/* status — centered in the middle gap, in flow (no overlap) */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <div key={`${message}-${burst}`} className="bj-status-in">
            <div
              className="bj-status-msg text-[clamp(20px,6vw,34px)] font-black uppercase leading-none tracking-[-0.04em]"
              style={{ color: result.color }}
            >
              {message}
            </div>
            <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{subMessage}</div>
          </div>
        </div>

        {/* player */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 pb-3">
          <CardRow>
            {playerCards.map((card, index) => (
              <PlayingCardView
                key={card.id}
                card={card}
                owner="player"
                index={index}
                count={playerCards.length}
                dimmed={roundWinner === 'dealer'}
                winner={roundWinner === 'player'}
              />
            ))}
          </CardRow>
          <TableLabel title="Ты" score={formatHand(playerInfo)} tone="player" />
        </div>

        <ResultBurst seed={burst} kind={roundWinner} />
      </div>

      {/* CONTROLS — fixed-height dock, never steals the table */}
      <div className="relative z-20 shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-[440px] items-center justify-center">
          {phase === 'player' && (
            <div className="flex w-full items-center gap-2">
              <CtrlButton onClick={hit} disabled={phase !== 'player'} tone="mint">
                Взять
              </CtrlButton>
              <CtrlButton onClick={stand} disabled={phase !== 'player'} tone="gold">
                Вскрыть
              </CtrlButton>
            </div>
          )}

          {phase === 'round_over' && (
            <CtrlButton onClick={nextRound} tone="gold" full>
              Следующая раздача
            </CtrlButton>
          )}

          {waitingPhase && (
            <div className="flex h-[46px] items-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
              {waitingLabel}
            </div>
          )}

          {phase === 'match_over' && <div className="h-[46px]" />}
        </div>
      </div>

      {/* MATCH OVER overlay */}
      {phase === 'match_over' && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-5">
          <div className="bj-status-in w-full max-w-[360px] rounded-[26px] border border-white/[0.08] bg-[#0a0a11] p-6 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">Матч окончен</div>
            <div
              className="mt-3 text-3xl font-black uppercase leading-none tracking-[-0.05em]"
              style={{ color: score.player > score.dealer ? MINT : ROSE }}
            >
              {matchTitle}
            </div>

            <div className="mt-5 flex items-stretch gap-3">
              <div className="flex-1 rounded-2xl border py-3" style={{ borderColor: `${MINT}26`, background: `${MINT}0d` }}>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Ты</div>
                <div className="mt-1 text-3xl font-black" style={{ color: MINT }}>
                  {score.player}
                </div>
              </div>
              <div className="flex-1 rounded-2xl border py-3" style={{ borderColor: `${ROSE}26`, background: `${ROSE}0d` }}>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Дилер</div>
                <div className="mt-1 text-3xl font-black" style={{ color: ROSE }}>
                  {score.dealer}
                </div>
              </div>
            </div>

            <div className="mt-3 text-[11px] font-bold text-white/35">Ничьих: {score.push}</div>

            <button
              type="button"
              onClick={restartMatch}
              className="mt-5 h-[46px] w-full rounded-2xl border text-xs font-black uppercase tracking-[0.16em] transition active:scale-[0.98]"
              style={{ borderColor: `${GOLD}4d`, background: `${GOLD}26`, color: GOLD }}
            >
              Новый матч
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const BlackjackGame = BlackjackDuelGame;
export const Blackjack = BlackjackDuelGame;
export default BlackjackDuelGame;