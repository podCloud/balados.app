import { db, invalidateFeedCache } from "./index";
import type { Subscription } from "../../types";

export const getSubscriptions = async (): Promise<Subscription[]> => {
  return db.subscriptions.orderBy("addedAt").reverse().toArray();
};

export const getSubscription = async (
  url: string,
): Promise<Subscription | undefined> => {
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

  // Clean up play statuses for this feed
  await db.playStatuses.where("feedUrl").equals(url).delete();
};

export const hasSubscription = async (url: string): Promise<boolean> => {
  const count = await db.subscriptions.where("url").equals(url).count();
  return count > 0;
};
