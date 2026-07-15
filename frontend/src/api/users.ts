import { apiRequest } from './client';
import type { BalanceResponse, StatsResponse, UserResponse } from './types';

export const usersApi = {
  profile() {
    return apiRequest<UserResponse>('/api/v1/users/profile');
  },

  balance() {
    return apiRequest<BalanceResponse>('/api/v1/users/balance');
  },

  stats() {
    return apiRequest<StatsResponse>('/api/v1/users/stats');
  },
};
