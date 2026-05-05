import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type PlayerId = 'p1' | 'p2';

type Phase =
  | 'p1_hide'
  | 'p2_seek'
  | 'p2_found'
  | 'p2_hide'
  | 'p1_seek'
  | 'p1_found'
  | 'match_end';

type Vec2 = {
  x: number;
  y: number;
};

type AvatarEmote = 'normal' | 'search' | 'happy' | 'surprise' | 'hide';

type AvatarState = {
  x: number;
  y: number;
  visible: boolean;
  dir: number;
  bob: number;
  scale: number;
  opacity: number;
  emote: AvatarEmote;
};

type Spot = {
  id: string;
  label: string;
  room: string;
  nodeId: string;
  parentNodeId: string;
  x: number;
  y: number;
  icon: string;
};

type DoorDef = {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  orientation: 'vertical' | 'horizontal';
  openTo: 'left' | 'right' | 'up' | 'down';
  length: number;
};

type MovementState = {
  player: PlayerId;
  nodeIds: string[];
  points: Vec2[];
  segmentIndex: number;
  segmentProgress: number;
  lastTs: number;
  onComplete: () => void;
};

type SearchFx =
  | { kind: 'empty'; x: number; y: number; label: string }
  | { kind: 'found'; x: number; y: number; label: string }
  | null;

type RoomDef = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  fill: string;
  rug?: {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
  };
};

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

const WORLD_W = 1120;
const WORLD_H = 780;

const BASE_NODES: Record<string, Vec2> = {
  entry: { x: 560, y: 706 },

  hallBottom: { x: 560, y: 642 },
  hallMid: { x: 560, y: 512 },
  hallTop: { x: 560, y: 338 },
  hallLoft: { x: 560, y: 184 },

  doorLiving: { x: 438, y: 284 },
  livingCenter: { x: 258, y: 284 },

  doorBalcony: { x: 260, y: 126 },
  balconyCenter: { x: 260, y: 72 },

  doorBedroom: { x: 438, y: 570 },
  bedroomCenter: { x: 258, y: 570 },

  doorKitchen: { x: 682, y: 190 },
  kitchenCenter: { x: 872, y: 190 },

  doorDining: { x: 682, y: 342 },
  diningCenter: { x: 866, y: 362 },

  doorOffice: { x: 682, y: 510 },
  officeCenter: { x: 850, y: 510 },

  doorBath: { x: 682, y: 642 },
  bathCenter: { x: 764, y: 642 },

  doorLaundry: { x: 918, y: 642 },
  laundryCenter: { x: 958, y: 642 },
};

const HIDING_SPOTS: Spot[] = [
  {
    id: 'hall_closet',
    label: 'Шкаф в прихожей',
    room: 'Hall',
    nodeId: 'spot_hall_closet',
    parentNodeId: 'hallTop',
    x: 506,
    y: 236,
    icon: '🧥',
  },
  {
    id: 'hall_console',
    label: 'За консолью',
    room: 'Hall',
    nodeId: 'spot_hall_console',
    parentNodeId: 'hallMid',
    x: 622,
    y: 446,
    icon: '🪞',
  },
  {
    id: 'living_sofa',
    label: 'За диваном',
    room: 'Living',
    nodeId: 'spot_living_sofa',
    parentNodeId: 'livingCenter',
    x: 152,
    y: 330,
    icon: '🛋️',
  },
  {
    id: 'living_curtain',
    label: 'За шторами',
    room: 'Living',
    nodeId: 'spot_living_curtain',
    parentNodeId: 'livingCenter',
    x: 360,
    y: 188,
    icon: '🪟',
  },
  {
    id: 'balcony_plants',
    label: 'Среди растений',
    room: 'Balcony',
    nodeId: 'spot_balcony_plants',
    parentNodeId: 'balconyCenter',
    x: 150,
    y: 74,
    icon: '🪴',
  },
  {
    id: 'balcony_chair',
    label: 'За креслом',
    room: 'Balcony',
    nodeId: 'spot_balcony_chair',
    parentNodeId: 'balconyCenter',
    x: 356,
    y: 74,
    icon: '🪑',
  },
  {
    id: 'bedroom_wardrobe',
    label: 'У шкафа',
    room: 'Bedroom',
    nodeId: 'spot_bedroom_wardrobe',
    parentNodeId: 'bedroomCenter',
    x: 128,
    y: 532,
    icon: '👔',
  },
  {
    id: 'bedroom_bed',
    label: 'Под кроватью',
    room: 'Bedroom',
    nodeId: 'spot_bedroom_bed',
    parentNodeId: 'bedroomCenter',
    x: 302,
    y: 662,
    icon: '🛏️',
  },
  {
    id: 'kitchen_fridge',
    label: 'За холодильником',
    room: 'Kitchen',
    nodeId: 'spot_kitchen_fridge',
    parentNodeId: 'kitchenCenter',
    x: 976,
    y: 166,
    icon: '🧊',
  },
  {
    id: 'kitchen_island',
    label: 'У острова',
    room: 'Kitchen',
    nodeId: 'spot_kitchen_island',
    parentNodeId: 'kitchenCenter',
    x: 804,
    y: 246,
    icon: '🍽️',
  },
  {
    id: 'dining_sideboard',
    label: 'У серванта',
    room: 'Dining',
    nodeId: 'spot_dining_sideboard',
    parentNodeId: 'diningCenter',
    x: 988,
    y: 370,
    icon: '🕯️',
  },
  {
    id: 'office_desk',
    label: 'За столом',
    room: 'Office',
    nodeId: 'spot_office_desk',
    parentNodeId: 'officeCenter',
    x: 954,
    y: 498,
    icon: '💻',
  },
  {
    id: 'office_books',
    label: 'У стеллажа',
    room: 'Office',
    nodeId: 'spot_office_books',
    parentNodeId: 'officeCenter',
    x: 742,
    y: 556,
    icon: '📚',
  },
  {
    id: 'bath_shower',
    label: 'В душевой',
    room: 'Bath',
    nodeId: 'spot_bath_shower',
    parentNodeId: 'bathCenter',
    x: 736,
    y: 630,
    icon: '🚿',
  },
  {
    id: 'laundry_boxes',
    label: 'Среди коробок',
    room: 'Laundry',
    nodeId: 'spot_laundry_boxes',
    parentNodeId: 'laundryCenter',
    x: 994,
    y: 680,
    icon: '📦',
  },
];

const NAV_NODES: Record<string, Vec2> = {
  ...BASE_NODES,
  ...HIDING_SPOTS.reduce<Record<string, Vec2>>((acc, spot) => {
    acc[spot.nodeId] = { x: spot.x, y: spot.y };
    return acc;
  }, {}),
};

