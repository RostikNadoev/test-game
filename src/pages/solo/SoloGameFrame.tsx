import { type SoloGame } from '../../data/soloGames';

export const SoloGameFrame = ({ game }: { game: SoloGame }) => {
  return (
    <main className={`solo-game-clean-page solo-card-${game.tone}`}>
      <section
        className="solo-game-clean-mount"
        aria-label={`${game.title} game screen`}
        data-game-id={game.id}
        data-game-slug={game.slug}
      />
    </main>
  );
};
