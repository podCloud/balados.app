import type { PlayStatus, Subscription } from "../types";
import { getFallbackTitle } from "./formatting";

export type HistoryStatus = "completed" | "inProgress" | "notStarted";

export const getEpisodeStatus = (ps: PlayStatus): HistoryStatus => {
  if (ps.completed) return "completed";
  if (ps.position > 0) return "inProgress";
  return "notStarted";
};

export type Period = "week" | "month" | "year" | "";

const PERIOD_DAYS: Record<Exclude<Period, "">, number> = { week: 7, month: 30, year: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

export const isWithinPeriod = (updatedAt: number, period: Period, now: number): boolean => {
  if (!period) return true;
  const cutoff = now - PERIOD_DAYS[period] * DAY_MS;
  return updatedAt >= cutoff;
};

export interface HistoryFilters {
  feedUrl: string; // "" = all
  period: Period; // "" = all
  status: HistoryStatus | ""; // "" = all
}

export const filterPlayStatuses = (
  all: PlayStatus[],
  filters: HistoryFilters,
  now: number,
): PlayStatus[] =>
  all
    .filter((ps) => !filters.feedUrl || ps.feedUrl === filters.feedUrl)
    .filter((ps) => isWithinPeriod(ps.updatedAt, filters.period, now))
    .filter((ps) => !filters.status || getEpisodeStatus(ps) === filters.status)
    .sort((a, b) => b.updatedAt - a.updatedAt);

export interface ListeningStats {
  totalTimeSeconds: number;
  totalEpisodes: number;
  completedCount: number;
  topPodcasts: Array<{ feedUrl: string; title: string; count: number }>;
}

export const computeListeningStats = (
  all: PlayStatus[],
  subscriptions: Subscription[],
): ListeningStats => {
  const totalTimeSeconds = all.reduce((sum, ps) => sum + ps.position, 0);
  const completedCount = all.filter((ps) => ps.completed).length;

  const subsByUrl = new Map(subscriptions.map((s) => [s.url, s]));
  const countsByFeed = new Map<string, number>();
  for (const ps of all) {
    countsByFeed.set(ps.feedUrl, (countsByFeed.get(ps.feedUrl) ?? 0) + 1);
  }

  const topPodcasts = [...countsByFeed.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([feedUrl, count]) => ({
      feedUrl,
      title: subsByUrl.get(feedUrl)?.title || getFallbackTitle(feedUrl),
      count,
    }));

  return {
    totalTimeSeconds,
    totalEpisodes: all.length,
    completedCount,
    topPodcasts,
  };
};
