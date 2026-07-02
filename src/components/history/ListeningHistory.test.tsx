import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: new Map(), isLoading: false }),
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
        "settings.back": "Back",
        "common.loading": "Loading",
      };
      return translations[key] ?? `${key}${opts?.count !== undefined ? `:${opts.count}` : ""}`;
    },
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
});
