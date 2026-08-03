import { apiRequest } from './client';
import type { ReferralCheckResponse, ReferralStatus } from './types';

export const referralsApi = {
  status() {
    return apiRequest<ReferralStatus>('/api/v1/referrals/me');
  },

  check() {
    return apiRequest<ReferralCheckResponse>('/api/v1/referrals/check', {
      method: 'POST',
    });
  },
};
