import { describe, expect, it } from "vitest";
import type { PlayStatus } from "../types";
import { getEpisodeStatus, isWithinPeriod } from "./listeningHistory";

const basePlayStatus: PlayStatus = {
  episodeId: "ep1",
  feedUrl: "https://example.com/feed.xml",
  position: 0,
  duration: 1000,
  completed: false,
  updatedAt: Date.now(),
};

describe("getEpisodeStatus", () => {
  it("returns completed when completed is true", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: true, position: 500 })).toBe(
      "completed",
    );
  });

  it("returns inProgress when not completed and position > 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 100 })).toBe(
      "inProgress",
    );
  });

  it("returns notStarted when not completed and position is 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 0 })).toBe(
      "notStarted",
    );
  });
});

describe("isWithinPeriod", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000_000_000_000;

  it("passes everything through when period is empty", () => {
    expect(isWithinPeriod(now - 1000 * DAY, "", now)).toBe(true);
  });

  it("includes a timestamp exactly at the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY, "week", now)).toBe(true);
  });

  it("excludes a timestamp just past the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY - 1, "week", now)).toBe(false);
  });

  it("includes a timestamp within the month window", () => {
    expect(isWithinPeriod(now - 15 * DAY, "month", now)).toBe(true);
  });

  it("excludes a timestamp past the month window", () => {
    expect(isWithinPeriod(now - 31 * DAY, "month", now)).toBe(false);
  });

  it("includes a timestamp within the year window", () => {
    expect(isWithinPeriod(now - 200 * DAY, "year", now)).toBe(true);
  });

  it("excludes a timestamp past the year window", () => {
    expect(isWithinPeriod(now - 366 * DAY, "year", now)).toBe(false);
  });
});
