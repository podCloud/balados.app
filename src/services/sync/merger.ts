import type { Subscription, PlayStatus } from "../../types";
import {
  type SubscriptionSync,
  type PlayStatusSync,
  decodeRssFeed,
  decodeRssItem,
  encodeRssFeed,
} from "./client";

/**
 * Episode ID Format Convention:
 * - episodeId is ALWAYS in btoa(guid,enclosureUrl) format
 * - This is the SAME format as rss_source_item from the server
 * - Never decode/re-encode episodeId - use it directly
 *
 * This convention is shared between balados.app and balados.sync.
 * See also: generateEpisodeId() in storage/playStatus.ts
 */

/**
 * Result of a merge operation
 */
export interface MergeResult<T> {
  /** Final merged items */
  merged: T[];
  /** Conflicts that were automatically resolved */
  conflicts: Array<{
    local: T;
    remote: T;
    resolved: T;
    reason: string;
  }>;
}

/**
 * Threshold for considering timestamps "close" (5 minutes)
 * When timestamps are close, we use other heuristics
 */
const TIMESTAMP_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Soft delete retention period (45 days in milliseconds)
 */
const SOFT_DELETE_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Check if an unsubscription is still within retention period
 */
const isWithinRetention = (unsubscribedAt: string): boolean => {
  const unsubDate = new Date(unsubscribedAt).getTime();
  return Date.now() - unsubDate < SOFT_DELETE_RETENTION_MS;
};

/**
 * Merge local and remote subscriptions using last-write-wins strategy
 *
 * Rules:
 * - If only local or only remote exists, use that
 * - If timestamps differ, most recent wins
 * - Subscribe vs unsubscribe: most recent action wins
 * - Soft deletes are preserved for 45 days
 */
export function mergeSubscriptions(
  local: Subscription[],
  remote: SubscriptionSync[]
): MergeResult<Subscription> {
  const merged: Subscription[] = [];
  const conflicts: MergeResult<Subscription>["conflicts"] = [];

  // Create maps for quick lookup
  const localMap = new Map<string, Subscription>();
  for (const sub of local) {
    localMap.set(sub.url, sub);
  }

  const remoteMap = new Map<string, SubscriptionSync>();
  for (const sub of remote) {
    const url = decodeRssFeed(sub.rss_source_feed);
    remoteMap.set(url, sub);
  }

  // Get all unique URLs
  const allUrls = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const url of allUrls) {
    const localSub = localMap.get(url);
    const remoteSub = remoteMap.get(url);

    // Only local exists
    if (localSub && !remoteSub) {
      merged.push(localSub);
      continue;
    }

    // Only remote exists
    if (!localSub && remoteSub) {
      // Skip if unsubscribed and outside retention period
      if (remoteSub.unsubscribed_at && !isWithinRetention(remoteSub.unsubscribed_at)) {
        continue;
      }
      // Skip if currently unsubscribed
      if (remoteSub.unsubscribed_at) {
        continue;
      }
      merged.push({
        url,
        addedAt: new Date(remoteSub.subscribed_at).getTime(),
        title: undefined,
        image: undefined,
      });
      continue;
    }

    // Both exist - need to resolve conflict
    if (localSub && remoteSub) {
      const localTime = localSub.addedAt;
      const remoteSubscribedTime = new Date(remoteSub.subscribed_at).getTime();
      const remoteUnsubscribedTime = remoteSub.unsubscribed_at
        ? new Date(remoteSub.unsubscribed_at).getTime()
        : null;

      // Case 1: Remote was unsubscribed
      if (remoteUnsubscribedTime) {
        // Local subscription is newer than remote unsubscription
        if (localTime > remoteUnsubscribedTime) {
          merged.push(localSub);
          conflicts.push({
            local: localSub,
            remote: {
              url,
              addedAt: remoteSubscribedTime,
            },
            resolved: localSub,
            reason: "local_subscribe_after_remote_unsubscribe",
          });
        }
        // Remote unsubscription is newer - don't include
        // But this is a conflict if local still has it
        else {
          conflicts.push({
            local: localSub,
            remote: {
              url,
              addedAt: remoteSubscribedTime,
            },
            resolved: localSub, // We still keep it locally as "resolved" but won't add to merged
            reason: "remote_unsubscribed_newer",
          });
          // Don't add to merged - respect the unsubscription
        }
        continue;
      }

      // Case 2: Both subscribed, use most recent
      if (localTime > remoteSubscribedTime) {
        merged.push(localSub);
        if (Math.abs(localTime - remoteSubscribedTime) > TIMESTAMP_THRESHOLD_MS) {
          conflicts.push({
            local: localSub,
            remote: {
              url,
              addedAt: remoteSubscribedTime,
            },
            resolved: localSub,
            reason: "local_newer",
          });
        }
      } else {
        // Remote is newer or same time - prefer local metadata if available
        const resolved: Subscription = {
          url,
          addedAt: remoteSubscribedTime,
          title: localSub.title,
          image: localSub.image,
        };
        merged.push(resolved);
        if (Math.abs(localTime - remoteSubscribedTime) > TIMESTAMP_THRESHOLD_MS) {
          conflicts.push({
            local: localSub,
            remote: {
              url,
              addedAt: remoteSubscribedTime,
            },
            resolved,
            reason: "remote_newer",
          });
        }
      }
    }
  }

  return { merged, conflicts };
}

