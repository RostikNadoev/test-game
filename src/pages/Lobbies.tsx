import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import { ChevronLeft, Coins, Gamepad2, Plus, Sparkles, Users } from 'lucide-react';
import { useMemo } from 'react';

const gameNames: Record<string, string> = {
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
    card: string;
    button: string;
    text: string;
  }
> = {
  virusmarket: {
    icon: '🦠',
    title: 'Virus Market Local Duel',
    description:
      '2 игрока выбирают мем-коин, потом рынок пампит и дампит. Побеждает тот, чей coin дал больше профита.',
    cta: 'Открыть биржу',
    card: 'from-[#031a13] via-[#071827] to-[#211039]',
    button: 'from-emerald-300 via-cyan-400 to-violet-500 text-slate-950',
    text: 'text-emerald-100/75',
  },
  neonmatrix: {
    icon: '🔢',
    title: 'Neon Matrix Local Test',
    description:
      '2 игрока с одного устройства. Каждый выбирает число от 1 до 100, потом рулетка выбирает финал.',
    cta: 'Играть локально',
    card: 'from-[#071827] via-[#16062b] to-[#2b0631]',
    button: 'from-cyan-300 via-fuchsia-500 to-violet-600 text-white',
    text: 'text-cyan-100/75',
  },
  diceduel: {
    icon: '🎲',
    title: 'Dice Duel Local Test',
    description:
      '2 игрока с одного устройства. Каждый кидает 3 кубика и может один раз рискнуть перебросом одного кубика.',
    cta: 'Играть локально',
    card: 'from-[#331405] via-[#150907] to-[#2b113f]',
    button: 'from-yellow-300 via-orange-500 to-red-500 text-stone-950',
    text: 'text-yellow-100/75',
  },
  slingclash: {
    icon: '🪵',
    title: 'Sling Clash Bot Test',
    description:
      'Оффлайн-прототип: ты снизу, бот сверху. Каждые 5 секунд оба хода запускаются одновременно.',
    cta: 'Играть с ботом',
    card: 'from-amber-900/70 via-yellow-950/70 to-stone-950',
    button: 'from-amber-500 to-yellow-400 text-stone-950',
    text: 'text-amber-100/75',
  },
  icebump: {
    icon: '🐧',
    title: 'Ice Bump Bot Test',
    description:
      '4 пингвина на ледяной платформе. Выбери силу и направление, после таймера все стартуют одновременно.',
    cta: 'Играть с ботами',
    card: 'from-sky-950/80 via-cyan-950/70 to-slate-950',
    button: 'from-cyan-300 to-sky-500 text-slate-950',
    text: 'text-cyan-100/75',
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
    <div className="relative min-h-full w-full min-w-0 overflow-x-hidden pb-32 text-white">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/16 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-fuchsia-500/16 blur-[90px]" />

      <div className="relative w-full min-w-0 px-4 pt-2">
        <div className="mb-5 flex w-full min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300 backdrop-blur-xl transition active:scale-95"
            >
              <ChevronLeft size={16} />
              Назад
            </button>

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/55">
              <Sparkles size={13} />
              {isLocalTest ? 'Offline arena' : 'Online lobby'}
            </div>

            <h1 className="mt-1 truncate text-[30px] font-black leading-none tracking-[-0.05em]">
              {gameName}
            </h1>

            <p className="mt-2 text-sm font-medium text-slate-400">
              {isLocalTest ? 'Тестовый оффлайн-режим' : 'Доступные лобби'}
            </p>
          </div>

          {!isLocalTest && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => navigate(`/game/${gameId}/create`)}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-[22px] bg-gradient-to-br from-cyan-300 via-blue-500 to-fuchsia-500 text-white shadow-[0_18px_45px_rgba(34,211,238,0.25)]"
            >
              <Plus size={25} />
            </motion.button>
          )}
        </div>

        {localConfig && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative mb-5 w-full overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-br ${localConfig.card} p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]`}
          >
            <div className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />

            <div className="relative">
              <div className="mb-4 grid h-16 w-16 place-items-center rounded-[24px] border border-white/15 bg-white/10 text-4xl shadow-inner">
                {localConfig.icon}
              </div>

              <h2 className="text-2xl font-black tracking-[-0.04em] text-white">
                {localConfig.title}
              </h2>

              <p className={`mt-2 text-sm font-medium leading-relaxed ${localConfig.text}`}>
                {localConfig.description}
              </p>

              <button
                onClick={() => navigate(gameRoutes[gameId || ''])}
                className={`mt-5 w-full rounded-2xl bg-gradient-to-r ${localConfig.button} py-3.5 text-sm font-black shadow-xl transition active:scale-95`}
              >
                {localConfig.cta}
              </button>
            </div>
          </motion.div>
        )}

        <div className="relative w-full min-w-0 space-y-3">
          {lobbies.length === 0 ? (
            <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.055] px-4 py-12 text-center shadow-xl backdrop-blur-xl">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[24px] border border-white/10 bg-white/[0.08]">
                {isLocalTest ? (
                  <Gamepad2 size={30} className="text-cyan-100/65" />
                ) : (
                  <Users size={30} className="text-cyan-100/65" />
                )}
              </div>

              <p className="text-base font-black text-white">
                {isLocalTest ? 'Онлайн-лобби пока отключены' : 'Нет активных лобби'}
              </p>

              <p className="mx-auto mt-2 max-w-[270px] text-sm font-medium leading-relaxed text-slate-400">
                {isLocalTest
                  ? 'Запусти локальный режим и протестируй игру прямо сейчас.'
                  : 'Создай комнату первым и пригласи соперника в дуэль.'}
              </p>
            </div>
          ) : (
            lobbies.map((lobby) => (
              <motion.div
                key={lobby.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative w-full min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl"
              >
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />

                <div className="relative flex w-full min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-white">
                      {lobby.name}
                    </h3>

                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/10 px-2.5 py-1 font-black text-cyan-100">
                        <Coins size={14} />
                        {lobby.betAmount}
                      </span>

                      <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs font-black text-slate-400">
                        {lobby.players.length}/2
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleJoinAndPlay(lobby.id)}
                    className="shrink-0 rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg transition active:scale-95"
                  >
                    Играть
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};