import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

type Vec = { r: number; c: number };
type Dir = 'up' | 'down' | 'left' | 'right';
type Phase = 'countdown' | 'playing' | 'finished';

const ROWS = 25;
const COLS = 15;
const ROUND_SECONDS = 45;
const MOVE_MS = 34;

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

const SPIKES = new Set(['5:5', '7:11', '9:3', '11:7', '13:11', '15:3', '17:9', '19:5', '21:11']);
const START: Vec = { r: 23, c: 1 };
const RIVAL_START: Vec = { r: 23, c: 13 };

const keyOf = (p: Vec) => `${p.r}:${p.c}`;
const isWall = (r: number, c: number) =>
  r < 0 || c < 0 || r >= ROWS || c >= COLS || MAP[r][c] === '#';

const initials = (name?: string) => (name?.replace('@', '').slice(0, 2).toUpperCase() || 'YOU');

function nextStop(from: Vec, dir: Dir) {
  const d = DIR[dir];
  let r = from.r;
  let c = from.c;
  const cells: Vec[] = [];

  while (!isWall(r + d.r, c + d.c)) {
    r += d.r;
    c += d.c;
    cells.push({ r, c });
  }

  return cells;
}

function pickBotDirection(pos: Vec) {
  const candidates = (Object.keys(DIR) as Dir[])
    .map((dir) => ({ dir, cells: nextStop(pos, dir) }))
    .filter((x) => x.cells.length > 0);

  candidates.sort((a, b) => {
    const aa = a.cells.at(-1)!;
    const bb = b.cells.at(-1)!;
    const scoreA = (ROWS - aa.r) * 2 + a.cells.length - (a.cells.some((p) => SPIKES.has(keyOf(p))) ? 10 : 0);
    const scoreB = (ROWS - bb.r) * 2 + b.cells.length - (b.cells.some((p) => SPIKES.has(keyOf(p))) ? 10 : 0);
    return scoreB - scoreA;
  });

  return candidates[0]?.dir ?? 'up';
}

