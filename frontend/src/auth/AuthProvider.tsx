import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  ApiError,
  normalizeBalance,
  setApiToken,
  setUnauthorizedHandler,
  type Balance,
  type ApiUser,
} from '../api';
import { AuthContext, type AuthContextValue } from './authContext';
import { waitForTelegramInitData } from './waitForTelegramInitData';

const TOKEN_STORAGE_KEY = 'twingames_jwt_token';

const toErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    setApiToken(savedToken);
    return savedToken;
  });

  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const balanceSyncPauseCountRef = useRef(0);

  const saveToken = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    setApiToken(nextToken);

    if (nextToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    saveToken(null);
    setUser(null);
  }, [saveToken]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      saveToken(null);
      setUser(null);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [saveToken]);

  const loginWithTelegram = useCallback(async () => {
    const initData = await waitForTelegramInitData();

    if (import.meta.env.DEV) {
      console.log('[TG AUTH DEBUG]', { initDataLength: initData.length });
    }

    const data = await api.auth.telegram(initData);

    if (!data.token || !data.user) {
      throw new Error('Backend не вернул token или user');
    }

    saveToken(data.token);
    setUser(data.user);
  }, [saveToken]);

  const refreshUser = useCallback(async () => {
    const response = await api.auth.me();
    setUser(response.user);
  }, []);

  const refreshProfile = useCallback(async () => {
    const response = await api.users.profile();
    setUser(response.user);
  }, []);

  const refreshBalanceNow = useCallback(async (force = false) => {
    const response = await api.users.balance();

    if (!force && balanceSyncPauseCountRef.current > 0) return;

    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      return {
        ...currentUser,
        balance_ton: response.balance.ton,
        balance_game: response.balance.game,
      };
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    if (balanceSyncPauseCountRef.current > 0) return;
    await refreshBalanceNow();
  }, [refreshBalanceNow]);

  const pauseBalanceSync = useCallback(() => {
    balanceSyncPauseCountRef.current += 1;
  }, []);

  const resumeBalanceSync = useCallback(async (refresh = false) => {
    balanceSyncPauseCountRef.current = Math.max(0, balanceSyncPauseCountRef.current - 1);
    if (refresh && balanceSyncPauseCountRef.current === 0) {
      await refreshBalanceNow(true);
    }
  }, [refreshBalanceNow]);

  useEffect(() => {
    if (!token) return;

    let requestInFlight = false;
    const syncBalance = async () => {
      if (requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      try {
        await refreshBalance();
      } catch {
        // The next focus/interval tick will retry without interrupting the game.
      } finally {
        requestInFlight = false;
      }
    };

    const interval = window.setInterval(() => {
      void syncBalance();
    }, 2500);
    const handleFocus = () => void syncBalance();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncBalance();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshBalance, token]);

  const exchangeTonToGame = useCallback(async (coins: number) => {
    const response = await api.wallet.exchangeTonToGame(coins);
    let nextBalance: Balance = { ton: 0, game: 0 };

    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      nextBalance = normalizeBalance(response, currentUser);

      return {
        ...currentUser,
        balance_ton: nextBalance.ton,
        balance_game: nextBalance.game,
      };
    });

    return nextBalance;
  }, []);

  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (token) {
          await refreshUser();
          return;
        }

        await loginWithTelegram();
      } catch (initialError) {
        if (token) {
          saveToken(null);

          try {
            await loginWithTelegram();
            return;
          } catch (telegramError) {
            if (!ignore) setError(toErrorMessage(telegramError));
            return;
          }
        }

        if (!ignore) setError(toErrorMessage(initialError));
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    void bootstrap();

    return () => {
      ignore = true;
    };
  }, [loginWithTelegram, refreshUser, saveToken, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      error,
      isAuthorized: Boolean(token && user),
      loginWithTelegram,
      refreshUser,
      refreshProfile,
      refreshBalance,
      pauseBalanceSync,
      resumeBalanceSync,
      exchangeTonToGame,
      logout,
    }),
    [
      token,
      user,
      isLoading,
      error,
      loginWithTelegram,
      refreshUser,
      refreshProfile,
      refreshBalance,
      pauseBalanceSync,
      resumeBalanceSync,
      exchangeTonToGame,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
