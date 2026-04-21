import React, { useEffect, useMemo, useRef, useState } from 'react';

type Choice = 'rock' | 'paper' | 'scissors';
type Phase = 'countdown' | 'reveal' | 'round_end' | 'finished';
type RoundWinner = 'player' | 'bot' | 'draw' | null;

const TURN_SECONDS = 5;
const TARGET_SCORE = 5;

const CHOICES: Array<{
  key: Choice;
  label: string;
  icon: string;
  color: string;
  accent: string;
  glow: string;
}> = [
  {
    key: 'rock',
    label: 'Rock',
    icon: '✊',
    color: 'from-orange-400 via-rose-500 to-red-500',
    accent: '#fb923c',
    glow: 'rgba(251,146,60,0.28)',
  },
  {
    key: 'paper',
    label: 'Paper',
    icon: '✋',
    color: 'from-cyan-400 via-sky-500 to-blue-500',
    accent: '#22d3ee',
    glow: 'rgba(34,211,238,0.28)',
  },
  {
    key: 'scissors',
    label: 'Scissors',
    icon: '✌️',
    color: 'from-fuchsia-400 via-violet-500 to-purple-500',
    accent: '#d946ef',
    glow: 'rgba(217,70,239,0.28)',
  },
];

const beats: Record<Choice, Choice> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

const getChoiceMeta = (choice: Choice | null) => {
  if (!choice) return null;
  return CHOICES.find((item) => item.key === choice) ?? null;
};

const getRoundWinner = (player: Choice, bot: Choice): RoundWinner => {
  if (player === bot) return 'draw';
  return beats[player] === bot ? 'player' : 'bot';
};

const randomChoice = (): Choice => {
  const variants: Choice[] = ['rock', 'paper', 'scissors'];
  return variants[Math.floor(Math.random() * variants.length)];
};

const ScoreDots = ({ score, tone }: { score: number; tone: 'emerald' | 'rose' }) => {
  const activeClass =
    tone === 'emerald'
      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]'
      : 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.75)]';

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TARGET_SCORE }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 w-2.5 rounded-full border border-white/10 transition-all duration-500 ${
            i < score ? activeClass : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  );
};

