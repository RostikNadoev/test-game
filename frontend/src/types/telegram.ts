export type TelegramSafeAreaInset = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  close?: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  HapticFeedback?: {
    notificationOccurred?: (type: string) => void;
    impactOccurred?: (type: string) => void;
  };
};

export const getTelegramWebApp = () =>
  (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

export function applyTelegramViewportMetrics(): void {
  const tg = getTelegramWebApp();
  const root = document.documentElement;

  if (!tg) {
    root.style.setProperty('--app-viewport-height', '100dvh');
    return;
  }

  const top = tg.contentSafeAreaInset?.top ?? tg.safeAreaInset?.top ?? 0;
  const bottom = tg.contentSafeAreaInset?.bottom ?? tg.safeAreaInset?.bottom ?? 0;
  const left = tg.contentSafeAreaInset?.left ?? tg.safeAreaInset?.left ?? 0;
  const right = tg.contentSafeAreaInset?.right ?? tg.safeAreaInset?.right ?? 0;

  const viewportHeight =
    tg.viewportStableHeight ??
    tg.viewportHeight ??
    window.innerHeight ??
    window.visualViewport?.height ??
    0;

  root.style.setProperty('--telegram-top-offset', `${top}px`);
  root.style.setProperty('--telegram-bottom-offset', `${bottom}px`);
  root.style.setProperty('--telegram-left-offset', `${left}px`);
  root.style.setProperty('--telegram-right-offset', `${right}px`);

  if (viewportHeight > 0) {
    root.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
  } else {
    root.style.setProperty('--app-viewport-height', '100dvh');
  }
}

/** @deprecated use applyTelegramViewportMetrics */
export function applyTelegramSafeAreaInsets(): void {
  applyTelegramViewportMetrics();
}
