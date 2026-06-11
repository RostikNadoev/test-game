import { type CSSProperties, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  Crown,
  Flame,
  Gamepad2,
  RefreshCw,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { GAME_CATALOG } from '../data/games';

type Lobby = {
  id: string;
  gameCode: string;
  gameName: string;
  icon: string;
  players: number;
  maxPlayers: number;
  bet: number;
  status: 'waiting' | 'playing' | 'finished';
  timeLeft?: string;
};

type Stat = {
  icon: LucideIcon;
  value: string | number;
  label: string;
};

type CatalogGame = (typeof GAME_CATALOG)[number];

type GameWithMedia = CatalogGame & {
  coverUrl?: string;
  imageUrl?: string;
  image?: string;
  bannerUrl?: string;
  posterUrl?: string;
  status?: string;
};

type GameTheme = {
  glow: string;
  gradient: string;
  badge: string;
  border: string;
  text: string;
};

const games = GAME_CATALOG as GameWithMedia[];

const themes: GameTheme[] = [
  {
    glow: 'rgba(77,124,255,0.24)',
    gradient: 'from-blue-500/45 via-cyan-400/20 to-indigo-500/45',
    badge: 'bg-blue-500/15 text-blue-200 border-blue-300/20',
    border: 'border-blue-300/20',
    text: 'text-blue-200',
  },
  {
    glow: 'rgba(240,185,11,0.22)',
    gradient: 'from-yellow-400/45 via-orange-500/20 to-amber-600/40',
    badge: 'bg-yellow-400/15 text-yellow-200 border-yellow-300/20',
    border: 'border-yellow-300/20',
    text: 'text-yellow-200',
  },
  {
    glow: 'rgba(167,139,250,0.24)',
    gradient: 'from-purple-500/45 via-fuchsia-500/20 to-pink-500/35',
    badge: 'bg-purple-500/15 text-purple-100 border-purple-300/20',
    border: 'border-purple-300/20',
    text: 'text-purple-100',
  },
  {
    glow: 'rgba(0,212,170,0.22)',
    gradient: 'from-emerald-400/45 via-teal-400/20 to-cyan-500/35',
    badge: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/20',
    border: 'border-emerald-300/20',
    text: 'text-emerald-100',
  },
  {
    glow: 'rgba(255,71,87,0.22)',
    gradient: 'from-red-500/45 via-rose-500/20 to-orange-500/35',
    badge: 'bg-red-500/15 text-red-100 border-red-300/20',
    border: 'border-red-300/20',
    text: 'text-red-100',
  },
];

const getTheme = (code: string, index: number) => {
  const hash = code.split('').reduce((sum, char) => sum + char.charCodeAt(0), index);
  return themes[hash % themes.length];
};

const getGameImage = (game?: GameWithMedia) => {
  if (!game) return undefined;
  return game.coverUrl || game.imageUrl || game.image || game.bannerUrl || game.posterUrl;
};

const formatBet = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);

const GameArtwork = ({
  game,
  theme,
  compact = false,
}: {
  game: GameWithMedia;
  theme: GameTheme;
  compact?: boolean;
}) => {
  const image = getGameImage(game);

  return (
    <div
      className={[
        'relative overflow-hidden border bg-white/[0.03]',
        theme.border,
        compact ? 'h-20 rounded-[22px]' : 'aspect-[4/3] rounded-[26px]',
      ].join(' ')}
    >
      {image ? (
        <img
          src={image}
          alt={game.displayName}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.20),transparent_32%)]" />
          <div className="absolute -bottom-10 -right-8 text-[92px] leading-none opacity-20">
            {game.icon}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-5xl drop-shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
              {game.icon}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-[#08080d] via-[#08080d]/35 to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.12)_48%,transparent_72%)] opacity-20" />

      <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/30 px-2 py-1 backdrop-blur-md">
        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/75">
          {game.code}
        </span>
      </div>

      {!compact && game.status && (
        <div className={`absolute right-2 top-2 rounded-full border px-2 py-1 ${theme.badge}`}>
          <span className="text-[8px] font-black uppercase tracking-[0.14em]">
            {game.status}
          </span>
        </div>
      )}
    </div>
  );
};

