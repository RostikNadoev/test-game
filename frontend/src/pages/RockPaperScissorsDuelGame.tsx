import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLobbyMatchFinish } from '../hooks/useLobbyMatchFinish';

type Move = 'rock' | 'paper' | 'scissors';
type Phase = 'choosing' | 'reveal' | 'matchOver';
type RoundResult = 'win' | 'lose' | 'draw';

type Score = {
  player: number;
  bot: number;
};

const WIN_TARGET = 5;
const REVEAL_MS = 650; // suspense before the bot move shows
const MOVES: Move[] = ['rock', 'paper', 'scissors'];

const MOVE_LABEL: Record<Move, string> = {
  rock: 'Камень',
  paper: 'Бумага',
  scissors: 'Ножницы',
};

const MOVE_EMOJI: Record<Move, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

// Explanation of who beats whom, keyed by the winning move.
const WIN_REASON: Record<Move, string> = {
  rock: 'Камень ломает ножницы',
  paper: 'Бумага накрывает камень',
  scissors: 'Ножницы режут бумагу',
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

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const RockPaperScissorsDuelGame: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('choosing');
  const [score, setScore] = useState<Score>({ player: 0, bot: 0 });
  const [round, setRound] = useState(1);
  const [player, setPlayer] = useState<Move | null>(null);
  const [bot, setBot] = useState<Move | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const timeoutRef = useRef<number | null>(null);
  const lockRef = useRef(false); // prevents double picks during reveal

  const matchWinner: 'player' | 'bot' | null =
    score.player >= WIN_TARGET ? 'player' : score.bot >= WIN_TARGET ? 'bot' : null;
  const finishLobbyMatch = useLobbyMatchFinish('rps_duel');

  useEffect(() => {
    if (phase !== 'matchOver' || !matchWinner) return;
    void finishLobbyMatch(matchWinner === 'player' ? 'win' : 'loss');
  }, [phase, matchWinner, finishLobbyMatch]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const choose = useCallback(
    (move: Move) => {
      if (lockRef.current || phase !== 'choosing') return;
      lockRef.current = true;

      const botMove = randomMove();
      const outcome = judge(move, botMove);

      setPlayer(move);
      setBot(botMove);
      setResult(outcome);
      setRevealed(false);
      setPhase('reveal');

      // Brief suspense, then flip the bot card and tally the score.
      clearTimer();
      timeoutRef.current = window.setTimeout(() => {
        setRevealed(true);
        setScore(prev => {
          const next: Score = {
            player: prev.player + (outcome === 'win' ? 1 : 0),
            bot: prev.bot + (outcome === 'lose' ? 1 : 0),
          };
          if (next.player >= WIN_TARGET || next.bot >= WIN_TARGET) {
            setPhase('matchOver');
          }
          return next;
        });
        lockRef.current = false;
      }, REVEAL_MS);
    },
    [phase, clearTimer],
  );

  const nextRound = useCallback(() => {
    clearTimer();
    lockRef.current = false;
    setPlayer(null);
    setBot(null);
    setResult(null);
    setRevealed(false);
    setRound(r => r + 1);
    setPhase('choosing');
  }, [clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    lockRef.current = false;
    setScore({ player: 0, bot: 0 });
    setRound(1);
    setPlayer(null);
    setBot(null);
    setResult(null);
    setRevealed(false);
    setPhase('choosing');
  }, [clearTimer]);

  // Keyboard shortcuts: 1/2/3 to pick, Enter/Space to advance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (phase === 'choosing') {
        if (k === '1') choose('rock');
        else if (k === '2') choose('paper');
        else if (k === '3') choose('scissors');
      } else if (phase === 'reveal' && revealed && (k === 'enter' || k === ' ')) {
        nextRound();
      } else if (phase === 'matchOver' && (k === 'enter' || k === ' ')) {
        restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revealed, choose, nextRound, restart]);

  // Cleanup on unmount.
  useEffect(() => () => clearTimer(), [clearTimer]);

  const statusText = useMemo(() => {
    if (phase === 'matchOver') return matchWinner === 'player' ? 'Победа' : 'Поражение';
    if (phase === 'reveal' && revealed && result) {
      return result === 'win' ? 'Победа' : result === 'lose' ? 'Поражение' : 'Ничья';
    }
    return `Раунд ${round}`;
  }, [phase, revealed, result, round, matchWinner]);

  const explanation = useMemo(() => {
    if (!revealed || !player || !bot || !result) return '';
    if (result === 'draw') return 'Одинаковый ход';
    const winningMove: Move = result === 'win' ? player : bot;
    return WIN_REASON[winningMove];
  }, [revealed, player, bot, result]);

  const showResult = phase !== 'choosing' && revealed && !!result;
  const isFinished = phase === 'matchOver';

  return (
    <div className={cx('rpsPage', `phase-${phase}`)}>
      <style>{styles}</style>

      {/* HUD: player score | status | bot score */}
      <header className="rpsHud rpsCard">
        <div className="hudSide">
          <span className="hudLabel">Ты</span>
          <strong className="hudScore player">{score.player}</strong>
        </div>
        <div className="hudCenter">
          <span className={cx('hudStatus', showResult && `is-${result}`)}>{statusText}</span>
          <span className="hudSub">до {WIN_TARGET}</span>
        </div>
        <div className="hudSide">
          <span className="hudLabel">Бот</span>
          <strong className="hudScore bot">{score.bot}</strong>
        </div>
      </header>

      {/* Duel area */}
      <main className="rpsDuel rpsCard">
        <div className="duelGrid">
          {/* Player */}
          <div className={cx('panel', 'playerPanel', showResult && `outcome-${result}`)}>
            <span className="panelLabel">Ты</span>
            <div className="panelMove">
              {player ? (
                <span className="moveGlyph">{MOVE_EMOJI[player]}</span>
              ) : (
                <span className="moveGlyph dim">·</span>
              )}
            </div>
            <span className="panelMoveName">{player ? MOVE_LABEL[player] : '\u00A0'}</span>
          </div>

          {/* Center badge */}
          <div className="centerBadge">
            {showResult ? (
              <span
                className={cx(
                  'badge',
                  result === 'win' && 'win',
                  result === 'lose' && 'lose',
                  result === 'draw' && 'draw',
                )}
              >
                {result === 'win' ? 'W' : result === 'lose' ? 'L' : '='}
              </span>
            ) : (
              <span className="badge vs">VS</span>
            )}
          </div>

          {/* Bot */}
          <div className={cx('panel', 'botPanel', showResult && `outcome-${result === 'win' ? 'lose' : result === 'lose' ? 'win' : 'draw'}`)}>
            <span className="panelLabel">Бот</span>
            <div className="panelMove">
              {phase !== 'choosing' && revealed && bot ? (
                <span className="moveGlyph reveal">{MOVE_EMOJI[bot]}</span>
              ) : (
                <span className="moveGlyph hidden">?</span>
              )}
            </div>
            <span className="panelMoveName">
              {phase !== 'choosing' && revealed && bot ? MOVE_LABEL[bot] : '\u00A0'}
            </span>
          </div>
        </div>

        {/* Result line / prompt */}
        <div className="resultLine">
          {showResult ? (
            <p className={cx('resultText', `is-${result}`)}>{explanation}</p>
          ) : phase === 'reveal' ? (
            <p className="resultText muted">Вскрытие…</p>
          ) : (
            <p className="resultText muted">Выбери ход</p>
          )}
        </div>
      </main>

      {/* Choice buttons */}
      <div className="rpsChoices">
        {MOVES.map((move, i) => (
          <button
            key={move}
            type="button"
            className={cx('choiceBtn', player === move && 'selected')}
            onClick={() => choose(move)}
            disabled={phase !== 'choosing'}
            aria-label={MOVE_LABEL[move]}
          >
            <span className="choiceEmoji">{MOVE_EMOJI[move]}</span>
            <span className="choiceName">{MOVE_LABEL[move]}</span>
            <span className="choiceKey">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Primary action */}
      <div className="rpsAction">
        {isFinished ? (
          <button type="button" className="actionBtn restart" onClick={restart}>
            Сначала
          </button>
        ) : showResult ? (
          <button type="button" className="actionBtn next" onClick={nextRound}>
            Следующий раунд
          </button>
        ) : (
          <button type="button" className="actionBtn ghost" disabled>
            {phase === 'reveal' ? '…' : 'Выбери ход'}
          </button>
        )}
      </div>
    </div>
  );
};

const styles = `
.rpsPage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 2.2vh, 16px);
  padding:
    calc(env(safe-area-inset-top, 0px) + 12px)
    calc(env(safe-area-inset-right, 0px) + 14px)
    calc(env(safe-area-inset-bottom, 0px) + 14px)
    calc(env(safe-area-inset-left, 0px) + 14px);
  overflow: hidden;
  color: #fff;
  background: transparent;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none;
}

.rpsPage * { box-sizing: border-box; }

.rpsCard {
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(18,18,24,.54);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 16px 40px rgba(0,0,0,.18);
}

/* ---------- HUD ---------- */
.rpsHud {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 18px;
}

.hudSide {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hudSide:last-child { justify-content: flex-end; }

.hudLabel {
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .02em;
  color: rgba(255,255,255,.55);
}

.hudScore {
  font-size: 26px;
  line-height: 1;
  font-weight: 850;
  letter-spacing: -.02em;
  min-width: 20px;
  text-align: center;
}

.hudScore.player { color: #2f8cff; }
.hudScore.bot { color: #f59e42; }

.hudCenter {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 0 6px;
}

.hudStatus {
  font-size: 13px;
  font-weight: 750;
  letter-spacing: .01em;
  color: rgba(255,255,255,.92);
  white-space: nowrap;
}

.hudStatus.is-win { color: #22c55e; }
.hudStatus.is-lose { color: #ef4444; }
.hudStatus.is-draw { color: #22d3ee; }

.hudSub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: rgba(255,255,255,.35);
}

/* ---------- Duel ---------- */
.rpsDuel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(8px, 2vh, 18px);
  padding: clamp(14px, 3vh, 26px) clamp(12px, 4vw, 22px);
  border-radius: 22px;
}

.duelGrid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: clamp(8px, 3vw, 16px);
}

.panel {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: clamp(12px, 2.4vh, 18px) 10px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  transition: border-color .25s ease, box-shadow .25s ease, background .25s ease;
}

.panelLabel {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: rgba(255,255,255,.45);
}

.panelMove {
  display: grid;
  place-items: center;
  width: clamp(64px, 18vw, 96px);
  height: clamp(64px, 18vw, 96px);
}

.moveGlyph {
  font-size: clamp(40px, 12vw, 62px);
  line-height: 1;
  filter: drop-shadow(0 6px 14px rgba(0,0,0,.28));
}

.moveGlyph.dim { color: rgba(255,255,255,.18); font-size: 40px; }

.moveGlyph.hidden {
  font-size: clamp(34px, 10vw, 52px);
  font-weight: 850;
  color: rgba(255,255,255,.30);
}

.moveGlyph.reveal { animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }

.panelMoveName {
  font-size: 13px;
  font-weight: 700;
  min-height: 16px;
  color: rgba(255,255,255,.85);
}

.panel.outcome-win {
  border-color: rgba(34,197,94,.45);
  background: rgba(34,197,94,.08);
  box-shadow: 0 0 0 1px rgba(34,197,94,.25), 0 8px 24px rgba(34,197,94,.12);
}

.panel.outcome-lose {
  border-color: rgba(239,68,68,.40);
  background: rgba(239,68,68,.06);
}

.panel.outcome-draw {
  border-color: rgba(34,211,238,.35);
  background: rgba(34,211,238,.06);
}

/* Center badge */
.centerBadge { display: grid; place-items: center; }

.badge {
  display: grid;
  place-items: center;
  width: clamp(36px, 10vw, 46px);
  height: clamp(36px, 10vw, 46px);
  border-radius: 999px;
  font-size: 15px;
  font-weight: 850;
  letter-spacing: .01em;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.6);
}

.badge.vs { font-size: 13px; }

.badge.win {
  color: #fff;
  background: rgba(34,197,94,.85);
  border-color: rgba(34,197,94,.6);
  animation: pop .3s cubic-bezier(.2,.8,.2,1) both;
}

.badge.lose {
  color: #fff;
  background: rgba(239,68,68,.82);
  border-color: rgba(239,68,68,.6);
  animation: pop .3s cubic-bezier(.2,.8,.2,1) both;
}

.badge.draw {
  color: #06343b;
  background: rgba(34,211,238,.82);
  border-color: rgba(34,211,238,.6);
  animation: pop .3s cubic-bezier(.2,.8,.2,1) both;
}

/* Result line */
.resultLine { text-align: center; min-height: 20px; }

.resultText {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: .01em;
  animation: fadeIn .28s ease both;
}

.resultText.muted { color: rgba(255,255,255,.45); font-weight: 600; }
.resultText.is-win { color: #22c55e; }
.resultText.is-lose { color: #ef4444; }
.resultText.is-draw { color: #22d3ee; }

/* ---------- Choices ---------- */
.rpsChoices {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.choiceBtn {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 5px;
  padding: 14px 8px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: #fff;
  cursor: pointer;
  transition: transform .12s ease, border-color .18s ease, background .18s ease;
}

.choiceBtn:hover:not(:disabled) {
  border-color: rgba(47,140,255,.45);
  background: rgba(47,140,255,.08);
}

.choiceBtn:active:not(:disabled) { transform: scale(.98); }

.choiceBtn.selected {
  border-color: #2f8cff;
  background: rgba(47,140,255,.12);
  box-shadow: 0 0 0 1px rgba(47,140,255,.4);
}

.choiceBtn:disabled { cursor: default; opacity: .55; }
.choiceBtn.selected:disabled { opacity: 1; }

.choiceEmoji { font-size: 26px; line-height: 1; }

.choiceName {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .01em;
}

.choiceKey {
  position: absolute;
  top: 7px;
  right: 9px;
  font-size: 10px;
  font-weight: 650;
  color: rgba(255,255,255,.30);
}

/* ---------- Action ---------- */
.rpsAction { flex: 0 0 auto; }

.actionBtn {
  width: 100%;
  padding: 15px 18px;
  border-radius: 16px;
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: .01em;
  cursor: pointer;
  transition: transform .12s ease, filter .18s ease, background .18s ease;
}

.actionBtn:active:not(:disabled) { transform: scale(.98); }

.actionBtn.next {
  color: #fff;
  background: linear-gradient(180deg, #3d96ff, #2f8cff);
  box-shadow: 0 8px 22px rgba(47,140,255,.28);
}

.actionBtn.restart {
  color: #fff;
  background: linear-gradient(180deg, #f7a85a, #f59e42);
  box-shadow: 0 8px 22px rgba(245,158,66,.26);
}

.actionBtn.next:hover, .actionBtn.restart:hover { filter: brightness(1.05); }

.actionBtn.ghost {
  color: rgba(255,255,255,.4);
  background: rgba(255,255,255,.04);
  border-color: rgba(255,255,255,.07);
  cursor: default;
}

/* ---------- Animations ---------- */
@keyframes pop {
  0% { transform: scale(.6); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .moveGlyph.reveal, .badge.win, .badge.lose, .badge.draw, .resultText { animation: none; }
}

/* Small screens: keep it compact */
@media (max-height: 600px) {
  .panelMove { width: 56px; height: 56px; }
  .moveGlyph { font-size: 40px; }
  .choiceEmoji { font-size: 22px; }
  .actionBtn { padding: 12px 16px; }
}
`;

export default RockPaperScissorsDuelGame;