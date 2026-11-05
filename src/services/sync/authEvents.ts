/**
 * Sync authentication state shared between the RSS proxy cascade (which runs
 * outside React) and the UI (`useSync`, `SyncSettings`).
 *
 * The "expired" flag is persisted in settings so it survives reloads and acts
 * as a circuit breaker: while set, `fetchWithProxy` does not call the server.
 */

import { saveSettings } from "../storage";

type Listener = (expired: boolean) => void;

const listeners = new Set<Listener>();

const emit = (expired: boolean): void => {
  for (const listener of listeners) {
    listener(expired);
  }
};

/** The sync server rejected our token and a refresh was impossible. */
export const notifySyncAuthError = (): void => {
  emit(true);
  void saveSettings({ syncAuthExpired: true }).catch(() => {
    // Settings unavailable: listeners were still told, the flag is best effort.
  });
};

/** New credentials were saved: the session is valid again. */
export const clearSyncAuthError = (): void => {
  emit(false);
  void saveSettings({ syncAuthExpired: false }).catch(() => {
    // Same best-effort semantics as above.
  });
};

/** Subscribe to sync auth state changes. Returns an unsubscribe function. */
export const subscribeSyncAuthError = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
