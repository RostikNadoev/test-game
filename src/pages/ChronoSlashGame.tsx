import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type PlayerId = 'player' | 'bot';
type ItemType = 'spikes' | 'heart';
type Phase = 'playing' | 'finished';

type Vec = {
  x: number;
  y: number;
};

type Orb = {
  id: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  hasSpikes: boolean;
  hitFlash: number;
  radius: number;
};

type ArenaItem = {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  bornAt: number;
};

type FloatingText = {
  id: string;
  x: number;
  y: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
};

type TelegramWebApp = {
  expand?: () => void;
  disableVerticalSwipes?: () => void;
};

const ARENA_SIZE = 360;
const WALL_PAD = 18;
const PLAY_MIN = WALL_PAD + 22;
const PLAY_MAX = ARENA_SIZE - WALL_PAD - 22;

const MAX_HP = 5;
const BASE_RADIUS = 31;
const MIN_RADIUS = 20;
const SPEED = 206;
const ITEM_INTERVAL_MS = 5000;
const ITEM_RADIUS = 18;
const DAMAGE_COOLDOWN_MS = 380;

const PLAYER_START: Orb = {
  id: 'player',
  x: 112,
  y: 250,
  vx: 130,
  vy: -116,
  hp: MAX_HP,
  hasSpikes: false,
  hitFlash: 0,
  radius: BASE_RADIUS,
};

