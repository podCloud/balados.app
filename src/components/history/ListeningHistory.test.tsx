import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockPlay = vi.fn();
vi.mock("../../contexts", () => ({
  usePlayer: () => ({ play: mockPlay, currentEpisode: null, isPlaying: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "listeningHistory.pageOf" && opts) {
        return (
          mockTranslations[key]
            ?.replace("{{page}}", String(opts.page))
            .replace("{{total}}", String(opts.total)) ?? key
        );
      }
      // Handle pluralization for episodeCount
      if (key === "listeningHistory.episodeCount" && opts?.count) {
        const pluralKey = opts.count === 1 ? key : `${key}_other`;
        const template = mockTranslations[pluralKey] ?? mockTranslations[key];
        return template?.replace("{{count}}", String(opts.count)) ?? key;
      }
      return mockTranslations[key] ?? `${key}${opts?.count !== undefined ? `:${opts.count}` : ""}`;
    },
  }),
}));

vi.mock("../../utils/rssEncoding", () => ({
  generateEpisodeId: vi.fn((_guid: string | undefined, enclosureUrl: string) => {
    // Return predictable IDs for testing
    if (enclosureUrl === "https://x.com/ep1.mp3") return "ep-1";
    if (enclosureUrl === "https://unreachable.com/ep1.mp3") return "ep-unreachable";
    return `ep-${enclosureUrl}`;
  }),
}));

import { ListeningHistory } from "./ListeningHistory";

const setLiveQueryData = (playStatuses: unknown, subscriptions: unknown = []) => {
  mockUseLiveQuery.mockImplementation((fn: () => unknown) => {
    const source = fn.toString();
    if (source.includes("getAllPlayStatuses")) return playStatuses;
    return subscriptions;
  });
};

const mockTranslations: Record<string, string> = {
  "listeningHistory.title": "Listening History",
  "listeningHistory.empty": "No listening history yet",
  "listeningHistory.totalTime": "Total time",
  "listeningHistory.totalEpisodes": "Episodes",
  "listeningHistory.completed": "Completed",
  "listeningHistory.streak": "Streak",
  "listeningHistory.status.completed": "Completed",
  "listeningHistory.status.inProgress": "In progress",
  "listeningHistory.status.notStarted": "Not started",
  "listeningHistory.filter.allPodcasts": "All podcasts",
  "listeningHistory.filter.allPeriods": "All time",
  "listeningHistory.filter.week": "Week",
  "listeningHistory.filter.month": "Month",
  "listeningHistory.filter.year": "Year",
  "listeningHistory.filter.allStatuses": "All",
  "listeningHistory.noResults": "No results for these filters",
  "listeningHistory.pageOf": "Page {{page}} of {{total}}",
  "listeningHistory.topPodcasts": "Top podcasts",
  "listeningHistory.episodeCount": "{{count}} episode",
  "listeningHistory.episodeCount_other": "{{count}} episodes",
  "settings.back": "Back",
  "common.loading": "Loading",
  "common.previous": "Previous",
  "common.next": "Next",
  "syncSettings.minutesAgo": "{{count}} minute ago",
  "syncSettings.hoursAgo": "{{count}} hour ago",
  "syncSettings.daysAgo": "{{count}} day ago",
  "syncSettings.justNow": "Just now",
};

