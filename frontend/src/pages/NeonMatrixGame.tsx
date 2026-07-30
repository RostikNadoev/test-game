import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  neonMatrixWsApi,
  type NeonMatrixSocketClient,
  type NeonMatrixStateMessage,
} from '../api/neonMatrixWs';
import type { LobbyPlayerInfo } from '../api';
import { useAuth } from '../auth/useAuth';
import coinIcon from '../assets/solo/scratch/icon-coin.webp';

type Side = 'me' | 'opponent';
type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

type PlayerProfile = {
  id: number;
  name: string;
  photoUrl: string;
  initials: string;
};

type LocalOutcome = {
  target: number;
  mePick: number | null;
  opponentPick: number | null;
  mePicked: boolean;
  opponentPicked: boolean;
  meDistance: number;
  opponentDistance: number;
  damage: number;
  attacker: Side | null;
  defender: Side | null;
  draw: boolean;
};

type ArrowMotion = {
  mode: 'idle' | 'spinning' | 'landing';
  angle: number;
  velocity: number;
  lastAt: number;
  landingStartedAt: number;
  landingDuration: number;
  landingStartAngle: number;
  landingStartVelocity: number;
  landingDistance: number;
  landingTarget: number;
  landingRound: number;
};

type TelegramWebApp = {
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
};

const START_HP = 100;
const MIN_NUMBER = 1;
const MAX_NUMBER = 100;
const DEFAULT_NUMBER = 50;
const MIN_LANDING_MS = 480;
const SPIN_SPEED = 0.86;
const SPIN_ACCELERATION_MS = 280;
const PLAYERS_STORAGE_KEY = 'twingames_players_info';
const LEGACY_PLAYERS_STORAGE_KEY = 'twingames_blackjack_players_info';
const LABELS = [1, 25, 50, 75, 100] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

const numberToAngle = (value: number) =>
  ((clamp(value, MIN_NUMBER, MAX_NUMBER) - MIN_NUMBER) /
    (MAX_NUMBER - MIN_NUMBER)) *
  360;

const circularAngleDistance = (a: number, b: number) => {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, 360 - delta);
};

const cssVars = (values: Record<string, string | number>) =>
  values as React.CSSProperties;

const getInitials = (value: string) => {
  const initials = value
    .replace('@', '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return initials || 'TG';
};

const formatReward = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
    Math.max(0, value),
  );

const readStoredPlayersInfo = (): LobbyPlayerInfo[] => {
  if (typeof window === 'undefined') return [];

  const raw =
    window.sessionStorage.getItem(PLAYERS_STORAGE_KEY) ||
    window.sessionStorage.getItem(LEGACY_PLAYERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => ({
        id: Number(item.id),
        tg_user: typeof item.tg_user === 'string' ? item.tg_user : '',
        photo_url: typeof item.photo_url === 'string' ? item.photo_url : '',
      }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0);
  } catch {
    return [];
  }
};

const getTelegram = () =>
  (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

const vibrate = (pattern: number | number[]) => {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
};

const hapticSelect = () => {
  getTelegram()?.HapticFeedback?.selectionChanged?.();
};

const hapticImpact = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  getTelegram()?.HapticFeedback?.impactOccurred?.(style);
  if (style === 'heavy') vibrate([25, 18, 32]);
  else if (style === 'medium') vibrate(14);
  else vibrate(6);
};

const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  getTelegram()?.HapticFeedback?.notificationOccurred?.(type);
  if (type === 'error') vibrate([28, 22, 38]);
  else if (type === 'warning') vibrate([14, 16, 14]);
  else vibrate([10, 14, 10]);
};

const Avatar = memo(
  ({ profile, className = '' }: { profile: PlayerProfile; className?: string }) => (
    <div className={`nm-avatar ${className}`}>
      {profile.photoUrl ? (
        <img src={profile.photoUrl} alt={profile.name} draggable={false} />
      ) : (
        profile.initials
      )}
    </div>
  ),
);

const AnimatedHp = memo(({ value }: { value: number }) => {
  const valueRef = useRef<HTMLSpanElement | null>(null);
  const displayedRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const from = displayedRef.current;
    const to = value;
    if (from === to) {
      if (valueRef.current) valueRef.current.textContent = String(to);
      return;
    }

    const startedAt = performance.now();
    const duration = 720;

    const frame = (now: number) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = Math.round(from + (to - from) * eased);
      displayedRef.current = next;
      if (valueRef.current) valueRef.current.textContent = String(next);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(frame);
      } else {
        displayedRef.current = to;
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(frame);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  return <span ref={valueRef}>{value}</span>;
});

const PlayerHud = memo(
  ({
    side,
    profile,
    hp,
    hit,
    round,
    hudRef,
  }: {
    side: Side;
    profile: PlayerProfile;
    hp: number;
    hit: boolean;
    round: number;
    hudRef: React.RefObject<HTMLDivElement | null>;
  }) => {
    const percent = clamp((hp / START_HP) * 100, 0, 100);

    return (
      <div
        ref={hudRef}
        className={`nm-player-hud nm-player-hud-${side} ${hit ? 'nm-player-hit' : ''}`}
        data-round={round}
      >
        {side === 'me' && <Avatar profile={profile} />}

        <div className="nm-player-copy">
          <div className="nm-player-name">{profile.name}</div>
          <div className="nm-hp-row">
            <strong>
              <AnimatedHp value={hp} />
            </strong>
            <span>HP</span>
          </div>
          <div className="nm-hp-track">
            <i style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        </div>

        {side === 'opponent' && <Avatar profile={profile} />}
      </div>
    );
  },
);

const LiveTimer = memo(
  ({
    deadline,
    duration,
    serverOffset,
    round,
    active,
  }: {
    deadline?: number;
    duration: number;
    serverOffset: number;
    round: number;
    active: boolean;
  }) => {
    const [snapshot, setSnapshot] = useState(() => {
      const remaining = deadline
        ? Math.max(0, deadline - (Date.now() - serverOffset))
        : 0;
      return {
        seconds: deadline ? Math.max(0, Math.ceil(remaining / 1000)) : null,
        progress: deadline ? clamp(remaining / duration, 0, 1) : 0,
      };
    });

    useEffect(() => {
      const update = () => {
        const remaining = deadline
          ? Math.max(0, deadline - (Date.now() - serverOffset))
          : 0;
        setSnapshot({
          seconds: deadline ? Math.max(0, Math.ceil(remaining / 1000)) : null,
          progress: deadline ? clamp(remaining / duration, 0, 1) : 0,
        });
      };

      update();
      if (!deadline) return;
      const timer = window.setInterval(update, 100);
      return () => window.clearInterval(timer);
    }, [deadline, duration, serverOffset]);

    return (
      <div
        className={`nm-timer ${active ? 'nm-timer-active' : ''}`}
        style={cssVars({
          '--timer-progress': `${snapshot.progress * 360}deg`,
        })}
      >
        <div>
          <strong>{snapshot.seconds ?? '—'}</strong>
          <span>ROUND {round}</span>
        </div>
      </div>
    );
  },
);

