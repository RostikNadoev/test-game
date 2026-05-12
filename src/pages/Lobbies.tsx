import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import { Plus, Users, Coins } from 'lucide-react';
import { useMemo } from 'react';

export const Lobbies = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const allLobbies = useStore((state) => state.lobbies);
  const joinLobby = useStore((state) => state.joinLobby);

  const lobbies = useMemo(() => {
    return allLobbies.filter((l) => l.gameId === gameId && l.status === 'waiting');
  }, [allLobbies, gameId]);

  const gameNames: Record<string, string> = {
    hideout: 'Hideout',
    hexfall: 'Hex Fall',
    rps: 'RPS Duel',
    tictactoe: 'Tic Tac Toe Duel',
    gridlock: 'Grid Lock',
    blackjack: 'Blackjack Duel',
    slingclash: 'Sling Clash',
    parkduel: 'Park Duel',
    chronoslash: 'Chrono Slash',
    royalbluff: 'Royal Bluff',
    icebump: 'Ice Bump',
    newgame: 'New Game',
    chase: 'Tag Chase',
    archer: 'Neon Duel',
    race: 'Street Race',
    airhockey: 'Air Hockey',
    pool: 'Pool',
    paper: 'Paper Duel',
    pingpong: 'Pong',
    darts: 'Darts',
  };

  const handleJoinAndPlay = (lobbyId: string) => {
    joinLobby(lobbyId);

    const gameRoutes: Record<string, string> = {
      hideout: '/game/hideout/play',
      hexfall: '/game/hexfall/play',
      rps: '/game/rps/play',
      tictactoe: '/game/tictactoe/play',
      gridlock: '/game/gridlock/play',
      blackjack: '/game/blackjack/play',
      slingclash: '/game/slingclash/play',
      parkduel: '/game/parkduel/play',
      chronoslash: '/game/chronoslash/play',
      royalbluff: '/game/royalbluff/play',
      icebump: '/game/icebump/play',
      newgame: '/game/newgame/play',
      chase: '/game/chase/play',
      race: '/game/race/play',
      airhockey: '/game/airhockey/play',
      archer: '/game/archer/play',
      paper: '/game/paper/play',
      pingpong: '/game/pingpong/play',
      pool: '/game/pool/play',
      darts: '/game/darts/play',
    };

    if (gameRoutes[gameId || '']) {
      navigate(gameRoutes[gameId || '']);
    } else {
      alert(`Игра ${gameNames[gameId || ''] || ''} в разработке!`);
    }
  };

  const isSlingClash = gameId === 'slingclash';
  const isParkDuel = gameId === 'parkduel';
  const isChronoSlash = gameId === 'chronoslash';
  const isRoyalBluff = gameId === 'royalbluff';
  const isIceBump = gameId === 'icebump';

  const isLocalTest =
    isSlingClash ||
    isParkDuel ||
    isChronoSlash ||
    isRoyalBluff ||
    isIceBump;

  return (
    <div className="p-4 pb-20 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-gray-400 mb-2 block">
            ← Назад
          </button>

          <h1 className="text-2xl font-bold text-white">
            {gameNames[gameId || ''] || 'Игра'}
          </h1>

          <p className="text-gray-400">
            {isLocalTest ? 'Тестовый оффлайн-режим' : 'Доступные лобби'}
          </p>
        </div>

        {!isLocalTest && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(`/game/${gameId}/create`)}
            className="bg-accent p-3 rounded-full shadow-lg"
          >
            <Plus size={24} />
          </motion.button>
        )}
      </div>

      {isSlingClash && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-900/60 via-yellow-950/70 to-stone-950 p-4 shadow-2xl"
        >
          <div className="text-3xl mb-2">🪵</div>
          <h2 className="text-white text-xl font-black">Sling Clash Bot Test</h2>
          <p className="text-amber-100/70 text-sm mt-1 leading-relaxed">
            Оффлайн-прототип: ты снизу, бот сверху. Каждые 5 секунд оба хода запускаются одновременно.
          </p>

          <button
            onClick={() => navigate('/game/slingclash/play')}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 py-3 font-black text-stone-950 active:scale-95 transition"
          >
            Играть с ботом
          </button>
        </motion.div>
      )}

      {isParkDuel && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-3xl border border-yellow-300/20 bg-gradient-to-br from-stone-950 via-slate-950 to-yellow-950/70 p-4 shadow-2xl"
        >
          <div className="text-3xl mb-2">🅿️</div>
          <h2 className="text-white text-xl font-black">Park Duel Bot Test</h2>
          <p className="text-yellow-100/70 text-sm mt-1 leading-relaxed">
            3 уровня парковки. Газ, тормоз, руль, штрафы за касания и победа по суммарному времени.
          </p>

          <button
            onClick={() => navigate('/game/parkduel/play')}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 py-3 font-black text-stone-950 active:scale-95 transition"
          >
            Играть с ботом
          </button>
        </motion.div>
      )}

      {isChronoSlash && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-950/70 via-indigo-950/80 to-fuchsia-950/70 p-4 shadow-2xl"
        >
          <div className="text-3xl mb-2">⚔️</div>
          <h2 className="text-white text-xl font-black">Chrono Slash Bot Test</h2>
          <p className="text-cyan-100/70 text-sm mt-1 leading-relaxed">
            Кибер-самурайская дуэль: выбери точку рывка и приём, потом оба хода раскрываются одновременно.
          </p>

          <button
            onClick={() => navigate('/game/chronoslash/play')}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 py-3 font-black text-white active:scale-95 transition"
          >
            Играть с ботом
          </button>
        </motion.div>
      )}

      {isRoyalBluff && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 overflow-hidden rounded-3xl border border-yellow-300/20 bg-gradient-to-br from-[#2b1549] via-[#171126] to-[#3b1f09] p-4 shadow-2xl"
        >
          <div className="text-3xl mb-2">👑</div>
          <h2 className="text-white text-xl font-black">Royal Bluff Local Test</h2>
          <p className="text-yellow-100/70 text-sm mt-1 leading-relaxed">
            Пока все 4 игрока управляются с одного телефона. Кидай карты, верь или сомневайся, а револьвер решает судьбу.
          </p>

          <button
            onClick={() => navigate('/game/royalbluff/play')}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-yellow-400 via-orange-500 to-fuchsia-500 py-3 font-black text-stone-950 active:scale-95 transition"
          >
            Играть локально
          </button>
        </motion.div>
      )}

      {isIceBump && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-sky-950/80 via-cyan-950/70 to-slate-950 p-4 shadow-2xl"
        >
          <div className="text-3xl mb-2">🐧</div>
          <h2 className="text-white text-xl font-black">Ice Bump Bot Test</h2>
          <p className="text-cyan-100/70 text-sm mt-1 leading-relaxed">
            4 пингвина на ледяной платформе. Выбери силу и направление, после таймера все стартуют одновременно.
          </p>

          <button
            onClick={() => navigate('/game/icebump/play')}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-sky-500 py-3 font-black text-slate-950 active:scale-95 transition"
          >
            Играть с ботами
          </button>
        </motion.div>
      )}

      <div className="space-y-3">
        {lobbies.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={48} className="mx-auto opacity-30 mb-2" />
            <p>{isLocalTest ? 'Онлайн-лобби пока отключены' : 'Нет активных лобби'}</p>
          </div>
        ) : (
          lobbies.map((lobby) => (
            <motion.div
              key={lobby.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl p-4 border border-white/10"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-bold text-lg">{lobby.name}</h3>

                  <div className="flex items-center gap-2 mt-1">
                    <Coins size={14} className="text-accent" />
                    <span className="text-accent text-sm">{lobby.betAmount}</span>
                    <span className="text-gray-500 text-xs">• {lobby.players.length}/2</span>
                  </div>
                </div>

                <button
                  onClick={() => handleJoinAndPlay(lobby.id)}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 rounded-xl text-sm font-bold active:scale-95 transition"
                >
                  Играть
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};