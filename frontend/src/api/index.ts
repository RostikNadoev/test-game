import { apiRequest } from './client';
import { authApi } from './auth';
import { lobbiesApi } from './lobbies';
import { usersApi } from './users';
import { walletApi } from './wallet';
import { matchesApi } from './matches';
import { leaderboardApi } from './leaderboard';
import { soloApi } from './solo';
import { turboApi } from './turbo';
import { presenceApi } from './presence';
import type { HealthResponse } from './types';

export * from './types';
export * from './client';
export * from './auth';
export * from './users';
export * from './wallet';
export * from './lobbies';
export * from './matches';
export * from './leaderboard';
export * from './solo';
export * from './turbo';
export * from './presence';
export { getOpponentInfo, resolvePlayersInfo } from './lobbyUtils';

export const api = {
  health() {
    return apiRequest<HealthResponse>('/health', { auth: false });
  },
  auth: authApi,
  users: usersApi,
  wallet: walletApi,
  lobbies: lobbiesApi,
  matches: matchesApi,
  leaderboard: leaderboardApi,
  solo: soloApi,
  turbo: turboApi,
  presence: presenceApi,
};
