import { createContext } from 'react';
import type { ApiUser, Balance } from '../api';

export type AuthContextValue = {
  token: string | null;
  user: ApiUser | null;
  isLoading: boolean;
  error: string | null;
  isAuthorized: boolean;
  loginWithTelegram: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  exchangeTonToGame: (coins: number) => Promise<Balance>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
