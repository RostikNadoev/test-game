import { useNavigate } from 'react-router-dom';
import { GameCard } from '../components/GameCard';

const games = [
  { id: 'newgame', name: 'New Game', icon: '✨', description: 'Скоро открытие', color: 'from-fuchsia-500 to-purple-600' },
  { id: 'archer', name: 'Neon Duel', icon: '🏹', description: 'Битва на копьях', color: 'from-orange-500 to-red-600' },
  { id: 'race', name: 'Street Race', icon: '🏎️', description: 'Гонки на скорость', color: 'from-blue-500 to-cyan-500' },
  { id: 'airhockey', name: 'Air Hockey', icon: '🏒', description: 'Аэрохоккей', color: 'from-indigo-500 to-purple-500' },
  { id: 'snake', name: 'Snake Duel', icon: '🐍', description: 'Классика на двоих', color: 'from-lime-500 to-green-500' },
  { id: 'pingpong', name: 'Pong', icon: '🏓', description: 'Настольный теннис', color: 'from-yellow-500 to-amber-500' },
  { id: 'chess', name: 'Chess', icon: '♟️', description: 'Шахматы блиц', color: 'from-stone-500 to-neutral-700' },
  { id: 'darts', name: 'Darts', icon: '🎯', description: 'Дартс на точность', color: 'from-pink-500 to-rose-500' },
];

export const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          TwinGames
        </h1>
        <p className="text-gray-400 text-sm">Выбери битву и найди соперника</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            onClick={() => navigate(`/game/${game.id}/lobbies`)}
          />
        ))}
      </div>
    </div>
  );
};