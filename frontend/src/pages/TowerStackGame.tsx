import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { LobbyPlayerInfo } from '../api/types';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';
import {
  towerStackWsApi,
  type TowerStackPlayerState,
  type TowerStackSocketClient,
  type TowerStackStateMessage,
} from '../api/towerStackWs';
import { calculateMatchWinnerProfit } from '../utils/matchEconomy';

/* ============================================================================
 * TowerStackGame.tsx — premium 1v1 tower-stacking duel for a Telegram Mini App.
 *
 * Self-contained: React + TypeScript, canvas renderer, no external engines.
 * Architecture:
 *   - Per-frame motion (block sweep, camera, particles, falling slabs) lives
 *     entirely inside TowerEngine and runs on refs + requestAnimationFrame.
 *     It NEVER touches React state.
 *   - React state changes only on meaningful events: block placed (score /
 *     combo / floating label), rival event, phase change, timer tick and FX.
 *   - Both players share one authoritative WebSocket match. Rival tower
 *     geometry stays private; only score and last placement quality are shown.
 * ========================================================================== */

/* ------------------------------ Public types ------------------------------ */

export type Phase = 'ready' | 'countdown' | 'playing' | 'result';
export type Quality = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface TowerStackGameProps {
  onExit?: () => void;
}


/* -------------------------------- Constants ------------------------------- */
/* All tuning lives here — no magic values scattered through the logic.       */

const COLOR = {
  blue: '#2f8cff',
  blueSoft: '#5bb7ff',
  orange: '#ff8f2d',
  orangeSoft: '#ffb45c',
  gold: '#ffc96a',
  stoneTop: '#2b2f3a',
  stoneMid: '#1c1f27',
  stoneBot: '#13151b',
} as const;

// Geometry (CSS px)
const BLOCK_HEIGHT = 34;
const PODIUM_H = 26;
const PAD = 14;
const MIN_WIDTH = 16;
const SERVER_WORLD_WIDTH = 360;

// World / camera
const FLOOR_Y_RATIO = 0.86; // podium top, as a fraction of stage height from the top
const FOCUS_Y_RATIO = 0.4; // screen band where the live block sits once we scroll
const CAMERA_LERP = 0.12;

// Motion
const BASE_SPEED = 150; // px/s
const SPEED_STEP = 5; // +px/s per placed block
const SPEED_MAX = 320;

// Placement tuning
const PERFECT_PX = 7; // centre tolerance (px) for a PERFECT
const GREAT_RATIO = 0.62; // overlap/width threshold for GREAT vs GOOD
const MIN_OVERLAP_PX = 8; // below this overlap -> MISS
const PERFECT_REGROW = 5; // forgiveness: regrow width on a PERFECT (capped at base)

// FX
const DUST_GRAV = 220;
const SLAB_GRAV = 900;
const FLASH_DECAY = 2.2;

// Scoring — compact and capped so rounds stay readable, not 60k+ point floods.
const SCORE: Record<Quality, number> = { PERFECT: 36, GREAT: 22, GOOD: 10, MISS: -12 };
const COMBO_MIN = 4; // combos start paying out from this streak length
const COMBO_STEP = 4; // bonus per combo level beyond COMBO_MIN
const COMBO_BONUS_MAX = 32; // hard cap so long streaks never explode the score

// Round / flow
const ROUND_SECONDS = 30;
const COUNTDOWN_FROM = 3;
const LABEL_TTL = 900; // ms, matches the tsFloat animation duration


/* -------------------------------- Helpers --------------------------------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Local visual scoring mirrors the authoritative backend scoring table. */
function scoreFor(quality: Quality, comboAfter: number) {
  const base = SCORE[quality];
  let bonus = 0;
  if ((quality === 'PERFECT' || quality === 'GREAT') && comboAfter >= COMBO_MIN) {
    bonus = Math.min(COMBO_BONUS_MAX, COMBO_STEP * (comboAfter - COMBO_MIN + 1));
  }
  return { base, bonus, delta: base + bonus };
}

/** Rounded-rect path (manual, so we never depend on ctx.roundRect support). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* --------------------------- Telegram WebApp glue -------------------------- */

