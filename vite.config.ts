import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Balados",
        short_name: "Balados",
        description: "Lecteur de podcasts français, offline-first",
        theme_color: "#3b82f6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // RSS feeds - network first with cache fallback
            urlPattern: /^https:\/\/(api\.allorigins\.win|corsproxy\.io)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "rss-feeds",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Podcast images - cache first
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "podcast-images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Audio files - cache first when available
            urlPattern: /\.(?:mp3|m4a|ogg|wav|aac)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "podcast-audio",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});
