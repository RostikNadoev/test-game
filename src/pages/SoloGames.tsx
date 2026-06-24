import { type CSSProperties } from 'react';
import { ArrowRight, Crown, Flame, Sparkles, Star, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SOLO_GAMES, type SoloGame } from '../data/soloGames';

const getCardIcon = (game: SoloGame) => {
  if (game.tone === 'amber') return Crown;
  if (game.tone === 'ruby') return Flame;
  if (game.tone === 'violet') return Zap;
  return Star;
};

export const SoloGames = () => {
  const navigate = useNavigate();

  return (
    <main className="app-scroll solo-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-28 pt-4">
      <div className="solo-bg-orb solo-bg-orb-one" />
      <div className="solo-bg-orb solo-bg-orb-two" />

      <section className="solo-hero page-reveal">
        <div className="solo-hero-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="solo-kicker">
              Offline rewards
            </p>

            <h1 className="solo-title">
              Solo Games
            </h1>

            <p className="solo-subtitle">
              Быстрые игры против приложения: слоты, каскады, риск и апгрейды без ожидания соперника.
            </p>
          </div>

          <div className="solo-hero-icon">
            <Sparkles size={26} />
          </div>
        </div>

        <div className="solo-hero-bottom">
          <span className="solo-count-pill">
            {SOLO_GAMES.length} games
          </span>
          <span className="solo-live-pill">
            No opponent
          </span>
        </div>
      </section>

      <section className="solo-list-section page-reveal" style={{ animationDelay: '80ms' }}>
        <div className="solo-section-head">
          <div>
            <p className="solo-kicker solo-kicker-soft">
              Pick mode
            </p>
            <h2>
              Play instantly
            </h2>
          </div>

          <span>
            5 frames
          </span>
        </div>

        <div className="solo-games-list">
          {SOLO_GAMES.map((game, index) => {
            const Icon = getCardIcon(game);

            return (
              <button
                key={game.id}
                type="button"
                onClick={() => navigate(game.route)}
                className={`pressable solo-game-card solo-card-${game.tone}`}
                style={{ '--solo-delay': `${index * 55}ms` } as CSSProperties}
              >
                <div className="solo-game-visual">
                  <span className="solo-game-emoji">
                    {game.icon}
                  </span>
                  <Icon size={16} className="solo-game-mini-icon" />
                </div>

                <div className="min-w-0 flex-1 text-left">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3>
                      {game.title}
                    </h3>
                    <span className="solo-chip">
                      {game.badge}
                    </span>
                  </div>

                  <p className="solo-game-subtitle">
                    {game.subtitle}
                  </p>

                  <p className="solo-game-description">
                    {game.description}
                  </p>
                </div>

                <div className="solo-play-orb" aria-hidden="true">
                  <ArrowRight size={18} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
