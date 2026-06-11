import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  RefreshCw,
  Swords,
  Trophy,
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
};

const games = GAME_CATALOG as GameWithMedia[];

// Потом просто поставишь путь к баннеру:
// const HERO_IMAGE_URL = '/images/banners/main.webp';
const HERO_IMAGE_URL = '';

const getGameImage = (game?: GameWithMedia) => {
  if (!game) return undefined;

  return (
    game.coverUrl ||
    game.imageUrl ||
    game.image ||
    game.bannerUrl ||
    game.posterUrl
  );
};

const getGameTone = (index: number) => {
  const tones = ['blue', 'orange', 'violet', 'green'] as const;
  return tones[index % tones.length];
};

const GameImage = ({
  game,
  tone,
  size = 'normal',
}: {
  game: GameWithMedia;
  tone: 'blue' | 'orange' | 'violet' | 'green';
  size?: 'normal' | 'lobby';
}) => {
  const image = getGameImage(game);

  return (
    <div
      className={[
        'game-image',
        `game-image-${tone}`,
        size === 'lobby' ? 'h-[92px] rounded-[19px]' : 'aspect-[4/3] rounded-[20px]',
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
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={size === 'lobby' ? 'text-[38px]' : 'text-[46px]'}>
            {game.icon}
          </span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-white/[0.04]" />
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

  const joinableLobbies = useMemo(
    () => lobbies.filter((lobby) => lobby.players === 1),
    [lobbies],
  );

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
    window.setTimeout(() => setIsRefreshing(false), 700);
  };

  const openGame = (playPath: string) => {
    navigate(playPath);
  };

  return (
    <main className="app-scroll home-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-4">
      <section className="animate-fade-in mb-4">
        <div className="hero-banner rounded-[26px]">
          {HERO_IMAGE_URL ? (
            <img
              src={HERO_IMAGE_URL}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 hero-banner-placeholder">
              <span className="text-[54px] opacity-85">♠️</span>
            </div>
          )}

          <div className="absolute inset-0 hero-banner-overlay" />

          <div className="relative z-10 flex min-h-[190px] flex-col justify-end p-4">
            <div className="mb-4">
              <p className="text-safe mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">
                Battle Club
              </p>

              <h1 className="text-safe text-[23px] font-bold leading-[1.2] tracking-[-0.03em] text-white">
                Play clean.
                <br />
                Win fast.
              </h1>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-card stat-card-on-banner">
                  <stat.icon size={14} className="mb-1.5 text-white/75" />
                  <p className="text-safe text-[14px] font-bold text-white">
                    {stat.value}
                  </p>
                  <p className="text-safe text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/45">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade-in mb-5" style={{ animationDelay: '60ms' }}>
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <p className="text-safe text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Waiting players
            </p>
            <h2 className="text-safe text-[15px] font-bold text-white">
              Active Lobbies
            </h2>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh lobbies"
            className="pressable flex h-9 w-9 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035]"
          >
            <RefreshCw
              size={15}
              className={`text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        <div className="lobby-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
          {joinableLobbies.map((lobby, index) => {
            const game = games.find((item) => item.code === lobby.gameCode);
            const tone = getGameTone(index);

            const fallbackGame = {
              code: lobby.gameCode,
              displayName: lobby.gameName,
              description: '',
              icon: lobby.icon,
              playPath: '/',
            } as GameWithMedia;

            const targetGame = game ?? fallbackGame;

            return (
              <button
                key={lobby.id}
                type="button"
                onClick={() => {
                  if (game) openGame(game.playPath);
                }}
                className="pressable app-panel lobby-card min-w-[166px] shrink-0 rounded-[23px] p-2 text-left"
              >
                <GameImage game={targetGame} tone={tone} size="lobby" />

                <div className="px-1 pt-2.5">
                  <h3 className="text-safe mb-2 truncate text-[12px] font-bold text-white">
                    {lobby.gameName}
                  </h3>

                  <div className="mini-button w-full">
                    Join
                  </div>
                </div>
              </button>
            );
          })}

          {joinableLobbies.length === 0 && (
            <div className="app-panel min-w-[220px] rounded-[23px] p-4">
              <p className="text-safe text-[12px] font-bold text-white">
                No open lobbies
              </p>
              <p className="text-safe mt-1 text-[9.5px] font-bold text-slate-500">
                Waiting rooms will appear here.
              </p>
            </div>
          )}
        </div>
      </section>

      <section
        id="games-grid"
        className="animate-fade-in scroll-mt-4"
        style={{ animationDelay: '120ms' }}
      >
        <div className="mb-2.5 flex items-end justify-between">
          <div>
            <p className="text-safe text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Games
            </p>
            <h2 className="text-safe text-[15px] font-bold text-white">
              Game Arenas
            </h2>
          </div>

          <span className="text-safe text-[9px] font-bold text-slate-500">
            {games.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {games.map((game, index) => {
            const tone = getGameTone(index);

            return (
              <button
                key={game.code}
                type="button"
                onClick={() => openGame(game.playPath)}
                className="pressable app-panel game-card overflow-hidden rounded-[24px] p-2 text-left"
              >
                <GameImage game={game} tone={tone} />

                <div className="px-1 pb-1 pt-2.5">
                  <h3 className="text-safe mb-2 h-[34px] overflow-hidden text-[12px] font-bold leading-[1.35] text-white">
                    {game.displayName}
                  </h3>

                  <div className="mini-button w-full">
                    Play
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