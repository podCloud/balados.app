import { db } from "./index";
import type {
  QueuedAction,
  QueuedActionType,
  SubscribePayload,
  UnsubscribePayload,
  PlayStatusPayload,
} from "../../types";

const MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000; // 1 second

/**
 * Add an action to the sync queue
 */
export const queueAction = async (
  action: QueuedActionType,
  payload: SubscribePayload | UnsubscribePayload | PlayStatusPayload
): Promise<number> => {
  const queuedAction: QueuedAction = {
    action,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };

  const id = await db.syncQueue.add(queuedAction);
  return id as number;
};

/**
 * Get all pending actions in the queue
 */
export const getPendingActions = async (): Promise<QueuedAction[]> => {
  return db.syncQueue.orderBy("createdAt").toArray();
};

/**
 * Get count of pending actions
 */
export const getPendingCount = async (): Promise<number> => {
  return db.syncQueue.count();
};

/**
 * Mark an action as attempted (increment attempts, update lastAttemptAt)
 */
export const markAttempted = async (
  id: number,
  error?: string
): Promise<void> => {
  const action = await db.syncQueue.get(id);
  if (!action) return;

  await db.syncQueue.update(id, {
    attempts: action.attempts + 1,
    lastAttemptAt: Date.now(),
    error,
  });
};

/**
 * Remove an action from the queue (after successful sync)
 */
export const removeAction = async (id: number): Promise<void> => {
  await db.syncQueue.delete(id);
};

/**
 * Remove all actions from the queue
 */
export const clearQueue = async (): Promise<void> => {
  await db.syncQueue.clear();
};

/**
 * Get actions that should be retried (respecting backoff)
 */
export const getRetryableActions = async (): Promise<QueuedAction[]> => {
  const allActions = await getPendingActions();
  const now = Date.now();

  return allActions.filter((action) => {
    // Skip if max attempts reached
    if (action.attempts >= MAX_ATTEMPTS) return false;

    // If never attempted, include it
    if (!action.lastAttemptAt) return true;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = BASE_RETRY_DELAY * Math.pow(2, action.attempts);
    return now - action.lastAttemptAt >= delay;
  });
};

/**
 * Remove actions that have exceeded max attempts
 */
export const pruneFailedActions = async (): Promise<number> => {
  const allActions = await getPendingActions();
  const failedActions = allActions.filter(
    (action) => action.attempts >= MAX_ATTEMPTS
  );

  for (const action of failedActions) {
    if (action.id) {
      await db.syncQueue.delete(action.id);
    }
  }

  return failedActions.length;
};

/**
 * Check if there are any pending actions
 */
export const hasPendingActions = async (): Promise<boolean> => {
  const count = await getPendingCount();
  return count > 0;
};
