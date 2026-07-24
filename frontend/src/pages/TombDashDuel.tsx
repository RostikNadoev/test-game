import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

type Vec = { r: number; c: number };
type Dir = 'up' | 'down' | 'left' | 'right';
type Phase = 'countdown' | 'playing' | 'finished';
type Actor = 'player' | 'rival';

type DashPlan = {
  cells: Vec[];
  fatal: boolean;
  reachedGoal: boolean;
};

const ROWS = 25;
const COLS = 15;
const ROUND_SECONDS = 45;
const CAMERA_ROWS = 18;

const DIR: Record<Dir, Vec> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
};

const MAP = [
  '###############',
  '#.....#.......#',
  '#.###.#.#####.#',
  '#.#...#.....#.#',
  '#.#.#####.#.#.#',
  '#.#.....#.#...#',
  '#.#####.#.###.#',
  '#.....#.#.....#',
  '#####.#.#####.#',
  '#.....#.....#.#',
  '#.#########.#.#',
  '#.........#...#',
  '#.#######.###.#',
  '#.#.....#.....#',
  '#.#.###.#####.#',
  '#...#.#.......#',
  '###.#.#######.#',
  '#...#.....#...#',
  '#.#######.#.###',
  '#.......#.#...#',
  '#.#####.#.###.#',
  '#.#.....#.....#',
  '#.#.#########.#',
  '#.............#',
  '###############',
] as const;

const STATIC_SPIKES = new Set([
  '5:5',
  '7:11',
  '9:3',
  '11:7',
  '13:11',
  '15:3',
  '17:9',
  '19:5',
  '21:11',
]);

const PULSE_TRAPS = new Map<string, boolean>([
  ['3:9', false],
  ['7:3', true],
  ['11:5', false],
  ['13:9', true],
  ['17:5', false],
  ['19:11', true],
]);

const RELICS = new Set([
  '1:3',
  '5:13',
  '9:9',
  '13:5',
  '17:13',
  '21:5',
]);

const CHECKPOINTS = new Set(['17:1', '11:1', '5:1']);
const START: Vec = { r: 23, c: 7 };
const GOAL: Vec = { r: 1, c: 13 };

const keyOf = (p: Vec) => `${p.r}:${p.c}`;
const sameCell = (a: Vec, b: Vec) => a.r === b.r && a.c === b.c;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isWall = (r: number, c: number) =>
  r < 0 || c < 0 || r >= ROWS || c >= COLS || MAP[r][c] === '#';

const isSpecialCell = (key: string) =>
  STATIC_SPIKES.has(key) ||
  PULSE_TRAPS.has(key) ||
  RELICS.has(key) ||
  CHECKPOINTS.has(key) ||
  key === keyOf(START) ||
  key === keyOf(GOAL);

const TOTAL_DOTS = MAP.reduce((total, row, r) => {
  return total + row.split('').reduce((count, cell, c) => {
    if (cell !== '.') return count;
    return count + (isSpecialCell(`${r}:${c}`) ? 0 : 1);
  }, 0);
}, 0);

const initials = (name?: string) => {
  const value = name?.replace(/^@/, '').trim();
  if (!value) return 'TG';
  return value.slice(0, 2).toUpperCase();
};

function nextCells(from: Vec, dir: Dir) {
  const delta = DIR[dir];
  let r = from.r;
  let c = from.c;
  const cells: Vec[] = [];

  while (!isWall(r + delta.r, c + delta.c)) {
    r += delta.r;
    c += delta.c;
    cells.push({ r, c });
  }

  return cells;
}

function pulseTrapIsActive(key: string, pulse: boolean) {
  const phase = PULSE_TRAPS.get(key);
  return phase !== undefined && phase === pulse;
}

function buildDashPlan(from: Vec, dir: Dir, pulse: boolean): DashPlan {
  const raw = nextCells(from, dir);
  const cells: Vec[] = [];
  let fatal = false;
  let reachedGoal = false;

  for (const cell of raw) {
    cells.push(cell);
    const key = keyOf(cell);

    if (STATIC_SPIKES.has(key) || pulseTrapIsActive(key, pulse)) {
      fatal = true;
      break;
    }

    if (sameCell(cell, GOAL)) {
      reachedGoal = true;
      break;
    }
  }

  return { cells, fatal, reachedGoal };
}

function dashDuration(cellCount: number) {
  return clamp(88 + cellCount * 24, 110, 330);
}

