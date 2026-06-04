import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCw,
  Trophy,
  User,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Phase = 'intro' | 'serve' | 'playing' | 'point' | 'gameover';
type Side = 'user' | 'bot';
type Winner = Side | null;

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  squash: number;
};

type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
};

type Score = {
  user: number;
  bot: number;
};

type GameState = {
  w: number;
  h: number;
  phase: Phase;
  user: PlayerState;
  bot: PlayerState;
  ball: BallState;
  score: Score;
  serving: Side;
  pointText: string;
  rally: number;
  winner: Winner;
  flash: number;
};

type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
};

type HapticFeedback = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = {
  HapticFeedback?: HapticFeedback;
};

const WIN_SCORE = 7;
const GRAVITY = 1580;
const PLAYER_SPEED = 430;
const PLAYER_ACCEL = 2550;
const JUMP_POWER = 760;
const BALL_RESTITUTION = 0.82;
const AIR_DRAG = 0.998;

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const len = (x: number, y: number) => Math.sqrt(x * x + y * y) || 1;

const getTg = () => {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
};

const fallbackVibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  getTg()?.HapticFeedback?.impactOccurred?.(style);

  if (style === 'heavy') {
    fallbackVibrate([24, 18, 30]);
    return;
  }

  if (style === 'medium') {
    fallbackVibrate(16);
    return;
  }

  fallbackVibrate(8);
};

const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  getTg()?.HapticFeedback?.notificationOccurred?.(type);

  if (type === 'error') {
    fallbackVibrate([30, 22, 40]);
    return;
  }

  if (type === 'warning') {
    fallbackVibrate([16, 18, 16]);
    return;
  }

  fallbackVibrate([10, 14, 10]);
};

const hapticSelect = () => {
  getTg()?.HapticFeedback?.selectionChanged?.();
  fallbackVibrate(6);
};

const getFloorY = (h: number) => h - Math.max(34, h * 0.095);
const getBallRadius = (h: number) => clamp(h * 0.035, 11, 17);
const getPlayerHeight = (h: number) => clamp(h * 0.18, 52, 76);
const getPlayerRadius = (h: number) => clamp(h * 0.07, 26, 36);
const getNetHeight = (h: number) => clamp(h * 0.34, 104, 150);
const getNetWidth = (w: number) => clamp(w * 0.018, 9, 14);

const makePlayer = (x: number, floorY: number, facing: 1 | -1): PlayerState => ({
  x,
  y: floorY,
  vx: 0,
  vy: 0,
  onGround: true,
  facing,
  squash: 0,
});

const makeGame = (
  w: number,
  h: number,
  phase: Phase = 'intro',
  score: Score = { user: 0, bot: 0 },
  serving: Side = 'user',
  pointText = '',
): GameState => {
  const floorY = getFloorY(h);
  const ballR = getBallRadius(h);
  const serveFromUser = serving === 'user';

  return {
    w,
    h,
    phase,
    user: makePlayer(w * 0.24, floorY, 1),
    bot: makePlayer(w * 0.76, floorY, -1),
    ball: {
      x: serveFromUser ? w * 0.28 : w * 0.72,
      y: floorY - getPlayerHeight(h) - ballR * 2.2,
      vx: serveFromUser ? w * 0.34 : -w * 0.34,
      vy: -h * 0.96,
      spin: serveFromUser ? 1 : -1,
    },
    score,
    serving,
    pointText,
    rally: 0,
    winner: null,
    flash: 0,
  };
};

const cloneGame = (game: GameState): GameState => ({
  ...game,
  user: { ...game.user },
  bot: { ...game.bot },
  ball: { ...game.ball },
  score: { ...game.score },
});

const getSpeedLabel = (rally: number) => `${(1 + rally * 0.035).toFixed(2)}x`;

