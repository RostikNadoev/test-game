import { apiRequest } from './client';
import type { AuthTelegramResponse, UserResponse } from './types';

export const authApi = {
  telegram(initData: string) {
    return apiRequest<AuthTelegramResponse>('/api/v1/auth/telegram', {
      method: 'POST',
      auth: false,
      body: { init_data: initData },
    });
  },

  me() {
    return apiRequest<UserResponse>('/api/v1/auth/me');
  },
};
