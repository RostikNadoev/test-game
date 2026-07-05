import { useCallback, useRef } from 'react';
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

export function useLobbyMatchFinish(defaultGame = '') {
  const { user, refreshBalance, refreshProfile } = useAuth();
  const finishedRef = useRef(false);

  const finishMatch = useCallback(
    async (outcome: 'win' | 'loss' | 'draw', gameCode = defaultGame) => {
      const lobbyId = readActiveLobbyId();
      const game = gameCode || readActiveGameCode(defaultGame);

      if (!lobbyId || !game || finishedRef.current) return;
      if (game === 'blackjack_duel') return;

      finishedRef.current = true;

      const winnerUserId = resolveWinnerUserId(user?.id, outcome);

      try {
        await matchesApi.finish({
          lobby_id: lobbyId,
          game,
          winner_user_id: winnerUserId,
        });
        await refreshBalance();
        await refreshProfile();
      } catch {
        finishedRef.current = false;
      }
    },
    [defaultGame, refreshBalance, refreshProfile, user?.id],
  );

  return finishMatch;
}
