import { useCallback, useState } from 'react';
import { soloApi } from '../api/solo';
import type { SoloSessionStepResponse } from '../api/types';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

export function useSoloSession(game: string) {
  const { refreshBalance, refreshProfile } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [multiplier, setMultiplier] = useState(1);
  const [openedSteps, setOpenedSteps] = useState(0);
  const [betCoins, setBetCoins] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<unknown>(null);
  const [payoutCoins, setPayoutCoins] = useState(0);

  const applyResponse = useCallback(
    async (response: SoloSessionStepResponse) => {
      setSessionId(response.session_id);
      setStatus(response.status);
      setMultiplier(response.multiplier);
      setOpenedSteps(response.opened_steps);
      setBetCoins(response.bet_coins);
      if (response.event) setLastEvent(response.event);
      if (typeof response.payout_coins === 'number') setPayoutCoins(response.payout_coins);
      await refreshBalance();
      await refreshProfile();
      return response;
    },
    [refreshBalance, refreshProfile],
  );

  const start = useCallback(
    async (bet: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await soloApi.startSession(game, bet);
        await applyResponse(response);
        return response;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to start session';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyResponse, game],
  );

  const step = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!sessionId) throw new Error('No active session');
      setLoading(true);
      setError(null);
      try {
        const response = await soloApi.sessionStep(sessionId, action, payload);
        await applyResponse(response);
        return response;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Session step failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyResponse, sessionId],
  );

  const cashout = useCallback(async () => {
    if (!sessionId) throw new Error('No active session');
    setLoading(true);
    setError(null);
    try {
      const response = await soloApi.cashout(sessionId);
      await applyResponse(response);
      return response;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Cashout failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyResponse, sessionId]);

  const reset = useCallback(() => {
    setSessionId('');
    setStatus('idle');
    setMultiplier(1);
    setOpenedSteps(0);
    setBetCoins(0);
    setLastEvent(null);
    setPayoutCoins(0);
    setError(null);
  }, []);

  return {
    sessionId,
    status,
    multiplier,
    openedSteps,
    betCoins,
    loading,
    error,
    lastEvent,
    payoutCoins,
    start,
    step,
    cashout,
    reset,
    setError,
  };
}
