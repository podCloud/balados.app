import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InProgress } from "./InProgress";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.back": "Back",
        "inProgress.title": "In Progress",
        "inProgress.empty": "No episodes in progress",
        "inProgress.hide": "Hide",
        "common.loading": "Loading...",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock player context
const mockPlay = vi.fn();
const mockPause = vi.fn();

vi.mock("../../contexts", () => ({
  usePlayer: () => ({
    play: mockPlay,
    pause: mockPause,
    currentEpisode: null,
    isPlaying: false,
  }),
}));

// Mock dexie-react-hooks
const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

// Mock React Query
const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

// Mock storage services
vi.mock("../../services/storage", () => ({
  getCachedFeed: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../services/storage/playStatus", () => ({
  getInProgressEpisodes: vi.fn().mockResolvedValue([]),
  generateEpisodeId: vi.fn((guid, enclosureUrl) => guid || enclosureUrl),
}));

const mockHideEpisode = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/storage/hiddenEpisodes", () => ({
  getHiddenEpisodeIds: vi.fn().mockResolvedValue(new Set()),
  hideEpisode: (...args: unknown[]) => mockHideEpisode(...args),
}));

vi.mock("../../services/rss/parser", () => ({
  fetchAndParseRSS: vi.fn().mockResolvedValue(null),
}));

// Mock DownloadButton
vi.mock("../ui/DownloadButton", () => ({
  DownloadButton: () => <button data-testid="download-btn">Download</button>,
}));

describe("InProgress", () => {
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLiveQuery.mockReturnValue(undefined);
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("renders the header with title and back button", () => {
    // Return empty but defined arrays so it's not "loading"
    mockUseLiveQuery
      .mockReturnValueOnce(new Set()) // hiddenEpisodes
      .mockReturnValueOnce([]); // playStatuses

    render(<InProgress onBack={onBack} />);

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back" })
    ).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", () => {
    mockUseLiveQuery
      .mockReturnValueOnce(new Set())
      .mockReturnValueOnce([]);

    render(<InProgress onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when data is not ready", () => {
    // Return undefined (not yet loaded)
    mockUseLiveQuery.mockReturnValue(undefined);

    render(<InProgress onBack={onBack} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no episodes in progress", () => {
    mockUseLiveQuery
      .mockReturnValueOnce(new Set()) // hiddenEpisodes
      .mockReturnValueOnce([]); // playStatuses (empty)

    mockUseQuery.mockReturnValue({
      data: new Map(),
      isLoading: false,
    });

    render(<InProgress onBack={onBack} />);

    expect(screen.getByText("No episodes in progress")).toBeInTheDocument();
  });

  it("renders episode list when episodes are in progress", () => {
    const playStatuses = [
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        position: 120,
        duration: 3600,
        completed: false,
        updatedAt: Date.now(),
      },
    ];

    const feedData = new Map([
      [
        "https://example.com/feed.xml",
        {
          title: "Test Podcast",
          description: "A test podcast",
          image: "https://example.com/img.jpg",
          url: "https://example.com/feed.xml",
          items: [
            {
              title: "Episode One",
              description: "First episode",
              descriptionPreview: "First episode",
              pubDate: "2024-01-01",
              enclosureUrl: "https://example.com/ep1.mp3",
              duration: "3600",
              image: "",
              guid: "ep-1",
            },
          ],
        },
      ],
    ]);

    mockUseLiveQuery
      .mockReturnValueOnce(new Set()) // hiddenEpisodes
      .mockReturnValueOnce(playStatuses); // playStatuses

    mockUseQuery.mockReturnValue({
      data: feedData,
      isLoading: false,
    });

    render(<InProgress onBack={onBack} />);

    expect(screen.getByText("Episode One")).toBeInTheDocument();
    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
  });

  it("plays episode when clicked", () => {
    const playStatuses = [
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        position: 120,
        duration: 3600,
        completed: false,
        updatedAt: Date.now(),
      },
    ];

    const episode = {
      title: "Episode One",
      description: "First episode",
      descriptionPreview: "First episode",
      pubDate: "2024-01-01",
      enclosureUrl: "https://example.com/ep1.mp3",
      duration: "3600",
      image: "",
      guid: "ep-1",
    };

    const feedData = new Map([
      [
        "https://example.com/feed.xml",
        {
          title: "Test Podcast",
          description: "A test podcast",
          image: "https://example.com/img.jpg",
          url: "https://example.com/feed.xml",
          items: [episode],
        },
      ],
    ]);

    mockUseLiveQuery
      .mockReturnValueOnce(new Set())
      .mockReturnValueOnce(playStatuses);

    mockUseQuery.mockReturnValue({
      data: feedData,
      isLoading: false,
    });

    render(<InProgress onBack={onBack} />);

    fireEvent.click(screen.getByText("Episode One"));
    expect(mockPlay).toHaveBeenCalledWith(
      episode,
      "https://example.com/feed.xml"
    );
  });

  it("hides hidden episodes from the list", () => {
    const playStatuses = [
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        position: 120,
        duration: 3600,
        completed: false,
        updatedAt: Date.now(),
      },
      {
        episodeId: "ep-hidden",
        feedUrl: "https://example.com/feed.xml",
        position: 60,
        duration: 1800,
        completed: false,
        updatedAt: Date.now(),
      },
    ];

    const feedData = new Map([
      [
        "https://example.com/feed.xml",
        {
          title: "Test Podcast",
          description: "A test podcast",
          image: "https://example.com/img.jpg",
          url: "https://example.com/feed.xml",
          items: [
            {
              title: "Visible Episode",
              description: "Visible",
              descriptionPreview: "Visible",
              pubDate: "2024-01-01",
              enclosureUrl: "https://example.com/ep1.mp3",
              duration: "3600",
              image: "",
              guid: "ep-1",
            },
            {
              title: "Hidden Episode",
              description: "Hidden",
              descriptionPreview: "Hidden",
              pubDate: "2024-01-02",
              enclosureUrl: "https://example.com/ep2.mp3",
              duration: "1800",
              image: "",
              guid: "ep-hidden",
            },
          ],
        },
      ],
    ]);

    mockUseLiveQuery
      .mockReturnValueOnce(new Set(["ep-hidden"])) // hiddenEpisodes
      .mockReturnValueOnce(playStatuses);

    mockUseQuery.mockReturnValue({
      data: feedData,
      isLoading: false,
    });

    render(<InProgress onBack={onBack} />);

    expect(screen.getByText("Visible Episode")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Episode")).not.toBeInTheDocument();
  });

  it("shows progress bar with correct percentage", () => {
    const playStatuses = [
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        position: 900, // 15 min
        duration: 3600, // 60 min = 25%
        completed: false,
        updatedAt: Date.now(),
      },
    ];

    const feedData = new Map([
      [
        "https://example.com/feed.xml",
        {
          title: "Test Podcast",
          description: "",
          image: "",
          url: "https://example.com/feed.xml",
          items: [
            {
              title: "Episode One",
              description: "",
              descriptionPreview: "",
              pubDate: "2024-01-01",
              enclosureUrl: "https://example.com/ep1.mp3",
              duration: "3600",
              image: "",
              guid: "ep-1",
            },
          ],
        },
      ],
    ]);

    mockUseLiveQuery
      .mockReturnValueOnce(new Set())
      .mockReturnValueOnce(playStatuses);

    mockUseQuery.mockReturnValue({
      data: feedData,
      isLoading: false,
    });

    render(<InProgress onBack={onBack} />);

    // Should display time: 15:00 / 1:00:00
    expect(screen.getByText("15:00")).toBeInTheDocument();
  });
});
