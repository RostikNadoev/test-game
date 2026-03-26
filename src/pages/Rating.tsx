import { Trophy, Medal } from 'lucide-react';

export const Rating = () => {
  const topPlayers = [
    { name: "AlexPro", rating: 2450, wins: 120 },
    { name: "TankMaster", rating: 2380, wins: 115 },
    { name: "Shadow", rating: 2310, wins: 108 },
  ];

  return (
    <div className="p-4 pb-20">
      <h1 className="text-2xl font-bold text-white mb-6">Рейтинг игроков</h1>
      
      <div className="space-y-3">
        {topPlayers.map((player, idx) => (
          <div key={idx} className="bg-card rounded-xl p-4 flex items-center gap-4">
            <div className="w-8 text-center">
              {idx === 0 && <Trophy size={24} className="text-yellow-500" />}
              {idx === 1 && <Medal size={24} className="text-gray-400" />}
              {idx === 2 && <Medal size={24} className="text-amber-600" />}
              {idx > 2 && <span className="text-gray-500 font-bold">{idx+1}</span>}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold">{player.name}</p>
              <p className="text-xs text-gray-400">{player.wins} побед</p>
            </div>
            <div className="text-right">
              <p className="text-accent font-bold">{player.rating}</p>
              <p className="text-[10px] text-gray-500">рейтинг</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};