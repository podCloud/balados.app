/**
 * Shared sync queue processor.
 *
 * This module contains the pure processing logic for the sync queue.
 * It is imported by both the Service Worker (background sync) and
 * the React hook (useSyncQueue) to avoid code duplication.
 *
 * IMPORTANT: This module must NOT import React, DOM APIs, or anything
 * that requires a browser window context, since it runs in the SW too.
 */

import type { AppSettings, QueuedAction } from "../../types";
import { encodeRssFeed } from "../../utils/rssEncoding";
import { db, getSettings } from "../storage";
import {
  enforceQueueLimit,
  getRetryableActions,
  markAttempted,
  pruneFailedActions,
  removeAction,
} from "../storage/syncQueue";

const SYNC_LOCK_KEY = "sync_lock";
const LOCK_TTL_MS = 60_000; // 1 minute max lock duration (safety net)

interface SyncLock {
  id: string;
  lockedUntil: number;
  holder: string; // "sw" or "app"
}

/**
 * Acquire the sync processing lock via IndexedDB.
 * Returns true if lock was acquired, false if another process holds it.
 */
export async function acquireSyncLock(holder: string): Promise<boolean> {
  try {
    const existing = await db.settings.get(SYNC_LOCK_KEY);
    if (existing) {
      const lock = existing as unknown as SyncLock;
      if (lock.lockedUntil > Date.now()) {
        return false; // Lock held by another process
      }
    }

    // Acquire lock with TTL
    await db.settings.put({
      id: SYNC_LOCK_KEY,
      lockedUntil: Date.now() + LOCK_TTL_MS,
      holder,
    } as unknown as AppSettings & { id: string });

    return true;
  } catch {
    return false;
  }
}

/**
 * Release the sync processing lock.
 */
export async function releaseSyncLock(): Promise<void> {
  try {
    await db.settings.delete(SYNC_LOCK_KEY);
  } catch {
    // Ignore errors on release
  }
}

/**
 * Get the API endpoint for a queued action.
 */
export function getEndpointForAction(
  action: QueuedAction,
  baseUrl: string,
): { url: string; method: string } {
  switch (action.action) {
    case "subscribe":
      return { url: `${baseUrl}/api/v1/subscriptions`, method: "POST" };
    case "unsubscribe": {
      const feedId = encodeRssFeed(action.payload.feedUrl);
      return {
        url: `${baseUrl}/api/v1/subscriptions/${feedId}`,
        method: "DELETE",
      };
    }
    case "updatePlayStatus":
      return { url: `${baseUrl}/api/v1/play`, method: "POST" };
    case "likePodcast":
      return { url: `${baseUrl}/api/v1/likes`, method: "POST" };
    case "unlikePodcast": {
      const likeFeedId = encodeRssFeed(action.payload.feedUrl);
      return {
        url: `${baseUrl}/api/v1/likes/${likeFeedId}`,
        method: "DELETE",
      };
    }
  }
}

/**
 * Process a single queued action against the sync API.
 * Returns true on success, false on failure.
 */
export async function processAction(action: QueuedAction, settings: AppSettings): Promise<boolean> {
  if (!settings.syncServerUrl || !settings.syncToken) {
    return false;
  }

  try {
    const endpoint = getEndpointForAction(action, settings.syncServerUrl);
    let body: string | undefined;
    if (endpoint.method !== "DELETE") {
      if (action.action === "likePodcast") {
        body = JSON.stringify({
          rss_source_feed: encodeRssFeed(action.payload.feedUrl),
        });
      } else {
        body = JSON.stringify(action.payload);
      }
    }
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.syncToken}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (action.id) {
      await markAttempted(action.id, errorMessage);
    }
    return false;
  }
}

/**
 * Process all retryable actions in the sync queue.
 * Acquires lock, processes actions, then releases lock.
 *
 * @param holder - Identifies who is processing ("sw" or "app")
 * @returns Number of successfully processed actions, or -1 if lock not acquired
 */
export async function processQueue(holder: string): Promise<number> {
  const settings = await getSettings();

  if (!settings.syncServerUrl || !settings.syncToken) {
    return 0;
  }

  const locked = await acquireSyncLock(holder);
  if (!locked) {
    return -1; // Another process is already processing
  }

  let processed = 0;

  try {
    const actions = await getRetryableActions();

    for (const action of actions) {
      const success = await processAction(action, settings);
      if (success && action.id) {
        await removeAction(action.id);
        processed++;
      }
    }

    await pruneFailedActions();
    await enforceQueueLimit();
  } finally {
    await releaseSyncLock();
  }

  return processed;
}

/**
 * Notify the app that sync processing completed.
 * Uses BroadcastChannel so both SW and app tabs receive the message.
 */
export function notifySyncComplete(processed: number): void {
  try {
    const channel = new BroadcastChannel("balados-sync");
    channel.postMessage({ type: "sync-complete", processed });
    channel.close();
  } catch {
    // BroadcastChannel not supported or closed - ignore
  }
}
