/// <reference lib="webworker" />
/// <reference path="../types/background-sync.d.ts" />

/**
 * Custom Service Worker for Balados PWA.
 *
 * Handles:
 * 1. Precaching of app shell (via Workbox)
 * 2. Runtime caching for RSS feeds, images, and audio
 * 3. Background Sync API - processes offline queue when connectivity returns
 * 4. Periodic Background Sync - processes queue every 15 minutes
 *
 * @see docs/BACKGROUND_SYNC.md for architecture details
 */

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { RangeRequestsPlugin } from "workbox-range-requests";

import { processQueue, notifySyncComplete } from "../services/sync/queueProcessor";

declare const self: ServiceWorkerGlobalScope;

// Tag constants for sync events
const SYNC_TAG = "balados-sync-queue";
const PERIODIC_SYNC_TAG = "balados-periodic-sync";

// ============================================================
// 1. Precaching - App shell assets injected by vite-plugin-pwa
// ============================================================

precacheAndRoute(self.__WB_MANIFEST);

// ============================================================
// 2. Runtime Caching Strategies
// ============================================================

// RSS feeds via CORS proxies - network first with cache fallback
registerRoute(
  /^https:\/\/(api\.allorigins\.win|corsproxy\.io)/,
  new NetworkFirst({
    cacheName: "rss-feeds",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
    networkTimeoutSeconds: 10,
  }),
);

// Podcast images - cache first
registerRoute(
  /\.(?:png|jpg|jpeg|webp|gif)$/,
  new CacheFirst({
    cacheName: "podcast-images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);

// Audio files - cache first with range request support
registerRoute(
  /\.(?:mp3|m4a|ogg|wav|aac)$/,
  new CacheFirst({
    cacheName: "podcast-audio",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
      new RangeRequestsPlugin(),
    ],
  }),
);

// ============================================================
// 3. Background Sync API
// ============================================================

self.addEventListener("sync", ((event: SyncEvent) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(handleBackgroundSync());
  }
}) as EventListener);

async function handleBackgroundSync(): Promise<void> {
  try {
    const processed = await processQueue("sw");
    if (processed >= 0) {
      notifySyncComplete(processed);
    }
    // processed === -1 means lock not acquired (app is processing) - that's fine
  } catch (error) {
    console.error("[SW] Background sync failed:", error);
    throw error; // Re-throw so the browser retries the sync event
  }
}

// ============================================================
// 4. Periodic Background Sync
// ============================================================

self.addEventListener("periodicsync", ((event: Event) => {
  const periodicEvent = event as PeriodicSyncEvent;
  if (periodicEvent.tag === PERIODIC_SYNC_TAG) {
    periodicEvent.waitUntil(handlePeriodicSync());
  }
}) as EventListener);

async function handlePeriodicSync(): Promise<void> {
  try {
    const processed = await processQueue("sw");
    if (processed >= 0) {
      notifySyncComplete(processed);
    }
  } catch (error) {
    console.error("[SW] Periodic sync failed:", error);
  }
}

// ============================================================
// 5. Message handler for manual sync trigger from app
// ============================================================

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "PROCESS_SYNC_QUEUE") {
    event.waitUntil(
      handleBackgroundSync().catch((error) => {
        console.error("[SW] Manual sync trigger failed:", error);
      }),
    );
  }
});