const ChoiceCard = ({
  choice,
  selected,
  disabled,
  onClick,
}: {
  choice: (typeof CHOICES)[number];
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative rounded-[24px] border p-2 transition-all duration-300 ${
        selected
          ? 'bg-white text-slate-950 border-white scale-[1.03] shadow-[0_18px_40px_rgba(255,255,255,0.12)]'
          : disabled
          ? 'bg-white/6 border-white/8 text-white/30'
          : 'bg-white/8 border-white/10 text-white hover:bg-white/10 active:scale-[0.98]'
      }`}
    >
      <div className="absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%)] pointer-events-none" />

      <div className="relative flex flex-col items-center justify-center gap-1.5 py-2">
        <div
          className={`grid h-12 w-12 place-items-center rounded-[16px] bg-gradient-to-br ${choice.color} text-[28px] text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition-transform duration-300 ${
            selected ? 'scale-105' : 'group-hover:scale-[1.03]'
          }`}
        >
          {choice.icon}
        </div>

        <div className="text-[10px] uppercase tracking-[0.16em] font-black">
          {choice.label}
        </div>
      </div>
    </button>
  );
};

const RevealHand = ({
  title,
  choice,
  hidden,
  win,
  side,
  isThinking,
}: {
  title: string;
  choice: Choice | null;
  hidden: boolean;
  win: boolean;
  side: 'left' | 'right';
  isThinking?: boolean;
}) => {
  const meta = getChoiceMeta(choice);

  return (
    <div
      className={`relative rounded-[30px] border backdrop-blur-xl p-4 transition-all duration-500 ${
        win
          ? 'bg-white/12 border-white/18 shadow-[0_0_36px_rgba(255,255,255,0.10)]'
          : 'bg-white/7 border-white/10'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold text-center">
        {title}
      </div>

      <div className="mt-4 flex items-center justify-center min-h-[148px]">
        {hidden || !meta ? (
          <div className="relative h-[130px] w-[108px] rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,#111827,#1f2937)] shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
            <div className="absolute inset-2 rounded-[20px] border border-white/10 bg-[linear-gradient(45deg,rgba(255,255,255,0.06)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.06)_75%,transparent_75%,transparent)] bg-[length:18px_18px]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
              <div className="text-lg font-black tracking-[0.14em]">?</div>
              {isThinking && (
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-bounce" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="relative"
            style={{ animation: 'rpsRevealIn 500ms cubic-bezier(.2,.85,.2,1) both' }}
          >
            <div
              className="absolute inset-0 rounded-[30px] blur-2xl opacity-60"
              style={{
                background: `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)`,
                animation: 'rpsAura 1.6s ease-in-out infinite',
              }}
            />
            <div className={`relative h-[130px] w-[108px] rounded-[28px] bg-gradient-to-br ${meta.color} text-white shadow-[0_22px_42px_rgba(0,0,0,0.24)]`}>
              <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_34%)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="text-[50px] leading-none"
                  style={{ transform: side === 'left' ? 'rotate(-4deg)' : 'rotate(4deg)' }}
                >
                  {meta.icon}
                </div>
                <div className="mt-2.5 text-[10px] uppercase tracking-[0.2em] font-black">
                  {meta.label}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const RockPaperScissorsDuelGame: React.FC = () => {
  const countdownIntervalRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const nextRoundTimeoutRef = useRef<number | null>(null);

  const phaseRef = useRef<Phase>('countdown');
  const previewChoiceRef = useRef<Choice | null>(null);
  const playerScoreRef = useRef(0);
  const botScoreRef = useRef(0);
  const roundNumberRef = useRef(1);
  const matchWinnerRef = useRef<RoundWinner>(null);

  const [phase, setPhase] = useState<Phase>('countdown');
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);

  const [lockedPlayerChoice, setLockedPlayerChoice] = useState<Choice | null>(null);
  const [previewChoice, setPreviewChoice] = useState<Choice | null>(null);
  const [botChoice, setBotChoice] = useState<Choice | null>(null);

  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);

  const [roundWinner, setRoundWinner] = useState<RoundWinner>(null);
  const [statusTitle, setStatusTitle] = useState('Choose your sign');
  const [statusText, setStatusText] = useState('У тебя 5 секунд на выбор');
  const [matchWinner, setMatchWinner] = useState<RoundWinner>(null);
  const [showCountdownBlast, setShowCountdownBlast] = useState(false);

  const clearTimers = () => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    if (nextRoundTimeoutRef.current !== null) {
      window.clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
  };

  const syncPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const syncPlayerScore = (next: number) => {
    playerScoreRef.current = next;
    setPlayerScore(next);
  };

  const syncBotScore = (next: number) => {
    botScoreRef.current = next;
    setBotScore(next);
  };

  const syncRoundNumber = (next: number) => {
    roundNumberRef.current = next;
    setRoundNumber(next);
  };

  const syncMatchWinner = (next: RoundWinner) => {
    matchWinnerRef.current = next;
    setMatchWinner(next);
  };

  const startCountdown = () => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.setTimeout(() => {
            lockAndReveal();
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const beginRound = (nextRound: number) => {
    clearTimers();
    syncPhase('countdown');
    setTimeLeft(TURN_SECONDS);
    setLockedPlayerChoice(null);
    setPreviewChoice(null);
    setBotChoice(null);
    setRoundWinner(null);
    setShowCountdownBlast(false);
    previewChoiceRef.current = null;
    syncRoundNumber(nextRound);
    setStatusTitle('Choose your sign');
    setStatusText('У тебя 5 секунд на выбор');
    startCountdown();
  };

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevBodyTouch = document.body.style.touchAction;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'none';

    beginRound(1);

    return () => {
      clearTimers();
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.body.style.touchAction = prevBodyTouch;
    };
  }, []);

  const finishMatchIfNeeded = (nextPlayerScore: number, nextBotScore: number) => {
    if (nextPlayerScore >= TARGET_SCORE) {
      syncMatchWinner('player');
      syncPhase('finished');
      return true;
    }
    if (nextBotScore >= TARGET_SCORE) {
      syncMatchWinner('bot');
      syncPhase('finished');
      return true;
    }
    return false;
  };

  const lockAndReveal = () => {
    if (phaseRef.current !== 'countdown' || matchWinnerRef.current) return;

    clearTimers();

    const finalPlayerChoice: Choice = previewChoiceRef.current ?? randomChoice();
    const finalBotChoice: Choice = randomChoice();

    setLockedPlayerChoice(finalPlayerChoice);
    setBotChoice(finalBotChoice);
    setShowCountdownBlast(true);
    syncPhase('reveal');
    setStatusTitle('3 · 2 · 1 · Reveal');
    setStatusText('Вскрываем выборы');

    revealTimeoutRef.current = window.setTimeout(() => {
      const result = getRoundWinner(finalPlayerChoice, finalBotChoice);
      setRoundWinner(result);

      if (result === 'player') {
        const nextPlayerScore = playerScoreRef.current + 1;
        syncPlayerScore(nextPlayerScore);
        setStatusTitle('You win the round');
        setStatusText(`${getChoiceMeta(finalPlayerChoice)?.label} beats ${getChoiceMeta(finalBotChoice)?.label}`);

        if (finishMatchIfNeeded(nextPlayerScore, botScoreRef.current)) {
          return;
        }
      } else if (result === 'bot') {
        const nextBotScore = botScoreRef.current + 1;
        syncBotScore(nextBotScore);
        setStatusTitle('Bot wins the round');
        setStatusText(`${getChoiceMeta(finalBotChoice)?.label} beats ${getChoiceMeta(finalPlayerChoice)?.label}`);

        if (finishMatchIfNeeded(playerScoreRef.current, nextBotScore)) {
          return;
        }
      } else {
        setStatusTitle('Draw round');
        setStatusText('Одинаковый выбор');
      }

      syncPhase('round_end');

      nextRoundTimeoutRef.current = window.setTimeout(() => {
        beginRound(roundNumberRef.current + 1);
      }, 2100);
    }, 1050);
  };

  const handleSelect = (choice: Choice) => {
    if (phaseRef.current !== 'countdown') return;

    previewChoiceRef.current = choice;
    setPreviewChoice(choice);
    setStatusTitle(`${getChoiceMeta(choice)?.label} selected`);
    setStatusText('Можно поменять выбор до конца таймера');
  };

  const handleRestart = () => {
    clearTimers();
    syncPlayerScore(0);
    syncBotScore(0);
    syncMatchWinner(null);
    beginRound(1);
  };

  const progress = (timeLeft / TURN_SECONDS) * 100;

  const roundBadge =
    roundWinner === 'player'
      ? {
          title: 'YOU WIN',
          cls: 'from-emerald-500/30 to-cyan-500/10 border-emerald-300/20 text-emerald-200',
        }
      : roundWinner === 'bot'
      ? {
          title: 'BOT WINS',
          cls: 'from-rose-500/30 to-orange-500/10 border-rose-300/20 text-rose-200',
        }
      : roundWinner === 'draw'
      ? {
          title: 'DRAW',
          cls: 'from-white/16 to-white/6 border-white/15 text-white',
        }
      : null;

  const panelGlow =
    phase === 'reveal' || phase === 'round_end'
      ? roundWinner === 'player'
        ? 'shadow-[0_0_90px_rgba(52,211,153,0.10)]'
        : roundWinner === 'bot'
        ? 'shadow-[0_0_90px_rgba(251,113,133,0.10)]'
        : 'shadow-[0_0_90px_rgba(255,255,255,0.06)]'
      : '';

  const isCountdownUrgent = timeLeft <= 2 && phase === 'countdown';

  const finalTitle = useMemo(() => {
    if (matchWinner === 'player') return 'YOU WIN';
    if (matchWinner === 'bot') return 'BOT WINS';
    return '';
  }, [matchWinner]);

  return (
    <>
      <style>{`
        @keyframes rpsRevealIn {
          0% { transform: translateY(18px) scale(.84) rotate(-6deg); opacity: 0; filter: blur(4px); }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; filter: blur(0); }
        }
        @keyframes rpsFadeRise {
          0% { transform: translateY(12px) scale(.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes rpsPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes rpsAura {
          0%,100% { opacity: .65; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.07); }
        }
        @keyframes rpsVsIn {
          0% { transform: scale(.7); opacity: 0; filter: blur(3px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }
        @keyframes rpsCountdownBlast {
          0% { transform: scale(.72); opacity: 0; filter: blur(3px); }
          40% { transform: scale(1.08); opacity: 1; filter: blur(0); }
          100% { transform: scale(1); opacity: .96; }
        }
      `}</style>

      <div
        className="w-full h-full overflow-hidden touch-none select-none bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.16),transparent_22%),radial-gradient(circle_at_left,rgba(34,211,238,0.15),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.18),transparent_24%),linear-gradient(180deg,#0a0f1e,#120d1f_46%,#17101d)]"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="h-full flex flex-col p-2">
          <div className="shrink-0 rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.24)] px-3 py-2">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="rounded-2xl border border-emerald-400/12 bg-emerald-500/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">You</div>
                <div className="mt-1 flex items-end gap-2">
                  <div className="text-[28px] font-black text-emerald-300 leading-none">{playerScore}</div>
                  <div className="text-xs text-white/35 font-bold pb-0.5">points</div>
                </div>
              </div>

              <div className="text-center min-w-[116px]">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold">
                  RPS Duel
                </div>
                <div className="text-xl font-black text-white leading-none mt-1">
                  Round {roundNumber}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/38 font-bold">
                  First to 5
                </div>
              </div>

              <div className="rounded-2xl border border-rose-400/12 bg-rose-500/10 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">Bot</div>
                <div className="mt-1 flex items-end justify-end gap-2">
                  <div className="text-xs text-white/35 font-bold pb-0.5">points</div>
                  <div className="text-[28px] font-black text-rose-300 leading-none">{botScore}</div>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <div className="h-2 rounded-full bg-white/8 overflow-hidden border border-white/8">
                <div
                  className={`h-full transition-[width] duration-500 ${
                    isCountdownUrgent
                      ? 'bg-gradient-to-r from-red-400 to-orange-500'
                      : 'bg-gradient-to-r from-orange-400 via-fuchsia-400 to-cyan-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="rounded-full px-3 py-1.5 border border-white/10 bg-white/10 text-[11px] uppercase tracking-[0.18em] font-black text-white">
                {phase === 'countdown'
                  ? 'Choose'
                  : phase === 'reveal'
                  ? 'Reveal'
                  : phase === 'finished'
                  ? 'Finished'
                  : 'Next'}
              </div>

              <div
                className={`rounded-full px-3 py-1.5 text-[11px] font-black text-white uppercase tracking-[0.18em] min-w-[62px] text-center ${
                  isCountdownUrgent
                    ? 'bg-red-500/20 border border-red-400/20 shadow-[0_0_16px_rgba(248,113,113,0.16)]'
                    : 'bg-white/10 border border-white/10'
                }`}
              >
                {phase === 'countdown' ? `${timeLeft}s` : 'LOCK'}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 pt-2 pb-0">
            <div className={`relative h-full rounded-[34px] overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(12,16,29,0.98),rgba(17,11,29,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.26)] ${panelGlow}`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_25%)]" />

              <div className="absolute inset-x-3 top-3 z-10">
                <div className="rounded-[24px] border border-white/10 bg-black/22 backdrop-blur-xl px-4 py-3 shadow-[0_10px_26px_rgba(0,0,0,0.16)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">
                        Status
                      </div>
                      <div className="text-base font-black text-white mt-1">{statusTitle}</div>
                      <div className="text-[12px] text-white/55 font-semibold mt-1">{statusText}</div>
                    </div>

                    <div className="hidden sm:flex items-center gap-3">
                      <ScoreDots score={playerScore} tone="emerald" />
                      <div className="w-5 h-px bg-white/10" />
                      <ScoreDots score={botScore} tone="rose" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-4 top-[92px] bottom-[116px] grid grid-cols-2 gap-4 items-center">
                <RevealHand
                  title="You"
                  choice={lockedPlayerChoice}
                  hidden={phase === 'countdown'}
                  win={roundWinner === 'player'}
                  side="left"
                />

                <RevealHand
                  title="Bot"
                  choice={botChoice}
                  hidden={phase === 'countdown'}
                  win={roundWinner === 'bot'}
                  side="right"
                  isThinking={phase === 'countdown'}
                />
              </div>

              {(phase === 'reveal' || phase === 'round_end') && lockedPlayerChoice && botChoice && (
                <div className="absolute left-1/2 top-[49%] -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                  <div
                    className="rounded-full border border-white/10 bg-black/28 backdrop-blur-xl px-4 py-2 text-white font-black tracking-[0.18em] uppercase shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
                    style={{ animation: 'rpsVsIn 320ms ease-out both' }}
                  >
                    VS
                  </div>
                </div>
              )}

              {phase === 'reveal' && showCountdownBlast && (
                <div className="absolute left-1/2 top-[34%] -translate-x-1/2 z-20 pointer-events-none">
                  <div
                    className="rounded-full border border-white/12 bg-white/10 backdrop-blur-xl px-5 py-2 text-white text-lg font-black tracking-[0.28em]"
                    style={{ animation: 'rpsCountdownBlast 420ms ease-out both' }}
                  >
                    3 · 2 · 1
                  </div>
                </div>
              )}

              <div className="absolute inset-x-4 bottom-3 z-10">
                <div className="rounded-[24px] border border-white/10 bg-black/24 backdrop-blur-xl p-2.5 shadow-[0_10px_26px_rgba(0,0,0,0.16)]">
                  <div className="grid grid-cols-3 gap-2.5">
                    {CHOICES.map((choice) => (
                      <ChoiceCard
                        key={choice.key}
                        choice={choice}
                        selected={previewChoice === choice.key}
                        disabled={phase !== 'countdown'}
                        onClick={() => handleSelect(choice.key)}
                      />
                    ))}
                  </div>

                  <div className="mt-2 text-center text-[11px] text-white/45 font-semibold">
                    {phase === 'countdown'
                      ? 'Выбери знак до конца таймера'
                      : phase === 'reveal'
                      ? 'Открываем выборы...'
                      : phase === 'round_end'
                      ? 'Готовим следующий раунд'
                      : 'Матч завершён'}
                  </div>
                </div>
              </div>

              {roundBadge && phase !== 'finished' && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center px-6">
                  <div
                    className={`rounded-[28px] border backdrop-blur-xl px-7 py-5 text-center bg-gradient-to-b ${roundBadge.cls}`}
                    style={{ animation: 'rpsFadeRise 320ms ease-out both' }}
                  >
                    <div className="text-[12px] uppercase tracking-[0.28em] font-black">
                      {roundBadge.title}
                    </div>
                    <div className="text-sm mt-2 font-semibold text-white/85">
                      {roundWinner === 'draw' ? 'Никто не взял раунд' : 'Очко уходит победителю'}
                    </div>
                  </div>
                </div>
              )}

              {phase === 'finished' && (
                <div className="absolute inset-0 z-30 bg-black/54 backdrop-blur-md flex items-center justify-center p-5">
                  <div
                    className="w-full max-w-[360px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,17,31,0.96),rgba(17,11,33,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.28)] overflow-hidden"
                    style={{ animation: 'rpsFadeRise .34s ease-out both' }}
                  >
                    <div className="px-6 pt-6 pb-5 text-center">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40 font-bold">
                        Match finished
                      </div>
                      <div
                        className={`mt-3 text-4xl font-black ${
                          matchWinner === 'player' ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                        style={{ animation: 'rpsPulse 1.4s ease-in-out infinite' }}
                      >
                        {finalTitle}
                      </div>
                      <div className="mt-2 text-sm text-white/55">
                        {matchWinner === 'player' ? 'Ты забрал дуэль' : 'Бот оказался сильнее'}
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            You
                          </div>
                          <div className="text-3xl font-black text-emerald-300 mt-2 leading-none">
                            {playerScore}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">points</div>
                        </div>

                        <div className="rounded-2xl bg-rose-500/8 border border-rose-500/10 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-bold">
                            Bot
                          </div>
                          <div className="text-3xl font-black text-rose-300 mt-2 leading-none">
                            {botScore}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">points</div>
                        </div>
                      </div>

                      <button
                        onClick={handleRestart}
                        className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-400 via-rose-500 to-fuchsia-500 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(251,146,60,0.22)]"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(phase === 'reveal' || phase === 'round_end') && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div
                    className="absolute left-[14%] top-[24%] h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl"
                    style={{ animation: 'rpsAura 1.6s ease-in-out infinite' }}
                  />
                  <div
                    className="absolute right-[12%] top-[22%] h-44 w-44 rounded-full bg-fuchsia-400/10 blur-3xl"
                    style={{ animation: 'rpsAura 1.6s ease-in-out .2s infinite' }}
                  />
                  <div
                    className="absolute left-1/2 bottom-[20%] h-32 w-32 -translate-x-1/2 rounded-full bg-orange-400/10 blur-3xl"
                    style={{ animation: 'rpsAura 1.6s ease-in-out .4s infinite' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default RockPaperScissorsDuelGame;