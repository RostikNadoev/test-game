import { SOLO_GAME_BY_SLUG } from '../../data/soloGames';
import { SoloGameFrame } from './SoloGameFrame';

export const FruitCascadeSoloGame = () => {
  return <SoloGameFrame game={SOLO_GAME_BY_SLUG['fruit-cascade']} />;
};