const CountdownOverlay = memo(
  ({
    deadline,
    serverOffset,
    waiting = false,
  }: {
    deadline?: number;
    serverOffset: number;
    waiting?: boolean;
  }) => {
    const [seconds, setSeconds] = useState(3);

    useEffect(() => {
      if (waiting || !deadline) return;
      const update = () => {
        const remaining = Math.max(
          0,
          deadline - (Date.now() - serverOffset),
        );
        setSeconds(Math.max(1, Math.ceil(remaining / 1000)));
      };
      update();
      const timer = window.setInterval(update, 80);
      return () => window.clearInterval(timer);
    }, [deadline, serverOffset, waiting]);

    return (
      <div className="nm-overlay">
        <div className="nm-overlay-center">
          <div className="nm-countdown-ring">
            <strong>{waiting ? 'VS' : seconds}</strong>
          </div>
        </div>
        <div className="nm-overlay-copy">
          <h3>{waiting ? 'ЖДЁМ СОПЕРНИКА' : 'ПРИГОТОВЬСЯ'}</h3>
          <p>
            {waiting
              ? 'МАТЧ НАЧНЁТСЯ, КОГДА ПОДКЛЮЧАТСЯ ОБА ИГРОКА'
              : 'В КАЖДОМ РАУНДЕ НА ВЫБОР ЕСТЬ 5 СЕКУНД'}
          </p>
        </div>
      </div>
    );
  },
);

const WheelMarker = memo(
  ({
    value,
    profile,
    side,
    faded = false,
    shift = 0,
  }: {
    value: number;
    profile: PlayerProfile;
    side: Side;
    faded?: boolean;
    shift?: number;
  }) => (
    <div
      className={`nm-marker nm-marker-${side} ${faded ? 'nm-marker-faded' : ''}`}
      style={cssVars({
        '--marker-angle': `${numberToAngle(value)}deg`,
        '--marker-shift': `${shift}px`,
      })}
    >
      <div>
        <Avatar profile={profile} className="nm-wheel-avatar" />
      </div>
    </div>
  ),
);

const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const easeOutBack = (value: number) => {
  const t = clamp(value, 0, 1);
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const ResolutionAnimation = memo(
  ({
    pageRef,
    wheelRef,
    meHudRef,
    opponentHudRef,
    outcome,
    profiles,
    impactStartedAt,
    damageAt,
    serverOffset,
    round,
  }: {
    pageRef: React.RefObject<HTMLElement | null>;
    wheelRef: React.RefObject<HTMLDivElement | null>;
    meHudRef: React.RefObject<HTMLDivElement | null>;
    opponentHudRef: React.RefObject<HTMLDivElement | null>;
    outcome: LocalOutcome;
    profiles: Record<Side, PlayerProfile>;
    impactStartedAt: number;
    damageAt: number;
    serverOffset: number;
    round: number;
  }) => {
    const meDistanceRef = useRef<HTMLDivElement | null>(null);
    const opponentDistanceRef = useRef<HTMLDivElement | null>(null);
    const projectileRef = useRef<HTMLDivElement | null>(null);
    const burstRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const page = pageRef.current;
      const wheel = wheelRef.current;
      const meDistance = meDistanceRef.current;
      const opponentDistance = opponentDistanceRef.current;
      const projectile = projectileRef.current;
      const burst = burstRef.current;
      if (!page || !wheel || !meDistance || !opponentDistance) return;

      let frameId = 0;
      let pageRect = page.getBoundingClientRect();
      let wheelRect = wheel.getBoundingClientRect();

      const readRects = () => {
        pageRect = page.getBoundingClientRect();
        wheelRect = wheel.getBoundingClientRect();
      };

      const place = (
        node: HTMLElement,
        x: number,
        y: number,
        scale: number,
        opacity: number,
      ) => {
        node.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
        node.style.opacity = String(clamp(opacity, 0, 1));
      };

      const render = () => {
        const now = Date.now() - serverOffset;
        const elapsed = Math.max(0, now - impactStartedAt);
        const damageMoment = Math.max(1300, damageAt - impactStartedAt);

        const wheelCenterX =
          wheelRect.left - pageRect.left + wheelRect.width / 2;
        const wheelCenterY =
          wheelRect.top - pageRect.top + wheelRect.height / 2;

        const leftStartX =
          wheelRect.left - pageRect.left + wheelRect.width * 0.22;
        const rightStartX =
          wheelRect.left - pageRect.left + wheelRect.width * 0.78;
        const leftMeetX = wheelCenterX - 48;
        const rightMeetX = wheelCenterX + 48;

        const appearEnd = Math.min(300, damageMoment * 0.2);
        const moveStart = appearEnd * 0.72;
        const meetEnd = Math.min(900, damageMoment * 0.61);
        const mergeEnd = Math.min(1080, damageMoment * 0.73);
        const flightStart = mergeEnd - 40;
        const flightEnd = damageMoment;

        const appear = easeOutBack(elapsed / Math.max(1, appearEnd));
        const meet = smoothstep(
          (elapsed - moveStart) / Math.max(1, meetEnd - moveStart),
        );
        const merge = smoothstep(
          (elapsed - meetEnd) / Math.max(1, mergeEnd - meetEnd),
        );

        const distanceOpacity =
          elapsed < meetEnd
            ? clamp(elapsed / Math.max(1, appearEnd * 0.45), 0, 1)
            : 1 - merge;
        const distanceScale = 0.76 + appear * 0.24 - merge * 0.13;
        const leftX =
          leftStartX + (leftMeetX - leftStartX) * meet + 21 * merge;
        const rightX =
          rightStartX + (rightMeetX - rightStartX) * meet - 21 * merge;
        const distanceY =
          wheelCenterY + 8 - Math.sin(Math.min(1, meet) * Math.PI) * 8;

        place(
          meDistance,
          leftX,
          distanceY,
          distanceScale,
          distanceOpacity,
        );
        place(
          opponentDistance,
          rightX,
          distanceY,
          distanceScale,
          distanceOpacity,
        );

        if (outcome.draw) {
          if (burst) {
            const burstIn = easeOutBack(
              (elapsed - meetEnd + 30) / Math.max(1, mergeEnd - meetEnd),
            );
            const burstOut = smoothstep(
              (elapsed - mergeEnd) /
                Math.max(1, damageMoment - mergeEnd),
            );
            place(
              burst,
              wheelCenterX,
              wheelCenterY,
              0.65 + burstIn * 0.4 - burstOut * 0.12,
              burstIn * (1 - burstOut),
            );
          }
        } else if (projectile) {
          const reveal = easeOutBack(
            (elapsed - meetEnd + 20) / Math.max(1, flightStart - meetEnd + 20),
          );
          const flight = smoothstep(
            (elapsed - flightStart) /
              Math.max(1, flightEnd - flightStart),
          );
          const targetHud =
            outcome.defender === 'me'
              ? meHudRef.current
              : opponentHudRef.current;
          const targetRect = targetHud?.getBoundingClientRect();
          const targetX = targetRect
            ? targetRect.left - pageRect.left + targetRect.width / 2
            : outcome.defender === 'me'
              ? pageRect.width * 0.22
              : pageRect.width * 0.78;
          const targetY = targetRect
            ? targetRect.top - pageRect.top + targetRect.height * 0.62
            : 42;

          const controlX = wheelCenterX + (targetX - wheelCenterX) * 0.48;
          const controlY = Math.min(wheelCenterY - 68, targetY + 34);
          const inv = 1 - flight;
          const x =
            inv * inv * wheelCenterX +
            2 * inv * flight * controlX +
            flight * flight * targetX;
          const y =
            inv * inv * wheelCenterY +
            2 * inv * flight * controlY +
            flight * flight * targetY;
          const arrivalFade = clamp((1 - flight) / 0.08, 0, 1);
          const scale =
            0.62 +
            reveal * 0.43 -
            flight * 0.12 +
            Math.sin(flight * Math.PI) * 0.06;

          place(projectile, x, y, scale, reveal * arrivalFade);
        }

        if (elapsed < damageMoment + 80) {
          frameId = requestAnimationFrame(render);
        }
      };

      readRects();
      window.addEventListener('resize', readRects);
      frameId = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', readRects);
      };
    }, [
      damageAt,
      impactStartedAt,
      meHudRef,
      opponentHudRef,
      outcome.defender,
      outcome.draw,
      pageRef,
      round,
      serverOffset,
      wheelRef,
    ]);

    const meText = outcome.mePicked ? String(outcome.meDistance) : 'MISS';
    const opponentText = outcome.opponentPicked
      ? String(outcome.opponentDistance)
      : 'MISS';

    return (
      <div className="nm-resolution-layer" aria-hidden="true">
        <div ref={meDistanceRef} className="nm-distance nm-distance-me">
          <Avatar profile={profiles.me} className="nm-impact-avatar" />
          <span>{meText}</span>
        </div>
        <div
          ref={opponentDistanceRef}
          className="nm-distance nm-distance-opponent"
        >
          <Avatar
            profile={profiles.opponent}
            className="nm-impact-avatar"
          />
          <span>{opponentText}</span>
        </div>

        {outcome.draw ? (
          <div ref={burstRef} className="nm-draw-burst">
            0
          </div>
        ) : (
          <div ref={projectileRef} className="nm-damage-projectile">
            -{outcome.damage}
          </div>
        )}
      </div>
    );
  },
);

