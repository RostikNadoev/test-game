import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
type Tone = 'mint' | 'rose' | 'gold';
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
  label: string;
  avatar: string;
  photoUrl?: string;
  tone: 'mint' | 'rose';
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

const getWinnerUserId = (state: BlackjackStateMessage | null) => {
  if (!state) return null;

  const raw =
    state.round_winner_user_id ??
    state.winner_user_id ??
    state.winner_id ??
    state.round_winner_id;

  if (raw === null || raw === undefined) return null;

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
};

const getPushWinner = (state: BlackjackStateMessage | null) => {
  if (!state) return false;

  return state.round_winner === 'push' || state.winner === 'push';
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
        'bj-avatar relative grid shrink-0 place-items-center overflow-hidden rounded-full border font-black uppercase',
        size === 'lg' ? 'h-[76px] w-[76px] text-3xl' : 'h-8 w-8 text-sm',
        winner && 'bj-avatar-winner',
      )}
      style={{
        borderColor: `${color}66`,
        color,
        background:
          `radial-gradient(circle at 35% 25%, rgba(255,255,255,.18), transparent 34%),` +
          `radial-gradient(circle at 50% 100%, ${color}2b, rgba(6,6,10,.98) 68%)`,
        boxShadow: winner
          ? `0 0 34px ${color}45, inset 0 0 18px rgba(255,255,255,.06)`
          : `0 0 16px ${color}22`,
      }}
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
};

