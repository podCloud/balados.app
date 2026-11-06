import { CacheableResponsePlugin } from "workbox-cacheable-response";
import type { RouteMatchCallbackOptions } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { StaleWhileRevalidate } from "workbox-strategies";

/**
 * Podcast and episode artwork (#108). Matched by request destination rather
 * than file extension: artwork URLs often carry a query string
 * (cover.jpg?w=300) or no extension at all.
 */
export const isArtworkRequest = ({ request }: RouteMatchCallbackOptions): boolean =>
  request.destination === "image";

/**
 * Artwork cache. Artwork lives on other domains, served without CORS
 * headers: the responses are opaque (status 0), which Workbox refuses to
 * cache by default, so artwork never showed offline. An opaque 404/5xx looks
 * exactly like a good image, so the cache is stale-while-revalidate: a
 * cached error heals on the next view instead of sticking for 30 days.
 * Chrome pads each opaque response to several MB of quota, hence the small
 * cap, purgeOnQuotaError, and downloads freeing this cache when full.
 */
export const createArtworkStrategy = () =>
  new StaleWhileRevalidate({
    cacheName: "podcast-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  });
