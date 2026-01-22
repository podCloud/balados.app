import { db } from "./index";
import type { LocalEvent, EventType } from "../../types";

export const logEvent = async (
  type: EventType,
  options?: {
    feedUrl?: string;
    episodeId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  await db.events.add({
    type,
    feedUrl: options?.feedUrl,
    episodeId: options?.episodeId,
    metadata: options?.metadata,
    timestamp: Date.now(),
  });
};

export const getEvents = async (
  options?: {
    type?: EventType;
    feedUrl?: string;
    since?: number;
    limit?: number;
  },
): Promise<LocalEvent[]> => {
  let collection = db.events.orderBy("timestamp").reverse();

  if (options?.type) {
    collection = db.events
      .where("type")
      .equals(options.type)
      .reverse();
  }

  let results = await collection.toArray();

  if (options?.feedUrl) {
    results = results.filter((e) => e.feedUrl === options.feedUrl);
  }

  if (options?.since) {
    const since = options.since;
    results = results.filter((e) => e.timestamp >= since);
  }

  if (options?.limit) {
    results = results.slice(0, options.limit);
  }

  return results;
};

export const getListeningStats = async (
  since?: number,
): Promise<{
  totalPlays: number;
  completedPlays: number;
  topPodcasts: { feedUrl: string; count: number }[];
}> => {
  const startTime = since || 0;

  const playEvents = await db.events
    .where("type")
    .anyOf(["play_started", "play_completed"])
    .and((e) => e.timestamp >= startTime)
    .toArray();

  const playStarted = playEvents.filter((e) => e.type === "play_started");
  const playCompleted = playEvents.filter((e) => e.type === "play_completed");

  // Count plays per podcast
  const podcastCounts = new Map<string, number>();
  for (const event of playStarted) {
    if (event.feedUrl) {
      podcastCounts.set(
        event.feedUrl,
        (podcastCounts.get(event.feedUrl) || 0) + 1,
      );
    }
  }

  const topPodcasts = Array.from(podcastCounts.entries())
    .map(([feedUrl, count]) => ({ feedUrl, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalPlays: playStarted.length,
    completedPlays: playCompleted.length,
    topPodcasts,
  };
};

export const clearEvents = async (before?: number): Promise<void> => {
  if (before) {
    await db.events.where("timestamp").below(before).delete();
  } else {
    await db.events.clear();
  }
};