const DOORS: DoorDef[] = [
  {
    id: 'door_living',
    nodeId: 'doorLiving',
    x: 438,
    y: 264,
    orientation: 'vertical',
    openTo: 'left',
    length: 52,
  },
  {
    id: 'door_bedroom',
    nodeId: 'doorBedroom',
    x: 438,
    y: 548,
    orientation: 'vertical',
    openTo: 'left',
    length: 52,
  },
  {
    id: 'door_balcony',
    nodeId: 'doorBalcony',
    x: 238,
    y: 126,
    orientation: 'horizontal',
    openTo: 'up',
    length: 52,
  },
  {
    id: 'door_kitchen',
    nodeId: 'doorKitchen',
    x: 682,
    y: 168,
    orientation: 'vertical',
    openTo: 'right',
    length: 52,
  },
  {
    id: 'door_dining',
    nodeId: 'doorDining',
    x: 682,
    y: 320,
    orientation: 'vertical',
    openTo: 'right',
    length: 52,
  },
  {
    id: 'door_office',
    nodeId: 'doorOffice',
    x: 682,
    y: 488,
    orientation: 'vertical',
    openTo: 'right',
    length: 52,
  },
  {
    id: 'door_bath',
    nodeId: 'doorBath',
    x: 682,
    y: 620,
    orientation: 'vertical',
    openTo: 'right',
    length: 52,
  },
  {
    id: 'door_laundry',
    nodeId: 'doorLaundry',
    x: 918,
    y: 620,
    orientation: 'vertical',
    openTo: 'right',
    length: 52,
  },
];

const ROOMS: RoomDef[] = [
  {
    id: 'living',
    label: 'Living',
    x: 58,
    y: 146,
    w: 380,
    h: 260,
    rx: 34,
    fill: '#dcebd9',
    rug: { x: 166, y: 248, w: 154, h: 88, color: '#8bbf8d' },
  },
  {
    id: 'balcony',
    label: 'Balcony',
    x: 84,
    y: 28,
    w: 352,
    h: 98,
    rx: 28,
    fill: '#d7ead3',
    rug: { x: 184, y: 54, w: 142, h: 34, color: '#9ed3a0' },
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    x: 58,
    y: 430,
    w: 380,
    h: 294,
    rx: 34,
    fill: '#ead7df',
    rug: { x: 174, y: 548, w: 142, h: 92, color: '#cf91a9' },
  },
  {
    id: 'hall',
    label: 'Hall',
    x: 438,
    y: 88,
    w: 244,
    h: 636,
    rx: 28,
    fill: '#efe7db',
    rug: { x: 506, y: 326, w: 108, h: 210, color: '#d7b778' },
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    x: 682,
    y: 58,
    w: 380,
    h: 230,
    rx: 34,
    fill: '#f0ead7',
    rug: { x: 788, y: 170, w: 150, h: 54, color: '#d2c391' },
  },
  {
    id: 'dining',
    label: 'Dining',
    x: 682,
    y: 288,
    w: 380,
    h: 154,
    rx: 28,
    fill: '#e9e1cf',
    rug: { x: 790, y: 328, w: 150, h: 68, color: '#c7a875' },
  },
  {
    id: 'office',
    label: 'Office',
    x: 682,
    y: 442,
    w: 380,
    h: 154,
    rx: 28,
    fill: '#d9e5ee',
    rug: { x: 800, y: 480, w: 132, h: 58, color: '#95b5c8' },
  },
  {
    id: 'bath',
    label: 'Bath',
    x: 682,
    y: 596,
    w: 236,
    h: 128,
    rx: 28,
    fill: '#d9f0f4',
  },
  {
    id: 'laundry',
    label: 'Laundry',
    x: 918,
    y: 596,
    w: 144,
    h: 128,
    rx: 28,
    fill: '#e6e0d7',
  },
];

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const connect = (graph: Record<string, string[]>, a: string, b: string) => {
  if (!graph[a]) graph[a] = [];
  if (!graph[b]) graph[b] = [];
  if (!graph[a].includes(b)) graph[a].push(b);
  if (!graph[b].includes(a)) graph[b].push(a);
};

const buildGraph = () => {
  const graph: Record<string, string[]> = {};

  connect(graph, 'entry', 'hallBottom');
  connect(graph, 'hallBottom', 'hallMid');
  connect(graph, 'hallMid', 'hallTop');
  connect(graph, 'hallTop', 'hallLoft');

  connect(graph, 'hallTop', 'doorLiving');
  connect(graph, 'doorLiving', 'livingCenter');

  connect(graph, 'livingCenter', 'doorBalcony');
  connect(graph, 'doorBalcony', 'balconyCenter');

  connect(graph, 'hallBottom', 'doorBedroom');
  connect(graph, 'doorBedroom', 'bedroomCenter');

  connect(graph, 'hallLoft', 'doorKitchen');
  connect(graph, 'doorKitchen', 'kitchenCenter');

  connect(graph, 'hallTop', 'doorDining');
  connect(graph, 'doorDining', 'diningCenter');

  connect(graph, 'hallMid', 'doorOffice');
  connect(graph, 'doorOffice', 'officeCenter');

  connect(graph, 'hallBottom', 'doorBath');
  connect(graph, 'doorBath', 'bathCenter');

  connect(graph, 'bathCenter', 'doorLaundry');
  connect(graph, 'doorLaundry', 'laundryCenter');

  for (const spot of HIDING_SPOTS) {
    connect(graph, spot.parentNodeId, spot.nodeId);
  }

  return graph;
};

const GRAPH = buildGraph();

const shortestPath = (fromId: string, toId: string) => {
  if (fromId === toId) return [fromId];

  const queue: string[][] = [[fromId]];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) break;

    const last = path[path.length - 1];
    const nextNodes = GRAPH[last] ?? [];

    for (const node of nextNodes) {
      if (visited.has(node)) continue;

      const nextPath = [...path, node];
      if (node === toId) return nextPath;

      visited.add(node);
      queue.push(nextPath);
    }
  }

  return [fromId, toId];
};

const defaultAvatar = (x: number, y: number): AvatarState => ({
  x,
  y,
  visible: false,
  dir: -Math.PI / 2,
  bob: 0,
  scale: 1,
  opacity: 1,
  emote: 'normal',
});

const pluralMoves = (value: number) => {
  if (value === 1) return 'ход';
  if (value > 1 && value < 5) return 'хода';
  return 'ходов';
};

