import { CacheableResponsePlugin } from "workbox-cacheable-response";
import type { RouteMatchCallbackOptions } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheFirst } from "workbox-strategies";

/**
 * Podcast and episode artwork (#108). Matched by request destination rather
 * than file extension: artwork URLs often carry a query string
 * (cover.jpg?w=300) or no extension at all.
 */
export const isArtworkRequest = ({ request }: RouteMatchCallbackOptions): boolean =>
  request.destination === "image";

/**
 * Cache-first artwork cache. Artwork lives on other domains, served without
 * CORS headers: the responses are opaque (status 0), which Workbox refuses
 * to cache by default, so artwork never showed offline. Opaque responses
 * count heavily against storage quota, hence the small cap and
 * purgeOnQuotaError.
 */
export const createArtworkStrategy = () =>
  new CacheFirst({
    cacheName: "podcast-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  });
