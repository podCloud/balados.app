import { useQuery } from "@tanstack/react-query";
import { SyncClient } from "../services/sync/client";
import { getSettings } from "../services/storage";
import type { TrendingPodcast } from "../services/sync/client";

const DEFAULT_SYNC_URL = "https://sync.balados.app";

async function getServerUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.syncServerUrl || DEFAULT_SYNC_URL;
}

async function fetchTrending(): Promise<TrendingPodcast[]> {
  const serverUrl = await getServerUrl();
  const client = new SyncClient(serverUrl);
  const response = await client.getTrending();
  return response.podcasts;
}

export function useTrending() {
  return useQuery({
    queryKey: ["trending"],
    queryFn: fetchTrending,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
