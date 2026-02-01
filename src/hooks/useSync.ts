import { useState, useEffect, useCallback, useRef } from "react";
import { SyncClient } from "../services/sync/client";
import { getSettings, saveSettings, db } from "../services/storage";
import { getSubscriptions } from "../services/storage/subscriptions";
import { useSyncQueue } from "./useSyncQueue";
import {
  mergeSubscriptions,
  mergePlayStatuses,
  subscriptionsToSync,
  playStatusesToSync,
} from "../services/sync/merger";
import type { Subscription, PlayStatus } from "../types";

export type SyncStatus =
  | "disconnected"
  | "connected"
  | "syncing"
  | "pending"
  | "error";

export interface UseSyncReturn {
  /** Current sync status */
  status: SyncStatus;
  /** Connected server URL */
  serverUrl: string | null;
  /** Last successful sync timestamp */
  lastSyncAt: Date | null;
  /** Number of pending actions in queue */
  pendingCount: number;
  /** Current error message */
  error: string | null;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;

  /** Connect to a sync server with token */
  connect: (serverUrl: string, token: string) => Promise<boolean>;
  /** Disconnect from current server */
  disconnect: () => Promise<void>;
  /** Trigger a full sync */
  sync: () => Promise<void>;
  /** Clear current error */
  clearError: () => void;
}

interface SyncState {
  status: SyncStatus;
  serverUrl: string | null;
  lastSyncAt: Date | null;
  error: string | null;
  isSyncing: boolean;
}

/**
 * React hook for sync state management
 *
 * Provides:
 * - Reactive sync status
 * - Connection management
 * - Manual sync trigger with bidirectional merge
 * - Pending action count from syncQueue
 * - Error handling
 */
export function useSync(): UseSyncReturn {
  const [state, setState] = useState<SyncState>({
    status: "disconnected",
    serverUrl: null,
    lastSyncAt: null,
    error: null,
    isSyncing: false,
  });

  const { pendingCount, processQueue, refreshCount } = useSyncQueue();
  const isMounted = useRef(true);
  const clientRef = useRef<SyncClient | null>(null);

  // Load initial state from settings
  useEffect(() => {
    isMounted.current = true;

    const loadState = async () => {
      if (!isMounted.current) return;

      const settings = await getSettings();
      if (!isMounted.current) return;

      if (settings.syncServerUrl && settings.syncToken) {
        // Create client and test connection
        const client = new SyncClient(
          settings.syncServerUrl,
          settings.syncToken
        );
        clientRef.current = client;

        if (!isMounted.current) return;

        const isConnected = await client.testConnection();

        if (isMounted.current) {
          setState({
            status: isConnected ? "connected" : "error",
            serverUrl: settings.syncServerUrl,
            lastSyncAt: settings.lastSyncAt
              ? new Date(settings.lastSyncAt)
              : null,
            error: isConnected ? null : "Connection test failed",
            isSyncing: false,
          });
        }
      }
    };

    loadState();

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Update status based on pending count
  useEffect(() => {
    if (state.status === "connected" && pendingCount > 0 && !state.isSyncing) {
      setState((prev) => ({ ...prev, status: "pending" }));
    } else if (
      state.status === "pending" &&
      pendingCount === 0 &&
      !state.isSyncing
    ) {
      setState((prev) => ({ ...prev, status: "connected" }));
    }
  }, [pendingCount, state.status, state.isSyncing]);

  /**
   * Connect to a sync server
   */
  const connect = useCallback(
    async (serverUrl: string, token: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isSyncing: true, error: null }));

      try {
        // Normalize URL
        let url = serverUrl.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = `https://${url}`;
        }
        url = url.replace(/\/$/, "");

        // Create client and test connection
        const client = new SyncClient(url, token);
        const isConnected = await client.testConnection();

        if (!isConnected) {
          if (isMounted.current) {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: "Server unreachable or invalid token",
              isSyncing: false,
            }));
          }
          return false;
        }

        // Save credentials
        await client.saveCredentials();
        clientRef.current = client;

        if (isMounted.current) {
          setState({
            status: "connected",
            serverUrl: url,
            lastSyncAt: null,
            error: null,
            isSyncing: false,
          });
        }

        // Trigger initial sync
        await refreshCount();

        return true;
      } catch (error) {
        if (isMounted.current) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error:
              error instanceof Error ? error.message : "Connection failed",
            isSyncing: false,
          }));
        }
        return false;
      }
    },
    [refreshCount]
  );

  /**
   * Disconnect from current server
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (clientRef.current) {
      await clientRef.current.clearCredentials();
      clientRef.current = null;
    }

    await saveSettings({ lastSyncAt: undefined });

    if (isMounted.current) {
      setState({
        status: "disconnected",
        serverUrl: null,
        lastSyncAt: null,
        error: null,
        isSyncing: false,
      });
    }
  }, []);

  /**
   * Perform a full bidirectional sync
   */
  const sync = useCallback(async (): Promise<void> => {
    if (!clientRef.current) {
      // Try to create client from settings
      const client = await SyncClient.fromSettings();
      if (!client) {
        setState((prev) => ({
          ...prev,
          error: "No sync server configured",
        }));
        return;
      }
      clientRef.current = client;
    }

    setState((prev) => ({
      ...prev,
      status: "syncing",
      isSyncing: true,
      error: null,
    }));

    try {
      // 1. First, process the queue to push pending changes
      await processQueue();

      // 2. Get current local data
      const localSubscriptions = await getSubscriptions();
      const localPlayStatuses = await db.playStatuses.toArray();

      // 3. Get settings for lastSyncAt
      const settings = await getSettings();
      const since = settings.lastSyncAt
        ? new Date(settings.lastSyncAt).toISOString()
        : undefined;

      // 4. Perform sync with server
      const response = await clientRef.current.sync({
        since,
        subscriptions: subscriptionsToSync(localSubscriptions),
        play_statuses: playStatusesToSync(localPlayStatuses),
      });

      // 5. Merge remote data with local
      const subscriptionResult = mergeSubscriptions(
        localSubscriptions,
        response.subscriptions
      );

      const playStatusResult = mergePlayStatuses(
        localPlayStatuses,
        response.play_statuses
      );

      // 6. Apply merged subscriptions
      await applySubscriptionChanges(localSubscriptions, subscriptionResult.merged);

      // 7. Apply merged play statuses
      await applyPlayStatusChanges(localPlayStatuses, playStatusResult.merged);

      // 8. Update lastSyncAt
      const syncTime = new Date(response.synced_at).getTime();
      await saveSettings({ lastSyncAt: syncTime });

      // 9. Refresh pending count
      await refreshCount();

      if (isMounted.current) {
        const newPendingCount = await db.syncQueue.count();
        setState({
          status: newPendingCount > 0 ? "pending" : "connected",
          serverUrl: state.serverUrl,
          lastSyncAt: new Date(syncTime),
          error: null,
          isSyncing: false,
        });
      }
    } catch (error) {
      if (isMounted.current) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Sync failed",
          isSyncing: false,
        }));
      }
    }
  }, [processQueue, refreshCount, state.serverUrl]);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
      status: prev.serverUrl ? "connected" : "disconnected",
    }));
  }, []);

  return {
    status: state.status,
    serverUrl: state.serverUrl,
    lastSyncAt: state.lastSyncAt,
    pendingCount,
    error: state.error,
    isSyncing: state.isSyncing,
    connect,
    disconnect,
    sync,
    clearError,
  };
}

