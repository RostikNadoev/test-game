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

type AvatarState = {
  x: number;
  y: number;
  visible: boolean;
  dir: number;
  bob: number;
  scale: number;
  emote: 'normal' | 'search' | 'happy' | 'surprise' | 'hide';
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

const WORLD_W = 1080;
const WORLD_H = 760;

const BASE_NODES: Record<string, Vec2> = {
  entry: { x: 540, y: 688 },
  hallBottom: { x: 540, y: 622 },
  hallMid: { x: 540, y: 470 },
  hallTop: { x: 540, y: 175 },

  doorLiving: { x: 430, y: 220 },
  livingCenter: { x: 250, y: 230 },

  doorBalcony: { x: 250, y: 100 },
  balconyCenter: { x: 250, y: 58 },

  doorBedroom: { x: 430, y: 540 },
  bedroomCenter: { x: 250, y: 540 },

  doorKitchen: { x: 650, y: 140 },
  kitchenCenter: { x: 820, y: 140 },

  doorOffice: { x: 650, y: 360 },
  officeCenter: { x: 820, y: 360 },

  doorBath: { x: 650, y: 600 },
  bathCenter: { x: 735, y: 600 },

  doorStorage: { x: 890, y: 500 },
  storageCenter: { x: 895, y: 610 },
};

const HIDING_SPOTS: Spot[] = [
  {
    id: 'hall_closet',
    label: 'Шкаф в прихожей',
    room: 'Hall',
    nodeId: 'spot_hall_closet',
    parentNodeId: 'hallTop',
    x: 476,
    y: 102,
    icon: '🧥',
  },
  {
    id: 'living_sofa',
    label: 'За диваном',
    room: 'Living',
    nodeId: 'spot_living_sofa',
    parentNodeId: 'livingCenter',
    x: 154,
    y: 262,
    icon: '🛋️',
  },
  {
    id: 'living_tv',
    label: 'У ТВ тумбы',
    room: 'Living',
    nodeId: 'spot_living_tv',
    parentNodeId: 'livingCenter',
    x: 346,
    y: 244,
    icon: '📺',
  },
  {
    id: 'balcony_plants',
    label: 'Среди растений',
    room: 'Balcony',
    nodeId: 'spot_balcony_plants',
    parentNodeId: 'balconyCenter',
    x: 152,
    y: 58,
    icon: '🪴',
  },
  {
    id: 'balcony_bench',
    label: 'За скамьёй',
    room: 'Balcony',
    nodeId: 'spot_balcony_bench',
    parentNodeId: 'balconyCenter',
    x: 326,
    y: 58,
    icon: '🪑',
  },
  {
    id: 'bedroom_wardrobe',
    label: 'У шкафа',
    room: 'Bedroom',
    nodeId: 'spot_bedroom_wardrobe',
    parentNodeId: 'bedroomCenter',
    x: 122,
    y: 540,
    icon: '👔',
  },
  {
    id: 'bedroom_bed',
    label: 'Под кроватью',
    room: 'Bedroom',
    nodeId: 'spot_bedroom_bed',
    parentNodeId: 'bedroomCenter',
    x: 292,
    y: 628,
    icon: '🛏️',
  },
  {
    id: 'kitchen_fridge',
    label: 'За холодильником',
    room: 'Kitchen',
    nodeId: 'spot_kitchen_fridge',
    parentNodeId: 'kitchenCenter',
    x: 930,
    y: 90,
    icon: '🧊',
  },
  {
    id: 'kitchen_island',
    label: 'У кухонного острова',
    room: 'Kitchen',
    nodeId: 'spot_kitchen_island',
    parentNodeId: 'kitchenCenter',
    x: 742,
    y: 200,
    icon: '🍽️',
  },
  {
    id: 'office_desk',
    label: 'За столом',
    room: 'Office',
    nodeId: 'spot_office_desk',
    parentNodeId: 'officeCenter',
    x: 916,
    y: 320,
    icon: '💻',
  },
  {
    id: 'office_books',
    label: 'У стеллажа',
    room: 'Office',
    nodeId: 'spot_office_books',
    parentNodeId: 'officeCenter',
    x: 708,
    y: 430,
    icon: '📚',
  },
  {
    id: 'bath_shower',
    label: 'В душевой',
    room: 'Bath',
    nodeId: 'spot_bath_shower',
    parentNodeId: 'bathCenter',
    x: 688,
    y: 560,
    icon: '🚿',
  },
  {
    id: 'storage_boxes',
    label: 'Среди коробок',
    room: 'Storage',
    nodeId: 'spot_storage_boxes',
    parentNodeId: 'storageCenter',
    x: 906,
    y: 652,
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
    x: 430,
    y: 198,
    orientation: 'vertical',
    openTo: 'left',
    length: 48,
  },
  {
    id: 'door_bedroom',
    nodeId: 'doorBedroom',
    x: 430,
    y: 518,
    orientation: 'vertical',
    openTo: 'left',
    length: 48,
  },
  {
    id: 'door_kitchen',
    nodeId: 'doorKitchen',
    x: 650,
    y: 118,
    orientation: 'vertical',
    openTo: 'right',
    length: 48,
  },
  {
    id: 'door_office',
    nodeId: 'doorOffice',
    x: 650,
    y: 338,
    orientation: 'vertical',
    openTo: 'right',
    length: 48,
  },
  {
    id: 'door_bath',
    nodeId: 'doorBath',
    x: 650,
    y: 578,
    orientation: 'vertical',
    openTo: 'right',
    length: 48,
  },
  {
    id: 'door_storage',
    nodeId: 'doorStorage',
    x: 868,
    y: 500,
    orientation: 'horizontal',
    openTo: 'down',
    length: 48,
  },
  {
    id: 'door_balcony',
    nodeId: 'doorBalcony',
    x: 226,
    y: 100,
    orientation: 'horizontal',
    openTo: 'up',
    length: 48,
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

  connect(graph, 'hallTop', 'doorLiving');
  connect(graph, 'doorLiving', 'livingCenter');

  connect(graph, 'livingCenter', 'doorBalcony');
  connect(graph, 'doorBalcony', 'balconyCenter');

  connect(graph, 'hallBottom', 'doorBedroom');
  connect(graph, 'doorBedroom', 'bedroomCenter');

  connect(graph, 'hallTop', 'doorKitchen');
  connect(graph, 'doorKitchen', 'kitchenCenter');

  connect(graph, 'hallMid', 'doorOffice');
  connect(graph, 'doorOffice', 'officeCenter');

  connect(graph, 'hallBottom', 'doorBath');
  connect(graph, 'doorBath', 'bathCenter');

  connect(graph, 'officeCenter', 'doorStorage');
  connect(graph, 'doorStorage', 'storageCenter');

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
  dir: Math.PI / 2,
  bob: 0,
  scale: 1,
  emote: 'normal',
});

const roomFill = {
  hall: '#efe7db',
  living: '#dcebd9',
  balcony: '#d6ead4',
  bedroom: '#ead7df',
  kitchen: '#f0ead7',
  office: '#d9e5ee',
  bath: '#d9f0f4',
  storage: '#e6e0d7',
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

  const [avatars, setAvatars] = useState<Record<PlayerId, AvatarState>>({
    p1: {
      ...defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
      visible: true,
      emote: 'normal',
    },
    p2: defaultAvatar(NAV_NODES.entry.x, NAV_NODES.entry.y),
  });

  const lockDocument = () => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';
  };

  const unlockDocument = (
    prevHtmlOverflow: string,
    prevBodyOverflow: string,
    prevHtmlOverscroll: string,
    prevBodyOverscroll: string,
    prevBodyTouch: string,
  ) => {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    document.body.style.overscrollBehavior = prevBodyOverscroll;
    document.body.style.touchAction = prevBodyTouch;
  };

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

  const currentRound = phase === 'p1_hide' || phase === 'p2_seek' || phase === 'p2_found' ? 1 : phase === 'match_end' ? 2 : 2;

  const activePlayer = useMemo<PlayerId | null>(() => {
    if (phase === 'p1_hide' || phase === 'p1_seek' || phase === 'p1_found') return 'p1';
    if (phase === 'p2_hide' || phase === 'p2_seek' || phase === 'p2_found') return 'p2';
    return null;
  }, [phase]);

  const updateAvatar = (player: PlayerId, patch: Partial<AvatarState>) => {
    setAvatars((prev) => ({
      ...prev,
      [player]: {
        ...prev[player],
        ...patch,
      },
    }));
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
    }, 1200);
  };

  const setSeekerState = (seeker: PlayerId, title: string, subtitle: string) => {
    setStatusTitle(title);
    setStatusText(subtitle);
    updateAvatar(seeker, { emote: 'search', visible: true });
  };

  const animateMovement = (ts: number) => {
    const movement = movementRef.current;
    if (!movement) return;

    if (movement.lastTs === 0) movement.lastTs = ts;

    const dt = (ts - movement.lastTs) / 1000;
    movement.lastTs = ts;

    let remaining = dt * 230;

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
    let dir = avatars[movement.player].dir;

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
      bob: walkWave * 2.6,
      scale: 1 + Math.abs(walkWave) * 0.02,
      visible: true,
    });

    const nextOpenDoors = DOORS.filter((door) => {
      if (!movement.nodeIds.includes(door.nodeId)) return false;
      return distance(pos, NAV_NODES[door.nodeId]) < 70;
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
    const points = pathNodeIds.map((nodeId) => NAV_NODES[nodeId]);

    updateAvatar(player, {
      visible: true,
      emote: phase === 'p1_seek' || phase === 'p2_seek' ? 'search' : 'normal',
    });

    if (points.length <= 1) {
      updateAvatar(player, {
        x: points[0].x,
        y: points[0].y,
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
    hiddenSpotIdRef.current = null;
    searchStepsRef.current = 0;

    p1NodeRef.current = 'entry';
    p2NodeRef.current = 'entry';

    setPhase('p1_hide');
    setSelectedSpotId(null);
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setStatusTitle('Player 1 hides');
    setStatusText('Выбери место в квартире и подтверди прятку');
    setShowResult(false);
    setFx(null);
    setOpenDoorIds([]);

    setAvatars({
      p1: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        emote: 'normal',
      },
      p2: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: false,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
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
    setSeekerState('p2', 'Player 2 seeks', 'Тапай по местам, чтобы проверять тайники');

    setAvatars((prev) => ({
      ...prev,
      p1: {
        ...prev.p1,
        visible: false,
        emote: 'hide',
      },
      p2: {
        ...prev.p2,
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        emote: 'search',
      },
    }));
  };

  const startP2Hide = () => {
    hiddenSpotIdRef.current = null;
    searchStepsRef.current = 0;

    p1NodeRef.current = 'entry';
    p2NodeRef.current = 'entry';

    setPhase('p2_hide');
    setSelectedSpotId(null);
    setCheckedSpotIds([]);
    setCurrentSearchSteps(0);
    setStatusTitle('Player 2 hides');
    setStatusText('Теперь второй игрок выбирает свой тайник');
    setOpenDoorIds([]);
    setFx(null);

    setAvatars({
      p1: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: false,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        emote: 'normal',
      },
      p2: {
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
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

    setAvatars((prev) => ({
      ...prev,
      p2: {
        ...prev.p2,
        visible: false,
        emote: 'hide',
      },
      p1: {
        ...prev.p1,
        x: NAV_NODES.entry.x,
        y: NAV_NODES.entry.y,
        visible: true,
        dir: -Math.PI / 2,
        bob: 0,
        scale: 1,
        emote: 'search',
      },
    }));
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
          emote: 'hide',
          bob: 0,
          scale: 1,
        });

        transitionTimeoutRef.current = window.setTimeout(() => {
          startP2Seek();
        }, 420);
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
          emote: 'hide',
          bob: 0,
          scale: 1,
        });

        transitionTimeoutRef.current = window.setTimeout(() => {
          startP1Seek();
        }, 420);
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
        updateAvatar(hiddenPlayer, {
          x: spot.x,
          y: spot.y,
          visible: true,
          emote: 'surprise',
          scale: 1.04,
        });

        updateAvatar(seeker, {
          emote: 'happy',
          scale: 1.04,
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
          setStatusText(`Найдено за ${nextSteps} ${nextSteps === 1 ? 'ход' : nextSteps < 5 ? 'хода' : 'ходов'}`);

          transitionTimeoutRef.current = window.setTimeout(() => {
            startP2Hide();
          }, 1700);
        } else {
          setResults((prev) => ({ ...prev, p1: nextSteps }));
          setPhase('p1_found');
          setStatusTitle('Player 1 found Player 2');
          setStatusText(`Найдено за ${nextSteps} ${nextSteps === 1 ? 'ход' : nextSteps < 5 ? 'хода' : 'ходов'}`);

          transitionTimeoutRef.current = window.setTimeout(() => {
            finishMatch();
          }, 1800);
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
      setStatusText(`Ничего нет • уже проверено: ${nextSteps}`);
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

    const accent = player === 'p1'
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
        style={{ pointerEvents: 'none' }}
      >
        <ellipse cx="0" cy="19" rx="16" ry="7" fill="rgba(0,0,0,0.18)" />

        {beamVisible && (
          <path
            d="M 0 -8 L 92 -46 L 92 46 Z"
            fill={accent.beam}
          />
        )}

        <path
          d="M -10 13 C -14 0 -10 -13 0 -16 C 10 -13 14 0 10 13 C 8 20 -8 20 -10 13 Z"
          fill={accent.body}
          stroke={accent.outline}
          strokeWidth="2"
          filter={`drop-shadow(0 0 10px ${accent.shadow})`}
        />

        <ellipse cx="0" cy="-4" rx="8.5" ry="7.8" fill="#fff7ed" />
        <circle cx="-3.2" cy={faceY} r="1.2" fill="#111827" />
        <circle cx="3.2" cy={faceY} r="1.2" fill="#111827" />

        {avatar.emote === 'surprise' ? (
          <circle cx="0" cy="0.5" r="1.8" fill="#111827" />
        ) : avatar.emote === 'happy' ? (
          <path d="M -3 0.4 Q 0 3.3 3 0.4" stroke="#111827" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M -2.6 0.6 Q 0 2 2.6 0.6" stroke="#111827" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        )}

        <path d="M -11 2 Q -17 8 -12 12" stroke={accent.bodyDark} strokeWidth="3.8" fill="none" strokeLinecap="round" />
        <path d="M 11 2 Q 17 8 12 12" stroke={accent.bodyDark} strokeWidth="3.8" fill="none" strokeLinecap="round" />
        <path d="M -4 15 Q -5 21 -2 24" stroke={accent.bodyDark} strokeWidth="3.8" fill="none" strokeLinecap="round" />
        <path d="M 4 15 Q 5 21 2 24" stroke={accent.bodyDark} strokeWidth="3.8" fill="none" strokeLinecap="round" />

        <circle cx="0" cy="-15.4" r="2.1" fill="rgba(255,255,255,0.34)" />
      </g>
    );
  };

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyTouch = document.body.style.touchAction;

    lockDocument();
    startMatch();

    return () => {
      clearTimers();
      unlockDocument(
        prevHtmlOverflow,
        prevBodyOverflow,
        prevHtmlOverscroll,
        prevBodyOverscroll,
        prevBodyTouch,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHidePhase = phase === 'p1_hide' || phase === 'p2_hide';
  const isSeekPhase = phase === 'p1_seek' || phase === 'p2_seek';

  return (
    <>
      <style>{`
        @keyframes hideoutPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: .88; }
        }

        @keyframes hideoutFloat {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }

        @keyframes hideoutPop {
          0% { opacity: 0; transform: translateY(8px) scale(.86); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes hideoutFoundRing {
          0% { transform: scale(.4); opacity: .9; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        @keyframes hideoutSpark {
          0%,100% { opacity: .8; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        className="w-full h-full overflow-hidden touch-none select-none bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.14),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.16),transparent_22%),linear-gradient(180deg,#f4efe8,#ebe3d7_42%,#e5dcca)]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="h-full flex flex-col px-2 pt-2 pb-1">
          <div className="shrink-0 rounded-[28px] border border-black/6 bg-white/65 backdrop-blur-xl px-3 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.12)]">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div
                className={`rounded-2xl border px-3 py-2 transition-all ${
                  activePlayer === 'p1'
                    ? 'bg-teal-500/14 border-teal-400/20 scale-[1.02]'
                    : 'bg-white/55 border-black/5'
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/45 font-bold">
                  Player 1
                </div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-[28px] font-black text-teal-700 leading-none">
                    {results.p1 ?? '—'}
                  </div>
                  <div className="text-xs text-black/45 font-bold pb-0.5">
                    {results.p1 === null ? 'finds' : 'moves'}
                  </div>
                </div>
                <div className="text-[10px] mt-1 uppercase tracking-[0.16em] text-black/45 font-bold">
                  {getPlayerRoleText('p1')}
                </div>
              </div>

              <div className="text-center min-w-[142px]">
                <div className="text-[10px] uppercase tracking-[0.22em] text-black/40 font-bold">
                  Apartment Hideout
                </div>
                <div className="text-lg font-black text-black leading-none mt-1">
                  Round {currentRound}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-amber-700 font-bold">
                  {isHidePhase ? 'Hide phase' : isSeekPhase ? `Search moves: ${currentSearchSteps}` : 'Role swap'}
                </div>
              </div>

              <div
                className={`rounded-2xl border px-3 py-2 text-right transition-all ${
                  activePlayer === 'p2'
                    ? 'bg-rose-500/14 border-rose-400/20 scale-[1.02]'
                    : 'bg-white/55 border-black/5'
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/45 font-bold">
                  Player 2
                </div>
                <div className="mt-1 flex items-end justify-end gap-2">
                  <div className="text-xs text-black/45 font-bold pb-0.5">
                    {results.p2 === null ? 'finds' : 'moves'}
                  </div>
                  <div className="text-[28px] font-black text-rose-700 leading-none">
                    {results.p2 ?? '—'}
                  </div>
                </div>
                <div className="text-[10px] mt-1 uppercase tracking-[0.16em] text-black/45 font-bold">
                  {getPlayerRoleText('p2')}
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/38 font-bold">
                  Status
                </div>
                <div className="text-sm font-black text-black mt-1 truncate">{statusTitle}</div>
                <div className="text-[11px] text-black/55 font-semibold mt-1 truncate">{statusText}</div>
              </div>

              <button
                onClick={() => navigate('/')}
                className="shrink-0 px-3 py-2 rounded-full bg-black text-white text-[10px] uppercase tracking-[0.18em] font-black active:scale-95 transition"
              >
                Exit
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 pt-2 pb-1">
            <div className="absolute inset-0 rounded-[34px] overflow-hidden border border-black/6 bg-white/45 backdrop-blur-sm shadow-[0_16px_50px_rgba(0,0,0,0.10)]">
              <div className="absolute -left-6 top-6 h-44 w-44 rounded-full bg-amber-300/30 blur-3xl" />
              <div className="absolute right-0 bottom-0 h-48 w-48 rounded-full bg-teal-300/30 blur-3xl" />
            </div>

            <div className="relative h-full">
              <svg
                viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
                className="w-full h-full block"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <linearGradient id="wallPaint" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fbfaf7" />
                    <stop offset="100%" stopColor="#ebe6dd" />
                  </linearGradient>

                  <linearGradient id="woodFloor" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#cfb48e" />
                    <stop offset="100%" stopColor="#b68f64" />
                  </linearGradient>

                  <linearGradient id="tileFloor" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#dbe7ea" />
                    <stop offset="100%" stopColor="#c8d8dd" />
                  </linearGradient>
                </defs>

                <rect x="40" y="20" width="1000" height="700" rx="34" fill="url(#wallPaint)" />

                <rect x="70" y="20" width="360" height="80" rx="20" fill={roomFill.balcony} />
                <rect x="70" y="100" width="360" height="250" rx="24" fill={roomFill.living} />
                <rect x="70" y="350" width="360" height="370" rx="24" fill={roomFill.bedroom} />
                <rect x="430" y="20" width="220" height="700" rx="20" fill={roomFill.hall} />
                <rect x="650" y="20" width="320" height="200" rx="24" fill={roomFill.kitchen} />
                <rect x="650" y="220" width="320" height="280" rx="24" fill={roomFill.office} />
                <rect x="650" y="500" width="170" height="220" rx="22" fill={roomFill.bath} />
                <rect x="820" y="500" width="150" height="220" rx="22" fill={roomFill.storage} />

                <rect x="84" y="114" width="332" height="222" rx="18" fill="url(#woodFloor)" opacity="0.18" />
                <rect x="84" y="364" width="332" height="342" rx="18" fill="url(#woodFloor)" opacity="0.16" />
                <rect x="444" y="34" width="192" height="672" rx="16" fill="url(#woodFloor)" opacity="0.12" />
                <rect x="664" y="34" width="292" height="172" rx="18" fill="url(#tileFloor)" opacity="0.38" />
                <rect x="664" y="234" width="292" height="252" rx="18" fill="#cfdae6" opacity="0.28" />
                <rect x="664" y="514" width="142" height="192" rx="18" fill="url(#tileFloor)" opacity="0.42" />
                <rect x="834" y="514" width="122" height="192" rx="18" fill="#ddd7cc" opacity="0.36" />

                <rect x="132" y="46" width="200" height="28" rx="12" fill="#93c5aa" opacity="0.35" />
                <circle cx="120" cy="62" r="12" fill="#6aa17c" />
                <circle cx="346" cy="58" r="14" fill="#6aa17c" />
                <rect x="224" y="46" width="30" height="30" rx="15" fill="#f7f2ea" stroke="#b89a72" strokeWidth="2" />

                <rect x="108" y="220" width="128" height="54" rx="20" fill="#7e8f78" />
                <rect x="108" y="248" width="88" height="48" rx="16" fill="#6c7c67" />
                <rect x="250" y="208" width="92" height="72" rx="18" fill="#d7c6ae" />
                <rect x="320" y="212" width="64" height="18" rx="9" fill="#4b5563" />
                <rect x="276" y="250" width="110" height="22" rx="11" fill="#6b7280" />
                <ellipse cx="245" cy="226" rx="74" ry="48" fill="#efe6d4" opacity="0.5" />
                <rect x="368" y="160" width="22" height="72" rx="11" fill="#d8b38c" />
                <circle cx="379" cy="150" r="12" fill="#f1f5f9" />

                <rect x="142" y="446" width="172" height="108" rx="26" fill="#d8c2ca" />
                <rect x="160" y="464" width="136" height="66" rx="20" fill="#f4edf0" />
                <rect x="124" y="494" width="18" height="94" rx="9" fill="#9f8c76" />
                <rect x="112" y="500" width="22" height="76" rx="11" fill="#c5b49f" />
                <rect x="114" y="602" width="76" height="42" rx="16" fill="#ccb49c" />
                <rect x="320" y="430" width="58" height="134" rx="18" fill="#d3c1aa" />
                <rect x="346" y="446" width="12" height="102" rx="6" fill="#9e7a56" />
                <circle cx="378" cy="648" r="14" fill="#7ea77a" />
                <circle cx="394" cy="632" r="12" fill="#9bc196" />

                <rect x="690" y="58" width="198" height="24" rx="12" fill="#d5c0a4" />
                <rect x="690" y="82" width="56" height="78" rx="16" fill="#d2b28c" />
                <rect x="902" y="52" width="34" height="88" rx="14" fill="#d8dce3" />
                <rect x="760" y="126" width="116" height="58" rx="18" fill="#caa37d" />
                <circle cx="786" cy="194" r="10" fill="#7c8b94" />
                <circle cx="850" cy="194" r="10" fill="#7c8b94" />
                <rect x="702" y="98" width="30" height="20" rx="8" fill="#374151" />
                <rect x="714" y="58" width="42" height="18" rx="9" fill="#9e7a56" />

                <rect x="700" y="284" width="156" height="94" rx="22" fill="#c8d6e1" />
                <rect x="860" y="292" width="62" height="30" rx="12" fill="#9cb6cc" />
                <rect x="900" y="340" width="24" height="46" rx="12" fill="#9cb6cc" />
                <rect x="688" y="394" width="46" height="76" rx="14" fill="#b7c9d8" />
                <rect x="742" y="394" width="46" height="76" rx="14" fill="#b7c9d8" />
                <rect x="796" y="394" width="46" height="76" rx="14" fill="#b7c9d8" />
                <ellipse cx="820" cy="362" rx="88" ry="58" fill="#dfe8ef" opacity="0.5" />
                <circle cx="912" cy="412" r="30" fill="#dfb78e" />
                <rect x="754" y="298" width="62" height="10" rx="5" fill="#111827" />

                <rect x="668" y="528" width="58" height="90" rx="16" fill="#e8f2f5" stroke="#b8cdd2" strokeWidth="3" />
                <rect x="740" y="530" width="42" height="26" rx="10" fill="#f4f7f8" stroke="#cad9dd" strokeWidth="3" />
                <rect x="756" y="572" width="26" height="44" rx="12" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
                <rect x="738" y="640" width="54" height="42" rx="12" fill="#e4eff2" stroke="#c1d3d8" strokeWidth="3" />

                <rect x="850" y="536" width="82" height="20" rx="10" fill="#bda78a" />
                <rect x="846" y="568" width="88" height="20" rx="10" fill="#c6b195" />
                <rect x="852" y="604" width="72" height="20" rx="10" fill="#bda78a" />
                <rect x="842" y="640" width="34" height="28" rx="10" fill="#c79c6b" />
                <rect x="884" y="646" width="38" height="26" rx="10" fill="#8b9db0" />

                <rect x="472" y="72" width="44" height="22" rx="9" fill="#cdb59a" />
                <rect x="470" y="104" width="48" height="60" rx="14" fill="#d9c7b0" />
                <rect x="560" y="88" width="42" height="8" rx="4" fill="#94a3b8" />
                <rect x="560" y="102" width="42" height="8" rx="4" fill="#94a3b8" />
                <rect x="560" y="116" width="42" height="8" rx="4" fill="#94a3b8" />
                <rect x="470" y="628" width="136" height="32" rx="14" fill="#d5c3ad" />

                <text x="250" y="58" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Balcony
                </text>
                <text x="250" y="140" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Living Room
                </text>
                <text x="250" y="392" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Bedroom
                </text>
                <text x="540" y="58" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Hall
                </text>
                <text x="810" y="56" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Kitchen
                </text>
                <text x="810" y="256" textAnchor="middle" fontSize="18" fontWeight="800" fill="#3f3a33">
                  Office
                </text>
                <text x="735" y="524" textAnchor="middle" fontSize="16" fontWeight="800" fill="#3f3a33">
                  Bath
                </text>
                <text x="895" y="524" textAnchor="middle" fontSize="16" fontWeight="800" fill="#3f3a33">
                  Storage
                </text>

                <rect
                  x="40"
                  y="20"
                  width="1000"
                  height="700"
                  rx="34"
                  fill="none"
                  stroke="#2f2a24"
                  strokeWidth="14"
                />

                <line x1="430" y1="100" x2="430" y2="188" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="430" y1="252" x2="430" y2="350" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="430" y1="350" x2="430" y2="518" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="430" y1="582" x2="430" y2="720" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="650" y1="20" x2="650" y2="108" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="650" y1="172" x2="650" y2="220" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="650" y1="220" x2="650" y2="328" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="650" y1="392" x2="650" y2="500" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="650" y1="500" x2="650" y2="568" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="650" y1="632" x2="650" y2="720" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="820" y1="500" x2="868" y2="500" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="932" y1="500" x2="970" y2="500" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="70" y1="100" x2="226" y2="100" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />
                <line x1="274" y1="100" x2="430" y2="100" stroke="#2f2a24" strokeWidth="14" strokeLinecap="round" />

                <line x1="104" y1="20" x2="196" y2="20" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />
                <line x1="290" y1="20" x2="382" y2="20" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />
                <line x1="40" y1="196" x2="40" y2="280" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />
                <line x1="970" y1="50" x2="1040" y2="50" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />
                <line x1="970" y1="120" x2="1040" y2="120" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />
                <line x1="40" y1="462" x2="40" y2="560" stroke="#7ec4e6" strokeWidth="10" strokeLinecap="round" />

                {DOORS.map((door) => {
                  const isOpen = openDoorIds.includes(door.id);

                  let rotate = 0;
                  if (isOpen) {
                    if (door.openTo === 'left') rotate = -78;
                    if (door.openTo === 'right') rotate = 78;
                    if (door.openTo === 'up') rotate = -78;
                    if (door.openTo === 'down') rotate = 78;
                  }

                  return (
                    <g
                      key={door.id}
                      transform={`translate(${door.x} ${door.y}) rotate(${rotate})`}
                      style={{ transition: 'transform 160ms ease-out' }}
                    >
                      {door.orientation === 'vertical' ? (
                        <>
                          <line x1="0" y1="0" x2="0" y2={door.length} stroke="#8b6b47" strokeWidth="8" strokeLinecap="round" />
                          <path d={`M 0 0 A 42 42 0 0 ${door.openTo === 'left' ? 0 : 1} ${door.openTo === 'left' ? -42 : 42} 42`} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
                        </>
                      ) : (
                        <>
                          <line x1="0" y1="0" x2={door.length} y2="0" stroke="#8b6b47" strokeWidth="8" strokeLinecap="round" />
                          <path d={`M 0 0 A 42 42 0 0 ${door.openTo === 'up' ? 0 : 1} 42 ${door.openTo === 'up' ? -42 : 42}`} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
                        </>
                      )}
                    </g>
                  );
                })}

                {HIDING_SPOTS.map((spot) => {
                  const checked = checkedSpotIds.includes(spot.id);
                  const isSelected = selectedSpotId === spot.id;
                  const isFound = fx?.kind === 'found' && Math.abs(fx.x - spot.x) < 1 && Math.abs(fx.y - spot.y) < 1;

                  const visible =
                    isHidePhase ||
                    isSeekPhase ||
                    phase === 'p1_found' ||
                    phase === 'p2_found' ||
                    phase === 'match_end';

                  if (!visible) return null;

                  return (
                    <g
                      key={spot.id}
                      transform={`translate(${spot.x} ${spot.y})`}
                      onClick={() => {
                        if (isMoving) return;

                        if (isHidePhase) {
                          setSelectedSpotId(spot.id);
                          setStatusTitle('Hide spot selected');
                          setStatusText(`Выбрано: ${spot.label}`);
                        } else if (isSeekPhase) {
                          handleSearchSpot(spot);
                        }
                      }}
                      style={{
                        cursor: isMoving ? 'default' : 'pointer',
                      }}
                    >
                      {isSeekPhase && checked ? (
                        <>
                          <circle r="15" fill="rgba(15,23,42,0.14)" stroke="rgba(15,23,42,0.15)" strokeWidth="2" />
                          <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke="rgba(15,23,42,0.42)" strokeWidth="2.4" strokeLinecap="round" />
                        </>
                      ) : (
                        <>
                          <circle
                            r={isSelected ? 19 : 16}
                            fill={
                              isHidePhase
                                ? 'rgba(245,158,11,0.16)'
                                : 'rgba(59,130,246,0.12)'
                            }
                            stroke={
                              isSelected
                                ? 'rgba(245,158,11,0.95)'
                                : isFound
                                ? 'rgba(16,185,129,0.95)'
                                : 'rgba(15,23,42,0.22)'
                            }
                            strokeWidth={isSelected ? 3 : 2}
                            style={
                              isSelected
                                ? { animation: 'hideoutPulse .95s ease-in-out infinite' }
                                : undefined
                            }
                          />
                          <text
                            y="5"
                            textAnchor="middle"
                            fontSize="16"
                            fontWeight="700"
                            fill="#0f172a"
                            style={{ pointerEvents: 'none' }}
                          >
                            {isSeekPhase ? '⌕' : spot.icon}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {fx && (
                  <g transform={`translate(${fx.x} ${fx.y - 34})`} style={{ pointerEvents: 'none' }}>
                    {fx.kind === 'found' ? (
                      <>
                        <circle
                          r="18"
                          fill="rgba(16,185,129,0.16)"
                          style={{ animation: 'hideoutFoundRing .8s ease-out forwards' }}
                        />
                        <circle
                          r="10"
                          fill="rgba(16,185,129,0.22)"
                          style={{ animation: 'hideoutFoundRing .8s ease-out .08s forwards' }}
                        />
                        <rect x="-46" y="-18" width="92" height="34" rx="17" fill="rgba(16,185,129,0.88)" />
                        <text y="5" textAnchor="middle" fontSize="14" fontWeight="900" fill="#ffffff">
                          {fx.label}
                        </text>
                      </>
                    ) : (
                      <>
                        <rect x="-44" y="-18" width="88" height="34" rx="17" fill="rgba(71,85,105,0.9)" />
                        <text y="5" textAnchor="middle" fontSize="14" fontWeight="900" fill="#ffffff">
                          {fx.label}
                        </text>
                      </>
                    )}
                  </g>
                )}

                {renderAvatar('p1')}
                {renderAvatar('p2')}
              </svg>

              <div className="absolute inset-x-3 bottom-3 z-20">
                {isHidePhase ? (
                  <div className="rounded-[26px] border border-black/6 bg-white/72 backdrop-blur-xl px-3 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.12)]">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-black/38 font-bold">
                          Selected hideout
                        </div>
                        <div className="text-sm font-black text-black mt-1 truncate">
                          {selectedSpot ? `${selectedSpot.icon} ${selectedSpot.label}` : 'Выбери одно из мест на карте'}
                        </div>
                      </div>

                      <button
                        onClick={confirmHide}
                        disabled={!selectedSpot || isMoving}
                        className={`shrink-0 px-4 py-3 rounded-2xl text-sm font-black uppercase tracking-[0.12em] transition ${
                          selectedSpot && !isMoving
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white active:scale-[0.98]'
                            : 'bg-black/8 text-black/30'
                        }`}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                ) : isSeekPhase ? (
                  <div className="rounded-[26px] border border-black/6 bg-white/72 backdrop-blur-xl px-3 py-3 shadow-[0_18px_36px_rgba(0,0,0,0.12)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-black/38 font-bold">
                          Search
                        </div>
                        <div className="text-sm font-black text-black mt-1">
                          Проверено: {checkedSpotIds.length} / {HIDING_SPOTS.length}
                        </div>
                        <div className="text-[11px] text-black/55 font-semibold mt-1">
                          Нажимай на любое ещё не проверенное место
                        </div>
                      </div>

                      <div className="shrink-0 rounded-2xl bg-black px-4 py-3 text-white text-center min-w-[84px]">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">
                          Moves
                        </div>
                        <div className="text-2xl font-black leading-none mt-1">{currentSearchSteps}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {showResult && phase === 'match_end' && (
                <div className="absolute inset-0 z-30 bg-black/44 backdrop-blur-md flex items-center justify-center p-5">
                  <div
                    className="w-full max-w-[360px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,248,239,0.98),rgba(244,236,226,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.24)] overflow-hidden"
                    style={{ animation: 'hideoutPop .34s ease-out both' }}
                  >
                    <div className="px-6 pt-6 pb-5 text-center">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-black/38 font-bold">
                        Match Result
                      </div>

                      <div className="mt-3 text-4xl font-black text-black">{winnerText}</div>

                      <div className="mt-2 text-sm text-black/55">
                        Кто нашёл быстрее — тот победил
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-teal-500/10 border border-teal-500/12 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-black/40 font-bold">
                            Player 1
                          </div>
                          <div className="text-3xl font-black text-teal-700 mt-2 leading-none">
                            {results.p1 ?? '—'}
                          </div>
                          <div className="text-[11px] text-black/50 mt-2">search moves</div>
                        </div>

                        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/12 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-black/40 font-bold">
                            Player 2
                          </div>
                          <div className="text-3xl font-black text-rose-700 mt-2 leading-none">
                            {results.p2 ?? '—'}
                          </div>
                          <div className="text-[11px] text-black/50 mt-2">search moves</div>
                        </div>
                      </div>

                      <button
                        onClick={startMatch}
                        className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(245,158,11,0.20)]"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};