import type { PlayStatus } from "../types";

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
