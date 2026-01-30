import { useState, useEffect, useCallback, useRef } from "react";
import {
  getPendingCount,
  getRetryableActions,
  removeAction,
  markAttempted,
  pruneFailedActions,
  enforceQueueLimit,
} from "../services/storage/syncQueue";
import { getSettings } from "../services/storage";
import type { QueuedAction } from "../types";

interface SyncQueueState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncError: string | null;
}

// Global lock to prevent concurrent queue processing across instances
let isProcessing = false;

/**
 * Hook to manage the offline sync queue
 * Automatically processes queue when coming back online
 */
export const useSyncQueue = () => {
  const [state, setState] = useState<SyncQueueState>({
    pendingCount: 0,
    isSyncing: false,
    lastSyncError: null,
  });

  const isMounted = useRef(true);

  // Refresh pending count
  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    if (isMounted.current) {
      setState((prev) => ({ ...prev, pendingCount: count }));
    }
  }, []);

  // Process a single action
  const processAction = async (action: QueuedAction): Promise<boolean> => {
    const settings = await getSettings();

    // If no sync server configured, we can't process
    if (!settings.syncServerUrl || !settings.syncToken) {
      return false;
    }

    try {
      const endpoint = getEndpointForAction(action, settings.syncServerUrl);
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.syncToken}`,
        },
        body: endpoint.method !== "DELETE" ? JSON.stringify(action.payload) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (action.id) {
        await markAttempted(action.id, errorMessage);
      }
      return false;
    }
  };

  // Get the API endpoint for an action
  const getEndpointForAction = (
    action: QueuedAction,
    baseUrl: string
  ): { url: string; method: string } => {
    switch (action.action) {
      case "subscribe":
        return { url: `${baseUrl}/api/v1/subscriptions`, method: "POST" };
      case "unsubscribe": {
        // Use the correct endpoint with encoded feed URL
        const feedId = btoa(action.payload.feedUrl);
        return {
          url: `${baseUrl}/api/v1/subscriptions/${encodeURIComponent(feedId)}`,
          method: "DELETE",
        };
      }
      case "updatePlayStatus":
        return { url: `${baseUrl}/api/v1/play`, method: "POST" };
    }
  };

  // Process all pending actions with global lock
  const processQueue = useCallback(async () => {
    // Prevent concurrent processing (race condition fix)
    if (isProcessing) {
      return;
    }

    const settings = await getSettings();

    // Skip if no sync server configured
    if (!settings.syncServerUrl || !settings.syncToken) {
      return;
    }

    isProcessing = true;
    if (isMounted.current) {
      setState((prev) => ({ ...prev, isSyncing: true, lastSyncError: null }));
    }

    try {
      const actions = await getRetryableActions();

      for (const action of actions) {
        // Check if still mounted before each action
        if (!isMounted.current) break;

        const success = await processAction(action);
        if (success && action.id) {
          await removeAction(action.id);
        }
      }

      // Prune actions that exceeded max attempts
      await pruneFailedActions();

      // Enforce queue size limit
      await enforceQueueLimit();

      await refreshCount();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Sync failed";
      if (isMounted.current) {
        setState((prev) => ({ ...prev, lastSyncError: errorMessage }));
      }
    } finally {
      isProcessing = false;
      if (isMounted.current) {
        setState((prev) => ({ ...prev, isSyncing: false }));
      }
    }
  }, [refreshCount]);

  // Clear the last sync error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, lastSyncError: null }));
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    isMounted.current = true;

    const handleOnline = () => {
      processQueue();
    };

    window.addEventListener("online", handleOnline);

    // Initial cleanup: prune failed actions and enforce limits
    const initQueue = async () => {
      await pruneFailedActions();
      await enforceQueueLimit();
      await refreshCount();

      // Process queue if already online
      if (navigator.onLine) {
        processQueue();
      }
    };

    initQueue();

    return () => {
      isMounted.current = false;
      window.removeEventListener("online", handleOnline);
    };
  }, [processQueue, refreshCount]);

  return {
    pendingCount: state.pendingCount,
    isSyncing: state.isSyncing,
    lastSyncError: state.lastSyncError,
    processQueue,
    refreshCount,
    clearError,
  };
};
