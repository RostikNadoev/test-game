import { motion } from 'framer-motion';

// Определяем тип Game прямо здесь
interface Game {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

interface Props {
  game: Game;
  onClick: () => void;
}

export const GameCard = ({ game, onClick }: Props) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl aspect-square bg-gradient-to-br from-card to-dark border border-white/10 shadow-xl"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${game.color} opacity-20`} />
      <div className="relative p-4 h-full flex flex-col justify-between">
        <div className="text-5xl">{game.icon}</div>
        <div className="text-left">
          <h3 className="text-white font-bold text-lg">{game.name}</h3>
          <p className="text-gray-400 text-xs mt-1">{game.description}</p>
        </div>
      </div>
    </motion.button>
  );
};