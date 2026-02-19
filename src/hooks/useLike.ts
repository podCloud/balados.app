import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { db } from "../services/storage";
import type { PodcastLike } from "../types";

interface UseLikeReturn {
  isLiked: boolean;
  toggleLike: () => Promise<void>;
  isLoading: boolean;
}

export const useLike = (feedUrl: string, _itemId?: string): UseLikeReturn => {
  const [isLoading, setIsLoading] = useState(false);

  const like = useLiveQuery(() => db.likes.get(feedUrl), [feedUrl]);

  const isLiked = like != null;

  const toggleLike = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isLiked) {
        await db.likes.delete(feedUrl);
        // Queue unlike for sync
        await db.syncQueue.add({
          action: "unlikePodcast",
          payload: { feedUrl },
          createdAt: Date.now(),
          attempts: 0,
        });
      } else {
        const newLike: PodcastLike = {
          feedUrl,
          likedAt: Date.now(),
        };
        await db.likes.put(newLike);
        // Queue like for sync
        await db.syncQueue.add({
          action: "likePodcast",
          payload: { feedUrl },
          createdAt: Date.now(),
          attempts: 0,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [feedUrl, isLiked]);

  return { isLiked, toggleLike, isLoading };
};