const HeaderPlayer = ({
  profile,
  score,
  targetWins,
  align = 'left',
  active = false,
}: {
  profile: PlayerProfile;
  score: number;
  targetWins: number;
  align?: 'left' | 'right';
  active?: boolean;
}) => {
  const color = profile.tone === 'mint' ? MINT : ROSE;

  return (
    <div className={cx('flex min-w-0 flex-1 items-center gap-2', align === 'right' && 'justify-end')}>
      {align === 'left' && <AvatarBadge profile={profile} />}

      <div className={cx('min-w-0', align === 'right' && 'text-right')}>
        <div className="flex items-center gap-1.5">
          {align === 'right' && active && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            />
          )}

          <div className="truncate text-[11px] font-black leading-none text-white">
            {profile.nickname}
          </div>

          {align === 'left' && active && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            />
          )}
        </div>

        <div className={cx('mt-1 flex items-center gap-1', align === 'right' && 'justify-end')}>
          {Array.from({ length: Math.max(1, targetWins) }).map((_, index) => {
            const on = index < score;

            return (
              <span
                key={index}
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
        <span className="text-[22px] font-black tabular-nums" style={{ color }}>
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
  winnerTone = 'mint',
}: {
  card: PlayingCard;
  owner: Owner;
  index: number;
  count: number;
  hidden?: boolean;
  dimmed?: boolean;
  winner?: boolean;
  winnerTone?: 'mint' | 'rose';
}) => {
  const mid = (count - 1) / 2;
  const tilt = (index - mid) * (owner === 'player' ? 5 : 4);
  const lift = Math.abs(index - mid) * 5;
  const overlap = count > 5 ? -0.52 : count > 4 ? -0.46 : -0.35;

  return (
    <div
      className={cx(
        'bj-card-shell relative shrink-0',
        owner === 'player' ? 'bj-deal-player' : 'bj-deal-opponent',
        hidden && 'bj-hidden-shell',
        dimmed && 'bj-dimmed',
        winner && 'bj-winning-card',
        winner && (winnerTone === 'mint' ? 'bj-win-mint' : 'bj-win-rose'),
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
  <div className="bj-card-row flex min-h-[calc(var(--bj-card-h)+8px)] items-end justify-center">
    {children}
  </div>
);

const EmptyCards = ({ text }: { text: string }) => (
  <div className="flex h-[calc(var(--bj-card-h)+8px)] items-center justify-center text-[9px] font-black uppercase tracking-[0.18em] text-white/20">
    {text}
  </div>
);

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
  full,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: Tone;
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

const PlayerHandPanel = ({
  profile,
  cards,
  info,
  active,
  winner,
  hiddenCards = false,
  owner = 'player',
  emptyText = 'Нет карт',
}: {
  profile: PlayerProfile;
  cards: PlayingCard[];
  info: HandInfo;
  active: boolean;
  winner: boolean;
  hiddenCards?: boolean;
  owner?: Owner;
  emptyText?: string;
}) => {
  const color = profile.tone === 'mint' ? MINT : ROSE;

  return (
    <div
      className={cx(
        'bj-hand-panel min-w-0 rounded-[18px] border bg-black/25 p-2',
        active && 'bj-hand-active',
      )}
      style={{
        borderColor: active ? `${color}66` : 'rgba(255,255,255,.06)',
        boxShadow: active ? `0 0 18px ${color}20, inset 0 0 18px rgba(255,255,255,.035)` : undefined,
      }}
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <AvatarBadge profile={profile} />

          <div className="min-w-0">
            <div className="truncate text-[10px] font-black leading-none text-white">
              {profile.nickname}
            </div>
            <div className="mt-1 text-[7px] font-black uppercase tracking-[0.16em] text-white/30">
              {profile.label}
            </div>
          </div>
        </div>

        <div
          className="shrink-0 rounded-full border px-2 py-1 text-[12px] font-black leading-none tabular-nums"
          style={{
            color,
            borderColor: `${color}30`,
            background: `${color}12`,
          }}
        >
          {formatHand(info, hiddenCards)}
        </div>
      </div>

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
              winnerTone={profile.tone}
            />
          ))}
        </CardRow>
      ) : (
        <EmptyCards text={emptyText} />
      )}
    </div>
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
  }, [lobbyId, playersInfo, token]);

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
      label: string,
      tone: 'mint' | 'rose',
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
        label,
        avatar: getInitials(nickname),
        photoUrl,
        tone,
      };
    },
    [playersInfo],
  );

  const myProfile = useMemo(
    () => getProfile(myUserId, 'Ты', 'mint', user?.tg_user || 'Ты', myEntry),
    [getProfile, myEntry, myUserId, user?.tg_user],
  );

  const opponentProfile = useMemo(
    () => getProfile(opponentUserId, 'Соперник', 'rose', 'Opponent', opponentEntry),
    [getProfile, opponentEntry, opponentUserId],
  );

  const targetWins = Math.max(1, serverState?.target_wins || 5);
  const turnTotalMs = Math.max(1, (serverState?.turn_seconds || 10) * 1000);

  const phase = serverState?.phase || 'dealing';
  const activeUserId = serverState?.active_user_id || null;
  const isMyTurn = phase === 'player_turn' && activeUserId === myUserId;
  const isOpponentTurn = phase === 'player_turn' && activeUserId === opponentUserId;

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

  const winnerUserId = getWinnerUserId(serverState);
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

  const sendCommand = useCallback((type: 'state' | 'hit' | 'stand' | 'next_round' | 'restart_match') => {
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

  const nextRound = useCallback(() => {
    if (phase !== 'round_over') return;
    sendCommand('next_round');
  }, [sendCommand, phase]);

  const restartMatch = useCallback(() => {
    if (phase !== 'match_over') return;
    sendCommand('restart_match');
  }, [sendCommand, phase]);

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

      if (key === 'n') nextRound();
      if (key === 'r') restartMatch();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hit, isMyTurn, nextRound, restartMatch, stand]);

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
      ? isMyTurn
        ? 'Твой ход'
        : isOpponentTurn
          ? 'Ход соперника'
          : 'Ход игрока'
      : serverState?.message ||
        (connectionStatus === 'open'
          ? 'Ожидаем состояние'
          : connectionStatus === 'connecting'
            ? 'Подключение'
            : 'Нет соединения');

  const centerSubMessage = socketError
    ? socketError
    : phase === 'player_turn'
      ? isMyTurn
        ? 'Взять карту или вскрыться'
        : `${opponentProfile.nickname} выбирает действие`
      : phase === 'dealing'
        ? 'Раздача карт'
        : phase === 'settling'
          ? 'Вскрытие карт'
          : phase === 'round_over'
            ? 'Раунд завершен'
            : phase === 'match_over'
              ? 'Матч окончен'
              : `Socket: ${connectionStatus}`;

  const centerColor = socketError
    ? ROSE
    : isMyTurn
      ? MINT
      : isOpponentTurn
        ? ROSE
        : phase === 'round_over' || phase === 'match_over'
          ? GOLD
          : '#FFFFFF';

  const waitingPhase = phase === 'dealing' || phase === 'settling' || (phase === 'player_turn' && !isMyTurn);
  const waitingLabel =
    phase === 'player_turn' && !isMyTurn
      ? 'Ждем ход соперника'
      : phase === 'dealing'
        ? 'Раздача'
        : phase === 'settling'
          ? 'Вскрытие'
          : 'Ожидание';

  const winnerProfile = myScore >= opponentScore ? myProfile : opponentProfile;
  const winnerColor = winnerProfile.tone === 'mint' ? MINT : ROSE;
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
          --bj-card-w: clamp(64px, 16vw, 96px);
          --bj-card-h: calc(var(--bj-card-w) * 1.50);
          --bj-radius: clamp(12px, 1.5vw, 18px);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .bj-hand-panel {
          --bj-card-w: clamp(58px, 14.8vw, 88px);
          --bj-card-h: calc(var(--bj-card-w) * 1.50);
          --bj-radius: clamp(11px, 1.4vw, 16px);
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
            --bj-card-w: clamp(58px, 15vw, 82px);
          }

          .bj-hand-panel {
            --bj-card-w: clamp(54px, 14vw, 78px);
          }

          .bj-turn-timer {
            width: 62px;
            height: 62px;
          }
        }

        @media (max-height: 680px) {
          .bj-root {
            --bj-card-w: clamp(52px, 13.5vw, 74px);
          }

          .bj-hand-panel {
            --bj-card-w: clamp(50px, 13vw, 70px);
          }
        }

        @media (max-height: 560px) {
          .bj-root {
            --bj-card-w: clamp(46px, 12vw, 66px);
          }

          .bj-hand-panel {
            --bj-card-w: clamp(44px, 11.5vw, 62px);
          }

          .bj-status-msg {
            font-size: clamp(17px, 5vw, 26px) !important;
          }

          .bj-turn-timer {
            width: 56px;
            height: 56px;
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
            `radial-gradient(80% 50% at 50% 0%, ${GOLD}10, transparent 60%),` +
            `radial-gradient(85% 60% at 50% 100%, ${MINT}10, transparent 55%)`,
        }}
      />

      <div className="relative z-20 shrink-0 px-3 pt-2">
        <div className="mx-auto flex max-w-[500px] items-center justify-between gap-3 rounded-[20px] border border-white/[0.06] bg-white/[0.035] px-2.5 py-2">
          <HeaderPlayer
            profile={myProfile}
            score={myScore}
            targetWins={targetWins}
            align="left"
            active={isMyTurn}
          />

          <div className="flex shrink-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-1.5 leading-none">
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: connectionColor, boxShadow: `0 0 10px ${connectionColor}` }}
              />
              <span className="text-[7px] font-black uppercase tracking-[0.18em] text-white/35">
                {connectionStatus}
              </span>
            </div>

            <span className="mt-1 text-[8px] font-black uppercase tracking-[0.24em] text-white/35">
              Раунд
            </span>
            <span className="mt-0.5 text-sm font-black" style={{ color: GOLD }}>
              {serverState?.round || 1}
            </span>
          </div>

          <HeaderPlayer
            profile={opponentProfile}
            score={opponentScore}
            targetWins={targetWins}
            align="right"
            active={isOpponentTurn}
          />
        </div>
      </div>

      <div className="relative z-10 mx-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-white/[0.06]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              `radial-gradient(120% 80% at 50% 8%, ${ROSE}0a, transparent 46%),` +
              `radial-gradient(120% 90% at 50% 108%, #0b1a14e6, transparent 60%),` +
              `linear-gradient(180deg, #080810, #050507)`,
          }}
        />

        <div
          className="pointer-events-none absolute inset-[6px] rounded-[18px] border"
          style={{ borderColor: `${GOLD}14` }}
        />

        <div className="relative z-10 px-3 pt-3">
          <PlayerHandPanel
            profile={opponentProfile}
            cards={opponentTableCards}
            info={opponentTableInfo}
            active={isOpponentTurn}
            winner={roundWinner === 'opponent'}
            hiddenCards={shouldHideOpponentCards}
            owner="opponent"
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
                  ? 'mt-3 text-[clamp(18px,5.2vw,30px)]'
                  : 'text-[clamp(20px,6vw,34px)]',
              )}
              style={{ color: centerColor }}
            >
              {centerMessage}
            </div>

            <div className="mt-1.5 max-w-[280px] text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
              {centerSubMessage}
            </div>
          </div>
        </div>

        <div className="relative z-10 px-3 pb-3">
          <PlayerHandPanel
            profile={myProfile}
            cards={myCards}
            info={myInfo}
            active={isMyTurn}
            winner={roundWinner === 'player'}
            owner="player"
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
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">
                Матч окончен
              </div>

              <div className="mt-4">
                <AvatarBadge profile={winnerProfile} size="lg" winner />
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
                    {myProfile.nickname}
                  </div>
                  <div className="mt-1 text-3xl font-black" style={{ color: MINT }}>
                    {myScore}
                  </div>
                </div>

                <div
                  className="flex-1 rounded-2xl border py-3"
                  style={{ borderColor: `${ROSE}26`, background: `${ROSE}0d` }}
                >
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    {opponentProfile.nickname}
                  </div>
                  <div className="mt-1 text-3xl font-black" style={{ color: ROSE }}>
                    {opponentScore}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[11px] font-bold text-white/35">
                Ничьих: {pushScore}
              </div>

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