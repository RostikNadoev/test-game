import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { LobbyPlayerInfo } from "../api/types";
import {
  plinkoWsApi,
  type PlinkoRevealBall,
  type PlinkoSocketClient,
  type PlinkoStateMessage,
} from "../api/plinkoWs";
import { useAuth } from "../auth/useAuth";
import coinIcon from "../assets/solo/scratch/icon-coin.webp";

const CFG = {
  VW: 360, VH: 520,
  ROWS: 9, TOP_PEGS: 3,
  TOP_Y: 64, SY: 43, SX: 30,
  pegR: 5, ballR: 6.5,
  WALL_L: 10, WALL_R: 350,
  FLOOR: 494,
  SLOT_TOP: 448,
  N_SLOTS: 10,
  g: 760,
  eRest: 0.48,
  wRest: 0.4,
  air: 0.999,
  DT: 1 / 240,
  MAX_STEPS: 9000,
  DROP_Y: 48,
  DROP_OFFSET: 0.6,
  LAUNCH_VX: 120,
  LAUNCH_VY: 20,
  pegFric: 0.06,
  SUBSTEPS_PER_FRAME: 4,
  REVEAL_SPEED: 1.12,
  MAX_DPR: 1.45,
  MAX_PARTICLES: 90,
  MAX_POPS: 18,
  VALUES: [9, 6, 3.5, 2, 1.2, 1.1, 1.8, 3.2, 5.5, 8.5] as number[],
  WIND_MAX: 0.16,
  WALL_MIN_ROW: 3,
  ACTIONS_PER_TURN: 2,
  ANGLE_SECONDS: 15,
  ACTION_SECONDS: 15,
  BALLS_PER_PLAYER: 5,
  ANGLE_MAX_DEG: 18,
};

type Peg = { x: number; y: number; row: number; col: number };
type Seg = { ax: number; ay: number; bx: number; by: number };
type Gap = { row: number; idx: number } & Seg & { mx: number; my: number };
type Board = {
  pegs: Peg[];
  dividers: number[];
  posts: number[];
  gaps: Gap[];
};
type SimResult = { path: number[][]; slot: number };

type TelegramWebApp = {
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
    selectionChanged?: () => void;
  };
};

function getTelegramWebApp() {
  return (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

function hapticImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred?.(style);

  if (!tg?.HapticFeedback?.impactOccurred && navigator.vibrate) {
    navigator.vibrate(style === "heavy" ? 55 : style === "medium" ? 32 : 18);
  }
}

function hapticSelection() {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.selectionChanged?.();

  if (!tg?.HapticFeedback?.selectionChanged && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function hapticNotify(type: "error" | "success" | "warning") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.notificationOccurred?.(type);

  if (!tg?.HapticFeedback?.notificationOccurred && navigator.vibrate) {
    navigator.vibrate(type === "success" ? [25, 35, 25] : 35);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isStuckPathResting(path: number[][], idx: number) {
  if (idx < 120 || path.length < 2) return false;

  const cur = path[idx];
  const last = path[path.length - 1];
  if (!cur || !last) return false;

  const nearFinal = Math.hypot(cur[0] - last[0], cur[1] - last[1]) < 3.2;
  if (!nearFinal) return false;

  const lookAhead = Math.min(path.length - 1, idx + 72);
  let maxDrift = 0;
  for (let i = idx; i <= lookAhead; i += 6) {
    const pt = path[i];
    if (!pt) continue;
    maxDrift = Math.max(maxDrift, Math.hypot(pt[0] - cur[0], pt[1] - cur[1]));
  }

  return maxDrift < 2.4;
}

function buildBoard(): Board {
  const c = CFG;
  const pegs: Peg[] = [];
  for (let r = 0; r < c.ROWS; r++) {
    const n = c.TOP_PEGS + r;
    const w = (n - 1) * c.SX;
    const left = c.VW / 2 - w / 2;
    for (let col = 0; col < n; col++) {
      pegs.push({ x: left + col * c.SX, y: c.TOP_Y + r * c.SY, row: r, col });
    }
  }

  const dividers: number[] = [];
  for (let i = 0; i <= c.N_SLOTS; i++) {
    dividers.push(c.WALL_L + ((c.WALL_R - c.WALL_L) * i) / c.N_SLOTS);
  }
  const posts = dividers.slice(1, -1);

  const gaps: Gap[] = [];
  for (let r = c.WALL_MIN_ROW; r < c.ROWS; r++) {
    const row = pegs.filter((p) => p.row === r).sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i], b = row[i + 1];
      gaps.push({
        row: r, idx: i,
        ax: a.x, ay: a.y, bx: b.x, by: b.y,
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      });
    }
  }

  return { pegs, dividers, posts, gaps };
}

function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return [ax, ay] as const;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * dx, ay + t * dy] as const;
}

/** Настоящая детерминированная симуляция. angleNorm ∈ [-1, 1]. */
function simulate(angleNorm: number, board: Board, userWalls: Seg[]): SimResult {
  const c = CFG;
  let x = c.VW / 2 + c.DROP_OFFSET;
  let y = c.DROP_Y;
  let vx = angleNorm * c.LAUNCH_VX;
  let vy = c.LAUNCH_VY;
  const path: number[][] = [];
  let settle = 0;

  const posts = board.posts;

  for (let step = 0; step < c.MAX_STEPS; step++) {
    vy += c.g * c.DT;
    vx *= c.air; vy *= c.air;
    x += vx * c.DT;
    y += vy * c.DT;

    // пеги — импульсное столкновение круг-круг + трение по касательной
    for (const p of board.pegs) {
      const dx = x - p.x, dy = y - p.y;
      const md = c.ballR + c.pegR;
      const d2 = dx * dx + dy * dy;
      if (d2 < md * md && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        x += nx * (md - d); y += ny * (md - d);
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny;
          const tx = -ny, ty = nx;
          const vt = vx * tx + vy * ty;
          vx -= c.pegFric * vt * tx; vy -= c.pegFric * vt * ty;
        }
      }
    }

    // стенки игроков (отрезок-круг)
    for (const w of userWalls) {
      const [cx, cy] = closestOnSeg(x, y, w.ax, w.ay, w.bx, w.by);
      const dx = x - cx, dy = y - cy;
      const md = c.ballR + 3.5;
      const d2 = dx * dx + dy * dy;
      if (d2 < md * md && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        x += nx * (md - d); y += ny * (md - d);
        const vn = vx * nx + vy * ny;
        if (vn < 0) { vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny; }
      }
    }

    // боковые стены
    if (x - c.ballR < c.WALL_L) { x = c.WALL_L + c.ballR; if (vx < 0) vx = -vx * c.wRest; }
    if (x + c.ballR > c.WALL_R) { x = c.WALL_R - c.ballR; if (vx > 0) vx = -vx * c.wRest; }

    // столбики между лунками (короткие, образуют мелкие стаканы)
    if (y + c.ballR > c.SLOT_TOP - 12) {
      for (const dvx of posts) {
        const tdx = x - dvx, tdy = y - c.SLOT_TOP;
        const md = c.ballR + 2.5;
        const td2 = tdx * tdx + tdy * tdy;
        if (tdy < 0 && td2 < md * md && td2 > 1e-12) {
          const d = Math.sqrt(td2);
          const nx = tdx / d, ny = tdy / d;
          x += nx * (md - d); y += ny * (md - d);
          const vn = vx * nx + vy * ny;
          if (vn < 0) { vx -= (1 + c.eRest) * vn * nx; vy -= (1 + c.eRest) * vn * ny; }
        }
        if (y >= c.SLOT_TOP && Math.abs(x - dvx) < c.ballR + 2.5) {
          if (x < dvx) { x = dvx - (c.ballR + 2.5); if (vx > 0) vx = -vx * c.wRest; }
          else { x = dvx + (c.ballR + 2.5); if (vx < 0) vx = -vx * c.wRest; }
        }
      }
    }

    // пол
    if (y + c.ballR > c.FLOOR) {
      y = c.FLOOR - c.ballR;
      if (vy > 0) vy = -vy * 0.18;
      vx *= 0.7;
    }

    path.push([x, y]);

    if (y > c.SLOT_TOP + 6 && Math.abs(vx) < 5 && Math.abs(vy) < 8) {
      if (++settle > 40) break;
    } else settle = 0;
  }

  const d = board.dividers;
  let slot = c.N_SLOTS - 1;
  for (let i = 0; i < d.length - 1; i++) if (x >= d[i] && x < d[i + 1]) { slot = i; break; }
  if (x < d[0]) slot = 0;
  slot = Math.max(0, Math.min(c.N_SLOTS - 1, slot));
  return { path, slot };
}

/* ------------------------------- ТИПЫ ИГРЫ -------------------------------- */


type Phase = "waiting" | "countdown" | "angles" | "actions" | "reveal" | "result";
type ActionMode = "x2" | "half" | "wall" | null;
type WallKey = string;
type PlayerTone = "p0" | "p1";

type PlayerView = {
  id: number;
  name: string;
  nick: string;
  photoUrl: string;
  initials: string;
  color: string;
  soft: string;
};

