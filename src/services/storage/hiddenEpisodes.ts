/**
 * Utility for managing hidden in-progress episodes.
 * Hidden episodes are stored in localStorage to persist across sessions.
 */

const HIDDEN_KEY = "hidden_in_progress_episodes";

/**
 * Get the set of hidden episode IDs from localStorage.
 */
export const getHiddenEpisodes = (): Set<string> => {
  try {
    const stored = localStorage.getItem(HIDDEN_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

/**
 * Hide an episode by adding its ID to the hidden set.
 */
export const hideEpisode = (episodeId: string): void => {
  const hidden = getHiddenEpisodes();
  hidden.add(episodeId);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
};

/**
 * Unhide an episode by removing its ID from the hidden set.
 */
export const unhideEpisode = (episodeId: string): void => {
  const hidden = getHiddenEpisodes();
  hidden.delete(episodeId);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
};

/**
 * Check if an episode is hidden.
 */
export const isEpisodeHidden = (episodeId: string): boolean => {
  return getHiddenEpisodes().has(episodeId);
};

/**
 * Clear all hidden episodes.
 */
export const clearHiddenEpisodes = (): void => {
  localStorage.removeItem(HIDDEN_KEY);
};
