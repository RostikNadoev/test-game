import { apiRequest } from './client';
import type {
  BalanceResponse,
  ExchangeTonToGameResponse,
  TopUpQuoteResponse,
} from './types';

export const walletApi = {
  topupQuote(coins: number) {
    return apiRequest<TopUpQuoteResponse>('/api/v1/wallet/topup-quote', {
      method: 'POST',
      body: { coins: Math.floor(coins) },
    });
  },

  exchangeTonToGame(coins: number) {
    return apiRequest<ExchangeTonToGameResponse>('/api/v1/wallet/exchange-ton-to-game', {
      method: 'POST',
      body: { coins: Math.floor(coins) },
    });
  },

  devAddTon(amount: number) {
    return apiRequest<BalanceResponse>('/api/v1/dev/add-ton', {
      method: 'POST',
      body: { amount },
    });
  },
};
