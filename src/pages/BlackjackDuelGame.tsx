import React, { useEffect, useMemo, useRef, useState } from 'react';

type Suit = '♠' | '♥' | '♦' | '♣';

type PlayingCard = {
  id: string;
  rank: string;
  suit: Suit;
};

type Phase = 'dealing' | 'turn' | 'enemy_turn' | 'reveal' | 'between_rounds' | 'finished';
type RoundWinner = 'player' | 'enemy' | 'push' | null;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const isRed = (suit: Suit) => suit === '♥' || suit === '♦';

const rankValue = (rank: string) => {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
};

const handValue = (cards: PlayingCard[]) => {
  let total = cards.reduce((sum, card) => sum + rankValue(card.rank), 0);
  let aces = cards.filter((card) => card.rank === 'A').length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
};

const createDeck = () => {
  const deck: PlayingCard[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 8)}`,
        rank,
        suit,
      });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

const CrownDots = ({ playerWins, enemyWins }: { playerWins: number; enemyWins: number }) => (
  <div className="flex items-center justify-center gap-2">
    {[0, 1, 2].map((i) => (
      <div
        key={`p-${i}`}
        className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
          i < playerWins
            ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]'
            : 'bg-white/12'
        }`}
      />
    ))}

    <div className="w-4 h-px bg-white/10" />

    {[0, 1, 2].map((i) => (
      <div
        key={`e-${i}`}
        className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
          i < enemyWins
            ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.75)]'
            : 'bg-white/12'
        }`}
      />
    ))}
  </div>
);

const ScorePill = ({
  label,
  value,
  align = 'left',
  accent,
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
  accent: 'emerald' | 'rose';
}) => {
  const accentClasses =
    accent === 'emerald'
      ? 'text-emerald-300 border-emerald-400/15 bg-emerald-500/8'
      : 'text-rose-300 border-rose-400/15 bg-rose-500/8';

  return (
    <div
      className={`rounded-2xl border px-3 py-2 backdrop-blur-md ${accentClasses} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">{label}</div>
      <div className="text-lg font-black leading-none mt-1">{value}</div>
    </div>
  );
};