const PLAYER_STYLE = [
  { color: "#5BB7FF", soft: "rgba(47,140,255,0.12)" },
  { color: "#FFB45C", soft: "rgba(255,143,45,0.12)" },
] as const;

const PLAYERS = [
  { color: PLAYER_STYLE[0].color, soft: PLAYER_STYLE[0].soft },
  { color: PLAYER_STYLE[1].color, soft: PLAYER_STYLE[1].soft },
] as const;

const toneOf = (idx: number): PlayerTone => (idx === 0 ? "p0" : "p1");


const PLINKO_UI_CSS = `
  .plinko-root {
    height: var(--tg-viewport-stable-height, var(--tg-viewport-height, 100svh));
    max-height: var(--tg-viewport-stable-height, var(--tg-viewport-height, 100svh));
    min-height: 0;
    font-family: "Supercell", "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    touch-action: none;
  }

  .plinko-hud-top {
    top: max(calc(env(safe-area-inset-top, 0px) - 25px), 0px);
  }

  .plinko-gain {
    top: calc(env(safe-area-inset-top, 0px) + 46px);
  }

  .plinko-gain-p0 { color: #5bb7ff; }
  .plinko-gain-p1 { color: #ffb45c; }

  .plinko-dock {
    bottom: max(env(safe-area-inset-bottom, 0px), 8px);
  }

  .plinko-tone-p0 { color: #5bb7ff; }
  .plinko-tone-p1 { color: #ffb45c; }

  .plinko-btn-ok-p0 { background: #5bb7ff; }
  .plinko-btn-ok-p1 { background: #ffb45c; }

  .plinko-slider-thumb {
    position: absolute;
    top: 50%;
    height: 24px;
    width: 24px;
    transform: translate(-50%, -50%);
    border-radius: 9999px;
    border: 1px solid rgba(0, 0, 0, 0.4);
  }

  .plinko-slider-thumb-p0 {
    background: #5bb7ff;
    box-shadow: 0 0 14px #5bb7ff55;
  }

  .plinko-slider-thumb-p1 {
    background: #ffb45c;
    box-shadow: 0 0 14px #ffb45c55;
  }

  .plinko-action-on-p0 {
    border-color: #5bb7ff90;
    background: #5bb7ff;
    color: #050507;
  }

  .plinko-action-on-p1 {
    border-color: #ffb45c90;
    background: #ffb45c;
    color: #050507;
  }

  .plinko-action-off {
    border-color: rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.72);
  }

  .plinko-handoff-badge-p0,
  .plinko-handoff-btn-p0 { background: #5bb7ff; }

  .plinko-handoff-badge-p1,
  .plinko-handoff-btn-p1 { background: #ffb45c; }

  .plinko-result-glow-left-p0 { background: #5bb7ff30; }
  .plinko-result-glow-left-p1 { background: #ffb45c30; }
  .plinko-result-glow-left-tie { background: #eaf4ff30; }

  .plinko-result-glow-right-p0 { background: #5bb7ff22; }
  .plinko-result-glow-right-p1 { background: #ffb45c22; }
  .plinko-result-glow-right-tie { background: rgba(91, 183, 255, 0.18); }

  .plinko-result-hero-p0 { color: #5bb7ff; }
  .plinko-result-hero-p1 { color: #ffb45c; }
  .plinko-result-hero-tie { color: #eaf4ff; }

  .plinko-result-icon-p0 {
    background: #5bb7ff;
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 0 34px #5bb7ff44, 0 18px 38px rgba(0, 0, 0, 0.34);
  }

  .plinko-result-icon-p1 {
    background: #ffb45c;
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 0 34px #ffb45c44, 0 18px 38px rgba(0, 0, 0, 0.34);
  }

  .plinko-result-icon-tie {
    background: #eaf4ff;
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 0 34px #eaf4ff44, 0 18px 38px rgba(0, 0, 0, 0.34);
  }

  .plinko-rpc-winner-p0 {
    border-color: #5bb7ffb8;
    background: linear-gradient(135deg, #5bb7ff34, rgba(255, 255, 255, 0.06));
    box-shadow: 0 0 30px #5bb7ff22, inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  .plinko-rpc-winner-p1 {
    border-color: #ffb45cb8;
    background: linear-gradient(135deg, #ffb45c34, rgba(255, 255, 255, 0.06));
    box-shadow: 0 0 30px #ffb45c22, inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  .plinko-rpc-tie {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.045);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055);
  }

  .plinko-rpc-idle {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.045);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055);
  }

  .plinko-rpc-badge-p0 { background: #5bb7ff; }
  .plinko-rpc-badge-p1 { background: #ffb45c; }

  .plinko-rpc-avatar-p0 {
    background: #5bb7ff;
    border-color: rgba(255, 255, 255, 0.24);
    box-shadow: 0 0 22px #5bb7ff38;
  }

  .plinko-rpc-avatar-p1 {
    background: #ffb45c;
    border-color: rgba(255, 255, 255, 0.24);
    box-shadow: 0 0 22px #ffb45c38;
  }

  .plinko-rpc-score-p0 { color: #5bb7ff; }
  .plinko-rpc-score-p1 { color: #ffb45c; }

  .plinko-score-active-p0 {
    border-color: #5bb7ff80;
    background: linear-gradient(135deg, #5bb7ff24, rgba(255, 255, 255, 0.045));
    box-shadow: 0 10px 28px #5bb7ff14, inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .plinko-score-active-p1 {
    border-color: #ffb45c80;
    background: linear-gradient(135deg, #ffb45c24, rgba(255, 255, 255, 0.045));
    box-shadow: 0 10px 28px #ffb45c14, inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .plinko-score-idle {
    border-color: rgba(255, 255, 255, 0.07);
    background: rgba(12, 13, 20, 0.72);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055);
  }

  .plinko-score-badge-p0 {
    background: #5bb7ff;
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 16px #5bb7ff33;
  }

  .plinko-score-badge-p1 {
    background: #ffb45c;
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 16px #ffb45c33;
  }

  .plinko-score-value-p0 {
    color: #5bb7ff;
    font-size: clamp(11px, 3.45vw, 14px);
    line-height: 1.35;
  }

  .plinko-score-value-p1 {
    color: #ffb45c;
    font-size: clamp(11px, 3.45vw, 14px);
    line-height: 1.35;
  }

  .plinko-ball-p0 {
    background: #5bb7ff;
    box-shadow: 0 0 10px #5bb7ff66;
  }

  .plinko-ball-p1 {
    background: #ffb45c;
    box-shadow: 0 0 10px #ffb45c66;
  }

  .plinko-timer-ring {
    position: relative;
    display: grid;
    height: 28px;
    width: 28px;
    place-items: center;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    color: #fff;
  }
`;

// цвет по «ценности» лунки
function tierColor(v: number): string {
  if (v >= 8) return "#FFB45C";
  if (v >= 5) return "#FF8F2D";
  if (v >= 3) return "#B48CFF";
  if (v >= 1.8) return "#5BB7FF";
  return "#EAF4FF";
}

const fmt = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
};

type Pop = {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  radius: number;
  width: number;
};


const PLINKO_SOCKET_CSS = `
  .plinko-root, .plinko-root * {
    font-family: "Supercell", "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .plinko-safe-text { line-height: 1.42; padding-top: .04em; padding-bottom: .08em; }
  .plinko-countdown-number {
    animation: plinkoCountPop .72s cubic-bezier(.2,.82,.2,1) both;
    line-height: 1.18; padding: .05em .04em .11em;
  }
  .plinko-ready-pulse { animation: plinkoReadyPulse 1.35s ease-in-out infinite; }
  .plinko-result-sheet { animation: plinkoResultIn .32s cubic-bezier(.18,.86,.28,1) both; }
  .plinko-result-title { line-height: 1.35; padding-top: .04em; padding-bottom: .09em; }
  .plinko-result-name { line-height: 1.4; padding-top: .03em; padding-bottom: .07em; }
  .plinko-result-score { line-height: 1.34; padding-top: .03em; padding-bottom: .08em; }
  .plinko-status-pill { line-height: 1.4; padding-top: .05em; padding-bottom: .08em; }
  .plinko-actions-dock {
    bottom: max(env(safe-area-inset-bottom, 0px), 4px);
  }
  .plinko-actions-panel {
    padding: 8px;
  }
  .plinko-actions-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .plinko-actions-help {
    min-height: 25px;
  }
  .plinko-result-backdrop {
    animation: plinkoResultFade .2s ease-out both;
  }
  @keyframes plinkoCountPop {
    0% { opacity:0; transform:scale(.72); }
    55% { opacity:1; transform:scale(1.06); }
    100% { opacity:1; transform:scale(1); }
  }
  @keyframes plinkoReadyPulse { 0%,100%{opacity:.5;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }
  @keyframes plinkoResultIn { from{opacity:0;transform:translateY(10px) scale(.975)} to{opacity:1;transform:none} }
  @keyframes plinkoResultFade { from{opacity:0} to{opacity:1} }
`;


const PLAYERS_STORAGE_KEY = "twingames_plinko_pvp_players_info";
const BET_STORAGE_KEY = "twingames_plinko_pvp_bet_coins";

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
  betCoins?: number;
};

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

