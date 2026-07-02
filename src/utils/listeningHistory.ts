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

// Local calendar day, as a comparable integer key (year*10000 + month*100 + day).
const dayKey = (timestamp: number): number => {
  const d = new Date(timestamp);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// Whole-day difference between two dayKey values, computed via real Date
// objects at local midnight so DST transitions don't skew the count.
const daysBetween = (a: number, b: number): number => {
  const toDate = (key: number) =>
    new Date(Math.floor(key / 10000), Math.floor((key % 10000) / 100) - 1, key % 100);
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);
};

export const computeStreak = (all: PlayStatus[], now: number): number => {
  const dates = [...new Set(all.map((ps) => dayKey(ps.updatedAt)))].sort((a, b) => b - a);
  if (dates.length === 0) return 0;

  const today = dayKey(now);
  if (daysBetween(today, dates[0]) > 1) return 0; // no activity today or yesterday

  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    if (daysBetween(dates[i], dates[i + 1]) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};
