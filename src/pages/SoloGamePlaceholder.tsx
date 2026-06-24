import { ArrowLeft, Construction, Sparkles } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { SOLO_GAME_BY_SLUG } from '../data/soloGames';

export const SoloGamePlaceholder = () => {
  const navigate = useNavigate();
  const { gameSlug } = useParams<{ gameSlug: string }>();
  const game = gameSlug ? SOLO_GAME_BY_SLUG[gameSlug] : null;

  if (!game) {
    return <Navigate to="/solo" replace />;
  }

  return (
    <main className="app-scroll solo-page solo-game-page relative min-h-full overflow-y-auto overflow-x-hidden px-4 pb-10 pt-4">
      <div className="solo-bg-orb solo-bg-orb-one" />
      <div className="solo-bg-orb solo-bg-orb-two" />

      <button
        type="button"
        onClick={() => navigate('/solo')}
        className="pressable solo-back-button"
      >
        <ArrowLeft size={16} />
        <span>Solo list</span>
      </button>

      <section className={`solo-empty-game-card solo-card-${game.tone} page-reveal`}>
        <div className="solo-empty-glow" />

        <div className="solo-empty-icon">
          <span>{game.icon}</span>
          <Sparkles size={18} />
        </div>

        <p className="solo-kicker solo-kicker-soft">
          Solo game frame
        </p>

        <h1>
          {game.title}
        </h1>

        <p className="solo-empty-text">
          Страница уже подключена к роутеру и открывается по пути <b>{game.route}</b>. Сюда потом вставишь саму механику игры, а стиль уже совпадает с solo-разделом.
        </p>

        <div className="solo-empty-state">
          <Construction size={18} />
          <span>Game component coming soon</span>
        </div>
      </section>
    </main>
  );
};
