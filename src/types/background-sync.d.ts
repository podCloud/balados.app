/**
 * Type declarations for the Background Sync API and Periodic Background Sync API.
 * These APIs are not yet in the standard TypeScript DOM types.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
 */

interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager;
  readonly periodicSync: PeriodicSyncManager;
}

interface ServiceWorkerGlobalScopeEventMap {
  sync: SyncEvent;
  periodicsync: PeriodicSyncEvent;
}

interface Window {
  SyncManager: typeof SyncManager;
  PeriodicSyncManager: typeof PeriodicSyncManager;
}
