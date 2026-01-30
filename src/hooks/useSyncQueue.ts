import { useState, useEffect, useCallback } from "react";
import {
  getPendingCount,
  getRetryableActions,
  removeAction,
  markAttempted,
  pruneFailedActions,
} from "../services/storage/syncQueue";
import { getSettings } from "../services/storage";
import type { QueuedAction } from "../types";

interface SyncQueueState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncError: string | null;
}

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

  // Refresh pending count
  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setState((prev) => ({ ...prev, pendingCount: count }));
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
        body: JSON.stringify(action.payload),
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
      case "unsubscribe":
        return { url: `${baseUrl}/api/v1/subscriptions`, method: "DELETE" };
      case "updatePlayStatus":
        return { url: `${baseUrl}/api/v1/play`, method: "POST" };
      default:
        throw new Error(`Unknown action type: ${action.action}`);
    }
  };

  // Process all pending actions
  const processQueue = useCallback(async () => {
    const settings = await getSettings();

    // Skip if no sync server configured
    if (!settings.syncServerUrl || !settings.syncToken) {
      return;
    }

    setState((prev) => ({ ...prev, isSyncing: true, lastSyncError: null }));

    try {
      const actions = await getRetryableActions();

      for (const action of actions) {
        const success = await processAction(action);
        if (success && action.id) {
          await removeAction(action.id);
        }
      }

      // Prune actions that exceeded max attempts
      await pruneFailedActions();

      await refreshCount();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Sync failed";
      setState((prev) => ({ ...prev, lastSyncError: errorMessage }));
    } finally {
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [refreshCount]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      processQueue();
    };

    window.addEventListener("online", handleOnline);

    // Initial count
    refreshCount();

    // Process queue if already online
    if (navigator.onLine) {
      processQueue();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [processQueue, refreshCount]);

  return {
    pendingCount: state.pendingCount,
    isSyncing: state.isSyncing,
    lastSyncError: state.lastSyncError,
    processQueue,
    refreshCount,
  };
};