const Wheel = memo(
  ({
    wheelRef,
    arrowRef,
    phase,
    draft,
    target,
    targetVisible,
    mePick,
    opponentPick,
    myLocked,
    profiles,
  }: {
    wheelRef: React.RefObject<HTMLDivElement | null>;
    arrowRef: React.RefObject<HTMLDivElement | null>;
    phase: NeonMatrixStateMessage['phase'];
    draft: number;
    target: number | null;
    targetVisible: boolean;
    mePick: number | null;
    opponentPick: number | null;
    myLocked: boolean;
    profiles: Record<Side, PlayerProfile>;
  }) => {
    const showRevealedPicks =
      phase === 'spinning' ||
      phase === 'landing' ||
      phase === 'impact' ||
      phase === 'match_over';
    const shownMePick = phase === 'picking' && !myLocked ? draft : mePick;
    const samePick =
      showRevealedPicks &&
      mePick !== null &&
      opponentPick !== null &&
      mePick === opponentPick;
    const spinningOrLanding = phase === 'spinning' || phase === 'landing';

    return (
      <div ref={wheelRef} className={`nm-wheel nm-wheel-${phase}`}>
        <div className="nm-wheel-face" />
        <div className="nm-wheel-ticks" />

        {LABELS.map((label) => {
          const angle = numberToAngle(label);
          const radians = ((angle - 90) * Math.PI) / 180;
          const x = 50 + Math.cos(radians) * 38;
          const y = 50 + Math.sin(radians) * 38;
          return (
            <span
              key={label}
              className="nm-wheel-label"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {label}
            </span>
          );
        })}

        {shownMePick !== null && (
          <WheelMarker
            value={shownMePick}
            profile={profiles.me}
            side="me"
            faded={phase === 'picking' && !myLocked}
            shift={samePick ? -10 : 0}
          />
        )}

        {showRevealedPicks && opponentPick !== null && (
          <WheelMarker
            value={opponentPick}
            profile={profiles.opponent}
            side="opponent"
            shift={samePick ? 10 : 0}
          />
        )}

        {target !== null && targetVisible && (
          <div
            className="nm-target"
            style={cssVars({ '--target-angle': `${numberToAngle(target)}deg` })}
          >
            <span>{target}</span>
          </div>
        )}

        <div ref={arrowRef} className="nm-arrow">
          <i />
          <b />
        </div>

        <div className="nm-wheel-center">
          <span>
            {phase === 'spinning'
              ? 'SPIN'
              : phase === 'landing'
                ? 'STOPPING'
                : phase === 'impact'
                  ? 'RESULT'
                  : phase === 'picking'
                    ? 'YOUR PICK'
                    : 'NEON'}
          </span>
          <strong>
            {spinningOrLanding
              ? '•••'
              : targetVisible && target !== null
                ? target
                : phase === 'picking'
                  ? draft
                  : '—'}
          </strong>
        </div>
      </div>
    );
  },
);

