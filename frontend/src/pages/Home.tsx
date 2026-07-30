import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Shuffle, Swords, UsersRound, Zap } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { api, ApiError, type Lobby } from '../api';
import { GAME_CATALOG, getGameByCode } from '../data/games';
import { useIntervalWhenVisible } from '../hooks/useIntervalWhenVisible';
import heroBanner from '../assets/home/banner.webp';
import { useLanguage } from '../i18n/LanguageContext';
import { TurboMatchmakingOverlay } from '../components/Turbo/TurboMatchmakingOverlay';
import { enterTurboRound } from '../components/Turbo/turboNavigation';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';

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

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
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
          <stop stopColor="#FFFFFF" stopOpacity="0.96" />
          <stop offset="0.34" stopColor="#FFE08A" />
          <stop offset="0.72" stopColor="#FF9F2D" />
          <stop offset="1" stopColor="#9A4D10" />
        </radialGradient>

        <linearGradient id="homeCoinEdge" x1="8" y1="5" x2="29" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF4C7" />
          <stop offset="0.42" stopColor="#FFB950" />
          <stop offset="1" stopColor="#803B0C" />
        </linearGradient>

        <linearGradient id="homeCoinStar" x1="11" y1="9" x2="25" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#FFE27A" />
          <stop offset="1" stopColor="#FF7A1A" />
        </linearGradient>

        <filter id="homeCoinShadow" x="1" y="1" width="34" height="34" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.42" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#FFB950" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#homeCoinShadow)">
        <circle cx="18" cy="18" r="14" fill="url(#homeCoinEdge)" />
        <circle cx="18" cy="18" r="11.2" fill="url(#homeCoinGlow)" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />

        <path
          d="M18 9.2L20.35 14.22L25.82 14.88L21.76 18.62L22.84 24.08L18 21.38L13.16 24.08L14.24 18.62L10.18 14.88L15.65 14.22L18 9.2Z"
          fill="url(#homeCoinStar)"
          stroke="rgba(255,255,255,0.68)"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />

        <path
          d="M10.9 12.2C12.4 9.95 14.92 8.48 17.8 8.48"
          stroke="white"
          strokeOpacity="0.6"
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
        size === 'lobby' ? 'h-[94px] rounded-[21px]' : 'aspect-[4/3] rounded-[22px]',
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

      <div className="game-image-glow" />
      <div className="game-image-glass" />
    </div>
  );
};

const LobbyRefreshSpinner = () => {
  const { tr } = useLanguage();

  return (
    <div className="lobby-refresh-state">
      <div className="refresh-energy-spinner" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="text-safe mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {tr('Refreshing', 'Обновление')}
      </p>
    </div>
  );
};

