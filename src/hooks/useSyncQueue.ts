import { useState, useEffect, useCallback, useRef } from "react";
import {
  getPendingCount,
  pruneFailedActions,
  enforceQueueLimit,
} from "../services/storage/syncQueue";
import { processQueue, notifySyncComplete } from "../services/sync/queueProcessor";

interface SyncQueueState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncError: string | null;
}

/**
 * Hook to manage the offline sync queue.
 *
 * Processing is coordinated with the Service Worker via an IndexedDB-based
 * lock (see queueProcessor.ts). Only one processor runs at a time.
 *
 * The SW handles background sync (when the app is closed), while this hook
 * handles sync when the app is open and comes back online.
 *
 * Communication flow:
 * - App queues action → requestBackgroundSync() registers SW sync event
 * - SW processes queue → BroadcastChannel notifies app to refresh count
 * - App comes online → this hook processes queue (if SW didn't already)
 */
export const useSyncQueue = () => {
  const [state, setState] = useState<SyncQueueState>({
    pendingCount: 0,
    isSyncing: false,
    lastSyncError: null,
  });

  const isMounted = useRef(true);

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    if (isMounted.current) {
      setState((prev) => ({ ...prev, pendingCount: count }));
    }
  }, []);

  const processQueueFromApp = useCallback(async () => {
    if (isMounted.current) {
      setState((prev) => ({ ...prev, isSyncing: true, lastSyncError: null }));
    }

    try {
      const result = await processQueue("app");

      if (result >= 0) {
        notifySyncComplete(result);
      }
      // result === -1 means SW is already processing - that's fine

      await refreshCount();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Sync failed";
      if (isMounted.current) {
        setState((prev) => ({ ...prev, lastSyncError: errorMessage }));
      }
    } finally {
      if (isMounted.current) {
        setState((prev) => ({ ...prev, isSyncing: false }));
      }
    }
  }, [refreshCount]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, lastSyncError: null }));
  }, []);

  useEffect(() => {
    isMounted.current = true;

    // Listen for online events
    const handleOnline = () => {
      processQueueFromApp();
    };
    window.addEventListener("online", handleOnline);

    // Listen for BroadcastChannel messages from SW
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("balados-sync");
      channel.addEventListener("message", (event) => {
        if (event.data?.type === "sync-complete") {
          refreshCount();
        }
      });
    } catch {
      // BroadcastChannel not supported - SW sync will still work,
      // count will refresh on next user interaction
    }

    // Initial cleanup and processing
    const initQueue = async () => {
      await pruneFailedActions();
      await enforceQueueLimit();
      await refreshCount();

      if (navigator.onLine) {
        processQueueFromApp();
      }
    };

    initQueue();

    return () => {
      isMounted.current = false;
      window.removeEventListener("online", handleOnline);
      channel?.close();
    };
  }, [processQueueFromApp, refreshCount]);

  return {
    pendingCount: state.pendingCount,
    isSyncing: state.isSyncing,
    lastSyncError: state.lastSyncError,
    processQueue: processQueueFromApp,
    refreshCount,
    clearError,
  };
};
