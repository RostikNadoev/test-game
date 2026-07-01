import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import spadesAImg from '../assets/games/bj/spades-a.webp';
import spades2Img from '../assets/games/bj/spades-2.webp';
import spades3Img from '../assets/games/bj/spades-3.webp';
import spades4Img from '../assets/games/bj/spades-4.webp';
import spades5Img from '../assets/games/bj/spades-5.webp';
import spades6Img from '../assets/games/bj/spades-6.webp';
import spades7Img from '../assets/games/bj/spades-7.webp';
import spades8Img from '../assets/games/bj/spades-8.webp';
import spades9Img from '../assets/games/bj/spades-9.webp';
import spades10Img from '../assets/games/bj/spades-10.webp';
import spadesJImg from '../assets/games/bj/spades-j.webp';
import spadesQImg from '../assets/games/bj/spades-q.webp';
import spadesKImg from '../assets/games/bj/spades-k.webp';

import clubsAImg from '../assets/games/bj/clubs-a.webp';
import clubs2Img from '../assets/games/bj/clubs-2.webp';
import clubs3Img from '../assets/games/bj/clubs-3.webp';
import clubs4Img from '../assets/games/bj/clubs-4.webp';
import clubs5Img from '../assets/games/bj/clubs-5.webp';
import clubs6Img from '../assets/games/bj/clubs-6.webp';
import clubs7Img from '../assets/games/bj/clubs-7.webp';
import clubs8Img from '../assets/games/bj/clubs-8.webp';
import clubs9Img from '../assets/games/bj/clubs-9.webp';
import clubs10Img from '../assets/games/bj/clubs-10.webp';
import clubsJImg from '../assets/games/bj/clubs-j.webp';
import clubsQImg from '../assets/games/bj/clubs-q.webp';
import clubsKImg from '../assets/games/bj/clubs-k.webp';

type Suit = '♠' | '♣';
type VisualSuit = 'spades' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type Owner = 'player' | 'dealer';
type Phase = 'dealing' | 'player' | 'settling' | 'round_over' | 'match_over';
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

type PlayerProfile = {
  nickname: string;
  label: string;
  avatar: string;
  tone: 'mint' | 'rose';
};

