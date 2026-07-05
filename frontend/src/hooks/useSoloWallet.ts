import { useCallback, useEffect, useState } from 'react';
import { soloApi } from '../api/solo';
import type { SoloStats } from '../api/types';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

const emptyStats: SoloStats = {
  total_spins: 0,
  total_wagered: 0,
  total_won: 0,
  biggest_win: 0,
  favorite_solo_game: 'none',
};

export function useSoloWallet() {
  const { user, refreshBalance, refreshProfile } = useAuth();
  const [soloStats, setSoloStats] = useState<SoloStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = user?.balance_game ?? 0;

  const refreshSoloStats = useCallback(async () => {
    try {
      const response = await soloApi.stats();
      setSoloStats(response.solo_stats);
    } catch {
      // keep previous stats
    }
  }, []);

  useEffect(() => {
    void refreshSoloStats();
  }, [refreshSoloStats]);

  const applySoloResponse = useCallback(
    async (response: { balance?: { game: number }; solo_stats?: SoloStats }) => {
      if (response.solo_stats) {
        setSoloStats(response.solo_stats);
      }
      await refreshBalance();
      await refreshProfile();
    },
    [refreshBalance, refreshProfile],
  );

  const spin = useCallback(
    async (game: string, betCoins: number, idempotencyKey?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await soloApi.spin(game, betCoins, idempotencyKey);
        await applySoloResponse(response);
        return response;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Solo spin failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applySoloResponse],
  );

  const canAfford = useCallback((bet: number) => balance + 1e-9 >= bet, [balance]);

  return {
    balance,
    soloStats,
    loading,
    error,
    spin,
    canAfford,
    refreshSoloStats,
    setError,
  };
}
