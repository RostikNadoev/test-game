import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';

export const CreateLobby = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const createLobby = useStore((state) => state.createLobby);
  const userCoins = useStore((state) => state.user.coins);
  
  const [lobbyName, setLobbyName] = useState('');
  const [bet, setBet] = useState(100);

  const handleCreate = () => {
    if (!lobbyName.trim()) {
      alert('Введите название лобби');
      return;
    }
    if (bet > userCoins) {
      alert('Недостаточно монет!');
      return;
    }
    
    createLobby({
      gameId: gameId!,
      gameName: 'Game',
      name: lobbyName,
      betAmount: bet,
    });
    
    navigate(`/game/${gameId}/lobbies`);
  };

  return (
    <div className="p-4 pb-20 min-h-screen">
      <button onClick={() => navigate(-1)} className="text-gray-400 mb-6">← Назад</button>
      
      <h1 className="text-2xl font-bold text-white mb-6">Создать лобби</h1>
      
      <div className="space-y-5">
        <div>
          <label className="text-gray-300 text-sm block mb-2">Название лобби</label>
          <input
            type="text"
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
            placeholder="Моя битва"
            className="w-full bg-card border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-accent"
          />
        </div>
        
        <div>
          <label className="text-gray-300 text-sm block mb-2">Ставка (монеты)</label>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={bet}
            onChange={(e) => setBet(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500">10</span>
            <span className="text-accent font-bold">{bet}</span>
            <span className="text-gray-500">1000</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Ваш баланс: {userCoins}</p>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleCreate}
          className="w-full bg-gradient-to-r from-accent to-purple-600 py-3 rounded-xl font-bold text-white shadow-lg mt-4"
        >
          Создать лобби
        </motion.button>
      </div>
    </div>
  );
};