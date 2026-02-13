import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./index";
import {
  getHiddenEpisodeIds,
  hideEpisode,
  unhideEpisode,
  isEpisodeHidden,
  clearHiddenEpisodes,
} from "./hiddenEpisodes";

describe("hiddenEpisodes", () => {
  beforeEach(async () => {
    await db.hiddenEpisodes.clear();
  });

  describe("hideEpisode", () => {
    it("stores an entry with episodeId and hiddenAt", async () => {
      await hideEpisode("ep-1");

      const entry = await db.hiddenEpisodes.get("ep-1");
      expect(entry).toBeDefined();
      expect(entry?.episodeId).toBe("ep-1");
      expect(entry?.hiddenAt).toBeGreaterThan(0);
    });

    it("overwrites existing entry without error", async () => {
      await hideEpisode("ep-1");
      await hideEpisode("ep-1");

      const count = await db.hiddenEpisodes.count();
      expect(count).toBe(1);
    });
  });

  describe("getHiddenEpisodeIds", () => {
    it("returns empty set when no episodes are hidden", async () => {
      const hidden = await getHiddenEpisodeIds();
      expect(hidden.size).toBe(0);
    });

    it("returns a Set of all hidden IDs", async () => {
      await hideEpisode("ep-1");
      await hideEpisode("ep-2");
      await hideEpisode("ep-3");

      const hidden = await getHiddenEpisodeIds();
      expect(hidden.size).toBe(3);
      expect(hidden.has("ep-1")).toBe(true);
      expect(hidden.has("ep-2")).toBe(true);
      expect(hidden.has("ep-3")).toBe(true);
    });
  });

  describe("isEpisodeHidden", () => {
    it("returns true for hidden episode", async () => {
      await hideEpisode("ep-1");
      expect(await isEpisodeHidden("ep-1")).toBe(true);
    });

    it("returns false for non-hidden episode", async () => {
      expect(await isEpisodeHidden("ep-1")).toBe(false);
    });
  });

  describe("unhideEpisode", () => {
    it("removes the entry", async () => {
      await hideEpisode("ep-1");
      await hideEpisode("ep-2");

      await unhideEpisode("ep-1");

      expect(await isEpisodeHidden("ep-1")).toBe(false);
      expect(await isEpisodeHidden("ep-2")).toBe(true);
    });

    it("does nothing for non-existent episode", async () => {
      await unhideEpisode("non-existent");
      const count = await db.hiddenEpisodes.count();
      expect(count).toBe(0);
    });
  });

  describe("clearHiddenEpisodes", () => {
    it("empties the table", async () => {
      await hideEpisode("ep-1");
      await hideEpisode("ep-2");
      await hideEpisode("ep-3");

      await clearHiddenEpisodes();

      const hidden = await getHiddenEpisodeIds();
      expect(hidden.size).toBe(0);
    });
  });
});
