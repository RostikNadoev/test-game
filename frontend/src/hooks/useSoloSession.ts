import { useCallback, useEffect, useState } from 'react';
import { soloApi } from '../api/solo';
import type { SoloSessionPublicState, SoloSessionStepResponse } from '../api/types';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { needsSessionHydration } from '../utils/soloSessionState';

export function useSoloSession(game: string) {
  const { refreshBalance } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [multiplier, setMultiplier] = useState(1);
  const [openedSteps, setOpenedSteps] = useState(0);
  const [betCoins, setBetCoins] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<unknown>(null);
  const [payoutCoins, setPayoutCoins] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [publicState, setPublicState] = useState<SoloSessionPublicState | null>(null);
  const [publicStateHydrated, setPublicStateHydrated] = useState(false);

  const markPublicStateHydrated = useCallback(() => {
    setPublicStateHydrated(true);
  }, []);

  const requiresHydration = needsSessionHydration(resumed, status, publicState);
  const isSessionPlayable = status !== 'active' || !requiresHydration || publicStateHydrated;

  const applyResponse = useCallback(
    async (response: SoloSessionStepResponse) => {
      setSessionId(response.session_id);
      setStatus(response.status);
      setMultiplier(response.multiplier);
      setOpenedSteps(response.opened_steps);
      setBetCoins(response.bet_coins);
      setPublicState(response.public_state ?? null);
      if (response.event) setLastEvent(response.event);
      if (typeof response.payout_coins === 'number') setPayoutCoins(response.payout_coins);
      await refreshBalance();
      return response;
    },
    [refreshBalance],
  );

  const resumeActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await soloApi.activeSession(game);
      await applyResponse(response);
      setResumed(true);
      setPublicStateHydrated(false);
      return response;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      const message = err instanceof ApiError ? err.message : 'Failed to resume session';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyResponse, game]);

  useEffect(() => {
    void resumeActive().catch(() => {
      // keep idle state when no active session exists
    });
  }, [resumeActive]);

  const start = useCallback(
    async (bet: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await soloApi.startSession(game, bet);
        await applyResponse(response);
        setResumed(false);
        setPublicStateHydrated(true);
        return response;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const resumedSession = await resumeActive();
          if (resumedSession) {
            return resumedSession;
          }
        }
        const message = err instanceof ApiError ? err.message : 'Failed to start session';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyResponse, game, resumeActive],
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
    setPublicState(null);
    setError(null);
    setResumed(false);
    setPublicStateHydrated(false);
  }, []);

  const abandon = useCallback(async () => {
    if (!sessionId) throw new Error('No active session');
    setLoading(true);
    setError(null);
    try {
      const response = await soloApi.abandonSession(sessionId);
      await applyResponse(response);
      reset();
      return response;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Abandon failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applyResponse, reset, sessionId]);

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
    resumed,
    publicState,
    requiresHydration,
    isSessionPlayable,
    markPublicStateHydrated,
    start,
    step,
    cashout,
    abandon,
    resumeActive,
    reset,
    setError,
  };
}
