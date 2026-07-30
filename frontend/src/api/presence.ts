import { apiRequest } from './client';
import type { OnlinePresenceResponse } from './types';

export const presenceApi = {
  heartbeat(signal?: AbortSignal) {
    return apiRequest<OnlinePresenceResponse>('/api/v1/presence/heartbeat', {
      method: 'POST',
      signal,
    });
  },
};
