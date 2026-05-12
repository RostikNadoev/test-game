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
  let soft = aces > 0;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  soft = aces > 0 && total <= 21;

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
  if (hidden) return '??';
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
    { x: 50, y: 28 },
    { x: 50, y: 72, flip: true },
  ],
  3: [
    { x: 50, y: 25 },
    { x: 50, y: 50 },
    { x: 50, y: 75, flip: true },
  ],
  4: [
    { x: 35, y: 30 },
    { x: 65, y: 30 },
    { x: 35, y: 70, flip: true },
    { x: 65, y: 70, flip: true },
  ],
  5: [
    { x: 35, y: 28 },
    { x: 65, y: 28 },
    { x: 50, y: 50 },
    { x: 35, y: 72, flip: true },
    { x: 65, y: 72, flip: true },
  ],
  6: [
    { x: 34, y: 25 },
    { x: 66, y: 25 },
    { x: 34, y: 50 },
    { x: 66, y: 50 },
    { x: 34, y: 75, flip: true },
    { x: 66, y: 75, flip: true },
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

const SparkBurst = ({ seed, kind }: { seed: number; kind: RoundWinner }) => {
  if (!kind) return null;

  const colorClass =
    kind === 'player'
      ? 'from-emerald-200 via-lime-300 to-transparent'
      : kind === 'dealer'
        ? 'from-rose-200 via-orange-300 to-transparent'
        : 'from-sky-200 via-white to-transparent';

  return (
    <div key={seed} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div className={cx('bj-shockwave', kind === 'player' && 'bj-win-wave', kind === 'dealer' && 'bj-lose-wave')} />
      {Array.from({ length: 34 }).map((_, i) => {
        const angle = (i / 34) * Math.PI * 2 + seed * 0.13;
        const distance = 90 + ((i * 23 + seed * 7) % 120);
        const size = 5 + ((i * 11) % 11);
        return (
          <span
            key={i}
            className={cx('bj-spark bg-gradient-to-r', colorClass)}
            style={{
              left: '50%',
              top: '50%',
              width: size,
              height: Math.max(2, size * 0.34),
              transform: `rotate(${angle}rad)`,
              ['--dx' as string]: `${Math.cos(angle) * distance}px`,
              ['--dy' as string]: `${Math.sin(angle) * distance}px`,
              animationDelay: `${(i % 7) * 18}ms`,
            }}
          />
        );
      })}
    </div>
  );
};

const ScorePips = ({ value, activeClass }: { value: number; activeClass: string }) => (
  <div className="flex items-center gap-1.5">
    {Array.from({ length: TARGET_WINS }).map((_, i) => (
      <span
        key={i}
        className={cx(
          'h-2.5 w-2.5 rounded-full border transition-all duration-500',
          i < value
            ? `${activeClass} scale-110 shadow-[0_0_12px_currentColor]`
            : 'border-white/12 bg-white/8 text-white/15',
        )}
      />
    ))}
  </div>
);

const SuitMark = ({ suit, className = '' }: { suit: Suit; className?: string }) => (
  <span className={cx('font-black leading-none', isRed(suit) ? 'text-rose-500' : 'text-slate-950', className)}>
    {suit}
  </span>
);

const FaceArt = ({ rank, suit }: { rank: Rank; suit: Suit }) => {
  const red = isRed(suit);
  const main = red ? '#e11d48' : '#0f172a';
  const accent = rank === 'K' ? '#f59e0b' : rank === 'Q' ? '#a855f7' : '#0ea5e9';

  return (
    <svg className="absolute left-1/2 top-1/2 h-[62%] w-[70%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 120 150">
      <defs>
        <linearGradient id={`face-${rank}-${suit}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset="0.48" stopColor="#fed7aa" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
        <filter id={`shadow-${rank}-${suit}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.22" />
        </filter>
      </defs>
      <path d="M20 38 L60 8 L100 38 L94 64 L26 64 Z" fill={accent} filter={`url(#shadow-${rank}-${suit})`} />
      <circle cx="60" cy="68" r="31" fill={`url(#face-${rank}-${suit})`} stroke={main} strokeWidth="3" />
      <path d="M34 112 C42 88 78 88 86 112 L95 145 H25 Z" fill={main} opacity="0.92" />
      <path d="M46 76 C54 84 66 84 74 76" fill="none" stroke={main} strokeWidth="4" strokeLinecap="round" />
      <circle cx="48" cy="63" r="4" fill={main} />
      <circle cx="72" cy="63" r="4" fill={main} />
      <text x="60" y="132" textAnchor="middle" fontSize="34" fontWeight="900" fill={red ? '#fb7185' : '#f8fafc'}>
        {rank}
      </text>
      <text x="60" y="38" textAnchor="middle" fontSize="28" fontWeight="900" fill="#fff">
        {suit}
      </text>
    </svg>
  );
};

const PipArt = ({ card }: { card: PlayingCard }) => {
  const count = getPipCount(card.rank);

  if (count === 0) return <FaceArt rank={card.rank} suit={card.suit} />;

  const layout = pipPositions[count] ?? pipPositions[1];
  const ace = card.rank === 'A';

  return (
    <div className="absolute inset-[15%]">
      {layout.map((pip, i) => (
        <span
          key={i}
          className={cx(
            'absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]',
            ace ? 'text-[clamp(48px,7vw,76px)]' : 'text-[clamp(18px,3.2vw,34px)]',
          )}
          style={{ left: `${pip.x}%`, top: `${pip.y}%`, transform: `translate(-50%, -50%) rotate(${pip.flip ? 180 : 0}deg)` }}
        >
          <SuitMark suit={card.suit} />
        </span>
      ))}
    </div>
  );
};

const PlayingCardView = ({
  card,
  owner,
  index,
  hidden = false,
  dimmed = false,
  winner = false,
}: {
  card: PlayingCard;
  owner: Owner;
  index: number;
  hidden?: boolean;
  dimmed?: boolean;
  winner?: boolean;
}) => {
  const tilt = owner === 'player' ? (index - 1) * 4 : (index - 1) * -3;
  const lift = Math.abs(index - 1) * 4;

  return (
    <div
      className={cx(
        'bj-card-shell relative shrink-0',
        owner === 'player' ? 'bj-deal-player' : 'bj-deal-dealer',
        dimmed && 'opacity-70 saturate-75',
        winner && 'bj-winning-card',
      )}
      style={{
        ['--tilt' as string]: `${tilt}deg`,
        ['--lift' as string]: `${lift}px`,
        zIndex: 10 + index,
      }}
    >
      <div className={cx('bj-card-inner', hidden && 'bj-card-hidden')}>
        <div className="bj-card-face bj-card-front">
          <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_16%_10%,rgba(255,255,255,0.95),transparent_34%),linear-gradient(155deg,#ffffff,#f8fafc_44%,#e5e7eb)]" />
          <div className="absolute inset-[6px] rounded-[calc(var(--card-radius)-6px)] border border-slate-950/8" />
          <div className={cx('bj-card-corner left-2 top-2', isRed(card.suit) ? 'text-rose-500' : 'text-slate-950')}>
            <strong>{card.rank}</strong>
            <span>{card.suit}</span>
          </div>
          <PipArt card={card} />
          <div className={cx('bj-card-corner bottom-2 right-2 rotate-180', isRed(card.suit) ? 'text-rose-500' : 'text-slate-950')}>
            <strong>{card.rank}</strong>
            <span>{card.suit}</span>
          </div>
          <div className="absolute bottom-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-black/5" />
        </div>

        <div className="bj-card-face bj-card-back">
          <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.2),transparent_30%),linear-gradient(135deg,#042f2e,#064e3b_45%,#0f172a)]" />
          <div className="absolute inset-[7px] rounded-[calc(var(--card-radius)-7px)] border border-emerald-200/25 bg-[linear-gradient(45deg,rgba(255,255,255,0.09)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.09)_50%,rgba(255,255,255,0.09)_75%,transparent_75%,transparent)] bg-[length:20px_20px]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-emerald-200/25 bg-black/25 px-4 py-3 text-center shadow-[0_0_28px_rgba(16,185,129,0.28)]">
              <div className="text-xl font-black tracking-tight text-emerald-200">21</div>
              <div className="mt-0.5 text-[8px] font-black uppercase tracking-[0.28em] text-white/55">Twin</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DeckShoe = ({ cardsLeft, dealing }: { cardsLeft: number; dealing: boolean }) => (
  <div className="pointer-events-none absolute right-[clamp(16px,3.4vw,48px)] top-[clamp(18px,3.2vh,34px)] z-[8] hidden lg:block">
    <div className={cx('bj-shoe relative h-[82px] w-[108px] rotate-[-8deg] opacity-90', dealing && 'bj-shoe-dealing')}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-[68px] w-[46px] rounded-xl border border-white/12 bg-[linear-gradient(135deg,#0f172a,#1f2937)] shadow-[0_14px_24px_rgba(0,0,0,0.24)]"
          style={{ left: i * 6, top: i * 3.5, transform: `rotate(${i * 1.7 - 3}deg)` }}
        />
      ))}
      <div className="absolute bottom-0 right-0 h-[52px] w-[96px] rounded-2xl border border-amber-200/18 bg-[linear-gradient(145deg,#2b1a0b,#080808)] shadow-[0_18px_32px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-2 rounded-xl border border-white/8" />
        <div className="absolute bottom-2.5 left-3 text-[8px] font-black uppercase tracking-[0.22em] text-amber-100/55">Shoe</div>
        <div className="absolute right-3 top-2 text-lg font-black text-amber-200">{cardsLeft}</div>
      </div>
    </div>
  </div>
);

const Chip = ({ label, tone = 'emerald' }: { label: string; tone?: 'emerald' | 'rose' | 'gold' | 'slate' }) => {
  const palette = {
    emerald: 'from-emerald-300 via-emerald-500 to-teal-800 text-emerald-950',
    rose: 'from-rose-300 via-rose-500 to-red-900 text-rose-950',
    gold: 'from-amber-200 via-yellow-400 to-orange-700 text-yellow-950',
    slate: 'from-slate-200 via-slate-400 to-slate-800 text-slate-950',
  }[tone];

  return (
    <div className={cx('relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br shadow-[0_10px_20px_rgba(0,0,0,0.28)]', palette)}>
      <div className="absolute inset-1 rounded-full border-[5px] border-dashed border-white/75" />
      <div className="absolute inset-[11px] rounded-full bg-white/80" />
      <span className="relative text-[10px] font-black tracking-tight">{label}</span>
    </div>
  );
};

const ActionButton = ({
  children,
  onClick,
  disabled,
  tone = 'gold',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'gold' | 'emerald' | 'rose';
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cx(
      'bj-action-button group relative min-w-[122px] rounded-full border px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(0,0,0,0.24)] transition active:scale-95 disabled:pointer-events-none disabled:opacity-35',
      tone === 'emerald' && 'border-emerald-200/35 bg-emerald-500/20 hover:bg-emerald-400/30',
      tone === 'rose' && 'border-rose-200/35 bg-rose-500/20 hover:bg-rose-400/30',
      tone === 'gold' && 'border-amber-200/35 bg-amber-400/20 hover:bg-amber-300/30',
    )}
  >
    <span className="absolute inset-1 rounded-full border border-white/10" />
    <span className="relative">{children}</span>
  </button>
);

const TableLabel = ({ title, score, hidden }: { title: string; score: string; hidden?: boolean }) => (
  <div className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 py-1.5 text-white/75 backdrop-blur-md">
    <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/40">{title}</span>
    <span className={cx('text-lg font-black leading-none', hidden ? 'text-white/50' : 'text-white')}>{score}</span>
  </div>
);

const resultCopy = (winner: RoundWinner, playerInfo: HandInfo, dealerInfo: HandInfo) => {
  if (winner === 'push') return { title: 'Push', sub: `${playerInfo.total} : ${dealerInfo.total}`, tone: 'text-sky-200' };
  if (winner === 'player') {
    if (playerInfo.blackjack) return { title: 'Blackjack!', sub: 'Идеальная рука', tone: 'text-emerald-200' };
    if (dealerInfo.bust) return { title: 'Dealer Bust', sub: `Дилер перебрал: ${dealerInfo.total}`, tone: 'text-emerald-200' };
    return { title: 'You Win', sub: `${playerInfo.total} против ${dealerInfo.total}`, tone: 'text-emerald-200' };
  }
  if (winner === 'dealer') {
    if (dealerInfo.blackjack) return { title: 'Dealer Blackjack', sub: 'У дилера 21', tone: 'text-rose-200' };
    if (playerInfo.bust) return { title: 'Bust', sub: `Ты перебрал: ${playerInfo.total}`, tone: 'text-rose-200' };
    return { title: 'Dealer Wins', sub: `${dealerInfo.total} против ${playerInfo.total}`, tone: 'text-rose-200' };
  }
  return { title: 'Blackjack', sub: 'Сделай ход', tone: 'text-white' };
};

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
  const [cardsLeft, setCardsLeft] = useState(deckRef.current.length);
  const [roundWinner, setRoundWinner] = useState<RoundWinner>(null);
  const [message, setMessage] = useState('Раздача карт');
  const [subMessage, setSubMessage] = useState('Карты летят из shoe');
  const [burst, setBurst] = useState(0);
  const [matchTitle, setMatchTitle] = useState('');

  const playerInfo = useMemo(() => getHandInfo(playerCards), [playerCards]);
  const dealerInfo = useMemo(() => getHandInfo(dealerCards), [dealerCards]);
  const visibleDealerInfo = useMemo(() => getHandInfo(dealerHoleOpen ? dealerCards : dealerCards.slice(0, 1)), [dealerCards, dealerHoleOpen]);

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
    setCardsLeft(deckRef.current.length);
    return card;
  }, []);

  const settleRound = useCallback(
    async (pCards: PlayingCard[], dCards: PlayingCard[]) => {
      runningDealerRef.current = false;
      setPhase('settling');
      setDealerHoleOpen(true);
      setMessage('Вскрытие');
      setSubMessage('Считаем карты');
      await wait(720);

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
        setMatchTitle(nextScore.player > nextScore.dealer ? 'YOU OWN THE TABLE' : 'DEALER TAKES IT');
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
      await wait(820);

      let cards = currentDealerCards;
      while (runningDealerRef.current) {
        const info = getHandInfo(cards);
        const shouldHit = info.total < 17 || (info.total === 17 && info.soft && Math.random() < 0.25);
        if (!shouldHit) break;

        const next = drawCard();
        cards = [...cards, next];
        setDealerCards(cards);
        setMessage('Дилер берет карту');
        setSubMessage(`${getHandInfo(cards).total} на руке`);
        await wait(760);

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
      setCardsLeft(deckRef.current.length);

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
      setMessage('Раздача карт');
      setSubMessage('Смотри на стол');
      setMatchTitle('');

      schedule(() => setPlayerCards([p1]), 120);
      schedule(() => setDealerCards([d1]), 430);
      schedule(() => setPlayerCards([p1, p2]), 740);
      schedule(() => setDealerCards([d1, d2]), 1060);
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
      }, 1560);
    },
    [clearTimers, drawCard, round, schedule, settleRound],
  );

  useEffect(() => {
    startRound(1);
    return clearTimers;
  }, []);

  const hit = useCallback(() => {
    if (phase !== 'player') return;
    const nextCard = drawCard();
    const nextPlayer = [...playerCards, nextCard];
    setPlayerCards(nextPlayer);

    const info = getHandInfo(nextPlayer);
    if (info.bust) {
      setMessage('Перебор');
      setSubMessage(`${info.total} — слишком много`);
      schedule(() => runDealer(dealerCards, nextPlayer), 650);
    } else if (info.total === 21) {
      setMessage('21');
      setSubMessage('Автоматически стоим');
      schedule(() => runDealer(dealerCards, nextPlayer), 650);
    } else {
      setMessage('Карта на столе');
      setSubMessage(`У тебя ${info.total}`);
    }
  }, [dealerCards, drawCard, phase, playerCards, runDealer, schedule]);

  const stand = useCallback(() => {
    if (phase !== 'player') return;
    setMessage('Stand');
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

  return (
    <>
      <style>{`
        :root {
          --bj-card-w: clamp(68px, 10vw, 112px);
          --bj-card-h: calc(var(--bj-card-w) * 1.45);
          --card-radius: clamp(12px, 1.5vw, 20px);
          --bj-safe-bottom: max(18px, env(safe-area-inset-bottom, 0px));
        }

        @keyframes bjTableGlow {
          0%, 100% { opacity: .74; transform: translate3d(-50%, -50%, 0) scale(1); }
          50% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1.025); }
        }

        @keyframes bjDealPlayer {
          0% { opacity: 0; transform: translate3d(44vw, -28vh, 0) rotate(26deg) scale(.24); filter: blur(3px); }
          55% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translate3d(0, calc(var(--lift) * -1), 0) rotate(var(--tilt)) scale(1); filter: blur(0); }
        }

        @keyframes bjDealDealer {
          0% { opacity: 0; transform: translate3d(32vw, 8vh, 0) rotate(-24deg) scale(.24); filter: blur(3px); }
          55% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translate3d(0, calc(var(--lift) * -1), 0) rotate(var(--tilt)) scale(1); filter: blur(0); }
        }

        @keyframes bjWinCard {
          0%, 100% { transform: translate3d(0, calc(var(--lift) * -1), 0) rotate(var(--tilt)) scale(1); }
          50% { transform: translate3d(0, calc(var(--lift) * -1 - 7px), 0) rotate(var(--tilt)) scale(1.035); }
        }

        @keyframes bjShockwave {
          0% { transform: translate(-50%, -50%) scale(.25); opacity: .85; }
          100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
        }

        @keyframes bjSparkFly {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--r, 0deg)) scale(.5); }
          15% { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--r, 0deg)) scale(.1); }
        }

        @keyframes bjStatusIn {
          0% { opacity: 0; transform: translateY(12px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes bjShoePulse {
          0%, 100% { transform: rotate(-10deg) translateY(0); }
          50% { transform: rotate(-10deg) translateY(-5px); }
        }

        @keyframes bjButtonShine {
          0% { transform: translateX(-130%) skewX(-20deg); opacity: 0; }
          40% { opacity: .55; }
          100% { transform: translateX(180%) skewX(-20deg); opacity: 0; }
        }

        .bj-card-shell {
          width: var(--bj-card-w);
          height: var(--bj-card-h);
          perspective: 1100px;
          transform: translate3d(0, calc(var(--lift) * -1), 0) rotate(var(--tilt));
          filter: drop-shadow(0 24px 24px rgba(0,0,0,.28));
        }

        .bj-deal-player { animation: bjDealPlayer 620ms cubic-bezier(.18,.85,.2,1) both; }
        .bj-deal-dealer { animation: bjDealDealer 620ms cubic-bezier(.18,.85,.2,1) both; }
        .bj-winning-card { animation: bjWinCard 1400ms ease-in-out infinite; }

        .bj-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 680ms cubic-bezier(.2,.82,.2,1);
        }

        .bj-card-hidden { transform: rotateY(180deg); }

        .bj-card-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: var(--card-radius);
          border: 1px solid rgba(15, 23, 42, .14);
          backface-visibility: hidden;
        }

        .bj-card-front { background: white; }
        .bj-card-back { transform: rotateY(180deg); }

        .bj-card-corner {
          position: absolute;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: .88;
          text-shadow: 0 1px 0 rgba(255,255,255,.5);
        }

        .bj-card-corner strong { font-size: clamp(13px, 1.75vw, 20px); font-weight: 950; }
        .bj-card-corner span { font-size: clamp(13px, 1.75vw, 21px); font-weight: 900; }

        .bj-table-oval::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(88vw, 1080px);
          height: min(78vh, 620px);
          transform: translate(-50%, -50%);
          border-radius: 999px;
          border: 2px solid rgba(250, 204, 21, .23);
          box-shadow: inset 0 0 0 18px rgba(0,0,0,.12), inset 0 0 80px rgba(0,0,0,.32), 0 0 80px rgba(16,185,129,.14);
          pointer-events: none;
        }

        .bj-table-oval::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 52%;
          width: min(58vw, 650px);
          height: min(40vh, 310px);
          transform: translate(-50%, -50%);
          border-radius: 999px;
          border: 1px dashed rgba(255,255,255,.13);
          pointer-events: none;
          animation: bjTableGlow 5s ease-in-out infinite;
        }

        .bj-shoe-dealing { animation: bjShoePulse 900ms ease-in-out infinite; }

        .bj-action-button { overflow: hidden; backdrop-filter: blur(16px); }
        .bj-action-button::after {
          content: '';
          position: absolute;
          inset: -50% auto -50% 0;
          width: 44%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
          animation: bjButtonShine 2.7s ease-in-out infinite;
        }

        .bj-shockwave {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 160px;
          height: 160px;
          border-radius: 999px;
          border: 2px solid rgba(255,255,255,.6);
          box-shadow: 0 0 40px rgba(255,255,255,.22), inset 0 0 35px rgba(255,255,255,.15);
          animation: bjShockwave 900ms ease-out both;
        }

        .bj-win-wave { border-color: rgba(110,231,183,.85); box-shadow: 0 0 50px rgba(16,185,129,.32); }
        .bj-lose-wave { border-color: rgba(253,164,175,.85); box-shadow: 0 0 50px rgba(244,63,94,.32); }

        .bj-spark {
          position: absolute;
          border-radius: 999px;
          transform-origin: left center;
          animation: bjSparkFly 850ms cubic-bezier(.16,.82,.21,1) both;
          filter: blur(.2px) drop-shadow(0 0 7px currentColor);
        }

        .bj-chip-stack > *:nth-child(1) { transform: translate(0, 0) rotate(-10deg); }
        .bj-chip-stack > *:nth-child(2) { transform: translate(-18px, 12px) rotate(8deg); }
        .bj-chip-stack > *:nth-child(3) { transform: translate(16px, 18px) rotate(18deg); }

        .bj-bet-tray {
          box-shadow: inset 0 0 26px rgba(0,0,0,.28), 0 18px 40px rgba(0,0,0,.18);
        }

        .bj-control-dock {
          bottom: calc(var(--bj-safe-bottom) + clamp(96px, 14vh, 142px));
        }

        .bj-player-zone {
          bottom: calc(var(--bj-safe-bottom) + clamp(190px, 29vh, 248px));
        }

        .bj-dealer-zone {
          top: clamp(26px, 5vh, 48px);
          max-width: calc(100% - 260px);
          left: 50%;
          transform: translateX(-50%);
        }

        .bj-bet-tray {
          transform: rotate(-3deg);
        }

        @media (max-height: 720px) {
          :root { --bj-card-w: clamp(56px, 9vw, 86px); }
          .bj-hide-low { display: none !important; }
          .bj-table-oval::after { display: none; }
          .bj-control-dock { bottom: calc(var(--bj-safe-bottom) + 72px); }
          .bj-player-zone { bottom: calc(var(--bj-safe-bottom) + 142px); }
          .bj-dealer-zone { top: 14px; max-width: 100%; }
        }

        @media (max-height: 600px) {
          :root { --bj-card-w: clamp(50px, 8.4vw, 74px); }
          .bj-control-dock { bottom: calc(var(--bj-safe-bottom) + 62px); }
          .bj-player-zone { bottom: calc(var(--bj-safe-bottom) + 122px); }
          .bj-status-card { transform: scale(.86); }
        }

        @media (max-width: 640px) {
          :root { --bj-card-w: clamp(54px, 17vw, 78px); }
          .bj-card-row { gap: 0.25rem !important; }
          .bj-action-button { min-width: 104px; padding: .72rem .9rem; font-size: 10px; }
          .bj-control-dock { bottom: calc(var(--bj-safe-bottom) + 74px); }
          .bj-player-zone { bottom: calc(var(--bj-safe-bottom) + 142px); }
        }
      `}</style>

      <div className="relative h-full min-h-[460px] w-full overflow-hidden bg-[#040806] text-white touch-none select-none" style={{ touchAction: 'none' }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(250,204,21,0.14),transparent_24%),radial-gradient(circle_at_80%_16%,rgba(16,185,129,0.14),transparent_25%),radial-gradient(circle_at_50%_110%,rgba(6,78,59,0.7),transparent_55%),linear-gradient(180deg,#06100d,#030504)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,#fff_1px,transparent_1px),linear-gradient(0deg,#fff_1px,transparent_1px)] bg-[length:42px_42px]" />
        <div className="absolute left-[-8%] top-[-20%] h-[48vh] w-[40vw] rounded-full bg-amber-300/12 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-28%] h-[56vh] w-[44vw] rounded-full bg-emerald-400/16 blur-3xl" />

        <div className="absolute left-1/2 top-2 z-40 w-[min(92vw,520px)] -translate-x-1/2">
          <div className="rounded-full border border-white/10 bg-black/34 px-3 py-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/80">You</span>
                <ScorePips value={score.player} activeClass="border-emerald-200 bg-emerald-300 text-emerald-300" />
              </div>

              <div className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-center">
                <div className="text-[8px] font-black uppercase tracking-[0.22em] text-white/38">Round</div>
                <div className="text-sm font-black leading-none text-amber-100">{round}</div>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2">
                <ScorePips value={score.dealer} activeClass="border-rose-200 bg-rose-300 text-rose-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/80">Dealer</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bj-table-oval absolute inset-x-2 bottom-2 top-[50px] overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(10,105,72,0.98),rgba(6,62,46,0.98)_52%,rgba(2,28,22,0.98)_100%)] shadow-[inset_0_0_90px_rgba(0,0,0,0.52),0_35px_90px_rgba(0,0,0,0.45)] sm:inset-x-4 sm:bottom-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.09),transparent_23%),linear-gradient(120deg,transparent,rgba(255,255,255,0.035),transparent)]" />
          <div className="absolute inset-[clamp(10px,2vw,28px)] rounded-[36px] border border-amber-200/18 shadow-[inset_0_0_28px_rgba(250,204,21,0.08)]" />
          <div className="bj-hide-low pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[clamp(42px,8vw,96px)] font-black uppercase tracking-[-0.08em] text-white/[0.035]">Blackjack</div>
            <div className="-mt-3 text-[10px] font-black uppercase tracking-[0.55em] text-amber-100/18">Dealer stands on 17</div>
          </div>

          <DeckShoe cardsLeft={cardsLeft} dealing={phase === 'dealing'} />

          <div className="pointer-events-none absolute left-[clamp(16px,3.5vw,48px)] bottom-[calc(var(--bj-safe-bottom)+clamp(210px,31vh,270px))] z-10 hidden lg:block">
            <div className="bj-bet-tray rounded-[28px] border border-amber-200/16 bg-black/14 px-4 py-3 backdrop-blur-[2px]">
              <div className="mb-2 text-[8px] font-black uppercase tracking-[0.28em] text-amber-100/38">Bet</div>
              <div className="bj-chip-stack relative h-[74px] w-[104px] opacity-90">
                <Chip label="25" tone="emerald" />
                <Chip label="100" tone="gold" />
                <Chip label="5" tone="rose" />
              </div>
            </div>
          </div>

          <div className="bj-dealer-zone absolute inset-x-0 z-20 flex flex-col items-center gap-2 px-3">
            <TableLabel title="Dealer" score={formatHand(visibleDealerInfo, dealerHidden)} hidden={dealerHidden} />
            <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+16px)] items-start justify-center gap-2 sm:gap-3">
              {dealerCards.map((card, index) => (
                <PlayingCardView
                  key={card.id}
                  card={card}
                  owner="dealer"
                  index={index}
                  hidden={!dealerHoleOpen && index === 1}
                  dimmed={roundWinner === 'player'}
                  winner={roundWinner === 'dealer'}
                />
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-[49%] z-30 w-[min(84vw,340px)] -translate-x-1/2 -translate-y-1/2 text-center">
            <div key={`${message}-${subMessage}-${burst}`} className="bj-status-card rounded-[24px] border border-white/10 bg-black/16 px-4 py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-md" style={{ animation: 'bjStatusIn 260ms ease-out both' }}>
              <div className={cx('text-[clamp(21px,3.4vw,38px)] font-black uppercase leading-none tracking-[-0.06em]', result.tone)}>
                {message}
              </div>
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">{subMessage}</div>

            </div>
          </div>

          <div className="bj-player-zone absolute inset-x-0 z-20 flex flex-col items-center gap-2 px-3">
            <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+16px)] items-start justify-center gap-2 sm:gap-3">
              {playerCards.map((card, index) => (
                <PlayingCardView
                  key={card.id}
                  card={card}
                  owner="player"
                  index={index}
                  dimmed={roundWinner === 'dealer'}
                  winner={roundWinner === 'player'}
                />
              ))}
            </div>
            <TableLabel title="You" score={formatHand(playerInfo)} />
          </div>

          <div className="bj-control-dock absolute inset-x-0 z-40 flex justify-center px-3">
            {phase === 'player' && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-black/38 p-1.5 shadow-[0_22px_55px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                <ActionButton onClick={hit} tone="emerald">Взять</ActionButton>
                <ActionButton onClick={stand} tone="gold">Вскрыть</ActionButton>
              </div>
            )}

            {phase === 'round_over' && (
              <button
                onClick={nextRound}
                className="rounded-full border border-amber-200/25 bg-amber-300/18 px-7 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-amber-50 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition active:scale-95"
              >
                Next Deal
              </button>
            )}
          </div>

          <SparkBurst seed={burst} kind={roundWinner} />

          {phase === 'match_over' && (
            <div className="absolute inset-0 z-50 grid place-items-center bg-black/52 p-5 backdrop-blur-md">
              <div className="w-full max-w-[430px] overflow-hidden rounded-[34px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,14,12,0.96),rgba(8,18,15,0.96))] p-6 text-center shadow-[0_35px_90px_rgba(0,0,0,0.48)]" style={{ animation: 'bjStatusIn 320ms ease-out both' }}>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-white/38">Match finished</div>
                <div className={cx('mt-4 text-4xl font-black uppercase leading-none tracking-[-0.07em]', score.player > score.dealer ? 'text-emerald-200' : 'text-rose-200')}>
                  {matchTitle}
                </div>
                <div className="mt-3 text-sm font-bold text-white/50">
                  {score.player} : {score.dealer} · pushes {score.push}
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-3xl border border-emerald-200/12 bg-emerald-400/8 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">You</div>
                    <div className="mt-2 text-4xl font-black text-emerald-200">{score.player}</div>
                  </div>
                  <div className="rounded-3xl border border-rose-200/12 bg-rose-400/8 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Dealer</div>
                    <div className="mt-2 text-4xl font-black text-rose-200">{score.dealer}</div>
                  </div>
                </div>

                <button
                  onClick={restartMatch}
                  className="mt-7 w-full rounded-2xl bg-gradient-to-r from-emerald-300 via-amber-200 to-rose-300 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_18px_38px_rgba(250,204,21,0.18)] transition active:scale-[0.98]"
                >
                  New Match
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export const BlackjackGame = BlackjackDuelGame;
export const Blackjack = BlackjackDuelGame;
export default BlackjackDuelGame;
