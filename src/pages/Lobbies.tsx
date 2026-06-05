import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
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
    return allLobbies.filter((l) => l.gameId === gameId && l.status === 'waiting');
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
    <main className="app-scroll relative min-h-full w-full min-w-0 overflow-y-auto overflow-x-hidden px-4 pb-32 pt-1 text-white">
      <div className="pointer-events-none absolute inset-0 premium-grid opacity-[0.22]" />
      <div className="pointer-events-none absolute -left-28 top-8 h-72 w-72 rounded-full bg-[#F2C766]/12 blur-[95px]" />
      <div className="pointer-events-none absolute -right-28 top-44 h-80 w-80 rounded-full bg-[#52FFE5]/10 blur-[110px]" />

      <div className="relative mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex h-12 items-center gap-2 rounded-[20px] border border-white/[0.08] bg-white/[0.055] px-3.5 text-xs font-black text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition hover:bg-white/[0.08] active:scale-95"
        >
          <ChevronLeft size={17} />
          Назад
        </button>

        {!isLocalTest && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => navigate(`/game/${gameId}/create`)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[20px] bg-white text-[#08080C] shadow-[0_16px_34px_rgba(255,255,255,0.14)]"
            aria-label="Создать лобби"
          >
            <Plus size={23} />
          </motion.button>
        )}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C]/84 p-5 shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(242,199,102,0.18),transparent_34%),radial-gradient(circle_at_95%_24%,rgba(82,255,229,0.13),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.09),transparent_46%)]" />
        <div className="pointer-events-none absolute -right-10 top-8 h-40 w-40 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 top-24 h-20 w-20 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className="relative grid grid-cols-[1fr_auto] items-start gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/24 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-white/48">
              <Sparkles size={12} className="text-[#F2C766]" />
              {isLocalTest ? 'Offline arena' : 'Online lobby'}
            </div>

            <h1 className="mt-4 truncate text-[38px] font-black leading-[0.88] tracking-[-0.09em] text-white">
              {gameName}
            </h1>

            <p className="mt-3 max-w-[265px] text-[13px] font-medium leading-relaxed text-white/48">
              {isLocalTest
                ? 'Тестовый режим без ожидания соперника. Запускай арену сразу.'
                : 'Выбери комнату, зайди в дуэль или создай свой приватный стол.'}
            </p>
          </div>

          <div className="relative grid h-[92px] w-[76px] place-items-center rounded-[28px] border border-white/[0.1] bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="absolute -right-3 -top-3 h-9 w-9 rounded-full border border-white/10" />
            {isLocalTest ? (
              <Gamepad2 size={32} className="text-[#52FFE5]" />
            ) : (
              <Users size={32} className="text-[#F2C766]" />
            )}
          </div>
        </div>
      </motion.section>

      {localConfig && (
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, ease: 'easeOut' }}
          className="relative mt-4 overflow-hidden rounded-[38px] border border-white/[0.09] bg-[#08080C]/82 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
        >
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${localConfig.card}`} />
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div className="grid h-20 w-20 place-items-center rounded-[30px] border border-white/[0.1] bg-black/20 text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {localConfig.icon}
              </div>

              <span className="rounded-full border border-white/[0.1] bg-white/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
                Local
              </span>
            </div>

            <p
              className="text-[10px] font-black uppercase tracking-[0.24em]"
              style={{ color: localConfig.accent }}
            >
              {localConfig.meta}
            </p>

            <h2 className="mt-2 text-[32px] font-black leading-none tracking-[-0.08em] text-white">
              {localConfig.title}
            </h2>

            <p className="mt-3 text-sm font-medium leading-relaxed text-white/48">
              {localConfig.description}
            </p>

            <button
              onClick={() => navigate(gameRoutes[gameId || ''])}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-[24px] bg-white py-4 text-sm font-black uppercase tracking-[0.14em] text-[#08080C] shadow-[0_18px_38px_rgba(255,255,255,0.16)] transition active:scale-[0.97]"
            >
              {localConfig.cta}
              <ArrowUpRight size={18} />
            </button>
          </div>
        </motion.section>
      )}

      <section className="relative mt-5 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/32">
              <BadgeCheck size={13} />
              {isLocalTest ? 'Online status' : 'Available rooms'}
            </div>

            <h2 className="mt-1 text-[24px] font-black tracking-[-0.07em] text-white">
              {isLocalTest ? 'Лобби' : 'Комнаты'}
            </h2>
          </div>
        </div>

        {lobbies.length === 0 ? (
          <div className="relative overflow-hidden rounded-[36px] border border-white/[0.09] bg-white/[0.045] px-5 py-12 text-center shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(82,255,229,0.11),transparent_34%)]" />

            <div className="relative mx-auto mb-5 grid h-18 w-18 place-items-center rounded-[28px] border border-white/[0.08] bg-white/[0.06]">
              {isLocalTest ? (
                <Gamepad2 size={32} className="text-[#52FFE5]/75" />
              ) : (
                <Users size={32} className="text-[#F2C766]/75" />
              )}
            </div>

            <p className="relative text-lg font-black tracking-[-0.04em] text-white">
              {isLocalTest ? 'Онлайн-лобби пока отключены' : 'Нет активных комнат'}
            </p>

            <p className="relative mx-auto mt-2 max-w-[280px] text-sm font-medium leading-relaxed text-white/42">
              {isLocalTest
                ? 'Запусти локальный режим и протестируй игру прямо сейчас.'
                : 'Создай первый стол и дождись соперника для дуэли.'}
            </p>
          </div>
        ) : (
          lobbies.map((lobby, index) => (
            <motion.div
              key={lobby.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.32,
                delay: Math.min(index * 0.035, 0.22),
                ease: 'easeOut',
              }}
              className="group relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.045] p-3 shadow-[0_16px_45px_rgba(0,0,0,0.24)] backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#52FFE5]/10 via-transparent to-[#F2C766]/10" />

              <div className="relative flex items-center gap-3">
                <div className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[24px] border border-white/[0.09] bg-black/22">
                  <Users size={27} className="text-[#52FFE5]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F2C766]/58">
                    Waiting room
                  </p>

                  <h3 className="mt-1 truncate text-[17px] font-black tracking-[-0.045em] text-white">
                    {lobby.name}
                  </h3>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-xs font-black text-white/58">
                      <Coins size={13} className="text-[#F2C766]" />
                      {lobby.betAmount}
                    </span>

                    <span className="rounded-full bg-black/20 px-2.5 py-1 text-xs font-black text-white/38">
                      {lobby.players.length}/2
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleJoinAndPlay(lobby.id)}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#08080C] shadow-[0_16px_34px_rgba(255,255,255,0.12)] transition group-hover:rotate-12 active:scale-95"
                  aria-label="Войти в лобби"
                >
                  <ArrowUpRight size={19} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </section>
    </main>
  );
};