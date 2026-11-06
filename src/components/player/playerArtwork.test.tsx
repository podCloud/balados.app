import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Episode } from "../../types";
import { EpisodePlayer } from "./EpisodePlayer";
import { MiniPlayer } from "./MiniPlayer";

const episode: Episode = {
  title: "Ep 1",
  description: "",
  descriptionPreview: "",
  pubDate: "",
  enclosureUrl: "https://ex.com/1.mp3",
  duration: "",
  image: "https://ex.com/dead-episode.jpg",
  feedImage: "https://ex.com/dead-show.jpg",
  feedImageFallback: "https://ex.com/rss-logo.png",
  guid: "1",
};

vi.mock("../../contexts", () => ({
  usePlayer: () => ({
    currentEpisode: episode,
    feedUrl: "https://ex.com/feed.xml",
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../ui/DownloadButton", () => ({ DownloadButton: () => null }));
vi.mock("./PlayerControls", () => ({ PlayerControls: () => null }));

const failAll = (container: HTMLElement) => {
  for (let i = 0; i < 2; i++) {
    const img = container.querySelector("img");
    if (img) fireEvent.error(img);
  }
  return container.querySelector("img");
};

// #108: both players walk episode image -> show itunes:image -> show RSS image.
describe("player artwork fallbacks", () => {
  it("MiniPlayer ends on the show's RSS image", () => {
    const { container } = render(<MiniPlayer onExpand={vi.fn()} />);
    expect(failAll(container)).toHaveAttribute("src", "https://ex.com/rss-logo.png");
  });

  it("EpisodePlayer ends on the show's RSS image", () => {
    render(<EpisodePlayer />);
    const img = screen.getByRole("img", { name: "Ep 1" });
    fireEvent.error(img);
    fireEvent.error(screen.getByRole("img", { name: "Ep 1" }));
    expect(screen.getByRole("img", { name: "Ep 1" })).toHaveAttribute(
      "src",
      "https://ex.com/rss-logo.png",
    );
  });
});
