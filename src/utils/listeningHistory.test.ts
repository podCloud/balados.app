import { describe, expect, it } from "vitest";
import type { PlayStatus } from "../types";
import { getEpisodeStatus } from "./listeningHistory";

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
