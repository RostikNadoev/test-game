import fruitCascadeCard from '../assets/solo/cards/fruit-cascade-card.webp';
import appleTrailCard from '../assets/solo/cards/apple-trail-card.webp';
import crystalMinesCard from '../assets/solo/cards/crystal-mines-card.webp';
import neonScratchCard from '../assets/solo/cards/neon-scratch-card.webp';
import royalVaultCard from '../assets/solo/cards/royal-vault-card.webp';

export type SoloGameTone = 'ruby' | 'cyan' | 'violet' | 'lime' | 'amber';

export type SoloGame = {
  id: string;
  slug: string;
  title: string;
  tag: string;
  icon: string;
  route: string;
  tone: SoloGameTone;
  imageSrc?: string;
  isPlaceholder?: boolean;
};

export const SOLO_GAMES: SoloGame[] = [
  {
    id: 'fruit_cascade',
    slug: 'fruit-cascade',
    title: 'Fruit Cascade',
    tag: 'Cascade slot',
    icon: '✦',
    route: '/solo/fruit-cascade',
    tone: 'ruby',
    imageSrc: fruitCascadeCard,
  },
  {
    id: 'crystal_mines',
    slug: 'crystal-mines',
    title: 'Crystal Mines',
    tag: 'Risk picks',
    icon: '◆',
    route: '/solo/crystal-mines',
    tone: 'cyan',
    imageSrc: crystalMinesCard,
  },
  {
    id: 'royal_5x5',
    slug: 'royal-5x5',
    title: 'Apple Trail',
    tag: 'Risk picks',
    icon: '●',
    route: '/solo/royal-5x5',
    tone: 'amber',
    imageSrc: appleTrailCard,
  },
  {
    id: 'neon_scratch',
    slug: 'neon-scratch',
    title: 'Lucky Scratch',
    tag: 'Instant',
    icon: '◇',
    route: '/solo/neon-scratch',
    tone: 'lime',
    imageSrc: neonScratchCard,
  },
  {
    id: 'royal_vault',
    slug: 'royal-vault',
    title: 'Royal Vault',
    tag: '10 paylines',
    icon: '♛',
    route: '/solo/royal-vault',
    tone: 'amber',
    imageSrc: royalVaultCard,
  },
];

export const SOLO_GAME_BY_SLUG = SOLO_GAMES.reduce<Record<string, SoloGame>>((acc, game) => {
  acc[game.slug] = game;
  return acc;
}, {});
