export type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  close?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  HapticFeedback?: {
    notificationOccurred?: (type: string) => void;
    impactOccurred?: (type: string) => void;
  };
};

export const getTelegramWebApp = () =>
  (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
