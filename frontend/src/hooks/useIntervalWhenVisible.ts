import { useEffect, useRef } from 'react';

export function useIntervalWhenVisible(callback: () => void, delayMs: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;

    let intervalId: number | null = null;

    const start = () => {
      if (intervalId !== null) return;
      savedCallback.current();
      intervalId = window.setInterval(() => {
        savedCallback.current();
      }, delayMs);
    };

    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [delayMs]);
}