/**
 * Apply subscription changes to local database
 */
async function applySubscriptionChanges(
  current: Subscription[],
  merged: Subscription[]
): Promise<void> {
  const currentUrls = new Set(current.map((s) => s.url));
  const mergedUrls = new Set(merged.map((s) => s.url));

  // Add new subscriptions
  for (const sub of merged) {
    if (!currentUrls.has(sub.url)) {
      await db.subscriptions.put(sub);
    }
  }

  // Remove subscriptions that are no longer in merged
  for (const url of currentUrls) {
    if (!mergedUrls.has(url)) {
      await db.subscriptions.delete(url);
    }
  }

  // Update existing subscriptions with newer timestamps
  for (const sub of merged) {
    if (currentUrls.has(sub.url)) {
      const existing = current.find((s) => s.url === sub.url);
      if (existing && sub.addedAt !== existing.addedAt) {
        await db.subscriptions.update(sub.url, { addedAt: sub.addedAt });
      }
    }
  }
}

/**
 * Apply play status changes to local database
 */
async function applyPlayStatusChanges(
  current: PlayStatus[],
  merged: PlayStatus[]
): Promise<void> {
  const currentIds = new Set(current.map((s) => s.episodeId));

  // Add new play statuses
  for (const status of merged) {
    if (!currentIds.has(status.episodeId)) {
      await db.playStatuses.put(status);
    }
  }

  // Update existing play statuses if changed
  for (const status of merged) {
    if (currentIds.has(status.episodeId)) {
      const existing = current.find((s) => s.episodeId === status.episodeId);
      if (
        existing &&
        (status.position !== existing.position ||
          status.completed !== existing.completed ||
          status.updatedAt !== existing.updatedAt)
      ) {
        await db.playStatuses.put(status);
      }
    }
  }

  // Note: We don't delete play statuses that aren't in merged
  // because local history should be preserved
}

export default useSync;
