import { SOLO_GAME_BY_SLUG } from '../../data/soloGames';
import { SoloGameFrame } from './SoloGameFrame';

export const CrystalMinesSoloGame = () => {
  return <SoloGameFrame game={SOLO_GAME_BY_SLUG['crystal-mines']} />;
};
