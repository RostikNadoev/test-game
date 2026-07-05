import { useCallback, useRef, useState } from 'react';
import { matchesApi } from '../api/matches';
import type { LobbyPlayerInfo } from '../api/types';
import { useAuth } from '../auth/useAuth';

const LOBBY_ID_KEY = 'twingames_active_lobby_id';
const GAME_KEY = 'twingames_active_game';
const PLAYERS_INFO_KEY = 'twingames_blackjack_players_info';

export function readActiveLobbyId() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(LOBBY_ID_KEY) || '';
}

export function readActiveGameCode(fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.sessionStorage.getItem(GAME_KEY) || fallback;
}

export function readStoredPlayersInfo(): LobbyPlayerInfo[] {
  if (typeof window === 'undefined') return [];

  const raw = window.sessionStorage.getItem(PLAYERS_INFO_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as LobbyPlayerInfo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveWinnerUserId(
  currentUserId: number | undefined,
  outcome: 'win' | 'loss' | 'draw',
  playersInfo: LobbyPlayerInfo[] = readStoredPlayersInfo(),
) {
  if (outcome === 'draw' || !currentUserId) return null;

  const opponent = playersInfo.find((player) => player.id !== currentUserId);
  if (outcome === 'win') return currentUserId;
  return opponent?.id ?? null;
}

export function validateFinishOutcome(
  currentUserId: number | undefined,
  outcome: 'win' | 'loss' | 'draw',
  playersInfo: LobbyPlayerInfo[] = readStoredPlayersInfo(),
): { ok: true; winnerUserId: number | null } | { ok: false; error: string } {
  if (outcome === 'draw' || !currentUserId) {
    return { ok: true, winnerUserId: null };
  }

  const opponent = playersInfo.find((player) => player.id !== currentUserId);
  if (outcome === 'win') {
    return { ok: true, winnerUserId: currentUserId };
  }
  if (!opponent) {
    return { ok: false, error: 'Opponent not found' };
  }
  return { ok: true, winnerUserId: opponent.id };
}

export function useLobbyMatchFinish(defaultGame = '') {
  const { user, refreshBalance, refreshProfile } = useAuth();
  const finishedRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const finishMatch = useCallback(
    async (outcome: 'win' | 'loss' | 'draw', gameCode = defaultGame) => {
      const lobbyId = readActiveLobbyId();
      const game = gameCode || readActiveGameCode(defaultGame);

      if (!lobbyId || !game || finishedRef.current) return;
      if (game === 'blackjack_duel') return;

      finishedRef.current = true;
      setFinishError(null);

      const validation = validateFinishOutcome(user?.id, outcome);
      if (!validation.ok) {
        finishedRef.current = false;
        setFinishError(validation.error);
        return;
      }

      const winnerUserId = validation.winnerUserId;

      try {
        const response = await matchesApi.finish({
          lobby_id: lobbyId,
          game,
          winner_user_id: winnerUserId,
        });
        if (response.pending) {
          setPending(true);
          finishedRef.current = false;
          return response;
        }
        setPending(false);
        await refreshBalance();
        await refreshProfile();
        return response;
      } catch (err) {
        finishedRef.current = false;
        setPending(false);
        setFinishError(err instanceof Error ? err.message : 'Failed to finish match');
        throw err;
      }
    },
    [defaultGame, refreshBalance, refreshProfile, user?.id],
  );

  const clearPending = useCallback(() => {
    setPending(false);
    setFinishError(null);
  }, []);

  return { finishMatch, pending, finishError, clearPending };
}
