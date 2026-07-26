export type DrawDropRectObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
};

export type DrawDropCupSpec = {
  x: number;
  y: number;
  angle?: number;
  width?: number;
  height?: number;
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

export const DRAW_DROP_LEVELS: DrawDropLevelSpec[] = [
  {
    id: 1,
    name: "SIDE GUIDE 1",
    parInk: 150,
    ball: { x: 92, y: 70, r: 15 },
    cup: { x: 292, y: 520, width: 112, height: 76 },
    obstacles: [],
  },
  {
    id: 2,
    name: "SIDE GUIDE 2",
    parInk: 158,
    ball: { x: 110, y: 74, r: 15 },
    cup: { x: 280, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [],
  },
  {
    id: 3,
    name: "SIDE GUIDE 3",
    parInk: 166,
    ball: { x: 78, y: 70, r: 15 },
    cup: { x: 308, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [],
  },
  {
    id: 4,
    name: "SIDE GUIDE 4",
    parInk: 174,
    ball: { x: 102, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [],
  },
  {
    id: 5,
    name: "SIDE GUIDE 5",
    parInk: 182,
    ball: { x: 84, y: 70, r: 15 },
    cup: { x: 276, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [],
  },
  {
    id: 6,
    name: "BACK GUIDE 1",
    parInk: 150,
    ball: { x: 298, y: 70, r: 15 },
    cup: { x: 98, y: 520, width: 112, height: 76 },
    obstacles: [],
  },
  {
    id: 7,
    name: "BACK GUIDE 2",
    parInk: 158,
    ball: { x: 316, y: 74, r: 15 },
    cup: { x: 86, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [],
  },
  {
    id: 8,
    name: "BACK GUIDE 3",
    parInk: 166,
    ball: { x: 284, y: 70, r: 15 },
    cup: { x: 114, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [],
  },
  {
    id: 9,
    name: "BACK GUIDE 4",
    parInk: 174,
    ball: { x: 308, y: 74, r: 15 },
    cup: { x: 108, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [],
  },
  {
    id: 10,
    name: "BACK GUIDE 5",
    parInk: 182,
    ball: { x: 290, y: 70, r: 15 },
    cup: { x: 82, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [],
  },
  {
    id: 11,
    name: "LOW SHELF 1",
    parInk: 185,
    ball: { x: 96, y: 70, r: 15 },
    cup: { x: 292, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 186, y: 420, w: 92, h: 16, angle: 0.03 },
    ],
  },
  {
    id: 12,
    name: "LOW SHELF 2",
    parInk: 193,
    ball: { x: 114, y: 74, r: 15 },
    cup: { x: 280, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 190, y: 428, w: 92, h: 16, angle: 0.03 },
    ],
  },
  {
    id: 13,
    name: "LOW SHELF 3",
    parInk: 201,
    ball: { x: 82, y: 70, r: 15 },
    cup: { x: 308, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 194, y: 412, w: 92, h: 16, angle: 0.03 },
    ],
  },
  {
    id: 14,
    name: "LOW SHELF 4",
    parInk: 209,
    ball: { x: 106, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 198, y: 424, w: 92, h: 16, angle: 0.03 },
    ],
  },
  {
    id: 15,
    name: "LOW SHELF 5",
    parInk: 217,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 276, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [
      { x: 202, y: 416, w: 92, h: 16, angle: 0.03 },
    ],
  },
  {
    id: 16,
    name: "SOFT SHELF 1",
    parInk: 190,
    ball: { x: 294, y: 70, r: 15 },
    cup: { x: 100, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 210, y: 352, w: 102, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 17,
    name: "SOFT SHELF 2",
    parInk: 198,
    ball: { x: 312, y: 74, r: 15 },
    cup: { x: 88, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 214, y: 360, w: 102, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 18,
    name: "SOFT SHELF 3",
    parInk: 206,
    ball: { x: 280, y: 70, r: 15 },
    cup: { x: 116, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 218, y: 344, w: 102, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 19,
    name: "SOFT SHELF 4",
    parInk: 214,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 110, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 222, y: 356, w: 102, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 20,
    name: "SOFT SHELF 5",
    parInk: 222,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 84, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [
      { x: 226, y: 348, w: 102, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 21,
    name: "CENTER POST 1",
    parInk: 205,
    ball: { x: 98, y: 70, r: 15 },
    cup: { x: 292, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 190, y: 418, w: 28, h: 88 },
    ],
  },
  {
    id: 22,
    name: "CENTER POST 2",
    parInk: 213,
    ball: { x: 116, y: 74, r: 15 },
    cup: { x: 280, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 194, y: 426, w: 28, h: 88 },
    ],
  },
  {
    id: 23,
    name: "CENTER POST 3",
    parInk: 221,
    ball: { x: 84, y: 70, r: 15 },
    cup: { x: 308, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 198, y: 410, w: 28, h: 88 },
    ],
  },
  {
    id: 24,
    name: "CENTER POST 4",
    parInk: 229,
    ball: { x: 108, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 202, y: 422, w: 28, h: 88 },
    ],
  },
  {
    id: 25,
    name: "CENTER POST 5",
    parInk: 237,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 276, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [
      { x: 206, y: 414, w: 28, h: 88 },
    ],
  },
  {
    id: 26,
    name: "SHORT STEP 1",
    parInk: 200,
    ball: { x: 292, y: 70, r: 15 },
    cup: { x: 98, y: 520, width: 112, height: 76 },
    obstacles: [
      { x: 257, y: 330, w: 108, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 27,
    name: "SHORT STEP 2",
    parInk: 208,
    ball: { x: 310, y: 74, r: 15 },
    cup: { x: 86, y: 520, width: 112, height: 76, angle: 0.035 },
    obstacles: [
      { x: 261, y: 338, w: 108, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 28,
    name: "SHORT STEP 3",
    parInk: 216,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 114, y: 520, width: 112, height: 76, angle: -0.035 },
    obstacles: [
      { x: 265, y: 322, w: 108, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 29,
    name: "SHORT STEP 4",
    parInk: 224,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 108, y: 516, width: 112, height: 76, angle: 0.055 },
    obstacles: [
      { x: 269, y: 334, w: 108, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 30,
    name: "SHORT STEP 5",
    parInk: 232,
    ball: { x: 284, y: 70, r: 15 },
    cup: { x: 82, y: 516, width: 112, height: 76, angle: -0.055 },
    obstacles: [
      { x: 273, y: 326, w: 108, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 31,
    name: "EASY GAP 1",
    parInk: 205,
    ball: { x: 126, y: 70, r: 15 },
    cup: { x: 274, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 60, y: 398, w: 94, h: 16 },
      { x: 314, y: 398, w: 94, h: 16 },
    ],
  },
  {
    id: 32,
    name: "EASY GAP 2",
    parInk: 213,
    ball: { x: 144, y: 74, r: 15 },
    cup: { x: 262, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 64, y: 406, w: 94, h: 16 },
      { x: 318, y: 406, w: 94, h: 16 },
    ],
  },
  {
    id: 33,
    name: "EASY GAP 3",
    parInk: 221,
    ball: { x: 112, y: 70, r: 15 },
    cup: { x: 290, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 68, y: 390, w: 94, h: 16 },
      { x: 322, y: 390, w: 94, h: 16 },
    ],
  },
  {
    id: 34,
    name: "EASY GAP 4",
    parInk: 229,
    ball: { x: 136, y: 74, r: 15 },
    cup: { x: 284, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 72, y: 402, w: 94, h: 16 },
      { x: 326, y: 402, w: 94, h: 16 },
    ],
  },
  {
    id: 35,
    name: "EASY GAP 5",
    parInk: 237,
    ball: { x: 118, y: 70, r: 15 },
    cup: { x: 258, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 76, y: 394, w: 94, h: 16 },
      { x: 330, y: 394, w: 94, h: 16 },
    ],
  },
  {
    id: 36,
    name: "ONE POST 1",
    parInk: 215,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 106, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 202, y: 397, w: 24, h: 104 },
    ],
  },
  {
    id: 37,
    name: "ONE POST 2",
    parInk: 223,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 94, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 206, y: 405, w: 24, h: 104 },
    ],
  },
  {
    id: 38,
    name: "ONE POST 3",
    parInk: 231,
    ball: { x: 272, y: 70, r: 15 },
    cup: { x: 122, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 210, y: 389, w: 24, h: 104 },
    ],
  },
  {
    id: 39,
    name: "ONE POST 4",
    parInk: 239,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 116, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 214, y: 401, w: 24, h: 104 },
    ],
  },
  {
    id: 40,
    name: "ONE POST 5",
    parInk: 247,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 90, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 218, y: 393, w: 24, h: 104 },
    ],
  },
  {
    id: 41,
    name: "TWO STEPS 1",
    parInk: 235,
    ball: { x: 98, y: 70, r: 15 },
    cup: { x: 292, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 104, y: 300, w: 88, h: 16, angle: 0.02 },
      { x: 236, y: 412, w: 90, h: 16, angle: 0.02 },
    ],
  },
  {
    id: 42,
    name: "TWO STEPS 2",
    parInk: 243,
    ball: { x: 116, y: 74, r: 15 },
    cup: { x: 280, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 108, y: 308, w: 88, h: 16, angle: 0.02 },
      { x: 240, y: 420, w: 90, h: 16, angle: 0.02 },
    ],
  },
  {
    id: 43,
    name: "TWO STEPS 3",
    parInk: 251,
    ball: { x: 84, y: 70, r: 15 },
    cup: { x: 308, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 112, y: 292, w: 88, h: 16, angle: 0.02 },
      { x: 244, y: 404, w: 90, h: 16, angle: 0.02 },
    ],
  },
  {
    id: 44,
    name: "TWO STEPS 4",
    parInk: 259,
    ball: { x: 108, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 116, y: 304, w: 88, h: 16, angle: 0.02 },
      { x: 248, y: 416, w: 90, h: 16, angle: 0.02 },
    ],
  },
  {
    id: 45,
    name: "TWO STEPS 5",
    parInk: 267,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 276, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 120, y: 296, w: 88, h: 16, angle: 0.02 },
      { x: 252, y: 408, w: 90, h: 16, angle: 0.02 },
    ],
  },
  {
    id: 46,
    name: "SLOPE PAIR 1",
    parInk: 235,
    ball: { x: 292, y: 70, r: 15 },
    cup: { x: 98, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 268, y: 286, w: 96, h: 16, angle: -0.07 },
      { x: 170, y: 404, w: 86, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 47,
    name: "SLOPE PAIR 2",
    parInk: 243,
    ball: { x: 310, y: 74, r: 15 },
    cup: { x: 86, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 272, y: 294, w: 96, h: 16, angle: -0.07 },
      { x: 174, y: 412, w: 86, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 48,
    name: "SLOPE PAIR 3",
    parInk: 251,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 114, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 276, y: 278, w: 96, h: 16, angle: -0.07 },
      { x: 178, y: 396, w: 86, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 49,
    name: "SLOPE PAIR 4",
    parInk: 259,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 108, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 280, y: 290, w: 96, h: 16, angle: -0.07 },
      { x: 182, y: 408, w: 86, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 50,
    name: "SLOPE PAIR 5",
    parInk: 267,
    ball: { x: 284, y: 70, r: 15 },
    cup: { x: 82, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 284, y: 282, w: 96, h: 16, angle: -0.07 },
      { x: 186, y: 400, w: 86, h: 16, angle: -0.05 },
    ],
  },
  {
    id: 51,
    name: "WIDE CUP 1",
    parInk: 190,
    ball: { x: 120, y: 70, r: 15 },
    cup: { x: 270, y: 520, width: 126, height: 76 },
    obstacles: [
      { x: 182, y: 372, w: 82, h: 16, angle: 0.04 },
    ],
  },
  {
    id: 52,
    name: "WIDE CUP 2",
    parInk: 198,
    ball: { x: 138, y: 74, r: 15 },
    cup: { x: 258, y: 520, width: 126, height: 76, angle: 0.035 },
    obstacles: [
      { x: 186, y: 380, w: 82, h: 16, angle: 0.04 },
    ],
  },
  {
    id: 53,
    name: "WIDE CUP 3",
    parInk: 206,
    ball: { x: 106, y: 70, r: 15 },
    cup: { x: 286, y: 520, width: 126, height: 76, angle: -0.035 },
    obstacles: [
      { x: 190, y: 364, w: 82, h: 16, angle: 0.04 },
    ],
  },
  {
    id: 54,
    name: "WIDE CUP 4",
    parInk: 214,
    ball: { x: 130, y: 74, r: 15 },
    cup: { x: 280, y: 516, width: 126, height: 76, angle: 0.055 },
    obstacles: [
      { x: 194, y: 376, w: 82, h: 16, angle: 0.04 },
    ],
  },
  {
    id: 55,
    name: "WIDE CUP 5",
    parInk: 222,
    ball: { x: 112, y: 70, r: 15 },
    cup: { x: 254, y: 516, width: 126, height: 76, angle: -0.055 },
    obstacles: [
      { x: 198, y: 368, w: 82, h: 16, angle: 0.04 },
    ],
  },
  {
    id: 56,
    name: "TILT CUP 1",
    parInk: 215,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 102, y: 516, width: 108, height: 76, angle: 0.07 },
    obstacles: [
      { x: 220, y: 390, w: 84, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 57,
    name: "TILT CUP 2",
    parInk: 223,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 90, y: 520, width: 108, height: 76, angle: -0.025 },
    obstacles: [
      { x: 224, y: 398, w: 84, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 58,
    name: "TILT CUP 3",
    parInk: 231,
    ball: { x: 272, y: 70, r: 15 },
    cup: { x: 118, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 228, y: 382, w: 84, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 59,
    name: "TILT CUP 4",
    parInk: 239,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 112, y: 520, width: 108, height: 76, angle: -0.025 },
    obstacles: [
      { x: 232, y: 394, w: 84, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 60,
    name: "TILT CUP 5",
    parInk: 247,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 86, y: 520, width: 108, height: 76, angle: -0.005 },
    obstacles: [
      { x: 236, y: 386, w: 84, h: 16, angle: -0.04 },
    ],
  },
  {
    id: 61,
    name: "TWIN POSTS 1",
    parInk: 245,
    ball: { x: 98, y: 70, r: 15 },
    cup: { x: 292, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 147, y: 402, w: 22, h: 80 },
      { x: 224, y: 402, w: 22, h: 80 },
    ],
  },
  {
    id: 62,
    name: "TWIN POSTS 2",
    parInk: 253,
    ball: { x: 116, y: 74, r: 15 },
    cup: { x: 280, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 151, y: 410, w: 22, h: 80 },
      { x: 228, y: 410, w: 22, h: 80 },
    ],
  },
  {
    id: 63,
    name: "TWIN POSTS 3",
    parInk: 261,
    ball: { x: 84, y: 70, r: 15 },
    cup: { x: 308, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 155, y: 394, w: 22, h: 80 },
      { x: 232, y: 394, w: 22, h: 80 },
    ],
  },
  {
    id: 64,
    name: "TWIN POSTS 4",
    parInk: 269,
    ball: { x: 108, y: 74, r: 15 },
    cup: { x: 302, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 159, y: 406, w: 22, h: 80 },
      { x: 236, y: 406, w: 22, h: 80 },
    ],
  },
  {
    id: 65,
    name: "TWIN POSTS 5",
    parInk: 277,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 276, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 163, y: 398, w: 22, h: 80 },
      { x: 240, y: 398, w: 22, h: 80 },
    ],
  },
  {
    id: 66,
    name: "LOW ISLAND 1",
    parInk: 230,
    ball: { x: 292, y: 70, r: 15 },
    cup: { x: 98, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 187, y: 430, w: 80, h: 46 },
    ],
  },
  {
    id: 67,
    name: "LOW ISLAND 2",
    parInk: 238,
    ball: { x: 310, y: 74, r: 15 },
    cup: { x: 86, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 191, y: 438, w: 80, h: 46 },
    ],
  },
  {
    id: 68,
    name: "LOW ISLAND 3",
    parInk: 246,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 114, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 195, y: 422, w: 80, h: 46 },
    ],
  },
  {
    id: 69,
    name: "LOW ISLAND 4",
    parInk: 254,
    ball: { x: 302, y: 74, r: 15 },
    cup: { x: 108, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 199, y: 434, w: 80, h: 46 },
    ],
  },
  {
    id: 70,
    name: "LOW ISLAND 5",
    parInk: 262,
    ball: { x: 284, y: 70, r: 15 },
    cup: { x: 82, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 203, y: 426, w: 80, h: 46 },
    ],
  },
  {
    id: 71,
    name: "WINDOW 1",
    parInk: 255,
    ball: { x: 102, y: 70, r: 15 },
    cup: { x: 288, y: 520, width: 110, height: 76 },
    obstacles: [
      { x: 186, y: 302, w: 24, h: 92 },
      { x: 186, y: 488, w: 24, h: 74 },
    ],
  },
  {
    id: 72,
    name: "WINDOW 2",
    parInk: 263,
    ball: { x: 120, y: 74, r: 15 },
    cup: { x: 276, y: 520, width: 110, height: 76, angle: 0.035 },
    obstacles: [
      { x: 190, y: 310, w: 24, h: 92 },
      { x: 190, y: 496, w: 24, h: 74 },
    ],
  },
  {
    id: 73,
    name: "WINDOW 3",
    parInk: 271,
    ball: { x: 88, y: 70, r: 15 },
    cup: { x: 304, y: 520, width: 110, height: 76, angle: -0.035 },
    obstacles: [
      { x: 194, y: 294, w: 24, h: 92 },
      { x: 194, y: 480, w: 24, h: 74 },
    ],
  },
  {
    id: 74,
    name: "WINDOW 4",
    parInk: 279,
    ball: { x: 112, y: 74, r: 15 },
    cup: { x: 298, y: 516, width: 110, height: 76, angle: 0.055 },
    obstacles: [
      { x: 198, y: 306, w: 24, h: 92 },
      { x: 198, y: 492, w: 24, h: 74 },
    ],
  },
  {
    id: 75,
    name: "WINDOW 5",
    parInk: 287,
    ball: { x: 94, y: 70, r: 15 },
    cup: { x: 272, y: 516, width: 110, height: 76, angle: -0.055 },
    obstacles: [
      { x: 202, y: 298, w: 24, h: 92 },
      { x: 202, y: 484, w: 24, h: 74 },
    ],
  },
  {
    id: 76,
    name: "PINBALL 1",
    parInk: 230,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 104, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 142, y: 330, w: 30, h: 30 },
      { x: 236, y: 412, w: 30, h: 30 },
    ],
  },
  {
    id: 77,
    name: "PINBALL 2",
    parInk: 238,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 92, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 146, y: 338, w: 30, h: 30 },
      { x: 240, y: 420, w: 30, h: 30 },
    ],
  },
  {
    id: 78,
    name: "PINBALL 3",
    parInk: 246,
    ball: { x: 272, y: 70, r: 15 },
    cup: { x: 120, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 150, y: 322, w: 30, h: 30 },
      { x: 244, y: 404, w: 30, h: 30 },
    ],
  },
  {
    id: 79,
    name: "PINBALL 4",
    parInk: 254,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 114, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 154, y: 334, w: 30, h: 30 },
      { x: 248, y: 416, w: 30, h: 30 },
    ],
  },
  {
    id: 80,
    name: "PINBALL 5",
    parInk: 262,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 88, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 158, y: 326, w: 30, h: 30 },
      { x: 252, y: 408, w: 30, h: 30 },
    ],
  },
  {
    id: 81,
    name: "FUNNEL 1",
    parInk: 255,
    ball: { x: 104, y: 70, r: 15 },
    cup: { x: 286, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 142, y: 390, w: 94, h: 14, angle: 0.12 },
      { x: 234, y: 390, w: 94, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 82,
    name: "FUNNEL 2",
    parInk: 263,
    ball: { x: 122, y: 74, r: 15 },
    cup: { x: 274, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 146, y: 398, w: 94, h: 14, angle: 0.12 },
      { x: 238, y: 398, w: 94, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 83,
    name: "FUNNEL 3",
    parInk: 271,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 302, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 150, y: 382, w: 94, h: 14, angle: 0.12 },
      { x: 242, y: 382, w: 94, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 84,
    name: "FUNNEL 4",
    parInk: 279,
    ball: { x: 114, y: 74, r: 15 },
    cup: { x: 296, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 154, y: 394, w: 94, h: 14, angle: 0.12 },
      { x: 246, y: 394, w: 94, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 85,
    name: "FUNNEL 5",
    parInk: 287,
    ball: { x: 96, y: 70, r: 15 },
    cup: { x: 270, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 158, y: 386, w: 94, h: 14, angle: 0.12 },
      { x: 250, y: 386, w: 94, h: 14, angle: -0.12 },
    ],
  },
  {
    id: 86,
    name: "SPLIT SHELF 1",
    parInk: 230,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 104, y: 520, width: 108, height: 76 },
    obstacles: [
      { x: 84, y: 355, w: 120, h: 16 },
      { x: 290, y: 355, w: 120, h: 16 },
    ],
  },
  {
    id: 87,
    name: "SPLIT SHELF 2",
    parInk: 238,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 92, y: 520, width: 108, height: 76, angle: 0.035 },
    obstacles: [
      { x: 88, y: 363, w: 120, h: 16 },
      { x: 294, y: 363, w: 120, h: 16 },
    ],
  },
  {
    id: 88,
    name: "SPLIT SHELF 3",
    parInk: 246,
    ball: { x: 272, y: 70, r: 15 },
    cup: { x: 120, y: 520, width: 108, height: 76, angle: -0.035 },
    obstacles: [
      { x: 92, y: 347, w: 120, h: 16 },
      { x: 298, y: 347, w: 120, h: 16 },
    ],
  },
  {
    id: 89,
    name: "SPLIT SHELF 4",
    parInk: 254,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 114, y: 516, width: 108, height: 76, angle: 0.055 },
    obstacles: [
      { x: 96, y: 359, w: 120, h: 16 },
      { x: 302, y: 359, w: 120, h: 16 },
    ],
  },
  {
    id: 90,
    name: "SPLIT SHELF 5",
    parInk: 262,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 88, y: 516, width: 108, height: 76, angle: -0.055 },
    obstacles: [
      { x: 100, y: 351, w: 120, h: 16 },
      { x: 306, y: 351, w: 120, h: 16 },
    ],
  },
  {
    id: 91,
    name: "CROSS EASY 1",
    parInk: 270,
    ball: { x: 104, y: 70, r: 15 },
    cup: { x: 286, y: 520, width: 110, height: 76 },
    obstacles: [
      { x: 187, y: 370, w: 100, h: 14 },
      { x: 187, y: 370, w: 20, h: 84 },
    ],
  },
  {
    id: 92,
    name: "CROSS EASY 2",
    parInk: 278,
    ball: { x: 122, y: 74, r: 15 },
    cup: { x: 274, y: 520, width: 110, height: 76, angle: 0.035 },
    obstacles: [
      { x: 191, y: 378, w: 100, h: 14 },
      { x: 191, y: 378, w: 20, h: 84 },
    ],
  },
  {
    id: 93,
    name: "CROSS EASY 3",
    parInk: 286,
    ball: { x: 90, y: 70, r: 15 },
    cup: { x: 302, y: 520, width: 110, height: 76, angle: -0.035 },
    obstacles: [
      { x: 195, y: 362, w: 100, h: 14 },
      { x: 195, y: 362, w: 20, h: 84 },
    ],
  },
  {
    id: 94,
    name: "CROSS EASY 4",
    parInk: 294,
    ball: { x: 114, y: 74, r: 15 },
    cup: { x: 296, y: 516, width: 110, height: 76, angle: 0.055 },
    obstacles: [
      { x: 199, y: 374, w: 100, h: 14 },
      { x: 199, y: 374, w: 20, h: 84 },
    ],
  },
  {
    id: 95,
    name: "CROSS EASY 5",
    parInk: 302,
    ball: { x: 96, y: 70, r: 15 },
    cup: { x: 270, y: 516, width: 110, height: 76, angle: -0.055 },
    obstacles: [
      { x: 203, y: 366, w: 100, h: 14 },
      { x: 203, y: 366, w: 20, h: 84 },
    ],
  },
  {
    id: 96,
    name: "SPECIAL BOWL 1",
    parInk: 275,
    ball: { x: 286, y: 70, r: 15 },
    cup: { x: 104, y: 520, width: 110, height: 76 },
    obstacles: [
      { x: 114, y: 400, w: 78, h: 14, angle: 0.1 },
      { x: 188, y: 425, w: 78, h: 14 },
      { x: 262, y: 400, w: 78, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 97,
    name: "SPECIAL BOWL 2",
    parInk: 283,
    ball: { x: 304, y: 74, r: 15 },
    cup: { x: 92, y: 520, width: 110, height: 76, angle: 0.035 },
    obstacles: [
      { x: 118, y: 408, w: 78, h: 14, angle: 0.1 },
      { x: 192, y: 433, w: 78, h: 14 },
      { x: 266, y: 408, w: 78, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 98,
    name: "SPECIAL BOWL 3",
    parInk: 291,
    ball: { x: 272, y: 70, r: 15 },
    cup: { x: 120, y: 520, width: 110, height: 76, angle: -0.035 },
    obstacles: [
      { x: 122, y: 392, w: 78, h: 14, angle: 0.1 },
      { x: 196, y: 417, w: 78, h: 14 },
      { x: 270, y: 392, w: 78, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 99,
    name: "SPECIAL BOWL 4",
    parInk: 299,
    ball: { x: 296, y: 74, r: 15 },
    cup: { x: 114, y: 516, width: 110, height: 76, angle: 0.055 },
    obstacles: [
      { x: 126, y: 404, w: 78, h: 14, angle: 0.1 },
      { x: 200, y: 429, w: 78, h: 14 },
      { x: 274, y: 404, w: 78, h: 14, angle: -0.1 },
    ],
  },
  {
    id: 100,
    name: "SPECIAL BOWL 5",
    parInk: 307,
    ball: { x: 278, y: 70, r: 15 },
    cup: { x: 88, y: 516, width: 110, height: 76, angle: -0.055 },
    obstacles: [
      { x: 130, y: 396, w: 78, h: 14, angle: 0.1 },
      { x: 204, y: 421, w: 78, h: 14 },
      { x: 278, y: 396, w: 78, h: 14, angle: -0.1 },
    ],
  },
];

export const DRAW_DROP_LEVEL_COUNT = DRAW_DROP_LEVELS.length;
