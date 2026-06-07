import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  Coins,
  Gamepad2,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';

const gameNames: Record<string, string> = {
  plinko: 'Plinko PvP',
  virusmarket: 'Virus Market',
  hexfall: 'Hex Fall',
  rps: 'RPS Duel',
  tictactoe: 'Tic Tac Toe Duel',
  gridlock: 'Grid Lock',
  blackjack: 'Blackjack Duel',
  diceduel: 'Dice Duel',
  neonmatrix: 'Neon Matrix',
  slingclash: 'Sling Clash',
  icebump: 'Ice Bump',
  archer: 'Neon Duel',
  race: 'Street Race',
  airhockey: 'Air Hockey',
  pingpong: 'Golf',
  darts: 'Darts',
};

const gameRoutes: Record<string, string> = {
  plinko: '/game/plinko/play',
  virusmarket: '/game/virusmarket/play',
  hexfall: '/game/hexfall/play',
  rps: '/game/rps/play',
  tictactoe: '/game/tictactoe/play',
  gridlock: '/game/gridlock/play',
  blackjack: '/game/blackjack/play',
  diceduel: '/game/diceduel/play',
  neonmatrix: '/game/neonmatrix/play',
  slingclash: '/game/slingclash/play',
  icebump: '/game/icebump/play',
  race: '/game/race/play',
  airhockey: '/game/airhockey/play',
  archer: '/game/archer/play',
  pingpong: '/game/pingpong/play',
  darts: '/game/darts/play',
};

const localCards: Record<
  string,
  {
    icon: string;
    title: string;
    description: string;
    cta: string;
    meta: string;
    card: string;
    accent: string;
  }
> = {
  virusmarket: {
    icon: '🦠',
    title: 'Virus Market',
    description:
      '2 игрока выбирают мем-коин, потом рынок пампит и дампит. Побеждает тот, чей coin дал больше профита.',
    cta: 'Открыть биржу',
    meta: 'Local market duel',
    card: 'from-[#52FFE5]/20 via-[#F2C766]/10 to-transparent',
    accent: '#52FFE5',
  },
  neonmatrix: {
    icon: '🔢',
    title: 'Neon Matrix',
    description:
      '2 игрока с одного устройства. Каждый выбирает число от 1 до 100, потом рулетка выбирает финал.',
    cta: 'Играть локально',
    meta: 'Number mind game',
    card: 'from-[#52FFE5]/20 via-[#9D7CFF]/16 to-transparent',
    accent: '#52FFE5',
  },
  diceduel: {
    icon: '🎲',
    title: 'Dice Duel',
    description:
      '2 игрока с одного устройства. Каждый кидает 3 кубика и может один раз рискнуть перебросом одного кубика.',
    cta: 'Играть локально',
    meta: 'Risk table',
    card: 'from-[#F2C766]/26 via-[#FF7A90]/10 to-transparent',
    accent: '#F2C766',
  },
  slingclash: {
    icon: '🪵',
    title: 'Sling Clash',
    description:
      'Оффлайн-прототип: ты снизу, бот сверху. Каждые 5 секунд оба хода запускаются одновременно.',
    cta: 'Играть с ботом',
    meta: 'Physics arena',
    card: 'from-[#F2C766]/22 via-white/[0.04] to-transparent',
    accent: '#F2C766',
  },
  icebump: {
    icon: '🐧',
    title: 'Ice Bump',
    description:
      '4 пингвина на ледяной платформе. Выбери силу и направление, после таймера все стартуют одновременно.',
    cta: 'Играть с ботами',
    meta: 'Party arena',
    card: 'from-[#52FFE5]/20 via-white/[0.04] to-transparent',
    accent: '#52FFE5',
  },
};

