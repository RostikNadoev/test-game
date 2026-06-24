import { ArrowLeft, ImagePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type SoloGame } from '../../data/soloGames';

export const SoloGameFrame = ({ game }: { game: SoloGame }) => {
  const navigate = useNavigate();

  return (
    <main className="app-scroll solo-page solo-game-page-v2 relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-10 pt-2">
      <button
        type="button"
        onClick={() => navigate('/solo')}
        className="pressable solo-back-v2"
      >
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>

      <section className={`solo-game-stage solo-card-${game.tone}`}>
        {game.imageSrc ? (
          <img src={game.imageSrc} alt={game.title} draggable={false} />
        ) : (
          <div className="solo-game-stage-empty" aria-hidden="true">
            <span>{game.icon}</span>
            <ImagePlus size={22} />
          </div>
        )}

        <div className="solo-game-stage-overlay">
          <p>{game.tag}</p>
          <h1>{game.title}</h1>
        </div>
      </section>

      <section className="solo-game-workspace">
        <div className="solo-game-workspace-dash" />
        <p>Game page is ready</p>
      </section>
    </main>
  );
};
