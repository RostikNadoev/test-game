import { applyTelegramViewportMetrics, getTelegramWebApp } from '../types/telegram';

const INIT_DATA_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 50;

export async function waitForTelegramInitData(): Promise<string> {
  const tg = getTelegramWebApp();
  tg?.ready?.();
  tg?.expand?.();
  applyTelegramViewportMetrics();

  const existing = tg?.initData?.trim();
  if (existing) return existing;

  if (import.meta.env.DEV && import.meta.env.VITE_DEV_INIT_DATA) {
    return import.meta.env.VITE_DEV_INIT_DATA;
  }

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + INIT_DATA_TIMEOUT_MS;

    const poll = () => {
      const webApp = getTelegramWebApp();
      const initData = webApp?.initData?.trim() || '';

      if (initData) {
        resolve(initData);
        return;
      }

      if (Date.now() >= deadline) {
        reject(
          new Error(
            'Нет Telegram initData. Открой приложение через бота @twingames_bot.',
          ),
        );
        return;
      }

      window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  });
}
