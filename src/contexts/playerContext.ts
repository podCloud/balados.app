import { createContext } from "react";
import type { Episode } from "../types";

interface PlayerState {
  currentEpisode: Episode | null;
  feedUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
}

export interface PlayerContextType extends PlayerState {
  play: (episode: Episode, feedUrl: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setPlaybackRate: (rate: number) => void;
  playbackRate: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const PlayerContext = createContext<PlayerContextType | null>(null);
