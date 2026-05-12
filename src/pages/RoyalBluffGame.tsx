import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Rank = 'A' | 'K' | 'Q' | 'JOKER';
type Suit = '♠' | '♥' | '♦' | '♣';
type PlayerId = 'lumo' | 'nix' | 'rourke' | 'you';
type Phase = 'select' | 'decision' | 'reveal' | 'shot' | 'roundEnd' | 'gameOver';
type Reaction = 'idle' | 'thinking' | 'smug' | 'shocked' | 'angry' | 'celebrate';
type Seat = 'bottom' | 'right' | 'top' | 'left';

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

type Card = {
  id: string;
  rank: Rank;
  suit?: Suit;
};

type Player = {
  id: PlayerId;
  name: string;
  title: string;
  avatar: 'owl' | 'gecko' | 'shark' | 'fox';
  hand: Card[];
  alive: boolean;
  danger: number;
  reaction: Reaction;
  accent: string;
  glow: string;
};

type LastPlay = {
  playerIndex: number;
  cards: Card[];
};

type ShotInfo = {
  playerIndex: number;
  hit: boolean;
};

const TARGET_RANKS: Rank[] = ['A', 'K', 'Q'];

const PLAYER_TEMPLATES: Omit<Player, 'hand'>[] = [
  {
    id: 'lumo',
    name: 'LUMO',
    title: 'Moon Oracle',
    avatar: 'owl',
    alive: true,
    danger: 0,
    reaction: 'idle',
    accent: '#a78bfa',
    glow: 'rgba(167,139,250,.42)',
  },
  {
    id: 'nix',
    name: 'NIX',
    title: 'Bottle Alchemist',
    avatar: 'gecko',
    alive: true,
    danger: 0,
    reaction: 'idle',
    accent: '#4ade80',
    glow: 'rgba(74,222,128,.38)',
  },
  {
    id: 'rourke',
    name: 'ROURKE',
    title: 'Sea Captain',
    avatar: 'shark',
    alive: true,
    danger: 0,
    reaction: 'idle',
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,.38)',
  },
  {
    id: 'you',
    name: 'YOU',
    title: 'Golden Fox',
    avatar: 'fox',
    alive: true,
    danger: 0,
    reaction: 'idle',
    accent: '#facc15',
    glow: 'rgba(250,204,21,.42)',
  },
];

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

const rankLabel = (rank: Rank) => {
  if (rank === 'A') return 'A';
  if (rank === 'K') return 'K';
  if (rank === 'Q') return 'Q';
  return 'JOKER';
};

const rankLong = (rank: Rank) => {
  if (rank === 'A') return 'ACES';
  if (rank === 'K') return 'KINGS';
  if (rank === 'Q') return 'QUEENS';
  return 'JOKERS';
};

const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const shuffle = <T,>(items: T[]) => {
  const next = [...items];

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
};

const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  let id = 0;

  for (const rank of ['A', 'K', 'Q'] as Rank[]) {
    for (let i = 0; i < 6; i += 1) {
      deck.push({
        id: `${rank}-${id}`,
        rank,
        suit: SUITS[i % SUITS.length],
      });
      id += 1;
    }
  }

  for (let i = 0; i < 2; i += 1) {
    deck.push({
      id: `JOKER-${id}`,
      rank: 'JOKER',
    });
    id += 1;
  }

  return shuffle(deck);
};

const nextAliveIndex = (players: Player[], from: number) => {
  let index = from;

  for (let i = 0; i < players.length; i += 1) {
    index = (index + 1) % players.length;
    if (players[index].alive) return index;
  }

  return from;
};

const aliveCount = (players: Player[]) => players.filter((player) => player.alive).length;

const createPlayersForRound = (previous?: Player[]): Player[] => {
  const deck = buildDeck();

  const nextPlayers: Player[] = PLAYER_TEMPLATES.map((template, index) => {
    const old = previous?.[index];

    return {
      ...template,
      alive: old?.alive ?? true,
      danger: old?.danger ?? 0,
      reaction: 'idle',
      hand: [],
    };
  });

  for (let round = 0; round < 5; round += 1) {
    for (let playerIndex = 0; playerIndex < nextPlayers.length; playerIndex += 1) {
      if (!nextPlayers[playerIndex].alive) continue;

      const card = deck.shift();
      if (card) nextPlayers[playerIndex].hand.push(card);
    }
  }

  return nextPlayers;
};

const relativeSeat = (playerIndex: number, viewerIndex: number): Seat => {
  const diff = (playerIndex - viewerIndex + 4) % 4;

  if (diff === 0) return 'bottom';
  if (diff === 1) return 'right';
  if (diff === 2) return 'top';
  return 'left';
};

const safePlayer = (players: Player[], index: number) => players[index] ?? players[0];

