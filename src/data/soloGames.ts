export type SoloGameTone = 'ruby' | 'cyan' | 'violet' | 'lime' | 'amber';

export type SoloGame = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  route: string;
  badge: string;
  tone: SoloGameTone;
};

export const SOLO_GAMES: SoloGame[] = [
  {
    id: 'fruit_cascade',
    slug: 'fruit-cascade',
    title: 'Fruit Cascade',
    subtitle: 'Fruits, falls, explosions',
    description: 'Cascading solo slot with falling symbols, chains and juicy combo effects.',
    icon: '🍓',
    route: '/solo/fruit-cascade',
    badge: 'Cascade',
    tone: 'ruby',
  },
  {
    id: 'royal_5x5',
    slug: 'royal-5x5',
    title: 'Royal 5x5',
    subtitle: 'Classic reels, more lines',
    description: 'Five by five slot frame for paylines, free spins and bright casino effects.',
    icon: '👑',
    route: '/solo/royal-5x5',
    badge: '5 x 5',
    tone: 'amber',
  },
  {
    id: 'crystal_mines',
    slug: 'crystal-mines',
    title: 'Crystal Mines',
    subtitle: 'Risk picks and multipliers',
    description: 'Open cells, collect crystals and stop before the mine hits your run.',
    icon: '💎',
    route: '/solo/crystal-mines',
    badge: 'Risk',
    tone: 'cyan',
  },
  {
    id: 'turbo_tower',
    slug: 'turbo-tower',
    title: 'Turbo Tower',
    subtitle: 'Build higher, cash out',
    description: 'Fast solo upgrade mode where every floor pushes the reward higher.',
    icon: '⚡',
    route: '/solo/turbo-tower',
    badge: 'Upgrade',
    tone: 'violet',
  },
  {
    id: 'neon_scratch',
    slug: 'neon-scratch',
    title: 'Neon Scratch',
    subtitle: 'Open cards, catch prizes',
    description: 'Instant scratch-card style game with quick reveals and clean mobile pacing.',
    icon: '🎟️',
    route: '/solo/neon-scratch',
    badge: 'Instant',
    tone: 'lime',
  },
];

export const SOLO_GAME_BY_SLUG = SOLO_GAMES.reduce<Record<string, SoloGame>>((acc, game) => {
  acc[game.slug] = game;
  return acc;
}, {});
