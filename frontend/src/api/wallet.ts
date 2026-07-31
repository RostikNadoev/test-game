import { apiRequest } from './client';
import type {
  BalanceResponse,
  CreateWithdrawalResponse,
  ExchangeTonToGameResponse,
  TopUpQuoteResponse,
  WithdrawalHistoryResponse,
} from './types';

export const walletApi = {
  createWithdrawal(gameAmount: number, walletAddress: string, idempotencyKey: string) {
    return apiRequest<CreateWithdrawalResponse>('/api/v1/wallet/withdrawals', {
      method: 'POST',
      body: {
        game_amount: Math.floor(gameAmount),
        wallet_address: walletAddress,
        idempotency_key: idempotencyKey,
      },
    });
  },

  withdrawalHistory(limit = 50) {
    return apiRequest<WithdrawalHistoryResponse>(`/api/v1/wallet/withdrawals?limit=${limit}`);
  },

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
