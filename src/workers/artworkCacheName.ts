/**
 * Name of the service worker's artwork cache. Shared by the SW route and by
 * the app's quota recovery for downloads, which deletes this cache (#108);
 * kept free of Workbox imports so the app bundle does not pull them in.
 */
export const ARTWORK_CACHE_NAME = "podcast-images";
