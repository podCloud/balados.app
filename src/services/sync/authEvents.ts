/**
 * Minimal event channel for sync authentication failures.
 *
 * `fetchWithProxy` runs outside React (TanStack Query, loops) and cannot reach
 * the `useSync` state directly; it notifies here and `useSync` subscribes.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Signal that the sync server rejected our token and a refresh failed. */
export const notifySyncAuthError = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

/** Subscribe to sync auth errors. Returns an unsubscribe function. */
export const subscribeSyncAuthError = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
