import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isBackgroundSyncSupported,
  isPeriodicSyncSupported,
  requestBackgroundSync,
  registerPeriodicSync,
  unregisterPeriodicSync,
} from "./backgroundSync";

describe("backgroundSync", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("isBackgroundSyncSupported", () => {
    it("returns true when serviceWorker and SyncManager exist", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: { ...originalNavigator, serviceWorker: {} },
        writable: true,
        configurable: true,
      });
      (globalThis.window as unknown as Record<string, unknown>).SyncManager = function () {};

      expect(isBackgroundSyncSupported()).toBe(true);

      delete (globalThis.window as unknown as Record<string, unknown>).SyncManager;
    });

    it("returns false when SyncManager is missing", () => {
      expect(isBackgroundSyncSupported()).toBe(false);
    });
  });

  describe("isPeriodicSyncSupported", () => {
    it("returns false when PeriodicSyncManager is missing", () => {
      expect(isPeriodicSyncSupported()).toBe(false);
    });
  });

  describe("requestBackgroundSync", () => {
    it("does not throw when Background Sync is not supported", async () => {
      await expect(requestBackgroundSync()).resolves.not.toThrow();
    });

    it("registers sync when supported", async () => {
      const mockRegister = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          serviceWorker: {
            ready: Promise.resolve({
              sync: { register: mockRegister },
            }),
          },
        },
        writable: true,
        configurable: true,
      });
      (globalThis.window as unknown as Record<string, unknown>).SyncManager = function () {};

      await requestBackgroundSync();
      expect(mockRegister).toHaveBeenCalledWith("balados-sync-queue");

      delete (globalThis.window as unknown as Record<string, unknown>).SyncManager;
    });

    it("handles registration failure gracefully", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          ...originalNavigator,
          serviceWorker: {
            ready: Promise.resolve({
              sync: {
                register: vi.fn().mockRejectedValue(new Error("denied")),
              },
            }),
          },
        },
        writable: true,
        configurable: true,
      });
      (globalThis.window as unknown as Record<string, unknown>).SyncManager = function () {};

      await expect(requestBackgroundSync()).resolves.not.toThrow();

      delete (globalThis.window as unknown as Record<string, unknown>).SyncManager;
    });
  });

  describe("registerPeriodicSync", () => {
    it("does not throw when Periodic Sync is not supported", async () => {
      await expect(registerPeriodicSync()).resolves.not.toThrow();
    });
  });

  describe("unregisterPeriodicSync", () => {
    it("does not throw when Periodic Sync is not supported", async () => {
      await expect(unregisterPeriodicSync()).resolves.not.toThrow();
    });
  });
});
