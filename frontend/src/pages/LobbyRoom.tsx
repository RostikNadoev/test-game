import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Coins, Loader2, Users } from 'lucide-react';
import { api, ApiError, getOpponentInfo, resolvePlayersInfo, type Lobby } from '../api';
import { useAuth } from '../auth/useAuth';
import { GameIntroOverlay } from '../components/GameIntroOverlay';
import { getGameByCode } from '../data/games';
import { useIntervalWhenVisible } from '../hooks/useIntervalWhenVisible';

const POLL_INTERVAL_MS = 2000;

const toErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
};

export const LobbyRoom = () => {
  const { gameId, lobbyId } = useParams();
  const navigate = useNavigate();
  const { user, refreshBalance } = useAuth();

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedRef = useRef(false);

  const lobbyGameCode = lobby?.game || gameId || '';
  const game = useMemo(() => getGameByCode(lobbyGameCode), [lobbyGameCode]);
  const gameTitle = game?.displayName || lobbyGameCode || 'Game';
  const playPath = game?.playPath || `/game/${lobbyGameCode}/play`;

  const isMatched = lobby?.status === 'playing' || (lobby?.player_count ?? 0) >= 2;
  const isUserInLobby = Boolean(user && lobby?.players.includes(user.id));

  const opponentInfo = useMemo(() => {
    if (!user || !lobby) return null;
    return getOpponentInfo(lobby, user);
  }, [lobby, user]);

  const loadLobby = useCallback(async () => {
    if (!lobbyId) {
      setError('ID лобби не найден');
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.lobbies.item(lobbyId);
      setLobby(response.lobby);
      setError(null);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [lobbyId]);

  useIntervalWhenVisible(() => {
    void loadLobby();
  }, POLL_INTERVAL_MS);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    if (!lobby || !user) return;

    completedRef.current = true;

    const playersInfo = resolvePlayersInfo(lobby, user);

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('twingames_blackjack_lobby_id', lobby.id);
      window.sessionStorage.setItem(
        'twingames_blackjack_players_info',
        JSON.stringify(playersInfo),
      );
      window.sessionStorage.setItem(
        'twingames_players_info',
        JSON.stringify(playersInfo),
      );

      window.sessionStorage.setItem('twingames_active_lobby_id', lobby.id);
      window.sessionStorage.setItem('twingames_active_game', lobby.game);
    }

    void refreshBalance();

    navigate(playPath, {
      replace: true,
      state: {
        lobbyId: lobby.id,
        game: lobby.game,
        playersInfo,
      },
    });
  }, [lobby, navigate, playPath, refreshBalance, user]);

  const handleLeave = async () => {
    if (!lobby || isLeaving || isMatched) return;

    setIsLeaving(true);

    try {
      await api.lobbies.leave(lobby.id);
      navigate(`/game/${lobby.game}/lobbies`, { replace: true });
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setIsLeaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="relative grid min-h-full place-items-center px-4 text-white">
        <div className="grid justify-items-center gap-3">
          <Loader2 size={34} className="animate-spin text-[#F2C766]" />
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">
            Загружаем лобби
          </p>
        </div>
      </main>
    );
  }

  if (error && !lobby) {
    return (
      <main className="app-scroll relative min-h-full overflow-y-auto px-4 pb-28 pt-2 text-white">
        <button
          onClick={() => navigate(`/game/${gameId}/lobbies`, { replace: true })}
          className="press mb-3 inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[11px] font-black text-white/58"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        <section className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.04] p-5 text-center">
          <AlertCircle size={34} className="mx-auto text-[#FF7A90]" />
          <p className="mt-3 text-[16px] font-black tracking-[-0.04em]">
            Лобби не найдено
          </p>
          <p className="mt-2 text-[12px] font-bold leading-snug text-white/42">
            {error}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-full overflow-hidden text-white">
      <div className="app-scroll min-h-full overflow-y-auto px-4 pb-28 pt-2">
        <button
          onClick={() => navigate(`/game/${lobbyGameCode}/lobbies`)}
          className="press mb-3 inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[11px] font-black text-white/58"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        <section className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_40%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.12),transparent_42%)]" />

          <div className="relative">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Users size={11} className="text-[#F2C766]" />
              Lobby room
            </div>

            <h1 className="mt-3 text-[28px] font-black leading-[0.95] tracking-[-0.07em]">
              {lobby?.name || 'Лобби'}
            </h1>

            <p className="mt-2 text-[12px] font-bold leading-snug text-white/45">
              {isMatched
                ? 'Соперник подключился. Сейчас начнется игра.'
                : 'Комната создана. Ждем второго игрока.'}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[18px] border border-white/[0.08] bg-black/25 p-3">
                <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/32">
                  <Coins size={12} />
                  Ставка
                </div>
                <p className="mt-1 text-[18px] font-black tabular-nums text-[#F2C766]">
                  {lobby?.bet_coins ?? 0}
                </p>
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-black/25 p-3">
                <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/32">
                  <Users size={12} />
                  Игроки
                </div>
                <p className="mt-1 text-[18px] font-black tabular-nums text-[#52FFE5]">
                  {lobby?.player_count ?? 0}/{lobby?.max_players ?? 2}
                </p>
              </div>
            </div>

            {!isMatched && isUserInLobby && (
              <button
                onClick={handleLeave}
                disabled={isLeaving}
                className="press mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.05] py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white/48 disabled:opacity-60"
              >
                {isLeaving && <Loader2 size={15} className="animate-spin" />}
                Выйти из лобби
              </button>
            )}

            {error && (
              <p className="mt-3 rounded-[14px] border border-[#FF7A90]/20 bg-[#FF7A90]/10 px-3 py-2 text-[10px] font-bold leading-snug text-[#FFB3BE]">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>

      <GameIntroOverlay
        gameTitle={gameTitle}
        isMatched={isMatched}
        onComplete={handleComplete}
        onCancel={() => void handleLeave()}
        isCancelling={isLeaving}
        cancelError={error}
        matchedDurationMs={
          lobbyGameCode === 'descent_duel' ||
          lobbyGameCode === 'coin_chase' ||
          lobbyGameCode === 'cube_fill' ||
          lobbyGameCode === 'draw_drop' ||
          lobbyGameCode === 'ballz_duel'
            ? 0
            : undefined
        }
        opponentName={opponentInfo?.tg_user}
        opponentPhotoUrl={opponentInfo?.photo_url}
      />
    </main>
  );
};