export const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [lobbies] = useState<Lobby[]>([
    {
      id: '1',
      gameCode: 'DICE',
      gameName: 'Dice Duel',
      icon: '🎲',
      players: 2,
      maxPlayers: 2,
      bet: 100,
      status: 'playing',
      timeLeft: '2:34',
    },
    {
      id: '2',
      gameCode: 'CRASH',
      gameName: 'Crash Duel',
      icon: '📈',
      players: 1,
      maxPlayers: 2,
      bet: 250,
      status: 'waiting',
      timeLeft: '0:45',
    },
    {
      id: '3',
      gameCode: 'BLACKJACK',
      gameName: 'Blackjack',
      icon: '🃏',
      players: 2,
      maxPlayers: 2,
      bet: 500,
      status: 'playing',
      timeLeft: '1:12',
    },
    {
      id: '4',
      gameCode: 'RPS',
      gameName: 'RPS Duel',
      icon: '✊',
      players: 1,
      maxPlayers: 2,
      bet: 50,
      status: 'waiting',
      timeLeft: '0:30',
    },
    {
      id: '5',
      gameCode: 'RACE',
      gameName: 'Street Race',
      icon: '🏎️',
      players: 2,
      maxPlayers: 4,
      bet: 1000,
      status: 'playing',
      timeLeft: '3:45',
    },
  ]);

  const featuredGame = games[0];
  const featuredTheme = getTheme(featuredGame?.code ?? 'ARENA', 0);

  const stats: Stat[] = useMemo(
    () => [
      { icon: Gamepad2, value: games.length, label: 'Games' },
      { icon: Swords, value: '1v1', label: 'Duel' },
      { icon: Trophy, value: user?.stats?.rating ?? 1000, label: 'Rating' },
    ],
    [user?.stats?.rating],
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.setTimeout(() => setIsRefreshing(false), 900);
  };

  const openGame = (playPath: string) => {
    navigate(playPath);
  };

  return (
    <main className="app-scroll relative min-h-full overflow-y-auto px-4 pb-32 pt-3">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-56 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />

      <section className="animate-fade-in relative mb-5">
        <div
          className="card relative overflow-hidden rounded-[34px]"
          style={{ boxShadow: `0 26px 90px ${featuredTheme.glow}` }}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${featuredTheme.gradient} opacity-30`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_14%,rgba(255,255,255,0.16),transparent_30%)]" />

          <div className="relative h-[255px] overflow-hidden">
            {featuredGame && getGameImage(featuredGame) ? (
              <img
                src={getGameImage(featuredGame)}
                alt={featuredGame.displayName}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(77,124,255,0.22),rgba(167,139,250,0.12),rgba(0,212,170,0.16))]" />
                <div className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-[46px] font-black uppercase tracking-[-0.08em] text-white/[0.035]">
                  Battle Club
                </div>

                <div className="absolute right-5 top-10 animate-floaty rounded-[28px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md">
                  <div className="text-5xl">⚔️</div>
                </div>

                <div className="absolute bottom-16 left-5 animate-floaty-delayed rounded-[24px] border border-yellow-300/20 bg-yellow-400/10 px-3 py-2 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <Crown size={15} className="text-yellow-200" />
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">
                      PvP Arena
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-12 right-8 text-[118px] leading-none opacity-20 blur-[1px]">
                  🕹️
                </div>
              </>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/68 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          <div className="relative -mt-24 px-5 pb-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-yellow-300/20 bg-yellow-400/10 px-2.5 py-1">
                  <Sparkles size={11} className="text-yellow-200" />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-100">
                    Competitive Arena
                  </span>
                </div>

                <h1 className="text-[28px] font-black leading-none tracking-[-0.04em] text-white text-shadow-glow">
                  Battle Club
                </h1>

                <p className="mt-2 max-w-[260px] text-[11px] font-bold leading-relaxed text-slate-300">
                  Сочные PvP-арены, быстрые дуэли и карточки игр, готовые под большие арты.
                </p>
              </div>

              <div className="shrink-0 rounded-[26px] border border-white/10 bg-white/[0.06] p-2 backdrop-blur-md">
                <div className={`flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br ${featuredTheme.gradient}`}>
                  <span className="text-3xl">🔥</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const element = document.getElementById('games-grid');
                  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="btn-press flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-3 text-[12px] font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_34px_rgba(77,124,255,0.24)]"
              >
                <Gamepad2 size={16} />
                Play
              </button>

              <button
                type="button"
                onClick={() => navigate('/rating')}
                className="btn-press flex flex-1 items-center justify-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.06] px-4 py-3 text-[12px] font-black uppercase tracking-[0.12em] text-white/85"
              >
                <Trophy size={16} className="text-yellow-200" />
                Rating
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade-in relative mb-5 grid grid-cols-3 gap-2" style={{ animationDelay: '60ms' }}>
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className="card relative overflow-hidden rounded-[24px] p-3 text-center"
            style={{ animationDelay: `${100 + index * 55}ms` }}
          >
            <div className="absolute -right-5 -top-5 h-14 w-14 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="relative mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
              <stat.icon size={15} className="text-blue-200" />
            </div>

            <p className="relative text-lg font-black leading-none text-white">
              {stat.value}
            </p>

            <p className="relative mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              {stat.label}
            </p>
          </div>
        ))}
      </section>

      <section className="animate-fade-in relative mb-5" style={{ animationDelay: '140ms' }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-1 rounded-full bg-gradient-to-b from-emerald-300 to-cyan-400" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                  Live Now
                </span>
              </div>

              <h2 className="text-base font-black tracking-[-0.03em] text-white">
                Active Lobbies
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh lobbies"
            className="btn-press card flex h-10 w-10 items-center justify-center rounded-[18px]"
          >
            <RefreshCw
              size={16}
              className={`text-slate-300 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        <div className="lobby-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {lobbies.map((lobby, index) => {
            const game = games.find((item) => item.code === lobby.gameCode);
            const theme = getTheme(lobby.gameCode, index);
            const artworkGame =
              game ??
              ({
                code: lobby.gameCode,
                displayName: lobby.gameName,
                icon: lobby.icon,
                description: 'Live battle',
                playPath: '/',
              } as GameWithMedia);

            return (
              <button
                key={lobby.id}
                type="button"
                onClick={() => {
                  if (game) openGame(game.playPath);
                }}
                className="btn-press card animate-fade-in min-w-[174px] shrink-0 overflow-hidden rounded-[28px] p-2.5 text-left"
                style={
                  {
                    animationDelay: `${200 + index * 65}ms`,
                    boxShadow: `0 18px 50px ${theme.glow}`,
                  } as CSSProperties
                }
              >
                <GameArtwork game={artworkGame} theme={theme} compact />

                <div className="px-1 pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate text-[9px] font-black uppercase tracking-[0.18em] ${theme.text}`}>
                        {lobby.gameCode}
                      </p>
                      <h3 className="mt-0.5 truncate text-[13px] font-black text-white">
                        {lobby.gameName}
                      </h3>
                    </div>

                    <span
                      className={[
                        'shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em]',
                        lobby.status === 'playing'
                          ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                          : 'border-yellow-300/20 bg-yellow-400/10 text-yellow-200',
                      ].join(' ')}
                    >
                      {lobby.status === 'playing' ? 'Live' : 'Wait'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400">
                      <Users size={12} />
                      {lobby.players}/{lobby.maxPlayers}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400">
                      <Clock3 size={12} />
                      {lobby.timeLeft}
                    </div>

                    <div className="text-[10px] font-black text-yellow-200">
                      {formatBet(lobby.bet)} 💎
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section id="games-grid" className="animate-fade-in relative scroll-mt-4" style={{ animationDelay: '240ms' }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-1 rounded-full bg-gradient-to-b from-blue-300 to-purple-400" />
            <div>
              <div className="flex items-center gap-1.5">
                <Zap size={12} className="text-blue-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
                  All Games
                </span>
              </div>

              <h2 className="text-base font-black tracking-[-0.03em] text-white">
                Game Arenas
              </h2>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
              {games.length} modes
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {games.map((game, index) => {
            const theme = getTheme(game.code, index);

            return (
              <button
                key={game.code}
                type="button"
                onClick={() => openGame(game.playPath)}
                className="btn-press card group animate-fade-in overflow-hidden rounded-[30px] p-2.5 text-left"
                style={
                  {
                    animationDelay: `${300 + index * 42}ms`,
                    boxShadow: `0 18px 48px ${theme.glow}`,
                  } as CSSProperties
                }
              >
                <GameArtwork game={game} theme={theme} />

                <div className="px-1 pb-1 pt-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`mb-1 truncate text-[9px] font-black uppercase tracking-[0.18em] ${theme.text}`}>
                        {game.code}
                      </p>

                      <h3 className="line-clamp-2 min-h-[32px] text-[14px] font-black leading-none tracking-[-0.03em] text-white">
                        {game.displayName}
                      </h3>
                    </div>

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] transition-transform duration-200 group-active:translate-x-0.5">
                      <ArrowRight size={14} className="text-slate-300" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-[10px] font-bold leading-relaxed text-slate-500">
                      {game.description}
                    </p>

                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-orange-300/15 bg-orange-400/10 px-2 py-1">
                      <Flame size={10} className="text-orange-200" />
                      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-orange-100">
                        Hot
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};