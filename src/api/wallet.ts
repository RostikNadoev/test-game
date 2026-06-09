import { apiRequest } from './client';
import type { BalanceResponse, ExchangeTonToGameResponse } from './types';

export const walletApi = {
  exchangeTonToGame(amount: number) {
    return apiRequest<ExchangeTonToGameResponse>('/api/v1/wallet/exchange-ton-to-game', {
      method: 'POST',
      body: { amount },
    });
  },

  devAddTon(amount: number) {
    return apiRequest<BalanceResponse>('/api/v1/dev/add-ton', {
      method: 'POST',
      body: { amount },
    });
  },
};
