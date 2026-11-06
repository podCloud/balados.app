import type { DownloadedEpisode, Episode } from "../../types";
import { ARTWORK_CACHE_NAME } from "../../workers/artworkCacheName";
import { db } from "./index";

const CACHE_NAME = "podcast-audio";

/**
 * Get the episode ID from an episode object
 */
export const getEpisodeId = (episode: Episode): string => {
  return episode.guid || episode.enclosureUrl;
};

/**
 * Download an episode and store it in the cache
 */
export const downloadEpisode = async (
  episode: Episode,
  feedUrl: string,
  onProgress?: (percent: number) => void,
): Promise<void> => {
  const episodeId = getEpisodeId(episode);

  const response = await fetch(episode.enclosureUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  // If we can track progress, read the stream manually
  if (total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      if (onProgress) {
        onProgress(Math.round((received / total) * 100));
      }
    }

    // Combine chunks into a single array
    const allChunks = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Content type kept for the cached response
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    // Store in cache
    const cache = await caches.open(CACHE_NAME);
    await putWithQuotaRecovery(
      cache,
      episode.enclosureUrl,
      () => new Response(allChunks, { headers: { "Content-Type": contentType } }),
    );

    // Store metadata in IndexedDB
    const metadata: DownloadedEpisode = {
      episodeId,
      feedUrl,
      enclosureUrl: episode.enclosureUrl,
      title: episode.title,
      fileSize: received,
      downloadedAt: Date.now(),
    };

    await db.downloads.put(metadata);
  } else {
    // Fallback: no progress tracking
    const blob = await response.blob();

    const cache = await caches.open(CACHE_NAME);
    await putWithQuotaRecovery(cache, episode.enclosureUrl, () => new Response(blob));

    const metadata: DownloadedEpisode = {
      episodeId,
      feedUrl,
      enclosureUrl: episode.enclosureUrl,
      title: episode.title,
      fileSize: blob.size,
      downloadedAt: Date.now(),
    };

    await db.downloads.put(metadata);
    onProgress?.(100);
  }
};

/**
 * cache.put that survives a full origin quota once: artwork responses are
 * opaque and Chrome pads each to several MB of quota (#108), so drop the
 * artwork cache (rebuilt as images are viewed again) and retry with a fresh
 * response body. Other errors propagate.
 */
export const putWithQuotaRecovery = async (
  cache: Cache,
  url: string,
  makeResponse: () => Response,
): Promise<void> => {
  try {
    await cache.put(url, makeResponse());
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") throw error;
    await caches.delete(ARTWORK_CACHE_NAME);
    await cache.put(url, makeResponse());
  }
};

/**
 * Delete a downloaded episode from cache and database
 */
export const deleteDownload = async (episodeId: string): Promise<void> => {
  const download = await db.downloads.get(episodeId);
  if (!download) return;

  // Remove from cache
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(download.enclosureUrl);

  // Remove from database
  await db.downloads.delete(episodeId);
};

/**
 * Check if an episode is downloaded
 */
export const isEpisodeDownloaded = async (episodeId: string): Promise<boolean> => {
  const download = await db.downloads.get(episodeId);
  return !!download;
};

/**
 * Get cached URL for an episode if it exists
 */
export const getCachedAudioUrl = async (enclosureUrl: string): Promise<string | null> => {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(enclosureUrl);

  if (response) {
    // Return a blob URL for offline playback
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  return null;
};

/**
 * Get all downloaded episodes
 */
export const getAllDownloads = async (): Promise<DownloadedEpisode[]> => {
  return db.downloads.orderBy("downloadedAt").reverse().toArray();
};

/**
 * Get storage quota information
 */
export const getStorageQuota = async (): Promise<{
  used: number;
  available: number;
  total: number;
}> => {
  if ("storage" in navigator && "estimate" in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      available: (estimate.quota || 0) - (estimate.usage || 0),
      total: estimate.quota || 0,
    };
  }

  // Fallback: calculate from downloads
  const downloads = await getAllDownloads();
  const used = downloads.reduce((sum, d) => sum + d.fileSize, 0);
  return {
    used,
    available: 0,
    total: 0,
  };
};

/**
 * Clear all downloaded episodes
 */
export const clearAllDownloads = async (): Promise<void> => {
  // Delete the entire cache
  await caches.delete(CACHE_NAME);

  // Clear the downloads table
  await db.downloads.clear();
};

/**
 * Get total size of all downloads
 */
export const getDownloadsSize = async (): Promise<number> => {
  const downloads = await getAllDownloads();
  return downloads.reduce((sum, d) => sum + d.fileSize, 0);
};
