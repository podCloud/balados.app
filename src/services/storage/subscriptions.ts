import type { Subscription } from "../../types";
import { requestBackgroundSync } from "../sync/backgroundSync";
import { logEvent } from "./events";
import { db, getSettings, invalidateFeedCache } from "./index";
import { queueSubscribeAction, queueUnsubscribeAction } from "./syncQueue";

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

  // Queue for sync if server is configured. The subscription write and the queue
  // insert must stay atomic: if one fails, the other must roll back too, or local
  // state diverges from the sync queue (see issue #65).
  const settings = await getSettings();
  const shouldQueue = Boolean(settings.syncServerUrl);

  await db.transaction("rw", db.subscriptions, db.syncQueue, async () => {
    await db.subscriptions.add(subscription);
    if (shouldQueue) {
      await queueSubscribeAction({ feedUrl: url });
    }
  });

  // Log subscription event for stats
  await logEvent("subscription_added", { feedUrl: url });

  if (shouldQueue) {
    await requestBackgroundSync();
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
  // The subscription deletion, play status cleanup, and queue insert must stay atomic
  // (see issue #65): if the queue insert fails, the deletions must roll back too.
  const settings = await getSettings();
  const shouldQueue = Boolean(settings.syncServerUrl);

  await db.transaction("rw", db.subscriptions, db.playStatuses, db.syncQueue, async () => {
    await db.subscriptions.delete(url);
    await db.playStatuses.where("feedUrl").equals(url).delete();
    if (shouldQueue) {
      await queueUnsubscribeAction({ feedUrl: url });
    }
  });

  await invalidateFeedCache(url);

  // Log subscription event for stats
  await logEvent("subscription_removed", { feedUrl: url });

  if (shouldQueue) {
    await requestBackgroundSync();
  }
};

export const hasSubscription = async (url: string): Promise<boolean> => {
  const count = await db.subscriptions.where("url").equals(url).count();
  return count > 0;
};
