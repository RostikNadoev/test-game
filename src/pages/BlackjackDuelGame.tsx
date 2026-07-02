import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  blackjackWsApi,
  type BlackjackServerCard,
  type BlackjackServerHandInfo,
  type BlackjackServerPlayer,
  type BlackjackSocketClient,
  type BlackjackStateMessage,
} from '../api/blackjackWs';

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
import logoBackImg from '../assets/games/bj/logo-b.webp';

type Suit = '♠' | '♣';
type VisualSuit = 'spades' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type Owner = 'player' | 'opponent';
type Tone = 'mint' | 'gold';
type RoundWinner = 'player' | 'opponent' | 'push' | null;

type PlayingCard = {
  id: string;
  suit: Suit;
  rank: Rank;
  deck: number;
  hidden?: boolean;
};

type HandInfo = {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
};

type PlayerProfile = {
  id: number;
  nickname: string;
  avatar: string;
  photoUrl?: string;
};

type LobbyPlayerInfo = {
  id: number;
  tg_user?: string;
  photo_url?: string;
};

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
};

type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

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

const PRELOAD_IMAGES = [
  ...RANKS.map((rank) => CARD_IMAGES.spades[rank]),
  ...RANKS.map((rank) => CARD_IMAGES.clubs[rank]),
  logoBackImg,
];

const GOLD = '#F2C766';
const MINT = '#52FFE5';
const ROSE = '#FF6B8A';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const preloadImages = (sources: string[]) => {
  const loadedImages = sources.map((src) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = src;
    return image;
  });

  return () => {
    loadedImages.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
  };
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const getInitials = (name: string) => {
  const clean = name.replace('@', '').trim();

  const initials = clean
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || 'TG';
};

const rankValue = (rank: Rank) => {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
};

const getHandInfo = (cards: PlayingCard[]): HandInfo => {
  const visibleCards = cards.filter((card) => !card.hidden);

  let total = visibleCards.reduce((sum, card) => sum + rankValue(card.rank), 0);
  let aces = visibleCards.filter((card) => card.rank === 'A').length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  const soft = aces > 0 && total <= 21;

  return {
    total,
    soft,
    blackjack: visibleCards.length === 2 && total === 21,
    bust: total > 21,
  };
};

const formatHand = (info: HandInfo, hidden = false) => {
  if (hidden) return '?';
  if (info.blackjack) return 'BJ';
  if (!info.total) return '—';
  return String(info.total);
};

const normalizeRank = (value: unknown): Rank | null => {
  const normalized = String(value || '').trim().toUpperCase();

  if (RANKS.includes(normalized as Rank)) {
    return normalized as Rank;
  }

  return null;
};

const normalizeSuit = (value: unknown): Suit => {
  const normalized = String(value || '').trim().toLowerCase();

  if (
    normalized === '♣' ||
    normalized === 'club' ||
    normalized === 'clubs' ||
    normalized === 'c'
  ) {
    return '♣';
  }

  return '♠';
};

const normalizeCard = (raw: BlackjackServerCard, fallbackId: string): PlayingCard => {
  const rank = normalizeRank(raw.rank);
  const hidden = Boolean(raw.hidden) || !rank;

  return {
    id: typeof raw.id === 'string' ? raw.id : fallbackId,
    suit: normalizeSuit(raw.suit),
    rank: rank || 'A',
    deck: Number(raw.deck || 0),
    hidden,
  };
};

const normalizeCards = (cards: BlackjackServerCard[] | undefined, prefix: string) => {
  if (!Array.isArray(cards)) return [];

  return cards.map((card, index) => normalizeCard(card, `${prefix}-${index}`));
};

const createHiddenCard = (id: string): PlayingCard => ({
  id,
  suit: '♠',
  rank: 'A',
  deck: 0,
  hidden: true,
});

const normalizeHandInfo = (
  raw: BlackjackServerHandInfo | BlackjackServerPlayer | undefined,
  cards: PlayingCard[],
): HandInfo => {
  const fallback = getHandInfo(cards);

  if (!raw || !isObject(raw)) return fallback;

  const total = Number(raw.total);
  const blackjackRaw = raw.blackjack ?? raw.black_jack;

  return {
    total: Number.isFinite(total) && total > 0 ? total : fallback.total,
    soft: typeof raw.soft === 'boolean' ? raw.soft : fallback.soft,
    blackjack: typeof blackjackRaw === 'boolean' ? blackjackRaw : fallback.blackjack,
    bust: typeof raw.bust === 'boolean' ? raw.bust : fallback.bust,
  };
};

