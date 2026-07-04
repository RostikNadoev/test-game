import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setApiToken, type ApiUser, type Balance } from '../api';

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

type AuthContextValue = {
  token: string | null;
  user: ApiUser | null;
  isLoading: boolean;
  error: string | null;
  isAuthorized: boolean;
  loginWithTelegram: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  exchangeTonToGame: (amount: number) => Promise<Balance>;
  logout: () => void;
};

const TOKEN_STORAGE_KEY = 'twingames_jwt_token';

const AuthContext = createContext<AuthContextValue | null>(null);

const getTelegramWebApp = () =>
  (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

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

  const loginWithTelegram = useCallback(async () => {
    const tg = getTelegramWebApp();

    tg?.ready?.();

    const initData = tg?.initData || '';

    console.log('RAW initData:', initData);

    console.log('[TG AUTH DEBUG]', {
      hasTelegram: Boolean((window as Window & { Telegram?: unknown }).Telegram),
      hasWebApp: Boolean(tg),
      initDataLength: initData.length,
      initDataPreview: initData.slice(0, 120),
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    });

    if (!initData) {
      throw new Error('Нет Telegram initData. Проверь, что приложение открыто именно как Telegram Mini App.');
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

  const refreshBalance = useCallback(async () => {
    const response = await api.users.balance();

    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      return {
        ...currentUser,
        balance_ton: response.balance.ton,
        balance_game: response.balance.game,
      };
    });
  }, []);

  const exchangeTonToGame = useCallback(async (amount: number) => {
    const response = await api.wallet.exchangeTonToGame(amount);

    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      return {
        ...currentUser,
        balance_ton: response.balance.ton,
        balance_game: response.balance.game,
      };
    });

    return response.balance;
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
      exchangeTonToGame,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};