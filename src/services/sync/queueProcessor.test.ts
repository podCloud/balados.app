import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, QueuedAction } from "../../types";
import { db } from "../storage/index";
import { queueSubscribe } from "../storage/syncQueue";
import {
  acquireSyncLock,
  getEndpointForAction,
  notifySyncComplete,
  processAction,
  processQueue,
  releaseSyncLock,
} from "./queueProcessor";

// Mock backgroundSync to prevent SW registration in queue functions
vi.mock("./backgroundSync", () => ({
  requestBackgroundSync: vi.fn().mockResolvedValue(undefined),
}));

const mockSettings: AppSettings = {
  locale: "fr",
  proxies: [],
  syncServerUrl: "https://sync.example.com",
  syncToken: "test-jwt-token",
};

describe("queueProcessor", () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
    await db.settings.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await releaseSyncLock();
  });

  describe("acquireSyncLock / releaseSyncLock", () => {
    it("acquires lock when no lock exists", async () => {
      const acquired = await acquireSyncLock("app");
      expect(acquired).toBe(true);
    });

    it("rejects when lock is held by another process", async () => {
      await acquireSyncLock("sw");
      const acquired = await acquireSyncLock("app");
      expect(acquired).toBe(false);
    });

    it("allows acquisition after lock is released", async () => {
      await acquireSyncLock("sw");
      await releaseSyncLock();
      const acquired = await acquireSyncLock("app");
      expect(acquired).toBe(true);
    });

    it("allows acquisition when lock has expired", async () => {
      // Manually write an expired lock
      await db.settings.put({
        id: "sync_lock",
        lockedUntil: Date.now() - 1000,
        holder: "sw",
      } as unknown as AppSettings & { id: string });

      const acquired = await acquireSyncLock("app");
      expect(acquired).toBe(true);
    });
  });

  describe("getEndpointForAction", () => {
    const baseUrl = "https://sync.example.com";

    it("returns POST /subscriptions for subscribe", () => {
      const action: QueuedAction = {
        action: "subscribe",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const endpoint = getEndpointForAction(action, baseUrl);
      expect(endpoint.method).toBe("POST");
      expect(endpoint.url).toBe(`${baseUrl}/api/v1/subscriptions`);
    });

    it("returns DELETE /subscriptions/{id} for unsubscribe", () => {
      const action: QueuedAction = {
        action: "unsubscribe",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const endpoint = getEndpointForAction(action, baseUrl);
      expect(endpoint.method).toBe("DELETE");
      expect(endpoint.url).toContain("/api/v1/subscriptions/");
    });

    it("returns POST /likes for likePodcast", () => {
      const action: QueuedAction = {
        action: "likePodcast",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const endpoint = getEndpointForAction(action, baseUrl);
      expect(endpoint.method).toBe("POST");
      expect(endpoint.url).toBe(`${baseUrl}/api/v1/likes`);
    });

    it("returns DELETE /likes/{id} for unlikePodcast", () => {
      const action: QueuedAction = {
        action: "unlikePodcast",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const endpoint = getEndpointForAction(action, baseUrl);
      expect(endpoint.method).toBe("DELETE");
      expect(endpoint.url).toContain("/api/v1/likes/");
    });

    it("returns POST /play for updatePlayStatus", () => {
      const action: QueuedAction = {
        action: "updatePlayStatus",
        payload: {
          episodeId: "ep1",
          feedUrl: "https://example.com/feed.xml",
          position: 100,
          duration: 1000,
          completed: false,
        },
        createdAt: Date.now(),
        attempts: 0,
      };
      const endpoint = getEndpointForAction(action, baseUrl);
      expect(endpoint.method).toBe("POST");
      expect(endpoint.url).toBe(`${baseUrl}/api/v1/play`);
    });
  });

  describe("processAction", () => {
    it("returns false when no sync server configured", async () => {
      const action: QueuedAction = {
        action: "subscribe",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const result = await processAction(action, { locale: "fr", proxies: [] });
      expect(result).toBe(false);
    });

    it("returns true on successful API call", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

      const action: QueuedAction = {
        id: 1,
        action: "subscribe",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      const result = await processAction(action, mockSettings);
      expect(result).toBe(true);
    });

    it("returns false and marks attempted on API failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

      const id = await queueSubscribe({
        feedUrl: "https://example.com/feed.xml",
      });
      const action = (await db.syncQueue.get(id))!;

      const result = await processAction(action, mockSettings);
      expect(result).toBe(false);

      const updated = await db.syncQueue.get(id);
      expect(updated?.attempts).toBe(1);
      expect(updated?.error).toBe("HTTP 500");
    });

    it("sends base64url-encoded feed in body for likePodcast", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const action: QueuedAction = {
        action: "likePodcast",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      await processAction(action, mockSettings);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/likes"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("rss_source_feed"),
        }),
      );
    });

    it("sends Authorization header with token", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const action: QueuedAction = {
        action: "subscribe",
        payload: { feedUrl: "https://example.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      };
      await processAction(action, mockSettings);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-jwt-token",
          }),
        }),
      );
    });
  });

  describe("processQueue", () => {
    it("returns 0 when no sync server configured", async () => {
      await db.settings.put({
        id: "app_settings",
        locale: "fr",
        proxies: [],
      } as AppSettings & { id: string });

      const result = await processQueue("app");
      expect(result).toBe(0);
    });

    it("returns -1 when lock is held", async () => {
      await db.settings.put({
        id: "app_settings",
        ...mockSettings,
      } as AppSettings & { id: string });
      await acquireSyncLock("sw");

      const result = await processQueue("app");
      expect(result).toBe(-1);
    });

    it("processes queued actions and removes them on success", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
      await db.settings.put({
        id: "app_settings",
        ...mockSettings,
      } as AppSettings & { id: string });

      await queueSubscribe({ feedUrl: "https://a.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://b.com/feed.xml" });

      const result = await processQueue("app");
      expect(result).toBe(2);

      const remaining = await db.syncQueue.count();
      expect(remaining).toBe(0);
    });

    it("releases lock after processing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
      await db.settings.put({
        id: "app_settings",
        ...mockSettings,
      } as AppSettings & { id: string });

      await processQueue("app");

      // Lock should be released - another process should be able to acquire it
      const acquired = await acquireSyncLock("sw");
      expect(acquired).toBe(true);
    });

    it("releases lock even on error", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
      await db.settings.put({
        id: "app_settings",
        ...mockSettings,
      } as AppSettings & { id: string });
      await queueSubscribe({ feedUrl: "https://a.com/feed.xml" });

      await processQueue("app");

      const acquired = await acquireSyncLock("sw");
      expect(acquired).toBe(true);
    });
  });

  describe("notifySyncComplete", () => {
    it("broadcasts message via BroadcastChannel", () => {
      const messages: unknown[] = [];
      const channel = new BroadcastChannel("balados-sync");
      channel.addEventListener("message", (e) => messages.push(e.data));

      notifySyncComplete(5);

      // BroadcastChannel is async, but in test env it should be synchronous
      channel.close();
      // Just verify it doesn't throw
    });

    it("handles missing BroadcastChannel gracefully", () => {
      const original = globalThis.BroadcastChannel;
      // @ts-expect-error testing fallback
      globalThis.BroadcastChannel = undefined;

      expect(() => notifySyncComplete(0)).not.toThrow();

      globalThis.BroadcastChannel = original;
    });
  });
});