const SUITS: Suit[] = ['♠', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const CARD_IMAGES: Record<VisualSuit, Record<Rank, string>> = {
  spades: {
    A: spadesAImg,
    '2': spades2Img,
    '3': spades3Img,
    '4': spades4Img,
    '5': spades5Img,
    '6': spades6Img,
    '7': spades7Img,
    '8': spades8Img,
    '9': spades9Img,
    '10': spades10Img,
    J: spadesJImg,
    Q: spadesQImg,
    K: spadesKImg,
  },
  clubs: {
    A: clubsAImg,
    '2': clubs2Img,
    '3': clubs3Img,
    '4': clubs4Img,
    '5': clubs5Img,
    '6': clubs6Img,
    '7': clubs7Img,
    '8': clubs8Img,
    '9': clubs9Img,
    '10': clubs10Img,
    J: clubsJImg,
    Q: clubsQImg,
    K: clubsKImg,
  },
};

const TARGET_WINS = 5;
const TURN_SECONDS = 10;
const TURN_MS = TURN_SECONDS * 1000;

const GOLD = '#F2C766';
const MINT = '#52FFE5';
const ROSE = '#FF6B8A';

const PLAYER_PROFILE: PlayerProfile = {
  nickname: 'Rostik',
  label: 'Ты',
  avatar: 'R',
  tone: 'mint',
};

const DEALER_PROFILE: PlayerProfile = {
  nickname: 'Dealer',
  label: 'Дилер',
  avatar: 'D',
  tone: 'rose',
};

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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

const createShoe = (decks = 8) => {
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

const getCardVisualSuit = (suit: Suit): VisualSuit => (suit === '♠' ? 'spades' : 'clubs');
const getCardImage = (card: PlayingCard) => CARD_IMAGES[getCardVisualSuit(card.suit)][card.rank];

const AvatarBadge = ({
  profile,
  size = 'sm',
  winner = false,
}: {
  profile: PlayerProfile;
  size?: 'sm' | 'lg';
  winner?: boolean;
}) => {
  const color = profile.tone === 'mint' ? MINT : ROSE;

  return (
    <div
      className={cx(
        'bj-avatar relative grid shrink-0 place-items-center rounded-full border font-black uppercase',
        size === 'lg' ? 'h-[76px] w-[76px] text-3xl' : 'h-8 w-8 text-sm',
        winner && 'bj-avatar-winner',
      )}
      style={{
        borderColor: `${color}66`,
        color,
        background:
          `radial-gradient(circle at 35% 25%, rgba(255,255,255,.18), transparent 34%),` +
          `radial-gradient(circle at 50% 100%, ${color}2b, rgba(6,6,10,.98) 68%)`,
        boxShadow: winner ? `0 0 34px ${color}45, inset 0 0 18px rgba(255,255,255,.06)` : `0 0 16px ${color}22`,
      }}
    >
      <span className="relative z-10">{profile.avatar}</span>
    </div>
  );
};

const HeaderPlayer = ({
  profile,
  score,
  align = 'left',
}: {
  profile: PlayerProfile;
  score: number;
  align?: 'left' | 'right';
}) => {
  const color = profile.tone === 'mint' ? MINT : ROSE;

  return (
    <div className={cx('flex min-w-0 flex-1 items-center gap-2', align === 'right' && 'justify-end')}>
      {align === 'left' && <AvatarBadge profile={profile} />}

      <div className={cx('min-w-0', align === 'right' && 'text-right')}>
        <div className="truncate text-[11px] font-black leading-none text-white">{profile.nickname}</div>
        <div className="mt-1 flex items-center gap-1">
          {Array.from({ length: TARGET_WINS }).map((_, i) => {
            const on = i < score;

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
      </div>

      {align === 'right' && <AvatarBadge profile={profile} />}
    </div>
  );
};

const TurnTimer = ({ msLeft, active }: { msLeft: number; active: boolean }) => {
  if (!active) return null;

  const progress = Math.max(0, Math.min(1, msLeft / TURN_MS));
  const seconds = Math.max(0, Math.ceil(msLeft / 1000));
  const color = seconds <= 3 ? ROSE : progress <= 0.55 ? GOLD : MINT;

  return (
    <div
      className={cx('bj-turn-timer relative grid place-items-center', seconds <= 3 && 'bj-turn-danger')}
      style={{
        ['--angle' as string]: `${progress * 360}deg`,
        ['--timer-c' as string]: color,
        ['--timer-glow' as string]: `${color}66`,
      }}
    >
      <div className="relative z-10 flex flex-col items-center leading-none">
        <span className="text-[22px] font-black tabular-nums" style={{ color }}>
          {seconds}
        </span>
        <span className="mt-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-white/35">сек</span>
      </div>
    </div>
  );
};

const CardBackDesign = () => (
  <div className="bj-card-back-design">
    <div className="bj-back-glow" />
    <div className="bj-back-pattern" />
    <div className="bj-back-inner-border" />
    <div className="bj-back-corner bj-back-corner-tl" />
    <div className="bj-back-corner bj-back-corner-br" />

    <div className="bj-back-logo-slot">
      <div className="bj-back-logo-core">
        <span>BJ</span>
      </div>
    </div>
  </div>
);

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
  const overlap = count > 5 ? -0.52 : count > 4 ? -0.46 : -0.35;

  return (
    <div
      className={cx(
        'bj-card-shell relative shrink-0',
        owner === 'player' ? 'bj-deal-player' : 'bj-deal-dealer',
        hidden && 'bj-hidden-shell',
        dimmed && 'bj-dimmed',
        winner && 'bj-winning-card',
        winner && (owner === 'player' ? 'bj-win-mint' : 'bj-win-rose'),
      )}
      style={{
        ['--tilt' as string]: `${tilt}deg`,
        ['--lift' as string]: `${lift}px`,
        marginLeft: index === 0 ? undefined : `calc(var(--bj-card-w) * ${overlap})`,
        zIndex: 10 + index,
      }}
    >
      <div className={cx('bj-card-inner', hidden && 'bj-card-hidden')}>
        <div className="bj-card-face bj-card-front">
          <img
            src={getCardImage(card)}
            alt={`${card.rank}${card.suit}`}
            className="bj-card-img"
            draggable={false}
          />
        </div>

        <div className="bj-card-face bj-card-back">
          <CardBackDesign />
        </div>
      </div>
    </div>
  );
};

const CardRow = ({ children }: { children: React.ReactNode }) => (
  <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+8px)] items-end justify-center">{children}</div>
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
    <span className={cx('text-sm font-black leading-none tabular-nums', hidden ? 'text-white/40' : 'text-white')}>
      {score}
    </span>
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

export const BlackjackDuelGame: React.FC = () => {
  const timersRef = useRef<number[]>([]);
  const turnTimerRef = useRef<number | null>(null);
  const deckRef = useRef<PlayingCard[]>(createShoe());
  const dealerAutoRef = useRef(false);
  const settlingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('dealing');
  const [playerCards, setPlayerCards] = useState<PlayingCard[]>([]);
  const [dealerCards, setDealerCards] = useState<PlayingCard[]>([]);
  const [dealerCardsRevealed, setDealerCardsRevealed] = useState(false);
  const [score, setScore] = useState<Score>({ player: 0, dealer: 0, push: 0 });
  const [round, setRound] = useState(1);
  const [roundWinner, setRoundWinner] = useState<RoundWinner>(null);
  const [message, setMessage] = useState('Раздача');
  const [subMessage, setSubMessage] = useState('Карты на стол');
  const [burst, setBurst] = useState(0);
  const [matchTitle, setMatchTitle] = useState('');
  const [turnLeftMs, setTurnLeftMs] = useState(TURN_MS);

  const scoreRef = useRef(score);
  const latestRoundRef = useRef<{
    phase: Phase;
    playerCards: PlayingCard[];
    dealerCards: PlayingCard[];
  }>({
    phase: 'dealing',
    playerCards: [],
    dealerCards: [],
  });

  const playerInfo = useMemo(() => getHandInfo(playerCards), [playerCards]);
  const dealerInfo = useMemo(() => getHandInfo(dealerCards), [dealerCards]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    latestRoundRef.current = {
      phase,
      playerCards,
      dealerCards,
    };
  }, [phase, playerCards, dealerCards]);

  const clearTurnTimer = useCallback(() => {
    if (turnTimerRef.current !== null) {
      window.clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    dealerAutoRef.current = false;
    settlingRef.current = false;
    clearTurnTimer();
  }, [clearTurnTimer]);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const drawCard = useCallback(() => {
    if (deckRef.current.length < 24) deckRef.current = createShoe();

    const card = deckRef.current.pop();

    if (!card) throw new Error('Shoe is empty');

    return card;
  }, []);

  const finishDealerHand = useCallback(
    (startCards: PlayingCard[]) => {
      let cards = [...startCards];
      let safety = 0;

      while (safety < 7) {
        const info = getHandInfo(cards);
        const shouldHit = info.total < 17 || (info.total === 17 && info.soft && Math.random() < 0.25);

        if (!shouldHit) break;

        cards = [...cards, drawCard()];
        safety += 1;

        if (getHandInfo(cards).bust) break;
      }

      return cards;
    },
    [drawCard],
  );

  const settleRound = useCallback(
    async (pCards: PlayingCard[], rawDealerCards: PlayingCard[]) => {
      if (settlingRef.current) return;

      settlingRef.current = true;
      dealerAutoRef.current = false;
      clearTurnTimer();

      const finalDealerCards = finishDealerHand(rawDealerCards);

      setPhase('settling');
      setDealerCards(finalDealerCards);
      setDealerCardsRevealed(false);
      setMessage('Вскрытие');
      setSubMessage('Открываем карты дилера');

      await wait(420);

      setDealerCardsRevealed(true);

      await wait(640);

      const p = getHandInfo(pCards);
      const d = getHandInfo(finalDealerCards);

      let winner: RoundWinner;

      if (p.bust && d.bust) winner = 'push';
      else if (p.blackjack && !d.blackjack) winner = 'player';
      else if (d.blackjack && !p.blackjack) winner = 'dealer';
      else if (p.bust) winner = 'dealer';
      else if (d.bust) winner = 'player';
      else if (p.total > d.total) winner = 'player';
      else if (d.total > p.total) winner = 'dealer';
      else winner = 'push';

      const prevScore = scoreRef.current;
      const nextScore: Score = {
        player: prevScore.player + (winner === 'player' ? 1 : 0),
        dealer: prevScore.dealer + (winner === 'dealer' ? 1 : 0),
        push: prevScore.push + (winner === 'push' ? 1 : 0),
      };

      scoreRef.current = nextScore;

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
    [clearTurnTimer, finishDealerHand],
  );

  const startDealerAuto = useCallback(() => {
    dealerAutoRef.current = true;

    const step = () => {
      if (!dealerAutoRef.current || settlingRef.current) return;

      let didHit = false;

      setDealerCards((currentCards) => {
        if (!dealerAutoRef.current || settlingRef.current) return currentCards;

        const info = getHandInfo(currentCards);
        const shouldHit = info.total < 17 || (info.total === 17 && info.soft && Math.random() < 0.25);

        if (!shouldHit) {
          dealerAutoRef.current = false;
          return currentCards;
        }

        didHit = true;
        return [...currentCards, drawCard()];
      });

      if (didHit && dealerAutoRef.current) {
        schedule(step, 980 + Math.floor(Math.random() * 520));
      }
    };

    schedule(step, 960 + Math.floor(Math.random() * 360));
  }, [drawCard, schedule]);

  const forceStandByTimer = useCallback(() => {
    const latest = latestRoundRef.current;

    if (latest.phase !== 'player') return;

    clearTurnTimer();

    const info = getHandInfo(latest.playerCards);

    setTurnLeftMs(0);
    setMessage('Время вышло');
    setSubMessage(`Авто-вскрытие ${info.total}`);

    schedule(() => {
      settleRound(latest.playerCards, latestRoundRef.current.dealerCards);
    }, 260);
  }, [clearTurnTimer, schedule, settleRound]);

  useEffect(() => {
    clearTurnTimer();

    if (phase !== 'player') {
      setTurnLeftMs(TURN_MS);
      return;
    }

    const deadline = Date.now() + TURN_MS;

    setTurnLeftMs(TURN_MS);

    turnTimerRef.current = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());

      setTurnLeftMs(left);

      if (left <= 0) {
        forceStandByTimer();
      }
    }, 80);

    return clearTurnTimer;
  }, [phase, clearTurnTimer, forceStandByTimer]);

  const startRound = useCallback(
    (nextRoundValue = round) => {
      clearTimers();

      if (deckRef.current.length < 28) deckRef.current = createShoe();

      const p1 = drawCard();
      const d1 = drawCard();
      const p2 = drawCard();
      const d2 = drawCard();

      const initialPlayer = [p1, p2];
      const initialDealer = [d1, d2];

      setRound(nextRoundValue);
      setRoundWinner(null);
      setDealerCardsRevealed(false);
      setPlayerCards([]);
      setDealerCards([]);
      setPhase('dealing');
      setTurnLeftMs(TURN_MS);
      setMessage('Раздача');
      setSubMessage('Карты на стол');
      setMatchTitle('');

      schedule(() => setPlayerCards([p1]), 110);
      schedule(() => setDealerCards([d1]), 360);
      schedule(() => setPlayerCards([p1, p2]), 630);
      schedule(() => setDealerCards([d1, d2]), 900);

      schedule(() => {
        const p = getHandInfo(initialPlayer);
        const d = getHandInfo(initialDealer);

        if (p.blackjack || d.blackjack) {
          settleRound(initialPlayer, initialDealer);
          return;
        }

        setPhase('player');
        setMessage('Твой ход');
        setSubMessage('10 секунд · дилер тоже берёт скрыто');
        startDealerAuto();
      }, 1340);
    },
    [clearTimers, drawCard, round, schedule, settleRound, startDealerAuto],
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
      clearTurnTimer();
      setMessage('Перебор');
      setSubMessage(`${info.total} — слишком много`);
      schedule(() => settleRound(nextPlayer, latestRoundRef.current.dealerCards), 460);
    } else if (info.total === 21) {
      clearTurnTimer();
      setMessage('21');
      setSubMessage('Стоп автоматически');
      schedule(() => settleRound(nextPlayer, latestRoundRef.current.dealerCards), 460);
    } else {
      setMessage('Карта взята');
      setSubMessage(`У тебя ${info.total} · время не сбрасывается`);
    }
  }, [clearTurnTimer, drawCard, phase, playerCards, schedule, settleRound]);

  const stand = useCallback(() => {
    if (phase !== 'player') return;

    const latest = latestRoundRef.current;

    clearTurnTimer();
    setMessage('Вскрытие');
    setSubMessage(`Фиксируем ${getHandInfo(latest.playerCards).total}`);
    settleRound(latest.playerCards, latest.dealerCards);
  }, [clearTurnTimer, phase, settleRound]);

  const nextRound = useCallback(() => {
    if (phase !== 'round_over') return;
    startRound(round + 1);
  }, [phase, round, startRound]);

  const restartMatch = useCallback(() => {
    clearTimers();
    deckRef.current = createShoe();
    const freshScore = { player: 0, dealer: 0, push: 0 };
    scoreRef.current = freshScore;
    setScore(freshScore);
    setRound(1);
    setMatchTitle('');
    setTurnLeftMs(TURN_MS);
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
  const dealerHidden = !dealerCardsRevealed && dealerCards.length > 0;
  const waitingPhase = phase === 'dealing' || phase === 'settling';
  const waitingLabel = phase === 'dealing' ? 'Раздача' : 'Подсчёт';

  const winnerProfile = score.player > score.dealer ? PLAYER_PROFILE : DEALER_PROFILE;
  const winnerColor = winnerProfile.tone === 'mint' ? MINT : ROSE;

  return (
    <div className="bj-root relative flex h-full min-h-[440px] w-full select-none flex-col overflow-hidden bg-[#050507] text-white">
      <style>{`
        .bj-root {
          --bj-card-w: clamp(68px, 17vw, 104px);
          --bj-card-h: calc(var(--bj-card-w) * 1.50);
          --bj-radius: clamp(12px, 1.5vw, 18px);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .bj-card-shell {
          width: var(--bj-card-w);
          height: var(--bj-card-h);
          perspective: 1000px;
          transform: translate3d(0, var(--lift), 0) rotate(var(--tilt));
          filter: drop-shadow(0 12px 14px rgba(0,0,0,0.40));
          will-change: transform;
          isolation: isolate;
          contain: layout paint;
        }

        .bj-dimmed {
          opacity: .55;
          filter: drop-shadow(0 8px 12px rgba(0,0,0,0.4)) saturate(.7);
        }

        .bj-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transform: rotateY(0deg) translateZ(0);
          transition: transform 560ms cubic-bezier(.2,.8,.2,1);
          will-change: transform;
        }

        .bj-card-hidden {
          transform: rotateY(180deg) translateZ(0);
        }

        .bj-card-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: var(--bj-radius);
          border: 1px solid rgba(15,23,42,.16);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: flat;
        }

        .bj-card-front {
          transform: rotateY(0deg) translateZ(0.6px);
          background: rgba(246, 241, 225, .96);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.48),
            inset 0 -10px 20px rgba(0,0,0,.06);
        }

        .bj-card-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          user-select: none;
          pointer-events: none;
          transform: translateZ(0);
        }

        .bj-card-back {
          transform: rotateY(180deg) translateZ(0.6px);
          border-color: rgba(242,199,102,.28);
          background: #070709;
          box-shadow:
            inset 0 0 0 1px rgba(242,199,102,.18),
            inset 0 0 24px rgba(0,0,0,.72),
            0 0 0 1px rgba(0,0,0,.45);
        }

        .bj-card-hidden .bj-card-front {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .bj-card-hidden .bj-card-back {
          opacity: 1;
          visibility: visible;
        }

        .bj-hidden-shell {
          opacity: 1 !important;
          filter: drop-shadow(0 12px 14px rgba(0,0,0,0.42));
        }

        .bj-card-back-design {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: inherit;
          background:
            radial-gradient(circle at 28% 15%, rgba(255,255,255,.14), transparent 28%),
            radial-gradient(circle at 78% 80%, rgba(82,255,229,.16), transparent 34%),
            linear-gradient(145deg, #191414 0%, #0a0b11 44%, #05170f 100%);
        }

        .bj-back-glow {
          position: absolute;
          inset: -18%;
          background:
            conic-gradient(from 0deg, rgba(242,199,102,.00), rgba(242,199,102,.30), rgba(82,255,229,.24), rgba(242,199,102,.00));
          opacity: .62;
          animation: bjBackGlow 5.5s linear infinite;
        }

        .bj-back-pattern {
          position: absolute;
          inset: 9px;
          border-radius: calc(var(--bj-radius) - 5px);
          background:
            radial-gradient(circle at 50% 50%, rgba(82,255,229,.13), transparent 42%),
            repeating-linear-gradient(45deg, rgba(242,199,102,.18) 0 3px, transparent 3px 11px),
            repeating-linear-gradient(-45deg, rgba(255,255,255,.045) 0 3px, transparent 3px 11px);
          border: 1px solid rgba(242,199,102,.30);
          box-shadow:
            inset 0 0 0 2px rgba(0,0,0,.34),
            inset 0 0 28px rgba(0,0,0,.70),
            0 0 18px rgba(242,199,102,.10);
        }

        .bj-back-inner-border {
          position: absolute;
          inset: 15px;
          border-radius: calc(var(--bj-radius) - 8px);
          border: 1px solid rgba(82,255,229,.18);
          box-shadow: inset 0 0 15px rgba(82,255,229,.10);
        }

        .bj-back-corner {
          position: absolute;
          width: 28%;
          aspect-ratio: 1;
          border: 2px solid rgba(242,199,102,.62);
          filter: drop-shadow(0 0 5px rgba(242,199,102,.18));
        }

        .bj-back-corner-tl {
          left: 9px;
          top: 9px;
          border-right: 0;
          border-bottom: 0;
          border-radius: calc(var(--bj-radius) - 5px) 0 0 0;
        }

        .bj-back-corner-br {
          right: 9px;
          bottom: 9px;
          border-left: 0;
          border-top: 0;
          border-radius: 0 0 calc(var(--bj-radius) - 5px) 0;
        }

        .bj-back-logo-slot {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
        }

        .bj-back-logo-core {
          position: relative;
          width: 47%;
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          border-radius: 28%;
          transform: rotate(45deg);
          background:
            radial-gradient(circle at 35% 18%, rgba(255,255,255,.38), transparent 35%),
            linear-gradient(145deg, rgba(242,199,102,.90), rgba(164,94,26,.95));
          border: 2px solid rgba(255,255,255,.22);
          box-shadow:
            inset 0 2px 6px rgba(255,255,255,.28),
            inset 0 -8px 12px rgba(0,0,0,.34),
            0 0 20px rgba(242,199,102,.24),
            0 10px 18px rgba(0,0,0,.32);
        }

        .bj-back-logo-core::before {
          content: '';
          position: absolute;
          inset: 13%;
          border-radius: 24%;
          border: 1px solid rgba(0,0,0,.34);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
        }

        .bj-back-logo-core span {
          transform: rotate(-45deg);
          color: #15100b;
          font-size: clamp(15px, 4.5vw, 28px);
          font-weight: 950;
          letter-spacing: -.10em;
          text-shadow: 0 1px 0 rgba(255,255,255,.28);
        }

        @keyframes bjBackGlow {
          to {
            transform: rotate(360deg);
          }
        }

        .bj-turn-timer {
          width: 68px;
          height: 68px;
          border-radius: 999px;
          background: conic-gradient(var(--timer-c) var(--angle), rgba(255,255,255,.08) 0deg);
          box-shadow: 0 0 24px var(--timer-glow);
        }

        .bj-turn-timer::before {
          content: "";
          position: absolute;
          inset: 5px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.08), transparent 46%),
            #080911;
          border: 1px solid rgba(255,255,255,.08);
        }

        .bj-turn-danger {
          animation: bjTimerPulse 520ms ease-in-out infinite;
        }

        @keyframes bjTimerPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.045);
          }
        }

        .bj-avatar::after {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.08);
          opacity: .8;
        }

        .bj-avatar-winner {
          animation: bjWinnerAvatar 1400ms ease-in-out infinite;
        }

        @keyframes bjWinnerAvatar {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-3px) scale(1.035);
          }
        }

        @keyframes bjDealPlayer {
          0% {
            opacity: 0;
            transform: translate3d(38vw, -26vh, 0) rotate(18deg) scale(.42);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1);
          }
        }

        @keyframes bjDealDealer {
          0% {
            opacity: 0;
            transform: translate3d(30vw, 12vh, 0) rotate(-16deg) scale(.42);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1);
          }
        }

        .bj-deal-player {
          animation: bjDealPlayer 500ms cubic-bezier(.2,.8,.2,1) both;
        }

        .bj-deal-dealer {
          animation: bjDealDealer 500ms cubic-bezier(.2,.8,.2,1) both;
        }

        @keyframes bjWinCard {
          0%, 100% {
            transform: translate3d(0, var(--lift), 0) rotate(var(--tilt)) scale(1);
          }
          50% {
            transform: translate3d(0, calc(var(--lift) - 8px), 0) rotate(var(--tilt)) scale(1.03);
          }
        }

        .bj-winning-card {
          animation: bjWinCard 1500ms ease-in-out infinite;
        }

        .bj-win-mint .bj-card-front {
          box-shadow: inset 0 0 0 1.5px rgba(82,255,229,.75), 0 0 18px rgba(82,255,229,.30);
        }

        .bj-win-rose .bj-card-front {
          box-shadow: inset 0 0 0 1.5px rgba(255,107,138,.75), 0 0 18px rgba(255,107,138,.30);
        }

        @keyframes bjStatusIn {
          0% {
            opacity: 0;
            transform: translateY(7px) scale(.97);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }

        .bj-status-in {
          animation: bjStatusIn 230ms ease-out both;
        }

        @keyframes bjRing {
          0% {
            transform: translate(-50%,-50%) scale(.35);
            opacity: .65;
          }
          100% {
            transform: translate(-50%,-50%) scale(2.3);
            opacity: 0;
          }
        }

        .bj-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 120px;
          height: 120px;
          border-radius: 999px;
          border: 2px solid var(--c);
          box-shadow: 0 0 24px -4px var(--c);
          animation: bjRing 700ms ease-out both;
        }

        @keyframes bjSpark {
          0% {
            opacity: 0;
            transform: translate(-50%,-50%) scale(.6);
          }
          14% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2);
          }
        }

        .bj-spark {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 4px;
          border-radius: 999px;
          transform: translate(-50%,-50%);
          animation: bjSpark 700ms cubic-bezier(.2,.8,.2,1) both;
          filter: drop-shadow(0 0 4px currentColor);
        }

        @media (max-width: 460px) {
          .bj-root {
            --bj-card-w: clamp(68px, 18.4vw, 86px);
          }

          .bj-turn-timer {
            width: 62px;
            height: 62px;
          }
        }

        @media (max-height: 680px) {
          .bj-root {
            --bj-card-w: clamp(58px, 15.5vw, 88px);
          }
        }

        @media (max-height: 560px) {
          .bj-root {
            --bj-card-w: clamp(52px, 14vw, 74px);
          }

          .bj-status-msg {
            font-size: clamp(17px, 5vw, 26px) !important;
          }

          .bj-turn-timer {
            width: 56px;
            height: 56px;
          }
        }

        @media (max-width: 390px) and (max-height: 680px) {
          .bj-root {
            --bj-card-w: clamp(58px, 16.5vw, 76px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bj-deal-player,
          .bj-deal-dealer,
          .bj-winning-card,
          .bj-status-in,
          .bj-ring,
          .bj-spark,
          .bj-turn-danger,
          .bj-avatar-winner,
          .bj-back-glow {
            animation: none !important;
          }

          .bj-card-inner {
            transition: none !important;
          }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(80% 50% at 50% 0%, ${GOLD}10, transparent 60%),` +
            `radial-gradient(85% 60% at 50% 100%, ${MINT}10, transparent 55%)`,
        }}
      />

      <div className="relative z-20 shrink-0 px-3 pt-2">
        <div className="mx-auto flex max-w-[500px] items-center justify-between gap-3 rounded-[20px] border border-white/[0.06] bg-white/[0.035] px-2.5 py-2">
          <HeaderPlayer profile={PLAYER_PROFILE} score={score.player} align="left" />

          <div className="flex shrink-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-1.5 leading-none">
            <span className="text-[8px] font-black uppercase tracking-[0.24em] text-white/35">Раунд</span>
            <span className="mt-0.5 text-sm font-black" style={{ color: GOLD }}>
              {round}
            </span>
          </div>

          <HeaderPlayer profile={DEALER_PROFILE} score={score.dealer} align="right" />
        </div>
      </div>

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

        <div className="relative z-10 flex flex-col items-center gap-1.5 px-3 pt-3">
          <TableLabel
            title={DEALER_PROFILE.nickname}
            score={formatHand(dealerInfo, dealerHidden)}
            hidden={dealerHidden}
            tone="dealer"
          />

          <CardRow>
            {dealerCards.map((card, index) => (
              <PlayingCardView
                key={card.id}
                card={card}
                owner="dealer"
                index={index}
                count={dealerCards.length}
                hidden={!dealerCardsRevealed}
                dimmed={roundWinner === 'player'}
                winner={roundWinner === 'dealer'}
              />
            ))}
          </CardRow>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <div key={`${message}-${burst}`} className="bj-status-in flex flex-col items-center">
            <TurnTimer msLeft={turnLeftMs} active={phase === 'player'} />

            <div
              className={cx(
                'bj-status-msg font-black uppercase leading-none tracking-[-0.04em]',
                phase === 'player' ? 'mt-3 text-[clamp(18px,5.2vw,30px)]' : 'text-[clamp(20px,6vw,34px)]',
              )}
              style={{ color: result.color }}
            >
              {message}
            </div>

            <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              {subMessage}
            </div>
          </div>
        </div>

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

          <TableLabel title={PLAYER_PROFILE.nickname} score={formatHand(playerInfo)} tone="player" />
        </div>

        <ResultBurst seed={burst} kind={roundWinner} />
      </div>

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

      {phase === 'match_over' && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/75 p-5">
          <div className="bj-status-in relative w-full max-w-[370px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0a0a11] p-6 text-center">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  `radial-gradient(60% 44% at 50% 0%, ${winnerColor}20, transparent 70%),` +
                  `radial-gradient(70% 70% at 50% 100%, ${GOLD}10, transparent 70%)`,
              }}
            />

            <div className="relative z-10 flex flex-col items-center">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">Матч окончен</div>

              <div className="mt-4">
                <AvatarBadge profile={winnerProfile} size="lg" winner />
              </div>

              <div className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-white/35">Победитель</div>

              <div
                className="mt-1 max-w-full truncate text-3xl font-black uppercase leading-none tracking-[-0.05em]"
                style={{ color: winnerColor }}
              >
                {winnerProfile.nickname}
              </div>

              <div className="mt-2 text-sm font-bold text-white/45">{matchTitle}</div>

              <div className="mt-5 flex w-full items-stretch gap-3">
                <div className="flex-1 rounded-2xl border py-3" style={{ borderColor: `${MINT}26`, background: `${MINT}0d` }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    {PLAYER_PROFILE.nickname}
                  </div>
                  <div className="mt-1 text-3xl font-black" style={{ color: MINT }}>
                    {score.player}
                  </div>
                </div>

                <div className="flex-1 rounded-2xl border py-3" style={{ borderColor: `${ROSE}26`, background: `${ROSE}0d` }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    {DEALER_PROFILE.nickname}
                  </div>
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
        </div>
      )}
    </div>
  );
};

export const BlackjackGame = BlackjackDuelGame;
export const Blackjack = BlackjackDuelGame;
export default BlackjackDuelGame;
