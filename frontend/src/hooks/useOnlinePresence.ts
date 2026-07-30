import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/useAuth';
import { useIntervalWhenVisible } from './useIntervalWhenVisible';

export const useOnlinePresence = () => {
  const { isAuthorized } = useAuth();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  const heartbeat = useCallback(async () => {
    if (!isAuthorized) {
      setOnlineCount(null);
      return;
    }

    try {
      const response = await api.presence.heartbeat();
      setOnlineCount(response.online);
    } catch {
      // Keep the last confirmed count and retry on the next heartbeat.
    }
  }, [isAuthorized]);

  useIntervalWhenVisible(() => {
    void heartbeat();
  }, 15_000);

  useEffect(() => {
    void heartbeat();
  }, [heartbeat]);

  return onlineCount;
};