const getCardVisualSuit = (suit: Suit): VisualSuit => (suit === '♠' ? 'spades' : 'clubs');
const getCardImage = (card: PlayingCard) => CARD_IMAGES[getCardVisualSuit(card.suit)][card.rank];

const getPlayerCards = (entry: BlackjackServerPlayer | undefined, id: number) => {
  if (!entry) return [];

  const cards = entry.cards || entry.hand || entry.player_cards || [];

  return normalizeCards(cards, `player-${id}`);
};

const getPlayerInfo = (entry: BlackjackServerPlayer | undefined, cards: PlayingCard[]) => {
  if (!entry) return getHandInfo(cards);

  return normalizeHandInfo(entry.info || entry.hand_info || entry, cards);
};

const getRoundResult = (state: BlackjackStateMessage | null) => {
  if (!state?.round_result || !isObject(state.round_result)) return null;

  return state.round_result;
};

const getRoundWinnerUserId = (state: BlackjackStateMessage | null) => {
  if (!state) return null;

  const roundResult = getRoundResult(state);

  const raw =
    roundResult?.winner_user_id ??
    state.round_winner_user_id ??
    state.winner_user_id;

  if (raw === null || raw === undefined) return null;

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
};

const getPushWinner = (state: BlackjackStateMessage | null) => {
  if (!state) return false;

  const roundResult = getRoundResult(state);

  return (
    roundResult?.winner === 'push' ||
    roundResult?.result === 'push'
  );
};

const readStoredPlayersInfo = () => {
  if (typeof window === 'undefined') return [];

  const raw = window.sessionStorage.getItem('twingames_blackjack_players_info');

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isObject)
      .map((item) => ({
        id: Number(item.id),
        tg_user: typeof item.tg_user === 'string' ? item.tg_user : undefined,
        photo_url: typeof item.photo_url === 'string' ? item.photo_url : undefined,
      }))
      .filter((item) => Number.isFinite(item.id));
  } catch {
    return [];
  }
};

const AvatarBadge = ({
  profile,
  active = false,
  winner = false,
}: {
  profile: PlayerProfile;
  active?: boolean;
  winner?: boolean;
}) => (
  <div
    className={cx(
      'bj-avatar relative grid shrink-0 place-items-center overflow-hidden rounded-full border font-black uppercase',
      active && 'bj-avatar-active',
      winner && 'bj-avatar-winner',
    )}
  >
    {profile.photoUrl ? (
      <img
        src={profile.photoUrl}
        alt={profile.nickname}
        className="relative z-10 h-full w-full object-cover"
        draggable={false}
      />
    ) : (
      <span className="relative z-10">{profile.avatar}</span>
    )}
  </div>
);

const ScoreHeader = ({
  myProfile,
  opponentProfile,
  myScore,
  opponentScore,
  round,
  connectionStatus,
  connectionColor,
  targetWins,
  myActive,
  opponentActive,
}: {
  myProfile: PlayerProfile;
  opponentProfile: PlayerProfile;
  myScore: number;
  opponentScore: number;
  round: number;
  connectionStatus: ConnectionStatus;
  connectionColor: string;
  targetWins: number;
  myActive: boolean;
  opponentActive: boolean;
}) => (
  <div className="relative z-20 shrink-0 px-3 pt-2">
    <div className="bj-topbar mx-auto flex max-w-[500px] items-center justify-between gap-2">
      <div className="bj-top-player">
        <AvatarBadge profile={myProfile} active={myActive} />
        <div className="min-w-0">
          <div className="truncate text-[10px] font-black leading-none text-white">
            {myProfile.nickname}
          </div>
          <div className="mt-1 text-[7px] font-black uppercase tracking-[0.18em] text-white/35">
            You
          </div>
        </div>
      </div>

      <div className="bj-scorebox">
        <div className="bj-score-pill">
          <span className="bj-score-num bj-score-you">{myScore}</span>
          <span className="bj-score-sep">−</span>
          <span className="bj-score-num bj-score-enemy">{opponentScore}</span>
        </div>

        <div className="mt-1 flex items-center justify-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: connectionColor }}
          />
          <span className="text-[7px] font-black uppercase tracking-[0.16em] text-white/30">
            R{round} · {connectionStatus}
          </span>
        </div>

        <div className="mt-1 flex justify-center gap-1">
          {Array.from({ length: Math.max(1, targetWins) }).map((_, index) => (
            <span
              key={index}
              className={cx(
                'h-1 w-2.5 rounded-full',
                index < myScore
                  ? 'bg-[#52FFE5]/80'
                  : index < opponentScore
                    ? 'bg-[#FF6B8A]/80'
                    : 'bg-white/10',
              )}
            />
          ))}
        </div>
      </div>

      <div className="bj-top-player justify-end text-right">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-black leading-none text-white">
            {opponentProfile.nickname}
          </div>
          <div className="mt-1 text-[7px] font-black uppercase tracking-[0.18em] text-white/35">
            Enemy
          </div>
        </div>
        <AvatarBadge profile={opponentProfile} active={opponentActive} />
      </div>
    </div>
  </div>
);

