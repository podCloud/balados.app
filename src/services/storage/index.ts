import Dexie, { type EntityTable } from "dexie";
import type {
  Subscription,
  PlayStatus,
  LocalEvent,
  PodcastFeed,
  AppSettings,
  DownloadedEpisode,
  QueuedAction,
  StatsSnapshot,
} from "../../types";

// Feed cache with expiration
export interface FeedCache {
  url: string;
  feed: PodcastFeed;
  cachedAt: number;
}

// Database schema
class BaladosDatabase extends Dexie {
  subscriptions!: EntityTable<Subscription, "url">;
  playStatuses!: EntityTable<PlayStatus, "episodeId">;
  events!: EntityTable<LocalEvent, "id">;
  feedCache!: EntityTable<FeedCache, "url">;
  settings!: EntityTable<AppSettings & { id: string }, "id">;
  downloads!: EntityTable<DownloadedEpisode, "episodeId">;
  syncQueue!: EntityTable<QueuedAction, "id">;
  statsSnapshots!: EntityTable<StatsSnapshot, "id">;
  hiddenEpisodes!: EntityTable<
    { episodeId: string; hiddenAt: number },
    "episodeId"
  >;

  constructor() {
    super("balados");

    this.version(1).stores({
      subscriptions: "url, addedAt",
      playStatuses: "episodeId, feedUrl, updatedAt",
      events: "++id, type, feedUrl, timestamp",
      feedCache: "url, cachedAt",
      settings: "id",
    });

    this.version(2).stores({
      subscriptions: "url, addedAt",
      playStatuses: "episodeId, feedUrl, updatedAt",
      events: "++id, type, feedUrl, timestamp",
      feedCache: "url, cachedAt",
      settings: "id",
      downloads: "episodeId, feedUrl, downloadedAt",
    });

    this.version(3).stores({
      subscriptions: "url, addedAt",
      playStatuses: "episodeId, feedUrl, updatedAt",
      events: "++id, type, feedUrl, timestamp",
      feedCache: "url, cachedAt",
      settings: "id",
      downloads: "episodeId, feedUrl, downloadedAt",
      syncQueue: "++id, action, createdAt",
    });

    this.version(4).stores({
      subscriptions: "url, addedAt",
      playStatuses: "episodeId, feedUrl, updatedAt",
      events: "++id, type, feedUrl, timestamp",
      feedCache: "url, cachedAt",
      settings: "id",
      downloads: "episodeId, feedUrl, downloadedAt",
      syncQueue: "++id, action, createdAt",
      statsSnapshots: "++id, createdAt",
    });

    this.version(5)
      .stores({
        subscriptions: "url, addedAt",
        playStatuses: "episodeId, feedUrl, updatedAt",
        events: "++id, type, feedUrl, timestamp",
        feedCache: "url, cachedAt",
        settings: "id",
        downloads: "episodeId, feedUrl, downloadedAt",
        syncQueue: "++id, action, createdAt",
        statsSnapshots: "++id, createdAt",
        hiddenEpisodes: "episodeId",
      })
      .upgrade(async (tx) => {
        const HIDDEN_KEY = "hidden_in_progress_episodes";
        const stored = localStorage.getItem(HIDDEN_KEY);
        if (stored) {
          try {
            const ids = JSON.parse(stored) as string[];
            const now = Date.now();
            await tx
              .table("hiddenEpisodes")
              .bulkPut(
                ids.map((episodeId) => ({ episodeId, hiddenAt: now })),
              );
            localStorage.removeItem(HIDDEN_KEY);
          } catch {
            // Ignore malformed localStorage data
          }
        }
      });
  }
}

export const db = new BaladosDatabase();

// Settings helpers
const SETTINGS_ID = "app_settings";

export const getSettings = async (): Promise<AppSettings> => {
  const settings = await db.settings.get(SETTINGS_ID);
  if (settings) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = settings;
    return rest;
  }
  return {
    locale: "fr",
    proxies: [
      {
        url: "https://api.allorigins.win/raw?url=",
        name: "AllOrigins",
        enabled: true,
        priority: 1,
      },
      {
        url: "https://corsproxy.io/?",
        name: "CORS Proxy",
        enabled: true,
        priority: 2,
      },
    ],
  };
};

export const saveSettings = async (
  settings: Partial<AppSettings>,
): Promise<void> => {
  const current = await getSettings();
  await db.settings.put({ id: SETTINGS_ID, ...current, ...settings });
};

// Feed cache helpers
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export const getCachedFeed = async (
  url: string,
): Promise<PodcastFeed | null> => {
  const cached = await db.feedCache.get(url);
  if (!cached) return null;

  const isExpired = Date.now() - cached.cachedAt > CACHE_DURATION;
  if (isExpired) {
    await db.feedCache.delete(url);
    return null;
  }

  return cached.feed;
};

export const cacheFeed = async (
  url: string,
  feed: PodcastFeed,
): Promise<void> => {
  await db.feedCache.put({
    url,
    feed,
    cachedAt: Date.now(),
  });
};

export const invalidateFeedCache = async (url: string): Promise<void> => {
  await db.feedCache.delete(url);
};

// Migration helper for localStorage data
export const migrateFromLocalStorage = async (): Promise<void> => {
  const STORAGE_KEY = "podcast_subscriptions";
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const subs = JSON.parse(stored) as Subscription[];
      const existingCount = await db.subscriptions.count();

      if (existingCount === 0 && subs.length > 0) {
        await db.subscriptions.bulkPut(subs);
      }
    } catch (e) {
      console.error("Failed to migrate localStorage data:", e);
    }
  }
};