function scoreBotDirection(
  from: Vec,
  dir: Dir,
  pulse: boolean,
  collected: Set<string>,
  relics: Set<string>,
) {
  const plan = buildDashPlan(from, dir, pulse);
  if (!plan.cells.length) return -Infinity;

  let score = 0;

  for (const cell of plan.cells) {
    const key = keyOf(cell);
    if (!collected.has(key) && !isSpecialCell(key)) score += 1.2;
    if (RELICS.has(key) && !relics.has(key)) score += 8;
    if (CHECKPOINTS.has(key)) score += 3;
    score += (from.r - cell.r) * 0.55;
  }

  if (plan.reachedGoal) score += 24;
  if (plan.fatal) score -= 20;

  score += plan.cells.length * 0.12;
  score += (Math.random() - 0.5) * 3.4;

  return score;
}

function pickBotDirection(
  pos: Vec,
  pulse: boolean,
  collected: Set<string>,
  relics: Set<string>,
) {
  const candidates = (Object.keys(DIR) as Dir[])
    .map((dir) => ({
      dir,
      score: scoreBotDirection(pos, dir, pulse, collected, relics),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return 'up' as Dir;

  if (candidates.length > 1 && Math.random() < 0.24) {
    return candidates[1].dir;
  }

  return candidates[0].dir;
}

export default function TombDashDuel() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);

  const [player, setPlayer] = useState<Vec>(START);
  const [rival, setRival] = useState<Vec>(START);
  const [playerTravelMs, setPlayerTravelMs] = useState(140);
  const [rivalTravelMs, setRivalTravelMs] = useState(140);

  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [playerRuns, setPlayerRuns] = useState(0);
  const [rivalRuns, setRivalRuns] = useState(0);

  const [collected, setCollected] = useState<Set<string>>(() => new Set());
  const [playerRelics, setPlayerRelics] = useState<Set<string>>(() => new Set());
  const [checkpoint, setCheckpoint] = useState<Vec>(START);

  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [rivalMoving, setRivalMoving] = useState(false);
  const [playerDeadFlash, setPlayerDeadFlash] = useState(false);
  const [rivalDeadFlash, setRivalDeadFlash] = useState(false);
  const [message, setMessage] = useState('SWIPE TO DASH');
  const [pulse, setPulse] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const phaseRef = useRef<Phase>('countdown');
  const playerRef = useRef<Vec>(START);
  const rivalRef = useRef<Vec>(START);
  const playerSpawnRef = useRef<Vec>(START);
  const rivalSpawnRef = useRef<Vec>(START);
  const playerMovingRef = useRef(false);
  const rivalMovingRef = useRef(false);
  const pulseRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const roundGenerationRef = useRef(0);

  const playerScoreRef = useRef(0);
  const rivalScoreRef = useRef(0);
  const playerRunsRef = useRef(0);
  const rivalRunsRef = useRef(0);
  const playerComboRef = useRef(0);
  const rivalComboRef = useRef(0);
  const playerBestComboRef = useRef(0);

  const playerCollectedRef = useRef<Set<string>>(new Set());
  const rivalCollectedRef = useRef<Set<string>>(new Set());
  const playerRelicsRef = useRef<Set<string>>(new Set());
  const rivalRelicsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    rivalRef.current = rival;
  }, [rival]);

  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  const updatePlayerScore = useCallback((delta: number) => {
    playerScoreRef.current = Math.max(0, playerScoreRef.current + delta);
    setPlayerScore(playerScoreRef.current);
  }, []);

  const updateRivalScore = useCallback((delta: number) => {
    rivalScoreRef.current = Math.max(0, rivalScoreRef.current + delta);
    setRivalScore(rivalScoreRef.current);
  }, []);

  const updatePlayerCombo = useCallback((value: number) => {
    const next = clamp(value, 0, 8);
    playerComboRef.current = next;
    playerBestComboRef.current = Math.max(playerBestComboRef.current, next);
    setCombo(next);
    setBestCombo(playerBestComboRef.current);
  }, []);

  const resetActorCollections = useCallback((actor: Actor) => {
    if (actor === 'player') {
      const nextCollected = new Set<string>();
      const nextRelics = new Set<string>();
      playerCollectedRef.current = nextCollected;
      playerRelicsRef.current = nextRelics;
      setCollected(nextCollected);
      setPlayerRelics(nextRelics);
      playerSpawnRef.current = START;
      setCheckpoint(START);
    } else {
      rivalCollectedRef.current = new Set<string>();
      rivalRelicsRef.current = new Set<string>();
      rivalSpawnRef.current = START;
    }
  }, []);

  const respawnActor = useCallback((actor: Actor) => {
    if (actor === 'player') {
      setPlayerTravelMs(0);
      const spawn = playerSpawnRef.current;
      setPlayer(spawn);
      playerRef.current = spawn;
      window.setTimeout(() => setPlayerTravelMs(140), 30);
    } else {
      setRivalTravelMs(0);
      const spawn = rivalSpawnRef.current;
      setRival(spawn);
      rivalRef.current = spawn;
      window.setTimeout(() => setRivalTravelMs(140), 30);
    }
  }, []);

  const resolveSafePath = useCallback(
    (actor: Actor, cells: Vec[]) => {
      const collectedRef = actor === 'player' ? playerCollectedRef : rivalCollectedRef;
      const relicRef = actor === 'player' ? playerRelicsRef : rivalRelicsRef;
      const currentCollected = new Set(collectedRef.current);
      const currentRelics = new Set(relicRef.current);

      let newDots = 0;
      let relicBonus = 0;
      let lastCheckpoint: Vec | null = null;

      for (const cell of cells) {
        const key = keyOf(cell);

        if (!isSpecialCell(key) && !currentCollected.has(key)) {
          currentCollected.add(key);
          newDots += 1;
        }

        if (RELICS.has(key) && !currentRelics.has(key)) {
          currentRelics.add(key);
          relicBonus += 7;
        }

        if (CHECKPOINTS.has(key)) {
          lastCheckpoint = cell;
        }
      }

      collectedRef.current = currentCollected;
      relicRef.current = currentRelics;

      if (actor === 'player') {
        setCollected(currentCollected);
        setPlayerRelics(currentRelics);

        if (lastCheckpoint) {
          playerSpawnRef.current = lastCheckpoint;
          setCheckpoint(lastCheckpoint);
        }

        const nextCombo = newDots >= 2 ? playerComboRef.current + 1 : Math.max(0, playerComboRef.current - 1);
        updatePlayerCombo(nextCombo);
        const comboBonus = nextCombo >= 3 && newDots >= 3 ? Math.min(4, nextCombo - 2) : 0;
        updatePlayerScore(newDots + relicBonus + comboBonus);

        if (relicBonus > 0) setMessage(`RELIC +${relicBonus}`);
        else if (comboBonus > 0) setMessage(`COMBO +${comboBonus}`);
        else if (newDots >= 6) setMessage('NICE DASH');
        else setMessage('SWIPE TO DASH');
      } else {
        if (lastCheckpoint) rivalSpawnRef.current = lastCheckpoint;

        const nextCombo = newDots >= 2 ? rivalComboRef.current + 1 : Math.max(0, rivalComboRef.current - 1);
        rivalComboRef.current = clamp(nextCombo, 0, 8);
        const comboBonus =
          rivalComboRef.current >= 3 && newDots >= 3
            ? Math.min(4, rivalComboRef.current - 2)
            : 0;
        updateRivalScore(newDots + relicBonus + comboBonus);
      }
    },
    [updatePlayerCombo, updatePlayerScore, updateRivalScore],
  );

  const animateActorDash = useCallback(
    async (actor: Actor, dir: Dir) => {
      if (phaseRef.current !== 'playing') return;

      const movingRef = actor === 'player' ? playerMovingRef : rivalMovingRef;
      if (movingRef.current) return;

      const from = actor === 'player' ? playerRef.current : rivalRef.current;
      const plan = buildDashPlan(from, dir, pulseRef.current);
      if (!plan.cells.length) return;

      const generation = roundGenerationRef.current;
      const destination = plan.cells[plan.cells.length - 1];
      const duration = dashDuration(plan.cells.length);

      movingRef.current = true;

      if (actor === 'player') {
        setIsMoving(true);
        setPlayerTravelMs(duration);
        setPlayer(destination);
        playerRef.current = destination;
      } else {
        setRivalMoving(true);
        setRivalTravelMs(duration);
        setRival(destination);
        rivalRef.current = destination;
      }

      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));

      if (generation !== roundGenerationRef.current || phaseRef.current !== 'playing') {
        movingRef.current = false;
        if (actor === 'player') setIsMoving(false);
        else setRivalMoving(false);
        return;
      }

      if (plan.fatal) {
        const safeCells = plan.cells.slice(0, -1);
        if (safeCells.length) resolveSafePath(actor, safeCells);

        if (actor === 'player') {
          setPlayerDeadFlash(true);
          setMessage('TRAP! -5');
          updatePlayerScore(-5);
          updatePlayerCombo(0);
        } else {
          setRivalDeadFlash(true);
          updateRivalScore(-5);
          rivalComboRef.current = 0;
        }

        await new Promise<void>((resolve) => window.setTimeout(resolve, 135));

        if (generation === roundGenerationRef.current && phaseRef.current === 'playing') {
          respawnActor(actor);
        }

        window.setTimeout(() => {
          if (actor === 'player') setPlayerDeadFlash(false);
          else setRivalDeadFlash(false);
        }, 180);
      } else {
        resolveSafePath(actor, plan.cells);

        if (plan.reachedGoal) {
          if (actor === 'player') {
            updatePlayerScore(20);
            playerRunsRef.current += 1;
            setPlayerRuns(playerRunsRef.current);
            setMessage('TOMB CLEARED +20');
            updatePlayerCombo(playerComboRef.current + 1);
          } else {
            updateRivalScore(20);
            rivalRunsRef.current += 1;
            setRivalRuns(rivalRunsRef.current);
            rivalComboRef.current = clamp(rivalComboRef.current + 1, 0, 8);
          }

          resetActorCollections(actor);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 120));

          if (generation === roundGenerationRef.current && phaseRef.current === 'playing') {
            respawnActor(actor);
          }
        }
      }

      movingRef.current = false;
      if (actor === 'player') setIsMoving(false);
      else setRivalMoving(false);
    },
    [
      resetActorCollections,
      resolveSafePath,
      respawnActor,
      updatePlayerCombo,
      updatePlayerScore,
      updateRivalScore,
    ],
  );

  const dash = useCallback(
    (dir: Dir) => {
      void animateActorDash('player', dir);
    },
    [animateActorDash],
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'countdown') return;

    const id = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          phaseRef.current = 'playing';
          setPhase('playing');
          setMessage('GO!');
          window.setTimeout(() => {
            if (phaseRef.current === 'playing') setMessage('SWIPE TO DASH');
          }, 620);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const id = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          phaseRef.current = 'finished';
          setPhase('finished');
          window.setTimeout(() => setShowResult(true), 280);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const id = window.setInterval(() => {
      setPulse((current) => {
        const next = !current;
        pulseRef.current = next;
        return next;
      });
    }, 760);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return;

    let cancelled = false;

    const scheduleBot = () => {
      const delay = 430 + Math.random() * 360;

      botTimerRef.current = window.setTimeout(() => {
        if (cancelled || phaseRef.current !== 'playing') return;

        const direction = pickBotDirection(
          rivalRef.current,
          pulseRef.current,
          rivalCollectedRef.current,
          rivalRelicsRef.current,
        );

        void animateActorDash('rival', direction).finally(() => {
          if (!cancelled && phaseRef.current === 'playing') scheduleBot();
        });
      }, delay);
    };

    scheduleBot();

    return () => {
      cancelled = true;
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, [animateActorDash, phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keyMap: Partial<Record<string, Dir>> = {
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
      };

      const direction = keyMap[event.key];
      if (!direction) return;

      event.preventDefault();
      dash(direction);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dash]);

  useEffect(() => {
    return () => {
      roundGenerationRef.current += 1;
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    touchRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.hypot(dx, dy) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      dash(dx > 0 ? 'right' : 'left');
    } else {
      dash(dy > 0 ? 'down' : 'up');
    }
  };

  const restart = () => {
    roundGenerationRef.current += 1;
    if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);

    phaseRef.current = 'countdown';
    setPhase('countdown');
    setCountdown(3);
    setTimeLeft(ROUND_SECONDS);
    setShowResult(false);
    setPulse(false);
    pulseRef.current = false;

    setPlayerTravelMs(0);
    setRivalTravelMs(0);
    setPlayer(START);
    setRival(START);
    playerRef.current = START;
    rivalRef.current = START;
    playerSpawnRef.current = START;
    rivalSpawnRef.current = START;
    playerMovingRef.current = false;
    rivalMovingRef.current = false;
    setIsMoving(false);
    setRivalMoving(false);

    playerScoreRef.current = 0;
    rivalScoreRef.current = 0;
    playerRunsRef.current = 0;
    rivalRunsRef.current = 0;
    playerComboRef.current = 0;
    rivalComboRef.current = 0;
    playerBestComboRef.current = 0;

    setPlayerScore(0);
    setRivalScore(0);
    setPlayerRuns(0);
    setRivalRuns(0);
    setCombo(0);
    setBestCombo(0);

    const emptyCollected = new Set<string>();
    const emptyRelics = new Set<string>();

    playerCollectedRef.current = emptyCollected;
    rivalCollectedRef.current = new Set<string>();
    playerRelicsRef.current = emptyRelics;
    rivalRelicsRef.current = new Set<string>();

    setCollected(emptyCollected);
    setPlayerRelics(emptyRelics);
    setCheckpoint(START);
    setPlayerDeadFlash(false);
    setRivalDeadFlash(false);
    setMessage('SWIPE TO DASH');

    window.setTimeout(() => {
      setPlayerTravelMs(140);
      setRivalTravelMs(140);
    }, 40);
  };

  const cameraStartRow = clamp(player.r - 13, 0, ROWS - CAMERA_ROWS);
  const rivalAbove = rival.r < cameraStartRow;
  const rivalBelow = rival.r >= cameraStartRow + CAMERA_ROWS;

  const youWon =
    playerScore > rivalScore ||
    (playerScore === rivalScore && playerRuns > rivalRuns);
  const draw = playerScore === rivalScore && playerRuns === rivalRuns;

  const playerProgress = Math.round(
    clamp((collected.size / Math.max(1, TOTAL_DOTS)) * 100, 0, 100),
  );

  return (
    <div className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#10050d] text-white">
      <style>{`
        @keyframes td-count {
          0% { opacity: 0; transform: scale(.55); }
          35% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes td-relic {
          0%,100% { transform: translate(-50%,-50%) rotate(45deg) scale(.92); }
          50% { transform: translate(-50%,-50%) rotate(45deg) scale(1.12); }
        }
        @keyframes td-trap {
          0%,100% { opacity: .55; transform: translate(-50%,-50%) scale(.82); }
          50% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes td-player-glow {
          0%,100% { filter: drop-shadow(0 0 5px rgba(255,214,74,.35)); }
          50% { filter: drop-shadow(0 0 13px rgba(255,214,74,.72)); }
        }
        .td-pixel {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
      `}</style>

      <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.045] bg-[#10050d]/95 px-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border-2 border-[#ffd64a]/35 bg-[#291020] text-[10px] font-black text-[#ffd64a] shadow-[inset_0_0_0_1px_rgba(0,0,0,.35)]">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              initials(user?.tg_user)
            )}
          </div>

          <div className="min-w-0">
            <p className="max-w-[88px] truncate text-[9px] font-black uppercase leading-[1.35] tracking-[.06em] text-white/92">
              {user?.tg_user || 'YOU'}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              <strong className="text-[10px] font-black leading-none text-[#ffd64a]">
                {playerScore}
              </strong>
              <span className="text-[6px] font-black uppercase tracking-[.12em] text-white/28">
                pts
              </span>
              {combo >= 2 && (
                <span className="rounded-[5px] bg-[#ffd64a]/10 px-1.5 py-0.5 text-[6px] font-black text-[#ffd64a]">
                  X{combo}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[42%] text-center">
          <p className="text-[6px] font-black uppercase tracking-[.24em] text-white/28">
            Tomb Dash
          </p>
          <div className="mt-1 min-w-[54px] border-x-2 border-[#5b183b] bg-[#1a0914] px-2 py-1 text-[14px] font-black leading-[1.1] text-[#fff0a1]">
            0:{String(timeLeft).padStart(2, '0')}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0">
            <p className="max-w-[88px] truncate text-[9px] font-black uppercase leading-[1.35] tracking-[.06em] text-white/92">
              RIVAL
            </p>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              {rivalMoving && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff607f]" />
              )}
              <strong className="text-[10px] font-black leading-none text-[#ff607f]">
                {rivalScore}
              </strong>
              <span className="text-[6px] font-black uppercase tracking-[.12em] text-white/28">
                pts
              </span>
            </div>
          </div>

          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border-2 border-[#ff607f]/30 bg-[#291020] text-[9px] font-black text-[#ff607f]">
            R
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto min-h-0 w-full max-w-[430px] flex-1 touch-none overflow-hidden bg-[#0a050b]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          touchRef.current = null;
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-[6px] font-black uppercase tracking-[.14em] text-white/30">
            <span>{playerProgress}%</span>
            <span className="h-[3px] w-14 overflow-hidden bg-white/10">
              <i
                className="block h-full bg-[#ffd64a] transition-[width] duration-200"
                style={{ width: `${playerProgress}%` }}
              />
            </span>
          </div>

          <div className="flex items-center gap-2 text-[6px] font-black uppercase tracking-[.12em] text-white/28">
            <span>Runs {playerRuns}:{rivalRuns}</span>
            {bestCombo >= 3 && <span className="text-[#ffd64a]">Best X{bestCombo}</span>}
          </div>
        </div>

        <div
          className="absolute left-0 top-0 w-full transition-transform duration-[220ms] ease-out"
          style={{
            aspectRatio: `${COLS} / ${ROWS}`,
            transform: `translateY(-${(cameraStartRow / ROWS) * 100}%)`,
          }}
        >
          <div
            className="absolute inset-0 grid bg-[#0b050c]"
            style={{
              gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
            }}
          >
            {MAP.map((row, r) =>
              row.split('').map((cell, c) => {
                const key = `${r}:${c}`;
                const wall = cell === '#';
                const staticSpike = STATIC_SPIKES.has(key);
                const pulsePhase = PULSE_TRAPS.get(key);
                const pulseActive =
                  pulsePhase !== undefined && pulsePhase === pulse;
                const relic = RELICS.has(key) && !playerRelics.has(key);
                const checkpointCell = CHECKPOINTS.has(key);
                const checkpointActive = sameCell(checkpoint, { r, c });
                const goal = sameCell(GOAL, { r, c });
                const dot =
                  cell === '.' &&
                  !isSpecialCell(key) &&
                  !collected.has(key);

                return (
                  <div key={key} className="relative min-h-0 min-w-0">
                    {wall && (
                      <div className="absolute inset-0 border-[1px] border-[#351026] bg-[#521535] shadow-[inset_0_2px_0_rgba(150,45,98,.6),inset_0_-2px_0_rgba(31,7,21,.8)]">
                        {(r + c) % 3 === 0 && (
                          <span className="absolute left-[10%] top-[24%] h-[1px] w-[60%] bg-[#b33d76]/35" />
                        )}
                        {(r * 3 + c) % 5 === 0 && (
                          <span className="absolute bottom-[22%] right-[12%] h-[1px] w-[42%] bg-black/25" />
                        )}
                      </div>
                    )}

                    {dot && (
                      <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffe364] shadow-[0_0_6px_rgba(255,227,100,.62)]" />
                    )}

                    {staticSpike && (
                      <div className="absolute inset-[10%] flex items-end justify-center gap-[1px]">
                        <i
                          className="h-[68%] w-[28%] bg-[#ff5275]"
                          style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}
                        />
                        <i
                          className="h-full w-[28%] bg-[#ff6b88]"
                          style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}
                        />
                        <i
                          className="h-[68%] w-[28%] bg-[#ff5275]"
                          style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }}
                        />
                      </div>
                    )}

                    {pulsePhase !== undefined && (
                      <div
                        className="absolute left-1/2 top-1/2 h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2"
                        style={{
                          opacity: pulseActive ? 1 : 0.22,
                          filter: pulseActive
                            ? 'drop-shadow(0 0 7px rgba(255,82,117,.8))'
                            : 'none',
                          transition: 'opacity .12s linear, filter .12s linear',
                        }}
                      >
                        <i className="absolute left-1/2 top-0 h-full w-[20%] -translate-x-1/2 rotate-45 bg-[#ff5275]" />
                        <i className="absolute left-1/2 top-0 h-full w-[20%] -translate-x-1/2 -rotate-45 bg-[#ff5275]" />
                        <span
                          className="absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ffd0da] bg-[#7b1d3c]"
                          style={{
                            animation: pulseActive ? 'td-trap .45s linear infinite' : 'none',
                          }}
                        />
                      </div>
                    )}

                    {relic && (
                      <div
                        className="absolute left-1/2 top-1/2 h-[42%] w-[42%] border-2 border-[#fff0a1] bg-[#ffd64a] shadow-[0_0_10px_rgba(255,214,74,.65)]"
                        style={{
                          animation: 'td-relic .9s ease-in-out infinite',
                        }}
                      >
                        <span className="absolute left-1/2 top-1/2 h-[35%] w-[35%] -translate-x-1/2 -translate-y-1/2 bg-[#7e3d1c]" />
                      </div>
                    )}

                    {checkpointCell && (
                      <div className="absolute inset-[18%] grid place-items-center">
                        <div
                          className={[
                            'h-full w-full rotate-45 border',
                            checkpointActive
                              ? 'border-[#aafcff] bg-[#50e6e6]/45 shadow-[0_0_11px_rgba(80,230,230,.55)]'
                              : 'border-[#50e6e6]/50 bg-[#50e6e6]/10',
                          ].join(' ')}
                        >
                          <span className="absolute left-1/2 top-1/2 h-[35%] w-[35%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8cf8f3]" />
                        </div>
                      </div>
                    )}

                    {goal && (
                      <div className="absolute inset-[8%] grid place-items-center border border-[#ffd64a]/30 bg-[#ffd64a]/10 shadow-[inset_0_0_10px_rgba(255,214,74,.12)]">
                        <span className="text-[8px] font-black leading-none text-[#ffd64a]">▲</span>
                      </div>
                    )}
                  </div>
                );
              }),
            )}
          </div>

          <div
            className={[
              'pointer-events-none absolute z-20 grid place-items-center',
              playerDeadFlash ? 'opacity-15' : '',
            ].join(' ')}
            style={{
              left: `${((player.c + 0.5) / COLS) * 100}%`,
              top: `${((player.r + 0.5) / ROWS) * 100}%`,
              width: `${(0.72 / COLS) * 100}%`,
              aspectRatio: '1',
              transform: 'translate(-50%,-50%)',
              transitionProperty: 'left, top, opacity',
              transitionDuration: `${playerTravelMs}ms, ${playerTravelMs}ms, 90ms`,
              transitionTimingFunction: 'cubic-bezier(.16,.72,.22,1)',
              animation: isMoving ? 'td-player-glow .34s ease-in-out infinite' : 'none',
            }}
          >
            <div
              className="relative h-full w-full border-2 border-[#fff3b0] bg-[#ffd64a] shadow-[0_0_12px_rgba(255,214,74,.5)]"
              style={{
                clipPath:
                  'polygon(50% 0,86% 14%,100% 52%,78% 100%,22% 100%,0 52%,14% 14%)',
              }}
            >
              <span className="absolute left-[21%] top-[28%] h-[18%] w-[20%] bg-[#28101f]" />
              <span className="absolute right-[21%] top-[28%] h-[18%] w-[20%] bg-[#28101f]" />
              <span className="absolute bottom-[15%] left-1/2 h-[9%] w-[28%] -translate-x-1/2 bg-[#9a4a20]" />
            </div>
          </div>

          <div
            className={[
              'pointer-events-none absolute z-[19] grid place-items-center opacity-[.42]',
              rivalDeadFlash ? 'opacity-10' : '',
            ].join(' ')}
            style={{
              left: `${((rival.c + 0.5) / COLS) * 100}%`,
              top: `${((rival.r + 0.5) / ROWS) * 100}%`,
              width: `${(0.68 / COLS) * 100}%`,
              aspectRatio: '1',
              transform: 'translate(-50%,-50%)',
              transitionProperty: 'left, top, opacity',
              transitionDuration: `${rivalTravelMs}ms, ${rivalTravelMs}ms, 90ms`,
              transitionTimingFunction: 'cubic-bezier(.16,.72,.22,1)',
            }}
          >
            <div
              className="h-full w-full border-2 border-[#ffc1cf] bg-[#ff607f] shadow-[0_0_10px_rgba(255,96,127,.28)]"
              style={{
                clipPath:
                  'polygon(50% 0,86% 14%,100% 52%,78% 100%,22% 100%,0 52%,14% 14%)',
              }}
            />
          </div>
        </div>

        {(rivalAbove || rivalBelow) && phase === 'playing' && (
          <div
            className={[
              'pointer-events-none absolute left-1/2 z-30 -translate-x-1/2',
              rivalAbove ? 'top-8' : 'bottom-5',
            ].join(' ')}
          >
            <div className="flex items-center gap-1 border border-[#ff607f]/20 bg-[#160913]/88 px-2 py-1 text-[6px] font-black uppercase tracking-[.14em] text-[#ff8ca3]">
              <span>{rivalAbove ? '▲' : '▼'}</span>
              Rival
            </div>
          </div>
        )}

        {phase === 'playing' && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
            <div
              className={[
                'border-x-2 px-3 py-1.5 text-center text-[7px] font-black uppercase tracking-[.14em]',
                isMoving
                  ? 'border-[#ffd64a] bg-[#ffd64a]/10 text-[#ffe98d]'
                  : 'border-white/10 bg-black/45 text-white/50',
              ].join(' ')}
            >
              {isMoving ? 'DASHING' : message}
            </div>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-[#0b050c]/90">
            <div className="text-center">
              <div
                className="mx-auto grid h-14 w-14 place-items-center border-2 border-[#ffd64a] bg-[#551533] shadow-[inset_0_0_0_3px_rgba(0,0,0,.25)]"
                style={{
                  clipPath:
                    'polygon(50% 0,86% 14%,100% 52%,78% 100%,22% 100%,0 52%,14% 14%)',
                }}
              >
                <span className="text-[17px] font-black text-[#ffd64a]">T</span>
              </div>
              <p className="mt-4 text-[7px] font-black uppercase tracking-[.26em] text-white/35">
                Enter the tomb
              </p>
              <strong
                key={countdown}
                className="mt-1 block text-[52px] font-black leading-[1.1] text-[#ffd64a]"
                style={{ animation: 'td-count .38s ease-out both' }}
              >
                {countdown}
              </strong>
              <p className="mt-2 text-[7px] font-black uppercase tracking-[.12em] text-white/30">
                Swipe · Dash · Survive
              </p>
            </div>
          </div>
        )}
      </div>

      {showResult && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 px-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[324px] border-2 border-[#5b183b] bg-[#130811] p-5 text-center shadow-[0_28px_80px_rgba(0,0,0,.62)]">
            <div
              className={[
                'mx-auto grid h-14 w-14 place-items-center border-2',
                draw
                  ? 'border-white/35 bg-white/10 text-white'
                  : youWon
                    ? 'border-[#ffd64a] bg-[#5b183b] text-[#ffd64a]'
                    : 'border-[#ff607f] bg-[#4b122a] text-[#ff8ca3]',
              ].join(' ')}
              style={{
                clipPath:
                  'polygon(50% 0,86% 14%,100% 52%,78% 100%,22% 100%,0 52%,14% 14%)',
              }}
            >
              <span className="text-[17px] font-black">{draw ? '=' : youWon ? 'W' : 'L'}</span>
            </div>

            <p className="mt-4 text-[7px] font-black uppercase tracking-[.22em] text-white/28">
              Tomb Dash Duel
            </p>
            <h2 className="mt-1 text-[23px] font-black leading-[1.3] text-white">
              {draw ? 'НИЧЬЯ' : youWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border border-[#ffd64a]/15 bg-[#ffd64a]/[.055] p-3">
                <span className="text-[6px] font-black uppercase tracking-[.14em] text-white/28">
                  You
                </span>
                <strong className="mt-1 block text-[19px] font-black text-[#ffd64a]">
                  {playerScore}
                </strong>
                <span className="mt-1 block text-[6px] font-black uppercase text-white/25">
                  {playerRuns} tombs
                </span>
              </div>

              <div className="border border-[#ff607f]/15 bg-[#ff607f]/[.055] p-3">
                <span className="text-[6px] font-black uppercase tracking-[.14em] text-white/28">
                  Rival
                </span>
                <strong className="mt-1 block text-[19px] font-black text-[#ff607f]">
                  {rivalScore}
                </strong>
                <span className="mt-1 block text-[6px] font-black uppercase text-white/25">
                  {rivalRuns} tombs
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-y border-white/[0.06] px-1 py-2 text-[6px] font-black uppercase tracking-[.12em] text-white/28">
              <span>Best combo</span>
              <strong className="text-[8px] text-[#ffd64a]">X{bestCombo}</strong>
            </div>

            <button
              type="button"
              onClick={restart}
              className="mt-4 w-full bg-[#ffd64a] px-4 py-3 text-[9px] font-black uppercase tracking-[.1em] text-[#210d19] transition-transform active:scale-[.985]"
            >
              ЕЩЁ РАЗ
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 w-full border border-white/10 bg-white/[.035] px-4 py-3 text-[8px] font-black uppercase tracking-[.1em] text-white/50 transition-transform active:scale-[.985]"
            >
              НА ГЛАВНУЮ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
