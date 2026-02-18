import type { EventType, LocalEvent, PodcastStats, StatsSnapshot } from "../../types";
import { db } from "./index";

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

export const getEvents = async (options?: {
  type?: EventType;
  feedUrl?: string;
  since?: number;
  limit?: number;
}): Promise<LocalEvent[]> => {
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

/**
 * Get the latest stats snapshot.
 */
export const getLatestSnapshot = async (): Promise<StatsSnapshot | null> => {
  const snapshots = await db.statsSnapshots.orderBy("createdAt").reverse().limit(1).toArray();
  return snapshots[0] || null;
};

/**
 * Create a new stats snapshot from current events.
 * This aggregates all play events into a snapshot for efficient storage.
 *
 * @param beforeTimestamp - Only include events before this timestamp.
 *   Used by createSnapshotAndPrune() to avoid race conditions.
 */
export const createSnapshot = async (beforeTimestamp?: number): Promise<StatsSnapshot> => {
  // Capture cutoff time BEFORE reading events to avoid race conditions
  const cutoff = beforeTimestamp ?? Date.now();

  // Get play events up to the cutoff time
  const query = db.events.where("type").anyOf(["play_started", "play_completed"]);
  const playEvents = await query.filter((e) => e.timestamp < cutoff).toArray();

  // Only count events WITH feedUrl for consistency
  // Events without feedUrl are ignored (shouldn't happen in practice)
  const playStarted = playEvents.filter((e) => e.type === "play_started" && e.feedUrl);
  const playCompleted = playEvents.filter((e) => e.type === "play_completed" && e.feedUrl);

  // Aggregate by podcast
  const podcastMap = new Map<string, { plays: number; completed: number }>();

  for (const event of playStarted) {
    const current = podcastMap.get(event.feedUrl!) || { plays: 0, completed: 0 };
    current.plays++;
    podcastMap.set(event.feedUrl!, current);
  }

  for (const event of playCompleted) {
    const current = podcastMap.get(event.feedUrl!) || { plays: 0, completed: 0 };
    current.completed++;
    podcastMap.set(event.feedUrl!, current);
  }

  const podcastStats: PodcastStats[] = Array.from(podcastMap.entries()).map(([feedUrl, stats]) => ({
    feedUrl,
    ...stats,
  }));

  const snapshot: StatsSnapshot = {
    createdAt: cutoff,
    totalPlays: playStarted.length,
    completedPlays: playCompleted.length,
    podcastStats,
  };

  const id = await db.statsSnapshots.add(snapshot);
  return { ...snapshot, id };
};

/**
 * Create a snapshot and prune old play events.
 *
 * **Recommended usage:**
 * - Call periodically (e.g., weekly) via a background job
 * - Call when event count exceeds a threshold (e.g., 10,000 events)
 * - Call before sync to minimize data transfer
 *
 * This is the main function for long-term storage management.
 */
export const createSnapshotAndPrune = async (): Promise<{
  snapshot: StatsSnapshot;
  prunedCount: number;
}> => {
  // Capture cutoff BEFORE any async operations to prevent race conditions
  // where new events arrive between snapshot creation and pruning
  const cutoff = Date.now();

  const snapshot = await createSnapshot(cutoff);

  // Delete all play events before the snapshot
  // (they're now aggregated in the snapshot)
  const prunedCount = await db.events
    .where("type")
    .anyOf(["play_started", "play_completed"])
    .and((e) => e.timestamp < cutoff)
    .delete();

  return { snapshot, prunedCount };
};

export const getListeningStats = async (
  since?: number,
): Promise<{
  totalPlays: number;
  completedPlays: number;
  topPodcasts: { feedUrl: string; count: number }[];
}> => {
  // If requesting all-time stats (since=0 or undefined), use snapshot + recent events
  const useSnapshot = !since || since === 0;
  const snapshot = useSnapshot ? await getLatestSnapshot() : null;

  // Determine the starting point for event query
  const startTime = snapshot ? snapshot.createdAt : since || 0;

  // Get events since snapshot (or since requested time)
  const playEvents = await db.events
    .where("type")
    .anyOf(["play_started", "play_completed"])
    .and((e) => e.timestamp >= startTime)
    .toArray();

  const playStarted = playEvents.filter((e) => e.type === "play_started");
  const playCompleted = playEvents.filter((e) => e.type === "play_completed");

  // Start with snapshot data if available
  let totalPlays = snapshot?.totalPlays || 0;
  let completedPlays = snapshot?.completedPlays || 0;
  const podcastCounts = new Map<string, number>();

  // Load snapshot podcast stats
  if (snapshot) {
    for (const ps of snapshot.podcastStats) {
      podcastCounts.set(ps.feedUrl, ps.plays);
    }
  }

  // Add recent events
  totalPlays += playStarted.length;
  completedPlays += playCompleted.length;

  for (const event of playStarted) {
    if (event.feedUrl) {
      podcastCounts.set(event.feedUrl, (podcastCounts.get(event.feedUrl) || 0) + 1);
    }
  }

  const topPodcasts = Array.from(podcastCounts.entries())
    .map(([feedUrl, count]) => ({ feedUrl, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalPlays,
    completedPlays,
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
 *
 * Note: We use toArray() + bulkDelete() because Dexie's .filter().delete()
 * chain doesn't work correctly. The .delete() method only works directly
 * after .where() without intermediate .filter() calls.
 */
export const pruneNonEssentialEvents = async (olderThanMs: number): Promise<number> => {
  const cutoff = Date.now() - olderThanMs;

  // Only prune non-essential event types (pause, subscription changes)
  // Keep play_started and play_completed for accurate stats
  const toDelete = await db.events
    .where("timestamp")
    .below(cutoff)
    .filter(
      (e) =>
        e.type === "play_paused" ||
        e.type === "subscription_added" ||
        e.type === "subscription_removed" ||
        e.type === "episode_downloaded",
    )
    .toArray();

  const ids = toDelete.map((e) => e.id).filter((id): id is number => id !== undefined);
  if (ids.length > 0) {
    await db.events.bulkDelete(ids);
  }

  return ids.length;
};
