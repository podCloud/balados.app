import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Episode } from "../types";
import {
  getPlayStatus,
  savePlayStatus,
} from "../services/storage/playStatus";
import { getCachedAudioUrl } from "../services/storage/downloads";
import { logEvent } from "../services/storage/events";
import { PlayerContext } from "./playerContext";

interface PlayerState {
  currentEpisode: Episode | null;
  feedUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
}

interface PlayerProviderProps {
  children: ReactNode;
}

export const PlayerProvider = ({ children }: PlayerProviderProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    currentEpisode: null,
    feedUrl: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
  });
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Save position periodically and on pause
  const savePosition = useCallback(async () => {
    if (!state.currentEpisode || !state.feedUrl || !audioRef.current) return;

    const episodeId = state.currentEpisode.guid || state.currentEpisode.enclosureUrl;
    await savePlayStatus({
      episodeId,
      feedUrl: state.feedUrl,
      position: audioRef.current.currentTime,
      duration: audioRef.current.duration || 0,
      completed: audioRef.current.currentTime >= (audioRef.current.duration - 30),
    });
  }, [state.currentEpisode, state.feedUrl]);

  // Restore position when loading an episode
  const restorePosition = useCallback(async (episode: Episode) => {
    const episodeId = episode.guid || episode.enclosureUrl;
    const status = await getPlayStatus(episodeId);
    if (status && !status.completed && audioRef.current) {
      audioRef.current.currentTime = status.position;
    }
  }, []);

  const play = useCallback(async (episode: Episode, feedUrl: string) => {
    if (!audioRef.current) return;

    // Save current position before switching
    await savePosition();

    // Log play_started event for stats (best-effort, don't block playback)
    const episodeId = episode.guid || episode.enclosureUrl;
    logEvent("play_started", { feedUrl, episodeId }).catch((err) =>
      console.error("Failed to log play event:", err)
    );

    // Revoke previous blob URL to prevent memory leak
    const prevSrc = audioRef.current.src;
    if (prevSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(prevSrc);
    }

    setState((prev) => ({
      ...prev,
      currentEpisode: episode,
      feedUrl,
      isLoading: true,
      isPlaying: false,
    }));

    // Check if episode is cached for offline playback
    const cachedUrl = await getCachedAudioUrl(episode.enclosureUrl);
    audioRef.current.src = cachedUrl || episode.enclosureUrl;
    audioRef.current.load();

    // Restore position after loading
    audioRef.current.onloadedmetadata = async () => {
      await restorePosition(episode);
      audioRef.current?.play();
    };

    // Clean up blob URL when switching episodes
    if (cachedUrl) {
      const currentCachedUrl = cachedUrl;
      audioRef.current.onended = () => {
        URL.revokeObjectURL(currentCachedUrl);
      };
    }
  }, [savePosition, restorePosition]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    savePosition();
  }, [savePosition]);

  const resume = useCallback(() => {
    audioRef.current?.play();
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const skipForward = useCallback((seconds = 30) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.currentTime + seconds,
        audioRef.current.duration
      );
    }
  }, []);

  const skipBackward = useCallback((seconds = 15) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(
        audioRef.current.currentTime - seconds,
        0
      );
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      setPlaybackRateState(rate);
    }
  }, []);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setState((prev) => ({ ...prev, isPlaying: true, isLoading: false }));
    const handlePause = () => {
      setState((prev) => {
        // Capture from prev to avoid stale closure
        const { currentEpisode, feedUrl } = prev;

        // Log pause event (fire-and-forget with error handling)
        if (currentEpisode && feedUrl) {
          const episodeId = currentEpisode.guid || currentEpisode.enclosureUrl;
          logEvent("play_paused", { feedUrl, episodeId }).catch((err) =>
            console.error("Failed to log pause event:", err)
          );
        }

        return { ...prev, isPlaying: false };
      });
    };
    const handleTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    };
    const handleDurationChange = () => {
      setState((prev) => ({ ...prev, duration: audio.duration || 0 }));
    };
    const handleLoadStart = () => setState((prev) => ({ ...prev, isLoading: true }));
    const handleCanPlay = () => setState((prev) => ({ ...prev, isLoading: false }));
    const handleEnded = () => {
      setState((prev) => {
        // Capture from prev to avoid stale closure
        const { currentEpisode, feedUrl } = prev;

        // Log completed event (fire-and-forget with error handling)
        if (currentEpisode && feedUrl) {
          const episodeId = currentEpisode.guid || currentEpisode.enclosureUrl;
          logEvent("play_completed", { feedUrl, episodeId }).catch((err) =>
            console.error("Failed to log completed event:", err)
          );
        }

        return { ...prev, isPlaying: false };
      });
      savePosition();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [savePosition]);

  // Save position every 10 seconds while playing
  useEffect(() => {
    if (!state.isPlaying) return;

    const interval = setInterval(savePosition, 10000);
    return () => clearInterval(interval);
  }, [state.isPlaying, savePosition]);

  // Save position on unmount/page leave
  useEffect(() => {
    const handleBeforeUnload = () => savePosition();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      savePosition();
    };
  }, [savePosition]);

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        play,
        pause,
        resume,
        seek,
        skipForward,
        skipBackward,
        setPlaybackRate,
        playbackRate,
        audioRef,
      }}
    >
      <audio ref={audioRef} preload="metadata" />
      {children}
    </PlayerContext.Provider>
  );
};
