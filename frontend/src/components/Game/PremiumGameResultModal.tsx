import type { CSSProperties } from 'react';
import coinIcon from '../../assets/solo/scratch/icon-coin.webp';

export type ResultPlayer = {
  id?: number;
  name: string;
  photoUrl?: string;
  score?: string | number;
};

export type ResultTheme = {
  background: string;
  accent: string;
  rival: string;
  ink?: string;
};

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';

export const PremiumGameResultModal = ({
  gameTitle,
  resultTitle,
  reason,
  players,
  winnerUserID,
  draw = false,
  netResult,
  netLabel,
  continueLabel,
  onContinue,
  theme,
}: {
  gameTitle: string;
  resultTitle: string;
  reason?: string;
  players: [ResultPlayer, ResultPlayer];
  winnerUserID?: number;
  draw?: boolean;
  netResult?: number;
  netLabel: string;
  continueLabel: string;
  onContinue: () => void;
  theme: ResultTheme;
}) => {
  const orderedPlayers = draw
    ? players
    : [...players].sort((left, right) =>
        left.id === winnerUserID ? -1 : right.id === winnerUserID ? 1 : 0,
      );
  const style = {
    '--premium-result-bg': theme.background,
    '--premium-result-accent': theme.accent,
    '--premium-result-rival': theme.rival,
    '--premium-result-ink': theme.ink || '#ffffff',
  } as CSSProperties;

  return (
    <div
      className="premium-game-result-overlay"
      role="dialog"
      aria-modal="true"
      style={style}
    >
      <div className="premium-game-result-card">
        <span className="premium-game-result-kicker">{gameTitle} · Match result</span>
        <h2>{resultTitle}</h2>
        {reason && <p className="premium-game-result-reason">{reason}</p>}

        <div className="premium-game-result-players">
          {orderedPlayers.map((player, index) => {
            const winner = !draw && player.id === winnerUserID;
            return (
              <div
                className={`premium-game-result-player ${winner ? 'is-winner' : ''}`}
                key={player.id || index}
              >
                {winner && <span>Winner</span>}
                <div className="premium-game-result-avatar">
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt="" draggable={false} />
                  ) : (
                    getInitials(player.name)
                  )}
                </div>
                <strong>{player.name}</strong>
                {player.score !== undefined && <b>{player.score}</b>}
              </div>
            );
          })}
          <i>VS</i>
        </div>

        {netResult !== undefined && (
          <div className={`game-result-reward premium-game-result-net ${netResult > 0 ? 'is-win' : netResult < 0 ? 'is-loss' : ''}`}>
            <span>{netLabel}</span>
            <strong>{netResult > 0 ? '+' : ''}{netResult}</strong>
            <img src={coinIcon} alt="" draggable={false} />
          </div>
        )}

        <button type="button" className="game-result-exit" onClick={onContinue}>
          <span>←</span>
          <b>{continueLabel}</b>
          <i />
        </button>
      </div>
    </div>
  );
};
