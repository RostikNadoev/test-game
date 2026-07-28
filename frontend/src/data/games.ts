import plinkoCover from '../assets/home/plinko.webp';
import descentCover from '../assets/home/descent.webp';
import paperCover from '../assets/home/paper.webp';
import towerCover from '../assets/home/tower.webp';
import gridCover from '../assets/home/grid.webp';
import rouletteCover from '../assets/home/roulette.webp';
import dunkCover from '../assets/home/dunk.webp';
import discCover from '../assets/home/disc.webp';
import doodleCover from '../assets/home/doodle.webp';
import flappyCover from '../assets/home/flappy.webp';
import crossyCover from '../assets/home/crossy.webp';
import coinCover from '../assets/home/coinchase.webp';
import cubeCover from '../assets/home/cubefill.webp';
import drawCover from '../assets/home/draw.webp';
import ballsCover from '../assets/home/balls.webp';

export type GameCode =
  | 'plinko_pvp'
  | 'descent_duel'
  | 'paper_io'
  | 'tower_stack'
  | 'crash_duel'
  | 'virus_market'
  | 'rps_duel'
  | 'grid_lock'
  | 'neon_matrix'
  | 'penalty_pvp'
  | 'air_hockey'
  | 'dunk_shot'
  | 'flappy_race'
  | 'disc_football'
  | 'doodle_jump'
  | 'crossy_pvp'
  | 'prism_cube'
  | 'coin_chase'
  | 'cube_fill'
  | 'ballz_duel'
  | 'draw_drop'
  | 'tilt_maze';

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
    coverUrl: gridCover,
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
    coverUrl: rouletteCover,
  },
  {
    code: 'dunk_shot',
    displayName: 'Dunk Shot',
    icon: '🏀',
    description: 'Набери больше очков за 45 секунд',
    color: 'from-[#52FFE5]/22 via-[#F2A65A]/14 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/dunk_shot/play',
    launchMode: 'lobby',
    coverUrl: dunkCover,
  },
  {
    code: 'flappy_race',
    displayName: 'Flappy Race',
    icon: '🐦',
    description: 'Пролетай ворота, собирай звёзды и держи серию',
    color: 'from-[#52FFE5]/24 via-[#4DA3FF]/14 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/flappy_race/play',
    launchMode: 'lobby',
    coverUrl: flappyCover,
  },
  {
    code: 'disc_football',
    displayName: 'Disc Football',
    icon: '⚽',
    description: 'Планируй удары фишками и забей два гола',
    color: 'from-[#52FFE5]/24 via-[#FF7A90]/14 to-transparent',
    meta: 'Tactical PvP',
    status: 'New',
    playPath: '/game/disc_football/play',
    launchMode: 'lobby',
    coverUrl: discCover,
  },
  {
    code: 'doodle_jump',
    displayName: 'Doodle PVP',
    icon: '🛸',
    description: 'Прыгай всё выше, лови пружины и не падай',
    color: 'from-[#9D7CFF]/24 via-[#52FFE5]/12 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/doodle_jump/play',
    launchMode: 'lobby',
    coverUrl: doodleCover,
  },
  {
    code: 'crossy_pvp',
    displayName: 'Crossy PVP',
    icon: '🌱',
    description: 'Переходи дороги, реки и рельсы как можно дальше',
    color: 'from-[#F7C85F]/24 via-[#54F2A8]/14 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/crossy_road/play',
    launchMode: 'lobby',
    coverUrl: crossyCover,
  },
  {
    code: 'coin_chase',
    displayName: 'Coin Chase',
    icon: '🟡',
    description: 'Собирай монеты, избегай монстров и обгони соперника за минуту',
    color: 'from-[#FFD64A]/26 via-[#9B7CFF]/14 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/coin_chase/play',
    launchMode: 'lobby',
    coverUrl: coinCover,
  },
  {
    code: 'cube_fill',
    displayName: 'Cube Fill',
    icon: '🧊',
    description: 'Закрась 4 случайные карты быстрее и эффективнее соперника',
    color: 'from-[#F5C94F]/24 via-[#7653EE]/16 to-transparent',
    meta: 'Puzzle PvP',
    status: 'New',
    playPath: '/game/cube_fill/play',
    launchMode: 'lobby',
    coverUrl: cubeCover,
  },
  {
    code: 'draw_drop',
    displayName: 'Draw n Drop',
    icon: '✏️',
    description: 'Нарисуй путь, пройди 5 физических карт и потрать меньше чернил',
    color: 'from-[#62D9FF]/24 via-[#62FFB0]/14 to-transparent',
    meta: 'Physics PvP',
    status: 'New',
    playPath: '/game/draw_drop/play',
    launchMode: 'lobby',
    coverUrl: drawCover,
  },
  {
    code: 'tilt_maze',
    displayName: 'Tilt Maze',
    icon: '⚙️',
    description: 'Найди выход и проведи металлический шар, вращая весь лабиринт',
    color: 'from-[#D8D0C1]/28 via-[#8F9A82]/14 to-transparent',
    meta: 'Physics PvP',
    status: 'New',
    playPath: '/game/tilt_maze/play',
    launchMode: 'lobby',
    coverUrl: gridCover,
  },
  {
    code: 'ballz_duel',
    displayName: 'Balls Duel',
    icon: '⚪',
    description: 'Разбей 2 случайных поля точными рикошетами за 90 секунд',
    color: 'from-[#56E3FF]/24 via-[#FFD64A]/14 to-transparent',
    meta: 'Arcade PvP',
    status: 'New',
    playPath: '/game/ballz_duel/play',
    launchMode: 'lobby',
    coverUrl: ballsCover,
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

export const LOCKED_GAME_ROUTES = new Set(
  GAME_CATALOG.map((game) => game.playPath),
);

export const getGameByCode = (code: string) =>
  GAME_CATALOG.find((game) => game.code === code);
