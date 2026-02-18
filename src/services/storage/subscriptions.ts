import type { Subscription } from "../../types";
import { logEvent } from "./events";
import { db, getSettings, invalidateFeedCache } from "./index";
import { queueAction } from "./syncQueue";

export const getSubscriptions = async (): Promise<Subscription[]> => {
  return db.subscriptions.orderBy("addedAt").reverse().toArray();
};

export const getSubscription = async (url: string): Promise<Subscription | undefined> => {
  return db.subscriptions.get(url);
};

export const addSubscription = async (url: string): Promise<Subscription> => {
  const existing = await db.subscriptions.get(url);
  if (existing) {
    return existing;
  }

  const subscription: Subscription = {
    url,
    addedAt: Date.now(),
  };

  await db.subscriptions.add(subscription);

  // Log subscription event for stats
  await logEvent("subscription_added", { feedUrl: url });

  // Queue for sync if server is configured
  const settings = await getSettings();
  if (settings.syncServerUrl) {
    await queueAction("subscribe", { feedUrl: url });
  }

  return subscription;
};

export const updateSubscription = async (
  url: string,
  updates: Partial<Omit<Subscription, "url">>,
): Promise<void> => {
  await db.subscriptions.update(url, updates);
};

export const removeSubscription = async (url: string): Promise<void> => {
  await db.subscriptions.delete(url);
  await invalidateFeedCache(url);

  // Log subscription event for stats
  await logEvent("subscription_removed", { feedUrl: url });

  // Clean up play statuses for this feed
  await db.playStatuses.where("feedUrl").equals(url).delete();

  // Queue for sync if server is configured
  const settings = await getSettings();
  if (settings.syncServerUrl) {
    await queueAction("unsubscribe", { feedUrl: url });
  }
};

export const hasSubscription = async (url: string): Promise<boolean> => {
  const count = await db.subscriptions.where("url").equals(url).count();
  return count > 0;
};
