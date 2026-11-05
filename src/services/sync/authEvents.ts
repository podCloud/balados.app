/**
 * Sync authentication state shared between the RSS proxy cascade (which runs
 * outside React) and the UI (`useSync`, `SyncSettings`).
 *
 * The "expired" flag is persisted in settings so it survives reloads and acts
 * as a circuit breaker: while set, `fetchWithProxy` does not call the server.
 */

import { db, getSettings, SETTINGS_ID } from "../storage";

type Listener = (expired: boolean) => void;

const listeners = new Set<Listener>();

const emit = (expired: boolean): void => {
  for (const listener of listeners) {
    listener(expired);
  }
};

/** Atomically patch the settings record (read-modify-write in one transaction). */
const patchSettings = (
  patch: (current: Awaited<ReturnType<typeof getSettings>>) => boolean,
): Promise<boolean> =>
  db.transaction("rw", db.settings, async () => {
    const current = await getSettings();
    const apply = patch(current);
    if (apply) {
      await db.settings.put({ id: SETTINGS_ID, ...current });
    }
    return apply;
  });

/**
 * The sync server rejected `failedToken` and a refresh was impossible.
 * Ignored when the stored token has already changed (the user reconnected
 * while the failing request was in flight), so a late 401 cannot poison a
 * fresh session.
 */
export const notifySyncAuthError = async (failedToken?: string): Promise<void> => {
  let flagged = false;
  try {
    flagged = await patchSettings((current) => {
      if (failedToken !== undefined && current.syncToken !== failedToken) return false;
      current.syncAuthExpired = true;
      return true;
    });
  } catch {
    flagged = true; // storage unavailable: still tell the UI
  }
  if (flagged) emit(true);
};

/** New credentials were saved (or cleared): the dead-token state is over. */
export const clearSyncAuthError = async (): Promise<void> => {
  try {
    await patchSettings((current) => {
      current.syncAuthExpired = false;
      return true;
    });
  } catch {
    // best effort, listeners are still told
  }
  emit(false);
};

/** Subscribe to sync auth state changes. Returns an unsubscribe function. */
export const subscribeSyncAuthError = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