export const Home = () => {
  const navigate = useNavigate();
  const { user, refreshBalance } = useAuth();
  const { locale, localize, tr } = useLanguage();
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isTurboSearching, setIsTurboSearching] = useState(false);
  const [turboError, setTurboError] = useState<string | null>(null);

  const joinableOrOwnLobbies = useMemo(() => {
    return lobbies.filter((lobby) => {
      const isUserInLobby = Boolean(user && lobby.players.includes(user.id));
      const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;

      return isUserInLobby || canJoin;
    });
  }, [lobbies, user]);

  const loadLobbies = useCallback(async (withSpinner = false) => {
    if (withSpinner) {
      setIsRefreshing(true);
    }

    try {
      const response = await api.lobbies.active();
      setLobbies(response.lobbies);
      setLobbyError(null);
    } catch (error) {
      setLobbyError(toErrorMessage(error, tr('Unknown error', 'Неизвестная ошибка')));
    } finally {
      setIsLoadingLobbies(false);
      setIsRefreshing(false);
    }
  }, [tr]);

  useIntervalWhenVisible(() => {
    void loadLobbies(false);
  }, 8000);

  const acceptTurboStatus = useCallback(
    async (status: Awaited<ReturnType<typeof api.turbo.status>>) => {
      if (status.status === 'idle') {
        setIsTurboSearching(false);
        return false;
      }
      if (status.status !== 'playing') return false;
      await refreshBalance();
      setIsTurboSearching(false);
      setTurboError(null);
      return enterTurboRound(status, navigate);
    },
    [navigate, refreshBalance],
  );

  useEffect(() => {
    if (!isTurboSearching) return;

    let disposed = false;
    const poll = async () => {
      try {
        const status = await api.turbo.status();
        if (!disposed) await acceptTurboStatus(status);
      } catch (error) {
        if (!disposed) {
          setTurboError(toErrorMessage(error, tr('Matchmaking error', 'Ошибка поиска матча')));
        }
      }
    };

    const timer = window.setInterval(() => void poll(), 800);
    void poll();
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [acceptTurboStatus, isTurboSearching, tr]);

  const startTurbo = async () => {
    if ((user?.balance_game ?? 0) < 100) {
      setLobbyError(tr('Not enough coins for Turbo mode', 'Недостаточно монет для режима Turbo'));
      return;
    }

    setTurboError(null);
    setIsTurboSearching(true);
    try {
      await acceptTurboStatus(await api.turbo.join());
    } catch (error) {
      setTurboError(toErrorMessage(error, tr('Matchmaking error', 'Ошибка поиска матча')));
    }
  };

  const cancelTurbo = async () => {
    setIsTurboSearching(false);
    setTurboError(null);
    try {
      await acceptTurboStatus(await api.turbo.cancel());
    } catch {
      // The local overlay can close even if the queue was already matched.
    }
  };

  const openGame = (game: CatalogGame) => {
    if (game.launchMode === 'direct') {
      navigate(game.playPath);
      return;
    }

    navigate(`/game/${game.code}/lobbies`);
  };

  const handleOpenOrJoinLobby = async (lobby: Lobby) => {
    if (joiningLobbyId) return;

    const isUserInLobby = Boolean(user && lobby.players.includes(user.id));

    if (isUserInLobby) {
      navigate(`/game/${lobby.game}/lobby/${lobby.id}`);
      return;
    }

    const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;

    if (!canJoin) return;

    const userCoins = Math.floor(user?.balance_game ?? 0);

    if (lobby.bet_coins > userCoins) {
      setLobbyError(tr('Not enough coins for this bet', 'Недостаточно монет для этой ставки'));
      return;
    }

    setJoiningLobbyId(lobby.id);
    setLobbyError(null);

    try {
      const response = await api.lobbies.join(lobby.id);
      await refreshBalance();
      navigate(`/game/${response.lobby.game}/lobby/${response.lobby.id}`);
    } catch (error) {
      setLobbyError(toErrorMessage(error, tr('Unknown error', 'Неизвестная ошибка')));
      await loadLobbies(false);
    } finally {
      setJoiningLobbyId(null);
    }
  };

  return (
    <main className="app-scroll app-page home-page relative min-h-full overflow-y-auto overflow-x-hidden pt-4">
      <section className="animate-fade-in mb-4">
        <div className="hero-banner rounded-[27px]">
          <img
            src={heroBanner}
            alt="TwinGames"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
          />

          <div className="absolute inset-0 hero-banner-overlay" />

          <div className="hero-stat-text hero-stat-left">
            <span className="hero-stat-value">{games.length}</span>
            <span className="hero-stat-label">{tr('Games', 'Игры')}</span>
          </div>

          <div className="hero-stat-text hero-stat-right">
            <span className="hero-stat-value">{user?.stats?.rating ?? 1000}</span>
            <span className="hero-stat-label">{tr('Rating', 'Рейтинг')}</span>
          </div>
        </div>
      </section>

      <section className="animate-fade-in home-lobbies-reveal mb-5">
        <div className="section-heading">
          <div>
            <p className="section-kicker section-kicker-orange">
              {tr('Waiting players', 'Ожидают игроков')}
            </p>
            <h2 className="section-title">
              {tr('Active lobbies', 'Активные лобби')}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void loadLobbies(true)}
            disabled={isRefreshing}
            aria-label={tr('Refresh lobbies', 'Обновить лобби')}
            className={`pressable refresh-button ${isRefreshing ? 'is-loading' : ''}`}
          >
            <RefreshCw
              size={14}
              className={`refresh-button-icon ${isRefreshing ? 'animate-spin' : ''}`}
            />

            <span className="refresh-button-label">
              {tr('Refresh', 'Обновить')}
            </span>
          </button>
        </div>

        {lobbyError && (
          <div className="mb-2 rounded-[16px] border border-[#FF7A90]/20 bg-[#FF7A90]/10 px-3 py-2 text-[10px] font-bold leading-snug text-[#FFB3BE]">
            {localize(lobbyError)}
          </div>
        )}

        {isRefreshing || isLoadingLobbies ? (
          <LobbyRefreshSpinner />
        ) : (
          <div className="lobby-scroll flex gap-2.5 overflow-x-auto pb-1" style={{ marginInline: 'calc(var(--app-gutter) * -1)', paddingInline: 'var(--app-gutter)' }}>
            {joinableOrOwnLobbies.map((lobby, index) => {
              const game = getGameByCode(lobby.game) as GameWithMedia | undefined;
              const tone = getGameTone(index);
              const isUserInLobby = Boolean(user && lobby.players.includes(user.id));
              const isJoining = joiningLobbyId === lobby.id;

              const fallbackGame = {
                code: lobby.game,
                displayName: lobby.game,
                description: '',
                icon: '🎮',
                color: 'from-[#52FFE5]/20 via-[#9D7CFF]/12 to-transparent',
                meta: 'Game',
                playPath: `/game/${lobby.game}/play`,
              } as GameWithMedia;

              const targetGame = game ?? fallbackGame;

              return (
                <button
                  key={lobby.id}
                  type="button"
                  onClick={() => void handleOpenOrJoinLobby(lobby)}
                  disabled={Boolean(joiningLobbyId)}
                  className="pressable app-panel lobby-card min-w-[178px] shrink-0 rounded-[25px] p-2 text-left disabled:opacity-70"
                >
                  <GameImage game={targetGame} tone={tone} size="lobby" />

                  <div className="px-1 pt-2.5">
                    <h3 className="text-safe mb-2 truncate text-[12px] font-bold text-white">
                      {targetGame.displayName}
                    </h3>

                    <div className="lobby-meta-row">
                      <div className="lobby-bet-pill">
                        <GameCoinIcon className="h-[16px] w-[16px]" />
                        <span>{formatNumber(lobby.bet_coins)}</span>
                      </div>

                      <div className="lobby-player-pill">
                        <UsersRound size={12} />
                        <span>
                          {lobby.player_count}/{lobby.max_players}
                        </span>
                      </div>
                    </div>

                    <div className="mini-button mini-button-join w-full">
                      {isJoining ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : isUserInLobby ? (
                        tr('Open', 'Открыть')
                      ) : (
                        tr('Join', 'Войти')
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {joinableOrOwnLobbies.length === 0 && (
              <div className="app-panel empty-lobby-card min-w-[220px] rounded-[24px] p-4">
                <p className="text-safe text-[12px] font-bold text-white">
                  {tr('No open lobbies', 'Нет открытых лобби')}
                </p>
                <p className="text-safe mt-1 text-[9.5px] font-bold text-slate-500">
                  {tr('Waiting rooms will appear here.', 'Комнаты ожидания появятся здесь.')}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="animate-fade-in turbo-home-section">
        <button
          type="button"
          onClick={() => void startTurbo()}
          className="pressable turbo-home-card"
        >
          <div className="turbo-home-glow" aria-hidden="true" />
          <div className="turbo-home-top">
            <span className="turbo-home-badge"><Zap size={11} /> Turbo</span>
            <span className="turbo-home-stake">
              <img src={coinIcon} alt="" draggable={false} decoding="async" />
              100
            </span>
          </div>

          <div className="turbo-home-copy">
            <h2>{tr('Random arena series', 'Серия случайных арен')}</h2>
            <p>
              {tr(
                'One tap, one opponent and three games selected from the full collection.',
                'Одно нажатие, один соперник и три игры из всей коллекции.',
              )}
            </p>
          </div>

          <div className="turbo-home-rules">
            <span><Shuffle size={13} /> {tr('3 random games', '3 случайные игры')}</span>
            <span><Swords size={13} /> Best of 3</span>
          </div>

          <div className="turbo-home-play">
            {tr('Find opponent', 'Найти соперника')}
            <Zap size={14} />
          </div>
        </button>
      </section>

      <section id="games-grid" className="animate-fade-in home-games-reveal scroll-mt-4">
        <div className="section-heading mb-2.5">
          <div>
            <p className="section-kicker section-kicker-blue">
              {tr('Collection', 'Коллекция')}
            </p>
            <h2 className="section-title">
              {tr('Game arenas', 'Игровые арены')}
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
                onClick={() => openGame(game)}
                className="pressable app-panel game-card overflow-hidden rounded-[25px] p-2 text-left"
              >
                <GameImage game={game} tone={tone} />

                <div className="game-card-body px-1 pb-1 pt-2.5">
                  <h3 className="text-safe mb-[7px] h-[34px] overflow-hidden text-[12px] font-bold leading-[1.35] text-white">
                    {game.displayName}
                  </h3>

                  <div className="mini-button mini-button-play w-full">
                    {game.launchMode === 'direct'
                      ? tr('Play', 'Играть')
                      : tr('Lobby', 'Лобби')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {isTurboSearching && (
        <TurboMatchmakingOverlay error={turboError} onCancel={() => void cancelTurbo()} />
      )}
    </main>
  );
};
