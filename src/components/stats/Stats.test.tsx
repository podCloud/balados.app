import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Stats } from "./Stats";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "stats.title": "Statistics",
        "stats.today": "Today",
        "stats.week": "This week",
        "stats.month": "This month",
        "stats.allTime": "All time",
        "stats.totalPlays": "Total plays",
        "stats.completed": "Completed",
        "stats.topPodcasts": "Top Podcasts",
        "stats.plays": `${opts?.count} plays`,
        "stats.recentActivity": "Recent Activity",
        "stats.noActivity": "No activity yet",
        "stats.noData": "Start listening to see your stats",
        "stats.playStarted": "Play started",
        "stats.playCompleted": "Play completed",
        "stats.playPaused": "Play paused",
        "stats.added": "Subscription added",
        "stats.removed": "Subscription removed",
        "common.loading": "Loading...",
        "common.error": "An error occurred",
        "syncSettings.justNow": "Just now",
        "syncSettings.minutesAgo": `${opts?.count} min ago`,
        "syncSettings.hoursAgo": `${opts?.count}h ago`,
        "syncSettings.daysAgo": `${opts?.count}d ago`,
      };
      return translations[key] || key;
    },
  }),
}));

// Mock storage services
const mockGetListeningStats = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("../../services/storage/events", () => ({
  getListeningStats: (...args: unknown[]) => mockGetListeningStats(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
}));

const mockGetSubscription = vi.fn();

vi.mock("../../services/storage/subscriptions", () => ({
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
}));

describe("Stats", () => {
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetListeningStats.mockResolvedValue({
      totalPlays: 42,
      completedPlays: 15,
      topPodcasts: [],
    });
    mockGetEvents.mockResolvedValue([]);
    mockGetSubscription.mockResolvedValue(null);
  });

  it("renders the header with title and back button", async () => {
    render(<Stats onBack={onBack} />);

    expect(screen.getByText("Statistics")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  it("calls onBack when back button is clicked", () => {
    render(<Stats onBack={onBack} />);

    const backButton = screen.getByRole("button", { name: "settings.back" });
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalled();
  });

  it("shows loading state initially", () => {
    render(<Stats onBack={onBack} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows total plays and completed stats", async () => {
    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    expect(screen.getByText("Total plays")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders period selector buttons", async () => {
    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("changes period when clicking period button", async () => {
    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    const callsBefore = mockGetListeningStats.mock.calls.length;
    fireEvent.click(screen.getByText("Today"));

    // getListeningStats should be called again with new period
    await waitFor(() => {
      expect(mockGetListeningStats.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("shows top podcasts when available", async () => {
    mockGetSubscription.mockImplementation(async (url: string) => {
      if (url === "https://example.com/feed1.xml") return { title: "Podcast Alpha", url };
      if (url === "https://example.com/feed2.xml") return { title: "Podcast Beta", url };
      return null;
    });

    mockGetListeningStats.mockResolvedValue({
      totalPlays: 10,
      completedPlays: 5,
      topPodcasts: [
        { feedUrl: "https://example.com/feed1.xml", count: 8 },
        { feedUrl: "https://example.com/feed2.xml", count: 3 },
      ],
    });

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("Podcast Alpha")).toBeInTheDocument();
    });

    expect(screen.getByText("Top Podcasts")).toBeInTheDocument();
    expect(screen.getByText("Podcast Beta")).toBeInTheDocument();
    expect(screen.getByText("8 plays")).toBeInTheDocument();
    expect(screen.getByText("3 plays")).toBeInTheDocument();
  });

  it("uses hostname fallback when subscription has no title", async () => {
    mockGetListeningStats.mockResolvedValue({
      totalPlays: 5,
      completedPlays: 2,
      topPodcasts: [
        { feedUrl: "https://podcast.example.com/rss", count: 5 },
      ],
    });

    mockGetSubscription.mockResolvedValue(null);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("podcast.example.com")).toBeInTheDocument();
    });
  });

  it("shows recent activity with events", async () => {
    mockGetEvents.mockResolvedValue([
      {
        id: 1,
        type: "play_started",
        feedUrl: "https://example.com/feed.xml",
        episodeId: "ep-1",
        timestamp: Date.now() - 5000,
      },
      {
        id: 2,
        type: "play_completed",
        feedUrl: "https://example.com/feed.xml",
        episodeId: "ep-1",
        timestamp: Date.now() - 60000,
      },
    ]);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });

    expect(screen.getByText("Play started")).toBeInTheDocument();
    expect(screen.getByText("Play completed")).toBeInTheDocument();
  });

  it("shows 'no activity' when no recent events", async () => {
    mockGetListeningStats.mockResolvedValue({
      totalPlays: 0,
      completedPlays: 0,
      topPodcasts: [],
    });
    mockGetEvents.mockResolvedValue([]);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("No activity yet")).toBeInTheDocument();
    });
  });

  it("shows empty state when no plays and no events", async () => {
    mockGetListeningStats.mockResolvedValue({
      totalPlays: 0,
      completedPlays: 0,
      topPodcasts: [],
    });
    mockGetEvents.mockResolvedValue([]);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(
        screen.getByText("Start listening to see your stats")
      ).toBeInTheDocument();
    });
  });

  it("shows error state when loading fails", async () => {
    mockGetListeningStats.mockRejectedValue(new Error("DB error"));

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("An error occurred")).toBeInTheDocument();
    });
  });

  it("displays relative timestamps for events", async () => {
    mockGetEvents.mockResolvedValue([
      {
        id: 1,
        type: "subscription_added",
        feedUrl: "https://example.com/feed.xml",
        timestamp: Date.now() - 500, // less than a minute
      },
    ]);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });
  });

  it("maps event types to correct labels", async () => {
    mockGetEvents.mockResolvedValue([
      { id: 1, type: "play_paused", timestamp: Date.now() - 1000 },
      { id: 2, type: "subscription_added", timestamp: Date.now() - 2000 },
      { id: 3, type: "subscription_removed", timestamp: Date.now() - 3000 },
    ]);

    render(<Stats onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("Play paused")).toBeInTheDocument();
      expect(screen.getByText("Subscription added")).toBeInTheDocument();
      expect(screen.getByText("Subscription removed")).toBeInTheDocument();
    });
  });
});
