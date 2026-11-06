import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PodcastFeed } from "../../types";
import { SubscriptionItem } from "./SubscriptionItem";

const feed: PodcastFeed = {
  title: "Show",
  description: "",
  image: "https://ex.com/dead-itunes.jpg",
  imageFallback: "https://ex.com/rss-logo.png",
  items: [],
  url: "https://ex.com/feed.xml",
};

vi.mock("../../services/rss/parser", () => ({ fetchAndParseRSS: vi.fn(async () => feed) }));
vi.mock("../../services/storage/subscriptions", () => ({ removeSubscription: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// #108: when itunes:image is dead, the library falls back to the RSS <image>.
describe("SubscriptionItem artwork", () => {
  it("shows the RSS image when the itunes:image fails to load", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SubscriptionItem url="https://ex.com/feed.xml" onNavigate={vi.fn()} />
      </QueryClientProvider>,
    );
    const img = await screen.findByRole("img", { name: "Show" });
    expect(img).toHaveAttribute("src", "https://ex.com/dead-itunes.jpg");

    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Show" })).toHaveAttribute(
      "src",
      "https://ex.com/rss-logo.png",
    );
  });
});