export const Lobbies = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const allLobbies = useStore((state) => state.lobbies);
  const joinLobby = useStore((state) => state.joinLobby);

  const lobbies = useMemo(() => {
    return allLobbies.filter(
      (l) => l.gameId === gameId && l.status === 'waiting',
    );
  }, [allLobbies, gameId]);

  const gameName = gameNames[gameId || ''] || 'Игра';
  const localConfig = gameId ? localCards[gameId] : undefined;
  const isLocalTest = Boolean(localConfig);

  const handleJoinAndPlay = (lobbyId: string) => {
    joinLobby(lobbyId);
    if (gameRoutes[gameId || '']) {
      navigate(gameRoutes[gameId || '']);
    } else {
      alert(`Игра ${gameName} в разработке!`);
    }
  };

  return (
    <main className="app-scroll relative min-h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />

      {/* top bar */}
      <div className="relative mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate(-1)}
          className="press inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-white/[0.07] bg-white/[0.05] px-3 text-[11px] font-black text-white/58"
        >
          <ChevronLeft size={16} />
          Назад
        </button>

        {!isLocalTest && (
          <button
            onClick={() => navigate(`/game/${gameId}/create`)}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-[#08080C]"
            aria-label="Создать лобби"
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      {/* hero */}
      <section className="reveal top-hairline relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(242,199,102,0.16),transparent_40%),radial-gradient(circle_at_100%_28%,rgba(82,255,229,0.12),transparent_42%)]" />

        <div className="relative grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">
              <Sparkles size={11} className="text-[#F2C766]" />
              {isLocalTest ? 'Offline arena' : 'Online lobby'}
            </div>

            <h1 className="mt-3 truncate text-[28px] font-black leading-[0.9] tracking-[-0.07em]">
              {gameName}
            </h1>

            <p className="mt-2 max-w-[250px] text-[12px] font-medium leading-snug text-white/48">
              {isLocalTest
                ? 'Тестовый режим без ожидания соперника. Запускай арену сразу.'
                : 'Выбери комнату, зайди в дуэль или создай свой стол.'}
            </p>
          </div>

          <div className="grid h-[64px] w-[64px] place-items-center rounded-[22px] border border-white/[0.1] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            {isLocalTest ? (
              <Gamepad2 size={28} className="text-[#52FFE5]" />
            ) : (
              <Users size={28} className="text-[#F2C766]" />
            )}
          </div>
        </div>
      </section>

      {/* local card */}
      {localConfig && (
        <section
          className="reveal top-hairline relative mt-3 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0a11]/80 p-4"
          style={{ animationDelay: '60ms' }}
        >
          <div
            className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${localConfig.card}`}
          />
          <div className="relative">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.1] bg-black/25 text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {localConfig.icon}
              </div>
              <span className="rounded-full border border-white/[0.1] bg-white/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/55">
                Local
              </span>
            </div>

            <p
              className="text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ color: localConfig.accent }}
            >
              {localConfig.meta}
            </p>
            <h2 className="mt-1.5 text-[26px] font-black leading-none tracking-[-0.07em]">
              {localConfig.title}
            </h2>
            <p className="mt-2 text-[12px] font-medium leading-snug text-white/48">
              {localConfig.description}
            </p>

            <button
              onClick={() => navigate(gameRoutes[gameId || ''])}
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] bg-white py-3.5 text-[13px] font-black uppercase tracking-[0.12em] text-[#08080C]"
            >
              {localConfig.cta}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </section>
      )}

      {/* rooms */}
      <section className="relative mt-4 space-y-2">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/32">
            <BadgeCheck size={12} />
            {isLocalTest ? 'Online status' : 'Available rooms'}
          </div>
          <h2 className="mt-0.5 text-[20px] font-black tracking-[-0.06em]">
            {isLocalTest ? 'Лобби' : 'Комнаты'}
          </h2>
        </div>

        {lobbies.length === 0 ? (
          <div className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.035] px-5 py-9 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] border border-white/[0.07] bg-white/[0.05]">
              {isLocalTest ? (
                <Gamepad2 size={26} className="text-[#52FFE5]/75" />
              ) : (
                <Users size={26} className="text-[#F2C766]/75" />
              )}
            </div>
            <p className="text-[15px] font-black tracking-[-0.03em]">
              {isLocalTest ? 'Онлайн-лобби пока отключены' : 'Нет активных комнат'}
            </p>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] font-medium leading-snug text-white/42">
              {isLocalTest
                ? 'Запусти локальный режим и протестируй игру прямо сейчас.'
                : 'Создай первый стол и дождись соперника для дуэли.'}
            </p>
          </div>
        ) : (
          lobbies.map((lobby, index) => (
            <div
              key={lobby.id}
              className="reveal group relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-2.5"
              style={{ animationDelay: `${Math.min(index * 35, 200)}ms` }}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#52FFE5]/10 via-transparent to-[#F2C766]/10" />
              <div className="relative flex items-center gap-2.5">
                <div className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[17px] border border-white/[0.08] bg-black/25">
                  <Users size={24} className="text-[#52FFE5]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#F2C766]/58">
                    Waiting room
                  </p>
                  <h3 className="mt-0.5 truncate text-[15px] font-black tracking-[-0.04em]">
                    {lobby.name}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-black text-white/60">
                      <Coins size={12} className="text-[#F2C766]" />
                      <span className="tabular-nums">{lobby.betAmount}</span>
                    </span>
                    <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-black tabular-nums text-white/38">
                      {lobby.players.length}/2
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleJoinAndPlay(lobby.id)}
                  className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#08080C]"
                  aria-label="Войти в лобби"
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
};