interface TgHaptic {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
}
interface TgWebApp {
  viewportHeight?: number;
  viewportStableHeight?: number;
  HapticFeedback?: TgHaptic;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  expand?: () => void;
  ready?: () => void;
}
function getTelegram(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

/* ------------------------------- Game engine ------------------------------ */
/* Owns everything per-frame. Talks to React only via the onPlace callback.   */

interface Block {
  left: number;
  width: number;
  level: number;
  perfect: boolean;
}
interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
interface Slab {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
}
interface PlaceInfo {
  quality: Quality;
  scoreDelta: number;
  combo: number;
  comboBonus: number;
  x: number; // CSS px within the stage — used to position floating FX
  y: number;
}
interface EngineCallbacks {
  onPlace: (info: PlaceInfo) => void;
}

class TowerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private cb: EngineCallbacks;

  private cssW = 0;
  private cssH = 0;
  private floorY = 0;
  private baseWidth = 120;
  private worldScale = 1;

  private blocks: Block[] = [];
  private active: { x: number; w: number; dir: number } | null = null;
  private activeStartedAtPerf = 0;
  private activeFromLeft = true;
  private speed = BASE_SPEED;
  private cameraY = 0;
  private cameraTarget = 0;
  private dust: Dust[] = [];
  private slabs: Slab[] = [];
  private flash = 0;
  private combo = 0;

  private running = false;
  private raf = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.ctx = canvas.getContext('2d');
  }

  resize(w: number, h: number) {
    this.cssW = w;
    this.cssH = h;
    this.floorY = h * FLOOR_Y_RATIO;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this.render(); // keep an idle frame painted behind overlays
  }

  start(
    worldWidth = SERVER_WORLD_WIDTH,
    serverBaseWidth = SERVER_WORLD_WIDTH * 0.42,
    activeStartMs = 0,
    estimatedServerNowMs = 0,
    initialPlayer?: TowerStackPlayerState,
  ) {
    this.worldScale = this.cssW / Math.max(1, worldWidth);
    this.baseWidth = Math.max(MIN_WIDTH * this.worldScale, serverBaseWidth * this.worldScale);
    this.blocks = (initialPlayer?.blocks ?? []).map((block) => ({
      left: block.left * this.worldScale,
      width: block.width * this.worldScale,
      level: block.level,
      perfect: block.perfect,
    }));
    this.dust = [];
    this.slabs = [];
    this.flash = 0;
    this.combo = initialPlayer?.combo ?? 0;
    this.cameraY = 0;
    this.cameraTarget = 0;

    const activeWidthWorld =
      initialPlayer && initialPlayer.active_width > 0
        ? initialPlayer.active_width
        : serverBaseWidth;
    const activeWidth = Math.max(MIN_WIDTH * this.worldScale, activeWidthWorld * this.worldScale);
    const activeSpeedWorld =
      initialPlayer && initialPlayer.active_speed > 0
        ? initialPlayer.active_speed
        : Math.min(SPEED_MAX, BASE_SPEED + this.blocks.length * SPEED_STEP);
    const initialActiveStartMs = initialPlayer?.active_start_ms || activeStartMs;
    const initialFromLeft = initialPlayer?.active_from_left ?? true;

    this.speed = activeSpeedWorld * this.worldScale;

    if (initialActiveStartMs > 0 && estimatedServerNowMs > 0) {
      this.alignActive(
        activeWidth,
        initialActiveStartMs,
        initialFromLeft,
        activeSpeedWorld,
        estimatedServerNowMs,
      );
    } else {
      this.spawnActive(activeWidth);
    }

    this.running = true;
    this.last = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.render(); // freeze the final frame
  }

  destroy() {
    this.stop();
  }

  /** Drop the live block onto the stack. The single player input. */
  drop(): PlaceInfo | null {
    if (!this.running || !this.active) return null;
    this.updateActivePosition(performance.now());
    const a = this.active;
    const n = this.blocks.length;
    const aLeft = a.x;
    const aW = a.w;
    const aRight = aLeft + aW;
    const aCenter = aLeft + aW / 2;

    const worldScale = this.worldScale;
    const perfectPx = PERFECT_PX * worldScale;
    const minOverlapPx = MIN_OVERLAP_PX * worldScale;
    const perfectRegrow = PERFECT_REGROW * worldScale;

    let quality: Quality;
    let newLeft = aLeft;
    let newWidth = aW;
    let placed = true;
    let sliceX = 0;
    let sliceW = 0;

    if (n === 0) {
      // First block lands on the wide podium — forgiving, never a miss.
      const centerDelta = Math.abs(aCenter - this.cssW / 2);
      quality = centerDelta <= perfectPx ? 'PERFECT' : 'GREAT';
    } else {
      const b = this.blocks[n - 1];
      const bLeft = b.left;
      const bRight = b.left + b.width;
      const bCenter = b.left + b.width / 2;
      const oL = Math.max(aLeft, bLeft);
      const oR = Math.min(aRight, bRight);
      const overlap = oR - oL;
      const centerDelta = Math.abs(aCenter - bCenter);

      if (overlap <= minOverlapPx) {
        quality = 'MISS';
        placed = false;
      } else if (centerDelta <= perfectPx) {
        quality = 'PERFECT';
        newWidth = Math.min(this.baseWidth, b.width + perfectRegrow);
        newLeft = bCenter - newWidth / 2;
      } else {
        quality = overlap / aW >= GREAT_RATIO ? 'GREAT' : 'GOOD';
        newLeft = oL;
        newWidth = overlap;
        // The hanging part shears off and falls.
        if (aLeft < oL) {
          sliceX = aLeft;
          sliceW = oL - aLeft;
        } else {
          sliceX = oR;
          sliceW = aRight - oR;
        }
      }
    }

    // Combo is a precision streak: PERFECT/GREAT build it, anything else breaks it.
    if (quality === 'PERFECT' || quality === 'GREAT') this.combo += 1;
    else this.combo = 0;
    const sc = scoreFor(quality, this.combo);

    if (placed) {
      const level = n;
      newWidth = Math.max(MIN_WIDTH * this.worldScale, newWidth);
      this.blocks.push({ left: newLeft, width: newWidth, level, perfect: quality === 'PERFECT' });
      const top = this.blockTop(level);
      const cx = newLeft + newWidth / 2;

      if (quality === 'PERFECT') {
        this.flash = 0.07;
        this.burst(cx, top, 16, COLOR.gold);
      } else if (quality === 'GREAT') {
        this.flash = 0.04;
        this.burst(cx, top, 9, COLOR.blueSoft);
      } else {
        this.burst(cx, top, 5, '#aebbcd');
      }
      if (sliceW > 1) {
        this.slabs.push({
          x: sliceX,
          y: top,
          w: sliceW,
          h: BLOCK_HEIGHT,
          vx: (sliceX < newLeft ? -1 : 1) * (40 + Math.random() * 40),
          vy: -30,
          rot: 0,
          vr: (Math.random() - 0.5) * 6,
          life: 1.6,
        });
      }

      this.speed = Math.min(SPEED_MAX, BASE_SPEED + this.blocks.length * SPEED_STEP) * this.worldScale;
      this.spawnActive(newWidth);
      const info: PlaceInfo = {
        quality,
        scoreDelta: sc.delta,
        combo: this.combo,
        comboBonus: sc.bonus,
        x: cx,
        y: top,
      };
      this.cb.onPlace(info);
      return info;
    } else {
      // Miss: no growth, the round simply continues. Keep the live block.
      this.flash = 0.03;
      const info: PlaceInfo = {
        quality,
        scoreDelta: sc.delta,
        combo: 0,
        comboBonus: 0,
        x: aCenter,
        y: this.blockTop(n),
      };
      this.cb.onPlace(info);
      return info;
    }
  }

  /* ----- internals ----- */

  private loop = (t: number) => {
    if (!this.running) return;
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    this.update(dt, t);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number, nowPerfMs: number) {
    this.updateActivePosition(nowPerfMs);

    // Camera keeps the live band in view; only scrolls once the tower is tall.
    const activeTopWorld = (this.blocks.length + 1) * BLOCK_HEIGHT;
    this.cameraTarget = Math.max(0, this.cssH * FOCUS_Y_RATIO - this.floorY + activeTopWorld);
    this.cameraY += (this.cameraTarget - this.cameraY) * CAMERA_LERP;

    for (const d of this.dust) {
      d.life -= dt;
      d.vy += DUST_GRAV * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.dust = this.dust.filter((d) => d.life > 0);

    for (const s of this.slabs) {
      s.vy += SLAB_GRAV * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      s.life -= dt;
    }
    this.slabs = this.slabs.filter((s) => s.y < this.cssH + 80 && s.life > 0);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * FLASH_DECAY);
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cssW, cssH } = this;
    ctx.clearRect(0, 0, cssW, cssH);

    this.drawPodium(ctx);

    const topIndex = this.blocks.length - 1;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const y = this.blockTop(i);
      if (y > cssH + BLOCK_HEIGHT || y < -BLOCK_HEIGHT) continue; // cull off-screen
      this.drawBlock(ctx, b.left, y, b.width, b.perfect, topIndex - i);
    }

    for (const s of this.slabs) this.drawSlab(ctx, s);

    if (this.active && this.running) {
      this.drawActive(ctx, this.active.x, this.blockTop(this.blocks.length), this.active.w);
    }

    for (const d of this.dust) {
      ctx.globalAlpha = Math.max(0, d.life / d.max);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  private blockTop(level: number) {
    return this.floorY - (level + 1) * BLOCK_HEIGHT + this.cameraY;
  }

  private alignActive(
    width: number,
    activeStartMs: number,
    fromLeft: boolean,
    speedWorld: number,
    estimatedServerNowMs: number,
  ) {
    const pad = PAD * this.worldScale;
    const w = Math.min(width, this.cssW - 2 * pad);
    const elapsedSeconds = Math.max(0, (estimatedServerNowMs - activeStartMs) / 1000);

    this.speed = Math.max(0, speedWorld * this.worldScale);
    this.activeFromLeft = fromLeft;
    this.activeStartedAtPerf = performance.now() - elapsedSeconds * 1000;
    this.active = {
      x: fromLeft ? pad : this.cssW - w - pad,
      w,
      dir: fromLeft ? 1 : -1,
    };
    this.updateActivePosition(performance.now());
  }

  private spawnActive(width: number) {
    const pad = PAD * this.worldScale;
    const w = Math.min(width, this.cssW - 2 * pad);
    const fromLeft = this.blocks.length % 2 === 0;

    this.activeFromLeft = fromLeft;
    this.activeStartedAtPerf = performance.now();
    this.active = {
      x: fromLeft ? pad : this.cssW - w - pad,
      w,
      dir: fromLeft ? 1 : -1,
    };
  }

  private updateActivePosition(nowPerfMs: number) {
    const active = this.active;
    if (!active) return;

    const pad = PAD * this.worldScale;
    const minX = pad;
    const maxX = this.cssW - active.w - pad;
    const travel = Math.max(0, maxX - minX);

    if (travel <= 0) {
      active.x = minX;
      active.dir = 1;
      return;
    }

    const elapsedSeconds = Math.max(0, (nowPerfMs - this.activeStartedAtPerf) / 1000);
    const distance = elapsedSeconds * this.speed;
    const period = travel * 2;
    const position = distance % period;

    let x: number;
    let direction: number;

    if (position <= travel) {
      x = minX + position;
      direction = 1;
    } else {
      x = maxX - (position - travel);
      direction = -1;
    }

    if (!this.activeFromLeft) {
      x = minX + maxX - x;
      direction *= -1;
    }

    active.x = x;
    active.dir = direction;
  }

  private burst(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      this.dust.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  private drawPodium(ctx: CanvasRenderingContext2D) {
    const pw = this.baseWidth * 1.5;
    const x = this.cssW / 2 - pw / 2;
    const y = this.floorY + this.cameraY;
    if (y > this.cssH + PODIUM_H) return;

    const glow = ctx.createRadialGradient(
      this.cssW / 2,
      y + PODIUM_H,
      4,
      this.cssW / 2,
      y + PODIUM_H,
      pw * 0.9,
    );
    glow.addColorStop(0, 'rgba(47,140,255,0.22)');
    glow.addColorStop(1, 'rgba(47,140,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, y - 10, this.cssW, PODIUM_H + 80);

    const grad = ctx.createLinearGradient(0, y, 0, y + PODIUM_H);
    grad.addColorStop(0, '#23262f');
    grad.addColorStop(1, '#0f1116');
    rr(ctx, x, y, pw, PODIUM_H, 7);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.fillStyle = 'rgba(255,143,45,0.5)';
    rr(ctx, x + 8, y + 2, pw - 16, 2, 1);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rr(ctx, x, y, pw, 2, 1);
    ctx.fill();
  }

  private drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    perfect: boolean,
    recency: number,
  ) {
    const h = BLOCK_HEIGHT;

    // pseudo-3D depth
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, x + 3, y + 3, w, h, 6);
    ctx.fill();

    // face — only fresh blocks pay for a glow; old ones stay cheap
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, COLOR.stoneTop);
    grad.addColorStop(0.5, COLOR.stoneMid);
    grad.addColorStop(1, COLOR.stoneBot);
    rr(ctx, x, y, w, h, 6);
    if (recency < 3) {
      ctx.shadowColor = perfect ? 'rgba(255,180,92,0.5)' : 'rgba(91,183,255,0.4)';
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, x + 1, y + 1, w - 2, 2, 1);
    ctx.fill();
    // accent seam — orange/gold for a perfect, blue otherwise
    ctx.fillStyle = perfect ? 'rgba(255,201,106,0.85)' : 'rgba(91,183,255,0.55)';
    rr(ctx, x + 6, y + h - 4, w - 12, 2, 1);
    ctx.fill();
    // left light edge
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 1, y + 3, 1.5, h - 6);
  }

  private drawActive(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    const h = BLOCK_HEIGHT;
    const cx = x + w / 2;

    // subtle aiming guide
    ctx.strokeStyle = 'rgba(91,183,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, y + h);
    ctx.lineTo(cx, Math.min(this.cssH, y + h + 90));
    ctx.stroke();
    ctx.setLineDash([]);

    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#36465a');
    grad.addColorStop(1, '#1a2230');
    rr(ctx, x, y, w, h, 6);
    ctx.shadowColor = 'rgba(47,140,255,0.55)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, x + 1, y + 1, w - 2, 2, 1);
    ctx.fill();
    ctx.fillStyle = 'rgba(91,183,255,0.9)';
    rr(ctx, x + 6, y + h - 4, w - 12, 2, 1);
    ctx.fill();
  }

  private drawSlab(ctx: CanvasRenderingContext2D, s: Slab) {
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
    ctx.rotate(s.rot);
    const grad = ctx.createLinearGradient(0, -s.h / 2, 0, s.h / 2);
    grad.addColorStop(0, COLOR.stoneTop);
    grad.addColorStop(1, COLOR.stoneBot);
    ctx.globalAlpha = clamp(s.life, 0, 1);
    rr(ctx, -s.w / 2, -s.h / 2, s.w, s.h, 4);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/* ----------------------------- Viewport height ---------------------------- */
/* Telegram stable height -> visualViewport -> innerHeight, kept in sync.     */

function readViewportHeight(parentHeight = 0): number {
  const tg = getTelegram();
  const tgH = tg?.viewportStableHeight ?? tg?.viewportHeight;
  const vv = window.visualViewport?.height;
  const viewport =
    typeof tgH === 'number' && tgH > 0
      ? tgH
      : typeof vv === 'number' && vv > 0
        ? vv
        : window.innerHeight;

  return Math.floor(parentHeight > 0 ? Math.min(parentHeight, viewport) : viewport);
}

function useViewportHeight<T extends HTMLElement>(rootRef: RefObject<T | null>): number {
  const [h, setH] = useState<number>(() => readViewportHeight());

  useEffect(() => {
    let ro: ResizeObserver | null = null;

    const update = () => {
      const parentHeight = rootRef.current?.parentElement?.clientHeight ?? 0;
      setH(readViewportHeight(parentHeight));
    };

    const parent = rootRef.current?.parentElement;
    if (parent) {
      ro = new ResizeObserver(update);
      ro.observe(parent);
    }

    const tg = getTelegram();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    tg?.onEvent?.('viewportChanged', update);
    update();

    return () => {
      ro?.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      tg?.offEvent?.('viewportChanged', update);
    };
  }, [rootRef]);

  return h;
}

/* -------------------------------- Component ------------------------------- */

type Outcome = 'VICTORY' | 'DEFEAT' | 'DRAW';
interface FloatLabel {
  id: number;
  kind: Quality | 'COMBO';
  text: string;
  x: number;
  y: number;
}
let labelSeq = 0;

type LocationState = {
  lobbyId?: string;
  game?: string;
  playersInfo?: LobbyPlayerInfo[];
  betCoins?: number;
};

type PlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
  initials: string;
};

