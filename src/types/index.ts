// Episode type
export interface Episode {
  title: string;
  description: string;
  pubDate: string;
  enclosureUrl: string;
  duration: string;
  image: string;
  guid?: string;
}

// Podcast feed type
export interface PodcastFeed {
  title: string;
  description: string;
  image: string;
  items: Episode[];
  url: string;
}

// Subscription type
export interface Subscription {
  url: string;
  addedAt: number;
  title?: string;
  image?: string;
}

// Play status for tracking episode progress
export interface PlayStatus {
  episodeId: string;
  feedUrl: string;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
}

// Debug log type
export interface DebugLog {
  type: "log" | "error" | "warn";
  message: string;
  timestamp: string;
}

// Local event for stats tracking
export type EventType =
  | "play_started"
  | "play_completed"
  | "play_paused"
  | "subscription_added"
  | "subscription_removed"
  | "episode_downloaded";

export interface LocalEvent {
  id?: number;
  type: EventType;
  feedUrl?: string;
  episodeId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Proxy configuration
export interface ProxyConfig {
  url: string;
  name: string;
  enabled: boolean;
  priority: number;
}

// App settings
export interface AppSettings {
  locale: string;
  proxies: ProxyConfig[];
  syncServerUrl?: string;
  syncToken?: string;
}

// Navigation types
export type TabId = "library" | "player" | "explorer" | "debug";
export type ViewId = TabId | "podcast" | "settings";

// Sync types (for future use with balados.sync)
export interface SyncPayload {
  subscriptions: Subscription[];
  playStatuses: PlayStatus[];
  lastSyncAt: number;
}

export interface SyncResponse {
  success: boolean;
  data?: SyncPayload;
  error?: string;
}

// RSS item ID encoding helper types
export type RssFeedId = string; // base64 encoded feed URL
export type RssItemId = string; // base64 encoded `${guid},${enclosureUrl}`