export const VolleyballDuelGame = () => {
  const navigate = useNavigate();

  const shellRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const inputRef = useRef<InputState>({ left: false, right: false, jump: false });
  const botJumpCooldownRef = useRef(0);

  const [board, setBoard] = useState({ w: 700, h: 430 });
  const [snapshot, setSnapshot] = useState<GameState>(() => makeGame(700, 430));
  const gameRef = useRef<GameState>(snapshot);

  const floorY = getFloorY(snapshot.h);
  const ballR = getBallRadius(snapshot.h);
  const playerH = getPlayerHeight(snapshot.h);
  const playerR = getPlayerRadius(snapshot.h);
  const netH = getNetHeight(snapshot.h);
  const netW = getNetWidth(snapshot.w);
  const speedLabel = getSpeedLabel(snapshot.rally);

  useEffect(() => {
    const element = shellRef.current;

    if (!element) return;

    const applySize = () => {
      const rect = element.getBoundingClientRect();
      const nextW = Math.max(520, Math.round(rect.height));
      const nextH = Math.max(300, Math.round(rect.width));

      setBoard({ w: nextW, h: nextH });
      gameRef.current = makeGame(nextW, nextH, 'intro');
      setSnapshot(cloneGame(gameRef.current));
    };

    applySize();

    const observer = new ResizeObserver(applySize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const publish = () => {
    setSnapshot(cloneGame(gameRef.current));
  };

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopLoop = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const setInput = (key: keyof InputState, value: boolean) => {
    inputRef.current[key] = value;

    if (value) {
      hapticSelect();
    }
  };

  const movePlayer = (player: PlayerState, dt: number, direction: number, minX: number, maxX: number) => {
    const targetVx = direction * PLAYER_SPEED;
    const delta = targetVx - player.vx;
    const step = clamp(delta, -PLAYER_ACCEL * dt, PLAYER_ACCEL * dt);

    player.vx += step;
    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.vx *= 0.9;
    player.squash = Math.max(0, player.squash - dt * 5.5);

    if (direction !== 0) {
      player.facing = direction > 0 ? 1 : -1;
    }

    if (player.y >= floorY) {
      if (!player.onGround && player.vy > 360) {
        player.squash = 1;
      }

      player.y = floorY;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    player.x = clamp(player.x, minX, maxX);
  };

  const jumpPlayer = (player: PlayerState) => {
    if (!player.onGround) return false;

    player.vy = -JUMP_POWER;
    player.onGround = false;
    player.squash = 0.8;
    return true;
  };

  const collideBallWithPlayer = (player: PlayerState, isUser: boolean) => {
    const game = gameRef.current;
    const ball = game.ball;
    const px = player.x;
    const py = player.y - playerH * 0.63;
    const dx = ball.x - px;
    const dy = ball.y - py;
    const distance = len(dx, dy);
    const minDistance = ballR + playerR;

    if (distance >= minDistance) return;

    const nx = dx / distance;
    const ny = dy / distance;
    const sideBoost = isUser ? 1 : -1;
    const rallyBoost = 1 + game.rally * 0.025;
    const incoming = len(ball.vx, ball.vy);
    const power = clamp(incoming * 0.78 + 360 + game.rally * 16, 520, 980) * rallyBoost;

    ball.x = px + nx * minDistance;
    ball.y = py + ny * minDistance;
    ball.vx = nx * power + player.vx * 0.64 + sideBoost * 170;
    ball.vy = Math.min(ny * power, -Math.abs(ball.vy) * 0.38) - clamp(player.y - ball.y, 0, 80) * 3.2 - 120;
    ball.vx = clamp(ball.vx, -980, 980);
    ball.vy = clamp(ball.vy, -980, 660);
    ball.spin += sideBoost * 0.52 + player.vx * 0.002;

    player.squash = 1;
    game.flash = 1;
    hapticImpact(isUser ? 'medium' : 'light');
  };

  const scorePoint = (winner: Side) => {
    const game = gameRef.current;
    const nextScore = {
      user: game.score.user + (winner === 'user' ? 1 : 0),
      bot: game.score.bot + (winner === 'bot' ? 1 : 0),
    };
    const isMatchOver = nextScore.user >= WIN_SCORE || nextScore.bot >= WIN_SCORE;

    stopLoop();
    clearTimer();

    game.phase = isMatchOver ? 'gameover' : 'point';
    game.score = nextScore;
    game.serving = winner;
    game.winner = isMatchOver ? winner : null;
    game.pointText = winner === 'user' ? 'Goal for You' : 'Bot Scores';
    game.flash = 1;

    hapticNotify(winner === 'user' ? 'success' : 'warning');
    publish();

    if (!isMatchOver) {
      timerRef.current = window.setTimeout(() => {
        gameRef.current = makeGame(board.w, board.h, 'serve', nextScore, winner, winner === 'user' ? 'Your Serve' : 'Bot Serve');
        publish();

        timerRef.current = window.setTimeout(() => {
          gameRef.current.phase = 'playing';
          gameRef.current.pointText = '';
          lastTimeRef.current = performance.now();
          publish();
          rafRef.current = window.requestAnimationFrame(tick);
        }, 850);
      }, 1250);
    }
  };

  const tick = (now: number) => {
    const game = gameRef.current;

    if (game.phase !== 'playing') {
      rafRef.current = null;
      return;
    }

    const dt = clamp((now - lastTimeRef.current) / 1000, 0.001, 0.022);
    lastTimeRef.current = now;

    const input = inputRef.current;
    const ball = game.ball;
    const floor = getFloorY(game.h);
    const userMinX = playerR + 12;
    const userMaxX = game.w / 2 - playerR - netW - 12;
    const botMinX = game.w / 2 + playerR + netW + 12;
    const botMaxX = game.w - playerR - 12;

    game.rally += dt;
    game.flash = Math.max(0, game.flash - dt * 3.4);

    const userDirection = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    movePlayer(game.user, dt, userDirection, userMinX, userMaxX);

    if (input.jump) {
      if (jumpPlayer(game.user)) {
        hapticImpact('light');
      }
      input.jump = false;
    }

    const botHome = game.w * 0.75;
    const botTarget = ball.x > game.w / 2 ? ball.x + clamp(ball.vx * 0.08, -70, 70) : botHome;
    const botDelta = botTarget - game.bot.x;
    const botDirection = Math.abs(botDelta) > 22 ? Math.sign(botDelta) : 0;

    botJumpCooldownRef.current = Math.max(0, botJumpCooldownRef.current - dt);

    const botShouldJump =
      botJumpCooldownRef.current <= 0 &&
      ball.x > game.w / 2 - 36 &&
      Math.abs(ball.x - game.bot.x) < 92 &&
      ball.y > floor - playerH * 2.35 &&
      ball.vy > -120;

    if (botShouldJump && jumpPlayer(game.bot)) {
      botJumpCooldownRef.current = 0.66 + Math.random() * 0.38;
    }

    movePlayer(game.bot, dt, botDirection, botMinX, botMaxX);

    const speedBoost = 1 + game.rally * 0.027;
    ball.vy += GRAVITY * dt;
    ball.vx *= AIR_DRAG;
    ball.vy *= AIR_DRAG;
    ball.x += ball.vx * dt * speedBoost;
    ball.y += ball.vy * dt * speedBoost;
    ball.spin += (ball.vx / 250) * dt;

    if (ball.x - ballR <= 0) {
      ball.x = ballR;
      ball.vx = Math.abs(ball.vx) * BALL_RESTITUTION;
      hapticImpact('light');
    }

    if (ball.x + ballR >= game.w) {
      ball.x = game.w - ballR;
      ball.vx = -Math.abs(ball.vx) * BALL_RESTITUTION;
      hapticImpact('light');
    }

    if (ball.y - ballR <= 0) {
      ball.y = ballR;
      ball.vy = Math.abs(ball.vy) * BALL_RESTITUTION;
      hapticImpact('light');
    }

    const currentNetH = getNetHeight(game.h);
    const currentNetW = getNetWidth(game.w);
    const currentNetX = game.w / 2;
    const netTop = floor - currentNetH;
    const ballInNetX = Math.abs(ball.x - currentNetX) < currentNetW / 2 + ballR;
    const ballInNetY = ball.y + ballR > netTop && ball.y - ballR < floor;

    if (ballInNetX && ballInNetY) {
      if (ball.y < netTop + ballR * 0.8 && ball.vy > 0) {
        ball.y = netTop - ballR;
        ball.vy = -Math.abs(ball.vy) * 0.7;
      } else if (ball.x < currentNetX) {
        ball.x = currentNetX - currentNetW / 2 - ballR;
        ball.vx = -Math.abs(ball.vx) * 0.8;
      } else {
        ball.x = currentNetX + currentNetW / 2 + ballR;
        ball.vx = Math.abs(ball.vx) * 0.8;
      }

      ball.spin *= -0.65;
      game.flash = 0.75;
      hapticImpact('medium');
    }

    collideBallWithPlayer(game.user, true);
    collideBallWithPlayer(game.bot, false);

    if (ball.y + ballR >= floor) {
      ball.y = floor - ballR;
      ball.vy = 0;
      ball.vx *= 0.2;
      scorePoint(ball.x < game.w / 2 ? 'bot' : 'user');
      return;
    }

    publish();
    rafRef.current = window.requestAnimationFrame(tick);
  };

  const startMatch = () => {
    stopLoop();
    clearTimer();

    inputRef.current = { left: false, right: false, jump: false };
    gameRef.current = makeGame(board.w, board.h, 'serve', { user: 0, bot: 0 }, 'user', 'Your Serve');
    publish();
    hapticSelect();

    timerRef.current = window.setTimeout(() => {
      gameRef.current.phase = 'playing';
      gameRef.current.pointText = '';
      lastTimeRef.current = performance.now();
      publish();
      rafRef.current = window.requestAnimationFrame(tick);
    }, 900);
  };

  const restartMatch = () => {
    startMatch();
  };

  return (
    <div ref={shellRef} className="vd-shell">
      <style>{`
        .vd-shell {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 12%, rgba(82,255,229,.14), transparent 36%),
            radial-gradient(circle at 28% 100%, rgba(242,199,102,.10), transparent 36%),
            linear-gradient(180deg, #02030a 0%, #050610 54%, #02030a 100%);
          color: white;
          user-select: none;
          touch-action: none;
        }

        .vd-rotor {
          position: absolute;
          left: 50%;
          top: 50%;
          overflow: hidden;
          transform: translate(-50%, -50%) rotate(90deg);
          transform-origin: center;
          border-radius: 0;
          background:
            radial-gradient(circle at 50% 8%, rgba(255,255,255,.10), transparent 26%),
            radial-gradient(circle at 18% 28%, rgba(82,255,229,.15), transparent 30%),
            radial-gradient(circle at 82% 72%, rgba(242,199,102,.12), transparent 30%),
            linear-gradient(180deg, #071226 0%, #07101e 48%, #030713 100%);
        }

        .vd-rotor * {
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        .vd-rotor::before {
          content: "";
          position: absolute;
          inset: -30%;
          opacity: .12;
          pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px);
          background-size: 42px 42px;
          transform: rotate(-8deg);
          animation: vdGrid 9s linear infinite;
          mask-image: radial-gradient(circle at 50% 46%, black, transparent 74%);
        }

        .vd-topbar {
          position: absolute;
          z-index: 30;
          left: 16px;
          right: 16px;
          top: 14px;
          display: grid;
          grid-template-columns: 44px 1fr 44px;
          align-items: center;
          gap: 10px;
        }

        .vd-icon-btn {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 18px;
          background: rgba(255,255,255,.065);
          color: rgba(255,255,255,.82);
          backdrop-filter: blur(18px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.10), 0 14px 34px rgba(0,0,0,.28);
          transition: transform .12s ease, background .15s ease;
        }

        .vd-icon-btn:active {
          transform: scale(.94);
          background: rgba(255,255,255,.12);
        }

        .vd-score-card {
          min-height: 54px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.12), transparent 66%),
            rgba(255,255,255,.062);
          backdrop-filter: blur(20px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 20px 55px rgba(0,0,0,.32);
          padding: 8px 12px;
        }

        .vd-score-side {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .vd-score-side-bot {
          justify-content: flex-end;
          text-align: right;
        }

        .vd-score-icon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: rgba(255,255,255,.08);
          color: rgba(255,255,255,.75);
        }

        .vd-score-side span,
        .vd-center-label {
          display: block;
          color: rgba(255,255,255,.43);
          font-size: 8px;
          line-height: 1;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vd-score-side b {
          display: block;
          margin-top: 4px;
          color: white;
          font-size: 24px;
          line-height: .9;
          font-weight: 1000;
          letter-spacing: -.065em;
        }

        .vd-center-score {
          min-width: 92px;
          text-align: center;
        }

        .vd-center-score strong {
          display: block;
          margin-top: 4px;
          color: #52ffe5;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
          text-shadow: 0 0 18px rgba(82,255,229,.55);
        }

        .vd-arena {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .vd-sky-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 18%, rgba(82,255,229,.16), transparent 30%),
            radial-gradient(circle at 35% 72%, rgba(157,124,255,.11), transparent 28%),
            radial-gradient(circle at 68% 78%, rgba(242,199,102,.11), transparent 28%);
          animation: vdAurora 4.8s ease-in-out infinite alternate;
        }

        .vd-court {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 34%;
          background:
            linear-gradient(180deg, rgba(82,255,229,.03), rgba(82,255,229,.10)),
            linear-gradient(90deg, rgba(82,255,229,.12), transparent 50%, rgba(242,199,102,.12)),
            #09131d;
          border-top: 1px solid rgba(255,255,255,.16);
          box-shadow: inset 0 22px 55px rgba(0,0,0,.34), 0 -18px 80px rgba(82,255,229,.08);
        }

        .vd-court::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .25;
          background:
            linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px);
          background-size: 48px 48px;
          transform: perspective(200px) rotateX(28deg) translateY(22px);
          transform-origin: top center;
        }

        .vd-court-line {
          position: absolute;
          top: calc(var(--floor-y) * 1px);
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.48), transparent);
          box-shadow: 0 0 24px rgba(82,255,229,.28);
        }

        .vd-half-label {
          position: absolute;
          bottom: 18px;
          color: rgba(255,255,255,.13);
          font-size: 42px;
          line-height: .8;
          font-weight: 1000;
          letter-spacing: -.09em;
          text-transform: uppercase;
          pointer-events: none;
        }

        .vd-half-label-user {
          left: 28px;
        }

        .vd-half-label-bot {
          right: 28px;
        }

        .vd-net {
          position: absolute;
          z-index: 12;
          left: calc(50% - var(--net-w) / 2);
          bottom: calc((var(--stage-h) - var(--floor-y)) * 1px);
          width: var(--net-w);
          height: var(--net-h);
          border-radius: 999px 999px 4px 4px;
          background:
            linear-gradient(180deg, rgba(255,255,255,.95), rgba(82,255,229,.66) 46%, rgba(255,255,255,.30));
          box-shadow:
            0 0 20px rgba(82,255,229,.55),
            0 0 60px rgba(82,255,229,.18);
        }

        .vd-net::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 6px;
          width: 86px;
          height: 52px;
          transform: translateX(-50%);
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.14);
          background:
            linear-gradient(rgba(255,255,255,.13) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.13) 1px, transparent 1px),
            rgba(255,255,255,.035);
          background-size: 14px 14px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
          backdrop-filter: blur(4px);
        }

        .vd-player {
          position: absolute;
          z-index: 16;
          width: calc(var(--player-r) * 2px);
          height: calc(var(--player-h) * 1px);
          left: calc(var(--x) * 1px);
          top: calc(var(--y) * 1px - var(--player-h) * 1px);
          transform: translateX(-50%) scaleY(calc(1 - var(--squash) * .08)) scaleX(calc(1 + var(--squash) * .06));
          transform-origin: center bottom;
          transition: transform .06s linear;
          filter: drop-shadow(0 16px 22px rgba(0,0,0,.28));
        }

        .vd-player-body {
          position: absolute;
          left: 50%;
          bottom: 7px;
          width: 62%;
          height: 62%;
          transform: translateX(-50%);
          border-radius: 46% 46% 42% 42%;
          background:
            radial-gradient(circle at 38% 18%, rgba(255,255,255,.68), transparent 22%),
            linear-gradient(180deg, var(--main-color), var(--deep-color));
          box-shadow:
            inset 0 2px 0 rgba(255,255,255,.34),
            inset 0 -10px 22px rgba(0,0,0,.18),
            0 0 24px var(--glow-color);
        }

        .vd-player-head {
          position: absolute;
          left: 50%;
          top: 0;
          width: 54%;
          height: 42%;
          transform: translateX(-50%);
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 25%, rgba(255,255,255,.78), transparent 23%),
            linear-gradient(180deg, #ffffff, var(--face-color));
          box-shadow:
            inset 0 -8px 14px rgba(0,0,0,.10),
            0 0 22px var(--glow-color);
        }

        .vd-player-eye {
          position: absolute;
          top: 39%;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(3,7,18,.78);
          box-shadow: 0 0 0 2px rgba(255,255,255,.08);
        }

        .vd-player-eye-left {
          left: 32%;
        }

        .vd-player-eye-right {
          right: 32%;
        }

        .vd-player-arm {
          position: absolute;
          top: 45%;
          width: 42%;
          height: 12px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--main-color), rgba(255,255,255,.78));
          transform-origin: 10% center;
          box-shadow: 0 0 18px var(--glow-color);
        }

        .vd-player-user .vd-player-arm {
          right: -20%;
          transform: rotate(-28deg);
        }

        .vd-player-bot .vd-player-arm {
          left: -20%;
          transform: rotate(208deg);
        }

        .vd-player-shadow {
          position: absolute;
          z-index: 10;
          width: calc(var(--player-r) * 2.2px);
          height: 14px;
          left: calc(var(--x) * 1px);
          top: calc(var(--floor-y) * 1px + 3px);
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(0,0,0,.30);
          filter: blur(4px);
        }

        .vd-ball {
          position: absolute;
          z-index: 20;
          left: calc(var(--ball-x) * 1px - var(--ball-r) * 1px);
          top: calc(var(--ball-y) * 1px - var(--ball-r) * 1px);
          width: calc(var(--ball-r) * 2px);
          height: calc(var(--ball-r) * 2px);
          border-radius: 999px;
          background:
            radial-gradient(circle at 34% 24%, rgba(255,255,255,.95), transparent 24%),
            conic-gradient(from calc(var(--spin) * 1rad), #ffffff 0 18%, #52ffe5 18% 34%, #ffffff 34% 52%, #f2c766 52% 70%, #ffffff 70% 100%);
          box-shadow:
            0 0 18px rgba(255,255,255,.55),
            0 0 38px rgba(82,255,229,.38),
            0 14px 24px rgba(0,0,0,.24);
        }

        .vd-ball::after {
          content: "";
          position: absolute;
          inset: 17%;
          border: 2px solid rgba(3,7,18,.22);
          border-radius: 999px;
        }

        .vd-ball-trail {
          position: absolute;
          z-index: 14;
          left: calc(var(--ball-x) * 1px - var(--ball-r) * 2.6px);
          top: calc(var(--ball-y) * 1px - var(--ball-r) * .55px);
          width: calc(var(--ball-r) * 3.2px);
          height: calc(var(--ball-r) * 1.1px);
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(82,255,229,.24), rgba(255,255,255,.18));
          filter: blur(4px);
          transform: translateY(-50%);
          opacity: .65;
        }

        .vd-hit-flash {
          position: absolute;
          z-index: 28;
          inset: 0;
          pointer-events: none;
          opacity: var(--flash);
          background:
            radial-gradient(circle at calc(var(--ball-x) * 1px) calc(var(--ball-y) * 1px), rgba(255,255,255,.45), rgba(82,255,229,.18) 12%, transparent 28%);
          transition: opacity .08s linear;
        }

        .vd-controls {
          position: absolute;
          z-index: 40;
          left: 18px;
          right: 18px;
          bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          pointer-events: none;
        }

        .vd-move-controls {
          display: flex;
          gap: 10px;
          pointer-events: auto;
        }

        .vd-control-btn {
          width: 74px;
          height: 62px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 25px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.16), transparent 66%),
            rgba(255,255,255,.08);
          color: white;
          backdrop-filter: blur(18px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.14),
            0 18px 45px rgba(0,0,0,.30);
          transition: transform .12s ease, background .12s ease;
          touch-action: none;
        }

        .vd-control-btn:active {
          transform: scale(.94);
          background: rgba(82,255,229,.22);
        }

        .vd-jump-btn {
          width: 92px;
          height: 92px;
          border-radius: 34px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.50), transparent 46%),
            linear-gradient(135deg, #ffffff 0%, #f2c766 44%, #52ffe5 100%);
          color: #050610;
          box-shadow:
            inset 0 2px 0 rgba(255,255,255,.52),
            0 22px 55px rgba(242,199,102,.22),
            0 0 50px rgba(82,255,229,.20);
        }

        .vd-action-text {
          margin-top: 4px;
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .vd-speed-pill {
          position: absolute;
          z-index: 25;
          right: 20px;
          top: 82px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.66);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
          backdrop-filter: blur(18px);
        }

        .vd-speed-pill b {
          color: #f2c766;
          font-size: 12px;
        }

        .vd-state-pill {
          position: absolute;
          z-index: 25;
          left: 20px;
          top: 82px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.22);
          color: rgba(255,255,255,.66);
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
          backdrop-filter: blur(18px);
        }

        .vd-state-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #52ffe5;
          box-shadow: 0 0 16px rgba(82,255,229,.72);
        }

        .vd-overlay {
          position: absolute;
          z-index: 70;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 22px;
          background:
            radial-gradient(circle at 50% 18%, rgba(82,255,229,.20), transparent 34%),
            radial-gradient(circle at 50% 82%, rgba(242,199,102,.16), transparent 34%),
            rgba(2,3,10,.78);
          backdrop-filter: blur(20px);
        }

        .vd-intro-card,
        .vd-final-card,
        .vd-point-card {
          width: min(620px, 92%);
          overflow: hidden;
          border-radius: 38px;
          border: 1px solid rgba(255,255,255,.13);
          background:
            radial-gradient(circle at 50% 0%, rgba(255,255,255,.14), transparent 48%),
            linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.038)),
            rgba(3,7,18,.92);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.14),
            0 34px 120px rgba(0,0,0,.66);
          padding: 22px;
          text-align: center;
          animation: vdCardIn .46s cubic-bezier(.16,1.16,.28,1) both;
        }

        .vd-intro-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.07);
          padding: 0 13px;
          color: rgba(255,255,255,.66);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .vd-intro-phone {
          position: relative;
          width: 162px;
          height: 92px;
          margin: 22px auto 18px;
          border-radius: 32px;
          border: 2px solid rgba(255,255,255,.34);
          background:
            radial-gradient(circle at 28% 30%, rgba(82,255,229,.30), transparent 28%),
            linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.04));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.20),
            0 20px 70px rgba(82,255,229,.12);
          animation: vdPhoneFloat 1.8s ease-in-out infinite alternate;
        }

        .vd-intro-phone::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 8px;
          width: 34px;
          height: 5px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255,255,255,.36);
        }

        .vd-intro-phone::after {
          content: "🏐";
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 38px;
          filter: drop-shadow(0 0 18px rgba(255,255,255,.36));
        }

        .vd-intro-card h1,
        .vd-final-card h2,
        .vd-point-card h2 {
          margin: 0;
          color: white;
          font-size: clamp(38px, 8.2vw, 64px);
          line-height: .82;
          font-weight: 1000;
          letter-spacing: -.095em;
          text-shadow: 0 26px 80px rgba(0,0,0,.58);
        }

        .vd-intro-card p,
        .vd-final-card p,
        .vd-point-card p {
          max-width: 430px;
          margin: 13px auto 0;
          color: rgba(255,255,255,.58);
          font-size: 13px;
          line-height: 1.45;
          font-weight: 760;
        }

        .vd-steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 18px;
        }

        .vd-step {
          min-height: 92px;
          display: grid;
          place-items: center;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.055);
          padding: 12px;
        }

        .vd-step svg {
          margin-bottom: 8px;
          color: #52ffe5;
          filter: drop-shadow(0 0 14px rgba(82,255,229,.42));
        }

        .vd-step b {
          display: block;
          color: white;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .vd-step span {
          display: block;
          margin-top: 4px;
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 800;
        }

        .vd-main-button {
          width: 100%;
          min-height: 58px;
          margin-top: 18px;
          border: 0;
          border-radius: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background:
            linear-gradient(135deg, #ffffff 0%, #f2c766 42%, #52ffe5 100%);
          color: #050610;
          font-size: 12px;
          font-weight: 1000;
          letter-spacing: .15em;
          text-transform: uppercase;
          box-shadow:
            inset 0 2px 0 rgba(255,255,255,.52),
            0 22px 55px rgba(242,199,102,.20),
            0 0 50px rgba(82,255,229,.18);
          transition: transform .12s ease;
        }

        .vd-main-button:active {
          transform: scale(.98);
        }

        .vd-secondary-button {
          width: 100%;
          min-height: 46px;
          margin-top: 9px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.065);
          color: rgba(255,255,255,.76);
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .vd-point-overlay {
          position: absolute;
          z-index: 64;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          background: linear-gradient(180deg, transparent, rgba(2,3,10,.48));
        }

        .vd-point-card {
          width: min(430px, 78%);
          padding: 20px;
        }

        .vd-final-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }

        .vd-final-score {
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.055);
          padding: 16px 10px;
        }

        .vd-final-score span {
          color: rgba(255,255,255,.42);
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .vd-final-score b {
          display: block;
          margin-top: 8px;
          color: white;
          font-size: 36px;
          line-height: .85;
          font-weight: 1000;
          letter-spacing: -.08em;
        }

        @keyframes vdGrid {
          from { transform: rotate(-8deg) translateY(0); }
          to { transform: rotate(-8deg) translateY(42px); }
        }

        @keyframes vdAurora {
          from { transform: translateX(-24px) skewX(-5deg); opacity: .72; }
          to { transform: translateX(24px) skewX(5deg); opacity: 1; }
        }

        @keyframes vdCardIn {
          from { opacity: 0; transform: translateY(22px) scale(.94); filter: blur(12px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes vdPhoneFloat {
          from { transform: translateY(0) rotate(-3deg); }
          to { transform: translateY(-8px) rotate(3deg); }
        }
      `}</style>

      <div
        className="vd-rotor"
        style={cssVars({
          width: `${board.w}px`,
          height: `${board.h}px`,
          '--stage-w': snapshot.w,
          '--stage-h': snapshot.h,
          '--floor-y': floorY,
          '--net-h': `${netH}px`,
          '--net-w': `${netW}px`,
          '--player-h': playerH,
          '--player-r': playerR,
          '--ball-r': ballR,
          '--ball-x': snapshot.ball.x,
          '--ball-y': snapshot.ball.y,
          '--ball-vx': snapshot.ball.vx,
          '--ball-vy': snapshot.ball.vy,
          '--spin': snapshot.ball.spin,
          '--flash': snapshot.flash,
        })}
      >
        <div className="vd-arena">
          <div className="vd-sky-glow" />
          <div className="vd-court" />
          <div className="vd-court-line" />
          <div className="vd-half-label vd-half-label-user">YOU</div>
          <div className="vd-half-label vd-half-label-bot">BOT</div>
          <div className="vd-net" />

          <div
            className="vd-player-shadow"
            style={cssVars({
              '--x': snapshot.user.x,
              '--floor-y': floorY,
              '--player-r': playerR,
            })}
          />
          <div
            className="vd-player-shadow"
            style={cssVars({
              '--x': snapshot.bot.x,
              '--floor-y': floorY,
              '--player-r': playerR,
            })}
          />

          <div
            className="vd-player vd-player-user"
            style={cssVars({
              '--x': snapshot.user.x,
              '--y': snapshot.user.y,
              '--player-h': playerH,
              '--player-r': playerR,
              '--squash': snapshot.user.squash,
              '--main-color': '#52ffe5',
              '--deep-color': '#0891b2',
              '--face-color': '#bffdf5',
              '--glow-color': 'rgba(82,255,229,.45)',
            })}
          >
            <div className="vd-player-head">
              <span className="vd-player-eye vd-player-eye-left" />
              <span className="vd-player-eye vd-player-eye-right" />
            </div>
            <div className="vd-player-body" />
            <div className="vd-player-arm" />
          </div>

          <div
            className="vd-player vd-player-bot"
            style={cssVars({
              '--x': snapshot.bot.x,
              '--y': snapshot.bot.y,
              '--player-h': playerH,
              '--player-r': playerR,
              '--squash': snapshot.bot.squash,
              '--main-color': '#f2c766',
              '--deep-color': '#b7791f',
              '--face-color': '#fff0bd',
              '--glow-color': 'rgba(242,199,102,.42)',
            })}
          >
            <div className="vd-player-head">
              <span className="vd-player-eye vd-player-eye-left" />
              <span className="vd-player-eye vd-player-eye-right" />
            </div>
            <div className="vd-player-body" />
            <div className="vd-player-arm" />
          </div>

          <div className="vd-ball-trail" />
          <div className="vd-ball" />
          <div className="vd-hit-flash" />
        </div>

        <div className="vd-topbar">
          <button className="vd-icon-btn" type="button" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>

          <div className="vd-score-card">
            <div className="vd-score-side">
              <div className="vd-score-icon">
                <User size={17} />
              </div>
              <div>
                <span>You</span>
                <b>{snapshot.score.user}</b>
              </div>
            </div>

            <div className="vd-center-score">
              <span className="vd-center-label">Volleyball</span>
              <strong>{WIN_SCORE} to win</strong>
            </div>

            <div className="vd-score-side vd-score-side-bot">
              <div>
                <span>Bot</span>
                <b>{snapshot.score.bot}</b>
              </div>
              <div className="vd-score-icon">
                <Bot size={17} />
              </div>
            </div>
          </div>

          <button className="vd-icon-btn" type="button" onClick={restartMatch}>
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="vd-state-pill">
          <span className="vd-state-dot" />
          {snapshot.phase === 'playing'
            ? 'Live rally'
            : snapshot.phase === 'serve'
              ? snapshot.pointText || 'Serve'
              : snapshot.phase === 'gameover'
                ? 'Match over'
                : snapshot.phase === 'point'
                  ? 'Goal'
                  : 'Ready'}
        </div>

        <div className="vd-speed-pill">
          <Zap size={13} />
          Ball speed <b>{speedLabel}</b>
        </div>

        <div className="vd-controls">
          <div className="vd-move-controls">
            <button
              type="button"
              className="vd-control-btn"
              onPointerDown={() => setInput('left', true)}
              onPointerUp={() => setInput('left', false)}
              onPointerCancel={() => setInput('left', false)}
              onPointerLeave={() => setInput('left', false)}
            >
              <ChevronLeft size={34} />
            </button>

            <button
              type="button"
              className="vd-control-btn"
              onPointerDown={() => setInput('right', true)}
              onPointerUp={() => setInput('right', false)}
              onPointerCancel={() => setInput('right', false)}
              onPointerLeave={() => setInput('right', false)}
            >
              <ChevronRight size={34} />
            </button>
          </div>

          <button
            type="button"
            className="vd-control-btn vd-jump-btn"
            onPointerDown={() => setInput('jump', true)}
            onPointerUp={() => setInput('jump', false)}
            onPointerCancel={() => setInput('jump', false)}
          >
            <div>
              <Zap size={30} />
              <div className="vd-action-text">Jump</div>
            </div>
          </button>
        </div>

        {snapshot.phase === 'intro' && (
          <section className="vd-overlay">
            <div className="vd-intro-card">
              <div className="vd-intro-badge">
                <Trophy size={14} />
                1v1 Volleyball Duel
              </div>

              <div className="vd-intro-phone" />

              <h1>
                Rotate
                <br />
                Sideways
              </h1>

              <p>
                Keep the app locked in portrait, rotate your phone sideways, and play this arena like
                a horizontal game. First to {WIN_SCORE} points wins.
              </p>

              <div className="vd-steps">
                <div className="vd-step">
                  <div>
                    <RotateCw size={24} />
                    <b>Turn phone</b>
                    <span>Hold it sideways</span>
                  </div>
                </div>

                <div className="vd-step">
                  <div>
                    <LockKeyhole size={24} />
                    <b>Lock screen</b>
                    <span>Use iPhone lock</span>
                  </div>
                </div>

                <div className="vd-step">
                  <div>
                    <Zap size={24} />
                    <b>Jump & hit</b>
                    <span>Score on floor</span>
                  </div>
                </div>
              </div>

              <button type="button" className="vd-main-button" onClick={startMatch}>
                <Play size={18} />
                Start match
              </button>

              <button type="button" className="vd-secondary-button" onClick={() => navigate(-1)}>
                Back to arena
              </button>
            </div>
          </section>
        )}

        {snapshot.phase === 'point' && (
          <section className="vd-point-overlay">
            <div className="vd-point-card">
              <h2>{snapshot.pointText}</h2>
              <p>
                {snapshot.score.user} — {snapshot.score.bot}
              </p>
            </div>
          </section>
        )}

        {snapshot.phase === 'gameover' && (
          <section className="vd-overlay">
            <div className="vd-final-card">
              <div className="vd-intro-badge">
                <Trophy size={14} />
                Final score
              </div>

              <h2>{snapshot.winner === 'user' ? 'You Win' : 'Bot Wins'}</h2>

              <p>
                {snapshot.winner === 'user'
                  ? 'Clean match. You controlled the net and finished the rallies.'
                  : 'The bot took the match. Run it back and punish the next serve.'}
              </p>

              <div className="vd-final-grid">
                <div className="vd-final-score">
                  <span>You</span>
                  <b>{snapshot.score.user}</b>
                </div>

                <div className="vd-final-score">
                  <span>Bot</span>
                  <b>{snapshot.score.bot}</b>
                </div>
              </div>

              <button type="button" className="vd-main-button" onClick={restartMatch}>
                <RefreshCw size={18} />
                New match
              </button>

              <button type="button" className="vd-secondary-button" onClick={() => navigate(-1)}>
                Back
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default VolleyballDuelGame;
