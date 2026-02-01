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
  // Start with timestamp-ordered collection
  let collection = db.events.orderBy("timestamp");

  // Filter by type at DB level if specified
  if (options?.type) {
    collection = db.events.where("type").equals(options.type);
  }

  // Apply timestamp filter at DB level using .filter() before loading
  // and apply feedUrl filter (not indexed, but filtered before full load)
  const results = await collection
    .filter((e) => {
      if (options?.since && e.timestamp < options.since) return false;
      if (options?.feedUrl && e.feedUrl !== options.feedUrl) return false;
      return true;
    })
    .reverse()
    .limit(options?.limit || Infinity)
    .toArray();

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

/**
 * Get event count for storage management.
 */
export const getEventCount = async (): Promise<number> => {
  return db.events.count();
};

/**
 * Prune non-essential events to save storage.
 * IMPORTANT: Preserves play_started and play_completed events
 * to maintain listening statistics accuracy.
 * Only removes pause events and subscription events older than cutoff.
 */
export const pruneNonEssentialEvents = async (
  olderThanMs: number,
): Promise<number> => {
  const cutoff = Date.now() - olderThanMs;

  // Only prune non-essential event types (pause, subscription changes)
  // Keep play_started and play_completed for accurate stats
  const deleted = await db.events
    .where("timestamp")
    .below(cutoff)
    .filter((e) =>
      e.type === "play_paused" ||
      e.type === "subscription_added" ||
      e.type === "subscription_removed" ||
      e.type === "episode_downloaded"
    )
    .delete();

  return deleted;
};
