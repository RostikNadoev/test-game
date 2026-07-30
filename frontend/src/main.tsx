import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';

const CHUNK_RELOAD_KEY = 'twingames_stale_chunk_reload';
const CHUNK_RELOAD_QUERY = '__app_refresh';

const getErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'message' in value
  ) {
    return String(
      (value as { message?: unknown }).message || '',
    );
  }

  return '';
};

const isStaleChunkError = (value: unknown) => {
  const message = getErrorMessage(value).toLowerCase();

  return (
    message.includes(
      'failed to fetch dynamically imported module',
    ) ||
    message.includes(
      'error loading dynamically imported module',
    ) ||
    message.includes(
      'importing a module script failed',
    ) ||
    message.includes(
      'failed to load module script',
    ) ||
    message.includes(
      'expected a javascript-or-wasm module script',
    ) ||
    message.includes(
      'mime type of "text/html"',
    )
  );
};

const reloadWithFreshAssets = () => {
  try {
    if (
      window.sessionStorage.getItem(
        CHUNK_RELOAD_KEY,
      ) === '1'
    ) {
      return;
    }

    window.sessionStorage.setItem(
      CHUNK_RELOAD_KEY,
      '1',
    );
  } catch {
    return;
  }

  const url = new URL(window.location.href);

  url.searchParams.set(
    CHUNK_RELOAD_QUERY,
    Date.now().toString(),
  );

  window.location.replace(url.toString());
};

const handleVitePreloadError = (event: Event) => {
  event.preventDefault();
  reloadWithFreshAssets();
};

const handleUnhandledRejection = (
  event: PromiseRejectionEvent,
) => {
  if (!isStaleChunkError(event.reason)) {
    return;
  }

  event.preventDefault();
  reloadWithFreshAssets();
};

const handleWindowError = (event: ErrorEvent) => {
  if (
    !isStaleChunkError(
      event.error || event.message,
    )
  ) {
    return;
  }

  event.preventDefault();
  reloadWithFreshAssets();
};

window.addEventListener(
  'vite:preloadError',
  handleVitePreloadError,
);

window.addEventListener(
  'unhandledrejection',
  handleUnhandledRejection,
);

window.addEventListener(
  'error',
  handleWindowError,
);

window.setTimeout(() => {
  try {
    window.sessionStorage.removeItem(
      CHUNK_RELOAD_KEY,
    );
  } catch {
    return;
  }
}, 12_000);

ReactDOM.createRoot(
  document.getElementById('root')!,
).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