const ResultModal = memo(
  ({
    didWin,
    winner,
    loser,
    winnerHp,
    loserHp,
    reward,
    onBack,
  }: {
    didWin: boolean;
    winner: PlayerProfile;
    loser: PlayerProfile;
    winnerHp: number;
    loserHp: number;
    reward: number;
    onBack: () => void;
  }) => (
    <div className="nm-modal-layer">
      <div className={`nm-result-modal ${didWin ? 'nm-result-win' : 'nm-result-loss'}`}>
        <div className="nm-result-kicker">NEON MATRIX · MATCH RESULT</div>
        <h2>{didWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h2>

        <div className="nm-result-players">
          <div className="nm-result-player nm-result-winner">
            <Avatar profile={winner} className="nm-result-avatar-big" />
            <div>{winner.name}</div>
            <strong>{winnerHp} HP</strong>
          </div>
          <span>VS</span>
          <div className="nm-result-player nm-result-loser">
            <Avatar profile={loser} className="nm-result-avatar-small" />
            <div>{loser.name}</div>
            <strong>{loserHp} HP</strong>
          </div>
        </div>

        <div className="nm-result-divider" />

        <div className="game-result-reward nm-reward">
          <strong>{didWin ? `+${formatReward(reward)}` : '0'}</strong>
          <img src={coinIcon} alt="GAME" draggable={false} />
        </div>

        <button type="button" onClick={onBack}>
          <span className="nm-back-icon">←</span>
          <b>К ЛОББИ</b>
          <span>›</span>
        </button>
      </div>
    </div>
  ),
);

export const NeonMatrixGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const socketRef = useRef<NeonMatrixSocketClient | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const meHudRef = useRef<HTMLDivElement | null>(null);
  const opponentHudRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const arrowFrameRef = useRef<number | null>(null);
  const arrowAngleRef = useRef(numberToAngle(DEFAULT_NUMBER));
  const arrowMotionRef = useRef<ArrowMotion>({
    mode: 'idle',
    angle: numberToAngle(DEFAULT_NUMBER),
    velocity: 0,
    lastAt: 0,
    landingStartedAt: 0,
    landingDuration: 0,
    landingStartAngle: 0,
    landingStartVelocity: 0,
    landingDistance: 0,
    landingTarget: numberToAngle(DEFAULT_NUMBER),
    landingRound: 0,
  });
  const stageRef = useRef('');
  const verifiedRoundRef = useRef('');
  const previousRoundRef = useRef(0);
  const previousDamageAppliedRef = useRef(false);

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<NeonMatrixStateMessage | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [arrowSettledRound, setArrowSettledRound] = useState(0);
  const [draft, setDraft] = useState(DEFAULT_NUMBER);
  const [submitting, setSubmitting] = useState(false);

  const routeState = (location.state || {}) as {
    lobbyId?: string;
    game?: string;
    playersInfo?: LobbyPlayerInfo[];
  };

  const gameId = useMemo(() => {
    if (routeState.game) return routeState.game;
    if (typeof window === 'undefined') return 'neon_matrix';
    return window.sessionStorage.getItem('twingames_active_game') || 'neon_matrix';
  }, [routeState.game]);

  const lobbyId = useMemo(() => {
    const query = new URLSearchParams(location.search);
    return (
      routeState.lobbyId ||
      query.get('lobby_id') ||
      query.get('lobbyId') ||
      (typeof window !== 'undefined'
        ? window.sessionStorage.getItem('twingames_active_lobby_id') ||
          window.sessionStorage.getItem('twingames_blackjack_lobby_id') ||
          ''
        : '')
    );
  }, [location.search, routeState.lobbyId]);

  const playersInfo = useMemo(
    () =>
      routeState.playersInfo?.length
        ? routeState.playersInfo
        : readStoredPlayersInfo(),
    [routeState.playersInfo],
  );

  const myUserId = Number(user?.id || 0);
  const playerOrder = serverState?.player_order ?? [];
  const opponentUserId =
    playerOrder.find((id) => id !== myUserId) ||
    Number(playersInfo.find((item) => Number(item.id) !== myUserId)?.id || 0);

  const profiles = useMemo<Record<Side, PlayerProfile>>(() => {
    const map = new Map<number, PlayerProfile>();
    for (const item of playersInfo) {
      const id = Number(item.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const name = item.tg_user || `Player ${id}`;
      map.set(id, {
        id,
        name,
        photoUrl: item.photo_url || '',
        initials: getInitials(name),
      });
    }

    const storedMe = map.get(myUserId);
    const meName = user?.tg_user || storedMe?.name || 'Ты';
    const me: PlayerProfile = {
      id: myUserId,
      name: meName,
      photoUrl: user?.photo_url || storedMe?.photoUrl || '',
      initials: getInitials(meName),
    };

    const storedOpponent = map.get(opponentUserId);
    const opponentName = storedOpponent?.name || 'Соперник';
    const opponent: PlayerProfile = {
      id: opponentUserId,
      name: opponentName,
      photoUrl: storedOpponent?.photoUrl || '',
      initials: getInitials(opponentName),
    };

    return { me, opponent };
  }, [myUserId, opponentUserId, playersInfo, user?.photo_url, user?.tg_user]);

  const renderArrow = useCallback((angle: number) => {
    arrowAngleRef.current = angle;
    arrowMotionRef.current.angle = angle;
    if (arrowRef.current) {
      arrowRef.current.style.transform = `rotate(${angle}deg) translateZ(0)`;
    }
  }, []);

  const stopArrow = useCallback(() => {
    if (arrowFrameRef.current !== null) {
      cancelAnimationFrame(arrowFrameRef.current);
      arrowFrameRef.current = null;
    }
    arrowMotionRef.current.mode = 'idle';
    arrowMotionRef.current.velocity = 0;
    arrowMotionRef.current.lastAt = 0;
  }, []);

  const startArrowLoop = useCallback(() => {
    if (arrowFrameRef.current !== null) return;

    const frame = (now: number) => {
      const motion = arrowMotionRef.current;
      if (motion.mode === 'idle') {
        arrowFrameRef.current = null;
        return;
      }

      if (motion.mode === 'spinning') {
        const previous = motion.lastAt || now;
        const dt = clamp(now - previous, 0, 34);
        const response = 1 - Math.exp(-dt / SPIN_ACCELERATION_MS);
        motion.velocity += (SPIN_SPEED - motion.velocity) * response;
        motion.angle += motion.velocity * dt;
        motion.lastAt = now;
        renderArrow(motion.angle);
      } else {
        const duration = Math.max(1, motion.landingDuration);
        const t = clamp((now - motion.landingStartedAt) / duration, 0, 1);
        const t2 = t * t;
        const t3 = t2 * t;
        const t4 = t3 * t;
        const t5 = t4 * t;

        const velocityEase = 1 - 3 * t2 + 2 * t3;
        const velocityIntegral = t - t3 + 0.5 * t4;
        const extraEase = 10 * t3 - 15 * t4 + 6 * t5;
        const extraVelocity = 30 * t2 * (1 - t) * (1 - t);
        const naturalDistance =
          motion.landingStartVelocity * duration * 0.5;
        const extraDistance = Math.max(
          0,
          motion.landingDistance - naturalDistance,
        );

        motion.angle =
          motion.landingStartAngle +
          motion.landingStartVelocity * duration * velocityIntegral +
          extraDistance * extraEase;
        motion.velocity =
          motion.landingStartVelocity * velocityEase +
          (extraDistance / duration) * extraVelocity;
        renderArrow(motion.angle);

        if (t >= 1) {
          motion.mode = 'idle';
          motion.velocity = 0;
          motion.angle = normalizeAngle(motion.landingTarget);
          renderArrow(motion.angle);
          setArrowSettledRound(motion.landingRound);
          arrowFrameRef.current = null;
          return;
        }
      }

      arrowFrameRef.current = requestAnimationFrame(frame);
    };

    arrowFrameRef.current = requestAnimationFrame(frame);
  }, [renderArrow]);

  const setStaticArrow = useCallback(
    (angle: number) => {
      stopArrow();
      renderArrow(normalizeAngle(angle));
    },
    [renderArrow, stopArrow],
  );

  const startFreeSpin = useCallback(() => {
    const motion = arrowMotionRef.current;
    if (motion.mode === 'spinning') return;
    motion.mode = 'spinning';
    motion.angle = arrowAngleRef.current;
    motion.velocity = Math.max(0.14, Math.min(motion.velocity, SPIN_SPEED));
    motion.lastAt = performance.now();
    startArrowLoop();
  }, [startArrowLoop]);

  const startLanding = useCallback(
    (targetAngle: number, durationMs: number, round: number) => {
      const normalizedTarget = normalizeAngle(targetAngle);
      const motion = arrowMotionRef.current;
      if (
        motion.mode === 'landing' &&
        circularAngleDistance(motion.landingTarget, normalizedTarget) < 0.01
      ) {
        return;
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setStaticArrow(normalizedTarget);
        setArrowSettledRound(round);
        return;
      }

      const startAngle = arrowAngleRef.current;
      const startVelocity = Math.max(0, motion.velocity);
      const duration = Math.max(MIN_LANDING_MS, durationMs);
      const targetDelta =
        (normalizedTarget - normalizeAngle(startAngle) + 360) % 360;
      const naturalDistance = startVelocity * duration * 0.5;
      let turns = Math.max(2, Math.ceil((naturalDistance - targetDelta) / 360));
      let distance = targetDelta + turns * 360;
      while (distance + 0.001 < naturalDistance) {
        turns += 1;
        distance = targetDelta + turns * 360;
      }

      motion.mode = 'landing';
      motion.angle = startAngle;
      motion.velocity = startVelocity;
      motion.lastAt = 0;
      motion.landingStartedAt = performance.now();
      motion.landingDuration = duration;
      motion.landingStartAngle = startAngle;
      motion.landingStartVelocity = startVelocity;
      motion.landingDistance = distance;
      motion.landingTarget = normalizedTarget;
      motion.landingRound = round;
      setArrowSettledRound(0);
      startArrowLoop();
    },
    [setStaticArrow, startArrowLoop],
  );

  useEffect(() => () => stopArrow(), [stopArrow]);

  const verifyCommitment = useCallback(async (state: NeonMatrixStateMessage) => {
    if (!state.commitment || state.target === undefined || !state.reveal_nonce) return;
    const key = `${state.round}:${state.commitment}`;
    if (verifiedRoundRef.current === key) return;
    verifiedRoundRef.current = key;
    if (!window.crypto?.subtle) return;

    const payload = `${state.lobby_id}:${state.round}:${state.target}:${state.reveal_nonce}`;
    const digest = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload),
    );
    const actual = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if (actual !== state.commitment) {
      setSocketError('Проверка честности раунда не пройдена');
    }
  }, []);

  useEffect(() => {
    if (!lobbyId || !token) return;

    window.sessionStorage.setItem('twingames_active_lobby_id', lobbyId);
    window.sessionStorage.setItem('twingames_active_game', gameId);

    let alive = true;
    setConnectionStatus('connecting');
    setSocketError(null);

    const client = neonMatrixWsApi.connect({
      lobbyId,
      token,
      handlers: {
        onOpen: () => {
          if (!alive) return;
          setConnectionStatus('open');
          client.requestState();
        },
        onClose: () => {
          if (!alive) return;
          setConnectionStatus('closed');
        },
        onSocketError: () => {
          if (!alive) return;
          setConnectionStatus('error');
          setSocketError('Ошибка подключения к WebSocket');
        },
        onServerError: (error) => {
          if (!alive) return;
          setSubmitting(false);
          setSocketError(error.details || error.error);
        },
        onState: (state) => {
          if (!alive) return;
          if (state.server_ms > 0) {
            const sample = Date.now() - state.server_ms;
            setServerOffset((previous) =>
              previous === 0 ? sample : previous * 0.8 + sample * 0.2,
            );
          }
          setSubmitting(false);
          setSocketError(null);
          setServerState(state);
        },
      },
    });

    socketRef.current = client;
    return () => {
      alive = false;
      socketRef.current = null;
      client.close();
    };
  }, [gameId, lobbyId, token]);

  const phase = serverState?.phase ?? 'waiting';
  const activeDeadline =
    phase === 'countdown'
      ? serverState?.countdown_ends_ms
      : phase === 'picking'
        ? serverState?.pick_ends_ms
        : undefined;
  const deadlineRemaining = activeDeadline
    ? Math.max(0, activeDeadline - (serverState?.server_ms ?? 0))
    : 0;
  const timerDuration = phase === 'countdown' ? 3000 : 5000;

  const myHealth = serverState?.health[String(myUserId)] ?? START_HP;
  const opponentHealth =
    serverState?.health[String(opponentUserId)] ?? START_HP;
  const myPick = serverState?.picks[String(myUserId)] ?? null;
  const opponentPick = serverState?.picks[String(opponentUserId)] ?? null;
  const myLocked = Boolean(serverState?.picked[String(myUserId)]);

  const outcome = useMemo<LocalOutcome | null>(() => {
    const raw = serverState?.outcome;
    if (!raw || !myUserId || !opponentUserId) return null;
    const meIsPlayer1 = raw.player1_user_id === myUserId;

    return {
      target: raw.target,
      mePick: meIsPlayer1
        ? raw.player1_picked
          ? raw.player1_pick
          : null
        : raw.player2_picked
          ? raw.player2_pick
          : null,
      opponentPick: meIsPlayer1
        ? raw.player2_picked
          ? raw.player2_pick
          : null
        : raw.player1_picked
          ? raw.player1_pick
          : null,
      mePicked: meIsPlayer1 ? raw.player1_picked : raw.player2_picked,
      opponentPicked: meIsPlayer1
        ? raw.player2_picked
        : raw.player1_picked,
      meDistance: meIsPlayer1
        ? raw.player1_distance
        : raw.player2_distance,
      opponentDistance: meIsPlayer1
        ? raw.player2_distance
        : raw.player1_distance,
      damage: raw.damage,
      attacker:
        raw.attacker_user_id === myUserId
          ? 'me'
          : raw.attacker_user_id === opponentUserId
            ? 'opponent'
            : null,
      defender:
        raw.defender_user_id === myUserId
          ? 'me'
          : raw.defender_user_id === opponentUserId
            ? 'opponent'
            : null,
      draw: raw.is_draw,
    };
  }, [myUserId, opponentUserId, serverState?.outcome]);

  useEffect(() => {
    if (!serverState) return;
    const estimatedServerNow = Date.now() - serverOffset;
    const newRound = previousRoundRef.current !== serverState.round;
    previousRoundRef.current = serverState.round;

    if (serverState.phase === 'countdown' || serverState.phase === 'waiting') {
      if (newRound) setDraft(DEFAULT_NUMBER);
      setArrowSettledRound(0);
      setStaticArrow(numberToAngle(DEFAULT_NUMBER));
      stageRef.current = `${serverState.round}:${serverState.phase}`;
      return;
    }

    if (serverState.phase === 'picking') {
      setArrowSettledRound(0);
      if (newRound) {
        setDraft(DEFAULT_NUMBER);
        setStaticArrow(numberToAngle(DEFAULT_NUMBER));
      } else if (myPick !== null) {
        setDraft(myPick);
        setStaticArrow(numberToAngle(myPick));
      }
      stageRef.current = `${serverState.round}:picking`;
      previousDamageAppliedRef.current = false;
      return;
    }

    if (serverState.phase === 'spinning') {
      setArrowSettledRound(0);
      const key = `${serverState.round}:spinning`;
      if (stageRef.current !== key) {
        stageRef.current = key;
        startFreeSpin();
        hapticImpact('medium');
      }
      return;
    }

    if (serverState.phase === 'landing' && serverState.target !== undefined) {
      void verifyCommitment(serverState);
      const key = `${serverState.round}:landing`;
      if (stageRef.current !== key) {
        stageRef.current = key;
        const remaining = Math.max(
          MIN_LANDING_MS,
          (serverState.stop_at_ms ?? estimatedServerNow + 2200) - estimatedServerNow,
        );
        startLanding(numberToAngle(serverState.target), remaining, serverState.round);
      }
      return;
    }

    if (serverState.phase === 'impact' && serverState.target !== undefined) {
      void verifyCommitment(serverState);
      const targetAngle = numberToAngle(serverState.target);
      const motion = arrowMotionRef.current;
      const distanceToTarget = circularAngleDistance(
        arrowAngleRef.current,
        targetAngle,
      );

      if (motion.mode === 'spinning') {
        const remaining = Math.max(
          420,
          (serverState.stop_at_ms ?? estimatedServerNow + 420) -
            estimatedServerNow,
        );
        startLanding(targetAngle, remaining, serverState.round);
      } else if (motion.mode === 'idle') {
        if (distanceToTarget > 0.25) {
          startLanding(targetAngle, 420, serverState.round);
        } else {
          renderArrow(normalizeAngle(targetAngle));
          setArrowSettledRound(serverState.round);
        }
      }

      const key = `${serverState.round}:impact`;
      if (stageRef.current !== key) {
        stageRef.current = key;
        hapticImpact('heavy');
      }

      if (
        serverState.damage_applied &&
        !previousDamageAppliedRef.current
      ) {
        previousDamageAppliedRef.current = true;
        if (outcome?.draw) hapticNotify('success');
        else hapticNotify(outcome?.defender === 'me' ? 'error' : 'warning');
      }
      return;
    }

    if (serverState.phase === 'match_over') {
      stopArrow();
      if (serverState.target !== undefined) {
        renderArrow(numberToAngle(serverState.target));
        setArrowSettledRound(serverState.round);
      }
      const key = `${serverState.round}:match_over`;
      if (stageRef.current !== key) {
        stageRef.current = key;
        hapticNotify(serverState.winner_user_id === myUserId ? 'success' : 'error');
      }
    }
  }, [
    myPick,
    myUserId,
    outcome?.defender,
    outcome?.draw,
    renderArrow,
    serverOffset,
    serverState,
    setStaticArrow,
    startFreeSpin,
    startLanding,
    stopArrow,
    verifyCommitment,
  ]);


  const canPick =
    connectionStatus === 'open' &&
    phase === 'picking' &&
    !myLocked &&
    !submitting &&
    deadlineRemaining > 0;

  const handleDraft = (value: number) => {
    if (!canPick) return;
    const next = clamp(Math.round(value), MIN_NUMBER, MAX_NUMBER);
    setDraft(next);
    setStaticArrow(numberToAngle(next));
    hapticSelect();
  };

  const submitPick = () => {
    if (!canPick) return;
    setSocketError(null);
    const sent = socketRef.current?.pick(draft);
    if (!sent) {
      setSocketError('Нет подключения к игре');
      return;
    }
    setSubmitting(true);
    hapticImpact('medium');
  };

  const backToLobbies = () =>
    navigate(`/game/${gameId}/lobbies`, { replace: true });

  const didWin = serverState?.winner_user_id === myUserId;
  const matchOver = phase === 'match_over' && Boolean(serverState?.winner_user_id);
  const winnerProfile = didWin ? profiles.me : profiles.opponent;
  const loserProfile = didWin ? profiles.opponent : profiles.me;
  const winnerHp = didWin ? myHealth : opponentHealth;
  const loserHp = didWin ? opponentHealth : myHealth;
  const currentRound = serverState?.round ?? 1;
  const targetVisible =
    phase === 'match_over' ||
    (phase === 'impact' && arrowSettledRound === currentRound);

  if (!lobbyId) {
    return (
      <div className="nm-empty">
        <strong>ЛОББИ НЕ НАЙДЕНО</strong>
        <button type="button" onClick={backToLobbies}>
          К ЛОББИ
        </button>
      </div>
    );
  }

  return (
    <section ref={pageRef} className="nm-page">
      <style>{`
        .nm-page {
          --me: #5bb7ff;
          --opponent: #ff8f2d;
          --gold: #ffc96a;
          --danger: #ff6378;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 480px;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          padding: 9px 9px max(9px, env(safe-area-inset-bottom));
          gap: 7px;
          color: #fff;
          background: #09090d;
          font-family: 'Supercell','Inter',ui-sans-serif,system-ui,sans-serif;
          isolation: isolate;
          -webkit-tap-highlight-color: transparent;
        }

        .nm-page::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(circle at 18% 14%, rgba(47,140,255,.11), transparent 32%),
            radial-gradient(circle at 82% 18%, rgba(255,143,45,.09), transparent 30%),
            linear-gradient(180deg, #10111a 0%, #09090d 55%, #060608 100%);
        }

        .nm-top {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 60px minmax(0, 1fr);
          align-items: center;
          gap: 7px;
          min-height: 58px;
          position: relative;
          z-index: 10;
        }

        .nm-player-hud {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px;
          border: 1px solid rgba(255,255,255,.075);
          border-radius: 17px;
          background: #11131c;
          contain: layout paint;
        }

        .nm-player-hud-opponent { justify-content: flex-end; text-align: right; }
        .nm-avatar {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,.18);
          background: #202431;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
        }
        .nm-player-hud-me .nm-avatar { border-color: rgba(91,183,255,.68); }
        .nm-player-hud-opponent .nm-avatar { border-color: rgba(255,143,45,.68); }
        .nm-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .nm-player-copy { min-width: 0; flex: 1; }
        .nm-player-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.82);
          font-size: 8px;
          line-height: 1.6;
          padding: 2px 0 1px;
        }
        .nm-hp-row { display: flex; align-items: baseline; gap: 4px; margin-top: 1px; }
        .nm-player-hud-opponent .nm-hp-row { justify-content: flex-end; }
        .nm-hp-row strong { display: inline-block; padding-top: .08em; font-size: 16px; line-height: 1.5; font-variant-numeric: tabular-nums; }
        .nm-player-hud-me .nm-hp-row strong { color: var(--me); }
        .nm-player-hud-opponent .nm-hp-row strong { color: var(--opponent); }
        .nm-hp-row span { display: inline-block; padding-top: .2em; color: rgba(255,255,255,.28); font-size: 6px; line-height: 1.5; }
        .nm-hp-track { height: 5px; margin-top: 2px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.075); }
        .nm-hp-track i {
          display: block; width: 100%; height: 100%; border-radius: inherit;
          will-change: transform;
          transition: transform 720ms cubic-bezier(.16,.78,.22,1);
        }
        .nm-player-hud-me .nm-hp-track i { transform-origin: 0 50%; background: var(--me); }
        .nm-player-hud-opponent .nm-hp-track i { transform-origin: 100% 50%; background: var(--opponent); }
        .nm-player-hit { animation: nmHudHit 520ms ease-out; }

        .nm-timer {
          width: 58px;
          height: 58px;
          padding: 3px;
          border-radius: 50%;
          background: conic-gradient(var(--gold) var(--timer-progress), rgba(255,255,255,.08) 0);
        }
        .nm-timer > div {
          width: 100%; height: 100%; border-radius: 50%;
          display: grid; place-items: center; align-content: center;
          background: #12141d; border: 1px solid rgba(255,255,255,.06);
        }
        .nm-timer strong { display: block; padding-top: .12em; font-size: 18px; line-height: 1.45; font-variant-numeric: tabular-nums; }
        .nm-timer span { display: block; margin-top: -1px; color: rgba(255,255,255,.28); font-size: 5px; line-height: 1.5; }
        .nm-timer-active strong { color: var(--gold); }

        .nm-main {
          min-height: 0;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 10px;
          position: relative;
        }

        .nm-round-caption { text-align: center; min-height: 34px; }
        .nm-round-caption strong { display: block; padding: .12em 0 .04em; color: #fff; font-size: 14px; line-height: 1.5; }
        .nm-round-caption span { display: block; margin-top: 0; color: rgba(255,255,255,.34); font-size: 7px; line-height: 1.55; }

        .nm-wheel {
          position: relative;
          width: min(82vw, 362px, 48vh);
          aspect-ratio: 1;
          min-width: 270px;
          min-height: 270px;
          border-radius: 50%;
          contain: layout paint style;
          transform: translateZ(0);
        }
        .nm-wheel-face {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1px solid rgba(255,255,255,.11);
          background:
            radial-gradient(circle at 50% 45%, #202536 0 23%, #151923 24% 56%, #0e1118 57% 100%);
          box-shadow: inset 0 0 0 7px #0b0d13, inset 0 0 0 9px rgba(255,255,255,.07), 0 18px 50px rgba(0,0,0,.42);
        }
        .nm-wheel-ticks {
          position: absolute; inset: 13px; border-radius: 50%;
          background: repeating-conic-gradient(from -1deg, rgba(255,255,255,.42) 0 1deg, transparent 1deg 6deg);
          -webkit-mask: radial-gradient(circle, transparent 0 82%, #000 82.5% 100%);
          mask: radial-gradient(circle, transparent 0 82%, #000 82.5% 100%);
          opacity: .42;
        }
        .nm-wheel-label {
          position: absolute;
          transform: translate(-50%, -50%);
          color: rgba(255,255,255,.38);
          font-size: 7px;
          line-height: 1.45;
          padding-top: .08em;
          pointer-events: none;
        }
        .nm-arrow {
          position: absolute; inset: 0;
          will-change: transform;
          transform: rotate(${numberToAngle(DEFAULT_NUMBER)}deg) translateZ(0);
          pointer-events: none;
          z-index: 8;
        }
        .nm-arrow i {
          position: absolute; left: calc(50% - 2px); top: 17%; width: 4px; height: 33%;
          border-radius: 99px;
          background: linear-gradient(180deg, var(--gold), rgba(255,201,106,.24));
          transform-origin: 50% 100%;
        }
        .nm-arrow b {
          position: absolute; left: 50%; top: 14%; width: 0; height: 0;
          transform: translateX(-50%);
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-bottom: 13px solid var(--gold);
        }
        .nm-wheel-center {
          position: absolute; left: 50%; top: 50%; z-index: 12;
          width: 31%; aspect-ratio: 1; transform: translate(-50%, -50%);
          display: grid; place-items: center; align-content: center;
          border-radius: 50%; border: 1px solid rgba(255,255,255,.1);
          background: #0c0f16;
          box-shadow: inset 0 0 0 5px rgba(255,255,255,.025);
        }
        .nm-wheel-center span { display: block; padding-top: .12em; color: rgba(255,255,255,.3); font-size: 6px; line-height: 1.5; }
        .nm-wheel-center strong { display: block; margin-top: 0; padding-top: .08em; color: #fff; font-size: clamp(25px, 8vw, 38px); line-height: 1.4; font-variant-numeric: tabular-nums; }

        .nm-marker, .nm-target {
          position: absolute; inset: 0; z-index: 15;
          transform: rotate(var(--marker-angle));
          pointer-events: none;
        }
        .nm-marker > div {
          position: absolute; left: 50%; top: 7.5%;
          transform: translate(calc(-50% + var(--marker-shift)), -50%) rotate(calc(-1 * var(--marker-angle)));
        }
        .nm-wheel-avatar { width: 34px; height: 34px; border-width: 2px; background: #171b25; }
        .nm-marker-me .nm-wheel-avatar { border-color: var(--me); }
        .nm-marker-opponent .nm-wheel-avatar { border-color: var(--opponent); }
        .nm-marker-faded { opacity: .68; }
        .nm-target { --marker-angle: var(--target-angle); transform: rotate(var(--target-angle)); z-index: 13; }
        .nm-target span {
          position: absolute; left: 50%; top: 6.7%;
          min-width: 28px; min-height: 24px; padding: 2px 6px 1px;
          display: grid; place-items: center;
          transform: translate(-50%, -50%) rotate(calc(-1 * var(--target-angle)));
          border-radius: 8px; background: var(--gold); color: #15100a;
          font-size: 8px; line-height: 1.45;
        }

        .nm-resolution-layer {
          position: absolute;
          inset: 0;
          z-index: 35;
          pointer-events: none;
          overflow: visible;
        }
        .nm-distance {
          position: absolute;
          left: 0;
          top: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 88px;
          padding: 7px 10px;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 14px;
          background: #121621;
          box-shadow: 0 10px 28px rgba(0,0,0,.34);
          opacity: 0;
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        .nm-distance-opponent { flex-direction: row-reverse; }
        .nm-impact-avatar { width: 27px; height: 27px; font-size: 7px; }
        .nm-distance-me .nm-impact-avatar { border-color: var(--me); }
        .nm-distance-opponent .nm-impact-avatar { border-color: var(--opponent); }
        .nm-distance span {
          display: inline-block;
          padding-top: .08em;
          font-size: 14px;
          line-height: 1.45;
          font-variant-numeric: tabular-nums;
        }
        .nm-distance-me span { color: var(--me); }
        .nm-distance-opponent span { color: var(--opponent); }
        .nm-damage-projectile, .nm-draw-burst {
          position: absolute;
          left: 0;
          top: 0;
          display: grid;
          place-items: center;
          min-width: 58px;
          min-height: 42px;
          padding: 3px 11px 1px;
          border: 1px solid rgba(255,99,120,.42);
          border-radius: 14px;
          background: #2a1119;
          color: #ff7589;
          box-shadow: 0 10px 30px rgba(255,70,100,.18);
          font-size: 18px;
          line-height: 1.45;
          font-variant-numeric: tabular-nums;
          opacity: 0;
          will-change: transform, opacity;
          backface-visibility: hidden;
        }
        .nm-draw-burst {
          border-color: rgba(255,201,106,.4);
          background: #28200f;
          color: var(--gold);
          box-shadow: 0 10px 30px rgba(255,201,106,.16);
        }

        .nm-bottom {
          position: relative; z-index: 10;
          display: grid; gap: 7px;
          min-height: 82px;
        }
        .nm-picker {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid rgba(91,183,255,.18);
          border-radius: 18px;
          background: #11141d;
        }
        .nm-picker-value { text-align: center; }
        .nm-picker-value span { display: block; padding-top: .1em; color: rgba(255,255,255,.32); font-size: 6px; line-height: 1.5; }
        .nm-picker-value strong { display: block; margin-top: 0; padding-top: .08em; color: var(--me); font-size: 23px; line-height: 1.45; font-variant-numeric: tabular-nums; }
        .nm-range { width: 100%; height: 32px; margin: 0; accent-color: var(--me); touch-action: none; }
        .nm-action {
          min-height: 50px;
          border: 1px solid rgba(91,183,255,.28);
          border-radius: 17px;
          background: linear-gradient(180deg, #4ba8ff, #277dd8);
          color: white;
          font: inherit;
          font-size: 10px;
          line-height: 1.55;
          padding: 9px 8px 7px;
          transition: transform 120ms ease, opacity 120ms ease;
        }
        .nm-action:active:not(:disabled) { transform: scale(.985); }
        .nm-action:disabled { opacity: .42; }
        .nm-locked, .nm-status {
          min-height: 50px; display: grid; place-items: center;
          padding: 10px 14px; border: 1px solid rgba(255,255,255,.075);
          border-radius: 17px; background: #11131b;
          color: rgba(255,255,255,.48); text-align: center;
          font-size: 8px; line-height: 1.5;
        }
        .nm-locked strong { color: var(--me); }
        .nm-error { color: #ff7187; }

        .nm-overlay {
          position: absolute;
          inset: 0;
          z-index: 40;
          background: rgba(6,7,11,.9);
          text-align: center;
        }
        .nm-overlay-center {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .nm-overlay-copy {
          position: absolute;
          left: 20px;
          right: 20px;
          top: calc(50% + 96px);
        }
        .nm-countdown-ring {
          width: 154px; height: 154px; border-radius: 50%;
          display: grid; place-items: center;
          border: 1px solid rgba(255,201,106,.22);
          background: radial-gradient(circle, #171925 0 57%, rgba(255,201,106,.12) 58% 61%, #0b0d13 62%);
          animation: nmCountdownPulse 900ms ease-in-out infinite alternate;
        }
        .nm-countdown-ring strong {
          display: block;
          min-width: 1.2em;
          padding: .16em 0 .06em;
          color: var(--gold);
          font-size: 64px;
          line-height: 1.45;
          font-variant-numeric: tabular-nums;
        }
        .nm-overlay h3 { margin: 0; padding: .12em 0 .04em; font-size: 13px; line-height: 1.55; }
        .nm-overlay p { margin: 5px 0 0; color: rgba(255,255,255,.36); font-size: 8px; line-height: 1.6; }

        .nm-modal-layer {
          position: absolute; inset: 0; z-index: 60;
          display: grid; place-items: center; padding: 16px;
          background: rgba(3,4,7,.84);
        }
        .nm-result-modal {
          width: min(100%, 348px);
          overflow: hidden;
          padding: 23px 19px 19px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 28px;
          background: #0e1119;
          text-align: center;
          box-shadow: 0 28px 80px rgba(0,0,0,.62);
          animation: nmModalIn 260ms ease-out both;
        }
        .nm-result-kicker { color: rgba(255,255,255,.3); font-size: 7px; line-height: 1.5; letter-spacing: .12em; }
        .nm-result-modal h2 { margin: 7px 0 0; padding: .12em 0 .04em; font-size: 27px; line-height: 1.5; }
        .nm-result-win h2 { color: #58e6a1; }
        .nm-result-loss h2 { color: #ff6d82; }
        .nm-result-players { margin-top: 20px; display: grid; grid-template-columns: 1.15fr auto .9fr; align-items: end; gap: 12px; }
        .nm-result-players > span { padding-bottom: 31px; color: rgba(255,255,255,.2); font-size: 8px; }
        .nm-result-player { min-width: 0; }
        .nm-result-player > div:nth-child(2) { margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8px; line-height: 1.5; }
        .nm-result-player strong { display: block; margin-top: 2px; padding-top: .08em; font-size: 18px; line-height: 1.5; }
        .nm-result-winner > div:nth-child(2) { color: var(--gold); }
        .nm-result-loser { opacity: .58; }
        .nm-result-avatar-big { width: 88px; height: 88px; margin: auto; border: 2px solid var(--gold); font-size: 19px; }
        .nm-result-avatar-small { width: 62px; height: 62px; margin: auto; font-size: 13px; }
        .nm-result-divider { height: 1px; margin: 18px 0; background: rgba(255,255,255,.07); }
        .nm-reward { width: fit-content; margin: auto; display: flex; align-items: center; gap: 8px; padding: 9px 15px; border: 1px solid rgba(88,230,161,.18); border-radius: 99px; background: rgba(88,230,161,.08); color: #58e6a1; }
        .nm-result-loss .nm-reward { border-color: rgba(255,109,130,.18); background: rgba(255,109,130,.08); color: #ff6d82; }
        .nm-reward strong { display: inline-block; padding-top: .08em; font-size: 19px; line-height: 1.45; font-variant-numeric: tabular-nums; }
        .nm-reward img { width: 24px; height: 24px; object-fit: contain; }
        .nm-result-modal button {
          width: 100%; min-height: 56px; margin-top: 18px; padding: 8px 10px;
          display: grid; grid-template-columns: 38px 1fr 38px; align-items: center;
          border: 1px solid rgba(255,255,255,.11); border-radius: 18px;
          background: #171b25; color: #fff; font: inherit;
        }
        .nm-result-modal button span { color: rgba(255,255,255,.45); font-size: 20px; }
        .nm-result-modal button b { padding-top: .1em; font-size: 9px; line-height: 1.6; letter-spacing: .08em; }
        .nm-back-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 12px; background: rgba(0,0,0,.2); }

        .nm-empty { height: 100%; min-height: 480px; display: grid; place-items: center; align-content: center; gap: 16px; background: #09090d; color: #fff; text-align: center; }
        .nm-empty button { border: 0; border-radius: 14px; padding: 12px 18px; font: inherit; font-size: 9px; }

        @keyframes nmHudHit {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(1px); }
        }
        @keyframes nmCountdownPulse { from { transform: scale(.98); } to { transform: scale(1.02); } }
        @keyframes nmModalIn { from { opacity: 0; transform: translateY(12px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

        @media (max-height: 700px) {
          .nm-page { gap: 4px; padding-top: 6px; }
          .nm-top { min-height: 50px; }
          .nm-player-hud { padding: 5px 6px; border-radius: 14px; }
          .nm-avatar { width: 33px; height: 33px; }
          .nm-hp-row strong { font-size: 14px; }
          .nm-timer { width: 50px; height: 50px; }
          .nm-timer strong { font-size: 15px; }
          .nm-top { grid-template-columns: minmax(0,1fr) 52px minmax(0,1fr); }
          .nm-wheel { width: min(78vw, 330px, 45vh); min-width: 250px; min-height: 250px; }
          .nm-round-caption { min-height: 24px; }
          .nm-picker { padding: 7px 10px; }
          .nm-action, .nm-locked, .nm-status { min-height: 44px; }
          .nm-bottom { min-height: 70px; }
        }

        @media (max-width: 360px) {
          .nm-page { padding-left: 6px; padding-right: 6px; }
          .nm-player-name { max-width: 70px; }
          .nm-wheel { min-width: 250px; min-height: 250px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nm-page *, .nm-page *::before, .nm-page *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      <header className="nm-top">
        <PlayerHud
          side="me"
          profile={profiles.me}
          hp={myHealth}
          hit={
            phase === 'impact' &&
            Boolean(serverState?.damage_applied) &&
            outcome?.defender === 'me'
          }
          round={currentRound}
          hudRef={meHudRef}
        />

        <LiveTimer
          deadline={activeDeadline}
          duration={timerDuration}
          serverOffset={serverOffset}
          round={currentRound}
          active={phase === 'picking' || phase === 'countdown'}
        />

        <PlayerHud
          side="opponent"
          profile={profiles.opponent}
          hp={opponentHealth}
          hit={
            phase === 'impact' &&
            Boolean(serverState?.damage_applied) &&
            outcome?.defender === 'opponent'
          }
          round={currentRound}
          hudRef={opponentHudRef}
        />
      </header>

      <main className="nm-main">
        <div className="nm-round-caption">
          <strong>
            {phase === 'picking'
              ? myLocked
                ? 'ВЫБОР ПРИНЯТ'
                : 'ВЫБЕРИ ЧИСЛО'
              : phase === 'spinning'
                ? 'КОЛЕСО КРУТИТСЯ'
                : phase === 'landing'
                  ? 'КОЛЕСО ЗАМЕДЛЯЕТСЯ'
                  : phase === 'impact'
                    ? 'РАЗНИЦА РАССТОЯНИЙ'
                    : phase === 'match_over'
                      ? 'МАТЧ ЗАВЕРШЁН'
                      : 'NEON MATRIX'}
          </strong>
          <span>{socketError || serverState?.message || 'Подключение к матчу'}</span>
        </div>

        <Wheel
          wheelRef={wheelRef}
          arrowRef={arrowRef}
          phase={phase}
          draft={draft}
          target={serverState?.target ?? null}
          targetVisible={targetVisible}
          mePick={myPick}
          opponentPick={opponentPick}
          myLocked={myLocked}
          profiles={profiles}
        />
      </main>

      <footer className="nm-bottom">
        {phase === 'picking' && !myLocked ? (
          <>
            <div className="nm-picker">
              <div className="nm-picker-value">
                <span>ЧИСЛО</span>
                <strong>{draft}</strong>
              </div>
              <input
                className="nm-range"
                type="range"
                min={MIN_NUMBER}
                max={MAX_NUMBER}
                step={1}
                value={draft}
                disabled={!canPick}
                onChange={(event) => handleDraft(Number(event.target.value))}
              />
            </div>
            <button
              type="button"
              className="nm-action"
              disabled={!canPick}
              onClick={submitPick}
            >
              {submitting ? 'СОХРАНЯЕМ' : 'ВЫБРАТЬ'}
            </button>
          </>
        ) : phase === 'picking' ? (
          <div className="nm-locked">
            ТВОЙ ВЫБОР: <strong>{myPick ?? draft}</strong> · ЖДЁМ СОПЕРНИКА
          </div>
        ) : (
          <div className={`nm-status ${socketError ? 'nm-error' : ''}`}>
            {socketError ||
              (connectionStatus === 'connecting'
                ? 'ПОДКЛЮЧЕНИЕ'
                : connectionStatus === 'closed' || connectionStatus === 'error'
                  ? 'СОЕДИНЕНИЕ ПОТЕРЯНО'
                  : serverState?.message || 'МАТЧ ИДЁТ')}
          </div>
        )}
      </footer>

      {phase === 'impact' &&
        targetVisible &&
        outcome &&
        serverState?.stop_at_ms &&
        serverState?.damage_at_ms && (
          <ResolutionAnimation
            pageRef={pageRef}
            wheelRef={wheelRef}
            meHudRef={meHudRef}
            opponentHudRef={opponentHudRef}
            outcome={outcome}
            profiles={profiles}
            impactStartedAt={serverState.stop_at_ms}
            damageAt={serverState.damage_at_ms}
            serverOffset={serverOffset}
            round={currentRound}
          />
        )}

      {phase === 'waiting' && (
        <CountdownOverlay waiting serverOffset={serverOffset} />
      )}

      {phase === 'countdown' && (
        <CountdownOverlay
          deadline={serverState?.countdown_ends_ms}
          serverOffset={serverOffset}
        />
      )}

      {matchOver && (
        <ResultModal
          didWin={didWin}
          winner={winnerProfile}
          loser={loserProfile}
          winnerHp={winnerHp}
          loserHp={loserHp}
          reward={serverState?.winner_profit ?? 0}
          onBack={backToLobbies}
        />
      )}
    </section>
  );
};

export const NeonMatrix = NeonMatrixGame;
export const NumberMatrixGame = NeonMatrixGame;
export default NeonMatrixGame;
