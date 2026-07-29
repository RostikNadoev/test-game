export type DrawDropRectObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
};

export type DrawDropCupMount = 'floor' | 'left-wall' | 'right-wall' | 'shelf';

export type DrawDropCupSpec = {
  x: number;
  y: number;
  angle?: number;
  width?: number;
  height?: number;
  mount?: DrawDropCupMount;
  captureHold?: number;
  captureSpeed?: number;
};

export type DrawDropBallSpec = {
  x: number;
  y: number;
  r?: number;
};

export type DrawDropLevelSpec = {
  id: number;
  name: string;
  parInk: number;
  ball: DrawDropBallSpec;
  cup: DrawDropCupSpec;
  obstacles: DrawDropRectObstacle[];
};

const HALF_PI = Math.PI / 2;

export const DRAW_DROP_LEVELS: DrawDropLevelSpec[] = [
  {
    id: 1,
    name: "FIRST DROP",
    parInk: 148,
    ball: { x: 92, y: 71, r: 15 },
    cup: { x: 296, y: 518, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 202, y: 370, w: 116, h: 14, angle: -0.08 },
    ],
  },
  {
    id: 2,
    name: "BACKBOARD",
    parInk: 180,
    ball: { x: 300, y: 74, r: 15 },
    cup: { x: 94, y: 516, width: 116, height: 76, angle: -0.035 },
    obstacles: [
      { x: 236, y: 242, w: 92, h: 14, angle: -0.11 },
      { x: 146, y: 386, w: 102, h: 14, angle: 0.07 },
    ],
  },
  {
    id: 3,
    name: "CENTER PILLAR",
    parInk: 202,
    ball: { x: 90, y: 68, r: 15 },
    cup: { x: 298, y: 514, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 195, y: 390, w: 26, h: 124 },
      { x: 132, y: 278, w: 82, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 4,
    name: "WINDOW DROP",
    parInk: 202,
    ball: { x: 88, y: 71, r: 15 },
    cup: { x: 302, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 194, y: 274, w: 24, h: 104 },
      { x: 194, y: 468, w: 24, h: 84 },
    ],
  },
  {
    id: 5,
    name: "TWIN POSTS",
    parInk: 206,
    ball: { x: 102, y: 74, r: 15 },
    cup: { x: 292, y: 518, width: 116, height: 76, angle: 0.035 },
    obstacles: [
      { x: 148, y: 394, w: 24, h: 92 },
      { x: 238, y: 394, w: 24, h: 92 },
    ],
  },
  {
    id: 6,
    name: "LOW ISLAND",
    parInk: 192,
    ball: { x: 298, y: 68, r: 15 },
    cup: { x: 96, y: 516, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 194, y: 430, w: 86, h: 44 },
    ],
  },
  {
    id: 7,
    name: "FUNNEL",
    parInk: 214,
    ball: { x: 100, y: 71, r: 15 },
    cup: { x: 290, y: 514, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 143, y: 386, w: 106, h: 14, angle: 0.14 },
      { x: 195, y: 304, w: 28, h: 52 },
    ],
  },
  {
    id: 8,
    name: "SPLIT SHELF",
    parInk: 210,
    ball: { x: 290, y: 74, r: 15 },
    cup: { x: 104, y: 520, width: 116, height: 76 },
    obstacles: [
      { x: 84, y: 350, w: 122, h: 16 },
      { x: 306, y: 350, w: 122, h: 16 },
    ],
  },
  {
    id: 9,
    name: "CROSS BAR",
    parInk: 222,
    ball: { x: 100, y: 68, r: 15 },
    cup: { x: 292, y: 518, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 194, y: 368, w: 20, h: 94 },
      { x: 112, y: 280, w: 64, h: 14, angle: 0.1 },
    ],
  },
  {
    id: 10,
    name: "SOFT BOWL",
    parInk: 220,
    ball: { x: 292, y: 71, r: 15 },
    cup: { x: 98, y: 516, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 114, y: 398, w: 84, h: 14, angle: 0.13 },
      { x: 274, y: 398, w: 84, h: 14, angle: -0.13 },
    ],
  },
  {
    id: 11,
    name: "ZIG ZAG",
    parInk: 230,
    ball: { x: 92, y: 74, r: 15 },
    cup: { x: 300, y: 514, width: 116, height: 76, angle: 0.055 },
    obstacles: [
      { x: 118, y: 246, w: 86, h: 14, angle: 0.08 },
      { x: 132, y: 420, w: 86, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 12,
    name: "ROLL IN",
    parInk: 222,
    ball: { x: 304, y: 68, r: 15 },
    cup: { x: 72, y: 500, width: 104, height: 72, angle: HALF_PI, mount: "floor", captureHold: 0.13, captureSpeed: 360 },
    obstacles: [
      { x: 274, y: 304, w: 112, h: 14, angle: -0.08 },
      { x: 178, y: 426, w: 100, h: 14, angle: -0.06 },
    ],
  },
  {
    id: 13,
    name: "NARROW GATE",
    parInk: 224,
    ball: { x: 92, y: 71, r: 15 },
    cup: { x: 298, y: 518, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 104, y: 356, w: 122, h: 16 },
      { x: 286, y: 356, w: 122, h: 16 },
    ],
  },
  {
    id: 14,
    name: "DOUBLE GATE",
    parInk: 222,
    ball: { x: 300, y: 74, r: 15 },
    cup: { x: 90, y: 516, width: 116, height: 76, angle: -0.035 },
    obstacles: [
      { x: 88, y: 330, w: 108, h: 14 },
      { x: 302, y: 330, w: 108, h: 14 },
    ],
  },
  {
    id: 15,
    name: "TILTED ROOF",
    parInk: 240,
    ball: { x: 96, y: 68, r: 15 },
    cup: { x: 292, y: 514, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 200, y: 300, w: 172, h: 16, angle: -0.09 },
      { x: 278, y: 408, w: 82, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 16,
    name: "V CHANNEL",
    parInk: 216,
    ball: { x: 106, y: 71, r: 15 },
    cup: { x: 286, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 142, y: 340, w: 116, h: 14, angle: 0.18 },
      { x: 248, y: 340, w: 116, h: 14, angle: -0.18 },
    ],
  },
  {
    id: 17,
    name: "W CHANNEL",
    parInk: 234,
    ball: { x: 294, y: 74, r: 15 },
    cup: { x: 96, y: 518, width: 116, height: 76, angle: 0.035 },
    obstacles: [
      { x: 78, y: 374, w: 86, h: 14, angle: 0.14 },
      { x: 312, y: 374, w: 86, h: 14, angle: -0.14 },
    ],
  },
  {
    id: 18,
    name: "U POCKET",
    parInk: 226,
    ball: { x: 94, y: 68, r: 15 },
    cup: { x: 296, y: 516, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 142, y: 410, w: 22, h: 110 },
      { x: 248, y: 410, w: 22, h: 110 },
    ],
  },
  {
    id: 19,
    name: "SLALOM",
    parInk: 238,
    ball: { x: 302, y: 71, r: 15 },
    cup: { x: 88, y: 514, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 284, y: 256, w: 94, h: 14, angle: -0.07 },
      { x: 118, y: 330, w: 94, h: 14, angle: 0.07 },
    ],
  },
  {
    id: 20,
    name: "NEEDLE",
    parInk: 248,
    ball: { x: 94, y: 74, r: 15 },
    cup: { x: 294, y: 520, width: 116, height: 76 },
    obstacles: [
      { x: 112, y: 376, w: 142, h: 16 },
      { x: 195, y: 286, w: 26, h: 86 },
    ],
  },
  {
    id: 21,
    name: "BALCONY",
    parInk: 218,
    ball: { x: 102, y: 68, r: 15 },
    cup: { x: 290, y: 518, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 118, y: 304, w: 126, h: 16 },
      { x: 282, y: 330, w: 22, h: 92 },
    ],
  },
  {
    id: 22,
    name: "OVERHANG",
    parInk: 234,
    ball: { x: 300, y: 71, r: 15 },
    cup: { x: 92, y: 516, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 248, y: 300, w: 166, h: 16 },
      { x: 300, y: 384, w: 22, h: 120 },
    ],
  },
  {
    id: 23,
    name: "BRIDGE GAP",
    parInk: 226,
    ball: { x: 96, y: 74, r: 15 },
    cup: { x: 294, y: 514, width: 116, height: 76, angle: 0.055 },
    obstacles: [
      { x: 86, y: 348, w: 124, h: 16 },
      { x: 304, y: 348, w: 124, h: 16 },
    ],
  },
  {
    id: 24,
    name: "SIDE ROLL",
    parInk: 224,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 318, y: 500, width: 104, height: 72, angle: -HALF_PI, mount: "floor", captureHold: 0.13, captureSpeed: 360 },
    obstacles: [
      { x: 128, y: 302, w: 108, h: 14, angle: 0.08 },
      { x: 222, y: 424, w: 96, h: 14, angle: 0.06 },
    ],
  },
  {
    id: 25,
    name: "LONG TUNNEL",
    parInk: 272,
    ball: { x: 100, y: 71, r: 15 },
    cup: { x: 292, y: 518, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 196, y: 288, w: 232, h: 14 },
      { x: 344, y: 420, w: 22, h: 104 },
    ],
  },
  {
    id: 26,
    name: "ELBOW",
    parInk: 258,
    ball: { x: 298, y: 74, r: 15 },
    cup: { x: 92, y: 516, width: 116, height: 76, angle: -0.035 },
    obstacles: [
      { x: 254, y: 282, w: 154, h: 14 },
      { x: 230, y: 438, w: 126, h: 14 },
    ],
  },
  {
    id: 27,
    name: "S CURVE",
    parInk: 278,
    ball: { x: 92, y: 68, r: 15 },
    cup: { x: 300, y: 514, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 112, y: 276, w: 132, h: 14 },
      { x: 274, y: 346, w: 132, h: 14 },
    ],
  },
  {
    id: 28,
    name: "FORK",
    parInk: 254,
    ball: { x: 104, y: 71, r: 15 },
    cup: { x: 286, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 195, y: 290, w: 22, h: 108 },
      { x: 262, y: 382, w: 112, h: 14, angle: 0.12 },
    ],
  },
  {
    id: 29,
    name: "DOUBLE FUNNEL",
    parInk: 258,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 88, y: 518, width: 116, height: 76, angle: 0.035 },
    obstacles: [
      { x: 112, y: 306, w: 92, h: 14, angle: 0.15 },
      { x: 278, y: 382, w: 92, h: 14, angle: -0.15 },
    ],
  },
  {
    id: 30,
    name: "CENTER ISLAND",
    parInk: 238,
    ball: { x: 98, y: 68, r: 15 },
    cup: { x: 292, y: 516, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 195, y: 360, w: 98, h: 82 },
      { x: 288, y: 454, w: 80, h: 14, angle: -0.05 },
    ],
  },
  {
    id: 31,
    name: "WALL POCKET",
    parInk: 232,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 340, y: 426, width: 102, height: 72, angle: -HALF_PI, mount: "right-wall", captureHold: 0.12, captureSpeed: 380 },
    obstacles: [
      { x: 184, y: 324, w: 126, h: 14, angle: -0.08 },
    ],
  },
  {
    id: 32,
    name: "TEETH",
    parInk: 256,
    ball: { x: 94, y: 74, r: 15 },
    cup: { x: 300, y: 520, width: 116, height: 76 },
    obstacles: [
      { x: 102, y: 330, w: 22, h: 90 },
      { x: 278, y: 360, w: 22, h: 92 },
    ],
  },
  {
    id: 33,
    name: "PINBALL BOXES",
    parInk: 222,
    ball: { x: 300, y: 68, r: 15 },
    cup: { x: 92, y: 518, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 120, y: 280, w: 34, h: 34 },
      { x: 288, y: 452, w: 30, h: 30 },
    ],
  },
  {
    id: 34,
    name: "DIAGONAL WALL",
    parInk: 274,
    ball: { x: 96, y: 71, r: 15 },
    cup: { x: 296, y: 516, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 198, y: 354, w: 230, h: 18, angle: -0.16 },
      { x: 92, y: 438, w: 76, h: 14, angle: 0.07 },
    ],
  },
  {
    id: 35,
    name: "VERTICAL CANYON",
    parInk: 274,
    ball: { x: 300, y: 74, r: 15 },
    cup: { x: 90, y: 514, width: 116, height: 76, angle: 0.055 },
    obstacles: [
      { x: 150, y: 350, w: 22, h: 228 },
      { x: 240, y: 350, w: 22, h: 228 },
    ],
  },
  {
    id: 36,
    name: "OFFSET GATE",
    parInk: 246,
    ball: { x: 98, y: 68, r: 15 },
    cup: { x: 294, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 88, y: 356, w: 126, h: 16 },
      { x: 300, y: 430, w: 96, h: 14, angle: -0.06 },
    ],
  },
  {
    id: 37,
    name: "HOURGLASS",
    parInk: 282,
    ball: { x: 302, y: 71, r: 15 },
    cup: { x: 88, y: 518, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 138, y: 316, w: 116, h: 14, angle: 0.18 },
      { x: 252, y: 316, w: 116, h: 14, angle: -0.18 },
      { x: 252, y: 414, w: 116, h: 14, angle: 0.18 },
    ],
  },
  {
    id: 38,
    name: "DOUBLE WINDOW",
    parInk: 264,
    ball: { x: 94, y: 74, r: 15 },
    cup: { x: 300, y: 516, width: 116, height: 76, angle: -0.035 },
    obstacles: [
      { x: 144, y: 300, w: 22, h: 100 },
      { x: 225, y: 448, w: 22, h: 58 },
    ],
  },
  {
    id: 39,
    name: "ASYM TOWER",
    parInk: 250,
    ball: { x: 300, y: 68, r: 15 },
    cup: { x: 92, y: 514, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 146, y: 414, w: 22, h: 110 },
      { x: 274, y: 316, w: 22, h: 126 },
    ],
  },
  {
    id: 40,
    name: "SPIRAL STEP",
    parInk: 274,
    ball: { x: 96, y: 71, r: 15 },
    cup: { x: 296, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 122, y: 280, w: 108, h: 14 },
      { x: 264, y: 438, w: 108, h: 14 },
    ],
  },
  {
    id: 41,
    name: "SNAKE",
    parInk: 272,
    ball: { x: 300, y: 74, r: 15 },
    cup: { x: 92, y: 518, width: 116, height: 76, angle: 0.035 },
    obstacles: [
      { x: 116, y: 270, w: 146, h: 14 },
      { x: 274, y: 462, w: 146, h: 14 },
    ],
  },
  {
    id: 42,
    name: "CASTLE SLOT",
    parInk: 256,
    ball: { x: 96, y: 68, r: 15 },
    cup: { x: 294, y: 516, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 94, y: 394, w: 24, h: 124 },
      { x: 296, y: 394, w: 24, h: 124 },
    ],
  },
  {
    id: 43,
    name: "TRIDENT",
    parInk: 278,
    ball: { x: 302, y: 71, r: 15 },
    cup: { x: 90, y: 514, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 112, y: 380, w: 20, h: 146 },
      { x: 278, y: 380, w: 20, h: 146 },
    ],
  },
  {
    id: 44,
    name: "LEFT WALL",
    parInk: 236,
    ball: { x: 302, y: 70, r: 15 },
    cup: { x: 50, y: 426, width: 102, height: 72, angle: HALF_PI, mount: "left-wall", captureHold: 0.12, captureSpeed: 380 },
    obstacles: [
      { x: 220, y: 314, w: 122, h: 14, angle: 0.08 },
      { x: 130, y: 430, w: 84, h: 14, angle: 0.04 },
    ],
  },
  {
    id: 45,
    name: "FLOATING ROOF",
    parInk: 250,
    ball: { x: 300, y: 68, r: 15 },
    cup: { x: 94, y: 518, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 195, y: 280, w: 206, h: 16 },
      { x: 284, y: 396, w: 72, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 46,
    name: "CRADLE",
    parInk: 250,
    ball: { x: 96, y: 71, r: 15 },
    cup: { x: 296, y: 516, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 118, y: 416, w: 22, h: 114 },
      { x: 272, y: 416, w: 22, h: 114 },
    ],
  },
  {
    id: 47,
    name: "CHIMNEY",
    parInk: 272,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 88, y: 514, width: 116, height: 76, angle: 0.055 },
    obstacles: [
      { x: 164, y: 350, w: 18, h: 216 },
      { x: 226, y: 350, w: 18, h: 216 },
    ],
  },
  {
    id: 48,
    name: "DOUBLE DECK",
    parInk: 266,
    ball: { x: 94, y: 68, r: 15 },
    cup: { x: 300, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 118, y: 304, w: 136, h: 16 },
      { x: 254, y: 424, w: 136, h: 16 },
    ],
  },
  {
    id: 49,
    name: "STAIR CANYON",
    parInk: 276,
    ball: { x: 304, y: 71, r: 15 },
    cup: { x: 86, y: 518, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 298, y: 274, w: 84, h: 14 },
      { x: 154, y: 454, w: 84, h: 14 },
    ],
  },
  {
    id: 50,
    name: "FINAL MAZE",
    parInk: 292,
    ball: { x: 98, y: 74, r: 15 },
    cup: { x: 292, y: 516, width: 116, height: 76, angle: -0.035 },
    obstacles: [
      { x: 112, y: 270, w: 128, h: 14 },
      { x: 282, y: 438, w: 128, h: 14 },
      { x: 195, y: 350, w: 20, h: 92 },
    ],
  },
  {
    id: 51,
    name: "BROKEN W",
    parInk: 269,
    ball: { x: 96, y: 74, r: 15 },
    cup: { x: 294, y: 518, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 312, y: 371, w: 86, h: 14, angle: -0.14 },
      { x: 78, y: 371, w: 86, h: 14, angle: 0.14 },
    ],
  },
  {
    id: 52,
    name: "OFF-CENTER PILLAR",
    parInk: 222,
    ball: { x: 300, y: 70, r: 15 },
    cup: { x: 92, y: 516, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 195, y: 390, w: 26, h: 124 },
      { x: 258, y: 278, w: 82, h: 14, angle: -0.08 },
    ],
  },
  {
    id: 53,
    name: "WIDE FORK",
    parInk: 271,
    ball: { x: 286, y: 74, r: 15 },
    cup: { x: 104, y: 514, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 195, y: 293, w: 22, h: 108 },
      { x: 128, y: 385, w: 112, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 54,
    name: "LONG SNAKE",
    parInk: 294,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 298, y: 518, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 274, y: 276, w: 146, h: 14 },
      { x: 116, y: 468, w: 146, h: 14 },
    ],
  },
  {
    id: 55,
    name: "SHIFTED CROSS",
    parInk: 257,
    ball: { x: 290, y: 74, r: 15 },
    cup: { x: 98, y: 516, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 196, y: 362, w: 20, h: 94 },
      { x: 278, y: 274, w: 64, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 56,
    name: "HIGH SHELF",
    parInk: 234,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 296, y: 514, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 196, y: 323, w: 160, h: 16 },
      { x: 112, y: 427, w: 68, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 57,
    name: "LOW ROLL",
    parInk: 238,
    ball: { x: 300, y: 70, r: 15 },
    cup: { x: 74, y: 502, width: 104, height: 72, angle: HALF_PI, mount: "floor", captureHold: 0.13, captureSpeed: 370 },
    obstacles: [
      { x: 250, y: 330, w: 118, h: 14, angle: -0.1 },
      { x: 154, y: 438, w: 92, h: 14, angle: -0.04 },
    ],
  },
  {
    id: 58,
    name: "DESCENDING STEPS",
    parInk: 258,
    ball: { x: 86, y: 70, r: 15 },
    cup: { x: 304, y: 516, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 104, y: 261, w: 86, h: 14, angle: 0.03 },
      { x: 240, y: 435, w: 86, h: 14, angle: 0.03 },
    ],
  },
  {
    id: 59,
    name: "TALL CHIMNEY",
    parInk: 299,
    ball: { x: 88, y: 74, r: 15 },
    cup: { x: 302, y: 514, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 226, y: 356, w: 18, h: 216 },
      { x: 164, y: 356, w: 18, h: 216 },
    ],
  },
  {
    id: 60,
    name: "REVERSE KICK",
    parInk: 194,
    ball: { x: 298, y: 70, r: 15 },
    cup: { x: 94, y: 518, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 234, y: 244, w: 96, h: 14, angle: -0.12 },
      { x: 140, y: 376, w: 92, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 61,
    name: "RIGHT POCKET",
    parInk: 249,
    ball: { x: 88, y: 74, r: 15 },
    cup: { x: 296, y: 516, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 306, y: 393, w: 22, h: 124 },
      { x: 126, y: 297, w: 94, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 62,
    name: "STAGGERED GATES",
    parInk: 252,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 300, y: 514, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 302, y: 330, w: 108, h: 14 },
      { x: 88, y: 330, w: 108, h: 14 },
    ],
  },
  {
    id: 63,
    name: "CROSS RAMPS",
    parInk: 255,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 94, y: 518, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 272, y: 301, w: 102, h: 14, angle: -0.12 },
      { x: 118, y: 417, w: 102, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 64,
    name: "HIGH ISLAND",
    parInk: 226,
    ball: { x: 92, y: 70, r: 15 },
    cup: { x: 294, y: 516, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 196, y: 436, w: 86, h: 44 },
      { x: 130, y: 312, w: 78, h: 14, angle: 0.09 },
    ],
  },
  {
    id: 65,
    name: "LEANING TOWER",
    parInk: 267,
    ball: { x: 90, y: 74, r: 15 },
    cup: { x: 298, y: 514, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 244, y: 408, w: 22, h: 110 },
      { x: 116, y: 310, w: 22, h: 126 },
    ],
  },
  {
    id: 66,
    name: "DOUBLE BALCONY",
    parInk: 240,
    ball: { x: 288, y: 70, r: 15 },
    cup: { x: 100, y: 518, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 272, y: 301, w: 126, h: 16 },
      { x: 108, y: 327, w: 22, h: 92 },
    ],
  },
  {
    id: 67,
    name: "REVERSE STAIRS",
    parInk: 317,
    ball: { x: 86, y: 74, r: 15 },
    cup: { x: 304, y: 516, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 92, y: 274, w: 84, h: 14 },
      { x: 140, y: 334, w: 84, h: 14 },
      { x: 236, y: 454, w: 84, h: 14 },
    ],
  },
  {
    id: 68,
    name: "REVERSE ZIG",
    parInk: 250,
    ball: { x: 298, y: 70, r: 15 },
    cup: { x: 90, y: 514, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 272, y: 249, w: 86, h: 14, angle: -0.08 },
      { x: 258, y: 423, w: 86, h: 14, angle: -0.08 },
    ],
  },
  {
    id: 69,
    name: "BOX FIELD",
    parInk: 239,
    ball: { x: 90, y: 74, r: 15 },
    cup: { x: 298, y: 518, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 270, y: 286, w: 34, h: 34 },
      { x: 102, y: 458, w: 30, h: 30 },
    ],
  },
  {
    id: 70,
    name: "RIGHT ELBOW",
    parInk: 280,
    ball: { x: 92, y: 70, r: 15 },
    cup: { x: 298, y: 516, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 136, y: 276, w: 154, h: 14 },
      { x: 160, y: 432, w: 126, h: 14 },
    ],
  },
  {
    id: 71,
    name: "LOW ROOF",
    parInk: 277,
    ball: { x: 90, y: 74, r: 15 },
    cup: { x: 296, y: 514, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 195, y: 277, w: 206, h: 16 },
      { x: 106, y: 393, w: 72, h: 14, angle: 0.1 },
    ],
  },
  {
    id: 72,
    name: "SHELF CUP",
    parInk: 244,
    ball: { x: 92, y: 70, r: 15 },
    cup: { x: 286, y: 390, width: 104, height: 72, angle: 0.02, mount: "shelf", captureHold: 0.16, captureSpeed: 320 },
    obstacles: [
      { x: 286, y: 438, w: 126, h: 16 },
      { x: 148, y: 302, w: 100, h: 14, angle: 0.08 },
    ],
  },
  {
    id: 73,
    name: "REVERSE SLALOM",
    parInk: 263,
    ball: { x: 88, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 106, y: 259, w: 94, h: 14, angle: 0.07 },
      { x: 272, y: 333, w: 94, h: 14, angle: -0.07 },
    ],
  },
  {
    id: 74,
    name: "WINDOW PAIR",
    parInk: 286,
    ball: { x: 296, y: 70, r: 15 },
    cup: { x: 90, y: 514, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 246, y: 306, w: 22, h: 100 },
      { x: 165, y: 454, w: 22, h: 58 },
    ],
  },
  {
    id: 75,
    name: "TALL WINDOW",
    parInk: 251,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 88, y: 518, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 196, y: 268, w: 24, h: 104 },
      { x: 196, y: 462, w: 24, h: 84 },
      { x: 122, y: 360, w: 64, h: 14, angle: 0.05 },
    ],
  },
  {
    id: 76,
    name: "HOLLOW ISLAND",
    parInk: 250,
    ball: { x: 292, y: 70, r: 15 },
    cup: { x: 98, y: 516, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 195, y: 357, w: 98, h: 82 },
      { x: 102, y: 451, w: 80, h: 14, angle: 0.05 },
    ],
  },
  {
    id: 77,
    name: "DEEP V",
    parInk: 241,
    ball: { x: 284, y: 74, r: 15 },
    cup: { x: 104, y: 514, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 248, y: 340, w: 116, h: 14, angle: -0.18 },
      { x: 142, y: 340, w: 116, h: 14, angle: 0.18 },
    ],
  },
  {
    id: 78,
    name: "WIDE TRIDENT",
    parInk: 300,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 300, y: 518, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 278, y: 383, w: 20, h: 146 },
      { x: 112, y: 383, w: 20, h: 146 },
    ],
  },
  {
    id: 79,
    name: "RETURN BOARD",
    parInk: 215,
    ball: { x: 90, y: 74, r: 15 },
    cup: { x: 296, y: 516, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 154, y: 248, w: 92, h: 14, angle: 0.11 },
      { x: 244, y: 392, w: 102, h: 14, angle: -0.07 },
    ],
  },
  {
    id: 80,
    name: "NARROW CANYON",
    parInk: 286,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 300, y: 514, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 240, y: 344, w: 22, h: 228 },
      { x: 150, y: 344, w: 22, h: 228 },
    ],
  },
  {
    id: 81,
    name: "BROKEN BRIDGE",
    parInk: 243,
    ball: { x: 294, y: 74, r: 15 },
    cup: { x: 96, y: 518, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 304, y: 345, w: 124, h: 16 },
      { x: 86, y: 345, w: 124, h: 16 },
    ],
  },
  {
    id: 82,
    name: "OFFSET DECK",
    parInk: 288,
    ball: { x: 296, y: 70, r: 15 },
    cup: { x: 90, y: 516, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 272, y: 304, w: 136, h: 16 },
      { x: 136, y: 424, w: 136, h: 16 },
    ],
  },
  {
    id: 83,
    name: "WIDE GATE",
    parInk: 259,
    ball: { x: 298, y: 74, r: 15 },
    cup: { x: 92, y: 514, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 286, y: 359, w: 122, h: 16 },
      { x: 104, y: 359, w: 122, h: 16 },
    ],
  },
  {
    id: 84,
    name: "FUNNEL RUN",
    parInk: 284,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 302, y: 518, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 278, y: 312, w: 92, h: 14, angle: -0.15 },
      { x: 112, y: 388, w: 92, h: 14, angle: 0.15 },
      { x: 194, y: 436, w: 92, h: 14, angle: -0.15 },
    ],
  },
  {
    id: 85,
    name: "SPIRAL RETURN",
    parInk: 291,
    ball: { x: 294, y: 74, r: 15 },
    cup: { x: 94, y: 516, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 268, y: 274, w: 108, h: 14 },
      { x: 126, y: 432, w: 108, h: 14 },
    ],
  },
  {
    id: 86,
    name: "INVERTED FUNNEL",
    parInk: 244,
    ball: { x: 290, y: 70, r: 15 },
    cup: { x: 100, y: 514, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 247, y: 383, w: 106, h: 14, angle: -0.14 },
      { x: 195, y: 301, w: 28, h: 52 },
    ],
  },
  {
    id: 87,
    name: "OPEN CRADLE",
    parInk: 277,
    ball: { x: 294, y: 74, r: 15 },
    cup: { x: 94, y: 518, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 272, y: 416, w: 22, h: 114 },
      { x: 118, y: 416, w: 22, h: 114 },
    ],
  },
  {
    id: 88,
    name: "RIGHT CATCH",
    parInk: 250,
    ball: { x: 94, y: 70, r: 15 },
    cup: { x: 340, y: 418, width: 102, height: 72, angle: -HALF_PI, mount: "right-wall", captureHold: 0.12, captureSpeed: 390 },
    obstacles: [
      { x: 174, y: 300, w: 112, h: 14, angle: -0.07 },
      { x: 250, y: 408, w: 82, h: 14, angle: -0.04 },
    ],
  },
  {
    id: 89,
    name: "TALL TEETH",
    parInk: 273,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 90, y: 514, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 288, y: 336, w: 22, h: 90 },
      { x: 112, y: 366, w: 22, h: 92 },
    ],
  },
  {
    id: 90,
    name: "LOW TUNNEL",
    parInk: 294,
    ball: { x: 290, y: 70, r: 15 },
    cup: { x: 98, y: 518, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 194, y: 282, w: 232, h: 14 },
      { x: 46, y: 414, w: 22, h: 104 },
    ],
  },
  {
    id: 91,
    name: "POST ALLEY",
    parInk: 241,
    ball: { x: 288, y: 74, r: 15 },
    cup: { x: 98, y: 516, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 242, y: 391, w: 24, h: 92 },
      { x: 152, y: 391, w: 24, h: 92 },
    ],
  },
  {
    id: 92,
    name: "FORT SLOT",
    parInk: 282,
    ball: { x: 294, y: 70, r: 15 },
    cup: { x: 96, y: 514, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 296, y: 394, w: 24, h: 124 },
      { x: 94, y: 394, w: 24, h: 124 },
      { x: 196, y: 292, w: 128, h: 16 },
    ],
  },
  {
    id: 93,
    name: "LEANING ROOF",
    parInk: 265,
    ball: { x: 294, y: 74, r: 15 },
    cup: { x: 98, y: 518, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 190, y: 303, w: 172, h: 16, angle: 0.09 },
      { x: 112, y: 411, w: 82, h: 14, angle: -0.08 },
    ],
  },
  {
    id: 94,
    name: "STEEP WALL",
    parInk: 296,
    ball: { x: 294, y: 70, r: 15 },
    cup: { x: 94, y: 516, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 192, y: 360, w: 230, h: 18, angle: 0.16 },
      { x: 298, y: 444, w: 76, h: 14, angle: -0.07 },
    ],
  },
  {
    id: 95,
    name: "OFFSET NEEDLE",
    parInk: 283,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 96, y: 514, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 278, y: 370, w: 142, h: 16 },
      { x: 195, y: 280, w: 26, h: 86 },
    ],
  },
  {
    id: 96,
    name: "TIGHT S",
    parInk: 290,
    ball: { x: 298, y: 70, r: 15 },
    cup: { x: 90, y: 518, width: 106, height: 76, angle: 0.025 },
    obstacles: [
      { x: 278, y: 273, w: 132, h: 14 },
      { x: 116, y: 343, w: 132, h: 14 },
    ],
  },
  {
    id: 97,
    name: "TIGHT HOURGLASS",
    parInk: 299,
    ball: { x: 88, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 110, height: 76, angle: -0.045 },
    obstacles: [
      { x: 252, y: 316, w: 116, h: 14, angle: -0.18 },
      { x: 138, y: 316, w: 116, h: 14, angle: 0.18 },
      { x: 138, y: 414, w: 116, h: 14, angle: -0.18 },
    ],
  },
  {
    id: 98,
    name: "DEEP BOWL",
    parInk: 250,
    ball: { x: 98, y: 70, r: 15 },
    cup: { x: 292, y: 514, width: 114, height: 76, angle: 0.06 },
    obstacles: [
      { x: 276, y: 401, w: 84, h: 14, angle: -0.13 },
      { x: 116, y: 401, w: 84, h: 14, angle: 0.13 },
    ],
  },
  {
    id: 99,
    name: "LOW OVERHANG",
    parInk: 261,
    ball: { x: 90, y: 74, r: 15 },
    cup: { x: 298, y: 518, width: 118, height: 76, angle: -0.02 },
    obstacles: [
      { x: 142, y: 306, w: 166, h: 16 },
      { x: 90, y: 390, w: 22, h: 120 },
    ],
  },
  {
    id: 100,
    name: "FINAL ROLL",
    parInk: 258,
    ball: { x: 300, y: 70, r: 15 },
    cup: { x: 72, y: 500, width: 104, height: 72, angle: HALF_PI, mount: "floor", captureHold: 0.13, captureSpeed: 370 },
    obstacles: [
      { x: 260, y: 294, w: 116, h: 14, angle: -0.08 },
      { x: 166, y: 418, w: 104, h: 14, angle: -0.06 },
    ],
  },
];