import React, { useEffect, useMemo, useRef, useState } from 'react';

type Mark = 'X' | 'O';
type CellValue = Mark | null;
type Winner = Mark | 'draw' | null;

const TURN_SECONDS = 7;
const BASE_ROUNDS = 7;
const WINS_TO_FINISH = 4;

const winningLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const linePoints: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
  '0-1-2': { x1: 16.66, y1: 16.66, x2: 83.33, y2: 16.66 },
  '3-4-5': { x1: 16.66, y1: 50, x2: 83.33, y2: 50 },
  '6-7-8': { x1: 16.66, y1: 83.33, x2: 83.33, y2: 83.33 },
  '0-3-6': { x1: 16.66, y1: 16.66, x2: 16.66, y2: 83.33 },
  '1-4-7': { x1: 50, y1: 16.66, x2: 50, y2: 83.33 },
  '2-5-8': { x1: 83.33, y1: 16.66, x2: 83.33, y2: 83.33 },
  '0-4-8': { x1: 16.66, y1: 16.66, x2: 83.33, y2: 83.33 },
  '2-4-6': { x1: 83.33, y1: 16.66, x2: 16.66, y2: 83.33 },
};

const playerMeta = {
  X: {
    name: 'Player X',
    soft: 'bg-cyan-500/10 border-cyan-400/15',
    active: 'bg-cyan-500/16 border-cyan-300/30 shadow-[0_0_28px_rgba(34,211,238,0.16)] scale-[1.03]',
    chip: 'from-cyan-400 to-sky-500',
    line: '#67e8f9',
    lineGlow: '#22d3ee',
  },
  O: {
    name: 'Player O',
    soft: 'bg-fuchsia-500/10 border-fuchsia-400/15',
    active: 'bg-fuchsia-500/16 border-fuchsia-300/30 shadow-[0_0_28px_rgba(217,70,239,0.16)] scale-[1.03]',
    chip: 'from-fuchsia-400 to-violet-500',
    line: '#f0abfc',
    lineGlow: '#d946ef',
  },
};

const createBoard = (): CellValue[] => Array(9).fill(null);

const randomEmptyIndex = (board: CellValue[]) => {
  const empty = board
    .map((cell, index) => ({ cell, index }))
    .filter((item) => item.cell === null)
    .map((item) => item.index);

  if (!empty.length) return -1;
  return empty[Math.floor(Math.random() * empty.length)];
};

const checkBoardWinner = (board: CellValue[]) => {
  for (const line of winningLines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return {
        winner: board[a] as Mark,
        line: [...line] as number[],
      };
    }
  }

  if (board.every(Boolean)) {
    return { winner: 'draw' as const, line: [] as number[] };
  }

  return { winner: null as Winner, line: [] as number[] };
};