const PLAYERS_STORAGE_KEY = 'twingames_tower_stack_players_info';
const BET_STORAGE_KEY = 'twingames_tower_stack_bet_coins';

const getInitials = (value: string) =>
  value
    .replace('@', '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG';

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === 'undefined') return [];
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
  if (typeof window === 'undefined') return 0;
  const value = Number(window.sessionStorage.getItem(BET_STORAGE_KEY) || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const formatReward = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

const readLobbyId = (locationState: LocationState, search: string) => {
  if (locationState.lobbyId) return locationState.lobbyId;
  const query = new URLSearchParams(search);
  return (
    query.get('lobby_id') ||
    query.get('lobbyId') ||
    window.sessionStorage.getItem('twingames_active_lobby_id') ||
    ''
  );
};

export function TowerStackGame({ onExit }: TowerStackGameProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, refreshBalance, refreshProfile } = useAuth();
  const routeState = (location.state || {}) as LocationState;
  const lobbyId = readLobbyId(routeState, location.search);
  const lobbiesPath = '/game/tower_stack/lobbies';

  const rootRef = useRef<HTMLDivElement | null>(null);
  const barFillRef = useRef<HTMLDivElement | null>(null);
  const vh = useViewportHeight(rootRef);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TowerEngine | null>(null);
  const socketRef = useRef<TowerStackSocketClient | null>(null);
  const latestServerStateRef = useRef<TowerStackStateMessage | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const lastMyResultSeqRef = useRef(0);
  const lastRivalResultSeqRef = useRef(0);
  const lastDropVisualRef = useRef<{ x: number; y: number } | null>(null);
  const serverOffsetRef = useRef(0);
  const hasPreciseSyncRef = useRef(false);
  const dropSeqRef = useRef(0);
  const authoritativeScoreRef = useRef(0);
  const authoritativeComboRef = useRef(0);
  const pendingDropsRef = useRef(new Map<number, { delta: number; combo: number }>());
  const autoReadySentRef = useRef(false);
  const resultHandledRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('ready');
  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [rivalQuality, setRivalQuality] = useState<Quality | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [labels, setLabels] = useState<FloatLabel[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<TowerStackStateMessage | null>(null);

  const myUserId = user?.id || 0;
  const playersInfo = useMemo(
    () => (routeState.playersInfo?.length ? routeState.playersInfo : readStoredPlayersInfo()),
    [routeState.playersInfo],
  );
  const betCoins = useMemo(() => {
    const routeBet = Number(routeState.betCoins);
    return Number.isFinite(routeBet) && routeBet > 0 ? routeBet : readStoredBet();
  }, [routeState.betCoins]);

  const profileById = useMemo(() => {
    const profiles = new Map<number, PlayerProfile>();

    for (const player of playersInfo) {
      const id = Number(player.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const name = player.tg_user || `Player ${id}`;
      profiles.set(id, {
        id,
        name,
        photoUrl: player.photo_url || '',
        initials: getInitials(name),
      });
    }

    if (myUserId > 0) {
      const name = user?.tg_user || profiles.get(myUserId)?.name || 'Ты';
      profiles.set(myUserId, {
        id: myUserId,
        name,
        photoUrl: user?.photo_url || profiles.get(myUserId)?.photoUrl || '',
        initials: getInitials(name),
      });
    }

    return profiles;
  }, [myUserId, playersInfo, user?.photo_url, user?.tg_user]);

  const opponentUserId =
    serverState?.player_order.find((id) => id !== myUserId) ||
    playersInfo.find((player) => player.id !== myUserId)?.id ||
    0;
  const myProfile = profileById.get(myUserId) || {
    id: myUserId,
    name: user?.tg_user || 'Ты',
    photoUrl: user?.photo_url || '',
    initials: getInitials(user?.tg_user || 'Ты'),
  };
  const opponentProfile = profileById.get(opponentUserId) || {
    id: opponentUserId,
    name: opponentUserId ? `Player ${opponentUserId}` : 'Соперник',
    photoUrl: '',
    initials: opponentUserId ? getInitials(`Player ${opponentUserId}`) : 'VS',
  };

  const haptic = useCallback((quality: Quality) => {
    const h = getTelegram()?.HapticFeedback;
    if (!h) return;
    if (quality === 'PERFECT') h.impactOccurred?.('heavy');
    else if (quality === 'GREAT') h.impactOccurred?.('medium');
    else if (quality === 'GOOD') h.impactOccurred?.('light');
    else h.impactOccurred?.('rigid');
  }, []);

  const addLabel = useCallback((kind: FloatLabel['kind'], x: number, y: number) => {
    const id = labelSeq++;
    setLabels((ls) => [...ls, { id, kind, text: kind, x, y }]);
    const to = window.setTimeout(() => {
      setLabels((ls) => ls.filter((l) => l.id !== id));
    }, LABEL_TTL);
    timeoutsRef.current.push(to);
  }, []);

  const handlePlace = useCallback((info: PlaceInfo) => {
    lastDropVisualRef.current = { x: info.x, y: info.y };
  }, []);

  const resetLocalMatch = useCallback(() => {
    setPlayerScore(0);
    setRivalScore(0);
    setCombo(0);
    setRivalQuality(null);
    setLabels([]);
    setOutcome(null);
    setTimeLeft(ROUND_SECONDS);
    dropSeqRef.current = 0;
    lastMyResultSeqRef.current = 0;
    lastRivalResultSeqRef.current = 0;
    authoritativeScoreRef.current = 0;
    authoritativeComboRef.current = 0;
    pendingDropsRef.current.clear();
    resultHandledRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const engine = new TowerEngine(canvas, { onPlace: handlePlace });
    engineRef.current = engine;

    const apply = () => {
      const rect = stage.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stage);

    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [handlePlace]);

  useEffect(() => {
    const tg = getTelegram();
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || phase !== 'playing') return;
    const prevent = (event: TouchEvent) => event.preventDefault();
    root.addEventListener('touchmove', prevent, { passive: false });
    return () => root.removeEventListener('touchmove', prevent);
  }, [phase]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const height = `${Math.max(320, vh - 1)}px`;
    root.style.height = height;
    root.style.maxHeight = height;
  }, [vh]);

  useEffect(() => {
    if (!lobbyId || !token) return;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = towerStackWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          autoReadySentRef.current = false;
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => {
          autoReadySentRef.current = false;
          setConnectionStatus('closed');
        },
        onSocketError: () => {
          setConnectionStatus('error');
          setSocketError('Ошибка подключения к игре');
        },
        onServerError: (error) => {
          setSocketError(error.details || error.error);
          client.requestState();
        },
        onSync: (sync) => {
          const receivedAt = Date.now();
          const sampleOffset = receivedAt - sync.server_ms - sync.rtt_ms / 2;
          const previous = serverOffsetRef.current;
          const nextOffset = hasPreciseSyncRef.current
            ? previous * 0.72 + sampleOffset * 0.28
            : sampleOffset;

          hasPreciseSyncRef.current = true;
          serverOffsetRef.current = nextOffset;
          client.syncAck(sync.nonce);
        },
        onState: (state) => {
          latestServerStateRef.current = state;
          setServerState(state);
          setSocketError(null);

          if (!hasPreciseSyncRef.current && state.server_ms > 0) {
            const roughOffset = Date.now() - state.server_ms;
            serverOffsetRef.current = roughOffset;
          }

          const mine = myUserId ? state.players[String(myUserId)] : undefined;
          const rivalId = state.player_order.find((id) => id !== myUserId) || 0;
          const rival = rivalId ? state.players[String(rivalId)] : undefined;

          if (mine) {
            const maxPendingSeq = Math.max(0, ...pendingDropsRef.current.keys());
            dropSeqRef.current = Math.max(mine.last_seq || 0, maxPendingSeq);
            const acknowledgedSeq = mine.last_result?.seq || mine.last_seq || 0;

            if (
              acknowledgedSeq > lastMyResultSeqRef.current ||
              state.phase !== 'playing' ||
              pendingDropsRef.current.size === 0
            ) {
              lastMyResultSeqRef.current = Math.max(
                lastMyResultSeqRef.current,
                acknowledgedSeq,
              );
              authoritativeScoreRef.current = mine.score;
              authoritativeComboRef.current = mine.combo;

              for (const seq of pendingDropsRef.current.keys()) {
                if (seq <= acknowledgedSeq) pendingDropsRef.current.delete(seq);
              }

              let visibleScore = mine.score;
              let visibleCombo = mine.combo;
              const pending = [...pendingDropsRef.current.entries()].sort(
                ([left], [right]) => left - right,
              );
              for (const [, optimistic] of pending) {
                visibleScore = Math.max(0, visibleScore + optimistic.delta);
                visibleCombo = optimistic.combo;
              }

              setPlayerScore(visibleScore);
              setCombo(visibleCombo);
            }
          }

          if (rival) {
            setRivalScore(rival.score);
            const result = rival.last_result;
            if (result && result.seq > lastRivalResultSeqRef.current) {
              lastRivalResultSeqRef.current = result.seq;
              setRivalQuality(result.quality);
            }
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
    const state = serverState;
    if (!state) return;

    if (state.phase === 'playing') {
      setPhase('playing');
    } else if (state.phase === 'match_over') {
      setPhase('result');
    } else if (state.phase === 'countdown') {
      const serverNow = Date.now() - serverOffsetRef.current;
      setPhase(serverNow >= state.start_at_ms ? 'playing' : 'countdown');
    } else {
      setPhase('ready');
    }
  }, [serverState]);

  useEffect(() => {
    if (connectionStatus !== 'open' || serverState?.phase !== 'waiting') return;
    if (autoReadySentRef.current) return;
    if (!socketRef.current?.ready()) return;

    autoReadySentRef.current = true;
    setSocketError(null);
    resetLocalMatch();
  }, [connectionStatus, resetLocalMatch, serverState?.phase]);

  useEffect(() => {
    const initialState = latestServerStateRef.current;

    if (phase === 'playing' && initialState) {
      const estimatedServerNow = Date.now() - serverOffsetRef.current;
      const initialPlayer = myUserId
        ? initialState.players[String(myUserId)]
        : undefined;

      engineRef.current?.start(
        initialState.world_width,
        initialState.base_width,
        initialState.start_at_ms,
        estimatedServerNow,
        initialPlayer,
      );
      return () => engineRef.current?.stop();
    }

    engineRef.current?.stop();
  }, [
    myUserId,
    phase,
    serverState?.base_width,
    serverState?.start_at_ms,
    serverState?.world_width,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = serverState;
      if (!state) return;

      const serverNow = Date.now() - serverOffsetRef.current;
      if (state.phase === 'countdown') {
        const leftMs = state.start_at_ms - serverNow;
        setCountdown(Math.max(1, Math.ceil(leftMs / 1000)));
        setTimeLeft(state.round_seconds);
        if (leftMs <= 0) setPhase('playing');
      } else if (state.phase === 'playing') {
        const leftMs = state.deadline_ms - serverNow;
        setTimeLeft(Math.max(0, Math.ceil(leftMs / 1000)));
        if (leftMs <= 0) engineRef.current?.stop();
      }
    }, 50);

    return () => window.clearInterval(id);
  }, [serverState]);

  useEffect(() => {
    if (serverState?.phase !== 'match_over') return;

    const winner = serverState.winner_user_id;
    const nextOutcome: Outcome =
      winner === undefined ? 'DRAW' : winner === myUserId ? 'VICTORY' : 'DEFEAT';
    setOutcome(nextOutcome);

    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    getTelegram()?.HapticFeedback?.notificationOccurred?.(
      nextOutcome === 'VICTORY' ? 'success' : nextOutcome === 'DEFEAT' ? 'error' : 'warning',
    );
    void refreshBalance();
    void refreshProfile();
  }, [myUserId, refreshBalance, refreshProfile, serverState]);

  const progress = clamp(timeLeft / Math.max(1, serverState?.round_seconds || ROUND_SECONDS), 0, 1);
  useEffect(() => {
    barFillRef.current?.style.setProperty('width', `${progress * 100}%`);
  }, [progress]);

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = [];
    },
    [],
  );


  const onStagePointerDown = useCallback(() => {
    if (phase !== 'playing' || connectionStatus !== 'open') return;

    const info = engineRef.current?.drop();
    if (!info) return;

    const visual = lastDropVisualRef.current;
    const x = visual?.x ?? info.x;
    const y = (visual?.y ?? info.y) - 34;

    setPlayerScore((current) => Math.max(0, current + info.scoreDelta));
    setCombo(info.combo);
    addLabel(info.quality, x, y);
    if (info.comboBonus > 0 && info.combo >= COMBO_MIN) {
      addLabel('COMBO', x, y - 28);
    }
    haptic(info.quality);

    const seq = dropSeqRef.current + 1;
    dropSeqRef.current = seq;
    pendingDropsRef.current.set(seq, {
      delta: info.scoreDelta,
      combo: info.combo,
    });

    const estimatedServerMs = Date.now() - serverOffsetRef.current;
    if (!socketRef.current?.drop(seq, estimatedServerMs)) {
      pendingDropsRef.current.delete(seq);
      dropSeqRef.current = Math.max(0, seq - 1);
      setSocketError('Нет подключения к игре');
      socketRef.current?.requestState();
    }
  }, [addLabel, connectionStatus, haptic, phase]);

  const leave = useCallback(() => {
    if (onExit) onExit();
    else navigate(lobbiesPath, { replace: true });
  }, [lobbiesPath, navigate, onExit]);

  const timeStr = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
  const isDraw = outcome === 'DRAW';
  const didWin = outcome === 'VICTORY';
  const winnerIsPlayer = serverState?.winner_user_id === myUserId;
  const winnerProfile = winnerIsPlayer ? myProfile : opponentProfile;
  const loserProfile = winnerIsPlayer ? opponentProfile : myProfile;
  const winnerScore = winnerIsPlayer ? playerScore : rivalScore;
  const loserScore = winnerIsPlayer ? rivalScore : playerScore;
  const displayedReward = didWin ? calculateMatchWinnerProfit(betCoins) : 0;
  const countdownValue = phase === 'ready' ? COUNTDOWN_FROM : countdown;

  if (!lobbyId || !token) {
    return (
      <div className="ts-root" ref={rootRef}>
        <style>{STYLES}</style>
        <div className="ts-overlay">
          <div className="ts-panel">
            <div className="ts-kicker">TOWER STACK</div>
            <h1 className="ts-title">Нет подключения</h1>
            <p className="ts-sub">Открывай игру через активное лобби.</p>
            <button className="ts-btn ts-btn-go" onClick={leave}>В ЛОББИ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-root" ref={rootRef}>
      <style>{STYLES}</style>

      <div className="ts-hud">
        <div className="ts-hud-side">
          <ProfileAvatar profile={myProfile} tone="you" />
          <div className="ts-hud-copy">
            <span className="ts-hud-name" title={myProfile.name}>{myProfile.name}</span>
            <div className="ts-hud-score-row">
              <span className="ts-hud-score">{playerScore}</span>
              {combo >= 2 && <span className="ts-combo">X{combo}</span>}
            </div>
          </div>
        </div>

        <div className="ts-hud-center">
          <span className="ts-timer">{timeStr}</span>
          <div className="ts-bar"><div ref={barFillRef} className="ts-bar-fill" /></div>
        </div>

        <div className="ts-hud-side ts-right">
          <div className="ts-hud-copy ts-hud-copy-right">
            <span className="ts-hud-name" title={opponentProfile.name}>{opponentProfile.name}</span>
            <div className="ts-hud-score-row ts-hud-score-row-right">
              {rivalQuality && <span className={`ts-chip q-${rivalQuality}`}>{rivalQuality}</span>}
              <span className="ts-hud-score ts-rival-score">{rivalScore}</span>
            </div>
          </div>
          <ProfileAvatar profile={opponentProfile} tone="rival" />
        </div>
      </div>

      <div className="ts-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
        <canvas ref={canvasRef} className="ts-canvas" />
        <div className="ts-fx">
          {labels.map((label) => <FloatLabelView key={label.id} label={label} />)}
        </div>

        {(phase === 'ready' || phase === 'countdown') && (
          <div className="ts-overlay ts-countdown">
            <div className="ts-count-content" key={countdownValue}>
              <div className="ts-count-ring" aria-hidden="true" />
              <div className="ts-count-num">{countdownValue}</div>
              <div className="ts-count-label">ГОТОВЬСЯ</div>
            </div>
            {connectionStatus !== 'open' && (
              <div className="ts-count-error">{socketError || 'ПОДКЛЮЧЕНИЕ'}</div>
            )}
          </div>
        )}

        {phase === 'result' && (
          <div className="ts-overlay ts-result-overlay">
            <div className="ts-result-panel">
              <div className={`ts-result-glow r-${outcome ?? 'DRAW'}`} />
              <div className="ts-result-content">
                <div className="ts-result-kicker">TOWER STACK · РЕЗУЛЬТАТ МАТЧА</div>
                <h2 className={`ts-result-title r-${outcome ?? 'DRAW'}`}>
                  {isDraw ? 'НИЧЬЯ' : didWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
                </h2>

                {isDraw ? (
                  <div className="ts-draw-grid">
                    <div className="ts-result-player">
                      <ProfileAvatar profile={myProfile} tone="neutral" size="large" />
                      <div className="ts-result-name">{myProfile.name}</div>
                      <div className="ts-result-score">{playerScore}</div>
                    </div>
                    <div className="ts-result-vs">VS</div>
                    <div className="ts-result-player">
                      <ProfileAvatar profile={opponentProfile} tone="neutral" size="large" />
                      <div className="ts-result-name">{opponentProfile.name}</div>
                      <div className="ts-result-score">{rivalScore}</div>
                    </div>
                  </div>
                ) : (
                  <div className="ts-winner-grid">
                    <div className="ts-result-player ts-result-winner">
                      <div className="ts-winner-crown">WINNER</div>
                      <ProfileAvatar profile={winnerProfile} tone="winner" size="winner" />
                      <div className="ts-result-name ts-result-name-winner">{winnerProfile.name}</div>
                      <div className="ts-result-score ts-result-score-winner">{winnerScore}</div>
                    </div>
                    <div className="ts-result-vs">VS</div>
                    <div className="ts-result-player ts-result-loser">
                      <ProfileAvatar profile={loserProfile} tone="neutral" size="medium" />
                      <div className="ts-result-name ts-result-name-muted">{loserProfile.name}</div>
                      <div className="ts-result-score ts-result-score-muted">{loserScore}</div>
                    </div>
                  </div>
                )}

                <div className="ts-result-divider" />

                <div className={`game-result-reward ts-reward-pill ${didWin ? 'is-win' : isDraw ? 'is-draw' : 'is-loss'}`}>
                  <span className="ts-reward-value">{didWin ? `+${formatReward(displayedReward)}` : '0'}</span>
                  <img src={coinIcon} alt="GAME" draggable={false} />
                </div>

                <button className="game-result-exit ts-result-button" onClick={leave} type="button">
                  <span className="ts-result-button-icon" aria-hidden="true">←</span>
                  <span>К ЛОББИ</span>
                  <span className="ts-result-button-spacer" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileAvatar({
  profile,
  tone,
  size = 'small',
}: {
  profile: PlayerProfile;
  tone: 'you' | 'rival' | 'winner' | 'neutral';
  size?: 'small' | 'medium' | 'large' | 'winner';
}) {
  return (
    <span className={`ts-avatar ts-avatar-${tone} ts-avatar-${size}`}>
      {profile.photoUrl ? (
        <img src={profile.photoUrl} alt={profile.name} draggable={false} />
      ) : (
        <span className="ts-avatar-initials">{profile.initials}</span>
      )}
    </span>
  );
}

function FloatLabelView({ label }: { label: FloatLabel }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${label.x}px`;
    el.style.top = `${label.y}px`;
  }, [label.x, label.y]);

  return (
    <span ref={ref} className={`ts-float q-${label.kind}`}>
      {label.text}
    </span>
  );
}

const STYLES = `
.ts-root{
  position:relative; width:100%; box-sizing:border-box;
  display:flex; flex-direction:column; overflow:hidden;
  touch-action:none; overscroll-behavior:none;
  background:transparent; color:#eaf0f7;
  font-family:'Supercell','Supercell-Magic','SupercellMagic',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  font-synthesis:none; -webkit-tap-highlight-color:transparent; user-select:none;
  padding:2px 10px calc(env(safe-area-inset-bottom,0px) + 6px);
}
.ts-root *{ box-sizing:border-box; }

/* HUD */
.ts-hud{
  position:relative; z-index:8;
  display:flex; align-items:stretch; gap:7px;
  height:56px; flex:0 0 auto; padding:6px 8px;
  border-radius:17px;
  background:linear-gradient(180deg,rgba(20,22,30,.94),rgba(9,10,15,.94));
  border:1px solid rgba(255,255,255,.07);
  box-shadow:0 7px 24px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.055);
}
.ts-hud-side{
  flex:1 1 0; min-width:0; display:flex; align-items:center;
  gap:7px; justify-content:flex-start; overflow:visible;
}
.ts-right{ justify-content:flex-end; text-align:right; }
.ts-hud-copy{
  min-width:0; display:flex; flex-direction:column; justify-content:center;
  gap:0; overflow:visible;
}
.ts-hud-copy-right{ align-items:flex-end; }
.ts-hud-name{
  display:block; max-width:84px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:7.5px; line-height:1.45; padding:.12em 0 .16em;
  letter-spacing:.45px; color:#8f9caf;
}
.ts-hud-score-row{ display:flex; align-items:center; gap:5px; min-height:22px; overflow:visible; }
.ts-hud-score-row-right{ justify-content:flex-end; }
.ts-hud-score{
  display:block; font-size:16px; line-height:1.32; padding:.04em 0 .1em;
  font-variant-numeric:tabular-nums; color:#f4f7fb;
}
.ts-rival-score{ color:#ffb45c; }
.ts-avatar{
  flex:none; border-radius:999px; display:grid; place-items:center; overflow:hidden;
  color:#080a0f; border:1px solid rgba(255,255,255,.17);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 8px 18px rgba(0,0,0,.27);
}
.ts-avatar img{ width:100%; height:100%; display:block; object-fit:cover; }
.ts-avatar-initials{
  display:block; line-height:1.35; padding-top:.14em; font-size:9px;
  letter-spacing:.2px; text-transform:uppercase;
}
.ts-avatar-small{ width:34px; height:34px; }
.ts-avatar-medium{ width:66px; height:66px; }
.ts-avatar-large{ width:76px; height:76px; }
.ts-avatar-winner{ width:94px; height:94px; }
.ts-avatar-you{ background:linear-gradient(180deg,#73c5ff,#2f8cff); }
.ts-avatar-rival{ background:linear-gradient(180deg,#ffd27d,#ff8f2d); }
.ts-avatar-neutral{ background:linear-gradient(180deg,#2c313d,#171a22); color:#dce5f2; }
.ts-avatar-winner{
  background:linear-gradient(180deg,#ffd982,#ff962e); color:#160e03;
  border:2px solid rgba(255,210,120,.82);
  box-shadow:0 0 0 7px rgba(255,156,53,.08),0 16px 48px rgba(255,143,45,.24),inset 0 1px 0 rgba(255,255,255,.4);
}
.ts-combo,.ts-chip{
  display:block; flex:none; border-radius:8px;
  font-size:7px; line-height:1.42; padding:.22em 5px .28em;
  letter-spacing:.3px; white-space:nowrap; overflow:visible;
}
.ts-hud-center{
  flex:0 0 90px; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:4px; overflow:visible;
}
.ts-timer{
  display:block; font-size:17px; line-height:1.34; padding:.03em 0 .1em;
  font-variant-numeric:tabular-nums; color:#e7eef8;
}
.ts-bar{ width:82px; height:4px; border-radius:3px; background:rgba(255,255,255,.08); overflow:hidden; }
.ts-bar-fill{ height:100%; border-radius:3px; background:linear-gradient(90deg,#2f8cff,#66c6ff); transition:width .25s linear; }

.q-PERFECT{ color:#0b0c10; background:linear-gradient(180deg,#ffd77f,#ff922f); }
.q-GREAT{ color:#08101a; background:linear-gradient(180deg,#73c5ff,#2f8cff); }
.q-GOOD{ color:#d8e1ee; background:rgba(255,255,255,.11); }
.q-MISS{ color:#ffd1d8; background:rgba(255,80,100,.22); }
.q-COMBO{ color:#0b0c10; background:linear-gradient(180deg,#ffd77f,#ff922f); }

/* Stage. Geometry and canvas sizing intentionally remain unchanged. */
.ts-stage{
  position:relative; flex:1 1 auto; margin-top:5px; min-height:0;
  border-radius:20px; overflow:hidden; isolation:isolate;
  border:1px solid rgba(255,255,255,.06);
  background:
    radial-gradient(120% 70% at 50% 100%,rgba(47,140,255,.10),rgba(47,140,255,0) 60%),
    radial-gradient(140% 90% at 50% 8%,rgba(255,143,45,.06),rgba(255,143,45,0) 55%),
    linear-gradient(180deg,#0d0d12 0%,#09090d 55%,#050507 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -40px 60px rgba(0,0,0,.5);
}
.ts-stage::before{
  content:''; position:absolute; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(ellipse at 50% 78%,rgba(47,140,255,.18),rgba(47,140,255,.035) 34%,transparent 58%),
    linear-gradient(90deg,transparent 0 17%,rgba(91,183,255,.055) 17.4%,transparent 18%,transparent 82%,rgba(255,143,45,.05) 82.6%,transparent 83%),
    repeating-linear-gradient(0deg,transparent 0 29px,rgba(255,255,255,.024) 30px,transparent 31px),
    repeating-linear-gradient(90deg,transparent 0 39px,rgba(255,255,255,.018) 40px,transparent 41px);
  opacity:.72;
  mask-image:linear-gradient(180deg,transparent 0%,black 16%,black 88%,transparent 100%);
  -webkit-mask-image:linear-gradient(180deg,transparent 0%,black 16%,black 88%,transparent 100%);
}
.ts-stage::after{
  content:''; position:absolute; left:50%; bottom:6%; z-index:0; pointer-events:none;
  width:min(72%,270px); height:42%; transform:translateX(-50%);
  background:radial-gradient(ellipse at 50% 100%,rgba(255,143,45,.13),transparent 58%),linear-gradient(90deg,transparent,rgba(91,183,255,.08),transparent);
  filter:blur(.2px); opacity:.9;
}
.ts-canvas{ position:absolute; inset:0; z-index:1; width:100%; height:100%; display:block; }
.ts-fx{ position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
.ts-float{
  position:absolute; transform:translate(-50%,-50%); white-space:nowrap;
  font-size:15px; line-height:1.38; letter-spacing:.5px; padding:.2em 8px .3em;
  border-radius:9px; text-shadow:0 2px 6px rgba(0,0,0,.5);
  animation:tsFloat .9s ease-out forwards;
}
@keyframes tsFloat{
  0%{ opacity:0; transform:translate(-50%,-30%) scale(.7); }
  18%{ opacity:1; transform:translate(-50%,-60%) scale(1.06); }
  100%{ opacity:0; transform:translate(-50%,-150%) scale(1); }
}

/* Shared overlays */
.ts-overlay{
  position:absolute; inset:0; z-index:5; display:flex; align-items:center; justify-content:center;
  padding:18px; overflow:visible;
  background:radial-gradient(120% 100% at 50% 50%,rgba(5,5,7,.35),rgba(5,5,7,.72));
  backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);
}
.ts-panel{
  width:100%; max-width:334px; padding:23px 20px 21px; border-radius:24px; text-align:center;
  background:linear-gradient(180deg,rgba(22,24,32,.97),rgba(10,11,16,.98));
  border:1px solid rgba(255,255,255,.09);
  box-shadow:0 25px 70px rgba(0,0,0,.64),inset 0 1px 0 rgba(255,255,255,.07);
  overflow:visible;
}
.ts-kicker,.ts-result-kicker{
  display:block; font-size:8px; line-height:1.55; padding:.13em 0 .2em;
  letter-spacing:1.6px; color:#66bdff;
}
.ts-title{
  margin:5px 0 9px; padding:.13em 5px .22em; overflow:visible;
  font-size:25px; line-height:1.32; letter-spacing:.2px;
  background:linear-gradient(180deg,#fff,#a9bfd7); -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 0 26px rgba(47,140,255,.22);
}
.ts-sub{
  margin:0; padding:.08em 0 .16em; font-size:10px; line-height:1.6;
  color:#96a3b5;
}
.ts-btn{
  width:100%; border:none; cursor:pointer; color:#fff; font-family:inherit;
  font-size:12px; line-height:1.5; letter-spacing:.7px; padding:12px 16px 13px;
  border-radius:14px; margin-top:10px; overflow:visible;
}
.ts-btn-go{ color:#1a1205; background:linear-gradient(180deg,#ffd47a,#ff922f); box-shadow:0 10px 24px rgba(255,143,45,.32),inset 0 1px 0 rgba(255,255,255,.4); }
.ts-btn-go:active{ transform:translateY(1px); }
.ts-btn-ghost{ background:rgba(255,255,255,.05); color:#c4cedd; border:1px solid rgba(255,255,255,.08); }

/* Automatic matchmaking state */
.ts-wait-panel{ max-width:318px; }
.ts-wait-icon{
  position:relative; width:72px; height:66px; margin:0 auto 8px;
  filter:drop-shadow(0 13px 24px rgba(47,140,255,.22));
}
.ts-wait-icon span{
  position:absolute; left:50%; height:16px; border-radius:5px;
  background:linear-gradient(180deg,#353b49,#181b23); border:1px solid rgba(255,255,255,.13);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
  animation:tsBuild 1.25s ease-in-out infinite;
}
.ts-wait-icon span:nth-child(1){ width:66px; bottom:0; transform:translateX(-50%); }
.ts-wait-icon span:nth-child(2){ width:52px; bottom:18px; transform:translateX(-50%); animation-delay:.12s; }
.ts-wait-icon span:nth-child(3){ width:38px; bottom:36px; transform:translateX(-50%); animation-delay:.24s; background:linear-gradient(180deg,#68c4ff,#2f8cff); }
@keyframes tsBuild{ 0%,100%{ transform:translateX(-50%) translateY(0); } 50%{ transform:translateX(-50%) translateY(-3px); } }
.ts-sync-line{
  width:max-content; max-width:100%; margin:14px auto 0; display:flex; align-items:center; justify-content:center; gap:7px;
  border:1px solid rgba(91,183,255,.16); background:rgba(47,140,255,.08);
  border-radius:999px; padding:7px 11px 8px;
  font-size:7px; line-height:1.5; letter-spacing:1.2px; color:#8ecfff;
}
.ts-sync-dot{ width:6px; height:6px; border-radius:50%; background:#66c6ff; box-shadow:0 0 0 0 rgba(102,198,255,.45); animation:tsPulse 1.25s infinite; }
@keyframes tsPulse{ 0%{ box-shadow:0 0 0 0 rgba(102,198,255,.5); } 70%{ box-shadow:0 0 0 8px rgba(102,198,255,0); } 100%{ box-shadow:0 0 0 0 rgba(102,198,255,0); } }
.ts-error-text,.ts-count-error{
  margin-top:10px; font-size:8px; line-height:1.55; padding:.12em 0 .2em; color:#ff9cac;
}

/* Three-second countdown */
.ts-countdown{
  flex-direction:column; background:radial-gradient(circle at 50% 46%,rgba(47,140,255,.14),rgba(5,5,7,.74) 58%);
  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
}
.ts-count-content{ position:relative; width:180px; height:180px; display:grid; place-items:center; overflow:visible; animation:tsCountEnter .78s ease-out both; }
.ts-count-ring{
  position:absolute; inset:14px; border-radius:50%;
  border:2px solid rgba(91,183,255,.34); border-top-color:#ffd074; border-right-color:#ff9430;
  box-shadow:0 0 34px rgba(47,140,255,.2),inset 0 0 35px rgba(47,140,255,.07);
  animation:tsRing .9s cubic-bezier(.3,.7,.25,1) both;
}
.ts-count-ring::before,.ts-count-ring::after{ content:''; position:absolute; border-radius:50%; border:1px solid rgba(255,255,255,.07); }
.ts-count-ring::before{ inset:11px; }
.ts-count-ring::after{ inset:-10px; border-color:rgba(255,143,45,.08); }
.ts-count-num{
  position:relative; z-index:1; display:block; min-width:130px; text-align:center;
  font-size:88px; line-height:1.25; padding:.07em 0 .18em; color:#fff;
  text-shadow:0 0 34px rgba(47,140,255,.65),0 0 60px rgba(255,143,45,.3);
}
.ts-count-label{
  position:absolute; z-index:2; left:0; right:0; bottom:-8px; text-align:center;
  font-size:9px; line-height:1.55; padding:.12em 0 .2em; letter-spacing:2px; color:#9fb3ca;
}
@keyframes tsCountEnter{ 0%{ opacity:0; transform:scale(1.55); } 28%{ opacity:1; transform:scale(.96); } 60%{ transform:scale(1.03); } 100%{ opacity:1; transform:scale(1); } }
@keyframes tsRing{ from{ transform:rotate(-95deg) scale(.72); opacity:0; } to{ transform:rotate(255deg) scale(1); opacity:1; } }

/* Result modal */
.ts-result-overlay{
  z-index:10; padding:12px; background:rgba(2,3,5,.76);
  backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px);
}
.ts-result-panel{
  position:relative; width:100%; max-width:350px; max-height:calc(100% - 4px); overflow:hidden;
  border-radius:30px; background:rgba(12,15,22,.97); border:1px solid rgba(255,255,255,.1);
  box-shadow:0 32px 105px rgba(0,0,0,.76),inset 0 1px 0 rgba(255,255,255,.07);
}
.ts-result-glow{ position:absolute; left:-10%; right:-10%; top:-35px; height:150px; filter:blur(27px); opacity:.55; pointer-events:none; }
.ts-result-glow.r-VICTORY{ background:rgba(255,151,45,.30); }
.ts-result-glow.r-DEFEAT{ background:rgba(255,78,100,.23); }
.ts-result-glow.r-DRAW{ background:rgba(103,180,255,.2); }
.ts-result-content{ position:relative; padding:22px 18px 18px; text-align:center; overflow:visible; }
.ts-result-kicker{ color:rgba(255,255,255,.38); letter-spacing:1.4px; }
.ts-result-title{
  margin:2px 0 0; padding:.12em 4px .24em; overflow:visible;
  font-size:27px; line-height:1.35; letter-spacing:-.2px;
}
.ts-result-title.r-VICTORY{ color:#ffb85d; text-shadow:0 0 30px rgba(255,143,45,.28); }
.ts-result-title.r-DEFEAT{ color:#ff7084; text-shadow:0 0 28px rgba(255,84,108,.2); }
.ts-result-title.r-DRAW{ color:#dbe8f6; }
.ts-winner-grid{ margin-top:10px; display:grid; grid-template-columns:1.2fr auto .88fr; align-items:end; gap:10px; }
.ts-draw-grid{ margin-top:13px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:10px; }
.ts-result-player{ min-width:0; display:flex; flex-direction:column; align-items:center; overflow:visible; }
.ts-result-winner{ position:relative; }
.ts-result-loser{ padding-bottom:4px; opacity:.72; }
.ts-winner-crown{
  margin-bottom:5px; border-radius:999px; padding:5px 8px 6px;
  background:rgba(255,157,52,.1); border:1px solid rgba(255,176,76,.19);
  font-size:6.5px; line-height:1.5; letter-spacing:1.15px; color:#ffc46f;
}
.ts-result-name{
  width:100%; margin-top:7px; padding:.12em 3px .2em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:8px; line-height:1.5; color:rgba(255,255,255,.65);
}
.ts-result-name-winner{ color:#ffc26b; }
.ts-result-name-muted{ color:rgba(255,255,255,.4); }
.ts-result-score{
  margin-top:1px; font-size:23px; line-height:1.36; padding:.04em 0 .13em;
  font-variant-numeric:tabular-nums; color:#fff;
}
.ts-result-score-winner{ font-size:29px; }
.ts-result-score-muted{ font-size:21px; color:rgba(255,255,255,.58); }
.ts-result-vs{ align-self:center; font-size:7px; line-height:1.5; padding:.12em 0 .2em; letter-spacing:1.1px; color:rgba(255,255,255,.23); }
.ts-result-divider{ height:1px; margin:15px 0; background:rgba(255,255,255,.07); }
.ts-reward-pill{
  width:max-content; margin:0 auto; display:flex; align-items:center; justify-content:center; gap:8px;
  border-radius:999px; border:1px solid rgba(255,255,255,.1); padding:7px 13px 8px;
}
.ts-reward-pill.is-win{ color:#ffbb61; background:rgba(255,154,48,.1); border-color:rgba(255,173,74,.2); }
.ts-reward-pill.is-loss{ color:#ff7588; background:rgba(255,85,110,.08); border-color:rgba(255,93,118,.16); }
.ts-reward-pill.is-draw{ color:#b6c9dc; background:rgba(255,255,255,.045); }
.ts-reward-value{ display:block; font-size:20px; line-height:1.35; padding:.02em 0 .1em; font-variant-numeric:tabular-nums; }
.ts-reward-pill img{ width:24px; height:24px; display:block; object-fit:contain; }
.ts-result-button{
  width:100%; min-height:56px; margin-top:15px; padding:7px 9px;
  display:grid; grid-template-columns:40px 1fr 40px; align-items:center;
  border-radius:18px; border:1px solid rgba(255,255,255,.11);
  background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.045));
  color:#fff; font-family:inherit; cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 16px 36px rgba(0,0,0,.3);
}
.ts-result-button > span:nth-child(2){ display:block; font-size:9px; line-height:1.55; padding:.12em 4px .2em; letter-spacing:1.1px; }
.ts-result-button-icon{
  width:38px; height:38px; display:grid; place-items:center; border-radius:13px;
  border:1px solid rgba(255,255,255,.1); background:rgba(0,0,0,.2);
  font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:20px; line-height:1; color:rgba(255,255,255,.74);
}
.ts-result-button-spacer{ width:38px; height:38px; }
.ts-result-button:active{ transform:translateY(1px) scale(.988); }

@media (max-width:360px){
  .ts-root{ padding-left:8px; padding-right:8px; }
  .ts-hud{ height:54px; gap:4px; padding:6px; }
  .ts-hud-center{ flex-basis:78px; }
  .ts-bar{ width:70px; }
  .ts-avatar-small{ width:30px; height:30px; }
  .ts-hud-side{ gap:5px; }
  .ts-hud-name{ max-width:62px; font-size:6.8px; }
  .ts-hud-score{ font-size:14px; }
  .ts-timer{ font-size:15px; }
  .ts-chip,.ts-combo{ font-size:6.2px; padding-left:4px; padding-right:4px; }
  .ts-title{ font-size:22px; }
  .ts-count-content{ width:164px; height:164px; }
  .ts-count-num{ font-size:78px; }
  .ts-result-content{ padding:19px 15px 15px; }
  .ts-result-title{ font-size:24px; }
  .ts-avatar-winner{ width:84px; height:84px; }
  .ts-avatar-large{ width:68px; height:68px; }
  .ts-avatar-medium{ width:59px; height:59px; }
  .ts-winner-grid,.ts-draw-grid{ gap:7px; }
}

@media (max-height:630px){
  .ts-result-content{ padding-top:16px; padding-bottom:14px; }
  .ts-result-title{ font-size:23px; }
  .ts-avatar-winner{ width:78px; height:78px; }
  .ts-avatar-large{ width:64px; height:64px; }
  .ts-avatar-medium{ width:55px; height:55px; }
  .ts-winner-grid,.ts-draw-grid{ margin-top:6px; }
  .ts-result-divider{ margin:10px 0; }
  .ts-result-button{ min-height:50px; margin-top:11px; }
}

@media (min-width:430px){
  .ts-root{ padding-left:12px; padding-right:12px; }
  .ts-stage{ border-radius:24px; }
}

@media (prefers-reduced-motion:reduce){
  .ts-float,.ts-count-content,.ts-count-ring,.ts-wait-icon span,.ts-sync-dot,.ts-bar-fill{
    animation:none !important; transition:none !important;
  }
}
`;
export default TowerStackGame;
