import { type CSSProperties } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SOLO_GAMES, type SoloGame } from '../data/soloGames';

const SoloImageFrame = ({ game, size = 'card' }: { game?: SoloGame; size?: 'hero' | 'card' }) => {
  return (
    <div
      className={[
        'solo-image-frame',
        size === 'hero' ? 'solo-image-frame-hero' : 'solo-image-frame-card',
        game ? `solo-card-${game.tone}` : 'solo-card-cyan',
      ].join(' ')}
    >
      {game?.imageSrc ? (
        <img src={game.imageSrc} alt={game.title} draggable={false} />
      ) : (
        <div className="solo-image-placeholder" aria-hidden="true">
          <span>{game?.icon ?? '🎮'}</span>
        </div>
      )}

      <div className="solo-image-shine" />
    </div>
  );
};

export const SoloGames = () => {
  const navigate = useNavigate();
  const featuredGame = SOLO_GAMES[0];

  return (
    <main className="app-scroll solo-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-2">
      <section className="solo-hero-v2 page-reveal">
        <SoloImageFrame game={featuredGame} size="hero" />

        <div className="solo-hero-v2-meta">
          <div>
            <p>Solo zone</p>
            <h1>Solo Games</h1>
          </div>

          <span>
            {SOLO_GAMES.length}
          </span>
        </div>
      </section>

      <section className="solo-games-v2-list page-reveal" style={{ animationDelay: '70ms' }}>
        {SOLO_GAMES.map((game, index) => (
          <button
            key={game.id}
            type="button"
            onClick={() => navigate(game.route)}
            className={`pressable solo-game-v2-card solo-card-${game.tone}`}
            style={{ '--solo-delay': `${index * 45}ms` } as CSSProperties}
          >
            <SoloImageFrame game={game} />

            <div className="solo-game-v2-bottom">
              <div className="min-w-0">
                <h2>{game.title}</h2>
                <p>{game.tag}</p>
              </div>

              <span className="solo-game-v2-open" aria-hidden="true">
                <ArrowRight size={17} />
              </span>
            </div>
          </button>
        ))}
      </section>

      <div className="solo-bottom-note page-reveal" style={{ animationDelay: '150ms' }}>
        <Sparkles size={13} />
        <span>Instant play</span>
      </div>
    </main>
  );
};
