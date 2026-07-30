import { apiRequest } from './client';
import type { TurboStatus } from './types';

export const turboApi = {
  join() {
    return apiRequest<TurboStatus>('/api/v1/turbo/queue', { method: 'POST' });
  },
  status() {
    return apiRequest<TurboStatus>('/api/v1/turbo/status');
  },
  cancel() {
    return apiRequest<TurboStatus>('/api/v1/turbo/queue', { method: 'DELETE' });
  },
};
