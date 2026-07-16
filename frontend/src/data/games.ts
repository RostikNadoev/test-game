import plinkoCover from '../assets/home/plinko.webp';
import descentCover from '../assets/home/descent.webp';
import rpsCover from '../assets/home/rps.webp';
import blCover from '../assets/home/21.webp';
import paperCover from '../assets/home/paper.webp';
import diceCover from '../assets/home/dice.webp';
import towerCover from '../assets/home/tower.webp';
import marketCover from '../assets/home/market.webp';
import hockeyCover from '../assets/home/hockey.webp';
import raceCover from '../assets/home/race.webp';
import gridCover from '../assets/home/grid.webp';
import rouletteCover from '../assets/home/roulette.webp'

export type GameCode =
  | 'plinko_pvp'
  | 'descent_duel'
  | 'paper_io'
  | 'tower_stack'
  | 'crash_duel'
  | 'virus_market'
  | 'rps_duel'
  | 'grid_lock'
  | 'blackjack_duel'
  | 'dice_duel'
  | 'neon_matrix'
  | 'street_race'
  | 'penalty_pvp'
  | 'air_hockey'
  | 'dunk_shot'
  | 'stack_ball'
  | 'spiral_jump'
  | 'rail_grind';

export type GameCatalogItem = {
  code: GameCode;
  displayName: string;
  icon: string;
  description: string;
  color: string;
  meta: string;
  status?: string;
  playPath: string;
  coverUrl?: string;
  launchMode?: 'lobby' | 'direct';
};

export const GAME_CATALOG: GameCatalogItem[] = [
  {
    code: 'plinko_pvp',
    displayName: 'Plinko PvP',
    icon: '🔵',
    description: 'Шарик, пины и дуэль на удачу',
    color: 'from-[#52FFE5]/24 via-[#9D7CFF]/12 to-transparent',
    meta: 'Plinko',
    status: 'New',
    playPath: '/game/plinko_pvp/play',
    coverUrl: plinkoCover,
  },
  {
    code: 'descent_duel',
    displayName: 'Descent Duel',
    icon: '◼️',
    description: 'Кубы, лестница и физика на дистанцию',
    color: 'from-white/18 via-[#8A8A8A]/10 to-transparent',
    meta: 'Physics',
    status: 'New',
    playPath: '/game/descent_duel/play',
    coverUrl: descentCover,
  },
  {
    code: 'paper_io',
    displayName: 'Paper IO',
    icon: '🟩',
    description: 'Захватывай территорию и режь след соперника',
    color: 'from-[#54F2A8]/24 via-[#52FFE5]/12 to-transparent',
    meta: 'Territory',
    status: 'New',
    playPath: '/game/paper_io/play',
    coverUrl: paperCover,
  },
  {
    code: 'tower_stack',
    displayName: 'Tower Stack',
    icon: '🧱',
    description: 'Строй башню выше соперника',
    color: 'from-[#9D7CFF]/26 via-[#52FFE5]/12 to-transparent',
    meta: 'Stack',
    status: 'New',
    playPath: '/game/tower_stack/play',
    coverUrl: towerCover,
  },
  {
    code: 'grid_lock',
    displayName: 'Grid Lock',
    icon: '🧱',
    description: 'Дойди до края и блокируй соперника',
    color: 'from-[#9D7CFF]/24 via-[#FF7A90]/10 to-transparent',
    meta: 'Strategy',
    playPath: '/game/grid_lock/play',
    coverUrl: gridCover
  },
  {
    code: 'blackjack_duel',
    displayName: 'Blackjack Duel',
    icon: '🂡',
    description: '21 на 1v1',
    color: 'from-[#54F2A8]/22 via-[#52FFE5]/10 to-transparent',
    meta: 'Cards',
    playPath: '/game/blackjack_duel/play',
    coverUrl: blCover,
  },
  {
    code: 'dice_duel',
    displayName: 'Dice Duel',
    icon: '🎲',
    description: '3 кубика и риск-переброс',
    color: 'from-[#F2C766]/26 via-[#FF7A90]/10 to-transparent',
    meta: 'Risk',
    playPath: '/game/dice_duel/play',
    coverUrl: diceCover,
  },
  {
    code: 'neon_matrix',
    displayName: 'Neon Matrix',
    icon: '🔢',
    description: 'Выбери число ближе к финалу',
    color: 'from-[#52FFE5]/20 via-[#9D7CFF]/16 to-transparent',
    meta: 'Neon',
    status: 'Top',
    playPath: '/game/neon_matrix/play',
    coverUrl: rouletteCover
  },
  {
    code: 'street_race',
    displayName: 'Street Race',
    icon: '🏎️',
    description: 'Гонки на скорость',
    color: 'from-[#52FFE5]/18 via-[#9D7CFF]/10 to-transparent',
    meta: 'Race',
    playPath: '/game/street_race/play',
    coverUrl: raceCover,
  },
  {
    code: 'air_hockey',
    displayName: 'Air Hockey',
    icon: '🏒',
    description: 'Аэрохоккей 1v1',
    color: 'from-[#9D7CFF]/22 via-[#52FFE5]/8 to-transparent',
    meta: 'Arcade',
    playPath: '/game/air_hockey/play',
    coverUrl: hockeyCover,
  },
  {
    code: 'dunk_shot',
    displayName: 'Dunk Shot',
    icon: '🏀',
    description: 'Забрасывай мяч в кольца и собирай combo',
    color: 'from-[#52FFE5]/22 via-[#F2A65A]/14 to-transparent',
    meta: 'Arcade Preview',
    status: 'Soon',
    playPath: '/game/dunk_shot/play',
    launchMode: 'direct',
  },
  {
    code: 'stack_ball',
    displayName: 'Stack Ball',
    icon: '🔴',
    description: 'Пробивай платформы и набирай огненные серии',
    color: 'from-[#FF7A90]/24 via-[#9D7CFF]/12 to-transparent',
    meta: 'Arcade Preview',
    status: 'Soon',
    playPath: '/game/stack_ball/play',
    launchMode: 'direct',
  },
  {
    code: 'spiral_jump',
    displayName: 'Spiral Jump',
    icon: '🌀',
    description: 'Поднимайся по спирали точными прыжками',
    color: 'from-[#52FFE5]/22 via-[#F2C766]/12 to-transparent',
    meta: 'Arcade Preview',
    status: 'Soon',
    playPath: '/game/spiral_jump/play',
    launchMode: 'direct',
  },
  {
    code: 'rail_grind',
    displayName: 'Rail Grind',
    icon: '🛹',
    description: 'Прыжки, рельсы и серии идеальных трюков',
    color: 'from-[#9D7CFF]/24 via-[#52FFE5]/12 to-transparent',
    meta: 'Arcade Preview',
    status: 'Soon',
    playPath: '/game/rail_grind/play',
    launchMode: 'direct',
  },

];

export const FEATURED_GAME_CODES: GameCode[] = [
  'plinko_pvp',
  'descent_duel',
  'paper_io',
  'crash_duel',
  'neon_matrix',
];

export const GAME_TITLE_BY_PLAY_PATH = GAME_CATALOG.reduce<Record<string, string>>(
  (acc, game) => {
    acc[game.playPath] = game.displayName;
    return acc;
  },
  {},
);

export const LOCKED_GAME_ROUTES = new Set(GAME_CATALOG.map((game) => game.playPath));

export const getGameByCode = (code: string) =>
  GAME_CATALOG.find((game) => game.code === code);