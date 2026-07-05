import type {
  SoloCashoutResponse,
  SoloGamesResponse,
  SoloHistoryResponse,
  SoloSessionStartResponse,
  SoloSessionStepResponse,
  SoloSpinResponse,
  SoloStatsResponse,
} from './types';
import { apiRequest } from './client';

export const soloApi = {
  games() {
    return apiRequest<SoloGamesResponse>('/api/v1/solo/games');
  },

  stats() {
    return apiRequest<SoloStatsResponse>('/api/v1/solo/stats');
  },

  history(game = '', limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (game) params.set('game', game);
    return apiRequest<SoloHistoryResponse>(`/api/v1/solo/history?${params.toString()}`);
  },

  spin(game: string, betCoins: number, idempotencyKey?: string) {
    return apiRequest<SoloSpinResponse>('/api/v1/solo/spin', {
      method: 'POST',
      body: {
        game,
        bet_coins: betCoins,
        idempotency_key: idempotencyKey,
      },
    });
  },

  startSession(game: string, betCoins: number) {
    return apiRequest<SoloSessionStartResponse>('/api/v1/solo/sessions', {
      method: 'POST',
      body: { game, bet_coins: betCoins },
    });
  },

  sessionStep(sessionId: string, action: string, payload: Record<string, unknown> = {}) {
    return apiRequest<SoloSessionStepResponse>(`/api/v1/solo/sessions/${sessionId}/step`, {
      method: 'POST',
      body: { action, payload },
    });
  },

  cashout(sessionId: string) {
    return apiRequest<SoloCashoutResponse>(`/api/v1/solo/sessions/${sessionId}/cashout`, {
      method: 'POST',
      body: {},
    });
  },

  activeSession(game: string) {
    const params = new URLSearchParams({ game });
    return apiRequest<SoloSessionStartResponse>(`/api/v1/solo/sessions/active?${params.toString()}`);
  },

  abandonSession(sessionId: string) {
    return apiRequest<SoloSessionStepResponse>(`/api/v1/solo/sessions/${sessionId}/abandon`, {
      method: 'POST',
      body: {},
    });
  },
};