export const ApartmentHideoutGame: React.FC = () => {
  const navigate = useNavigate();

  const movementRafRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const fxTimeoutRef = useRef<number | null>(null);

  const movementRef = useRef<MovementState | null>(null);
  const hiddenSpotIdRef = useRef<string | null>(null);
  const searchStepsRef = useRef(0);
  const p1NodeRef = useRef('entry');
  const p2NodeRef = useRef('entry');
  const avatarsRef = useRef<Record<PlayerId, AvatarState>>({
    p1: {
      ...defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
      visible: true,
    },
    p2: defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
  });

  const [phase, setPhase] = useState<Phase>('p1_hide');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [checkedSpotIds, setCheckedSpotIds] = useState<string[]>([]);
  const [currentSearchSteps, setCurrentSearchSteps] = useState(0);
  const [results, setResults] = useState<{ p1: number | null; p2: number | null }>({
    p1: null,
    p2: null,
  });
  const [openDoorIds, setOpenDoorIds] = useState<string[]>([]);
  const [fx, setFx] = useState<SearchFx>(null);
  const [showResult, setShowResult] = useState(false);
  const [statusTitle, setStatusTitle] = useState('Player 1 hides');
  const [statusText, setStatusText] = useState('Выбери место и подтверди прятку');
  const [isMoving, setIsMoving] = useState(false);
  const [shake, setShake] = useState(0);

  const [avatars, setAvatars] = useState<Record<PlayerId, AvatarState>>({
    p1: {
      ...defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
      visible: true,
    },
    p2: defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
  });

  const selectedSpot = useMemo(
    () => HIDING_SPOTS.find((spot) => spot.id === selectedSpotId) ?? null,
    [selectedSpotId],
  );

  const winnerText = useMemo(() => {
    if (results.p1 === null || results.p2 === null) return '';

    if (results.p1 < results.p2) return 'PLAYER 1 WINS';
    if (results.p2 < results.p1) return 'PLAYER 2 WINS';
    return 'DRAW';
  }, [results]);

  const currentRound =
    phase === 'p1_hide' || phase === 'p2_seek' || phase === 'p2_found'
      ? 1
      : phase === 'match_end'
        ? 2
        : 2;

  const activePlayer = useMemo<PlayerId | null>(() => {
    if (phase === 'p1_hide' || phase === 'p1_seek' || phase === 'p1_found') return 'p1';
    if (phase === 'p2_hide' || phase === 'p2_seek' || phase === 'p2_found') return 'p2';
    return null;
  }, [phase]);

  const isHidePhase = phase === 'p1_hide' || phase === 'p2_hide';
  const isSeekPhase = phase === 'p1_seek' || phase === 'p2_seek';

  const updateAvatar = (player: PlayerId, patch: Partial<AvatarState>) => {
    setAvatars((prev) => {
      const next = {
        ...prev,
        [player]: {
          ...prev[player],
          ...patch,
        },
      };

      avatarsRef.current = next;
      return next;
    });
  };

  const setAvatarsSafe = (next: Record<PlayerId, AvatarState>) => {
    avatarsRef.current = next;
    setAvatars(next);
  };

  const clearTimers = () => {
    if (movementRafRef.current !== null) {
      cancelAnimationFrame(movementRafRef.current);
      movementRafRef.current = null;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (fxTimeoutRef.current !== null) {
      window.clearTimeout(fxTimeoutRef.current);
      fxTimeoutRef.current = null;
    }

    movementRef.current = null;
  };

  const showFx = (nextFx: SearchFx) => {
    setFx(nextFx);

    if (fxTimeoutRef.current !== null) {
      window.clearTimeout(fxTimeoutRef.current);
      fxTimeoutRef.current = null;
    }

    fxTimeoutRef.current = window.setTimeout(() => {
      setFx(null);
    }, nextFx?.kind === 'found' ? 1350 : 950);
  };

  const setSeekerState = (seeker: PlayerId, title: string, subtitle: string) => {
    setStatusTitle(title);
    setStatusText(subtitle);
    updateAvatar(seeker, { emote: 'search', visible: true, opacity: 1 });
  };

  const animateMovement = (ts: number) => {
    const movement = movementRef.current;
    if (!movement) return;

    if (movement.lastTs === 0) movement.lastTs = ts;

    const dt = Math.min(0.035, (ts - movement.lastTs) / 1000);
    movement.lastTs = ts;

    let remaining = dt * 265;

    while (remaining > 0 && movement.segmentIndex < movement.points.length - 1) {
      const from = movement.points[movement.segmentIndex];
      const to = movement.points[movement.segmentIndex + 1];
      const segLen = distance(from, to) || 1;
      const leftOnSegment = segLen * (1 - movement.segmentProgress);

      if (remaining >= leftOnSegment) {
        remaining -= leftOnSegment;
        movement.segmentIndex += 1;
        movement.segmentProgress = 0;
      } else {
        movement.segmentProgress += remaining / segLen;
        remaining = 0;
      }
    }

    let pos: Vec2;
    let dir = avatarsRef.current[movement.player].dir;

    if (movement.segmentIndex >= movement.points.length - 1) {
      pos = movement.points[movement.points.length - 1];
    } else {
      const from = movement.points[movement.segmentIndex];
      const to = movement.points[movement.segmentIndex + 1];

      pos = {
        x: from.x + (to.x - from.x) * movement.segmentProgress,
        y: from.y + (to.y - from.y) * movement.segmentProgress,
      };

      dir = Math.atan2(to.y - from.y, to.x - from.x);
    }

    const walkWave = Math.sin(ts * 0.018);
    updateAvatar(movement.player, {
      x: pos.x,
      y: pos.y,
      dir,
      bob: walkWave * 3,
      scale: 1 + Math.abs(walkWave) * 0.025,
      visible: true,
      opacity: 1,
    });

    const nextOpenDoors = DOORS.filter((door) => {
      if (!movement.nodeIds.includes(door.nodeId)) return false;
      return distance(pos, NAV_NODES[door.nodeId]) < 78;
    }).map((door) => door.id);

    setOpenDoorIds(nextOpenDoors);

    if (movement.segmentIndex >= movement.points.length - 1) {
      const done = movement.onComplete;

      movementRef.current = null;
      setIsMoving(false);
      setOpenDoorIds([]);

      updateAvatar(movement.player, {
        x: pos.x,
        y: pos.y,
        bob: 0,
        scale: 1,
      });

      done();
      return;
    }

    movementRafRef.current = requestAnimationFrame(animateMovement);
  };

  const startMovement = (
    player: PlayerId,
    fromNodeId: string,
    toNodeId: string,
    onComplete: () => void,
  ) => {
    const pathNodeIds = shortestPath(fromNodeId, toNodeId);
    const points = pathNodeIds.map((nodeId) => NAV_NODES[nodeId]).filter(Boolean);

    updateAvatar(player, {
      visible: true,
      opacity: 1,
      emote: phase === 'p1_seek' || phase === 'p2_seek' ? 'search' : 'normal',
    });

    if (points.length <= 1) {
      const first = points[0] ?? NAV_NODES[toNodeId];

      updateAvatar(player, {
        x: first.x,
        y: first.y,
      });

      onComplete();
      return;
    }

    setIsMoving(true);

    movementRef.current = {
      player,
      nodeIds: pathNodeIds,
      points,
      segmentIndex: 0,
      segmentProgress: 0,
      lastTs: 0,
      onComplete,
    };

    if (movementRafRef.current !== null) {
      cancelAnimationFrame(movementRafRef.current);
    }

    movementRafRef.current = requestAnimationFrame(animateMovement);
  };

  const startP1Hide = () => {
    clearTimers();

    hiddenSpotIdRef.current = null;
    searchStepsRef.current = 0;
    p1NodeRef.current = 'entry';
    p2NodeRef.current = 'entry';

    setPhase('p1_hide');
    setSelectedSpotId(null);
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setStatusTitle('Player 1 hides');
    setStatusText('Выбери красивый тайник в квартире и подтверди');
    setShowResult(false);
    setFx(null);
    setOpenDoorIds([]);
    setShake(0);

    setAvatarsSafe({
      p1: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        opacity: 1,
        emote: 'normal',
      },
      p2: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: false,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        opacity: 1,
        emote: 'normal',
      },
    });
  };

  const startP2Seek = () => {
    searchStepsRef.current = 0;
    p2NodeRef.current = 'entry';

    setPhase('p2_seek');
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setSelectedSpotId(null);
    setSeekerState('p2', 'Player 2 seeks', 'Проверяй тайники. Персонаж сам пойдёт по квартире');

    setAvatars((prev) => {
      const next = {
        ...prev,
        p1: {
          ...prev.p1,
          visible: false,
          opacity: 0,
          emote: 'hide' as AvatarEmote,
        },
        p2: {
          ...prev.p2,
          x: NAV_NODES.entry.x,
          y: NAV_NODES.entry.y,
          visible: true,
          opacity: 1,
          dir: -Math.PI / 2,
          bob: 0,
          scale: 1,
          emote: 'search' as AvatarEmote,
        },
      };

      avatarsRef.current = next;
      return next;
    });
  };

  const startP2Hide = () => {
    clearTimers();

    hiddenSpotIdRef.current = null;
    searchStepsRef.current = 0;
    p1NodeRef.current = 'entry';
    p2NodeRef.current = 'entry';

    setPhase('p2_hide');
    setSelectedSpotId(null);
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setStatusTitle('Player 2 hides');
    setStatusText('Теперь второй игрок выбирает тайник');
    setOpenDoorIds([]);
    setFx(null);
    setShake(0);

    setAvatarsSafe({
      p1: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: false,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        opacity: 1,
        emote: 'normal',
      },
      p2: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        opacity: 1,
        emote: 'normal',
      },
    });
  };

  const startP1Seek = () => {
    searchStepsRef.current = 0;
    p1NodeRef.current = 'entry';

    setPhase('p1_seek');
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setSelectedSpotId(null);
    setSeekerState('p1', 'Player 1 seeks', 'Проверяй места, пока не найдёшь соперника');

    setAvatars((prev) => {
      const next = {
        ...prev,
        p2: {
          ...prev.p2,
          visible: false,
          opacity: 0,
          emote: 'hide' as AvatarEmote,
        },
        p1: {
          ...prev.p1,
          x: NAV_NODES.entry.x,
          y: NAV_NODES.entry.y,
          visible: true,
          opacity: 1,
          dir: -Math.PI / 2,
          bob: 0,
          scale: 1,
          emote: 'search' as AvatarEmote,
        },
      };

      avatarsRef.current = next;
      return next;
    });
  };

  const startMatch = () => {
    setResults({ p1: null, p2: null });
    startP1Hide();
  };

  const finishMatch = () => {
    setPhase('match_end');
    setStatusTitle('Match finished');
    setStatusText('Сравниваем, кто нашёл быстрее');
    setShowResult(true);
  };

  const confirmHide = () => {
    if (isMoving || !selectedSpotId) return;

    const spot = HIDING_SPOTS.find((item) => item.id === selectedSpotId);
    if (!spot) return;

    if (phase === 'p1_hide') {
      setStatusTitle('Player 1 moves');
      setStatusText(`Идёт к тайнику: ${spot.label}`);

      startMovement('p1', p1NodeRef.current, spot.nodeId, () => {
        p1NodeRef.current = spot.nodeId;
        hiddenSpotIdRef.current = spot.id;

        updateAvatar('p1', {
          x: spot.x,
          y: spot.y,
          visible: false,
          opacity: 0,
          emote: 'hide',
          bob: 0,
          scale: 1,
        });

        transitionTimeoutRef.current = window.setTimeout(() => {
          startP2Seek();
        }, 500);
      });
    }

    if (phase === 'p2_hide') {
      setStatusTitle('Player 2 moves');
      setStatusText(`Идёт к тайнику: ${spot.label}`);

      startMovement('p2', p2NodeRef.current, spot.nodeId, () => {
        p2NodeRef.current = spot.nodeId;
        hiddenSpotIdRef.current = spot.id;

        updateAvatar('p2', {
          x: spot.x,
          y: spot.y,
          visible: false,
          opacity: 0,
          emote: 'hide',
          bob: 0,
          scale: 1,
        });

        transitionTimeoutRef.current = window.setTimeout(() => {
          startP1Seek();
        }, 500);
      });
    }
  };

  const handleSearchSpot = (spot: Spot) => {
    if (isMoving) return;
    if (phase !== 'p1_seek' && phase !== 'p2_seek') return;
    if (checkedSpotIds.includes(spot.id)) return;

    const seeker: PlayerId = phase === 'p1_seek' ? 'p1' : 'p2';
    const hiddenPlayer: PlayerId = seeker === 'p1' ? 'p2' : 'p1';
    const fromNode = seeker === 'p1' ? p1NodeRef.current : p2NodeRef.current;

    setStatusTitle(`${seeker === 'p1' ? 'Player 1' : 'Player 2'} checks`);
    setStatusText(`Проверка: ${spot.label}`);

    startMovement(seeker, fromNode, spot.nodeId, () => {
      if (seeker === 'p1') p1NodeRef.current = spot.nodeId;
      else p2NodeRef.current = spot.nodeId;

      const nextSteps = searchStepsRef.current + 1;
      searchStepsRef.current = nextSteps;
      setCurrentSearchSteps(nextSteps);

      if (hiddenSpotIdRef.current === spot.id) {
        setShake(1);
        window.setTimeout(() => setShake(0), 420);

        updateAvatar(hiddenPlayer, {
          x: spot.x,
          y: spot.y,
          visible: true,
          opacity: 1,
          emote: 'surprise',
          scale: 1.08,
        });

        updateAvatar(seeker, {
          emote: 'happy',
          scale: 1.06,
        });

        showFx({
          kind: 'found',
          x: spot.x,
          y: spot.y,
          label: 'FOUND',
        });

        if (seeker === 'p2') {
          setResults((prev) => ({ ...prev, p2: nextSteps }));
          setPhase('p2_found');
          setStatusTitle('Player 2 found Player 1');
          setStatusText(`Найдено за ${nextSteps} ${pluralMoves(nextSteps)}`);

          transitionTimeoutRef.current = window.setTimeout(() => {
            startP2Hide();
          }, 1800);
        } else {
          setResults((prev) => ({ ...prev, p1: nextSteps }));
          setPhase('p1_found');
          setStatusTitle('Player 1 found Player 2');
          setStatusText(`Найдено за ${nextSteps} ${pluralMoves(nextSteps)}`);

          transitionTimeoutRef.current = window.setTimeout(() => {
            finishMatch();
          }, 1900);
        }

        return;
      }

      setCheckedSpotIds((prev) => [...prev, spot.id]);

      updateAvatar(seeker, {
        emote: 'search',
        scale: 1,
      });

      showFx({
        kind: 'empty',
        x: spot.x,
        y: spot.y,
        label: 'EMPTY',
      });

      setStatusTitle('Пусто');
      setStatusText(`Ничего нет • проверено: ${nextSteps}`);
    });
  };

  const getPlayerRoleText = (player: PlayerId) => {
    switch (phase) {
      case 'p1_hide':
        return player === 'p1' ? 'Hiding' : 'Waiting';
      case 'p2_seek':
        return player === 'p2' ? 'Seeking' : 'Hidden';
      case 'p2_found':
        return player === 'p2' ? 'Found' : 'Caught';
      case 'p2_hide':
        return player === 'p2' ? 'Hiding' : 'Waiting';
      case 'p1_seek':
        return player === 'p1' ? 'Seeking' : 'Hidden';
      case 'p1_found':
        return player === 'p1' ? 'Found' : 'Caught';
      case 'match_end':
        return 'Done';
      default:
        return '';
    }
  };

  const renderAvatar = (player: PlayerId) => {
    const avatar = avatars[player];
    if (!avatar.visible) return null;

    const accent =
      player === 'p1'
        ? {
            body: '#14b8a6',
            bodyDark: '#0f766e',
            outline: '#ccfbf1',
            shadow: 'rgba(20,184,166,0.34)',
            beam: 'rgba(45,212,191,0.12)',
          }
        : {
            body: '#fb7185',
            bodyDark: '#e11d48',
            outline: '#ffe4e6',
            shadow: 'rgba(251,113,133,0.34)',
            beam: 'rgba(251,113,133,0.12)',
          };

    const faceY = avatar.emote === 'surprise' ? -6 : -3;
    const beamVisible =
      (phase === 'p1_seek' && player === 'p1') || (phase === 'p2_seek' && player === 'p2');

    const deg = (avatar.dir * 180) / Math.PI;

    return (
      <g
        transform={`translate(${avatar.x} ${avatar.y + avatar.bob}) rotate(${deg}) scale(${avatar.scale})`}
        opacity={avatar.opacity}
        style={{ pointerEvents: 'none' }}
      >
        <ellipse cx="0" cy="20" rx="17" ry="7" fill="rgba(0,0,0,0.22)" />

        {beamVisible && (
          <path
            d="M 0 -8 L 96 -42 L 96 42 Z"
            fill={accent.beam}
            style={{ animation: 'hideoutBeam 1.3s ease-in-out infinite' }}
          />
        )}

        {avatar.emote === 'surprise' && (
          <g style={{ animation: 'hideoutCaughtPop .7s ease-out infinite' }}>
            <path d="M -20 -34 L -29 -48" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <path d="M 0 -39 L 0 -55" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <path d="M 20 -34 L 29 -48" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
          </g>
        )}

        <path
          d="M -11 14 C -15 1 -10 -14 0 -17 C 10 -14 15 1 11 14 C 8 22 -8 22 -11 14 Z"
          fill={accent.body}
          stroke={accent.outline}
          strokeWidth="2"
          filter={`drop-shadow(0 0 10px ${accent.shadow})`}
        />

        <ellipse cx="0" cy="-4" rx="8.8" ry="8" fill="#fff7ed" />
        <circle cx="-3.2" cy={faceY} r="1.2" fill="#111827" />
        <circle cx="3.2" cy={faceY} r="1.2" fill="#111827" />

        {avatar.emote === 'surprise' ? (
          <circle cx="0" cy="0.7" r="2" fill="#111827" />
        ) : avatar.emote === 'happy' ? (
          <path d="M -3 0.4 Q 0 3.4 3 0.4" stroke="#111827" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        ) : avatar.emote === 'search' ? (
          <path d="M -3 1.3 L 3 1.3" stroke="#111827" strokeWidth="1.35" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M -2.6 0.6 Q 0 2 2.6 0.6" stroke="#111827" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        )}

        <path d="M -11 3 Q -18 9 -12 13" stroke={accent.bodyDark} strokeWidth="3.9" fill="none" strokeLinecap="round" />
        <path d="M 11 3 Q 18 9 12 13" stroke={accent.bodyDark} strokeWidth="3.9" fill="none" strokeLinecap="round" />
        <path d="M -4 16 Q -5 22 -2 25" stroke={accent.bodyDark} strokeWidth="3.9" fill="none" strokeLinecap="round" />
        <path d="M 4 16 Q 5 22 2 25" stroke={accent.bodyDark} strokeWidth="3.9" fill="none" strokeLinecap="round" />

        <circle cx="0" cy="-15.8" r="2.1" fill="rgba(255,255,255,0.34)" />
      </g>
    );
  };

  useEffect(() => {
    const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlTouch = document.documentElement.style.touchAction;
    const prevBodyTouch = document.body.style.touchAction;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyUserSelect = document.body.style.userSelect;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.userSelect = 'none';

    const preventTouch = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    startMatch();

    return () => {
      clearTimers();

      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.touchAction = prevHtmlTouch;
      document.body.style.touchAction = prevBodyTouch;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.userSelect = prevBodyUserSelect;

      document.removeEventListener('touchmove', preventTouch);
      document.removeEventListener('contextmenu', preventContext);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderRoomFurniture = () => (
    <>
      <rect x="110" y="230" width="126" height="66" rx="18" fill="#557c64" />
      <rect x="120" y="238" width="106" height="22" rx="11" fill="#79a985" />
      <rect x="120" y="266" width="106" height="20" rx="10" fill="#6b9c76" />
      <rect x="326" y="218" width="58" height="74" rx="12" fill="#3f3a33" />
      <rect x="334" y="228" width="42" height="48" rx="8" fill="#111827" />
      <circle cx="262" cy="300" r="34" fill="#e9d8b8" stroke="rgba(0,0,0,0.1)" strokeWidth="3" />
      <circle cx="262" cy="300" r="22" fill="#f7ecd9" />
      <rect x="82" y="164" width="314" height="12" rx="6" fill="#f2efe8" />
      <line x1="130" y1="176" x2="130" y2="204" stroke="#c8b99f" strokeWidth="4" />
      <line x1="216" y1="176" x2="216" y2="204" stroke="#c8b99f" strokeWidth="4" />
      <line x1="302" y1="176" x2="302" y2="204" stroke="#c8b99f" strokeWidth="4" />

      <rect x="108" y="50" width="82" height="42" rx="18" fill="#87a96b" />
      <rect x="296" y="48" width="88" height="44" rx="18" fill="#b98f62" />
      <circle cx="138" cy="64" r="14" fill="#3f8f45" />
      <circle cx="166" cy="75" r="13" fill="#54a75b" />
      <circle cx="340" cy="70" r="15" fill="#e6d7bd" />

      <rect x="196" y="560" width="176" height="110" rx="22" fill="#b56f8b" />
      <rect x="212" y="572" width="144" height="66" rx="16" fill="#eec7d6" />
      <rect x="218" y="576" width="54" height="32" rx="10" fill="#fff7ed" />
      <rect x="88" y="474" width="76" height="112" rx="14" fill="#946249" />
      <rect x="96" y="486" width="60" height="14" rx="6" fill="#b98567" />
      <rect x="96" y="512" width="60" height="14" rx="6" fill="#b98567" />
      <rect x="96" y="538" width="60" height="14" rx="6" fill="#b98567" />
      <circle cx="370" cy="690" r="16" fill="#facc15" opacity="0.65" />

      <rect x="496" y="202" width="56" height="86" rx="14" fill="#a97a55" />
      <rect x="504" y="212" width="40" height="12" rx="6" fill="#d2a679" />
      <rect x="504" y="238" width="40" height="12" rx="6" fill="#d2a679" />
      <rect x="596" y="408" width="52" height="78" rx="14" fill="#b69d7b" />
      <circle cx="622" cy="430" r="18" fill="#e9dec9" />
      <path d="M 520 650 Q 560 680 600 650" stroke="#c8aa76" strokeWidth="12" fill="none" strokeLinecap="round" />

      <rect x="714" y="86" width="290" height="54" rx="15" fill="#c9b78f" />
      <rect x="934" y="116" width="74" height="92" rx="16" fill="#dbeafe" />
      <rect x="754" y="180" width="128" height="54" rx="18" fill="#dfc998" />
      <circle cx="788" cy="207" r="10" fill="#f8fafc" />
      <circle cx="842" cy="207" r="10" fill="#f8fafc" />
      <rect x="728" y="96" width="54" height="30" rx="8" fill="#eef2ff" />
      <rect x="806" y="96" width="58" height="30" rx="8" fill="#374151" />
      <circle cx="820" cy="111" r="7" fill="#111827" />
      <circle cx="848" cy="111" r="7" fill="#111827" />

      <ellipse cx="866" cy="364" rx="78" ry="40" fill="#c59a62" />
      <ellipse cx="866" cy="364" rx="58" ry="28" fill="#dfbf87" />
      <circle cx="770" cy="364" r="15" fill="#8b5e34" />
      <circle cx="962" cy="364" r="15" fill="#8b5e34" />
      <rect x="972" y="324" width="52" height="84" rx="12" fill="#8b5e34" />
      <circle cx="998" cy="348" r="6" fill="#fef3c7" />
      <circle cx="998" cy="382" r="6" fill="#fef3c7" />

      <rect x="884" y="466" width="104" height="54" rx="14" fill="#8b6f47" />
      <rect x="912" y="474" width="44" height="26" rx="6" fill="#111827" />
      <rect x="718" y="472" width="50" height="96" rx="12" fill="#5b6f7d" />
      <rect x="726" y="486" width="34" height="10" rx="5" fill="#dbeafe" />
      <rect x="726" y="508" width="34" height="10" rx="5" fill="#fecaca" />
      <rect x="726" y="530" width="34" height="10" rx="5" fill="#fde68a" />
      <rect x="804" y="536" width="82" height="28" rx="14" fill="#6b7280" />

      <rect x="708" y="616" width="82" height="68" rx="18" fill="#bae6fd" stroke="#f8fafc" strokeWidth="5" />
      <rect x="816" y="632" width="54" height="42" rx="16" fill="#f8fafc" />
      <circle cx="843" cy="653" r="12" fill="#bfdbfe" />
      <rect x="700" y="602" width="48" height="8" rx="4" fill="#94a3b8" />

      <rect x="936" y="618" width="50" height="50" rx="14" fill="#e5e7eb" />
      <circle cx="961" cy="643" r="16" fill="#93c5fd" />
      <rect x="990" y="640" width="38" height="48" rx="8" fill="#b08968" />
      <rect x="1028" y="628" width="22" height="66" rx="8" fill="#9ca3af" />
    </>
  );

  const renderWalls = () => (
    <>
      <rect x="42" y="20" width="1038" height="724" rx="38" fill="none" stroke="#30261e" strokeWidth="16" />

      <line x1="438" y1="126" x2="438" y2="244" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="438" y1="316" x2="438" y2="526" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="438" y1="600" x2="438" y2="724" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />

      <line x1="682" y1="58" x2="682" y2="146" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="220" x2="682" y2="300" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="372" x2="682" y2="466" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="540" x2="682" y2="598" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="672" x2="682" y2="724" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />

      <line x1="58" y1="126" x2="218" y2="126" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="306" y1="126" x2="438" y2="126" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />

      <line x1="58" y1="430" x2="438" y2="430" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="288" x2="1062" y2="288" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="442" x2="1062" y2="442" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="682" y1="596" x2="1062" y2="596" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="918" y1="596" x2="918" y2="618" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />
      <line x1="918" y1="672" x2="918" y2="724" stroke="#30261e" strokeWidth="16" strokeLinecap="round" />

      <rect x="514" y="724" width="92" height="18" rx="9" fill="#b08968" />
    </>
  );

  const renderDoors = () =>
    DOORS.map((door) => {
      const isOpen = openDoorIds.includes(door.id);
      const baseColor = '#8b5e34';
      const doorColor = isOpen ? '#b9824c' : baseColor;

      if (door.orientation === 'vertical') {
        const x = door.x - 6;
        const y = door.y;
        const transform = isOpen
          ? door.openTo === 'left'
            ? `rotate(-64 ${door.x} ${door.y})`
            : `rotate(64 ${door.x} ${door.y})`
          : undefined;

        return (
          <g key={door.id}>
            <rect x={door.x - 11} y={door.y - 6} width="22" height={door.length + 12} rx="10" fill="#efe7db" />
            <rect
              x={x}
              y={y}
              width="12"
              height={door.length}
              rx="6"
              fill={doorColor}
              transform={transform}
              style={{ transition: 'transform .18s ease' }}
            />
            <circle cx={door.x + (door.openTo === 'left' ? -8 : 8)} cy={door.y + door.length * 0.52} r="2.4" fill="#fef3c7" />
          </g>
        );
      }

      const transform = isOpen
        ? door.openTo === 'up'
          ? `rotate(-62 ${door.x} ${door.y})`
          : `rotate(62 ${door.x} ${door.y})`
        : undefined;

      return (
        <g key={door.id}>
          <rect x={door.x - 6} y={door.y - 11} width={door.length + 12} height="22" rx="10" fill="#efe7db" />
          <rect
            x={door.x}
            y={door.y - 6}
            width={door.length}
            height="12"
            rx="6"
            fill={doorColor}
            transform={transform}
            style={{ transition: 'transform .18s ease' }}
          />
          <circle cx={door.x + door.length * 0.52} cy={door.y + (door.openTo === 'up' ? -8 : 8)} r="2.4" fill="#fef3c7" />
        </g>
      );
    });

  const renderRoomLabels = () =>
    ROOMS.map((room) => (
      <text
        key={`${room.id}-label`}
        x={room.x + room.w / 2}
        y={room.y + 28}
        textAnchor="middle"
        fontSize="15"
        fontWeight="900"
        fill="rgba(47,38,30,.52)"
        style={{ pointerEvents: 'none' }}
      >
        {room.label}
      </text>
    ));

  return (
    <>
      <style>{`
        @keyframes hideoutPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: .88; }
        }

        @keyframes hideoutSpotFloat {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }

        @keyframes hideoutPop {
          0% { opacity: 0; transform: translateY(8px) scale(.86); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes hideoutEmptyTap {
          0% { transform: scale(.8); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: scale(1.28); opacity: 0; }
        }

        @keyframes hideoutFoundRing {
          0% { transform: scale(.45); opacity: .9; }
          100% { transform: scale(1.65); opacity: 0; }
        }

        @keyframes hideoutBeam {
          0%,100% { opacity: .56; }
          50% { opacity: 1; }
        }

        @keyframes hideoutCaughtPop {
          0%,100% { transform: translateY(0); opacity: .75; }
          50% { transform: translateY(-3px); opacity: 1; }
        }

        @keyframes hideoutPanelIn {
          0% { opacity: 0; transform: translateY(14px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes hideoutShake {
          0%,100% { transform: translate3d(0,0,0); }
          20% { transform: translate3d(-5px,2px,0); }
          40% { transform: translate3d(5px,-2px,0); }
          60% { transform: translate3d(-3px,-1px,0); }
          80% { transform: translate3d(3px,1px,0); }
        }
      `}</style>

      <div
        className="relative box-border h-full w-full overflow-hidden touch-none select-none bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,.14),transparent_28%),linear-gradient(180deg,#f4efe8,#e7dac8_48%,#d7c5ad)] pb-[76px]"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <div className="relative z-10 flex h-full min-h-0 flex-col px-2 pt-1 pb-2">
          <div className="shrink-0 rounded-[24px] border border-black/6 bg-white/68 backdrop-blur-xl px-3 py-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.12)]">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div
                className={`rounded-2xl border px-3 py-1.5 transition-all ${
                  activePlayer === 'p1'
                    ? 'bg-teal-500/14 border-teal-400/20 scale-[1.02]'
                    : 'bg-white/55 border-black/5'
                }`}
              >
                <div className="text-[8px] uppercase tracking-[0.18em] text-black/45 font-bold">
                  Player 1
                </div>
                <div className="mt-0.5 flex items-end gap-2">
                  <div className="text-[22px] font-black text-teal-700 leading-none">
                    {results.p1 ?? '—'}
                  </div>
                  <div className="text-[9px] text-black/45 font-bold pb-0.5">
                    {results.p1 === null ? 'finds' : 'moves'}
                  </div>
                </div>
                <div className="text-[8px] mt-0.5 uppercase tracking-[0.16em] text-black/45 font-bold">
                  {getPlayerRoleText('p1')}
                </div>
              </div>

              <div className="text-center min-w-[132px]">
                <div className="text-[8px] uppercase tracking-[0.22em] text-black/40 font-bold">
                  Luxury Hideout
                </div>
                <div className="text-base font-black text-black leading-none mt-0.5">
                  Round {currentRound}
                </div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.18em] text-amber-700 font-bold">
                  {isHidePhase ? 'Hide phase' : isSeekPhase ? `Search: ${currentSearchSteps}` : 'Role swap'}
                </div>
              </div>

              <div
                className={`rounded-2xl border px-3 py-1.5 text-right transition-all ${
                  activePlayer === 'p2'
                    ? 'bg-rose-500/14 border-rose-400/20 scale-[1.02]'
                    : 'bg-white/55 border-black/5'
                }`}
              >
                <div className="text-[8px] uppercase tracking-[0.18em] text-black/45 font-bold">
                  Player 2
                </div>
                <div className="mt-0.5 flex items-end justify-end gap-2">
                  <div className="text-[9px] text-black/45 font-bold pb-0.5">
                    {results.p2 === null ? 'finds' : 'moves'}
                  </div>
                  <div className="text-[22px] font-black text-rose-700 leading-none">
                    {results.p2 ?? '—'}
                  </div>
                </div>
                <div className="text-[8px] mt-0.5 uppercase tracking-[0.16em] text-black/45 font-bold">
                  {getPlayerRoleText('p2')}
                </div>
              </div>
            </div>

            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2 items-center">
              <div className="min-w-0 rounded-2xl bg-black/5 px-3 py-1.5">
                <div className="text-[10px] font-black text-black truncate">{statusTitle}</div>
                <div className="text-[9px] font-semibold text-black/50 truncate mt-0.5">{statusText}</div>
              </div>

              <button
                onClick={() => navigate(-1)}
                className="shrink-0 rounded-2xl border border-black/8 bg-white/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-black/60 active:scale-95"
              >
                Back
              </button>
            </div>
          </div>

          <div className="relative mt-1.5 min-h-0 flex-1 overflow-hidden rounded-[30px] border border-black/8 bg-white/42 shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_22px_54px_rgba(77,55,32,.18)]">
            <div
              className="absolute inset-0"
              style={{
                animation: shake ? 'hideoutShake .42s ease-out' : undefined,
              }}
            >
              <svg
                viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <pattern id="woodFloor" width="58" height="58" patternUnits="userSpaceOnUse">
                    <rect width="58" height="58" fill="#ead9c2" />
                    <path d="M 0 28 H 58" stroke="rgba(105,73,45,.13)" strokeWidth="2" />
                    <path d="M 28 0 V 58" stroke="rgba(105,73,45,.08)" strokeWidth="1" />
                  </pattern>
                </defs>

                <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="#d8c5ae" />
                <rect x="42" y="20" width="1038" height="724" rx="40" fill="url(#woodFloor)" />

                {ROOMS.map((room) => (
                  <g key={room.id}>
                    <rect
                      x={room.x}
                      y={room.y}
                      width={room.w}
                      height={room.h}
                      rx={room.rx}
                      fill={room.fill}
                      stroke="rgba(70,50,35,.1)"
                      strokeWidth="2"
                    />

                    {room.rug && (
                      <rect
                        x={room.rug.x}
                        y={room.rug.y}
                        width={room.rug.w}
                        height={room.rug.h}
                        rx="28"
                        fill={room.rug.color}
                        opacity="0.55"
                        stroke="rgba(255,255,255,.38)"
                        strokeWidth="3"
                      />
                    )}
                  </g>
                ))}

                <path
                  d="M 560 704 C 560 650 560 582 560 512 C 560 430 560 342 560 184"
                  stroke="rgba(158,116,73,.32)"
                  strokeWidth="76"
                  strokeLinecap="round"
                  fill="none"
                />

                <path
                  d="M 560 704 C 560 650 560 582 560 512 C 560 430 560 342 560 184"
                  stroke="rgba(255,255,255,.22)"
                  strokeWidth="34"
                  strokeLinecap="round"
                  fill="none"
                />

                {renderRoomFurniture()}
                {renderWalls()}
                {renderDoors()}
                {renderRoomLabels()}

                <g opacity="0.22" pointerEvents="none">
                  {Object.entries(NAV_NODES)
                    .filter(([id]) => !id.startsWith('spot_'))
                    .map(([id, point]) => (
                      <circle key={id} cx={point.x} cy={point.y} r="3.5" fill="#0f172a" />
                    ))}
                </g>

                {HIDING_SPOTS.map((spot) => {
                  const isSelected = selectedSpotId === spot.id;
                  const isChecked = checkedSpotIds.includes(spot.id);
                  const isFound = hiddenSpotIdRef.current === spot.id && (phase === 'p1_found' || phase === 'p2_found');
                  const disabled = isMoving || isChecked || phase === 'match_end';

                  return (
                    <g
                      key={spot.id}
                      transform={`translate(${spot.x} ${spot.y})`}
                      onClick={() => {
                        if (disabled) return;

                        if (isHidePhase) {
                          setSelectedSpotId(spot.id);
                          return;
                        }

                        if (isSeekPhase) {
                          handleSearchSpot(spot);
                        }
                      }}
                      style={{
                        cursor: disabled ? 'default' : 'pointer',
                      }}
                    >
                      <g
                        style={{
                          transformOrigin: 'center',
                          transformBox: 'fill-box',
                          animation: isSelected
                            ? 'hideoutPulse .95s ease-in-out infinite'
                            : 'hideoutSpotFloat 2.2s ease-in-out infinite',
                        }}
                      >
                        <circle
                          r={isSelected ? 23 : 20}
                          fill={
                            isChecked
                              ? 'rgba(100,116,139,.14)'
                              : isHidePhase
                                ? 'rgba(245,158,11,.17)'
                                : 'rgba(59,130,246,.13)'
                          }
                          stroke={
                            isSelected
                              ? 'rgba(245,158,11,.95)'
                              : isFound
                                ? 'rgba(16,185,129,.95)'
                                : isChecked
                                  ? 'rgba(100,116,139,.42)'
                                  : 'rgba(15,23,42,.22)'
                          }
                          strokeWidth={isSelected ? 4 : 2}
                        />

                        <circle
                          r="14"
                          fill="rgba(255,255,255,.82)"
                          stroke="rgba(15,23,42,.12)"
                          strokeWidth="1"
                        />

                        <text
                          y="5"
                          textAnchor="middle"
                          fontSize="15"
                          fontWeight="800"
                          fill="#111827"
                          style={{ pointerEvents: 'none' }}
                        >
                          {isSeekPhase ? '⌕' : spot.icon}
                        </text>

                        {isChecked && (
                          <path
                            d="M -8 -8 L 8 8 M 8 -8 L -8 8"
                            stroke="rgba(100,116,139,.82)"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        )}
                      </g>
                    </g>
                  );
                })}

                {fx && (
                  <g transform={`translate(${fx.x} ${fx.y - 38})`} style={{ pointerEvents: 'none' }}>
                    {fx.kind === 'found' ? (
                      <>
                        <circle
                          r="20"
                          fill="rgba(16,185,129,.2)"
                          style={{ animation: 'hideoutFoundRing .8s ease-out forwards' }}
                        />
                        <circle
                          r="12"
                          fill="rgba(16,185,129,.25)"
                          style={{ animation: 'hideoutFoundRing .8s ease-out .08s forwards' }}
                        />
                        <rect x="-54" y="-20" width="108" height="38" rx="19" fill="rgba(16,185,129,.92)" />
                        <text y="6" textAnchor="middle" fontSize="15" fontWeight="950" fill="#ffffff">
                          {fx.label}
                        </text>
                      </>
                    ) : (
                      <>
                        <circle
                          r="22"
                          fill="none"
                          stroke="rgba(100,116,139,.55)"
                          strokeWidth="3"
                          style={{ animation: 'hideoutEmptyTap .58s ease-out forwards' }}
                        />
                        <rect x="-48" y="-19" width="96" height="36" rx="18" fill="rgba(71,85,105,.92)" />
                        <text y="6" textAnchor="middle" fontSize="14" fontWeight="950" fill="#ffffff">
                          {fx.label}
                        </text>
                      </>
                    )}
                  </g>
                )}

                {renderAvatar('p1')}
                {renderAvatar('p2')}
              </svg>

              <div className="absolute inset-x-3 bottom-2 z-20">
                {isHidePhase ? (
                  <div
                    className="rounded-[24px] border border-black/6 bg-white/80 backdrop-blur-xl px-3 py-2 shadow-[0_18px_36px_rgba(0,0,0,.12)]"
                    style={{ animation: 'hideoutPanelIn .22s ease-out' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] uppercase tracking-[0.18em] text-black/38 font-bold">
                          Selected hideout
                        </div>
                        <div className="text-sm font-black text-black mt-0.5 truncate">
                          {selectedSpot ? `${selectedSpot.icon} ${selectedSpot.label}` : 'Выбери одно из мест на карте'}
                        </div>
                        <div className="text-[10px] text-black/50 font-semibold mt-0.5 truncate">
                          {selectedSpot ? selectedSpot.room : 'Лучше прятаться не в очевидном месте'}
                        </div>
                      </div>

                      <button
                        onClick={confirmHide}
                        disabled={!selectedSpot || isMoving}
                        className={`shrink-0 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.12em] transition ${
                          selectedSpot && !isMoving
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white active:scale-[0.98] shadow-lg shadow-amber-500/20'
                            : 'bg-black/8 text-black/30'
                        }`}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                ) : isSeekPhase ? (
                  <div
                    className="rounded-[24px] border border-black/6 bg-white/80 backdrop-blur-xl px-3 py-2 shadow-[0_18px_36px_rgba(0,0,0,.12)]"
                    style={{ animation: 'hideoutPanelIn .22s ease-out' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase tracking-[0.18em] text-black/38 font-bold">
                          Search
                        </div>
                        <div className="text-sm font-black text-black mt-0.5">
                          Проверено: {checkedSpotIds.length} / {HIDING_SPOTS.length}
                        </div>
                        <div className="text-[10px] text-black/55 font-semibold mt-0.5">
                          Нажимай на непроверенные места
                        </div>
                      </div>

                      <div className="shrink-0 rounded-2xl bg-black px-4 py-2.5 text-white text-center min-w-[80px]">
                        <div className="text-[9px] uppercase tracking-[0.16em] text-white/45 font-bold">
                          Moves
                        </div>
                        <div className="text-2xl font-black leading-none mt-0.5">{currentSearchSteps}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {showResult && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/48 p-4 backdrop-blur-md">
                <div
                  className="w-full max-w-[360px] overflow-hidden rounded-[34px] border border-white/20 bg-[#17110d]/96 text-center shadow-2xl"
                  style={{ animation: 'hideoutPop .28s ease-out' }}
                >
                  <div className="h-2 bg-gradient-to-r from-teal-400 via-amber-300 to-rose-400" />

                  <div className="p-6">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-white/38 font-black">
                      Result
                    </div>

                    <div className="mt-2 text-4xl font-black text-white tracking-tight">
                      {winnerText}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-3xl border border-teal-300/14 bg-teal-300/10 px-4 py-4">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/42 font-black">
                          Player 1
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-teal-200">
                          {results.p1 ?? '—'}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-rose-300/14 bg-rose-300/10 px-4 py-4">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/42 font-black">
                          Player 2
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-rose-200">
                          {results.p2 ?? '—'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={startMatch}
                      className="mt-7 w-full rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl transition active:scale-[0.98]"
                    >
                      Play Again
                    </button>

                    <button
                      onClick={() => navigate(-1)}
                      className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/80 transition active:scale-[0.98]"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ApartmentHideoutGame;