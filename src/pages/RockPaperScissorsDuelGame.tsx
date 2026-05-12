import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Move = 'rock' | 'paper' | 'scissors';
type Phase = 'choosing' | 'reveal' | 'result' | 'matchOver';
type RoundResult = 'win' | 'lose' | 'draw';
type ImpactKind = 'crush' | 'cut' | 'wrap' | 'tie';

type Score = {
  player: number;
  bot: number;
};

type HistoryItem = {
  result: RoundResult;
  player: Move;
  bot: Move;
};

const CHOOSE_MS = 5000;
const WIN_TARGET = 5;
const MOVES: Move[] = ['rock', 'paper', 'scissors'];

const MOVE_LABEL: Record<Move, string> = {
  rock: 'Камень',
  paper: 'Бумага',
  scissors: 'Ножницы',
};

const MOVE_HINT: Record<Move, string> = {
  rock: 'давит ножницы',
  paper: 'накрывает камень',
  scissors: 'режут бумагу',
};

const randomMove = (): Move => MOVES[Math.floor(Math.random() * MOVES.length)];

const judge = (player: Move, bot: Move): RoundResult => {
  if (player === bot) return 'draw';
  if (
    (player === 'rock' && bot === 'scissors') ||
    (player === 'paper' && bot === 'rock') ||
    (player === 'scissors' && bot === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
};

const getImpactKind = (player: Move, bot: Move): ImpactKind => {
  if (player === bot) return 'tie';
  const winningMove = judge(player, bot) === 'win' ? player : bot;
  if (winningMove === 'rock') return 'crush';
  if (winningMove === 'scissors') return 'cut';
  return 'wrap';
};

const getResultText = (result: RoundResult | null, player: Move | null, bot: Move | null) => {
  if (!result || !player || !bot) return 'Сделай выбор';
  if (result === 'draw') return `${MOVE_LABEL[player]} против ${MOVE_LABEL[bot]} — ничья`;
  if (result === 'win') return `${MOVE_LABEL[player]} побеждает ${MOVE_LABEL[bot]}`;
  return `${MOVE_LABEL[bot]} побеждает ${MOVE_LABEL[player]}`;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

type ObjectArtProps = {
  move: Move;
  side?: 'left' | 'right';
  small?: boolean;
};

function RockArt({ side = 'left', small = false }: Pick<ObjectArtProps, 'side' | 'small'>) {
  const id = `rock-${side}-${small ? 's' : 'b'}`;

  return (
    <svg className={cx('moveSvg', small && 'smallSvg')} viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-body`} cx="36%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="19%" stopColor="#cbd5e1" />
          <stop offset="56%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#273449" />
        </radialGradient>
        <linearGradient id={`${id}-edge`} x1="40" y1="25" x2="210" y2="210">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.62" />
          <stop offset="55%" stopColor="#475569" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.55" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="12" floodColor="#000" floodOpacity="0.42" />
          <feDropShadow dx="-8" dy="-10" stdDeviation="8" floodColor="#fff" floodOpacity="0.1" />
        </filter>
      </defs>

      <ellipse cx="122" cy="198" rx="75" ry="15" fill="#020617" opacity="0.24" />
      <g filter={`url(#${id}-shadow)`}>
        <path
          d="M39 129 C30 98 51 63 84 51 C102 27 144 30 166 48 C199 50 221 79 217 113 C231 144 205 181 172 190 C146 214 104 209 84 193 C50 190 28 162 39 129 Z"
          fill={`url(#${id}-body)`}
        />
        <path
          d="M39 129 C30 98 51 63 84 51 C102 27 144 30 166 48 C199 50 221 79 217 113 C231 144 205 181 172 190 C146 214 104 209 84 193 C50 190 28 162 39 129 Z"
          fill={`url(#${id}-edge)`}
        />
        <path
          d="M71 117 C89 103 109 104 123 119 C144 109 165 113 181 129"
          fill="none"
          stroke="#1e293b"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.42"
        />
        <path
          d="M103 70 C119 62 143 65 157 79"
          fill="none"
          stroke="#f8fafc"
          strokeWidth="11"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M83 151 L110 140 L126 160 L155 144"
          fill="none"
          stroke="#0f172a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.35"
        />
        <circle cx="78" cy="86" r="8" fill="#fff" opacity="0.2" />
        <circle cx="188" cy="116" r="12" fill="#020617" opacity="0.14" />
        <circle cx="147" cy="178" r="9" fill="#020617" opacity="0.18" />
      </g>
    </svg>
  );
}

function PaperArt({ side = 'left', small = false }: Pick<ObjectArtProps, 'side' | 'small'>) {
  const id = `paper-${side}-${small ? 's' : 'b'}`;

  return (
    <svg className={cx('moveSvg', small && 'smallSvg')} viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sheet`} x1="54" y1="30" x2="187" y2="214">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="48%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
        <linearGradient id={`${id}-fold`} x1="155" y1="28" x2="205" y2="84">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="100%" stopColor="#eff6ff" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="13" floodColor="#000" floodOpacity="0.36" />
        </filter>
      </defs>

      <ellipse cx="120" cy="202" rx="72" ry="14" fill="#020617" opacity="0.22" />
      <g filter={`url(#${id}-shadow)`}>
        <path
          d="M66 31 H156 L201 77 V202 C201 213 193 221 181 221 H61 C49 221 41 213 41 201 V56 C41 41 51 31 66 31 Z"
          fill={`url(#${id}-sheet)`}
        />
        <path d="M156 31 V70 C156 79 164 86 173 86 H201 Z" fill={`url(#${id}-fold)`} />
        <path d="M156 31 V70 C156 79 164 86 173 86 H201" fill="none" stroke="#60a5fa" strokeWidth="4" opacity="0.38" />
        <path
          d="M69 91 H162 M69 118 H174 M69 145 H154 M69 172 H135"
          stroke="#2563eb"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d="M58 64 C82 48 103 47 125 62"
          fill="none"
          stroke="#fff"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M52 199 C81 189 111 195 137 209 C157 220 184 215 201 201 V202 C201 213 193 221 181 221 H61 C51 221 43 215 41 205 C44 203 48 201 52 199 Z"
          fill="#1d4ed8"
          opacity="0.08"
        />
        <circle cx="171" cy="168" r="18" fill="#f97316" opacity="0.22" />
        <path d="M162 168 L168 176 L183 158" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
      </g>
    </svg>
  );
}

function ScissorsArt({ side = 'left', small = false }: Pick<ObjectArtProps, 'side' | 'small'>) {
  const id = `scissors-${side}-${small ? 's' : 'b'}`;

  return (
    <svg className={cx('moveSvg', small && 'smallSvg')} viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-blade`} x1="55" y1="55" x2="203" y2="162">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="42%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id={`${id}-metalDark`} x1="60" y1="190" x2="205" y2="80">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="11" floodColor="#000" floodOpacity="0.4" />
        </filter>
      </defs>

      <ellipse cx="120" cy="204" rx="72" ry="15" fill="#020617" opacity="0.24" />
      <g filter={`url(#${id}-shadow)`}>
        <path
          d="M113 118 C135 94 166 62 209 38 C191 82 163 112 128 132 Z"
          fill={`url(#${id}-blade)`}
          stroke="#475569"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M122 128 C154 141 184 160 211 201 C166 188 133 164 112 141 Z"
          fill={`url(#${id}-blade)`}
          stroke="#475569"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M121 126 L50 61"
          stroke={`url(#${id}-metalDark)`}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M116 136 L52 183"
          stroke={`url(#${id}-metalDark)`}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <circle cx="119" cy="130" r="13" fill="#facc15" stroke="#713f12" strokeWidth="5" />
        <circle cx="52" cy="59" r="31" fill="none" stroke="#fb7185" strokeWidth="14" />
        <circle cx="49" cy="185" r="32" fill="none" stroke="#38bdf8" strokeWidth="14" />
        <circle cx="52" cy="59" r="15" fill="#020617" opacity="0.2" />
        <circle cx="49" cy="185" r="16" fill="#020617" opacity="0.18" />
        <path d="M151 91 L185 62" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
        <path d="M157 155 L188 180" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.45" />
      </g>
    </svg>
  );
}

function MoveArt({ move, side = 'left', small = false }: ObjectArtProps) {
  if (move === 'rock') return <RockArt side={side} small={small} />;
  if (move === 'paper') return <PaperArt side={side} small={small} />;
  return <ScissorsArt side={side} small={small} />;
}

function MysteryArt({ side = 'left' }: { side?: 'left' | 'right' }) {
  return (
    <svg className="moveSvg mysterySvg" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <radialGradient id={`mystery-${side}`} cx="35%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="42%" stopColor="#8b5cf6" stopOpacity="0.78" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="202" rx="72" ry="15" fill="#020617" opacity="0.22" />
      <circle cx="120" cy="118" r="76" fill={`url(#mystery-${side})`} />
      <circle cx="120" cy="118" r="78" fill="none" stroke="#fff" strokeWidth="4" opacity="0.2" />
      <text x="120" y="142" textAnchor="middle" fontSize="82" fontWeight="900" fill="#fff" opacity="0.92">
        ?
      </text>
    </svg>
  );
}

function SparkField({ impactKind, active }: { impactKind: ImpactKind; active: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        angle: (i / 26) * 360 + (i % 5) * 8,
        distance: 72 + (i % 7) * 14,
        size: 5 + (i % 4) * 3,
        delay: `${(i % 8) * 26}ms`,
      })),
    [],
  );

  return (
    <div className={cx('impactLayer', active && 'active', `impact-${impactKind}`)} aria-hidden="true">
      <div className="shockwave one" />
      <div className="shockwave two" />
      <div className="impactFlash" />
      {impactKind === 'cut' && (
        <>
          <div className="slash slashA" />
          <div className="slash slashB" />
        </>
      )}
      {impactKind === 'wrap' && (
        <>
          <div className="wrapRibbon ribbonA" />
          <div className="wrapRibbon ribbonB" />
          <div className="wrapRibbon ribbonC" />
        </>
      )}
      {impactKind === 'crush' && (
        <>
          <div className="crack crackA" />
          <div className="crack crackB" />
          <div className="crack crackC" />
        </>
      )}
      {pieces.map(piece => (
        <i
          key={piece.id}
          className="spark"
          style={
            {
              '--a': `${piece.angle}deg`,
              '--d': `${piece.distance}px`,
              '--s': `${piece.size}px`,
              '--delay': piece.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ChoiceButton({ move, selected, onClick }: { move: Move; selected: boolean; onClick: () => void }) {
  return (
    <button className={cx('choiceButton', selected && 'selected')} onClick={onClick} type="button">
      <span className="choiceArt">
        <MoveArt move={move} small />
      </span>
      <span className="choiceName">{MOVE_LABEL[move]}</span>
      <span className="choiceHint">{MOVE_HINT[move]}</span>
    </button>
  );
}

export const RockPaperScissorsDuelGame: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('choosing');
  const [score, setScore] = useState<Score>({ player: 0, bot: 0 });
  const [selected, setSelected] = useState<Move | null>(null);
  const [botMove, setBotMove] = useState<Move | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [impactKind, setImpactKind] = useState<ImpactKind>('tie');
  const [countdown, setCountdown] = useState(CHOOSE_MS);
  const [roundNumber, setRoundNumber] = useState(1);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const selectedRef = useRef<Move | null>(null);
  const phaseRef = useRef<Phase>('choosing');
  const scoreRef = useRef<Score>({ player: 0, bot: 0 });
  const rafRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const matchWinner = score.player >= WIN_TARGET ? 'player' : score.bot >= WIN_TARGET ? 'bot' : null;
  const timerRatio = Math.max(0, Math.min(1, countdown / CHOOSE_MS));
  const timerSeconds = Math.ceil(countdown / 1000);
  const playerSideResult = roundResult === 'draw' ? 'draw' : roundResult === 'win' ? 'win' : roundResult === 'lose' ? 'lose' : 'idle';
  const botSideResult = roundResult === 'draw' ? 'draw' : roundResult === 'win' ? 'lose' : roundResult === 'lose' ? 'win' : 'idle';

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach(id => window.clearTimeout(id));
    timeoutsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const pushTimeout = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(callback, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const startRound = useCallback(() => {
    clearTimers();
    selectedRef.current = null;
    phaseRef.current = 'choosing';
    setPhase('choosing');
    setSelected(null);
    setBotMove(null);
    setRoundResult(null);
    setImpactKind('tie');
    setCountdown(CHOOSE_MS);
    setRoundNumber(v => v + 1);
  }, [clearTimers]);

  const resolveRound = useCallback(() => {
    if (phaseRef.current !== 'choosing') return;

    phaseRef.current = 'reveal';
    setPhase('reveal');
    setCountdown(0);

    const player = selectedRef.current ?? randomMove();
    const bot = randomMove();
    const result = judge(player, bot);
    const impact = getImpactKind(player, bot);

    const newScore: Score = {
      player: scoreRef.current.player + (result === 'win' ? 1 : 0),
      bot: scoreRef.current.bot + (result === 'lose' ? 1 : 0),
    };

    scoreRef.current = newScore;
    selectedRef.current = player;

    setSelected(player);
    setBotMove(bot);
    setRoundResult(result);
    setImpactKind(impact);
    setScore(newScore);
    setHistory(prev => [{ result, player, bot }, ...prev].slice(0, 9));

    pushTimeout(() => {
      if (newScore.player >= WIN_TARGET || newScore.bot >= WIN_TARGET) {
        phaseRef.current = 'matchOver';
        setPhase('matchOver');
      } else {
        phaseRef.current = 'result';
        setPhase('result');
        pushTimeout(startRound, 1450);
      }
    }, 2450);
  }, [pushTimeout, startRound]);

  const chooseMove = useCallback(
    (move: Move) => {
      if (phaseRef.current !== 'choosing') return;
      selectedRef.current = move;
      setSelected(move);
    },
    [],
  );

  const resetMatch = useCallback(() => {
    clearTimers();
    scoreRef.current = { player: 0, bot: 0 };
    selectedRef.current = null;
    phaseRef.current = 'choosing';
    setScore({ player: 0, bot: 0 });
    setSelected(null);
    setBotMove(null);
    setRoundResult(null);
    setImpactKind('tie');
    setCountdown(CHOOSE_MS);
    setRoundNumber(1);
    setHistory([]);
    setPhase('choosing');
  }, [clearTimers]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (phase !== 'choosing') return;

    const startedAt = performance.now();
    const tick = (now: number) => {
      const left = Math.max(0, CHOOSE_MS - (now - startedAt));
      setCountdown(left);

      if (left <= 0) {
        resolveRound();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [phase, resolveRound]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === '1' || key === 'r' || key === 'к') chooseMove('rock');
      if (key === '2' || key === 'p' || key === 'б') chooseMove('paper');
      if (key === '3' || key === 's' || key === 'н') chooseMove('scissors');
      if ((key === 'enter' || key === ' ') && phaseRef.current === 'matchOver') resetMatch();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chooseMove, resetMatch]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const resultText = getResultText(roundResult, selected, botMove);
  const leftMove = selected;
  const rightMove = phase === 'choosing' ? null : botMove;

  return (
    <div className={cx('rpsPage', `phase-${phase}`, `impactMode-${impactKind}`)}>
      <style>{styles}</style>

      <div className="funBackdrop" aria-hidden="true">
        {Array.from({ length: 34 }, (_, i) => (
          <span
            key={i}
            className="floatShape"
            style={
              {
                '--x': `${(i * 29 + 7) % 100}%`,
                '--y': `${(i * 47 + 13) % 100}%`,
                '--d': `${7 + (i % 8)}s`,
                '--r': `${(i * 31) % 360}deg`,
                '--s': `${0.55 + (i % 5) * 0.12}`,
              } as React.CSSProperties
            }
          >
            {['✦', '●', '◆', '✧', '×'][i % 5]}
          </span>
        ))}
        <div className="gridGlow" />
        <div className="spotlight left" />
        <div className="spotlight right" />
      </div>

      <header className="topHud">
        <div className="scorePanel">
          <div className="scoreSide player">
            <span>Ты</span>
            <strong>{score.player}</strong>
          </div>
          <div className="scoreCenter">
            <span>до {WIN_TARGET} побед</span>
            <b>Бой {roundNumber}</b>
          </div>
          <div className="scoreSide bot">
            <span>Бот</span>
            <strong>{score.bot}</strong>
          </div>
        </div>

        <div
          className={cx('timerPanel', phase !== 'choosing' && 'locked')}
          style={
            {
              '--timer': timerRatio,
            } as React.CSSProperties
          }
        >
          <div className="timerNumber">
            {phase === 'choosing' ? timerSeconds : phase === 'matchOver' ? 'END' : 'CLASH'}
          </div>
          <div className="timerTrack">
            <div className="timerFill" />
            <div className="timerComet" />
          </div>
        </div>
      </header>

      <main className="arenaWrap">
        <section className={cx('arena', `result-${playerSideResult}`, `bot-${botSideResult}`)}>
          <div className="arenaFloor" />
          <div className="versusCore" aria-hidden="true">
            <span>VS</span>
          </div>

          <div className={cx('fighter leftFighter', phase === 'reveal' && 'reveal', playerSideResult)}>
            <div className="fighterLabel">Твой ход</div>
            <div className="objectRig playerRig">{leftMove ? <MoveArt move={leftMove} side="left" /> : <MysteryArt side="left" />}</div>
          </div>

          <div className={cx('fighter rightFighter', phase === 'reveal' && 'reveal', botSideResult)}>
            <div className="fighterLabel">Бот</div>
            <div className="objectRig botRig">{rightMove ? <MoveArt move={rightMove} side="right" /> : <MysteryArt side="right" />}</div>
          </div>

          <SparkField impactKind={impactKind} active={phase === 'reveal'} />

          {phase === 'choosing' && (
            <div className="choiceDock">
              <div className="choiceTitle">
                <strong>Выбери ход</strong>
                <span>{selected ? `${MOVE_LABEL[selected]} выбран — можно поменять до нуля` : '5 секунд до вскрытия'}</span>
              </div>
              <div className="choices">
                {MOVES.map(move => (
                  <ChoiceButton key={move} move={move} selected={selected === move} onClick={() => chooseMove(move)} />
                ))}
              </div>
            </div>
          )}

          {(phase === 'reveal' || phase === 'result') && (
            <div className={cx('resultBanner', roundResult && `res-${roundResult}`)}>
              <strong>{roundResult === 'win' ? '+1 тебе' : roundResult === 'lose' ? '+1 боту' : 'ничья'}</strong>
              <span>{resultText}</span>
            </div>
          )}

          {phase === 'matchOver' && (
            <div className="matchOverCard">
              <div className="crown">{matchWinner === 'player' ? '🏆' : '🤖'}</div>
              <h2>{matchWinner === 'player' ? 'Победа!' : 'Бот забрал матч'}</h2>
              <p>
                Итог: {score.player}:{score.bot}. Игра шла до {WIN_TARGET} побед, ничьи не дают очков.
              </p>
              <button type="button" onClick={resetMatch}>
                Сыграть ещё
              </button>
            </div>
          )}
        </section>
      </main>

      <div className="historyRail" aria-label="История последних ходов">
        {Array.from({ length: 9 }, (_, i) => {
          const item = history[i];
          return <span key={i} className={cx('historyDot', item && `h-${item.result}`)} />;
        })}
      </div>
    </div>
  );
};

const styles = `
.rpsPage {
  position: relative;
  width: 100%;
  height: min(100dvh, 920px);
  min-height: 560px;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.12), transparent 26%),
    radial-gradient(circle at 18% 20%, rgba(56, 189, 248, 0.28), transparent 31%),
    radial-gradient(circle at 82% 24%, rgba(244, 63, 94, 0.28), transparent 29%),
    linear-gradient(135deg, #09090b 0%, #111827 44%, #2e1065 100%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  isolation: isolate;
  user-select: none;
}

.rpsPage * {
  box-sizing: border-box;
}

.funBackdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.gridGlow {
  position: absolute;
  inset: auto -10% -26% -10%;
  height: 46%;
  background-image:
    linear-gradient(rgba(255,255,255,.11) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.11) 1px, transparent 1px);
  background-size: 56px 56px;
  transform: perspective(620px) rotateX(64deg);
  transform-origin: center top;
  opacity: .28;
  filter: blur(.2px);
}

.spotlight {
  position: absolute;
  width: 54vw;
  height: 54vw;
  border-radius: 999px;
  filter: blur(50px);
  opacity: .35;
  animation: pulseSpot 4.7s ease-in-out infinite;
}

.spotlight.left {
  left: -20vw;
  top: 18%;
  background: #22d3ee;
}

.spotlight.right {
  right: -20vw;
  top: 14%;
  background: #f43f5e;
  animation-delay: -2s;
}

.floatShape {
  position: absolute;
  left: var(--x);
  top: var(--y);
  font-size: calc(16px * var(--s));
  color: rgba(255,255,255,.34);
  text-shadow: 0 0 18px rgba(255,255,255,.35);
  transform: rotate(var(--r));
  animation: floatShape var(--d) ease-in-out infinite alternate;
}

.topHud {
  position: absolute;
  top: clamp(10px, 2.2vh, 22px);
  left: 50%;
  z-index: 10;
  width: min(460px, calc(100% - 28px));
  transform: translateX(-50%);
  display: grid;
  gap: 10px;
}

.scorePanel {
  height: 70px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 24px;
  background: rgba(4, 7, 18, .68);
  backdrop-filter: blur(18px);
  box-shadow: 0 22px 60px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.08);
}

.scoreSide {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 18px;
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: 11px;
  font-weight: 900;
  color: rgba(255,255,255,.7);
}

.scoreSide strong {
  min-width: 38px;
  text-align: center;
  font-size: 36px;
  line-height: 1;
  letter-spacing: -.08em;
  color: #fff;
}

.scoreSide.player {
  background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(34,197,94,.08));
}

.scoreSide.bot {
  background: linear-gradient(135deg, rgba(244,63,94,.22), rgba(251,146,60,.08));
}

.scoreCenter {
  min-width: 98px;
  text-align: center;
  display: grid;
  gap: 2px;
}

.scoreCenter span {
  font-size: 9px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: .18em;
  color: rgba(255,255,255,.45);
  font-weight: 900;
}

.scoreCenter b {
  font-size: 17px;
  color: #fde68a;
  text-shadow: 0 0 18px rgba(250,204,21,.45);
}

.timerPanel {
  height: 42px;
  display: grid;
  grid-template-columns: 64px 1fr;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.13);
  background: rgba(2, 6, 23, .58);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 40px rgba(0,0,0,.28);
}

.timerNumber {
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 20px;
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.06em;
  color: #020617;
  background: #facc15;
  box-shadow: 0 0 24px rgba(250,204,21,.5);
}

.timerPanel.locked .timerNumber {
  font-size: 12px;
  letter-spacing: .08em;
  background: #fff;
  color: #111827;
}

.timerTrack {
  position: relative;
  height: 13px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.09);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.07);
}

.timerFill {
  position: absolute;
  inset: 0 auto 0 0;
  width: calc(var(--timer) * 100%);
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e 0%, #facc15 58%, #fb7185 100%);
  box-shadow: 0 0 26px rgba(250,204,21,.65);
  transition: width .08s linear;
}

.timerComet {
  position: absolute;
  top: 50%;
  left: calc(var(--timer) * 100%);
  width: 20px;
  height: 20px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: #fff;
  box-shadow: 0 0 22px #fff, 0 0 32px #facc15;
  opacity: calc(.25 + var(--timer) * .75);
}

.arenaWrap {
  position: relative;
  z-index: 2;
  height: 100%;
  padding: clamp(104px, 17vh, 146px) clamp(10px, 3vw, 34px) 28px;
}

.arena {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 1160px;
  margin: 0 auto;
  border-radius: clamp(28px, 5vw, 54px);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.14);
  background:
    radial-gradient(circle at 50% 42%, rgba(255,255,255,.14), transparent 18%),
    radial-gradient(circle at 25% 35%, rgba(14,165,233,.14), transparent 28%),
    radial-gradient(circle at 75% 33%, rgba(244,63,94,.15), transparent 28%),
    linear-gradient(180deg, rgba(15,23,42,.58), rgba(3,7,18,.82));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.09), 0 28px 90px rgba(0,0,0,.45);
  perspective: 1100px;
  transform-style: preserve-3d;
}

.arena::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 0 48%, rgba(255,255,255,.08) 49%, transparent 52%),
    radial-gradient(circle at 50% 50%, rgba(250,204,21,.16), transparent 22%);
  opacity: .62;
  pointer-events: none;
}

.arenaFloor {
  position: absolute;
  left: 50%;
  bottom: -18%;
  width: min(900px, 92vw);
  height: 46%;
  border-radius: 50%;
  transform: translateX(-50%) rotateX(62deg);
  transform-origin: center top;
  background:
    radial-gradient(circle at 50% 34%, rgba(255,255,255,.16), transparent 18%),
    repeating-radial-gradient(circle at center, rgba(255,255,255,.08) 0 3px, transparent 3px 32px),
    linear-gradient(135deg, rgba(14,165,233,.22), rgba(244,63,94,.18));
  box-shadow: 0 0 90px rgba(250,204,21,.16), inset 0 0 0 2px rgba(255,255,255,.08);
  opacity: .72;
}

.versusCore {
  position: absolute;
  left: 50%;
  top: 49%;
  width: clamp(62px, 9vmin, 112px);
  height: clamp(62px, 9vmin, 112px);
  border-radius: 999px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  background: radial-gradient(circle, rgba(250,204,21,.3), rgba(250,204,21,.05) 58%, transparent 70%);
  color: rgba(255,255,255,.6);
  font-weight: 1000;
  letter-spacing: -.06em;
  font-size: clamp(20px, 3vmin, 40px);
  text-shadow: 0 0 20px rgba(255,255,255,.4);
  animation: coreBreathe 2.6s ease-in-out infinite;
}

.fighter {
  position: absolute;
  top: 50%;
  width: min(34vmin, 310px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  transform-style: preserve-3d;
  will-change: transform, filter;
}

.leftFighter {
  left: clamp(12px, 7vw, 92px);
  transform: translate3d(0, -47%, 0) rotateY(-14deg) rotateZ(-2deg);
}

.rightFighter {
  right: clamp(12px, 7vw, 92px);
  transform: translate3d(0, -47%, 0) rotateY(14deg) rotateZ(2deg) scaleX(-1);
}

.fighterLabel {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(2,6,23,.46);
  color: rgba(255,255,255,.62);
  text-transform: uppercase;
  letter-spacing: .16em;
  font-size: 10px;
  font-weight: 1000;
  white-space: nowrap;
  backdrop-filter: blur(10px);
}

.objectRig {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  transform-style: preserve-3d;
  animation: idleHover 2.25s ease-in-out infinite;
  filter: drop-shadow(0 34px 26px rgba(0,0,0,.26));
}

.botRig {
  animation-delay: -1.1s;
}

.moveSvg {
  width: 100%;
  height: 100%;
  overflow: visible;
  transform-style: preserve-3d;
}

.smallSvg {
  width: 82px;
  height: 82px;
}

.mysterySvg {
  opacity: .82;
  filter: saturate(1.25);
}

.phase-choosing .mysterySvg {
  animation: mysteryPulse 1.4s ease-in-out infinite;
}

.leftFighter.reveal.win {
  animation: leftWin 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.leftFighter.reveal.lose {
  animation: leftLose 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.leftFighter.reveal.draw {
  animation: leftDraw 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.rightFighter.reveal.win {
  animation: rightWin 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.rightFighter.reveal.lose {
  animation: rightLose 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.rightFighter.reveal.draw {
  animation: rightDraw 2.35s cubic-bezier(.2,.78,.08,1) both;
}

.leftFighter.reveal.win .objectRig,
.rightFighter.reveal.win .objectRig {
  animation: winnerPulse 2.35s ease both;
}

.leftFighter.reveal.lose .objectRig,
.rightFighter.reveal.lose .objectRig {
  animation: loserDamage 2.35s ease both;
}

.choiceDock {
  position: absolute;
  left: 50%;
  top: 51%;
  z-index: 8;
  width: min(760px, calc(100% - 24px));
  transform: translate(-50%, -50%);
  display: grid;
  gap: clamp(10px, 1.8vh, 16px);
  padding: clamp(14px, 2.1vw, 22px);
  border-radius: clamp(24px, 4vw, 38px);
  background: rgba(2, 6, 23, .62);
  border: 1px solid rgba(255,255,255,.14);
  backdrop-filter: blur(22px);
  box-shadow: 0 34px 86px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
  animation: dockIn .36s ease both;
}

.choiceTitle {
  text-align: center;
  display: grid;
  gap: 2px;
}

.choiceTitle strong {
  font-size: clamp(22px, 3.2vw, 36px);
  line-height: 1;
  letter-spacing: -.06em;
  text-transform: uppercase;
}

.choiceTitle span {
  font-size: clamp(11px, 1.5vw, 14px);
  color: rgba(255,255,255,.58);
  font-weight: 800;
}

.choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.6vw, 16px);
}

.choiceButton {
  position: relative;
  height: clamp(132px, 22vh, 206px);
  min-height: 120px;
  display: grid;
  grid-template-rows: 1fr auto auto;
  justify-items: center;
  align-items: center;
  gap: 2px;
  padding: 9px 8px 13px;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: clamp(20px, 3vw, 32px);
  background:
    radial-gradient(circle at 50% 20%, rgba(255,255,255,.16), transparent 38%),
    rgba(255,255,255,.06);
  color: #fff;
  cursor: pointer;
  transform-style: preserve-3d;
  transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
  overflow: hidden;
}

.choiceButton::before {
  content: '';
  position: absolute;
  inset: -40% -20% auto;
  height: 72%;
  transform: rotate(-12deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
  opacity: 0;
  transition: opacity .18s ease;
}

.choiceButton:hover,
.choiceButton.selected {
  transform: translateY(-6px) rotateX(7deg) scale(1.03);
  border-color: rgba(250,204,21,.62);
  background:
    radial-gradient(circle at 50% 16%, rgba(250,204,21,.3), transparent 45%),
    rgba(255,255,255,.09);
  box-shadow: 0 22px 44px rgba(0,0,0,.28), 0 0 34px rgba(250,204,21,.18);
}

.choiceButton.selected::before,
.choiceButton:hover::before {
  opacity: 1;
  animation: shineSweep 1.1s ease both;
}

.choiceArt {
  width: clamp(82px, 13vmin, 142px);
  height: clamp(82px, 13vmin, 142px);
  display: grid;
  place-items: center;
  transform: translateZ(28px);
}

.choiceName {
  font-size: clamp(15px, 2.2vw, 22px);
  line-height: 1;
  font-weight: 1000;
  letter-spacing: -.04em;
}

.choiceHint {
  font-size: clamp(9px, 1.25vw, 12px);
  line-height: 1;
  color: rgba(255,255,255,.48);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.impactLayer {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1px;
  height: 1px;
  z-index: 6;
  pointer-events: none;
  opacity: 0;
}

.impactLayer.active {
  opacity: 1;
}

.shockwave {
  position: absolute;
  left: 0;
  top: 0;
  width: 88px;
  height: 88px;
  border-radius: 999px;
  border: 3px solid rgba(255,255,255,.72);
  transform: translate(-50%, -50%) scale(.05);
  opacity: 0;
}

.impactLayer.active .shockwave.one {
  animation: shockwave .78s .76s ease-out both;
}

.impactLayer.active .shockwave.two {
  animation: shockwave 1.05s .86s ease-out both;
  border-color: rgba(250,204,21,.54);
}

.impactFlash {
  position: absolute;
  width: 118px;
  height: 118px;
  left: 0;
  top: 0;
  border-radius: 999px;
  transform: translate(-50%, -50%) scale(.15);
  background: radial-gradient(circle, #fff 0 8%, #facc15 20%, rgba(244,63,94,.7) 38%, transparent 70%);
  opacity: 0;
}

.impactLayer.active .impactFlash {
  animation: impactFlash .36s .78s ease-out both;
}

.spark {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--s);
  height: var(--s);
  border-radius: 3px;
  background: #fef08a;
  box-shadow: 0 0 16px #facc15;
  transform: rotate(var(--a)) translateX(0) scale(.2);
  opacity: 0;
}

.impactLayer.active .spark {
  animation: sparkFly .72s cubic-bezier(.15,.8,.18,1) both;
  animation-delay: calc(.74s + var(--delay));
}

.impact-cut .spark {
  background: #bfdbfe;
  box-shadow: 0 0 18px #38bdf8;
}

.impact-wrap .spark {
  background: #f8fafc;
  box-shadow: 0 0 18px #ffffff;
}

.slash {
  position: absolute;
  left: -130px;
  top: -7px;
  width: 260px;
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #fff, #38bdf8, transparent);
  box-shadow: 0 0 30px #38bdf8;
  opacity: 0;
}

.slashA { transform: rotate(-28deg) scaleX(.2); }
.slashB { transform: rotate(24deg) scaleX(.2); }

.impactLayer.active .slashA { animation: slashHit .45s .8s ease-out both; }
.impactLayer.active .slashB { animation: slashHit .45s .9s ease-out both; }

.wrapRibbon {
  position: absolute;
  left: -110px;
  top: -18px;
  width: 220px;
  height: 36px;
  border-radius: 999px;
  border: 8px solid rgba(219,234,254,.95);
  border-left-color: transparent;
  border-bottom-color: transparent;
  transform: rotate(0deg) scale(.15);
  opacity: 0;
  filter: drop-shadow(0 0 18px rgba(147,197,253,.7));
}

.ribbonB { transform: rotate(70deg) scale(.15); }
.ribbonC { transform: rotate(140deg) scale(.15); }

.impactLayer.active .wrapRibbon { animation: wrapSpin .7s .72s ease-out both; }
.impactLayer.active .ribbonB { animation-delay: .82s; }
.impactLayer.active .ribbonC { animation-delay: .92s; }

.crack {
  position: absolute;
  width: 150px;
  height: 8px;
  left: -75px;
  top: -4px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #020617, #fff7ed, transparent);
  transform: rotate(0deg) scaleX(.1);
  opacity: 0;
}

.crackA { transform: rotate(8deg) scaleX(.1); }
.crackB { transform: rotate(55deg) scaleX(.1); }
.crackC { transform: rotate(-42deg) scaleX(.1); }

.impactLayer.active .crack { animation: crackOpen .62s .78s ease-out both; }
.impactLayer.active .crackB { animation-delay: .85s; }
.impactLayer.active .crackC { animation-delay: .9s; }

.resultBanner {
  position: absolute;
  left: 50%;
  bottom: clamp(18px, 4vh, 42px);
  z-index: 9;
  width: min(560px, calc(100% - 28px));
  transform: translateX(-50%);
  display: grid;
  gap: 3px;
  text-align: center;
  padding: 14px 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,.13);
  background: rgba(2,6,23,.68);
  backdrop-filter: blur(16px);
  box-shadow: 0 24px 54px rgba(0,0,0,.34);
  animation: bannerIn .28s ease both;
}

.resultBanner strong {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .18em;
  font-weight: 1000;
  color: #fde68a;
}

.resultBanner span {
  font-size: clamp(17px, 2.5vw, 28px);
  line-height: 1.05;
  font-weight: 1000;
  letter-spacing: -.05em;
}

.resultBanner.res-win strong { color: #86efac; }
.resultBanner.res-lose strong { color: #fca5a5; }

.matchOverCard {
  position: absolute;
  left: 50%;
  top: 51%;
  z-index: 12;
  width: min(440px, calc(100% - 32px));
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: clamp(22px, 4vw, 36px);
  text-align: center;
  border-radius: 34px;
  border: 1px solid rgba(255,255,255,.15);
  background:
    radial-gradient(circle at 50% 0%, rgba(250,204,21,.23), transparent 42%),
    rgba(2,6,23,.78);
  backdrop-filter: blur(22px);
  box-shadow: 0 34px 90px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.09);
  animation: dockIn .38s ease both;
}

.matchOverCard .crown {
  font-size: 54px;
  filter: drop-shadow(0 16px 20px rgba(0,0,0,.32));
}

.matchOverCard h2 {
  margin: 0;
  font-size: clamp(34px, 6vw, 58px);
  line-height: .9;
  letter-spacing: -.08em;
}

.matchOverCard p {
  margin: 0;
  max-width: 310px;
  color: rgba(255,255,255,.62);
  font-weight: 700;
}

.matchOverCard button {
  margin-top: 4px;
  border: 0;
  border-radius: 999px;
  padding: 14px 22px;
  cursor: pointer;
  color: #020617;
  background: linear-gradient(135deg, #fef08a, #facc15, #fb923c);
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .08em;
  box-shadow: 0 18px 34px rgba(250,204,21,.25);
}

.historyRail {
  position: absolute;
  right: clamp(8px, 2vw, 22px);
  top: 50%;
  z-index: 10;
  transform: translateY(-50%);
  display: grid;
  gap: 8px;
  pointer-events: none;
}

.historyDot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255,255,255,.17);
  box-shadow: 0 0 0 1px rgba(255,255,255,.06);
}

.historyDot.h-win {
  background: #22c55e;
  box-shadow: 0 0 18px rgba(34,197,94,.85);
}

.historyDot.h-lose {
  background: #fb7185;
  box-shadow: 0 0 18px rgba(251,113,133,.85);
}

.historyDot.h-draw {
  background: #facc15;
  box-shadow: 0 0 18px rgba(250,204,21,.85);
}

@keyframes pulseSpot {
  0%, 100% { transform: scale(.92); opacity: .27; }
  50% { transform: scale(1.08); opacity: .42; }
}

@keyframes floatShape {
  from { transform: translate3d(-8px, -12px, 0) rotate(var(--r)) scale(var(--s)); opacity: .15; }
  to { transform: translate3d(12px, 18px, 0) rotate(calc(var(--r) + 44deg)) scale(calc(var(--s) + .25)); opacity: .5; }
}

@keyframes coreBreathe {
  0%, 100% { transform: translate(-50%, -50%) scale(.95); opacity: .55; }
  50% { transform: translate(-50%, -50%) scale(1.08); opacity: .95; }
}

@keyframes idleHover {
  0%, 100% { transform: translate3d(0, -3px, 28px) rotateX(5deg) rotateZ(-1deg); }
  50% { transform: translate3d(0, 7px, 48px) rotateX(-4deg) rotateZ(2deg); }
}

@keyframes mysteryPulse {
  0%, 100% { transform: scale(.92) rotate(-3deg); filter: saturate(1.1); }
  50% { transform: scale(1.03) rotate(3deg); filter: saturate(1.55); }
}

@keyframes dockIn {
  from { opacity: 0; transform: translate(-50%, -45%) scale(.92); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes shineSweep {
  from { transform: translateX(-130%) rotate(-12deg); }
  to { transform: translateX(130%) rotate(-12deg); }
}

@keyframes leftWin {
  0% { transform: translate3d(0, -47%, 0) rotateY(-14deg) rotateZ(-2deg) scale(1); }
  28% { transform: translate3d(7vw, -51%, 110px) rotateY(-30deg) rotateZ(-9deg) scale(1.08); }
  42% { transform: translate3d(24vw, -50%, 180px) rotateY(-4deg) rotateZ(12deg) scale(1.22); }
  55% { transform: translate3d(20vw, -54%, 130px) rotateY(-12deg) rotateZ(-6deg) scale(1.08); }
  100% { transform: translate3d(4vw, -52%, 40px) rotateY(-18deg) rotateZ(-4deg) scale(1.05); }
}

@keyframes leftLose {
  0% { transform: translate3d(0, -47%, 0) rotateY(-14deg) rotateZ(-2deg) scale(1); }
  33% { transform: translate3d(18vw, -50%, 120px) rotateY(-4deg) rotateZ(10deg) scale(1.1); }
  45% { transform: translate3d(21vw, -50%, 150px) rotateY(-10deg) rotateZ(-8deg) scale(.95); }
  68% { transform: translate3d(-10vw, -43%, 15px) rotateY(-58deg) rotateZ(-24deg) scale(.82); filter: brightness(.75) saturate(.7); }
  100% { transform: translate3d(-3vw, -46%, 0) rotateY(-28deg) rotateZ(-14deg) scale(.88); filter: brightness(.88); }
}

@keyframes leftDraw {
  0% { transform: translate3d(0, -47%, 0) rotateY(-14deg) rotateZ(-2deg) scale(1); }
  38% { transform: translate3d(20vw, -50%, 120px) rotateY(-2deg) rotateZ(8deg) scale(1.1); }
  52% { transform: translate3d(16vw, -54%, 90px) rotateY(-30deg) rotateZ(-16deg) scale(.95); }
  100% { transform: translate3d(0, -47%, 0) rotateY(-14deg) rotateZ(-2deg) scale(1); }
}

@keyframes rightWin {
  0% { transform: translate3d(0, -47%, 0) rotateY(14deg) rotateZ(2deg) scaleX(-1) scale(1); }
  28% { transform: translate3d(-7vw, -51%, 110px) rotateY(30deg) rotateZ(9deg) scaleX(-1) scale(1.08); }
  42% { transform: translate3d(-24vw, -50%, 180px) rotateY(4deg) rotateZ(-12deg) scaleX(-1) scale(1.22); }
  55% { transform: translate3d(-20vw, -54%, 130px) rotateY(12deg) rotateZ(6deg) scaleX(-1) scale(1.08); }
  100% { transform: translate3d(-4vw, -52%, 40px) rotateY(18deg) rotateZ(4deg) scaleX(-1) scale(1.05); }
}

@keyframes rightLose {
  0% { transform: translate3d(0, -47%, 0) rotateY(14deg) rotateZ(2deg) scaleX(-1) scale(1); }
  33% { transform: translate3d(-18vw, -50%, 120px) rotateY(4deg) rotateZ(-10deg) scaleX(-1) scale(1.1); }
  45% { transform: translate3d(-21vw, -50%, 150px) rotateY(10deg) rotateZ(8deg) scaleX(-1) scale(.95); }
  68% { transform: translate3d(10vw, -43%, 15px) rotateY(58deg) rotateZ(24deg) scaleX(-1) scale(.82); filter: brightness(.75) saturate(.7); }
  100% { transform: translate3d(3vw, -46%, 0) rotateY(28deg) rotateZ(14deg) scaleX(-1) scale(.88); filter: brightness(.88); }
}

@keyframes rightDraw {
  0% { transform: translate3d(0, -47%, 0) rotateY(14deg) rotateZ(2deg) scaleX(-1) scale(1); }
  38% { transform: translate3d(-20vw, -50%, 120px) rotateY(2deg) rotateZ(-8deg) scaleX(-1) scale(1.1); }
  52% { transform: translate3d(-16vw, -54%, 90px) rotateY(30deg) rotateZ(16deg) scaleX(-1) scale(.95); }
  100% { transform: translate3d(0, -47%, 0) rotateY(14deg) rotateZ(2deg) scaleX(-1) scale(1); }
}

@keyframes winnerPulse {
  0%, 45% { filter: drop-shadow(0 34px 26px rgba(0,0,0,.26)); }
  55% { filter: drop-shadow(0 0 38px rgba(250,204,21,.76)) drop-shadow(0 34px 26px rgba(0,0,0,.2)); }
  100% { filter: drop-shadow(0 0 20px rgba(250,204,21,.34)) drop-shadow(0 34px 26px rgba(0,0,0,.22)); }
}

@keyframes loserDamage {
  0%, 40% { filter: drop-shadow(0 34px 26px rgba(0,0,0,.26)); }
  55% { filter: brightness(.7) saturate(.72) drop-shadow(0 34px 26px rgba(0,0,0,.28)); }
  100% { filter: brightness(.85) saturate(.82) drop-shadow(0 34px 26px rgba(0,0,0,.28)); }
}

@keyframes shockwave {
  0% { opacity: .92; transform: translate(-50%, -50%) scale(.06); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(4.6); }
}

@keyframes impactFlash {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(.2); }
  35% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.9); }
}

@keyframes sparkFly {
  0% { opacity: 0; transform: rotate(var(--a)) translateX(0) scale(.2); }
  18% { opacity: 1; }
  100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) rotate(420deg) scale(1); }
}

@keyframes slashHit {
  0% { opacity: 0; transform: rotate(-28deg) scaleX(.1); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: rotate(-28deg) scaleX(1.28); }
}

@keyframes wrapSpin {
  0% { opacity: 0; transform: rotate(0deg) scale(.15); }
  38% { opacity: 1; }
  100% { opacity: 0; transform: rotate(260deg) scale(1.05); }
}

@keyframes crackOpen {
  0% { opacity: 0; transform: rotate(8deg) scaleX(.1); }
  26% { opacity: 1; }
  100% { opacity: 0; transform: rotate(8deg) scaleX(1.25); }
}

@keyframes bannerIn {
  from { opacity: 0; transform: translate(-50%, 14px) scale(.95); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}

@media (max-height: 660px) {
  .rpsPage {
    min-height: 500px;
  }

  .arenaWrap {
    padding-top: 100px;
    padding-bottom: 16px;
  }

  .scorePanel {
    height: 58px;
  }

  .scoreSide {
    height: 42px;
  }

  .scoreSide strong {
    font-size: 28px;
  }

  .timerPanel {
    height: 34px;
  }

  .choiceButton {
    height: 116px;
    min-height: 106px;
  }

  .choiceArt {
    width: 70px;
    height: 70px;
  }

  .fighterLabel {
    display: none;
  }

  .resultBanner {
    bottom: 12px;
    padding: 10px 14px;
  }
}

@media (max-width: 680px) {
  .rpsPage {
    min-height: 560px;
  }

  .arenaWrap {
    padding-left: 8px;
    padding-right: 8px;
  }

  .scoreCenter {
    min-width: 78px;
  }

  .scoreSide {
    gap: 5px;
    font-size: 9px;
  }

  .scoreSide strong {
    min-width: 28px;
    font-size: 30px;
  }

  .fighter {
    width: min(38vmin, 220px);
  }

  .leftFighter {
    left: -3vw;
  }

  .rightFighter {
    right: -3vw;
  }

  .choiceDock {
    top: 52%;
  }

  .choices {
    gap: 7px;
  }

  .choiceButton {
    border-radius: 22px;
    padding: 7px 4px 10px;
  }

  .choiceHint {
    display: none;
  }

  .historyRail {
    display: none;
  }
}
`;

export default RockPaperScissorsDuelGame;