export default function TombDashDuel() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [player, setPlayer] = useState<Vec>(START);
  const [rival, setRival] = useState<Vec>(RIVAL_START);
  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [collected, setCollected] = useState<Set<string>>(() => new Set([keyOf(START)]));
  const [playerDeadFlash, setPlayerDeadFlash] = useState(false);
  const [rivalDeadFlash, setRivalDeadFlash] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [message, setMessage] = useState('SWIPE TO DASH');
  const [showResult, setShowResult] = useState(false);

  const playerRef = useRef(player);
  const rivalRef = useRef(rival);
  const movingRef = useRef(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const botTimerRef = useRef<number | null>(null);

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { rivalRef.current = rival; }, [rival]);

  const dots = useMemo(() => {
    const result: Vec[] = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (MAP[r][c] === '.' && !SPIKES.has(`${r}:${c}`)) result.push({ r, c });
      }
    }
    return result;
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          setPhase('playing');
          setMessage('GO!');
          window.setTimeout(() => setMessage('SWIPE TO DASH'), 650);
          return 0;
        }
        return value - 1;
      });
    }, 850);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          setPhase('finished');
          window.setTimeout(() => setShowResult(true), 300);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const animatePath = useCallback(async (
    cells: Vec[],
    who: 'player' | 'rival',
  ) => {
    if (!cells.length) return;

    if (who === 'player') {
      movingRef.current = true;
      setIsMoving(true);
    }

    for (const cell of cells) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, MOVE_MS));

      if (who === 'player') {
        setPlayer(cell);
        playerRef.current = cell;

        const cellKey = keyOf(cell);
        if (!collected.has(cellKey)) {
          setCollected((prev) => {
            if (prev.has(cellKey)) return prev;
            const next = new Set(prev);
            next.add(cellKey);
            return next;
          });
          setPlayerScore((score) => score + 1);
        }

        if (SPIKES.has(cellKey)) {
          setPlayerDeadFlash(true);
          setMessage('TRAP!');
          await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
          setPlayer(START);
          playerRef.current = START;
          setPlayerScore((score) => Math.max(0, score - 8));
          window.setTimeout(() => setPlayerDeadFlash(false), 220);
          break;
        }
      } else {
        setRival(cell);
        rivalRef.current = cell;
        setRivalScore((score) => score + 1);

        if (SPIKES.has(keyOf(cell))) {
          setRivalDeadFlash(true);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
          setRival(RIVAL_START);
          rivalRef.current = RIVAL_START;
          setRivalScore((score) => Math.max(0, score - 8));
          window.setTimeout(() => setRivalDeadFlash(false), 220);
          break;
        }
      }
    }

    if (who === 'player') {
      movingRef.current = false;
      setIsMoving(false);
    }
  }, [collected]);

  const dash = useCallback((dir: Dir) => {
    if (phase !== 'playing' || movingRef.current) return;
    const cells = nextStop(playerRef.current, dir);
    if (!cells.length) return;
    void animatePath(cells, 'player');
  }, [animatePath, phase]);

  useEffect(() => {
    if (phase !== 'playing') return;

    const runBot = () => {
      const dir = pickBotDirection(rivalRef.current);
      const cells = nextStop(rivalRef.current, dir);
      void animatePath(cells, 'rival');
      botTimerRef.current = window.setTimeout(runBot, 720 + Math.random() * 520);
    };

    botTimerRef.current = window.setTimeout(runBot, 800);

    return () => {
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, [animatePath, phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const map: Partial<Record<string, Dir>> = {
        ArrowUp: 'up', w: 'up', W: 'up',
        ArrowDown: 'down', s: 'down', S: 'down',
        ArrowLeft: 'left', a: 'left', A: 'left',
        ArrowRight: 'right', d: 'right', D: 'right',
      };
      const dir = map[event.key];
      if (dir) {
        event.preventDefault();
        dash(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dash]);

  const handlePointerDown = (event: React.PointerEvent) => {
    touchRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) dash(dx > 0 ? 'right' : 'left');
    else dash(dy > 0 ? 'down' : 'up');
  };

  const restart = () => {
    setPlayer(START);
    setRival(RIVAL_START);
    playerRef.current = START;
    rivalRef.current = RIVAL_START;
    setPlayerScore(0);
    setRivalScore(0);
    setCollected(new Set([keyOf(START)]));
    setTimeLeft(ROUND_SECONDS);
    setCountdown(3);
    setShowResult(false);
    setPhase('countdown');
    setMessage('SWIPE TO DASH');
  };

  const youWon = playerScore > rivalScore;
  const draw = playerScore === rivalScore;

  return (
    <div className="relative flex h-full min-h-0 w-full select-none flex-col overflow-hidden bg-[#12070f] text-white">
      <style>{`
        @keyframes tombPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes tombPop { from{opacity:0;transform:translate(-50%,-50%) scale(.65)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes tombBlink { 50%{opacity:.2} }
        .tomb-pixel { image-rendering: pixelated; }
      `}</style>

      <header className="relative z-20 flex h-[74px] shrink-0 items-center justify-between px-3 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-[#ffd34e]/30 bg-[#2a1020] text-[10px] font-black text-[#ffd34e]">
            {user?.photo_url ? <img src={user.photo_url} alt="" className="h-full w-full object-cover" /> : initials(user?.tg_user)}
          </div>
          <div className="min-w-0">
            <p className="max-w-[90px] truncate text-[9px] font-black uppercase tracking-[.08em] text-white">{user?.tg_user || 'YOU'}</p>
            <p className="mt-1 text-[8px] font-black text-[#ffd34e]">{playerScore} PTS</p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-[7px] font-black uppercase tracking-[.18em] text-white/35">Tomb Dash</p>
          <div className="mt-1 rounded-[11px] border border-white/10 bg-black/25 px-3 py-1.5 text-[13px] font-black text-[#ffd34e]">
            0:{String(timeLeft).padStart(2, '0')}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0">
            <p className="max-w-[90px] truncate text-[9px] font-black uppercase tracking-[.08em] text-white">RIVAL</p>
            <p className="mt-1 text-[8px] font-black text-[#ff5d7d]">{rivalScore} PTS</p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-[#ff5d7d]/30 bg-[#2a1020] text-[9px] font-black text-[#ff5d7d]">
            R
          </div>
        </div>
      </header>

      <div
        className="relative mx-auto min-h-0 w-full max-w-[430px] flex-1 touch-none px-3 pb-3"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="relative h-full overflow-hidden rounded-[24px] border-[3px] border-[#2f1022] bg-[#0d0710] shadow-[inset_0_0_0_2px_rgba(255,211,78,.08),0_18px_50px_rgba(0,0,0,.35)]">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,211,78,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,211,78,.08) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />

          <div className="absolute inset-[8px] grid" style={{ gridTemplateColumns: `repeat(${COLS},1fr)`, gridTemplateRows: `repeat(${ROWS},1fr)` }}>
            {MAP.map((row, r) => row.split('').map((cell, c) => {
              const k = `${r}:${c}`;
              const wall = cell === '#';
              const spike = SPIKES.has(k);
              const dot = !wall && !spike && !collected.has(k);

              return (
                <div key={k} className="relative">
                  {wall && (
                    <div className="absolute inset-[1px] rounded-[3px] bg-[#5b183b] shadow-[inset_0_2px_0_#8c285d,inset_0_-2px_0_#351027]">
                      {(r + c) % 4 === 0 && <div className="absolute left-[20%] top-[30%] h-[2px] w-[45%] bg-[#b23c74]/45" />}
                    </div>
                  )}
                  {dot && <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffd34e] shadow-[0_0_7px_rgba(255,211,78,.7)]" />}
                  {spike && (
                    <div className="absolute inset-[15%] flex items-end justify-center gap-[1px]">
                      <i className="h-[70%] w-[28%] bg-[#ff5d7d]" style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
                      <i className="h-full w-[28%] bg-[#ff5d7d]" style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
                      <i className="h-[70%] w-[28%] bg-[#ff5d7d]" style={{ clipPath: 'polygon(50% 0,100% 100%,0 100%)' }} />
                    </div>
                  )}
                </div>
              );
            }))}
          </div>

          <div
            className={`pointer-events-none absolute z-10 grid place-items-center transition-[left,top] duration-[34ms] ease-linear ${playerDeadFlash ? 'opacity-20' : ''}`}
            style={{
              left: `calc(8px + (100% - 16px) * ${(player.c + .5) / COLS})`,
              top: `calc(8px + (100% - 16px) * ${(player.r + .5) / ROWS})`,
              width: `calc((100% - 16px) / ${COLS} * .76)`,
              height: `calc((100% - 16px) / ${ROWS} * .76)`,
              transform: 'translate(-50%,-50%)',
            }}
          >
            <div className="relative h-full w-full rotate-45 rounded-[4px] border-2 border-[#fff1a8] bg-[#ffd34e] shadow-[0_0_13px_rgba(255,211,78,.45)]">
              <div className="absolute left-[25%] top-[24%] h-[18%] w-[18%] rounded-full bg-[#2a1020]" />
              <div className="absolute right-[25%] top-[24%] h-[18%] w-[18%] rounded-full bg-[#2a1020]" />
            </div>
          </div>

          <div
            className={`pointer-events-none absolute z-[9] grid place-items-center opacity-45 transition-[left,top] duration-[34ms] ease-linear ${rivalDeadFlash ? 'opacity-10' : ''}`}
            style={{
              left: `calc(8px + (100% - 16px) * ${(rival.c + .5) / COLS})`,
              top: `calc(8px + (100% - 16px) * ${(rival.r + .5) / ROWS})`,
              width: `calc((100% - 16px) / ${COLS} * .7)`,
              height: `calc((100% - 16px) / ${ROWS} * .7)`,
              transform: 'translate(-50%,-50%)',
            }}
          >
            <div className="h-full w-full rotate-45 rounded-[4px] border-2 border-[#ffb2c1] bg-[#ff5d7d]" />
          </div>

          {phase === 'playing' && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[7px] font-black uppercase tracking-[.16em] text-white/60 backdrop-blur-sm">
              {isMoving ? 'DASHING' : message}
            </div>
          )}

          {phase === 'countdown' && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-[#0d0710]/78 backdrop-blur-[2px]">
              <div className="text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 rotate-45 place-items-center rounded-[8px] border-2 border-[#ffd34e] bg-[#5b183b]">
                  <span className="-rotate-45 text-[18px] font-black text-[#ffd34e]">T</span>
                </div>
                <p className="text-[8px] font-black uppercase tracking-[.25em] text-white/45">Get ready</p>
                <strong className="mt-2 block text-[48px] font-black leading-[1.15] text-[#ffd34e]" style={{ animation: 'tombPulse .55s ease-in-out' }}>
                  {countdown}
                </strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {showResult && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-5 backdrop-blur-[3px]">
          <div className="w-full max-w-[330px] rounded-[26px] border-2 border-[#5b183b] bg-[#160a13] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,.55)]">
            <div className="mx-auto grid h-14 w-14 rotate-45 place-items-center rounded-[8px] border-2 border-[#ffd34e]/70 bg-[#5b183b]">
              <span className="-rotate-45 text-[18px] font-black text-[#ffd34e]">{draw ? '=' : youWon ? 'W' : 'L'}</span>
            </div>
            <p className="mt-5 text-[8px] font-black uppercase tracking-[.2em] text-white/35">Tomb Dash Duel</p>
            <h2 className="mt-2 text-[24px] font-black leading-[1.35] text-white">{draw ? 'НИЧЬЯ' : youWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] border border-[#ffd34e]/15 bg-[#ffd34e]/[.06] p-3">
                <span className="text-[7px] font-black text-white/35">YOU</span>
                <strong className="mt-1 block text-[18px] font-black text-[#ffd34e]">{playerScore}</strong>
              </div>
              <div className="rounded-[16px] border border-[#ff5d7d]/15 bg-[#ff5d7d]/[.06] p-3">
                <span className="text-[7px] font-black text-white/35">RIVAL</span>
                <strong className="mt-1 block text-[18px] font-black text-[#ff5d7d]">{rivalScore}</strong>
              </div>
            </div>

            <button type="button" onClick={restart} className="mt-4 w-full rounded-[15px] bg-[#ffd34e] px-4 py-3 text-[9px] font-black uppercase tracking-[.1em] text-[#210d19] active:scale-[.98]">
              ЕЩЁ РАЗ
            </button>
            <button type="button" onClick={() => navigate('/')} className="mt-2 w-full rounded-[15px] border border-white/10 bg-white/[.04] px-4 py-3 text-[8px] font-black uppercase tracking-[.1em] text-white/55 active:scale-[.98]">
              НА ГЛАВНУЮ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
