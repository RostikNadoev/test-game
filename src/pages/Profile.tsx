import { useStore } from '../store/useStore';
import { Star, Coins, Trophy } from 'lucide-react';

export const Profile = () => {
  const user = useStore((state) => state.user);
  
  return (
    <div className="p-4 pb-20 min-h-screen">
      <div className="bg-gradient-to-r from-accent/20 to-purple-600/20 rounded-2xl p-6 text-center mb-6">
        <div className="w-24 h-24 bg-gradient-to-r from-accent to-purple-600 rounded-full mx-auto flex items-center justify-center text-4xl mb-3">
          🎮
        </div>
        <h2 className="text-white text-xl font-bold">Игрок</h2>
        <p className="text-gray-300 text-sm">ID: TG-1234</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card p-4 rounded-xl text-center">
          <Star className="text-gold mx-auto mb-2" size={24} />
          <p className="text-2xl font-bold text-white">{user.stars}</p>
          <p className="text-xs text-gray-400">Звезд</p>
        </div>
        <div className="bg-card p-4 rounded-xl text-center">
          <Coins className="text-accent mx-auto mb-2" size={24} />
          <p className="text-2xl font-bold text-white">{user.coins}</p>
          <p className="text-xs text-gray-400">Монет</p>
        </div>
      </div>
      
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-white font-bold mb-3">Статистика</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Побед</span>
            <span className="text-white font-bold">42</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Поражений</span>
            <span className="text-white font-bold">18</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Рейтинг</span>
            <span className="text-accent font-bold">1250</span>
          </div>
        </div>
      </div>
    </div>
  );
};