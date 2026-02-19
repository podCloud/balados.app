import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../services/storage";
import type { PodcastLike } from "../types";

interface UseLikeReturn {
  isLiked: boolean;
  toggleLike: () => Promise<void>;
  isLoading: boolean;
  /** Delta to apply to server count for optimistic display: -1, 0, or +1 */
  likeDelta: number;
}

export const useLike = (feedUrl: string): UseLikeReturn => {
  const [isLoading, setIsLoading] = useState(false);

  // useLiveQuery returns undefined while the DB query is loading
  const like = useLiveQuery(() => db.likes.get(feedUrl), [feedUrl]);
  const isInitializing = like === undefined;

  const isLiked = like != null;

  // Track whether the user had liked this podcast when the DB first loaded,
  // so we can compute a correct optimistic delta (server count already includes existing likes)
  const likedAtLoad = useRef<boolean | null>(null);
  useEffect(() => {
    likedAtLoad.current = null;
  }, [feedUrl]);
  if (!isInitializing && likedAtLoad.current === null) {
    likedAtLoad.current = isLiked;
  }

  const likeDelta = isInitializing ? 0 : (isLiked ? 1 : 0) - (likedAtLoad.current ? 1 : 0);

  const toggleLike = useCallback(async () => {
    if (isInitializing) return;
    setIsLoading(true);
    try {
      if (isLiked) {
        await db.likes.delete(feedUrl);
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
        await db.syncQueue.add({
          action: "likePodcast",
          payload: { feedUrl },
          createdAt: Date.now(),
          attempts: 0,
        });
      }
    } catch (error) {
      console.error("[useLike] Failed to toggle like:", error);
    } finally {
      setIsLoading(false);
    }
  }, [feedUrl, isLiked, isInitializing]);

  return { isLiked, toggleLike, isLoading: isLoading || isInitializing, likeDelta };
};
