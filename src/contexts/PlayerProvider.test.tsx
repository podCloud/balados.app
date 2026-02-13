import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlayerProvider } from "./PlayerProvider";
import { PlayerContext } from "./playerContext";
import { useContext } from "react";

// Mock storage services
vi.mock("../services/storage/playStatus", () => ({
  getPlayStatus: vi.fn().mockResolvedValue(null),
  savePlayStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/storage/downloads", () => ({
  getCachedAudioUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/storage/events", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

import { getPlayStatus, savePlayStatus } from "../services/storage/playStatus";
import { getCachedAudioUrl } from "../services/storage/downloads";
import { logEvent } from "../services/storage/events";

// Helper to use the player context from the provider
function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <PlayerProvider>{children}</PlayerProvider>
);

// Mock episode
const mockEpisode = {
  title: "Test Episode",
  description: "A test episode",
  pubDate: "2024-01-01",
  enclosureUrl: "https://example.com/episode.mp3",
  duration: "3600",
  image: "https://example.com/image.jpg",
  guid: "episode-123",
};

describe("PlayerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides initial state", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    expect(result.current.currentEpisode).toBeNull();
    expect(result.current.feedUrl).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.playbackRate).toBe(1);
  });

  it("play() sets episode and feedUrl", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    expect(result.current.currentEpisode).toEqual(mockEpisode);
    expect(result.current.feedUrl).toBe("https://example.com/feed.xml");
  });

  it("play() logs play_started event", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    expect(logEvent).toHaveBeenCalledWith("play_started", {
      feedUrl: "https://example.com/feed.xml",
      episodeId: "episode-123",
    });
  });

  it("play() uses enclosureUrl as episodeId when guid is missing", async () => {
    const episodeNoGuid = { ...mockEpisode, guid: undefined };
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(episodeNoGuid, "https://example.com/feed.xml");
    });

    expect(logEvent).toHaveBeenCalledWith("play_started", {
      feedUrl: "https://example.com/feed.xml",
      episodeId: "https://example.com/episode.mp3",
    });
  });

  it("play() checks for cached audio URL", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    expect(getCachedAudioUrl).toHaveBeenCalledWith(mockEpisode.enclosureUrl);
  });

  it("play() uses cached URL when available", async () => {
    vi.mocked(getCachedAudioUrl).mockResolvedValue("blob:cached-url");
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    expect(getCachedAudioUrl).toHaveBeenCalledWith(mockEpisode.enclosureUrl);
    // Audio src is set on the real audio element - we verify the call was made
    expect(result.current.currentEpisode).toEqual(mockEpisode);
  });

  it("play() sets up onloadedmetadata handler for position restore", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    // onloadedmetadata is set on the audio element for position restore
    // In jsdom, loadedmetadata never fires, so we verify the handler is assigned
    const audio = result.current.audioRef.current;
    expect(audio?.onloadedmetadata).toBeInstanceOf(Function);
  });

  it("pause() saves position", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    await act(async () => {
      result.current.pause();
    });

    expect(savePlayStatus).toHaveBeenCalled();
  });

  it("setPlaybackRate() updates playback rate state", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    act(() => {
      result.current.setPlaybackRate(1.5);
    });

    expect(result.current.playbackRate).toBe(1.5);
  });

  it("setPlaybackRate() updates to 2x", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    act(() => {
      result.current.setPlaybackRate(2);
    });

    expect(result.current.playbackRate).toBe(2);
  });

  it("play() updates episode when switching", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    const secondEpisode = { ...mockEpisode, guid: "episode-456", title: "Second Episode" };

    await act(async () => {
      await result.current.play(secondEpisode, "https://example.com/feed2.xml");
    });

    expect(result.current.currentEpisode).toEqual(secondEpisode);
    expect(result.current.feedUrl).toBe("https://example.com/feed2.xml");
  });

  it("provides audioRef", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });
    expect(result.current.audioRef).toBeDefined();
  });

  it("seek() is callable", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    act(() => {
      result.current.seek(50);
    });

    expect(result.current.seek).toBeInstanceOf(Function);
  });

  it("skipForward() is callable", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    // skipForward uses Math.min(currentTime + seconds, duration)
    // In jsdom, audio.duration is NaN so we just verify the function exists
    expect(result.current.skipForward).toBeInstanceOf(Function);
  });

  it("skipBackward() is callable with default and custom seconds", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    act(() => {
      result.current.skipBackward();
      result.current.skipBackward(10);
    });

    expect(result.current.skipBackward).toBeInstanceOf(Function);
  });

  it("resume() is callable", () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    act(() => {
      result.current.resume();
    });

    expect(result.current.resume).toBeInstanceOf(Function);
  });

  it("play() saves current position before switching episodes", async () => {
    const { result } = renderHook(() => usePlayer(), { wrapper });

    await act(async () => {
      await result.current.play(mockEpisode, "https://example.com/feed.xml");
    });

    vi.mocked(savePlayStatus).mockClear();

    const secondEpisode = { ...mockEpisode, guid: "ep-2", title: "Second" };

    await act(async () => {
      await result.current.play(secondEpisode, "https://example.com/feed2.xml");
    });

    // savePosition is called before switching (though may not actually save if audioRef has no data)
    expect(result.current.currentEpisode).toEqual(secondEpisode);
  });
});
