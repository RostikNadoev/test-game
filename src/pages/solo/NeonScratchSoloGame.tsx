import { SOLO_GAME_BY_SLUG } from '../../data/soloGames';
import { SoloGameFrame } from './SoloGameFrame';

export const NeonScratchSoloGame = () => {
  return <SoloGameFrame game={SOLO_GAME_BY_SLUG['neon-scratch']} />;
};
