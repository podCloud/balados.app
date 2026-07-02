import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock("../../contexts", () => ({
  usePlayer: () => ({ play: vi.fn(), currentEpisode: null, isPlaying: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "listeningHistory.title": "Listening History",
        "listeningHistory.empty": "No listening history yet",
        "listeningHistory.totalTime": "Total time",
        "listeningHistory.totalEpisodes": "Episodes",
        "listeningHistory.completed": "Completed",
        "listeningHistory.streak": "Streak",
        "listeningHistory.status.completed": "Completed",
        "listeningHistory.status.inProgress": "In progress",
        "listeningHistory.status.notStarted": "Not started",
        "settings.back": "Back",
        "common.loading": "Loading",
        "syncSettings.minutesAgo": "{{count}} minute ago",
        "syncSettings.hoursAgo": "{{count}} hour ago",
        "syncSettings.daysAgo": "{{count}} day ago",
        "syncSettings.justNow": "Just now",
      };
      return translations[key] ?? `${key}${opts?.count !== undefined ? `:${opts.count}` : ""}`;
    },
  }),
}));

vi.mock("../../utils/rssEncoding", () => ({
  generateEpisodeId: vi.fn((guid: string | undefined, enclosureUrl: string) => {
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

describe("ListeningHistory", () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset();
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });
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
      expect(screen.getByText("unreachable.com")).toBeInTheDocument();
    });
  });
});
