import { db } from "./index";

export const getHiddenEpisodeIds = async (): Promise<Set<string>> => {
  const all = await db.hiddenEpisodes.toArray();
  return new Set(all.map((h) => h.episodeId));
};

export const hideEpisode = async (episodeId: string): Promise<void> => {
  await db.hiddenEpisodes.put({ episodeId, hiddenAt: Date.now() });
};

export const unhideEpisode = async (episodeId: string): Promise<void> => {
  await db.hiddenEpisodes.delete(episodeId);
};

export const isEpisodeHidden = async (
  episodeId: string,
): Promise<boolean> => {
  return (await db.hiddenEpisodes.get(episodeId)) !== undefined;
};

export const clearHiddenEpisodes = async (): Promise<void> => {
  await db.hiddenEpisodes.clear();
};
