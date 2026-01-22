import { db } from "./index";
import type { PlayStatus } from "../../types";

// Generate episode ID from guid and enclosure URL
export const generateEpisodeId = (
  guid: string | undefined,
  enclosureUrl: string,
): string => {
  const identifier = guid || enclosureUrl;
  return btoa(`${identifier},${enclosureUrl}`);
};

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
};

export const updatePlayPosition = async (
  episodeId: string,
  feedUrl: string,
  position: number,
  duration: number,
): Promise<void> => {
  const existing = await db.playStatuses.get(episodeId);
  const completed = duration > 0 && position / duration >= 0.95;

  await db.playStatuses.put({
    episodeId,
    feedUrl,
    position,
    duration,
    completed,
    updatedAt: Date.now(),
    ...(existing && { completed: existing.completed || completed }),
  });
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