const MarkView = ({ value }: { value: Mark }) => {
  if (value === 'X') {
    return (
      <svg
        viewBox="0 0 100 100"
        className="w-[58%] h-[58%]"
        style={{ animation: 'tttMarkIn 260ms cubic-bezier(.2,.85,.2,1) both' }}
      >
        <defs>
          <linearGradient id="xStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <path d="M25 25 L75 75" stroke="url(#xStroke)" strokeWidth="12" strokeLinecap="round" fill="none" />
        <path d="M75 25 L25 75" stroke="url(#xStroke)" strokeWidth="12" strokeLinecap="round" fill="none" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-[58%] h-[58%]"
      style={{ animation: 'tttMarkIn 260ms cubic-bezier(.2,.85,.2,1) both' }}
    >
      <defs>
        <linearGradient id="oStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="28" stroke="url(#oStroke)" strokeWidth="12" fill="none" />
    </svg>
  );
};

export const TicTacToeDuelGame: React.FC = () => {
  const turnIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const roundTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const [board, setBoard] = useState<CellValue[]>(createBoard());
  const [currentMark, setCurrentMark] = useState<Mark>('X');
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_SECONDS);

  const [roundNumber, setRoundNumber] = useState(1);
  const [wins, setWins] = useState<Record<Mark, number>>({
    X: 0,
    O: 0,
  });

  const [, setStatusTitle] = useState('Player X turn');
  const [, setStatusText] = useState('Сделай ход за 7 секунд');
  const [roundWinner, setRoundWinner] = useState<Winner>(null);
  const [winningCells, setWinningCells] = useState<number[]>([]);
  const [matchWinner, setMatchWinner] = useState<Winner>(null);
  const [showRoundBadge, setShowRoundBadge] = useState(false);
  const [lineAnimKey, setLineAnimKey] = useState(0);

  const clearTimers = () => {
    if (turnIntervalRef.current) {
      window.clearInterval(turnIntervalRef.current);
      turnIntervalRef.current = null;
    }
    if (roundTimeoutRef.current) {
      window.clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
  };

  const startTurnTimer = () => {
    if (turnIntervalRef.current) {
      window.clearInterval(turnIntervalRef.current);
      turnIntervalRef.current = null;
    }

    setTurnTimeLeft(TURN_SECONDS);

    turnIntervalRef.current = window.setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => {
            handleRandomMove();
          }, 0);
          return TURN_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startNewRound = (nextRoundNumber: number, nextMark: Mark) => {
    setBoard(createBoard());
    setCurrentMark(nextMark);
    setRoundNumber(nextRoundNumber);
    setRoundWinner(null);
    setWinningCells([]);
    setShowRoundBadge(false);
    setStatusTitle(`${playerMeta[nextMark].name} turn`);
    setStatusText('Сделай ход за 7 секунд');
    startTurnTimer();
  };

  useEffect(() => {
    startTurnTimer();

    return () => {
      clearTimers();
    };
  }, []);

  const finishRound = (winner: Winner, line: number[]) => {
    clearTimers();
    setRoundWinner(winner);
    setWinningCells(line);
    setLineAnimKey((v) => v + 1);
    setShowRoundBadge(true);

    if (winner === 'X' || winner === 'O') {
      const nextWins = {
        ...wins,
        [winner]: wins[winner] + 1,
      };

      setWins(nextWins);
      setStatusTitle(`${playerMeta[winner].name} wins round`);
      setStatusText('Красивое завершение комбинацией');

      if (nextWins[winner] >= WINS_TO_FINISH) {
        roundTimeoutRef.current = window.setTimeout(() => {
          setMatchWinner(winner);
        }, 1900);
        return;
      }

      roundTimeoutRef.current = window.setTimeout(() => {
        startNewRound(roundNumber + 1, winner === 'X' ? 'O' : 'X');
      }, 1900);

      return;
    }

    setStatusTitle('Draw round');
    setStatusText(
      roundNumber >= BASE_ROUNDS && wins.X === wins.O
        ? 'Ничья по раунду • играем до победного'
        : 'Ничья, следующий раунд',
    );

    roundTimeoutRef.current = window.setTimeout(() => {
      startNewRound(roundNumber + 1, currentMark === 'X' ? 'O' : 'X');
    }, 1700);
  };

  const applyMove = (index: number, forceMark?: Mark) => {
    if (matchWinner || roundWinner) return;
    if (board[index] !== null) return;

    const mark = forceMark ?? currentMark;
    const nextBoard = [...board];
    nextBoard[index] = mark;
    setBoard(nextBoard);

    const result = checkBoardWinner(nextBoard);
    if (result.winner) {
      finishRound(result.winner, result.line);
      return;
    }

    const nextMark = mark === 'X' ? 'O' : 'X';
    setCurrentMark(nextMark);
    setStatusTitle(`${playerMeta[nextMark].name} turn`);
    setStatusText('Сделай ход за 7 секунд');
    startTurnTimer();
  };

  const handleRandomMove = () => {
    if (matchWinner || roundWinner) return;

    const index = randomEmptyIndex(board);
    if (index === -1) return;

    setStatusTitle(`${playerMeta[currentMark].name} auto move`);
    setStatusText('Время вышло, ход поставлен случайно');
    applyMove(index, currentMark);
  };

  const handleCellClick = (index: number) => {
    applyMove(index);
  };

  const handleRestartMatch = () => {
    clearTimers();
    setWins({ X: 0, O: 0 });
    setMatchWinner(null);
    setRoundNumber(1);
    setBoard(createBoard());
    setCurrentMark('X');
    setRoundWinner(null);
    setWinningCells([]);
    setShowRoundBadge(false);
    setLineAnimKey(0);
    setStatusTitle('Player X turn');
    setStatusText('Сделай ход за 7 секунд');
    startTurnTimer();
  };

  const turnProgress = (turnTimeLeft / TURN_SECONDS) * 100;

  const boardGlow =
    currentMark === 'X'
      ? 'shadow-[0_0_90px_rgba(34,211,238,0.09)]'
      : 'shadow-[0_0_90px_rgba(217,70,239,0.09)]';

  const boardRing =
    currentMark === 'X'
      ? 'border-cyan-400/12'
      : 'border-fuchsia-400/12';

  const finalTitle = useMemo(() => {
    if (matchWinner === 'X') return 'PLAYER X';
    if (matchWinner === 'O') return 'PLAYER O';
    if (matchWinner === 'draw') return 'DRAW';
    return '';
  }, [matchWinner]);

  const winningLineStyle = useMemo(() => {
    if (!winningCells.length || roundWinner === 'draw') return null;
    const normalized = [...winningCells].sort((a, b) => a - b).join('-');
    return linePoints[normalized] ?? null;
  }, [winningCells, roundWinner]);

  const lineColor = roundWinner === 'X' ? playerMeta.X.line : playerMeta.O.line;
  const lineGlow = roundWinner === 'X' ? playerMeta.X.lineGlow : playerMeta.O.lineGlow;

  return (
    <>
      <style>{`
        @keyframes tttMarkIn {
          0% { transform: scale(.65); opacity: 0; filter: blur(2px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes tttFadeRise {
          0% { transform: translateY(12px) scale(.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes tttLineDraw {
          0% { stroke-dashoffset: 120; opacity: 0; }
          8% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes tttLinePulse {
          0%,100% { filter: drop-shadow(0 0 6px ${lineGlow}); opacity: 1; }
          50% { filter: drop-shadow(0 0 16px ${lineGlow}); opacity: .98; }
        }
        @keyframes tttBadgeIn {
          0% { transform: translateY(8px) scale(.94); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="w-full h-full overflow-hidden touch-none select-none bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.16),transparent_28%),linear-gradient(180deg,#06101c,#080d18_42%,#12091a)]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="h-full flex flex-col p-2">
          <div className="shrink-0 rounded-[28px] border border-white/10 bg-black/28 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.22)] px-3 py-2">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div
                className={`rounded-2xl border px-3 py-2 transition-all duration-300 ${
                  currentMark === 'X' && !matchWinner ? playerMeta.X.active : playerMeta.X.soft
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">Player X</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-[28px] font-black text-cyan-300 leading-none">{wins.X}</div>
                  <div className="text-xs text-white/35 font-bold pb-0.5">rounds</div>
                </div>
              </div>

              <div className="text-center min-w-[112px]">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold">
                  Tic Tac Toe Duel
                </div>
                <div className="text-xl font-black text-white leading-none mt-1">
                  Round {roundNumber}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/38 font-bold">
                  {roundNumber <= BASE_ROUNDS ? 'Best of 7' : 'Sudden Death'}
                </div>
              </div>

              <div
                className={`rounded-2xl border px-3 py-2 text-right transition-all duration-300 ${
                  currentMark === 'O' && !matchWinner ? playerMeta.O.active : playerMeta.O.soft
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">Player O</div>
                <div className="mt-1 flex items-end justify-end gap-2">
                  <div className="text-xs text-white/35 font-bold pb-0.5">rounds</div>
                  <div className="text-[28px] font-black text-fuchsia-300 leading-none">{wins.O}</div>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <div className="h-2 rounded-full bg-white/8 overflow-hidden border border-white/8">
                <div
                  className={`h-full transition-[width] duration-500 ${
                    turnTimeLeft <= 2
                      ? 'bg-gradient-to-r from-red-400 to-orange-500'
                      : currentMark === 'X'
                      ? 'bg-gradient-to-r from-cyan-400 to-sky-500'
                      : 'bg-gradient-to-r from-fuchsia-400 to-violet-500'
                  }`}
                  style={{ width: `${turnProgress}%` }}
                />
              </div>

              <div
                className={`rounded-full px-3 py-1.5 border text-[11px] uppercase tracking-[0.18em] font-black ${
                  currentMark === 'X'
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-400/15'
                    : 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-400/15'
                }`}
              >
                {playerMeta[currentMark].name}
              </div>

              <div
                className={`rounded-full px-3 py-1.5 text-[11px] font-black text-white uppercase tracking-[0.18em] min-w-[62px] text-center ${
                  turnTimeLeft <= 2
                    ? 'bg-red-500/20 border border-red-400/20 shadow-[0_0_16px_rgba(248,113,113,0.16)]'
                    : 'bg-white/10 border border-white/10'
                }`}
              >
                {turnTimeLeft}s
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 pt-1 pb-1">
            <div
              className={`relative h-full rounded-[34px] overflow-hidden border bg-[linear-gradient(180deg,rgba(10,14,28,0.98),rgba(14,12,29,0.98))] ${boardGlow} ${boardRing}`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_25%)]" />

              <div className="absolute inset-x-4 top-4 bottom-[18px] flex items-center justify-center">
                <div className="w-full max-w-[520px] aspect-square">
                  <div className="relative w-full h-full rounded-[34px] p-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
                    <div className="absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_28%)]" />

                    <div className="relative grid grid-cols-3 grid-rows-3 gap-3 w-full h-full">
                      {board.map((cell, index) => {
                        const isWinningCell = winningCells.includes(index);

                        return (
                          <button
                            key={index}
                            onClick={() => handleCellClick(index)}
                            disabled={cell !== null || roundWinner !== null || matchWinner !== null}
                            className={`relative overflow-hidden rounded-[28px] border transition-all duration-300 ${
                              isWinningCell
                                ? 'bg-white/12 border-white/22 shadow-[0_0_32px_rgba(255,255,255,0.10)]'
                                : 'bg-white/6 border-white/10 hover:bg-white/8'
                            } ${
                              cell === null && roundWinner === null && matchWinner === null
                                ? 'active:scale-[0.97]'
                                : ''
                            }`}
                          >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_30%)]" />
                            {cell === null && !roundWinner && !matchWinner && (
                              <div
                                className={`absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 ${
                                  currentMark === 'X' ? 'bg-cyan-400/4' : 'bg-fuchsia-400/4'
                                }`}
                              />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                              {cell && <MarkView value={cell} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {winningLineStyle && roundWinner !== 'draw' && (
                      <svg
                        key={lineAnimKey}
                        viewBox="0 0 100 100"
                        className="absolute inset-0 w-full h-full pointer-events-none z-20"
                      >
                        <defs>
                          <filter id="tttLineGlow">
                            <feGaussianBlur stdDeviation="1.8" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        <line
                          x1={winningLineStyle.x1}
                          y1={winningLineStyle.y1}
                          x2={winningLineStyle.x2}
                          y2={winningLineStyle.y2}
                          stroke={lineColor}
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          opacity="0.55"
                          filter="url(#tttLineGlow)"
                          strokeDasharray="120"
                          strokeDashoffset="120"
                          style={{
                            animation: 'tttLineDraw 680ms cubic-bezier(.2,.85,.2,1) forwards, tttLinePulse 1.35s ease-in-out .7s infinite',
                          }}
                        />

                        <line
                          x1={winningLineStyle.x1}
                          y1={winningLineStyle.y1}
                          x2={winningLineStyle.x2}
                          y2={winningLineStyle.y2}
                          stroke={lineColor}
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          filter="url(#tttLineGlow)"
                          strokeDasharray="120"
                          strokeDashoffset="120"
                          style={{
                            animation: 'tttLineDraw 560ms cubic-bezier(.2,.85,.2,1) 90ms forwards, tttLinePulse 1.35s ease-in-out .7s infinite',
                          }}
                        />
                      </svg>
                    )}

                    {showRoundBadge && roundWinner && !matchWinner && (
                      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-30 pointer-events-none">
                        <div
                          className={`rounded-full border px-4 py-2 backdrop-blur-xl ${
                            roundWinner === 'X'
                              ? 'bg-cyan-500/12 border-cyan-400/18 text-cyan-200'
                              : roundWinner === 'O'
                              ? 'bg-fuchsia-500/12 border-fuchsia-400/18 text-fuchsia-200'
                              : 'bg-white/10 border-white/12 text-white'
                          }`}
                          style={{ animation: 'tttBadgeIn 320ms ease-out both' }}
                        >
                          <div className="text-[11px] uppercase tracking-[0.24em] font-black">
                            {roundWinner === 'draw'
                              ? 'DRAW'
                              : `${playerMeta[roundWinner].name.toUpperCase()} WINS`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {matchWinner && (
                <div className="absolute inset-0 z-30 bg-black/48 backdrop-blur-md flex items-center justify-center p-5">
                  <div
                    className="w-full max-w-[360px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,17,31,0.96),rgba(17,11,33,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.26)] overflow-hidden"
                    style={{ animation: 'tttFadeRise .34s ease-out both' }}
                  >
                    <div className="px-6 pt-6 pb-5 text-center">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40 font-bold">
                        Match finished
                      </div>
                      <div
                        className={`mt-3 text-4xl font-black ${
                          matchWinner === 'X'
                            ? 'text-cyan-300'
                            : matchWinner === 'O'
                            ? 'text-fuchsia-300'
                            : 'text-white'
                        }`}
                      >
                        {finalTitle}
                      </div>
                      <div className="mt-2 text-sm text-white/55">
                        {matchWinner === 'draw' ? 'Итоговая ничья' : 'wins the duel'}
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-cyan-500/8 border border-cyan-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            Player X
                          </div>
                          <div className="text-3xl font-black text-cyan-300 mt-2 leading-none">
                            {wins.X}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">rounds</div>
                        </div>

                        <div className="rounded-2xl bg-fuchsia-500/8 border border-fuchsia-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            Player O
                          </div>
                          <div className="text-3xl font-black text-fuchsia-300 mt-2 leading-none">
                            {wins.O}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">rounds</div>
                        </div>
                      </div>

                      <button
                        onClick={handleRestartMatch}
                        className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(99,102,241,0.22)]"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};