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
    return allLobbies.filter(l => l.gameId === gameId && l.status === 'waiting');
  }, [allLobbies, gameId]);

  const gameNames: Record<string, string> = {
    newgame: 'New Game',
    archer: 'Neon Duel',
    race: 'Street Race',
    airhockey: 'Air Hockey',
    snake: 'Snake Duel',
    paper: 'Paper Duel',
    pingpong: 'Pong',
    darts: 'Darts',
  };

  const handleJoinAndPlay = (lobbyId: string) => {
    joinLobby(lobbyId);
    const gameRoutes: Record<string, string> = {
      newgame: '/game/newgame/play',
      race: '/game/race/play',
      airhockey: '/game/airhockey/play',
      archer: '/game/archer/play',
      paper: '/game/paper/play',
    };
    if (gameRoutes[gameId || '']) {
      navigate(gameRoutes[gameId!]);
    } else {
      alert(`Игра ${gameNames[gameId || ''] || ''} в разработке!`);
    }
  };

  return (
    <div className="p-4 pb-20 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-gray-400 mb-2 block">← Назад</button>
          <h1 className="text-2xl font-bold text-white">{gameNames[gameId || ''] || 'Игра'}</h1>
          <p className="text-gray-400">Доступные лобби</p>
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate(`/game/${gameId}/create`)} className="bg-accent p-3 rounded-full shadow-lg">
          <Plus size={24} />
        </motion.button>
      </div>
      <div className="space-y-3">
        {lobbies.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={48} className="mx-auto opacity-30 mb-2" />
            <p>Нет активных лобби</p>
          </div>
        ) : (
          lobbies.map((lobby) => (
            <motion.div key={lobby.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-4 border border-white/10">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-bold text-lg">{lobby.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Coins size={14} className="text-accent" />
                    <span className="text-accent text-sm">{lobby.betAmount}</span>
                    <span className="text-gray-500 text-xs">• {lobby.players.length}/2</span>
                  </div>
                </div>
                <button onClick={() => handleJoinAndPlay(lobby.id)} className="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 rounded-xl text-sm font-bold active:scale-95 transition">Играть</button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};