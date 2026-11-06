import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Episode } from "../../types";
import { EpisodeList } from "./EpisodeList";

vi.mock("../../contexts", () => ({
  usePlayer: () => ({ currentEpisode: null, isPlaying: false, play: vi.fn(), togglePlay: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr" } }),
}));
vi.mock("../ui/DownloadButton", () => ({ DownloadButton: () => null }));

const episode: Episode = {
  title: "Ep 1",
  description: "",
  descriptionPreview: "",
  pubDate: "",
  enclosureUrl: "https://ex.com/1.mp3",
  duration: "",
  image: "https://ex.com/dead-episode.jpg",
  feedImage: "https://ex.com/show.jpg",
  guid: "1",
};

// #108: an episode whose own artwork fails falls back to the show artwork.
describe("EpisodeList artwork", () => {
  it("shows the show artwork when the episode image fails to load", () => {
    render(<EpisodeList episodes={[episode]} feedUrl="https://ex.com/feed.xml" />);
    const img = screen.getByRole("img", { name: "Ep 1" });
    expect(img).toHaveAttribute("src", "https://ex.com/dead-episode.jpg");

    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Ep 1" })).toHaveAttribute(
      "src",
      "https://ex.com/show.jpg",
    );
  });
});
