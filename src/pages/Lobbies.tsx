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
    neondrift: 'Neon Drift',
    archer: 'Neon Duel',
    race: 'Street Race',
    airhockey: 'Air Hockey',
  };

  const handleJoinAndPlay = (lobbyId: string) => {
    joinLobby(lobbyId);
    
    // Карта маршрутов
    const routes: Record<string, string> = {
      neondrift: '/game/neondrift/play',
      race: '/game/race/play',
      airhockey: '/game/airhockey/play',
      archer: '/game/archer/play'
    };

    if (routes[gameId || '']) {
      navigate(routes[gameId!]);
    } else {
      alert(`Игра ${gameNames[gameId || '']} в разработке!`);
    }
  };

  return (
    <div className="p-4 pb-20 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-gray-500 text-sm mb-1 uppercase font-bold tracking-widest">← Back</button>
          <h1 className="text-2xl font-black text-white uppercase italic">{gameNames[gameId || ''] || 'Arena'}</h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(`/game/${gameId}/create`)}
          className="bg-cyan-500 p-3 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.4)]"
        >
          <Plus size={24} color="black" />
        </motion.button>
      </div>

      <div className="space-y-3">
        {lobbies.length === 0 ? (
          <div className="text-center py-20">
            <Users size={40} className="mx-auto text-gray-800 mb-4" />
            <p className="text-gray-600 font-bold uppercase text-[10px] tracking-widest">No active lobbies</p>
          </div>
        ) : (
          lobbies.map((lobby) => (
            <motion.div
              key={lobby.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#11111a] rounded-2xl p-5 border border-white/5"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-bold">{lobby.name}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <Coins size={12} className="text-cyan-500" />
                      <span className="text-cyan-500 text-xs font-bold">{lobby.betAmount}</span>
                    </div>
                    <span className="text-gray-600 text-[10px] uppercase font-bold">{lobby.players.length}/2 Players</span>
                  </div>
                </div>
                <button
                  onClick={() => handleJoinAndPlay(lobby.id)}
                  className="bg-white text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-tighter"
                >
                  Join
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};