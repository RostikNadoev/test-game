import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { SOLO_GAMES, type SoloGame } from '../data/soloGames';

const SoloArtwork = ({ game, variant = 'card' }: { game: SoloGame; variant?: 'hero' | 'card' }) => {
  return (
    <div
      className={[
        'solo-artwork-v3',
        variant === 'hero' ? 'solo-artwork-v3-hero' : 'solo-artwork-v3-card',
        `solo-card-${game.tone}`,
      ].join(' ')}
    >
      {game.imageSrc ? (
        <img src={game.imageSrc} alt={game.title} draggable={false} />
      ) : (
        <div className="solo-artwork-v3-placeholder" aria-hidden="true">
          <span>{game.icon}</span>
        </div>
      )}

      <div className="solo-artwork-v3-glass" />
    </div>
  );
};

export const SoloGames = () => {
  const navigate = useNavigate();
  const heroGame = SOLO_GAMES[0];

  return (
    <main className="app-scroll solo-page solo-page-v3 relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-2">
      <section className="solo-hero-v3 page-reveal">
        <SoloArtwork game={heroGame} variant="hero" />

        <div className="solo-hero-v3-count">
          <span>{SOLO_GAMES.length}</span>
          <small>игр</small>
        </div>
      </section>

      <section className="solo-games-v3-list page-reveal" style={{ animationDelay: '70ms' }}>
        {SOLO_GAMES.map((game, index) => (
          <button
            key={game.id}
            type="button"
            onClick={() => navigate(game.route)}
            className={`pressable solo-game-v3-card solo-card-${game.tone}`}
            style={{ '--solo-delay': `${index * 45}ms` } as CSSProperties}
            aria-label={`Open ${game.title}`}
          >
            <SoloArtwork game={game} />

            <div className="solo-game-v3-title">
              <h2>{game.title}</h2>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
};
