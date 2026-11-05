import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getSettings, saveSettings } from "../storage";
import { clearSyncAuthError, notifySyncAuthError, subscribeSyncAuthError } from "./authEvents";

describe("authEvents", () => {
  beforeEach(async () => {
    await db.settings.clear();
    await saveSettings({ syncServerUrl: "https://sync.example.com", syncToken: "current" });
  });

  it("persists the expired flag when the rejected token is still the current one", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncAuthError(listener);

    await notifySyncAuthError("current", "https://sync.example.com");

    expect((await getSettings()).syncAuthExpired).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it("ignores a rejection of a token that has already been replaced", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncAuthError(listener);

    await notifySyncAuthError("stale", "https://sync.example.com");

    expect((await getSettings()).syncAuthExpired).toBeFalsy();
    expect((await getSettings()).syncToken).toBe("current");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not overwrite credentials saved while the notification was in flight", async () => {
    // Save first so its read lands before the notify transaction; this pins the
    // notify-side transaction (the saveSettings one is pinned by the 20-round test).
    await Promise.all([
      saveSettings({ syncToken: "fresh" }),
      notifySyncAuthError("current", "https://sync.example.com"),
    ]);

    const settings = await getSettings();
    expect(settings.syncToken).toBe("fresh");
  });

  it("never loses the flag or the token under concurrent writers", async () => {
    for (let round = 0; round < 20; round++) {
      await saveSettings({
        syncServerUrl: "https://sync.example.com",
        syncToken: "current",
        syncAuthExpired: false,
      });
      await Promise.all([
        saveSettings({ lastSyncAt: round }),
        notifySyncAuthError("current", "https://sync.example.com"),
        saveSettings({ locale: "en" }),
      ]);
      const settings = await getSettings();
      expect(settings.syncAuthExpired).toBe(true);
      expect(settings.syncToken).toBe("current");
      expect(settings.lastSyncAt).toBe(round);
    }
  });

  it("ignores a rejection coming from another server", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncAuthError(listener);

    await notifySyncAuthError("current", "https://old-server.example.com");

    expect((await getSettings()).syncAuthExpired).toBeFalsy();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("clears the flag and tells listeners", async () => {
    await saveSettings({ syncAuthExpired: true });
    const listener = vi.fn();
    const unsubscribe = subscribeSyncAuthError(listener);

    await clearSyncAuthError();

    expect((await getSettings()).syncAuthExpired).toBe(false);
    expect(listener).toHaveBeenCalledWith(false);
    unsubscribe();
  });

  it("stops calling a listener after unsubscribe", async () => {
    const listener = vi.fn();
    subscribeSyncAuthError(listener)();

    await notifySyncAuthError("current", "https://sync.example.com");

    expect(listener).not.toHaveBeenCalled();
  });
});
