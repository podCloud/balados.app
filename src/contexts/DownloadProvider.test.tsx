import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useContext, type ReactNode } from "react";
import { DownloadProvider } from "./DownloadProvider";
import { DownloadContext } from "./downloadContext";

// Mock download services
const mockDownloadEpisode = vi.fn().mockResolvedValue(undefined);
const mockDeleteDownload = vi.fn().mockResolvedValue(undefined);
const mockGetAllDownloads = vi.fn().mockResolvedValue([]);
const mockClearAllDownloads = vi.fn().mockResolvedValue(undefined);
const mockGetEpisodeId = vi.fn((ep) => ep.guid || ep.enclosureUrl);

vi.mock("../services/storage/downloads", () => ({
  downloadEpisode: (...args: unknown[]) => mockDownloadEpisode(...args),
  deleteDownload: (...args: unknown[]) => mockDeleteDownload(...args),
  getAllDownloads: () => mockGetAllDownloads(),
  clearAllDownloads: () => mockClearAllDownloads(),
  getEpisodeId: (ep: unknown) => mockGetEpisodeId(ep),
}));

function useDownloads() {
  const ctx = useContext(DownloadContext);
  if (!ctx)
    throw new Error("useDownloads must be used within DownloadProvider");
  return ctx;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <DownloadProvider>{children}</DownloadProvider>
);

const mockEpisode = {
  title: "Test Episode",
  description: "A test",
  descriptionPreview: "A test",
  pubDate: "2024-01-01",
  enclosureUrl: "https://example.com/ep.mp3",
  duration: "1800",
  image: "",
  guid: "ep-1",
};

describe("DownloadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDownloads.mockResolvedValue([]);
    mockDownloadEpisode.mockResolvedValue(undefined);
    mockDeleteDownload.mockResolvedValue(undefined);
    mockClearAllDownloads.mockResolvedValue(undefined);
  });

  it("provides initial empty state", () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    expect(result.current.downloads.size).toBe(0);
    expect(result.current.progress.size).toBe(0);
  });

  it("loads existing downloads on mount", async () => {
    mockGetAllDownloads.mockResolvedValue([
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        enclosureUrl: "https://example.com/ep.mp3",
        title: "Test",
        fileSize: 1000,
        downloadedAt: Date.now(),
      },
    ]);

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads.size).toBe(1);
    });

    expect(result.current.isDownloaded("ep-1")).toBe(true);
    expect(result.current.isDownloaded("ep-2")).toBe(false);
  });

  it("isDownloading() returns false when not downloading", () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    expect(result.current.isDownloading("ep-1")).toBe(false);
  });

  it("getProgress() returns undefined when no progress", () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    expect(result.current.getProgress("ep-1")).toBeUndefined();
  });

  it("download() calls the download service", async () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.download(mockEpisode, "https://example.com/feed.xml");
    });

    expect(mockDownloadEpisode).toHaveBeenCalledWith(
      mockEpisode,
      "https://example.com/feed.xml",
      expect.any(Function)
    );
  });

  it("download() tracks progress via callback", async () => {
    mockDownloadEpisode.mockImplementation(
      async (_ep: unknown, _url: string, onProgress: (p: number) => void) => {
        onProgress(50);
      }
    );

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.download(mockEpisode, "https://example.com/feed.xml");
    });

    expect(mockDownloadEpisode).toHaveBeenCalledTimes(1);
  });

  it("download() sets error progress on failure", async () => {
    mockDownloadEpisode.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await act(async () => {
      await result.current.download(mockEpisode, "https://example.com/feed.xml");
    });

    const progress = result.current.getProgress("ep-1");
    expect(progress?.status).toBe("error");
    expect(progress?.error).toBe("Network error");
  });

  it("deleteDownload() removes from state and calls service", async () => {
    mockGetAllDownloads.mockResolvedValue([
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        enclosureUrl: "https://example.com/ep.mp3",
        title: "Test",
        fileSize: 1000,
        downloadedAt: Date.now(),
      },
    ]);

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads.size).toBe(1);
    });

    await act(async () => {
      await result.current.deleteDownload("ep-1");
    });

    expect(mockDeleteDownload).toHaveBeenCalledWith("ep-1");
    expect(result.current.downloads.size).toBe(0);
    expect(result.current.isDownloaded("ep-1")).toBe(false);
  });

  it("clearAllDownloads() removes all downloads", async () => {
    mockGetAllDownloads.mockResolvedValue([
      {
        episodeId: "ep-1",
        feedUrl: "https://example.com/feed.xml",
        enclosureUrl: "https://example.com/ep.mp3",
        title: "Test 1",
        fileSize: 1000,
        downloadedAt: Date.now(),
      },
      {
        episodeId: "ep-2",
        feedUrl: "https://example.com/feed.xml",
        enclosureUrl: "https://example.com/ep2.mp3",
        title: "Test 2",
        fileSize: 2000,
        downloadedAt: Date.now(),
      },
    ]);

    const { result } = renderHook(() => useDownloads(), { wrapper });

    await waitFor(() => {
      expect(result.current.downloads.size).toBe(2);
    });

    await act(async () => {
      await result.current.clearAllDownloads();
    });

    expect(mockClearAllDownloads).toHaveBeenCalled();
    expect(result.current.downloads.size).toBe(0);
  });

  it("refresh() reloads downloads from storage", async () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    // Wait for initial load
    await waitFor(() => {
      expect(mockGetAllDownloads).toHaveBeenCalled();
    });

    expect(result.current.downloads.size).toBe(0);

    // Update mock and refresh
    mockGetAllDownloads.mockResolvedValue([
      {
        episodeId: "ep-new",
        feedUrl: "https://example.com/feed.xml",
        enclosureUrl: "https://example.com/ep-new.mp3",
        title: "New episode",
        fileSize: 3000,
        downloadedAt: Date.now(),
      },
    ]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.downloads.size).toBe(1);
    expect(result.current.isDownloaded("ep-new")).toBe(true);
  });
});
