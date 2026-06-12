import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { GAME_CATALOG } from '../data/games';
import heroBanner from '../assets/home/banner.webp';

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

type CatalogGame = (typeof GAME_CATALOG)[number];

type GameWithMedia = CatalogGame & {
  coverUrl?: string;
  imageUrl?: string;
  image?: string;
  bannerUrl?: string;
  posterUrl?: string;
};

type GameTone = 'blue' | 'orange' | 'violet' | 'green';

const games = GAME_CATALOG as GameWithMedia[];

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

const getGameTone = (index: number): GameTone => {
  const tones = ['blue', 'orange', 'violet', 'green'] as const;
  return tones[index % tones.length];
};

const GameImage = ({
  game,
  tone,
  size = 'normal',
}: {
  game: GameWithMedia;
  tone: GameTone;
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
          <img
            src={heroBanner}
            alt="TwinGames"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />

          <div className="absolute inset-0 hero-banner-overlay" />

          <div className="hero-stat-text hero-stat-left">
            <span className="hero-stat-value">{games.length}</span>
            <span className="hero-stat-label">Games</span>
          </div>

          <div className="hero-stat-text hero-stat-right">
            <span className="hero-stat-value">{user?.stats?.rating ?? 1000}</span>
            <span className="hero-stat-label">Rating</span>
          </div>
        </div>
      </section>

      <section className="animate-fade-in mb-5" style={{ animationDelay: '60ms' }}>
        <div className="section-heading">
          <div>
            <p className="section-kicker section-kicker-orange">
              Waiting Players
            </p>
            <h2 className="section-title">
              Active Lobbies
            </h2>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh lobbies"
            className="pressable refresh-button"
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

                  <div className="mini-button mini-button-join w-full">
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
        <div className="section-heading mb-2.5">
          <div>
            <p className="section-kicker section-kicker-blue">
              Collection
            </p>
            <h2 className="section-title">
              Game Arenas
            </h2>
          </div>

          <span className="games-count-text">
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

                <div className="game-card-body px-1 pb-1 pt-2.5">
                  <h3 className="text-safe mb-[5px] h-[34px] overflow-hidden text-[12px] font-bold leading-[1.35] text-white">
                    {game.displayName}
                  </h3>

                  <div className="mini-button mini-button-play w-full">
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