type RevealVisual = {
  player: number;
  path: number[][];
  slot: number;
  value: number;
  stuck: boolean;
  scoreAfter: number;
};

const getInitials = (value: string) =>
  value
    .replace("@", "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TG";

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(PLAYERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LobbyPlayerInfo[]) : [];
  } catch {
    return [];
  }
};

const readStoredBet = () => {
  if (typeof window === "undefined") return 0;
  const value = Number(window.sessionStorage.getItem(BET_STORAGE_KEY) || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const readLobbyId = (locationState: LocationState, search: string) => {
  if (locationState.lobbyId) return locationState.lobbyId;
  const query = new URLSearchParams(search);
  return (
    query.get("lobby_id") ||
    query.get("lobbyId") ||
    window.sessionStorage.getItem("twingames_active_lobby_id") ||
    ""
  );
};

const roundMoney = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
const formatMoney = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

export default function PlinkoPvpGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const routeState = (location.state || {}) as LocationState;
  const lobbyId = readLobbyId(routeState, location.search);
  const myUserId = user?.id || 0;

  const board = useMemo(() => buildBoard(), []);
  const gapByKey = useMemo(() => {
    const map = new Map<string, Gap>();
    for (const g of board.gaps) map.set(`${g.row}:${g.idx}`, g);
    return map;
  }, [board.gaps]);

  const playersInfo = useMemo(
    () => (routeState.playersInfo?.length ? routeState.playersInfo : readStoredPlayersInfo()),
    [routeState.playersInfo],
  );
  const betCoins = useMemo(() => {
    const routeBet = Number(routeState.betCoins);
    return Number.isFinite(routeBet) && routeBet > 0 ? routeBet : readStoredBet();
  }, [routeState.betCoins]);

  const [serverState, setServerState] = useState<PlinkoStateMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [socketError, setSocketError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [countdown, setCountdown] = useState(CFG.ANGLE_SECONDS > 0 ? 3 : 3);
  const [timeLeft, setTimeLeft] = useState(CFG.ANGLE_SECONDS);

  const [matchValues, setMatchValues] = useState<number[]>(Array(CFG.N_SLOTS).fill(1));
  const [combinedValues, setCombinedValues] = useState<number[]>(Array(CFG.N_SLOTS).fill(1));
  const [factors, setFactors] = useState<number[][]>([Array(CFG.N_SLOTS).fill(1), Array(CFG.N_SLOTS).fill(1)]);
  const [walls, setWalls] = useState<WallKey[][]>([[], []]);
  const [anglesCount, setAnglesCount] = useState<[number, number]>([0, 0]);
  const [anglesSubmitted, setAnglesSubmitted] = useState(false);
  const [actionsUsed, setActionsUsed] = useState(0);
  const [actionsSubmitted, setActionsSubmitted] = useState(false);
  const [curBall, setCurBall] = useState(0);
  const [liveAngle, setLiveAngle] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [scores, setScores] = useState<[number, number]>([1, 1]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [lastGain, setLastGain] = useState<{ p: number; v: number; score: number; stuck: boolean } | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [awaitingResult, setAwaitingResult] = useState(false);

  const socketRef = useRef<PlinkoSocketClient | null>(null);
  const autoReadySentRef = useRef(false);
  const serverOffsetRef = useRef(0);
  const latestStateRef = useRef<PlinkoStateMessage | null>(null);
  const lastStateRevisionRef = useRef(-1);
  const resultHandledRef = useRef(false);
  const revealStartedRef = useRef(false);
  const revealDoneSentRef = useRef(false);
  const previousServerPhaseRef = useRef<PlinkoStateMessage["phase"] | null>(null);

  const opponentUserId =
    serverState?.player_order.find((id) => id !== myUserId) ||
    playersInfo.find((player) => player.id !== myUserId)?.id ||
    0;

  const profiles = useMemo<[PlayerView, PlayerView]>(() => {
    const byId = new Map<number, LobbyPlayerInfo>();
    for (const info of playersInfo) byId.set(Number(info.id), info);

    const ownInfo = byId.get(myUserId);
    const rivalInfo = byId.get(opponentUserId);
    const ownName = user?.tg_user || ownInfo?.tg_user || "Ты";
    const rivalName = rivalInfo?.tg_user || (opponentUserId ? `Player ${opponentUserId}` : "Соперник");

    return [
      {
        id: myUserId,
        name: ownName.replace(/^@/, ""),
        nick: ownName.startsWith("@") ? ownName : `@${ownName.replace(/^@/, "")}`,
        photoUrl: user?.photo_url || ownInfo?.photo_url || "",
        initials: getInitials(ownName),
        color: PLAYER_STYLE[0].color,
        soft: PLAYER_STYLE[0].soft,
      },
      {
        id: opponentUserId,
        name: rivalName.replace(/^@/, ""),
        nick: rivalName.startsWith("@") ? rivalName : `@${rivalName.replace(/^@/, "")}`,
        photoUrl: rivalInfo?.photo_url || "",
        initials: getInitials(rivalName),
        color: PLAYER_STYLE[1].color,
        soft: PLAYER_STYLE[1].soft,
      },
    ];
  }, [myUserId, opponentUserId, playersInfo, user?.photo_url, user?.tg_user]);

  const visualIndexForUser = useCallback((userID: number) => (userID === myUserId ? 0 : 1), [myUserId]);
  const turn = 0;
  const actionsLeft = Math.max(0, CFG.ACTIONS_PER_TURN - actionsUsed);
  const activeTone = toneOf(0);

  const revealData = useRef<RevealVisual[]>([]);
  const processedLandings = useRef<Set<number>>(new Set());

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";

    const preventMove = (event: TouchEvent) => {
      if (event.touches.length === 1) event.preventDefault();
    };
    document.addEventListener("touchmove", preventMove, { passive: false });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
      document.removeEventListener("touchmove", preventMove);
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tf = useRef({ scale: 1, offX: 0, offY: 0, dpr: 1 });
  const raf = useRef(0);
  const lastFrameTs = useRef(0);
  const particles = useRef<Particle[]>([]);
  const pops = useRef<Pop[]>([]);
  const screenShake = useRef(0);

  const playback = useRef<{
    path: number[][];
    i: number;
    color: string;
    player: number;
    ballIdx: number;
    landed: { x: number; y: number; color: string }[];
    pausing: number;
    done: boolean;
  }>({ path: [], i: 0, color: "#fff", player: 0, ballIdx: -1, landed: [], pausing: 0, done: false });

  const view = useRef({ phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues });
  useEffect(() => {
    view.current = { phase, turn, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues };
  }, [phase, liveAngle, factors, walls, actionMode, combinedValues, revealIdx, matchValues]);

  const resize = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    const viewportH = window.visualViewport?.height ?? window.innerHeight ?? wrap.clientHeight;
    const w = wrap.clientWidth;
    const h = Math.max(320, Math.min(wrap.clientHeight || viewportH, viewportH));
    const nextW = Math.round(w * dpr);
    const nextH = Math.round(h * dpr);

    if (cv.width !== nextW) cv.width = nextW;
    if (cv.height !== nextH) cv.height = nextH;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    // На фазе действий стаканы должны полностью оставаться выше нижней панели.
    // В остальных фазах сохраняем прежний размер поля и ту же геометрию,
    // которая была в приятной локальной версии игры.
    const reservedTop = 74 * dpr;
    const reservedBottomCss = phase === "actions" ? 252 : 156;
    const reservedBottom = reservedBottomCss * dpr;
    const rawUsableH = cv.height - reservedTop - reservedBottom;
    const minBoardHeight = phase === "actions" ? 165 * dpr : 220 * dpr;
    const usableH = Math.max(minBoardHeight, rawUsableH);
    const phaseScale = phase === "actions" ? 0.88 : 0.93;
    const scale = Math.min(cv.width / CFG.VW, usableH / CFG.VH) * phaseScale;
    const boardW = CFG.VW * scale;
    const boardH = CFG.VH * scale;
    const freeY = cv.height - reservedTop - reservedBottom - boardH;

    tf.current = {
      scale,
      offX: (cv.width - boardW) / 2,
      offY: reservedTop + Math.max(0, freeY * 0.08),
      dpr,
    };
  }, [phase]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    const id = window.setTimeout(resize, 60);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      window.clearTimeout(id);
    };
  }, [resize]);

  /* ------------------------------ ЦИКЛ ОТРИСОВКИ -------------------------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = (v: number) => v * tf.current.scale;
    const X = (v: number) => tf.current.offX + v * tf.current.scale;
    const Y = (v: number) => tf.current.offY + v * tf.current.scale;

    const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
    };

    const factorOf = (viewer: number, i: number) => view.current.factors[viewer][i];

    const drawCup = (i: number, val: number, viewer: number, isReveal: boolean, showValues: boolean) => {
      const d = board.dividers;
      const x0 = d[i], x1 = d[i + 1];
      const cx = (x0 + x1) / 2;
      const col = showValues ? tierColor(val) : "rgba(255,255,255,0.34)";
      const r = S(9);
      const top = Y(CFG.SLOT_TOP), bot = Y(CFG.FLOOR);
      const lx = X(x0) + S(2.4), rx = X(x1) - S(2.4);
      const width = rx - lx;
      const hot = showValues && val >= 5;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx, top + S(2));
      ctx.lineTo(lx + S(1.8), bot - r);
      ctx.quadraticCurveTo(lx + S(1.8), bot, lx + r, bot);
      ctx.lineTo(rx - r, bot);
      ctx.quadraticCurveTo(rx - S(1.8), bot, rx - S(1.8), bot - r);
      ctx.lineTo(rx, top + S(2));
      ctx.quadraticCurveTo(rx, top, rx - S(4), top);
      ctx.lineTo(lx + S(4), top);
      ctx.quadraticCurveTo(lx, top, lx, top + S(2));

      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, showValues ? col + "42" : "rgba(255,255,255,0.05)");
      grad.addColorStop(0.42, "rgba(255,255,255,0.035)");
      grad.addColorStop(1, showValues ? col + "1c" : "rgba(255,255,255,0.025)");
      ctx.fillStyle = grad;
      ctx.shadowColor = hot ? col : "rgba(0,0,0,0)";
      ctx.shadowBlur = hot ? S(11) : 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.lineWidth = S(hot ? 1.9 : 1.15);
      ctx.strokeStyle = showValues ? col + (hot ? "ee" : "bb") : "rgba(255,255,255,0.14)";
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lx + S(5), top + S(4));
      ctx.lineTo(rx - S(5), top + S(4));
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = S(0.8);
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(lx + width * 0.16, bot - S(3), width * 0.68, S(1.3));

      const cupLabel = showValues ? `x${fmt(val)}` : "?";
      const cupFontSize = showValues
        ? cupLabel.length >= 5
          ? 7.2
          : cupLabel.length >= 4
            ? 8.2
            : 9.2
        : 10;

      ctx.shadowColor = showValues ? col : "rgba(255,255,255,0.3)";
      ctx.shadowBlur = showValues ? S(5) : S(2);
      ctx.fillStyle = showValues ? "#fff" : "rgba(255,255,255,0.5)";
      ctx.font = `900 ${S(cupFontSize)}px "Supercell", "Inter", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cupLabel, X(cx), (top + bot) / 2 + S(1));
      ctx.shadowBlur = 0;

      if (showValues && !isReveal && factorOf(viewer, i) !== 1) {
        const label = factorOf(viewer, i) > 1 ? "BOOST" : "CUT";
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.shadowColor = PLAYERS[viewer].color;
        ctx.shadowBlur = S(6);
        ctx.font = `900 ${S(5.4)}px "Supercell", "Inter", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, X(cx), top - S(6));
      }
      ctx.restore();
    };

    const loop = (ts: number) => {
      const deltaMs = lastFrameTs.current ? Math.min(50, ts - lastFrameTs.current) : 16.67;
      lastFrameTs.current = ts;
      const frameScale = deltaMs / 16.67;

      const v = view.current;
      const isReveal = v.phase === "reveal" || v.phase === "result";
      const viewer = v.turn;
      const showValues =
        v.phase === "actions" ||
        v.phase === "reveal" ||
        v.phase === "result";
      const display = isReveal
        ? v.combinedValues
        : v.matchValues.map((val, i) => Math.round(val * v.factors[viewer][i] * 100) / 100);

      ctx.clearRect(0, 0, cv.width, cv.height);

      ctx.save();

      if (screenShake.current > 0) {
        const sh = S(screenShake.current);
        ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        screenShake.current = Math.max(0, screenShake.current * Math.pow(0.86, frameScale) - 0.05 * frameScale);
      }

      // Декоративная подложка только у игрового поля, общего фона больше нет.
      const bx = X(CFG.WALL_L - 15);
      const by = Y(0);
      const bw = S(CFG.WALL_R - CFG.WALL_L + 30);
      const bh = S(CFG.FLOOR + 12);
      ctx.save();
      const bodyGrad = ctx.createLinearGradient(0, by, 0, by + bh);
      bodyGrad.addColorStop(0, "rgba(255,255,255,0.055)");
      bodyGrad.addColorStop(0.42, "rgba(12,14,22,0.78)");
      bodyGrad.addColorStop(1, "rgba(0,0,0,0.34)");
      ctx.beginPath();
      roundedRect(bx, by, bw, bh, S(24));
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = "rgba(0,0,0,0.42)";
      ctx.shadowBlur = S(20);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = S(1.25);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.stroke();

      ctx.beginPath();
      roundedRect(X(CFG.WALL_L - 7), Y(10), S(CFG.WALL_R - CFG.WALL_L + 14), S(CFG.FLOOR - 4), S(17));
      ctx.strokeStyle = "rgba(47,140,255,0.12)";
      ctx.lineWidth = S(1.2);
      ctx.stroke();
      ctx.restore();

      // боковые направляющие
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.shadowColor = "rgba(47,140,255,0.16)";
      ctx.shadowBlur = S(8);
      ctx.fillRect(X(CFG.WALL_L) - S(4), Y(10), S(4), S(CFG.FLOOR - 10));
      ctx.shadowColor = "rgba(255,143,45,0.14)";
      ctx.fillRect(X(CFG.WALL_R), Y(10), S(4), S(CFG.FLOOR - 10));
      ctx.restore();

      // стаканы
      for (let i = 0; i < CFG.N_SLOTS; i++) drawCup(i, display[i], viewer, isReveal, showValues);

      // пеги
      for (const p of board.pegs) {
        const pegCol = p.row % 2 === 0 ? "#5BB7FF" : "#FFB45C";
        ctx.save();
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR + 1.45), 0, Math.PI * 2);
        ctx.fillStyle = pegCol + "22";
        ctx.shadowColor = pegCol;
        ctx.shadowBlur = S(8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(CFG.pegR), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(X(p.x - 1.3), Y(p.y - 1.45), S(1.45), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        ctx.lineWidth = S(1.15);
        ctx.strokeStyle = pegCol + "88";
        ctx.stroke();
        ctx.restore();
      }

      // стенки: свои во время хода, все при вскрытии
      const wallKeys = isReveal
        ? new Set<string>([...v.walls[0], ...v.walls[1]])
        : new Set<string>(v.walls[viewer]);
      wallKeys.forEach((k) => {
        const g = gapByKey.get(k);
        if (!g) return;
        ctx.beginPath();
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
        ctx.lineCap = "round";
        ctx.lineWidth = S(8);
        ctx.strokeStyle = isReveal ? "#FFB45C" : PLAYERS[viewer].color;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.shadowBlur = S(13);
        ctx.stroke();
        ctx.lineWidth = S(3.2);
        ctx.strokeStyle = "rgba(255,255,255,0.62)";
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // подсказки кликабельных целей во время действий
      if (v.phase === "actions") {
        const t = (Date.now() % 1000) / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        if (v.actionMode === "x2" || v.actionMode === "half") {
          for (let i = 0; i < CFG.N_SLOTS; i++) {
            const d = board.dividers;
            ctx.beginPath();
            ctx.rect(X(d[i]) + S(2), Y(CFG.SLOT_TOP), S(d[i + 1] - d[i]) - S(4), S(CFG.FLOOR - CFG.SLOT_TOP));
            ctx.strokeStyle = PLAYERS[viewer].color + (pulse > 0.5 ? "ff" : "70");
            ctx.lineWidth = S(2);
            ctx.stroke();
          }
        } else if (v.actionMode === "wall") {
          for (const g of board.gaps) {
            ctx.beginPath();
            ctx.arc(X(g.mx), Y(g.my), S(4 + pulse * 2), 0, Math.PI * 2);
            ctx.fillStyle = PLAYERS[viewer].color + "cc";
            ctx.fill();
          }
        }
      }

      // фаза углов: точка сброса + стрелка прицела
      if (v.phase === "angles") {
        const dropX = CFG.VW / 2, dropY = CFG.DROP_Y;
        const a = v.liveAngle;
        const len = 46;
        const dirx = a, diry = 1;
        const nlen = Math.hypot(dirx, diry) || 1;
        const ex = dropX + (dirx / nlen) * len;
        const ey = dropY + (diry / nlen) * len;
        ctx.beginPath();
        ctx.moveTo(X(dropX), Y(dropY));
        ctx.lineTo(X(ex), Y(ey));
        ctx.strokeStyle = PLAYERS[viewer].color;
        ctx.lineWidth = S(3);
        ctx.setLineDash([S(5), S(4)]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(X(ex), Y(ey), S(4), 0, Math.PI * 2);
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(X(dropX), Y(dropY), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = PLAYERS[viewer].color;
        ctx.shadowColor = PLAYERS[viewer].color;
        ctx.shadowBlur = S(10);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // вскрытие: проигрывание
      const pb = playback.current;
      if (v.phase === "reveal") {
        if (pb.pausing > 0) {
          pb.pausing = Math.max(0, pb.pausing - frameScale);
        } else if (!pb.done && pb.path.length) {
          const activeData = revealData.current[pb.ballIdx];
          const advance = Math.max(
            1,
            Math.round(CFG.SUBSTEPS_PER_FRAME * frameScale * CFG.REVEAL_SPEED)
          );
          pb.i = Math.min(pb.i + advance, pb.path.length - 1);

          const stuckRested = Boolean(activeData?.stuck && isStuckPathResting(pb.path, pb.i));
          const reachedEnd = pb.i >= pb.path.length - 1;

          if (stuckRested || reachedEnd) {
            const finishIdx = stuckRested ? pb.i : pb.path.length - 1;
            const [lx, ly] = pb.path[finishIdx];
            const value = activeData?.value ?? 0;
            const stuck = activeData?.stuck ?? false;
            pb.landed.push({ x: lx, y: ly, color: pb.color });
            spawnLanding(lx, ly, pb.color, value, stuck);
            pb.done = true;
            onBallLanded();
          }
        }
      }

      // уже упавшие шарики
      for (const b of pb.landed) {
        ctx.beginPath();
        ctx.arc(X(b.x), Y(b.y), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // активный шарик без следа — меньше отрисовки и максимально плавное движение
      if (v.phase === "reveal" && !pb.done && pb.path.length && pb.pausing <= 0) {
        const [bx, by] = pb.path[pb.i];
        ctx.beginPath();
        ctx.arc(X(bx), Y(by), S(CFG.ballR), 0, Math.PI * 2);
        ctx.fillStyle = pb.color;
        ctx.shadowColor = pb.color;
        ctx.shadowBlur = S(7);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // частицы
      const ps = particles.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= frameScale;
        p.vy += 0.25 * frameScale;
        p.x += p.vx * frameScale;
        p.y += p.vy * frameScale;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), S(p.r), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // кольца-вспышки
      const pp = pops.current;
      for (let i = pp.length - 1; i >= 0; i--) {
        const o = pp[i];
        o.life -= frameScale;
        if (o.life <= 0) { pp.splice(i, 1); continue; }
        const k = 1 - o.life / o.max;
        ctx.beginPath();
        ctx.arc(X(o.x), Y(o.y), S(6 + k * o.radius), 0, Math.PI * 2);
        ctx.strokeStyle = o.color;
        ctx.globalAlpha = Math.max(0, o.life / o.max);
        ctx.lineWidth = S(o.width * (1 - k) + 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      raf.current = requestAnimationFrame(loop);
    };

    lastFrameTs.current = 0;
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, gapByKey]);

  const trimFx = () => {
    if (particles.current.length > CFG.MAX_PARTICLES) {
      particles.current.splice(0, particles.current.length - CFG.MAX_PARTICLES);
    }

    if (pops.current.length > CFG.MAX_POPS) {
      pops.current.splice(0, pops.current.length - CFG.MAX_POPS);
    }
  };

  const spawnLanding = (x: number, y: number, color: string, value: number, stuck: boolean) => {
    if (stuck) {
      hapticImpact("light");

      particles.current.push({
        x,
        y,
        vx: 0,
        vy: -1.5,
        life: 22,
        max: 22,
        color: "rgba(255,255,255,0.65)",
        r: 2,
      });

      pops.current.push({
        x,
        y,
        life: 18,
        max: 18,
        color: "rgba(255,255,255,0.45)",
        radius: 18,
        width: 2,
      });

      trimFx();
      return;
    }

    const slot = (() => {
      const d = board.dividers;
      for (let i = 0; i < d.length - 1; i++) if (x >= d[i] && x < d[i + 1]) return i;
      return x < d[0] ? 0 : CFG.N_SLOTS - 1;
    })();

    const tcol = tierColor(value);
    const power = Math.max(1, Math.min(10, value));
    const n = Math.round(8 + power * 4);

    if (value >= 5) hapticImpact("heavy");
    else if (value >= 2) hapticImpact("medium");
    else hapticImpact("light");

    screenShake.current = Math.max(screenShake.current, Math.min(7, 1 + power * 0.65));

    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 1.2 + Math.random() * (1.2 + power * 0.45);
      particles.current.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.4 - power * 0.05,
        life: 22 + Math.round(Math.random() * 14 + power * 2.5),
        max: 42 + power * 3,
        color: Math.random() < 0.55 ? tcol : color,
        r: 1.2 + Math.random() * (1.4 + power * 0.12),
      });
    }

    const rings = value >= 5 ? 3 : value >= 2 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      pops.current.push({
        x,
        y,
        life: 18 + i * 6 + Math.round(power),
        max: 18 + i * 6 + Math.round(power),
        color: i % 2 === 0 ? tcol : color,
        radius: 22 + power * 4 + i * 16,
        width: 2.5 + power * 0.22,
      });
    }

    if (value >= 5) {
      const d = board.dividers;
      const cx = (d[slot] + d[slot + 1]) / 2;
      for (let i = 0; i < 10; i++) {
        particles.current.push({
          x: cx + (Math.random() - 0.5) * 24,
          y: CFG.SLOT_TOP + 6,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -2.5 - Math.random() * 2.5,
          life: 28 + Math.round(Math.random() * 18),
          max: 46,
          color: tcol,
          r: 1.8 + Math.random() * 1.8,
        });
      }
    }

    trimFx();
  };

  useEffect(() => {
    if (!lobbyId || !token || !myUserId) return;

    setConnectionStatus("connecting");
    setSocketError(null);

    const client = plinkoWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          autoReadySentRef.current = false;
          setConnectionStatus("open");
          client.requestState();
        },
        onClose: () => {
          autoReadySentRef.current = false;
          setConnectionStatus("closed");
        },
        onSocketError: () => {
          setConnectionStatus("error");
          setSocketError("Ошибка подключения к матчу");
        },
        onServerError: (error) => {
          setSocketError(error.details || error.error);
          client.requestState();
        },
        onState: (state) => {
          if (state.revision < lastStateRevisionRef.current) return;
          lastStateRevisionRef.current = Math.max(lastStateRevisionRef.current, state.revision);
          latestStateRef.current = state;
          setServerState(state);
          setSocketError(null);
          if (state.server_ms > 0) {
            const sample = Date.now() - state.server_ms;
            serverOffsetRef.current = serverOffsetRef.current === 0
              ? sample
              : serverOffsetRef.current * 0.72 + sample * 0.28;
          }
        },
      },
    });

    socketRef.current = client;
    return () => {
      socketRef.current = null;
      client.close();
    };
  }, [lobbyId, myUserId, token]);

  useEffect(() => {
    if (connectionStatus !== "open" || serverState?.phase !== "waiting") return;
    if (autoReadySentRef.current) return;
    if (!socketRef.current?.ready()) return;
    autoReadySentRef.current = true;
  }, [connectionStatus, serverState?.phase]);

  useEffect(() => {
    const state = serverState;
    if (!state) return;

    const enteringActions = previousServerPhaseRef.current !== "actions" && state.phase === "actions";
    previousServerPhaseRef.current = state.phase;

    const mine = state.players[String(myUserId)];
    const rivalID = state.player_order.find((id) => id !== myUserId) || 0;
    const rival = rivalID ? state.players[String(rivalID)] : undefined;

    if (mine) {
      setAnglesCount([mine.angles_count || 0, rival?.angles_count || 0]);
      setAnglesSubmitted(Boolean(mine.angles_submitted));
      if (state.phase === "angles") {
        setCurBall(Math.min(CFG.BALLS_PER_PLAYER, mine.angles_count || 0));
      }
      setActionsUsed(mine.actions_used || 0);
      setActionsSubmitted(Boolean(mine.actions_submitted));

      if (state.phase === "actions") {
        const mineFactors = mine.factors?.length === CFG.N_SLOTS
          ? [...mine.factors]
          : Array(CFG.N_SLOTS).fill(1);
        setFactors([mineFactors, Array(CFG.N_SLOTS).fill(1)]);
        setWalls([mine.walls ? [...mine.walls] : [], []]);
      }
    }

    if (state.values.length === CFG.N_SLOTS) setMatchValues([...state.values]);
    if (state.combined_values.length === CFG.N_SLOTS) setCombinedValues([...state.combined_values]);

    if (state.phase === "countdown") {
      setPhase("countdown");
      setResultReady(false);
      setAwaitingResult(false);
      revealStartedRef.current = false;
      revealDoneSentRef.current = false;
      setScores([1, 1]);
      setRevealIdx(0);
    } else if (state.phase === "angles") {
      setPhase("angles");
    } else if (state.phase === "actions") {
      setPhase("actions");
      if (enteringActions) setActionMode(null);
    } else if (state.phase === "reveal") {
      const mineWalls = state.players[String(myUserId)]?.walls || [];
      const rivalState = rivalID ? state.players[String(rivalID)] : undefined;
      const rivalWalls = rivalState?.walls || [];
      setWalls([state.all_walls.length ? [...state.all_walls] : [...mineWalls], state.all_walls.length ? [] : [...rivalWalls]]);
      setFactors([
        state.players[String(myUserId)]?.factors?.length === CFG.N_SLOTS
          ? [...(state.players[String(myUserId)]?.factors || [])]
          : Array(CFG.N_SLOTS).fill(1),
        rivalState?.factors?.length === CFG.N_SLOTS
          ? [...(rivalState?.factors || [])]
          : Array(CFG.N_SLOTS).fill(1),
      ]);
      setPhase("reveal");
    } else if (state.phase === "match_over") {
      const ownFinalScore = state.players[String(myUserId)]?.score ?? 1;
      const rivalFinalScore = rivalID ? (state.players[String(rivalID)]?.score ?? 1) : 1;
      setScores([ownFinalScore, rivalFinalScore]);
      setAwaitingResult(false);
      setResultReady(true);
      setPhase("result");
    } else {
      setPhase("waiting");
    }
  }, [myUserId, serverState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = latestStateRef.current;
      if (!state) return;
      const serverNow = Date.now() - serverOffsetRef.current;

      if (state.phase === "countdown") {
        setCountdown(Math.max(1, Math.ceil((state.start_at_ms - serverNow) / 1000)));
      } else if (state.phase === "angles" || state.phase === "actions") {
        setTimeLeft(Math.max(0, Math.ceil((state.deadline_ms - serverNow) / 1000)));
      }
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const buildRevealVisuals = useCallback((items: PlinkoRevealBall[], state: PlinkoStateMessage) => {
    const segs: Seg[] = [];
    for (const key of state.all_walls) {
      const gap = gapByKey.get(key);
      if (gap) segs.push({ ax: gap.ax, ay: gap.ay, bx: gap.bx, by: gap.by });
    }
    const wind = state.wind || 0;

    return items.map<RevealVisual>((item) => {
      const sim = simulate(clamp(item.angle + wind, -1, 1), board, segs);
      return {
        player: visualIndexForUser(item.user_id),
        path: sim.path,
        slot: item.slot,
        value: item.value,
        stuck: item.stuck,
        scoreAfter: item.score_after,
      };
    });
  }, [board, gapByKey, visualIndexForUser]);

  useEffect(() => {
    const state = serverState;
    if (!state || state.phase !== "reveal" || !state.reveal.length || revealStartedRef.current) return;

    revealStartedRef.current = true;
    revealDoneSentRef.current = false;
    setAwaitingResult(false);
    revealData.current = buildRevealVisuals(state.reveal, state);
    processedLandings.current.clear();
    particles.current = [];
    pops.current = [];
    screenShake.current = 0;
    playback.current = { path: [], i: 0, color: "#fff", player: 0, ballIdx: -1, landed: [], pausing: 0, done: false };
    setScores([1, 1]);
    setRevealIdx(0);
    setLastGain(null);
    window.setTimeout(() => loadBall(0), 120);
  }, [buildRevealVisuals, serverState]);

  const worldFromEvent = (event: { clientX: number; clientY: number }) => {
    const cv = canvasRef.current;
    if (!cv) return { wx: 0, wy: 0 };
    const rect = cv.getBoundingClientRect();
    const px = (event.clientX - rect.left) * tf.current.dpr;
    const py = (event.clientY - rect.top) * tf.current.dpr;
    return {
      wx: (px - tf.current.offX) / tf.current.scale,
      wy: (py - tf.current.offY) / tf.current.scale,
    };
  };

  const onCanvasPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { wx, wy } = worldFromEvent(event);

    if (phase === "angles" && !anglesSubmitted) {
      const next = (wx - CFG.VW / 2) / ((CFG.WALL_R - CFG.WALL_L) / 2);
      setLiveAngle(clamp(next, -1, 1));
      return;
    }

    if (phase !== "actions" || actionsSubmitted || actionsLeft <= 0 || !actionMode) return;

    if (actionMode === "wall") {
      let best: Gap | null = null;
      let bestDistance = 22;
      for (const gap of board.gaps) {
        const distance = Math.hypot(wx - gap.mx, wy - gap.my);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = gap;
        }
      }
      if (!best) return;
      const key = `${best.row}:${best.idx}`;
      if (walls[0].includes(key)) return;
      if (!socketRef.current?.action({ mode: "wall", wallKey: key })) return;

      hapticImpact("medium");
      setWalls((prev) => [[...prev[0], key], prev[1]]);
      setActionsUsed((value) => Math.min(CFG.ACTIONS_PER_TURN, value + 1));
      setActionMode(null);
      return;
    }

    const dividers = board.dividers;
    let slot = -1;
    for (let i = 0; i < dividers.length - 1; i++) {
      if (wx >= dividers[i] && wx < dividers[i + 1]) {
        slot = i;
        break;
      }
    }
    if (slot < 0 || wy <= CFG.SLOT_TOP - 40) return;

    const mode = actionMode;
    if (!socketRef.current?.action({ mode, slotIndex: slot })) return;
    hapticImpact("medium");
    setFactors((prev) => {
      const next = prev.map((row) => [...row]);
      next[0][slot] = Math.round(next[0][slot] * (mode === "x2" ? 2 : 0.5) * 100) / 100;
      return next;
    });
    setActionsUsed((value) => Math.min(CFG.ACTIONS_PER_TURN, value + 1));
    setActionMode(null);
  };

  const confirmAngle = () => {
    if (phase !== "angles" || anglesSubmitted || curBall >= CFG.BALLS_PER_PLAYER) return;
    if (!socketRef.current?.setAngle(curBall, liveAngle)) return;
    hapticSelection();
    const nextBall = curBall + 1;
    setAnglesCount((current) => [Math.max(current[0], nextBall), current[1]]);
    setCurBall(nextBall);
    setLiveAngle(0);
    if (nextBall >= CFG.BALLS_PER_PLAYER) {
      setAnglesSubmitted(true);
      socketRef.current?.submitAngles();
    }
  };

  const submitActions = () => {
    if (phase !== "actions" || actionsSubmitted) return;
    if (!socketRef.current?.submitActions()) return;
    hapticSelection();
    setActionsSubmitted(true);
    setActionMode(null);
  };

  const loadBall = (idx: number) => {
    const data = revealData.current[idx];
    if (!data) return;
    playback.current = {
      path: data.path,
      i: 0,
      color: PLAYER_STYLE[data.player].color,
      player: data.player,
      ballIdx: idx,
      landed: playback.current.landed,
      pausing: 12,
      done: false,
    };
  };

  const onBallLanded = () => {
    const idx = playback.current.ballIdx;
    if (idx < 0 || processedLandings.current.has(idx)) return;
    processedLandings.current.add(idx);

    const data = revealData.current[idx];
    if (data) {
      setScores((current) => {
        const next: [number, number] = [current[0], current[1]];
        next[data.player] = data.scoreAfter;
        return next;
      });
      setLastGain({ p: data.player, v: data.value, score: data.scoreAfter, stuck: data.stuck });
    }

    const nextIdx = idx + 1;
    setRevealIdx(nextIdx);
    if (nextIdx >= revealData.current.length) {
      window.setTimeout(() => {
        setLastGain(null);
        if (!revealDoneSentRef.current) {
          revealDoneSentRef.current = true;
          setAwaitingResult(true);
          socketRef.current?.revealDone();
          socketRef.current?.requestState();
        }
      }, 1100);
      return;
    }

    window.setTimeout(() => {
      setLastGain(null);
      loadBall(nextIdx);
    }, 850);
  };

  useEffect(() => {
    if (!awaitingResult || phase !== "reveal") return;

    const requestLatestState = () => {
      socketRef.current?.requestState();
    };

    requestLatestState();
    const id = window.setInterval(requestLatestState, 650);
    return () => window.clearInterval(id);
  }, [awaitingResult, phase]);

  useEffect(() => {
    if (serverState?.phase !== "match_over" || resultHandledRef.current) return;
    resultHandledRef.current = true;
    const winner = serverState.winner_user_id;
    hapticNotify(winner === undefined ? "warning" : winner === myUserId ? "success" : "error");
    const refreshTimer = window.setTimeout(() => {
      void refreshBalance();
      void refreshProfile();
    }, 500);

    return () => window.clearTimeout(refreshTimer);
  }, [myUserId, refreshBalance, refreshProfile, serverState]);

  const sliderRef = useRef<HTMLDivElement | null>(null);
  const setAngleFromClientX = (clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setLiveAngle(clamp(ratio * 2 - 1, -1, 1));
  };
  const sliderDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    hapticSelection();
    setAngleFromClientX(event.clientX);
  };
  const sliderMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0 && event.pressure === 0) return;
    setAngleFromClientX(event.clientX);
  };

  const angleDeg = Math.round(liveAngle * CFG.ANGLE_MAX_DEG);
  const ballCounters = useMemo<[number, number]>(() => {
    if (phase === "reveal" || phase === "result") {
      const counts: [number, number] = [0, 0];
      const done = clamp(revealIdx, 0, revealData.current.length);
      for (let i = 0; i < done; i++) {
        const item = revealData.current[i];
        if (item) counts[item.player] += 1;
      }
      if (phase === "result") return [CFG.BALLS_PER_PLAYER, CFG.BALLS_PER_PLAYER];
      return counts;
    }
    if (phase === "actions") return [CFG.BALLS_PER_PLAYER, CFG.BALLS_PER_PLAYER];
    return anglesCount;
  }, [anglesCount, phase, revealIdx]);

  const winnerVisual = serverState?.winner_user_id === undefined
    ? -1
    : visualIndexForUser(serverState.winner_user_id);
  const didWin = serverState?.winner_user_id === myUserId;
  const netReward = didWin ? roundMoney(betCoins * 0.9) : 0;

  return (
    <div className="plinko-root relative z-0 flex w-full flex-col overflow-hidden overscroll-none select-none bg-transparent text-white">
      <style>{PLINKO_UI_CSS}</style>
      <style>{PLINKO_SOCKET_CSS}</style>

      <div ref={wrapRef} className="absolute inset-0 z-10">
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          onPointerMove={(event) => {
            if (phase === "angles" && !anglesSubmitted && event.buttons === 1) onCanvasPointer(event);
          }}
          className="absolute inset-0 h-full w-full touch-none translate-z-0"
        />
      </div>

      <div className="plinko-hud-top pointer-events-none absolute left-2 right-2 z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
        <div className="flex min-w-0 justify-start">
          <PlayerScoreCard playerIdx={0} player={profiles[0]} score={scores[0]} active={phase === "angles" || phase === "actions"} />
        </div>

        <div className="flex h-11 items-center gap-1.5 rounded-[16px] border border-white/[0.08] bg-[#09090d]/82 px-2 shadow-[0_10px_24px_rgba(0,0,0,.26)] backdrop-blur-xl">
          <BallCounter playerIdx={0} value={ballCounters[0]} />
          {phase === "angles" || phase === "actions" ? (
            <TurnTimer
              total={phase === "angles" ? CFG.ANGLE_SECONDS : CFG.ACTION_SECONDS}
              left={timeLeft}
              playerIdx={0}
              label={phase === "angles" ? "углы" : "действия"}
              meta={phase === "actions" ? `${actionsLeft}/${CFG.ACTIONS_PER_TURN}` : `${Math.min(curBall + 1, CFG.BALLS_PER_PLAYER)}/${CFG.BALLS_PER_PLAYER}`}
            />
          ) : (
            <div className="h-5 w-px bg-white/12" />
          )}
          <BallCounter playerIdx={1} value={ballCounters[1]} reverse />
        </div>

        <div className="flex min-w-0 justify-end">
          <PlayerScoreCard playerIdx={1} player={profiles[1]} score={scores[1]} active={phase === "angles" || phase === "actions"} reverse />
        </div>
      </div>

      {lastGain && (
        <div className={`plinko-gain plinko-safe-text pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/[0.10] bg-[#09090d]/90 px-4 py-2 text-[12px] font-black tracking-[-0.02em] shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl plinko-gain-${toneOf(lastGain.p)}`}>
          {lastGain.stuck ? "x1" : `x${fmt(lastGain.v)} → ${fmt(lastGain.score)}`}
        </div>
      )}

      {phase === "angles" && (
        <div className="plinko-dock fixed inset-x-0 z-30 px-3">
          <div className="mx-auto max-w-[460px] rounded-[22px] border border-white/[0.09] bg-[#09090d]/90 p-2.5 shadow-[0_22px_52px_rgba(0,0,0,0.50)] backdrop-blur-xl">
            {anglesSubmitted ? (
              <WaitingDock title="Углы зафиксированы" subtitle={`Ждём соперника · ${anglesCount[1]}/${CFG.BALLS_PER_PLAYER}`} />
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="plinko-safe-text text-[8px] font-black uppercase tracking-[0.18em] text-white/32">Прицел · шар {curBall + 1}</span>
                  <span className={`plinko-safe-text text-[12px] font-black tracking-[-0.04em] tabular-nums plinko-tone-${activeTone}`}>
                    {angleDeg > 0 ? "+" : ""}{angleDeg}°
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { hapticSelection(); setLiveAngle((value) => clamp(Math.round((value - 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000, -1, 1)); }} className="press grid h-9 w-9 shrink-0 place-items-center rounded-[15px] border border-white/[0.08] bg-white/[0.06] text-lg font-black text-white/78">−</button>
                  <div ref={sliderRef} onPointerDown={sliderDown} onPointerMove={sliderMove} className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none">
                    <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-white/[0.13]" />
                    <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
                    <SliderThumb pct={((liveAngle + 1) / 2) * 100} tone={activeTone} />
                  </div>
                  <button type="button" onClick={() => { hapticSelection(); setLiveAngle((value) => clamp(Math.round((value + 1 / CFG.ANGLE_MAX_DEG) * 1000) / 1000, -1, 1)); }} className="press grid h-9 w-9 shrink-0 place-items-center rounded-[15px] border border-white/[0.08] bg-white/[0.06] text-lg font-black text-white/78">+</button>
                  <button type="button" onClick={confirmAngle} className={`press h-9 shrink-0 rounded-[14px] px-4 text-[11px] font-black text-[#050507] plinko-safe-text plinko-btn-ok-${activeTone}`}>
                    OK {curBall + 1}/{CFG.BALLS_PER_PLAYER}
                  </button>
                </div>
                <div className="mt-1 text-center text-[7px] font-bold text-white/30 plinko-safe-text">
                  Выбор скрыт · оба игрока выбирают одновременно · соперник {anglesCount[1]}/{CFG.BALLS_PER_PLAYER}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "actions" && (
        <div className="plinko-actions-dock fixed inset-x-0 z-30 px-3">
          <div className="plinko-actions-panel mx-auto max-w-[460px] rounded-[20px] border border-white/[0.09] bg-[#09090d]/94 shadow-[0_16px_38px_rgba(0,0,0,0.46)] backdrop-blur-xl">
            {actionsSubmitted ? (
              <WaitingDock title="Действия готовы" subtitle={`Соперник: ${Math.min(serverState?.players[String(opponentUserId)]?.actions_used || 0, CFG.ACTIONS_PER_TURN)}/${CFG.ACTIONS_PER_TURN}`} />
            ) : (
              <>
                <div className="plinko-actions-grid">
                  {([
                    { m: "x2" as ActionMode, label: "x2" },
                    { m: "half" as ActionMode, label: "/2" },
                    { m: "wall" as ActionMode, label: "Wall" },
                  ]).map((button) => {
                    const on = actionMode === button.m;
                    return (
                      <button
                        key={button.m}
                        type="button"
                        disabled={actionsLeft <= 0}
                        onClick={() => {
                          hapticSelection();
                          setActionMode(on ? null : button.m);
                        }}
                        className={`press h-9 min-w-0 rounded-[13px] border px-2 text-[10px] font-black plinko-safe-text disabled:opacity-35 ${on ? `plinko-action-on-${activeTone}` : "plinko-action-off"}`}
                      >
                        {button.label}
                      </button>
                    );
                  })}
                </div>

                <div className="plinko-actions-help mt-1 flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-center text-[7px] font-bold leading-[1.55] text-white/36 plinko-safe-text">
                    {actionMode === "wall"
                      ? "Выберите место стены между пегами"
                      : actionMode
                        ? "Теперь нажмите нужный стакан"
                        : `Множители открыты · осталось действий: ${actionsLeft}`}
                  </div>
                  <button
                    type="button"
                    onClick={submitActions}
                    className="press h-8 shrink-0 rounded-[13px] border border-white/[0.08] bg-white/[0.06] px-3 text-[7.5px] font-black text-white/62 plinko-safe-text"
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(phase === "waiting" || phase === "countdown") && (
        <StartOverlay phase={phase} countdown={countdown} connectionStatus={connectionStatus} error={socketError} />
      )}

      {phase === "reveal" && awaitingResult && (
        <div className="plinko-dock pointer-events-none fixed inset-x-0 z-30 px-3">
          <div className="mx-auto max-w-[330px] rounded-[18px] border border-white/[0.08] bg-[#09090d]/88 px-4 py-3 text-center shadow-[0_18px_42px_rgba(0,0,0,.45)] backdrop-blur-xl">
            <div className="plinko-safe-text text-[9px] font-black uppercase tracking-[0.14em] text-white/38">Вскрытие завершено</div>
            <div className="plinko-safe-text mt-1 text-[12px] font-black text-white/78">Сверяем результат</div>
          </div>
        </div>
      )}

      {phase === "result" && resultReady && (
        <ResultModal
          players={profiles}
          scores={scores}
          winner={winnerVisual}
          reward={netReward}
          refund={betCoins}
          onExit={() => navigate("/game/plinko_pvp/lobbies", { replace: true })}
        />
      )}

      {socketError && phase !== "waiting" && (
        <div className="pointer-events-none absolute left-1/2 top-[58px] z-50 w-[min(88vw,340px)] -translate-x-1/2 rounded-[14px] border border-[#ff7588]/20 bg-[#2a1016]/92 px-3 py-2 text-center text-[8px] font-black text-[#ffabb7] plinko-safe-text">
          {socketError}
        </div>
      )}
    </div>
  );
}

function StartOverlay({
  phase,
  countdown,
  connectionStatus,
  error,
}: {
  phase: "waiting" | "countdown";
  countdown: number;
  connectionStatus: ConnectionStatus;
  error: string | null;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#09090d]/76 px-6 text-center backdrop-blur-[10px]">
      {phase === "countdown" ? (
        <div key={countdown} className="grid justify-items-center">
          <div className="plinko-safe-text text-[8px] font-black uppercase tracking-[0.24em] text-white/38">Plinko duel</div>
          <div className="plinko-countdown-number mt-1 bg-gradient-to-b from-white via-[#e8f4ff] to-[#ffd0a1] bg-clip-text text-[92px] font-black tracking-[-0.1em] text-transparent">
            {countdown}
          </div>
          <div className="plinko-safe-text -mt-2 text-[10px] font-black uppercase tracking-[0.17em] text-white/48">Приготовьтесь</div>
        </div>
      ) : (
        <div className="grid justify-items-center">
          <div className="plinko-ready-pulse h-3 w-3 rounded-full bg-[#5bb7ff] shadow-[0_0_24px_rgba(91,183,255,.7)]" />
          <div className="plinko-safe-text mt-4 text-[13px] font-black text-white/78">Подключаем матч</div>
          <div className="plinko-safe-text mt-1 text-[8px] font-bold text-white/34">
            {error || (connectionStatus === "open" ? "Синхронизация игроков" : "Соединение с сервером")}
          </div>
        </div>
      )}
    </div>
  );
}

function WaitingDock({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 px-1">
      <div className="min-w-0">
        <div className="plinko-safe-text text-[10px] font-black text-white/82">{title}</div>
        <div className="plinko-safe-text text-[7px] font-bold text-white/34">{subtitle}</div>
      </div>
      <div className="plinko-ready-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-[#5bb7ff] shadow-[0_0_16px_rgba(91,183,255,.6)]" />
    </div>
  );
}

type ResultModalProps = {
  players: [PlayerView, PlayerView];
  scores: [number, number];
  winner: number;
  reward: number;
  refund: number;
  onExit: () => void;
};

function ResultModal({ players, scores, winner, reward, refund, onExit }: ResultModalProps) {
  const isTie = winner < 0;
  const won = winner === 0;
  const title = isTie ? "Ничья" : won ? "Победа" : "Поражение";
  const resultAmount = won ? reward : isTie ? refund : 0;
  const mainPlayer = isTie ? players[0] : players[winner];
  const mainScore = isTie ? scores[0] : scores[winner];
  const secondaryIndex = isTie ? 1 : winner === 0 ? 1 : 0;
  const secondaryPlayer = players[secondaryIndex];
  const secondaryScore = scores[secondaryIndex];
  const accent = won ? "#5BB7FF" : isTie ? "#EAF4FF" : "#FFB45C";

  return (
    <div className="plinko-result-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#050507]/70 px-5 backdrop-blur-[8px]">
      <div className="plinko-result-sheet w-full max-w-[330px] rounded-[26px] border border-white/[0.09] bg-[#0b0b10]/[.97] p-4 shadow-[0_24px_70px_rgba(0,0,0,.68)]">
        <div className="text-center">
          <div className="plinko-safe-text text-[7px] font-black uppercase tracking-[0.18em] text-white/30">Plinko duel</div>
          <div className="plinko-result-title mt-1.5 text-[27px] font-black tracking-[-0.06em]" style={{ color: accent }}>
            {title}
          </div>
        </div>

        <div className="mt-3 rounded-[19px] border border-white/[0.07] bg-white/[0.035] p-2.5">
          <div className="flex items-center gap-2.5">
            <PlayerAvatar player={mainPlayer} className="h-12 w-12 shrink-0 rounded-[16px]" />
            <div className="min-w-0 flex-1 text-left">
              <div className="plinko-result-name truncate text-[11px] font-black text-white">{mainPlayer.name}</div>
              <div className="plinko-safe-text mt-0.5 text-[7px] font-bold text-white/34">
                {isTie ? "Одинаковый результат" : "Лучший результат матча"}
              </div>
            </div>
            <div className="plinko-result-score shrink-0 text-[20px] font-black tabular-nums" style={{ color: accent }}>
              {fmt(mainScore)}
            </div>
          </div>

          <div className="my-2 h-px bg-white/[0.055]" />

          <div className="flex items-center gap-2 opacity-65">
            <PlayerAvatar player={secondaryPlayer} className="h-9 w-9 shrink-0 rounded-[13px]" />
            <div className="min-w-0 flex-1 truncate text-left text-[9px] font-black text-white/72 plinko-safe-text">
              {secondaryPlayer.name}
            </div>
            <div className="plinko-result-score shrink-0 text-[15px] font-black text-white/52 tabular-nums">
              {fmt(secondaryScore)}
            </div>
          </div>
        </div>

        <div className="game-result-reward mt-2.5 flex min-h-[48px] items-center justify-between rounded-[17px] border border-white/[0.065] bg-white/[0.03] px-3">
          <div className="text-left">
            <div className="plinko-safe-text text-[6.5px] font-black uppercase tracking-[0.11em] text-white/28">
              {won ? "Выигрыш" : isTie ? "Возврат" : "Результат"}
            </div>
            <div className="plinko-safe-text mt-0.5 text-[9px] font-black text-white/68">
              {won ? "Чистая сумма" : isTie ? "Ставка возвращена" : "Матч завершён"}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <img src={coinIcon} alt="" className="h-5 w-5 object-contain" draggable={false} />
            <strong className="plinko-result-score text-[17px] font-black" style={{ color: resultAmount > 0 ? "#FFB45C" : "rgba(255,255,255,.45)" }}>
              {resultAmount > 0 ? `+${formatMoney(resultAmount)}` : "0"}
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="game-result-exit press mt-3 h-10 w-full rounded-[15px] bg-white text-[9px] font-black text-[#09090d] plinko-safe-text"
        >
          К лобби
        </button>
      </div>
    </div>
  );
}

type TurnTimerProps = { total: number; left: number; playerIdx: number; label: string; meta?: string };
function TurnTimer({ total, left, playerIdx, label, meta }: TurnTimerProps) {
  const safeTotal = Math.max(1, total);
  const safeLeft = clamp(Math.ceil(left), 0, safeTotal);
  const progress = clamp(safeLeft / safeTotal, 0, 1);
  const degrees = Math.round(progress * 360);
  const color = PLAYER_STYLE[playerIdx]?.color ?? "#5BB7FF";
  const ringRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.style.background = `conic-gradient(${color} ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg)`;
    ring.style.boxShadow = `0 0 13px ${color}38`;
  }, [color, degrees]);
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 rounded-[14px] border border-white/[0.08] bg-white/[0.055] pl-1 pr-1.5">
      <div ref={ringRef} className="plinko-timer-ring">
        <span className="absolute inset-[3px] rounded-full bg-[#09090d]" />
        <span className="relative plinko-safe-text">{safeLeft}</span>
      </div>
      <span className="grid gap-0 text-left">
        <span className="plinko-safe-text text-[6px] font-black uppercase tracking-[0.1em] text-white/38">{label}</span>
        {meta && <span className="plinko-safe-text text-[8px] font-black text-white/72 tabular-nums">{meta}</span>}
      </span>
    </div>
  );
}

type PlayerScoreCardProps = { playerIdx: number; player: PlayerView; score: number; active: boolean; reverse?: boolean };
function PlayerScoreCard({ playerIdx, player, score, active, reverse = false }: PlayerScoreCardProps) {
  const tone = toneOf(playerIdx);
  return (
    <div className={`flex h-11 max-w-[132px] min-w-[92px] items-center gap-1.5 overflow-hidden rounded-[16px] border px-1.5 backdrop-blur-xl ${reverse ? "flex-row-reverse" : ""} ${active ? `plinko-score-active-${tone}` : "plinko-score-idle"}`}>
      <PlayerAvatar player={player} className="h-8 w-8 shrink-0 rounded-[12px]" />
      <div className={`min-w-0 flex-1 ${reverse ? "text-right" : "text-left"}`}>
        <div className="plinko-safe-text truncate text-[6.5px] font-black text-white/58">{player.name}</div>
        <div className={`plinko-safe-text truncate text-[10px] font-black tracking-[-0.03em] tabular-nums plinko-score-value-${tone}`}>{fmt(score)}</div>
      </div>
    </div>
  );
}

function PlayerAvatar({ player, className }: { player: PlayerView; className: string }) {
  return (
    <div className={`plinko-safe-text grid overflow-hidden place-items-center border border-white/[0.10] bg-white/[0.05] text-[8px] font-black text-white ${className}`}>
      {player.photoUrl ? <img src={player.photoUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : player.initials}
    </div>
  );
}

type BallCounterProps = { playerIdx: number; value: number; reverse?: boolean };
function BallCounter({ playerIdx, value, reverse = false }: BallCounterProps) {
  return (
    <div className={`flex items-center gap-1 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full plinko-ball-${toneOf(playerIdx)}`} />
      <span className="plinko-safe-text text-[9px] font-black tracking-[-0.03em] text-white/78 tabular-nums">{Math.min(value, CFG.BALLS_PER_PLAYER)}/{CFG.BALLS_PER_PLAYER}</span>
    </div>
  );
}

function SliderThumb({ pct, tone }: { pct: number; tone: PlayerTone }) {
  const thumbRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    thumbRef.current?.style.setProperty("left", `${clamp(pct, 0, 100)}%`);
  }, [pct]);
  return <div ref={thumbRef} className={`plinko-slider-thumb plinko-slider-thumb-${tone}`} />;
}
