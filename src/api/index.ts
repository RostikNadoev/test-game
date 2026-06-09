import { apiRequest } from './client';
import { authApi } from './auth';
import { lobbiesApi } from './lobbies';
import { usersApi } from './users';
import { walletApi } from './wallet';
import type { HealthResponse } from './types';

export * from './types';
export * from './client';
export * from './auth';
export * from './users';
export * from './wallet';
export * from './lobbies';

export const api = {
  health() {
    return apiRequest<HealthResponse>('/health', { auth: false });
  },
  auth: authApi,
  users: usersApi,
  wallet: walletApi,
  lobbies: lobbiesApi,
};