/**
 * Merge local and remote play statuses
 *
 * Rules:
 * - If timestamps are close (< 5 min), prefer higher position
 * - If timestamps differ significantly, prefer most recent
 * - Completed status is sticky (once completed, stays completed)
 */
export function mergePlayStatuses(
  local: PlayStatus[],
  remote: PlayStatusSync[]
): MergeResult<PlayStatus> {
  const merged: PlayStatus[] = [];
  const conflicts: MergeResult<PlayStatus>["conflicts"] = [];

  // Create maps for quick lookup
  // Note: episodeId is already in btoa(guid,enclosureUrl) format, same as rss_source_item
  const localMap = new Map<string, PlayStatus>();
  for (const status of local) {
    localMap.set(status.episodeId, status);
  }

  const remoteMap = new Map<string, PlayStatusSync>();
  for (const status of remote) {
    // Use rss_source_item directly as key (already encoded)
    remoteMap.set(status.rss_source_item, status);
  }

  // Get all unique episode IDs
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const episodeId of allIds) {
    const localStatus = localMap.get(episodeId);
    const remoteStatus = remoteMap.get(episodeId);

    // Only local exists
    if (localStatus && !remoteStatus) {
      merged.push(localStatus);
      continue;
    }

    // Only remote exists
    if (!localStatus && remoteStatus) {
      // Use rss_source_item directly as episodeId (already in btoa(guid,enclosureUrl) format)
      merged.push({
        episodeId: remoteStatus.rss_source_item,
        feedUrl: decodeRssFeed(remoteStatus.rss_source_feed),
        position: remoteStatus.position,
        duration: 0, // Will be filled when episode is loaded
        completed: remoteStatus.played,
        updatedAt: new Date(remoteStatus.updated_at).getTime(),
      });
      continue;
    }

    // Both exist - need to resolve conflict
    if (localStatus && remoteStatus) {
      const localTime = localStatus.updatedAt;
      const remoteTime = new Date(remoteStatus.updated_at).getTime();
      const timeDiff = Math.abs(localTime - remoteTime);

      // Completed is sticky
      const completed = localStatus.completed || remoteStatus.played;

      let resolvedPosition: number;
      let reason: string;

      if (timeDiff < TIMESTAMP_THRESHOLD_MS) {
        // Timestamps are close - use higher position (user made more progress)
        resolvedPosition = Math.max(localStatus.position, remoteStatus.position);
        reason =
          localStatus.position >= remoteStatus.position
            ? "close_timestamps_local_position_higher"
            : "close_timestamps_remote_position_higher";
      } else if (localTime > remoteTime) {
        // Local is significantly newer
        resolvedPosition = localStatus.position;
        reason = "local_timestamp_newer";
      } else {
        // Remote is significantly newer
        resolvedPosition = remoteStatus.position;
        reason = "remote_timestamp_newer";
      }

      const resolved: PlayStatus = {
        episodeId: localStatus.episodeId,
        feedUrl: localStatus.feedUrl,
        position: resolvedPosition,
        duration: localStatus.duration || 0,
        completed,
        updatedAt: Math.max(localTime, remoteTime),
      };

      merged.push(resolved);

      // Only record as conflict if there was an actual difference
      if (
        localStatus.position !== remoteStatus.position ||
        localStatus.completed !== remoteStatus.played
      ) {
        conflicts.push({
          local: localStatus,
          remote: {
            ...localStatus,
            position: remoteStatus.position,
            completed: remoteStatus.played,
            updatedAt: remoteTime,
          },
          resolved,
          reason,
        });
      }
    }
  }

  return { merged, conflicts };
}

/**
 * Convert local subscriptions to sync format for upload
 */
export function subscriptionsToSync(
  subscriptions: Subscription[]
): SubscriptionSync[] {
  return subscriptions.map((sub) => ({
    rss_source_feed: encodeRssFeed(sub.url),
    subscribed_at: new Date(sub.addedAt).toISOString(),
  }));
}

/**
 * Convert local play statuses to sync format for upload
 */
export function playStatusesToSync(statuses: PlayStatus[]): PlayStatusSync[] {
  return statuses.map((status) => ({
    rss_source_feed: encodeRssFeed(status.feedUrl),
    // episodeId is already in btoa(guid,enclosureUrl) format, use directly
    rss_source_item: status.episodeId,
    position: status.position,
    played: status.completed,
    updated_at: new Date(status.updatedAt).toISOString(),
  }));
}