const BOT_START: Orb = {
  id: 'bot',
  x: 248,
  y: 112,
  vx: -128,
  vy: 119,
  hp: MAX_HP,
  hasSpikes: false,
  hitFlash: 0,
  radius: BASE_RADIUS,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const normalize = (v: Vec): Vec => {
  const len = Math.hypot(v.x, v.y) || 1;

  return {
    x: v.x / len,
    y: v.y / len,
  };
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const hpToRadius = (hp: number) => clamp(BASE_RADIUS - (MAX_HP - hp) * 3.2, MIN_RADIUS, BASE_RADIUS);

const setVelocitySpeed = (orb: Orb, speed = SPEED): Orb => {
  const n = normalize({
    x: orb.vx,
    y: orb.vy,
  });

  return {
    ...orb,
    vx: n.x * speed,
    vy: n.y * speed,
  };
};

const addJitter = (orb: Orb, amount = 0.1): Orb => {
  const angle = Math.atan2(orb.vy, orb.vx) + randomBetween(-amount, amount);

  return {
    ...orb,
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
  };
};

const damageOrb = (orb: Orb): Orb => {
  const hp = Math.max(0, orb.hp - 1);

  return {
    ...orb,
    hp,
    radius: hpToRadius(hp),
    hitFlash: 1,
  };
};

const healOrb = (orb: Orb): Orb => {
  const hp = Math.min(MAX_HP, orb.hp + 1);

  return {
    ...orb,
    hp,
    radius: hpToRadius(hp),
  };
};

const randomItem = (player: Orb, bot: Orb): ArenaItem => {
  const type: ItemType = Math.random() < 0.62 ? 'spikes' : 'heart';

  for (let i = 0; i < 40; i += 1) {
    const item: ArenaItem = {
      id: makeId(),
      type,
      x: randomBetween(PLAY_MIN + ITEM_RADIUS, PLAY_MAX - ITEM_RADIUS),
      y: randomBetween(PLAY_MIN + ITEM_RADIUS, PLAY_MAX - ITEM_RADIUS),
      bornAt: performance.now(),
    };

    const farFromPlayer = dist(item, player) > player.radius + ITEM_RADIUS + 30;
    const farFromBot = dist(item, bot) > bot.radius + ITEM_RADIUS + 30;

    if (farFromPlayer && farFromBot) return item;
  }

  return {
    id: makeId(),
    type,
    x: ARENA_SIZE / 2,
    y: ARENA_SIZE / 2,
    bornAt: performance.now(),
  };
};

const bounceWalls = (orb: Orb): Orb => {
  let next = { ...orb };

  const left = WALL_PAD + next.radius;
  const right = ARENA_SIZE - WALL_PAD - next.radius;
  const top = WALL_PAD + next.radius;
  const bottom = ARENA_SIZE - WALL_PAD - next.radius;

  if (next.x < left) {
    next.x = left;
    next.vx = Math.abs(next.vx);
  }

  if (next.x > right) {
    next.x = right;
    next.vx = -Math.abs(next.vx);
  }

  if (next.y < top) {
    next.y = top;
    next.vy = Math.abs(next.vy);
  }

  if (next.y > bottom) {
    next.y = bottom;
    next.vy = -Math.abs(next.vy);
  }

  return next;
};

const collideOrbs = (a: Orb, b: Orb) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const minDistance = a.radius + b.radius;

  if (distance >= minDistance) {
    return {
      a,
      b,
      collided: false,
    };
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minDistance - distance;

  let nextA: Orb = {
    ...a,
    x: a.x - nx * overlap * 0.5,
    y: a.y - ny * overlap * 0.5,
  };

  let nextB: Orb = {
    ...b,
    x: b.x + nx * overlap * 0.5,
    y: b.y + ny * overlap * 0.5,
  };

  const tx = -ny;
  const ty = nx;

  const tangentA = nextA.vx * tx + nextA.vy * ty;
  const tangentB = nextB.vx * tx + nextB.vy * ty;

  const normalA = nextA.vx * nx + nextA.vy * ny;
  const normalB = nextB.vx * nx + nextB.vy * ny;

  nextA = {
    ...nextA,
    vx: tx * tangentA + nx * normalB,
    vy: ty * tangentA + ny * normalB,
  };

  nextB = {
    ...nextB,
    vx: tx * tangentB + nx * normalA,
    vy: ty * tangentB + ny * normalA,
  };

  return {
    a: addJitter(setVelocitySpeed(nextA), 0.07),
    b: addJitter(setVelocitySpeed(nextB), 0.07),
    collided: true,
  };
};

const OrbShape = ({ orb, label, avatar }: { orb: Orb; label: string; avatar: string }) => {
  const isPlayer = orb.id === 'player';
  const main = isPlayer ? '#38bdf8' : '#ef4444';
  const spikeColor = isPlayer ? '#f8fafc' : '#fca5a5';
  const glow = isPlayer ? 'url(#playerGlow)' : 'url(#botGlow)';
  const body = isPlayer ? 'url(#playerOrb)' : 'url(#botOrb)';
  const flashScale = orb.hitFlash > 0 ? 1 + orb.hitFlash * 0.12 : 1;

  const spikeCount = 18;
  const spikeOuter = orb.radius + 13;
  const spikeInner = orb.radius + 2;

  return (
    <g transform={`translate(${orb.x} ${orb.y})`}>
      <ellipse cx="0" cy={orb.radius + 10} rx={orb.radius * 0.88} ry="8" fill="rgba(0,0,0,.42)" />

      {orb.hasSpikes && (
        <g filter={glow}>
          {Array.from({ length: spikeCount }).map((_, index) => {
            const angle = (Math.PI * 2 * index) / spikeCount;
            const a1 = angle - 0.08;
            const a2 = angle + 0.08;

            const p1 = {
              x: Math.cos(a1) * spikeInner,
              y: Math.sin(a1) * spikeInner,
            };
            const p2 = {
              x: Math.cos(angle) * spikeOuter,
              y: Math.sin(angle) * spikeOuter,
            };
            const p3 = {
              x: Math.cos(a2) * spikeInner,
              y: Math.sin(a2) * spikeInner,
            };

            return (
              <path
                key={index}
                d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} Z`}
                fill={spikeColor}
                stroke="rgba(15,23,42,.8)"
                strokeWidth="1"
              />
            );
          })}
        </g>
      )}

      <circle
        r={orb.radius * flashScale}
        fill={orb.hitFlash > 0 ? 'rgba(255,255,255,.2)' : `${main}22`}
        filter={glow}
      />

      <circle
        r={orb.radius}
        fill={body}
        stroke="rgba(255,255,255,.58)"
        strokeWidth="2.5"
        filter={glow}
      />

      <circle r={orb.radius * 0.69} fill="rgba(2,6,23,.62)" stroke="rgba(255,255,255,.18)" strokeWidth="1.5" />
      <circle cx={-orb.radius * 0.22} cy={-orb.radius * 0.24} r={orb.radius * 0.18} fill="rgba(255,255,255,.38)" />
      <circle cx={orb.radius * 0.18} cy={orb.radius * 0.2} r={orb.radius * 0.11} fill="rgba(255,255,255,.12)" />

      <text
        x="0"
        y="8"
        textAnchor="middle"
        className="fill-white text-[22px] font-black"
        stroke="rgba(0,0,0,.5)"
        strokeWidth="3"
        paintOrder="stroke"
      >
        {avatar}
      </text>

      <text
        x="0"
        y={orb.radius + 31}
        textAnchor="middle"
        className="fill-white text-[10px] font-black tracking-[0.2em]"
        opacity="0.6"
      >
        {label}
      </text>
    </g>
  );
};

const ItemShape = ({ item }: { item: ArenaItem }) => {
  const isSpikes = item.type === 'spikes';

  return (
    <g transform={`translate(${item.x} ${item.y})`}>
      <g style={{ animation: 'itemTinyShake 1.1s ease-in-out infinite', transformOrigin: 'center' }}>
        {isSpikes ? (
          <>
            {Array.from({ length: 10 }).map((_, index) => {
              const angle = (Math.PI * 2 * index) / 10;

              return (
                <path
                  key={index}
                  d={`M ${Math.cos(angle - 0.08) * 12} ${Math.sin(angle - 0.08) * 12} L ${Math.cos(angle) * 22} ${Math.sin(angle) * 22} L ${Math.cos(angle + 0.08) * 12} ${Math.sin(angle + 0.08) * 12} Z`}
                  fill="#ef4444"
                  stroke="rgba(255,255,255,.46)"
                  strokeWidth="1"
                />
              );
            })}

            <circle r="12" fill="#450a0a" stroke="#fecaca" strokeWidth="2" />

            <text x="0" y="5" textAnchor="middle" className="fill-white text-[12px] font-black">
              !
            </text>
          </>
        ) : (
          <>
            <path
              d="M 0 15 C -22 1 -17 -16 -5 -14 C -1 -14 0 -10 0 -10 C 0 -10 1 -14 5 -14 C 17 -16 22 1 0 15 Z"
              fill="#22c55e"
              stroke="#dcfce7"
              strokeWidth="2"
              filter="url(#heartGlow)"
            />

            <text x="0" y="4" textAnchor="middle" className="fill-white text-[10px] font-black">
              +
            </text>
          </>
        )}
      </g>
    </g>
  );
};

export const ChronoSlashGame = () => {
  const navigate = useNavigate();

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const lastItemAtRef = useRef(performance.now());
  const lastDamageAtRef = useRef(0);
  const matchStartedAtRef = useRef(performance.now());
  const phaseRef = useRef<Phase>('playing');

  const playerRef = useRef<Orb>(setVelocitySpeed({ ...PLAYER_START }));
  const botRef = useRef<Orb>(setVelocitySpeed({ ...BOT_START }));
  const itemRef = useRef<ArenaItem | null>(null);

  const [phase, setPhase] = useState<Phase>('playing');
  const [player, setPlayer] = useState<Orb>(setVelocitySpeed({ ...PLAYER_START }));
  const [bot, setBot] = useState<Orb>(setVelocitySpeed({ ...BOT_START }));
  const [item, setItem] = useState<ArenaItem | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [matchTime, setMatchTime] = useState(0);
  const [nextItemIn, setNextItemIn] = useState(ITEM_INTERVAL_MS / 1000);
  const [status, setStatus] = useState('Шары летят сами. Ждём первый предмет...');

  const playerHpPercent = (player.hp / MAX_HP) * 100;
  const botHpPercent = (bot.hp / MAX_HP) * 100;

  const addFloatingText = (x: number, y: number, text: string, tone: FloatingText['tone']) => {
    const floating: FloatingText = {
      id: makeId(),
      x,
      y,
      text,
      tone,
    };

    setFloatingTexts((prev) => [...prev, floating]);

    window.setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((entry) => entry.id !== floating.id));
    }, 850);
  };

  const spawnItem = (now: number, currentPlayer: Orb, currentBot: Orb) => {
    const next = randomItem(currentPlayer, currentBot);

    itemRef.current = next;
    setItem(next);
    lastItemAtRef.current = now;

    setStatus(next.type === 'spikes' ? 'На поле появились шипы!' : 'На поле появилось сердце!');
  };

  const finishGame = (winnerId: PlayerId) => {
    phaseRef.current = 'finished';
    setPhase('finished');
    setWinner(winnerId);
    setStatus(winnerId === 'player' ? 'Ты победил!' : 'Бот победил!');
  };

  const resetGame = () => {
    const playerStart = setVelocitySpeed({ ...PLAYER_START });
    const botStart = setVelocitySpeed({ ...BOT_START });

    playerRef.current = playerStart;
    botRef.current = botStart;
    itemRef.current = null;
    phaseRef.current = 'playing';

    const now = performance.now();
    lastTimeRef.current = now;
    lastItemAtRef.current = now;
    lastDamageAtRef.current = 0;
    matchStartedAtRef.current = now;

    setPlayer(playerStart);
    setBot(botStart);
    setItem(null);
    setFloatingTexts([]);
    setWinner(null);
    setMatchTime(0);
    setNextItemIn(ITEM_INTERVAL_MS / 1000);
    setStatus('Шары летят сами. Ждём первый предмет...');
    setPhase('playing');
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
      event.preventDefault();
    };

    const preventContext = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    document.addEventListener('contextmenu', preventContext);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

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
  }, []);

  useEffect(() => {
    resetGame();

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      if (phaseRef.current === 'playing') {
        let nextPlayer = { ...playerRef.current };
        let nextBot = { ...botRef.current };

        nextPlayer.x += nextPlayer.vx * dt;
        nextPlayer.y += nextPlayer.vy * dt;
        nextBot.x += nextBot.vx * dt;
        nextBot.y += nextBot.vy * dt;

        nextPlayer.hitFlash = Math.max(0, nextPlayer.hitFlash - dt * 3.6);
        nextBot.hitFlash = Math.max(0, nextBot.hitFlash - dt * 3.6);

        nextPlayer = bounceWalls(nextPlayer);
        nextBot = bounceWalls(nextBot);

        const collision = collideOrbs(nextPlayer, nextBot);
        nextPlayer = collision.a;
        nextBot = collision.b;

        if (collision.collided && now - lastDamageAtRef.current > DAMAGE_COOLDOWN_MS) {
          const collisionPoint = {
            x: (nextPlayer.x + nextBot.x) / 2,
            y: (nextPlayer.y + nextBot.y) / 2,
          };

          const playerSpiky = nextPlayer.hasSpikes;
          const botSpiky = nextBot.hasSpikes;

          if (playerSpiky && botSpiky) {
            nextPlayer = {
              ...nextPlayer,
              hasSpikes: false,
            };

            nextBot = {
              ...nextBot,
              hasSpikes: false,
            };

            addFloatingText(collisionPoint.x, collisionPoint.y - 12, 'CLASH', 'neutral');
            setStatus('Оба были с шипами — шипы сломались, HP не снялось!');
            lastDamageAtRef.current = now;
          } else if (playerSpiky && !botSpiky) {
            nextBot = damageOrb(nextBot);

            nextPlayer = {
              ...nextPlayer,
              hasSpikes: false,
            };

            addFloatingText(nextBot.x, nextBot.y - 24, '-1 HP', 'bad');
            setStatus('Твой шар ударил бота шипами!');
            lastDamageAtRef.current = now;
          } else if (!playerSpiky && botSpiky) {
            nextPlayer = damageOrb(nextPlayer);

            nextBot = {
              ...nextBot,
              hasSpikes: false,
            };

            addFloatingText(nextPlayer.x, nextPlayer.y - 24, '-1 HP', 'bad');
            setStatus('Бот ударил тебя шипами!');
            lastDamageAtRef.current = now;
          }
        }

        const activeItem = itemRef.current;

        if (!activeItem && now - lastItemAtRef.current >= ITEM_INTERVAL_MS) {
          spawnItem(now, nextPlayer, nextBot);
        }

        if (activeItem) {
          const playerGets = dist(nextPlayer, activeItem) <= nextPlayer.radius + ITEM_RADIUS;
          const botGets = dist(nextBot, activeItem) <= nextBot.radius + ITEM_RADIUS;

          if (playerGets || botGets) {
            const playerDistance = dist(nextPlayer, activeItem);
            const botDistance = dist(nextBot, activeItem);

            const owner: PlayerId =
              playerGets && botGets
                ? playerDistance <= botDistance
                  ? 'player'
                  : 'bot'
                : playerGets
                  ? 'player'
                  : 'bot';

            if (activeItem.type === 'spikes') {
              if (owner === 'player') {
                nextPlayer = {
                  ...nextPlayer,
                  hasSpikes: true,
                };

                addFloatingText(nextPlayer.x, nextPlayer.y - 28, 'SPIKES', 'neutral');
                setStatus('Ты подобрал шипы!');
              } else {
                nextBot = {
                  ...nextBot,
                  hasSpikes: true,
                };

                addFloatingText(nextBot.x, nextBot.y - 28, 'SPIKES', 'neutral');
                setStatus('Бот подобрал шипы!');
              }
            }

            if (activeItem.type === 'heart') {
              if (owner === 'player') {
                const beforeHp = nextPlayer.hp;
                nextPlayer = healOrb(nextPlayer);

                addFloatingText(nextPlayer.x, nextPlayer.y - 28, beforeHp >= MAX_HP ? 'MAX HP' : '+1 HP', 'good');
                setStatus(beforeHp >= MAX_HP ? 'Ты взял сердце, но HP уже максимум' : 'Ты восстановил 1 HP!');
              } else {
                const beforeHp = nextBot.hp;
                nextBot = healOrb(nextBot);

                addFloatingText(nextBot.x, nextBot.y - 28, beforeHp >= MAX_HP ? 'MAX HP' : '+1 HP', 'good');
                setStatus(beforeHp >= MAX_HP ? 'Бот взял сердце, но HP уже максимум' : 'Бот восстановил 1 HP!');
              }
            }

            itemRef.current = null;
            setItem(null);
            lastItemAtRef.current = now;
          }
        }

        nextPlayer = bounceWalls(setVelocitySpeed(nextPlayer));
        nextBot = bounceWalls(setVelocitySpeed(nextBot));

        playerRef.current = nextPlayer;
        botRef.current = nextBot;

        setPlayer(nextPlayer);
        setBot(nextBot);
        setMatchTime((now - matchStartedAtRef.current) / 1000);
        setNextItemIn(Math.max(0, (ITEM_INTERVAL_MS - (now - lastItemAtRef.current)) / 1000));

        if (nextPlayer.hp <= 0 && nextBot.hp <= 0) {
          finishGame('player');
        } else if (nextBot.hp <= 0) {
          finishGame('player');
        } else if (nextPlayer.hp <= 0) {
          finishGame('bot');
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes bgDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(14px, -12px, 0) scale(1.05); }
        }

        @keyframes itemTinyShake {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          25% { transform: translate3d(.8px, -.6px, 0) rotate(-1.2deg); }
          50% { transform: translate3d(-.6px, .7px, 0) rotate(.9deg); }
          75% { transform: translate3d(.5px, .4px, 0) rotate(-.7deg); }
        }

        @keyframes floatUp {
          0% { opacity: 0; transform: translateY(10px) scale(.8); }
          18% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-34px) scale(1.04); }
        }

        @keyframes stripeMove {
          0% { background-position: 0 0; }
          100% { background-position: 90px 0; }
        }

        @keyframes endPop {
          0% { opacity: 0; transform: translateY(18px) scale(.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="relative h-full w-full overflow-hidden bg-[#070a12] text-white touch-none select-none"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(56,189,248,.12),transparent_28%),radial-gradient(circle_at_85%_22%,rgba(239,68,68,.1),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,.9),transparent_38%),linear-gradient(180deg,#111827_0%,#0b1120_46%,#05070d_100%)]" />
        <div className="absolute -left-20 top-16 h-52 w-52 rounded-full bg-sky-500/8 blur-3xl" style={{ animation: 'bgDrift 7s ease-in-out infinite' }} />
        <div className="absolute -right-24 top-48 h-60 w-60 rounded-full bg-red-500/7 blur-3xl" style={{ animation: 'bgDrift 8s ease-in-out infinite reverse' }} />

        <div className="relative z-10 flex h-full min-h-0 flex-col gap-2 px-3 py-2">
          <div className="shrink-0 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 shadow-[0_18px_50px_rgba(0,0,0,.34)] backdrop-blur-xl">
            <div
              className="h-1.5"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#334155 0 25%,#38bdf8 25% 42%,#0f172a 42% 58%,#ef4444 58% 76%,#334155 76% 100%)',
                backgroundSize: '90px 100%',
                animation: 'stripeMove 2s linear infinite',
              }}
            />

            <div className="px-3 py-2.5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-2xl border border-sky-300/14 bg-sky-300/8 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-100/55">you</div>
                    <div className="text-[10px] font-black text-sky-100">{player.hp}/{MAX_HP}</div>
                  </div>

                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,.55)] transition-[width]"
                      style={{ width: `${playerHpPercent}%` }}
                    />
                  </div>
                </div>

                <div className="min-w-[112px] text-center">
                  <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">Auto Duel</div>
                  <div className="mt-0.5 bg-gradient-to-r from-slate-100 via-sky-100 to-slate-300 bg-clip-text text-lg font-black leading-none text-transparent">
                    SPIKE BALLS
                  </div>
                  <div className="mt-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/32">
                    {phase === 'playing' ? `item ${nextItemIn.toFixed(1)}s` : 'finish'}
                  </div>
                </div>

                <div className="rounded-2xl border border-red-300/14 bg-red-300/8 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black text-red-100">{bot.hp}/{MAX_HP}</div>
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-red-100/55">bot</div>
                  </div>

                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="ml-auto h-full rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,.55)] transition-[width]"
                      style={{ width: `${botHpPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                <div className="rounded-xl bg-white/7 py-1">
                  Time <span className="text-white/85">{matchTime.toFixed(1)}s</span>
                </div>
                <div className="rounded-xl bg-white/7 py-1">
                  You <span className="text-sky-200">{player.hasSpikes ? 'SPIKES' : 'SAFE'}</span>
                </div>
                <div className="rounded-xl bg-white/7 py-1">
                  Bot <span className="text-red-200">{bot.hasSpikes ? 'SPIKES' : 'SAFE'}</span>
                </div>
              </div>

              <div className="mt-1.5 truncate text-center text-[10px] font-bold text-white/48">{status}</div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[36px] border border-white/10 bg-slate-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_24px_70px_rgba(0,0,0,.32)] backdrop-blur-sm">
            <svg viewBox={`0 0 ${ARENA_SIZE} ${ARENA_SIZE}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
              <defs>
                <filter id="playerGlow" x="-90%" y="-90%" width="280%" height="280%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#38bdf8" floodOpacity="0.58" />
                </filter>

                <filter id="botGlow" x="-90%" y="-90%" width="280%" height="280%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ef4444" floodOpacity="0.58" />
                </filter>

                <filter id="heartGlow" x="-90%" y="-90%" width="280%" height="280%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#22c55e" floodOpacity="0.58" />
                </filter>

                <radialGradient id="arenaBg" cx="50%" cy="50%" r="62%">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="58%" stopColor="#111827" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>

                <radialGradient id="playerOrb" cx="36%" cy="28%" r="72%">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="17%" stopColor="#bae6fd" />
                  <stop offset="58%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#075985" />
                </radialGradient>

                <radialGradient id="botOrb" cx="36%" cy="28%" r="72%">
                  <stop offset="0%" stopColor="#fef2f2" />
                  <stop offset="17%" stopColor="#fecaca" />
                  <stop offset="58%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#7f1d1d" />
                </radialGradient>
              </defs>

              <rect x="0" y="0" width={ARENA_SIZE} height={ARENA_SIZE} rx="34" fill="rgba(0,0,0,.42)" />
              <rect x="8" y="8" width={ARENA_SIZE - 16} height={ARENA_SIZE - 16} rx="30" fill="rgba(15,23,42,.72)" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
              <rect x={WALL_PAD} y={WALL_PAD} width={ARENA_SIZE - WALL_PAD * 2} height={ARENA_SIZE - WALL_PAD * 2} rx="24" fill="url(#arenaBg)" stroke="rgba(148,163,184,.34)" strokeWidth="3" />

              <g opacity=".28">
                <path d="M 30 30 L 330 30" stroke="rgba(255,255,255,.16)" strokeWidth="2" strokeDasharray="8 8" />
                <path d="M 30 330 L 330 330" stroke="rgba(255,255,255,.16)" strokeWidth="2" strokeDasharray="8 8" />
                <path d="M 30 30 L 30 330" stroke="rgba(255,255,255,.16)" strokeWidth="2" strokeDasharray="8 8" />
                <path d="M 330 30 L 330 330" stroke="rgba(255,255,255,.16)" strokeWidth="2" strokeDasharray="8 8" />
                <path d="M 180 30 L 180 330" stroke="rgba(255,255,255,.055)" strokeWidth="1" />
                <path d="M 30 180 L 330 180" stroke="rgba(255,255,255,.055)" strokeWidth="1" />
              </g>

              {item && <ItemShape item={item} />}

              <OrbShape orb={player} label="YOU" avatar="😎" />
              <OrbShape orb={bot} label="BOT" avatar="🤖" />

              {floatingTexts.map((floating) => (
                <g key={floating.id} transform={`translate(${floating.x} ${floating.y})`}>
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    className={`text-[17px] font-black ${
                      floating.tone === 'good'
                        ? 'fill-emerald-200'
                        : floating.tone === 'bad'
                          ? 'fill-red-200'
                          : 'fill-slate-100'
                    }`}
                    stroke="rgba(0,0,0,.5)"
                    strokeWidth="4"
                    paintOrder="stroke"
                    style={{ animation: 'floatUp .85s ease-out forwards' }}
                  >
                    {floating.text}
                  </text>
                </g>
              ))}
            </svg>

            {winner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/68 p-5 backdrop-blur-md">
                <div
                  className="w-full max-w-[360px] overflow-hidden rounded-[34px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] text-center shadow-[0_30px_90px_rgba(0,0,0,0.56)]"
                  style={{ animation: 'endPop .32s ease-out both' }}
                >
                  <div
                    className="h-3"
                    style={{
                      backgroundImage: 'linear-gradient(90deg,#334155 0 25%,#38bdf8 25% 50%,#ef4444 50% 75%,#334155 75% 100%)',
                    }}
                  />

                  <div className="px-6 py-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/38">
                      {winner === 'player' ? 'victory' : 'defeat'}
                    </div>

                    <div className="mt-2 bg-gradient-to-r from-slate-100 via-white to-slate-300 bg-clip-text text-5xl font-black tracking-tight text-transparent">
                      {winner === 'player' ? 'SPIKE WIN' : 'BALL DOWN'}
                    </div>

                    <div className="mt-3 text-sm font-semibold text-white/52">
                      {winner === 'player'
                        ? 'Твой шар пережил хаос арены.'
                        : 'Бот оказался удачливее.'}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="rounded-3xl border border-sky-300/12 bg-sky-300/8 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">
                          your hp
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-sky-200">
                          {player.hp}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-red-300/12 bg-red-300/8 px-4 py-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">
                          bot hp
                        </div>
                        <div className="mt-2 text-4xl font-black leading-none text-red-200">
                          {bot.hp}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={resetGame}
                      className="mt-7 w-full rounded-3xl bg-gradient-to-r from-sky-500 to-slate-700 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_16px_34px_rgba(56,189,248,0.16)] transition active:scale-[0.98]"
                    >
                      Play Again
                    </button>

                    <button
                      onClick={() => navigate(-1)}
                      className="mt-3 w-full rounded-3xl border border-white/10 bg-white/8 py-3 text-sm font-black text-white/75 transition active:scale-[0.98]"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 rounded-[24px] border border-white/10 bg-slate-950/58 px-4 py-3 text-center text-xs font-bold text-white/48 backdrop-blur-xl">
            Каждые 5 секунд предмет появляется внутри поля. Шипы дают урон при столкновении, сердце восстанавливает HP.
          </div>
        </div>
      </div>
    </>
  );
};

export default ChronoSlashGame;