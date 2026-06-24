import { SOLO_GAME_BY_SLUG } from '../../data/soloGames';
import { SoloGameFrame } from './SoloGameFrame';

export const Royal5x5SoloGame = () => {
  return <SoloGameFrame game={SOLO_GAME_BY_SLUG['royal-5x5']} />;
};