const PlayingCardView = ({
  card,
  hidden = false,
  stacked = false,
  delay = 0,
}: {
  card: PlayingCard;
  hidden?: boolean;
  stacked?: boolean;
  delay?: number;
}) => {
  return (
    <div
      className={`relative shrink-0 rounded-2xl overflow-hidden border shadow-[0_18px_30px_rgba(0,0,0,0.28)] w-[78px] h-[116px] ${
        stacked ? '-ml-8 first:ml-0' : ''
      } ${hidden ? 'border-white/10' : 'border-black/10'}`}
      style={{
        animation: 'bjDealIn 520ms cubic-bezier(.2,.85,.2,1) both',
        animationDelay: `${delay}ms`,
      }}
    >
      {hidden ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_30%),linear-gradient(135deg,#0f172a,#1f2937)]">
          <div className="absolute inset-2 rounded-xl border border-white/10 bg-[linear-gradient(45deg,rgba(255,255,255,0.06)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.06)_75%,transparent_75%,transparent)] bg-[length:18px_18px]" />
          <div className="absolute inset-0 flex items-center justify-center text-[20px] font-black tracking-tight text-emerald-300/90">
            Twin
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_34%),linear-gradient(180deg,#ffffff,#e5e7eb)]">
          <div
            className={`absolute top-2 left-2 leading-none ${
              isRed(card.suit) ? 'text-rose-500' : 'text-slate-900'
            }`}
          >
            <div className="text-sm font-black">{card.rank}</div>
            <div className="text-sm">{card.suit}</div>
          </div>

          <div
            className={`absolute inset-0 flex items-center justify-center text-[42px] font-black ${
              isRed(card.suit) ? 'text-rose-500' : 'text-slate-900'
            }`}
          >
            {card.suit}
          </div>

          <div
            className={`absolute bottom-2 right-2 rotate-180 leading-none ${
              isRed(card.suit) ? 'text-rose-500' : 'text-slate-900'
            }`}
          >
            <div className="text-sm font-black">{card.rank}</div>
            <div className="text-sm">{card.suit}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const formatVisibleScore = (cards: PlayingCard[], hidden: boolean) => {
  if (hidden) return `${cards.length} cards`;
  return `${handValue(cards)} pts`;
};

export const BlackjackDuelGame: React.FC = () => {
  const deckRef = useRef<PlayingCard[]>([]);
  const aiTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const nextRoundTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const fxTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const [playerCards, setPlayerCards] = useState<PlayingCard[]>([]);
  const [enemyCards, setEnemyCards] = useState<PlayingCard[]>([]);
  const [playerStood, setPlayerStood] = useState(false);
  const [enemyStood, setEnemyStood] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [phase, setPhase] = useState<Phase>('dealing');
  const [statusText, setStatusText] = useState('Раздача...');
  const [subStatusText, setSubStatusText] = useState('Cards are coming in');
  const [, setResultGlow] = useState<'none' | 'win' | 'lose' | 'push'>('none');
  const [roundWinner, setRoundWinner] = useState<RoundWinner>(null);

  const [playerWins, setPlayerWins] = useState(0);
  const [enemyWins, setEnemyWins] = useState(0);
  const [roundIndex, setRoundIndex] = useState(1);
  const [winnerText, setWinnerText] = useState('');

  const playerTotal = useMemo(() => handValue(playerCards), [playerCards]);
  const enemyTotal = useMemo(() => handValue(enemyCards), [enemyCards]);

  const hiddenEnemy = !revealed;

  const cleanupTimers = () => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (nextRoundTimerRef.current) {
      window.clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
    if (fxTimerRef.current) {
      window.clearTimeout(fxTimerRef.current);
      fxTimerRef.current = null;
    }
  };

  const drawCard = () => {
    if (deckRef.current.length === 0) {
      deckRef.current = createDeck();
    }
    const next = deckRef.current.pop();
    if (!next) throw new Error('Deck is empty');
    return next;
  };

  const flashResult = (kind: 'win' | 'lose' | 'push') => {
    setResultGlow(kind);
    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current);
    fxTimerRef.current = window.setTimeout(() => {
      setResultGlow('none');
    }, 1200);
  };

  const planEnemyTurn = (cardsState: PlayingCard[], alreadyStanding: boolean) => {
    if (alreadyStanding) return;

    const run = (currentCards: PlayingCard[]) => {
      const total = handValue(currentCards);

      if (total > 21) {
        setEnemyStood(true);
        return;
      }

      if (total >= 18) {
        aiTimerRef.current = window.setTimeout(() => {
          setEnemyStood(true);
        }, 760);
        return;
      }

      const shouldStand = total >= 16 ? Math.random() < 0.62 : Math.random() < 0.22;

      aiTimerRef.current = window.setTimeout(() => {
        if (shouldStand) {
          setEnemyStood(true);
          return;
        }

        const next = [...currentCards, drawCard()];
        setEnemyCards(next);
        run(next);
      }, 920);
    };

    run(cardsState);
  };

  const finishGame = (nextPlayerWins: number, nextEnemyWins: number) => {
    setPhase('finished');
    setWinnerText(nextPlayerWins > nextEnemyWins ? 'YOU WIN' : 'RIVAL WINS');
  };

  const startRound = (roundNo: number) => {
    cleanupTimers();

    deckRef.current = createDeck();
    const p1 = drawCard();
    const e1 = drawCard();
    const p2 = drawCard();
    const e2 = drawCard();

    setRoundIndex(roundNo);
    setPlayerCards([p1, p2]);
    setEnemyCards([e1, e2]);
    setPlayerStood(false);
    setEnemyStood(false);
    setRevealed(false);
    setPhase('dealing');
    setStatusText('Раздача карт');
    setSubStatusText('Get ready');
    setResultGlow('none');
    setRoundWinner(null);

    revealTimerRef.current = window.setTimeout(() => {
      setPhase('turn');
      setStatusText('Твой ход');
      setSubStatusText('Взять еще или все');
      planEnemyTurn([e1, e2], false);
    }, 620);
  };

  const settleRound = (pCards: PlayingCard[] = playerCards, eCards: PlayingCard[] = enemyCards) => {
    cleanupTimers();
    setPhase('reveal');
    setRevealed(true);

    const p = handValue(pCards);
    const e = handValue(eCards);

    let nextPlayerWins = playerWins;
    let nextEnemyWins = enemyWins;

    if (p > 21 && e > 21) {
      setStatusText('Double Bust');
      setSubStatusText('Оба перебрали • раунд без очка');
      setRoundWinner('push');
      flashResult('push');
    } else if (p > 21) {
      nextEnemyWins += 1;
      setPlayerWins(nextPlayerWins);
      setEnemyWins(nextEnemyWins);
      setStatusText('Round Lost');
      setSubStatusText('Ты перебрал');
      setRoundWinner('enemy');
      flashResult('lose');
    } else if (e > 21) {
      nextPlayerWins += 1;
      setPlayerWins(nextPlayerWins);
      setEnemyWins(nextEnemyWins);
      setStatusText('Round Won');
      setSubStatusText('Соперник перебрал');
      setRoundWinner('player');
      flashResult('win');
    } else if (p > e) {
      nextPlayerWins += 1;
      setPlayerWins(nextPlayerWins);
      setEnemyWins(nextEnemyWins);
      setStatusText('Round Won');
      setSubStatusText(`${p} против ${e}`);
      setRoundWinner('player');
      flashResult('win');
    } else if (e > p) {
      nextEnemyWins += 1;
      setPlayerWins(nextPlayerWins);
      setEnemyWins(nextEnemyWins);
      setStatusText('Round Lost');
      setSubStatusText(`${p} против ${e}`);
      setRoundWinner('enemy');
      flashResult('lose');
    } else {
      setStatusText('Push');
      setSubStatusText(`Ничья • ${p} на ${e}`);
      setRoundWinner('push');
      flashResult('push');
    }

    if (nextPlayerWins >= 3 || nextEnemyWins >= 3) {
      nextRoundTimerRef.current = window.setTimeout(() => {
        finishGame(nextPlayerWins, nextEnemyWins);
      }, 2300);
      return;
    }

    nextRoundTimerRef.current = window.setTimeout(() => {
      setPhase('between_rounds');
      startRound(roundIndex + 1);
    }, 2600);
  };

  useEffect(() => {
    startRound(1);
    return cleanupTimers;
  }, []);

  useEffect(() => {
    if (phase === 'finished') return;
    if (playerTotal > 21 && !playerStood) {
      setPlayerStood(true);
      setStatusText('Ты перебрал');
      setSubStatusText(`${playerTotal} очков`);
    }
  }, [playerTotal, playerStood, phase]);

  useEffect(() => {
    if (phase === 'finished') return;

    const playerDone = playerStood || playerTotal > 21;
    const enemyDone = enemyStood || enemyTotal > 21;

    if (playerDone && enemyDone && phase !== 'reveal' && phase !== 'between_rounds') {
      settleRound();
    } else if (playerDone && !enemyDone) {
      setPhase('enemy_turn');
      setStatusText('Ход соперника');
      setSubStatusText('Ждем его решение');
    }
  }, [playerStood, enemyStood, playerTotal, enemyTotal, phase]);

  const onHit = () => {
    if (phase !== 'turn') return;
    if (playerStood || revealed) return;

    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    setStatusText('Ты взял карту');
    setSubStatusText(`Теперь ${handValue(next)} очков`);
  };

  const onStand = () => {
    if (phase !== 'turn') return;
    if (playerStood || revealed) return;

    setPlayerStood(true);
    setStatusText('Ты выбрал "Все"');
    setSubStatusText(`Фиксируем ${playerTotal} очков`);
  };

  const onRestart = () => {
    cleanupTimers();
    setPlayerWins(0);
    setEnemyWins(0);
    setWinnerText('');
    setRoundWinner(null);
    startRound(1);
  };

 

  const roundOverlay =
    roundWinner === 'player'
      ? {
          title: 'YOU WIN ROUND',
          subtitle: 'Раунд за тобой',
          cls: 'from-emerald-500/30 to-teal-500/10 border-emerald-300/20 text-emerald-200',
        }
      : roundWinner === 'enemy'
      ? {
          title: 'RIVAL WINS ROUND',
          subtitle: 'Раунд у соперника',
          cls: 'from-rose-500/30 to-orange-500/10 border-rose-300/20 text-rose-200',
        }
      : roundWinner === 'push'
      ? {
          title: 'PUSH',
          subtitle: 'Ничья в раунде',
          cls: 'from-amber-500/26 to-yellow-500/10 border-amber-300/20 text-amber-200',
        }
      : null;

  return (
    <>
      <style>{`
        @keyframes bjDealIn {
          0% { transform: translateY(-28px) scale(.9) rotate(-5deg); opacity: 0; }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bjPulseSoft {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.025); opacity: .96; }
        }
        @keyframes bjFadeRise {
          0% { transform: translateY(10px) scale(.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes bjModalIn {
          0% { transform: translateY(18px) scale(.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="w-full h-full bg-[#07110f] overflow-hidden touch-none select-none"
        style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <div className="relative h-full flex flex-col overflow-hidden">
          <div className="shrink-0 px-2 pt-2 z-20">
            <div className="rounded-2xl bg-black/35 border border-white/10 backdrop-blur-xl px-3 py-2 shadow-2xl">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <button
                  onClick={() => window.history.back()}
                  className="px-3 py-1.5 rounded-xl bg-white/8 border border-white/10 text-[10px] uppercase tracking-[0.14em] font-bold text-white/75 active:scale-95 transition"
                >
                  Back
                </button>

                <div className="min-w-0 text-center">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold">
                    Blackjack Duel
                  </div>
                  <div className="text-sm font-black text-white leading-none mt-1">
                    Round {roundIndex}
                  </div>
                </div>

                <div className="px-2 text-[10px] uppercase tracking-[0.18em] font-black text-white/45">
                  Best of 5
                </div>
              </div>

              <div className="mt-2">
                <CrownDots playerWins={playerWins} enemyWins={enemyWins} />
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 p-2 pb-3">
            <div className="relative h-full rounded-[28px] overflow-hidden border border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.38)] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_22%),linear-gradient(180deg,#0a241d,#091a16_56%,#07120f)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_22%)]" />
              <div className="absolute inset-0 border-[12px] border-[#4b2f16]/50 rounded-[28px] pointer-events-none" />
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.02),transparent_35%,rgba(255,255,255,0.015)_65%,transparent)] pointer-events-none" />
              <div className="absolute inset-x-8 top-1/2 h-px bg-white/10 pointer-events-none" />

              <div className="absolute inset-x-0 top-3 z-10 px-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                  <ScorePill label="Your Score" value={`${playerTotal} pts`} accent="emerald" />
                  <div className="rounded-2xl bg-black/28 border border-white/10 px-3 py-2 backdrop-blur-md text-center max-w-[170px]">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-bold">
                      Status
                    </div>
                    <div
                      className="text-sm font-black text-white mt-1 uppercase tracking-[0.08em]"
                      style={{ animation: 'bjPulseSoft 1.8s ease-in-out infinite' }}
                    >
                      {statusText}
                    </div>
                    <div className="text-[10px] text-white/45 mt-1 font-semibold">{subStatusText}</div>
                  </div>
                  <ScorePill
                    label="Rival Score"
                    value={formatVisibleScore(enemyCards, hiddenEnemy)}
                    align="right"
                    accent="rose"
                  />
                </div>
              </div>

              <div className="absolute inset-x-0 top-[138px] px-4 z-10">
                <div className="flex justify-center items-center">
                  {enemyCards.map((card, index) => (
                    <PlayingCardView
                      key={card.id}
                      card={card}
                      hidden={!revealed && index >= 1}
                      stacked
                      delay={index * 110}
                    />
                  ))}
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-[150px] px-4 z-10">
                <div className="flex justify-center items-center">
                  {playerCards.map((card, index) => (
                    <PlayingCardView
                      key={card.id}
                      card={card}
                      stacked
                      delay={index * 110}
                    />
                  ))}
                </div>
              </div>

              {roundOverlay && phase !== 'finished' && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center px-6">
                  <div
                    className={`rounded-[26px] border backdrop-blur-xl px-7 py-5 text-center bg-gradient-to-b ${roundOverlay.cls}`}
                    style={{ animation: 'bjFadeRise 320ms ease-out both' }}
                  >
                    <div className="text-[12px] uppercase tracking-[0.28em] font-black">
                      {roundOverlay.title}
                    </div>
                    <div className="text-sm mt-2 font-semibold text-white/85">{roundOverlay.subtitle}</div>
                  </div>
                </div>
              )}

              {phase !== 'finished' && (
                <div className="absolute left-4 right-4 bottom-4 z-10">
                  <div className="rounded-[24px] bg-black/34 border border-white/10 backdrop-blur-xl p-3 shadow-2xl">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={onHit}
                        disabled={phase !== 'turn' || playerStood || revealed}
                        className={`py-3 rounded-2xl font-black text-sm uppercase tracking-[0.12em] transition ${
                          phase !== 'turn' || playerStood || revealed
                            ? 'bg-white/8 text-white/30 border border-white/10'
                            : 'bg-gradient-to-r from-emerald-400 to-teal-500 text-black active:scale-[0.98]'
                        }`}
                      >
                        Взять еще
                      </button>

                      <button
                        onClick={onStand}
                        disabled={phase !== 'turn' || playerStood || revealed}
                        className={`py-3 rounded-2xl font-black text-sm uppercase tracking-[0.12em] transition ${
                          phase !== 'turn' || playerStood || revealed
                            ? 'bg-white/8 text-white/30 border border-white/10'
                            : 'bg-gradient-to-r from-amber-400 to-orange-500 text-black active:scale-[0.98]'
                        }`}
                      >
                        Все
                      </button>
                    </div>

                    <div className="mt-2.5 text-center text-[11px] text-white/45 font-semibold">
                      {phase === 'turn'
                        ? 'Выбери действие'
                        : phase === 'enemy_turn'
                        ? 'Соперник думает...'
                        : phase === 'dealing'
                        ? 'Раздача карт...'
                        : phase === 'reveal'
                        ? 'Смотрим результат'
                        : 'Следующий раунд'}
                    </div>
                  </div>
                </div>
              )}

              {phase === 'finished' && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_18%),rgba(2,6,23,0.82)] backdrop-blur-md flex items-center justify-center z-30 p-5">
                  <div
                    className="relative w-full max-w-[340px] overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,36,29,0.98),rgba(8,20,18,0.98))] text-center px-6 py-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
                    style={{ animation: 'bjModalIn 320ms ease-out both' }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%)] pointer-events-none" />
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 h-28 w-28 rounded-full bg-emerald-400/12 blur-2xl pointer-events-none" />

                    <div className="relative">
                      <div className="text-[11px] uppercase tracking-[0.26em] text-white/35 font-bold">
                        Match Finished
                      </div>

                      <div className="mt-3 text-4xl font-black text-white">{winnerText}</div>

                      <div className="mt-3 text-sm text-white/55">
                        First to three rounds takes the match
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/8 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-bold">
                            You
                          </div>
                          <div className="text-3xl font-black text-emerald-300 mt-2 leading-none">
                            {playerWins}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">rounds won</div>
                        </div>

                        <div className="rounded-2xl border border-rose-400/15 bg-rose-500/8 px-4 py-4">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-bold">
                            Rival
                          </div>
                          <div className="text-3xl font-black text-rose-300 mt-2 leading-none">
                            {enemyWins}
                          </div>
                          <div className="text-[11px] text-white/45 mt-2">rounds won</div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <CrownDots playerWins={playerWins} enemyWins={enemyWins} />
                      </div>

                      <button
                        onClick={onRestart}
                        className="mt-7 w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-black uppercase tracking-[0.12em] active:scale-[0.98] transition shadow-[0_12px_30px_rgba(16,185,129,0.22)]"
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