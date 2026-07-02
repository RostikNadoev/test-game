import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronLeft,
  Coins,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { api, ApiError, type Lobby } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { getGameByCode } from '../data/games';

const POLL_INTERVAL_MS = 7000;

const toErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
};

export const Lobbies = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const game = useMemo(() => getGameByCode(gameId || ''), [gameId]);
  const gameName = game?.displayName || gameId || 'Игра';

  const loadLobbies = useCallback(
    async (withSpinner = false) => {
      if (!gameId) {
        setError('Не найден код игры');
        setIsLoading(false);
        return;
      }

      if (withSpinner) {
        setIsRefreshing(true);
      }

      try {
        const response = await api.lobbies.activeByGame(gameId);
        setLobbies(response.lobbies);
        setError(null);
      } catch (requestError) {
        setError(toErrorMessage(requestError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [gameId],
  );

  useEffect(() => {
    void loadLobbies(false);

    const interval = window.setInterval(() => {
      void loadLobbies(false);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loadLobbies]);

  const handleOpenOrJoin = async (lobby: Lobby) => {
    if (joiningLobbyId) return;

    const isUserInLobby = Boolean(user && lobby.players.includes(user.id));

    if (isUserInLobby) {
      navigate(`/game/${lobby.game}/lobby/${lobby.id}`);
      return;
    }

    const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;

    if (!canJoin) return;

    setJoiningLobbyId(lobby.id);
    setError(null);

    try {
      const response = await api.lobbies.join(lobby.id);

      navigate(`/game/${response.lobby.game}/lobby/${response.lobby.id}`);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
      await loadLobbies(false);
    } finally {
      setJoiningLobbyId(null);
    }
  };

  return (
    <main className="app-scroll relative min-h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      <div className="relative mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate(-1)}
          className="press inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[11px] font-black text-white/58"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        <button
          onClick={() => navigate(`/game/${gameId}/create`)}
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-[#08080C]"
          aria-label="Создать лобби"
        >
          <Plus size={20} />
        </button>
      </div>

      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_40%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.12),transparent_42%)]" />

        <div className="relative grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles size={11} className="text-[#F2C766]" />
              Online lobby
            </div>

            <h1 className="mt-3 truncate text-[28px] font-black leading-[0.9] tracking-[-0.07em]">
              {gameName}
            </h1>

            <p className="mt-2 max-w-[250px] text-[12px] font-medium leading-snug text-white/48">
              Выбери комнату, зайди в дуэль или создай свой стол.
            </p>
          </div>

          <div className="grid h-[64px] w-[64px] place-items-center rounded-[22px] border border-white/[0.1] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Users size={28} className="text-[#F2C766]" />
          </div>
        </div>
      </section>

      <section className="relative mt-4 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/32">
              <BadgeCheck size={12} />
              Available rooms
            </div>
            <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
              Комнаты
            </h2>
          </div>

          <button
            onClick={() => void loadLobbies(true)}
            disabled={isRefreshing}
            className="press inline-flex h-9 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/52 disabled:opacity-60"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-[#F2C766]' : 'text-[#F2C766]'} />
            Обновить
          </button>
        </div>

        {error && (
          <div className="rounded-[16px] border border-[#FF7A90]/20 bg-[#FF7A90]/10 px-3 py-2 text-[11px] font-bold leading-snug text-[#FFB3BE]">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid min-h-[220px] place-items-center">
            <div className="grid justify-items-center gap-3">
              <Loader2 size={32} className="animate-spin text-[#F2C766]" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
                Загружаем комнаты
              </p>
            </div>
          </div>
        ) : lobbies.length === 0 ? (
          <div className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.035] px-5 py-9 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] border border-white/[0.07] bg-white/[0.05]">
              <Users size={26} className="text-[#F2C766]/75" />
            </div>
            <p className="text-[15px] font-black tracking-[-0.03em]">
              Нет активных комнат
            </p>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] font-medium leading-snug text-white/42">
              Создай первый стол и дождись соперника для дуэли.
            </p>
          </div>
        ) : (
          lobbies.map((lobby, index) => {
            const isUserInLobby = Boolean(user && lobby.players.includes(user.id));
            const canJoin = lobby.status === 'waiting' && lobby.player_count < lobby.max_players;
            const isJoining = joiningLobbyId === lobby.id;

            const buttonText = isUserInLobby
              ? 'Open'
              : canJoin
                ? 'Join'
                : 'Busy';

            return (
              <div
                key={lobby.id}
                className="reveal group relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-2.5"
                style={{ animationDelay: `${Math.min(index * 35, 200)}ms` }}
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#52FFE5]/10 via-transparent to-[#F2C766]/10" />
                <div className="relative flex items-center gap-2.5">
                  <div className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[17px] border border-white/[0.08] bg-black/25">
                    <Users size={24} className={canJoin || isUserInLobby ? 'text-[#52FFE5]' : 'text-white/30'} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/58">
                      {lobby.status === 'waiting' ? 'Waiting room' : 'In game'}
                    </p>
                    <h3 className="mt-0.5 truncate text-[15px] font-black tracking-[-0.04em]">
                      {lobby.name}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-black text-white/60">
                        <Coins size={12} className="text-[#F2C766]" />
                        <span className="tabular-nums">{lobby.bet_coins}</span>
                      </span>
                      <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-black tabular-nums text-white/38">
                        {lobby.player_count}/{lobby.max_players}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => void handleOpenOrJoin(lobby)}
                    disabled={Boolean(joiningLobbyId) || (!canJoin && !isUserInLobby)}
                    className={[
                      'press grid h-11 min-w-11 shrink-0 place-items-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.12em]',
                      canJoin || isUserInLobby
                        ? 'bg-white text-[#08080C]'
                        : 'bg-white/[0.08] text-white/30',
                    ].join(' ')}
                    aria-label="Войти в лобби"
                  >
                    {isJoining ? <Loader2 size={18} className="animate-spin" /> : buttonText}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
};