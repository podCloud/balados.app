import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../services/storage";
import type { TrendingPodcast } from "../services/sync/client";
import { SyncClient } from "../services/sync/client";

export const DEFAULT_SYNC_URL = import.meta.env.VITE_DEFAULT_SYNC_URL || "https://sync.balados.app";

export function useTrending() {
  const settings = useLiveQuery(() => db.settings.get("app"));
  const settingsLoaded = settings !== undefined;
  const serverUrl = settings?.syncServerUrl || DEFAULT_SYNC_URL;

  return useQuery({
    queryKey: ["trending", serverUrl],
    queryFn: async (): Promise<TrendingPodcast[]> => {
      const client = new SyncClient(serverUrl);
      const response = await client.getTrending();
      return response.podcasts;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: settingsLoaded,
  });
}
