import type { PlayStatus } from "../types";

export type HistoryStatus = "completed" | "inProgress" | "notStarted";

export const getEpisodeStatus = (ps: PlayStatus): HistoryStatus => {
  if (ps.completed) return "completed";
  if (ps.position > 0) return "inProgress";
  return "notStarted";
};
