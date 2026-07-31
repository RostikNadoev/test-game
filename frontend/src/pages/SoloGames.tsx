import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { SOLO_GAMES, type SoloGame } from '../data/soloGames';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { tr } = useLanguage();

  return (
    <main className="app-scroll solo-page solo-page-v3 relative min-h-full overflow-y-auto overflow-x-hidden app-page pt-2">
      <section className="solo-games-v3-list page-reveal">
        {SOLO_GAMES.map((game, index) => (
          <button
            key={game.id}
            type="button"
            onClick={() => navigate(game.route)}
            className={`pressable solo-game-v3-card solo-card-${game.tone} ${game.isPlaceholder ? 'is-placeholder' : ''}`}
            style={{ '--solo-delay': `${index * 45}ms` } as CSSProperties}
            aria-label={`${tr('Open', 'Открыть')} ${game.title}`}
          >
            <SoloArtwork game={game} />

            <div className="solo-game-v3-title">
              <span className="solo-game-v3-icon" aria-hidden="true">{game.icon}</span>
              <div>
                <h2>{game.title}</h2>
                <p>
                  {game.id === 'fruit_cascade'
                      ? tr('Cascade slot', 'Каскадный слот')
                      : game.id === 'royal_5x5'
                        ? tr('Choose the safe path', 'Выбери безопасный путь')
                        : game.id === 'crystal_mines'
                          ? tr('Find crystals, avoid mines', 'Ищи кристаллы, избегай мин')
                          : game.id === 'royal_vault'
                            ? tr('Classic slot · 10 paylines', 'Классический слот · 10 линий')
                            : tr('Scratch and reveal prizes', 'Стирай и открывай призы')}
                </p>
              </div>
              <span className="solo-game-v3-arrow" aria-hidden="true">›</span>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
};
