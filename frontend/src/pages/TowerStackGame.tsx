import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  towerStackWsApi,
  type TowerStackPlayerState,
  type TowerStackSocketClient,
  type TowerStackStateMessage,
} from '../api/towerStackWs';

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
  ) {
    this.worldScale = this.cssW / Math.max(1, worldWidth);
    this.baseWidth = Math.max(MIN_WIDTH * this.worldScale, serverBaseWidth * this.worldScale);
    this.blocks = [];
    this.dust = [];
    this.slabs = [];
    this.flash = 0;
    this.combo = 0;
    this.cameraY = 0;
    this.cameraTarget = 0;
    this.speed = BASE_SPEED * this.worldScale;
    this.spawnActive(this.baseWidth);

    if (activeStartMs > 0 && estimatedServerNowMs > 0) {
      this.alignActive(
        this.baseWidth,
        activeStartMs,
        true,
        BASE_SPEED,
        estimatedServerNowMs,
      );
    }

    this.running = true;
    this.last = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  reconcileFromServer(
    player: TowerStackPlayerState,
    worldWidth: number,
    serverBaseWidth: number,
    estimatedServerNowMs: number,
  ) {
    if (this.cssW <= 0 || worldWidth <= 0) return;

    const scale = this.cssW / worldWidth;
    this.worldScale = scale;
    this.baseWidth = Math.max(MIN_WIDTH * scale, serverBaseWidth * scale);

    const serverBlocks = player.blocks.map((block) => ({
      left: block.left * scale,
      width: block.width * scale,
      level: block.level,
      perfect: block.perfect,
    }));

    const geometryMismatch =
      serverBlocks.length !== this.blocks.length ||
      serverBlocks.some((block, index) => {
        const local = this.blocks[index];
        return (
          !local ||
          Math.abs(local.left - block.left) > 1.25 ||
          Math.abs(local.width - block.width) > 1.25 ||
          local.perfect !== block.perfect
        );
      });

    if (geometryMismatch) {
      this.blocks = serverBlocks;
    }

    this.combo = player.combo;
    this.speed = Math.max(0, player.active_speed * scale);

    if (player.active_width <= 0 || player.active_start_ms <= 0) return;

    this.alignActive(
      player.active_width * scale,
      player.active_start_ms,
      player.active_from_left,
      player.active_speed,
      estimatedServerNowMs,
    );
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
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    const a = this.active;
    if (a) {
      a.x += a.dir * this.speed * dt;
      const pad = PAD * this.worldScale;
      const minX = pad;
      const maxX = this.cssW - a.w - pad;
      if (a.x <= minX) {
        a.x = minX;
        a.dir = 1;
      } else if (a.x >= maxX) {
        a.x = maxX;
        a.dir = -1;
      }
    }

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
    const minX = pad;
    const maxX = this.cssW - width - pad;
    const travel = Math.max(0, maxX - minX);

    if (travel <= 0) {
      this.active = { x: minX, w: width, dir: 1 };
      return;
    }

    const elapsedSeconds = Math.max(0, (estimatedServerNowMs - activeStartMs) / 1000);
    const distance = elapsedSeconds * speedWorld * this.worldScale;
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

    if (!fromLeft) {
      x = minX + maxX - x;
      direction *= -1;
    }

    this.active = { x, w: width, dir: direction };
  }

  private spawnActive(width: number) {
    const pad = PAD * this.worldScale;
    const w = Math.min(width, this.cssW - 2 * pad);
    const fromLeft = this.blocks.length % 2 === 0;
    this.active = {
      x: fromLeft ? pad : this.cssW - w - pad,
      w,
      dir: fromLeft ? 1 : -1,
    };
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
};

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
  const [readySent, setReadySent] = useState(false);
  const [serverState, setServerState] = useState<TowerStackStateMessage | null>(null);

  const myUserId = user?.id || 0;
  const myServerPlayer = myUserId
    ? serverState?.players[String(myUserId)]
    : undefined;

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
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => setConnectionStatus('closed'),
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
    if (phase === 'playing' && serverState) {
      const estimatedServerNow = Date.now() - serverOffsetRef.current;
      engineRef.current?.start(
        serverState.world_width,
        serverState.base_width,
        serverState.start_at_ms,
        estimatedServerNow,
      );
      return () => engineRef.current?.stop();
    }

    engineRef.current?.stop();
  }, [
    phase,
    serverState?.base_width,
    serverState?.start_at_ms,
    serverState?.world_width,
  ]);

  useEffect(() => {
    if (!myServerPlayer || !serverState || phase !== 'playing') return;

    const acknowledgedSeq = myServerPlayer.last_result?.seq || myServerPlayer.last_seq || 0;
    if (acknowledgedSeq <= 0 && myServerPlayer.blocks.length === 0) return;

    const estimatedServerNow = Date.now() - serverOffsetRef.current;
    engineRef.current?.reconcileFromServer(
      myServerPlayer,
      serverState.world_width,
      serverState.base_width,
      estimatedServerNow,
    );
  }, [
    myServerPlayer?.last_result?.seq,
    myServerPlayer?.last_seq,
    phase,
    serverState?.base_width,
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
    getTelegram()?.HapticFeedback?.notificationOccurred?.(
      nextOutcome === 'VICTORY' ? 'success' : nextOutcome === 'DEFEAT' ? 'error' : 'warning',
    );
    void refreshBalance();
    void refreshProfile();
    const timer = window.setTimeout(() => navigate(lobbiesPath, { replace: true }), 3400);
    return () => window.clearTimeout(timer);
  }, [lobbiesPath, myUserId, navigate, refreshBalance, refreshProfile, serverState]);

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

  const startDuel = useCallback(() => {
    if (connectionStatus !== 'open') {
      setSocketError('Нет подключения к игре');
      return;
    }
    if (socketRef.current?.ready()) {
      setReadySent(true);
      setSocketError(null);
      setPlayerScore(0);
      setRivalScore(0);
      setCombo(0);
      setRivalQuality(null);
      setLabels([]);
      setOutcome(null);
      setTimeLeft(ROUND_SECONDS);
      dropSeqRef.current = 0;
      lastMyResultSeqRef.current = 0;
      authoritativeScoreRef.current = 0;
      authoritativeComboRef.current = 0;
      pendingDropsRef.current.clear();
    }
  }, [connectionStatus]);

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
          <span className="ts-avatar ts-avatar-you" aria-hidden>Y</span>
          <div className="ts-hud-copy">
            <span className="ts-hud-cap">YOU</span>
            <span className="ts-hud-score">{playerScore}</span>
            {combo >= 2 && <span className="ts-combo">x{combo}</span>}
          </div>
        </div>
        <div className="ts-hud-center">
          <span className="ts-timer">{timeStr}</span>
          <div className="ts-bar"><div ref={barFillRef} className="ts-bar-fill" /></div>
        </div>
        <div className="ts-hud-side ts-right">
          <div className="ts-hud-copy">
            <span className="ts-hud-cap">RIVAL</span>
            <span className="ts-hud-score">{rivalScore}</span>
            {rivalQuality && <span className={`ts-chip q-${rivalQuality}`}>{rivalQuality}</span>}
          </div>
          <span className="ts-avatar ts-avatar-rival" aria-hidden>R</span>
        </div>
      </div>

      <div className="ts-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
        <canvas ref={canvasRef} className="ts-canvas" />
        <div className="ts-fx">
          {labels.map((label) => <FloatLabelView key={label.id} label={label} />)}
        </div>

        {phase === 'ready' && (
          <div className="ts-overlay">
            <div className="ts-panel">
              <div className="ts-kicker">1 v 1 DUEL</div>
              <h1 className="ts-title">TOWER STACK</h1>
              <p className="ts-sub">
                Tap to drop each slab. Stack clean for PERFECT hits, chain combos, and out-score
                your rival before the clock runs out.
              </p>
              <button
                className="ts-btn ts-btn-go"
                onClick={startDuel}
                disabled={readySent || connectionStatus !== 'open'}
              >
                {connectionStatus !== 'open'
                  ? 'CONNECTING...'
                  : readySent
                    ? 'WAITING FOR RIVAL...'
                    : 'START DUEL'}
              </button>
              {socketError && <div className="ts-kicker">{socketError}</div>}
              {onExit && (
                <button className="ts-btn ts-btn-ghost" onClick={onExit}>
                  EXIT
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'countdown' && (
          <div className="ts-overlay ts-countdown">
            <div className="ts-count-num" key={countdown}>{countdown}</div>
            {connectionStatus !== 'open' && (
              <div className="ts-kicker">{socketError || 'CONNECTING'}</div>
            )}
          </div>
        )}

        {phase === 'result' && (
          <div className="ts-overlay">
            <div className="ts-panel">
              <div className={`ts-result-tag r-${outcome ?? 'DRAW'}`}>{outcome}</div>
              <div className="ts-scores">
                <div className="ts-score-col"><span className="ts-hud-cap">YOU</span><span className="ts-big">{playerScore}</span></div>
                <span className="ts-vs">VS</span>
                <div className="ts-score-col"><span className="ts-hud-cap">RIVAL</span><span className="ts-big">{rivalScore}</span></div>
              </div>
              <button className="ts-btn ts-btn-go" onClick={leave}>В ЛОББИ</button>
            </div>
          </div>
        )}
      </div>
    </div>
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
  position:relative; width:100%;
  box-sizing:border-box;
  display:flex; flex-direction:column;
  overflow:hidden; touch-action:none; overscroll-behavior:none;
  background:transparent; color:#eaf0f7;
  font-family:'Supercell','Supercell-Magic','SupercellMagic',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  -webkit-tap-highlight-color:transparent; user-select:none;
  padding: 2px 10px calc(env(safe-area-inset-bottom,0px) + 6px);
}
.ts-root *{ box-sizing:border-box; }

/* HUD */
.ts-hud{
  display:flex; align-items:stretch; gap:8px;
  height:50px; flex:0 0 auto; padding:6px 8px;
  border-radius:16px;
  background:linear-gradient(180deg,rgba(20,22,30,0.92),rgba(10,11,16,0.92));
  border:1px solid rgba(255,255,255,0.06);
  box-shadow:0 6px 22px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
}
.ts-hud-side{ flex:1 1 0; min-width:0; display:flex; align-items:center; gap:7px; justify-content:flex-start; }
.ts-right{ justify-content:flex-end; text-align:right; }
.ts-hud-copy{ min-width:0; display:flex; flex-direction:column; justify-content:center; gap:1px; overflow:hidden; }
.ts-avatar{
  width:28px; height:28px; flex:0 0 28px; border-radius:999px;
  display:flex; align-items:center; justify-content:center;
  font-size:9px; line-height:1; color:#0b0c10;
  border:1px solid rgba(255,255,255,0.16);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 16px rgba(0,0,0,0.24);
}
.ts-avatar-you{ background:linear-gradient(180deg,#5bb7ff,#2f8cff); }
.ts-avatar-rival{ background:linear-gradient(180deg,#ffc96a,#ff8f2d); }
.ts-hud-cap{ font-size:7.5px; line-height:1; letter-spacing:1.1px; color:#7e8aa0; }
.ts-hud-score{ font-size:15px; line-height:1.12; font-variant-numeric:tabular-nums; color:#f4f7fb; }
.ts-right .ts-hud-score{ color:#ffb45c; }
.ts-combo{
  margin-top:1px; align-self:flex-start; font-size:8px; padding:1px 5px; border-radius:8px;
  color:#0b0c10; background:linear-gradient(180deg,#ffc96a,#ff8f2d); font-variant-numeric:tabular-nums;
}
.ts-hud-center{ flex:0 0 96px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; }
.ts-timer{ font-size:17px; line-height:1; font-variant-numeric:tabular-nums; color:#dfe8f3; }
.ts-bar{ width:84px; height:4px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden; }
.ts-bar-fill{ height:100%; border-radius:3px; background:linear-gradient(90deg,#2f8cff,#5bb7ff); transition:width .25s linear; }
.ts-chip{ margin-top:1px; font-size:7.5px; padding:1px 5px; border-radius:7px; letter-spacing:.35px; max-width:64px; overflow:hidden; text-overflow:ellipsis; }

.q-PERFECT{ color:#0b0c10; background:linear-gradient(180deg,#ffc96a,#ff8f2d); }
.q-GREAT{ color:#0b0c10; background:linear-gradient(180deg,#5bb7ff,#2f8cff); }
.q-GOOD{ color:#cdd7e6; background:rgba(255,255,255,0.10); }
.q-MISS{ color:#ffd0d0; background:rgba(255,80,80,0.22); }
.q-COMBO{ color:#0b0c10; background:linear-gradient(180deg,#ffc96a,#ff8f2d); }

/* Stage */
.ts-stage{
  position:relative; flex:1 1 auto; margin-top:5px; min-height:0;
  border-radius:20px; overflow:hidden; isolation:isolate;
  border:1px solid rgba(255,255,255,0.06);
  background:
    radial-gradient(120% 70% at 50% 100%, rgba(47,140,255,0.10), rgba(47,140,255,0) 60%),
    radial-gradient(140% 90% at 50% 8%, rgba(255,143,45,0.06), rgba(255,143,45,0) 55%),
    linear-gradient(180deg,#0d0d12 0%,#09090d 55%,#050507 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -40px 60px rgba(0,0,0,0.5);
}
.ts-stage::before{
  content:''; position:absolute; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(ellipse at 50% 78%, rgba(47,140,255,0.18), rgba(47,140,255,0.035) 34%, transparent 58%),
    linear-gradient(90deg, transparent 0 17%, rgba(91,183,255,0.055) 17.4%, transparent 18%, transparent 82%, rgba(255,143,45,0.05) 82.6%, transparent 83%),
    repeating-linear-gradient(0deg, transparent 0 29px, rgba(255,255,255,0.024) 30px, transparent 31px),
    repeating-linear-gradient(90deg, transparent 0 39px, rgba(255,255,255,0.018) 40px, transparent 41px);
  opacity:.72;
  mask-image:linear-gradient(180deg, transparent 0%, black 16%, black 88%, transparent 100%);
  -webkit-mask-image:linear-gradient(180deg, transparent 0%, black 16%, black 88%, transparent 100%);
}
.ts-stage::after{
  content:''; position:absolute; left:50%; bottom:6%; z-index:0; pointer-events:none;
  width:min(72%, 270px); height:42%; transform:translateX(-50%);
  background:
    radial-gradient(ellipse at 50% 100%, rgba(255,143,45,0.13), transparent 58%),
    linear-gradient(90deg, transparent, rgba(91,183,255,0.08), transparent);
  filter:blur(.2px);
  opacity:.9;
}
.ts-canvas{ position:absolute; inset:0; z-index:1; width:100%; height:100%; display:block; }
.ts-fx{ position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }

.ts-float{
  position:absolute; transform:translate(-50%,-50%);
  font-size:15px; letter-spacing:.5px; white-space:nowrap;
  padding:2px 8px; border-radius:9px;
  text-shadow:0 2px 6px rgba(0,0,0,0.5);
  animation:tsFloat .9s ease-out forwards;
}
@keyframes tsFloat{
  0%{ opacity:0; transform:translate(-50%,-30%) scale(.7); }
  18%{ opacity:1; transform:translate(-50%,-60%) scale(1.06); }
  100%{ opacity:0; transform:translate(-50%,-150%) scale(1); }
}

/* Overlays */
.ts-overlay{
  position:absolute; inset:0; z-index:5;
  display:flex; align-items:center; justify-content:center; padding:18px;
  background:radial-gradient(120% 100% at 50% 50%, rgba(5,5,7,0.35), rgba(5,5,7,0.72));
  backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);
}
.ts-panel{
  width:100%; max-width:330px; padding:22px 20px 20px;
  border-radius:22px; text-align:center;
  background:linear-gradient(180deg,rgba(22,24,32,0.96),rgba(11,12,17,0.97));
  border:1px solid rgba(255,255,255,0.08);
  box-shadow:0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
}
.ts-kicker{ font-size:11px; letter-spacing:3px; color:#5bb7ff; margin-bottom:6px; }
.ts-title{
  margin:0 0 10px; font-size:34px; line-height:1; letter-spacing:1px;
  background:linear-gradient(180deg,#ffffff,#9fb6cf);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 0 26px rgba(47,140,255,0.25);
}
.ts-sub{ margin:0 0 18px; font-size:12.5px; line-height:1.5; color:#9aa6ba; }

.ts-btn{
  width:100%; border:none; cursor:pointer; color:#fff; font-family:inherit;
  font-size:15px; letter-spacing:1px; padding:13px 16px; border-radius:14px; margin-top:9px;
  -webkit-tap-highlight-color:transparent;
}
.ts-btn-go{
  color:#1a1205; background:linear-gradient(180deg,#ffc96a,#ff8f2d);
  box-shadow:0 10px 24px rgba(255,143,45,0.32), inset 0 1px 0 rgba(255,255,255,0.4);
}
.ts-btn-go:active{ transform:translateY(1px); }
.ts-btn-ghost{
  background:rgba(255,255,255,0.05); color:#c4cedd;
  border:1px solid rgba(255,255,255,0.08);
}

/* Countdown */
.ts-countdown{ background:radial-gradient(120% 100% at 50% 50%, rgba(5,5,7,0.30), rgba(5,5,7,0.6)); }
.ts-count-num{
  font-size:120px; line-height:1; color:#fff;
  text-shadow:0 0 40px rgba(47,140,255,0.6), 0 0 70px rgba(255,143,45,0.35);
  animation:tsCount .8s ease-out;
}
@keyframes tsCount{
  0%{ opacity:0; transform:scale(1.7); }
  25%{ opacity:1; transform:scale(1); }
  100%{ opacity:0; transform:scale(.85); }
}

/* Result */
.ts-result-tag{ font-size:30px; letter-spacing:2px; margin-bottom:16px; }
.r-VICTORY{ color:#ffc96a; text-shadow:0 0 26px rgba(255,143,45,0.45); }
.r-DEFEAT{ color:#8aa0ba; }
.r-DRAW{ color:#cdd7e6; }
.ts-scores{ display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:18px; }
.ts-score-col{ display:flex; flex-direction:column; gap:4px; min-width:78px; }
.ts-big{ font-size:34px; line-height:1; font-variant-numeric:tabular-nums; color:#f4f7fb; }
.ts-score-col:last-of-type .ts-big{ color:#ffb45c; }
.ts-vs{ font-size:13px; color:#6f7c92; letter-spacing:1px; }

@media (max-width:360px){
  .ts-root{ padding-left:8px; padding-right:8px; }
  .ts-hud{ height:48px; gap:5px; padding:6px 7px; }
  .ts-hud-center{ flex-basis:84px; }
  .ts-bar{ width:74px; }
  .ts-avatar{ width:25px; height:25px; flex-basis:25px; font-size:8px; }
  .ts-hud-side{ gap:5px; }
  .ts-hud-score{ font-size:13px; }
  .ts-timer{ font-size:15px; }
  .ts-hud-cap{ font-size:7px; letter-spacing:.9px; }
  .ts-chip,.ts-combo{ font-size:7px; padding:1px 4px; }
  .ts-title{ font-size:29px; }
  .ts-sub{ font-size:12px; }
  .ts-count-num{ font-size:100px; }
  .ts-big{ font-size:28px; }
}

@media (min-width:430px){
  .ts-root{ padding-left:12px; padding-right:12px; }
  .ts-stage{ border-radius:24px; }
}

@media (prefers-reduced-motion:reduce){
  .ts-float,
  .ts-count-num,
  .ts-bar-fill{
    animation:none !important;
    transition:none !important;
  }
}
`;

export default TowerStackGame;