type QueuedFrame = {
  callback: FrameRequestCallback;
  nativeID?: number;
};

let paused = false;
let nextQueuedID = -1;
const queuedFrames = new Map<number, QueuedFrame>();

const nativeRequestAnimationFrame =
  typeof window === 'undefined' ? undefined : window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame =
  typeof window === 'undefined' ? undefined : window.cancelAnimationFrame.bind(window);

const requestWhilePaused = (callback: FrameRequestCallback) => {
  const id = nextQueuedID--;
  queuedFrames.set(id, { callback });
  return id;
};

const cancelWhilePaused = (id: number) => {
  const queued = queuedFrames.get(id);
  if (queued) {
    if (queued.nativeID !== undefined) nativeCancelAnimationFrame?.(queued.nativeID);
    queuedFrames.delete(id);
    return;
  }
  nativeCancelAnimationFrame?.(id);
};

export const setGamePresencePaused = (shouldPause: boolean) => {
  if (typeof window === 'undefined' || paused === shouldPause) return;
  paused = shouldPause;
  document.documentElement.classList.toggle('game-presence-paused', paused);

  if (paused) {
    window.requestAnimationFrame = requestWhilePaused;
    window.cancelAnimationFrame = cancelWhilePaused;
    return;
  }

  if (nativeRequestAnimationFrame && nativeCancelAnimationFrame) {
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  }

  const pending = [...queuedFrames.entries()];
  pending.forEach(([id, frame]) => {
    if (!nativeRequestAnimationFrame) return;
    frame.nativeID = nativeRequestAnimationFrame((time) => {
      queuedFrames.delete(id);
      frame.callback(time);
    });
  });
};
