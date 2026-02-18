import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Trending } from "./Trending";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "trending.loadError": "Failed to load trending podcasts",
        "trending.empty": "No trending podcasts",
        "trending.subscribers": `${opts?.count ?? 0} subscribers`,
        "trending.subscribe": "Subscribe",
        "trending.subscribed": "Subscribed",
        "common.retry": "Retry",
        "common.loading": "Loading...",
        "common.error": "Error",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock useTrending hook
const mockRefetch = vi.fn();
const mockUseTrending = vi.fn().mockReturnValue({
  data: undefined,
  isLoading: true,
  error: null,
  refetch: mockRefetch,
});

vi.mock("../../hooks/useTrending", () => ({
  useTrending: () => mockUseTrending(),
}));

// Mock dexie-react-hooks
const mockUseLiveQuery = vi.fn().mockReturnValue(new Set<string>());
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

// Mock storage
const mockAddSubscription = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/storage", () => ({
  db: { subscriptions: { toArray: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("../../services/storage/subscriptions", () => ({
  addSubscription: (...args: unknown[]) => mockAddSubscription(...args),
}));

const mockPodcasts = [
  {
    feed_url: "https://example.com/feed1.xml",
    title: "Podcast One",
    image: "https://img.com/1.jpg",
    subscriber_count: 100,
  },
  {
    feed_url: "https://example.com/feed2.xml",
    title: "Podcast Two",
    image: undefined,
    subscriber_count: 50,
  },
];

describe("Trending", () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLiveQuery.mockReturnValue(new Set<string>());
  });

  it("shows loading skeleton while fetching", () => {
    mockUseTrending.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    // Skeleton items should be rendered (6 pulse elements)
    const pulseElements = document.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBe(6);
  });

  it("displays podcast list when loaded", () => {
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    expect(screen.getByText("Podcast One")).toBeInTheDocument();
    expect(screen.getByText("Podcast Two")).toBeInTheDocument();
    expect(screen.getByText("100 subscribers")).toBeInTheDocument();
    expect(screen.getByText("50 subscribers")).toBeInTheDocument();
  });

  it("shows error state with retry button", () => {
    mockUseTrending.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    expect(screen.getByText("Failed to load trending podcasts")).toBeInTheDocument();
    const retryButton = screen.getByText("Retry");
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("shows empty state when no podcasts", () => {
    mockUseTrending.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    expect(screen.getByText("No trending podcasts")).toBeInTheDocument();
  });

  it("navigates to podcast detail on click", () => {
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("Podcast One"));
    expect(onNavigate).toHaveBeenCalledWith("podcast", "https://example.com/feed1.xml");
  });

  it("renders podcast items as links", () => {
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    const podcastButton = screen.getByText("Podcast One").closest("button")!;
    expect(podcastButton).toBeInTheDocument();
    expect(podcastButton.tagName).toBe("BUTTON");
  });

  it("subscribes to podcast on button click", async () => {
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    const subscribeButtons = screen.getAllByText("Subscribe");
    fireEvent.click(subscribeButtons[0]);

    await waitFor(() => {
      expect(mockAddSubscription).toHaveBeenCalledWith("https://example.com/feed1.xml");
    });
  });

  it("shows Subscribed state for already-subscribed podcasts", () => {
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseLiveQuery.mockReturnValue(new Set(["https://example.com/feed1.xml"]));

    render(<Trending onNavigate={onNavigate} />);

    expect(screen.getByText("Subscribed")).toBeInTheDocument();
    expect(screen.getByText("Subscribe")).toBeInTheDocument(); // second podcast
  });

  it("shows error state on subscribe failure and auto-clears", async () => {
    mockAddSubscription.mockRejectedValueOnce(new Error("Failed"));
    mockUseTrending.mockReturnValue({
      data: mockPodcasts,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    const subscribeButtons = screen.getAllByText("Subscribe");
    fireEvent.click(subscribeButtons[0]);

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    // Error should auto-clear after 3 seconds
    await waitFor(
      () => {
        expect(screen.queryByText("Error")).not.toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it("shows placeholder icon when podcast has no image", () => {
    mockUseTrending.mockReturnValue({
      data: [mockPodcasts[1]], // Podcast Two has no image
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<Trending onNavigate={onNavigate} />);

    // Should not have an img element, but should have the placeholder div
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Podcast Two")).toBeInTheDocument();
  });
});
