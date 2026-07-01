import type {
  LikePodcastPayload,
  PlayStatusPayload,
  QueuedAction,
  SubscribePayload,
  UnsubscribePayload,
} from "../../types";
import { db } from "./index";

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_QUEUE_SIZE = 1000; // Prevent unbounded growth

/**
 * Remove any existing queue actions matching `matchesExisting`, then insert `newAction`.
 * Pure Dexie operations only (no side effects) so callers can compose this inside their
 * own `db.transaction(...)` to keep it atomic with an unrelated table write (e.g. a
 * subscription or play status record).
 */
const insertDeduped = async (
  matchesExisting: (action: QueuedAction) => boolean,
  newAction: Omit<QueuedAction, "id">,
): Promise<number> => {
  const existing = await db.syncQueue.filter(matchesExisting).toArray();
  for (const action of existing) {
    if (action.id) await db.syncQueue.delete(action.id);
  }
  return (await db.syncQueue.add(newAction)) as number;
};

const insertSubscribeAction = (
  action: "subscribe" | "unsubscribe",
  payload: SubscribePayload | UnsubscribePayload,
): Promise<number> =>
  insertDeduped(
    (a) =>
      (a.action === "subscribe" || a.action === "unsubscribe") &&
      a.payload.feedUrl === payload.feedUrl,
    { action, payload, createdAt: Date.now(), attempts: 0 },
  );

export const queueSubscribeAction = (payload: SubscribePayload): Promise<number> =>
  insertSubscribeAction("subscribe", payload);

export const queueUnsubscribeAction = (payload: UnsubscribePayload): Promise<number> =>
  insertSubscribeAction("unsubscribe", payload);

export const queuePlayStatusAction = (payload: PlayStatusPayload): Promise<number> =>
  insertDeduped(
    (a) => a.action === "updatePlayStatus" && a.payload.episodeId === payload.episodeId,
    { action: "updatePlayStatus", payload, createdAt: Date.now(), attempts: 0 },
  );

export const queueLikeAction = (
  action: "likePodcast" | "unlikePodcast",
  payload: LikePodcastPayload,
): Promise<number> =>
  insertDeduped(
    (a) =>
      (a.action === "likePodcast" || a.action === "unlikePodcast") &&
      a.payload.feedUrl === payload.feedUrl,
    { action, payload, createdAt: Date.now(), attempts: 0 },
  );

/**
 * Get all pending actions in the queue
 */
export const getPendingActions = async (): Promise<QueuedAction[]> => {
  try {
    return db.syncQueue.orderBy("createdAt").toArray();
  } catch (error) {
    console.error("Failed to get pending actions:", error);
    return [];
  }
};

/**
 * Get count of pending actions
 */
export const getPendingCount = async (): Promise<number> => {
  try {
    return db.syncQueue.count();
  } catch (error) {
    console.error("Failed to get pending count:", error);
    return 0;
  }
};

/**
 * Mark an action as attempted (increment attempts, update lastAttemptAt)
 */
export const markAttempted = async (id: number, error?: string): Promise<void> => {
  try {
    const action = await db.syncQueue.get(id);
    if (!action) return;

    await db.syncQueue.update(id, {
      attempts: action.attempts + 1,
      lastAttemptAt: Date.now(),
      error,
    });
  } catch (err) {
    console.error("Failed to mark action as attempted:", err);
  }
};

/**
 * Remove an action from the queue (after successful sync)
 */
export const removeAction = async (id: number): Promise<void> => {
  try {
    await db.syncQueue.delete(id);
  } catch (error) {
    console.error("Failed to remove action:", error);
  }
};

/**
 * Remove all actions from the queue
 */
export const clearQueue = async (): Promise<void> => {
  try {
    await db.syncQueue.clear();
  } catch (error) {
    console.error("Failed to clear queue:", error);
  }
};

/**
 * Get actions that should be retried (respecting backoff)
 */
export const getRetryableActions = async (): Promise<QueuedAction[]> => {
  try {
    const allActions = await getPendingActions();
    const now = Date.now();

    return allActions.filter((action) => {
      // Skip if max attempts reached
      if (action.attempts >= MAX_ATTEMPTS) return false;

      // If never attempted, include it
      if (!action.lastAttemptAt) return true;

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = BASE_RETRY_DELAY * 2 ** action.attempts;
      return now - action.lastAttemptAt >= delay;
    });
  } catch (error) {
    console.error("Failed to get retryable actions:", error);
    return [];
  }
};

/**
 * Remove actions that have exceeded max attempts
 */
export const pruneFailedActions = async (): Promise<number> => {
  try {
    const allActions = await getPendingActions();
    const failedActions = allActions.filter((action) => action.attempts >= MAX_ATTEMPTS);

    for (const action of failedActions) {
      if (action.id) {
        await db.syncQueue.delete(action.id);
      }
    }

    return failedActions.length;
  } catch (error) {
    console.error("Failed to prune failed actions:", error);
    return 0;
  }
};

/**
 * Enforce max queue size by removing oldest actions
 */
export const enforceQueueLimit = async (): Promise<number> => {
  try {
    const count = await getPendingCount();
    if (count <= MAX_QUEUE_SIZE) return 0;

    const excess = count - MAX_QUEUE_SIZE;
    const oldestActions = await db.syncQueue.orderBy("createdAt").limit(excess).toArray();

    for (const action of oldestActions) {
      if (action.id) {
        await db.syncQueue.delete(action.id);
      }
    }

    return excess;
  } catch (error) {
    console.error("Failed to enforce queue limit:", error);
    return 0;
  }
};

/**
 * Check if there are any pending actions
 */
export const hasPendingActions = async (): Promise<boolean> => {
  const count = await getPendingCount();
  return count > 0;
};
