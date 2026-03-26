import { Coins, Star, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const Header = () => {
  const { user, addStars, convertStarsToCoins } = useStore();

  const handleAddStars = () => {
    addStars(100);
  };

  const handleConvert = () => {
    if (user.stars >= 10) {
      convertStarsToCoins(10);
    } else {
      alert('Недостаточно звезд!');
    }
  };

  return (
    <header className="bg-card/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
      <div className="px-4 py-3 flex justify-between items-center">
        <div className="flex gap-3">
          {/* Stars */}
          <div className="flex items-center gap-1 bg-black/30 rounded-full px-3 py-1.5">
            <Star size={18} className="text-gold fill-gold" />
            <span className="text-white font-bold text-sm">{user.stars}</span>
            <button 
              onClick={handleAddStars}
              className="ml-1 bg-white/10 hover:bg-white/20 rounded-full p-0.5 transition"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
          
          {/* Coins */}
          <div className="flex items-center gap-1 bg-black/30 rounded-full px-3 py-1.5">
            <Coins size={18} className="text-accent" />
            <span className="text-white font-bold text-sm">{user.coins}</span>
          </div>
        </div>
        
        <button 
          onClick={handleConvert}
          className="bg-gradient-to-r from-accent to-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          Обменять ★
        </button>
      </div>
    </header>
  );
};