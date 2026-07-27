export type SlingProjectileKind =
  | 'striker'
  | 'splitter'
  | 'nova'
  | 'crusher'
  | 'dropper';

export type SlingMaterial = 'wood' | 'glass' | 'stone' | 'charge';
export type SlingBiome = 'meadow' | 'sunset' | 'night';

export type SlingBlockSpec = {
  x: number;
  y: number;
  w: number;
  h: number;
  material: SlingMaterial;
  angle?: number;
};

export type SlingEnemySpec = {
  x: number;
  y: number;
  r?: number;
};

export type SlingSiegeLevel = {
  id: number;
  name: string;
  biome: SlingBiome;
  parShots: number;
  queue: SlingProjectileKind[];
  blocks: SlingBlockSpec[];
  enemies: SlingEnemySpec[];
};

export const SLING_SIEGE_LEVELS: SlingSiegeLevel[] = [
  {
    id: 1,
    name: 'FIRST CRACK',
    biome: 'meadow',
    parShots: 2,
    queue: ['striker', 'striker', 'splitter'],
    blocks: [
      { x: 650, y: 446, w: 34, h: 108, material: 'wood' },
      { x: 748, y: 446, w: 34, h: 108, material: 'wood' },
      { x: 699, y: 382, w: 148, h: 24, material: 'wood' },
      { x: 699, y: 482, w: 176, h: 20, material: 'glass' },
    ],
    enemies: [
      { x: 699, y: 350, r: 21 },
      { x: 835, y: 470, r: 21 },
    ],
  },
  {
    id: 2,
    name: 'GLASS BRIDGE',
    biome: 'meadow',
    parShots: 2,
    queue: ['splitter', 'striker', 'striker'],
    blocks: [
      { x: 598, y: 444, w: 30, h: 112, material: 'wood' },
      { x: 770, y: 444, w: 30, h: 112, material: 'wood' },
      { x: 684, y: 382, w: 204, h: 20, material: 'glass' },
      { x: 642, y: 344, w: 28, h: 62, material: 'glass' },
      { x: 726, y: 344, w: 28, h: 62, material: 'glass' },
      { x: 684, y: 304, w: 132, h: 20, material: 'wood' },
    ],
    enemies: [
      { x: 684, y: 272, r: 21 },
      { x: 684, y: 352, r: 20 },
    ],
  },
  {
    id: 3,
    name: 'STONE TEETH',
    biome: 'meadow',
    parShots: 3,
    queue: ['crusher', 'striker', 'splitter', 'striker'],
    blocks: [
      { x: 610, y: 452, w: 46, h: 96, material: 'stone' },
      { x: 720, y: 452, w: 46, h: 96, material: 'stone' },
      { x: 665, y: 392, w: 162, h: 22, material: 'wood' },
      { x: 665, y: 350, w: 28, h: 62, material: 'glass' },
      { x: 810, y: 455, w: 28, h: 90, material: 'glass' },
      { x: 872, y: 455, w: 28, h: 90, material: 'glass' },
      { x: 841, y: 400, w: 106, h: 20, material: 'wood' },
    ],
    enemies: [
      { x: 665, y: 318, r: 20 },
      { x: 841, y: 368, r: 20 },
    ],
  },
  {
    id: 4,
    name: 'CHAIN REACTION',
    biome: 'meadow',
    parShots: 2,
    queue: ['nova', 'striker', 'splitter'],
    blocks: [
      { x: 614, y: 452, w: 30, h: 96, material: 'wood' },
      { x: 730, y: 452, w: 30, h: 96, material: 'wood' },
      { x: 672, y: 394, w: 160, h: 20, material: 'glass' },
      { x: 672, y: 362, w: 30, h: 36, material: 'charge' },
      { x: 812, y: 452, w: 32, h: 96, material: 'wood' },
      { x: 900, y: 452, w: 32, h: 96, material: 'wood' },
      { x: 856, y: 394, w: 126, h: 20, material: 'wood' },
      { x: 856, y: 354, w: 26, h: 62, material: 'glass' },
    ],
    enemies: [
      { x: 620, y: 362, r: 20 },
      { x: 856, y: 322, r: 21 },
      { x: 930, y: 470, r: 19 },
    ],
  },
  {
    id: 5,
    name: 'TWIN KEEP',
    biome: 'sunset',
    parShots: 3,
    queue: ['dropper', 'striker', 'crusher', 'splitter'],
    blocks: [
      { x: 592, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 664, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 628, y: 388, w: 116, h: 22, material: 'stone' },
      { x: 628, y: 344, w: 26, h: 64, material: 'glass' },
      { x: 814, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 886, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 850, y: 388, w: 116, h: 22, material: 'stone' },
      { x: 850, y: 344, w: 26, h: 64, material: 'glass' },
      { x: 739, y: 470, w: 48, h: 56, material: 'charge' },
    ],
    enemies: [
      { x: 628, y: 312, r: 20 },
      { x: 850, y: 312, r: 20 },
      { x: 739, y: 430, r: 19 },
    ],
  },
  {
    id: 6,
    name: 'ROOF DROP',
    biome: 'sunset',
    parShots: 3,
    queue: ['dropper', 'nova', 'striker', 'crusher'],
    blocks: [
      { x: 626, y: 454, w: 34, h: 92, material: 'stone' },
      { x: 762, y: 454, w: 34, h: 92, material: 'stone' },
      { x: 694, y: 396, w: 184, h: 24, material: 'wood' },
      { x: 654, y: 350, w: 28, h: 70, material: 'glass' },
      { x: 734, y: 350, w: 28, h: 70, material: 'glass' },
      { x: 694, y: 304, w: 150, h: 22, material: 'stone' },
      { x: 694, y: 265, w: 34, h: 42, material: 'charge' },
      { x: 872, y: 456, w: 42, h: 88, material: 'wood' },
      { x: 930, y: 456, w: 42, h: 88, material: 'wood' },
      { x: 901, y: 402, w: 102, h: 18, material: 'glass' },
    ],
    enemies: [
      { x: 694, y: 364, r: 20 },
      { x: 694, y: 230, r: 19 },
      { x: 901, y: 370, r: 20 },
    ],
  },
  {
    id: 7,
    name: 'LOW FORT',
    biome: 'sunset',
    parShots: 3,
    queue: ['crusher', 'splitter', 'nova', 'striker'],
    blocks: [
      { x: 580, y: 462, w: 90, h: 76, material: 'stone' },
      { x: 684, y: 462, w: 90, h: 76, material: 'stone' },
      { x: 632, y: 408, w: 208, h: 24, material: 'wood' },
      { x: 632, y: 362, w: 30, h: 66, material: 'glass' },
      { x: 632, y: 318, w: 122, h: 20, material: 'wood' },
      { x: 820, y: 460, w: 30, h: 80, material: 'wood' },
      { x: 900, y: 460, w: 30, h: 80, material: 'wood' },
      { x: 860, y: 410, w: 126, h: 20, material: 'glass' },
      { x: 860, y: 374, w: 32, h: 40, material: 'charge' },
    ],
    enemies: [
      { x: 632, y: 286, r: 20 },
      { x: 580, y: 370, r: 20 },
      { x: 860, y: 340, r: 20 },
    ],
  },
  {
    id: 8,
    name: 'NIGHT SPIRES',
    biome: 'night',
    parShots: 4,
    queue: ['splitter', 'dropper', 'crusher', 'nova', 'striker'],
    blocks: [
      { x: 586, y: 450, w: 30, h: 100, material: 'glass' },
      { x: 650, y: 450, w: 30, h: 100, material: 'glass' },
      { x: 618, y: 390, w: 116, h: 20, material: 'stone' },
      { x: 618, y: 346, w: 28, h: 66, material: 'wood' },
      { x: 790, y: 438, w: 38, h: 124, material: 'stone' },
      { x: 856, y: 438, w: 38, h: 124, material: 'stone' },
      { x: 823, y: 366, w: 136, h: 22, material: 'wood' },
      { x: 823, y: 322, w: 28, h: 64, material: 'glass' },
      { x: 938, y: 464, w: 40, h: 72, material: 'charge' },
    ],
    enemies: [
      { x: 618, y: 314, r: 19 },
      { x: 823, y: 290, r: 20 },
      { x: 938, y: 410, r: 20 },
    ],
  },
  {
    id: 9,
    name: 'DOMINO CORE',
    biome: 'night',
    parShots: 3,
    queue: ['nova', 'splitter', 'striker', 'dropper'],
    blocks: [
      { x: 570, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 612, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 654, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 696, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 738, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 780, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 822, y: 454, w: 24, h: 92, material: 'wood' },
      { x: 696, y: 386, w: 292, h: 20, material: 'glass' },
      { x: 696, y: 346, w: 34, h: 44, material: 'charge' },
      { x: 900, y: 448, w: 40, h: 104, material: 'stone' },
      { x: 954, y: 448, w: 40, h: 104, material: 'stone' },
      { x: 927, y: 386, w: 104, h: 20, material: 'wood' },
    ],
    enemies: [
      { x: 612, y: 354, r: 19 },
      { x: 780, y: 354, r: 19 },
      { x: 927, y: 354, r: 20 },
    ],
  },
  {
    id: 10,
    name: 'FINAL CASTLE',
    biome: 'night',
    parShots: 4,
    queue: ['crusher', 'nova', 'dropper', 'splitter', 'striker'],
    blocks: [
      { x: 566, y: 452, w: 42, h: 96, material: 'stone' },
      { x: 638, y: 452, w: 42, h: 96, material: 'stone' },
      { x: 602, y: 392, w: 132, h: 22, material: 'wood' },
      { x: 602, y: 346, w: 28, h: 68, material: 'glass' },
      { x: 602, y: 302, w: 112, h: 20, material: 'stone' },
      { x: 758, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 844, y: 448, w: 34, h: 104, material: 'wood' },
      { x: 801, y: 386, w: 150, h: 22, material: 'stone' },
      { x: 801, y: 344, w: 30, h: 62, material: 'glass' },
      { x: 801, y: 304, w: 38, h: 42, material: 'charge' },
      { x: 930, y: 454, w: 34, h: 92, material: 'glass' },
      { x: 986, y: 454, w: 34, h: 92, material: 'glass' },
      { x: 958, y: 398, w: 106, h: 20, material: 'wood' },
      { x: 958, y: 360, w: 32, h: 40, material: 'charge' },
    ],
    enemies: [
      { x: 602, y: 270, r: 20 },
      { x: 801, y: 270, r: 21 },
      { x: 958, y: 326, r: 20 },
      { x: 715, y: 472, r: 19 },
    ],
  },
];
