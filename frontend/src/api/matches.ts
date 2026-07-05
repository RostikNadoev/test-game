import type { FinishMatchRequest, FinishMatchResponse } from './types';
import { apiRequest } from './client';

export const matchesApi = {
  finish(body: FinishMatchRequest) {
    return apiRequest<FinishMatchResponse>('/api/v1/matches/finish', {
      method: 'POST',
      body,
    });
  },
};
