import type { PlayStatus } from "../../types";
import { requestBackgroundSync } from "../sync/backgroundSync";
import { db, getSettings } from "./index";
import { queuePlayStatusAction } from "./syncQueue";

export { generateEpisodeId } from "../../utils/rssEncoding";

// Throttle play position syncs to avoid queue bloat (sync at most every 30s per episode)
const lastSyncTime = new Map<string, number>();
const SYNC_THROTTLE_MS = 30000;

export const getPlayStatus = async (episodeId: string): Promise<PlayStatus | undefined> => {
  return db.playStatuses.get(episodeId);
};

export const getPlayStatusForFeed = async (feedUrl: string): Promise<PlayStatus[]> => {
  return db.playStatuses.where("feedUrl").equals(feedUrl).toArray();
};

export const savePlayStatus = async (status: Omit<PlayStatus, "updatedAt">): Promise<void> => {
  // The play status write and the queue insert must stay atomic: if one fails, the
  // other must roll back too, or local state diverges from the sync queue (see issue #65).
  //
  // Queue for sync with throttling (avoid spamming during playback, e.g. PlayerProvider's
  // periodic 10s position saves): sync if completed, first sync, or throttle time passed.
  // The local play status is still saved on every call regardless of throttling.
  const settings = await getSettings();
  const lastSync = lastSyncTime.get(status.episodeId) || 0;
  const now = Date.now();
  const shouldQueue =
    Boolean(settings.syncServerUrl) && (status.completed || now - lastSync >= SYNC_THROTTLE_MS);

  await db.transaction("rw", db.playStatuses, db.syncQueue, async () => {
    await db.playStatuses.put({
      ...status,
      updatedAt: now,
    });
    if (shouldQueue) {
      await queuePlayStatusAction({
        episodeId: status.episodeId,
        feedUrl: status.feedUrl,
        position: status.position,
        duration: status.duration,
        completed: status.completed,
      });
    }
  });

  if (shouldQueue) {
    lastSyncTime.set(status.episodeId, now);
    await requestBackgroundSync();
  }
};

export const updatePlayPosition = async (
  episodeId: string,
  feedUrl: string,
  position: number,
  duration: number,
): Promise<void> => {
  const existing = await db.playStatuses.get(episodeId);
  const completed = duration > 0 && position / duration >= 0.95;
  const finalCompleted = existing ? existing.completed || completed : completed;

  // Queue for sync with throttling (avoid spamming during playback): sync if
  // completed, first sync, or throttle time passed.
  const settings = await getSettings();
  const lastSync = lastSyncTime.get(episodeId) || 0;
  const now = Date.now();
  const shouldQueue =
    Boolean(settings.syncServerUrl) && (finalCompleted || now - lastSync >= SYNC_THROTTLE_MS);

  // The play status write and the queue insert must stay atomic: if one fails, the
  // other must roll back too, or local state diverges from the sync queue (see issue #65).
  await db.transaction("rw", db.playStatuses, db.syncQueue, async () => {
    await db.playStatuses.put({
      episodeId,
      feedUrl,
      position,
      duration,
      completed: finalCompleted,
      updatedAt: now,
    });
    if (shouldQueue) {
      await queuePlayStatusAction({
        episodeId,
        feedUrl,
        position,
        duration,
        completed: finalCompleted,
      });
    }
  });

  if (shouldQueue) {
    lastSyncTime.set(episodeId, now);
    await requestBackgroundSync();
  }
};

export const markAsCompleted = async (
  episodeId: string,
  feedUrl: string,
  duration: number,
): Promise<void> => {
  await db.playStatuses.put({
    episodeId,
    feedUrl,
    position: duration,
    duration,
    completed: true,
    updatedAt: Date.now(),
  });
};

export const getRecentlyPlayed = async (limit: number = 10): Promise<PlayStatus[]> => {
  return db.playStatuses.orderBy("updatedAt").reverse().limit(limit).toArray();
};

export const getInProgressEpisodes = async (): Promise<PlayStatus[]> => {
  return db.playStatuses.filter((status) => !status.completed && status.position > 0).toArray();
};
