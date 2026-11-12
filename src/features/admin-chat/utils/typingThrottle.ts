export const ADMIN_CHAT_TYPING_THROTTLE_MILLISECONDS = 1000;
export const ADMIN_CHAT_TYPING_INACTIVITY_MILLISECONDS = 3000;

/**
 * `setTimeout` hands back a `number` handle in browsers and a `Timeout` object in
 * Node, and the manual suite injects its own scheduler, so the pending-handle
 * type has to cover every timer implementation that can be plugged in.
 */
type TypingThrottleTimer = number | ReturnType<typeof setTimeout>;

export type TypingThrottleControllerOptions = {
  onTypingStart: () => void;
  onTypingStop: () => void;
  throttleMilliseconds?: number;
  inactivityMilliseconds?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => TypingThrottleTimer;
  cancel?: (timer: TypingThrottleTimer) => void;
};

export type TypingThrottleController = {
  update: (hasContent: boolean) => void;
  stop: () => void;
  dispose: () => void;
};

// Produces deterministic typing-start and typing-stop behavior.
// Timers are cleared during explicit stop and teardown.
export function createTypingThrottleController(
  options: TypingThrottleControllerOptions,
): TypingThrottleController {
  const throttleMilliseconds = Math.max(
    0,
    options.throttleMilliseconds ?? ADMIN_CHAT_TYPING_THROTTLE_MILLISECONDS,
  );
  const inactivityMilliseconds = Math.max(
    1,
    options.inactivityMilliseconds ?? ADMIN_CHAT_TYPING_INACTIVITY_MILLISECONDS,
  );
  const now = options.now ?? Date.now;
  const schedule: (callback: () => void, delay: number) => TypingThrottleTimer =
    options.schedule ?? setTimeout;
  const cancel: (timer: TypingThrottleTimer) => void =
    options.cancel ?? clearTimeout;

  let lastStartAt = Number.NEGATIVE_INFINITY;
  let inactivityTimer: TypingThrottleTimer | null = null;
  let typing = false;
  let disposed = false;

  function clearInactivityTimer() {
    if (inactivityTimer === null) return;
    cancel(inactivityTimer);
    inactivityTimer = null;
  }

  function stop() {
    clearInactivityTimer();
    if (typing === false) return;
    typing = false;
    options.onTypingStop();
  }

  function update(hasContent: boolean) {
    if (disposed) return;
    if (hasContent === false) {
      stop();
      return;
    }

    const currentTime = now();
    if (typing === false || currentTime - lastStartAt >= throttleMilliseconds) {
      typing = true;
      lastStartAt = currentTime;
      options.onTypingStart();
    }

    clearInactivityTimer();
    inactivityTimer = schedule(stop, inactivityMilliseconds);
  }

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
  }

  return { update, stop, dispose };
}