const CardFace = ({
  card,
  selected = false,
  hidden = false,
  compact = false,
  disabled = false,
  onClick,
}: {
  card: Card;
  selected?: boolean;
  hidden?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => {
  const red = card.suit === '♥' || card.suit === '♦';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden rounded-[14px] border transition-all duration-200 ${
        compact ? 'h-[70px] w-[48px]' : 'h-[102px] w-[70px]'
      } ${
        selected
          ? '-translate-y-4 border-yellow-200 shadow-[0_18px_30px_rgba(250,204,21,.35)]'
          : 'border-black/15 shadow-[0_10px_20px_rgba(0,0,0,.3)]'
      } ${disabled ? 'cursor-default' : 'active:scale-95'}`}
    >
      {hidden ? (
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#4c1d95,#24113e)]">
          <div className="absolute inset-[5px] rounded-[10px] border border-yellow-200/24" />
          <div className="absolute inset-0 grid place-items-center text-2xl text-yellow-300">♛</div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#fff8e7,#ead9b8)]">
          <div className="absolute left-2 top-1.5 text-left leading-none">
            <div
              className={`font-black ${compact ? 'text-[14px]' : 'text-[19px]'} ${
                red ? 'text-rose-700' : 'text-stone-900'
              }`}
            >
              {rankLabel(card.rank)}
            </div>

            {card.rank !== 'JOKER' && (
              <div className={`${compact ? 'text-[11px]' : 'text-[15px]'} ${red ? 'text-rose-700' : 'text-stone-900'}`}>
                {card.suit}
              </div>
            )}
          </div>

          <div className="absolute inset-0 grid place-items-center">
            {card.rank === 'JOKER' ? (
              <div className={`${compact ? 'text-[23px]' : 'text-[34px]'}`}>🃏</div>
            ) : (
              <div className={`${compact ? 'text-[27px]' : 'text-[40px]'}`}>
                {card.rank === 'A' ? '🦊' : card.rank === 'K' ? '🦁' : '🐺'}
              </div>
            )}
          </div>

          <div className="absolute inset-[5px] rounded-[10px] border border-black/10" />
        </div>
      )}
    </button>
  );
};

const DangerPips = ({ value }: { value: number }) => (
  <div className="flex items-center gap-1">
    {Array.from({ length: 6 }).map((_, index) => (
      <span
        key={index}
        className={`h-1.5 w-1.5 rounded-full border ${
          index < value
            ? 'border-rose-100 bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,.85)]'
            : 'border-white/14 bg-black/24'
        }`}
      />
    ))}
  </div>
);

const BackCards = ({ count }: { count: number }) => (
  <div className="relative h-[32px] w-[62px]">
    {Array.from({ length: Math.min(count, 5) }).map((_, index) => (
      <div
        key={index}
        className="absolute h-[32px] w-[23px] rounded-md border border-yellow-100/20 bg-[linear-gradient(145deg,#4c1d95,#24113e)] shadow-[0_5px_10px_rgba(0,0,0,.35)]"
        style={{
          left: `${index * 9}px`,
          transform: `rotate(${index * 5 - 10}deg)`,
        }}
      >
        <div className="absolute inset-[3px] rounded-[3px] border border-yellow-200/20" />
      </div>
    ))}
  </div>
);

const PlayerTag = ({
  player,
  active,
  seat,
}: {
  player: Player;
  active: boolean;
  seat: Seat;
}) => (
  <div
    className={`absolute z-20 min-w-[106px] rounded-[16px] border px-2.5 py-1.5 backdrop-blur-md transition ${
      active
        ? 'border-yellow-200/30 bg-black/62 shadow-[0_0_26px_rgba(250,204,21,.22)]'
        : 'border-white/10 bg-black/34'
    } ${!player.alive ? 'opacity-40 grayscale' : ''} ${
      seat === 'top'
        ? 'left-1/2 top-[3px] -translate-x-1/2'
        : seat === 'left'
          ? 'left-[-2px] top-[86px]'
          : seat === 'right'
            ? 'right-[-2px] top-[86px]'
            : 'left-1/2 top-[98px] -translate-x-1/2'
    }`}
  >
    <div className="text-center text-[10px] font-black tracking-[0.16em] text-white">{player.name}</div>

    <div className="mt-1 flex items-center justify-between gap-2">
      <BackCards count={player.hand.length} />
      <DangerPips value={player.danger} />
    </div>
  </div>
);

const Avatar = ({
  kind,
  reaction,
  accent,
  active,
  eliminated,
}: {
  kind: Player['avatar'];
  reaction: Reaction;
  accent: string;
  active: boolean;
  eliminated: boolean;
}) => {
  const faceClass =
    reaction === 'shocked'
      ? 'animate-[royalShake_.32s_ease-in-out_3]'
      : reaction === 'celebrate'
        ? 'animate-[royalBounce_.8s_ease-in-out_infinite]'
        : reaction === 'angry'
          ? 'animate-[royalAngry_.6s_ease-in-out_infinite]'
          : active
            ? 'animate-[royalBreathe_2.4s_ease-in-out_infinite]'
            : '';

  return (
    <div className={`relative ${faceClass} ${eliminated ? 'grayscale opacity-35' : ''}`}>
      <div
        className="absolute inset-x-3 bottom-0 h-8 rounded-full blur-xl"
        style={{ background: accent }}
      />

      {kind === 'owl' && (
        <svg viewBox="0 0 190 160" className="relative h-[124px] w-[158px]">
          <defs>
            <radialGradient id="owlBody2" cx="35%" cy="20%">
              <stop offset="0%" stopColor="#ddd6fe" />
              <stop offset="100%" stopColor="#5b21b6" />
            </radialGradient>
          </defs>

          <ellipse cx="95" cy="140" rx="62" ry="14" fill="rgba(0,0,0,.24)" />
          <path d="M 46 126 C 39 88 50 46 95 34 C 140 46 151 88 144 126 C 132 147 58 147 46 126 Z" fill="url(#owlBody2)" />
          <path d="M 60 52 L 74 18 L 94 41 L 114 18 L 130 52" fill="#7c3aed" />

          <ellipse cx="75" cy="80" rx="25" ry="29" fill="#f8fafc" />
          <ellipse cx="115" cy="80" rx="25" ry="29" fill="#f8fafc" />
          <circle cx="75" cy="82" r="10" fill="#111827" />
          <circle cx="115" cy="82" r="10" fill="#111827" />
          <circle cx="72" cy="78" r="4" fill="#fff" />
          <circle cx="112" cy="78" r="4" fill="#fff" />

          <path d="M 95 90 L 86 104 L 104 104 Z" fill="#f59e0b" />
          <path d="M 68 126 Q 95 140 122 126" stroke="#ddd6fe" strokeWidth="5" fill="none" strokeLinecap="round" />

          <path d="M 77 42 L 95 18 L 113 42" fill="#facc15" />
          <circle cx="95" cy="18" r="5" fill="#38bdf8" />
          <path d="M 56 120 Q 40 105 50 88" stroke="#c4b5fd" strokeWidth="8" strokeLinecap="round" />
          <path d="M 134 120 Q 150 105 140 88" stroke="#c4b5fd" strokeWidth="8" strokeLinecap="round" />
        </svg>
      )}

      {kind === 'gecko' && (
        <svg viewBox="0 0 190 160" className="relative h-[124px] w-[158px]">
          <defs>
            <radialGradient id="geckoBody2" cx="35%" cy="20%">
              <stop offset="0%" stopColor="#bbf7d0" />
              <stop offset="100%" stopColor="#166534" />
            </radialGradient>
          </defs>

          <ellipse cx="95" cy="140" rx="62" ry="14" fill="rgba(0,0,0,.24)" />
          <path d="M 46 126 C 38 82 56 40 96 38 C 137 40 151 82 142 126 C 127 147 61 147 46 126 Z" fill="url(#geckoBody2)" />

          <circle cx="63" cy="64" r="24" fill="#dcfce7" />
          <circle cx="127" cy="64" r="24" fill="#dcfce7" />
          <circle cx="63" cy="64" r="11" fill="#0f172a" />
          <circle cx="127" cy="64" r="11" fill="#0f172a" />
          <circle cx="59" cy="60" r="4" fill="#fff" />
          <circle cx="123" cy="60" r="4" fill="#fff" />

          <path d="M 68 104 Q 96 121 122 104" stroke="#052e16" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M 95 84 L 95 102" stroke="#14532d" strokeWidth="4" strokeLinecap="round" />

          <path d="M 49 46 Q 59 20 77 35" stroke="#a3e635" strokeWidth="8" strokeLinecap="round" />
          <path d="M 141 46 Q 131 20 113 35" stroke="#a3e635" strokeWidth="8" strokeLinecap="round" />

          <circle cx="154" cy="40" r="13" fill="#c084fc" />
          <path d="M 59 126 Q 43 110 47 94" stroke="#86efac" strokeWidth="8" strokeLinecap="round" />
          <path d="M 131 126 Q 147 110 143 94" stroke="#86efac" strokeWidth="8" strokeLinecap="round" />
        </svg>
      )}

      {kind === 'shark' && (
        <svg viewBox="0 0 190 160" className="relative h-[124px] w-[158px]">
          <defs>
            <radialGradient id="sharkBody2" cx="35%" cy="20%">
              <stop offset="0%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#0369a1" />
            </radialGradient>
          </defs>

          <ellipse cx="95" cy="140" rx="62" ry="14" fill="rgba(0,0,0,.24)" />
          <path d="M 39 120 C 44 70 64 36 106 36 C 142 42 157 78 146 123 C 131 147 57 148 39 120 Z" fill="url(#sharkBody2)" />

          <path d="M 61 34 L 89 12 L 103 42" fill="#0f172a" />
          <path d="M 94 44 L 151 52 L 131 68" fill="#0f172a" opacity=".9" />

          <ellipse cx="85" cy="76" rx="15" ry="18" fill="#f8fafc" />
          <circle cx="87" cy="76" r="8" fill="#111827" />
          <circle cx="84" cy="72" r="3" fill="#fff" />

          <path d="M 63 100 Q 105 128 140 98" stroke="#0f172a" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 78 104 L 86 116 L 94 104 L 102 118 L 110 104" fill="#fff" />

          <path d="M 132 38 Q 148 20 161 34" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
          <path d="M 53 122 Q 40 108 44 94" stroke="#7dd3fc" strokeWidth="8" strokeLinecap="round" />
          <path d="M 137 123 Q 150 108 146 94" stroke="#7dd3fc" strokeWidth="8" strokeLinecap="round" />
        </svg>
      )}

      {kind === 'fox' && (
        <svg viewBox="0 0 190 160" className="relative h-[124px] w-[158px]">
          <defs>
            <radialGradient id="foxBody2" cx="35%" cy="20%">
              <stop offset="0%" stopColor="#fed7aa" />
              <stop offset="100%" stopColor="#c2410c" />
            </radialGradient>
          </defs>

          <ellipse cx="95" cy="140" rx="62" ry="14" fill="rgba(0,0,0,.24)" />
          <path d="M 43 124 C 40 76 58 38 95 34 C 132 38 150 76 147 124 C 134 148 56 148 43 124 Z" fill="url(#foxBody2)" />

          <path d="M 58 52 L 48 18 L 80 40" fill="#f97316" />
          <path d="M 132 52 L 142 18 L 110 40" fill="#f97316" />

          <ellipse cx="76" cy="80" rx="19" ry="21" fill="#fff7ed" />
          <ellipse cx="114" cy="80" rx="19" ry="21" fill="#fff7ed" />
          <circle cx="76" cy="80" r="8" fill="#111827" />
          <circle cx="114" cy="80" r="8" fill="#111827" />
          <circle cx="73" cy="76" r="3" fill="#fff" />
          <circle cx="111" cy="76" r="3" fill="#fff" />

          <path d="M 95 91 L 86 101 L 104 101 Z" fill="#111827" />
          <path d="M 71 108 Q 95 126 119 108" stroke="#7c2d12" strokeWidth="5" fill="none" strokeLinecap="round" />

          <path d="M 77 30 L 95 9 L 113 30" fill="#facc15" />
          <path d="M 61 126 Q 44 111 48 94" stroke="#fb923c" strokeWidth="8" strokeLinecap="round" />
          <path d="M 129 126 Q 146 111 142 94" stroke="#fb923c" strokeWidth="8" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
};

const RevolverCylinder = ({
  danger,
  spinning,
  hit,
}: {
  danger: number;
  spinning: boolean;
  hit: boolean;
}) => (
  <div
    className={`relative h-[88px] w-[88px] rounded-full border-[7px] border-stone-700 bg-[radial-gradient(circle,#1f2937_0%,#030712_70%)] shadow-[inset_0_4px_10px_rgba(255,255,255,.12),0_18px_32px_rgba(0,0,0,.65)] ${
      spinning ? 'animate-[royalSpin_.8s_cubic-bezier(.2,.8,.2,1)]' : ''
    } ${hit ? 'animate-[royalBang_.45s_ease-out]' : ''}`}
  >
    {Array.from({ length: 6 }).map((_, index) => {
      const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
      const x = 50 + Math.cos(angle) * 30;
      const y = 50 + Math.sin(angle) * 30;
      const spent = index < danger;

      return (
        <div
          key={index}
          className={`absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border ${
            spent
              ? 'border-stone-500 bg-stone-800'
              : index === danger
                ? 'border-yellow-300 bg-yellow-600 shadow-[0_0_18px_rgba(250,204,21,.65)]'
                : 'border-stone-500 bg-black'
          }`}
          style={{
            left: `${x}%`,
            top: `${y}%`,
          }}
        />
      );
    })}

    <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-500 bg-black" />
  </div>
);

export const RoyalBluffGame = () => {
  const navigate = useNavigate();

  const revealTimeoutRef = useRef<number | null>(null);
  const shotTimeoutRef = useRef<number | null>(null);
  const roundTimeoutRef = useRef<number | null>(null);

  const [players, setPlayers] = useState<Player[]>(() => createPlayersForRound());
  const [activeIndex, setActiveIndex] = useState(3);
  const [targetRank, setTargetRank] = useState<Rank>(() => randomItem(TARGET_RANKS));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('select');
  const [lastPlay, setLastPlay] = useState<LastPlay | null>(null);
  const [canSelectAfterBelief, setCanSelectAfterBelief] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [shotInfo, setShotInfo] = useState<ShotInfo | null>(null);
  const [round, setRound] = useState(1);
  const [message, setMessage] = useState('Выбери карты и сделай ход.');
  const [scenePulse, setScenePulse] = useState<'none' | 'play' | 'doubt' | 'click' | 'bang'>('none');

  const viewerIndex = activeIndex;
  const activePlayer = safePlayer(players, activeIndex);
  const alivePlayers = useMemo(() => players.filter((player) => player.alive), [players]);
  const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
  const lastPlayCards = lastPlay?.cards ?? [];

  const clearTimers = () => {
    if (revealTimeoutRef.current !== null) window.clearTimeout(revealTimeoutRef.current);
    if (shotTimeoutRef.current !== null) window.clearTimeout(shotTimeoutRef.current);
    if (roundTimeoutRef.current !== null) window.clearTimeout(roundTimeoutRef.current);
  };

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlTouch = document.documentElement.style.touchAction;
    const prevBodyTouch = document.body.style.touchAction;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.userSelect = 'none';

    const preventTouch = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    const preventContext = (event: Event) => event.preventDefault();

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    return () => {
      clearTimers();

      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.touchAction = prevHtmlTouch;
      document.body.style.touchAction = prevBodyTouch;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.userSelect = prevBodyUserSelect;

      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, []);

  const resetReactions = () => {
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        reaction: player.alive ? 'idle' : player.reaction,
      })),
    );
  };

  const setReaction = (playerIndex: number, reaction: Reaction) => {
    setPlayers((prev) =>
      prev.map((player, index) =>
        index === playerIndex
          ? {
              ...player,
              reaction,
            }
          : player,
      ),
    );
  };

  const startNewRound = (previousPlayers: Player[], preferredStart?: number) => {
    const nextPlayers = createPlayersForRound(previousPlayers);
    const nextTarget = randomItem(TARGET_RANKS);
    const startIndex =
      preferredStart !== undefined && nextPlayers[preferredStart]?.alive
        ? preferredStart
        : nextAliveIndex(nextPlayers, preferredStart ?? -1);

    setPlayers(nextPlayers);
    setActiveIndex(startIndex);
    setTargetRank(nextTarget);
    setSelectedIds([]);
    setPhase('select');
    setLastPlay(null);
    setCanSelectAfterBelief(true);
    setRevealed(false);
    setShotInfo(null);
    setScenePulse('none');
    setRound((prev) => prev + 1);
    setMessage('Выбери карты и сделай ход.');
  };

  const restart = () => {
    clearTimers();

    const freshPlayers = createPlayersForRound();
    const nextTarget = randomItem(TARGET_RANKS);

    setPlayers(freshPlayers);
    setActiveIndex(3);
    setTargetRank(nextTarget);
    setSelectedIds([]);
    setPhase('select');
    setLastPlay(null);
    setCanSelectAfterBelief(true);
    setRevealed(false);
    setShotInfo(null);
    setRound(1);
    setMessage('Выбери карты и сделай ход.');
    setScenePulse('none');
  };

  const toggleCard = (cardId: string) => {
    if (phase !== 'select' || !canSelectAfterBelief) return;

    setSelectedIds((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  };

  const submitPlay = () => {
    if (phase !== 'select' || !canSelectAfterBelief || selectedIds.length === 0) return;

    const playedCards = activePlayer.hand.filter((card) => selectedIds.includes(card.id));

    const nextPlayers = players.map((player, index) =>
      index === activeIndex
        ? {
            ...player,
            hand: player.hand.filter((card) => !selectedIds.includes(card.id)),
            reaction: 'smug' as Reaction,
          }
        : {
            ...player,
            reaction: player.alive ? 'idle' : player.reaction,
          },
    );

    const nextIndex = nextAliveIndex(nextPlayers, activeIndex);

    setPlayers(nextPlayers);
    setLastPlay({
      playerIndex: activeIndex,
      cards: playedCards,
    });
    setActiveIndex(nextIndex);
    setSelectedIds([]);
    setPhase('decision');
    setCanSelectAfterBelief(false);
    setRevealed(false);
    setScenePulse('play');
    setMessage(`${nextPlayers[nextIndex].name}: верить или сомневаться?`);

    window.setTimeout(() => setScenePulse('none'), 560);
  };

  const believe = () => {
    if (phase !== 'decision' || !lastPlay) return;

    const previousPlayer = players[lastPlay.playerIndex];

    if (previousPlayer.hand.length === 0) {
      setPhase('roundEnd');
      setMessage(`${previousPlayer.name} сбросил все карты.`);

      roundTimeoutRef.current = window.setTimeout(() => {
        startNewRound(players, activeIndex);
      }, 1050);

      return;
    }

    setPhase('select');
    setCanSelectAfterBelief(true);
    setScenePulse('click');
    setMessage('Выбери карты и сделай ход.');
    setReaction(activeIndex, 'thinking');

    window.setTimeout(() => {
      setScenePulse('none');
      setReaction(activeIndex, 'idle');
    }, 520);
  };

  const doubt = () => {
    if (phase !== 'decision' || !lastPlay) return;

    const liar = lastPlay.cards.some((card) => card.rank !== targetRank && card.rank !== 'JOKER');
    const punishedIndex = liar ? lastPlay.playerIndex : activeIndex;

    setPhase('reveal');
    setRevealed(true);
    setScenePulse('doubt');
    setMessage(liar ? 'Блеф пойман.' : 'Все карты честные.');

    setReaction(activeIndex, liar ? 'celebrate' : 'shocked');
    setReaction(lastPlay.playerIndex, liar ? 'shocked' : 'smug');

    revealTimeoutRef.current = window.setTimeout(() => {
      resolveShot(punishedIndex);
    }, 1350);
  };

  const resolveShot = (playerIndex: number) => {
    const player = players[playerIndex];
    const remainingChambers = Math.max(1, 6 - player.danger);
    const hit = Math.floor(Math.random() * remainingChambers) === 0;

    setPhase('shot');
    setShotInfo({
      playerIndex,
      hit,
    });
    setScenePulse(hit ? 'bang' : 'click');

    const nextPlayers = players.map((item, index) => {
      if (index !== playerIndex) return item;

      return {
        ...item,
        alive: hit ? false : item.alive,
        danger: hit ? item.danger : Math.min(5, item.danger + 1),
        reaction: hit ? 'shocked' : 'celebrate',
      };
    });

    setPlayers(nextPlayers);
    setMessage(hit ? 'BANG' : 'CLICK');

    shotTimeoutRef.current = window.setTimeout(() => {
      if (aliveCount(nextPlayers) <= 1) {
        setPhase('gameOver');
        setScenePulse('none');
        return;
      }

      resetReactions();
      startNewRound(nextPlayers, nextAliveIndex(nextPlayers, playerIndex - 1));
    }, hit ? 1700 : 1300);
  };

  const getTableAnimationClass = (playerIndex: number) => {
    const seat = relativeSeat(playerIndex, viewerIndex);

    if (seat === 'bottom') return 'animate-[cardFromBottom_.48s_cubic-bezier(.2,.9,.2,1)_both]';
    if (seat === 'top') return 'animate-[cardFromTop_.48s_cubic-bezier(.2,.9,.2,1)_both]';
    if (seat === 'left') return 'animate-[cardFromLeft_.48s_cubic-bezier(.2,.9,.2,1)_both]';
    return 'animate-[cardFromRight_.48s_cubic-bezier(.2,.9,.2,1)_both]';
  };

  const orderedPlayers = players.map((player, index) => ({
    player,
    index,
    seat: relativeSeat(index, viewerIndex),
  }));

  return (
    <>
      <style>{`
        @keyframes royalBreathe {
          0%,100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.02); }
        }

        @keyframes royalBounce {
          0%,100% { transform: translateY(0) rotate(0deg); }
          35% { transform: translateY(-8px) rotate(-2deg); }
          70% { transform: translateY(-4px) rotate(2deg); }
        }

        @keyframes royalShake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        @keyframes royalAngry {
          0%,100% { transform: rotate(0deg); }
          25% { transform: rotate(-2deg); }
          75% { transform: rotate(2deg); }
        }

        @keyframes royalSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(720deg); }
        }

        @keyframes royalBang {
          0% { transform: scale(1); filter: brightness(1); }
          35% { transform: scale(1.15); filter: brightness(2); }
          100% { transform: scale(1); filter: brightness(1); }
        }

        @keyframes scenePlay {
          0% { transform: scale(1); }
          45% { transform: scale(1.012); }
          100% { transform: scale(1); }
        }

        @keyframes sceneDoubt {
          0%,100% { transform: translateX(0); }
          18% { transform: translateX(-6px); }
          36% { transform: translateX(6px); }
          54% { transform: translateX(-4px); }
          72% { transform: translateX(4px); }
        }

        @keyframes sceneClick {
          0%,100% { filter: brightness(1); }
          50% { filter: brightness(1.16); }
        }

        @keyframes sceneBang {
          0% { filter: brightness(1); transform: scale(1); }
          18% { filter: brightness(2.5); transform: scale(1.025); }
          100% { filter: brightness(1); transform: scale(1); }
        }

        @keyframes cardFromBottom {
          0% { transform: translateY(120px) scale(.65) rotate(10deg); opacity: 0; }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes cardFromTop {
          0% { transform: translateY(-120px) scale(.65) rotate(-10deg); opacity: 0; }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes cardFromLeft {
          0% { transform: translateX(-140px) scale(.65) rotate(-16deg); opacity: 0; }
          100% { transform: translateX(0) scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes cardFromRight {
          0% { transform: translateX(140px) scale(.65) rotate(16deg); opacity: 0; }
          100% { transform: translateX(0) scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes flame {
          0%,100% { transform: scaleY(1); opacity: .86; }
          50% { transform: scaleY(1.18); opacity: 1; }
        }

        @keyframes lantern {
          0%,100% { opacity: .72; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        className="relative h-full w-full overflow-hidden touch-none select-none text-white"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <div
          className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,.16),transparent_22%),radial-gradient(circle_at_18%_18%,rgba(168,85,247,.22),transparent_25%),radial-gradient(circle_at_84%_22%,rgba(56,189,248,.14),transparent_23%),linear-gradient(180deg,#140d25_0%,#180f1c_48%,#0b0710_100%)] ${
            scenePulse === 'play'
              ? 'animate-[scenePlay_.55s_ease-out]'
              : scenePulse === 'doubt'
                ? 'animate-[sceneDoubt_.55s_ease-out]'
                : scenePulse === 'click'
                  ? 'animate-[sceneClick_.5s_ease-out]'
                  : scenePulse === 'bang'
                    ? 'animate-[sceneBang_.55s_ease-out]'
                    : ''
          }`}
        >
          <div className="absolute left-[3%] top-[9%] h-[26%] w-[18%] rounded-[32px] border border-orange-200/8 bg-[#24151d]/70 shadow-[inset_0_0_30px_rgba(0,0,0,.45)]" />
          <div className="absolute right-[3%] top-[9%] h-[26%] w-[18%] rounded-[32px] border border-orange-200/8 bg-[#24151d]/70 shadow-[inset_0_0_30px_rgba(0,0,0,.45)]" />

          <div className="absolute left-[5.8%] top-[13%] h-12 w-5 rounded-full bg-amber-200/80 shadow-[0_0_28px_rgba(251,191,36,.65)] animate-[lantern_1.8s_ease-in-out_infinite]" />
          <div className="absolute right-[5.8%] top-[13%] h-12 w-5 rounded-full bg-amber-200/80 shadow-[0_0_28px_rgba(251,191,36,.65)] animate-[lantern_1.8s_ease-in-out_infinite]" />

          <div className="absolute left-[25%] top-[7%] h-[18%] w-[50%] rounded-[36px] border border-yellow-100/6 bg-black/16 backdrop-blur-sm" />

          <div className="absolute left-[12%] top-[31%] h-[11%] w-[14%] rounded-[18px] border border-white/6 bg-[#251518]" />
          <div className="absolute left-[13.8%] top-[33%] h-[6%] w-[10%] rounded-[10px] bg-orange-500/35">
            <div className="absolute left-1/2 top-1/2 h-8 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-300/80 blur-[1px] animate-[flame_1.15s_ease-in-out_infinite]" />
          </div>

          <div className="absolute right-[11%] top-[32%] h-[14%] w-[16%] rounded-[20px] border border-white/6 bg-[#181221]/80">
            <div className="absolute left-3 top-3 h-12 w-3 rounded-full bg-cyan-300/25" />
            <div className="absolute left-9 top-4 h-11 w-3 rounded-full bg-fuchsia-300/25" />
            <div className="absolute left-[62px] top-2 h-14 w-3 rounded-full bg-emerald-300/25" />
          </div>

          <div className="absolute left-1/2 top-[5.3%] -translate-x-1/2 text-center">
            <div className="bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-600 bg-clip-text text-[31px] font-black leading-none text-transparent drop-shadow-[0_4px_0_rgba(0,0,0,.38)]">
              TwinGames
            </div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.32em] text-violet-200/80">
              Royal Bluff
            </div>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="absolute left-3 top-3 z-40 rounded-2xl border border-yellow-100/14 bg-black/28 px-3 py-2 text-sm font-black text-yellow-100 backdrop-blur-md active:scale-95"
          >
            ←
          </button>

          <button
            onClick={restart}
            className="absolute right-3 top-3 z-40 rounded-2xl border border-yellow-100/14 bg-black/28 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100 backdrop-blur-md active:scale-95"
          >
            Reset
          </button>

          <div className="absolute left-1/2 top-[12.7%] z-30 -translate-x-1/2 rounded-full border border-yellow-200/15 bg-black/38 px-4 py-2 shadow-[0_16px_30px_rgba(0,0,0,.3)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                Round {round}
              </div>
              <div className="h-4 w-px bg-white/12" />
              <div className="text-[13px] font-black text-yellow-100">{rankLong(targetRank)}</div>
            </div>
          </div>

          {orderedPlayers.map(({ player, index, seat }) => {
            const pos =
              seat === 'top'
                ? 'left-1/2 top-[20%] -translate-x-1/2'
                : seat === 'left'
                  ? 'left-[1%] top-[36%]'
                  : seat === 'right'
                    ? 'right-[1%] top-[36%]'
                    : 'left-1/2 bottom-[18.6%] -translate-x-1/2';

            return (
              <div key={player.id} className={`absolute z-20 ${pos}`}>
                <div className="relative">
                  <Avatar
                    kind={player.avatar}
                    reaction={player.reaction}
                    accent={player.accent}
                    active={activeIndex === index}
                    eliminated={!player.alive}
                  />
                  <PlayerTag player={player} active={activeIndex === index} seat={seat} />
                </div>
              </div>
            );
          })}

          <div className="absolute left-1/2 top-[29%] h-[43%] w-[92%] -translate-x-1/2 [perspective:950px]">
            <div className="relative h-full w-full [transform:rotateX(63deg)]">
              <div className="absolute inset-0 rounded-[50%] border-[10px] border-[#6c371d] bg-[radial-gradient(circle_at_50%_35%,#8a4c25_0%,#5b2d15_47%,#31160c_100%)] shadow-[inset_0_0_48px_rgba(255,210,125,.18),0_34px_34px_rgba(0,0,0,.62)]" />
              <div className="absolute inset-[5%] rounded-[50%] border border-yellow-100/10" />
              <div className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-200/12" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[80px] text-yellow-100/8">
                ♛
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-[43.6%] z-30 flex -translate-x-1/2 items-center justify-center gap-1.5">
            {lastPlayCards.length === 0 ? null : (
              lastPlayCards.map((card, index) => (
                <div
                  key={card.id}
                  className={lastPlay ? getTableAnimationClass(lastPlay.playerIndex) : ''}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <CardFace card={card} hidden={!revealed} compact disabled />
                </div>
              ))
            )}
          </div>

          <div className="absolute left-[7%] top-[56%] z-30 rotate-[-18deg]">
            <div className="relative h-[70px] w-[145px]">
              <div className="absolute left-4 top-8 h-5 w-24 rounded-full bg-[linear-gradient(180deg,#d1d5db,#111827)] shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" />
              <div className="absolute left-24 top-5 h-9 w-10 rounded-full border-[6px] border-stone-500 bg-black" />
              <div className="absolute left-[104px] top-11 h-10 w-7 rotate-[24deg] rounded-b-xl bg-[linear-gradient(180deg,#b45309,#2b1206)]" />
              <div className="absolute left-[74px] top-11 h-5 w-16 rounded-full bg-[linear-gradient(180deg,#6b7280,#111827)]" />
              <div className="absolute left-2 top-9 h-3 w-16 rounded-full bg-stone-300/70" />
            </div>
          </div>

          <div className="absolute right-[7%] top-[54.5%] z-30">
            <RevolverCylinder
              danger={shotInfo ? players[shotInfo.playerIndex].danger : activePlayer.danger}
              spinning={phase === 'shot'}
              hit={shotInfo?.hit ?? false}
            />
          </div>

          {(phase === 'decision' || phase === 'reveal' || phase === 'shot' || phase === 'roundEnd') && (
            <div className="absolute left-1/2 top-[52.2%] z-40 -translate-x-1/2 rounded-full border border-yellow-100/14 bg-black/48 px-4 py-2 text-center shadow-[0_16px_28px_rgba(0,0,0,.28)] backdrop-blur-xl">
              <div className="text-[11px] font-black text-white/92">{message}</div>
            </div>
          )}

          {phase === 'select' && (
            <div className="absolute bottom-[16.2%] left-1/2 z-40 flex max-w-[96%] -translate-x-1/2 justify-center gap-2">
              {activePlayer.hand.map((card, index) => (
                <div
                  key={card.id}
                  style={{
                    transform: `rotate(${(index - (activePlayer.hand.length - 1) / 2) * 4}deg)`,
                  }}
                >
                  <CardFace
                    card={card}
                    selected={selectedIds.includes(card.id)}
                    disabled={!canSelectAfterBelief}
                    onClick={() => toggleCard(card.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="absolute bottom-[8.7%] left-1/2 z-40 w-[92%] -translate-x-1/2">
            {phase === 'select' && (
              <button
                onClick={submitPlay}
                disabled={!canSelectAfterBelief || selectedIds.length === 0}
                className={`w-full rounded-[24px] border px-4 py-3 text-center transition active:scale-[0.98] ${
                  canSelectAfterBelief && selectedIds.length > 0
                    ? 'border-emerald-200/24 bg-gradient-to-b from-emerald-500 to-teal-700 shadow-[0_12px_28px_rgba(16,185,129,.28)]'
                    : 'border-white/8 bg-white/6 text-white/35'
                }`}
              >
                <div className="text-lg font-black">PLAY</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                  {selectedIds.length === 0 ? 'choose 1–3 cards' : `${selectedIds.length} selected`}
                </div>
              </button>
            )}

            {phase === 'decision' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={doubt}
                  className="rounded-[24px] border border-yellow-200/24 bg-gradient-to-b from-yellow-400 to-orange-600 px-4 py-3 text-center text-stone-950 shadow-[0_12px_28px_rgba(245,158,11,.28)] active:scale-[0.98]"
                >
                  <div className="text-lg font-black">DOUBT</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                    call bluff
                  </div>
                </button>

                <button
                  onClick={believe}
                  className="rounded-[24px] border border-rose-200/24 bg-gradient-to-b from-rose-500 to-red-800 px-4 py-3 text-center shadow-[0_12px_28px_rgba(244,63,94,.24)] active:scale-[0.98]"
                >
                  <div className="text-lg font-black">BELIEVE</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                    continue
                  </div>
                </button>
              </div>
            )}
          </div>

          {scenePulse === 'bang' && (
            <>
              <div className="pointer-events-none absolute inset-0 z-50 bg-white/70 animate-[flashOut_.45s_ease-out_forwards]" />
              <div className="pointer-events-none absolute left-[14%] top-[57%] z-50 h-24 w-24 rounded-full bg-orange-300/90 blur-xl" />
            </>
          )}

          {phase === 'gameOver' && winner && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/64 p-4 backdrop-blur-md">
              <div className="w-full max-w-[360px] overflow-hidden rounded-[34px] border border-yellow-100/18 bg-[#120b18]/96 text-center shadow-[0_30px_90px_rgba(0,0,0,.56)]">
                <div className="h-3 bg-gradient-to-r from-yellow-400 via-orange-500 to-fuchsia-500" />

                <div className="p-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/42">
                    Last player standing
                  </div>

                  <div className="mt-3 flex justify-center">
                    <Avatar
                      kind={winner.avatar}
                      reaction="celebrate"
                      accent={winner.accent}
                      active
                      eliminated={false}
                    />
                  </div>

                  <div className="mt-1 text-4xl font-black text-white">
                    {winner.name} WINS
                  </div>

                  <button
                    onClick={restart}
                    className="mt-7 w-full rounded-3xl bg-gradient-to-r from-yellow-400 via-orange-500 to-fuchsia-500 py-4 text-sm font-black uppercase tracking-[0.18em] text-stone-950 shadow-xl transition active:scale-[0.98]"
                  >
                    Play Again
                  </button>

                  <button
                    onClick={() => navigate(-1)}
                    className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/80 transition active:scale-[0.98]"
                  >
                    Назад
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RoyalBluffGame;