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
};

export const SOLO_GAMES: SoloGame[] = [
  {
    id: 'fruit_cascade',
    slug: 'fruit-cascade',
    title: 'Fruit Cascade',
    tag: 'Cascade slot',
    icon: '🍓',
    route: '/solo/fruit-cascade',
    tone: 'ruby',
  },
  {
    id: 'royal_5x5',
    slug: 'royal-5x5',
    title: 'Apple Trail',
    tag: 'Risk picks',
    icon: '🍎',
    route: '/solo/royal-5x5',
    tone: 'amber',
  },
  {
    id: 'crystal_mines',
    slug: 'crystal-mines',
    title: 'Crystal Mines',
    tag: 'Risk picks',
    icon: '💎',
    route: '/solo/crystal-mines',
    tone: 'cyan',
  },
  {
    id: 'turbo_tower',
    slug: 'turbo-tower',
    title: 'Turbo Tower',
    tag: 'Upgrade',
    icon: '⚡',
    route: '/solo/turbo-tower',
    tone: 'violet',
  },
  {
    id: 'neon_scratch',
    slug: 'neon-scratch',
    title: 'Neon Scratch',
    tag: 'Instant',
    icon: '🎟️',
    route: '/solo/neon-scratch',
    tone: 'lime',
  },
];

export const SOLO_GAME_BY_SLUG = SOLO_GAMES.reduce<Record<string, SoloGame>>((acc, game) => {
  acc[game.slug] = game;
  return acc;
}, {});
