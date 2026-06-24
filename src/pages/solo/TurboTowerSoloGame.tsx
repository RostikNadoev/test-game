import { SOLO_GAME_BY_SLUG } from '../../data/soloGames';
import { SoloGameFrame } from './SoloGameFrame';

export const TurboTowerSoloGame = () => {
  return <SoloGameFrame game={SOLO_GAME_BY_SLUG['turbo-tower']} />;
};
