import React, { useEffect, useMemo, useRef, useState } from 'react';

type Mark = 'X' | 'O';
type Cell = Mark | null;
type Winner = Mark | 'draw' | null;
type Phase = 'selecting' | 'player_turn' | 'bot_thinking' | 'round_over' | 'match_over';
type Spark = { id: number; x: number; y: number; tx: number; ty: number; delay: number; size: number; hue: number };

type WinResult = {
  winner: Winner;
  line: number[] | null;
};

const TARGET_SCORE = 5;
const HUMAN: Mark = 'X';
const BOT: Mark = 'O';
const BOT_THINK_MS = 650;
const ROUND_END_MS = 1650;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const CELL_LABELS = ['top left', 'top center', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom center', 'bottom right'];

const cloneBoard = (board: Cell[]) => [...board];

function getWinner(board: Cell[]): WinResult {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }

  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

function emptyCells(board: Cell[]) {
  return board.reduce<number[]>((acc, cell, index) => {
    if (!cell) acc.push(index);
    return acc;
  }, []);
}

function findImmediateMove(board: Cell[], mark: Mark) {
  for (const index of emptyCells(board)) {
    const next = cloneBoard(board);
    next[index] = mark;
    if (getWinner(next).winner === mark) return index;
  }
  return null;
}

function minimax(board: Cell[], active: Mark, depth: number, alpha: number, beta: number): number {
  const result = getWinner(board);
  if (result.winner === BOT) return 10 - depth;
  if (result.winner === HUMAN) return depth - 10;
  if (result.winner === 'draw') return 0;

  const cells = emptyCells(board);

  if (active === BOT) {
    let best = -Infinity;
    for (const cell of cells) {
      board[cell] = BOT;
      best = Math.max(best, minimax(board, HUMAN, depth + 1, alpha, beta));
      board[cell] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const cell of cells) {
    board[cell] = HUMAN;
    best = Math.min(best, minimax(board, BOT, depth + 1, alpha, beta));
    board[cell] = null;
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseBotMove(board: Cell[]) {
  const open = emptyCells(board);
  if (!open.length) return null;

  const win = findImmediateMove(board, BOT);
  if (win !== null) return win;

  const block = findImmediateMove(board, HUMAN);
  if (block !== null) return block;

  const moveCount = board.filter(Boolean).length;
  if (moveCount <= 1) {
    if (!board[4]) return 4;
    const corners = [0, 2, 6, 8].filter((i) => !board[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  }

  let bestScore = -Infinity;
  let bestMoves: number[] = [];

  for (const cell of open) {
    board[cell] = BOT;
    const score = minimax(board, HUMAN, 0, -Infinity, Infinity);
    board[cell] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [cell];
    } else if (score === bestScore) {
      bestMoves.push(cell);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? open[0];
}

function getWinClass(line: number[] | null) {
  if (!line) return '';
  const key = line.join('-');
  const map: Record<string, string> = {
    '0-1-2': 'ttt-win-row-1',
    '3-4-5': 'ttt-win-row-2',
    '6-7-8': 'ttt-win-row-3',
    '0-3-6': 'ttt-win-col-1',
    '1-4-7': 'ttt-win-col-2',
    '2-5-8': 'ttt-win-col-3',
    '0-4-8': 'ttt-win-diag-1',
    '2-4-6': 'ttt-win-diag-2',
  };
  return map[key] ?? '';
}

function makeSparks(index: number, mark: Mark): Spark[] {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x = (col + 0.5) * 33.333;
  const y = (row + 0.5) * 33.333;
  const baseHue = mark === 'X' ? 190 : 315;

  return Array.from({ length: 18 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.35;
    const distance = 38 + Math.random() * 54;
    return {
      id: Date.now() + i + Math.floor(Math.random() * 1000),
      x,
      y,
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      delay: Math.random() * 130,
      size: 3 + Math.random() * 5,
      hue: baseHue + Math.random() * 34 - 17,
    };
  });
}

function XMark({ active }: { active?: boolean }) {
  return (
    <svg className={`ttt-mark ttt-x-mark ${active ? 'ttt-hot-mark' : ''}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="tttXStroke" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <filter id="tttXGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.25 0 0 0 0 0.9 0 0 0 0 1 0 0 0 0.9 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path className="ttt-x-shadow" d="M26 24 L76 76" />
      <path className="ttt-x-shadow ttt-x-shadow-2" d="M74 24 L24 76" />
      <path className="ttt-x-line ttt-x-line-a" d="M26 24 L76 76" filter="url(#tttXGlow)" />
      <path className="ttt-x-line ttt-x-line-b" d="M74 24 L24 76" filter="url(#tttXGlow)" />
      <circle className="ttt-x-core" cx="50" cy="50" r="5" />
    </svg>
  );
}

function OMark({ active }: { active?: boolean }) {
  return (
    <svg className={`ttt-mark ttt-o-mark ${active ? 'ttt-hot-mark' : ''}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="tttOStroke" x1="15" y1="12" x2="88" y2="92">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="46%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <filter id="tttOGlow" x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="3.7" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.95 0 0 0 0 0.2 0 0 0 0 0.65 0 0 0 0.95 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle className="ttt-o-shadow" cx="50" cy="50" r="28" />
      <circle className="ttt-o-ring" cx="50" cy="50" r="29" filter="url(#tttOGlow)" />
      <circle className="ttt-o-spark" cx="73" cy="31" r="4" />
      <circle className="ttt-o-spark ttt-o-spark-2" cx="27" cy="69" r="3" />
    </svg>
  );
}

function ScorePips({ score, mark }: { score: number; mark: Mark }) {
  return (
    <div className="ttt-score-pips" aria-label={`${score} wins`}>
      {Array.from({ length: TARGET_SCORE }).map((_, index) => (
        <span key={index} className={`ttt-score-pip ${index < score ? `ttt-score-pip-on ttt-score-${mark}` : ''}`} />
      ))}
    </div>
  );
}

function TinyMark({ mark }: { mark: Mark }) {
  return <span className={`ttt-tiny-mark ttt-tiny-${mark}`}>{mark}</span>;
}

export const TicTacToeGame: React.FC = () => {
  const botTimerRef = useRef<number | null>(null);
  const nextRoundRef = useRef<number | null>(null);
  const sparkTimerRef = useRef<number | null>(null);

  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [phase, setPhase] = useState<Phase>('player_turn');
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [round, setRound] = useState(1);
  const [winner, setWinner] = useState<Winner>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [streak, setStreak] = useState<'player' | 'bot' | 'draw' | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  const status = useMemo(() => {
    if (phase === 'bot_thinking') return 'Bot is reading the board...';
    if (phase === 'round_over') {
      if (winner === HUMAN) return 'You cracked the grid.';
      if (winner === BOT) return 'Bot found the line.';
      return 'Perfect lock. Draw.';
    }
    if (phase === 'match_over') return playerScore >= TARGET_SCORE ? 'Match won.' : 'Bot wins the match.';
    return 'Your move.';
  }, [phase, winner, playerScore]);

  const clearTimers = () => {
    if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    if (nextRoundRef.current !== null) window.clearTimeout(nextRoundRef.current);
    if (sparkTimerRef.current !== null) window.clearTimeout(sparkTimerRef.current);
    botTimerRef.current = null;
    nextRoundRef.current = null;
    sparkTimerRef.current = null;
  };

  const clearTransient = () => {
    setWinner(null);
    setWinningLine(null);
    setLastMove(null);
    setSparks([]);
    setPulseKey((value) => value + 1);
  };

  const finishRound = (nextBoard: Cell[], result: WinResult) => {
    setWinner(result.winner);
    setWinningLine(result.line);
    setPhase(result.winner && result.winner !== null ? 'round_over' : 'player_turn');

    if (!result.winner) return false;

    let nextPlayerScore = playerScore;
    let nextBotScore = botScore;

    if (result.winner === HUMAN) {
      nextPlayerScore += 1;
      setPlayerScore(nextPlayerScore);
      setStreak('player');
    } else if (result.winner === BOT) {
      nextBotScore += 1;
      setBotScore(nextBotScore);
      setStreak('bot');
    } else {
      setStreak('draw');
    }

    const matchDone = nextPlayerScore >= TARGET_SCORE || nextBotScore >= TARGET_SCORE;
    setPhase(matchDone ? 'match_over' : 'round_over');

    if (!matchDone) {
      nextRoundRef.current = window.setTimeout(() => {
        setRound((value) => value + 1);
        setBoard(Array(9).fill(null));
        setPhase('player_turn');
        clearTransient();
      }, ROUND_END_MS);
    }

    return true;
  };

  const playCell = (index: number) => {
    if (phase !== 'player_turn' || board[index] || winner) return;

    const nextBoard = cloneBoard(board);
    nextBoard[index] = HUMAN;
    setBoard(nextBoard);
    setLastMove(index);
    setSparks(makeSparks(index, HUMAN));
    sparkTimerRef.current = window.setTimeout(() => setSparks([]), 760);

    const result = getWinner(nextBoard);
    if (finishRound(nextBoard, result)) return;

    setPhase('bot_thinking');
    botTimerRef.current = window.setTimeout(() => {
      const botIndex = chooseBotMove(nextBoard);
      if (botIndex === null) return;

      const botBoard = cloneBoard(nextBoard);
      botBoard[botIndex] = BOT;
      setBoard(botBoard);
      setLastMove(botIndex);
      setSparks(makeSparks(botIndex, BOT));
      sparkTimerRef.current = window.setTimeout(() => setSparks([]), 760);
      finishRound(botBoard, getWinner(botBoard));
      if (!getWinner(botBoard).winner) setPhase('player_turn');
    }, BOT_THINK_MS);
  };

  const resetRound = () => {
    clearTimers();
    setBoard(Array(9).fill(null));
    setPhase('player_turn');
    clearTransient();
  };

  const resetMatch = () => {
    clearTimers();
    setBoard(Array(9).fill(null));
    setPhase('player_turn');
    setPlayerScore(0);
    setBotScore(0);
    setRound(1);
    setStreak(null);
    clearTransient();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && phase === 'match_over') {
        event.preventDefault();
        resetMatch();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetMatch();
        return;
      }

      const num = Number(event.key);
      if (num >= 1 && num <= 9) {
        event.preventDefault();
        playCell(num - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => clearTimers, []);

  const cellsLeft = emptyCells(board).length;
  const boardLocked = phase !== 'player_turn';
  const winClass = getWinClass(winningLine);

  return (
    <div className="ttt-page">
      <style>{styles}</style>

      <div className="ttt-bg-orb ttt-bg-orb-a" />
      <div className="ttt-bg-orb ttt-bg-orb-b" />
      <div className="ttt-bg-orb ttt-bg-orb-c" />
      <div className="ttt-grid-bg" />
      <div className="ttt-noise" />

      <main className="ttt-shell">
        <header className="ttt-topbar">
          <div className="ttt-player-card ttt-card-human">
            <div className="ttt-player-title"><TinyMark mark="X" /> You</div>
            <ScorePips score={playerScore} mark="X" />
          </div>

          <div className="ttt-center-score">
            <div className="ttt-match-title">Neon Grid Duel</div>
            <div className="ttt-scoreline">
              <span>{playerScore}</span>
              <em>to {TARGET_SCORE}</em>
              <span>{botScore}</span>
            </div>
            <div className="ttt-status" key={`${phase}-${winner}-${pulseKey}`}>{status}</div>
          </div>

          <div className="ttt-player-card ttt-card-bot">
            <div className="ttt-player-title">Bot <TinyMark mark="O" /></div>
            <ScorePips score={botScore} mark="O" />
          </div>
        </header>

        <section className={`ttt-arena ${boardLocked ? 'ttt-locked' : ''} ${streak ? `ttt-streak-${streak}` : ''}`}>
          <div className="ttt-arena-ring ttt-ring-1" />
          <div className="ttt-arena-ring ttt-ring-2" />
          <div className="ttt-arena-light" />

          <div className="ttt-board-wrap">
            <div className="ttt-board-shadow" />
            <div className={`ttt-board ${winClass}`}>
              {board.map((cell, index) => {
                const isWinCell = !!winningLine?.includes(index);
                const isLast = lastMove === index;
                return (
                  <button
                    key={index}
                    className={`ttt-cell ${cell ? 'ttt-cell-filled' : ''} ${isWinCell ? 'ttt-cell-win' : ''} ${isLast ? 'ttt-last-move' : ''}`}
                    onClick={() => playCell(index)}
                    disabled={boardLocked || !!cell}
                    aria-label={cell ? `${CELL_LABELS[index]} occupied by ${cell}` : `place X on ${CELL_LABELS[index]}`}
                  >
                    <span className="ttt-cell-gloss" />
                    <span className="ttt-cell-id">{index + 1}</span>
                    {!cell && phase === 'player_turn' && <span className="ttt-hover-mark">X</span>}
                    {cell === 'X' && <XMark active={isWinCell || isLast} />}
                    {cell === 'O' && <OMark active={isWinCell || isLast} />}
                  </button>
                );
              })}
              {winningLine && winner !== 'draw' && <div className={`ttt-win-beam ${winClass}`} />}
            </div>

            {sparks.map((spark) => (
              <span
                key={spark.id}
                className="ttt-spark"
                style={{
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: `${spark.size}px`,
                  height: `${spark.size}px`,
                  background: `hsl(${spark.hue}, 95%, 67%)`,
                  boxShadow: `0 0 18px hsl(${spark.hue}, 95%, 67%)`,
                  '--tx': `${spark.tx}px`,
                  '--ty': `${spark.ty}px`,
                  animationDelay: `${spark.delay}ms`,
                } as React.CSSProperties}
              />
            ))}

            {phase === 'bot_thinking' && (
              <div className="ttt-thinking-badge">
                <span />
                <span />
                <span />
                Bot thinking
              </div>
            )}
          </div>
        </section>

        <footer className="ttt-footer">
          <div className="ttt-round-chip">Round {round}</div>
          <div className="ttt-round-chip">Cells {cellsLeft}</div>
          <button className="ttt-soft-button" onClick={resetRound}>Reset round</button>
          <button className="ttt-soft-button" onClick={resetMatch}>Reset match</button>
        </footer>
      </main>

      {(phase === 'round_over' || phase === 'match_over') && (
        <div className="ttt-result-layer">
          <div className={`ttt-result-card ${winner === HUMAN ? 'ttt-result-win' : winner === BOT ? 'ttt-result-lose' : 'ttt-result-draw'}`}>
            <div className="ttt-result-kicker">{phase === 'match_over' ? 'Match complete' : 'Round complete'}</div>
            <div className="ttt-result-title">
              {phase === 'match_over'
                ? playerScore >= TARGET_SCORE
                  ? 'You win the duel'
                  : 'Bot wins the duel'
                : winner === HUMAN
                  ? 'Line captured'
                  : winner === BOT
                    ? 'Bot scores'
                    : 'Draw'}
            </div>
            <div className="ttt-result-text">
              {phase === 'match_over'
                ? 'Press Enter or hit restart to run it back.'
                : 'Next board is loading...'}
            </div>
            {phase === 'match_over' && (
              <button className="ttt-main-button" onClick={resetMatch}>Play again</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const TicTacToeDuelGame = TicTacToeGame;
export const TicTacToe = TicTacToeGame;
export default TicTacToeGame;

const styles = `
.ttt-page {
  position: relative;
  height: 100dvh;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 50% 14%, rgba(125, 211, 252, 0.16), transparent 32%),
    radial-gradient(circle at 18% 80%, rgba(236, 72, 153, 0.14), transparent 35%),
    linear-gradient(135deg, #030712 0%, #08111f 42%, #12071e 100%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  isolation: isolate;
}

.ttt-grid-bg {
  position: absolute;
  inset: -20%;
  z-index: -5;
  background-image:
    linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
  background-size: 72px 72px;
  transform: perspective(760px) rotateX(64deg) translateY(24%);
  transform-origin: center bottom;
  animation: tttGridDrift 16s linear infinite;
  opacity: 0.65;
}

.ttt-noise {
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  opacity: 0.15;
  background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.14) 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.1) 0 1px, transparent 1px);
  background-size: 34px 34px, 53px 53px;
  mix-blend-mode: overlay;
}

.ttt-bg-orb {
  position: absolute;
  z-index: -4;
  border-radius: 999px;
  filter: blur(14px);
  opacity: 0.68;
  pointer-events: none;
}

.ttt-bg-orb-a {
  width: 360px;
  height: 360px;
  left: -110px;
  top: 12%;
  background: radial-gradient(circle, rgba(34,211,238,0.32), transparent 68%);
  animation: tttFloat 8s ease-in-out infinite;
}

.ttt-bg-orb-b {
  width: 410px;
  height: 410px;
  right: -130px;
  bottom: 5%;
  background: radial-gradient(circle, rgba(217,70,239,0.26), transparent 66%);
  animation: tttFloat 9s ease-in-out infinite reverse;
}

.ttt-bg-orb-c {
  width: 260px;
  height: 260px;
  right: 25%;
  top: -70px;
  background: radial-gradient(circle, rgba(250,204,21,0.16), transparent 68%);
  animation: tttPulseOrb 5s ease-in-out infinite;
}

.ttt-shell {
  position: relative;
  z-index: 2;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: clamp(6px, 1vh, 12px);
  padding: clamp(8px, 1.4vw, 16px);
}

.ttt-topbar {
  display: grid;
  grid-template-columns: minmax(110px, 200px) minmax(160px, 1fr) minmax(110px, 200px);
  gap: clamp(7px, 1.4vw, 12px);
  align-items: center;
}

.ttt-player-card,
.ttt-center-score,
.ttt-footer,
.ttt-thinking-badge,
.ttt-result-card {
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045));
  box-shadow: 0 24px 70px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.12);
  backdrop-filter: blur(18px);
}

.ttt-player-card {
  min-height: 52px;
  border-radius: 20px;
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.ttt-card-human {
  box-shadow: 0 24px 70px rgba(0,0,0,0.32), 0 0 38px rgba(34,211,238,0.09), inset 0 1px 0 rgba(255,255,255,0.12);
}

.ttt-card-bot {
  text-align: right;
  box-shadow: 0 24px 70px rgba(0,0,0,0.32), 0 0 38px rgba(244,114,182,0.08), inset 0 1px 0 rgba(255,255,255,0.12);
}

.ttt-player-title {
  display: flex;
  align-items: center;
  gap: 7px;
  justify-content: inherit;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(255,255,255,0.7);
  font-weight: 900;
}

.ttt-card-bot .ttt-player-title { justify-content: flex-end; }

.ttt-center-score {
  min-height: 58px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  padding: 7px 16px;
  text-align: center;
}

.ttt-match-title {
  font-size: clamp(8px, 0.9vw, 11px);
  text-transform: uppercase;
  letter-spacing: 0.26em;
  color: rgba(255,255,255,0.54);
  font-weight: 950;
}

.ttt-scoreline {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  margin-top: 1px;
  font-weight: 1000;
}

.ttt-scoreline span {
  font-size: clamp(24px, 3.1vw, 38px);
  line-height: 0.9;
  letter-spacing: -0.08em;
  text-shadow: 0 0 28px rgba(255,255,255,0.12);
}

.ttt-scoreline em {
  font-size: 8px;
  font-style: normal;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.42);
}

.ttt-status {
  min-height: 12px;
  margin-top: 1px;
  font-size: clamp(9px, 1vw, 11px);
  font-weight: 800;
  color: rgba(255,255,255,0.72);
  animation: tttStatusIn 280ms ease both;
}

.ttt-score-pips {
  display: flex;
  gap: 5px;
  align-items: center;
}

.ttt-card-bot .ttt-score-pips { justify-content: flex-end; }

.ttt-score-pip {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.08);
  transition: transform 360ms cubic-bezier(.2,.9,.2,1), background 360ms ease, box-shadow 360ms ease;
}

.ttt-score-pip-on {
  transform: scale(1.18);
}

.ttt-score-X {
  background: #22d3ee;
  box-shadow: 0 0 20px rgba(34,211,238,0.9);
}

.ttt-score-O {
  background: #f472b6;
  box-shadow: 0 0 20px rgba(244,114,182,0.9);
}

.ttt-tiny-mark {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 8px;
  font-weight: 1000;
  letter-spacing: -0.08em;
}

.ttt-tiny-X {
  color: #cffafe;
  background: rgba(34,211,238,0.15);
  box-shadow: 0 0 18px rgba(34,211,238,0.24);
}

.ttt-tiny-O {
  color: #fce7f3;
  background: rgba(244,114,182,0.15);
  box-shadow: 0 0 18px rgba(244,114,182,0.22);
}

.ttt-arena {
  position: relative;
  display: grid;
  place-items: start center;
  align-content: start;
  min-height: 0;
  perspective: 1200px;
  padding-top: clamp(30px, 5vh, 40px);
}

.ttt-arena-light {
  position: absolute;
  width: min(80vw, 760px);
  height: min(80vw, 760px);
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255,255,255,0.13), rgba(34,211,238,0.08) 28%, transparent 64%);
  filter: blur(4px);
  animation: tttArenaBreath 4s ease-in-out infinite;
}

.ttt-arena-ring {
  position: absolute;
  width: min(82vw, 690px);
  height: min(82vw, 690px);
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  pointer-events: none;
}

.ttt-ring-1 { animation: tttRotate 18s linear infinite; }
.ttt-ring-2 {
  width: min(70vw, 580px);
  height: min(70vw, 580px);
  border-style: dashed;
  border-color: rgba(255,255,255,0.1);
  animation: tttRotate 24s linear infinite reverse;
}

.ttt-board-wrap {
  position: relative;
  width: min(62vh, 82vw, 620px);
  aspect-ratio: 1;
  transform-style: preserve-3d;
  animation: tttBoardIn 740ms cubic-bezier(.2,.9,.15,1) both;
  margin-top: clamp(-18px, -1.6vh, -4px);
}

.ttt-board-shadow {
  position: absolute;
  inset: 10%;
  transform: translateY(18%) rotateX(66deg);
  border-radius: 32%;
  background: radial-gradient(circle, rgba(0,0,0,0.42), transparent 72%);
  filter: blur(18px);
}

.ttt-board {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(6px, 1vw, 12px);
  padding: clamp(8px, 1.1vw, 14px);
  border-radius: clamp(32px, 5vw, 54px);
  background:
    linear-gradient(135deg, rgba(255,255,255,0.19), rgba(255,255,255,0.055)),
    radial-gradient(circle at 50% 0%, rgba(125,211,252,0.18), transparent 46%),
    rgba(2,6,23,0.68);
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow:
    0 42px 120px rgba(0,0,0,0.48),
    0 0 80px rgba(34,211,238,0.11),
    inset 0 1px 0 rgba(255,255,255,0.2),
    inset 0 -40px 80px rgba(0,0,0,0.2);
  backdrop-filter: blur(18px);
  transform: rotateX(6deg) rotateY(0deg);
  transition: transform 500ms cubic-bezier(.2,.9,.2,1), filter 400ms ease;
}

.ttt-board::before,
.ttt-board::after {
  content: '';
  position: absolute;
  pointer-events: none;
  border-radius: inherit;
}

.ttt-board::before {
  inset: 11px;
  border: 1px solid rgba(255,255,255,0.07);
}

.ttt-board::after {
  inset: -2px;
  background: conic-gradient(from 0deg, transparent, rgba(34,211,238,0.18), transparent, rgba(244,114,182,0.18), transparent);
  filter: blur(18px);
  z-index: -1;
  animation: tttGlowSpin 8s linear infinite;
}

.ttt-locked .ttt-board {
  transform: rotateX(6deg) scale(0.985);
  filter: saturate(1.1);
}

.ttt-cell {
  position: relative;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: clamp(20px, 3vw, 38px);
  background:
    radial-gradient(circle at 30% 18%, rgba(255,255,255,0.18), transparent 28%),
    linear-gradient(145deg, rgba(15,23,42,0.88), rgba(2,6,23,0.72));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    inset 0 -18px 30px rgba(0,0,0,0.22),
    0 18px 38px rgba(0,0,0,0.18);
  cursor: pointer;
  overflow: hidden;
  transform: translateZ(0);
  transition: transform 220ms cubic-bezier(.2,.9,.2,1), border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
  appearance: none;
  padding: 0;
}

.ttt-cell:disabled {
  cursor: default;
}

.ttt-cell:not(:disabled):hover {
  transform: translateY(-4px) translateZ(22px) scale(1.015);
  border-color: rgba(103,232,249,0.5);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    inset 0 -18px 30px rgba(0,0,0,0.20),
    0 22px 42px rgba(0,0,0,0.2),
    0 0 36px rgba(34,211,238,0.12);
}

.ttt-cell-filled {
  background:
    radial-gradient(circle at 50% 32%, rgba(255,255,255,0.14), transparent 34%),
    linear-gradient(145deg, rgba(15,23,42,0.94), rgba(3,7,18,0.82));
}

.ttt-cell-win {
  animation: tttWinCell 880ms ease-in-out infinite alternate;
}

.ttt-last-move {
  animation: tttLastCell 420ms cubic-bezier(.2,.9,.1,1) both;
}

.ttt-cell-gloss {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,0.13), transparent 42%);
  opacity: 0.8;
}

.ttt-cell-id {
  position: absolute;
  top: 12px;
  left: 14px;
  font-size: clamp(9px, 1.2vw, 12px);
  font-weight: 1000;
  color: rgba(255,255,255,0.13);
}

.ttt-hover-mark {
  position: absolute;
  font-size: clamp(52px, 12vw, 116px);
  font-weight: 1000;
  color: rgba(103,232,249,0.09);
  text-shadow: 0 0 28px rgba(34,211,238,0.08);
  transform: scale(0.7) rotate(-8deg);
  opacity: 0;
  transition: opacity 180ms ease, transform 180ms ease;
}

.ttt-cell:not(:disabled):hover .ttt-hover-mark {
  opacity: 1;
  transform: scale(1) rotate(-8deg);
}

.ttt-mark {
  width: 76%;
  height: 76%;
  overflow: visible;
  transform-origin: 50% 50%;
}

.ttt-x-line,
.ttt-x-shadow {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ttt-x-shadow {
  stroke: rgba(0,0,0,0.38);
  stroke-width: 17;
  transform: translate(3px, 4px);
}

.ttt-x-line {
  stroke: url(#tttXStroke);
  stroke-width: 15;
  stroke-dasharray: 74;
  stroke-dashoffset: 74;
}

.ttt-x-line-a { animation: tttDrawX 360ms cubic-bezier(.15,.9,.2,1) forwards; }
.ttt-x-line-b { animation: tttDrawX 360ms 120ms cubic-bezier(.15,.9,.2,1) forwards; }

.ttt-x-core {
  fill: #cffafe;
  filter: drop-shadow(0 0 10px rgba(103,232,249,0.8));
  transform-origin: center;
  animation: tttCorePop 460ms 180ms cubic-bezier(.15,.9,.2,1) both;
}

.ttt-o-shadow,
.ttt-o-ring {
  fill: none;
  stroke-linecap: round;
}

.ttt-o-shadow {
  stroke: rgba(0,0,0,0.34);
  stroke-width: 17;
  transform: translate(3px, 4px);
}

.ttt-o-ring {
  stroke: url(#tttOStroke);
  stroke-width: 15;
  stroke-dasharray: 182;
  stroke-dashoffset: 182;
  animation: tttDrawO 520ms cubic-bezier(.15,.9,.2,1) forwards;
}

.ttt-o-spark {
  fill: #fdf2f8;
  filter: drop-shadow(0 0 10px rgba(244,114,182,0.9));
  opacity: 0;
  animation: tttSparkBlink 620ms 360ms ease both;
}

.ttt-o-spark-2 { animation-delay: 430ms; }

.ttt-hot-mark {
  animation: tttHotMark 800ms ease-in-out infinite alternate;
}

.ttt-win-beam {
  position: absolute;
  z-index: 5;
  left: 50%;
  top: 50%;
  width: 86%;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #f8fafc, #67e8f9, #f472b6, transparent);
  box-shadow: 0 0 24px rgba(255,255,255,0.85), 0 0 62px rgba(34,211,238,0.5);
  transform-origin: center;
  animation: tttBeamIn 580ms cubic-bezier(.15,.9,.2,1) both;
  pointer-events: none;
}

.ttt-win-beam.ttt-win-row-1 { transform: translate(-50%, -50%) translateY(-33.333%); top: 20.5%; }
.ttt-win-beam.ttt-win-row-2 { transform: translate(-50%, -50%); top: 50%; }
.ttt-win-beam.ttt-win-row-3 { transform: translate(-50%, -50%); top: 79.5%; }
.ttt-win-beam.ttt-win-col-1 { transform: translate(-50%, -50%) rotate(90deg); left: 20.5%; }
.ttt-win-beam.ttt-win-col-2 { transform: translate(-50%, -50%) rotate(90deg); left: 50%; }
.ttt-win-beam.ttt-win-col-3 { transform: translate(-50%, -50%) rotate(90deg); left: 79.5%; }
.ttt-win-beam.ttt-win-diag-1 { width: 116%; transform: translate(-50%, -50%) rotate(45deg); }
.ttt-win-beam.ttt-win-diag-2 { width: 116%; transform: translate(-50%, -50%) rotate(-45deg); }

.ttt-spark {
  position: absolute;
  z-index: 6;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: tttSparkFly 680ms cubic-bezier(.12,.82,.24,1) forwards;
}

.ttt-thinking-badge {
  position: absolute;
  left: 50%;
  bottom: -10px;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 12px 18px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(255,255,255,0.78);
  font-weight: 950;
  animation: tttBadgeIn 240ms ease both;
}

.ttt-thinking-badge span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f472b6;
  box-shadow: 0 0 14px rgba(244,114,182,0.8);
  animation: tttDot 680ms ease-in-out infinite;
}

.ttt-thinking-badge span:nth-child(2) { animation-delay: 100ms; }
.ttt-thinking-badge span:nth-child(3) { animation-delay: 200ms; }

.ttt-footer {
  justify-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
}

.ttt-round-chip,
.ttt-soft-button,
.ttt-main-button {
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.82);
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 9px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.ttt-soft-button,
.ttt-main-button {
  cursor: pointer;
  transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
}

.ttt-soft-button:hover,
.ttt-main-button:hover {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.14);
  border-color: rgba(255,255,255,0.22);
}

.ttt-result-layer {
  position: absolute;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: radial-gradient(circle, rgba(3,7,18,0.02), rgba(3,7,18,0.28));
}

.ttt-result-card {
  width: min(92vw, 430px);
  pointer-events: auto;
  border-radius: 34px;
  padding: 28px;
  text-align: center;
  animation: tttResultIn 460ms cubic-bezier(.15,.9,.2,1) both;
}

.ttt-result-win { box-shadow: 0 30px 90px rgba(0,0,0,0.42), 0 0 70px rgba(34,211,238,0.14), inset 0 1px 0 rgba(255,255,255,0.15); }
.ttt-result-lose { box-shadow: 0 30px 90px rgba(0,0,0,0.42), 0 0 70px rgba(244,114,182,0.16), inset 0 1px 0 rgba(255,255,255,0.15); }
.ttt-result-draw { box-shadow: 0 30px 90px rgba(0,0,0,0.42), 0 0 70px rgba(250,204,21,0.12), inset 0 1px 0 rgba(255,255,255,0.15); }

.ttt-result-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: rgba(255,255,255,0.5);
  font-weight: 950;
}

.ttt-result-title {
  margin-top: 8px;
  font-size: clamp(32px, 7vw, 58px);
  line-height: 0.94;
  font-weight: 1000;
  letter-spacing: -0.08em;
}

.ttt-result-text {
  margin: 14px auto 0;
  max-width: 310px;
  color: rgba(255,255,255,0.62);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 700;
}

.ttt-main-button {
  margin-top: 20px;
  padding: 13px 18px;
  background: linear-gradient(135deg, rgba(34,211,238,0.22), rgba(244,114,182,0.2));
}

@keyframes tttGridDrift {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 72px, 72px 0; }
}

@keyframes tttFloat {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(24px, -20px, 0) scale(1.06); }
}

@keyframes tttPulseOrb {
  0%, 100% { transform: scale(1); opacity: 0.46; }
  50% { transform: scale(1.16); opacity: 0.78; }
}

@keyframes tttStatusIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes tttArenaBreath {
  0%, 100% { transform: scale(0.96); opacity: 0.7; }
  50% { transform: scale(1.04); opacity: 1; }
}

@keyframes tttRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes tttBoardIn {
  from { opacity: 0; transform: translateY(34px) rotateX(20deg) scale(0.92); }
  to { opacity: 1; transform: translateY(0) rotateX(0deg) scale(1); }
}

@keyframes tttGlowSpin {
  from { transform: rotate(0deg); opacity: 0.55; }
  50% { opacity: 0.9; }
  to { transform: rotate(360deg); opacity: 0.55; }
}

@keyframes tttDrawX {
  to { stroke-dashoffset: 0; }
}

@keyframes tttCorePop {
  from { transform: scale(0); opacity: 0; }
  65% { transform: scale(1.35); opacity: 1; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes tttDrawO {
  to { stroke-dashoffset: 0; }
}

@keyframes tttSparkBlink {
  from { opacity: 0; transform: scale(0); }
  45% { opacity: 1; transform: scale(1.35); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes tttHotMark {
  from { transform: scale(1) rotate(-1deg); filter: brightness(1); }
  to { transform: scale(1.06) rotate(1deg); filter: brightness(1.22); }
}

@keyframes tttWinCell {
  from { border-color: rgba(255,255,255,0.16); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 38px rgba(0,0,0,0.18), 0 0 28px rgba(255,255,255,0.05); }
  to { border-color: rgba(255,255,255,0.5); box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 18px 38px rgba(0,0,0,0.18), 0 0 45px rgba(255,255,255,0.18); }
}

@keyframes tttLastCell {
  from { transform: translateY(-8px) translateZ(30px) scale(1.08); }
  to { transform: translateY(0) translateZ(0) scale(1); }
}

@keyframes tttBeamIn {
  from { clip-path: inset(0 50% 0 50%); opacity: 0; filter: blur(10px); }
  to { clip-path: inset(0 0 0 0); opacity: 1; filter: blur(0); }
}

@keyframes tttSparkFly {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); }
}

@keyframes tttBadgeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes tttDot {
  0%, 100% { transform: translateY(0); opacity: 0.42; }
  50% { transform: translateY(-5px); opacity: 1; }
}

@keyframes tttResultIn {
  from { opacity: 0; transform: translateY(18px) scale(0.94); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@media (max-width: 760px) {
  .ttt-shell {
    padding: 8px;
    gap: 6px;
  }

  .ttt-topbar {
    grid-template-columns: 1fr 1fr;
  }

  .ttt-center-score {
    grid-column: 1 / -1;
    grid-row: 1;
    min-height: 50px;
    border-radius: 18px;
  }

  .ttt-player-card {
    min-height: 46px;
    border-radius: 17px;
    padding: 8px 10px;
  }

  .ttt-player-title {
    font-size: 10px;
    letter-spacing: 0.16em;
  }

  .ttt-board-wrap {
    width: min(60vh, 94vw, 560px);
  }

  .ttt-footer {
    max-width: 94vw;
    border-radius: 24px;
  }

  .ttt-round-chip,
  .ttt-soft-button {
    padding: 8px 10px;
    font-size: 9px;
    letter-spacing: 0.12em;
  }
}

@media (max-height: 740px) {
  .ttt-shell {
    gap: 5px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .ttt-topbar {
    align-items: stretch;
  }

  .ttt-center-score,
  .ttt-player-card {
    min-height: 42px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .ttt-match-title,
  .ttt-status,
  .ttt-player-title {
    font-size: 9px;
  }

  .ttt-board-wrap {
    width: min(58vh, 88vw, 520px);
    margin-top: -10px;
  }

  .ttt-footer {
    display: none;
  }
}

@media (max-height: 610px) {
  .ttt-match-title,
  .ttt-status { display: none; }

  .ttt-topbar {
    grid-template-columns: minmax(82px, 150px) 1fr minmax(82px, 150px);
  }

  .ttt-board-wrap {
    width: min(55vh, 86vw, 470px);
    margin-top: -14px;
  }

  .ttt-player-title {
    font-size: 8px;
  }
}

`;