const TurnTimer = ({
  msLeft,
  totalMs,
  active,
}: {
  msLeft: number;
  totalMs: number;
  active: boolean;
}) => {
  if (!active) return null;

  const progress = Math.max(0, Math.min(1, msLeft / Math.max(1, totalMs)));
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
        <span className="text-[24px] font-black tabular-nums" style={{ color }}>
          {seconds}
        </span>
        <span className="mt-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-white/35">
          сек
        </span>
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
      <img src={logoBackImg} alt="" className="bj-back-logo-img" draggable={false} />
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
  const tilt = (index - mid) * (owner === 'player' ? 4.4 : 3.8);
  const lift = Math.abs(index - mid) * 4;
  const overlap = count > 5 ? -0.56 : count > 4 ? -0.5 : -0.39;

  return (
    <div
      className={cx(
        'bj-card-shell relative shrink-0',
        owner === 'player' ? 'bj-deal-player' : 'bj-deal-opponent',
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
  <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+6px)] items-end justify-center">
    {children}
  </div>
);

const EmptyCards = ({ text }: { text: string }) => (
  <div className="flex h-[calc(var(--bj-card-h)+6px)] items-center justify-center text-[9px] font-black uppercase tracking-[0.18em] text-white/18">
    {text}
  </div>
);

const HandScoreBadge = ({
  value,
  hidden,
  tone,
  side,
}: {
  value: string;
  hidden: boolean;
  tone: 'mint' | 'rose';
  side: 'top' | 'bottom';
}) => {
  const color = tone === 'mint' ? MINT : ROSE;

  return (
    <div
      className={cx(
        'bj-hand-score pointer-events-none absolute z-30 grid place-items-center rounded-full border font-black tabular-nums',
        side === 'top' ? 'right-1 top-0' : 'bottom-0 left-1',
      )}
      style={{
        color: hidden ? 'rgba(255,255,255,.42)' : color,
        borderColor: `${color}45`,
        background: `radial-gradient(circle at 35% 20%, rgba(255,255,255,.16), transparent 44%), ${color}18`,
        boxShadow: `0 0 24px ${color}22, inset 0 0 16px rgba(0,0,0,.36)`,
      }}
    >
      {value}
    </div>
  );
};

const HandZone = ({
  cards,
  info,
  owner,
  active,
  winner,
  hiddenCards = false,
  emptyText,
}: {
  cards: PlayingCard[];
  info: HandInfo;
  owner: Owner;
  active: boolean;
  winner: boolean;
  hiddenCards?: boolean;
  emptyText: string;
}) => {
  const tone = owner === 'player' ? 'mint' : 'rose';

  return (
    <div
      className={cx(
        'bj-hand-zone relative mx-auto w-full max-w-[430px]',
        owner === 'opponent' ? 'pt-1' : 'pb-1',
        active && 'bj-hand-active',
      )}
    >
      <HandScoreBadge
        value={formatHand(info, hiddenCards)}
        hidden={hiddenCards}
        tone={tone}
        side={owner === 'opponent' ? 'top' : 'bottom'}
      />

      {cards.length > 0 ? (
        <CardRow>
          {cards.map((card, index) => (
            <PlayingCardView
              key={card.id}
              card={card}
              owner={owner}
              index={index}
              count={cards.length}
              hidden={hiddenCards || card.hidden}
              dimmed={Boolean(winner) && !winner}
              winner={winner}
            />
          ))}
        </CardRow>
      ) : (
        <EmptyCards text={emptyText} />
      )}
    </div>
  );
};

const ResultBurst = ({ seed, kind }: { seed: number; kind: RoundWinner }) => {
  if (!kind) return null;

  const color = kind === 'player' ? MINT : kind === 'opponent' ? ROSE : GOLD;

  return (
    <div key={seed} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div className="bj-ring" style={{ borderColor: color, ['--c' as string]: color }} />

      {Array.from({ length: 16 }).map((_, index) => {
        const angle = (index / 16) * Math.PI * 2 + seed * 0.2;
        const dist = 64 + ((index * 17 + seed * 5) % 64);

        return (
          <span
            key={index}
            className="bj-spark"
            style={{
              background: color,
              color,
              ['--dx' as string]: `${Math.cos(angle) * dist}px`,
              ['--dy' as string]: `${Math.sin(angle) * dist}px`,
              animationDelay: `${(index % 4) * 28}ms`,
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: Tone;
}) => {
  const color = tone === 'mint' ? MINT : GOLD;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative h-[50px] flex-1 rounded-[20px] border text-[12px] font-black uppercase tracking-[0.14em] transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
      style={{ borderColor: `${color}40`, background: `${color}1a`, color }}
    >
      {children}
    </button>
  );
};

const ConnectionNotice = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => (
  <div className="bj-root relative grid h-full min-h-[440px] w-full place-items-center overflow-hidden bg-[#050507] p-5 text-center text-white">
    <div className="relative w-full max-w-[340px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0a0a11] p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(60% 44% at 50% 0%, ${GOLD}20, transparent 70%),` +
            `radial-gradient(70% 70% at 50% 100%, ${MINT}10, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/35">
          Blackjack Duel
        </div>
        <div className="mt-3 text-2xl font-black uppercase leading-none tracking-[-0.05em] text-white">
          {title}
        </div>
        <div className="mt-2 text-[12px] font-bold leading-snug text-white/40">
          {subtitle}
        </div>
      </div>
    </div>
  </div>
);

export const BlackjackDuelGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const socketRef = useRef<BlackjackSocketClient | null>(null);
  const serverOffsetRef = useRef(0);
  const lastBurstKeyRef = useRef('');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<BlackjackStateMessage | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [burst, setBurst] = useState(0);

  const routeState = (location.state || {}) as LocationState;

  const gameId = useMemo(() => {
    if (routeState.game) return routeState.game;

    if (typeof window === 'undefined') return 'blackjack_duel';

    return window.sessionStorage.getItem('twingames_active_game') || 'blackjack_duel';
  }, [routeState.game]);

  const lobbiesPath = `/game/${gameId}/lobbies`;

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const fromQuery = query.get('lobby_id') || query.get('lobbyId');
    const fromState = routeState.lobbyId;

    if (fromState) return fromState;
    if (fromQuery) return fromQuery;

    if (typeof window === 'undefined') return '';

    return window.sessionStorage.getItem('twingames_blackjack_lobby_id') || '';
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(() => {
    if (routeState.playersInfo?.length) return routeState.playersInfo;

    return readStoredPlayersInfo();
  }, [routeState.playersInfo]);

  useEffect(() => preloadImages(PRELOAD_IMAGES), []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!lobbyId || !token) return;

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('twingames_blackjack_lobby_id', lobbyId);
      window.sessionStorage.setItem('twingames_active_game', gameId);

      if (playersInfo.length) {
        window.sessionStorage.setItem('twingames_blackjack_players_info', JSON.stringify(playersInfo));
      }
    }

    let alive = true;
    let client: BlackjackSocketClient | null = null;

    setConnectionStatus('connecting');
    setSocketError(null);

    client = blackjackWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (!alive) return;

          setConnectionStatus('open');
          client?.requestState();
        },
        onClose: () => {
          if (!alive) return;

          setConnectionStatus('closed');
        },
        onSocketError: () => {
          if (!alive) return;

          setConnectionStatus('error');
          setSocketError('Ошибка подключения к WebSocket');
        },
        onServerError: (error) => {
          if (!alive) return;

          setSocketError(error.details || error.error);
        },
        onState: (state) => {
          if (!alive) return;

          setServerState(state);
          setSocketError(null);

          if (state.server_ms) {
            serverOffsetRef.current = Date.now() - state.server_ms;
          }
        },
      },
    });

    socketRef.current = client;

    return () => {
      alive = false;
      socketRef.current = null;
      client?.close();
    };
  }, [gameId, lobbyId, playersInfo, token]);

  const orderedPlayerIds = useMemo(() => {
    const fromStateOrder = serverState?.player_order || [];

    if (fromStateOrder.length) {
      return fromStateOrder;
    }

    const fromServerPlayers = serverState?.players
      ? Object.keys(serverState.players).map(Number).filter(Number.isFinite)
      : [];

    if (fromServerPlayers.length) {
      return fromServerPlayers;
    }

    return playersInfo.map((player) => player.id).filter(Number.isFinite);
  }, [playersInfo, serverState]);

  const myUserId = user?.id || orderedPlayerIds[0] || 0;
  const opponentUserId = orderedPlayerIds.find((id) => id !== myUserId) || 0;

  const myEntry = myUserId ? serverState?.players?.[String(myUserId)] : undefined;
  const opponentEntry = opponentUserId ? serverState?.players?.[String(opponentUserId)] : undefined;

  const getProfile = useCallback(
    (
      id: number,
      fallbackName: string,
      entry?: BlackjackServerPlayer,
    ): PlayerProfile => {
      const fromLobby = playersInfo.find((player) => player.id === id);

      const nickname =
        entry?.tg_user ||
        entry?.username ||
        entry?.name ||
        fromLobby?.tg_user ||
        fallbackName;

      const photoUrl = entry?.photo_url || fromLobby?.photo_url || '';

      return {
        id,
        nickname,
        avatar: getInitials(nickname),
        photoUrl,
      };
    },
    [playersInfo],
  );

  const myProfile = useMemo(
    () => getProfile(myUserId, user?.tg_user || 'Ты', myEntry),
    [getProfile, myEntry, myUserId, user?.tg_user],
  );

  const opponentProfile = useMemo(
    () => getProfile(opponentUserId, 'Opponent', opponentEntry),
    [getProfile, opponentEntry, opponentUserId],
  );

  const targetWins = Math.max(1, serverState?.target_wins || 5);
  const turnTotalMs = Math.max(1, (serverState?.turn_seconds || 10) * 1000);

  const phase = serverState?.phase || 'dealing';
  const isPlayerTurnPhase = phase === 'player_turn';
  const isMyTurn = isPlayerTurnPhase;

  useEffect(() => {
    if (phase !== 'match_over') return;

    const timer = window.setTimeout(() => {
      navigate(lobbiesPath, { replace: true });
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [phase, navigate, lobbiesPath]);

  const myCards = useMemo(() => getPlayerCards(myEntry, myUserId), [myEntry, myUserId]);
  const opponentCards = useMemo(() => getPlayerCards(opponentEntry, opponentUserId), [opponentEntry, opponentUserId]);

  const myInfo = useMemo(() => getPlayerInfo(myEntry, myCards), [myCards, myEntry]);
  const opponentInfo = useMemo(() => getPlayerInfo(opponentEntry, opponentCards), [opponentCards, opponentEntry]);

  const shouldHideOpponentCards = phase === 'dealing' || phase === 'player_turn';

  const opponentTableCards = useMemo(() => {
    if (!serverState) return [];

    if (opponentCards.length === 0 && shouldHideOpponentCards) {
      return [
        createHiddenCard('opponent-hidden-1'),
        createHiddenCard('opponent-hidden-2'),
      ];
    }

    return opponentCards.map((card) => ({
      ...card,
      hidden: shouldHideOpponentCards || card.hidden,
    }));
  }, [opponentCards, serverState, shouldHideOpponentCards]);

  const opponentTableInfo = shouldHideOpponentCards ? getHandInfo([]) : opponentInfo;

  const myScore = serverState?.score?.players?.[String(myUserId)] || 0;
  const opponentScore = serverState?.score?.players?.[String(opponentUserId)] || 0;
  const pushScore = serverState?.score?.push || 0;

  const winnerUserId = getRoundWinnerUserId(serverState);
  const roundWinner: RoundWinner = getPushWinner(serverState)
    ? 'push'
    : winnerUserId === myUserId
      ? 'player'
      : winnerUserId === opponentUserId
        ? 'opponent'
        : null;

  const turnLeftMs = useMemo(() => {
    if (!serverState?.turn_deadline_ms || phase !== 'player_turn') {
      return turnTotalMs;
    }

    const clientDeadlineMs = serverState.turn_deadline_ms + serverOffsetRef.current;

    return Math.max(0, clientDeadlineMs - nowMs);
  }, [nowMs, phase, serverState, turnTotalMs]);

  useEffect(() => {
    if (!serverState) return;

    const key = `${serverState.phase}-${serverState.round}-${roundWinner || ''}-${serverState.message || ''}`;

    if (
      key !== lastBurstKeyRef.current &&
      roundWinner &&
      (serverState.phase === 'round_over' || serverState.phase === 'match_over')
    ) {
      lastBurstKeyRef.current = key;
      setBurst((value) => value + 1);
    }
  }, [roundWinner, serverState]);

  const sendCommand = useCallback((type: 'state' | 'hit' | 'stand') => {
    setSocketError(null);

    const sent = socketRef.current?.send({ type });

    if (!sent) {
      setSocketError('Нет подключения к игре');
    }
  }, []);

  const hit = useCallback(() => {
    if (!isMyTurn) return;
    sendCommand('hit');
  }, [isMyTurn, sendCommand]);

  const stand = useCallback(() => {
    if (!isMyTurn) return;
    sendCommand('stand');
  }, [isMyTurn, sendCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((key === 'h' || key === 'enter') && isMyTurn) {
        hit();
      }

      if ((key === 's' || key === ' ') && isMyTurn) {
        event.preventDefault();
        stand();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hit, isMyTurn, stand]);

  if (!lobbyId) {
    return (
      <ConnectionNotice
        title="Нет lobby id"
        subtitle="Открывай Blackjack через созданное лобби, чтобы игра подключилась к WebSocket."
      />
    );
  }

  if (!token) {
    return (
      <ConnectionNotice
        title="Нет токена"
        subtitle="Telegram авторизация еще не готова. Без JWT socket не подключится."
      />
    );
  }

  const connectionColor =
    connectionStatus === 'open' ? MINT : connectionStatus === 'error' ? ROSE : GOLD;

  const centerMessage = socketError
    ? 'Ошибка'
    : phase === 'player_turn'
      ? 'Выбирай'
      : serverState?.message ||
        (connectionStatus === 'open'
          ? 'Ожидаем состояние'
          : connectionStatus === 'connecting'
            ? 'Подключение'
            : 'Нет соединения');

  const centerSubMessage = socketError
    ? socketError
    : phase === 'player_turn'
      ? 'Оба игрока делают ход одновременно'
      : phase === 'dealing'
        ? 'Раздача карт'
        : phase === 'settling'
          ? 'Вскрытие карт'
          : phase === 'round_over'
            ? 'Следующая раздача...'
            : phase === 'match_over'
              ? 'Возвращаем в лобби...'
              : `Socket: ${connectionStatus}`;

  const centerColor = socketError
    ? ROSE
    : isMyTurn
      ? MINT
      : phase === 'round_over' || phase === 'match_over'
        ? GOLD
        : '#FFFFFF';

  const waitingPhase = phase === 'dealing' || phase === 'settling' || phase === 'round_over';

  const waitingLabel =
    phase === 'round_over'
      ? 'Следующий раунд...'
      : phase === 'dealing'
        ? 'Раздача'
        : phase === 'settling'
          ? 'Вскрытие'
          : 'Ожидание';

  const winnerProfile = myScore >= opponentScore ? myProfile : opponentProfile;
  const winnerColor = myScore >= opponentScore ? MINT : ROSE;
  const matchTitle =
    myScore > opponentScore
      ? 'Стол твой'
      : opponentScore > myScore
        ? 'Соперник победил'
        : 'Ничья';

  return (
    <div className="bj-root relative flex h-full min-h-[440px] w-full select-none flex-col overflow-hidden bg-[#050507] text-white">
      <style>{`
        .bj-root {
          --bj-card-w: clamp(78px, 21.4vw, 112px);
          --bj-card-h: calc(var(--bj-card-w) * 1.50);
          --bj-radius: clamp(13px, 1.6vw, 19px);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .bj-topbar {
          min-height: 58px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.055);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.055), transparent 54%),
            rgba(255,255,255,.035);
          padding: 7px 8px;
          box-shadow:
            0 12px 30px rgba(0,0,0,.20),
            inset 0 1px 0 rgba(255,255,255,.045);
        }

        .bj-top-player {
          min-width: 0;
          width: 35%;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .bj-scorebox {
          width: 30%;
          min-width: 94px;
          text-align: center;
          line-height: 1;
        }

        .bj-score-pill {
          min-width: 78px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.08);
          background:
            linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025)),
            rgba(0,0,0,.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
        }

        .bj-score-num {
          min-width: 18px;
          font-size: clamp(18px, 5vw, 23px);
          font-weight: 950;
          line-height: 1;
          letter-spacing: -.045em;
          text-shadow: none;
        }

        .bj-score-you {
          color: rgba(82,255,229,.92);
        }

        .bj-score-enemy {
          color: rgba(255,107,138,.92);
        }

        .bj-score-sep {
          transform: translateY(-1px);
          color: rgba(255,255,255,.34);
          font-size: 15px;
          font-weight: 900;
          line-height: 1;
        }

        .bj-avatar {
          width: 34px;
          height: 34px;
          color: white;
          background:
            radial-gradient(circle at 35% 25%, rgba(255,255,255,.16), transparent 34%),
            radial-gradient(circle at 50% 100%, rgba(242,199,102,.16), rgba(6,6,10,.98) 68%);
          border-color: rgba(255,255,255,.12);
          box-shadow: 0 6px 13px rgba(0,0,0,.28);
        }

        .bj-avatar-active {
          border-color: rgba(82,255,229,.48);
          box-shadow: 0 0 0 1px rgba(82,255,229,.12), 0 8px 16px rgba(0,0,0,.30);
        }

        .bj-avatar::after {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,.08);
          opacity: .75;
        }

        .bj-avatar-winner {
          animation: bjWinnerAvatar 1400ms ease-in-out infinite;
        }

        .bj-table {
          border-radius: 28px;
          background:
            radial-gradient(80% 42% at 50% 0%, rgba(255,107,138,.08), transparent 60%),
            radial-gradient(90% 50% at 50% 100%, rgba(82,255,229,.09), transparent 62%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.035), transparent 42%),
            linear-gradient(180deg, #080810, #050507);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.045),
            inset 0 0 45px rgba(0,0,0,.44),
            0 18px 50px rgba(0,0,0,.25);
        }

        .bj-table::before {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: 22px;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent, rgba(255,255,255,.035), transparent),
            radial-gradient(circle at 50% 50%, transparent 0 58%, rgba(242,199,102,.06) 100%);
          opacity: .7;
        }

        .bj-card-shell {
          width: var(--bj-card-w);
          height: var(--bj-card-h);
          perspective: 1000px;
          transform: translate3d(0, var(--lift), 0) rotate(var(--tilt));
          filter: drop-shadow(0 14px 16px rgba(0,0,0,0.42));
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
          padding: 19%;
        }

        .bj-back-logo-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          user-select: none;
          pointer-events: none;
          transform: translateZ(0);
          filter:
            drop-shadow(0 0 8px rgba(82,255,229,.30))
            drop-shadow(0 0 13px rgba(242,199,102,.24))
            drop-shadow(0 9px 10px rgba(0,0,0,.52));
        }

        .bj-hand-score {
          width: 54px;
          height: 54px;
          font-size: 24px;
          line-height: 1;
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

        @keyframes bjBackGlow {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes bjTimerPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.045);
          }
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

        @keyframes bjDealOpponent {
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

        .bj-deal-opponent {
          animation: bjDealOpponent 500ms cubic-bezier(.2,.8,.2,1) both;
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

        .bj-hand-active {
          animation: bjHandPulse 1.4s ease-in-out infinite;
        }

        @keyframes bjHandPulse {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }

        @media (max-width: 460px) {
          .bj-root {
            --bj-card-w: clamp(74px, 21.8vw, 96px);
          }

          .bj-topbar {
            min-height: 54px;
            border-radius: 22px;
            padding: 6px 7px;
          }

          .bj-top-player {
            width: 35%;
            gap: 6px;
          }

          .bj-avatar {
            width: 31px;
            height: 31px;
            font-size: 12px;
          }

          .bj-scorebox {
            width: 30%;
            min-width: 86px;
          }

          .bj-score-pill {
            min-width: 70px;
            height: 30px;
            gap: 5px;
          }

          .bj-score-num {
            min-width: 16px;
            font-size: clamp(17px, 4.8vw, 21px);
          }

          .bj-score-sep {
            font-size: 14px;
          }

          .bj-hand-score {
            width: 50px;
            height: 50px;
            font-size: 22px;
          }

          .bj-turn-timer {
            width: 62px;
            height: 62px;
          }
        }

        @media (max-width: 385px) {
          .bj-root {
            --bj-card-w: clamp(68px, 20.6vw, 88px);
          }

          .bj-top-player {
            width: 34%;
          }

          .bj-scorebox {
            width: 32%;
            min-width: 78px;
          }

          .bj-score-pill {
            min-width: 64px;
            height: 28px;
          }

          .bj-score-num {
            min-width: 14px;
            font-size: 18px;
          }

          .bj-hand-score {
            width: 46px;
            height: 46px;
            font-size: 20px;
          }
        }

        @media (max-height: 680px) {
          .bj-root {
            --bj-card-w: clamp(64px, 18.2vw, 86px);
          }

          .bj-status-msg {
            font-size: clamp(18px, 5vw, 27px) !important;
          }
        }

        @media (max-height: 560px) {
          .bj-root {
            --bj-card-w: clamp(56px, 16.5vw, 74px);
          }

          .bj-topbar {
            min-height: 50px;
          }

          .bj-status-msg {
            font-size: clamp(16px, 4.6vw, 24px) !important;
          }

          .bj-turn-timer {
            width: 54px;
            height: 54px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bj-deal-player,
          .bj-deal-opponent,
          .bj-winning-card,
          .bj-status-in,
          .bj-ring,
          .bj-spark,
          .bj-turn-danger,
          .bj-avatar-winner,
          .bj-back-glow,
          .bj-hand-active {
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
            `radial-gradient(80% 50% at 50% 0%, ${GOLD}0e, transparent 60%),` +
            `radial-gradient(85% 60% at 50% 100%, ${MINT}0d, transparent 55%)`,
        }}
      />

      <ScoreHeader
        myProfile={myProfile}
        opponentProfile={opponentProfile}
        myScore={myScore}
        opponentScore={opponentScore}
        round={serverState?.round || 1}
        connectionStatus={connectionStatus}
        connectionColor={connectionColor}
        targetWins={targetWins}
        myActive={isMyTurn}
        opponentActive={isPlayerTurnPhase}
      />

      <div className="bj-table relative z-10 mx-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative z-10 px-4 pt-3">
          <HandZone
            cards={opponentTableCards}
            info={opponentTableInfo}
            owner="opponent"
            active={isPlayerTurnPhase}
            winner={roundWinner === 'opponent'}
            hiddenCards={shouldHideOpponentCards}
            emptyText="Карты соперника"
          />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <div key={`${centerMessage}-${burst}`} className="bj-status-in flex flex-col items-center">
            <TurnTimer
              msLeft={turnLeftMs}
              totalMs={turnTotalMs}
              active={phase === 'player_turn'}
            />

            <div
              className={cx(
                'bj-status-msg font-black uppercase leading-none tracking-[-0.04em]',
                phase === 'player_turn'
                  ? 'mt-3 text-[clamp(20px,5.8vw,32px)]'
                  : 'text-[clamp(22px,6.4vw,36px)]',
              )}
              style={{ color: centerColor }}
            >
              {centerMessage}
            </div>

            <div className="mt-1.5 max-w-[290px] text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
              {centerSubMessage}
            </div>
          </div>
        </div>

        <div className="relative z-10 px-4 pb-3">
          <HandZone
            cards={myCards}
            info={myInfo}
            owner="player"
            active={isMyTurn}
            winner={roundWinner === 'player'}
            emptyText="Ждем раздачу"
          />
        </div>

        <ResultBurst seed={burst} kind={roundWinner} />
      </div>

      <div className="relative z-20 shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-[440px] items-center justify-center">
          {phase === 'player_turn' && isMyTurn && (
            <div className="flex w-full items-center gap-2">
              <CtrlButton onClick={hit} disabled={!isMyTurn} tone="mint">
                Взять
              </CtrlButton>

              <CtrlButton onClick={stand} disabled={!isMyTurn} tone="gold">
                Вскрыть
              </CtrlButton>
            </div>
          )}

          {waitingPhase && (
            <div className="flex h-[50px] items-center text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
              {waitingLabel}
            </div>
          )}

          {phase === 'match_over' && <div className="h-[50px]" />}
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
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">
                Матч окончен
              </div>

              <div className="mt-4">
                <AvatarBadge profile={winnerProfile} winner />
              </div>

              <div className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-white/35">
                Победитель
              </div>

              <div
                className="mt-1 max-w-full truncate text-3xl font-black uppercase leading-none tracking-[-0.05em]"
                style={{ color: winnerColor }}
              >
                {winnerProfile.nickname}
              </div>

              <div className="mt-2 text-sm font-bold text-white/45">
                {matchTitle}
              </div>

              <div className="mt-5 flex w-full items-stretch gap-3">
                <div
                  className="flex-1 rounded-2xl border py-3"
                  style={{ borderColor: `${MINT}26`, background: `${MINT}0d` }}
                >
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Ты
                  </div>
                  <div className="mt-1 text-4xl font-black" style={{ color: MINT }}>
                    {myScore}
                  </div>
                </div>

                <div
                  className="flex-1 rounded-2xl border py-3"
                  style={{ borderColor: `${ROSE}26`, background: `${ROSE}0d` }}
                >
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Соперник
                  </div>
                  <div className="mt-1 text-4xl font-black" style={{ color: ROSE }}>
                    {opponentScore}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[11px] font-bold text-white/35">
                Ничьих: {pushScore}
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                Возвращаем в лобби...
              </div>
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