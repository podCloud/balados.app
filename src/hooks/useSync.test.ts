import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSync } from "./useSync";

// Mock SyncClient - vi.hoisted ensures these are available before vi.mock hoisting
const { mockTestConnection, mockSaveCredentials, mockClearCredentials, mockSync, mockFromSettings } =
  vi.hoisted(() => ({
    mockTestConnection: vi.fn().mockResolvedValue(true),
    mockSaveCredentials: vi.fn().mockResolvedValue(undefined),
    mockClearCredentials: vi.fn().mockResolvedValue(undefined),
    mockSync: vi.fn().mockResolvedValue({
      synced_at: new Date().toISOString(),
      subscriptions: [],
      play_statuses: [],
    }),
    mockFromSettings: vi.fn().mockResolvedValue(null),
  }));

vi.mock("../services/sync/client", () => {
  class SyncClient {
    serverUrl: string;
    token: string;
    constructor(url?: string, token?: string) {
      this.serverUrl = url || "";
      this.token = token || "";
    }
    testConnection = mockTestConnection;
    saveCredentials = mockSaveCredentials;
    clearCredentials = mockClearCredentials;
    sync = mockSync;
    static fromSettings = mockFromSettings;
  }
  return { SyncClient };
});

// Mock storage
vi.mock("../services/storage", () => ({
  getSettings: vi.fn().mockResolvedValue({
    locale: "fr",
    proxies: [],
  }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  db: {
    playStatuses: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    subscriptions: {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("../services/storage/subscriptions", () => ({
  getSubscriptions: vi.fn().mockResolvedValue([]),
}));

// Mock useSyncQueue
const mockProcessQueue = vi.fn().mockResolvedValue(undefined);
const mockRefreshCount = vi.fn().mockResolvedValue(undefined);

vi.mock("./useSyncQueue", () => ({
  useSyncQueue: () => ({
    pendingCount: 0,
    processQueue: mockProcessQueue,
    refreshCount: mockRefreshCount,
    isSyncing: false,
    lastSyncError: null,
    clearError: vi.fn(),
  }),
}));

// Mock merger
vi.mock("../services/sync/merger", () => ({
  mergeSubscriptions: vi.fn().mockReturnValue({ merged: [], conflicts: [] }),
  mergePlayStatuses: vi.fn().mockReturnValue({ merged: [], conflicts: [] }),
  subscriptionsToSync: vi.fn().mockReturnValue([]),
  playStatusesToSync: vi.fn().mockReturnValue([]),
}));

import { getSettings, saveSettings } from "../services/storage";

describe("useSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTestConnection.mockResolvedValue(true);
    mockFromSettings.mockResolvedValue(null);
    // Reset getSettings to default (no sync credentials)
    vi.mocked(getSettings).mockResolvedValue({
      locale: "fr",
      proxies: [],
    });
  });

  it("starts with disconnected status", () => {
    const { result } = renderHook(() => useSync());

    expect(result.current.status).toBe("disconnected");
    expect(result.current.serverUrl).toBeNull();
    expect(result.current.lastSyncAt).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isSyncing).toBe(false);
  });

  it("loads connected state from settings on mount", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "test-token",
      lastSyncAt: 1700000000000,
    });

    const { result } = renderHook(() => useSync());

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.serverUrl).toBe("https://sync.example.com");
    expect(result.current.lastSyncAt).toEqual(new Date(1700000000000));
  });

  it("sets error status when connection test fails on mount", async () => {
    vi.mocked(getSettings).mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "test-token",
    });
    mockTestConnection.mockResolvedValue(false);

    const { result } = renderHook(() => useSync());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("Connection test failed");
  });

  describe("connect()", () => {
    it("connects successfully with valid credentials", async () => {
      const { result } = renderHook(() => useSync());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.connect(
          "https://sync.example.com",
          "valid-token"
        );
      });

      expect(success).toBe(true);
      expect(result.current.status).toBe("connected");
      expect(result.current.serverUrl).toBe("https://sync.example.com");
      expect(result.current.error).toBeNull();
    });

    it("normalizes URL by adding https:// prefix", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.connect("sync.example.com", "token");
      });

      expect(result.current.serverUrl).toBe("https://sync.example.com");
    });

    it("normalizes URL by removing trailing slash", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.connect("https://sync.example.com/", "token");
      });

      expect(result.current.serverUrl).toBe("https://sync.example.com");
    });

    it("does not add https:// if http:// already present", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.connect("http://localhost:4000", "token");
      });

      expect(result.current.serverUrl).toBe("http://localhost:4000");
    });

    it("returns false and sets error on connection failure", async () => {
      mockTestConnection.mockResolvedValue(false);
      const { result } = renderHook(() => useSync());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.connect("https://bad.server", "token");
      });

      expect(success).toBe(false);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe(
        "Server unreachable or invalid token"
      );
    });

    it("saves credentials on successful connection", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.connect("https://sync.example.com", "token");
      });

      expect(mockSaveCredentials).toHaveBeenCalled();
    });

    it("refreshes count after successful connection", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.connect("https://sync.example.com", "token");
      });

      await waitFor(() => {
        expect(mockRefreshCount).toHaveBeenCalled();
      });
    });

    it("handles exceptions during connect", async () => {
      mockTestConnection.mockRejectedValue(new Error("Network error"));
      const { result } = renderHook(() => useSync());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.connect("https://sync.example.com", "t");
      });

      expect(success).toBe(false);
      expect(result.current.status).toBe("error");
      expect(result.current.error).toBe("Network error");
    });
  });

  describe("disconnect()", () => {
    it("clears credentials and resets state", async () => {
      // First connect
      vi.mocked(getSettings).mockResolvedValue({
        locale: "fr",
        proxies: [],
        syncServerUrl: "https://sync.example.com",
        syncToken: "token",
      });

      const { result } = renderHook(() => useSync());

      await waitFor(() => {
        expect(result.current.status).toBe("connected");
      });

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.serverUrl).toBeNull();
      expect(result.current.lastSyncAt).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("saves settings with cleared lastSyncAt", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.disconnect();
      });

      expect(saveSettings).toHaveBeenCalledWith({ lastSyncAt: undefined });
    });
  });

  describe("clearError()", () => {
    it("clears error and sets status to disconnected when no server", () => {
      const { result } = renderHook(() => useSync());

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe("disconnected");
    });
  });

  describe("sync()", () => {
    it("sets error when no sync server configured", async () => {
      const { result } = renderHook(() => useSync());

      await act(async () => {
        await result.current.sync();
      });

      await waitFor(() => {
        expect(result.current.error).toBe("No sync server configured");
      });
    });
  });
});
