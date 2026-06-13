import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, UsersRound } from 'lucide-react';
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

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);

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

const GameCoinIcon = ({ className = '' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 36 36"
      className={`game-coin-icon ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="homeCoinGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13 10) rotate(48) scale(24)">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.34" stopColor="#FFE9A8" />
          <stop offset="0.72" stopColor="#F3A640" />
          <stop offset="1" stopColor="#8F4A12" />
        </radialGradient>

        <linearGradient id="homeCoinEdge" x1="8" y1="5" x2="29" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF7D7" />
          <stop offset="0.42" stopColor="#F7B650" />
          <stop offset="1" stopColor="#7C3D0D" />
        </linearGradient>

        <linearGradient id="homeCoinStar" x1="11" y1="9" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.46" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F28B25" />
        </linearGradient>

        <filter id="homeCoinShadow" x="1" y="1" width="34" height="34" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.42" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#F7B650" floodOpacity="0.22" />
        </filter>
      </defs>

      <g filter="url(#homeCoinShadow)">
        <circle cx="18" cy="18" r="14" fill="url(#homeCoinEdge)" />
        <circle cx="18" cy="18" r="11.2" fill="url(#homeCoinGlow)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />

        <path
          d="M18 9.2L20.35 14.22L25.82 14.88L21.76 18.62L22.84 24.08L18 21.38L13.16 24.08L14.24 18.62L10.18 14.88L15.65 14.22L18 9.2Z"
          fill="url(#homeCoinStar)"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />

        <path
          d="M10.9 12.2C12.4 9.95 14.92 8.48 17.8 8.48"
          stroke="white"
          strokeOpacity="0.58"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        <path
          d="M25.1 22.9C23.55 25.1 21.02 26.52 18.18 26.52"
          stroke="#74370C"
          strokeOpacity="0.34"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
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
        size === 'lobby' ? 'h-[92px] rounded-[20px]' : 'aspect-[4/3] rounded-[21px]',
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

      <div className="game-image-glass" />
    </div>
  );
};

const LobbyLoadingState = () => {
  return (
    <div className="lobby-loading-wrap">
      <div className="lobby-loading-card">
        <div className="lobby-loading-orb">
          <Loader2 size={22} className="animate-spin text-white" />
        </div>

        <div>
          <p className="text-safe text-[12px] font-bold text-white">
            Refreshing
          </p>
          <p className="text-safe mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Updating lobbies
          </p>
        </div>
      </div>
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
    if (isRefreshing) return;

    setIsRefreshing(true);
    window.setTimeout(() => setIsRefreshing(false), 1900);
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
            disabled={isRefreshing}
            aria-label="Refresh lobbies"
            className={`pressable refresh-button ${isRefreshing ? 'is-loading' : ''}`}
          >
            {isRefreshing ? (
              <Loader2 size={14} className="refresh-button-icon animate-spin" />
            ) : (
              <RefreshCw size={14} className="refresh-button-icon" />
            )}

            <span className="refresh-button-label">
              Refresh
            </span>
          </button>
        </div>

        {isRefreshing ? (
          <LobbyLoadingState />
        ) : (
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
                  className="pressable app-panel lobby-card min-w-[178px] shrink-0 rounded-[24px] p-2 text-left"
                >
                  <GameImage game={targetGame} tone={tone} size="lobby" />

                  <div className="px-1 pt-2.5">
                    <div className="lobby-title-row">
                      <h3 className="text-safe truncate text-[12px] font-bold text-white">
                        {lobby.gameName}
                      </h3>

                      {lobby.timeLeft && (
                        <span className="lobby-time">
                          {lobby.timeLeft}
                        </span>
                      )}
                    </div>

                    <div className="lobby-meta-row">
                      <div className="lobby-bet-pill">
                        <GameCoinIcon className="h-[16px] w-[16px]" />
                        <span>{formatNumber(lobby.bet)}</span>
                      </div>

                      <div className="lobby-player-pill">
                        <UsersRound size={12} />
                        <span>
                          {lobby.players}/{lobby.maxPlayers}
                        </span>
                      </div>
                    </div>

                    <div className="mini-button mini-button-join w-full">
                      Join
                    </div>
                  </div>
                </button>
              );
            })}

            {joinableLobbies.length === 0 && (
              <div className="app-panel empty-lobby-card min-w-[220px] rounded-[23px] p-4">
                <p className="text-safe text-[12px] font-bold text-white">
                  No open lobbies
                </p>
                <p className="text-safe mt-1 text-[9.5px] font-bold text-slate-500">
                  Waiting rooms will appear here.
                </p>
              </div>
            )}
          </div>
        )}
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
                  <div className="game-card-title-row">
                    <h3 className="text-safe mb-[7px] h-[34px] overflow-hidden text-[12px] font-bold leading-[1.35] text-white">
                      {game.displayName}
                    </h3>
                  </div>

                  <div className="game-card-footer">
                    <span className="game-tag-pill">
                      PVP
                    </span>

                    <div className="mini-button mini-button-play">
                      Play
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