/**
 * Background Sync registration helpers.
 *
 * Provides functions to:
 * - Register one-shot background sync (when actions are queued)
 * - Register periodic sync (on app startup)
 * - Check browser support for Background Sync APIs
 *
 * @see docs/BACKGROUND_SYNC.md for browser support details
 */

const SYNC_TAG = "balados-sync-queue";
const PERIODIC_SYNC_TAG = "balados-periodic-sync";
const PERIODIC_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes

/**
 * Check if the Background Sync API is supported.
 */
export function isBackgroundSyncSupported(): boolean {
  return "serviceWorker" in navigator && "SyncManager" in window;
}

/**
 * Check if Periodic Background Sync is supported.
 */
export function isPeriodicSyncSupported(): boolean {
  return "serviceWorker" in navigator && "PeriodicSyncManager" in window;
}

/**
 * Get the active SW registration, or null if not available.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Register a one-shot background sync event.
 * Call this after queuing an action so the SW processes it
 * even if the app is closed before connectivity returns.
 *
 * Gracefully degrades: if Background Sync is not supported,
 * this is a no-op (the useSyncQueue online listener handles it).
 */
export async function requestBackgroundSync(): Promise<void> {
  if (!isBackgroundSyncSupported()) return;

  const registration = await getRegistration();
  if (!registration) return;

  try {
    await (registration as ServiceWorkerRegistration).sync.register(SYNC_TAG);
  } catch {
    // Browser denied sync registration - fallback to online listener
  }
}

/**
 * Register periodic background sync.
 * Should be called once on app startup when sync is configured.
 *
 * Periodic sync requires browser permission and is only supported
 * in Chromium-based browsers. The browser may adjust the interval.
 */
export async function registerPeriodicSync(): Promise<void> {
  if (!isPeriodicSyncSupported()) return;

  const registration = await getRegistration();
  if (!registration) return;

  try {
    // Check if permission is granted
    const status = await navigator.permissions.query({
      name: "periodic-background-sync" as PermissionName,
    });
    if (status.state !== "granted") return;

    await (registration as ServiceWorkerRegistration).periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: PERIODIC_SYNC_INTERVAL,
    });
  } catch {
    // Periodic sync not supported or denied - fallback to app-level sync
  }
}

/**
 * Unregister periodic background sync.
 * Call when user disconnects from sync server.
 */
export async function unregisterPeriodicSync(): Promise<void> {
  if (!isPeriodicSyncSupported()) return;

  const registration = await getRegistration();
  if (!registration) return;

  try {
    await (registration as ServiceWorkerRegistration).periodicSync.unregister(PERIODIC_SYNC_TAG);
  } catch {
    // Ignore unregister errors
  }
}
