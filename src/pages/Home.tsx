import { useNavigate } from 'react-router-dom';
import { GameCard } from '../components/GameCard';

const games = [
  { id: 'neondrift', name: 'Neon Drift', icon: '🏎️', description: 'Хардкорный дрифт', color: 'from-cyan-500 to-blue-600' },
  { id: 'archer', name: 'Neon Duel', icon: '🏹', description: 'Битва на копьях', color: 'from-orange-500 to-red-600' },
  { id: 'race', name: 'Street Race', icon: '🏎️', description: 'Гонки на скорость', color: 'from-blue-500 to-cyan-500' },
  { id: 'airhockey', name: 'Air Hockey', icon: '🏒', description: 'Аэрохоккей', color: 'from-indigo-500 to-purple-500' },
  { id: 'snake', name: 'Snake Duel', icon: '🐍', description: 'Классика на двоих', color: 'from-lime-500 to-green-500' },
  { id: 'pingpong', name: 'Pong', icon: '🏓', description: 'Настольный теннис', color: 'from-yellow-500 to-amber-500' },
];

export const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 pb-20">
      <div className="mb-8 px-2">
        <h1 className="text-3xl font-black text-white italic tracking-tighter">
          TWIN<span className="text-cyan-500">GAMES</span>
        </h1>
        <div className="flex items-center gap-2 mt-1">
           <div className="h-[2px] w-8 bg-cyan-500" />
           <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.3em]">Arena Leaderboards</p>
        </div>
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