describe("ListeningHistory", () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset();
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });
    mockPlay.mockReset();
  });

  it("renders the page title", () => {
    setLiveQueryData([]);
    render(<ListeningHistory onBack={vi.fn()} />);
    expect(screen.getByText("Listening History")).toBeInTheDocument();
  });

  it("shows the empty state when there is no history", async () => {
    setLiveQueryData([]);
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("No listening history yet")).toBeInTheDocument();
    });
  });

  it("calls onBack when the back button is clicked", () => {
    setLiveQueryData([]);
    const onBack = vi.fn();
    render(<ListeningHistory onBack={onBack} />);
    screen.getByLabelText("Back").click();
    expect(onBack).toHaveBeenCalled();
  });

  it("renders stats computed from play statuses", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 120,
          duration: 1000,
          completed: true,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Streak")).toBeInTheDocument();
    });
  });

  it("renders an episode card with title and progress from the fetched feed", async () => {
    const playStatus = {
      episodeId: "ep-1",
      feedUrl: "https://x.com/f",
      position: 300,
      duration: 1000,
      completed: false,
      updatedAt: Date.now(),
    };
    setLiveQueryData([playStatus], []);
    mockUseQuery.mockReturnValue({
      data: new Map([
        [
          "https://x.com/f",
          {
            title: "Feed X",
            description: "",
            image: "https://x.com/cover.jpg",
            url: "https://x.com/f",
            items: [
              {
                title: "Episode One",
                description: "",
                descriptionPreview: "",
                pubDate: "",
                enclosureUrl: "https://x.com/ep1.mp3",
                duration: "1000",
                image: "",
                guid: undefined,
              },
            ],
          },
        ],
      ]),
      isLoading: false,
    });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Episode One")).toBeInTheDocument();
    });
  });

  it("renders a fallback title when the feed isn't available", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "ep-1",
          feedUrl: "https://unreachable.com/f",
          position: 0,
          duration: 0,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      const historyRow = screen.getByTestId("history-row");
      expect(within(historyRow).getByText("unreachable.com")).toBeInTheDocument();
    });
  });

  it("resumes playback when a card with a resolved episode is tapped", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "ep-1",
          feedUrl: "https://x.com/f",
          position: 300,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    mockUseQuery.mockReturnValue({
      data: new Map([
        [
          "https://x.com/f",
          {
            title: "Feed X",
            description: "",
            image: "",
            url: "https://x.com/f",
            items: [
              {
                title: "Episode One",
                description: "",
                descriptionPreview: "",
                pubDate: "",
                enclosureUrl: "https://x.com/ep1.mp3",
                duration: "1000",
                image: "",
                guid: undefined,
              },
            ],
          },
        ],
      ]),
      isLoading: false,
    });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => screen.getByText("Episode One"));
    screen.getByTestId("history-row").click();

    expect(mockPlay).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Episode One" }),
      "https://x.com/f",
    );
  });

  it("does not play when a card with an unresolved episode is tapped (no-op guard)", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "ep-unreachable",
          feedUrl: "https://unreachable.com/f",
          position: 0,
          duration: 0,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      const historyRow = screen.getByTestId("history-row");
      expect(within(historyRow).getByText("unreachable.com")).toBeInTheDocument();
    });

    screen.getByTestId("history-row").click();

    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("filters the list by status", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 0,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
        {
          episodeId: "b",
          feedUrl: "https://x.com/f",
          position: 500,
          duration: 1000,
          completed: true,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByTestId("history-row")).toHaveLength(2));
    screen.getByRole("button", { name: "Completed" }).click();

    await waitFor(() => {
      expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    });
  });

  it("shows a distinct empty state when filters exclude every entry", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 0,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("history-row")).toHaveLength(1));

    screen.getByRole("button", { name: "Completed" }).click();

    await waitFor(() => {
      expect(screen.getByText("No results for these filters")).toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("does not show pagination controls when there are fewer than 50 entries", async () => {
      // Create 30 entries (less than PAGE_SIZE)
      const playStatuses = Array.from({ length: 30 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(30);
      });

      // Verify pagination controls are not rendered
      expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    });

    it("shows pagination controls when there are more than 50 entries", async () => {
      // Create 55 entries (more than PAGE_SIZE)
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      // Verify pagination controls are shown
      expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    it("disables Previous button on first page", async () => {
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      const prevButton = screen.getByRole("button", { name: "Previous" });
      expect(prevButton).toBeDisabled();
    });

    it("disables Next button on last page", async () => {
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      // Navigate to last page
      const nextButton = screen.getByRole("button", { name: "Next" });
      expect(nextButton).not.toBeDisabled();

      nextButton.click();

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
      });

      const nextButtonOnLastPage = screen.getByRole("button", { name: "Next" });
      expect(nextButtonOnLastPage).toBeDisabled();
    });

    it("navigates to the next page and shows remaining items", async () => {
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

      // Click Next button
      screen.getByRole("button", { name: "Next" }).click();

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
      });

      // Should show only 5 items on page 2
      expect(screen.getAllByTestId("history-row")).toHaveLength(5);
    });

    it("enables Previous button after navigating to the next page", async () => {
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      const prevButtonInitial = screen.getByRole("button", { name: "Previous" });
      expect(prevButtonInitial).toBeDisabled();

      // Click Next button
      screen.getByRole("button", { name: "Next" }).click();

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
      });

      const prevButtonOnPage2 = screen.getByRole("button", { name: "Previous" });
      expect(prevButtonOnPage2).not.toBeDisabled();
    });

    it("navigates back to the previous page", async () => {
      const playStatuses = Array.from({ length: 55 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: 0,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      // Navigate to page 2
      screen.getByRole("button", { name: "Next" }).click();

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
      });

      // Navigate back to page 1
      screen.getByRole("button", { name: "Previous" }).click();

      await waitFor(() => {
        expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      });

      // Should show 50 items again
      expect(screen.getAllByTestId("history-row")).toHaveLength(50);
    });

    it("resets pagination to page 1 when filters change", async () => {
      // Create 105 entries so filtering to completed still has > 50 items
      const playStatuses = Array.from({ length: 105 }, (_, i) => ({
        episodeId: `ep-${i}`,
        feedUrl: "https://x.com/f",
        position: i % 2 === 0 ? 0 : 500,
        duration: 1000,
        completed: i % 2 !== 0,
        updatedAt: Date.now() - i * 1000,
      }));

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByTestId("history-row")).toHaveLength(50);
      });

      // Navigate to page 2
      screen.getByRole("button", { name: "Next" }).click();

      await waitFor(() => {
        expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
      });

      // Apply a filter (completed status - results in ~52 items, still > 50)
      screen.getByRole("button", { name: "Completed" }).click();

      await waitFor(() => {
        // Should reset to page 1 with the filtered results
        expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      });
    });
  });

  describe("top podcasts section (Finding 1)", () => {
    it("renders top podcasts section when multiple feeds have play history", async () => {
      // Create play statuses across 3 different feeds with different counts
      const playStatuses = [
        // Feed 1: 5 episodes
        ...Array.from({ length: 5 }, (_, i) => ({
          episodeId: `feed1-ep-${i}`,
          feedUrl: "https://feed1.com/rss",
          position: 100,
          duration: 1000,
          completed: i < 3,
          updatedAt: Date.now() - i * 1000,
        })),
        // Feed 2: 3 episodes
        ...Array.from({ length: 3 }, (_, i) => ({
          episodeId: `feed2-ep-${i}`,
          feedUrl: "https://feed2.com/rss",
          position: 100,
          duration: 1000,
          completed: i < 2,
          updatedAt: Date.now() - (i + 5) * 1000,
        })),
        // Feed 3: 2 episodes
        ...Array.from({ length: 2 }, (_, i) => ({
          episodeId: `feed3-ep-${i}`,
          feedUrl: "https://feed3.com/rss",
          position: 100,
          duration: 1000,
          completed: false,
          updatedAt: Date.now() - (i + 8) * 1000,
        })),
      ];

      // Create subscriptions for these feeds
      const subscriptions = [
        { url: "https://feed1.com/rss", title: "Feed One" },
        { url: "https://feed2.com/rss", title: "Feed Two" },
        { url: "https://feed3.com/rss", title: "Feed Three" },
      ];

      setLiveQueryData(playStatuses, subscriptions);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        // Should render the top podcasts header
        expect(screen.getByText("Top podcasts")).toBeInTheDocument();
      });

      // Check that the counts are displayed (5, 3, 2 episodes)
      // These strings should only appear in the top podcasts section
      expect(screen.getByText("5 episodes")).toBeInTheDocument();
      expect(screen.getByText("3 episodes")).toBeInTheDocument();
      expect(screen.getByText("2 episodes")).toBeInTheDocument();
    });

    it("does not render top podcasts section when no play history exists", async () => {
      setLiveQueryData([]);
      render(<ListeningHistory onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("No listening history yet")).toBeInTheDocument();
      });

      expect(screen.queryByText("Top podcasts")).not.toBeInTheDocument();
    });
  });

  describe("stats visibility when filters exclude results (Finding 2)", () => {
    it("keeps stat cards visible when filters exclude all results", async () => {
      // Create play statuses: some completed, some not
      const playStatuses = [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 0,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
        {
          episodeId: "b",
          feedUrl: "https://x.com/f",
          position: 500,
          duration: 1000,
          completed: false,
          updatedAt: Date.now() - 1000,
        },
      ];

      setLiveQueryData(playStatuses, []);
      render(<ListeningHistory onBack={vi.fn()} />);

      // Initially should show stats and episodes
      await waitFor(() => {
        expect(screen.getByText("Total time")).toBeInTheDocument();
        expect(screen.getAllByTestId("history-row")).toHaveLength(2);
      });

      // Click "Completed" filter (no completed episodes, so filtered will be empty)
      screen.getByRole("button", { name: "Completed" }).click();

      await waitFor(() => {
        expect(screen.getByText("No results for these filters")).toBeInTheDocument();
      });

      // CRITICAL: stat cards must still be visible
      // Check for the stat card labels which appear in the grid
      const totalTimeLabel = screen.getByText("Total time");
      const episodesLabel = screen.getByText("Episodes");
      const streakLabel = screen.getByText("Streak");

      expect(totalTimeLabel).toBeInTheDocument();
      expect(episodesLabel).toBeInTheDocument();
      expect(streakLabel).toBeInTheDocument();

      // Episode list should not be visible (no items after filter)
      expect(screen.queryAllByTestId("history-row")).toHaveLength(0);
    });
  });
});
