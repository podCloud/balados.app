import { db, getSettings } from "./index";
import { queuePlayStatus } from "./syncQueue";
import type { PlayStatus } from "../../types";
export { generateEpisodeId } from "../../utils/rssEncoding";

// Throttle play position syncs to avoid queue bloat (sync at most every 30s per episode)
const lastSyncTime = new Map<string, number>();
const SYNC_THROTTLE_MS = 30000;

export const getPlayStatus = async (
  episodeId: string,
): Promise<PlayStatus | undefined> => {
  return db.playStatuses.get(episodeId);
};

export const getPlayStatusForFeed = async (
  feedUrl: string,
): Promise<PlayStatus[]> => {
  return db.playStatuses.where("feedUrl").equals(feedUrl).toArray();
};

export const savePlayStatus = async (
  status: Omit<PlayStatus, "updatedAt">,
): Promise<void> => {
  await db.playStatuses.put({
    ...status,
    updatedAt: Date.now(),
  });

  // Queue for sync if server is configured
  const settings = await getSettings();
  if (settings.syncServerUrl) {
    await queuePlayStatus({
      episodeId: status.episodeId,
      feedUrl: status.feedUrl,
      position: status.position,
      duration: status.duration,
      completed: status.completed,
    });
    lastSyncTime.set(status.episodeId, Date.now());
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

  await db.playStatuses.put({
    episodeId,
    feedUrl,
    position,
    duration,
    completed: finalCompleted,
    updatedAt: Date.now(),
  });

  // Queue for sync with throttling (avoid spamming during playback)
  const settings = await getSettings();
  if (settings.syncServerUrl) {
    const lastSync = lastSyncTime.get(episodeId) || 0;
    const now = Date.now();

    // Sync if: completed, first sync, or throttle time passed
    if (finalCompleted || now - lastSync >= SYNC_THROTTLE_MS) {
      await queuePlayStatus({
        episodeId,
        feedUrl,
        position,
        duration,
        completed: finalCompleted,
      });
      lastSyncTime.set(episodeId, now);
    }
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

export const getRecentlyPlayed = async (
  limit: number = 10,
): Promise<PlayStatus[]> => {
  return db.playStatuses.orderBy("updatedAt").reverse().limit(limit).toArray();
};

export const getInProgressEpisodes = async (): Promise<PlayStatus[]> => {
  return db.playStatuses
    .filter((status) => !status.completed && status.position > 0)
    .toArray();
};
