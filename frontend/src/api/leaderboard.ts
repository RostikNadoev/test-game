import type { LeaderboardResponse } from './types';
import { apiRequest } from './client';

export const leaderboardApi = {
  list(limit = 50) {
    return apiRequest<LeaderboardResponse>(`/api/v1/leaderboard?limit=${limit}`);
  },
};
