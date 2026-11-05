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

    await notifySyncAuthError("current");

    expect((await getSettings()).syncAuthExpired).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it("ignores a rejection of a token that has already been replaced", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncAuthError(listener);

    await notifySyncAuthError("stale");

    expect((await getSettings()).syncAuthExpired).toBeFalsy();
    expect((await getSettings()).syncToken).toBe("current");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not overwrite credentials saved while the notification was in flight", async () => {
    // Settings read by the proxy before the reconnect hold the old token.
    const pendingNotify = notifySyncAuthError("current");
    await saveSettings({ syncToken: "fresh" });
    await pendingNotify;

    const settings = await getSettings();
    expect(settings.syncToken).toBe("fresh");
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

    await notifySyncAuthError("current");

    expect(listener).not.toHaveBeenCalled();
  });
});
