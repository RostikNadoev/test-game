import { useNavigate } from 'react-router-dom';
import { GameCard } from '../components/GameCard';

const games = [
  {
    id: 'gridlock',
    name: 'Grid Lock',
    icon: '🧱',
    description: 'Дойди до края и блокируй',
    color: 'from-violet-500 to-fuchsia-700',
  },
  {
    id: 'blackjack',
    name: 'Blackjack Duel',
    icon: '🂡',
    description: '21 на 1v1',
    color: 'from-emerald-500 to-teal-700',
  },
  {
    id: 'newgame',
    name: 'New Game',
    icon: '✨',
    description: 'Скоро открытие',
    color: 'from-fuchsia-500 to-purple-600',
  },
  {
    id: 'chase',
    name: 'Tag Chase',
    icon: '🏃',
    description: 'Догонялки 1 на 1',
    color: 'from-emerald-500 to-cyan-600',
  },
  {
    id: 'archer',
    name: 'Neon Duel',
    icon: '🏹',
    description: 'Битва на копьях',
    color: 'from-orange-500 to-red-600',
  },
  {
    id: 'race',
    name: 'Street Race',
    icon: '🏎️',
    description: 'Гонки на скорость',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'airhockey',
    name: 'Air Hockey',
    icon: '🏒',
    description: 'Аэрохоккей',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    id: 'pool',
    name: 'Pool',
    icon: '🎱',
    description: 'Бильярд 1 на 1',
    color: 'from-emerald-500 to-teal-700',
  },
  {
    id: 'paper',
    name: 'Paper Duel',
    icon: '🔲',
    description: 'Захват территорий',
    color: 'from-cyan-500 to-sky-700',
  },
  {
    id: 'pingpong',
    name: 'Pong',
    icon: '🏓',
    description: 'Настольный теннис',
    color: 'from-yellow-500 to-amber-500',
  },
  {
    id: 'darts',
    name: 'Darts',
    icon: '🎯',
    description: 'Дартс на точность',
    color: 'from-pink-500 to-rose-500',
  },
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